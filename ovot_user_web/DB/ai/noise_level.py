"""추정 SNR 계산 / 노이즈 단계 판정 / 노이즈 제거 적용 여부 결정.

estimate_snr, snr_to_level, LEVEL_EDGES, DENOISE_LEVELS 는 원본
ai/stt_to_backend.py 에서 그대로 옮긴 것이다 (판정 기준 변경 금지).

SNR 은 정답(깨끗한) 음성으로 잰 값이 아니라, 노이즈 제거 모델이 분리한
'목소리'와 '나머지(노이즈)'의 에너지 비율로 계산한 **추정값**이다.
"""
from __future__ import annotations

import numpy as np

LEVEL_EDGES = [23.0, 11.0, 3.5, -1.0]  # 추정 SNR(dB) 이 경계보다 크면 앞 단계: >23 → 1단계 ... <=-1 → 5단계
DENOISE_LEVELS = {4, 5}
DENOISE_MODES = ("auto", "on", "off")


def estimate_snr(y, est, frame=400):
    """목소리 에너지가 큰 절반의 프레임에서 (추정 목소리 / 나머지) 에너지 비."""
    n = len(y) // frame * frame
    se = (est[:n].reshape(-1, frame) ** 2).mean(1)
    ne = ((y - est)[:n].reshape(-1, frame) ** 2).mean(1)
    act = se > np.percentile(se, 50)
    return float(10 * np.log10(se[act].sum() / (ne[act].sum() + 1e-12) + 1e-12))


def snr_to_level(snr):
    return next((i + 1 for i, e in enumerate(LEVEL_EDGES) if snr > e), 5)


def should_denoise(mode: str, level: int) -> bool:
    """auto: 4·5단계만 / on: 항상 / off: 안 함 (stt_to_backend.py 의 use_dn 식과 동일)."""
    if mode not in DENOISE_MODES:
        raise ValueError(f"denoise_mode 는 {DENOISE_MODES} 중 하나여야 합니다: {mode}")
    return mode == "on" or (mode == "auto" and level in DENOISE_LEVELS)
