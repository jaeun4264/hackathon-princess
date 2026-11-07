"""기사 수집 (서비스 흐름 1단계) — NAVER API HUB 뉴스 검색

실행 (Anaconda Prompt, news-bias-backend 폴더에서):
    python -m app.collect "지하철 요금 인상"
    python -m app.collect "지하철 요금 인상" --count 200 --sort date

결과: data/raw/날짜_검색어.json (기사 제목·요약·원문 주소·언론사·발행 시각)
      data/raw/ 는 GitHub에 올라가지 않습니다 (.gitignore).

키는 .env 의 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (NAVER API HUB → Application → 인증 정보)
"""
import argparse
import html
import json
import os
import re
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

API_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

# 원문 주소의 도메인 → 언론사 이름 (없는 곳은 도메인 그대로 표시 → 필요하면 여기에 추가)
OUTLET_BY_DOMAIN = {
    "chosun.com": "조선일보", "joongang.co.kr": "중앙일보", "donga.com": "동아일보",
    "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "hankookilbo.com": "한국일보",
    "seoul.co.kr": "서울신문", "kmib.co.kr": "국민일보", "segye.com": "세계일보",
    "munhwa.com": "문화일보", "naeil.com": "내일신문",
    "mk.co.kr": "매일경제", "hankyung.com": "한국경제", "sedaily.com": "서울경제",
    "mt.co.kr": "머니투데이", "edaily.co.kr": "이데일리", "asiae.co.kr": "아시아경제",
    "fnnews.com": "파이낸셜뉴스", "heraldcorp.com": "헤럴드경제", "biz.chosun.com": "조선비즈",
    "yna.co.kr": "연합뉴스", "newsis.com": "뉴시스", "news1.kr": "뉴스1",
    "kbs.co.kr": "KBS", "imbc.com": "MBC", "sbs.co.kr": "SBS", "ytn.co.kr": "YTN",
    "jtbc.co.kr": "JTBC", "joins.com": "JTBC", "tvchosun.com": "TV조선",
    "mbn.co.kr": "MBN", "ichannela.com": "채널A", "yonhapnewstv.co.kr": "연합뉴스TV",
    "ohmynews.com": "오마이뉴스", "pressian.com": "프레시안", "nocutnews.co.kr": "노컷뉴스",
    "mediatoday.co.kr": "미디어오늘", "sisain.co.kr": "시사IN", "zdnet.co.kr": "지디넷코리아",
    "etnews.com": "전자신문", "dt.co.kr": "디지털타임스", "inews24.com": "아이뉴스24",
    # 11/5 첫 수집에서 자주 나온 곳
    "newspim.com": "뉴스핌", "newscj.com": "천지일보", "kukinews.com": "쿠키뉴스",
    "wikitree.co.kr": "위키트리", "newdaily.co.kr": "뉴데일리", "breaknews.com": "브레이크뉴스",
    "ajunews.com": "아주경제", "etoday.co.kr": "이투데이", "dailian.co.kr": "데일리안",
    "asiatoday.co.kr": "아시아투데이", "metroseoul.co.kr": "메트로신문", "viva100.com": "브릿지경제",
    "pennmike.com": "펜앤마이크", "weekly.hankooki.com": "주간한국", "fntimes.com": "한국금융신문",
    "kyeongin.com": "경인일보", "kyeonggi.com": "경기일보", "incheonnews.com": "인천뉴스",
    "kwangju.co.kr": "광주일보", "jnilbo.com": "전남일보", "namdonews.com": "남도일보",
    "jndn.com": "전남매일", "gjdream.com": "광주드림", "m-i.kr": "매일일보",
    "enewstoday.co.kr": "이뉴스투데이", "cnbnews.com": "CNB뉴스", "newsclaim.co.kr": "뉴스클레임",
}

TAG = re.compile(r"<[^>]+>")


class CollectError(Exception):
    """사용자에게 그대로 보여 줄 오류"""


def clean(text: str) -> str:
    """<b> 태그와 &quot; 같은 HTML 기호 제거"""
    return html.unescape(TAG.sub("", text or "")).strip()


def outlet_of(url: str) -> str:
    host = urlparse(url).netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    # 긴 도메인부터 비교 (biz.chosun.com 이 chosun.com 보다 먼저)
    for domain in sorted(OUTLET_BY_DOMAIN, key=len, reverse=True):
        if host == domain or host.endswith("." + domain):
            return OUTLET_BY_DOMAIN[domain]
    return host or "알 수 없음"


def to_iso(pub_date: str) -> str:
    try:
        return parsedate_to_datetime(pub_date).isoformat()
    except (TypeError, ValueError):
        return pub_date


def to_article(item: dict) -> dict:
    url = item.get("originallink") or item.get("link") or ""
    return {
        "title": clean(item.get("title")),
        "summary": clean(item.get("description")),
        "url": url,
        "naverLink": item.get("link") or "",
        "outlet": outlet_of(url),
        "publishedAt": to_iso(item.get("pubDate")),
    }


def load_keys() -> tuple[str, str]:
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    cid = os.getenv("NAVER_CLIENT_ID", "").strip()
    secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        raise CollectError(".env 에 NAVER_CLIENT_ID 와 NAVER_CLIENT_SECRET 을 넣어 주세요.")
    return cid, secret


def search_page(client: httpx.Client, query: str, start: int, display: int, sort: str) -> dict:
    try:
        res = client.get(API_URL, params={"query": query, "display": display, "start": start, "sort": sort})
    except httpx.HTTPError as e:
        raise CollectError(f"네이버 서버에 연결하지 못했습니다: {e}") from e
    if res.status_code in (401, 403):
        raise CollectError(
            f"키가 거절됐습니다 (HTTP {res.status_code}). NAVER API HUB → Application → [인증 정보]의 "
            "Client ID/Secret인지, Application에 뉴스 검색 API가 선택돼 있는지 확인해 주세요.\n"
            f"서버 응답: {res.text[:300]}"
        )
    if res.status_code == 429:
        raise CollectError("호출이 너무 많습니다 (HTTP 429). 잠시 후 다시 실행해 주세요.")
    if res.status_code != 200:
        raise CollectError(f"검색 실패 (HTTP {res.status_code}): {res.text[:300]}")
    return res.json()


def collect(query: str, count: int = 100, sort: str = "sim", client: httpx.Client | None = None) -> list[dict]:
    """검색어로 기사를 최대 count건 모음 (같은 원문 주소·같은 제목은 하나만)"""
    if client is None:
        cid, secret = load_keys()
        client = httpx.Client(timeout=15, headers={
            "X-NCP-APIGW-API-KEY-ID": cid,
            "X-NCP-APIGW-API-KEY": secret,
        })
    articles, seen_urls, seen_titles = [], set(), set()
    start = 1
    while len(articles) < count and start <= 1000:  # API는 start 1~1000까지만 허용
        display = min(100, count - len(articles), 1001 - start)
        data = search_page(client, query, start, display, sort)
        items = data.get("items", [])
        for item in items:
            a = to_article(item)
            if a["url"] in seen_urls or a["title"] in seen_titles:
                continue
            seen_urls.add(a["url"])
            seen_titles.add(a["title"])
            articles.append(a)
        if len(items) < display:  # 더 이상 결과 없음
            break
        start += display
    return articles[:count]


def save(query: str, articles: list[dict]) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^\w가-힣]+", "_", query).strip("_")[:30] or "query"
    path = RAW_DIR / f"{datetime.now():%Y%m%d_%H%M}_{slug}.json"
    payload = {"query": query, "collectedAt": datetime.now().astimezone().isoformat(), "articles": articles}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main(argv=None):
    p = argparse.ArgumentParser(description="NAVER API HUB 뉴스 검색으로 기사 모으기")
    p.add_argument("query", help='검색어 (예: "지하철 요금 인상")')
    p.add_argument("--count", type=int, default=100, help="모을 기사 수 (기본 100, 최대 1000)")
    p.add_argument("--sort", choices=["sim", "date"], default="sim", help="sim=정확도순, date=최신순")
    args = p.parse_args(argv)

    try:
        articles = collect(args.query, min(args.count, 1000), args.sort)
    except CollectError as e:
        print("오류:", e)
        sys.exit(1)

    path = save(args.query, articles)
    by_outlet: dict[str, int] = {}
    for a in articles:
        by_outlet[a["outlet"]] = by_outlet.get(a["outlet"], 0) + 1

    print(f"'{args.query}' 기사 {len(articles)}건, 언론사 {len(by_outlet)}곳")
    print("언론사별:", ", ".join(f"{o} {n}" for o, n in sorted(by_outlet.items(), key=lambda x: -x[1])[:15]))
    print("앞 5건:")
    for a in articles[:5]:
        print(f"  [{a['outlet']}] {a['title']}")
    print("저장:", path)


if __name__ == "__main__":
    main()
