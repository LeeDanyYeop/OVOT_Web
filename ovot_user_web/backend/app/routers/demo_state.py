"""Shared B-03 demo state (decisions made in the admin console, acknowledgement made on the worker phone).

Demo-only: gated by OVOT_DEMO_MODE. The payload is stored as opaque JSON; the clients own its shape.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import DemoState
from ..timeutil import utcnow

router = APIRouter(prefix="/api/demo", tags=["demo"])

_KEY = "b03"


def _require_demo() -> None:
    if not config.DEMO_MODE:
        raise HTTPException(status_code=404, detail={"code": "DEMO_DISABLED", "message": "시연 모드가 꺼져 있습니다."})


class StateBody(BaseModel):
    state: dict


@router.get("/state")
def get_state(db: Session = Depends(get_db)):
    _require_demo()
    row = db.get(DemoState, _KEY)
    if row is None:
        return {"rev": 0, "state": None}
    return {"rev": row.rev, "state": json.loads(row.value_json)}


@router.put("/state")
def put_state(body: StateBody, db: Session = Depends(get_db)):
    _require_demo()
    row = db.get(DemoState, _KEY)
    if row is None:
        row = DemoState(key=_KEY, value_json="{}", rev=0, updated_at=utcnow())
        db.add(row)
    row.value_json = json.dumps(body.state, ensure_ascii=False)
    row.rev += 1
    row.updated_at = utcnow()
    db.commit()
    return {"rev": row.rev}
