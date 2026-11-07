import { CatalogServiceSchema, InterpretResultSchema, SubscriptionCandidateSchema, SubscriptionSchema } from "../schemas";
import type { CatalogService, InterpretResult, Subscription, SubscriptionCandidate } from "../types";
import { monthlyEquivalent } from "./monthly";

/**
 * 계약 4절: 후보(F2) + T1 해석 결과 → 구독 목록. 순수 함수예요.
 * - 해석 결과는 key로 짝지어요. 결과가 없거나 틀린 모양이면 unknown + 확인 필요로 둬요.
 * - service_id에는 "확정된" 값만 들어가요. B5 이후 AI 추정은 service_id가 null이고,
 *   후보 서비스(resolutions.suggested_service_id)는 화면이 따로 보여 주고 사용자가 고르게 해요.
 * - 카탈로그에 없는 service_id는 믿지 않고 unknown으로 바꿔요.
 */
export function buildSubscriptions(
  cands: SubscriptionCandidate[],
  interpreted: InterpretResult[],
  catalog: { services: CatalogService[] },
): Subscription[] {
  const candidates = SubscriptionCandidateSchema.array().parse(cands);
  const services = CatalogServiceSchema.array().parse(catalog.services);
  const byKey = new Map<string, InterpretResult>();
  for (const entry of interpreted) {
    const parsed = InterpretResultSchema.safeParse(entry);
    if (parsed.success && !byKey.has(parsed.data.key)) byKey.set(parsed.data.key, parsed.data);
  }

  const seen = new Set<string>();
  const output: Subscription[] = [];
  for (const cand of candidates) {
    if (seen.has(cand.key)) continue; // 같은 후보가 두 번 오면 한 번만
    seen.add(cand.key);
    const result = byKey.get(cand.key);
    const service = result?.service_id ? services.find((entry) => entry.id === result.service_id) : undefined;
    const known = result !== undefined && (result.service_id === null || service !== undefined);

    output.push(SubscriptionSchema.parse({
      id: cand.key,
      service_id: service?.id ?? null,
      display_name: service?.name ?? cand.raw_name,
      category: service?.category ?? (known && result.category.trim() ? result.category : "기타"),
      raw_name: cand.raw_name,
      amount: cand.amount,
      interval: cand.interval,
      monthly_amount: monthlyEquivalent(cand.amount, cand.interval),
      next_date: cand.next_date,
      usage: null, // S1에서 사용자가 직접 탭해요. 자동으로 채우지 않아요.
      confidence: known ? result.confidence : 0,
      interpret_source: known ? result.source : "unknown",
      needs_check: known ? result.needs_check || service === undefined : true,
      user_confirmed: false,
      evidence_transaction_ids: cand.transaction_ids,
    }));
  }
  return output;
}
