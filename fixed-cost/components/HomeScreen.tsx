"use client";
import Link from "next/link";
import { useEffect } from "react";
import * as api from "@/lib/api-client";
import { won } from "@/lib/client/confirm";
import { foundCount, rankedSuggestions, savingsTotal, unconfirmedSubscriptions } from "@/lib/client/derive";
import { useRequireUsage } from "@/lib/client/guards";
import { runAnalysis } from "@/lib/client/pipeline";
import { useAppStore } from "@/lib/client/store";
import { todayString } from "@/lib/client/today";
import { summarize } from "@/lib/rules";
import type { Subscription } from "@/lib/types";
import { AppBar } from "./AppBar";
import { ErrorBanner } from "./ErrorBanner";
import { Skeleton } from "./Skeleton";
import { SuggestionCard } from "./SuggestionCard";
import { TabBar } from "./TabBar";
import { UsageBar } from "./UsageBar";
import { UsageChip } from "./UsageChip";

function safeSummary(subs: Subscription[]) {
  try {
    return summarize(subs);
  } catch {
    // 규칙이 거부하면(사용 정도 누락 등) 직접 더하지 않고 0으로 두고 가드가 S1로 보내요.
    return { total_monthly: 0, often_monthly: 0, sometimes_monthly: 0, rarely_monthly: 0 };
  }
}

/** S2 홈 (/home): 이번 달 정리를 한눈에. 합계는 그 합계를 설명하는 카드 안에 둬요. */
export function HomeScreen() {
  const ready = useRequireUsage();
  const subs = useAppStore((state) => state.subscriptions);
  const suggestions = useAppStore((state) => state.suggestions);
  const benefitResults = useAppStore((state) => state.benefitResults);
  const status = useAppStore((state) => state.analysisStatus);
  const degraded = useAppStore((state) => state.analysisDegraded);
  const discoverySent = useAppStore((state) => state.discoverySent);
  const sessionId = useAppStore((state) => state.sessionId);

  // 새로 고침 등으로 분석 결과가 없으면 다시 시작해요.
  useEffect(() => {
    if (ready && status === "idle" && suggestions.length === 0) void runAnalysis({ today: todayString() });
  }, [ready, status, suggestions.length]);

  // 홈에 처음 들어왔을 때 discovery 집계를 한 번만 보내요 (서비스 이름·금액은 보내지 않아요).
  useEffect(() => {
    if (!ready || discoverySent || status === "running") return;
    useAppStore.getState().markDiscoverySent();
    void api.events({ session_id: sessionId, kind: "discovery", payload: { found_count: foundCount(subs, benefitResults) } });
  }, [ready, discoverySent, status, sessionId, subs, benefitResults]);

  if (!ready) {
    return (
      <main className="flex-1">
        <AppBar />
        <Skeleton lines={4} />
      </main>
    );
  }

  const summary = safeSummary(subs);
  const savings = savingsTotal(suggestions);
  const preview = rankedSuggestions(suggestions).filter((entry) => entry.saving_monthly > 0).slice(0, 2);
  const rarely = subs.filter((sub) => sub.usage === "rarely");
  const excluded = unconfirmedSubscriptions(subs).filter((sub) => sub.usage === "rarely");
  const nameOf = (id: string) => subs.find((sub) => sub.id === id)?.display_name ?? "";
  const computing = status === "running" && suggestions.length === 0;

  return (
    <main className="flex flex-1 flex-col pb-24">
      <AppBar />

      <header className="px-4 pt-5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">이번 달 구독</h1>
        <p className="mt-2 text-base text-muted">
          {rarely.length > 0 ? (
            <>
              거의 안 쓰는 구독 <span className="num font-semibold text-ink">{rarely.length}개</span>에 매달{" "}
              <span className="num font-semibold text-rarely-ink">{won(summary.rarely_monthly)}</span>이 나가고 있어요.
            </>
          ) : (
            <>거의 안 쓰는 구독은 없어요. 학생 혜택으로 더 아낄 수 있는지 볼게요.</>
          )}
        </p>
      </header>

      {degraded ? (
        <div className="mx-4 mt-3">
          <ErrorBanner>일부는 AI 확인을 못 했어요. 금액은 규칙으로 계산했어요.</ErrorBanner>
        </div>
      ) : null}

      <div className="mt-5 space-y-4 px-4">
        {/* 1. 아낄 수 있는 금액 + 그 근거(제안 미리보기) */}
        <section className="rounded-[20px] bg-surface p-5" aria-labelledby="savings-title">
          <h2 id="savings-title" className="text-sm text-muted">아낄 수 있는 금액</h2>
          {computing ? (
            <Skeleton lines={2} label="아낄 수 있는 금액을 계산하고 있어요" />
          ) : (
            <>
              <p className="mt-1">
                <span className="num text-[32px] font-semibold leading-tight tracking-[-0.02em]">월 {won(savings.monthly)}</span>
              </p>
              <p className="num text-sm text-muted">1년이면 {won(savings.yearly)}</p>
              {preview.length > 0 ? (
                <div className="mt-3 divide-y divide-rule border-t border-rule">
                  {preview.map((entry) => (
                    <SuggestionCard key={entry.id} suggestion={entry} serviceName={nameOf(entry.subscription_ids[0])} compact />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">지금은 줄일 게 없어요. 새 구독 전에 혜택 찾기를 써 보세요.</p>
              )}
              {excluded.length > 0 ? (
                <p className="mt-2 rounded-[10px] bg-warning-bg px-3 py-2 text-sm text-warning">
                  서비스를 확인하지 않은 구독 <span className="num">{excluded.length}개</span>({excluded.map((sub) => sub.display_name).join(", ")})는 제안에서 빠졌어요.{" "}
                  <Link href="/confirm" className="font-semibold underline underline-offset-4">확인하러 가기</Link>
                </p>
              ) : null}
              <Link href="/report" className="mt-3 flex min-h-12 items-center justify-center rounded-[10px] bg-primary text-base font-semibold text-primary-fg active:scale-[0.98]">
                리포트에서 모두 보기
              </Link>
            </>
          )}
        </section>

        {/* 2. 이번 달 고정비 합계 + 사용 정도별 막대 */}
        <section className="rounded-[20px] bg-surface p-5" aria-labelledby="total-title">
          <h2 id="total-title" className="text-sm text-muted">이번 달 고정비 합계</h2>
          <p className="num mt-1 text-2xl font-semibold">{won(summary.total_monthly)}</p>
          <div className="mt-4">
            <UsageBar summary={summary} />
          </div>
          {summary.rarely_monthly > 0 ? (
            <p className="mt-4 rounded-[10px] bg-rarely-bg px-3 py-2 text-sm text-rarely-ink">
              거의 안 쓰는 구독에 1년 동안 나가는 돈 <span className="num font-semibold">{won(summary.rarely_monthly * 12)}</span>
            </p>
          ) : null}
        </section>

        {/* 3. 구독 목록 → S3 결제 상세 */}
        <section className="rounded-[20px] bg-surface px-5 pb-2 pt-5" aria-labelledby="list-title">
          <h2 id="list-title" className="text-base font-semibold">내 구독 <span className="num text-muted">{subs.length}</span></h2>
          <ul className="mt-2 divide-y divide-rule">
            {subs.map((sub) => (
              <li key={sub.id}>
                <Link href={`/payment/${encodeURIComponent(sub.id)}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-raised">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base">{sub.display_name}</span>
                    {sub.trial ? <span className="block text-sm text-warning">무료 체험 · {sub.trial.end.slice(5).replace("-", "/")}부터 유료</span>
                      : sub.needs_check ? <span className="block text-sm text-warning">확인 필요</span> : null}
                  </span>
                  {sub.usage ? <UsageChip usage={sub.usage} /> : null}
                  <span className="num w-[88px] text-right text-base">{won(sub.monthly_amount)}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted" aria-hidden="true">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <TabBar />
    </main>
  );
}
