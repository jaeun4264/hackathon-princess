"""본문 읽기 — 자바스크립트로 본문을 채우는 사이트(지어낸 페이지)"""
import json

import httpx

from app.fetch import Fetcher, diagnose, extract_how

BODY = "\n".join(f"<p>가람시는 {i}일 지하철 기본요금을 300원 올리는 인상안을 발표했다. 시 관계자는 적자가 크다고 설명했다.</p>"
                 for i in range(1, 12))


def test_next_rsc_page():
    inner = json.dumps({"content": BODY, "title": "x"}, ensure_ascii=False)
    page = '<html><body><div id="app"></div><script>self.__next_f.push([1,' + json.dumps(inner, ensure_ascii=False) + '])</script></body></html>'
    text, how = extract_how(page)
    assert how.startswith("페이지 데이터") and text.startswith("가람시는 1일") and "<p>" not in text


def test_json_ld_and_next_data():
    for page in ('<html><body><script type="application/ld+json">'
                 + json.dumps({"@type": "NewsArticle", "articleBody": BODY}, ensure_ascii=False) + "</script></body></html>",
                 '<html><body><script id="__NEXT_DATA__" type="application/json">'
                 + json.dumps({"props": {"pageProps": {"article": {"body": BODY}}}}) + "</script></body></html>"):
        text, how = extract_how(page)
        assert (how == "본문" or how.startswith("페이지 데이터")) and len(text) > 300 and "<p>" not in text


def test_menu_strings_are_not_body():
    page = "<html><body><script>var m=" + json.dumps("메뉴 " * 300, ensure_ascii=False) + "</script></body></html>"
    assert extract_how(page)[1] == "실패"


def test_diagnose_reports_robots_and_method():
    def site(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /blocked")
        inner = json.dumps({"content": BODY}, ensure_ascii=False)
        return httpx.Response(200, text="<html><script>self.__next_f.push([1," + json.dumps(inner, ensure_ascii=False) + "])</script></html>")
    f = Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)
    rows = diagnose([("가람일보", "https://a.test/blocked/1"), ("가람일보", "https://a.test/news/1")], f)
    assert rows[0]["결과"] == "robots.txt 가 막음"
    assert rows[1]["결과"] == "성공" and rows[1]["방법"].startswith("페이지 데이터") and "Next.js(RSC)" in rows[1]["자바스크립트 데이터"]


def test_rsc_paragraphs_and_page_text_cap():
    """문단이 따로따로 든 Next.js 데이터 + 페이지 전체 글을 모은 긴 문자열은 본문으로 안 봄"""
    paras = [f"가람시는 {i}일 지하철 기본요금을 300원 올리는 인상안을 발표했다." for i in range(1, 12)]
    tree = ["$", "article", None, {"children": [["$", "p", None, {"children": p}] for p in paras]}]
    junk = json.dumps("관련기사 다른 소식이다. " * 1500, ensure_ascii=False)
    payload = "1:" + json.dumps(tree, ensure_ascii=False)
    page = ('<html><script>self.__next_f.push([1,' + json.dumps(payload, ensure_ascii=False) + '])</script>'
            '<script>var all=' + junk + '</script></html>')
    text, how = extract_how(page)
    assert how == "페이지 데이터(데이터 문단)" and text.splitlines()[0] == paras[0] and len(text.splitlines()) == 11


def test_follow_short_redirect_page():
    def site(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if req.url.path == "/stub":
            return httpx.Response(200, text="<html><title>이동</title><script>location.replace('/real')</script></html>")
        return httpx.Response(200, text="<html><body><article>" + BODY + "</article></body></html>")
    f = Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)
    assert f.body("https://a.test/stub").startswith("가람시는 1일")


def test_robots_rules_for_our_bot_name():
    def site(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: NewsBiasHackathonBot\nDisallow: /\n\nUser-agent: *\nAllow: /")
        return httpx.Response(200, text="x")
    f = Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)
    assert not f.allowed("https://a.test/news/1")


def test_wire_byline_in_parentheses_is_removed():
    from app.labeling import body_to_sentences
    s = body_to_sentences("(울산=뉴스1) 김세은 기자 = 울산 지역 국회의원들이 11일 공동 성명을 냈다. 이들은 협력을 요구했다.")
    assert s[0].startswith("울산 지역")


def test_tracking_params_and_canonical_are_tried():
    """SBS처럼 추적용 덧붙임이 붙은 주소에는 안내 페이지를 주면, 대표 주소·덧붙임 뺀 주소로 다시 읽음"""
    def site(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if "plink" in str(req.url):
            return httpx.Response(200, text="<html><title>기사</title><script>location.replace('/unsupported')</script></html>")
        if req.url.path == "/unsupported":
            return httpx.Response(200, text="<html>현재 브라우저는 서비스를 지원하지 않습니다</html>")
        return httpx.Response(200, text="<html><body><article>" + BODY + "</article></body></html>")
    f = Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)
    assert f.body("https://a.test/news/endPage.do?news_id=N1&plink=ORI&cooper=NAVER").startswith("가람시는 1일")
    rows = diagnose([("가람방송", "https://a.test/news/endPage.do?news_id=N1&plink=ORI&cooper=NAVER")], f)
    assert rows[0]["결과"] == "성공" and "news_id=N1" in rows[0]["다른 주소로 읽음"] and "plink" not in rows[0]["다른 주소로 읽음"]
