from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializers as s
from ..db import get_db
from ..deps import require_admin
from ..models import LocationEvent, NfcTag, TagScanFailure, Worker, WorkerCurrentLocation, Zone
from ..timeutil import to_kst_iso, utcnow

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _workers_with_locations(db: Session):
    workers = db.scalars(select(Worker).where(Worker.is_active).order_by(Worker.id)).all()
    locs = {loc.worker_id: loc for loc in db.scalars(select(WorkerCurrentLocation)).all()}
    return workers, locs


@router.get("/workers/locations")
def workers_locations(db: Session = Depends(get_db)):
    workers, locs = _workers_with_locations(db)
    items = []
    summary = {"total_workers": len(workers), "in_work_zone": 0, "outside_work_area": 0, "unregistered": 0}
    for w in workers:
        loc = s.current_location(locs.get(w.id))
        if loc is None or loc["is_stale"]:
            summary["unregistered"] += 1
        elif loc["zone"]["is_work_area"]:
            summary["in_work_zone"] += 1
        else:
            summary["outside_work_area"] += 1
        items.append({"worker": s.worker_brief(w), "current_location": loc})
    since = utcnow() - timedelta(hours=24)
    summary["tag_alerts_24h"] = db.scalar(select(func.count(TagScanFailure.id)).where(TagScanFailure.occurred_at >= since))
    return {"summary": summary, "items": items, "generated_at": to_kst_iso(utcnow())}


@router.get("/zones/state")
def zones_state(db: Session = Depends(get_db)):
    """Zone-centric state, kept independent from UI so a digital twin can consume it directly."""
    zones = db.scalars(select(Zone).where(Zone.is_active).order_by(Zone.sort_order, Zone.id)).all()
    workers, locs = _workers_with_locations(db)
    by_zone: dict[str, list] = {z.id: [] for z in zones}
    unassigned = []
    for w in workers:
        loc = locs.get(w.id)
        entry = {**s.worker_brief(w), "updated_at": to_kst_iso(loc.updated_at) if loc else None,
                 "source": loc.source_event.source if loc else None}
        if loc is None or s.is_stale(loc.updated_at) or loc.zone_id not in by_zone:
            entry["last_zone"] = s.zone_brief(loc.zone) if loc else None
            unassigned.append(entry)
        else:
            by_zone[loc.zone_id].append(entry)

    last_event_rows = db.execute(
        select(LocationEvent.zone_id, func.max(LocationEvent.occurred_at)).group_by(LocationEvent.zone_id)
    ).all()
    last_event = {zid: ts for zid, ts in last_event_rows}

    return {
        "zones": [
            {
                **s.zone_full(z),
                "worker_count": len(by_zone[z.id]),
                "workers": sorted(by_zone[z.id], key=lambda e: e["updated_at"] or "", reverse=True),
                "last_event_at": to_kst_iso(last_event.get(z.id)),
            }
            for z in zones
        ],
        "unregistered_workers": unassigned,
        "generated_at": to_kst_iso(utcnow()),
    }


@router.get("/location/events")
def location_events(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    events = db.scalars(
        select(LocationEvent).order_by(LocationEvent.occurred_at.desc(), LocationEvent.id.desc()).limit(limit)
    ).all()
    return {"items": [s.location_event(e) for e in events]}


@router.get("/tag-alerts")
def tag_alerts(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(TagScanFailure).order_by(TagScanFailure.occurred_at.desc()).limit(limit)).all()
    return {"items": [s.tag_failure(f) for f in rows]}


@router.get("/tags")
def tags(db: Session = Depends(get_db)):
    rows = db.scalars(select(NfcTag).order_by(NfcTag.zone_id, NfcTag.id)).all()
    return {
        "items": [
            {
                "id": t.id,
                "tag_code": t.tag_code,
                "label": t.label,
                "is_active": t.is_active,
                "installed_at": to_kst_iso(t.installed_at),
                "zone": s.zone_brief(t.zone),
            }
            for t in rows
        ]
    }
