import { useEffect, useState } from 'react'
import { loadConfig, type AppConfig, type ZoneMap } from './config'
import { ConsoleApp } from './console/ConsoleApp'
import { DockPreview } from './console/DockPreview'
import { useDemo } from './demo/store'

/**
 * 설정(public/ovot-config.json · 설정 패널 · URL 파라미터)을 읽은 뒤 콘솔을 띄운다.
 * LIVE 연결 설정과 API 코드(api/ · data/)는 그대로 두었다. 이번 화면은 DEMO 시나리오(demo/scenarioB03.ts) 기준이다.
 */
export default function App() {
  const [loaded, setLoaded] = useState<{ config: AppConfig; zoneMap: ZoneMap; configFileFound: boolean } | null>(null)
  const [gen, setGen] = useState(0)
  const demo = useDemo()

  useEffect(() => {
    let alive = true
    loadConfig().then((r) => alive && setLoaded(r))
    return () => {
      alive = false
    }
  }, [gen])

  // 로그인 후(생산관리/공무감독·설계) 도크 화면으로. 로그인 전은 기존 콘솔 로그인 화면.
  if (demo.role) return <DockPreview role={demo.role} />
  if (!loaded) return <div className="state">설정을 불러오는 중…</div>
  return (
    <ConsoleApp
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
