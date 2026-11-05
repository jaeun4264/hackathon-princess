import { z } from "zod";
import { callJson } from "./client";
import type { LlmClient, LlmContext } from "./types";
import { buildT1Prompt } from "./prompts/t1";
import { buildCandidates, InterpretItemSchema, matchAlias } from "../rules/interpret";
import type { InterpretItem } from "../rules/interpret";
import type { Catalog, InterpretResult } from "../types";
import { MerchantResolutionSchema, toConfirmedInterpretResult } from "./interpret-resolution";
import type { MerchantResolution } from "./interpret-resolution";

export const CONFIDENCE_THRESHOLD = 0.7; // 기존 공개 상수만 유지해요. 확정 여부에는 사용하지 않아요.
const AiInterpretSchema = z.strictObject({ service_id: z.string(), category: z.string(), confidence: z.number(), reason: z.string() });
const DEFAULT_REASON = "AI가 후보를 추정했지만 실제 서비스는 확인되지 않았어요. 직접 확인해 주세요";

export function unknownInterpretation(key: string): InterpretResult {
  return { key, service_id: null, category: "기타", confidence: 0, reason: "서비스를 확인할 근거가 부족해요. 직접 확인해 주세요", source: "unknown", needs_check: true };
}

export function unknownResolution(key: string): MerchantResolution {
  return { ...unknownInterpretation(key), suggested_service_id: null, confirmed_service_id: null };
}

interface InterpretOptions {
  catalog: Catalog;
  llm?: LlmClient;
  context?: LlmContext;
}

export async function resolveInterpretItems(items: InterpretItem[], options: InterpretOptions): Promise<MerchantResolution[]> {
  const checkedItems = InterpretItemSchema.array().parse(items);
  const llm = options.llm ?? { callJson };
  const cache = new Map<string, MerchantResolution>();
  const results: MerchantResolution[] = [];
  for (const item of checkedItems) {
    const identity = JSON.stringify([item.raw_name, item.amount, item.interval, item.payment_method]);
    const cached = cache.get(identity);
    if (cached) { results.push(MerchantResolutionSchema.parse({ ...cached, key: item.key })); continue; }
    let result = unknownResolution(item.key);
    try {
      const aliases = matchAlias(item.raw_name, options.catalog);
      // 중복 명칭은 금액·주기만으로 구분해 확정하지 않아요.
      const matched = aliases.length === 1 ? aliases[0] : undefined;
      if (matched) {
        result = { key: item.key, service_id: matched.id, category: matched.category, confidence: 1,
          reason: "결제 표기에 유일한 등록 서비스명이 명시되어 있어요", source: "catalog", needs_check: false,
          suggested_service_id: matched.id, confirmed_service_id: matched.id };
      } else {
        const candidates = buildCandidates(item, options.catalog);
        if (candidates.length) {
          const response = await llm.callJson(buildT1Prompt(item, candidates), AiInterpretSchema,
            { ...options.context, route: "/api/interpret" });
          // Mock·다른 제공업체도 B4 경계를 우회해 검증되지 않은 값을 넣지 못하게 다시 검사해요.
          const parsed = AiInterpretSchema.safeParse(response?.data);
          if (parsed.success && parsed.data.service_id !== "unknown") {
            const selected = candidates.find((service) => service.id === parsed.data.service_id);
            if (selected) {
              const confidence = Math.max(0, Math.min(1, parsed.data.confidence));
              // 확신도·금액 일치·모델 설명은 독립적인 확인 근거가 아니에요.
              result = { key: item.key, service_id: null, category: "기타", confidence,
                reason: DEFAULT_REASON, source: "ai", needs_check: true,
                suggested_service_id: selected.id, confirmed_service_id: null };
            }
          }
        }
      }
    } catch { /* AI·카탈로그 처리 오류의 원문은 출력하지 않고 unknown으로 유지해요. */ }
    const validated = MerchantResolutionSchema.parse(result);
    cache.set(identity, validated);
    results.push(validated);
  }
  return results;
}

// 기존 소비자는 확정값만 받게 해서 추정 ID를 구독 서비스로 오인하지 않게 해요.
export async function interpretItems(items: InterpretItem[], options: InterpretOptions): Promise<InterpretResult[]> {
  return (await resolveInterpretItems(items, options)).map(toConfirmedInterpretResult);
}
