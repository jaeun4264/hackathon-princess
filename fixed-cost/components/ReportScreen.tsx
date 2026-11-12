"use client";
import * as api from "@/lib/api-client";
import { won } from "@/lib/client/confirm";
import { useRequireSubscriptions } from "@/lib/client/guards";
import { actedSavings, actionEvent, keepReasonEvent, pauseFor, splitSuggestions, type ActionChoice, type KeepReason } from "@/lib/client/report";
import { useAppStore } from "@/lib/client/store";
import { todayString } from "@/lib/client/today";
import type { Suggestion } from "@/lib/types";
import { ActionCheck } from "./ActionCheck";
import { AppBar } from "./AppBar";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { SuggestionCard } from "./SuggestionCard";
import { TabBar } from "./TabBar";

/** S5 절감 리포트 (/report): 제안별 절약액과 해지 방법, 실행 체크. 이 체크가 성공 지표(실제로 해지·변경한 사람 수)를 재요. */
export function ReportScreen() {
  const ready = useRequireSubscriptions();
  const subs = useAppStore((state) => state.subscriptions);
  const suggestions = useAppStore((state) => state.suggestions);
  const sessionId = useAppStore((state) => state.sessionId);
  const status = useAppStore((state) => state.analysisStatus);

  if (!ready) {
    return (
      <main className="flex-1">
        <AppBar />
        <Skeleton lines={4} />
        <TabBar />
      </main>
    );
  }

  const { setAction, addSuggestion } = useAppStore.getState();
  const { actionable, keep } = splitSuggestions(suggestions);
  const acted = actedSavings(suggestions);
  const nameOf = (entry: Suggestion) => subs.find((sub) => sub.id === entry.subscription_ids[0])?.display_name ?? "";

  function onAction(entry: Suggestion, choice: ActionChoice) {
    setAction(entry.id, choice);
    // 실패해도 화면은 그대로. api.events가 한 번 다시 시도하고 조용히 포기해요.
    void api.events(actionEvent(sessionId, entry, choice));
  }

  function onKeepReason(entry: Suggestion, reason: KeepReason) {
    setAction(entry.id, "kept", reason);
    void api.events(keepReasonEvent(sessionId, reason));
    if (reason === "maybe_later") {
      const pause = pauseFor(subs.find((sub) => sub.id === entry.subscription_ids[0]), todayString());
      if (pause && !suggestions.some((existing) => existing.id === pause.id)) addSuggestion(pause);
    }
  }

  return (
    <main className="flex flex-1 flex-col pb-24">
      <AppBar />
      <header className="px-4 pt-5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">절감 리포트</h1>
      </header>

      {status === "running" && suggestions.length === 0 ? (
        <Skeleton lines={3} label="제안을 만들고 있어요" />
      ) : actionable.length === 0 ? (
        <>
          <EmptyState title="지금은 줄일 게 없어요" description="새 구독을 시작하기 전에 학생 혜택이 있는지 먼저 찾아보세요." actionLabel="혜택 찾기" actionHref="/benefits" />
          {keep.length > 0 ? <div className="mx-4 mt-6 lg:max-w-[560px]"><KeepList keep={keep} nameOf={nameOf} /></div> : null}
        </>
      ) : (
        // 데스크톱: 왼쪽(340px)에 아낀 금액과 유지할 구독이 따라오고, 오른쪽에 줄일 수 있는 제안이 놓여요.
        <div className="mt-4 grid grid-cols-1 gap-6 px-4 lg:mt-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4 lg:sticky lg:top-6">
            {/* 실행한 절약액 (이 화면의 답) */}
            <section className="rounded-[20px] bg-surface p-5 lg:p-6" aria-labelledby="acted-title">
              <h2 id="acted-title" className="text-sm text-muted">해지·변경으로 아낀 금액</h2>
              <p className="num mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em]">월 {won(acted)}</p>
              <p className="num text-sm text-muted">
                {acted > 0 ? `1년이면 ${won(acted * 12)}` : "해지하거나 바꾼 제안에 체크하면 여기에 더해져요."}
              </p>
            </section>
            {keep.length > 0 ? <div className="hidden lg:block"><KeepList keep={keep} nameOf={nameOf} /></div> : null}
          </div>

          <section aria-labelledby="actionable-title" className="min-w-0">
            <h2 id="actionable-title" className="text-xl font-semibold">
              줄일 수 있는 것 <span className="num text-muted">{actionable.length}</span>
            </h2>
            <div className="mt-3 grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              {actionable.map((entry) => (
                <SuggestionCard key={entry.id} suggestion={entry} serviceName={nameOf(entry)}>
                  <ActionCheck
                    suggestion={entry}
                    title={nameOf(entry)}
                    onAction={(choice) => onAction(entry, choice)}
                    onKeepReason={(reason) => onKeepReason(entry, reason)}
                  />
                </SuggestionCard>
              ))}
            </div>
          </section>

          {/* 폰·태블릿은 유지할 구독이 맨 아래에 와요. */}
          {keep.length > 0 ? <div className="lg:hidden"><KeepList keep={keep} nameOf={nameOf} /></div> : null}
        </div>
      )}

      <TabBar />
    </main>
  );
}

function KeepList({ keep, nameOf }: { keep: Suggestion[]; nameOf: (entry: Suggestion) => string }) {
  return (
    <section className="rounded-[20px] bg-surface p-5" aria-label="유지해도 좋은 구독">
      <h2 className="text-base font-semibold">유지해도 좋은 구독</h2>
      <ul className="mt-2 space-y-2 text-sm text-muted">
        {keep.map((entry) => (
          <li key={entry.id}>
            <span className="font-medium text-ink">{nameOf(entry)}</span> · {entry.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
