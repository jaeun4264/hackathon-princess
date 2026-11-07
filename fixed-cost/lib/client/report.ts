// S5 절감 리포트 규칙. 모두 순수 함수예요.
import type { EventInput } from "../api-client";
import { makePauseSuggestion } from "../rules";
import type { Subscription, Suggestion } from "../types";

export type ActionChoice = "done" | "changed" | "kept";
export type KeepReason = "maybe_later" | "heavy_use" | "other";

export const ACTION_LABEL: Record<ActionChoice, string> = { done: "해지했어요", changed: "바꾸었어요", kept: "유지할게요" };
export const KEEP_REASON_LABEL: Record<KeepReason, string> = { maybe_later: "볼 게 생길까 봐", heavy_use: "많이 써서", other: "기타" };

/** 실행 체크할 제안 (절약액이 있는 것)과 유지 권유(keep)를 나눠요. 절약액 큰 순 그대로, 제휴라서 올리지 않아요. */
export function splitSuggestions(suggestions: Suggestion[]): { actionable: Suggestion[]; keep: Suggestion[] } {
  const ranked = [...suggestions].sort((a, b) => b.saving_monthly - a.saving_monthly || a.id.localeCompare(b.id));
  const pauses = ranked.filter((entry) => entry.type === "pause");
  const main = ranked.filter((entry) => entry.type !== "pause" && entry.type !== "keep" && entry.saving_monthly > 0);
  // '쉬기' 제안은 같은 구독의 해지 제안 바로 아래에 둬요.
  const actionable: Suggestion[] = [];
  for (const entry of main) {
    actionable.push(entry);
    actionable.push(...pauses.filter((pause) => pause.subscription_ids[0] === entry.subscription_ids[0]));
  }
  actionable.push(...pauses.filter((pause) => !actionable.includes(pause)));
  return { actionable, keep: ranked.filter((entry) => entry.type === "keep") };
}

/** 맨 위 한 줄: 해지·변경으로 체크한 제안의 월 절약액 합 (같은 구독은 한 번만). */
export function actedSavings(suggestions: Suggestion[]): number {
  const used = new Set<string>();
  let total = 0;
  for (const entry of [...suggestions].sort((a, b) => b.saving_monthly - a.saving_monthly)) {
    if (entry.action_status !== "done" && entry.action_status !== "changed") continue;
    if (entry.subscription_ids.some((id) => used.has(id))) continue;
    entry.subscription_ids.forEach((id) => used.add(id));
    total += entry.saving_monthly;
  }
  return total;
}

/** 계약 3-4의 action 이벤트. 제안 종류와 상태만 보내요 (서비스 이름·금액·표기 이름 없음). */
export function actionEvent(sessionId: string, suggestion: Suggestion, status: ActionChoice): EventInput {
  return { session_id: sessionId, kind: "action", payload: { suggestion_type: suggestion.type, status } };
}

export function keepReasonEvent(sessionId: string, reason: KeepReason): EventInput {
  return { session_id: sessionId, kind: "keep_reason", payload: { reason } };
}

/** "볼 게 생길까 봐"를 고르면 만들 '쉬었다가 다시 결제' 제안. 확인 안 된 구독이면 만들지 않아요. */
export function pauseFor(sub: Subscription | undefined, today: string): Suggestion | null {
  if (!sub) return null;
  try {
    return makePauseSuggestion(sub, today);
  } catch {
    return null;
  }
}
