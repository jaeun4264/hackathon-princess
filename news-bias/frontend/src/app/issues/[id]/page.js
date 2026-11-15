import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceLegend } from "@/components/news/source-share-bar";
import { BarOnlyLegend, ShareChart } from "@/components/news/share-chart";
import { QuoteSlope } from "@/components/news/quote-slope";
import { VoiceDiversity } from "@/components/news/voice-diversity";
import {
  BlindspotNotice,
  CampDistributionBar,
  FocusPartyNotice,
  InstitutionNote,
} from "@/components/news/camp-distribution";
import { ComparePin } from "@/components/news/compare-pin";
import {
  averageShare,
  averageSlope,
  quoteSlope,
  averageDiversity,
  voiceDiversity,
  quoteCount,
  formatDate,
  getArticlesOfIssue,
  getIssue,
  getIssues,
  getOutlet,
  hasCampData,
  majorityCamp,
  minorityArticle,
  opinionRatio,
  sourceLabel,
  sourceShare,
} from "@/lib/news";

// 배포할 때 이슈 페이지를 미리 만들어 둡니다
export function generateStaticParams() {
  return getIssues().map((issue) => ({ id: issue.id }));
}

// 화면 2: 이슈 상세 (언론사별 기사를 나란히)
export default async function IssuePage({ params }) {
  const { id } = await params;
  const issue = getIssue(id);
  if (!issue) notFound();
  const articles = getArticlesOfIssue(id);
  // 백엔드가 진영 값(distribution / metrics)을 넣어 준 데이터면 양대 정당 기준으로, 예전 데이터면 기존 지표로
  const camps = hasCampData(issue);
  const dist = issue.distribution;
  const pinned = camps ? minorityArticle(issue, articles) : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 이슈 목록
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{issue.category}</Badge>
          {issue.origin === "curated" && (
            <Badge variant="outline">
              <BadgeCheck aria-hidden />
              검증됨
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{formatDate(issue.date)}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{issue.title}</h1>
        <p className="text-muted-foreground">{issue.summary}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {issue.origin === "curated" ? (
            <>
              <BadgeCheck className="size-3.5" aria-hidden />
              AI가 묶고 분석한 결과를 사람이 한 번 더 확인한 이슈입니다.
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" aria-hidden />
              AI가 기사를 자동으로 묶고 요약한 이슈입니다. 사람이 확인하지 않아 틀린 부분이 있을 수 있어요.
            </>
          )}
        </p>
        {camps && <FocusPartyNotice party={dist.focusParty} />}
      </div>

      {camps && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">누구의 말을 전했나</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CampDistributionBar camps={dist.camps} label={`기사 ${articles.length}건의 진영별 인용 (실제 건수 그대로)`} />
            <InstitutionNote count={dist.institution} />
            <BlindspotNotice blindspot={dist.blindspot} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <ShareChart share={averageShare(articles)} label={`기사 ${articles.length}건의 평균 인용 출처`} barHeight="h-4" size={120} />
          <BarOnlyLegend>
            <SourceLegend share={averageShare(articles)} />
          </BarOnlyLegend>
          <VoiceDiversity value={averageDiversity(articles)} label={`기사 ${articles.length}건의 평균 목소리 다양성`} />
          {camps ? (
            <QuoteSlope value={dist.slopeMean} label={`기사 ${articles.length}건의 평균 기울기 (양대 정당 기준)`} />
          ) : (
            <QuoteSlope value={averageSlope(articles)} label={`기사 ${articles.length}건의 평균 인용 기울기`} />
          )}
        </CardContent>
      </Card>

      {camps && (
        <ComparePin
          majority={majorityCamp(issue)}
          slopeMean={dist.slopeMean}
          blindspot={dist.blindspot}
          pinned={
            pinned && {
              id: pinned.id,
              title: pinned.title,
              outletName: getOutlet(pinned.outletId)?.name ?? "",
              slope: pinned.metrics.slopeSmoothed,
              basis: pinned.metrics.slopeBasis,
            }
          }
        />
      )}

      <h2 className="text-lg font-semibold">언론사별 기사</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link key={article.id} href={`/articles/${article.id}`} className="group">
            <Card className="h-full gap-4 transition-shadow group-hover:shadow-md">
              <CardHeader>
                <span className="text-xs font-medium text-muted-foreground">{getOutlet(article.outletId)?.name}</span>
                <CardTitle className="leading-snug group-hover:underline">{article.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ShareChart share={sourceShare(article)} label="인용 출처" size={80} />
                <VoiceDiversity value={voiceDiversity(article)} count={quoteCount(article)} compare={averageDiversity(articles)} compact />
                {camps && article.metrics ? (
                  <QuoteSlope
                    value={article.metrics.slopeSmoothed}
                    basis={article.metrics.slopeBasis}
                    compare={dist.slopeMean}
                    compareLabel="이 이슈 평균"
                    label="양대 정당 기준 기울기"
                    compact
                  />
                ) : (
                  <QuoteSlope value={quoteSlope(article)} compare={averageSlope(articles)} compact />
                )}
                <span className="text-xs text-muted-foreground">
                  의견 문장 {Math.round(opinionRatio(article) * 100)}%
                </span>
                {article.missingViewpoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {article.missingViewpoints.map((m) => (
                      <Badge key={m.sourceType} variant="outline">
                        {sourceLabel(m.sourceType)} 인용 없음
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
