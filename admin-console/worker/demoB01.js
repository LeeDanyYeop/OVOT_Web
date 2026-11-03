// B-01 러그·보강 설계 검토 요청 시연 데이터 (하드코딩). B-04·B-02 처럼 항상 /api/state 에 섞어 보낸다.
// 발화 3줄과 설계팀(생산설계 책임)으로 가는 확인 요청. 관제에서 Ctrl+Shift+1 을 누르면 acks.__demoB01 에 그 시각이 남고,
// 그 시각에 현장 스트리밍으로 막 들어온 것처럼 시각이 바뀐다.

const L = (category, subcategory, evidence, confidence = 0.92) => ({ category, subcategory, evidence, confidence, needs_review: false })

const LINES = [
  [0, 'W-005', '이번 B-01 도면인데요, 제작하고 나서 들어 올려야 하잖아요.',
    [L('작업 대상', '도면', '이번 B-01 도면인데요')]],
  [8, 'W-005', '러그를 어디 붙일지 하고 용접, 보강 조건은 검토 쪽에서 봐줘야겠네요.',
    [L('작업 지시 정보', '조건부 지시', '용접, 보강 조건은 검토 쪽에서 봐줘야겠네요.'), L('발화 의도', '확인 요청', '검토 쪽에서 봐줘야겠네요')]],
  [15, 'W-001', '네, 그거 나오면 작업자들하고 같이 보겠습니다.',
    [L('발화 의도', '협의·조율', '작업자들하고 같이 보겠습니다')]],
]
const id = (i) => `DEMO-B01-${String(i + 1).padStart(2, '0')}`

// 언제 말한 것으로 둘지: 시연 초기화 뒤에 Ctrl+Shift+1 을 눌렀으면 그 시각, 아니면 오늘(한국 시간) 09:40.
// B-04·B-02 처럼 단축키 없이도 항상 보인다
export function demoB01At(acks) {
  const at = typeof acks?.__demoB01 === 'string' ? acks.__demoB01 : null
  const since = typeof acks?.__since === 'string' ? new Date(acks.__since).getTime() || 0 : 0
  if (at && new Date(at).getTime() >= since) return at
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  return `${d}T09:40:00+09:00`
}

// at: 단축키를 누른 시각(ISO). 0·8·15초 뒤에 말한 것으로 둔다
export function demoB01Utterances(at) {
  const t0 = new Date(at).getTime()
  return LINES.map(([sec, worker, transcript, labels], i) => {
    const recorded_at = new Date(t0 + sec * 1000).toISOString()
    return {
      voice_id: id(i),
      worker_id: worker,
      zone_id: 'ZONE-A',
      block_id: 'B-01',
      task_id: null,
      transcript,
      recorded_at,
      classification: { run_id: 1, version: 'V1.0-KO', model: 'demo', status: 'SUCCEEDED', needs_review: false, review_reason: null, classified_at: recorded_at, labels },
      original_text: transcript,
      classification_status: 'SUCCEEDED',
      schema_version: 'V1.0-KO',
      needs_review: false,
      labels,
      demo: true,
    }
  }).reverse()
}

export const demoB01Review = () => ({
  voice_ids: LINES.map((_, i) => id(i)),
  block: 'B-01',
  needs_check: true,
  route: 'designer',
  title: 'B-01 러그 위치·용접 보강 조건 검토 요청',
  detail: '블록을 들어 올리기 전에 러그를 어디에 붙일지와 용접·보강 조건이 아직 정해지지 않았습니다. 설계 검토 후 도면에 반영해 현장에 배포해야 합니다.',
  key_voice_id: id(1),
})
