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

const UI_KEY = 'ovot-b03-ui'
const STATE_KEY = 'ovot-b03-state'
const API = '/api/demo/state'

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

let rev = 0
let pushing = Promise.resolve()

function setState(next: DemoState, push: boolean) {
  snap = { ...snap, state: next }
  writeJson(STATE_KEY, next)
  emit()
  if (push) pushing = pushing.then(() => pushRemote(next))
}

async function pushRemote(state: DemoState) {
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) })
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { rev: number }
    rev = j.rev
    if (snap.sync !== 'server') set({ sync: 'server' })
  } catch {
    if (snap.sync !== 'local') set({ sync: 'local' })
  }
}

async function pullRemote() {
  try {
    const r = await fetch(API, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { rev: number; state: DemoState | null }
    if (snap.sync !== 'server') set({ sync: 'server' })
    if (j.rev > rev) {
      rev = j.rev
      if (j.state && JSON.stringify(j.state) !== JSON.stringify(snap.state)) setState(j.state, false)
    }
  } catch {
    if (snap.sync !== 'local') set({ sync: 'local' })
  }
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
  void pullRemote()
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void pullRemote()
  }, 2000)
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
