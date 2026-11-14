"""규칙으로 계산하는 지표 (서비스 흐름 5단계: 규칙 칸)

비율 계산·이슈 비교·추천·내 읽기 편향은 프론트(src/lib/news.js)가 합니다 (11/4 합의).
백엔드는 프론트에 넘기기 전에 '빠진 관점'과 '화면에 보여 줄 출처 유형'을 자동으로 채웁니다.
"""
import math
from collections import Counter

from app.schemas import DISPLAY_COUNT, MAIN_SOURCE_TYPES, SOURCE_LABELS


def source_counts(article: dict) -> Counter:
    """기사에서 출처 유형별 인용 문장 수"""
    return Counter(s["sourceType"] for s in article["sentences"] if s.get("sourceType"))


def display_source_types(issue_articles: list[dict], n: int = DISPLAY_COUNT) -> list[str]:
    """화면에 보여 줄 주요 유형 n개 (같은 이슈 기사끼리는 같은 유형으로 비교). n=5면 주요 유형 전부

    인용된 유형이 n개보다 적으면 정해진 순서(정부·여당 → 야당 → …)로 채워 늘 n개를 돌려줌.
    """
    total = Counter()
    for a in issue_articles:
        total += source_counts(a)
    order = {t: i for i, t in enumerate(MAIN_SOURCE_TYPES)}
    ranked = sorted(MAIN_SOURCE_TYPES, key=lambda t: (-total.get(t, 0), order[t]))
    top = ranked[:n]
    return sorted(top, key=lambda t: order[t])  # 화면에서는 늘 같은 순서로


def missing_viewpoints(article: dict, issue_articles: list[dict]) -> list[dict]:
    """같은 이슈의 다른 기사에는 있는데 이 기사에는 없는 인용 출처 유형 (기타 제외)

    화면 문구 원칙(writing-guide.md 3번)에 맞춰 판정 없이 사실만 적습니다.
    LLM이 더 구체적인 설명("재원 마련 방식에 대한 야당의 문제 제기가 없음")을 만들면 그걸 쓰면 됩니다.
    """
    mine = set(source_counts(article))
    result = []
    for type_id in MAIN_SOURCE_TYPES:
        if type_id in mine:
            continue
        found = [
            a["id"] for a in issue_articles
            if a["id"] != article["id"] and type_id in source_counts(a)
        ]
        if found:
            result.append({
                "sourceType": type_id,
                "description": f"{SOURCE_LABELS[type_id]} 인용 없음 (같은 이슈의 다른 기사에는 있습니다)",
                "foundInArticleIds": found,
            })
    return result


# ---------- 인용 기울기 · 다양성 (11/7 지원님 제안 반영) ----------
# 메인 지표는 인용 기울기, 엔트로피는 '목소리가 얼마나 섞였는지' 참고값.
# 같은 식을 프론트(src/lib/news.js)에서도 쓸 수 있게 docs/API.md 에 적어 둠.
MIN_QUOTES_FOR_ENTROPY = 3  # 인용이 너무 적으면 다양성 값이 의미가 없어 계산하지 않음


def quote_slope(counts: Counter) -> float | None:
    """(정부·여당 인용 − 야당 인용) / (정부·여당 + 야당). +1 정부·여당만, −1 야당만, 0 같은 수.
    둘 다 0이면 None (기울기를 말할 수 없음)"""
    gov, opp = counts.get("gov", 0), counts.get("opp", 0)
    return None if gov + opp == 0 else (gov - opp) / (gov + opp)


SLOPE_PRIOR = 2  # 11/7 보정: 분모에 +2 → 인용이 적을수록 0 쪽으로 당겨짐 (1건 +0.33, 3건 +0.60, 10건 +0.83)


def smoothed_slope(counts: Counter, prior: int = SLOPE_PRIOR) -> float | None:
    """보정한 인용 기울기 = (정부·여당 − 야당) / (정부·여당 + 야당 + prior). 둘 다 0이면 None.
    부호(어느 쪽이 많은지)는 보정 전과 같고, 인용이 적어 생기는 +1·−1 극단값만 줄어듦"""
    gov, opp = counts.get("gov", 0), counts.get("opp", 0)
    return None if gov + opp == 0 else (gov - opp) / (gov + opp + prior)


def source_entropy(counts: Counter, types: list[str] = MAIN_SOURCE_TYPES) -> float | None:
    """주요 5개 출처 유형의 정규화 엔트로피 (0 = 한 목소리만, 1 = 5개가 똑같이). 기타는 뺌.
    주요 유형 인용이 MIN_QUOTES_FOR_ENTROPY개 미만이면 None"""
    n = sum(counts.get(t, 0) for t in types)
    if n < MIN_QUOTES_FOR_ENTROPY:
        return None
    h = -sum((c / n) * math.log(c / n) for t in types if (c := counts.get(t, 0)))
    return abs(h / math.log(len(types)))  # 한 목소리만이면 -0.0 이 나오지 않게


def article_quote_metrics(article: dict) -> dict:
    c = source_counts(article)
    return {"quoteSlope": quote_slope(c), "smoothedSlope": smoothed_slope(c),
            "sourceEntropy": source_entropy(c), "quoteCount": sum(c.values())}


# ---------- 정당 진영 · 양대 정당 기울기 (11/14 확정) ----------
# 화면 분포 막대: 여당 | 제3정당 | 야당 (+ 무소속). 인용 카드 배지는 공식 당명 그대로.
# 인용 기울기는 '정부·제1여당' 대 '제1야당'만으로 계산하고, 제3정당·무소속은 분모에서 빼고 따로 셈.
# 전직 공직자(당적 없음)·전문가 등은 진영에 넣지 않음 (기타·전문가 그대로).
RULING_PARTY = "더불어민주당"
MAIN_OPPOSITION = "국민의힘"
PARTIES = ("더불어민주당", "국민의힘", "조국혁신당", "개혁신당", "진보당", "기본소득당", "사회민주당", "새로운미래",
           "자유통일당", "녹색정의당", "정의당")
PARTY_ALIASES = {"민주당": "더불어민주당", "국힘": "국민의힘", "혁신당": "조국혁신당"}
CAMPS = ("ruling", "third", "mainOpp", "independent")   # 화면 막대 순서: 여당 | 제3정당 | 야당 | 무소속
CAMP_LABELS = {"ruling": "정부·여당", "third": "제3정당", "mainOpp": "제1야당", "independent": "무소속"}
BLINDSPOT_SHARE = 0.05   # 양대 진영 인용 중 한쪽이 이보다 적으면 '사각지대'
BLINDSPOT_MIN = 5        # 양대 진영 인용이 이보다 적으면 사각지대 판단 안 함


def find_party(*texts: str | None) -> str | None:
    """글(인용한 사람·원래 명칭)에 든 공식 당명. 줄임말도 인정 (민주당 → 더불어민주당)"""
    for t in texts:
        if not t:
            continue
        for p in PARTIES:
            if p in t:
                return p
        for short, full in PARTY_ALIASES.items():
            if short in t:
                return full
    return None


def camp(sentence: dict) -> str | None:
    """인용 문장 → 진영 (ruling / mainOpp / third / independent) 또는 None(정당 진영 아님)"""
    if sentence.get("type") != "quote":
        return None
    st = sentence.get("sourceType")
    party = sentence.get("party")
    detail = sentence.get("sourceDetail") or ""
    if st == "etc":
        return "independent" if "무소속" in detail else None
    if st == "gov":
        return "ruling" if party in (None, RULING_PARTY) else ("mainOpp" if party == MAIN_OPPOSITION else "third")
    if st == "opp":
        if party in (None, MAIN_OPPOSITION):
            return "mainOpp"   # 당명을 모르면 제1야당으로 (AI가 '야당'이라고만 한 경우 대부분 제1야당)
        return "ruling" if party == RULING_PARTY else "third"
    return None


def fill_party(article: dict, members: dict[str, str] | None = None) -> None:
    """인용 문장의 party 칸이 비어 있으면 인용한 사람·원래 명칭에서 찾음 (국회의원 명단이 있으면 이름으로도)"""
    for s in article["sentences"]:
        if s.get("type") != "quote" or s.get("sourceType") not in ("gov", "opp", "etc"):
            s.setdefault("party", None)
            continue
        if s.get("party"):
            continue
        p = find_party(s.get("sourceName"), s.get("sourceDetail"))
        if not p and members and s.get("sourceName"):
            hits = {members[n] for n in members if n in s["sourceName"]}
            p = hits.pop() if len(hits) == 1 else None
        s["party"] = p if p and "무소속" not in p else None


def article_metrics(article: dict) -> dict:
    """기사 하나의 진영별 인용 수와 양대 정당 기울기 (프론트가 그대로 그림)"""
    c = Counter(x for x in (camp(s) for s in article["sentences"]) if x)
    pair = Counter({"gov": c["ruling"], "opp": c["mainOpp"]})
    raw, sm = quote_slope(pair), smoothed_slope(pair)
    return {
        "camps": {k: c.get(k, 0) for k in CAMPS},
        "slope": None if raw is None else round(raw, 3),
        "slopeSmoothed": None if sm is None else round(sm, 3),
        "slopeBasis": c["ruling"] + c["mainOpp"],
        "excludedFromSlope": c["third"] + c["independent"],
    }


def issue_distribution(issue_articles: list[dict]) -> dict:
    """이슈 전체 진영별 인용 분포 (실제 비율 그대로) + 사각지대 여부 + 기사 기울기 평균"""
    total = Counter()
    slopes = []
    for a in issue_articles:
        m = a.get("metrics") or article_metrics(a)
        total.update(m["camps"])
        if m["slopeSmoothed"] is not None:
            slopes.append(m["slopeSmoothed"])
    pair = total["ruling"] + total["mainOpp"]
    blind = None
    if pair >= BLINDSPOT_MIN:
        if total["mainOpp"] / pair < BLINDSPOT_SHARE:
            blind = "mainOpp"     # 제1야당 인용이 거의 없음
        elif total["ruling"] / pair < BLINDSPOT_SHARE:
            blind = "ruling"
    return {
        "camps": {k: total.get(k, 0) for k in CAMPS},
        "slopeMean": round(sum(slopes) / len(slopes), 3) if slopes else None,
        "blindspot": blind,
    }


def ensure_metrics(data: dict) -> dict:
    """예전에 만든 news.json 처럼 metrics·distribution 칸이 없으면 채움 (있으면 그대로)"""
    arts = data.get("articles", [])
    for a in arts:
        if a.get("metrics") is None:
            fill_party(a)
            a["metrics"] = article_metrics(a)
    for i in data.get("issues", []):
        if i.get("distribution") is None:
            i["distribution"] = issue_distribution([a for a in arts if a["issueId"] == i["id"]])
    return data
