import { Scale } from "lucide-react";

// 쟁점 요약: 여야가 같은 점 / 다른 점 (11/16 사용자 테스트 의견으로 추가)
// 설문에서 "국민의힘은 유예, 민주당은 반대"처럼 실제로는 두 당이 같은 입장인데 정반대로 기억한 응답이 나와,
// 막대(누구의 말이 몇 건)만으로는 '어디서 갈리는지'를 알기 어렵다는 점을 보완합니다.
// stance: { common, diff, sources, by: "ai" | "human" }
export function StanceSummary({ stance }) {
  if (!stance || (!stance.common && !stance.diff)) return null;
  return (
    <section aria-label="쟁점 요약" className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Scale className="size-4 text-muted-foreground" aria-hidden />
        쟁점 요약
      </p>
      <dl className="grid gap-1.5 text-sm sm:grid-cols-[7rem_1fr]">
        {stance.common && (
          <>
            <dt className="font-medium text-muted-foreground">여야가 같은 점</dt>
            <dd>{stance.common}</dd>
          </>
        )}
        {stance.diff && (
          <>
            <dt className="font-medium text-muted-foreground">여야가 다른 점</dt>
            <dd>{stance.diff}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">
        {stance.by === "human" ? "사람이 기사를 확인해 작성" : "AI가 기사 제목·요약과 인용된 사람을 바탕으로 작성 (틀릴 수 있어요)"}
        {stance.sources?.length ? ` · 근거: ${stance.sources.join(", ")}` : ""}
      </p>
    </section>
  );
}
