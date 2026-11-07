// 파이프라인 1~2단계 (FRONTEND.md 4부 2절).
// 결제 내역 → 정기 결제 찾기(브라우저) → /api/interpret(계약 필드만) → buildSubscriptions → store.
import * as api from "../api-client";
import { loadCatalog } from "../catalog";
import { buildSubscriptions, detectSubscriptionCandidates, monthlyEquivalent } from "../rules";
import type { Catalog, Interval, Subscription, Transaction } from "../types";
import { benefitTargets } from "./derive";
import { useAppStore } from "./store";

export type PipelineStage = "detecting" | "interpreting";
export const STAGE_LABEL: Record<PipelineStage, string> = {
  detecting: "구독을 찾는 중",
  interpreting: "서비스를 확인하는 중",
};

const INTERPRET_BATCH = 50; // 계약: 항목 50개 이하

export interface AnalyzeResult {
  subscriptions: Subscription[];
  suggestedServiceIds: Record<string, string | null>;
  degraded: boolean;
}

export async function analyzeTransactions(
  transactions: Transaction[],
  options: { catalog?: Catalog; apiOptions?: api.ApiOptions; onStage?: (stage: PipelineStage) => void } = {},
): Promise<AnalyzeResult> {
  const catalog = options.catalog ?? loadCatalog();
  options.onStage?.("detecting");
  const candidates = detectSubscriptionCandidates(transactions, catalog);
  options.onStage?.("interpreting");

  let degraded = false;
  const results: Awaited<ReturnType<typeof api.interpret>>["results"] = [];
  const suggestedServiceIds: Record<string, string | null> = {};
  for (let start = 0; start < candidates.length; start += INTERPRET_BATCH) {
    const batch = candidates.slice(start, start + INTERPRET_BATCH).map((cand) => ({
      key: cand.key, raw_name: cand.raw_name, amount: cand.amount, interval: cand.interval, payment_method: cand.payment_method,
    }));
    const response = await api.interpret(batch, options.apiOptions);
    degraded ||= response.degraded;
    results.push(...response.results);
    Object.assign(suggestedServiceIds, response.suggestedServiceIds);
  }

  // 외화를 환율로 환산한 결제가 근거인 구독은 카드 청구액과 다를 수 있어 '확인 필요'로 둬요.
  const converted = new Set(transactions.filter((tx) => tx.original_currency !== undefined).map((tx) => tx.id));
  const subscriptions = buildSubscriptions(candidates, results, catalog).map((sub) =>
    sub.evidence_transaction_ids.some((id) => converted.has(id)) ? { ...sub, needs_check: true } : sub);
  // 후보 서비스가 카탈로그에 없으면 보여 주지 않아요. 이미 확정된 구독에는 후보를 따로 두지 않아요.
  const known = new Set(catalog.services.map((service) => service.id));
  const suggestions: Record<string, string | null> = {};
  for (const sub of subscriptions) {
    const suggested = suggestedServiceIds[sub.id] ?? null;
    suggestions[sub.id] = sub.service_id === null && suggested !== null && known.has(suggested) ? suggested : null;
  }
  return { subscriptions, suggestedServiceIds: suggestions, degraded };
}

/** 결제 내역을 store에 넣고 분석까지. phase: empty → interpreting → confirming. */
export async function runInterpret(
  transactions: Transaction[],
  options: { store?: typeof useAppStore; apiOptions?: api.ApiOptions; catalog?: Catalog; onStage?: (stage: PipelineStage) => void } = {},
): Promise<AnalyzeResult> {
  const store = (options.store ?? useAppStore).getState();
  store.loadTransactions(transactions);
  store.setPhase("interpreting");
  try {
    const result = await analyzeTransactions(transactions, options);
    const latest = (options.store ?? useAppStore).getState();
    latest.setSubscriptions(result.subscriptions, result.suggestedServiceIds);
    latest.setPhase(result.subscriptions.length > 0 ? "confirming" : "empty");
    return result;
  } catch (error) {
    (options.store ?? useAppStore).getState().setPhase("empty");
    throw error;
  }
}

/** 구독이 외화 환산 결제에서 나왔다면 마지막 결제의 원래 금액·통화·환율 기준일. 화면 표시용. */
export function foreignOrigin(sub: Subscription, transactions: Transaction[]): { currency: string; amount: number; fxDate: string } | null {
  const evidence = transactions
    .filter((tx) => sub.evidence_transaction_ids.includes(tx.id) && tx.original_currency && tx.original_amount && tx.fx_date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const last = evidence[evidence.length - 1];
  return last ? { currency: last.original_currency!, amount: last.original_amount!, fxDate: last.fx_date! } : null;
}

// ---------- 파이프라인 4~5단계 (S1 "다음" 뒤 백그라운드) ----------
/**
 * 혜택 판정(T2) → 규칙으로 제안 만들기 → 제안 문장(T3) 바꿔 끼우기.
 * 숫자는 규칙이 만든 값만 쓰고, AI 문장이 실패하면 규칙의 기본 문장을 그대로 둬요.
 */
export async function runAnalysis(
  options: { store?: typeof useAppStore; apiOptions?: api.ApiOptions; catalog?: Catalog; today: string },
): Promise<{ degraded: boolean }> {
  const store = options.store ?? useAppStore;
  const catalog = options.catalog ?? loadCatalog();
  store.getState().setAnalysis("running", false);
  let degraded = false;
  try {
    const { subscriptions, profile } = store.getState();
    const targets = benefitTargets(subscriptions, profile, catalog);
    if (profile && targets.length > 0) {
      const response = await api.benefits(profile, targets, { ...options.apiOptions, catalog, today: options.today });
      degraded ||= response.degraded;
      store.getState().setBenefitResults(response.results);
    }
    store.getState().rebuildSuggestions(options.today);

    // 제안 문장: 아직 AI 문장이 아닌 것만, 차례대로 (무료 모델 호출 수를 아끼려고 동시에 보내지 않아요)
    for (const suggestion of store.getState().suggestions) {
      if (suggestion.message_source === "ai") continue;
      const sub = store.getState().subscriptions.find((entry) => entry.id === suggestion.subscription_ids[0]);
      if (!sub) continue;
      const service = catalog.services.find((entry) => entry.id === sub.service_id);
      const benefit = catalog.benefits.find((entry) => suggestion.id.includes(JSON.stringify(entry.id)));
      const response = await api.message({
        type: suggestion.type,
        usage: sub.usage,
        service_name: service?.name ?? sub.display_name,
        params: {
          ...(suggestion.type === "keep" ? {} : { saving_monthly: suggestion.saving_monthly, saving_yearly: suggestion.saving_yearly }),
          ...(benefit ? { alt_name: benefit.benefit_text } : {}),
        },
      }, options.apiOptions);
      degraded ||= response.degraded;
      if (response.message) store.getState().setSuggestionMessage(suggestion.id, response.message, response.source);
    }
  } catch {
    // 어떤 단계가 실패해도 규칙 결과로 계속 보여 줘요.
    degraded = true;
  } finally {
    store.getState().setAnalysis("done", degraded);
  }
  return { degraded };
}

// ---------- 직접 추가 ----------
export interface ManualInput {
  name: string;
  amount: number;
  interval: Interval;
  serviceId: string | null;
}

/** 사용자가 직접 넣은 구독. 사용자가 고른 값이라 확인 필요가 아니에요. 사용 정도는 S1에서 받아요. */
export function createManualSubscription(input: ManualInput, catalog: Catalog = loadCatalog(), id = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): Subscription {
  const service = input.serviceId ? catalog.services.find((entry) => entry.id === input.serviceId) : undefined;
  const name = input.name.trim() || service?.name || "";
  if (!name) throw new Error("이름을 넣어 주세요");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("금액을 원 단위 숫자로 넣어 주세요");
  return {
    id,
    service_id: service?.id ?? null,
    display_name: service?.name ?? name,
    category: service?.category ?? "기타",
    raw_name: name,
    amount: input.amount,
    interval: input.interval,
    monthly_amount: monthlyEquivalent(input.amount, input.interval),
    next_date: null,
    usage: null,
    confidence: 1,
    interpret_source: "user",
    needs_check: false,
    user_confirmed: true,
    evidence_transaction_ids: [],
  };
}
