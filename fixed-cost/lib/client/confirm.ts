// S1 구독 확인 화면의 규칙 (화면에서 직접 계산하지 않게 여기 모아요). 모두 순수 함수예요.
import { monthlyEquivalent } from "../rules";
import type { CatalogService, Interval, Subscription, Transaction, UserProfile } from "../types";
import { foreignOrigin } from "./pipeline";

export const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

// TODO(팀): 학교 범위 (기획서 팀 판단 3번). 확정 전 기본 목록이에요.
export const SCHOOL_OPTIONS = ["고려대학교", "이화여자대학교", "기타"] as const;
export const STATUS_OPTIONS: UserProfile["status"][] = ["재학", "휴학", "대학원", "졸업예정", "기타"];
export type SchoolEmailAnswer = "yes" | "no" | "unknown";

/** 학교 이메일 답 → 계약의 boolean. "모르겠어요"는 false이고, T2가 missing_info로 다시 물어봐요. */
export function toSchoolEmail(answer: SchoolEmailAnswer): boolean {
  return answer === "yes";
}

/** 사용 정도를 아직 안 고른 구독 수 */
export function remainingUsage(subs: Subscription[]): number {
  return subs.filter((sub) => sub.usage === null).length;
}

/** "다음" 버튼: 구독이 있고, 모두 사용 정도가 있고, 프로필이 있어야 해요. 막혔으면 이유를 돌려줘요. */
export function nextBlocker(subs: Subscription[], profile: UserProfile | null): string | null {
  if (subs.length === 0) return "구독을 하나 이상 넣어 주세요";
  const left = remainingUsage(subs);
  if (left > 0) return `${left}개 더 눌러 주세요`;
  if (!profile) return "학교·재학 정보를 골라 주세요";
  return null;
}

export function intervalLabel(interval: Interval): string {
  return interval === "monthly" ? "매달" : "매년";
}

/** "매달 13,500원" / "매년 50,500원 · 월 4,208원" */
export function amountLine(sub: Pick<Subscription, "amount" | "interval" | "monthly_amount">): { main: string; sub: string | null } {
  return {
    main: `${intervalLabel(sub.interval)} ${won(sub.amount)}`,
    sub: sub.interval === "yearly" ? `월 ${won(sub.monthly_amount)}` : null,
  };
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", JPY: "¥", GBP: "£" };
export function formatForeign(currency: string, amount: number): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

export interface CheckNote {
  /** 왜 확인이 필요한지 한 줄 */
  reason: string;
  /** AI·별칭이 추정한 후보 서비스 (사용자가 "맞아요"를 눌러야 확정) */
  suggestion: CatalogService | null;
  /** 외화 환산 금액이면 원래 금액 */
  foreign: string | null;
}

/** 확인이 필요한 구독의 사유. 확인이 필요 없으면 null. 근거를 새로 만들어 내지 않고, 있는 정보만 말해요. */
export function checkNote(
  sub: Subscription,
  context: { suggestedServiceId: string | null; services: CatalogService[]; transactions: Transaction[] },
): CheckNote | null {
  if (!sub.needs_check) return null;
  const suggestion = context.suggestedServiceId ? context.services.find((service) => service.id === context.suggestedServiceId) ?? null : null;
  const origin = foreignOrigin(sub, context.transactions);
  const foreign = origin ? formatForeign(origin.currency, origin.amount) : null;
  let reason: string;
  if (origin) reason = `${foreign}를 ${shortDate(origin.fxDate)} 환율로 바꾼 금액이에요. 카드 청구액과 다를 수 있어요.`;
  else if (suggestion) reason = `결제 표기가 "${sub.raw_name}"뿐이라 금액과 주기로 추정했어요.`;
  else reason = `"${sub.raw_name}"만으로는 어떤 서비스인지 찾지 못했어요.`;
  return { reason, suggestion, foreign };
}

/** 카탈로그 서비스를 사용자가 골랐을 때. 사용자가 확인한 값이라 확인 필요가 풀려요. */
export function chooseService(sub: Subscription, service: CatalogService): Partial<Subscription> {
  return {
    service_id: service.id,
    display_name: service.name,
    category: service.category,
    interpret_source: "user",
    needs_check: false,
    user_confirmed: true,
    confidence: 1,
  };
}

/** AI 추정 후보에 "맞아요"를 눌렀을 때. 출처는 AI로 남기고(S3에서 보여 줌) 사용자가 확인했다고 표시해요. */
export function acceptSuggestion(sub: Subscription, service: CatalogService): Partial<Subscription> {
  return { ...chooseService(sub, service), interpret_source: sub.interpret_source === "ai" ? "ai" : "user" };
}

export interface EditInput {
  name: string;
  amount: number;
  interval: Interval;
  serviceId: string | null;
}

/** 수정 시트 저장. 금액은 원 단위 정수만, 월 환산은 규칙이 계산해요. 저장하면 사용자가 확인한 것으로 봐요. */
export function applyEdit(sub: Subscription, input: EditInput, services: CatalogService[]): Partial<Subscription> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("금액은 원 단위 숫자로 넣어 주세요");
  const service = input.serviceId ? services.find((entry) => entry.id === input.serviceId) : undefined;
  const name = input.name.trim() || service?.name || sub.display_name;
  const serviceChanged = (service?.id ?? null) !== sub.service_id;
  return {
    service_id: service?.id ?? null,
    display_name: service?.name ?? name,
    category: service?.category ?? (serviceChanged ? "기타" : sub.category),
    amount: input.amount,
    interval: input.interval,
    monthly_amount: monthlyEquivalent(input.amount, input.interval),
    interpret_source: serviceChanged || sub.interpret_source === "unknown" ? "user" : sub.interpret_source,
    needs_check: false,
    user_confirmed: true,
    confidence: serviceChanged ? 1 : sub.confidence,
  };
}
