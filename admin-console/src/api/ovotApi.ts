/**
 * OVOT-Backend REST 엔드포인트 (routers/*.py 와 1:1).
 * 존재하지 않는 경로(WebSocket·SSE·음성 파일 등)는 호출하지 않는다.
 */
import type { EventType, Handoff, HealthDb, OvotEvent, SpeechType, Task, VoiceRecord } from '../types'
import { request, type HttpOptions } from './http'

export function createOvotApi(opts: HttpOptions) {
  return {
    health: (signal?: AbortSignal) => request<{ status: string }>(opts, 'GET', '/health', { signal }),
    /** 연결 실패 시 503 + {status:'error', detail} */
    healthDb: (signal?: AbortSignal) => request<HealthDb>(opts, 'GET', '/health/db', { signal }),

    listTasks: (q: { zone_id?: string; block_id?: string; status?: string } = {}, signal?: AbortSignal) =>
      request<Task[]>(opts, 'GET', '/tasks', { query: q, signal }),
    getTask: (taskId: string, signal?: AbortSignal) =>
      request<Task>(opts, 'GET', `/tasks/${encodeURIComponent(taskId)}`, { signal }),
    /** body: { status } — PENDING / IN_PROGRESS / DONE / CANCELLED */
    updateTaskStatus: (taskId: string, status: string) =>
      request<Task>(opts, 'PATCH', `/tasks/${encodeURIComponent(taskId)}/status`, { body: { status } }),

    /** limit 1~1000, recorded_at 내림차순 */
    listVoiceRecords: (q: { task_id?: string; worker_id?: string; zone_id?: string; limit?: number } = {}, signal?: AbortSignal) =>
      request<VoiceRecord[]>(opts, 'GET', '/voice-records', { query: q, signal }),

    /** limit 1~1000, event_id 내림차순 */
    listEvents: (
      q: { voice_id?: string; task_id?: string; event_type?: string; event_status?: string; speech_type?: string; limit?: number } = {},
      signal?: AbortSignal,
    ) => request<OvotEvent[]>(opts, 'GET', '/events', { query: q, signal }),
    /** body: { event_status } — CONFIRMED / REJECTED 등 처리 상태 4종 */
    updateEventStatus: (eventId: number, event_status: string) =>
      request<OvotEvent>(opts, 'PATCH', `/events/${eventId}/status`, { body: { event_status } }),
    listEventTypes: (signal?: AbortSignal) => request<EventType[]>(opts, 'GET', '/event-types', { signal }),
    listSpeechTypes: (signal?: AbortSignal) => request<SpeechType[]>(opts, 'GET', '/speech-types', { signal }),

    listHandoffs: (q: { task_id?: string; status?: string; from_zone_id?: string; to_zone_id?: string } = {}, signal?: AbortSignal) =>
      request<Handoff[]>(opts, 'GET', '/handoffs', { query: q, signal }),
    createHandoff: (body: { task_id: string; from_zone_id: string; to_zone_id: string }) =>
      request<Handoff>(opts, 'POST', '/handoffs', { body }),
    /** 허용 전이 외에는 409 */
    updateHandoffStatus: (handoffId: number, status: string) =>
      request<Handoff>(opts, 'PATCH', `/handoffs/${handoffId}/status`, { body: { status } }),
  }
}

export type OvotApi = ReturnType<typeof createOvotApi>
