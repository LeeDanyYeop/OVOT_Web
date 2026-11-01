// 오봇 — 관제 화면의 대화형 도우미. 우리 DB(블록 기준 정보·30분 현황·작업 지시/도면 기록·확인 요청·최근 현장 발화)를
// 근거로 원청·관리자가 묻는 말에 답한다. 기록에 없는 것은 지어내지 않고 '기록에 없다'고 말한다.
import { blocks, PROCESS } from '../src/console/twinBlocks.ts'
import { schedules } from '../src/console/blockSchedule.ts'

const PROMPT = `너는 "오봇"이다. 조선소 관제 시스템 OVOT 의 도우미로, 현대중공업(원청)과 협력사 관리자가 블록 공정·문제·지시를 물으면 답한다.
- 아래 [기록]에 있는 내용만 근거로 답한다. 기록에 없으면 "기록에 없어요"라고 말하고 추측하지 않는다.
- 현장 발화는 음성 인식(STT)이라 오인식이 있을 수 있다(예: 보관 → 보강, 이비전2 → Rev.2).
- 한국어 존댓말로 짧고 친근하게. 핵심부터 2~5문장, 여러 항목이면 "- " 목록. 마크다운 굵게·표·제목은 쓰지 않는다.
- 블록은 B-01 처럼 쓰고, 날짜·담당 팀·담당자 이름이 있으면 함께 알려 준다.`

function context({ status, drawings, conversations, utterances }) {
  const info = blocks.map((b) => ({
    block: b.id, name: b.name, location: b.location, summary: b.summary, progress: b.progress,
    process: PROCESS[b.step]?.name ?? '완성', next: PROCESS[b.step + 1]?.name ?? null,
    teams: b.teams.map((t) => ({ team: t.name, state: t.state, tasks: t.tasks.map((k) => `${k.text}(${k.state})`) })),
    schedule: schedules[b.id] ?? [],
    now: status?.[b.id]?.current ?? null,
  }))
  const orders = Object.values(drawings || {})
    .filter((d) => d && typeof d === 'object' && d.block)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 20)
    .map((d) => ({ block: d.block, kind: d.kind === 'order' ? '작업 지시' : `도면 변경 ${d.rev || ''}`, note: d.note, by: d.by, at: d.at, 현장전달: d.relayAt || null, 작업자확인: d.workerAckAt || null }))
  const requests = (conversations || [])
    .filter((c) => c.needs_check)
    .slice(0, 15)
    .map((c) => ({ block: c.block, title: c.title, detail: c.detail, to: c.route }))
  const talk = utterances.slice(0, 40).reverse()
    .map((u) => ({ time: u.recorded_at, block: u.block_id, speaker: u.worker_name ?? u.worker_id, text: u.transcript }))
  return JSON.stringify({ today: new Date().toISOString().slice(0, 10), blocks: info, orders, requests, talk })
}

export async function chat(env, history, data) {
  if (!env.OPENAI_API_KEY) return { reply: '지금은 AI 연결이 설정되지 않아 답할 수 없어요.' }
  const msgs = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }))
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return { reply: '무엇이 궁금하세요?' }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [{ role: 'system', content: PROMPT }, { role: 'system', content: `[기록]\n${context(data)}` }, ...msgs],
    }),
  })
  if (!res.ok) return { reply: `답을 가져오지 못했어요 (${res.status}). 잠시 뒤 다시 물어봐 주세요.` }
  const j = await res.json()
  return { reply: String(j.choices?.[0]?.message?.content || '답을 만들지 못했어요.').trim() }
}
