/**
 * 흰 배경 작업장 화면 (기본 레이아웃).
 * 왼쪽 글자 메뉴 + 큰 제목 2줄 + 회색 타일·번호 글 묶음 + 맨 아래 작업 진행도 바.
 * 주소의 # 경로로 화면을 나눈다: #/ 현황, #/zone/ZONE-A 구역 디지털트윈, #/confirm, #/convo, #/work (#/zones 는 현황으로 이동)
 * 데이터·동작은 App.tsx 의 Console 이 넘겨준다 (기존 화면과 같은 로직).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppConfig, ZoneMap, ZoneMapEntry } from '../config'
import { ALL, refMatches, type Model, type ZoneSummary } from '../data/model'
import type { SyncState } from '../data/useOvotData'
import { TASK_STATUS_LABEL, type Snapshot } from '../types'
import { hm, hms } from '../lib/format'
import { ConversationPanel } from '../components/ConversationPanel'
import { InsightPanel, type Tab } from '../components/InsightPanel'
import { UnityTwin } from '../twin/UnityTwin'
import { buildTwinTasks, type TwinHandle } from '../twin/bridge'
import { YardMap } from './YardMap'
import { ContractPanel } from './ContractPanel'
import { PROGRESS_RULE, progressOf, zoneProgress } from './progress'
import './yard.css'

type Actions = Parameters<typeof InsightPanel>[0]['actions']

export interface YardProps {
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
  actions: Actions
  stale: boolean
  loadError: string | null
  onOpenSettings: () => void
  notices: ReactNode
}

type Route = { page: 'overview' | 'confirm' | 'convo' | 'work' } | { page: 'zone'; id: string }

function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  if (h.startsWith('zone/')) return { page: 'zone', id: h.slice(5) }
  if (['confirm', 'convo', 'work'].includes(h)) return { page: h as 'confirm' }
  return { page: 'overview' }
}
const go = (path: string) => {
  window.location.hash = path
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function YardLayout(p: YardProps) {
  const { config, zoneMap, sync, model } = p
  const snap: Snapshot | null = sync.snapshot
  const [route, setRoute] = useState<Route>(parseHash)
  const [menuOpen, setMenuOpen] = useState(false)
  const [eventTab, setEventTab] = useState<Tab>('confirm')
  // 구역도 ↔ 구역 타일 강조 연동
  const [mapHover, setMapHover] = useState<string | null>(null)
  const [tileHover, setTileHover] = useState<string | null>(null)
  const main = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.classList.add('theme-yard')
    return () => document.body.classList.remove('theme-yard')
  }, [])
  // 메뉴에서 뺀 작업구역 목록 주소는 현황으로 보낸다
  useEffect(() => {
    const fix = () => {
      if (/^#\/?zones\/?$/.test(window.location.hash)) window.location.replace('#/')
    }
    fix()
    window.addEventListener('hashchange', fix)
    return () => window.removeEventListener('hashchange', fix)
  }, [])
  useEffect(() => {
    const on = () => {
      setRoute(parseHash())
      setMenuOpen(false)
      main.current?.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // 구역 화면에 들어오면 전역 선택 구역도 맞춘다 (대화·확인 목록이 같은 구역 기준)
  const routeZone = route.page === 'zone' ? route.id : null
  const { onSelectZone, zone } = p
  useEffect(() => {
    if (routeZone && zone !== routeZone) onSelectZone(routeZone)
  }, [routeZone, zone, onSelectZone])

  // 확인 요청으로 이동 요청(다른 곳에서 클릭)이 오면 확인 페이지로
  useEffect(() => {
    if (p.focusEvent && route.page !== 'zone') go('/confirm')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusEvent])

  const zones = model?.zones ?? []
  const total = useMemo(() => progressOf(snap?.tasks ?? []), [snap])
  const needsAll = snap?.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION').length ?? 0
  const today = new Date()
  const dateLabel = `${today.getFullYear()}.${pad2(today.getMonth() + 1)}.${pad2(today.getDate())}`

  const conn =
    sync.status === 'loading' && !snap ? { cls: 'loading', text: '연결 확인 중' } : sync.status === 'error' ? { cls: 'err', text: sync.error?.startsWith('DB') ? 'DB 연결 오류' : '서버 연결 오류' } : { cls: 'ok', text: config.mode === 'demo' ? '샘플 데이터' : '서버 연결 정상' }

  const nav: [string, string, Route['page'], number?][] = [
    ['현황', '/', 'overview'],
    ['확인 요청', '/confirm', 'confirm', needsAll],
    ['현장 대화', '/convo', 'convo'],
    ['작업·인계', '/work', 'work'],
  ]
  const activeNav = route.page === 'zone' ? 'overview' : route.page

  const insight = (only: Tab, zoneFilter: string) => (
    <InsightPanel
      snapshot={snap}
      model={model}
      selectedZone={zoneFilter}
      selectedVoiceId={p.voiceId}
      onClearVoice={() => p.onSelectVoice(null)}
      onShowVoice={(v) => {
        p.onShowVoice(v)
        if (route.page !== 'zone') go('/convo')
      }}
      focusEvent={p.focusEvent}
      actions={p.actions}
      stale={p.stale}
      loadError={p.loadError}
      only={only}
    />
  )

  const convo = (
    <ConversationPanel
      snapshot={snap}
      model={model}
      selectedZone={p.zone}
      selectedVoiceId={p.voiceId}
      focusVoice={p.focusVoice}
      onSelectVoice={p.onSelectVoice}
      pollIntervalMs={config.pollIntervalMs}
      onRefresh={() => sync.refresh()}
      inFlight={sync.inFlight}
      loadError={p.loadError}
      hideHead
    />
  )

  const zoneChips = (
    <div className="yd-chips" role="group" aria-label="구역 필터">
      <button aria-pressed={p.zone === ALL} onClick={() => p.onSelectZone(ALL)}>전체</button>
      {zones.map((z) => (
        <button key={z.zone_id} aria-pressed={p.zone === z.zone_id} onClick={() => p.onSelectZone(z.zone_id)}>
          {z.label}
        </button>
      ))}
    </div>
  )

  const head = (title: string, sub: ReactNode, extra?: ReactNode, noMeta?: boolean) => (
    <header className="yd-head">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {!noMeta && (
        <div className="yd-head-meta">
          {extra}
          <span>
            {dateLabel} · {sync.lastSuccessAt ? `${hms(sync.lastSuccessAt)} 갱신` : '갱신 전'}
          </span>
        </div>
      )}
    </header>
  )

  const zoneTiles = (startNo: number) =>
    zones.length === 0 ? (
      <p className="yd-empty">{snap ? '표시할 구역이 없습니다.' : '구역 정보를 불러오는 중…'}</p>
    ) : (
      <div className={`yd-grid yd-grid3 yd-grid5${mapHover ? ' linked' : ''}`}>
        {zones.map((z, i) => (
          <ZoneTile
            key={z.zone_id}
            no={startNo + i}
            z={z}
            zoneMap={zoneMap}
            zones={zones}
            lit={mapHover === z.zone_id}
            onHover={(on) => setTileHover(on ? z.zone_id : null)}
          />
        ))}
      </div>
    )

  let content: ReactNode
  if (route.page === 'overview') {
    content = (
      <>
        {head('조선소 작업장', '오늘의 작업 현황', undefined, true)}
        <section className="yd-feature yd-feature-full yd-feature-night">
          <div className="yd-tile yd-tile-wide">
            {model ? (
              <YardMap
                zoneMap={zoneMap}
                zones={zones}
                selectedZoneId={null}
                onSelect={(id) => go(`/zone/${id}`)}
                ariaLabel="조선소 작업장 전체 구역도 · 구역을 누르면 구역 디지털트윈 화면으로 이동"
                rotate
                night
                highlightZoneId={tileHover}
                onHoverZone={setMapHover}
                legendNote={`진하게 칠해진 점 = 완료된 작업 비율, 연한 점 = 미완료. ${PROGRESS_RULE}`}
              />
            ) : (
              <p className="yd-tile-msg">{p.loadError ? '서버에서 데이터를 받지 못했습니다' : '작업장 정보를 불러오는 중…'}</p>
            )}
            <span className="yd-tile-note">배치 예시 · 실제 도면 아님</span>
          </div>
        </section>
        {zoneTiles(1)}
      </>
    )
  } else if (route.page === 'zone') {
    const z = zones.find((x) => x.zone_id === route.id)
    content = z ? (
      <ZoneDetail key={z.zone_id} z={z} {...p} snap={snap} insight={insight} convo={convo} head={head} />
    ) : (
      <>
        {head(route.id, model ? '구역을 찾을 수 없습니다' : '불러오는 중…')}
        <button className="yd-back" onClick={() => go('/')}>← 전체 작업장</button>
      </>
    )
  } else if (route.page === 'confirm') {
    content = (
      <>
        {head('확인 요청', '사람의 확인이 필요한 분석 결과')}
        <div className="yd-toolbar">
          {zoneChips}
          <div className="yd-seg" role="group" aria-label="보기">
            {(
              [
                ['confirm', '확인 필요'],
                ['orders', '지시·보고'],
                ['all', '분석 기록'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button key={k} aria-pressed={eventTab === k} onClick={() => setEventTab(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="yd-sheet">{insight(eventTab, p.zone)}</div>
      </>
    )
  } else if (route.page === 'convo') {
    content = (
      <>
        {head('현장 대화', '저장된 STT 전사문')}
        <div className="yd-toolbar">
          {zoneChips}
          <div className="yd-seg">
            <span className="yd-hint">{Math.round(config.pollIntervalMs / 1000)}초 주기 조회 · 음성 재생 API 미연동</span>
            <button onClick={() => sync.refresh()} disabled={sync.inFlight} aria-label="최신 기록 갱신">
              {sync.inFlight ? '갱신 중…' : '최신 기록 갱신'}
            </button>
          </div>
        </div>
        <div className="yd-sheet yd-convo">{convo}</div>
      </>
    )
  } else {
    content = (
      <>
        {head('작업·인계', '작업 상태와 구역 간 인계')}
        <div className="yd-toolbar">{zoneChips}</div>
        <div className="yd-sheet">{insight('work', p.zone)}</div>
      </>
    )
  }

  // 진행도 바: 구역 화면에서는 그 구역을 먼저
  const focusZ = route.page === 'zone' ? zones.find((x) => x.zone_id === route.id) : null
  const focusP = focusZ ? zoneProgress(focusZ) : null
  const barP = focusP ?? total

  return (
    <div className="yd-page">
      <div className="yd-window">
        <aside className={`yd-side${menuOpen ? ' open' : ''}`}>
          <div className="yd-brand">
            <span className="yd-logo">
              <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
            </span>
            <span className="yd-brand-name">관리자 관제</span>
            <button className="yd-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="메뉴 열기">
              메뉴
            </button>
          </div>
          {config.mode === 'demo' && <span className="yd-demo">샘플 데이터 · DEMO</span>}
          <nav className="yd-nav">
            {nav.map(([label, path, page, n]) => (
              <a key={page} href={`#${path}`} className={activeNav === page ? 'on' : ''} aria-current={activeNav === page ? 'page' : undefined}>
                {label}
                {!!n && <em>{n}</em>}
              </a>
            ))}
            <button onClick={p.onOpenSettings}>설정</button>
          </nav>
          <div className="yd-side-foot">
            <span className={`yd-conn ${conn.cls}`}>
              <i />
              {conn.text}
            </span>
            <span className="yd-conn-time">{sync.lastSuccessAt ? `마지막 갱신 ${hms(sync.lastSuccessAt)}` : '갱신 전'}</span>
            <button className="yd-pill" onClick={p.onOpenSettings}>
              관리자 · 계정 연동 전
            </button>
          </div>
        </aside>

        <div className="yd-main" ref={main}>
          {p.notices}
          <div className={`yd-content${route.page === 'overview' ? ' wide' : ''}`}>{content}</div>
        </div>

        {/* 맨 아래 작업 진행도 */}
        <footer className={`yd-progress${p.stale || !snap ? ' stale' : ''}`} aria-label="작업 진행도">
          <div className="yd-progress-main">
            <span className="yd-progress-label">{focusZ ? `${focusZ.label} 진행도` : '전체 작업 진행도'}</span>
            <strong className="num">{snap && barP.target ? `${barP.percent}%` : '—'}</strong>
            <span className="yd-progress-sub">
              {snap ? `완료 ${barP.done} / 대상 ${barP.target}` : '데이터 없음'}
              {p.stale && sync.lastSuccessAt ? ` · 마지막 갱신 ${hm(new Date(sync.lastSuccessAt).toISOString())} 기준` : ''}
            </span>
            <div className="yd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barP.percent}>
              <i style={{ width: `${snap ? barP.percent : 0}%` }} />
            </div>
          </div>
          <div className="yd-progress-zones">
            {focusZ && (
              <a href="#/" className="yd-zbar all">
                <span>전체</span>
                <div className="yd-bar sm">
                  <i style={{ width: `${total.percent}%` }} />
                </div>
                <b className="num">{total.target ? `${total.percent}%` : '—'}</b>
              </a>
            )}
            {zones.map((z) => {
              const zp = zoneProgress(z)
              return (
                <a key={z.zone_id} href={`#/zone/${encodeURIComponent(z.zone_id)}`} className={`yd-zbar${focusZ?.zone_id === z.zone_id ? ' on' : ''}${zp.hasTasks ? '' : ' none'}`} title={`${z.label} · ${zp.hasTasks ? `완료 ${zp.done}/${zp.target}` : '작업 데이터 없음'}`}>
                  <span>{z.label.replace('작업구역 ', '')}</span>
                  <div className="yd-bar sm">
                    <i style={{ width: `${zp.percent}%` }} />
                  </div>
                  <b className="num">{zp.hasTasks && zp.target ? `${zp.percent}%` : '—'}</b>
                </a>
              )
            })}
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ─────────── 구역 타일 (지그재그) ─────────── */
function ZoneTile({ no, z, zoneMap, lit, onHover }: { no: number; z: ZoneSummary; zoneMap: ZoneMap; zones: ZoneSummary[]; lit?: boolean; onHover?: (on: boolean) => void }) {
  const zp = zoneProgress(z)
  return (
    <a
      className={`yd-item${lit ? ' lit' : ''}`}
      href={`#/zone/${encodeURIComponent(z.zone_id)}`}
      data-zone={z.zone_id}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
    >
      <ZonePhoto entry={zoneMap.zones.find((m) => m.zone_id === z.zone_id)} zoneId={z.zone_id} label={z.label} percent={zp.hasTasks ? zp.percent : null} />
      <div className="yd-copy">
        <span className="yd-no">{pad2(no)}</span>
        <h2>
          {z.label}
          {!!z.needsConfirmation && <i className="yd-badge">확인 {z.needsConfirmation}</i>}
        </h2>
        <p>
          {z.description && (
            <>
              {z.description}
              <br />
            </>
          )}
          {z.taskTypes.length ? z.taskTypes.join(', ') : '등록된 작업 없음'}
          <br />
          {zp.hasTasks ? `진행률 ${zp.percent}% · 완료 ${zp.done}/${zp.target}` : '작업 데이터 없음'}
        </p>
      </div>
    </a>
  )
}

/** 구역 사진 타일 — public/ 의 이미지만 쓴다. 없으면 등록 안내. AI 생성 이미지는 imageKind:'ai' 로 표시 */
function ZonePhoto({ entry, zoneId, label, percent }: { entry?: ZoneMapEntry; zoneId: string; label: string; percent: number | null }) {
  const path = entry?.image ?? `zones/${zoneId}.jpg`
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  return (
    <div className={`yd-tile yd-photo ${state}`} data-photo={state}>
      {state !== 'missing' && (
        <img
          src={`${import.meta.env.BASE_URL}${path}`}
          alt={`${label} 사진`}
          loading="lazy"
          style={{ objectPosition: entry?.imagePosition ?? '50% 50%' }}
          onLoad={() => setState('ok')}
          onError={() => setState('missing')}
        />
      )}
      {state === 'ok' && entry?.imageKind === 'ai' && <span className="yd-photo-kind">AI 생성 이미지</span>}
      {state === 'missing' && (
        <p className="yd-tile-msg yd-photo-msg">
          사진 등록 필요
          <code>public/{path}</code>
        </p>
      )}
      {percent !== null && <span className="yd-photo-pct num">{percent}%</span>}
    </div>
  )
}

/* ─────────── 구역 디지털트윈 화면 ─────────── */
function ZoneDetail({
  z,
  config,
  zoneMap,
  model,
  snap,
  stale,
  insight,
  convo,
  head,
}: YardProps & {
  z: ZoneSummary
  snap: Snapshot | null
  insight: (only: Tab, zone: string) => ReactNode
  convo: ReactNode
  head: (t: string, s: ReactNode, extra?: ReactNode) => ReactNode
}) {
  const zp = zoneProgress(z)
  const unity = useRef<TwinHandle>(null)
  const [unityFailed, setUnityFailed] = useState<string | null>(null)
  const useUnity = config.unity.enabled && !unityFailed

  useEffect(() => {
    unity.current?.selectZone(z.zone_id)
  }, [z.zone_id])
  useEffect(() => {
    if (!snap || stale || !useUnity) return
    unity.current?.applyState({
      generated_at: new Date(snap.receivedAt).toISOString(),
      zones: [],
      tasks: buildTwinTasks(zoneMap, snap.tasks.filter((t) => t.zone_id === z.zone_id)),
    })
  }, [snap, stale, useUnity, zoneMap, z.zone_id])

  const voices = snap && model ? snap.voices.filter((v) => refMatches(model.voiceZone.get(v.voice_id), z.zone_id)).length : 0

  return (
    <>
      <button className="yd-back" onClick={() => go('/')}>
        ← 전체 작업장
      </button>
      {head(z.label, `${z.description ? `${z.description} · ` : ''}${zp.hasTasks ? `진행률 ${zp.percent}%` : '작업 데이터 없음'}`)}

      <section className="yd-feature">
        <div className="yd-tile yd-tile-wide yd-twin">
          {useUnity && snap ? (
            <UnityTwin ref={unity} unity={config.unity} zoneMap={zoneMap} tasks={snap.tasks} onSelectZone={(id) => id && go(`/zone/${id}`)} onMessage={() => {}} onFailed={setUnityFailed} />
          ) : (
            <YardMap zoneMap={zoneMap} zones={model?.zones ?? []} focusZoneId={z.zone_id} ariaLabel={`${z.label} 점 미니맵`} />
          )}
          <span className="yd-tile-note">{useUnity ? 'Unity 디지털트윈' : unityFailed ? `Unity 로드 실패 · 미니맵 표시` : '디지털트윈 연결 예정 · 지금은 점 미니맵'}</span>
        </div>
        <ContractPanel zoneId={z.zone_id} />
      </section>

      <dl className="yd-facts yd-facts-row">
        <div>
          <dt>진행률 (서버 작업 상태)</dt>
          <dd className="num">{zp.hasTasks ? `${zp.percent}%` : '—'}</dd>
        </div>
        <div>
          <dt>확인 필요</dt>
          <dd className="num">{z.needsConfirmation}</dd>
        </div>
        <div>
          <dt>발화</dt>
          <dd className="num">{voices}</dd>
        </div>
        <div>
          <dt>진행 중 인계</dt>
          <dd className="num">{z.handoffsOpen}</dd>
        </div>
        <div>
          <dt>Unity 오브젝트</dt>
          <dd className="yd-mono">{zoneMap.zones.find((m) => m.zone_id === z.zone_id)?.unityObject ?? '매핑 없음'}</dd>
        </div>
      </dl>

      <Section no="01" title="작업 목록·상태" desc={`이 구역에 등록된 작업 ${z.tasks.length}건. 상태는 서버 tasks.status 값입니다.`}>
        {z.tasks.length ? (
          <table className="yd-table">
            <thead>
              <tr>
                <th>작업</th>
                <th>블록</th>
                <th>상태</th>
                <th>갱신</th>
              </tr>
            </thead>
            <tbody>
              {z.tasks.map((t) => (
                <tr key={t.task_id}>
                  <td>
                    <b>{t.task_type}</b> <span className="yd-mono">{t.task_id}</span>
                  </td>
                  <td>{t.block_id}</td>
                  <td>
                    <span className={`yd-status ${t.status === 'DONE' ? 'done' : ''}`}>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                  </td>
                  <td className="num">{hm(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="yd-empty">등록된 작업이 없습니다.</p>
        )}
      </Section>
      <Section no="02" title="확인 요청" desc="사람의 확인이 필요한 분석 결과입니다. 확인·반려는 서버 저장 후 반영됩니다.">
        <div className="yd-sheet">{insight('confirm', z.zone_id)}</div>
      </Section>
      <Section no="03" title="현장 대화" desc="이 구역에서 저장된 STT 전사문입니다.">
        <div className="yd-sheet yd-convo">{convo}</div>
      </Section>
      <Section no="04" title="작업·인계" desc="작업 상태 변경과 구역 간 인계. 인계 상태와 작업 상태는 별개입니다.">
        <div className="yd-sheet">{insight('work', z.zone_id)}</div>
      </Section>
    </>
  )
}

function Section({ no, title, desc, children }: { no: string; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="yd-section">
      <div className="yd-copy">
        <span className="yd-no">{no}</span>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div className="yd-section-body">{children}</div>
    </section>
  )
}
