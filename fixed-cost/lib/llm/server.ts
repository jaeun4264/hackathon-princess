import { createHash } from "node:crypto";

// Node 내장 모듈 의존성으로 브라우저 번들에 포함되지 않게 해요.
export function isServerRuntime(): boolean {
  return typeof window === "undefined";
}

export function assertServer(): void {
  if (!isServerRuntime()) throw new Error("LLM 모듈은 서버 전용이에요");
}

export function hashClientAddress(ip?: string): string {
  assertServer();
  return createHash("sha256").update(ip || "unattributed").digest("hex");
}
