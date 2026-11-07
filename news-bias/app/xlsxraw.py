"""엑셀 파일을 openpyxl 없이 직접 읽는 예비 읽기 도구

엑셀이 아닌 프로그램(웹 오피스, 다른 스프레드시트 앱 등)으로 저장한 파일은 openpyxl이 못 여는 경우가 있습니다.
그럴 때 값만이라도 읽을 수 있게, 파일 안의 XML을 직접 읽습니다 (서식·드롭다운은 읽지 않음).
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(el) -> str:
    """<si>나 <is> 안의 모든 <t> 글자를 이어 붙임 (서식이 섞인 글자 포함)"""
    return "".join(t.text or "" for t in el.iter() if _local(t.tag) == "t")


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def read_sheet(path: Path, sheet_name: str) -> dict[tuple[int, int], object]:
    """{(행, 열): 값} — 수식 칸은 마지막으로 계산된 값"""
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = None
        for el in wb.iter():
            if _local(el.tag) == "sheet" and el.get("name") == sheet_name:
                rid = next(v for k, v in el.attrib.items() if _local(k) == "id")
        if rid is None:
            raise KeyError(f"시트 '{sheet_name}'가 없습니다")
        target = next(el.get("Target") for el in rels if el.get("Id") == rid)
        target = target.lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            shared = [_text(si) for si in ET.fromstring(z.read("xl/sharedStrings.xml")) if _local(si.tag) == "si"]
        cells = {}
        for c in ET.fromstring(z.read(target)).iter():
            if _local(c.tag) != "c":
                continue
            ref, t = c.get("r"), c.get("t")
            row = int(re.search(r"\d+", ref).group(0))
            v = next((x for x in c if _local(x.tag) == "v"), None)
            if t == "inlineStr":
                isel = next((x for x in c if _local(x.tag) == "is"), None)
                val = _text(isel) if isel is not None else None
            elif v is None or v.text is None:
                continue
            elif t == "s":
                val = shared[int(v.text)]
            elif t in ("str", "e"):
                val = v.text
            elif t == "b":
                val = v.text == "1"
            else:
                num = float(v.text)
                val = int(num) if num.is_integer() else num
            if val not in (None, ""):
                cells[(row, _col_index(ref))] = val
        return cells
