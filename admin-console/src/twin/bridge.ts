/**
 * 웹 ↔ Unity 디지털트윈 연동 규약.
 *
 * Unity 는 DB 에 직접 접속하지 않는다. 웹이 OVOT-Backend 에서 받은 데이터를
 * 아래 메시지로 Unity 에 전달하고, Unity 는 사용자의 클릭만 웹으로 알린다.
 *
 *  웹 → Unity  (unityInstance.SendMessage(bridgeObject, method, json))
 *    - SelectZone(json: { zone_id: string | null, unity_object: string | null })
 *    - ApplyState(json: TwinStatePayload)   ← 서버 조회에 성공했을 때만 전송
 *
 *  Unity → 웹
 *    - window.OVOTTwin.onObjectClicked(objectName: string)   (Unity .jslib 에서 호출)
 *    - 또는 iframe 임베드 시 window.postMessage({ type: 'ovot-twin:object-click', object }, '*')
 *
 * Unity 오브젝트 이름 ↔ zone_id / block_id / task_id 매핑은 src/settings/zone-map.json 에서 관리한다.
 */
import type { ZoneMap } from '../config'
import type { Task } from '../types'

export type TwinZoneStatus = 'normal' | 'attention' | 'nodata'

export interface TwinZoneState {
  zone_id: string
  label: string
  unity_object: string | null
  status: TwinZoneStatus
  needs_confirmation: number
  task_headline: string
}

export interface TwinStatePayload {
  generated_at: string
  zones: TwinZoneState[]
  tasks: { task_id: string; block_id: string; zone_id: string; status: string; unity_objects: string[] }[]
}

export interface TwinHandle {
  selectZone(zoneId: string | null): void
  applyState(state: TwinStatePayload): void
}

export function unityObjectForZone(map: ZoneMap, zoneId: string | null): string | null {
  if (!zoneId) return null
  return map.zones.find((z) => z.zone_id === zoneId)?.unityObject ?? map.unityObjects.find((o) => o.zone_id === zoneId)?.object ?? null
}

/** Unity 오브젝트 이름 → zone_id. 블록·작업 오브젝트는 연결된 작업의 구역으로 해석하되, 여러 구역이면 확정하지 않는다. */
export function zoneForUnityObject(map: ZoneMap, tasks: Task[], object: string): { zoneId: string | null; reason: string } {
  const z = map.zones.find((x) => x.unityObject === object)
  if (z) return { zoneId: z.zone_id, reason: 'zone' }
  const o = map.unityObjects.find((x) => x.object === object)
  if (!o) return { zoneId: null, reason: `매핑되지 않은 Unity 오브젝트: ${object}` }
  if (o.zone_id) return { zoneId: o.zone_id, reason: 'zone' }
  const related = tasks.filter((t) => (o.task_id && t.task_id === o.task_id) || (o.block_id && t.block_id === o.block_id))
  const zones = [...new Set(related.map((t) => t.zone_id))]
  if (zones.length === 1) return { zoneId: zones[0], reason: 'task' }
  if (zones.length > 1) return { zoneId: null, reason: `${object} 은(는) 여러 구역(${zones.join(', ')})의 작업과 연결되어 있어 구역을 확정하지 않았습니다.` }
  return { zoneId: null, reason: `${object} 에 연결된 작업이 없습니다.` }
}

export function buildTwinTasks(map: ZoneMap, tasks: Task[]): TwinStatePayload['tasks'] {
  return tasks.map((t) => ({
    task_id: t.task_id,
    block_id: t.block_id,
    zone_id: t.zone_id,
    status: t.status,
    unity_objects: map.unityObjects.filter((o) => o.task_id === t.task_id || o.block_id === t.block_id).map((o) => o.object),
  }))
}
