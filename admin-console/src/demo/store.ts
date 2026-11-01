/**
 * DEMO 상태 저장소 — role · screen · filter 는 이 브라우저에만, decisions(+작업자 수신 확인)는
 * 작업자 서버(/api/demo/state)와 공유한다. 서버가 없으면(정적 배포 등) 같은 브라우저의 다른 탭과만 공유한다.
 * 모든 화면(현황 · 확인 요청 · 지시·변경 · 이력 · 설계자 반영 · 작업자 PWA)이 같은 decisions 를 읽는다.
 */
import { useSyncExternalStore } from 'react'
import { decide, INITIAL_STATE, undo, type DemoState } from './flags'
import type { FlagId, Role } from './scenarioB03'

export type Screen = 'overview' | 'review' | 'instructions' | 'history' | 'drawing'
export type FlagFilter = 'all' | FlagId
export type SyncMode = 'server' | 'local'

export interface Snapshot {
  role: Role | null
  screen: Screen
  filter: FlagFilter
  state: DemoState
  sync: SyncMode
}

const UI_KEY = 'ovot-b01-ui' + (new URLSearchParams(window.location.search).has('scene') ? '-scene-' + new URLSearchParams(window.location.search).get('scene') : '')
const STATE_KEY = 'ovot-b01-state'

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function writeJson(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* 저장소를 못 쓰면 메모리에서만 동작 */
  }
}

const ui0 = readJson<Pick<Snapshot, 'role' | 'screen' | 'filter'>>(UI_KEY)
let snap: Snapshot = {
  role: ui0?.role ?? null,
  screen: ui0?.screen ?? 'overview',
  filter: ui0?.filter ?? 'all',
  state: readJson<DemoState>(STATE_KEY) ?? INITIAL_STATE,
  sync: 'local',
}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch }
  writeJson(UI_KEY, { role: snap.role, screen: snap.screen, filter: snap.filter })
  emit()
}

function setState(next: DemoState, _push: boolean) {
  snap = { ...snap, state: next }
  writeJson(STATE_KEY, next)
  emit()
}


let started = false
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY && e.newValue) {
      try {
        setState(JSON.parse(e.newValue) as DemoState, false)
      } catch {
        /* ignore */
      }
    }
  })
  // 예전 시연 상태 서버(/api/demo/state)는 배포본에 없어 2초마다 404 만 나며 Workers 무료 요청 수를 썼다.
  // 로그인 역할은 이 브라우저(localStorage)에만 두면 되므로 서버 확인은 하지 않는다.
}

export const demoStore = {
  subscribe(l: () => void) {
    start()
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => snap,
  login: (role: Role) => set({ role, screen: role === 'lead' ? 'overview' : 'drawing', filter: 'all' }),
  logout: () => set({ role: null, filter: 'all' }),
  go: (screen: Screen) => set({ screen }),
  setFilter: (filter: FlagFilter) => set({ filter }),
  decide: (id: FlagId, key: string) => setState(decide(snap.state, id, key), true),
  undo: (id: FlagId) => setState(undo(snap.state, id), true),
  reset: () => setState(INITIAL_STATE, true),
}

export function useDemo(): Snapshot {
  return useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.get)
}
