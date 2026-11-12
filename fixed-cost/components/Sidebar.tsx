"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useHasSubscriptions } from "@/lib/client/guards";
import { PRODUCT_NAME, ProductMark } from "./AppBar";
import { LOCKED_HINT, NAV_ITEMS, NO_DATA_MESSAGE } from "./TabBar";

/**
 * 데스크톱(1024px 이상)의 왼쪽 메뉴. 폰·태블릿에서는 숨기고 윗줄(AppBar)과 하단 탭(TabBar)을 써요.
 * 바탕은 화면과 같은 색, 지금 화면은 회색 알약 + 잉크색 글자 (색 알약·왼쪽 막대 없음).
 * 결제 내역을 넣기 전에는 홈·절감 리포트를 흐리게 두고, 왜 닫혀 있는지 한 줄로 알려 줘요.
 */
export function Sidebar() {
  const pathname = usePathname();
  const hasData = useHasSubscriptions();
  const anyLocked = !hasData && NAV_ITEMS.some((item) => item.needsData);
  // 흐린 항목을 누를 때마다 숫자를 올려서 안내를 다시 읽어 주고 잠깐 강조해요.
  const [pokes, setPokes] = useState(0);
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col px-3 pb-6 pt-5 lg:flex" aria-label="메뉴">
      <Link href="/" className="mb-6 flex min-h-11 items-center gap-2 px-3 text-base font-semibold">
        <ProductMark size={26} />
        <span>{PRODUCT_NAME}</span>
      </Link>
      <nav aria-label="주요 화면">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href) || (item.href === "/home" && pathname.startsWith("/payment"));
            const icon = (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
            );
            if (item.needsData && !hasData) {
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-describedby="nav-locked-hint"
                    onClick={() => setPokes((count) => count + 1)}
                    className="flex min-h-10 w-full cursor-not-allowed items-center gap-2.5 px-3 text-left text-[15px] text-muted opacity-40"
                  >
                    {icon}
                    {item.label}
                    <span className="sr-only"> ({LOCKED_HINT})</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-[15px] transition-colors ${active ? "bg-active font-semibold text-ink" : "text-muted hover:bg-active/60 hover:text-ink"}`}
                >
                  {icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {anyLocked ? (
          <p
            id="nav-locked-hint"
            key={pokes}
            role="status"
            className={`mx-1 mt-4 rounded-[10px] px-3 py-3 text-sm leading-5 ${pokes > 0 ? "bg-warning-bg text-warning" : "bg-[#e9ecf0] text-ink"}`}
          >
            <span className="block font-semibold">{NO_DATA_MESSAGE}</span>
            <span className={`mt-0.5 block ${pokes > 0 ? "" : "text-muted"}`}>넣으면 홈과 절감 리포트를 볼 수 있어요.</span>
          </p>
        ) : null}
      </nav>
      <p className="mt-auto px-3 text-sm leading-5 text-muted">결제 내역은 이 기기에서만 분석하고 서버에 저장하지 않아요.</p>
    </aside>
  );
}
