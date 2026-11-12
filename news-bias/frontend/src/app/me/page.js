import { MyBiasDashboard } from "@/components/news/my-bias-dashboard";

export const metadata = { title: "내 읽기 편향 · 뉴스 편향도 분석" };

// 화면 4: 내 읽기 편향
export default function MePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">내 읽기 편향</h1>
        <p className="text-muted-foreground">
          이 사이트에서 읽은 기사를 바탕으로 내가 주로 어떤 목소리를 접했는지 보여 줍니다. 기록은 이 브라우저에만 저장됩니다.
        </p>
      </div>
      <MyBiasDashboard />
    </main>
  );
}
