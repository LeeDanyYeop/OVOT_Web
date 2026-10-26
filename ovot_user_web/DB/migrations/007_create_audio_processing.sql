-- 007_create_audio_processing.sql
-- 목적: AI 음성 처리 이력 테이블 (WAV 업로드 → CRN 노이즈 제거 → 추정 SNR/노이즈 단계 → Whisper).
-- 영향: 완전히 새로운 테이블. 기존 7개 테이블의 구조/데이터는 변경하지 않는다.
-- 재실행: IF NOT EXISTS 로 작성되어 여러 번 실행해도 중복 생성/데이터 손상 없음.
--
-- 설계 메모
--  * 전사문 원문은 기존 voice_records.transcript 에 저장하고, 여기서는 voice_id 로 연결한다.
--  * voice_records.transcript 가 NOT NULL 이므로 실패(FAILED)/무음(NO_SPEECH) 결과는
--    voice_records 를 만들지 않고 이 테이블에만 남긴다 → voice_id 는 NULL 허용.
--  * 처리 1회 = 1행. 같은 파일을 다시 처리하면 새 행이 생기며 audio_sha256 으로 이력을 묶는다.
--  * 오디오 경로는 저장소 루트(audio_storage/) 기준 상대경로.
--
-- 되돌리기(필요 시):  DROP TABLE IF EXISTS audio_processing;

BEGIN;

CREATE TABLE IF NOT EXISTS audio_processing (
    processing_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    voice_id              VARCHAR(50) REFERENCES voice_records (voice_id),
    worker_id             VARCHAR(30),
    zone_id               VARCHAR(30),
    block_id              VARCHAR(30),
    task_id               VARCHAR(30) REFERENCES tasks (task_id),

    original_filename     VARCHAR(255),
    original_audio_path   VARCHAR(500) NOT NULL,
    enhanced_audio_path   VARCHAR(500),
    audio_sha256          CHAR(64)     NOT NULL,
    file_size_bytes       BIGINT,
    sample_rate           INTEGER,
    channels              SMALLINT,
    duration_sec          REAL,

    denoise_mode          VARCHAR(10)  NOT NULL DEFAULT 'auto'
                          CHECK (denoise_mode IN ('auto', 'on', 'off')),
    estimated_snr_db      REAL,
    noise_level           SMALLINT     CHECK (noise_level BETWEEN 1 AND 5),
    denoise_applied       BOOLEAN,
    denoise_model_version VARCHAR(100),
    stt_model             VARCHAR(100),
    device                VARCHAR(50),

    processing_status     VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                          CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'NO_SPEECH', 'FAILED')),
    error_message         TEXT,
    processing_ms         INTEGER,
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- COMPLETED 는 반드시 voice_records 와 연결되어 있어야 한다
    CONSTRAINT audio_processing_completed_has_voice
        CHECK (processing_status <> 'COMPLETED' OR voice_id IS NOT NULL)
);

-- 하나의 발화 기록은 하나의 처리 결과에서만 생성된다
CREATE UNIQUE INDEX IF NOT EXISTS uq_audio_processing_voice_id
    ON audio_processing (voice_id) WHERE voice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_processing_task_id ON audio_processing (task_id);
CREATE INDEX IF NOT EXISTS idx_audio_processing_status ON audio_processing (processing_status);
CREATE INDEX IF NOT EXISTS idx_audio_processing_sha256 ON audio_processing (audio_sha256);
CREATE INDEX IF NOT EXISTS idx_audio_processing_created_at ON audio_processing (created_at);

COMMIT;
