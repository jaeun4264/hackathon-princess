import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceLegend } from "@/components/news/source-share-bar";
import { BarOnlyLegend, CompareCharts, ShareChart } from "@/components/news/share-chart";
import {
  compareWithIssue,
  differentViewArticles,
  formatDate,
  getArticle,
  getIssue,
  getArticlesOfIssue,
  getOutlet,
  opinionRatio,
  averageSlope,
  quoteSlope,
  averageDiversity,
  voiceDiversity,
  quoteCount,
  sourceColor,
  sourceLabel,
} from "@/lib/news";
import data from "@/data/news-live.json";
import { RecordRead } from "@/components/news/record-read";
import { OriginalLink } from "@/components/news/original-link";
import { QuoteSlope } from "@/components/news/quote-slope";
import { VoiceDiversity } from "@/components/news/voice-diversity";

export function generateStaticParams() {
  return data.articles.map((a) => ({ id: a.id }));
}

// 화면 3: 기사 상세 (지표만 보여 주고, 기사 문장은 보여 주지 않음 → 문장은 원문에서)
export default async function ArticlePage({ params }) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) notFound();
  const issue = getIssue(article.issueId);
  const outlet = getOutlet(article.outletId);
  const { mine, avg, notes } = compareWithIssue(article);
  const recommendations = differentViewArticles(article);
  // 의견 문장은 저작권을 고려해 최대 2개, 앞 40자까지만 짧게 인용 (출처: 언론사명 표시)
  const QUOTE_MAX = 40;
  const opinionQuotes = article.sentences
    .filter((s) => s.type === "opinion")
    .slice(0, 2)
    .map((s) => ({ id: s.id, text: s.text.length > QUOTE_MAX ? s.text.slice(0, QUOTE_MAX).trimEnd() + "…" : s.text }));
  const framingTerms = [...new Set(article.framingTerms.map((f) => f.term))];
  const quotedPeople = [
    ...new Map(
      article.sentences
        .filter((s) => s.sourceType && s.sourceName)
        .map((s) => [s.sourceName, { name: s.sourceName, sourceType: s.sourceType }]),
    ).values(),
  ];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <RecordRead articleId={article.id} />
      <Link href={`/issues/${issue.id}`} className="text-sm text-muted-foreground hover:underline">
        ← {issue.title}
      </Link>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {outlet?.name} · {formatDate(article.publishedAt)}
        </span>
        <h1 className="text-2xl font-bold leading-snug tracking-tight">{article.title}</h1>
        <p className="text-muted-foreground">{article.summary}</p>
        <OriginalLink articleId={article.id} url={article.url} outletName={outlet?.name} className="text-sm underline underline-offset-4" />
      </div>

      {/* 같은 이슈의 다른 기사와 비교 */}
      <Card>
        <CardHeader>
          <CardTitle>같은 이슈의 다른 기사와 비교하면</CardTitle>
          <CardDescription>기사를 판정하지 않습니다. 같은 이슈를 다룬 다른 기사와 무엇이 다른지 보여 줍니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CompareCharts mine={mine} avg={avg} />
          <BarOnlyLegend>
            <SourceLegend />
          </BarOnlyLegend>
          {notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <VoiceDiversity
            value={voiceDiversity(article)}
            count={quoteCount(article)}
            compare={averageDiversity(getArticlesOfIssue(article.issueId).filter((a) => a.id !== article.id))}
          />
          <QuoteSlope
            value={quoteSlope(article)}
            compare={averageSlope(getArticlesOfIssue(article.issueId).filter((a) => a.id !== article.id))}
          />
          <span className="text-sm text-muted-foreground">의견 문장 비율 {Math.round(opinionRatio(article) * 100)}%</span>
        </CardContent>
      </Card>

      {/* 이 기사에 없는 인용 (빠진 관점) */}
      {article.missingViewpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>이 기사에 없는 인용</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {article.missingViewpoints.map((m) => (
              <div key={m.sourceType} className="flex flex-col gap-1">
                <span className="text-sm">{m.description}</span>
                <span className="text-xs text-muted-foreground">
                  이 목소리가 담긴 기사:{" "}
                  {m.foundInArticleIds.map((aid, i) => (
                    <span key={aid}>
                      {i > 0 && ", "}
                      <Link href={`/articles/${aid}`} className="underline underline-offset-2">
                        {getOutlet(getArticle(aid)?.outletId)?.name}
                      </Link>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 평가가 담긴 표현과 인용한 사람 (기사 문장은 보여 주지 않음) */}
      {(opinionQuotes.length > 0 || framingTerms.length > 0 || quotedPeople.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>이 기사에서 찾은 것</CardTitle>
            <CardDescription>기사 전체 문장은 원문에서 확인할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {opinionQuotes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  의견 문장 <span className="font-normal text-muted-foreground">(일부 인용)</span>
                </span>
                {opinionQuotes.map((q) => (
                  <blockquote key={q.id} className="border-l-4 pl-3 text-sm leading-relaxed">
                    &ldquo;{q.text}&rdquo;
                    <span className="ml-1 text-xs text-muted-foreground">— {outlet?.name}</span>
                  </blockquote>
                ))}
              </div>
            )}
            {framingTerms.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">평가가 담긴 표현</span>
                <div className="flex flex-wrap gap-1.5">
                  {framingTerms.map((t) => (
                    <mark key={t} className="rounded bg-amber-100 px-1.5 py-0.5 text-sm text-inherit">
                      {t}
                    </mark>
                  ))}
                </div>
              </div>
            )}
            {quotedPeople.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">인용한 사람</span>
                <div className="flex flex-wrap gap-1.5">
                  {quotedPeople.map((q) => (
                    <Badge key={q.name} variant="outline" className="gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: sourceColor(q.sourceType) }} />
                      {sourceLabel(q.sourceType)} · {q.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 반대 시각 기사 추천 */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>다른 시각의 기사</CardTitle>
            <CardDescription>인용한 출처가 이 기사와 가장 다른 기사입니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recommendations.map((r) => (
              <Link key={r.id} href={`/articles/${r.id}`} className="group flex flex-col gap-1.5 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">{getOutlet(r.outletId)?.name}</span>
                <span className="font-medium group-hover:underline">{r.title}</span>
                <ShareChart share={compareWithIssue(r).mine} size={72} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
