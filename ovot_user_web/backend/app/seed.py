"""Demo data. Run `python -m app.seed --reset` to wipe and reseed the database."""

import argparse
import shutil
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .db import Base, SessionLocal, engine
from .models import LocationEvent, NfcTag, Worker, WorkAssignment, WorkerCurrentLocation, Zone
from .security import hash_password
from .timeutil import utcnow

DEMO_PASSWORD = "ovot1234"

WORKERS = [
    # id, employee_number, name, role, team, is_admin
    ("W-001", "1001", "김민수", "작업자", "용접1팀", False),
    ("W-002", "1002", "이준호", "반장", "용접1팀", False),
    ("W-003", "1003", "박지훈", "작업자", "조립2팀", False),
    ("W-004", "1004", "최서연", "안전관리자", "안전관리팀", True),
]

ZONES = [
    # id, name, description, risk_level, is_work_area, sort_order
    ("ZONE-A", "A구역 3번 블록", "블록 용접 작업장 · 화기/고소 작업", "high", True, 1),
    ("ZONE-B", "B구역 조립장", "블록 조립 · 크레인 인양 구간", "medium", True, 2),
    ("ZONE-C", "C구역 검사장", "용접부 비파괴 검사 · 품질 확인", "low", True, 3),
    ("ZONE-OUT", "작업구역 밖", "작업장 출입구 · 휴게 구역", "low", False, 9),
]

TAGS = [
    # id, tag_code, zone_id, label, is_active
    ("TAG-A-001", "OVOT-ZONE-A-001", "ZONE-A", "A구역 3번 블록 출입구", True),
    ("TAG-B-001", "OVOT-ZONE-B-001", "ZONE-B", "B구역 조립장 출입구", True),
    ("TAG-C-001", "OVOT-ZONE-C-001", "ZONE-C", "C구역 검사장 출입구", True),
    ("TAG-OUT-001", "OVOT-ZONE-OUT-001", "ZONE-OUT", "작업장 정문 게이트", True),
    # Retired tag kept to demonstrate rejection of inactive tags.
    ("TAG-C-000", "OVOT-ZONE-C-000", "ZONE-C", "교체된 구형 태그 (사용 중지)", False),
]

ASSIGNMENTS = [
    ("W-001", "ZONE-A", "3번 블록 용접"),
    ("W-002", "ZONE-A", "A구역 용접 작업 감독"),
    ("W-003", "ZONE-B", "B-12 블록 조립"),
    ("W-004", "ZONE-C", "검사장 안전 점검"),
]

# (worker_id, [(zone_id, minutes_ago), ...]) — earlier entries first.
INITIAL_MOVES = [
    ("W-002", [("ZONE-OUT", 150), ("ZONE-A", 140)]),
    ("W-003", [("ZONE-OUT", 125), ("ZONE-B", 112)]),
    ("W-001", [("ZONE-OUT", 78)]),
]


def seed(db: Session) -> bool:
    if db.scalar(select(Worker.id).limit(1)) is not None:
        return False

    now = utcnow()
    for wid, emp, name, role, team, is_admin in WORKERS:
        db.add(
            Worker(
                id=wid,
                employee_number=emp,
                name=name,
                role=role,
                team=team,
                password_hash=hash_password(DEMO_PASSWORD),
                is_admin=is_admin,
            )
        )
    for zid, name, desc, risk, work_area, order in ZONES:
        db.add(Zone(id=zid, name=name, description=desc, risk_level=risk, is_work_area=work_area, sort_order=order))
    db.flush()
    for tid, code, zid, label, active in TAGS:
        db.add(NfcTag(id=tid, tag_code=code, zone_id=zid, label=label, is_active=active, installed_at=now - timedelta(days=3)))
    for wid, zid, title in ASSIGNMENTS:
        db.add(WorkAssignment(worker_id=wid, zone_id=zid, title=title, status="assigned", assigned_at=now - timedelta(hours=3)))
    db.flush()

    tag_by_zone = {zid: tid for tid, _, zid, _, active in TAGS if active}
    for wid, moves in INITIAL_MOVES:
        previous = None
        last_event = None
        for zid, minutes_ago in moves:
            event = LocationEvent(
                event_type="worker_location_changed",
                worker_id=wid,
                zone_id=zid,
                previous_zone_id=previous,
                tag_id=tag_by_zone[zid],
                source="seed",
                occurred_at=now - timedelta(minutes=minutes_ago),
            )
            db.add(event)
            db.flush()
            event.event_id = f"EVT-LOCATION-{event.id:06d}"
            previous, last_event = zid, event
        db.add(WorkerCurrentLocation(worker_id=wid, zone_id=previous, updated_at=last_event.occurred_at, source_event_id=last_event.id))

    db.commit()
    return True


def init_db(reset: bool = False) -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if reset:
        Base.metadata.drop_all(engine)
        shutil.rmtree(config.AUDIO_DIR, ignore_errors=True)  # recorded clips belong to the wiped data
        shutil.rmtree(config.ASSIST_AUDIO_DIR, ignore_errors=True)
    Base.metadata.create_all(engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the OVOT demo database")
    parser.add_argument("--reset", action="store_true", help="drop all tables before seeding")
    args = parser.parse_args()
    init_db(reset=args.reset)
    with SessionLocal() as db:
        created = seed(db)
    print("seeded demo data" if created else "database already has data (use --reset to reseed)")


if __name__ == "__main__":
    main()
