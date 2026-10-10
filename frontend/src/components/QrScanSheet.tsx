import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraAvailable, startQrScan } from '../scan/qr'
import { extractTagCode } from '../scan/tagCode'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

type ScanState = 'starting' | 'scanning' | 'found' | 'error'

/** Full-screen camera scanner (iOS Code Scanner style) for NFC-less phones. */
export function QrScanSheet({ onScan, onClose }: Props) {
  const [state, setState] = useState<ScanState>('starting')
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canUseCamera = cameraAvailable()

  const start = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    setState('starting')
    try {
      await startQrScan(
        videoRef.current!,
        (text) => {
          const code = extractTagCode(text)
          if (!code) {
            setState('error')
            setError('OVOT 구역 QR이 아닙니다')
            return
          }
          setState('found')
          try {
            navigator.vibrate?.(60)
          } catch {
            /* unsupported */
          }
          // Let the green frame register before the sheet closes.
          window.setTimeout(() => onScan(code), 350)
        },
        ctrl.signal,
      )
      if (!ctrl.signal.aborted) setState((s) => (s === 'starting' ? 'scanning' : s))
    } catch {
      setState('error')
      setError('카메라를 사용할 수 없습니다')
    }
  }, [onScan])

  // Opened by a tap, so the camera may start right away.
  useEffect(() => {
    if (canUseCamera) void start()
    return () => abortRef.current?.abort()
  }, [canUseCamera, start])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showFrame = canUseCamera && state !== 'error'

  return (
    <div className={`qr-full is-${canUseCamera ? state : 'error'}`} role="dialog" aria-modal="true" aria-label="QR로 등록">
      {canUseCamera && <video ref={videoRef} className="qr-video" muted playsInline />}

      <header className="qr-top">
        <span className="qr-title">QR로 등록</span>
        <button className="qr-close" onClick={onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {showFrame && (
        <div className="qr-frame" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}

      <div className="qr-bottom" aria-live="polite">
        {!canUseCamera ? (
          <>
            <p className="qr-msg">카메라를 쓸 수 없습니다</p>
            <p className="qr-sub">QR 스캔은 HTTPS로 접속했을 때만 가능합니다</p>
          </>
        ) : state === 'error' ? (
          <>
            <p className="qr-msg">{error}</p>
            <p className="qr-sub">
              {error === '카메라를 사용할 수 없습니다'
                ? '브라우저 설정에서 카메라 권한을 허용하세요'
                : '구역 입구의 OVOT QR을 비추세요'}
            </p>
            <button className="pill pill-white" onClick={() => void start()}>
              다시 시도
            </button>
          </>
        ) : state === 'found' ? (
          <p className="qr-msg">인식했습니다</p>
        ) : state === 'starting' ? (
          <p className="qr-sub">카메라를 켜는 중…</p>
        ) : (
          <p className="qr-msg">구역 입구의 QR 코드를 프레임 안에 맞추세요</p>
        )}
      </div>
    </div>
  )
}
