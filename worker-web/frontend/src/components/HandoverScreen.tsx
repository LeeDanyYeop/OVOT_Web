import { useEffect, useState } from 'react'
import type { WorkdayHandover } from '../types'

// 관제(OVOT)가 블록의 도면 변경·작업 지시·현장 대화·30분 현황으로 정리한 인수인계
type OvotHandover = {
  block: string
  summary: string
  tasks: { text: string; from: string }[]
  cautions: string[]
  changes: { kind: string; note: string; guide: string; by: string; at: string; file: { name: string; url: string } | null; confirmed: boolean }[]
  empty: boolean
}
const ADMIN = 'https://admin.ovot.workers.dev'

interface Props {
  handover: WorkdayHandover | null // null while it is being loaded
  error: string | null
  busy: boolean
  onConfirm: () => void
  onClose: () => void
  onRetry: () => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function dateLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${m}월 ${d}일 ${WEEKDAYS[new Date(y, m - 1, d).getDay()]}요일`
}

// 'A구역 3번 블록' → 'A구역 · 3번 블록' (구역 이름이 '…구역 …' 형식일 때만)
const zoneLabel = (name: string) => name.replace(/^(\S+구역)\s+/, '$1 · ')

const ICON_PATHS: Record<WorkdayHandover['checks'][number]['icon'], string> = {
  // torch / flame
  weld: 'M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 8 11.5c0-1.6.8-2.7 1.6-3.6.2 1.3.9 2.1 1.7 2.1 0-2.6.2-4.9.7-7z M7 20h10',
  // wrench
  tool: 'M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17v3h3l5.5-5.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.6-.6-.6-2.6z',
  // clipboard
  permit: 'M9 4h6v3H9z M7 5.5H5.5V21h13V5.5H17 M8.5 11h7 M8.5 14.5h7 M8.5 18h4',
  // speech bubble
  ask: 'M5 5h14v10H10l-4 4v-4H5z M9 9.5h6',
}

function CheckIcon({ kind }: { kind: keyof typeof ICON_PATHS }) {
  return (
    <svg className="hv-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[kind]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** '인수인계' shown after 출근하기: where to pick up, the job's steps, what to check before
 * starting and the last report from the previous shift. 인수인계 확인 registers the worker
 * in the zone and starts streaming. */
export function HandoverScreen({ handover: h, error, busy, onConfirm, onClose, onRetry }: Props) {
  const [ovot, setOvot] = useState<OvotHandover | null>(null)
  const [ovotState, setOvotState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [showLog, setShowLog] = useState(false)
  const block = h?.block_id ?? null
  useEffect(() => {
    if (!block) { setOvotState('ok'); return }
    let alive = true
    setOvotState('loading')
    fetch(`${ADMIN}/api/handover?block=${encodeURIComponent(block)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: OvotHandover) => { if (alive) { setOvot(d); setOvotState('ok') } })
      .catch(() => alive && setOvotState('fail'))
    return () => { alive = false }
  }, [block])
  // 실제로 남은 질문(어제 담당자에게 보낸 것)만 — 예시용 확인 항목은 쓰지 않는다
  const asks = h?.checks.filter((c) => c.icon === 'ask') ?? []
  // 시작 전 확인: 도면 변경의 작업 전 지침 · OVOT 주의사항 · 어제 담당자에게 보낸 질문
  type Check = { icon: keyof typeof ICON_PATHS; title: string; detail?: string | null; file?: { name: string; url: string } | null }
  const checks: Check[] = [
    ...(ovot?.changes ?? []).filter((c) => c.guide || c.file).map((c): Check => ({ icon: 'tool', title: `${c.kind} · ${c.note}`, detail: c.guide ? `작업 전 확인: ${c.guide}` : null, file: c.file })),
    ...(ovot?.cautions ?? []).map((c): Check => ({ icon: 'permit', title: c })),
    ...asks.map((c): Check => ({ icon: 'ask', title: c.title, detail: c.detail })),
  ]

  return (
    <div className="hv" role="dialog" aria-modal="true" aria-label="인수인계">
      <header className="hv-head">
        <span className="hv-brand">OVOT</span>
        <button className="hv-close" onClick={onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {!h ? (
        <div className="brief-wait" aria-live="polite">
          {error ? (
            <>
              <p className="brief-wait-title">불러오지 못했어요</p>
              <p className="brief-wait-sub">{error}</p>
              <div className="brief-wait-actions">
                <button className="assist-btn" onClick={onClose}>
                  닫기
                </button>
                <button className="assist-btn is-dark" onClick={onRetry}>
                  다시 시도
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="brief-spinner" aria-hidden="true" />
              <p className="brief-wait-sub">어제 기록을 불러오는 중이에요</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="hv-body">
            <p className="hv-date">{dateLabel(h.date)}</p>
            <h1 className="hv-zone">{h.zone ? zoneLabel(h.zone) : '배정된 구역 없음'}</h1>
            <p className="hv-team">{h.worker.team} 인수인계</p>

            {/* 예전 인수인계 화면 구성 그대로 — 내용만 관제(OVOT) 정리로 채운다 */}
            <section className="hv-sec">
              <h2 className="hv-label">이어서 할 작업</h2>
              <p className="hv-next">
                {ovotState === 'loading'
                  ? 'OVOT가 어제 기록을 정리하는 중이에요…'
                  : ovotState === 'fail'
                    ? '관제 기록을 불러오지 못했어요. 담당자에게 오늘 작업을 확인하세요.'
                    : ovot?.tasks[0]?.text ?? '새로 받은 지시나 기록이 없어요'}
              </p>
            </section>

            {ovot && ovot.tasks.length > 1 && (
              <ol className="hv-steps" aria-label="오늘 할 일">
                {ovot.tasks.map((t, i) => (
                  <li key={i} className={i === 0 ? 'is-now' : 'is-next'} aria-current={i === 0 ? 'step' : undefined}>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ol>
            )}

            {checks.length > 0 && (
              <section className="hv-sec">
                <h2 className="hv-label">시작 전에 확인하세요</h2>
                <ul className="hv-checks">
                  {checks.map((c, i) => (
                    <li key={i}>
                      <CheckIcon kind={c.icon} />
                      <div>
                        <p className="hv-check-title">{c.title}</p>
                        {c.detail && <p className="hv-check-detail">{c.detail}</p>}
                        {c.file && <a className="hv-file" href={`${ADMIN}${c.file.url}`} target="_blank" rel="noreferrer">도면 파일 열기 · {c.file.name}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ovot?.summary && (
              <section className="hv-sec">
                <h2 className="hv-label">마지막 작업 상황</h2>
                <div className="hv-report">
                  <span className="hv-avatar" aria-hidden="true">O</span>
                  <div>
                    <p className="hv-report-head">
                      <b>OVOT 정리</b>
                      {block && <time>{block}</time>}
                    </p>
                    <p className="hv-report-text">
                      {ovot.summary
                        .replace(/([.!?])\s+/g, '$1\n')
                        .split('\n')
                        .map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {ovot && ovot.changes.length > 0 && (
              <>
                <button className="hv-history" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
                  <svg className="hv-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 3.5h9l3 3V20.5H6z M9 10h6 M9 13.5h6 M9 17h4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>받은 지시·도면 이력 보기</span>
                  <span className={`hv-chev ${showLog ? 'is-open' : ''}`} aria-hidden="true">
                    ›
                  </span>
                </button>
                {showLog && (
                  <ul className="hv-log">
                    {ovot.changes.map((c, i) => (
                      <li key={i}>
                        <time>{c.at}</time>
                        <span>{c.kind} · {c.note}{c.confirmed ? ' (확인함)' : ''}</span>
                        <span className="hv-who">{c.by}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="hv-actions">
            <button className="hv-confirm" onClick={onConfirm} disabled={busy}>
              {busy ? '등록 중…' : '인수인계 확인'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
