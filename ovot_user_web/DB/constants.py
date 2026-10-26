"""팀에서 확정한 고정 상태 코드.

이벤트 코드 25개 / 발화 의도 5개는 여기 하드코딩하지 않고 DB(event_types,
speech_types 테이블)를 조회해 검증한다. 팀이 코드를 추가/변경해도 서버
코드를 고치지 않고 DB만 갱신하면 되도록 하기 위함이다.

반면 아래 4가지는 애플리케이션 로직(상태 전이)과 직접 맞물려 있어 고정값으로
둔다: 이벤트 처리 상태, 인계 상태.
"""

from __future__ import annotations

# 이벤트 "처리 상태" (이벤트 종류와는 별개 개념) — 스펙 5-4
EVENT_PROCESSING_STATUSES: set[str] = {
    "PENDING_VALIDATION",
    "NEEDS_CONFIRMATION",
    "CONFIRMED",
    "REJECTED",
}

# 작업장 간 인계 상태 — 스펙 5-5
HANDOFF_STATUSES: set[str] = {
    "REQUESTED",
    "ACCEPTED",
    "IN_PROGRESS",
    "DONE",
    "REJECTED",
}

# 인계 상태 전이 규칙. 키: 현재 상태, 값: 전이 가능한 다음 상태 집합.
HANDOFF_TRANSITIONS: dict[str, set[str]] = {
    "REQUESTED": {"ACCEPTED", "REJECTED"},
    "ACCEPTED": {"IN_PROGRESS", "REJECTED"},
    "IN_PROGRESS": {"DONE", "REJECTED"},
    "DONE": set(),
    "REJECTED": set(),
}

# AI 오디오 처리 상태 (audio_processing.processing_status)
#   PENDING    : 업로드·원본 저장 완료, 추론 대기
#   PROCESSING : 노이즈 제거 / STT 실행 중
#   COMPLETED  : 전사문을 voice_records 에 저장 완료 (voice_id 연결됨)
#   NO_SPEECH  : 처리는 끝났으나 인식된 말이 없음 (transcript NOT NULL 이라 voice_record 미생성)
#   FAILED     : 처리 중 오류 (error_message 기록)
AUDIO_PROCESSING_STATUSES: set[str] = {
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "NO_SPEECH",
    "FAILED",
}

# 작업 상태 — 팀에서 아직 전체 값 집합을 확정하지 않아, 하커톤 진행을 막지
# 않기 위한 합리적 기본값. README 에 가정으로 명시함. 팀 확정 시 이 집합만
# 바꾸면 된다 (DB 에는 CHECK 제약을 걸지 않았음).
TASK_STATUSES: set[str] = {
    "PENDING",
    "IN_PROGRESS",
    "DONE",
    "CANCELLED",
}
