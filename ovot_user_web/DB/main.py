"""OVOT Backend — FastAPI 진입점.

실행:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

문서:
    http://localhost:8000/docs   (Swagger UI)
    http://localhost:8000/redoc
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai.model_manager import get_ai_models
from config import get_settings
from database import ping
from routers import audio, events, handoffs, tasks, voice_records
from schemas import HealthDbOut, HealthOut

settings = get_settings()
logger = logging.getLogger("ovot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # AI 모델은 요청마다 로딩하지 않고 기동 시 1회 로딩해 재사용한다.
    # 로딩에 실패해도 서버는 뜨며(기존 API 정상 동작) /audio/process 만 503 을 반환한다.
    if settings.ai_enabled and settings.ai_preload:
        logging.getLogger("ovot.ai").setLevel(logging.INFO)
        ok = await run_in_threadpool(get_ai_models().ensure_loaded, settings)
        logger.warning("AI 모델 로딩 %s", "완료" if ok else f"실패: {get_ai_models().load_error}")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="OVOT Backend",
    description=(
        "조선소 작업자 음성 기반 작업 관리 및 작업장 간 협업 시스템 — 백엔드 API.\n\n"
        "웹사이트 GUI / AI Agent / Unity 디지털 트윈은 PostgreSQL 에 직접 접근하지 않고 "
        "이 API 를 통해서만 데이터를 주고받는다."
    ),
    version="0.1.0",
)

# CORS — 환경변수(CORS_ORIGINS) 기반. 와일드카드(*) 는 사용하지 않는다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────── 공통 에러 응답 포맷 ────────────────────────


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "status_code": exc.status_code, "message": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # exc.errors() 의 ctx 필드에는 원본 ValueError 객체가 그대로 담겨 있어
    # JSON 직렬화가 안 된다. 사람이 읽을 메시지(loc/msg/type)만 추려 반환한다.
    details = [
        {"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": True,
            "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
            "message": "입력값 검증에 실패했습니다.",
            "details": details,
        },
    )


# ──────────────────────── 서버 상태 ────────────────────────


@app.get("/health", response_model=HealthOut, tags=["health"])
def health() -> HealthOut:
    """서버 실행 상태 확인 (DB 와 무관하게 항상 응답)."""
    return HealthOut(status="ok")


@app.get("/health/db", response_model=HealthDbOut, tags=["health"])
def health_db() -> JSONResponse:
    """PostgreSQL 연결 상태 확인."""
    try:
        info = ping()
        body = HealthDbOut(
            status="ok",
            database=info.get("db"),
            user=info.get("usr"),
            version=info.get("version"),
        )
        return JSONResponse(status_code=status.HTTP_200_OK, content=body.model_dump())
    except Exception as exc:  # noqa: BLE001 - DB 연결 실패를 그대로 노출
        logger.warning("DB health check failed: %s", exc)
        body = HealthDbOut(status="error", detail=str(exc))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=body.model_dump()
        )


# ──────────────────────── 라우터 등록 ────────────────────────

app.include_router(tasks.router)
app.include_router(voice_records.router)
app.include_router(events.router)
app.include_router(handoffs.router)
app.include_router(audio.router)
