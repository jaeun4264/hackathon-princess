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

export function matchAlias(rawName: string, catalog: { services: CatalogService[] }): CatalogService[] {
  const name = normalize(rawName);
  if (!name) return [];
  return catalog.services.filter((service) => service.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias.length > 0 && (normalizedAlias === name ||
      (Array.from(normalizedAlias).length >= 3 && name.includes(normalizedAlias)));
  }));
}

export function hasMatchingPrice(item: InterpretItem, service: CatalogService): boolean {
  return service.plans.some((plan) => plan.interval === item.interval && plan.price !== null && plan.price === item.amount);
}

export function buildCandidates(item: InterpretItem, catalog: { services: CatalogService[] }): CatalogService[] {
  return catalog.services.filter((service) => service.plans.some((plan) =>
    plan.interval === item.interval && (plan.price === null || plan.price === item.amount)));
}
