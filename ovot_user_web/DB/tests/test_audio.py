"""AI 음성 처리(/audio) 통합 테스트.

실제 ovot_db + 실제 CRN/Whisper 모델로 동작한다 (migrations/007 적용 필요).
테스트가 만든 audio_processing / voice_records 행과 저장 파일만 정리하며
기존 데이터는 건드리지 않는다.

준비:  python tests/make_test_audio.py   (tests/data/ 에 노이즈 섞인 WAV 생성)
실행:  pytest tests/test_audio.py -v
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from sqlalchemy import text

from ai.noise_level import should_denoise, snr_to_level

DATA = Path(__file__).resolve().parent / "data"
CLEAN = DATA / "ko_clean_16k.wav"
NOISY = DATA / "ko_noisy_snr-5.wav"
STEREO = DATA / "ko_noisy_stereo.wav"


def _wav_bytes(y: np.ndarray, sr: int = 16000) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _post(client, content: bytes, name: str = "test.wav", **form):
    return client.post("/audio/process", files={"audio_file": (name, content, "audio/wav")}, data=form)


@pytest.fixture()
def created(db):
    """테스트가 만든 processing_id 를 모아 끝나면 행/파일을 정리한다."""
    ids: list[int] = []
    yield ids
    if not ids:
        return
    from routers.audio import get_storage

    db.rollback()
    rows = db.execute(
        text("SELECT voice_id, original_audio_path, enhanced_audio_path FROM audio_processing "
             "WHERE processing_id = ANY(:ids)"), {"ids": ids}
    ).all()
    db.execute(text("DELETE FROM audio_processing WHERE processing_id = ANY(:ids)"), {"ids": ids})
    voice_ids = [r[0] for r in rows if r[0]]
    if voice_ids:
        db.execute(text("DELETE FROM voice_records WHERE voice_id = ANY(:v)"), {"v": voice_ids})
    db.commit()
    for _, orig, enh in rows:
        get_storage().delete(orig)
        get_storage().delete(enh)


@pytest.fixture(scope="module")
def ai_ready():
    from ai.model_manager import get_ai_models
    from config import get_settings

    m = get_ai_models()
    if not m.ensure_loaded(get_settings()):
        pytest.skip(f"AI 모델 로딩 실패: {m.load_error}")
    return m


# ─────────────── 노이즈 단계 판정 (원본 기준 유지) ───────────────


@pytest.mark.parametrize(
    "snr,level",
    [(31, 1), (23.01, 1), (23, 2), (16, 2), (11, 3), (6.5, 3), (3.5, 4), (0.8, 4), (-1, 5), (-3, 5)],
)
def test_snr_to_level_edges(snr, level):
    assert snr_to_level(snr) == level


def test_should_denoise_modes():
    assert [should_denoise("auto", lv) for lv in range(1, 6)] == [False, False, False, True, True]
    assert all(should_denoise("on", lv) for lv in range(1, 6))
    assert not any(should_denoise("off", lv) for lv in range(1, 6))


# ─────────────── 입력 검증 (DB 행/파일 생성 전 거부) ───────────────


def test_reject_non_wav_extension(client):
    r = _post(client, b"hello", name="a.mp3")
    assert r.status_code == 415 and r.json()["error"] is True


def test_reject_corrupted_wav(client):
    assert _post(client, b"RIFF\x00\x00garbage").status_code == 422


def test_reject_empty_file(client):
    assert _post(client, b"").status_code == 422


def test_reject_8khz(client):
    r = _post(client, _wav_bytes(np.random.randn(8000).astype(np.float32) * 0.1, 8000))
    assert r.status_code == 422 and "16kHz" in r.json()["message"]


def test_reject_silent(client):
    assert _post(client, _wav_bytes(np.zeros(16000, np.float32))).status_code == 422


def test_reject_too_short(client):
    assert _post(client, _wav_bytes(np.random.randn(1000).astype(np.float32) * 0.1)).status_code == 422


def test_reject_unknown_task(client):
    r = _post(client, CLEAN.read_bytes(), task_id="T-NOPE-999")
    assert r.status_code == 404


def test_reject_bad_denoise_mode(client):
    assert _post(client, CLEAN.read_bytes(), denoise_mode="maybe").status_code == 422


def test_result_not_found(client):
    assert client.get("/audio/results/999999999").status_code == 404
    assert client.get("/audio/results/999999999/original").status_code == 404


# ─────────────── 전체 흐름 (실제 모델) ───────────────


def test_status(client, ai_ready):
    body = client.get("/audio/status").json()
    assert body["ready"] is True and body["denoiser_params"] == 4802769


def test_process_clean_completed(client, db, ai_ready, created):
    data = CLEAN.read_bytes()
    r = _post(client, data, name="ko_clean.wav", worker_id="W-TEST", zone_id="A", block_id="P-1",
              task_id="T-001", denoise_mode="auto")
    assert r.status_code == 201, r.text
    body = r.json()
    created.append(body["processing_id"])

    assert body["processing_status"] == "COMPLETED"
    assert body["voice_id"] and body["voice_id"].startswith("V-")
    assert body["transcript"]
    assert 1 <= body["noise_level"] <= 5
    assert isinstance(body["estimated_snr_db"], float)
    assert body["denoise_applied"] is (body["noise_level"] in (4, 5))
    assert body["denoise_model_version"].startswith("CRN-denoiser-")

    # voice_records 에 같은 전사문이 저장되고 FK 로 연결되었는가
    v = client.get("/voice-records", params={"worker_id": "W-TEST"}).json()
    match = [x for x in v if x["voice_id"] == body["voice_id"]]
    assert match and match[0]["transcript"] == body["transcript"] and match[0]["task_id"] == "T-001"

    # 원본은 업로드 바이트 그대로, 정제본은 16kHz WAV
    orig = client.get(body["original_audio_url"])
    assert orig.status_code == 200 and orig.content == data
    enh = client.get(body["enhanced_audio_url"])
    assert enh.status_code == 200
    y, sr = sf.read(io.BytesIO(enh.content))
    assert sr == 16000 and len(y) > 0

    # 단건/목록 조회
    one = client.get(f"/audio/results/{body['processing_id']}").json()
    assert one["transcript"] == body["transcript"]
    lst = client.get("/audio/results", params={"audio_sha256": body["audio_sha256"]}).json()
    assert body["processing_id"] in [x["processing_id"] for x in lst]


def test_process_noisy_stereo_forced_on(client, ai_ready, created):
    r = _post(client, STEREO.read_bytes(), name="stereo.wav", denoise_mode="on")
    assert r.status_code == 201, r.text
    body = r.json()
    created.append(body["processing_id"])
    assert body["channels"] == 2
    assert body["denoise_applied"] is True


def test_process_noisy_forced_off(client, ai_ready, created):
    r = _post(client, NOISY.read_bytes(), name="noisy.wav", denoise_mode="off")
    assert r.status_code == 201, r.text
    body = r.json()
    created.append(body["processing_id"])
    assert body["denoise_applied"] is False
    assert body["noise_level"] >= 4  # SNR -5dB 합성 → 4·5단계로 판정되어야 함


def test_no_speech_does_not_create_voice_record(client, db, ai_ready, created, monkeypatch):
    import ai.pipeline

    monkeypatch.setattr(ai.pipeline, "transcribe", lambda models, audio: "")
    before = db.execute(text("SELECT count(*) FROM voice_records")).scalar_one()
    r = _post(client, CLEAN.read_bytes())
    assert r.status_code == 201, r.text
    body = r.json()
    created.append(body["processing_id"])
    assert body["processing_status"] == "NO_SPEECH"
    assert body["voice_id"] is None and body["transcript"] is None
    db.rollback()
    assert db.execute(text("SELECT count(*) FROM voice_records")).scalar_one() == before


def test_failure_is_recorded(client, db, ai_ready, created, monkeypatch):
    import ai.pipeline

    def boom(models, audio):
        raise RuntimeError("STT 강제 실패 (테스트)")

    monkeypatch.setattr(ai.pipeline, "transcribe", boom)
    r = _post(client, CLEAN.read_bytes(), name="fail.wav")
    assert r.status_code == 500
    pid = int(r.json()["message"].split("processing_id=")[1].split(")")[0])
    created.append(pid)

    body = client.get(f"/audio/results/{pid}").json()
    assert body["processing_status"] == "FAILED"
    assert "STT 강제 실패" in body["error_message"]
    assert body["voice_id"] is None
    assert body["enhanced_audio_url"] is None  # 부분 산출물 정리
    assert client.get(f"/audio/results/{pid}/original").status_code == 200  # 원본은 재처리용 보존
