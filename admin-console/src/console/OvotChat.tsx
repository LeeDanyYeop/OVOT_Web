import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ovot } from './Ovot'
import './ovot.css'

// 오봇 챗봇 — 관제 오른쪽 아래 버튼. 묻는 말은 /api/chat(Worker)이 우리 DB 기록을 근거로 답한다
type Msg = { role: 'user' | 'assistant'; text: string }

const HELLO: Msg = { role: 'assistant', text: '안녕하세요, 오봇이에요! 블록 공정·문제·지시 기록을 보고 답해 드릴게요. 무엇이 궁금하세요?' }
const SUGGEST = ['오늘 확인할 문제 알려줘', 'B-04 방수는 언제 끝나?', 'B-02 지금 어디쯤 왔어?', '다음 공정 일정 정리해줘']

export function OvotChat() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([HELLO])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy, open])
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  const ask = async (q: string) => {
    q = q.trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user' as const, text: q }]
    setMsgs(next)
    setText('')
    setBusy(true)
    let reply: string
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(1) }) })
      const j = await r.json().catch(() => null)
      reply = j?.reply || `답을 가져오지 못했어요 (${r.status}).`
    } catch {
      reply = '서버에 연결하지 못했어요. 잠시 뒤 다시 물어봐 주세요.'
    }
    setMsgs((m) => [...m, { role: 'assistant', text: reply }])
    setBusy(false)
  }

  // 부르는 버튼은 메뉴(시연 초기화 위)에, 대화창은 관제 카드들의 쌓임 순서와 섞이지 않게 body 바로 아래에 그린다
  return (
    <>
      {createPortal(<div className="ob-root">
      {open && (
        <section className="ob-panel" role="dialog" aria-label="오봇 대화">
          <header className="ob-head">
            <Ovot size={44} mood={busy ? 'think' : 'idle'} />
            <div>
              <strong>오봇</strong>
              <small>{busy ? '기록을 살펴보는 중…' : 'OVOT 관제 도우미'}</small>
            </div>
            <span className="ob-sp" />
            {msgs.length > 1 && <button className="ob-icon" onClick={() => setMsgs([HELLO])} title="대화 지우기" aria-label="대화 지우기">
              <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
            </button>}
            <button className="ob-icon" onClick={() => setOpen(false)} title="닫기 (Esc)" aria-label="닫기">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div className="ob-list" ref={list} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`ob-msg ob-${m.role}`}>
                {m.role === 'assistant' && <span className="ob-av"><Ovot size={28} /></span>}
                <p>{m.text}</p>
              </div>
            ))}
            {busy && (
              <div className="ob-msg ob-assistant">
                <span className="ob-av"><Ovot size={28} mood="think" /></span>
                <p className="ob-dots" aria-label="답을 만드는 중"><i /><i /><i /></p>
              </div>
            )}
            {msgs.length === 1 && !busy && (
              <div className="ob-suggest">
                {SUGGEST.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
          </div>

          <form className="ob-input" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
            <textarea
              ref={input} rows={1} value={text} placeholder="오봇에게 물어보세요"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text) } }}
            />
            <button type="submit" disabled={!text.trim() || busy} aria-label="보내기">
              <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </form>
        </section>
      )}

      </div>, document.body)}
      <button className={`ob-fab${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)} aria-label={open ? '오봇 닫기' : '오봇에게 물어보기'} aria-expanded={open}>
        <Ovot size={62} wave={!open} />
        {!open && <span className="ob-tip">오봇에게 물어보세요</span>}
      </button>
    </>
  )
}
