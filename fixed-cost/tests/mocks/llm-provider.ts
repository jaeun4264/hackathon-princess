import type { LlmMessage, LlmProvider } from "../../lib/llm/types";

export function createMockProvider(replies: (Awaited<ReturnType<LlmProvider["complete"]>> | Error)[]) {
  const requests: LlmMessage[][] = [];
  const provider: LlmProvider = {
    async complete({ messages }) {
      requests.push(messages.map((message) => ({ ...message })));
      const reply = replies[requests.length - 1];
      if (reply instanceof Error) throw reply;
      if (!reply) throw new Error("Mock 응답이 부족해요");
      return structuredClone(reply);
    },
  };
  return { provider, requests };
}
