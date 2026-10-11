from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Worker
from .security import resolve_session

_bearer = HTTPBearer(auto_error=False)


def get_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str | None:
    return creds.credentials if creds else None


def get_current_worker(token: str | None = Depends(get_token), db: Session = Depends(get_db)) -> Worker:
    """The worker identity always comes from the authenticated session, never from the request body."""
    worker = resolve_session(db, token)
    if worker is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "로그인이 필요합니다."},
        )
    return worker


def require_admin(worker: Worker = Depends(get_current_worker)) -> Worker:
    if not worker.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "관리자 권한이 필요합니다."},
        )
    return worker
