// 진영 분포·양대 정당 기울기 (백엔드가 계산해 넘겨 준 metrics / distribution 값을 그대로 씀)
// 진영 목록·색·막대 부품은 lib/news.js 의 CAMPS 와 components/news/camp-distribution.jsx (과제 ①)를 함께 씀
// 설명: news-bias/docs/API.md "진영 분포 · 양대 정당 기울기"
//   camps: { ruling: 정부·여당, third: 제3정당, mainOpp: 제1야당, independent: 무소속 }
//   기울기는 ruling·mainOpp만으로 계산, 경찰·검찰·법원 등 수사·사법기관(institution)은 제외
import { CAMPS, getArticle } from "@/lib/news";


// 기울기 숫자를 보여 줄 최소 인용 수 (이보다 적으면 "판단하기 어려움")
export const MIN_SLOPE_BASIS = 3;

export function emptyCamps() {
  return Object.fromEntries(CAMPS.map((c) => [c.id, 0]));
}

// 여러 기사의 진영별 인용 수 합계 (내 읽기 편향에 사용)
export function sumCamps(articles) {
  const total = emptyCamps();
  let institution = 0;
  for (const a of articles) {
    const camps = a?.metrics?.camps ?? {};
    for (const c of CAMPS) total[c.id] += camps[c.id] ?? 0;
    institution += a?.metrics?.institution ?? 0;
  }
  return { camps: total, institution };
}

export function campsTotal(camps) {
  return CAMPS.reduce((s, c) => s + (camps?.[c.id] ?? 0), 0);
}

// 양대 정당 기울기 (보정): 백엔드와 같은 식 (여당 − 제1야당) ÷ (둘의 합 + 2)
export function smoothedSlopeOf(camps) {
  const r = camps?.ruling ?? 0;
  const o = camps?.mainOpp ?? 0;
  if (r + o === 0) return null;
  return (r - o) / (r + o + 2);
}

// 양대 정당 기울기 (화면 표시용, 보정 없음): (여당 − 제1야당) ÷ (둘의 합)
//   한쪽만 인용하면 ±1 이 그대로 보이게 함. 인용이 적어 값이 튀는 문제는 보정 대신
//   MIN_SLOPE_BASIS 미만이면 숫자를 숨기는 것으로 막음 (11/16 결정)
export function slopeOf(camps) {
  const r = camps?.ruling ?? 0;
  const o = camps?.mainOpp ?? 0;
  if (r + o === 0) return null;
  return (r - o) / (r + o);
}

// 기사 기울기 정보: 백엔드 metrics.slope (보정 없는 값)
export function articleSlope(article) {
  const m = article?.metrics;
  if (!m) return { value: null, basis: 0, enough: false, excluded: 0, institution: 0 };
  const basis = m.slopeBasis ?? 0;
  const value = m.slope ?? null;
  return {
    value,
    basis,
    enough: basis >= MIN_SLOPE_BASIS && value !== null,
    excluded: m.excludedFromSlope ?? 0,
    institution: m.institution ?? 0,
  };
}

// 이슈 기울기 정보: 기사별 값의 평균이 아니라 이슈 전체 인용을 합쳐서 계산
//   (분포 막대와 같은 기준 → 54 : 0 이면 +1.00)
export function issueSlope(issue) {
  const camps = issue?.distribution?.camps;
  if (!camps) return { value: null, basis: 0, enough: false };
  const basis = (camps.ruling ?? 0) + (camps.mainOpp ?? 0);
  const value = slopeOf(camps);
  return { value, basis, enough: basis >= MIN_SLOPE_BASIS && value !== null };
}

// 이슈 전체 기울기와의 차이를 문장으로: "이 이슈 전체보다 정부·여당 쪽 +0.20"
export function slopeDiffText(value, mean) {
  if (value === null || value === undefined || mean === null || mean === undefined) return null;
  const d = Math.round((value - mean) * 100) / 100;
  if (Math.abs(d) < 0.05) return "이 이슈 전체와 비슷합니다";
  const side = d > 0 ? "정부·여당" : "제1야당";
  return `이 이슈 전체보다 ${side} 쪽 ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
}

export function readCamps(articleIds) {
  return sumCamps(articleIds.map(getArticle).filter(Boolean));
}
