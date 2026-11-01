import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, NETWORK_MESSAGE, api, currentView, setUnauthorizedHandler, tokenStore } from './api'
import type { Me } from '../types'

type Status = 'loading' | 'login' | 'authed' | 'error'

interface AuthValue {
  status: Status
  me: Me | null
  error: string | null
  retry: () => void
  login: (workerId: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Demo mode. Reuse the stored session for this view. Without one, the worker view shows the
 * login screen (pick 현장 작업자 / 중공업 현장 담당자); the admin view still logs in automatically. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const inflight = useRef<Promise<void> | null>(null)

  const ensureSession = useCallback(() => {
    if (inflight.current) return inflight.current
    const run = async () => {
      setStatus('loading')
      try {
        if (tokenStore.get()) {
          try {
            setMe((await api.me()).worker)
            setStatus('authed')
            return
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 401)) throw err
            tokenStore.clear()
          }
        }
        if (currentView() === 'worker') {
          setMe(null)
          setStatus('login')
          return
        }
        const res = await api.demoSession(currentView())
        tokenStore.set(res.token)
        setMe(res.worker)
        setStatus('authed')
        setError(null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : NETWORK_MESSAGE)
        setStatus('error')
      }
    }
    inflight.current = run().finally(() => {
      inflight.current = null
    })
    return inflight.current
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear()
      void ensureSession()
    })
    void ensureSession()
  }, [ensureSession])

  // Reconnect on its own when the phone regains network or the app returns to the foreground.
  useEffect(() => {
    if (status !== 'error') return
    const retryNow = () => void ensureSession()
    const onVisible = () => document.visibilityState === 'visible' && retryNow()
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(retryNow, 10_000)
    return () => {
      window.removeEventListener('online', retryNow)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [status, ensureSession])

  const retry = useCallback(() => void ensureSession(), [ensureSession])
  const login = useCallback(async (workerId: string) => {
    const res = await api.demoSession(currentView(), workerId)
    tokenStore.set(res.token)
    setMe(res.worker)
    setError(null)
    setStatus('authed')
  }, [])
  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    tokenStore.clear()
    setMe(null)
    setStatus('login')
  }, [])
  const value = useMemo(() => ({ status, me, error, retry, login, logout }), [status, me, error, retry, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
