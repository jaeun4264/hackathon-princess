import { chartEntries, sourceColor, sourceTypes } from "@/lib/news";

// 인용 출처 비중을 가로 막대 하나로 보여 주는 부품
// share: { gov: 0.6, opp: 0.2, ... } 형태 (합이 1 또는 0)
export function SourceShareBar({ share, label, showLegend = false, height = "h-3" }) {
  const entries = chartEntries(share).filter((e) => e.value > 0);
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className={`flex w-full overflow-hidden rounded-full bg-muted ${height}`}>
        {entries.map((e) => (
          <div key={e.id} style={{ width: `${e.value * 100}%`, backgroundColor: e.color }} title={`${e.label} ${Math.round(e.value * 100)}%`} />
        ))}
      </div>
      {entries.length === 0 && <span className="text-xs text-muted-foreground">인용된 출처가 없습니다</span>}
      {showLegend && <SourceLegend share={share} />}
    </div>
  );
}

// 범례: 출처 유형 5개 모두. share를 주면 비율도 함께
export function SourceLegend({ share }) {
  const items = share ? chartEntries(share) : sourceTypes.map((t) => ({ id: t.id, label: t.label, color: sourceColor(t.id) }));
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
          {t.label}
          {share && <span className="tabular-nums">{Math.round(t.value * 100)}%</span>}
        </li>
      ))}
    </ul>
  );
}
