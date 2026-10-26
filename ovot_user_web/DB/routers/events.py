"""이벤트(AI Agent 분석 결과) 관리 API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Event, EventType, SpeechType, Task, VoiceRecord
from schemas import (
    EventCreate,
    EventOut,
    EventStatusUpdate,
    EventTypeOut,
    SpeechTypeOut,
)

router = APIRouter(tags=["events"])


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventCreate, db: Session = Depends(get_db)) -> Event:
    """AI Agent 분석 결과 저장. 섹션 7의 8단계 검증/저장 절차를 그대로 따른다."""

    # 2. voice_id 존재 여부 확인
    if db.get(VoiceRecord, body.voice_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"발화 기록을 찾을 수 없습니다: {body.voice_id}"
        )

    # 3. task_id 존재 여부 확인 (제공된 경우)
    if body.task_id is not None and db.get(Task, body.task_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {body.task_id}"
        )

    # 4. 이벤트 코드 검증 (event_types 테이블 대조)
    if db.get(EventType, body.event_type) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"등록되지 않은 event_type 입니다: {body.event_type}",
        )

    # 5. 발화 의도 코드 검증 (speech_types 테이블 대조)
    if db.get(SpeechType, body.speech_type) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"등록되지 않은 speech_type 입니다: {body.speech_type}",
        )

    # 6. 확인 필요 여부에 따른 처리 상태 결정
    event_status_value = "NEEDS_CONFIRMATION" if body.requires_confirmation else "PENDING_VALIDATION"

    # 7. PostgreSQL 저장 (트랜잭션)
    event = Event(
        voice_id=body.voice_id,
        task_id=body.task_id,
        event_type=body.event_type,
        event_status=event_status_value,
        speech_type=body.speech_type,
        summary=body.summary,
    )
    # 주의: 위 db.get() 조회들이 이미 세션에 트랜잭션을 암묵적으로 열어 두었으므로
    # (SQLAlchemy 2.0 autobegin) 여기서 다시 db.begin() 을 호출하면 안 된다.
    db.add(event)
    db.commit()
    db.refresh(event)

    # 8. 저장 결과 JSON 반환
    return event


@router.get("/events", response_model=list[EventOut])
def list_events(
    db: Session = Depends(get_db),
    voice_id: str | None = Query(default=None),
    task_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    event_status: str | None = Query(default=None),
    speech_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[Event]:
    """이벤트 목록 조회. 선택적 필터링을 지원한다."""
    stmt = select(Event)
    if voice_id:
        stmt = stmt.where(Event.voice_id == voice_id)
    if task_id:
        stmt = stmt.where(Event.task_id == task_id)
    if event_type:
        stmt = stmt.where(Event.event_type == event_type)
    if event_status:
        stmt = stmt.where(Event.event_status == event_status)
    if speech_type:
        stmt = stmt.where(Event.speech_type == speech_type)
    stmt = stmt.order_by(Event.event_id.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())


@router.patch("/events/{event_id}/status", response_model=EventOut)
def update_event_status(
    event_id: int, body: EventStatusUpdate, db: Session = Depends(get_db)
) -> Event:
    """이벤트 처리 상태 변경 (확인/반려 등).

    REST API 섹션 6 의 기본 목록에는 없지만, 섹션 5-4("FastAPI 는 확인 요청
    및 처리 결과를 관리한다")를 충족하기 위해 추가한 엔드포인트다. 웹사이트
    GUI 가 NEEDS_CONFIRMATION 상태의 이벤트를 사람이 확인/반려하도록 호출한다.
    """
    with db.begin():
        event = db.get(Event, event_id, with_for_update=True)
        if event is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"이벤트를 찾을 수 없습니다: {event_id}"
            )
        event.event_status = body.event_status
    db.refresh(event)
    return event


@router.get("/event-types", response_model=list[EventTypeOut])
def list_event_types(db: Session = Depends(get_db)) -> list[EventType]:
    """등록된 이벤트 코드(25개) 조회."""
    stmt = select(EventType).order_by(EventType.category_code, EventType.event_type)
    return list(db.execute(stmt).scalars().all())


@router.get("/speech-types", response_model=list[SpeechTypeOut])
def list_speech_types(db: Session = Depends(get_db)) -> list[SpeechType]:
    """발화 의도 코드(5개) 조회."""
    stmt = select(SpeechType).order_by(SpeechType.speech_type)
    return list(db.execute(stmt).scalars().all())
