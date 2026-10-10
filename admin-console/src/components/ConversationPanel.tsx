import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ALL, refMatches, type Model } from '../data/model'
import type { Snapshot, VoiceRecord } from '../types'
import { dayLabel, hms } from '../lib/format'
import { Avatar, EmptyState, ErrorState, Icon, PanelHead, Skeleton } from './ui'

interface Props {
  snapshot: Snapshot | null
  model: Model | null
  selectedZone: string
  selectedVoiceId: string | null
  focusVoice: { id: string; nonce: number } | null
  onSelectVoice: (voiceId: string | null) => void
  pollIntervalMs: number
  onRefresh: () => void
  inFlight: boolean
  loadError: string | null
  /** 외부(왼쪽 검색창)에서 검색어 전달 */
  queryRequest?: { q: string; nonce: number } | null
  onClose?: () => void
  hideHead?: boolean
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {highlight(text.slice(i + q.length), q)}
    </>
  )
}

export function ConversationPanel({ snapshot, model, selectedZone, selectedVoiceId, focusVoice, onSelectVoice, pollIntervalMs, onRefresh, inFlight, loadError, queryRequest, onClose, hideHead }: Props) {
  const [scope, setScope] = useState<'zone' | 'all'>('zone')
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (queryRequest) {
      setQuery(queryRequest.q)
      setScope('all')
    }
  }, [queryRequest])
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const seen = useRef<Set<string>>(new Set())
  const [newCount, setNewCount] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)

  const effectiveZone = scope === 'all' ? ALL : selectedZone
  const q = query.trim()

  const list: VoiceRecord[] = useMemo(() => {
    if (!snapshot || !model) return []
    const ql = q.toLowerCase()
    return snapshot.voices
      .filter((v) => refMatches(model.voiceZone.get(v.voice_id), effectiveZone))
      .filter((v) => {
        if (!ql) return true
        const task = v.task_id ? model.taskById.get(v.task_id) : undefined
        return [v.worker_id, v.task_id, v.block_id, v.transcript, task?.task_type, v.voice_id].some((s) => s?.toLowerCase().includes(ql))
      })
      .sort((a, b) => (a.recorded_at ?? '').localeCompare(b.recorded_at ?? '') || a.voice_id.localeCompare(b.voice_id))
  }, [snapshot, model, effectiveZone, q])

  const scrollToBottom = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    atBottom.current = true
    setNewCount(0)
  }

  // 필터가 바뀌면 처음부터 다시 '본 것'으로 간주하고 맨 아래로
  const filterKey = `${effectiveZone}|${q}`
  const lastFilterKey = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!snapshot) return
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      seen.current = new Set(list.map((v) => v.voice_id))
      scrollToBottom()
      return
    }
    const fresh = list.filter((v) => !seen.current.has(v.voice_id))
    if (!fresh.length) return
    fresh.forEach((v) => seen.current.add(v.voice_id))
    if (atBottom.current) scrollToBottom()
    else setNewCount((n) => n + fresh.length)
  }, [list, filterKey, snapshot])

  // 다른 패널에서 '근거 발언 보기'를 누르면 해당 발화로 이동
  useEffect(() => {
    if (!focusVoice) return
    if (!list.some((v) => v.voice_id === focusVoice.id)) {
      setScope('all')
      setQuery('')
    }
    const t = window.setTimeout(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-voice="${CSS.escape(focusVoice.id)}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setFlashId(focusVoice.id)
        window.setTimeout(() => setFlashId(null), 1700)
      }
    }, 60)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVoice])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atBottom.current && newCount) setNewCount(0)
  }

  const zoneName = selectedZone === ALL ? '전체 구역' : model?.zoneLabel(selectedZone === '__unassigned__' ? null : selectedZone) ?? selectedZone

  let lastDay = ''
  return (
    <section className="panel" aria-label="실시간 대화">
      {!hideHead && <PanelHead title="실시간 대화" sub={`저장된 STT 전사문 · ${scope === 'all' ? '전체 구역' : zoneName}`}>
        <span className="tag num" title="서버에 실시간 푸시 기능이 없어 주기적으로 조회합니다">{Math.round(pollIntervalMs / 1000)}초 주기 조회</span>
        <button className="icon-btn" onClick={onRefresh} disabled={inFlight} aria-label="최신 기록 갱신" title="최신 기록 갱신">
          <Icon name="refresh" />
        </button>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="대화 기록 닫기" title="닫기">
            <Icon name="close" />
          </button>
        )}
      </PanelHead>}

      <div className="toolbar">
        <input className="search" type="search" placeholder="작업자·작업·전사문 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="대화 검색" />
        {selectedZone !== ALL && (
          <div className="seg" role="group" aria-label="대화 범위">
            <button aria-pressed={scope === 'zone'} onClick={() => setScope('zone')}>선택 구역</button>
            <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>전체</button>
          </div>
        )}
      </div>

      <div className="convo">
        <div className="convo-scroll" ref={scroller} onScroll={onScroll}>
          {!snapshot || !model ? (
            loadError ? <ErrorState title="대화 기록을 불러오지 못했습니다">{loadError}</ErrorState> : <Skeleton rows={8} />
          ) : list.length === 0 ? (
            <EmptyState title={q ? '검색 결과가 없습니다' : '저장된 발화 기록이 없습니다'}>
              {q ? '다른 검색어를 입력해 보세요.' : '이 범위의 voice_records 가 비어 있습니다.'}
            </EmptyState>
          ) : (
            list.map((v) => {
              const evs = model.eventsByVoice.get(v.voice_id) ?? []
              const ref = model.voiceZone.get(v.voice_id)
              const task = v.task_id ? model.taskById.get(v.task_id) : undefined
              const day = dayLabel(v.recorded_at)
              const showDay = day !== lastDay
              lastDay = day
              const needs = evs.some((e) => e.event_status === 'NEEDS_CONFIRMATION')
              return (
                <Fragment key={v.voice_id}>
                  {showDay && <div className="day-sep">{day}</div>}
                  <button
                    data-voice={v.voice_id}
                    className={`utt${selectedVoiceId === v.voice_id ? ' selected' : ''}${flashId === v.voice_id ? ' flash' : ''}`}
                    onClick={() => onSelectVoice(selectedVoiceId === v.voice_id ? null : v.voice_id)}
                    aria-pressed={selectedVoiceId === v.voice_id}
                  >
                    <Avatar />
                    <div style={{ minWidth: 0 }}>
                      <div className="utt-head">
                        <span className="utt-who">{highlight(v.worker_id ?? '작업자 미상', q)}</span>
                        <time className="utt-time">{hms(v.recorded_at)}</time>
                        {evs.length ? (
                          <span className={`badge ${needs ? 'badge-warn' : ''}`}>분석 {evs.length}{needs ? ' · 확인 필요' : ''}</span>
                        ) : (
                          <span className="badge badge-line">분석 없음</span>
                        )}
                      </div>
                      <p className="utt-text">{highlight(v.transcript, q)}</p>
                      <div className="utt-meta">
                        <span className="tag">
                          {ref?.kind === 'zone' ? model.zoneLabel(ref.zoneId) + (ref.via === 'task' ? ' (작업 기준)' : '') : '구역 미지정'}
                        </span>
                        {v.task_id && <span className="tag">{highlight(v.task_id, q)}{task ? ` ${task.task_type}` : ' (작업 정보 없음)'}</span>}
                        {v.block_id && <span className="tag">블록 {highlight(v.block_id, q)}</span>}
                      </div>
                    </div>
                  </button>
                </Fragment>
              )
            })
          )}
        </div>
        {newCount > 0 && (
          <button className="new-pill" onClick={scrollToBottom}>
            새 대화 {newCount}건 <Icon name="down" className="icon" />
          </button>
        )}
      </div>
      <footer className="panel-foot">원본 음성 재생: OVOT-Backend 에 음성 파일 API 가 없어 연결하지 않음</footer>
    </section>
  )
}
