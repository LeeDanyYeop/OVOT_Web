import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { blocks, type Stage } from './twinBlocks'
import { fpsMeter, makeView, touchControls } from './twinFx'
import './twinScene.css'

const GROUND = 6 // 야드(안벽) 지면 높이. 도크 바닥(-3.5)은 이보다 아래로 파여 있다
// 시점 초기화 = 크레인 거더 너머로 도크의 배를 정면에서 보는 시점. 줌아웃은 예전 기본 시점 거리(약 298)까지만
const HOME = { pos: new THREE.Vector3(212, 108, 34), target: new THREE.Vector3(-8, 26, 12) }
// 아래 도크 탭: 전체 · 도크1(배가 있는 드라이 도크) · 도크2(옆 지상 건조장)
const DOCKS = [
  { name: '전체', pos: new THREE.Vector3(215, 160, 100), target: new THREE.Vector3(-5, 10, -25) },
  { name: '도크1', pos: HOME.pos, target: HOME.target },
  { name: '도크2', pos: new THREE.Vector3(195, 135, -15), target: new THREE.Vector3(-5, 14, -85) },
]
const DOCK_ICON: Record<string, string> = {
  전체: 'M3 3h7.5v7.5H3z M13.5 3H21v7.5h-7.5z M3 13.5h7.5V21H3z M13.5 13.5H21V21h-7.5z',
  도크1: 'M2 7h3.5v9.5h13V7H22 M8 12.5h8 M9.5 12.5l1-3h3l1 3',
  도크2: 'M2 16.5h20 M5 16.5v-3h14v3 M8 13.5l1-3.5h6l1 3.5 M12 10V5.5',
}
const MAX_DIST = Math.hypot(145, 175, 193)
const SHIP_SCALE = 1.4 // 배 크기 배율(도크·B-01 위치도 이에 맞춤)
const B01_Z = 47 // 뒤집어 놓은 B-01 이 놓인 지상 위치(z)
// 크레인 거더 로고 — 초록 엠블럼 다음에 HYUNDAI (cx: 로고 묶음 가운데, cy: 세로 가운데, h: 엠블럼 높이)
function drawHyundaiLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  ctx.font = `800 ${Math.round(h * 0.9)}px -apple-system, "Segoe UI", sans-serif`
  const textW = ctx.measureText('HYUNDAI').width
  const k = h / 335, ew = 283 * k, gap = h * 0.28
  const x0 = cx - (ew + gap + textW) / 2, y0 = cy - h / 2
  const P = (x: number, y: number): [number, number] => [x0 + (x - 65) * k, y0 + (y - 45) * k]
  const poly = (pts: [number, number][], color: string) => { ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill() }
  poly([P(65, 45), P(255, 45), P(348, 212)], '#06e000')
  poly([P(65, 45), P(348, 212), P(255, 380), P(160, 212)], '#00b31a')
  poly([P(160, 212), P(255, 380), P(65, 380)], '#007a2e')
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('HYUNDAI', x0 + ew + gap, cy + h * 0.04)
}
export const stageColor: Record<Stage, string> = { done: '#1d1d1f', working: '#0071e3', ground: '#0071e3', transit: '#8e8e93' }
const PRIMER = '#9ea9b0' // 도장 전 강재

type Block = {
  id: string
  stage: Stage
  root: THREE.Object3D // 현재 위치(이동·반전된 블록은 pivot)
  mats: THREE.MeshStandardMaterial[]
  pick: THREE.Mesh[]
  anchor: () => THREE.Vector3
  middle: () => THREE.Vector3
}

// bare: 로그인 화면용 — 이름표·버튼 없이 배경으로만. focus: 카메라가 날아가 줌인할 작업장('dock' 또는 블록 id)
export function TwinScene({ selected, onSelect, progressOf, alerts = [], onAlert, bare = false, focus = null, dockFocus }: { selected: string | null; onSelect: (id: string) => void; labelOf?: (id: string) => string | undefined; progressOf?: (id: string) => number | undefined; alerts?: string[]; onAlert?: (id: string) => void; bare?: boolean; focus?: string | null; dockFocus?: { name: string; n: number } }) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<Record<string, HTMLButtonElement | null>>({})
  const pins = useRef<Record<string, HTMLButtonElement | null>>({})
  const sel = useRef(selected)
  const focusRef = useRef<{ id: string | null; n: number }>({ id: focus, n: 0 })
  const cb = useRef(onSelect)
  const reset = useRef<() => void>(() => {})
  const flyTo = useRef<(pos: THREE.Vector3, target: THREE.Vector3) => void>(() => {})
  const [dock, setDock] = useState('도크1')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { sel.current = selected }, [selected])
  useEffect(() => { focusRef.current = { id: focus, n: focusRef.current.n + 1 } }, [focus])
  useEffect(() => { cb.current = onSelect }, [onSelect])
  // 조선소 화면에서 도크를 고르면 그 도크로 카메라 이동
  useEffect(() => {
    if (!dockFocus || !ready) return
    const d = DOCKS.find((x) => x.name === dockFocus.name)
    if (d) { setDock(d.name); flyTo.current(d.pos.clone(), d.target.clone()) }
  }, [dockFocus?.n, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) }
    catch { setError('이 브라우저에서 3D 화면을 시작하지 못했습니다.'); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#e6edf3')
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.localClippingEnabled = true
    // 그림자는 매 프레임이 아니라 움직이는 것(크레인·운송 블록)에 맞춰 0.15초마다만 다시 계산
    renderer.shadowMap.autoUpdate = false
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog('#e6edf3', 420, 1000)
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 3000)
    camera.position.copy(HOME.pos)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(HOME.target)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 50
    controls.maxDistance = MAX_DIST
    // 위·아래 제한 없이 사방에서 볼 수 있게
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI * 0.47 // 바닥 아래로는 내려가지 않게(지평선 바로 위까지)
    touchControls(controls)
    // 구석 음영(PC 기본, ?ao=0 끄기) · ?fps 프레임 수
    const view = makeView(renderer, scene, camera, 5)
    const fps = fpsMeter(el)
    if (bare) { camera.position.set(300, 170, 150); controls.target.set(0, 18, 0); controls.autoRotateSpeed = 0.35 }
    controls.update()
    reset.current = () => { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update() }

    scene.add(new THREE.HemisphereLight('#e4f1ff', '#3a4a5c', 2.6))
    const sun = new THREE.DirectionalLight('#fff6ea', 3.4)
    sun.position.set(-90, 170, 110)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 160, bottom: -160, near: 1, far: 600 })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.15
    scene.add(sun)
    const fill = new THREE.DirectionalLight('#9fd6e6', 1.4)
    fill.position.set(80, 30, -140)
    scene.add(fill)

    // 바닥·도크 — 카메라가 바닥 아래로 내려가면 흐리게 해서 배 밑면이 보이게 한다
    const groundMats: THREE.MeshStandardMaterial[] = []
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, parent: THREE.Object3D = scene) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true })
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, y, z)
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return { m, mat }
    }
    // 두 점을 잇는 각재(크레인 다리·가새 등)
    const beam = (p1: THREE.Vector3, p2: THREE.Vector3, t: number, color: string, parent: THREE.Object3D) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, p1.distanceTo(p2), t), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 }))
      m.position.copy(p1).add(p2).multiplyScalar(0.5)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize())
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return m
    }
    const wheelGeo = (r: number, w: number) => new THREE.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2)
    // 조선소 배경 — 콘크리트 야드 안에 파인 드라이 도크, 도크 게이트 바깥은 바다. 주변에 공장·블록 적치장·안벽 크레인
    const PX = 128, PZ = 22, BOTTOM = -7, SEA_X = 320, quay = '#aab2b9'
    const qh = GROUND - BOTTOM, qy = (GROUND + BOTTOM) / 2
    // 안벽(땅) 덩어리: 도크 자리를 비우고, 동쪽 SEA_X 바깥은 바다
    const slab = (x0: number, x1: number, z0: number, z1: number) => groundMats.push(box((x0 + x1) / 2, qy, (z0 + z1) / 2, x1 - x0, qh, z1 - z0, quay).mat)
    slab(-700, SEA_X, PZ, 700)
    slab(-700, SEA_X, -700, -PZ)
    slab(-700, -PX, -PZ, PZ)
    slab(PX + 4, SEA_X, -PZ, PZ)
    groundMats.push(box(PX + 2, qy - 0.5, 0, 4, qh - 1, PZ * 2, '#5d666e').mat) // 도크 게이트
    groundMats.push(box(0, -5, 0, PX * 2, 3, PZ * 2, '#5f6870').mat) // 도크 바닥
    for (let x = -104; x <= 110; x += 12) groundMats.push(box(x, -2, 0, 3, 3, 9, '#8a98a6').mat)
    // 바다
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 1600), new THREE.MeshStandardMaterial({ color: '#3d7aa0', roughness: 0.3, metalness: 0.2 }))
    sea.rotation.x = -Math.PI / 2
    sea.position.set(SEA_X + 450, GROUND - 4.5, 0)
    sea.receiveShadow = true
    scene.add(sea)
    // 콘크리트 야드 바닥 — 판 이음매와 얼룩이 있는 회색 콘크리트
    const conc = document.createElement('canvas')
    conc.width = conc.height = 128
    const cctx = conc.getContext('2d')!
    cctx.fillStyle = '#b3bac0'
    cctx.fillRect(0, 0, 128, 128)
    for (let n = 0; n < 900; n++) {
      const v = 160 + Math.floor(Math.random() * 40)
      cctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.35)`
      cctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2)
    }
    cctx.strokeStyle = '#9aa2a9'
    cctx.lineWidth = 2
    cctx.strokeRect(0, 0, 128, 128)
    const concTex = new THREE.CanvasTexture(conc)
    concTex.wrapS = concTex.wrapT = THREE.RepeatWrapping
    concTex.colorSpace = THREE.SRGBColorSpace
    const yard = (x0: number, x1: number, z0: number, z1: number) => {
      const t = concTex.clone()
      t.needsUpdate = true
      t.repeat.set((x1 - x0) / 16, (z1 - z0) / 16)
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true })
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat)
      m.rotation.x = -Math.PI / 2
      m.position.set((x0 + x1) / 2, GROUND + 0.02, (z0 + z1) / 2)
      m.receiveShadow = true
      scene.add(m)
      groundMats.push(mat)
    }
    yard(-400, SEA_X, PZ, 400)
    yard(-400, SEA_X, -400, -PZ)
    yard(-400, -PX, -PZ, PZ)
    yard(PX + 4, SEA_X, -PZ, PZ)
    // 도크 가장자리 노란 안전선 + 난간
    for (const z of [-PZ - 3, PZ + 3]) groundMats.push(box(0, GROUND + 0.08, z, PX * 2 + 6, 0.05, 0.7, '#e3b93c').mat)
    groundMats.push(box(-PX - 3, GROUND + 0.08, 0, 0.7, 0.05, PZ * 2 + 6, '#e3b93c').mat)
    for (const z of [-PZ - 0.8, PZ + 0.8]) {
      for (let x = -PX; x <= PX; x += 8) box(x, GROUND + 0.7, z, 0.25, 1.4, 0.25, '#f5f5f7')
      box(0, GROUND + 1.4, z, PX * 2, 0.2, 0.2, '#f5f5f7')
    }
    for (let z = -PZ; z <= PZ; z += 8) box(-PX - 0.8, GROUND + 0.7, z, 0.25, 1.4, 0.25, '#f5f5f7')
    box(-PX - 0.8, GROUND + 1.4, 0, 0.2, 0.2, PZ * 2, '#f5f5f7')
    // 안벽 끝 계선주(볼라드)
    for (let z = -360; z <= 360; z += 24) box(SEA_X - 2, GROUND + 0.8, z, 1.4, 1.6, 1.4, '#3a3f45')

    // 조립장 → 도크 야드 도로(아스팔트) + 가로등
    groundMats.push(box(170, GROUND + 0.06, 84, 260, 0.1, 20, '#6f767c').mat)
    for (let x = 48; x < 300; x += 14) groundMats.push(box(x, GROUND + 0.13, 84, 7, 0.05, 0.6, '#f5f5f7').mat)
    for (let x = 60; x < 300; x += 40) {
      box(x, GROUND + 7, 72, 0.5, 14, 0.5, '#8e969d')
      box(x, GROUND + 14, 73.5, 0.6, 0.5, 3.2, '#8e969d')
      box(x, GROUND + 13.6, 75, 1.4, 0.4, 1.2, '#f7f3dc')
    }

    // 줄무늬 철판 지붕(파랑·하양) — 조선소 공장 지붕 느낌
    const stripeCvs = document.createElement('canvas')
    stripeCvs.width = 64
    stripeCvs.height = 8
    const sctx = stripeCvs.getContext('2d')!
    for (let k = 0; k < 8; k++) { sctx.fillStyle = k % 2 ? '#7fa6cc' : '#3f6f9f'; sctx.fillRect(k * 8, 0, 8, 8) }
    const stripeTex = new THREE.CanvasTexture(stripeCvs)
    stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping
    stripeTex.colorSpace = THREE.SRGBColorSpace
    // 공장 건물(박공지붕). striped=true 면 파란 줄무늬 철판 지붕
    const hall = (x: number, z: number, w: number, d: number, h: number, wall: string, roof: string, striped = true) => {
      box(x, GROUND + h / 2, z, w, h, d, wall)
      box(x, GROUND + h * 0.18, z - d / 2 - 0.05, w * 0.98, h * 0.06, 0.2, '#c9cfd4')
      for (const sz of [-1, 1]) {
        let mat: THREE.MeshStandardMaterial
        if (striped) { const t = stripeTex.clone(); t.needsUpdate = true; t.repeat.set(w / 6, 1); mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 }) }
        else mat = new THREE.MeshStandardMaterial({ color: roof, roughness: 0.6 })
        const r = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 1.2, d * 0.56), mat)
        r.position.set(x, GROUND + h + d * 0.11, z + sz * d * 0.25)
        r.rotation.x = sz * 0.42 // 가운데가 높은 ∧ 박공지붕
        r.castShadow = r.receiveShadow = true
        scene.add(r)
      }
      box(x - w * 0.25, GROUND + h * 0.32, z - d / 2 - 0.1, w * 0.22, h * 0.64, 0.3, '#5c6670')
      box(x + w * 0.2, GROUND + h * 0.32, z - d / 2 - 0.1, w * 0.22, h * 0.64, 0.3, '#5c6670')
    }
    // 도크 뒤쪽 공장 단지 — 줄무늬 지붕 공장이 두 줄로
    for (const z of [-200, -275]) for (let x = -260; x <= 260; x += 105) hall(x, z, 92, 48, 15 + ((x / 105 + 3) % 3) * 2, '#e4e8eb', '#46709a')
    hall(-330, -60, 56, 110, 15, '#e4e8eb', '#46709a')
    hall(-330, 90, 56, 100, 14, '#e4e8eb', '#46709a')
    hall(230, -150, 56, 32, 12, '#dde2e6', '#8b3b2c', false)

    // 산 — 조선소 뒤 초록 언덕
    const hillMat = new THREE.MeshStandardMaterial({ color: '#5f7f57', roughness: 1, flatShading: true })
    for (const [hx, hz, sx, sy, sz] of [[-560, -420, 300, 90, 200], [-620, 120, 220, 70, 260], [-300, -560, 360, 110, 160]] as const) {
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hillMat)
      hill.scale.set(sx, sy, sz)
      hill.position.set(hx, GROUND - 12, hz)
      scene.add(hill)
    }

    // 블록 적치장 — 서쪽 야드에 완성 대기 블록
    const blockColors = ['#b4472f', '#8e98a0', '#a8643f', '#7f8a92', '#c2552f']
    let bi = 0
    for (let x = -255; x <= -165; x += 26) for (let z = -30; z <= 60; z += 30) {
      const c = blockColors[bi++ % blockColors.length]
      box(x, GROUND + 3.5, z, 14, 7, 14, c)
      if (bi % 3 === 0) box(x, GROUND + 9, z, 11, 4, 11, blockColors[(bi + 2) % blockColors.length])
    }
    // 철판 더미
    for (let x = 130; x <= 210; x += 20) for (let k = 0; k < 4; k++) box(x, GROUND + 0.5 + k * 1, -112, 14, 0.9, 7, k % 2 ? '#6d7780' : '#7b858e')

    // 옆 건조장(도크2) — 받침 위에 도크1 과 같은 배 모델을 올린다(모델 로드 후). 클릭·이름표 없음
    const HZ = -85
    box(-5, GROUND + 1.5, HZ, 160, 3, 30, '#8a98a6') // 받침

    // 옆 건조장 골리앗 크레인(단순형)
    {
      const gx = -10, za = HZ - 38, zb = HZ + 30, top = GROUND + 62, red = '#c8452e'
      for (const z of [za, zb]) {
        for (const sx of [-1, 1]) beam(new THREE.Vector3(gx + sx * 11, GROUND + 2, z), new THREE.Vector3(gx + sx * 3, top - 5, z), 2.6, red, scene)
        box(gx, GROUND + 1.5, z, 26, 2, 3, red)
      }
      box(gx, top, (za + zb) / 2, 7, 10, zb - za + 20, red)
      box(gx, top + 7, za + 10, 8, 4, 9, '#b23a26')
      const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 160
      const x2 = c2.getContext('2d')!
      x2.fillStyle = red; x2.fillRect(0, 0, 1024, 160)
      x2.fillStyle = '#fff'; x2.textAlign = 'center'; x2.textBaseline = 'middle'
      drawHyundaiLogo(x2, 620, 80, 96)
      x2.textAlign = 'left'; x2.font = '700 44px -apple-system, "Segoe UI", sans-serif'; x2.fillText('900 TON', 34, 82)
      const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace
      const lg = new THREE.Mesh(new THREE.PlaneGeometry(46, 7.2), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 }))
      lg.position.set(gx + 3.52, top, (za + zb) / 2)
      lg.rotation.y = Math.PI / 2
      scene.add(lg)
    }

    // 지브 크레인(노랑·청록) — 도크와 건조장 둘레
    const jibCrane = (x: number, z: number, color: string, yaw: number, h = 34) => {
      box(x, GROUND + 2, z, 7, 4, 7, color)
      box(x, GROUND + h / 2 + 4, z, 2.4, h, 2.4, color)
      box(x, GROUND + h + 6, z, 4.5, 4, 4.5, '#eef2f5')
      const g = new THREE.Group()
      g.position.set(x, GROUND + h + 6, z)
      g.rotation.y = yaw
      scene.add(g)
      beam(new THREE.Vector3(0, 1, 0), new THREE.Vector3(30, 16, 0), 1.3, color, g)
      beam(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-9, 2, 0), 1.6, color, g)
      box(-10, 1, 0, 4, 3, 3, '#5c6670', g)
    }
    jibCrane(-80, -48, '#e2b23a', 2.3)
    jibCrane(45, -50, '#2fa39a', 1.1)
    jibCrane(-60, 42, '#e2b23a', -0.6, 30)
    jibCrane(95, -118, '#e2b23a', -2.2)
    jibCrane(-150, -112, '#2fa39a', 0.4)
    // 안벽 크레인(바닷가)
    for (const z of [-120, 140]) jibCrane(SEA_X - 12, z, '#e2b23a', 0, 40)

    // 바다에 계류 중인 배(빨간 선저 · 남색 선체 · 흰 거주구)
    const moored = (z: number, len: number, hullTop: string) => {
      const x = SEA_X + 22
      box(x, GROUND - 4, z, 26, 6, len, '#b4472f')
      box(x, GROUND + 3, z, 26, 8, len * 0.98, hullTop)
      box(x, GROUND + 12, z + len * 0.4, 20, 12, 12, '#eef2f5')
      for (let k = -0.35; k < 0.3; k += 0.11) box(x, GROUND + 9, z + len * k, 22, 5, len * 0.09, ['#b0473a', '#3f6f9f', '#8e98a0'][Math.round((k + 1) * 10) % 3])
    }
    moored(-200, 170, '#26386b')
    moored(40, 150, '#1f3d5c')
    moored(250, 130, '#26386b')

    // ---- 배경 밀도 높이기: 사진처럼 야드 곳곳에 블록·자재·컨테이너, 크레인 숲, 도로망, 세 번째 건조장, 먼바다 배 ----
    const rnd = (() => { let seed = 7; return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } })()
    const unit = new THREE.BoxGeometry(1, 1, 1)
    // 같은 모양을 한 번에 많이 그리는 상자 묶음(InstancedMesh)
    const scatter = (count: number, x0: number, x1: number, z0: number, z1: number, w: [number, number], h: [number, number], d: [number, number], colors: string[], stack = 0) => {
      const mesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.75 }), count * (stack ? 2 : 1))
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
      let n = 0
      for (let k = 0; k < count; k++) {
        const sw = w[0] + rnd() * (w[1] - w[0]), sh = h[0] + rnd() * (h[1] - h[0]), sd = d[0] + rnd() * (d[1] - d[0])
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() < 0.5 ? 0 : Math.PI / 2)
        m4.compose(new THREE.Vector3(x, GROUND + sh / 2, z), q, new THREE.Vector3(sw, sh, sd))
        mesh.setMatrixAt(n, m4); mesh.setColorAt(n++, col.set(colors[Math.floor(rnd() * colors.length)]))
        if (stack && rnd() < stack) {
          m4.compose(new THREE.Vector3(x, GROUND + sh + sh * 0.4, z), q, new THREE.Vector3(sw * 0.8, sh * 0.8, sd * 0.8))
          mesh.setMatrixAt(n, m4); mesh.setColorAt(n++, col.set(colors[Math.floor(rnd() * colors.length)]))
        }
      }
      mesh.count = n
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    }
    const BLOCKS = ['#b4472f', '#c2552f', '#8e98a0', '#a8643f', '#7f8a92', '#9ea9b0', '#d0d5da']
    const MISC = ['#6d7780', '#7b858e', '#b9c0c6', '#e2b23a', '#3f6f9f', '#b4472f']
    const BOXES = ['#c0392b', '#2e6f9e', '#e2b23a', '#3a8f6a', '#8e98a0', '#d35400', '#ecf0f1']
    // 블록 적치장(서쪽)·공장 앞마당·동쪽 안벽 마당에 블록과 자재
    scatter(70, -320, -140, -170, 90, [7, 14], [3.5, 8], [7, 14], BLOCKS, 0.35)
    scatter(60, -260, 260, -178, -160, [6, 14], [3, 8], [5, 10], MISC, 0.2)
    scatter(50, -260, 260, -128, -116, [5, 12], [2, 6], [4, 8], MISC)
    scatter(36, 130, 300, -150, -100, [6, 12], [3, 7], [6, 12], BLOCKS, 0.3)
    scatter(40, -340, -140, -330, -300, [7, 13], [3.5, 8], [7, 13], BLOCKS, 0.3)
    // 컨테이너 더미(바닷가 동쪽)
    {
      const mesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 720)
      const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion()
      let n = 0
      for (let r = 0; r < 40; r++) for (let c = 0; c < 6; c++) for (let lv = 0; lv < 3; lv++) {
        if (rnd() < 0.18) continue
        m4.compose(new THREE.Vector3(250 + c * 7, GROUND + 0.7 + lv * 1.4, 80 + r * 1.6 + Math.floor(r / 2) * 1.2), q, new THREE.Vector3(6.3, 1.35, 1.3))
        mesh.setMatrixAt(n, m4); mesh.setColorAt(n++, col.set(BOXES[Math.floor(rnd() * BOXES.length)]))
      }
      mesh.count = n
      mesh.castShadow = true
      scene.add(mesh)
    }
    // 도로망(아스팔트 + 점선)
    const road = (x: number, z: number, w: number, d: number, alongX: boolean) => {
      groundMats.push(box(x, GROUND + 0.05, z, w, 0.1, d, '#6f767c').mat)
      if (alongX) for (let k = x - w / 2 + 6; k < x + w / 2; k += 14) groundMats.push(box(k, GROUND + 0.12, z, 6, 0.04, 0.5, '#f5f5f7').mat)
      else for (let k = z - d / 2 + 6; k < z + d / 2; k += 14) groundMats.push(box(x, GROUND + 0.12, k, 0.5, 0.04, 6, '#f5f5f7').mat)
    }
    road(0, -142, 640, 12, true)
    road(0, -238, 640, 10, true)
    road(-130, -90, 12, 300, false)
    road(-290, -100, 10, 420, false)
    // 공장 단지 한 줄 더 + 서쪽 끝 공장
    for (let x = -260; x <= 260; x += 105) hall(x, -350, 92, 48, 15, '#e4e8eb', '#46709a')
    for (const z of [-260, -120, 20]) hall(-420, z, 64, 100, 16, '#e4e8eb', '#46709a')
    // 크레인 숲 — 노랑·청록 지브 크레인을 건조장·공장 사이에 더
    for (const [cx, cz, c, yaw] of [[-120, -130, '#e2b23a', 1.9], [0, -128, '#2fa39a', 2.6], [130, -132, '#e2b23a', 0.6], [-200, -175, '#2fa39a', 1.2], [200, -62, '#e2b23a', -2.0], [265, -112, '#2fa39a', 2.8], [-240, -70, '#e2b23a', 0.2], [-175, 30, '#2fa39a', -1.0], [-30, -175, '#e2b23a', 2.2], [90, -176, '#2fa39a', 1.5]] as const) jibCrane(cx, cz, c, yaw, 30 + rnd() * 12)
    // 세 번째 건조장(동쪽) — 바다 쪽으로 놓인 배
    {
      const z = -75
      box(230, GROUND + 1.5, z, 120, 3, 26, '#8a98a6')
      box(228, GROUND + 6.5, z, 110, 7, 22, '#b4472f')
      box(224, GROUND + 13.5, z, 100, 7, 22, '#1f3d5c')
      box(186, GROUND + 22, z, 9, 12, 18, '#eef2f5')
      for (let x = 196; x <= 268; x += 12) box(x, GROUND + 19.5, z, 10, 5, 20, ['#8e98a0', '#b0473a', '#3f6f9f'][Math.floor(rnd() * 3)])
    }
    // 먼바다 — 방파제와 정박 중인 배·예인선
    groundMats.push(box(720, GROUND - 3, -100, 14, 6, 900, '#9aa2a9').mat)
    for (const [mx, mz, len, c] of [[520, -320, 150, '#26386b'], [600, 160, 130, '#1f3d5c'], [470, 380, 110, '#7a2f2a'], [650, -40, 90, '#26386b']] as const) {
      box(mx, GROUND - 4, mz, 22, 5, len, '#b4472f')
      box(mx, GROUND + 2, mz, 22, 7, len * 0.97, c)
      box(mx, GROUND + 10, mz + len * 0.38, 16, 10, 10, '#eef2f5')
    }
    for (const [tx, tz] of [[380, -40], [400, 110], [430, -260]] as const) { box(tx, GROUND - 3, tz, 7, 3, 14, '#2b3138'); box(tx, GROUND + 0.5, tz - 2, 5, 3, 5, '#eef2f5') }
    // 도크 앞쪽(카메라 쪽) 야드 — 낮고 줄 맞춘 구역으로 정돈: 철판 적치장 · 소조립 · 주차장 · 낮은 창고 · 나무와 보행로
    // 초록 보행로(구역 사이)
    groundMats.push(box(0, GROUND + 0.07, 165, 460, 0.04, 5, '#5fae73').mat)
    groundMats.push(box(-30, GROUND + 0.07, 130, 4, 0.04, 70, '#5fae73').mat)
    groundMats.push(box(70, GROUND + 0.07, 130, 4, 0.04, 70, '#5fae73').mat)
    // 구역 경계 노란선
    const zoneLine = (x0: number, x1: number, z0: number, z1: number) => {
      for (const z of [z0, z1]) groundMats.push(box((x0 + x1) / 2, GROUND + 0.08, z, x1 - x0, 0.04, 0.45, '#e3b93c').mat)
      for (const x of [x0, x1]) groundMats.push(box(x, GROUND + 0.08, (z0 + z1) / 2, 0.45, 0.04, z1 - z0, '#e3b93c').mat)
    }
    // A. 철판 적치장 — 같은 크기 더미를 바둑판처럼, 사이 통로
    zoneLine(-210, -40, 100, 158)
    for (let c = 0; c < 6; c++) for (let r = 0; r < 3; r++) {
      const x = -195 + c * 27, z = 110 + r * 18
      const layers = 2 + ((c + r) % 3)
      for (let k = 0; k < layers; k++) box(x, GROUND + 0.45 + k * 0.85, z, 16, 0.75, 9, k % 2 ? '#6d7780' : '#7d8790')
      box(x, GROUND + 0.2, z - 3.6, 16.4, 0.4, 0.6, '#5c4a3a')
      box(x, GROUND + 0.2, z + 3.6, 16.4, 0.4, 0.6, '#5c4a3a')
    }
    // B. 소조립 구역 — 같은 톤 낮은 블록 두 줄
    zoneLine(-22, 62, 100, 158)
    for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) {
      const x = -6 + c * 26, z = 115 + r * 26
      box(x, GROUND + 0.6, z, 16, 1.2, 14, '#8a98a6')
      box(x, GROUND + 3.2, z, 14, 4, 12, r ? '#a8643f' : '#9ea9b0')
    }
    // C. 주차장 — 흰 주차선 안에 트럭·지게차 나란히
    for (let k = 0; k <= 7; k++) groundMats.push(box(90 + k * 15, GROUND + 0.08, 125, 0.4, 0.04, 26, '#f5f5f7').mat)
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Group()
      g.position.set(97.5 + k * 15, GROUND, 125)
      scene.add(g)
      if (k % 3 === 2) { // 지게차
        box(0, 1.4, 0, 3, 2, 5, '#e2b23a', g); box(0, 3.4, 1, 2.6, 2, 2.4, '#2b3a4a', g); box(0, 2, -3.2, 2.4, 3.6, 0.3, '#3a3f45', g)
      } else { // 트럭
        box(0, 1.8, 2.5, 4, 2.6, 4, k % 2 ? '#eef2f5' : '#3f6f9f', g)
        box(0, 1.6, -2.5, 4.2, 2.2, 9, '#5c6670', g)
        box(0, 3.4, 4.2, 3.6, 1.2, 0.2, '#2b3a4a', g)
      }
    }
    // D. 낮은 창고 한 줄(줄무늬 지붕)
    for (let k = 0; k < 4; k++) hall(-165 + k * 110, 205, 80, 30, 6, '#e8ecef', '#46709a')
    // 나무 — 보행로와 도로를 따라 줄지어
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 })
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4f8f55', roughness: 0.9, flatShading: true })
    const tree = (x: number, z: number, h = 7) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, h * 0.45, 6), trunkMat)
      t.position.set(x, GROUND + h * 0.22, z)
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.38, 0), leafMat)
      l.position.set(x, GROUND + h * 0.62, z)
      l.castShadow = t.castShadow = true
      scene.add(t, l)
    }
    for (let x = -215; x <= 225; x += 22) tree(x, 172)
    for (let x = 60; x <= 300; x += 26) tree(x, 98, 6)
    // 도크와 도로 사이 — 자재 팔레트를 일정 간격으로
    for (let k = 0; k < 7; k++) {
      const x = -110 + k * 14
      box(x, GROUND + 0.3, 66, 5, 0.6, 4, '#b8925a')
      box(x, GROUND + 1.1, 66, 4.2, 1, 3.4, k % 2 ? '#7b858e' : '#e2b23a')
    }

    // 도크 옆에 줄지어 놓인 흰 격자 블록(탑재 대기 중인 화물창 블록)
    const gridBlk = document.createElement('canvas')
    gridBlk.width = gridBlk.height = 64
    const gb = gridBlk.getContext('2d')!
    gb.fillStyle = '#e9edf0'; gb.fillRect(0, 0, 64, 64)
    gb.strokeStyle = '#a9b3bb'; gb.lineWidth = 3
    for (let k = 0; k <= 64; k += 16) { gb.beginPath(); gb.moveTo(k, 0); gb.lineTo(k, 64); gb.stroke(); gb.beginPath(); gb.moveTo(0, k); gb.lineTo(64, k); gb.stroke() }
    const gridBlkTex = new THREE.CanvasTexture(gridBlk)
    gridBlkTex.colorSpace = THREE.SRGBColorSpace
    const whiteBlkMat = new THREE.MeshStandardMaterial({ map: gridBlkTex, roughness: 0.8 })
    for (let x = -88; x <= 92; x += 22) {
      if (Math.abs(x + 80) < 8 || Math.abs(x - 45) < 8 || (x > -2 && x < 42)) continue // 크레인 자리 피하기
      for (let lv = 0; lv < (x % 44 === 0 ? 2 : 1); lv++) {
        const wb = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 13), whiteBlkMat)
        wb.position.set(x, GROUND + 4.5 + lv * 9, -42)
        wb.castShadow = wb.receiveShadow = true
        scene.add(wb)
      }
    }
    // 키 큰 파란 크레인(골리앗 높이에 가까운 레벨러핑 크레인)
    const bigCrane = (x: number, z: number, h: number, yaw: number) => {
      box(x, GROUND + 3, z, 12, 6, 12, '#2f6fb3')
      box(x, GROUND + 6 + h / 2, z, 4, h, 4, '#2f6fb3')
      box(x, GROUND + 8 + h, z, 9, 6, 7, '#2f6fb3')
      const g = new THREE.Group()
      g.position.set(x, GROUND + 9 + h, z)
      g.rotation.y = yaw
      scene.add(g)
      beam(new THREE.Vector3(2, 0, 0), new THREE.Vector3(46, 22, 0), 2.2, '#2f6fb3', g)
      beam(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(-14, 2, 0), 2.4, '#2f6fb3', g)
      box(-15, 1, 0, 6, 5, 5, '#5c6670', g)
    }
    bigCrane(110, -48, 54, 2.6)
    bigCrane(-125, -50, 50, 0.5)
    // 빨강·흰 격자 붐 크롤러 크레인
    {
      const bx = 75, bz = -58
      box(bx, GROUND + 2, bz, 14, 4, 10, '#3a3f45')
      box(bx, GROUND + 6, bz, 10, 5, 8, '#c0392b')
      const tip = new THREE.Vector3(bx - 30, GROUND + 82, bz + 6)
      const base = new THREE.Vector3(bx, GROUND + 8, bz)
      for (let k = 0; k < 8; k++) {
        const a = base.clone().lerp(tip, k / 8), b = base.clone().lerp(tip, (k + 1) / 8)
        beam(a, b, 2.2, k % 2 ? '#eef2f5' : '#c0392b', scene)
      }
    }

    // 언덕 위 마을(먼 배경)
    scatter(80, -720, -460, -620, -260, [6, 14], [6, 18], [6, 14], ['#eef1f3', '#d9dee2', '#c9cfd4', '#e8e2d6'])

    // 블록 위치 표시 — 반투명 상자 + 격자선. 선택한 블록은 빨강, 나머지는 파랑
    const holoGeo = (sx: number, sy: number, sz: number, step: number) => {
      const pts: number[] = []
      const h = [sx / 2, sy / 2, sz / 2]
      for (let a = 0; a < 3; a++) {
        const b = (a + 1) % 3, c = (a + 2) % 3
        for (const sa of [-1, 1]) {
          const line = (v: number, from: number, to: number, alongC: boolean) => {
            const p1 = [0, 0, 0], p2 = [0, 0, 0]
            p1[a] = p2[a] = sa * h[a]
            if (alongC) { p1[b] = p2[b] = v; p1[c] = from; p2[c] = to } else { p1[c] = p2[c] = v; p1[b] = from; p2[b] = to }
            pts.push(...p1, ...p2)
          }
          const nb = Math.max(1, Math.round((2 * h[b]) / step)), nc = Math.max(1, Math.round((2 * h[c]) / step))
          for (let i = 0; i <= nb; i++) line(-h[b] + (2 * h[b] * i) / nb, -h[c], h[c], true)
          for (let i = 0; i <= nc; i++) line(-h[c] + (2 * h[c] * i) / nc, -h[b], h[b], false)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      return g
    }
    const HOLO_ON = new THREE.Color('#ff3b30'), HOLO_OFF = new THREE.Color('#3d9bff')
    const holos: { id: string; root: THREE.Object3D; group: THREE.Group; fill: THREE.MeshBasicMaterial; line: THREE.LineBasicMaterial; edge: THREE.LineBasicMaterial }[] = []
    const list: Block[] = []
    const pickable: THREE.Mesh[] = []
    let sparks: { points: THREE.Points; light: THREE.PointLight; emitters: THREE.Vector3[] } | null = null
    let transit: { root: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; wheels: THREE.Mesh[]; beacon: THREE.MeshStandardMaterial; r: number; last: number } | null = null
    let crane: { trolley: THREE.Object3D; cables: THREE.Mesh[]; hook: THREE.Object3D; z: [number, number]; base: number; phase: number }[] = []
    let disposed = false
    let frame = 0

    new GLTFLoader().load(`${import.meta.env.BASE_URL}models/ship-blocks.glb`, (gltf) => {
      if (disposed) return
      const model = gltf.scene
      model.scale.setScalar(SHIP_SCALE) // 배를 주변 시설보다 크게
      // 도크2 의 배 — 블록 색 처리 전에 원본 모양 그대로 복제. 클릭 대상(pickable)에는 넣지 않는다
      {
        const twin2 = model.clone(true)
        twin2.traverse((o) => { if (o instanceof THREE.Mesh) { if (o.userData.cargo) o.visible = false; o.castShadow = o.receiveShadow = true } })
        twin2.updateMatrixWorld(true)
        const b2 = new THREE.Box3().setFromObject(twin2)
        twin2.position.set(-5 - (b2.min.x + b2.max.x) / 2, GROUND + 3 - b2.min.y, HZ - (b2.min.z + b2.max.z) / 2)
        scene.add(twin2)
      }
      scene.add(model)
      model.updateMatrixWorld(true)
      for (const info of blocks) {
        const g = model.getObjectByName(info.id)
        if (!g) continue
        const bb = new THREE.Box3().setFromObject(g)
        const size = bb.getSize(new THREE.Vector3())
        const center = bb.getCenter(new THREE.Vector3())
        const meshes: THREE.Mesh[] = []
        g.traverse((o) => { if (o instanceof THREE.Mesh) { if (o.userData.cargo) o.visible = false; else meshes.push(o) } })
        const mats: THREE.MeshStandardMaterial[] = []
        const pick: THREE.Mesh[] = []
        const own = (base: THREE.Material, color?: string) => {
          const m = (base as THREE.MeshStandardMaterial).clone()
          if (color) { m.color.set(color); m.roughness = 0.62; m.metalness = 0.35 }
          m.emissive.set('#3fc3dc')
          m.emissiveIntensity = 0
          mats.push(m)
          return m
        }

        if (info.stage === 'done') {
          for (const mesh of meshes) { mesh.material = own(mesh.material as THREE.Material); pick.push(mesh) }
        } else if (info.stage === 'working') {
          // 선미 끝에서부터 진행분은 완료 색, 남은 분은 강재 색 — 진행률만큼 길이로 표시
          const s = bb.min.x + size.x * (info.progress / 100)
          const painted = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), s)]
          const bare = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -s)]
          for (const mesh of meshes) {
            const base = mesh.material as THREE.Material
            const top = new THREE.Mesh(mesh.geometry, own(base, PRIMER))
            ;(top.material as THREE.MeshStandardMaterial).clippingPlanes = bare
            top.castShadow = top.receiveShadow = true
            mesh.parent!.add(top)
            mesh.material = own(base)
            ;(mesh.material as THREE.MeshStandardMaterial).clippingPlanes = painted
            pick.push(mesh, top)
          }
        } else {
          for (const mesh of meshes) { mesh.material = own(mesh.material as THREE.Material, PRIMER); pick.push(mesh) }
        }
        for (const mesh of meshes) { mesh.castShadow = true; mesh.receiveShadow = true }

        let root: THREE.Object3D = g
        if (info.stage === 'ground' || info.stage === 'transit') {
          // 원래 탑재될 자리에는 윤곽만 남긴다
          const ghostFill = new THREE.MeshBasicMaterial({ color: stageColor[info.stage], transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide })
          const ghostLine = new THREE.LineBasicMaterial({ color: stageColor[info.stage], transparent: true, opacity: 0.45, depthWrite: false })
          for (const mesh of meshes) {
            const fillMesh = new THREE.Mesh(mesh.geometry, ghostFill)
            fillMesh.applyMatrix4(mesh.matrixWorld)
            fillMesh.userData.blockId = info.id
            scene.add(fillMesh)
            pick.push(fillMesh)
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 40), ghostLine)
            edges.applyMatrix4(mesh.matrixWorld)
            scene.add(edges)
          }
          const pivot = new THREE.Group()
          pivot.position.copy(center)
          scene.add(pivot)
          pivot.attach(g)
          root = pivot
          if (info.stage === 'ground') {
            // 도크 옆 지상에서 뒤집어 놓고 하부 작업
            pivot.rotation.x = Math.PI
            pivot.position.set(center.x, GROUND + 3 + size.y / 2, B01_Z)
            for (const dx of [-20, 0, 20]) for (const dz of [-11, 11]) box(center.x + dx, GROUND + 1.5, B01_Z + dz, 5, 3, 5, '#6b7f8d')
            const top = GROUND + 3 + size.y
            const emitters = [new THREE.Vector3(center.x - 14, top, B01_Z - 6), new THREE.Vector3(center.x + 8, top, B01_Z + 5), new THREE.Vector3(center.x + 18, top, B01_Z - 9)]
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3))
            const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffb347', size: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
            scene.add(points)
            const light = new THREE.PointLight('#ff9a3c', 0, 40, 1.6)
            light.position.copy(emitters[0]).add(new THREE.Vector3(0, 2, 0))
            scene.add(light)
            sparks = { points, light, emitters }
          } else {
            // 조립장 → 도크: 블록 전용 트랜스포터(SPMT)에 받침대를 놓고 싣고, 야드 도로를 따라 직진
            const carrier = new THREE.Group()
            const L = size.x * 1.08, W = size.z * 0.78, stool = 1.6, deck = 1.4, r = 0.8
            const deckTop = -size.y / 2 - stool
            box(0, deckTop - deck / 2, 0, L, deck, W, '#e2b23a', carrier)
            box(0, deckTop - deck - 0.4, 0, L - 2, 0.8, W * 0.86, '#3a3f45', carrier)
            for (const sx of [-0.32, 0, 0.32]) for (const sz of [-0.3, 0.3]) box(L * sx, deckTop + stool / 2, W * sz, 2.4, stool, 2.4, '#7d858c', carrier)
            const wheels: THREE.Mesh[] = []
            const tire = new THREE.MeshStandardMaterial({ color: '#23272c', roughness: 0.85 })
            const axles = 12
            for (let k = 0; k < axles; k++) {
              const x = -L / 2 + 2 + (k * (L - 4)) / (axles - 1)
              for (const z of [-W * 0.4, -W * 0.28, W * 0.28, W * 0.4]) {
                const w = new THREE.Mesh(wheelGeo(r, 0.9), tire)
                w.position.set(x, deckTop - deck - r, z)
                w.castShadow = true
                carrier.add(w)
                wheels.push(w)
              }
            }
            // 진행 방향(-x) 앞쪽 운전석과 경광등
            box(-L / 2 - 1.6, deckTop - deck / 2 + 0.8, W * 0.22, 3, 3.6, W * 0.42, '#e2b23a', carrier)
            box(-L / 2 - 3.15, deckTop - deck / 2 + 1.6, W * 0.22, 0.12, 1.6, W * 0.36, '#2b3a4a', carrier)
            const beacon = new THREE.MeshStandardMaterial({ color: '#ff9f0a', emissive: '#ff8c00', emissiveIntensity: 0 })
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), beacon)
            lamp.position.set(-L / 2 - 1.6, deckTop - deck / 2 + 3, W * 0.22)
            carrier.add(lamp)
            pivot.add(carrier)
            const y = GROUND + 2 * r + deck + stool + size.y / 2
            transit = { root: pivot, from: new THREE.Vector3(250, y, 84), to: new THREE.Vector3(center.x + 35, y, 84), wheels, beacon, r, last: 250 }
            pivot.position.copy(transit.from)
          }
        }

        for (const p of pick) { p.userData.blockId = info.id; pickable.push(p) }
        {
          const hb = new THREE.Box3().setFromObject(root)
          const hs = hb.getSize(new THREE.Vector3()).addScalar(2.4)
          const group = new THREE.Group()
          const fill = new THREE.MeshBasicMaterial({ color: HOLO_OFF, transparent: true, opacity: 0.12, depthWrite: false })
          const fillMesh = new THREE.Mesh(new THREE.BoxGeometry(hs.x, hs.y, hs.z), fill)
          fillMesh.userData.blockId = info.id
          fillMesh.renderOrder = 2
          pickable.push(fillMesh)
          const line = new THREE.LineBasicMaterial({ color: HOLO_OFF, transparent: true, opacity: 0.45, depthWrite: false })
          const grid = new THREE.LineSegments(holoGeo(hs.x, hs.y, hs.z, 3.2), line)
          grid.renderOrder = 3
          const edge = new THREE.LineBasicMaterial({ color: HOLO_OFF, transparent: true, opacity: 0.95, depthWrite: false })
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hs.x, hs.y, hs.z)), edge)
          edges.renderOrder = 4
          group.add(fillMesh, grid, edges)
          group.position.copy(hb.getCenter(new THREE.Vector3()))
          scene.add(group)
          holos.push({ id: info.id, root, group, fill, line, edge })
        }
        const anchorPos = new THREE.Vector3()
        const midPos = new THREE.Vector3()
        list.push({
          id: info.id, stage: info.stage, root, mats, pick,
          anchor: () => {
            const b = new THREE.Box3().setFromObject(root)
            return anchorPos.set((b.min.x + b.max.x) / 2, b.max.y + 5, (b.min.z + b.max.z) / 2)
          },
          middle: () => new THREE.Box3().setFromObject(root).getCenter(midPos),
        })
      }
      // 골리앗 크레인 — 굵은 단일 상자형 거더가 도크를 가로지르고, 야드 쪽은 A자 다리, 도크 건너편은 기둥 다리.
      // 거더 위·아래 트롤리에서 훅 여러 개와 인양 빔이 내려온다
      {
        const top = new THREE.Box3().setFromObject(model).max.y + 42
        const cx = 20, z0 = -30, z1 = 70, span = z1 - z0, zm = (z0 + z1) / 2
        const rig = new THREE.Group()
        const orange = '#c8452e', dark = '#3a3f45', white = '#eef2f5'
        const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
        const GH = 12, gBot = top - GH / 2, gTop = top + GH / 2
        // 주행 레일
        for (const z of [z0, z1]) {
          groundMats.push(box(50, GROUND + 0.2, z, 340, 0.4, 3, '#8e969d').mat)
          groundMats.push(box(50, GROUND + 0.55, z, 340, 0.3, 0.7, '#5d646b').mat)
        }
        const sillTop = GROUND + 3.4
        for (const [z, len] of [[z0, 20], [z1, 34]] as const) {
          box(cx, GROUND + 2.6, z, len, 1.6, 3, orange, rig)
          for (const bx of len > 20 ? [-14, -6, 6, 14] : [-7, 7]) {
            box(cx + bx, GROUND + 1.4, z, 5, 1.1, 2.2, dark, rig)
            for (const wx of [-1.4, 1.4]) {
              const w = new THREE.Mesh(wheelGeo(0.75, 0.6), new THREE.MeshStandardMaterial({ color: '#23272c' }))
              w.position.set(cx + bx + wx, GROUND + 1.05, z)
              rig.add(w)
            }
          }
        }
        // A자 다리(야드 쪽)
        for (const sx of [-1, 1]) beam(V(cx + sx * 15, sillTop, z1), V(cx + sx * 3.4, gBot, z1), 3.8, orange, rig)
        {
          const lx = (h: number) => 15 - (15 - 3.4) * h // 높이 비율 h에서 다리 x 간격(절반)
          const yAt = (h: number) => sillTop + (gBot - sillTop) * h
          for (const h of [0.34, 0.68]) beam(V(cx - lx(h), yAt(h), z1), V(cx + lx(h), yAt(h), z1), 1.8, orange, rig)
          beam(V(cx - lx(0.34), yAt(0.34), z1), V(cx + lx(0.68), yAt(0.68), z1), 1.1, orange, rig)
          beam(V(cx + lx(0.34), yAt(0.34), z1), V(cx - lx(0.68), yAt(0.68), z1), 1.1, orange, rig)
        }
        box(cx, gBot - 1.5, z1, 9, 3, 4.2, orange, rig)
        // 기둥 다리(도크 건너편)
        beam(V(cx, sillTop, z0), V(cx, gBot, z0), 3.2, orange, rig)
        for (const sx of [-1, 1]) beam(V(cx + sx * 8, sillTop, z0), V(cx, sillTop + 9, z0), 1.4, orange, rig)
        box(cx, gBot - 1.2, z0, 6, 2.4, 4, orange, rig)
        // 단일 상자형 거더(양끝 돌출) + 하부 플랜지 + 상부 통로 난간
        box(cx, top, zm, 8, GH, span + 26, orange, rig)
        box(cx, gBot - 0.15, zm, 8.4, 0.3, span + 26, '#8f2f1d', rig)
        box(cx, gTop + 0.15, zm, 8.4, 0.3, span + 26, '#8f2f1d', rig)
        for (let z = z0 - 12; z <= z1 + 12; z += 6) for (const sx of [-1, 1]) box(cx + sx * 3, gTop + 0.7, z, 0.12, 1.4, 0.12, '#e8e8ed', rig)
        for (const sx of [-1, 1]) box(cx + sx * 3, gTop + 1.4, zm, 0.12, 0.12, span + 24, '#e8e8ed', rig)
        // 거더 옆면 로고
        const cvs = document.createElement('canvas')
        cvs.width = 1024
        cvs.height = 160
        const g2 = cvs.getContext('2d')!
        g2.fillStyle = orange
        g2.fillRect(0, 0, cvs.width, cvs.height)
        g2.fillStyle = '#ffffff'
        g2.textBaseline = 'middle'
        drawHyundaiLogo(g2, cvs.width * 0.62, cvs.height / 2, 100)
        g2.textAlign = 'left'
        g2.font = '700 46px -apple-system, "Segoe UI", sans-serif'
        g2.fillText('1290 TON', 34, cvs.height / 2 + 2)
        const logoTex = new THREE.CanvasTexture(cvs)
        logoTex.colorSpace = THREE.SRGBColorSpace
        for (const sx of [-1, 1]) {
          const logo = new THREE.Mesh(new THREE.PlaneGeometry(56, 8.75), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.6 }))
          logo.position.set(cx + sx * 4.02, top, zm + 8)
          logo.rotation.y = sx * Math.PI / 2
          rig.add(logo)
        }
        // 기계실(거더 위)·운전실(거더 아래)
        box(cx, gTop + 2.4, z1 - 4, 6, 4.8, 11, white, rig)
        box(cx + 4.6, gBot - 2.4, z1 - 12, 3.2, 3.6, 4.4, white, rig)
        box(cx + 6.25, gBot - 2, z1 - 12, 0.1, 1.6, 3.8, '#2b3a4a', rig)
        // 훅(와이어 2줄 + 훅 블록)
        const rope = new THREE.MeshStandardMaterial({ color: '#2b3138' })
        const makeHook = (parent: THREE.Object3D, oz: number, color: string) => {
          const cables: THREE.Mesh[] = []
          for (const dx of [-0.7, 0.7]) {
            const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), rope)
            c.position.set(dx, 0, oz)
            c.castShadow = true
            parent.add(c)
            cables.push(c)
          }
          const hook = new THREE.Group()
          box(0, 0, 0, 2.6, 2, 1.8, color, hook)
          const hk = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 8, 18, Math.PI * 1.45), new THREE.MeshStandardMaterial({ color: dark, metalness: 0.6, roughness: 0.4 }))
          hk.rotation.z = -Math.PI * 0.2
          hk.position.y = -1.9
          hook.add(hk)
          hook.position.z = oz
          parent.add(hook)
          return { cables, hook }
        }
        // 상부 트롤리(거더 위 빨간 함체) — 훅 2개
        const t1 = new THREE.Group()
        box(0, GH / 2 + 2.6, 0, 10, 5.2, 12, '#b23a26', t1)
        box(0, GH / 2 + 5.9, 1.5, 7, 1.6, 7, white, t1)
        for (const oz of [-2.6, 2.6]) {
          const h = makeHook(t1, oz, '#e2b23a')
          crane.push({ trolley: t1, ...h, z: [0, 46], base: 40 + oz, phase: oz })
        }
        t1.position.set(cx, top, 20)
        rig.add(t1)
        // 하부 트롤리(거더 아래) — 인양 빔(스프레더)
        const t2 = new THREE.Group()
        box(0, -GH / 2 - 1, 0, 6, 2, 6, dark, t2)
        const h2 = makeHook(t2, 0, dark)
        box(0, -2.4, 0, 1.2, 0.9, 12, '#f2c230', h2.hook)
        for (const dz of [-5, 5]) {
          const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), rope)
          ch.position.set(0, -4.9, dz)
          h2.hook.add(ch)
        }
        crane.push({ trolley: t2, ...h2, z: [-22, 8], base: 38, phase: 2.1 })
        t2.position.set(cx, top, -6)
        rig.add(t2)
        scene.add(rig)
      }
      setReady(true)
    }, undefined, () => { if (!disposed) setError('선박 모델을 불러오지 못했습니다.') })

    const resize = () => {
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height)
      view.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let hover: string | null = null
    let downAt = { x: 0, y: 0 }
    let dragging = false
    const hit = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return (ray.intersectObjects(pickable, false)[0]?.object.userData.blockId as string | undefined) ?? null
    }
    // 카메라가 날아가는 중에 누르면 연출을 건너뛰고 바로 도착 (SMASH 의 연출 건너뛰기처럼)
    const down = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; dragging = true; if (fly) fly.start = -100 }
    const up = (e: PointerEvent) => {
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      const id = hit(e)
      if (id) cb.current(id)
    }
    const move = (e: PointerEvent) => {
      if (dragging) { renderer.domElement.style.cursor = 'grabbing'; return }
      hover = hit(e)
      renderer.domElement.style.cursor = hover ? 'pointer' : 'grab'
    }
    const leave = () => { hover = null; dragging = false }
    const cv = renderer.domElement
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerleave', leave)

    const clock = new THREE.Clock()
    const tmp = new THREE.Vector3()
    // 작업장 줌인 비행
    let fly: { start: number; fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3 } | null = null
    let flownFor = -1
    flyTo.current = (tp, tt) => { fly = { start: clock.getElapsedTime(), fp: camera.position.clone(), ft: controls.target.clone(), tp, tt } }
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const t = clock.getElapsedTime()
      const fr = focusRef.current
      if (fr.id && fr.n !== flownFor && list.length && t > 0.6) {
        flownFor = fr.n
        let tt: THREE.Vector3, tp: THREE.Vector3
        const blk = list.find((b) => b.id === fr.id)
        if (blk) {
          const bb = new THREE.Box3().setFromObject(blk.root)
          tt = bb.getCenter(new THREE.Vector3())
          const sz = bb.getSize(new THREE.Vector3())
          tp = tt.clone().add(new THREE.Vector3(0.72, 0.5, 0.48).normalize().multiplyScalar(Math.max(sz.x, sz.z) * 1.7 + 30))
        } else {
          tt = new THREE.Vector3(0, 18, 0)
          tp = new THREE.Vector3(150, 95, 120)
        }
        fly = { start: t, fp: camera.position.clone(), ft: controls.target.clone(), tp, tt }
      }
      if (fly) {
        const k = Math.min((t - fly.start) / 2.6, 1)
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
        camera.position.lerpVectors(fly.fp, fly.tp, e)
        controls.target.lerpVectors(fly.ft, fly.tt, e)
        if (k >= 1) fly = null
      }
      controls.autoRotate = bare && !fly && flownFor >= 0
      controls.update()

      const under = camera.position.y < -7
      for (const m of groundMats) m.opacity = THREE.MathUtils.lerp(m.opacity, under ? 0.18 : 1, 0.12)

      // 트롤리가 거더를 따라 천천히 오가고 훅이 오르내린다
      for (const h of crane) {
        const k = (Math.sin(t * 0.16 + h.phase * 0.3) + 1) / 2
        h.trolley.position.z = THREE.MathUtils.lerp(h.z[0], h.z[1], k)
        const drop = h.base + Math.sin(t * 0.33 + h.phase) * 5
        for (const c of h.cables) { c.scale.y = drop; c.position.y = -6 - drop / 2 }
        h.hook.position.y = -6 - drop - 1
      }
      if (transit) {
        // 26초 직진 → 8초 정차 반복. 이동 거리만큼 바퀴가 굴러가고 움직이는 동안 경광등이 깜박인다
        const k = Math.min((t % 34) / 26, 1)
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
        transit.root.position.lerpVectors(transit.from, transit.to, ease)
        const x = transit.root.position.x
        const spin = (x - transit.last) / transit.r
        transit.last = x
        for (const w of transit.wheels) w.rotation.z -= spin
        transit.beacon.emissiveIntensity = k < 1 && Math.sin(t * 9) > 0 ? 2.2 : 0
      }
      if (sparks) {
        const pos = sparks.points.geometry.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const src = sparks.emitters[i % sparks.emitters.length]
          const age = ((t * 1.7 + i * 0.137) % 1)
          const a = i * 2.39996
          pos.setXYZ(i, src.x + Math.cos(a) * age * 3, src.y + Math.sin(age * Math.PI) * 2.2, src.z + Math.sin(a) * age * 3)
        }
        pos.needsUpdate = true
        ;(sparks.points.material as THREE.PointsMaterial).opacity = 0.55 + Math.random() * 0.45
        sparks.light.intensity = 40 + Math.random() * 60
      }

      const pulse = 0.75 + 0.25 * Math.sin(t * 3)
      for (const h of holos) {
        h.group.position.copy(new THREE.Box3().setFromObject(h.root).getCenter(tmp))
        const on = h.id === sel.current || (bare && h.id === focusRef.current.id)
        const c = on ? HOLO_ON : HOLO_OFF
        h.fill.color.copy(c); h.line.color.copy(c); h.edge.color.copy(c)
        h.fill.opacity = on ? 0.2 : h.id === hover ? 0.16 : 0.1
        h.line.opacity = on ? 0.55 * pulse + 0.2 : 0.38
        h.edge.opacity = on ? pulse : 0.85
      }
      const r = el.getBoundingClientRect()
      for (const b of list) {
        const lit = b.id === sel.current ? 0.2 : b.id === hover ? 0.1 : 0
        for (const m of b.mats) m.emissiveIntensity = lit
        const label = labels.current[b.id]
        if (label) {
          tmp.copy(b.anchor()).project(camera)
          const vis = tmp.z < 1
          label.style.display = vis ? '' : 'none'
          label.style.transform = `translate(-50%,calc(-100% - 16px)) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`
        }
        // 현장 보고가 있는 블록은 블록 한가운데에 느낌표 핀
        const pin = pins.current[b.id]
        if (pin) {
          tmp.copy(b.middle()).project(camera)
          pin.style.display = tmp.z < 1 ? '' : 'none'
          pin.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * r.width}px,${((1 - tmp.y) / 2) * r.height}px)`
        }
      }
      if (t - shadowAt > 0.15) { renderer.shadowMap.needsUpdate = true; shadowAt = t }
      view.render()
      fps?.tick()
    }
    let shadowAt = -1
    draw()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.dispose()
      view.dispose()
      fps?.dispose()
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerleave', leave)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line || o instanceof THREE.Points) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      cv.remove()
    }
  }, [])

  return (
    <div className="tw-stage" ref={host}>
      {ready && !bare && alerts.map((id) => (
        <button key={`pin-${id}`} ref={(n) => { pins.current[id] = n }} className="tw-pin" aria-label={`${id} 확인 요청 보기`} onClick={() => onAlert?.(id)}>!</button>
      ))}
      {ready && !bare && blocks.map((b) => (
        <button
          key={b.id}
          ref={(n) => { labels.current[b.id] = n }}
          className={`tw-tag ${b.id === selected ? 'is-on' : ''}`}
          onClick={() => onSelect(b.id)}
        >
          {b.id}
        </button>
      ))}
      {ready && !bare && (
        <div className="tw-panel" aria-label="블록 진행 현황">
          {/* 도크2(옆 건조장)의 배는 공정이 다 끝난 배 — 블록별 진행 대신 '작업 완료' */}
          {dock === '도크2' ? (
            <div className="tw-panel-done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6.5L9.5 17 4 11.5" /></svg>
              <div><b>작업 완료</b><span>도크2 · 모든 블록 공정 완료</span></div>
            </div>
          ) : blocks.map((b) => {
            const v = progressOf?.(b.id) ?? b.progress
            return (
              <button key={b.id} className={b.id === selected ? 'is-on' : ''} onClick={() => onSelect(b.id)}>
                <b>{b.id}</b><span aria-hidden="true"><i style={{ width: `${v}%` }} /></span><em>{v}%</em>
              </button>
            )
          })}
        </div>
      )}
      {ready && !bare && (
        <div className="tw-docks" role="tablist" aria-label="도크 선택">
          {DOCKS.map((d) => (
            <button key={d.name} role="tab" aria-selected={dock === d.name} className={dock === d.name ? 'is-on' : ''} onClick={() => { setDock(d.name); flyTo.current(d.pos.clone(), d.target.clone()) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={DOCK_ICON[d.name]} /></svg>{d.name}</button>
          ))}
        </div>
      )}
      {!ready && !error && <div className="tw-msg" role="status">선박 3D 모델을 불러오는 중…</div>}
      {error && <div className="tw-msg" role="alert">{error}</div>}
      {!bare && <div className="tw-tools">
        <button className="tw-reset" onClick={() => { reset.current(); setDock('도크1') }} aria-label="시점 초기화" title="시점 초기화">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M19.8 3.8v4.6h-4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>}
    </div>
  )
}
