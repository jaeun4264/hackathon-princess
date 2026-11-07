"use client";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/Skeleton";
import { useRequireUsage } from "@/lib/client/guards";

// S2 홈 — F4에서 채워요.
export default function HomePage() {
  const ready = useRequireUsage();
  return (
    <main className="flex-1">
      <PageHeader title="홈" />
      {ready ? null : <Skeleton />}
    </main>
  );
}
