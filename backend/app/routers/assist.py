"""'오봇에게 물어보기': quick answers from approved guides and voice questions.

The client never sends its work context; the server looks up the session worker's
current assignment and location, so the worker does not have to explain what they do.
"""

import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from .. import serializers as s
from ..db import get_db
from ..deps import get_current_worker, require_admin
from ..guides import guide_for, quick_answer
from ..models import AssistLog, Worker, WorkAssignment, WorkerCurrentLocation
from ..services.assist_ai import AssistUnavailable, ai_enabled, answer_voice
from ..services.event_hub import location_hub
from ..timeutil import to_kst_iso, utcnow

router = APIRouter(tags=["assist"])

_MIME_RE = re.compile(r"^audio/[a-z0-9.+-]+$")


def _context(db: Session, worker: Worker) -> tuple[WorkAssignment | None, WorkerCurrentLocation | None, dict | None]:
    assignment = db.scalar(
        select(WorkAssignment)
        .where(WorkAssignment.worker_id == worker.id, WorkAssignment.status != "done")
        .order_by(WorkAssignment.assigned_at.desc())
        .limit(1)
    )
    loc = db.get(WorkerCurrentLocation, worker.id)
    return assignment, loc, guide_for(assignment.title if assignment else None)


def _card(log: AssistLog, guide: dict | None) -> dict:
    answer = json.loads(log.answer_json)
    show_figure = bool(answer.get("show_figure") and guide and guide.get("figure"))
    return {
        "log_id": log.id,
        "kind": log.kind,
        "question": log.question,
        "headline": answer["headline"],
        "details": answer.get("details", []),
        "figure": guide["figure"] if guide and guide.get("figure") else None,
        "show_figure": show_figure,
        "references": guide["references"] if guide else [],
        "owner": guide["owner"] if guide else None,
        "needs_supervisor": bool(answer.get("needs_supervisor")),
        "source": log.source,
        "escalated": log.escalated_at is not None,
        "created_at": to_kst_iso(log.created_at),
    }


def _save(db: Session, worker: Worker, assignment, loc, kind: str, answer: dict, source: str,
          question: str | None = None, audio_path: str | None = None) -> AssistLog:
    log = AssistLog(
        worker_id=worker.id,
        zone_id=loc.zone_id if loc else None,
        assignment_title=assignment.title if assignment else None,
        kind=kind,
        question=question,
        answer_json=json.dumps(answer, ensure_ascii=False),
        source=source,
        created_at=utcnow(),
        audio_path=audio_path,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/api/assist/context")
def assist_context(worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    assignment, loc, guide = _context(db, worker)
    return {
        "assignment": assignment.title if assignment else None,
        "zone": s.zone_brief(loc.zone) if loc else None,
        "step": {"current": guide["current_step"], "total": len(guide["steps"]),
                 "name": guide["steps"][guide["current_step"] - 1]} if guide else None,
        "voice_enabled": ai_enabled(),
    }


class QuickRequest(BaseModel):
    kind: Literal["next", "tools", "cautions"]


@router.post("/api/assist/quick")
async def assist_quick(body: QuickRequest, worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    assignment, loc, guide = _context(db, worker)
    if guide is None:
        answer = {"headline": "등록된 작업 지침이 없어요. 담당자에게 확인하세요.", "details": [], "needs_supervisor": True}
    else:
        answer = quick_answer(guide, body.kind)
    log = _save(db, worker, assignment, loc, body.kind, answer, "guide")
    card = _card(log, guide)
    await location_hub.publish({"type": "assist_asked", "data": s.assist_log(log)})
    return card


@router.post("/api/assist/ask")
async def assist_ask(
    request: Request,
    duration_ms: int | None = Query(None, ge=0, le=120_000),
    worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    """Raw audio body (Content-Type: audio/*) taken from the already-running stream mic."""
    mime = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not _MIME_RE.match(mime):
        raise HTTPException(415, detail={"code": "UNSUPPORTED_MEDIA", "message": "오디오 형식이 아닙니다."})
    audio = await request.body()
    if not audio or len(audio) > config.MAX_CLIP_BYTES:
        raise HTTPException(400, detail={"code": "BAD_AUDIO", "message": "질문 음성을 받지 못했습니다."})

    assignment, loc, guide = _context(db, worker)
    folder = config.ASSIST_AUDIO_DIR / worker.id
    folder.mkdir(parents=True, exist_ok=True)
    audio_path = folder / f"Q-{utcnow().strftime('%Y%m%d%H%M%S%f')}.{'wav' if 'wav' in mime else 'webm'}"
    audio_path.write_bytes(audio)

    context = {
        "작업자": f"{worker.name} ({worker.team} {worker.role})",
        "현재 구역": loc.zone.name if loc else "미등록",
        "배정 작업": assignment.title if assignment else None,
        "지침": guide,
    }
    try:
        result = await answer_voice(audio, mime, context)
        source = "ai"
        question = result.pop("transcript") or None
    except AssistUnavailable:
        result = {
            "headline": "지금은 음성 질문에 답할 수 없어요.",
            "details": ["잠시 후 다시 물어보거나 담당자에게 확인하세요", "질문 음성은 저장되어 담당자가 들을 수 있어요"],
            "needs_supervisor": True,
        }
        source = "fallback"
        question = None
    log = _save(db, worker, assignment, loc, "voice", result, source, question, str(audio_path))
    card = _card(log, guide)
    await location_hub.publish({"type": "assist_asked", "data": s.assist_log(log)})
    return card


@router.post("/api/assist/{log_id}/escalate")
async def assist_escalate(log_id: int, worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    log = db.get(AssistLog, log_id)
    if log is None or log.worker_id != worker.id:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "질문을 찾을 수 없습니다."})
    if log.escalated_at is None:
        log.escalated_at = utcnow()
        db.commit()
    guide = guide_for(log.assignment_title)
    await location_hub.publish({"type": "assist_escalated", "data": s.assist_log(log)})
    return {"ok": True, "owner": guide["owner"] if guide else None}


@router.get("/api/admin/assist", dependencies=[Depends(require_admin)])
def admin_assist(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(AssistLog).order_by(AssistLog.created_at.desc(), AssistLog.id.desc()).limit(limit)).all()
    return {"items": [s.assist_log(r) for r in rows]}
