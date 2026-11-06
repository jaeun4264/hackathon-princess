import { z } from "zod";
import { createHash } from "node:crypto";
import { loadCatalog, validateCatalog } from "../../catalog";
import { SubscriptionSchema, UserProfileSchema } from "../../schemas";
import type { Catalog, CatalogBenefit, Subscription, UserProfile } from "../../types";
import type { LlmClient } from "../../llm/types";
import { assertServer } from "../../llm/server";
import { judgeBenefit } from "../../llm/benefits";
import { buildRecommendationMessages } from "../../llm/message";
import { checkedSubscriptions } from "../../rules/summary";
import { isStale } from "../../rules/stale";
import { createBenefitDiscovery } from "./engine";
import { createSecurePageFetcher, officialUrl } from "./network";
import { createBraveSearchProvider } from "./brave";
import type { SearchAvailability } from "./brave";
import type { BenefitCandidate, DiscoveryReport, OfficialPageFetcher, OfficialSource, SearchProvider } from "./types";

export const DISCOVERY_CACHE_MS = 6 * 60 * 60 * 1000;
const InputSchema = z.strictObject({ confirmed_service_ids: z.array(z.string().min(1)).max(20), country: z.string().regex(/^[A-Z]{2}$/u), refresh: z.boolean().optional() });
type SnapshotRecord = { benefit: CatalogBenefit | null; candidate: BenefitCandidate };
export interface LiveServiceResult {
  service_id: string; country: string; source: "fresh" | "cache" | "fallback" | "none";
  status: DiscoveryReport["status"] | "unavailable"; report: DiscoveryReport | null;
  benefits: CatalogBenefit[]; verified_records: BenefitCandidate[]; last_attempt_at: string; error: string | null; refresh_failed: boolean; unverified_count: number;
}

export function createLiveDiscoveryService(options: { catalog: Catalog; sources: OfficialSource[]; search: SearchProvider;
  pages: OfficialPageFetcher; now?: () => number; availability?: () => SearchAvailability; llm?: LlmClient }) {
  assertServer();
  const catalog = validateCatalog(options.catalog).catalog, sources = structuredClone(options.sources);
  const now = options.now ?? Date.now;
  // 기본값은 유료 AI를 호출하지 않아요. 실제 모델 연결은 별도 승인 후 명시적으로 주입해요.
  const llm = options.llm ?? { callJson: async () => null };
  const states = new Map<string, { value: LiveServiceResult; until: number; ready: boolean; snapshot: SnapshotRecord[] }>();
  const pending = new Map<string, Promise<LiveServiceResult>>();
  function active(records: SnapshotRecord[], country: string, today: string): SnapshotRecord[] {
    return records.filter(({ candidate }) => {
      try {
        const source = sources.find((entry) => entry.service_id === candidate.service_id);
        if (!source || !candidate.checked_at || !candidate.source_updated_at || isStale(candidate.checked_at, today) ||
          isStale(candidate.source_updated_at, today) || candidate.country !== country || (candidate.valid_until !== null && candidate.valid_until < today)) return false;
        officialUrl(candidate.source_url, source.hosts); return true;
      } catch { return false; }
    });
  }
  async function one(id: string, country: string, refresh: boolean): Promise<LiveServiceResult> {
    const timestamp = now(), today = new Date(timestamp).toISOString().slice(0, 10);
    const key = createHash("sha256").update(JSON.stringify([id, country, sources])).digest("hex");
    const availability = options.availability?.() ?? { ready: true };
    const previous = states.get(key);
    if (!refresh && previous && previous.ready === availability.ready && previous.until > timestamp && previous.value.last_attempt_at.slice(0, 10) === today) {
      return structuredClone({ ...previous.value, source: previous.value.source === "fresh" ? "cache" : previous.value.source });
    }
    const running = pending.get(key); if (running) return structuredClone(await running);
    if (pending.size >= 32) throw new Error("discovery_capacity");
    const task = (async () => {
      let report: DiscoveryReport | null = null, fresh: SnapshotRecord[] = [], failed = false, code: string | null = null;
      if (!availability.ready) { failed = true; code = availability.code ?? "not_configured"; }
      else {
        try {
          const engine = createBenefitDiscovery({ catalog, sources, search: options.search, pages: options.pages });
          report = await engine.discover({ confirmed_service_ids: [id], country, today });
          const discovered = engine.toVerifiedCatalog(report, today).benefits.filter((benefit) => benefit.service_id === id && !catalog.benefits.some((entry) => entry.id === benefit.id));
          fresh = report.verified.flatMap((candidate) => {
            const benefit = discovered.find((entry) => entry.benefit_text === candidate.name && entry.kind === candidate.kind && entry.school === candidate.school && entry.source_url === candidate.source_url);
            return benefit || candidate.kind === "plan_discount" ? [{ benefit: benefit ?? null, candidate }] : [];
          });
          // 원문이 바뀌어 검증되지 않는 경우에는 예전 혜택으로 대체하지 않아요.
          failed = report.status === "search_failed" || (!fresh.length && report.errors.some((error) => error.code === "page_failed") && report.candidates.every((entry) => entry.issues.every((issue) => issue === "page_failed")));
          if (failed) code = "refresh_failed";
        } catch { failed = true; code = "refresh_failed"; }
      }
      const snapshot = failed ? previous?.snapshot ?? [] : structuredClone(fresh);
      const records = active(failed ? snapshot : fresh, country, today);
      const value: LiveServiceResult = { service_id: id, country, source: failed ? (records.length ? "fallback" : "none") : "fresh",
        status: report?.status ?? "unavailable", report: structuredClone(report), benefits: records.flatMap((record) => record.benefit ? [structuredClone(record.benefit)] : []),
        verified_records: records.map((record) => structuredClone(record.candidate)),
        last_attempt_at: new Date(timestamp).toISOString(), error: code, refresh_failed: failed,
        unverified_count: report?.candidates.filter((candidate) => candidate.status === "unverified").length ?? 0 };
      if (states.size >= 128 && !states.has(key)) states.delete(states.keys().next().value!);
      // 검색에서만 얻은 URL·미검증 후보는 캐시에 남기지 않고 공식 원문 검증 레코드만 보관해요.
      states.set(key, { value: { ...structuredClone(value), report: null }, until: timestamp + (failed ? 30000 : records.length ? DISCOVERY_CACHE_MS : 60000), ready: availability.ready, snapshot: structuredClone(snapshot) });
      return value;
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return structuredClone(await task);
  }
  async function discover(raw: z.infer<typeof InputSchema>) {
    assertServer(); const input = InputSchema.parse(raw);
    const ids = [...new Set(input.confirmed_service_ids)];
    if (ids.some((id) => !catalog.services.some((service) => service.id === id))) throw new Error("unknown_service");
    const results: LiveServiceResult[] = [];
    for (const id of ids) results.push(await one(id, input.country, input.refresh ?? false));
    const merged = new Map(catalog.benefits.map((benefit) => [benefit.id, benefit]));
    for (const result of results) for (const benefit of result.benefits) merged.set(benefit.id, benefit);
    return { services: results, catalog: validateCatalog({ ...catalog, benefits: [...merged.values()] }).catalog };
  }
  return { discover, async recommend(input: { subs: Subscription[]; user: UserProfile; country: string; refresh?: boolean }) {
    assertServer();
    const subs = checkedSubscriptions(SubscriptionSchema.array().parse(input.subs)), user = UserProfileSchema.parse(input.user);
    const ids = [...new Set(subs.filter((sub) => sub.service_id && !sub.needs_check && (sub.interpret_source === "catalog" || sub.user_confirmed) &&
      catalog.services.some((service) => service.id === sub.service_id)).map((sub) => sub.service_id!))];
    const result = await discover({ confirmed_service_ids: ids, country: input.country, refresh: input.refresh });
    const today = new Date(now()).toISOString().slice(0, 10);
    const fallbackIds = new Set(result.services.filter((service) => service.refresh_failed).flatMap((service) => service.benefits.map((benefit) => benefit.id)));
    const benefitResults = [];
    for (const benefit of result.catalog.benefits.filter((entry) => ids.includes(entry.service_id))) {
      const judged = await judgeBenefit({ kind: "benefit", item: benefit }, user, llm, today);
      benefitResults.push({ ...judged, stale: judged.stale || fallbackIds.has(benefit.id) });
    }
    const suggestions = await buildRecommendationMessages({ subs, catalog: result.catalog, benefitResults, today }, llm);
    return { ...result, benefitResults, suggestions };
  } };
}

export function createConfiguredLiveDiscovery(options: { sources: OfficialSource[]; catalog?: Catalog; environment?: () => { [key: string]: string | undefined };
  fetch?: typeof fetch; pages?: OfficialPageFetcher; now?: () => number; llm?: LlmClient }) {
  assertServer();
  const catalog = options.catalog ?? loadCatalog(), now = options.now ?? Date.now;
  const search = createBraveSearchProvider({ serviceNames: catalog.services.map((service) => service.name), environment: options.environment, fetch: options.fetch, now });
  return createLiveDiscoveryService({ catalog, sources: options.sources, search, pages: options.pages ?? createSecurePageFetcher({ now: () => new Date(now()) }),
    now, availability: search.availability, llm: options.llm });
}
