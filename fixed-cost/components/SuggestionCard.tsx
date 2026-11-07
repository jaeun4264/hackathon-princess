import type { ReactNode } from "react";
import { won } from "@/lib/client/confirm";
import type { Suggestion } from "@/lib/types";

const TITLE: Record<Suggestion["type"], string> = {
  cancel: "해지",
  pause: "잠시 쉬기",
  student_discount: "학생 할인",
  school_license: "학교 라이선스",
  bundle: "묶음으로 바꾸기",
  keep: "유지",
};

/** 제안 한 줄: 무엇을·누구에게, 문장, 월·연 절약액, 배지(제휴·재확인 필요·확인일). 홈 미리보기와 리포트에서 같이 써요. */
export function SuggestionCard({ suggestion, serviceName, compact = false, children }: { suggestion: Suggestion; serviceName: string; compact?: boolean; children?: ReactNode }) {
  const saving = suggestion.saving_monthly > 0;
  // 확인일은 가격·혜택 정보(출처)가 있는 제안에만 의미가 있어요. 해지 제안은 사용자 결제 금액이라 '재확인 필요'를 붙이지 않아요.
  const hasSource = suggestion.source_url !== null || suggestion.checked_at !== null;
  const stale = hasSource && suggestion.stale;
  return (
    <div className={compact ? "py-3" : "rounded-[20px] bg-surface p-5"}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">
            {serviceName} {TITLE[suggestion.type]}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{suggestion.message}</p>
        </div>
        {saving ? (
          <div className="shrink-0 text-right">
            <p className="num text-base font-semibold">월 {won(suggestion.saving_monthly)}</p>
            <p className="num text-sm text-muted">연 {won(suggestion.saving_yearly)}</p>
          </div>
        ) : null}
      </div>
      {suggestion.is_partner || stale || suggestion.checked_at ? (
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {suggestion.is_partner ? <span className="inline-flex h-6 items-center rounded-[5px] bg-ground px-2 text-ink">제휴</span> : null}
          {stale ? (
            <span className="inline-flex h-6 items-center rounded-[5px] border border-warning-line bg-warning-bg px-2 text-warning">재확인 필요</span>
          ) : null}
          {suggestion.checked_at ? <span className="inline-flex h-6 items-center text-muted">확인일 {suggestion.checked_at}</span> : null}
        </div>
      ) : null}
      {!compact && (suggestion.cancel_url || suggestion.source_url) ? (
        <div className="mt-3 flex flex-wrap gap-x-4 text-sm">
          {suggestion.cancel_url && (suggestion.type === "cancel" || suggestion.type === "pause") ? (
            <a href={suggestion.cancel_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center font-semibold underline underline-offset-4">
              해지 방법 보기
            </a>
          ) : null}
          {suggestion.source_url ? (
            <a href={suggestion.source_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-muted underline underline-offset-4">
              출처
            </a>
          ) : null}
        </div>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
