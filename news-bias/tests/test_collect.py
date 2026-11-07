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


def test_article_kind():
    from app.collect import article_kind
    for t in ["[이시각헤드라인] 11월 5일 뉴스센터", "11월4일 이브닝뉴스 헤드라인", "가람일보 모닝브리핑 11월 5일",
              "[가람일보 오늘뉴스 종합] 여야 격돌…", "[가람 이슈종합] 특검·요금·선거", "[오늘의 가람경제 1면] 반도체 급락",
              "[출근길 브리핑-11월 6일] 특검법·과세 유예", "[투데이 라인업] 대담 공개 / 본회의", "[전국 주요 신문 사설](5일 조간)", "[오후 뉴스브리핑] 비트코인 하락 外"]:
        assert article_kind(t) == "묶음", t
    for t in ["[오늘의 사설] 과세 원칙 지켜야", "[사설] 특검법 재고하라", "[기자수첩] 또 미뤄진 과세"]:
        assert article_kind(t) == "사설·칼럼", t
    for t in ["특검법 법사위 통과(종합)", "[종합] 가상자산 과세 2년 유예", "과세 유예 추진(종합2보)",
              "대통령실 브리핑서 과세 유예 언급", "전력 많이 쓰는 저녁시간 요금 인상"]:
        assert article_kind(t) == "기사", t
