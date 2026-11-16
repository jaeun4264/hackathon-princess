"""기사 요약 다듬기와 모아보기 기사 거르기

1) clean_summary: 포털 요약 앞에 붙은 기자 이름·통신사 표기를 지움
   "신재현 이승재 기자 = 이재명 대통령..." → "이재명 대통령..."
2) is_roundup: 여러 사건을 한데 모은 기사(주간 재판 일정, 브리핑, 주요 뉴스 등)
   한 이슈에 섞이면 다른 사건의 인용이 이슈 지표에 들어가므로(11/15 추경호 이슈에서 카카오 김범수 재판 인용이 섞임)
   묶기 전에 뺀다.
"""
from __future__ import annotations

import re

# ---------- 1. 요약의 기자 이름 지우기 ----------
_LEAD_TAG = re.compile(r"^\s*[\(\[【<]\s*[^()\[\]【】<>]{0,30}=[^()\[\]【】<>]{0,30}[\)\]】>]\s*")   # (서울=연합뉴스) [사진=뉴시스]
_BYLINE = re.compile(
    r"(?:[가-힣]{2,4}\s+){0,7}[가-힣]{2,4}\s*(?:기자|특파원|객원기자|선임기자|인턴기자)\s*[=|]\s*")       # 홍길동 이승재 기자 = / 기자 |
_OUTLET_NAME_EQ = re.compile(r"^\s*[가-힣A-Za-z0-9]{2,10}\s*[=]\s*[가-힣]{2,4}(?:\s*기자)?\s*[=|]\s*")  # 이투데이=윤혜원 기자 |
_OUTLET_NAME = re.compile(r"^\s*[가-힣A-Za-z0-9]{2,10}\s+[가-힣]{2,4}\s*=\s*")                         # 뉴데일리 김보연 =
BYLINE_WINDOW = 120  # 요약 앞부분 이 글자 수 안에서만 기자 표기를 찾음


def clean_summary(text: str | None) -> str:
    s = (text or "").strip()
    for _ in range(3):
        new = _LEAD_TAG.sub("", s)
        if new == s:
            break
        s = new
    m = _OUTLET_NAME_EQ.match(s)
    if m:
        s = s[m.end():]
    m = _BYLINE.search(s[:BYLINE_WINDOW])
    if m:
        s = s[m.end():]
    else:
        m = _OUTLET_NAME.match(s)
        if m:
            s = s[m.end():]
    s = _LEAD_TAG.sub("", s)
    return _drop_cut_start(s.strip())


# 포털 요약이 문장 중간(주소 꼬리 등)부터 잘려 시작하면 첫 조각을 버림 (11/16: "kr)을 개설하고 …")
_CUT_START = re.compile(r"^(?:[a-z][a-z0-9./-]*[)\]]|[)\]])")
_SENT_END = re.compile(r"(?:다|요|음)\.+\s+|\.\.\.\s+|…\s+")


def _drop_cut_start(s: str) -> str:
    if not _CUT_START.match(s):
        return s
    m = _SENT_END.search(s)
    rest = s[m.end():].strip() if m else ""
    return rest or s


# ---------- 2. 모아보기 기사 ----------
# 제목에 이것이 있으면 모아보기 (대괄호 꼬리표·브리핑류)
_ROUNDUP_STRONG = re.compile(
    r"(재판\s*일정|주간\s*(?:일정|재판|브리핑|이슈|뉴스|정치)|주요\s*(?:뉴스|일정|재판|이슈)|오늘의\s*(?:뉴스|재판|이슈|일정)"
    r"|이주의\s*재판|이번\s*주\s*재판|금주\s*재판|헤드라인|이시각|모닝\s*브리핑|뉴스\s*브리핑|브리핑\]|한눈에|총정리"
    r"|\[(?:[^\]]*,)?\s*주목\s*(?:,[^\]]*)?\]|\[(?:모닝|굿모닝|아침|저녁|오늘|금주|주간|이번주)[^\]]*\])")
# 날짜 표현 + 말줄임 뒤에 다른 사건을 덧붙인 제목: "추경호 이번주 1심 선고…김범수도", "...한덕수 상고심 주목"
_WHEN = re.compile(r"이번\s*주|금주|다음\s*주|[월화수목금토일]요일|\d{1,2}일")
_ELLIPSIS = re.compile(r"…|\.\.\.|‥")
_TAIL_LIST = re.compile(r"(?:도|도\s*선고|도\s*주목|\s+주목|\s+줄줄이|\s+잇따라|\s+등)\s*['\"’”]?\s*$")
# 요약에 이런 말이 있으면 모아보기 (일정 소개 기사)
_SUMMARY_CUE = re.compile(r"(이번\s*주|금주|이주|다음\s*주)[^.。]{0,40}(재판|선고|공판)[^.。]{0,30}(잇따라|줄줄이|예정돼|열린다|진행된다)"
                          r"|주요\s*재판|재판\s*일정")


def is_roundup(title: str | None, summary: str | None = "") -> bool:
    t = title or ""
    if _ROUNDUP_STRONG.search(t):
        return True
    parts = _ELLIPSIS.split(t)
    if len(parts) >= 2 and _WHEN.search(t) and _TAIL_LIST.search(parts[-1].strip()):
        return True
    if _SUMMARY_CUE.search(summary or ""):
        return True
    return False
