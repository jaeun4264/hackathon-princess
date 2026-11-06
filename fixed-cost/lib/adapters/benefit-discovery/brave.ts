import { createHash } from "node:crypto";
import { z } from "zod";
import { assertServer } from "../../llm/server";
import { officialUrl } from "./network";
import { publicBenefitQuery } from "./query";
import type { SearchHit, SearchProvider } from "./types";

export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_TIMEOUT_MS = 5000;
export const BRAVE_MAX_BYTES = 512 * 1024;
export type SearchErrorCode = "missing_key" | "live_disabled" | "invalid_config" | "invalid_query" | "cancelled" |
  "search_limit" | "rate_limited" | "timeout" | "api_error" | "invalid_response" | "network_error" | "capacity";
export class SearchError extends Error {
  constructor(public readonly code: SearchErrorCode) { super(code); this.name = "SearchError"; }
}
export interface SearchAvailability { ready: boolean; code?: SearchErrorCode }
const SearchResponseSchema = z.object({ web: z.object({ results: z.array(z.object({ url: z.string().url().max(2048) })).max(100) }).nullable() });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createBraveSearchProvider(options: { serviceNames: string[]; environment?: () => Record<string, string | undefined>;
  fetch?: typeof fetch; now?: () => number }) : SearchProvider & { availability(): SearchAvailability } {
  assertServer();
  const environment = options.environment ?? (() => process.env);
  const now = options.now ?? Date.now;
  const transport = options.fetch ?? globalThis.fetch;
  const queries = new Set(options.serviceNames.map(publicBenefitQuery));
  const cache = new Map<string, { results: SearchHit[]; until: number }>();
  const pending = new Map<string, Promise<SearchHit[]>>();
  let minute = "", day = "", month = "", minuteCount = 0, dayCount = 0, monthCount = 0, cooldown = 0;
  function config() {
    const env = environment();
    if (!env.BRAVE_SEARCH_API_KEY?.trim()) throw new SearchError("missing_key");
    if (env.BENEFIT_DISCOVERY_LIVE !== "1") throw new SearchError("live_disabled");
    const number = (name: string, fallback: number) => {
      const raw = env[name]; if (raw === undefined || raw === "") return fallback;
      if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(Number(raw))) throw new SearchError("invalid_config");
      return Number(raw);
    };
    return { key: env.BRAVE_SEARCH_API_KEY.trim(), cacheAllowed: env.BRAVE_SEARCH_RESULT_CACHE_ALLOWED === "1", perMinute: number("BRAVE_SEARCH_PER_MINUTE", 10),
      perDay: number("BRAVE_SEARCH_DAILY_LIMIT", 100), perMonth: number("BRAVE_SEARCH_MONTHLY_LIMIT", 500) };
  }
  const availability = (): SearchAvailability => { assertServer(); try { config(); return { ready: true }; } catch (cause) { return { ready: false, code: cause instanceof SearchError ? cause.code : "invalid_config" }; } };
  async function execute(input: Parameters<SearchProvider["search"]>[0], cfg: ReturnType<typeof config>): Promise<SearchHit[]> {
    const timestamp = now(), date = new Date(timestamp).toISOString();
    if (minute !== date.slice(0, 16)) { minute = date.slice(0, 16); minuteCount = 0; }
    if (day !== date.slice(0, 10)) { day = date.slice(0, 10); dayCount = 0; }
    if (month !== date.slice(0, 7)) { month = date.slice(0, 7); monthCount = 0; }
    if (timestamp < cooldown) throw new SearchError("rate_limited");
    if (minuteCount >= cfg.perMinute || dayCount >= cfg.perDay || monthCount >= cfg.perMonth) throw new SearchError("search_limit");
    minuteCount++; dayCount++; monthCount++;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new SearchError("timeout")); }, BRAVE_TIMEOUT_MS); });
    const run = async () => {
      const url = new URL(BRAVE_SEARCH_URL);
      url.searchParams.set("q", input.query); url.searchParams.set("country", input.country);
      url.searchParams.set("count", "20"); url.searchParams.set("result_filter", "web");
      url.searchParams.set("text_decorations", "false"); url.searchParams.set("spellcheck", "false");
      const response = await transport(url, { method: "GET", redirect: "error", signal: controller.signal,
        headers: { "Accept": "application/json", "X-Subscription-Token": cfg.key } });
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        const milliseconds = retry && /^\d+$/u.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - now() : 60000;
        cooldown = now() + Math.max(1000, Math.min(Number.isFinite(milliseconds) ? milliseconds : 60000, 86400000));
        void response.body?.cancel().catch(() => {}); throw new SearchError("rate_limited");
      }
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new SearchError("api_error"); }
      if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length")) > BRAVE_MAX_BYTES || !response.body) {
        void response.body?.cancel().catch(() => {}); throw new SearchError("invalid_response");
      }
      const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
      const abortReader = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", abortReader, { once: true });
      let bytes = 0, text = "";
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          if (controller.signal.aborted) throw new SearchError("timeout");
          bytes += chunk.value.byteLength; if (bytes > BRAVE_MAX_BYTES) { void reader.cancel().catch(() => {}); throw new SearchError("invalid_response"); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        const parsed = SearchResponseSchema.parse(JSON.parse(text + decoder.decode()));
        const results: SearchHit[] = [], seen = new Set<string>();
        for (const result of parsed.web?.results ?? []) {
          try { const url = officialUrl(result.url, input.officialDomains).href; if (!seen.has(url)) { seen.add(url); results.push({ url }); } }
          catch { /* 검색 결과의 비공식 URL은 페이지 조회에 전달하지 않아요. */ }
        }
        return results;
      } finally { controller.signal.removeEventListener("abort", abortReader); reader.releaseLock(); }
    };
    try { return await Promise.race([run(), timeout]); }
    catch (cause) { throw cause instanceof SearchError ? cause : new SearchError(cause instanceof z.ZodError || cause instanceof SyntaxError ? "invalid_response" : "network_error"); }
    finally { clearTimeout(timer); controller.abort(); }
  }
  return { availability, async search(input) {
    assertServer(); const cfg = config();
    if (input.signal.aborted) throw new SearchError("cancelled");
    if (!queries.has(input.query) || input.query.length > 600 || input.query.split(/\s+/u).length > 75 || !/^[A-Z]{2}$/u.test(input.country) ||
      !input.officialDomains.length || input.officialDomains.length > 20 || input.officialDomains.some((host) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u.test(host))) throw new SearchError("invalid_query");
    const key = digest([input.query, input.country, [...input.officialDomains].sort()]);
    for (const [id, entry] of cache) if (entry.until <= now()) cache.delete(id);
    if (!cfg.cacheAllowed) cache.clear();
    const cached = cfg.cacheAllowed ? cache.get(key) : undefined; if (cached) return structuredClone(cached.results);
    let task = pending.get(key);
    if (!task) {
      if (pending.size >= 32) throw new SearchError("capacity");
      task = execute(input, cfg).then((results) => {
        if (cfg.cacheAllowed && environment().BRAVE_SEARCH_RESULT_CACHE_ALLOWED === "1") {
          if (cache.size >= 128) cache.delete(cache.keys().next().value!);
          cache.set(key, { results: structuredClone(results), until: now() + (results.length ? 15 * 60000 : 60000) });
        }
        return results;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    // 공유 작업은 자체 시간 제한으로 끝내고 한 사람의 중단으로 다른 대기자를 멈추지 않아요.
    return await new Promise<SearchHit[]>((resolve, reject) => {
      const abort = () => reject(new SearchError("cancelled")); input.signal.addEventListener("abort", abort, { once: true });
      task!.then((results) => resolve(structuredClone(results)), reject).finally(() => input.signal.removeEventListener("abort", abort));
    });
  } };
}
