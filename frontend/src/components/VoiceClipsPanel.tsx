import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { hhmmss } from '../lib/format'
import type { VoiceClipInfo } from '../types'

function seconds(ms: number | null) {
  return ms == null ? '' : `${Math.round(ms / 1000)}초`
}

/** Latest field recordings. Audio is fetched with the admin token, then played locally. */
export function VoiceClipsPanel({ clips }: { clips: VoiceClipInfo[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls])

  const load = async (id: string) => {
    setLoading(id)
    try {
      const blob = await api.adminClipAudio(id)
      setUrls((prev) => ({ ...prev, [id]: URL.createObjectURL(blob) }))
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="panel" aria-labelledby="voice-h">
      <h2 id="voice-h">최근 음성 기록</h2>
      {clips.length === 0 ? (
        <p className="muted empty">기록 없음</p>
      ) : (
        <ul className="clip-list">
          {clips.slice(0, 6).map((c) => (
            <li key={c.clip_id}>
              <div>
                <strong>
                  {c.worker.name} <span className="muted">· {c.zone?.name ?? '위치 미상'}</span>
                </strong>
                <span className="muted">
                  {hhmmss(c.received_at)} · {seconds(c.duration_ms)} · {c.clip_id}
                </span>
                {urls[c.clip_id] && <audio controls autoPlay src={urls[c.clip_id]} />}
              </div>
              {!urls[c.clip_id] && (
                <button className="btn btn-secondary btn-sm" disabled={loading === c.clip_id} onClick={() => void load(c.clip_id)}>
                  {loading === c.clip_id ? '…' : '재생'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
