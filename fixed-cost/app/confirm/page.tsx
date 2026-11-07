"use client";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/Skeleton";
import { useRequireSubscriptions } from "@/lib/client/guards";

// S1 구독 확인 — F3에서 채워요.
export default function ConfirmPage() {
  const ready = useRequireSubscriptions();
  return (
    <main className="flex-1">
      <PageHeader title="구독 확인" />
      {ready ? null : <Skeleton />}
    </main>
  );
}
