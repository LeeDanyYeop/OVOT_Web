/**
 * DEMO 시나리오 — 사건 EV-B01 · B-01 러그 부착·용접·보강.
 * 관리자 웹의 모든 화면은 이 파일의 데이터만 읽는다. 서버 연동 시 이 모듈의 값을 API 응답으로 바꾼다.
 */

export const SCENE = Math.min(4, Math.max(1, Number(new URLSearchParams(window.location.search).get('scene')) || 4))

export type Role = 'lead' | 'designer'
export type FlagId = 'ver' | 'ack' | 'yard'

export const EVENT = {
  id: 'EV-B01',
  title: 'B-01 러그 부착·용접·보강',
  block: 'B-01',
  part: '러그 · 용접 · 보강',
  from: '검토 도면',
  to: SCENE === 1 ? '검토 중' : 'Rev.2',
  reason: '블록 제작 후 인양을 위한 러그 위치 및 용접·보강 조건 검토·승인',
} as const

export const CLOCK = { date: '최종 설계 시나리오', now: `장면 ${SCENE} · ${['', '검토 요청', '승인·배포', '작업 지시', '작업 후'][SCENE]}` } as const

export const USERS: Record<Role, { id: string; name: string; org: string; roleLabel: string; hint: string; loginLabel: string }> = {
  lead: { id: 'L-1107', name: SCENE < 4 ? '현장 담당자 1' : '현장 담당자 2', org: '협력사(하청) 우진케이', roleLabel: '생산관리/공무감독', hint: '작업 지시 · 현장 보고 처리', loginLabel: '생산관리/공무감독으로 로그인' },
  designer: { id: 'D-2031', name: '선체설계 책임', org: 'HD현대중공업 선체설계부', roleLabel: '설계', hint: '도면 변경 등록 · 반영 확인', loginLabel: '설계로 로그인' },
}

export const RADIO = {
  speaker: '현장 담당자 1',
  workerId: 'W-101',
  at: '장면 3',
  text: '이거 Rev.2예요. 여기 러그 붙이고 보강까지 같이 해주세요. 조건은 여기 보시면 되고요. 끝나면 확인 요청해주세요.',
} as const

export const TASK_CARD = {
  block: 'B-01',
  part: '러그 · 용접 · 보강',
  rev: 'Rev.2',
  zone: 'ZONE-A',
} as const

export const TRANSLATION = {
  ko: RADIO.text,
  vi: SCENE===3?'협력사 작업자: “여기하고 이쪽까지요?” 담당자 1: “네. 조건은 여기 보시면 되고요.” 작업자: “네, 알겠습니다.”':'여기 표시된 위치에 러그 붙이고 용접했습니다. 아… 보강은 안 했네요.',
} as const

export const ZONES = {
  A: { id: 'ZONE-A', label: '작업구역 A', desc: '블록 제작 현장' },
  E: { id: 'ZONE-E', label: '작업구역 E', desc: '인양 준비 구역' },
} as const

export interface FlagButton {
  key: string
  label: string
  /** 이력에 남는 결정 문구 */
  log: string
}

export interface FlagDef {
  id: FlagId
  kind: string
  boundary: '1 · 설계 → 원청' | '2 · 원청 → 협력사' | '2 · 원청 → 야드'
  title: string
  left: { caption: string; value: string }
  right: { caption: string; value: string }
  proposal: string
  primary: FlagButton
  secondary: FlagButton
  /** 근거 원문에서 강조할 구절 */
  mark: string
  /** 배지 색 이름 (console.css 의 .tone-*) */
  tone: 'orange' | 'purple' | 'yellow'
}

const OMISSION_FLAGS: FlagDef[] = [
  {
    id: 'ver', kind: '작업 누락', boundary: '2 · 원청 → 협력사',
    title: '전체 완료로 보고된 B-01 작업에서 보강 미실시가 확인되었습니다',
    left: { caption: '담당자 1의 기존 작업 지시 · Rev.2', value: '표시 위치에 러그 부착 · 용접 · 보강까지 진행' },
    right: { caption: '작업자 완료 보고 → 후속 대화', value: '“이 구간은 다 끝났습니다” → “보강은 안 했네요”' },
    proposal: '담당자 2가 보강 누락을 확인하고 미완료 유지 · 보강 작업 후 다시 확인',
    primary: { key: 'incomplete', label: '미완료 유지 · 보강 재작업 요청', log: '보강 누락 확인 · 미완료 유지 · 보강 후 재확인 요청' },
    secondary: { key: 'inspect', label: '도면·작업 부위 다시 확인', log: '도면과 실제 작업 부위 재확인 요청 · 미완료 유지' },
    mark: '보강까지 같이', tone: 'orange',
  },
]

export const FLAGS: FlagDef[] = SCENE === 1 ? [{
 id:'ver',kind:'검토 요청',boundary:'1 · 설계 → 원청',
 title:'B-01 러그 위치와 용접·보강 조건 검토가 필요합니다',
 left:{caption:'선체설계 책임',value:'제작 후 인양 예정 · 러그 위치 및 용접·보강 조건 검토 요청'},
 right:{caption:'제작·인양 검토 담당자',value:'관련 도면 확인 · 필요한 검토와 협의 진행'},
 proposal:'관련 도면을 확인하고 러그 위치 및 용접·보강 조건 검토·협의 진행',
 primary:{key:'review',label:'검토 요청 확인',log:'검토 요청 확인 · 도면 검토 및 협의 진행'},
 secondary:{key:'drawing',label:'관련 도면 확인 요청',log:'관련 도면 확인 요청'},
 mark:'',tone:'orange'
}] : SCENE === 4 ? OMISSION_FLAGS : []

export const FLAG_BY_ID = Object.fromEntries(FLAGS.map((f) => [f.id, f])) as Record<FlagId, FlagDef>

/** PDF에는 실제 시각이 없어 장면 순서로 이력을 표시한다. */
export const DECISION_CLOCK = ['장면 4', '장면 4', '장면 4'] as const

export type Actor = 'design' | 'lead' | 'partner' | 'ovot'

export interface BaseHistory {
  at: string
  actor: Actor
  text: string
  /** 검색 대상 (작업자·블록·전사문) */
  search?: string
}

export const BASE_HISTORY: BaseHistory[] = [
  { at: '장면 0', actor: 'lead', text: '현장 담당자 1 · “B-01 제작은 끝났습니다. 인양 준비하려면 어느 부분 도면을 봐야 할까요?”' },
  { at: '장면 0', actor: 'design', text: '선체설계 책임 · 블록 구조 도면과 러그 부착 부위 상세 도면을 함께 확인하기로 함' },
  { at: '장면 1', actor: 'design', text: '선체설계 책임 → 현장 담당자 1 · B-01 러그 위치와 용접·보강 조건 검토 요청' },
  { at: '장면 1', actor: 'ovot', text: '대화 수집 · 제작·인양 검토 담당자에게 검토 요청 표시. 담당자가 관련 도면 확인 및 협의 진행' },
  { at: '장면 2', actor: 'design', text: '검토·승인 절차 완료 · B-01 Rev.2 승인. 작업 전 확인 사항은 배포 지침에 포함' },
  { at: '장면 2', actor: 'lead', text: '현장 담당자 1 · “Rev.2 나왔네요. 지침도 같이 보고 내려가겠습니다.”' },
  { at: '장면 3', actor: 'lead', text: '담당자 1 · “이거 Rev.2예요. 여기 러그 붙이고 보강까지 같이 해주세요. 끝나면 확인 요청해주세요.”' },
  { at: '장면 3', actor: 'partner', text: '협력사 작업자 · “여기하고 이쪽까지요?” → 조건 안내 후 “네, 알겠습니다.” 응답 기록' },
  { at: '장면 4', actor: 'lead', text: '담당자 2가 구역 인수인계 · 관제에서 이전 작업 지시 확인' },
  { at: '장면 4', actor: 'partner', text: '작업자 · “이 구간은 다 끝났습니다.” / “여기 표시된 위치에 러그 붙이고 용접했습니다.”' },
  { at: '장면 4', actor: 'partner', text: '보강 여부 추가 질문 → “아… 보강은 안 했네요. 러그 붙이는 데까지만 했습니다.”' },
  { at: '장면 4', actor: 'ovot', text: '기존 지시 ‘러그 부착과 보강’과 전체 완료 보고를 연결. 후속 대화에서 보강 미실시 확인 · 담당자 확인 필요' },
]

export const ACTOR_LABEL: Record<Actor, string> = { design: '설계', lead: '원청', partner: '협력사', ovot: 'OVOT' }
