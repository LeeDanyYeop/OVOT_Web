import { useMemo } from 'react'
import type { ZoneMap } from '../../config'
import type { ZoneSummary } from '../../data/model'
import { YardMap } from '../../yard/YardMap'
import '../../yard/yard.css'
import { kpis, openFlags, zoneNotes, type DemoState } from '../../demo/flags'
import { demoStore } from '../../demo/store'
import { SCENE, CLOCK, FLAGS, TASK_CARD, ZONES, type FlagId } from '../../demo/scenarioB03'

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

  const map = useMemo<ZoneMap>(() => ({ ...zoneMap, zones: zoneMap.zones.filter((z) => z.zone_id === ZONES.A.id) }), [zoneMap])
  const zones = useMemo<ZoneSummary[]>(
    () => [
      zoneSummary(ZONES.A.id, ZONES.A.label, '조립장', false, 0),

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
          <small>{k.needs ? SCENE===1?'러그 위치·용접·보강 검토':'보강 누락 · 담당자 확인' : SCENE<4?'확인 요청 없음':'조치 기록됨 · 작업은 미완료'}</small>
        </div>
        <div className="cn-kpi">
          <span>진행 중 사건</span>
          <b className="num">{k.activeEvents}</b>
          <small>EV-B01</small>
        </div>
        <div className={`cn-kpi${k.ackDone === k.ackTotal ? ' ok' : ''}`}>
          <span>지시 수신 확인</span>
          <b className="num">{k.ackDone}/{k.ackTotal}</b>
          <small>협력사 작업자</small>
        </div>
        <div className={`cn-kpi${k.moved ? ' ok' : ''}`}>
          <span>B-01 작업 상태</span>
          <b className="num">{k.move}</b>
          <small>{SCENE===1?'검토 담당자 확인 필요':SCENE===2?'Rev.2 · 지침 배포':SCENE===3?'러그·용접·보강 지시':'보강 누락 · 재작업 후 확인'}</small>
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
            ariaLabel="B-01 관련 작업구역 지도"
            rotate
          />
        </section>

        <section className="cn-card cn-todo" aria-label="지금 확인할 것">
          <h2>지금 확인할 것</h2>
          {open.length === 0 ? (
            <p className="cn-empty">{SCENE===2?'Rev.2 승인·지침 배포가 완료되었습니다. 현장 담당자가 도면과 지침을 확인합니다.':SCENE===3?'작업 지시와 작업자의 응답이 기록되었습니다. 작업 후 확인 요청을 기다립니다.':'미완료 유지와 재작업 요청을 기록했습니다. 보강 작업 후 현장 재확인이 필요합니다.'}</p>
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
