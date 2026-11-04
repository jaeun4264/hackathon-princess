import { expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import * as schemas from "../lib/schemas";
import type * as types from "../lib/types";
import mock from "../data/catalog/benefits.mock.json";

it("모든 스키마의 추론 타입이 계약 타입과 일치해요", () => {
  expectTypeOf<z.infer<typeof schemas.IntervalSchema>>().toEqualTypeOf<types.Interval>();
  expectTypeOf<z.infer<typeof schemas.UsageSchema>>().toEqualTypeOf<types.Usage>();
  expectTypeOf<z.infer<typeof schemas.GmailMessageLiteSchema>>().toEqualTypeOf<types.GmailMessageLite>();
  expectTypeOf<z.infer<typeof schemas.GmailParseResultSchema>>().toEqualTypeOf<types.GmailParseResult>();
  expectTypeOf<z.infer<typeof schemas.TransactionSchema>>().toEqualTypeOf<types.Transaction>();
  expectTypeOf<z.infer<typeof schemas.UserProfileSchema>>().toEqualTypeOf<types.UserProfile>();
  expectTypeOf<z.infer<typeof schemas.SubscriptionSchema>>().toEqualTypeOf<types.Subscription>();
  expectTypeOf<z.infer<typeof schemas.SubscriptionCandidateSchema>>().toEqualTypeOf<types.SubscriptionCandidate>();
  expectTypeOf<z.infer<typeof schemas.ServicePlanSchema>>().toEqualTypeOf<types.ServicePlan>();
  expectTypeOf<z.infer<typeof schemas.CatalogServiceSchema>>().toEqualTypeOf<types.CatalogService>();
  expectTypeOf<z.infer<typeof schemas.CatalogBenefitSchema>>().toEqualTypeOf<types.CatalogBenefit>();
  expectTypeOf<z.infer<typeof schemas.CatalogBundleSchema>>().toEqualTypeOf<types.CatalogBundle>();
  expectTypeOf<z.infer<typeof schemas.InterpretResultSchema>>().toEqualTypeOf<types.InterpretResult>();
  expectTypeOf<z.infer<typeof schemas.BenefitResultSchema>>().toEqualTypeOf<types.BenefitResult>();
  expectTypeOf<z.infer<typeof schemas.CatalogSchema>>().toEqualTypeOf<types.Catalog>();
  expectTypeOf<z.infer<typeof schemas.SuggestionTypeSchema>>().toEqualTypeOf<types.SuggestionType>();
  expectTypeOf<z.infer<typeof schemas.SuggestionSchema>>().toEqualTypeOf<types.Suggestion>();
});

it.each([null, 0, 1000])("정수 가격 또는 미확인 null을 허용해요: %s", (price) => {
  expect(schemas.ServicePlanSchema.safeParse({ id: "mock", name: "MOCK", price, interval: "monthly" }).success).toBe(true);
});

it.each(["1000", 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  "숫자 변환 없이 잘못된 가격을 거부해요: %s", (price) => {
    expect(schemas.ServicePlanSchema.safeParse({ id: "mock", name: "MOCK", price, interval: "monthly" }).success).toBe(false);
  },
);

it.each(["", "2026/11/04", "2026-02-29", "2026-04-31", "2026-13-01"])(
  "형식이 틀리거나 존재하지 않는 확인일을 거부해요: %s", (checked_at) => {
    expect(schemas.CatalogBenefitSchema.safeParse({ ...mock.benefits[0], checked_at }).success).toBe(false);
  },
);

it("윤년 날짜와 조건 원문의 공백·줄바꿈을 보존해요", () => {
  const conditions = "  [MOCK] 가상 재학생\n학교 인증 조건  ";
  const benefit = schemas.CatalogBenefitSchema.parse({ ...mock.benefits[0], conditions, checked_at: "2024-02-29" });
  expect(benefit.conditions).toBe(conditions);
});

it("계약에 없는 필드와 비웹 출처를 거부해요", () => {
  expect(schemas.CatalogBenefitSchema.safeParse({ ...mock.benefits[0], unexpected: true }).success).toBe(false);
  expect(schemas.CatalogBenefitSchema.safeParse({ ...mock.benefits[0], source_url: "javascript:void(0)" }).success).toBe(false);
});

it("확신도 범위를 확인해요", () => {
  const result = { key: "mock", service_id: null, category: "기타", confidence: 0, reason: "", source: "unknown", needs_check: true };
  expect(schemas.InterpretResultSchema.safeParse(result).success).toBe(true);
  expect(schemas.InterpretResultSchema.safeParse({ ...result, confidence: 1.01 }).success).toBe(false);
  expect(schemas.InterpretResultSchema.safeParse({ ...result, confidence: -0.01 }).success).toBe(false);
});

it("AI 검증 실패 시 unknown만 허용해요", () => {
  const result = {
    kind: "benefit", id: "mock", eligible: "unknown", quoted_conditions: [], missing_info: [],
    reason: "", source_url: "https://example.invalid/mock/benefit", checked_at: "2000-01-01", stale: true, validation: "ai_error",
  };
  expect(schemas.BenefitResultSchema.safeParse(result).success).toBe(true);
  expect(schemas.BenefitResultSchema.safeParse({ ...result, eligible: "yes" }).success).toBe(false);
});
