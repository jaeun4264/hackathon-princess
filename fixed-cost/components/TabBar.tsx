"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useHasSubscriptions } from "@/lib/client/guards";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** 결제 내역(구독)이 있어야 열리는 화면. 없으면 흐리게 두고 누를 수 없어요. */
  needsData?: boolean;
}

const HOME: NavItem = { href: "/home", label: "홈", icon: "M3 9.5L10 4l7 5.5V17H12.5v-4.5h-5V17H3z", needsData: true };
const BENEFITS: NavItem = { href: "/benefits", label: "혜택", icon: "M4 8h12v9H4zM3 5h14v3H3zM10 5v12M10 5c-1.5-2.5-4.5-2.5-4.5-.5S8.5 5 10 5zm0 0c1.5-2.5 4.5-2.5 4.5-.5S11.5 5 10 5z" };
const REPORT: NavItem = { href: "/report", label: "리포트", icon: "M5 3h7l3 3v11H5zM8 9h5M8 12h5M8 15h3", needsData: true };
const TABS = [HOME, BENEFITS, REPORT];

/** 데스크톱 왼쪽 메뉴의 항목. 폰 탭바보다 "결제 내역 넣기"가 하나 더 있어요 (폰은 윗줄 로고로 가요). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "결제 내역 넣기", icon: "M10 3v10M6 9l4 4 4-4M4 16h12" },
  HOME,
  { ...BENEFITS, label: "혜택 찾기" },
  { ...REPORT, label: "절감 리포트" },
];

export const LOCKED_HINT = "결제 내역을 넣으면 열려요";
export const NO_DATA_MESSAGE = "아직 결제 내역을 넣지 않았어요";

/** 하단 탭바 (S2·S4·S5, 폰·태블릿). 지금 화면은 글자 굵기와 잉크색으로 표시해요 (색 알약 없음). 데스크톱은 Sidebar. */
export function TabBar() {
  const pathname = usePathname();
  const hasData = useHasSubscriptions();
  const [notice, setNotice] = useState<string | null>(null);
  // 안내는 3초 뒤에 사라져요.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <nav aria-label="주요 화면" className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[480px] bg-surface shadow-[0_-1px_0_var(--color-line)] md:max-w-[720px] lg:hidden">
      {/* 흐린 탭을 누르면 탭바 바로 위에 왜 닫혀 있는지 알려 줘요. 화면 위에 떠 있는 안내라 그림자를 둬요. taste-skill-ignore */}
      <p role="status" className={`pointer-events-none absolute inset-x-4 bottom-full mb-2 rounded-[10px] bg-ink px-4 py-3 text-sm text-primary-fg shadow-lg transition-opacity ${notice ? "opacity-100" : "opacity-0"}`}>
        {notice ? <>{notice}. <Link href="/" className="pointer-events-auto font-semibold underline underline-offset-4">결제 내역 넣기</Link></> : null}
      </p>
      <ul className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const icon = (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
              <path d={tab.icon} />
            </svg>
          );
          if (tab.needsData && !hasData) {
            return (
              <li key={tab.href}>
                <button
                  type="button"
                  aria-disabled="true"
                  onClick={() => setNotice(`${NO_DATA_MESSAGE}. ${tab.label}${tab.label === "홈" ? "은" : "는"} ${LOCKED_HINT}`)}
                  className="flex min-h-14 w-full cursor-not-allowed flex-col items-center justify-center gap-0.5 text-sm text-muted opacity-40"
                >
                  {icon}
                  {tab.label}
                  <span className="sr-only"> ({LOCKED_HINT})</span>
                </button>
              </li>
            );
          }
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm ${active ? "font-semibold text-ink" : "text-muted"}`}
              >
                {icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
