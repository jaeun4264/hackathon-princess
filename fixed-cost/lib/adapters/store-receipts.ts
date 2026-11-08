import type { GmailMessageLite, Interval, Renewal } from "../types";

// 앱 마켓(Apple App Store·Google Play) 영수증은 발신자가 늘 마켓이라, 발신자 이름 대신 본문의 항목에서 서비스명을 읽어요.
// 형식은 실제 영수증 메일(2026-11-08, Apple 구독 1통·Google Play 무료 체험 구독 1통)을 앱과 같은 방식으로 텍스트로 바꿔 확인했어요.
// 형식이 예상과 다르면 추측하지 않고 null을 돌려줘서 기존 일반 처리로 넘겨요.

export type StoreId = "apple" | "google_play";
export type StoreItemKind = "subscription" | "one_time" | "free_trial";
export interface StoreItem {
  name: string;
  amount: number;
  kind: StoreItemKind;
  /** 구독·무료 체험일 때만. 영수증에 적힌 값만 넣고 모르면 null. */
  renewal: Renewal | null;
}

/** Gmail 검색어에 넣는 정확한 발신 주소. 도메인 전체(google.com)를 넣으면 구글의 모든 메일이 80통 상한을 차지해요. */
export const STORE_SENDER_ADDRESSES = ["no_reply@email.apple.com", "googleplay-noreply@google.com"] as const;

export function storeOf(message: Pick<GmailMessageLite, "from_name" | "from_domain">): StoreId | null {
  const domain = message.from_domain.trim().toLowerCase();
  if (domain === "email.apple.com") return "apple";
  if (domain === "google.com" && message.from_name.trim() === "Google Play") return "google_play";
  return null;
}

const MAX_NAME = 80;
/** 서비스명으로 쓸 수 있는 줄인지. 이 값은 서버·AI로 가므로 메일 주소·금액·숫자뿐인 줄은 받지 않아요. */
function safeName(raw: string): string | null {
  const name = raw.replace(/\s+/gu, " ").trim();
  if (!name || Array.from(name).length > MAX_NAME) return null;
  if (/@|₩|https?:/iu.test(name) || !/\p{L}/u.test(name)) return null;
  return name;
}

function won(raw: string): number | null {
  const value = Number(raw.replace(/,/gu, ""));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** 연·월·일 → 'YYYY-MM-DD'. 달력에 없는 날짜면 null. */
function isoDate(year: string, month: string, day: string): string | null {
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** 요금제 표기의 주기. 적혀 있지 않으면 null (추측하지 않아요). */
function intervalOf(text: string): Interval | null {
  if (/월간|매월|1\s*개월|monthly/iu.test(text)) return "monthly";
  if (/연간|매년|1\s*년|yearly|annual/iu.test(text)) return "yearly";
  return null;
}

function lines(text: string): string[] {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

const APPLE_RENEW = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일에\s*갱신\s*예정$/u;

/**
 * Apple 영수증. 항목 구간은 'Apple 계정:' 다음부터 '청구 및 지불' 전까지예요.
 * '청구 및 지불' 아래에는 이름·주소가 있어서 절대 읽지 않아요.
 * 구독 항목: 서비스명 / 요금제(월간) / 개발사 / 'YYYY년 M월 D일에 갱신 예정' / ₩금액 / ₩부가세 안내
 * 단건 구매: '앱 내 구입' 표시
 */
function parseApple(text: string): StoreItem[] | null {
  const all = lines(text);
  const start = all.findIndex((line) => /^Apple\s*계정\s*:?/u.test(line));
  const end = all.findIndex((line, index) => index > start && /^청구\s*및\s*지불$/u.test(line));
  if (start === -1 || end === -1) return null;
  const section = all.slice(start + 1, end).filter((line) => !line.includes("@"));
  const items: StoreItem[] = [];
  for (let index = 0; index < section.length; index += 1) {
    const renew = APPLE_RENEW.exec(section[index]);
    if (!renew) continue;
    const name = index >= 3 ? safeName(section[index - 3]) : null;
    const priceLine = section.slice(index + 1).find((line) => /^₩\s*[\d,]+$/u.test(line));
    const amount = priceLine ? won(priceLine.replace(/^₩\s*/u, "")) : null;
    const nextDate = isoDate(renew[1], renew[2], renew[3]);
    if (!name || amount === null || !nextDate) return null; // 구조가 다르면 추측하지 않아요
    items.push({
      name, amount, kind: "subscription",
      renewal: { interval: intervalOf(section[index - 2]), next_date: nextDate, trial_end: null, price_after_trial: null },
    });
  }
  if (items.length > 0) return items;
  if (section.some((line) => /^앱\s*내\s*구입$/u.test(line))) return [{ name: "앱 내 구입", amount: 0, kind: "one_time", renewal: null }];
  return null;
}

/**
 * Google Play 영수증. 항목 구간은 '상품 가격' 줄 다음부터 '합계:' 전까지예요 (본문이 76자 근처에서 줄바꿈될 수 있어 이어 붙여요).
 * 항목: '상품명 (개발자: …) ₩금액' 뒤에 '자동 갱신되는 정기 결제'가 있으면 구독.
 * 금액이 0원이고 본문에 '무료 체험'이 있으면 무료 체험 구독이에요. 안내 문단에서 종료일과 이후 금액을 읽어요:
 * '무료 체험은 2027. 10. 16.에 종료됩니다 … (현재 매월 ₩7,500)의 정기 구독 요금이 자동 청구됩니다'
 */
function parseGooglePlay(text: string): StoreItem[] | null {
  const all = lines(text);
  const start = all.findIndex((line) => /^상품\s+가격$/u.test(line));
  const end = all.findIndex((line, index) => index > start && /^합계\s*:/u.test(line));
  if (start === -1 || end === -1) return null;
  const joined = all.slice(start + 1, end).join(" ").replace(/\s+/gu, " ");
  const intro = all.slice(0, start).join(" ").replace(/\s+/gu, " ");
  const freeTrial = /무료\s*체험/u.test(intro);
  const trialEndMatch = /무료\s*체험은\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*에\s*종료/u.exec(intro);
  const trialEnd = trialEndMatch ? isoDate(trialEndMatch[1], trialEndMatch[2], trialEndMatch[3]) : null;
  const afterMatch = /\(\s*현재\s*(매월|매년)\s*₩\s*([\d,]+)\s*\)/u.exec(intro);
  const items: StoreItem[] = [];
  const matches = [...joined.matchAll(/(.+?)\s*\(개발자:\s*[^)]*\)\s*₩\s*([\d,]+)(\s*자동\s*갱신되는\s*정기\s*결제)?/gu)];
  for (const match of matches) {
    const name = safeName(match[1]);
    const amount = won(match[2]);
    if (!name || amount === null) return null;
    if (!match[3]) { items.push({ name, amount, kind: "one_time", renewal: null }); continue; }
    if (amount === 0 && freeTrial) {
      // 안내 문단은 영수증 전체에 하나라서, 무료 체험 항목이 하나일 때만 그 항목의 값으로 써요.
      const single = matches.length === 1;
      items.push({
        name, amount, kind: "free_trial",
        renewal: {
          interval: single && afterMatch ? intervalOf(afterMatch[1]) : null,
          next_date: null,
          trial_end: single ? trialEnd : null,
          price_after_trial: single && afterMatch ? won(afterMatch[2]) : null,
        },
      });
      continue;
    }
    items.push({ name, amount, kind: "subscription", renewal: { interval: null, next_date: null, trial_end: null, price_after_trial: null } });
  }
  return items.length > 0 ? items : null;
}

/** 마켓 영수증의 항목들. 형식을 확인할 수 없으면 null (호출한 쪽은 기존 일반 처리로 넘어가요). */
export function parseStoreReceipt(store: StoreId, text: string): StoreItem[] | null {
  return store === "apple" ? parseApple(text) : parseGooglePlay(text);
}
