import { describe, expect, it } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { buildSubscriptions, detectSubscriptionCandidates } from "../lib/rules";
import { sampleAdapter } from "../lib/adapters/sample";
import type { InterpretResult, SubscriptionCandidate } from "../lib/types";

const catalog = loadCatalog();
const cand = (patch: Partial<SubscriptionCandidate> = {}): SubscriptionCandidate => ({
  key: "넷플릭스|card|13500|monthly", raw_name: "넷플릭스", amount: 13500, interval: "monthly",
  payment_method: "card", transaction_ids: ["t1", "t2"], next_date: "2026-10-15", ...patch,
});
const result = (patch: Partial<InterpretResult> = {}): InterpretResult => ({
  key: "넷플릭스|card|13500|monthly", service_id: "netflix", category: "영상", confidence: 1,
  reason: "r", source: "catalog", needs_check: false, ...patch,
});

describe("buildSubscriptions", () => {
  it("카탈로그 확정 결과로 구독을 만들어요", () => {
    const [sub] = buildSubscriptions([cand()], [result()], catalog);
    expect(sub).toEqual({
      id: "넷플릭스|card|13500|monthly", service_id: "netflix", display_name: "넷플릭스", category: "영상",
      raw_name: "넷플릭스", amount: 13500, interval: "monthly", monthly_amount: 13500, next_date: "2026-10-15",
      usage: null, confidence: 1, interpret_source: "catalog", needs_check: false, user_confirmed: false,
      evidence_transaction_ids: ["t1", "t2"],
    });
  });

  it("연간 결제는 월 환산을 코드가 계산해요", () => {
    const key = "굿노트|apple|50500|yearly";
    const [sub] = buildSubscriptions(
      [cand({ key, raw_name: "굿노트", amount: 50500, interval: "yearly", payment_method: "apple" })],
      [result({ key, service_id: "goodnotes", category: "생산성" })], catalog);
    expect(sub.monthly_amount).toBe(Math.round(50500 / 12));
  });

  it("AI 추정(service_id null)은 확정하지 않고 표기 이름 + 확인 필요로 둬요", () => {
    const key = "카카오페이|kakaopay|6900|monthly";
    const [sub] = buildSubscriptions(
      [cand({ key, raw_name: "카카오페이", amount: 6900, payment_method: "kakaopay" })],
      [result({ key, service_id: null, category: "기타", confidence: 0.8, source: "ai", needs_check: true })], catalog);
    expect(sub).toMatchObject({ service_id: null, display_name: "카카오페이", category: "기타", interpret_source: "ai", needs_check: true, confidence: 0.8 });
  });

  it("해석 결과가 없거나 틀린 모양이면 unknown + 확인 필요", () => {
    const subs = buildSubscriptions([cand(), cand({ key: "b" })],
      [{ ...result({ key: "b" }), confidence: 5 } as InterpretResult], catalog);
    for (const sub of subs) expect(sub).toMatchObject({ service_id: null, interpret_source: "unknown", needs_check: true, confidence: 0 });
  });

  it("카탈로그에 없는 service_id는 믿지 않아요", () => {
    const [sub] = buildSubscriptions([cand()], [result({ service_id: "made_up_service" })], catalog);
    expect(sub).toMatchObject({ service_id: null, interpret_source: "unknown", needs_check: true, category: "기타" });
  });

  it("사용 정도는 자동으로 채우지 않고 같은 key는 한 번만", () => {
    const subs = buildSubscriptions([cand(), cand()], [result()], catalog);
    expect(subs).toHaveLength(1);
    expect(subs[0].usage).toBeNull();
  });

  it("샘플 페르소나 1을 탐지 → 구독까지 끝까지 만들 수 있어요", async () => {
    const txs = await sampleAdapter.load("persona-1");
    const cands = detectSubscriptionCandidates(txs, catalog);
    const subs = buildSubscriptions(cands, [], catalog);
    expect(subs).toHaveLength(cands.length);
    expect(subs.every((sub) => sub.needs_check && sub.usage === null)).toBe(true);
  });
});
