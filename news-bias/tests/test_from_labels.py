"""라벨링 표 → 실제 데이터 변환 테스트 (지어낸 문장만 사용)"""
import json

from openpyxl import load_workbook

from app import build as B
from app.from_labels import load_real, outlet_id, to_iso


def _with_list(path, rows):
    wb = load_workbook(path)
    ws = wb["기사 목록"] if "기사 목록" in wb.sheetnames else wb.create_sheet("기사 목록")
    ws.append(["기사 ID", "언론사", "제목", "원문 주소", "발행 시각"])
    for r in rows:
        ws.append(list(r))
    wb.save(path)
    return path


def test_helpers():
    assert to_iso("2026-11-04 21:20") == "2026-11-04T21:20:00+09:00"
    assert outlet_id("조선일보") == "chosun" and outlet_id("가람 일보") == "가람일보"


def test_load_real_builds_valid_news(tables, tmp_path):
    labels = [("사실", None, None), ("인용", "야당", "가상당 대표"), ("의견", None, None),
              ("인용", "무소속 의원", "갑"), ("사실", None, None)]
    gold = tables("정답.xlsx", labels[:3] + [(None, None, None)] * 2)  # 뒤 두 문장은 정답에 없음
    ai = tables("ai.xlsx", labels)
    table = _with_list(tables("원본.xlsx"), [("N01", "가람일보", "가 제목", "https://example.com/1", "2026-11-04 10:00"),
                                           ("N02", "나래신문", "나 제목", "https://example.com/2", "2026-11-04 11:00")])
    cfg = tmp_path / "issues.json"
    cfg.write_text(json.dumps({"issues": [
        {"id": "issue-01", "title": "가상 이슈", "summary": "요약", "category": "정치", "date": "2026-11-04",
         "table": str(table), "labels": [str(gold), str(ai)]},
        {"id": "issue-02", "title": "안 씀", "summary": "", "category": "경제", "date": "2026-11-05",
         "table": str(table), "labels": [], "use": False}]}, ensure_ascii=False), encoding="utf-8")
    issues, articles, outlets, warnings = load_real(cfg)
    assert [i["id"] for i in issues] == ["issue-01"]
    n2 = next(a for a in articles if a["id"] == "N02")
    assert n2["sentences"][0]["sourceType"] == "etc" and n2["sentences"][0]["sourceDetail"] == "무소속 의원"  # AI에서 채움
    data = B.build_news(issues, articles, outlets)
    assert B.find_problems(data, need_url=True) == []
    data["articles"][0]["url"] = "#"
    assert any("원문 링크" in p for p in B.find_problems(data, need_url=True))
