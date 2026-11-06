import { createRateLimiter } from "./limits";
import { generateMessage, MessageRequestSchema } from "./message";
import type { LlmClient } from "./types";

export const MAX_MESSAGE_BODY_BYTES = 20 * 1024;
const error = (code: string, message: string, status = 400) => Response.json({ error: { code, message } }, { status });
async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_MESSAGE_BODY_BYTES) throw new RangeError();
  if (!request.body) throw new Error();
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_MESSAGE_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new RangeError(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
export function createMessageHandler(options: { llm?: LlmClient; requestLimiter?: ReturnType<typeof createRateLimiter> } = {}) {
  const limiter = options.requestLimiter ?? createRateLimiter();
  return async function POST(request: Request): Promise<Response> {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) return error("invalid_request", "JSON 요청이 필요해요");
    let raw: unknown;
    try { raw = await readBody(request); }
    catch (cause) { return error(cause instanceof RangeError ? "body_too_large" : "invalid_json", "요청 본문을 확인해 주세요"); }
    const parsed = MessageRequestSchema.safeParse(raw);
    if (!parsed.success) return error("invalid_request", "추천 종류와 계산된 금액을 확인해 주세요");
    if (limiter.reserve(Number.MAX_SAFE_INTEGER) !== "ok") return error("rate_limit", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
    return Response.json(await generateMessage(parsed.data, options.llm));
  };
}
