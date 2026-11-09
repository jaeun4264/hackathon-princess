"use client";
import type { CheckNote } from "@/lib/client/confirm";
import { amountLine, trialLine } from "@/lib/client/confirm";
import { todayString } from "@/lib/client/today";
import type { Subscription, Usage } from "@/lib/types";
import { NeedsCheckBadge, SourceBadge } from "./Badges";
import { UsageSegment } from "./UsageSegment";

/** S1 구독 카드: 서비스명·금액(연간이면 월 환산)·표기 이름·사용 정도. 확인이 필요하면 사유와 바로 고치는 버튼. */
export function SubscriptionCard({
  sub,
  note,
  onUsage,
  onEdit,
  onAccept,
}: {
  sub: Subscription;
  note: CheckNote | null;
  onUsage: (usage: Usage) => void;
  onEdit: () => void;
  onAccept: () => void;
}) {
  const amount = amountLine(sub);
  const trial = trialLine(sub, todayString());
  const showRaw = sub.raw_name !== sub.display_name;
  return (
    <article
      className={`rounded-[20px] bg-surface p-5 ${note ? "outline-2 -outline-offset-2 outline-warning-line" : ""}`}
      aria-label={`${sub.display_name} ${amount.main}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{sub.display_name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {showRaw ? <>결제 표기 {sub.raw_name}</> : sub.service_id || sub.user_confirmed ? sub.category : "서비스 확인 전"}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-base font-semibold">{amount.main}</p>
          {amount.sub ? <p className="num text-sm text-muted">{amount.sub}</p> : null}
        </div>
      </div>

      {trial ? (
        <div className="mt-3 rounded-[10px] bg-warning-bg px-4 py-3 text-sm text-warning" role="note">
          <p className="font-semibold">{trial.title}</p>
          <p className="mt-0.5">{trial.detail}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {note ? <NeedsCheckBadge /> : null}
        <SourceBadge source={sub.interpret_source} confirmed={sub.user_confirmed} />
        <button type="button" onClick={onEdit} className="ml-auto min-h-11 px-1 text-sm font-semibold underline underline-offset-4">
          고치기
        </button>
      </div>

      {note ? (
        <div className="mt-2 rounded-[10px] bg-warning-bg px-4 py-3 text-sm text-warning">
          <p>{note.reason}</p>
          {note.suggestion ? (
            <div className="mt-3">
              <p className="text-base text-ink">
                혹시 <span className="font-semibold">{note.suggestion.name}</span>인가요?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={onAccept} className="min-h-11 rounded-[10px] bg-primary font-semibold text-primary-fg active:scale-[0.98]">
                  맞아요
                </button>
                <button type="button" onClick={onEdit} className="min-h-11 rounded-[10px] border border-control bg-surface font-semibold text-ink active:scale-[0.98]">
                  아니에요
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={onEdit} className="mt-2 min-h-11 font-semibold text-ink underline underline-offset-4">
              {note.foreign ? "카드 청구액으로 고치기" : "서비스 고르기"}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-sm text-muted" id={`usage-${sub.id}`}>
          요즘 얼마나 쓰나요?
        </p>
        <UsageSegment value={sub.usage} onChange={onUsage} label={`${sub.display_name} 사용 정도`} />
      </div>
    </article>
  );
}
