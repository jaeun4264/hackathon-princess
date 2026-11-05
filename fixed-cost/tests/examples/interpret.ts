import { loadCatalog } from "../../lib/catalog";
import { createLlmClient } from "../../lib/llm/core";
import { interpretItems } from "../../lib/llm/interpret";
import type { InterpretItem } from "../../lib/rules/interpret";
import { createMockProvider } from "../mocks/llm-provider";

const scenarios: { name: string; input: InterpretItem; reply?: unknown }[] = [
  { name: "catalog", input: { key: "sample-catalog", raw_name: "넷플릭스", amount: 13500, interval: "monthly", payment_method: "card" } },
  { name: "ai", input: { key: "sample-ai", raw_name: "카카오페이", amount: 6900, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "kakao_emoticon_plus", category: "메신저", confidence: 0.82, reason: "가상 근거" } },
  { name: "ambiguous", input: { key: "sample-ambiguous", raw_name: "Apple", amount: 1100, interval: "monthly", payment_method: "apple" }, reply: { service_id: "icloud", category: "클라우드", confidence: 0.5, reason: "확인이 필요하다는 가상 근거" } },
  { name: "unregistered", input: { key: "sample-unregistered", raw_name: "미등록 결제", amount: 9999, interval: "yearly", payment_method: "card" } },
  { name: "invalid_ai_id", input: { key: "sample-invalid", raw_name: "카카오페이", amount: 6900, interval: "monthly", payment_method: "kakaopay" }, reply: { service_id: "invented_service", category: "허구 분류", confidence: 0.99, reason: "허구의 가상 근거" } },
];

// 가상 입력과 Mock 제공업체만 사용해요. 실제 키·유료 API는 읽거나 호출하지 않아요.
const output = [];
for (const scenario of scenarios) {
  const mock = createMockProvider(scenario.reply === undefined ? [] : [{ text: JSON.stringify(scenario.reply) }]);
  const client = createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} });
  output.push({ scenario: scenario.name, input: scenario.input,
    output: (await interpretItems([scenario.input], { catalog: loadCatalog(), llm: client }))[0], ai_calls: mock.requests.length });
}
console.log(JSON.stringify(output, null, 2));
