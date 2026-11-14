"""백엔드 데이터가 프론트 형식(data-format.md)과 맞는지 확인하는 테스트"""
from fastapi.testclient import TestClient

from app import metrics
from app.build import build_news, find_problems
from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_news_has_frontend_shape():
    data = client.get("/news").json()
    assert set(data) == {"meta", "sourceTypes", "outlets", "issues", "articles"}
    assert [t["id"] for t in data["sourceTypes"]] == ["gov", "opp", "expert", "citizen", "industry"]
    assert all(i["displaySourceTypes"] == ["gov", "opp", "expert", "citizen", "industry"] for i in data["issues"])
    article = data["articles"][0]
    assert set(article) == {
        "id", "issueId", "outletId", "title", "summary", "url", "publishedAt",
        "sentences", "framingTerms", "missingViewpoints", "metrics",
    }
    assert set(article["sentences"][0]) == {"id", "text", "type", "sourceType", "sourceName", "sourceDetail", "party"}
    assert set(article["metrics"]) == {"camps", "slope", "slopeSmoothed", "slopeBasis", "excludedFromSlope"}
    assert set(data["issues"][0]["distribution"]) == {"camps", "slopeMean", "blindspot"}


def test_mock_data_has_no_problems():
    assert find_problems(build_news()) == []


def test_issue_article_ids_filled():
    data = build_news()
    issue = next(i for i in data["issues"] if i["id"] == "issue-101")
    assert issue["articleIds"] == ["art-101", "art-102", "art-103"]


def test_missing_viewpoints_auto():
    data = build_news()
    a = next(x for x in data["articles"] if x["id"] == "art-101")  # 정부 2, 전문가 1 인용
    missing = {m["sourceType"]: m for m in a["missingViewpoints"]}
    assert set(missing) == {"opp", "citizen"}
    assert missing["opp"]["foundInArticleIds"] == ["art-102", "art-103"]
    assert missing["opp"]["description"].startswith("야당 인용 없음")


def test_missing_viewpoints_only_same_issue():
    a = {"id": "x", "sentences": []}
    other = {"id": "y", "sentences": [{"sourceType": "opp"}]}
    assert metrics.missing_viewpoints(a, [a]) == []
    assert [m["sourceType"] for m in metrics.missing_viewpoints(a, [a, other])] == ["opp"]


def test_display_source_types_all_five_in_fixed_order():
    data = build_news()
    # 인용이 0건인 유형(issue-101의 기업·업계, issue-102의 야당)도 보여 줌 → "○○ 인용 없음" 표시 가능
    for issue in data["issues"]:
        assert issue["displaySourceTypes"] == ["gov", "opp", "expert", "citizen", "industry"]
    assert "etc" not in data["issues"][0]["displaySourceTypes"]


def test_display_top_n_still_works_if_changed_back():
    a = {"id": "x", "sentences": [{"sourceType": "industry"}]}
    assert metrics.display_source_types([a], n=4) == ["gov", "opp", "expert", "industry"]


def test_find_problems_catches_broken_framing_term():
    data = build_news()
    data["articles"][0]["framingTerms"] = [{"term": "없는단어", "sentenceId": "s1"}]
    data["articles"][1]["sentences"][1]["sourceType"] = "union"
    problems = find_problems(data)
    assert any("없는단어" in p for p in problems)
    assert any("union" in p for p in problems)


def test_find_problems_checks_quote_rules():
    data = build_news()
    s = data["articles"][0]["sentences"]
    s[1]["sourceName"] = None          # 인용인데 사람 없음
    s[0]["sourceType"] = "gov"         # 사실인데 출처 있음
    problems = find_problems(data)
    assert any("인용한 사람이 비어" in p for p in problems)
    assert any("인용이 아닌 문장" in p for p in problems)


def test_find_problems_checks_etc_detail():
    data = build_news()
    s = data["articles"][0]["sentences"][1]      # 인용 문장
    s["sourceType"], s["sourceDetail"] = "etc", None
    assert any("원래 명칭" in p for p in find_problems(data))
    s["sourceDetail"] = "무소속 의원"
    assert not any("원래 명칭" in p for p in find_problems(data))
    s["sourceType"] = "gov"
    assert any("기타 출처일 때만" in p for p in find_problems(data))
