import { describe, expect, it, vi } from "vitest";
import { createBenefitsHandler } from "../lib/llm/benefits-api";
import { judgeBenefit, type BenefitTarget } from "../lib/llm/benefits";
import { createLlmClient } from "../lib/llm/core";
import { buildT2Prompt } from "../lib/llm/prompts/t2";
import { questionFor } from "../lib/client/benefits";
import { UserProfileSchema } from "../lib/schemas";
import type { LlmClient } from "../lib/llm/types";
import type { UserProfile } from "../lib/types";
import { createMockProvider } from "./mocks/llm-provider";
import { mockBenefitsCatalog, MOCK_TODAY } from "./mocks/benefits";

const AGE_CONDITION = "[MOCK] 가상 혜택은 만 18세 이상의 재학생에게 제공됩니다.";
const student: UserProfile = { school: "가상 테스트 학교", status: "재학", school_email: true };

function ageTarget(conditions = AGE_CONDITION): BenefitTarget {
  const item = mockBenefitsCatalog().benefits[0];
  return { kind: "benefit", item: { ...item, conditions } };
}
function fakeLlm(eligible: "yes" | "no" = "yes"): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async callJson() {
      client.calls += 1;
      return { data: { eligible, quoted_conditions: [AGE_CONDITION], missing_info: [], reason: "[MOCK]" }, usage: null };
    },
  };
  return client as unknown as LlmClient & { calls: number };
}

describe("만 18세 이상 (age_18_plus)", () => {
  it("나이 답이 없고 조건에 '만 18세 이상'이 있으면 AI를 부르지 않고 age를 물어봐요", async () => {
    const llm = fakeLlm();
    const result = await judgeBenefit(ageTarget(), student, llm, MOCK_TODAY);
    expect(result).toMatchObject({ eligible: "unknown", missing_info: ["age"], validation: "ok" });
    expect(llm.calls).toBe(0);
  });

  it("'18세 이상'처럼 '만'이 없어도 나이 조건으로 봐요", async () => {
    const result = await judgeBenefit(ageTarget("[MOCK] 18세 이상 대학생만"), student, fakeLlm(), MOCK_TODAY);
    expect(result.missing_info).toEqual(["age"]);
  });

  it("나이를 답하면 AI가 판정하고, 나이 조건이 없는 혜택은 답이 없어도 판정해요", async () => {
    const llm = fakeLlm("yes");
    expect(await judgeBenefit(ageTarget(), { ...student, age_18_plus: true }, llm, MOCK_TODAY)).toMatchObject({ eligible: "yes", missing_info: [] });
    expect(await judgeBenefit(ageTarget("[MOCK] 재학생만 적용해요."), student, llm, MOCK_TODAY)).toMatchObject({ validation: "quote_failed" });
    expect(llm.calls).toBe(2);
  });

  it("AI 프롬프트에는 답한 경우에만 age_18_plus가 들어가고 생년월일 같은 값은 없어요", () => {
    const item = ageTarget().item;
    const withAge = JSON.parse(buildT2Prompt({ ...student, age_18_plus: false }, item)[1].content);
    const withoutAge = JSON.parse(buildT2Prompt(student, item)[1].content);
    expect(withAge.user).toEqual({ school: student.school, status: "재학", school_email: true, age_18_plus: false });
    expect(withoutAge.user).not.toHaveProperty("age_18_plus");
    expect(buildT2Prompt(student, item)[0].content).toContain("age");
  });

  it("AI가 missing_info에 age를 주면 그대로 남기고 허용 밖 값은 버려요", async () => {
    const llm = { async callJson() { return { data: { eligible: "yes", quoted_conditions: ["[MOCK] 재학생만"], missing_info: ["age", "생일"], reason: "x" }, usage: null }; } } as unknown as LlmClient;
    const result = await judgeBenefit(ageTarget("[MOCK] 재학생만"), { ...student, age_18_plus: true }, llm, MOCK_TODAY);
    expect(result).toMatchObject({ eligible: "unknown", missing_info: ["age"] });
  });

  it("나이 답이 바뀌면 서버 판정 캐시가 분리돼요", async () => {
    const catalog = mockBenefitsCatalog();
    catalog.benefits[0] = { ...catalog.benefits[0], conditions: "[MOCK] 재학생만 적용해요." };
    const reply = { text: JSON.stringify({ eligible: "yes", quoted_conditions: ["[MOCK] 재학생만 적용해요."], missing_info: [], reason: "[MOCK]" }) };
    const mock = createMockProvider([reply, reply, reply]);
    const post = createBenefitsHandler({ getCatalog: () => catalog, llm: createLlmClient({ provider: mock.provider, dailyCap: 100, logger: () => {} }), today: () => MOCK_TODAY });
    const send = (user: UserProfile) => post(new Request("http://localhost/api/benefits", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, targets: [{ kind: "benefit", id: catalog.benefits[0].id }] }) }));
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("실제 API 호출 금지"); }));
    await send(student); await send(student); await send({ ...student, age_18_plus: true });
    expect(mock.requests.length).toBe(2);
    vi.unstubAllGlobals();
  });

  it("계약: age_18_plus는 선택 필드이고 불리언만 받아요", () => {
    expect(UserProfileSchema.parse(student)).toEqual(student);
    expect(UserProfileSchema.parse({ ...student, age_18_plus: true }).age_18_plus).toBe(true);
    expect(UserProfileSchema.safeParse({ ...student, age_18_plus: "2000-01-01" }).success).toBe(false);
  });

  it("혜택 카드는 age 질문을 바로 물어봐요", () => {
    expect(questionFor("age")).toEqual({ field: "age", text: "만 18세 이상인가요?" });
  });
});
