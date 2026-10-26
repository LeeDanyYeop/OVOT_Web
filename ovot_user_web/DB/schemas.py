"""Pydantic 요청/응답 스키마. API 입력값은 전부 여기서 검증한다."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, field_validator

from constants import HANDOFF_STATUSES, TASK_STATUSES

# ──────────────────────────── 공통 ────────────────────────────


class ErrorResponse(BaseModel):
    """모든 에러 응답이 따르는 공통 형식."""

    error: bool = True
    status_code: int
    message: str


# ──────────────────────────── tasks ────────────────────────────


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: str
    block_id: str
    zone_id: str
    task_type: str
    status: str
    updated_at: dt.datetime | None = None


class TaskStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=30, examples=["IN_PROGRESS"])

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in TASK_STATUSES:
            allowed = ", ".join(sorted(TASK_STATUSES))
            raise ValueError(f"status 는 다음 중 하나여야 합니다: {allowed}")
        return v


# ──────────────────────────── voice_records ────────────────────────────


class VoiceRecordCreate(BaseModel):
    voice_id: str | None = Field(
        default=None,
        max_length=50,
        description="생략하면 서버가 자동 생성한다 (V-NNN 형식).",
    )
    worker_id: str | None = Field(default=None, max_length=30)
    zone_id: str | None = Field(default=None, max_length=30)
    block_id: str | None = Field(default=None, max_length=30)
    task_id: str | None = Field(default=None, max_length=30)
    transcript: str = Field(..., min_length=1, description="STT 전사 결과 원문")


class VoiceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    voice_id: str
    worker_id: str | None = None
    zone_id: str | None = None
    block_id: str | None = None
    task_id: str | None = None
    transcript: str
    recorded_at: dt.datetime | None = None


# ──────────────────────────── events ────────────────────────────


class EventCreate(BaseModel):
    """AI Agent 가 전송하는 이벤트 분석 결과. 섹션 7 규격과 1:1 대응."""

    voice_id: str = Field(..., max_length=50)
    task_id: str | None = Field(default=None, max_length=30)
    speech_type: str = Field(..., max_length=30, description="speech_types 에 등록된 코드")
    event_type: str = Field(..., max_length=50, description="event_types 에 등록된 코드")
    summary: str | None = Field(default=None)
    requires_confirmation: bool = Field(
        default=False, description="모호하여 사람 확인이 필요하면 true"
    )


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: int
    voice_id: str
    task_id: str | None = None
    event_type: str
    event_status: str
    speech_type: str | None = None
    summary: str | None = None
    created_at: dt.datetime | None = None


class EventStatusUpdate(BaseModel):
    """이벤트 처리 상태(확인/반려 등) 변경. 이벤트 종류와는 별개 개념."""

    event_status: str = Field(..., examples=["CONFIRMED"])

    @field_validator("event_status")
    @classmethod
    def _check(cls, v: str) -> str:
        from constants import EVENT_PROCESSING_STATUSES

        v = v.strip().upper()
        if v not in EVENT_PROCESSING_STATUSES:
            allowed = ", ".join(sorted(EVENT_PROCESSING_STATUSES))
            raise ValueError(f"event_status 는 다음 중 하나여야 합니다: {allowed}")
        return v


class EventTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_type: str
    category_code: str
    description: str


class SpeechTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    speech_type: str
    description: str


# ──────────────────────────── handoffs ────────────────────────────


class HandoffCreate(BaseModel):
    task_id: str = Field(..., max_length=30)
    from_zone_id: str = Field(..., max_length=30)
    to_zone_id: str = Field(..., max_length=30)

    @field_validator("to_zone_id")
    @classmethod
    def _zones_differ(cls, v: str, info):
        from_zone = info.data.get("from_zone_id")
        if from_zone is not None and v == from_zone:
            raise ValueError("from_zone_id 와 to_zone_id 는 달라야 합니다")
        return v


class HandoffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    handoff_id: int
    task_id: str
    from_zone_id: str
    to_zone_id: str
    status: str
    requested_at: dt.datetime | None = None
    accepted_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None


class HandoffStatusUpdate(BaseModel):
    status: str = Field(..., examples=["ACCEPTED"])

    @field_validator("status")
    @classmethod
    def _check(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in HANDOFF_STATUSES:
            allowed = ", ".join(sorted(HANDOFF_STATUSES))
            raise ValueError(f"status 는 다음 중 하나여야 합니다: {allowed}")
        return v


# ──────────────────────────── health ────────────────────────────


class HealthOut(BaseModel):
    status: str = "ok"


class HealthDbOut(BaseModel):
    status: str
    database: str | None = None
    user: str | None = None
    version: str | None = None
    detail: str | None = None


# ──────────────────────────── audio (AI 처리) ────────────────────────────


class AudioProcessingOut(BaseModel):
    """AI 음성 처리 결과. transcript 는 연결된 voice_records.transcript 이다."""

    model_config = ConfigDict(from_attributes=True)

    processing_id: int
    voice_id: str | None = None
    worker_id: str | None = None
    zone_id: str | None = None
    block_id: str | None = None
    task_id: str | None = None
    transcript: str | None = None
    processing_status: str
    error_message: str | None = None
    estimated_snr_db: float | None = Field(
        default=None, description="AI 모델이 분리한 목소리/노이즈 에너지비로 계산한 추정값 (정답 기반 측정 아님)"
    )
    noise_level: int | None = Field(default=None, description="1(조용) ~ 5(매우 시끄러움)")
    denoise_mode: str
    denoise_applied: bool | None = None
    original_filename: str | None = None
    original_audio_url: str | None = None
    enhanced_audio_url: str | None = None
    audio_sha256: str
    file_size_bytes: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    duration_sec: float | None = None
    denoise_model_version: str | None = None
    stt_model: str | None = None
    device: str | None = None
    processing_ms: int | None = None
    started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None
    created_at: dt.datetime | None = None


class AIStatusOut(BaseModel):
    ai_enabled: bool
    ready: bool
    load_attempted: bool
    load_error: str | None = None
    load_seconds: float | None = None
    torch_device: str | None = None
    denoise_model_version: str | None = None
    denoiser_params: int | None = None
    stt_model: str | None = None
    stt_device: str | None = None
    stt_compute_type: str | None = None
