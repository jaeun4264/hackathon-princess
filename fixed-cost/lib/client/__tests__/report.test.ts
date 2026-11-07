import { describe, expect, it, vi } from "vitest";
import { events } from "../../api-client";
import type { Subscription, Suggestion } from "../../types";
import { actedSavings, actionEvent, keepReasonEvent, pauseFor, splitSuggestions } from "../report";

const suggestion = (id: string, type: Suggestion["type"], saving: number, subId: string, action: Suggestion["action_status"] = "none"): Suggestion => ({
  id, type, subscription_ids: [subId], saving_monthly: saving, saving_yearly: saving * 12, message: "m", message_source: "fallback",
  source_url: null, checked_at: null, stale: false, is_partner: id === "partner", cancel_url: null, action_status: action, keep_reason: null,
});
const sub: Subscription = {
  id: "netflix-sub", service_id: "netflix", display_name: "넷플릭스", category: "영상", raw_name: "넷플릭스", amount: 13500, interval: "monthly",
  monthly_amount: 13500, next_date: null, usage: "rarely", confidence: 1, interpret_source: "catalog", needs_check: false, user_confirmed: false, evidence_transaction_ids: ["t"],
};

describe("리포트 순서", () => {
  it("절약액 큰 순, 제휴라서 올리지 않고, 쉬기는 같은 구독 해지 바로 아래", () => {
    const { actionable, keep } = splitSuggestions([
      suggestion("partner", "bundle", 2100, "a"), suggestion("c1", "cancel", 13500, "netflix-sub"),
      suggestion("k", "keep", 0, "b"), suggestion("p1", "pause", 13500, "netflix-sub"), suggestion("c2", "cancel", 1100, "c"),
    ]);
    expect(actionable.map((s) => s.id)).toEqual(["c1", "p1", "partner", "c2"]);
    expect(keep.map((s) => s.id)).toEqual(["k"]);
  });
});

describe("실행 체크", () => {
  it("해지·변경으로 체크한 절약액만, 같은 구독은 한 번", () => {
    expect(actedSavings([
      suggestion("c1", "cancel", 13500, "netflix-sub", "done"), suggestion("p1", "pause", 13500, "netflix-sub", "done"),
      suggestion("c2", "cancel", 1100, "c", "changed"), suggestion("c3", "cancel", 9500, "d", "kept"),
    ])).toBe(14600);
  });

  it("events 호출 payload가 계약 3-4 모양과 정확히 같아요 (이름·금액 없음)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true })));
    await events(actionEvent("sess", suggestion("c1", "cancel", 13500, "netflix-sub"), "done"), { mock: false, fetchImpl });
    await events(keepReasonEvent("sess", "maybe_later"), { mock: false, fetchImpl });
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string));
    expect(bodies).toEqual([
      { session_id: "sess", kind: "action", payload: { suggestion_type: "cancel", status: "done" } },
      { session_id: "sess", kind: "keep_reason", payload: { reason: "maybe_later" } },
    ]);
    expect(JSON.stringify(bodies)).not.toMatch(/넷플릭스|13500/);
  });

  it("'볼 게 생길까 봐' → 쉬기 제안 (월 절약액 = 월 금액), 확인 안 된 구독은 만들지 않아요", () => {
    expect(pauseFor(sub, "2026-11-07")).toMatchObject({ type: "pause", saving_monthly: 13500, subscription_ids: ["netflix-sub"] });
    expect(pauseFor({ ...sub, service_id: null, needs_check: true, interpret_source: "ai" }, "2026-11-07")).toBeNull();
    expect(pauseFor(undefined, "2026-11-07")).toBeNull();
  });
});
