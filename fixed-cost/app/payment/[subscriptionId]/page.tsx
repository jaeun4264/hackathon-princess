import { PaymentScreen } from "@/components/PaymentScreen";

// S3 결제 상세 (/payment/[subscriptionId]) — 결제 알림에서 바로 들어올 수 있어 가드 없이 단독으로 읽혀요.
export default function PaymentPage() {
  return <PaymentScreen />;
}
