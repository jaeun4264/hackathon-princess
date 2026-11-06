import type { OfficialSource, PageEvidence } from "../../lib/adapters/benefit-discovery/types";
import type { PageResponse, PageTransport } from "../../lib/adapters/benefit-discovery/network";

export const DISCOVERY_TODAY = "2026-11-06";
export const MOCK_OFFICIAL_URL = "https://official.example.invalid/student";
export const mockSource: OfficialSource = { service_id: "netflix", hosts: ["official.example.invalid"],
  verified_at: DISCOVERY_TODAY, evidence_url: "https://official.example.invalid/about" };
export function mockProduct() {
  return { "@context": "https://schema.org", "@type": "Product", name: "[MOCK] 가상 학생 요금", brand: { name: "넷플릭스" }, category: "student_discount",
    description: "[MOCK] 재학생만 이용할 수 있는 가상 조건이에요.", dateModified: DISCOVERY_TODAY,
    offers: { "@type": "Offer", price: "1000", priceCurrency: "KRW", eligibleRegion: "KR", priceValidUntil: "2026-12-31",
      priceSpecification: { unitCode: "MON", description: "월 1,000 KRW VAT 포함", valueAddedTaxIncluded: true } } };
}
export function mockPage(product = mockProduct(), body?: string, url = MOCK_OFFICIAL_URL): PageEvidence {
  const words = [product.brand.name, product.name, product.description, product.dateModified, product.offers.eligibleRegion, product.offers.priceSpecification.description];
  return { requested_url: url, final_url: url, fetched_at: `${DISCOVERY_TODAY}T01:00:00.000Z`,
    html: `<html><body><main>${body ?? words.map((word) => `<p>${word}</p>`).join("")}</main><script type="application/ld+json">${JSON.stringify(product)}</script></body></html>` };
}
export function mockResponse(html: string, status = 200, headers: Record<string, string> = {}): PageResponse {
  return { status, headers: { "content-type": "text/html; charset=utf-8", ...headers },
    body: (async function* () { yield new TextEncoder().encode(html); })(), cancel() {} };
}
export const mockTransport: PageTransport = async () => mockResponse(mockPage().html);
