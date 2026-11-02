import { useEffect, useState } from 'react'
import './console.css'
import './dockPreview.css'
import { TwinScene } from './TwinScene'
import { BlockCalendar } from './BlockCalendar'
import { BlockInspect } from './BlockInspect'
import {OvotChat} from './OvotChat'
import { TransitTracker } from './TransitTracker'
import { blocks as twin, PROCESS, type Team } from './twinBlocks'
import { demoStore } from '../demo/store'
import { UtteranceLog } from './screens/UtteranceLog'
import { ReviewQueue } from './screens/ReviewQueue'
import { SHIPYARDS, loadSite } from './screens/ShipyardMap'
import { BASE_REV, DrawingForm, DrawingRelay, latestRev, useDrawings, type OrderDraft } from './screens/Drawings'
import { openRequests, refreshStatus, useUtterances, when, type StatusMap } from './utterances'
import { USERS, type Role } from '../demo/scenarioB03'
import { LEAD_IDS, LEAD_KEY } from './LoginScreen'
// 로그인한 생산관리/공무감독 사번(W1·W2)의 담당자 이름
const leadName = () => { let id = 'W1'; try { id = localStorage.getItem(LEAD_KEY) || 'W1' } catch { /* 기본 W1 */ } return LEAD_IDS.find((l) => l.id === id)?.name ?? '강민철' }

type Block = { id: string; part: string; status: string; tone: string; location: string; team: string; description: string }
const blocks: Block[] = [
  { id:'B-04', part:'중앙 블록',status:'작업 중',tone:'teal',location:'도크 옆 지상 · 반전 상태',team:'방수팀 · 예시',description:'용접은 끝났고 뒤집어 놓은 채로 외판 방수 작업이 진행 중입니다.' },
  { id:'B-03', part:'기관부 블록',status:'완료',tone:'green',location:'도크 탑재 완료 · 기관부',team:'용접·방수·배관·전기팀 · 예시',description:'먼저 탑재한 기준 블록입니다. 용접·방수·배관·전기 작업과 검사가 모두 끝났습니다.' },
  { id:'B-01', part:'선미 블록',status:'작업 중',tone:'teal',location:'도크 탑재 완료 · 선미',team:'협력사 작업자',description:twin.find(t=>t.id==='B-01')?.summary??'' },
  { id:'B-02', part:'선수 블록',status:'운송 중',tone:'blue',location:'협력사 공장(울산 온산) → 도크1 · 트랜스포터',team:'운송팀 · 예시',description:'협력사 공장에서 만든 블록을 트랜스포터로 도크까지 옮기는 중입니다. 도착하면 인수 확인 후 탑재합니다.' },
]


// 전체 공정 흐름 — 세로 타임라인. 단계마다 담당 팀의 업무를 그 자리에 붙인다. 지금 단계 업무는 30분마다 현장 기록으로 다시 매긴 목록
const teamKey = (name: string) => name.replace(/\s*\(.*\)$/, '')
// 진짜 문제가 걸린 업무 줄에만 느낌표 — 아직 처리 안 된 확인 요청(AI 가 '확인 필요'로 판단한 것) 하나마다
// 그 요청 내용과 가장 많이 겹치는 업무 한 줄만 고른다. 겹치는 단어가 2개 미만이면 붙이지 않는다(블록 위 느낌표만).
// 이미 30초마다 받아 오는 확인 요청 목록만 쓰고, 서버나 AI 를 따로 부르지 않는다.
type TaskAlert = { title: string; text: string }
const GENERIC = new Set(['작업','진행','확인','블록','후','및','용접'])
const words = (task:string) => task.split(/[\s·,()/]+/).filter(w=>w.length>=2&&!GENERIC.has(w))
function taskAlerts(tasks:string[], reqs:TaskAlert[]) {
  const out = new Map<string, TaskAlert>()
  for (const r of reqs) {
    let best = 0, pick: string[] = []
    for (const t of tasks) {
      const n = words(t).filter(w=>r.text.includes(w)).length
      if (n > best) { best = n; pick = [t] } else if (n === best && n > 0) pick.push(t)
    }
    if (best >= 2 || (best === 1 && pick.length === 1 && words(pick[0]).length === 1)) for (const t of pick) if (!out.has(t)) out.set(t, r)
  }
  return out
}

function ProcessTimeline({step, teams, updatedAt, block, requests=[], onAlert}:{step:number; teams:Team[]; updatedAt?:string; block:string; requests?:TaskAlert[]; onAlert?:()=>void}) {
  const alerts = taskAlerts(teams.flatMap(t=>t.tasks.map(k=>k.text)), requests)
  const [busy,setBusy] = useState(false)
  const used = new Set<string>()
  const rows = PROCESS.map((p,i)=>{
    const mine = teams.filter(t=>teamKey(t.name)===p.team && !used.has(t.name) && (used.add(t.name), true))
    return { p, i, mine }
  })
  const rest = teams.filter(t=>!used.has(t.name))
  const label = (i:number) => step>=PROCESS.length || i<step ? '완료' : i===step ? '진행 중' : '예정'
  return <>
    <ol className="dp-vflow">{rows.map(({p,i,mine})=>{
      const state = step>=PROCESS.length || i<step ? 'is-done' : i===step ? 'is-now' : ''
      return <li key={p.name} className={state}>
        <i aria-hidden="true"/>
        <div className="dp-vflow-body">
          <header><b>{p.name}</b><span>{p.team}</span><em>{label(i)}</em></header>
          {mine.map(t=><ul key={t.name} className="dp-vflow-tasks">{t.tasks.map(k=>{const al=alerts.get(k.text);return <li key={k.text} data-task={k.state} data-alert={al?'':undefined}><span>{al&&<button className="dp-task-alert" title={`문제: ${al.title}`} aria-label={`문제 있음: ${al.title}`} onClick={onAlert}>!</button>}{k.text}</span><em>{taskMark[k.state]}</em></li>})}</ul>)}
          {i===step && <p className="dp-vflow-auto">{updatedAt?`현장 기록으로 자동 갱신 · ${when(updatedAt)}`:'30분마다 현장 기록으로 자동 갱신'}<button className="cn-link" disabled={busy} onClick={()=>{setBusy(true);void refreshStatus(block).catch(()=>{}).finally(()=>setBusy(false))}}>{busy?'갱신 중…':'지금 갱신'}</button></p>}
        </div>
      </li>
    })}</ol>
    {rest.length>0 && <><h3 className="dp-teamhead">기타 팀 업무</h3><TeamCards teams={rest}/></>}
  </>
}

// 지금 공정 팀의 업무를 30분 갱신 목록으로 바꿔 끼운다 (갱신 전이면 고정 예시 그대로)
function liveTeams(id: string, status: StatusMap): Team[] {
  const b = twin.find(x=>x.id===id)
  if (!b) return []
  const tasks = status[id]?.current?.tasks
  const team = PROCESS[b.step]?.team
  if (!tasks?.length || !team) return b.teams
  return b.teams.map(t=>teamKey(t.name)!==team ? t : { ...t, tasks, state: tasks.every(k=>k.state==='완료') ? '완료' : tasks.some(k=>k.state==='진행'||k.state==='재작업') ? '작업 중' : '대기' })
}

// 팀별 업무 — 설정 앱처럼 팀마다 회색 묶음, 업무는 한 줄씩. 진행 중인 업무만 파란 점·굵은 글씨로 강조
const taskMark: Record<string, string> = { '완료': '✓', '진행': '진행 중', '예정': '예정', '재작업': '재작업' }
function TeamCards({teams}:{teams:Team[]}) {
  return <div className="tw-groups">{teams.map(t=>{const done=t.tasks.filter(k=>k.state==='완료').length;return <section key={t.name} className="tw-group" data-state={t.state}>
    <header><b>{t.name}</b><span>{t.state} · {done}/{t.tasks.length} 완료</span></header>
    <ul>{t.tasks.map(k=><li key={k.text} data-task={k.state}><span>{k.text}</span><em>{taskMark[k.state]}</em></li>)}</ul>
  </section>})}</div>
}


// 시연 초기화 — 확인 완료·도면 배포·현장 전달 기록과 작업자 앱과 같이 쓰는 시연 흐름(지시 확인·완료 보고)을 비운다.
// 현장 녹음 발화는 지우지 않고, 초기화 시각 전 발화는 관제·작업자 앱 인수인계·퇴근 정리 모두에서 빠진다
async function resetDemo() {
  if (!window.confirm('지금까지의 현장 대화 기록, 확인 요청, 도면 변경·현장 전달 기록을 비우고 처음 상태로 돌릴까요?')) return
  const put = (path: string, body: string) => fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
  // __since: 이 시각 전 발화와 그로 생긴 확인 요청은 화면에서 숨긴다 (원본은 팀원 PostgreSQL·D1 에 그대로)
  await Promise.all([put('/sync/acks', JSON.stringify({ __since: new Date().toISOString() })), put('/sync/drawings', '{}'), put('/sync/status', '{}'), put('/sync/flow', '{}')])
  window.location.reload()
}

// 시나리오 흐름은 걷어내고(백업: backup/관제_시나리오_20261030), 현황 3D + 실제 현장 녹음(ovot-sync D1)만 보여준다.
// 확인 요청 = 녹음 중 AI 가 검토 필요·문제·미완료로 분류한 발화
const MENUS: Record<Role, string[]> = { lead: ['현황', '확인 요청', '지시·변경', '이력'], designer: ['현황', '확인 요청', '도면 변경', '이력'] }
// 화면에 보이는 메뉴 이름 — 협력사(하청) 담당자는 하는 일이 바로 보이게. 안쪽 키(확인 요청·지시·변경)는 그대로 둔다
const MENU_LABEL: Partial<Record<Role, Record<string, string>>> = { lead: { '확인 요청': '현장 보고', '지시·변경': '작업 지시' } }

export function DockPreview({ role }: { role: Role }) {
  const [selected,setSelected] = useState<string | null>(null)
  const [menu,setMenu] = useState('현황')
  const [orderDraft,setOrderDraft] = useState<OrderDraft | null>(null) // 현장 보고 → 작업 지시로 넘어올 때 그 블록·문안
  const [drawBlock,setDrawBlock] = useState<string | null>(null) // 확인 요청 → 도면 변경으로 넘어올 때 그 블록
  const label = (m:string) => MENU_LABEL[role]?.[m] ?? m
  // 블록을 고르면 카메라가 날아간 뒤 그 블록 내부 확대 화면을 띄운다 (zoomN: 같은 블록을 다시 골라도 다시 띄우기)
  const [inspect,setInspect] = useState<string | null>(null)
  const [zoomN,setZoomN] = useState(0)
  useEffect(()=>{ setInspect(null); if(!selected) return; const t=window.setTimeout(()=>setInspect(selected),1300); return ()=>clearTimeout(t) },[selected,zoomN])
  useEffect(()=>{document.title='OVOT 관제 · 도크 현황'},[])
  // 영상 촬영용: Ctrl+Shift+1 → B-01 러그 설계 검토 요청(항상 있는 시연 데이터)이 지금 현장 스트리밍으로 막 들어온 것처럼 — 확인 처리했어도 다시 뜬다
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{ if(!(e.ctrlKey&&e.shiftKey&&e.code==='Digit1')) return; e.preventDefault(); void fetch('/sync/acks',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({__demoB01:new Date().toISOString(),'DEMO-B01-01':null})}).catch(()=>{}) }
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey)
  },[])
  const utt = useUtterances()
  const open = openRequests(utt, role)
  const alertIds = [...new Set(open.map(c=>c.block).filter((b):b is string=>!!b&&blocks.some(x=>x.id===b)))]
  const me = role==='lead'?leadName():USERS[role].name
  // 로그인 전에 고른 조선소·도크로 시작 (3D 카메라도 그 도크로)
  const [site] = useState(()=>loadSite())
  const yard = site?.yard ?? SHIPYARDS[0]
  const dockSel = { name: site?.dock ?? '도크1', n: 1 }
  const drawings = useDrawings()
  const relayPending = drawings.filter(d=>!d.relayAt).length

  const progress = (id: string) => twin.find(t => t.id === id)?.progress ?? 0
  // 진행 현황 목록: 작업 중 → 운송 중 → 완료 순 (같은 상태끼리는 블록 번호 순)
  const order=(st:string)=>st==='작업 중'?0:st==='운송 중'?1:st==='완료'?3:2
  const sortedBlocks=[...blocks].sort((a,b)=>order(a.status)-order(b.status)||a.id.localeCompare(b.id))
  const block = blocks.find(b=>b.id===selected)
  const teamsOf=(id:string)=>liveTeams(id, utt.status)
  const nowOf=(id:string)=>teamsOf(id).flatMap(t=>t.tasks.filter(k=>k.state==='진행'||k.state==='재작업').map(k=>`${t.name.replace(/팀.*$/,'')} · ${k.text}`))
  const pick=(id:string)=>{setSelected(id);setMenu('현황');setZoomN(n=>n+1)}
  const avg = Math.round(twin.reduce((a,b)=>a+progress(b.id),0)/twin.length)
  const doneCount = twin.filter(b=>progress(b.id)===100).length

  return <div className="cn-root dp-root"><div className="cn-shell">
    <aside className="cn-side" aria-label="메뉴"><div className="cn-brand"><img src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="OVOT"/><span>관리자 관제</span></div>
      <div className="cn-user"><span className="cn-badge info" style={{alignSelf:'flex-start'}}>{USERS[role].roleLabel}</span><strong>{me}</strong><small>{USERS[role].org}</small><span className="dp-small">{dockSel.name} · 작업 현황</span><button className="cn-btn dp-logout" onClick={()=>demoStore.logout()}>로그아웃</button></div>
      <nav className="cn-nav">{MENUS[role].map(m=><button key={m} aria-current={menu===m?'page':undefined} onClick={()=>{setMenu(m);setOrderDraft(null)}}>{label(m)}{m==='확인 요청'&&open.length>0&&<em>{open.length}</em>}{m==='지시·변경'&&relayPending>0&&<em>{relayPending}</em>}</button>)}</nav>
      <OvotChat/>
      <div className="cn-side-foot"><button className="dp-reset" onClick={()=>void resetDemo().then(()=>{setSelected(null);setMenu('현황')})}>시연 초기화</button><span className="cn-sync local"><i/>현장 스트리밍 연동</span></div>
    </aside>
    <main className="cn-main">
      <div className="dp-body"><header className="dp-title"><div><p className="dp-overline">{yard.name} / {dockSel.name}</p><h1>{menu==='이력'?'현장 대화 기록':menu==='현황'?'오늘의 작업 현황':label(menu)}</h1></div></header>
      {menu==='이력'?<section className="cn-card dp-hist"><UtteranceLog/></section>:menu==='확인 요청'?<ReviewQueue by={me} role={role} onBlock={pick} onDrawing={(b)=>{setDrawBlock(b);setMenu('도면 변경')}} onOrder={(o)=>{setOrderDraft(o);setMenu('지시·변경')}}/>:menu==='도면 변경'?<DrawingForm key={drawBlock??''} blocks={blocks} by={me} initial={drawBlock}/>:menu==='지시·변경'?<DrawingRelay key={orderDraft?.from??''} by={me} blocks={blocks} draft={orderDraft}/>:<>
      {open.length>0?<button className="dp-alertline" onClick={()=>setMenu('확인 요청')}><i/><b>확인할 일 {open.length}건</b><span>{open[0].block?`${open[0].block} · `:''}{open[0].title}</span><em>보기 ›</em></button>:<div className="dp-alertline-gap"/>}
      <div className="dp-layout"><section className="cn-card dp-dock"><div className="dp-cardhead"><div><h2>Digital Twin</h2></div><span className="dp-overall">완료 {doneCount}/{twin.length} 블록 · 평균 공정률 {avg}%</span></div>
        <div className="dp-twin"><TwinScene selected={selected} onSelect={pick} labelOf={id=>blocks.find(b=>b.id===id)?.status} progressOf={progress} dockFocus={dockSel} focus={selected} alerts={alertIds} onAlert={()=>setMenu('확인 요청')}/>
          {inspect&&<BlockInspect key={inspect} block={inspect} requests={open.filter(c=>c.block===inspect).map(c=>({id:c.id,title:c.title,detail:c.detail,text:c.lines.map(u=>u.transcript).join(' ')}))} onClose={()=>setInspect(null)} onRequests={()=>setMenu('확인 요청')}/>}</div>
      </section>
      <aside className="cn-card dp-detail" aria-label="블록 상세"><div className="dp-cardhead"><div><h2>{block?`${block.id} · ${block.part}`:'진행 현황'}</h2></div>{block&&<button className="cn-btn" aria-label="블록 선택 해제" onClick={()=>setSelected(null)}>×</button>}</div>
        {!block?<div className="dp-blocklist dp-blocklist-side">{sortedBlocks.map(b=><button key={b.id} aria-pressed={selected===b.id} onClick={()=>pick(b.id)}><span className={`dp-dot ${b.tone}`}/><span><b>{b.id}{alertIds.includes(b.id)&&<i className="dp-list-alert" aria-label="확인할 발화 있음">!</i>}</b><small>{b.part}</small>{nowOf(b.id).map(n=><small key={n} className="dp-now">▸ {n}</small>)}</span><span className={`dp-status ${b.tone}`}>{b.status}</span><span className="dp-chevron">›</span></button>)}</div>:<><span className={`dp-status ${block.tone}`}>{block.status}</span>
          <dl className="dp-facts"><div><dt>위치</dt><dd>{block.location}</dd></div><div><dt>현재 작업</dt><dd>{twin.find(t=>t.id===block.id)?.stageLabel??block.status}</dd></div><div><dt>기준 도면</dt><dd>{(()=>{const d=latestRev(drawings,block.id);return d?`${d.rev} · ${d.relayAt?'현장 전달됨':'현장 전달 대기'}`:BASE_REV})()}</dd></div></dl>
          {block.id==='B-02'&&<TransitTracker/>}
          <h3 className="dp-teamhead">공정 진행</h3><ProcessTimeline step={twin.find(t=>t.id===block.id)?.step??0} teams={teamsOf(block.id)} updatedAt={utt.status[block.id]?.current?.at} block={block.id} requests={open.filter(c=>c.block===block.id).map(c=>({title:c.title,text:[c.title,c.detail,...c.lines.map(u=>u.transcript)].join(' ')}))} onAlert={()=>setMenu('확인 요청')}/>
          <div className="dp-summary"><h3>지금 상황</h3><p>{utt.status[block.id]?.current?.progress||block.description}</p></div>
          <BlockCalendar key={block.id} block={block.id}/>
        </>}
      </aside></div></>}
      </div>
    </main>
  </div></div>
}
