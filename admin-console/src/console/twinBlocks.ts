// 미리보기용 예시 데이터. 블록마다 공정 단계가 달라 배가 '짓는 중'으로 보이게 한다.
export type Stage = 'done' | 'working' | 'ground' | 'transit'

export type TaskState = '완료' | '진행' | '예정' | '재작업'
export type Team = { name: string; state: '완료' | '작업 중' | '대기'; tasks: { text: string; state: TaskState }[] }
export type BlockInfo = {
  id: string
  name: string
  stage: Stage
  stageLabel: string
  progress: number
  location: string
  summary: string
  teams: Team[]
  log: { time: string; text: string; by: string }[]
  report?: { time: string; by: string; text: string; status: string }
  /** 전체 공정(PROCESS) 중 지금 하고 있는 단계 번호 (0부터). 완성까지 끝났으면 PROCESS.length */
  step: number
}

// 전체 공정 흐름 — 회의에서 예시로 정한 순서(실제 표준 공정은 아님)와 단계별 담당 팀
export const PROCESS: { name: string; team: string }[] = [
  { name: '입고', team: '운송팀' },
  { name: '품질관리', team: '품질팀' },
  { name: '용접', team: '용접팀' },
  { name: '방수', team: '방수팀' },
  { name: '전기', team: '전기팀' },
  { name: '도장', team: '도장팀' },
  { name: '흡음재', team: '의장팀' },
  { name: '조립', team: '조립팀' },
  { name: '완성', team: '품질팀' },
]

export const stageText: Record<Stage, string> = {
  done: '탑재·공정 완료',
  working: '탑재 후 작업 중',
  ground: '지상 반전 작업',
  transit: '운송 중',
}

export const blocks: BlockInfo[] = [
  {
    id: 'B-04',
    name: '중앙',
    stage: 'ground',
    stageLabel: '방수 작업 중',
    step: 3,
    progress: 62,
    location: '도크 옆 지상 · 뒤집어 놓은 상태',
    summary: '용접 끝나고 방수·도장 진행 중. 탑재 전에 뒤집어 놓은 채로 외판 방수를 하고 있어요.',
    teams: [
      { name: '방수팀', state: '작업 중', tasks: [
        { text: '하부 외판 방수 1차 도포', state: '완료' },
        { text: '측면 외판 방수 2차 도포', state: '진행' },
        { text: '갑판 방수·도막 두께 검사', state: '예정' },
      ] },
      { name: '용접팀', state: '완료', tasks: [
        { text: 'B-03 접합부 맞대기 용접', state: '완료' },
        { text: '용접부 비파괴 검사', state: '완료' },
      ] },
      { name: '배관팀', state: '대기', tasks: [
        { text: '배관 관통부 설치', state: '예정' },
      ] },
    ],
    log: [
      { time: '09:10', text: 'B-03 접합부 용접 완료', by: '용접팀' },
      { time: '10:40', text: '하부 방수 1차 도포 완료', by: '방수팀' },
      { time: '13:20', text: '측면 방수 2차 도포 진행', by: '방수팀' },
    ],
  },
  {
    id: 'B-03',
    step: 9,
    name: '기관부',
    stage: 'done',
    stageLabel: '완료',
    progress: 100,
    location: '도크 탑재 완료 · 중앙 기준 블록',
    summary: '먼저 올린 기준 블록. 용접·방수·배관·전기 모두 끝났어요.',
    teams: [
      { name: '용접팀', state: '완료', tasks: [
        { text: '도크 탑재 후 고정 용접', state: '완료' },
        { text: '용접부 비파괴 검사', state: '완료' },
      ] },
      { name: '방수팀', state: '완료', tasks: [
        { text: '외판 방수 도포', state: '완료' },
        { text: '도막 두께 검사', state: '완료' },
      ] },
      { name: '배관팀', state: '완료', tasks: [
        { text: '기관실 주배관 연결', state: '완료' },
        { text: '수압 시험', state: '완료' },
      ] },
      { name: '전기팀', state: '완료', tasks: [
        { text: '기관실 케이블 포설', state: '완료' },
        { text: '배선 절연 검사', state: '완료' },
      ] },
    ],
    log: [
      { time: '어제 16:30', text: '전기 배선 검사 통과', by: '전기팀' },
      { time: '어제 17:50', text: '최종 검사 완료 · 공정 종료', by: '관리자' },
    ],
  },
  {
    id: 'B-01',
    step: 2,
    name: '선미',
    stage: 'working',
    stageLabel: '러그 부착 준비',
    progress: 10,
    location: '도크 탑재 완료 · 선미 쪽',
    summary: '거주구 앞 갑판에 러그 부착과 그 아래 보강을 준비하고 있어요.',
    teams: [
      { name: '용접팀', state: '대기', tasks: [
        { text: '탑재 위치 정렬', state: '완료' },
        { text: '러그 부착·용접', state: '예정' },
        { text: '보강 작업', state: '예정' },
        { text: '용접부 검사', state: '예정' },
      ] },
    ],
    log: [
      { time: '08:30', text: '도크 탑재 완료', by: '크레인 신호수' },
    ],
  },
  {
    id: 'B-02',
    step: 0,
    name: '선수',
    stage: 'transit',
    stageLabel: '운송 중',
    progress: 0,
    location: '협력사 공장(울산 온산) → 도크1 이동 중 (트랜스포터)',
    summary: '협력사 공장에서 만든 블록을 트랜스포터로 옮기는 중. 도착하면 인수 확인 후 탑재해요.',
    teams: [
      { name: '용접팀', state: '대기', tasks: [
        { text: '도착 후 탑재 위치 맞춤', state: '예정' },
        { text: 'B-04 접합부 용접', state: '예정' },
      ] },
      { name: '방수팀', state: '대기', tasks: [
        { text: '선수 외판 방수 도포', state: '예정' },
      ] },
    ],
    log: [
      { time: '12:40', text: '협력사 공장 출발', by: '운송팀' },
      { time: '14:30', text: '도크 도착 예정', by: '운송팀' },
    ],
  },
]
