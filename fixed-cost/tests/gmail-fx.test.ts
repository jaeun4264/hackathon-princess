import { describe, expect, it } from "vitest";
import { parseGmailMessages, type FxRates } from "../lib/adapters/gmail";
import { loadCatalog } from "../lib/catalog";
import { TransactionSchema } from "../lib/schemas";
import type { GmailMessageLite } from "../lib/types";

// 외화 영수증 환산 (F2 [계약]: Transaction.original_currency·original_amount·fx_date). 가짜 메일만 써요.
const catalog = loadCatalog();
const fx: FxRates = { date: "2026-11-06", krwPer: { USD: 1358.73, EUR: 1517.01, JPY: 8.58, GBP: 1818.65 } };
const mail = (id: string, text: string): GmailMessageLite => ({
  id, received_at: "2026-09-01T09:00:00Z", from_name: "가상 서비스", from_domain: "mock.example.invalid", subject: "[MOCK] receipt", text,
});

describe("Gmail 외화 영수증", () => {
  it("환율이 없으면 예전처럼 foreign_currency로 건너뛰어요", () => {
    const result = parseGmailMessages([mail("a", "Total USD $20.00")], catalog);
    expect(result.transactions).toEqual([]);
    expect(result.skipped).toEqual([{ message_id: "a", reason: "foreign_currency" }]);
  });

  it.each([
    ["Total USD $20.00", "USD", 20, 27175],
    ["Amount: 20.00 USD", "USD", 20, 27175],
    ["Gesamt 9,99 €", "EUR", 9.99, 15155],
    ["合計 ¥1,500", "JPY", 1500, 12870],
    ["Total £8.99", "GBP", 8.99, 16350],
  ])("%s → 원화로 환산하고 원래 금액을 남겨요", (text, currency, original, won) => {
    const [tx] = parseGmailMessages([mail("a", text)], catalog, { fx }).transactions;
    expect(tx).toMatchObject({ amount: won, currency: "KRW", original_currency: currency, original_amount: original, fx_date: "2026-11-06", source: "gmail" });
    expect(TransactionSchema.safeParse(tx).success).toBe(true);
  });

  it("외화 금액이 여러 개거나 통화가 섞이면 추측하지 않고 건너뛰어요", () => {
    const result = parseGmailMessages([mail("a", "Subtotal $18.00 Tax $2.00"), mail("b", "$20 or €18")], catalog, { fx });
    expect(result.transactions).toEqual([]);
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["foreign_currency", "foreign_currency"]);
  });

  it("그 통화의 환율이 없으면 건너뛰어요", () => {
    const result = parseGmailMessages([mail("a", "Total $20.00")], catalog, { fx: { date: "2026-11-06", krwPer: { EUR: 1500 } } });
    expect(result.skipped).toEqual([{ message_id: "a", reason: "foreign_currency" }]);
  });

  it("원화가 함께 적혀 있으면 원화를 써요 (환산하지 않음)", () => {
    const [tx] = parseGmailMessages([mail("a", "결제 금액 27,000원 (USD $20.00)")], catalog, { fx }).transactions;
    expect(tx.amount).toBe(27000);
    expect(tx.original_currency).toBeUndefined();
  });

  it("환산 정보는 세 필드가 함께 있어야 해요 (스키마)", () => {
    const base = { id: "x", date: "2026-09-01", amount: 27175, currency: "KRW", raw_name: "가상", payment_method: "unknown", source: "gmail" };
    expect(TransactionSchema.safeParse({ ...base, original_currency: "USD" }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...base, original_currency: "USD", original_amount: 20, fx_date: "2026-11-06" }).success).toBe(true);
  });
});
