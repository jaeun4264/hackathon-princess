import type { ReactNode } from "react";

/** 화면 위 한 줄 알림. 오류여도 다음 행동을 같이 보여 줘요 (막다른 길 없음). */
export function ErrorBanner({
  children,
  tone = "warning",
  action,
}: {
  children: ReactNode;
  tone?: "warning" | "danger";
  action?: ReactNode;
}) {
  const colors = tone === "danger" ? "bg-danger-bg text-danger" : "border border-warning-line bg-warning-bg text-warning";
  return (
    <div role="status" className={`flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm ${colors}`}>
      <p className="flex-1">{children}</p>
      {action}
    </div>
  );
}
