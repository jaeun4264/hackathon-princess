import { describe, expect, it, vi } from "vitest";
import { benefits, events, interpret, message } from "../../api-client";
import type { Catalog } from "../../types";

const item = { key: "k1", raw_name: "카카오페이", amount: 6900, interval: "monthly" as const, payment_method: "kakaopay" };
const profile = { school: "고려대학교", status: "재학" as const, school_email: true };
const catalog: Catalog = {
  services: [],
  benefits: [{
    id: "b1", service_id: "netflix", kind: "student_discount", school: null, conditions: "재학생", benefit_text: "할인",
    price_after_monthly: 1000, source_url: "https://example.com/b1", checked_at: "2026-11-01",
  }],
  bundles: [],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sentBody = (mock: { mock: { calls: unknown[][] } }) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

describe("모의 모드", () => {
  it("interpret: AI 추정은 확정하지 않고 후보로만 돌려줘요", async () => {
    const response = await interpret([item, { ...item, key: "k2", raw_name: "모르는가게" }], { mock: true, mockDelayMs: 0 });
    expect(response.degraded).toBe(false);
    expect(response.results[0]).toMatchObject({ key: "k1", service_id: null, source: "ai", needs_check: true });
    expect(response.suggestedServiceIds).toEqual({ k1: "kakao_emoticon_plus", k2: null });
    expect(response.results[1]).toMatchObject({ key: "k2", source: "unknown", needs_check: true });
  });

  it("benefits: yes / no / unknown을 돌려줘요", async () => {
    const response = await benefits(profile, [
      { kind: "benefit", id: "mock_student_discount" },
      { kind: "benefit", id: "mock_school_license" },
      { kind: "benefit", id: "mock_unknown_price" },
    ], { mock: true, mockDelayMs: 0 });
    expect(response.results.map((entry) => entry.eligible)).toEqual(["yes", "no", "unknown"]);
  });

  it("message: 숫자 없는 문장을 돌려줘요", async () => {
    const response = await message(
      { type: "cancel", usage: "rarely", service_name: "넷플릭스", params: { saving_monthly: 13500 } },
      { mock: true, mockDelayMs: 0 },
    );
    expect(response.message).toBeTruthy();
    expect(response.message).not.toMatch(/[0-9]/);
  });

  it("모의 모드는 네트워크를 부르지 않아요", async () => {
    const fetchImpl = vi.fn();
    await interpret([item], { mock: true, mockDelayMs: 0, fetchImpl });
    await events({ session_id: "s", kind: "discovery", payload: { found_count: 1 } }, { mock: true, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("실제 모드", () => {
  it("interpret: 계약 필드만 보내고 resolutions의 후보를 읽어요", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({
      results: [{ key: "k1", service_id: null, category: "기타", confidence: 0.8, reason: "r", source: "ai", needs_check: true }],
      resolutions: [{
        key: "k1", service_id: null, category: "기타", confidence: 0.8, reason: "r", source: "ai", needs_check: true,
        suggested_service_id: "kakao_emoticon_plus", confirmed_service_id: null,
      }],
    }));
    const response = await interpret([{ ...item, extra: "보내면 안 됨" } as typeof item], { mock: false, fetchImpl });
    expect(Object.keys(sentBody(fetchImpl).items[0]).sort()).toEqual(["amount", "interval", "key", "payment_method", "raw_name"]);
    expect(response).toMatchObject({ degraded: false, suggestedServiceIds: { k1: "kakao_emoticon_plus" } });
  });

  it("interpret: 타임아웃이면 던지지 않고 unknown + degraded", async () => {
    const fetchImpl = (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const response = await interpret([item], { mock: false, fetchImpl: fetchImpl as typeof fetch, timeoutMs: 20 });
    expect(response.degraded).toBe(true);
    expect(response.results).toEqual([
      { key: "k1", service_id: null, category: "기타", confidence: 0, reason: "", source: "unknown", needs_check: true },
    ]);
  });

  it("interpret: 429·모양이 틀린 응답·key 불일치도 degraded", async () => {
    const replies = [
      () => json({ error: { code: "rate_limit" } }, 429),
      () => json({ results: "x" }),
      () => json({ results: [{ key: "다른키", service_id: null, category: "기타", confidence: 0, reason: "", source: "unknown", needs_check: true }] }),
    ];
    for (const reply of replies) {
      const response = await interpret([item], { mock: false, fetchImpl: async () => reply() });
      expect(response.degraded).toBe(true);
      expect(response.results[0].source).toBe("unknown");
    }
  });

  it("benefits: 네트워크 오류면 카탈로그 출처로 unknown/ai_error", async () => {
    const response = await benefits(profile, [{ kind: "benefit", id: "b1" }], {
      mock: false, catalog, today: "2026-11-07", fetchImpl: async () => { throw new TypeError("network"); },
    });
    expect(response.degraded).toBe(true);
    expect(response.results).toEqual([{
      kind: "benefit", id: "b1", eligible: "unknown", quoted_conditions: [], missing_info: [], reason: "",
      source_url: "https://example.com/b1", checked_at: "2026-11-01", stale: false, validation: "ai_error",
    }]);
  });

  it("message: 실패하면 null(기본 문장 유지)", async () => {
    const response = await message(
      { type: "keep", usage: "often", service_name: "넷플릭스", params: {} },
      { mock: false, fetchImpl: async () => json({}, 500) },
    );
    expect(response).toEqual({ message: null, source: "fallback", degraded: true });
  });

  it("events: 실패하면 한 번만 재시도하고 조용히 포기해요", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({}, 500));
    const input = { session_id: "s", kind: "action" as const, payload: { suggestion_type: "cancel" as const, status: "done" as const } };
    const response = await events(input, { mock: false, fetchImpl });
    expect(response).toEqual({ ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchImpl)).toEqual(input);
  });
});
