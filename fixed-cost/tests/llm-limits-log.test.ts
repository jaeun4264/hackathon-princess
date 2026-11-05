import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createRateLimiter } from "../lib/llm/limits";
import { hashClientAddress } from "../lib/llm/server";
import { logLlm, sanitizeLog } from "../lib/llm/log";
import { createLlmClient } from "../lib/llm/client";
import { createMockProvider } from "./mocks/llm-provider";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("일일 한도는 UTC 날짜가 바뀌면 초기화돼요", () => {
  let clock = Date.parse("2026-11-04T23:59:59.000Z");
  const limiter = createRateLimiter(() => clock);
  expect(limiter.reserve(2, "mock-client")).toBe("ok");
  expect(limiter.reserve(2, "mock-client")).toBe("ok");
  expect(limiter.reserve(2, "another-client")).toBe("daily_limit");
  clock += 1000;
  expect(limiter.reserve(2, "mock-client")).toBe("ok");
});

it("IP별 고정 분 창을 분리하고 다음 분에 초기화해요", () => {
  let clock = 0;
  const limiter = createRateLimiter(() => clock);
  for (let index = 0; index < 20; index++) expect(limiter.reserve(100, "mock-a")).toBe("ok");
  expect(limiter.reserve(100, "mock-a")).toBe("ip_limit");
  expect(limiter.reserve(100, "mock-b")).toBe("ok");
  clock = 60000;
  expect(limiter.reserve(100, "mock-a")).toBe("ok");
});

it("IP가 없는 호출도 공유 버킷으로 제한해 우회하지 못해요", () => {
  const limiter = createRateLimiter(() => 0);
  for (let index = 0; index < 20; index++) expect(limiter.reserve(100)).toBe("ok");
  expect(limiter.reserve(100)).toBe("ip_limit");
});

it("차단된 IP 호출은 일일 사용량을 늘리지 않아요", () => {
  const limiter = createRateLimiter(() => 0);
  for (let index = 0; index < 20; index++) limiter.reserve(21, "mock-a");
  expect(limiter.reserve(21, "mock-a")).toBe("ip_limit");
  expect(limiter.reserve(21, "mock-b")).toBe("ok");
  expect(limiter.reserve(21, "mock-c")).toBe("daily_limit");
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("잘못되거나 0인 한도는 호출을 차단해요: %s", (cap) => {
  expect(createRateLimiter(() => 0).reserve(cap)).toBe("daily_limit");
});

it("IP 원문 대신 프로세스 내 해시 키를 사용해요", () => {
  const key = hashClientAddress("가상비공개주소");
  expect(key).toMatch(/^[a-f0-9]{64}$/u);
  expect(key).not.toContain("가상비공개주소");
  expect(hashClientAddress("가상비공개주소")).toBe(key);
  expect(hashClientAddress("다른가상주소")).not.toBe(key);
});

it("로그에 임의 경로·상태·추가 필드를 넣어도 허용한 세 항목만 남겨요", () => {
  const entry = Object.assign({ route: "llm" as const, status: "ok" as const, latency_ms: Number.POSITIVE_INFINITY }, {
    route: "가상비공개경로", status: "가상비공개상태", messages: "가상비공개프롬프트", ip: "가상비공개주소", credential: randomUUID(),
  });
  expect(sanitizeLog(entry)).toEqual({ route: "llm", status: "provider_error", latency_ms: 0 });
});

it("로그 지연시간을 음수가 아닌 정수로 기록해요", () => {
  expect(sanitizeLog({ route: "llm", status: "ok", latency_ms: -10 }).latency_ms).toBe(0);
  expect(sanitizeLog({ route: "llm", status: "ok", latency_ms: 1.7 }).latency_ms).toBe(2);
});

it("미설정 로그는 경고 한 줄이고 본문 없는 구조만 출력해요", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  logLlm({ route: "llm", status: "not_configured", latency_ms: 0 });
  expect(warn).toHaveBeenCalledExactlyOnceWith({ route: "llm", status: "not_configured", latency_ms: 0 });
  expect(info).not.toHaveBeenCalled();
});

it("프롬프트·응답·자격 증명·IP는 정상 호출 로그에도 없어요", async () => {
  const credential = randomUUID();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const mock = createMockProvider([{ text: JSON.stringify({ status: "ok", private: "가상비공개응답", credential }) }]);
  await createLlmClient({ provider: mock.provider, dailyCap: 10 }).callJson(
    [{ role: "user", content: "가상비공개프롬프트 JSON" }], z.object({ status: z.literal("ok") }),
    { route: "/api/interpret", ip: "가상비공개주소" },
  );
  expect(info).toHaveBeenCalledExactlyOnceWith({ route: "/api/interpret", status: "ok", latency_ms: expect.any(Number) });
  expect(JSON.stringify(info.mock.calls)).not.toMatch(/가상비공개/u);
  expect(JSON.stringify(info.mock.calls)).not.toContain(credential);
  expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
