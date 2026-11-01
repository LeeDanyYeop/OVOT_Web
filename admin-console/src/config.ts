/**
 * 런타임 설정.
 * 우선순위: URL 파라미터 > 이 브라우저의 설정 패널 값 > public/ovot-config.json > 기본값
 * DB 접속 정보(비밀번호 등)는 어떤 경로로도 프런트엔드에 두지 않는다.
 */

export type Mode = 'live' | 'demo'

export interface UnityConfig {
  enabled: boolean
  loaderUrl: string
  dataUrl: string
  frameworkUrl: string
  codeUrl: string
  /** Unity 씬에서 웹 메시지를 받을 GameObject 이름 */
  bridgeObject: string
}

export interface AppConfig {
  mode: Mode
  apiBaseUrl: string
  pollIntervalMs: number
  requestTimeoutMs: number
  listLimit: number
  unity: UnityConfig
}

export interface ZoneShape {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneMapEntry {
  zone_id: string
  label: string
  description: string | null
  shape: ZoneShape | null
  /** 캔버스 화면 선박 평면도에서의 가로 구간 (0~1200) */
  segment?: { from: number; to: number } | null
  unityObject: string | null
  /** 흰 배경 화면 3D 점 작업장에서 이 구역에 속하는 시설 키 (하나 또는 여러 개) */
  scene?: SceneKey | SceneKey[] | null
  /** 현황 타일 사진 (public/ 기준 경로) */
  image?: string | null
  /** 사진 잘림 위치 (CSS object-position, 예: '50% 30%') */
  imagePosition?: string | null
  /** 'ai' 면 타일에 'AI 생성 이미지' 표시 */
  imageKind?: 'ai' | 'photo' | null
}

export type SceneKey = 'blockYard' | 'workshop' | 'shipAft' | 'gantry' | 'shipFore' | 'quay'

export const sceneKeysOf = (z: ZoneMapEntry): SceneKey[] => (z.scene ? (Array.isArray(z.scene) ? z.scene : [z.scene]) : [])

export interface ZoneMap {
  viewBox: [number, number, number, number]
  zones: ZoneMapEntry[]
  unityObjects: { object: string; zone_id?: string; block_id?: string; task_id?: string }[]
}

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'live',
  apiBaseUrl: (import.meta.env.VITE_OVOT_API_BASE as string | undefined) ?? 'http://localhost:8000',
  pollIntervalMs: 10000,
  requestTimeoutMs: 8000,
  listLimit: 500,
  unity: { enabled: false, loaderUrl: '', dataUrl: '', frameworkUrl: '', codeUrl: '', bridgeObject: 'OVOTBridge' },
}

import bundledZoneMap from './settings/zone-map.json'

/** 빌드에 포함되는 기본 매핑. 배포 폴더에 zone-map.json 을 두면 그 파일이 우선한다. */
const BUNDLED_ZONE_MAP = bundledZoneMap as unknown as ZoneMap

const LS_KEY = 'ovot-admin-settings'

export type LocalOverrides = Partial<Pick<AppConfig, 'mode' | 'apiBaseUrl' | 'pollIntervalMs'>>

export function readLocalOverrides(): LocalOverrides {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as LocalOverrides) : {}
  } catch {
    return {}
  }
}

export function writeLocalOverrides(v: LocalOverrides): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(v))
  } catch {
    /* 저장소를 쓸 수 없는 환경이면 이번 세션에만 적용 */
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function clampInterval(ms: unknown, fallback: number): number {
  const n = Number(ms)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, 2000), 300000)
}

export async function loadConfig(): Promise<{ config: AppConfig; zoneMap: ZoneMap; configFileFound: boolean }> {
  const base = import.meta.env.BASE_URL
  const [file, zoneMap] = await Promise.all([
    fetchJson<Partial<AppConfig>>(`${base}ovot-config.json`),
    fetchJson<ZoneMap>(`${base}zone-map.json`),
  ])
  const local = readLocalOverrides()
  const params = new URLSearchParams(window.location.search)
  const urlMode = params.get('mode')
  const urlApi = params.get('api')

  const merged: AppConfig = {
    ...DEFAULT_CONFIG,
    ...(file ?? {}),
    ...local,
    unity: { ...DEFAULT_CONFIG.unity, ...(file?.unity ?? {}) },
  }
  if (urlMode === 'demo' || urlMode === 'live') merged.mode = urlMode
  if (urlApi) merged.apiBaseUrl = urlApi
  merged.apiBaseUrl = merged.apiBaseUrl.replace(/\/+$/, '')
  merged.pollIntervalMs = clampInterval(merged.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs)

  return { config: merged, zoneMap: zoneMap ?? BUNDLED_ZONE_MAP, configFileFound: file !== null }
}
