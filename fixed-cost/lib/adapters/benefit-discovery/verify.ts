import { TransactionSchema } from "../../schemas";
import type { Catalog } from "../../types";
import { normalize } from "../../rules/normalize";
import { isStale } from "../../rules/stale";
import { officialUrl } from "./network";
import { extractBenefits, normalizeEvidence, pageText } from "./extract";
import type { BenefitCandidate, OfficialSource, PageEvidence } from "./types";

export function verifyBenefit(candidate: BenefitCandidate, page: PageEvidence, source: OfficialSource,
  catalog: Catalog, country: string, today: string): BenefitCandidate {
  const issues = [...candidate.issues];
  const extracted = extractBenefits(page, candidate.service_id).find((entry) => entry.id === candidate.id);
  if (!extracted || Object.entries(extracted).some(([key, value]) => !["status", "issues", "checked_at"].includes(key) &&
    JSON.stringify(candidate[key as keyof BenefitCandidate]) !== JSON.stringify(value))) issues.push("extraction_mismatch");
  const original = pageText(page.html);
  const service = catalog.services.find((entry) => entry.id === candidate.service_id);
  try {
    if (source.service_id !== candidate.service_id || officialUrl(page.final_url, source.hosts).href !== candidate.source_url ||
      !source.evidence_url || !TransactionSchema.shape.date.safeParse(source.verified_at).success || source.verified_at > today) issues.push("untrusted_source");
    officialUrl(page.requested_url, source.hosts);
    officialUrl(source.evidence_url, source.hosts);
  } catch { issues.push("untrusted_source"); }
  if (!service || !candidate.service_name || ![service.id, service.name, ...service.aliases].some((name) => normalize(name) === normalize(candidate.service_name!))) issues.push("service_mismatch");
  for (const [field, quote] of Object.entries(candidate.quotes)) {
    if (field === "school" && candidate.kind !== "school_license") continue;
    if (!quote.trim() || !original.includes(normalizeEvidence(quote))) issues.push(`quote_${field}`);
  }
  if (!candidate.kind || !candidate.name || !candidate.conditions || !candidate.interval) issues.push("missing_fields");
  if (candidate.kind === "school_license" && !candidate.school) issues.push("missing_school");
  if (candidate.kind === "student_discount" && !/학생|재학|student/iu.test(candidate.conditions ?? "")) issues.push("unclear_eligibility");
  if (candidate.country !== country) issues.push("country_mismatch");
  if (!candidate.country || !/^[A-Z]{2}$/u.test(candidate.country) ||
    !new RegExp(`(?<![A-Z])${candidate.country}(?![A-Z])`, "u").test(original)) issues.push("country_quote_unverified");
  if (candidate.currency !== "KRW") issues.push("unsupported_currency");
  if (candidate.price === null) issues.push("missing_price");
  if (candidate.price !== null && (!Number.isSafeInteger(candidate.price) || candidate.price < 0 || candidate.price > Math.floor(Number.MAX_SAFE_INTEGER / 12))) issues.push("unsafe_price");
  const priceQuote = candidate.quotes.price;
  const amounts = [...priceQuote.matchAll(/(?<![\d,])((?:[1-9]\d{0,2}(?:,\d{3})+|0|[1-9]\d*))\s*(?:KRW\b|원)/gu)].map((match) => Number(match[1].replaceAll(",", "")));
  if (amounts.length !== 1 || amounts[0] !== candidate.price) issues.push("price_mismatch");
  if (candidate.interval === "monthly" ? !/월|monthly/iu.test(priceQuote) : !/연|yearly|annual/iu.test(priceQuote)) issues.push("period_mismatch");
  if (candidate.tax_included !== true || !/VAT\s*포함|세금\s*포함|VAT included/iu.test(priceQuote)) issues.push("tax_unverified");
  const billingText = `${priceQuote} ${candidate.conditions ?? ""}`;
  if (/첫|체험|최저|부터|trial|first|starting/iu.test(billingText)) issues.push("introductory_price");
  if (/선납|약정|일시불|prepay|commitment/iu.test(billingText)) issues.push("unsupported_billing_terms");
  if (!candidate.source_updated_at || !TransactionSchema.shape.date.safeParse(candidate.source_updated_at).success ||
    isStale(candidate.source_updated_at, today)) issues.push("stale_source");
  if (!candidate.observed_at || candidate.observed_at !== page.fetched_at ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(page.fetched_at) || page.fetched_at.slice(0, 10) !== today) issues.push("stale_fetch");
  if (candidate.valid_until !== null && (!TransactionSchema.shape.date.safeParse(candidate.valid_until).success || candidate.valid_until < today)) issues.push("expired");
  const unique = [...new Set(issues)];
  return { ...structuredClone(candidate), issues: unique, status: unique.length ? "unverified" : "verified", checked_at: unique.length ? null : today };
}
