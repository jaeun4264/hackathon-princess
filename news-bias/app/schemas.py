"""백엔드 → 프론트로 넘기는 데이터 형식

프론트(남지원)의 docs/data-format.md 와 똑같은 모양입니다. 형식을 바꿀 때는 그 문서와 함께 바꿔 주세요.
이름은 프론트(JavaScript) 관례에 맞춰 camelCase(issueId, sourceType …)를 씁니다.
"""
from typing import Literal

from pydantic import BaseModel, Field

# 인용 출처 유형 — 전 분야 공통 5개 + 기타 (11/5 남지원·조서연 합의)
# 라벨은 모두 이 목록으로 붙이고, 화면에는 주요 5개를 모두 보여 줌 (issues[].displaySourceTypes, 11/5 합의)
SOURCE_TYPES: list[dict] = [
    {"id": "gov", "label": "정부·여당"},
    {"id": "opp", "label": "야당"},
    {"id": "expert", "label": "전문가"},
    {"id": "citizen", "label": "시민·단체"},
    {"id": "biz", "label": "기업·업계"},
    {"id": "etc", "label": "기타"},
]
SOURCE_LABELS: dict[str, str] = {t["id"]: t["label"] for t in SOURCE_TYPES}
# 비교·빠진 관점·화면 표시에 쓰는 주요 유형 (기타 제외)
MAIN_SOURCE_TYPES: list[str] = [t["id"] for t in SOURCE_TYPES if t["id"] != "etc"]
DISPLAY_COUNT = 5  # 처음엔 상위 4개였으나 11/5 남지원·조서연 합의로 5개 모두 표시


class Meta(BaseModel):
    note: str
    version: str
    generatedAt: str


class SourceType(BaseModel):
    id: str
    label: str


class Outlet(BaseModel):
    id: str
    name: str


class Issue(BaseModel):
    id: str
    title: str
    summary: str
    category: str
    date: str = Field(description="YYYY-MM-DD")
    articleIds: list[str]
    displaySourceTypes: list[str] = Field(
        description="화면에 보여 줄 출처 유형 (지금은 주요 5개 모두, 정해진 순서)"
    )


class Sentence(BaseModel):
    id: str = Field(description="기사 안에서만 겹치지 않으면 됨 (s1, s2 …)")
    text: str
    type: Literal["fact", "opinion", "quote"] = Field(description="사실 / 의견(기자의 평가·추측) / 인용(누군가의 말 전달)")
    sourceType: str | None = Field(None, description="인용 출처 유형 id. type이 quote일 때만, 아니면 null")
    sourceName: str | None = Field(None, description="인용한 사람·기관. type이 quote일 때만, 아니면 null")
    sourceDetail: str | None = Field(
        None, description="sourceType이 etc일 때 화면에 보여 줄 원래 명칭 (예: 무소속 의원, 국회의장, 법원). 아니면 null"
    )


class FramingTerm(BaseModel):
    term: str = Field(description="sentenceId 문장 안에 똑같은 글자로 들어 있어야 함")
    sentenceId: str


class MissingViewpoint(BaseModel):
    sourceType: str
    description: str
    foundInArticleIds: list[str]


class Article(BaseModel):
    id: str
    issueId: str
    outletId: str
    title: str
    summary: str
    url: str = Field(description="언론사 원문 주소 (없으면 '#')")
    publishedAt: str = Field(description="ISO 8601")
    sentences: list[Sentence]
    framingTerms: list[FramingTerm]
    missingViewpoints: list[MissingViewpoint]


class NewsData(BaseModel):
    meta: Meta
    sourceTypes: list[SourceType]
    outlets: list[Outlet]
    issues: list[Issue]
    articles: list[Article]
