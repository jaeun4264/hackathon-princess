// 진영 분포 막대: 정부·여당 | 제3정당 | 제1야당 | 무소속 (인용 건수 그대로, 보정하지 않음)
// 이슈 화면(①)과 내 읽기 편향(②)이 같은 모양을 쓰도록 공용 부품으로 둡니다.
import { CAMPS, campsTotal } from "@/lib/camps";

export function CampBar({ camps, institution = 0, label = "진영별 인용", note }) {
  const total = campsTotal(camps);
  const shown = CAMPS.filter((c) => c.id !== "independent" || (camps?.independent ?? 0) > 0);
  if (total === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">정당·정부 인용이 없어 진영 분포를 그리지 않습니다</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">인용 {total}건</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={shown.map((c) => `${c.label} ${camps?.[c.id] ?? 0}건`).join(", ")}>
        {shown.map((c) => {
          const v = camps?.[c.id] ?? 0;
          return v > 0 ? <div key={c.id} style={{ width: `${(v / total) * 100}%`, backgroundColor: c.color }} title={`${c.label} ${v}건`} /> : null;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {shown.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label} {camps?.[c.id] ?? 0}건 ({Math.round(((camps?.[c.id] ?? 0) / total) * 100)}%)
          </span>
        ))}
      </div>
      {institution > 0 && (
        <span className="text-xs text-muted-foreground">수사·사법기관(경찰·검찰·법원 등) 인용 {institution}건은 진영 계산에서 뺐습니다</span>
      )}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
