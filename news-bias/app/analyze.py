"""AI 분석 (서비스 흐름 3·4단계) — LLM이 문장마다 사실/의견/인용, 출처 유형, 평가가 담긴 표현을 붙입니다.

    python -m app.analyze 라벨링표_1차.xlsx                → 기본 모델(LLM_PROVIDER)로 라벨링표_AI_<모델>.xlsx
    python -m app.analyze 라벨링표_1차.xlsx --모델 claude  → Claude로
    python -m app.analyze 라벨링표_1차.xlsx --모델 gemini-3.8-flash gemini-3.5-flash-lite
                                                         → 모델 이름을 여러 개 적으면 차례로 (같은 Gemini끼리 비교, 무료)
    python -m app.analyze 라벨링표_1차.xlsx --모델 groq     → Groq 무료 공개 모델 (GROQ_MODEL 필요)
    python -m app.analyze 라벨링표_1차.xlsx --모델 groq:openai/gpt-oss-120b groq:llama-3.3-70b-versatile --묶음 10
                                                         → Groq 모델끼리 비교 ('groq:모델이름'), 10문장씩 나눠 보냄
    python -m app.analyze 라벨링표_1차.xlsx --모델 gemini-3.8-flash --생각 low
                                                         → 생각하는 양을 줄여 빠르게 (결과는 …_생각low 로 따로 저장)
    python -m app.analyze 라벨링표_1차.xlsx --다시         → 저장된 응답을 무시하고 다시 요청

.env 설정 — 제공사마다 키를 따로 넣어 두고 --모델 로 고름
    GEMINI_API_KEY=...         # (예전 방식 LLM_PROVIDER=gemini + LLM_API_KEY 도 그대로 됨)
    GEMINI_MODEL=gemini-3.8-flash
    ANTHROPIC_API_KEY=...      # Claude
    ANTHROPIC_MODEL=claude-sonnet-5-5
    GROQ_API_KEY=...           # 선택: Groq (무료, 공개 모델)
    GROQ_MODEL=...             # Groq 콘솔의 Models 목록에 있는 이름
    LLM_PROVIDER=gemini        # --모델 을 안 적었을 때 쓸 제공사

응답은 data/raw/ai/<모델>/ 에 기사별로 저장해 두고, 다시 실행하면 저장된 것을 씁니다 (비용 절약).
주의: 사람 라벨링이 끝나기 전에는 결과 파일을 열어 보지 마세요.
"""
import argparse
import json
import os
import re
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError, field_validator

from app.labelsheet import SOURCE_NAMES, TYPES, Row, read_rows, split_source, write_labels

ROOT = Path(__file__).resolve().parent.parent
LABEL_DIR = ROOT / "data" / "raw" / "labeling"
CACHE_DIR = ROOT / "data" / "raw" / "ai"

# 모델이 학습한 시점과 지금의 여당이 다를 수 있어 직접 알려 줌
RULING_PARTY = "더불어민주당"
# 프롬프트 판 번호. 바꾸면 저장 폴더·결과 파일 이름이 달라져 이전 결과와 나란히 비교할 수 있음
# v2 (11/7): 지금의 여야 구도 명시, 말+행동 문장은 인용, 기자의 예측은 의견 (라벨링 기준 문서의 규칙을 프롬프트에 옮김)
#   ※ 1차 기사에서 AI가 틀린 유형을 보고 넣은 규칙이라, 효과는 1차가 아닌 2차 기사로 확인해야 공정함
# v4 (11/14): 전직 공직자, 소속 미상 제한, 사전·법조문 = 사실, 정당명(party) 칸 → 양대 정당 기울기용
#   ※ v3의 G1(이름만 있어도 소속 미상)을 바꿨으므로 경계 사례 정답(G1 줄)과는 맞지 않음. 효과는 2차 기사로 확인
# v3 (11/11): Syntitan 경계 사례로 정한 규칙 G1~G8 + 국회 소속 독립 기관(국회예산정책처 등) → 전문가
#   ※ 경계 사례로 만든 규칙이라, 2차 기사(규칙을 만들 때 안 본 기사)에서 성능이 떨어지지 않는지도 꼭 확인
#   예전 판으로 돌리려면 --판 2 (보완 전 측정용)
PROMPT_VERSION = 4

DEFAULT_URL = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
    "groq": "https://api.groq.com/openai/v1/chat/completions",
}

SYSTEM_PROMPT_V2 = f"""너는 한국 뉴스 기사의 문장을 분류하는 라벨링 담당자다. 판정하지 말고 아래 기준만 따른다.
문장의 내용에 동의하는지, 어느 언론사인지는 판단에 쓰지 않는다.

[유형] 아래 질문을 순서대로 묻고 처음 '예'가 나오는 곳에서 멈춘다.
1. 누군가의 말을 전하는 문장인가? 말한 사람·기관이 문장에 있고 "~라고 말했다/밝혔다/주장했다/비판했다"처럼 끝난다. 따옴표 없는 간접 인용도 포함. "[이름 / 직함] …" 형식도 인용. → 인용
2. 기록·자료로 확인할 수 있는 일인가? 날짜, 수치, 회의 결과, 법안 내용, 발표된 일정. → 사실
3. 기자가 직접 평가·추측·주장하는가? → 의견
경계 규칙:
- "~라는 지적/평가/비판이 나온다"처럼 말한 사람이 없으면 의견.
- "전문가들은 우려를 나타냈다", "법조계에서는 …라는 비판이 나왔다"처럼 집단만 있으면 인용.
- "~로 알려졌다", "~한 것으로 파악됐다"는 사실.
- "~할 전망이다"는 발표된 일정이면 사실, 기자의 예측이면 의견.
- 인용에 기자의 평가 단어가 섞이면 인용으로 붙이고 그 단어는 평가 표현에 적는다.
- 사실 문장에 평가 단어("강행 처리했다")가 섞이면 사실로 붙이고 그 단어는 평가 표현에 적는다.
- 말과 행동을 함께 전하는 문장("…라며 항의했다", "…라고 외치며 퇴장했다", "…라며 반발했다")도 말한 사람이 있으면 인용.
- 기자가 앞일을 짐작하는 문장("~될 것으로 보인다", "~가 예상된다", 일정이 아닌 "~할 전망이다")은 평가 단어가 있든 없든 의견.

[지금의 여야] 2026년 11월 현재 여당은 {RULING_PARTY} 하나다. 국민의힘, 개혁신당, 조국혁신당, 진보당 등 나머지 정당은 모두 야당이다.
네가 학습한 시점의 여야 구도와 다를 수 있으니 반드시 이 기준을 따른다. 대통령도 {RULING_PARTY} 소속이다.

[출처 유형] 유형이 인용일 때만. 발언 내용이 아니라 말한 사람의 소속으로 정한다.
- 정부·여당: 대통령실, 정부 부처, 지자체, 공기업, 검찰·공소청, 여당({RULING_PARTY})
- 야당: 여당이 아닌 정당과 그 소속 정치인 (범여권 정당도 소속 기준으로 야당)
- 전문가: 이해관계 없이 분석하는 제3자 (교수, 연구원, 개인 변호사)
- 시민·단체: 개인 시민, 시민단체, 노동조합, 변호사단체 등 기업이 아닌 단체
- 기업·업계: 이해관계가 걸린 회사, 업계, 경제단체
- 위 5개에 맞지 않으면 "기타"라고 쓰지 말고 원래 명칭을 짧게 적는다 (예: 무소속 의원, 국회의장, 법원, 국회 전문위원, 외국 정부)
한 문장에 말한 사람이 여럿이면 먼저 나온 사람 기준.

[인용한 사람] 유형이 인용일 때만, 기사에 쓰인 이름·직함 그대로 짧게.
[평가 표현] 기자가 직접 고른 평가 단어만, 문장에 쓰인 글자 그대로. 따옴표 안의 단어는 적지 않는다. 없으면 빈 목록.

반드시 아래 JSON 하나만 출력한다. 설명 문장, 코드 블록 표시를 붙이지 않는다.
{{"sentences": [{{"no": 1, "type": "사실|의견|인용", "source": "5개 유형 중 하나, 또는 원래 명칭, 또는 null", "speaker": "인용한 사람 또는 null", "framing": ["단어"]}}]}}"""


UNKNOWN_DETAIL = "익명(소속 미상)"  # 말한 사람의 소속을 알 수 없을 때 (G1, 11/11 확정)


def _v3(p: str) -> str:
    """v2 프롬프트에 경계 사례 규칙(G1~G8)을 더함"""
    p = p.replace(
        '- 기자가 앞일을 짐작하는 문장("~될 것으로 보인다", "~가 예상된다", 일정이 아닌 "~할 전망이다")은 평가 단어가 있든 없든 의견.',
        '- 기자가 앞일을 짐작하는 문장("~될 것으로 보인다", "~가 예상된다", 일정이 아닌 "~할 전망이다")은 평가 단어가 있든 없든 의견.\n'
        '- "이르면 내년 지급될 전망이다"처럼 공식 발표된 일정이 아닌 전망은 의견. 기관이 발표한 날짜·일정만 사실.\n'
        '- "~라는 소문이 돌고 있다", "~라는 말이 나돈다"처럼 출처 없는 소문은 의견.\n'
        '- 현수막·피켓·구호 문구를 전하는 문장("‘공사를 멈춰라’는 현수막이 걸렸다")은 특정 단체의 주장이므로 인용. '
        '인용한 사람은 문구를 내건 단체, 모르면 출처 유형을 "' + UNKNOWN_DETAIL + '"로.')
    p = p.replace(
        "- 전문가: 이해관계 없이 분석하는 제3자 (교수, 연구원, 개인 변호사)",
        "- 전문가: 이해관계 없이 분석하는 제3자 (교수, 연구원, 개인 변호사). "
        "국회예산정책처·국회입법조사처처럼 국회 소속이어도 독립적으로 분석하는 기관도 전문가")
    p = p.replace(
        "- 시민·단체: 개인 시민, 시민단체, 노동조합, 변호사단체 등 기업이 아닌 단체",
        "- 시민·단체: 개인 시민, 시민단체, 노동조합, 변호사단체 등 기업이 아닌 단체. "
        "회원이 개인 전문직인 직능단체·협회(건축사협회, 간호사 단체 등)도 시민·단체 (전문가 아님)")
    p = p.replace(
        "- 기업·업계: 이해관계가 걸린 회사, 업계, 경제단체",
        "- 기업·업계: 이해관계가 걸린 회사, 업계, 경제단체. 회원이 기업인 협회(병원협회 등), "
        "자문료를 받는 등 이해관계가 있는 연구자, 기업 소속 연구소도 기업·업계 (전문가 아님)")
    p = p.replace(
        "- 위 5개에 맞지 않으면 \"기타\"라고 쓰지 말고 원래 명칭을 짧게 적는다 (예: 무소속 의원, 국회의장, 법원, 국회 전문위원, 외국 정부)",
        "- 위 5개에 맞지 않으면 \"기타\"라고 쓰지 말고 원래 명칭을 짧게 적는다 "
        "(예: 무소속 의원, 국회의장, 법원, 헌법재판소, 국제기구 이름, 국회 전문위원, 외국 정부). "
        "헌법재판소·국제기구는 정부·여야와 분리해 원래 명칭으로.\n"
        "- \"관계자는\", \"위원장은\", 소속 없이 이름만 나온 사람처럼 기사에서 소속을 알 수 없으면 \""
        + UNKNOWN_DETAIL + "\". 기사 앞부분에서 소속을 알 수 있으면 그 소속으로.")
    return p


def _v4(p: str) -> str:
    """v3 + 11/14 확정: 전직 공직자, '소속 미상'은 이름·직함이 모두 없을 때만, 사전·법조문은 사실, 정당명(party) 칸"""
    old_g1 = ("- \"관계자는\", \"위원장은\", 소속 없이 이름만 나온 사람처럼 기사에서 소속을 알 수 없으면 \""
              + UNKNOWN_DETAIL + "\". 기사 앞부분에서 소속을 알 수 있으면 그 소속으로.")
    assert old_g1 in p
    p = p.replace(old_g1,
        "- \"" + UNKNOWN_DETAIL + "\"은 \"관계자는\", \"소식통은\"처럼 이름도 직함도 없어 소속을 알 수 없을 때만 쓴다. "
        "이름이나 직함이 있으면 쓰지 않는다: 소속을 모르면 직함(예: 위원장)이나 이름을 원래 명칭으로 적는다. "
        "기사 앞부분에서 소속을 알 수 있으면 그 소속으로.\n"
        "- 전직 공직자·전직 의원: 지금 당적이 있으면 그 정당 기준(여당이면 정부·여당, 아니면 야당). "
        "당적이 없는 전직 정무직(장·차관, 대통령실 실장·수석, 방송통신위원장 같은 정무직)은 원래 명칭 \"전 ○○(○○정부)\". "
        "당적이 없는 직업 공무원, 검찰·경찰 간부, 한국은행 총재, 대법관·헌법재판관 출신은 원래 명칭 \"전 ○○\".")
    p = p.replace(
        "- \"~로 알려졌다\", \"~한 것으로 파악됐다\"는 사실.",
        "- \"~로 알려졌다\", \"~한 것으로 파악됐다\"는 사실.\n"
        "- 사전 뜻풀이, 법조문, 판결문·공문서 원문을 옮긴 문장은 사람의 말이 아니므로 사실.")
    p = p.replace(
        "[인용한 사람] 유형이 인용일 때만, 기사에 쓰인 이름·직함 그대로 짧게.",
        "[인용한 사람] 유형이 인용일 때만, 기사에 쓰인 이름·직함 그대로 짧게.\n"
        "[정당] 유형이 인용이고 말한 사람이 정당 소속(당적 보유)이면 공식 당명 "
        "(더불어민주당, 국민의힘, 조국혁신당, 개혁신당, 진보당 등). 정부 부처·대통령실·공무원·전문가처럼 정당이 아니면 null.")
    p = p.replace('"speaker": "인용한 사람 또는 null", "framing"', '"speaker": "인용한 사람 또는 null", "party": "공식 당명 또는 null", "framing"')
    return p


PROMPTS = {2: SYSTEM_PROMPT_V2, 3: _v3(SYSTEM_PROMPT_V2)}
PROMPTS[4] = _v4(PROMPTS[3])
SYSTEM_PROMPT = PROMPTS[PROMPT_VERSION]


# AI가 5개 유형 이름 대신 비슷한 말로 답한 경우 → 같은 유형으로 맞춤 (모든 모델에 똑같이 적용)
SOURCE_SYNONYMS = {
    "정부·여당": ["여당", "정부", "여권", "정부여당", "정부/여당", "정부-여당", "정부 여당", "정부.여당", RULING_PARTY, RULING_PARTY.removeprefix("더불어")],
    "야당": ["야권", "야당측"],
    "시민·단체": ["시민", "시민단체", "단체", "시민/단체"],
    "기업·업계": ["기업", "업계", "기업/업계"],
    "전문가": ["전문가들", "학계"],
}
SYNONYM_TO_SOURCE = {alias: name for name, aliases in SOURCE_SYNONYMS.items() for alias in aliases}


class Label(BaseModel):
    no: int
    type: str
    source: str | None = None
    speaker: str | None = None
    party: str | None = None
    framing: list[str] = []

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in TYPES:
            raise ValueError(f"유형은 {TYPES} 중 하나여야 함: {v}")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v in (None, "", "null"):
            return None
        v = v.strip()
        v = SYNONYM_TO_SOURCE.get(v, v)
        if v not in SOURCE_NAMES:
            from app.metrics import find_party
            p = find_party(v)
            if p and "무소속" not in v:   # 출처 칸에 당명을 적은 경우 (예: 조국혁신당) → 소속 기준 유형으로
                return "정부·여당" if p == RULING_PARTY else "야당"
        if v.replace(" ", "") in ("소속미상", "익명", "미상", "익명(소속미상)", "알수없음"):
            return UNKNOWN_DETAIL
        if v == "기타":
            # 원래 명칭을 적으라고 했지만, 말한 사람의 소속을 알 수 없을 때 AI가 고집하는 경우가 있음
            # → 실패로 처리하지 않고 '소속 미상'으로 받아 둠 (parse_labels 에서 처리)
            return v
        if v not in SOURCE_NAMES and len(v) > 20:
            raise ValueError(f"원래 명칭은 짧게 적어야 함: {v}")
        return v


class LLMError(Exception):
    pass


ALIASES = {"gemini": "gemini", "claude": "anthropic", "anthropic": "anthropic", "openai": "openai", "gpt": "openai",
           "groq": "groq"}
ENV_PREFIX = {"gemini": "GEMINI", "anthropic": "ANTHROPIC", "openai": "OPENAI", "groq": "GROQ"}
# 무료로 쓸 수 있는 Gemini (2026-11 기준): gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite
DEFAULT_MODEL = {"gemini": "gemini-3.8-flash", "anthropic": "claude-sonnet-5-5", "openai": "gpt-4.1-mini", "groq": None}
BOTH = ["gemini", "anthropic"]  # --모델 둘다
MODEL_PREFIX = {"gemini-": "gemini", "claude-": "anthropic", "gpt-": "openai"}  # 모델 이름만 적었을 때 제공사 찾기


def parse_choice(choice: str | None) -> tuple[str | None, str | None]:
    """--모델 값 → (제공사, 모델 이름). 'gemini' → (gemini, None), 'gemini-3.5-flash-lite' → (gemini, 그 이름)"""
    if choice is None or choice.lower() in ALIASES:
        return choice, None
    for prefix, provider in MODEL_PREFIX.items():
        if choice.lower().startswith(prefix):
            return provider, choice
    if ":" in choice:  # groq:모델이름 처럼 제공사를 직접 적은 경우
        prov, _, model = choice.partition(":")
        return prov, model
    raise LLMError(f"모델을 알 수 없습니다: {choice} (gemini / claude / groq, 또는 gemini-3.8-flash 같은 모델 이름)")


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def resolve_provider(name: str | None) -> str:
    name = (name or _env("LLM_PROVIDER") or "gemini").lower()
    if name not in ALIASES:
        raise LLMError(f"모델은 gemini / claude / openai 중 하나여야 합니다: {name}")
    return ALIASES[name]


def config(provider: str | None = None, model: str | None = None) -> dict:
    """제공사별 설정. GEMINI_API_KEY 처럼 제공사 이름이 붙은 칸을 먼저 보고,
    없으면 예전 방식(LLM_PROVIDER 가 같은 제공사일 때의 LLM_API_KEY·LLM_MODEL)을 씀"""
    load_dotenv(ROOT / ".env")
    provider = resolve_provider(provider)
    p = ENV_PREFIX[provider]
    legacy = _env("LLM_PROVIDER") and resolve_provider(None) == provider
    key = _env(f"{p}_API_KEY") or (provider == "anthropic" and _env("CLAUDE_API_KEY")) or (legacy and _env("LLM_API_KEY"))
    if not key:
        raise LLMError(f".env 에 {p}_API_KEY 를 넣어 주세요.")
    model = model or _env(f"{p}_MODEL") or (legacy and _env("LLM_MODEL")) or DEFAULT_MODEL[provider]
    if not model:
        raise LLMError(f".env 에 {p}_MODEL 을 넣어 주세요.")
    # ANTHROPIC_BASE_URL 같은 이름은 다른 프로그램도 쓰는 설정이라 읽지 않음
    url = (legacy and _env("LLM_BASE_URL")) or DEFAULT_URL[provider]
    return {"provider": provider, "model": model, "key": key, "url": url}


EXAMPLE_MAX = 60


def load_examples(path: Path) -> list[dict]:
    """예시 CSV (열: 문장, 유형, 출처유형, 인용한사람) → 프롬프트에 넣을 예시. Syntitan 보강 데이터를 이 형식으로"""
    import csv
    if not path.exists():
        raise LLMError(f"예시 파일이 없습니다: {path}")
    with path.open(encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("문장") or "").strip() and r.get("유형") in TYPES]
    if not rows:
        raise LLMError(f"{path.name}: '문장', '유형'(사실/의견/인용) 열이 있는 줄이 없습니다.")
    return rows[:EXAMPLE_MAX]


def system_prompt(cfg: dict) -> str:
    """기본 프롬프트 + (있으면) 예시. 예시는 판정 기준을 보여 주는 용도이고, 평가에 쓰는 정답 문장과 겹치면 안 됨"""
    base = PROMPTS[cfg.get("prompt_version", PROMPT_VERSION)]
    ex = cfg.get("examples")
    if not ex:
        return base
    lines = []
    for r in ex:
        tail = f" / {r.get('출처유형') or '-'} / {r.get('인용한사람') or '-'}" if r["유형"] == "인용" else ""
        lines.append(f"- {r['문장'].strip()} → {r['유형']}{tail}")
    return base + "\n\n[예시] 기준대로 붙인 예시다 (문장 → 유형 / 출처 유형 / 인용한 사람).\n" + "\n".join(lines)


def build_user_prompt(outlet: str, rows: list[Row]) -> str:
    lines = "\n".join(f"{r.no}. {r.text}" for r in rows)
    return f"언론사: {outlet}\n아래 문장 {len(rows)}개를 모두 분류해라.\n\n{lines}"


def call_llm(cfg: dict, system: str, user: str, client: httpx.Client) -> str:
    if cfg["provider"] == "anthropic":
        headers = {"x-api-key": cfg["key"], "anthropic-version": "2023-06-01"}
        body = {"model": cfg["model"], "max_tokens": 8000, "temperature": 0, "system": system,
                "messages": [{"role": "user", "content": user}]}
    else:
        headers = {"Authorization": f"Bearer {cfg['key']}"}
        body = {"model": cfg["model"], "temperature": 0,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if cfg.get("effort"):  # 생각하는 양 (Gemini·OpenAI 호환 주소의 reasoning_effort)
            body["reasoning_effort"] = cfg["effort"]
    last_limit, last_status = "", 0
    for attempt in range(4):
        try:
            t0 = time.perf_counter()
            res = client.post(cfg["url"], headers=headers, json=body)
            took = time.perf_counter() - t0
        except httpx.TimeoutException as e:  # 응답이 오래 걸림 (긴 기사, 생각하는 모델) → 잠시 후 다시
            if attempt == 3:
                raise LLMError(f"응답이 너무 오래 걸려 4번 실패했습니다. --묶음 15 처럼 나눠 보내 보세요. ({e})") from e
            print(f"  응답 시간 초과 → {10 * (attempt + 1)}초 뒤 다시 요청합니다")
            time.sleep(10 * (attempt + 1))
            continue
        except httpx.HTTPError as e:
            raise LLMError(f"LLM 서버에 연결하지 못했습니다: {e}") from e
        if res.status_code == 429 or res.status_code >= 500:  # 너무 많이 보냄 / 서버 문제 → 잠시 후 재시도
            last_limit, last_status = res.text, res.status_code
            wait = min(60, 5 * 2 ** attempt)
            print(f"  {'요청 한도' if res.status_code == 429 else '서버 문제'}(HTTP {res.status_code}) → {wait}초 뒤 다시 요청합니다")
            time.sleep(wait)
            continue
        if res.status_code == 400 and cfg.get("effort") and "reasoning" in res.text.lower():
            raise LLMError(f"이 모델은 --생각 {cfg['effort']} 설정을 받지 않습니다: {res.text[:200]}")
        if res.status_code == 413:
            raise LLMError("한 번에 보낸 양이 무료 한도보다 큽니다. --묶음 10 처럼 나눠 보내 주세요.")
        if res.status_code in (401, 403):
            raise LLMError(f"API 키가 거절됐습니다 (HTTP {res.status_code}): {res.text[:300]}")
        if res.status_code != 200:
            raise LLMError(f"요청 실패 (HTTP {res.status_code}): {res.text[:300]}")
        data = res.json()
        usage = data.get("usage") or {}
        cfg.setdefault("_log", []).append({  # 속도 비교용 기록 (성공한 요청의 응답 시간, 쉬는 시간은 뺌)
            "seconds": round(took, 2),
            "input_tokens": usage.get("input_tokens", usage.get("prompt_tokens")),
            "output_tokens": usage.get("output_tokens", usage.get("completion_tokens")),
            "total_tokens": usage.get("total_tokens"),  # 생각하는 모델은 생각 토큰까지 포함된 값
        })
        if cfg["provider"] == "anthropic":
            return "".join(b.get("text", "") for b in data.get("content", []))
        return data["choices"][0]["message"]["content"]
    if re.search(r"per\s?day|PerDay|daily", last_limit, re.I):
        raise LLMError("오늘 쓸 수 있는 무료 요청(RPD)을 다 썼습니다. 한국 시간 오후 5시(태평양 자정)쯤 초기화된 뒤 다시 실행해 주세요.")
    if last_status >= 500:
        raise LLMError(f"{cfg['model']} 서버가 붐벼서(HTTP {last_status}) 여러 번 실패했습니다. 내 컴퓨터·키 문제가 아닙니다. "
                       "10~30분 뒤 다시 실행하거나 다른 모델(gemini-3.6-flash 등)로 해 보세요 (저장된 기사는 건너뜀).")
    raise LLMError("요청 한도에 걸려 여러 번 실패했습니다. 1~2분 쉬었다가 다시 실행해 주세요 (저장된 기사는 건너뜀).")


def _party(x: "Label", raw: dict) -> str | None:
    """공식 당명: AI가 적은 party → 없으면 출처·인용한 사람 글에서 찾음 (예: 출처를 '조국혁신당'이라고 적은 경우)"""
    from app.metrics import find_party
    p = find_party(x.party) if x.party and x.party not in ("null", "") else None
    return p or find_party(str(raw.get("source") or ""), x.speaker)


def parse_labels(text: str, rows: list[Row]) -> dict[int, dict]:
    """응답에서 JSON을 꺼내 검사. 문제가 있으면 무엇이 틀렸는지 담아 ValueError"""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("JSON을 찾지 못함")
    data = json.loads(m.group(0))
    raw_items = data.get("sentences", [])
    items = [Label(**x) for x in raw_items]
    raw_by_no = {x.get("no"): x for x in raw_items if isinstance(x, dict)}
    by_no = {x.no: x for x in items}
    missing = [r.no for r in rows if r.no not in by_no]
    if missing:
        raise ValueError(f"빠진 문장 번호: {missing[:10]}")
    texts = {r.no: r.text for r in rows}
    out = {}
    for no, x in by_no.items():
        if no not in texts:
            continue
        if x.type == "인용" and not x.source:
            raise ValueError(f"{no}번: 인용인데 출처 유형이 없음")
        source, detail = split_source(x.source) if x.type == "인용" else (None, None)
        if source == "기타" and not detail:
            detail = UNKNOWN_DETAIL
        out[no] = {
            "type": x.type,
            "source": source,
            "detail": detail,
            "speaker": x.speaker if x.type == "인용" else None,
            "party": _party(x, raw_by_no.get(no, {})) if x.type == "인용" else None,
            # 문장에 그대로 없는 단어는 버림 (화면 강조가 안 되므로)
            "framing": [w for w in x.framing if w and w in texts[no]],
        }
        _match_party(out[no])
    return out


def _match_party(lab: dict) -> None:
    """당명과 출처 유형이 어긋나면 당명을 따름 (11/14 2차 확인: AI가 더불어민주당 대표를 '야당'으로 적은 경우)"""
    party = lab.get("party")
    if lab.get("type") != "인용" or not party or lab.get("source") not in ("정부·여당", "야당", "기타"):
        return
    want = "정부·여당" if party == RULING_PARTY else "야당"
    if lab["source"] != want:
        lab["source"], lab["detail"] = want, None


def meta_path(cache: Path) -> Path:
    return cache.with_name(cache.stem + ".meta.json")


def summarize(log: list[dict]) -> dict:
    def total(k):
        vals = [x[k] for x in log if x.get(k) is not None]
        return sum(vals) if vals else None
    return {"seconds": round(sum(x["seconds"] for x in log), 2), "requests": len(log),
            "input_tokens": total("input_tokens"), "output_tokens": total("output_tokens"),
            "total_tokens": total("total_tokens")}


def analyze_article(cfg, outlet, rows, client, cache: Path | None = None, retries: int = 2) -> dict[int, dict]:
    if cache and cache.exists():
        try:
            return parse_labels(cache.read_text(encoding="utf-8"), rows)
        except (ValueError, ValidationError, json.JSONDecodeError):
            pass  # 저장된 응답이 깨졌으면 다시 요청
    start = len(cfg.setdefault("_log", []))
    user = build_user_prompt(outlet, rows)
    last_err = None
    for _ in range(retries + 1):
        text = call_llm(cfg, system_prompt(cfg), user, client)
        try:
            labels = parse_labels(text, rows)
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(text, encoding="utf-8")
                meta = summarize(cfg["_log"][start:]) | {"sentences": len(rows)}
                meta_path(cache).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            return labels
        except (ValueError, ValidationError, json.JSONDecodeError) as e:
            last_err = e
            user = build_user_prompt(outlet, rows) + f"\n\n이전 응답에 문제가 있었다: {e}\n형식을 지켜 다시 출력해라."
    raise LLMError(f"{rows[0].article_id}: 올바른 응답을 받지 못했습니다 ({last_err})")


def write_run_log(dst: Path, metas: list[tuple[str, dict | None]]) -> None:
    """AI 결과 표에 '실행 기록' 시트를 추가 (evaluate 채점이 속도 비교에 씀)"""
    from openpyxl import load_workbook
    wb = load_workbook(dst)
    if RUN_SHEET in wb.sheetnames:
        del wb[RUN_SHEET]
    ws = wb.create_sheet(RUN_SHEET)
    ws.append(["기사", "문장 수", "응답 시간(초)", "요청 수", "입력 토큰", "출력 토큰", "전체 토큰"])
    for name, m in metas:
        m = m or {}
        ws.append([name, m.get("sentences"), m.get("seconds"), m.get("requests"), m.get("input_tokens"),
                   m.get("output_tokens"), m.get("total_tokens")])
    wb.save(dst)


RUN_SHEET = "실행 기록"


def list_models(cfg: dict) -> list[str]:
    """제공사의 모델 목록 (OpenAI 호환 /models). 이름을 확인하고 --모델 에 쓰기 위함"""
    if cfg["provider"] == "anthropic":
        url, headers = "https://api.anthropic.com/v1/models", {"x-api-key": cfg["key"], "anthropic-version": "2023-06-01"}
    else:
        url, headers = cfg["url"].rsplit("/chat/completions", 1)[0] + "/models", {"Authorization": f"Bearer {cfg['key']}"}
    try:
        res = httpx.get(url, headers=headers, timeout=30)
    except httpx.HTTPError as e:
        raise LLMError(f"모델 목록을 가져오지 못했습니다: {e}") from e
    if res.status_code != 200:
        raise LLMError(f"모델 목록 요청 실패 (HTTP {res.status_code}): {res.text[:200]}")
    ids = [m.get("id", "").removeprefix("models/") for m in res.json().get("data", [])]
    return sorted(i for i in ids if i)


def run_name(cfg: dict) -> str:
    """저장 폴더·결과 파일 이름. 생각 설정이 다르면 따로 저장해 비교할 수 있게"""
    return (safe_name(cfg["model"]) + (f"_생각{cfg['effort']}" if cfg.get("effort") else "")
            + (f"_p{v}" if (v := cfg.get("prompt_version", PROMPT_VERSION)) > 1 else "")
            + (f"_예시{safe_name(cfg['examples_name'])}" if cfg.get("examples_name") else ""))


def table_tag(src: Path) -> str:
    """라벨링 표 이름에서 구분 이름: 라벨링표_2차 → 2차, 라벨링표_경계사례 → 경계사례, 라벨링표 → 1차"""
    m = re.search(r"(\d+)차", src.stem)
    if m:
        return f"{m.group(1)}차"
    rest = re.sub(r"^라벨링표_?", "", src.stem)
    return rest or "1차"


def output_name(cfg: dict) -> str:
    """결과 표 이름. 소속 사전은 응답을 바꾸지 않고 결과만 고치므로 저장 폴더는 같고 결과 파일만 따로"""
    return run_name(cfg) + ("_사전" if cfg.get("members") else "")


def safe_name(model: str) -> str:
    return re.sub(r"[^\w.-]+", "_", model)


def chunks(rows: list[Row], size: int) -> list[list[Row]]:
    """기사 문장을 size개씩 나눔 (0이면 기사 통째로). 무료 한도가 작은 모델은 한 번에 보내는 양을 줄여야 함"""
    if size <= 0 or len(rows) <= size:
        return [rows]
    return [rows[i:i + size] for i in range(0, len(rows), size)]


def run(cfg: dict, src: Path, again: bool, gap: float, size: int = 0) -> Path:
    """한 모델로 표 전체를 분석해 라벨링표_AI_<모델>.xlsx 로 저장"""
    by_article: dict[str, list[Row]] = {}
    for r in read_rows(src):
        by_article.setdefault(r.article_id, []).append(r)
    name = run_name(cfg)
    print(f"── {cfg['model']} ──")
    labels, metas, fixed_total = {}, [], 0
    with httpx.Client(timeout=httpx.Timeout(300, connect=30)) as client:
        jobs = [(aid, k, part) for aid, rs in by_article.items() for k, part in enumerate(chunks(rs, size), 1)]
        for i, (aid, k, rs) in enumerate(jobs):
            multi = len(chunks(by_article[aid], size)) > 1
            cache = CACHE_DIR / name / (f"{aid}_{k}.json" if multi else f"{aid}.json")
            if again:
                for f in (cache, meta_path(cache)):
                    if f.exists():
                        f.unlink()
            fresh = not cache.exists()
            got = analyze_article(cfg, rs[0].outlet, rs, client, cache)
            if cfg.get("members"):
                from app.members import fix_labels
                fixed = fix_labels(got, {r.no: r.text for r in by_article[aid]}, cfg["members"])
                fixed_total += fixed
            labels.update({(aid, no): v for no, v in got.items()})
            mp = meta_path(cache)
            meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else None
            metas.append((f"{aid}-{k}" if multi else aid, meta))
            took = f", {meta['seconds']:.1f}초" if meta else ", 시간 기록 없음 (--다시 로 재면 됨)"
            print(f"{aid}{f'-{k}' if multi else ''} {rs[0].outlet}: {len(got)}문장{took}" + ("" if fresh else " (저장된 응답 사용)"))
            if fresh and i < len(jobs) - 1:
                time.sleep(gap)
    # 1차가 아닌 표는 이름 끝에 표 이름을 붙여 1차 결과를 덮어쓰지 않게 (1차는 예전 이름 그대로)
    tag = table_tag(src)
    round_tag = f"_{tag}" if tag != "1차" else ""
    dst = LABEL_DIR / f"라벨링표_AI_{output_name(cfg)}{round_tag}.xlsx"
    if cfg.get("members"):
        print(f"소속 사전으로 출처 유형을 고친 인용 문장: {fixed_total}개")
    write_labels(src, dst, labels)
    write_run_log(dst, metas)
    timed = [m for _, m in metas if m]
    if timed:
        total = sum(m["seconds"] for m in timed)
        print(f"응답 시간 합계 {total:.1f}초, 기사당 평균 {total / len(by_article):.1f}초"
              + ("" if len(timed) == len(metas) else f" (시간 기록이 없는 조각 {len(metas) - len(timed)}개 제외)"))
    print(f"저장: {dst}")
    return dst


def main(argv=None):
    ap = argparse.ArgumentParser(description="LLM으로 라벨링 표 채우기")
    ap.add_argument("표", nargs="?", default="라벨링표_1차.xlsx")
    ap.add_argument("--모델", nargs="+", metavar="모델",
                    help="gemini / claude / groq / 둘다, 또는 모델 이름 여러 개 (안 적으면 .env 의 LLM_PROVIDER)")
    ap.add_argument("--다시", action="store_true", help="저장된 응답을 무시하고 다시 요청")
    ap.add_argument("--간격", type=float, default=4.0, help="요청 사이 대기 초 (무료 한도용)")
    ap.add_argument("--모델목록", action="store_true", help="--모델 로 고른 제공사에서 지금 쓸 수 있는 모델 이름만 보여 주고 끝냄")
    ap.add_argument("--소속사전", action="store_true", help="국회의원 소속 사전(data/members.csv)으로 출처 유형 바로잡기")
    ap.add_argument("--예시", help="AI에게 보여 줄 예시 문장 CSV (Syntitan 보강 데이터 등). 결과는 …_예시<파일이름> 으로 따로 저장")
    ap.add_argument("--생각", choices=["low", "medium", "high"],
                    help="생각하는 양 (Gemini·OpenAI·Groq). 낮을수록 빠르고 정확도는 떨어질 수 있음. 안 적으면 모델 기본값")
    ap.add_argument("--판", type=int, choices=sorted(PROMPTS), help=f"프롬프트 판 (기본 {PROMPT_VERSION}). 보완 전 측정은 --판 2")
    ap.add_argument("--묶음", type=int, default=0, help="한 번에 보낼 문장 수 (0=기사 통째로). Groq 무료는 10 정도 추천")
    args = ap.parse_args(argv)

    if args.모델목록:
        try:
            for c in (args.모델 or [None]):
                prov, _ = parse_choice(c)
                cfg = config(prov, "목록 확인용")  # 모델 이름 없이도 목록은 볼 수 있게
                print(f"── {cfg['provider']} 에서 쓸 수 있는 모델 ──")
                for m in list_models(cfg):
                    print(" ", m)
        except LLMError as e:
            raise SystemExit(f"오류: {e}")
        return

    src = Path(args.표) if Path(args.표).exists() else LABEL_DIR / args.표
    choices = BOTH if args.모델 == ["둘다"] else (args.모델 or [None])
    try:
        cfgs = [config(*parse_choice(c)) for c in choices]  # 키가 빠졌으면 요청 보내기 전에 바로 알려 줌
        members = None
        if args.소속사전:
            from app.members import MEMBERS_CSV, load
            members = load()
            if not members:
                raise LLMError(f"{MEMBERS_CSV} 가 없습니다. 먼저 python -m app.members 받기 를 실행하세요.")
        examples = load_examples(Path(args.예시)) if args.예시 else None
        for c in cfgs:
            if members:
                c["members"] = members
            if examples:
                c["examples"], c["examples_name"] = examples, Path(args.예시).stem
            if args.판:
                c["prompt_version"] = args.판
            if args.생각:
                if c["provider"] == "anthropic":
                    print("참고: Claude에는 --생각 을 적용하지 않습니다.")
                else:
                    c["effort"] = args.생각
        outs = [run(c, src, args.다시, args.간격, args.묶음) for c in cfgs]
    except LLMError as e:
        raise SystemExit(f"오류: {e}")
    names = " ".join(o.name for o in outs)
    print(f"채점: python -m app.evaluate 채점 정답_{table_tag(src)}.xlsx {names}")


if __name__ == "__main__":
    main()
