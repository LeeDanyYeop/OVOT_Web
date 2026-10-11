from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import serializers as s
from ..db import get_db
from ..deps import get_current_worker
from ..models import Worker
from ..services.event_hub import location_hub
from ..services.workday import EVENT_CHECKED_OUT, brief, check_out, day_facts, handover_brief, handover_facts, stats
from ..timeutil import utcnow

router = APIRouter(prefix="/api/workday", tags=["workday"])


@router.post("/end")
async def end_workday(worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    """퇴근하기: record the check-out, then return the day's summary and the next tasks."""
    now = utcnow()
    event = check_out(db, worker, now)
    if event is not None:
        await location_hub.publish({"type": EVENT_CHECKED_OUT, "data": s.location_event(event)})
    facts = day_facts(db, worker, now)
    summary, source = await brief(facts)
    return {"facts": facts, "stats": stats(facts), "summary": summary, "source": source}


@router.get("/handover")
async def start_handover(worker: Worker = Depends(get_current_worker), db: Session = Depends(get_db)):
    """출근하기: what happened in the worker's zone yesterday and what to do today."""
    facts = handover_facts(db, worker, utcnow())
    summary, source = await handover_brief(facts)
    return {"facts": facts, "summary": summary, "source": source}
