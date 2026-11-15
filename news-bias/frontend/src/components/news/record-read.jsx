"use client";

// 기사 상세 화면이 열리면 열람 기록에 남기는 보이지 않는 부품
// 주소의 ?from=recommend 같은 값으로 어디서 눌러 들어왔는지도 함께 남김
import { useEffect } from "react";
import { recordRead } from "@/lib/reading-history";

export function RecordRead({ articleId }) {
  useEffect(() => {
    let from;
    try {
      from = new URLSearchParams(window.location.search).get("from") ?? undefined;
    } catch {}
    recordRead(articleId, from);
  }, [articleId]);
  return null;
}
