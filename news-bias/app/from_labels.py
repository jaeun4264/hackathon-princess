"""라벨링 표(사람 정답·AI 결과) → 화면용 기사 데이터

시범 운영용: 기사 문장을 화면에 보여 주되, 모든 기사에 언론사 원문 링크를 붙입니다 (11/7 결정).
이슈 정보는 data/issues.json 에 적습니다 (예시는 그 파일 참고).

라벨은 'labels'에 적은 순서대로 찾습니다. 앞 파일(사람 정답)에 없는 문장만 뒤 파일(AI 결과)에서 가져옵니다.
"""
import json
import re
from datetime import datetime
from pathlib import Path

from app.collect import OUTLET_BY_DOMAIN
from app.labeling import RELATED, is_broadcast_filler
from app.labelsheet import LABEL_DIR, LIST_SHEET, SOURCE_CODE, TYPE_CODE, load_grid, read_rows
from app.pairs import article_list

ROOT = Path(__file__).resolve().parent.parent
ISSUES_FILE = ROOT / "data" / "issues.json"
RAW_DIR = ROOT / "data" / "raw"

# 언론사 이름 → id (주소의 첫 부분: newsis.com → newsis). 목록에 없으면 이름 그대로
OUTLET_ID = {name: domain.split(".")[0] for domain, name in OUTLET_BY_DOMAIN.items()}


def outlet_id(name: str) -> str:
    return OUTLET_ID.get(name, re.sub(r"\s+", "", name))


def to_iso(text: str) -> str:
    """'2026-11-04 21:20' → '2026-11-04T21:20:00+09:00' (이미 ISO면 그대로)"""
    text = str(text or "").strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%dT%H:%M:00+09:00")
        except ValueError:
            pass
    return text


def collected_summaries(raw_dir: Path = RAW_DIR) -> dict[str, str]:
    """수집해 둔 기사(data/raw/*.json)의 원문 주소 → 요약"""
    out = {}
    for f in raw_dir.glob("*.json"):
        if f.name.startswith("news_"):  # 우리가 만든 결과 파일은 건너뜀
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        items = data.get("articles", []) if isinstance(data, dict) else data
        for a in items if isinstance(items, list) else []:
            if isinstance(a, dict) and a.get("url"):
                out.setdefault(a["url"], a.get("summary", ""))
    return out


def _path(name: str) -> Path:
    p = Path(name)
    return p if p.exists() else LABEL_DIR / name


def issue_articles(issue: dict, summaries: dict[str, str]) -> tuple[list[dict], list[str]]:
    """이슈 하나의 기사 목록과 경고(라벨 없는 문장 등)"""
    table = _path(issue["table"])
    label_sets = []
    for name in issue["labels"]:
        p = _path(name)
        if p.exists():
            label_sets.append({r.key: r for r in read_rows(p) if r.type})
    warnings = [] if label_sets else [f"{issue['id']}: 라벨 파일을 하나도 찾지 못했습니다 {issue['labels']}"]

    meta = {a[0]: (a[1], a[2], a[3], None) for a in article_list(table)}
    times = {}
    g = load_grid(table, LIST_SHEET)
    for r in range(2, max((r for r, _ in g), default=0) + 1):
        if g.get((r, 1)):
            times[str(g[(r, 1)])] = g.get((r, 5))

    articles: dict[str, dict] = {}
    for row in read_rows(table):
        if is_broadcast_filler(row.text) or RELATED.search(row.text):
            continue
        lab = next((ls[row.key] for ls in label_sets if row.key in ls), None)
        if lab is None:
            warnings.append(f"{row.article_id}-{row.no}: 라벨이 없어 화면에서 뺐습니다")
            continue
        outlet, title, url, _ = meta.get(row.article_id, (row.outlet, "", "", None))
        art = articles.setdefault(row.article_id, {
            "id": row.article_id, "issueId": issue["id"], "outletId": outlet_id(outlet), "_outlet": outlet,
            "title": title, "summary": summaries.get(url, ""), "url": url,
            "publishedAt": to_iso(times.get(row.article_id)), "sentences": [], "framingTerms": [],
        })
        sid = f"s{len(art['sentences']) + 1}"
        quote = lab.type == "인용"
        source = SOURCE_CODE.get(lab.source, "etc") if quote and lab.source else None
        art["sentences"].append({
            "id": sid, "text": row.text, "type": TYPE_CODE[lab.type],
            "sourceType": source,
            "sourceName": (lab.speaker or lab.source_detail or lab.source) if quote else None,
            "sourceDetail": lab.source_detail if source == "etc" else None,
        })
        for term in lab.framing:
            if term in row.text:
                art["framingTerms"].append({"term": term, "sentenceId": sid})
    return list(articles.values()), warnings


def load_real(issues_file: Path = ISSUES_FILE) -> tuple[list[dict], list[dict], list[dict], list[str]]:
    """issues.json → (이슈, 기사, 언론사, 경고). 'use': false 인 이슈는 건너뜀"""
    config = json.loads(issues_file.read_text(encoding="utf-8"))
    summaries = collected_summaries()
    issues, articles, warnings = [], [], []
    for it in config["issues"]:
        if not it.get("use", True):
            continue
        arts, warn = issue_articles(it, summaries)
        issues.append({k: it[k] for k in ("id", "title", "summary", "category", "date")})
        articles += arts
        warnings += warn
    outlets = {}
    for a in articles:
        outlets.setdefault(a["outletId"], {"id": a["outletId"], "name": a.pop("_outlet")})
        a.pop("_outlet", None)
    return issues, articles, list(outlets.values()), warnings
