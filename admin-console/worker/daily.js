// FR-10 일일 보고 — 작업자 한 명의 하루(날짜) 전사문과 그날 받은 지시·도면 확인 기록만으로 퇴근 보고를 쓴다.
// 작업자 앱 '오늘의 업무 정리'가 부른다. 가이드·시나리오 문구는 쓰지 않고, 그날 전사문이 없으면 비어 있다고 알린다.

const PROMPT = `너는 조선소 현장 도우미다. 한 작업자의 하루치 현장 대화 전사문(STT, 오인식 가능)과 그날 받은/확인한 작업 지시·도면 변경 기록을 받는다.
이 기록만으로 퇴근 보고를 쓴다. 기록에 없는 작업·숫자·이름은 지어내지 않는다. 알아듣기 어려운 말은 근거로 쓰지 않는다.
STT 오인식은 바로잡아서 쓴다 (예: 보관/복왕/부관 → 보강, 럭 → 러그, 리비전 2/이비전2 → Rev.2, 2-01 → B-01).

- headline: 오늘 하루를 한 문장으로 (40자 이내)
- done: 오늘 실제로 한 일·끝낸 일 (최대 5개). 했다고 말한 것만
- issues: 발생한 문제·빠진 작업·지적받은 것 (최대 4개)
- next: 대화에서 다음에 하기로 한 일·남은 일 (최대 4개)
- 각 항목의 evidence 에는 근거가 된 기록의 id 를 1~2개 넣는다 (전사문 voice_id 또는 지시 id)
대화가 업무와 무관하면(잡담·테스트) 항목으로 만들지 않는다.

JSON 만 출력: {"headline":"...","done":[{"text":"...","evidence":["V-001"]}],"issues":[...],"next":[...]}`

const memo = new Map()
const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const kstTime = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16)

export async function makeDaily(env, worker, name, date, { utterances, drawings }) {
  const talk = utterances
    .filter((u) => u.worker_id === worker && u.recorded_at && kstDate(u.recorded_at) === date && (u.transcript || '').trim())
    .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
  // 그날 내려와(id = 만든 시각) 이 작업자가 '확인했습니다'를 누른 지시·도면 변경
  const records = Object.values(drawings || {})
    .filter((d) => d && typeof d === 'object' && d.rev && d.workerAckAt && name && d.workerAckBy === name && Number(d.id) && kstDate(Number(d.id)) === date)
  // 근거 표시용 — id 로 원문을 다시 찾는다
  const sources = {}
  for (const u of talk) sources[u.voice_id] = { kind: 'voice', time: kstTime(u.recorded_at), block: u.block_id, text: u.transcript }
  for (const d of records) sources[d.id] = { kind: d.kind === 'order' ? 'order' : 'drawing', time: kstTime(Number(d.id)), block: d.block, text: d.kind === 'order' ? d.note : `${d.rev} · ${d.note}` }
  const base = { worker, date, count: talk.length, blocks: [...new Set(talk.map((u) => u.block_id).filter(Boolean))], headline: '', done: [], issues: [], next: [], sources }
  if (!talk.length) return { ...base, empty: true }
  if (!env.OPENAI_API_KEY) return { ...base, error: 'AI 요약 키가 설정되지 않았습니다.' }

  const key = `${worker}|${date}|${talk.map((u) => u.voice_id).join(',')}|${records.map((d) => d.id).join(',')}`
  if (memo.has(key)) return memo.get(key)
  const payload = {
    worker, date,
    conversation: talk.map((u) => ({ id: u.voice_id, time: kstTime(u.recorded_at), block: u.block_id, text: u.transcript })),
    orders: records.map((d) => ({ id: d.id, kind: d.kind === 'order' ? '작업 지시' : `도면 변경 ${d.rev}`, note: d.note, block: d.block })),
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: JSON.stringify(payload) }],
    }),
  })
  if (!res.ok) return { ...base, error: `AI 요약 실패 (${res.status})` }
  const r = JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}')
  const items = (v, n) => (Array.isArray(v) ? v : [])
    .filter((x) => x && x.text)
    .slice(0, n)
    .map((x) => ({ text: String(x.text), evidence: (Array.isArray(x.evidence) ? x.evidence : []).map(String).filter((id) => sources[id]).slice(0, 2) }))
  const out = { ...base, headline: String(r.headline || ''), done: items(r.done, 5), issues: items(r.issues, 4), next: items(r.next, 4) }
  memo.set(key, out)
  return out
}
