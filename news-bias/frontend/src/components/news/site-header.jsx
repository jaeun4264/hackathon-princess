import Link from "next/link";
import { ChartStyleToggle } from "@/components/news/chart-style-toggle";

// 모든 화면 위에 보이는 머리글
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-bold tracking-tight">
          뉴스 편향도 분석
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground md:inline">예시 데이터로 만든 화면입니다</span>
          <Link href="/me" className="text-sm font-medium hover:underline">
            내 읽기 편향
          </Link>
          <ChartStyleToggle />
        </div>
      </div>
    </header>
  );
}
