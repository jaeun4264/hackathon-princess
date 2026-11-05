import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { readLlmConfig } from "../lib/llm/config";
import { createOpenAICompatibleProvider, validateBaseUrl } from "../lib/llm/providers/openai-compatible";
import { createLlmClient, callJson } from "../lib/llm/client";
import type { LlmMessage } from "../lib/llm/types";

const messages: LlmMessage[] = [{ role: "user", content: "가상 시나리오의 JSON 객체를 반환하세요." }];
const envelope = { choices: [{ message: { content: '{"status":"ok"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 4 } };
const noNetwork = vi.fn(() => { throw new Error("실제 네트워크 호출 금지"); });
function config() {
  // 유효한 API 키가 아닌 실행 중 생성한 가상 식별자예요. 코드·출력에 자격 증명을 저장하지 않아요.
  return { baseUrl: "https://llm.example.invalid/v1/", apiKey: randomUUID(), model: "mock-model" };
}

beforeEach(() => { noNetwork.mockClear(); vi.stubGlobal("fetch", noNetwork); });
afterEach(() => { expect(noNetwork).not.toHaveBeenCalled(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("설정한 주소에만 정해진 JSON 요청을 보내고 usage를 정규화해요", async () => {
  const settings = config();
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(envelope));
  const provider = createOpenAICompatibleProvider(settings, fetchMock);
  const signal = new AbortController().signal;
  expect(await provider.complete({ messages, signal })).toEqual({ text: '{"status":"ok"}', usage: { prompt_tokens: 12, completion_tokens: 4 } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("https://llm.example.invalid/v1/chat/completions");
  expect(request).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", signal });
  expect(new Headers(request?.headers).get("Authorization")).toBe(`Bearer ${settings.apiKey}`);
  expect(JSON.parse(String(request?.body))).toEqual({ model: "mock-model", messages, temperature: 0, response_format: { type: "json_object" } });
  expect(JSON.stringify(provider)).not.toContain(settings.apiKey);
});

it("외부 설정 객체를 바꿔도 전송 주소·자격 증명은 바뀌지 않아요", async () => {
  const settings = config();
  const original = settings.apiKey;
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(envelope));
  const provider = createOpenAICompatibleProvider(settings, fetchMock);
  settings.apiKey = randomUUID(); settings.model = "different-mock";
  await provider.complete({ messages, signal: new AbortController().signal });
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe(`Bearer ${original}`);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("mock-model");
});

it.each([400, 401, 403, 429, 500, 503])("HTTP %s 오류는 본문을 읽지 않고 null로 처리해요", async (status) => {
  const response = new Response("가상비공개표식", { status });
  const read = vi.spyOn(response, "json");
  const text = vi.spyOn(response, "text");
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  const provider = createOpenAICompatibleProvider(config(), fetchMock);
  expect(await createLlmClient({ provider, dailyCap: 10, logger: () => {} }).callJson(messages, z.object({ status: z.literal("ok") }))).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
});

it.each([
  {}, { choices: [] }, { choices: [{ message: { content: null } }] },
  { choices: [{ message: { content: '{"status":"ok"}', refusal: "가상 거절" } }] },
  { choices: [{ message: { content: '{"status":"ok"}' }, finish_reason: "length" }] },
  { ...envelope, usage: { prompt_tokens: -1, completion_tokens: 4 } },
])("잘못된 제공업체 응답을 거부해요", async (body) => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(body));
  await expect(createOpenAICompatibleProvider(config(), fetchMock).complete({ messages, signal: new AbortController().signal })).rejects.toThrow("invalid_response");
});

it("usage가 없으면 만들어 넣지 않아요", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: envelope.choices }));
  const result = await createOpenAICompatibleProvider(config(), fetchMock).complete({ messages, signal: new AbortController().signal });
  expect(result).not.toHaveProperty("usage");
});

it("외부 JSON 봉투 자체가 깨져 있으면 응답 오류예요", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("{broken"));
  await expect(createOpenAICompatibleProvider(config(), fetchMock).complete({ messages, signal: new AbortController().signal })).rejects.toThrow("invalid_response");
});

it("네트워크 예외 메시지를 노출하지 않아요", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => { throw new Error("가상비공개표식"); });
  await expect(createOpenAICompatibleProvider(config(), fetchMock).complete({ messages, signal: new AbortController().signal })).rejects.toThrow(/^network_error$/u);
});

it("응답 본문을 읽다가 멈춰도 공통 15초 타임아웃이 적용돼요", async () => {
  vi.useFakeTimers();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(stream));
  const provider = createOpenAICompatibleProvider(config(), fetchMock);
  const pending = createLlmClient({ provider, dailyCap: 10, logger: () => {} }).callJson(messages, z.object({ status: z.string() }));
  await vi.advanceTimersByTimeAsync(15000);
  expect(await pending).toBeNull();
  const signal = fetchMock.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(true);
  // Mock 스트림은 실제 fetch처럼 abort되지 않아서 테스트에서 닫아줘요.
  streamController?.close();
});

it.each([
  "http://remote.example.invalid/v1", "https://example.invalid/v1?secret=mock",
  "https://example.invalid/v1#mock", "file:///mock", "invalid",
])("위험하거나 잘못된 주소는 네트워크 없이 거부해요", (baseUrl) => {
  expect(validateBaseUrl(baseUrl)).toBeNull();
  expect(() => createOpenAICompatibleProvider({ ...config(), baseUrl }, noNetwork)).toThrow("LLM 서버 설정");
});

it("명시한 로컬 HTTP 모델 서버와 HTTPS 주소만 허용해요", () => {
  expect(validateBaseUrl("http://127.0.0.1:9000/v1/")).toBe("http://127.0.0.1:9000/v1");
  expect(validateBaseUrl("https://llm.example.invalid/v1/")).toBe("https://llm.example.invalid/v1");
});

it("URL 안의 자격 증명을 거부해요", () => {
  const url = new URL("https://llm.example.invalid/v1");
  url.username = "mock-user";
  url.password = randomUUID();
  expect(validateBaseUrl(url.href)).toBeNull();
});

it.each(["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "LLM_DAILY_CAP"])("환경 변수 %s가 없으면 설정을 비활성화해요", (name) => {
  const settings = config();
  const environment: Record<string, string | undefined> = { LLM_BASE_URL: settings.baseUrl, LLM_API_KEY: settings.apiKey, LLM_MODEL: settings.model, LLM_DAILY_CAP: "10" };
  delete environment[name];
  expect(readLlmConfig(environment)).toBeNull();
});

it.each(["-1", "1.5", "NaN", "Infinity", "9007199254740992"])("잘못된 일일 한도는 비활성화해요: %s", (cap) => {
  const settings = config();
  expect(readLlmConfig({ LLM_BASE_URL: settings.baseUrl, LLM_API_KEY: settings.apiKey, LLM_MODEL: settings.model, LLM_DAILY_CAP: cap })).toBeNull();
});

it("기본 callJson도 Mock fetch로만 조립해 검증해요", async () => {
  const settings = config();
  vi.stubEnv("LLM_BASE_URL", settings.baseUrl); vi.stubEnv("LLM_API_KEY", settings.apiKey);
  vi.stubEnv("LLM_MODEL", settings.model); vi.stubEnv("LLM_DAILY_CAP", "10");
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(envelope));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  expect((await callJson(messages, z.object({ status: z.literal("ok") })))?.data).toEqual({ status: "ok" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
