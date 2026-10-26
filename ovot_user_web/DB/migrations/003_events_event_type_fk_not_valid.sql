-- 003_events_event_type_fk_not_valid.sql
-- 목적: events.event_type 이 event_types 테이블에 등록된 25개 표준 코드만
--       참조하도록 강제 (스펙 5-3).
-- 사전 검사 결과: events 테이블에 구형 코드 1건 존재
--   event_id=1, event_type='WORK_PRIORITY_CHANGED' (25개 표준 코드에 없음)
-- 처리 방식: FK 를 NOT VALID 로 추가한다.
--   - 기존 행(구형 코드 포함)은 전혀 검사/수정하지 않고 그대로 보존.
--   - 앞으로 INSERT/UPDATE 되는 모든 행은 반드시 event_types 의 유효한
--     코드를 참조해야 한다 (즉시 강제 적용).
-- 참고: 구형 데이터를 표준 코드로 정리한 뒤 아래를 실행하면 완전 검증 상태로
--       전환할 수 있다 (팀 결정 필요, 지금은 실행하지 않음):
--   UPDATE events SET event_type = '(WI) PRIORITY' WHERE event_type = 'WORK_PRIORITY_CHANGED';
--   ALTER TABLE events VALIDATE CONSTRAINT events_event_type_fkey;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_event_type_fkey'
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT events_event_type_fkey
            FOREIGN KEY (event_type) REFERENCES event_types (event_type)
            NOT VALID;
    END IF;
END $$;

COMMIT;
