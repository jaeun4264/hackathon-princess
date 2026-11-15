"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteSlope, formatSlope } from "@/components/news/quote-slope";
import { useCompareMode } from "@/lib/compare-mode";

const LABELS = { ruling: "정부·여당", mainOpp: "제1야당" };

// 비교 영역의 '소수 쪽 고정 자리': 이슈 다수와 기울기 방향이 반대인 기사를 최소 1건 고정 노출
//   majority: 이슈 다수 쪽 ("ruling" | "mainOpp" | null), slopeMean: 이슈 평균 보정 기울기
//   pinned: { id, title, outletName, slope, basis } 또는 null (반대 방향 기사가 없음)
//   blindspot: 반대 방향 기사가 없을 때 빈자리 대신 보여 줄 사각지대 진영
//   주소에 ?compare=off 가 있으면 통째로 숨김 (사용자 테스트 비교용)
export function ComparePin({ majority, slopeMean, pinned, blindspot }) {
  const mode = useCompareMode();
  if (mode !== "on" || !majority) return null;
  const minority = majority === "ruling" ? "mainOpp" : "ruling";

  return (
    <section className="flex flex-col gap-3" aria-labelledby="compare-pin-title">
      <h2 id="compare-pin-title" className="text-lg font-semibold">
        기울기 방향이 다른 기사
      </h2>
      {pinned ? (
        <Link href={`/articles/${pinned.id}?from=compare`} className="group">
          <Card className="gap-4 border-foreground/30 transition-shadow group-hover:shadow-md">
            <CardHeader>
              <span className="text-xs font-medium text-muted-foreground">{pinned.outletName}</span>
              <CardTitle className="leading-snug group-hover:underline">{pinned.title}</CardTitle>
              <CardDescription>
                이 이슈 기사들은 평균적으로 {LABELS[majority]} 측 인용이 더 많아요 (평균 {formatSlope(slopeMean)}). 이
                기사는 {LABELS[minority]} 측 인용이 더 많아요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuoteSlope
                value={pinned.slope}
                basis={pinned.basis}
                compare={slopeMean}
                label="양대 정당 기준 기울기"
                compareLabel="이 이슈 평균"
              />
            </CardContent>
          </Card>
        </Link>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          이 이슈에는 평균과 기울기 방향이 반대인 기사가 없어요.
          {blindspot && ` ${LABELS[blindspot]} 측 인용이 거의 없는 이슈예요 (위 진영 분포 참고).`}
        </p>
      )}
    </section>
  );
}
