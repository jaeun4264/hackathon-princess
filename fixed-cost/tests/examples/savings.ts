import { loadCatalog } from "../../lib/catalog";
import { buildSuggestions, summarize } from "../../lib/rules";
import type { Subscription } from "../../lib/types";

// 모두 가상 입력이에요. 티빙 금액은 관측 결제의 예시이며 실제 카탈로그 가격을 채우지 않아요.
const subs: Subscription[] = [["netflix", 13500], ["tving", 9500], ["icloud", 1100], ["daglo", 14900], ["goodnotes", 50500], [null, 6900]].map(([id, amount], i) => ({
  id: `mock-${i}`, service_id: id as string | null, display_name: "가상 구독", category: "기타", raw_name: id as string ?? "카카오페이",
  amount: amount as number, interval: id === "goodnotes" ? "yearly" : "monthly", monthly_amount: 0, next_date: null,
  usage: id === "daglo" ? "often" : "rarely", confidence: id === null ? 0.99 : 1, interpret_source: id === null ? "ai" : "catalog",
  needs_check: id === null, user_confirmed: false, evidence_transaction_ids: [],
}));
const input = { subs, benefitResults: [], catalog: loadCatalog(), today: "2026-11-05" };
const suggestions = buildSuggestions(input);
console.log(JSON.stringify({ summary: summarize(subs), suggestions: suggestions.map(({ type, subscription_ids, saving_monthly, saving_yearly, stale }) => ({ type, subscription_ids, saving_monthly, saving_yearly, stale })),
  potential_monthly: suggestions.reduce((sum, suggestion) => sum + suggestion.saving_monthly, 0) }, null, 2));
