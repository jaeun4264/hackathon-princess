import { TransactionSchema } from "../schemas";
import type { Transaction } from "../types";
import type { InputAdapter } from "./types";
import { parseCsvDate, parseWonAmount } from "./validation";

type CsvSkipReason = "invalid_header" | "invalid_csv" | "invalid_columns" | "invalid_date" | "invalid_amount" | "invalid_transaction" | "duplicate";

function readRecords(text: string) {
  const records: { fields: string[]; line: number; invalid: boolean }[] = [];
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let invalid = false;
  let line = 1;
  let startLine = 1;
  function finishField() { fields.push(field); field = ""; closed = false; }
  function finishRecord() {
    finishField();
    if (fields.some((value) => value.trim() !== "") || invalid) records.push({ fields, line: startLine, invalid });
    fields = []; invalid = false;
  }
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index];
    if (quoted) {
      if (character === '"' && normalized[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else { field += character; if (character === "\n") line++; }
    } else if (character === ",") finishField();
    else if (character === "\n") { finishRecord(); line++; startLine = line; }
    else if (character === '"') {
      if (field !== "" || closed) invalid = true;
      else quoted = true;
    } else if (closed) {
      if (!/\s/u.test(character)) invalid = true;
    } else field += character;
  }
  if (quoted) invalid = true;
  finishRecord();
  return records;
}

export function parseCsv(input: unknown): { transactions: Transaction[]; skipped: { line: number; reason: CsvSkipReason }[] } {
  if (typeof input !== "string") throw new TypeError("CSV 텍스트가 필요해요");
  const records = readRecords(input);
  const header = records.shift();
  const names = { date: ["date", "일자"], amount: ["amount", "금액"], raw_name: ["raw_name", "가맹점"], payment_method: ["payment_method", "결제수단"] };
  const indexes = Object.fromEntries(Object.entries(names).map(([key, aliases]) => [key,
    header?.fields.findIndex((value) => aliases.includes(value.trim().toLowerCase())) ?? -1,
  ])) as Record<keyof typeof names, number>;
  const ambiguous = Object.values(names).some((aliases) =>
    (header?.fields.filter((value) => aliases.includes(value.trim().toLowerCase())).length ?? 0) !== 1);
  if (!header || header.invalid || Object.values(indexes).some((index) => index < 0) || ambiguous) {
    return { transactions: [], skipped: [{ line: header?.line ?? 1, reason: "invalid_header" }] };
  }
  const transactions: Transaction[] = [];
  const skipped: { line: number; reason: CsvSkipReason }[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    let reason: CsvSkipReason | undefined;
    if (record.invalid) reason = "invalid_csv";
    else if (record.fields.length !== header.fields.length) reason = "invalid_columns";
    if (reason) { skipped.push({ line: record.line, reason }); continue; }
    const date = parseCsvDate(record.fields[indexes.date]);
    const amount = parseWonAmount(record.fields[indexes.amount]);
    if (date === null || amount === null) {
      skipped.push({ line: record.line, reason: date === null ? "invalid_date" : "invalid_amount" }); continue;
    }
    const raw_name = record.fields[indexes.raw_name].trim();
    const payment_method = record.fields[indexes.payment_method].trim();
    const key = `${date}|${amount}|${encodeURIComponent(raw_name)}|${encodeURIComponent(payment_method)}`;
    const parsed = TransactionSchema.safeParse({ id: `csv:${key}`, date, amount, raw_name, payment_method, currency: "KRW", source: "csv" });
    if (!parsed.success) { skipped.push({ line: record.line, reason: "invalid_transaction" }); continue; }
    if (seen.has(key)) { skipped.push({ line: record.line, reason: "duplicate" }); continue; }
    seen.add(key);
    transactions.push(parsed.data);
  }
  return { transactions, skipped };
}

export const csvAdapter: InputAdapter = { id: "csv", async load(input) { return parseCsv(input).transactions; } };
