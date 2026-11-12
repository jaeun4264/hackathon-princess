"use client";

// 선택한 그래프 모양(막대/도넛)에 맞춰 인용 출처 비중을 그려 주는 부품
import { useChartStyle } from "@/lib/chart-style";
import { SourceShareBar } from "@/components/news/source-share-bar";
import { DonutChart } from "@/components/news/donut-chart";

export function ShareChart({ share, label, size = 96, barHeight = "h-3", showLegend = true }) {
  const style = useChartStyle();
  if (style === "donut") return <DonutChart share={share} label={label} size={size} showLegend={showLegend} />;
  return <SourceShareBar share={share} label={label} height={barHeight} />;
}

// 기사 상세의 "이 기사 vs 다른 기사 평균" 비교: 도넛이면 나란히, 막대면 위아래로
export function CompareCharts({ mine, avg, mineLabel = "이 기사의 인용 출처", avgLabel = "같은 이슈 다른 기사들의 평균" }) {
  const style = useChartStyle();
  if (style === "donut") {
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <DonutChart share={mine} label={mineLabel} size={120} />
        <DonutChart share={avg} label={avgLabel} size={120} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SourceShareBar share={mine} label={mineLabel} height="h-4" />
      <SourceShareBar share={avg} label={avgLabel} height="h-4" />
    </div>
  );
}

// 막대일 때만 범례를 따로 보여 줌 (도넛은 그래프 옆에 범례가 붙어 있음)
export function BarOnlyLegend({ children }) {
  const style = useChartStyle();
  return style === "bar" ? children : null;
}
