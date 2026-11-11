"""Syntitan에 올릴 표 만들기 (기획서 5. Syntitan 활용)

    python -m app.syntitan 진단 정답_1차.xlsx            → 무료 진단용 30줄 (의견·소수 출처를 빠짐없이 넣고 나머지는 사실)
    python -m app.syntitan 진단 정답_1차.xlsx --줄 20
    python -m app.syntitan 전체 정답_1차.xlsx            → 보강의 씨앗으로 쓸 정답 전체

결과: data/raw/syntitan/*.csv (기사 문장이 들어 있어 GitHub에 안 올라감)
열: 기사ID, 언론사, 문장, 유형, 출처유형, 인용한사람  ← analyze --예시 가 읽는 형식과 같음

규칙: 보강(Syntitan Model·Agent)의 씨앗은 1차 정답만, 평가는 2차 정답으로. 같은 문장이 씨앗과 평가에 동시에 들어가면 안 됨.
"""
import argparse
import csv
import random
from collections import Counter
from pathlib import Path

from app.labelsheet import LABEL_DIR, read_rows

OUT_DIR = LABEL_DIR.parent / "syntitan"
COLUMNS = ["기사ID", "언론사", "문장", "유형", "출처유형", "인용한사람"]


def to_row(r) -> list:
    source = (r.source_detail or r.source) if r.type == "인용" else ""
    return [r.article_id, r.outlet, r.text, r.type, source or "", (r.speaker or "") if r.type == "인용" else ""]


def diagnosis_sample(rows, n: int = 30, seed: int = 7) -> list:
    """의견 문장 전부 + 출처 유형마다 최소 2개 + 나머지는 사실로 채움 (불균형이 그대로 보이도록 사실이 가장 많게)"""
    rnd = random.Random(seed)
    rows = [r for r in rows if r.type]
    picked = [r for r in rows if r.type == "의견"]
    quotes = [r for r in rows if r.type == "인용"]
    for src in sorted({r.source for r in quotes}):
        same = [r for r in quotes if r.source == src]
        picked += rnd.sample(same, min(2, len(same)))
    facts = [r for r in rows if r.type == "사실"]
    picked += rnd.sample(facts, max(0, min(len(facts), n - len(picked))))
    keys = {r.key for r in picked}
    return [r for r in rows if r.key in keys][:max(n, len(picked))]


def write(rows, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(to_row(r) for r in rows)
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description="Syntitan에 올릴 라벨 표 만들기")
    ap.add_argument("명령", choices=["진단", "전체"])
    ap.add_argument("정답", help="정답 표 (예: 정답_1차.xlsx)")
    ap.add_argument("--줄", type=int, default=30)
    args = ap.parse_args(argv)
    src = Path(args.정답) if Path(args.정답).exists() else LABEL_DIR / args.정답
    rows = read_rows(src)
    if args.명령 == "진단":
        picked = diagnosis_sample(rows, args.줄)
        out = write(picked, OUT_DIR / f"진단_{src.stem}.csv")
    else:
        picked = [r for r in rows if r.type]
        out = write(picked, OUT_DIR / f"전체_{src.stem}.csv")
    c = Counter(r.type for r in picked)
    s = Counter((r.source_detail and "기타") or r.source for r in picked if r.type == "인용")
    print(f"{len(picked)}줄 저장: {out}")
    print("  유형: " + ", ".join(f"{k} {v}" for k, v in c.most_common()))
    print("  인용 출처: " + ", ".join(f"{k} {v}" for k, v in s.most_common()))
    print("주의: 기사 문장이 들어 있습니다. Syntitan 외의 곳(GitHub, 공개 페이지)에 올리지 마세요.")


if __name__ == "__main__":
    main()
