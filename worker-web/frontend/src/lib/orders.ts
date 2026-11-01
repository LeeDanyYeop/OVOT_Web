import { useCallback, useEffect, useState } from 'react'

/**
 * 관제(admin.ovot.workers.dev)에서 보낸 작업 지시·도면 변경을 받아 확인한다.
 * 관제에서 현장 전달하면 바로 뜨도록 10초마다, 화면을 보고 있을 때만 읽는다.
 */
const BASE = 'https://admin.ovot.workers.dev'

export type Order = {
  id: string
  kind?: 'drawing' | 'order'
  block: string
  rev: string
  note: string
  guide: string
  by: string
  at: string
  relayAt?: string
  workerAckBy?: string
  workerAckAt?: string
}

const stamp = () => new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** 작업자에게 온 것: 담당자가 보낸 작업 지시, 또는 담당자가 현장에 전달한 도면 변경 — 아직 확인 안 한 것만 */
export function useOrders(): [Order[], (o: Order, by: string) => void] {
  const [items, setItems] = useState<Order[]>([])
  useEffect(() => {
    let alive = true
    const pull = () => {
      if (document.hidden) return
      fetch(`${BASE}/api/orders`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((raw: Record<string, unknown> | null) => {
          if (!alive || !raw) return
          const list = Object.values(raw).filter((v): v is Order => !!v && typeof v === 'object' && 'rev' in v)
          setItems(list.filter((o) => (o.kind === 'order' || o.relayAt) && !o.workerAckAt).sort((a, b) => a.id.localeCompare(b.id)))
        })
        .catch(() => {})
    }
    pull()
    const t = window.setInterval(pull, 10_000)
    const onVisible = () => !document.hidden && pull()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  const ack = useCallback((o: Order, by: string) => {
    const next = { ...o, workerAckBy: by, workerAckAt: stamp() }
    setItems((list) => list.filter((x) => x.id !== o.id))
    void fetch(`${BASE}/sync/drawings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [o.id]: next }) }).catch(() => {})
  }, [])
  return [items, ack]
}
