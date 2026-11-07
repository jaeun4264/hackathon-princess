import Link from "next/link";

/** 빈 상태: 무엇이 없는지 + 다음에 할 수 있는 행동 하나. */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const buttonClass =
    "mt-6 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-5 text-base font-semibold text-primary-fg";
  return (
    <section className="flex flex-col items-center px-6 py-16 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      {description ? <p className="mt-2 text-base text-muted">{description}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className={buttonClass}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && !actionHref && onAction ? (
        <button type="button" onClick={onAction} className={buttonClass}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
