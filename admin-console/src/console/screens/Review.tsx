import { useState } from 'react'
import { choiceOf, decidedAt, flagStatus, type DemoState } from '../../demo/flags'
import { demoStore, type FlagFilter } from '../../demo/store'
import { SCENE, EVENT, FLAGS, RADIO, type FlagDef } from '../../demo/scenarioB03'

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
  const text = SCENE===1 ? '여기 러그를 어디 붙일지하고 용접, 보강 조건은 제작·인양 검토 쪽에서 봐줘야겠네요.' : RADIO.text
  const i = mark ? text.indexOf(mark) : -1
  return (
    <blockquote className="cn-evidence" style={{ margin: 0 }}>
      <small>근거 원문 · {SCENE===1?'선체설계 책임':RADIO.speaker} 대화 · {SCENE===1?'장면 1':RADIO.at}</small>
      {i < 0 ? (
        text
      ) : (
        <>
          “{text.slice(0, i)}
          <mark>{mark}</mark>
          {text.slice(i + mark.length)}”
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
        <span className="cn-neq" aria-label={SCENE===1?"검토 요청 전달":"일치하지 않음"}>{SCENE===1?"→":"≠"}</span>
        <div className="cn-cbox">
          <small>{flag.right.caption}</small>
          <b>{flag.right.value}</b>
        </div>
      </div>

      <Evidence mark={flag.mark} />
      {SCENE===4 && <blockquote className="cn-evidence"><small>후속 대화 · 담당자 2 인수인계 후</small>담당자 2: “보강도 같이 하기로 돼 있는데, 그것도 하셨어요?”<br/>작업자: “아… 보강은 안 했네요. 러그 붙이는 데까지만 했습니다.”<br/>도면과 실제 작업 부위를 함께 확인 · 지시된 보강 작업 누락</blockquote>}

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
          <span>현장 담당자 2 · {choice.label} · {at} · 미완료 유지</span>
          <button className="cn-link" onClick={() => demoStore.undo(flag.id)}>되돌리기</button>
        </div>
      )}

      {status === 'resolved' && (
        <div className="cn-done" role="status">
          <span>현장 재확인 필요 · 작업 완료 확정 전</span>
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
        <b>{EVENT.id} · B-01 러그 부착·용접·보강</b>
        <span className="cn-flow">
          <span>{SCENE===1?'현장 설계 대화 수집':'Rev.2 승인·지침 배포'}</span>
          <i aria-hidden>→</i>
          <span>{SCENE===1?'검토 요청 표시':'담당자 1 작업 지시'}</span>
          <i aria-hidden>→</i>
          <span>{SCENE===1?'관련 도면 확인·협의':'담당자 2 보강 누락 확인'}</span>
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
