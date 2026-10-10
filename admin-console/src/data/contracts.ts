/**
 * 작업구역별 하청사·계약·일정 — 지금은 예시 파일(src/settings/contracts.json)에서 읽는다.
 * OVOT-Backend 에 계약·일정 API 가 생기면 getContract() 만 서버 호출로 바꾸면 된다.
 * 일정 상태는 이 데이터의 done 값과 날짜로만 계산하고, 서버 tasks.status 와 섞지 않는다.
 */
import data from '../settings/contracts.json'

export interface Milestone {
  name: string
  date: string
  done: boolean
}
export interface Contract {
  zone_id: string
  company: string
  initial: string
  scope: string
  vessel: string
  start: string
  end: string
  milestones: Milestone[]
}
export type MilestoneState = 'done' | 'active' | 'planned' | 'late'

export const PRINCIPAL_LABEL: string = data.principal
export const CONTRACT_SOURCE = { kind: 'example' as const, note: '예시 데이터 · 서버 미연동 (계약·일정 API 없음)' }

export function getContract(zoneId: string): Contract | null {
  return (data.contracts as Contract[]).find((c) => c.zone_id === zoneId) ?? null
}

const dayStart = (iso: string) => new Date(`${iso}T00:00:00`)

/** 오늘 기준 상태: 완료 / 지연(예정일 지남·미완료) / 진행 중(아직 안 지난 첫 미완료) / 예정 */
export function milestoneStates(ms: Milestone[], today = new Date()): MilestoneState[] {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let activeGiven = false
  return ms.map((m) => {
    if (m.done) return 'done'
    if (dayStart(m.date) < t0) return 'late'
    if (!activeGiven) {
      activeGiven = true
      return 'active'
    }
    return 'planned'
  })
}

export const STATE_LABEL: Record<MilestoneState, string> = { done: '완료', active: '진행 중', planned: '예정', late: '지연' }
