import { createHash } from "node:crypto";
import { z } from "zod";
import { validateCatalog } from "../../catalog";
import { CatalogBenefitSchema, TransactionSchema } from "../../schemas";
import type { CatalogBenefit } from "../../types";
import { MerchantResolutionSchema } from "../../llm/interpret-resolution";
import { monthlyEquivalent } from "../../rules/monthly";
import type { MerchantResolution } from "../../llm/interpret-resolution";
import { emptyCandidate, extractBenefits } from "./extract";
import { officialUrl } from "./network";
import { verifyBenefit } from "./verify";
import { publicBenefitQuery } from "./query";
import type { BenefitCandidate, DiscoveryOptions, DiscoveryReport, OfficialSource, PageEvidence } from "./types";

export const SEARCH_TIMEOUT_MS = 8000;
export function confirmedServiceIds(resolutions: MerchantResolution[]): string[] {
  return [...new Set(MerchantResolutionSchema.array().parse(resolutions).flatMap((entry) => entry.confirmed_service_id ? [entry.confirmed_service_id] : []))];
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const RequestSchema = z.strictObject({ confirmed_service_ids: z.array(z.string().min(1)).max(20), country: z.string().regex(/^[A-Z]{2}$/u), today: TransactionSchema.shape.date });

export function createBenefitDiscovery(options: DiscoveryOptions) {
  const catalog = validateCatalog(options.catalog).catalog;
  const sources = structuredClone(options.sources);
  // 같은 엔진이 발행한 결과만 투영해요. JSON 캐스팅으로 후보를 verified로 승격하지 못하게 해요.
  const proofs = new WeakMap<DiscoveryReport, { hash: string; records: { candidate: BenefitCandidate; page: PageEvidence; source: OfficialSource }[] }>();
  return {
    async discover(raw: z.infer<typeof RequestSchema>): Promise<DiscoveryReport> {
      const input = RequestSchema.parse(raw);
      const ids = [...new Set(input.confirmed_service_ids)];
      if (ids.some((id) => !catalog.services.some((service) => service.id === id))) throw new Error("unknown_service");
      const report: DiscoveryReport = { status: "no_results", country: input.country, candidates: [], verified: [], errors: [] };
      const records: { candidate: BenefitCandidate; page: PageEvidence; source: OfficialSource }[] = [];
      let successes = 0, failures = 0, unconfigured = 0, pagesRead = 0;
      for (const id of ids) {
        const policy = sources.filter((source) => source.service_id === id);
        if (policy.length !== 1 || !policy[0].hosts.length) { report.errors.push({ service_id: id, code: "official_source_unconfigured" }); unconfigured++; continue; }
        const source = policy[0], service = catalog.services.find((entry) => entry.id === id)!;
        let hits: Awaited<ReturnType<DiscoveryOptions["search"]["search"]>>;
        const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          hits = await Promise.race([options.search.search({ query: publicBenefitQuery(service.name), country: input.country,
            officialDomains: [...source.hosts], signal: controller.signal }), new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error("search_timeout")); }, SEARCH_TIMEOUT_MS);
          })]);
          hits = z.array(z.object({ url: z.string().max(2048) })).max(100).parse(hits); successes++;
        } catch { report.errors.push({ service_id: id, code: "search_failed" }); failures++; continue; }
        finally { clearTimeout(timer); controller.abort(); }
        const urls = new Set<string>();
        for (const hit of hits.slice(0, 10)) {
          let url: string;
          try { url = officialUrl(hit.url, source.hosts).href; }
          catch { report.candidates.push(emptyCandidate(id, hit.url, "untrusted_source")); continue; }
          if (urls.has(url)) continue; urls.add(url);
          if (pagesRead >= 20) { report.errors.push({ service_id: id, code: "page_budget_exhausted" }); break; }
          pagesRead++;
          try {
            const page = structuredClone(await options.pages.fetch(url, source.hosts));
            for (const extracted of extractBenefits(page, id).slice(0, 10)) {
              const candidate = verifyBenefit(extracted, page, source, catalog, input.country, input.today);
              report.candidates.push(candidate); records.push({ candidate: structuredClone(candidate), page, source });
            }
          } catch { report.errors.push({ service_id: id, code: "page_failed" }); report.candidates.push(emptyCandidate(id, url, "page_failed")); }
        }
      }
      // 같은 혜택의 서로 다른 가격·조건은 임의로 한 쪽을 고르지 않아요.
      const groups = new Map<string, BenefitCandidate[]>();
      for (const candidate of report.candidates) {
        const key = JSON.stringify([candidate.service_id, candidate.kind, candidate.name, candidate.country, candidate.school]);
        const group = groups.get(key) ?? []; group.push(candidate); groups.set(key, group);
      }
      const deduped: BenefitCandidate[] = [];
      for (const group of groups.values()) {
        const valid = group.filter((entry) => entry.price !== null && entry.conditions !== null && entry.kind !== null);
        if (new Set(valid.map((entry) => digest([entry.price, entry.interval, entry.conditions]))).size > 1) {
          for (const entry of group) { entry.status = "unverified"; entry.checked_at = null; entry.issues.push("conflicting_benefit"); }
        }
        const seen = new Set<string>();
        for (const candidate of group) {
          const key = digest([candidate.service_id, candidate.name, candidate.name === null ? candidate.source_url : null, candidate.kind, candidate.country, candidate.school, candidate.price, candidate.interval, candidate.conditions, candidate.status, candidate.issues]);
          if (!seen.has(key)) { seen.add(key); deduped.push(candidate); }
        }
      }
      report.candidates = deduped;
      report.verified = structuredClone(deduped.filter((entry) => entry.status === "verified"));
      report.status = unconfigured === ids.length && ids.length ? "unconfigured" : failures && !successes ? "search_failed" :
        failures || unconfigured || report.errors.length || deduped.some((entry) => entry.status === "unverified") ? "partial" : deduped.length ? "complete" : "no_results";
      proofs.set(report, { hash: digest(report), records });
      return report;
    },
    toVerifiedCatalog(report: DiscoveryReport, today: string) {
      TransactionSchema.shape.date.parse(today);
      const proof = proofs.get(report);
      if (!proof || proof.hash !== digest(report)) throw new Error("untrusted_report");
      const benefits: CatalogBenefit[] = [];
      for (const approved of report.verified) {
        const record = proof.records.find((entry) => entry.candidate.id === approved.id);
        if (!record || verifyBenefit(record.candidate, record.page, record.source, catalog, report.country, today).status !== "verified") continue;
        if (approved.kind === "plan_discount") continue; // B1에 없는 종류는 별도 검증 레코드로만 보관해요.
        benefits.push(CatalogBenefitSchema.parse({ id: `discovered_${digest([approved.service_id, approved.kind, approved.name, approved.school, approved.country]).slice(0, 24)}`,
          service_id: approved.service_id, kind: approved.kind, school: approved.school, conditions: approved.conditions,
          benefit_text: approved.name, price_after_monthly: monthlyEquivalent(approved.price!, approved.interval!),
          source_url: approved.source_url, checked_at: approved.checked_at }));
      }
      // 갱신 실패 때 과거 레코드를 새 확인일로 재발행하지 않아요. 영속 저장·폴백은 B8.5-B에서 연결해요.
      return validateCatalog({ ...catalog, benefits: [...catalog.benefits, ...benefits] }).catalog;
    },
  };
}
