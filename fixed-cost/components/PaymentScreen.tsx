"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { loadCatalog } from "@/lib/catalog";
import { acceptSuggestion, applyEdit, checkNote, formatForeign, type EditInput } from "@/lib/client/confirm";
import { useHydrated } from "@/lib/client/guards";
import { decodeSubscriptionId, evidencePayments, paymentAmount, reasonText, statementLine } from "@/lib/client/payment";
import { foreignOrigin } from "@/lib/client/pipeline";
import { useAppStore } from "@/lib/client/store";
import { AppBar } from "./AppBar";
import { confidenceLevel, NeedsCheckBadge, SourceBadge } from "./Badges";
import { EditSubscriptionSheet } from "./EditSubscriptionSheet";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

function BackLink() {
  return (
    <Link href="/home" className="flex min-h-11 items-center gap-1 px-2 text-sm font-semibold">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M10 3L5 8l5 5" />
      </svg>
      홈
    </Link>
  );
}

/** S3 결제 상세 (/payment/[id]): "이 결제가 뭐지?" 표기 → 해석 → 근거 → 이어진 결제. 홈을 거치지 않고 와도 읽혀요. */
export function PaymentScreen() {
  const params = useParams<{ subscriptionId: string }>();
  const id = decodeSubscriptionId(params?.subscriptionId);
  const hydrated = useHydrated();
  const subs = useAppStore((state) => state.subscriptions);
  const transactions = useAppStore((state) => state.transactions);
  const reasons = useAppStore((state) => state.interpretReasons);
  const suggested = useAppStore((state) => state.suggestedServiceIds);
  const services = useMemo(() => loadCatalog().services, []);
  const [editing, setEditing] = useState(false);

  if (!hydrated) {
    return (
      <main className="flex-1">
        <AppBar />
        <Skeleton lines={3} />
      </main>
    );
  }

  if (subs.length === 0) {
    return (
      <main className="flex-1">
        <AppBar />
        <EmptyState title="먼저 결제 내역을 넣어 주세요" description="결제 내역을 넣으면 어떤 서비스의 결제인지 알려 드려요." actionLabel="결제 내역 넣기" actionHref="/" />
      </main>
    );
  }

  const sub = subs.find((entry) => entry.id === id);
  if (!sub) {
    return (
      <main className="flex-1">
        <AppBar action={<BackLink />} />
        <EmptyState title="이 결제를 찾지 못했어요" description="목록에서 빠졌거나 다른 기기에서 연 주소예요." actionLabel="홈으로 가기" actionHref="/home" />
      </main>
    );
  }

  const { updateSubscription, removeSubscription } = useAppStore.getState();
  const payments = evidencePayments(sub, transactions);
  const note = checkNote(sub, { suggestedServiceId: suggested[sub.id] ?? null, services, transactions });
  const origin = foreignOrigin(sub, transactions);
  const known = sub.service_id !== null && !sub.needs_check;

  function onSave(input: EditInput) {
    updateSubscription(sub!.id, applyEdit(sub!, input, services));
    setEditing(false);
  }

  return (
    <main className="flex flex-1 flex-col pb-10">
      <AppBar action={<BackLink />} />

      {/* 1. 표기 그대로 */}
      <section className="mx-4 mt-3 rounded-[20px] bg-surface p-5" aria-labelledby="statement-title">
        <h2 id="statement-title" className="text-sm text-muted">명세서·영수증에 찍힌 그대로</h2>
        <p className="num mt-1 text-xl font-semibold">{statementLine(sub, transactions)}</p>
      </section>

      {/* 2. 해석 + 근거 */}
      <section className="mx-4 mt-4 rounded-[20px] bg-surface p-5" aria-labelledby="service-title">
        <p className="text-sm text-muted">이 결제는</p>
        <h1 id="service-title" className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
          {known ? sub.display_name : "아직 확인하지 못한 결제예요"}
        </h1>
        {known ? <p className="mt-1 text-base text-muted">{sub.category}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sub.needs_check ? <NeedsCheckBadge /> : null}
          <SourceBadge source={sub.interpret_source} confirmed={sub.user_confirmed} />
          {(sub.interpret_source === "ai" || sub.interpret_source === "catalog") && !sub.user_confirmed ? (
            <span className="text-sm text-muted">확신도 {confidenceLevel(sub.confidence)}</span>
          ) : null}
        </div>

        <div className="mt-4 rounded-[10px] bg-ground px-4 py-3">
          <p className="text-sm text-muted">근거</p>
          <p className="mt-0.5 text-base">{reasonText(sub, reasons[sub.id])}</p>
          {/* 확인 필요 사유는 새 정보가 있을 때만 (외화 환산이거나 AI 근거가 없을 때) */}
          {note && (note.foreign || !reasons[sub.id]) ? <p className="mt-2 text-sm text-warning">{note.reason}</p> : null}
        </div>

        {note?.suggestion ? (
          <div className="mt-4">
            <p className="text-base">
              혹시 <span className="font-semibold">{note.suggestion.name}</span>인가요?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => updateSubscription(sub.id, acceptSuggestion(sub, note.suggestion!))} className="min-h-12 rounded-[10px] bg-primary font-semibold text-primary-fg active:scale-[0.98]">
                맞아요
              </button>
              <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-[10px] border border-control bg-surface font-semibold active:scale-[0.98]">
                아니에요
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-4 min-h-12 w-full rounded-[10px] border border-control bg-surface text-base font-semibold active:scale-[0.98]">
            {known ? "틀렸어요" : "서비스 고르기"}
          </button>
        )}
        <p className="mt-2 text-center text-sm text-muted">고친 내용은 이 기기에만 저장돼요.</p>
      </section>

      {/* 3. 이어진 결제 */}
      <section className="mx-4 mt-4 rounded-[20px] bg-surface px-5 pb-2 pt-5" aria-labelledby="payments-title">
        <h2 id="payments-title" className="text-base font-semibold">
          이 구독으로 이어진 결제 <span className="num text-muted">{payments.length}건</span>
        </h2>
        {payments.length > 0 ? (
          <ul className="mt-2 divide-y divide-rule">
            {payments.map((payment) => {
              const amount = paymentAmount(payment);
              return (
                <li key={payment.id} className="flex min-h-12 items-center gap-3 py-2">
                  <span className="num flex-1 text-base">{payment.date.replaceAll("-", ".")}</span>
                  <span className="text-right">
                    <span className="num block text-base">{amount.main}</span>
                    {amount.foreign ? <span className="num block text-sm text-muted">{amount.foreign}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pb-3 pt-2 text-sm text-muted">직접 추가한 구독이라 연결된 결제 내역이 없어요.</p>
        )}
      </section>

      <EditSubscriptionSheet
        sub={editing ? sub : null}
        foreign={origin ? formatForeign(origin.currency, origin.amount) : null}
        onClose={() => setEditing(false)}
        onSave={onSave}
        onDelete={() => {
          removeSubscription(sub.id);
          setEditing(false);
        }}
      />
    </main>
  );
}
