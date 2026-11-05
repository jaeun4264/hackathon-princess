import type { LlmLogEntry, LlmRoute, LlmStatus } from "./types";

const routes = new Set<LlmRoute>(["llm", "/api/interpret", "/api/benefits", "/api/message"]);
const statuses = new Set<LlmStatus>(["ok", "not_configured", "invalid_input", "invalid_json", "invalid_schema", "invalid_response", "timeout", "api_error", "network_error", "provider_error", "daily_limit", "ip_limit"]);

export function sanitizeLog(entry: LlmLogEntry): LlmLogEntry {
  return {
    route: routes.has(entry.route) ? entry.route : "llm",
    status: statuses.has(entry.status) ? entry.status : "provider_error",
    latency_ms: Number.isFinite(entry.latency_ms) ? Math.max(0, Math.round(entry.latency_ms)) : 0,
  };
}

export function logLlm(entry: LlmLogEntry): void {
  const safe = sanitizeLog(entry);
  // 본문·예외·키·IP는 받지 않고 허용한 세 항목만 출력해요.
  if (safe.status === "not_configured") console.warn(safe);
  else console.info(safe);
}
