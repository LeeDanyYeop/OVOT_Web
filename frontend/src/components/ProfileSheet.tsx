import { useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { SOURCE_LABEL, dayAndTime } from '../lib/format'
import type { LocationEvent, MeResponse } from '../types'

interface Props {
  onClose: () => void
}

/** Full-screen profile panel. It overlays the worker screen (instead of navigating away)
 * so an active voice stream keeps running while the profile is open. */
export function ProfileSheet({ onClose }: Props) {
  const [data, setData] = useState<MeResponse | null>(null)
  const [history, setHistory] = useState<LocationEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [photoOk, setPhotoOk] = useState(true)

  useEffect(() => {
    Promise.all([api.me(), api.history(10)])
      .then(([m, h]) => {
        setData(m)
        setHistory(h.items)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : '프로필을 불러오지 못했습니다'))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const w = data?.worker
  const loc = data?.current_location
  const task = data?.assignment

  return (
    <div className="profile" role="dialog" aria-modal="true" aria-label="내 프로필">
      <header className="profile-bar">
        <button className="profile-back" onClick={onClose}>
          <span aria-hidden="true">‹</span> 돌아가기
        </button>
      </header>

      <div className="profile-body">
        {error && <p className="alert alert-error">{error}</p>}

        <section className="profile-hero">
          {w && photoOk ? (
            <img className="profile-photo" src={`/avatars/${w.id}.jpg`} alt="" onError={() => setPhotoOk(false)} />
          ) : (
            <span className="profile-photo speaker-initial" aria-hidden="true">
              {w?.name.slice(0, 1)}
            </span>
          )}
          <h1 className="profile-name">{w?.name ?? '…'}</h1>
          <p className="profile-sub">{w ? `${w.team} · ${w.role}` : ''}</p>
        </section>

        <section className="profile-group" aria-label="기본 정보">
          <div className="profile-row">
            <span>사번</span>
            <strong>{w?.employee_number ?? '—'}</strong>
          </div>
          <div className="profile-row">
            <span>작업자 ID</span>
            <strong>{w?.id ?? '—'}</strong>
          </div>
        </section>

        <section className="profile-group" aria-label="현재 상태">
          <div className="profile-row">
            <span>현재 위치</span>
            <strong>{loc ? loc.zone.name : '미등록'}</strong>
          </div>
          <div className="profile-row">
            <span>등록 시각</span>
            <strong>{loc ? `${dayAndTime(loc.updated_at)} · ${SOURCE_LABEL[loc.source]}` : '—'}</strong>
          </div>
          <div className="profile-row">
            <span>배정 작업</span>
            <strong>{task ? task.title : '없음'}</strong>
          </div>
          {task && (
            <div className="profile-row">
              <span>작업 상태</span>
              <strong className={task.readiness === 'ready' ? 'is-ok' : 'is-warn'}>
                {task.readiness === 'ready' ? '작업 가능' : `${task.zone.name} 진입 필요`}
              </strong>
            </div>
          )}
        </section>

        <section aria-labelledby="profile-hist">
          <h2 id="profile-hist" className="profile-h2">
            최근 이동
          </h2>
          <div className="profile-group">
            {history.length === 0 ? (
              <div className="profile-row">
                <span>기록이 없습니다</span>
              </div>
            ) : (
              history.map((e) => (
                <div className="profile-row" key={e.event_id}>
                  <span>{dayAndTime(e.occurred_at)}</span>
                  <strong>
                    {e.zone.name} <small>{SOURCE_LABEL[e.source]}</small>
                  </strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
