import { useState } from 'react'
import { choiceOf, decidedAt, flagStatus, type DemoState } from '../../demo/flags'
import { demoStore, type FlagFilter } from '../../demo/store'
import { EVENT, FLAGS, RADIO, WORKER_ACK_AT, type FlagDef } from '../../demo/scenarioB03'

const FILTERS: { key: FlagFilter; label: string }[] = [{ key: 'all', label: '전체' }, ...FLAGS.map((f) => ({ key: f.id as FlagFilter, label: f.kind }))]

/** 근거 음성: 브라우저 음성 합성으로 원문을 읽어 준다 (DEMO — 실제 연동 시 녹음 파일 재생으로 교체) */
function speak(text: string): boolean {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'
  window.speechSynthesis.speak(u)
  return true
}

function Evidence({ mark }: { mark: string }) {
  const i = RADIO.text.indexOf(mark)
  return (
    <blockquote className="cn-evidence" style={{ margin: 0 }}>
      <small>근거 원문 · {RADIO.speaker} 무전 · {RADIO.at}</small>
      {i < 0 ? (
        RADIO.text
      ) : (
        <>
          “{RADIO.text.slice(0, i)}
          <mark>{mark}</mark>
          {RADIO.text.slice(i + mark.length)}”
        </>
      )}
    </blockquote>
  )
}

function FlagCard({ flag, state }: { flag: FlagDef; state: DemoState }) {
  const [note, setNote] = useState<string | null>(null)
  const status = flagStatus(flag.id, state)
  const choice = choiceOf(flag.id, state)
  const at = decidedAt(flag.id, state)

  return (
    <article className={`cn-flag ${status}`} aria-labelledby={`flag-${flag.id}`}>
      <div className="cn-flag-top">
        <span className={`cn-badge tone-${flag.tone}`}>{flag.kind}</span>
        <span className="cn-badge">경계 {flag.boundary}</span>
        <span className={`cn-badge ${status === 'open' ? 'need' : 'ok'}`}>{status === 'open' ? '확인 필요' : '결정 완료'}</span>
      </div>

      <h2 id={`flag-${flag.id}`}>{flag.title}</h2>

      <div className="cn-compare">
        <div className="cn-cbox">
          <small>{flag.left.caption}</small>
          <b>{flag.left.value}</b>
        </div>
        <span className="cn-neq" aria-label="일치하지 않음">≠</span>
        <div className="cn-cbox">
          <small>{flag.right.caption}</small>
          <b>{flag.right.value}</b>
        </div>
      </div>

      <Evidence mark={flag.mark} />

      <p className="cn-proposal">
        <span>OVOT 제안 · </span>
        {flag.proposal}
      </p>

      {status === 'open' && (
        <div className="cn-actions">
          <button className="cn-btn cn-btn-primary" onClick={() => demoStore.decide(flag.id, flag.primary.key)}>{flag.primary.label}</button>
          <button className="cn-btn" onClick={() => demoStore.decide(flag.id, flag.secondary.key)}>{flag.secondary.label}</button>
          <button
            className="cn-btn cn-btn-ghost"
            onClick={() => setNote(speak(RADIO.text) ? '근거 음성을 재생합니다 (DEMO: 원문을 읽어 줍니다)' : '이 브라우저는 음성 재생을 지원하지 않습니다')}
          >
            근거 음성 듣기
          </button>
          {note && <span className="cn-muted" role="status">{note}</span>}
        </div>
      )}

      {status === 'decided' && choice && (
        <div className="cn-done" role="status">
          <span>박반장 · {choice.label} · {at} · 협력사와 이력에 반영됨</span>
          <button className="cn-link" onClick={() => demoStore.undo(flag.id)}>되돌리기</button>
        </div>
      )}

      {status === 'resolved' && (
        <div className="cn-done" role="status">
          <span>W-106 응우옌 반 투 · 작업자 앱에서 수신 확인 · {state.w106AckAt ?? WORKER_ACK_AT} · 결정 없이 해소됨</span>
        </div>
      )}
    </article>
  )
}

export function Review({ state, filter }: { state: DemoState; filter: FlagFilter }) {
  const shown = FLAGS.filter((f) => filter === 'all' || f.id === filter)
  return (
    <>
      <header className="cn-page-head">
        <h1>확인 요청</h1>
        <p>OVOT가 경계에서 찾은 문제입니다. 결정은 담당자가 합니다.</p>
      </header>

      <div className="cn-eventbar">
        <b>{EVENT.id} · B-03 배관 도면 변경</b>
        <span className="cn-flow">
          <span>설계 R1 등록 09:12</span>
          <i aria-hidden>→</i>
          <span>반장 무전 지시 10:05</span>
          <i aria-hidden>→</i>
          <span>협력사 전달 10:05</span>
        </span>
      </div>

      <div className="cn-chips" role="group" aria-label="유형 필터">
        {FILTERS.map((f) => {
          const done = f.key !== 'all' && flagStatus(f.key, state) !== 'open'
          return (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => demoStore.setFilter(f.key)}>
              {f.label}
              {done && ' ✓'}
            </button>
          )
        })}
      </div>

      <div className="cn-flags">
        {shown.map((f) => (
          <FlagCard key={f.id} flag={f} state={state} />
        ))}
      </div>
    </>
  )
}
