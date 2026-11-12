# 저장소 규칙 — 고정비 관리 시스템 (fixed-cost/)

이 2부는 0단계에서 `fixed-cost/CLAUDE.md`(Claude Code용)와 `fixed-cost/AGENTS.md`(Codex 등용)로 **같은 내용**을 복사해 두는 규칙이에요. 고치면 세 곳(BACKEND.md, FRONTEND.md, 저장소의 두 파일)을 다 고쳐요.

대학생이 결제 내역을 넣으면 구독을 정리하고, 거의 안 쓰는 구독과 받을 수 있는 학생 혜택·묶음 상품을 찾아 절약액을 보여 주는 웹앱. 대학 연합 해커톤용 MVP. 최종 제출 11/16, 본행사 11/21.

## 먼저 읽을 문서
- `docs/dev-guide/BACKEND.md` 또는 `FRONTEND.md`의 3부(계약) (두 파일에 같은 내용) — 타입·API 계약 (기준 문서)
- 백엔드 작업이면 BACKEND.md 4부(백엔드 명세), 프론트 작업이면 FRONTEND.md 4부(프론트 명세)

## 지켜야 할 규칙
1. **AI는 T1(결제 해석)·T2(혜택 판정)·T3(제안 문장) 세 곳에만 쓴다.** 나머지는 규칙. 금액은 항상 코드가 계산하고 AI가 만든 숫자는 어디에도 넣지 않는다.
2. **AI 출력은 검증한 뒤에만 쓴다.** T1은 후보 안의 id만, T2는 인용이 조건 원문에 있을 때만, T3는 숫자가 없을 때만. 실패하면 unknown/기본 문장. 서버는 AI 실패로 500을 내지 않는다.
3. **값을 지어내지 않는다.** 가격·혜택 조건·출처·확인일이 없으면 `null`로 두고 멈춰서 물어본다. mock 데이터는 mock 파일에만.
4. **개인정보**: 결제 내역은 브라우저에만 둔다. 서버·AI로 보내는 건 계약에 적힌 필드뿐. 요청·응답 본문을 로그에 남기지 않는다. 카드번호·이름·이메일을 AI에 보내지 않는다.
5. **비밀**: 이 저장소는 Public이다. `.env*`는 `.gitignore`(예외: `.env.example`). API 키·토큰은 코드·테스트·문서·커밋 메시지에 절대 쓰지 않는다. **`.env*` 파일은 읽거나 화면에 출력하지 않는다** (키 값이 들어 있다). 키가 필요한 평가·시연 스크립트는 사람이 직접 실행한다. `NEXT_PUBLIC_` 접두사에는 비밀을 쓰지 않는다.
6. **신뢰 원칙**: 수수료·제휴와 무관하게 절약액이 큰 순서로 보여 준다. 제휴·광고는 표시한다. 가격·혜택에는 확인일을 보여 주고 30일이 지나면 "재확인 필요".
7. **소유권**: 백엔드는 `app/api, lib/rules, lib/adapters, lib/llm, lib/events, data, eval, tests`, 프론트는 `app(api 제외), components, lib/client, lib/mocks`. 남의 폴더는 읽기만. 계약 파일(`lib/types.ts, lib/schemas.ts, lib/api-client.ts`)을 바꾸면 PR 제목에 `[계약]`.
8. 팀이 아직 정하지 않은 것(청년 월세, 통신비, 학교 범위, 결제일 확인 알림 등)은 **만들지 않는다.** 확장 자리만 남긴다. 입력 방식은 **Gmail 영수증**으로 정해졌다(11/4). Gmail 토큰·메일 원문은 브라우저 메모리에만 두고 서버·AI·로그로 보내지 않는다.

## 작업 방식
- 한 번에 한 단계. 끝나면 `npm run typecheck && npm run lint && npm test` (백엔드는 `npm run validate:catalog`도).
- 새 규칙에는 단위 테스트를 같이 쓴다. CI는 LLM을 부르지 않는다.
- 화면 문구는 한국어 해요체. 코드 식별자는 영어, 주석은 한국어.
- 모르는 것은 추측하지 말고 `// TODO(팀)`으로 표시한 뒤 마지막에 무엇을 정해야 하는지 알려 준다.
- 커밋 메시지는 `feat(be|fe): 한 줄 요약` 형식.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
