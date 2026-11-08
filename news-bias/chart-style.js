"use client";

// 그래프 모양(막대/도넛) 선택을 브라우저에 기억하고, 모든 화면이 같은 값을 쓰게 하는 도구
import { useSyncExternalStore } from "react";

const KEY = "chart-style";
const EVENT = "chart-style-change";

function read() {
  try {
    return localStorage.getItem(KEY) === "donut" ? "donut" : "bar";
  } catch {
    return "bar";
  }
}

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useChartStyle() {
  return useSyncExternalStore(subscribe, read, () => "bar");
}

export function setChartStyle(style) {
  try {
    localStorage.setItem(KEY, style);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
