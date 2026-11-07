"""키워드 규칙 분류기 — 성능 비교의 출발점 (기획서 6. 비교 단계: 키워드 규칙 → 원본 → Syntitan 정제·보강)

API 없이 문장 모양과 단어만 보고 사실/의견/인용, 출처 유형을 추정합니다.
일부러 단순하게 만든 '기준선'이라, AI가 이보다 얼마나 나은지를 보여 주는 데 씁니다.

    python -m app.rules 라벨링표_1차.xlsx            → 라벨링표_규칙.xlsx

주의: 사람 라벨링이 끝나기 전에는 결과 파일을 열어 보지 마세요 (사람 판단이 끌려갈 수 있음).
"""
import argparse
import re
from pathlib import Path

from app.labelsheet import read_rows, write_labels

LABEL_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "labeling"

QUOTE_CHARS = "\"“”'‘’"
SPEECH_VERB = r"(?:말했|밝혔|강조했|주장했|비판했|지적했|설명했|덧붙였|촉구했|반박했|반발했|맞섰|전했|토로했|꼬집었|우려했|요구했|경고했|규정했|직격했|일축했|답했|물었|했)(?:다|습니다)"
# "…"라고 말했다 / "…"며 / "…"고 했다
DIRECT = re.compile(r"[\"”’]\s*(?:이?라고|이?라며|이?라면서|고|며|면서|는|란)\b|[\"”’]\s*(?:이?라고|고|며)")
# …다고 밝혔다 / …라며 비판했다 (따옴표 없는 간접 인용)
INDIRECT = re.compile(r"(?:다|라|냐|자)(?:고|며|면서)\s+(?:\S+\s+){0,3}?" + SPEECH_VERB)
SPEAKER_TAG = re.compile(r"^\[([^\]]{2,40})\]")

OPINION = re.compile(
    r"해야\s?(?:한다|할 것이다|하지 않을까)|"
    r"(?:지적|평가|비판|우려|목소리|분석|관측|의문)(?:이|도)\s?(?:나온다|나오고 있다|제기된다|적지 않다)|"
    r"(?:피하기|부인하기|납득하기)\s?어렵다|아닐 수 없다|(?:않을|않을 수) 없다|셈이다|불가피해 보인다|"
    r"(?:것|듯)으로\s?(?:보인다|풀이된다|해석된다)|마땅하다|바람직하다|어불성설|"
    r"(?:아닌가|않은가|않나|있나|없나)\?|"
    r"우려된다|의심(?:스럽다|을 지울 수 없다)|뿐이다"
)
PLAN = re.compile(r"예정|계획|방침|오늘|내일|이날|\d+일")
FORECAST = re.compile(r"전망이다|전망된다")

# 출처 유형 키워드 — 앞에서부터 검사 (순서가 중요)
SOURCE_RULES = [
    ("기타", ["무소속", "국회의장", "의장은", "법원", "재판부", "판사", "전문위원", "외신"]),  # 원래 명칭은 ETC_NAME
    ("시민·단체", ["변호사단체", "한변", "경실련", "참여연대", "시민단체", "노조", "노동조합", "연대", "협의회", "단체"]),
    ("야당", ["국민의힘", "국힘", "야당", "野", "개혁신당", "조국혁신당", "혁신당", "진보당"]),  # 범여권 정당은 소속 기준(제안)
    ("정부·여당", ["더불어민주당", "민주당", "여당", "與", "정부", "대통령", "청와대", "총리", "장관", "차관",
                "법무부", "검찰", "공소청", "기획재정부", "국토교통부", "교육부", "보건복지부", "고용노동부",
                "행정안전부", "외교부", "통일부", "국방부", "산업통상자원부", "환경부", "시장", "도지사", "구청장", "공사"]),
    ("기업·업계", ["업계", "기업", "협회", "경총", "전경련", "상공회의소", "대표이사", "회사"]),
    ("전문가", ["교수", "연구원", "연구위원", "연구자", "변호사", "전문가", "애널리스트", "법조계", "학계", "법학자", "박사"]),
    ("시민·단체", ["시민", "주민", "학생", "직장인", "유권자", "소비자", "씨는", "씨가"]),
]

# 기타로 묶이는 키워드 → 표에 적을 원래 명칭
ETC_NAME = {"무소속": "무소속 의원", "국회의장": "국회의장", "의장은": "국회의장", "법원": "법원", "재판부": "법원",
            "판사": "법원", "전문위원": "국회 전문위원", "외신": "외신"}

# 기자가 고른 평가 단어 (따옴표 밖에서만)
FRAMING = ["강행", "날치기", "밀어붙", "졸속", "꼼수", "폭거", "속전속결", "끼워넣", "끼워 넣", "일방", "막무가내", "억지", "방탄"]


def strip_quotes(text: str) -> str:
    """따옴표 안의 내용을 지운 문장 (기자 서술 부분만)"""
    return re.sub(r"[\"“][^\"”]*[\"”]|[‘'][^’']*[’']", " ", text)


def speaker_phrase(text: str) -> str:
    """말한 사람 부분 추정: [태그], 따옴표 앞, 또는 '…은/는/이/가' 앞"""
    m = SPEAKER_TAG.match(text)
    if m:
        return m.group(1)
    head = re.split(r"[\"“‘]", text, maxsplit=1)[0]
    m = re.match(r"^(.{2,40}?)(?:은|는|이|가|도)\s", head)
    return (m.group(1) if m else head)[:40].strip()


def source_of(phrase: str) -> tuple[str, str | None]:
    """(출처 유형, 기타일 때 원래 명칭)"""
    for label, words in SOURCE_RULES:
        for w in words:
            if w in phrase:
                return label, (ETC_NAME.get(w) if label == "기타" else None)
    return "기타", None


def classify(text: str) -> dict:
    is_quote = bool(SPEAKER_TAG.match(text)) or (
        any(c in text for c in QUOTE_CHARS) and bool(DIRECT.search(text))
    ) or bool(INDIRECT.search(text))
    outside = strip_quotes(text)
    framing = [w for w in FRAMING if w in outside]
    if is_quote:
        sp = speaker_phrase(text)
        source, detail = source_of(sp)
        return {"type": "인용", "source": source, "detail": detail, "speaker": sp, "framing": framing}
    if OPINION.search(outside) or (FORECAST.search(outside) and not PLAN.search(outside)):
        return {"type": "의견", "framing": framing}
    return {"type": "사실", "framing": framing}


def main(argv=None):
    ap = argparse.ArgumentParser(description="키워드 규칙으로 라벨링 표 채우기")
    ap.add_argument("표", nargs="?", default="라벨링표_1차.xlsx")
    ap.add_argument("--출력", default="라벨링표_규칙.xlsx")
    args = ap.parse_args(argv)
    src = Path(args.표) if Path(args.표).exists() else LABEL_DIR / args.표
    dst = LABEL_DIR / args.출력 if not Path(args.출력).is_absolute() else Path(args.출력)
    rows = read_rows(src)
    labels = {r.key: classify(r.text) for r in rows}
    n = write_labels(src, dst, labels)
    print(f"{n}문장에 규칙 라벨을 붙였습니다: {dst}")
    print("사람 라벨링이 끝난 뒤 `python -m app.evaluate 채점 정답_1차.xlsx 라벨링표_규칙.xlsx` 로 채점하세요.")


if __name__ == "__main__":
    main()
