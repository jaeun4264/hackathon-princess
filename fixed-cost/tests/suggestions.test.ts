import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { buildSuggestions, summarize, makePauseSuggestion, isStale, fillPlaceholders, monthlyEquivalent } from "../lib/rules";
import { SuggestionSchema } from "../lib/schemas";
import type { Subscription, CatalogBenefit, BenefitResult } from "../lib/types";
import { sampleAdapter } from "../lib/adapters/sample";
import { detectSubscriptionCandidates } from "../lib/rules";
import { resolveInterpretItems } from "../lib/llm/interpret";
import { createLlmClient } from "../lib/llm/core";
import { createMockProvider } from "./mocks/llm-provider";

const today = "2026-11-05";
function sub(service_id = "netflix", amount = 13500, changes: Partial<Subscription> = {}): Subscription {
  return { id: service_id, service_id, display_name: "가상 구독", category: "영상", raw_name: service_id,
    amount, interval: "monthly", monthly_amount: amount, next_date: null, usage: "rarely", confidence: 1,
    interpret_source: "catalog", needs_check: false, user_confirmed: false, evidence_transaction_ids: [], ...changes };
}
function fixture(price: number | null = 1000) {
  const catalog = loadCatalog();
  const benefit: CatalogBenefit = { id: "mock_discount", service_id: "netflix", kind: "student_discount", school: null,
    conditions: "[MOCK] 가상 학교의 재학생만 적용해요.", benefit_text: "[MOCK] 가상 할인", price_after_monthly: price,
    source_url: "https://example.invalid/mock/discount", checked_at: today };
  catalog.benefits = [benefit];
  const result: BenefitResult = { kind: "benefit", id: benefit.id, eligible: "yes", quoted_conditions: [benefit.conditions],
    missing_info: [], reason: "가상 판정", source_url: benefit.source_url, checked_at: today, stale: false, validation: "ok" };
  return { subs: [sub("netflix", 13500, { usage: "often" })], catalog, benefitResults: [result], today };
}
const network = vi.fn(() => { throw new Error("네트워크 호출 금지"); });
beforeEach(() => { network.mockClear(); vi.stubGlobal("fetch", network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

it("기준 사례의 거의 안 쓰는 합계는 월 24,100원, 연 289,200원이에요", () => {
  const subs = [sub(), sub("tving", 9500), sub("icloud", 1100), sub("daglo", 14900, { usage: "often" })];
  expect(summarize(subs)).toEqual({ total_monthly: 39000, often_monthly: 14900, sometimes_monthly: 0, rarely_monthly: 24100 });
  const suggestions = buildSuggestions({ subs, catalog: loadCatalog(), benefitResults: [], today });
  const cancels = suggestions.filter((entry) => entry.type === "cancel");
  expect(cancels.reduce((sum, entry) => sum + entry.saving_monthly, 0)).toBe(24100);
  expect(cancels.reduce((sum, entry) => sum + entry.saving_yearly, 0)).toBe(289200);
  expect(suggestions.find((entry) => entry.subscription_ids[0] === "daglo")?.type).toBe("keep");
  expect(SuggestionSchema.array().parse(suggestions)).toEqual(suggestions);
  expect(suggestions.map((entry) => entry.saving_monthly)).toEqual([13500, 9500, 1100, 0]);
});
it("연간 요금은 B2 월 환산을 재사용하고 저장된 월 금액을 신뢰하지 않아요", () => {
  expect(monthlyEquivalent(50500, "yearly")).toBe(4208);
  const subs = [sub("goodnotes", 50500, { interval: "yearly", monthly_amount: 999 })];
  expect(summarize(subs).total_monthly).toBe(4208);
  expect(buildSuggestions({ subs, catalog: loadCatalog(), benefitResults: [], today })[0]).toMatchObject({ saving_monthly: 4208, saving_yearly: 50496 });
  expect(subs[0].monthly_amount).toBe(999);
});
it.each([null, -1, 1.5, Number.NaN])("잘못되거나 누락된 결제 금액 %s는 거부해요", (amount) => {
  expect(() => summarize([sub("netflix", amount as number)])).toThrow();
});
it("usage null과 중복 구독 ID는 에러예요", () => {
  expect(() => summarize([sub("netflix", 13500, { usage: null })])).toThrow();
  expect(() => summarize([sub(), sub()])).toThrow();
});
it.each([
  { service_id: null, needs_check: true, interpret_source: "unknown" as const },
  { needs_check: true }, { interpret_source: "ai" as const }, { service_id: "invented" },
])("미확정 또는 없는 서비스는 절약 제안에서 제외하고 관측 지출만 합산해요 %j", (changes) => {
  const subs = [sub("netflix", 13500, changes)];
  expect(summarize(subs).total_monthly).toBe(13500);
  expect(buildSuggestions({ subs, catalog: loadCatalog(), benefitResults: [], today })).toEqual([]);
});
it("사용자가 확인·수정한 등록 서비스는 계산해요", () => {
  const input = fixture();
  input.subs = [sub("netflix", 13500, { interpret_source: "user", user_confirmed: true })];
  expect(buildSuggestions(input)[0].saving_monthly).toBe(13500);
});
it.each(["often", "sometimes"] as const)("같은 용도라도 %s 구독을 중복 이유로 해지하지 않아요", (usage) => {
  const suggestions = buildSuggestions({ subs: [sub("netflix", 13500, { usage }), sub("tving", 9500, { usage })], catalog: loadCatalog(), benefitResults: [], today });
  expect(suggestions.some((entry) => entry.type === "cancel")).toBe(false);
});
it.each([null, 13500, 15000])("가격 %s로 양의 절약액이 확인되지 않으면 할인 제안이 없어요", (price) => {
  expect(buildSuggestions(fixture(price)).map((entry) => entry.type)).toEqual(["keep"]);
});
it.each(["student_discount", "school_license"] as const)("검증된 %s 차액을 계산해요", (kind) => {
  const input = fixture(0); input.catalog.benefits[0].kind = kind;
  expect(buildSuggestions(input)[0]).toMatchObject({ type: kind, saving_monthly: 13500, saving_yearly: 162000 });
});
it.each([
  { eligible: "unknown" as const }, { eligible: "no" as const }, { validation: "quote_failed" as const, eligible: "unknown" as const },
  { quoted_conditions: [] }, { quoted_conditions: ["없는 조건"] }, { missing_info: ["school" as const] },
  { checked_at: "2026-01-01" }, { source_url: "https://example.invalid/other" },
])("불명확·검증 실패 혜택은 계산하지 않아요 %j", (changes) => {
  const input = fixture(); Object.assign(input.benefitResults[0], changes);
  expect(buildSuggestions(input)[0].type).toBe("keep");
});
it("중복 판정·여러 할인은 합산하지 않고 가장 큰 차액 한 번만 제안해요", () => {
  const input = fixture(1000);
  input.catalog.benefits.push({ ...input.catalog.benefits[0], id: "mock_free", price_after_monthly: 0, kind: "school_license" });
  input.benefitResults.push({ ...input.benefitResults[0] }, { ...input.benefitResults[0], id: "mock_free" });
  const output = buildSuggestions(input);
  expect(output).toHaveLength(1); expect(output[0]).toMatchObject({ type: "school_license", saving_monthly: 13500 });
});
it("모순된 중복 판정은 안전하게 제외해요", () => {
  const input = fixture(); input.benefitResults.push({ ...input.benefitResults[0], eligible: "no" });
  expect(buildSuggestions(input)[0].type).toBe("keep");
});
it.each([["2026-10-06", false], ["2026-10-05", true], [null, true], ["2026-11-06", true]] as const)("확인일 %s의 stale은 %s예요", (date, expected) => {
  expect(isStale(date, today)).toBe(expected);
});
it("오래된 혜택은 제거하지 않고 재확인 표시를 유지해요", () => {
  const input = fixture(); input.catalog.benefits[0].checked_at = "2026-10-05"; input.benefitResults[0].checked_at = "2026-10-05";
  expect(buildSuggestions(input)[0]).toMatchObject({ type: "student_discount", stale: true });
});
it("쉬기 제안은 별도 호출만 허용하고 미확정은 거부해요", () => {
  expect(makePauseSuggestion(sub(), today)).toMatchObject({ type: "pause", saving_monthly: 13500, stale: true });
  expect(() => makePauseSuggestion(sub("netflix", 13500, { needs_check: true }), today)).toThrow();
});
it("금액 자리 표시는 천 단위 쉼표와 원을 사용해요", () => {
  expect(fillPlaceholders("{service_name} 월 {saving_monthly} 연 {saving_yearly}", { service_name: "가상 구독", saving_monthly: 13500, saving_yearly: 162000 })).toBe("가상 구독 월 13,500원 연 162,000원");
  expect(() => fillPlaceholders("{missing}", {})).toThrow();
});

it("B3 샘플→B2 후보→B5 상세 결과에서 확정된 항목만 B6 제안을 만들어요", async () => {
  const catalog = loadCatalog();
  const candidates = detectSubscriptionCandidates(await sampleAdapter.load("persona-1"), catalog);
  const mock = createMockProvider(Array.from({ length: 2 }, () => ({ text: JSON.stringify({ service_id: "unknown", confidence: 0, category: "기타", reason: "가상 미확정" }) })));
  const llm = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} });
  const resolved = await resolveInterpretItems(candidates.map(({ key, raw_name, amount, interval, payment_method }) => ({ key, raw_name, amount, interval, payment_method })), { catalog, llm });
  const subs = candidates.map((candidate, i) => sub(resolved[i].confirmed_service_id ?? "미확정", candidate.amount, {
    id: candidate.key, service_id: resolved[i].confirmed_service_id, raw_name: candidate.raw_name,
    interval: candidate.interval, monthly_amount: monthlyEquivalent(candidate.amount, candidate.interval),
    interpret_source: resolved[i].source, needs_check: resolved[i].needs_check, evidence_transaction_ids: candidate.transaction_ids,
  }));
  const output = buildSuggestions({ subs, catalog, benefitResults: [], today });
  expect(output).toHaveLength(3);
  expect(output.every((entry) => subs.find((sub) => sub.id === entry.subscription_ids[0])?.service_id !== null)).toBe(true);
});
