import { createBenefitsHandler } from "../../lib/llm/benefits-api";
import { createLlmClient } from "../../lib/llm/core";
import { createMockProvider } from "../mocks/llm-provider";
import { mockBenefitsCatalog, mockDecision, mockUser, MOCK_TODAY } from "../mocks/benefits";

const scenarios = [
  { name: "eligible", user: mockUser, id: "mock_student_discount", reply: mockDecision() },
  { name: "not-eligible", user: { ...mockUser, status: "휴학" as const }, id: "mock_student_discount", reply: mockDecision("no") },
  { name: "missing-grade", user: mockUser, id: "mock_unknown_price", reply: mockDecision("unknown") },
  { name: "invalid-quote", user: mockUser, id: "mock_student_discount", reply: { ...mockDecision(), quoted_conditions: ["없는 가상 조건"] } },
  { name: "unknown-id", user: mockUser, id: "invented", reply: mockDecision() },
];
for (const scenario of scenarios) {
  const mock = createMockProvider([{ text: JSON.stringify(scenario.reply) }]);
  const post = createBenefitsHandler({ getCatalog: mockBenefitsCatalog, today: () => MOCK_TODAY,
    llm: createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }) });
  const input = { user: scenario.user, targets: [{ kind: "benefit", id: scenario.id }] };
  const response = await post(new Request("http://localhost/api/benefits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
  console.log(JSON.stringify({ scenario: scenario.name, input, status: response.status, output: await response.json(), ai_calls: mock.requests.length }));
}
