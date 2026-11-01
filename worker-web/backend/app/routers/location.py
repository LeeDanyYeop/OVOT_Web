from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as s
from ..db import get_db
from ..deps import get_current_worker
from ..models import LocationEvent, Worker, WorkerCurrentLocation
from ..services.event_hub import location_hub
from ..services.location import CheckInRejected, ClientInfo, check_in
from ..services.tag_verifier import TagScan
from ..timeutil import to_kst_iso

router = APIRouter(prefix="/api/location", tags=["location"])


class CheckInRequest(BaseModel):
    # Note: no worker_id here on purpose. The worker is taken from the session.
    tag_code: str = Field(min_length=1, max_length=128)
    source: Literal["nfc", "qr", "manual"] = "manual"
    client_time: datetime | None = Field(default=None, description="참고용 클라이언트 시각")
    device_id: str | None = Field(default=None, max_length=64)


@router.post("/check-in")
async def location_check_in(
    body: CheckInRequest,
    request: Request,
    worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    client_time = body.client_time
    if client_time is not None and client_time.tzinfo is None:
        client_time = client_time.replace(tzinfo=timezone.utc)
    client = ClientInfo(
        source=body.source,
        device_id=body.device_id,
        user_agent=(request.headers.get("user-agent") or "")[:256] or None,
        reported_at=client_time,
    )

    try:
        outcome = check_in(db, worker, TagScan(raw_code=body.tag_code), client)
    except CheckInRejected as exc:
        await location_hub.publish({"type": "tag_scan_rejected", "data": s.tag_failure(exc.failure)})
        raise HTTPException(
            status_code=exc.rejection.http_status,
            detail={"code": exc.rejection.reason.upper(), "message": exc.rejection.message},
        ) from exc

    event = outcome.event
    if outcome.status != "duplicate":
        await location_hub.publish({"type": event.event_type, "data": s.location_event(event)})

    return {
        "status": outcome.status,
        "worker_id": worker.id,
        "worker_name": worker.name,
        "zone_id": event.zone_id,
        "zone_name": event.zone.name,
        "previous_zone_id": event.previous_zone_id,
        "previous_zone_name": event.previous_zone.name if event.previous_zone else None,
        "checked_in_at": to_kst_iso(event.occurred_at),
        "event_id": event.event_id,
        "tag_id": outcome.tag.id,
    }


@router.get("/current")
def current(worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    return {"worker_id": worker.id, "current_location": s.current_location(db.get(WorkerCurrentLocation, worker.id))}


@router.get("/history")
def history(
    limit: int = Query(20, ge=1, le=100),
    worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    events = db.scalars(
        select(LocationEvent)
        .where(LocationEvent.worker_id == worker.id)
        .order_by(LocationEvent.occurred_at.desc(), LocationEvent.id.desc())
        .limit(limit)
    ).all()
    return {"items": [s.location_event(e) for e in events]}
