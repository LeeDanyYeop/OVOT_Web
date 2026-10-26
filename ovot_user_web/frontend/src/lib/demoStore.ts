/**
 * B-03 DEMO 공유 상태 — 관리자 콘솔의 결정(decisions)을 읽고, 작업자의 수신 확인을 쓴다.
 * 서버(/api/demo/state)를 2초마다 조회한다. 오프라인이면 기기(localStorage)에 두었다가 연결되면 다시 보낸다.
 */
import { useSyncExternalStore } from 'react'
import { INITIAL_STATE, ACK_AT, type DemoState } from '../demo/b03'

export type Link = 'online' | 'offline'
interface Snap {
  state: DemoState
  link: Link
  /** 서버에 아직 못 보낸 수신 확인이 있는가 */
  pending: boolean
}

const KEY = 'ovot.demo.b03'
const API = '/api/demo/state'

function read(): { state: DemoState; pending: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { state: INITIAL_STATE, pending: false }
}

let snap: Snap = { ...read(), link: 'online' }
let rev = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function set(patch: Partial<Snap>) {
  snap = { ...snap, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify({ state: snap.state, pending: snap.pending }))
  } catch {
    /* ignore */
  }
  emit()
}

async function pull(): Promise<void> {
  try {
    const r = await fetch(API, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { rev: number; state: DemoState | null }
    rev = j.rev
    // 아직 못 보낸 확인이 있으면 서버 값 위에 얹어서 보존한다
    const base = j.state ?? INITIAL_STATE
    const next = snap.pending && !base.w106AckAt ? { ...base, w106AckAt: snap.state.w106AckAt } : base
    if (JSON.stringify(next) !== JSON.stringify(snap.state) || snap.link !== 'online') set({ state: next, link: 'online' })
  } catch {
    if (snap.link !== 'offline') set({ link: 'offline' })
  }
}

async function flush(): Promise<void> {
  if (!snap.pending) return
  try {
    await pull()
    if (!snap.state.w106AckAt) return
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: snap.state }) })
    if (!r.ok) throw new Error(String(r.status))
    rev = ((await r.json()) as { rev: number }).rev
    set({ pending: false, link: 'online' })
  } catch {
    if (snap.link !== 'offline') set({ link: 'offline' })
  }
}

let started = false
function start() {
  if (started) return
  started = true
  void pull().then(flush)
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return
    void (snap.pending ? flush() : pull())
  }, 2000)
  window.addEventListener('online', () => void flush())
}

export const demoStore = {
  subscribe(l: () => void) {
    start()
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => snap,
  /** '확인했습니다' — 오프라인이어도 기기에 먼저 저장하고, 연결되면 자동 전송 */
  ack() {
    if (snap.state.w106AckAt) return
    set({ state: { ...snap.state, w106AckAt: ACK_AT }, pending: true })
    void flush()
  },
  reset() {
    set({ state: INITIAL_STATE, pending: false })
  },
  revision: () => rev,
}

export const useDemoState = (): Snap => useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.get)
