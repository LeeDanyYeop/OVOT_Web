-- 001_events_allow_multiple_per_voice.sql
-- 목적: 발화(voice_id) 1건에서 여러 이벤트를 추출/저장할 수 있도록 허용.
-- 영향: UNIQUE 제약만 제거. 기존 행 값은 변경하지 않음. 조회 성능을 위해
--       일반(비유니크) 인덱스를 대신 생성한다.
-- 되돌리기: ALTER TABLE events ADD CONSTRAINT events_voice_id_key UNIQUE (voice_id);
--           DROP INDEX IF EXISTS idx_events_voice_id;

BEGIN;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_voice_id_key;

CREATE INDEX IF NOT EXISTS idx_events_voice_id ON events (voice_id);

COMMIT;
