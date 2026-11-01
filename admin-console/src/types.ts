/**
 * OVOT-Backend 응답 타입.
 * 기준: OVOT-Backend/schemas.py (TaskOut, VoiceRecordOut, EventOut, HandoffOut, EventTypeOut, SpeechTypeOut, HealthDbOut)
 * 필드명을 바꾸지 않는다. 서버 규격이 바뀌면 이 파일만 맞춰 수정한다.
 */

export interface Task {
  task_id: string
  block_id: string
  zone_id: string
  task_type: string
  status: string
  updated_at: string | null
}

export interface VoiceRecord {
  voice_id: string
  worker_id: string | null
  zone_id: string | null
  block_id: string | null
  task_id: string | null
  transcript: string
  recorded_at: string | null
}

export interface OvotEvent {
  event_id: number
  voice_id: string
  task_id: string | null
  event_type: string
  event_status: string
  speech_type: string | null
  summary: string | null
  created_at: string | null
}

export interface Handoff {
  handoff_id: number
  task_id: string
  from_zone_id: string
  to_zone_id: string
  status: string
  requested_at: string | null
  accepted_at: string | null
  completed_at: string | null
}

export interface EventType {
  event_type: string
  category_code: string
  description: string
}

export interface SpeechType {
  speech_type: string
  description: string
}

export interface HealthDb {
  status: string
  database?: string | null
  user?: string | null
  version?: string | null
  detail?: string | null
}

/** OVOT-Backend constants.py 와 동일하게 유지 */
export const EVENT_STATUSES = ['PENDING_VALIDATION', 'NEEDS_CONFIRMATION', 'CONFIRMED', 'REJECTED'] as const
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
export const HANDOFF_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['DONE', 'REJECTED'],
  DONE: [],
  REJECTED: [],
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  PENDING_VALIDATION: '검증 대기',
  NEEDS_CONFIRMATION: '확인 필요',
  CONFIRMED: '확인됨',
  REJECTED: '반려',
}
export const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: '대기',
  IN_PROGRESS: '진행 중',
  DONE: '완료',
  CANCELLED: '취소',
}
export const HANDOFF_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '요청',
  ACCEPTED: '수락',
  IN_PROGRESS: '진행',
  DONE: '완료',
  REJECTED: '반려',
}
/** 상태 변경 버튼 문구 */
export const HANDOFF_ACTION_LABEL: Record<string, string> = {
  ACCEPTED: '수락',
  IN_PROGRESS: '진행 시작',
  DONE: '완료',
  REJECTED: '반려',
}

/** 한 번의 조회 주기에서 받은 서버 데이터 묶음 */
export interface Snapshot {
  tasks: Task[]
  voices: VoiceRecord[]
  events: OvotEvent[]
  handoffs: Handoff[]
  eventTypes: EventType[]
  speechTypes: SpeechType[]
  health: { server: boolean; db: HealthDb | null }
  receivedAt: number
}
