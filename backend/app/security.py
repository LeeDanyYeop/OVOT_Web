"""MVP auth: PBKDF2 password hashes + opaque bearer tokens stored hashed server-side."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy.orm import Session

from . import config
from .models import AuthSession, Worker
from .timeutil import utcnow

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, expected = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(digest.hex(), expected)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, worker: Worker) -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(
        AuthSession(
            token_hash=_token_hash(token),
            worker_id=worker.id,
            created_at=now,
            expires_at=now + timedelta(hours=config.SESSION_TTL_HOURS),
        )
    )
    db.commit()
    return token


def resolve_session(db: Session, token: str | None) -> Worker | None:
    if not token:
        return None
    session = db.get(AuthSession, _token_hash(token))
    if session is None or session.revoked_at is not None or session.expires_at <= utcnow():
        return None
    worker = session.worker
    if not worker.is_active:
        return None
    return worker


def revoke_session(db: Session, token: str) -> None:
    session = db.get(AuthSession, _token_hash(token))
    if session and session.revoked_at is None:
        session.revoked_at = utcnow()
        db.commit()
