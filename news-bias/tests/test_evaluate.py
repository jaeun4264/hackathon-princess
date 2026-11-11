import math
from pathlib import Path

from app import evaluate as E
from app.labelsheet import read_rows

A = [("사실", None, None), ("인용", "야당", "가상당 대표"), ("의견", None, None), ("인용", "전문가", "교수"), ("사실", None, None)]
B = [("사실", None, None), ("인용", "야당", "가상당 대표"), ("사실", None, None), ("인용", "시민·단체", "교수"), ("사실", None, None)]


def test_kappa_known_value():
    assert E.cohen_kappa(["1", "1", "0", "0"], ["1", "0", "0", "0"]) == 0.5
    assert E.cohen_kappa(["a", "b"], ["a", "b"]) == 1.0
    assert math.isnan(E.cohen_kappa([], []))


def test_read_rows_skips_example(tables):
    rows = read_rows(tables("a.xlsx", A))
    assert len(rows) == 5 and rows[0].key == ("N01", 1) and rows[1].source == "야당"


def test_agreement(tables):
    pairs, warn = E.pair_rows(read_rows(tables("a.xlsx", A)), read_rows(tables("b.xlsx", B)))
    assert warn == []
    st = E.agreement(pairs)
    assert st["유형 일치"] == 4 and st["둘 다 인용"] == 2 and st["출처 일치"] == 1
    assert st["유형 조합"] == {"의견→사실": 1}


def test_comparison_and_gold(tables, tmp_path):
    a, b = tables("라벨링표_서연.xlsx", A), tables("라벨링표_지원.xlsx", B)
    pairs, _ = E.pair_rows(read_rows(a), read_rows(b))
    comp = tmp_path / "비교.xlsx"
    E.write_comparison(pairs, ("서연", "지원"), comp)
    # 논의 없이 바로 정답을 만들면 같은 답 3문장만 정답
    n, empty = E.comparison_to_gold(comp, tables("원본.xlsx"), tmp_path / "정답.xlsx")
    assert (n, empty) == (3, 2)
    gold = read_rows(tmp_path / "정답.xlsx")
    assert [r.key for r in gold] == [("N01", 1), ("N01", 2), ("N02", 2)]


def test_score_and_all_fact_baseline(tables):
    gold = read_rows(tables("g.xlsx", A))
    all_fact = read_rows(tables("p.xlsx", [("사실", None, None)] * 5))
    r = E.score(gold, all_fact)
    assert r["정확도"] == r["전부 사실 기준선"] == 0.4
    assert r["유형별"]["의견"]["재현율"] == 0.0
    perfect = E.score(gold, read_rows(tables("q.xlsx", A)))
    assert perfect["정확도"] == 1.0 and perfect["출처 정확도"] == 1.0


def test_split_source():
    from app.labelsheet import split_source
    assert split_source("야당") == ("야당", None)
    assert split_source("무소속 의원") == ("기타", "무소속 의원")
    assert split_source("기타: 법원") == ("기타", "법원")
    assert split_source("기타") == ("기타", None)
    assert split_source(None) == (None, None)
    assert split_source("야당, 정부·여당") == ("야당", None)      # 먼저 나온 사람 기준
    assert split_source("정부·여당, 야당") == ("정부·여당", None)  # 유형 이름 속 '·'에서 자르지 않음
    assert split_source("무소속 의원, 야당") == ("기타", "무소속 의원")


def test_etc_names_agree_at_category_level(tables):
    a = [("사실", None, None), ("인용", "무소속 의원", "갑"), ("의견", None, None), ("인용", "전문가", "교수"), ("사실", None, None)]
    b = [("사실", None, None), ("인용", "무소속", "갑"), ("의견", None, None), ("인용", "전문가", "교수"), ("사실", None, None)]
    pairs, _ = E.pair_rows(read_rows(tables("a.xlsx", a)), read_rows(tables("b.xlsx", b)))
    st = E.agreement(pairs)
    assert st["출처 일치"] == 2  # '무소속 의원'과 '무소속'은 둘 다 기타로 같은 답


def test_daily_capacity():
    st = {"기사당 요청": 1.0, "기사당 토큰": 6000, "기사당 초": 36.0}
    lim = E.daily_capacity(st, rpd=250, rpm=10, tpm=250_000, gap=4)
    assert lim["하루 요청 수(RPD)"] == 250
    assert round(lim["응답 속도(한 번에 하나씩)"]) == 2160
    assert min(lim, key=lim.get) == "하루 요청 수(RPD)"


def test_expand_wildcards(tmp_path, monkeypatch):
    monkeypatch.setattr(E, "LABEL_DIR", tmp_path)
    for n in ["라벨링표_AI_a_p2.xlsx", "라벨링표_AI_a_p2_사전.xlsx", "라벨링표_AI_b_p2_사전.xlsx"]:
        (tmp_path / n).write_text("")
    got = [Path(x).name for x in E.expand(["라벨링표_AI_*_사전.xlsx", "정답.xlsx"])]
    assert got == ["라벨링표_AI_a_p2_사전.xlsx", "라벨링표_AI_b_p2_사전.xlsx", "정답.xlsx"]
    import pytest
    with pytest.raises(SystemExit):
        E.expand(["없는_*.xlsx"])
