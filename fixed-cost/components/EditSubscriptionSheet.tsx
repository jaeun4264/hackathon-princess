"use client";
import { useMemo, useState } from "react";
import { loadCatalog } from "@/lib/catalog";
import type { EditInput } from "@/lib/client/confirm";
import type { Interval, Subscription } from "@/lib/types";
import { BottomSheet } from "./BottomSheet";

const inputClass = "h-12 w-full rounded-[10px] border border-control bg-surface px-3 text-base outline-none focus:border-accent";
const labelClass = "mb-2 block text-sm font-medium";

/** 구독 고치기: 서비스 고르기(카탈로그), 이름·금액·주기, 삭제("이건 구독이 아니에요"). 브라우저에만 저장돼요. */
export function EditSubscriptionSheet({
  sub,
  foreign,
  onClose,
  onSave,
  onDelete,
}: {
  sub: Subscription | null;
  foreign: string | null;
  onClose: () => void;
  onSave: (input: EditInput) => void;
  onDelete: () => void;
}) {
  return (
    <BottomSheet open={sub !== null} onClose={onClose} title="구독 고치기">
      {/* 열 때마다 새로 그려서 이전 입력이 남지 않게 해요 */}
      {sub ? <EditForm key={sub.id} sub={sub} foreign={foreign} onSave={onSave} onDelete={onDelete} /> : null}
    </BottomSheet>
  );
}

function EditForm({ sub, foreign, onSave, onDelete }: { sub: Subscription; foreign: string | null; onSave: (input: EditInput) => void; onDelete: () => void }) {
  const services = useMemo(() => loadCatalog().services, []);
  const [serviceId, setServiceId] = useState<string | null>(sub.service_id);
  const [name, setName] = useState(sub.display_name);
  const [amount, setAmount] = useState(String(sub.amount));
  const [period, setPeriod] = useState<Interval>(sub.interval);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle ? services.filter((service) => [service.name, ...service.aliases].some((text) => text.toLowerCase().includes(needle))) : services;

  function pick(id: string) {
    const service = services.find((entry) => entry.id === id);
    if (!service) return;
    setServiceId(id);
    setName(service.name);
  }

  function save() {
    const won = Number(amount.replace(/[,\s원₩]/g, ""));
    if (!Number.isSafeInteger(won) || won <= 0) return setError("금액은 원 단위 숫자로 넣어 주세요. 예: 13500");
    if (!name.trim()) return setError("이름을 넣어 주세요.");
    onSave({ name: name.trim(), amount: won, interval: period, serviceId });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">결제 표기: {sub.raw_name}{foreign ? ` · 영수증 금액 ${foreign}` : ""}</p>

      <div>
        <label htmlFor="edit-search" className={labelClass}>어떤 서비스인가요?</label>
        <input id="edit-search" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="서비스 찾기" autoComplete="off" />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="등록된 서비스">
          {matches.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => pick(service.id)}
              aria-pressed={serviceId === service.id}
              className={`min-h-11 rounded-[10px] px-3 text-sm ${serviceId === service.id ? "bg-accent-soft font-semibold text-accent-ink" : "bg-ground hover:bg-rule"}`}
            >
              {service.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setServiceId(null)}
            aria-pressed={serviceId === null}
            className={`min-h-11 rounded-[10px] px-3 text-sm ${serviceId === null ? "bg-accent-soft font-semibold text-accent-ink" : "bg-ground hover:bg-rule"}`}
          >
            목록에 없어요
          </button>
        </div>
      </div>

      {serviceId === null ? (
        <div>
          <label htmlFor="edit-name" className={labelClass}>이름</label>
          <input id="edit-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label htmlFor="edit-amount" className={labelClass}>{foreign ? "카드 청구액 (원)" : "금액 (원)"}</label>
          <input id="edit-amount" className={`${inputClass} num`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" />
        </div>
        <fieldset>
          <legend className={labelClass}>주기</legend>
          <div className="flex h-12 rounded-[10px] bg-ground p-1">
            {(["monthly", "yearly"] as const).map((value) => (
              <label key={value} className={`flex cursor-pointer items-center rounded-[8px] px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${period === value ? "bg-surface font-semibold" : "text-muted"}`}>
                <input type="radio" name="edit-interval" value={value} checked={period === value} onChange={() => setPeriod(value)} className="sr-only" />
                {value === "monthly" ? "매달" : "매년"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {error ? <p role="alert" className="text-sm font-medium text-negative">{error}</p> : null}

      <button type="button" onClick={save} className="min-h-12 w-full rounded-[10px] bg-primary text-base font-semibold text-primary-fg active:scale-[0.98]">
        저장하기
      </button>
      <p className="text-center text-sm text-muted">고친 내용은 이 기기에만 저장돼요.</p>

      <button type="button" onClick={onDelete} className="mx-auto block min-h-11 px-3 text-sm font-semibold text-negative underline underline-offset-4">
        이건 구독이 아니에요 (목록에서 빼기)
      </button>
    </div>
  );
}
