# 프론트엔드 단계별 프롬프트 (AI 코딩 도구에 그대로 붙여 넣기: Claude Code, ChatGPT/Codex 등)

사용법
- 저장소 `fixed-cost/`에서 AI 코딩 도구를 열고 **한 단계씩** 붙여 넣어요. (ChatGPT 웹처럼 저장소를 못 읽는 도구는 FRONTEND.md 1부 "도구" 참고) 끝나면 커밋하고 다음 단계로.
- 브랜치: `fe/<단계>` (예: `fe/f3-confirm`). 계약 파일을 건드리면 `[계약]` PR.
- **서버가 없어도 진행돼요.** 처음엔 `NEXT_PUBLIC_USE_MOCK=1`로 개발하고, 백엔드 B5(T1)·B7(T2)·B8(T3)가 합쳐지면 0으로 바꿔 실제 서버로 확인해요.
- 값이 없거나 문구를 정해야 할 때(학교 목록, 개인정보 문구 등)는 임의로 확정하지 말고 `// TODO(팀)` 표시를 남기고 어떤 것을 정해야 하는지 마지막에 알려주게 했어요.
- 화면 단계마다 390×844 스크린샷을 찍어 확인하게 해요. Playwright가 안 되면 개발 서버 주소를 알려주고 사람이 열어 보라고 말해요.

---

## 0단계. 앱 뼈대 (재은 님이 먼저, 11/4~5)

준비물: 개발 가이드 파일 4개(`BACKEND.md`, `BACKEND_PROMPTS.md`, `FRONTEND.md`, `FRONTEND_PROMPTS.md`)를 저장소 `fixed-cost/docs/dev-guide/`에 먼저 복사해요. (저장소의 빈 파일 `news`, `fixed cost`는 건드리지 않아요.) 이 단계를 `main`에 합친 뒤에 민경 님이 B1을 시작해요.

```
먼저 읽을 것: fixed-cost/docs/dev-guide/FRONTEND.md (2부 규칙, 3부 계약)

목표: hackathon-princess 저장소의 fixed-cost/ 폴더에 Next.js 앱 뼈대를 만들고, 배포되는 빈 화면까지 준비한다. 이 단계에서는 기능을 만들지 않는다.

해야 할 일
0. FRONTEND.md 2부(저장소 규칙)의 내용을 fixed-cost/AGENTS.md와 fixed-cost/CLAUDE.md에 똑같이 저장한다 (제목 줄은 "# 저장소 규칙 — 고정비 관리 시스템 (fixed-cost/)"). AI 도구가 자동으로 읽는 파일이다.
1. 비밀 방어 먼저: 저장소 루트와 fixed-cost/ 모두에서 .gitignore에 .env, .env.*, !.env.example, node_modules, .next, coverage를 넣는다. 이 파일을 커밋한 뒤에만 다음으로 간다. 저장소 루트의 기존 파일(README.md, news, fixed cost)은 건드리지 않는다.
2. fixed-cost/에 Next.js(App Router, TypeScript, Tailwind, ESLint, src 폴더 없음) 앱을 만든다. 추가 패키지: zod, zustand, vitest, @vitest/coverage-v8, tsx, @playwright/test(devDependency, 브라우저 설치는 하지 않는다).
3. package.json scripts: typecheck(tsc --noEmit), lint, test(vitest run), validate:catalog, eval:t1, eval:t2, eval:compare, snapshot:samples, e2e. 아직 없는 스크립트 파일은 "not implemented"를 출력하고 실패하지 않는 자리 표시자로 둔다.
4. FRONTEND.md 3부(계약) 2절의 코드 블록을 lib/types.ts로 그대로 옮긴다 (한 글자도 바꾸지 않는다). lib/schemas.ts는 빈 파일로 만든다.
5. 폴더 뼈대: FRONTEND.md 3부(계약) 1절 표의 모든 폴더를 만들고 .gitkeep을 둔다. PRD의 저장소 구조와 같게 data/catalog, data/samples, eval, tests를 포함한다.
6. .env.example: FRONTEND.md 3부(계약) 5절 표의 변수 이름만 (값은 비움).
7. 홈(/)에 "Hello" 한 줄. 
8. .github/workflows/ci.yml (저장소 루트): working-directory를 fixed-cost로, Node LTS, npm ci → typecheck → lint → test. LLM을 부르는 단계 없음.
9. fixed-cost/README.md: 실행 방법(npm install, npm run dev)과 dev-guide 위치(파일 4개).

하지 말 것
- .env 파일을 만들거나 커밋하지 않는다. 키를 요구하지 않는다.
- 배포(Vercel 연결)는 하지 않는다. 사람이 한다.
- 계약 문서에 없는 타입·필드를 추가하지 않는다.

완료 기준
- npm run build, typecheck, lint, test가 통과한다 (테스트는 types import 스모크 테스트 1개).
- git status에 .env류가 없고 git ls-files에 비밀이 없음을 보여준다.
- 커밋 메시지: "chore: 앱 뼈대와 CI"
```

0단계 뒤 사람이 할 일은 `FRONTEND.md` 1부 "사람이 할 일"에 있어요.

---

## F1. 앱 뼈대, 상태, API 클라이언트

```
먼저 읽을 것: CLAUDE.md(= AGENTS.md), docs/dev-guide/FRONTEND.md 3부(계약) (전체), docs/dev-guide/FRONTEND.md 4부(프론트 명세) (원칙, 1~2절)

목표: 화면을 올리기 전에 필요한 공통 기반을 만든다. 이 단계에서는 화면 내용이 거의 없다.

해야 할 일
1. app/layout.tsx: 한국어(lang="ko"), 가운데 정렬 컬럼(최대 480px), 모바일 우선 기본 스타일, 시스템 폰트 스택. 색은 Tailwind 설정에 토큰(--color-*)으로 정의한다: 배경, 글자, 강조, 경고(노랑), 위험(빨강), 성공(초록), 사용 정도 3색.
2. lib/client/store.ts: Zustand + localStorage persist. FRONTEND.md 4부(프론트 명세) 2절의 AppState와 액션 이름 그대로. localStorage 접근은 전부 try/catch로 감싸고 실패해도 메모리로 동작한다. sessionId는 첫 실행에 crypto.randomUUID로 만든다.
3. lib/api-client.ts (계약 파일 — [계약] 표시 PR): interpret(), benefits(), message(), events()를 계약 3절 타입으로. 
   - NEXT_PUBLIC_USE_MOCK=1이면 lib/mocks/*.json을 300~800ms 지연 후 돌려준다
   - 네트워크 오류·10초 타임아웃·429는 던지지 않고, interpret은 모든 항목을 source:'unknown', needs_check:true로, benefits는 eligible:'unknown'/validation:'ai_error'로, message는 null(호출한 쪽이 기본 문장 유지)을 돌려준다. 이때 "degraded" 플래그를 함께 돌려준다.
   - 응답은 lib/schemas.ts로 검증하고 틀리면 위와 같이 처리한다.
4. lib/mocks/: interpret.json, benefits.json, message.json — 계약 타입에 맞는 가짜 응답. 재은 사례(넷플릭스·티빙·아이클라우드가 거의 안 씀)에 맞는 값으로 interpret 응답 일부, 학생 할인 yes/no/unknown 각 1개씩의 benefits 응답.
5. components/ErrorBanner, EmptyState, Skeleton, BottomSheet의 기본형. BottomSheet는 ESC로 닫기, 열릴 때 포커스 이동, 배경 스크롤 잠금.
6. 라우트 가드 훅 lib/client/guards.ts: 구독이 없으면 /로, 사용 정도가 비어 있으면 /confirm으로 보내는 useRequireSubscriptions(), useRequireUsage().
7. 빈 페이지 6개(/, /confirm, /home, /payment/[subscriptionId], /benefits, /report)를 만들고 각각 제목만 표시한다.

하지 말 것
- lib/rules, lib/adapters, app/api, data/는 고치지 않는다 (백엔드 소유). 필요한 함수가 없으면 목록을 마지막에 알려준다.
- API 키나 서버 전용 변수를 NEXT_PUBLIC_ 접두사로 쓰지 않는다.

완료 기준
- npm run dev에서 6개 경로가 열리고, 가드가 동작한다 (구독 없이 /home → /로 이동).
- store 단위 테스트: localStorage가 막힌 환경에서도 에러 없이 동작, resetAll()이 모두 비움.
- api-client 테스트: 모의 모드 응답, 타임아웃 시 degraded 응답.
- 커밋 메시지: "feat(fe): 앱 뼈대와 상태, API 클라이언트"
```

---

## F2. S0 데이터 넣기

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S0, 2절 파이프라인), lib/adapters/*, lib/rules/index.ts

목표: 첫 화면에서 샘플 체험·Gmail 영수증 불러오기·직접 추가(·예비 CSV)로 데이터를 넣고, 구독 후보를 찾아 S1로 보낸다.

해야 할 일
1. components/PrivacyNotice: 맨 위 한 줄 + "자세히" 시트. 문구는 FRONTEND.md 4부(프론트 명세) 3절의 초안을 쓰되 // TODO(팀) 표시.
2. 샘플 체험: listSamples()로 페르소나 카드 3개를 보여주고 누르면 해당 어댑터로 transactions를 읽는다. /?demo=1이면 페르소나 ①로 이 화면을 건너뛰고 바로 파이프라인을 시작한다.
3. components/InputMethodPicker: 배열 [{id,label,enabled}]에서 그린다. gmail(주 버튼), csv(작은 링크, 예비). capture는 숨긴다.
4. lib/client/gmail.ts: FRONTEND.md 4부(프론트 명세) 3절 S0의 Gmail 흐름 1~9를 구현한다. Google Identity Services 토큰 방식(gmail.readonly), 토큰은 메모리에만, 검색어는 buildGmailQuery만, 메일 → GmailMessageLite 변환 후 parseGmailMessages. 모의 모드면 lib/mocks/gmail-messages.json(가짜 메일 8통 이상, 외화·광고 메일 포함)을 쓴다.
4-1. CSV 업로드(예비): 파일 선택 → csv 어댑터 → skipped 안내. 파일은 서버로 보내지 않는다.
5. 직접 추가: 서비스 검색(loadCatalog().services) 또는 이름·금액·주기 직접 입력 → 구독 1개를 store에 추가(interpret_source:'user', needs_check:false, usage:null).
6. lib/client/pipeline.ts의 1~2단계: transactions → detectSubscriptionCandidates → api.interpret(배치) → buildSubscriptions → store.subscriptions. phase를 empty → interpreting → confirming으로 바꾼다. 진행 문구 "구독을 찾는 중" → "서비스를 확인하는 중".
7. degraded 응답이면 ErrorBanner로 "일부는 AI 확인을 못 했어요. 확인 필요로 표시했어요"를 한 줄 보여주고 계속 진행한다.
8. 완료되면 /confirm으로 이동.

하지 말 것
- 결제 내역을 서버로 보내지 않는다 (interpret에는 계약 3-1의 필드만).
- 화면 캡처 입력은 만들지 않는다.
- 액세스 토큰·메일 원문을 localStorage·쿠키·서버·로그에 남기지 않는다. 메일 내용을 api.* 호출에 넣지 않는다.
- 클라이언트 보안 비밀번호(client secret)를 쓰지 않는다.

완료 기준
- 모의 모드에서 샘플 페르소나 3개 모두 /confirm까지 간다. 단발 결제가 구독으로 잡히지 않는다.
- 모의 모드에서 Gmail 버튼 → 가짜 메일 → /confirm까지 가고, 외화·광고 메일이 건너뜀 요약에 보인다.
- 깨진 CSV에서 skipped 안내가 보인다. 390px 스크린샷 첨부(또는 확인 요청).
- (사람이) 실제 Google 클라이언트 ID로 테스트 계정 1개에서 영수증이 불러와지는지 확인.
- 컴포넌트 테스트: 샘플 선택 → store.subscriptions 채워짐.
- 커밋 메시지: "feat(fe): S0 데이터 넣기"
```

---

## F3. S1 구독 확인

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S1, 4~5절), lib/client/store.ts

목표: AI가 찾은 구독을 확인·수정하고 모든 구독에 사용 정도를 한 번씩 탭하게 한다. 사용 정도가 다 있어야 다음으로 넘어간다.

해야 할 일
1. components/UsageSegment: 자주/가끔/거의 안 씀 3분할 버튼. 라벨은 USAGE_LABEL만 쓴다. role="radiogroup", 키보드 좌우 이동, 선택 상태는 색+글자.
2. components/SubscriptionCard (variant 'confirm'): 서비스명, 금액·주기(+월 환산), 표기 이름(작게), UsageSegment.
3. components/NeedsCheckBadge, SourceBadge(카탈로그/AI가 추정/직접 입력): needs_check인 카드는 노란 테두리 + 사유 한 줄.
4. 수정 시트(BottomSheet): 서비스명·금액·주기 수정, 삭제("이건 구독이 아니에요"), needs_check 카드는 카탈로그 검색으로 서비스 고르기 → source 'user', needs_check false.
5. 상단 프로필: 학교(고려대학교 / 이화여자대학교 / 기타 — // TODO(팀) 팀 판단 3번 대기), 재학 상태 5개, 학교 이메일 인증 가능 여부(예/아니오/모르겠어요 → 모르겠어요는 false로 저장).
6. 하단 고정 "다음" 버튼: usage가 null인 구독이 없고 프로필이 있어야 활성화. 비활성일 때 "3개 더 눌러 주세요" 처럼 남은 개수. 누르면 confirmAll → 백그라운드 파이프라인 3~5단계 시작(혜택 판정은 F4 이후에 연결해도 됨, 지금은 자리만) → /home.
7. 가드: 구독이 없으면 /로.

하지 말 것
- usage를 자동으로 채우지 않는다.
- 학교 목록을 확정된 것처럼 하드코딩하지 않는다 (TODO 표시 유지).

완료 기준
- 모의 모드: 사용 정도를 하나라도 안 누르면 버튼 비활성, 다 누르면 활성. 키보드만으로 모든 구독의 사용 정도를 고를 수 있다.
- 컴포넌트 테스트와 390px 스크린샷.
- 커밋 메시지: "feat(fe): S1 구독 확인"
```

---

## F4. S2 홈과 절감 금액 시각화

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S2, 5절), lib/rules/index.ts (summarize, buildSuggestions)

목표: 이번 달 정리를 한눈에 보여준다. 이 화면이 시연 2분 중 가장 길게 보이는 화면이다.

해야 할 일
1. components/BigNumber: 숫자 + 라벨 + 보조 설명. 
2. 홈 상단 큰 숫자 3개: 이번 달 고정비 합계 / 거의 안 쓰는 구독 합계 / 아낄 수 있는 금액. 값은 summarize()와 suggestions에서 가져오고 화면에서 직접 더하지 않는다. "아낄 수 있는 금액"은 같은 구독에 제안이 둘이면 큰 쪽 하나만 센다 (이 계산은 lib/client/derive.ts에 두고 단위 테스트).
3. components/UsageBar: 사용 정도별 월 금액을 누적 막대 하나로, 아래에 "거의 안 쓰는 구독에 1년 동안 나가는 돈 ○○원". 차트 라이브러리 없이 CSS/SVG. 색만으로 구분하지 않고 범례에 글자.
4. 구독 카드 목록(variant 'summary', 사용 정도 색 점 + 글자). 누르면 /payment/[id].
5. 제안 미리보기 상위 2개 + "리포트에서 모두 보기" → /report. 제안이 아직 계산 중이면 Skeleton.
6. 파이프라인 4~5단계 연결: confirmAll 이후 혜택 판정 호출과 buildSuggestions. 서비스에 해당하는 혜택은 카탈로그에서 service_id로 찾고, school_license는 profile.school과 같은 것만. 제안 문장은 /api/message로 받아 바꿔 끼우되 실패하면 기본 문장 유지. 이 홈이 열릴 때 discovery 이벤트를 한 번만 보낸다 (FRONTEND.md 4부(프론트 명세) 7절).
7. components/TabBar(홈/혜택/리포트).
8. 빈 상태·오류 상태.

하지 말 것
- 절약액을 AI 문장에서 읽어 오지 않는다. 숫자는 rules가 만든 값만.
- 차트 라이브러리를 설치하지 않는다.

완료 기준
- 재은 사례 모의 데이터로 "거의 안 쓰는 구독 합계"가 24,100원으로 나온다 (이 값이 틀리면 백엔드에 알리고 멈춘다).
- derive 테스트, 390px 스크린샷.
- 커밋 메시지: "feat(fe): S2 홈과 절감 시각화"
```

---

## F5. S3 결제 상세

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S3)

목표: "이 결제가 뭐지?"에 답하는 화면. 홈을 거치지 않고 와도 말이 되어야 한다.

해야 할 일
1. /payment/[subscriptionId]: 위에 표기 그대로(예: "카카오페이 · 6,900원 · 매달 3일"), 가운데에 해석된 서비스·카테고리·근거 한 줄(reason), SourceBadge, ConfidenceLevel(확신도를 높음/보통/낮음 3단계로: 0.85 이상 높음, 0.7 이상 보통, 그 미만 낮음 — // TODO(팀) 기준값), 아래에 이 구독의 결제 목록.
2. "틀렸어요" → 서비스 검색 시트에서 고르기 → interpret_source 'user', needs_check false. 브라우저에만 저장한다는 한 줄 안내.
3. 존재하지 않는 id면 EmptyState로 홈 이동.
4. 이 화면을 처음 여는 사람을 위해 상단에 뒤로 가기와, 구독이 없을 때 "먼저 결제 내역을 넣어 주세요" 안내.

하지 말 것
- 해석 근거를 화면에서 새로 만들어 내지 않는다 (reason이 비어 있으면 "근거를 찾지 못했어요").

완료 기준
- 모의 모드에서 "카카오페이" 항목이 이모티콘 플러스로 해석된 근거와 AI 배지가 보인다. 틀렸어요로 바꾸면 홈의 카드 이름도 바뀐다.
- 컴포넌트 테스트와 390px 스크린샷.
- 커밋 메시지: "feat(fe): S3 결제 상세"
```

---

## F6. S4 혜택 찾기

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S4), FRONTEND.md 3부(계약) (3-2)

목표: 서비스를 검색하면 학생 할인·학교 라이선스와 자격 판정, 근거, 출처를 보여준다.

해야 할 일
1. 서비스 검색창(카탈로그). 상단에 "내 구독" 칩으로 바로 선택.
2. components/BenefitCard: 종류, 혜택 내용, 자격 판정(가능 / 어려워요 / 확인이 더 필요해요), quoted_conditions를 따옴표 인용으로, 출처 링크(새 탭, rel="noopener noreferrer"), FreshnessBadge(확인일 + stale이면 "재확인 필요").
3. 서비스를 고르면 해당 서비스의 혜택을 /api/benefits로 판정 (이미 판정한 건 캐시).
4. unknown + missing_info가 있으면 카드 안 InlineQuestion으로 바로 묻고(school_email → "학교 이메일로 인증할 수 있나요?" 등), 답하면 프로필을 갱신해 그 카드만 다시 판정한다.
5. validation이 'ok'가 아니거나 호출 실패면 "AI가 확인하지 못했어요. 공식 페이지에서 확인해 주세요" + 출처 링크.
6. 묶음 상품 구간은 자리만 만든다 (F8에서 채움). 혜택이 하나도 없으면 "이 서비스는 아직 등록된 혜택이 없어요".
7. 모든 혜택에 출처 링크와 확인일이 있는지 확인하는 컴포넌트 테스트 (빠지면 실패).

하지 말 것
- 판정이 yes가 아닌 혜택을 "받을 수 있어요"로 보여주지 않는다.
- 근거 인용을 화면에서 줄여 쓰거나 바꿔 쓰지 않는다 (서버가 검증한 원문 그대로).

완료 기준
- 모의 모드에서 yes / no / unknown 카드가 각각 올바르게 보이고, unknown에서 질문에 답하면 상태가 바뀐다.
- 390px 스크린샷.
- 커밋 메시지: "feat(fe): S4 혜택 찾기"
```

---

## F7. S5 절감 리포트와 실행 체크

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (3절 S5, 7절), FRONTEND.md 3부(계약) (3-4)

목표: 제안과 실행 기록. 이 화면의 체크가 성공 지표(실제로 해지·변경한 사람 수)를 잰다.

해야 할 일
1. components/SuggestionCard: 제목, message, 월·연 절약액, 해지 방법 링크(cancel_url, 없으면 숨김), 출처·확인일, PartnerBadge(is_partner), "재확인 필요"(stale).
2. 제안은 saving_monthly 큰 순서 그대로 보여준다. 제휴라서 위로 올리지 않는다.
3. components/ActionCheck: 해지했어요 / 바꾸었어요 / 유지할게요. 누르면 store.setAction과 api.events(action). 이미 누른 상태가 보이고, 바꿀 수 있다.
4. "유지할게요" → 이유 시트(볼 게 생길까 봐 / 많이 써서 / 기타) → api.events(keep_reason). "볼 게 생길까 봐"면 makePauseSuggestion으로 "쉬었다가 볼 때 다시 결제" 제안 카드를 바로 아래에 추가.
5. 맨 위 한 줄: 체크한 해지·변경의 절약액 합 ("해지·변경으로 월 ○○원").
6. 빈 상태: 제안이 없으면 "지금은 줄일 게 없어요" + 혜택 찾기로 이동.
7. 이벤트 전송 실패는 사용자에게 보이지 않게 조용히 재시도 1회 후 포기한다 (UI는 정상 동작).

하지 말 것
- 이벤트에 서비스 이름·금액·표기 이름을 넣지 않는다 (계약 3-4의 payload만).
- "해지하기" 버튼으로 실제 해지를 처리하지 않는다. 해지 방법 링크 안내만.

완료 기준
- 모의 모드에서 체크 → events 호출 payload가 계약 모양과 정확히 같은지 테스트로 확인. 유지 이유가 pause 제안을 만든다.
- 390px 스크린샷.
- 커밋 메시지: "feat(fe): S5 절감 리포트와 실행 체크"
```

---

## F8. 묶음 상품 비교 UI (P1 — 시간 남을 때)

```
전제: 백엔드 B11이 합쳐졌고 data/catalog/bundles.json에 사람이 채운 묶음이 있어야 한다. 없으면 여기서 멈추고 알려줘라.

해야 할 일
1. S4의 "묶음 상품" 구간과 S5의 제안에 compareBundles 결과를 보여준다. 제휴는 PartnerBadge, 확인일, 출처 링크.
2. rarely인 서비스의 묶음은 해지 제안 아래에 "계속 볼 거라면" 소제목으로.
3. 묶음 조건 해석을 AI가 맡는 경우(ENABLE_BUNDLE_AI=1)에만 /api/benefits에 kind:'bundle'을 보낸다. 그렇지 않으면 규칙 결과만 쓴다.
4. 절약액이 0 이하인 묶음은 아예 보이지 않는다.

완료 기준: 재은 사례 모의 데이터로 "네이버플러스 묶음 월 2,100원 절약"이 보이고, 같은 서비스를 거의 안 쓴다고 표시하면 해지 제안 다음 순서로 나온다. 390px 스크린샷.
커밋 메시지: "feat(fe): 묶음 상품 비교 UI"
```

---

## F9. 시연 모드와 백업

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (6절), docs/dev-guide/BACKEND.md 4부(백엔드 명세) (9절)

해야 할 일
1. /?demo=1: 페르소나 ①로 S0를 건너뛰고 S1로. 사용 정도는 사람이 눌러야 한다 (시연에서 보여줄 장면이므로 자동으로 채우지 않는다).
2. NEXT_PUBLIC_DEMO_CACHE=1: 샘플 페르소나일 때 data/samples/cached-ai.json의 결과를 쓰고 네트워크를 부르지 않는다. 파일이 없으면 일반 경로로 간다.
3. 발표자용 숨김 버튼(화면 하단 모서리 길게 누르기)으로 resetAll() 후 /?demo=1로 이동.
4. API 오류로 degraded가 되었을 때 ErrorBanner가 시연에서 거슬리지 않도록 한 줄로 작게.
5. docs/dev-guide/DEMO.md: 시연 순서(문제 30초 / 시연 2분 / 검증 1분 / 기술 1분 / 확장 30초 중 시연 2분의 화면 순서), 백업 영상 촬영 체크리스트, 시연 전 점검표(API 한도·잔액, 캐시 켜기, 배포 주소, 테스트 계정/브라우저 새로 고침).

완료 기준
- 네트워크를 끊은 상태(DevTools offline)에서 /?demo=1 → S1 → S2까지 돌아간다 (캐시가 있을 때).
- 커밋 메시지: "feat(fe): 시연 모드와 백업"
```

---

## F10. 마감: 접근성, 스모크 테스트, 배포 확인

```
먼저 읽을 것: docs/dev-guide/FRONTEND.md 4부(프론트 명세) (5, 8절)

해야 할 일
1. 접근성 점검: 모든 입력·버튼에 라벨, 포커스 순서, 시트의 포커스 가두기, 색 대비 AA, prefers-reduced-motion. 발견한 문제를 고친다. 못 고치는 건 목록으로.
2. Playwright 스모크 테스트 1개(tests/e2e/smoke.spec.ts, 모의 모드): S0 샘플 선택 → S1 사용 정도 전부 → "다음" → S2에 3개 숫자가 보임 → S5에서 체크 1개. CI에는 넣지 않고 npm run e2e로 로컬 실행 (CI는 LLM·브라우저 없이 가볍게).
3. 390×844와 1280×800 스크린샷을 화면 6개 모두 찍어 docs/dev-guide/screens/에 저장 (보고서·포스터 자료로도 쓴다).
4. 빈 상태·오류 상태가 화면마다 있는지 체크리스트로 보여준다.
5. 배포 점검(사람이 배포 주소를 알려주면): 환경 변수가 NEXT_PUBLIC_USE_MOCK=0인지, /?demo=1이 열리는지, NEXT_PUBLIC_GOOGLE_CLIENT_ID가 들어 있고 배포 주소가 Google OAuth의 승인된 JavaScript 원본에 있는지, 모바일 브라우저에서 Gmail 불러오기(테스트 계정)가 되는지 확인할 항목 목록을 만든다.

하지 말 것
- 새 기능을 추가하지 않는다. 이 단계는 다듬기만.

완료 기준: 스모크 테스트 통과, 스크린샷 저장, 남은 문제 목록.
커밋 메시지: "chore(fe): 접근성과 스모크 테스트"
```