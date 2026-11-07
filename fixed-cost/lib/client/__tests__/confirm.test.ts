import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../catalog";
import type { Subscription, Transaction } from "../../types";
import { acceptSuggestion, amountLine, applyEdit, checkNote, chooseService, formatForeign, nextBlocker, toSchoolEmail } from "../confirm";

const { services } = loadCatalog();
const sub = (patch: Partial<Subscription> = {}): Subscription => ({
  id: "s1", service_id: null, display_name: "카카오페이", category: "기타", raw_name: "카카오페이", amount: 6900, interval: "monthly",
  monthly_amount: 6900, next_date: null, usage: null, confidence: 0.8, interpret_source: "ai", needs_check: true, user_confirmed: false,
  evidence_transaction_ids: ["t1", "t2"], ...patch,
});
const profile = { school: "고려대학교", status: "재학" as const, school_email: true };

describe("다음 버튼", () => {
  it("사용 정도가 빈 개수를 알려 줘요", () => {
    expect(nextBlocker([sub(), sub({ id: "s2" }), sub({ id: "s3", usage: "often" })], profile)).toBe("2개 더 눌러 주세요");
  });
  it("프로필이 없으면 막혀요", () => {
    expect(nextBlocker([sub({ usage: "rarely" })], null)).toBe("학교·재학 정보를 골라 주세요");
  });
  it("모두 고르고 프로필이 있으면 통과", () => {
    expect(nextBlocker([sub({ usage: "rarely" })], profile)).toBeNull();
  });
  it("구독이 없으면 막혀요", () => {
    expect(nextBlocker([], profile)).not.toBeNull();
  });
  it("학교 이메일 '모르겠어요'는 false", () => {
    expect([toSchoolEmail("yes"), toSchoolEmail("no"), toSchoolEmail("unknown")]).toEqual([true, false, false]);
  });
});

describe("금액 표기", () => {
  it("연간은 월 환산을 같이 보여 줘요", () => {
    expect(amountLine({ amount: 50500, interval: "yearly", monthly_amount: 4208 })).toEqual({ main: "매년 50,500원", sub: "월 4,208원" });
    expect(amountLine({ amount: 13500, interval: "monthly", monthly_amount: 13500 })).toEqual({ main: "매달 13,500원", sub: null });
  });
  it("외화 표기", () => {
    expect([formatForeign("USD", 20), formatForeign("EUR", 9.99), formatForeign("JPY", 1500)]).toEqual(["$20", "€9.99", "¥1,500"]);
  });
});

describe("확인 필요 사유", () => {
  const context = { suggestedServiceId: null as string | null, services, transactions: [] as Transaction[] };
  it("확인이 필요 없으면 null", () => {
    expect(checkNote(sub({ needs_check: false }), context)).toBeNull();
  });
  it("AI 후보가 있으면 후보 서비스와 사유", () => {
    const note = checkNote(sub(), { ...context, suggestedServiceId: "kakao_emoticon_plus" });
    expect(note?.suggestion?.name).toBe("카카오톡 이모티콘 플러스");
    expect(note?.reason).toBe('결제 표기가 "카카오페이"뿐이라 금액과 주기로 추정했어요.');
  });
  it("후보가 없으면 찾지 못했다고 말해요", () => {
    expect(checkNote(sub({ interpret_source: "unknown" }), context)?.suggestion).toBeNull();
  });
  it("외화 환산이면 원래 금액과 환율 날짜", () => {
    const transactions: Transaction[] = [
      { id: "t1", date: "2026-08-01", amount: 27175, currency: "KRW", raw_name: "가상 AI", payment_method: "unknown", source: "gmail", original_currency: "USD", original_amount: 20, fx_date: "2026-11-06" },
    ];
    const note = checkNote(sub({ raw_name: "가상 AI", amount: 27175 }), { ...context, transactions });
    expect(note).toMatchObject({ foreign: "$20" });
    expect(note?.reason).toBe("$20를 11월 6일 환율로 바꾼 금액이에요. 카드 청구액과 다를 수 있어요.");
  });
});

describe("고치기", () => {
  const emoticon = services.find((service) => service.id === "kakao_emoticon_plus")!;
  it("서비스를 고르면 확정되고 출처는 직접 입력", () => {
    expect(chooseService(sub(), emoticon)).toMatchObject({ service_id: "kakao_emoticon_plus", display_name: "카카오톡 이모티콘 플러스", category: "메신저", interpret_source: "user", needs_check: false, user_confirmed: true });
  });
  it("AI 후보에 맞아요를 누르면 출처는 AI로 남고 사용자 확인 표시", () => {
    expect(acceptSuggestion(sub(), emoticon)).toMatchObject({ service_id: "kakao_emoticon_plus", interpret_source: "ai", user_confirmed: true, needs_check: false });
  });
  it("수정 시트: 금액·주기를 바꾸면 월 환산을 다시 계산해요", () => {
    expect(applyEdit(sub(), { name: "카카오페이", amount: 120000, interval: "yearly", serviceId: null }, services)).toMatchObject({ amount: 120000, interval: "yearly", monthly_amount: 10000, needs_check: false, user_confirmed: true });
  });
  it("수정 시트: 금액이 0이면 거부", () => {
    expect(() => applyEdit(sub(), { name: "x", amount: 0, interval: "monthly", serviceId: null }, services)).toThrow();
  });
});
