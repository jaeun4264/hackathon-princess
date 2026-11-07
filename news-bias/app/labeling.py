"""라벨링 표 채우기 도우미

기사 본문을 메모장 파일에 붙여 넣으면, 문장으로 나눠 라벨링 표의 회색 칸(기사 ID·언론사·문장 번호·문장)을 채웁니다.

    python -m app.labeling 채우기            → 본문 폴더의 .txt 를 읽어 라벨링표_1차.xlsx 에 문장 채우기
    python -m app.labeling 채우기 --미리보기  → 저장하지 않고 나뉜 문장 수만 확인

폴더 구조 (모두 data/raw/labeling 안 → GitHub에 올라가지 않음)
    라벨링표_양식.xlsx      빈 양식
    라벨링표_1차.xlsx       기사 목록이 채워진 1차 표 (이 파일에 문장이 채워짐)
    본문/N01_뉴시스.txt …   '#'으로 시작하는 줄은 안내문이라 무시, 그 아래에 본문을 붙여 넣기

문장 나누기 규칙 (라벨링 기준 문서 '문장 나누기')
    - 마침표·물음표·느낌표 뒤에서 나눔
    - 따옴표·대괄호 안의 마침표에서는 나누지 않음 ("A. B."라고 말했다 → 1문장)
    - 기자 이름·이메일, [서울=뉴시스] 같은 머리말, ◀ 앵커 ▶ 표시, 무단 전재 안내는 뺌
"""
import argparse
import re
import sys
from pathlib import Path

LABEL_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "labeling"
BODY_DIR = LABEL_DIR / "본문"
TABLE = LABEL_DIR / "라벨링표_1차.xlsx"
SHEET = "라벨링"
FIRST_ROW = 2           # 1행은 제목
EXAMPLE_ID = "예시"     # 양식의 예시 줄
GIVEN_COLS = 4          # A~D: 기사 ID, 언론사, 문장 번호, 문장
LABEL_COLS = range(5, 11)  # E~J: 각자 채우는 칸

OPEN_CLOSE = {"“": "”", "‘": "’", "[": "]", "(": ")", "「": "」", "『": "』"}
TOGGLE = {'"'}  # 여는/닫는 모양이 같은 따옴표

DROP_LINE = re.compile(r"@|무단\s*전재|재배포|Copyright|ⓒ|저작권자")
PREFIXES = [
    re.compile(r"^\[[^\]]{1,20}=[^\]]{1,15}\]\s*"),                     # [서울=뉴시스]
    re.compile(r"^(?:[가-힣]{2,4}\s*)+(?:인턴\s*)?기자\s*=\s*"),          # 홍길동 김철수 기자 =
    re.compile(r"^◀\s*(?:앵커|리포트|기자)\s*▶\s*"),                    # ◀ 앵커 ▶
    re.compile(r"^\[(?:앵커|기자|리포트)\]\s*"),                         # [앵커]
]


def clean_line(line: str) -> str:
    line = line.strip()
    if not line or line.startswith("#") or DROP_LINE.search(line):
        return ""
    changed = True
    while changed:
        changed = False
        for p in PREFIXES:
            new = p.sub("", line)
            if new != line:
                line, changed = new.strip(), True
    return line


def _split(text: str, use_quotes: bool) -> list[str]:
    out, buf, stack = [], [], []
    for i, ch in enumerate(text):
        buf.append(ch)
        if use_quotes:
            if ch in TOGGLE:
                if stack and stack[-1] == ch:
                    stack.pop()
                else:
                    stack.append(ch)
            elif ch in OPEN_CLOSE:
                stack.append(OPEN_CLOSE[ch])
            elif stack and ch == stack[-1]:
                stack.pop()
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if ch in ".?!" and not stack and (nxt == "" or nxt.isspace()):
            out.append("".join(buf).strip())
            buf = []
    rest = "".join(buf).strip()
    if rest:
        out.append(rest)
    return [s for s in out if len(s) >= 2]


def split_sentences(paragraph: str) -> list[str]:
    """한 문단을 문장으로 나눔. 따옴표 짝이 안 맞으면 따옴표를 무시하고 나눔"""
    sents = _split(paragraph, use_quotes=True)
    # 따옴표가 안 닫혀 문단 전체가 한 덩어리가 됐다면 따옴표를 무시하고 다시 나눔
    if len(sents) == 1 and len(_split(paragraph, use_quotes=False)) > 1 and not _balanced(paragraph):
        sents = _split(paragraph, use_quotes=False)
    return sents


def _balanced(text: str) -> bool:
    stack = []
    for ch in text:
        if ch in TOGGLE:
            if stack and stack[-1] == ch:
                stack.pop()
            else:
                stack.append(ch)
        elif ch in OPEN_CLOSE:
            stack.append(OPEN_CLOSE[ch])
        elif stack and ch == stack[-1]:
            stack.pop()
    return not stack


def is_speaker_tag(line: str) -> bool:
    """방송 기사의 말한 사람 표시 줄 (예: '김승수 / 국민의힘 의원', '정점식 국민의힘 원내대표 :')"""
    return (
        len(line) <= 40
        and line[-1] not in ".?!\"”'’"
        and line[0] not in "\"“'‘"
        and ("/" in line or line.endswith(":"))
    )


def body_to_sentences(raw: str) -> list[str]:
    """본문 → 문장 목록. 말한 사람 표시 줄은 바로 다음 문장 앞에 [ ]로 붙임"""
    sentences, speaker = [], None
    for line in raw.splitlines():
        line = clean_line(line)
        if not line:
            continue
        if is_speaker_tag(line):
            speaker = line.rstrip(": ").strip()
            continue
        sents = split_sentences(line)
        if speaker and sents:
            sents[0] = f"[{speaker}] {sents[0]}"
            speaker = None
        sentences.extend(sents)
    if speaker:  # 뒤에 말이 없으면 그대로 남김
        sentences.append(speaker)
    return sentences


def read_bodies(body_dir: Path = BODY_DIR) -> list[tuple[str, str, list[str]]]:
    """본문 폴더의 'N01_뉴시스.txt' → (기사 ID, 언론사, 문장들)"""
    items = []
    for f in sorted(body_dir.glob("*.txt")):
        aid, _, outlet = f.stem.partition("_")
        items.append((aid, outlet, body_to_sentences(f.read_text(encoding="utf-8-sig"))))
    return items


def fill_table(items, table: Path = TABLE) -> list[str]:
    """라벨링 표의 회색 칸을 채움. 이미 누가 라벨을 붙였으면 덮어쓰지 않고 멈춤."""
    from openpyxl import load_workbook

    wb = load_workbook(table)
    ws = wb[SHEET]
    data_rows = [r for r in range(FIRST_ROW, ws.max_row + 1) if ws.cell(r, 1).value != EXAMPLE_ID]
    started = [r for r in data_rows if any(ws.cell(r, c).value not in (None, "") for c in LABEL_COLS)]
    if started:
        raise SystemExit(f"이미 라벨이 적힌 줄이 있어 덮어쓰지 않습니다 (예: {started[0]}행). 빈 '라벨링표_1차.xlsx'로 다시 해 주세요.")

    rows = [(aid, outlet, n, s) for aid, outlet, sents in items for n, s in enumerate(sents, 1)]
    if len(rows) > len(data_rows):
        raise SystemExit(f"문장이 {len(rows)}개인데 표에 준비된 줄은 {len(data_rows)}줄입니다.")
    for r in data_rows:  # 이전에 채운 문장 지우기
        for c in range(1, GIVEN_COLS + 1):
            ws.cell(r, c).value = None
    for r, values in zip(data_rows, rows):
        for c, v in enumerate(values, 1):
            ws.cell(r, c).value = v
    wb.save(table)
    return [f"{aid} {outlet}: {len(s)}문장" for aid, outlet, s in items]


def main(argv=None):
    p = argparse.ArgumentParser(description="라벨링 표에 기사 문장 채우기")
    p.add_argument("명령", choices=["채우기"])
    p.add_argument("--미리보기", action="store_true", help="저장하지 않고 문장 수만 확인")
    args = p.parse_args(argv)

    items = read_bodies()
    if not items:
        sys.exit(f"{BODY_DIR} 에 .txt 파일이 없습니다.")
    empty = [f"{aid}_{o}" for aid, o, s in items if not s]
    for aid, outlet, sents in items:
        print(f"{aid} {outlet}: {len(sents)}문장" + (f"  (첫 문장: {sents[0][:30]}…)" if sents else "  ← 본문이 비어 있음"))
    print(f"합계 {sum(len(s) for _, _, s in items)}문장")
    if args.미리보기:
        return
    if empty:
        sys.exit(f"본문이 비어 있는 파일이 있어 저장하지 않았습니다: {', '.join(empty)}")
    fill_table(items)
    print(f"저장: {TABLE}")


if __name__ == "__main__":
    main()
