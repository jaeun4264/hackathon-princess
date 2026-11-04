import { loadCatalog } from "../catalog";
import { CatalogServiceSchema, GmailMessageLiteSchema, GmailParseResultSchema, TransactionSchema } from "../schemas";
import type { CatalogService, GmailMessageLite, GmailParseResult } from "../types";
import type { InputAdapter } from "./types";
import { parseWonAmount } from "./validation";

const receiptWords = /영수증|결제|\b(?:receipt|invoice|payment)\b/iu;
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
type GmailCatalog = { services: CatalogService[] };
const seoulDate = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

function domains(catalog: GmailCatalog): string[] {
  return [...new Set(catalog.services.flatMap((service) => service.email_domains)
    .map((domain) => domain.trim().toLowerCase()).filter((domain) => domainPattern.test(domain)))].sort();
}

function matchesDomain(sender: string, allowed: string): boolean {
  return sender === allowed || sender.endsWith(`.${allowed}`);
}

export function buildGmailQuery(catalog: GmailCatalog): string {
  const services = CatalogServiceSchema.array().parse(catalog.services);
  const senders = domains({ services }).map((domain) => `from:${domain}`);
  return `newer_than:6m {${[...senders, "영수증", "결제", "receipt", "invoice", "payment"].join(" ")}}`;
}

function extractWon(text: string): number | null {
  const amounts = new Set<number>();
  const patterns = [/(?:₩|\bKRW)\s*([+-]?\d[\d,]*(?:\.\d+)?)/giu, /(?:^|[^\d.,+\-])([+-]?\d[\d,]*(?:\.\d+)?)\s*원/gu];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parseWonAmount(match[1]);
      if (amount !== null) amounts.add(amount);
    }
  }
  // 합계와 부분 금액 중 어느 것인지 알 수 없으면 추측하지 않아요.
  return amounts.size === 1 ? [...amounts][0] : null;
}

function paymentMethod(sender: string, services: CatalogService[]): string {
  const providers = new Set(["apple", "google_play", "kakaopay", "naverpay"]);
  const matches = services.filter((service) => providers.has(service.id) &&
    service.email_domains.some((domain) => domainPattern.test(domain.trim().toLowerCase()) && matchesDomain(sender, domain.trim().toLowerCase())));
  // 확인된 카탈로그 도메인이 결제 사업자를 특정할 때만 이름을 붙여요.
  return matches.length === 1 ? matches[0].id : "unknown";
}

export function parseGmailMessages(messages: GmailMessageLite[], catalog: GmailCatalog): GmailParseResult {
  const parsed = GmailMessageLiteSchema.array().safeParse(messages);
  if (!parsed.success) throw new TypeError("Gmail 메시지 형식·수신일·본문 길이를 확인해 주세요");
  const services = CatalogServiceSchema.array().parse(catalog.services);
  const allowed = domains({ services });
  const result: GmailParseResult = { transactions: [], skipped: [] };
  const seen = new Set<string>();
  for (const message of parsed.data) {
    if (seen.has(message.id)) { result.skipped.push({ message_id: message.id, reason: "duplicate" }); continue; }
    seen.add(message.id);
    const sender = message.from_domain.trim().toLowerCase();
    const text = `${message.subject}\n${message.text}`;
    if (!message.from_name.trim() || (!allowed.some((domain) => matchesDomain(sender, domain)) && !receiptWords.test(text))) {
      result.skipped.push({ message_id: message.id, reason: "not_receipt" }); continue;
    }
    const amount = extractWon(text);
    if (amount === null) {
      const foreignOnly = /\$|\b(?:USD|EUR|JPY|GBP)\b|€|¥|£/iu.test(text) && !/₩|\bKRW\b|\d[\d,.]*\s*원/iu.test(text);
      result.skipped.push({ message_id: message.id, reason: foreignOnly ? "foreign_currency" : "no_amount" }); continue;
    }
    const parts = Object.fromEntries(seoulDate.formatToParts(new Date(message.received_at)).map((part) => [part.type, part.value]));
    const seoul = `${parts.year}-${parts.month}-${parts.day}`;
    const transaction = TransactionSchema.safeParse({
      id: `gmail:${message.id}`, date: seoul, amount, currency: "KRW", raw_name: message.from_name,
      payment_method: paymentMethod(sender, services), source: "gmail",
    });
    if (!transaction.success) { result.skipped.push({ message_id: message.id, reason: "no_amount" }); continue; }
    result.transactions.push(transaction.data);
  }
  return GmailParseResultSchema.parse(result);
}

export const gmailAdapter: InputAdapter = {
  id: "gmail",
  async load(input) {
    const parsed = GmailMessageLiteSchema.array().safeParse(input);
    if (!parsed.success) throw new TypeError("Gmail 메시지 배열이 필요해요");
    return parseGmailMessages(parsed.data, loadCatalog()).transactions;
  },
};
