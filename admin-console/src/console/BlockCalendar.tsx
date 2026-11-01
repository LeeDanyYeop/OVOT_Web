import { useState } from 'react'
import { schedules, type ScheduleItem } from './blockSchedule'

// 블록 일정 달력 — 한 달을 주 단위로 나누고, 여러 날에 걸친 일정은 그 주 안에서 한 줄 막대로 이어 그린다.
// 주가 바뀌면 다음 줄에서 이어지고, 이어지는 쪽 끝은 모서리를 둥글리지 않는다
const DAY = 86400000
const dayNo = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY }
const todayNo = () => { const t = new Date(); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / DAY }
const dateOf = (n: number) => new Date(n * DAY)
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const MAX_LANES = 4

type Seg = { item: ScheduleItem; c1: number; c2: number; lane: number; head: boolean; tail: boolean }

function weekSegments(items: ScheduleItem[], weekStart: number): Seg[] {
  const weekEnd = weekStart + 6
  const hits = items
    .map((item) => ({ item, s: dayNo(item.start), e: dayNo(item.end) }))
    .filter(({ s, e }) => e >= weekStart && s <= weekEnd)
    .sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s))
  const laneEnds: number[] = []
  return hits.map(({ item, s, e }) => {
    const c1 = Math.max(s, weekStart) - weekStart
    const c2 = Math.min(e, weekEnd) - weekStart
    let lane = laneEnds.findIndex((end) => end < c1)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = c2
    return { item, c1, c2, lane, head: s >= weekStart, tail: e <= weekEnd }
  })
}

export function BlockCalendar({ block }: { block: string }) {
  const items = schedules[block] ?? []
  const today = todayNo()
  const [month, setMonth] = useState(() => { const t = dateOf(today); return { y: t.getUTCFullYear(), m: t.getUTCMonth() } })
  const first = Date.UTC(month.y, month.m, 1) / DAY
  const last = Date.UTC(month.y, month.m + 1, 0) / DAY
  const gridStart = first - dateOf(first).getUTCDay()
  const weeks = Math.ceil((last - gridStart + 1) / 7)
  const move = (d: number) => setMonth(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }))
  const thisMonth = (() => { const t = dateOf(today); return t.getUTCFullYear() === month.y && t.getUTCMonth() === month.m })()

  if (!items.length) return null
  return (
    <section className="dp-cal" aria-label={`${block} 일정`}>
      <header>
        <h3>일정</h3>
        <span className="dp-cal-month">{month.y}년 {month.m + 1}월</span>
        <div className="dp-cal-nav">
          <button aria-label="이전 달" onClick={() => move(-1)}>‹</button>
          <button className={thisMonth ? 'is-on' : ''} onClick={() => { const t = dateOf(today); setMonth({ y: t.getUTCFullYear(), m: t.getUTCMonth() }) }}>오늘</button>
          <button aria-label="다음 달" onClick={() => move(1)}>›</button>
        </div>
      </header>
      <div className="dp-cal-head">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
      {Array.from({ length: weeks }, (_, w) => {
        const ws = gridStart + w * 7
        const segs = weekSegments(items, ws)
        const shown = segs.filter((s) => s.lane < MAX_LANES)
        return (
          <div className="dp-cal-week" key={ws}>
            {WEEK.map((_, c) => {
              const n = ws + c
              const more = segs.filter((s) => s.lane >= MAX_LANES && s.c1 <= c && s.c2 >= c).length
              return (
                <div key={c} className={`dp-cal-day${n < first || n > last ? ' is-out' : ''}${n === today ? ' is-today' : ''}`} style={{ gridColumn: c + 1 }}>
                  <b>{dateOf(n).getUTCDate()}</b>
                  {more > 0 && <small>+{more}</small>}
                </div>
              )
            })}
            {shown.map((s) => {
              const done = dayNo(s.item.end) < today
              const now = dayNo(s.item.start) <= today && today <= dayNo(s.item.end)
              return (
                <span key={`${s.item.title}-${s.item.start}`} title={`${s.item.title} · ${s.item.team} · ${s.item.start.slice(5).replace('-', '/')}~${s.item.end.slice(5).replace('-', '/')}`}
                  className={`dp-cal-bar${s.head ? '' : ' is-cont-l'}${s.tail ? '' : ' is-cont-r'}${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}
                  data-team={s.item.team} style={{ gridColumn: `${s.c1 + 1} / ${s.c2 + 2}`, gridRow: s.lane + 2 }}>
                  {s.item.title}
                </span>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}
