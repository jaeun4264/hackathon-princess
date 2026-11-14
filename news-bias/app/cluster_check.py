"""이슈 묶기 확인 — 자동으로 묶은 이슈가 정말 '같은 사건'인지 사람이 확인하고 정확도를 냄

    python -m app.cluster_check 만들기            → 매일 자동 실행과 똑같이 수집(data/daily.json 검색어)·묶기·AI 확인을 한 뒤
                                                     확인용 표 data/raw/labeling/이슈묶기_확인_<날짜시각>.xlsx 를 만듦
    python -m app.cluster_check 만들기 --AI없이    → AI 확인 단계 없이 (규칙 묶기만 확인)
    python -m app.cluster_check 만들기 --파일 data/raw/묶기수집_20261111_1800.json
                                                   → 새로 수집하지 않고 저장해 둔 수집 결과로 다시 묶기 (임계값 바꿔 비교할 때)
    python -m app.cluster_check 채점 이슈묶기_확인_20261111_1800.xlsx
                                                   → 사람이 적은 O/X 로 정확도 계산

확인하는 사람은 '기사' 시트의 '같은 사건?' 칸에 O / X 만 적습니다 (AI 판단은 숨긴 시트에 있으니 다 적은 뒤 채점).
기준: 이슈 대표 제목이 가리키는 '하나의 사건·결정·발표'를 다룬 기사면 O. 같은 분야의 다른 사건, 다른 날의 후속 사건이면 X.

제목·요약은 네이버 검색 결과(공개된 요약)이며, 이 표는 라벨링 폴더(data/raw, GitHub에 올리지 않음)에만 저장합니다.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from app import daily as D
from app.cluster import cluster, pick_articles

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
LABEL_DIR = RAW / "labeling"
MAX_GROUPS = 15      # 확인할 묶음 수 (매일 실행 미리보기와 같음)
SHOWN = 25           # 묶음마다 AI에게 보여 주는 기사 수와 같게

HEAD = Font(bold=True, color="FFFFFF")
HEAD_FILL = PatternFill("solid", fgColor="44546A")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")


# ---------- 만들기 ----------
def collect(cfg: dict, files: list[str] | None) -> tuple[list[dict], Path | None]:
    if files:
        arts, seen = [], set()
        for f in files:
            data = json.loads(Path(f).read_text(encoding="utf-8"))
            for a in data["articles"] if isinstance(data, dict) else data:
                if a.get("url") not in seen:
                    seen.add(a.get("url"))
                    arts.append(a)
        print(f"1. 저장된 수집 결과 {len(files)}개 파일에서 {len(arts)}건")
        return arts, None
    arts = D.collect_all(cfg)
    snap = RAW / f"묶기수집_{datetime.now(D.KST):%Y%m%d_%H%M}.json"
    snap.parent.mkdir(parents=True, exist_ok=True)
    snap.write_text(json.dumps({"collectedAt": datetime.now(D.KST).isoformat(), "queries": cfg["queries"],
                                "articles": arts}, ensure_ascii=False), encoding="utf-8")
    return arts, snap


def ai_check(cfg: dict, groups: list[list[dict]]) -> list[dict | None]:
    """매일 실행의 3단계(AI 확인)를 그대로. 실패하면 None"""
    import httpx
    from app import analyze as A
    llm = A.config(*A.parse_choice(cfg["model"]))
    out = []
    with httpx.Client(timeout=httpx.Timeout(300, connect=30)) as client:
        for i, g in enumerate(groups):
            raw = D.describe_issue_raw(llm, g, client)
            out.append(raw)
            print(f"  AI 확인 {i + 1}/{len(groups)}: " + ("한 사건" if raw and raw.get("same_event") else "아님/실패"))
            if i < len(groups) - 1:
                D.time.sleep(cfg["llmGap"])
    return out


def _header(ws, cols: list[tuple[str, int]]):
    for c, (name, width) in enumerate(cols, 1):
        cell = ws.cell(1, c, name)
        cell.font, cell.fill = HEAD, HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[cell.column_letter].width = width
    ws.freeze_panes = "A2"


def write_sheet(groups: list[list[dict]], ai: list[dict | None] | None, cfg: dict, dst: Path, note: str) -> None:
    wb = Workbook()
    guide = wb.active
    guide.title = "안내"
    lines = [
        "이슈 묶기 확인표",
        note,
        "",
        "할 일: '기사' 시트의 노란 칸 '같은 사건?'에 O 또는 X 만 적기 (모르겠으면 ? 를 적고 메모)",
        "기준: 그 이슈의 대표 제목(맨 위 기사)이 가리키는 '하나의 사건·결정·발표'를 다룬 기사면 O",
        "      같은 분야지만 다른 사건, 같은 인물의 다른 발언, 며칠 뒤 다른 후속 사건이면 X",
        "      여러 사건을 모은 기사(종합·브리핑)도 X",
        "'이슈' 시트의 '이슈로 내보내도 되나?' 칸: 화면에 이슈 하나로 보여 줘도 될 만큼 한 사건이면 O",
        "'입장이 갈리는 이슈인가?' 칸: 정부·여당, 야당, 단체, 업계 등의 입장이 맞서거나 평가가 갈리면 O. 한쪽 발표·행사, 사건·사고, 실적·시세, 홍보면 X",
        "'빅카인즈' 시트: bigkinds.or.kr 첫 화면 '오늘의 이슈'(08시·17시 기준) 10개를 그대로 옮기고, 같은 사건이 우리 이슈에 있으면 그 번호",
        "'앞 이슈와 같은 사건이면 그 번호' 칸: 같은 사건이 여러 이슈로 쪼개졌으면 먼저 나온 이슈 번호 (예: 3번이 1번과 같으면 3번 줄에 1)",
        "★표(대표 기사) = 실제 화면에 나가는 언론사별 기사. 이 기사들의 정확도가 가장 중요",
        "AI 판단은 숨긴 시트(_AI)에 있음. 다 적기 전에는 보지 않기 (보고 적으면 AI에 끌려감)",
        "다 적으면: python -m app.cluster_check 채점 " + dst.name,
        "",
        f"설정: 임계값 {cfg['threshold']}, 최소 언론사 {cfg['minOutlets']}곳, 최근 {cfg['hours']}시간, 묶음 최대 {MAX_GROUPS}개",
    ]
    for r, t in enumerate(lines, 1):
        guide.cell(r, 1, t).font = Font(bold=(r == 1), size=13 if r == 1 else 11)
    guide.column_dimensions["A"].width = 110

    iss = wb.create_sheet("이슈")
    _header(iss, [("이슈", 7), ("대표 제목", 55), ("사건 설명", 45), ("기사 수", 8), ("언론사 수", 9),
                  ("이슈로 내보내도 되나? (O/X)", 14), ("앞 이슈와 같은 사건이면 그 번호", 14),
                  ("입장이 갈리는 이슈인가? (O/X)", 14), ("메모", 40)])
    arts = wb.create_sheet("기사")
    _header(arts, [("이슈", 7), ("순서", 6), ("대표", 6), ("언론사", 12), ("제목", 60), ("요약 (앞부분)", 50),
                   ("유사도", 8), ("발행", 17), ("같은 사건? (O/X)", 11), ("메모", 30), ("링크", 40)])
    hidden = wb.create_sheet("_AI")
    _header(hidden, [("이슈", 7), ("순서", 6), ("AI 한 사건?", 10), ("AI 제외", 9), ("AI 이슈 제목", 40), ("AI 입장 갈림", 10)])

    ox = DataValidation(type="list", formula1='"O,X,?"', allow_blank=True)
    arts.add_data_validation(ox)
    ox2 = DataValidation(type="list", formula1='"O,X,?"', allow_blank=True)
    iss.add_data_validation(ox2)

    r = ir = 2
    for gi, g in enumerate(groups, 1):
        shown = g[:SHOWN]
        picked = {a["url"] for a in pick_articles(shown, cfg["articlesPerIssue"], cfg["preferOutlets"])}
        info = ai[gi - 1] if ai else None
        excluded = set(info.get("exclude", [])) if info else set()
        iss.append([gi, shown[0]["title"], "", len(g), len({a["outlet"] for a in g}), None, None, None, None])
        for c in (6, 7, 8):
            iss.cell(ir, c).fill = INPUT_FILL
        ox2.add(iss.cell(ir, 6))
        ox2.add(iss.cell(ir, 8))
        iss.cell(ir, 3).alignment = Alignment(wrap_text=True, vertical="top")
        ir += 1
        for k, a in enumerate(shown, 1):
            arts.append([gi, k, "★" if a["url"] in picked else "", a["outlet"], a["title"],
                         (a.get("summary") or "")[:80], round(a.get("_sim", 0), 2), (a.get("publishedAt") or "")[:16],
                         None, None, a["url"]])
            arts.cell(r, 9).fill = INPUT_FILL
            ox.add(arts.cell(r, 9))
            for c in (5, 6):
                arts.cell(r, c).alignment = Alignment(wrap_text=True, vertical="top")
            hidden.append([gi, k, ("O" if info.get("same_event") else "X") if info else "",
                           ("제외" if k in excluded else "") if info else "", (info or {}).get("title", "") if k == 1 else "",
                           ({True: "O", False: "X"}.get((info or {}).get("contested"), "") if k == 1 else "")])
            r += 1
    bk = wb.create_sheet("빅카인즈", 3)
    _header(bk, [("순위", 6), ("빅카인즈 오늘의 이슈 (제목·키워드 그대로)", 55), ("기사 수", 9),
                 ("우리 이슈 번호 (없으면 비움)", 14), ("메모", 40)])
    for k in range(1, 11):
        bk.append([k, None, None, None, None])
        for c in (2, 3, 4):
            bk.cell(k + 1, c).fill = INPUT_FILL
    hidden.sheet_state = "hidden"
    dst.parent.mkdir(parents=True, exist_ok=True)
    wb.save(dst)


def make(args) -> Path:
    cfg = D.load_config()
    if args.임계값:
        cfg["threshold"] = args.임계값
    arts, snap = collect(cfg, args.파일)
    groups = cluster(arts, cfg["threshold"], cfg["minOutlets"], cfg.get("merge"))[:MAX_GROUPS]
    print(f"2. 묶기: 언론사 {cfg['minOutlets']}곳 이상 묶음 {len(groups)}개 (최대 {MAX_GROUPS}개만 확인)")
    if not groups:
        raise SystemExit("묶음이 없습니다. 검색어(data/daily.json)나 --임계값 을 확인하세요.")
    ai = None if args.AI없이 else ai_check(cfg, groups)
    stamp = datetime.now(D.KST).strftime("%Y%m%d_%H%M")
    dst = LABEL_DIR / f"이슈묶기_확인_{stamp}{'' if cfg['threshold'] == 0.30 else '_임계' + str(cfg['threshold'])}.xlsx"
    src = snap.name if snap else ", ".join(Path(f).name for f in args.파일)
    write_sheet(groups, ai, cfg, dst, f"만든 시각 {stamp}, 수집 자료 {src}")
    print(f"저장: {dst}")
    if snap:
        print(f"수집 결과도 저장: {snap}  (임계값을 바꿔 다시 묶을 때 --파일 로 사용)")
    print(f"다 적은 뒤: python -m app.cluster_check 채점 {dst.name}")
    return dst


# ---------- 채점 ----------
def _ox(v) -> str | None:
    v = (str(v).strip().upper() if v is not None else "")
    return v if v in ("O", "X") else None


def read_sheet(path: Path) -> tuple[list[dict], dict[int, str | None]]:
    wb = load_workbook(path, data_only=True)
    ai = {}
    if "_AI" in wb.sheetnames:
        for row in wb["_AI"].iter_rows(min_row=2, values_only=True):
            if row[0] is not None:
                ai[(int(row[0]), int(row[1]))] = {"same": row[2] or None, "excluded": row[3] == "제외"}
    rows = []
    for row in wb["기사"].iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        g, k = int(row[0]), int(row[1])
        rows.append({"issue": g, "no": k, "picked": row[2] == "★", "outlet": row[3], "sim": row[6] or 0,
                     "human": _ox(row[8]), **ai.get((g, k), {"same": None, "excluded": False})})
    issue_ok, dup, contested = {}, {}, {}
    ws = wb["이슈"]
    head = [str(c.value or "") for c in ws[1]]
    col = lambda word: next((i for i, h in enumerate(head) if word in h), None)  # noqa: E731
    c_ok, c_dup, c_con = col("내보내도"), col("같은 사건이면"), col("입장이 갈리는")
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is None:
            continue
        g = int(r[0])
        issue_ok[g] = _ox(r[c_ok]) if c_ok is not None else None
        try:
            dup[g] = int(r[c_dup]) if c_dup is not None and r[c_dup] not in (None, "") else None
        except (TypeError, ValueError):
            dup[g] = None
        contested[g] = _ox(r[c_con]) if c_con is not None else None
    rows_ai_con = {}
    if "_AI" in wb.sheetnames:
        for row in wb["_AI"].iter_rows(min_row=2, values_only=True):
            if row[0] is not None and len(row) > 5 and row[5]:
                rows_ai_con[int(row[0])] = row[5]
    bk = []
    if "빅카인즈" in wb.sheetnames:
        for row in wb["빅카인즈"].iter_rows(min_row=2, values_only=True):
            if row[1]:
                bk.append(row[3])
    read_sheet.extra = {"contested": contested, "ai_contested": rows_ai_con, "bigkinds": bk}
    return rows, issue_ok, dup


def pct(a: int, b: int) -> str:
    return f"{a / b:.1%} ({a}/{b})" if b else "-"


def score(path: Path) -> dict:
    rows, issue_ok, dup = read_sheet(path)
    done = [r for r in rows if r["human"]]
    if not done:
        raise SystemExit("'같은 사건?' 칸이 비어 있습니다. O/X 를 적은 뒤 채점하세요.")
    blank = len(rows) - len(done)
    res = {}
    o = lambda rs: sum(r["human"] == "O" for r in rs)
    res["규칙 묶기 순도 (묶음에 들어간 기사 중 같은 사건)"] = pct(o(done), len(done))
    picked = [r for r in done if r["picked"]]
    res["화면에 나가는 대표 기사(★) 순도"] = pct(o(picked), len(picked))
    has_ai = any(r["same"] for r in rows)
    if has_ai:
        kept = [r for r in done if not r["excluded"] and r["same"] == "O"]
        res["AI 확인 후 순도 (AI가 한 사건이라 한 묶음, AI가 뺀 기사 제외)"] = pct(o(kept), len(kept))
        ex = [r for r in done if r["excluded"]]
        res["AI가 뺀 기사 중 실제로 다른 사건"] = pct(sum(r["human"] == "X" for r in ex), len(ex))
        xs = [r for r in done if r["human"] == "X"]
        res["다른 사건 기사 중 AI가 잡아낸 비율"] = pct(sum(r["excluded"] or r["same"] == "X" for r in xs), len(xs))
        pairs = [(issue_ok.get(g), next((r["same"] for r in rows if r["issue"] == g and r["same"]), None)) for g in issue_ok]
        pairs = [(h, a) for h, a in pairs if h and a]
        res["이슈 단위: 사람과 AI의 '한 사건' 판단 일치"] = pct(sum(h == a for h, a in pairs), len(pairs))
    judged = [v for v in issue_ok.values() if v]
    res["이슈 단위: 사람이 '내보내도 된다'고 한 이슈"] = pct(sum(v == "O" for v in judged), len(judged))
    ex = getattr(read_sheet, "extra", {})
    con = {g: v for g, v in ex.get("contested", {}).items() if v}
    if con:
        res["입장이 갈리는 이슈 (사람 판단)"] = pct(sum(v == "O" for v in con.values()), len(con))
        ai = ex.get("ai_contested", {})
        both = [(con[g], ai[g]) for g in con if g in ai]
        if both:
            res["입장 갈림: 사람과 AI 판단 일치"] = pct(sum(h == a for h, a in both), len(both))
    bk = ex.get("bigkinds", [])
    if bk:
        res["빅카인즈 오늘의 이슈 중 우리도 잡은 이슈 (재현율)"] = pct(sum(1 for x in bk if x not in (None, "")), len(bk))
    n_dup = sum(1 for v in dup.values() if v)
    res["쪼개짐: 앞 이슈와 같은 사건인 이슈"] = pct(n_dup, len(dup))
    res["서로 다른 사건 수 / 이슈 수"] = f"{len(dup) - n_dup}/{len(dup)}"
    # 임계값을 올리면? (유사도 낮은 기사부터 빠진다고 가정한 대략값)
    lines = []
    for t in (0.35, 0.40, 0.45):
        drop = [r for r in done if r["sim"] < t]
        lines.append(f"  유사도 {t:.2f} 미만을 빼면: 다른 사건 {sum(r['human'] == 'X' for r in drop)}건 빠짐, "
                     f"같은 사건 {o(drop)}건도 같이 빠짐")
    print(f"── {path.name} ──")
    if blank:
        print(f"(빈 칸·? {blank}건은 빼고 계산)")
    for k, v in res.items():
        print(f"{k}: {v}")
    print("참고(대략): 묶음 중심과의 유사도 기준")
    print("\n".join(lines))
    wrong = [r for r in done if r["human"] == "X"]
    if wrong:
        print("다른 사건으로 표시한 기사: " + ", ".join(f"이슈{r['issue']}-{r['no']}" for r in wrong[:30]))
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description="이슈 묶기 확인표 만들기·채점")
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("만들기")
    m.add_argument("--파일", nargs="+", help="저장해 둔 수집 결과 JSON (안 적으면 새로 수집)")
    m.add_argument("--AI없이", action="store_true", help="AI 확인 단계를 건너뜀")
    m.add_argument("--임계값", type=float, help="묶기 유사도 임계값 (기본 data/daily.json 값)")
    s = sub.add_parser("채점")
    s.add_argument("표")
    args = ap.parse_args(argv)
    if args.cmd == "만들기":
        make(args)
    else:
        p = Path(args.표)
        p = p if p.exists() else LABEL_DIR / args.표
        if not p.exists():
            sys.exit(f"파일이 없습니다: {p.name}")
        score(p)


if __name__ == "__main__":
    main()
