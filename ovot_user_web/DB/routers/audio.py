"""AI 음성 처리 API — WAV 업로드 → CRN 노이즈 제거 → 추정 SNR/노이즈 단계 → Whisper → DB 저장.

동일 서버 안에서 HTTP 로 자기 자신(/voice-records)을 호출하지 않고, DB 세션으로 직접
voice_records 와 audio_processing 을 저장한다.

저장 일관성:
  1) 원본 WAV 저장 → audio_processing(PENDING) INSERT  (INSERT 실패 시 원본 파일 삭제)
  2) 추론 슬롯 획득 → PROCESSING
  3) 추론 → 정제 WAV 저장
  4) voice_records INSERT + audio_processing COMPLETED 를 **한 트랜잭션**으로 커밋
  실패 시: 정제 파일 삭제, 행은 FAILED + error_message (원본은 재처리용으로 보존)
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import time
from enum import Enum

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ai import pipeline
from ai.model_manager import get_ai_models
from ai.storage import ENHANCED, ORIGINAL, AudioStorage
from config import get_settings
from constants import AUDIO_PROCESSING_STATUSES
from database import get_db
from models import AudioProcessing, Task, VoiceRecord
from routers.voice_records import _generate_voice_id
from schemas import AIStatusOut, AudioProcessingOut

router = APIRouter(prefix="/audio", tags=["audio"])
logger = logging.getLogger("ovot.audio")

_storage: AudioStorage | None = None


def get_storage() -> AudioStorage:
    global _storage
    if _storage is None:
        _storage = AudioStorage(get_settings().audio_storage_dir)
    return _storage


class DenoiseMode(str, Enum):
    auto = "auto"
    on = "on"
    off = "off"


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _blank_to_none(v: str | None) -> str | None:
    """Swagger 폼에서 빈 문자열이 넘어오는 경우를 None 으로 정리."""
    if v is None:
        return None
    v = v.strip()
    return v or None


def _to_out(proc: AudioProcessing, transcript: str | None) -> AudioProcessingOut:
    out = AudioProcessingOut.model_validate(proc)
    out.transcript = transcript
    base = f"/audio/results/{proc.processing_id}"
    out.original_audio_url = f"{base}/original" if proc.original_audio_path else None
    out.enhanced_audio_url = f"{base}/enhanced" if proc.enhanced_audio_path else None
    return out


def _read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    """크기 제한을 넘으면 끝까지 읽지 않고 413."""
    buf = bytearray()
    while chunk := upload.file.read(1 << 20):
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                f"파일이 너무 큽니다 (최대 {max_bytes // (1024 * 1024)}MB).",
            )
    return bytes(buf)


def _mark_failed(db: Session, processing_id: int, message: str, started: float | None) -> None:
    db.rollback()
    proc = db.get(AudioProcessing, processing_id)
    if proc is None:
        return
    proc.processing_status = "FAILED"
    proc.error_message = message[:2000]
    proc.voice_id = None
    proc.enhanced_audio_path = None
    proc.completed_at = _now()
    if started is not None:
        proc.processing_ms = int((time.perf_counter() - started) * 1000)
    db.commit()


# ──────────────────────── 상태 ────────────────────────


@router.get("/status", response_model=AIStatusOut)
def ai_status() -> AIStatusOut:
    """AI 모델 로딩 상태 (CRN 장치, 체크포인트 버전, Whisper 모델 등)."""
    return AIStatusOut(ai_enabled=get_settings().ai_enabled, **get_ai_models().info())


# ──────────────────────── 처리 ────────────────────────


@router.post(
    "/process",
    response_model=AudioProcessingOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "task_id 없음"},
        413: {"description": "파일 크기/길이 초과"},
        415: {"description": "WAV 아님"},
        422: {"description": "손상/16kHz 아님/빈 오디오/입력값 오류"},
        500: {"description": "AI 처리 실패 (FAILED 이력 저장됨)"},
        503: {"description": "AI 모델 미로딩 또는 추론 대기 시간 초과"},
    },
)
def process_audio(
    audio_file: UploadFile = File(..., description="16kHz WAV (mono/stereo)"),
    worker_id: str | None = Form(default=None, max_length=30),
    zone_id: str | None = Form(default=None, max_length=30),
    block_id: str | None = Form(default=None, max_length=30),
    task_id: str | None = Form(default=None, max_length=30, description="tasks 에 존재하는 값"),
    denoise_mode: DenoiseMode = Form(
        default=DenoiseMode.auto, description="auto: 4·5단계만 노이즈 제거 / on: 항상 / off: 안 함"
    ),
    db: Session = Depends(get_db),
) -> AudioProcessingOut:
    """WAV 업로드 → 노이즈 분석/제거 → Whisper 한국어 전사 → voice_records + audio_processing 저장."""
    settings = get_settings()
    worker_id, zone_id, block_id, task_id = map(_blank_to_none, (worker_id, zone_id, block_id, task_id))

    if not settings.ai_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI 처리가 비활성화되어 있습니다 (AI_ENABLED=false).")

    # ── 입력 검증 (DB 행/파일을 만들기 전에) ──
    filename = (audio_file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1][:255]
    if not filename.lower().endswith(".wav"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "WAV(.wav) 파일만 업로드할 수 있습니다.")
    if task_id is not None and db.get(Task, task_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"작업을 찾을 수 없습니다: {task_id}")

    data = _read_upload(audio_file, settings.audio_max_upload_mb * 1024 * 1024)
    try:
        y, info = pipeline.load_wav(
            data, min_sec=settings.audio_min_duration_sec, max_sec=settings.audio_max_duration_sec
        )
    except pipeline.AudioValidationError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    models = get_ai_models()
    if not models.ensure_loaded(settings):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"AI 모델이 로딩되지 않았습니다: {models.load_error}"
        )

    # ── [3] 원본 저장 + PENDING 행 ──
    storage = get_storage()
    original_rel = storage.new_relpath(ORIGINAL)
    storage.write_bytes(original_rel, data)
    proc = AudioProcessing(
        worker_id=worker_id,
        zone_id=zone_id,
        block_id=block_id,
        task_id=task_id,
        original_filename=filename,
        original_audio_path=original_rel,
        audio_sha256=hashlib.sha256(data).hexdigest(),
        file_size_bytes=len(data),
        sample_rate=info.sample_rate,
        channels=info.channels,
        duration_sec=info.duration_sec,
        denoise_mode=denoise_mode.value,
        denoise_model_version=models.denoise_model_version,
        stt_model=models.stt_model_name,
        device=f"crn={models.device},stt={models.stt_device}",
        processing_status="PENDING",
    )
    try:
        db.add(proc)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(original_rel)
        raise
    pid = proc.processing_id

    # ── 추론 슬롯 (동시 실행 제한) ──
    if not models.acquire(settings.ai_queue_timeout_sec):
        _mark_failed(db, pid, "서버가 다른 음성을 처리 중이라 대기 시간을 초과했습니다.", None)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"AI 처리 대기 시간 초과 (processing_id={pid}). 잠시 후 다시 시도하세요.",
        )

    started = time.perf_counter()
    enhanced_rel: str | None = None
    try:
        proc.processing_status = "PROCESSING"
        proc.started_at = _now()
        db.commit()

        # ── [4]~[8] CRN → SNR → 단계 → 음성 선택 → Whisper ──
        result = pipeline.run_pipeline(models, y, denoise_mode.value)

        enhanced_rel = storage.new_relpath(ENHANCED)
        storage.write_wav(enhanced_rel, result.enhanced, info.sample_rate)

        # ── [10] voice_records + audio_processing 을 한 트랜잭션으로 ──
        transcript = result.transcript
        for attempt in range(3):  # voice_id 자동 생성 충돌 시 재시도 (voice_records 라우터와 동일 정책)
            proc = db.get(AudioProcessing, pid)
            proc.estimated_snr_db = result.estimated_snr_db
            proc.noise_level = result.noise_level
            proc.denoise_applied = result.denoise_applied
            proc.enhanced_audio_path = enhanced_rel
            proc.completed_at = _now()
            proc.processing_ms = int((time.perf_counter() - started) * 1000)
            if transcript:
                voice = VoiceRecord(
                    voice_id=_generate_voice_id(db),
                    worker_id=worker_id,
                    zone_id=zone_id,
                    block_id=block_id,
                    task_id=task_id,
                    transcript=transcript,
                )
                db.add(voice)
                try:
                    db.flush()  # FK 순서 보장: voice_records 먼저 INSERT
                except IntegrityError:
                    db.rollback()
                    if attempt == 2:
                        raise
                    continue
                proc.voice_id = voice.voice_id
                proc.processing_status = "COMPLETED"
                proc.error_message = None
            else:
                proc.processing_status = "NO_SPEECH"
                proc.error_message = "인식된 말이 없어 voice_records 에 저장하지 않았습니다."
            db.commit()
            break
    except Exception as exc:  # noqa: BLE001 - 어떤 오류든 FAILED 이력으로 남긴다
        logger.exception("audio processing failed (processing_id=%s)", pid)
        storage.delete(enhanced_rel)
        _mark_failed(db, pid, f"{type(exc).__name__}: {exc}", started)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"AI 처리 중 오류가 발생했습니다 (processing_id={pid}): {type(exc).__name__}",
        ) from exc
    finally:
        models.release()

    db.refresh(proc)
    return _to_out(proc, transcript or None)


# ──────────────────────── 조회 ────────────────────────


@router.get("/results", response_model=list[AudioProcessingOut])
def list_results(
    db: Session = Depends(get_db),
    processing_status: str | None = Query(default=None, description=", ".join(sorted(AUDIO_PROCESSING_STATUSES))),
    voice_id: str | None = Query(default=None),
    task_id: str | None = Query(default=None),
    worker_id: str | None = Query(default=None),
    zone_id: str | None = Query(default=None),
    audio_sha256: str | None = Query(default=None, description="같은 파일의 재처리 이력 조회"),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[AudioProcessingOut]:
    """AI 처리 결과 목록 (최신순). 선택적 필터링."""
    stmt = select(AudioProcessing, VoiceRecord.transcript).outerjoin(
        VoiceRecord, VoiceRecord.voice_id == AudioProcessing.voice_id
    )
    if processing_status:
        stmt = stmt.where(AudioProcessing.processing_status == processing_status.strip().upper())
    if voice_id:
        stmt = stmt.where(AudioProcessing.voice_id == voice_id)
    if task_id:
        stmt = stmt.where(AudioProcessing.task_id == task_id)
    if worker_id:
        stmt = stmt.where(AudioProcessing.worker_id == worker_id)
    if zone_id:
        stmt = stmt.where(AudioProcessing.zone_id == zone_id)
    if audio_sha256:
        stmt = stmt.where(AudioProcessing.audio_sha256 == audio_sha256.lower())
    stmt = stmt.order_by(AudioProcessing.processing_id.desc()).limit(limit)
    return [_to_out(p, t) for p, t in db.execute(stmt).all()]


def _get_proc(db: Session, processing_id: int) -> AudioProcessing:
    proc = db.get(AudioProcessing, processing_id)
    if proc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"처리 결과를 찾을 수 없습니다: {processing_id}")
    return proc


@router.get("/results/{processing_id}", response_model=AudioProcessingOut)
def get_result(processing_id: int, db: Session = Depends(get_db)) -> AudioProcessingOut:
    proc = _get_proc(db, processing_id)
    transcript = None
    if proc.voice_id:
        voice = db.get(VoiceRecord, proc.voice_id)
        transcript = voice.transcript if voice else None
    return _to_out(proc, transcript)


def _file_response(rel: str | None, download_name: str, label: str) -> FileResponse:
    """DB 에 저장된 상대경로만 사용 + 저장소 루트 밖 경로 차단 (임의 파일 다운로드 방지)."""
    if not rel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} 오디오가 없습니다.")
    try:
        path = get_storage().resolve(rel)
    except PermissionError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} 오디오 파일이 저장소에 없습니다.")
    return FileResponse(path, media_type="audio/wav", filename=download_name)


@router.get("/results/{processing_id}/original", response_class=FileResponse)
def get_original_audio(processing_id: int, db: Session = Depends(get_db)) -> FileResponse:
    proc = _get_proc(db, processing_id)
    return _file_response(proc.original_audio_path, f"{processing_id}_original.wav", "원본")


@router.get("/results/{processing_id}/enhanced", response_class=FileResponse)
def get_enhanced_audio(processing_id: int, db: Session = Depends(get_db)) -> FileResponse:
    proc = _get_proc(db, processing_id)
    return _file_response(proc.enhanced_audio_path, f"{processing_id}_enhanced.wav", "노이즈 제거")
