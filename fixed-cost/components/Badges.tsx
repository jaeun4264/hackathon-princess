import type { Subscription } from "@/lib/types";

const chip = "inline-flex h-6 items-center rounded-[5px] px-2 text-sm";

/** 해석 출처: 카탈로그 / AI가 추정 / 직접 입력. AI가 한 일은 숨기지 않아요. */
export function SourceBadge({ source, confirmed }: { source: Subscription["interpret_source"]; confirmed?: boolean }) {
  if (source === "catalog") return <span className={`${chip} bg-raised text-accent-ink`}>등록된 서비스</span>;
  if (source === "ai") return <span className={`${chip} bg-raised text-accent-ink`}>{confirmed ? "AI 추정 · 확인함" : "AI가 추정"}</span>;
  if (source === "user") return <span className={`${chip} bg-ground text-muted`}>직접 입력</span>;
  return null;
}

/** 확인 필요 표시. 노랑 + 글자. */
export function NeedsCheckBadge() {
  return <span className={`${chip} border border-warning-line bg-warning-bg font-medium text-warning`}>확인 필요</span>;
}

/** 확신도를 숫자 대신 3단계로. TODO(팀): 기준값 0.85 / 0.7 (FRONTEND_PROMPTS F5) */
export function confidenceLevel(confidence: number): "높음" | "보통" | "낮음" {
  return confidence >= 0.85 ? "높음" : confidence >= 0.7 ? "보통" : "낮음";
}
