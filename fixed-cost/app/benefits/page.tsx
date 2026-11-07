import { PageHeader } from "@/components/PageHeader";
import { TabBar } from "@/components/TabBar";

// S4 혜택 찾기 — F6에서 채워요. 구독이 없어도 서비스 검색은 할 수 있어요.
export default function BenefitsPage() {
  return (
    <main className="flex-1">
      <PageHeader title="혜택 찾기" />
      <TabBar />
    </main>
  );
}
