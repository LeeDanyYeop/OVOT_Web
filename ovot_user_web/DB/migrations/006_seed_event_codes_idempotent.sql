-- 006_seed_event_codes_idempotent.sql
-- 목적: 팀이 확정한 이벤트 상위범주 8개 / 이벤트 코드 25개 / 발화 의도 5개를
--       등록. ON CONFLICT DO NOTHING 으로 이미 존재하면 건드리지 않는다.
-- 2026-10-09 점검 결과: 현재 ovot_db 에는 이미 8/25/5 가 전부 등록되어 있어
--       이 스크립트는 사실상 변화가 없다 (no-op). 다른 환경(신규 DB)에 이
--       백엔드를 배포할 때 재사용하기 위해 보관한다.

BEGIN;

INSERT INTO event_categories (category_code, category_name) VALUES
    ('WS', '작업 시작'),
    ('WI', '작업 지시'),
    ('WP', '작업 진행'),
    ('WC', '작업 완료'),
    ('QC', '품질·검사'),
    ('SM', '안전'),
    ('ME', '자재·설비'),
    ('CO', '작업장 간 협업')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO event_types (event_type, category_code, description) VALUES
    ('(WS) START', 'WS', '작업 시작'),
    ('(WS) RESUME', 'WS', '작업 재개'),
    ('(WS) ASSIGN', 'WS', '작업 배정'),
    ('(WI) INSTRUCT', 'WI', '작업 지시'),
    ('(WI) PRIORITY', 'WI', '우선순위 변경'),
    ('(WI) METHOD', 'WI', '작업 방식 변경'),
    ('(WP) PROGRESS', 'WP', '진행 상황 보고'),
    ('(WP) DELAY', 'WP', '작업 지연'),
    ('(WP) BLOCKED', 'WP', '작업 진행 불가'),
    ('(WC) DONE', 'WC', '작업 완료'),
    ('(WC) PARTIAL', 'WC', '일부 완료'),
    ('(WC) CANCEL', 'WC', '작업 취소'),
    ('(QC) INSPECT_REQ', 'QC', '검사 요청'),
    ('(QC) PASS', 'QC', '검사 합격'),
    ('(QC) FAIL', 'QC', '검사 불합격'),
    ('(QC) REWORK', 'QC', '재작업 필요'),
    ('(SM) HAZARD', 'SM', '위험 보고'),
    ('(SM) STOP_REQ', 'SM', '작업 중지 요청'),
    ('(SM) SAFETY_CHECK', 'SM', '안전 점검 요청'),
    ('(ME) SHORTAGE', 'ME', '자재 부족'),
    ('(ME) MATERIAL_REQ', 'ME', '자재 요청'),
    ('(ME) EQUIP_FAIL', 'ME', '장비 고장'),
    ('(CO) HANDOFF_REQ', 'CO', '작업 인계 요청'),
    ('(CO) HANDOFF_OK', 'CO', '작업 인계 수락'),
    ('(CO) FOLLOWUP_REQ', 'CO', '후속 조치 요청')
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO speech_types (speech_type, description) VALUES
    ('CMD', '작업 지시'),
    ('RPT', '상황 보고'),
    ('QST', '질문'),
    ('ACK', '확인·응답'),
    ('NRM', '일반 대화')
ON CONFLICT (speech_type) DO NOTHING;

COMMIT;
