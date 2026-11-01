import { reflection, type DemoState } from '../../demo/flags'
import { EVENT, SCENE } from '../../demo/scenarioB03'

/** 설계자 홈 — 검토·승인 등록(이미 09:12 에 등록됨)과 현장 반영 여부 */
export function DrawingChange({ state }: { state: DemoState }) {
  const r = reflection(state)
  return (
    <>
      <header className="cn-page-head">
        <h1>도면 변경</h1>
        <p>{SCENE===1?'B-01 러그 위치와 용접·보강 조건 검토 요청을 확인하고 관련 도면 검토·협의를 진행합니다.':'B-01 검토·승인 내용과 배포된 Rev.2 도면·지침의 현장 반영 여부를 확인합니다.'}</p>
      </header>

      <section className="cn-card" aria-label="검토·승인 등록">
        <h2 style={{ fontSize: '1.1rem', marginBottom: 14 }}>검토·승인 등록</h2>
        <form className="cn-form" onSubmit={(e) => e.preventDefault()}>
          <label className="cn-field">
            블록
            <input value={EVENT.block} disabled />
          </label>
          <label className="cn-field">
            부품
            <input value={EVENT.part} disabled />
          </label>
          <label className="cn-field">
            검토 단계
            <input value={EVENT.from} disabled />
          </label>
          <label className="cn-field">
            승인 버전
            <input value={EVENT.to} disabled />
          </label>
          <label className="cn-field full">
            검토·승인 내용
            <textarea value={EVENT.reason} disabled readOnly />
          </label>
          <div className="cn-form-actions">
            <button type="submit" className="cn-btn cn-btn-primary" disabled>검토·승인 등록</button>
            <span className="cn-badge ok" role="status">{SCENE===1?'검토 요청 접수 · 관련 도면 확인 및 협의 진행':'승인·배포됨 · 장면 2 · 원청 담당자가 Rev.2·지침 확인'}</span>
          </div>
        </form>
      </section>

      <section className="cn-card cn-reflect" aria-label="현장 반영 여부">
        <h2 style={{ fontSize: '1.1rem' }}>현장 반영 여부</h2>
        <p className="cn-count num">{r.count}/{r.total}</p>
        <div className="cn-bar" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.count} aria-label="현장 반영">
          <i style={{ width: `${(r.count / r.total) * 100}%` }} />
        </div>
        <ul className="cn-rows">
          {r.rows.map((row) => (
            <li key={row.label}>
              <span className={`cn-ico ${row.ok ? 'ok' : 'no'}`} aria-hidden>{row.ok ? '✓' : '!'}</span>
              <span className="cn-rl">{row.label}</span>
              <span className={`cn-rv${row.ok ? '' : ' no'}`}>
                <span className="cn-sr">{row.ok ? '반영됨 · ' : '확인 중 · '}</span>
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
