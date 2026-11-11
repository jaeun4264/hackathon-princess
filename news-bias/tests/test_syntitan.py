from app import syntitan as T
from app.labelsheet import read_rows

# conftest 표는 5문장
LABELS = [("사실", None, None), ("인용", "야당", "가 대표"), ("의견", None, None),
          ("인용", "무소속 의원", "다 의원"), ("사실", None, None)]


def test_diagnosis_sample_keeps_rare_rows(tables, tmp_path):
    rows = read_rows(tables("g.xlsx", LABELS))
    picked = T.diagnosis_sample(rows, n=4)
    types = [r.type for r in picked]
    assert "의견" in types and types.count("인용") == 2 and types.count("사실") == 1  # 드문 줄 먼저, 나머지는 사실
    out = T.write(picked, tmp_path / "x.csv")
    text = out.read_text(encoding="utf-8-sig")
    assert text.splitlines()[0] == ",".join(T.COLUMNS) and "무소속 의원" in text
