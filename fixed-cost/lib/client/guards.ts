"use client";
// 라우트 가드 (FRONTEND.md 4부 1절). localStorage에서 상태를 다 읽은 뒤(hydration)에만 판단해요.
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useAppStore } from "./store";

/** persist가 저장된 상태를 다 읽었는지. 읽기 전에는 가드가 판단하지 않아요(새로 고침 시 잘못 튕기지 않게). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  );
}

/** 구독이 없으면 /로 보내요. 준비됐으면 true. */
export function useRequireSubscriptions(): boolean {
  const router = useRouter();
  const hydrated = useHydrated();
  const count = useAppStore((state) => state.subscriptions.length);
  const ok = hydrated && count > 0;
  useEffect(() => {
    if (hydrated && count === 0) router.replace("/");
  }, [hydrated, count, router]);
  return ok;
}

/** 구독이 없으면 /로, 사용 정도가 비어 있으면 /confirm으로 보내요. 준비됐으면 true. */
export function useRequireUsage(): boolean {
  const router = useRouter();
  const hydrated = useHydrated();
  const count = useAppStore((state) => state.subscriptions.length);
  const missingUsage = useAppStore((state) => state.subscriptions.some((sub) => sub.usage === null));
  const ok = hydrated && count > 0 && !missingUsage;
  useEffect(() => {
    if (!hydrated) return;
    if (count === 0) router.replace("/");
    else if (missingUsage) router.replace("/confirm");
  }, [hydrated, count, missingUsage, router]);
  return ok;
}
