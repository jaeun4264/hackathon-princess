// Gmail 영수증 불러오기 (FRONTEND.md 4부 3절 S0 Gmail 흐름 1~9).
// - Google Identity Services 토큰 방식, 범위 gmail.readonly. 클라이언트 보안 비밀번호는 쓰지 않아요.
// - 액세스 토큰과 메일 원문은 이 모듈의 지역 변수에만 잠깐 두고, localStorage·쿠키·서버·로그에 남기지 않아요.
// - 검색어는 buildGmailQuery만 써요. 메일 → GmailMessageLite → parseGmailMessages까지 브라우저에서 끝나요.
import { buildGmailQuery, parseGmailMessages, type FxRates } from "../adapters/gmail";
import { loadCatalog } from "../catalog";
import type { Catalog, GmailMessageLite, GmailParseResult } from "../types";
import gmailMock from "../mocks/gmail-messages.json";
import { fetchFxRates } from "./fx";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
// Gmail 사용량: 사용자당 분당 6,000 단위. messages.get(format=full)은 60단위, messages.list는 5단위.
// 80통 × 60 = 4,800 + 검색 몇 번 → 한 번 불러오기가 분당 한도 안에 들어와요.
export const MAX_MESSAGES = 80;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_TEXT = 20_000;

export type GmailErrorCode = "not_configured" | "denied" | "network" | "rate_limited";
export class GmailImportError extends Error {
  constructor(readonly code: GmailErrorCode) {
    super(code);
    this.name = "GmailImportError";
  }
}

export type GmailProgress = { stage: "auth" } | { stage: "searching"; found: number } | { stage: "reading"; done: number; total: number };

// ---------- 순수 함수 (테스트 대상) ----------
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8361;|&#x20a9;/gi, "₩")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** 'Netflix <info@account.netflix.com>' → { name: 'Netflix', domain: 'account.netflix.com' } */
export function parseFrom(header: string): { name: string; domain: string } {
  const angle = header.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (angle ? angle[2] : header).trim();
  const domain = address.includes("@") ? address.split("@").pop()!.trim().toLowerCase() : "";
  const name = (angle ? angle[1] : "").trim() || address.split("@")[0] || "";
  return { name, domain };
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
export interface GmailApiMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

function findBody(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findBody(child, mime);
    if (found) return found;
  }
  return null;
}

/** Gmail API 메시지 → GmailMessageLite. text/plain을 먼저 쓰고, 없으면 HTML에서 태그를 지워요. 2만 자까지. */
export function toGmailMessageLite(message: GmailApiMessage): GmailMessageLite | null {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";
  const { name, domain } = parseFrom(header("from"));
  const millis = Number(message.internalDate);
  if (!message.id || !domain || !Number.isFinite(millis)) return null;
  let text = "";
  try {
    const plain = findBody(message.payload, "text/plain");
    const html = plain ? null : findBody(message.payload, "text/html");
    text = plain ? decodeBase64Url(plain) : html ? stripHtml(decodeBase64Url(html)) : "";
  } catch {
    text = "";
  }
  return {
    id: message.id,
    received_at: new Date(millis).toISOString(),
    from_name: name,
    from_domain: domain,
    subject: header("subject").slice(0, 500),
    text: text.slice(0, MAX_TEXT),
  };
}

// ---------- Google 로그인 (토큰 방식) ----------
interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}
interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}
type GoogleWindow = Window & { google?: { accounts?: { oauth2?: GoogleOAuth2 } } };

function loadGis(): Promise<GoogleOAuth2> {
  const existing = (window as GoogleWindow).google?.accounts?.oauth2;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const oauth2 = (window as GoogleWindow).google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new GmailImportError("network"));
    };
    script.onerror = () => reject(new GmailImportError("network"));
    document.head.appendChild(script);
  });
}

function requestToken(oauth2: GoogleOAuth2, clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new GmailImportError("denied"));
      },
      // 창을 닫거나 팝업이 막히면 여기로 와요.
      error_callback: () => reject(new GmailImportError("denied")),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

/** 사용량 한도에 걸린 응답인지. Gmail은 429, 또는 이유가 rateLimitExceeded류인 403을 보내요. */
async function isRateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  try {
    const body = (await response.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string } };
    const reasons = (body.error?.errors ?? []).map((entry) => entry.reason ?? "");
    return reasons.some((reason) => /rateLimit|quotaExceeded/i.test(reason)) || body.error?.status === "RESOURCE_EXHAUSTED";
  } catch {
    return false;
  }
}

/** Gmail API GET. 한도에 걸리면 1초 → 2초 → 4초 기다렸다가 다시 시도해요. 권한 문제는 denied, 나머지는 network. */
export async function gmailGet<T>(
  url: string,
  token: string,
  options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new GmailImportError("network");
    }
    if (response.ok) return (await response.json()) as T;
    if (await isRateLimited(response)) {
      if (attempt >= RETRY_DELAYS_MS.length) throw new GmailImportError("rate_limited");
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new GmailImportError("denied");
    throw new GmailImportError("network");
  }
}

async function fetchMessages(token: string, query: string, onProgress: (progress: GmailProgress) => void): Promise<GmailMessageLite[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(`${API}/messages?${params}`, token);
    ids.push(...(page.messages ?? []).map((entry) => entry.id));
    pageToken = page.nextPageToken;
    onProgress({ stage: "searching", found: ids.length });
  } while (pageToken && ids.length < MAX_MESSAGES);

  const targets = ids.slice(0, MAX_MESSAGES);
  const output: GmailMessageLite[] = [];
  let done = 0;
  // 한 번에 5통씩 받아요 (Gmail 사용량 한도 보호).
  for (let start = 0; start < targets.length; start += 5) {
    const batch = await Promise.all(targets.slice(start, start + 5).map((id) =>
      gmailGet<GmailApiMessage>(`${API}/messages/${encodeURIComponent(id)}?format=full`, token)));
    for (const message of batch) {
      const lite = toGmailMessageLite(message);
      if (lite) output.push(lite);
    }
    done += batch.length;
    onProgress({ stage: "reading", done, total: targets.length });
  }
  return output;
}

// ---------- 공개 함수 ----------
export interface GmailImportOptions {
  mock?: boolean;
  clientId?: string;
  catalog?: Catalog;
  onProgress?: (progress: GmailProgress) => void;
  /** 테스트용. 없으면 fetchFxRates()로 받아요. null이면 외화 영수증을 건너뛰어요. */
  fx?: FxRates | null;
}

export type GmailImportResult = GmailParseResult & {
  mailCount: number;
  /** 환율로 환산한 외화 영수증 수와 환율 기준일 */
  converted: number;
  fxDate: string | null;
  /** 환율을 받았는지. 받았는데도 건너뛴 외화는 금액을 특정하지 못한 것이에요. */
  fxAvailable: boolean;
};

function withFx(result: GmailParseResult, mailCount: number, fx: FxRates | null): GmailImportResult {
  const converted = result.transactions.filter((tx) => tx.original_currency !== undefined).length;
  return { ...result, mailCount, converted, fxDate: converted > 0 && fx ? fx.date : null, fxAvailable: fx !== null };
}

/** Gmail에서 영수증을 읽어 결제 항목으로 바꿔요. 메일 원문은 이 함수가 끝나면 사라져요. */
export async function importFromGmail(options: GmailImportOptions = {}): Promise<GmailImportResult> {
  const catalog = options.catalog ?? loadCatalog();
  const onProgress = options.onProgress ?? (() => {});
  const mock = options.mock ?? process.env.NEXT_PUBLIC_USE_MOCK === "1";

  if (mock) {
    // 모의 모드: Google에 접속하지 않아요.
    onProgress({ stage: "searching", found: gmailMock.messages.length });
    const fx = options.fx !== undefined ? options.fx : await fetchFxRates({ mock: true });
    const result = parseGmailMessages(gmailMock.messages, catalog, fx ? { fx } : {});
    return withFx(result, gmailMock.messages.length, fx);
  }

  const clientId = options.clientId ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new GmailImportError("not_configured");

  onProgress({ stage: "auth" });
  const oauth2 = await loadGis();
  let token: string | null = await requestToken(oauth2, clientId);
  try {
    let messages: GmailMessageLite[] | null = await fetchMessages(token, buildGmailQuery(catalog), onProgress);
    const mailCount = messages.length;
    // 환율 요청에는 고정된 통화 목록만 보내요. 실패해도 계속 진행(외화만 건너뜀).
    const fx = options.fx !== undefined ? options.fx : await fetchFxRates({ mock: false });
    const result = parseGmailMessages(messages, catalog, fx ? { fx } : {});
    messages = null; // 원문은 변환 직후 버려요.
    return withFx(result, mailCount, fx);
  } finally {
    // 다 읽으면 권한을 바로 돌려줘요. 토큰은 저장하지 않아요.
    const used = token;
    token = null;
    try {
      oauth2.revoke(used);
    } catch {
      // 무시
    }
  }
}

/** 건너뛴 메일을 화면 안내용으로 셉니다. */
export function summarizeSkipped(skipped: GmailParseResult["skipped"]) {
  const count = (reason: GmailParseResult["skipped"][number]["reason"]) => skipped.filter((entry) => entry.reason === reason).length;
  return { foreign: count("foreign_currency"), noAmount: count("no_amount"), notReceipt: count("not_receipt"), duplicate: count("duplicate") };
}
