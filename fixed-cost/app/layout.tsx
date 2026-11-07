import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// 빌드할 때 내려받아 앱과 함께 배포돼요 (브라우저가 Google에 따로 요청하지 않음).
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "고정비 관리",
  description: "대학생 구독을 정리하고 학생 혜택으로 아낄 수 있는 금액을 보여 줘요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f5f7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={manrope.variable}>
      <body className="min-h-dvh bg-ground text-ink antialiased">
        {/* 폰 화면 기준. 데스크톱은 가운데 정렬 컬럼(최대 480px, FRONTEND.md 4부 원칙 1) */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>
      </body>
    </html>
  );
}
