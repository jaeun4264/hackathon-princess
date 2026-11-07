import { won } from "@/lib/client/confirm";
import { usageSegments } from "@/lib/client/derive";
import { USAGE_LABEL, type Usage } from "@/lib/types";

// 막대 색은 흰 카드에서 3:1 이상이 되게 진한 색을 써요. 범례에 글자와 금액을 항상 같이 써요.
const BAR_COLOR: Record<Usage, string> = { often: "#2f7a45", sometimes: "#b45309", rarely: "#c41c29" };

/** 사용 정도별 월 금액을 누적 막대 하나로. 차트 라이브러리 없이 CSS로 그려요. */
export function UsageBar({ summary }: { summary: { total_monthly: number; often_monthly: number; sometimes_monthly: number; rarely_monthly: number } }) {
  const segments = usageSegments(summary);
  const description = segments.map((segment) => `${USAGE_LABEL[segment.usage]} ${won(segment.amount)}`).join(", ");
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-[5px] bg-rule" role="img" aria-label={`사용 정도별 월 금액: ${description}`}>
        {segments.map((segment) => (
          <div key={segment.usage} style={{ width: `${segment.ratio * 100}%`, background: BAR_COLOR[segment.usage] }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {(["often", "sometimes", "rarely"] as const).map((usage) => {
          const amount = summary[`${usage}_monthly`];
          return (
            <li key={usage} className="text-sm">
              <span className="flex items-center gap-1.5 text-muted">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px]" style={{ background: BAR_COLOR[usage] }} />
                {USAGE_LABEL[usage]}
              </span>
              <span className={`num block ${amount === 0 ? "text-muted" : "font-semibold"}`}>{won(amount)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
