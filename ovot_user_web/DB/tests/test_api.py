"""OVOT Backend API 통합 테스트.

실제 ovot_db 에 대해 동작한다. 각 테스트는 자신이 만든 행만 정리하며,
기존 시드 데이터(T-001~003, V-001, event_id=1, event_types 25개,
speech_types 5개)는 생성/수정/삭제하지 않는다.

실행:  pytest -v
"""

from __future__ import annotations

from sqlalchemy import text


# ──────────────────────────── health ────────────────────────────


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_db(client):
    r = client.get("/health/db")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "ovot_db"


# ──────────────────────────── tasks ────────────────────────────


def test_list_tasks_contains_seed_data(client):
    r = client.get("/tasks")
    assert r.status_code == 200
    ids = {t["task_id"] for t in r.json()}
    assert {"T-001", "T-002", "T-003"} <= ids


def test_get_task_ok(client):
    r = client.get("/tasks/T-001")
    assert r.status_code == 200
    assert r.json()["task_id"] == "T-001"


def test_get_task_404(client):
    r = client.get("/tasks/NOPE")
    assert r.status_code == 404
    assert r.json()["error"] is True


def test_patch_task_status_invalid_422(client):
    r = client.patch("/tasks/T-001/status", json={"status": "GARBAGE"})
    assert r.status_code == 422


def test_patch_task_status_missing_task_404(client):
    r = client.patch("/tasks/T-999/status", json={"status": "DONE"})
    assert r.status_code == 404


def test_patch_task_status_roundtrip(client, db):
    original = client.get("/tasks/T-003").json()
    try:
        r = client.patch("/tasks/T-003/status", json={"status": "in_progress"})
        assert r.status_code == 200
        assert r.json()["status"] == "IN_PROGRESS"

        r2 = client.get("/tasks/T-003")
        assert r2.json()["status"] == "IN_PROGRESS"
    finally:
        # 원래 상태로 복원 (기존 데이터 보존 원칙)
        db.execute(
            text("UPDATE tasks SET status = :s, updated_at = :u WHERE task_id = 'T-003'"),
            {"s": original["status"], "u": original["updated_at"]},
        )
        db.commit()


# ──────────────────────────── voice-records ────────────────────────────


def test_list_voice_records_contains_seed_data(client):
    r = client.get("/voice-records")
    assert r.status_code == 200
    ids = {v["voice_id"] for v in r.json()}
    assert "V-001" in ids


def test_create_voice_record_auto_id_and_default_timestamp(client, db):
    r = client.post(
        "/voice-records",
        json={"worker_id": "W-TEST", "task_id": "T-001", "transcript": "pytest transcript"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["voice_id"].startswith("V-")
    assert body["recorded_at"] is not None  # DB DEFAULT NOW() 가 적용되어야 한다
    db.execute(text("DELETE FROM voice_records WHERE voice_id = :v"), {"v": body["voice_id"]})
    db.commit()


def test_create_voice_record_missing_transcript_422(client):
    r = client.post("/voice-records", json={})
    assert r.status_code == 422


def test_create_voice_record_bad_task_id_404(client):
    r = client.post("/voice-records", json={"task_id": "T-999", "transcript": "x"})
    assert r.status_code == 404


def test_create_voice_record_duplicate_id_422(client, db):
    r1 = client.post("/voice-records", json={"voice_id": "V-PYTEST-DUP", "transcript": "a"})
    assert r1.status_code == 201
    try:
        r2 = client.post("/voice-records", json={"voice_id": "V-PYTEST-DUP", "transcript": "b"})
        assert r2.status_code == 422
    finally:
        db.execute(text("DELETE FROM voice_records WHERE voice_id = 'V-PYTEST-DUP'"))
        db.commit()


# ──────────────────────────── events ────────────────────────────


def test_event_types_returns_25(client):
    r = client.get("/event-types")
    assert r.status_code == 200
    assert len(r.json()) == 25


def test_speech_types_returns_5(client):
    r = client.get("/speech-types")
    assert r.status_code == 200
    assert len(r.json()) == 5


def test_event_full_flow_and_multi_event_per_voice(client, db):
    # 준비: 전용 voice_record 생성
    vr = client.post(
        "/voice-records", json={"voice_id": "V-PYTEST-1", "task_id": "T-001", "transcript": "t"}
    )
    assert vr.status_code == 201
    try:
        e1 = client.post(
            "/events",
            json={
                "voice_id": "V-PYTEST-1",
                "task_id": "T-001",
                "speech_type": "CMD",
                "event_type": "(WI) PRIORITY",
                "summary": "s1",
                "requires_confirmation": False,
            },
        )
        assert e1.status_code == 201
        assert e1.json()["event_status"] == "PENDING_VALIDATION"

        # 같은 voice_id 로 두 번째 이벤트 (UNIQUE 제거 확인)
        e2 = client.post(
            "/events",
            json={
                "voice_id": "V-PYTEST-1",
                "task_id": "T-001",
                "speech_type": "RPT",
                "event_type": "(WC) DONE",
                "requires_confirmation": True,
            },
        )
        assert e2.status_code == 201
        assert e2.json()["event_status"] == "NEEDS_CONFIRMATION"

        # 처리 상태 변경
        eid = e2.json()["event_id"]
        patched = client.patch(f"/events/{eid}/status", json={"event_status": "CONFIRMED"})
        assert patched.status_code == 200
        assert patched.json()["event_status"] == "CONFIRMED"
    finally:
        db.execute(text("DELETE FROM events WHERE voice_id = 'V-PYTEST-1'"))
        db.execute(text("DELETE FROM voice_records WHERE voice_id = 'V-PYTEST-1'"))
        db.commit()


def test_event_bad_voice_id_404(client):
    r = client.post(
        "/events", json={"voice_id": "V-NOPE", "speech_type": "CMD", "event_type": "(WI) PRIORITY"}
    )
    assert r.status_code == 404


def test_event_bad_event_type_422(client):
    r = client.post(
        "/events", json={"voice_id": "V-001", "speech_type": "CMD", "event_type": "NOT_A_CODE"}
    )
    assert r.status_code == 422


def test_event_bad_speech_type_422(client):
    r = client.post(
        "/events", json={"voice_id": "V-001", "speech_type": "ZZZ", "event_type": "(WI) PRIORITY"}
    )
    assert r.status_code == 422


def test_event_status_patch_404(client):
    r = client.patch("/events/99999999/status", json={"event_status": "CONFIRMED"})
    assert r.status_code == 404


def test_event_status_patch_invalid_value_422(client):
    r = client.patch("/events/1/status", json={"event_status": "BOGUS"})
    assert r.status_code == 422


def test_existing_seed_event_preserved(client):
    """기존 데이터(event_id=1) 가 테스트로 인해 손상되지 않았는지 확인."""
    r = client.get("/events", params={"voice_id": "V-001"})
    assert r.status_code == 200
    events = r.json()
    assert any(e["event_id"] == 1 for e in events)


# ──────────────────────────── handoffs ────────────────────────────


def test_handoff_full_lifecycle(client, db):
    r = client.post(
        "/handoffs", json={"task_id": "T-001", "from_zone_id": "A", "to_zone_id": "B"}
    )
    assert r.status_code == 201
    handoff = r.json()
    hid = handoff["handoff_id"]
    assert handoff["status"] == "REQUESTED"
    try:
        r = client.patch(f"/handoffs/{hid}/status", json={"status": "ACCEPTED"})
        assert r.status_code == 200
        assert r.json()["accepted_at"] is not None

        # 잘못된 전이: ACCEPTED -> DONE (IN_PROGRESS 건너뛰기) 는 거부
        bad = client.patch(f"/handoffs/{hid}/status", json={"status": "DONE"})
        assert bad.status_code == 409

        r = client.patch(f"/handoffs/{hid}/status", json={"status": "IN_PROGRESS"})
        assert r.status_code == 200

        r = client.patch(f"/handoffs/{hid}/status", json={"status": "DONE"})
        assert r.status_code == 200
        assert r.json()["completed_at"] is not None

        # 종료 상태 이후 전이는 거부
        terminal = client.patch(f"/handoffs/{hid}/status", json={"status": "REJECTED"})
        assert terminal.status_code == 409
    finally:
        db.execute(text("DELETE FROM handoffs WHERE handoff_id = :h"), {"h": hid})
        db.commit()


def test_handoff_same_zone_422(client):
    r = client.post(
        "/handoffs", json={"task_id": "T-001", "from_zone_id": "A", "to_zone_id": "A"}
    )
    assert r.status_code == 422


def test_handoff_bad_task_id_404(client):
    r = client.post(
        "/handoffs", json={"task_id": "T-999", "from_zone_id": "A", "to_zone_id": "B"}
    )
    assert r.status_code == 404


def test_handoff_status_patch_missing_404(client):
    r = client.patch("/handoffs/99999999/status", json={"status": "ACCEPTED"})
    assert r.status_code == 404
