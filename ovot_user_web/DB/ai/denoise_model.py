"""스펙트로그램 마스크 기반 노이즈 제거 DNN (CRN: Convolutional Recurrent Network).

흐름 (Choi et al. 2019 DCUNet 그림과 같은 구조, 마스크는 실수값 0~1):
  파형 x → STFT → |X| (압축) → [Conv 인코더 → BiLSTM → Conv 디코더(skip 연결)] → 마스크 M
  → Ŷ = M · X (위상은 노이즈 섞인 X 그대로) → 역STFT → 목소리 ŷ
"""
import torch
import torch.nn as nn

N_FFT, HOP = 512, 128  # 32ms 창, 8ms 이동 (16kHz) → 주파수 257칸


class CRN(nn.Module):
    def __init__(self, chs=(16, 32, 64, 64, 128), hidden=256):
        super().__init__()
        self.register_buffer("win", torch.hann_window(N_FFT), persistent=False)
        self.enc = nn.ModuleList()
        cin = 1
        for c in chs:  # 주파수 축만 절반씩: 257→128→63→31→15→7
            self.enc.append(nn.Sequential(nn.Conv2d(cin, c, (3, 3), (1, 2), (1, 0)), nn.BatchNorm2d(c), nn.ELU()))
            cin = c
        f_bot = 7
        self.rnn = nn.LSTM(chs[-1] * f_bot, hidden, num_layers=2, batch_first=True, bidirectional=True)
        self.proj = nn.Linear(hidden * 2, chs[-1] * f_bot)
        self.dec = nn.ModuleList()
        outs = list(chs[-2::-1]) + [1]
        out_pad = [0, 0, 0, 1, 0]  # 63→128 단계만 1칸 보정
        for i, c in enumerate(outs):
            last = i == len(outs) - 1
            self.dec.append(nn.Sequential(
                nn.ConvTranspose2d(chs[-1 - i] * 2, c, (3, 3), (1, 2), (1, 0), output_padding=(0, out_pad[i])),
                nn.Identity() if last else nn.BatchNorm2d(c),
                nn.Sigmoid() if last else nn.ELU()))

    def stft(self, x):
        return torch.stft(x, N_FFT, HOP, window=self.win, return_complex=True).transpose(1, 2)  # (B,T,F)

    def istft(self, X, length):
        return torch.istft(X.transpose(1, 2), N_FFT, HOP, window=self.win, length=length)

    def mask(self, X):
        h = (X.abs() + 1e-8).pow(0.3).unsqueeze(1)  # 압축 크기 스펙트럼 (B,1,T,F)
        skips = []
        for layer in self.enc:
            h = layer(h)
            skips.append(h)
        b, c, t, f = h.shape
        r, _ = self.rnn(h.permute(0, 2, 1, 3).reshape(b, t, c * f))
        h = self.proj(r).reshape(b, t, c, f).permute(0, 2, 1, 3)
        for layer, s in zip(self.dec, reversed(skips)):
            h = layer(torch.cat([h, s], 1))
        return h.squeeze(1)  # (B,T,F) 0~1

    def forward(self, x):
        X = self.stft(x)
        M = self.mask(X)
        return self.istft(X * M, x.shape[-1]), M


def si_sdr(est, ref, eps=1e-8):
    ref = ref - ref.mean(-1, keepdim=True)
    est = est - est.mean(-1, keepdim=True)
    a = (est * ref).sum(-1, keepdim=True) / (ref.pow(2).sum(-1, keepdim=True) + eps)
    t = a * ref
    return 10 * torch.log10(t.pow(2).sum(-1) / ((est - t).pow(2).sum(-1) + eps) + eps)


def loss_fn(model, est, ref):
    """SI-SDR(파형) + 압축 크기 스펙트럼 오차. 목소리가 거의 없는 구간에서도 안정적으로 학습되도록 둘을 같이 쓴다."""
    E, R = model.stft(est), model.stft(ref)
    mag = lambda Z: (Z.real.pow(2) + Z.imag.pow(2) + 1e-10).pow(0.15)  # |Z|^0.3, 0 근처 기울기 폭주 방지
    spec = (mag(E) - mag(R)).pow(2).mean()
    return -si_sdr(est, ref).mean() * 0.01 + spec, spec


if __name__ == "__main__":
    m = CRN()
    x = torch.randn(2, 64000)
    y, M = m(x)
    print("params", sum(p.numel() for p in m.parameters()) / 1e6, "M", y.shape, M.shape)
