"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { loadCatalog } from "@/lib/catalog";
import { acceptSuggestion, applyEdit, checkNote, nextBlocker, won, type EditInput } from "@/lib/client/confirm";
import { useRequireSubscriptions } from "@/lib/client/guards";
import { createManualSubscription, foreignOrigin, type ManualInput } from "@/lib/client/pipeline";
import { formatForeign } from "@/lib/client/confirm";
import { useAppStore } from "@/lib/client/store";
import { AppBar } from "./AppBar";
import { EditSubscriptionSheet } from "./EditSubscriptionSheet";
import { ManualAddSheet } from "./ManualAddSheet";
import { ProfileCard } from "./ProfileCard";
import { Skeleton } from "./Skeleton";
import { SubscriptionCard } from "./SubscriptionCard";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** S1 구독 확인 (/confirm): AI가 찾은 구독을 고치고, 모든 구독에 사용 정도를 한 번씩 탭하게 해요. */
export function ConfirmScreen() {
  const router = useRouter();
  const ready = useRequireSubscriptions();
  const subs = useAppStore((state) => state.subscriptions);
  const profile = useAppStore((state) => state.profile);
  const transactions = useAppStore((state) => state.transactions);
  const suggested = useAppStore((state) => state.suggestedServiceIds);
  const { setUsage, updateSubscription, removeSubscription, setProfile, addSubscription, confirmAll, rebuildSuggestions } = useAppStore.getState();
  const services = useMemo(() => loadCatalog().services, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!ready) {
    return (
      <main className="flex-1">
        <AppBar />
        <Skeleton lines={4} />
      </main>
    );
  }

  const notes = new Map(subs.map((sub) => [sub.id, checkNote(sub, { suggestedServiceId: suggested[sub.id] ?? null, services, transactions })]));
  const checkCount = [...notes.values()].filter(Boolean).length;
  const blocker = nextBlocker(subs, profile);
  const editing = subs.find((sub) => sub.id === editingId) ?? null;
  const editingForeign = editing ? foreignOrigin(editing, transactions) : null;
  const monthlyTotal = subs.reduce((sum, sub) => sum + sub.monthly_amount, 0);

  function onSave(input: EditInput) {
    if (!editing) return;
    updateSubscription(editing.id, applyEdit(editing, input, services));
    setEditingId(null);
  }

  function onDelete() {
    if (!editing) return;
    removeSubscription(editing.id);
    setEditingId(null);
  }

  function onAdd(input: ManualInput) {
    addSubscription(createManualSubscription(input, loadCatalog()));
    setAdding(false);
  }

  function onNext() {
    if (blocker || !confirmAll()) return;
    // 제안은 규칙으로 바로 만들어요. 혜택 판정(T2)·제안 문장(T3) 연결은 F4에서 이어 붙여요.
    rebuildSuggestions(today());
    router.push("/home");
  }

  return (
    <main className="flex flex-1 flex-col pb-36">
      <AppBar />

      <header className="px-4 pt-5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">구독 확인</h1>
        <p className="mt-2 text-base text-muted">
          <span className="num font-semibold text-ink">{subs.length}개</span>, 매달{" "}
          <span className="num font-semibold text-ink">{won(monthlyTotal)}</span>을 찾았어요.
          {checkCount > 0 ? <> 그중 <span className="num font-semibold text-warning">{checkCount}개</span>는 확인이 필요해요.</> : null}
        </p>
      </header>

      <div className="mt-5 space-y-4 px-4">
        <ProfileCard profile={profile} onChange={setProfile} />

        <h2 className="pt-2 text-xl font-semibold">구독마다 사용 정도를 골라 주세요</h2>
        {subs.map((sub) => (
          <SubscriptionCard
            key={sub.id}
            sub={sub}
            note={notes.get(sub.id) ?? null}
            onUsage={(usage) => setUsage(sub.id, usage)}
            onEdit={() => setEditingId(sub.id)}
            onAccept={() => {
              const service = notes.get(sub.id)?.suggestion;
              if (service) updateSubscription(sub.id, acceptSuggestion(sub, service));
            }}
          />
        ))}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-14 w-full items-center justify-center rounded-[20px] border border-dashed border-control text-base font-semibold text-muted hover:bg-surface"
        >
          빠진 구독 직접 추가
        </button>
      </div>

      {/* 하단 고정 버튼. 모든 구독에 사용 정도가 있어야 활성화. */}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[480px] bg-ground px-4 shadow-[0_-1px_0_var(--color-line)] pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <p className="mb-2 min-h-5 text-center text-sm text-muted" aria-live="polite">
          {blocker ?? "다 골랐어요. 아낄 수 있는 금액을 계산할게요."}
        </p>
        <button
          type="button"
          onClick={onNext}
          disabled={blocker !== null}
          className="min-h-13 w-full rounded-[10px] bg-primary text-base font-semibold text-primary-fg transition-transform active:scale-[0.98] disabled:bg-control disabled:text-muted"
        >
          다음
        </button>
      </div>

      <EditSubscriptionSheet
        sub={editing}
        foreign={editingForeign ? formatForeign(editingForeign.currency, editingForeign.amount) : null}
        onClose={() => setEditingId(null)}
        onSave={onSave}
        onDelete={onDelete}
      />
      <ManualAddSheet open={adding} onClose={() => setAdding(false)} onAdd={onAdd} />
    </main>
  );
}
