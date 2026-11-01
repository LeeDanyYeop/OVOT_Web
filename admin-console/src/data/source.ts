/**
 * 데이터 소스 추상화.
 * - LiveSource: OVOT-Backend REST 를 주기적으로 조회
 * - DemoSource: 명시적으로 DEMO 모드를 켰을 때만 사용하는 메모리 샘플 데이터
 * 나중에 서버가 WebSocket/SSE 를 제공하면 subscribe 를 구현한 소스로 교체하면 된다.
 */
import { ApiError } from '../api/http'
import { createOvotApi, type OvotApi } from '../api/ovotApi'
import type { AppConfig } from '../config'
import type { EventType, Handoff, HealthDb, OvotEvent, Snapshot, SpeechType, Task } from '../types'

export interface DataSource {
  readonly kind: 'live' | 'demo'
  fetchSnapshot(signal: AbortSignal): Promise<Snapshot>
  updateEventStatus(eventId: number, status: 'CONFIRMED' | 'REJECTED'): Promise<OvotEvent>
  updateTaskStatus(taskId: string, status: string): Promise<Task>
  createHandoff(body: { task_id: string; from_zone_id: string; to_zone_id: string }): Promise<Handoff>
  updateHandoffStatus(handoffId: number, status: string): Promise<Handoff>
}

export class LiveSource implements DataSource {
  readonly kind = 'live' as const
  private api: OvotApi
  private codes: { eventTypes: EventType[]; speechTypes: SpeechType[] } | null = null
  private limit: number

  constructor(cfg: AppConfig) {
    this.api = createOvotApi({ baseUrl: cfg.apiBaseUrl, timeoutMs: cfg.requestTimeoutMs })
    this.limit = Math.min(Math.max(cfg.listLimit, 1), 1000)
  }

  async fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
    // 1) 서버 생존 확인 — 실패하면 그대로 오류(이전 데이터는 화면에서 '오래됨'으로 표시)
    await this.api.health(signal)

    // 2) DB 상태 — 503 이어도 서버 응답 본문을 그대로 보여준다
    let db: HealthDb | null = null
    try {
      db = await this.api.healthDb(signal)
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        const d = e.details as HealthDb | undefined
        db = { status: 'error', detail: d?.detail ?? e.message }
      } else throw e
    }
    if (db.status !== 'ok') {
      throw new ApiError('http', 503, `DB 연결 오류: ${db.detail ?? '원인 미상'}`)
    }

    // 3) 코드표는 한 번만 받는다 (서버 재시작 시에도 값이 거의 바뀌지 않음)
    if (!this.codes) {
      const [eventTypes, speechTypes] = await Promise.all([this.api.listEventTypes(signal), this.api.listSpeechTypes(signal)])
      this.codes = { eventTypes, speechTypes }
    }

    const [tasks, voices, events, handoffs] = await Promise.all([
      this.api.listTasks({}, signal),
      this.api.listVoiceRecords({ limit: this.limit }, signal),
      this.api.listEvents({ limit: this.limit }, signal),
      this.api.listHandoffs({}, signal),
    ])

    return {
      tasks,
      voices,
      events,
      handoffs,
      eventTypes: this.codes.eventTypes,
      speechTypes: this.codes.speechTypes,
      health: { server: true, db },
      receivedAt: Date.now(),
    }
  }

  updateEventStatus(eventId: number, status: 'CONFIRMED' | 'REJECTED') {
    return this.api.updateEventStatus(eventId, status)
  }
  updateTaskStatus(taskId: string, status: string) {
    return this.api.updateTaskStatus(taskId, status)
  }
  createHandoff(body: { task_id: string; from_zone_id: string; to_zone_id: string }) {
    return this.api.createHandoff(body)
  }
  updateHandoffStatus(handoffId: number, status: string) {
    return this.api.updateHandoffStatus(handoffId, status)
  }
}
