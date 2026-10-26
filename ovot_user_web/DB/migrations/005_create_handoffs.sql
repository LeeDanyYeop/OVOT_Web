-- 005_create_handoffs.sql
-- 목적: 작업장(구역) 간 작업 인계 요청/수락/완료를 관리하는 신규 테이블 (스펙 5-5).
-- 영향: 완전히 새로운 테이블. 기존 테이블/데이터에 영향 없음.
-- 주의: 작업 상태(tasks.status)와 인계 상태(handoffs.status)는 서로 다른 개념.

BEGIN;

CREATE TABLE IF NOT EXISTS handoffs (
    handoff_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id      VARCHAR(30) NOT NULL REFERENCES tasks (task_id),
    from_zone_id VARCHAR(30) NOT NULL,
    to_zone_id   VARCHAR(30) NOT NULL,
    status       VARCHAR(30) NOT NULL DEFAULT 'REQUESTED'
                 CHECK (status IN ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'REJECTED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_handoffs_task_id ON handoffs (task_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs (status);

COMMIT;
