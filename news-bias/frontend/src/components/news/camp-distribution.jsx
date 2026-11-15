import { Info } from "lucide-react";
import { campEntries, campLabel } from "@/lib/news";

// 진영별 인용 분포 막대: 정부·여당 | 제3정당 | 제1야당 (| 무소속)
// camps: { ruling, third, mainOpp, independent } 인용 건수. 실제 비율 그대로 (보정하지 않음)
// 이슈 화면과 '내 읽기 편향' 화면에서 같은 모양으로 씁니다.
export function CampDistributionBar({ camps, label = "진영별 인용 분포", height = "h-7" }) {
  const entries = campEntries(camps);
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">정당·정부 쪽 인용이 없습니다</span>
      </div>
    );
  }

  const shown = entries.filter((e) => e.count > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">인용 {total}건</span>
      </div>
      <div
        className={`flex w-full overflow-hidden rounded-md bg-muted ${height}`}
        role="img"
        aria-label={`${label}: ${shown.map((e) => `${e.label} ${e.count}건`).join(", ")}`}
      >
        {shown.map((e) => {
          const pct = (e.count / total) * 100;
          return (
            <div
              key={e.id}
              className={`flex items-center justify-center text-xs font-semibold tabular-nums ${
                e.id === "independent" ? "text-slate-700" : "text-white"
              }`}
              style={{ width: `${pct}%`, backgroundColor: e.color }}
              title={`${e.label} ${e.count}건 (${Math.round(pct)}%)`}
            >
              {pct >= 7 ? e.count : ""}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: e.color }} />
            {e.label}
            <span className="tabular-nums">
              {e.count}건 ({Math.round((e.count / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 수사·사법기관 인용 수: 정당이 아닌 국가기관이라 진영·기울기 계산에서 뺀 건수를 따로 알림
export function InstitutionNote({ count }) {
  if (!count) return null;
  return (
    <p className="text-xs text-muted-foreground">
      수사·사법기관(경찰·검찰·법원 등) 인용 {count}건은 정당이 아니어서 위 분포와 기울기 계산에서 뺐어요.
    </p>
  );
}

// 이슈 특성 안내: 한 정당의 행사·입장 발표가 중심인 이슈 (이슈를 거르지 않고 특성만 알림)
export function FocusPartyNotice({ party }) {
  if (!party) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2.5 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <strong>이슈 특성 안내:</strong> {party}의 행사·입장 발표가 중심인 이슈라 {party} 측 인용이 많이 집계됐어요. 반대
        측 반론이 얼마나 실렸는지 함께 확인해 보세요.
      </span>
    </p>
  );
}

// 사각지대 안내: 양대 진영 중 한쪽 인용이 거의 없을 때 (판정이 아니라 사실만)
// blindspot: "mainOpp" | "ruling" | null
export function BlindspotNotice({ blindspot }) {
  if (!blindspot) return null;
  const heard = blindspot === "mainOpp" ? "ruling" : "mainOpp";
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2.5 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        이 이슈의 기사들은 <strong>{campLabel(heard)}</strong> 측 말을 주로 전하고 있어요.{" "}
        <strong>{campLabel(blindspot)}</strong> 측 인용은 거의 없어요.
      </span>
    </p>
  );
}
