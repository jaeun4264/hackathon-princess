// 인용 기울기(−1 ~ +1)를 가로 눈금 위의 점으로 보여 주는 부품
// value: 이 기사(또는 이슈) 값, compare: 비교 대상 값(선택), null이면 점수 없음 안내
// 정당 색 연상을 피하려고 회색 계열만 씁니다.
function position(v) {
  return `${((v + 1) / 2) * 100}%`;
}

export function formatSlope(v) {
  if (v === null || v === undefined) return "–";
  const r = Math.round(v * 100) / 100;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

export function QuoteSlope({ value, compare, label = "인용 기울기", compareLabel = "같은 이슈 다른 기사 평균", compact = false }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">정부·여당과 야당 인용이 없어 계산하지 않습니다</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{formatSlope(value)}</span>
      </div>
      <div className="relative h-5" role="img" aria-label={`${label} ${formatSlope(value)}`}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div className="absolute left-1/2 top-0.5 h-4 w-px -translate-x-1/2 bg-foreground/30" />
        {compare !== null && compare !== undefined && (
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/50 bg-background"
            style={{ left: position(compare) }}
            title={`${compareLabel} ${formatSlope(compare)}`}
          />
        )}
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: position(value) }}
          title={`${label} ${formatSlope(value)}`}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>−1 야당 인용 많음</span>
        {!compact && <span>0</span>}
        <span>정부·여당 인용 많음 +1</span>
      </div>
      {!compact && compare !== null && compare !== undefined && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-foreground" />
            이 기사 {formatSlope(value)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full border-2 border-foreground/50" />
            {compareLabel} {formatSlope(compare)}
          </span>
        </div>
      )}
    </div>
  );
}
