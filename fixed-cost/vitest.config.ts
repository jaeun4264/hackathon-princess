import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig의 "@/*" 경로와 같게 (컴포넌트를 테스트에서 불러올 때 필요)
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // tests/는 백엔드 소유, lib/client/__tests__/는 프론트 소유
    include: ["tests/**/*.test.ts", "lib/client/**/*.test.ts"],
  },
});
