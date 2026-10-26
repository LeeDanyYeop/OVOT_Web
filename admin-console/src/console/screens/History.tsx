import { useMemo, useState } from 'react'
import { timeline, type DemoState } from '../../demo/flags'
import { BASE_HISTORY, EVENT } from '../../demo/scenarioB03'

export function History({ state }: { state: DemoState }) {
  const [q, setQ] = useState('')
  const items = useMemo(() => timeline(state), [state])
  const baseCount = BASE_HISTORY.length
  const query = q.trim().toLowerCase()
  const shown = query ? items.filter((it) => (it.search + ' ' + it.text).toLowerCase().includes(query)) : items

  return (
    <>
      <header className="cn-page-head">
        <h1>이력</h1>
        <p>사건 {EVENT.id} · 모든 기록은 사건 단위로 연결됩니다.</p>
      </header>

      <label className="cn-field">
        <span className="cn-sr">이력 검색</span>
        <input className="cn-search" type="search" placeholder="작업자 · 블록 · 전사문 검색 (예: W-106, B-03, 크레인)" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {shown.length === 0 ? (
        <p className="cn-empty">검색 결과가 없습니다.</p>
      ) : (
        <ol className="cn-timeline" aria-label="사건 타임라인">
          {shown.map((it, i) => {
            const isNew = !BASE_HISTORY.some((b) => b.at === it.at && b.text === it.text) && items.length > baseCount
            return (
              <li key={`${it.at}-${i}`} className={isNew ? 'new' : undefined}>
                <time>{it.at}</time>
                <span className={`cn-badge${it.actor === 'ovot' ? ' dark' : it.actor === 'lead' ? ' info' : ''}`}>{it.actorLabel}</span>
                <span className="cn-tl-text">{it.text}</span>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
