"""발화(STT 전사) 기록 API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import Task, VoiceRecord
from schemas import VoiceRecordCreate, VoiceRecordOut

router = APIRouter(prefix="/voice-records", tags=["voice-records"])

_NEXT_VOICE_ID_SQL = text(
    r"""
    SELECT COALESCE(
        MAX((regexp_match(voice_id, '^V-(\d+)$'))[1]::int), 0
    ) + 1 AS next_num
    FROM voice_records
    """
)


def _generate_voice_id(db: Session) -> str:
    next_num = db.execute(_NEXT_VOICE_ID_SQL).scalar_one()
    return f"V-{next_num:03d}"


@router.post("", response_model=VoiceRecordOut, status_code=status.HTTP_201_CREATED)
def create_voice_record(body: VoiceRecordCreate, db: Session = Depends(get_db)) -> VoiceRecord:
    """STT 전사문 저장. voice_id 를 생략하면 서버가 V-NNN 형식으로 자동 생성한다."""
    if body.task_id is not None and db.get(Task, body.task_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {body.task_id}"
        )

    last_error: Exception | None = None
    for _ in range(3):  # 동시 요청으로 인한 voice_id 충돌 시 재시도
        voice_id = body.voice_id or _generate_voice_id(db)
        record = VoiceRecord(
            voice_id=voice_id,
            worker_id=body.worker_id,
            zone_id=body.zone_id,
            block_id=body.block_id,
            task_id=body.task_id,
            transcript=body.transcript,
        )
        try:
            db.add(record)
            db.commit()  # SQLAlchemy 가 이미 암묵적으로 연 트랜잭션을 여기서 커밋한다
            db.refresh(record)
            return record
        except IntegrityError as exc:
            db.rollback()
            last_error = exc
            if body.voice_id is not None:
                # 사용자가 직접 지정한 ID 가 중복이면 재시도하지 않고 바로 오류
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"이미 존재하는 voice_id 입니다: {body.voice_id}",
                ) from exc
            continue
    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR, "voice_id 자동 생성에 실패했습니다."
    ) from last_error


@router.get("", response_model=list[VoiceRecordOut])
def list_voice_records(
    db: Session = Depends(get_db),
    task_id: str | None = Query(default=None),
    worker_id: str | None = Query(default=None),
    zone_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[VoiceRecord]:
    """발화 기록 조회. task_id / worker_id / zone_id 로 선택적 필터링."""
    stmt = select(VoiceRecord)
    if task_id:
        stmt = stmt.where(VoiceRecord.task_id == task_id)
    if worker_id:
        stmt = stmt.where(VoiceRecord.worker_id == worker_id)
    if zone_id:
        stmt = stmt.where(VoiceRecord.zone_id == zone_id)
    stmt = stmt.order_by(VoiceRecord.recorded_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())
