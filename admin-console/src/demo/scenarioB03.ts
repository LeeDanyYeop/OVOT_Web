/**
 * DEMO 시나리오 — 사건 EV-0317 · B-03 배관 도면 변경 (R0 → R1).
 * 관리자 웹의 모든 화면은 이 파일의 데이터만 읽는다. 서버 연동 시 이 모듈의 값을 API 응답으로 바꾼다.
 */

export type Role = 'lead' | 'designer'
export type FlagId = 'ver' | 'ack' | 'yard'

export const EVENT = {
  id: 'EV-0317',
  title: 'B-03 배관 도면 변경 (R0 → R1)',
  block: 'B-03',
  part: '배관',
  from: 'R0',
  to: 'R1',
  reason: '배관 경로가 의장 지지대와 간섭되어 경로 수정',
} as const

export const CLOCK = { date: '2026.10.17 (토)', now: '10:20' } as const

export const USERS: Record<Role, { id: string; name: string; org: string; roleLabel: string; hint: string; loginLabel: string }> = {
  lead: { id: 'L-1107', name: '박반장', org: '원청 생산1팀', roleLabel: '원청 반장', hint: '작업 지시 · 확인 요청 처리', loginLabel: '원청 반장으로 로그인' },
  designer: { id: 'D-2031', name: '김설계', org: '선체설계팀', roleLabel: '설계자', hint: '도면 변경 등록 · 반영 확인', loginLabel: '설계자로 로그인' },
}

export const RADIO = {
  speaker: '박반장',
  workerId: 'W-101',
  at: '10:05',
  text: 'B-03 배관 R1 기준으로 진행하고, 블록은 15시에 옮깁니다.',
} as const

export const TASK_CARD = {
  block: 'B-03',
  part: '배관',
  rev: 'R1',
  move: '15:00',
  crew: '누리블록공작 2명',
  zone: 'ZONE-A',
} as const

export const WORKERS = {
  'W-104': { id: 'W-104', name: '이정훈', lang: '한국어', langCode: 'ko' },
  'W-106': { id: 'W-106', name: '응우옌 반 투', lang: '베트남어', langCode: 'vi' },
} as const

export const TRANSLATION = {
  ko: RADIO.text,
  vi: 'Thi công ống B-03 theo bản vẽ R1. Khối sẽ được di chuyển lúc 15 giờ.',
} as const

export const ZONES = {
  A: { id: 'ZONE-A', label: '작업구역 A', desc: '조립장 · 누리블록공작' },
  E: { id: 'ZONE-E', label: '작업구역 E', desc: '탑재 대기장 · 크레인 C-2' },
} as const

export const SUBCONTRACT = { id: 'SO-221', company: '누리블록공작', refRev: 'R0' } as const
export const YARD_PLAN = { id: 'YM-0912', crane: 'C-2', other: 'B-01 탑재', window: '14:30–15:40' } as const

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

export const FLAGS: FlagDef[] = [
  {
    id: 'ver',
    kind: '버전 불일치',
    boundary: '1 · 설계 → 원청',
    title: '협력사 작업지시서가 아직 R0 도면을 참조하고 있습니다',
    left: { caption: '최신 승인 도면', value: 'B-03 배관 R1 · 09:12 등록' },
    right: { caption: '협력사 작업지시서 SO-221', value: 'B-03 배관 R0 참조' },
    proposal: '누리블록공작에 R1 기준 작업지시서 재발행 요청',
    primary: { key: 'reissue', label: '재발행 요청', log: '재발행 요청' },
    secondary: { key: 'dismiss', label: '반려 (문제 아님)', log: '반려' },
    mark: 'R1 기준',
    tone: 'orange',
  },
  {
    id: 'ack',
    kind: '전달 미확인',
    boundary: '2 · 원청 → 협력사',
    title: 'W-106 작업자가 15분째 지시 수신을 확인하지 않았습니다',
    left: { caption: '전달된 지시', value: '베트남어 번역 · 10:05 발송' },
    right: { caption: '수신 확인', value: 'W-104 10:08 확인 · W-106 미확인' },
    proposal: 'W-106에게 모국어 지시 재전송 후 반장이 구두 확인',
    primary: { key: 'resend', label: '재전송', log: '재전송' },
    secondary: { key: 'verbal', label: '구두로 확인함', log: '구두 확인' },
    mark: '블록은 15시에',
    tone: 'purple',
  },
  {
    id: 'yard',
    kind: '대기 예상',
    boundary: '2 · 원청 → 야드',
    title: '15:00 블록 이동 시각에 크레인 C-2가 다른 작업에 배정되어 있습니다',
    left: { caption: '지시된 이동', value: 'B-03 → 탑재 대기장 · 15:00' },
    right: { caption: '야드 계획 YM-0912', value: '크레인 C-2 · B-01 탑재 14:30–15:40' },
    proposal: 'B-03 이동을 16:00로 조정 (C-2 가용)',
    primary: { key: 'reschedule', label: '16:00로 조정', log: '16:00로 조정' },
    secondary: { key: 'dismiss', label: '반려 (문제 아님)', log: '반려' },
    mark: '15시에 옮깁니다',
    tone: 'yellow',
  },
]

export const FLAG_BY_ID = Object.fromEntries(FLAGS.map((f) => [f.id, f])) as Record<FlagId, FlagDef>

/** 결정을 내릴 때마다 이력에 찍는 시각 (시연용 가상 시계: 10:24 → 10:25 → 10:26) */
export const DECISION_CLOCK = ['10:24', '10:25', '10:26'] as const
export const WORKER_ACK_AT = '10:22'

export type Actor = 'design' | 'lead' | 'partner' | 'ovot'

export interface BaseHistory {
  at: string
  actor: Actor
  text: string
  /** 검색 대상 (작업자·블록·전사문) */
  search?: string
}

export const BASE_HISTORY: BaseHistory[] = [
  { at: '09:12', actor: 'design', text: '김설계(선체설계팀) · B-03 배관 도면 R1 등록 — 사유: ' + EVENT.reason, search: 'B-03 배관 R1 김설계 도면 간섭 지지대' },
  { at: '10:05', actor: 'lead', text: `박반장(W-101) 무전 · “${RADIO.text}”`, search: `W-101 박반장 B-03 ${RADIO.text}` },
  { at: '10:05', actor: 'ovot', text: '과업 카드 생성 · B-03 · 배관 · R1 · 15:00 이동 · 누리블록공작 2명', search: 'B-03 배관 R1 누리블록공작 과업 카드' },
  { at: '10:05', actor: 'ovot', text: '번역 지시 발송 · W-104 이정훈(한국어), W-106 응우옌 반 투(베트남어)', search: 'W-104 이정훈 W-106 응우옌 반 투 베트남어 번역 ' + TRANSLATION.vi },
  { at: '10:06', actor: 'ovot', text: '플래그 · 버전 불일치 (협력사 작업지시서 R0 참조)', search: '버전 불일치 SO-221 B-03' },
  { at: '10:06', actor: 'ovot', text: '플래그 · 대기 예상 (크레인 C-2 겹침)', search: '대기 예상 크레인 C-2 YM-0912 B-01' },
  { at: '10:08', actor: 'partner', text: 'W-104 이정훈 · 지시 수신 확인', search: 'W-104 이정훈 수신 확인' },
  { at: '10:20', actor: 'ovot', text: '플래그 · 전달 미확인 (W-106 15분째 미확인)', search: '전달 미확인 W-106 응우옌 반 투' },
]

export const ACTOR_LABEL: Record<Actor, string> = { design: '설계', lead: '원청', partner: '협력사', ovot: 'OVOT' }

/** 작업자 PWA(W-106) 화면 문구 */
export const W106 = {
  workerId: 'W-106',
  zoneLabel: '작업구역 A · 조립장',
  company: '누리블록공작',
  checkIn: 'NFC 체크인 07:52',
}
