import { SubscriptionSchema } from "../schemas";
import type { Subscription } from "../types";
import { monthlyEquivalent } from "./monthly";

export function checkedSubscriptions(subs: Subscription[]): Subscription[] {
  const checked = SubscriptionSchema.array().parse(subs);
  if (new Set(checked.map((sub) => sub.id)).size !== checked.length) throw new Error("구독 ID가 중복돼요");
  if (checked.some((sub) => sub.usage === null)) throw new Error("사용 정도를 먼저 확인해 주세요");
  return checked.map((sub) => ({ ...sub, monthly_amount: monthlyEquivalent(sub.amount, sub.interval) }));
}

export function summarize(subs: Subscription[]) {
  const result = { total_monthly: 0, often_monthly: 0, sometimes_monthly: 0, rarely_monthly: 0 };
  for (const sub of checkedSubscriptions(subs)) {
    result.total_monthly += sub.monthly_amount;
    result[`${sub.usage!}_monthly`] += sub.monthly_amount;
  }
  if (Object.values(result).some((value) => !Number.isSafeInteger(value))) throw new Error("금액 합계가 계산 범위를 넘었어요");
  return result;
}
