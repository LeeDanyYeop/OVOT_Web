import { RISK_LABEL } from '../lib/format'
import type { ZoneBrief } from '../types'

export function RiskBadge({ zone }: { zone: Pick<ZoneBrief, 'risk_level' | 'is_work_area'> }) {
  if (!zone.is_work_area) return <span className="badge badge-neutral">작업구역 아님</span>
  return <span className={`badge badge-risk-${zone.risk_level}`}>{RISK_LABEL[zone.risk_level]}</span>
}
