import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// 여러 Tailwind 클래스를 합칠 때 충돌하는 클래스를 정리해 주는 함수
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
