/** Voice streaming runs only during working hours (local time, 24h). */
export const WORK_HOURS = {
  start: 6, // 06:00
  lunchStart: 12, // 12:00
  lunchEnd: 13, // 13:00
  end: 18, // 18:00 (퇴근)
}

export type OffReason = 'lunch' | 'after' | 'before'

const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** null while streaming is allowed, otherwise why it is not. */
export function offHoursReason(hour: number): OffReason | null {
  const { start, lunchStart, lunchEnd, end } = WORK_HOURS
  if (hour < start) return 'before'
  if (hour >= end) return 'after'
  if (hour >= lunchStart && hour < lunchEnd) return 'lunch'
  return null
}

export const OFF_LABEL: Record<OffReason, string> = {
  lunch: `점심시간(${fmt(WORK_HOURS.lunchStart)}–${fmt(WORK_HOURS.lunchEnd)})`,
  after: `퇴근 시간(${fmt(WORK_HOURS.end)}) 이후`,
  before: `근무 시작(${fmt(WORK_HOURS.start)}) 전`,
}

/** Shown when streaming was running and the clock crossed into off-hours. */
export const AUTO_STOP_TEXT: Record<OffReason, string> = {
  lunch: '점심시간이 되어 스트리밍을 자동 종료했습니다',
  after: '퇴근 시간이 되어 스트리밍을 자동 종료했습니다',
  before: '근무 시간이 아니라 스트리밍을 종료했습니다',
}

/** One-line hint on the waiting screen during off-hours. */
export const OFF_HINT: Record<OffReason, string> = {
  lunch: '지금은 점심시간이라 위치만 등록됩니다',
  after: '퇴근 시간이 지나 위치만 등록됩니다',
  before: '근무 시작 전이라 위치만 등록됩니다',
}
