/**
 * 조선소 작업장 3D 점 구역도 (흰 배경, 아이소메트릭).
 *
 * - 블록 조립장·공장동·도크(선박 선미/선수)·안벽·골리앗 크레인을 점으로 쌓아 만든 '배치 예시' 장면. 실제 도면이 아니다.
 * - zone-map.json 의 scene 값으로 구역 ↔ 시설을 연결한다 (A=blockYard, B=workshop, C=shipAft, D=shipFore, E=quay).
 * - 점 색: 완료 비율만큼 #007EEC 불투명(100%), 나머지는 같은 색 50% 투명도. 작업 데이터가 없는 구역은 회색.
 *   구역에 속하지 않은 시설(크레인·바닥·바다)은 옅은 회색.
 * - 처음 0.8초 동안 점이 바닥에서 솟아올라 제자리로 간다.
 * - night 를 주면 검은 바탕 무대: 점이 가운데 한 점에서 퍼져 나와 작업장이 되고, 뒤쪽 점은 어둡고 앞쪽 점은 밝다.
 *   관제(가운데) → 작업 데이터가 있는 구역으로 강조색 호가 0.4초 간격으로 뻗고, 도착하면 파동이 퍼진다.
 *   호는 서버 작업 데이터가 있는 구역에만 그린다 (연결 구역 수 = 실제 데이터 기준).
 * - rotate 를 주면 그 뒤 작업장 중심을 축으로 천천히 수평 회전한다 (한 바퀴 60초).
 *   마우스가 구역도 위에 있거나, 화면 밖이거나, 탭이 숨겨졌거나, 동작 줄이기 설정이면 멈춘다.
 *   회전 중에는 React 를 다시 그리지 않고 캔버스와 라벨 위치만 직접 갱신한다.
 * - focusZoneId 를 주면 그 구역 시설만 크게 그린다 (구역 화면·타일).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { sceneKeysOf, type SceneKey, type ZoneMap, type ZoneMapEntry } from '../config'
import type { ZoneSummary } from '../data/model'
import { zoneProgress, type ZoneProgress } from './progress'

interface Props {
  zoneMap: ZoneMap
  zones: ZoneSummary[]
  selectedZoneId?: string | null
  focusZoneId?: string | null
  onSelect?: (zoneId: string) => void
  compact?: boolean
  ariaLabel: string
  /** 수평 회전 (현황 전체 구역도만) */
  rotate?: boolean
  /** 바깥(구역 타일)에서 강조할 구역 */
  highlightZoneId?: string | null
  /** 구역도에서 마우스가 가리키는 구역이 바뀔 때 */
  onHoverZone?: (zoneId: string | null) => void
  /** 범례 ⓘ 툴팁 문장 */
  legendNote?: string
  /** 검은 바탕 무대 (깊이 음영 · 퍼짐 등장 · 관제 호) */
  night?: boolean
  /** 구역 라벨의 진행률 대신 보여 줄 문구(플래그 기준). 주면 그 구역 라벨은 이 문구와 톤으로 그린다 */
  zoneNotes?: Record<string, { text: string; tone: 'warn' | 'ok' }>
}

type Tag = SceneKey | 'ctx' | 'ground' | 'water'

// ─── 장면 생성 (단위: 대략 m) ───
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Pt {
  x: number
  y: number
  z: number
  tag: Tag
}

/** m: 점 밀도 배율 (구역 하나만 크게 볼 때 더 촘촘하게) */
function buildScene(m = 1): Pt[] {
  const r = rng(20261010)
  const P: Pt[] = []
  const add = (x: number, y: number, z: number, tag: Tag) => P.push({ x, y, z, tag })
  // 면 위에 점 뿌리기 (density = 점/㎡)
  const quad = (o: number[], u: number[], v: number[], density: number, tag: Tag) => {
    const lu = Math.hypot(u[0], u[1], u[2])
    const lv = Math.hypot(v[0], v[1], v[2])
    const n = Math.max(1, Math.round(lu * lv * density * m))
    for (let i = 0; i < n; i++) {
      const a = r()
      const b = r()
      add(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b, tag)
    }
  }
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, d: number, tag: Tag) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const dz = z1 - z0
    quad([x0, y0, z1], [dx, 0, 0], [0, dy, 0], d, tag) // 윗면
    quad([x0, y0, z0], [dx, 0, 0], [0, 0, dz], d, tag) // 앞
    quad([x0, y1, z0], [dx, 0, 0], [0, 0, dz], d * 0.6, tag) // 뒤
    quad([x0, y0, z0], [0, dy, 0], [0, 0, dz], d * 0.8, tag) // 왼
    quad([x1, y0, z0], [0, dy, 0], [0, 0, dz], d, tag) // 오른
  }
  const line = (a: number[], b: number[], step: number, tag: Tag) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(2, Math.round((L / step) * Math.sqrt(m)))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, tag)
    }
  }
  // 선체: x 방향 길이, 선수(x1)로 갈수록 좁아짐
  const hull = (x0: number, x1: number, yc: number, beam: number, zk: number, zd: number, d: number, tagOf: (x: number) => Tag) => {
    const L = x1 - x0
    const half = (x: number) => {
      const t = (x - x0) / L
      if (t > 0.78) return beam * Math.sqrt(Math.max(0, (1 - t) / 0.22))
      if (t < 0.04) return beam * (0.8 + 0.2 * (t / 0.04))
      return beam
    }
    const n = Math.round(L * (zd - zk) * 2 * d * m)
    for (let i = 0; i < n; i++) {
      const x = x0 + L * r()
      const s = r() // 0 갑판 쪽 → 1 용골
      const side = r() < 0.5 ? -1 : 1
      add(x, yc + side * half(x) * (1 - 0.55 * s * s), zd - (zd - zk) * s, tagOf(x))
    }
    const nd = Math.round(L * beam * 2 * d * 0.9 * m)
    for (let i = 0; i < nd; i++) {
      const x = x0 + L * r()
      add(x, yc + (r() * 2 - 1) * half(x), zd, tagOf(x))
    }
    for (let i = 0; i < L * 4; i++) {
      const x = x0 + L * r()
      add(x, yc + half(x), zd + 0.6, tagOf(x))
      add(x, yc - half(x), zd + 0.6, tagOf(x))
    }
  }

  // 바닥 (성긴 격자)
  for (let x = -4; x <= 104; x += 3) for (let y = 0; y <= 80; y += 3) if (!(x > 24 && x < 100 && y > 42 && y < 72)) add(x + (r() - 0.5), y + (r() - 0.5), 0, 'ground')
  // 바다 (앞쪽)
  for (let x = -4; x <= 104; x += 3.2) for (let y = -22; y < -1; y += 3.2) add(x + (r() - 0.5) * 1.5, y + (r() - 0.5) * 1.5, -1.2, 'water')

  // A 블록 조립장 — 왼쪽 앞: 바닥 패드 + 블록 6개 + 작은 지브 크레인
  quad([2, 4, 0.2], [32, 0, 0], [0, 30, 0], 0.55, 'blockYard')
  const blocks = [
    [5, 7, 9, 7, 5],
    [16, 7, 9, 7, 6],
    [27, 7, 7, 7, 4],
    [5, 20, 9, 8, 6],
    [16, 20, 9, 8, 5],
    [27, 20, 7, 8, 7],
  ]
  for (const [x, y, w, d, h] of blocks) box(x, y, 0, x + w, y + d, h, 1.5, 'blockYard')
  line([33, 32, 0], [33, 32, 16], 0.5, 'blockYard')
  line([33, 32, 16], [18, 32, 16], 0.6, 'blockYard')

  // B 공장동 — 왼쪽 뒤: 큰 건물 + 박공지붕
  box(0, 44, 0, 22, 70, 12, 0.9, 'workshop')
  for (let i = 0; i < 520 * m; i++) {
    const x = r() * 22
    const y = 44 + r() * 26
    add(x, y, 12 + 4 * (1 - Math.abs((y - 57) / 13)), 'workshop')
  }
  box(2, 38, 0, 12, 44, 5, 1.2, 'workshop')

  // 도크 바닥·벽 (맥락)
  quad([25, 43, -6], [75, 0, 0], [0, 29, 0], 0.08, 'ctx')
  quad([25, 43, -6], [75, 0, 0], [0, 0, 6], 0.25, 'ctx')
  quad([25, 72, -6], [75, 0, 0], [0, 0, 6], 0.2, 'ctx')
  quad([25, 43, -6], [0, 29, 0], [0, 0, 6], 0.25, 'ctx')

  // C·D 도크 안 선박 — 선미(C) x 28~62, 선수(D) x 62~98
  hull(28, 98, 57.5, 8, -6, 7, 0.95, (x) => (x < 62 ? 'shipAft' : 'shipFore'))
  box(30, 52, 7, 40, 63, 19, 1.3, 'shipAft') // 선교
  box(33, 55, 19, 38, 60, 23, 1.4, 'shipAft')
  line([36, 57.5, 23], [36, 57.5, 30], 0.5, 'shipAft') // 마스트
  box(44, 53, 7, 52, 62, 11, 1.4, 'shipAft') // 기관실 상부
  for (const x of [66, 74, 82]) box(x, 52.5, 7, x + 6, 62.5, 9, 1.4, 'shipFore') // 해치

  // 골리앗 크레인 — zone-map 에서 구역에 연결 (기본: C구역) — 도크를 가로지름
  for (const yl of [40, 75]) {
    line([54, yl, 0], [54, yl, 34], 0.45, 'gantry')
    line([60, yl, 0], [60, yl, 34], 0.45, 'gantry')
    line([54, yl, 17], [60, yl, 17], 0.6, 'gantry')
  }
  for (const xb of [54, 60]) line([xb, 38, 34], [xb, 77, 34], 0.45, 'gantry')
  for (let y = 38; y <= 77; y += 3) line([54, y, 34], [60, y, 34], 0.7, 'gantry')
  box(55, 56, 31, 59, 60, 34, 1.5, 'gantry')
  // 도크 윤곽선과 작업장 도로 (맥락)
  for (const [a, b] of [[[25, 43, 0], [100, 43, 0]], [[25, 72, 0], [100, 72, 0]], [[25, 43, 0], [25, 72, 0]], [[0, 36, 0], [104, 36, 0]], [[40, 0, 0], [40, 36, 0]], [[0, 74, 0], [24, 74, 0]]] as number[][][])
    line(a, b, 0.7, 'ctx')

  // E 안벽 — 오른쪽 앞: 부두 + 계류 선박 + 타워 크레인 + 창고
  quad([46, 2, 0.4], [56, 0, 0], [0, 18, 0], 0.5, 'quay')
  quad([46, 2, -1.5], [56, 0, 0], [0, 0, 1.9], 0.9, 'quay')
  hull(54, 96, -5.5, 4, -1.5, 3, 1.1, () => 'quay')
  box(58, -8, 3, 64, -3, 9, 1.4, 'quay')
  line([88, 12, 0], [88, 12, 28], 0.45, 'quay')
  line([88, 12, 28], [70, 6, 28], 0.6, 'quay')
  line([88, 12, 28], [94, 14, 28], 0.6, 'quay')
  box(80, 14, 0, 98, 20, 7, 0.9, 'quay')

  // 오른쪽 뒤 타워 크레인 (맥락)
  line([100, 40, 0], [100, 40, 30], 0.45, 'ctx')
  line([100, 40, 30], [84, 48, 30], 0.6, 'ctx')

  return P
}

// ─── 투영 (비스듬히 내려다본 시점: +x 오른쪽, +y(뒤) 위·약간 오른쪽, +z 위) ───
const projX = (p: { x: number; y: number }) => p.x * 0.94 + p.y * 0.34
const Z_SCALE = 0.62
const projY = (p: { x: number; y: number; z: number }) => p.x * 0.15 - p.y * 0.5 - p.z * Z_SCALE
const depth = (p: { x: number; y: number; z: number }) => -p.y + p.z * 0.3 + p.x * 0.1 // 클수록 앞쪽

const ACCENT = '0,126,236'
/** #007EEC 를 흰 바탕 위 50% 투명도로 칠했을 때의 색 */
const ACCENT_HALF = '128,191,246'
const ACCENT_HALF_HOVER = '102,178,243'
/** 검은 바탕(#05070D) 위 50% 투명도 색 */
const NIGHT_BG = [5, 7, 13]
const ACCENT_HALF_N = '3,67,125'
const ACCENT_HALF_HOVER_N = '4,86,160'
const ARC_GAP = 400 // 호 사이 간격 (ms)
const ARC_FLY = 700 // 호 비행 시간
const RIPPLE = 1000 // 도착 파동 시간

/** 라벨 카드가 겹치면 위로 올린다 (줄기를 길게) */
function layoutLabels(items: { zid: string; x: number; y: number }[]) {
  const W = 150
  const H = 50
  const placed: { zid: string; x: number; y: number; lift: number }[] = []
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    let lift = 0
    for (let tries = 0; tries < 6; tries++) {
      const top = it.y - 16 - lift - H
      const hit = placed.some((p) => Math.abs(p.x - it.x) < W && Math.abs(p.y - 16 - p.lift - H - top) < H + 6)
      if (!hit) break
      lift += H * 0.6
    }
    placed.push({ ...it, lift })
  }
  return placed
}


const bufCache = new WeakMap<HTMLCanvasElement, ImageData>()
/** 점을 픽셀 버퍼에 직접 찍는다 (뒤 → 앞 순서, 반투명 점은 아래 픽셀과 섞음) */
function blit(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  order: Uint32Array,
  cur: { x: Float32Array; y: Float32Array },
  colorIdx: Uint16Array,
  palette: [string, number][],
  e: number,
  dot: number,
  shade: boolean,
) {
  let img = bufCache.get(ctx.canvas)
  if (!img || img.width !== W || img.height !== H) {
    img = ctx.createImageData(W, H)
    bufCache.set(ctx.canvas, img)
  }
  const d = img.data
  d.fill(0)
  const pr = new Uint8Array(palette.length)
  const pg = new Uint8Array(palette.length)
  const pb = new Uint8Array(palette.length)
  const pa = new Float32Array(palette.length)
  palette.forEach(([rgb, al], i) => {
    const [r, g, b] = rgb.split(',').map(Number)
    pr[i] = r
    pg[i] = g
    pb[i] = b
    pa[i] = al * (0.2 + 0.8 * e)
  })
  const sz = Math.max(1, Math.round(dot * dpr))
  const half = sz / 2
  for (let j = 0; j < order.length; j++) {
    const i = order[j]
    const x0 = Math.round(cur.x[i] * dpr - half)
    const y0 = Math.round(cur.y[i] * dpr - half)
    if (x0 < 0 || y0 < 0 || x0 + sz > W || y0 + sz > H) continue
    const c = colorIdx[i]
    const a = pa[c]
    // 검은 무대: 그리는 순서(뒤 → 앞)대로 밝기를 올려 뒤쪽 점은 어둡게
    const f = shade ? 0.42 + 0.58 * (j / order.length) : 1
    const r = pr[c] * f, g = pg[c] * f, b = pb[c] * f
    for (let yy = 0; yy < sz; yy++) {
      let o = ((y0 + yy) * W + x0) * 4
      for (let xx = 0; xx < sz; xx++, o += 4) {
        if (a >= 0.999) {
          d[o] = r
          d[o + 1] = g
          d[o + 2] = b
          d[o + 3] = 255
        } else {
          const da = d[o + 3] / 255
          const oa = a + da * (1 - a)
          const kd = (da * (1 - a)) / oa
          const ks = a / oa
          d[o] = r * ks + d[o] * kd
          d[o + 1] = g * ks + d[o + 1] * kd
          d[o + 2] = b * ks + d[o + 2] * kd
          d[o + 3] = oa * 255
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

const TURN_MS = 60000 // 한 바퀴
const ORDER_BUCKETS = 120
/** 회전 시 화면 채움 배율 — 모든 각도를 합친 범위는 한 각도보다 넓어서 그대로 맞추면 작게 보인다 */
const SPIN_FILL = 1.15 // 깊이 정렬을 다시 하는 각도 간격 (3°)

export function YardMap({ zoneMap, zones, selectedZoneId, focusZoneId, onSelect, compact, ariaLabel, rotate, highlightZoneId, onHoverZone, legendNote, night, zoneNotes }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)
  const [intro, setIntro] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [inside, setInside] = useState(false)
  const [visible, setVisible] = useState(true)
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const spinOn = !!rotate && !focusZoneId && !compact && !reduced
  const theta = useRef(0)
  const hv = hover ?? highlightZoneId ?? null

  // 점 밀도: 전체 2.5배, 구역 하나 크게 보기 6배 (이전 대비 각각 2.5배·2배)
  const scene = useMemo(() => buildScene(focusZoneId && !compact ? 6 : 2.5), [focusZoneId, compact])
  const sceneOf = useMemo(() => {
    const m = new Map<SceneKey, ZoneMapEntry>()
    for (const z of zoneMap.zones) for (const k of sceneKeysOf(z)) m.set(k, z)
    return m
  }, [zoneMap])
  const focusEntry = focusZoneId ? zoneMap.zones.find((z) => z.zone_id === focusZoneId) ?? null : null
  const focusKeys = useMemo(() => (focusEntry ? sceneKeysOf(focusEntry) : []), [focusEntry])
  const focusScene = focusKeys.length ? focusKeys.join(',') : null
  const progress = useMemo(() => new Map(zones.map((z) => [z.zone_id, zoneProgress(z)])), [zones])

  // 그릴 점 (구역 시설 점은 완료 비율 채우기를 위해 x 순서로 번호를 매김)
  const pts = useMemo(() => {
    const list = focusScene ? scene.filter((p) => (focusKeys as string[]).includes(p.tag)) : scene
    const byZone = new Map<string, Pt[]>()
    for (const p of list) {
      const z = sceneOf.get(p.tag as SceneKey)
      if (z) {
        const arr = byZone.get(z.zone_id) ?? []
        arr.push(p)
        byZone.set(z.zone_id, arr)
      }
    }
    const rank = new Map<Pt, number>()
    for (const arr of byZone.values()) {
      const sorted = [...arr].sort((a, b) => a.x - a.y * 0.2 - (b.x - b.y * 0.2))
      sorted.forEach((p, i) => rank.set(p, i / sorted.length))
    }
    return { list, rank, byZone }
  }, [scene, sceneOf, focusScene, focusKeys])

  // 회전 중심 = 바다를 뺀 장면의 가운데
  const center = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pts.list) {
      if (p.tag === 'water') continue
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
  }, [pts])

  // 화면 맞춤 — 회전하면 어느 각도에서도 화면 안에 들어오도록 여러 각도의 범위를 합친다
  const fit = useMemo(() => {
    if (!size.w || !pts.list.length) return { k: 1, ox: 0, oy: 0 }
    const padX = compact ? 18 : focusScene ? 40 : 30
    const padTop = compact ? 16 : focusScene ? 30 : spinOn ? 64 : 74
    const padBottom = compact ? 16 : 30
    const W = size.w - padX * 2
    const H = size.h - padTop - padBottom
    // 회전하면 여러 각도의 범위를 합쳐(가운데 고정) 어느 각도에서도 대부분 화면 안에 들어오게 한다
    const angles = spinOn ? Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2) : [0]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const a of angles) {
      const c = Math.cos(a), s = Math.sin(a)
      for (const p of pts.list) {
        if (p.tag === 'water' && !focusScene) continue
        // 회전할 때는 옅은 바닥 점이 아니라 시설 기준으로 맞춘다 (바닥 끝은 조금 잘려도 됨)
        if (spinOn && p.tag === 'ground') continue
        const dx = p.x - center.cx, dy = p.y - center.cy
        const x = center.cx + dx * c - dy * s, y = center.cy + dx * s + dy * c
        const sx = projX({ x, y }), sy = projY({ x, y, z: p.z })
        if (sx < minX) minX = sx
        if (sx > maxX) maxX = sx
        if (sy < minY) minY = sy
        if (sy > maxY) maxY = sy
      }
    }
    const k0 = Math.min(W / (maxX - minX), H / (maxY - minY)) * (spinOn ? SPIN_FILL : 1)
    const k = k0 * zoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return { k, ox: size.w / 2 - cx * k, oy: padTop + H / 2 - cy * k }
  }, [pts, size, compact, focusScene, zoom, spinOn, center])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // 화면 밖·탭 숨김이면 회전을 멈춘다
  useEffect(() => {
    if (!spinOn) return
    const el = wrap.current
    if (!el) return
    let onScreen = true
    const upd = () => setVisible(onScreen && document.visibilityState === 'visible')
    const io = new IntersectionObserver((es) => {
      onScreen = es[0]?.isIntersecting ?? true
      upd()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', upd)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', upd)
    }
  }, [spinOn])

  useEffect(() => {
    if (reduced) {
      setIntro(1)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 800)
      setIntro(t)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [reduced, focusZoneId])

  // 점 기본 값 (회전 중심 기준 상대 좌표). 프레임마다 회전·투영만 한다
  const geo = useMemo(() => {
    const n = pts.list.length
    const dx = new Float32Array(n)
    const dy = new Float32Array(n)
    const z = new Float32Array(n)
    const flat = new Uint8Array(n)
    pts.list.forEach((p, i) => {
      dx[i] = p.x - center.cx
      dy[i] = p.y - center.cy
      z[i] = p.z
      flat[i] = p.tag === 'ground' || p.tag === 'water' ? 1 : 0
    })
    return { n, dx, dy, z, flat, cur: { x: new Float32Array(n), y: new Float32Array(n) }, orders: new Map<number, Uint32Array>() }
  }, [pts, center])

  /** 각도 구간별 그리기 순서 (뒤 → 앞). 계수 정렬이라 빠르다 */
  const orderFor = (a: number) => {
    const b = ((Math.round((a / (Math.PI * 2)) * ORDER_BUCKETS) % ORDER_BUCKETS) + ORDER_BUCKETS) % ORDER_BUCKETS
    let o = geo.orders.get(b)
    if (o) return o
    const ang = (b / ORDER_BUCKETS) * Math.PI * 2
    const c = Math.cos(ang), s = Math.sin(ang)
    const d = new Float32Array(geo.n)
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < geo.n; i++) {
      const rx = center.cx + geo.dx[i] * c - geo.dy[i] * s
      const ry = center.cy + geo.dx[i] * s + geo.dy[i] * c
      const v = depth({ x: rx, y: ry, z: geo.z[i] })
      d[i] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const BINS = 4096
    const scale = (BINS - 1) / Math.max(1e-6, hi - lo)
    const key = new Uint16Array(geo.n)
    const count = new Uint32Array(BINS + 1)
    for (let i = 0; i < geo.n; i++) {
      key[i] = Math.floor((d[i] - lo) * scale)
      count[key[i] + 1]++
    }
    for (let k = 1; k <= BINS; k++) count[k] += count[k - 1]
    o = new Uint32Array(geo.n)
    for (let i = 0; i < geo.n; i++) o[count[key[i]]++] = i
    geo.orders.set(b, o)
    return o
  }

  // 점 색 (데이터·마우스·선택이 바뀔 때만 다시 계산). palette: [rgb, alpha]
  const { colorIdx, palette } = useMemo(() => {
    const palette: [string, number][] = []
    const key = new Map<string, number>()
    const idx = (rgb: string, a: number) => {
      const k = `${rgb}|${a}`
      let v = key.get(k)
      if (v === undefined) {
        v = palette.length
        palette.push([rgb, a])
        key.set(k, v)
      }
      return v
    }
    const colorIdx = new Uint16Array(pts.list.length)
    pts.list.forEach((p, i) => {
      if (p.tag === 'ground') return (colorIdx[i] = night ? idx('150,158,176', 0.24) : idx('160,162,166', 0.28))
      if (p.tag === 'water') return (colorIdx[i] = night ? idx('110,122,146', 0.14) : idx('160,162,166', 0.16))
      const z = sceneOf.get(p.tag as SceneKey)
      if (!z) return (colorIdx[i] = night ? idx('177,179,187', 0.42) : idx('136,138,142', 0.42))
      const pr: ZoneProgress | undefined = progress.get(z.zone_id)
      // 선택·강조된 구역이 있으면 나머지 구역은 흐리게 (타일 흐림과 같은 방식)
      const dim = !focusZoneId && ((!!selectedZoneId && selectedZoneId !== z.zone_id) || (!!hv && hv !== z.zone_id)) ? 0.4 : 1
      // 흐리게 할 때도 점이 겹쳐 다시 진해지지 않도록 바탕색과 미리 섞은 불투명 색을 쓴다
      const bg = night ? NIGHT_BG : [242, 242, 242]
      const fade = (rgb: string) => (dim === 1 ? rgb : rgb.split(',').map((v, j) => Math.round(+v * dim + bg[j] * (1 - dim))).join(','))
      if (!pr?.hasTasks)
        return (colorIdx[i] = night ? idx(hv === z.zone_id ? '214,216,224' : '169,171,179', dim === 1 ? 0.5 : 0.22) : idx(hv === z.zone_id ? '112,112,118' : '142,142,147', dim === 1 ? 0.45 : 0.25))
      const done = (pts.rank.get(p) ?? 1) < pr.ratio
      // 완료: 원래 색 그대로(투명도 0%) · 미완료: 투명도 50% — 겹쳐도 진해지지 않게 '바탕 위 50%' 색을 불투명하게
      if (done) return (colorIdx[i] = idx(fade(ACCENT), 1))
      const half = night ? (hv === z.zone_id ? ACCENT_HALF_HOVER_N : ACCENT_HALF_N) : hv === z.zone_id ? ACCENT_HALF_HOVER : ACCENT_HALF
      colorIdx[i] = idx(fade(half), 1)
    })
    return { colorIdx, palette }
  }, [pts, sceneOf, progress, selectedZoneId, focusZoneId, hv, night])

  // 구역 라벨 기준점 (시설 꼭대기, 회전 중심 기준)
  const anchors = useMemo(() => {
    const m = new Map<string, { dx: number; dy: number; z: number }>()
    for (const z of zoneMap.zones) {
      const keys = sceneKeysOf(z) as string[]
      if (!keys.length) continue
      const own = scene.filter((p) => keys.includes(p.tag))
      if (!own.length) continue
      const cx = own.reduce((s, p) => s + p.x, 0) / own.length
      const cy = own.reduce((s, p) => s + p.y, 0) / own.length
      const zs = own.map((p) => p.z).sort((a, b) => a - b)
      const top = zs[Math.floor(zs.length * 0.9)] // 높은 크레인 끝 대신 시설 윗부분
      m.set(z.zone_id, { dx: cx - center.cx, dy: cy - center.cy, z: top })
    }
    return m
  }, [scene, zoneMap, center])

  const labelPos = (a: number) => {
    const c = Math.cos(a), s = Math.sin(a)
    return layoutLabels(
      [...anchors].map(([zid, p]) => {
        const x = center.cx + p.dx * c - p.dy * s
        const y = center.cy + p.dx * s + p.dy * c
        return { zid, x: fit.ox + projX({ x, y }) * fit.k, y: fit.oy + projY({ x, y, z: p.z }) * fit.k }
      }),
    )
  }

  const labelEls = useRef(new Map<string, HTMLButtonElement>())
  const frames = useRef(0)
  const arcClock = useRef(0)
  const counterEl = useRef<HTMLElement | null>(null)
  // 호를 보낼 구역 = 서버 작업 데이터가 있는 구역 (이름순)
  const arcTargets = useMemo(
    () => [...progress].filter(([zid, pr]) => pr.hasTasks && anchors.has(zid)).map(([zid]) => zid).sort(),
    [progress, anchors],
  )

  // 한 장면 그리기 (각도 a, 등장 진행 e)
  const drawRef = useRef<() => void>(() => {})
  drawRef.current = () => {
    const cv = canvas.current
    if (!cv || !size.w) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // 캔버스 크기는 바뀔 때만 다시 잡는다 (매 프레임 다시 잡으면 느려짐)
    if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
      cv.width = Math.round(size.w * dpr)
      cv.height = Math.round(size.h * dpr)
      cv.style.width = `${size.w}px`
      cv.style.height = `${size.h}px`
    }
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const e = 1 - Math.pow(1 - intro, 3)
    const dot = focusZoneId ? 1.8 : Math.max(1.2, Math.min(1.8, fit.k * 0.3))
    const a = theta.current
    const c = Math.cos(a), s = Math.sin(a)
    const { dx, dy, z, flat, cur } = geo
    const k = fit.k
    // 회전 후 투영: x' = cx + dx·c − dy·s, y' = cy + dx·s + dy·c
    const ax = (0.94 * c + 0.34 * s) * k, ay = (0.34 * c - 0.94 * s) * k
    const bx = (0.15 * c - 0.5 * s) * k, by = (-0.15 * s - 0.5 * c) * k
    const ox = fit.ox + projX({ x: center.cx, y: center.cy }) * k
    const oy = fit.oy + projY({ x: center.cx, y: center.cy, z: 0 }) * k
    const zk = Z_SCALE * k
    if (night) {
      // 가운데 한 점에서 퍼져 나와 작업장이 된다
      for (let i = 0; i < geo.n; i++) {
        cur.x[i] = ox + (dx[i] * ax + dy[i] * ay) * e
        cur.y[i] = oy + (dx[i] * bx + dy[i] * by - z[i] * zk) * e
      }
    } else {
      for (let i = 0; i < geo.n; i++) {
        cur.x[i] = ox + dx[i] * ax + dy[i] * ay
        cur.y[i] = oy + dx[i] * bx + dy[i] * by - z[i] * zk * (flat[i] ? 1 : e)
      }
    }
    const order = orderFor(a)
    if (spinOn) {
      // 회전 구역도: 점 수만큼 fillRect 를 부르면 느려서(프레임당 약 20ms) 픽셀 버퍼에 직접 찍는다
      blit(ctx, cv.width, cv.height, dpr, order, cur, colorIdx, palette, e, dot, !!night)
    } else {
      const pal = palette.map(([rgb, al]) => `rgba(${rgb},${(al * (0.2 + 0.8 * e)).toFixed(3)})`)
      let last = -1
      const h = dot / 2
      for (let j = 0; j < order.length; j++) {
        const i = order[j]
        const ci = colorIdx[i]
        if (ci !== last) {
          ctx.fillStyle = pal[ci]
          last = ci
        }
        ctx.fillRect(cur.x[i] - h, cur.y[i] - h, dot, dot)
      }
    }
    if (night && intro >= 1) {
      // 관제 → 구역 호 (구역 기준점 = 라벨 기준점). 월드 좌표를 같은 회전·투영으로 화면에 옮긴다
      const P = (wx: number, wy: number, wz: number) => [ox + wx * ax + wy * ay, oy + wx * bx + wy * by - wz * zk] as const
      const t = reduced ? Infinity : arcClock.current
      const hub = P(0, 0, 0)
      ctx.save()
      // 관제 표시
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.arc(hub[0], hub[1], 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,126,236,0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(hub[0], hub[1], 7, 3.6, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.font = '500 10px Pretendard, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText('관제', hub[0] + 10, hub[1] + 4)
      let landed = 0
      arcTargets.forEach((zid, n) => {
        const an = anchors.get(zid)
        if (!an) return
        const start = n * ARC_GAP
        const pf = Math.min(1, Math.max(0, (t - start) / ARC_FLY))
        if (pf <= 0) return
        const dist = Math.hypot(an.dx, an.dy)
        const peak = an.z + 6 + dist * 0.45
        const SEG = 36
        const pt = (u: number) => {
          // 2차 베지어: 관제(0,0,0) → 정점 → 구역 꼭대기
          const m = 1 - u
          return P(u * an.dx, u * an.dy, 2 * m * u * peak + u * u * an.z)
        }
        const upto = Math.max(1, Math.round(SEG * pf))
        // 지나온 길 (옅게)
        ctx.strokeStyle = `rgba(40,150,255,${pf < 1 ? 0.5 : 0.7})`
        ctx.lineWidth = 1.6
        ctx.shadowColor = 'rgba(0,126,236,0.9)'
        ctx.shadowBlur = 6
        ctx.beginPath()
        for (let q = 0; q <= upto; q++) {
          const [px, py] = pt((q / SEG) * (pf * SEG / upto))
          if (q === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
        if (pf < 1) {
          // 머리 쪽 꼬리 (밝게) + 머리
          ctx.shadowBlur = 10
          ctx.strokeStyle = 'rgba(150,205,255,1)'
          ctx.lineWidth = 2.6
          ctx.beginPath()
          const tail = Math.max(0, pf - 0.22)
          for (let q = 0; q <= 10; q++) {
            const [px, py] = pt(tail + ((pf - tail) * q) / 10)
            if (q === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
          const [hx, hy] = pt(pf)
          ctx.shadowColor = 'rgba(0,126,236,1)'
          ctx.shadowBlur = 16
          ctx.fillStyle = '#e8f4ff'
          ctx.beginPath()
          ctx.arc(hx, hy, 2.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        } else {
          ctx.shadowBlur = 0
          landed++
          const [ex2, ey2] = pt(1)
          ctx.fillStyle = 'rgba(0,126,236,1)'
          ctx.beginPath()
          ctx.arc(ex2, ey2, 2.2, 0, Math.PI * 2)
          ctx.fill()
          const rt = t - start - ARC_FLY
          if (rt < RIPPLE) {
            const q = rt / RIPPLE
            for (const lag of [0, 0.3]) {
              const qq = q - lag
              if (qq <= 0) continue
              const rr = 4 + qq * 30
              ctx.strokeStyle = `rgba(0,126,236,${(1 - qq) * 0.9})`
              ctx.lineWidth = 1.4
              ctx.beginPath()
              ctx.ellipse(ex2, ey2, rr, rr * 0.5, 0, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }
      })
      ctx.restore()
      if (counterEl.current && counterEl.current.dataset.n !== String(landed)) {
        counterEl.current.dataset.n = String(landed)
        counterEl.current.textContent = String(landed)
      }
    }
    frames.current++
  }

  useEffect(() => {
    drawRef.current()
  }, [geo, colorIdx, palette, size, intro, focusZoneId, fit])

  // 회전 루프: React 를 다시 그리지 않고 캔버스·라벨만 갱신
  const running = spinOn && intro >= 1 && !inside && visible
  const placeLabelsRef = useRef<() => void>(() => {})
  placeLabelsRef.current = () => {
    for (const { zid, x, y, lift } of labelPos(theta.current)) {
      const el = labelEls.current.get(zid)
      if (!el) continue
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.setProperty('--stem', `${16 + lift}px`)
    }
  }
  useEffect(() => {
    const el = wrap.current
    if (el) el.dataset.spin = running ? 'on' : 'off'
    if (!running) return
    let raf = 0
    let prev = performance.now()
    const step = (now: number) => {
      theta.current = (theta.current + ((now - prev) / TURN_MS) * Math.PI * 2) % (Math.PI * 2)
      arcClock.current += now - prev
      prev = now
      drawRef.current()
      placeLabelsRef.current()
      if (el) {
        el.dataset.angle = ((theta.current * 180) / Math.PI).toFixed(1)
        el.dataset.frames = String(frames.current)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running])

  // 마우스 위치에서 가장 가까운 구역 점 (마지막으로 그린 화면 좌표 기준)
  const pick = (mx: number, my: number) => {
    let best: string | null = null
    let bd = 14 * 14
    const { cur } = geo
    for (let i = 0; i < pts.list.length; i++) {
      const z = sceneOf.get(pts.list[i].tag as SceneKey)
      if (!z) continue
      const dx = cur.x[i] - mx
      const dy = cur.y[i] - my
      const d = dx * dx + dy * dy
      if (d < bd) {
        bd = d
        best = z.zone_id
      }
    }
    return best
  }

  const hoverCb = useRef(onHoverZone)
  hoverCb.current = onHoverZone
  useEffect(() => {
    hoverCb.current?.(hover)
  }, [hover])

  // 검증용: 구역별 '불투명(완료) 점 수 / 전체 점 수'
  const pointStats = useMemo(
    () =>
      [...pts.byZone]
        .map(([zid, arr]) => {
          const pr = progress.get(zid)
          const done = pr?.hasTasks ? arr.filter((p) => (pts.rank.get(p) ?? 1) < pr.ratio).length : 0
          return `${zid}:${done}/${arr.length}`
        })
        .join(' '),
    [pts, progress],
  )

  // 검증용: 시설별 소속 구역과 완료/미완료 점 수 (예: gantry>ZONE-C:0/1234)
  const sceneStats = useMemo(() => {
    const acc = new Map<string, { zone: string; done: number; n: number }>()
    pts.list.forEach((p, i) => {
      const z = sceneOf.get(p.tag as SceneKey)
      if (!z) return
      const e = acc.get(p.tag) ?? { zone: z.zone_id, done: 0, n: 0 }
      e.n++
      if (palette[colorIdx[i]]?.[0] === ACCENT) e.done++
      acc.set(p.tag, e)
    })
    return [...acc].map(([k, v]) => `${k}>${v.zone}:${v.done}/${v.n}`).join(' ')
  }, [pts, sceneOf, palette, colorIdx])

  return (
    <div
      ref={wrap}
      data-points={pointStats}
      data-scenes={sceneStats}
      data-hover={hv ?? ''}
      className={`yard-map${onSelect ? ' clickable' : ''}${night ? ' night' : ''}${night && intro < 1 ? ' entering' : ''}`}
      role="group"
      aria-label={ariaLabel}
      onMouseEnter={() => setInside(true)}
      onMouseMove={(e) => {
        if (!inside) setInside(true)
        if (!onSelect) return
        const r = e.currentTarget.getBoundingClientRect()
        const z = pick(e.clientX - r.left, e.clientY - r.top)
        if (z !== hover) setHover(z)
      }}
      onMouseLeave={() => {
        setHover(null)
        setInside(false)
      }}
      onClick={(e) => {
        if (!onSelect) return
        const r = e.currentTarget.getBoundingClientRect()
        const z = pick(e.clientX - r.left, e.clientY - r.top)
        if (z) onSelect(z)
      }}
    >
      <canvas ref={canvas} />
      {night && !focusZoneId && (
        <div className="yard-count" title="관제에서 서버 작업 데이터가 있는 구역으로 연결된 수">
          <b ref={counterEl} data-n="0" className="num">
            0
          </b>
          <span>연결 구역 · 전체 {anchors.size}</span>
        </div>
      )}
      {!focusZoneId &&
        labelPos(theta.current).map(({ zid, x: sx, y: sy, lift }) => {
          const z = zones.find((x) => x.zone_id === zid)
          const cfg = zoneMap.zones.find((m) => m.zone_id === zid)
          const pr = progress.get(zid)
          const note = zoneNotes?.[zid]
          const label = cfg?.label ?? zid
          const letter = label.replace('작업구역', '').trim() || label
          return (
            <button
              key={zid}
              ref={(el) => {
                if (el) labelEls.current.set(zid, el)
                else labelEls.current.delete(zid)
              }}
              className={`yard-label${selectedZoneId === zid ? ' on' : ''}${hv === zid ? ' hover' : ''}${note ? ` tone-${note.tone}` : pr?.hasTasks ? '' : ' none'}`}
              style={{ left: sx, top: sy, ['--stem' as string]: `${16 + lift}px` }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(zid)
              }}
              onMouseEnter={() => setHover(zid)}
              onFocus={() => setHover(zid)}
              onBlur={() => setHover(null)}
              tabIndex={onSelect ? 0 : -1}
              aria-label={`${label} 열기`}
              data-zone={zid}
            >
              <span className="yl-card">
                <b>
                  {label.replace(letter, '')}
                  <strong>{letter}</strong>
                  {cfg?.description && <small>{cfg.description}</small>}
                </b>
                {cfg?.description && <span className="yl-desc">{cfg.description}</span>}
                <span className="yl-meta">
                  <i className="yl-dot" />
                  <em>{note ? note.text : pr?.hasTasks ? `${pr.percent}%` : '작업 데이터 없음'}</em>
                  {!note && pr?.hasTasks && <span> 완료 {pr.done}/{pr.target}</span>}
                  {!note && !!z?.needsConfirmation && <u>확인 {z.needsConfirmation}</u>}
                </span>
              </span>
              <span className="yl-stem" />
              <span className="yl-pin">{letter}</span>
            </button>
          )
        })}
      {!focusZoneId && !compact && (
        <>
          <div className="yard-zoom">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setZoom((z) => Math.min(z * 1.2, 2.2))
              }}
              aria-label="확대"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setZoom((z) => Math.max(z / 1.2, 0.7))
              }}
              aria-label="축소"
            >
              −
            </button>
          </div>
          <div className="yard-legend">
            <span>
              <i className="lg-done" />완료
            </span>
            <span>
              <i className="lg-todo" />미완료
            </span>
            <span>
              <i className="lg-none" />작업 데이터 없음
            </span>
            <span>
              <i className="lg-ctx" />구역 외 시설
            </span>
            {legendNote && (
              <span className="lg-info" tabIndex={0} role="note" aria-label={legendNote} data-tip={legendNote} onClick={(e) => e.stopPropagation()}>
                ⓘ
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
