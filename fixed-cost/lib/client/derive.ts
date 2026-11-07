// S2 홈 숫자 계산 (화면에서 직접 더하지 않게 여기 둬요). 모두 순수 함수예요.
import type { BenefitResult, Catalog, Subscription, Suggestion, UserProfile } from "../types";

const SAVING_TYPES = new Set<Suggestion["type"]>(["cancel", "student_discount", "school_license", "bundle"]);

/**
 * 아낄 수 있는 금액: 해지·학생 할인·학교 라이선스·묶음 제안의 절약액 합.
 * 같은 구독에 제안이 둘 이상이면 큰 쪽 하나만 세요 (절약액 큰 순으로 고르고, 이미 쓴 구독이 들어간 제안은 건너뜀).
 */
export function savingsTotal(suggestions: Suggestion[]): { monthly: number; yearly: number; counted: Suggestion[] } {
  const sorted = suggestions
    .filter((entry) => SAVING_TYPES.has(entry.type) && entry.saving_monthly > 0)
    .sort((a, b) => b.saving_monthly - a.saving_monthly || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const counted: Suggestion[] = [];
  for (const entry of sorted) {
    if (entry.subscription_ids.some((id) => used.has(id))) continue;
    entry.subscription_ids.forEach((id) => used.add(id));
    counted.push(entry);
  }
  const monthly = counted.reduce((sum, entry) => sum + entry.saving_monthly, 0);
  return { monthly, yearly: monthly * 12, counted };
}

/** 제안 목록: 절약액 큰 순 그대로 (제휴라서 올리지 않아요). 유지(keep)는 뒤로. */
export function rankedSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => b.saving_monthly - a.saving_monthly || a.id.localeCompare(b.id));
}

/** 사용자가 서비스를 확인하지 않아 제안에서 빠진 구독 (규칙은 확인된 구독만 제안해요). */
export function unconfirmedSubscriptions(subs: Subscription[]): Subscription[] {
  return subs.filter((sub) => sub.service_id === null || sub.needs_check || !(sub.interpret_source === "catalog" || sub.user_confirmed));
}

/**
 * 익명 집계 found_count (FRONTEND.md 4부 7절의 가정):
 * 거의 안 씀으로 표시한 구독 수 + 판정이 yes인 혜택·묶음 수.
 */
export function foundCount(subs: Subscription[], benefitResults: BenefitResult[]): number {
  return subs.filter((sub) => sub.usage === "rarely").length + benefitResults.filter((entry) => entry.eligible === "yes").length;
}

/**
 * 혜택 판정(T2)에 보낼 대상: 확인된 구독 서비스의 학생 할인, 그리고 학교 라이선스는 프로필 학교와 같은 것만.
 */
export function benefitTargets(subs: Subscription[], profile: UserProfile | null, catalog: Catalog): { kind: "benefit"; id: string }[] {
  if (!profile) return [];
  const services = new Set(subs.filter((sub) => sub.service_id && !sub.needs_check).map((sub) => sub.service_id as string));
  return catalog.benefits
    .filter((benefit) => services.has(benefit.service_id) && (benefit.kind === "student_discount" || benefit.school === profile.school))
    .map((benefit) => ({ kind: "benefit" as const, id: benefit.id }));
}

/** 사용 정도별 월 금액 막대의 조각 (0원 조각은 빼요). */
export function usageSegments(summary: { often_monthly: number; sometimes_monthly: number; rarely_monthly: number; total_monthly: number }) {
  const parts = [
    { usage: "often" as const, amount: summary.often_monthly },
    { usage: "sometimes" as const, amount: summary.sometimes_monthly },
    { usage: "rarely" as const, amount: summary.rarely_monthly },
  ];
  return parts.filter((part) => part.amount > 0).map((part) => ({ ...part, ratio: summary.total_monthly > 0 ? part.amount / summary.total_monthly : 0 }));
}
