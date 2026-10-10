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
  onExpand: () => void
  onClose: () => void
}

/** Minimized '오봇에게 물어보기': just a floating mic; answers type out in a small bubble. */
export function AssistMini({ assist, onExpand, onClose }: Props) {
  const { talk, card, error, escalatedTo } = assist
  const [typedDone, setTypedDone] = useState(false)
  const showBubble = talk !== 'idle' || !!card || !!error

  return (
    <>
      {showBubble && (
        <section className="mini-bubble" aria-label="오봇 답변">
          {talk === 'listening' ? (
            <p className="mini-status">듣고 있어요 · 손을 떼거나 다시 누르면 질문해요</p>
          ) : talk === 'thinking' ? (
            <p className="mini-status">
              오봇이 확인하고 있어요<span className="mini-dots" aria-hidden="true" />
            </p>
          ) : card ? (
            <>
              <button className="mini-x" onClick={assist.clearCard} aria-label="답변 닫기">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
              {card.question && <p className="assist-quote">“{card.question}”</p>}
              {card.needs_supervisor && <span className="assist-flag">담당자 확인 필요</span>}
              <TypedAnswer card={card} onDone={setTypedDone} />
              {typedDone && (
                <div className="mini-actions">
                  {(card.figure || card.references.length > 0) && (
                    <button className="assist-chip" onClick={onExpand}>
                      {card.figure ? '그림 보기' : '자세히'}
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
            </>
          ) : (
            <p className="mini-status is-error">{error}</p>
          )}
        </section>
      )}

      <div className="mini-dock">
        <button className="mini-close" onClick={onClose} aria-label="오봇 마이크 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button className={`mini-fab is-${talk}`} {...assist.press} disabled={talk === 'thinking'} aria-label="오봇에게 음성으로 질문">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  )
}
