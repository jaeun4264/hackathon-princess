import { createMessageHandler } from "../../lib/llm/message-api";
import { APPROVED_TEMPLATES } from "../../lib/llm/message";
import { createLlmClient } from "../../lib/llm/core";
import { createMockProvider } from "../mocks/llm-provider";
import { mockMessage } from "../mocks/message";

for (const template of [APPROVED_TEMPLATES.cancel[1], "월 13,500원을 아낄 수 있어요.", "학생 인증 없이 무료로 이용할 수 있어요."]) {
  const mock = createMockProvider([{ text: JSON.stringify({ template }) }]);
  const post = createMessageHandler({ llm: createLlmClient({ provider: mock.provider, dailyCap: 10, logger: () => {} }) });
  const response = await post(new Request("http://localhost/api/message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mockMessage) }));
  console.log(JSON.stringify({ input: mockMessage, mock_reply: { template }, status: response.status, output: await response.json() }));
}
