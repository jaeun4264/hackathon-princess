import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BenefitCard } from "../../../components/BenefitCard";
import type { BenefitResult, Catalog, CatalogBenefit, Subscription } from "../../types";
import { appCatalog } from "../app-catalog";
import { benefitsForService, myServiceIds, needsJudgement, questionFor, verdictOf } from "../benefits";

const catalog: Catalog = appCatalog(true); // 모의 혜택 포함
const benefit = (id: string, patch: Partial<CatalogBenefit> = {}): CatalogBenefit => ({
  id, service_id: "netflix", kind: "student_discount", school: null, conditions: "재학생만", benefit_text: "학생 할인",
  price_after_monthly: 1000, source_url: "https://example.com/" + id, checked_at: "2026-11-01", ...patch,
});
const result = (id: string, patch: Partial<BenefitResult> = {}): BenefitResult => ({
  kind: "benefit", id, eligible: "yes", quoted_conditions: ["재학생만"], missing_info: [], reason: "재학생이에요", source_url: "https://example.com/" + id,
  checked_at: "2026-11-01", stale: false, validation: "ok", ...patch,
});
const render = (b: CatalogBenefit, r?: BenefitResult) => renderToStaticMarkup(createElement(BenefitCard, { benefit: b, result: r, onAnswer: () => {} }));

describe("혜택 고르기", () => {
  const custom: Catalog = { ...catalog, benefits: [
    benefit("d"), benefit("ku", { kind: "school_license", school: "고려대학교" }), benefit("ewha", { kind: "school_license", school: "이화여자대학교" }),
  ] };
  it("다른 학교 라이선스도 보여 주고, 내 학교 라이선스를 위로", () => {
    expect(benefitsForService("netflix", custom, { school: "이화여자대학교", status: "재학", school_email: true }).map((b) => b.id)).toEqual(["ewha", "d", "ku"]);
    expect(benefitsForService("netflix", custom, null).map((b) => b.id)).toEqual(["d", "ku", "ewha"]);
  });
  it("내 구독 칩은 확인된 카탈로그 서비스만, 중복 없이", () => {
    const sub = (service_id: string | null) => ({ service_id }) as Subscription;
    expect(myServiceIds([sub("netflix"), sub("netflix"), sub(null), sub("made_up")], catalog)).toEqual(["netflix"]);
  });
  it("이미 판정한 혜택은 다시 판정하지 않아요", () => {
    expect(needsJudgement([benefit("a"), benefit("b")], [result("a")]).map((b) => b.id)).toEqual(["b"]);
  });
  it("검증 실패·결과 없음은 '확인 못 함'", () => {
    expect(verdictOf(undefined)).toBe("unverified");
    expect(verdictOf(result("a", { eligible: "unknown", validation: "quote_failed" }))).toBe("unverified");
    expect(verdictOf(result("a", { eligible: "no" }))).toBe("no");
  });
  it("질문: 학교 이메일·재학 상태·학교만 바로 묻고, 학년·기타는 공식 페이지로", () => {
    expect(questionFor("school_email")?.text).toBe("학교 이메일로 인증할 수 있나요?");
    expect(questionFor("grade")).toBeNull();
  });
});

describe("혜택 카드", () => {
  it("모든 혜택 카드에 출처 링크(새 탭, noopener)와 확인일이 있어요", () => {
    for (const entry of catalog.benefits) {
      for (const r of [undefined, result(entry.id, { source_url: entry.source_url, checked_at: entry.checked_at }), result(entry.id, { eligible: "unknown", validation: "ai_error", quoted_conditions: [], source_url: entry.source_url, checked_at: entry.checked_at })]) {
        const html = render(entry, r);
        expect(html).toContain(`href="${entry.source_url}"`);
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain(entry.checked_at);
      }
    }
  });
  it("yes일 때만 '받을 수 있어요', 인용은 원문 그대로 따옴표로", () => {
    expect(render(benefit("a"), result("a"))).toContain("받을 수 있어요");
    expect(render(benefit("a"), result("a"))).toContain("&ldquo;재학생만&rdquo;".replace("&ldquo;", "“").replace("&rdquo;", "”"));
    for (const r of [result("a", { eligible: "no" }), result("a", { eligible: "unknown", missing_info: ["school_email"], quoted_conditions: [] }), undefined]) {
      expect(render(benefit("a"), r)).not.toContain("받을 수 있어요");
    }
  });
  it("unknown + missing_info면 카드 안에서 바로 물어요", () => {
    expect(render(benefit("a"), result("a", { eligible: "unknown", missing_info: ["school_email"], quoted_conditions: [] }))).toContain("학교 이메일로 인증할 수 있나요?");
  });
  it("검증 실패면 공식 페이지에서 확인하라고 안내", () => {
    expect(render(benefit("a"), result("a", { eligible: "unknown", validation: "quote_failed", quoted_conditions: [] }))).toContain("AI가 확인하지 못했어요. 공식 페이지에서");
  });
  it("30일 지난 확인일은 재확인 필요", () => {
    expect(render(benefit("a"), result("a", { stale: true }))).toContain("재확인 필요");
  });
});
