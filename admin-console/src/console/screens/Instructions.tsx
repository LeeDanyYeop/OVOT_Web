import { instructionRows, type DemoState, type Row } from '../../demo/flags'
import { RADIO, TRANSLATION } from '../../demo/scenarioB03'

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="cn-rows">
      {rows.map((r) => (
        <li key={r.label}>
          <span className={`cn-ico ${r.ok ? 'ok' : 'no'}`} aria-hidden>{r.ok ? '✓' : '!'}</span>
          <span className="cn-rl">{r.label}</span>
          <span className={`cn-rv${r.ok ? '' : ' no'}`}>
            <span className="cn-sr">{r.ok ? '정상 · ' : '확인 필요 · '}</span>
            {r.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Instructions({ state }: { state: DemoState }) {
  const { boundary1, boundary2 } = instructionRows(state)
  return (
    <>
      <header className="cn-page-head">
        <h1>지시·변경</h1>
        <p>경계마다 지시가 제대로 넘어갔는지 한눈에 봅니다. 값은 확인 요청에서 내린 결정에 따라 바뀝니다.</p>
      </header>

      <div className="cn-cards2">
        <section className="cn-card" aria-label="경계 1 · 설계 변경 반영">
          <h2>경계 1 · 설계 → 원청 · 설계 변경 반영</h2>
          <p className="cn-sub">설계 변경이 지시와 협력사 작업지시서까지 반영됐는지</p>
          <Rows rows={boundary1} />
        </section>
        <section className="cn-card" aria-label="경계 2 지시 전달과 실행 가능 여부">
          <h2>경계 2 · 원청 → 협력사 · 야드 · 지시 전달·실행 가능 여부</h2>
          <p className="cn-sub">지시가 작업자에게 전달됐고 야드 계획으로 실행할 수 있는지</p>
          <Rows rows={boundary2} />
        </section>
      </div>

      <section className="cn-card" aria-label="지시 원문과 번역">
        <h2>지시 원문과 번역</h2>
        <p className="cn-sub">{RADIO.speaker} 무전 · {RADIO.at}</p>
        <div className="cn-trans">
          <div>
            <small>한국어 원문</small>
            <p>{TRANSLATION.ko}</p>
          </div>
          <div>
            <small>베트남어 번역 · W-106</small>
            <p lang="vi">{TRANSLATION.vi}</p>
          </div>
        </div>
      </section>
    </>
  )
}
