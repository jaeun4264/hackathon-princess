"""테스트용 라벨링 표 만들기 (지어낸 문장만 사용)"""
import pytest
from openpyxl import Workbook

SENTS = [
    ("N01", "가람일보", 1, "법안이 위원회를 통과했다."),
    ("N01", "가람일보", 2, '가상당 대표는 "철회하라"고 말했다.'),
    ("N01", "가람일보", 3, "민심을 외면한 처사라는 지적을 피하기 어렵다."),
    ("N02", "나래신문", 1, "한 교수는 \"위헌 소지가 있다\"고 지적했다."),
    ("N02", "나래신문", 2, "본회의는 오후 3시에 열린다."),
]


def make_table(path, labels=None):
    """labels: [(유형, 출처, 인용한 사람), …] — SENTS 순서대로"""
    wb = Workbook()
    ws = wb.active
    ws.title = "라벨링"
    ws.append(["기사 ID", "언론사", "문장 번호", "문장", "유형", "출처 유형", "인용한 사람", "평가가 담긴 표현", "애매함", "메모"])
    ws.append(["예시", "가람일보", 1, "예시 문장이다.", "사실"])
    for i, s in enumerate(SENTS):
        lab = (labels[i] if labels else (None, None, None))
        ws.append(list(s) + list(lab))
    wb.save(path)
    return path


@pytest.fixture
def tables(tmp_path):
    return lambda name, labels=None: make_table(tmp_path / name, labels)
