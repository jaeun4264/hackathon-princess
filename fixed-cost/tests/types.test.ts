import { expect, expectTypeOf, it } from "vitest";
import { USAGE_LABEL } from "../lib/types";
import type { Interval, Usage } from "../lib/types";

it("공통 타입과 사용 정도 라벨을 가져올 수 있어요", () => {
  expectTypeOf<Interval>().toEqualTypeOf<"monthly" | "yearly">();
  expectTypeOf<Usage>().toEqualTypeOf<"often" | "sometimes" | "rarely">();
  expect(USAGE_LABEL).toEqual({
    often: "자주",
    sometimes: "가끔",
    rarely: "거의 안 씀",
  });
});
