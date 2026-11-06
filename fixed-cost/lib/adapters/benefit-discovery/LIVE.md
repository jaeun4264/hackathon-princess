# B8.5-B Brave 연결과 통합

이 단계는 실제 요청을 만들 수 있는 어댑터와 서버 통합 함수를 구현했지만 실제 검색 API·유료 LLM·공식 사이트 조회·가입/결제를 실행하지 않았어요. 검증 실행은 모두 Mock이에요. 키만 넣으면 모든 실사이트 혜택을 바로 수집한다고 보장하지 않아요.

## 인터페이스와 공식 API

createBraveSearchProvider는 기존 SearchProvider를 구현해요. 제공업체 교체는 createLiveDiscoveryService에 다른 SearchProvider를 주입하면 돼요. createConfiguredLiveDiscovery는 Brave와 A단계의 보안 페이지 조회기를 조립하는 기본 팩토리예요.

[Brave 공식 API 문서](https://api-dashboard.search.brave.com/api-reference/web/search/get)에서 확인한 GET https://api.search.brave.com/res/v1/web/search와 X-Subscription-Token 헤더, q/country/count/result_filter/text_decorations/spellcheck 및 web.results[].url을 사용해요. 주소를 외부 입력으로 바꾸지 않고 리디렉션은 거부해 키 전달을 막아요. 실제 서비스명과 고정된 공개 혜택 검색어만 허용하며 임의 검색어·프로필·거래·메일은 보내지 않아요. 검색 title/description은 저장·판정에 사용하지 않고 허용 공식 호스트 URL만 A단계로 넘겨요. 웹 결과가 없다는 것은 전체 인터넷에 혜택이 없다는 증거가 아니에요.

키 없음은 missing_key, 실행 스위치 꺼짐은 live_disabled예요. 두 경우 검색과 공식 페이지 조회를 모두 실행하지 않아요. HTTP·구조·시간·응답 크기 실패는 안전한 코드로 반환하며 오류 본문·키·요청 URL을 로그에 남기지 않아요. 검색 응답 전체 시간 제한은 5초, 최대 512KiB예요. 429 Retry-After는 재호출 대기 기간으로 반영하고 자동 유료 재시도는 하지 않아요.

## 통합 사용

```ts
const service = createConfiguredLiveDiscovery({ sources: verifiedOfficialSources });
const discovery = await service.discover({ confirmed_service_ids, country: 'KR' });
// LLM은 기본 비활성이라 B7 unknown/B8 fallback이에요.
const result = await service.recommend({ subs: confirmedSubscriptions, user: confirmedProfile, country: 'KR' });
```

sources는 운영자가 공식 소유 관계를 확인한 A단계 OfficialSource 설정이에요. B3 email_domains나 검색 요약에서 만들지 않아요. 사용자가 혜택을 수집해 입력하는 방식이 아니라 시스템의 도메인 신뢰 설정만 필요해요. 실제 신뢰 도메인은 이번에 추측해 등록하지 않았어요.

recommend는 확인된 구독만 선택하고 B7 judgeBenefit→B6 buildSuggestions→B8 buildRecommendationMessages를 재사용해요. 유료 LLM은 기본적으로 호출하지 않으며 별도 승인 후 기존 B4 LlmClient를 명시적으로 주입해야 해요. 현재 입력은 서버가 확인한 내부 상태를 전제로 한 함수이며 학적·구독 보유 자체를 인증하지 않아요. 새 공개 HTTP 엔드포인트·프론트 변경·개인 거래의 새 서버 전송 계약은 추가하지 않았어요. 결제 자료를 검색 API로 보내지 않아요.

## 중복·예산·캐시·갱신

동일 공개 검색의 동시 요청을 합치고, 서비스별 갱신도 동시 한 번만 수행해요. 키와 실행 스위치는 캐시 확인 전에도 검사해요. 예산은 실제 HTTP 시도마다 동기 예약하며 기본 분당 10/UTC 일 100/UTC 월 500회예요. 잘못된 설정은 차단하고 0은 새 요청을 막아요. 실패도 사용량에 포함해요.

[공식 FAQ](https://api-dashboard.search.brave.com/documentation/resources/help-feedback)는 Brave API에서 받은 데이터의 보관을 금지하며 저장 권한이 필요하면 제공업체에 문의하도록 안내해요. 따라서 기본값은 검색 응답 캐시 없음이며, 별도 보관 권한을 확인한 경우에만 BRAVE_SEARCH_RESULT_CACHE_ALLOWED=1로 URL 결과 캐시를 켤 수 있어요(양성 15분/음성 1분, 최대 128개). Mock에서 이 경로를 검증했을 뿐 실제 권한을 취득한 것이 아니에요.

기본 중복 방지와 장애 대응은 검색 응답을 저장하지 않고 공식 페이지에서 독립적으로 얻고 검증한 혜택 스냅샷으로 수행해요. 이 경우에도 공식 페이지의 이용조건은 따로 확인해야 해요. 검색에서만 얻은 미검증 URL/원문 요약/전체 검색 보고서는 캐시에 남기지 않아요. 캐시된 서비스 결과의 report는 null이고 unverified_count와 상태로 미검증 여부를 전달해요. verified_records에는 독립적으로 검증한 공식 자료만 있어요.

혜택 캐시는 6시간/최대 128개이며 UTC 날짜가 바뀌면 다시 조회해요. 실패는 30초, 빈 결과는 1분 동안 중복 작업을 막아요. refresh:true는 혜택 갱신을 강제해요. 원문 갱신에 성공하면 가격·조건을 원자적으로 교체하고, 검색/페이지 전송 실패 시에만 이전 검증 값으로 fallback해요. 만료·30일 초과·국가 불일치 자료는 재사용하지 않아요. 추출 불가·조건 충돌·가격 미검증·정상 빈 검색 결과는 과거 혜택으로 대체하지 않아요.

fallback은 checked_at을 갱신하지 않고 refresh_failed/source=fallback을 반환하며 B7·B6·B8에도 stale=true를 전달해요. 마지막 시도 시각과 실제 확인일은 별개예요. 사용자 자격 판정은 매번 B7에서 수행하며 사용자 정보는 공용 검색/혜택 캐시에 저장하지 않아요. 국가·공식 소유 설정이 다르면 캐시가 분리돼요.

현재 캐시와 예산은 동일 서비스 인스턴스의 메모리 MVP예요. 서버 모듈에서 한 번 생성해 재사용해야 하며 매 요청마다 팩토리를 다시 호출하면 안 돼요. 프로세스 재시작/서버리스 콜드 스타트 때 사라지고 여러 인스턴스 사이에서 합산되지 않아요. 영속 스냅샷·분산 예산·예약 갱신은 아직 없어요. 실제 배포에서는 단일 장수 인스턴스 또는 별도 공유 저장소와 제공업체의 대시보드 사용량 상한이 필요해요. 공용 스냅샷 저장 권한·검증 무결성 설계 없이 임의 JSON을 주입받지는 않아요.

## 사람이 직접 할 설정 — 이번 작업에서는 하지 않았어요

| 서버 변수 | 의미 |
| --- | --- |
| BRAVE_SEARCH_API_KEY | Brave Search 플랜에서 발급한 키. 서버 비밀 설정에만 보관 |
| BENEFIT_DISCOVERY_LIVE | 명시적 호출 승인 후에만 1로 설정. 기본 비활성 |
| BRAVE_SEARCH_PER_MINUTE | 기본 10 |
| BRAVE_SEARCH_DAILY_LIMIT | 기본 100, UTC 기준 |
| BRAVE_SEARCH_MONTHLY_LIMIT | 기본 500, UTC 기준 |
| BRAVE_SEARCH_RESULT_CACHE_ALLOWED | 제공업체 보관 권한을 확인한 경우에만 1. 기본 꺼짐 |

실제 실행 전에 Search 플랜 활성화·키 발급, 계정 사용량 상한/자동 충전 정책 확인, 공식 도메인 소유 설정, 사이트 약관·robots와 추출 형식 확인, 서버 함수 연결이 필요해요. 키는 NEXT_PUBLIC_ 변수나 코드에 넣지 말고 실제 키가 있는 환경 파일을 AI 도구에 읽게 하지 않아요. 별도 승인 없이 LLM 주입이나 라이브 검색 실행을 하지 않아요.

2026-11-06 확인: [공식 요금표](https://api-dashboard.search.brave.com/documentation/pricing)는 Search 1,000요청당 $5, 월 $5 크레딧, 50요청/초를 안내해요. [FAQ](https://api-dashboard.search.brave.com/documentation/resources/help-feedback)는 독립된 무료 플랜이 없고, 선불 금액을 0으로 두어도 카드 등록과 $0/$1 일시 승인 확인이 있을 수 있다고 해요. 월 크레딧은 Search 약 1,000회에 해당하지만 계정별 적용/세금/환율은 이번에 확인하지 않았어요. 자동 충전·대시보드 한도는 직접 확인해야 하며 코드의 메모리 한도만으로 결제 상한을 보장하지 않아요.

## 실사이트 미확인 사항

실제 검색 품질·인증/429 동작·학교 라이선스 검색 범위·공식 사이트 접근/JS/robots·HTML 프로필 호환성·현재 가격·국가·조건은 검증하지 않았어요. A단계의 제한된 JSON-LD/본문 검증 형식을 그대로 사용하므로 해석 불가 사이트는 unverified예요. 일반 plan_discount는 별도 검증 레코드만 보관하고 B1 학생 할인으로 위장하지 않으며 계산은 하지 않아요. 원문 검증에 실패하면 가격이나 혜택을 만들어 내지 않아요.

재현: `node node_modules/tsx/dist/cli.mjs tests/examples/live-discovery.ts`. Brave HTTP와 공식 페이지는 Mock이며 임시 인증 문자열도 실행 시 무작위 생성한 테스트 값이에요.
