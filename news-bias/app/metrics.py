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


def source_entropy(counts: Counter, types: list[str] = MAIN_SOURCE_TYPES) -> float | None:
    """주요 5개 출처 유형의 정규화 엔트로피 (0 = 한 목소리만, 1 = 5개가 똑같이). 기타는 뺌.
    주요 유형 인용이 MIN_QUOTES_FOR_ENTROPY개 미만이면 None"""
    n = sum(counts.get(t, 0) for t in types)
    if n < MIN_QUOTES_FOR_ENTROPY:
        return None
    h = -sum((c / n) * math.log(c / n) for t in types if (c := counts.get(t, 0)))
    return h / math.log(len(types))


def article_quote_metrics(article: dict) -> dict:
    c = source_counts(article)
    return {"quoteSlope": quote_slope(c), "sourceEntropy": source_entropy(c),
            "quoteCount": sum(c.values())}
