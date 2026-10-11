"""'퇴근하기': check the worker out and brief the day.

Every number in the briefing (times, zones, durations, steps) is computed here from the
recorded events. The AI only turns those facts into short sentences; without it the same
facts are phrased by fixed templates, so the briefing always works.
"""

import asyncio
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..guides import guide_for
from ..models import AssistLog, LocationEvent, VoiceClip, Worker, WorkAssignment, WorkerCurrentLocation, Zone
from ..timeutil import KST, to_kst_iso
from .assist_ai import AssistUnavailable, generate_json

OUT_ZONE_ID = "ZONE-OUT"
EVENT_CHECKED_OUT = "worker_checked_out"


def _day_start_utc(now: datetime) -> datetime:
    local = now.astimezone(KST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _fmt_minutes(minutes: int) -> str:
    h, m = divmod(max(0, minutes), 60)
    return f"{h}시간 {m}분" if h else f"{m}분"


def check_out(db: Session, worker: Worker, now: datetime) -> LocationEvent | None:
    """Move the worker to '작업구역 밖' as a check-out event (kept like any other location event)."""
    current = db.get(WorkerCurrentLocation, worker.id)
    out_zone = db.get(Zone, OUT_ZONE_ID)
    if out_zone is None or (current is not None and current.zone_id == OUT_ZONE_ID):
        return None
    event = LocationEvent(
        event_type=EVENT_CHECKED_OUT,
        worker_id=worker.id,
        zone_id=OUT_ZONE_ID,
        previous_zone_id=current.zone_id if current else None,
        tag_id=None,
        source="checkout",
        occurred_at=now,
    )
    db.add(event)
    db.flush()
    event.event_id = f"EVT-LOCATION-{event.id:06d}"
    if current is None:
        current = WorkerCurrentLocation(worker_id=worker.id)
        db.add(current)
    current.zone = out_zone
    current.updated_at = now
    current.source_event = event
    db.commit()
    db.refresh(event)
    return event


def day_facts(db: Session, worker: Worker, now: datetime) -> dict:
    start = _day_start_utc(now)
    events = db.scalars(
        select(LocationEvent)
        .where(LocationEvent.worker_id == worker.id, LocationEvent.occurred_at >= start)
        .order_by(LocationEvent.occurred_at, LocationEvent.id)
    ).all()

    # time spent per work zone: each event lasts until the next one (or now)
    per_zone: dict[str, dict] = {}
    for i, e in enumerate(events):
        end = events[i + 1].occurred_at if i + 1 < len(events) else now
        if not e.zone.is_work_area:
            continue
        minutes = int((end - e.occurred_at).total_seconds() // 60)
        z = per_zone.setdefault(e.zone_id, {"zone": e.zone.name, "minutes": 0, "first": e.occurred_at})
        z["minutes"] += minutes
    zones = sorted(per_zone.values(), key=lambda z: z["first"])
    worked = sum(z["minutes"] for z in zones)
    first_in = next((e.occurred_at for e in events if e.zone.is_work_area), None)

    clips = db.scalars(select(VoiceClip).where(VoiceClip.worker_id == worker.id, VoiceClip.received_at >= start)).all()
    voice_minutes = round(sum((c.duration_ms or 0) for c in clips) / 60000)

    asks = db.scalars(select(AssistLog).where(AssistLog.worker_id == worker.id, AssistLog.created_at >= start)).all()
    pending = [a for a in asks if a.escalated_at is not None]

    assignment = db.scalar(
        select(WorkAssignment)
        .where(WorkAssignment.worker_id == worker.id, WorkAssignment.status != "done")
        .order_by(WorkAssignment.assigned_at.desc())
        .limit(1)
    )
    guide = guide_for(assignment.title if assignment else None)
    remaining: list[str] = []
    next_notes: list[str] = []
    current_step = None
    if guide:
        cur = guide["current_step"]
        current_step = f"{cur}/{len(guide['steps'])}단계 {guide['steps'][cur - 1]}"
        remaining = guide["steps"][cur:]
        next_notes = guide.get("step_notes", {}).get(cur + 1, [])

    return {
        "worker": {"name": worker.name, "team": worker.team, "role": worker.role},
        "date": now.astimezone(KST).strftime("%Y-%m-%d"),
        "check_in_at": to_kst_iso(first_in),
        "check_out_at": to_kst_iso(now),
        "worked_minutes": worked,
        "zones": [{"zone": z["zone"], "minutes": z["minutes"]} for z in zones],
        "voice": {"clips": len(clips), "minutes": voice_minutes},
        "questions": {"count": len(asks), "escalated": [json.loads(a.answer_json).get("headline") for a in pending]},
        "assignment": assignment.title if assignment else None,
        "current_step": current_step,
        "remaining_steps": remaining,
        "next_step_notes": next_notes,
        "cautions": guide["cautions"][:2] if guide else [],
        "owner": guide["owner"] if guide else None,
    }


def template_summary(f: dict) -> dict:
    done = [f"{z['zone']}에서 {_fmt_minutes(z['minutes'])} 작업" for z in f["zones"]] or ["오늘 등록된 작업구역 기록이 없어요"]
    if f["voice"]["minutes"]:
        done.append(f"현장 음성 {f['voice']['minutes']}분 기록")
    if f["questions"]["count"]:
        done.append(f"오봇에게 {f['questions']['count']}번 질문")
    nxt = [f"다음: {f['remaining_steps'][0]}", *f["remaining_steps"][1:3]] if f["remaining_steps"] else ["배정된 다음 작업이 없어요"]
    reminders = [f"담당자 확인 대기: {h}" for h in f["questions"]["escalated"] if h][:2]
    reminders += (f["next_step_notes"] or f["cautions"])[:2]
    return {
        "headline": f"오늘도 수고하셨습니다, {f['worker']['name']}님.",
        "done": done[:4],
        "next": nxt[:3],
        "reminders": reminders[:3],
    }


BRIEF_AI_SECONDS = 18

BRIEF_PROMPT = """너는 조선소 현장 도우미 '오봇'이다. 작업자가 퇴근 버튼을 눌렀다.
아래 [오늘 기록]의 사실만 사용해 한국어로 짧은 퇴근 브리핑을 쓴다. 숫자·구역·단계 이름을 바꾸거나 지어내지 않는다.

- headline: 따뜻한 한 문장 인사 (35자 이내, 이름 포함)
- done: 오늘 한 일 2~4개 (각 30자 이내, 시간은 기록 그대로). current_step은 아직 진행 중인 단계이므로 완료한 일로 쓰지 않는다
- next: 다음에 할 일 1~3개 (남은 단계 순서대로, 각 30자 이내)
- reminders: 확인할 것·주의사항 0~3개 (담당자 확인 대기가 있으면 먼저, 각 35자 이내)

JSON만 출력: {"headline": str, "done": [str], "next": [str], "reminders": [str]}
"""


async def brief(facts: dict) -> tuple[dict, str]:
    fallback = template_summary(facts)
    try:
        # never keep the worker waiting: fall back to the template after a fixed time
        data = await asyncio.wait_for(
            generate_json(
                [{"text": BRIEF_PROMPT + "\n[오늘 기록]\n" + json.dumps(facts, ensure_ascii=False, indent=1)}], timeout=15
            ),
            timeout=BRIEF_AI_SECONDS,
        )
        summary = {
            "headline": str(data.get("headline") or fallback["headline"]).strip(),
            "done": [str(x).strip() for x in data.get("done") or []][:4] or fallback["done"],
            "next": [str(x).strip() for x in data.get("next") or []][:3] or fallback["next"],
            "reminders": [str(x).strip() for x in data.get("reminders") or []][:3],
        }
        return summary, "ai"
    except (AssistUnavailable, asyncio.TimeoutError):
        return fallback, "template"


def stats(facts: dict) -> list[dict]:
    return [
        {"label": "근무", "value": _fmt_minutes(facts["worked_minutes"])},
        {"label": "구역", "value": f"{len(facts['zones'])}곳"},
        {"label": "음성 기록", "value": f"{facts['voice']['minutes']}분"},
        {"label": "오봇 질문", "value": f"{facts['questions']['count']}건"},
    ]

