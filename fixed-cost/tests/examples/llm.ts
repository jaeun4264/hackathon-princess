import { z } from "zod";
import { createLlmClient } from "../../lib/llm/client";
import { LlmProviderError } from "../../lib/llm/types";
import type { LlmMessage, LlmProvider } from "../../lib/llm/types";
import { createMockProvider } from "../mocks/llm-provider";

const input: LlmMessage[] = [{ role: "system", content: "가상 테스트예요. JSON 객체만 반환하세요." }, { role: "user", content: '{"scenario":"mock"}' }];
const schema = z.strictObject({ status: z.literal("ok") });
const good = { text: '{"status":"ok"}', usage: { prompt_tokens: 12, completion_tokens: 4 } };

async function run(replies: Parameters<typeof createMockProvider>[0], cap = 10) {
  let clock = 100;
  const mock = createMockProvider(replies);
  const provider: LlmProvider = { async complete(request) { clock += 5; return mock.provider.complete(request); } };
  const client = createLlmClient({ provider, dailyCap: cap, now: () => clock, logger: () => {} });
  return { output: await client.callJson(input, schema), calls: mock.requests.length };
}

// 테스트용 제공업체만 주입해요. 환경 변수·실제 키·외부 API를 사용하지 않아요.
console.log(JSON.stringify({
  input,
  normal: await run([good]),
  retry: await run([{ text: "{broken", usage: { prompt_tokens: 2, completion_tokens: 3 } }, good]),
  invalid: await run([{ text: "{broken" }, { text: "{broken" }]),
  api_error: await run([new LlmProviderError("api_error")]),
  quota: await run([good], 0),
}, null, 2));
