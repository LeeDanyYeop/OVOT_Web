"""기존 ovot_db 테이블에 매핑하는 SQLAlchemy ORM 모델.

중요: 이 파일은 DB 스키마를 '생성'하지 않는다 (Base.metadata.create_all 호출 금지).
테이블은 이미 존재하며, 구조 변경은 migrations/*.sql 로만 수행한다.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Integer, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Task(Base):
    __tablename__ = "tasks"

    task_id: Mapped[str] = mapped_column(String(30), primary_key=True)
    block_id: Mapped[str] = mapped_column(String(30), nullable=False)
    zone_id: Mapped[str] = mapped_column(String(30), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # server_default 를 명시해야 INSERT 시 값을 안 보내 DB의 DEFAULT NOW() 가
    # 적용된다. 명시하지 않으면 SQLAlchemy 가 명시적으로 NULL 을 보내 DB 기본값을
    # 덮어써 버린다 (실제로 재현/확인한 버그).
    updated_at: Mapped[dt.datetime | None] = mapped_column(nullable=True, server_default=func.now())


class VoiceRecord(Base):
    __tablename__ = "voice_records"

    voice_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    worker_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    zone_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    block_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[dt.datetime | None] = mapped_column(nullable=True, server_default=func.now())


class EventCategory(Base):
    __tablename__ = "event_categories"

    category_code: Mapped[str] = mapped_column(String(50), primary_key=True)
    category_name: Mapped[str] = mapped_column(String(50), nullable=False)


class EventType(Base):
    __tablename__ = "event_types"

    event_type: Mapped[str] = mapped_column(String(50), primary_key=True)
    category_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("event_categories.category_code"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)


class SpeechType(Base):
    __tablename__ = "speech_types"

    speech_type: Mapped[str] = mapped_column(String(30), primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class Event(Base):
    __tablename__ = "events"

    event_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    voice_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("voice_records.voice_id"), nullable=False
    )
    task_id: Mapped[str | None] = mapped_column(
        String(30), ForeignKey("tasks.task_id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_status: Mapped[str] = mapped_column(String(30), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime | None] = mapped_column(nullable=True, server_default=func.now())
    speech_type: Mapped[str | None] = mapped_column(
        String(30), ForeignKey("speech_types.speech_type"), nullable=True
    )


class Handoff(Base):
    __tablename__ = "handoffs"

    handoff_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[str] = mapped_column(String(30), ForeignKey("tasks.task_id"), nullable=False)
    from_zone_id: Mapped[str] = mapped_column(String(30), nullable=False)
    to_zone_id: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    # DB 상 NOT NULL DEFAULT NOW(). server_default 를 선언해야 INSERT 시 값을
    # 비워 보내고 DB 기본값이 적용된다.
    requested_at: Mapped[dt.datetime] = mapped_column(nullable=False, server_default=func.now())
    accepted_at: Mapped[dt.datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[dt.datetime | None] = mapped_column(nullable=True)


class AudioProcessing(Base):
    """AI 음성 처리 이력 (migrations/007). 처리 1회 = 1행, 재처리 시 새 행.

    voice_id 는 COMPLETED 일 때만 채워진다 (voice_records.transcript 가 NOT NULL 이므로
    실패/무음 결과는 voice_records 에 넣지 않고 이 테이블에만 남긴다).
    """

    __tablename__ = "audio_processing"

    processing_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    voice_id: Mapped[str | None] = mapped_column(
        String(50), ForeignKey("voice_records.voice_id"), nullable=True
    )
    worker_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    zone_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    block_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    task_id: Mapped[str | None] = mapped_column(
        String(30), ForeignKey("tasks.task_id"), nullable=True
    )
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_audio_path: Mapped[str] = mapped_column(String(500), nullable=False)
    enhanced_audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audio_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sample_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    channels: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    denoise_mode: Mapped[str] = mapped_column(String(10), nullable=False, server_default="auto")
    estimated_snr_db: Mapped[float | None] = mapped_column(Float, nullable=True)
    noise_level: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    denoise_applied: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    denoise_model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stt_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device: Mapped[str | None] = mapped_column(String(50), nullable=True)
    processing_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="PENDING"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[dt.datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[dt.datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(nullable=False, server_default=func.now())
