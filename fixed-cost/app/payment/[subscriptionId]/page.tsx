import { PageHeader } from "@/components/PageHeader";

// S3 결제 상세 — F5에서 채워요. 알림에서 바로 들어올 수 있어 가드 없이 단독으로 읽혀야 해요.
export default function PaymentPage() {
  return (
    <main className="flex-1">
      <PageHeader title="결제 상세" />
    </main>
  );
}
