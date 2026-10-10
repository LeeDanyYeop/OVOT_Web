"""Model -> JSON dict helpers. All timestamps are emitted in KST ISO-8601 (+09:00)."""

from datetime import datetime, timedelta

from . import config
from .models import LocationEvent, TagScanFailure, Worker, WorkAssignment, WorkerCurrentLocation, Zone
from .timeutil import to_kst_iso, utcnow

SOURCE_LABELS = {"nfc": "NFC", "qr": "QR", "manual": "코드 입력", "seed": "초기 데이터"}


def is_stale(updated_at: datetime, now: datetime | None = None) -> bool:
    now = now or utcnow()
    return now - updated_at > timedelta(hours=config.STALE_AFTER_HOURS)


def zone_brief(zone: Zone | None) -> dict | None:
    if zone is None:
        return None
    return {
        "id": zone.id,
        "name": zone.name,
        "risk_level": zone.risk_level,
        "is_work_area": zone.is_work_area,
    }


def zone_full(zone: Zone) -> dict:
    return {**zone_brief(zone), "description": zone.description, "is_active": zone.is_active}


def worker_brief(worker: Worker) -> dict:
    return {
        "id": worker.id,
        "employee_number": worker.employee_number,
        "name": worker.name,
        "role": worker.role,
        "team": worker.team,
    }


def worker_me(worker: Worker) -> dict:
    return {**worker_brief(worker), "is_admin": worker.is_admin}


def current_location(loc: WorkerCurrentLocation | None) -> dict | None:
    if loc is None:
        return None
    return {
        "zone": zone_brief(loc.zone),
        "updated_at": to_kst_iso(loc.updated_at),
        "source": loc.source_event.source,
        "source_event_id": loc.source_event.event_id,
        "is_stale": is_stale(loc.updated_at),
    }


def assignment(a: WorkAssignment | None, zone: Zone | None, loc: WorkerCurrentLocation | None) -> dict | None:
    if a is None:
        return None
    in_zone = loc is not None and loc.zone_id == a.zone_id and not is_stale(loc.updated_at)
    return {
        "id": a.id,
        "title": a.title,
        "status": a.status,
        "zone": zone_brief(zone),
        "assigned_at": to_kst_iso(a.assigned_at),
        # Availability is derived from the registered location, not tracked separately.
        "readiness": "ready" if in_zone else "not_in_zone",
    }


def location_event(e: LocationEvent) -> dict:
    """Display-oriented event plus the canonical event envelope fields."""
    return {
        "event_id": e.event_id,
        "event_type": e.event_type,
        "worker_id": e.worker_id,
        "zone_id": e.zone_id,
        "previous_zone_id": e.previous_zone_id,
        "occurred_at": to_kst_iso(e.occurred_at),
        "source": e.source,
        "source_tag_id": e.tag_id,
        "client_reported_at": to_kst_iso(e.client_reported_at),
        "worker": worker_brief(e.worker),
        "zone": zone_brief(e.zone),
        "previous_zone": zone_brief(e.previous_zone),
        "tag_code": e.tag.tag_code if e.tag else None,
    }


def tag_failure(f: TagScanFailure) -> dict:
    return {
        "id": f.id,
        "event_type": "tag_scan_rejected",
        "raw_tag_code": f.raw_tag_code,
        "reason": f.reason,
        "source": f.source,
        "occurred_at": to_kst_iso(f.occurred_at),
        "worker": worker_brief(f.worker),
    }


def voice_clip(c) -> dict:
    return {
        "clip_id": c.clip_id,
        "event_type": "voice_clip_recorded",
        "worker": worker_brief(c.worker),
        "zone": zone_brief(c.zone),
        "mime_type": c.mime_type,
        "size_bytes": c.size_bytes,
        "duration_ms": c.duration_ms,
        "client_started_at": to_kst_iso(c.client_started_at),
        "received_at": to_kst_iso(c.received_at),
    }


QUICK_LABELS = {"next": "다음 순서", "tools": "준비물", "cautions": "주의사항", "voice": "직접 질문"}


def assist_log(a) -> dict:
    import json

    answer = json.loads(a.answer_json)
    return {
        "id": a.id,
        "event_type": "assist_asked",
        "kind": a.kind,
        "kind_label": QUICK_LABELS.get(a.kind, a.kind),
        "question": a.question,
        "headline": answer.get("headline"),
        "source": a.source,
        "assignment": a.assignment_title,
        "worker": worker_brief(a.worker),
        "zone": zone_brief(a.zone),
        "escalated": a.escalated_at is not None,
        "escalated_at": to_kst_iso(a.escalated_at),
        "created_at": to_kst_iso(a.created_at),
    }
