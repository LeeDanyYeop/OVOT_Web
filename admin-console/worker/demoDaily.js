// B-01 러그 시나리오의 퇴근 '오늘의 업무 정리' 시연 데이터 (하드코딩). demoB01 처럼 항상 쓸 수 있게 둔다.
// 김민수(W-001)·강민철(W-005)이 그날 실제로 전사된 대화가 없을 때 이 정리를 보여 준다. 실제 대화가 있으면 AI 정리가 우선.
// 김민수는 러그만 붙이고 보강재는 못 한 상태, 강민철(반장)은 그 보고를 받아 체크하는 상태.

const items = (...xs) => xs.map((text) => ({ text, evidence: [] }))

const DEMO = {
  'W-001': {
    headline: 'B-01 러그 2곳 부착·용접을 마쳤어요',
    done: items('B-01 Rev.2 작업 지시 확인 (러그 부착·보강)', '거주구 앞 갑판 러그 2곳 부착·용접'),
    issues: items('러그 아래 보강재는 아직 붙이지 못함'),
    next: items('러그 아래 보강재 용접', '끝나면 강민철 반장에게 확인 요청'),
  },
  'W-005': {
    headline: 'B-01 Rev.2 지시와 작업 보고를 확인했어요',
    done: items('생산설계 Rev.2 도면·작업 지침 확인', '김민수에게 B-01 러그 부착·보강 작업 지시', '김민수 보고 · 러그 2곳 부착·용접 완료'),
    issues: items('러그 아래 보강재 미시공 — 재작업 필요'),
    next: items('보강재 용접 뒤 김민수 확인 요청 받기', '러그 위치를 Rev.2 도면과 대조 확인'),
  },
}

// 시연 대상 작업자가 아니면 null
export function demoDaily(worker) {
  const d = DEMO[worker]
  return d ? { count: 3, blocks: ['B-01'], ...d, demo: true } : null
}
