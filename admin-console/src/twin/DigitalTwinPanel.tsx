import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig, ZoneMap } from '../config'
import { ALL, UNASSIGNED, refMatches, type Model } from '../data/model'
import { EVENT_STATUS_LABEL, TASK_STATUS_LABEL, type Snapshot } from '../types'
import { hm, hms } from '../lib/format'
import { EmptyState, PanelHead, Skeleton } from '../components/ui'
import { buildTwinTasks, type TwinHandle, type TwinStatePayload, type TwinZoneState } from './bridge'
import { SchematicTwin } from './SchematicTwin'
import { UnityTwin } from './UnityTwin'

interface Props {
  config: AppConfig
  zoneMap: ZoneMap
  snapshot: Snapshot | null
  model: Model | null
  selectedZone: string
  onSelectZone: (zone: string) => void
  onOpenEvent: (eventId: number) => void
  lastSuccessAt: number | null
  stale: boolean
}

const HEADLINE: Record<string, string> = {
  IN_PROGRESS: '진행 중',
  PENDING: '대기',
  DONE: '완료',
  CANCELLED: '취소',
  MIXED: '혼합',
}

export function DigitalTwinPanel({ config, zoneMap, snapshot, model, selectedZone, onSelectZone, onOpenEvent, lastSuccessAt, stale }: Props) {
  const twin = useRef<TwinHandle>(null)
  const [unityFailed, setUnityFailed] = useState<string | null>(null)
  const [twinMsg, setTwinMsg] = useState<string | null>(null)
  const useUnity = config.unity.enabled && !unityFailed

  const zoneStates: TwinZoneState[] = useMemo(() => {
    if (!model) return []
    return model.zones.map((z) => ({
      zone_id: z.zone_id,
      label: z.label,
      unity_object: zoneMap.zones.find((m) => m.zone_id === z.zone_id)?.unityObject ?? null,
      status: z.headline === 'NO_DATA' && z.voiceCount === 0 ? 'nodata' : z.needsConfirmation > 0 ? 'attention' : 'normal',
      needs_confirmation: z.needsConfirmation,
      task_headline: z.tasks.length ? `작업 ${z.tasks.length}건 · ${HEADLINE[z.headline] ?? z.headline}` : z.voiceCount ? `발화 ${z.voiceCount}건 · 작업 없음` : '작업 데이터 없음',
    }))
  }, [model, zoneMap])

  const selectedId = selectedZone === ALL || selectedZone === UNASSIGNED ? null : selectedZone

  // 웹 선택 → Unity
  useEffect(() => {
    twin.current?.selectZone(selectedId)
  }, [selectedId])

  // 서버에서 받은(확인된) 상태 → Unity. 조회 실패 중에는 보내지 않는다.
  useEffect(() => {
    if (!snapshot || stale) return
    const payload: TwinStatePayload = {
      generated_at: new Date(snapshot.receivedAt).toISOString(),
      zones: zoneStates,
      tasks: buildTwinTasks(zoneMap, snapshot.tasks),
    }
    twin.current?.applyState(payload)
  }, [snapshot, zoneStates, zoneMap, stale])

  const zone = model?.zones.find((z) => z.zone_id === selectedId) ?? null
  const unshaped = model?.zones.filter((z) => !zoneMap.zones.find((m) => m.zone_id === z.zone_id)?.shape) ?? []
  const confirmEvents =
    snapshot && model
      ? snapshot.events.filter((e) => e.event_status === 'NEEDS_CONFIRMATION' && refMatches(model.eventZone.get(e.event_id), selectedZone))
      : []

  return (
    <section className="panel" aria-label="조선소 디지털트윈">
      <PanelHead title="조선소 디지털트윈" sub="작업 위치 및 진행 현황">
        <label className="sr-only" htmlFor="twin-zone">작업구역 선택</label>
        <select id="twin-zone" className="twin-select" value={selectedZone} onChange={(e) => onSelectZone(e.target.value)}>
          <option value={ALL}>전체 구역</option>
          {model?.zones.map((z) => (
            <option key={z.zone_id} value={z.zone_id}>
              {z.label}
            </option>
          ))}
          {model && (model.unassigned.voices > 0 || model.unassigned.events > 0) && <option value={UNASSIGNED}>구역 미지정</option>}
        </select>
      </PanelHead>

      <div className="twin-status">
        <div className="left">
          {useUnity ? <span className="badge badge-dark">Unity 연결</span> : <span className="badge badge-line">디지털트윈 연결 전 · 구역도</span>}
          {unityFailed && <span className="tag tag-warn" title={unityFailed}>Unity 로드 실패</span>}
        </div>
        <span className="num">
          데이터 수신 {lastSuccessAt ? hms(lastSuccessAt) : '—'}
          {stale && <span className="tag-warn"> · 갱신 실패</span>}
        </span>
      </div>

      <div className="twin-stage">
        {!snapshot ? (
          <div className="twin-overlay">구역 데이터를 불러오는 중…</div>
        ) : useUnity ? (
          <UnityTwin
            ref={twin}
            unity={config.unity}
            zoneMap={zoneMap}
            tasks={snapshot.tasks}
            onSelectZone={(z) => onSelectZone(z ?? ALL)}
            onMessage={setTwinMsg}
            onFailed={setUnityFailed}
          />
        ) : (
          <SchematicTwin ref={twin} zoneMap={zoneMap} zones={zoneStates} selectedZoneId={selectedId} onSelectZone={(z) => onSelectZone(z ?? ALL)} />
        )}
        {!useUnity && snapshot && (
          <div className="twin-legend" aria-hidden>
            <span><i className="lg" />작업 데이터</span>
            <span><i className="lg lg-attn" />확인 필요</span>
            <span><i className="lg lg-sel" />선택 구역</span>
            <span><i className="lg lg-none" />데이터 없음</span>
          </div>
        )}
      </div>

      <div className="twin-detail">
        {twinMsg && <p className="note">{twinMsg}</p>}
        {!snapshot || !model ? (
          <Skeleton rows={3} />
        ) : !zone ? (
          <>
            <div className="section-label">
              <span>{selectedZone === UNASSIGNED ? '구역 미지정 데이터' : '전체 구역 개요'}</span>
              <span>구역을 선택하면 상세가 표시됩니다</span>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>구역</th>
                  <th>작업</th>
                  <th>상태</th>
                  <th style={{ textAlign: 'right' }}>확인 필요</th>
                </tr>
              </thead>
              <tbody>
                {model.zones.map((z) => (
                  <tr key={z.zone_id} onClick={() => onSelectZone(z.zone_id)} style={{ cursor: 'pointer' }}>
                    <td><b>{z.label}</b></td>
                    <td className="num">{z.tasks.length}</td>
                    <td className="muted">{z.tasks.length ? HEADLINE[z.headline] : '—'}</td>
                    <td className="num" style={{ textAlign: 'right', color: z.needsConfirmation ? 'var(--warn)' : undefined, fontWeight: z.needsConfirmation ? 700 : undefined }}>
                      {z.needsConfirmation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unshaped.length > 0 && <p className="note">구역도 좌표가 설정되지 않은 구역: {unshaped.map((z) => z.zone_id).join(', ')} (zone-map.json 에 추가하면 지도에 표시됩니다)</p>}
          </>
        ) : (
          <>
            <div className="section-label">
              <span>
                <span className="count">{zone.label}</span> {zone.description && `· ${zone.description}`}
              </span>
              <span className="mono">{zone.zone_id}</span>
            </div>
            {zone.tasks.length === 0 ? (
              <EmptyState title="이 구역에 등록된 작업이 없습니다">서버의 tasks 에 이 zone_id 를 가진 작업이 없습니다.</EmptyState>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>작업</th>
                    <th>블록</th>
                    <th>상태</th>
                    <th style={{ textAlign: 'right' }}>갱신</th>
                  </tr>
                </thead>
                <tbody>
                  {zone.tasks.map((t) => (
                    <tr key={t.task_id}>
                      <td>
                        <b>{t.task_type}</b> <span className="mono muted">{t.task_id}</span>
                      </td>
                      <td>{t.block_id}</td>
                      <td>{TASK_STATUS_LABEL[t.status] ?? t.status}</td>
                      <td className="num muted" style={{ textAlign: 'right' }}>{hm(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="section-label">
              <span>확인 필요 이벤트</span>
              <span className="count">{confirmEvents.length}</span>
            </div>
            {confirmEvents.length === 0 ? (
              <p className="note">이 구역에 확인 필요 상태의 이벤트가 없습니다.</p>
            ) : (
              <table className="mini-table">
                <tbody>
                  {confirmEvents.map((e) => (
                    <tr key={e.event_id}>
                      <td>
                        <button className="row-btn" onClick={() => onOpenEvent(e.event_id)}>
                          <span className="summary-line">{e.summary ?? '(요약 없음)'}</span>
                          <span className="tag" style={{ display: 'block' }}>
                            {model.eventTypeByCode.get(e.event_type)?.description ?? e.event_type} · {EVENT_STATUS_LABEL[e.event_status]} · {hm(e.created_at)}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  )
}
