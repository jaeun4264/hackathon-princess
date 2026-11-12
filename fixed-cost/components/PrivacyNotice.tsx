"use client";
import { useState } from "react";
import { BottomSheet } from "./BottomSheet";

// TODO(팀): 개인정보 안내 문구 최종본 (FRONTEND.md 1부 "사람이 직접 채워야 하는 값")
const SHORT = "결제 내역은 이 기기에서만 분석하고 서버에 저장하지 않아요.";

/** S0 맨 위 한 줄(항상 보임) + "자세히" 시트. */
export function PrivacyNotice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="mx-4 flex items-center gap-3 border-b border-line text-[13px] text-muted">
        <span className="flex-1 py-2">{SHORT}</span>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 font-semibold text-ink underline underline-offset-4">
          자세히
        </button>
      </p>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="내 정보는 이렇게 다뤄요">
        <ul className="list-disc space-y-3 pl-5 text-base leading-relaxed">
          <li>결제 내역은 이 기기에서만 분석하고 서버에 저장하지 않아요.</li>
          <li>Gmail은 영수증 메일만 검색해요. 메일 내용은 서버로 보내지 않고, 다 읽으면 접근 권한을 바로 돌려줘요.</li>
          <li>AI에는 결제 이름·금액·주기와 학교·재학 여부만 보내요. 이름·이메일·카드번호는 보내지 않아요.</li>
          <li>외화 영수증은 공개 환율(유럽중앙은행 기준)로 원화로 바꿔요. 환율을 받을 때 내 정보는 보내지 않아요.</li>
          <li>&quot;내 데이터 지우기&quot;를 누르면 이 기기에 남은 기록이 모두 지워져요.</li>
        </ul>
      </BottomSheet>
    </>
  );
}
