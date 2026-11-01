import { useSyncExternalStore } from 'react'

// 현장 녹음 발화(ovot-sync D1)와 확인 요청 처리 상태. 관제 Worker 의 같은 출처 API 를 10초마다 읽는다.
export type Label = { category: string; subcategory: string; evidence: string; confidence: number; needs_review: boolean }
export type Utterance = {
  voice_id: string
  worker_id: string | null
  worker_name?: string | null
  block_id: string | null
  task_id: string | null
  transcript: string
  recorded_at: string | null
  classification_status: 'SUCCEEDED' | 'FAILED' | 'UNCLASSIFIED'
  schema_version: string | null
  needs_review: boolean | null
  labels: Label[]
  demo?: boolean
}
export type Ack = { at: string; by: string; last?: string }

// AI(관제 Worker)가 대화 맥락으로 묶고 판단한 결과
export type Review = { voice_ids: string[]; block: string | null; needs_check: boolean; route: 'lead' | 'designer' | 'both' | 'none'; title: string; detail: string; key_voice_id: string | null }
// 도면 변경 배포(설계자) ↔ 현장 전달(현장 담당자)
// kind 'order' = 확인 요청에서 담당자가 바로 보낸 작업 지시. worker* = 작업자 앱에서 현장 작업자가 확인한 기록
export type Drawing = { id: string; kind?: 'drawing' | 'order'; block: string; rev: string; note: string; guide: string; by: string; at: string; from?: string; relayBy?: string; relayAt?: string; workerAckBy?: string; workerAckAt?: string
  /** 첨부한 도면 파일 */ file?: { id: string; name: string; size: number; type: string; url: string }
  /** 'voice' = 현장 발화로 전달이 확인됨 */ relayVia?: 'voice' | 'button'; relayQuote?: string }
// 블록별 30분 현황 (관제 Worker 예약 실행이 갱신)
export type BlockStatus = { at: string; fresh: boolean; new_count?: number; current_work?: string; team?: string; progress?: string; issues?: string[]; orders?: string[]; unresolved?: string[]; flag?: string; tasks?: { text: string; state: '완료' | '진행' | '예정' | '재작업' }[] }
export type StatusMap = Record<string, { current: BlockStatus; history: BlockStatus[] }>
// since: '시연 초기화'를 누른 시각. 그 전 발화로 생긴 확인 요청은 숨긴다 (B-04 시연 데이터는 예외)
type State = { items: Utterance[] | null; failed: boolean; acks: Record<string, Ack>; reviews: Review[] | null; reviewError: string | null; drawings: Drawing[]; status: StatusMap; since: number }
let state: State = { items: null, failed: false, acks: {}, reviews: null, reviewError: null, drawings: [], status: {}, since: 0 }
const listeners = new Set<() => void>()
const emit = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }
export const setDrawingsLocal = (drawings: Drawing[]) => emit({ drawings })
export const getState = () => state
// '지금 갱신' — 30분을 기다리지 않고 바로 블록 현황을 다시 만든다
export async function refreshStatus(block?: string) {
  const r = await fetch(`/api/status/refresh${block ? `?block=${encodeURIComponent(block)}` : ''}`, { method: 'POST' })
  const d = (await r.json()) as StatusMap & { error?: boolean; message?: string }
  if (!r.ok || d.error) throw new Error(d.message ?? `갱신 실패 (${r.status})`)
  emit({ status: cleanStatus(d) })
}
const cleanStatus = (raw: Record<string, unknown>): StatusMap => Object.fromEntries(Object.entries(raw ?? {}).filter(([k, v]) => /^B-\d+$/.test(k) && v && typeof v === 'object')) as StatusMap

// 관제 Worker /api/state 한 번에 발화·AI 판단·확인 기록·도면을 받는다.
// 10초마다, 화면을 보고 있을 때만 읽는다 (다시 보면 바로 한 번 읽음)
async function poll() {
  if (document.hidden) return
  try {
    const r = await fetch('/api/state', { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { utterances: Utterance[]; acks: Record<string, unknown>; drawings: Record<string, unknown>; status: Record<string, unknown>; review: { conversations?: Review[]; error?: string } }
    const acks = Object.fromEntries(Object.entries(d.acks ?? {}).filter(([, v]) => v && typeof v === 'object' && 'at' in (v as object))) as Record<string, Ack>
    const drawings = Object.values(d.drawings ?? {}).filter((v): v is Drawing => !!v && typeof v === 'object' && 'rev' in (v as object)).sort((a, b) => b.id.localeCompare(a.id))
    emit({
      items: d.utterances, failed: false, acks, drawings, status: cleanStatus(d.status),
      since: typeof d.acks?.__since === 'string' ? new Date(d.acks.__since as string).getTime() || 0 : 0,
      reviews: d.review?.conversations ?? state.reviews,
      reviewError: d.review?.error ?? null,
    })
  } catch {
    emit({ failed: true })
  }
}

let timer = 0
const onVisible = () => { if (!document.hidden) void poll() }
function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) { void poll(); timer = window.setInterval(poll, 10000); document.addEventListener('visibilitychange', onVisible) }
  return () => { listeners.delete(l); if (!listeners.size) { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) } }
}
export const useUtterances = () => useSyncExternalStore(subscribe, () => state)

// 담당자가 확인할 발화: 문제·이상 / 미완료 / 작업 보류로 분류된 것 (단순 '검토 필요' 표시만으로는 올리지 않는다)
export function reasonsOf(u: Utterance): string[] {
  const r: string[] = []
  const prob = u.labels.find((l) => l.category === '문제·이상 상황')
  if (prob) r.push(prob.subcategory)
  if (u.labels.some((l) => l.subcategory === '미완료')) r.push('아직 안 끝남')
  if (u.labels.some((l) => l.subcategory === '작업 보류')) r.push('작업 보류')
  return r
}
// 한 줄 요약: "보강재 · 아직 안 끝남"
export function summaryOf(u: Utterance): string {
  const target = u.labels.find((l) => l.category === '작업 대상' && l.subcategory !== '블록')?.subcategory
  return [target, ...reasonsOf(u)].filter(Boolean).join(' · ') || '확인 필요'
}
// 발화 옆 짧은 표시(최대 2개) — 분류표 용어 대신 현장 말로
const CHIP: [(l: Label) => boolean, string][] = [
  [(l) => l.category === '문제·이상 상황', '문제'],
  [(l) => l.subcategory === '미완료', '미완료'],
  [(l) => l.subcategory === '작업 보류', '보류'],
  [(l) => l.category === '작업 지시 정보' || l.subcategory === '작업 지시' || l.subcategory === '작업 요청', '지시'],
  [(l) => l.subcategory === '작업 완료 보고' || l.subcategory === '작업 완료', '완료 보고'],
  [(l) => l.subcategory === '작업 진행 보고' || l.subcategory === '작업 시작 보고', '진행 보고'],
  [(l) => l.subcategory === '질문' || l.subcategory === '사실 확인', '질문'],
  [(l) => l.subcategory === '응답·수락' || l.subcategory === '질문에 대한 응답', '응답'],
]
export function chipsOf(u: Utterance): string[] {
  const out: string[] = []
  for (const [hit, name] of CHIP) if (u.labels.some(hit) && !out.includes(name)) out.push(name)
  return out.slice(0, 2)
}
// 대화 = AI 가 맥락으로 묶은 발화들. 확인 요청은 결론이 확인 필요(needs_check)인 대화만, 역할(route)에 맞는 사람에게
export type Convo = { id: string; block: string | null; worker: string | null; lines: Utterance[]; last: Utterance; reasons: string[]; title: string; detail: string; route: Review['route']; needsCheck: boolean }
const ts = (u: Utterance) => (u.recorded_at ? new Date(u.recorded_at).getTime() : 0)
export function conversations(items: Utterance[], reviews: Review[] | null): Convo[] {
  if (!reviews) return []
  const byId = new Map(items.map((u) => [u.voice_id, u]))
  return reviews.flatMap((r) => {
    const lines = r.voice_ids.map((v) => byId.get(v)).filter((u): u is Utterance => !!u).sort((a, b) => ts(a) - ts(b))
    if (!lines.length) return []
    const last = (r.key_voice_id && byId.get(r.key_voice_id)) || lines[lines.length - 1]
    return [{ id: lines[0].voice_id, block: r.block ?? last.block_id, worker: last.worker_name ?? last.worker_id, lines, last, reasons: reasonsOf(last), title: r.title, detail: r.detail, route: r.route, needsCheck: r.needs_check }]
  }).sort((a, b) => ts(b.last) - ts(a.last))
}
// 시연 초기화 뒤에 나온 발화가 하나라도 있으면 보인다 (AI 가 초기화 전 발화와 한 대화로 묶고 그 전 발화를 결론으로 골라도)
export const forRole = (c: Convo, role: 'lead' | 'designer') => c.needsCheck && (c.route === 'both' || c.route === role) && c.lines.some((u) => !!u.demo || ts(u) > state.since)
export const isAcked = (c: Convo, acks: Record<string, Ack>) => acks[c.id]?.last === c.last.voice_id
export const openRequests = (s: State, role: 'lead' | 'designer') => conversations(s.items ?? [], s.reviews).filter((c) => forRole(c, role) && !isAcked(c, s.acks))

export async function acknowledge(c: Convo, by: string) {
  const at = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const ack = { at, by, last: c.last.voice_id }
  emit({ acks: { ...state.acks, [c.id]: ack } })
  await fetch('/sync/acks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [c.id]: ack }) }).catch(() => {})
}
export async function undoAck(voiceId: string) {
  const next = { ...state.acks }
  delete next[voiceId]
  emit({ acks: next })
  await fetch('/sync/acks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [voiceId]: null }) }).catch(() => {})
}

export const when = (iso: string | null) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
