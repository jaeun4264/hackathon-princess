"""키워드 규칙 분류기 테스트 — 설명용으로 지어낸 문장만 사용"""
import pytest

from app import rules as R


@pytest.mark.parametrize("text,type_,source", [
    ('국민의힘 원내대표는 "법안을 철회하라"고 말했다.', "인용", "야당"),
    ("더불어민주당은 공소취소 조항을 삭제했다고 강조했다.", "인용", "정부·여당"),
    ('[홍길동 / 국민의힘 의원] "눈속임에 불과합니다."', "인용", "야당"),
    ('한 법학과 교수는 "위헌 소지가 있다"고 지적했다.', "인용", "전문가"),
    ('보수 변호사단체는 "즉각 철회하라"고 촉구했다.', "인용", "시민·단체"),
    ('한 업계 관계자는 "수요가 늘 것"이라고 말했다.', "인용", "기업·업계"),
    ('국회의장은 "합의를 기다리겠다"고 밝혔다.', "인용", "기타"),
    ("법안은 4일 위원회 전체회의를 통과했다.", "사실", None),
    ("수사 대상 12건 중 6건이 대통령 관련 사건이다.", "사실", None),
    ("충분한 논의 없이 처리했다는 지적을 피하기 어렵다.", "의견", None),
    ("정치권 안팎에서는 역풍이 불 것이라는 관측이 나온다.", "의견", None),
    ("여론의 역풍이 거세질 전망이다.", "의견", None),
    ("민주당은 내일 본회의에서 처리할 전망이다.", "사실", None),
])
def test_classify(text, type_, source):
    out = R.classify(text)
    assert out["type"] == type_
    if source == "기타":
        assert out["detail"] == "국회의장"
    if source:
        assert out["source"] == source


def test_framing_only_outside_quotes():
    assert R.classify("여당이 법안을 강행 처리했다.")["framing"] == ["강행"]
    assert R.classify('야당은 "날치기"라고 비판했다.')["framing"] == []


def test_speaker_phrase():
    assert R.speaker_phrase('가상당 대표는 "철회하라"고 말했다.') == "가상당 대표"
    assert R.speaker_phrase('[김철수 / 가상당 의원] "좋다."') == "김철수 / 가상당 의원"


def test_rules_cli_writes_table(tables, tmp_path):
    src = tables("원본.xlsx")
    R.main([str(src), "--출력", str(tmp_path / "규칙.xlsx")])
    from app.labelsheet import read_rows
    rows = read_rows(tmp_path / "규칙.xlsx")
    assert [r.type for r in rows] == ["사실", "인용", "의견", "인용", "사실"]
    assert rows[3].source == "전문가"


def test_etc_written_as_original_name(tables, tmp_path):
    from app.labelsheet import read_rows, write_labels
    src = tables("원본.xlsx")
    write_labels(src, tmp_path / "o.xlsx", {("N01", 2): R.classify('무소속 홍길동 의원은 "반대한다"고 말했다.')})
    from openpyxl import load_workbook
    ws = load_workbook(tmp_path / "o.xlsx")["라벨링"]
    assert ws["F4"].value == "무소속 의원"          # 표에는 원래 명칭으로
    row = [r for r in read_rows(tmp_path / "o.xlsx") if r.key == ("N01", 2)][0]
    assert (row.source, row.source_detail) == ("기타", "무소속 의원")   # 읽을 때는 기타로 묶임
