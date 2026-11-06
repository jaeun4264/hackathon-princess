import { createHash } from "node:crypto";
import type { BenefitCandidate, PageEvidence } from "./types";

export const normalizeEvidence = (text: string) => text.replace(/\s+/gu, " ").trim();
function entities(text: string): string {
  return text.replace(/&(?:#(x[0-9a-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp));/giu, (original, numeric: string, named: string) => {
    if (numeric) { const code = numeric[0].toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : Number(numeric); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original; }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[named.toLowerCase()] ?? original;
  });
}
// JSON-LD와 비본문 영역은 근거 원문에서 제거해요. 실제 브라우저 가시성 검사와는 달라요.
export function pageText(html: string): string {
  return normalizeEvidence(entities(html.replace(/<!--[\s\S]*?-->/gu, " ").replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ").replace(/<[^>]*>/gu, " ")));
}
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function emptyCandidate(serviceId: string, url: string, issue: string): BenefitCandidate {
  return { id: createHash("sha256").update(`${serviceId}|${url}|${issue}`).digest("hex"), service_id: serviceId,
    service_name: null, name: null, kind: null, price: null, currency: null, country: null, interval: null, school: null,
    tax_included: null, conditions: null, source_url: url, source_updated_at: null, valid_until: null, observed_at: null, checked_at: null, page_hash: null,
    quotes: { service: "", name: "", price: "", country: "", conditions: "", updated: "", school: "" }, status: "unverified", issues: [issue] };
}
export function extractBenefits(page: PageEvidence, serviceId: string): BenefitCandidate[] {
  const candidates: BenefitCandidate[] = [];
  for (const match of page.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu)) {
    let data: unknown; try { data = JSON.parse(match[1]); } catch { continue; }
    const root = object(data);
    const nodes = Array.isArray(data) ? data : Array.isArray(root["@graph"]) ? root["@graph"] : [data];
    for (const node of nodes.slice(0, 20)) {
      const product = object(node);
      if (product["@type"] !== "Product" && product["@type"] !== "Service") continue;
      const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
      for (const rawOffer of offers.slice(0, 20)) {
        const offer = object(rawOffer), spec = object(offer.priceSpecification);
        const category = text(product.category);
        const kind = category === "student_discount" || category === "school_license" || category === "plan_discount" ? category : null;
        const rawPrice = offer.price;
        const price = typeof rawPrice === "number" ? rawPrice : typeof rawPrice === "string" && /^\d+$/u.test(rawPrice) ? Number(rawPrice) : null;
        const candidate = emptyCandidate(serviceId, page.final_url, "");
        Object.assign(candidate, { service_name: text(object(product.brand).name), name: text(product.name), kind,
          price: price !== null && Number.isSafeInteger(price) && price >= 0 ? price : null,
          currency: text(offer.priceCurrency), country: text(offer.eligibleRegion), interval: spec.unitCode === "MON" ? "monthly" : spec.unitCode === "ANN" ? "yearly" : null,
          tax_included: typeof spec.valueAddedTaxIncluded === "boolean" ? spec.valueAddedTaxIncluded : null,
          school: text(object(product.audience).name), conditions: text(product.description), source_updated_at: text(product.dateModified),
          valid_until: text(offer.priceValidUntil), observed_at: page.fetched_at, page_hash: createHash("sha256").update(page.html).digest("hex"), issues: [] });
        candidate.quotes = { service: candidate.service_name ?? "", name: candidate.name ?? "", price: text(spec.description) ?? "",
          country: candidate.country ?? "", conditions: candidate.conditions ?? "", updated: candidate.source_updated_at ?? "", school: candidate.school ?? "" };
        candidate.id = createHash("sha256").update(JSON.stringify([serviceId, page.final_url, product, offer])).digest("hex");
        candidates.push(candidate);
      }
    }
  }
  return candidates.length ? candidates.slice(0, 50) : [emptyCandidate(serviceId, page.final_url, "unsupported_page")];
}
