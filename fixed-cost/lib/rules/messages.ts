import type { SuggestionType } from "../types";

export const DEFAULT_MESSAGES: Record<SuggestionType, string> = {
  cancel: "거의 쓰지 않는 {service_name}을 해지하면 월 {saving_monthly}, 연 {saving_yearly}을 아낄 수 있어요.",
  pause: "{service_name}을 잠시 쉬면 월 {saving_monthly}을 아낄 수 있어요.",
  student_discount: "{service_name}에 {alt_name}을 적용하면 월 {saving_monthly}을 아낄 수 있어요.",
  school_license: "{service_name} 대신 {alt_name}을 이용하면 월 {saving_monthly}을 아낄 수 있어요.",
  bundle: "{alt_name}으로 바꾸면 월 {saving_monthly}을 아낄 수 있어요.",
  keep: "자주 쓰는 {service_name}은 유지해도 좋아요.",
};
type Params = { service_name?: string; alt_name?: string; saving_monthly?: number; saving_yearly?: number };
export function fillPlaceholders(template: string, params: Params): string {
  return template.replace(/\{([^{}]+)\}/gu, (_, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) throw new Error("문장에 필요한 값이 없어요");
    const value = params[key as keyof Params];
    if (key === "saving_monthly" || key === "saving_yearly") {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("금액이 올바르지 않아요");
      return `${value.toLocaleString("ko-KR")}원`;
    }
    if ((key !== "service_name" && key !== "alt_name") || typeof value !== "string") throw new Error("허용되지 않은 자리 표시예요");
    return value;
  });
}
