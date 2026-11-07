"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "홈", icon: "M3 9.5L10 4l7 5.5V17H12.5v-4.5h-5V17H3z" },
  { href: "/benefits", label: "혜택", icon: "M4 8h12v9H4zM3 5h14v3H3zM10 5v12M10 5c-1.5-2.5-4.5-2.5-4.5-.5S8.5 5 10 5zm0 0c1.5-2.5 4.5-2.5 4.5-.5S11.5 5 10 5z" },
  { href: "/report", label: "리포트", icon: "M5 3h7l3 3v11H5zM8 9h5M8 12h5M8 15h3" },
];

/** 하단 탭바 (S2·S4·S5). 지금 화면은 글자 굵기와 잉크색으로 표시해요 (색 알약 없음). */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 화면" className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[480px] bg-surface shadow-[0_-1px_0_var(--color-line)]">
      <ul className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm ${active ? "font-semibold text-ink" : "text-muted"}`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
