import { BenefitResultSchema, CatalogSchema, SuggestionSchema } from "../schemas";
import type { BenefitResult, Catalog, CatalogService, Subscription, Suggestion, SuggestionType } from "../types";
import { DEFAULT_MESSAGES, fillPlaceholders } from "./messages";
import { checkedSubscriptions } from "./summary";
import { isStale } from "./stale";

// B5의 AI 후보는 service_id에 들어가지 않아요. 과거 소비자가 넣은 AI ID도 재확인 전에는 사용하지 않아요.
function isConfirmed(sub: Subscription): boolean {
  return sub.service_id !== null && !sub.needs_check &&
    (sub.interpret_source === "catalog" || sub.user_confirmed);
}

function suggestion(sub: Subscription, service: CatalogService | undefined, type: SuggestionType, saving: number,
  today: string, extra: { id?: string; source_url?: string; checked_at?: string; alt_name?: string; stale?: boolean } = {}): Suggestion {
  const checkedAt = extra.checked_at ?? service?.checked_at ?? null;
  return SuggestionSchema.parse({
    id: JSON.stringify([type, sub.id, extra.id ?? null]), type, subscription_ids: [sub.id],
    saving_monthly: saving, saving_yearly: saving * 12,
    message: fillPlaceholders(DEFAULT_MESSAGES[type], { service_name: service?.name ?? sub.display_name,
      alt_name: extra.alt_name ?? "", saving_monthly: saving, saving_yearly: saving * 12 }),
    message_source: "fallback", source_url: extra.source_url ?? null, checked_at: checkedAt,
    stale: extra.stale ?? isStale(checkedAt, today), is_partner: false, cancel_url: service?.cancel_url ?? null,
    action_status: "none", keep_reason: null,
  });
}

export function buildSuggestions(input: { subs: Subscription[]; benefitResults: BenefitResult[]; catalog: Catalog; today: string }): Suggestion[] {
  isStale(null, input.today);
  const catalog = CatalogSchema.parse(input.catalog);
  const subs = checkedSubscriptions(input.subs);
  const results = BenefitResultSchema.array().parse(input.benefitResults);
  const output: Suggestion[] = [];
  for (const sub of subs) {
    const service = catalog.services.find((entry) => entry.id === sub.service_id);
    if (!service || !isConfirmed(sub)) continue;
    if (sub.usage === "rarely") {
      // 무료 체험(0원)은 아직 나가는 돈이 없어 '0원 절약' 제안을 만들지 않아요. 체험 종료 안내는 화면이 따로 보여 줘요.
      if (sub.monthly_amount > 0) output.push(suggestion(sub, service, "cancel", sub.monthly_amount, input.today));
    } else if (sub.usage === "often") {
      const alternatives: Suggestion[] = [];
      for (const benefit of catalog.benefits.filter((entry) => entry.service_id === service.id)) {
        const matches = results.filter((entry) => entry.kind === "benefit" && entry.id === benefit.id);
        // 중복 판정이 모순되거나 다른 버전의 조건이면 채택하지 않아요.
        if (!matches.length || matches.some((entry) => entry.eligible !== "yes" || entry.validation !== "ok" ||
          entry.missing_info.length > 0 || entry.checked_at !== benefit.checked_at || entry.source_url !== benefit.source_url ||
          !entry.quoted_conditions.length || entry.quoted_conditions.some((quote) => !quote.trim() ||
            !benefit.conditions.replace(/\s+/gu, " ").includes(quote.replace(/\s+/gu, " "))))) continue;
        if (!benefit.conditions.trim() || !benefit.source_url || !benefit.checked_at || benefit.price_after_monthly === null) continue;
        const saving = sub.monthly_amount - benefit.price_after_monthly;
        if (!Number.isSafeInteger(saving) || saving <= 0) continue;
        alternatives.push(suggestion(sub, service, benefit.kind, saving, input.today, {
          id: benefit.id, source_url: benefit.source_url, checked_at: benefit.checked_at, alt_name: benefit.benefit_text,
          stale: isStale(benefit.checked_at, input.today) || matches.some((entry) => entry.stale),
        }));
      }
      // 같은 지출에 할인을 겹치지 않고 절약액이 가장 큰 한 가지를 골라요.
      alternatives.sort((a, b) => b.saving_monthly - a.saving_monthly || a.id.localeCompare(b.id));
      output.push(alternatives[0] ?? suggestion(sub, service, "keep", 0, input.today));
    }
  }
  return output.sort((a, b) => b.saving_monthly - a.saving_monthly || a.id.localeCompare(b.id));
}

export function makePauseSuggestion(sub: Subscription, today: string): Suggestion {
  const [checked] = checkedSubscriptions([sub]);
  if (!isConfirmed(checked)) throw new Error("서비스를 먼저 확인해 주세요");
  return suggestion(checked, undefined, "pause", checked.monthly_amount, today);
}
