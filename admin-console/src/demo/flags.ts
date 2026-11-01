import { SCENE, ACTOR_LABEL, BASE_HISTORY, DECISION_CLOCK, FLAGS, FLAG_BY_ID, type Actor, type FlagDef, type FlagId } from './scenarioB03'
export interface DemoState { decisions: Record<FlagId, string | null>; order: FlagId[]; w106AckAt: string | null }
export const INITIAL_STATE: DemoState = { decisions: { ver: null, ack: null, yard: null }, order: [], w106AckAt: null }
export type FlagStatus = 'open' | 'decided' | 'resolved'
export function flagStatus(id: FlagId, s: DemoState): FlagStatus { return s.decisions[id] ? 'decided' : 'open' }
export const openFlags = (s: DemoState): FlagDef[] => FLAGS.filter(f => flagStatus(f.id,s) === 'open')
export const openCount = (s: DemoState) => openFlags(s).length
export function choiceOf(id: FlagId,s: DemoState) { const f=FLAG_BY_ID[id]; return f ? [f.primary,f.secondary].find(b=>b.key===s.decisions[id]) ?? null : null }
export const decidedAt = (id:FlagId,s:DemoState) => s.order.includes(id) ? DECISION_CLOCK[0] : null
export function decide(s:DemoState,id:FlagId,key:string):DemoState { return s.decisions[id] ? s : {...s,decisions:{...s.decisions,[id]:key},order:[...s.order,id]} }
export function undo(s:DemoState,id:FlagId):DemoState { return {...s,decisions:{...s.decisions,[id]:null},order:s.order.filter(x=>x!==id)} }
export function kpis(s: DemoState) { return {needs:openCount(s),activeEvents:1,ackDone:SCENE>=3?1:0,ackTotal:1,move:SCENE===1?'검토 중':SCENE===2?'배포 완료':SCENE===3?'작업 지시':'미완료',moved:false} }
export type Tone='warn'|'ok'
export function zoneNotes(s:DemoState):Record<string,{text:string;tone:Tone}> { return {'ZONE-A':{text:SCENE===1?'B-01 · 검토 요청':SCENE===2?'B-01 · Rev.2 배포':SCENE===3?'B-01 · 작업 지시':s.decisions.ver ? 'B-01 · 보강 재작업' : 'B-01 · 보강 누락 확인',tone:'warn'}} }
export interface Row {label:string;value:string;ok:boolean}
export function instructionRows(s:DemoState):{boundary1:Row[];boundary2:Row[]} { if(SCENE<4) return {boundary1:[{label:'제작·인양 검토',value:SCENE===1?'검토·협의 진행 중':'검토·승인 완료',ok:SCENE>=2},{label:'승인 도면·지침',value:SCENE===1?'검토 중':'Rev.2 · 작업 전 확인 사항 포함',ok:SCENE>=2},{label:'현장 담당자 1',value:SCENE>=3?'Rev.2·지침 확인 후 지시':'도면·지침 확인',ok:SCENE>=2}],boundary2:[{label:'작업 지시',value:SCENE>=3?'러그 부착·용접·보강까지 진행':'현장 지시 전',ok:SCENE>=3},{label:'협력사 작업자 응답',value:SCENE>=3?'“네, 알겠습니다.” · 응답 기록':'대기',ok:SCENE>=3},{label:'작업 후 확인',value:'작업 후 담당자에게 확인 요청',ok:false}]}; return {
 boundary1:[{label:'제작·인양 검토',value:'검토·승인 절차 완료',ok:true},{label:'배포 도면·지침',value:'Rev.2 · 작업 전 확인 사항 포함',ok:true},{label:'현장 담당자 1',value:'Rev.2·지침 확인 후 작업 지시',ok:true}],
 boundary2:[{label:'협력사 작업자 응답',value:'“네, 알겠습니다.”',ok:true},{label:'러그 부착·용접',value:'작업자 수행 보고',ok:true},{label:'보강 작업',value:s.decisions.ver ? '미완료 유지 · 재작업 후 재확인' : '미실시 · 담당자 확인 필요',ok:false}] } }
export interface HistoryItem {at:string;actor:Actor;actorLabel:string;text:string;search:string}
export function timeline(s:DemoState):HistoryItem[] { const items:HistoryItem[]=BASE_HISTORY.filter(h=>Number(h.at.slice(-1))<=SCENE).map(h=>({...h,actorLabel:ACTOR_LABEL[h.actor],search:h.search??h.text})); for(const id of s.order) {const c=choiceOf(id,s);if(c)items.push({at:'장면 4',actor:'lead',actorLabel:'원청',text:'현장 담당자 2 · '+c.log+' / 작업자: “보강까지 하고 다시 확인 요청드릴게요.”',search:'B-01 보강 누락 미완료 재작업 담당자 2 '+c.log})} return items }
export function reflection(_s:DemoState):{count:number;total:number;rows:Row[]} { return { count:SCENE===1?0:SCENE===2?1:2,total:3,rows:[{label:SCENE<=2?'설계 승인·배포':'원청 작업 지시',value:SCENE>=3?'Rev.2 · 러그 부착·용접·보강 전달':SCENE===2?'Rev.2 승인·지침 배포':'러그 위치·용접·보강 조건 검토 중',ok:SCENE>=2},{label:'협력사 작업자 응답',value:SCENE>=3?'지시 수신·응답 기록됨':'현장 지시 전 · 대기',ok:SCENE>=3},{label:'현장 작업 결과',value:SCENE===4?'러그 부착·용접 보고 / 보강 누락 · 미완료':'작업 전 · 현장 확인 대기',ok:false}] } }
