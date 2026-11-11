"""인용 기울기 검증 — 쌍 비교 (기획서 6. 검증 '편향 비교 정답')

같은 이슈 기사 두 개를 보여 주고 "어느 쪽이 정부·여당에 더 우호적인가"를 두 사람이 따로 고릅니다.
절대 점수보다 사람끼리 답이 잘 맞고, 인용 기울기가 사람 판단과 같은 방향인지 확인할 수 있습니다.

    python -m app.pairs 만들기 라벨링표_1차.xlsx
        → 쌍비교_1차.xlsx (같은 이슈 기사 쌍 목록. 복사해서 각자 '판단' 칸만 채움)
    python -m app.pairs 채점 쌍비교_1차_조서연.xlsx 쌍비교_1차_남지원.xlsx --라벨 정답_1차.xlsx [--라벨 라벨링표_AI_….xlsx]
        → 두 사람의 일치도, 그리고 각 라벨 표로 계산한 인용 기울기가 사람 판단과 맞는 비율

주의: 판단할 때는 기울기 숫자를 보지 않습니다 (쌍비교 표에도 넣지 않음).
"""
import argparse
import itertools
import sys
from collections import Counter
from pathlib import Path

from app.evaluate import _path, cohen_kappa, kappa_word
from app.labelsheet import LIST_SHEET, SOURCE_CODE, load_grid, read_rows
from app.metrics import quote_slope, smoothed_slope, source_entropy

SHEET = "쌍비교"
CHOICES = ["A", "B", "비슷함"]
QUESTION = "정부·여당에 더 우호적인 기사는? (A / B / 비슷함)"


def article_counts(label_file: Path) -> dict[str, Counter]:
    """라벨 표 → 기사별 출처 유형 인용 수 (gov, opp, …)"""
    out: dict[str, Counter] = {}
    for r in read_rows(label_file):
        c = out.setdefault(r.article_id, Counter())
        if r.type == "인용" and r.source:
            c[SOURCE_CODE.get(r.source, "etc")] += 1
    return out


def article_list(table: Path) -> list[tuple[str, str, str, str]]:
    """기사 목록 시트 → (기사 ID, 언론사, 제목, 원문 주소). 예시 줄은 뺌"""
    g = load_grid(table, LIST_SHEET)
    last = max((r for r, _ in g), default=0)
    rows = []
    for r in range(2, last + 1):
        aid = g.get((r, 1))
        if aid and aid != "예시":
            rows.append((str(aid), str(g.get((r, 2)) or ""), str(g.get((r, 3)) or ""), str(g.get((r, 4)) or "")))
    return rows


def make_sheet(table: Path, out: Path) -> int:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    arts = article_list(table)
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET
    ws.append(["쌍 번호", "A 기사", "A 언론사", "A 제목", "B 기사", "B 언론사", "B 제목", "판단", "메모"])
    for c in ws[1]:
        c.font = Font(bold=True)
    pairs = list(itertools.combinations(arts, 2))
    for i, (a, b) in enumerate(pairs, 1):
        if i % 2 == 0:  # A/B 자리를 번갈아 바꿔서 순서 효과를 줄임
            a, b = b, a
        ws.append([i, a[0], a[1], a[2], b[0], b[1], b[2], None, None])
    dv = DataValidation(type="list", formula1='"' + ",".join(CHOICES) + '"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"H2:H{len(pairs) + 1}")
    yellow = PatternFill("solid", fgColor="FFF2CC")
    for r in range(2, len(pairs) + 2):
        ws.cell(r, 8).fill = yellow
        ws.cell(r, 9).fill = yellow
    for col, w in zip("ABCDEFGHI", [8, 8, 12, 50, 8, 12, 50, 10, 30]):
        ws.column_dimensions[col].width = w
    guide = wb.create_sheet("안내")
    for line in [
        "쌍 비교 판단 방법",
        f"질문: {QUESTION}",
        "1. 두 기사 원문(기사 목록의 주소 또는 라벨링 표의 문장)을 읽고 '판단' 칸에서 고릅니다.",
        "2. 내 정치적 생각이 아니라 기사가 누구의 말과 입장을 더 많이·유리하게 전하는지를 봅니다.",
        "3. 차이를 말하기 어려우면 '비슷함'. 이유는 메모에 짧게.",
        "4. 서로 답을 보지 않고 각자 채웁니다. 인용 기울기 숫자도 보지 않습니다.",
    ]:
        guide.append([line])
    guide.column_dimensions["A"].width = 100
    for c in guide["A"]:
        c.alignment = Alignment(wrap_text=True)
    wb.save(out)
    return len(pairs)


def read_judgments(path: Path) -> dict[tuple[str, str], str]:
    """{(A 기사, B 기사): 판단}. 판단은 A/B 기준"""
    g = load_grid(path, SHEET)
    last = max((r for r, _ in g), default=0)
    out = {}
    for r in range(2, last + 1):
        a, b, j = g.get((r, 2)), g.get((r, 5)), g.get((r, 8))
        if a and b and j:
            out[(str(a), str(b))] = str(j).strip()
    return out


def read_pairs(path: Path) -> list[tuple[str, str]]:
    """쌍 비교 표의 모든 쌍 (판단 여부와 상관없이)"""
    g = load_grid(path, SHEET)
    last = max((r for r, _ in g), default=0)
    return [(str(g[(r, 2)]), str(g[(r, 5)])) for r in range(2, last + 1) if g.get((r, 2)) and g.get((r, 5))]


def predict(slopes: dict[str, float | None], a: str, b: str, tie: float = 0.0) -> str | None:
    """인용 기울기로 본 답. 둘 중 하나라도 계산 불가면 None"""
    sa, sb = slopes.get(a), slopes.get(b)
    if sa is None or sb is None:
        return None
    if abs(sa - sb) <= tie:
        return "비슷함"
    return "A" if sa > sb else "B"


def score_pairs(j1: dict, j2: dict, label_files: list[Path]) -> dict:
    keys = [k for k in j1 if k in j2]
    res = {"쌍": len(keys), "일치": sum(j1[k] == j2[k] for k in keys),
           "카파": cohen_kappa([j1[k] for k in keys], [j2[k] for k in keys])}
    agreed = [k for k in keys if j1[k] == j2[k] and j1[k] in ("A", "B")]
    res["둘 다 같은 쪽을 고른 쌍"] = len(agreed)
    res["라벨별"] = {}
    for f in label_files:
        counts = article_counts(f)
        out = {"기사별": {a: (quote_slope(c), smoothed_slope(c), source_entropy(c), sum(c.values()))
                         for a, c in sorted(counts.items())}}
        out["기울기 없는 기사"] = sum(1 for v in out["기사별"].values() if v[0] is None)
        for label, fn in (("보정", smoothed_slope), ("보정 전", quote_slope)):
            slopes = {a: fn(c) for a, c in counts.items()}
            preds = [(k, predict(slopes, *k)) for k in agreed]
            usable = [(k, p) for k, p in preds if p in ("A", "B")]
            out[label] = {"맞음": sum(p == j1[k] for k, p in usable), "판단 가능": len(usable),
                          "계산 불가·비슷함": len(preds) - len(usable)}
        res["라벨별"][f.stem] = out
    return res


def _f(x):
    return "-" if x is None else f"{x:+.2f}"


def main(argv=None):
    ap = argparse.ArgumentParser(description="인용 기울기 쌍 비교 검증")
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("만들기"); m.add_argument("표", help="기사 목록이 있는 라벨링 표"); m.add_argument("--출력")
    s = sub.add_parser("채점"); s.add_argument("a"); s.add_argument("b")
    s.add_argument("--라벨", action="append", default=[], help="기울기를 계산할 라벨 표 (정답, AI 결과 등). 여러 번 가능")
    args = ap.parse_args(argv)

    if args.cmd == "만들기":
        src = _path(args.표)
        stem = src.stem.replace("라벨링표_", "").replace("정답_", "")
        out = _path(args.출력) if args.출력 else src.with_name(f"쌍비교_{stem}.xlsx")
        n = make_sheet(src, out)
        print(f"{n}쌍 저장: {out}")
        print(f"복사해서 {out.stem}_조서연.xlsx, {out.stem}_남지원.xlsx 로 이름을 바꾸고 각자 '판단' 칸을 채우세요.")
        return

    j1, j2 = read_judgments(_path(args.a)), read_judgments(_path(args.b))
    total = len(read_pairs(_path(args.a)))
    for name, j in ((args.a, j1), (args.b, j2)):
        if len(j) < total:
            # 판단이 덜 끝났으면 멈춤: 기울기 숫자를 먼저 보면 판단이 그쪽으로 끌려가므로 아무 숫자도 보여 주지 않음
            sys.exit(f"{Path(name).name}: {total}쌍 중 {len(j)}쌍만 판단돼 있어 채점하지 않았습니다. "
                     "두 사람이 모든 쌍을 판단한 뒤 다시 실행해 주세요.")
    r = score_pairs(j1, j2, [_path(f) for f in args.라벨])
    print(f"두 사람: {r['쌍']}쌍 중 {r['일치']}쌍 일치, 카파 {r['카파']:.2f} ({kappa_word(r['카파'])})")
    print(f"둘 다 같은 쪽(A 또는 B)을 고른 쌍: {r['둘 다 같은 쪽을 고른 쌍']}개 → 이 쌍으로 기울기를 검증")
    for name, v in r["라벨별"].items():
        print(f"\n[{name}]")
        for label in ("보정", "보정 전"):
            x = v[label]
            acc = f"{x['맞음']}/{x['판단 가능']}" + (f" ({x['맞음'] / x['판단 가능'] * 100:.0f}%)" if x["판단 가능"] else "")
            print(f"  {label} 기울기가 사람 판단과 같은 방향: {acc}, 계산 불가·비슷함 {x['계산 불가·비슷함']}쌍")
        print(f"  기울기를 계산할 수 없는 기사(정부·여당·야당 인용 없음): {v['기울기 없는 기사']}건")
        print("  기사   기울기  보정 기울기  다양성  인용 수")
        for a, (sl, sm, en, n) in v["기사별"].items():
            print(f"  {a}   {_f(sl):>6}   {_f(sm):>8}   {('-' if en is None else f'{en:.2f}'):>5}   {n}")


if __name__ == "__main__":
    sys.exit(main())
