/**
 * 플래그 판정과 화면용 파생 값 — 컴포넌트와 분리된 순수 함수.
 * 입력은 DemoState(결정 상태) 하나. 서버 API 가 생기면 이 함수들의 입력/출력만 응답으로 바꾸면 된다.
 */
import {
  ACTOR_LABEL,
  BASE_HISTORY,
  DECISION_CLOCK,
  EVENT,
  FLAGS,
  FLAG_BY_ID,
  SUBCONTRACT,
  type Actor,
  type FlagDef,
  type FlagId,
} from './scenarioB03'

export interface DemoState {
  decisions: Record<FlagId, string | null>
  /** 결정한 순서 — 이력 시각(10:24, 10:25, 10:26)을 정하는 데 쓴다 */
  order: FlagId[]
  /** 작업자 PWA 에서 W-106 이 '확인했습니다'를 누른 시각 */
  w106AckAt: string | null
}

export const INITIAL_STATE: DemoState = {
  decisions: { ver: null, ack: null, yard: null },
  order: [],
  w106AckAt: null,
}

/** open: 확인 필요 · decided: 반장이 결정함 · resolved: 결정 없이 해소됨(작업자가 앱에서 수신 확인) */
export type FlagStatus = 'open' | 'decided' | 'resolved'

export function flagStatus(id: FlagId, s: DemoState): FlagStatus {
  if (s.decisions[id]) return 'decided'
  if (id === 'ack' && s.w106AckAt) return 'resolved'
  return 'open'
}

export const openFlags = (s: DemoState): FlagDef[] => FLAGS.filter((f) => flagStatus(f.id, s) === 'open')
export const openCount = (s: DemoState): number => openFlags(s).length

export function choiceOf(id: FlagId, s: DemoState) {
  const key = s.decisions[id]
  const f = FLAG_BY_ID[id]
  return key ? [f.primary, f.secondary].find((b) => b.key === key) ?? null : null
}

export const decidedAt = (id: FlagId, s: DemoState): string | null => {
  const i = s.order.indexOf(id)
  return i < 0 ? null : DECISION_CLOCK[i] ?? DECISION_CLOCK[DECISION_CLOCK.length - 1]
}

export function decide(s: DemoState, id: FlagId, key: string): DemoState {
  if (s.decisions[id]) return s
  return { ...s, decisions: { ...s.decisions, [id]: key }, order: [...s.order, id] }
}

export function undo(s: DemoState, id: FlagId): DemoState {
  if (!s.decisions[id]) return s
  return { ...s, decisions: { ...s.decisions, [id]: null }, order: s.order.filter((x) => x !== id) }
}

/** 블록 이동 시각 — yard 를 16:00로 조정하면 16:00 */
export const moveTime = (s: DemoState): string => (s.decisions.yard === 'reschedule' ? '16:00' : '15:00')

export function w106Confirmed(s: DemoState): boolean {
  return s.decisions.ack === 'verbal' || !!s.w106AckAt
}

export function kpis(s: DemoState) {
  const ackDone = 1 + (w106Confirmed(s) ? 1 : 0)
  return { needs: openCount(s), activeEvents: 1, ackDone, ackTotal: 2, move: moveTime(s), moved: s.decisions.yard === 'reschedule' }
}

export type Tone = 'warn' | 'ok'

/** 현황 지도 구역 라벨 — 미결이 있으면 주황, 모두 결정되면 파랑 */
export function zoneNotes(s: DemoState): Record<string, { text: string; tone: Tone }> {
  const n = openCount(s)
  const yardOpen = flagStatus('yard', s) === 'open'
  return {
    'ZONE-A': n > 0 ? { text: `B-03 · 확인 ${n}`, tone: 'warn' } : { text: 'B-03 · 조치 완료', tone: 'ok' },
    'ZONE-E': yardOpen ? { text: '크레인 C-2 · 확인 1', tone: 'warn' } : { text: '크레인 C-2 · 조정 완료', tone: 'ok' },
  }
}

export interface Row {
  label: string
  value: string
  ok: boolean
}

export function instructionRows(s: DemoState): { boundary1: Row[]; boundary2: Row[] } {
  const ver = s.decisions.ver
  const ack = s.decisions.ack
  const yard = s.decisions.yard
  const ackRow: Row = s.w106AckAt
    ? { label: 'W-106 응우옌 반 투', value: `${s.w106AckAt} 앱에서 수신 확인`, ok: true }
    : ack === 'verbal'
      ? { label: 'W-106 응우옌 반 투', value: '반장 구두 확인', ok: true }
      : ack === 'resend'
        ? { label: 'W-106 응우옌 반 투', value: '재전송 · 확인 대기', ok: false }
        : { label: 'W-106 응우옌 반 투', value: '미확인 · 15분 경과', ok: false }
  const yardRow: Row =
    yard === 'reschedule'
      ? { label: 'B-03 블록 이동', value: '16:00 · 조정됨', ok: true }
      : yard === 'dismiss'
        ? { label: 'B-03 블록 이동', value: '15:00 · 반장 판단 유지', ok: true }
        : { label: 'B-03 블록 이동', value: '15:00 · 크레인 충돌', ok: false }
  const verRow: Row =
    ver === 'reissue'
      ? { label: `협력사 작업지시서 ${SUBCONTRACT.id}`, value: 'R1 재발행 요청됨', ok: true }
      : ver === 'dismiss'
        ? { label: `협력사 작업지시서 ${SUBCONTRACT.id}`, value: 'R0 · 반장 판단 유지', ok: true }
        : { label: `협력사 작업지시서 ${SUBCONTRACT.id}`, value: 'R0 · 불일치', ok: false }
  return {
    boundary1: [
      { label: '설계 도면', value: `${EVENT.to} · 09:12 등록`, ok: true },
      { label: '반장 무전 지시', value: `${EVENT.to} · 10:05`, ok: true },
      verRow,
    ],
    boundary2: [{ label: 'W-104 이정훈', value: '10:08 확인', ok: true }, ackRow, yardRow],
  }
}

export interface HistoryItem {
  at: string
  actor: Actor
  actorLabel: string
  text: string
  search: string
}

export function timeline(s: DemoState): HistoryItem[] {
  const items: HistoryItem[] = BASE_HISTORY.map((h) => ({ ...h, actorLabel: ACTOR_LABEL[h.actor], search: h.search ?? h.text }))
  if (s.w106AckAt) {
    items.push({
      at: s.w106AckAt,
      actor: 'partner',
      actorLabel: ACTOR_LABEL.partner,
      text: 'W-106 응우옌 반 투 · 지시 수신 확인 (작업자 앱)',
      search: 'W-106 응우옌 반 투 수신 확인 Đã nhận',
    })
  }
  for (const id of s.order) {
    const f = FLAG_BY_ID[id]
    const c = choiceOf(id, s)
    if (!c) continue
    items.push({
      at: decidedAt(id, s)!,
      actor: 'lead',
      actorLabel: ACTOR_LABEL.lead,
      text: `박반장 · ${c.log} (${f.kind})`,
      search: `박반장 ${c.log} ${f.kind} B-03`,
    })
  }
  return items.map((it, i) => ({ it, i })).sort((a, b) => a.it.at.localeCompare(b.it.at) || a.i - b.i).map((x) => x.it)
}

/** 설계자 홈 — 현장 반영 여부 n/3 */
export function reflection(s: DemoState): { count: number; total: number; rows: Row[] } {
  const ver = s.decisions.ver
  const yard = s.decisions.yard
  const rows: Row[] = [
    { label: '반장 무전 지시', value: `${EVENT.to} 반영`, ok: true },
    {
      label: `협력사 작업지시서 ${SUBCONTRACT.id}`,
      value: ver === 'reissue' ? 'R1 재발행 요청됨' : ver === 'dismiss' ? 'R0 유지 (반장 판단)' : 'R0 참조 · 확인 중',
      ok: !!ver,
    },
    {
      label: '현장 작업 착수',
      value: yard ? `${moveTime(s)} 예정` : '일정 미정 · 크레인 확인 중',
      ok: !!yard,
    },
  ]
  return { count: rows.filter((r) => r.ok).length, total: rows.length, rows }
}
