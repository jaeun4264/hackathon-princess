import Link from "next/link";
import type { ReactNode } from "react";

// TODO(팀): 서비스 이름 확정 전까지 "고정비 관리"를 써요.
export const PRODUCT_NAME = "고정비 관리";

/** 앱 표시: 영수증 세 줄. 마지막 짧은 줄이 "새는 돈"이에요. */
export function ProductMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--color-ink)" />
      <rect x="6" y="7" width="12" height="2" rx="1" fill="#fff" />
      <rect x="6" y="11" width="12" height="2" rx="1" fill="#fff" />
      <rect x="6" y="15" width="6" height="2" rx="1" fill="var(--color-rarely-bg)" />
    </svg>
  );
}

/** 폰의 48px 윗줄: 앱 표시와 이름, 오른쪽에 동작 하나까지. */
export function AppBar({ action }: { action?: ReactNode }) {
  return (
    <header className="flex h-12 items-center gap-2 px-4">
      <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold">
        <ProductMark />
        <span>{PRODUCT_NAME}</span>
      </Link>
      <div className="ml-auto">{action}</div>
    </header>
  );
}
