import { TransactionSchema } from "../schemas";

export function parseWonAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\s*원)?$/u.test(trimmed)) return null;
  const parsed = TransactionSchema.shape.amount.safeParse(Number(trimmed.replace(/[,\s원]/gu, "")));
  return parsed.success ? parsed.data : null;
}

export function parseCsvDate(value: string): string | null {
  const match = /^(\d{4}|\d{2})([-./])(\d{1,2})\2(\d{1,2})$/u.exec(value.trim());
  if (!match) return null;
  // 두 자리 연도는 문서 예시처럼 20YY로 해석해요.
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const iso = `${year}-${match[3].padStart(2, "0")}-${match[4].padStart(2, "0")}`;
  return TransactionSchema.shape.date.safeParse(iso).success ? iso : null;
}
