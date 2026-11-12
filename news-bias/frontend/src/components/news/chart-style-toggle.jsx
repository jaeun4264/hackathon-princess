"use client";

// 머리글의 "막대 / 도넛" 전환 버튼
import { setChartStyle, useChartStyle } from "@/lib/chart-style";
import { cn } from "@/lib/utils";

export function ChartStyleToggle() {
  const style = useChartStyle();
  const options = [
    { id: "bar", label: "막대" },
    { id: "donut", label: "도넛" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="그래프 모양">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setChartStyle(o.id)}
          aria-pressed={style === o.id}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium sm:px-2.5 sm:py-1 text-muted-foreground transition-colors",
            style === o.id && "bg-background text-foreground shadow-sm"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
