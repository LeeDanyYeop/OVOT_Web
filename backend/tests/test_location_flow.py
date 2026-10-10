from datetime import timedelta

from app.db import SessionLocal
from app.models import LocationEvent, TagScanFailure, WorkerCurrentLocation
from app.timeutil import utcnow

from .conftest import login


def test_login_rejects_bad_password(client):
    res = client.post("/api/login", json={"employee_number": "1001", "password": "nope"})
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_requires_auth(client):
    assert client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001"}).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_full_check_in_flow_with_realtime_event(client):
    worker = login(client, "1001")
    admin = login(client, "1004")

    me = client.get("/api/me", headers=worker).json()
    assert me["worker"]["name"] == "김민수"
    assert me["current_location"]["zone"]["id"] == "ZONE-OUT"
    assert me["assignment"]["readiness"] == "not_in_zone"

    with client.websocket_connect("/ws/location-events") as ws:
        ws.send_json({"type": "auth", "token": admin["Authorization"].split()[1]})
        assert ws.receive_json()["type"] == "ready"

        # worker_id in the body must be ignored; identity comes from the session.
        res = client.post(
            "/api/location/check-in",
            json={"tag_code": "ovot-zone-a-001", "source": "nfc", "worker_id": "W-003"},
            headers=worker,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "changed"
        assert body["worker_id"] == "W-001"
        assert body["zone_id"] == "ZONE-A"
        assert body["zone_name"] == "A구역 3번 블록"
        assert body["previous_zone_id"] == "ZONE-OUT"
        assert body["checked_in_at"].endswith("+09:00")

        msg = ws.receive_json()
        assert msg["type"] == "worker_location_changed"
        assert msg["data"]["worker"]["name"] == "김민수"
        assert msg["data"]["zone_id"] == "ZONE-A"
        assert msg["data"]["source_tag_id"] == "TAG-A-001"

    me = client.get("/api/me", headers=worker).json()
    assert me["current_location"]["zone"]["id"] == "ZONE-A"
    assert me["current_location"]["source"] == "nfc"
    assert me["assignment"]["readiness"] == "ready"

    zones = client.get("/api/admin/zones/state", headers=admin).json()["zones"]
    zone_a = next(z for z in zones if z["id"] == "ZONE-A")
    assert "김민수" in [w["name"] for w in zone_a["workers"]]

    # Move to another zone: old zone loses the worker, history keeps both events.
    res = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-B-001", "source": "qr"}, headers=worker)
    assert res.json()["previous_zone_id"] == "ZONE-A"
    zones = {z["id"]: z for z in client.get("/api/admin/zones/state", headers=admin).json()["zones"]}
    assert "김민수" not in [w["name"] for w in zones["ZONE-A"]["workers"]]
    assert "김민수" in [w["name"] for w in zones["ZONE-B"]["workers"]]

    history = client.get("/api/location/history", headers=worker).json()["items"]
    assert [e["zone_id"] for e in history[:3]] == ["ZONE-B", "ZONE-A", "ZONE-OUT"]

    events = client.get("/api/admin/location/events", headers=admin).json()["items"]
    assert events[0]["worker"]["name"] == "김민수" and events[0]["zone_id"] == "ZONE-B"


def test_duplicate_scan_is_debounced(client):
    worker = login(client, "1001")
    first = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001"}, headers=worker).json()
    second = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001"}, headers=worker).json()
    assert second["status"] == "duplicate"
    assert second["event_id"] == first["event_id"]
    with SessionLocal() as db:
        assert db.query(LocationEvent).filter_by(worker_id="W-001", zone_id="ZONE-A").count() == 1


def test_rescan_after_window_is_confirmation(client):
    worker = login(client, "1001")
    client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001"}, headers=worker)
    with SessionLocal() as db:
        loc = db.get(WorkerCurrentLocation, "W-001")
        loc.updated_at = utcnow() - timedelta(minutes=5)
        db.commit()
    res = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001"}, headers=worker).json()
    assert res["status"] == "confirmed"
    assert res["previous_zone_id"] == "ZONE-A"


def test_invalid_tags_are_rejected_and_logged(client):
    worker = login(client, "1001")
    admin = login(client, "1004")

    unknown = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-Z-999"}, headers=worker)
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "UNKNOWN_TAG"

    inactive = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-C-000"}, headers=worker)
    assert inactive.status_code == 409
    assert inactive.json()["detail"]["code"] == "INACTIVE_TAG"

    malformed = client.post("/api/location/check-in", json={"tag_code": "김민수 010-1234"}, headers=worker)
    assert malformed.status_code == 400

    # Location unchanged.
    assert client.get("/api/location/current", headers=worker).json()["current_location"]["zone"]["id"] == "ZONE-OUT"
    with SessionLocal() as db:
        assert db.query(TagScanFailure).count() == 3
    alerts = client.get("/api/admin/tag-alerts", headers=admin).json()["items"]
    assert alerts[0]["reason"] == "invalid_format"
    summary = client.get("/api/admin/workers/locations", headers=admin).json()["summary"]
    assert summary["tag_alerts_24h"] == 3


def test_admin_endpoints_require_admin(client):
    worker = login(client, "1001")
    assert client.get("/api/admin/workers/locations", headers=worker).status_code == 403
    with client.websocket_connect("/ws/location-events") as ws:
        ws.send_json({"type": "auth", "token": worker["Authorization"].split()[1]})
        assert ws.receive_json()["code"] == "UNAUTHORIZED"


def test_admin_summary(client):
    admin = login(client, "1004")
    data = client.get("/api/admin/workers/locations", headers=admin).json()
    assert data["summary"] == {
        "total_workers": 4,
        "in_work_zone": 2,  # 이준호(A), 박지훈(B)
        "outside_work_area": 1,  # 김민수(OUT)
        "unregistered": 1,  # 최서연
        "tag_alerts_24h": 0,
    }


def test_logout_revokes_token(client):
    worker = login(client, "1001")
    client.post("/api/logout", headers=worker)
    assert client.get("/api/me", headers=worker).status_code == 401


def test_demo_session_issues_fixed_accounts(client):
    worker = client.post("/api/demo/session", json={"view": "worker"}).json()
    admin = client.post("/api/demo/session", json={"view": "admin"}).json()
    assert worker["worker"]["name"] == "김민수"
    assert admin["worker"]["is_admin"] is True
    headers = {"Authorization": f"Bearer {worker['token']}"}
    res = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001", "source": "nfc"}, headers=headers)
    assert res.json()["worker_name"] == "김민수"


def test_voice_clip_upload_is_tied_to_session_and_zone(client):
    worker = login(client, "1001")
    admin = login(client, "1004")
    evt_a = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-A-001", "source": "nfc"}, headers=worker).json()["event_id"]
    client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-B-001", "source": "nfc"}, headers=worker)
    other = login(client, "1003")
    evt_other = client.post("/api/location/check-in", json={"tag_code": "OVOT-ZONE-C-001"}, headers=other).json()["event_id"]
    audio = b"\x1aE\xdf\xa3fake-webm-bytes"
    res = client.post(
        f"/api/voice/clips?duration_ms=60000&location_event_id={evt_a}",
        content=audio,
        headers={**worker, "Content-Type": "audio/webm;codecs=opus"},
    )
    assert res.status_code == 200, res.text
    clip = res.json()
    # Recorded under the A check-in, uploaded after moving to B: stays attributed to A.
    assert clip["worker"]["name"] == "김민수" and clip["zone"]["id"] == "ZONE-A"
    # Another worker's event id is ignored; falls back to the worker's own current zone.
    spoofed = client.post(
        f"/api/voice/clips?location_event_id={evt_other}", content=audio, headers={**worker, "Content-Type": "audio/webm"}
    ).json()
    assert spoofed["zone"]["id"] == "ZONE-B"

    assert client.post("/api/voice/clips", content=b"x", headers={**worker, "Content-Type": "text/plain"}).status_code == 415
    assert client.get("/api/admin/voice/clips", headers=worker).status_code == 403

    items = client.get("/api/admin/voice/clips", headers=admin).json()["items"]
    assert items[1]["clip_id"] == clip["clip_id"]
    played = client.get(f"/api/admin/voice/clips/{clip['clip_id']}/audio", headers=admin)
    assert played.status_code == 200 and played.content == audio


def test_assist_quick_answers_use_session_context(client):
    worker = login(client, "1001")
    ctx = client.get("/api/assist/context", headers=worker).json()
    assert ctx["assignment"] == "3번 블록 용접" and ctx["step"]["current"] == 3

    nxt = client.post("/api/assist/quick", json={"kind": "next"}, headers=worker).json()
    assert "슬래그 제거 후 2·3층 적층" in nxt["headline"]
    assert nxt["owner"].startswith("이준호") and nxt["figure"]["url"].endswith(".svg")

    tools = client.post("/api/assist/quick", json={"kind": "tools"}, headers=worker).json()
    assert any("FCAW" in d for d in tools["details"])


def test_assist_voice_without_ai_key_falls_back_and_escalates(client):
    worker = login(client, "1001")
    admin = login(client, "1004")
    card = client.post(
        "/api/assist/ask?duration_ms=3000",
        content=b"RIFF....WAVEfake",
        headers={**worker, "Content-Type": "audio/wav"},
    ).json()
    assert card["source"] == "fallback" and card["needs_supervisor"] is True

    other = login(client, "1003")
    assert client.post(f"/api/assist/{card['log_id']}/escalate", headers=other).status_code == 404
    res = client.post(f"/api/assist/{card['log_id']}/escalate", headers=worker).json()
    assert res["owner"].startswith("이준호")

    items = client.get("/api/admin/assist", headers=admin).json()["items"]
    assert items[0]["escalated"] is True and items[0]["kind_label"] == "직접 질문"
