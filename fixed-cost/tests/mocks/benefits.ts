import { loadCatalog } from "../../lib/catalog";
import type { UserProfile } from "../../lib/types";
import mockData from "../../data/catalog/benefits.mock.json";

export const MOCK_TODAY = "2026-11-06";
export const mockUser: UserProfile = { school: "가상 테스트 학교", status: "재학", school_email: true };
export function mockBenefitsCatalog() {
  const catalog = loadCatalog();
  catalog.benefits = mockData.benefits.map((entry) => ({ ...entry,
    kind: entry.kind as "student_discount" | "school_license", checked_at: MOCK_TODAY,
    conditions: entry.id === "mock_unknown_price" ? "[MOCK] 가상 혜택은 2학년 이상 재학생만 적용해요." :
      entry.kind === "school_license" ? "[MOCK] 가상 테스트 학교의 재학생만 적용해요." : "[MOCK] 재학생만 적용해요.",
  }));
  return catalog;
}
export function mockDecision(eligible: "yes" | "no" | "unknown" = "yes", conditions = mockBenefitsCatalog().benefits[0].conditions) {
  return { eligible, quoted_conditions: eligible === "unknown" ? [] : [conditions],
    missing_info: eligible === "unknown" ? ["grade"] : [], reason: "[MOCK] 가상 판단" };
}

export function mockBundleCatalog() {
  const catalog = mockBenefitsCatalog();
  const service = catalog.services[0];
  catalog.bundles = [{ id: "mock_bundle", name: "[MOCK] 가상 묶음", includes: [{ service_id: service.id, plan_id: service.plans[0].id }],
    price_monthly: null, member_of: null, price_monthly_if_member: null, conditions: "[MOCK] 재학생만 적용해요.",
    is_partner: false, source_url: "https://example.invalid/mock/bundle", checked_at: MOCK_TODAY }];
  return catalog;
}
