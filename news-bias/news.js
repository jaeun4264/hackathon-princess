// 뉴스 데이터를 읽고 화면에 필요한 숫자를 계산하는 함수 모음
// 지금은 가짜 데이터(mock-news.json)를 읽고, 나중에 백엔드 API로 바꾸면 이 파일만 고치면 됩니다.
import data from "@/data/mock-news.json";

export const sourceTypes = data.sourceTypes;

// 출처 유형별 색. 정치적 색 연상(빨강·파랑)을 피하려고 중립적인 색만 씁니다.
const PALETTE = ["#0f766e", "#b45309", "#6d28d9", "#475569", "#4d7c0f", "#92400e"];
export function sourceColor(sourceTypeId) {
  const index = sourceTypes.findIndex((t) => t.id === sourceTypeId);
  return PALETTE[index % PALETTE.length] ?? "#94a3b8";
}
export function sourceLabel(sourceTypeId) {
  return sourceTypes.find((t) => t.id === sourceTypeId)?.label ?? "기타";
}

// 그래프에 그릴 조각: 출처 유형 5개를 모두 각자 이름과 색으로 (기타로 묶지 않음)
// 반환: [{ id, label, color, value }] — 출처 유형 순서 그대로, 비중 0인 유형도 포함
export function chartEntries(share) {
  return sourceTypes.map((t) => ({ id: t.id, label: t.label, color: sourceColor(t.id), value: share[t.id] ?? 0 }));
}

export function getOutlet(outletId) {
  return data.outlets.find((o) => o.id === outletId);
}

export function getIssues() {
  return data.issues;
}

export function getIssue(issueId) {
  return data.issues.find((i) => i.id === issueId);
}

export function getArticle(articleId) {
  return data.articles.find((a) => a.id === articleId);
}

export function getArticlesOfIssue(issueId) {
  const issue = getIssue(issueId);
  if (!issue) return [];
  return issue.articleIds.map(getArticle).filter(Boolean);
}

// 기사 한 건의 인용 출처 비중: 출처가 있는 문장 중 각 유형이 차지하는 비율 (0~1)
export function sourceShare(article) {
  const quoted = article.sentences.filter((s) => s.sourceType);
  const share = Object.fromEntries(sourceTypes.map((t) => [t.id, 0]));
  if (quoted.length === 0) return share;
  for (const s of quoted) share[s.sourceType] = (share[s.sourceType] ?? 0) + 1;
  for (const id of Object.keys(share)) share[id] = share[id] / quoted.length;
  return share;
}

// 여러 기사의 인용 출처 비중 평균 (이슈 평균, 내 읽기 편향에 사용)
export function averageShare(articles) {
  const avg = Object.fromEntries(sourceTypes.map((t) => [t.id, 0]));
  if (articles.length === 0) return avg;
  for (const a of articles) {
    const share = sourceShare(a);
    for (const id of Object.keys(avg)) avg[id] += share[id] / articles.length;
  }
  return avg;
}

// 기사에서 의견 문장이 차지하는 비율 (0~1)
export function opinionRatio(article) {
  if (article.sentences.length === 0) return 0;
  return article.sentences.filter((s) => s.type === "opinion").length / article.sentences.length;
}

// 인용 기울기 (하위 지표): (정부·여당 인용 − 야당 인용) ÷ (둘의 합) → −1 ~ +1
//   +1: 정부·여당 인용만 있음 / −1: 야당 인용만 있음 / 0: 둘이 같음
//   정부·여당과 야당 인용이 모두 없는 기사(기업 실적 등)는 null → 화면에 점수 없이 다른 하위 지표만
export function quoteSlope(article) {
  const gov = article.sentences.filter((s) => s.sourceType === "gov").length;
  const opp = article.sentences.filter((s) => s.sourceType === "opp").length;
  if (gov + opp === 0) return null;
  return (gov - opp) / (gov + opp);
}

// 여러 기사의 인용 기울기 평균 (점수가 없는 기사는 빼고 계산, 모두 없으면 null)
export function averageSlope(articles) {
  const values = articles.map(quoteSlope).filter((v) => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 목소리 다양성 (하위 지표): 5개 출처 유형이 얼마나 고르게 인용됐는지 0 ~ 1
//   정규화한 엔트로피 = (−Σ p × ln p) ÷ ln(유형 수)
//   0: 한 유형만 인용 / 1: 모든 유형을 똑같이 인용 / 인용이 하나도 없으면 null
export function diversityOfShare(share) {
  const values = sourceTypes.map((t) => share[t.id] ?? 0).filter((p) => p > 0);
  if (values.length === 0) return null;
  const h = -values.reduce((sum, p) => sum + p * Math.log(p), 0);
  return Math.max(0, h / Math.log(sourceTypes.length));
}

export function quoteCount(article) {
  return article.sentences.filter((s) => s.sourceType).length;
}

export function voiceDiversity(article) {
  return diversityOfShare(sourceShare(article));
}

// 여러 기사의 다양성 평균 (인용이 없는 기사는 빼고, 모두 없으면 null)
export function averageDiversity(articles) {
  const values = articles.map(voiceDiversity).filter((v) => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 이슈 평균과 비교했을 때 차이가 큰 출처 유형 설명 (판정하지 않고 비교만)
export function compareWithIssue(article) {
  const others = getArticlesOfIssue(article.issueId).filter((a) => a.id !== article.id);
  const mine = sourceShare(article);
  const avg = averageShare(others);
  const notes = [];
  for (const t of sourceTypes) {
    const diff = mine[t.id] - avg[t.id];
    if (diff >= 0.2) notes.push(`${t.label} 인용 비중이 같은 이슈의 다른 기사보다 높습니다`);
    if (mine[t.id] === 0 && avg[t.id] > 0) notes.push(`${t.label} 인용 없음 (같은 이슈의 다른 기사에는 있습니다)`);
  }
  return { mine, avg, notes };
}

// 반대 시각 추천: 같은 이슈에서 인용 출처 비중이 이 기사와 가장 다른 기사 순
export function differentViewArticles(article, limit = 2) {
  const mine = sourceShare(article);
  return getArticlesOfIssue(article.issueId)
    .filter((a) => a.id !== article.id)
    .map((a) => {
      const other = sourceShare(a);
      const distance = sourceTypes.reduce((sum, t) => sum + Math.abs(mine[t.id] - other[t.id]), 0);
      return { article: a, distance };
    })
    .sort((x, y) => y.distance - x.distance)
    .slice(0, limit)
    .map((x) => x.article);
}

export function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function getAllArticles() {
  return data.articles;
}

// 내 읽기 편향: 내가 읽은 기사들의 인용 출처 비중을 전체 기사 평균과 비교
export function readingBias(readArticleIds) {
  const read = readArticleIds.map(getArticle).filter(Boolean);
  const mine = averageShare(read);
  const all = averageShare(data.articles);
  // 전체 평균보다 10%p 이상 적게 접한 출처 = 덜 접한 목소리
  const lessHeard = sourceTypes
    .map((t) => ({ ...t, diff: mine[t.id] - all[t.id] }))
    .filter((t) => t.diff <= -0.1)
    .sort((a, b) => a.diff - b.diff);
  // 덜 접한 목소리가 많이 담긴, 아직 안 읽은 기사 추천
  const unread = data.articles.filter((a) => !readArticleIds.includes(a.id));
  const recommendations = lessHeard.length
    ? unread
        .map((a) => ({ article: a, score: lessHeard.reduce((sum, t) => sum + sourceShare(a)[t.id], 0) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 3)
        .map((x) => x.article)
    : [];
  // 자주 본 언론사
  const outletCounts = data.outlets
    .map((o) => ({ ...o, count: read.filter((a) => a.outletId === o.id).length }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);
  return { read, mine, all, lessHeard, recommendations, outletCounts };
}
