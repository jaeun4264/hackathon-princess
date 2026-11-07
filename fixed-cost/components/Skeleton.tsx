/** 로딩 자리 표시. 화면 읽기 프로그램에는 label을 읽어 줘요. */
export function Skeleton({ lines = 3, label = "불러오는 중이에요" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 px-4 py-4">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-line motion-reduce:animate-none" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
