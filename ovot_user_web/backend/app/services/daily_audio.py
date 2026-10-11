"""퇴근 시 하루치 음성 조각(10초 단위 VoiceClip)을 한 파일로 합친다.

조각마다 헤더가 따로 있는 독립 파일이라 바이트를 이어 붙이면 재생이 안 된다. 그래서 각 조각을
디코딩해 같은 형식(48kHz 모노)으로 맞춘 뒤 Opus/WebM 한 파일로 다시 인코딩한다.
"""

from datetime import datetime
from pathlib import Path

import av
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..models import VoiceClip, Worker
from ..timeutil import KST
from .workday import _day_start_utc

SAMPLE_RATE = 48_000


def day_clip_paths(db: Session, worker: Worker, now: datetime) -> list[Path]:
    clips = db.scalars(
        select(VoiceClip)
        .where(VoiceClip.worker_id == worker.id, VoiceClip.received_at >= _day_start_utc(now))
        .order_by(VoiceClip.id)
    ).all()
    return [Path(c.file_path) for c in clips if c.file_path and Path(c.file_path).is_file()]


def merge_clips(sources: list[Path], dest: Path) -> int:
    """Decodes `sources` in order into one Opus/WebM file. Returns how many sources were used."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    used = 0
    with av.open(str(tmp), "w", format="webm") as out:
        stream = out.add_stream("libopus", rate=SAMPLE_RATE, layout="mono")
        resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        for src in sources:
            try:
                with av.open(str(src)) as inp:
                    for frame in inp.decode(audio=0):
                        for f in resampler.resample(frame):
                            f.pts = None
                            out.mux(stream.encode(f))
                used += 1
            except av.FFmpegError:
                continue  # a broken segment (e.g. cut off mid-upload) must not lose the whole day
        for f in resampler.resample(None):
            f.pts = None
            out.mux(stream.encode(f))
        out.mux(stream.encode(None))
    if used:
        tmp.replace(dest)
    else:
        tmp.unlink(missing_ok=True)
    return used


def merge_day(db: Session, worker: Worker, now: datetime) -> dict | None:
    """data/audio/<작업자>/daily/<작업자>_<날짜>.webm 에 오늘 녹음을 합쳐 저장 (다시 퇴근하면 덮어씀)."""
    sources = day_clip_paths(db, worker, now)
    if not sources:
        return None
    name = f"{worker.id}_{now.astimezone(KST):%Y-%m-%d}.webm"
    dest = config.AUDIO_DIR / worker.id / "daily" / name
    used = merge_clips(sources, dest)
    if not used:
        return None
    return {"file": name, "clips": used}
