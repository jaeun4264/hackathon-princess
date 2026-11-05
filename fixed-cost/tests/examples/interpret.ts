import { loadCatalog } from "../../lib/catalog";
import { createLlmClient } from "../../lib/llm/core";
import { resolveInterpretItems } from "../../lib/llm/interpret";
import { interpretationResponse } from "../../lib/llm/interpret-resolution";
import type { InterpretItem } from "../../lib/rules/interpret";
import { createMockProvider } from "../mocks/llm-provider";

const scenarios: { name: string; input: InterpretItem; reply?: unknown }[] = [
  { name: "catalog", input: { key: "sample-catalog", raw_name: "Netflix", amount: 13500, interval: "monthly", payment_method: "card" } },
  { name: "ai", input: { key: "sample-ai", raw_name: "카카오페이", amount: 6900, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "kakao_emoticon_plus", category: "메신저", confidence: 0.82, reason: "가상 근거" } },
  { name: "kakao-13500", input: { key: "sample-kakao-13500", raw_name: "카카오페이", amount: 13500, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "netflix", category: "영상", confidence: 0.99, reason: "가상 추정" } },
  { name: "kakao-29000", input: { key: "sample-kakao-29000", raw_name: "카카오페이", amount: 29000, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "unknown", category: "기타", confidence: 0, reason: "근거 없음" } },
  { name: "naver-9900", input: { key: "sample-naver", raw_name: "네이버페이", amount: 9900, interval: "monthly", payment_method: "naverpay" }, reply: { service_id: "unknown", category: "기타", confidence: 0, reason: "근거 없음" } },
  { name: "toss", input: { key: "sample-toss", raw_name: "토스페이", amount: 13500, interval: "monthly", payment_method: "tosspay" }, reply: { service_id: "netflix", category: "영상", confidence: 0.99, reason: "가상 추정" } },
  { name: "payco", input: { key: "sample-payco", raw_name: "PAYCO", amount: 6900, interval: "monthly", payment_method: "payco" }, reply: { service_id: "kakao_emoticon_plus", category: "메신저", confidence: 0.99, reason: "가상 추정" } },
  { name: "ambiguous", input: { key: "sample-ambiguous", raw_name: "Apple", amount: 1100, interval: "monthly", payment_method: "apple" }, reply: { service_id: "icloud", category: "클라우드", confidence: 0.99, reason: "가상 추정" } },
  { name: "explicit-service", input: { key: "sample-explicit", raw_name: "카카오페이 Netflix", amount: 13500, interval: "monthly", payment_method: "kakaopay" } },
  { name: "unregistered", input: { key: "sample-unregistered", raw_name: "미등록 결제", amount: 9999, interval: "yearly", payment_method: "card" } },
  { name: "invalid_ai_id", input: { key: "sample-invalid", raw_name: "카카오페이", amount: 6900, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "invented_service", category: "허구 분류", confidence: 0.99, reason: "허구의 가상 근거" } },
];

// 가상 입력과 Mock 제공업체만 사용해요. 실제 키·유료 API는 읽거나 호출하지 않아요.
const output = [];
for (const scenario of scenarios) {
  const mock = createMockProvider(scenario.reply === undefined ? [] : [{ text: JSON.stringify(scenario.reply) }]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} });
  output.push({ scenario: scenario.name, input: scenario.input,
    output: interpretationResponse(await resolveInterpretItems([scenario.input], { catalog: loadCatalog(), llm: client })), ai_calls: mock.requests.length });
}
console.log(JSON.stringify(output, null, 2));
