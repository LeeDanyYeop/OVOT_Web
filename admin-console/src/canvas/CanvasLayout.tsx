/**
 * 캔버스형 관제 화면 (기본 레이아웃).
 * 가운데 디지털트윈(선박 평면도 또는 Unity), 왼쪽 탐색·작업구역 패널, 오른쪽 상황·확인 패널,
 * 떠 있는 위젯(시계·지금 확인할 것), 오른쪽 아래 대화 바 → 대화 기록 시트.
 * 데이터·동작은 App.tsx 의 Console 이 그대로 넘겨준다 (기존 화면과 같은 로직).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppConfig, ZoneMap } from '../config'
import { ALL, UNASSIGNED, handoffMatches, refMatches, type Model } from '../data/model'
import type { SyncState } from '../data/useOvotData'
import type { Snapshot } from '../types'
import { hms } from '../lib/format'
import { Avatar, Icon } from '../components/ui'
import { ConversationPanel } from '../components/ConversationPanel'
import { InsightPanel, type Tab } from '../components/InsightPanel'
import { UnityTwin } from '../twin/UnityTwin'
import { buildTwinTasks, type TwinHandle, type TwinZoneState } from '../twin/bridge'
import type { ShipTwinHandle } from './ShipTwin'
import { PointShip } from './PointShip'
import './canvas.css'

type Actions = Parameters<typeof InsightPanel>[0]['actions']

export interface CanvasProps {
  config: AppConfig
  zoneMap: ZoneMap
  sync: SyncState & { refresh: () => Promise<boolean> }
  model: Model | null
  zone: string
  onSelectZone: (z: string) => void
  voiceId: string | null
  onSelectVoice: (v: string | null) => void
  focusVoice: { id: string; nonce: number } | null
  onShowVoice: (v: string) => void
  focusEvent: { id: number; nonce: number } | null
  onFocusEvent: (id: number) => void
  actions: Actions
  stale: boolean
  loadError: string | null
  onOpenSettings: () => void
  footer?: ReactNode
}

const HEADLINE: Record<string, string> = { IN_PROGRESS: '진행 중', PENDING: '대기', DONE: '완료', CANCELLED: '취소', MIXED: '혼합' }
type Nav = 'overview' | 'convo' | 'confirm' | 'work'

function todayStr(iso: string | null) {
  return iso ? new Date(iso).toDateString() === new Date().toDateString() : false
}

export function CanvasLayout(p: CanvasProps) {
  const { config, zoneMap, sync, model, zone } = p
  const snap: Snapshot | null = sync.snapshot
  const [nav, setNav] = useState<Nav>('overview')
  const [convoOpen, setConvoOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [tabReq, setTabReq] = useState<{ tab: Tab; nonce: number } | null>(null)
  const [queryReq, setQueryReq] = useState<{ q: string; nonce: number } | null>(null)
  const [search, setSearch] = useState('')
  const [unityFailed, setUnityFailed] = useState<string | null>(null)
  const [twinMsg, setTwinMsg] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const ship = useRef<ShipTwinHandle>(null)
  const unity = useRef<TwinHandle>(null)
  const useUnity = config.unity.enabled && !unityFailed

  // 캔버스 화면은 어두운 테마 (설정 시트·알림까지 같은 톤으로)
  useEffect(() => {
    document.body.classList.add('theme-dark')
    return () => document.body.classList.remove('theme-dark')
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const zoneStates: TwinZoneState[] = useMemo(
    () =>
      model?.zones.map((z) => ({
        zone_id: z.zone_id,
        label: z.label,
        unity_object: zoneMap.zones.find((m) => m.zone_id === z.zone_id)?.unityObject ?? null,
        status: z.headline === 'NO_DATA' && z.voiceCount === 0 ? 'nodata' : z.needsConfirmation > 0 ? 'attention' : 'normal',
        needs_confirmation: z.needsConfirmation,
        task_headline: z.tasks.length ? `작업 ${z.tasks.length} · ${HEADLINE[z.headline] ?? z.headline}` : z.voiceCount ? `발화 ${z.voiceCount} · 작업 없음` : '작업 데이터 없음',
      })) ?? [],
    [model, zoneMap],
  )

  const selectedId = zone === ALL || zone === UNASSIGNED ? null : zone
  useEffect(() => {
    unity.current?.selectZone(selectedId)
  }, [selectedId])
  useEffect(() => {
    if (!snap || p.stale) return
    unity.current?.applyState({ generated_at: new Date(snap.receivedAt).toISOString(), zones: zoneStates, tasks: buildTwinTasks(zoneMap, snap.tasks) })
  }, [snap, zoneStates, zoneMap, p.stale])

  // 선택 구역 기준 집계 (서버 데이터로 계산 가능한 값만)
  const scoped = useMemo(() => {
    if (!snap || !model) return null
    const events = snap.events.filter((e) => refMatches(model.eventZone.get(e.event_id), zone))
    const needs = events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    const tasks = snap.tasks.filter((t) => zone === ALL || t.zone_id === zone)
    const voices = snap.voices.filter((v) => refMatches(model.voiceZone.get(v.voice_id), zone))
    const handoffs = snap.handoffs.filter((h) => handoffMatches(h, zone) && !['DONE', 'REJECTED'].includes(h.status))
    const latest = [...voices].sort((a, b) => (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''))[0]
    return {
      needs,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      tasks: tasks.length,
      todayVoices: voices.filter((v) => todayStr(v.recorded_at)).length,
      handoffs: handoffs.length,
      latest,
    }
  }, [snap, model, zone])

  const zoneTitle = zone === ALL ? '전체 구역' : zone === UNASSIGNED ? '구역 미지정' : model?.zoneLabel(zone) ?? zone

  const go = (n: Nav) => {
    setNav(n)
    if (n === 'convo') setConvoOpen(true)
    if (n === 'confirm' || n === 'work') {
      setTabReq({ tab: n, nonce: Date.now() })
      setRightOpen(true)
    }
    if (n === 'overview') {
      setConvoOpen(false)
      setTabReq({ tab: 'confirm', nonce: Date.now() })
    }
  }

  const conn =
    sync.status === 'loading' && !snap ? { cls: 'loading', text: '연결 확인 중' } : sync.status === 'error' ? { cls: 'err', text: sync.error?.startsWith('DB') ? 'DB 연결 오류' : '서버 연결 오류' } : { cls: 'ok', text: config.mode === 'demo' ? '샘플 데이터' : '서버 연결 정상' }

  const d = new Date(now)
  const hourDeg = ((d.getHours() % 12) + d.getMinutes() / 60) * 30
  const minDeg = (d.getMinutes() + d.getSeconds() / 60) * 6
  const secDeg = d.getSeconds() * 6

  const insightHead = (
    <div className="cv-right-head">
      <div className="cv-right-title">
        <div>
          <h2>AI 상황 요약</h2>
          <p>{zoneTitle} · 서버에 저장된 분석 결과</p>
        </div>
        <button className="icon-btn cv-only-drawer" onClick={() => setRightOpen(false)} aria-label="패널 닫기">
          <Icon name="close" />
        </button>
      </div>
      <div className="cv-stats">
        {[
          { n: scoped?.needs.length, l: '확인 필요', warn: (scoped?.needs.length ?? 0) > 0, icon: 'alert' },
          { n: scoped?.inProgress, l: '진행 중 작업', sub: scoped ? `전체 ${scoped.tasks}` : undefined, icon: 'fit' },
          { n: scoped?.todayVoices, l: '오늘 발화', icon: 'user' },
          { n: scoped?.handoffs, l: '진행 중 인계', icon: 'arrow' },
        ].map((s) => (
          <div key={s.l} className={`cv-stat${s.warn ? ' warn' : ''}`}>
            <span className="cv-stat-icon">
              <Icon name={s.icon} />
            </span>
            <strong className="num">{s.n ?? '—'}</strong>
            <span>
              {s.l}
              {s.sub && <small> · {s.sub}</small>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="cv-page">
      <div className="cv-window">
        <header className="cv-bar">
          <div className="cv-brand">
            <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
            <span>관리자 관제</span>
            {config.mode === 'demo' && <span className="demo-chip">DEMO · 샘플 데이터</span>}
          </div>
          <div className="cv-bar-right">
            <span className={`conn ${conn.cls}`} role="status" aria-live="polite">
              <span className="dot" />
              {conn.text}
              <time>· {sync.lastSuccessAt ? `${hms(sync.lastSuccessAt)} 갱신` : '갱신 전'}</time>
            </span>
            <button className="tb-btn cv-drawer-btn" onClick={() => setRightOpen((o) => !o)}>
              AI 요약{scoped && scoped.needs.length > 0 ? ` · ${scoped.needs.length}` : ''}
            </button>
            <button className="tb-btn" onClick={p.onOpenSettings} aria-label="연결 설정" title="연결 설정">
              <Icon name="settings" />
            </button>
            <button className="tb-btn tb-who" onClick={p.onOpenSettings} aria-label="관리자 정보">
              <span className="avatar">
                <Icon name="user" />
              </span>
              <span className="tb-who-text">
                <strong>관리자</strong>
                <span>계정 연동 전</span>
              </span>
            </button>
          </div>
        </header>
        {p.footer}

        <div className="cv-canvas">
          {/* 가운데: 디지털트윈 */}
          <div className="cv-twin">
            {!snap ? (
              <div className="twin-overlay">{p.loadError ? '서버에서 데이터를 받지 못했습니다' : '구역 데이터를 불러오는 중…'}</div>
            ) : useUnity ? (
              <UnityTwin ref={unity} unity={config.unity} zoneMap={zoneMap} tasks={snap.tasks} onSelectZone={(z) => p.onSelectZone(z ?? ALL)} onMessage={setTwinMsg} onFailed={setUnityFailed} />
            ) : (
              <PointShip ref={ship} zoneMap={zoneMap} zones={zoneStates} selectedZoneId={selectedId} onSelectZone={(z) => p.onSelectZone(z ?? ALL)} handoffs={snap.handoffs} />
            )}
          </div>

          <div className="cv-twin-badge">
            {useUnity ? <span className="badge badge-dark">Unity 디지털트윈</span> : <span className="badge badge-line">Unity 연결 전 · 점 구름 선박 (배치 예시)</span>}
            {unityFailed && <span className="tag tag-warn" title={unityFailed}>Unity 로드 실패</span>}
            {twinMsg && <span className="tag tag-warn">{twinMsg}</span>}
          </div>

          {!useUnity && snap && (
            <div className="cv-zoom">
              <button className="icon-btn" onClick={() => ship.current?.zoomIn()} aria-label="확대" title="확대"><Icon name="plus" /></button>
              <button className="icon-btn" onClick={() => ship.current?.zoomOut()} aria-label="축소" title="축소"><Icon name="minus" /></button>
              <button className="icon-btn" onClick={() => ship.current?.reset()} aria-label="전체 보기" title="전체 보기"><Icon name="fit" /></button>
            </div>
          )}

          {/* 왼쪽: 탐색 + 작업구역 */}
          <aside className="cv-left cv-float" aria-label="탐색과 작업구역">
            <form
              className="cv-search"
              onSubmit={(e) => {
                e.preventDefault()
                setQueryReq({ q: search.trim(), nonce: Date.now() })
                setConvoOpen(true)
                setNav('convo')
              }}
            >
              <input className="search" type="search" placeholder="작업자·작업·전사문 검색" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="대화 검색" />
            </form>
            <nav className="cv-nav">
              {(
                [
                  ['overview', '현황', 'fit', null],
                  ['convo', '현장 대화', 'user', null],
                  ['confirm', '확인 요청', 'alert', snap?.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION').length ?? 0],
                  ['work', '작업·인계', 'arrow', null],
                ] as [Nav, string, string, number | null][]
              ).map(([k, label, icon, n]) => (
                <button key={k} className={nav === k ? 'on' : ''} onClick={() => go(k)} aria-current={nav === k}>
                  <Icon name={icon} />
                  <span>{label}</span>
                  {!!n && <em>{n}</em>}
                </button>
              ))}
            </nav>
            <p className="cv-group">작업구역</p>
            <div className="cv-zones">
              <button className={`cv-zone${zone === ALL ? ' on' : ''}`} onClick={() => p.onSelectZone(ALL)} aria-pressed={zone === ALL}>
                <i className="zdot all" />
                <span className="cv-zone-name">전체 구역</span>
                <span className="cv-zone-sub">구역 {model?.zones.length ?? '—'}곳</span>
              </button>
              {model?.zones.map((z) => {
                const st = zoneStates.find((s) => s.zone_id === z.zone_id)
                return (
                  <button key={z.zone_id} className={`cv-zone${zone === z.zone_id ? ' on' : ''}`} onClick={() => p.onSelectZone(z.zone_id)} aria-pressed={zone === z.zone_id}>
                    <i className={`zdot ${st?.status ?? 'nodata'}`} />
                    <span className="cv-zone-name">
                      {z.label} {z.description && <small>{z.description}</small>}
                    </span>
                    {z.needsConfirmation > 0 && <em>{z.needsConfirmation}</em>}
                    <span className="cv-zone-sub">{z.taskTypes.length ? `${z.taskTypes.join(', ')} · ${HEADLINE[z.headline] ?? ''}` : '등록된 작업 없음'}</span>
                  </button>
                )
              })}
              {model && (model.unassigned.voices > 0 || model.unassigned.events > 0) && (
                <button className={`cv-zone${zone === UNASSIGNED ? ' on' : ''}`} onClick={() => p.onSelectZone(UNASSIGNED)}>
                  <i className="zdot nodata" />
                  <span className="cv-zone-name">구역 미지정</span>
                  <span className="cv-zone-sub">발화 {model.unassigned.voices} · 분석 {model.unassigned.events}</span>
                </button>
              )}
            </div>
            <div className="cv-left-foot">
              <button onClick={p.onOpenSettings}>
                <Icon name="settings" /> 설정
              </button>
              <span>작업자 수 · 위치 API 미연동</span>
            </div>
          </aside>

          {/* 떠 있는 위젯: 시계 */}
          <div className="cv-clock cv-float" aria-label="현재 시각과 데이터 수신 시각">
            <svg viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r="30" className="face" />
              {Array.from({ length: 12 }, (_, i) => (
                <line key={i} x1="32" y1="5" x2="32" y2={i % 3 ? 8 : 10} className="tick" transform={`rotate(${i * 30} 32 32)`} />
              ))}
              <line x1="32" y1="32" x2="32" y2="17" className="hand h" transform={`rotate(${hourDeg} 32 32)`} />
              <line x1="32" y1="32" x2="32" y2="10" className="hand m" transform={`rotate(${minDeg} 32 32)`} />
              <line x1="32" y1="36" x2="32" y2="9" className="hand s" transform={`rotate(${secDeg} 32 32)`} />
              <circle cx="32" cy="32" r="2" className="pivot" />
            </svg>
            <div>
              <strong className="num">{hms(now)}</strong>
              <span className={p.stale ? 'warn' : ''}>
                {p.stale ? '갱신 실패 · ' : '데이터 '}
                {sync.lastSuccessAt ? hms(sync.lastSuccessAt) : '—'}
              </span>
            </div>
          </div>

          {/* 떠 있는 위젯: 지금 확인할 것 */}
          {scoped && (
            <div className="cv-sticky" aria-label="지금 확인할 것">
              <div className="cv-sticky-head">
                <strong>지금 확인할 것</strong>
                <span>{scoped.needs.length}건</span>
              </div>
              {scoped.needs.length === 0 ? (
                <p className="cv-sticky-empty">확인이 필요한 항목이 없습니다</p>
              ) : (
                <ul>
                  {scoped.needs.slice(0, 3).map((e) => (
                    <li key={e.event_id}>
                      <button
                        onClick={() => {
                          p.onFocusEvent(e.event_id)
                          setRightOpen(true)
                          setNav('confirm')
                        }}
                      >
                        <i />
                        <span>{e.summary ?? '(요약 없음)'}</span>
                      </button>
                    </li>
                  ))}
                  {scoped.needs.length > 3 && <li className="more">외 {scoped.needs.length - 3}건 · AI 상황 요약에서 확인</li>}
                </ul>
              )}
            </div>
          )}

          {/* 오른쪽 아래: 실시간 대화 바 */}
          {!convoOpen && (
            <button className="cv-convo-bar cv-float" onClick={() => go('convo')}>
              <Avatar />
              {scoped?.latest ? (
                <span className="cv-convo-text">
                  <b>{scoped.latest.worker_id ?? '작업자 미상'}</b>
                  <time className="num">{hms(scoped.latest.recorded_at)}</time>
                  <span>{scoped.latest.transcript}</span>
                </span>
              ) : (
                <span className="cv-convo-text muted">{snap ? '저장된 발화 기록 없음' : '대화 기록 불러오는 중…'}</span>
              )}
              <span className="cv-convo-open">대화 기록</span>
            </button>
          )}

          {convoOpen && (
            <div className="cv-sheet cv-float">
              <ConversationPanel
                snapshot={snap}
                model={model}
                selectedZone={zone}
                selectedVoiceId={p.voiceId}
                focusVoice={p.focusVoice}
                onSelectVoice={(v) => {
                  p.onSelectVoice(v)
                  if (v) setRightOpen(true)
                }}
                pollIntervalMs={config.pollIntervalMs}
                onRefresh={() => sync.refresh()}
                inFlight={sync.inFlight}
                loadError={p.loadError}
                queryRequest={queryReq}
                onClose={() => {
                  setConvoOpen(false)
                  setNav('overview')
                }}
              />
            </div>
          )}

          {/* 오른쪽: 상황·확인 */}
          <aside className={`cv-right cv-float${rightOpen ? ' open' : ''}`} aria-label="AI 상황 요약">
            <InsightPanel
              snapshot={snap}
              model={model}
              selectedZone={zone}
              selectedVoiceId={p.voiceId}
              onClearVoice={() => p.onSelectVoice(null)}
              onShowVoice={(v) => {
                setConvoOpen(true)
                setNav('convo')
                p.onShowVoice(v)
              }}
              focusEvent={p.focusEvent}
              actions={p.actions}
              stale={p.stale}
              loadError={p.loadError}
              head={insightHead}
              tabRequest={tabReq}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
