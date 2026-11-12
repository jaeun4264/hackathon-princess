"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareChart } from "@/components/news/share-chart";

// 첫 화면 이슈 목록 + 분야 필터 (전체 / 사회 / 경제 / 생활 …)
// issues: [{ id, title, summary, category, dateLabel, share, articleCount }]
export function IssueList({ issues }) {
  const categories = ["전체", ...new Set(issues.map((i) => i.category))];
  const [selected, setSelected] = useState("전체");
  const shown = selected === "전체" ? issues : issues.filter((i) => i.category === selected);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="분야">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={selected === c}
            onClick={() => setSelected(c)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              selected === c ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((issue) => (
          <Link key={issue.id} href={`/issues/${issue.id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{issue.category}</Badge>
                  <span className="text-xs text-muted-foreground">{issue.dateLabel}</span>
                </div>
                <CardTitle className="text-lg leading-snug group-hover:underline">{issue.title}</CardTitle>
                <CardDescription>{issue.summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ShareChart share={issue.share} label="이 이슈 기사들의 평균 인용 출처" size={88} />
                <span className="text-xs text-muted-foreground">기사 {issue.articleCount}건</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
