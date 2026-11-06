# B8.5 혜택 자동 탐색 및 검증 — 계획만

> 진행 상태: B8.5-A의 검색 인터페이스·보안 페이지 조회·제한된 구조화 추출·검증·카탈로그 투영은 `lib/adapters/benefit-discovery/`에 구현했어요. 아래는 B8 당시의 전체 계획이며, 실제 검색 제공업체·실사이트 연결·영속 저장·예약 갱신은 여전히 B8.5-B의 미구현 작업이에요. 현재 범위와 제약은 해당 폴더 README를 참고해요.

이 문서는 구현된 기능이 아니에요. B8 병합 직후, B9 전에 별도 브랜치·PR로 개발할 제안이에요. 이번 PR에는 검색 어댑터·수집기·새 API·스케줄러·저장소를 구현하지 않아요.

## 기존 명세와 차이

첨부 개발 PRD의 데이터 설계는 서비스·혜택·묶음 카탈로그를 팀 수작업으로 수집해 JSON에 저장하도록 명시해요. F5의 "검색"은 서비스에 맞는 혜택을 찾는 화면과 카탈로그 조회이며 인터넷 수집 작업은 정의하지 않아요. BACKEND.md도 공식 조건 원문·출처·확인일은 사람이 채우도록 되어 있어요.

BACKEND_PROMPTS의 B9는 익명 집계, B10은 평가, B11은 사람이 입력한 묶음 비교, B12는 시연 백업·보호 장치·CI예요. 어느 단계에도 자동 웹 탐색은 없어요. 따라서 자동 추천이라는 추가 제품 요구사항을 충족하려면 B8.5가 필요해요. 사용자는 확정 구독과 프로필만 제공하고 시스템이 탐색·검증을 담당하도록 설계해야 해요.

## 제안 흐름

1. B5 confirmed_service_id가 있는 구독만 입력으로 받아 서비스 ID와 국가·필요한 학교 범위로 검색 계획을 만들어요. 거래 원문·이메일·카드 정보·프로필 전체를 검색어로 보내지 않아요. 미확정 후보는 특정 서비스 검색·절약 계산에서 제외해요.
2. SearchProvider로 공식 서비스·학교 홈페이지 후보 URL을 찾아요. 검색 결과 요약·순위·AI 답변은 증거가 아니에요. 서비스별 공식 도메인과 학교 도메인 근거는 별도 검증 설정에 두고 B3 email_domains를 공식 웹사이트 목록으로 오용하지 않아요.
3. OfficialPageFetcher가 실제 공식 페이지와 리디렉션 최종 주소를 가져와요. HTTPS·도메인 경계·공식성·HTTP 상태·최종 URL을 검사하고 사설 IP/메타데이터 주소·리디렉션 SSRF·과도한 크기를 차단해요. 약관·robots·인증 요구를 확인하고 제한된 동시성·시간 제한·재시도·사용 한도를 둬요. 공식 페이지의 JSON-LD/HTML과 결정적 파서로 수집하고 필요한 경우 제한된 브라우저 렌더러를 별도 교체 가능하게 둬요. 기존 AGENTS의 AI 사용 범위는 T1~T3이므로 새 추출 LLM은 이번 계획의 기본안에 넣지 않아요.
4. 가격·통화·결제 주기·세금 포함 여부·첫 기간/정상 요금·국가·기간·요금제·학교·자격 조건·공식 원문 인용을 추출해요. 각 필드는 페이지 URL·원문 위치/문장·수집 시각·본문 해시로 추적해요. 검색 날짜를 검증 완료일로 쓰지 않아요.
5. 서비스 참조·국가·KRW·주기·가격 정수·조건 인용·공식성·기간과 정보 간 모순을 검사해요. 외화나 첫 기간 요금의 장기 절약액을 임의 환산하지 않아요. 공식 가격을 확인하지 못했으면 null로 남겨 계산하지 않아요. 국가·필수 조건이 불확실하면 verified로 승격하지 않아요. 변경 감지·충돌은 미검증/재확인 큐로 보내요. 자동 검증 기준을 충족한 자료만 승격하고, 애매한 건 사용자가 직접 등록하게 하지 않고 시스템의 보류/운영 검토로 남겨요.
6. 후보 저장소와 검증된 스냅샷을 분리해요. Candidate → verified/rejected/needs_review, 별도로 stale/expired 상태와 검증 버전을 기록해요. 스냅샷은 버전별 원자적 교체·롤백·중복 제거를 지원해요. 검증이 끝난 레코드만 B1 호환 CatalogBenefit으로 투영해 B7에 주고, B7 yes와 확정 구독을 B6에 연결한 뒤 B8 문장을 만들어요.
7. 예약 갱신과 변경 감지를 수행해요. 가격·조건이 바뀌면 B7 캐시를 무효화하고 계산을 다시 해요. 검색/수집 실패 시 마지막 검증 데이터를 남기되 확인일을 갱신하지 않고 stale을 표시해요. 마지막 검증 값도 없으면 '검색 실패/미검증 후보/혜택 없음'을 구분하며 새 혜택이나 절약액을 생성하지 않아요.

## 필요한 인터페이스 제안 — 런타임 코드 아님

```ts
interface SearchProvider {
  search(input: { query: string; country: string; officialDomains: string[]; signal: AbortSignal }): Promise<SearchHit[]>;
}
interface OfficialPageFetcher {
  fetch(url: string, signal: AbortSignal): Promise<PageEvidence>;
}
interface BenefitExtractor {
  extract(page: PageEvidence): Promise<BenefitCandidate[]>;
}
interface BenefitVerifier {
  verify(candidate: BenefitCandidate, evidence: PageEvidence[]): VerificationResult;
}
interface VerifiedCatalogRepository {
  getSnapshot(): Promise<VerifiedCatalogSnapshot>;
  publish(snapshot: VerifiedCatalogSnapshot): Promise<void>;
}
```

SearchHit는 URL과 검색 메타데이터이며 검증된 혜택이 아니에요. PageEvidence는 요청/최종 URL·공식 도메인 근거·HTTP/수집 시각·본문 해시·인용을 보관해요. BenefitCandidate는 서비스/상품 ID·후보 가격/통화/주기·국가·자격·근거와 검증 상태를 가져요. 검증 레코드는 필드별 검증 결과와 가격 확인 여부를 포함하고, 자격 조건 검증과 가격 검증은 분리해요. VerifiedCatalogSnapshot은 기존 Catalog와 국가/원가/근거/버전 sidecar로 구성해요. 이 타입들은 아직 정의·구현하지 않았어요.

## 기존 코드 변경 예상

| 기존 단계 | 재사용·필요 변경 |
| --- | --- |
| B1 | validateCatalog와 CatalogBenefit 유지 가능. 국가·통화·검증 상태·가격 근거·검증 버전은 sidecar에 추가하고 검증된 학생/학교 혜택만 기존 형태로 투영. 기본 정적 JSON 로더는 유지하고 서버 주입부에 검증 스냅샷 저장소 연결 필요. |
| B2~B4 | 탐지·입력·LLM 클라이언트 재작성 불필요. 검색 제공업체는 LLM과 별도 인터페이스로 둠. |
| B5 | 확정 ID 출력 재사용. 미확정 후보를 자동 서비스로 승격하지 않음. |
| B6 | 학생/학교 혜택 차액 함수 재사용. 일반 요금제 할인·첫 기간/정상 요금·국가 조건은 현재 계약에 없어 별도 정규화/규칙이 필요. 기존 student_discount로 억지 매핑하지 않음. |
| B7 | getCatalog 주입으로 검증된 동적 스냅샷 연결 가능. 국가·요금제·인증 완료 등 현재 UserProfile에 없는 정보는 검색/검증 계층에서 제한하고, 개인별 판정에 꼭 필요하면 별도 [계약] PR로 확장. 기존 체크일/조건 기반 캐시 재사용. |
| B8 | 문장 생성과 buildRecommendationMessages 재사용. 새 추천 종류를 추가하는 경우 템플릿·금액 규칙·계약 테스트 추가. 기존 /api/message는 증빙 ID가 없어 출처 인증을 하지 못하므로 end-to-end API가 필요하면 B8.5에서 검증 스냅샷/제안 참조 계약을 추가. |

결론적으로 기존 계산·판정 로직을 대부분 유지할 수 있지만 단순 검색 함수 하나의 추가로 끝나지는 않아요. 후보/검증 저장소·증거 수집·갱신 작업과 서버의 카탈로그 조립부는 새로 필요해요. 현재 브라우저 카탈로그는 정적 import이므로 런타임 갱신을 화면에도 전달하려면 이후 읽기 전용 스냅샷 API와 프론트 연동이 필요해요. 이번에는 프론트를 수정하지 않아요. 일반 요금제 할인/국가별 가격까지 지원하려면 공유 타입·스키마·양쪽 계약 문서의 승인된 확장이 필요해요.

## 검색 방식 조사 (2026-11-06)

- [Brave Search 공식 API 문서](https://api-dashboard.search.brave.com/app/documentation/web-search): 웹 결과와 site: 검색을 제공해요. 검색 결과로 URL을 찾고 공식 페이지는 별도로 가져와 검증하는 방식의 우선 후보예요.
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)와 [Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract): 도메인 제한 검색과 페이지 추출을 조합할 수 있는 대안이에요. 제공업체의 요약이나 추출 결과도 공식 원문과 대조해야 해요.
- [Google Custom Search JSON API 공지](https://developers.google.com/custom-search/v1/overview?hl=en): 신규 고객에 닫혀 있고 기존 고객도 2027-01-01까지 대체 서비스로 전환해야 한다고 안내하므로 신규 기본안으로 잡지 않아요.
- 공식 도메인·혜택 URL·사이트맵을 이미 알고 있으면 직접 정기 수집해 검색 호출을 줄일 수 있어요. 하지만 알려지지 않은 새 혜택 발견까지 충족하려면 실제 검색 API가 필요해요. 검색 결과 HTML을 무단 크롤링하는 방식을 기본안으로 삼지 않아요.

위 제공업체는 후보이며 계정·가격·키·약관·한국어/한국 지역 검색 품질을 비교한 뒤 확정해야 해요. 이번 작업은 공식 문서 조사만 했고 검색 제공업체 유료 API를 연결/호출하지 않았어요. 런타임 검색 키는 서버 측 비밀 설정으로만 보관하고 브라우저·저장소에 넣지 않아요.

## B8.5 완료 기준 제안

실제 검색 어댑터와 Mock을 분리하고, 확인 구독 자동 검색→공식 페이지→필드별 검증→검증 스냅샷→B7→B6→B8의 통합 테스트를 통과해야 해요. 비공식 도메인·외국 요금·가격 누락·변경/만료·상충 조건·없는 혜택·429·타임아웃·접근 거부·JS 전용 페이지·SSRF를 검사해요. 검색 장애를 '혜택 없음'으로 오인하지 않고 미검증 후보가 계산/추천으로 유입되지 않아야 해요. 실제 연결과 배포 갱신 방식은 B8.5의 별도 작업이며 B9를 먼저 시작하지 않아요.
