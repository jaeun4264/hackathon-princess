import { KIND_LABEL, questionFor, VERDICT_LABEL, verdictOf, type MissingField } from "@/lib/client/benefits";
import type { BenefitResult, CatalogBenefit } from "@/lib/types";

const VERDICT_TONE = {
  yes: "bg-often-bg text-often-ink",
  no: "bg-ground text-muted",
  unknown: "bg-warning-bg text-warning",
  unverified: "bg-warning-bg text-warning",
} as const;

/** 확인일 + 30일 넘으면 '재확인 필요' */
export function FreshnessBadge({ checkedAt, stale }: { checkedAt: string; stale: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      확인일 <span className="num">{checkedAt}</span>
      {stale ? <span className="inline-flex h-6 items-center rounded-[5px] border border-warning-line bg-warning-bg px-2 text-warning">재확인 필요</span> : null}
    </span>
  );
}

/**
 * 혜택 카드: 종류, 혜택 내용, 자격 판정, 근거 인용(서버가 검증한 원문 그대로), 출처 링크, 확인일.
 * 판정이 yes가 아니면 "받을 수 있어요"라고 보여 주지 않아요.
 */
export function BenefitCard({
  benefit,
  result,
  loading,
  onAnswer,
}: {
  benefit: CatalogBenefit;
  result: BenefitResult | undefined;
  loading?: boolean;
  onAnswer?: (field: "school_email" | "status" | "school", value: string) => void;
}) {
  const verdict = verdictOf(result);
  const stale = result?.stale ?? false;
  const questions = verdict === "unknown" ? (result?.missing_info ?? []).map((field: MissingField) => questionFor(field)).filter((q) => q !== null) : [];
  const unanswerable = verdict === "unknown" && (result?.missing_info ?? []).some((field) => field === "grade" || field === "other");

  return (
    <article className="rounded-[20px] bg-surface p-5" aria-label={`${KIND_LABEL[benefit.kind]} ${benefit.benefit_text}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center rounded-[5px] bg-raised px-2 text-sm text-accent-ink">{KIND_LABEL[benefit.kind]}</span>
        {benefit.school ? <span className="text-sm text-muted">{benefit.school}</span> : null}
      </div>
      <h3 className="mt-2 text-base font-semibold">{benefit.benefit_text}</h3>

      <div className="mt-3" aria-live="polite">
        {loading ? (
          <p className="text-sm text-muted">자격을 확인하고 있어요</p>
        ) : (
          <p className={`inline-flex min-h-8 items-center rounded-[8px] px-3 text-sm font-semibold ${VERDICT_TONE[verdict]}`}>{VERDICT_LABEL[verdict]}</p>
        )}
      </div>

      {!loading && result && verdict !== "unverified" && result.reason ? <p className="mt-2 text-sm text-ink">{result.reason}</p> : null}

      {!loading && result && result.quoted_conditions.length > 0 && verdict !== "unverified" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">공식 조건에서 그대로 옮긴 문장</p>
          {result.quoted_conditions.map((quote) => (
            <blockquote key={quote} className="rounded-[8px] bg-ground px-3 py-2 text-sm leading-relaxed">
              &ldquo;{quote}&rdquo;
            </blockquote>
          ))}
        </div>
      ) : null}

      {!loading && verdict === "unverified" ? (
        <p className="mt-2 text-sm text-warning">AI가 확인하지 못했어요. 공식 페이지에서 조건을 확인해 주세요.</p>
      ) : null}

      {!loading && questions.length > 0 && onAnswer ? (
        <div className="mt-3 space-y-3 rounded-[10px] bg-warning-bg px-4 py-3">
          {questions.map((question) => (
            <InlineQuestion key={question.field} field={question.field} text={question.text} onAnswer={onAnswer} />
          ))}
        </div>
      ) : null}
      {!loading && unanswerable ? <p className="mt-2 text-sm text-muted">학년 등 다른 조건은 공식 페이지에서 확인해 주세요.</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <FreshnessBadge checkedAt={result?.checked_at ?? benefit.checked_at} stale={stale} />
        <a href={benefit.source_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
          공식 페이지
        </a>
      </div>
    </article>
  );
}

/** missing_info 질문: 답하면 프로필을 갱신하고 이 카드만 다시 판정해요. */
function InlineQuestion({
  field,
  text,
  onAnswer,
}: {
  field: "school_email" | "status" | "school";
  text: string;
  onAnswer: (field: "school_email" | "status" | "school", value: string) => void;
}) {
  const options =
    field === "school_email"
      ? [{ value: "yes", label: "예" }, { value: "no", label: "아니오" }]
      : field === "status"
        ? ["재학", "휴학", "대학원", "졸업예정", "기타"].map((value) => ({ value, label: value }))
        : ["고려대학교", "이화여자대학교", "기타"].map((value) => ({ value, label: value })); // TODO(팀): 학교 범위
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{text}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onAnswer(field, option.value)}
            className="min-h-11 rounded-[10px] border border-control bg-surface px-4 text-sm font-semibold text-ink active:scale-[0.98]"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
