import os
import sys
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp(prefix="ovot-test-"))
os.environ["OVOT_DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["OVOT_FRONTEND_DIST"] = str(_tmp / "no-dist")
os.environ["OVOT_AUDIO_DIR"] = str(_tmp / "audio")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import init_db, seed  # noqa: E402


@pytest.fixture()
def client():
    init_db(reset=True)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c


def login(client: TestClient, employee_number: str, password: str = "ovot1234") -> dict:
    res = client.post("/api/login", json={"employee_number": employee_number, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}
