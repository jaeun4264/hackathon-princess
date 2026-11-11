"""열람 기록 저장소 (SQLite) — 사용자 검증용: 반대 시각 기사를 실제로 열어 봤는지 잽니다.

- 사용자는 로그인 없이 프론트가 만든 익명 아이디(브라우저 저장)로만 구분합니다. 이름·이메일·IP는 받지 않습니다.
- 기록: 어떤 기사를(articleId), 어떻게 봤는지(kind: view=분석 화면, original=원문 보기),
        어디서 눌렀는지(from: recommend=반대 시각 추천, issue=이슈 화면, list=목록, me=내 읽기 편향, 그 밖 null)
"""
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = ("view", "original")
FROMS = ("recommend", "issue", "list", "me", "search")

SCHEMA = """
CREATE TABLE IF NOT EXISTS reading (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    from_where TEXT,
    read_at TEXT NOT NULL,
    received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reading_user ON reading(user_id, read_at);
"""


def db_path() -> Path:
    return Path(os.getenv("READING_DB", ROOT / "data" / "reading.db"))


@contextmanager
def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        con.executescript(SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()


def add(user_id: str, article_id: str, kind: str, read_at: str | None, from_where: str | None) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as con:
        con.execute("INSERT INTO reading (user_id, article_id, kind, from_where, read_at, received_at) VALUES (?,?,?,?,?,?)",
                    (user_id, article_id, kind, from_where, read_at or now, now))


def history(user_id: str, limit: int = 500) -> list[dict]:
    with connect() as con:
        rows = con.execute("SELECT article_id, kind, from_where, read_at FROM reading WHERE user_id=? "
                           "ORDER BY read_at DESC LIMIT ?", (user_id, limit)).fetchall()
    return [{"userId": user_id, "articleId": r["article_id"], "kind": r["kind"], "from": r["from_where"],
             "readAt": r["read_at"]} for r in rows]


def stats() -> dict:
    """사용자 검증 숫자 (기획서 6. 사용자 검증: 반대 시각 기사를 열어 본 비율)"""
    with connect() as con:
        q = lambda sql: con.execute(sql).fetchone()[0]
        users = q("SELECT COUNT(DISTINCT user_id) FROM reading")
        views = q("SELECT COUNT(*) FROM reading WHERE kind='view'")
        originals = q("SELECT COUNT(*) FROM reading WHERE kind='original'")
        rec_views = q("SELECT COUNT(*) FROM reading WHERE kind='view' AND from_where='recommend'")
        rec_originals = q("SELECT COUNT(*) FROM reading WHERE kind='original' AND from_where='recommend'")
        users_rec = q("SELECT COUNT(DISTINCT user_id) FROM reading WHERE from_where='recommend'")
        per_user = con.execute(
            "SELECT user_id, SUM(kind='view') v, SUM(kind='original') o, SUM(from_where='recommend') r, "
            "MIN(read_at) first, MAX(read_at) last FROM reading GROUP BY user_id ORDER BY first").fetchall()
    pct = lambda a, b: round(a / b, 3) if b else None
    return {
        "users": users, "views": views, "originals": originals,
        "recommendViews": rec_views, "recommendOriginals": rec_originals,
        "usersWhoOpenedRecommendation": users_rec,
        "shareOfUsersWhoOpenedRecommendation": pct(users_rec, users),
        "shareOfViewsFromRecommendation": pct(rec_views, views),
        "perUser": [{"user": f"사용자{i}", "views": r["v"], "originals": r["o"], "fromRecommend": r["r"],
                     "first": r["first"], "last": r["last"]} for i, r in enumerate(per_user, 1)],
    }
