import { createLlmClient } from "../../lib/llm/core";
import { DEFAULT_MESSAGES } from "../../lib/rules/messages";
import { createMockProvider } from "../mocks/llm-provider";
import { mockDecision, mockUser } from "../mocks/benefits";
import { mockConfirmedSubscription } from "../mocks/message";
import { braveJson, jsonResponse, mockLive } from "../mocks/live-discovery";

const llm = createMockProvider(Array.from({ length: 3 }, () => [
  { text: JSON.stringify(mockDecision("yes", "[MOCK] 재학생만 이용할 수 있는 가상 조건이에요.")) },
  { text: JSON.stringify({ template: DEFAULT_MESSAGES.student_discount }) },
]).flat());
let fail = false, calls = 0;
const mock = mockLive(async () => { calls++; return fail ? jsonResponse({}, 500) : jsonResponse(braveJson()); },
  { llm: createLlmClient({ provider: llm.provider, dailyCap: 20, logger: () => {} }) });
for (const scenario of ["fresh", "cache", "fallback"] as const) {
  if (scenario === "fallback") { fail = true; mock.advance(86400000); }
  const output = await mock.service.recommend({ subs: [mockConfirmedSubscription], user: mockUser, country: "KR" });
  console.log(JSON.stringify({ scenario, search_http_calls: calls,
    discovery: output.services.map(({ source, error, refresh_failed, last_attempt_at }) => ({ source, error, refresh_failed, last_attempt_at })),
    benefits: output.catalog.benefits.map(({ price_after_monthly, checked_at, source_url }) => ({ price_after_monthly, checked_at, source_url })),
    eligibility: output.benefitResults.map(({ eligible, validation, stale }) => ({ eligible, validation, stale })),
    suggestions: output.suggestions.map(({ type, saving_monthly, saving_yearly, message, message_source, stale }) => ({ type, saving_monthly, saving_yearly, message, message_source, stale })) }));
}
const offline = mockLive(async () => { throw new Error("호출되면 안 돼요"); }, { environment: () => ({}) });
console.log(JSON.stringify({ scenario: "missing-key", services: (await offline.service.discover({ confirmed_service_ids: ["netflix"], country: "KR" })).services }));
