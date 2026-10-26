"""작업(tasks) 관리 API."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Task
from schemas import TaskOut, TaskStatusUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    zone_id: str | None = Query(default=None),
    block_id: str | None = Query(default=None),
    status_: str | None = Query(default=None, alias="status"),
) -> list[Task]:
    """전체 작업 목록 반환. zone_id / block_id / status 로 선택적 필터링."""
    stmt = select(Task)
    if zone_id:
        stmt = stmt.where(Task.zone_id == zone_id)
    if block_id:
        stmt = stmt.where(Task.block_id == block_id)
    if status_:
        stmt = stmt.where(Task.status == status_)
    stmt = stmt.order_by(Task.task_id)
    return list(db.execute(stmt).scalars().all())


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db)) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {task_id}")
    return task


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_task_status(
    task_id: str, body: TaskStatusUpdate, db: Session = Depends(get_db)
) -> Task:
    """작업 상태 변경. DB 트랜잭션으로 조회-수정-커밋의 일관성을 보장한다.

    DB 에 updated_at 자동 갱신 트리거가 없으므로(확인됨) 애플리케이션에서
    직접 갱신한다.
    """
    with db.begin():
        task = db.get(Task, task_id, with_for_update=True)
        if task is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {task_id}")
        task.status = body.status
        task.updated_at = dt.datetime.now(dt.timezone.utc)
    db.refresh(task)
    return task
