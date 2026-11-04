import { pathToFileURL } from "node:url";
import { validateCatalog } from "../lib/catalog";

export function runValidation(input?: unknown) {
  try {
    const { catalog, warnings } = validateCatalog(input);
    for (const warning of warnings) console.warn(`경고: ${warning}`);
    console.log(`카탈로그 검증 통과: 서비스 ${catalog.services.length}개, 혜택 ${catalog.benefits.length}개, 묶음 ${catalog.bundles.length}개`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "카탈로그 검증에 실패했어요");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runValidation();
}
