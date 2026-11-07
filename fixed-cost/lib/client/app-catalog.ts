// 화면이 쓰는 카탈로그. 실제 모드는 data/catalog 그대로, 모의 모드에서만 프론트용 가짜 혜택을 더해요.
// (lib/catalog.ts는 mock 파일을 절대 import하지 않는 백엔드 규칙을 지키려고 프론트 쪽에서 합쳐요.)
import { loadCatalog } from "../catalog";
import { CatalogBenefitSchema } from "../schemas";
import type { Catalog } from "../types";
import mockBenefits from "../mocks/catalog-benefits.json";

let cached: { mock: boolean; catalog: Catalog } | null = null;

export function appCatalog(mock: boolean = process.env.NEXT_PUBLIC_USE_MOCK === "1"): Catalog {
  if (cached && cached.mock === mock) return cached.catalog;
  const base = loadCatalog();
  const catalog = mock ? { ...base, benefits: [...base.benefits, ...CatalogBenefitSchema.array().parse(mockBenefits.benefits)] } : base;
  cached = { mock, catalog };
  return catalog;
}
