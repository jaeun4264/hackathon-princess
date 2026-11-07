"use client";
import { PageHeader } from "@/components/PageHeader";
import { TabBar } from "@/components/TabBar";
import { Skeleton } from "@/components/Skeleton";
import { useRequireSubscriptions } from "@/lib/client/guards";

// S5 절감 리포트 — F7에서 채워요.
export default function ReportPage() {
  const ready = useRequireSubscriptions();
  return (
    <main className="flex-1">
      <PageHeader title="절감 리포트" />
      <TabBar />
      {ready ? null : <Skeleton />}
    </main>
  );
}
