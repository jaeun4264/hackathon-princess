import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { request as nativeRequest } from "node:https";
import { createBraveSearchProvider, BRAVE_SEARCH_URL, BRAVE_MAX_BYTES, BRAVE_TIMEOUT_MS } from "../lib/adapters/benefit-discovery/brave";
import { DISCOVERY_CACHE_MS } from "../lib/adapters/benefit-discovery/live";
import { createLlmClient } from "../lib/llm/core";
import { DEFAULT_MESSAGES } from "../lib/rules/messages";
import { mockConfirmedSubscription } from "./mocks/message";
import { mockDecision, mockUser } from "./mocks/benefits";
import { createMockProvider } from "./mocks/llm-provider";
import { DISCOVERY_TODAY, MOCK_OFFICIAL_URL, mockPage, mockProduct } from "./mocks/discovery";
import { braveJson, jsonResponse, mockBrave, mockLive, searchInput } from "./mocks/live-discovery";

vi.mock("node:https", () => ({ request: vi.fn(() => { throw new Error("실제 HTTPS 요청 금지"); }) }));
const blocked = vi.fn(() => { throw new Error("외부 유료 API 호출 금지"); });
beforeEach(() => { blocked.mockClear(); vi.mocked(nativeRequest).mockClear(); vi.stubGlobal("fetch", blocked); });
afterEach(() => { expect(blocked).not.toHaveBeenCalled(); expect(nativeRequest).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("공식 URL·GET·인증 헤더·web.results 형식만 사용하고 요약은 버려요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson([MOCK_OFFICIAL_URL, "https://evil.invalid/free", `${MOCK_OFFICIAL_URL}#same`])));
  const mock = mockBrave(fetch); const results = await mock.provider.search(searchInput());
  expect(results).toEqual([{ url: MOCK_OFFICIAL_URL }]);
  const [url, options] = fetch.mock.calls[0];
  expect((url as URL).origin + (url as URL).pathname).toBe(BRAVE_SEARCH_URL);
  expect((url as URL).searchParams.get("q")).toBe(searchInput().query);
  expect((url as URL).searchParams.get("country")).toBe("KR");
  expect(options).toMatchObject({ method: "GET", redirect: "error", headers: { "X-Subscription-Token": mock.environment.BRAVE_SEARCH_API_KEY } });
  expect(JSON.stringify(results)).not.toContain("무료");
});
it.each(["missing_key", "live_disabled"] as const)("%s이면 실제 요청이 없어요", async (code) => {
  const fetch = vi.fn<typeof globalThis.fetch>(); const mock = mockBrave(fetch);
  if (code === "missing_key") delete mock.environment.BRAVE_SEARCH_API_KEY; else mock.environment.BENEFIT_DISCOVERY_LIVE = "0";
  expect(mock.provider.availability()).toEqual({ ready: false, code });
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code }); expect(fetch).not.toHaveBeenCalled();
});
it("기본 환경에 키가 없어도 안전한 구성 상태만 반환해요", async () => {
  vi.stubEnv("BRAVE_SEARCH_API_KEY", ""); vi.stubEnv("BENEFIT_DISCOVERY_LIVE", "1");
  const provider = createBraveSearchProvider({ serviceNames: ["넷플릭스"] });
  await expect(provider.search(searchInput())).rejects.toMatchObject({ code: "missing_key" });
});
it("임의 개인정보 검색어는 허용하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(); const { provider } = mockBrave(fetch);
  await expect(provider.search({ ...searchInput(), query: "가상 사용자 영수증 원문 검색" })).rejects.toMatchObject({ code: "invalid_query" }); expect(fetch).not.toHaveBeenCalled();
});
it("동시 중복 요청과 후속 요청은 API 한 번과 캐시로 처리해요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch); mock.environment.BRAVE_SEARCH_RESULT_CACHE_ALLOWED = "1";
  const [a, b] = await Promise.all([mock.provider.search(searchInput()), mock.provider.search(searchInput())]);
  a[0].url = "가상 변경"; expect(b[0].url).toBe(MOCK_OFFICIAL_URL);
  await mock.provider.search(searchInput()); expect(fetch).toHaveBeenCalledTimes(1);
  mock.advance(15 * 60000); await mock.provider.search(searchInput()); expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(["BRAVE_SEARCH_PER_MINUTE", "BRAVE_SEARCH_DAILY_LIMIT", "BRAVE_SEARCH_MONTHLY_LIMIT"])("%s 한도를 초과해 호출하지 않아요", async (setting) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch); mock.environment[setting] = "1";
  await mock.provider.search(searchInput());
  await expect(mock.provider.search({ ...searchInput(), country: "US" })).rejects.toMatchObject({ code: "search_limit" }); expect(fetch).toHaveBeenCalledTimes(1);
});
it("월 예산은 날짜가 바뀌어도 유지되고 새 달에만 초기화돼요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch); mock.environment.BRAVE_SEARCH_MONTHLY_LIMIT = "1";
  await mock.provider.search(searchInput()); mock.advance(86400000);
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "search_limit" });
  mock.advance(30 * 86400000); await mock.provider.search(searchInput()); expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(["-1", "NaN", "1.5"])("잘못된 예산 설정 %s는 실패 시 닫혀 있어요", async (limit) => {
  const fetch = vi.fn<typeof globalThis.fetch>(); const mock = mockBrave(fetch); mock.environment.BRAVE_SEARCH_DAILY_LIMIT = limit;
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "invalid_config" }); expect(fetch).not.toHaveBeenCalled();
});
it("429는 자동 유료 재시도 없이 Retry-After를 지켜요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse({}, 429, { "retry-after": "60" })).mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch);
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "rate_limited" });
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "rate_limited" }); expect(fetch).toHaveBeenCalledTimes(1);
  mock.advance(60000); await mock.provider.search(searchInput()); expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 422, 500])("HTTP %i와 오류 본문은 노출하지 않아요", async (status) => {
  const mock = mockBrave(vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse({ error: "가상 비공개 원문" }, status)));
  await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "api_error", message: "api_error" });
});
it.each([{}, { web: {} }, { web: { results: [{ url: "bad" }] } }])("잘못된 응답은 빈 혜택처럼 캐시하지 않아요 %j", async (data) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(data)).mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch); await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "invalid_response" });
  expect(await mock.provider.search(searchInput())).toEqual([{ url: MOCK_OFFICIAL_URL }]); expect(fetch).toHaveBeenCalledTimes(2);
});
it("응답 본문 크기와 잘못된 JSON을 제한해요", async () => {
  for (const body of ["{", "가".repeat(BRAVE_MAX_BYTES)]) {
    const mock = mockBrave(vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(body, { headers: { "content-type": "application/json", "content-length": "1" } })));
    await expect(mock.provider.search(searchInput())).rejects.toMatchObject({ code: "invalid_response" });
  }
});
it("타임아웃과 요청 취소를 처리해요", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const mock = mockBrave(vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, options) => { signal = options?.signal as AbortSignal; return new Promise(() => {}); }));
  const pending = mock.provider.search(searchInput()); const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(BRAVE_TIMEOUT_MS); await assertion; expect(signal?.aborted).toBe(true);
  const controller = new AbortController(); controller.abort();
  await expect(mock.provider.search({ ...searchInput(), signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
});
it("설정 없는 통합 서비스는 검색·원문 조회를 모두 하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(); const pages = { fetch: vi.fn() };
  const mock = mockLive(fetch, { environment: () => ({}), pages });
  const output = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  expect(output.services[0]).toMatchObject({ source: "none", error: "missing_key", status: "unavailable" });
  expect(fetch).not.toHaveBeenCalled(); expect(pages.fetch).not.toHaveBeenCalled();
});
it("실제 Brave 어댑터 Mock→공식 원문→B7→B6→B8이 연결돼요", async () => {
  const provider = createMockProvider([{ text: JSON.stringify(mockDecision("yes", "[MOCK] 재학생만 이용할 수 있는 가상 조건이에요.")) }, { text: JSON.stringify({ template: DEFAULT_MESSAGES.student_discount }) }]);
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockLive(fetch, { llm: createLlmClient({ provider: provider.provider, dailyCap: 10, logger: () => {} }) });
  const output = await mock.service.recommend({ subs: [mockConfirmedSubscription], user: mockUser, country: "KR" });
  expect(output.services[0]).toMatchObject({ source: "fresh", refresh_failed: false, status: "complete" });
  expect(output.benefitResults[0]).toMatchObject({ eligible: "yes", validation: "ok" });
  expect(output.suggestions[0]).toMatchObject({ type: "student_discount", saving_monthly: 12500, saving_yearly: 150000, message_source: "ai" });
  expect(output.suggestions[0].message).toContain("12,500원");
  const url = String(fetch.mock.calls[0][0]); expect(url).not.toContain("가상 테스트 학교"); expect(url).not.toContain("13500");
  expect(JSON.stringify(provider.requests)).not.toContain(mock.environment.BRAVE_SEARCH_API_KEY);
});
it("동시 사용자 검색은 한 번이고 프로필 정보는 캐시에 공유하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockLive(fetch);
  const [a, b] = await Promise.all([mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }), mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" })]);
  a.catalog.benefits[0].price_after_monthly = 0; expect(b.catalog.benefits[0].price_after_monthly).toBe(1000);
  const next = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  expect(next.services[0].source).toBe("cache"); expect(fetch).toHaveBeenCalledTimes(1);
});
it("갱신 실패 시 검증 캐시의 기존 확인일을 보존하고 fallback을 표시해요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(braveJson())).mockImplementation(async () => jsonResponse({}, 500));
  const mock = mockLive(fetch); await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }); mock.advance(DISCOVERY_CACHE_MS);
  const output = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  expect(output.services[0]).toMatchObject({ source: "fallback", refresh_failed: true }); expect(output.catalog.benefits[0].checked_at).toBe(DISCOVERY_TODAY);
});
it("30일을 넘거나 만료된 과거 데이터는 검색 실패 때도 계산에 넣지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(braveJson())).mockImplementation(async () => jsonResponse({}, 500));
  const mock = mockLive(fetch); await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }); mock.advance(31 * 86400000);
  const output = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }); expect(output.services[0].source).toBe("none"); expect(output.catalog.benefits).toEqual([]);
});
it("변경된 원문이 미검증이면 과거 가격으로 대신 추천하지 않아요", async () => {
  let valid = true; const pages = { fetch: async () => valid ? mockPage() : { ...mockPage(), html: "<html>추출 불가</html>" } };
  const mock = mockLive(vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson())), { pages });
  await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }); valid = false;
  const output = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR", refresh: true });
  expect(output.catalog.benefits).toEqual([]); expect(output.services[0].report?.candidates[0].status).toBe("unverified"); expect(output.services[0].source).not.toBe("fallback");
});
it("미확정 구독과 사용 정도 누락은 검색하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(); const mock = mockLive(fetch);
  const output = await mock.service.recommend({ subs: [{ ...mockConfirmedSubscription, service_id: null, needs_check: true, interpret_source: "ai" }], user: mockUser, country: "KR" });
  expect(output.suggestions).toEqual([]);
  await expect(mock.service.recommend({ subs: [{ ...mockConfirmedSubscription, usage: null }], user: mockUser, country: "KR" })).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("기본 통합 흐름은 검색 Mock만으로도 유료 LLM 없이 unknown과 기본 문장을 반환해요", async () => {
  const mock = mockLive(vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson())));
  const output = await mock.service.recommend({ subs: [mockConfirmedSubscription], user: mockUser, country: "KR" });
  expect(output.benefitResults[0]).toMatchObject({ eligible: "unknown", validation: "ai_error" }); expect(output.suggestions[0]).toMatchObject({ type: "keep", message_source: "fallback" });
});

it("권한 확인 전에는 Brave 검색 응답 자체를 캐시하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockBrave(fetch); await mock.provider.search(searchInput()); await mock.provider.search(searchInput());
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("다음 날 갱신 실패의 이전 검증 결과는 B6·B8에도 재확인 표시를 유지해요", async () => {
  const condition = "[MOCK] 재학생만 이용할 수 있는 가상 조건이에요.";
  const provider = createMockProvider(Array.from({ length: 2 }, () => [
    { text: JSON.stringify(mockDecision("yes", condition)) }, { text: JSON.stringify({ template: DEFAULT_MESSAGES.student_discount }) },
  ]).flat());
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(braveJson())).mockImplementation(async () => jsonResponse({}, 500));
  const mock = mockLive(fetch, { llm: createLlmClient({ provider: provider.provider, dailyCap: 10, logger: () => {} }) });
  await mock.service.recommend({ subs: [mockConfirmedSubscription], user: mockUser, country: "KR" }); mock.advance(86400000);
  const output = await mock.service.recommend({ subs: [mockConfirmedSubscription], user: mockUser, country: "KR" });
  expect(output.catalog.benefits[0].checked_at).toBe(DISCOVERY_TODAY);
  expect(output.services[0]).toMatchObject({ source: "fallback", refresh_failed: true });
  expect(output.benefitResults[0].stale).toBe(true); expect(output.suggestions[0]).toMatchObject({ type: "student_discount", stale: true, saving_monthly: 12500 });
});
it("만료된 가격은 원문 갱신일이 최근이어도 fallback에 쓰지 않아요", async () => {
  const product = mockProduct(); product.offers.priceValidUntil = DISCOVERY_TODAY;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(braveJson())).mockImplementation(async () => jsonResponse({}, 500));
  const mock = mockLive(fetch, { pages: { fetch: async () => mockPage(product) } });
  await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" }); mock.advance(86400000);
  expect((await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" })).catalog.benefits).toEqual([]);
});
it("새 검증 가격은 같은 혜택 ID의 옛 가격을 교체해요", async () => {
  const product = mockProduct();
  const mock = mockLive(vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson())), { pages: { fetch: async () => mockPage(product) } });
  const first = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  product.offers.price = "2000"; product.offers.priceSpecification.description = "월 2,000 KRW VAT 포함";
  const second = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR", refresh: true });
  expect(second.catalog.benefits[0].id).toBe(first.catalog.benefits[0].id); expect(second.catalog.benefits[0].price_after_monthly).toBe(2000);
});
it("정상 검색 결과가 비면 옛 혜택을 남기지 않고 이후 장애에도 부활시키지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => jsonResponse(braveJson()))
    .mockImplementationOnce(async () => jsonResponse(braveJson([]))).mockImplementation(async () => jsonResponse({}, 500));
  const mock = mockLive(fetch); await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  const empty = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR", refresh: true }); expect(empty.catalog.benefits).toEqual([]);
  const failed = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR", refresh: true }); expect(failed.catalog.benefits).toEqual([]);
});
it("API 키가 제거되면 따뜻한 캐시가 있어도 외부 요청은 하지 않아요", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => jsonResponse(braveJson()));
  const mock = mockLive(fetch); await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  delete mock.environment.BRAVE_SEARCH_API_KEY;
  const output = await mock.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" });
  expect(output.services[0]).toMatchObject({ source: "fallback", error: "missing_key" }); expect(fetch).toHaveBeenCalledTimes(1);
});
