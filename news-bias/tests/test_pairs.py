"""인용 기울기·다양성과 쌍 비교 검증 테스트 (지어낸 문장만 사용)"""
from collections import Counter

import pytest
from openpyxl import load_workbook

from app import pairs as P
from app.metrics import article_quote_metrics, quote_slope, source_entropy


def test_quote_slope():
    assert quote_slope(Counter(gov=3)) == 1.0
    assert quote_slope(Counter(opp=2)) == -1.0
    assert quote_slope(Counter(gov=3, opp=1, expert=5)) == 0.5   # 전문가는 기울기에 안 들어감
    assert quote_slope(Counter(expert=2)) is None


def test_source_entropy():
    assert source_entropy(Counter(gov=4)) == 0.0                   # 한 목소리만
    assert source_entropy(Counter(gov=1, opp=1, expert=1, citizen=1, industry=1)) == pytest.approx(1.0)
    assert source_entropy(Counter(gov=1, opp=1)) is None            # 인용 3개 미만
    assert source_entropy(Counter(gov=2, etc=5)) is None            # 기타는 세지 않음
    assert 0 < source_entropy(Counter(gov=3, opp=1)) < 1


def test_article_quote_metrics():
    art = {"sentences": [{"sourceType": "gov"}, {"sourceType": "gov"}, {"sourceType": "opp"}, {"sourceType": None}]}
    m = article_quote_metrics(art)
    assert m["quoteCount"] == 3 and m["quoteSlope"] == pytest.approx(1 / 3)


def _with_list(path, ids):
    wb = load_workbook(path)
    ws = wb.create_sheet("기사 목록")
    ws.append(["기사 ID", "언론사", "제목", "원문 주소"])
    for aid in ids:
        ws.append([aid, f"{aid}신문", f"{aid} 제목", "#"])
    wb.save(path)
    return path


def test_make_and_score(tables, tmp_path):
    # N01: 정부·여당 2, N02: 야당 1 (conftest 표는 기사 N01, N02)
    labels = [("인용", "정부·여당", "갑"), ("인용", "정부·여당", "을"), ("사실", None, None),
              ("인용", "야당", "병"), ("사실", None, None)]
    gold = tables("정답.xlsx", labels)
    src = _with_list(tables("원본.xlsx"), ["N01", "N02", "N03"])
    out = tmp_path / "쌍.xlsx"
    assert P.make_sheet(src, out) == 3
    ws = load_workbook(out)[P.SHEET]
    pairs = [(ws.cell(r, 2).value, ws.cell(r, 5).value) for r in range(2, 5)]
    assert pairs[1] == ("N03", "N01")  # 짝수 번째는 A/B 자리를 바꿈

    def judged(name, answers):
        wb = load_workbook(out)
        for r, a in zip(range(2, 5), answers):
            wb[P.SHEET].cell(r, 8).value = a
        p = tmp_path / name
        wb.save(p)
        return p

    # 1쌍: N01 vs N02 → N01(정부 인용만)이 더 우호적 = A
    a = judged("a.xlsx", ["A", "비슷함", "A"])
    b = judged("b.xlsx", ["A", "B", "A"])
    r = P.score_pairs(P.read_judgments(a), P.read_judgments(b), [gold])
    assert r["쌍"] == 3 and r["일치"] == 2 and r["둘 다 같은 쪽을 고른 쌍"] == 2
    v = r["라벨별"][gold.stem]
    assert v["보정"]["맞음"] == 1 and v["보정"]["판단 가능"] == 1   # N02 vs N03은 N03 인용이 없어 계산 불가
    assert v["보정 전"]["맞음"] == 1 and v["기울기 없는 기사"] == 0


def test_smoothed_slope():
    from app.metrics import smoothed_slope
    assert smoothed_slope(Counter(gov=1)) == pytest.approx(1 / 3)
    assert smoothed_slope(Counter(gov=3)) == pytest.approx(0.6)
    assert smoothed_slope(Counter(gov=2, opp=2)) == 0
    assert smoothed_slope(Counter(expert=3)) is None
    # 보정하면 '1건짜리 +1'과 '10건짜리 +1'을 구별할 수 있음
    assert smoothed_slope(Counter(gov=10)) > smoothed_slope(Counter(gov=1))


def test_scoring_refuses_until_all_judged(tables, tmp_path):
    src = _with_list(tables("원본.xlsx"), ["N01", "N02", "N03"])
    empty = tmp_path / "빈.xlsx"
    P.make_sheet(src, empty)
    with pytest.raises(SystemExit, match="채점하지 않았습니다"):
        P.main(["채점", str(empty), str(empty), "--라벨", str(src)])
