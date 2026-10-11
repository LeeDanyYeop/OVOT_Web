import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

function TypedAnswer({
  card,
  onDone,
  onType,
}: {
  card: AssistCard
  onDone: (done: boolean) => void
  onType: () => void
}) {
  const full = [card.headline, ...card.details].join('\n')
  const { typed, done } = useTypewriter(full, card.log_id)
  useEffect(() => onDone(done), [done, onDone])
  useEffect(onType, [typed, onType])
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

/** Answer area right under the '오봇에게 물어보기' button; types the answer out.
 * A new answer opens enlarged over the screen; once typed it can be shrunk back to the
 * small area under the button (and enlarged again). */
export function AssistInline({ assist, onExpand }: Props) {
  const { talk, card, error, escalatedTo } = assist
  const [typedDone, setTypedDone] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const boxRef = useRef<HTMLElement>(null)
  // keep the latest typed line in view
  const followTyping = useCallback(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // every new answer starts enlarged
  const cardId = card?.log_id
  useEffect(() => {
    setExpanded(cardId !== undefined)
  }, [cardId])

  // enlarged: span from under the header to above the footer (or the screen bottom)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const place = () => {
      if (!expanded) {
        el.style.top = ''
        el.style.bottom = ''
        return
      }
      const screen = el.closest('.w')
      const head = screen?.querySelector('.w-head')?.getBoundingClientRect()
      const foot = screen?.querySelector('.w-foot')?.getBoundingClientRect()
      const inset = screen ? parseFloat(getComputedStyle(screen).paddingBottom) || 0 : 0
      el.style.top = `${(head?.bottom ?? 0) + 14}px`
      el.style.bottom = `${foot ? window.innerHeight - foot.top + 8 : inset + 14}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [expanded, cardId])

  if (talk === 'listening') return null // the button itself shows the listening state
  if (talk === 'thinking') {
    return (
      <section className="assist-inline is-status" ref={boxRef} aria-live="polite">
        <p className="mini-status">
          오봇이 확인하고 있어요<span className="mini-dots" aria-hidden="true" />
        </p>
      </section>
    )
  }
  if (error && !card) {
    return (
      <section className="assist-inline is-status" ref={boxRef} aria-live="polite">
        <p className="mini-status is-error">{error}</p>
      </section>
    )
  }
  if (!card) return null

  return (
    <section className={`assist-inline ${expanded ? 'is-expanded' : ''}`} ref={boxRef} aria-label="오봇 답변">
      <div className="mini-tools">
        {(!expanded || typedDone) && (
          <button
            className="mini-x"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? '답변 작게 보기' : '답변 크게 보기'}
          >
            {expanded ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M14 10l6-6M14 10V5.5M14 10h4.5M10 14l-6 6M10 14v4.5M10 14H5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20 4l-6 6M20 4v4.5M20 4h-4.5M4 20l6-6M4 20v-4.5M4 20h4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}
        <button className="mini-x" onClick={assist.clearCard} aria-label="답변 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {card.question && <p className="assist-quote">“{card.question}”</p>}
      <TypedAnswer card={card} onDone={setTypedDone} onType={followTyping} />
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
