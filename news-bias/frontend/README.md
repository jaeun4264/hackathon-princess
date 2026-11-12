# 뉴스 편향도 분석 — 프론트엔드

19팀(2026 인공지능학과 대학 연합 해커톤) 뉴스 편향도 분석 서비스의 웹 화면입니다.

- 기술: Next.js 15 (App Router) · JavaScript · Tailwind CSS v4 · shadcn/ui
- 담당: 남지원(프론트), 조서연(백엔드)

## 실행 방법

```bash
npm install      # 처음 한 번, 필요한 패키지 설치
npm run dev      # 개발 서버 실행 → http://localhost:3000
npm run build    # 배포 전에 오류 없이 만들어지는지 확인
```

## 폴더 구조

| 위치 | 하는 일 |
| --- | --- |
| `src/app/page.js` | 첫 화면 |
| `src/app/layout.js` | 모든 페이지를 감싸는 공통 틀 (제목, 언어 설정) |
| `src/app/globals.css` | 전체 색상·글꼴 설정 |
| `src/components/ui/` | 버튼·카드·배지·탭 같은 공통 부품 (shadcn/ui) |
| `src/lib/utils.js` | 부품에서 쓰는 작은 도우미 함수 |

## 부품 추가

shadcn/ui 부품이 더 필요하면 아래처럼 추가할 수 있습니다.

```bash
npx shadcn@latest add dialog
```
