import { ALL, UNASSIGNED, type Model } from '../data/model'
import { TASK_STATUS_LABEL } from '../types'
import { EmptyState, ErrorState, Icon, PanelHead, Skeleton } from './ui'

interface Props {
  model: Model | null
  totalNeeds: number
  selectedZone: string
  onSelectZone: (zone: string) => void
  loadError: string | null
}

const ORDER = ['IN_PROGRESS', 'PENDING', 'DONE', 'CANCELLED']

export function ZonePanel({ model, totalNeeds, selectedZone, onSelectZone, loadError }: Props) {
  return (
    <section className="panel alt" aria-label="작업구역">
      <PanelHead title="작업구역" sub="구역을 선택하세요" />
      <div className="panel-body">
        {!model ? (
          loadError ? <ErrorState title="구역 정보를 불러오지 못했습니다">{loadError}</ErrorState> : <Skeleton rows={6} />
        ) : (
          <ul className="zone-list">
            <li>
              <button className={`zone-item zone-all${selectedZone === ALL ? ' selected' : ''}`} onClick={() => onSelectZone(ALL)} aria-pressed={selectedZone === ALL}>
                <span className="z-name">전체 구역</span>
                <Icon name="chevron" className="icon z-chev" />
                <span className="z-line">구역 {model.zones.length}곳</span>
                {totalNeeds > 0 && (
                  <span className="z-stats">
                    <span className="badge badge-warn">확인 필요 {totalNeeds}</span>
                  </span>
                )}
              </button>
            </li>
            {model.zones.length === 0 && <EmptyState title="표시할 구역이 없습니다">작업·발화 데이터와 구역 매핑 설정이 모두 비어 있습니다.</EmptyState>}
            {model.zones.map((z) => {
              const sel = selectedZone === z.zone_id
              const statusText = ORDER.filter((s) => z.statusCounts[s])
                .map((s) => `${TASK_STATUS_LABEL[s]} ${z.statusCounts[s]}`)
                .concat(Object.keys(z.statusCounts).filter((s) => !ORDER.includes(s)).map((s) => `${s} ${z.statusCounts[s]}`))
                .join(' · ')
              return (
                <li key={z.zone_id}>
                  <button className={`zone-item${sel ? ' selected' : ''}`} onClick={() => onSelectZone(z.zone_id)} aria-pressed={sel}>
                    <span className="z-name">
                      {z.label}
                      {z.description && <small>{z.description}</small>}
                    </span>
                    <Icon name="chevron" className="icon z-chev" />
                    <span className="z-line" title={z.taskTypes.join(', ')}>
                      {z.taskTypes.length ? z.taskTypes.join(', ') : '등록된 작업 없음'}
                    </span>
                    <span className="z-stats">
                      {statusText ? <span className="badge">{statusText}</span> : <span className="badge badge-line">작업 데이터 없음</span>}
                      {z.needsConfirmation > 0 && <span className="badge badge-warn">확인 필요 {z.needsConfirmation}</span>}
                      {!z.inConfig && <span className="badge badge-line" title="zone-map.json 에 없는 zone_id">매핑 없음</span>}
                    </span>
                  </button>
                </li>
              )
            })}
            {(model.unassigned.voices > 0 || model.unassigned.events > 0) && (
              <li>
                <button className={`zone-item${selectedZone === UNASSIGNED ? ' selected' : ''}`} onClick={() => onSelectZone(UNASSIGNED)} aria-pressed={selectedZone === UNASSIGNED}>
                  <span className="z-name">구역 미지정</span>
                  <Icon name="chevron" className="icon z-chev" />
                  <span className="z-line">발화·작업에서 구역을 찾을 수 없는 기록</span>
                  <span className="z-stats">
                    <span className="badge">발화 {model.unassigned.voices} · 분석 {model.unassigned.events}</span>
                    {model.unassigned.needsConfirmation > 0 && <span className="badge badge-warn">확인 필요 {model.unassigned.needsConfirmation}</span>}
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <footer className="panel-foot">작업자 수: 위치 등록 API 미연동으로 표시하지 않음</footer>
    </section>
  )
}
