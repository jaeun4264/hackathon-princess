"""가짜(목업) 데이터 — 지어낸 기사, 가상 언론사입니다.

문장 type: fact(사실) / opinion(의견) / quote(인용, sourceType·sourceName 필수)

나중에 기사 수집 + LLM 분석 결과로 이 부분을 바꿔 끼우면 됩니다.
- issues 의 articleIds, 기사의 missingViewpoints 는 적지 않아도 build.py 가 자동으로 채웁니다.
- 문장 id(s1, s2 …)도 비워 두면 순서대로 자동으로 붙습니다.
"""

OUTLETS = [
    {"id": "garam", "name": "가람일보"},
    {"id": "narae", "name": "나래신문"},
    {"id": "dasom", "name": "다솜뉴스"},
]

ISSUES = [
    {
        "id": "issue-101",
        "title": "가상시 지하철 기본요금 300원 인상안",
        "summary": "가상시가 지하철 기본요금을 1,400원에서 1,700원으로 올리는 안을 발표했다. 적자 해소와 시민 부담을 두고 의견이 갈린다.",
        "category": "사회",
        "date": "2026-11-04",
    },
    {
        "id": "issue-102",
        "title": "청년 월세 지원 소득 기준 완화",
        "summary": "정부가 청년 월세 지원의 소득 기준을 완화해 대상을 늘리기로 했다. 신청 절차와 지원 기간에 대한 지적도 나온다.",
        "category": "사회",
        "date": "2026-11-03",
    },
]

ARTICLES = [
    {
        "id": "art-101", "issueId": "issue-101", "outletId": "garam",
        "title": "지하철 요금 300원 인상… \"노후 전동차 교체 시급\"",
        "summary": "가상시는 누적 적자와 안전 투자를 이유로 기본요금 인상안을 발표했다.",
        "url": "#", "publishedAt": "2026-11-04T09:00:00+09:00",
        "sentences": [
            {"text": "가상시는 4일 지하철 기본요금을 1,400원에서 1,700원으로 올리는 안을 발표했다.", "type": "fact"},
            {"text": "시 교통국장은 \"적자가 연 1조 원을 넘어 인상이 불가피하다\"고 밝혔다.", "type": "quote", "sourceType": "gov", "sourceName": "시 교통국장"},
            {"text": "시는 인상분을 노후 전동차 교체에 쓰겠다고 설명했다.", "type": "quote", "sourceType": "gov", "sourceName": "가상시"},
            {"text": "늦었지만 필요한 요금 정상화 조치라는 평가가 나온다.", "type": "opinion"},
            {"text": "한 교통정책 연구위원은 \"요금 현실화 없이는 안전 투자가 어렵다\"고 말했다.", "type": "quote", "sourceType": "expert", "sourceName": "교통정책 연구위원"},
        ],
        "framingTerms": [{"term": "정상화", "sentenceId": "s4"}],
    },
    {
        "id": "art-102", "issueId": "issue-101", "outletId": "narae",
        "title": "지하철 요금 인상 강행… 시민 부담 커진다",
        "summary": "야당과 시민들은 충분한 의견 수렴 없는 인상이라고 비판했다.",
        "url": "#", "publishedAt": "2026-11-04T10:30:00+09:00",
        "sentences": [
            {"text": "가상시가 지하철 기본요금 300원 인상을 추진한다.", "type": "fact"},
            {"text": "시의회 야당 의원들은 \"서민 부담을 외면한 일방적 결정\"이라고 비판했다.", "type": "quote", "sourceType": "opp", "sourceName": "시의회 야당 의원"},
            {"text": "출근길에 만난 직장인 김모 씨는 \"한 달에 2만 원 가까이 더 든다\"고 말했다.", "type": "quote", "sourceType": "citizen", "sourceName": "직장인 김모 씨"},
            {"text": "충분한 의견 수렴 없이 인상을 강행했다는 지적을 피하기 어렵다.", "type": "opinion"},
            {"text": "시는 적자 책임을 시민에게 떠넘겨서는 안 된다.", "type": "opinion"},
        ],
        "framingTerms": [{"term": "강행", "sentenceId": "s4"}, {"term": "떠넘겨서는", "sentenceId": "s5"}],
    },
    {
        "id": "art-103", "issueId": "issue-101", "outletId": "dasom",
        "title": "지하철 기본요금 300원 인상안, 다음 달 시의회 심의",
        "summary": "시와 야당 입장이 엇갈리는 가운데 전문가들은 할인 확대를 함께 검토하라고 조언했다.",
        "url": "#", "publishedAt": "2026-11-04T11:00:00+09:00",
        "sentences": [
            {"text": "가상시가 지하철 기본요금을 300원 올리는 방안을 발표했다.", "type": "fact"},
            {"text": "시는 \"누적 적자 해소와 안전 투자를 위해 필요하다\"고 밝혔다.", "type": "quote", "sourceType": "gov", "sourceName": "가상시"},
            {"text": "야당은 \"공청회부터 다시 열어야 한다\"고 맞섰다.", "type": "quote", "sourceType": "opp", "sourceName": "시의회 야당"},
            {"text": "전문가들은 저소득층 할인 확대를 함께 검토해야 한다고 조언했다.", "type": "quote", "sourceType": "expert", "sourceName": "교통 전문가들"},
            {"text": "인상안은 다음 달 시의회 심의를 거쳐 확정된다.", "type": "fact"},
        ],
        "framingTerms": [],
    },
    {
        "id": "art-104", "issueId": "issue-102", "outletId": "garam",
        "title": "청년 월세 지원 문턱 낮춘다",
        "summary": "정부는 청년 월세 지원 소득 기준을 완화해 대상을 늘리기로 했다.",
        "url": "#", "publishedAt": "2026-11-03T08:00:00+09:00",
        "sentences": [
            {"text": "정부는 청년 월세 지원의 소득 기준을 완화한다고 3일 밝혔다.", "type": "quote", "sourceType": "gov", "sourceName": "정부"},
            {"text": "국토교통부는 \"지원 대상이 약 10만 명 늘어날 것\"이라고 설명했다.", "type": "quote", "sourceType": "gov", "sourceName": "국토교통부"},
            {"text": "청년 주거 안정에 숨통이 트일 전망이다.", "type": "opinion"},
        ],
        "framingTerms": [{"term": "숨통", "sentenceId": "s3"}],
    },
    {
        "id": "art-105", "issueId": "issue-102", "outletId": "dasom",
        "title": "청년 월세 지원 확대에도 \"절차 복잡, 기간 짧아\"",
        "summary": "대상은 늘었지만 신청 절차와 지원 기간에 대한 지적이 나온다.",
        "url": "#", "publishedAt": "2026-11-03T14:00:00+09:00",
        "sentences": [
            {"text": "정부가 청년 월세 지원 소득 기준을 완화하기로 했다.", "type": "fact"},
            {"text": "대학생 이모 씨는 \"신청 절차가 너무 복잡하다\"고 말했다.", "type": "quote", "sourceType": "citizen", "sourceName": "대학생 이모 씨"},
            {"text": "한 주거 연구자는 \"지원 기간이 짧아 효과가 제한적\"이라고 지적했다.", "type": "quote", "sourceType": "expert", "sourceName": "주거 연구자"},
            {"text": "생색내기에 그치지 않으려면 지원 기간부터 늘려야 한다.", "type": "opinion"},
            {"text": "한 부동산 중개업계 관계자는 \"소형 원룸 수요가 늘 것\"이라고 말했다.", "type": "quote", "sourceType": "biz", "sourceName": "부동산 중개업계 관계자"},
        ],
        "framingTerms": [{"term": "생색내기", "sentenceId": "s4"}],
    },
]
