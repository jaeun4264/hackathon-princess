"""뉴스 편향도 서비스 백엔드 (FastAPI)

실행:  uvicorn app.main:app --reload
확인:  브라우저에서 http://127.0.0.1:8000/docs

지금은 프론트가 JSON 파일(data/news.json)을 직접 쓰고, 백엔드를 배포하면 GET /news 로 같은 내용을 받습니다.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.build import build_news
from app.schemas import NewsData

app = FastAPI(title="뉴스 편향도 API", version="0.3.0")

# 프론트엔드(남지원)가 다른 주소(Vercel, localhost:3000)에서 이 API를 부를 수 있게 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포할 때는 프론트 주소만 남기기
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """서버가 살아 있는지 확인하는 용도"""
    return {"status": "ok"}


@app.get("/news", response_model=NewsData)
def get_news():
    """화면에 필요한 전체 데이터 (프론트 mock-news.json 과 같은 모양)"""
    return build_news()
