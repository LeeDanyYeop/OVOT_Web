import logging

from fastapi import APIRouter, Request

router = APIRouter(tags=["diagnostics"])
log = logging.getLogger("ovot.client")
log.setLevel(logging.INFO)
if not log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("CLIENT-ERROR %(message)s"))
    log.addHandler(_h)


@router.post("/api/client-log", status_code=204)
async def client_log(request: Request):
    """Front-end crash reports (white-screen debugging on field phones). Logged only."""
    body = (await request.body())[:4000].decode("utf-8", "replace")
    log.warning("%s | ua=%s", body, (request.headers.get("user-agent") or "")[:200])
