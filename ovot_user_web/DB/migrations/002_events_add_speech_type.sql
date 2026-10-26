-- 002_events_add_speech_type.sql
-- 목적: AI Agent 가 추출한 발화 의도(speech_type)를 이벤트 단위로 저장/검증.
-- 영향: events 테이블에 NULL 허용 컬럼 추가. 기존 1행은 NULL 로 채워짐 (데이터 손실 없음).
-- 되돌리기: ALTER TABLE events DROP COLUMN IF EXISTS speech_type;

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS speech_type VARCHAR(30);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_speech_type_fkey'
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT events_speech_type_fkey
            FOREIGN KEY (speech_type) REFERENCES speech_types (speech_type);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_speech_type ON events (speech_type);

COMMIT;
