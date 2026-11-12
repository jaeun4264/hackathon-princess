"""수집한 기사 → 라벨링·시범 운영 후보 목록 (CSV)

    python -m app.candidates 윤석열 항소심 --날짜 2026-11-06
        → data/raw/ 의 수집 파일 중 검색어에 '윤석열'·'항소심'이 들어간 것을 모아
          data/raw/후보_윤석열_항소심.csv 저장 (번호 칸이 있어 고를 때 헷갈리지 않음)

- 묶음 기사(헤드라인·브리핑)와 사설·칼럼은 뺍니다 (11/7 결정).
- 언론사 이름을 모르는 작은 사이트(주소만 있는 것)는 뺍니다. --모든언론사 로 포함 가능.
- 같은 주소·같은 제목은 하나만 남깁니다.
- 후보 파일에는 요약이 들어 있어 data/raw 에 둡니다 (GitHub에 안 올라감).
"""
import argparse
import csv
import json
import re
from pathlib import Path

from app.collect import OUTLET_BY_DOMAIN, article_kind

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
KNOWN_OUTLETS = set(OUTLET_BY_DOMAIN.values())
COLUMNS = ["번호", "언론사", "발행시각", "제목", "요약", "원문 주소"]


def load_collected(words: list[str], raw_dir: Path = RAW_DIR) -> list[dict]:
    """검색어(query)에 words 가 모두 들어간 수집 파일의 기사들"""
    items = []
    for f in sorted(raw_dir.glob("*.json")):
        if f.name.startswith("news_"):
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if not isinstance(data, dict) or "articles" not in data:
            continue
        q = data.get("query", f.stem)
        if all(w in q for w in words):
            items += data["articles"]
    return items


def pick(items: list[dict], since: str | None = None, all_outlets: bool = False) -> list[dict]:
    seen_url, seen_title, out = set(), set(), []
    for a in sorted(items, key=lambda a: a.get("publishedAt", "")):
        title = a.get("title", "")
        if (a.get("kind") or article_kind(title)) != "기사":
            continue
        if not all_outlets and a.get("outlet") not in KNOWN_OUTLETS:
            continue
        if since and a.get("publishedAt", "")[:10] < since:
            continue
        key = re.sub(r"\W", "", title)
        if a.get("url") in seen_url or key in seen_title:
            continue
        seen_url.add(a.get("url"))
        seen_title.add(key)
        out.append(a)
    return out


def write_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for i, a in enumerate(rows, 1):
            when = a.get("publishedAt", "")[:16].replace("T", " ")
            w.writerow([i, a.get("outlet", ""), when, a.get("title", ""), a.get("summary", ""), a.get("url", "")])


def read_csv(path: Path) -> dict[int, dict]:
    with path.open(encoding="utf-8-sig") as f:
        return {int(r["번호"]): r for r in csv.DictReader(f)}


def main(argv=None):
    ap = argparse.ArgumentParser(description="수집한 기사로 후보 목록 만들기")
    ap.add_argument("검색어", nargs="+", help="수집할 때 쓴 검색어에 들어 있는 단어")
    ap.add_argument("--날짜", help="이 날짜(YYYY-MM-DD) 이후 기사만")
    ap.add_argument("--모든언론사", action="store_true")
    args = ap.parse_args(argv)

    items = load_collected(args.검색어)
    if not items:
        raise SystemExit(f"data/raw 에 검색어 {args.검색어} 로 수집한 파일이 없습니다. 먼저 python -m app.collect \"검색어\" 를 실행하세요.")
    rows = pick(items, args.날짜, args.모든언론사)
    out = RAW_DIR / f"후보_{'_'.join(args.검색어)}.csv"
    write_csv(rows, out)
    outlets = {}
    for a in rows:
        outlets[a["outlet"]] = outlets.get(a["outlet"], 0) + 1
    print(f"수집 {len(items)}건 → 후보 {len(rows)}건, 언론사 {len(outlets)}곳: {out}")
    print("  " + ", ".join(f"{k} {v}" for k, v in sorted(outlets.items(), key=lambda x: -x[1])[:15]))
    print("엑셀로 열어 '번호' 칸을 보고 같은 사건을 다룬 서로 다른 언론사 기사 5건을 고르세요.")


if __name__ == "__main__":
    main()
