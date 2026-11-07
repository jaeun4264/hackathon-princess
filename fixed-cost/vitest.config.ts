import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // tests/는 백엔드 소유, lib/client/__tests__/는 프론트 소유
    include: ["tests/**/*.test.ts", "lib/client/**/*.test.ts"],
  },
});
