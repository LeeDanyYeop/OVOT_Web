"""pytest 공통 설정.

이 테스트는 실제 ovot_db(개발 DB)에 대해 동작하는 통합 테스트다. 각 테스트는
자신이 만든 행만 생성/삭제하며, 기존 시드 데이터(T-001~003, V-001, event 1,
event_types 25개, speech_types 5개)는 절대 지우거나 수정하지 않는다.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from database import SessionLocal
from main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
