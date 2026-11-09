import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogValidationError, loadCatalog, validateCatalog } from "../lib/catalog";
import { CatalogBenefitSchema } from "../lib/schemas";
import type { Catalog } from "../lib/types";
import mock from "../data/catalog/benefits.mock.json";
import { benefitTargets } from "../lib/client/derive";
import type { Subscription } from "../lib/types";
import { runValidation } from "../scripts/validate-catalog";

function fixture(): Catalog {
  return {
    ...loadCatalog(),
    benefits: mock.benefits.map((benefit) => CatalogBenefitSchema.parse(benefit)),
    bundles: [{
      id: "mock_bundle", name: "[MOCK] 가상 묶음", includes: [{ service_id: "netflix", plan_id: "standard" }],
      price_monthly: 1000, member_of: "naver_plus", price_monthly_if_member: null,
      conditions: "[MOCK] 가상 묶음 테스트 조건", is_partner: false,
      source_url: "https://example.invalid/mock/bundle", checked_at: "2000-01-01",
    }],
  };
}

afterEach(() => vi.restoreAllMocks());

it("고려대 멀티 LLM은 고려대학교로 답한 사용자의 판정 대상에만 들어가요", () => {
  const subs = [{ service_id: "chatgpt", needs_check: false }] as Subscription[];
  const target = (school: string) => benefitTargets(subs, { school, status: "재학", school_email: true }, loadCatalog()).map((entry) => entry.id);
  expect(target("고려대학교")).toEqual(["ku_multi_llm_chatgpt"]);
  expect(target("이화여자대학교")).toEqual([]);
});

it("실제 로더에는 확인된 서비스·혜택만 있고 mock 혜택은 섞이지 않아요", () => {
  const catalog = loadCatalog();
  expect(catalog.services.map((service) => service.id)).toEqual([
    "netflix", "tving", "icloud", "daglo", "kakao_emoticon_plus", "goodnotes", "naver_plus", "spotify", "notion", "apple_music", "figma", "github_copilot", "jetbrains", "chatgpt", "google_ai_plus",
  ]);
  expect(catalog.benefits.map((benefit) => benefit.id)).toEqual(["spotify_premium_student", "notion_education_plan", "apple_music_student", "figma_education_plan", "github_copilot_student", "jetbrains_student_pack", "ku_multi_llm_chatgpt", "ku_multi_llm_gemini", "google_ai_plus_student"]);
  expect(catalog.benefits.some((benefit) => benefit.source_url.includes("example.invalid"))).toBe(false);
  expect(catalog.bundles).toEqual([]);
  expect(catalog.services.find((service) => service.id === "tving")?.plans[0].price).toBeNull();
  // 공식 페이지에서 가격을 확인한 서비스만 확인일이 있어요 (2026-11-07)
  const checked = new Set(["netflix", "spotify", "notion", "apple_music", "google_ai_plus"]);
  for (const service of catalog.services) {
    expect(service.checked_at).toBe(checked.has(service.id) ? "2026-11-07" : null);
    expect(service.cancel_url).toBeNull();
    expect(service.email_domains).toEqual([]);
  }
  catalog.services[0].name = "수정된 복사본";
  expect(loadCatalog().services[0].name).toBe("넷플릭스");
});

it("가짜 혜택은 표시가 있는 별도 파일에서 테스트에만 가져와요", () => {
  expect(mock._mock).toBe(true);
  expect(mock.benefits).toHaveLength(3);
  const { catalog, warnings } = validateCatalog(fixture());
  expect(catalog.benefits).toHaveLength(3);
  expect(warnings).toEqual([]);
});

describe("id와 참조 무결성", () => {
  it.each<{ name: string; mutate: (input: Catalog) => void; path: string }>([
    { name: "서비스 id 중복", mutate: (input) => input.services.push(input.services[0]), path: `services.json[${loadCatalog().services.length}].id` },
    { name: "혜택 id 중복", mutate: (input) => input.benefits.push(input.benefits[0]), path: "benefits.json[3].id" },
    { name: "묶음 id 중복", mutate: (input) => input.bundles.push(input.bundles[0]), path: "bundles.json[1].id" },
    { name: "요금제 id 중복", mutate: (input) => input.services[0].plans.push(input.services[0].plans[0]), path: "services.json[0].plans[1].id" },
    { name: "혜택의 서비스 참조", mutate: (input) => { input.benefits[0].service_id = "missing"; }, path: "benefits.json[0].service_id" },
    { name: "묶음의 서비스 참조", mutate: (input) => { input.bundles[0].includes[0].service_id = "missing"; }, path: "bundles.json[0].includes[0].service_id" },
    { name: "묶음의 요금제 참조", mutate: (input) => { input.bundles[0].includes[0].plan_id = "yearly"; }, path: "bundles.json[0].includes[0].plan_id" },
    { name: "멤버십 서비스 참조", mutate: (input) => { input.bundles[0].member_of = "missing"; }, path: "bundles.json[0].member_of" },
  ])("$name 오류의 파일·항목·필드를 알려줘요", ({ mutate, path }) => {
    const input = fixture();
    mutate(input);
    expect(() => validateCatalog(input)).toThrow(CatalogValidationError);
    expect(() => validateCatalog(input)).toThrow(path);
  });
});

it.each(["benefits", "bundles"] as const)("%s의 필수 근거 3개가 비어 있으면 실패해요", (collection) => {
  for (const field of ["conditions", "source_url", "checked_at"] as const) {
    const input = fixture();
    input[collection][0][field] = "   ";
    expect(() => validateCatalog(input)).toThrow(`${collection}.json[0].${field}`);
  }
});

it("다른 서비스의 별칭 중복은 경고로 알려주고 실패하지 않아요", () => {
  const input = fixture();
  input.services[0].aliases = ["SAMPLE ALIAS"];
  input.services[1].aliases = [" sample alias "];
  const { catalog, warnings } = validateCatalog(input);
  expect(catalog.services).toHaveLength(loadCatalog().services.length);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("services.json[1].aliases");
});

it("스키마 오류에 가격 필드와 파일명을 포함해요", () => {
  const input = fixture();
  Object.assign(input.services[0].plans[0], { price: "13500" });
  expect(() => validateCatalog(input)).toThrow("services.json[0].plans[0].price");
});

it("CLI는 유효한 카탈로그에서 성공 코드와 요약을 반환해요", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(runValidation()).toBe(0);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("서비스 15개, 혜택 9개, 묶음 0개"));
});

it("CLI는 conditions가 빈 실제 형식의 혜택에서 실패 코드 1을 반환해요", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const input = fixture();
  input.benefits[0].conditions = "";
  expect(runValidation(input)).toBe(1);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("benefits.json[0].conditions"));
});

it("CLI의 별칭 경고는 성공 종료를 유지해요", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const input = fixture();
  input.services[1].aliases = [...input.services[0].aliases];
  expect(runValidation(input)).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("별칭 중복"));
});
