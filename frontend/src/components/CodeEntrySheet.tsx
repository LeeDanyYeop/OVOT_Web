import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cameraAvailable, startQrScan } from '../scan/qr'
import { DEMO_TAGS, extractTagCode } from '../scan/tagCode'
import type { CheckInSource } from '../types'

interface Props {
  onSubmit: (code: string, source: CheckInSource) => void
  onClose: () => void
}

/** Fallback for iPhone / NFC-less devices: camera QR scan or typed tag code. */
export function CodeEntrySheet({ onSubmit, onClose }: Props) {
  const [code, setCode] = useState('')
  const [qrState, setQrState] = useState<'idle' | 'scanning' | 'error'>('idle')
  const [qrError, setQrError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canUseCamera = cameraAvailable()

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startCamera = async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setQrError(null)
    setQrState('scanning')
    try {
      await startQrScan(
        videoRef.current!,
        (text) => {
          const found = extractTagCode(text)
          if (found) {
            onSubmit(found, 'qr')
          } else {
            setQrState('error')
            setQrError('OVOT 태그 QR이 아닙니다. 구역 입구의 QR을 비추세요.')
          }
        },
        ctrl.signal,
      )
    } catch {
      setQrState('error')
      setQrError('카메라를 사용할 수 없습니다. 권한을 허용하거나 아래에 코드를 입력하세요.')
    }
  }

  const submitManual = (e: FormEvent) => {
    e.preventDefault()
    const normalized = code.trim().toUpperCase()
    if (!normalized) {
      setFormError('태그 코드를 입력하세요.')
      return
    }
    onSubmit(normalized, 'manual')
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="sheet-title">QR 또는 코드로 등록</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <section className="stack">
          {canUseCamera ? (
            <>
              <div className={`qr-view ${qrState === 'scanning' ? 'on' : ''}`}>
                <video ref={videoRef} muted playsInline />
                {qrState !== 'scanning' && <p className="qr-placeholder">구역 입구의 OVOT QR 코드를 비추세요</p>}
              </div>
              <button className="btn btn-secondary btn-lg" onClick={startCamera} disabled={qrState === 'scanning'}>
                {qrState === 'scanning' ? 'QR 인식 중…' : '카메라로 QR 스캔'}
              </button>
              {qrError && (
                <p className="alert alert-error" role="alert">
                  {qrError}
                </p>
              )}
            </>
          ) : (
            <p className="alert alert-info">카메라 QR 스캔은 HTTPS 접속에서만 가능합니다. 아래에 태그 코드를 입력하세요.</p>
          )}
        </section>

        <form className="stack" onSubmit={submitManual}>
          <label className="field">
            <span>태그 코드 직접 입력</span>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setFormError(null)
              }}
              placeholder="OVOT-ZONE-A-001"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {formError && <p className="field-error">{formError}</p>}
          <button className="btn btn-primary btn-lg">이 코드로 등록</button>
        </form>

        <section className="demo-tags" aria-label="시연용 태그">
          <h3>시연용 빠른 입력</h3>
          <div className="chip-row">
            {DEMO_TAGS.map((t) => (
              <button key={t.code} type="button" className="chip" onClick={() => onSubmit(t.code, 'manual')}>
                <strong>{t.label}</strong>
                <span>{t.code}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
