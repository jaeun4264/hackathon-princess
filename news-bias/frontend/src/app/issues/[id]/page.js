import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceLegend } from "@/components/news/source-share-bar";
import { BarOnlyLegend, ShareChart } from "@/components/news/share-chart";
import { QuoteSlope } from "@/components/news/quote-slope";
import { VoiceDiversity } from "@/components/news/voice-diversity";
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 이슈 목록
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{issue.category}</Badge>
          <span className="text-xs text-muted-foreground">{formatDate(issue.date)}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{issue.title}</h1>
        <p className="text-muted-foreground">{issue.summary}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <ShareChart share={averageShare(articles)} label={`기사 ${articles.length}건의 평균 인용 출처`} barHeight="h-4" size={120} />
          <BarOnlyLegend>
            <SourceLegend share={averageShare(articles)} />
          </BarOnlyLegend>
          <VoiceDiversity value={averageDiversity(articles)} label={`기사 ${articles.length}건의 평균 목소리 다양성`} />
          <QuoteSlope value={averageSlope(articles)} label={`기사 ${articles.length}건의 평균 인용 기울기`} />
        </CardContent>
      </Card>

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
                <QuoteSlope value={quoteSlope(article)} compare={averageSlope(articles)} compact />
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
