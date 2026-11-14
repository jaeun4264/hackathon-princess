"""이슈 묶기 확인표 — 지어낸 기사로 만들기 → O/X 채우기 → 채점"""
import json
from argparse import Namespace

from openpyxl import load_workbook

from app import cluster_check as C
from tests.test_daily import fake_collect


def test_make_fill_and_score(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(C, "LABEL_DIR", tmp_path)
    monkeypatch.setattr(C, "RAW", tmp_path)
    src = tmp_path / "수집.json"
    arts = fake_collect("가람", 100, "date")
    for a in arts:
        a["publishedAt"] = "2026-11-11T10:00:00+09:00"
    src.write_text(json.dumps({"articles": arts}, ensure_ascii=False), encoding="utf-8")
    # AI는 2번째 기사를 다른 사건이라고 뺐다고 가정
    monkeypatch.setattr(C, "ai_check", lambda cfg, groups: [{"same_event": True, "title": "요금 인상", "exclude": [2]}])
    dst = C.make(Namespace(파일=[str(src)], AI없이=False, 임계값=None))

    wb = load_workbook(dst)
    ws = wb["기사"]
    n = ws.max_row - 1
    assert n == 5 and wb["_AI"].sheet_state == "hidden"
    assert sum(ws.cell(r, 3).value == "★" for r in range(2, ws.max_row + 1)) == 5
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 9).value = "X" if ws.cell(r, 2).value == 2 else "O"
    wb["이슈"].cell(2, 6).value = "O"
    wb["이슈"].cell(2, 8).value = "X"
    wb["빅카인즈"].cell(2, 2).value = "가람시 요금 인상"
    wb["빅카인즈"].cell(2, 4).value = 1
    wb["빅카인즈"].cell(3, 2).value = "나래군 축제"
    wb.save(dst)

    res = C.score(dst)
    assert res["규칙 묶기 순도 (묶음에 들어간 기사 중 같은 사건)"].startswith("80.0%")
    assert res["AI가 뺀 기사 중 실제로 다른 사건"].startswith("100.0%")
    assert res["쪼개짐: 앞 이슈와 같은 사건인 이슈"].startswith("0.0%")
    assert res["입장이 갈리는 이슈 (사람 판단)"].startswith("0.0%")
    assert res["빅카인즈 오늘의 이슈 중 우리도 잡은 이슈 (재현율)"].startswith("50.0%")
    assert res["AI 확인 후 순도 (AI가 한 사건이라 한 묶음, AI가 뺀 기사 제외)"].startswith("100.0%")


def test_split_groups_are_merged():
    """중심이 비슷한 두 묶음은 합쳐지고, 다른 묶음은 그대로"""
    from app.cluster import _merge
    g = lambda vec, idx: {"sum": dict(vec), "centroid": dict(vec), "members": idx}  # noqa: E731
    a = g({"만찬": 0.8, "예산": 0.6}, [0, 1, 6])
    b = g({"만찬": 0.7, "예산": 0.5, "당정": 0.5}, [2, 3, 7])
    c = g({"파업": 1.0}, [4, 5, 8])
    out = _merge([a, b, c], 0.45)
    assert sorted(len(x["members"]) for x in out) == [3, 6]
    assert len(_merge([g({"만찬": 1.0}, [0, 1, 4]), g({"파업": 1.0}, [2, 3, 5])], 0.45)) == 2
