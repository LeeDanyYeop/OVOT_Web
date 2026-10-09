import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SegmentRecorder, voiceCaptureSupported, type VoiceClip } from '../capture/voiceCapture'
import { CodeEntrySheet } from '../components/CodeEntrySheet'
import { InstallBanner } from '../components/InstallBanner'
import { ProfileSheet } from '../components/ProfileSheet'
import { SpeakingAvatar } from '../components/SpeakingAvatar'
import { ApiError, api } from '../lib/api'
import { unlockAudio } from '../lib/audio'
import { useAuth } from '../lib/auth'
import { NfcError, listenForTags, nfcPermissionGranted, nfcSupport } from '../scan/nfc'
import { extractTagCode } from '../scan/tagCode'
import type { CheckInSource } from '../types'

type NfcState = 'idle' | 'listening' | 'unsupported' | 'insecure' | 'error'
type Notice = { kind: 'ok' | 'error'; text: string } | null

const ERROR_TEXT: Record<string, string> = {
  UNKNOWN_TAG: '등록되지 않은 태그입니다',
  INACTIVE_TAG: '사용 중지된 태그입니다',
  INACTIVE_ZONE: '운영 중지된 구역입니다',
  INVALID_FORMAT: '태그 코드가 올바르지 않습니다',
}
const SAME_TAG_IGNORE_MS = 3000
const UPLOAD_RETRY_MS = 15_000
// Audio is sent in short segments so the admin side receives it almost live.
const STREAM_SEGMENT_MS = 10_000

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Field screen: tag NFC → location registered → voice recording runs. Nothing else. */
export function WorkerPage() {
  const { me } = useAuth()
  const [nfcState, setNfcState] = useState<NfcState>(() => {
    const support = nfcSupport()
    return support === 'supported' ? 'idle' : support
  })
  const [zone, setZone] = useState<{ name: string; at: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [recStartedAt, setRecStartedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [pendingUploads, setPendingUploads] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [params, setParams] = useSearchParams()

  const nfcAbort = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const lastRead = useRef<{ code: string; at: number } | null>(null)
  const eventIdRef = useRef<string | undefined>(undefined)
  const recorderRef = useRef<SegmentRecorder | null>(null)
  const queueRef = useRef<VoiceClip[]>([])
  const flushingRef = useRef(false)
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)

  const pendingTag = extractTagCode(params.get('tag') ?? '')
  const pendingSource: CheckInSource = params.get('src') === 'nfc' ? 'nfc' : 'qr'

  // ---- uploads: serial, retried until the server accepts them ----
  const flush = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    try {
      while (queueRef.current.length) {
        try {
          await api.uploadClip(queueRef.current[0])
          queueRef.current.shift()
        } catch {
          break
        }
      }
    } finally {
      flushingRef.current = false
      setPendingUploads(queueRef.current.length)
    }
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => queueRef.current.length && void flush(), UPLOAD_RETRY_MS)
    window.addEventListener('online', flush)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('online', flush)
    }
  }, [flush])

  // ---- recording ----
  const startRecording = useCallback(async () => {
    if (recorderRef.current?.active) return
    if (!voiceCaptureSupported()) {
      setNotice({ kind: 'error', text: '이 기기에서는 스트리밍을 지원하지 않습니다' })
      return
    }
    const rec = new SegmentRecorder(
      (clip) => {
        queueRef.current.push(clip)
        setPendingUploads(queueRef.current.length)
        void flush()
      },
      () => eventIdRef.current,
      STREAM_SEGMENT_MS,
    )
    try {
      await rec.start()
    } catch {
      setNotice({ kind: 'error', text: '마이크를 허용해야 스트리밍이 시작됩니다' })
      return
    }
    recorderRef.current = rec
    setMicStream(rec.mediaStream)
    setRecStartedAt(Date.now())
    setRecording(true)
    try {
      wakeLockRef.current = await (navigator as unknown as {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
      }).wakeLock?.request('screen') ?? null
    } catch {
      /* screen may dim; recording continues while the app is open */
    }
  }, [flush])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setMicStream(null)
    setRecording(false)
    void wakeLockRef.current?.release().catch(() => undefined)
    wakeLockRef.current = null
    setNotice(null)
  }, [])

  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [recording])

  // ---- check-in ----
  const submit = useCallback(
    async (code: string, source: CheckInSource) => {
      if (busyRef.current) return
      busyRef.current = true
      setSheetOpen(false)
      setBusy(true)
      try {
        const r = await api.checkIn(code, source)
        eventIdRef.current = r.event_id
        setZone({ name: r.zone_name, at: r.checked_in_at })
        vibrate(r.status === 'duplicate' ? 60 : [80, 40, 80])
        setNotice(null)
        if (recorderRef.current?.active) {
          // New zone: close the running clip so it stays attributed to the previous one.
          if (r.status !== 'duplicate') recorderRef.current.cut()
        } else {
          await startRecording()
        }
      } catch (err) {
        vibrate([200, 80, 200])
        const e = err instanceof ApiError ? err : null
        setNotice({ kind: 'error', text: (e && ERROR_TEXT[e.code]) ?? e?.message ?? '위치 등록에 실패했습니다' })
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [startRecording],
  )

  const startNfc = useCallback(async () => {
    nfcAbort.current?.abort()
    const ctrl = new AbortController()
    nfcAbort.current = ctrl
    try {
      await listenForTags(
        ctrl.signal,
        (code) => {
          const t = Date.now()
          const last = lastRead.current
          if (last && last.code === code && t - last.at < SAME_TAG_IGNORE_MS) return
          lastRead.current = { code, at: t }
          void submit(code, 'nfc')
        },
        (err) => {
          vibrate([200, 80, 200])
          setNotice({ kind: 'error', text: err.message })
        },
      )
      setNfcState('listening')
    } catch (err) {
      if (err instanceof NfcError && err.kind === 'aborted') return
      setNfcState('error')
      setNotice({ kind: 'error', text: (err as Error).message })
    }
  }, [submit])

  useEffect(() => {
    if (nfcSupport() === 'supported') {
      void nfcPermissionGranted().then((granted) => granted && void startNfc())
    }
    return () => {
      nfcAbort.current?.abort()
      recorderRef.current?.stop()
    }
  }, [startNfc])

  const clearPending = () => {
    params.delete('tag')
    params.delete('src')
    setParams(params, { replace: true })
  }

  const needsTap = nfcState === 'idle' || nfcState === 'error'
  const noNfc = nfcState === 'unsupported' || nfcState === 'insecure'

  return (
    <div className="w">
      <header className="w-head">
        <img className="w-logo" src="/logo.png" alt="OVOT" width={104} height={36} />
        {me && (
          <button className="w-who" onClick={() => setProfileOpen(true)} aria-label={`${me.name} 프로필 보기`}>
            {me.name} · {me.team}
            <span aria-hidden="true" className="w-who-chev">
              ›
            </span>
          </button>
        )}
      </header>

      <InstallBanner />

      <main className="w-stage" aria-live="polite">
        {pendingTag ? (
          <>
            <h1 className="w-title">위치를 등록할까요?</h1>
            <p className="w-sub mono">{pendingTag}</p>
            <div className="w-actions">
              <button
                className="pill pill-dark"
                disabled={busy}
                onClick={() => {
                  clearPending()
                  void submit(pendingTag, pendingSource)
                }}
              >
                등록
              </button>
              <button className="pill pill-light" onClick={clearPending}>
                취소
              </button>
            </div>
          </>
        ) : recording ? (
          <>
            <SpeakingAvatar stream={micStream} photo={`/avatars/${me?.id ?? 'unknown'}.jpg`} name={me?.name ?? ''} />
            {zone && <p className="w-eyebrow">{zone.name}</p>}
            <h1 className="w-title">스트리밍 중</h1>
            <p className="w-timer" aria-label="스트리밍 시간">
              {mmss(now - recStartedAt)}
            </p>
            <p className="w-sub">구역을 옮기면 새 구역의 태그만 대세요</p>
            <div className="w-actions">
              <button className="pill pill-light" onClick={stopRecording}>
                스트리밍 종료
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`nfc-orb ${nfcState === 'listening' ? 'is-listening' : ''} ${busy ? 'is-busy' : ''}`}
              onClick={
                needsTap
                  ? () => {
                      unlockAudio()
                      void startNfc()
                    }
                  : undefined
              }
              disabled={!needsTap}
              aria-label={needsTap ? 'NFC 스캔 시작' : 'NFC 태그 대기 중'}
            >
              <img className="nfc-mark" src="/nfc-mark.png" alt="" width={96} height={96} />
            </button>
            <h1 className="w-title">{busy ? '등록 중…' : noNfc ? 'NFC를 쓸 수 없는 기기입니다' : 'NFC 태그를 대세요'}</h1>
            <p className="w-sub">
              {noNfc
                ? '아래 코드 입력으로 등록하세요'
                : needsTap
                  ? '가운데를 한 번 눌러 시작하세요'
                  : '휴대폰 뒷면을 구역 입구 태그에 대면 스트리밍이 시작됩니다'}
            </p>
          </>
        )}

        {notice && <p className={`w-notice ${notice.kind === 'error' ? 'is-error' : ''}`}>{notice.text}</p>}
        {pendingUploads > 0 && <p className="w-quiet">업로드 대기 {pendingUploads}건 · 연결되면 자동 전송</p>}
      </main>

      <footer className="w-foot">
        <button className={noNfc ? 'pill pill-dark' : 'w-link'} onClick={() => setSheetOpen(true)} disabled={busy}>
          {noNfc ? '코드로 등록' : '태그가 안 되나요? 코드로 등록'}
        </button>
      </footer>

      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
      {sheetOpen && <CodeEntrySheet onSubmit={(c, s) => void submit(c, s)} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
