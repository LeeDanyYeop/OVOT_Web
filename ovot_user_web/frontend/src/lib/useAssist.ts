import { useCallback, useEffect, useRef, useState } from 'react'
import { startQuestionCapture, type QuestionCapture } from '../capture/questionCapture'
import { ApiError, api } from './api'
import type { AssistCard } from '../types'

export type Talk = 'idle' | 'listening' | 'thinking'
export type QuickKind = 'next' | 'tools' | 'cautions'

const MIN_QUESTION_MS = 700

/**
 * '오봇에게 물어보기' state shared by the full sheet and the minimized mic button, so a
 * question asked in one shows its answer in the other. Questions are tapped from the
 * stream microphone that is already running.
 */
export function useAssist(stream: MediaStream | null) {
  const [talk, setTalk] = useState<Talk>('idle')
  const [card, setCard] = useState<AssistCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [escalatedTo, setEscalatedTo] = useState<string | null>(null)
  const captureRef = useRef<QuestionCapture | null>(null)
  const talkRef = useRef<Talk>('idle')
  talkRef.current = talk

  useEffect(() => () => captureRef.current?.cancel(), [])

  const show = (c: AssistCard) => {
    setCard(c)
    setEscalatedTo(c.escalated ? c.owner ?? '담당자' : null)
    setTalk('idle')
  }

  const ask = useCallback(async (kind: QuickKind) => {
    setError(null)
    setTalk('thinking')
    try {
      show(await api.assistQuick(kind))
    } catch (err) {
      setTalk('idle')
      setError(err instanceof ApiError ? err.message : '답변을 가져오지 못했어요')
    }
  }, [])

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

  // Tap once to start listening, tap again to send the question.
  const toggleListening = () => {
    if (talkRef.current === 'thinking') return
    if (talkRef.current === 'listening') void finishListening()
    else beginListening()
  }

  const escalate = async () => {
    if (!card) return
    try {
      const r = await api.assistEscalate(card.log_id)
      setEscalatedTo(r.owner ?? '담당자')
    } catch {
      setError('요청을 보내지 못했어요')
    }
  }

  const reset = useCallback(() => {
    captureRef.current?.cancel()
    captureRef.current = null
    setTalk('idle')
    setCard(null)
    setError(null)
    setEscalatedTo(null)
  }, [])

  return {
    talk,
    card,
    error,
    escalatedTo,
    ask,
    escalate,
    reset,
    clearCard: () => setCard(null),
    /** Spread onto the mic button. */
    press: { onClick: toggleListening },
  }
}

export type Assist = ReturnType<typeof useAssist>
