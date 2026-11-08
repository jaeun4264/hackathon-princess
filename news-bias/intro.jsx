import Link from "next/link";

// 첫 화면 위쪽의 서비스 소개
const STEPS = [
  { title: "이슈 고르기", body: "분야별로 같은 사건을 다룬 기사를 모은 이슈를 고릅니다." },
  { title: "언론사별로 비교하기", body: "기사마다 누구의 말을 인용했는지, 어떤 인용이 없는지, 평가가 담긴 표현은 무엇인지 확인합니다." },
  { title: "내 읽기 편향 확인하기", body: "원문을 읽은 기사가 쌓이면 내가 주로 접한 목소리와 덜 접한 목소리를 매주 정리해 보여 줍니다." },
];

export function Intro() {
  return (
    <section className="flex flex-col gap-6 rounded-2xl border bg-muted/40 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">같은 사건, 다른 목소리</h1>
        <p className="text-muted-foreground">
          사회·경제·생활 뉴스까지, 같은 사건을 다룬 기사를 언론사별로 모아 각 기사가 누구의 말을 담았는지 비교합니다.
        </p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{s.title}</span>
              <span className="text-sm text-muted-foreground">{s.body}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        이 서비스는 기사를 판정하지 않습니다. 같은 이슈를 다룬 기사끼리 비교해 보여 드립니다.{" "}
        <Link href="/me" className="underline underline-offset-2">
          내 읽기 편향 보기
        </Link>
      </p>
    </section>
  );
}
