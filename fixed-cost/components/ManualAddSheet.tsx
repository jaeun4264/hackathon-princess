"use client";
import { useMemo, useState } from "react";
import { loadCatalog } from "@/lib/catalog";
import type { Interval } from "@/lib/types";
import type { ManualInput } from "@/lib/client/pipeline";
import { BottomSheet } from "./BottomSheet";

const inputClass = "h-12 w-full rounded-[10px] border border-control bg-surface px-3 text-base outline-none focus:border-accent";
const labelClass = "mb-2 block text-sm font-medium";

/** 영수증이 없는 구독(카카오톡 알림 등)을 직접 추가. 서비스를 골라 채우거나 이름·금액·주기를 직접 넣어요. */
export function ManualAddSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (input: ManualInput) => void }) {
  const services = useMemo(() => loadCatalog().services, []);
  const [query, setQuery] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<Interval>("monthly");
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? services.filter((service) => [service.name, ...service.aliases].some((text) => text.toLowerCase().includes(needle)))
    : services;

  function pick(id: string) {
    const service = services.find((entry) => entry.id === id);
    if (!service) return;
    setServiceId(id);
    setName(service.name);
    setError(null);
    // 카탈로그에 확인된 가격이 하나뿐일 때만 미리 채워요. 모르는 가격은 지어내지 않아요.
    const priced = service.plans.filter((plan) => plan.price !== null);
    if (priced.length === 1) {
      setAmount(String(priced[0].price));
      setPeriod(priced[0].interval);
    } else {
      setAmount("");
    }
  }

  function close() {
    setQuery("");
    setServiceId(null);
    setName("");
    setAmount("");
    setPeriod("monthly");
    setError(null);
    onClose();
  }

  function submit() {
    const won = Number(amount.replace(/[,\s원₩]/g, ""));
    if (!name.trim()) return setError("서비스 이름을 넣어 주세요.");
    if (!Number.isSafeInteger(won) || won <= 0) return setError("금액은 원 단위 숫자로 넣어 주세요. 예: 13500");
    onAdd({ name: name.trim(), amount: won, interval: period, serviceId });
    close();
  }

  return (
    <BottomSheet open={open} onClose={close} title="구독 직접 추가">
      <div className="space-y-4">
        <div>
          <label htmlFor="manual-search" className={labelClass}>서비스 찾기</label>
          <input id="manual-search" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 넷플릭스" autoComplete="off" />
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="등록된 서비스">
            {matches.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => pick(service.id)}
                aria-pressed={serviceId === service.id}
                className={`min-h-11 rounded-[10px] px-3 text-sm transition-colors ${serviceId === service.id ? "bg-accent-soft font-semibold text-accent-ink" : "bg-ground hover:bg-rule"}`}
              >
                {service.name}
              </button>
            ))}
            {matches.length === 0 ? <p className="py-2 text-sm text-muted">등록된 서비스가 아니면 아래에 직접 넣어 주세요.</p> : null}
          </div>
        </div>

        <div>
          <label htmlFor="manual-name" className={labelClass}>이름</label>
          <input id="manual-name" className={inputClass} value={name} onChange={(event) => { setName(event.target.value); setServiceId(null); }} placeholder="예: 유튜브 프리미엄" />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor="manual-amount" className={labelClass}>금액 (원)</label>
            <input id="manual-amount" className={`${inputClass} num`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="13500" />
          </div>
          <fieldset>
            <legend className={labelClass}>주기</legend>
            <div className="flex h-12 rounded-[10px] bg-ground p-1">
              {(["monthly", "yearly"] as const).map((value) => (
                <label key={value} className={`flex cursor-pointer items-center rounded-[8px] px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${period === value ? "bg-surface font-semibold" : "text-muted"}`}>
                  <input type="radio" name="manual-interval" value={value} checked={period === value} onChange={() => setPeriod(value)} className="sr-only" />
                  {value === "monthly" ? "매달" : "매년"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {error ? <p role="alert" className="text-sm font-medium text-negative">{error}</p> : null}

        <button type="button" onClick={submit} className="min-h-12 w-full rounded-[10px] bg-primary text-base font-semibold text-primary-fg active:scale-[0.98]">
          추가하고 확인하기
        </button>
      </div>
    </BottomSheet>
  );
}
