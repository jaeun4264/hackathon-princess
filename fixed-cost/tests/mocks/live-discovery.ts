import { randomUUID } from "node:crypto";
import { loadCatalog } from "../../lib/catalog";
import { createBraveSearchProvider } from "../../lib/adapters/benefit-discovery/brave";
import { publicBenefitQuery } from "../../lib/adapters/benefit-discovery/query";
import { createConfiguredLiveDiscovery } from "../../lib/adapters/benefit-discovery/live";
import { createSecurePageFetcher } from "../../lib/adapters/benefit-discovery/network";
import { mockPage, mockResponse, mockSource, MOCK_OFFICIAL_URL, DISCOVERY_TODAY } from "./discovery";

export function mockSearchEnvironment() {
  // 실행 시 생성한 무작위 문자열이며 실제 인증 정보가 아니에요.
  return { BRAVE_SEARCH_API_KEY: randomUUID(), BENEFIT_DISCOVERY_LIVE: "1" } as { [key: string]: string | undefined };
}
export const braveJson = (urls = [MOCK_OFFICIAL_URL]) => ({ web: { results: urls.map((url) => ({ url, title: "가상 결과", description: "검색 요약의 가상 무료 주장" })) } });
export const jsonResponse = (body: unknown, status = 200, headers: { [key: string]: string } = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
export const searchInput = () => ({ query: publicBenefitQuery("넷플릭스"), country: "KR", officialDomains: mockSource.hosts, signal: new AbortController().signal });
export const mockClock = () => Date.parse(`${DISCOVERY_TODAY}T01:00:00Z`);
export function mockBrave(fetch: typeof globalThis.fetch) {
  const environment = mockSearchEnvironment(); let timestamp = mockClock();
  const provider = createBraveSearchProvider({ serviceNames: loadCatalog().services.map((service) => service.name), environment: () => environment, fetch, now: () => timestamp });
  return { provider, environment, advance: (ms: number) => { timestamp += ms; } };
}
export function mockLive(fetch: typeof globalThis.fetch, overrides: Partial<Parameters<typeof createConfiguredLiveDiscovery>[0]> = {}) {
  const environment = mockSearchEnvironment(); let timestamp = mockClock();
  const pages = createSecurePageFetcher({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], transport: async () => mockResponse(mockPage().html), now: () => new Date(timestamp) });
  const service = createConfiguredLiveDiscovery({ sources: [mockSource], catalog: { ...loadCatalog(), benefits: [] }, environment: () => environment, fetch, now: () => timestamp, pages, ...overrides });
  return { service, environment, advance: (ms: number) => { timestamp += ms; } };
}
