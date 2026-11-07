import { describe, expect, it, vi } from "vitest";
import { listSamples, sampleAdapter } from "../../adapters/sample";
import { loadCatalog } from "../../catalog";
import { importFromGmail, summarizeSkipped } from "../gmail";
import { analyzeTransactions, createManualSubscription, foreignOrigin, runInterpret } from "../pipeline";
import { createAppStore, createSafeStorage } from "../store";

const mock = { mock: true, mockDelayMs: 0 };
const newStore = () => createAppStore(createSafeStorage(() => undefined));

describe("샘플 체험 → 구독", () => {
  it.each([["persona-1", 5], ["persona-2", 3], ["persona-3", 2]])("%s: 구독 %i개, 단발 결제는 빠져요", async (id, expected) => {
    const txs = await sampleAdapter.load(id);
    const { subscriptions } = await analyzeTransactions(txs, { apiOptions: mock });
    expect(subscriptions).toHaveLength(expected);
    // 모든 구독은 2번 이상 결제됐거나, 연간 요금제 가격과 맞는 1건이에요.
    for (const sub of subscriptions) {
      expect(sub.evidence_transaction_ids.length >= 2 || sub.interval === "yearly").toBe(true);
      expect(sub.usage).toBeNull();
    }
  });

  it("샘플 선택 → store.subscriptions가 채워지고 phase가 confirming", async () => {
    const store = newStore();
    const [first] = listSamples();
    const stages: string[] = [];
    await runInterpret(await sampleAdapter.load(first.id), { store, apiOptions: mock, onStage: (stage) => stages.push(stage) });
    const state = store.getState();
    expect(state.subscriptions.length).toBeGreaterThan(0);
    expect(state.transactions.length).toBeGreaterThan(state.subscriptions.length);
    expect(state.phase).toBe("confirming");
    expect(stages).toEqual(["detecting", "interpreting"]);
  });

  it("AI 추정은 service_id에 넣지 않고 후보로만 둬요 (B5)", async () => {
    const store = newStore();
    await runInterpret(await sampleAdapter.load("persona-1"), { store, apiOptions: mock });
    const { subscriptions, suggestedServiceIds } = store.getState();
    const apple = subscriptions.find((sub) => sub.raw_name === "Apple" && sub.amount === 1100);
    expect(apple).toMatchObject({ service_id: null, needs_check: true, interpret_source: "ai" });
    expect(suggestedServiceIds[apple!.id]).toBe("icloud");
    const netflix = subscriptions.find((sub) => sub.service_id === "netflix");
    expect(suggestedServiceIds[netflix!.id]).toBeNull();
  });

  it("서버가 죽어도 멈추지 않고 확인 필요로 계속 가요", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("offline"); });
    const result = await analyzeTransactions(await sampleAdapter.load("persona-3"), { apiOptions: { mock: false, fetchImpl } });
    expect(result.degraded).toBe(true);
    expect(result.subscriptions.length).toBe(2);
    expect(result.subscriptions.every((sub) => sub.needs_check)).toBe(true);
  });
});

describe("Gmail 모의 모드", () => {
  it("가짜 메일 → 구독. 광고·중복은 건너뛰고, 외화는 환율로 바꿔 '확인 필요'로 넣어요", async () => {
    const result = await importFromGmail({ mock: true });
    expect(summarizeSkipped(result.skipped)).toMatchObject({ foreign: 0, notReceipt: 1, duplicate: 1 });
    expect(result.converted).toBe(3);
    expect(result.fxDate).toBe("2000-01-01");
    const { subscriptions } = await analyzeTransactions(result.transactions, { apiOptions: mock });
    expect(subscriptions.map((sub) => sub.raw_name).sort()).toEqual(["Apple", "가상 AI 서비스", "넷플릭스", "카카오페이"]);
    const ai = subscriptions.find((sub) => sub.raw_name === "가상 AI 서비스")!;
    expect(ai).toMatchObject({ amount: 27000, interval: "monthly", needs_check: true }); // $20 × 모의 환율 1,350
    expect(foreignOrigin(ai, result.transactions)).toEqual({ currency: "USD", amount: 20, fxDate: "2000-01-01" });
    // 단발 결제(가상쇼핑몰 23,000원)는 구독이 아니에요.
    expect(subscriptions.some((sub) => sub.amount === 23000)).toBe(false);
  });

  it("환율을 못 받으면 외화 영수증은 예전처럼 건너뛰어요", async () => {
    const result = await importFromGmail({ mock: true, fx: null });
    expect(summarizeSkipped(result.skipped).foreign).toBe(3);
    expect(result.converted).toBe(0);
    expect(result.transactions.some((tx) => tx.original_currency)).toBe(false);
  });

  it("모의 모드는 Google·환율 서버에 접속하지 않아요", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await importFromGmail({ mock: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("클라이언트 ID가 없으면 not_configured", async () => {
    await expect(importFromGmail({ mock: false, clientId: "" })).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("직접 추가", () => {
  const catalog = loadCatalog();
  it("카탈로그 서비스를 고르면 이름·분류를 카탈로그에서 가져와요", () => {
    const sub = createManualSubscription({ name: "넷플릭스", amount: 13500, interval: "monthly", serviceId: "netflix" }, catalog, "m1");
    expect(sub).toMatchObject({ id: "m1", service_id: "netflix", display_name: "넷플릭스", category: "영상", interpret_source: "user",
      needs_check: false, user_confirmed: true, usage: null, monthly_amount: 13500 });
  });
  it("목록에 없는 서비스도 이름·금액·주기로 추가돼요 (연간은 월 환산)", () => {
    const sub = createManualSubscription({ name: "유튜브 프리미엄", amount: 120000, interval: "yearly", serviceId: null }, catalog, "m2");
    expect(sub).toMatchObject({ service_id: null, display_name: "유튜브 프리미엄", category: "기타", monthly_amount: 10000 });
  });
  it("금액이 0이거나 이름이 없으면 거부해요", () => {
    expect(() => createManualSubscription({ name: "x", amount: 0, interval: "monthly", serviceId: null }, catalog)).toThrow();
    expect(() => createManualSubscription({ name: " ", amount: 100, interval: "monthly", serviceId: null }, catalog)).toThrow();
  });
});
