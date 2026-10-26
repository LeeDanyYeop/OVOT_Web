/**
 * DEMO 시나리오 B-03 — 작업자(W-106) 화면이 읽는 데이터와 공유 상태.
 * 관리자 웹(admin-console/src/demo)의 같은 이름 모듈과 상태 모양(DemoState)을 맞춘다.
 * 두 앱은 별개 패키지라 필요한 부분만 복사해 두었다. 서버 API 가 생기면 이 파일의 값을 응답으로 바꾼다.
 */
export type FlagId = 'ver' | 'ack' | 'yard'

export interface DemoState {
  decisions: Record<FlagId, string | null>
  order: FlagId[]
  w106AckAt: string | null
}

export const INITIAL_STATE: DemoState = {
  decisions: { ver: null, ack: null, yard: null },
  order: [],
  w106AckAt: null,
}

/** 작업자가 앱에서 '확인했습니다'를 누른 시각 (시연용 가상 시계) */
export const ACK_AT = '10:22'

export const W106 = {
  id: 'W-106',
  name: 'Nguyễn Văn Tú',
  langLabel: 'Tiếng Việt',
  zone: '작업구역 A · 조립장',
  company: '누리블록공작',
  checkIn: 'NFC 체크인 07:52',
  block: 'B-03',
  rev: 'R1',
  ko: 'B-03 배관 R1 기준으로 진행하고, 블록은 15시에 옮깁니다.',
  vi: 'Thi công ống B-03 theo bản vẽ R1. Khối sẽ được di chuyển lúc 15 giờ.',
  receivedAt: '10:05',
}

/** 블록 이동 시각 — 관리자가 야드 일정을 16:00로 조정하면 16:00 */
export const moveHour = (s: DemoState): 15 | 16 => (s.decisions.yard === 'reschedule' ? 16 : 15)

export function instruction(s: DemoState) {
  const h = moveHour(s)
  return {
    time: `${h}:00`,
    ko: W106.ko.replace('15시', `${h}시`),
    vi: W106.vi.replace('15 giờ', `${h} giờ`),
    changed: h !== 15,
  }
}
