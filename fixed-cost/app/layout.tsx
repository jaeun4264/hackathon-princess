import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
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
        {/*
          폭에 따라 세 가지:
          - 폰(~767px): 한 줄 컬럼, 최대 480px. 윗줄 + 하단 탭.
          - 태블릿(768~1023px): 같은 구성, 최대 720px.
          - 데스크톱(1024px~): 왼쪽 메뉴 232px + 작업 영역(최대 1200px, 좌우 24px + 화면 안쪽 16px = 40px 여백).
        */}
        <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
          <Sidebar />
          <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col md:max-w-[720px] lg:max-w-[1248px] lg:px-6 lg:pt-6">{children}</div>
        </div>
      </body>
    </html>
  );
}
