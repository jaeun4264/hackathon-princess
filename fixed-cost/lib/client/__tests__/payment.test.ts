import { describe, expect, it } from "vitest";
import type { Subscription, Transaction } from "../../types";
import { decodeSubscriptionId, evidencePayments, paymentAmount, reasonText, statementLine } from "../payment";

const tx = (id: string, date: string, patch: Partial<Transaction> = {}): Transaction => ({
  id, date, amount: 6900, currency: "KRW", raw_name: "카카오페이", payment_method: "kakaopay", source: "sample", ...patch,
});
const sub = (patch: Partial<Subscription> = {}): Subscription => ({
  id: "카카오페이|kakaopay|6900|monthly", service_id: null, display_name: "카카오페이", category: "기타", raw_name: "카카오페이", amount: 6900,
  interval: "monthly", monthly_amount: 6900, next_date: null, usage: "rarely", confidence: 0.8, interpret_source: "ai", needs_check: true,
  user_confirmed: false, evidence_transaction_ids: ["t1", "t2", "t3"], ...patch,
});
const txs = [tx("t1", "2026-07-03"), tx("t3", "2026-09-03"), tx("t2", "2026-08-03"), tx("other", "2026-09-10")];

describe("결제 상세", () => {
  it("표기 그대로 + 마지막 결제일", () => {
    expect(statementLine(sub(), txs)).toBe("카카오페이 · 6,900원 · 매달 3일");
    expect(statementLine(sub({ interval: "yearly", amount: 50500 }), txs)).toBe("카카오페이 · 50,500원 · 매년 9월 3일");
    expect(statementLine(sub({ evidence_transaction_ids: [] }), txs)).toBe("카카오페이 · 6,900원 · 매달");
  });
  it("이어진 결제만, 최근 것이 위", () => {
    expect(evidencePayments(sub(), txs).map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
  });
  it("외화 결제는 원래 금액도", () => {
    expect(paymentAmount(tx("f", "2026-09-01", { amount: 27175, original_currency: "USD", original_amount: 20, fx_date: "2026-11-06" })))
      .toEqual({ main: "27,175원", foreign: "$20 환산" });
  });
  it("근거: 없으면 지어내지 않고 '찾지 못했어요'", () => {
    expect(reasonText(sub({ interpret_source: "unknown" }), undefined)).toBe("근거를 찾지 못했어요.");
    expect(reasonText(sub(), "카카오페이로 6,900원")).toBe("카카오페이로 6,900원");
    expect(reasonText(sub({ interpret_source: "user" }), "무엇이든")).toBe("직접 고른 서비스예요.");
    expect(reasonText(sub({ user_confirmed: true }), "금액으로 추정했어요.")).toBe("금액으로 추정했어요. 이후 직접 확인했어요.");
  });
  it("URL의 구독 id를 풀어요 (잘못된 인코딩도 안전)", () => {
    expect(decodeSubscriptionId(encodeURIComponent("넷플릭스|card|13500|monthly"))).toBe("넷플릭스|card|13500|monthly");
    expect(decodeSubscriptionId("%E0%A4%A")).toBe("%E0%A4%A");
    expect(decodeSubscriptionId(undefined)).toBe("");
  });
});
