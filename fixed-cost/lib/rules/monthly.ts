import { IntervalSchema, TransactionSchema } from "../schemas";
import type { Interval } from "../types";

export function monthlyEquivalent(amount: number, interval: Interval): number {
  const checkedAmount = TransactionSchema.shape.amount.parse(amount);
  const checkedInterval = IntervalSchema.parse(interval);
  return checkedInterval === "yearly" ? Math.round(checkedAmount / 12) : checkedAmount;
}
