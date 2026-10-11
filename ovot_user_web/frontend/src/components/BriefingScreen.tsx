import { useEffect, useState } from 'react'
import { hhmm } from '../lib/format'
import type { WorkdayBrief } from '../types'

interface Props {
  brief: WorkdayBrief | null // null while it is being prepared
  error: string | null
  photo: string
  onClose: () => void
  onRetry: () => void
}

/** '오늘의 업무 정리' shown after 퇴근하기: what was done today and what comes next. */
export function BriefingScreen({ brief, error, photo, onClose, onRetry }: Props) {
  const [photoOk, setPhotoOk] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && brief && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [brief, onClose])

  const f = brief?.facts
  const s = brief?.summary

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
            <h1 className="brief-headline">{s?.headline}</h1>
            <p className="brief-time">
              {f?.check_in_at ? `${hhmm(f.check_in_at)} 출근` : '출근 기록 없음'} · {hhmm(f?.check_out_at)} 퇴근
            </p>
          </section>

          <section className="brief-stats" aria-label="오늘 요약">
            {brief.stats.map((x) => (
              <div key={x.label} className="brief-stat">
                <strong>{x.value}</strong>
                <span>{x.label}</span>
              </div>
            ))}
          </section>

          <BriefList title="오늘 한 일" items={s?.done ?? []} />
          <BriefList title="다음에 할 일" items={s?.next ?? []} accent />
          {s && s.reminders.length > 0 && <BriefList title="확인할 것" items={s.reminders} warn />}

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

export function BriefList({ title, items, accent, warn }: { title: string; items: string[]; accent?: boolean; warn?: boolean }) {
  if (items.length === 0) return null
  return (
    <section className="brief-section">
      <h2>{title}</h2>
      <ul className={`brief-list ${accent ? 'is-accent' : ''} ${warn ? 'is-warn' : ''}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  )
}
