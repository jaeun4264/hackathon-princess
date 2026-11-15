"use client";

// 사용자 테스트용 켜고 끄기: 주소에 ?compare=off 를 붙이면 이슈 화면의 '소수 쪽 고정 자리'가 꺼집니다.
//   ?compare=on 으로 다시 켬. 한 번 붙이면 이 탭에서는 다른 화면으로 이동해도 유지됩니다 (sessionStorage).
//   새 탭(= 다음 참가자)은 기본값 '켜짐'에서 시작합니다.
import { useEffect, useSyncExternalStore } from "react";

const KEY = "compare-mode";

export function readCompareMode() {
  try {
    const param = new URLSearchParams(window.location.search).get("compare");
    if (param === "off" || param === "on") {
      sessionStorage.setItem(KEY, param);
      return param;
    }
    return sessionStorage.getItem(KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

function subscribe(callback) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

// "on" | "off" | "pending"(서버에서 미리 만든 화면 — 아직 주소를 모름)
export function useCompareMode() {
  return useSyncExternalStore(subscribe, readCompareMode, () => "pending");
}

// 어느 화면으로 들어오든 주소의 ?compare= 값을 기억해 두는 보이지 않는 부품 (layout에 둠)
export function CompareModeCapture() {
  useEffect(() => {
    readCompareMode();
  }, []);
  return null;
}
