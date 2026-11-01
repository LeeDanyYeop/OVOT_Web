from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), "KST")


def utcnow() -> datetime:
    """Server clock, timezone-aware UTC. All authoritative timestamps come from here."""
    return datetime.now(timezone.utc)


def to_kst_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).isoformat(timespec="seconds")
