"""일치도·정확도 계산 (기획서 6. 검증)

    python -m app.evaluate 비교 라벨링표_서연.xlsx 라벨링표_지원.xlsx
        → 두 사람의 일치도(카파)를 보여 주고, 비교_결과.xlsx 를 만듦
          (같은 답은 '최종' 칸이 미리 채워지고, 다른 답은 비어 있어 논의 후 채움)

    python -m app.evaluate 정답 비교_결과.xlsx
        → '최종' 칸이 채워진 문장만 모아 정답 표(정답_1차.xlsx)를 만듦

    python -m app.evaluate 채점 정답_1차.xlsx 라벨링표_AI.xlsx [다른 예측 파일 …]  → 여러 개면 마지막에 비교 표
        → 정답 대비 정확도, 의견 문장 재현율, 출처 유형별 재현율. '전부 사실' 기준선도 함께 보여 줌

파일 이름만 쓰면 data/raw/labeling 폴더에서 찾습니다.
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

from app.labelsheet import MAIN_SOURCE_NAMES, SOURCE_NAMES, TYPES, Row, read_rows, split_source, write_labels

LABEL_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "labeling"


# ---------- 계산 ----------
def cohen_kappa(a: list[str], b: list[str]) -> float:
    """두 사람 라벨의 카파. 1이면 완전 일치, 0이면 우연 수준"""
    n = len(a)
    if n == 0:
        return float("nan")
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def kappa_word(k: float) -> str:
    """Landis & Koch(1977) 해석 기준"""
    if k != k:
        return "계산 불가"
    for limit, word in [(0.2, "낮음"), (0.4, "약함"), (0.6, "보통"), (0.8, "높음")]:
        if k <= limit:
            return word
    return "매우 높음"


def pair_rows(a: list[Row], b: list[Row]) -> tuple[list[tuple[Row, Row]], list[str]]:
    """같은 문장끼리 짝짓기. 문장이 다르면(표를 따로 고친 경우) 경고"""
    bm = {r.key: r for r in b}
    pairs, warn = [], []
    for r in a:
        o = bm.get(r.key)
        if o is None:
            warn.append(f"{r.article_id}-{r.no}: 두 번째 표에 없음")
        elif o.text != r.text:
            warn.append(f"{r.article_id}-{r.no}: 문장 내용이 다름 (한쪽 표를 고친 것 같음)")
        else:
            pairs.append((r, o))
    return pairs, warn


def agreement(pairs: list[tuple[Row, Row]]) -> dict:
    done = [(x, y) for x, y in pairs if x.type and y.type]
    t_a, t_b = [x.type for x, _ in done], [y.type for _, y in done]
    both_quote = [(x, y) for x, y in done if x.type == y.type == "인용"]
    s_a, s_b = [x.source or "" for x, _ in both_quote], [y.source or "" for _, y in both_quote]
    return {
        "문장": len(pairs),
        "둘 다 라벨": len(done),
        "유형 일치": sum(x == y for x, y in zip(t_a, t_b)),
        "유형 카파": cohen_kappa(t_a, t_b),
        "둘 다 인용": len(both_quote),
        "출처 일치": sum(x == y for x, y in zip(s_a, s_b)),
        "출처 카파": cohen_kappa(s_a, s_b),
        "유형 조합": Counter(f"{x}→{y}" for x, y in zip(t_a, t_b) if x != y),
    }


def score(gold: list[Row], pred: list[Row]) -> dict:
    """정답 대비 예측 성능. 유형은 문장 전체, 출처 유형은 정답이 인용인 문장에서"""
    pm = {r.key: r for r in pred}
    g = [(r, pm.get(r.key)) for r in gold if r.type]
    n = len(g)
    per_type = {}
    for t in TYPES:
        tp = sum(1 for r, p in g if r.type == t and p and p.type == t)
        actual = sum(1 for r, _ in g if r.type == t)
        predicted = sum(1 for _, p in g if p and p.type == t)
        per_type[t] = {"정답 수": actual, "재현율": tp / actual if actual else None,
                       "정밀도": tp / predicted if predicted else None}
    quotes = [(r, p) for r, p in g if r.type == "인용" and r.source]
    per_source = {}
    for s in SOURCE_NAMES:
        items = [(r, p) for r, p in quotes if r.source == s]
        if items:
            hit = sum(1 for r, p in items if p and p.type == "인용" and p.source == s)
            per_source[s] = {"정답 수": len(items), "재현율": hit / len(items)}
    all_fact = sum(1 for r, _ in g if r.type == "사실") / n if n else 0
    return {
        "문장": n,
        "예측 없음": sum(1 for _, p in g if not (p and p.type)),
        "정확도": sum(1 for r, p in g if p and p.type == r.type) / n if n else 0,
        "전부 사실 기준선": all_fact,
        "유형별": per_type,
        "출처 정확도": (sum(1 for r, p in quotes if p and p.source == r.source) / len(quotes)) if quotes else None,
        "출처별": per_source,
        "혼동": Counter(f"{r.type}→{(p.type if p and p.type else '없음')}" for r, p in g if not (p and p.type == r.type)),
    }


# ---------- 엑셀 출력 ----------
def write_comparison(pairs, names: tuple[str, str], out: Path) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    a, b = names
    wb = Workbook()
    ws = wb.active
    ws.title = "비교"
    head = ["기사 ID", "언론사", "문장 번호", "문장",
            f"{a} 유형", f"{b} 유형", "최종 유형",
            f"{a} 출처", f"{b} 출처", "최종 출처",
            f"{a} 인용한 사람", f"{b} 인용한 사람", "최종 인용한 사람", "다름", "논의 메모"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3A5F")
    yellow = PatternFill("solid", fgColor="FFF5CC")
    for x, y in pairs:
        same_t = x.type == y.type and x.type
        same_s = same_t and (x.type != "인용" or x.source == y.source)
        final_t = x.type if same_t else None
        final_s = x.source if (same_t and x.type == "인용" and same_s) else None
        final_p = x.speaker if final_s else None
        diff = [] if (same_t and same_s) else (["유형"] if not same_t else ["출처"])
        shown = lambda r: (r.source_detail or r.source) if r.source == "기타" else r.source  # noqa: E731
        final_shown = shown(x) if final_s else None
        ws.append([x.article_id, x.outlet, x.no, x.text, x.type, y.type, final_t,
                   shown(x), shown(y), final_shown, x.speaker, y.speaker, final_p, ", ".join(diff), None])
        if diff:
            for col in (7, 10, 13):
                ws.cell(ws.max_row, col).fill = yellow
    last = ws.max_row
    dv1 = DataValidation(type="list", formula1='"' + ",".join(TYPES) + '"', allow_blank=True)
    dv2 = DataValidation(type="list", formula1='"' + ",".join(MAIN_SOURCE_NAMES) + '"', allow_blank=True,
                         showErrorMessage=True, errorStyle="information", errorTitle="출처 유형",
                         error="5개 유형이 아니면 원래 명칭(예: 무소속 의원)을 그대로 두세요.")
    ws.add_data_validation(dv1); dv1.add(f"G2:G{last}")
    ws.add_data_validation(dv2); dv2.add(f"J2:J{last}")
    for col, w in zip("ABCDEFGHIJKLMNO", [8, 10, 6, 60, 8, 8, 9, 10, 10, 10, 14, 14, 14, 8, 24]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = f"A1:O{last}"
    wb.save(out)


def comparison_to_gold(comp: Path, template: Path, out: Path) -> tuple[int, int]:
    """비교 결과의 '최종' 칸 → 정답 라벨링 표. (정답 문장 수, 아직 빈 문장 수)"""
    from openpyxl import load_workbook

    ws = load_workbook(comp, data_only=True)["비교"]
    labels, empty = {}, 0
    for r in range(2, ws.max_row + 1):
        aid, no, t = ws.cell(r, 1).value, ws.cell(r, 3).value, ws.cell(r, 7).value
        if not aid:
            continue
        if not t or (t == "인용" and not ws.cell(r, 10).value):
            empty += 1
            continue
        src, detail = split_source(ws.cell(r, 10).value)
        labels[(str(aid), int(no))] = {"type": t, "source": src, "detail": detail, "speaker": ws.cell(r, 13).value}
    # 정답 표에는 정답이 정해진 문장만 남김
    write_labels(template, out, labels)
    wb = load_workbook(out)
    sh = wb["라벨링"]
    for row in read_rows(out):
        if row.key not in labels:
            for c in range(1, 11):
                sh.cell(row.excel_row, c).value = None
    wb.save(out)
    return len(labels), empty


# ---------- 명령 ----------
def run_stats(path: Path) -> dict | None:
    """AI 결과 표의 '실행 기록' 시트 → 속도·토큰 요약. 없으면(사람·규칙 표) None"""
    from app.labelsheet import load_grid
    try:
        g = load_grid(path, "실행 기록")
    except Exception:
        return None
    last = max((r for r, _ in g), default=0)
    rows = [[g.get((r, c)) for c in range(1, 8)] for r in range(2, last + 1) if g.get((r, 1))]
    if not rows:
        return None
    timed = [r for r in rows if isinstance(r[2], (int, float))]
    articles = {str(r[0]).split("-")[0] for r in rows}
    sec = sum(r[2] for r in timed)
    sents = sum(r[1] or 0 for r in timed)
    out_tok = [r[5] for r in timed if isinstance(r[5], (int, float))]

    def tok(r):  # 전체 토큰이 있으면 그걸(생각 토큰 포함), 없으면 입력+출력
        if isinstance(r[6], (int, float)):
            return r[6]
        if isinstance(r[4], (int, float)) and isinstance(r[5], (int, float)):
            return r[4] + r[5]
        return None
    toks = [tok(r) for r in timed]
    reqs = [r[3] for r in timed if isinstance(r[3], (int, float))]
    return {"기사": len(articles), "완전": len(timed) == len(rows), "총 초": sec,
            "기사당 토큰": sum(toks) / len(articles) if timed and None not in toks else None,
            "기사당 요청": sum(reqs) / len(articles) if reqs else None,
            "기사당 초": sec / len(articles) if timed else None,
            "문장당 초": sec / sents if sents else None,
            "출력 토큰": sum(out_tok) if out_tok else None}


def daily_capacity(st: dict, rpd: float | None, rpm: float | None, tpm: float | None, gap: float = 4.0) -> dict:
    """무료 한도로 하루에 분석할 수 있는 기사 수. 가장 작은 값이 실제 한계(병목)"""
    lim = {}
    if rpd and st["기사당 요청"]:
        lim["하루 요청 수(RPD)"] = rpd / st["기사당 요청"]
    if rpm and st["기사당 요청"]:
        lim["분당 요청 수(RPM)"] = 1440 * rpm / st["기사당 요청"]
    if tpm and st["기사당 토큰"]:
        lim["분당 토큰 수(TPM)"] = 1440 * tpm / st["기사당 토큰"]
    if st["기사당 초"]:
        lim["응답 속도(한 번에 하나씩)"] = 86400 / (st["기사당 초"] + gap)
    return lim


def _path(p: str) -> Path:
    q = Path(p)
    return q if q.exists() or q.is_absolute() else LABEL_DIR / p


def expand(patterns: list[str]) -> list[str]:
    """'라벨링표_AI_*_사전.xlsx' 처럼 * 가 든 이름을 라벨링 폴더의 파일들로 펼침 (윈도 명령창은 직접 안 펼쳐 줌)"""
    out = []
    for p in patterns:
        if any(ch in p for ch in "*?"):
            found = sorted(str(f) for f in LABEL_DIR.glob(p)) or sorted(str(f) for f in Path().glob(p))
            if not found:
                raise SystemExit(f"'{p}' 에 맞는 파일이 없습니다.")
            out += found
        else:
            out.append(p)
    return out


def _pct(x) -> str:
    return "-" if x is None else f"{x * 100:.1f}%"


def main(argv=None):
    ap = argparse.ArgumentParser(description="라벨링 일치도·정확도 계산")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("비교"); c.add_argument("a"); c.add_argument("b"); c.add_argument("--출력", default="비교_결과.xlsx")
    g = sub.add_parser("정답"); g.add_argument("비교결과"); g.add_argument("--원본", default="라벨링표_1차.xlsx"); g.add_argument("--출력", default="정답_1차.xlsx")
    s = sub.add_parser("채점"); s.add_argument("정답"); s.add_argument("예측", nargs="+")
    h = sub.add_parser("한도", help="AI 결과 표의 실행 기록 + 무료 한도 → 하루에 분석 가능한 기사 수")
    h.add_argument("예측"); h.add_argument("--RPD", type=float); h.add_argument("--RPM", type=float); h.add_argument("--TPM", type=float)
    args = ap.parse_args(argv)

    if args.cmd == "비교":
        pa, pb = _path(args.a), _path(args.b)
        pairs, warn = pair_rows(read_rows(pa), read_rows(pb))
        for w in warn[:10]:
            print("주의:", w)
        st = agreement(pairs)
        print(f"문장 {st['문장']}개 중 둘 다 라벨을 붙인 문장 {st['둘 다 라벨']}개")
        print(f"유형(사실/의견/인용): {st['유형 일치']}/{st['둘 다 라벨']} 일치, 카파 {st['유형 카파']:.2f} ({kappa_word(st['유형 카파'])})")
        if st["둘 다 인용"]:
            print(f"출처 유형(둘 다 인용인 {st['둘 다 인용']}문장): {st['출처 일치']}개 일치, 카파 {st['출처 카파']:.2f} ({kappa_word(st['출처 카파'])})")
        if st["유형 조합"]:
            print("자주 갈린 조합:", ", ".join(f"{k} {v}" for k, v in st["유형 조합"].most_common(5)))
        out = _path(args.출력) if "/" in args.출력 or "\\" in args.출력 else LABEL_DIR / args.출력
        write_comparison(pairs, (pa.stem.split("_")[-1], pb.stem.split("_")[-1]), out)
        print("저장:", out, "(노란 칸 = 서로 다른 문장, 논의해서 '최종' 칸을 채우세요)")

    elif args.cmd == "정답":
        out = LABEL_DIR / args.출력
        n, empty = comparison_to_gold(_path(args.비교결과), _path(args.원본), out)
        print(f"정답 문장 {n}개 저장: {out}" + (f" (최종 칸이 빈 {empty}문장은 제외)" if empty else ""))

    elif args.cmd == "한도":
        st = run_stats(_path(args.예측))
        if not st or st["기사당 초"] is None:
            print("실행 기록이 없습니다. --다시 를 붙여 analyze 를 다시 돌려 주세요.")
            return
        print(f"기사 {st['기사']}건 기준: 기사당 요청 {st['기사당 요청']:.1f}번, "
              + (f"토큰 {st['기사당 토큰']:,.0f}개, " if st["기사당 토큰"] else "")
              + f"응답 {st['기사당 초']:.1f}초")
        if not (args.RPD or args.RPM or args.TPM):
            print("Google AI Studio → 사용량/한도(Rate limit) 화면의 RPD·RPM·TPM 값을 --RPD --RPM --TPM 으로 넣으면 하루 한계를 계산합니다.")
        lim = daily_capacity(st, args.RPD, args.RPM, args.TPM)
        for k, v in sorted(lim.items(), key=lambda x: x[1]):
            print(f"  {k} 기준: 하루 약 {v:,.0f}건")
        if lim:
            k, v = min(lim.items(), key=lambda x: x[1])
            print(f"→ 하루 최대 약 {v:,.0f}건 (병목: {k}). 데모 범위(이슈 10개 × 언론사 10곳 = 100건)는 "
                  + ("하루 안에 가능" if v >= 100 else f"약 {100 / v:.1f}일 필요"))

    elif args.cmd == "채점":
        gold = read_rows(_path(args.정답))
        results = []
        for f in expand(args.예측):
            r = score(gold, read_rows(_path(f)))
            r["속도"] = run_stats(_path(f))
            results.append((Path(f).stem.removeprefix("라벨링표_"), r))
            print(f"\n[{Path(f).name}]")
            print(f"정답 {r['문장']}문장" + (f", 예측 없음 {r['예측 없음']}" if r["예측 없음"] else ""))
            print(f"정확도 {_pct(r['정확도'])}  (참고: 모두 '사실'로 찍으면 {_pct(r['전부 사실 기준선'])})")
            for t_, v in r["유형별"].items():
                print(f"  {t_}: 정답 {v['정답 수']}개, 재현율 {_pct(v['재현율'])}, 정밀도 {_pct(v['정밀도'])}")
            if r["출처별"]:
                print(f"출처 유형 정확도(정답이 인용인 문장) {_pct(r['출처 정확도'])}")
                for s_, v in r["출처별"].items():
                    print(f"  {s_}: 정답 {v['정답 수']}개, 재현율 {_pct(v['재현율'])}")
            if r["혼동"]:
                print("틀린 조합(정답→예측):", ", ".join(f"{k} {v}" for k, v in r["혼동"].most_common(6)))
            sp = r["속도"]
            if sp and sp["기사당 초"] is not None:
                print(f"속도: 응답 시간 합계 {sp['총 초']:.1f}초, 기사당 {sp['기사당 초']:.1f}초"
                      + (f", 출력 토큰 {sp['출력 토큰']:,}" if sp["출력 토큰"] else "")
                      + ("" if sp["완전"] else " (시간 기록이 빠진 기사가 있음)"))
        if len(results) > 1:
            print("\n비교 (발표 표에 옮길 숫자)")
            print("예측".ljust(28) + "정확도   의견 재현율  인용 재현율  출처 정확도  기사당 초")
            for name, r in results:
                ty = r["유형별"]
                print(name[:27].ljust(28) + f"{_pct(r['정확도']):>6}   {_pct(ty.get('의견', {}).get('재현율')):>8}   "
                      f"{_pct(ty.get('인용', {}).get('재현율')):>8}   {_pct(r.get('출처 정확도')):>8}   "
                      + (f"{r['속도']['기사당 초']:>7.1f}" if r.get("속도") and r["속도"]["기사당 초"] is not None else "      -"))


if __name__ == "__main__":
    sys.exit(main())
