# 프론트엔드 문서 — 고정비 관리 시스템

개발 가이드는 파일 4개예요: `BACKEND.md`, `BACKEND_PROMPTS.md`(민경 님), `FRONTEND.md`, `FRONTEND_PROMPTS.md`(재은 님). **재은 님 (프론트)은 `FRONTEND.md`와 `FRONTEND_PROMPTS.md`만 보면 돼요.** 근거 문서는 기획서·개발 PRD (Claude Docs)예요.

| 부 | 내용 |
| --- | --- |
| 1부 | 시작 전에 (공통): 합의할 것, 0단계, 사람이 할 일, 일정, 정해진 것·안 만드는 것 |
| 2부 | 저장소 규칙 (AI 도구가 지킬 것) |
| 3부 | 계약: 타입·API·소유권·환경 변수 (프론트와 백엔드 공통) |
| 4부 | 프론트 명세 |

- 1~3부는 `BACKEND.md`와 `FRONTEND.md`에 **똑같이** 들어 있어요. 고치면 두 파일 다 고쳐요.
- 저장소 위치: 4개 파일을 `fixed-cost/docs/dev-guide/`에 넣어요. 0단계에서 2부(규칙)를 `fixed-cost/AGENTS.md`와 `fixed-cost/CLAUDE.md`로 복사해요. Codex와 Claude Code가 이 파일을 자동으로 읽기 때문이에요.
- AI 도구는 항상 `fixed-cost/` 안에서 열어요.

---

# 1부. 시작 전에 (공통)

## 담당자와 먼저 합의할 4가지 (코드 짜기 전에)

민경 님(백엔드)과 아래 4가지를 먼저 맞춰요. 칸 "가이드에 적어 둔 것"은 **제가 제안한 값**이고, 합의가 끝나면 "결정" 칸을 채워요. 역할은 재은 = 프론트, 민경 = 백엔드로 PRD에 적어 뒀어요("민경님이 백엔드"라는 말을 근거로 한 것).

| # | 합의할 것 | 가이드에 적어 둔 것 (제안) | 아직 확인할 것 | 위치 | 결정 |
| --- | --- | --- | --- | --- | --- |
| 1 | 프론트엔드 기술 | Next.js(App Router) + TypeScript + Tailwind. 화면과 서버 API를 한 저장소·한 앱에서 | 두 사람의 개발 경험. 프론트가 부담되면 큐빅 자료의 A안(Streamlit 하나로 화면+호출)이 대안이지만 폰 화면 완성도는 낮아져요 | 0단계 프롬프트, PRD 아키텍처 | 미정 |
| 2 | 데이터 형식 | 요청·응답 JSON 5개와 공통 타입(구독, 제안, 혜택 판정 등) | 민경 님이 이 모양으로 괜찮은지. 바꾸고 싶으면 `[계약]` PR | 3부(계약) 2~3절 | 미정 |
| 3 | GitHub 협업 | 저장소 `jaeun4264/hackathon-princess`(Public), 앱 폴더 `fixed-cost/`, 브랜치 `be/…`·`fe/…`, `main` 직접 푸시 금지 + PR 1명 승인, 폴더 소유권 표 | **민경 님 접근 권한**: 저장소 주인(재은 님)이 Settings → Collaborators에서 초대(Write)하거나, 초대 없이 fork 후 PR. 뉴스 쪽 두 분도 같은 저장소라 `fixed-cost/` 밖은 건드리지 않기로 말해 두기 | 3부(계약) 1·7절, 아래 사람이 할 일 | 미정 |
| 4 | 배포 방식 | 프론트와 백엔드를 **따로 배포하지 않고** Next.js 앱 하나를 Vercel에 배포 (API 라우트가 서버 역할). Root Directory `fixed-cost`. 키는 Vercel 환경 변수에만 | 어느 계정의 Vercel에 올릴지, 무료 플랜에서 협업자의 커밋·PR 미리보기가 배포되는지(PRD도 "무료 범위는 정책 확인"으로 남겨 둠, 저는 확인하지 못했어요), 테스트 집계 저장소(Supabase 등) 사용 여부 | 아래 사람이 할 일 1~2번 | 미정 |

## 0단계 — 재은 님이 먼저 (11/4~5)

둘이 동시에 시작하면 파일이 꼬여요. 재은 님이 `FRONTEND_PROMPTS.md`의 **0단계**(앱 뼈대)를 먼저 돌려 `main`에 합친 뒤, 민경 님은 B1, 재은 님은 F1부터 동시에 시작해요.

## 사람이 할 일 (0단계 뒤)

1. Vercel에서 저장소를 연결하고 **Root Directory를 `fixed-cost`로** 지정 → 빈 배포 주소에서 Hello가 열리는지 확인 (PRD 11/4~5 완료 기준)
2. LLM 제공사 계정과 키 만들기 → Vercel 환경 변수에만 입력. 제공사 쪽에서 **사용 한도(월 지출 상한)를 먼저 설정**
3. 브랜치 보호: `main`에 직접 푸시 금지, PR 1명 승인
4. 민경 님을 저장소 Collaborator(Write)로 초대하거나 fork 방식으로 정하기 (저장소 주인만 할 수 있어요)
5. Vercel 프로젝트를 누구 계정에 만들지 정하고, 협업자 커밋이 배포되는지 첫 PR로 확인
6. **Gmail 연결 준비 (11/4 결정, 11/8 전까지)**: Google Cloud에서 프로젝트 만들기 → Gmail API 사용 설정 → OAuth 동의 화면(외부 사용자) → OAuth 클라이언트 ID(유형: 웹 애플리케이션), 승인된 JavaScript 원본에 `http://localhost:3000`과 Vercel 배포 주소 → 클라이언트 ID를 Vercel 환경 변수 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`에 입력. 클라이언트 보안 비밀번호는 쓰지 않아요.
   - 검증 전 앱은 이 프로젝트 전체 기간에 **새 사용자 100명까지**만 쓸 수 있어요(Google 도움말 확인). 10명 테스트와 팀원 계정으로 충분하니 다른 테스트로 한도를 쓰지 않아요.
   - 테스트 단계 앱은 테스트 사용자로 등록한 Gmail만 로그인할 수 있다고 알고 있어요 **[확인 필요]**. 그렇다면 10명의 Gmail 주소를 미리 받아 등록해요.
   - 정식 출시에는 Google 검증과 보안 평가가 필요해요(약 6주). 해커톤 범위 밖이에요.
7. 카탈로그 `email_domains`: 팀원 메일함에서 각 서비스 영수증 메일의 **실제 발신 주소**를 확인해 채워요. AI 도구가 추측해 넣으면 안 돼요.

## 일정 (제안, PRD 일정에 맞춤)

| 기간 | 백엔드 | 프론트 | 사람이 할 일 |
| --- | --- | --- | --- |
| 11/4~5 | 0단계(한 명) | — | Vercel 연결, 키·한도, Google OAuth 준비(6번) |
| 11/5~8 | B1 → B2 → B3 (Gmail 변환 포함) | F1 → F2 (Gmail 모의 모드) → F3 | 대학생 인터뷰 5명, 카탈로그 값·영수증 발신 도메인 수집, 테스트 사용자 Gmail 받기, 중간 보고서(11/8) |
| 11/9~12 | B4 → B5 → B6 → B7 → B8 | F4 → F5 → F6 → F7 | 멘토링(11/10~12). **11/12까지 S0→S5가 배포 주소에서 끝까지 동작** |
| 11/13~15 | B9 → B10 → (B11) → B12 | (F8) → F9 → F10 | 10명 테스트, 평가 실행, 프롬프트 개선 후 2차 평가 |
| 11/16 | 최종 제출 | | |

핵심 연결 시점: **B5·B7·B8이 합쳐지면** 프론트는 `NEXT_PUBLIC_USE_MOCK=0`으로 바꿔 실제 서버로 한 번 돌려 봐요. 계약이 어긋나면 `[계약]` PR로 고쳐요.

## 도구 (백엔드 민경 님 = Codex, 프론트 재은 님 = 저장소를 읽는 도구)

역할(들은 대로): **민경 님 = 백엔드, 재은 님 = 프론트.** PRD 역할 표에도 반영했어요.

- 민경 님은 **Codex**를 써 보기로 했어요. 방법은 BACKEND.md 5부의 "Codex로 하는 법". Codex는 저장소 폴더를 읽고 직접 고치므로 `BACKEND_PROMPTS.md`의 프롬프트를 거의 그대로 써요. `AGENTS.md`를 자동으로 읽어요.
- Codex가 설치·로그인·Windows 환경에서 막히면 시간을 쓰지 말고 BACKEND.md 5부의 "ChatGPT 웹으로 하는 법"(ChatGPT 웹, 붙여 넣기 방식)로 전환해요.
- 프론트 쪽은 저장소를 읽고 직접 파일을 고치는 도구(Claude Code 등)를 쓰는 걸 전제로 써 뒀어요.
- 두 사람이 다른 도구를 써도 **계약(3부(계약))과 테스트가 같으면** 합칠 수 있어요. PR에는 "완료 기준" 명령의 실행 결과를 붙여요.
- 도구마다 모델 성능이 달라서 같은 프롬프트도 결과가 달라요. 그래서 **내 터미널의 테스트 결과만 믿고**, 코드 모양은 PR에서 훑어봐요.
- Codex의 설치 방법·지원 플랜·Windows 지원은 서드파티 글 1곳으로만 확인했어요. 공식 문서와 대조가 필요해요.

## 병렬로 일하는 법

- 백엔드와 프론트는 **브랜치와 폴더가 달라서** 동시에 AI 도구를 돌려도 충돌이 거의 없어요(3부(계약) 1절).
- 하루 한 번 `main`을 받아요(`git pull --rebase origin main`).
- 한 단계 끝날 때마다 PR → 상대방이 훑어보고 합침. 상대 폴더를 고쳐야 할 것 같으면 PR 댓글로 요청.
- AI 도구가 "이 값을 모르겠다"고 멈추면 **임의로 채우지 않았다는 신호**예요. 사람이 값을 주고 계속 시켜요.

## 정해진 것

| 항목 | 결정 | 반영 위치 |
| --- | --- | --- |
| 결제 내역 입력 방식 | **Gmail 영수증 연결** (11/4). 예비로 CSV, 영수증 없는 결제는 직접 추가 | 01 계약(`GmailMessageLite`, `email_domains`, 환경 변수), 02 2절, 03 B3, 04 S0, 05 F2 |

## 아직 만들지 않는 것 (팀 판단 대기 — 기획서 "팀 판단이 필요한 것")

| 항목 | 지금 코드에서 | 결정되면 |
| --- | --- | --- |
| 청년 월세 지원 | 없음 | 카탈로그·판정 범위가 크게 늘어서 별도 계획 필요 |
| 통신비 | 없음 | 서비스 카탈로그 확장 |
| 학교 범위 (고려대 / 이화여대) | S1 드롭다운에 TODO | 목록 확정 + 혜택 카탈로그 |
| 결제일 D-3 "이번 달 썼어요?" 확인 | 없음 | 알림은 웹앱 한계가 있어 시연은 "날짜 바꾸기" 버튼 방식 등을 정해야 함 |
| 묶음 조건 해석을 AI가 맡을지 | `ENABLE_BUNDLE_AI` 스위치 | 켜면 T2가 `bundle`도 판정 |
| F7 저장소 (Supabase 등) | 메모리 구현 | 10명 테스트 전에 확정 |
| LLM 제공사·모델 | 환경 변수 | 후보 2개를 평가(B10)로 비교 |
| Syntitan 사용 범위 | 비교 표에 빈 칸 | 멘토링(11/10~12)에서 확인 후 사람이 채움 |

## 사람이 직접 채워야 하는 값 (AI 도구가 지어내면 안 되는 것)

- `data/catalog/benefits.json`: 혜택마다 **공식 페이지 조건 원문**, 출처 URL, 확인일. 초기 후보: 피그마, 노션, 제미나이, 고려대 Super LLM
- `data/catalog/bundles.json`: 묶음 3~5개의 가격·조건 원문·출처·확인일 (기획서 후보 4개 중 "현재 판매 확인 필요" 표시된 것은 판매 여부부터 확인)
- `data/catalog/services.json`: Claude Pro 원화 금액, 지니뮤직 등 `null`로 남은 가격, 서비스별 영수증 발신 도메인(`email_domains`)
- 티빙 베이직 9,500원 (기획서 합계에서 역산한 값이라 공식 페이지로 재확인)
- `eval/cases/t1.json`, `t2.json`의 정답과 T2 조건 원문 (정답은 팀원 두 명이 각자 정하고 갈리면 빼기)
- 개인정보 안내 문구 최종본

## 검증 안 된 부분 (솔직하게)

- 이 가이드의 코드·프롬프트는 **아직 실행해 본 적이 없어요.** 단계마다 테스트가 통과하는지 확인하면서 가요.
- 실제 LLM 모델이 JSON 형식을 얼마나 잘 지키는지, 후보 만들기 규칙(금액이 같은 요금제만 후보)이 T1 정답률에 어떤 영향을 주는지는 B10 평가로 확인해야 해요.
- 프론트의 `found_count`(몰랐던 구독·혜택을 발견한 수) 정의는 제가 정한 가정이에요: "거의 안 씀으로 표시된 구독 수 + 판정이 yes인 혜택·묶음 수". 성공 지표(10명 중 6명 발견)의 "발견"을 팀이 어떻게 셀지 정한 뒤 FRONTEND.md 4부(프론트 명세) 7절을 고쳐요.
- 금액 허용 오차 3%, 확신도 기준 0.7, 서버리스에서의 메모리 캐시·한도 카운터 동작은 모두 가정이고, 평가·배포에서 확인이 필요해요.
- Gmail: 검증 전 새 사용자 100명 한도와 정식 출시 시 검증·보안 평가는 Google 도움말로 확인했어요. 테스트 단계의 테스트 사용자 등록 방식, 브라우저에서 Gmail API를 바로 부르는 방식(토큰 방식)의 세부 동작, 한국 서비스들이 실제로 영수증 메일을 보내는지는 **직접 확인하지 못했어요.** 0단계 뒤 테스트 계정 하나로 먼저 확인해요.
- Gmail 검색어(`newer_than:6m` + 도메인·키워드)는 제 제안이에요. 외화 영수증은 11/7 결정으로 공개 환율(유럽중앙은행 기준, Frankfurter)로 환산하고 '확인 필요'로 표시해요. 환율을 못 받으면 예전처럼 건너뛰어요.

---

# 2부. 저장소 규칙

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

---

# 3부. 계약 (프론트 ↔ 백엔드)

이 문서가 두 사람(또는 서로 다른 AI 도구를 쓰는 두 사람)이 서로 기다리지 않고 일하게 해 주는 약속이에요.
**타입과 API 모양은 여기서만 정하고**, 바꿀 때는 아래 7번 절차를 따라요.
근거: 개발 PRD (고정비 관리 시스템 — 개발 PRD). PRD와 다르면 PRD가 우선이고, 이 문서를 고쳐요.

---

## 1. 소유권 (누가 어느 폴더를 고치나)

앱은 저장소의 `fixed-cost/` 안에 둬요. (뉴스 팀과 같은 저장소라서)

| 영역 | 폴더·파일 | 소유 |
| --- | --- | --- |
| 화면 | `app/` (api 제외), `components/`, `lib/client/`, `lib/mocks/`, 스타일 | **프론트** |
| 서버 API | `app/api/`, `lib/llm/`, `lib/events/` | **백엔드** |
| 규칙·입력 어댑터 | `lib/rules/`, `lib/adapters/` | **백엔드** (프론트는 `index.ts`로만 가져다 씀) |
| 데이터 | `data/catalog/`, `data/samples/` | **백엔드** (값은 사람이 수집) |
| 평가·테스트 | `eval/`, `tests/` | **백엔드** |
| 타입·스키마 | `lib/types.ts`, `lib/schemas.ts`, `lib/api-client.ts` | **공통 (변경은 7번 절차)** |

남의 폴더는 읽기만 해요. 고치고 싶으면 그 사람에게 요청하거나 PR 댓글로 제안해요.

---

## 2. 공통 타입 (`lib/types.ts`)

```ts
// ---------- 기본 ----------
export type Interval = 'monthly' | 'yearly';
export type Usage = 'often' | 'sometimes' | 'rarely'; // 자주 / 가끔 / 거의 안 씀
export const USAGE_LABEL: Record<Usage, string> = {
  often: '자주',
  sometimes: '가끔',
  rarely: '거의 안 씀',
};

// ---------- 입력 ----------
// 브라우저가 Gmail에서 읽은 메일을 줄인 모양. 이 객체는 브라우저 밖(서버·AI)으로 보내지 않는다.
export interface GmailMessageLite {
  id: string;                // Gmail 메시지 id (중복 제거용)
  received_at: string;       // 수신 시각 ISO 문자열 (internalDate를 변환)
  from_name: string;         // 발신자 표시 이름 (예: 'Netflix')
  from_domain: string;       // 발신 주소의 도메인 (예: 'netflix.com')
  subject: string;
  text: string;              // 본문을 일반 텍스트로 (HTML이면 태그 제거). 최대 20,000자
}

export interface GmailParseResult {
  transactions: Transaction[];
  // one_time: 앱 마켓 영수증의 단건 구매(앱 내 구입)
  skipped: { message_id: string; reason: 'no_amount' | 'foreign_currency' | 'not_receipt' | 'duplicate' | 'one_time' }[];
}

// 앱 마켓 영수증이 "자동 갱신"을 직접 적었을 때만 있어요. 값은 영수증에 적힌 것만 넣고 모르면 null.
export interface Renewal {
  interval: Interval | null;         // '(월간)'·'(연간)'·'매월' 등이 적혀 있을 때만
  next_date: string | null;          // 영수증의 다음 갱신일
  trial_end: string | null;          // 무료 체험 종료일 (무료 체험일 때만)
  price_after_trial: number | null;  // 무료 체험 뒤 청구될 금액 (영수증에 적힌 값)
}

// 무료 체험 중인 구독. amount·monthly_amount는 0원 (합계·절약액에 넣지 않아요).
export interface TrialInfo {
  end: string;                       // 무료 체험 종료일 = 첫 결제 예정일
  price_after: number | null;        // 그때부터 청구될 금액
}

export interface Transaction {
  id: string;
  date: string;              // 'YYYY-MM-DD'
  amount: number;            // 원, 정수
  currency: 'KRW';
  raw_name: string;          // 영수증 발신자·명세서에 찍힌 표기 그대로 (예: '카카오페이')
  payment_method: string;    // 예: 'kakaopay', 'apple', 'card'
  source: 'sample' | 'csv' | 'gmail' | 'manual';
  // 외화 영수증을 환율로 환산했을 때만 있어요 (세 필드가 함께). amount는 환산한 원화(추정)이고 카드 청구액과 다를 수 있어요.
  original_currency?: 'USD' | 'EUR' | 'JPY' | 'GBP';
  original_amount?: number;  // 영수증의 원래 금액 (예: 20.00)
  fx_date?: string;          // 환산에 쓴 환율 기준일 'YYYY-MM-DD'
  renewal?: Renewal;         // 앱 마켓 영수증이 자동 갱신을 명시했을 때만. 있으면 결제가 한 번뿐이어도 구독 후보. 브라우저 밖으로 안 보냄
}

export interface UserProfile {
  school: string;            // 예: '고려대학교'
  status: '재학' | '휴학' | '대학원' | '졸업예정' | '기타';
  school_email: boolean;     // 학교 이메일 인증 가능 여부
  grade?: number;
  age_18_plus?: boolean;     // 만 18세 이상이라고 본인이 답했는지. 생년월일·나이는 받지 않아요. 없으면 모름
}

// ---------- 구독 ----------
export interface Subscription {
  id: string;
  service_id: string | null;       // 카탈로그 id. 모르면 null
  display_name: string;
  category: string;
  raw_name: string;
  amount: number;                  // 1회 결제 금액 (원)
  interval: Interval;
  monthly_amount: number;          // 월 환산 (원). yearly는 Math.round(amount / 12). 코드가 계산
  next_date: string | null;
  usage: Usage | null;             // S1에서 사용자가 탭. 이게 null이면 S1을 못 넘어감
  confidence: number;              // 0~1
  interpret_source: 'catalog' | 'ai' | 'user' | 'unknown';
  needs_check: boolean;            // true면 화면에 '확인 필요' 표시
  user_confirmed: boolean;
  evidence_transaction_ids: string[];
  trial?: TrialInfo;               // 무료 체험 중일 때만 (앱 마켓 영수증 근거)
}

export interface SubscriptionCandidate {   // F2 출력 (아직 해석 전)
  key: string;
  raw_name: string;
  amount: number;
  interval: Interval;
  payment_method: string;
  transaction_ids: string[];
  next_date: string | null;
  trial?: TrialInfo;
}

// ---------- 카탈로그 (data/catalog/*.json) ----------
export interface ServicePlan {
  id: string;
  name: string;
  price: number | null;      // 모르면 null. 지어내지 않는다
  interval: Interval;
}
export interface CatalogService {
  id: string;
  name: string;
  category: string;
  aliases: string[];         // 명세서·영수증에 찍히는 이름들
  email_domains: string[];   // 영수증 메일 발신 도메인 (예: 'netflix.com'). 사람이 실제 메일로 확인해 채움, 모르면 []
  plans: ServicePlan[];
  cancel_url: string | null;
  checked_at: string | null; // 'YYYY-MM-DD'
}
export interface CatalogBenefit {
  id: string;
  service_id: string;
  kind: 'student_discount' | 'school_license';
  school: string | null;     // school_license면 학교명
  conditions: string;        // 공식 페이지의 조건 원문. 요약·번역 금지
  benefit_text: string;
  price_after_monthly: number | null; // 혜택 적용 후 월 금액. 무료면 0, 모르면 null
  source_url: string;
  checked_at: string;
}
export interface CatalogBundle {
  id: string;
  name: string;
  includes: { service_id: string; plan_id: string }[];
  price_monthly: number | null;
  member_of: string | null;               // 이 service_id 멤버십이 이미 있으면 가격이 달라짐 (예: 'naver_plus')
  price_monthly_if_member: number | null;
  conditions: string;                     // 조건 원문 ('1인 계정만' 등)
  is_partner: boolean;                    // true면 화면에 '제휴' 표시
  source_url: string;
  checked_at: string;
}

// ---------- API 결과 타입 (3절의 results 한 줄) ----------
export interface InterpretResult {
  key: string;
  service_id: string | null;
  category: string;
  confidence: number;
  reason: string;
  source: 'catalog' | 'ai' | 'unknown';
  needs_check: boolean;
}
export interface BenefitResult {
  kind: 'benefit' | 'bundle';
  id: string;
  eligible: 'yes' | 'no' | 'unknown';
  quoted_conditions: string[];
  missing_info: ('school' | 'status' | 'school_email' | 'grade' | 'age' | 'other')[];
  reason: string;
  source_url: string;
  checked_at: string;
  stale: boolean;
  validation: 'ok' | 'quote_failed' | 'ai_error';
}
export interface Catalog {
  services: CatalogService[];
  benefits: CatalogBenefit[];
  bundles: CatalogBundle[];
}

// ---------- 제안 ----------
export type SuggestionType =
  | 'cancel' | 'pause' | 'student_discount' | 'school_license' | 'bundle' | 'keep';

export interface Suggestion {
  id: string;
  type: SuggestionType;
  subscription_ids: string[];
  saving_monthly: number;          // 코드가 계산. 'keep'이면 0
  saving_yearly: number;           // saving_monthly * 12
  message: string;                 // T3 문장 또는 기본 문장
  message_source: 'ai' | 'fallback';
  source_url: string | null;
  checked_at: string | null;
  stale: boolean;                  // checked_at이 30일 넘으면 true → '재확인 필요'
  is_partner: boolean;
  cancel_url: string | null;
  action_status: 'none' | 'done' | 'changed' | 'kept';
  keep_reason: 'maybe_later' | 'heavy_use' | 'other' | null;
}
```

규칙
- 금액은 **항상 원 단위 정수**. 소수·문자열 금액 금지.
- 날짜는 `'YYYY-MM-DD'` 문자열.
- AI(LLM)가 만든 숫자는 어떤 필드에도 들어가지 않아요. 금액·절약액은 코드가 계산해요.

---

## 3. API (서버 라우트, 전부 `POST` JSON)

공통
- 요청 본문 20KB 이하, 항목 50개 이하.
- **AI가 실패해도 500을 내지 않아요.** `unknown` / `fallback`으로 정상 응답해요. (시연 중 장애 대비)
- 잘못된 요청은 `400 { error: { code, message } }`, 호출 한도 초과는 `429 { error: {...} }`.
- 서버는 요청 본문을 로그에 남기지 않아요.

### 3-1. `POST /api/interpret` — T1 결제 해석

```ts
// 요청
{ items: { key: string; raw_name: string; amount: number; interval: Interval; payment_method: string }[] }
// 응답 (items와 같은 순서·같은 key)
{ results: {
    key: string;
    service_id: string | null;      // 카탈로그 id 또는 null(unknown)
    category: string;               // 모르면 '기타'
    confidence: number;             // 0~1. 카탈로그 매칭이면 1
    reason: string;                 // 근거 한 줄 (S3에 그대로 보여 줌)
    source: 'catalog' | 'ai' | 'unknown';
    needs_check: boolean;           // source가 unknown이거나 confidence < 0.7
  }[] }
```

### 3-2. `POST /api/benefits` — T2 혜택·묶음 자격 판정

```ts
// 요청
{ user: UserProfile; targets: { kind: 'benefit' | 'bundle'; id: string }[] }
// 응답
{ results: {
    kind: 'benefit' | 'bundle';
    id: string;
    eligible: 'yes' | 'no' | 'unknown';
    quoted_conditions: string[];    // 조건 원문에서 그대로 따온 문장 (서버가 원문에 있는지 검증함)
    missing_info: ('school' | 'status' | 'school_email' | 'grade' | 'age' | 'other')[];
    reason: string;
    source_url: string;
    checked_at: string;
    stale: boolean;
    validation: 'ok' | 'quote_failed' | 'ai_error';   // 'ok'가 아니면 eligible은 항상 'unknown'
  }[] }
```
`bundle` 판정은 [제안] 항목이에요 (기획서 팀 판단 7번). 팀이 묶음 비교를 규칙으로 두기로 하면, 서버는 `kind: 'bundle'` 요청에 `400 { error: { code: 'bundle_not_supported' } }`을 내요.

### 3-3. `POST /api/message` — T3 제안 문장

```ts
// 요청 (자유 텍스트 없음. 숫자는 서버가 문장에 끼워 넣음)
{ type: SuggestionType; usage: Usage | null; service_name: string;
  params: { saving_monthly?: number; saving_yearly?: number; alt_name?: string } }
// 응답
{ message: string; source: 'ai' | 'fallback' }
```

### 3-4. `POST /api/events` — F7 익명 집계

```ts
{ session_id: string;   // 브라우저에서 만든 무작위 문자열. 사람과 연결되지 않음
  kind: 'discovery' | 'action' | 'keep_reason';
  payload:
    | { found_count: number }                                               // discovery
    | { suggestion_type: SuggestionType; status: 'done' | 'changed' | 'kept' } // action
    | { reason: 'maybe_later' | 'heavy_use' | 'other' } }                  // keep_reason
// 응답
{ ok: true }
```
결제 내역·서비스명·금액은 이 API로 보내지 않아요.

### 3-5. `GET /api/events/summary?token=...` — 테스트 결과 표

```ts
{ participants: number; discovered_ge1: number; acted_ge1: number;
  keep_reasons: { maybe_later: number; heavy_use: number; other: number } }
```
`token`이 `ADMIN_TOKEN`과 다르면 `401`.

---

## 4. 규칙 함수 (`lib/rules/index.ts`가 내보내는 것)

프론트는 브라우저에서 이 함수를 직접 불러 써요. (결제 내역을 서버에 보내지 않기 위해)
모두 **순수 함수**(같은 입력 → 같은 출력, 네트워크 없음)예요.

```ts
detectSubscriptionCandidates(txs: Transaction[], catalog: { services: CatalogService[] }): SubscriptionCandidate[]
buildSubscriptions(cands: SubscriptionCandidate[], interpreted: InterpretResult[], catalog): Subscription[]
monthlyEquivalent(amount: number, interval: Interval): number
summarize(subs: Subscription[]): { total_monthly: number; often_monthly: number; sometimes_monthly: number; rarely_monthly: number }
isStale(checkedAt: string | null, today: string): boolean            // 30일 초과면 true
buildSuggestions(input: { subs: Subscription[]; benefitResults: BenefitResult[]; catalog: Catalog; today: string }): Suggestion[]
makePauseSuggestion(sub: Subscription, today: string): Suggestion        // S5에서 "유지할게요 → 볼 게 생길까 봐"를 고른 뒤 '쉬기' 제안
compareBundles(input: { subs: Subscription[]; bundles: CatalogBundle[]; bundleResults?: BenefitResult[]; today: string }): Suggestion[]   // F8, P1
```
`message`는 규칙이 기본 문장으로 채우고, 프론트가 `/api/message`로 받은 문장으로 바꿔 끼워요.

---

## 5. 환경 변수 (`.env.example`에는 이름만)

| 이름 | 쓰는 곳 | 비고 |
| --- | --- | --- |
| `LLM_BASE_URL` | 서버 | OpenAI 호환 주소 (예: OpenRouter) |
| `LLM_API_KEY` | 서버 | **절대 커밋 금지.** Vercel·GitHub Secrets에만 |
| `LLM_MODEL` | 서버 | [팀 결정 필요] 후보 2개를 평가로 비교 |
| `LLM_DAILY_CAP` | 서버 | 하루 최대 호출 수 (예: 500) |
| `ADMIN_TOKEN` | 서버 | `/api/events/summary` 보호 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | 서버 | F7 저장소를 Supabase로 정하면. 없으면 메모리 |
| `ENABLE_BUNDLE_AI` | 서버 | `1`이면 묶음 조건 해석을 AI가 맡음 (팀 판단 7번 결정 후) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 브라우저 | Gmail 연결용 Google OAuth 클라이언트 ID (비밀 아님. 클라이언트 **보안 비밀번호는 쓰지 않음**) |
| `NEXT_PUBLIC_USE_MOCK` | 브라우저 | `1`이면 프론트가 서버 대신 `lib/mocks/` 사용 |
| `NEXT_PUBLIC_DEMO_CACHE` | 브라우저 | `1`이면 샘플 데이터는 저장된 AI 결과 사용 (시연 백업) |

`NEXT_PUBLIC_`이 붙은 변수는 브라우저에 노출돼요. 키·토큰은 절대 이 접두사를 쓰지 않아요.

---

## 6. 문구 규칙

- 화면 문구는 한국어 해요체. 사용 정도 라벨은 `USAGE_LABEL`만 써요.
- 가격·혜택에는 항상 **확인일**을 보여 주고, `stale`이면 "재확인 필요"를 붙여요.
- 제휴(`is_partner`) 상품에는 "제휴" 표시. 제휴 여부와 상관없이 **절약액이 큰 순서**로 보여 줘요. (신뢰 원칙)
- AI가 낸 결과에는 "AI가 추정했어요 · 틀리면 알려 주세요"를 붙일 수 있게 `source`를 화면까지 전달해요.

---

## 7. 계약을 바꾸는 절차

1. 바꾸고 싶은 사람이 PR을 열어요. 제목 앞에 `[계약]`.
2. PR이 고치는 파일은 **`lib/types.ts`, `lib/schemas.ts`, 이 문서(3~4절)** 세 개가 같이 있어야 해요.
3. 상대방이 승인해야 합쳐요.
4. 합쳐진 뒤 각자 `main`을 받아 자기 폴더의 타입 오류를 고쳐요.

급하면 메신저로 먼저 말하고 PR은 바로 뒤에 열어도 돼요. 말없이 타입만 고치는 건 금지예요.

---

# 4부. 프론트 명세

범위: `app/`(api 제외), `components/`, `lib/client/`, `lib/mocks/`, 스타일.
타입·API는 FRONTEND.md 3부(계약)가 기준이에요. 서버가 아직 없어도 `NEXT_PUBLIC_USE_MOCK=1`로 끝까지 만들 수 있어요.

원칙 6개
1. **폰 화면이 기본.** 390px 너비에서 먼저 만들고, 데스크톱은 가운데 정렬 컬럼(최대 480px)으로 충분해요.
2. **사용자 데이터는 브라우저에만.** 결제 내역은 서버로 보내지 않아요. 서버에 가는 건 계약 3절의 최소 필드뿐.
3. **AI가 한 일은 숨기지 않아요.** AI가 추정한 건 "AI가 추정했어요", 확신이 낮은 건 "확인 필요".
4. **신뢰 표시는 빠짐없이.** 확인일, "재확인 필요", "제휴" 표시, 출처 링크.
5. **막다른 길이 없게.** 로딩·빈 상태·오류마다 다음에 할 수 있는 행동을 보여 줘요. 서버가 죽어도 "확인 필요"로 계속 진행돼요.
6. **3번 안에 가치.** S0에서 "샘플로 체험"을 누르면 3탭(체험 → 사용 정도 → 홈) 안에 절약액이 보여야 해요. (시연 2분을 위해)

---

## 1. 화면과 경로

| 화면 | 경로 | PRD | 한 줄 |
| --- | --- | --- | --- |
| S0 데이터 넣기 | `/` | F1·F9 | 샘플 체험 / **Gmail 영수증 불러오기** / 구독 직접 추가 |
| S1 구독 확인 | `/confirm` | F4 | AI가 찾은 구독을 고치고 사용 정도를 한 번씩 탭 |
| S2 홈 | `/home` | E | 월 합계, 거의 안 쓰는 합계, 아낄 수 있는 금액 |
| S3 결제 상세 | `/payment/[subscriptionId]` | F3 | "이게 뭐지?" — 표기 → 해석 → 근거 → 틀렸어요 |
| S4 혜택 찾기 | `/benefits` | F5 | 서비스 검색, 학생 할인·학교 라이선스·묶음 |
| S5 절감 리포트 | `/report` | F6·F7 | 제안별 절약액, 해지 링크, 실행 체크 |

흐름: 처음엔 S0 → S1 → S2. 이후 S2에서 S3·S4·S5로 가는 입구가 있어요.
- 가드: 구독이 없으면 `/home`·`/report`는 `/`로, 사용 정도가 비어 있으면 `/home`은 `/confirm`으로 보내요.
- 하단 탭바(홈 / 혜택 / 리포트)는 S2·S4·S5에서만 보여요.

---

## 2. 상태 (`lib/client/store.ts`, Zustand + localStorage)

```ts
interface AppState {
  profile: UserProfile | null;
  transactions: Transaction[];          // 브라우저에만 저장
  subscriptions: Subscription[];
  benefitResults: BenefitResult[];
  suggestions: Suggestion[];
  sessionId: string;                    // 처음 한 번 만든 무작위 문자열 (익명 집계용)
  phase: 'empty' | 'interpreting' | 'confirming' | 'ready';
  // 액션: setProfile, loadTransactions, runInterpret, updateSubscription, setUsage,
  //       confirmAll, runBenefits, rebuildSuggestions, setAction, resetAll
}
```
- localStorage 읽기·쓰기는 전부 try/catch. 실패해도 화면은 동작해야 해요.
- **"내 데이터 지우기"** 버튼(설정 시트 안)이 `resetAll()`을 호출해요. 첫 화면 문구와 일치해야 해요.
- 서버 응답을 상태에 넣기 전에 `lib/schemas.ts`로 한 번 더 검사해요. 모양이 다르면 `needs_check`로 처리.

### API 호출 (`lib/api-client.ts` 사용)
- `NEXT_PUBLIC_USE_MOCK=1` → `lib/mocks/*.json`을 돌려 줘요(프론트 소유, 계약 타입에 맞게). 지연 300~800ms를 인공으로 넣어 로딩 화면도 확인할 수 있게.
- `NEXT_PUBLIC_DEMO_CACHE=1` → 샘플 페르소나는 `data/samples/cached-ai.json`을 사용.
- 네트워크 오류·타임아웃(10초)·`429` → 오류로 던지지 말고 `needs_check:true`/`unknown`으로 바꿔 계속 진행하고, 화면 위에 "일부는 AI 확인을 못 했어요" 배너 한 줄.

### 파이프라인 (`lib/client/pipeline.ts`)
1. `transactions` → `detectSubscriptionCandidates`(브라우저에서 실행)
2. 후보 → `/api/interpret`(항목 배치) → `buildSubscriptions`
3. S1에서 사용자가 확인·사용 정도 입력
4. 구독의 `service_id`에 해당하는 혜택 id들 → `/api/benefits` → `benefitResults`
5. `buildSuggestions` → 각 제안 → `/api/message`로 문장 받아 `message` 교체 (실패하면 규칙의 기본 문장 유지)
6. `/api/events`로 익명 결과 전송 (아래 7절)

---

## 3. 화면별 명세

### S0. 데이터 넣기 (`/`)
- 맨 위 한 줄(항상 보임): "결제 내역은 이 기기에서만 분석하고 서버에 저장하지 않아요. Gmail은 영수증 메일만 읽고, 메일 내용은 서버로 보내지 않아요. AI에는 결제 이름·금액·주기와 학교·재학 여부만 보내요." (정확한 문구는 팀이 다듬음)
- 큰 버튼 "샘플 데이터로 체험" → 페르소나 3개 중 선택(`listSamples()`), 선택하면 바로 S1.
- 입력 방식 영역: **Gmail 영수증 불러오기가 주 버튼** (11/4 팀 결정). `InputMethodPicker`는 배열(`[{id,label,enabled}]`)에서 그리고, 항목은 `gmail`(주), `csv`(작은 링크 "파일로 올리기", 예비). `capture`는 숨겨요.
- Gmail 흐름 (`lib/client/gmail.ts`, 프론트 소유):
  1. 버튼을 누르면 Google 로그인 창(Google Identity Services의 토큰 방식, 범위 `gmail.readonly`). 클라이언트 ID는 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
  2. 동의 전 안내 한 줄: "영수증 메일만 검색해요. 메일은 이 기기에서만 읽고 저장하지 않아요." 테스트 기간에는 Google이 "확인되지 않은 앱" 화면을 띄울 수 있다는 것도 미리 알려요.
  3. 받은 액세스 토큰은 **메모리에만** 두고 localStorage·쿠키·서버에 저장하지 않아요. 탭을 닫으면 끝.
  4. `buildGmailQuery(catalog)`의 검색어로 메시지 목록 → 각 메시지 본문을 받아 `GmailMessageLite`로 줄임(base64url 디코딩, text/plain 우선, 없으면 HTML 태그 제거, 2만 자까지) → `parseGmailMessages` → 이후 파이프라인은 다른 입력과 같아요.
  5. 메일 원문은 변환 직후 버리고 store에는 `Transaction`만 남겨요.
  6. 진행 표시: "영수증 메일 찾는 중 (n통)" → "결제 정리 중".
  7. 끝나면 요약: "외화 영수증 2통은 ○월 ○일 환율로 원화로 바꿨어요. 카드 청구액과 다를 수 있어 '확인 필요'로 표시했어요", "영수증이 없는 구독(카카오톡 알림 등)은 직접 추가해 주세요". 환율은 `lib/client/fx.ts`가 고정된 통화 목록으로만 요청해요(결제 정보는 보내지 않음). 환율을 못 받으면 외화 영수증은 건너뛰고 직접 추가로 안내해요.
  8. 오류: 권한 거부 → "Gmail 권한을 허용해야 불러올 수 있어요" + 샘플·직접 추가 안내. 영수증 0통 → 직접 추가로 안내.
  9. 모의 모드(`NEXT_PUBLIC_USE_MOCK=1`)에서는 Google에 접속하지 않고 `lib/mocks/gmail-messages.json`(가짜 메일)을 써요.
- "직접 추가": 서비스 검색(카탈로그 이름) 또는 이름·금액·주기 직접 입력 → 구독 1개로 추가(`interpret_source:'user'`).
- 학교·재학 상태는 S1에서 받아요(S0는 가볍게).
- 로딩: "결제 내역을 정리하고 있어요" + 진행 단계(구독 찾는 중 → 서비스 확인 중).
- 빈/오류: CSV(예비)는 형식이 틀리면 어떤 줄이 왜 안 읽혔는지(`skipped`)와 예시 형식을 보여 줘요.

### S1. 구독 확인 (`/confirm`)
- 구독 카드 목록. 카드마다: 서비스명, 금액·주기(월 환산 병기), 표기 이름(작게), 사용 정도 3분할 버튼 `자주 / 가끔 / 거의 안 씀`.
- 서비스명·금액·주기 수정(바텀 시트). 삭제("이건 구독이 아니에요").
- `needs_check`인 카드: 노란 테두리 + "확인 필요 · 카카오페이로만 보여요" 같은 사유 + 서비스 고르기(카탈로그 검색).
- 상단: 학교 선택(드롭다운, 기본 목록 `고려대학교`, `이화여자대학교`, `기타`), 재학 상태(재학/휴학/대학원/졸업예정/기타), 학교 이메일 인증 가능 여부(예/아니오/모르겠어요 → 모르면 false이고 T2가 missing_info로 물어봄).
- 하단 고정 버튼 "다음": **모든 구독에 사용 정도가 있어야 활성화.** 비활성일 때 남은 개수 "3개 더 눌러 주세요".
- 누르면 `confirmAll` → 혜택 판정과 제안 만들기를 백그라운드로 시작하고 S2로.

### S2. 홈 (`/home`)
- 큰 숫자 3개: **이번 달 고정비 합계 / 거의 안 쓰는 구독 합계 / 아낄 수 있는 금액**(제안 중 `cancel`·`student_discount`·`school_license`·`bundle`의 중복 없는 합. 같은 구독에 제안이 둘이면 큰 쪽 하나만).
- 시각화(E): 사용 정도별 월 금액 막대 하나(자주/가끔/거의 안 씀 누적) + "거의 안 쓰는 구독에 1년 동안 나가는 돈 ○○원". 라이브러리 없이 CSS/SVG로 만들어요.
- 구독 카드 목록(사용 정도 색 점). 카드를 누르면 S3.
- 제안 미리보기 상위 2개 + "리포트에서 모두 보기".
- 빈 상태: 구독이 없으면 S0로 안내.

### S3. 결제 상세 (`/payment/[subscriptionId]`)
- 위: **표기 그대로**(예: "카카오페이 · 6,900원 · 매달 3일")
- 가운데: **해석된 서비스**(이름, 카테고리) + 근거 한 줄(`reason`) + 해석 출처 배지(카탈로그 / AI가 추정 / 직접 입력) + 확신도(숫자 대신 높음·보통·낮음 3단계)
- 아래: 이 구독으로 이어진 결제 목록(날짜·금액)
- "틀렸어요" → 서비스 검색해서 바꾸기 → `interpret_source:'user'`, `needs_check:false`. 저장은 브라우저에만 (카탈로그에 별칭을 추가하는 건 팀이 나중에 수작업).
- 이 화면은 "결제 알림이 왔을 때"의 입구라서, 홈에서 거치지 않고 오는 경우를 위해 단독으로 읽혀도 말이 되어야 해요.

### S4. 혜택 찾기 (`/benefits`)
- 서비스 검색창(카탈로그). 내 구독 서비스는 상단 "내 구독"으로 바로 선택.
- 서비스를 고르면 해당 혜택 카드: 종류(학생 할인/학교 라이선스), 혜택 내용, **자격 판정**(가능 / 어려워요 / 확인이 더 필요해요), **근거 인용(`quoted_conditions`를 따옴표로)**, 출처 링크, 확인일, `stale`이면 "재확인 필요".
- `unknown` + `missing_info`가 있으면 카드 안에서 바로 묻기(예: "학교 이메일로 인증할 수 있나요?" 예/아니오) → 답하면 해당 항목만 다시 판정.
- 묶음(F8): 같은 화면 아래 "묶음 상품" 구간. 제휴면 "제휴" 배지. 절약액이 있을 때만.
- 판정을 못 했거나 `validation !== 'ok'`면 "AI가 확인하지 못했어요. 공식 페이지에서 확인해 주세요" + 출처 링크.

### S5. 절감 리포트 (`/report`)
- 제안 카드(절약액 큰 순): 제목, 문장(`message`), 월·연 절약액, 해지 방법 링크(`cancel_url`), 출처·확인일, 배지(제휴, 재확인 필요, AI가 쓴 문장 여부는 숨겨도 됨).
- 실행 체크 3버튼: **해지했어요 / 바꾸었어요 / 유지할게요** → `setAction` + `/api/events`(action).
- "유지할게요"를 누르면 이유 질문 한 번: 볼 게 생길까 봐 / 많이 써서 / 기타 → `/api/events`(keep_reason). **"볼 게 생길까 봐"**를 고르면 `makePauseSuggestion`으로 "쉬었다가 볼 때 다시 결제" 제안 카드를 만들어 보여 줘요.
- 맨 위 한 줄: 지금까지 체크한 절약액 합("해지·변경으로 월 ○○원").
- 빈 상태: 제안이 없으면 "지금은 줄일 게 없어요. 새 구독 전에 혜택 찾기를 써 보세요" → S4.

---

## 4. 컴포넌트 목록 (`components/`)

| 이름 | 쓰이는 곳 | 비고 |
| --- | --- | --- |
| `PrivacyNotice` | S0 | 한 줄 + "자세히" 시트 |
| `SubscriptionCard` | S1·S2 | `variant: 'confirm' \| 'summary'` |
| `UsageSegment` | S1 | 3분할 버튼, 키보드·터치 모두 |
| `NeedsCheckBadge`, `SourceBadge`, `ConfidenceLevel` | S1·S3 | AI 표시 |
| `FreshnessBadge` | S4·S5 | 확인일 + 재확인 필요 |
| `PartnerBadge` | S4·S5 | "제휴" |
| `BigNumber` | S2 | 숫자 + 라벨 + 보조 설명 |
| `UsageBar` | S2 | 사용 정도별 막대 |
| `BenefitCard` | S4 | 판정·인용·출처 |
| `SuggestionCard` | S2·S5 | 절약액·실행 체크 |
| `ActionCheck` | S5 | 3버튼 + 유지 이유 시트 |
| `BottomSheet` | 공통 | 접근성: 포커스 이동·ESC |
| `InlineQuestion` | S4 | missing_info 질문 |
| `ErrorBanner`, `EmptyState`, `Skeleton` | 공통 | |
| `TabBar` | S2·S4·S5 | |

---

## 5. 디자인·접근성 최소 기준

- 시스템 폰트 스택(한글 `Pretendard` 등 웹폰트는 선택). 본문 16px 이상, 터치 영역 44px 이상.
- 색만으로 상태를 구분하지 않아요(아이콘·글자 병행). 대비는 WCAG AA.
- 사용 정도 색: 자주 = 초록 계열, 가끔 = 노랑 계열, 거의 안 씀 = 빨강 계열 + 항상 글자.
- 모든 버튼·입력에 라벨. 시트는 포커스 가두기.
- 금액 표기 `13,500원`, 연 환산은 `연 289,200원`처럼.
- 애니메이션은 `prefers-reduced-motion`을 존중해요.

---

## 6. 시연 모드

- `/?demo=1`: 샘플 페르소나 ①로 S0를 건너뛰고 바로 S1. 시연 영상·라이브 시연 둘 다 이 주소로.
- `NEXT_PUBLIC_DEMO_CACHE=1`이면 AI 호출 없이 저장된 결과로 돌아가요 (API 장애 대비).
- 시연 중에 화면 아래 숨겨진 영역을 길게 누르면 `resetAll()`로 처음 상태로 돌아가는 버튼(발표자용).

---

## 7. 익명 집계 보내는 시점

| 시점 | 호출 |
| --- | --- |
| S2에 처음 들어옴 | `discovery`: `found_count` = 몰랐던 구독 또는 혜택을 발견한 수. 정의: 거의 안 씀으로 표시된 구독 수 + 판정이 `yes`인 혜택·묶음 수 (팀이 다르게 정하면 여기만 바꿔요) |
| 실행 체크 | `action` |
| 유지 이유 | `keep_reason` |

서비스 이름·금액은 보내지 않아요. `sessionId`는 한 번 만들어 localStorage에 둬요(없으면 메모리).

---

## 8. 품질 기준 (모든 단계 끝에)

```
npm run typecheck && npm run lint && npm test
```
- 화면 단계는 가능하면 Playwright로 **390×844** 스크린샷을 찍어 확인하고, 안 되면 사람에게 해당 주소를 열어 보라고 요청해요.
- 마지막 단계에서 Playwright 스모크 테스트 1개: S0 샘플 → S1 사용 정도 전부 → S2 숫자 보임 → S5 체크.