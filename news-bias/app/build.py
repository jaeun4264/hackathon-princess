"""프론트에 넘길 news.json 을 만들고, 화면이 깨질 만한 문제가 없는지 검사합니다.

    python -m app.build            → data/news.json 저장 (가짜 기사, 검사 통과할 때만)
    python -m app.build 실제       → data/issues.json 의 이슈를 라벨링 표로 만들어 data/raw/news_실제.json 저장
                                     (기사 문장이 들어 있어 data/raw 에 둠 → GitHub에 올라가지 않음)

만든 data/news.json 을 프론트 저장소의 src/data/mock-news.json 자리에 넣으면 화면이 그대로 동작합니다.
"""
import argparse
import copy
import json
import sys
from datetime import date
from pathlib import Path

from app import metrics
from app.mock_data import ARTICLES, ISSUES, OUTLETS
from app.schemas import DISPLAY_SOURCE_TYPES, NewsData

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "news.json"
REAL_OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "news_실제.json"
# 저작권 처리가 끝난 같은 내용 (사실·인용 문장 없음) → GitHub에 올려 매일 자동 실행이 합쳐 씀
CURATED_OUTPUT = Path(__file__).resolve().parent.parent / "data" / "curated.json"


def build_news(issues=ISSUES, articles=ARTICLES, outlets=OUTLETS, note=None) -> dict:
    issues = copy.deepcopy(issues)
    articles = copy.deepcopy(articles)

    for a in articles:
        # 문장 id 자동 부여 (s1, s2 …), 빠진 칸은 null
        for i, s in enumerate(a["sentences"], start=1):
            s.setdefault("id", f"s{i}")
            s.setdefault("sourceType", None)
            s.setdefault("sourceName", None)
            s.setdefault("sourceDetail", None)
        a.setdefault("framingTerms", [])

    for issue in issues:
        # 이슈에 속한 기사 목록 자동 채우기 (발행 시각 순)
        if "articleIds" not in issue:
            mine = sorted((a for a in articles if a["issueId"] == issue["id"]), key=lambda a: a["publishedAt"])
            issue["articleIds"] = [a["id"] for a in mine]

    for a in articles:
        # 빠진 관점 자동 계산 (직접 적어 둔 것이 있으면 그대로 사용)
        if "missingViewpoints" not in a:
            same_issue = [x for x in articles if x["issueId"] == a["issueId"]]
            a["missingViewpoints"] = metrics.missing_viewpoints(a, same_issue)

    for issue in issues:
        # 화면에 보여 줄 출처 유형 4개 (이 이슈에서 인용이 많은 순)
        if "displaySourceTypes" not in issue:
            same_issue = [x for x in articles if x["issueId"] == issue["id"]]
            issue["displaySourceTypes"] = metrics.display_source_types(same_issue)

    data = {
        "meta": {
            "note": note or "백엔드가 만든 데이터입니다. 지금은 지어낸 가짜 기사입니다.",
            "version": "0.1",
            "generatedAt": date.today().isoformat(),
        },
        "sourceTypes": DISPLAY_SOURCE_TYPES,
        "outlets": outlets,
        "issues": issues,
        "articles": articles,
    }
    # 형식(칸 이름·종류) 검사: 틀리면 여기서 오류
    return NewsData.model_validate(data).model_dump()


def find_problems(data: dict, need_url: bool = False) -> list[str]:
    """형식은 맞지만 화면에서 깨지거나 이상하게 보일 문제 목록 (없으면 빈 목록)
    need_url: 실제 기사는 모든 기사에 원문 링크가 있어야 함 (시범 운영 저작권 원칙, 11/7)"""
    problems = []
    type_ids = {t["id"] for t in data["sourceTypes"]} | {"etc"}  # 기타는 목록엔 없지만 문장에는 쓸 수 있음
    outlet_ids = {o["id"] for o in data["outlets"]}
    issue_ids = {i["id"] for i in data["issues"]}
    articles = {a["id"]: a for a in data["articles"]}

    for name, ids in [("언론사", [o["id"] for o in data["outlets"]]),
                      ("이슈", [i["id"] for i in data["issues"]]),
                      ("기사", [a["id"] for a in data["articles"]])]:
        if len(ids) != len(set(ids)):
            problems.append(f"{name} id가 겹침")

    for issue in data["issues"]:
        bad = [t for t in issue["displaySourceTypes"] if t not in type_ids]
        if bad:
            problems.append(f"{issue['id']}: 화면 표시 유형에 없는 코드 {bad}")
        if not issue["articleIds"]:
            problems.append(f"{issue['id']}: 기사가 하나도 없음")
        for aid in issue["articleIds"]:
            if aid not in articles:
                problems.append(f"{issue['id']}: 없는 기사 {aid}")
            elif articles[aid]["issueId"] != issue["id"]:
                problems.append(f"{issue['id']}: {aid}의 issueId가 다름")

    for a in data["articles"]:
        where = a["id"]
        if a["issueId"] not in issue_ids:
            problems.append(f"{where}: 없는 이슈 {a['issueId']}")
        if a["outletId"] not in outlet_ids:
            problems.append(f"{where}: 없는 언론사 {a['outletId']}")
        if not a["sentences"]:
            problems.append(f"{where}: 문장이 없음")
        if need_url and not str(a["url"]).startswith(("http://", "https://")):
            problems.append(f"{where}: 원문 링크가 없음 (실제 기사는 원문 링크 필수)")
        sentence_text = {s["id"]: s["text"] for s in a["sentences"]}
        if len(sentence_text) != len(a["sentences"]):
            problems.append(f"{where}: 문장 id가 겹침")
        for s in a["sentences"]:
            sid = f"{where}/{s['id']}"
            if s["type"] == "quote":
                if not s["sourceType"]:
                    problems.append(f"{sid}: 인용 문장인데 출처 유형이 비어 있음")
                elif s["sourceType"] not in type_ids:
                    problems.append(f"{sid}: 없는 출처 유형 {s['sourceType']}")
                if s["sourceType"] == "etc" and not s["sourceDetail"]:
                    problems.append(f"{sid}: 기타 출처인데 원래 명칭(sourceDetail)이 비어 있음")
                elif s["sourceType"] != "etc" and s["sourceDetail"]:
                    problems.append(f"{sid}: 원래 명칭(sourceDetail)은 기타 출처일 때만")
                if not s["sourceName"]:
                    problems.append(f"{sid}: 인용 문장인데 인용한 사람이 비어 있음")
            elif s["sourceType"] or s["sourceName"] or s["sourceDetail"]:
                problems.append(f"{sid}: 인용이 아닌 문장({s['type']})에 출처가 적혀 있음")
        for f in a["framingTerms"]:
            text = sentence_text.get(f["sentenceId"], False)
            if text is False:
                problems.append(f"{where}: 표현 '{f['term']}'의 문장 {f['sentenceId']} 없음")
            elif text is not None and f["term"] not in text and not text.endswith("…"):
                # 의견 문장은 저작권 때문에 앞 40자만 남기므로(…로 끝남) 뒤쪽 표현은 안 보여도 정상
                problems.append(f"{where}/{f['sentenceId']}: 표현 '{f['term']}'이 문장에 그대로 없음 (화면 강조 불가)")
        for m in a["missingViewpoints"]:
            if m["sourceType"] not in type_ids:
                problems.append(f"{where}: 빠진 관점의 출처 유형 {m['sourceType']} 없음")
            for aid in m["foundInArticleIds"]:
                if aid not in articles:
                    problems.append(f"{where}: 빠진 관점 근거 기사 {aid} 없음")
    return problems


OPINION_MAX = 40  # 11/5 합의: 의견 문장은 앞 40자 + '…'


def strip_sentences(sentences: list[dict]) -> None:
    """문장 목록을 그 자리에서 저작권 처리: 사실·인용은 text=None, 의견은 앞 40자 + '…'"""
    for s in sentences:
        if s["type"] != "opinion" or not s["text"]:
            s["text"] = None
        elif len(s["text"]) > OPINION_MAX and not s["text"].endswith("…"):
            s["text"] = s["text"][:OPINION_MAX].rstrip() + "…"


def strip_text(data: dict) -> dict:
    """실제 기사 저작권 처리 (11/5 합의): 사실·인용 문장은 text 를 빼고(null), 의견 문장은 앞 40자 + '…'.
    라벨(type, sourceType, sourceName)은 그대로라 화면 계산은 똑같이 됨. 검사(find_problems)를 끝낸 뒤에 적용"""
    data = copy.deepcopy(data)
    for a in data["articles"]:
        strip_sentences(a["sentences"])
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description="프론트에 넘길 news.json 만들기")
    ap.add_argument("종류", nargs="?", choices=["가짜", "실제"], default="가짜")
    ap.add_argument("--설정", help="이슈 설정 파일 (기본 data/issues.json)")
    args = ap.parse_args(argv)

    if args.종류 == "실제":
        from app.from_labels import ISSUES_FILE, load_real
        issues, articles, outlets, warnings = load_real(Path(args.설정) if args.설정 else ISSUES_FILE)
        for w in warnings:
            print("참고:", w)
        data = build_news(issues, articles, outlets,
                          note="실제 기사 분석 결과(시범 운영). 기사 문장의 저작권은 각 언론사에 있으며 원문 링크를 함께 표시합니다.")
        problems, output = find_problems(data, need_url=True), REAL_OUTPUT
    else:
        data = build_news()
        problems, output = find_problems(data), OUTPUT
    if problems:
        print("문제가 있어 저장하지 않았습니다:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    if args.종류 == "실제":
        data = strip_text(data)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.종류 == "실제":
        CURATED_OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"저장 완료: {output} (이슈 {len(data['issues'])}개, 기사 {len(data['articles'])}건)")


if __name__ == "__main__":
    main()
