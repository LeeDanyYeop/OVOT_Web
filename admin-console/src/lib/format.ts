const pad = (n: number) => String(n).padStart(2, '0')

export function parseTime(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function hms(t: number | Date | string | null | undefined): string {
  const d = typeof t === 'number' ? new Date(t) : typeof t === 'string' ? parseTime(t) : t ?? null
  if (!d) return '—'
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function hm(t: string | null | undefined): string {
  const d = parseTime(t)
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'
}

export function dayLabel(t: string | null | undefined): string {
  const d = parseTime(t)
  if (!d) return '시각 정보 없음'
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const base = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  if (same(d, today)) return `오늘 · ${base}`
  if (same(d, y)) return `어제 · ${base}`
  return base
}

export function ago(ms: number | null, now: number): string {
  if (!ms) return '—'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}초 전`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}분 전`
  return `${Math.round(m / 60)}시간 전`
}
