import services from "../data/catalog/services.json";
import benefits from "../data/catalog/benefits.json";
import bundles from "../data/catalog/bundles.json";
import { CatalogSchema } from "./schemas";
import type { Catalog } from "./types";

const files = {
  services: "services.json",
  benefits: "benefits.json",
  bundles: "bundles.json",
} as const;

function location(path: PropertyKey[]): string {
  const [collection, ...rest] = path;
  const file = files[collection as keyof typeof files] ?? "catalog";
  return file + rest.map((part) => typeof part === "number" ? `[${part}]` : `.${String(part)}`).join("");
}

export class CatalogValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`카탈로그 검증 실패\n${issues.join("\n")}`);
    this.name = "CatalogValidationError";
  }
}

// 파일 접근·네트워크 없는 검증 함수라 브라우저와 테스트에서도 사용할 수 있어요.
export function validateCatalog(input: unknown = { services, benefits, bundles }) {
  const parsed = CatalogSchema.safeParse(input);
  if (!parsed.success) {
    throw new CatalogValidationError(parsed.error.issues.map((issue) =>
      `${location(issue.path)}: ${issue.message}`));
  }

  const catalog = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  function checkIds(items: { id: string }[], path: PropertyKey[]) {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) errors.push(`${location([...path, index, "id"])}: 중복 id (${item.id})`);
      seen.add(item.id);
    });
  }
  checkIds(catalog.services, ["services"]);
  checkIds(catalog.benefits, ["benefits"]);
  checkIds(catalog.bundles, ["bundles"]);

  const serviceById = new Map(catalog.services.map((service) => [service.id, service]));
  const aliasOwners = new Map<string, string>();
  catalog.services.forEach((service, index) => {
    checkIds(service.plans, ["services", index, "plans"]);
    for (const alias of service.aliases) {
      const key = alias.trim().toLowerCase();
      const owner = aliasOwners.get(key);
      if (owner && owner !== service.id) {
        warnings.push(`${location(["services", index, "aliases"])}: 별칭 중복 (${alias}, ${owner} / ${service.id})`);
      } else {
        aliasOwners.set(key, service.id);
      }
    }
  });
  catalog.benefits.forEach((benefit, index) => {
    if (!serviceById.has(benefit.service_id)) {
      errors.push(`${location(["benefits", index, "service_id"])}: 없는 서비스 (${benefit.service_id})`);
    }
  });
  catalog.bundles.forEach((bundle, index) => {
    if (bundle.member_of !== null && !serviceById.has(bundle.member_of)) {
      errors.push(`${location(["bundles", index, "member_of"])}: 없는 멤버십 서비스 (${bundle.member_of})`);
    }
    bundle.includes.forEach((included, includedIndex) => {
      const service = serviceById.get(included.service_id);
      const path = ["bundles", index, "includes", includedIndex];
      if (!service) {
        errors.push(`${location([...path, "service_id"])}: 없는 서비스 (${included.service_id})`);
      } else if (!service.plans.some((plan) => plan.id === included.plan_id)) {
        errors.push(`${location([...path, "plan_id"])}: 해당 서비스에 없는 요금제 (${included.plan_id})`);
      }
    });
  });

  if (errors.length) throw new CatalogValidationError(errors);
  return { catalog, warnings };
}

export function loadCatalog(): Catalog {
  return validateCatalog().catalog;
}
