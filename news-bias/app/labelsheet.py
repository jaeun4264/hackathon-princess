"""라벨링 표(엑셀) 읽고 쓰기 — 사람·규칙·AI 라벨을 모두 같은 표 형식으로 다룹니다.

표 칸: A 기사 ID, B 언론사, C 문장 번호, D 문장, E 유형, F 출처 유형, G 인용한 사람,
      H 평가가 담긴 표현, I 애매함, J 메모 (K 확인은 엑셀 수식)
"""
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from app.schemas import SOURCE_LABELS

LABEL_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "labeling"
TEMPLATE = LABEL_DIR / "라벨링표_양식.xlsx"
SHEET = "라벨링"
LIST_SHEET = "기사 목록"
FIRST_ROW = 2
EXAMPLE_ID = "예시"
TYPES = ["사실", "의견", "인용"]
SOURCE_NAMES = list(SOURCE_LABELS.values())          # 정부·여당, 야당, …, 기타
MAIN_SOURCE_NAMES = [n for n in SOURCE_NAMES if n != "기타"]  # 목록에서 고르는 5개
TYPE_CODE = {"사실": "fact", "의견": "opinion", "인용": "quote"}
SOURCE_CODE = {v: k for k, v in SOURCE_LABELS.items()}


@dataclass
class Row:
    article_id: str
    outlet: str
    no: int
    text: str
    type: str | None = None          # 사실 / 의견 / 인용
    source: str | None = None        # 정부·여당 … 기업·업계, 그 밖은 '기타'로 묶음
    source_detail: str | None = None  # 기타일 때 표에 적힌 원래 명칭 (예: 무소속 의원)
    speaker: str | None = None
    framing: list[str] = field(default_factory=list)
    unsure: bool = False
    memo: str | None = None
    excel_row: int = 0

    @property
    def key(self) -> tuple[str, int]:
        return (self.article_id, self.no)


def _s(v) -> str | None:
    v = None if v is None else str(v).strip()
    return v or None


def split_source(value: str | None) -> tuple[str | None, str | None]:
    """출처 유형 칸의 값 → (유형, 원래 명칭). 5개 유형이 아니면 '기타'로 묶고 적힌 이름을 원래 명칭으로 보관"""
    value = _s(value)
    if not value:
        return None, None
    if value in MAIN_SOURCE_NAMES:
        return value, None
    if value == "기타":
        return "기타", None
    # 여러 개를 쉼표로 적었으면 기준대로 먼저 나온 사람(첫 번째)만 씀: "야당, 정부·여당" → 야당
    first = value.split(",", 1)[0].strip()
    if first in MAIN_SOURCE_NAMES:
        return first, None
    return "기타", first.removeprefix("기타:").removeprefix("기타 ").strip() or None


def opens_with_openpyxl(path: Path) -> bool:
    from openpyxl import load_workbook
    try:
        load_workbook(path)
        return True
    except Exception:
        return False


def load_grid(path: Path, sheet: str) -> dict[tuple[int, int], object]:
    """시트의 값을 {(행, 열): 값}으로. openpyxl이 못 여는 파일(다른 프로그램으로 저장)은 예비 읽기 도구로 읽음"""
    from openpyxl import load_workbook
    try:
        ws = load_workbook(path, data_only=True)[sheet]
        return {(c.row, c.column): c.value for row in ws.iter_rows() for c in row if c.value not in (None, "")}
    except Exception:
        from app.xlsxraw import read_sheet
        return read_sheet(path, sheet)


def read_rows(path: Path) -> list[Row]:
    g = load_grid(path, SHEET)
    last = max((r for r, _ in g), default=0)
    rows = []
    for r in range(FIRST_ROW, last + 1):
        aid, text = _s(g.get((r, 1))), _s(g.get((r, 4)))
        if not aid or aid == EXAMPLE_ID or not text:
            continue
        framing = _s(g.get((r, 8)))
        source, detail = split_source(g.get((r, 6)))
        rows.append(Row(
            article_id=aid, outlet=_s(g.get((r, 2))) or "", no=int(g.get((r, 3))),
            text=text, type=_s(g.get((r, 5))), source=source, source_detail=detail,
            speaker=_s(g.get((r, 7))),
            framing=[t.strip() for t in framing.split(",") if t.strip()] if framing else [],
            unsure=_s(g.get((r, 9))) == "O", memo=_s(g.get((r, 10))), excel_row=r,
        ))
    return rows


def rebuild(src: Path, dst: Path, template: Path = TEMPLATE) -> None:
    """다른 프로그램으로 저장돼 깨진 표를 깨끗한 양식으로 다시 만듦 (기사 목록과 A~J 칸 값을 그대로 옮김)"""
    from openpyxl import load_workbook

    if not template.exists():
        raise SystemExit(f"양식 파일이 없습니다: {template}")
    lab, lst = load_grid(src, SHEET), load_grid(src, LIST_SHEET)
    wb = load_workbook(template)
    ws, wl = wb[SHEET], wb[LIST_SHEET]
    for (r, c), v in lst.items():
        if r >= 3 and c <= 5:
            wl.cell(r, c).value = v
    for (r, c), v in lab.items():
        if r >= FIRST_ROW and c <= 10 and _s(lab.get((r, 1))) != EXAMPLE_ID:
            ws.cell(r, c).value = v
    wb.save(dst)


def write_labels(src: Path, dst: Path, labels: dict[tuple[str, int], dict]) -> int:
    """src 표를 dst로 복사하고 E~H(유형·출처 유형·인용한 사람·평가 표현) 칸을 채움. 채운 줄 수를 돌려줌"""
    from openpyxl import load_workbook

    if not opens_with_openpyxl(src):
        rebuild(src, dst)  # 다른 프로그램으로 저장된 표 → 깨끗한 양식으로 다시 만든 뒤 채움
    elif src.resolve() != dst.resolve():
        shutil.copy(src, dst)
    wb = load_workbook(dst)
    ws = wb[SHEET]
    n = 0
    for row in read_rows(src):
        lab = labels.get(row.key)
        if not lab:
            continue
        ws.cell(row.excel_row, 5).value = lab.get("type")
        value = lab.get("source")
        if value == "기타" and lab.get("detail"):
            value = lab["detail"]  # 기타는 원래 명칭으로 적음
        ws.cell(row.excel_row, 6).value = value if lab.get("type") == "인용" else None
        ws.cell(row.excel_row, 7).value = lab.get("speaker") if lab.get("type") == "인용" else None
        ws.cell(row.excel_row, 8).value = ", ".join(lab.get("framing") or []) or None
        n += 1
    wb.save(dst)
    return n
