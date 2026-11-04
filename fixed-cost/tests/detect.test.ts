import { expect, it } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { AMOUNT_TOLERANCE, detectSubscriptionCandidates, monthlyEquivalent } from "../lib/rules";
import { SubscriptionCandidateSchema, TransactionSchema } from "../lib/schemas";
import type { Transaction } from "../lib/types";
import example from "./fixtures/detect-example.json";

function tx(id: string, date: string, amount = 10000, raw_name = "가상 서비스", payment_method = "card"): Transaction {
  return TransactionSchema.parse({ id, date, amount, raw_name, payment_method, currency: "KRW", source: "sample" });
}

it("가상 예시 9건에서 월간·연간 후보만 찾고 편의점 5건은 제외해요", () => {
  expect(example._mock).toBe(true);
  const input = TransactionSchema.array().parse(example.transactions);
  const output = detectSubscriptionCandidates(input, loadCatalog());
  expect(output).toEqual([
    { key: "굿노트|apple|50500|yearly", raw_name: "굿노트", amount: 50500, interval: "yearly", payment_method: "apple", transaction_ids: ["sample-goodnotes"], next_date: "2025-02-28" },
    { key: "넷플릭스|card|13500|monthly", raw_name: "넷플릭스 2026.03.31", amount: 13500, interval: "monthly", payment_method: "card", transaction_ids: ["sample-netflix-1", "sample-netflix-2", "sample-netflix-3"], next_date: "2026-04-30" },
  ]);
  expect(SubscriptionCandidateSchema.array().parse(output)).toEqual(output);
  expect(detectSubscriptionCandidates(input.filter((item) => item.id.startsWith("sample-store")), loadCatalog())).toEqual([]);
});

it("같은 금액의 월 반복 2건을 후보로 찾아요", () => {
  const result = detectSubscriptionCandidates([tx("a", "2026-01-10"), tx("b", "2026-02-10")], loadCatalog());
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ interval: "monthly", transaction_ids: ["a", "b"], next_date: "2026-03-10" });
});

it.each([
  ["2026-01-26", true], ["2026-02-05", true],
  ["2026-01-25", false], ["2026-02-06", false],
])("간격 25~35일의 경계를 확인해요: %s", (date, expected) => {
  const result = detectSubscriptionCandidates([tx("a", "2026-01-01"), tx("b", date)], loadCatalog());
  expect(result.length).toBe(expected ? 1 : 0);
});

it("짝수 개 간격의 중앙값을 사용해요", () => {
  const result = detectSubscriptionCandidates([tx("a", "2026-01-01"), tx("b", "2026-01-26"), tx("c", "2026-03-02")], loadCatalog());
  expect(result).toHaveLength(1);
});

it("불규칙한 짧은 간격의 단발 결제는 후보가 아니에요", () => {
  expect(detectSubscriptionCandidates([
    tx("a", "2026-01-01"), tx("b", "2026-01-06"), tx("c", "2026-01-15"), tx("d", "2026-01-22"),
  ], loadCatalog())).toEqual([]);
});

it.each([[9700, true], [10300, true], [9699, false], [10301, false]])(
  "금액 ±3%% 경계를 확인해요: %s", (amount, expected) => {
    expect(AMOUNT_TOLERANCE).toBe(0.03);
    const result = detectSubscriptionCandidates([tx("a", "2026-01-01"), tx("b", "2026-02-01", amount)], loadCatalog());
    expect(result.length).toBe(expected ? 1 : 0);
    if (expected) expect(result[0].amount).toBe(amount);
  },
);

it("첫 금액 기준으로 묶어 3% 오차가 연쇄적으로 커지지 않아요", () => {
  const result = detectSubscriptionCandidates([
    tx("a", "2026-01-01", 10000), tx("b", "2026-02-01", 10300), tx("c", "2026-03-01", 10609),
  ], loadCatalog());
  expect(result).toHaveLength(1);
  expect(result[0].transaction_ids).toEqual(["a", "b"]);
});

it("같은 이름이어도 금액대와 결제 수단별 후보를 나눠요", () => {
  const result = detectSubscriptionCandidates([
    tx("a", "2026-01-01"), tx("b", "2026-02-01"),
    tx("c", "2026-01-01", 20000), tx("d", "2026-02-01", 20000),
    tx("e", "2026-01-01", 10000, "가상 서비스", "apple"), tx("f", "2026-02-01", 10000, "가상 서비스", "apple"),
  ], loadCatalog());
  expect(result).toHaveLength(3);
  expect(new Set(result.map((item) => item.key)).size).toBe(3);
});

it.each([
  ["굿노트", 50500, true], ["(주) 굿노트 2026.01.31", 50500, true],
  ["굿노트", 50499, false], ["미등록 서비스", 50500, false], ["넷플릭스", 13500, false],
])("연간 1건은 별칭과 yearly 가격이 모두 일치해야 해요: %s %s", (name, amount, expected) => {
  const result = detectSubscriptionCandidates([tx("a", "2026-01-31", amount, name)], loadCatalog());
  expect(result.length).toBe(expected ? 1 : 0);
  if (expected) expect(result[0]).toMatchObject({ interval: "yearly", next_date: "2027-01-31" });
});

it("미확인 yearly 가격은 연간 후보의 근거로 쓰지 않아요", () => {
  const catalog = loadCatalog();
  catalog.services.find((service) => service.id === "goodnotes")!.plans[0].price = null;
  expect(detectSubscriptionCandidates([tx("a", "2026-01-01", 50500, "굿노트")], catalog)).toEqual([]);
});

it.each([
  ["2026-12-31", "2027-01-31", "2027-02-28"],
  ["2023-12-31", "2024-01-31", "2024-02-29"],
  ["2026-10-30", "2026-11-30", "2026-12-30"],
])("다음 월 결제일의 말일·윤년·연도 경계를 보정해요: %s", (first, last, next) => {
  const result = detectSubscriptionCandidates([tx("a", first), tx("b", last)], loadCatalog());
  expect(result[0].next_date).toBe(next);
});

it("결제 내역과 카탈로그를 바꾸지 않고 입력 순서와 무관한 결과를 내요", () => {
  const input = TransactionSchema.array().parse(example.transactions);
  const catalog = loadCatalog();
  const before = structuredClone({ input, catalog });
  const output = detectSubscriptionCandidates(input, catalog);
  expect(detectSubscriptionCandidates([...input].reverse(), catalog)).toEqual(output);
  expect({ input, catalog }).toEqual(before);
});

it("빈 입력과 정규화 후 이름이 없는 결제는 후보가 없어요", () => {
  expect(detectSubscriptionCandidates([], loadCatalog())).toEqual([]);
  expect(detectSubscriptionCandidates([tx("a", "2026-01-01", 10000, "123"), tx("b", "2026-02-01", 10000, "456")], loadCatalog())).toEqual([]);
});

it("B1 스키마로 잘못된 원화 금액을 거부해요", () => {
  expect(() => detectSubscriptionCandidates([{ ...tx("a", "2026-01-01"), amount: 1.5 }], loadCatalog())).toThrow();
});

it.each([[50500, "yearly", 4208], [13500, "monthly", 13500], [0, "yearly", 0]] as const)(
  "월 환산: %s %s → %s", (amount, interval, expected) => {
    expect(monthlyEquivalent(amount, interval)).toBe(expected);
  },
);
