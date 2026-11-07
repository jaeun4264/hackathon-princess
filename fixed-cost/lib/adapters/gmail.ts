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

export const FOREIGN_CURRENCIES = ["USD", "EUR", "JPY", "GBP"] as const;
export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];
/** 환율: 1 외화 단위당 원화. date는 환율 기준일. */
export interface FxRates {
  date: string;
  krwPer: Partial<Record<ForeignCurrency, number>>;
}

const foreignPatterns: Record<ForeignCurrency, RegExp[]> = {
  USD: [/(?:US\$|\$|\bUSD)\s*(\d[\d,]*(?:\.\d{1,2})?)/giu, /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:USD|달러)\b/giu],
  EUR: [/(?:€|\bEUR)\s*(\d[\d.,]*)/giu, /(\d[\d.,]*)\s*(?:€|EUR\b|유로)/giu],
  JPY: [/(?:¥|\bJPY)\s*(\d[\d,]*)/giu, /(\d[\d,]*)\s*(?:JPY\b|엔)/giu],
  GBP: [/(?:£|\bGBP)\s*(\d[\d,]*(?:\.\d{1,2})?)/giu, /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:GBP\b|파운드)/giu],
};

function parseForeignNumber(raw: string, currency: ForeignCurrency): number | null {
  // 유로는 '9,99'처럼 쉼표가 소수점일 수 있어요. 마지막 구분자 뒤가 두 자리면 소수점으로 봐요.
  let text = raw.trim();
  if (currency === "EUR" && /,\d{2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 외화 금액 하나만 분명할 때만 돌려줘요 (여러 통화·여러 금액이면 추측하지 않아요). */
function extractForeign(text: string): { currency: ForeignCurrency; amount: number } | null {
  const found = new Map<string, { currency: ForeignCurrency; amount: number }>();
  for (const currency of FOREIGN_CURRENCIES) {
    for (const pattern of foreignPatterns[currency]) {
      for (const match of text.matchAll(pattern)) {
        const amount = parseForeignNumber(match[1], currency);
        if (amount !== null) found.set(`${currency}:${amount}`, { currency, amount });
      }
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

function paymentMethod(sender: string, services: CatalogService[]): string {
  const providers = new Set(["apple", "google_play", "kakaopay", "naverpay"]);
  const matches = services.filter((service) => providers.has(service.id) &&
    service.email_domains.some((domain) => domainPattern.test(domain.trim().toLowerCase()) && matchesDomain(sender, domain.trim().toLowerCase())));
  // 확인된 카탈로그 도메인이 결제 사업자를 특정할 때만 이름을 붙여요.
  return matches.length === 1 ? matches[0].id : "unknown";
}

/**
 * 받은 메일을 결제 항목으로 바꿔요. 순수 함수예요.
 * fx(환율)를 주면 외화 영수증을 원화로 환산해 original_currency·original_amount·fx_date와 함께 넣어요.
 * fx가 없거나 그 통화의 환율이 없으면 예전처럼 foreign_currency로 건너뛰어요.
 */
export function parseGmailMessages(messages: GmailMessageLite[], catalog: GmailCatalog, options: { fx?: FxRates } = {}): GmailParseResult {
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
    let amount = extractWon(text);
    let fxFields: { original_currency: ForeignCurrency; original_amount: number; fx_date: string } | null = null;
    if (amount === null) {
      const foreignOnly = /\$|\b(?:USD|EUR|JPY|GBP)\b|€|¥|£/iu.test(text) && !/₩|\bKRW\b|\d[\d,.]*\s*원/iu.test(text);
      const foreign = foreignOnly ? extractForeign(text) : null;
      const rate = foreign ? options.fx?.krwPer[foreign.currency] : undefined;
      if (!foreign || !rate || !(rate > 0) || !options.fx) {
        result.skipped.push({ message_id: message.id, reason: foreignOnly ? "foreign_currency" : "no_amount" }); continue;
      }
      // 환산은 코드가 해요(반올림한 원). 카드 청구액(수수료 포함)과 다를 수 있어 화면이 '확인 필요'로 보여 줘요.
      amount = Math.round(foreign.amount * rate);
      fxFields = { original_currency: foreign.currency, original_amount: foreign.amount, fx_date: options.fx.date };
    }
    const parts = Object.fromEntries(seoulDate.formatToParts(new Date(message.received_at)).map((part) => [part.type, part.value]));
    const seoul = `${parts.year}-${parts.month}-${parts.day}`;
    const transaction = TransactionSchema.safeParse({
      id: `gmail:${message.id}`, date: seoul, amount, currency: "KRW", raw_name: message.from_name,
      payment_method: paymentMethod(sender, services), source: "gmail", ...(fxFields ?? {}),
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
