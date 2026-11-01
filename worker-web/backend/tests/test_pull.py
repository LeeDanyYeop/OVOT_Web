"""학교 PC 가 녹음을 가져가는 /api/pull 경로 — 토큰 없으면 닫히고, 있으면 순서대로 목록·파일을 준다."""

from app import config

from .conftest import login


def _upload(client, headers, body=b"fake-webm-bytes"):
    res = client.post("/api/voice/clips?duration_ms=10000", content=body, headers={**headers, "Content-Type": "audio/webm"})
    assert res.status_code == 200, res.text
    return res.json()["clip_id"]


def test_pull_closed_without_server_token(client, monkeypatch):
    monkeypatch.setattr(config, "PULL_TOKEN", "")
    assert client.get("/api/pull/voice/clips").status_code == 503


def test_pull_requires_token_and_lists_in_order(client, monkeypatch):
    monkeypatch.setattr(config, "PULL_TOKEN", "pull-secret-for-test")
    worker = login(client, "1001")
    a = _upload(client, worker, b"first")
    b = _upload(client, worker, b"second")

    assert client.get("/api/pull/voice/clips").status_code == 401
    assert client.get("/api/pull/voice/clips", headers={"Authorization": "Bearer wrong"}).status_code == 401
    # 작업자 로그인 토큰으로도 열 수 없다
    assert client.get("/api/pull/voice/clips", headers=worker).status_code == 401

    auth = {"Authorization": "Bearer pull-secret-for-test"}
    items = client.get("/api/pull/voice/clips", headers=auth).json()["items"]
    assert [i["clip_id"] for i in items] == [a, b]
    assert items[0]["worker_id"] and items[0]["mime_type"] == "audio/webm"
    assert all(i["block_id"] == config.ZONE_BLOCKS.get(i["zone_id"] or "") for i in items)

    rest = client.get(f"/api/pull/voice/clips?after_id={items[0]['id']}", headers=auth).json()["items"]
    assert [i["clip_id"] for i in rest] == [b]

    audio = client.get(f"/api/pull/voice/clips/{a}/audio", headers=auth)
    assert audio.status_code == 200 and audio.content == b"first"
    assert client.get(f"/api/pull/voice/clips/{a}/audio").status_code == 401
    assert client.get("/api/pull/voice/clips/VOICE-999999/audio", headers=auth).status_code == 404
