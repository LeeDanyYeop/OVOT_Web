import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

// 3D 화면(도크 Digital Twin · 블록 내부 확대) 공통 효과 — SMASH 저장소에서 가져온 기법들
//  · 구석 음영(AO): 판과 판이 만나는 구석을 어둡게. PC 에서만 기본으로 켜고, 주소 끝 ?ao=0 / ?ao=1 로 끄고 켠다
//  · ?fps: 화면 위에 초당 프레임 수
//  · 휴대폰: 한 손가락 끌기 = 옮기기, 두 손가락 = 돌리기·확대
//  · 강재 얼룩: 그림 파일 없이 셰이더에서 위치 기반 노이즈로 도장 전 강판의 얼룩을 칠한다
const q = () => new URLSearchParams(window.location.search)
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches
const aoWanted = () => { const v = q().get('ao'); return v === '1' || (v !== '0' && window.innerWidth >= 900 && !isTouch()) }

export type View = { setSize: (w: number, h: number) => void; render: () => void; ao: (on: boolean) => void; dispose: () => void }
/** radius = 음영이 번지는 거리(장면 단위) */
export function makeView(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, radius: number): View {
  if (!aoWanted()) return { setSize: () => {}, render: () => renderer.render(scene, camera), ao: () => {}, dispose: () => {} }
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }))
  composer.addPass(new RenderPass(scene, camera))
  const ao = new GTAOPass(scene, camera, 1, 1)
  ao.updateGtaoMaterial({ radius, thickness: radius * 0.6, distanceExponent: 1.4, scale: 1 })
  ao.blendIntensity = 0.85
  composer.addPass(ao)
  composer.addPass(new OutputPass())
  return {
    setSize: (w, h) => { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h) },
    render: () => composer.render(),
    ao: (on) => { ao.enabled = on },
    dispose: () => { ao.dispose(); composer.dispose() },
  }
}

/** ?fps 일 때 화면 왼쪽 아래에 프레임 수. tick 은 그릴 때마다, dispose 는 3D 를 치울 때 */
export function fpsMeter(host: HTMLElement): { tick: () => void; dispose: () => void } | null {
  if (!q().has('fps')) return null
  const box = document.createElement('div')
  box.className = 'tw-fps'
  host.append(box)
  let n = 0, t0 = performance.now()
  return {
    tick: () => { n++; const t = performance.now(); if (t - t0 >= 500) { box.textContent = `${Math.round((n * 1000) / (t - t0))} fps`; n = 0; t0 = t } },
    dispose: () => box.remove(),
  }
}

/** 휴대폰에서는 한 손가락으로 옮기고 두 손가락으로 돌리거나 확대 */
export function touchControls(controls: { touches: { ONE?: THREE.TOUCH | null; TWO?: THREE.TOUCH | null } }) {
  if (isTouch()) controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
}

// 위치 기반 값 노이즈 — 두 크기를 섞어 큰 얼룩 + 잔 얼룩
const NOISE = `
varying vec3 vSteelWp;
float sHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float sNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`
/** MeshStandardMaterial.onBeforeCompile 에 넣는다 — 강판 얼룩 */
export function steelPatch(sh: { vertexShader: string; fragmentShader: string }) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSteelWp;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvSteelWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${NOISE}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\nfloat sm = sNoise(vSteelWp * 0.9) * 0.6 + sNoise(vSteelWp * 3.7) * 0.4;\ndiffuseColor.rgb *= 0.86 + 0.2 * sm;')
}

export const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

/** 블록 확대 화면 재질 — 그림 파일 없이 셰이더로 칠한다.
 *  back: 판 안쪽 면 색(탱크 내부 코팅) · hull: 바깥 면을 높이에 따라 선저 방오 도장 / 흘수선 띠 / 상부 도장으로
 *  seams: 판 이음 용접선(가로 3m · 세로 2.2m 격자, 판 면과 나란한 선은 뺀다) · mottle: 얼룩 세기 0~1
 *  outerFront: 바깥 면이 앞면(gl_FrontFacing)인지 — 거울 뒤집기를 한 블록은 반대 */
export type Surface = {
  mottle: number
  outerFront: boolean
  back?: string
  hull?: { wl: number; bottom: string; boot: string; top?: string }
  seams?: string
}
const lin = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})` }
export function surfacePatch(o: Surface) {
  const code = [
    'vec3 sc = diffuseColor.rgb;',
    `bool sOuter = gl_FrontFacing == ${o.outerFront ? 'true' : 'false'};`,
    o.back ? `if (!sOuter) sc = ${lin(o.back)};` : '',
    o.hull ? `if (sOuter) { float y = vSteelWp.y; sc = y < ${o.hull.wl.toFixed(2)} ? ${lin(o.hull.bottom)} : y < ${(o.hull.wl + 0.4).toFixed(2)} ? ${lin(o.hull.boot)} : ${o.hull.top ? lin(o.hull.top) : 'sc'}; }` : '',
    o.seams ? `if (sOuter) {
      vec3 p = vSteelWp + vec3(0.0, 0.37, 0.53), s = vec3(3.0, 2.2, 2.2);
      vec3 d = s * 0.5 - abs(mod(p, s) - s * 0.5), aa = fwidth(p) * 1.5;
      vec3 l = (1.0 - smoothstep(vec3(0.025), vec3(0.025) + aa, d)) * (1.0 - abs(vSteelN));
      sc = mix(sc, ${lin(o.seams)}, clamp(max(l.x, max(l.y, l.z)), 0.0, 1.0) * 0.85);
    }` : '',
    `float sm = sNoise(vSteelWp * 0.9) * 0.6 + sNoise(vSteelWp * 3.7) * 0.4;`,
    `sc *= ${(1 - 0.14 * o.mottle).toFixed(3)} + ${(0.2 * o.mottle).toFixed(3)} * sm;`,
    'diffuseColor.rgb = sc;',
  ].join('\n')
  return {
    key: JSON.stringify(o),
    patch: (sh: { vertexShader: string; fragmentShader: string }) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSteelWp;\nvarying vec3 vSteelN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSteelWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSteelN = normalize(mat3(modelMatrix) * objectNormal);')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE}\nvarying vec3 vSteelN;`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${code}`)
    },
  }
}
