import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../app/api/message/route";
import { createMessageHandler } from "../lib/llm/message-api";
import { APPROVED_TEMPLATES, buildRecommendationMessages, generateMessage, validMessageTemplate } from "../lib/llm/message";
import { createBenefitsHandler } from "../lib/llm/benefits-api";
import { createLlmClient } from "../lib/llm/core";
import { DEFAULT_MESSAGES } from "../lib/rules/messages";
import { SuggestionTypeSchema } from "../lib/schemas";
import type { LlmProvider } from "../lib/llm/types";
import { createMockProvider } from "./mocks/llm-provider";
import { mockMessage, mockConfirmedSubscription } from "./mocks/message";
import { mockBenefitsCatalog, mockUser, mockDecision, MOCK_TODAY } from "./mocks/benefits";

function request(body: unknown = mockMessage) { return new Request("http://localhost/api/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
function setup(replies: unknown[] = [{ template: APPROVED_TEMPLATES.cancel[1] }]) {
  const mock = createMockProvider(replies.map((reply) => reply instanceof Error ? reply : { text: typeof reply === "string" ? reply : JSON.stringify(reply) }));
  const client = createLlmClient({ provider: mock.provider, dailyCap: 100, logger: () => {} });
  return { ...mock, client, post: createMessageHandler({ llm: client }) };
}
const network = vi.fn(() => { throw new Error("실제 API 호출 금지"); });
beforeEach(() => { network.mockClear(); vi.stubGlobal("fetch", network);
  for (const name of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "LLM_DAILY_CAP"]) vi.stubEnv(name, ""); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("정상 AI 문장 틀에 B6 금액을 천 단위 쉼표로 채워요", async () => {
  const mock = setup(); const response = await mock.post(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "넷플릭스 구독을 거의 쓰지 않는다면 해지를 고려해 보세요. 월 13,500원을 아낄 수 있어요.", source: "ai" });
});
it("월 금액만 전달하면 연 금액은 코드가 열두 배로 계산해요", async () => {
  const mock = setup([{ template: DEFAULT_MESSAGES.cancel }]);
  const response = await mock.post(request({ ...mockMessage, params: { saving_monthly: 13500 } }));
  expect((await response.json()).message).toContain("연 162,000원");
});
it.each(["월 13,500원을 아껴요.", "월 １３５００원을 아껴요.", "{foo}을 사용해요.", "{saving_monthly", "{{service_name}}", "가".repeat(121), "", "학교 인증 없이 무료로 사용할 수 있어요.", "공식 사이트 https://example.invalid/invented에서 할인받아요."])
  ("숫자·잘못된 자리 표시·길이·새 사실 문장은 fallback이에요 %s", async (template) => {
    const mock = setup([{ template }]); expect((await (await mock.post(request())).json()).source).toBe("fallback");
  });
it.each(["bad JSON", {}, { template: 123 }, { template: DEFAULT_MESSAGES.cancel, price: 1000 }])("잘못된 응답은 fallback이에요 %j", async (reply) => {
  const mock = setup([reply, reply]); expect((await (await mock.post(request())).json()).source).toBe("fallback");
});
it("LLM null과 예외는 같은 안전한 기본 문장을 반환해요", async () => {
  const client = { callJson: async () => null };
  expect((await generateMessage(mockMessage, client)).source).toBe("fallback");
  const mock = setup([new Error("가상 비공개 오류")]);
  const body = await (await mock.post(request())).json();
  expect(body.source).toBe("fallback"); expect(JSON.stringify(body)).not.toContain("가상 비공개 오류");
});
it("B4 타임아웃도 HTTP 200 fallback이에요", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const provider: LlmProvider = { complete(input) { signal = input.signal; return new Promise(() => {}); } };
  const post = createMessageHandler({ llm: createLlmClient({ provider, dailyCap: 10, logger: () => {} }) });
  const pending = post(request()); await vi.advanceTimersByTimeAsync(15000); const response = await pending;
  expect(response.status).toBe(200); expect(signal?.aborted).toBe(true); expect((await response.json()).source).toBe("fallback");
});
it("키 없이 기본 경로는 유료 API를 부르지 않고 fallback이에요", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect((await (await POST(request())).json()).source).toBe("fallback");
});
it.each(SuggestionTypeSchema.options)("모든 %s 종류에 안전한 기본 문장이 있어요", async (type) => {
  const input = { ...mockMessage, type, usage: type === "keep" ? "often" as const : "rarely" as const,
    params: type === "keep" ? {} : { ...mockMessage.params, alt_name: "[MOCK] 가상 대안" } };
  expect(validMessageTemplate(DEFAULT_MESSAGES[type], input)).toBe(true);
  const result = await generateMessage(input, { callJson: async () => null });
  expect(result.source).toBe("fallback"); expect(result.message).not.toMatch(/\{[^{}]+\}/u);
});
it("모델에는 실제 서비스명·금액·원문·대안 설명을 보내지 않아요", async () => {
  const mock = setup(); await mock.post(request());
  const text = JSON.stringify(mock.requests);
  expect(text).not.toContain("넷플릭스"); expect(text).not.toContain("13500"); expect(text).not.toContain("162000");
  expect(JSON.parse(mock.requests[0][1].content)).toMatchObject({ type: "cancel", usage: "rarely", service_name: "{service_name}" });
});
it.each([
  { ...mockMessage, raw_name: "가상 원문" }, { ...mockMessage, params: { saving_monthly: -1 } },
  { ...mockMessage, params: { saving_monthly: 1.5 } }, { ...mockMessage, params: {} },
  { ...mockMessage, params: { saving_monthly: 13500, saving_yearly: 1 } },
  { ...mockMessage, type: "student_discount" }, { ...mockMessage, type: "unknown" },
  { ...mockMessage, params: { ...mockMessage.params, source_url: "가상" } },
  { ...mockMessage, type: "keep" }, { ...mockMessage, params: { saving_monthly: Number.MAX_SAFE_INTEGER } },
])("계약 밖 필드·누락·모순된 금액은 400이며 AI를 부르지 않아요 %j", async (input) => {
  const mock = setup(); expect((await mock.post(request(input))).status).toBe(400); expect(mock.requests).toHaveLength(0);
});
it("본문 한도·잘못된 JSON·분당 요청 한도를 지켜요", async () => {
  const mock = setup();
  const response = await mock.post(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: JSON.stringify({ value: "가".repeat(8000) }) }));
  expect((await response.json()).error.code).toBe("body_too_large");
  expect((await mock.post(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
  expect((await mock.post(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(400);
  const post = createMessageHandler({ llm: { callJson: async () => null } });
  for (let i = 0; i < 20; i++) expect((await post(request())).status).toBe(200);
  expect((await post(request())).status).toBe(429);
});
it("B7 검증→B6 계산→B8 문장으로만 연결하고 미확정 구독을 제외해요", async () => {
  const catalog = mockBenefitsCatalog(); const benefits = setup([mockDecision()]);
  const judge = createBenefitsHandler({ getCatalog: () => catalog, llm: benefits.client, today: () => MOCK_TODAY });
  const result = await judge(new Request("http://localhost/api/benefits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: mockUser, targets: [{ kind: "benefit", id: "mock_student_discount" }] }) }));
  const input = { subs: [mockConfirmedSubscription], benefitResults: (await result.json()).results, catalog, today: MOCK_TODAY };
  const mock = setup([{ template: DEFAULT_MESSAGES.student_discount }]);
  const suggestions = await buildRecommendationMessages(input, mock.client);
  expect(suggestions[0]).toMatchObject({ type: "student_discount", saving_monthly: 12500, saving_yearly: 150000, message_source: "ai" });
  expect(suggestions[0]).toMatchObject({ source_url: catalog.benefits[0].source_url, checked_at: MOCK_TODAY, stale: false });
  expect(suggestions[0].message).toContain("12,500원");
  expect(await buildRecommendationMessages({ ...input, subs: [{ ...mockConfirmedSubscription, service_id: null, interpret_source: "ai", needs_check: true }] }, mock.client)).toEqual([]);
  catalog.benefits[0].price_after_monthly = null;
  expect((await buildRecommendationMessages(input, { callJson: async () => null }))[0]).toMatchObject({ type: "keep", saving_monthly: 0 });
});

it.each(["no", "unknown"] as const)("B7 %s 판정은 할인 문장으로 승격하지 않아요", async (eligible) => {
  const catalog = mockBenefitsCatalog();
  const result = { kind: "benefit" as const, id: catalog.benefits[0].id, ...mockDecision(eligible),
    source_url: catalog.benefits[0].source_url, checked_at: MOCK_TODAY, stale: false, validation: "ok" as const,
    missing_info: eligible === "unknown" ? ["other" as const] : [] };
  const output = await buildRecommendationMessages({ subs: [mockConfirmedSubscription], benefitResults: [result], catalog, today: MOCK_TODAY }, { callJson: async () => null });
  expect(output).toHaveLength(1); expect(output[0]).toMatchObject({ type: "keep", saving_monthly: 0 });
});
it("오류·입력·응답 원문은 로그에 남기지 않아요", async () => {
  const mock = setup([new Error("가상 비공개 표식")]);
  const spies = ["log", "info", "warn", "error"].map((method) => vi.spyOn(console, method as "log").mockImplementation(() => {}));
  await mock.post(request());
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});
