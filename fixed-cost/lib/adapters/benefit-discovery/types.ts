import type { Catalog } from "../../types";

export interface SearchHit { url: string; title?: string; snippet?: string }
export interface SearchProvider {
  search(input: { query: string; country: string; officialDomains: string[]; signal: AbortSignal }): Promise<SearchHit[]>;
}
export interface PageEvidence { requested_url: string; final_url: string; html: string; fetched_at: string }
export interface OfficialPageFetcher { fetch(url: string, hosts: string[]): Promise<PageEvidence> }
// 운영자가 공식 소유 관계를 확인한 서버 설정이에요. 검색 결과에서 생성하지 않아요.
export interface OfficialSource { service_id: string; hosts: string[]; verified_at: string; evidence_url: string }
export type DiscoveryKind = "student_discount" | "school_license" | "plan_discount";
export interface BenefitCandidate {
  id: string; service_id: string; service_name: string | null; name: string | null; kind: DiscoveryKind | null;
  price: number | null; currency: string | null; country: string | null; interval: "monthly" | "yearly" | null;
  tax_included: boolean | null; school: string | null; conditions: string | null; source_url: string; source_updated_at: string | null;
  valid_until: string | null; observed_at: string | null; checked_at: string | null; page_hash: string | null;
  quotes: { service: string; name: string; price: string; country: string; conditions: string; updated: string; school: string };
  status: "verified" | "unverified"; issues: string[];
}
export interface DiscoveryReport {
  status: "complete" | "partial" | "search_failed" | "no_results" | "unconfigured";
  country: string; candidates: BenefitCandidate[]; verified: BenefitCandidate[];
  errors: { service_id: string; code: string }[];
}
export interface DiscoveryOptions {
  catalog: Catalog; sources: OfficialSource[]; search: SearchProvider; pages: OfficialPageFetcher;
}
