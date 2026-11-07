import { z } from "zod";

// 원문 조건은 공백까지 보존하고, 빈 문자열인지만 검사해요.
const requiredText = z.string().refine((value) => value.trim().length > 0, "빈 값은 사용할 수 없어요");
const money = z.int().nonnegative();
const date = z.iso.date();
const webUrl = z.url({ protocol: /^https?$/ });

export const IntervalSchema = z.enum(["monthly", "yearly"]);
export const UsageSchema = z.enum(["often", "sometimes", "rarely"]);
export const SuggestionTypeSchema = z.enum([
  "cancel", "pause", "student_discount", "school_license", "bundle", "keep",
]);

export const GmailMessageLiteSchema = z.strictObject({
  id: requiredText,
  received_at: z.iso.datetime({ offset: true }),
  from_name: z.string(),
  from_domain: requiredText,
  subject: z.string(),
  text: z.string().max(20_000),
});

export const TransactionSchema = z.strictObject({
  id: requiredText,
  date,
  amount: money,
  currency: z.literal("KRW"),
  raw_name: requiredText,
  payment_method: requiredText,
  source: z.enum(["sample", "csv", "gmail", "manual"]),
  // 외화 영수증을 환산했을 때만, 세 필드가 함께 있어요.
  original_currency: z.enum(["USD", "EUR", "JPY", "GBP"]).optional(),
  original_amount: z.number().positive().optional(),
  fx_date: date.optional(),
}).refine((value) => {
  const present = [value.original_currency, value.original_amount, value.fx_date].filter((field) => field !== undefined).length;
  return present === 0 || present === 3;
}, { path: ["original_currency"], message: "외화 환산 정보는 통화·원래 금액·환율 기준일이 함께 있어야 해요" });

export const GmailParseResultSchema = z.strictObject({
  transactions: z.array(TransactionSchema),
  skipped: z.array(z.strictObject({
    message_id: requiredText,
    reason: z.enum(["no_amount", "foreign_currency", "not_receipt", "duplicate"]),
  })),
});

export const UserProfileSchema = z.strictObject({
  school: z.string(),
  status: z.enum(["재학", "휴학", "대학원", "졸업예정", "기타"]),
  school_email: z.boolean(),
  grade: z.number().optional(),
});

export const SubscriptionSchema = z.strictObject({
  id: requiredText,
  service_id: requiredText.nullable(),
  display_name: requiredText,
  category: requiredText,
  raw_name: requiredText,
  amount: money,
  interval: IntervalSchema,
  monthly_amount: money,
  next_date: date.nullable(),
  usage: UsageSchema.nullable(),
  confidence: z.number().min(0).max(1),
  interpret_source: z.enum(["catalog", "ai", "user", "unknown"]),
  needs_check: z.boolean(),
  user_confirmed: z.boolean(),
  evidence_transaction_ids: z.array(requiredText),
});

export const SubscriptionCandidateSchema = z.strictObject({
  key: requiredText,
  raw_name: requiredText,
  amount: money,
  interval: IntervalSchema,
  payment_method: requiredText,
  transaction_ids: z.array(requiredText),
  next_date: date.nullable(),
});

export const ServicePlanSchema = z.strictObject({
  id: requiredText,
  name: requiredText,
  price: money.nullable(),
  interval: IntervalSchema,
});

export const CatalogServiceSchema = z.strictObject({
  id: requiredText,
  name: requiredText,
  category: requiredText,
  aliases: z.array(requiredText),
  email_domains: z.array(requiredText),
  plans: z.array(ServicePlanSchema),
  cancel_url: webUrl.nullable(),
  checked_at: date.nullable(),
});

export const CatalogBenefitSchema = z.strictObject({
  id: requiredText,
  service_id: requiredText,
  kind: z.enum(["student_discount", "school_license"]),
  school: requiredText.nullable(),
  conditions: requiredText,
  benefit_text: requiredText,
  price_after_monthly: money.nullable(),
  source_url: webUrl,
  checked_at: date,
});

export const CatalogBundleSchema = z.strictObject({
  id: requiredText,
  name: requiredText,
  includes: z.array(z.strictObject({ service_id: requiredText, plan_id: requiredText })),
  price_monthly: money.nullable(),
  member_of: requiredText.nullable(),
  price_monthly_if_member: money.nullable(),
  conditions: requiredText,
  is_partner: z.boolean(),
  source_url: webUrl,
  checked_at: date,
});

export const InterpretResultSchema = z.strictObject({
  key: requiredText,
  service_id: requiredText.nullable(),
  category: requiredText,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  source: z.enum(["catalog", "ai", "unknown"]),
  needs_check: z.boolean(),
});

export const BenefitResultSchema = z.strictObject({
  kind: z.enum(["benefit", "bundle"]),
  id: requiredText,
  eligible: z.enum(["yes", "no", "unknown"]),
  quoted_conditions: z.array(z.string()),
  missing_info: z.array(z.enum(["school", "status", "school_email", "grade", "other"])),
  reason: z.string(),
  source_url: webUrl,
  checked_at: date,
  stale: z.boolean(),
  validation: z.enum(["ok", "quote_failed", "ai_error"]),
}).refine((value) => value.validation === "ok" || value.eligible === "unknown", {
  path: ["eligible"], message: "검증에 실패한 판정은 unknown이어야 해요",
});

export const CatalogSchema = z.strictObject({
  services: z.array(CatalogServiceSchema),
  benefits: z.array(CatalogBenefitSchema),
  bundles: z.array(CatalogBundleSchema),
});

export const SuggestionSchema = z.strictObject({
  id: requiredText,
  type: SuggestionTypeSchema,
  subscription_ids: z.array(requiredText),
  saving_monthly: money,
  saving_yearly: money,
  message: z.string(),
  message_source: z.enum(["ai", "fallback"]),
  source_url: webUrl.nullable(),
  checked_at: date.nullable(),
  stale: z.boolean(),
  is_partner: z.boolean(),
  cancel_url: webUrl.nullable(),
  action_status: z.enum(["none", "done", "changed", "kept"]),
  keep_reason: z.enum(["maybe_later", "heavy_use", "other"]).nullable(),
});
