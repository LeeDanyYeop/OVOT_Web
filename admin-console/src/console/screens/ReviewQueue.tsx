import { useState } from 'react'
import type { OrderDraft } from './Drawings'
import { blocks as twin } from '../twinBlocks'
import { acknowledge, chipsOf, conversations, forRole, isAcked, undoAck, useUtterances, when, type Convo } from '../utterances'

// 확인 요청 — AI 가 대화 맥락을 보고 결론이 확인 필요하다고 판단한 대화만, 내 역할(현장 담당자·설계자)에 맞는 것만
// B-04·B-02 시연에서 담당자가 보낼 지시 문안 (수정해서 보낼 수 있다)
const PRESET: Record<string, string> = {
  'DEMO-B04-01': 'B-04 1구역: 전기팀 케이블 트레이 브래킷 용접(11시 완료 예정)을 먼저 끝내고, 방수팀은 그동안 2구역부터 2차 도포를 진행하세요. 1구역 도포는 용접 종료·불티 정리 확인 후 시작합니다.',
  'DEMO-B02-01': 'B-02 운송: 방수팀은 B-04 받침대 옆 자재를 13시까지 도크 진입로 밖 적치장으로 옮기세요. 트랜스포터는 자재 이동 확인 후 바로 진입하고, 골리앗 탑재는 14시 슬롯 그대로 진행합니다.',
}

export function ReviewQueue({ by, role, onBlock, onDrawing, onOrder }: { by: string; role: 'lead' | 'designer'; onBlock: (id: string) => void; onDrawing?: (block: string | null) => void; onOrder?: (o: OrderDraft) => void }) {
  const s = useUtterances()
  const [showDone, setShowDone] = useState(false)
  const [openCtx, setOpenCtx] = useState<string | null>(null)
  const all = conversations(s.items ?? [], s.reviews).filter((c) => forRole(c, role))
  const open = all.filter((c) => !isAcked(c, s.acks))
  const done = all.filter((c) => isAcked(c, s.acks))
  const cols = [...twin].sort((a, b) => a.id.localeCompare(b.id))
  const inCols = (c: Convo) => !!c.block && cols.some((b) => b.id === c.block)
  const loose = [...open, ...(showDone ? done : [])].filter((c) => !inCols(c))

  const card = (c: Convo) => {
    const ack = isAcked(c, s.acks) ? s.acks[c.id] : null
    const u = c.last
    return (
      <article key={c.id} className={`dp-rq3${ack ? ' is-done' : ''}`}>
        <div className="dp-rq3-main">
          <p className="dp-rq3-title"><b>{c.block ?? '블록 미지정'}</b>{c.title}</p>
          {c.detail && <p className="dp-rq3-detail">{c.detail}</p>}
          <p className="dp-rq3-meta">{when(u.recorded_at)}{c.worker ? ` · ${c.worker}` : ''} · 대화 {c.lines.length}마디</p>
          <p className="dp-rq3-quote">“{u.transcript}”</p>
          {ack && <p className="dp-rq3-ack">✓ {ack.by} 확인 · {ack.at}</p>}
        </div>
        <div className="dp-rq3-actions">
          {ack
            ? <button className="cn-link" onClick={() => void undoAck(c.id)}>되돌리기</button>
            : role === 'lead'
              ? <button className="cn-btn cn-btn-primary" onClick={() => onOrder?.({ block: c.block, text: PRESET[c.id] ?? '', from: c.id, ack: () => void acknowledge(c, by) })}>작업 지시</button>
              : <button className="cn-btn cn-btn-primary" onClick={() => { void acknowledge(c, by); onDrawing?.(c.block) }}>도면 변경하기</button>}
          {!ack && <button className="cn-link" onClick={() => void acknowledge(c, by)}>조치 없이 확인</button>}
          <button className="cn-link" onClick={() => setOpenCtx(openCtx === c.id ? null : c.id)}>{openCtx === c.id ? '대화 접기' : '대화 전체 보기'}</button>
          {c.block && <button className="cn-link" onClick={() => onBlock(c.block!)}>3D에서 보기</button>}
        </div>
        {openCtx === c.id && (
          <ol className="dp-chat">
            {c.lines.map((l) => (
              <li key={l.voice_id} className={l.voice_id === u.voice_id ? 'is-key' : ''}>
                <time>{when(l.recorded_at).split(' ').pop()}</time>
                <span>{(l.worker_name ?? l.worker_id) && <b className="dp-chat-who">{l.worker_name ?? l.worker_id}</b>}{l.transcript}</span>
                <em>{chipsOf(l).join(' · ')}</em>
              </li>
            ))}
          </ol>
        )}
      </article>
    )
  }

  return (
    <section className="cn-card dp-hist" aria-label="확인 요청">
      {s.failed && !s.items && <p className="dp-utt-empty">현장 기록을 불러오지 못했어요.</p>}
      {s.items && !s.reviews && <p className="dp-utt-empty">{s.reviewError ?? 'AI가 대화 맥락을 살펴보는 중이에요…'}</p>}
      {s.reviews && open.length === 0 && <p className="dp-utt-empty">지금 확인할 일이 없어요.</p>}
      {done.length > 0 && <button className="dp-rq2-toggle dp-rq-donebtn" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>확인한 일 {done.length}건 {showDone ? '숨기기' : '같이 보기'}</button>}
      {/* 이력처럼 블록별 열(B-01 ~ B-04). 블록이 정해지지 않은 건 아래에 따로 */}
      <div className="dp-cols dp-rq-cols">
        {cols.map((c) => {
          const mineOpen = open.filter((x) => x.block === c.id)
          const mineDone = showDone ? done.filter((x) => x.block === c.id) : []
          return (
            <div key={c.id} className="dp-col">
              <header className="dp-col-head"><b>{c.id}</b><span>{c.name} 블록</span><em>{mineOpen.length ? `확인할 일 ${mineOpen.length}건` : ''}</em></header>
              {mineOpen.length || mineDone.length ? [...mineOpen, ...mineDone].map(card) : <p className="dp-utt-empty">확인할 일 없음</p>}
            </div>
          )
        })}
      </div>
      {loose.length > 0 && (
        <div className="dp-col-loose dp-rq-cols">
          <header className="dp-col-head"><b>블록 미지정</b><span>블록이 확인되지 않은 대화</span></header>
          {loose.map(card)}
        </div>
      )}
    </section>
  )
}
