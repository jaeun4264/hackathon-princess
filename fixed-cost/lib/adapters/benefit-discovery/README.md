# B8.5-A 자동 탐색·검증 엔진

서버 전용 엔진은 사용자가 혜택을 직접 등록하는 대신 확정 서비스 ID에서 검색어를 만들고 검색→공식 페이지→추출→검증을 실행해요. SearchProvider와 OfficialPageFetcher를 주입해 제공업체를 분리했어요. 실제 검색 제공업체·가입·키·유료 API 호출·스케줄러·HTTP 검색 엔드포인트는 이번에 추가하지 않았고 실행 검증은 전부 Mock이에요.

## 입력과 검증

confirmedServiceIds(B5 resolutions)는 미확정 후보를 제외해요. discover({confirmed_service_ids,country,today})는 등록 서비스인지 검사하지만 임의 배열의 사용자 확인 이력을 인증하지는 않아요. 호출자는 서버가 확인한 ID를 전달해야 해요. 검색어는 카탈로그 서비스명과 일반 혜택 키워드뿐이며 거래·프로필·이메일은 보내지 않아요.

공식 소유 관계를 확인한 서버 설정 OfficialSource(service_id/hosts/verified_at/evidence_url)가 없으면 unconfigured로 보류해요. 이는 혜택의 사용자 수집이 아니라 도메인 소유 관계의 신뢰 설정이에요. B3 email_domains를 웹 도메인으로 간주하거나 검색 결과에서 공식 도메인을 추측하지 않아요. 검색 title/snippet은 근거로 쓰지 않아요.

현재 추출기는 application/ld+json의 Product/Service(배열/@graph 포함)와 Offer를 읽고 비스크립트 HTML 본문과 인용을 대조해요. 지원 필드는 Product name/brand.name/category/description/dateModified/audience.name와 Offer price/priceCurrency/eligibleRegion/priceValidUntil, priceSpecification unitCode(MON/ANN)/description/valueAddedTaxIncluded예요. category는 student_discount/school_license/plan_discount 명시값만 지원해요. 임의 사이트를 모두 해석하는 완성 수집기는 아니며 다른 DOM·JS 전용 페이지는 unsupported_page 후보로 남겨요. HTML 텍스트 검사는 브라우저 가시성·의미적 진실까지 증명하지 않아요.

서비스명·혜택명·조건·학교·국가·갱신일·가격 구문을 원문과 비교해요. 가격은 월/연·KRW/원·VAT 포함이 명시된 인용과 숫자를 정확히 대조하며 KR을 KRW의 부분 문자열로 인정하지 않아요. 첫 기간/체험/최저 가격·선납/약정, 외화, 가격 누락·불일치, 국가 불일치, 갱신 후 30일 초과·미래일, 만료, 본문 밖 조건은 unverified예요. 갱신일이 오래됐지만 실제로 유효한 페이지도 보수적으로 보류될 수 있어요. 실제 조회일과 검증 날짜가 다르면 새 확인일로 재발행하지 않아요.

## 후보·검증 결과·기존 단계

BenefitCandidate에 서비스/혜택명·종류·가격·통화·국가·주기·세금·학교·조건·URL·원문 갱신일·관측일·인용·본문 SHA-256·상태/오류를 저장해요. checked_at은 검증 통과 시에만 채워요. verified 배열은 통과한 레코드만 포함해요. 엔진은 비공개 원문 증거를 보유하고 같은 엔진이 발행한 변조되지 않은 보고서만 toVerifiedCatalog로 재검증·투영해요. JSON 직렬화 복사본은 승격할 수 없어요. 영속 스냅샷의 증거 저장·재검증은 B8.5-B 과제예요.

중복 혜택은 제거하고 가격·조건 충돌은 모두 보류해요. 검증된 학생/학교 혜택만 기존 CatalogBenefit으로 투영해 B1 validateCatalog를 다시 적용하고 월 환산은 기존 B2 함수를 사용해요. 일반 요금제 할인은 별도 검증 레코드로 남기며 B1의 student_discount로 위장하지 않아요. B7 getCatalog와 B6 buildSuggestions를 그대로 재사용해요. 공유 types.ts/schemas.ts·실제 카탈로그·B1~B8 로직은 변경하지 않았고 새 메타데이터는 별도 타입에 있어요.

상태는 complete/partial/search_failed/no_results/unconfigured를 구분해요. 실패를 혜택 없음으로 표시하지 않고 이전 확인일을 갱신하지 않아요. 현재 영속 저장·과거 동적 스냅샷 폴백은 없으며 기존 기본 카탈로그만 보존해요.

## 요청 보안과 한도

HTTPS·정확한 허용 호스트·기본 포트·TLS 인증서 검증을 강제하고 IP URL·인증정보·허용 외 호스트를 거부해요. 모든 DNS 주소가 공인인지 검사하고 실제 연결 IP를 고정해 DNS 재바인딩을 막아요. TLS는 원래 호스트로 검증해요. 내부망·루프백·메타데이터·링크 로컬·공유망·멀티캐스트·문서/전환 IPv6를 차단하며 리디렉션마다 URL/DNS를 다시 검사하고 최대 세 번만 허용해요.

검색과 페이지 전체 시간 제한은 각각 8초예요. 페이지는 UTF-8 HTML 최대 512KiB, 실제 바이트 검증, 압축 응답 거부를 적용해요. DNS·본문 읽기도 제한에 포함돼요. 검색 결과는 최대 100개 검증 후 서비스당 10 URL, 요청당 20서비스·20페이지·페이지당 10후보로 제한해요. 초과는 부분 결과예요. 본문·응답·예외 원문을 로그에 남기지 않아요.

## B8.5-B에서 필요한 연결

1. 실제 SearchProvider와 서버 비밀 설정, 속도·예산 제한·429/재시도·검색 캐시.
2. 실제 공식 도메인 레지스트리, 사이트별 추출/검증 프로필, JS 페이지, robots/약관, 국가·요금제 동등성 검증.
3. 검증 스냅샷 영속 저장·원자 갱신·롤백·만료·변경 감지·안전한 폴백 및 B7 캐시 무효화/B6 재계산.
4. 서버 API 권한과 확정 서비스 입력의 신뢰 경계, 이후 승인된 프론트 연동. 일반 요금제 계산은 공유 계약 확장이 필요해 현재 계산하지 않아요.

### 제공업체 조사: 2026-11-06

현재처럼 URL 검색과 직접 보안 조회를 분리하는 구조는 Brave Search에 잘 맞아요. [공식 요금표](https://api-dashboard.search.brave.com/documentation/pricing)는 Search 1,000요청당 $5, 월 $5 크레딧, 50요청/초를 안내해요. [가입 안내](https://api-dashboard.search.brave.com/documentation/resources/help-feedback)는 무료 크레딧에도 카드 등록/승인 확인이 필요할 수 있다고 해요. 무료 무가입 서비스로 가정하지 않아요. 1,000검색 원가 $5는 월 크레딧이 적용되면 상쇄될 수 있지만 페이지 조회·호스팅은 별도예요.

[Tavily 공식 문서](https://docs.tavily.com/documentation/api-credits)는 월 1,000 무료 크레딧(카드 불필요), 종량제 $0.008/크레딧, basic 검색 1/advanced 검색 2크레딧, basic 추출 성공 URL 다섯 개당 1크레딧을 안내해요. 무료 제공분 적용 전 종량 단가로 1,000검색은 basic $8/advanced $16이에요. Extract를 쓰더라도 원문 대조가 필요해 직접 조회와 중복 비용이 생길 수 있어요.

이것은 공식 문서 확인값이지 가입·결제 확인값이 아니에요. 실제 계정 요금·크레딧 자격·세금·환율·한국 검색 품질·학교 라이선스 검색 범위·사이트 접근성·배포 통신 정책은 미확인이에요. 가입이나 유료 호출은 하지 않았어요.

재현: `node node_modules/tsx/dist/cli.mjs tests/examples/discovery.ts`. 페이지·조건·가격은 전부 MOCK이며 실제 혜택으로 간주하면 안 돼요.
