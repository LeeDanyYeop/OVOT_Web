// FR-11 작업자 인수인계 — 출근한 작업자에게 그 블록에서 이어서 할 일을 정리한다.
// 근거: 현장에 전달된 도면 변경 · 담당자가 보낸 작업 지시 · 최근 현장 대화 · 블록 30분 현황.
// 시연 시나리오 문구는 쓰지 않고, 기록이 없으면 '새로 받은 지시 없음'으로 둔다.

const PROMPT = `너는 조선소 현장 인수인계 보조다. 한 블록의 기록(도면 변경, 작업 지시, 최근 현장 대화, 현황 요약)을 받는다.
오늘 출근한 현장 작업자가 바로 이어서 할 수 있도록 정리하라.
- 기록에 없는 내용은 지어내지 말고, 알아듣기 어려운 말은 [???] 로 둔다.
- tasks: 오늘 해야 할 작업을 행동 단위로(예: "Rev.2 도면 기준 러그 4개 부착", "러그 용접 후 보강재 용접"). 최대 6개.
- cautions: 작업 전에 확인할 것·위험·바뀐 점. 최대 4개.
- summary: 지금 상황 한두 문장.
JSON 만 출력: {"summary":"...","tasks":[{"text":"...","from":"근거(도면 Rev.2 / 강민철 지시 / 현장 대화 등)"}],"cautions":["..."]}`

const memo = new Map()

export async function makeHandover(env, block, { utterances, drawings, status }) {
  const records = Object.values(drawings || {})
    .filter((d) => d && typeof d === 'object' && d.rev && d.block === block && (d.kind === 'order' || d.relayAt))
    .sort((a, b) => Number(b.id) - Number(a.id))
  const dayAgo = Date.now() - 36 * 3600 * 1000
  const talk = utterances
    .filter((u) => u.block_id === block && new Date(u.recorded_at || 0).getTime() > dayAgo)
    .slice(0, 40)
    .reverse()
  const changes = records.map((d) => ({
    kind: d.kind === 'order' ? '작업 지시' : `도면 변경 ${d.rev}`,
    note: d.note, guide: d.guide || '', by: d.relayBy || d.by, at: d.relayAt || d.at,
    file: d.file ? { name: d.file.name, url: d.file.url } : null,
    confirmed: !!d.workerAckAt,
  }))
  const base = { block, changes, summary: '', tasks: [], cautions: [], empty: !records.length && !talk.length }
  if (base.empty) return base
  if (!env.OPENAI_API_KEY) return { ...base, summary: '정리용 AI 키가 설정되지 않아 받은 지시만 보여 드려요.' }

  const key = `${block}|${records.map((d) => `${d.id}:${d.relayAt || ''}:${d.workerAckAt || ''}`).join(',')}|${talk.map((u) => u.voice_id).join(',')}|${status?.at || ''}`
  if (memo.has(key)) return { ...base, ...memo.get(key) }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: JSON.stringify({ block, changes, status: status || null, conversation: talk.map((u) => ({ time: u.recorded_at, speaker: u.worker_name ?? u.worker_id, text: u.transcript })) }) },
      ],
    }),
  })
  if (!res.ok) return { ...base, summary: `정리하지 못했어요 (${res.status}). 받은 지시를 먼저 확인하세요.` }
  let r = {}
  try { r = JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}') } catch { /* 빈 정리 */ }
  const out = {
    summary: String(r.summary || ''),
    tasks: (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 6).map((t) => ({ text: String(t.text || t), from: String(t.from || '') })),
    cautions: (Array.isArray(r.cautions) ? r.cautions : []).slice(0, 4).map(String),
  }
  memo.set(key, out)
  if (memo.size > 50) memo.delete(memo.keys().next().value)
  return { ...base, ...out }
}
