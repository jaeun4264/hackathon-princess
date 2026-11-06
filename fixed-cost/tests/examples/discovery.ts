import { loadCatalog } from "../../lib/catalog";
import { createBenefitDiscovery, createSecurePageFetcher } from "../../lib/adapters/benefit-discovery";
import { DISCOVERY_TODAY, MOCK_OFFICIAL_URL, mockPage, mockProduct, mockResponse, mockSource } from "../mocks/discovery";

for (const scenario of ["verified", "missing-price", "wrong-country", "fake-summary", "search-failed"] as const) {
  const product = mockProduct();
  if (scenario === "missing-price") product.offers.price = "";
  if (scenario === "wrong-country") product.offers.eligibleRegion = "US";
  const page = mockPage(product);
  const pages = createSecurePageFetcher({ resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    transport: async () => mockResponse(scenario === "fake-summary" ? "<html><body>혜택 정보가 없어요</body></html>" : page.html), now: () => new Date(page.fetched_at) });
  const engine = createBenefitDiscovery({ catalog: loadCatalog(), sources: [mockSource], pages,
    search: { async search() { if (scenario === "search-failed") throw new Error("가상 검색 오류"); return [{ url: MOCK_OFFICIAL_URL, snippet: "가상 할인 0원" }]; } } });
  const input = { confirmed_service_ids: ["netflix"], country: "KR", today: DISCOVERY_TODAY };
  const report = await engine.discover(input);
  console.log(JSON.stringify({ scenario, input, status: report.status,
    candidates: report.candidates.map(({ name, price, status, issues, checked_at }) => ({ name, price, status, issues, checked_at })),
    verified_count: report.verified.length, catalog_benefits: engine.toVerifiedCatalog(report, DISCOVERY_TODAY).benefits, errors: report.errors }));
}
