/**
 * 주기적 조회 훅.
 *  - 이전 요청이 늦게 도착해도 최신 요청 결과만 반영한다 (요청 순번 비교 + 이전 요청 취소).
 *  - 실패 시 마지막 성공 데이터는 유지하되 '오래된 데이터'로 표시할 수 있게 상태를 분리한다.
 *  - 실패가 이어지면 조회 간격을 늘려 재시도한다 (최대 60초).
 *  - 서버가 실시간 푸시를 제공하게 되면 이 훅만 교체하면 된다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataSource } from './source'
import type { Snapshot } from '../types'

export type SyncStatus = 'loading' | 'ok' | 'error'

export interface SyncState {
  snapshot: Snapshot | null
  status: SyncStatus
  error: string | null
  lastSuccessAt: number | null
  lastAttemptAt: number | null
  consecutiveFailures: number
  inFlight: boolean
}

export function useOvotData(source: DataSource, intervalMs: number) {
  const [state, setState] = useState<SyncState>({
    snapshot: null,
    status: 'loading',
    error: null,
    lastSuccessAt: null,
    lastAttemptAt: null,
    consecutiveFailures: 0,
    inFlight: false,
  })
  const seq = useRef(0)
  const inflight = useRef<AbortController | null>(null)
  const timer = useRef<number | null>(null)
  const failures = useRef(0)
  const alive = useRef(true)

  const schedule = useCallback(
    (run: () => void) => {
      if (timer.current) window.clearTimeout(timer.current)
      const delay = failures.current ? Math.min(intervalMs * 2 ** Math.min(failures.current, 3), 60000) : intervalMs
      timer.current = window.setTimeout(run, delay)
    },
    [intervalMs],
  )

  const refresh = useCallback(async (): Promise<boolean> => {
    const my = ++seq.current
    inflight.current?.abort()
    const ctrl = new AbortController()
    inflight.current = ctrl
    setState((s) => ({ ...s, inFlight: true, lastAttemptAt: Date.now() }))
    try {
      const snap = await source.fetchSnapshot(ctrl.signal)
      if (!alive.current || my !== seq.current) return false // 더 최신 요청이 있으면 버린다
      failures.current = 0
      setState({
        snapshot: snap,
        status: 'ok',
        error: null,
        lastSuccessAt: snap.receivedAt,
        lastAttemptAt: Date.now(),
        consecutiveFailures: 0,
        inFlight: false,
      })
      return true
    } catch (e) {
      if (!alive.current || my !== seq.current) return false
      failures.current += 1
      setState((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        consecutiveFailures: failures.current,
        inFlight: false,
      }))
      return false
    }
  }, [source])

  useEffect(() => {
    alive.current = true
    failures.current = 0
    setState({ snapshot: null, status: 'loading', error: null, lastSuccessAt: null, lastAttemptAt: null, consecutiveFailures: 0, inFlight: false })
    const loop = async () => {
      await refresh()
      if (alive.current) schedule(loop)
    }
    loop()
    return () => {
      alive.current = false
      seq.current++
      inflight.current?.abort()
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [refresh, schedule])

  /** 서버 쓰기 → 성공 시에만 재조회. 실패는 호출한 쪽으로 그대로 던진다. */
  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      const result = await fn()
      await refresh()
      return result
    },
    [refresh],
  )

  return { ...state, refresh, mutate }
}
