import { z } from "zod";
import { IntervalSchema, InterpretResultSchema, TransactionSchema } from "../schemas";
import type { CatalogService } from "../types";
import { normalize } from "./normalize";

export const InterpretItemSchema = z.strictObject({
  key: InterpretResultSchema.shape.key,
  raw_name: TransactionSchema.shape.raw_name,
  amount: TransactionSchema.shape.amount,
  interval: IntervalSchema,
  payment_method: TransactionSchema.shape.payment_method,
});
export const InterpretRequestSchema = z.strictObject({ items: z.array(InterpretItemSchema).max(50) });
export type InterpretItem = z.infer<typeof InterpretItemSchema>;

// 결제 대행 표기 자체는 특정 구독 서비스의 증거가 아니에요. 실제 서비스명이 함께 있으면 별도로 매칭해요.
const paymentNames = ["카카오페이", "kakaopay", "네이버페이", "naverpay", "토스페이", "tosspay", "payco", "페이코",
  "apple", "애플", "google", "구글", "googleplay", "구글플레이", "googlepay", "구글페이", "appstore", "앱스토어", "itunes"];
const billingNoise = /정기\s*결제|자동\s*결제|결제|매월|\bbilling\b|\bpayment\b/giu;

function isPaymentLabel(label: string): boolean {
  return paymentNames.includes(normalize(label));
}

function removePaymentContext(rawName: string): string {
  return rawName
    .replace(/카카오\s*페이|네이버\s*페이|토스\s*페이|페이코|구글\s*플레이|구글\s*페이|구글|애플|앱\s*스토어/gu, " ")
    .replace(/(?<![a-z])(?:google\s*play|google\s*pay|app\s*store|kakao\s*pay|naver\s*pay|toss\s*pay|payco|apple|google|itunes)(?![a-z])/giu, " ");
}

function explicitLabel(label: string, rawName: string): boolean {
  const normalizedLabel = normalize(label);
  if (!normalizedLabel || isPaymentLabel(label)) return false;
  const cleaned = rawName.replace(billingNoise, " ");
  const name = normalize(cleaned);
  if (name === normalizedLabel) return true;
  if (/^[a-z]+$/u.test(normalizedLabel)) {
    // 다른 영문 상호 안의 우연한 부분 문자열은 서비스명이 명시된 것으로 보지 않아요.
    const words = label.toLowerCase().split(/[\s_-]+/u).map(normalize).filter(Boolean);
    return new RegExp(`(?<![a-z])${words.join("[\\s_-]*")}(?![a-z])`, "iu").test(cleaned);
  }
  if (Array.from(normalizedLabel).length >= 3) return name.includes(normalizedLabel);
  return cleaned.split(/[\s\p{P}\p{S}]+/u).some((word) => normalize(word) === normalizedLabel);
}

export function matchAlias(rawName: string, catalog: { services: CatalogService[] }): CatalogService[] {
  if (!normalize(rawName)) return [];
  const serviceContext = removePaymentContext(rawName);
  return catalog.services.filter((service) =>
    // 결제 사업자 이름을 포함한 구체적인 등록 상품명도 문맥상 서비스명이면 허용해요.
    explicitLabel(service.name, rawName) || explicitLabel(service.id, rawName) ||
    service.aliases.some((alias) => explicitLabel(alias, serviceContext)));
}

export function hasMatchingPrice(item: InterpretItem, service: CatalogService): boolean {
  return service.plans.some((plan) => plan.interval === item.interval && plan.price !== null && plan.price === item.amount);
}

export function buildCandidates(item: InterpretItem, catalog: { services: CatalogService[] }): CatalogService[] {
  return catalog.services.filter((service) => service.plans.some((plan) =>
    plan.interval === item.interval && (plan.price === null || plan.price === item.amount)));
}
