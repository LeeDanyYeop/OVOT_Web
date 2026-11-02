// FR-09 블록별 30분 주기 작업 현황 갱신.
// 30분마다(Cloudflare 예약 실행) 블록마다 지난 갱신 뒤로 새로 들어온 현장 발화와 지시·도면 기록을 모아
// AI(OpenAI)가 '현재 작업 · 진행 내용 · 문제 · 변경 지시 · 미해결'로 요약하고, 지금 공정의 업무 목록(완료·진행·예정·재작업)을 다시 매긴다.
// 관제 '공정 진행' 목록은 이 업무 목록을 그대로 보여 준다. 새 기록이 없으면 AI 를 부르지 않는다.
import { blocks, PROCESS } from '../src/console/twinBlocks.ts'

// 블록 기준 정보 (관제 twinBlocks 와 같은 내용) — AI 가 DB 상태와 발화가 다르면 '상태 불일치'로 표시하는 기준
export const BLOCK_INFO = {
  'B-01': { name: '선미 블록', process: '용접', team: '용접팀', state: '도크에 탑재된 상태 · 거주구 앞 갑판 러그 부착·보강 준비 중 (러그 부착 전)' },
  'B-02': { name: '선수 블록', process: '입고', team: '운송팀', state: '협력사 공장(울산 온산)에서 도크로 운송 중' },
  'B-03': { name: '기관부 블록', process: '완성', team: '품질팀', state: '탑재·전 공정 완료' },
  'B-04': { name: '중앙 블록', process: '방수', team: '방수팀', state: '도크 옆 지상에 뒤집어 둔 상태 · 측면 외판 방수 2차 도포 진행 중 (하부 1차 완료)' },
}

// 지금 공정 담당 팀의 기준 업무 목록 (관제 twinBlocks 의 고정 예시) — 첫 갱신 전과 AI 가 고칠 출발점
export function baseTasks(block) {
  const b = blocks.find((x) => x.id === block)
  const team = b && PROCESS[b.step]?.team
  const t = team && b.teams.find((x) => x.name.replace(/\s*\(.*\)$/, '') === team)
  return t ? t.tasks.map((k) => ({ ...k })) : []
}
const TASK_STATES = ['완료', '진행', '예정', '재작업']

const PROMPT = `너는 조선소 관제 보조다. 한 블록의 지난 현황 요약과, 그 뒤로 새로 들어온 현장 발화(STT, 오인식 가능)·작업 지시·도면 변경 기록을 받는다.
새 기록을 반영해 이 블록의 현재 현황을 다시 요약하라. 기록에 없는 내용은 지어내지 말고, 알아듣기 어려운 말은 [???] 로 둔다.

tasks 규칙 (지금 공정 담당 팀의 업무 목록, 관제 화면에 그대로 표시됨):
- previous.tasks(없으면 info.tasks)에서 시작해 새 기록에 근거가 있을 때만 상태를 바꾼다. 근거 없으면 그대로 둔다.
- state 는 "완료|진행|예정|재작업" 중 하나. 지시받은 작업을 했다고 보고했지만 빠진 부분이 확인되면 그 업무는 "재작업".
- 업무 이름은 짧은 현장 말로. 기록에서 새 업무가 드러나면 추가할 수 있다(최대 8개). 순서는 작업 순서대로.

flag 규칙:
- "긴급": 안전 위험(화재·추락·불티 등)이 지금 진행 중
- "상태 불일치": 블록 기준 정보(공정·상태)와 현장 발화 내용이 서로 다름
- "확인 필요": 전사문이 불명확하거나 판단 근거가 부족함
- "정상": 그 외

JSON 만 출력:
{"current_work":"지금 하는 작업 한 문장","team":"담당 팀","progress":"주요 진행 내용 1~2문장",
 "issues":["발생한 문제"],"orders":["변경 지시·도면 변경"],"unresolved":["아직 해결 안 된 것"],"flag":"정상|확인 필요|상태 불일치|긴급",
 "tasks":[{"text":"업무","state":"완료|진행|예정|재작업"}]}`

async function ask(env, payload) {
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
  if (!res.ok) throw new Error(`AI 요약 실패 (${res.status})`)
  const data = await res.json()
  return JSON.parse(data.choices?.[0]?.message?.content || '{}')
}

const arr = (v) => (Array.isArray(v) ? v.map(String).slice(0, 8) : [])
const tasksOf = (v) => (Array.isArray(v) ? v.filter((k) => k && k.text && TASK_STATES.includes(k.state)).slice(0, 8).map((k) => ({ text: String(k.text), state: k.state })) : [])
const ts = (s) => (s ? new Date(s).getTime() : 0)

/**
 * @param utterances 실제 녹음 + 시연 데이터 (최신순)
 * @param orders     /sync/drawings 기록 (객체)
 * @param prev       지난 현황 { [block]: { current, history } }
 * @param only       특정 블록만 갱신 (없으면 전체)
 */
export async function updateStatus(env, utterances, orders, prev, only) {
  const now = new Date().toISOString()
  const next = { ...prev }
  for (const block of Object.keys(BLOCK_INFO)) {
    if (only && block !== only) continue
    const before = prev[block]?.current ?? null
    const since = before ? ts(before.at) : 0
    const lines = utterances
      .filter((u) => u.block_id === block && ts(u.recorded_at) > since)
      .reverse()
      .map((u) => ({ time: u.recorded_at, speaker: u.worker_name ?? u.worker_id, text: u.transcript, labels: (u.labels || []).map((l) => `${l.category}>${l.subcategory}`) }))
    const blockOrders = Object.values(orders || {})
      .filter((o) => o && typeof o === 'object' && o.block === block && Number(o.id) > since)
      .map((o) => ({ kind: o.kind === 'order' ? '작업 지시' : `도면 변경 ${o.rev}`, note: o.note, by: o.by, at: o.at, worker_confirmed: !!o.workerAckAt }))
    let current
    if (!lines.length && !blockOrders.length) {
      // 새 기록이 없으면 지난 요약을 그대로 두고 '신규 기록 없음'만 표시
      current = before ? { ...before, at: now, fresh: false } : { at: now, fresh: false, current_work: BLOCK_INFO[block].state, team: BLOCK_INFO[block].team, progress: '', issues: [], orders: [], unresolved: [], flag: '정상', tasks: baseTasks(block) }
    } else if (!env.OPENAI_API_KEY) {
      current = { ...(before ?? {}), at: now, fresh: true, flag: '확인 필요', progress: 'AI 요약 키가 설정되지 않아 새 기록을 요약하지 못했습니다.', new_count: lines.length + blockOrders.length }
    } else {
      try {
        const r = await ask(env, { block, info: { ...BLOCK_INFO[block], tasks: baseTasks(block) }, previous: before, new_records: { utterances: lines, orders: blockOrders } })
        current = {
          at: now,
          fresh: true,
          new_count: lines.length + blockOrders.length,
          current_work: String(r.current_work || ''),
          team: String(r.team || ''),
          progress: String(r.progress || ''),
          issues: arr(r.issues),
          orders: arr(r.orders),
          unresolved: arr(r.unresolved),
          flag: ['정상', '확인 필요', '상태 불일치', '긴급'].includes(r.flag) ? r.flag : '확인 필요',
          tasks: tasksOf(r.tasks).length ? tasksOf(r.tasks) : (before?.tasks ?? baseTasks(block)),
        }
      } catch (e) {
        current = { ...(before ?? {}), at: now, fresh: true, flag: '확인 필요', progress: String(e && e.message ? e.message : e) }
      }
    }
    // 이전 갱신 이력 보존 (최근 24개 = 12시간)
    const history = [...(prev[block]?.history ?? [])]
    if (before) history.unshift(before)
    next[block] = { current, history: history.slice(0, 24) }
  }
  return next
}
