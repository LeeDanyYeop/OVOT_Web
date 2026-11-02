// B-02 운송 경로 막힘 시연 데이터 (하드코딩). B-04 처럼 항상 /api/state 에 섞어 보낸다.
// 트랜스포터가 B-02 를 싣고 도크 진입로에 왔는데, B-04 방수팀 자재 때문에 회전 반경이 안 나오고 골리앗 탑재 시간이 걸린 상황.

const L = (category, subcategory, evidence, confidence = 0.92, needs_review = false) => ({ category, subcategory, evidence, confidence, needs_review })

const LINES = [
  ['10:18', 'W-201', 'B-02 싣고 도크 진입로까지 왔는데요, B-04 받침대 옆에 방수팀 자재가 쌓여 있어서 회전 반경이 안 나와요.',
    [L('작업 대상', '운송', 'B-02 싣고 도크 진입로까지 왔는데요'), L('문제·이상 상황', '공정 충돌', '방수팀 자재가 쌓여 있어서 회전 반경이 안 나와요.')]],
  ['10:19', 'W-202', '골리앗 탑재가 오후 두 시로 잡혀 있어요. 지금 못 들어오면 오늘 탑재 슬롯 놓칩니다.',
    [L('문제·이상 상황', '일정 지연', '지금 못 들어오면 오늘 탑재 슬롯 놓칩니다.')]],
  ['10:19', 'W-201', '자재만 옮겨 주면 바로 들어가는데, 방수팀은 도포 대기 중이라 지금 못 치운대요.',
    [L('작업 상태', '작업 보류', '방수팀은 도포 대기 중이라 지금 못 치운대요.')]],
  ['10:20', 'W-202', '그럼 트랜스포터는 진입로 앞에 세워 두고, 담당자님께 자재 이동이랑 탑재 시간 확인 요청 드릴게요.',
    [L('작업 상태', '작업 보류', '트랜스포터는 진입로 앞에 세워 두고'), L('발화 의도', '확인 요청', '담당자님께 자재 이동이랑 탑재 시간 확인 요청 드릴게요.')]],
]
const id = (i) => `DEMO-B02-${String(i + 1).padStart(2, '0')}`

const todayAt = (hm) => {
  // 오늘(한국 시간) 날짜에 고정 시각을 붙인다
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  return `${d}T${hm}:00+09:00`
}

export function demoB02Utterances() {
  return LINES.map(([hm, worker, transcript, labels], i) => ({
    voice_id: id(i),
    worker_id: worker,
    zone_id: null,
    block_id: 'B-02',
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

export const demoB02Review = () => ({
  voice_ids: LINES.map((_, i) => id(i)),
  block: 'B-02',
  needs_check: true,
  route: 'lead',
  title: '운송 경로 막힘 · 골리앗 탑재 시간 조정 필요',
  detail: 'B-02 를 실은 트랜스포터가 도크 진입로에서 B-04 방수팀 자재에 막혀 들어오지 못하고 있습니다. 오후 2시 골리앗 탑재 슬롯을 놓치지 않으려면 자재 이동 지시나 탑재 시간 조정이 필요합니다.',
  key_voice_id: id(3),
})
