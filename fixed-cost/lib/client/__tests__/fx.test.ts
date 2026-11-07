import { describe, expect, it, vi } from "vitest";
import { FX_URL, fetchFxRates, toKrwPer } from "../fx";

describe("환율", () => {
  it("KRW 기준 응답을 1 외화당 원으로 바꿔요", () => {
    expect(toKrwPer({ base: "KRW", date: "2026-11-06", rates: { USD: 0.00073598, JPY: 0.11652, XXX: 1 } }))
      .toEqual({ date: "2026-11-06", krwPer: { USD: 1358.73, JPY: 8.58 } });
  });

  it("모양이 틀리면 null", () => {
    expect(toKrwPer({ base: "USD", date: "2026-11-06", rates: { KRW: 1358 } })).toBeNull();
    expect(toKrwPer({ base: "KRW", date: "어제", rates: { USD: 0.0007 } })).toBeNull();
    expect(toKrwPer(null)).toBeNull();
  });

  it("항상 같은 통화 목록만 요청해요 (사용자 정보 없음)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ base: "KRW", date: "2026-11-06", rates: { USD: 0.0008 } })));
    await fetchFxRates({ mock: false, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(FX_URL);
    expect(FX_URL).toBe("https://api.frankfurter.dev/v1/latest?base=KRW&symbols=USD,EUR,JPY,GBP");
  });

  it("네트워크 오류·서버 오류면 null (외화만 건너뛰고 계속)", async () => {
    expect(await fetchFxRates({ mock: false, fetchImpl: async () => { throw new TypeError("offline"); } })).toBeNull();
    expect(await fetchFxRates({ mock: false, fetchImpl: async () => new Response("", { status: 503 }) })).toBeNull();
  });
});
