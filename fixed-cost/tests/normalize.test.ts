import { expect, it } from "vitest";
import { normalize } from "../lib/rules/normalize";

it.each([
  ["  NETFLIX!  ", "netflix"],
  ["(주) 넷플릭스 2026.01.31", "넷플릭스"],
  ["넷플릭스2026-02-28", "넷플릭스"],
  ["넷플릭스 26/03/31", "넷플릭스"],
  ["넷플릭스 2026년 4월 30일", "넷플릭스"],
  ["가상_서비스 #1234", "가상서비스"],
  ["( 주 ) 카카오톡 이모티콘 플러스", "카카오톡이모티콘플러스"],
  ["24시 편의점", "24시편의점"],
  ["", ""],
  ["(주) 1234 !!!", ""],
])("표기 %s를 %s로 정규화해요", (input, expected) => {
  expect(normalize(input)).toBe(expected);
});
