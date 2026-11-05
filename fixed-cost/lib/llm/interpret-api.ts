import { loadCatalog } from "../catalog";
import { InterpretRequestSchema } from "../rules/interpret";
import { interpretItems, unknownInterpretation } from "./interpret";
import { createRateLimiter } from "./limits";
import type { Catalog } from "../types";
import type { LlmClient } from "./types";

export const MAX_INTERPRET_BODY_BYTES = 20 * 1024;

function errorResponse(code: string, message: string, status = 400) {
  return Response.json({ error: { code, message } }, { status });
}

async function readJson(request: Request): Promise<{ value?: unknown; tooLarge?: true }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_INTERPRET_BODY_BYTES) return { tooLarge: true };
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_INTERPRET_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { value: JSON.parse(text) };
  } catch { return {}; }
  finally { reader.releaseLock(); }
}

export function createInterpretHandler(options: {
  getCatalog?: () => Catalog;
  llm?: LlmClient;
  requestLimiter?: ReturnType<typeof createRateLimiter>;
  getClientIp?: (request: Request) => string | undefined;
} = {}) {
  const requestLimiter = options.requestLimiter ?? createRateLimiter();
  return async function POST(request: Request): Promise<Response> {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) {
      return errorResponse("invalid_request", "JSON 요청이 필요해요");
    }
    let body: Awaited<ReturnType<typeof readJson>>;
    try { body = await readJson(request); }
    catch { return errorResponse("invalid_json", "JSON 요청을 확인해 주세요"); }
    if (body.tooLarge) return errorResponse("body_too_large", "요청 본문은 20KB 이하여야 해요");
    if (body.value === undefined) return errorResponse("invalid_json", "JSON 요청을 확인해 주세요");
    const parsed = InterpretRequestSchema.safeParse(body.value);
    if (!parsed.success) return errorResponse("invalid_request", "결제 항목의 형식과 개수를 확인해 주세요");
    // 기본값은 공유 버킷이에요. 검증되지 않은 전달 헤더로 IP를 추측하지 않아요.
    let ip: string | undefined;
    try { ip = options.getClientIp?.(request); }
    catch { ip = undefined; }
    const quota = requestLimiter.reserve(Number.MAX_SAFE_INTEGER, ip);
    if (quota !== "ok") return errorResponse("rate_limit", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
    try {
      const results = await interpretItems(parsed.data.items, {
        catalog: (options.getCatalog ?? loadCatalog)(), llm: options.llm, context: { ip },
      });
      return Response.json({ results });
    } catch {
      return Response.json({ results: parsed.data.items.map((item) => unknownInterpretation(item.key)) });
    }
  };
}
