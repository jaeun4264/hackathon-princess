import { loadCatalog } from "../../lib/catalog";
import { detectSubscriptionCandidates, monthlyEquivalent } from "../../lib/rules";
import { TransactionSchema } from "../../lib/schemas";
import example from "../fixtures/detect-example.json";

// 테스트 전용 가상 데이터만 출력하며 실제 결제 내역을 읽지 않아요.
if (!example._mock) throw new Error("가상 데이터 표시가 필요해요");
const transactions = TransactionSchema.array().parse(example.transactions);
const candidates = detectSubscriptionCandidates(transactions, loadCatalog());
console.log(JSON.stringify({
  input: transactions,
  candidates,
  yearly_monthly_example: monthlyEquivalent(50500, "yearly"),
}, null, 2));
