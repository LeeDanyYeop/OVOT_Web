"""학습된 노이즈 제거 모델로 wav 를 처리.

사용: python enhance.py 녹음폴더                 (폴더 안 wav 전부 → <폴더>/enhanced/)
      python enhance.py 녹음.wav --out 녹음_clean.wav
"""
import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

try:  # OVOT-Backend 에서 ai 패키지로 import 될 때
    from .denoise_model import CRN
except ImportError:  # python enhance.py 로 단독 실행할 때 (원본 CLI 유지)
    from denoise_model import CRN

HERE = Path(__file__).resolve().parent


def load_model(ckpt, dev):
    m = CRN().to(dev)
    m.load_state_dict(torch.load(ckpt, map_location=dev)["model"])
    return m.eval()


@torch.no_grad()
def enhance(model, y, dev, chunk_s=30.0, overlap_s=1.0, sr=16000):
    """긴 파일은 30초씩 1초 겹쳐 처리하고 겹친 부분은 선형으로 이어 붙인다."""
    scale = np.abs(y).max() + 1e-9
    y = y / scale * 0.5
    c, o = int(chunk_s * sr), int(overlap_s * sr)
    out, w = np.zeros(len(y)), np.zeros(len(y))
    s = 0
    while s < len(y):
        e = min(len(y), s + c)
        seg = torch.from_numpy(y[s:e].astype(np.float32)).to(dev)[None]
        est = model(seg)[0][0].cpu().numpy()
        ramp = np.ones(e - s)
        if s > 0:
            ramp[:o] = np.linspace(0, 1, o)
        if e < len(y):
            ramp[-o:] = np.linspace(1, 0, o)
        out[s:e] += est * ramp; w[s:e] += ramp
        if e == len(y):
            break
        s = e - o
    return (out / np.maximum(w, 1e-6) / 0.5 * scale).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out", default="")
    ap.add_argument("--ckpt", default=str(HERE / "denoiser.pt"))
    args = ap.parse_args()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(args.ckpt, dev)
    p = Path(args.path)
    if p.is_dir():
        out_dir = p / "enhanced"
        out_dir.mkdir(exist_ok=True)
        jobs = [(f, out_dir / f.name) for f in sorted(p.glob("*.wav"))]
    else:
        jobs = [(p, Path(args.out) if args.out else p.with_name(p.stem + "_enhanced.wav"))]
    for src, dst in jobs:
        y, sr = sf.read(src, dtype="float32")
        assert sr == 16000, f"{src}: {sr}Hz"
        sf.write(dst, enhance(model, y, dev), sr, subtype="PCM_16")
        print("저장:", dst)


if __name__ == "__main__":
    main()
