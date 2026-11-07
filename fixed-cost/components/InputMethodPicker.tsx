export type InputMethodId = "gmail" | "csv" | "capture";
export interface InputMethod {
  id: InputMethodId;
  label: string;
  enabled: boolean;
}

/** 입력 방식 목록. 11/4 결정: Gmail이 주 버튼, CSV는 예비(작은 링크), 화면 캡처는 숨김. */
export const INPUT_METHODS: InputMethod[] = [
  { id: "gmail", label: "Gmail 영수증 불러오기", enabled: true },
  { id: "csv", label: "결제 내역 파일(CSV) 올리기", enabled: true },
  { id: "capture", label: "화면 캡처", enabled: false },
];

/** 주 방식(첫 항목)은 큰 버튼, 나머지는 작은 텍스트 버튼. part로 둘을 따로 그릴 수 있어요. */
export function InputMethodPicker({
  methods = INPUT_METHODS,
  onSelect,
  disabled,
  part = "all",
}: {
  methods?: InputMethod[];
  onSelect: (id: InputMethodId) => void;
  disabled?: boolean;
  part?: "all" | "primary" | "rest";
}) {
  const [first, ...others] = methods.filter((method) => method.enabled);
  const primary = part === "rest" ? undefined : first;
  const rest = part === "primary" ? [] : others;
  return (
    <>
      {primary ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(primary.id)}
          className="min-h-13 w-full rounded-[10px] bg-primary px-5 text-base font-semibold text-primary-fg transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {primary.label}
        </button>
      ) : null}
      {rest.map((method) => (
        <button
          key={method.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(method.id)}
          className="min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
        >
          {method.label}
        </button>
      ))}
    </>
  );
}
