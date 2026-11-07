// 계약 파일 — 바꾸면 PR 제목에 [계약]. 3부(계약) 3절의 API를 브라우저에서 부르는 얇은 클라이언트예요.
// 원칙: 네트워크 오류·10초 타임아웃·429·모양이 틀린 응답은 던지지 않고 unknown/fallback으로 바꿔 돌려줘요.
// 그때 degraded: true를 같이 돌려줘서 화면이 "일부는 AI 확인을 못 했어요" 배너를 띄울 수 있게 해요.
import { z } from "zod";
import { loadCatalog } from "./catalog";
import { isStale } from "./rules/stale";
import { BenefitResultSchema, InterpretResultSchema, SuggestionTypeSchema } from "./schemas";
import type { BenefitResult, Catalog, Interval, InterpretResult, SuggestionType, Usage, UserProfile } from "./types";
import interpretMock from "./mocks/interpret.json";
import benefitsMock from "./mocks/benefits.json";
import messageMock from "./mocks/message.json";

export const API_TIMEOUT_MS = 10_000;

// ---------- 요청 모양 (계약 3절) ----------
export interface InterpretItemInput {
  key: string;
  raw_name: string;
  amount: number;
  interval: Interval;
  payment_method: string;
}
export interface BenefitTargetInput {
  kind: "benefit" | "bundle";
  id: string;
}
export interface MessageInput {
  type: SuggestionType;
  usage: Usage | null;
  service_name: string;
  params: { saving_monthly?: number; saving_yearly?: number; alt_name?: string };
}
export type EventInput =
  | { session_id: string; kind: "discovery"; payload: { found_count: number } }
  | { session_id: string; kind: "action"; payload: { suggestion_type: SuggestionType; status: "done" | "changed" | "kept" } }
  | { session_id: string; kind: "keep_reason"; payload: { reason: "maybe_later" | "heavy_use" | "other" } };

export interface ApiOptions {
  /** 기본값: NEXT_PUBLIC_USE_MOCK === '1' */
  mock?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** 모의 모드 인공 지연 (기본 300~800ms). 테스트에서는 0 */
  mockDelayMs?: number;
  /** 'YYYY-MM-DD'. stale 계산용 (기본: 오늘) */
  today?: string;
  /** 혜택 판정 실패 시 출처·확인일을 채울 카탈로그 (기본: loadCatalog()) */
  catalog?: Catalog;
}

// ---------- 응답 스키마 ----------
// results는 계약 3-1 그대로 검사해요. resolutions는 B5가 추가한 필드라 선택으로 읽고, 모양이 틀리면 무시해요.
const InterpretResponseSchema = z.object({ results: z.array(InterpretResultSchema) });
const ResolutionsSchema = z.array(z.object({ key: z.string(), suggested_service_id: z.string().nullable() }));
const BenefitsResponseSchema = z.object({ results: z.array(BenefitResultSchema) });
const MessageResponseSchema = z.object({ message: z.string(), source: z.enum(["ai", "fallback"]) });

// ---------- 공통 ----------
function isMockMode(options: ApiOptions): boolean {
  return options.mock ?? process.env.NEXT_PUBLIC_USE_MOCK === "1";
}

function todayString(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function delay(options: ApiOptions): Promise<void> {
  const ms = options.mockDelayMs ?? 300 + Math.floor(Math.random() * 500);
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

type PostOutcome = { ok: true; body: unknown } | { ok: false };

/** POST JSON. 실패(네트워크·타임아웃·2xx 아님·JSON 아님)는 전부 { ok: false }로 돌려줘요. */
async function postJson(path: string, payload: unknown, options: ApiOptions): Promise<PostOutcome> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);
  try {
    const response = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- T1 결제 해석 ----------
function unknownInterpret(key: string): InterpretResult {
  return { key, service_id: null, category: "기타", confidence: 0, reason: "", source: "unknown", needs_check: true };
}

/**
 * T1 결과. results는 "확정된" 해석만 담아요(AI 추정이면 service_id가 null, needs_check true).
 * suggestedServiceIds[key]는 AI·별칭이 추정한 후보 서비스 id예요. 구독 확인 화면(S1)에서
 * "혹시 ○○인가요?"로 보여 주고, 사용자가 맞다고 눌러야 service_id로 들어가요.
 */
export interface InterpretResponse {
  results: InterpretResult[];
  suggestedServiceIds: Record<string, string | null>;
  degraded: boolean;
}

function mockInterpret(items: InterpretItemInput[]): Omit<InterpretResponse, "degraded"> {
  const suggestedServiceIds: Record<string, string | null> = {};
  const results = items.map((item) => {
    const entry = interpretMock.entries.find(
      (candidate) => candidate.raw_name === item.raw_name && (!("amount" in candidate) || candidate.amount === item.amount),
    );
    suggestedServiceIds[item.key] = entry?.suggested_service_id ?? null;
    if (!entry) return unknownInterpret(item.key);
    return InterpretResultSchema.parse({
      key: item.key, service_id: entry.service_id, category: entry.category, confidence: entry.confidence,
      reason: entry.reason, source: entry.source, needs_check: entry.needs_check,
    });
  });
  return { results, suggestedServiceIds };
}

function readSuggestions(body: unknown, items: InterpretItemInput[]): Record<string, string | null> {
  const output: Record<string, string | null> = Object.fromEntries(items.map((item) => [item.key, null]));
  const raw = typeof body === "object" && body !== null ? (body as { resolutions?: unknown }).resolutions : undefined;
  const parsed = ResolutionsSchema.safeParse(raw);
  if (!parsed.success) return output;
  for (const entry of parsed.data) if (entry.key in output) output[entry.key] = entry.suggested_service_id;
  return output;
}

export async function interpret(
  items: InterpretItemInput[],
  options: ApiOptions = {},
): Promise<InterpretResponse> {
  if (items.length === 0) return { results: [], suggestedServiceIds: {}, degraded: false };
  if (isMockMode(options)) {
    await delay(options);
    return { ...mockInterpret(items), degraded: false };
  }
  // 계약에 있는 필드만 보내요 (결제 날짜·거래 id 등은 보내지 않음).
  const payload = { items: items.map(({ key, raw_name, amount, interval, payment_method }) => ({ key, raw_name, amount, interval, payment_method })) };
  const outcome = await postJson("/api/interpret", payload, options);
  const parsed = outcome.ok ? InterpretResponseSchema.safeParse(outcome.body) : null;
  // 같은 순서·같은 key가 아니면 응답 전체를 믿지 않아요.
  if (!parsed?.success || parsed.data.results.length !== items.length ||
    parsed.data.results.some((result, index) => result.key !== items[index].key)) {
    return {
      results: items.map((item) => unknownInterpret(item.key)),
      suggestedServiceIds: Object.fromEntries(items.map((item) => [item.key, null])),
      degraded: true,
    };
  }
  return { results: parsed.data.results, suggestedServiceIds: readSuggestions(outcome.ok ? outcome.body : null, items), degraded: false };
}

// ---------- T2 혜택 판정 ----------
function unknownBenefits(targets: BenefitTargetInput[], options: ApiOptions): BenefitResult[] {
  const catalog = options.catalog ?? loadCatalog();
  const today = options.today ?? todayString();
  const output: BenefitResult[] = [];
  for (const target of targets) {
    const item = target.kind === "benefit"
      ? catalog.benefits.find((entry) => entry.id === target.id)
      : catalog.bundles.find((entry) => entry.id === target.id);
    // 카탈로그에 없으면 출처를 지어낼 수 없으니 결과에서 빼요 (화면은 결과 없음 = 확인 필요로 처리).
    if (!item) continue;
    output.push({
      kind: target.kind, id: target.id, eligible: "unknown", quoted_conditions: [], missing_info: [], reason: "",
      source_url: item.source_url, checked_at: item.checked_at, stale: isStale(item.checked_at, today), validation: "ai_error",
    });
  }
  return output;
}

export async function benefits(
  user: UserProfile,
  targets: BenefitTargetInput[],
  options: ApiOptions = {},
): Promise<{ results: BenefitResult[]; degraded: boolean }> {
  if (targets.length === 0) return { results: [], degraded: false };
  if (isMockMode(options)) {
    await delay(options);
    const results = targets.flatMap((target) => {
      const found = benefitsMock.results.find((entry) => entry.kind === target.kind && entry.id === target.id);
      return found ? [BenefitResultSchema.parse(found)] : unknownBenefits([target], options);
    });
    return { results, degraded: false };
  }
  const payload = {
    user: { school: user.school, status: user.status, school_email: user.school_email, ...(user.grade === undefined ? {} : { grade: user.grade }) },
    targets: targets.map(({ kind, id }) => ({ kind, id })),
  };
  const outcome = await postJson("/api/benefits", payload, options);
  const parsed = outcome.ok ? BenefitsResponseSchema.safeParse(outcome.body) : null;
  if (!parsed?.success) return { results: unknownBenefits(targets, options), degraded: true };
  return { results: parsed.data.results, degraded: false };
}

// ---------- T3 제안 문장 ----------
/** message가 null이면 호출한 쪽이 규칙의 기본 문장을 그대로 써요. */
export async function message(
  input: MessageInput,
  options: ApiOptions = {},
): Promise<{ message: string | null; source: "ai" | "fallback"; degraded: boolean }> {
  if (isMockMode(options)) {
    await delay(options);
    const type = SuggestionTypeSchema.parse(input.type);
    return { message: messageMock.messages[type], source: "ai", degraded: false };
  }
  const outcome = await postJson("/api/message", input, options);
  const parsed = outcome.ok ? MessageResponseSchema.safeParse(outcome.body) : null;
  if (!parsed?.success) return { message: null, source: "fallback", degraded: true };
  return { message: parsed.data.message, source: parsed.data.source, degraded: false };
}

// ---------- F7 익명 집계 ----------
/** 실패는 화면에 보이지 않게 1회 재시도 후 포기해요. 결제 내역·서비스명·금액은 보내지 않아요. */
export async function events(input: EventInput, options: ApiOptions = {}): Promise<{ ok: boolean }> {
  if (isMockMode(options)) {
    await delay({ ...options, mockDelayMs: options.mockDelayMs ?? 0 });
    return { ok: true };
  }
  const payload = { session_id: input.session_id, kind: input.kind, payload: input.payload };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcome = await postJson("/api/events", payload, options);
    if (outcome.ok) return { ok: true };
  }
  return { ok: false };
}
