import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { createLlmClient } from "../lib/llm/core";
import { resolveInterpretItems } from "../lib/llm/interpret";
import { createInterpretHandler } from "../lib/llm/interpret-api";
import { interpretationResponse, MerchantResolutionSchema } from "../lib/llm/interpret-resolution";
import { InterpretResultSchema } from "../lib/schemas";
import type { InterpretItem } from "../lib/rules/interpret";
import { createMockProvider } from "./mocks/llm-provider";

const base: InterpretItem = { key: "synthetic", raw_name: "카카오페이", amount: 6900, interval: "monthly", payment_method: "card" };
function setup(id = "kakao_emoticon_plus") {
  const mock = createMockProvider([{ text: JSON.stringify({ service_id: id, confidence: 0.99, category: "가상 분류", reason: "가상 추정" }) }]);
  return { ...mock, llm: createLlmClient({ provider: mock.provider, dailyCap: 100, logger: () => {} }), catalog: loadCatalog() };
}
const network = vi.fn(() => { throw new Error("실제 네트워크 호출 금지"); });
beforeEach(() => { network.mockClear(); vi.stubGlobal("fetch", network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

it.each(["카카오페이", "네이버페이", "토스페이", "PAYCO", "Apple", "Google", "카카오 페이", "Google Play", "App Store"]
  .flatMap((name) => [6900, 13500, 29000, 9900, 1100].map((amount) => [name, amount] as const)))
  ("결제 수단 %s %i원은 금액·확신도로 확정하지 않아요", async (raw_name, amount) => {
    const id = amount === 13500 ? "netflix" : amount === 1100 ? "icloud" : amount === 6900 ? "kakao_emoticon_plus" : "tving";
    const options = setup(id);
    const [result] = await resolveInterpretItems([{ ...base, raw_name, amount }], options);
    expect(result).toMatchObject({ service_id: null, confirmed_service_id: null, suggested_service_id: id, needs_check: true, source: "ai", confidence: 0.99 });
    expect(InterpretResultSchema.parse(interpretationResponse([result]).results[0]).service_id).toBeNull();
  });

it.each(["Netflix", "카카오페이 Netflix", "PAYCO 넷플릭스", "Apple Netflix"])("명시된 실제 서비스 %s는 확인해요", async (raw_name) => {
  const options = setup();
  const [result] = await resolveInterpretItems([{ ...base, raw_name, amount: 13500 }], options);
  expect(result).toMatchObject({ service_id: "netflix", suggested_service_id: "netflix", confirmed_service_id: "netflix", needs_check: false, source: "catalog" });
  expect(options.requests).toHaveLength(0);
});

it("대행사 이름의 잘못된 별칭은 실제 서비스 근거로 사용하지 않아요", async () => {
  const options = setup();
  options.catalog.services[0].aliases.push("카카오페이", "Apple", "PAYCO");
  const [result] = await resolveInterpretItems([base], options);
  expect(result.confirmed_service_id).toBeNull();
  expect(result.suggested_service_id).toBe("kakao_emoticon_plus");
});

it("대행사 이름을 포함한 구체적인 등록 상품은 무조건 제외하지 않아요", async () => {
  const options = setup();
  options.catalog.services[0] = { ...options.catalog.services[0], id: "synthetic_membership", name: "PAYCO 가상멤버십", aliases: [] };
  const [result] = await resolveInterpretItems([{ ...base, raw_name: "PAYCO 가상멤버십" }], options);
  expect(result.confirmed_service_id).toBe("synthetic_membership");
  expect(result.needs_check).toBe(false);
});

it.each(["invented_service", "카카오톡 이모티콘 플러스", "unknown"])("잘못된 ID 또는 후보 없음 %s는 두 ID를 비워요", async (id) => {
  const [result] = await resolveInterpretItems([base], setup(id));
  expect(result).toMatchObject({ suggested_service_id: null, confirmed_service_id: null, service_id: null, needs_check: true, source: "unknown" });
});

it("영문 상호의 우연한 부분 문자열은 확정하지 않아요", async () => {
  const [result] = await resolveInterpretItems([{ ...base, raw_name: "notnetflix", amount: 13500 }], setup("netflix"));
  expect(result.confirmed_service_id).toBeNull();
});

it("API는 기존 엄격 스키마를 유지하고 같은 key의 상세 추정값을 분리해요", async () => {
  const options = setup();
  const handler = createInterpretHandler({ llm: options.llm, getCatalog: () => options.catalog });
  const response = await handler(new Request("http://localhost/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [base] }) }));
  const body = await response.json();
  expect(InterpretResultSchema.array().parse(body.results)[0]).toMatchObject({ key: base.key, service_id: null, needs_check: true });
  expect(MerchantResolutionSchema.array().parse(body.resolutions)[0]).toMatchObject({ key: base.key, suggested_service_id: "kakao_emoticon_plus", confirmed_service_id: null });
  expect(MerchantResolutionSchema.safeParse({ ...body.resolutions[0], confirmed_service_id: "kakao_emoticon_plus", service_id: "kakao_emoticon_plus", needs_check: false }).success).toBe(false);
});

it("클라이언트가 확정 플래그를 넣어도 신뢰하지 않고 거부해요", async () => {
  const options = setup();
  const handler = createInterpretHandler({ llm: options.llm, getCatalog: () => options.catalog });
  const response = await handler(new Request("http://localhost/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ ...base, confirmed_service_id: "netflix" }] }) }));
  expect(response.status).toBe(400);
  expect(options.requests).toHaveLength(0);
});
