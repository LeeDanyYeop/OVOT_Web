"""작업장 간 인계(handoff) 관리 API."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from constants import HANDOFF_TRANSITIONS
from database import get_db
from models import Handoff, Task
from schemas import HandoffCreate, HandoffOut, HandoffStatusUpdate

router = APIRouter(prefix="/handoffs", tags=["handoffs"])


@router.post("", response_model=HandoffOut, status_code=status.HTTP_201_CREATED)
def create_handoff(body: HandoffCreate, db: Session = Depends(get_db)) -> Handoff:
    """인계 요청 생성. 작업 상태(tasks.status)와는 별개로 관리된다."""
    if db.get(Task, body.task_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {body.task_id}"
        )

    handoff = Handoff(
        task_id=body.task_id,
        from_zone_id=body.from_zone_id,
        to_zone_id=body.to_zone_id,
        status="REQUESTED",
    )
    # 위 db.get(Task, ...) 조회가 이미 트랜잭션을 암묵적으로 열어 두었으므로
    # (SQLAlchemy 2.0 autobegin) 여기서 다시 db.begin() 을 호출하면 안 된다.
    db.add(handoff)
    db.commit()
    db.refresh(handoff)
    return handoff


@router.get("", response_model=list[HandoffOut])
def list_handoffs(
    db: Session = Depends(get_db),
    task_id: str | None = Query(default=None),
    status_: str | None = Query(default=None, alias="status"),
    from_zone_id: str | None = Query(default=None),
    to_zone_id: str | None = Query(default=None),
) -> list[Handoff]:
    """인계 요청 목록 조회. 선택적 필터링을 지원한다."""
    stmt = select(Handoff)
    if task_id:
        stmt = stmt.where(Handoff.task_id == task_id)
    if status_:
        stmt = stmt.where(Handoff.status == status_)
    if from_zone_id:
        stmt = stmt.where(Handoff.from_zone_id == from_zone_id)
    if to_zone_id:
        stmt = stmt.where(Handoff.to_zone_id == to_zone_id)
    stmt = stmt.order_by(Handoff.handoff_id.desc())
    return list(db.execute(stmt).scalars().all())


@router.patch("/{handoff_id}/status", response_model=HandoffOut)
def update_handoff_status(
    handoff_id: int, body: HandoffStatusUpdate, db: Session = Depends(get_db)
) -> Handoff:
    """인계 수락/진행/완료/반려. 정의된 상태 전이만 허용한다 (예: DONE 이후 되돌리기 불가)."""
    with db.begin():
        handoff = db.get(Handoff, handoff_id, with_for_update=True)
        if handoff is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"인계 요청을 찾을 수 없습니다: {handoff_id}"
            )

        allowed_next = HANDOFF_TRANSITIONS.get(handoff.status, set())
        if body.status not in allowed_next:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{handoff.status}' 상태에서 '{body.status}' 로 변경할 수 없습니다. "
                f"허용된 다음 상태: {sorted(allowed_next) or '없음(종료 상태)'}",
            )

        now = dt.datetime.now(dt.timezone.utc)
        handoff.status = body.status
        if body.status == "ACCEPTED":
            handoff.accepted_at = now
        elif body.status in ("DONE", "REJECTED"):
            handoff.completed_at = now

    db.refresh(handoff)
    return handoff
