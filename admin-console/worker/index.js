// Cloudflare Worker — 정적 관제 사이트(dist)를 그대로 내보내고, /sync/flow 에서 시연 흐름 상태를 공유한다.
// 관제(admin.ovot.workers.dev)와 작업자 앱(ovot.onrender.com)이 같은 상태를 읽고 쓴다.
// 상태는 Durable Object 하나(SQLite 저장)에 두어 어느 기기에서 읽어도 바로 같은 값이 나온다.
import { DurableObject } from 'cloudflare:workers'
import { WORKER_NAMES, demoReview, demoUtterances } from './demoB04.js'
import { demoB02Review, demoB02Utterances } from './demoB02.js'
import { demoB01At, demoB01Review, demoB01Utterances } from './demoB01.js'
import { updateStatus } from './status.js'
import { checkRelay } from './relay.js'
import { makeHandover } from './handover.js'
import { makeDaily } from './daily.js'
import { chat } from './chat.js'

const ALLOWED = ['https://admin.ovot.workers.dev', 'https://ovot.onrender.com']
const cors = (origin) => {
  const ok = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '')
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export class FlowStore extends DurableObject {
  async fetch(request) {
    if (request.method === 'GET') {
      const flow = (await this.ctx.storage.get('flow')) ?? {}
      return Response.json(flow)
    }
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return new Response('bad json', { status: 400 })
    // PUT: 통째로 교체(관제), PATCH: 필드만 합치기(작업자 앱 확인·보고)
    const prev = (await this.ctx.storage.get('flow')) ?? {}
    const next = request.method === 'PATCH' ? { ...prev, ...body, log: [...(prev.log ?? []), ...(body.log ?? [])] } : body
    next.updatedAt = Date.now()
    await this.ctx.storage.put('flow', next)
    return Response.json(next)
  }
}

// 도면 파일 저장 — 파일을 1.5MB 조각으로 나눠 Durable Object(SQLite) 저장소에 둔다 (최대 20MB)
const CHUNK = 1536 * 1024
export class FileStore extends DurableObject {
  async fetch(request) {
    const id = new URL(request.url).pathname.split('/').pop()
    if (!/^[A-Za-z0-9-]{6,40}$/.test(id || '')) return new Response('bad id', { status: 400 })
    if (request.method === 'PUT') {
      const buf = await request.arrayBuffer()
      const meta = { name: request.headers.get('x-file-name') || 'drawing', type: request.headers.get('content-type') || 'application/octet-stream', size: buf.byteLength, chunks: Math.ceil(buf.byteLength / CHUNK) }
      const entries = { [`${id}:meta`]: meta }
      for (let i = 0; i < meta.chunks; i++) entries[`${id}:${i}`] = buf.slice(i * CHUNK, (i + 1) * CHUNK)
      await this.ctx.storage.put(entries)
      return Response.json(meta)
    }
    const meta = await this.ctx.storage.get(`${id}:meta`)
    if (!meta) return new Response('not found', { status: 404 })
    const parts = await this.ctx.storage.get(Array.from({ length: meta.chunks }, (_, i) => `${id}:${i}`))
    const body = new Uint8Array(meta.size)
    let off = 0
    for (let i = 0; i < meta.chunks; i++) { const b = new Uint8Array(parts.get(`${id}:${i}`)); body.set(b, off); off += b.byteLength }
    return new Response(body, { headers: { 'Content-Type': meta.type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`, 'Cache-Control': 'private, max-age=3600' } })
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // /sync/flow: 시연 흐름(작업자 앱 공유), /sync/acks: 확인 요청 처리 기록, /sync/drawings: 도면 변경 배포 기록, /sync/status: 30분 현황(시연 초기화용)
    if (['/sync/flow', '/sync/acks', '/sync/drawings', '/sync/status'].includes(url.pathname)) {
      const headers = cors(request.headers.get('Origin'))
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (!['GET', 'PUT', 'PATCH'].includes(request.method)) return new Response('method', { status: 405, headers })
      const stub = env.FLOW.get(env.FLOW.idFromName(url.pathname === '/sync/flow' ? 'demo' : url.pathname.slice(6)))
      const res = await stub.fetch(request)
      // 쓰기 후에는 이 Worker 의 짧은 기억도 새 값으로 (다른 사람 화면은 최대 20초 뒤 반영)
      if (request.method !== 'GET' && url.pathname !== '/sync/flow') sharedMemo[url.pathname.slice(6)] = { data: await res.clone().json().catch(() => ({})), at: Date.now() }
      const out = new Response(res.body, res)
      for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
      out.headers.set('Cache-Control', 'no-store')
      return out
    }
    // 현장 발화·분류 결과: 같은 출처로 받아 서버에서만 READ 토큰을 붙여 ovot-sync 로 넘긴다 (브라우저에 토큰 없음)
    if (url.pathname === '/api/utterances') {
      if (request.method !== 'GET') return new Response('method', { status: 405, headers: { Allow: 'GET' } })
      if (!env.OVOT_SYNC || !env.OVOT_READ_TOKEN) return Response.json({ error: true, status_code: 503, message: '발화 기록 연결이 설정되지 않았습니다.' }, { status: 503 })
      const upstream = new URL('https://ovot-sync/api/utterances')
      upstream.search = url.search
      const res = await env.OVOT_SYNC.fetch(upstream, { headers: { Authorization: `Bearer ${env.OVOT_READ_TOKEN}` } })
      const out = new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
      return out
    }
    // 블록 현황 '지금 갱신' (시연용 — 30분을 기다리지 않고 바로)
    if (url.pathname === '/api/status/refresh') {
      if (request.method !== 'POST') return new Response('method', { status: 405, headers: { Allow: 'POST' } })
      try {
        const block = url.searchParams.get('block') || undefined
        return Response.json(await runStatus(env, block), { headers: { 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ error: true, status_code: 503, message: String(e && e.message ? e.message : e) }, { status: 503 })
      }
    }
    // 도면 파일 올리기(설계) · 보기(모두). 올리기는 원본 바이트를 그대로 보낸다 (헤더 X-File-Name)
    if (url.pathname === '/api/files' && request.method === 'POST') {
      const len = Number(request.headers.get('content-length') || 0)
      if (!len || len > 20 * 1024 * 1024) return Response.json({ error: true, message: '파일은 20MB까지 올릴 수 있어요.' }, { status: 413 })
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const name = decodeURIComponent(request.headers.get('x-file-name') || 'drawing').slice(0, 120)
      const r = await env.FILES.get(env.FILES.idFromName('drawings')).fetch(`https://do/f/${id}`, { method: 'PUT', headers: { 'content-type': request.headers.get('content-type') || 'application/octet-stream', 'x-file-name': name }, body: request.body })
      if (!r.ok) return Response.json({ error: true, message: '파일 저장 실패' }, { status: 500 })
      const meta = await r.json()
      return Response.json({ id, name, size: meta.size, type: meta.type, url: `/api/files/${id}` })
    }
    if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
      return env.FILES.get(env.FILES.idFromName('drawings')).fetch(`https://do/f/${url.pathname.split('/').pop()}`)
    }
    // 작업자 앱 출근 인수인계 — 블록의 지시·도면·현장 대화·현황을 AI 가 다음 작업자용으로 정리
    if (url.pathname === '/api/handover') {
      const headers = cors(request.headers.get('Origin'))
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      const block = url.searchParams.get('block') || ''
      if (!/^B-\d{2}$/.test(block)) return Response.json({ error: true, message: 'block 이 필요합니다.' }, { status: 400, headers })
      try {
        const named = (u) => ({ ...u, worker_name: u.worker_name ?? WORKER_NAMES[u.worker_id] ?? null })
        const [all, drawings, status, acks] = await Promise.all([fetchUtterances(env, 200), sharedGet(env, 'drawings'), sharedGet(env, 'status'), sharedGet(env, 'acks')])
        const utterances = [...demoUtterances(), ...demoB02Utterances(), ...demoB01Utterances(demoB01At(acks)), ...afterReset(all, acks)].map(named).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
        const h = await makeHandover(env, block, { utterances, drawings, status: status?.[block]?.current })
        return Response.json(h, { headers: { ...headers, 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ error: true, message: String(e && e.message ? e.message : e) }, { status: 503, headers })
      }
    }
    // 작업자 앱 퇴근 '오늘의 업무 정리' (FR-10) — 그 작업자·그 날짜 전사문으로 쓴 일일 보고
    if (url.pathname === '/api/daily') {
      const headers = cors(request.headers.get('Origin'))
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      const worker = url.searchParams.get('worker') || ''
      const date = url.searchParams.get('date') || ''
      if (!/^W-\d{3}$/.test(worker) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: true, message: 'worker, date 가 필요합니다.' }, { status: 400, headers })
      try {
        const [all, drawings, acks] = await Promise.all([fetchUtterances(env, 500), sharedGet(env, 'drawings'), sharedGet(env, 'acks')])
        const d = await makeDaily(env, worker, url.searchParams.get('name') || WORKER_NAMES[worker] || '', date, { utterances: afterReset(all, acks), drawings })
        return Response.json(d, { headers: { ...headers, 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ error: true, message: String(e && e.message ? e.message : e) }, { status: 503, headers })
      }
    }
    // 작업자 앱(Render)이 읽는 받은 지시·도면 변경 목록 (확인은 PATCH /sync/drawings)
    if (url.pathname === '/api/orders') {
      const headers = cors(request.headers.get('Origin'))
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'GET') return new Response('method', { status: 405, headers })
      return Response.json(await sharedGet(env, 'drawings'), { headers: { ...headers, 'Cache-Control': 'no-store' } })
    }
    // 관제 화면이 30초마다 한 번에 읽는 상태: 발화 + AI 판단 + 확인 기록 + 도면 기록
    if (url.pathname === '/api/state') {
      if (request.method !== 'GET') return new Response('method', { status: 405, headers: { Allow: 'GET' } })
      const doGet = (name) => sharedGet(env, name)
      try {
        const real = await fetchUtterances(env, 200)
        const [acks, drawings, status, rv] = await Promise.all([
          doGet('acks'),
          doGet('drawings'),
          doGet('status'),
          review(env, real).then((r) => ({ conversations: r.conversations }), (e) => ({ error: String(e && e.message ? e.message : e) })),
        ])
        // B-04 공정 충돌 시연 데이터(하드코딩)를 실제 녹음과 섞어 보낸다. AI 판단은 실제 녹음만 대상으로 한다
        const named = (u) => ({ ...u, worker_name: u.worker_name ?? WORKER_NAMES[u.worker_id] ?? null })
        // B-01 러그 설계 검토 요청 시연도 항상 (Ctrl+Shift+1 을 누르면 그 시각에 들어온 것으로)
        const utterances = [...demoUtterances(), ...demoB02Utterances(), ...demoB01Utterances(demoB01At(acks)), ...real].map(named).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
        // 배포된 도면 중 아직 전달 확인이 안 된 것 — 현장 발화에서 전달한 말이 있는지 뒤에서 확인 (응답은 기다리지 않음)
        ctx.waitUntil(relayFromVoice(env, drawings, utterances).catch((e) => console.error('relay', e && e.message)))
        const demos = [demoReview(), demoB02Review(), demoB01Review()]
        const review2 = rv.conversations ? { conversations: [...demos, ...rv.conversations] } : { ...rv, conversations: demos }
        return Response.json({ utterances, acks, drawings, status, review: review2 }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ error: true, status_code: 503, message: String(e && e.message ? e.message : e) }, { status: 503 })
      }
    }
    // 오봇: 관제 도우미 챗봇 — 블록 현황·지시·확인 요청·최근 발화를 근거로 답한다 (관제 화면에서만 부름)
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') return new Response('method', { status: 405, headers: { Allow: 'POST' } })
      const body = await request.json().catch(() => null)
      try {
        const named = (u) => ({ ...u, worker_name: u.worker_name ?? WORKER_NAMES[u.worker_id] ?? null })
        const [real, drawings, status, acks, rv] = await Promise.all([
          fetchUtterances(env, 200).catch(() => []),
          sharedGet(env, 'drawings'),
          sharedGet(env, 'status'),
          sharedGet(env, 'acks'),
        ]).then(async ([u, d, st, a]) => [u, d, st, a, await review(env, u).catch(() => ({ conversations: [] }))])
        const utterances = [...demoUtterances(), ...demoB02Utterances(), ...demoB01Utterances(demoB01At(acks)), ...real].map(named).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
        const r = await chat(env, body?.messages, { status, drawings, conversations: [demoReview(), demoB02Review(), demoB01Review(), ...(rv.conversations ?? [])], utterances })
        return Response.json(r, { headers: { 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ reply: `답을 가져오지 못했어요. ${String(e && e.message ? e.message : e)}` }, { status: 503 })
      }
    }
    // 확인 요청: 최근 현장 발화를 AI(OpenAI)가 대화 맥락으로 묶고, 결론이 확인이 필요한지·누구에게 갈지 판단
    if (url.pathname === '/api/review') {
      if (request.method !== 'GET') return new Response('method', { status: 405, headers: { Allow: 'GET' } })
      try {
        return Response.json(await review(env), { headers: { 'Cache-Control': 'no-store' } })
      } catch (e) {
        return Response.json({ error: true, status_code: 503, message: String(e && e.message ? e.message : e) }, { status: 503 })
      }
    }
    return env.ASSETS.fetch(request)
  },
  // 30분마다 블록별 현황 갱신 (wrangler.jsonc triggers.crons)
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runStatus(env).catch((e) => console.error('status', e && e.message)))
  },
}

const relaySeen = new Set()
async function relayFromVoice(env, drawings, utterances) {
  const found = await checkRelay(env, drawings, utterances, relaySeen)
  if (!Object.keys(found).length) return
  const res = await env.FLOW.get(env.FLOW.idFromName('drawings')).fetch('https://do/state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(found) })
  sharedMemo.drawings = { data: await res.json(), at: Date.now() }
}

async function runStatus(env, block) {
  const named = (u) => ({ ...u, worker_name: u.worker_name ?? WORKER_NAMES[u.worker_id] ?? null })
  const [all, acks] = await Promise.all([fetchUtterances(env, 200), sharedGet(env, 'acks')])
  // 시연 초기화(__since) 전 발화는 현황 요약에도 넣지 않는다
  const utterances = [...demoUtterances(), ...demoB02Utterances(), ...demoB01Utterances(demoB01At(acks)), ...afterReset(all, acks)].map(named).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
  const store = env.FLOW.get(env.FLOW.idFromName('status'))
  const [prev, orders] = await Promise.all([store.fetch('https://do/state').then((r) => r.json()).catch(() => ({})), sharedGet(env, 'drawings')])
  const { updatedAt: _u, log: _l, ...clean } = prev || {}
  const next = await updateStatus(env, utterances, orders, clean, block)
  await store.fetch('https://do/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
  sharedMemo.status = { data: next, at: Date.now() }
  return next
}

// 확인 요청은 한번 만들면 고정한다 — AI 에게는 새로 들어온 발화만 보여 주고, 기존 대화에 이어 붙일지 새 대화로 만들지만 정하게 한다
const REVIEW_PROMPT = `너는 조선소 현장 관제 보조다. [진행 중인 대화]와 그 뒤로 새로 들어온 [새 발화](STT·분류됨, 시간순)를 받는다.
STT 오인식이 있을 수 있다(예: 보관/복왕/부관 → 보강, 리비전 2/이비전2 → Rev.2, 2-01 → B-01, 2번 1공/이번 일공 → 이번 B-01, 럭/너그 → 러그).
진행 중인 대화 중 이미 확인 필요(needs_check=true)로 정해진 것은 바꾸지 않는다.

할 일:
1) 새 발화마다, 같은 주제·흐름이면 진행 중인 대화(cid)에 이어 붙이고, 아니면 새 대화(ref: "new1", "new2" …)로 묶는다. 같은 블록·같은 일을 다시 말한 것이면 새로 만들지 말고 이어 붙인다.
2) 새 대화만 판단한다: 관리자가 확인·조치할 일이 남았으면 needs_check=true.
   - lead(현장 담당자): 현장 작업 누락·미완료·재작업, 작업 보류, 안전, 인수인계 문제
   - designer(설계자): 도면 오류·도면과 실제 불일치로 설계 판단 필요, 설계 검토·도면 변경 요청.
     러그(인양 고리)를 어디에·몇 개 붙일지, 용접·보강 조건, 블록 인양 방법처럼 '어떻게 할지 아직 정해지지 않아' 묻는 것은
     도면으로 정하는 일이라 designer 다. 이미 도면에 정해진 대로 현장이 안 했거나 빠뜨린 것만 lead.
   - both: 둘 다 / none: 확인할 것 없음(잡담·테스트·이미 해결)
3) 확인할 것 없음(needs_check=false)이던 진행 중인 대화에 새 발화가 붙어서 이제 확인할 일이 생겼으면 raise 에 넣는다
   (예: "B-01 도면인데요" 다음에 "러그를 어디 붙일지·용접 보강 조건은 검토 쪽에서 봐줘야겠네요" → designer).
4) title 은 현장 말로 짧게(예: "보강 작업 누락 · 재작업 필요"), detail 은 무엇을 확인해야 하는지 한두 문장.

JSON 만 출력: {"assign":[{"voice_id":"V-…","to":"cid 또는 new1"}],"new":[{"ref":"new1","block":"B-01 또는 null","needs_check":true,"route":"lead|designer|both|none","title":"...","detail":"...","key_voice_id":"결론이 드러난 새 발화 id"}],"raise":[{"cid":"…","route":"lead|designer|both","title":"...","detail":"...","key_voice_id":"새 발화 id"}]}
모든 새 발화 id 는 정확히 한 번 assign 에 들어가야 한다.`

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Durable Objects 요청을 아끼려고, 확인·도면 기록은 8초 동안 이 Worker 메모리에서 답한다.
// 관제 화면이 여러 개 열려 있어도 Durable Objects 읽기는 8초에 한 번씩만 일어난다
const sharedMemo = {}
// 시연 초기화(acks.__since) 뒤에 나온 발화만 — 현황·작업자 앱 인수인계·퇴근 정리가 같은 기준을 쓴다
function afterReset(all, acks) {
  const since = typeof acks?.__since === 'string' ? new Date(acks.__since).getTime() || 0 : 0
  return since ? all.filter((u) => new Date(u.recorded_at).getTime() >= since) : all
}

async function sharedGet(env, name) {
  const m = sharedMemo[name]
  if (m && Date.now() - m.at < 8000) return m.data
  const data = await env.FLOW.get(env.FLOW.idFromName(name)).fetch('https://do/state').then((r) => r.json()).catch(() => (m ? m.data : {}))
  sharedMemo[name] = { data, at: Date.now() }
  return data
}

// 같은 발화 묶음의 AI 판단도 이 Worker 메모리에 먼저 둔다
let reviewMemo = { key: '', result: null }

async function fetchUtterances(env, limit) {
  if (!env.OVOT_SYNC || !env.OVOT_READ_TOKEN) throw new Error('발화 기록 연결이 설정되지 않았습니다.')
  const r = await env.OVOT_SYNC.fetch(`https://ovot-sync/api/utterances?limit=${limit}&order=desc`, { headers: { Authorization: `Bearer ${env.OVOT_READ_TOKEN}` } })
  if (!r.ok) throw new Error(`발화 조회 실패 (${r.status})`)
  return r.json()
}

async function review(env, recent) {
  const items = [...(recent || (await fetchUtterances(env, 80)))].slice(0, 80).reverse()
  // voice_id 는 학교 PC DB 가 초기화되면 다시 매겨지므로 녹음 시각까지 붙여 '처음 보는 발화'를 가린다
  const mark = (u) => `${u.voice_id}@${u.recorded_at}`
  const key = await sha(items.map(mark).join('|'))
  if (reviewMemo.key === key && reviewMemo.result) return reviewMemo.result
  const store = env.FLOW.get(env.FLOW.idFromName('review'))
  const saved = (await (await store.fetch('https://do/review')).json()) || {}
  if (saved.key === key && saved.result?.conversations?.every((c) => c.id)) { reviewMemo = { key, result: saved.result }; return saved.result }
  if (!items.length) return { conversations: [], at: Date.now() }

  // 예전 저장본 대화에는 id 가 없어서 첫 발화로 붙인다
  let conversations = (saved.result?.conversations ?? []).map((c) => ({ ...c, id: c.id || `C-old-${c.voice_ids[0]}` }))
  // 예전 저장본(seen 없음): 이미 대화에 들어간 발화는 본 것으로 친다
  const seen = new Set(saved.seen ?? items.filter((u) => conversations.some((c) => c.voice_ids.includes(u.voice_id))).map(mark))
  const fresh = items.filter((u) => !seen.has(mark(u)))
  const save = async (result) => {
    const keep = [...seen, ...fresh.map(mark)].slice(-600)
    await store.fetch('https://do/review', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, result, seen: keep }) })
    reviewMemo = { key, result }
    return result
  }
  if (!fresh.length) return save({ ...(saved.result ?? {}), conversations, at: saved.result?.at ?? Date.now() })

  // 번호가 다시 매겨져 덮어쓴 발화는 옛 대화에서 뺀다
  const freshIds = new Set(fresh.map((u) => u.voice_id))
  conversations = conversations
    .map((c) => ({ ...c, voice_ids: c.voice_ids.filter((v) => !freshIds.has(v)), key_voice_id: freshIds.has(c.key_voice_id) ? null : c.key_voice_id }))
    .filter((c) => c.voice_ids.length)

  // 시연 초기화 전 발화는 판단하지 않는다(화면에도 안 나옴). 초기화 뒤 대화만 이어 붙일 후보로 보여 준다
  const acks = await sharedGet(env, 'acks')
  const since = typeof acks?.__since === 'string' ? new Date(acks.__since).getTime() || 0 : 0
  const at = (u) => new Date(u.recorded_at || 0).getTime()
  const judge = fresh.filter((u) => at(u) >= since)
  if (!judge.length) return save({ conversations, at: Date.now(), model: saved.result?.model })
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 가 설정되지 않았습니다.')

  const byId = new Map(items.map((u) => [u.voice_id, u]))
  const open = conversations
    .filter((c) => c.voice_ids.some((v) => byId.has(v) && at(byId.get(v)) >= since))
    .slice(-12)
    .map((c) => ({ cid: c.id, block: c.block, title: c.title, needs_check: !!c.needs_check, route: c.route, lines: c.voice_ids.slice(-4).map((v) => byId.get(v)?.transcript).filter(Boolean) }))
  const lines = judge.map((u) => ({ id: u.voice_id, time: u.recorded_at, speaker: u.worker_id, block: u.block_id, text: u.transcript, labels: (u.labels || []).map((l) => `${l.category}>${l.subcategory}`) }))
  const model = env.OPENAI_MODEL || 'gpt-4.1-mini'
  const body = {
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: REVIEW_PROMPT },
      { role: 'user', content: `[진행 중인 대화]\n${JSON.stringify(open)}\n\n[새 발화]\n${JSON.stringify(lines)}` },
    ],
  }
  let res
  for (let i = 0; i < 3; i++) {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    })
    if (res.ok || (res.status < 500 && res.status !== 429)) break
    await new Promise((ok) => setTimeout(ok, 800 * (i + 1)))
  }
  if (!res.ok) throw new Error(`AI 판단 실패 (${res.status})`)
  const parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}')

  const judgeIds = new Set(judge.map((u) => u.voice_id))
  const stamp = Date.now()
  const made = new Map()
  for (const [i, n] of (parsed.new || []).entries()) {
    made.set(String(n.ref), {
      id: `C-${stamp}-${i}`,
      voice_ids: [],
      block: typeof n.block === 'string' && n.block !== 'null' ? n.block : null,
      needs_check: !!n.needs_check,
      route: ['lead', 'designer', 'both', 'none'].includes(n.route) ? n.route : 'none',
      title: String(n.title || '').slice(0, 80),
      detail: String(n.detail || '').slice(0, 300),
      key_voice_id: judgeIds.has(n.key_voice_id) ? n.key_voice_id : null,
    })
  }
  const placed = new Set()
  for (const a of parsed.assign || []) {
    const v = String(a.voice_id)
    if (!judgeIds.has(v) || placed.has(v)) continue
    const target = conversations.find((c) => c.id === a.to) || made.get(String(a.to))
    if (!target) continue
    target.voice_ids.push(v)
    placed.add(v)
  }
  // 확인할 것 없던 대화에 새 발화가 붙어 확인할 일이 생긴 경우만 판단을 올린다(이미 확인 필요인 대화는 그대로)
  for (const r of parsed.raise || []) {
    const c = conversations.find((c) => c.id === r.cid)
    if (!c || c.needs_check || !['lead', 'designer', 'both'].includes(r.route)) continue
    if (!c.voice_ids.some((v) => judgeIds.has(v))) continue
    Object.assign(c, { needs_check: true, route: r.route, title: String(r.title || c.title).slice(0, 80), detail: String(r.detail || c.detail).slice(0, 300), key_voice_id: judgeIds.has(r.key_voice_id) ? r.key_voice_id : c.key_voice_id })
  }
  // AI 가 빠뜨린 발화는 확인할 것 없는 한 줄 대화로 둔다
  for (const u of judge.filter((u) => !placed.has(u.voice_id))) {
    made.set(`left-${u.voice_id}`, { id: `C-${stamp}-${u.voice_id}`, voice_ids: [u.voice_id], block: u.block_id ?? null, needs_check: false, route: 'none', title: '', detail: '', key_voice_id: u.voice_id })
  }
  conversations = [...conversations, ...[...made.values()].filter((c) => c.voice_ids.length)].slice(-200)
  return save({ conversations, at: Date.now(), model })
}
