/**
 * OVOT-Backend HTTP 클라이언트.
 * 서버 공통 에러 형식 { error, status_code, message, details? } 을 그대로 해석한다.
 */

export class ApiError extends Error {
  readonly status: number
  readonly kind: 'network' | 'timeout' | 'http' | 'parse'
  readonly details?: unknown

  constructor(kind: ApiError['kind'], status: number, message: string, details?: unknown) {
    super(message)
    this.kind = kind
    this.status = status
    this.details = details
  }
}

export interface HttpOptions {
  baseUrl: string
  timeoutMs: number
}

export async function request<T>(
  opts: HttpOptions,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  init?: { query?: Record<string, string | number | undefined | null>; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const url = new URL(opts.baseUrl + path)
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs)
  const onOuterAbort = () => ctrl.abort('cancelled')
  init?.signal?.addEventListener('abort', onOuterAbort)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    })
  } catch (e) {
    if (ctrl.signal.aborted && ctrl.signal.reason === 'timeout') {
      throw new ApiError('timeout', 0, `응답 시간 초과 (${Math.round(opts.timeoutMs / 1000)}초)`)
    }
    if (ctrl.signal.aborted) throw new ApiError('network', 0, '요청이 취소되었습니다.')
    throw new ApiError('network', 0, `서버에 연결할 수 없습니다 (${opts.baseUrl})`, e)
  } finally {
    window.clearTimeout(timer)
    init?.signal?.removeEventListener('abort', onOuterAbort)
  }

  let body: unknown = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      if (res.ok) throw new ApiError('parse', res.status, '서버 응답 형식을 해석할 수 없습니다.')
    }
  }

  if (!res.ok) {
    const b = body as { message?: string; detail?: string; details?: unknown } | null
    throw new ApiError('http', res.status, b?.message ?? b?.detail ?? `요청 실패 (HTTP ${res.status})`, b?.details ?? b)
  }
  return body as T
}
