// B-04 공정 충돌 시연 데이터 (하드코딩). 실제 녹음(D1)과 같은 모양으로 /api/state 에 섞어 보낸다.
// 측면 외판 방수 2차 도포(방수팀)와 케이블 트레이 브래킷 용접(전기팀)이 같은 구역에서 겹치는 상황.

// 화면에 보일 화자 이름 (실제 녹음 작업자 포함)
export const WORKER_NAMES = {
  'W-001': '김민수',
  'W-005': '강민철',
  'W-101': '박상우 (방수팀)',
  'W-102': '정우진 (전기팀)',
}

const L = (category, subcategory, evidence, confidence = 0.92, needs_review = false) => ({ category, subcategory, evidence, confidence, needs_review })

const LINES = [
  ['09:41', 'W-101', 'B-04 측면 외판 방수 2차 도포 들어가려고 하는데요, 안쪽에 전기팀이 케이블 트레이 브래킷 용접하고 있네요.',
    [L('작업 대상', '방수', '측면 외판 방수 2차 도포'), L('문제·이상 상황', '공정 충돌', '안쪽에 전기팀이 케이블 트레이 브래킷 용접하고 있네요.')]],
  ['09:41', 'W-102', '네, 오늘 오전까지 브래킷 다 붙여야 해서요. 용접 불티가 튀니까 그쪽 도포는 좀 기다려 주셔야 될 것 같은데요.',
    [L('작업 진행·결과', '작업 진행 보고', '오늘 오전까지 브래킷 다 붙여야 해서요.'), L('문제·이상 상황', '안전 위험', '용접 불티가 튀니까', 0.88)]],
  ['09:42', 'W-101', '저희도 오늘 2차 도포 못 하면 건조 시간 때문에 도막 검사가 하루 밀려요.',
    [L('문제·이상 상황', '일정 지연', '도막 검사가 하루 밀려요.')]],
  ['09:42', 'W-102', '저희 끝나는 게 열한 시쯤인데, 그 전까지는 같은 구역에서 같이 못 합니다.',
    [L('작업 상태', '작업 보류', '그 전까지는 같은 구역에서 같이 못 합니다.')]],
  ['09:43', 'W-101', '알겠습니다. 일단 1구역은 손대지 말고 담당자님께 작업 순서 확인 요청 드릴게요.',
    [L('작업 상태', '작업 보류', '일단 1구역은 손대지 말고'), L('발화 의도', '확인 요청', '담당자님께 작업 순서 확인 요청 드릴게요.')]],
]

const todayAt = (hm) => {
  // 오늘(한국 시간) 날짜에 고정 시각을 붙인다
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  return `${d}T${hm}:00+09:00`
}

export function demoUtterances() {
  return LINES.map(([hm, worker, transcript, labels], i) => ({
    voice_id: `DEMO-B04-${String(i + 1).padStart(2, '0')}`,
    worker_id: worker,
    worker_name: WORKER_NAMES[worker],
    zone_id: null,
    block_id: 'B-04',
    task_id: null,
    transcript,
    recorded_at: todayAt(hm),
    classification: { run_id: 1, version: 'V1.0-KO', model: 'demo', status: 'SUCCEEDED', needs_review: false, review_reason: null, classified_at: todayAt(hm), labels },
    original_text: transcript,
    classification_status: 'SUCCEEDED',
    schema_version: 'V1.0-KO',
    needs_review: false,
    labels,
    demo: true,
  })).reverse()
}

export const demoReview = () => ({
  voice_ids: LINES.map((_, i) => `DEMO-B04-${String(i + 1).padStart(2, '0')}`),
  block: 'B-04',
  needs_check: true,
  route: 'lead',
  title: '방수 2차 도포 · 전기팀 용접과 공정 충돌',
  detail: '측면 외판 방수 2차 도포와 전기팀 케이블 트레이 브래킷 용접이 같은 구역에서 겹칩니다. 오늘 도포를 못 하면 도막 검사가 하루 밀리니, 작업 순서·구역 조정 지시가 필요합니다.',
  key_voice_id: 'DEMO-B04-05',
})
