import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db import SessionLocal
from ..security import resolve_session
from ..services.event_hub import location_hub

router = APIRouter()

AUTH_TIMEOUT_SECONDS = 10


@router.websocket("/ws/location-events")
async def location_events_ws(ws: WebSocket):
    """Admin live feed. The first client message must be {"type": "auth", "token": "..."}
    so the token never appears in URLs or access logs."""
    await ws.accept()
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
        msg = json.loads(raw)
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError):
        await ws.close(code=4401)
        return

    with SessionLocal() as db:
        worker = resolve_session(db, msg.get("token") if isinstance(msg, dict) else None)
        authorized = worker is not None and worker.is_admin
    if not authorized:
        await ws.send_json({"type": "error", "code": "UNAUTHORIZED"})
        await ws.close(code=4403)
        return

    await location_hub.register(ws)
    await ws.send_json({"type": "ready"})
    try:
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await location_hub.unregister(ws)
