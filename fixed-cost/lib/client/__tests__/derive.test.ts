import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../catalog";
import { summarize } from "../../rules";
import type { Catalog, Subscription, Suggestion } from "../../types";
import { benefitTargets, foundCount, savingsTotal, unconfirmedSubscriptions, usageSegments } from "../derive";

const sub = (id: string, amount: number, usage: Subscription["usage"], patch: Partial<Subscription> = {}): Subscription => ({
  id, service_id: id, display_name: id, category: "영상", raw_name: id, amount, interval: "monthly", monthly_amount: amount,
  next_date: null, usage, confidence: 1, interpret_source: "catalog", needs_check: false, user_confirmed: false, evidence_transaction_ids: [], ...patch,
});
const suggestion = (id: string, type: Suggestion["type"], saving: number, subIds: string[]): Suggestion => ({
  id, type, subscription_ids: subIds, saving_monthly: saving, saving_yearly: saving * 12, message: "", message_source: "fallback",
  source_url: null, checked_at: null, stale: false, is_partner: false, cancel_url: null, action_status: "none", keep_reason: null,
});

describe("재은 사례 (기준 테스트)", () => {
  // 넷플릭스 13,500 · 티빙 9,500 · 아이클라우드 1,100이 거의 안 씀 → 24,100원
  const subs = [
    sub("netflix", 13500, "rarely"), sub("tving", 9500, "rarely"), sub("icloud", 1100, "rarely"),
    sub("daglo", 14900, "often"), sub("emoticon", 6900, "often"),
  ];
  it("거의 안 쓰는 구독 합계 24,100원, 연 289,200원", () => {
    const summary = summarize(subs);
    expect(summary.rarely_monthly).toBe(24100);
    expect(summary.rarely_monthly * 12).toBe(289200);
  });
  it("사용 정도 막대 조각은 0원을 빼고 비율 합이 1", () => {
    const segments = usageSegments(summarize(subs));
    expect(segments.map((s) => s.usage)).toEqual(["often", "rarely"]);
    expect(segments.reduce((sum, s) => sum + s.ratio, 0)).toBeCloseTo(1);
  });
});

describe("아낄 수 있는 금액", () => {
  it("해지·학생 할인·학교 라이선스·묶음의 합, 유지·쉬기는 빼요", () => {
    const result = savingsTotal([
      suggestion("a", "cancel", 13500, ["netflix"]), suggestion("b", "student_discount", 5000, ["daglo"]),
      suggestion("c", "keep", 0, ["emoticon"]), suggestion("d", "pause", 9500, ["tving"]),
    ]);
    expect(result).toMatchObject({ monthly: 18500, yearly: 222000 });
  });
  it("같은 구독에 제안이 둘이면 큰 쪽 하나만", () => {
    const result = savingsTotal([
      suggestion("a", "cancel", 13500, ["netflix"]), suggestion("b", "bundle", 2100, ["netflix"]),
    ]);
    expect(result.monthly).toBe(13500);
    expect(result.counted.map((s) => s.id)).toEqual(["a"]);
  });
  it("묶음이 여러 구독에 걸치면 그 구독들은 다시 세지 않아요", () => {
    const result = savingsTotal([
      suggestion("bundle", "bundle", 7000, ["netflix", "naver"]), suggestion("x", "cancel", 4900, ["naver"]), suggestion("y", "cancel", 1100, ["icloud"]),
    ]);
    expect(result.monthly).toBe(8100);
  });
  it("제안이 없으면 0", () => {
    expect(savingsTotal([]).monthly).toBe(0);
  });
});

describe("그 밖의 계산", () => {
  it("확인 안 된 구독을 골라내요", () => {
    const subs = [sub("a", 1, "rarely"), sub("b", 1, "rarely", { service_id: null, needs_check: true, interpret_source: "ai" }),
      sub("c", 1, "often", { interpret_source: "ai", user_confirmed: true })];
    expect(unconfirmedSubscriptions(subs).map((s) => s.id)).toEqual(["b"]);
  });
  it("found_count = 거의 안 씀 구독 + yes 판정 수", () => {
    const yes = { kind: "benefit" as const, id: "x", eligible: "yes" as const, quoted_conditions: ["q"], missing_info: [], reason: "", source_url: "https://e.x", checked_at: "2026-11-01", stale: false, validation: "ok" as const };
    expect(foundCount([sub("a", 1, "rarely"), sub("b", 1, "often")], [yes, { ...yes, id: "y", eligible: "no" }])).toBe(2);
  });
  it("혜택 판정 대상: 확인된 서비스의 학생 할인 + 같은 학교 라이선스만", () => {
    const catalog: Catalog = { ...loadCatalog(), benefits: [
      { id: "d1", service_id: "netflix", kind: "student_discount", school: null, conditions: "c", benefit_text: "t", price_after_monthly: 1, source_url: "https://e.x", checked_at: "2026-11-01" },
      { id: "l1", service_id: "netflix", kind: "school_license", school: "고려대학교", conditions: "c", benefit_text: "t", price_after_monthly: 0, source_url: "https://e.x", checked_at: "2026-11-01" },
      { id: "l2", service_id: "netflix", kind: "school_license", school: "이화여자대학교", conditions: "c", benefit_text: "t", price_after_monthly: 0, source_url: "https://e.x", checked_at: "2026-11-01" },
      { id: "d2", service_id: "daglo", kind: "student_discount", school: null, conditions: "c", benefit_text: "t", price_after_monthly: 1, source_url: "https://e.x", checked_at: "2026-11-01" },
    ] };
    const subs = [sub("netflix", 13500, "often"), sub("daglo", 14900, "often", { needs_check: true })];
    expect(benefitTargets(subs, { school: "고려대학교", status: "재학", school_email: true }, catalog).map((t) => t.id)).toEqual(["d1", "l1"]);
    expect(benefitTargets(subs, null, catalog)).toEqual([]);
  });
});
