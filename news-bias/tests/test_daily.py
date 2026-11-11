"""매일 자동 실행 테스트 — 네이버·언론사·AI를 모두 가짜로 바꿔서 (지어낸 기사만 사용)"""
import json
from datetime import datetime, timedelta

import httpx
import pytest

from app import daily as D
from app.fetch import Fetcher, extract

NOW = datetime.now(D.KST)
OUTLETS = [("chosun.com", "조선일보"), ("donga.com", "동아일보"), ("hani.co.kr", "한겨레"),
           ("khan.co.kr", "경향신문"), ("yna.co.kr", "연합뉴스")]


def fake_collect(query, count, sort):
    """같은 사건(가람시 요금 인상) 5곳 + 무관한 기사 1건"""
    t = (NOW - timedelta(hours=2)).isoformat()
    arts = [{"title": f"가람시 지하철 요금 300원 인상안 발표 {i}", "summary": "가람시가 지하철 기본요금 인상안을 발표했다",
             "url": f"https://www.{d}/news/{i}", "outlet": o, "publishedAt": t} for i, (d, o) in enumerate(OUTLETS)]
    arts.append({"title": "나래군 축제 개막", "summary": "축제가 열렸다", "url": "https://www.mk.co.kr/1",
                 "outlet": "매일경제", "publishedAt": t})
    arts.append({"title": "지난달 기사", "summary": "", "url": "https://www.mk.co.kr/old", "outlet": "매일경제",
                 "publishedAt": (NOW - timedelta(days=5)).isoformat()})
    return arts


PAGE = ("<html><body><nav>메뉴</nav><article><h1>가람시 지하철 요금 300원 인상안 발표</h1>"
        "<p>가람시는 7일 지하철 기본요금을 300원 올리는 안을 발표했다.</p>"
        "<p>시 관계자는 \"적자가 커서 인상이 불가피하다\"고 말했다.</p>"
        "<p>가상당 의원은 \"시민 부담을 외면한 결정\"이라고 비판했다.</p>"
        "<p>시민단체는 인상 철회를 요구하며 반발했다.</p>"
        "<p>인상안은 다음 달 시의회에서 심의된다.</p>"
        "<p>서민 부담이 커질 것으로 보인다.</p>"
        "<p>시는 노후 전동차 교체에 인상분을 쓰겠다고 설명했다. 이번 인상은 8년 만이다.</p>"
        + "".join(f"<p>가람시의 지하철 운영 적자는 {y}년에 더 늘어난 것으로 집계됐다는 자료가 함께 공개됐다.</p>" for y in range(2018, 2024))
        + 
        "</article><footer>무단 전재 금지</footer></body></html>")


def site(req: httpx.Request) -> httpx.Response:
    if req.url.path == "/robots.txt":
        if "khan" in req.url.host:
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        return httpx.Response(404)
    return httpx.Response(200, text=PAGE)


ISSUE = {"same_event": True, "title": "가람시 지하철 요금 인상안", "summary": "가람시가 요금 인상안을 발표했다.",
         "category": "사회", "exclude": []}


def llm_handler(req: httpx.Request) -> httpx.Response:
    msgs = json.loads(req.content)["messages"]
    if "편집 보조" in msgs[0]["content"]:
        body = ISSUE
    else:
        nos = [int(l.split(".")[0]) for l in msgs[-1]["content"].splitlines() if l[:1].isdigit()]
        sents = []
        for n in nos:
            if n == 2:
                sents.append({"no": n, "type": "인용", "source": "정부·여당", "speaker": "시 관계자", "framing": []})
            elif n == 3:
                sents.append({"no": n, "type": "인용", "source": "야당", "speaker": "가상당 의원", "framing": []})
            elif n == 6:
                sents.append({"no": n, "type": "의견", "source": None, "speaker": None, "framing": []})
            else:
                sents.append({"no": n, "type": "사실", "source": None, "speaker": None, "framing": []})
        body = {"sentences": sents}
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(body, ensure_ascii=False)}}]})


@pytest.fixture
def daily_env(tmp_path, monkeypatch):
    monkeypatch.setattr(D, "DAILY_DIR", tmp_path / "daily")
    monkeypatch.setattr(D, "ARTICLE_CACHE", tmp_path / "daily" / "articles")
    monkeypatch.setattr(D, "ARCHIVE", tmp_path / "daily" / "archive.json")
    monkeypatch.setattr(D, "OUTPUT", tmp_path / "daily" / "news.json")
    monkeypatch.setattr(D, "CURATED", tmp_path / "curated.json")
    monkeypatch.setattr(D, "ROOT", tmp_path)
    monkeypatch.setattr(D.time, "sleep", lambda s: None)
    cfg = dict(D.DEFAULTS, queries=["가람"], llmGap=0)
    fetcher = Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)
    llm = {"provider": "gemini", "model": "test-model", "key": "k", "url": "https://llm.test/chat/completions"}
    return cfg, fetcher, llm


def _client():
    return httpx.Client(transport=httpx.MockTransport(llm_handler))


def test_daily_end_to_end(daily_env):
    cfg, fetcher, llm = daily_env
    data = D.run(cfg, collect_fn=fake_collect, fetcher=fetcher, llm=llm, client=_client())
    assert data is not None
    [issue] = data["issues"]
    assert issue["origin"] == "auto" and issue["title"] == ISSUE["title"]
    assert len(issue["articleIds"]) == 4                      # 경향신문은 robots.txt 가 막아서 건너뜀
    sents = [s for a in data["articles"] for s in a["sentences"]]
    assert all(s["text"] is None for s in sents if s["type"] != "opinion")   # 본문은 남지 않음
    assert {s["sourceType"] for s in sents if s["sourceType"]} == {"gov", "opp"}
    assert all(a["url"].startswith("https://") for a in data["articles"])
    assert D.OUTPUT.exists() and len(list(D.ARTICLE_CACHE.glob("*.json"))) == 4
    # 캐시 파일에도 사실 문장 글자가 없음
    cached = json.loads(next(D.ARTICLE_CACHE.glob("*.json")).read_text(encoding="utf-8"))
    assert all(s["text"] is None for s in cached["sentences"] if s["type"] != "opinion")

    # 두 번째 실행: 같은 이슈는 다시 만들지 않음
    again = D.run(cfg, collect_fn=fake_collect, fetcher=fetcher, llm=llm, client=_client())
    assert len(again["issues"]) == 1


def test_curated_issues_are_merged(daily_env):
    cfg, fetcher, llm = daily_env
    from app.build import build_news, strip_text
    cur = strip_text(build_news())
    for a in cur["articles"]:
        a["url"] = f"https://example.com/{a['id']}"
    D.CURATED.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    data = D.run(cfg, collect_fn=fake_collect, fetcher=fetcher, llm=llm, client=_client())
    origins = sorted(i["origin"] for i in data["issues"])
    assert origins == ["auto", "curated", "curated"]


def test_not_same_event_is_skipped(daily_env, monkeypatch):
    cfg, fetcher, llm = daily_env
    monkeypatch.setitem(ISSUE, "same_event", False)
    data = D.run(cfg, collect_fn=fake_collect, fetcher=fetcher, llm=llm, client=_client())
    assert data["issues"] == []


def test_clean_body_and_extract():
    text = extract(PAGE, "https://x.test/a")
    body = D.clean_body(text, "가람시 지하철 요금 300원 인상안 발표")
    assert "가람시 지하철 요금 300원 인상안 발표\n" not in body and body.startswith("가람시는 7일")
    assert "메뉴" not in body and "무단 전재" not in body
