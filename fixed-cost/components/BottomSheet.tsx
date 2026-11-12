"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 아래에서 올라오는 시트. ESC로 닫기, 열릴 때 포커스 이동·가두기, 배경 스크롤 잠금, 닫으면 원래 자리로 포커스 복귀. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    // 폰·태블릿은 아래에서 올라오는 시트, 데스크톱은 화면 가운데 대화상자.
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <button type="button" aria-label="닫기" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // 시트는 화면 위에 떠 있는 대화상자라 그림자를 둬요. taste-skill-ignore
        className="relative max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[20px] bg-surface px-4 pb-6 pt-3 shadow-xl outline-none md:max-w-[720px] lg:max-w-[520px] lg:rounded-[20px] lg:px-6 lg:pt-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line lg:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-ground" aria-label="시트 닫기">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
