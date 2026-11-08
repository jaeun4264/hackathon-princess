import { loadCatalog } from "../catalog";
import { CatalogServiceSchema, GmailMessageLiteSchema, GmailParseResultSchema, TransactionSchema } from "../schemas";
import type { CatalogService, GmailMessageLite, GmailParseResult } from "../types";
import type { InputAdapter } from "./types";
import { parseStoreReceipt, STORE_SENDER_ADDRESSES, storeOf } from "./store-receipts";
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
  const senders = [...domains({ services }), ...STORE_SENDER_ADDRESSES].map((sender) => `from:${sender}`);
  return `newer_than:6m {${[...senders, "영수증", "결제", "receipt", "invoice", "payment"].join(" ")}}`;
}

type AmountHit<T> = { index: number; value: T; key: string };

// 금액이 여러 개(상품가·부가세·합계 등)일 때 결제 금액을 가리키는 말. 앞쪽일수록 우선해요.
// 'Subtotal'·'소계'는 일부러 넣지 않아요 (\btotal은 Subtotal 안에서 맞지 않아요).
const TOTAL_LABELS: RegExp[] = [
  /총\s*결제\s*금액/gu, /최종\s*결제\s*금액/gu, /결제\s*금액/gu, /청구\s*금액/gu, /결제된\s*금액/gu,
  /\b(?:amount\s+(?:paid|charged)|total\s+(?:paid|charged|due))\b/giu, /\bgrand\s+total\b/giu, /\border\s+total\b/giu,
  /합\s*계/gu, /총\s*(?:금액|액)/gu, /\btotal\b/giu,
];
const LABEL_WINDOW = 40; // 라벨 뒤 이 글자 수 안에 오는 첫 금액만 봐요 (줄을 넘지 않게)

/**
 * 금액 후보 중 결제 금액 하나를 골라요.
 * 1) 서로 다른 금액이 하나뿐이면 그것. 2) 아니면 합계 라벨 바로 뒤의 금액(우선순위 높은 라벨부터).
 * 같은 순위 라벨이 서로 다른 금액을 가리키면 추측하지 않아요(null).
 */
function pickAmount<T>(text: string, hits: AmountHit<T>[]): T | null {
  const distinct = new Map(hits.map((hit) => [hit.key, hit.value]));
  if (distinct.size === 1) return [...distinct.values()][0];
  if (distinct.size === 0) return null;
  for (const label of TOTAL_LABELS) {
    const chosen = new Map<string, T>();
    for (const match of text.matchAll(label)) {
      const end = (match.index ?? 0) + match[0].length;
      const lineEnd = text.indexOf("\n", end);
      const limit = Math.min(end + LABEL_WINDOW, lineEnd === -1 ? Infinity : lineEnd);
      const next = hits.filter((hit) => hit.index >= end && hit.index < limit).sort((a, b) => a.index - b.index)[0];
      if (next) chosen.set(next.key, next.value);
    }
    if (chosen.size === 1) return [...chosen.values()][0];
    if (chosen.size > 1) return null;
  }
  return null;
}

function extractWon(text: string): number | null {
  const hits: AmountHit<number>[] = [];
  const patterns = [/(?:₩|\bKRW)\s*([+-]?\d[\d,]*(?:\.\d+)?)/giu, /(?:^|[^\d.,+\-])([+-]?\d[\d,]*(?:\.\d+)?)\s*원/gu];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parseWonAmount(match[1]);
      const index = (match.index ?? 0) + match[0].indexOf(match[1]);
      if (amount !== null) hits.push({ index, value: amount, key: String(amount) });
    }
  }
  return pickAmount(text, hits);
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

/** 외화 결제 금액. 하나뿐이거나 합계 라벨 바로 뒤에 있을 때만 돌려줘요 (여러 통화가 섞여도 라벨이 가리키면 그것). */
function extractForeign(text: string): { currency: ForeignCurrency; amount: number } | null {
  const hits: AmountHit<{ currency: ForeignCurrency; amount: number }>[] = [];
  for (const currency of FOREIGN_CURRENCIES) {
    for (const pattern of foreignPatterns[currency]) {
      for (const match of text.matchAll(pattern)) {
        const amount = parseForeignNumber(match[1], currency);
        if (amount !== null) hits.push({ index: match.index ?? 0, value: { currency, amount }, key: `${currency}:${amount}` });
      }
    }
  }
  return pickAmount(text, hits);
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
    const parts = Object.fromEntries(seoulDate.formatToParts(new Date(message.received_at)).map((part) => [part.type, part.value]));
    const seoul = `${parts.year}-${parts.month}-${parts.day}`;
    // 앱 마켓 영수증: 본문 항목별로 서비스명·금액을 읽고, 구독·무료 체험 항목만 결제로 남겨요 (단건 구매는 빼요).
    // 영수증이 자동 갱신을 명시하므로 renewal을 붙여요. 무료 체험은 0원 결제 + 종료일·이후 금액이에요.
    const store = storeOf(message);
    const storeItems = store ? parseStoreReceipt(store, message.text) : null;
    if (store && storeItems) {
      const recurring = storeItems.filter((item) => item.kind !== "one_time");
      if (recurring.length === 0) { result.skipped.push({ message_id: message.id, reason: "one_time" }); continue; }
      recurring.forEach((item, index) => {
        result.transactions.push(TransactionSchema.parse({
          id: recurring.length === 1 ? `gmail:${message.id}` : `gmail:${message.id}:${index + 1}`,
          date: seoul, amount: item.amount, currency: "KRW", raw_name: item.name, payment_method: store, source: "gmail",
          ...(item.renewal ? { renewal: item.renewal } : {}),
        }));
      });
      continue;
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
