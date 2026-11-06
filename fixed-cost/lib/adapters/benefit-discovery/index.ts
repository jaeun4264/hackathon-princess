export { createBenefitDiscovery, confirmedServiceIds } from "./engine";
export { createSecurePageFetcher } from "./network";
export { createBraveSearchProvider, SearchError } from "./brave";
export { createConfiguredLiveDiscovery, createLiveDiscoveryService } from "./live";
export type { SearchProvider, SearchHit, OfficialPageFetcher, PageEvidence, OfficialSource, BenefitCandidate, DiscoveryReport, DiscoveryOptions } from "./types";
