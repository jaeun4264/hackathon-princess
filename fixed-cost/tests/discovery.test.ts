import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { request as nativeRequest } from "node:https";
import { loadCatalog } from "../lib/catalog";

// 실제 카탈로그 혜택과 섞이지 않도록 혜택이 빈 카탈로그로 검증해요
const discoveryCatalog = () => ({ ...loadCatalog(), benefits: [] });
import { createBenefitDiscovery, confirmedServiceIds, SEARCH_TIMEOUT_MS } from "../lib/adapters/benefit-discovery/engine";
import { createSecurePageFetcher, isPublicAddress, officialUrl, PAGE_MAX_BYTES, PAGE_TIMEOUT_MS } from "../lib/adapters/benefit-discovery/network";
import { extractBenefits } from "../lib/adapters/benefit-discovery/extract";
import { verifyBenefit } from "../lib/adapters/benefit-discovery/verify";
import { createBenefitsHandler } from "../lib/llm/benefits-api";
import { resolveInterpretItems } from "../lib/llm/interpret";
import { createLlmClient } from "../lib/llm/core";
import { buildSuggestions } from "../lib/rules";
import { mockConfirmedSubscription } from "./mocks/message";
import { mockDecision, mockUser } from "./mocks/benefits";
import { createMockProvider } from "./mocks/llm-provider";
import { DISCOVERY_TODAY, MOCK_OFFICIAL_URL, mockPage, mockProduct, mockResponse, mockSource, mockTransport } from "./mocks/discovery";

const input = { confirmed_service_ids: ["netflix"], country: "KR", today: DISCOVERY_TODAY };
vi.mock("node:https", () => ({ request: vi.fn(() => { throw new Error("실제 HTTPS 요청 금지"); }) }));
function setup(page = mockPage()) {
  const search = { search: vi.fn(async () => [{ url: MOCK_OFFICIAL_URL, snippet: "가상 허위 검색 요약 0원" }]) };
  const pages = createSecurePageFetcher({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport: async () => mockResponse(page.html), now: () => new Date(page.fetched_at) });
  return { search, pages, engine: createBenefitDiscovery({ catalog: discoveryCatalog(), sources: [mockSource], search, pages }) };
}
const network = vi.fn(() => { throw new Error("실제 네트워크 금지"); });
beforeEach(() => { network.mockClear(); vi.mocked(nativeRequest).mockClear(); vi.stubGlobal("fetch", network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); expect(nativeRequest).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("공식 원문과 가격·조건을 대조한 혜택만 verified와 B1 투영에 포함해요", async () => {
  const { engine, search } = setup(); const report = await engine.discover(input);
  expect(report.status).toBe("complete"); expect(report.verified).toHaveLength(1);
  expect(report.verified[0]).toMatchObject({ price: 1000, currency: "KRW", country: "KR", checked_at: DISCOVERY_TODAY, status: "verified", issues: [] });
  const catalog = engine.toVerifiedCatalog(report, DISCOVERY_TODAY);
  expect(catalog.benefits[0]).toMatchObject({ service_id: "netflix", kind: "student_discount", price_after_monthly: 1000, source_url: MOCK_OFFICIAL_URL });
  expect(search.search.mock.calls[0]).toHaveLength(1);
});
it.each([
  ["missing_price", (product: ReturnType<typeof mockProduct>) => { product.offers.price = ""; }],
  ["country_mismatch", (product: ReturnType<typeof mockProduct>) => { product.offers.eligibleRegion = "US"; }],
  ["unsupported_currency", (product: ReturnType<typeof mockProduct>) => { product.offers.priceCurrency = "USD"; }],
  ["stale_source", (product: ReturnType<typeof mockProduct>) => { product.dateModified = "2026-01-01"; }],
  ["expired", (product: ReturnType<typeof mockProduct>) => { product.offers.priceValidUntil = "2026-11-01"; }],
  ["price_mismatch", (product: ReturnType<typeof mockProduct>) => { product.offers.price = "0"; }],
  ["tax_unverified", (product: ReturnType<typeof mockProduct>) => { product.offers.priceSpecification.valueAddedTaxIncluded = false; }],
  ["introductory_price", (product: ReturnType<typeof mockProduct>) => { product.offers.priceSpecification.description = "첫 달 1,000 KRW VAT 포함"; }],
  ["introductory_price", (product: ReturnType<typeof mockProduct>) => { product.description += " 첫 달만 적용해요."; }],
  ["unsupported_billing_terms", (product: ReturnType<typeof mockProduct>) => { product.description += " 연간 선납이 필요해요."; }],
] as const)("%s 검증 실패는 미검증 후보이고 계산에 전달하지 않아요", async (issue, mutate) => {
  const product = mockProduct(); mutate(product); const { engine } = setup(mockPage(product)); const report = await engine.discover(input);
  expect(report.verified).toEqual([]); expect(report.candidates[0].issues).toContain(issue);
  expect(report.candidates[0].checked_at).toBeNull(); expect(engine.toVerifiedCatalog(report, DISCOVERY_TODAY).benefits).toEqual([]);
});
it("JSON-LD 안에만 있고 본문에 없는 조건 인용은 검증되지 않아요", async () => {
  const { engine } = setup(mockPage(mockProduct(), "넷플릭스 [MOCK] 가상 학생 요금 월 1,000 KRW VAT 포함 KR 2026-11-06"));
  const report = await engine.discover(input); expect(report.candidates[0].issues).toContain("quote_conditions"); expect(report.verified).toEqual([]);
});
it("공식 페이지에 혜택이 없으면 검색 요약의 할인은 무시해요", async () => {
  const { engine } = setup({ ...mockPage(), html: "<html><body>등록된 혜택이 없어요</body></html>" });
  const report = await engine.discover(input); expect(report.verified).toEqual([]); expect(report.candidates[0].issues).toContain("unsupported_page");
});
it("검색 실패와 검색 결과 없음은 구분해요", async () => {
  const options = { catalog: discoveryCatalog(), sources: [mockSource], pages: setup().pages };
  expect((await createBenefitDiscovery({ ...options, search: { search: async () => { throw new Error("가상 비공개 오류"); } } }).discover(input)).status).toBe("search_failed");
  expect((await createBenefitDiscovery({ ...options, search: { search: async () => [] } }).discover(input)).status).toBe("no_results");
});
it("등록하지 않은 공식 도메인은 추측하지 않고 검색을 보류해요", async () => {
  const { search, pages } = setup();
  const engine = createBenefitDiscovery({ catalog: discoveryCatalog(), sources: [], search, pages });
  expect((await engine.discover(input)).status).toBe("unconfigured"); expect(search.search).not.toHaveBeenCalled();
});
it("미등록 서비스 ID를 검색하지 않아요", async () => {
  const mock = setup(); await expect(mock.engine.discover({ ...input, confirmed_service_ids: ["invented"] })).rejects.toThrow("unknown_service"); expect(mock.search.search).not.toHaveBeenCalled();
});
it("가짜 공식 출처는 조회 전에 차단해요", async () => {
  const mock = setup(); mock.search.search.mockResolvedValue([{ url: "https://official.example.invalid.evil.invalid/free", snippet: "가상" }]);
  const report = await mock.engine.discover(input); expect(report.verified).toEqual([]); expect(report.candidates[0].issues).toContain("untrusted_source");
});
it("중복 URL·중복 혜택은 한 번만 반환해요", async () => {
  const mock = setup(); mock.search.search.mockResolvedValue([{ url: MOCK_OFFICIAL_URL, snippet: "가상" }, { url: `${MOCK_OFFICIAL_URL}#duplicate`, snippet: "가상" }]);
  expect((await mock.engine.discover(input)).verified).toHaveLength(1);
});
it("verified 플래그를 조작하거나 JSON 복사한 결과를 카탈로그로 승격할 수 없어요", async () => {
  const { engine } = setup(); const report = await engine.discover(input);
  expect(() => engine.toVerifiedCatalog(structuredClone(report), DISCOVERY_TODAY)).toThrow("untrusted_report");
  report.verified[0].price = 0;
  expect(() => engine.toVerifiedCatalog(report, DISCOVERY_TODAY)).toThrow("untrusted_report");
});
it("검증 후 오래된 레코드를 재발행하지 않아요", async () => {
  const { engine } = setup(); const report = await engine.discover(input);
  expect(engine.toVerifiedCatalog(report, "2026-12-08").benefits).toEqual([]);
});
it("일반 요금제는 검증 레코드로 분리하고 B1 학생 할인으로 위장하지 않아요", async () => {
  const product = mockProduct(); product.category = "plan_discount";
  const { engine } = setup(mockPage(product)); const report = await engine.discover(input);
  expect(report.verified).toHaveLength(1); expect(engine.toVerifiedCatalog(report, DISCOVERY_TODAY).benefits).toEqual([]);
});
it("검색 타임아웃은 실패 상태이며 signal을 취소해요", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const engine = createBenefitDiscovery({ catalog: discoveryCatalog(), sources: [mockSource], pages: setup().pages,
    search: { search: async (request) => { signal = request.signal; return new Promise(() => {}); } } });
  const pending = engine.discover(input); await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
  expect((await pending).status).toBe("search_failed"); expect(signal?.aborted).toBe(true);
});
it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.1.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2002:7f00:1::", "2001:db8::1"])
  ("내부망·특수 주소 %s는 차단해요", (address) => expect(isPublicAddress(address)).toBe(false));
it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])("공인 주소 %s만 허용해요", (address) => expect(isPublicAddress(address)).toBe(true));
it.each(["http://official.example.invalid/a", "https://official.example.invalid@evil.invalid/a", "https://official.example.invalid.:443/a", "https://official.example.invalid:444/a", "https://127.0.0.1/a", "file:///a"])
  ("위험한 URL %s는 거부해요", (url) => expect(() => officialUrl(url, mockSource.hosts)).toThrow());
it("DNS가 내부망이나 혼합 주소를 반환하면 연결하지 않아요", async () => {
  const transport = vi.fn(mockTransport);
  const pages = createSecurePageFetcher({ resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }], transport });
  await expect(pages.fetch(MOCK_OFFICIAL_URL, mockSource.hosts)).rejects.toThrow("private_address"); expect(transport).not.toHaveBeenCalled();
});
it("허용 리디렉션도 DNS를 재검증하고 연결할 IP를 고정해요", async () => {
  const resolve = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
  const transport = vi.fn(mockTransport).mockResolvedValueOnce(mockResponse("", 302, { location: "/new" }));
  const pages = createSecurePageFetcher({ resolve, transport }); await pages.fetch(MOCK_OFFICIAL_URL, mockSource.hosts);
  expect(resolve).toHaveBeenCalledTimes(2); expect(transport.mock.calls[1][0].address).toBe("8.8.8.8");
});
it("외부 리디렉션과 재바인딩된 내부 IP는 차단해요", async () => {
  const transport = vi.fn(mockTransport).mockResolvedValueOnce(mockResponse("", 302, { location: "https://evil.invalid/a" }));
  const pages = createSecurePageFetcher({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport });
  await expect(pages.fetch(MOCK_OFFICIAL_URL, mockSource.hosts)).rejects.toThrow("unsafe_url"); expect(transport).toHaveBeenCalledTimes(1);
  const resolve = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]).mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  const rebound = createSecurePageFetcher({ resolve, transport: async () => mockResponse("", 302, { location: "/new" }) });
  await expect(rebound.fetch(MOCK_OFFICIAL_URL, mockSource.hosts)).rejects.toThrow("private_address");
});
it("리디렉션 횟수·상태·압축·응답 크기를 제한해요", async () => {
  const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
  for (const response of [mockResponse("", 302, { location: "/again" }), mockResponse("", 404), mockResponse("", 200, { "content-encoding": "gzip" }),
    mockResponse("", 200, { "content-length": String(PAGE_MAX_BYTES + 1) }), mockResponse("가".repeat(PAGE_MAX_BYTES)), mockResponse("", 200, { "content-type": "application/json" })]) {
    await expect(createSecurePageFetcher({ resolve, transport: async () => response }).fetch(MOCK_OFFICIAL_URL, mockSource.hosts)).rejects.toThrow();
  }
});
it("페이지 요청 전체 타임아웃에는 DNS 대기도 포함돼요", async () => {
  vi.useFakeTimers(); const pages = createSecurePageFetcher({ resolve: () => new Promise(() => {}) });
  const pending = pages.fetch(MOCK_OFFICIAL_URL, mockSource.hosts); const assertion = expect(pending).rejects.toThrow("page_timeout");
  await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS); await assertion;
});
it("추출값을 변조해도 본문과 대조해 거부해요", () => {
  const page = mockPage(); const [candidate] = extractBenefits(page, "netflix"); candidate.quotes.conditions = "없는 가상 조건";
  expect(verifyBenefit(candidate, page, mockSource, discoveryCatalog(), "KR", DISCOVERY_TODAY).issues).toContain("quote_conditions");
});
it("B5 AI 후보는 검색하지 않고 확정 ID만 자동 탐색 입력에 사용해요", async () => {
  const mock = createMockProvider([{ text: JSON.stringify({ service_id: "netflix", confidence: 0.99, category: "영상", reason: "가상 추정" }) }]);
  const results = await resolveInterpretItems([{ key: "mock", raw_name: "카카오페이", amount: 13500, interval: "monthly", payment_method: "card" }],
    { catalog: discoveryCatalog(), llm: createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }) });
  const ids = confirmedServiceIds(results); expect(ids).toEqual([]);
  const discovery = setup(); expect((await discovery.engine.discover({ ...input, confirmed_service_ids: ids })).status).toBe("no_results"); expect(discovery.search.search).not.toHaveBeenCalled();
});
it("검증된 공식 혜택→B7 자격→B6 절약 계산으로 연결해요", async () => {
  const { engine } = setup(); const report = await engine.discover(input); const catalog = engine.toVerifiedCatalog(report, DISCOVERY_TODAY);
  const mock = createMockProvider([{ text: JSON.stringify(mockDecision("yes", catalog.benefits[0].conditions)) }]);
  const post = createBenefitsHandler({ getCatalog: () => catalog, today: () => DISCOVERY_TODAY,
    llm: createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }) });
  const response = await post(new Request("http://localhost/api/benefits", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: mockUser, targets: [{ kind: "benefit", id: catalog.benefits[0].id }] }) }));
  const output = buildSuggestions({ subs: [mockConfirmedSubscription], catalog, benefitResults: (await response.json()).results, today: DISCOVERY_TODAY });
  expect(output[0]).toMatchObject({ type: "student_discount", saving_monthly: 12500, saving_yearly: 150000 });
});

it("연간 공식 요금을 B2 방식으로 월 환산해 B1에 투영해요", async () => {
  const product = mockProduct(); product.offers.price = "12000"; product.offers.priceSpecification.unitCode = "ANN"; product.offers.priceSpecification.description = "연 12,000 KRW VAT 포함";
  const { engine } = setup(mockPage(product)); const report = await engine.discover(input);
  expect(engine.toVerifiedCatalog(report, DISCOVERY_TODAY).benefits[0].price_after_monthly).toBe(1000);
});
it("학교 라이선스의 학교명도 본문에서 확인해야 해요", async () => {
  const product = { ...mockProduct(), category: "school_license", audience: { name: "가상 테스트 학교" } };
  const page = mockPage(product); page.html = page.html.replace("</main>", "<p>가상 테스트 학교</p></main>");
  const { engine } = setup(page); const report = await engine.discover(input);
  expect(engine.toVerifiedCatalog(report, DISCOVERY_TODAY).benefits[0]).toMatchObject({ kind: "school_license", school: "가상 테스트 학교" });
});
it("공식 페이지끼리 같은 혜택의 가격이 충돌하면 어느 쪽도 승격하지 않아요", async () => {
  const second = mockProduct(); second.offers.price = "2000"; second.offers.priceSpecification.description = "월 2,000 KRW VAT 포함";
  const engine = createBenefitDiscovery({ catalog: discoveryCatalog(), sources: [mockSource],
    search: { search: async () => [{ url: MOCK_OFFICIAL_URL }, { url: `${MOCK_OFFICIAL_URL}-second` }] },
    pages: { fetch: async (url) => mockPage(url.endsWith("second") ? second : mockProduct(), undefined, url) } });
  const report = await engine.discover(input); expect(report.verified).toEqual([]);
  expect(report.candidates.every((entry) => entry.issues.includes("conflicting_benefit"))).toBe(true);
});
it("국가 KR을 통화 KRW의 부분 문자열로 검증하지 않아요", async () => {
  const page = mockPage(); page.html = page.html.replace("<p>KR</p>", "");
  const { engine } = setup(page); const report = await engine.discover(input);
  expect(report.candidates[0].issues).toContain("country_quote_unverified"); expect(report.verified).toEqual([]);
});
it("필드를 바꾼 후보는 올바른 원문 인용이 남아 있어도 검증하지 않아요", () => {
  const page = mockPage(); const [candidate] = extractBenefits(page, "netflix"); candidate.conditions = "조작된 조건";
  expect(verifyBenefit(candidate, page, mockSource, discoveryCatalog(), "KR", DISCOVERY_TODAY).issues).toContain("extraction_mismatch");
});
it("페이지 실패와 일부 서비스의 설정 누락은 전체 성공으로 표시하지 않아요", async () => {
  const engine = createBenefitDiscovery({ catalog: discoveryCatalog(), sources: [mockSource], search: setup().search,
    pages: { fetch: async () => { throw new Error("가상 비공개 오류"); } } });
  const report = await engine.discover({ ...input, confirmed_service_ids: ["netflix", "goodnotes"] });
  expect(report.status).toBe("partial"); expect(report.errors.map((entry) => entry.code)).toEqual(["page_failed", "official_source_unconfigured"]);
  expect(JSON.stringify(report)).not.toContain("가상 비공개 오류");
});
