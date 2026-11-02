import { useEffect, useState } from 'react'
import { getState, openRequests, setDrawingsLocal, useUtterances, type Drawing } from '../utterances'

// 도면 변경 배포(설계자) ↔ 현장 전달(현장 담당자). 읽기는 관제 공통 상태(/api/state), 쓰기는 /sync/drawings
const stamp = () => new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const set = (next: Drawing[]) => setDrawingsLocal(next)
const patch = (d: Drawing) => fetch('/sync/drawings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [d.id]: d }) }).catch(() => {})
export const useDrawings = () => useUtterances().drawings
export const latestRev = (all: Drawing[], block: string) => all.find((d) => d.block === block && d.kind !== 'order')
// 변경 등록 전 블록마다 쓰는 기준 도면 버전 (첫 변경 배포가 Rev.2)
export const BASE_REV = 'Rev.1'

// 확인 요청에서 바로 작업 지시를 보낸다 — 작업자 앱의 '받은 지시'에 뜨고, 작업자가 확인하면 기록된다
export function sendOrder(o: { block: string; note: string; by: string; from: string }) {
  const d: Drawing = { id: `${Date.now()}`, kind: 'order', block: o.block, rev: '작업 지시', note: o.note, guide: '', by: o.by, at: stamp(), from: o.from, relayBy: o.by, relayAt: stamp() }
  set([d, ...getState().drawings])
  void patch(d)
}

// 설계자 — 블록을 고르고 새 리비전·변경 내용·작업 전 확인 지침을 적어 배포
export function DrawingForm({ blocks, by, initial }: { blocks: { id: string; part: string }[]; by: string; initial?: string | null }) {
  const all = useDrawings()
  // 확인 요청에서 넘어오면 그 요청의 블록을 미리 고른다
  const [block, setBlock] = useState(initial && blocks.some((b) => b.id === initial) ? initial : blocks[0]?.id ?? '')
  const cur = latestRev(all, block)
  const [rev, setRev] = useState('')
  const [note, setNote] = useState('')
  const [guide, setGuide] = useState('')
  const [sent, setSent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRev(nextRev(cur ? cur.rev : BASE_REV)); setSent('') }, [block, cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (!block || !rev.trim() || !note.trim() || busy) return
    setBusy(true)
    let attached: Drawing['file']
    if (file) {
      // 도면 파일을 먼저 올리고, 받은 주소를 도면 변경 기록에 붙인다
      const r = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file }).catch(() => null)
      const j = r ? await r.json().catch(() => null) : null
      if (!r?.ok || !j?.id) { setSent(j?.message ?? '도면 파일을 올리지 못했어요. 다시 시도해 주세요.'); setBusy(false); return }
      attached = { id: j.id, name: j.name, size: j.size, type: j.type, url: j.url }
    }
    const d: Drawing = { id: `${Date.now()}`, block, rev: rev.trim(), note: note.trim(), guide: guide.trim(), by, at: stamp(), file: attached }
    set([d, ...getState().drawings])
    void patch(d)
    setNote(''); setGuide(''); setFile(null); setBusy(false)
    setSent(`${block} ${d.rev} 배포했어요. 현장 담당자가 현장에 말로 전달하면 오봇이 듣고 자동으로 확인해요.`)
  }
  return (
    <section className="cn-card dp-hist dp-dw" aria-label="도면 변경">
      <div className="dp-dw-form">
        <label className="cn-field">블록<select value={block} onChange={(e) => setBlock(e.target.value)}>{blocks.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.part}</option>)}</select></label>
        <label className="cn-field">현재 도면<input value={cur ? `${cur.rev} · ${cur.at}` : `${BASE_REV} · 기준 도면`} disabled /></label>
        <label className="cn-field">새 리비전<input value={rev} onChange={(e) => setRev(e.target.value)} placeholder="예: Rev.2" /></label>
        <label className="cn-field dp-dw-wide">변경 내용<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇이 바뀌었는지 (예: 러그 부착 위치 지정, 보강 범위 추가)" /></label>
        <label className="cn-field dp-dw-wide">작업 전 확인 지침<textarea value={guide} onChange={(e) => setGuide(e.target.value)} placeholder="현장에서 작업 전에 확인할 것 (선택)" /></label>
        <label className="cn-field dp-dw-wide">도면 파일 (PDF · 이미지 · DWG, 20MB까지)
          <span className="dp-dw-file">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <em>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : '선택한 파일 없음'}</em>
          </span>
        </label>
      </div>
      <div className="dp-dw-foot">
        <span>{sent}</span>
        <button className="cn-btn cn-btn-primary" disabled={!rev.trim() || !note.trim() || busy} onClick={() => void submit()}>{busy ? '올리는 중…' : '도면 배포'}</button>
      </div>
      <DrawingList all={all} />
    </section>
  )
}

// 현장 보고에서 '작업 지시'를 누르면 그 블록·미리 써 둔 문안을 들고 작업 지시 화면으로 온다. 보내면 그 확인 요청은 확인 처리
export type OrderDraft = { block: string | null; text: string; from: string; ack: () => void }

// 현장 담당자 — 현장 작업자에게 새 작업 지시를 보내고, 배포된 도면을 작업자에게 넘긴다
export function DrawingRelay({ by, blocks, draft }: { by: string; draft?: OrderDraft | null; blocks: { id: string; part: string; status?: string; tone?: string; location?: string }[] }) {
  const s = useUtterances()
  const all = s.drawings
  const open = openRequests(s, 'lead')
  const sorted = [...blocks].sort((a, b) => a.id.localeCompare(b.id))
  const [block, setBlock] = useState(draft?.block && sorted.some((b) => b.id === draft.block) ? draft.block : sorted[0]?.id ?? '')
  const [text, setText] = useState(draft?.text ?? '')
  const [from, setFrom] = useState(draft ?? null)
  const [sent, setSent] = useState('')
  const send = () => {
    if (!block || !text.trim()) return
    const req = from && from.block === block ? from : null
    sendOrder({ block, note: text.trim(), by, from: req ? req.from : 'direct' })
    req?.ack()
    setFrom(null)
    setText('')
    setSent(`${block} 작업 지시를 현장에 보냈어요. 작업자 화면에 바로 떠요.`)
  }
  const relay = (d: Drawing) => { const n: Drawing = { ...d, relayBy: by, relayAt: stamp(), relayVia: 'button' }; set(all.map((x) => (x.id === d.id ? n : x))); void patch(n) }
  const undo = (d: Drawing) => { const n: Drawing = { ...d, relayBy: undefined, relayAt: undefined, relayVia: undefined, relayQuote: undefined }; set(all.map((x) => (x.id === d.id ? n : x))); void patch(n) }
  return (
    <section className="cn-card dp-hist dp-dw" aria-label="지시·변경">
      <div className="dp-ord">
        <p className="dp-ord-step"><i>1</i>블록 고르기</p>
        <div className="dp-ord-blocks" role="radiogroup" aria-label="블록">
          {sorted.map((b) => {
            const n = open.filter((c) => c.block === b.id).length
            return (
              <button key={b.id} role="radio" aria-checked={block === b.id} className={`dp-ord-block${block === b.id ? ' is-on' : ''}`} onClick={() => { setBlock(b.id); setSent('') }}>
                <span className="dp-ord-id">{b.id}</span>
                <span className="dp-ord-part">{b.part}</span>
                {b.status && <span className={`dp-ord-st tone-${b.tone ?? 'blue'}`}>{b.status}</span>}
                {n > 0 && <span className="dp-ord-alert">확인 요청 {n}</span>}
              </button>
            )
          })}
        </div>
        <p className="dp-ord-step"><i>2</i>{block} 현장에 보낼 작업 지시</p>
        <div className="dp-ord-box">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="무엇을, 언제까지, 어떻게 하라고 할지 적어 주세요&#10;예) 1구역 용접 끝난 뒤 방수 2차 도포 시작" />
          <div className="dp-ord-foot">
            <span className={sent ? 'is-sent' : ''}>{sent || '보내면 작업자 앱의 받은 지시에 바로 떠요'}</span>
            <button className="cn-btn cn-btn-primary" disabled={!block || !text.trim()} onClick={send}>작업 지시 보내기</button>
          </div>
        </div>
      </div>
      <h3 className="dp-ord-head">보낸 지시 · 받은 도면 <em>{all.length}</em></h3>
      {all.length === 0 && (
        <div className="dp-ord-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z M8 9h8 M8 12.5h5" /></svg>
          <b>아직 보낸 작업 지시가 없어요</b>
          <span>위에서 블록을 고르고 지시를 보내면 여기에 쌓이고, 작업자가 확인하면 표시돼요.</span>
        </div>
      )}
      {all.map((d) => (
        <article key={d.id} className={`dp-rq3${d.relayAt ? ' is-done' : ''}`}>
          <div className="dp-rq3-main">
            <p className="dp-rq3-title"><b>{d.block}</b>{d.kind === 'order' ? '작업 지시' : `${d.rev} 도면 변경`}</p>
            <p className="dp-rq3-detail">{d.note}</p>
            {d.guide && <p className="dp-rq3-detail">작업 전 확인: {d.guide}</p>}
            <p className="dp-rq3-meta">{d.by} 배포 · {d.at}</p>
            {d.file && <p className="dp-rq3-detail"><a className="dp-dw-link" href={d.file.url} target="_blank" rel="noreferrer">도면 파일 열기 · {d.file.name}</a></p>}
            {d.relayAt && d.kind !== 'order' && <p className="dp-rq3-ack">✓ {d.relayBy} 현장 전달{d.relayVia === 'voice' ? ' (현장 발화로 확인)' : ''} · {d.relayAt}</p>}
            {d.relayVia === 'voice' && d.relayQuote && <p className="dp-rq3-quote">“{d.relayQuote}”</p>}
            {!d.relayAt && d.kind !== 'order' && <p className="dp-rq3-meta">현장 전달을 누르거나 현장에서 이 도면을 말로 전달하면 작업자 화면에 바로 떠요</p>}
            {d.workerAckAt ? <p className="dp-rq3-ack">✓ 현장 작업자 확인 · {d.workerAckBy} · {d.workerAckAt}</p> : d.relayAt && <p className="dp-rq3-meta">현장 작업자 확인 대기</p>}
          </div>
          <div className="dp-rq3-actions">
            {d.kind === 'order' ? null : d.relayAt ? <button className="cn-link" onClick={() => undo(d)}>되돌리기</button> : <button className="cn-btn cn-btn-primary" onClick={() => relay(d)}>현장 전달</button>}
          </div>
        </article>
      ))}
    </section>
  )
}

function DrawingList({ all }: { all: Drawing[] }) {
  if (!all.length) return null
  return (
    <>
      <h3 className="dp-hist-live-head">배포한 도면</h3>
      <ol className="dp-chat">
        {all.map((d) => (
          <li key={d.id}><time>{d.at.split(' ').pop()}</time><span><b>{d.block} {d.rev}</b> · {d.note}{d.file && <> · <a className="dp-dw-link" href={d.file.url} target="_blank" rel="noreferrer">파일</a></>}</span><em>{d.workerAckAt ? `작업자 확인 ${d.workerAckAt}` : d.relayAt ? `현장 전달 ${d.relayAt}` : '현장 전달 대기'}</em></li>
        ))}
      </ol>
    </>
  )
}

function nextRev(rev: string) {
  const m = /^(.*?)(\d+)\s*$/.exec(rev)
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${rev}-1`
}
