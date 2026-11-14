"""진영 구분과 양대 정당 기울기 (11/14 확정)"""
from app import metrics as M


def q(st, party=None, name=None, detail=None):
    return {"type": "quote", "sourceType": st, "party": party, "sourceName": name, "sourceDetail": detail}


def test_camps_and_two_party_slope():
    art = {"sentences": [
        q("gov", name="법무부"), q("gov", "더불어민주당"), q("opp", "국민의힘"),
        q("opp", "조국혁신당"), q("opp", "진보당"), q("etc", detail="무소속 의원"),
        q("expert"), q("etc", detail="전 방통위원장(문재인정부)"), {"type": "fact", "sourceType": None},
    ]}
    m = M.article_metrics(art)
    assert m["camps"] == {"ruling": 2, "third": 2, "mainOpp": 1, "independent": 1}
    assert m["slope"] == round(1 / 3, 3) and m["slopeBasis"] == 3 and m["excludedFromSlope"] == 3
    assert m["slopeSmoothed"] == round(1 / 5, 3)


def test_fill_party_from_name_and_alias():
    art = {"sentences": [q("opp", name="조국혁신당 대변인"), q("opp", name="박 의원"), q("gov", name="민주당 원내대표"),
                         q("opp", name="곽규택 의원")]}
    M.fill_party(art, {"곽규택": "국민의힘"})
    assert [s["party"] for s in art["sentences"]] == ["조국혁신당", None, "더불어민주당", "국민의힘"]


def test_blindspot():
    arts = [{"sentences": [q("gov")] * 10}, {"sentences": [q("gov")] * 9}]
    assert M.issue_distribution(arts)["blindspot"] == "mainOpp"
    arts.append({"sentences": [q("opp", "국민의힘")] * 3})
    assert M.issue_distribution(arts)["blindspot"] is None


def test_label_party_from_ai_and_source():
    from app import analyze as A
    from app.labelsheet import Row
    rows = [Row(article_id="X", outlet="가람", no=i, text=f"문장{i}") for i in (1, 2, 3)]
    import json
    text = json.dumps({"sentences": [
        {"no": 1, "type": "인용", "source": "야당", "speaker": "김 대변인", "party": "조국혁신당", "framing": []},
        {"no": 2, "type": "인용", "source": "조국혁신당", "speaker": "이 의원", "framing": []},
        {"no": 3, "type": "인용", "source": "정부·여당", "speaker": "법무부", "party": None, "framing": []}]}, ensure_ascii=False)
    out = A.parse_labels(text, rows)
    assert (out[1]["source"], out[1]["party"]) == ("야당", "조국혁신당")
    assert (out[2]["source"], out[2]["party"]) == ("야당", "조국혁신당")
    assert out[3]["party"] is None


def test_party_wins_over_wrong_side():
    """AI가 더불어민주당 대표를 '야당'으로 적어도 당명 기준으로 정부·여당"""
    import json
    from app import analyze as A
    from app.labelsheet import Row
    rows = [Row(article_id="X", outlet="가람", no=1, text="문장"), Row(article_id="X", outlet="가람", no=2, text="문장2")]
    text = json.dumps({"sentences": [
        {"no": 1, "type": "인용", "source": "야당", "speaker": "김민석", "party": "더불어민주당", "framing": []},
        {"no": 2, "type": "인용", "source": "정부·여당", "speaker": "송 원내대표", "party": "국민의힘", "framing": []}]},
        ensure_ascii=False)
    out = A.parse_labels(text, rows)
    assert out[1]["source"] == "정부·여당" and out[2]["source"] == "야당"
