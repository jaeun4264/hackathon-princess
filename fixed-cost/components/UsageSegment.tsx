"use client";
import { useRef, type KeyboardEvent } from "react";
import { USAGE_LABEL, type Usage } from "@/lib/types";

const ORDER: Usage[] = ["often", "sometimes", "rarely"];
const SELECTED: Record<Usage, string> = {
  often: "bg-often-bg text-often-ink",
  sometimes: "bg-sometimes-bg text-sometimes-ink",
  rarely: "bg-rarely-bg text-rarely-ink",
};

/**
 * 자주 / 가끔 / 거의 안 씀 3분할 버튼. role="radiogroup", 좌우 화살표로 이동·선택.
 * 선택은 색과 글자(✓)를 함께 바꿔서 색만으로 구분하지 않아요.
 */
export function UsageSegment({ value, onChange, label }: { value: Usage | null; onChange: (usage: Usage) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // 아직 안 골랐으면 첫 칸이 Tab 순서를 받아요.
  const focusIndex = value ? ORDER.indexOf(value) : 0;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + ORDER.length) % ORDER.length;
    onChange(ORDER[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-[10px] bg-ground p-1">
      {ORDER.map((usage, index) => {
        const checked = value === usage;
        return (
          <button
            key={usage}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onChange(usage)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-[8px] text-sm transition-colors ${
              checked ? `${SELECTED[usage]} font-semibold` : "text-muted hover:bg-surface"
            }`}
          >
            {checked ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
            ) : null}
            {USAGE_LABEL[usage]}
          </button>
        );
      })}
    </div>
  );
}
