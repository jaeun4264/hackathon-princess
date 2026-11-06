import type { MessageRequest } from "../../lib/llm/message";
import type { Subscription } from "../../lib/types";

export const mockMessage: MessageRequest = { type: "cancel", usage: "rarely", service_name: "넷플릭스",
  params: { saving_monthly: 13500, saving_yearly: 162000 } };
export const mockConfirmedSubscription: Subscription = { id: "mock-subscription", service_id: "netflix", display_name: "넷플릭스",
  category: "영상", raw_name: "넷플릭스", amount: 13500, interval: "monthly", monthly_amount: 13500, next_date: null,
  usage: "often", confidence: 1, interpret_source: "catalog", needs_check: false, user_confirmed: false, evidence_transaction_ids: [] };
