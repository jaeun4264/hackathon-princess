import { isServerRuntime } from "./server";
import { validateBaseUrl } from "./providers/openai-compatible";

export function readLlmConfig(environment?: Readonly<Record<string, string | undefined>>) {
  if (!isServerRuntime()) return null;
  const env = environment ?? process.env;
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  const cap = env.LLM_DAILY_CAP?.trim();
  if (!baseUrl || !apiKey || !model || !cap || !/^\d+$/u.test(cap) || /[\r\n\0]/u.test(apiKey)) return null;
  const normalizedUrl = validateBaseUrl(baseUrl);
  const dailyCap = Number(cap);
  if (!normalizedUrl || !Number.isSafeInteger(dailyCap)) return null;
  return { baseUrl: normalizedUrl, apiKey, model, dailyCap };
}
