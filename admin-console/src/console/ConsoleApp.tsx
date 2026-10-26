/**
 * 관리자 콘솔(DEMO) 셸 — 로그인 → 역할별 메뉴 → 화면.
 * 화면은 demo/store 의 같은 상태(decisions)를 읽고, 판정·파생 값은 demo/flags 의 순수 함수에서 온다.
 * 기존 LIVE 연결(설정 시트 · useOvotData · LiveSource)은 그대로 두고, 이번 화면은 DEMO 시나리오 기준이다.
 */
import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, ZoneMap } from '../config'
import { LiveSource, type DataSource } from '../data/source'
import { useOvotData } from '../data/useOvotData'
import { DemoSource } from '../demo/demoSource'
import { openCount } from '../demo/flags'
import { demoStore, useDemo, type Screen } from '../demo/store'
import { EVENT, USERS, type Role } from '../demo/scenarioB03'
import { SettingsSheet } from '../components/SettingsSheet'
import { LoginScreen } from './LoginScreen'
import { Overview } from './screens/Overview'
import { Review } from './screens/Review'
import { Instructions } from './screens/Instructions'
import { History } from './screens/History'
import { DrawingChange } from './screens/DrawingChange'
import './console.css'

const MENU: Record<Role, { screen: Screen; label: string }[]> = {
  lead: [
    { screen: 'overview', label: '현황' },
    { screen: 'review', label: '확인 요청' },
    { screen: 'instructions', label: '지시·변경' },
    { screen: 'history', label: '이력' },
  ],
  designer: [
    { screen: 'drawing', label: '도면 변경' },
    { screen: 'history', label: '이력' },
  ],
}

interface Props {
  config: AppConfig
  zoneMap: ZoneMap
  configFileFound: boolean
  onReconfigure: () => void
}

export function ConsoleApp({ config, zoneMap, configFileFound, onReconfigure }: Props) {
  const demo = useDemo()
  const source: DataSource = useMemo(() => (config.mode === 'demo' ? new DemoSource() : new LiveSource(config)), [config])
  const sync = useOvotData(source, config.pollIntervalMs)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.title = demo.role ? `OVOT 관제 · ${USERS[demo.role].roleLabel}` : 'OVOT 관제 · 로그인'
  }, [demo.role])

  if (!demo.role) return <div className="cn-root"><LoginScreen /></div>

  const role = demo.role
  const user = USERS[role]
  const menu = MENU[role]
  // 역할에 없는 화면은 그 역할의 첫 화면으로
  const screen: Screen = menu.some((m) => m.screen === demo.screen) ? demo.screen : menu[0].screen
  const needs = openCount(demo.state)

  const conn =
    config.mode === 'demo'
      ? demo.sync === 'server'
        ? { cls: 'server', text: '시나리오 데이터 · 작업자 앱과 실시간 공유' }
        : { cls: 'local', text: '시나리오 데이터 · 이 브라우저에서만 동작' }
      : sync.status === 'error'
        ? { cls: 'local', text: '서버 연결 오류' }
        : { cls: 'server', text: '서버 연결 정상' }

  return (
    <div className="cn-root">
      <div className="cn-shell">
        <aside className="cn-side" aria-label="메뉴">
          <div className="cn-brand">
            <img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT" />
            <span>관리자 관제</span>
          </div>

          <div className="cn-user">
            <span className="cn-badge info" style={{ alignSelf: 'flex-start' }}>{user.roleLabel}</span>
            <strong>{user.name}</strong>
            <small>{user.org}</small>
            <button className="cn-btn" onClick={() => demoStore.logout()}>로그아웃</button>
          </div>

          <nav className="cn-nav" aria-label="화면 이동">
            {menu.map((m) => (
              <button key={m.screen} aria-current={screen === m.screen ? 'page' : undefined} onClick={() => demoStore.go(m.screen)}>
                {m.label}
                {m.screen === 'review' && needs > 0 && <em aria-label={`미결 ${needs}건`}>{needs}</em>}
              </button>
            ))}
            <button className="cn-nav-foot" onClick={() => setSettingsOpen(true)}>연결 설정</button>
          </nav>

          <div className="cn-side-foot">
            <span className={`cn-sync ${conn.cls}`}><i />{conn.text}</span>
          </div>
        </aside>

        <main className="cn-main">
          <div className="cn-banner" role="note">
            <strong>DEMO</strong>
            <span>합성 시나리오 · 사건 {EVENT.id} 「{EVENT.title}」</span>
            <span className="cn-spacer" />
            <button className="cn-btn cn-btn-soft" onClick={() => demoStore.reset()}>시연 초기화</button>
          </div>

          {screen === 'overview' && <Overview zoneMap={zoneMap} state={demo.state} />}
          {screen === 'review' && <Review state={demo.state} filter={demo.filter} />}
          {screen === 'instructions' && <Instructions state={demo.state} />}
          {screen === 'history' && <History state={demo.state} />}
          {screen === 'drawing' && <DrawingChange state={demo.state} />}
        </main>
      </div>

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
    </div>
  )
}
