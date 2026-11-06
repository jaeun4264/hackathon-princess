import { z } from "zod";
import { BenefitResultSchema } from "../schemas";
import type { BenefitResult, CatalogBenefit, CatalogBundle, UserProfile } from "../types";
import { quotesAreInSource } from "../rules/quotes";
import { isStale } from "../rules/stale";
import { buildT2Prompt } from "./prompts/t2";
import type { LlmClient } from "./types";

export type BenefitTarget = { kind: "benefit"; item: CatalogBenefit } | { kind: "bundle"; item: CatalogBundle };
const missingKeys = ["school", "status", "school_email", "grade", "other"] as const;
const AiBenefitSchema = z.strictObject({ eligible: z.enum(["yes", "no", "unknown"]),
  quoted_conditions: z.array(z.string().max(20000)).max(50), missing_info: z.array(z.string().max(100)).max(20), reason: z.string().max(2000) });

export function unknownBenefit(target: BenefitTarget, today: string, validation: BenefitResult["validation"] = "ai_error",
  missing: BenefitResult["missing_info"] = ["other"]): BenefitResult {
  return BenefitResultSchema.parse({ kind: target.kind, id: target.item.id, eligible: "unknown", quoted_conditions: [],
    missing_info: missing, reason: "적용 조건과 정보를 더 확인해 주세요", source_url: target.item.source_url,
    checked_at: target.item.checked_at, stale: isStale(target.item.checked_at, today), validation });
}

export async function judgeBenefit(target: BenefitTarget, user: UserProfile, llm: LlmClient, today: string): Promise<BenefitResult> {
  const fallback = unknownBenefit(target, today);
  // 명시된 학교와 사용자 정보의 모순은 모델의 높은 확신도로 덮어쓰지 않아요.
  if (target.kind === "benefit" && target.item.kind === "school_license") {
    if (!target.item.school?.trim()) return unknownBenefit(target, today, "ok");
    if (!user.school.trim()) return unknownBenefit(target, today, "ok", ["school"]);
    if (user.school.trim() !== target.item.school.trim()) return { ...fallback, eligible: "no", missing_info: [],
      quoted_conditions: [target.item.conditions], validation: "ok", reason: "카탈로그의 대상 학교와 입력한 학교가 달라요" };
  }
  if (user.status === "기타") return unknownBenefit(target, today, "ok", ["status"]);
  // 학년이 언급된 조건은 학년 정보 없이 충족했다고 단정하지 않아요.
  if (user.grade === undefined && target.item.conditions.includes("학년")) return unknownBenefit(target, today, "ok", ["grade"]);
  try {
    const response = await llm.callJson(buildT2Prompt(user, target.item), AiBenefitSchema, { route: "/api/benefits" });
    const parsed = AiBenefitSchema.safeParse(response?.data);
    if (!parsed.success) return fallback;
    const data = parsed.data;
    if (!quotesAreInSource(data.quoted_conditions, target.item.conditions) ||
      (data.eligible !== "unknown" && data.quoted_conditions.length === 0)) return unknownBenefit(target, today, "quote_failed");
    const missing = [...new Set(data.missing_info.filter((key): key is typeof missingKeys[number] => missingKeys.some((allowed) => key === allowed)))];
    const eligible = data.missing_info.length ? "unknown" : data.eligible;
    // 원문 AI 설명을 통해 새 가격·조건·URL이 사실처럼 표시되지 않게 고정 문구를 사용해요.
    return BenefitResultSchema.parse({ ...fallback, eligible, quoted_conditions: data.quoted_conditions,
      missing_info: eligible === "unknown" ? (missing.length ? missing : ["other"]) : [], validation: "ok",
      reason: eligible === "yes" ? "입력한 정보가 인용된 조건에 해당하는 것으로 판단했어요. 공식 출처를 확인해 주세요" :
        eligible === "no" ? "입력한 정보가 인용된 조건에 해당하지 않는 것으로 판단했어요" : "적용 조건과 정보를 더 확인해 주세요" });
  } catch { return fallback; }
}
