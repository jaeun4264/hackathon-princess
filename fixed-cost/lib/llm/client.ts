import type { z } from "zod";
import { readLlmConfig } from "./config";
import { createLlmClient } from "./core";
import { createRateLimiter } from "./limits";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import { isServerRuntime } from "./server";
import type { LlmContext, LlmMessage, LlmResult } from "./types";

export { createLlmClient, LLM_TIMEOUT_MS } from "./core";

// 환경 변수 기반 기본 조립부예요. 제공업체 교체는 이 조립부 또는 팩토리 주입으로 처리해요.
const environmentLimiter = createRateLimiter();

export async function callJson<T>(messages: LlmMessage[], schema: z.ZodType<T>, context: LlmContext = {}): Promise<LlmResult<T> | null> {
  if (!isServerRuntime()) return null;
  const config = readLlmConfig();
  const provider = config ? createOpenAICompatibleProvider(config) : null;
  return createLlmClient({ provider, dailyCap: config?.dailyCap ?? 0, limiter: environmentLimiter }).callJson(messages, schema, context);
}
