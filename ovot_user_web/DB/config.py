"""환경변수 기반 설정. 비밀번호 등 접속 정보는 .env 에서만 읽는다."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "ovot_db"
    postgres_user: str = "postgres"
    postgres_password: str = Field(default="", repr=False)

    # CORS — 쉼표 구분 문자열. 와일드카드는 쓰지 않는다.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # 서버
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_env: str = "development"

    # AI (CRN 노이즈 제거 + Whisper). 기본값은 원본 ai/stt_to_backend.py 설정과 동일.
    ai_enabled: bool = True
    ai_preload: bool = True              # True: 서버 기동 시 로딩 / False: 첫 요청 시 로딩
    ai_device: str = "auto"              # CRN 실행 장치: auto | cuda | cpu
    denoiser_checkpoint: Path = ROOT / "ai" / "denoiser.pt"
    whisper_model: str = "medium"
    whisper_device: str = "cpu"          # cuda 사용 시 cuDNN/cuBLAS DLL 필요
    whisper_compute_type: str | None = None  # 미지정 시 cpu=int8, cuda=float16
    ai_max_concurrent: int = 1           # 동시에 실행할 추론 수
    ai_queue_timeout_sec: float = 300.0  # 추론 대기 최대 시간 (초과 시 503)

    # 오디오 업로드 / 저장
    audio_storage_dir: Path = ROOT / "audio_storage"
    audio_max_upload_mb: int = 50
    audio_max_duration_sec: float = 600.0
    audio_min_duration_sec: float = 0.5

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        from urllib.parse import quote_plus

        return (
            f"postgresql+psycopg://{quote_plus(self.postgres_user)}:"
            f"{quote_plus(self.postgres_password)}@"
            f"{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
