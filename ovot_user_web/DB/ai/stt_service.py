"""faster-whisper 한국어 전사 래퍼.

추론 설정(language="ko", vad_filter=True, beam_size=5)과 compute_type 선택 규칙은
원본 ai/stt_to_backend.py 와 동일하다.
"""
from __future__ import annotations

import numpy as np


class WhisperSTT:
    def __init__(self, model_name: str = "medium", device: str = "cpu", compute_type: str | None = None):
        from faster_whisper import WhisperModel  # 무거운 import 는 실제 로딩 시점에

        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type or ("int8" if device == "cpu" else "float16")
        self._model = WhisperModel(model_name, device=device, compute_type=self.compute_type)

    def transcribe(self, audio: np.ndarray) -> str:
        """16kHz mono float32 파형 → 전사문 (인식된 말이 없으면 빈 문자열)."""
        segs, _ = self._model.transcribe(
            audio.astype(np.float32), language="ko", vad_filter=True, beam_size=5
        )
        return " ".join(s.text.strip() for s in segs).strip()
