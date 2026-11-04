import { CatalogServiceSchema, SubscriptionCandidateSchema, TransactionSchema } from "../schemas";
import type { CatalogService, Interval, SubscriptionCandidate, Transaction } from "../types";
import { normalize } from "./normalize";

export const AMOUNT_TOLERANCE = 0.03; // [팀 확정 필요] 첫 결제 금액 대비 허용 오차예요.
const DAY_MS = 86_400_000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function nextDate(date: string, interval: Interval): string | null {
  const next = utcDate(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  if (interval === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);

  // 원래 일자가 다음 달에 없으면 그 달의 마지막 날을 사용해요.
  const lastDay = new Date(next);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  if (next.getUTCFullYear() > 9999) return null;
  return next.toISOString().slice(0, 10);
}

export function detectSubscriptionCandidates(
  txs: Transaction[],
  catalog: { services: CatalogService[] },
): SubscriptionCandidate[] {
  // B1 스키마를 재사용하고 복사본을 정렬해 호출자의 결제 내역은 변경하지 않아요.
  const transactions = TransactionSchema.array().parse(txs).sort((left, right) =>
    compareText(left.date, right.date) || compareText(left.id, right.id));
  const services = CatalogServiceSchema.array().parse(catalog.services);
  const groups = new Map<string, Transaction[][]>();

  for (const transaction of transactions) {
    const name = normalize(transaction.raw_name);
    // 숫자·기호만 남은 표기는 서로 같은 결제처라고 단정하지 않아요.
    if (!name) continue;
    const key = `${name}|${transaction.payment_method}`;
    const clusters = groups.get(key) ?? [];
    const cluster = clusters.find(([first]) => first.amount === 0
      ? transaction.amount === 0
      : Math.abs(transaction.amount - first.amount) / first.amount <= AMOUNT_TOLERANCE);
    if (cluster) cluster.push(transaction);
    else clusters.push([transaction]);
    groups.set(key, clusters);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [groupKey, clusters] of groups) {
    for (const cluster of clusters) {
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      let interval: Interval;
      if (cluster.length >= 2) {
        const gaps = cluster.slice(1).map((transaction, index) =>
          (utcDate(transaction.date).getTime() - utcDate(cluster[index].date).getTime()) / DAY_MS);
        const typicalGap = median(gaps);
        if (typicalGap < 25 || typicalGap > 35) continue;
        interval = "monthly";
      } else {
        const name = normalize(first.raw_name);
        const matchesYearlyPlan = services.some((service) =>
          service.aliases.some((alias) => normalize(alias) === name) &&
          service.plans.some((plan) => plan.interval === "yearly" && plan.price !== null && plan.price === first.amount));
        if (!matchesYearlyPlan) continue;
        interval = "yearly";
      }

      candidates.push(SubscriptionCandidateSchema.parse({
        key: `${groupKey}|${first.amount}|${interval}`,
        raw_name: last.raw_name,
        amount: last.amount,
        interval,
        payment_method: last.payment_method,
        transaction_ids: cluster.map((transaction) => transaction.id),
        next_date: nextDate(last.date, interval),
      }));
    }
  }
  return candidates.sort((left, right) => compareText(left.key, right.key));
}
