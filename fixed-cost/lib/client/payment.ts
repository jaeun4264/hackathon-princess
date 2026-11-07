// S3 결제 상세의 규칙. 모두 순수 함수예요. 근거를 새로 만들어 내지 않고 있는 정보만 보여 줘요.
import type { Subscription, Transaction } from "../types";
import { formatForeign, won } from "./confirm";

/** 이 구독으로 이어진 결제 (최근 것이 위). */
export function evidencePayments(sub: Subscription, transactions: Transaction[]): Transaction[] {
  const ids = new Set(sub.evidence_transaction_ids);
  return transactions.filter((tx) => ids.has(tx.id)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** 명세서·영수증에 찍힌 그대로: "카카오페이 · 6,900원 · 매달 3일" (결제일은 마지막 결제 날짜에서). */
export function statementLine(sub: Subscription, transactions: Transaction[]): string {
  const [last] = evidencePayments(sub, transactions);
  const parts = [sub.raw_name, won(sub.amount)];
  if (last) {
    const [, month, day] = last.date.split("-").map(Number);
    parts.push(sub.interval === "monthly" ? `매달 ${day}일` : `매년 ${month}월 ${day}일`);
  } else {
    parts.push(sub.interval === "monthly" ? "매달" : "매년");
  }
  return parts.join(" · ");
}

/** 결제 한 건 표기: 금액(외화면 원래 금액도). */
export function paymentAmount(tx: Transaction): { main: string; foreign: string | null } {
  return {
    main: won(tx.amount),
    foreign: tx.original_currency && tx.original_amount ? `${formatForeign(tx.original_currency, tx.original_amount)} 환산` : null,
  };
}

/** 해석 근거 한 줄. 직접 고른 것은 그렇게 말하고, 근거가 없으면 없다고 말해요. */
export function reasonText(sub: Subscription, reason: string | undefined): string {
  if (sub.interpret_source === "user") return "직접 고른 서비스예요.";
  if (sub.interpret_source === "ai" && sub.user_confirmed) return reason ? `${reason} 이후 직접 확인했어요.` : "AI가 추정했고 직접 확인했어요.";
  return reason && reason.trim() ? reason.trim() : "근거를 찾지 못했어요.";
}

/** 구독 id는 URL에 인코딩돼 들어와요. 잘못된 인코딩이면 원래 문자열을 써요. */
export function decodeSubscriptionId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
