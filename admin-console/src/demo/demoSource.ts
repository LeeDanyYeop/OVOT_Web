/**
 * DEMO 전용 데이터 소스. 사용자가 DEMO 모드를 직접 선택했을 때만 쓰인다.
 * LIVE 연결이 실패해도 자동으로 이 소스로 바뀌지 않는다.
 * 상태 전이 규칙은 OVOT-Backend 와 같게 흉내 내되, 변경 내용은 이 탭의 메모리에만 남는다.
 */
import { ApiError } from '../api/http'
import type { DataSource } from '../data/source'
import { HANDOFF_TRANSITIONS, TASK_STATUSES, type Handoff, type OvotEvent, type Snapshot, type Task, type VoiceRecord } from '../types'
import codes from './codes.json'
import scenario from './scenario.json'

function todayAt(hhmm: string | null): string | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DemoSource implements DataSource {
  readonly kind = 'demo' as const
  private tasks: Task[]
  private voices: VoiceRecord[]
  private events: OvotEvent[]
  private handoffs: Handoff[]

  constructor() {
    this.tasks = scenario.tasks.map((t) => ({ ...t, updated_at: todayAt(t.updated_at) }))
    this.voices = scenario.voice_records.map(({ at, ...v }) => ({ ...v, recorded_at: todayAt(at) }))
    this.events = scenario.events.map(({ at, ...e }, i) => ({ ...e, event_id: i + 1, created_at: todayAt(at) }))
    this.handoffs = scenario.handoffs.map((h, i) => ({
      ...h,
      handoff_id: i + 1,
      requested_at: todayAt(h.requested_at),
      accepted_at: todayAt(h.accepted_at),
      completed_at: todayAt(h.completed_at),
    }))
  }

  async fetchSnapshot(): Promise<Snapshot> {
    await wait(250)
    const byTimeDesc = <T,>(arr: T[], key: (x: T) => string | null) =>
      [...arr].sort((a, b) => (key(b) ?? '').localeCompare(key(a) ?? ''))
    return {
      tasks: structuredClone(this.tasks),
      voices: structuredClone(byTimeDesc(this.voices, (v) => v.recorded_at)),
      events: structuredClone([...this.events].sort((a, b) => b.event_id - a.event_id)),
      handoffs: structuredClone([...this.handoffs].sort((a, b) => b.handoff_id - a.handoff_id)),
      eventTypes: codes.event_types,
      speechTypes: codes.speech_types,
      health: { server: true, db: { status: 'ok', database: 'DEMO (메모리)' } },
      receivedAt: Date.now(),
    }
  }

  async updateEventStatus(eventId: number, status: 'CONFIRMED' | 'REJECTED') {
    await wait(300)
    const ev = this.events.find((e) => e.event_id === eventId)
    if (!ev) throw new ApiError('http', 404, `이벤트를 찾을 수 없습니다: ${eventId}`)
    ev.event_status = status
    return structuredClone(ev)
  }

  async updateTaskStatus(taskId: string, status: string) {
    await wait(300)
    const t = this.tasks.find((x) => x.task_id === taskId)
    if (!t) throw new ApiError('http', 404, `작업을 찾을 수 없습니다: ${taskId}`)
    if (!(TASK_STATUSES as readonly string[]).includes(status)) throw new ApiError('http', 422, '허용되지 않는 상태값입니다.')
    t.status = status
    t.updated_at = new Date().toISOString()
    return structuredClone(t)
  }

  async createHandoff(body: { task_id: string; from_zone_id: string; to_zone_id: string }) {
    await wait(300)
    if (!this.tasks.some((t) => t.task_id === body.task_id)) throw new ApiError('http', 404, `작업을 찾을 수 없습니다: ${body.task_id}`)
    if (body.from_zone_id === body.to_zone_id) throw new ApiError('http', 422, 'from_zone_id 와 to_zone_id 는 달라야 합니다')
    const h: Handoff = {
      ...body,
      handoff_id: Math.max(0, ...this.handoffs.map((x) => x.handoff_id)) + 1,
      status: 'REQUESTED',
      requested_at: new Date().toISOString(),
      accepted_at: null,
      completed_at: null,
    }
    this.handoffs.push(h)
    return structuredClone(h)
  }

  async updateHandoffStatus(handoffId: number, status: string) {
    await wait(300)
    const h = this.handoffs.find((x) => x.handoff_id === handoffId)
    if (!h) throw new ApiError('http', 404, `인계 요청을 찾을 수 없습니다: ${handoffId}`)
    const allowed = HANDOFF_TRANSITIONS[h.status] ?? []
    if (!allowed.includes(status)) throw new ApiError('http', 409, `'${h.status}' 상태에서 '${status}' 로 변경할 수 없습니다.`)
    h.status = status
    const now = new Date().toISOString()
    if (status === 'ACCEPTED') h.accepted_at = now
    if (status === 'DONE' || status === 'REJECTED') h.completed_at = now
    return structuredClone(h)
  }
}
