import { useMemo } from 'react'
import type { ZoneMap } from '../../config'
import type { ZoneSummary } from '../../data/model'
import { YardMap } from '../../yard/YardMap'
import '../../yard/yard.css'
import { flagStatus, kpis, openCount, openFlags, zoneNotes, type DemoState } from '../../demo/flags'
import { demoStore } from '../../demo/store'
import { CLOCK, FLAGS, TASK_CARD, ZONES, type FlagId } from '../../demo/scenarioB03'

/** 지도에는 이 사건과 관계있는 구역(A·E)만 올린다 */
function zoneSummary(id: string, label: string, desc: string, done: boolean, notes: number): ZoneSummary {
  return {
    zone_id: id,
    label,
    description: desc,
    inConfig: true,
    tasks: [{ task_id: `T-${id}`, block_id: TASK_CARD.block, zone_id: id, task_type: TASK_CARD.part, status: done ? 'DONE' : 'PENDING', updated_at: null }],
    taskTypes: [TASK_CARD.part],
    blocks: [TASK_CARD.block],
    statusCounts: {},
    headline: done ? 'DONE' : 'PENDING',
    needsConfirmation: notes,
    voiceCount: 0,
    handoffsOpen: 0,
  }
}

export function Overview({ zoneMap, state }: { zoneMap: ZoneMap; state: DemoState }) {
  const k = kpis(state)
  const notes = zoneNotes(state)
  const open = openFlags(state)

  const map = useMemo<ZoneMap>(() => ({ ...zoneMap, zones: zoneMap.zones.filter((z) => z.zone_id === ZONES.A.id || z.zone_id === ZONES.E.id) }), [zoneMap])
  const zones = useMemo<ZoneSummary[]>(
    () => [
      zoneSummary(ZONES.A.id, ZONES.A.label, '조립장', openCount(state) === 0, 0),
      zoneSummary(ZONES.E.id, ZONES.E.label, '탑재 대기장', flagStatus('yard', state) !== 'open', 0),
    ],
    [state],
  )

  const goReview = (id: FlagId) => {
    demoStore.setFilter(id)
    demoStore.go('review')
  }

  return (
    <>
      <header className="cn-page-head">
        <h1>오늘의 작업 현황</h1>
        <p>{CLOCK.date} · {CLOCK.now} 기준</p>
      </header>

      <section className="cn-kpis" aria-label="핵심 지표">
        <div className={`cn-kpi${k.needs ? ' need' : ''}`}>
          <span>확인 필요</span>
          <b className="num">{k.needs}</b>
          <small>{k.needs ? '결정을 기다리는 플래그' : '모두 결정됨'}</small>
        </div>
        <div className="cn-kpi">
          <span>진행 중 사건</span>
          <b className="num">{k.activeEvents}</b>
          <small>EV-0317</small>
        </div>
        <div className={`cn-kpi${k.ackDone === k.ackTotal ? ' ok' : ''}`}>
          <span>지시 수신 확인</span>
          <b className="num">{k.ackDone}/{k.ackTotal}</b>
          <small>W-104 · W-106</small>
        </div>
        <div className={`cn-kpi${k.moved ? ' ok' : ''}`}>
          <span>B-03 블록 이동</span>
          <b className="num">{k.move}</b>
          <small>{k.moved ? '조정됨' : '탑재 대기장으로'}</small>
        </div>
      </section>

      <div className="cn-overview">
        <section className="cn-map" aria-label="작업장 지도">
          <span className="cn-map-note">배치 예시 · 실제 도면 아님</span>
          <YardMap
            zoneMap={map}
            zones={zones}
            zoneNotes={notes}
            onSelect={(id) => {
              demoStore.setFilter(id === ZONES.E.id ? 'yard' : 'all')
              demoStore.go('review')
            }}
            ariaLabel="B-03 관련 작업구역 지도"
            rotate
          />
        </section>

        <section className="cn-card cn-todo" aria-label="지금 확인할 것">
          <h2>지금 확인할 것</h2>
          {open.length === 0 ? (
            <p className="cn-empty">확인할 플래그가 없습니다. 모든 결정이 이력에 반영되었습니다.</p>
          ) : (
            <ul className="cn-todo-list">
              {open.map((f) => (
                <li key={f.id}>
                  <button onClick={() => goReview(f.id)}>
                    <span className={`cn-badge tone-${f.tone}`}>{f.kind}</span>
                    <span>{f.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {FLAGS.length > open.length && open.length > 0 && <p className="cn-muted" style={{ marginTop: 12, fontSize: '0.88rem' }}>{FLAGS.length - open.length}건은 이미 처리되었습니다.</p>}
        </section>
      </div>
    </>
  )
}
