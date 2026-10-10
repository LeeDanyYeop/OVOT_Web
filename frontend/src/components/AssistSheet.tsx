import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { startQuestionCapture, type QuestionCapture } from '../capture/questionCapture'
import { ApiError, api } from '../lib/api'
import type { AssistCard, AssistContext } from '../types'

interface Props {
  /** The microphone stream that is already streaming; questions are tapped from it. */
  stream: MediaStream | null
  onClose: () => void
}

type Talk = 'idle' | 'listening' | 'thinking'
const HOLD_MS = 450 // shorter press = tap mode (tap again to send), for gloved hands
const MIN_QUESTION_MS = 700
const DISMISS_RATIO = 0.33 // drag past a third of the sheet height to close
const FLICK_SPEED = 0.6 // px/ms — a fast downward flick also closes

const QUICK: { kind: 'next' | 'tools' | 'cautions'; label: string }[] = [
  { kind: 'next', label: '다음 순서' },
  { kind: 'tools', label: '준비물' },
  { kind: 'cautions', label: '주의사항' },
]

/** '오봇에게 물어보기': quick questions + push-to-talk, answered as one short card. */
export function AssistSheet({ stream, onClose: close }: Props) {
  const [ctx, setCtx] = useState<AssistContext | null>(null)
  const [talk, setTalk] = useState<Talk>('idle')
  const [card, setCard] = useState<AssistCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showFigure, setShowFigure] = useState(false)
  const [showRefs, setShowRefs] = useState(false)
  const [escalated, setEscalated] = useState<string | null>(null)
  const captureRef = useRef<QuestionCapture | null>(null)
  const pressedAt = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null)
  const closingRef = useRef(false)

  // Slide the sheet down, then unmount it.
  const onClose = useCallback(() => {
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
    window.setTimeout(close, 210)
  }, [close])

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
    api.assistContext().then(setCtx).catch(() => undefined)
    return () => captureRef.current?.cancel()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const show = (c: AssistCard) => {
    setCard(c)
    setShowFigure(c.show_figure)
    setShowRefs(false)
    setEscalated(c.escalated ? c.owner ?? '담당자' : null)
    setTalk('idle')
  }

  const ask = async (kind: 'next' | 'tools' | 'cautions') => {
    setError(null)
    setTalk('thinking')
    try {
      show(await api.assistQuick(kind))
    } catch (err) {
      setTalk('idle')
      setError(err instanceof ApiError ? err.message : '답변을 가져오지 못했어요')
    }
  }

  const beginListening = () => {
    if (!stream) {
      setError('스트리밍 중일 때 음성으로 물어볼 수 있어요')
      return
    }
    try {
      captureRef.current = startQuestionCapture(stream)
    } catch (err) {
      setError((err as Error).message)
      return
    }
    setError(null)
    setCard(null)
    setTalk('listening')
    try {
      navigator.vibrate?.(30)
    } catch {
      /* unsupported */
    }
  }

  const finishListening = async () => {
    const cap = captureRef.current
    captureRef.current = null
    if (!cap) return
    const { blob, durationMs } = await cap.stop()
    if (durationMs < MIN_QUESTION_MS) {
      setTalk('idle')
      setError('조금 더 길게 말씀해 주세요')
      return
    }
    setTalk('thinking')
    try {
      show(await api.assistAsk(blob, durationMs))
    } catch (err) {
      setTalk('idle')
      setError(err instanceof ApiError ? err.message : '질문을 보내지 못했어요')
    }
  }

  const onPressStart = () => {
    if (talk === 'thinking') return
    if (talk === 'listening') {
      void finishListening() // tap mode: second tap sends
      return
    }
    pressedAt.current = Date.now()
    beginListening()
  }
  const onPressEnd = () => {
    if (talk === 'listening' && pressedAt.current && Date.now() - pressedAt.current >= HOLD_MS) {
      pressedAt.current = 0
      void finishListening() // hold mode: release sends
    } else {
      pressedAt.current = 0 // short tap: keep listening until the next tap
    }
  }

  const escalate = async () => {
    if (!card) return
    try {
      const r = await api.assistEscalate(card.log_id)
      setEscalated(r.owner ?? '담당자')
    } catch {
      setError('요청을 보내지 못했어요')
    }
  }

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
            <div>
              <p className="assist-eyebrow">오봇에게 물어보기</p>
              <h2>{ctx?.assignment ?? '현재 작업'}</h2>
              {ctx?.step && (
                <p className="assist-ctx">
                  {ctx.zone?.name} · {ctx.step.current}/{ctx.step.total}단계 {ctx.step.name}
                </p>
              )}
            </div>
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
                  onClick={() => void escalate()}
                  disabled={!!escalated}
                >
                  {escalated ? `요청했어요 · ${escalated}` : '담당자에게 확인'}
                </button>
              )}
            </div>
            <div className="assist-foot">
              <button className="assist-link" onClick={() => setCard(null)}>
                다른 질문
              </button>
              <button className="pill pill-dark" onClick={onClose}>
                작업으로 돌아가기
              </button>
            </div>
          </section>
        ) : (
          <section className="assist-ask">
            <p className="assist-q">이 작업에서 무엇이 궁금하세요?</p>
            <div className="assist-quick">
              {QUICK.map((q) => (
                <button key={q.kind} className="assist-chip" disabled={talk !== 'idle'} onClick={() => void ask(q.kind)}>
                  {q.label}
                </button>
              ))}
            </div>
            <button
              className={`assist-mic is-${talk}`}
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerLeave={onPressEnd}
              onPointerCancel={onPressEnd}
              onContextMenu={(e) => e.preventDefault()}
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
            <p className="assist-note">스트리밍은 끊기지 않고 계속돼요</p>
          </section>
        )}
        {error && <p className="assist-error">{error}</p>}
      </div>
    </div>
  )
}
