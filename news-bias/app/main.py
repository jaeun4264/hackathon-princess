"""뉴스 편향도 서비스 백엔드 (FastAPI)

실행:  uvicorn app.main:app --reload
확인:  브라우저에서 http://127.0.0.1:8000/docs

- GET  /news                 화면 데이터. 매일 자동 실행 결과(data/daily/news.json) → 없으면 사람이 확인한 이슈(data/curated.json) → 없으면 가짜 데이터
- POST /reading-history      열람 기록 1건 저장 (익명 아이디)
- GET  /reading-history      내 기록 (최신순) — 프론트의 내 읽기 편향 계산용
- GET  /reading-stats        사용자 검증 숫자 (반대 시각 추천을 열어 본 비율 등). STATS_TOKEN 을 정했으면 ?token= 필요

환경 변수: ALLOWED_ORIGINS (프론트 주소, 쉼표로 여러 개. 기본 *), READING_DB (기록 파일 위치), STATS_TOKEN
"""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from app import reading
from app.build import build_news
from app.metrics import ensure_metrics
from app.schemas import NewsData

ROOT = Path(__file__).resolve().parent.parent
USER_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")   # 프론트가 만든 익명 아이디 (예: crypto.randomUUID())
ARTICLE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")

app = FastAPI(title="뉴스 편향도 API", version="0.4.0")

# 프론트엔드(남지원)가 다른 주소(Vercel, localhost:3000)에서 이 API를 부를 수 있게 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """서버가 살아 있는지 확인하는 용도"""
    return {"status": "ok"}


@app.get("/news", response_model=NewsData)
def get_news():
    """화면에 필요한 전체 데이터 (프론트 mock-news.json 과 같은 모양)"""
    for path in (ROOT / "data" / "daily" / "news.json", ROOT / "data" / "curated.json"):
        if path.exists():
            return ensure_metrics(json.loads(path.read_text(encoding="utf-8")))
    return build_news()


class ReadingIn(BaseModel):
    userId: str = Field(description="익명 아이디 8~64자 (영문·숫자·-·_)")
    articleId: str
    kind: str = Field(description="view(분석 화면) / original(원문 보기)")
    readAt: str | None = Field(None, description="ISO 8601. 비우면 서버 시각")
    source: str | None = Field(None, alias="from", description="recommend / issue / list / me / search")

    @field_validator("userId")
    @classmethod
    def _uid(cls, v):
        if not USER_ID.match(v):
            raise ValueError("userId 형식이 맞지 않음 (영문·숫자·-·_ 8~64자)")
        return v

    @field_validator("articleId")
    @classmethod
    def _aid(cls, v):
        if not ARTICLE_ID.match(v):
            raise ValueError("articleId 형식이 맞지 않음")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        if v not in reading.KINDS:
            raise ValueError(f"kind 는 {reading.KINDS} 중 하나")
        return v

    @field_validator("source")
    @classmethod
    def _from(cls, v):
        if v is not None and v not in reading.FROMS:
            raise ValueError(f"from 은 {reading.FROMS} 중 하나 또는 null")
        return v


@app.post("/reading-history")
def post_reading(item: ReadingIn):
    reading.add(item.userId, item.articleId, item.kind, item.readAt, item.source)
    return {"ok": True}


@app.get("/reading-history")
def get_reading(userId: str = Query(...)):
    if not USER_ID.match(userId):
        raise HTTPException(422, "userId 형식이 맞지 않음")
    return reading.history(userId)


@app.get("/reading-stats")
def get_stats(token: str | None = None):
    need = os.getenv("STATS_TOKEN", "")
    if need and token != need:
        raise HTTPException(403, "token 이 필요합니다")
    return reading.stats()
