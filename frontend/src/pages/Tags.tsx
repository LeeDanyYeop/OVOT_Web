import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { ApiError, api } from '../lib/api'
import { NfcError, nfcSupport, writeTag } from '../scan/nfc'
import { tagUrl } from '../scan/tagCode'
import type { TagInfo } from '../types'

/** Setup page: print zone QR codes and write NFC tags from an Android phone. */
export function TagsPage() {
  const [tags, setTags] = useState<TagInfo[]>([])
  const [qr, setQr] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState<string | null>(null)
  const [writeMsg, setWriteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const origin = window.location.origin
  const canWrite = nfcSupport() === 'supported'

  useEffect(() => {
    api
      .adminTags()
      .then(async (r) => {
        setTags(r.items)
        const entries = await Promise.all(
          r.items.map(async (t) => [t.id, await QRCode.toDataURL(tagUrl(origin, t.tag_code, 'qr'), { margin: 1, width: 240 })]),
        )
        setQr(Object.fromEntries(entries))
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : '태그 목록을 불러오지 못했습니다.'))
    return () => abortRef.current?.abort()
  }, [origin])

  const write = async (t: TagInfo) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setWriting(t.id)
    setWriteMsg(null)
    try {
      await writeTag(tagUrl(origin, t.tag_code, 'nfc'), t.tag_code, ctrl.signal)
      setWriteMsg({ ok: true, text: `${t.tag_code} 기록 완료` })
    } catch (err) {
      if (!(err instanceof NfcError && err.kind === 'aborted')) setWriteMsg({ ok: false, text: (err as Error).message })
    } finally {
      setWriting(null)
    }
  }

  return (
    <div className="admin-page">
      <header className="topbar admin-topbar no-print">
        <Brand subtitle="NFC·QR 태그 관리" />
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            QR 인쇄
          </button>
          <Link className="btn btn-ghost btn-sm" to="/admin">
            관제로 돌아가기
          </Link>
        </div>
      </header>
      <main className="admin-main">
        <p className="alert alert-info no-print">
          태그에는 개인정보 없이 구역 코드만 기록됩니다. 일반 NFC 태그는 복제가 가능하므로 이 구성은 해커톤 시연용이며, 운영
          시에는 동적 보안 태그(예: NTAG 424 DNA) 또는 고정형 사원증 리더기로 교체합니다.
        </p>
        {!canWrite && (
          <p className="muted no-print">NFC 태그 기록은 HTTPS로 접속한 Android Chrome에서만 가능합니다.</p>
        )}
        {error && <p className="alert alert-error">{error}</p>}
        {writeMsg && <p className={`alert ${writeMsg.ok ? 'alert-success' : 'alert-error'} no-print`}>{writeMsg.text}</p>}
        <div className="tag-grid">
          {tags.map((t) => (
            <article key={t.id} className={`tag-card ${t.is_active ? '' : 'inactive'}`}>
              {qr[t.id] && <img src={qr[t.id]} alt={`${t.tag_code} QR 코드`} width={180} height={180} />}
              <div className="tag-info">
                <strong>{t.zone.name}</strong>
                <code>{t.tag_code}</code>
                <span className="muted">{t.label}</span>
                {!t.is_active && <span className="badge badge-danger">사용 중지</span>}
              </div>
              {canWrite && t.is_active && (
                <button className="btn btn-secondary btn-sm no-print" disabled={!!writing} onClick={() => write(t)}>
                  {writing === t.id ? '태그에 휴대폰을 대세요…' : 'NFC 태그에 기록'}
                </button>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
