# 프론트에 넘기는 데이터 (v0.3)

데이터 형식은 **프론트 저장소의 `docs/data-format.md`를 기준**으로 합니다 (11/4 합의). 백엔드는 그 모양 그대로 만듭니다.

## 넘기는 방법

| 단계 | 방법 | 상태 |
|---|---|---|
| 지금 | `python -m app.build` → `data/news.json` 생성 → 지원님이 프론트 `src/data/mock-news.json` 자리에 넣기 | 사용 중 |
| 백엔드 배포 후 | `GET /news` (같은 내용) | 준비됨 |

`python -m app.build`는 저장하기 전에 화면이 깨질 문제를 검사하고, 문제가 있으면 저장하지 않고 목록을 보여 줍니다.
- 없는 이슈·언론사·기사 id를 가리킴
- 평가가 담긴 표현(`framingTerms.term`)이 그 문장에 똑같은 글자로 없음 (화면 강조가 안 됨)
- 정의되지 않은 출처 유형 코드
- 인용 문장(`quote`)인데 출처 유형이나 인용한 사람이 비어 있음, 인용이 아닌 문장에 출처가 적혀 있음
- 기타(`etc`) 인용인데 원래 명칭(`sourceDetail`)이 비어 있음

## 합의한 것 (11/5)

- 인용 출처 유형: 전 분야 공통 5개 + 기타. `gov`(정부·여당), `opp`(야당), `expert`(전문가), `citizen`(시민·단체), `industry`(기업·업계, 11/7 프론트에 맞춰 biz→industry), `etc`(기타)
- 화면에는 주요 **5개 모두** 표시 → `issues[].displaySourceTypes` = `["gov","opp","expert","citizen","industry"]` (정해진 순서, 0건인 유형도 포함해 "○○ 인용 없음" 표시 가능). `etc`(기타)를 화면에 어떻게 보일지는 프론트에서 결정
  - (처음엔 상위 4개였으나 11/5 합의로 변경. `app/schemas.py`의 `DISPLAY_COUNT`로 조정)
- 문장 유형 3가지: `fact`(사실) / `opinion`(의견: 기자의 평가·추측) / `quote`(인용: 누군가의 말 전달). `sourceType`·`sourceName`은 `quote`일 때만 채움
- **기타는 원래 명칭으로 표시** (11/5 합의): 5개 유형에 안 맞는 인용은 `sourceType: "etc"`로 묶고, 화면에 보여 줄 원래 명칭(예: `무소속 의원`, `국회의장`, `법원`)을 `sentences[].sourceDetail`에 담음. 화면에서는 `etc`일 때 "기타" 대신 `sourceDetail`을 표시. 계산(비율·내 읽기 편향)은 계속 `etc` 하나로 묶어서 함

## 합의한 것 (11/4)

- 비율 계산·이슈 비교·다른 시각 추천·내 읽기 편향: **프론트**에서 계산
- 기사 문장(`sentences`)은 화면에 전부 보여 주지 않지만 계산용으로 계속 보냄
- 읽은 기록: 당분간 브라우저 저장

## 백엔드가 자동으로 채우는 칸

- `issues[].articleIds`: 같은 `issueId`를 가진 기사 (발행 시각 순)
- `issues[].displaySourceTypes`: 화면에 보여 줄 출처 유형 (지금은 5개 모두)
- `articles[].missingViewpoints`: 같은 이슈의 다른 기사에는 있는데 이 기사에는 없는 출처 유형.
  설명은 화면 문구 원칙에 맞춰 "○○ 인용 없음 (같은 이슈의 다른 기사에는 있습니다)". LLM이 더 구체적인 설명을 만들면 그걸 사용
- `sentences[].id`: s1, s2 … 순서대로

## 인용 기울기 · 다양성 (11/7 합의)

다양성 하위 지표의 메인은 **인용 기울기**, 참고값으로 **엔트로피**를 씁니다. 검증은 기획서의 **쌍 비교**가 메인입니다.
JSON 형식은 그대로이고, 프론트가 `sentences[].sourceType` 으로 바로 계산할 수 있습니다. 백엔드의 같은 계산은 `app/metrics.py`.

| 지표 | 식 | 값 | 계산 안 함 |
|---|---|---|---|
| 인용 기울기 | (정부·여당 인용 − 야당 인용) / (정부·여당 + 야당) | +1 정부·여당만 … 0 같은 수 … −1 야당만 | 정부·여당과 야당 인용이 둘 다 0 |
| 보정 인용 기울기 (11/7) | (정부·여당 − 야당) / (정부·여당 + 야당 **+ 2**) | 1건 +0.33, 3건 +0.60, 10건 +0.83 (인용이 적을수록 0 쪽으로) | 위와 같음 |
| 다양성 (정규화 엔트로피) | −Σ p·ln p / ln 5, p = 주요 5개 유형 각각의 인용 비율 | 0 한 목소리만 … 1 다섯 유형이 똑같이 | 주요 5개 유형 인용이 3개 미만 |

- 기타(etc)는 두 지표 모두에서 뺍니다.
- 기울기는 '어느 쪽 말을 더 많이 전했나'일 뿐, 기사가 옳다·그르다는 판정이 아닙니다. 화면 문구도 그렇게 씁니다.

검증: `python -m app.pairs 만들기 라벨링표_1차.xlsx` → 두 사람이 따로 "정부·여당에 더 우호적인 기사는?"(A/B/비슷함) 판단
→ `python -m app.pairs 채점 쌍비교_1차_조서연.xlsx 쌍비교_1차_남지원.xlsx --라벨 정답_1차.xlsx --라벨 라벨링표_AI_<모델>.xlsx`
(사람끼리 일치도 + 기울기가 사람 판단과 같은 방향인 비율)

## 진영 분포 · 양대 정당 기울기 (11/14 확정) — 프론트가 그대로 그리면 되는 칸

백엔드가 계산해서 넣어 줍니다. 프론트에서 기울기를 다시 계산하지 말고 이 값을 쓰세요.

**문장** `sentences[].party`: 정당 소속 화자의 공식 당명 (`조국혁신당`, `진보당` …). 인용 카드 배지에 그대로. 정당이 아니면 null.

**기사** `articles[].metrics`
```json
{"camps": {"ruling": 4, "third": 1, "mainOpp": 2, "independent": 0},
 "slope": 0.333, "slopeSmoothed": 0.25, "slopeBasis": 6, "excludedFromSlope": 1}
```
- `camps`: 진영별 인용 수. ruling = 정부·제1여당(더불어민주당), mainOpp = 제1야당(국민의힘), third = 제3정당(조국혁신당·진보당·개혁신당 등), independent = 무소속
- `slope` / `slopeSmoothed`: **양대 정당 기준** 기울기 (ruling − mainOpp) / (ruling + mainOpp [+2]). 화면에는 `slopeSmoothed`
- `slopeBasis` 가 3 미만이면 "인용이 적어 판단하기 어려움"
- 보조 문구: "양대 정당 기준 기울기 (제3정당·무소속 `excludedFromSlope`건 별도)"
- 전직 정무직("전 ○○(○○정부)")·전문가·기타는 어느 진영에도 넣지 않음

**이슈** `issues[].distribution`
```json
{"camps": {"ruling": 30, "third": 3, "mainOpp": 12, "independent": 1}, "slopeMean": 0.31, "blindspot": null}
```
- 분포 막대: `여당 | 제3정당 | 야당 (| 무소속)` 순서, **실제 비율 그대로** (보정하지 않음)
- `slopeMean`: 이 이슈 기사들의 보정 기울기 평균 → 기사마다 "이슈 평균보다 +0.2" 처럼 비교
- `blindspot`: 양대 진영 인용 중 한쪽이 5% 미만이면 그쪽 (`mainOpp` / `ruling`). 화면에 "이 이슈는 ○○ 측 인용 비중이 압도적으로 높습니다" 안내. 비교 영역에 소수 쪽 기사를 억지로 채우지 않음
- **`institution`** (기사 `metrics.institution`, 이슈 `distribution.institution`): 수사·사법기관(경찰·검찰·공수처·공소청·특검·법원·헌재·선관위·감사원) 인용 수. 정당이 아닌 국가기관이라 진영·기울기에서 뺌 (11/14 확정). 당적이 있는 사람(검사 출신 의원 등)은 정당으로 셈
- **`sentences[].stateBody`**: true면 인용 카드에 **'수사·사법기관'** 배지 (숨기지 말고 그대로 보여 줌)
- **`distribution.focusParty`**: 이슈 제목이 정당 이름으로 시작하는(한 정당의 행사·입장 발표가 중심인) 이슈면 그 정당. 이슈 상단에 안내:
  > 이슈 특성 안내: ○○○의 행사·입장 발표가 중심인 이슈라 ○○○ 측 인용이 많이 집계됐어요. 반대 측 반론이 얼마나 실렸는지 함께 확인해 보세요.
  
  이런 이슈도 거르지 않고 그대로 보여 줌 (이슈를 고르는 것 자체가 편향이 되지 않게)
- 비교 영역에서 소수 쪽 기사 최소 1건 보장: 같은 이슈 기사 중 `metrics.slopeSmoothed` 부호가 이슈 다수와 반대인 기사를 하나 고정 노출 (없으면 blindspot 안내)

## 실제 기사 데이터 (시범 운영, 11/7)

`python -m app.build 실제` → `data/issues.json` 에 적은 이슈를 라벨링 표로 만들어 **`data/raw/news_실제.json`** 저장 (형식은 위와 같음).
- 기사 문장을 화면에 보여 주는 대신 **모든 기사에 언론사 원문 링크(`url`)를 붙임**. 링크가 없으면 저장하지 않음.
  프론트는 기사 화면·이슈 화면 모두에서 `url` 로 가는 "원문 보기"를 잘 보이게 표시.
- 라벨: 사람 정답 우선, 정답에 없는 문장만 AI 결과.
- 기사 문장이 들어 있으므로 GitHub(특히 공개 저장소)에 올리지 않음. 프론트 배포에 쓸 때는 시범 운영 참여자에게만 링크 공유.

### 11/7 프론트(news-front)와 맞춘 것
- `sourceTypes` 는 **주요 5개만** 보냄 (`etc` 없음). 기타 인용은 문장에 `sourceType: "etc"` + `sourceDetail`(원래 명칭)로만 들어감 → 프론트에서 비중 계산 때 뺄지 정해야 함
- 실제 기사(`news_실제.json`)는 11/5 합의대로 **사실·인용 문장 `text` = null, 의견 문장은 앞 40자 + '…'**. 라벨은 그대로
- 문장 `type` 은 `fact` / `opinion` / `quote` 3가지 (프론트 mock은 아직 2가지. `quote` 는 프론트 계산에 영향 없음)

### 11/7 백엔드 보강
- 보정 기울기(`metrics.smoothed_slope`) 추가. 쌍 비교 채점(`app.pairs 채점`)은 보정 전·후를 둘 다 보여 줌. 기울기를 계산할 수 없는 기사 수도 보여 줌
- AI 프롬프트 v2: 지금의 여야 구도(여당 = 더불어민주당, 나머지 정당 = 야당) 명시, 말+행동 문장 = 인용, 기자의 예측 = 의견.
  결과 파일 이름 끝에 `_p2` 가 붙어 v1 결과와 나란히 채점 가능. 1차 오답을 보고 넣은 규칙이라 효과는 2차 기사로 확인

### 이슈 늘리기 (11/7)
1. `python -m app.collect "검색어" --count 500` → 2. `python -m app.candidates 검색어 --날짜 YYYY-MM-DD` (후보 CSV)
3. `python -m app.labeling 준비 --차수 N --후보 후보_….csv --번호 a,b,c,d,e` → 본문 붙여 넣기 → `python -m app.labeling 채우기 --차수 N`
4. `python -m app.analyze 라벨링표_N차.xlsx --모델 gemini-3.5-flash-lite` → 5. `data/issues.json` 에 이슈 추가(labels = AI 결과 파일) → `python -m app.build 실제`
사람 정답이 없는 이슈는 AI 라벨만으로 화면에 나감 (1차 기준 정확도 약 92%).

## 매일 자동 실행 (11/7)

GitHub Actions(`.github/workflows/daily.yml`)가 한국 시간 08시·17시쯤 `python -m app.daily` 실행 → `data/daily/news.json`.
`FRONT_REPO_TOKEN` 비밀값이 있으면 같은 파일을 프론트 저장소 `news-front/src/data/news-live.json` 에 올림 → Vercel 자동 배포.

| 단계 | 파일 | 내용 |
|---|---|---|
| 수집 | `app/collect.py` | `data/daily.json` 의 검색어마다 최신 기사 |
| 이슈 묶기 (①) | `app/cluster.py` | 제목·요약 유사도 + 언론사 4곳 이상, AI가 한 사건인지 확인하고 제목·요약·분야 작성 |
| 원문 분석 (②③) | `app/fetch.py`, `app/analyze.py` | robots.txt 허용 주소만, 본문은 저장 안 함 → 라벨·의견 40자만 남김 |
| 빠진 관점 (④) | `app/metrics.py` | 규칙 |
| 합치기 | `app/daily.py` | 사람이 확인한 이슈(`data/curated.json`, `python -m app.build 실제` 가 만듦) + 최근 14일 자동 이슈 |

- 이슈에 `origin` 칸 추가: `"curated"`(사람 확인) / `"auto"`(자동·AI). 프론트는 auto 이슈에 "AI 분석" 표시 권장
- ⑤ 내 읽기 편향, ⑥ 반대 시각 추천은 프론트가 이 데이터로 계산 (변경 없음). 기사 id(`a-…`)는 원문 주소로 만들어 매번 같음 → 읽은 기록이 유지됨

## 열람 기록 API (11/8, 사용자 검증용)

| 요청 | 내용 |
|---|---|
| `POST /reading-history` | `{"userId": "익명아이디", "articleId": "a-…", "kind": "view"\|"original", "readAt": "ISO 8601(선택)", "from": "recommend"\|"issue"\|"list"\|"me"\|"search"\|null}` |
| `GET /reading-history?userId=…` | 위 기록 배열 (최신순) |
| `GET /reading-stats` | 사용자 수, 반대 시각 추천을 열어 본 사용자 비율 등. `STATS_TOKEN` 을 정하면 `?token=` 필요 |

- `userId` 는 프론트가 `crypto.randomUUID()` 로 만들어 브라우저에 저장한 익명 값. 이름·이메일·IP는 받지 않음
- 반대 시각 추천 영역에서 연 기사는 `"from": "recommend"` 로 보내야 "반대 시각 기사를 열어 본 비율"이 계산됨
- 기록은 SQLite(`READING_DB`, 기본 `data/reading.db`). 무료 호스팅은 재시작 때 파일이 지워질 수 있어 시범 운영 기간에는 저장 공간(볼륨)이 있는 곳에 배포

## 국회의원 소속 사전 (11/8)
`python -m app.members 받기` (ASSEMBLY_API_KEY) → `data/members.csv`. `analyze --소속사전` 으로 비교, 매일 자동 실행은 파일이 있으면 자동 적용.
이름 전체 또는 "성 + 직함"(앞에 나온 의원이 한 명일 때만)으로 찾고, 여당 = 정부·여당, 그 밖 정당 = 야당, 무소속 = 무소속 의원.

## Syntitan 준비 (11/8)
`python -m app.syntitan 진단 정답_1차.xlsx` → 무료 진단 30줄, `전체` → 보강 씨앗. 보강 결과(열: 문장, 유형, 출처유형, 인용한사람)는
`analyze --예시 보강.csv` 로 프롬프트 예시에 넣어 전후 비교. 씨앗은 1차, 평가는 2차 정답으로 분리.
