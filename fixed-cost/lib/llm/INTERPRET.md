# B5 결제처 해석: 후보와 확정 분리

요청은 기존 `POST /api/interpret`의 `{ items: [{ key, raw_name, amount, interval, payment_method }] }`예요. B1 공유 타입·스키마와 B2~B4는 변경하지 않았어요.

## 응답 계약

- `results: InterpretResult[]`: 기존 엄격 스키마 그대로예요. `service_id`는 **확정된 ID만** 담아요. 미확정은 null, category는 기타, needs_check는 true예요.
- `resolutions: MerchantResolution[]`: 같은 순서·key의 상세 결과예요. 기존 필드에 `suggested_service_id`, `confirmed_service_id`를 추가해요. B5 전용 `lib/llm/interpret-resolution.ts`가 검증해요.
- `suggested_service_id`: 검증된 카탈로그 후보 ID예요. AI의 자유 텍스트 서비스명과 달라요. 후보가 없거나 잘못된 응답이면 null이에요.
- `confirmed_service_id`: 결제 표기에 유일한 등록 서비스명·ID·별칭이 명시된 경우에만 채워요. `service_id`와 같아요. 이때 suggested도 같은 ID예요.
- `confidence`: AI 추정의 확신도(0~1)예요. 높은 값도 확정 근거가 아니에요. 명시적 카탈로그 매칭은 1이에요.
- `source`: catalog(명시적 표기 매칭), ai(미확정 후보), unknown(해석 불가)이에요.

예: 카카오페이 6,900원에 Mock이 이모티콘 플러스를 제안하면 results.service_id=null, resolutions.suggested_service_id=kakao_emoticon_plus, resolutions.confirmed_service_id=null, source=ai, needs_check=true예요.

## 처리 순서와 안전 기준

1. JSON·UTF-8 본문 20KB·최대 50개·계약 밖 필드 거부를 유지해요.
2. 카탈로그 이름·ID·별칭의 명시적 매칭을 검사해요. 카카오페이·네이버페이·토스페이·PAYCO·Apple·Google 같은 대행 표기만으로는 확정하지 않아요. 금액에 관계없이 같아요. 실제 서비스명이 함께 있거나 구체적인 등록 상품명이라면 매칭할 수 있어요. 중복 별칭은 가격만으로 확정하지 않아요.
3. AI 후보는 기존처럼 같은 주기의 동일 금액 또는 가격 null 요금제를 가진 등록 서비스예요. 가격 필터는 후보 축소 용도이며 확정 근거가 아니에요.
4. B4 callJson과 엄격 응답 검증을 재사용해요. 후보 안의 실제 카탈로그 ID만 허용하고, 서비스 표시 이름·없는 ID·후보 밖 ID는 거부해요.
5. AI 결과는 확신도·가격 일치와 무관하게 항상 미확정이에요. 원문 AI 설명·분류를 사실처럼 내보내지 않아요. 미확정 분류는 기타, 설명은 확인이 필요하다는 고정 문구예요.
6. 실패·타임아웃·unknown·잘못된 구조는 두 ID가 null인 안전한 HTTP 200 결과예요. 요청 내 중복 캐시는 key와 순서를 유지하고 요청 간 공유하지 않아요.

카탈로그 매칭은 제공된 결제 표기와 서비스의 연결을 뜻해요. 실제 계정 보유·활성 구독 상태를 별도로 검증했다는 뜻은 아니에요. 독립적인 외부 증거를 검증하는 계약이나 사용자 확인 저장 기능은 아직 없어요. 클라이언트가 보내는 임의의 confirmed 플래그를 신뢰하지 않아요.

## 기존 소비자 및 프론트엔드 후속 작업

기존 interpretItems 함수와 results 항목은 B1 strict 스키마로 계속 파싱돼요. 의미는 안전하게 강화되어 AI 추정 ID가 기존 service_id에 들어가지 않아요. 응답 최상위에는 resolutions가 추가됐으므로 최상위 객체 전체를 strict로 검사하는 외부 소비자는 이 필드를 허용해야 해요. 현재 저장소에는 구현된 프론트엔드 API 소비 경로가 없고, 기존 API·테스트·샘플 경로를 확인했어요.

향후 프론트엔드는 resolutions의 후보를 '추정·확인 필요'로 표시하고 확정 구독 목록은 confirmed_service_id 또는 기존 results.service_id로만 구성해야 해요. 사용자 확인·수정 화면과 저장, 서버가 검증하는 독립 증거 계약은 후속 작업이에요. 이번 B5에는 추가하지 않았어요.

## 개인정보·한도·검증

메일·토큰·프로필·결제일 등 계약 밖 정보는 AI에 보내지 않고 본문·응답·오류 원문을 로그에 남기지 않아요. 기존 분당 공유 20회 한도와 B4 서버 전용 환경변수·Mock 제공업체 주입을 유지해요. Syntitan 사양을 추측하거나 유료 API를 호출하지 않아요.

`tests/interpret.test.ts`는 기존 B3→B2→B5 통합·잘못된 응답·타임아웃·한도·캐시를 검사해요. `tests/interpret-resolution.test.ts`는 결제 수단×금액 조합, 명시적 서비스 문맥, 높은 AI 확신도, 잘못된 ID, 구계약 호환성, 임의 확정 플래그 거부를 검사해요. `node node_modules/tsx/dist/cli.mjs tests/examples/interpret.ts`로 가상 입력과 실제 Mock 응답을 재현해요.
