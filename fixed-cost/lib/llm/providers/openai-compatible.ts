import { z } from "zod";
import { assertServer } from "../server";
import { LlmProviderError } from "../types";
import type { LlmProvider } from "../types";
import { UsageSchema } from "../schemas";

const EnvelopeSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().min(1), refusal: z.string().nullable().optional() }),
    finish_reason: z.literal("stop").optional(),
  })).min(1),
  usage: UsageSchema.optional(),
});

export function validateBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/u, "");
  } catch { return null; }
}

export function createOpenAICompatibleProvider(
  config: { baseUrl: string; apiKey: string; model: string },
  fetchImpl: typeof fetch = globalThis.fetch,
): LlmProvider {
  assertServer();
  const baseUrl = validateBaseUrl(config.baseUrl);
  if (!baseUrl || !config.model.trim() || !config.apiKey.trim() || /[\r\n\0]/u.test(config.apiKey)) {
    throw new Error("LLM 서버 설정을 확인해 주세요");
  }
  const apiKey = config.apiKey;
  const model = config.model;
  return {
    async complete({ messages, signal }) {
      assertServer();
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST", redirect: "error", cache: "no-store", signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: "json_object" } }),
        });
      } catch {
        throw new LlmProviderError(signal.aborted ? "timeout" : "network_error");
      }
      if (!response.ok) {
        // 제공업체의 오류 본문은 읽거나 예외·로그에 포함하지 않아요.
        try { await response.body?.cancel(); } catch { /* 본문을 사용하지 않아요. */ }
        throw new LlmProviderError("api_error");
      }
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new LlmProviderError(signal.aborted ? "timeout" : "invalid_response"); }
      const parsed = EnvelopeSchema.safeParse(body);
      if (!parsed.success || parsed.data.choices[0].message.refusal) throw new LlmProviderError("invalid_response");
      return { text: parsed.data.choices[0].message.content, ...(parsed.data.usage ? { usage: parsed.data.usage } : {}) };
    },
  };
}
