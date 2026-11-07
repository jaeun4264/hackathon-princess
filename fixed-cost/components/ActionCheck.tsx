"use client";
import { useState } from "react";
import { ACTION_LABEL, KEEP_REASON_LABEL, type ActionChoice, type KeepReason } from "@/lib/client/report";
import type { Suggestion } from "@/lib/types";
import { BottomSheet } from "./BottomSheet";

const CHOICES: ActionChoice[] = ["done", "changed", "kept"];

/** 해지했어요 / 바꾸었어요 / 유지할게요. 누른 상태가 보이고 바꿀 수 있어요. 유지면 이유를 한 번 물어봐요. */
export function ActionCheck({
  suggestion,
  title,
  onAction,
  onKeepReason,
}: {
  suggestion: Suggestion;
  title: string;
  onAction: (status: ActionChoice) => void;
  onKeepReason: (reason: KeepReason) => void;
}) {
  const [asking, setAsking] = useState(false);
  const current = suggestion.action_status;

  return (
    <>
      <div role="group" aria-label={`${title} 실행 체크`} className="grid grid-cols-3 gap-1 rounded-[10px] bg-ground p-1">
        {CHOICES.map((choice) => {
          const pressed = current === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                onAction(choice);
                if (choice === "kept") setAsking(true);
              }}
              className={`flex min-h-11 items-center justify-center gap-1 rounded-[8px] text-sm transition-colors ${
                pressed ? (choice === "kept" ? "bg-surface font-semibold text-ink" : "bg-often-bg font-semibold text-often-ink") : "text-muted hover:bg-surface"
              }`}
            >
              {pressed ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-7" />
                </svg>
              ) : null}
              {ACTION_LABEL[choice]}
            </button>
          );
        })}
      </div>
      {current === "kept" && suggestion.keep_reason ? (
        <p className="mt-2 text-sm text-muted">유지하는 이유: {KEEP_REASON_LABEL[suggestion.keep_reason]}</p>
      ) : null}

      <BottomSheet open={asking} onClose={() => setAsking(false)} title="왜 유지하시나요?">
        <p className="mb-4 text-sm text-muted">이유는 이름·금액 없이 익명으로만 세요.</p>
        <div className="space-y-2">
          {(Object.keys(KEEP_REASON_LABEL) as KeepReason[]).map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => {
                onKeepReason(reason);
                setAsking(false);
              }}
              className="flex min-h-12 w-full items-center rounded-[10px] bg-ground px-4 text-left text-base hover:bg-raised active:scale-[0.99]"
            >
              {KEEP_REASON_LABEL[reason]}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
