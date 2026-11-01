import { useEffect, useState } from 'react'

/**
 * 관제(admin.ovot.workers.dev)와 공유하는 시연 흐름 상태.
 * 현장 담당자가 관제에 남긴 현장 지시 기록을 인수인계에 띄우고, 작업자의 확인·완료 보고를 되돌려 보낸다.
 */
const FLOW_API = 'https://admin.ovot.workers.dev/sync/flow'

export interface FlowState {
  instructedAt?: string | null
  instructedBy?: string
  workerAckAt?: string | null
  workerReport?: { at: string; text: string } | null
  w2Check?: { at: string; by: string; result: 'missing' | 'done' } | null
  reworkAckAt?: string | null
  updatedAt?: number
}

export const clock = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

/** 관제 쪽 시연 흐름 상태를 화면을 열 때 한 번 가져온다 (관제 시나리오를 걷어내서 반복 확인은 하지 않는다 —
 * Cloudflare 무료 Durable Objects 요청 한도 보호). 연결이 안 되면 null. */
export function useFlow(): [FlowState | null, (p: Partial<FlowState>) => void] {
  const [flow, setFlow] = useState<FlowState | null>(null)
  useEffect(() => {
    let alive = true
    const pull = () =>
      fetch(FLOW_API, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((f: FlowState | null) => alive && f && setFlow(f))
        .catch(() => {})
    void pull()
    return () => {
      alive = false
    }
  }, [])
  return [flow, (p) => setFlow((f) => ({ ...(f ?? {}), ...p }))]
}

/** 필드만 합쳐서 올리고(작업 이력 한 줄 추가), 반영된 상태를 돌려준다 */
export async function patchFlow(fields: Partial<FlowState>, logText: string): Promise<FlowState | null> {
  try {
    const r = await fetch(FLOW_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, log: [{ at: clock(), actor: 'worker', text: logText }] }),
    })
    return r.ok ? ((await r.json()) as FlowState) : null
  } catch {
    return null
  }
}
