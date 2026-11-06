import { createHash } from "node:crypto";
import { z } from "zod";
import { loadCatalog, validateCatalog } from "../catalog";
import { UserProfileSchema, TransactionSchema } from "../schemas";
import type { BenefitResult, Catalog } from "../types";
import { isStale } from "../rules/stale";
import { callJson } from "./client";
import { judgeBenefit } from "./benefits";
import type { BenefitTarget } from "./benefits";
import type { LlmClient } from "./types";
import { createRateLimiter } from "./limits";

const RequestSchema = z.strictObject({ user: UserProfileSchema.extend({ school: z.string().max(200) }),
  targets: z.array(z.strictObject({ kind: z.enum(["benefit", "bundle"]), id: z.string().min(1).max(200) })).max(50) });
export const MAX_BENEFITS_BODY_BYTES = 20 * 1024;
export const BENEFIT_CACHE_TTL_MS = 30 * 60 * 1000;
export const BENEFIT_CACHE_MAX_ENTRIES = 256;
const error = (code: string, message: string, status = 400) => Response.json({ error: { code, message } }, { status });

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BENEFITS_BODY_BYTES) throw new RangeError();
  if (!request.body) throw new Error();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BENEFITS_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new RangeError(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function createBenefitsHandler(options: { getCatalog?: () => Catalog; llm?: LlmClient; today?: () => string;
  now?: () => number; bundlesEnabled?: () => boolean; requestLimiter?: ReturnType<typeof createRateLimiter> } = {}) {
  const cache = new Map<string, { result: BenefitResult; expires: number }>();
  const now = options.now ?? Date.now;
  const limiter = options.requestLimiter ?? createRateLimiter();
  const llm = options.llm ?? { callJson };
  return async function POST(request: Request): Promise<Response> {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) return error("invalid_request", "JSON 요청이 필요해요");
    let raw: unknown;
    try { raw = await readBody(request); }
    catch (cause) { return error(cause instanceof RangeError ? "body_too_large" : "invalid_json", "요청 본문을 확인해 주세요"); }
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return error("invalid_request", "프로필과 혜택 목록을 확인해 주세요");
    if (limiter.reserve(Number.MAX_SAFE_INTEGER) !== "ok") return error("rate_limit", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
    let targets: BenefitTarget[], today: string;
    try {
      today = TransactionSchema.shape.date.parse((options.today ?? (() => new Date().toISOString().slice(0, 10)))());
      if (parsed.data.targets.some((target) => target.kind === "bundle") &&
        !(options.bundlesEnabled ?? (() => process.env.ENABLE_BUNDLE_AI === "1"))()) return error("bundle_not_supported", "묶음 자격 판정은 아직 지원하지 않아요");
      const catalog = validateCatalog((options.getCatalog ?? loadCatalog)()).catalog;
      targets = [];
      for (const target of parsed.data.targets) {
        const item = target.kind === "benefit" ? catalog.benefits.find((entry) => entry.id === target.id) : catalog.bundles.find((entry) => entry.id === target.id);
        if (!item) return error("unknown_target", "등록된 혜택을 확인해 주세요");
        // 종류별 카탈로그에서 조회한 대상을 유지해요.
        targets.push({ kind: target.kind, item } as BenefitTarget);
      }
    } catch { return error("catalog_unavailable", "혜택 정보를 확인할 수 없어요", 503); }
    const results: BenefitResult[] = [];
    for (const target of targets) {
      // 원문 프로필은 저장하지 않아요. 조건·출처 변경도 캐시를 무효화해요.
      const user = parsed.data.user;
      const key = createHash("sha256").update(JSON.stringify([target.kind, target.item,
        [user.school, user.status, user.school_email, user.grade ?? null]])).digest("hex");
      const timestamp = now();
      for (const [id, entry] of cache) if (entry.expires <= timestamp) cache.delete(id);
      const cached = cache.get(key);
      const result = cached ? { ...structuredClone(cached.result), stale: isStale(target.item.checked_at, today) } :
        await judgeBenefit(target, user, llm, today);
      if (!cached && result.validation !== "ai_error") {
        if (cache.size >= BENEFIT_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(key, { result: structuredClone(result), expires: timestamp + BENEFIT_CACHE_TTL_MS });
      }
      results.push(result);
    }
    return Response.json({ results });
  };
}
