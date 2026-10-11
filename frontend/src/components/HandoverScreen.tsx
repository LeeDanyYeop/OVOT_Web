import { useState } from 'react'
import type { WorkdayHandover } from '../types'
import { BriefList } from './BriefingScreen'

interface Props {
  handover: WorkdayHandover | null // null while it is being prepared
  error: string | null
  photo: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
  onRetry: () => void
}

/** '인수인계' shown after 출근하기: what happened in the zone yesterday and today's work.
 * 확인 registers the worker in that zone and starts streaming. */
export function HandoverScreen({ handover, error, photo, busy, onConfirm, onClose, onRetry }: Props) {
  const [photoOk, setPhotoOk] = useState(true)
  const f = handover?.facts
  const s = handover?.summary
  const [, mm, dd] = (f?.date ?? '').split('-')

  return (
    <div className="brief" role="dialog" aria-modal="true" aria-label="인수인계">
      <header className="brief-bar">
        <span>인수인계</span>
        {f && <span className="brief-date">어제 {Number(mm)}월 {Number(dd)}일 기록</span>}
      </header>

      {!handover ? (
        <div className="brief-wait" aria-live="polite">
          {error ? (
            <>
              <p className="brief-wait-title">불러오지 못했어요</p>
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
              <p className="brief-wait-title">어제 작업을 정리하고 있어요</p>
              <p className="brief-wait-sub">오늘 이 구역에서 할 일을 확인하는 중이에요</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="brief-body">
            <section className="brief-hero">
              {photoOk ? (
                <img className="brief-photo" src={photo} alt="" onError={() => setPhotoOk(false)} />
              ) : (
                <span className="brief-photo speaker-initial">{f?.worker.name.slice(0, 1)}</span>
              )}
              {f?.zone && <span className="handover-zone">{f.zone}</span>}
              <h1 className="brief-headline">{s?.headline}</h1>
            </section>

            {f?.progress && (
              <p className="handover-progress">
                <span>어제까지</span>
                <strong>{f.progress}</strong>
              </p>
            )}

            <BriefList title="어제 이 구역에서" items={s?.yesterday ?? []} />
            {s && s.today.length > 0 && (
              <section className="brief-section">
                <h2>오늘 할 일</h2>
                <ol className="brief-list is-steps">
                  {s.today.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ol>
              </section>
            )}
            {s && s.watch.length > 0 && <BriefList title="꼭 확인할 것" items={s.watch} warn />}

            {f?.owner && <p className="brief-foot-note">담당 · {f.owner}</p>}
          </div>
          <div className="handover-actions">
            <button className="assist-btn is-dark brief-done" onClick={onConfirm} disabled={busy}>
              {busy ? '등록 중…' : '확인'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
