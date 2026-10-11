"""Start the OVOT backend: python run.py [--reload]. Port via OVOT_PORT (default 8100)."""

import os
import sys
from pathlib import Path

import uvicorn

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    uvicorn.run(
        "app.main:app",
        host=os.getenv("OVOT_HOST", "0.0.0.0"),
        # Cloud hosts (Render etc.) assign the port via PORT.
        port=int(os.getenv("PORT") or os.getenv("OVOT_PORT", "8100")),
        reload="--reload" in sys.argv,
    )
