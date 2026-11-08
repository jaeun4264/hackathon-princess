import { describe, expect, it } from "vitest";
import { buildGmailQuery, parseGmailMessages } from "../lib/adapters/gmail";
import { parseStoreReceipt, storeOf } from "../lib/adapters/store-receipts";
import { amountLine, trialLine } from "../lib/client/confirm";
import { buildSubscriptions, detectSubscriptionCandidates } from "../lib/rules";
import { InterpretRequestSchema, matchAlias } from "../lib/rules/interpret";
import { TransactionSchema } from "../lib/schemas";
import { loadCatalog } from "../lib/catalog";
import type { GmailMessageLite } from "../lib/types";

// 실제 영수증(2026-11-08 확인)을 앱과 같은 방식(stripHtml / text/plain)으로 바꾼 텍스트의 줄 구조를 그대로 두고,
// 이름·주소·이메일·주문번호는 가상 값으로 바꿨어요.
const APPLE_SUBSCRIPTION = [
  "영수증", "2026년 10월 1일", "주문 ID:", "MOCKORDER01", "문서:", "MOCKDOC0001", "Apple 계정:", "user@example.invalid",
  "Instagram Plus", "Instagram Plus(월간)", "Instagram, Inc.", "2026년 11월 2일에 갱신 예정", "₩3,299", "₩300의 부가가치세(VAT) 포함",
  "청구 및 지불", "가상 이름", "대한민국", "가상시 가상구", "가상로 1", "00000", "토스페이", "₩3,299",
  "구독 및 구입 관련 지원 받기", "구독 관리 ›", "사업자등록번호: 000-00-00000",
].join("\n");

const APPLE_TWO_SUBSCRIPTIONS = APPLE_SUBSCRIPTION.replace("₩300의 부가가치세(VAT) 포함\n",
  "₩300의 부가가치세(VAT) 포함\n가상 노트\n가상 노트 프로(연간)\nMock Dev Inc.\n2027년 1월 5일에 갱신 예정\n₩39,000\n₩3,545의 부가가치세(VAT) 포함\n");

const APPLE_IN_APP = [
  "영수증", "2026년 11월 3일", "주문 ID:", "MOCKORDER02", "Apple 계정:", "user@example.invalid",
  "가상 웹툰 - Mock Webtoon", "₩3,600", "쿠키 30개", "Mock Webtoon Ltd.", "사업자등록번호: 000-00-00000", "앱 내 구입",
  "청구 및 지불", "가상 이름", "대한민국", "토스페이", "₩3,600",
].join("\n");

const GOOGLE_PLAY_TRIAL = `Google Play


감사합니다.


Google Play에서 Google Digital Inc.의 무료 체험 구독을 신청하셨습니다. 무료
체험은 2027. 10. 16.에 종료됩니다. 유료 전환일 이전에 취소되지 않는 한,
무료 체험이 끝난 후 (현재 매월 ₩7,500)의 정기 구독 요금이 자동 청구됩니다.


주문 번호: MOCK.0000-0000
내 계정: user@example.invalid


상품 가격


Google AI Plus (400 GB) (Google One) (개발자: Google LLC) ₩0

자동 갱신되는 정기 결제



합계: ₩0

(VAT ₩0 포함)


결제 방법:

Toss: 가상*`;

const GOOGLE_PLAY_PAID = GOOGLE_PLAY_TRIAL
  .replace(/Google Play에서[\s\S]*?청구됩니다\.\s*\n/u, "")
  .replace("₩0\n\n자동", "₩7,500\n\n자동")
  .replace("합계: ₩0", "합계: ₩7,500");

const GOOGLE_PLAY_WRAPPED = GOOGLE_PLAY_PAID.replace("Google AI Plus (400 GB) (Google One) (개발자: Google LLC) ₩7,500",
  "Google AI Plus (400 GB) (Google One) (개발자: Google  \nLLC) ₩7,500");

function mail(overrides: Partial<GmailMessageLite>): GmailMessageLite {
  return { id: "m1", received_at: "2026-10-01T03:00:00Z", from_name: "Apple", from_domain: "email.apple.com", subject: "Apple에서 발행한 영수증입니다.", text: APPLE_SUBSCRIPTION, ...overrides };
}
const play = (text: string, id = "p1") => mail({ id, from_name: "Google Play", from_domain: "google.com", subject: "Google Play 주문 영수증", text });

describe("앱 마켓 영수증", () => {
  it("발신 주소로 Apple·Google Play를 구분하고 다른 구글 메일은 마켓으로 보지 않아요", () => {
    expect(storeOf({ from_name: "Apple", from_domain: "email.apple.com" })).toBe("apple");
    expect(storeOf({ from_name: "Google Play", from_domain: "google.com" })).toBe("google_play");
    expect(storeOf({ from_name: "Google", from_domain: "google.com" })).toBeNull();
    expect(storeOf({ from_name: "Apple", from_domain: "email.apple.com.attacker.invalid" })).toBeNull();
  });

  it("Apple 구독 영수증은 발신자 'Apple'이 아니라 항목의 서비스명과 금액으로 결제를 만들어요", () => {
    const result = parseGmailMessages([mail({})], loadCatalog());
    expect(result.skipped).toEqual([]);
    expect(result.transactions).toEqual([{
      id: "gmail:m1", date: "2026-10-01", amount: 3299, currency: "KRW", raw_name: "Instagram Plus", payment_method: "apple", source: "gmail",
      renewal: { interval: "monthly", next_date: "2026-11-02", trial_end: null, price_after_trial: null },
    }]);
  });

  it("Apple 요금제에 주기가 없으면 interval은 null이에요 (추측하지 않아요)", () => {
    const items = parseStoreReceipt("apple", APPLE_SUBSCRIPTION.replace("Instagram Plus(월간)", "Instagram Plus"));
    expect(items?.[0].renewal).toEqual({ interval: null, next_date: "2026-11-02", trial_end: null, price_after_trial: null });
  });

  it("Apple 영수증에 구독이 여러 개면 항목마다 결제 한 줄이에요", () => {
    const { transactions } = parseGmailMessages([mail({ text: APPLE_TWO_SUBSCRIPTIONS })], loadCatalog());
    expect(transactions.map((t) => [t.id, t.raw_name, t.amount, t.renewal?.interval, t.renewal?.next_date])).toEqual([
      ["gmail:m1:1", "Instagram Plus", 3299, "monthly", "2026-11-02"], ["gmail:m1:2", "가상 노트", 39000, "yearly", "2027-01-05"]]);
  });

  it("청구 및 지불 아래의 이름·주소와 계정 이메일은 서비스명에 들어가지 않아요", () => {
    const { transactions } = parseGmailMessages([mail({ text: APPLE_TWO_SUBSCRIPTIONS })], loadCatalog());
    const serialized = JSON.stringify(transactions);
    for (const secret of ["가상 이름", "가상로", "user@example.invalid", "MOCKORDER01", "토스페이"]) expect(serialized).not.toContain(secret);
  });

  it("Apple 앱 내 구입(단건)은 구독 후보에서 빼요", () => {
    const result = parseGmailMessages([mail({ text: APPLE_IN_APP })], loadCatalog());
    expect(result.transactions).toEqual([]);
    expect(result.skipped).toEqual([{ message_id: "m1", reason: "one_time" }]);
  });

  it("Google Play 무료 체험은 0원 결제 + 종료일·이후 금액·주기를 영수증 그대로 담아요", () => {
    const result = parseGmailMessages([play(GOOGLE_PLAY_TRIAL)], loadCatalog());
    expect(result.skipped).toEqual([]);
    expect(result.transactions).toEqual([{
      id: "gmail:p1", date: "2026-10-01", amount: 0, currency: "KRW", raw_name: "Google AI Plus (400 GB) (Google One)", payment_method: "google_play", source: "gmail",
      renewal: { interval: "monthly", next_date: null, trial_end: "2027-10-16", price_after_trial: 7500 },
    }]);
  });

  it("무료 체험 안내 문장이 없으면 종료일·이후 금액을 비워 둬요", () => {
    const noIntro = GOOGLE_PLAY_TRIAL.replace(/유료 전환일[\s\S]*?청구됩니다\./u, "").replace("2027. 10. 16.에 종료됩니다.", "");
    const items = parseStoreReceipt("google_play", noIntro);
    expect(items?.[0]).toMatchObject({ kind: "free_trial", renewal: { interval: null, trial_end: null, price_after_trial: null } });
  });

  it("Google Play 유료 구독은 상품명·금액·google_play로 결제를 만들고, 줄바꿈된 항목도 읽어요", () => {
    for (const text of [GOOGLE_PLAY_PAID, GOOGLE_PLAY_WRAPPED]) {
      const { transactions } = parseGmailMessages([play(text)], loadCatalog());
      expect(transactions.map((t) => [t.raw_name, t.amount, t.payment_method])).toEqual([["Google AI Plus (400 GB) (Google One)", 7500, "google_play"]]);
    }
  });

  it("형식을 알 수 없는 마켓 메일은 추측하지 않고 기존 일반 처리로 넘겨요", () => {
    expect(parseStoreReceipt("apple", "영수증\n합계 ₩1,100")).toBeNull();
    expect(parseStoreReceipt("google_play", "Google Play\n합계: ₩1,100")).toBeNull();
    // 갱신 예정 줄은 있는데 앞의 서비스명 구조가 다르면 null
    expect(parseStoreReceipt("apple", "Apple 계정:\n2026년 11월 2일에 갱신 예정\n₩3,299\n청구 및 지불")).toBeNull();
    const fallback = parseGmailMessages([mail({ text: "영수증\n합계 ₩1,100" })], loadCatalog());
    expect(fallback.transactions[0]).toMatchObject({ raw_name: "Apple", amount: 1100 });
  });

  it("서비스명 후보가 메일 주소·금액이면 받지 않아요", () => {
    const leaked = APPLE_SUBSCRIPTION.replace("Instagram Plus\nInstagram Plus(월간)", "₩3,299\nInstagram Plus(월간)");
    expect(parseStoreReceipt("apple", leaked)).toBeNull();
  });

  it("검색어에 마켓 발신 주소를 정확한 주소로 넣어요 (google.com 전체가 아니에요)", () => {
    const query = buildGmailQuery(loadCatalog());
    expect(query).toContain("from:no_reply@email.apple.com");
    expect(query).toContain("from:googleplay-noreply@google.com");
    expect(query).not.toMatch(/from:google\.com\b/u);
  });
});

describe("앱 마켓 영수증 → 구독 후보·화면 (2단계)", () => {
  const catalog = loadCatalog();
  const parse = (messages: GmailMessageLite[]) => parseGmailMessages(messages, catalog).transactions;

  it("자동 갱신이 적힌 영수증은 한 통뿐이어도 구독 후보가 되고, 다음 결제일은 영수증의 갱신일이에요", () => {
    const [candidate] = detectSubscriptionCandidates(parse([mail({})]), catalog);
    expect(candidate).toMatchObject({ raw_name: "Instagram Plus", amount: 3299, interval: "monthly", payment_method: "apple", next_date: "2026-11-02" });
    expect(candidate.trial).toBeUndefined();
  });

  it("renewal이 없는 일반 결제 한 건은 예전처럼 후보가 아니에요", () => {
    const plain = TransactionSchema.parse({ id: "x", date: "2026-10-01", amount: 3299, currency: "KRW", raw_name: "가상 서비스", payment_method: "card", source: "sample" });
    expect(detectSubscriptionCandidates([plain], catalog)).toEqual([]);
  });

  it("주기를 알 수 없는 마켓 구독 한 건은 추측하지 않고 후보에서 빼요", () => {
    expect(detectSubscriptionCandidates(parse([play(GOOGLE_PLAY_PAID)]), catalog)).toEqual([]);
  });

  it("무료 체험은 0원 후보 + trial(종료일·이후 금액), 다음 결제일은 체험 종료일이에요", () => {
    const [candidate] = detectSubscriptionCandidates(parse([play(GOOGLE_PLAY_TRIAL)]), catalog);
    expect(candidate).toMatchObject({ amount: 0, interval: "monthly", next_date: "2027-10-16", trial: { end: "2027-10-16", price_after: 7500 } });
  });

  it("체험 뒤 같은 서비스가 유료로 결제되면 지난 무료 체험 후보는 사라져요", () => {
    const trial = parse([play(GOOGLE_PLAY_TRIAL)]);
    const paid = [1, 2].map((month) => TransactionSchema.parse({ ...trial[0], id: `paid-${month}`, date: `2027-1${month}-16`, amount: 7500, renewal: undefined }));
    const result = detectSubscriptionCandidates([...trial, ...paid], catalog);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amount: 7500, interval: "monthly" });
    expect(result[0].trial).toBeUndefined();
  });

  it("구독 목록에서도 trial이 이어지고, 카탈로그 별칭으로 Google AI Plus로 확정돼요", () => {
    const candidates = detectSubscriptionCandidates(parse([play(GOOGLE_PLAY_TRIAL)]), catalog);
    const interpreted = candidates.map((cand) => {
      const [service] = matchAlias(cand.raw_name, catalog);
      return { key: cand.key, service_id: service.id, category: service.category, confidence: 1, reason: "별칭", source: "catalog" as const, needs_check: false };
    });
    const [sub] = buildSubscriptions(candidates, interpreted, catalog);
    expect(sub).toMatchObject({ service_id: "google_ai_plus", amount: 0, monthly_amount: 0, trial: { end: "2027-10-16", price_after: 7500 } });
  });

  it("무료 체험 화면 문구: 진행 중이면 첫 결제일과 금액, 지났으면 해지 확인을 부탁해요", () => {
    const sub = { interval: "monthly" as const, trial: { end: "2027-10-16", price_after: 7500 } };
    expect(trialLine(sub, "2026-11-08")).toEqual({ title: "무료 체험 중이에요", detail: "2027년 10월 16일부터 매달 7,500원이 자동으로 나가요. 안 쓸 거라면 그 전에 해지하세요.", ended: false });
    expect(trialLine({ ...sub, trial: { ...sub.trial, price_after: null } }, "2026-11-08")?.detail).toContain("유료로 바뀌어요");
    expect(trialLine(sub, "2027-10-17")?.ended).toBe(true);
    expect(trialLine({ interval: "monthly", trial: undefined }, "2026-11-08")).toBeNull();
    expect(amountLine({ amount: 0, interval: "monthly", monthly_amount: 0, trial: sub.trial })).toEqual({ main: "무료 체험", sub: "이후 매달 7,500원" });
  });

  it("마켓 영수증 정보(renewal)는 서버로 보내는 해석 요청 필드에 들어가지 않아요", () => {
    const [candidate] = detectSubscriptionCandidates(parse([play(GOOGLE_PLAY_TRIAL)]), catalog);
    const request = InterpretRequestSchema.parse({ items: [{ key: candidate.key, raw_name: candidate.raw_name, amount: candidate.amount, interval: candidate.interval, payment_method: candidate.payment_method }] });
    expect(JSON.stringify(request)).not.toMatch(/trial|renewal|2027-10-16/u);
  });
});
