from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from .. import serializers as s
from ..db import get_db
from ..deps import get_current_worker, get_token
from ..models import Worker, WorkAssignment, WorkerCurrentLocation, Zone
from ..security import create_session, revoke_session, verify_password

router = APIRouter(prefix="/api", tags=["auth"])


class LoginRequest(BaseModel):
    employee_number: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    worker = db.scalar(select(Worker).where(Worker.employee_number == body.employee_number.strip()))
    if worker is None or not worker.is_active or not verify_password(body.password, worker.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "사번 또는 비밀번호가 올바르지 않습니다."},
        )
    token = create_session(db, worker)
    return {"token": token, "worker": s.worker_me(worker)}


@router.post("/logout")
def logout(token: str | None = Depends(get_token), db: Session = Depends(get_db)):
    if token:
        revoke_session(db, token)
    return {"ok": True}


@router.get("/me")
def me(worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    loc = db.get(WorkerCurrentLocation, worker.id)
    assignment = db.scalar(
        select(WorkAssignment)
        .where(WorkAssignment.worker_id == worker.id, WorkAssignment.status != "done")
        .order_by(WorkAssignment.assigned_at.desc())
        .limit(1)
    )
    zone = db.get(Zone, assignment.zone_id) if assignment else None
    return {
        "worker": s.worker_me(worker),
        "current_location": s.current_location(loc),
        "assignment": s.assignment(assignment, zone, loc),
    }


class DemoSessionRequest(BaseModel):
    view: Literal["worker", "admin"] = "worker"
    worker_id: str | None = None  # 로그인 화면에서 고른 시연 계정 (DEMO_LOGIN_IDS 안에서만)


@router.post("/demo/session")
def demo_session(body: DemoSessionRequest, db: Session = Depends(get_db)):
    """Demo-only auto login. The client picks the view, never the worker."""
    if not config.DEMO_MODE:
        raise HTTPException(status_code=404, detail={"code": "DEMO_DISABLED", "message": "시연 모드가 꺼져 있습니다."})
    if body.worker_id is not None and body.worker_id not in config.DEMO_LOGIN_IDS:
        raise HTTPException(status_code=400, detail={"code": "DEMO_ACCOUNT_NOT_ALLOWED", "message": "선택할 수 없는 계정입니다."})
    if body.view == "admin":
        worker = db.get(Worker, config.DEMO_ADMIN_ID)
    else:
        worker = db.get(Worker, body.worker_id or config.DEMO_WORKER_ID)
    if worker is None or not worker.is_active:
        raise HTTPException(status_code=503, detail={"code": "DEMO_ACCOUNT_MISSING", "message": "시연 계정이 없습니다."})
    return {"token": create_session(db, worker), "worker": s.worker_me(worker)}


@router.get("/demo/accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """로그인 화면용 시연 계정 목록 (이름·역할만, 비밀값 없음)."""
    if not config.DEMO_MODE:
        raise HTTPException(status_code=404, detail={"code": "DEMO_DISABLED", "message": "시연 모드가 꺼져 있습니다."})
    rows = [db.get(Worker, wid) for wid in config.DEMO_LOGIN_IDS]
    return {"items": [{"id": w.id, "employee_number": w.employee_number, "name": w.name, "role": w.role, "team": w.team} for w in rows if w and w.is_active]}
