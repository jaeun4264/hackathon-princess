"""후보 목록과 n차 라벨링 준비 테스트 (지어낸 기사만 사용)"""
import json

from openpyxl import Workbook, load_workbook

from app import candidates as C
from app import labeling as L
from app import labelsheet as S


def _raw(tmp_path):
    arts = [
        {"title": "가람 사건 보도", "summary": "요약1", "url": "https://chosun.com/1", "outlet": "조선일보", "publishedAt": "2026-11-06T10:00:00+09:00"},
        {"title": "가람 사건 보도", "summary": "중복 제목", "url": "https://donga.com/2", "outlet": "동아일보", "publishedAt": "2026-11-06T11:00:00+09:00"},
        {"title": "[사설] 가람 사건", "summary": "", "url": "https://hani.co.kr/3", "outlet": "한겨레", "publishedAt": "2026-11-06T12:00:00+09:00"},
        {"title": "[이시각헤드라인] 11월 6일", "summary": "", "url": "https://yna.co.kr/4", "outlet": "연합뉴스", "publishedAt": "2026-11-06T13:00:00+09:00"},
        {"title": "작은 사이트 보도", "summary": "", "url": "https://tiny.kr/5", "outlet": "tiny.kr", "publishedAt": "2026-11-06T14:00:00+09:00"},
        {"title": "지난 일", "summary": "", "url": "https://khan.co.kr/6", "outlet": "경향신문", "publishedAt": "2026-10-01T09:00:00+09:00"},
        {"title": "가람 사건 반발", "summary": "요약7", "url": "https://khan.co.kr/7", "outlet": "경향신문", "publishedAt": "2026-11-06T15:00:00+09:00"},
    ]
    (tmp_path / "20261106_가람_사건.json").write_text(json.dumps({"query": "가람 사건", "articles": arts}, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "news_실제.json").write_text("{}", encoding="utf-8")
    return tmp_path


def test_candidates_filters(tmp_path):
    items = C.load_collected(["가람"], _raw(tmp_path))
    rows = C.pick(items, since="2026-11-01")
    assert [r["title"] for r in rows] == ["가람 사건 보도", "가람 사건 반발"]  # 중복·사설·묶음·작은 사이트·지난 기사 제외
    out = tmp_path / "후보.csv"
    C.write_csv(rows, out)
    assert C.read_csv(out)[2]["언론사"] == "경향신문"


def test_prepare_round(tmp_path, monkeypatch):
    tpl = tmp_path / "양식.xlsx"
    wb = Workbook(); wb.active.title = "라벨링"; wb.create_sheet("기사 목록"); wb.save(tpl)
    monkeypatch.setattr(S, "TEMPLATE", tpl)
    monkeypatch.setattr(L, "LABEL_DIR", tmp_path)
    rows = C.pick(C.load_collected(["가람"], _raw(tmp_path)), since="2026-11-01")
    cand = tmp_path / "후보.csv"
    C.write_csv(rows, cand)
    made = L.prepare_round(3, cand, [2, 1])
    assert [f.name for f in made] == ["F01_경향신문.txt", "F02_조선일보.txt"]
    ws = load_workbook(tmp_path / "라벨링표_3차.xlsx")["기사 목록"]
    assert [ws.cell(3, c).value for c in range(1, 4)] == ["F01", "경향신문", "가람 사건 반발"]
    assert L.id_prefix(4) == "G"
