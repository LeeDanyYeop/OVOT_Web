"""In-process pub/sub for real-time dashboard updates.

Every message carries a `type` so future site events (work_instruction, safety_hazard,
quality_issue, ...) can share the same channel. Replace with Redis pub/sub or a
message broker when running more than one backend process.
"""

import asyncio
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


class EventHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def register(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.add(ws)

    async def unregister(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def publish(self, message: dict) -> None:
        async with self._lock:
            clients = list(self._clients)
        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(message)
            except Exception:  # client went away mid-send
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)


location_hub = EventHub()
