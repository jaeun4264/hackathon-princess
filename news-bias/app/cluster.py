"""같은 사건을 다룬 기사끼리 자동으로 묶기 (기능 ① 이슈별 모아 보기)

1. 제목+요약의 글자 2개 묶음(바이그램)으로 TF-IDF 벡터를 만들고
2. 시간 순으로 훑으며 가장 비슷한 묶음(중심과 코사인 유사도 THRESHOLD 이상)에 넣고, 없으면 새 묶음을 만듦
3. 서로 다른 언론사 MIN_OUTLETS 곳 이상이 다룬 묶음만 이슈 후보로 남김
4. AI에게 후보의 제목 목록을 보여 주고 '정말 한 사건인지' 확인 + 이슈 제목·요약·분야를 받음 (daily.py)
외부 라이브러리 없이 동작합니다.
"""
import math
import re
from collections import Counter, defaultdict

from app.collect import OUTLET_BY_DOMAIN, article_kind

THRESHOLD = 0.30
MERGE = 0.45   # 묶음끼리 중심이 이만큼 비슷하면 같은 사건으로 보고 합침 (같은 사건이 여러 묶음으로 쪼개지는 것 방지)
MIN_OUTLETS = 4
KNOWN_OUTLETS = set(OUTLET_BY_DOMAIN.values())
# 흔한 단어는 묶음 판단에 방해가 돼서 뺌
STOP = set("기자 뉴스 오늘 지난 이번 관련 위해 대해 통해 정부 국회 대통령".split())


def tokens(text: str) -> list[str]:
    text = re.sub(r"<[^>]+>|&\w+;", " ", text)
    words = [w for w in re.findall(r"[가-힣A-Za-z0-9]+", text) if w not in STOP]
    grams = []
    for w in words:
        if len(w) == 1:
            continue
        grams += [w[i:i + 2] for i in range(len(w) - 1)] if len(w) > 2 else [w]
    return grams


def vectorize(docs: list[str]) -> list[dict[str, float]]:
    tfs = [Counter(tokens(d)) for d in docs]
    df = Counter(t for tf in tfs for t in tf)
    n = len(docs)
    vecs = []
    for tf in tfs:
        v = {t: (1 + math.log(c)) * math.log((n + 1) / (df[t] + 1)) for t, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})
    return vecs


def _dot(a: dict, b: dict) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())


def eligible(a: dict) -> bool:
    """분석 대상: 일반 기사(묶음·사설 제외) + 이름을 아는 언론사"""
    return (a.get("kind") or article_kind(a.get("title", ""))) == "기사" and a.get("outlet") in KNOWN_OUTLETS


def _merge(groups: list[dict], merge: float) -> list[dict]:
    """중심이 비슷한 묶음끼리 합침 (기사 2건 이상인 묶음만 비교). 더 합칠 게 없을 때까지 반복"""
    big = [g for g in groups if len(g["members"]) >= 2]
    rest = [g for g in groups if len(g["members"]) < 2]
    changed = True
    while changed:
        changed = False
        best = None
        for i in range(len(big)):
            for j in range(i + 1, len(big)):
                s = _dot(big[i]["centroid"], big[j]["centroid"])
                if s >= merge and (best is None or s > best[0]):
                    best = (s, i, j)
        if best:
            _, i, j = best
            a, b = big[i], big.pop(j)
            a["members"] += b["members"]
            for t, x in b["sum"].items():
                a["sum"][t] = a["sum"].get(t, 0.0) + x
            norm = math.sqrt(sum(x * x for x in a["sum"].values())) or 1.0
            a["centroid"] = {t: x / norm for t, x in a["sum"].items()}
            changed = True
    return big + rest


def cluster(articles: list[dict], threshold: float = THRESHOLD, min_outlets: int = MIN_OUTLETS,
            merge: float | None = MERGE) -> list[list[dict]]:
    """기사 목록 → 이슈 후보 묶음들 (언론사 수가 많은 순)"""
    arts, seen = [], set()
    for a in sorted(articles, key=lambda a: a.get("publishedAt", "")):
        if eligible(a) and a.get("url") not in seen:
            seen.add(a.get("url"))
            arts.append(a)
    vecs = vectorize([a["title"] + " " + a.get("title", "") + " " + a.get("summary", "") for a in arts])  # 제목에 가중치
    groups: list[dict] = []  # {"centroid": dict, "members": [idx]}
    for i, v in enumerate(vecs):
        best, best_sim = None, threshold
        for g in groups:
            s = _dot(v, g["centroid"])
            if s >= best_sim:
                best, best_sim = g, s
        if best is None:
            groups.append({"sum": dict(v), "centroid": dict(v), "members": [i]})
            continue
        best["members"].append(i)
        for t, x in v.items():
            best["sum"][t] = best["sum"].get(t, 0.0) + x
        norm = math.sqrt(sum(x * x for x in best["sum"].values())) or 1.0
        best["centroid"] = {t: x / norm for t, x in best["sum"].items()}
    if merge:
        groups = _merge(groups, merge)
    out = []
    for g in groups:
        g["members"].sort()
        members = [arts[i] for i in g["members"]]
        if len({a["outlet"] for a in members}) >= min_outlets:
            for a, i in zip(members, g["members"]):
                a["_sim"] = _dot(vecs[i], g["centroid"])
            out.append(members)
    out.sort(key=lambda m: -len({a["outlet"] for a in m}))
    return out


def pick_articles(members: list[dict], n: int = 5, prefer: list[str] | None = None) -> list[dict]:
    """한 묶음에서 언론사가 겹치지 않게 n건 고름. 언론사마다 묶음 중심에 가장 가까운 기사"""
    by_outlet = defaultdict(list)
    for a in members:
        by_outlet[a["outlet"]].append(a)
    best = [max(v, key=lambda a: a.get("_sim", 0)) for v in by_outlet.values()]
    order = {o: i for i, o in enumerate(prefer or [])}
    best.sort(key=lambda a: (order.get(a["outlet"], len(order)), -a.get("_sim", 0)))
    return best[:n]
