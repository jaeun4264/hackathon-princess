import { USAGE_LABEL, type Usage } from "@/lib/types";

const TONE: Record<Usage, string> = {
  often: "bg-often-bg text-often-ink",
  sometimes: "bg-sometimes-bg text-sometimes-ink",
  rarely: "bg-rarely-bg text-rarely-ink",
};

/** 사용 정도 칩: 옅은 타일 + 같은 색의 진한 글자. 색만으로 구분하지 않게 라벨을 항상 써요. */
export function UsageChip({ usage }: { usage: Usage }) {
  return <span className={`inline-flex h-6 items-center rounded-[5px] px-2 text-sm font-medium ${TONE[usage]}`}>{USAGE_LABEL[usage]}</span>;
}
