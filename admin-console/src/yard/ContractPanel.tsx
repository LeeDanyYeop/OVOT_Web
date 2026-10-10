/**
 * 구역 화면 오른쪽: 담당 하청사(가상 예시)와 원청 조선사 ↔ 하청 일정표.
 * 데이터는 src/data/contracts.ts (지금은 예시 JSON). 서버 작업 상태와 섞지 않는다.
 */
import { useMemo } from 'react'
import { CONTRACT_SOURCE, PRINCIPAL_LABEL, STATE_LABEL, getContract, milestoneStates } from '../data/contracts'

const DAY = 86400000
const parse = (iso: string) => new Date(`${iso}T00:00:00`).getTime()
const md = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`
}
const ymd = (iso: string) => iso.replace(/-/g, '.')

export function ContractPanel({ zoneId, today = new Date() }: { zoneId: string; today?: Date }) {
  const c = useMemo(() => getContract(zoneId), [zoneId])
  if (!c) {
    return (
      <div className="yd-copy yd-contract">
        <span className="yd-no">하청 · 일정</span>
        <p>이 구역에 연결된 하청사 정보가 없습니다. (src/settings/contracts.json)</p>
      </div>
    )
  }
  const states = milestoneStates(c.milestones, today)
  const t0 = parse(c.start)
  const t1 = parse(c.end)
  const span = Math.max(DAY, t1 - t0)
  const pos = (ms: number) => Math.min(100, Math.max(0, ((ms - t0) / span) * 100))
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const todayIn = todayMs >= t0 && todayMs <= t1
  const doneUntil = c.milestones.reduce((acc, m) => (m.done ? Math.max(acc, parse(m.date)) : acc), t0)

  return (
    <div className="yd-copy yd-contract" data-zone={zoneId}>
      <div className="yc-head">
        <span className="yc-logo" aria-hidden>
          {c.initial}
        </span>
        <div>
          <strong>
            {c.company}
            <em>가상 · 예시</em>
          </strong>
          <span className="yc-rel">
            {PRINCIPAL_LABEL} <i>↔</i> 하청
          </span>
        </div>
      </div>

      <dl className="yc-info">
        <div>
          <dt>담당 공정</dt>
          <dd>{c.scope}</dd>
        </div>
        <div>
          <dt>대상 선박</dt>
          <dd>{c.vessel}</dd>
        </div>
        <div>
          <dt>계약 기간</dt>
          <dd className="num">
            {ymd(c.start)} – {ymd(c.end)}
          </dd>
        </div>
      </dl>

      <div className="yc-gantt" aria-label="계약 기간 막대">
        <div className="yc-track">
          <span className="yc-fill" style={{ width: `${pos(doneUntil)}%` }} />
          {c.milestones.map((m, i) => (
            <i key={m.name} className={`yc-tick ${states[i]}`} style={{ left: `${pos(parse(m.date))}%` }} title={`${m.name} · ${md(m.date)}`} />
          ))}
          {todayIn && <b className="yc-today" style={{ left: `${pos(todayMs)}%` }} title="오늘" />}
        </div>
        <div className="yc-scale num">
          <span>{md(c.start)}</span>
          {todayIn && (
            <span className="yc-today-label" style={{ left: `${pos(todayMs)}%` }}>
              오늘
            </span>
          )}
          <span>{md(c.end)}</span>
        </div>
      </div>

      <ol className="yc-list">
        {c.milestones.map((m, i) => (
          <li key={m.name} className={states[i]} data-state={states[i]}>
            <span className="yc-dot" aria-hidden />
            <span className="yc-name">{m.name}</span>
            <span className="yc-date num">{md(m.date)}</span>
            <span className={`yc-state ${states[i]}`}>{STATE_LABEL[states[i]]}</span>
          </li>
        ))}
      </ol>

      <p className="yc-note">{CONTRACT_SOURCE.note}</p>
    </div>
  )
}
