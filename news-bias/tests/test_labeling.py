"""라벨링 도우미 테스트 — 설명용으로 지어낸 문장만 사용"""
import shutil

import pytest
from openpyxl import Workbook, load_workbook

from app import labeling as L


def test_quote_with_periods_is_one_sentence():
    s = L.split_sentences('정 원내대표는 "법안을 철회하라. 국민이 지켜본다."라고 말했다. 민주당은 반박했다.')
    assert s == ['정 원내대표는 "법안을 철회하라. 국민이 지켜본다."라고 말했다.', "민주당은 반박했다."]


def test_curly_quotes_and_numbers():
    s = L.split_sentences("지원 규모는 3.5배로 늘었다. 그는 “좋다. 다만 늦었다”고 했다.")
    assert s == ["지원 규모는 3.5배로 늘었다.", "그는 “좋다. 다만 늦었다”고 했다."]


def test_unbalanced_quote_falls_back():
    s = L.split_sentences('그는 "끝나지 않은 인용. 다음 문장이다.')
    assert len(s) == 2


def test_clean_line_removes_bylines_and_notices():
    assert L.clean_line("[서울=뉴시스] 홍길동 김철수 기자 = 법안이 통과됐다.") == "법안이 통과됐다."
    assert L.clean_line("◀ 앵커 ▶ 법안이 통과됐습니다.") == "법안이 통과됐습니다."
    assert L.clean_line("hong@example.com") == ""
    assert L.clean_line("<저작권자 ⓒ 가람일보, 무단 전재 및 재배포 금지>") == ""
    assert L.clean_line("# 여기에 본문을 붙여 넣으세요") == ""


def test_body_to_sentences_multiline():
    raw = "# 제목: 예시\n\n[서울=뉴시스] 홍길동 기자 = 첫 문장이다. 둘째 문장이다.\n\n셋째 문장이다.\nhong@example.com\n"
    assert L.body_to_sentences(raw) == ["첫 문장이다.", "둘째 문장이다.", "셋째 문장이다."]


def test_broadcast_speaker_tag_joins_next_quote():
    raw = '앵커가 소식을 전했다.\n홍길동 / 가상당 의원\n"법안을 철회하라. 국민이 지켜본다."\n다음 문장이다.'
    assert L.body_to_sentences(raw) == [
        "앵커가 소식을 전했다.",
        '[홍길동 / 가상당 의원] "법안을 철회하라. 국민이 지켜본다."',
        "다음 문장이다.",
    ]
    assert L.body_to_sentences("김철수 가상당 대표 :\n좋습니다.") == ["[김철수 가상당 대표] 좋습니다."]


def test_normal_short_sentence_is_not_speaker_tag():
    assert not L.is_speaker_tag("법안이 통과됐다.")
    assert not L.is_speaker_tag('"그렇다/아니다"라고 말했다')


@pytest.fixture
def table(tmp_path):
    wb = Workbook()
    ws = wb.active
    ws.title = L.SHEET
    ws.append(["기사 ID", "언론사", "문장 번호", "문장", "유형"])
    ws.append(["예시", "가람일보", 1, "예시 문장이다.", "사실"])
    for r in range(3, 13):  # 실제 양식처럼 각 줄에 '확인' 수식이 있음
        ws.cell(r, 11, value=f'=IF(D{r}="","","x")')
    path = tmp_path / "t.xlsx"
    wb.save(path)
    return path


def test_fill_table_writes_given_columns(table):
    items = [("N01", "가람일보", ["가.", "나."]), ("N02", "나래신문", ["다."])]
    L.fill_table(items, table)
    ws = load_workbook(table)[L.SHEET]
    assert [c.value for c in ws[2]][:2] == ["예시", "가람일보"]  # 예시 줄은 그대로
    assert [c.value for c in ws[3]][:4] == ["N01", "가람일보", 1, "가."]
    assert [c.value for c in ws[5]][:4] == ["N02", "나래신문", 1, "다."]


def test_fill_table_refuses_when_labels_started(table, tmp_path):
    L.fill_table([("N01", "가람일보", ["가."])], table)
    wb = load_workbook(table)
    wb[L.SHEET]["E3"] = "사실"
    wb.save(table)
    with pytest.raises(SystemExit):
        L.fill_table([("N01", "가람일보", ["가.", "나."])], table)


def _break_styles(path):
    """다른 프로그램으로 저장된 것처럼, openpyxl이 못 여는 파일로 만듦 (없는 서식 번호를 가리키게)"""
    import zipfile, re
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith("xl/worksheets/sheet"):
                data = re.sub(rb'<c r="A1"', b'<c r="A1" s="999"', data, count=1)
            zout.writestr(item, data)
    tmp.replace(path)


def test_reads_and_rebuilds_file_saved_by_other_program(tmp_path, monkeypatch):
    from openpyxl import Workbook
    from app import labelsheet as S

    def book(path, with_labels):
        wb = Workbook()
        g = wb.active; g.title = "안내"; g["A1"] = "안내"
        a = wb.create_sheet("기사 목록"); a.append(["기사 ID", "언론사"]); a.append(["예시", "가람일보"]); a.append(["N01", "가람일보"])
        ws = wb.create_sheet("라벨링")
        ws.append(["기사 ID", "언론사", "문장 번호", "문장", "유형", "출처 유형"])
        ws.append(["예시", "가람일보", 1, "예시 문장이다.", "사실"])
        ws.append(["N01", "가람일보", 1, "가 문장이다.", "인용" if with_labels else None, "무소속 의원" if with_labels else None])
        for r in range(4, 10):
            ws.cell(r, 11, value=f'=IF(D{r}="","","x")')
        wb.create_sheet("요약")
        wb.save(path)
        return path

    template = book(tmp_path / "양식.xlsx", False)
    broken = book(tmp_path / "지원.xlsx", True)
    _break_styles(broken)
    assert not S.opens_with_openpyxl(broken)
    rows = S.read_rows(broken)                      # 예비 읽기 도구로 읽힘
    assert rows[0].source == "기타" and rows[0].source_detail == "무소속 의원"
    S.rebuild(broken, tmp_path / "정리.xlsx", template)
    assert S.opens_with_openpyxl(tmp_path / "정리.xlsx")
    assert S.read_rows(tmp_path / "정리.xlsx")[0].source_detail == "무소속 의원"


def test_broadcast_filler_removed():
    raw = ("국회 취재기자 연결해 상황 알아보겠습니다. 홍길동 기자, 법안이 통과됐습니까?\n"
           "네, 법안은 오늘 통과됐습니다.\n국회에서 TV조선 홍길동입니다.")
    assert L.body_to_sentences(raw) == ["네, 법안은 오늘 통과됐습니다."]
    assert not L.is_broadcast_filler("이것이 가장 큰 문제입니다.")
    assert not L.is_broadcast_filler("홍길동 기자는 법안이 문제라고 지적했다.")


def test_round_paths():
    assert L.round_paths(1) == (L.BODY_DIR, L.TABLE)
    body, table = L.round_paths(2)
    assert body.name == "본문_2차" and table.name == "라벨링표_2차.xlsx"


def test_related_article_lines_removed():
    assert L.clean_line("(참조 가람일보 8월25일자 <제목>)") == ""
    assert L.clean_line("▶ 관련 기사 보기") == ""
    assert L.clean_line("관련기사 목록") == ""
    assert L.clean_line("(서울=연합뉴스) 문장이다.") != ""


def test_related_note_inside_paragraph_removed():
    raw = "연구진은 개선안을 냈다. (참조 가람일보 8월25일자 <제목>)"
    assert L.body_to_sentences(raw) == ["연구진은 개선안을 냈다."]


def test_subheading_removed():
    raw = "첫 문장이다.\n◇2년 뒤 정말 시행되나\n■ 쟁점 정리\n둘째 문장이다."
    assert L.body_to_sentences(raw) == ["첫 문장이다.", "둘째 문장이다."]
    assert not L.is_subheading("◇ 정부는 과세를 2년 미뤘다.")  # 문장으로 끝나면 남김
