-- 004_events_processing_status_check.sql
-- 목적: events.event_status 를 "이벤트 처리 상태" 4종으로 제한 (스펙 5-4).
--       PENDING_VALIDATION / NEEDS_CONFIRMATION / CONFIRMED / REJECTED
-- 사전 검사 결과: 기존 1행의 값은 'PENDING_VALIDATION' 으로 이미 유효함.
--   → CHECK 제약을 바로 추가해도 위반 없음 (NOT VALID 불필요).
-- 되돌리기: ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_status_check;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_event_status_check'
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT events_event_status_check
            CHECK (event_status IN (
                'PENDING_VALIDATION', 'NEEDS_CONFIRMATION', 'CONFIRMED', 'REJECTED'
            ));
    END IF;
END $$;

COMMIT;
