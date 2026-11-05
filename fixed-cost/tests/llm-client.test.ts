import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { callJson, createLlmClient, LLM_TIMEOUT_MS } from "../lib/llm/client";
import { LlmProviderError } from "../lib/llm/types";
import type { LlmLogEntry, LlmMessage, LlmProvider } from "../lib/llm/types";
import { createMockProvider } from "./mocks/llm-provider";

const messages: LlmMessage[] = [{ role: "system", content: "가상 테스트예요. JSON 객체만 반환하세요." }, { role: "user", content: '{"scenario":"mock"}' }];
const schema = z.strictObject({ status: z.literal("ok") });
const good = { text: '{"status":"ok"}', usage: { prompt_tokens: 12, completion_tokens: 4 } };
const noNetwork = vi.fn(() => { throw new Error("실제 네트워크 호출 금지"); });

beforeEach(() => {
  noNetwork.mockClear();
  vi.stubGlobal("fetch", noNetwork);
  for (const name of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "LLM_DAILY_CAP"]) vi.stubEnv(name, "");
});
afterEach(() => {
  expect(noNetwork).not.toHaveBeenCalled();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

it("키 없이 주입한 Mock에서 JSON·스키마를 검증하고 메타데이터를 반환해요", async () => {
  let clock = 100;
  const mock = createMockProvider([good]);
  const logs: LlmLogEntry[] = [];
  const provider: LlmProvider = { async complete(request) { clock += 5; return mock.provider.complete(request); } };
  const client = createLlmClient({ provider, dailyCap: 10, now: () => clock, logger: (entry) => logs.push(entry) });
  expect(await client.callJson(messages, schema)).toEqual({ data: { status: "ok" }, usage: { prompt_tokens: 12, completion_tokens: 4 }, latency_ms: 5 });
  expect(mock.requests).toEqual([messages]);
  expect(logs).toEqual([{ route: "llm", status: "ok", latency_ms: 5 }]);
});

it.each(["{broken", '{"status":123}', '```json\n{"status":"ok"}\n```'])("JSON·스키마 오류 후 딱 한 번 재시도해요: %s", async (text) => {
  const mock = createMockProvider([{ text, usage: { prompt_tokens: 2, completion_tokens: 3 } }, good]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} });
  const result = await client.callJson(messages, schema);
  expect(result?.data).toEqual({ status: "ok" });
  expect(result?.usage).toEqual({ prompt_tokens: 14, completion_tokens: 7 });
  expect(mock.requests).toEqual([messages, messages]);
});

it.each(["{broken", '{"status":123}', "null"])("두 번 실패하면 null이고 예외·본문을 노출하지 않아요: %s", async (text) => {
  const mock = createMockProvider([{ text }, { text }]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} });
  expect(await client.callJson(messages, schema)).toBeNull();
  expect(mock.requests).toHaveLength(2);
});

it("제공업체 응답 형식 오류도 한 번만 재시도해요", async () => {
  const mock = createMockProvider([new LlmProviderError("invalid_response"), good]);
  const result = await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }).callJson(messages, schema);
  expect(result?.data).toEqual({ status: "ok" });
  expect(result).not.toHaveProperty("usage");
  expect(mock.requests).toHaveLength(2);
});

it("모든 시도의 usage가 없으면 토큰 수를 지어내지 않아요", async () => {
  const mock = createMockProvider([{ text: "{broken" }, good]);
  const result = await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }).callJson(messages, schema);
  expect(result).not.toHaveProperty("usage");
});

it.each(["api_error", "network_error", "timeout"] as const)("%s에서는 자동 재시도 없이 null이에요", async (code) => {
  const mock = createMockProvider([new LlmProviderError(code)]);
  expect(await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }).callJson(messages, schema)).toBeNull();
  expect(mock.requests).toHaveLength(1);
});

it("알 수 없는 제공업체 예외의 내용은 로그에 남기지 않아요", async () => {
  const mock = createMockProvider([new Error("가상비공개표식")]);
  const logs: LlmLogEntry[] = [];
  expect(await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: (entry) => logs.push(entry) }).callJson(messages, schema)).toBeNull();
  expect(logs[0].status).toBe("provider_error");
  expect(JSON.stringify(logs)).not.toContain("가상비공개표식");
});

it("15초에는 abort하고, 제공업체가 abort를 무시해도 반환해요", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const complete = vi.fn<LlmProvider["complete"]>(({ signal: received }) => { signal = received; return new Promise(() => {}); });
  const logs: LlmLogEntry[] = [];
  const pending = createLlmClient({ provider: { complete }, dailyCap: 10, logger: (entry) => logs.push(entry) }).callJson(messages, schema);
  await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS - 1);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBeNull();
  expect(signal?.aborted).toBe(true);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(logs[0]).toMatchObject({ status: "timeout", latency_ms: 15000 });
});

it("성공하면 타이머를 정리해요", async () => {
  vi.useFakeTimers();
  const mock = createMockProvider([good]);
  await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }).callJson(messages, schema);
  expect(vi.getTimerCount()).toBe(0);
});

it("일일 한도 0이면 제공업체를 전혀 호출하지 않아요", async () => {
  const mock = createMockProvider([good]);
  expect(await createLlmClient({ provider: mock.provider, dailyCap: 0, logger: () => {} }).callJson(messages, schema)).toBeNull();
  expect(mock.requests).toEqual([]);
});

it("재시도도 일일 한도를 사용하며 한도가 남지 않으면 멈춰요", async () => {
  const mock = createMockProvider([{ text: "{broken" }, good]);
  expect(await createLlmClient({ provider: mock.provider, dailyCap: 1, logger: () => {} }).callJson(messages, schema)).toBeNull();
  expect(mock.requests).toHaveLength(1);
});

it("동시에 호출해도 일일 한도를 초과해 제공업체를 호출하지 않아요", async () => {
  const mock = createMockProvider(Array.from({ length: 10 }, () => good));
  const client = createLlmClient({ provider: mock.provider, dailyCap: 3, logger: () => {} });
  const results = await Promise.all(Array.from({ length: 10 }, () => client.callJson(messages, schema)));
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(mock.requests).toHaveLength(3);
});

it("IP당 분당 20회 이후에는 제공업체를 호출하지 않아요", async () => {
  const mock = createMockProvider(Array.from({ length: 21 }, () => good));
  const client = createLlmClient({ provider: mock.provider, dailyCap: 100, now: () => 100, logger: () => {} });
  for (let index = 0; index < 20; index++) expect(await client.callJson(messages, schema, { ip: "mock-client" })).not.toBeNull();
  expect(await client.callJson(messages, schema, { ip: "mock-client" })).toBeNull();
  expect(mock.requests).toHaveLength(20);
});

it("빈 프롬프트는 한도나 모델 호출을 사용하지 않아요", async () => {
  const mock = createMockProvider([good]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 1, logger: () => {} });
  expect(await client.callJson([], schema)).toBeNull();
  expect(await client.callJson(messages, schema)).not.toBeNull();
  expect(mock.requests).toHaveLength(1);
});

it("키가 없으면 경고 한 줄과 null이고 fetch는 호출하지 않아요", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await callJson(messages, schema)).toBeNull();
  expect(warn).toHaveBeenCalledExactlyOnceWith({ route: "llm", status: "not_configured", latency_ms: expect.any(Number) });
});

it("브라우저 환경에서는 키를 읽거나 제공업체를 호출하지 않아요", async () => {
  vi.stubGlobal("window", {});
  expect(await callJson(messages, schema)).toBeNull();
  expect(() => createLlmClient({ provider: null, dailyCap: 0 })).toThrow("서버 전용");
});

it("로거가 실패해도 정상 응답을 유지해요", async () => {
  const mock = createMockProvider([good]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => { throw new Error("가상 로그 장애"); } });
  expect((await client.callJson(messages, schema))?.data).toEqual({ status: "ok" });
});

it("스키마 refine이 예외를 던져도 외부로 전파하지 않아요", async () => {
  const mock = createMockProvider([good, good]);
  const throwing = z.unknown().superRefine(() => { throw new Error("가상비공개표식"); });
  expect(await createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }).callJson(messages, throwing)).toBeNull();
});
