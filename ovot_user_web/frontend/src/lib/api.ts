import type {
  CheckInResult,
  CheckInSource,
  LocationEvent,
  Me,
  MeResponse,
  TagAlert,
  TagInfo,
  VoiceClipInfo,
  AssistCard,
  AssistContext,
  AssistLogItem,
  WorkdayBrief,
  WorkdayHandover,
  WorkersLocations,
  ZonesState,
} from '../types'
import type { VoiceClip } from '../capture/voiceCapture'
import { getDeviceId } from './device'

export type View = 'worker' | 'admin'

/** The worker screen and the admin dashboard keep separate demo sessions, so both
 * can be open side by side in one browser. */
export const currentView = (): View => (location.pathname.startsWith('/admin') ? 'admin' : 'worker')

const tokenKey = () => `ovot.token.${currentView()}`

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(tokenKey())
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(tokenKey(), token)
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(tokenKey())
    } catch {
      /* storage unavailable */
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const TIMEOUT_MS = 15_000
// Cold starts on mobile data and the demo tunnel (≈3 s per request) often fail the first
// try, so idempotent requests are retried before an error is shown.
const RETRY_DELAYS_MS = [800, 2000, 4000]
// 502–504 come from the tunnel/proxy when the backend is briefly unreachable.
const GATEWAY_ERRORS = new Set([502, 503, 504])
export const NETWORK_MESSAGE =
  '서버에 연결할 수 없습니다. Wi-Fi 대신 모바일 데이터로 접속했는지, PC 서버와 터널이 켜져 있는지 확인하세요.'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchWithTimeout(path: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(path, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')

  // Check-in is not retried automatically: the worker sees the failure and taps again.
  const retryable = (init.method ?? 'GET') === 'GET' || path.startsWith('/api/demo/')
  let res: Response | null = null
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchWithTimeout(path, { ...init, headers }, timeoutMs)
      if (!GATEWAY_ERRORS.has(res.status)) break
    } catch {
      res = null
    }
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) break
    await sleep(RETRY_DELAYS_MS[attempt])
  }
  if (res === null || GATEWAY_ERRORS.has(res.status)) throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE)

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    const code = typeof detail === 'object' && detail?.code ? detail.code : `HTTP_${res.status}`
    const message =
      typeof detail === 'object' && detail?.message
        ? detail.message
        : res.status === 422
          ? '요청 형식이 올바르지 않습니다.'
          : `요청 처리 중 오류가 발생했습니다. (${res.status})`
    if (res.status === 401 && !path.startsWith('/api/demo/')) onUnauthorized?.()
    throw new ApiError(res.status, code, message)
  }
  return data as T
}

async function authedRaw(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetchWithTimeout(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE)
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
    throw new ApiError(res.status, `HTTP_${res.status}`, `요청 처리 중 오류가 발생했습니다. (${res.status})`)
  }
  return res
}

export const api = {
  login: (employee_number: string, password: string) =>
    request<{ token: string; worker: Me }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ employee_number, password }),
    }),
  demoSession: (view: View) =>
    request<{ token: string; worker: Me }>('/api/demo/session', { method: 'POST', body: JSON.stringify({ view }) }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  me: () => request<MeResponse>('/api/me'),
  checkIn: (tag_code: string, source: CheckInSource) =>
    request<CheckInResult>('/api/location/check-in', {
      method: 'POST',
      body: JSON.stringify({
        tag_code,
        source,
        client_time: new Date().toISOString(),
        device_id: getDeviceId(),
      }),
    }),
  history: (limit = 10) => request<{ items: LocationEvent[] }>(`/api/location/history?limit=${limit}`),
  adminWorkers: () => request<WorkersLocations>('/api/admin/workers/locations'),
  adminZones: () => request<ZonesState>('/api/admin/zones/state'),
  adminEvents: (limit = 50) => request<{ items: LocationEvent[] }>(`/api/admin/location/events?limit=${limit}`),
  adminTagAlerts: (limit = 20) => request<{ items: TagAlert[] }>(`/api/admin/tag-alerts?limit=${limit}`),
  uploadClip: async (clip: VoiceClip) => {
    const q = new URLSearchParams({ duration_ms: String(Math.round(clip.durationMs)), started_at: clip.startedAt })
    if (clip.context) q.set('location_event_id', clip.context)
    const res = await authedRaw(`/api/voice/clips?${q}`, {
      method: 'POST',
      body: clip.blob,
      headers: { 'Content-Type': clip.mimeType },
    })
    return (await res.json()) as VoiceClipInfo
  },
  adminVoiceClips: (limit = 10) => request<{ items: VoiceClipInfo[] }>(`/api/admin/voice/clips?limit=${limit}`),
  adminClipAudio: async (clipId: string) => (await authedRaw(`/api/admin/voice/clips/${clipId}/audio`, {})).blob(),
  assistContext: () => request<AssistContext>('/api/assist/context'),
  assistQuick: (kind: 'next' | 'tools' | 'cautions') =>
    request<AssistCard>('/api/assist/quick', { method: 'POST', body: JSON.stringify({ kind }) }),
  assistAsk: async (audio: Blob, durationMs: number) => {
    const res = await authedRaw(`/api/assist/ask?duration_ms=${Math.round(durationMs)}`, {
      method: 'POST',
      body: audio,
      headers: { 'Content-Type': audio.type || 'audio/wav' },
    })
    return (await res.json()) as AssistCard
  },
  assistEscalate: (logId: number) =>
    request<{ ok: boolean; owner: string | null }>(`/api/assist/${logId}/escalate`, { method: 'POST' }),
  adminAssist: (limit = 20) => request<{ items: AssistLogItem[] }>(`/api/admin/assist?limit=${limit}`),
  startHandover: () => request<WorkdayHandover>('/api/workday/handover', {}, 30_000),
  endWorkday: () => request<WorkdayBrief>('/api/workday/end', { method: 'POST' }, 45_000),
  adminTags: () => request<{ items: TagInfo[] }>('/api/admin/tags'),
}
