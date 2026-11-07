# 뉴스 편향도 분석 — 백엔드

정치·사회 이슈를 언론사별로 모아 보여 주고, 기사마다 인용 출처·사실/의견·프레이밍·빠진 관점을 근거 문장과 함께 보여 주는 서비스의 백엔드입니다.

- 백엔드: 조서연 · 프론트엔드: 남지원
- 기술: Python 3.11+, FastAPI

## 처음 실행하기 (Windows, Anaconda Prompt 기준)

```bash
cd %USERPROFILE%\Documents\news-bias-backend
conda create -n newsbias python=3.11 -y
conda activate newsbias
pip install -r requirements.txt
uvicorn app.main:app --reload
```

브라우저에서 http://127.0.0.1:8000/docs 를 열면 API 목록이 보입니다.

## 테스트

```bash
pytest
```

## 폴더 구조

```
app/        서버 코드 (main.py 가 시작점)
data/       데이터 (data/raw/ 원문은 GitHub에 올리지 않음)
tests/      테스트
.env        비밀 키 (직접 만들기, GitHub에 올리지 않음 — .env.example 참고)
```
