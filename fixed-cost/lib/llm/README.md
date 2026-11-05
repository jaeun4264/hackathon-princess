# B4 서버 전용 LLM 클라이언트

B1~B3의 타입·카탈로그·탐지·입력 어댑터를 바꾸지 않고 추가한 공통 호출 기반이에요. B5·B7·B8의 API·비즈니스 검증·실제 프롬프트는 구현하지 않았어요. `prompts/t1.ts`, `t2.ts`, `t3.ts`는 빈 배열을 반환하는 TODO 빌더뿐이에요.

## 인터페이스와 제공업체 분리

- `types.ts`: `LlmMessage`, `LlmProvider`, `LlmClient`, `LlmResult<T>`, 사용량·로그·호출 문맥 타입. 기존 `lib/types.ts`와 다른 LLM 내부 인터페이스예요.
- `core.ts`: `createLlmClient({ provider, dailyCap, limiter?, now?, logger? })`. 제공업체나 HTTP 형식을 모르고 `LlmProvider.complete({ messages, signal })`만 호출해요.
- `LlmProvider.complete()`는 `{ text: string, usage?: { prompt_tokens, completion_tokens } }`를 반환해요. 키·인증 방식·주소·모델 선택은 제공업체 구현의 서버 설정에서 처리해요.
- `client.ts`: 환경 변수 기반 기본 조립부. `callJson(messages, schema, context?)`와 팩토리를 내보내요. 미래 제공업체는 다른 `LlmProvider`를 주입하거나 기본 조립부만 교체해요. 비즈니스 코드의 JSON·Zod 검증 경로는 같아요.
- 직접 팩토리로 만든 클라이언트는 서버에서 재사용하거나 `limiter`를 공유해야 해요. 요청마다 새 클라이언트를 만들어 한도 카운터를 초기화하면 안 돼요. 기본 `callJson()`은 공유 한도 객체를 사용해요.
- `providers/openai-compatible.ts`: 실제 구현한 유일한 HTTP 전송 형식이에요. 설정한 기본 주소 뒤에 `/chat/completions`를 붙여 JSON POST를 보내고 `temperature: 0`, `response_format: { type: 'json_object' }`를 사용해요. 주소·모델 기본값이나 특정 제공업체 계정은 없어요.
- `tests/mocks/llm-provider.ts`: 테스트 전용 Mock이에요. 실제 인증·네트워크를 사용하지 않으며 프론트엔드 소유의 `lib/mocks/`는 변경하지 않았어요.

OpenAI 호환 형식은 [공식 Chat Completions 문서](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)와 [JSON mode 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)를 참고했어요. JSON mode만으로 업무 스키마가 보장되지는 않아서 코드가 Zod로 다시 검사해요. 호출자는 메시지에 JSON 응답 지시를 포함해야 해요. 이 옵션들을 실제로 지원하는 모델인지도 연결 전에 확인해야 해요. 특정 업체에 실제로 접속하거나 유료 요청을 실행한 것은 아니에요.

## 결과와 오류 처리

`callJson<T>(messages, schema, context?)`는 검증된 `{ data: T, usage?, latency_ms }` 또는 `null`을 반환해요. `context`의 선택적 `route`는 허용된 세 API 경로 또는 `llm`, `ip`는 서버에서 얻은 호출자 주소예요. `ip`를 제공업체 요청·로그에 넣지 않아요.

- 메시지 형식을 검사하고, 매 전송 시도 전에 한도를 동기적으로 예약해요.
- JSON 파싱·Zod 검증·제공업체 응답 봉투 검증 실패는 한 번만 재시도해요. 두 번 실패하면 `null`이에요. 원문을 임의로 고치거나 Markdown 코드 블록을 추출하지 않아요.
- HTTP 오류(429 포함), 네트워크 오류, 타임아웃은 재시도 없이 `null`이에요. 불필요한 유료 요청 확대를 피하는 정책이에요.
- 시도마다 15초 제한이 응답 본문 읽기까지 적용돼요. AbortSignal을 전달하고, 제공업체가 이를 무시하더라도 공통 타이머가 반환을 끝내요. 검증 재시도가 있으면 호출 전체는 최대 두 시도 길이가 될 수 있어요.
- 재시도에 쓴 토큰도 합산해요. 모든 시도에서 유효한 사용량을 받지 못했거나 합계가 안전 정수 범위를 벗어나면 `usage`를 생략해요. 모르는 비용·토큰 수를 만들지 않아요.
- `latency_ms`는 호출 시작부터의 전체 지연이에요. 실제 과금액은 계산하지 않아요.

## 서버 설정과 안전장치

기존 `.env.example`에는 아래 이름이 이미 있어서 환경 파일은 변경하지 않았어요. 실제 값은 소스·문서·테스트에 쓰지 않아요. 테스트에서 HTTP 헤더 검증에 쓰는 값은 실행 중 생성한 가상 식별자이고 유효한 API 키가 아니에요.

| 환경 변수 | 의미 |
| --- | --- |
| `LLM_BASE_URL` | 운영자가 확인한 OpenAI 호환 API 기본 주소 |
| `LLM_API_KEY` | 서버 측 인증 키 |
| `LLM_MODEL` | 해당 제공업체가 지원하는 실제 모델 식별자 |
| `LLM_DAILY_CAP` | 프로세스의 UTC 날짜별 최대 전송 시도 수. 0은 호출 차단 |

네 변수 중 하나라도 없거나 한도가 잘못됐으면 경고 한 줄과 `null`이고 외부 요청은 없어요. 미정 모델·주소·한도를 임의 기본값으로 채우지 않아요. `NEXT_PUBLIC_` 변수를 사용하지 않아요.

`server.ts`는 Node 내장 `node:crypto`를 사용하고 브라우저 환경을 거부해요. Node 런타임의 서버 코드에서만 import해야 하며 클라이언트 컴포넌트나 Edge 런타임에 넣지 않아요. 인증 정보는 서버 조립부와 전송 클로저에만 있어요. 원격 주소는 HTTPS만 허용하고 명시적 로컬 개발 서버만 loopback HTTP를 허용해요. URL의 인증 정보·쿼리·fragment와 HTTP 리다이렉트를 거부해요.

`limits.ts`는 UTC 날짜별 일일 한도와 IP별 고정 분 창의 20회 한도를 메모리에 유지해요. 성공·실패·재시도 모두 실제 요청 전에 예약하며 차단되면 전송하지 않아요. IP 원문 대신 해시 키를 사용하고 만료된 분의 항목은 제거해요. IP를 생략하면 모든 미지정 호출이 하나의 20회 버킷을 공유해요. 후속 API 라우트는 배포 환경에서 신뢰할 수 있게 얻은 IP를 넘겨야 해요.

이 메모리는 여러 서버리스 인스턴스·재시작 사이에 공유되지 않아요. 계정 전체의 정확한 과금 상한이 아니므로 실제 연결 전에 제공업체의 사용 한도를 설정해야 해요. 저장소나 실제 키를 만들지는 않았어요.

`log.ts`는 허용된 `route`, 정규화한 `status`, 숫자 `latency_ms`만 기록해요. 프롬프트·응답·오류 본문·예외 메시지·키·모델 주소·IP는 로그에 포함하지 않아요. 호출자도 계약의 최소 필드만 메시지로 만들고 메일 원문·이름·카드번호·이메일을 넣지 않아야 해요.

## Syntitan: 미확정 사항

Syntitan 전용 주소·인증 방식·SDK·모델 이름·어댑터는 구현하지 않았어요. 연결 전에 다음을 확인해야 해요.

1. 해커톤 계정에서 가능한 기능과 권한: 모델 호출 서비스인지, 데이터 정리·평가 기능인지
2. 공식 API·SDK·MCP 등 실제 연결 방식과 접근 문서, 인증 방식·권한 범위
3. 모델 호출을 제공한다면 모델 식별자, 요청·응답 형식, JSON 모드·취소·타임아웃·usage 지원 여부
4. 데이터 기능만 제공한다면 입출력 형식과 기존 어댑터·평가 단계 중 어디에 연결할지
5. 전송 가능한 데이터·보관·학습·삭제 정책과 개인정보 제한
6. 호출 한도·비용·해커톤 무료 범위·테스트 환경 제공 여부

확인 후 모델 전송이라면 `LlmProvider`를 구현하고, 데이터 정리·평가 기능이라면 해당 단계의 별도 연동으로 다룰 수 있어요. Syntitan이 OpenAI 호환 LLM이라고 가정하지 않아요.

## Mock 검증과 예제

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:catalog`를 사용해요. 예제는 `node node_modules/tsx/dist/cli.mjs tests/examples/llm.ts`로 실행해요. 예제와 테스트는 Mock만 사용하며 실제 환경 파일이나 유료 모델을 부르지 않아요. 예제의 5ms·10ms 지연과 토큰 수는 가상 수치예요.
