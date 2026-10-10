/**
 * 점 구름(point cloud)으로 그린 3D 선박 — 캔버스 화면 가운데 디지털트윈 자리.
 *
 * - 점 수천 개로 선체·갑판·상부구조를 만들고 천천히 회전한다 (뒤쪽 점은 어둡게, 앞쪽은 밝게).
 * - 작업구역(zone-map.json 의 segment)은 갑판 위에 더 밝고 촘촘한 점 무리로 표시한다 (지구본의 '대륙' 역할).
 * - 0~0.8초: 점들이 가운데 한 점에서 퍼져 나와 선박 모양이 된다.
 * - 이후: 서버의 인계(handoffs) 기록을 출발 구역 → 도착 구역 호(arc)로 0.4초 간격으로 그리고, 도착하면 파동을 퍼뜨린다.
 * - 왼쪽 아래 카운터는 실제 인계 기록 수만 센다.
 *
 * 실제 도면·3D 모델이 아닌 배치 예시다. Unity WebGL 이 설정되면 CanvasLayout 이 이 컴포넌트 대신 UnityTwin 을 쓴다.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ZoneMap } from '../config'
import type { Handoff } from '../types'
import type { TwinZoneState } from '../twin/bridge'
import type { ShipTwinHandle } from './ShipTwin'

interface Props {
  zoneMap: ZoneMap
  zones: TwinZoneState[]
  selectedZoneId: string | null
  onSelectZone: (zoneId: string | null) => void
  handoffs: Handoff[]
}

// ─── 형상 파라미터 (선체 길이 2, 선미 x=-1 → 선수 x=+1) ───
const BEAM = 0.17
const DEPTH = 0.15
const HULL_U0 = 150 // zone-map segment 좌표계에서 선미
const HULL_U1 = 1100 // 선수
const INTRO = 0.8
const ARC_GAP = 0.4
const ARC_DUR = 0.9
const RIPPLE = 1.3

/** 지정 강조색 #007EEC — 그 밖의 점·글자는 흰색/회색 */
const ACCENT: [number, number, number] = [0, 126, 236]

function halfBeam(x: number) {
  if (x > 0.42) return BEAM * Math.sqrt(Math.max(0, (1 - x) / 0.58))
  if (x < -0.93) return BEAM * (0.78 + 0.22 * ((x + 1) / 0.07))
  return BEAM
}

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uToX = (u: number) => -1 + (2 * (u - HULL_U0)) / (HULL_U1 - HULL_U0)

/** 점 종류: 0 선체 측면, 1 갑판(구역 밖), 2 상부구조, 3 갑판 가장자리, 4 구역 갑판 */
interface Cloud {
  n: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  kind: Uint8Array
  zone: Int16Array
  delay: Float32Array
}

function buildCloud(ranges: { from: number; to: number }[]): Cloud {
  const r = rng(20261010)
  const pts: [number, number, number, number, number][] = []
  const push = (x: number, y: number, z: number, kind: number, zone = -1) => pts.push([x, y, z, kind, zone])
  const zoneOf = (x: number) => ranges.findIndex((g) => x >= g.from && x <= g.to)

  // 선체 측면 (바닥으로 갈수록 좁아지는 빌지 곡선)
  for (let i = 0; i < 2200; i++) {
    const x = -1 + 2 * r()
    const w = halfBeam(x)
    if (w < 0.004) continue
    const t = r()
    const side = r() < 0.5 ? -1 : 1
    push(x, -DEPTH * t, side * w * (1 - 0.6 * t * t), 0)
  }
  // 용골선
  for (let i = 0; i < 260; i++) push(-0.98 + 1.96 * r(), -DEPTH, 0, 0)
  // 갑판 가장자리 (윤곽이 또렷하게)
  for (let i = 0; i < 900; i++) {
    const x = -1 + 2 * r()
    const w = halfBeam(x)
    push(x, 0, (r() < 0.5 ? -1 : 1) * w, 3)
  }
  // 선미 트랜섬
  for (let i = 0; i < 160; i++) push(-1, -DEPTH * r(), (r() * 2 - 1) * BEAM * 0.78, 0)
  // 갑판 바탕 (성기게)
  for (let i = 0; i < 1100; i++) {
    const x = -1 + 2 * r()
    const w = halfBeam(x)
    const z = (r() * 2 - 1) * w
    const zi = zoneOf(x)
    push(x, 0, z, zi >= 0 ? 4 : 1, zi)
  }
  // 구역 갑판 (촘촘하게 — 지구본의 '대륙')
  ranges.forEach((g, zi) => {
    const pad = Math.min(0.025, (g.to - g.from) / 6)
    const count = Math.round(1700 * (g.to - g.from))
    for (let i = 0; i < count; i++) {
      const x = g.from + pad + (g.to - g.from - 2 * pad) * r()
      const w = halfBeam(x) * 0.86
      if (w < 0.006) continue
      push(x, 0.004, (r() * 2 - 1) * w, 4, zi)
    }
  })
  // 상부구조(선교) — 선미 쪽 상자
  const box = { x0: -0.9, x1: -0.72, y1: 0.17, z: 0.12 }
  for (let i = 0; i < 700; i++) {
    const f = Math.floor(r() * 5) // 0 뒤, 1 앞, 2 오른쪽, 3 왼쪽, 4 윗면
    const a = r()
    const b = r()
    const x = f === 0 ? box.x0 : f === 1 ? box.x1 : box.x0 + (box.x1 - box.x0) * a
    const y = f === 4 ? box.y1 : box.y1 * (f <= 1 ? a : b)
    const z = f === 2 ? box.z : f === 3 ? -box.z : (b * 2 - 1) * box.z
    push(x, y, z, 2)
  }
  // 굴뚝
  for (let i = 0; i < 120; i++) {
    const ang = r() * Math.PI * 2
    push(-0.8 + Math.cos(ang) * 0.025, 0.17 + r() * 0.08, Math.sin(ang) * 0.025, 2)
  }

  const n = pts.length
  const c: Cloud = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    kind: new Uint8Array(n),
    zone: new Int16Array(n),
    delay: new Float32Array(n),
  }
  pts.forEach(([x, y, z, k, zi], i) => {
    c.x[i] = x
    c.y[i] = y
    c.z[i] = z
    c.kind[i] = k
    c.zone[i] = zi
    c.delay[i] = r() * 0.22
  })
  return c
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export const PointShip = forwardRef<ShipTwinHandle, Props>(function PointShip({ zoneMap, zones, selectedZoneId, onSelectZone, handoffs }, ref) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([])
  const view = useRef({ yaw: -0.55, zoom: 1, hover: false, drag: null as null | { x: number; yaw: number; moved: boolean } })
  const suppress = useRef(false)
  const [landed, setLanded] = useState(0)

  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  const segZones = useMemo(() => zoneMap.zones.filter((z) => z.segment), [zoneMap])
  const ranges = useMemo(() => segZones.map((z) => ({ from: uToX(z.segment!.from), to: uToX(z.segment!.to) })), [segZones])
  const cloud = useMemo(() => buildCloud(ranges), [ranges])

  // 화면에 그릴 인계 호: 양쪽 구역이 모두 선박 구역에 있는 기록만 (오래된 것부터)
  const arcs = useMemo(() => {
    const idx = new Map(segZones.map((z, i) => [z.zone_id, i]))
    return [...handoffs]
      .sort((a, b) => a.handoff_id - b.handoff_id)
      .filter((h) => idx.has(h.from_zone_id) && idx.has(h.to_zone_id))
      .map((h) => ({ id: h.handoff_id, a: idx.get(h.from_zone_id)!, b: idx.get(h.to_zone_id)!, status: h.status, from: h.from_zone_id, to: h.to_zone_id }))
  }, [handoffs, segZones])
  const arcKey = arcs.map((a) => `${a.id}:${a.a}:${a.b}`).join('|')

  // 그리기 루프가 최신 값을 읽도록
  const live = useRef({ zones, selectedZoneId, arcs, segZones, ranges })
  live.current = { zones, selectedZoneId, arcs, segZones, ranges }
  const timeline = useRef({ t0: performance.now(), arcStart: INTRO, landedSet: new Set<number>(), rippleAt: new Map<number, number>() })

  // 인계 데이터가 바뀌면 호 애니메이션을 다시 시작 (첫 로드는 인트로 직후)
  const firstArcs = useRef(true)
  useEffect(() => {
    const tl = timeline.current
    const now = (performance.now() - tl.t0) / 1000
    tl.arcStart = firstArcs.current ? Math.max(INTRO, now) : now + 0.2
    firstArcs.current = false
    tl.landedSet = new Set()
    tl.rippleAt = new Map()
    setLanded(reduced ? arcs.length : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcKey])

  useImperativeHandle(ref, () => ({
    selectZone: () => {},
    applyState: () => {},
    zoomIn: () => (view.current.zoom = Math.min(view.current.zoom * 1.2, 2.4)),
    zoomOut: () => (view.current.zoom = Math.max(view.current.zoom / 1.2, 0.55)),
    reset: () => {
      view.current.zoom = 1
      view.current.yaw = -0.55
    },
  }))

  useEffect(() => {
    const cv = canvas.current
    const box = wrap.current
    if (!cv || !box) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = performance.now()
    let W = 0
    let H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      W = box.clientWidth
      H = box.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      cv.style.width = `${W}px`
      cv.style.height = `${H}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)

    const PITCH = 0.5
    const cp = Math.cos(PITCH)
    const sp = Math.sin(PITCH)
    const out = { sx: 0, sy: 0, d: 0, f: 1 }
    let cy0 = 0
    let cx0 = 0
    let scale = 1
    let cs = 1
    let sn = 0
    const project = (x: number, y: number, z: number) => {
      const xr = x * cs - z * sn
      const zr = x * sn + z * cs
      const y2 = y * cp - zr * sp
      const z2 = y * sp + zr * cp
      const f = 3 / (3 + z2)
      out.sx = cx0 + xr * scale * f
      out.sy = cy0 - y2 * scale * f
      out.d = z2
      out.f = f
      return out
    }

    // 색 묶음: 같은 색·투명도끼리 한 번에 칠해 성능 확보
    const buckets = new Map<string, number[]>()
    const add = (rgb: [number, number, number], a: number, x: number, y: number, s: number) => {
      const key = `${rgb[0]},${rgb[1]},${rgb[2]},${Math.round(clamp01(a) * 12) / 12}`
      let arr = buckets.get(key)
      if (!arr) buckets.set(key, (arr = []))
      arr.push(x, y, s)
    }

    const frame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000)
      last = nowMs
      const v = view.current
      const L = live.current
      const tl = timeline.current
      const t = reduced ? 99 : (nowMs - tl.t0) / 1000
      if (!reduced && !v.drag && !v.hover) v.yaw += dt * 0.11
      cs = Math.cos(v.yaw)
      sn = Math.sin(v.yaw)
      cx0 = W / 2
      cy0 = H * 0.52
      scale = Math.min(W * 0.46, H * 0.95) * v.zoom

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // 선체 둘레 대기 빛
      const glowR = scale * 1.15
      ctx.save()
      ctx.translate(cx0, cy0)
      ctx.scale(1, 0.42)
      const g = ctx.createRadialGradient(0, 0, glowR * 0.15, 0, 0, glowR)
      g.addColorStop(0, 'rgba(0,126,236,0.20)')
      g.addColorStop(0.55, 'rgba(0,126,236,0.07)')
      g.addColorStop(1, 'rgba(0,126,236,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, glowR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      const stateByIdx = L.segZones.map((z) => L.zones.find((s) => s.zone_id === z.zone_id))
      const selIdx = L.segZones.findIndex((z) => z.zone_id === L.selectedZoneId)
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2)

      buckets.clear()
      const c = cloud
      for (let i = 0; i < c.n; i++) {
        const p = reduced ? 1 : easeOut(clamp01((t - c.delay[i]) / (INTRO - 0.22)))
        const pr = project(c.x[i] * p, c.y[i] * p, c.z[i] * p)
        const depth = clamp01(1 - (pr.d + 1.1) / 2.2) // 1 = 앞, 0 = 뒤
        const k = c.kind[i]
        const zi = c.zone[i]
        let rgb: [number, number, number]
        let a: number
        let s = 1.1 + 0.9 * pr.f * depth
        if (k === 4 && zi >= 0) {
          const st = stateByIdx[zi]?.status ?? 'nodata'
          if (zi === selIdx) {
            rgb = [255, 255, 255]
            a = 0.55 + 0.45 * depth
            s += 0.5
          } else if (st === 'attention') {
            rgb = ACCENT
            a = (0.45 + 0.4 * depth) * (0.75 + 0.25 * pulse)
          } else if (st === 'normal') {
            rgb = [225, 228, 233]
            a = 0.35 + 0.5 * depth
          } else {
            rgb = [110, 116, 126]
            a = 0.15 + 0.25 * depth
          }
          if (selIdx >= 0 && zi !== selIdx) a *= 0.45
        } else if (k === 3) {
          rgb = [200, 205, 212]
          a = 0.25 + 0.55 * depth
        } else if (k === 2) {
          rgb = [215, 218, 223]
          a = 0.25 + 0.55 * depth
        } else if (k === 1) {
          rgb = [140, 146, 156]
          a = 0.12 + 0.3 * depth
        } else {
          rgb = [120, 126, 136]
          a = 0.1 + 0.42 * depth
          s *= 0.9
        }
        add(rgb, a, pr.sx, pr.sy, s)
      }
      for (const [key, arr] of buckets) {
        ctx.fillStyle = `rgba(${key})`
        for (let j = 0; j < arr.length; j += 3) ctx.fillRect(arr[j] - arr[j + 2] / 2, arr[j + 1] - arr[j + 2] / 2, arr[j + 2], arr[j + 2])
      }

      // 구역 중심
      const centers = L.ranges.map((r) => {
        const o = project((r.from + r.to) / 2, 0.02, 0)
        return { sx: o.sx, sy: o.sy, d: o.d } // project() 는 같은 객체를 재사용하므로 복사
      })

      // 인계 호
      let landedNow = 0
      L.arcs.forEach((arc, i) => {
        const ra = L.ranges[arc.a]
        const rb = L.ranges[arc.b]
        const xa = (ra.from + ra.to) / 2
        const xb = (rb.from + rb.to) / 2
        const lift = 0.16 + 0.22 * Math.abs(xb - xa)
        const start = tl.arcStart + i * ARC_GAP
        const prog = reduced ? 1 : clamp01((t - start) / ARC_DUR)
        if (prog <= 0) return
        const N = 48
        const head = Math.max(1, Math.floor(prog * N))
        const pts: { x: number; y: number }[] = []
        for (let s2 = 0; s2 <= head; s2++) {
          const u = s2 / N
          const x = (1 - u) * (1 - u) * xa + 2 * u * (1 - u) * ((xa + xb) / 2) + u * u * xb
          const y = 0.02 + 2 * u * (1 - u) * lift * 2
          const pr = project(x, y, 0)
          pts.push({ x: pr.sx, y: pr.sy })
        }
        const sel = !L.selectedZoneId || arc.from === L.selectedZoneId || arc.to === L.selectedZoneId
        const base = sel ? 1 : 0.35
        // 지나간 자리: 옅은 선
        ctx.lineWidth = 1.2
        for (let s2 = 1; s2 < pts.length; s2++) {
          const tail = prog < 1 ? clamp01(1 - (pts.length - s2) / 18) : 0
          ctx.strokeStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${(0.28 + 0.6 * tail) * base})`
          ctx.beginPath()
          ctx.moveTo(pts[s2 - 1].x, pts[s2 - 1].y)
          ctx.lineTo(pts[s2].x, pts[s2].y)
          ctx.stroke()
        }
        if (prog < 1) {
          const hp = pts[pts.length - 1]
          const hg = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 10)
          hg.addColorStop(0, 'rgba(255,255,255,1)')
          hg.addColorStop(0.3, 'rgba(0,126,236,0.85)')
          hg.addColorStop(1, 'rgba(0,126,236,0)')
          ctx.fillStyle = hg
          ctx.beginPath()
          ctx.arc(hp.x, hp.y, 10, 0, Math.PI * 2)
          ctx.fill()
        } else {
          landedNow++
          if (!tl.rippleAt.has(arc.id)) tl.rippleAt.set(arc.id, t)
          const rt = t - tl.rippleAt.get(arc.id)!
          if (!reduced && rt < RIPPLE) {
            const end = centers[arc.b]
            for (const off of [0, 0.35]) {
              const q = clamp01((rt - off) / (RIPPLE - 0.35))
              if (q <= 0) continue
              ctx.strokeStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${(1 - q) * 0.9 * base})`
              ctx.lineWidth = 1.4
              ctx.beginPath()
              ctx.ellipse(end.sx, end.sy, 4 + q * 30, (4 + q * 30) * 0.5, 0, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }
      })
      if (landedNow !== tl.landedSet.size) {
        tl.landedSet = new Set(L.arcs.slice(0, landedNow).map((a) => a.id))
        setLanded(landedNow)
      }

      // 구역 노드(도시 점) + 확인 필요 구역의 고리 + 라벨 위치
      centers.forEach((cpt, zi) => {
        const st = stateByIdx[zi]?.status ?? 'nodata'
        const appear = reduced ? 1 : clamp01((t - INTRO * 0.8) / 0.4)
        const isSel = zi === selIdx
        const r0 = (st === 'nodata' ? 3 : 5) + (isSel ? 2 : 0)
        const ng = ctx.createRadialGradient(cpt.sx, cpt.sy, 0, cpt.sx, cpt.sy, r0 * 3.2)
        const alpha = (st === 'nodata' ? 0.35 : 1) * appear * (selIdx >= 0 && !isSel ? 0.5 : 1)
        ng.addColorStop(0, `rgba(255,255,255,${alpha})`)
        ng.addColorStop(0.35, `rgba(0,126,236,${0.85 * alpha})`)
        ng.addColorStop(1, 'rgba(0,126,236,0)')
        ctx.fillStyle = ng
        ctx.beginPath()
        ctx.arc(cpt.sx, cpt.sy, r0 * 3.2, 0, Math.PI * 2)
        ctx.fill()
        if (st === 'attention' || isSel) {
          ctx.lineWidth = 1
          for (const k2 of [1, 1.7]) {
            const rr = (10 + 3 * pulse) * k2
            ctx.strokeStyle = `rgba(0,126,236,${(isSel ? 0.9 : 0.6) / k2})`
            ctx.beginPath()
            ctx.ellipse(cpt.sx, cpt.sy, rr, rr * 0.55, 0, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        const btn = labelRefs.current[zi]
        if (btn) {
          btn.style.transform = `translate(${Math.round(cpt.sx)}px, ${Math.round(cpt.sy)}px)`
          btn.style.opacity = String(appear)
          btn.style.zIndex = String(Math.round((2 - cpt.d) * 100))
        }
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [cloud, reduced])

  const onDown = (e: React.PointerEvent) => {
    view.current.drag = { x: e.clientX, yaw: view.current.yaw, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = view.current.drag
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < 4) return
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    d.moved = true
    view.current.yaw = d.yaw + dx * 0.008
  }
  const onUp = () => {
    if (view.current.drag?.moved) {
      suppress.current = true
      window.setTimeout(() => (suppress.current = false), 0)
    }
    view.current.drag = null
  }
  const pick = (z: string | null) => {
    if (!suppress.current) onSelectZone(z)
  }

  const total = arcs.length
  const stateById = new Map(zones.map((z) => [z.zone_id, z]))

  return (
    <div
      ref={wrap}
      className="pship"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => {
        onUp()
        view.current.hover = false
      }}
      onPointerEnter={() => (view.current.hover = true)}
      onClick={() => pick(null)}
      role="group"
      aria-label="점으로 그린 선박 구역도 (배치 예시)"
    >
      <canvas ref={canvas} />
      {segZones.map((z, i) => {
        const st = stateById.get(z.zone_id)
        const sel = selectedZoneId === z.zone_id
        return (
          <button
            key={z.zone_id}
            ref={(el) => {
              labelRefs.current[i] = el
            }}
            className={`pship-label ${st?.status ?? 'nodata'}${sel ? ' selected' : ''}${selectedZoneId && !sel ? ' dim' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              pick(sel ? null : z.zone_id)
            }}
            aria-pressed={sel}
            aria-label={`${z.label} 선택`}
            data-zone={z.zone_id}
          >
            <span className="pship-hit" aria-hidden />
            <span className="pship-text">
              <b>{z.label}</b>
              {z.description && <i>{z.description}</i>}
              <em>{st?.status === 'attention' ? `확인 필요 ${st.needs_confirmation}` : st?.task_headline ?? '작업 데이터 없음'}</em>
            </span>
          </button>
        )
      })}
      <div className="pship-counter" aria-live="polite">
        <span>구역 간 인계 · CONNECTED</span>
        {total ? (
          <>
            <strong className="num">
              {String(landed).padStart(2, '0')}
              <small> / {String(total).padStart(2, '0')}</small>
            </strong>
            <i style={{ width: `${(landed / total) * 100}%` }} />
          </>
        ) : (
          <strong className="none">인계 기록 없음</strong>
        )}
      </div>
    </div>
  )
})
