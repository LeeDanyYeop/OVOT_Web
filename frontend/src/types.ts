export type RiskLevel = 'low' | 'medium' | 'high'
export type CheckInSource = 'nfc' | 'qr' | 'manual'

export interface WorkerBrief {
  id: string
  employee_number: string
  name: string
  role: string
  team: string
}

export interface Me extends WorkerBrief {
  is_admin: boolean
}

export interface ZoneBrief {
  id: string
  name: string
  risk_level: RiskLevel
  is_work_area: boolean
}

export interface CurrentLocation {
  zone: ZoneBrief
  updated_at: string
  source: CheckInSource | 'seed'
  source_event_id: string
  is_stale: boolean
}

export interface Assignment {
  id: number
  title: string
  status: string
  zone: ZoneBrief
  assigned_at: string
  readiness: 'ready' | 'not_in_zone'
}

export interface MeResponse {
  worker: Me
  current_location: CurrentLocation | null
  assignment: Assignment | null
}

/** Canonical event envelope + display fields. Future site events share this shape. */
export interface LocationEvent {
  event_id: string
  event_type: 'worker_location_changed' | 'worker_location_confirmed'
  worker_id: string
  zone_id: string
  previous_zone_id: string | null
  occurred_at: string
  source: CheckInSource | 'seed'
  source_tag_id: string | null
  client_reported_at: string | null
  worker: WorkerBrief
  zone: ZoneBrief
  previous_zone: ZoneBrief | null
  tag_code: string | null
}

export interface TagAlert {
  id: number
  event_type: 'tag_scan_rejected'
  raw_tag_code: string
  reason: 'unknown_tag' | 'inactive_tag' | 'inactive_zone' | 'invalid_format'
  source: CheckInSource
  occurred_at: string
  worker: WorkerBrief
}

export interface CheckInResult {
  status: 'changed' | 'confirmed' | 'duplicate'
  worker_id: string
  worker_name: string
  zone_id: string
  zone_name: string
  previous_zone_id: string | null
  previous_zone_name: string | null
  checked_in_at: string
  event_id: string
  tag_id: string
}

export interface WorkerLocationItem {
  worker: WorkerBrief
  current_location: CurrentLocation | null
}

export interface WorkersLocations {
  summary: {
    total_workers: number
    in_work_zone: number
    outside_work_area: number
    unregistered: number
    tag_alerts_24h: number
  }
  items: WorkerLocationItem[]
  generated_at: string
}

export interface ZoneWorker extends WorkerBrief {
  updated_at: string | null
  source: string | null
  last_zone?: ZoneBrief | null
}

export interface ZoneState extends ZoneBrief {
  description: string | null
  is_active: boolean
  worker_count: number
  workers: ZoneWorker[]
  last_event_at: string | null
}

export interface ZonesState {
  zones: ZoneState[]
  unregistered_workers: ZoneWorker[]
  generated_at: string
}

export interface TagInfo {
  id: string
  tag_code: string
  label: string | null
  is_active: boolean
  installed_at: string
  zone: ZoneBrief
}

export interface VoiceClipInfo {
  clip_id: string
  event_type: 'voice_clip_recorded'
  worker: WorkerBrief
  zone: ZoneBrief | null
  mime_type: string
  size_bytes: number
  duration_ms: number | null
  client_started_at: string | null
  received_at: string
}

export type HubMessage =
  | { type: 'ready' }
  | { type: 'error'; code: string }
  | { type: 'worker_location_changed' | 'worker_location_confirmed'; data: LocationEvent }
  | { type: 'tag_scan_rejected'; data: TagAlert }
  | { type: 'voice_clip_recorded'; data: VoiceClipInfo }
