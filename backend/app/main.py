import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import SessionLocal
from .routers import admin, assist, auth, client_log, location, voice, ws
from .seed import init_db, seed

# Windows registries often map .js to text/plain, which browsers refuse for module scripts.
for _ext, _type in {".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json",
                    ".svg": "image/svg+xml"}.items():
    mimetypes.add_type(_type, _ext)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if config.SEED_ON_STARTUP:
        with SessionLocal() as db:
            seed(db)
    yield


app = FastAPI(title="OVOT API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(location.router)
app.include_router(admin.router)
app.include_router(voice.router)
app.include_router(assist.router)
app.include_router(ws.router)
app.include_router(client_log.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built PWA from the same origin so one HTTPS tunnel is enough for a phone demo.
_dist = config.FRONTEND_DIST
if (_dist / "index.html").exists():
    if (_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "ws/")):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_dist.resolve()):
            headers = {"Cache-Control": "no-cache"} if path in ("sw.js", "manifest.webmanifest") else None
            return FileResponse(candidate, headers=headers)
        # A missing file (icon, image…) must 404, not return the app HTML: phones cache
        # whatever comes back for icon URLs.
        if Path(path).suffix:
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(_dist / "index.html", headers={"Cache-Control": "no-cache"})
