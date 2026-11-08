"use client";

// 기사 상세 화면이 열리면 열람 기록에 남기는 보이지 않는 부품
import { useEffect } from "react";
import { recordRead } from "@/lib/reading-history";

export function RecordRead({ articleId }) {
  useEffect(() => {
    recordRead(articleId);
  }, [articleId]);
  return null;
}
