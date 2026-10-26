"""AI 모델 싱글턴 — 서버 기동 시 1회 로딩해 모든 요청이 재사용한다.

- CRN 노이즈 제거 모델: denoiser.pt 체크포인트를 기존 CRN 구조로 로딩 (재초기화/재학습 없음).
  로딩 전에 키/텐서 shape 호환성을 검증한다.
- Whisper: faster-whisper. 기본값은 원본 CLI 와 같은 medium / cpu / int8.
- 동시 추론 제한: BoundedSemaphore(ai_max_concurrent). 대기 시간을 넘기면 호출자가 503 처리.
- 로딩 실패는 예외로 서버를 죽이지 않고 load_error 에 기록한다 → 기존 API 는 계속 동작.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("ovot.ai")


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pick_torch_device(preference: str = "auto") -> str:
    """CUDA 사용 가능 + 실제 커널 실행까지 되면 cuda, 아니면 cpu.

    (GPU 아키텍처를 지원하지 않는 torch 빌드는 is_available()=True 인데 연산에서
    'no kernel image' 오류가 나므로 작은 연산으로 한 번 확인한다.)
    """
    import torch

    if preference == "cpu":
        return "cpu"
    if torch.cuda.is_available():
        try:
            (torch.ones(8, device="cuda") * 2).sum().item()
            return "cuda"
        except Exception as exc:  # noqa: BLE001
            logger.warning("CUDA 사용 불가 → CPU 로 대체: %s", exc)
    if preference == "cuda":
        logger.warning("ai_device=cuda 가 지정됐지만 CUDA 를 쓸 수 없어 CPU 로 실행합니다.")
    return "cpu"


def load_denoiser(ckpt: Path, device: str):
    """denoiser.pt → CRN. 체크포인트 구조/파라미터 호환성을 검증한 뒤 strict 로딩."""
    import torch

    from .denoise_model import CRN

    state = torch.load(ckpt, map_location=device)
    if not isinstance(state, dict) or "model" not in state:
        raise RuntimeError(f"체크포인트 형식 오류: 'model' 키가 없습니다 ({ckpt.name})")
    sd = state["model"]
    model = CRN().to(device)
    expected = model.state_dict()
    missing = sorted(set(expected) - set(sd))
    unexpected = sorted(set(sd) - set(expected))
    mismatched = sorted(
        k for k in set(expected) & set(sd) if tuple(expected[k].shape) != tuple(sd[k].shape)
    )
    if missing or unexpected or mismatched:
        raise RuntimeError(
            "체크포인트가 CRN 구조와 맞지 않습니다: "
            f"missing={missing[:5]} unexpected={unexpected[:5]} shape_mismatch={mismatched[:5]}"
        )
    model.load_state_dict(sd, strict=True)
    n_params = sum(p.numel() for p in model.parameters())
    return model.eval(), n_params


class AIModels:
    def __init__(self) -> None:
        self.denoiser = None
        self.stt = None
        self.device: str | None = None
        self.denoise_model_version: str | None = None
        self.denoiser_params: int | None = None
        self.stt_model_name: str | None = None
        self.stt_device: str | None = None
        self.stt_compute_type: str | None = None
        self.load_error: str | None = None
        self.load_seconds: float | None = None
        self._attempted = False
        self._load_lock = threading.Lock()
        self._sem = threading.BoundedSemaphore(1)

    @property
    def ready(self) -> bool:
        return self.denoiser is not None and self.stt is not None

    def ensure_loaded(self, settings) -> bool:
        """아직 로딩을 시도하지 않았으면 로딩한다. 성공 여부 반환 (실패해도 예외 없음)."""
        if self._attempted:
            return self.ready
        with self._load_lock:
            if self._attempted:
                return self.ready
            t0 = time.perf_counter()
            try:
                self._sem = threading.BoundedSemaphore(max(1, settings.ai_max_concurrent))
                self.device = pick_torch_device(settings.ai_device)
                ckpt = Path(settings.denoiser_checkpoint)
                self.denoiser, self.denoiser_params = load_denoiser(ckpt, self.device)
                self.denoise_model_version = f"CRN-{ckpt.stem}-{_file_sha256(ckpt)[:12]}"
                logger.info(
                    "CRN 로딩 완료: %s (%.2fM params, %s)",
                    self.denoise_model_version, self.denoiser_params / 1e6, self.device,
                )

                from .stt_service import WhisperSTT

                self.stt = WhisperSTT(
                    settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
                )
                self.stt_model_name = f"faster-whisper/{settings.whisper_model}"
                self.stt_device = self.stt.device
                self.stt_compute_type = self.stt.compute_type
                logger.info("Whisper 로딩 완료: %s (%s/%s)", settings.whisper_model,
                            self.stt.device, self.stt.compute_type)
                self.load_error = None
            except Exception as exc:  # noqa: BLE001 - 로딩 실패가 서버 전체를 죽이지 않도록
                logger.exception("AI 모델 로딩 실패")
                self.denoiser = self.stt = None
                self.load_error = f"{type(exc).__name__}: {exc}"
            finally:
                self.load_seconds = round(time.perf_counter() - t0, 2)
                self._attempted = True
            return self.ready

    def acquire(self, timeout: float) -> bool:
        return self._sem.acquire(timeout=timeout)

    def release(self) -> None:
        self._sem.release()

    def info(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "load_attempted": self._attempted,
            "load_error": self.load_error,
            "load_seconds": self.load_seconds,
            "torch_device": self.device,
            "denoise_model_version": self.denoise_model_version,
            "denoiser_params": self.denoiser_params,
            "stt_model": self.stt_model_name,
            "stt_device": self.stt_device,
            "stt_compute_type": self.stt_compute_type,
        }


_models = AIModels()


def get_ai_models() -> AIModels:
    return _models
