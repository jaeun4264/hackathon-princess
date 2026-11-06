import { z } from "zod";
import { SuggestionTypeSchema, UsageSchema } from "../schemas";
import { DEFAULT_MESSAGES, fillPlaceholders } from "../rules/messages";
import { buildSuggestions } from "../rules/suggestions";
import type { SuggestionType } from "../types";
import { callJson } from "./client";
import { buildT3Prompt } from "./prompts/t3";
import type { LlmClient } from "./types";

const money = z.number().int().nonnegative();
export const MessageRequestSchema = z.strictObject({ type: SuggestionTypeSchema, usage: UsageSchema.nullable(),
  service_name: z.string().trim().min(1).max(200), params: z.strictObject({ saving_monthly: money.optional(),
    saving_yearly: money.optional(), alt_name: z.string().trim().min(1).max(500).optional() }) }).superRefine((input, ctx) => {
  if (input.type !== "keep" && input.params.saving_monthly === undefined) ctx.addIssue({ code: "custom", path: ["params", "saving_monthly"], message: "계산된 월 절약액이 필요해요" });
  const monthly = input.params.saving_monthly;
  if (monthly !== undefined && (!Number.isSafeInteger(monthly * 12) ||
    (input.params.saving_yearly !== undefined && input.params.saving_yearly !== monthly * 12))) ctx.addIssue({ code: "custom", path: ["params", "saving_yearly"], message: "연 절약액은 월 절약액의 열두 배여야 해요" });
  if (input.type === "keep" && ((monthly ?? 0) !== 0 || (input.params.saving_yearly ?? 0) !== 0)) ctx.addIssue({ code: "custom", path: ["params"], message: "유지 제안의 절약액은 영 원이에요" });
  if (["student_discount", "school_license", "bundle"].includes(input.type) && !input.params.alt_name) ctx.addIssue({ code: "custom", path: ["params", "alt_name"], message: "확인된 대안 이름이 필요해요" });
});
export type MessageRequest = z.infer<typeof MessageRequestSchema>;

// 새 조건·무료·보장 같은 사실을 만들 수 없게 문장 표현의 범위를 제한해요.
export const APPROVED_TEMPLATES: Record<SuggestionType, readonly string[]> = {
  cancel: [DEFAULT_MESSAGES.cancel, "{service_name} 구독을 거의 쓰지 않는다면 해지를 고려해 보세요. 월 {saving_monthly}을 아낄 수 있어요."],
  pause: [DEFAULT_MESSAGES.pause, "다시 필요할 때까지 {service_name}을 쉬어 보는 건 어떨까요? 월 {saving_monthly}을 아낄 수 있어요."],
  student_discount: [DEFAULT_MESSAGES.student_discount, "자주 쓰는 {service_name}은 유지하면서 {alt_name}으로 월 {saving_monthly}을 아껴 보세요."],
  school_license: [DEFAULT_MESSAGES.school_license, "{service_name}을 자주 쓴다면 {alt_name}도 살펴보세요. 월 {saving_monthly}을 아낄 수 있어요."],
  bundle: [DEFAULT_MESSAGES.bundle, "계속 이용할 계획이라면 {alt_name}을 살펴보세요. 월 {saving_monthly}을 아낄 수 있어요."],
  keep: [DEFAULT_MESSAGES.keep, "{service_name}을 자주 쓰고 있다면 계속 유지해도 좋아요."],
};

export function validMessageTemplate(template: string, input: MessageRequest): boolean {
  if (!template.trim() || Array.from(template).length > 120 || /\p{N}/u.test(template)) return false;
  const tokens = template.match(/\{[^{}]*\}/gu) ?? [];
  if (tokens.some((token) => !["{service_name}", "{alt_name}", "{saving_monthly}", "{saving_yearly}"].includes(token))) return false;
  if (/[{}]/u.test(template.replace(/\{[^{}]*\}/gu, ""))) return false;
  return APPROVED_TEMPLATES[input.type].includes(template);
}

export async function generateMessage(raw: MessageRequest, llm: LlmClient = { callJson }): Promise<{ message: string; source: "ai" | "fallback" }> {
  const input = MessageRequestSchema.parse(raw);
  const params = { service_name: input.service_name, ...input.params,
    saving_yearly: input.params.saving_yearly ?? (input.params.saving_monthly === undefined ? undefined : input.params.saving_monthly * 12) };
  const schema = z.strictObject({ template: z.string() });
  try {
    const response = await llm.callJson(buildT3Prompt({ type: input.type, usage: input.usage,
      service_name: "{service_name}", ...(input.params.alt_name ? { alt_name: "{alt_name}" } : {}) }, APPROVED_TEMPLATES[input.type]), schema, { route: "/api/message" });
    const parsed = schema.safeParse(response?.data);
    if (parsed.success && validMessageTemplate(parsed.data.template, input)) return { message: fillPlaceholders(parsed.data.template, params), source: "ai" };
  } catch { /* AI 오류 원문은 출력하지 않고 기본 문장으로 바꿔요. */ }
  return { message: fillPlaceholders(DEFAULT_MESSAGES[input.type], params), source: "fallback" };
}

// 기존 HTTP 계약에 증빙 필드를 추가하지 않고 B6·B7 결과만 연결하는 서버용 진입점이에요.
export async function buildRecommendationMessages(input: Parameters<typeof buildSuggestions>[0], llm: LlmClient = { callJson }) {
  const suggestions = buildSuggestions(input);
  return Promise.all(suggestions.map(async (suggestion) => {
    const sub = input.subs.find((entry) => entry.id === suggestion.subscription_ids[0])!;
    const service = input.catalog.services.find((entry) => entry.id === sub.service_id)!;
    // 제안 ID의 내부 문자열 형식을 파싱하지 않고 B6가 선택한 혜택을 다시 연결해요.
    const benefit = input.catalog.benefits.find((entry) => entry.service_id === service.id && entry.kind === suggestion.type &&
      buildSuggestions({ ...input, subs: [sub], catalog: { ...input.catalog, benefits: [entry] } })
        .some((candidate) => candidate.id === suggestion.id && candidate.type === entry.kind));
    const result = await generateMessage({ type: suggestion.type, usage: sub.usage, service_name: service.name,
      params: { saving_monthly: suggestion.saving_monthly, saving_yearly: suggestion.saving_yearly,
        ...(benefit ? { alt_name: benefit.benefit_text } : {}) } }, llm);
    return { ...suggestion, message: result.message, message_source: result.source };
  }));
}
