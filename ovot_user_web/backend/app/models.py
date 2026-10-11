"""Persistence model.

location_events is append-only: every check-in is stored as an event and never
updated or deleted. worker_current_locations is a projection that only points at
the latest event per worker.
"""

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # W-001
    employee_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # 작업자, 반장, 안전관리자
    team: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # ZONE-A
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    risk_level: Mapped[str] = mapped_column(String(16), default="low", nullable=False)  # low/medium/high
    is_work_area: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class NfcTag(Base):
    __tablename__ = "nfc_tags"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # TAG-A-001
    # Opaque code written on the tag. Never contains personal data.
    tag_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), nullable=False)
    label: Mapped[str | None] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    installed_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    zone: Mapped[Zone] = relationship()


class WorkAssignment(Base):
    """Minimal stand-in for future work_instruction events / MES integration."""

    __tablename__ = "work_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False, index=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="assigned", nullable=False)  # assigned/in_progress/done
    assigned_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class LocationEvent(Base):
    __tablename__ = "location_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str | None] = mapped_column(String(48), unique=True)  # EVT-LOCATION-000001
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), nullable=False)
    previous_zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id"))
    tag_id: Mapped[str | None] = mapped_column(ForeignKey("nfc_tags.id"))
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # nfc / qr / manual / seed
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)  # server clock
    client_reported_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # reference only
    device_id: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(256))

    worker: Mapped[Worker] = relationship()
    zone: Mapped[Zone] = relationship(foreign_keys=[zone_id])
    previous_zone: Mapped[Zone | None] = relationship(foreign_keys=[previous_zone_id])
    tag: Mapped[NfcTag | None] = relationship()

    __table_args__ = (Index("ix_location_events_worker_time", "worker_id", "occurred_at"),)


class WorkerCurrentLocation(Base):
    __tablename__ = "worker_current_locations"

    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), primary_key=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    source_event_id: Mapped[int] = mapped_column(ForeignKey("location_events.id"), nullable=False)

    zone: Mapped[Zone] = relationship()
    source_event: Mapped[LocationEvent] = relationship()


class TagScanFailure(Base):
    """Rejected scans (unknown / inactive / malformed tag codes) for the admin warning panel."""

    __tablename__ = "tag_scan_failures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False)
    raw_tag_code: Mapped[str] = mapped_column(String(64), nullable=False)
    tag_id: Mapped[str | None] = mapped_column(ForeignKey("nfc_tags.id"))
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(256))

    worker: Mapped[Worker] = relationship()


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    worker: Mapped[Worker] = relationship()


class VoiceClip(Base):
    """Raw field audio segment, tied to who recorded it and where. STT/structuring comes later."""

    __tablename__ = "voice_clips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clip_id: Mapped[str | None] = mapped_column(String(48), unique=True)  # VOICE-000001
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False, index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id"))
    location_event_id: Mapped[int | None] = mapped_column(ForeignKey("location_events.id"))
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    client_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # reference only
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    file_path: Mapped[str] = mapped_column(String(256), nullable=False)

    worker: Mapped[Worker] = relationship()
    zone: Mapped[Zone | None] = relationship()


class AssistLog(Base):
    """'오봇에게 물어보기' question/answer, kept with the worker's context at that moment."""

    __tablename__ = "assist_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), nullable=False, index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id"))
    assignment_title: Mapped[str | None] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # next / tools / cautions / voice
    question: Mapped[str | None] = mapped_column(Text)  # transcript for voice questions
    answer_json: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # guide / ai / fallback
    escalated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    audio_path: Mapped[str | None] = mapped_column(String(256))

    worker: Mapped[Worker] = relationship()
    zone: Mapped[Zone | None] = relationship()
