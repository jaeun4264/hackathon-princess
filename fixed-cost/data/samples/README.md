# B3 가상 입력 자료

`persona-1.json`~`persona-3.json`은 실제 개인정보가 없는 `Transaction[]`이며 2026년 7~9월의 3개월 자료예요. 샘플 어댑터는 매번 B1 스키마로 검증한 복사본을 돌려줘요. 카탈로그의 알려진 가격만 쓰고, 모든 페르소나에 단발 결제 5건을 섞었어요.

| 샘플 | 결제 건수 | 심은 구독 | B2 후보 기대 개수 |
| --- | ---: | --- | ---: |
| persona-1 | 18 | 넷플릭스·아이클라우드·다글로·이모티콘 플러스·굿노트 | 5 |
| persona-2 | 12 | 다글로·아이클라우드·굿노트 | 3 |
| persona-3 | 11 | 넷플릭스·네이버플러스 | 2 |

`Apple`·`카카오페이` 표기는 결제 수단 뒤의 서비스를 해석하는 이후 단계를 위한 가상 표기예요. B3는 실제 서비스 해석이나 LLM 호출을 하지 않아요.

현재 카탈로그에는 AI 구독 여러 개·OTT 여러 개를 구성할 만큼 확인된 서비스·가격이 없어요. 따라서 두 번째·세 번째 샘플은 각각 AI 도구 중심·OTT 중심의 제한된 구성이고, 미등록 Claude Pro·지니뮤직이나 가격이 null인 티빙을 가짜 가격으로 추가하지 않았어요. 카탈로그를 변경하거나 발신 도메인을 추측해 넣지도 않았어요.

`persona-jaeun-case.json`은 개발 문서의 8개 구독을 정리한 별도 기준 형식이에요. `_note`와 `subscriptions`를 가지며 `Transaction[]`이 아니어서 샘플 선택 목록에 노출하지 않아요. Claude Pro·지니뮤직·티빙 금액은 null로 보류했고, 확인이 필요한 테스트는 todo로 표시해요.

## 어댑터 사용

- `listSamples()` → `{ id, name, description }[]`, `sampleAdapter.load(id)` → `Promise<Transaction[]>`
- `parseCsv(text)` → `{ transactions, skipped: [{ line, reason }] }`. 영어·한글 헤더, 인용 필드·줄바꿈, 원화 정수·날짜 검증과 중복 행 처리를 해요. 추가 열은 결과에 포함하지 않아요. 두 자리 연도는 20YY예요.
- `parseGmailMessages(messages, catalog)` → 계약의 `GmailParseResult`. GmailMessageLite만 받고 외부 호출·저장·로그를 하지 않아요. 같은 메시지 id는 한 번만 처리해요. 오류 형식은 입력 내용을 포함하지 않는 오류로 거부해요.
- Gmail 금액이 여러 개라 합계를 특정할 수 없으면 `no_amount`로 보류해요. 외화는 환산하지 않아요. 결제 사업자 id와 확인된 카탈로그 도메인이 일치할 때만 결제 수단을 지정하고, 나머지는 `unknown`이에요.
- `buildGmailQuery(catalog)`는 `newer_than:6m`과 카탈로그 도메인·영수증 키워드로 검색어를 만들어요. 검색 문법을 주입할 수 있는 도메인 값은 제외해요.
- `captureAdapter.load()`는 명세대로 `not implemented` 오류만 내요.

CSV 중복은 한 입력 안의 날짜·금액·표기·결제 수단이 모두 같은 행, Gmail 중복은 한 입력 안의 같은 id를 뜻해요. 서로 다른 메일 id의 같은 금액 결제는 실제 별도 결제일 수 있어 지우지 않아요. 여러 번 가져온 내역을 화면 상태와 병합하는 기능은 프론트엔드 후속 작업이에요.

OAuth·Gmail API 호출·HTML 태그 제거·메시지 축약과 토큰의 메모리 관리는 프론트엔드 F2 범위예요. B3만으로 실제 Gmail 계정에 연결되지는 않아요. 실제 발신 도메인 수집, 승인된 Google 클라이언트 ID·원본·테스트 계정 설정은 아직 필요해요.
