"""매일 자동 실행 (GitHub Actions가 08시·17시에 실행) — 사람 손 없이 기능 ①~④용 데이터를 만듭니다.

    python -m app.daily               → data/daily/news.json (프론트가 읽는 파일)
    python -m app.daily --미리보기     → 이슈 묶기까지만 하고 어떤 이슈가 잡혔는지 보여 줌 (AI·원문 요청 없음)

순서
 1. 수집: data/daily.json 의 검색어마다 네이버 뉴스 최신순 수집
 2. 묶기: 최근 N시간 기사를 같은 사건끼리 묶고, 언론사 4곳 이상이 다룬 묶음만 (app/cluster.py)
 3. 확인: AI가 묶음의 제목들을 보고 '정말 한 사건인지' 판단, 이슈 제목·요약·분야 작성 (판정 없이 사실만)
 4. 분석: 언론사가 겹치지 않게 기사를 골라 원문 본문을 읽고(app/fetch.py) 문장별 라벨 (app/analyze.py)
    → 본문은 저장하지 않음. 남기는 것은 라벨과 의견 문장 앞 40자 (11/5·11/7 결정)
 5. 합치기: 사람이 확인한 이슈(data/curated.json) + 최근 14일 자동 이슈 → 빠진 관점 계산, 형식 검사 → 저장

키: 환경 변수(또는 .env) NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, GEMINI_API_KEY
"""
import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from app import analyze as A
from app.build import build_news, find_problems, strip_sentences
from app.cluster import cluster, pick_articles
from app.fetch import Fetcher, FetchError
from app.from_labels import outlet_id
from app.labeling import body_to_sentences
from app.labelsheet import SOURCE_CODE, TYPE_CODE, Row

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "daily.json"
DAILY_DIR = ROOT / "data" / "daily"
ARTICLE_CACHE = DAILY_DIR / "articles"   # 저작권 처리가 끝난 기사 (다시 분석하지 않으려고)
ARCHIVE = DAILY_DIR / "archive.json"     # 최근 자동 이슈 보관
OUTPUT = DAILY_DIR / "news.json"
CURATED = ROOT / "data" / "curated.json"
KST = timezone(timedelta(hours=9))

DEFAULTS = {
    "queries": ["정부", "국회", "대통령실", "더불어민주당", "국민의힘", "검찰", "법원",
                "경제", "부동산", "물가", "노동", "교육", "복지", "환경"],
    "perQuery": 400, "perQuerySim": 100, "hours": 36, "maxNewIssues": 6, "articlesPerIssue": 5, "minArticles": 3,
    "minOutlets": 4, "threshold": 0.30, "merge": 0.45, "keepDays": 14, "maxSentences": 70,
    "categories": ["정치", "사회", "경제"],   # 이 분야 이슈만 사이트에 올림 (국제·생활·사건·사고·연예·스포츠는 뺌)
    "requireContested": True,   # 입장이 갈리는 이슈만 (한쪽 발표·사건·실적 기사는 인용 기울기가 의미 없음)
    "maxOpinionShare": 0.5,     # 의견 문장이 이보다 많으면 본문 읽기 이상으로 보고 건너뜀
    "model": "gemini-3.5-flash-lite", "llmGap": 4.0,
    "preferOutlets": ["연합뉴스", "뉴시스", "뉴스1", "KBS", "MBC", "SBS", "YTN", "JTBC", "TV조선", "채널A",
                      "조선일보", "중앙일보", "동아일보", "한겨레", "경향신문", "한국일보", "세계일보", "국민일보",
                      "서울신문", "문화일보", "매일경제", "한국경제", "머니투데이", "이데일리", "서울경제"],
}

ISSUE_PROMPT = """너는 뉴스 편집 보조다. 판정·평가 없이 사실만 쓴다. 특정 정당이나 인물에 유리한 단어를 쓰지 않는다.
아래는 비슷하다고 자동으로 묶인 기사 제목과 요약이다.
1) 대부분의 기사가 '같은 하나의 사건·결정·발표'를 다루면 same_event=true.
   서로 다른 사건이 섞였거나, 기사들이 한 사람의 발언 한 마디만 옮긴 것이면 false.
2) 같은 사건이 아닌 기사 번호는 exclude 에 적는다.
3) title: 이슈 제목 25자 이내, 평가 단어(강행·폭주·꼼수 등) 없이. summary: 누가 언제 무엇을 했는지 두 문장 이내.
4) category: 정치 / 경제 / 사회 / 생활 / 국제 / 사건·사고 / 연예·스포츠 중 하나.
   국제 = 외국에서 일어난 일로 한국 정부·정당이 당사자가 아닌 것. 연예인·운동선수 관련은 재판이라도 연예·스포츠.
   사건·사고 = 범죄 수사, 재판(정치인 재판 제외), 화재·교통·산업 사고처럼 정책·정당 대립이 없는 일.
6) contested: 정부·여당, 야당, 시민단체, 업계, 전문가 등 서로 다른 입장이 맞서거나 평가가 갈리는 정치·정책 이슈면 true.
   한쪽 발표만 있는 행사·홍보, 기업 실적·주가, 범죄 수사, 사고, 연예 소식이면 false.
5) '이미 있는 이슈' 목록이 주어지면, 그중 이 기사들과 같은 사건(같은 결정·발표·사고)이 있으면 duplicate_of 에 그 번호, 없으면 0.
   같은 주제라도 다른 날의 새 결정·새 사건이면 0.
반드시 JSON 하나만 출력: {"same_event": true, "title": "", "summary": "", "category": "", "exclude": [], "duplicate_of": 0, "contested": true}"""
FRAMING_MAX = 15  # 평가 표현으로 인정할 최대 글자 수 (단어·짧은 구)
CATEGORIES = ("정치", "경제", "사회", "생활", "국제", "사건·사고", "연예·스포츠")


def log(msg: str) -> None:
    print(msg, flush=True)


def load_config(path: Path = CONFIG) -> dict:
    cfg = dict(DEFAULTS)
    if path.exists():
        cfg.update({k: v for k, v in json.loads(path.read_text(encoding="utf-8")).items() if not k.startswith("_")})
    return cfg


def url_key(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:10]


def parse_time(iso: str) -> datetime | None:
    try:
        return datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return None


# ---------- 1. 수집 ----------
def collect_all(cfg: dict, collect_fn=None) -> list[dict]:
    from app.collect import CollectError, collect
    collect_fn = collect_fn or collect
    out, seen = [], set()
    # 최신순만 모으면 검색어마다 최근 1~2시간 기사만 잡혀서(11/12 확인: 1,013건 중 절반이 마지막 20분)
    # 같은 사건을 언론사들이 몇 시간에 걸쳐 쓴 것을 놓침 → 최신순을 더 깊게 + 관련도순도 함께
    for q in cfg["queries"]:
        for sort, n in (("date", cfg["perQuery"]), ("sim", cfg.get("perQuerySim", 0))):
            if not n:
                continue
            try:
                got = collect_fn(q, n, sort)
            except CollectError as e:
                log(f"  수집 실패 '{q}'({sort}): {e}")
                continue
            new = [a for a in got if a["url"] not in seen]
            seen.update(a["url"] for a in new)
            out += new
    since = datetime.now(KST) - timedelta(hours=cfg["hours"])
    recent = [a for a in out if (t := parse_time(a.get("publishedAt"))) and t >= since]
    log(f"1. 수집: {len(out)}건 중 최근 {cfg['hours']}시간 {len(recent)}건")
    return recent


# ---------- 3. AI 확인 ----------
def describe_issue_raw(llm: dict, members: list[dict], client: httpx.Client,
                       existing: list[str] | None = None) -> dict | None:
    """AI 응답 그대로 (same_event, exclude 는 앞 25건의 1부터 시작하는 번호). 실패하면 None
    existing: 최근 이슈 제목들 → 같은 사건이면 duplicate_of 에 그 번호(1부터)"""
    shown = members[:25]
    lines = "\n".join(f"{i}. [{a['outlet']}] {a['title']} — {a.get('summary', '')[:120]}" for i, a in enumerate(shown, 1))
    if existing:
        lines += "\n\n[이미 있는 이슈]\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(existing, 1))
    try:
        text = A.call_llm(llm, ISSUE_PROMPT, lines, client)
        m = re.search(r"\{.*\}", text, re.S)
        return json.loads(m.group(0)) if m else None
    except (A.LLMError, ValueError) as e:
        log(f"  이슈 확인 실패: {e}")
        return None


def describe_issue(llm: dict, members: list[dict], client: httpx.Client,
                   existing: list[str] | None = None) -> dict | None:
    shown = members[:25]
    info = describe_issue_raw(llm, members, client, existing)
    if not info or not info.get("same_event") or not info.get("title"):
        return None
    drop = {shown[i - 1]["url"] for i in info.get("exclude", []) if isinstance(i, int) and 1 <= i <= len(shown)}
    info["members"] = [a for a in members if a["url"] not in drop]
    if info.get("category") not in CATEGORIES:
        info["category"] = "사회"
    dup = info.get("duplicate_of")
    info["duplicate_of"] = dup if isinstance(dup, int) and existing and 1 <= dup <= len(existing) else 0
    return info


# ---------- 4. 기사 분석 ----------
def clean_body(text: str, title: str) -> str:
    """본문에서 제목 줄과 소제목·사진 설명처럼 문장으로 끝나지 않는 짧은 줄을 뺌"""
    norm = lambda s: re.sub(r"\W", "", s)
    keep = []
    for line in text.splitlines():
        line = line.strip()
        if not line or norm(line) == norm(title):
            continue
        if len(line) < 60 and not re.search(r"[.?!\"”’'다]$", line):
            continue
        keep.append(line)
    return "\n".join(keep)


def analyze_article(art: dict, issue_id: str, llm: dict, fetcher: Fetcher, client: httpx.Client, cfg: dict) -> dict | None:
    """원문 → 라벨이 붙고 저작권 처리가 끝난 기사. 본문은 이 함수 안에서만 쓰고 버림"""
    key = url_key(art["url"])
    cache = ARTICLE_CACHE / f"{key}.json"
    if cache.exists():
        cached = json.loads(cache.read_text(encoding="utf-8"))
        cached["issueId"] = issue_id
        return cached
    try:
        body = fetcher.body(art["url"])
    except FetchError as e:
        log(f"    건너뜀 [{art['outlet']}] {e}")
        return None
    texts = body_to_sentences(clean_body(body, art["title"]))
    del body
    if len(texts) > cfg["maxSentences"]:
        # 보통 기사는 50문장 안팎. 이보다 훨씬 길면 관련 기사·다른 글이 섞여 읽혔을 가능성이 큼 (AI 요청 전에 거름)
        log(f"    건너뜀 [{art['outlet']}] 본문이 너무 김 ({len(texts)}문장) — 다른 글이 섞였을 수 있음")
        return None
    if len(texts) < 5:
        log(f"    건너뜀 [{art['outlet']}] 문장이 {len(texts)}개뿐")
        return None
    aid = f"a-{key}"
    rows = [Row(article_id=aid, outlet=art["outlet"], no=i, text=t) for i, t in enumerate(texts, 1)]
    try:
        labels = A.analyze_article(llm, art["outlet"], rows, client)
    except A.LLMError as e:
        log(f"    건너뜀 [{art['outlet']}] AI 분석 실패: {e}")
        return None
    n_op = sum(1 for lab in labels.values() if lab["type"] == "의견")
    if len(rows) >= 12 and n_op / len(rows) > cfg.get("maxOpinionShare", 0.5):
        # 일반 기사(사설·칼럼은 수집 단계에서 뺌)에서 의견이 절반을 넘으면 본문을 잘못 읽었을 가능성이 큼
        log(f"    건너뜀 [{art['outlet']}] 의견 문장 {n_op}/{len(rows)} — 본문 읽기 이상 의심")
        return None
    if llm.get("members"):  # 국회의원 소속 사전으로 출처 유형 바로잡기 (data/members.csv 가 있을 때)
        from app.members import fix_labels
        fix_labels(labels, {r.no: r.text for r in rows}, llm["members"])
    sentences, framing = [], []
    for r in rows:
        lab = labels[r.no]
        sid = f"s{r.no}"
        quote = lab["type"] == "인용"
        source = SOURCE_CODE.get(lab["source"], "etc") if quote and lab["source"] else None
        sentences.append({
            "id": sid, "text": r.text, "type": TYPE_CODE[lab["type"]], "sourceType": source,
            "sourceName": (lab["speaker"] or lab["detail"] or lab["source"]) if quote else None,
            "sourceDetail": lab["detail"] if source == "etc" else None,
        })
        # 평가 표현은 문장에 글자 그대로 있는 짧은 말만 (AI가 절 전체를 적거나 띄어쓰기를 바꾼 것은 화면에서 강조할 수 없음)
        framing += [{"term": w, "sentenceId": sid} for w in lab["framing"]
                    if w and len(w) <= FRAMING_MAX and w in (r.text or "")]
    strip_sentences(sentences)  # ← 여기서 사실·인용 문장 글자를 지움. 이후로는 라벨만 남음
    out = {"id": aid, "issueId": issue_id, "outletId": outlet_id(art["outlet"]), "outletName": art["outlet"],
           "title": art["title"], "summary": art.get("summary", ""), "url": art["url"],
           "publishedAt": art.get("publishedAt", ""), "sentences": sentences, "framingTerms": framing,
           "analyzedBy": llm["model"]}
    ARTICLE_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    time.sleep(cfg["llmGap"])
    return out


# ---------- 5. 합치기 ----------
def load_archive() -> dict:
    if ARCHIVE.exists():
        return json.loads(ARCHIVE.read_text(encoding="utf-8"))
    return {"issues": [], "articles": []}


def already_have(archive: dict, members: list[dict]) -> bool:
    """이미 보관 중인 이슈와 기사 2건 이상이 겹치면 같은 이슈로 봄"""
    urls = {a["url"] for a in members}
    for iss in archive["issues"]:
        mine = {a["url"] for a in archive["articles"] if a["issueId"] == iss["id"]}
        if len(urls & mine) >= 2:
            return True
    return False


def recent_issue_titles(archive: dict, hours: int) -> list[str]:
    """최근 hours 시간 안의 자동 이슈 제목 (같은 실행에서 방금 만든 이슈 포함) — AI가 중복을 판단할 때 보여 줌"""
    cutoff = (datetime.now(KST) - timedelta(hours=hours + 24)).date().isoformat()
    return [i["title"] for i in archive["issues"] if i.get("date", "") >= cutoff][-20:]


def hide(archive: dict, ids: list[str]) -> dict:
    """사람이 내리기로 한 자동 이슈 빼기 (data/daily.json 의 hideIssues)"""
    ids = set(ids)
    if not ids:
        return archive
    return {"issues": [i for i in archive["issues"] if i["id"] not in ids],
            "articles": [a for a in archive["articles"] if a["issueId"] not in ids]}


def prune(archive: dict, keep_days: int) -> dict:
    cutoff = (datetime.now(KST) - timedelta(days=keep_days)).date().isoformat()
    issues = [i for i in archive["issues"] if i["date"] >= cutoff]
    ids = {i["id"] for i in issues}
    return {"issues": issues, "articles": [a for a in archive["articles"] if a["issueId"] in ids]}


def assemble(archive: dict) -> dict:
    """보관 중인 자동 이슈 + 사람이 확인한 이슈 → 프론트용 news.json"""
    issues = [dict(i) for i in archive["issues"]]
    articles = [{k: v for k, v in a.items() if k not in ("outletName", "analyzedBy")} for a in archive["articles"]]
    outlets = {a["outletId"]: {"id": a["outletId"], "name": a["outletName"]} for a in archive["articles"]}
    if CURATED.exists():
        cur = json.loads(CURATED.read_text(encoding="utf-8"))
        issues = [{k: v for k, v in i.items() if k not in ("articleIds", "displaySourceTypes")} for i in cur["issues"]] + issues
        articles = [{k: v for k, v in a.items() if k != "missingViewpoints"} for a in cur["articles"]] + articles
        for o in cur["outlets"]:
            outlets.setdefault(o["id"], o)
    for i in issues:
        i.setdefault("origin", "auto")
        i.pop("articleIds", None)
    data = build_news(issues, articles, list(outlets.values()),
                      note="매일 자동 수집·AI 분석 결과(origin=auto)와 사람이 확인한 이슈(origin=curated). "
                           "기사 문장의 저작권은 각 언론사에 있어 사실·인용 문장은 싣지 않고 원문 링크를 표시합니다.")
    data["issues"].sort(key=lambda i: i["date"], reverse=True)
    return data


def run(cfg: dict, preview: bool = False, collect_fn=None, fetcher: Fetcher | None = None, llm: dict | None = None,
        client: httpx.Client | None = None) -> dict | None:
    log(f"== 매일 자동 실행 {datetime.now(KST):%Y-%m-%d %H:%M} (KST) ==")
    recent = collect_all(cfg, collect_fn)
    groups = cluster(recent, cfg["threshold"], cfg["minOutlets"], cfg.get("merge"))
    log(f"2. 묶기: 언론사 {cfg['minOutlets']}곳 이상이 다룬 묶음 {len(groups)}개")
    archive = hide(prune(load_archive(), cfg["keepDays"]), cfg.get("hideIssues", []))
    if preview:
        for m in groups[:15]:
            log(f"  [{len(m)}건/{len({a['outlet'] for a in m})}곳] {m[0]['title'][:50]}"
                + ("  (이미 있음)" if already_have(archive, m) else ""))
        return None

    llm = llm or A.config(*A.parse_choice(cfg["model"]))
    from app.members import load as load_members
    members = load_members()
    if members:
        llm["members"] = members
        log(f"   국회의원 소속 사전 {len(members)}명 사용")
    fetcher = fetcher or Fetcher()
    today = datetime.now(KST).date().isoformat()
    made = 0
    with (client or httpx.Client(timeout=httpx.Timeout(300, connect=30))) as client:
        for members in groups:
            if made >= cfg["maxNewIssues"]:
                break
            if already_have(archive, members):
                continue
            recent_titles = recent_issue_titles(archive, cfg["hours"])
            info = describe_issue(llm, members, client, recent_titles)
            time.sleep(cfg["llmGap"])
            if not info:
                log(f"  제외(한 사건이 아님): {members[0]['title'][:40]}")
                continue
            if info["category"] not in cfg["categories"]:
                log(f"  제외(분야 {info['category']}): {info['title']}")
                continue
            if cfg.get("requireContested", True) and info.get("contested") is False:
                log(f"  제외(입장이 갈리는 이슈가 아님): {info['title']}")
                continue
            if info["duplicate_of"]:
                log(f"  제외(이미 있는 이슈와 같은 사건: {recent_titles[info['duplicate_of'] - 1]}): {info['title']}")
                continue
            issue_id = f"auto-{today.replace('-', '')}-{datetime.now(KST):%H}-{made + 1}"
            log(f"3. 이슈: {info['title']} ({info['category']}, 후보 {len(info['members'])}건)")
            arts = []
            for a in pick_articles(info["members"], cfg["articlesPerIssue"] + 3, cfg["preferOutlets"]):
                if len(arts) >= cfg["articlesPerIssue"]:
                    break
                got = analyze_article(a, issue_id, llm, fetcher, client, cfg)
                if got:
                    arts.append(got)
                    log(f"    분석 [{a['outlet']}] 문장 {len(got['sentences'])}개")
            if len(arts) < cfg["minArticles"]:
                log(f"  제외(분석된 기사 {len(arts)}건 < {cfg['minArticles']})")
                continue
            dates = sorted(x["publishedAt"][:10] for x in arts if x.get("publishedAt"))
            archive["issues"].append({"id": issue_id, "title": info["title"], "summary": info["summary"],
                                      "category": info["category"], "date": dates[0] if dates else today,
                                      "origin": "auto"})
            archive["articles"] += arts
            made += 1
    log(f"4. 새 이슈 {made}개, 보관 중인 자동 이슈 {len(archive['issues'])}개")

    data = assemble(archive)
    problems = find_problems(data, need_url=True)
    if problems:
        log("형식 문제가 있어 저장하지 않았습니다:")
        for p in problems[:20]:
            log(" - " + p)
        return None
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE.write_text(json.dumps(archive, ensure_ascii=False, indent=1), encoding="utf-8")
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"5. 저장: {OUTPUT.relative_to(ROOT)} (이슈 {len(data['issues'])}개, 기사 {len(data['articles'])}건)")
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description="매일 자동 수집·이슈 묶기·AI 분석")
    ap.add_argument("--미리보기", action="store_true", help="묶기까지만 (AI·원문 요청 없음)")
    args = ap.parse_args(argv)
    try:
        data = run(load_config(), preview=args.미리보기)
    except A.LLMError as e:
        sys.exit(f"오류: {e}")
    if data is None and not args.미리보기:
        sys.exit(1)


if __name__ == "__main__":
    main()
