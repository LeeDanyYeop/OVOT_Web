import { hhmm } from '../lib/format'
import type { AssistLogItem } from '../types'

/** Admin view of '오봇에게 물어보기' questions; supervisor requests stand out. */
export function AssistPanel({ items }: { items: AssistLogItem[] }) {
  const pending = items.filter((i) => i.escalated).length
  return (
    <section className="panel" aria-labelledby="assist-h">
      <h2 id="assist-h">
        현장 질문 {pending > 0 && <span className="badge badge-danger">확인 요청 {pending}</span>}
      </h2>
      {items.length === 0 ? (
        <p className="muted empty">질문 없음</p>
      ) : (
        <ul className="assist-log">
          {items.slice(0, 6).map((a) => (
            <li key={a.id} className={a.escalated ? 'is-escalated' : ''}>
              <div className="assist-log-top">
                <strong>{a.worker.name}</strong>
                <span className="muted">
                  {hhmm(a.created_at)} · {a.zone?.name ?? '위치 미상'}
                </span>
              </div>
              <p className="assist-log-q">{a.question ? `“${a.question}”` : a.kind_label}</p>
              <p className="muted assist-log-a">→ {a.headline}</p>
              {a.escalated && <span className="badge badge-danger">담당자 확인 요청</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
