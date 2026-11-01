import * as THREE from 'three'

// 블록 내부 확대 화면(BlockInspect)에 그리는 블록별 선체 구조.
// 블록마다 단면 모양(선형)이 길이 방향으로 달라지고, 위치에 맞는 부재가 더 붙는다 — 시연용 예시 형상(실제 도면 아님)
//   B-01 중앙: 평행부 — 단면이 일정한 이중저·빌지·현측
//   B-03 기관부: 깊은 이중저 + 주기관 받침대(엔진 시트)·주기관·배관, 갑판에 기관실 개구부
//   B-04 선미: 도크 3D 모델처럼 앞쪽 절반은 평행, 뒤쪽 절반이 뾰족하게 좁아짐. 촘촘한 늑골,
//              선미 끝 선저가 올라간 자리(카운터) 아래에 스케그·선미관·프로펠러·타
//   B-02 선수: 앞으로 갈수록 좁아지고 갑판이 올라감(현호), 충돌 격벽, 구상선수(불바스)
// 좌표: x = 배 길이(+가 선수 쪽), y = 위, z = 중심선(0)에서 현측까지

/** 한 단면: 중심선 선저 높이 yk, 평평한 선저 끝(wb, yb), 빌지가 끝나는 현측(ws, ys), 갑판 끝(wd, h) */
export type Sec = { yk: number; wb: number; yb: number; ws: number; ys: number; wd: number; h: number }
export type Hull = {
  L: number
  frames: number[]
  bulkhead?: number
  /** 이중저(내저판) 높이 */
  db: (s: Sec) => number
  sec: (x: number) => Sec
  botLongi: number[]
  sideLongi: number[]
  deckLongi: number[]
}
/** 부재가 속한 자리 — 선체(외판·갑판·이중저·늑골) / 블록별 장치(선미 추진·조타, 주기관, 구상선수) / 선미 블록 위 거주구·조타실 */
export type Part = 'shell' | 'deck' | 'bottom' | 'frame' | 'extra' | 'house' | 'bridge'
export type Tag = { t: string; k: 'B' | 'S' | 'L' | 'C' | 'w'; at: [number, number, number]; p: Part }
export type Kit = {
  g: THREE.Group
  add: (geo: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, edges?: THREE.Material) => THREE.Mesh
  slab: (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, parent?: THREE.Object3D, edges?: THREE.Material) => THREE.Mesh
  section: (shape: THREE.Shape, x: number, t: number, m: THREE.Material) => THREE.Mesh
  mat: (color: string, finish?: Finish) => THREE.MeshStandardMaterial
  /** 이후에 붙는 부재가 들어갈 분해 묶음을 고른다 */
  part: (p: Part) => void
  /** 지금 묶음의 그룹 — 직접 만든 그룹(프로펠러 날개 축 등)을 붙일 곳 */
  here: () => THREE.Object3D
}
/** 부재 마감 — 확대 화면이 블록 공정 단계(프라이머 / 도장 중 / 도장 완료)에 맞춰 실제 재질처럼 칠한다 */
export type Finish = 'hull' | 'deck' | 'tanktop' | 'structure' | 'collar' | 'bronze' | 'machined' | 'machinery' | 'pipe' | 'house' | 'glass'

export const SW = 1.6, DT = 1.2 // 측면 웨브 깊이 · 갑판 트랜스 깊이
const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)

const MID: Sec = { yk: 0, wb: 7.4, yb: 0, ws: 10, ys: 2.6, wd: 10, h: 9 }
export const HULLS: Record<string, Hull> = {
  'B-01': { L: 18, frames: [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], db: () => 2.2, sec: () => MID, botLongi: [1.6, 4.1, 6.6], sideLongi: [3.2, 6.6], deckLongi: [2, 4.5, 7] },
  'B-03': {
    L: 18, frames: [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], db: () => 3, botLongi: [1.6, 4.1, 6.6], sideLongi: [4.4, 7], deckLongi: [5.2, 7.6],
    // 선미 쪽(-x)으로 갈수록 빌지가 살짝 커진다
    sec: (x) => { const a = (1 - (x + 9) / 18) ** 2; return { yk: 0, wb: 7.4 - 2.2 * a, yb: 0.3 * a, ws: 10 - 0.6 * a, ys: 2.6 + 0.8 * a, wd: 10, h: 9 } },
  },
  'B-04': {
    L: 18, frames: steps(-8, 8.5, 11), db: (s) => Math.max(2.2, s.yb + 1), botLongi: [1.6, 4.1, 6.6], sideLongi: [6.8, 8], deckLongi: [2, 4.5, 7],
    // a: 0 = 블록 가운데부터 앞쪽(평행부), 1 = 선미 끝. 도크 3D 모델(ship-blocks.glb)의 B-04 단면 폭을 재서 맞췄다
    // c: 선미 끝 6m — 선저가 위로 올라가(카운터) 그 아래에 프로펠러와 타가 들어갈 공간을 만든다
    sec: (x) => { const a = Math.max(0, 1 - (x + 9) / 9), c = Math.max(0, 1 - (x + 9) / 6), yk = 4.6 * c ** 1.2, yb = yk + 0.5 * a, wd = 10 - 1.2 * a - 4.8 * a ** 4; return { yk, wb: 0.1 + 7.3 * (1 - a) ** 1.3, yb, ws: Math.min(wd, 0.3 + 9.7 * (1 - a) ** 0.6), ys: Math.min(yb + 2.6 + 1.5 * a, 8.4), wd, h: 9 } },
  },
  'B-02': {
    L: 18, frames: [-7.5, -4.5, -1.5, 1.5, 3, 6, 7.5], bulkhead: 4.5, db: (s) => Math.max(2.2, s.yb + 1), botLongi: [1.6, 4.1, 6.6], sideLongi: [5, 7.6], deckLongi: [2, 4.5, 7],
    // u: 0 = 중앙 블록과 맞닿는 쪽, 1 = 선수 끝. 앞으로 갈수록 좁아지고 갑판이 올라간다(현호)
    sec: (x) => { const u = (x + 9) / 18, yk = 1.2 * u ** 2, yb = yk + 1.5 * u, wd = 10 - 8.8 * u ** 1.8; return { yk, wb: Math.max(0.1, 7.4 * (1 - u) ** 1.8), yb, ws: Math.min(wd, Math.max(0.6, 10 - 9.2 * u ** 1.3)), ys: yb + 2.6 + 2.5 * u, wd, h: 9 + 1.4 * u } },
  },
}
export const hullOf = (id: string) => HULLS[id] ?? HULLS['B-01']

/** 단면 윤곽: 중심선 선저 → 평평한 선저 끝 → 빌지 곡선 → 현측 → 갑판 끝. z·y 모두 순서대로 늘어난다 */
export function outline(s: Sec): [number, number][] {
  const z0 = Math.max(s.wb, 0.05), y0 = s.yb, z3 = Math.max(s.ws, z0 + 0.05), y3 = Math.max(s.ys, y0 + 0.05)
  const c1 = [z0 + (z3 - z0) * 0.55, y0], c2 = [z3, y3 - (y3 - y0) * 0.55]
  const p: [number, number][] = [[0, s.yk], [z0, y0]]
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t
    p.push([u * u * u * z0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * z3, u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y3])
  }
  p.push([Math.max(s.wd, z3), s.h])
  return p
}
// 윤곽선 위에서 i 좌표가 v 인 점의 j 좌표
const along = (p: [number, number][], i: 0 | 1, v: number) => {
  const j = 1 - i
  if (v <= p[0][i]) return p[0][j]
  for (let k = 1; k < p.length; k++) {
    const a = p[k - 1], b = p[k]
    if (b[i] !== a[i] && v >= a[i] && v <= b[i]) return a[j] + ((b[j] - a[j]) * (v - a[i])) / (b[i] - a[i])
  }
  return p[p.length - 1][j]
}
/** 높이 y 에서 외판 안쪽 면의 z */
export const sideZ = (h: Hull, x: number, y: number) => along(outline(h.sec(x)).slice(1), 1, y)
/** 중심선에서 z 만큼 떨어진 곳의 선저 높이 */
export const bottomY = (h: Hull, x: number, z: number) => along(outline(h.sec(x)), 0, z)

/** 길이 방향 단면 선들을 이어 판을 만든다. line 이 null 인 곳은 끊는다 */
export function loft(k: Kit, xs: number[], line: (x: number) => [number, number][] | null, m: THREE.Material, parent?: THREE.Object3D, edges?: THREE.Material) {
  const pos: number[] = [], idx: number[] = []
  let prev: number | null = null
  for (const x of xs) {
    const l = line(x)
    if (!l) { prev = null; continue }
    const base = pos.length / 3
    for (const [z, y] of l) pos.push(x, y, z)
    if (prev !== null) for (let i = 0; i < l.length - 1; i++) { const a = prev + i, b = prev + i + 1, c = base + i, d = base + i + 1; idx.push(a, c, b, b, c, d) }
    prev = base
  }
  if (!idx.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return k.add(geo, m, parent, edges)
}

const ellipse = (z: number, y: number, rz: number, ry: number) => { const p = new THREE.Path(); p.absellipse(z, y, rz, ry, 0, Math.PI * 2, false, 0); return p }

/** extras: false 면 선체(중심선 → 현측 절반)만 — 반대쪽 절반을 거울로 한 번 더 그릴 때 */
export function buildStructure(id: string, k: Kit, opts: { extras?: boolean } = {}): { hull: Hull; tags: Tag[] } {
  const h = hullOf(id)
  const tags: Tag[] = []
  let cur: Part = 'shell'
  const part = (p: Part) => { cur = p; k.part(p) }
  const tag = (t: string, kind: Tag['k'], x: number, y: number, z: number) => tags.push({ t, k: kind, at: [x, y, z], p: cur })
  const SHELL = k.mat('#8d99a3', 'hull'), FRAME = k.mat('#b3bcc3', 'structure'), LONGI = k.mat('#7d8994', 'structure'), BRKT = k.mat('#c4ccd2', 'structure'), DECK = k.mat('#9aa6af', 'deck'), TANK = k.mat('#9aa6af', 'tanktop'), COLLAR = k.mat('#a7b8ad', 'collar')
  const half = h.L / 2
  const opening = id === 'B-03' ? 4 : 0 // 기관실 개구부(|x| < 4, z < 4.2)
  // 외판을 늑골 앞뒤 면에서도 꺾어, 휘어진 선미·선수에서 늑골 끝이 외판 밖으로 비어져 나오지 않게 한다
  const xs = [...new Set([...steps(-half, half, 36), ...(opening ? [-opening, opening] : []), ...h.frames.flatMap((f) => [f - 0.07, f + 0.07]).filter((x) => Math.abs(x) < half)])].sort((a, b) => a - b)
  const ft = (x: number) => h.db(h.sec(x))

  // 외판
  part('shell')
  loft(k, xs, (x) => outline(h.sec(x)), SHELL)
  part('deck')
  // 갑판 — 기관부는 가운데에 기관실 개구부와 둘레 코밍
  if (opening) {
    loft(k, xs, (x) => (Math.abs(x) < opening ? null : [[0, h.sec(x).h], [h.sec(x).wd, h.sec(x).h]]), DECK)
    loft(k, xs, (x) => (Math.abs(x) > opening ? null : [[4.2, h.sec(x).h], [h.sec(x).wd, h.sec(x).h]]), DECK)
    k.slab(-opening, opening, 9, 10.2, 4.2, 4.32, DECK)
    for (const sx of [-1, 1]) k.slab(sx * opening - 0.06, sx * opening + 0.06, 9, 10.2, 0, 4.32, DECK)
    tag('Casing Opening', 'w', 0, 10.6, 2)
  } else loft(k, xs, (x) => [[0, h.sec(x).h], [h.sec(x).wd, h.sec(x).h]], DECK)
  // 내저판(탱크 탑)
  part('bottom')
  loft(k, xs, (x) => [[0, ft(x)], [sideZ(h, x, ft(x)) - SW, ft(x)]], TANK)
  // 중심선 거더 — 늑골 사이마다 맨홀
  {
    const s = new THREE.Shape()
    s.moveTo(-half, h.sec(-half).yk)
    for (const x of xs) s.lineTo(x, h.sec(x).yk)
    for (const x of [...xs].reverse()) s.lineTo(x, ft(x))
    s.closePath()
    const fr = h.frames
    for (let i = 0; i < fr.length - 1; i++) {
      const xm = (fr[i] + fr[i + 1]) / 2, yk = h.sec(xm).yk, ry = Math.min(0.4, (ft(xm) - yk) / 2 - 0.3)
      if (ry > 0.2 && fr[i + 1] - fr[i] > 1.6) s.holes.push(ellipse(xm, (yk + ft(xm)) / 2, Math.min(0.55, (fr[i + 1] - fr[i]) / 2 - 0.3), ry))
    }
    k.add(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }), FRAME)
    tag('Girder', 'w', 3, (h.sec(3).yk + ft(3)) / 2, -0.1)
  }

  part('frame')
  // 늑골(웨브 프레임) — 가운데가 뚫린 판. 좁아서 못 뚫는 곳은 경량 구멍만 낸 막힌 판
  let tagFrame: number | null = null
  for (const x of h.frames) if (sideZ(h, x, ft(x)) - SW - 0.9 > 2.2) tagFrame = x
  for (const x of h.frames) {
    // 늑골 판 두께(앞뒤 0.06) 안에서 선형이 좁아지는 쪽 윤곽을 따라야 늑골 끝이 외판 밖으로 비치지 않는다
    const s = h.sec(x), pa = outline(h.sec(x - 0.07)), pb = outline(h.sec(x + 0.07)), f = ft(x), top = s.h - DT
    const p = pa.map(([za, ya], i): [number, number] => { const [zb, yb] = pb[i]; return [Math.min(za, zb) - 0.015, ya < s.h - 0.01 ? Math.max(ya, yb) + 0.015 : ya] })
    const shape = new THREE.Shape()
    shape.moveTo(p[0][0], p[0][1])
    for (const q of p.slice(1)) shape.lineTo(q[0], q[1])
    shape.lineTo(0, s.h)
    shape.closePath()
    const zIn = sideZ(h, x, f) - SW
    const open = zIn - 0.9 > 2.2 && top - f > 2
    const isTag = x === tagFrame
    if (open) {
      const hole = new THREE.Path()
      hole.moveTo(0.9, f); hole.lineTo(0.9, top); hole.lineTo(zIn, top); hole.lineTo(zIn, f); hole.closePath()
      shape.holes.push(hole)
      // 플로어 접근 구멍 — 종통재 사이
      const marks = [0.9, ...h.botLongi.filter((z) => z < zIn), zIn]
      let first = true
      for (let i = 0; i < marks.length - 1; i++) {
        const zc = (marks[i] + marks[i + 1]) / 2, by = bottomY(h, x, zc), room = f - by
        if (room > 1.3 && zc - 0.65 > 0.9 && zc + 0.65 < zIn) {
          shape.holes.push(ellipse(zc, (by + f) / 2 + 0.1, 0.6, Math.min(0.42, room / 2 - 0.3)))
          if (isTag && first) { tag('Access Hole', 'w', x + 0.1, (by + f) / 2 + 0.1, zc); first = false }
        }
      }
      // 현측 웨브 접근 구멍
      const ym = (f + top) / 2, zs = sideZ(h, x, ym)
      if (zs - zIn >= 1.3) shape.holes.push(ellipse(zIn + (zs - zIn) / 2, ym, 0.42, Math.min(0.8, (top - f) / 2 - 0.5)))
    } else if (s.wd > 2.2) {
      shape.holes.push(ellipse(s.wd * 0.42, (s.yb + s.h) / 2, Math.min(0.55, s.wd * 0.15), 0.9))
    }
    k.section(shape, x, 0.12, FRAME)
    if (isTag) { tag('Frame', 'w', x + 0.1, top + DT / 2, 3) }
    if (!open) continue
    // 모서리 브래킷(B)
    const bs = Math.min(1.5, (zIn - 0.9) / 3)
    for (const [cz, cy, dz, dy] of [[zIn, top, -bs, -bs], [zIn, f, -bs, bs], [0.9, f, bs * 0.8, bs * 0.8], [0.9, top, bs * 0.8, -bs * 0.8]] as const) {
      const b = new THREE.Shape()
      b.moveTo(cz, cy); b.lineTo(cz + dz, cy); b.quadraticCurveTo(cz + dz * 0.3, cy + dy * 0.3, cz, cy + dy); b.closePath()
      k.section(b, x, 0.12, BRKT)
      if (isTag) tag('B', 'B', x + 0.1, cy + dy * 0.33, cz + dz * 0.33)
    }
    // 스티프너(S) — 플로어 세로, 갑판 트랜스 세로, 현측 웨브 가로
    const fz = h.botLongi.filter((z) => z < zIn - 0.3)[1] ?? h.botLongi[0]
    const fy = bottomY(h, x, fz) + 0.6
    if (f - fy > 0.4) { k.slab(x + 0.06, x + 0.4, fy, f, fz - 0.03, fz + 0.03, FRAME); if (isTag) tag('S', 'S', x + 0.25, (fy + f) / 2, fz) }
    for (const z of [3, 6].filter((z) => z < zIn - 0.3)) { k.slab(x + 0.06, x + 0.4, top, s.h, z - 0.03, z + 0.03, FRAME); if (isTag && z === 6) tag('S', 'S', x + 0.25, top + DT / 2, z) }
    const sy = top - 0.6, szs = sideZ(h, x, sy) - 0.6
    if (szs - zIn > 0.3) { k.slab(x + 0.06, x + 0.4, sy - 0.03, sy + 0.03, zIn, szs, FRAME); if (isTag) tag('S', 'S', x + 0.25, sy, (zIn + szs) / 2) }
    // 칼라(C) — 종통재가 늑골을 지나는 자리
    for (const z of h.botLongi) if (z < s.wb - 0.2) {
      const by = bottomY(h, x, z)
      k.slab(x + 0.06, x + 0.12, by + 0.3, by + 0.95, z - 0.3, z + 0.3, COLLAR)
      if (isTag && z === h.botLongi[1]) tag('C', 'C', x + 0.15, by + 0.8, z)
    }
    for (const y of h.sideLongi) if (y >= s.ys && y <= s.h - 0.7) {
      const zs = sideZ(h, x, y)
      k.slab(x + 0.06, x + 0.12, y - 0.3, y + 0.3, zs - 0.95, zs - 0.3, COLLAR)
      if (isTag && y === h.sideLongi[0]) tag('C', 'C', x + 0.15, y, zs - 0.8)
    }
  }

  // 충돌 격벽(선수) — 막힌 판 + 세로 스티프너
  if (h.bulkhead !== undefined) {
    const x = h.bulkhead, s = h.sec(x), p = outline(s)
    const shape = new THREE.Shape()
    shape.moveTo(p[0][0], p[0][1])
    for (const q of p.slice(1)) shape.lineTo(q[0], q[1])
    shape.lineTo(0, s.h)
    shape.closePath()
    k.section(shape, x, 0.14, k.mat('#a3b0ba', 'structure'))
    for (let z = 0.8; z < s.wd - 0.3; z += 1.1) k.slab(x - 0.4, x - 0.07, bottomY(h, x, z) + 0.1, s.h - 0.1, z - 0.03, z + 0.03, FRAME)
    tag('Collision Bhd', 'w', x - 0.3, s.h - 1.6, s.wd * 0.45)
  }

  // 종통재(L) — T형: 웨브 + 면재. 선형이 바뀌는 곳에서는 외판을 따라 휘고, 들어갈 자리가 없으면 끊긴다
  const lx = Math.min(half - 0.4, (tagFrame ?? 0) + 1.2)
  part('bottom')
  for (const z of h.botLongi) {
    const ok = (x: number) => z < h.sec(x).wb - 0.2
    loft(k, xs, (x) => (ok(x) ? [[z, bottomY(h, x, z)], [z, bottomY(h, x, z) + 0.6]] : null), LONGI)
    loft(k, xs, (x) => (ok(x) ? [[z - 0.18, bottomY(h, x, z) + 0.6], [z + 0.18, bottomY(h, x, z) + 0.6]] : null), LONGI)
    if (ok(lx) && z !== h.botLongi[1]) tag('L', 'L', lx, bottomY(h, lx, z) + 0.4, z)
  }
  part('frame')
  for (const y of h.sideLongi) {
    const ok = (x: number) => y >= h.sec(x).ys && y <= h.sec(x).h - 0.7
    loft(k, xs, (x) => (ok(x) ? [[sideZ(h, x, y) - 0.6, y], [sideZ(h, x, y), y]] : null), LONGI)
    loft(k, xs, (x) => (ok(x) ? [[sideZ(h, x, y) - 0.6, y - 0.18], [sideZ(h, x, y) - 0.6, y + 0.18]] : null), LONGI)
    if (ok(lx) && y === h.sideLongi[h.sideLongi.length - 1]) tag('L', 'L', lx, y, sideZ(h, lx, y) - 0.3)
  }
  part('deck')
  for (const z of h.deckLongi) {
    const ok = (x: number) => z < h.sec(x).wd - 0.6 && !(opening && Math.abs(x) < opening && z < 4.3)
    loft(k, xs, (x) => (ok(x) ? [[z, h.sec(x).h - 0.6], [z, h.sec(x).h]] : null), LONGI)
    loft(k, xs, (x) => (ok(x) ? [[z - 0.18, h.sec(x).h - 0.6], [z + 0.18, h.sec(x).h - 0.6]] : null), LONGI)
    if (ok(lx) && z === h.deckLongi[1]) tag('L', 'L', lx, h.sec(lx).h - 0.4, z)
  }
  // 칼링 — 늑골 사이 갑판 밑 짧은 보
  const fr = h.frames.filter((x) => x !== h.bulkhead)
  let carl = false
  for (let i = 0; i < fr.length - 1; i++) {
    const xm = (fr[i] + fr[i + 1]) / 2, s = h.sec(xm)
    if (s.wd < 6.5 || (opening && Math.abs(xm) < opening)) continue
    k.slab(fr[i] + 0.12, fr[i + 1] - 0.12, s.h - 0.75, s.h, 5.47, 5.53, LONGI)
    if (!carl && xm > 0) { tag('Carling', 'w', xm, s.h - 0.5, 5.5); carl = true }
  }
  {
    const xd = (tagFrame ?? 0) - 4, xs2 = -3
    tag('Deck', 'w', xd, h.sec(xd).h + 0.5, h.sec(xd).wd / 2)
    part('shell')
    tag('Shell', 'w', xs2, h.sec(xs2).ys + 0.8, sideZ(h, xs2, h.sec(xs2).ys + 0.8) + 0.3)
  }

  if (opts.extras === false) return { hull: h, tags }
  // ---- 블록별로 더 붙는 부재 ----
  part('extra')
  if (id === 'B-03') {
    // 주기관 받침대(엔진 시트): 세로 거더 + 윗판 + 늑골마다 무릎 브래킷, 그 위에 주기관
    const f = 3
    k.slab(-6, 6, f, f + 1.3, 2.37, 2.43, FRAME)
    k.slab(-6, 6, f + 1.3, f + 1.44, 1.9, 2.9, BRKT)
    for (const x of h.frames.filter((x) => Math.abs(x) < 6)) {
      const b = new THREE.Shape(); b.moveTo(2.43, f); b.lineTo(3.7, f); b.lineTo(2.43, f + 1.25); b.closePath()
      k.section(b, x, 0.12, BRKT)
    }
    const eng = k.mat('#5d7186', 'machinery')
    k.slab(-5, 5, f + 1.44, f + 5.2, 0, 1.9, eng)
    for (let x = -4.2; x <= 4.3; x += 1.4) k.slab(x - 0.5, x + 0.5, f + 5.2, f + 5.9, 0, 1.3, k.mat('#6f8397', 'machinery'))
    tag('Engine Seat', 'w', 5.4, f + 1.4, 2.4)
    tag('Main Engine', 'w', 0, f + 6.4, 0.9)
    // 현측을 따라 가는 배관(해수·연료·냉각수)
    for (const [y, c] of [[5.4, '#3f9b5a'], [6, '#e2b23a'], [6.6, '#2f6fb3']] as const) {
      const pipe = k.add(new THREE.CylinderGeometry(0.17, 0.17, h.L, 14), k.mat(c, 'pipe'))
      pipe.rotation.z = Math.PI / 2
      pipe.position.set(0, y, 7.6)
    }
    tag('Pipe', 'w', -6, 6.9, 7.6)
  }
  if (id === 'B-04') {
    // 선미 아래 — 스케그(중심선 지느러미 판) 속을 선미관이 지나 프로펠러로 이어지고, 바로 뒤에 선체에 매달린 타
    const PX = -7.95, PY = 2.1 // 프로펠러 중심
    const s = new THREE.Shape()
    s.moveTo(-3, 0)
    for (const x of xs.filter((x) => x < -3 && x > -7.4).reverse()) s.lineTo(x, h.sec(x).yk)
    s.lineTo(-7.4, h.sec(-7.4).yk); s.lineTo(-7.4, 0.3); s.closePath()
    const skeg = k.add(new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }), SHELL)
    skeg.position.z = -0.08
    const steelDark = k.mat('#7a8691', 'machined'), bronze = k.mat('#b08d57', 'bronze')
    const boss = k.add(new THREE.CylinderGeometry(0.5, 0.5, 4.3, 24), steelDark) // 선미관 보스
    boss.rotation.z = Math.PI / 2
    boss.position.set(-5.45, PY, 0)
    // 프로펠러: 허브 + 끝 캡 + 비틀린 날개 4장
    const hub = k.add(new THREE.CylinderGeometry(0.38, 0.38, 0.8, 20), bronze)
    hub.rotation.z = Math.PI / 2
    hub.position.set(PX, PY, 0)
    const cap = k.add(new THREE.ConeGeometry(0.38, 0.6, 20), bronze)
    cap.rotation.z = Math.PI / 2 // 뾰족한 끝이 뒤(-x)로
    cap.position.set(PX - 0.7, PY, 0)
    const bs = new THREE.Shape()
    bs.absellipse(0.9, 0, 0.55, 0.32, 0, Math.PI * 2, false, 0)
    const bladeGeo = new THREE.ExtrudeGeometry(bs, { depth: 0.06, bevelEnabled: false, curveSegments: 20 })
    bladeGeo.translate(0, 0, -0.03)
    bladeGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)) // 모양(반지름, 폭, 두께) → (y, z, x)
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group()
      arm.position.set(PX, PY, 0)
      arm.rotation.x = (i * Math.PI) / 2 + 0.4
      k.here().add(arm)
      k.add(bladeGeo, bronze, arm).rotation.y = 0.5 // 날개 비틀림(피치)
    }
    // 타: 앞이 둥글고 뒤가 얇은 유선형 판(NACA 단면) + 선체 바닥으로 올라가는 타두재
    const ch = 1.4, th = 0.2, x0 = -8.55, half2: number[] = []
    for (let i = 0; i <= 16; i++) { const u = (i / 16) ** 1.6; half2.push(5 * th * ch * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)) }
    const us = half2.map((_, i) => (i / 16) ** 1.6)
    const rs = new THREE.Shape()
    rs.moveTo(x0, 0)
    for (let i = 1; i <= 16; i++) rs.lineTo(x0 - us[i] * ch, half2[i])
    for (let i = 15; i >= 1; i--) rs.lineTo(x0 - us[i] * ch, -half2[i])
    rs.closePath()
    const rudderGeo = new THREE.ExtrudeGeometry(rs, { depth: 3.2, bevelEnabled: false })
    rudderGeo.rotateX(-Math.PI / 2) // 뽑은 방향(높이) → 위. 축을 맞바꾸면 면 방향이 뒤집혀 검게 보이므로 회전으로
    rudderGeo.translate(0, 0.55, 0)
    k.add(rudderGeo, SHELL)
    const sx = x0 - 0.3 * ch, top = h.sec(sx).yk + 0.5
    const stock = k.add(new THREE.CylinderGeometry(0.13, 0.13, top - 3.75, 14), steelDark)
    stock.position.set(sx, (3.75 + top) / 2, 0)
    tag('Skeg', 'w', -5.2, 0.8, 0.3)
    tag('Stern Tube', 'w', -5.5, PY + 0.85, 0)
    tag('Propeller', 'w', PX, 0.2, 0.3)
    tag('Rudder', 'w', -9.3, 2.2, 0.3)
    // 갑판 위 거주구(숙소·사무실 4층 + 연돌)와 맨 위 조타실 — 도크 3D 모델처럼 선미 블록에 함께 실린다. 선체 양현에 걸친 전체 폭
    part('house')
    const HOUSE = k.mat('#e8ecef', 'house'), GLASS = k.mat('#24384f', 'glass')
    const hx0 = -6.5, hx1 = 3.5, hw = 6.2, d0 = h.sec(0).h
    k.slab(hx0, hx1, d0, d0 + 8, -hw, hw, HOUSE)
    for (const y of [d0 + 2, d0 + 4, d0 + 6]) k.slab(hx0 - 0.12, hx1 + 0.12, y - 0.08, y + 0.08, -hw - 0.12, hw + 0.12, HOUSE) // 층 띠
    for (let lv = 0; lv < 4; lv++) {
      const y = d0 + 1.1 + lv * 2
      for (let z = -hw + 0.9; z <= hw - 0.8; z += 1.35) k.slab(hx1, hx1 + 0.06, y - 0.35, y + 0.35, z - 0.4, z + 0.4, GLASS)
      for (let x = hx0 + 0.8; x <= hx1 - 0.7; x += 1.3) for (const sz of [-1, 1]) k.slab(x - 0.4, x + 0.4, y - 0.35, y + 0.35, sz * hw - 0.03, sz * hw + 0.03, GLASS)
    }
    k.slab(-6, -3.6, d0 + 8, d0 + 12.5, -1.6, 1.6, HOUSE) // 연돌
    k.slab(-6.05, -3.55, d0 + 11.7, d0 + 12.5, -1.65, 1.65, GLASS) // 연돌 꼭대기 검은 띠
    tag('Accommodation', 'w', hx1 + 0.3, d0 + 5, 2.5)
    tag('Funnel', 'w', -4.8, d0 + 13.2, 0)
    part('bridge')
    const b0 = d0 + 8
    k.slab(-1.5, 3.5, b0, b0 + 2.8, -6, 6, HOUSE)
    for (const sz of [-1, 1]) k.slab(-0.5, 3.2, b0 + 0.6, b0 + 2.6, sz > 0 ? 6 : -7.6, sz > 0 ? 7.6 : -6, HOUSE) // 브리지 윙
    k.slab(3.5, 3.56, b0 + 1.2, b0 + 2.4, -5.8, 5.8, GLASS) // 앞 유리창
    for (const sz of [-1, 1]) k.slab(3.2, 3.26, b0 + 1.4, b0 + 2.4, sz > 0 ? 6.1 : -7.4, sz > 0 ? 7.4 : -6.1, GLASS)
    k.slab(-1.7, 3.8, b0 + 2.8, b0 + 3, -7.8, 7.8, HOUSE) // 지붕
    k.slab(-0.8, -0.5, b0 + 3, b0 + 6, -0.15, 0.15, steelDark) // 마스트
    k.slab(-0.9, -0.4, b0 + 5.2, b0 + 5.35, -1.4, 1.4, steelDark) // 레이더
    tag('Wheelhouse', 'w', 3.7, b0 + 1.8, 0)
  }
  if (id === 'B-02') {
    // 구상선수(불바스) — 선수 끝 아래로 둥글게 튀어나온 부분
    const bulb = k.add(new THREE.SphereGeometry(1, 28, 18), SHELL)
    bulb.scale.set(2.8, 1.5, 1.25)
    bulb.position.set(9.4, 2.2, 0)
    tag('Bulbous Bow', 'w', 11, 3.4, 0.6)
  }
  return { hull: h, tags }
}
