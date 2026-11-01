"""학교 PC(분류 FastAPI)가 나가는 HTTPS 로 근무 중 녹음을 가져가는 경로.

학교망은 바깥에서 접속할 수 없으므로 이 서버가 보내지 않고, 학교 PC 가 주기적으로 가져간다.
Bearer OVOT_PULL_TOKEN 이 있어야 하며, 값이 비어 있으면 503 (토큰 없이 열리지 않게).
"""

import hmac
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import VoiceClip
from ..timeutil import to_kst_iso

router = APIRouter(prefix="/api/pull", tags=["pull"])


def require_pull_token(authorization: str | None = Header(None)) -> None:
    if not config.PULL_TOKEN:
        raise HTTPException(503, detail={"code": "PULL_DISABLED", "message": "OVOT_PULL_TOKEN 이 설정되지 않았습니다."})
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(), config.PULL_TOKEN.encode()):
        raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "유효한 토큰이 필요합니다."})


@router.get("/voice/clips", dependencies=[Depends(require_pull_token)])
def pull_clips(after_id: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """after_id 보다 뒤에 들어온 녹음을 오래된 순서로. 학교 PC 는 마지막으로 처리한 id 를 기억해 두고 다음에 넘긴다."""
    rows = db.scalars(select(VoiceClip).where(VoiceClip.id > after_id).order_by(VoiceClip.id).limit(limit)).all()
    return {
        "items": [
            {
                "id": c.id,
                "clip_id": c.clip_id,
                "worker_id": c.worker_id,
                "worker_name": c.worker.name if c.worker else None,
                "zone_id": c.zone_id,
                "block_id": config.ZONE_BLOCKS.get(c.zone_id or ""),
                "mime_type": c.mime_type,
                "size_bytes": c.size_bytes,
                "duration_ms": c.duration_ms,
                "client_started_at": to_kst_iso(c.client_started_at),
                "received_at": to_kst_iso(c.received_at),
            }
            for c in rows
        ]
    }


@router.get("/voice/clips/{clip_id}/audio", dependencies=[Depends(require_pull_token)])
def pull_clip_audio(clip_id: str, db: Session = Depends(get_db)):
    clip = db.scalar(select(VoiceClip).where(VoiceClip.clip_id == clip_id))
    if clip is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "녹음을 찾을 수 없습니다."})
    if not Path(clip.file_path).is_file():
        # 무료 서버는 재시작하면 파일이 지워진다 — 기록만 남고 파일이 없는 경우
        raise HTTPException(410, detail={"code": "GONE", "message": "서버 재시작으로 녹음 파일이 사라졌습니다."})
    return FileResponse(clip.file_path, media_type=clip.mime_type)
