"""Tag verification is isolated behind an interface.

The hackathon build uses plain static NFC tags (a fixed opaque code). Static tags can
be cloned, so a production deployment should swap in a verifier for dynamic secure
tags (e.g. NTAG 424 DNA SUN/SDM messages with a rolling CMAC) or a fixed badge reader,
without touching the check-in service or the API.
"""

import re
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import NfcTag

TAG_CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9-]{2,63}$")


@dataclass
class TagScan:
    raw_code: str
    # Reserved for secure tags: e.g. {"picc_data": "...", "cmac": "..."}.
    auth_payload: dict = field(default_factory=dict)

    @property
    def normalized_code(self) -> str:
        return self.raw_code.strip().upper()


class TagRejected(Exception):
    def __init__(self, reason: str, message: str, http_status: int, tag: NfcTag | None = None):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.http_status = http_status
        self.tag = tag


class TagVerifier(Protocol):
    def resolve(self, db: Session, scan: TagScan) -> NfcTag:
        """Return the active tag for this scan or raise TagRejected."""


class StaticCodeTagVerifier:
    """MVP verifier: looks the opaque code up in nfc_tags. Demo use only (cloneable)."""

    def resolve(self, db: Session, scan: TagScan) -> NfcTag:
        code = scan.normalized_code
        if not TAG_CODE_PATTERN.match(code):
            raise TagRejected("invalid_format", "태그 코드 형식이 올바르지 않습니다.", 400)
        tag = db.scalar(select(NfcTag).where(NfcTag.tag_code == code))
        if tag is None:
            raise TagRejected("unknown_tag", f"등록되지 않은 태그입니다: {code}", 404)
        if not tag.is_active:
            raise TagRejected("inactive_tag", f"사용 중지된 태그입니다: {code}", 409, tag)
        if not tag.zone.is_active:
            raise TagRejected("inactive_zone", f"운영 중지된 구역의 태그입니다: {tag.zone.name}", 409, tag)
        return tag
