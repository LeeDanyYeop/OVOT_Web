import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConfig, type AppConfig, type ZoneMap } from './config'
import { LiveSource, type DataSource } from './data/source'
import { DemoSource } from './demo/demoSource'
import { useOvotData } from './data/useOvotData'
import { ALL, buildModel } from './data/model'
import { hms } from './lib/format'
import { TopBar } from './components/TopBar'
import { ZonePanel } from './components/ZonePanel'
import { ConversationPanel } from './components/ConversationPanel'
import { InsightPanel } from './components/InsightPanel'
import { SettingsSheet } from './components/SettingsSheet'
import { DigitalTwinPanel } from './twin/DigitalTwinPanel'
import { CanvasLayout } from './canvas/CanvasLayout'

import { YardLayout } from './yard/YardLayout'

/** 기본: 흰 배경 작업장 화면 · ?layout=canvas 어두운 점 구름 화면 · ?layout=classic 이전 4분할 화면 */
const layoutParam = new URLSearchParams(window.location.search).get('layout')
const layout = layoutParam === 'classic' ? 'classic' : layoutParam === 'canvas' ? 'canvas' : 'yard'

export default function App() {
  const [loaded, setLoaded] = useState<{ config: AppConfig; zoneMap: ZoneMap; configFileFound: boolean } | null>(null)
  const [gen, setGen] = useState(0)

  useEffect(() => {
    let alive = true
    loadConfig().then((r) => alive && setLoaded(r))
    return () => {
      alive = false
    }
  }, [gen])

  if (!loaded) return <div className="state">설정을 불러오는 중…</div>
  return (
    <Console
      key={`${gen}-${loaded.config.mode}-${loaded.config.apiBaseUrl}-${loaded.config.pollIntervalMs}`}
      {...loaded}
      onReconfigure={() => {
        // 설정 패널 값이 URL 파라미터에 가려지지 않도록 제거
        const url = new URL(window.location.href)
        url.searchParams.delete('mode')
        url.searchParams.delete('api')
        window.history.replaceState(null, '', url)
        setLoaded(null)
        setGen((g) => g + 1)
      }}
    />
  )
}

function Console({ config, zoneMap, configFileFound, onReconfigure }: { config: AppConfig; zoneMap: ZoneMap; configFileFound: boolean; onReconfigure: () => void }) {
  const source: DataSource = useMemo(() => (config.mode === 'demo' ? new DemoSource() : new LiveSource(config)), [config])
  const sync = useOvotData(source, config.pollIntervalMs)
  const model = useMemo(() => (sync.snapshot ? buildModel(sync.snapshot, zoneMap) : null), [sync.snapshot, zoneMap])

  const [zone, setZone] = useState<string>(ALL)
  const [voiceId, setVoiceId] = useState<string | null>(null)
  const [focusVoice, setFocusVoice] = useState<{ id: string; nonce: number } | null>(null)
  const [focusEvent, setFocusEvent] = useState<{ id: number; nonce: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const selectZone = useCallback((z: string) => {
    setZone(z)
    setVoiceId(null)
  }, [])

  const stale = sync.status === 'error' && !!sync.snapshot
  const loadError = sync.status === 'error' && !sync.snapshot ? '상단 오류 안내를 확인하세요. 연결되면 자동으로 표시됩니다.' : null
  const totalNeeds = sync.snapshot?.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION').length ?? 0

  const actions = {
    setEventStatus: async (id: number, status: 'CONFIRMED' | 'REJECTED') => {
      await sync.mutate(() => source.updateEventStatus(id, status))
      setToast({ text: `이벤트 #${id} ${status === 'CONFIRMED' ? '확인' : '반려'} 처리 — 서버 저장 완료` })
    },
    setTaskStatus: async (taskId: string, status: string) => {
      await sync.mutate(() => source.updateTaskStatus(taskId, status))
      setToast({ text: `${taskId} 작업 상태 변경 — 서버 저장 완료` })
    },
    createHandoff: async (b: { task_id: string; from_zone_id: string; to_zone_id: string }) => {
      const h = await sync.mutate(() => source.createHandoff(b))
      setToast({ text: `인계 #${h.handoff_id} 요청 생성 — 서버 저장 완료` })
    },
    setHandoffStatus: async (id: number, status: string) => {
      await sync.mutate(() => source.updateHandoffStatus(id, status))
      setToast({ text: `인계 #${id} 상태 변경 — 서버 저장 완료` })
    },
  }

  const notices = (
    <>
      {config.mode === 'demo' && (
        <div className="notice notice-demo" role="note">
          <strong>DEMO 모드 · 샘플 데이터</strong>
          <span>CASE 대본을 바탕으로 만든 예시이며 실제 서버 데이터가 아닙니다. 처리 결과는 이 탭에만 임시로 남습니다.</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-outline" onClick={() => setSettingsOpen(true)}>LIVE 연결 설정</button>
        </div>
      )}
      {sync.status === 'error' && (
        <div className="notice notice-error" role="alert">
          <strong>{sync.error?.startsWith('DB') ? 'DB 연결 오류' : '서버 연결 오류'}</strong>
          <span className="notice-msg" title={sync.error ?? ''}>
            {sync.error}
            {sync.snapshot ? ` · 화면은 ${hms(sync.lastSuccessAt)} 에 받은 데이터이며 최신이 아닙니다.` : ' · 표시할 데이터가 없습니다.'} 자동 재시도 중 ({sync.consecutiveFailures}회 실패)
          </span>
          <span className="spacer" />
          <button className="btn btn-sm btn-outline" onClick={() => sync.refresh()} disabled={sync.inFlight}>
            {sync.inFlight ? '재시도 중…' : '지금 재시도'}
          </button>
        </div>
      )}

    </>
  )

  const overlays = (
    <>
      {settingsOpen && (
        <SettingsSheet
          config={config}
          configFileFound={configFileFound}
          sync={sync}
          onClose={() => setSettingsOpen(false)}
          onApply={() => {
            setSettingsOpen(false)
            onReconfigure()
          }}
        />
      )}
      {toast && <div className={`toast${toast.err ? ' err' : ''}`} role="status">{toast.text}</div>}
    </>
  )

  if (layout === 'yard') {
    return (
      <>
        <YardLayout
          config={config}
          zoneMap={zoneMap}
          sync={sync}
          model={model}
          zone={zone}
          onSelectZone={selectZone}
          voiceId={voiceId}
          onSelectVoice={setVoiceId}
          focusVoice={focusVoice}
          onShowVoice={(id) => {
            setVoiceId(id)
            setFocusVoice({ id, nonce: Date.now() })
          }}
          focusEvent={focusEvent}
          actions={actions}
          stale={stale}
          loadError={loadError}
          onOpenSettings={() => setSettingsOpen(true)}
          notices={notices}
        />
        {overlays}
      </>
    )
  }

  if (layout === 'canvas') {
    return (
      <>
        <CanvasLayout
          config={config}
          zoneMap={zoneMap}
          sync={sync}
          model={model}
          zone={zone}
          onSelectZone={selectZone}
          voiceId={voiceId}
          onSelectVoice={setVoiceId}
          focusVoice={focusVoice}
          onShowVoice={(id) => {
            setVoiceId(id)
            setFocusVoice({ id, nonce: Date.now() })
          }}
          focusEvent={focusEvent}
          onFocusEvent={(id) => setFocusEvent({ id, nonce: Date.now() })}
          actions={actions}
          stale={stale}
          loadError={loadError}
          onOpenSettings={() => setSettingsOpen(true)}
          footer={notices}
        />
        {overlays}
      </>
    )
  }

  return (
    <div className="app">
      <TopBar mode={config.mode} sync={sync} onOpenSettings={() => setSettingsOpen(true)} />

      {notices}

      <main className="board">
        <DigitalTwinPanel
          config={config}
          zoneMap={zoneMap}
          snapshot={sync.snapshot}
          model={model}
          selectedZone={zone}
          onSelectZone={selectZone}
          onOpenEvent={(id) => setFocusEvent({ id, nonce: Date.now() })}
          lastSuccessAt={sync.lastSuccessAt}
          stale={stale}
        />
        <ZonePanel model={model} totalNeeds={totalNeeds} selectedZone={zone} onSelectZone={selectZone} loadError={loadError} />
        <ConversationPanel
          snapshot={sync.snapshot}
          model={model}
          selectedZone={zone}
          selectedVoiceId={voiceId}
          focusVoice={focusVoice}
          onSelectVoice={setVoiceId}
          pollIntervalMs={config.pollIntervalMs}
          onRefresh={() => sync.refresh()}
          inFlight={sync.inFlight}
          loadError={loadError}
        />
        <InsightPanel
          snapshot={sync.snapshot}
          model={model}
          selectedZone={zone}
          selectedVoiceId={voiceId}
          onClearVoice={() => setVoiceId(null)}
          onShowVoice={(id) => {
            setVoiceId(id)
            setFocusVoice({ id, nonce: Date.now() })
          }}
          focusEvent={focusEvent}
          actions={actions}
          stale={stale}
          loadError={loadError}
        />
      </main>

      {overlays}
    </div>
  )
}
