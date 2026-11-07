import { describe, expect, it } from "vitest";
import { DEFAULT_MESSAGES, fillPlaceholders, josa } from "../lib/rules/messages";

describe("조사", () => {
  it.each([
    ["넷플릭스", "을", "를"], ["티빙", "을", "을"], ["다글로", "을", "를"], ["아이클라우드", "을", "를"],
    ["카카오톡 이모티콘 플러스", "을", "를"], ["13,500원", "을", "을"],
    ["넷플릭스", "은", "는"], ["티빙", "는", "은"],
    ["학생 할인", "으로", "으로"], ["네이버플러스 멤버십", "으로", "으로"], ["학교 라이선스", "으로", "로"], ["서울", "으로", "로"],
    ["Apple", "을", "를"], ["Netflix", "을", "를"], ["Gmail", "으로", "로"], ["YouTube Premium", "은", "은"],
  ])("%s + %s → %s", (word, particle, expected) => {
    expect(josa(word, particle)).toBe(expected);
  });

  it("기본 문장의 조사가 서비스 이름에 맞게 바뀌어요", () => {
    expect(fillPlaceholders(DEFAULT_MESSAGES.cancel, { service_name: "넷플릭스", saving_monthly: 13500, saving_yearly: 162000 }))
      .toBe("거의 쓰지 않는 넷플릭스를 해지하면 월 13,500원, 연 162,000원을 아낄 수 있어요.");
    expect(fillPlaceholders(DEFAULT_MESSAGES.keep, { service_name: "넷플릭스" })).toBe("자주 쓰는 넷플릭스는 유지해도 좋아요.");
    expect(fillPlaceholders(DEFAULT_MESSAGES.keep, { service_name: "티빙" })).toBe("자주 쓰는 티빙은 유지해도 좋아요.");
    expect(fillPlaceholders(DEFAULT_MESSAGES.bundle, { alt_name: "네이버플러스 멤버십", saving_monthly: 2100 }))
      .toBe("네이버플러스 멤버십으로 바꾸면 월 2,100원을 아낄 수 있어요.");
  });

  it("조사가 아닌 글자는 건드리지 않아요", () => {
    expect(fillPlaceholders("{service_name} 구독", { service_name: "다글로" })).toBe("다글로 구독");
    expect(fillPlaceholders("{service_name}에 쓰는 돈", { service_name: "다글로" })).toBe("다글로에 쓰는 돈");
  });
});
