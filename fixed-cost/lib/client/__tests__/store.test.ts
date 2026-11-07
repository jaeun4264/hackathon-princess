import { describe, expect, it } from "vitest";
import { createAppStore, createSafeStorage, STORE_KEY } from "../store";
import type { Subscription, Suggestion } from "../../types";

function sub(id: string, patch: Partial<Subscription> = {}): Subscription {
  return {
    id, service_id: "netflix", display_name: "넷플릭스", category: "영상", raw_name: "넷플릭스",
    amount: 13500, interval: "monthly", monthly_amount: 13500, next_date: null, usage: null, confidence: 1,
    interpret_source: "catalog", needs_check: false, user_confirmed: false, evidence_transaction_ids: [], ...patch,
  };
}

const blocked = (): Storage => {
  throw new Error("localStorage 사용 불가");
};
const throwing: Storage = {
  length: 0,
  clear() { throw new Error("x"); },
  key() { throw new Error("x"); },
  getItem() { throw new Error("x"); },
  setItem() { throw new Error("x"); },
  removeItem() { throw new Error("x"); },
};

describe("createSafeStorage", () => {
  it("localStorage 접근 자체가 막혀도 메모리로 읽고 써요", () => {
    const storage = createSafeStorage(blocked);
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
    storage.removeItem("k");
    expect(storage.getItem("k")).toBeNull();
  });

  it("모든 메서드가 예외를 던져도 에러 없이 동작해요", () => {
    const storage = createSafeStorage(() => throwing);
    expect(() => storage.setItem("k", "v")).not.toThrow();
    expect(storage.getItem("k")).toBe("v");
  });
});

describe("app store", () => {
  it("localStorage가 막힌 환경에서도 상태 변경이 동작해요", () => {
    const store = createAppStore(createSafeStorage(blocked));
    store.getState().setSubscriptions([sub("a")]);
    store.getState().setUsage("a", "rarely");
    expect(store.getState().subscriptions[0].usage).toBe("rarely");
  });

  it("sessionId를 처음에 만들어요", () => {
    const store = createAppStore(createSafeStorage(() => undefined));
    expect(store.getState().sessionId.length).toBeGreaterThanOrEqual(8);
  });

  it("사용 정도가 하나라도 비어 있으면 confirmAll이 실패해요", () => {
    const store = createAppStore(createSafeStorage(() => undefined));
    store.getState().setSubscriptions([sub("a"), sub("b")]);
    store.getState().setUsage("a", "often");
    expect(store.getState().confirmAll()).toBe(false);
    store.getState().setUsage("b", "rarely");
    expect(store.getState().confirmAll()).toBe(true);
    expect(store.getState().phase).toBe("ready");
  });

  it("AI 추정 후보는 service_id와 따로 보관해요", () => {
    const store = createAppStore(createSafeStorage(() => undefined));
    store.getState().setSubscriptions([sub("a", { service_id: null, needs_check: true, interpret_source: "ai" })], { a: "icloud" });
    expect(store.getState().subscriptions[0].service_id).toBeNull();
    expect(store.getState().suggestedServiceIds).toEqual({ a: "icloud" });
  });

  it("resetAll()이 모든 데이터를 비우고 sessionId를 새로 만들어요", () => {
    const store = createAppStore(createSafeStorage(() => undefined));
    const before = store.getState().sessionId;
    store.getState().setProfile({ school: "고려대학교", status: "재학", school_email: true });
    store.getState().loadTransactions([
      { id: "t", date: "2026-09-01", amount: 1000, currency: "KRW", raw_name: "x", payment_method: "card", source: "manual" },
    ]);
    store.getState().setSubscriptions([sub("a")], { a: "netflix" });
    store.getState().resetAll();
    const state = store.getState();
    expect(state.profile).toBeNull();
    expect(state.transactions).toEqual([]);
    expect(state.subscriptions).toEqual([]);
    expect(state.benefitResults).toEqual([]);
    expect(state.suggestions).toEqual([]);
    expect(state.suggestedServiceIds).toEqual({});
    expect(state.phase).toBe("empty");
    expect(state.sessionId).not.toBe(before);
  });

  it("상태를 저장소에 남기지만 interpreting 단계는 저장하지 않아요", () => {
    const storage = createSafeStorage(() => undefined);
    const store = createAppStore(storage);
    store.getState().setSubscriptions([sub("a")]);
    store.getState().setPhase("interpreting");
    const saved = JSON.parse(storage.getItem(STORE_KEY) as string);
    expect(saved.state.subscriptions).toHaveLength(1);
    expect(saved.state.phase).toBe("empty");
  });

  it("setAction은 유지할 때만 이유를 남겨요", () => {
    const store = createAppStore(createSafeStorage(() => undefined));
    const suggestion: Suggestion = {
      id: "s1", type: "cancel", subscription_ids: ["a"], saving_monthly: 13500, saving_yearly: 162000, message: "m",
      message_source: "fallback", source_url: null, checked_at: null, stale: false, is_partner: false, cancel_url: null,
      action_status: "none", keep_reason: null,
    };
    store.getState().setSuggestions([suggestion]);
    store.getState().setAction("s1", "kept", "maybe_later");
    expect(store.getState().suggestions[0]).toMatchObject({ action_status: "kept", keep_reason: "maybe_later" });
    store.getState().setAction("s1", "done", "maybe_later");
    expect(store.getState().suggestions[0]).toMatchObject({ action_status: "done", keep_reason: null });
  });
});
