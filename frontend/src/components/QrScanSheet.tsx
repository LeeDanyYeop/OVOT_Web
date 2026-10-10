import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraAvailable, startQrScan } from '../scan/qr'
import { extractTagCode } from '../scan/tagCode'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

/** Fallback for iPhone / NFC-less phones: scan the zone's QR code with the camera. */
export function QrScanSheet({ onScan, onClose }: Props) {
  const [state, setState] = useState<'starting' | 'scanning' | 'error'>('starting')
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
          if (code) {
            onScan(code)
          } else {
            setState('error')
            setError('OVOT 태그 QR이 아닙니다. 구역 입구의 QR을 비추세요.')
          }
        },
        ctrl.signal,
      )
      if (!ctrl.signal.aborted) setState('scanning')
    } catch {
      setState('error')
      setError('카메라를 사용할 수 없습니다. 브라우저에서 카메라 권한을 허용하세요.')
    }
  }, [onScan])

  // The sheet is opened by a tap, so the camera can start right away.
  useEffect(() => {
    if (canUseCamera) void start()
    return () => abortRef.current?.abort()
  }, [canUseCamera, start])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="sheet-title">QR로 등록</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            닫기
          </button>
        </div>

        {canUseCamera ? (
          <section className="stack">
            <div className={`qr-view ${state === 'scanning' ? 'on' : ''}`}>
              <video ref={videoRef} muted playsInline />
              {state !== 'scanning' && (
                <p className="qr-placeholder">{state === 'starting' ? '카메라를 켜는 중…' : '구역 입구의 OVOT QR 코드를 비추세요'}</p>
              )}
            </div>
            {state === 'scanning' && <p className="muted qr-hint">구역 입구의 OVOT QR 코드를 화면 안에 맞추세요</p>}
            {error && (
              <>
                <p className="alert alert-error" role="alert">
                  {error}
                </p>
                <button className="btn btn-secondary btn-lg" onClick={() => void start()}>
                  다시 시도
                </button>
              </>
            )}
          </section>
        ) : (
          <p className="alert alert-info">QR 스캔은 HTTPS로 접속했을 때만 카메라를 쓸 수 있습니다.</p>
        )}
      </div>
    </div>
  )
}
