import { useEffect, useRef, useState } from 'react'
import { KoreaMap, SHIPYARDS } from './screens/ShipyardMap'

// 로그인 왼쪽 — 지구본(CesiumJS). 처음에 지구가 한 바퀴 돌고 한반도로 다가가며, 사업장을 고르면 그곳으로 날아간다.
// CesiumJS 는 크기가 커서 묶지 않고 이 화면에서만 CDN 으로 불러온다. 못 불러오면 예전 평면 지도로 보여 준다.
// 3D 건물(Cesium OSM Buildings)은 Cesium ion 토큰(VITE_CESIUM_ION_TOKEN)이 있을 때만 켠다.
const BASE = 'https://cdn.jsdelivr.net/npm/cesium@1.123.0/Build/Cesium/'
const TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined

export type Site = { id: string; name: string; lon: number; lat: number; live: boolean; region: '국내' | '해외'; note?: string }
// 해외 사업장 — 시연용 위치(대략). 실제 목록은 별도 확정 필요
const OVERSEAS: Site[] = [
  { id: 'subic', name: 'HD현대필리핀 수빅 조선소', lon: 120.26, lat: 14.77, live: false, region: '해외' },
]
export const SITES: Site[] = [
  ...SHIPYARDS.map((y): Site => ({ id: y.id, name: y.name, lon: y.lon, lat: y.lat, live: y.live, region: '국내' })),
  ...OVERSEAS,
]

/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<any> | null = null
function loadCesium(): Promise<any> {
  const w = window as any
  if (w.Cesium) return Promise.resolve(w.Cesium)
  if (loading) return loading
  w.CESIUM_BASE_URL = BASE
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = `${BASE}Widgets/widgets.css`
  document.head.append(css)
  loading = new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = `${BASE}Cesium.js`
    s.onload = () => (w.Cesium ? ok(w.Cesium) : fail(new Error('no Cesium')))
    s.onerror = () => { loading = null; fail(new Error('load failed')) }
    document.head.append(s)
  })
  return loading
}

// 지도 위 사업장 표시 — 관제 연결 = 파랑, 데이터 준비 중 = 빨강
const pin = (live: boolean) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="29" fill="${live ? '#0a84ff' : '#e8322b'}" fill-opacity="0.28"/>
<circle cx="32" cy="32" r="20" fill="${live ? '#0a84ff' : '#e8322b'}" stroke="#fff" stroke-width="3"/>
<path d="M21 35h22l-3.5 6h-15z" fill="#fff"/><path d="M27 34V22h3v12M30 23h8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`)}`

export function GlobeMap({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const credit = useRef<HTMLDivElement>(null)
  const api = useRef<{ go: (id: string | null) => void; all: () => void } | null>(null)
  const pick = useRef(onSelect)
  pick.current = onSelect
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  // 목록은 관제가 연결된 사업장만 보이다가 '전체 보기'를 누르면 나머지(미포~수빅)까지 펼친다
  const [all, setAll] = useState(false)

  useEffect(() => {
    let viewer: any = null, dead = false
    loadCesium().then(async (C) => {
      if (dead || !host.current) return
      viewer = new C.Viewer(host.current, {
        // Esri 위성 사진(키 불필요)을 어둡게 깔아 밤 관제실 느낌으로. 가까이 가면 실제 도크가 보인다
        baseLayer: new C.ImageryLayer(new C.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maximumLevel: 18,
          credit: new C.Credit('Imagery © Esri, Maxar, Earthstar Geographics'),
        }), { brightness: 0.62, contrast: 1.15, saturation: 0.55, gamma: 1.1 }),
        baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
        creditContainer: credit.current,
        // 기본값은 폰에서도 1배 해상도로 그려 글자가 흐리다 — 화면 해상도대로(폰 부담을 생각해 최대 2배)
        useBrowserRecommendedResolution: false,
      })
      const dpr = window.devicePixelRatio || 1
      viewer.resolutionScale = Math.min(dpr, 2) / dpr
      const scene = viewer.scene
      if (import.meta.env.DEV) (window as any).__globe = viewer
      scene.globe.baseColor = C.Color.fromCssColorString('#030b1c')
      scene.backgroundColor = C.Color.fromCssColorString('#02060f')
      scene.globe.showGroundAtmosphere = true
      scene.screenSpaceCameraController.minimumZoomDistance = 300

      // 이름표는 글자를 크게 그린 뒤 줄여서 고해상도 화면에서도 또렷하게
      const TX = Math.max(2, Math.ceil(dpr))
      for (const s of SITES) {
        viewer.entities.add({
          id: s.id,
          position: C.Cartesian3.fromDegrees(s.lon, s.lat, 30),
          billboard: { image: pin(s.live), width: s.live ? 38 : 30, height: s.live ? 38 : 30, disableDepthTestDistance: 2e5 },
          label: {
            text: s.live ? s.name : `${s.name}\n데이터 준비 중`, font: `600 ${13 * TX}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`, scale: 1 / TX,
            fillColor: C.Color.WHITE, showBackground: true, backgroundColor: C.Color.fromCssColorString('rgba(8,16,34,0.82)'),
            backgroundPadding: new C.Cartesian2(9 * TX, 6 * TX), pixelOffset: new C.Cartesian2(0, -34),
            verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: 2e5,
            // 지구 전체를 볼 때는 이름표가 겹치므로 가까이 갔을 때만
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, s.live ? 2.4e6 : s.region === '국내' ? 4e5 : 6e6),
          },
        })
      }
      const click = new C.ScreenSpaceEventHandler(scene.canvas)
      click.setInputAction((e: any) => {
        const hit = scene.pick(e.position)
        const id = hit?.id?.id
        if (typeof id === 'string' && SITES.some((s) => s.id === id)) pick.current(id)
      }, C.ScreenSpaceEventType.LEFT_CLICK)

      if (TOKEN) {
        C.Ion.defaultAccessToken = TOKEN
        C.createOsmBuildingsAsync().then((t: any) => {
          if (dead) return
          t.style = new C.Cesium3DTileStyle({ color: "color('#c9d8f2', 0.92)" })
          scene.primitives.add(t)
        }).catch((e: unknown) => console.warn('OSM 건물', e))
      }

      // 첫 장면 — 멀리서 지구가 한 바퀴 돌고 한반도로 다가간다
      const KOREA = C.Cartesian3.fromDegrees(125.6, 27.4, 1.5e6) // 목록 패널이 왼쪽을 가려서 한반도가 오른쪽에 오도록
      const koreaView = { destination: KOREA, orientation: { heading: 0, pitch: C.Math.toRadians(-55), roll: 0 } }
      viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(126.2 + 200, 22, 2.6e7) })
      // 처음 2.8초 동안 지구 자전축을 기준으로 200도 돌린다(빠르게 시작해 천천히 멈춤)
      const SPIN = 2800, ANGLE = (Math.PI * 200) / 180
      let t0 = 0, turned = 0, spinning = true
      const turn = () => {
        const now = performance.now()
        if (!t0) t0 = now
        const k = Math.min(1, (now - t0) / SPIN), want = ANGLE * (1 - (1 - k) ** 3)
        viewer.camera.rotate(C.Cartesian3.UNIT_Z, -(want - turned))
        turned = want
        if (k >= 1) { spinning = false; scene.preRender.removeEventListener(turn); if (!dead) { if (wantAll) all(); else go(current, 2.4) } }
      }
      scene.preRender.addEventListener(turn)
      // 사용자가 지구본을 직접 잡으면 첫 회전을 멈춘다
      scene.canvas.addEventListener('pointerdown', () => { if (spinning) { t0 = performance.now() - SPIN } }, { once: true })

      let current: string | null = null, wantAll = false
      const go = (id: string | null, dur = 2.6) => {
        current = id
        wantAll = false
        if (spinning) return // 첫 회전이 끝나면 그때 이동
        const s = SITES.find((x) => x.id === id)
        if (!s) { viewer.camera.flyTo({ ...koreaView, duration: dur }); return }
        // 왼쪽 목록 패널에 가리지 않도록 사업장 조금 서쪽을 화면 가운데로 — 사업장은 오른쪽에 보인다
        viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(s.lon - 0.016, s.lat - 0.004, 0), 600), {
          offset: new C.HeadingPitchRange(C.Math.toRadians(25), C.Math.toRadians(-32), 4200), duration: dur + (s.region === '해외' ? 1 : 0),
        })
      }
      // 전체 보기 — 국내 야드부터 수빅까지 한 화면에
      const all = () => {
        wantAll = true
        if (spinning) return // 첫 회전이 끝나면 그때 이동
        viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(119, 23.5, 4.6e6), duration: 2.2 })
      }
      api.current = { go, all }
      setReady(true)
    }).catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true; api.current = null; if (viewer && !viewer.isDestroyed()) viewer.destroy() }
  }, [])

  useEffect(() => { api.current?.go(selected) }, [selected, ready])
  useEffect(() => { if (all) api.current?.all() }, [all, ready])

  if (failed) return <KoreaMap selected={selected} onSelect={(id) => onSelect(id)} />
  return (
    <div className="gl-root">
      <div className="gl-globe" ref={host} />
      <aside className="gl-panel" aria-label="사업장 선택">
        {(all ? (['국내', '해외'] as const) : (['국내'] as const)).map((r) => (
          <div key={r} className="gl-group">
            <h3>{r}</h3>
            {SITES.filter((s) => s.region === r && (all || s.live)).map((s) => (
              <button key={s.id} type="button" aria-pressed={selected === s.id} className={s.live ? 'is-live' : 'is-off'} onClick={() => onSelect(s.id)}>
                <i />
                <span><b>{s.name}</b><small>{s.live ? '관제 연결됨' : '데이터 준비 중'}</small></span>
              </button>
            ))}
          </div>
        ))}
        {all
          ? <button type="button" className="gl-all" onClick={() => { setAll(false); api.current?.go(selected) }}>접기</button>
          : <button type="button" className="gl-all" onClick={() => setAll(true)}>전체 보기</button>}
      </aside>
      <div className="gl-credit" ref={credit} />
    </div>
  )
}
