import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# SQLite for the MVP. Point this at PostgreSQL later, e.g.
# postgresql+psycopg://ovot:ovot@db:5432/ovot
DATABASE_URL = os.getenv("OVOT_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'ovot.db').as_posix()}")

SESSION_TTL_HOURS = int(os.getenv("OVOT_SESSION_TTL_HOURS", "12"))

# Same worker + same zone within this window is treated as a duplicate scan.
DUPLICATE_WINDOW_SECONDS = int(os.getenv("OVOT_DUPLICATE_WINDOW_SECONDS", "30"))

# A registration older than this is shown as "확인 필요" (NFC is entry registration,
# not continuous tracking, so an old check-in does not prove current presence).
STALE_AFTER_HOURS = float(os.getenv("OVOT_STALE_AFTER_HOURS", "8"))

FRONTEND_DIST = Path(os.getenv("OVOT_FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))

CORS_ORIGINS = [o for o in os.getenv("OVOT_CORS_ORIGINS", "http://localhost:5173").split(",") if o]

SEED_ON_STARTUP = os.getenv("OVOT_SEED_ON_STARTUP", "1") == "1"

# Hackathon demo: no login screen. The server issues a session for a fixed account
# (identity is still decided server-side). Set OVOT_DEMO_MODE=0 to disable.
DEMO_MODE = os.getenv("OVOT_DEMO_MODE", "1") == "1"
DEMO_WORKER_ID = os.getenv("OVOT_DEMO_WORKER_ID", "W-001")
DEMO_ADMIN_ID = os.getenv("OVOT_DEMO_ADMIN_ID", "W-004")

AUDIO_DIR = Path(os.getenv("OVOT_AUDIO_DIR", str(DATA_DIR / "audio")))
MAX_CLIP_BYTES = int(os.getenv("OVOT_MAX_CLIP_BYTES", str(10 * 1024 * 1024)))
