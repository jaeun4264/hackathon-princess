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

// ---------- 조사 (을/를, 은/는, 과/와, 으로/로) ----------
// 받침: 'none' 없음, 'rieul' ㄹ받침, 'other' 그 밖의 받침
type Batchim = "none" | "rieul" | "other";
const DIGIT_BATCHIM: Record<string, Batchim> = { "0": "other", "1": "rieul", "2": "none", "3": "other", "4": "none", "5": "none", "6": "other", "7": "rieul", "8": "rieul", "9": "none" };

/** 단어 마지막 글자의 받침. 한글은 정확히, 영문·숫자는 읽는 소리로 어림해요 (Netflix→넷플릭스, Gmail→지메일). */
export function batchimOf(word: string): Batchim {
  const last = word.trim().replace(/[\s)\]"'’.,!?]+$/u, "").slice(-1);
  if (!last) return "none";
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
  }
  if (last in DIGIT_BATCHIM) return DIGIT_BATCHIM[last];
  const lower = word.trim().toLowerCase();
  if (/l$/u.test(lower)) return "rieul";
  if (/(?:m|n|ng)$/u.test(lower)) return "other";
  return "none";
}

const JOSA_PAIRS: Record<string, [withBatchim: string, without: string]> = {
  을: ["을", "를"], 를: ["을", "를"], 은: ["은", "는"], 는: ["은", "는"], 과: ["과", "와"], 와: ["과", "와"],
  으로: ["으로", "로"], 로: ["으로", "로"],
};

/** 단어 뒤에 붙을 조사를 받침에 맞게 골라요. ㄹ받침 뒤 '으로'는 '로'예요. */
export function josa(word: string, particle: string): string {
  const pair = JOSA_PAIRS[particle];
  if (!pair) return particle;
  const batchim = batchimOf(word);
  if (pair[0] === "으로") return batchim === "other" ? "으로" : "로";
  return batchim === "none" ? pair[1] : pair[0];
}

export function fillPlaceholders(template: string, params: Params): string {
  // 자리 표시 바로 뒤의 조사는 채워 넣은 값에 맞춰 바꿔요 (예: {service_name}을 → 넷플릭스를).
  return template.replace(/\{([^{}]+)\}(으로|로|을|를|은|는|과|와)?/gu, (_, key: string, particle: string | undefined) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) throw new Error("문장에 필요한 값이 없어요");
    const value = params[key as keyof Params];
    let filled: string;
    if (key === "saving_monthly" || key === "saving_yearly") {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("금액이 올바르지 않아요");
      filled = `${value.toLocaleString("ko-KR")}원`;
    } else {
      if ((key !== "service_name" && key !== "alt_name") || typeof value !== "string") throw new Error("허용되지 않은 자리 표시예요");
      filled = value;
    }
    return particle ? filled + josa(filled, particle) : filled;
  });
}
