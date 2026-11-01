/**
 * 작업 진행률 계산 — 서버에는 작업별 세부 진척률이 없으므로 tasks.status 만으로 계산한다.
 *   진행률 = DONE 작업 수 ÷ (전체 작업 수 − CANCELLED 작업 수)
 */
import type { ZoneSummary } from '../data/model'
import type { Task } from '../types'

export interface ZoneProgress {
  hasTasks: boolean
  done: number
  target: number
  ratio: number
  percent: number
}

export function progressOf(tasks: Task[]): ZoneProgress {
  const target = tasks.filter((t) => t.status !== 'CANCELLED').length
  const done = tasks.filter((t) => t.status === 'DONE').length
  const ratio = target ? done / target : 0
  return { hasTasks: tasks.length > 0, done, target, ratio, percent: Math.round(ratio * 100) }
}

export const zoneProgress = (z: ZoneSummary) => progressOf(z.tasks)

export const PROGRESS_RULE = '진행률 = 완료(DONE) 작업 ÷ (전체 − 취소) · 서버 작업 상태 기준'
