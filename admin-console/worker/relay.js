// 도면 변경 '현장 전달'을 버튼 대신 음성으로 확인한다.
// 배포됐지만 아직 전달 확인이 안 된 도면이 있으면, 그 뒤로 들어온 현장 발화를 AI(OpenAI)가 읽고
// "이 도면 변경을 현장에 전달한 말"이 있으면 그 발화를 근거로 전달 시각·전달한 사람을 기록한다.

const PROMPT = `너는 조선소 관제 보조다. 설계팀이 배포한 '도면 변경' 목록과, 그 뒤 현장에서 녹음된 발화(STT, 오인식 가능)를 받는다.
각 도면 변경에 대해, 어떤 발화가 그 변경 내용을 현장 작업자에게 전달한 것인지 판단하라.
전달로 보는 예: "Rev.2 나왔습니다. 이 도면대로 러그 붙이세요", "도면 바뀌었어요, 보강 범위 여기까지예요".
단순히 도면을 언급하거나 질문만 한 것은 전달이 아니다. 확실하지 않으면 넣지 마라.
JSON 만 출력: {"relayed":[{"drawing_id":"...","voice_id":"...","quote":"전달한 말 그대로(짧게)"}]}`

const kst = () => {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
const ts = (s) => (s ? new Date(s).getTime() : 0)

/**
 * @param drawings  /sync/drawings 기록(객체)
 * @param utterances 실제 녹음 + 시연 발화 (worker_name 포함)
 * @param seen  이미 판단한 조합(같은 입력이면 AI 를 다시 부르지 않는다)
 * @returns 새로 전달 확인된 도면들 { [id]: drawing }
 */
export async function checkRelay(env, drawings, utterances, seen) {
  const pending = Object.values(drawings || {}).filter((d) => d && typeof d === 'object' && d.rev && d.kind !== 'order' && !d.relayAt)
  if (!pending.length || !env.OPENAI_API_KEY) return {}
  const since = Math.min(...pending.map((d) => Number(d.id) || 0))
  const lines = utterances
    .filter((u) => ts(u.recorded_at) >= since && pending.some((d) => !u.block_id || u.block_id === d.block))
    .slice(0, 30)
    .reverse()
  if (!lines.length) return {}
  const key = pending.map((d) => d.id).join(',') + '|' + lines.map((u) => u.voice_id).join(',')
  if (seen.has(key)) return {}
  seen.add(key)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            drawings: pending.map((d) => ({ drawing_id: d.id, block: d.block, rev: d.rev, change: d.note, guide: d.guide })),
            utterances: lines.map((u) => ({ voice_id: u.voice_id, time: u.recorded_at, speaker: u.worker_name ?? u.worker_id, block: u.block_id, text: u.transcript })),
          }),
        },
      ],
    }),
  })
  if (!res.ok) { seen.delete(key); return {} }
  const data = await res.json()
  let parsed = {}
  try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}') } catch { return {} }
  const out = {}
  for (const r of parsed.relayed || []) {
    const d = pending.find((x) => x.id === r.drawing_id)
    const u = lines.find((x) => x.voice_id === r.voice_id)
    if (!d || !u || out[d.id]) continue
    out[d.id] = { ...d, relayAt: kst(), relayBy: u.worker_name ?? u.worker_id ?? '현장', relayVia: 'voice', relayVoice: u.voice_id, relayQuote: String(r.quote || u.transcript).slice(0, 120) }
  }
  return out
}
