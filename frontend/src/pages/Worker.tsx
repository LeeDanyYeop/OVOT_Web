import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SegmentRecorder, voiceCaptureSupported, type VoiceClip } from '../capture/voiceCapture'
import { QrScanSheet } from '../components/QrScanSheet'
import { AssistInline } from '../components/AssistInline'
import { AssistSheet } from '../components/AssistSheet'
import { InstallBanner } from '../components/InstallBanner'
import { ProfileSheet } from '../components/ProfileSheet'
import { SpeakingAvatar } from '../components/SpeakingAvatar'
import { ApiError, api } from '../lib/api'
import { unlockAudio } from '../lib/audio'
import { useAssist } from '../lib/useAssist'
import { useAuth } from '../lib/auth'
import { cheerFor, currentHour, useSky } from '../lib/sky'
import { AUTO_STOP_TEXT, OFF_HINT, OFF_LABEL, offHoursReason, type OffReason } from '../lib/workHours'
import { NfcError, listenForTags, nfcPermissionGranted, nfcSupport } from '../scan/nfc'
import { extractTagCode } from '../scan/tagCode'
import type { CheckInSource } from '../types'

type NfcState = 'idle' | 'listening' | 'unsupported' | 'insecure' | 'error'
type Notice = { kind: 'ok' | 'info' | 'error'; text: string } | null

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
  // Full-screen 'not working hours' message after an off-hours tag or an automatic stop.
  const [offInfo, setOffInfo] = useState<{ reason: OffReason; autoStopped: boolean } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // 오봇: closed / full sheet / minimized to a floating mic (answers type out on the screen)
  // 오봇 answers show inline under the button; 'open' = full sheet for the figure / references
  const [assistMode, setAssistMode] = useState<'closed' | 'open'>('closed')
  const assist = useAssist(micStream)
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
    const off = offHoursReason(currentHour())
    if (off) {
      setOffInfo({ reason: off, autoStopped: false })
      return
    }
    if (!voiceCaptureSupported()) {
      setNotice({ kind: 'error', text: '이 기기에서는 스트리밍을 지원하지 않습니다' })
      return
    }
    const rec = new SegmentRecorder(
      (clip) => {
        queueRef.current.push(clip)
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

  useEffect(() => {
    if (!offInfo) return
    const t = window.setTimeout(() => setOffInfo(null), 8000)
    return () => window.clearTimeout(t)
  }, [offInfo])

  const { reset: resetAssist } = assist
  useEffect(() => {
    if (recording) return
    setAssistMode('closed')
    resetAssist()
  }, [recording, resetAssist])

  // The worker view is a single fixed screen: lock page scroll / iOS rubber-band while it is open.
  useEffect(() => {
    document.documentElement.classList.add('no-scroll')
    return () => document.documentElement.classList.remove('no-scroll')
  }, [])

  // Lunch and after-work: stop streaming automatically.
  useEffect(() => {
    if (!recording) return
    const check = () => {
      const off = offHoursReason(currentHour())
      if (!off) return
      stopRecording()
      setNotice(null)
      setOffInfo({ reason: off, autoStopped: true })
    }
    check()
    const t = window.setInterval(check, 30_000)
    return () => window.clearInterval(t)
  }, [recording, stopRecording])

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

  const sky = useSky()
  const offNow = offHoursReason(sky.hour)

  // The page canvas shows through any strip the OS leaves uncovered (iOS home-screen apps
  // leave one at the bottom). Paint it the colour of whatever is at the bottom of the screen.
  const canvasColor = sheetOpen ? '#000000' : profileOpen ? '#f5f5f7' : assistMode === 'open' ? '#ffffff' : sky.bottom
  useEffect(() => {
    const html = document.documentElement
    html.style.backgroundColor = canvasColor
    document.body.style.backgroundColor = canvasColor
  }, [canvasColor])
  useEffect(
    () => () => {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
    },
    [],
  )
  const needsTap = nfcState === 'idle' || nfcState === 'error'
  const noNfc = nfcState === 'unsupported' || nfcState === 'insecure'

  return (
    <div
      className={`w ${sky.night ? 'is-night' : ''}`}
      style={
        {
          '--sky-top': sky.top,
          '--sky-bottom': sky.bottom,
          '--glow': sky.glow,
          '--glow-x': `${sky.glowX}%`,
          '--glow-y': `${sky.glowY}%`,
        } as CSSProperties
      }
    >
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

      {!recording && <InstallBanner />}

      <main className={`w-stage ${recording && (assist.card || assist.talk !== 'idle' || assist.error) ? 'has-answer' : ''}`} aria-live="polite">
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
        ) : offInfo ? (
          <>
            <div className="off-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2.6" />
                <path d="M24 14v10l7 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="w-title">지금은 근무 시간이 아닙니다</h1>
            <p className="w-sub">
              {offInfo.autoStopped ? AUTO_STOP_TEXT[offInfo.reason] : `${OFF_LABEL[offInfo.reason]}에는 스트리밍이 꺼집니다`}
            </p>
            {zone && !offInfo.autoStopped && <p className="w-off-zone">위치는 {zone.name}(으)로 등록했어요</p>}
            <div className="w-actions">
              <button className="pill pill-light" onClick={() => setOffInfo(null)}>
                확인
              </button>
            </div>
          </>
        ) : recording ? (
          <>
            {zone && <p className="w-eyebrow">{zone.name}</p>}
            <SpeakingAvatar stream={micStream} photo={`/avatars/${me?.id ?? 'unknown'}.jpg`} name={me?.name ?? ''} />
            <h1 className="w-title">스트리밍 중</h1>
            <p className="w-timer" aria-label="스트리밍 시간">
              {mmss(now - recStartedAt)}
            </p>
            {assist.talk === 'idle' && !assist.card && !assist.error && (
              <p className="w-sub">구역을 옮길 때마다 해당 구역의 태그를 인식하세요</p>
            )}
            <div className="w-actions w-actions-stack">
              {/* push-to-talk: hold, speak, release (or tap, speak, tap again) */}
              <button
                className={`pill pill-dark pill-ask is-${assist.talk}`}
                {...assist.press}
                disabled={assist.talk === 'thinking'}
                aria-label="오봇에게 물어보기 · 누른 채 말하고 떼면 질문"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                {assist.talk === 'listening'
                  ? '듣고 있어요 · 떼면 질문'
                  : assist.talk === 'thinking'
                    ? '오봇이 확인 중…'
                    : '오봇에게 물어보기'}
              </button>
            </div>
            <AssistInline assist={assist} onExpand={() => setAssistMode('open')} />
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
                ? '아래 QR로 등록하세요'
                : needsTap
                  ? '가운데를 한 번 눌러 시작하세요'
                  : '휴대폰 뒷면을 구역 입구 태그에 대면 스트리밍이 시작됩니다'}
            </p>
            <p className="w-cheer">{cheerFor(sky.hour)}</p>
            {offNow && <p className="w-off">{OFF_HINT[offNow]}</p>}
          </>
        )}

        {notice && <p className={`w-notice is-${notice.kind}`}>{notice.text}</p>}
      </main>

      <footer className="w-foot">
        <button
          className={noNfc && !recording ? 'pill pill-dark' : 'w-link'}
          onClick={() => setSheetOpen(true)}
          disabled={busy}
        >
          {recording ? '다른 구역 QR로 등록' : noNfc ? 'QR로 등록' : '태그가 안 되나요? QR로 등록'}
        </button>
      </footer>

      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
      {recording && assistMode === 'open' && (
        <AssistSheet
          assist={assist}
          onClose={() => setAssistMode('closed')}
        />
      )}
      {sheetOpen && <QrScanSheet onScan={(c) => void submit(c, 'qr')} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
