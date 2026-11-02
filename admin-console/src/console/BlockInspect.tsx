import { type CSSProperties, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type Finish, buildStructure, HULLS, loft, sideZ, type Kit, type Part, type Tag } from './blockStructure'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { fpsMeter, makeView, surfacePatch, touchControls, type Surface } from './twinFx'

// 블록을 고르면 도크 3D 위에 겹쳐 뜨는 '블록 내부 확대' 화면.
// 블록마다 다른 선체 구조(blockStructure — 외판·이중저·늑골·종통재·브래킷·스티프너·칼라·거더·칼링·갑판 + 블록별 부재)를 그리고,
// 현장 확인 요청과 맞는 위치를 빨갛게 표시한 뒤 카메라가 그 자리로 줌인한다.
export type InspectRequest = { id: string; title: string; detail: string; text: string }
type Spot = { key: string; title: string; desc: string; at: [number, number, number]; view: [number, number, number]; keys: string[]; inside: boolean }
type Plan = { name: string; flip: boolean; note: string; spots: Spot[] }

// 버튼마다 24×24 선 그림 아이콘 — 참고한 SMASH 저장소처럼 그림 파일 없이 SVG 경로를 직접 그린다 (stroke = 글자색)
const ICONS: Record<string, string> = {
  back: 'M15 5l-7 7 7 7',
  block: 'M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z M12 12l8.5-4.7 M12 12v9.5 M12 12L3.5 7.3',
  tags: 'M3 11.5V4a1 1 0 0 1 1-1h7.5l9.5 9.5-8.5 8.5z M7.5 6.5h.01',
  xray: 'M12 3l9 5-9 5-9-5z M3 12.5l9 5 9-5 M3 17l9 5 9-5',
  lug: 'M4 20.5h16 M7.5 20.5l1.2-8.2a3.3 3.3 0 0 1 6.6 0l1.2 8.2 M12 12.4v.01 M12 2.5v4 M10 4.5l2 2 2-2',
  reinforce: 'M4 20.5V5l15.5 15.5z M4 14h6.5 M8 20.5V12',
  coat: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z M9.5 15a2.6 2.6 0 0 0 2.5 2.4',
  tray: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z',
  route: 'M2.5 16.5V7h11v9.5 M13.5 10h4l3 3.5v3h-7 M6 19a2 2 0 1 0 0-.01 M17 19a2 2 0 1 0 0-.01',
  alert: 'M12 3.5l9.5 17h-19z M12 10v5 M12 17.6v.01',
  plan: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z M12 9.5v.01',
  explode: 'M9 3.5H4.5v4.5 M15 3.5h4.5v4.5 M9 20.5H4.5V16 M15 20.5h4.5V16 M9.5 9.5h5v5h-5z',
}
function Icon({ name }: { name: string }) {
  return <svg className="bi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] ?? ICONS.plan} /></svg>
}
// 블록별 마감 상태 — B-04·B-02 는 공장 프라이머만(용접선이 맨 강재로 보임), B-01(선미) 은 선저만 도장, B-03 은 전체 도장
type Look = 'primer' | 'bottom' | 'done'
const LOOK: Record<string, Look> = { 'B-04': 'primer', 'B-02': 'primer', 'B-01': 'bottom', 'B-03': 'done' }
const hullWL: Record<string, number> = { 'B-03': 3.4, 'B-01': 3.0 } // 선저 도장 높이(흘수선)
const PRIMER = '#7a4b3c', PRIMER_IN = '#9a6a59', COAT_IN = '#cdbf9f'
function finishOf(f: Finish, look: Look, color: string, wl: number): { color: string; rough: number; metal: number; surface: Surface } {
  const coated = look !== 'primer'
  const inner = coated ? COAT_IN : PRIMER_IN
  const weld = coated ? '#5a3e36' : '#c6cbcf' // 도장 전 용접선은 갈아 낸 맨 강재, 도장 뒤에는 도막 아래로 살짝
  switch (f) {
    case 'hull': return { color: PRIMER, rough: coated ? 0.5 : 0.72, metal: 0.05, surface: { mottle: coated ? 0.45 : 0.85, outerFront: true, back: inner, seams: weld, hull: coated ? { wl, bottom: '#7a2a21', boot: '#25282c', top: look === 'done' ? '#56616b' : undefined } : undefined } }
    // 갑판·내저판 — 윗면은 갑판 도장/탱크탑 색, 아랫면은 내부 코팅
    case 'deck': return { color: look === 'done' ? '#5b7361' : PRIMER, rough: 0.7, metal: 0.04, surface: { mottle: 0.6, outerFront: true, back: inner, seams: weld } }
    case 'tanktop': return { color: coated ? '#8e8a7f' : PRIMER_IN, rough: 0.66, metal: 0.04, surface: { mottle: 0.6, outerFront: true, back: inner } }
    case 'collar': return { color: '#8f979d', rough: 0.42, metal: 0.55, surface: { mottle: 0.4, outerFront: true } }
    case 'bronze': return { color: '#c9965b', rough: 0.2, metal: 1, surface: { mottle: 0.15, outerFront: true } }
    case 'machined': return { color: '#aab1b7', rough: 0.3, metal: 0.9, surface: { mottle: 0.15, outerFront: true } }
    case 'machinery': return { color, rough: 0.45, metal: 0.2, surface: { mottle: 0.25, outerFront: true } }
    case 'pipe': return { color, rough: 0.35, metal: 0.1, surface: { mottle: 0.15, outerFront: true } }
    // 거주구·조타실 — 흰 상부 구조 도장, 창은 짙은 유리
    case 'house': return { color: '#e6eaed', rough: 0.5, metal: 0.05, surface: { mottle: 0.3, outerFront: true } }
    case 'glass': return { color: '#22344a', rough: 0.12, metal: 0.4, surface: { mottle: 0.05, outerFront: true } }
    default: { // 늑골·브래킷·종통재 — 부재마다 원래 밝기 차이를 살려 내부 코팅/프라이머 색에 곱한다
      const t = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l
      const c = new THREE.Color(inner).multiplyScalar(0.78 + 0.32 * t)
      return { color: `#${c.getHexString()}`, rough: 0.62, metal: 0.05, surface: { mottle: 0.65, outerFront: true } }
    }
  }
}

// 블록 나누기 — 큰 블록을 그 안의 작은 블록(조타실 · 거주구 · 선체 우현 · 선체 좌현 · 추진·조타)으로 크게 나눠 띄운다
// off = 나눌 때 옮기는 거리(블록 좌표: y 위, z 중심선 → 우현. 거울로 그린 좌현은 -z)
type Chunk = 'bridge' | 'house' | 'stbd' | 'port' | 'prop'
type ChunkInfo = { name: string; desc: string; color: string; off: [number, number, number] }
const SPLIT: Record<string, Partial<Record<Chunk, ChunkInfo>>> = {
  'B-01': {
    bridge: { name: '조타실', desc: '거주구 맨 위, 배를 조종하는 곳이에요. 양옆으로 튀어나온 브리지 윙까지 한 덩어리로 따로 만들어 올려요.', color: '#d4a017', off: [0, 10, 0] },
    house: { name: '거주구', desc: '선원 숙소·사무실 4층과 연돌이에요. 따로 지어서 갑판 위에 통째로 올려요.', color: '#2f9e6b', off: [0, 5, 0] },
    stbd: { name: '선체 우현', desc: '중심선에서 우현까지 선체 절반이에요. 외판·이중저·늑골·갑판이 함께 붙어 있고, 러그 부착 자리와 그 아래 보강재가 이쪽에 있어요.', color: '#e0662f', off: [0, 0, 8] },
    port: { name: '선체 좌현', desc: '중심선에서 좌현까지 선체 절반이에요. 우현과 같은 구조로, 도크에서 중심선을 맞춰 붙여요.', color: '#2f8cff', off: [0, 0, -8] },
    prop: { name: '추진·조타', desc: '선미 아래 스케그와 선미관, 프로펠러, 타예요. 블록 탑재 뒤 축계·타 정렬을 따로 맞춰요.', color: '#8b5cf6', off: [-7, -1.5, 0] },
  },
}
const SPOT_CHUNK: Record<string, Chunk> = { lug: 'stbd', reinforce: 'stbd' }
// 부재 자리 → 작은 블록. 나누지 않는 블록은 전부 한 덩어리(stbd)
const chunkOf = (split: boolean, p: Part, side: Chunk): Chunk => (!split ? 'stbd' : p === 'extra' ? 'prop' : p === 'house' || p === 'bridge' ? p : side)

// 블록 전체를 보는 방향 — 도크 3D 가 블록으로 날아갈 때와 같은 방향(선수 쪽·우현 위). 그래서 도크에서 보던 모습 그대로 확대된다
const DOCK_LOOK = new THREE.Vector3(0.72, 0.5, 0.48).normalize().multiplyScalar(38)
// 나눴을 때는 선수 쪽 정면에 가깝게 — 좌현·우현이 화면 좌우로, 거주구·조타실이 위로 벌어져 보인다
const EXPLODE_LOOK = new THREE.Vector3(0.82, 0.42, 0.38).normalize()

// 방수 구역·트레이 위치는 B-04 외판을 따라 잡는다
const H4 = HULLS['B-04']
// 러그는 거주구(x -6.5~3.5) 앞 갑판, 늑골 5.5 와 7 사이
const LUG_X = 6.25, DECK_Y = HULLS['B-01'].sec(LUG_X).h
const COAT_Z = sideZ(H4, -2, 5.5) + 0.25, TRAY_Y = 6, TRAY_Z = Math.min(...[-5, -2, 1].map((x) => sideZ(H4, x, TRAY_Y))) - 1

// at = 블록 좌표(뒤집기 전), view = 그 자리를 볼 카메라 위치(화면 좌표 기준 차이)
const PLANS: Record<string, Plan> = {
  'B-01': {
    name: '선미 블록', flip: false, note: '도크 탑재 상태 · 선미 선형과 거주구·프로펠러·타',
    spots: [
      { key: 'lug', title: '러그 부착 위치', desc: '거주구 앞 갑판, 늑골(프레임) 사이에 러그가 잡혀 있어요. 아래 보강 없이 인양 하중을 받기 어려운 자리예요.', at: [LUG_X, DECK_Y + 0.7, 5.35], view: [7, 7, 7], keys: ['러그', '럭', '부착 위치', '부착위치'], inside: false },
      { key: 'reinforce', title: '러그 아래 보강재', desc: '러그 바로 아래, 갑판 밑 프레임 사이에 보강재(스티프너·브래킷)가 들어가야 하는 자리예요.', at: [LUG_X, DECK_Y - 0.5, 5.35], view: [8, -2, 8], keys: ['보강', '브래킷', '스티프너', '재작업', '누락'], inside: true },
    ],
  },
  'B-04': {
    name: '중앙 블록', flip: true, note: '실제처럼 뒤집어 놓은 상태 · 외판이 위',
    spots: [
      { key: 'coat', title: '측면 외판 방수 2차 구역', desc: '측면 외판 바깥쪽 2차 방수 도포 구역이에요. 같은 구역 안쪽에서 다른 작업이 겹치면 도포를 못 해요.', at: [-2, 5.5, COAT_Z], view: [6, 3, -15], keys: ['방수', '도포', '도막', '외판'], inside: false },
      { key: 'tray', title: '케이블 트레이 브래킷', desc: '측면 외판 안쪽에 전기팀 케이블 트레이 브래킷 용접이 잡힌 자리예요. 바깥 방수 구역과 정확히 겹쳐요.', at: [-2, TRAY_Y + 0.3, TRAY_Z + 0.3], view: [7, 1.5, 9], keys: ['전기', '케이블', '트레이'], inside: true },
    ],
  },
  'B-03': { name: '기관부 블록', flip: false, note: '공정 완료 · 주기관 받침대와 기관실', spots: [] },
  'B-02': {
    name: '선수 블록', flip: false, note: '운송 중 · 트랜스포터에 실려 도크 진입로 앞',
    spots: [
      { key: 'route', title: '트랜스포터 적재 위치', desc: '블록 바닥을 받치고 있는 트랜스포터 자리예요. 도크 진입로에서 회전 반경이 안 나와 이 상태로 서 있어요.', at: [-2.5, -0.6, 2], view: [6, 2, 13], keys: ['운송', '트랜스포터', '진입로', '탑재'], inside: false },
    ],
  },
}

export function BlockInspect({ block, requests, onClose, onRequests }: { block: string; requests: InspectRequest[]; onClose: () => void; onRequests?: () => void }) {
  const plan = PLANS[block] ?? { name: block, flip: false, note: '', spots: [] }
  // 확인 요청을 위치에 붙인다 — 말한 내용에 맞는 위치, 어디에도 안 맞으면 첫 위치
  const reqOf: Record<string, InspectRequest> = {}
  for (const r of requests) {
    const all = `${r.title} ${r.detail} ${r.text}`
    const hit = plan.spots.filter((s) => s.keys.some((k) => all.includes(k)))
    for (const s of hit.length ? hit : plan.spots.slice(0, 1)) reqOf[s.key] ??= r
  }
  const active = plan.spots.filter((s) => reqOf[s.key])
  const [focus, setFocus] = useState<string | null>(() => (active[0] ?? null)?.key ?? null)
  const [tags, setTags] = useState(true)
  // 사진처럼 부재 이름표(B·S·L·C·부재명) — 블록 구조를 그리면서 위치가 정해진다
  const [tagList, setTagList] = useState<Tag[]>([])
  const [xray, setXray] = useState(() => !!active[0]?.inside)
  const [explode, setExplode] = useState(false)
  const [part, setPart] = useState<Chunk | null>(null)
  const [partList, setPartList] = useState<Chunk[]>([])
  const partEls = useRef<Partial<Record<Chunk, HTMLButtonElement | null>>>({})
  const split = SPLIT[block]
  const host = useRef<HTMLDivElement>(null)
  const focusKey = useRef(focus)
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({})
  const tagEls = useRef<(HTMLSpanElement | null)[]>([])
  const api = useRef<{ fly: (key: string | null) => void; xray: (on: boolean) => void; explode: (on: boolean) => void; part: (p: Chunk | null) => void; active: Set<string> }>({ fly: () => {}, xray: () => {}, explode: () => {}, part: () => {}, active: new Set() })
  const activeKeys = active.map((s) => s.key).join(',')

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) } catch { return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#e9eef3')
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    el.prepend(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3
    controls.maxDistance = 110
    touchControls(controls)
    if (import.meta.env.DEV) (window as any).__inspect = { camera, controls, scene } // eslint-disable-line @typescript-eslint/no-explicit-any
    const view = makeView(renderer, scene, camera, 0.9)
    const fps = fpsMeter(el)
    // 금속(프로펠러 청동·가공 강재)이 비칠 주변 환경 — 그림 파일 없이 three 의 방 환경을 굽는다
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.55
    scene.add(new THREE.HemisphereLight('#f2f7ff', '#55606b', 1.3))
    const sun = new THREE.DirectionalLight('#fff4e6', 2.6)
    sun.position.set(30, 40, 18)
    scene.add(sun)
    const back = new THREE.DirectionalLight('#bcd8ff', 1.1)
    back.position.set(-25, 10, -30)
    scene.add(back)

    // 바닥(작업장) — 격자선
    const floorY = plan.flip ? 0 : -0.6
    const grid = new THREE.GridHelper(80, 40, '#b8c4ce', '#d3dbe2')
    grid.position.y = floorY
    scene.add(grid)

    const g = new THREE.Group()
    scene.add(g)
    // 부재별 재질 — 투시 모드에서 함께 흐려진다. 나눈 블록 하나를 고르면 나머지만 흐려지도록 작은 블록마다 재질을 따로 둔다
    const steel: { m: THREE.MeshStandardMaterial; p: Chunk }[] = []
    const base = new Set<THREE.Material>()
    const edgeMat = new THREE.LineBasicMaterial({ color: '#3b4650', transparent: true, opacity: 0.55 })
    const parts = new Map<Chunk, { g: THREE.Group; edge: THREE.LineBasicMaterial; mats: Map<THREE.Material, THREE.MeshStandardMaterial> }>()
    const partOf = (p: Chunk) => {
      let e = parts.get(p)
      if (!e) {
        e = { g: new THREE.Group(), edge: edgeMat.clone(), mats: new Map() }
        if (p === 'port') e.g.scale.z = -1 // 좌현 = 우현 선체를 중심선에서 거울로
        g.add(e.g)
        parts.set(p, e)
      }
      return e
    }
    let curPart: Chunk = 'stbd', side: Chunk = 'stbd'
    const forPart = (m: THREE.Material) => {
      if (!base.has(m)) return m
      const e = partOf(curPart)
      let c = e.mats.get(m)
      if (!c) {
        const b = m as THREE.MeshStandardMaterial
        c = b.clone()
        c.onBeforeCompile = b.onBeforeCompile
        c.customProgramCacheKey = b.customProgramCacheKey
        e.mats.set(m, c)
        steel.push({ m: c, p: curPart })
      }
      return c
    }
    // 부재 마감별 재질 — 블록 공정 단계에 따라 프라이머(적갈색) / 선저만 도장(B-01 선미) / 전체 도장(B-03 완료)
    const finishLook = LOOK[block] ?? 'primer'
    const mat = (color: string, finish: Finish = 'structure') => {
      const f = finishOf(finish, finishLook, color, hullWL[block] ?? 3)
      const m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.rough, metalness: f.metal, transparent: true, side: THREE.DoubleSide })
      // 늑골 끝이 외판과 맞닿는 자리에서 늑골 색이 바깥으로 비치지 않게 외판을 살짝 앞으로
      if (finish === 'hull') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4 }
      const sp = surfacePatch(f.surface)
      m.onBeforeCompile = sp.patch
      m.customProgramCacheKey = () => sp.key
      base.add(m)
      return m
    }
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, edges: THREE.Material = edgeMat) => {
      const mesh = new THREE.Mesh(geo, forPart(m))
      ;(parent ?? partOf(curPart).g).add(mesh)
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edges === edgeMat ? partOf(curPart).edge : edges)
      mesh.add(e)
      return mesh
    }
    // x0~x1 / y0~y1 / z0~z1 상자
    const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, parent?: THREE.Object3D, edges?: THREE.Material) => {
      const mesh = add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, parent, edges)
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      return mesh
    }
    // 단면(z,y) 모양을 늑골 두께만큼 x 방향으로 뽑는다
    const section = (shape: THREE.Shape, x: number, t: number, m: THREE.Material) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 18 })
      const mesh = add(geo, m)
      mesh.rotation.y = -Math.PI / 2 // 모양 x → z, 뽑는 방향 → -x
      mesh.position.x = x + t / 2
      return mesh
    }

    const kit: Kit = { g, add, slab, section, mat, part: (p) => { curPart = chunkOf(!!split, p, side) }, here: () => partOf(curPart).g }
    const { hull, tags: tagsBuilt } = buildStructure(block, kit)
    const tagChunk = tagsBuilt.map((t) => chunkOf(!!split, t.p, 'stbd'))
    // 나누는 블록은 실제 블록처럼 양현을 다 그린다 — 반대쪽(좌현)은 선체만 거울로 한 번 더
    if (split) { side = 'port'; curPart = 'port'; buildStructure(block, kit, { extras: false }) }
    setTagList(tagsBuilt)

    // ---- 문제·작업 위치 ----
    const RED = new THREE.Color('#ff3b30'), BLUE = new THREE.Color('#2f8cff')
    const marks: { key: string; mats: THREE.MeshStandardMaterial[]; lines: THREE.LineDashedMaterial[]; ball: THREE.Mesh; at: THREE.Vector3; home: THREE.Object3D; grp: THREE.Group; p: Chunk }[] = []
    const actSet = new Set(activeKeys ? activeKeys.split(',') : [])
    const lug = (parent: THREE.Object3D, x: number, z: number, m: THREE.Material, e?: THREE.Material) => {
      const s = new THREE.Shape()
      s.moveTo(-0.7, 0); s.lineTo(0.7, 0); s.lineTo(0.55, 0.75); s.absarc(0, 0.75, 0.55, 0, Math.PI, false); s.closePath()
      const hole = new THREE.Path(); hole.absarc(0, 0.8, 0.22, 0, Math.PI * 2, false); s.holes.push(hole)
      const mesh = add(new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 16 }), m, parent, e)
      mesh.position.set(x, DECK_Y + 0.08, z - 0.07) // 갑판 위로 세운다
      slab(x - 0.85, x + 0.85, DECK_Y, DECK_Y + 0.08, z - 0.5, z + 0.5, m, parent, e) // 받침 패드
    }
    for (const sp of plan.spots) {
      const on = actSet.has(sp.key)
      const c = on ? RED : BLUE
      const pm = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.5, side: THREE.DoubleSide })
      const dash = new THREE.LineDashedMaterial({ color: c, dashSize: 0.18, gapSize: 0.12, transparent: true })
      // 문제 위치는 붙어 있는 묶음과 함께 움직인다 (방수 구역 = 외판, 트레이 = 늑골·현측 구조)
      const homeP: Chunk = split ? SPOT_CHUNK[sp.key] ?? 'stbd' : 'stbd', home = partOf(homeP).g
      const grp = new THREE.Group()
      home.add(grp)
      if (sp.key === 'lug') {
        lug(grp, LUG_X, 5.35, pm, dash)
        // 다른 러그 예정 위치(파랑) — 늑골·종통재가 만나는 자리
        const okM = new THREE.MeshStandardMaterial({ color: '#7fb2e8', transparent: true, opacity: 0.55, roughness: 0.6 })
        for (const [x, z] of [[4.75, 1.6], [7.75, 1.6], [7.75, 6.6]] as const) lug(home, x, z, okM)
      } else if (sp.key === 'reinforce') {
        slab(LUG_X - 0.05, LUG_X + 0.05, DECK_Y - 0.95, DECK_Y, 4.2, 6.5, pm, grp, dash) // 프레임 사이 갑판 밑 보강재(웨브)
        slab(LUG_X - 0.3, LUG_X + 0.3, DECK_Y - 1.01, DECK_Y - 0.95, 4.2, 6.5, pm, grp, dash) // 면재
        for (const sz of [4.25, 6.45]) slab(LUG_X - 0.05, LUG_X + 0.05, DECK_Y - 0.95, DECK_Y, sz - 0.05, sz + 0.05, pm, grp, dash)
      } else if (sp.key === 'route') {
        // 블록 바닥 아래 트랜스포터 적재 데크와 바퀴 줄
        slab(-8, 3, -1.1, -0.15, 0, 3.4, pm, grp, dash)
        for (let x = -7.2; x <= 2.4; x += 1.6) slab(x - 0.35, x + 0.35, -1.6, -1.1, 2.4, 3.2, pm, grp, dash)
      } else if (sp.key === 'coat') {
        // 휘어진 외판 바깥에 딱 붙는 도포 구역
        pm.opacity = 0.45
        loft(kit, Array.from({ length: 17 }, (_, i) => -6 + i * 0.5), (x) => Array.from({ length: 9 }, (_, i) => { const y = 3.6 + i * 0.5; return [sideZ(hull, x, y) + 0.07, y] as [number, number] }), pm, grp, dash)
      } else if (sp.key === 'tray') {
        slab(-5, 1, TRAY_Y - 0.1, TRAY_Y - 0.02, TRAY_Z - 0.4, TRAY_Z + 0.4, pm, grp, dash)
        for (const z of [TRAY_Z - 0.4, TRAY_Z + 0.4]) slab(-5, 1, TRAY_Y - 0.02, TRAY_Y + 0.15, z - 0.03, z + 0.03, pm, grp, dash)
        for (const x of [-4, -2, 0]) slab(x - 0.05, x + 0.05, TRAY_Y - 0.02, TRAY_Y + 0.6, TRAY_Z + 0.3, sideZ(hull, x, TRAY_Y + 0.3) - 0.05, pm, grp, dash)
      }
      grp.traverse((o) => { if (o instanceof THREE.LineSegments) o.computeLineDistances() })
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, depthWrite: false }))
      ball.position.set(...sp.at)
      ball.visible = on
      home.add(ball)
      marks.push({ key: sp.key, mats: [pm], lines: [dash], ball, at: new THREE.Vector3(...sp.at), home, grp, p: homeP })
    }

    // 뒤집힌 블록(B-04)은 받침 위에 외판이 위로
    // 블록은 중심선에서 한쪽 현측까지 절반만 그린다. 도크 쪽(우현 위)에서 보면 잘린 중심선 면으로 속이 보이도록
    // 뒤집은 B-04 는 회전으로, 나머지는 z 를 거울처럼 뒤집어 절반을 반대쪽에 둔다
    if (!plan.flip) g.scale.z = -1
    if (plan.flip) {
      g.rotation.x = Math.PI
      g.position.y = hull.sec(0).h + 1.6
      const standM = new THREE.MeshStandardMaterial({ color: '#6b7f8d', roughness: 0.8 })
      for (const x of [-6, 0, 6]) for (const z of [-1.5, -8]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), standM); s.position.set(x, 0.75, z); scene.add(s) }
    }
    g.updateMatrixWorld(true)
    const center = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
    // 묶음마다 이름표 자리(묶음 한가운데)와 크기 — 아직 떨어뜨리기 전, 뒤집기·거울 반영 뒤
    const partAt = new Map<Chunk, { at: THREE.Vector3; r: number; off: THREE.Vector3 }>()
    const exBox = new THREE.Box3() // 다 떨어뜨렸을 때 전체가 차지하는 자리
    const o0 = g.localToWorld(new THREE.Vector3())
    for (const [p, e] of parts) {
      const box = new THREE.Box3().setFromObject(e.g)
      if (box.isEmpty()) continue
      const info = split?.[p]
      if (!info) continue
      const off = new THREE.Vector3(...info.off)
      partAt.set(p, { at: g.worldToLocal(box.getCenter(new THREE.Vector3())), r: box.getSize(new THREE.Vector3()).length() / 2, off })
      exBox.union(box.clone().translate(g.localToWorld(off.clone()).sub(o0)))
    }
    setPartList([...partAt.keys()])
    if (!plan.flip) center.y = split ? hull.sec(0).h * 0.85 : hull.sec(0).h * 0.5 // 거주구가 있으면 조금 위를 본다
    const look = DOCK_LOOK.clone().multiplyScalar(split ? 1.3 : 1)
    const overview = { pos: center.clone().add(look), target: center.clone() }
    // 처음엔 멀리서 시작해 줌인
    camera.position.copy(center).add(look.clone().multiplyScalar(2.5))
    controls.target.copy(center)
    controls.update()

    let fly: { t0: number; dur: number; fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3 } | null = null
    const clock = new THREE.Clock()
    const flyTo = (tp: THREE.Vector3, tt: THREE.Vector3, dur = 1.6) => { fly = { t0: clock.getElapsedTime(), dur, fp: camera.position.clone(), ft: controls.target.clone(), tp, tt } }
    let ex = false, exK = 0, sel: Chunk | null = null
    // 분해했을 때는 떨어진 묶음까지 다 들어오도록 조금 더 멀리서
    const overviewNow = () => ex ? { pos: exC.clone().add(EXPLODE_LOOK.clone().multiplyScalar(exR * 2.9)), target: exC.clone() } : overview
    const exC = exBox.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, -3, 0)), exR = exBox.getSize(new THREE.Vector3()).length() / 2
    const partWorld = (p: Chunk, k = exK) => { const a = partAt.get(p)!; return g.localToWorld(a.at.clone().addScaledVector(a.off, k)) }
    const goPart = (p: Chunk) => {
      const a = partAt.get(p)
      if (!a) return
      const at = partWorld(p, 1)
      // 우현 선체는 바깥 면(도장·방수 구역)이 보이도록 우현 밖(화면 안쪽)에서 본다
      const dir = EXPLODE_LOOK.clone()
      if (p === 'stbd') dir.z = -dir.z
      flyTo(at.clone().add(dir.multiplyScalar(Math.max(16, a.r * 2.2))), at)
    }
    const goSpot = (key: string | null, dur?: number) => {
      const sp = plan.spots.find((s) => s.key === key)
      if (!sp) { const o = overviewNow(); flyTo(o.pos.clone(), o.target.clone(), dur); return }
      const mk = marks.find((m) => m.key === sp.key)
      const at = (mk?.home ?? g).localToWorld(new THREE.Vector3(...sp.at))
      flyTo(at.clone().add(new THREE.Vector3(...sp.view)), at, dur)
    }
    let xr = false
    api.current = {
      fly: (k) => goSpot(k),
      xray: (on) => { xr = on; view.ao(!on) },
      explode: (on) => { if (ex === on) return; ex = on; if (!on) sel = null; const o = overviewNow(); flyTo(o.pos.clone(), o.target.clone(), 1.4) },
      part: (p) => { sel = p; dirty = true; if (p) goPart(p); else if (ex) { const o = overviewNow(); flyTo(o.pos.clone(), o.target.clone(), 1.2) } },
      active: actSet,
    }
    // 멀리서 → 블록 전체 → 문제 위치로 두 번에 걸쳐 확 다가간다
    flyTo(overview.pos.clone(), overview.target.clone(), 1.1)
    let first = true
    // 연출 중 화면을 누르면 건너뛴다 (SMASH 의 운석·핵폭탄 연출처럼)
    let quick = false
    const skip = () => { if (fly) { fly.t0 = -100; quick = true } }
    renderer.domElement.addEventListener('pointerdown', skip)
    // 멈춰 있으면 1초에 한 번만 다시 그린다 — 카메라·투시·깜박임이 움직일 때만 매 프레임
    let dirty = true, lastDraw = -10
    controls.addEventListener('change', () => { dirty = true })

    // 등장 애니메이션(scale) 중에도 실제 크기를 재도록 getBoundingClientRect 대신 clientWidth 를 쓴다
    const resize = () => {
      const width = el.clientWidth, height = el.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height)
      view.setSize(width, height)
      dirty = true
      camera.aspect = width / height
      // 오른쪽 설명 카드에 가리지 않게 시선 중심을 화면 왼쪽(약 37%)으로 옮긴다
      if (width > 560) camera.setViewOffset(width, height, width * 0.13, 0, width, height)
      else camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const tmp = new THREE.Vector3()
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const t = clock.getElapsedTime()
      if (fly) {
        const k = Math.min((t - fly.t0) / fly.dur, 1)
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
        camera.position.lerpVectors(fly.fp, fly.tp, e)
        controls.target.lerpVectors(fly.ft, fly.tt, e)
        if (k >= 1) { fly = null; if (first) { first = false; if (split) autoSplit.current(); else { const f = focusKey.current; if (f) goSpot(f, quick ? 0.01 : 1.5) } } else quick = false }
        dirty = true
      }
      if (controls.update()) dirty = true
      // 분해: 묶음들이 제자리에서 정해진 방향으로 천천히 떨어진다
      const exWant = ex ? 1 : 0
      if (exK !== exWant) {
        exK = THREE.MathUtils.lerp(exK, exWant, 0.07)
        if (Math.abs(exK - exWant) <= 0.002) exK = exWant
        const e = exK * exK * (3 - 2 * exK)
        for (const [p, a] of partAt) parts.get(p)!.g.position.copy(a.off).multiplyScalar(e)
        dirty = true
      }
      // 투시: 구조재를 흐리게 해서 안쪽 문제 위치가 보이게. 분해 중 묶음을 고르면 나머지 묶음을 흐리게
      for (const { m, p } of steel) {
        const want = sel && p !== sel ? 0.06 : xr ? 0.16 : 1
        if (Math.abs(m.opacity - want) > 0.005) { m.opacity = THREE.MathUtils.lerp(m.opacity, want, 0.12); dirty = true }
        m.depthWrite = m.opacity > 0.9
      }
      for (const [p, e] of parts) e.edge.opacity = THREE.MathUtils.lerp(e.edge.opacity, sel && p !== sel ? 0.05 : xr ? 0.22 : 0.55, 0.12)
      if (!dirty && !actSet.size && t - lastDraw < 1) return
      dirty = false
      lastDraw = t
      const pulse = 0.5 + 0.5 * Math.sin(t * 4)
      const r = { width: el.clientWidth, height: el.clientHeight }
      for (const mk of marks) {
        const on = actSet.has(mk.key)
        const shown = !sel || sel === mk.p // 다른 묶음을 고르면 그 묶음에 붙은 위치 표시는 숨긴다
        mk.grp.visible = shown
        mk.ball.visible = on && shown
        for (const m of mk.mats) m.emissiveIntensity = on ? 0.35 + pulse * 0.6 : 0.25
        mk.ball.scale.setScalar(1 + pulse * 0.9)
        ;(mk.ball.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - pulse * 0.7)
        const pin = pinEls.current[mk.key]
        if (pin) {
          tmp.copy(mk.home.localToWorld(mk.at.clone())).project(camera)
          pin.style.display = tmp.z < 1 && shown ? '' : 'none'
          pin.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`
        }
      }
      tagsBuilt.forEach((tg, i) => {
        const n = tagEls.current[i]
        if (!n) return
        tmp.copy(partOf(tagChunk[i]).g.localToWorld(new THREE.Vector3(...tg.at))).project(camera)
        n.style.display = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && (sel ? sel === tagChunk[i] : !ex) ? '' : 'none'
        n.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`
      })
      // 나눈 블록 이름표 — 각 블록 한가운데
      for (const p of partAt.keys()) {
        const n = partEls.current[p]
        if (!n) continue
        tmp.copy(partWorld(p)).project(camera)
        n.style.display = tmp.z < 1 ? '' : 'none'
        n.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`
      }
      view.render()
      fps?.tick()
    }
    draw()
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', skip)
      view.dispose()
      envTex.dispose()
      pmrem.dispose()
      fps?.dispose()
      controls.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [block, activeKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { focusKey.current = focus }, [focus])
  // 단축키 — 0 블록 전체, 1~ 위치, T 부재 이름, X 투시, E 블록 나누기, Esc 도크로
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
    const n = Number(e.key)
    if (e.key === '0') go(null)
    else if (n >= 1 && n <= plan.spots.length) go(plan.spots[n - 1].key)
    else if (e.key === 't' || e.key === 'T') setTags((v) => !v)
    else if (e.key === 'x' || e.key === 'X') setXray((v) => !v)
    else if ((e.key === 'e' || e.key === 'E') && split) toggleExplode()
    else if (e.key === 'Escape') onClose()
  }
  useEffect(() => { const h = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])
  useEffect(() => { api.current.xray(xray) }, [xray, block, activeKeys])
  // 블록을 다시 그리면 분해도 처음(붙은 상태)부터
  useEffect(() => { setExplode(false); setPart(null) }, [block, activeKeys])
  // 나누는 블록은 줌인이 끝나면 바로 나눠 보여 준다
  const autoSplit = useRef(() => {})
  autoSplit.current = () => { if (!explode) toggleExplode() }
  const toggleExplode = () => {
    const on = !explode
    setExplode(on)
    setPart(null)
    if (on) { setXray(false); setFocus(null) }
    api.current.part(null)
    api.current.explode(on)
  }
  const pickPart = (p: Chunk) => {
    const next = part === p ? null : p
    setPart(next)
    setFocus(null)
    api.current.part(next)
  }
  const go = (key: string | null) => {
    setFocus(key)
    if (part) { setPart(null); api.current.part(null) }
    const sp = plan.spots.find((s) => s.key === key)
    setXray(!!sp?.inside)
    api.current.fly(key)
  }
  const cur = plan.spots.find((s) => s.key === focus)
  const curReq = cur ? reqOf[cur.key] : undefined

  return (
    <div className="bi" ref={host} role="dialog" aria-label={`${block} 내부 확대`}>
      {plan.spots.map((s) => (
        <button key={s.key} ref={(n) => { pinEls.current[s.key] = n }} className={`bi-pin ${reqOf[s.key] ? 'is-alert' : ''} ${focus === s.key ? 'is-on' : ''}`} onClick={() => go(s.key)} aria-label={s.title}>
          {reqOf[s.key] ? '!' : ''}
        </button>
      ))}
      {explode && partList.map((p) => {
        const info = split![p]!
        return <button key={p} ref={(n) => { partEls.current[p] = n }} className={`bi-part ${part === p ? 'is-on' : ''} ${part && part !== p ? 'is-dim' : ''}`} style={{ '--pc': info.color } as CSSProperties} onClick={() => pickPart(p)}><i />{info.name}</button>
      })}
      {tags && tagList.map((tg, i) => <span key={i} ref={(n) => { tagEls.current[i] = n }} className={`bi-tag k-${tg.k}`}>{tg.t}</span>)}
      <header className="bi-head">
        <button className="bi-back" onClick={onClose}><Icon name="back" />도크 전체<kbd>Esc</kbd></button>
        <div><b>{block} · {plan.name} 내부</b><span>{plan.note}</span></div>
      </header>
      <div className="bi-tools">
        <button aria-pressed={tags} onClick={() => setTags((v) => !v)} title="부재 이름표 켜기·끄기 (T)"><Icon name="tags" />부재 이름<kbd>T</kbd></button>
        <button aria-pressed={xray} onClick={() => setXray((v) => !v)} title="구조를 흐리게 해서 안쪽 보기 (X)"><Icon name="xray" />투시<kbd>X</kbd></button>
      </div>
      {part && split?.[part] ? (
        <div className="bi-card is-part" style={{ '--pc': split[part]!.color } as CSSProperties}>
          <p className="bi-card-kind"><Icon name="explode" />{block} 안의 블록</p>
          <h3><i className="bi-part-dot" />{split[part]!.name}</h3>
          <p className="bi-card-text">{split[part]!.desc}</p>
          <button className="bi-card-link" onClick={() => pickPart(part)}>나눈 블록 전체 보기 ›</button>
        </div>
      ) : explode && !cur ? (
        null
      ) : cur ? (
        <div className={`bi-card ${curReq ? 'is-alert' : ''}`}>
          <p className="bi-card-kind"><Icon name={curReq ? 'alert' : 'plan'} />{curReq ? '현장 확인 요청 위치' : '작업 예정 위치'}</p>
          <h3><Icon name={cur.key} />{cur.title}</h3>
          {curReq && <p className="bi-card-req">“{curReq.title}”</p>}
          <p className="bi-card-text">{cur.desc}</p>
          {curReq && onRequests && <button className="bi-card-link" onClick={onRequests}>확인 요청 보기 ›</button>}
        </div>
      ) : (
        <div className="bi-card"><p className="bi-card-kind"><Icon name="block" />블록 전체</p><h3>{active.length ? `확인할 위치 ${active.length}곳` : plan.spots.length ? '지금 확인 요청 없음' : '표시할 문제 없음'}</h3><p>{active.length ? '아래에서 위치를 고르면 그 자리로 확대해요.' : '현장 녹음에서 이 블록 문제가 올라오면 위치가 빨갛게 표시돼요.'}</p></div>
      )}
      <nav className="bi-spots" aria-label="위치">
        <button aria-pressed={!focus} onClick={() => go(null)}><Icon name="block" /><span className="tn">블록 전체</span><span className="td">처음 시점</span><kbd>0</kbd></button>
        {plan.spots.map((s, i) => <button key={s.key} aria-pressed={focus === s.key} className={reqOf[s.key] ? 'is-alert' : ''} onClick={() => go(s.key)}>{reqOf[s.key] && <i />}<Icon name={s.key} /><span className="tn">{s.title}</span><span className="td">{reqOf[s.key] ? '확인 요청' : '작업 예정'}{s.inside ? ' · 안쪽' : ' · 바깥'}</span><kbd>{i + 1}</kbd></button>)}
      </nav>
    </div>
  )
}
