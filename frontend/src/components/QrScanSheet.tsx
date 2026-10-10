import { useEffect, useRef, useState } from 'react'
import { cameraAvailable, startQrScan } from '../scan/qr'
import { extractTagCode } from '../scan/tagCode'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

/** Fallback for iPhone / NFC-less devices: scan the zone's QR code with the camera. */
export function QrScanSheet({ onScan, onClose }: Props) {
  const [state, setState] = useState<'scanning' | 'error'>('scanning')
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canUseCamera = cameraAvailable()

  const start = async () => {
    if (!videoRef.current) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    setState('scanning')
    try {
      await startQrScan(
        videoRef.current,
        (text) => {
          const found = extractTagCode(text)
          if (found) {
            onScan(found)
          } else {
            setState('error')
            setError('OVOT 구역 QR이 아닙니다. 구역 입구의 QR을 비추세요.')
          }
        },
        ctrl.signal,
      )
    } catch {
      setState('error')
      setError('카메라를 사용할 수 없습니다. 카메라 권한을 허용해 주세요.')
    }
  }

  useEffect(() => {
    // Opened from a tap, so the camera can start right away.
    if (canUseCamera) void start()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              {state !== 'scanning' && <p className="qr-placeholder">구역 입구의 OVOT QR 코드를 비추세요</p>}
            </div>
            {error ? (
              <>
                <p className="alert alert-error" role="alert">
                  {error}
                </p>
                <button className="btn btn-secondary btn-lg" onClick={() => void start()}>
                  다시 스캔
                </button>
              </>
            ) : (
              <p className="muted" style={{ textAlign: 'center' }}>
                구역 입구의 QR 코드를 화면 가운데에 맞추세요
              </p>
            )}
          </section>
        ) : (
          <p className="alert alert-info">이 기기에서는 카메라를 사용할 수 없습니다.</p>
        )}
      </div>
    </div>
  )
}
