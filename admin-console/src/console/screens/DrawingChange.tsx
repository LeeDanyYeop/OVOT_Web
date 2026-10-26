import { reflection, type DemoState } from '../../demo/flags'
import { EVENT } from '../../demo/scenarioB03'

/** 설계자 홈 — 변경 등록(이미 09:12 에 등록됨)과 현장 반영 여부 */
export function DrawingChange({ state }: { state: DemoState }) {
  const r = reflection(state)
  return (
    <>
      <header className="cn-page-head">
        <h1>도면 변경</h1>
        <p>도면 변경을 등록하면 원청 반장에게 알림이 가고, 현장에 반영됐는지 여기서 확인합니다.</p>
      </header>

      <section className="cn-card" aria-label="변경 등록">
        <h2 style={{ fontSize: '1.1rem', marginBottom: 14 }}>변경 등록</h2>
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
            이전 버전
            <input value={EVENT.from} disabled />
          </label>
          <label className="cn-field">
            새 버전
            <input value={EVENT.to} disabled />
          </label>
          <label className="cn-field full">
            변경 사유
            <textarea value={EVENT.reason} disabled readOnly />
          </label>
          <div className="cn-form-actions">
            <button type="submit" className="cn-btn cn-btn-primary" disabled>변경 등록</button>
            <span className="cn-badge ok" role="status">등록됨 · 09:12 · 원청 반장에게 알림 발송</span>
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
