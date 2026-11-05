import { assertServer, hashClientAddress } from "./server";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
export const IP_CALLS_PER_MINUTE = 20;

export function createRateLimiter(now: () => number = Date.now) {
  assertServer();
  let currentDay = -1;
  let dailyCount = 0;
  const clients = new Map<string, { minute: number; count: number }>();

  return {
    reserve(dailyCap: number, ip?: string): "ok" | "daily_limit" | "ip_limit" {
      assertServer();
      const timestamp = now();
      const day = Math.floor(timestamp / DAY_MS);
      const minute = Math.floor(timestamp / MINUTE_MS);
      if (day !== currentDay) { currentDay = day; dailyCount = 0; }
      for (const [key, entry] of clients) if (entry.minute !== minute) clients.delete(key);
      if (!Number.isSafeInteger(dailyCap) || dailyCap < 0 || dailyCount >= dailyCap) return "daily_limit";
      const key = hashClientAddress(ip);
      const entry = clients.get(key) ?? { minute, count: 0 };
      if (entry.count >= IP_CALLS_PER_MINUTE) return "ip_limit";
      // 동기적으로 예약해서 동시 호출과 재시도도 실제 요청마다 세어요.
      entry.count++;
      dailyCount++;
      clients.set(key, entry);
      return "ok";
    },
  };
}
