// 외화 영수증 환산용 환율. Frankfurter(유럽중앙은행 기준, 무료·키 없음)에서 받아요.
// - 항상 같은 통화 목록을 요청해서, 요청만으로 사용자가 어떤 영수증을 가졌는지 드러나지 않게 해요.
// - 결제 내역·메일 내용은 보내지 않아요. 실패하면 null → 외화 영수증은 예전처럼 건너뛰어요.
import { FOREIGN_CURRENCIES, type ForeignCurrency, type FxRates } from "../adapters/gmail";
import fxMock from "../mocks/fx.json";

export const FX_URL = `https://api.frankfurter.dev/v1/latest?base=KRW&symbols=${FOREIGN_CURRENCIES.join(",")}`;
export const FX_SOURCE_LABEL = "유럽중앙은행 기준 환율";
const FX_TIMEOUT_MS = 8_000;

/** 응답 {base:'KRW', date, rates:{USD:0.000736,...}} → 1 외화당 원 (소수 둘째 자리). */
export function toKrwPer(body: unknown): FxRates | null {
  if (typeof body !== "object" || body === null) return null;
  const { base, date, rates } = body as { base?: unknown; date?: unknown; rates?: Record<string, unknown> };
  if (base !== "KRW" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof rates !== "object" || rates === null) return null;
  const krwPer: FxRates["krwPer"] = {};
  for (const currency of FOREIGN_CURRENCIES) {
    const perKrw = rates[currency];
    if (typeof perKrw === "number" && perKrw > 0 && Number.isFinite(perKrw)) {
      krwPer[currency as ForeignCurrency] = Math.round((1 / perKrw) * 100) / 100;
    }
  }
  return Object.keys(krwPer).length > 0 ? { date, krwPer } : null;
}

export async function fetchFxRates(options: { mock?: boolean; fetchImpl?: typeof fetch } = {}): Promise<FxRates | null> {
  const mock = options.mock ?? process.env.NEXT_PUBLIC_USE_MOCK === "1";
  if (mock) return { date: fxMock.date, krwPer: fxMock.krwPer };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FX_TIMEOUT_MS);
  try {
    const response = await fetchImpl(FX_URL, { signal: controller.signal });
    if (!response.ok) return null;
    return toKrwPer(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
