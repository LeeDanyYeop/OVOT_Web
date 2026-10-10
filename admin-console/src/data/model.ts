/**
 * 서버 데이터 → 화면용 파생 데이터.
 * 핵심 규칙
 *  - 이벤트에는 zone_id 가 없으므로 (발화의 zone_id, 작업의 zone_id) 로 구역을 해석한다.
 *  - 두 값이 다르면 '불일치'로 남기고 어느 쪽으로도 확정하지 않는다 (두 구역 필터 모두에 노출 + 표시).
 *  - 아무것도 없으면 '구역 미지정'.
 */
import type { ZoneMap } from '../config'
import type { EventType, Handoff, OvotEvent, Snapshot, SpeechType, Task, VoiceRecord } from '../types'

export type ZoneRef =
  | { kind: 'zone'; zoneId: string; via: 'voice' | 'task' | 'both' }
  | { kind: 'conflict'; voiceZone: string; taskZone: string }
  | { kind: 'none' }

export const UNASSIGNED = '__unassigned__'
export const ALL = '__all__'

export interface ZoneSummary {
  zone_id: string
  label: string
  description: string | null
  inConfig: boolean
  tasks: Task[]
  taskTypes: string[]
  blocks: string[]
  statusCounts: Record<string, number>
  headline: 'IN_PROGRESS' | 'PENDING' | 'DONE' | 'CANCELLED' | 'MIXED' | 'NO_DATA'
  needsConfirmation: number
  voiceCount: number
  handoffsOpen: number
}

export interface Model {
  taskById: Map<string, Task>
  voiceById: Map<string, VoiceRecord>
  eventsByVoice: Map<string, OvotEvent[]>
  eventTypeByCode: Map<string, EventType>
  speechTypeByCode: Map<string, SpeechType>
  voiceZone: Map<string, ZoneRef>
  eventZone: Map<number, ZoneRef>
  zones: ZoneSummary[]
  unassigned: { voices: number; events: number; needsConfirmation: number }
  zoneLabel: (zoneId: string | null | undefined) => string
}

export function refMatches(ref: ZoneRef | undefined, zone: string): boolean {
  if (zone === ALL) return true
  if (!ref) return false
  if (zone === UNASSIGNED) return ref.kind === 'none'
  if (ref.kind === 'zone') return ref.zoneId === zone
  if (ref.kind === 'conflict') return ref.voiceZone === zone || ref.taskZone === zone
  return false
}

export function handoffMatches(h: Handoff, zone: string): boolean {
  return zone === ALL || h.from_zone_id === zone || h.to_zone_id === zone
}

export function buildModel(s: Snapshot, zoneMap: ZoneMap): Model {
  const taskById = new Map(s.tasks.map((t) => [t.task_id, t]))
  const voiceById = new Map(s.voices.map((v) => [v.voice_id, v]))
  const eventTypeByCode = new Map(s.eventTypes.map((e) => [e.event_type, e]))
  const speechTypeByCode = new Map(s.speechTypes.map((e) => [e.speech_type, e]))
  const eventsByVoice = new Map<string, OvotEvent[]>()
  for (const e of s.events) {
    const arr = eventsByVoice.get(e.voice_id) ?? []
    arr.push(e)
    eventsByVoice.set(e.voice_id, arr)
  }

  const voiceZone = new Map<string, ZoneRef>()
  for (const v of s.voices) {
    if (v.zone_id) voiceZone.set(v.voice_id, { kind: 'zone', zoneId: v.zone_id, via: 'voice' })
    else {
      const tz = v.task_id ? taskById.get(v.task_id)?.zone_id : undefined
      voiceZone.set(v.voice_id, tz ? { kind: 'zone', zoneId: tz, via: 'task' } : { kind: 'none' })
    }
  }

  const eventZone = new Map<number, ZoneRef>()
  for (const e of s.events) {
    const vz = voiceById.get(e.voice_id)?.zone_id ?? null
    const tz = e.task_id ? taskById.get(e.task_id)?.zone_id ?? null : null
    let ref: ZoneRef
    if (vz && tz) ref = vz === tz ? { kind: 'zone', zoneId: vz, via: 'both' } : { kind: 'conflict', voiceZone: vz, taskZone: tz }
    else if (vz) ref = { kind: 'zone', zoneId: vz, via: 'voice' }
    else if (tz) ref = { kind: 'zone', zoneId: tz, via: 'task' }
    else ref = { kind: 'none' }
    eventZone.set(e.event_id, ref)
  }

  // 구역 목록 = 매핑 설정의 구역(순서 유지) + 데이터에만 있는 구역
  const cfgById = new Map(zoneMap.zones.map((z) => [z.zone_id, z]))
  const ids: string[] = zoneMap.zones.map((z) => z.zone_id)
  const add = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  s.tasks.forEach((t) => add(t.zone_id))
  s.voices.forEach((v) => add(v.zone_id))
  s.handoffs.forEach((h) => {
    add(h.from_zone_id)
    add(h.to_zone_id)
  })

  const zoneLabel = (id: string | null | undefined) => {
    if (!id) return '구역 미지정'
    return cfgById.get(id)?.label ?? id
  }

  const zones: ZoneSummary[] = ids.map((id) => {
    const tasks = s.tasks.filter((t) => t.zone_id === id)
    const statusCounts: Record<string, number> = {}
    tasks.forEach((t) => (statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1))
    let headline: ZoneSummary['headline'] = 'NO_DATA'
    if (tasks.length) {
      if (statusCounts.IN_PROGRESS) headline = 'IN_PROGRESS'
      else if (statusCounts.PENDING) headline = 'PENDING'
      else if (Object.keys(statusCounts).length === 1) headline = (Object.keys(statusCounts)[0] as ZoneSummary['headline']) ?? 'MIXED'
      else headline = 'MIXED'
    }
    const cfg = cfgById.get(id)
    return {
      zone_id: id,
      label: cfg?.label ?? id,
      description: cfg?.description ?? null,
      inConfig: !!cfg,
      tasks,
      taskTypes: [...new Set(tasks.map((t) => t.task_type))],
      blocks: [...new Set(tasks.map((t) => t.block_id))],
      statusCounts,
      headline,
      needsConfirmation: s.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION' && refMatches(eventZone.get(e.event_id), id)).length,
      voiceCount: s.voices.filter((v) => refMatches(voiceZone.get(v.voice_id), id)).length,
      handoffsOpen: s.handoffs.filter((h) => handoffMatches(h, id) && !['DONE', 'REJECTED'].includes(h.status)).length,
    }
  })

  const unassigned = {
    voices: s.voices.filter((v) => voiceZone.get(v.voice_id)?.kind === 'none').length,
    events: s.events.filter((e) => eventZone.get(e.event_id)?.kind === 'none').length,
    needsConfirmation: s.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION' && eventZone.get(e.event_id)?.kind === 'none').length,
  }

  return { taskById, voiceById, eventsByVoice, eventTypeByCode, speechTypeByCode, voiceZone, eventZone, zones, unassigned, zoneLabel }
}

/** 이벤트 코드 상위 범주 이름. 서버에 범주 조회 API 가 없어 migrations/006 의 확정값을 표시용으로만 사용한다. */
export const CATEGORY_NAME: Record<string, string> = {
  WS: '작업 시작',
  WI: '작업 지시',
  WP: '작업 진행',
  WC: '작업 완료',
  QC: '품질·검사',
  SM: '안전',
  ME: '자재·설비',
  CO: '작업장 간 협업',
}
