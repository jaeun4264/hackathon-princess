import { SourceLegend } from "@/components/news/source-share-bar";
import { BarOnlyLegend } from "@/components/news/share-chart";
import { Intro } from "@/components/news/intro";
import { IssueList } from "@/components/news/issue-list";
import { averageShare, formatDate, getArticlesOfIssue, getIssues } from "@/lib/news";

// 화면 1: 이슈 목록 (분야별로 골라 보기)
export default function Home() {
  const issues = getIssues().map((issue) => {
    const articles = getArticlesOfIssue(issue.id);
    return {
      id: issue.id,
      title: issue.title,
      summary: issue.summary,
      category: issue.category,
      dateLabel: formatDate(issue.date),
      share: averageShare(articles),
      articleCount: articles.length,
    };
  });
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <Intro />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight">오늘의 이슈</h2>
        <BarOnlyLegend>
          <SourceLegend />
        </BarOnlyLegend>
      </div>
      <IssueList issues={issues} />
    </main>
  );
}
