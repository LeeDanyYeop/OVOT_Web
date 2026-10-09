import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from .. import serializers as s
from ..db import get_db
from ..deps import get_current_worker, require_admin
from ..models import LocationEvent, VoiceClip, Worker, WorkerCurrentLocation
from ..services.event_hub import location_hub
from ..timeutil import utcnow

router = APIRouter(tags=["voice"])

_MIME_RE = re.compile(r"^audio/[a-z0-9.+-]+$")
_EXT = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}


@router.post("/api/voice/clips")
async def upload_clip(
    request: Request,
    duration_ms: int | None = Query(None, ge=0, le=10 * 60 * 1000),
    started_at: datetime | None = Query(None),
    location_event_id: str | None = Query(None, max_length=48),
    worker: Worker = Depends(get_current_worker),
    db: Session = Depends(get_db),
):
    """Raw audio body (Content-Type: audio/*). Worker and zone come from the session and
    the server-side current location, not from the client."""
    mime = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not _MIME_RE.match(mime):
        raise HTTPException(415, detail={"code": "UNSUPPORTED_MEDIA", "message": "오디오 형식이 아닙니다."})
    body = await request.body()
    if not body:
        raise HTTPException(400, detail={"code": "EMPTY_CLIP", "message": "빈 녹음입니다."})
    if len(body) > config.MAX_CLIP_BYTES:
        raise HTTPException(413, detail={"code": "CLIP_TOO_LARGE", "message": "녹음 파일이 너무 큽니다."})

    # Attribute the clip to the check-in it was recorded under. The event must belong to
    # this worker, so a client cannot attach audio to someone else's location.
    event = None
    if location_event_id:
        event = db.scalar(
            select(LocationEvent).where(LocationEvent.event_id == location_event_id, LocationEvent.worker_id == worker.id)
        )
    if event is None:
        loc = db.get(WorkerCurrentLocation, worker.id)
        event = loc.source_event if loc else None
    if started_at is not None and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    clip = VoiceClip(
        worker_id=worker.id,
        zone_id=event.zone_id if event else None,
        location_event_id=event.id if event else None,
        mime_type=mime,
        size_bytes=len(body),
        duration_ms=duration_ms,
        client_started_at=started_at,
        received_at=utcnow(),
        file_path="",
    )
    db.add(clip)
    db.flush()
    clip.clip_id = f"VOICE-{clip.id:06d}"
    folder = config.AUDIO_DIR / worker.id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{clip.clip_id}.{_EXT.get(mime, 'bin')}"
    path.write_bytes(body)
    clip.file_path = str(path)
    db.commit()
    db.refresh(clip)

    data = s.voice_clip(clip)
    await location_hub.publish({"type": "voice_clip_recorded", "data": data})
    return data


@router.get("/api/admin/voice/clips", dependencies=[Depends(require_admin)])
def list_clips(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(VoiceClip).order_by(VoiceClip.received_at.desc(), VoiceClip.id.desc()).limit(limit)).all()
    return {"items": [s.voice_clip(c) for c in rows]}


@router.get("/api/admin/voice/clips/{clip_id}/audio", dependencies=[Depends(require_admin)])
def clip_audio(clip_id: str, db: Session = Depends(get_db)):
    clip = db.scalar(select(VoiceClip).where(VoiceClip.clip_id == clip_id))
    if clip is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "녹음을 찾을 수 없습니다."})
    return FileResponse(clip.file_path, media_type=clip.mime_type)
