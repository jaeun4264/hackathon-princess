"""정치인 소속 사전 — AI가 놓친 국회의원의 소속을 규칙으로 바로잡기

AI는 "서 위원장", "박 의원"처럼 줄인 호칭만 보면 소속을 모르거나, 학습 시점의 여야 구도로 잘못 분류합니다.
국회의원 명단(이름 → 정당)으로 인용한 사람의 소속을 찾아 출처 유형(정부·여당 / 야당 / 무소속 의원)을 정합니다.

    python -m app.members 받기      → 열린국회정보에서 현직 국회의원 명단을 받아 data/members.csv 저장
                                      (.env 에 ASSEMBLY_API_KEY: open.assembly.go.kr → 마이페이지 → 인증키 발급)

찾는 순서 (인용 문장 하나마다)
 1. 인용한 사람·문장에 의원 이름 전체(예: 서영교)가 있으면 그 의원
 2. "서 위원장", "박 의원"처럼 성 + 직함이면, 같은 기사 앞부분에 나온 의원 중 그 성을 가진 사람이 한 명일 때만 그 의원
 3. 못 찾거나 여러 명이면 AI 결과를 그대로 둠 (틀리게 고치지 않으려고)
장관·대변인 등 의원이 아닌 사람은 사전에 없으므로 AI 결과 그대로입니다.
"""
import csv
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEMBERS_CSV = ROOT / "data" / "members.csv"
API_URL = "https://open.assembly.go.kr/portal/openapi/nwvrqwxyaytdsfvhu"  # 국회의원 인적사항 (현직)
TITLES = r"(?:의원|위원장|간사|대표|원내대표|최고위원|대변인|정책위의장|사무총장|원내수석)"
SHORT = re.compile(r"^([가-힣])\s?" + TITLES)                  # 서 위원장, 박 의원
SHORT_IN_TEXT = re.compile(r"([가-힣])\s?" + TITLES)


def ruling_party() -> str:
    from app.analyze import RULING_PARTY
    return RULING_PARTY


def load(path: Path = MEMBERS_CSV) -> dict[str, str]:
    """이름 → 정당. 파일이 없으면 빈 사전 (그러면 아무것도 고치지 않음)"""
    if not path.exists():
        return {}
    parties: dict[str, set] = {}
    with path.open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("이름"):
                parties.setdefault(r["이름"].strip(), set()).add((r.get("정당") or "").strip())
    # 동명이인인데 정당이 다르면 누구인지 알 수 없어 사전에서 뺌
    return {n: ps.pop() for n, ps in parties.items() if len(ps) == 1}


def party_to_source(party: str) -> tuple[str, str | None]:
    """정당 → (출처 유형, 원래 명칭)"""
    if not party or "무소속" in party:
        return "기타", "무소속 의원"
    if party == ruling_party():
        return "정부·여당", None
    return "야당", None


def names_in(text: str, members: dict[str, str]) -> list[str]:
    return [n for n in members if n in text]


SUBJECT_SPAN = 20  # 문장 앞 몇 글자 안에 나온 이름만 '말한 사람'으로 봄 (뒤에 나온 이름은 말을 들은 사람일 수 있음)


def resolve(speaker: str | None, sentence: str, earlier: list[str], members: dict[str, str]) -> str | None:
    """인용한 사람 → 의원 이름 (못 찾으면 None). 인용한 사람 칸을 먼저 보고, 문장은 맨 앞(주어 자리)만 봄"""
    if not members:
        return None
    speaker = (speaker or "").strip()
    # 1. 인용한 사람 칸에 이름 전체
    found = set(names_in(speaker, members))
    if len(found) == 1:
        return found.pop()
    if len(found) > 1:
        return None
    # 2. 인용한 사람 칸이 '성 + 직함' (서 위원장) → 같은 기사 앞부분에 나온 그 성의 의원이 한 명일 때만
    short = SHORT.match(speaker) or (None if speaker else SHORT_IN_TEXT.match(sentence))
    if short:
        surname = short.group(1)
        seen = {n for t in earlier for n in names_in(t, members) if n.startswith(surname)}
        return seen.pop() if len(seen) == 1 else None
    # 3. 문장 맨 앞(주어 자리)에 이름 전체 — "곽규택 의원은 …" (문장 뒤쪽 이름은 말을 들은 사람일 수 있어 안 봄)
    head = {n for n in names_in(sentence, members) if sentence.find(n) < SUBJECT_SPAN}
    return head.pop() if len(head) == 1 else None


def fix_labels(labels: dict[int, dict], texts: dict[int, str], members: dict[str, str]) -> int:
    """문장 번호별 라벨(analyze.parse_labels 결과)의 출처 유형을 사전으로 고침. 고친 개수를 돌려줌"""
    changed = 0
    nos = sorted(texts)
    for i, no in enumerate(nos):
        lab = labels.get(no)
        if not lab or lab["type"] != "인용":
            continue
        name = resolve(lab.get("speaker"), texts[no], [texts[n] for n in nos[: i + 1]], members)
        if not name:
            continue
        source, detail = party_to_source(members[name])
        party = members[name] if members[name] and "무소속" not in members[name] else None
        if (lab["source"], lab.get("detail"), lab.get("party")) != (source, detail, party):
            if (lab["source"], lab.get("detail")) != (source, detail):
                changed += 1
            lab["source"], lab["detail"], lab["party"] = source, detail, party
    return changed


def download(key: str, client=None) -> list[tuple[str, str]]:
    import httpx
    client = client or httpx.Client(timeout=30)
    rows, page = [], 1
    while True:
        res = client.get(API_URL, params={"KEY": key, "Type": "json", "pIndex": page, "pSize": 300})
        data = res.json()
        block = data.get("nwvrqwxyaytdsfvhu")
        if not block:
            msg = data.get("RESULT", {}).get("MESSAGE", res.text[:200])
            raise SystemExit(f"명단을 받지 못했습니다: {msg}")
        got = next((b["row"] for b in block if "row" in b), [])
        rows += [(r["HG_NM"].strip(), (r.get("POLY_NM") or "").strip()) for r in got if r.get("HG_NM")]
        total = next((b["head"][0]["list_total_count"] for b in block if "head" in b), len(rows))
        if not got or len(rows) >= total:
            return rows
        page += 1


def save(rows: list[tuple[str, str]], path: Path = MEMBERS_CSV) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["이름", "정당"])
        w.writerows(sorted(set(rows)))


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] != ["받기"]:
        sys.exit("사용법: python -m app.members 받기")
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    key = os.getenv("ASSEMBLY_API_KEY", "").strip()
    if not key:
        sys.exit(".env 에 ASSEMBLY_API_KEY 를 넣어 주세요 (open.assembly.go.kr → 마이페이지 → 인증키 발급).")
    rows = download(key)
    save(rows)
    parties = {}
    for _, p in rows:
        parties[p] = parties.get(p, 0) + 1
    print(f"의원 {len(rows)}명 저장: {MEMBERS_CSV}")
    print("  " + ", ".join(f"{p} {n}" for p, n in sorted(parties.items(), key=lambda x: -x[1])))
    same = [n for n in {r[0] for r in rows} if sum(1 for r in rows if r[0] == n) > 1]
    if same:
        print(f"  동명이인 {len(same)}명: {', '.join(same)} (이 이름은 정당이 다르면 고치지 않음)")


if __name__ == "__main__":
    main()
