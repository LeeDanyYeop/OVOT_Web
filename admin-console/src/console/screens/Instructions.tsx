import { instructionRows, type DemoState, type Row } from '../../demo/flags'
import { SCENE, RADIO, TRANSLATION } from '../../demo/scenarioB03'

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
          <h2>경계 1 · 설계·검토 → 원청 · 승인 내용 전달</h2>
          <p className="cn-sub">러그 위치 및 용접·보강 조건의 검토·승인과 현장 전달 여부</p>
          <Rows rows={boundary1} />
        </section>
        <section className="cn-card" aria-label="경계 2 지시 전달과 실행 가능 여부">
          <h2>경계 2 · 원청 → 협력사 · 지시와 실제 작업 결과</h2>
          <p className="cn-sub">{SCENE===3?'작업 지시가 전달되었고 작업자가 응답했는지 확인합니다.':'전체 완료 보고와 후속 대화를 기존 작업 지시에 연결해 확인합니다.'}</p>
          <Rows rows={boundary2} />
        </section>
      </div>

      <section className="cn-card" aria-label="지시 원문과 작업자 보고">
        <h2>지시 원문과 작업자 보고</h2>
        <p className="cn-sub">{RADIO.speaker} 무전 · {RADIO.at}</p>
        <div className="cn-trans">
          <div>
            <small>담당자 1 · 작업 지시</small>
            <p>{TRANSLATION.ko}</p>
          </div>
          <div>
            <small>{SCENE===3?'협력사 작업자 · 응답':'작업자 보고 · 후속 대화'}</small>
            <p>{TRANSLATION.vi}</p>
          </div>
        </div>
      </section>
    </>
  )
}
