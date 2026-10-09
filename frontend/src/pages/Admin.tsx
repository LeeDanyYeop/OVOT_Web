import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { RiskBadge } from '../components/RiskBadge'
import { VoiceClipsPanel } from '../components/VoiceClipsPanel'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { REJECT_LABEL, SOURCE_LABEL, ago, hhmm, hhmmss } from '../lib/format'
import { useEventHub, type HubStatus } from '../lib/useEventHub'
import type { HubMessage, LocationEvent, TagAlert, VoiceClipInfo, WorkersLocations, ZoneWorker, ZonesState } from '../types'

const FLASH_MS = 6000

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

function matchesWorker(w: { name: string; team: string; role: string; employee_number: string; id: string }, q: string) {
  return [w.name, w.team, w.role, w.employee_number, w.id].some((v) => v.toLowerCase().includes(q))
}

const HUB_LABEL: Record<HubStatus, string> = { live: '실시간 연결됨', connecting: '연결 중…', offline: '연결 끊김 · 재연결 중' }

export function AdminPage() {
  const { me } = useAuth()
  const [workers, setWorkers] = useState<WorkersLocations | null>(null)
  const [zones, setZones] = useState<ZonesState | null>(null)
  const [events, setEvents] = useState<LocationEvent[]>([])
  const [alerts, setAlerts] = useState<TagAlert[]>([])
  const [clips, setClips] = useState<VoiceClipInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [flash, setFlash] = useState<Record<string, number>>({})
  const [freshEvents, setFreshEvents] = useState<Set<string>>(new Set())
  const now = useNow(1000)
  const refreshTimer = useRef<number | undefined>(undefined)

  const loadState = useCallback(async () => {
    try {
      const [w, z] = await Promise.all([api.adminWorkers(), api.adminZones()])
      setWorkers(w)
      setZones(z)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '데이터를 불러오지 못했습니다.')
    }
  }, [])

  const loadAll = useCallback(async () => {
    await loadState()
    try {
      const [e, a, v] = await Promise.all([api.adminEvents(50), api.adminTagAlerts(20), api.adminVoiceClips(10)])
      setEvents(e.items)
      setAlerts(a.items)
      setClips(v.items)
    } catch {
      /* surfaced by loadState */
    }
  }, [loadState])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const scheduleStateRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => void loadState(), 150)
  }, [loadState])

  const onHub = useCallback(
    (msg: HubMessage) => {
      if (msg.type === 'ready') {
        void loadAll() // catch up on anything missed while disconnected
      } else if (msg.type === 'worker_location_changed' || msg.type === 'worker_location_confirmed') {
        const ev = msg.data
        setEvents((prev) => [ev, ...prev.filter((p) => p.event_id !== ev.event_id)].slice(0, 100))
        setFlash((prev) => ({ ...prev, [ev.worker_id]: Date.now() }))
        setFreshEvents((prev) => new Set(prev).add(ev.event_id))
        window.setTimeout(
          () =>
            setFreshEvents((prev) => {
              const next = new Set(prev)
              next.delete(ev.event_id)
              return next
            }),
          FLASH_MS,
        )
        scheduleStateRefresh()
      } else if (msg.type === 'voice_clip_recorded') {
        setClips((prev) => [msg.data, ...prev.filter((c) => c.clip_id !== msg.data.clip_id)].slice(0, 20))
      } else if (msg.type === 'tag_scan_rejected') {
        setAlerts((prev) => [msg.data, ...prev.filter((p) => p.id !== msg.data.id)].slice(0, 50))
        scheduleStateRefresh()
      }
    },
    [loadAll, scheduleStateRefresh],
  )
  const hub = useEventHub(onHub)

  const q = query.trim().toLowerCase()
  const visibleZones = useMemo(() => {
    if (!zones) return []
    return zones.zones
      .map((z) => {
        if (!q) return z
        const zoneHit = [z.name, z.id, z.description ?? ''].some((v) => v.toLowerCase().includes(q))
        return zoneHit ? z : { ...z, workers: z.workers.filter((w) => matchesWorker(w, q)) }
      })
      .filter((z) => !q || z.workers.length > 0 || [z.name, z.id].some((v) => v.toLowerCase().includes(q)))
  }, [zones, q])
  const visibleUnregistered = useMemo(
    () => (zones?.unregistered_workers ?? []).filter((w) => !q || matchesWorker(w, q)),
    [zones, q],
  )
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) => !q || matchesWorker(e.worker, q) || e.zone.name.toLowerCase().includes(q) || e.zone_id.toLowerCase().includes(q),
      ),
    [events, q],
  )

  const s = workers?.summary
  const isFlashing = (id: string) => (flash[id] ?? 0) > now - FLASH_MS

  const workerRow = (w: ZoneWorker, extra?: string) => (
    <li key={w.id} className={`worker-row ${isFlashing(w.id) ? 'flash' : ''}`}>
      <div className="worker-row-main">
        <strong>{w.name}</strong>
        <span className="muted">
          {w.team} · {w.role}
        </span>
      </div>
      <div className="worker-row-time">
        {extra ?? (
          <>
            <span>{hhmm(w.updated_at)}</span>
            <span className="muted">
              {w.source ? SOURCE_LABEL[w.source] : ''} · {ago(w.updated_at, now)}
            </span>
          </>
        )}
      </div>
    </li>
  )

  return (
    <div className="admin-page">
      <header className="topbar admin-topbar">
        <Brand subtitle="작업자 위치 관제" />
        <div className={`hub-pill hub-${hub}`} role="status">
          <span className="dot" aria-hidden="true" />
          {HUB_LABEL[hub]}
        </div>
        <div className="topbar-actions">
          <span className="clock" aria-label="현재 시각">
            {hhmmss(new Date(now).toISOString())}
          </span>
          <span className="muted hide-sm">{me?.name}</span>
          <Link className="btn btn-ghost btn-sm" to="/admin/tags">
            태그 관리
          </Link>
          <a className="btn btn-ghost btn-sm" href="/" target="_blank" rel="noreferrer">
            작업자 화면 열기
          </a>
        </div>
      </header>

      <main className="admin-main">
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <section className="kpis" aria-label="요약">
          <div className="kpi">
            <span className="kpi-label">전체 작업자</span>
            <span className="kpi-value">{s?.total_workers ?? '—'}</span>
          </div>
          <div className="kpi kpi-ok">
            <span className="kpi-label">작업구역 등록</span>
            <span className="kpi-value">{s?.in_work_zone ?? '—'}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">작업구역 밖</span>
            <span className="kpi-value">{s?.outside_work_area ?? '—'}</span>
          </div>
          <div className={`kpi ${s && s.unregistered > 0 ? 'kpi-warn' : ''}`}>
            <span className="kpi-label">미등록·확인 필요</span>
            <span className="kpi-value">{s?.unregistered ?? '—'}</span>
          </div>
          <div className={`kpi ${s && s.tag_alerts_24h > 0 ? 'kpi-danger' : ''}`}>
            <span className="kpi-label">태그 경고 (24시간)</span>
            <span className="kpi-value">{s?.tag_alerts_24h ?? '—'}</span>
          </div>
        </section>

        <div className="toolbar">
          <input
            type="search"
            className="search"
            placeholder="작업자 이름·팀·사번 또는 구역 검색"
            aria-label="작업자 또는 구역 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="muted hide-sm">갱신 {hhmmss(workers?.generated_at)}</span>
        </div>

        <div className="admin-grid">
          <section className="zones" aria-label="구역별 작업자">
            {visibleZones.map((z) => (
              <article key={z.id} className={`zone-card risk-${z.is_work_area ? z.risk_level : 'none'}`}>
                <header>
                  <div>
                    <h2>{z.name}</h2>
                    <p className="muted">
                      {z.id} · {z.description}
                    </p>
                  </div>
                  <div className="zone-card-side">
                    <RiskBadge zone={z} />
                    <span className="zone-count" aria-label={`${z.worker_count}명`}>
                      {z.worker_count}
                      <small>명</small>
                    </span>
                  </div>
                </header>
                {z.workers.length === 0 ? (
                  <p className="muted empty">{q ? '검색 결과 없음' : '등록된 작업자 없음'}</p>
                ) : (
                  <ul className="worker-list">{z.workers.map((w) => workerRow(w))}</ul>
                )}
              </article>
            ))}

            <article className="zone-card zone-unregistered">
              <header>
                <div>
                  <h2>미등록 · 확인 필요</h2>
                  <p className="muted">오늘 위치 등록이 없거나 오래된 등록</p>
                </div>
                <span className="zone-count">
                  {zones?.unregistered_workers.length ?? 0}
                  <small>명</small>
                </span>
              </header>
              {visibleUnregistered.length === 0 ? (
                <p className="muted empty">없음</p>
              ) : (
                <ul className="worker-list">
                  {visibleUnregistered.map((w) =>
                    workerRow(w, w.last_zone ? `마지막: ${w.last_zone.name} ${hhmm(w.updated_at)}` : '등록 기록 없음'),
                  )}
                </ul>
              )}
            </article>
          </section>

          <aside className="side">
            <VoiceClipsPanel clips={clips} />

            <section className="panel" aria-labelledby="alerts-h">
              <h2 id="alerts-h">미등록 NFC 태그 경고</h2>
              {alerts.length === 0 ? (
                <p className="muted empty">경고 없음</p>
              ) : (
                <ul className="alert-list">
                  {alerts.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <span className="badge badge-danger">{REJECT_LABEL[a.reason] ?? a.reason}</span>
                      <div>
                        <code>{a.raw_tag_code}</code>
                        <span className="muted">
                          {hhmmss(a.occurred_at)} · {a.worker.name} · {SOURCE_LABEL[a.source]}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel feed-panel" aria-labelledby="feed-h">
              <h2 id="feed-h">실시간 이동 기록</h2>
              {visibleEvents.length === 0 ? (
                <p className="muted empty">기록 없음</p>
              ) : (
                <ol className="feed" aria-live="polite">
                  {visibleEvents.map((e) => (
                    <li key={e.event_id} className={freshEvents.has(e.event_id) ? 'fresh' : ''}>
                      <time>{hhmmss(e.occurred_at)}</time>
                      <div>
                        <p>
                          <strong>{e.worker.name}</strong> <span className="muted">{e.worker.team}</span>
                        </p>
                        <p className="move">
                          {e.event_type === 'worker_location_confirmed' ? (
                            <>
                              {e.zone.name} <span className="muted">재확인</span>
                            </>
                          ) : (
                            <>
                              <span className="muted">{e.previous_zone?.name ?? '최초'}</span>
                              <span aria-label="에서">→</span>
                              <strong>{e.zone.name}</strong>
                            </>
                          )}
                        </p>
                        <p className="muted small">
                          {SOURCE_LABEL[e.source]} · {e.event_id}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
