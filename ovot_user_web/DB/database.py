"""SQLAlchemy 엔진 / 세션. 기존 ovot_db 에 접속만 하며 스키마를 생성하지 않는다."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # 끊어진 커넥션 자동 감지
    pool_size=5,
    max_overflow=10,
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """기존 테이블에 매핑하기 위한 선언적 베이스.

    주의: Base.metadata.create_all() 을 호출하지 않는다.
    테이블은 이미 DB 에 존재하며 마이그레이션은 migrations/*.sql 로 관리한다.
    """


def get_db() -> Generator[Session, None, None]:
    """FastAPI 의존성. 요청 단위 세션을 열고 끝나면 반드시 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping() -> dict[str, object]:
    """DB 연결 확인용. 실패 시 예외를 그대로 올린다."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT current_database() AS db, current_user AS usr, version() AS version")
        ).mappings().one()
    return dict(row)
