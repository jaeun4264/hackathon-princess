import "./globals.css";
import { SiteHeader } from "@/components/news/site-header";

// 브라우저 탭에 보이는 제목과 설명
export const metadata = {
  title: "뉴스 편향도 분석",
  description: "같은 이슈를 언론사별로 비교해 보는 뉴스 사이트 (19팀 해커톤)",
};

// 모든 페이지를 감싸는 공통 틀
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
