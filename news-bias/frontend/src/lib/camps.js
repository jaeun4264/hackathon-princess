// 진영 분포·양대 정당 기울기 (백엔드가 계산해 넘겨 준 metrics / distribution 값을 그대로 씀)
// 설명: news-bias/docs/API.md "진영 분포 · 양대 정당 기울기"
//   camps: { ruling: 정부·여당, third: 제3정당, mainOpp: 제1야당, independent: 무소속 }
//   기울기는 ruling·mainOpp만으로 계산, 경찰·검찰·법원 등 수사·사법기관(institution)은 제외
import { getArticle } from "@/lib/news";

export const CAMPS = [
  { id: "ruling", label: "정부·여당", color: "#0f766e" },
  { id: "third", label: "제3정당", color: "#a16207" },
  { id: "mainOpp", label: "제1야당", color: "#6d28d9" },
  { id: "independent", label: "무소속", color: "#64748b" },
];

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

// 기사 화면용 기울기 정보
export function articleSlope(article) {
  const m = article?.metrics;
  if (!m) return { value: null, basis: 0, enough: false, excluded: 0, institution: 0 };
  const basis = m.slopeBasis ?? 0;
  return {
    value: m.slopeSmoothed ?? null,
    basis,
    enough: basis >= MIN_SLOPE_BASIS && m.slopeSmoothed !== null && m.slopeSmoothed !== undefined,
    excluded: m.excludedFromSlope ?? 0,
    institution: m.institution ?? 0,
  };
}

// 이슈 평균과의 차이를 문장으로: "이 이슈 평균보다 정부·여당 쪽 +0.20"
export function slopeDiffText(value, mean) {
  if (value === null || value === undefined || mean === null || mean === undefined) return null;
  const d = Math.round((value - mean) * 100) / 100;
  if (Math.abs(d) < 0.05) return "이 이슈 평균과 비슷합니다";
  const side = d > 0 ? "정부·여당" : "제1야당";
  return `이 이슈 평균보다 ${side} 쪽 ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
}

export function readCamps(articleIds) {
  return sumCamps(articleIds.map(getArticle).filter(Boolean));
}
