import { z } from "zod";
import { createRateLimiter } from "./limits";
import { logLlm, sanitizeLog } from "./log";
import { CompletionSchema, MessagesSchema, UsageSchema } from "./schemas";
import { assertServer, isServerRuntime } from "./server";
import { LlmProviderError } from "./types";
import type { LlmClient, LlmContext, LlmLogEntry, LlmMessage, LlmProvider, LlmResult, LlmStatus, LlmUsage } from "./types";

export const LLM_TIMEOUT_MS = 15_000;

async function timedComplete(provider: LlmProvider, messages: LlmMessage[]) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new LlmProviderError("timeout")); }, LLM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.complete({ messages: messages.map((message) => ({ ...message })), signal: controller.signal })),
      timeout,
    ]);
  } finally { clearTimeout(timer); }
}
export function createLlmClient(options: {
  provider: LlmProvider | null;
  dailyCap: number;
  limiter?: ReturnType<typeof createRateLimiter>;
  now?: () => number;
  logger?: (entry: LlmLogEntry) => void;
}): LlmClient {
  assertServer();
  const now = options.now ?? Date.now;
  const limiter = options.limiter ?? createRateLimiter(now);
  const logger = options.logger ?? logLlm;
  return {
    async callJson<T>(messages: LlmMessage[], schema: z.ZodType<T>, context: LlmContext = {}): Promise<LlmResult<T> | null> {
      const started = now();
      const latency = () => Math.max(0, now() - started);
      function record(status: LlmStatus) {
        try { logger(sanitizeLog({ route: context.route ?? "llm", status, latency_ms: latency() })); }
        catch { /* 로그 장애로 호출 결과를 바꾸지 않아요. */ }
      }
      if (!isServerRuntime()) return null;
      if (!options.provider) { record("not_configured"); return null; }
      const input = MessagesSchema.safeParse(messages);
      if (!input.success) { record("invalid_input"); return null; }
      let usage: LlmUsage = { prompt_tokens: 0, completion_tokens: 0 };
      let completeUsage = true;
      for (let attempt = 0; attempt < 2; attempt++) {
        const quota = limiter.reserve(options.dailyCap, typeof context.ip === "string" ? context.ip : undefined);
        if (quota !== "ok") { record(quota); return null; }
        let completion: z.infer<typeof CompletionSchema>;
        try {
          completion = CompletionSchema.parse(await timedComplete(options.provider, input.data));
        } catch (error) {
          completeUsage = false;
          const status = error instanceof LlmProviderError ? error.code : error instanceof z.ZodError ? "invalid_response" : "provider_error";
          if (status === "invalid_response" && attempt === 0) continue;
          record(status); return null;
        }
        if (completion.usage) {
          const total = UsageSchema.safeParse({ prompt_tokens: usage.prompt_tokens + completion.usage.prompt_tokens, completion_tokens: usage.completion_tokens + completion.usage.completion_tokens });
          if (total.success) usage = total.data;
          else completeUsage = false;
        } else completeUsage = false;
        let json: unknown;
        try { json = JSON.parse(completion.text); }
        catch { if (attempt === 0) continue; record("invalid_json"); return null; }
        try {
          const checked = schema.safeParse(json);
          if (checked.success) {
            record("ok");
            return { data: checked.data, ...(completeUsage ? { usage } : {}), latency_ms: latency() };
          }
        } catch { /* 스키마 예외의 본문을 외부로 내보내지 않아요. */ }
        if (attempt === 1) { record("invalid_schema"); return null; }
      }
      return null;
    },
  };
}
