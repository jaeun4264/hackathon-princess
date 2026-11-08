import { chartEntries } from "@/lib/news";

// 인용 출처 비중을 도넛(원) 그래프로 보여 주는 부품
// share: { gov: 0.6, opp: 0.2, ... }
export function DonutChart({ share, label, size = 96, showLegend = true }) {
  const stroke = size * 0.16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 출처 유형 5개 모두 (범례에는 0%도 표시, 원에는 0보다 큰 것만)
  const entries = chartEntries(share);
  const drawn = entries.filter((e) => e.value > 0);
  const total = drawn.length;

  // 각 조각의 시작 위치를 차례로 쌓아 계산
  let offset = 0;
  const slices = drawn.map((e) => {
    const length = e.value * circumference;
    const slice = { ...e, length, offset };
    offset += length;
    return slice;
  });

  // 가운데에는 가장 많이 인용된 출처를 보여 줌
  const top = drawn.reduce((best, e) => (!best || e.value > best.value ? e : best), null);

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={label ?? "인용 출처 비중"}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          {slices.map((s) => (
            <circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={-s.offset}
            >
              <title>{`${s.label} ${Math.round(s.value * 100)}%`}</title>
            </circle>
          ))}
          {total > 0 && top && (
            <g className="rotate-90" style={{ transformOrigin: "center" }}>
              <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.12} fill="var(--muted-foreground)">
                {top.label}
              </text>
              <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.17} fontWeight="700" fill="var(--foreground)">
                {Math.round(top.value * 100)}%
              </text>
            </g>
          )}
        </svg>
        {showLegend && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {entries.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span>{t.label}</span>
                <span className="tabular-nums">{Math.round(t.value * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {total === 0 && <span className="text-xs text-muted-foreground">인용된 출처가 없습니다</span>}
    </div>
  );
}
