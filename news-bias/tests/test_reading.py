"""열람 기록 API 테스트"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("READING_DB", str(tmp_path / "r.db"))
    monkeypatch.delenv("STATS_TOKEN", raising=False)
    return TestClient(app)


UID = "u-1234abcd"


def test_save_and_read_history(client):
    assert client.post("/reading-history", json={"userId": UID, "articleId": "a-1", "kind": "view",
                                                 "readAt": "2026-11-08T10:00:00Z"}).json() == {"ok": True}
    client.post("/reading-history", json={"userId": UID, "articleId": "a-2", "kind": "original",
                                          "readAt": "2026-11-08T11:00:00Z", "from": "recommend"})
    client.post("/reading-history", json={"userId": "other-user-1", "articleId": "a-9", "kind": "view"})
    h = client.get("/reading-history", params={"userId": UID}).json()
    assert [x["articleId"] for x in h] == ["a-2", "a-1"]          # 최신순
    assert h[0] == {"userId": UID, "articleId": "a-2", "kind": "original", "from": "recommend",
                    "readAt": "2026-11-08T11:00:00Z"}


def test_rejects_bad_input(client):
    assert client.post("/reading-history", json={"userId": "x", "articleId": "a-1", "kind": "view"}).status_code == 422
    assert client.post("/reading-history", json={"userId": UID, "articleId": "a-1", "kind": "like"}).status_code == 422
    assert client.post("/reading-history", json={"userId": UID, "articleId": "a-1", "kind": "view",
                                                 "from": "ad"}).status_code == 422
    assert client.get("/reading-history", params={"userId": "bad id!"}).status_code == 422


def test_stats(client, monkeypatch):
    for uid, frm in [(UID, "recommend"), (UID, None), ("user-b-5678", None)]:
        client.post("/reading-history", json={"userId": uid, "articleId": "a-1", "kind": "view", "from": frm})
    s = client.get("/reading-stats").json()
    assert s["users"] == 2 and s["views"] == 3 and s["recommendViews"] == 1
    assert s["shareOfUsersWhoOpenedRecommendation"] == 0.5
    assert all("u-" not in p["user"] for p in s["perUser"])    # 익명 아이디도 그대로 내보내지 않음
    monkeypatch.setenv("STATS_TOKEN", "secret")
    assert client.get("/reading-stats").status_code == 403
    assert client.get("/reading-stats", params={"token": "secret"}).status_code == 200
