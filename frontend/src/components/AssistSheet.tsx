import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Assist, QuickKind } from '../lib/useAssist'

interface Props {
  assist: Assist
  onClose: () => void
  /** Collapse to the floating mic; the conversation state is kept. */
  onMinimize: () => void
}

const DISMISS_RATIO = 0.33 // drag past a third of the sheet height to close
const FLICK_SPEED = 0.6 // px/ms — a fast downward flick also closes

const QUICK: { kind: QuickKind; label: string }[] = [
  { kind: 'next', label: '다음 순서' },
  { kind: 'tools', label: '준비물' },
  { kind: 'cautions', label: '주의사항' },
]

/** '오봇에게 물어보기': quick questions + push-to-talk, answered as one short card. */
export function AssistSheet({ assist, onClose: close, onMinimize }: Props) {
  const { talk, card, error, escalatedTo: escalated } = assist
  const [showFigure, setShowFigure] = useState(false)
  const [showRefs, setShowRefs] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null)
  const closingRef = useRef(false)

  useEffect(() => {
    setShowFigure(!!card?.show_figure)
    setShowRefs(false)
  }, [card])

  // Slide the sheet down, then run `then` (close or minimize).
  const slideAway = useCallback((then: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (sheet) {
      sheet.style.transition = 'transform 0.22s ease-in'
      sheet.style.transform = 'translateY(110%)'
    }
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.22s ease-in'
      backdrop.style.opacity = '0'
    }
    window.setTimeout(then, 210)
  }, [])
  const onClose = useCallback(() => slideAway(close), [slideAway, close])
  const minimize = useCallback(() => slideAway(onMinimize), [slideAway, onMinimize])

  // Swipe down on the grabber/header to dismiss (iOS sheet behaviour).
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture unsupported: moves still arrive while the finger stays on the handle */
    }
    drag.current = { startY: e.clientY, startT: Date.now(), dy: 0 }
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const sheet = sheetRef.current
    if (!d || !sheet) return
    // resist upward pulls, follow downward ones
    const raw = e.clientY - d.startY
    d.dy = raw > 0 ? raw : raw / 6
    sheet.style.transform = `translateY(${d.dy}px)`
    if (backdropRef.current) {
      backdropRef.current.style.opacity = String(Math.max(0.2, 1 - Math.max(0, d.dy) / sheet.offsetHeight))
    }
  }
  const onDragEnd = () => {
    const d = drag.current
    const sheet = sheetRef.current
    drag.current = null
    if (!d || !sheet) return
    const speed = d.dy / Math.max(1, Date.now() - d.startT)
    if (d.dy > sheet.offsetHeight * DISMISS_RATIO || (d.dy > 30 && speed > FLICK_SPEED)) {
      onClose()
      return
    }
    sheet.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)'
    sheet.style.transform = ''
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 0.28s'
      backdropRef.current.style.opacity = ''
    }
  }


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="assist-backdrop" ref={backdropRef} onClick={onClose}>
      <div
        className="assist-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="오봇에게 물어보기"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="assist-drag"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="assist-grab" aria-hidden="true" />
          <header className="assist-head">
            <h2 className="assist-title">오봇에게 물어보기</h2>
            <button className="assist-x assist-min" onClick={minimize} aria-label="작게 보기 (마이크만 남기기)">
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
            </button>
            <button className="assist-x" onClick={onClose} aria-label="닫기">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </header>
        </div>

        {card ? (
          <section className="assist-card" aria-live="polite">
            {card.question && <p className="assist-quote">“{card.question}”</p>}
            {card.needs_supervisor && <span className="assist-flag">담당자 확인 필요</span>}
            <p className="assist-headline">{card.headline}</p>
            {card.details.length > 0 && (
              <ul className="assist-details">
                {card.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {showFigure && card.figure && (
              <figure className="assist-figure">
                <img src={card.figure.url} alt={card.figure.caption} />
                <figcaption>{card.figure.caption}</figcaption>
              </figure>
            )}
            {showRefs && card.references.length > 0 && (
              <ul className="assist-refs">
                {card.references.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <div className="assist-actions">
              {card.figure && (
                <button className="assist-chip" onClick={() => setShowFigure((v) => !v)}>
                  {showFigure ? '그림 닫기' : '그림 보기'}
                </button>
              )}
              {card.references.length > 0 && (
                <button className="assist-chip" onClick={() => setShowRefs((v) => !v)}>
                  관련 지침
                </button>
              )}
              {card.owner && (
                <button
                  className={`assist-chip ${card.needs_supervisor && !escalated ? 'is-primary' : ''}`}
                  onClick={() => void assist.escalate()}
                  disabled={!!escalated}
                >
                  {escalated ? `요청했어요 · ${escalated}` : '담당자에게 확인'}
                </button>
              )}
            </div>
            <div className="assist-foot">
              <button className="assist-btn" onClick={assist.clearCard}>
                다른 질문
              </button>
              <button className="assist-btn is-dark" onClick={onClose}>
                작업으로 돌아가기
              </button>
            </div>
          </section>
        ) : (
          <section className="assist-ask">
            <p className="assist-q">이 작업에서 무엇이 궁금하세요?</p>
            <div className="assist-quick">
              {QUICK.map((q) => (
                <button key={q.kind} className="assist-chip" disabled={talk !== 'idle'} onClick={() => void assist.ask(q.kind)}>
                  {q.label}
                </button>
              ))}
            </div>
            <button
              className={`assist-mic is-${talk}`}
              {...assist.press}
              disabled={talk === 'thinking'}
              aria-label="직접 질문"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {talk !== 'idle' && (
              <p className="assist-mic-label">
                {talk === 'listening' ? '듣고 있어요 · 손을 떼거나 다시 누르면 질문해요' : '오봇이 확인하고 있어요…'}
              </p>
            )}
          </section>
        )}
        {error && <p className="assist-error">{error}</p>}
      </div>
    </div>
  )
}
