import { useEffect, useRef, useState } from 'react'
import { B02_ROUTE, B02_ROUTE_KM } from './b02Route'

// 블록 운송 추적 — 배달 앱처럼 지도 위에서 트랜스포터가 경로를 따라 움직이고, 도착 예정 시각·단계를 보여 준다.
// 위치는 시연용(실제 GPS 아님): 화면을 열 때 62% 지점에서 시작해 조금씩 앞으로 간다.
// 지도(Leaflet)는 이 카드에서만 CDN 으로 불러온다. 못 불러오면 지도 없이 단계·시각만 보여 준다.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/'
const TRIP_MIN = 110 // 출발 → 도크 도착 전체 소요(분) — 대형 블록 트랜스포터는 시속 10km 안팎
const START = 0.62, SPEED = 0.0025 // 시작 진행률, 1초에 늘어나는 진행률

/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
  const w = window as any
  if (w.L) return Promise.resolve(w.L)
  if (loading) return loading
  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = `${LEAFLET}leaflet.min.css`
  document.head.append(css)
  loading = new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = `${LEAFLET}leaflet.min.js`
    s.onload = () => (w.L ? ok(w.L) : fail(new Error('no L')))
    s.onerror = () => { loading = null; fail(new Error('load failed')) }
    document.head.append(s)
  })
  return loading
}

// 경로 위 진행률(0~1) 지점 — 구간 길이에 비례
const seg = B02_ROUTE.slice(1).map((p, i) => Math.hypot(p[0] - B02_ROUTE[i][0], (p[1] - B02_ROUTE[i][1]) * 1.22))
const total = seg.reduce((a, b) => a + b, 0)
function pointAt(k: number): { at: [number, number]; i: number; heading: number } {
  let d = k * total
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0
      const a = B02_ROUTE[i], b = B02_ROUTE[i + 1]
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i, heading: Math.atan2(b[0] - a[0], (b[1] - a[1]) * 1.22) }
    }
    d -= seg[i]
  }
  return { at: B02_ROUTE[B02_ROUTE.length - 1], i: seg.length - 1, heading: 0 }
}

const STEPS = [
  { at: 0, label: '출발', sub: '협력사 공장' },
  { at: 0.08, label: '이동 중', sub: '울산 시내 도로' },
  { at: 0.93, label: '야드 진입', sub: '울산 야드 정문' },
  { at: 1, label: '도크 도착', sub: '도크1 · 인수 확인' },
]
const hm = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

const TRUCK = `<div class="tt-truck"><svg viewBox="0 0 24 24"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/></svg></div>`

export function TransitTracker() {
  const host = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(START)
  const [noMap, setNoMap] = useState(false)
  const t0 = useRef(Date.now())
  const map = useRef<{ move: (k: number) => void } | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setK(Math.min(0.985, START + ((Date.now() - t0.current) / 1000) * SPEED)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let m: any = null, dead = false
    loadLeaflet().then((L) => {
      if (dead || !host.current) return
      const ll = (p: [number, number]) => [p[1], p[0]] as [number, number]
      m = L.map(host.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      m.attributionControl.setPrefix('')
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: '© Esri' }).addTo(m)
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(m)
      const all = B02_ROUTE.map(ll)
      L.polyline(all, { color: '#c7ccd6', weight: 6, lineCap: 'round' }).addTo(m)
      const done = L.polyline([], { color: '#0071e3', weight: 6, lineCap: 'round' }).addTo(m)
      const pin = (cls: string, text: string) => L.divIcon({ className: '', html: `<div class="tt-pin ${cls}"><b>${text}</b></div>`, iconSize: [0, 0] })
      L.marker(all[0], { icon: pin('from', '협력사 공장') }).addTo(m)
      L.marker(all[all.length - 1], { icon: pin('to', '도크1') }).addTo(m)
      const truck = L.marker(all[0], { icon: L.divIcon({ className: '', html: TRUCK, iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(m)
      m.fitBounds(L.latLngBounds(all), { padding: [26, 26] })
      map.current = {
        move: (kk) => {
          const p = pointAt(kk)
          truck.setLatLng(ll(p.at))
          done.setLatLngs([...B02_ROUTE.slice(0, p.i + 1).map(ll), ll(p.at)])
        },
      }
      map.current.move(START)
    }).catch(() => { if (!dead) setNoMap(true) })
    return () => { dead = true; map.current = null; m?.remove() }
  }, [])

  useEffect(() => { map.current?.move(k) }, [k])

  const now = new Date()
  const left = Math.max(1, Math.round((1 - k) * TRIP_MIN))
  const eta = new Date(now.getTime() + left * 60000)
  const dep = new Date(now.getTime() - k * TRIP_MIN * 60000)
  const step = STEPS.reduce((n, s, i) => (k >= s.at ? i : n), 0)

  return (
    <section className="tt" aria-label="B-02 운송 추적">
      <header className="tt-head">
        <div>
          <span className="tt-live"><i />운송 중</span>
          <h3>{left}분 뒤 도착</h3>
          <p>도착 예정 {hm(eta)} · 남은 거리 {(B02_ROUTE_KM * (1 - k)).toFixed(1)}km</p>
        </div>
        <div className="tt-who"><b>운송팀</b><small>트랜스포터 1호</small></div>
      </header>
      {noMap ? null : <div className="tt-map" ref={host} />}
      <ol className="tt-steps">
        {STEPS.map((s, i) => (
          <li key={s.label} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
            <i />
            <b>{s.label}</b>
            <small>{i === 0 ? `${s.sub} · ${hm(dep)}` : i === STEPS.length - 1 ? `${s.sub} · ${hm(eta)}` : s.sub}</small>
          </li>
        ))}
      </ol>
      <p className="tt-note">시연용 위치 · 실제 운송 GPS 를 연결하면 이 지도에 그대로 표시됩니다</p>
    </section>
  )
}
