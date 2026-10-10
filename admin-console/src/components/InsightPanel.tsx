import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ALL, CATEGORY_NAME, handoffMatches, refMatches, UNASSIGNED, type Model } from '../data/model'
import {
  EVENT_STATUS_LABEL,
  HANDOFF_ACTION_LABEL,
  HANDOFF_STATUS_LABEL,
  HANDOFF_TRANSITIONS,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type Handoff,
  type OvotEvent,
  type Snapshot,
} from '../types'
import { hm } from '../lib/format'
import { EmptyState, ErrorState, Icon, PanelHead, Skeleton } from './ui'

export type Tab = 'confirm' | 'orders' | 'all' | 'work'

interface Actions {
  setEventStatus: (eventId: number, status: 'CONFIRMED' | 'REJECTED') => Promise<void>
  setTaskStatus: (taskId: string, status: string) => Promise<void>
  createHandoff: (b: { task_id: string; from_zone_id: string; to_zone_id: string }) => Promise<void>
  setHandoffStatus: (handoffId: number, status: string) => Promise<void>
}

interface Props {
  snapshot: Snapshot | null
  model: Model | null
  selectedZone: string
  selectedVoiceId: string | null
  onClearVoice: () => void
  onShowVoice: (voiceId: string) => void
  focusEvent: { id: number; nonce: number } | null
  actions: Actions
  stale: boolean
  loadError: string | null
  /** 캔버스 레이아웃: 제목 대신 넣을 머리 영역, 외부에서 탭 전환 요청 */
  head?: ReactNode
  tabRequest?: { tab: Tab; nonce: number } | null
  /** 한 가지 탭 내용만 표시 (탭 줄·머리·연동 상태 숨김) — 흰 배경 작업장 화면용 */
  only?: Tab
}

function omit<T>(o: Record<string, T>, k: string): Record<string, T> {
  const c = { ...o }
  delete c[k]
  return c
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

/** 같은 키에 대해 저장 중/실패 상태를 관리. 성공 전까지 화면 상태를 바꾸지 않는다. */
function usePending() {
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const run = async (key: string, fn: () => Promise<void>) => {
    setPending((p) => ({ ...p, [key]: true }))
    setErrors((x) => omit(x, key))
    try {
      await fn()
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: errMsg(e) }))
    } finally {
      setPending((x) => omit(x, key))
    }
  }
  return { pending, errors, run }
}

export function InsightPanel({ snapshot, model, selectedZone, selectedVoiceId, onClearVoice, onShowVoice, focusEvent, actions, stale, loadError, head, tabRequest, only }: Props) {
  const [tabState, setTab] = useState<Tab>('confirm')
  const tab = only ?? tabState
  useEffect(() => {
    if (tabRequest) setTab(tabRequest.tab)
  }, [tabRequest])
  const body = useRef<HTMLDivElement>(null)
  const { pending, errors, run } = usePending()

  const zoneEvents = useMemo(() => {
    if (!snapshot || !model) return []
    return snapshot.events
      .filter((e) => refMatches(model.eventZone.get(e.event_id), selectedZone))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.event_id - a.event_id)
  }, [snapshot, model, selectedZone])

  const needs = zoneEvents.filter((e) => e.event_status === 'NEEDS_CONFIRMATION')

  useEffect(() => {
    if (!focusEvent) return
    setTab('confirm')
    const t = window.setTimeout(() => {
      body.current?.querySelector<HTMLElement>(`[data-event="${focusEvent.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(t)
  }, [focusEvent])

  if (!snapshot || !model) {
    return (
      <section className="panel alt" aria-label="AI 상황 요약">
        {head ?? <PanelHead title="AI 상황 요약" sub="서버에 저장된 분석 결과" />}
        {loadError ? <ErrorState title="분석 결과를 불러오지 못했습니다">{loadError}</ErrorState> : <Skeleton rows={7} />}
      </section>
    )
  }

  const typeLabel = (e: OvotEvent) => {
    const t = model.eventTypeByCode.get(e.event_type)
    if (!t) return { cat: '미등록 코드', name: e.event_type, legacy: true }
    return { cat: CATEGORY_NAME[t.category_code] ?? t.category_code, name: t.description, legacy: false }
  }

  const EventItem = ({ e, quote = false, act = false }: { e: OvotEvent; quote?: boolean; act?: boolean }) => {
    const tl = typeLabel(e)
    const ref = model.eventZone.get(e.event_id)
    const voice = model.voiceById.get(e.voice_id)
    const task = e.task_id ? model.taskById.get(e.task_id) : undefined
    const key = `ev-${e.event_id}`
    const statusCls = e.event_status === 'NEEDS_CONFIRMATION' ? 'badge-warn' : e.event_status === 'CONFIRMED' ? 'badge-ok' : e.event_status === 'REJECTED' ? 'badge-danger' : ''
    return (
      <article className={`ev${e.event_status === 'NEEDS_CONFIRMATION' ? ' attn' : ''}`} data-event={e.event_id}>
        <div className="ev-head">
          <span className="ev-type" title={e.event_type}>
            {tl.cat !== tl.name && <>{tl.cat} › </>}
            <b>{tl.name}</b>
          </span>
          <span className={`badge ${statusCls}`}>{EVENT_STATUS_LABEL[e.event_status] ?? e.event_status}</span>
        </div>
        <p className={`ev-summary${e.summary ? '' : ' none'}`}>{e.summary ?? '요약 없음'}</p>
        {quote && voice && (
          <blockquote className="ev-quote">
            <cite>
              원문 · {voice.worker_id ?? '작업자 미상'} · {hm(voice.recorded_at)}
            </cite>
            {voice.transcript}
          </blockquote>
        )}
        <div className="ev-meta">
          <span className="tag num">{hm(e.created_at)}</span>
          {e.speech_type && <span className="tag">{model.speechTypeByCode.get(e.speech_type)?.description ?? e.speech_type}</span>}
          {e.task_id && <span className="tag">{e.task_id}{task ? ` ${task.task_type} · ${TASK_STATUS_LABEL[task.status] ?? task.status}` : ' (작업 정보 없음)'}</span>}
          {ref?.kind === 'zone' && <span className="tag">{model.zoneLabel(ref.zoneId)}</span>}
          {ref?.kind === 'none' && <span className="tag">구역 미지정</span>}
          {ref?.kind === 'conflict' && (
            <span className="tag tag-warn" title="발화 기록의 구역과 연결된 작업의 구역이 다릅니다. 어느 쪽으로도 확정하지 않았습니다.">
              구역 불일치: 발화 {model.zoneLabel(ref.voiceZone)} · 작업 {model.zoneLabel(ref.taskZone)}
            </span>
          )}
          {tl.legacy && <span className="tag tag-warn">event_types 에 없는 코드</span>}
          <span className="tag tag-link">
            <button className="link" onClick={() => onShowVoice(e.voice_id)}>근거 발언 보기</button>
          </span>
        </div>
        {act && (
          <div className="ev-actions">
            <button className="btn btn-primary btn-sm" disabled={!!pending[key]} onClick={() => run(key, () => actions.setEventStatus(e.event_id, 'CONFIRMED'))}>
              {pending[key] ? '저장 중…' : '확인'}
            </button>
            <button className="btn btn-sm" disabled={!!pending[key]} onClick={() => run(key, () => actions.setEventStatus(e.event_id, 'REJECTED'))}>
              반려
            </button>
            <span className="tag mono">#{e.event_id}</span>
          </div>
        )}
        {errors[key] && (
          <p className="ev-error" role="alert">
            저장하지 못했습니다 — {errors[key]}. 상태는 바뀌지 않았습니다. 다시 시도해 주세요.
          </p>
        )}
      </article>
    )
  }

  const selVoice = selectedVoiceId ? model.voiceById.get(selectedVoiceId) : undefined
  const selEvents = selectedVoiceId ? model.eventsByVoice.get(selectedVoiceId) ?? [] : []

  const groups: { title: string; items: OvotEvent[] }[] = [
    { title: model.speechTypeByCode.get('CMD')?.description ?? '작업 지시', items: zoneEvents.filter((e) => e.speech_type === 'CMD') },
    { title: model.speechTypeByCode.get('RPT')?.description ?? '상황 보고', items: zoneEvents.filter((e) => e.speech_type === 'RPT') },
    { title: '기타 (질문·확인·일반·미분류)', items: zoneEvents.filter((e) => e.speech_type !== 'CMD' && e.speech_type !== 'RPT') },
  ]

  return (
    <section className="panel alt" aria-label="AI 상황 요약">
      {!only && (head ?? <PanelHead title="AI 상황 요약" sub={`서버에 저장된 분석 결과 · ${selectedZone === ALL ? '전체 구역' : selectedZone === UNASSIGNED ? '구역 미지정' : model.zoneLabel(selectedZone)}`} />)}

      {!only && <div className="tabs" role="tablist">
        {(
          [
            ['confirm', '확인 필요', needs.length],
            ['orders', '지시·보고', null],
            ['all', '분석 기록', zoneEvents.length],
            ['work', '작업·인계', null],
          ] as [Tab, string, number | null][]
        ).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
            {n !== null && <span className={`n${k === 'confirm' && n > 0 ? ' warn' : ''}`}>{n}</span>}
          </button>
        ))}
      </div>}

      <div className="panel-body" ref={body}>
        {stale && <p className="note">마지막 갱신에 실패했습니다. 아래 내용은 이전에 받은 데이터이며 최신이 아닐 수 있습니다.</p>}

        {selVoice && !only && (
          <div className="selected-voice">
            <div className="selected-voice-head">
              <span>선택한 발언 · {selVoice.worker_id ?? '작업자 미상'} · {hm(selVoice.recorded_at)}</span>
              <button className="link" onClick={onClearVoice}>선택 해제</button>
            </div>
            {selEvents.length ? selEvents.map((e) => <EventItem key={e.event_id} e={e} act={e.event_status === 'NEEDS_CONFIRMATION'} />) : <p className="note" style={{ margin: 12 }}>이 발언에 연결된 분석 결과가 없습니다.</p>}
          </div>
        )}

        {tab === 'confirm' &&
          (needs.length === 0 ? (
            <EmptyState title="확인이 필요한 항목이 없습니다">NEEDS_CONFIRMATION 상태의 이벤트가 이 범위에 없습니다.</EmptyState>
          ) : (
            <>
              <div className="section-label">
                <span>사람의 확인이 필요한 분석 결과</span>
                <span className="count">{needs.length}건</span>
              </div>
              {needs.map((e) => <EventItem key={e.event_id} e={e} quote act />)}
            </>
          ))}

        {tab === 'orders' && (
          <>
            <p className="note">서버가 저장한 발화 의도(speech_type)와 이벤트 유형으로 분류했습니다. 담당자 정보는 서버 데이터에 없어 표시하지 않습니다.</p>
            {groups.map((g) => (
              <div key={g.title}>
                <div className="section-label">
                  <span>{g.title}</span>
                  <span className="count">{g.items.length}</span>
                </div>
                {g.items.length ? g.items.map((e) => <EventItem key={e.event_id} e={e} />) : <p className="note">해당 항목 없음</p>}
              </div>
            ))}
          </>
        )}

        {tab === 'all' && (
          <>
            <p className="note">최근 분석 결과 목록입니다. 구역 종합 요약 API 가 없어, 저장된 이벤트를 최신순으로 나열합니다. AI 가 새로 작성한 종합 요약이 아닙니다.</p>
            {zoneEvents.length ? zoneEvents.map((e) => <EventItem key={e.event_id} e={e} />) : <EmptyState title="분석 결과가 없습니다" />}
          </>
        )}

        {tab === 'work' && <WorkTab snapshot={snapshot} model={model} selectedZone={selectedZone} actions={actions} run={run} pending={pending} errors={errors} />}

        {!only && <>
        <div className="section-label" style={{ paddingTop: 20 }}>
          <span>연동 상태</span>
        </div>
        <dl className="twin-foot" style={{ padding: `0 var(--gutter) 18px` }}>
          <dt>디지털트윈 대조</dt>
          <dd>미연동 — 판정 로직 없음</dd>
          <dt>안전 확인 판정</dt>
          <dd>정보 없음 — 서버에 판정 결과 없음</dd>
          <dt>AI 제안</dt>
          <dd>미연동 — 새 분석 실행 기능 없음</dd>
        </dl>
        </>}
      </div>
    </section>
  )
}

/* ─────────────── 작업·인계 탭 ─────────────── */

function WorkTab({
  snapshot,
  model,
  selectedZone,
  actions,
  run,
  pending,
  errors,
}: {
  snapshot: Snapshot
  model: Model
  selectedZone: string
  actions: Actions
  run: (key: string, fn: () => Promise<void>) => Promise<void>
  pending: Record<string, boolean>
  errors: Record<string, string>
}) {
  const tasks = snapshot.tasks.filter((t) => selectedZone === ALL || t.zone_id === selectedZone)
  const handoffs = snapshot.handoffs.filter((h) => handoffMatches(h, selectedZone))
  const [draft, setDraft] = useState<Record<string, string>>({})
  const zoneIds = model.zones.map((z) => z.zone_id)
  const [form, setForm] = useState({ task_id: '', from_zone_id: '', to_zone_id: '' })

  return (
    <>
      <div className="section-label">
        <span>작업 상태 · tasks.status</span>
        <span className="count">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="note">이 범위에 등록된 작업이 없습니다.</p>
      ) : (
        <table className="mini-table">
          <tbody>
            {tasks.map((t) => {
              const key = `task-${t.task_id}`
              const val = draft[t.task_id] ?? t.status
              return (
                <tr key={t.task_id}>
                  <td>
                    <b>{t.task_type}</b>
                    <div className="tag">
                      {t.task_id} · 블록 {t.block_id} · {model.zoneLabel(t.zone_id)} · 갱신 {hm(t.updated_at)}
                    </div>
                    {errors[key] && <p className="ev-error">{errors[key]}</p>}
                  </td>
                  <td style={{ width: 150 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <select className="select" value={val} onChange={(e) => setDraft((d) => ({ ...d, [t.task_id]: e.target.value }))} aria-label={`${t.task_id} 상태`}>
                        {!(TASK_STATUSES as readonly string[]).includes(t.status) && <option value={t.status}>{t.status}</option>}
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={val === t.status || !!pending[key]}
                        onClick={() =>
                          run(key, async () => {
                            await actions.setTaskStatus(t.task_id, val)
                            setDraft((d) => omit(d, t.task_id))
                          })
                        }
                      >
                        {pending[key] ? '…' : '저장'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="note">작업 상태와 인계 상태는 서로 다른 값입니다. 인계를 수락·완료해도 작업 상태는 자동으로 바뀌지 않습니다.</p>

      <div className="section-label">
        <span>구역 간 인계 · handoffs</span>
        <span className="count">{handoffs.length}</span>
      </div>
      {handoffs.length === 0 && <p className="note">이 범위의 인계 기록이 없습니다.</p>}
      {handoffs.map((h) => (
        <HandoffRow key={h.handoff_id} h={h} model={model} run={run} pending={pending} errors={errors} onSet={actions.setHandoffStatus} />
      ))}

      <div className="section-label">
        <span>새 인계 요청</span>
      </div>
      <div className="form-grid">
        <label className="full">
          작업
          <select
            className="select"
            value={form.task_id}
            onChange={(e) => {
              const t = model.taskById.get(e.target.value)
              setForm({ task_id: e.target.value, from_zone_id: t?.zone_id ?? '', to_zone_id: form.to_zone_id })
            }}
          >
            <option value="">작업 선택</option>
            {snapshot.tasks.map((t) => (
              <option key={t.task_id} value={t.task_id}>
                {t.task_id} · {t.task_type} ({t.block_id})
              </option>
            ))}
          </select>
        </label>
        <label>
          보내는 구역
          <select className="select" value={form.from_zone_id} onChange={(e) => setForm({ ...form, from_zone_id: e.target.value })}>
            <option value="">선택</option>
            {zoneIds.map((z) => (
              <option key={z} value={z}>{model.zoneLabel(z)}</option>
            ))}
          </select>
        </label>
        <label>
          받는 구역
          <select className="select" value={form.to_zone_id} onChange={(e) => setForm({ ...form, to_zone_id: e.target.value })}>
            <option value="">선택</option>
            {zoneIds.map((z) => (
              <option key={z} value={z}>{model.zoneLabel(z)}</option>
            ))}
          </select>
        </label>
        <div className="full" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={!form.task_id || !form.from_zone_id || !form.to_zone_id || form.from_zone_id === form.to_zone_id || !!pending['ho-new']}
            onClick={() =>
              run('ho-new', async () => {
                await actions.createHandoff(form)
                setForm({ task_id: '', from_zone_id: '', to_zone_id: '' })
              })
            }
          >
            {pending['ho-new'] ? '요청 중…' : '인계 요청'}
          </button>
          {form.from_zone_id && form.from_zone_id === form.to_zone_id && <span className="tag tag-warn">보내는 구역과 받는 구역이 같습니다</span>}
        </div>
        {errors['ho-new'] && <p className="ev-error full">{errors['ho-new']}</p>}
      </div>
    </>
  )
}

const STEPS = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE']

function HandoffRow({
  h,
  model,
  run,
  pending,
  errors,
  onSet,
}: {
  h: Handoff
  model: Model
  run: (key: string, fn: () => Promise<void>) => Promise<void>
  pending: Record<string, boolean>
  errors: Record<string, string>
  onSet: (id: number, s: string) => Promise<void>
}) {
  const key = `ho-${h.handoff_id}`
  const next = HANDOFF_TRANSITIONS[h.status] ?? []
  const task = model.taskById.get(h.task_id)
  const reached = h.status === 'REJECTED' ? (h.accepted_at ? 2 : 1) : STEPS.indexOf(h.status) + 1
  return (
    <div className="ho">
      <div className="ev-head">
        <span className="ho-route">
          {model.zoneLabel(h.from_zone_id)} <Icon name="arrow" /> {model.zoneLabel(h.to_zone_id)}
        </span>
        <span className={`badge ${h.status === 'DONE' ? 'badge-ok' : h.status === 'REJECTED' ? 'badge-danger' : 'badge-dark'}`}>{HANDOFF_STATUS_LABEL[h.status] ?? h.status}</span>
      </div>
      <div className="tag" style={{ marginTop: 3 }}>
        #{h.handoff_id} · {h.task_id}
        {task ? ` ${task.task_type} · 작업 상태 ${TASK_STATUS_LABEL[task.status] ?? task.status}` : ''}
      </div>
      <div className={`ho-steps${h.status === 'REJECTED' ? ' rejected' : ''}`} aria-label={`인계 단계 ${reached}/4`}>
        {STEPS.map((s, i) => (
          <span key={s} className={i < reached ? 'on' : ''} title={HANDOFF_STATUS_LABEL[s]} />
        ))}
      </div>
      <div className="ho-times">
        <span className="tag num">요청 {hm(h.requested_at)}</span>
        <span className="tag num">수락 {hm(h.accepted_at)}</span>
        <span className="tag num">{h.status === 'REJECTED' ? '반려' : '완료'} {hm(h.completed_at)}</span>
      </div>
      {next.length > 0 && (
        <div className="ev-actions">
          {next.map((s) => (
            <button key={s} className={`btn btn-sm ${s === 'REJECTED' ? '' : 'btn-primary'}`} disabled={!!pending[key]} onClick={() => run(key, () => onSet(h.handoff_id, s))}>
              {HANDOFF_ACTION_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}
      {errors[key] && <p className="ev-error">{errors[key]}</p>}
    </div>
  )
}
