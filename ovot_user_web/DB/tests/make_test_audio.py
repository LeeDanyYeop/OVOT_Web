"""통합 테스트용 WAV 생성.

tests/data/ko_clean_16k.wav (Windows TTS 'Microsoft Heami' 로 생성한 한국어 음성)에
합성 공장 노이즈(핑크 노이즈 + 저주파 험 + 해머 충격음)를 섞어 노이즈 단계별 파일을 만든다.
실제 조선소 녹음이 아니므로 결과는 파이프라인 동작 확인용이다.

실행:  python tests/make_test_audio.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

DATA = Path(__file__).resolve().parent / "data"
SR = 16000


def factory_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    white = rng.standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR)
    pink = np.fft.irfft(np.fft.rfft(white) / np.sqrt(np.maximum(f, 20)), n)
    t = np.arange(n) / SR
    hum = 0.5 * np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t)
    hits = np.zeros(n)
    for s in rng.integers(0, n - 2000, size=max(1, n // SR * 2)):
        hits[s:s + 2000] += rng.standard_normal(2000) * np.exp(-np.arange(2000) / 300) * 4
    x = pink / pink.std() + hum + hits
    return x / x.std()


def mix(clean: np.ndarray, noise: np.ndarray, snr_db: float) -> np.ndarray:
    gain = np.sqrt((clean ** 2).mean() / ((noise ** 2).mean() * 10 ** (snr_db / 10)))
    y = clean + gain * noise
    return (y / np.abs(y).max() * 0.9).astype(np.float32)


def main() -> None:
    clean, sr = sf.read(DATA / "ko_clean_16k.wav", dtype="float32")
    assert sr == SR
    rng = np.random.default_rng(0)
    noise = factory_noise(len(clean), rng)
    for snr in (20, 5, 0, -5):
        sf.write(DATA / f"ko_noisy_snr{snr:+d}.wav", mix(clean, noise, snr), SR, subtype="PCM_16")
    noisy0 = mix(clean, noise, 0)
    sf.write(DATA / "ko_noisy_stereo.wav", np.stack([noisy0, noisy0], 1), SR, subtype="PCM_16")
    sf.write(DATA / "ko_8k.wav", clean[::2], 8000, subtype="PCM_16")
    print("생성:", sorted(p.name for p in DATA.glob("*.wav")))


if __name__ == "__main__":
    main()
