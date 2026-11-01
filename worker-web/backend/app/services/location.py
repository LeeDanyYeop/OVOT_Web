"""Check-in service: tag scan -> append location event -> update current-location projection."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .. import config
from ..models import LocationEvent, NfcTag, TagScanFailure, Worker, WorkerCurrentLocation
from ..timeutil import utcnow
from .tag_verifier import StaticCodeTagVerifier, TagRejected, TagScan, TagVerifier

EVENT_LOCATION_CHANGED = "worker_location_changed"
EVENT_LOCATION_CONFIRMED = "worker_location_confirmed"  # re-scan of the zone already registered

ALLOWED_SOURCES = {"nfc", "qr", "manual"}


@dataclass
class ClientInfo:
    source: str
    device_id: str | None = None
    user_agent: str | None = None
    reported_at: datetime | None = None


@dataclass
class CheckInOutcome:
    status: str  # changed / confirmed / duplicate
    event: LocationEvent
    tag: NfcTag


class CheckInRejected(Exception):
    def __init__(self, rejection: TagRejected, failure: TagScanFailure):
        super().__init__(rejection.message)
        self.rejection = rejection
        self.failure = failure


def _record_failure(db: Session, worker: Worker, scan: TagScan, client: ClientInfo, err: TagRejected) -> TagScanFailure:
    failure = TagScanFailure(
        worker_id=worker.id,
        raw_tag_code=scan.raw_code.strip()[:64] or "(빈 값)",
        tag_id=err.tag.id if err.tag else None,
        reason=err.reason,
        source=client.source,
        occurred_at=utcnow(),
        device_id=client.device_id,
        user_agent=client.user_agent,
    )
    db.add(failure)
    db.commit()
    return failure


def check_in(
    db: Session,
    worker: Worker,
    scan: TagScan,
    client: ClientInfo,
    verifier: TagVerifier | None = None,
    now: datetime | None = None,
) -> CheckInOutcome:
    verifier = verifier or StaticCodeTagVerifier()
    now = now or utcnow()

    try:
        tag = verifier.resolve(db, scan)
    except TagRejected as err:
        raise CheckInRejected(err, _record_failure(db, worker, scan, client, err)) from err

    current = db.get(WorkerCurrentLocation, worker.id)

    # Debounce: repeated taps on the same zone within the window do not create new events.
    if current is not None and current.zone_id == tag.zone_id:
        if now - current.updated_at < timedelta(seconds=config.DUPLICATE_WINDOW_SECONDS):
            return CheckInOutcome("duplicate", current.source_event, tag)

    previous_zone_id = current.zone_id if current else None
    event_type = EVENT_LOCATION_CONFIRMED if previous_zone_id == tag.zone_id else EVENT_LOCATION_CHANGED

    event = LocationEvent(
        event_type=event_type,
        worker_id=worker.id,
        zone_id=tag.zone_id,
        previous_zone_id=previous_zone_id,
        tag_id=tag.id,
        source=client.source,
        occurred_at=now,
        client_reported_at=client.reported_at,
        device_id=client.device_id,
        user_agent=client.user_agent,
    )
    db.add(event)
    db.flush()
    event.event_id = f"EVT-LOCATION-{event.id:06d}"

    if current is None:
        current = WorkerCurrentLocation(worker_id=worker.id)
        db.add(current)
    current.zone = tag.zone
    current.updated_at = now
    current.source_event = event

    db.commit()
    db.refresh(event)
    return CheckInOutcome("changed" if event_type == EVENT_LOCATION_CHANGED else "confirmed", event, tag)
