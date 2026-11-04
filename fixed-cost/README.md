# 고정비 관리 시스템

대학연합 해커톤 프로젝트의 0단계 앱과 B1 스키마·카탈로그 기반이에요. Next.js App Router, TypeScript, Tailwind CSS를 사용해요. 홈(`/`)에는 `Hello`만 표시해요.

## 실행

Node.js LTS(24 이상)와 npm이 필요해요. 저장소 루트에서 시작해요.

```sh
cd fixed-cost
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 열어요. 0단계와 B1에는 환경 변수나 API 키가 필요하지 않아요. `.env.example`에는 계약의 변수 이름만 있고 값은 비워 두었어요. 실제 `.env`는 생성하거나 커밋하지 않아요.

이 작업 환경에서 Turbopack의 CSS 처리용 하위 프로세스 오류가 재현되어 개발·빌드는 `--webpack`을 사용해요. TypeScript는 Next.js 린터와 호환되는 6.0.3으로 고정했고, 의존성 버전은 `package-lock.json`에 기록했어요.

## 검증

```sh
npm ci
npm run build
npm run typecheck
npm run lint
npm run test
npm run validate
```

계약 타입 import, 17개 스키마의 추론 타입 일치, 가격·날짜·근거 검증, 카탈로그 참조 무결성과 CLI 종료 코드를 테스트해요. CI는 `fixed-cost/`에서 `npm ci → typecheck → lint → test`를 실행하며 LLM을 호출하지 않아요.

설치 후 보안 조회에서 개발 도구의 `minimatch` 의존성에 중간 등급 경고 16개가 보고됐어요. 자동 수정 제안은 Next.js ESLint 구성을 호환되지 않는 구버전으로 낮추므로 적용하지 않았어요. 이 경고는 빌드·타입 검사·린트·테스트 실패와는 별개이며, 후속 의존성 업데이트에서 재확인이 필요해요.

2026-11-04 B1 검증: 빌드·타입 검사·린트·테스트(37개)·validate·validate:catalog가 통과했어요. 빌드는 샌드박스의 폴더 생성 권한 오류 후 권한을 확장하여 통과했어요. 이 Codex 환경에는 npm이 없어 임시 폴더의 npm CLI로 명령을 실행했어요. 일반 개발 환경에서는 npm이 포함된 Node.js LTS를 설치해 위 명령을 사용하면 돼요. 배포는 아직 하지 않았어요.

`validate`와 `validate:catalog`는 같은 실제 카탈로그 검증기를 실행해요. 초기 자료의 근거·보류 값·mock 구분은 [카탈로그 안내](data/catalog/README.md)에 있어요.

`eval:t1`, `eval:t2`, `eval:compare`, `snapshot:samples`, `e2e`는 아직 `not implemented`를 출력하고 성공 종료하는 자리 표시자예요. 실제 AI 평가·브라우저 테스트가 구현된 것은 아니에요. Playwright는 개발 의존성만 설치하며 브라우저는 설치하지 않아요.

## 개발 가이드

첨부한 개발 문서 원문 4개가 `docs/dev-guide/`에 있어요.

- [BACKEND.md](docs/dev-guide/BACKEND.md)
- [BACKEND_PROMPTS.md](docs/dev-guide/BACKEND_PROMPTS.md)
- [FRONTEND.md](docs/dev-guide/FRONTEND.md)
- [FRONTEND_PROMPTS.md](docs/dev-guide/FRONTEND_PROMPTS.md)

`AGENTS.md`와 `CLAUDE.md`는 FRONTEND.md 2부를 같은 내용으로 복사했어요. `lib/types.ts`는 3부 2절의 코드 블록 그대로이며, B1에서 `lib/schemas.ts`와 `lib/catalog.ts`를 구현했어요. 계약 타입·API 모양은 변경하지 않았어요.

## 작업 범위와 다음 단계

기존 파일을 수정하지 말라는 요청에 따라 저장소 루트 `.gitignore`는 유지하고, `fixed-cost/.gitignore`에 비밀 파일·의존성·빌드 결과 제외 규칙을 추가했어요. 루트에 추가한 파일은 `.github/workflows/ci.yml`뿐이에요. 기존 `news`, `fixed cost`, README 등은 수정하지 않아요.

B1의 스키마·카탈로그 기반까지 구현했어요. F1의 상태 관리·API 클라이언트·6개 화면과 B2 이후 백엔드 기능은 후속 단계예요. 배포 연결은 사람이 Vercel Root Directory를 `fixed-cost`로 설정해서 진행해요. `main` 병합은 검토와 승인 후 진행해요.
