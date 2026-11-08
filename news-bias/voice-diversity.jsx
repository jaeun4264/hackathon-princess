// 목소리 다양성(0 ~ 1)을 막대 길이로 보여 주는 부품
// value: 이 기사(또는 묶음) 값, compare: 비교 대상 값(선택), count: 인용 수(선택, 값이 거칠 수 있음을 알림)
export function formatDiversity(v) {
  return v === null || v === undefined ? "–" : v.toFixed(2);
}

export function VoiceDiversity({ value, compare, count, label = "목소리 다양성", compareLabel = "같은 이슈 다른 기사 평균", compact = false }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">인용된 출처가 없어 계산하지 않습니다</span>
      </div>
    );
  }
  const hasCompare = compare !== null && compare !== undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {label}
          {count !== undefined && <span className="ml-1">(인용 {count}건 기준)</span>}
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatDiversity(value)}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted" role="img" aria-label={`${label} ${formatDiversity(value)}`}>
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${value * 100}%` }} />
        {hasCompare && (
          <div
            className="absolute -top-1 h-4.5 w-0.5 -translate-x-1/2 rounded bg-foreground"
            style={{ left: `${compare * 100}%` }}
            title={`${compareLabel} ${formatDiversity(compare)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>0 한 목소리만</span>
        <span>여러 목소리 고르게 1</span>
      </div>
      {!compact && hasCompare && (
        <span className="text-xs text-muted-foreground">
          세로선: {compareLabel} {formatDiversity(compare)}
        </span>
      )}
    </div>
  );
}
