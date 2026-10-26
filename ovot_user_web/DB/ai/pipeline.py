"""오디오 처리 파이프라인 — 단계별 독립 함수.

    load_wav  → denoise → analyze_noise → select_audio → transcribe
   (입력 검증)  (CRN)     (추정 SNR·단계)   (auto/on/off)   (Whisper)

DB / 파일 저장은 여기서 하지 않는다 (routers/audio.py 가 담당). 따라서 CLI·배치·
추후 웹 녹음 연동 등 어디서든 이 모듈을 그대로 재사용할 수 있다.
"""
from __future__ import annotations

import io
import time
from dataclasses import dataclass, field

import numpy as np

from .enhance import enhance
from .noise_level import estimate_snr, should_denoise, snr_to_level

SAMPLE_RATE = 16000  # 모델 학습 및 원본 CLI 의 입력 조건 (리샘플링하지 않고 거부)


class AudioValidationError(ValueError):
    """업로드 오디오가 처리 조건에 맞지 않음 (HTTP 4xx 로 변환)."""

    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class AudioInfo:
    sample_rate: int
    channels: int
    num_samples: int
    duration_sec: float


@dataclass
class PipelineResult:
    enhanced: np.ndarray
    estimated_snr_db: float
    noise_level: int
    denoise_applied: bool
    transcript: str
    timings_ms: dict[str, int] = field(default_factory=dict)


def load_wav(data: bytes, *, min_sec: float, max_sec: float) -> tuple[np.ndarray, AudioInfo]:
    """[1] WAV 바이트 → 16kHz mono float32. 손상/형식/샘플레이트/길이/무음 검증."""
    import soundfile as sf

    if not data:
        raise AudioValidationError("빈 파일입니다.")
    try:
        meta = sf.info(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - libsndfile 가 읽지 못하면 손상/비WAV
        raise AudioValidationError(f"오디오 파일을 읽을 수 없습니다(손상 또는 WAV 아님): {exc}") from exc
    if meta.format not in ("WAV", "WAVEX"):
        raise AudioValidationError(f"WAV 파일만 지원합니다 (입력 형식: {meta.format})", 415)
    if meta.samplerate != SAMPLE_RATE:
        raise AudioValidationError(
            f"16kHz WAV 만 지원합니다 (입력: {meta.samplerate}Hz). 16000Hz 로 변환 후 업로드하세요."
        )
    duration = meta.frames / meta.samplerate
    if duration > max_sec:
        raise AudioValidationError(f"오디오가 너무 깁니다: {duration:.1f}초 (최대 {max_sec:.0f}초)", 413)
    try:
        y, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    except Exception as exc:  # noqa: BLE001
        raise AudioValidationError(f"오디오 데이터를 디코딩할 수 없습니다: {exc}") from exc
    if y.ndim > 1:  # 스테레오 → 모노 (원본 CLI 와 동일)
        y = y.mean(1)
    y = np.ascontiguousarray(y, dtype=np.float32)
    if len(y) < int(min_sec * SAMPLE_RATE):
        raise AudioValidationError(f"오디오가 너무 짧습니다: {len(y) / SAMPLE_RATE:.2f}초 (최소 {min_sec}초)")
    if not np.isfinite(y).all():
        raise AudioValidationError("오디오에 비정상 값(NaN/Inf)이 있습니다.")
    if float(np.abs(y).max()) == 0.0:
        raise AudioValidationError("무음(모든 샘플이 0) 오디오입니다.")
    return y, AudioInfo(sr, meta.channels, len(y), round(len(y) / sr, 3))


def denoise(models, y: np.ndarray) -> np.ndarray:
    """[4] CRN 노이즈 제거 (enhance.py: 30초 분할 / 1초 중첩 그대로)."""
    return enhance(models.denoiser, y, models.device)


def analyze_noise(y: np.ndarray, est: np.ndarray) -> tuple[float, int]:
    """[5][6] 추정 SNR(dB) 과 노이즈 단계(1~5)."""
    snr = estimate_snr(y, est)
    return snr, snr_to_level(snr)


def select_audio(mode: str, level: int, y: np.ndarray, est: np.ndarray) -> tuple[bool, np.ndarray]:
    """[7] STT 에 쓸 음성 선택."""
    applied = should_denoise(mode, level)
    return applied, (est if applied else y)


def transcribe(models, audio: np.ndarray) -> str:
    """[8] Whisper 한국어 전사."""
    return models.stt.transcribe(audio)


def run_pipeline(models, y: np.ndarray, denoise_mode: str = "auto") -> PipelineResult:
    t = time.perf_counter
    t0 = t()
    est = denoise(models, y)
    t1 = t()
    snr, level = analyze_noise(y, est)
    applied, audio = select_audio(denoise_mode, level, y, est)
    t2 = t()
    text = transcribe(models, audio)
    t3 = t()
    return PipelineResult(
        enhanced=est,
        estimated_snr_db=round(snr, 2),
        noise_level=level,
        denoise_applied=applied,
        transcript=text,
        timings_ms={
            "denoise": int((t1 - t0) * 1000),
            "noise_analysis": int((t2 - t1) * 1000),
            "stt": int((t3 - t2) * 1000),
        },
    )
