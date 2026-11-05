import { TransactionSchema } from "../schemas";

export function isStale(checkedAt: string | null, today: string): boolean {
  const current = Date.parse(TransactionSchema.shape.date.parse(today));
  if (checkedAt === null) return true;
  const checked = Date.parse(TransactionSchema.shape.date.parse(checkedAt));
  // 미래 확인일도 검증된 과거 근거로 취급하지 않아요.
  return checked > current || current - checked > 30 * 86400000;
}
