# 뉴스 편향도 분석 — 백엔드

정치·사회 이슈를 언론사별로 모아 보여 주고, 기사마다 인용 출처·사실/의견·평가가 담긴 표현·빠진 관점을 비교하는 서비스의 백엔드입니다.

- 백엔드: 조서연 · 프론트엔드: 남지원 (프론트 저장소 Jiwon-s-Portfolio/news-front)
- 기술: Python 3.11+, FastAPI
- 데이터 형식: 프론트의 `docs/data-format.md`와 같음 → 자세한 내용은 `docs/API.md`

## 처음 실행하기 (Windows, Anaconda Prompt 기준)

```bash
cd %USERPROFILE%\Documents\news-bias-backend
conda create -n newsbias python=3.11 -y
conda activate newsbias
pip install -r requirements.txt
```

## 자주 쓰는 명령

```bash
python -m app.build              # 프론트에 줄 data/news.json 만들기 (검사 포함)
uvicorn app.main:app --reload    # 서버 실행 → http://127.0.0.1:8000/docs
pytest                           # 테스트
```

## 기사 수집과 라벨링

```bash
python -m app.collect "검색어" --count 500 --sort date   # NAVER API HUB로 기사 모으기 → data/raw/
python -m app.labeling 채우기                            # 본문 txt → 라벨링 표에 문장 채우기
python -m app.evaluate 비교 라벨링표_서연.xlsx 라벨링표_지원.xlsx   # 두 사람 일치도(카파) + 비교_결과.xlsx
python -m app.evaluate 정답 비교_결과.xlsx               # 논의로 채운 '최종' 칸 → 정답_1차.xlsx
python -m app.rules 라벨링표_1차.xlsx                    # 키워드 규칙 기준선 → 라벨링표_규칙.xlsx
python -m app.analyze 라벨링표_1차.xlsx --모델 gemini-3.8-flash gemini-3.5-flash-lite  # 두 모델로 분석 → 라벨링표_AI_<모델>.xlsx (.env 의 GEMINI_/ANTHROPIC_API_KEY)
python -m app.evaluate 채점 정답_1차.xlsx 라벨링표_AI_gemini-3.8-flash_p2.xlsx 라벨링표_AI_gemini-3.5-flash-lite_p2.xlsx 라벨링표_규칙.xlsx  (_p2 = 프롬프트 v2)  # 두 모델 비교
python -m app.evaluate 채점 정답_1차.xlsx 라벨링표_AI_<모델>.xlsx   # 정확도, 의견 재현율, 출처 유형별 재현율
```

라벨링 관련 파일은 모두 `data/raw/labeling/` 에 있고 GitHub에 올리지 않습니다 (기사 문장 포함).
사람 라벨링이 끝나기 전에는 규칙·AI 결과 파일을 열어 보지 않습니다.

## 폴더 구조

```
app/schemas.py    데이터 형식 (프론트 data-format.md와 같은 모양)
app/mock_data.py  가짜 기사 데이터 (나중에 실제 수집·분석 결과로 교체)
app/metrics.py    규칙으로 계산하는 지표 (빠진 관점)
app/build.py      news.json 만들기 + 문제 검사
app/main.py       API 서버 (GET /news)
app/collect.py    기사 수집 (NAVER API HUB)
app/labeling.py   라벨링 표에 문장 채우기
app/evaluate.py   일치도·정확도 계산
app/rules.py      키워드 규칙 기준선
app/analyze.py    LLM 분석
app/pairs.py      인용 기울기 쌍 비교 검증 (python -m app.pairs 만들기 / 채점)
app/daily.py      매일 자동 실행: 수집→이슈 묶기→원문 분석→news.json (python -m app.daily [--미리보기])
app/cluster.py    같은 사건 기사 자동 묶기
app/fetch.py      원문 본문 가져오기 (robots.txt 확인, 저장 안 함)
.github/workflows/daily.yml  GitHub Actions 예약 실행 (08시·17시)
app/members.py    국회의원 소속 사전 (python -m app.members 받기 / analyze --소속사전)
app/reading.py    열람 기록 저장 (POST·GET /reading-history, GET /reading-stats)
app/syntitan.py   Syntitan 진단·보강용 표 (python -m app.syntitan 진단 정답_1차.xlsx)
app/candidates.py  수집 기사 → 후보 목록 CSV (python -m app.candidates 검색어 --날짜 YYYY-MM-DD)
app/from_labels.py 라벨링 표 → 실제 기사 데이터 (python -m app.build 실제, 설정은 data/issues.json)
data/news.json    프론트에 넘기는 결과 파일
data/raw/         수집한 기사 원문 (GitHub에 올리지 않음)
tests/            테스트
.env              비밀 키 (직접 만들기, GitHub에 올리지 않음 — .env.example 참고)
```
