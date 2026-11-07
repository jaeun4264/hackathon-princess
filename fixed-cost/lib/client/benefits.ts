// S4 혜택 찾기 규칙. 모두 순수 함수예요.
import type { BenefitResult, Catalog, CatalogBenefit, Subscription, UserProfile } from "../types";

/**
 * 이 서비스의 혜택 전부. 다른 학교 라이선스도 보여 주고, 학교 조건은 판정(T2)이 읽어서 "어려워요"로 알려 줘요.
 * (홈 제안의 "내 학교 것만" 규칙은 derive.benefitTargets에 있어요.) 내 학교 라이선스를 위로.
 */
export function benefitsForService(serviceId: string, catalog: Catalog, profile: UserProfile | null): CatalogBenefit[] {
  const mine = (benefit: CatalogBenefit) => (benefit.kind === "school_license" && profile && benefit.school === profile.school ? 0 : 1);
  return catalog.benefits.filter((benefit) => benefit.service_id === serviceId).sort((a, b) => mine(a) - mine(b));
}

/** "내 구독" 칩: 확인된 구독 서비스 (중복 없이, 카탈로그에 있는 것만). */
export function myServiceIds(subs: Subscription[], catalog: Catalog): string[] {
  const known = new Set(catalog.services.map((service) => service.id));
  return [...new Set(subs.map((sub) => sub.service_id).filter((id): id is string => id !== null && known.has(id)))];
}

export type Verdict = "yes" | "no" | "unknown" | "unverified";

/** 판정 표기. AI 검증이 실패했거나 결과가 없으면 'unverified' (받을 수 있다고 보여 주지 않아요). */
export function verdictOf(result: BenefitResult | undefined): Verdict {
  if (!result || result.validation !== "ok") return "unverified";
  return result.eligible;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: "받을 수 있어요",
  no: "어려워요",
  unknown: "확인이 더 필요해요",
  unverified: "AI가 확인하지 못했어요",
};

export const KIND_LABEL: Record<CatalogBenefit["kind"], string> = { student_discount: "학생 할인", school_license: "학교 라이선스" };

export type MissingField = BenefitResult["missing_info"][number];

/** 카드 안에서 바로 물을 수 있는 질문 (school_email·status·school). grade·other는 공식 페이지 안내. */
export function questionFor(field: MissingField): { field: "school_email" | "status" | "school"; text: string } | null {
  if (field === "school_email") return { field, text: "학교 이메일로 인증할 수 있나요?" };
  if (field === "status") return { field, text: "지금 재학 상태가 어떻게 되나요?" };
  if (field === "school") return { field, text: "어느 학교에 다니나요?" };
  return null;
}

/** 아직 판정하지 않은 혜택만 골라요 (이미 판정한 건 다시 묻지 않아요 = 캐시). */
export function needsJudgement(benefits: CatalogBenefit[], results: BenefitResult[]): CatalogBenefit[] {
  const judged = new Set(results.filter((entry) => entry.kind === "benefit").map((entry) => entry.id));
  return benefits.filter((benefit) => !judged.has(benefit.id));
}
