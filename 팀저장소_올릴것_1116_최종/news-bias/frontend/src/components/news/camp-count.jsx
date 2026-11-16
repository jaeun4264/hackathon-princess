// 누가 말했나: 정부·여당 발언 수 · 야당 발언 수를 그대로 보여 주는 부품 (11/16 사용자 테스트 반영)
// "여당 쪽 말이 많음·강하게" 같은 판정 단어나 기울기 숫자 대신, 독자가 원문에서 확인할 수 있는 건수만 보여 줍니다.
//   camps: metrics.camps 또는 distribution.camps ({ ruling, mainOpp, ... })
//   percent: 이슈처럼 여러 기사를 합친 값은 비율(%)로
import { sourceColor } from "@/lib/news";

const SIDES = [
  { id: "ruling", label: "정부·여당", color: sourceColor("gov") },
  { id: "mainOpp", label: "야당", color: sourceColor("opp") },
];

export function CampCount({ camps, percent = false, size = "md" }) {
  const r = camps?.ruling ?? 0;
  const o = camps?.mainOpp ?? 0;
  const text = size === "sm" ? "text-xs" : "text-sm";
  if (r + o === 0) return <span className={`${text} text-muted-foreground`}>여야 발언 없음</span>;
  const val = { ruling: r, mainOpp: o };
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${text}`}>
      {SIDES.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
          {s.label} 발언 <b className="tabular-nums">{percent ? `${Math.round((val[s.id] / (r + o)) * 100)}%` : `${val[s.id]}건`}</b>
        </span>
      ))}
    </span>
  );
}

// 한쪽 발언이 0건이면 그 쪽 발언이 있는 같은 이슈 기사를 찾음
export function missingSide(article, sameIssue) {
  const c = article.metrics?.camps;
  if (!c || (c.ruling ?? 0) + (c.mainOpp ?? 0) === 0) return null;
  const side = (c.ruling ?? 0) === 0 ? "ruling" : (c.mainOpp ?? 0) === 0 ? "mainOpp" : null;
  if (!side) return null;
  const other = sameIssue
    .filter((a) => a.id !== article.id && (a.metrics?.camps?.[side] ?? 0) > 0)
    .sort((x, y) => (y.metrics.camps[side] ?? 0) - (x.metrics.camps[side] ?? 0))[0];
  return { label: side === "ruling" ? "정부·여당" : "야당", other };
}
