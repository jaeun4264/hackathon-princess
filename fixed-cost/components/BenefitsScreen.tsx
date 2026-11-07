"use client";
import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api-client";
import { appCatalog } from "@/lib/client/app-catalog";
import { benefitsForService, myServiceIds, needsJudgement } from "@/lib/client/benefits";
import { useHydrated } from "@/lib/client/guards";
import { useAppStore } from "@/lib/client/store";
import { todayString } from "@/lib/client/today";
import type { UserProfile } from "@/lib/types";
import { AppBar } from "./AppBar";
import { BenefitCard } from "./BenefitCard";
import { ErrorBanner } from "./ErrorBanner";
import { ProfileCard } from "./ProfileCard";
import { Skeleton } from "./Skeleton";
import { TabBar } from "./TabBar";

const chipClass = (active: boolean) =>
  `min-h-11 rounded-[10px] px-3 text-sm transition-colors ${active ? "bg-accent-soft font-semibold text-accent-ink" : "bg-surface hover:bg-raised"}`;

/** S4 혜택 찾기 (/benefits): 서비스를 고르면 학생 할인·학교 라이선스와 자격 판정, 근거, 출처를 보여 줘요. */
export function BenefitsScreen() {
  const hydrated = useHydrated();
  const catalog = useMemo(() => appCatalog(), []);
  const subs = useAppStore((state) => state.subscriptions);
  const profile = useAppStore((state) => state.profile);
  const results = useAppStore((state) => state.benefitResults);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [degraded, setDegraded] = useState(false);

  const mine = myServiceIds(subs, catalog);
  // 처음에는 혜택이 있는 내 구독 서비스를 골라 둬요.
  const selected = picked ?? mine.find((id) => benefitsForService(id, catalog, profile).length > 0) ?? null;
  const benefits = selected ? benefitsForService(selected, catalog, profile) : [];

  async function judge(targets: string[], user: UserProfile) {
    if (targets.length === 0) return;
    setLoading((prev) => new Set([...prev, ...targets]));
    const response = await api.benefits(user, targets.map((id) => ({ kind: "benefit" as const, id })), { catalog, today: todayString() });
    const store = useAppStore.getState();
    store.mergeBenefitResults(response.results);
    store.rebuildSuggestions(todayString(), catalog);
    setDegraded((prev) => prev || response.degraded);
    setLoading((prev) => new Set([...prev].filter((id) => !targets.includes(id))));
  }

  // 서비스를 고르면 아직 판정하지 않은 혜택만 판정해요 (이미 판정한 건 다시 묻지 않음).
  const pending = profile ? needsJudgement(benefits, results).map((benefit) => benefit.id).filter((id) => !loading.has(id)) : [];
  const pendingKey = pending.join(",");
  useEffect(() => {
    if (!profile || !pendingKey) return;
    const user = profile;
    void Promise.resolve().then(() => judge(pendingKey.split(","), user));
    // judge는 렌더마다 새로 만들어지지만 대상(pendingKey)이 바뀔 때만 실행해요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, profile]);

  function onAnswer(benefitId: string, field: "school_email" | "status" | "school", value: string) {
    if (!profile) return;
    const next: UserProfile =
      field === "school_email" ? { ...profile, school_email: value === "yes" } : field === "status" ? { ...profile, status: value as UserProfile["status"] } : { ...profile, school: value };
    useAppStore.getState().setProfile(next);
    void judge([benefitId], next); // 답한 카드만 다시 판정
  }

  const needle = query.trim().toLowerCase();
  // 검색어가 없으면 "내 구독"에 이미 있는 서비스는 빼고 보여 줘요.
  const matches = catalog.services.filter((service) =>
    needle ? [service.name, ...service.aliases].some((text) => text.toLowerCase().includes(needle)) : !mine.includes(service.id));
  const selectedName = catalog.services.find((service) => service.id === selected)?.name;

  return (
    <main className="flex flex-1 flex-col pb-24">
      <AppBar />
      <header className="px-4 pt-5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">혜택 찾기</h1>
        <p className="mt-2 text-base text-muted">새 구독을 시작하기 전에 학생 할인이나 학교 라이선스가 있는지 먼저 확인해요.</p>
      </header>

      {!hydrated ? (
        <Skeleton lines={3} />
      ) : (
        <div className="mt-5 space-y-4 px-4">
          {!profile ? <ProfileCard profile={profile} onChange={(next) => useAppStore.getState().setProfile(next)} /> : null}

          <section aria-labelledby="search-title">
            <h2 id="search-title" className="sr-only">서비스 고르기</h2>
            <label htmlFor="benefit-search" className="mb-2 block text-sm font-medium">서비스 찾기</label>
            <input
              id="benefit-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 노션, 피그마"
              autoComplete="off"
              className="h-12 w-full rounded-[10px] border border-control bg-surface px-3 text-base outline-none focus:border-accent"
            />
            {mine.length > 0 && !needle ? (
              <div className="mt-3">
                <p className="mb-2 text-sm text-muted">내 구독</p>
                <div className="flex flex-wrap gap-2">
                  {mine.map((id) => (
                    <button key={id} type="button" aria-pressed={selected === id} onClick={() => setPicked(id)} className={chipClass(selected === id)}>
                      {catalog.services.find((service) => service.id === id)?.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3">
              <p className="mb-2 text-sm text-muted">{needle ? "찾은 서비스" : mine.length > 0 ? "다른 서비스" : "모든 서비스"}</p>
              <div className="flex flex-wrap gap-2">
                {matches.map((service) => (
                  <button key={service.id} type="button" aria-pressed={selected === service.id} onClick={() => setPicked(service.id)} className={chipClass(selected === service.id)}>
                    {service.name}
                  </button>
                ))}
                {matches.length === 0 ? <p className="py-2 text-sm text-muted">등록된 서비스에 없어요. 다른 이름으로 찾아보세요.</p> : null}
              </div>
            </div>
          </section>

          {degraded ? <ErrorBanner>일부는 AI 확인을 못 했어요. 공식 페이지에서 조건을 확인해 주세요.</ErrorBanner> : null}

          {selected ? (
            <section aria-labelledby="benefit-list-title" className="space-y-4 pt-2">
              <h2 id="benefit-list-title" className="text-xl font-semibold">
                {selectedName} 혜택 <span className="num text-muted">{benefits.length}</span>
              </h2>
              {benefits.length === 0 ? (
                <p className="rounded-[20px] bg-surface p-5 text-base text-muted">이 서비스는 아직 등록된 혜택이 없어요.</p>
              ) : (
                benefits.map((benefit) => (
                  <BenefitCard
                    key={benefit.id}
                    benefit={benefit}
                    result={results.find((entry) => entry.kind === "benefit" && entry.id === benefit.id)}
                    loading={loading.has(benefit.id) || (!profile ? false : !results.some((entry) => entry.id === benefit.id))}
                    onAnswer={(field, value) => onAnswer(benefit.id, field, value)}
                  />
                ))
              )}
              {!profile && benefits.length > 0 ? <p className="text-sm text-muted">학교와 재학 상태를 고르면 자격을 확인해 드려요.</p> : null}
              {/* 묶음 상품 비교(F8)는 묶음 카탈로그(bundles.json)가 채워지면 이 아래에 들어가요. 절약액이 있을 때만 보여 줘요. */}
            </section>
          ) : (
            <p className="rounded-[20px] bg-surface p-5 text-base text-muted">위에서 서비스를 고르면 받을 수 있는 혜택을 보여 드려요.</p>
          )}
        </div>
      )}

      <TabBar />
    </main>
  );
}
