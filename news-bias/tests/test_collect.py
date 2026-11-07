"""기사 수집 테스트 — 실제 네이버 서버 대신 가짜 응답을 씁니다"""
import httpx
import pytest

from app import collect as c


def fake_item(n, url=None, title=None):
    return {
        "title": title or f"<b>지하철</b> 요금 기사 {n}",
        "originallink": url or f"https://www.hani.co.kr/arti/{n}.html",
        "link": f"https://n.news.naver.com/article/{n}",
        "description": "시는 &quot;인상이 불가피하다&quot;고 밝혔다.",
        "pubDate": "Wed, 04 Nov 2026 09:00:00 +0900",
    }


def client_with(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_to_article_cleans_and_maps_outlet():
    a = c.to_article(fake_item(1))
    assert a["title"] == "지하철 요금 기사 1"
    assert a["summary"] == '시는 "인상이 불가피하다"고 밝혔다.'
    assert a["outlet"] == "한겨레"
    assert a["publishedAt"] == "2026-11-04T09:00:00+09:00"


def test_outlet_prefers_longer_domain():
    assert c.outlet_of("https://biz.chosun.com/x") == "조선비즈"
    assert c.outlet_of("https://news.chosun.com/x") == "조선일보"
    assert c.outlet_of("https://unknown-news.kr/a") == "unknown-news.kr"


def test_collect_pages_and_dedupes():
    calls = []

    def handler(req):
        start = int(req.url.params["start"])
        display = int(req.url.params["display"])
        calls.append((start, display))
        items = [fake_item(i) for i in range(start, start + display)]
        if start == 1:
            items[1] = fake_item(1)  # 같은 기사 중복
        return httpx.Response(200, json={"items": items})

    arts = c.collect("지하철", count=150, client=client_with(handler))
    # 첫 페이지에서 중복 1건이 빠져 99건 → 두 번째 요청은 51건을 더 받아 150건을 채움
    assert calls == [(1, 100), (101, 51)]
    assert len(arts) == 150
    assert len({a["url"] for a in arts}) == len(arts)


def test_collect_stops_when_no_more_results():
    def handler(req):
        return httpx.Response(200, json={"items": [fake_item(1), fake_item(2)]})

    assert len(c.collect("드문 검색어", count=100, client=client_with(handler))) == 2


def test_bad_key_message():
    def handler(req):
        return httpx.Response(401, json={"error": "Unauthorized"})

    with pytest.raises(c.CollectError, match="인증 정보"):
        c.collect("x", client=client_with(handler))
