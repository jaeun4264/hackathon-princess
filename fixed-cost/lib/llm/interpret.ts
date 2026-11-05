import { z } from "zod";
import { callJson } from "./client";
import type { LlmClient, LlmContext } from "./types";
import { buildT1Prompt } from "./prompts/t1";
import { buildCandidates, hasMatchingPrice, InterpretItemSchema, matchAlias } from "../rules/interpret";
import type { InterpretItem } from "../rules/interpret";
import { InterpretResultSchema } from "../schemas";
import type { Catalog, InterpretResult } from "../types";

export const CONFIDENCE_THRESHOLD = 0.7; // TODO(팀): 평가 케이스로 기준을 조정해요.
const AiInterpretSchema = z.strictObject({ service_id: z.string(), category: z.string(), confidence: z.number(), reason: z.string() });
const DEFAULT_REASON = "결제 수단 이름만 보여서 금액과 주기로 추정했어요";

export function unknownInterpretation(key: string): InterpretResult {
  return { key, service_id: null, category: "기타", confidence: 0, reason: "서비스를 확인할 근거가 부족해요. 직접 확인해 주세요", source: "unknown", needs_check: true };
}

export async function interpretItems(items: InterpretItem[], options: {
  catalog: Catalog;
  llm?: LlmClient;
  context?: LlmContext;
}): Promise<InterpretResult[]> {
  const checkedItems = InterpretItemSchema.array().parse(items);
  const llm = options.llm ?? { callJson };
  const cache = new Map<string, Omit<InterpretResult, "key">>();
  const results: InterpretResult[] = [];
  for (const item of checkedItems) {
    const identity = JSON.stringify([item.raw_name, item.amount, item.interval, item.payment_method]);
    const cached = cache.get(identity);
    if (cached) { results.push(InterpretResultSchema.parse({ ...cached, key: item.key })); continue; }
    let result = unknownInterpretation(item.key);
    try {
      const aliases = matchAlias(item.raw_name, options.catalog);
      const pricedAliases = aliases.filter((service) => hasMatchingPrice(item, service));
      const matched = aliases.length === 1 ? aliases[0] : pricedAliases.length === 1 ? pricedAliases[0] : undefined;
      if (matched) {
        result = { key: item.key, service_id: matched.id, category: matched.category, confidence: 1,
          reason: "결제 표기가 카탈로그의 서비스 별칭과 일치해요", source: "catalog", needs_check: false };
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
              const knownPrice = hasMatchingPrice(item, selected);
              // 모델이 만든 분류·설명 속 가격·새 결제 사실을 그대로 전달하지 않아요.
              const reason = !knownPrice ? "후보의 등록 가격이 없어 사용자 확인이 필요해요" :
                parsed.data.reason.trim() ? "선택한 후보의 등록 요금과 입력 금액·주기가 일치해 추정했어요" : DEFAULT_REASON;
              result = { key: item.key, service_id: selected.id, category: selected.category, confidence,
                reason, source: "ai", needs_check: confidence < CONFIDENCE_THRESHOLD || !knownPrice };
            }
          }
        }
      }
    } catch { /* AI·카탈로그 처리 오류의 원문은 출력하지 않고 unknown으로 유지해요. */ }
    const validated = InterpretResultSchema.parse(result);
    const { key: _key, ...shared } = validated;
    void _key;
    cache.set(identity, shared);
    results.push(validated);
  }
  return results;
}
