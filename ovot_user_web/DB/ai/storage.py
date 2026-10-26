"""업로드/정제 오디오 파일 저장소.

- DB 에는 저장소 루트 기준 상대경로(POSIX 형식)만 저장한다 → 폴더를 옮겨도 경로가 깨지지 않는다.
- 파일명은 서버가 uuid 로 생성한다 (사용자 파일명은 DB 의 original_filename 에만 기록).
- resolve() 는 결과 경로가 저장소 루트 밖이면 거부한다 (경로 탐색 방지).
- 쓰기는 임시파일 → os.replace 로 원자적으로 수행해 반쯤 쓰인 파일이 남지 않게 한다.
"""
from __future__ import annotations

import datetime as dt
import os
import uuid
from pathlib import Path

import numpy as np

ORIGINAL = "original"
ENHANCED = "enhanced"


class AudioStorage:
    def __init__(self, root: Path) -> None:
        self.root = Path(root).resolve()
        for sub in (ORIGINAL, ENHANCED):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    def new_relpath(self, kind: str) -> str:
        if kind not in (ORIGINAL, ENHANCED):
            raise ValueError(kind)
        day = dt.datetime.now().strftime("%Y%m%d")
        return f"{kind}/{day}/{uuid.uuid4().hex}.wav"

    def resolve(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if not p.is_relative_to(self.root):
            raise PermissionError("저장소 밖의 경로는 접근할 수 없습니다.")
        return p

    def _atomic_write(self, rel: str, writer) -> Path:
        dst = self.resolve(rel)
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(dst.name + ".part")
        try:
            writer(tmp)
            os.replace(tmp, dst)
        finally:
            tmp.unlink(missing_ok=True)
        return dst

    def write_bytes(self, rel: str, data: bytes) -> Path:
        return self._atomic_write(rel, lambda p: p.write_bytes(data))

    def write_wav(self, rel: str, y: np.ndarray, sr: int) -> Path:
        import soundfile as sf

        # enhance.py 와 동일하게 PCM_16 으로 저장
        return self._atomic_write(rel, lambda p: sf.write(p, y, sr, subtype="PCM_16", format="WAV"))

    def delete(self, rel: str | None) -> None:
        if not rel:
            return
        try:
            self.resolve(rel).unlink(missing_ok=True)
        except OSError:
            pass
