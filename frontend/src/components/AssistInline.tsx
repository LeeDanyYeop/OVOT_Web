import { useEffect, useState } from 'react'
import type { Assist } from '../lib/useAssist'
import type { AssistCard } from '../types'

const CHAR_MS = 26

/** Reveals the answer one character at a time, like it is being typed. */
function useTypewriter(text: string, key: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length)
      return
    }
    setN(0)
    const t = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(t)
          return v
        }
        return v + 1
      })
    }, CHAR_MS)
    return () => window.clearInterval(t)
  }, [text, key])
  return { typed: text.slice(0, n), done: n >= text.length }
}

function TypedAnswer({ card, onDone }: { card: AssistCard; onDone: (done: boolean) => void }) {
  const full = [card.headline, ...card.details].join('\n')
  const { typed, done } = useTypewriter(full, card.log_id)
  useEffect(() => onDone(done), [done, onDone])
  const [head, ...rest] = typed.split('\n')
  return (
    <div className="mini-answer" aria-live="polite">
      <p className="mini-headline">
        {head}
        {!done && rest.length === 0 && <span className="mini-caret" aria-hidden="true" />}
      </p>
      {rest.length > 0 && (
        <ul className="assist-details">
          {rest.map((line, i) => (
            <li key={i}>
              {line}
              {!done && i === rest.length - 1 && <span className="mini-caret" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface Props {
  assist: Assist
  /** Open the full sheet (figure, references). */
  onExpand: () => void
}

/** Answer area right under the '오봇에게 물어보기' button; types the answer out. */
export function AssistInline({ assist, onExpand }: Props) {
  const { talk, card, error, escalatedTo } = assist
  const [typedDone, setTypedDone] = useState(false)

  if (talk === 'listening') return null // the button itself shows the listening state
  if (talk === 'thinking') {
    return (
      <section className="assist-inline is-status" aria-live="polite">
        <p className="mini-status">
          오봇이 확인하고 있어요<span className="mini-dots" aria-hidden="true" />
        </p>
      </section>
    )
  }
  if (error && !card) {
    return (
      <section className="assist-inline is-status" aria-live="polite">
        <p className="mini-status is-error">{error}</p>
      </section>
    )
  }
  if (!card) return null

  return (
    <section className="assist-inline" aria-label="오봇 답변">
      <button className="mini-x" onClick={assist.clearCard} aria-label="답변 닫기">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {card.question && <p className="assist-quote">“{card.question}”</p>}
      {card.needs_supervisor && <span className="assist-flag">담당자 확인 필요</span>}
      <TypedAnswer card={card} onDone={setTypedDone} />
      {typedDone && (card.figure || card.owner) && (
        <div className="mini-actions">
          {card.figure && (
            <button className="assist-chip" onClick={onExpand}>
              그림 보기
            </button>
          )}
          {card.owner && (
            <button
              className={`assist-chip ${card.needs_supervisor && !escalatedTo ? 'is-primary' : ''}`}
              onClick={() => void assist.escalate()}
              disabled={!!escalatedTo}
            >
              {escalatedTo ? `요청했어요 · ${escalatedTo}` : '담당자에게 확인'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
