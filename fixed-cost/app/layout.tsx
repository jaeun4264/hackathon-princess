import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "고정비 관리 시스템",
  description: "대학생 구독을 정리하고 학생 혜택으로 아낄 수 있는 금액을 보여 줘요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-bg text-fg antialiased">
        {/* 폰 화면 기준. 데스크톱은 가운데 정렬 컬럼(최대 480px) */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-bg">{children}</div>
      </body>
    </html>
  );
}
