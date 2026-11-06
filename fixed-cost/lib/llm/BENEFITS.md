# B7 학생 혜택 적용 가능성 판단

`POST /api/benefits`의 기존 계약 `{user: UserProfile, targets: [{kind, id}]}` → `{results: BenefitResult[]}`를 구현해요. yes는 적용 가능 추정, no는 적용 불가 판단, unknown은 추가 확인 필요예요. 가입·학생 인증 완료·실제 구독 보유를 확정하는 API가 아니에요. 사용자 정보는 호출자가 확인한 값을 전달하는 계약이며 서버가 학적을 별도로 인증하지 않아요.

## 근거와 실패 처리

모든 target을 먼저 B1 validateCatalog로 검증된 카탈로그에서 찾아요. 미등록은 400 unknown_target, 근거가 없는 잘못된 카탈로그는 503 catalog_unavailable이에요. 실제 benefits.json은 비어 있고 Mock은 테스트에서만 주입해요.

B4 callJson에 사용자 school/status/school_email/grade와 혜택 id/conditions/source_url/checked_at만 전달해요. 가격·거래·메일·인증 토큰은 보내지 않아요. 조건은 데이터이며 지시를 따르지 않도록 프롬프트를 분리해요. 응답은 eligible/quoted_conditions/missing_info/reason만 허용하고 AI가 ID·가격·URL을 추가하면 거부해요. 원문 AI 설명도 반환하지 않고 코드의 고정 설명을 사용해요. 반환 id·URL·확인일은 카탈로그 값뿐이에요.

공백·줄바꿈·전각 공백을 정규화해 모든 인용이 원문에 있는지 검사해요. yes/no에 인용이 없거나 인용이 원문에 없으면 unknown/quote_failed예요. AI 구조 오류·키 누락·실패·15초 타임아웃은 HTTP 200 unknown/ai_error예요. missing_info는 허용된 다섯 값만 남기고 추가 정보가 필요하다고 답한 yes/no는 unknown으로 내리며, 부족한 정보 항목조차 없으면 other예요.

학교 라이선스의 학교 미확인, 기타 상태, 학년 조건에서 학년 누락은 모델을 부르기 전에 unknown이에요. 카탈로그의 대상 학교와 다른 학교는 no예요. 그 밖의 자연어 조건 해석은 AI 판단이므로 인용 검증만으로 의미적 정답까지 보장하지 않아요. 실제 모델 평가는 후속 단계에서 필요해요. school_email은 인증 가능 여부이며 인증 완료 증거가 아니에요.

## 기존 단계 연결

B7은 혜택을 검색하는 사용자도 쓰는 API여서 구독이나 B5 service ID를 요청에 추가하지 않아요. 혜택 yes가 미확정 구독을 확정하지 않아요. B6 buildSuggestions에 결과를 전달하면 등록된 확정 구독에만 할인액을 계산하고, B5 추정만 있는 구독은 제외해요. 이 연결을 통합 테스트로 검증해요. 가격 null은 자격 판정과 분리하며 가격을 생성하지 않고 B6에서 할인 제안을 제외해요. 자격 no/unknown도 할인 금액으로 이어지지 않아요.

## 캐시와 운영 제약

메모리 Map에 종류·ID·확인일·조건/출처 등 카탈로그 버전과 프로필 해시를 키로 저장해요. 프로필 원문은 캐시에 저장하지 않아요. TTL 30분, 최대 256개이며 B4 실패는 캐시하지 않고 stale은 요청 날짜로 다시 계산해요. 같은 프로필·대상의 순차 요청은 재사용하지만 동시 최초 요청을 하나로 합치지는 않아요. 캐시는 인스턴스 간 공유되지 않아요.

JSON 본문은 실제 UTF-8 20KB, 대상은 최대 50개예요. 계약 밖 필드는 거부하고 분당 20회 공유 버킷으로 제한해요. 임의 전달 헤더를 IP로 신뢰하지 않아요. 사용자/본문/응답/오류 원문 로그는 없으며 B4에는 경로·상태·지연만 남아요.

묶음은 기본 400 bundle_not_supported이며 ENABLE_BUNDLE_AI=1일 때만 같은 판정 경로를 허용해요. 묶음 금액 비교·B8 이후는 구현하지 않아요. Syntitan과 유료 API는 호출하지 않았어요.

재현: `node node_modules/tsx/dist/cli.mjs tests/examples/benefits.ts`. 모든 예시는 가상 학교·MOCK 조건·example.invalid 출처이며 실제 혜택의 증거가 아니에요. 실제로 검증된 혜택을 운영하려면 사람이 공식 원문·가격(미확인 시 null)·출처·확인일을 카탈로그에 등록해야 해요.
