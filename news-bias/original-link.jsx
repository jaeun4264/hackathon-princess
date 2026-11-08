"use client";

// "원문 보기" 링크: 언론사 기사를 새 탭으로 열고, 누른 기록을 남김
import { recordOriginalClick } from "@/lib/reading-history";

export function OriginalLink({ articleId, url, outletName, className }) {
  const hasUrl = url && url !== "#";
  if (!hasUrl) {
    return <span className={className + " text-muted-foreground no-underline"}>원문 링크 준비 중 (예시 데이터)</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordOriginalClick(articleId)}
      className={className}
    >
      {outletName ? `${outletName}에서 원문 보기 ↗` : "원문 보기 ↗"}
    </a>
  );
}
