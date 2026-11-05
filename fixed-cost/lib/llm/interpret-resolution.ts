import { z } from "zod";
import { InterpretResultSchema } from "../schemas";
import type { InterpretResult } from "../types";

// B1 계약은 그대로 두고 B5 상세 결과를 별도로 정의해요.
export const MerchantResolutionSchema = InterpretResultSchema.extend({
  suggested_service_id: InterpretResultSchema.shape.service_id,
  confirmed_service_id: InterpretResultSchema.shape.service_id,
}).superRefine((value, context) => {
  if (value.service_id !== value.confirmed_service_id) context.addIssue({ code: "custom", path: ["service_id"], message: "기존 service_id는 확정값과 같아야 해요" });
  if (value.needs_check !== (value.confirmed_service_id === null)) context.addIssue({ code: "custom", path: ["needs_check"], message: "미확정 결과는 사용자 확인이 필요해요" });
  if (value.source === "ai" && value.confirmed_service_id !== null) context.addIssue({ code: "custom", path: ["confirmed_service_id"], message: "AI 추정은 확정 근거가 아니에요" });
  if (value.confirmed_service_id === null && value.category !== "기타") context.addIssue({ code: "custom", path: ["category"], message: "미확정 결과의 분류를 확정 정보처럼 제공하지 않아요" });
  if (value.source === "unknown" && (value.suggested_service_id !== null || value.confirmed_service_id !== null)) context.addIssue({ code: "custom", path: ["suggested_service_id"], message: "근거가 없으면 두 ID 모두 비워야 해요" });
  if (value.confirmed_service_id !== null && value.suggested_service_id !== null && value.confirmed_service_id !== value.suggested_service_id) context.addIssue({ code: "custom", path: ["confirmed_service_id"], message: "두 ID가 서로 모순되면 안 돼요" });
});
export type MerchantResolution = z.infer<typeof MerchantResolutionSchema>;

export function toConfirmedInterpretResult(resolution: MerchantResolution): InterpretResult {
  const checked = MerchantResolutionSchema.parse(resolution);
  return InterpretResultSchema.parse({
    key: checked.key, service_id: checked.confirmed_service_id,
    category: checked.confirmed_service_id === null ? "기타" : checked.category,
    confidence: checked.confidence, reason: checked.reason, source: checked.source, needs_check: checked.needs_check,
  });
}

export function interpretationResponse(resolutions: MerchantResolution[]) {
  const checked = MerchantResolutionSchema.array().parse(resolutions);
  return { results: checked.map(toConfirmedInterpretResult), resolutions: checked };
}
