import type { z } from "zod";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

// 제공업체의 HTTP 형식·인증·모델 이름은 이 인터페이스 밖에서 처리해요.
export interface LlmProvider {
  complete(request: { messages: LlmMessage[]; signal: AbortSignal }): Promise<{ text: string; usage?: LlmUsage }>;
}

export type LlmRoute = "llm" | "/api/interpret" | "/api/benefits" | "/api/message";
export type LlmStatus = "ok" | "not_configured" | "invalid_input" | "invalid_json" | "invalid_schema" |
  "invalid_response" | "timeout" | "api_error" | "network_error" | "provider_error" | "daily_limit" | "ip_limit";

export interface LlmLogEntry {
  route: LlmRoute;
  status: LlmStatus;
  latency_ms: number;
}

export interface LlmContext {
  route?: LlmRoute;
  ip?: string;
}

export interface LlmResult<T> {
  data: T;
  usage?: LlmUsage;
  latency_ms: number;
}

export interface LlmClient {
  callJson<T>(messages: LlmMessage[], schema: z.ZodType<T>, context?: LlmContext): Promise<LlmResult<T> | null>;
}

export class LlmProviderError extends Error {
  constructor(public readonly code: "api_error" | "network_error" | "invalid_response" | "timeout") {
    super(code);
    this.name = "LlmProviderError";
  }
}
