import { useEffect, useState } from 'react'
import { hhmm } from '../lib/format'
import type { WorkdayBrief } from '../types'

// FR-10 일일 보고 — 관제가 그날 이 작업자의 전사문으로 쓴 보고 (가이드 문구는 쓰지 않는다)
const ADMIN = 'https://admin.ovot.workers.dev'
type DailyItem = { text: string; evidence: string[] }
type Daily = {
  count: number
  empty?: boolean
  error?: string
  headline: string
  done: DailyItem[]
  issues: DailyItem[]
  next: DailyItem[]
  sources: Record<string, { kind: 'voice' | 'order' | 'drawing'; time: string; block: string | null; text: string }>
}

interface Props {
  brief: WorkdayBrief | null // null while it is being prepared
  workerId: string | null
  error: string | null
  photo: string
  onClose: () => void
  onRetry: () => void
}

/** '오늘의 업무 정리' shown after 퇴근하기: what was done today and what comes next. */
export function BriefingScreen({ brief, workerId, error, photo, onClose, onRetry }: Props) {
  const [photoOk, setPhotoOk] = useState(true)
  const [daily, setDaily] = useState<Daily | null>(null)
  const [dailyState, setDailyState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const date = brief?.facts.date
  const name = brief?.facts.worker.name ?? ''
  useEffect(() => {
    if (!date || !workerId) return
    let alive = true
    setDailyState('loading')
    fetch(`${ADMIN}/api/daily?worker=${encodeURIComponent(workerId)}&date=${date}&name=${encodeURIComponent(name)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Daily) => { if (alive) { setDaily(d); setDailyState(d.error ? 'fail' : 'ok') } })
      .catch(() => alive && setDailyState('fail'))
    return () => { alive = false }
  }, [date, workerId, name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && brief && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [brief, onClose])

  const f = brief?.facts
  const s = brief?.summary
  const headline = daily?.headline || s?.headline
  const stats = brief?.stats ?? []

  return (
    <div className="brief" role="dialog" aria-modal="true" aria-label="오늘의 업무 정리">
      <header className="brief-bar">
        <span>오늘의 업무 정리</span>
        {f && <span className="brief-date">{f.date.replaceAll('-', '. ')}</span>}
      </header>

      {!brief ? (
        <div className="brief-wait" aria-live="polite">
          {error ? (
            <>
              <p className="brief-wait-title">정리하지 못했어요</p>
              <p className="brief-wait-sub">{error}</p>
              <div className="brief-wait-actions">
                <button className="assist-btn" onClick={onClose}>
                  닫기
                </button>
                <button className="assist-btn is-dark" onClick={onRetry}>
                  다시 시도
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="brief-spinner" aria-hidden="true" />
              <p className="brief-wait-title">오늘 업무를 정리하고 있어요</p>
              <p className="brief-wait-sub">퇴근 기록을 남기고 다음 할 일을 확인하는 중이에요</p>
            </>
          )}
        </div>
      ) : (
        <div className="brief-body">
          <section className="brief-hero">
            {photoOk ? (
              <img className="brief-photo" src={photo} alt="" onError={() => setPhotoOk(false)} />
            ) : (
              <span className="brief-photo speaker-initial">{f?.worker.name.slice(0, 1)}</span>
            )}
            <h1 className="brief-headline">{headline}</h1>
            <p className="brief-time">
              {f?.check_in_at ? `${hhmm(f.check_in_at)} 출근` : '출근 기록 없음'} · {hhmm(f?.check_out_at)} 퇴근
            </p>
          </section>

          <section className="brief-stats" aria-label="오늘 요약">
            {stats.map((x) => (
              <div key={x.label} className="brief-stat">
                <strong>{x.value}</strong>
                <span>{x.label}</span>
              </div>
            ))}
          </section>

          {dailyState === 'loading' ? (
            <p className="brief-daily-note">오늘 전사된 대화로 보고를 정리하고 있어요…</p>
          ) : dailyState === 'fail' ? (
            <p className="brief-daily-note">전사 기록을 불러오지 못했어요{daily?.error ? ` (${daily.error})` : ''}</p>
          ) : daily?.empty ? (
            <p className="brief-daily-note">오늘 전사된 현장 대화가 없어요</p>
          ) : daily && (
            <>
              <BriefList title="오늘 한 일" items={daily.done} />
              <BriefList title="발생 문제" items={daily.issues} warn />
              <BriefList title="다음에 할 일" items={daily.next} accent />
              <p className="brief-daily-note">오늘 전사된 대화 {daily.count}건 기준</p>
            </>
          )}

          {f?.assignment && (
            <p className="brief-foot-note">
              {f.assignment}
              {f.current_step ? ` · 현재 ${f.current_step}` : ''}
            </p>
          )}

          <button className="assist-btn is-dark brief-done" onClick={onClose}>
            확인
          </button>
        </div>
      )}
    </div>
  )
}

// 전사문 원문은 보여주지 않는다 — 정리된 문장만
function BriefList({ title, items, accent, warn }: { title: string; items: DailyItem[]; accent?: boolean; warn?: boolean }) {
  if (items.length === 0) return null
  return (
    <section className="brief-section">
      <h2>{title}</h2>
      <ul className={`brief-list ${accent ? 'is-accent' : ''} ${warn ? 'is-warn' : ''}`}>
        {items.map((it, i) => (
          <li key={i}>{it.text}</li>
        ))}
      </ul>
    </section>
  )
}
