import { useState } from 'react'
import { chipsOf, conversations, useUtterances, when, type Utterance } from '../utterances'
import { blocks as twin } from '../twinBlocks'

// 이력 — 현장 녹음을 AI 가 묶은 대화 단위로, 메신저처럼 시간순으로 보여 준다. 분류 근거는 '자세히'에서만
export function UtteranceLog({ block }: { block?: string } = {}) {
  const s = useUtterances()
  const [detail, setDetail] = useState<string | null>(null)
  // 시연 초기화 이후 발화만 (B-04 시연 데이터는 항상)
  const items = (s.items ?? []).filter((u) => (!block || u.block_id === block) && (u.demo || !s.since || new Date(u.recorded_at ?? 0).getTime() > s.since))
  const convos = conversations(items, s.reviews)
  // AI 가 대화로 묶은 것은 대화 단위로, 아직 판단이 없는 발화는 하나씩 보여 준다 (시간 역순)
  const grouped = new Set(convos.flatMap((c) => c.lines.map((l) => l.voice_id)))
  const groups = [
    ...convos.map((c) => ({ id: c.id, title: c.title, block: c.block, lines: c.lines, flag: c.needsCheck, at: c.lines[0].recorded_at ?? '' })),
    ...items.filter((u) => !grouped.has(u.voice_id)).map((u) => ({ id: u.voice_id, title: '', block: u.block_id, lines: [u], flag: false, at: u.recorded_at ?? '' })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const line = (u: Utterance) => (
    <li key={u.voice_id}>
      <time>{when(u.recorded_at).split(' ').pop()}</time>
      <span>{(u.worker_name ?? u.worker_id) && <b className="dp-chat-who">{u.worker_name ?? u.worker_id}</b>}{u.transcript}</span>
      <em>{chipsOf(u).join(' · ')}</em>
      {detail === u.voice_id && (
        <ul className="dp-chat-ai">
          {u.labels.map((l) => <li key={`${l.category}-${l.subcategory}`}>{l.category} › {l.subcategory} <small>“{l.evidence}” {Math.round(l.confidence * 100)}%</small></li>)}
        </ul>
      )}
      {u.labels.length > 0 && <button className="cn-link dp-chat-more" onClick={() => setDetail(detail === u.voice_id ? null : u.voice_id)}>{detail === u.voice_id ? '접기' : 'AI 분류'}</button>}
    </li>
  )

  const card = (g: (typeof groups)[number], showBlock: boolean) => (
    <article key={g.id} className={`dp-conv${g.flag ? ' is-flag' : ''}`}>
      <header>
        <time>{when(g.lines[0].recorded_at)}</time>
        {showBlock && g.block && <span className="dp-utt-tag">{g.block}</span>}
        {g.flag && <span className="dp-utt-tag is-warn">확인 필요</span>}
        {g.title && <b>{g.title}</b>}
      </header>
      <ol className="dp-chat">{g.lines.map(line)}</ol>
    </article>
  )
  const status = (
    <>
      {s.failed && !s.items && <p className="dp-utt-empty">현장 기록을 불러오지 못했어요.</p>}
      {s.items && groups.length === 0 && <p className="dp-utt-empty">아직 들어온 현장 대화가 없어요.</p>}
    </>
  )
  // 블록 상세 탭: 그 블록만 한 줄로
  if (block) return <section className="dp-conv-list" aria-label="현장 대화 기록">{status}{groups.map((g) => card(g, false))}</section>

  // 이력 메뉴: 블록별 열(B-01 ~ B-04)로 나눠서. 블록이 정해지지 않은 대화는 아래에 따로
  const cols = [...twin].sort((a, b) => a.id.localeCompare(b.id))
  const loose = groups.filter((g) => !g.block || !cols.some((c) => c.id === g.block))
  return (
    <section aria-label="현장 대화 기록">
      {status}
      <div className="dp-cols">
        {cols.map((c) => {
          const mine = groups.filter((g) => g.block === c.id)
          return (
            <div key={c.id} className="dp-col">
              <header className="dp-col-head"><b>{c.id}</b><span>{c.name} 블록</span><em>{mine.length ? `${mine.length}개 대화` : ''}</em></header>
              {mine.length ? mine.map((g) => card(g, false)) : <p className="dp-utt-empty">기록 없음</p>}
            </div>
          )
        })}
      </div>
      {loose.length > 0 && (
        <div className="dp-col-loose">
          <header className="dp-col-head"><b>블록 미지정</b><span>블록이 확인되지 않은 대화</span><em>{loose.length}개 대화</em></header>
          {loose.map((g) => card(g, false))}
        </div>
      )}
    </section>
  )
}
