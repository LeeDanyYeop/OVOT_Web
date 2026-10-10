const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8000';
const j = (u, o) => fetch(API + u, o).then(r => r.json().then(b => ({ s: r.status, b })));
const out = [];
const ok = (name, cond, extra='') => out.push(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  // 1. API 주소 설정: 잘못된 주소 → 오류, 샘플로 대체하지 않음
  await p.goto('http://127.0.0.1:5173/?api=http://127.0.0.1:8999');
  await p.waitForSelector('.notice-error', { timeout: 15000 });
  const demoShown = await p.locator('.notice-demo').count();
  const anyUtt = await p.locator('.utt').count();
  ok('1a 잘못된 API 주소 → 연결 오류 표시, DEMO 자동전환 없음', demoShown === 0 && anyUtt === 0);
  await p.screenshot({ path: 'shots/v1-bad-api.png' });
  await p.goto('http://127.0.0.1:5173/?api=http://127.0.0.1:8000');
  await p.waitForSelector('.utt');
  const apiVoices = (await j('/voice-records?limit=500')).b.length;
  ok('1b 올바른 API 주소 → 실제 서버 데이터 조회', (await p.locator('.utt').count()) === apiVoices, `UI ${await p.locator('.utt').count()} / API ${apiVoices}`);

  // 2. 구역 선택 → 트윈·대화·이벤트 동일 기준
  await p.locator('.zone-item', { hasText: '작업구역 B' }).click();
  await p.waitForTimeout(300);
  const twinVal = await p.locator('#twin-zone').inputValue();
  const selRect = await p.locator('.zone-shape.selected').count();
  const metas = await p.locator('.utt .utt-meta .tag:first-child').allInnerTexts();
  const allB = metas.length > 0 && metas.every(t => t.startsWith('작업구역 B'));
  const insSub = await p.locator('section[aria-label="AI 상황 요약"] .panel-sub').innerText();
  ok('2a 구역 B 선택 → 디지털트윈 선택 동기화', twinVal === 'ZONE-B' && selRect === 1);
  ok('2b 대화 목록이 구역 B 기준', allB, `${metas.length}건`);
  ok('2c AI 요약이 구역 B 기준', insSub.includes('작업구역 B'), insSub);
  // 지도에서 다른 구역 클릭 → 목록 선택 변경
  await p.locator('.zone-shape', { hasText: '작업구역 C' }).click();
  await p.waitForTimeout(300);
  const selList = await p.locator('.zone-item.selected .z-name').innerText();
  ok('2d 구역도 클릭(C) → 작업구역 목록 선택 변경', selList.startsWith('작업구역 C'), selList);
  await p.screenshot({ path: 'shots/v2-zone-c.png' });

  // 3. 발언 선택 → 연결 이벤트
  await p.locator('.zone-item', { hasText: '전체 구역' }).click();
  await p.locator('[data-voice="V-110"]').click();
  await p.waitForSelector('.selected-voice');
  const selEv = await p.locator('.selected-voice article.ev').count();
  const apiEv = (await j('/events?voice_id=V-110')).b.length;
  ok('3 발언(V-110) 선택 → 연결된 분석 결과 표시', selEv === apiEv && selEv === 2, `UI ${selEv} / API ${apiEv}`);
  await p.screenshot({ path: 'shots/v3-voice.png' });
  await p.locator('.selected-voice .link', { hasText: '선택 해제' }).click();

  // 4. 확인/반려 → 재조회 후 유지
  const needs = (await j('/events?event_status=NEEDS_CONFIRMATION')).b;
  const target = needs[0], target2 = needs[1];
  await p.locator(`[data-event="${target.event_id}"] .btn`, { hasText: '확인' }).click();
  await p.waitForSelector('.toast');
  await p.locator(`[data-event="${target2.event_id}"] .btn`, { hasText: '반려' }).click();
  await p.waitForTimeout(1200);
  await p.reload(); await p.waitForSelector('.utt');
  const s1 = (await j(`/events?voice_id=${target.voice_id}`)).b.find(e => e.event_id === target.event_id).event_status;
  const s2 = (await j(`/events?voice_id=${target2.voice_id}`)).b.find(e => e.event_id === target2.event_id).event_status;
  const stillListed = await p.locator(`.panel-body [data-event="${target.event_id}"]`).count();
  ok('4 확인·반려 → 서버 저장, 새로고침 후 유지', s1 === 'CONFIRMED' && s2 === 'REJECTED' && stillListed === 0, `#${target.event_id}=${s1}, #${target2.event_id}=${s2}`);

  // 5. 인계: UI로 생성 → 수락 → 진행 → 완료, 서버 규칙 확인
  await p.locator('.tabs button', { hasText: '작업·인계' }).click();
  const form = p.locator('.form-grid');
  await form.locator('select').nth(0).selectOption('T-103');
  await form.locator('select').nth(2).selectOption('ZONE-A');
  await form.locator('.btn', { hasText: '인계 요청' }).click();
  await p.waitForTimeout(1200);
  const created = (await j('/handoffs?task_id=T-103')).b[0];
  ok('5a UI 인계 요청 생성 (POST /handoffs)', created && created.status === 'REQUESTED' && created.from_zone_id === 'ZONE-C', JSON.stringify(created && { id: created.handoff_id, s: created.status }));
  const row = () => p.locator('.ho', { hasText: `#${created.handoff_id} ` });
  const btns1 = await row().locator('.ev-actions .btn').allInnerTexts();
  ok('5b REQUESTED 에서 허용 전이 버튼만 표시', JSON.stringify(btns1) === JSON.stringify(['수락', '반려']), btns1.join(','));
  for (const label of ['수락', '진행 시작', '완료']) { await row().locator('.btn', { hasText: label }).click(); await p.waitForTimeout(900); }
  const done = (await j('/handoffs?task_id=T-103')).b[0];
  ok('5c 수락→진행→완료 서버 반영', done.status === 'DONE' && done.accepted_at && done.completed_at);
  const task104 = (await j('/tasks/T-103')).b.status;
  ok('5d 인계 완료가 작업 상태를 바꾸지 않음', task104 === 'PENDING', `T-103 status ${task104} (원래 PENDING)`);
  // 서버 규칙 위반 시 UI가 오류를 보여주는지: 화면이 모르는 사이 서버에서 상태를 바꾼 뒤 UI 버튼 클릭
  const h2 = (await j('/handoffs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ task_id: 'T-105', from_zone_id: 'ZONE-A', to_zone_id: 'ZONE-E' }) })).b;
  await p.locator('section[aria-label="실시간 대화"] .icon-btn').click(); await p.waitForTimeout(1200);
  await j(`/handoffs/${h2.handoff_id}/status`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'REJECTED' }) });
  const r2 = p.locator('.ho', { hasText: `#${h2.handoff_id} ` });
  await r2.locator('.btn', { hasText: '수락' }).click(); await p.waitForTimeout(1000);
  const errText = await r2.locator('.ev-error').innerText().catch(() => '');
  ok('5e 서버가 거부(409)하면 성공으로 표시하지 않고 오류 안내', errText.includes('변경할 수 없습니다'), errText.slice(0, 70));
  await p.screenshot({ path: 'shots/v5-handoff.png' });

  // 6. 연결 오류 시 오래된 데이터 표시
  require('child_process').execSync('pkill -f "[u]vicorn main:app" || true');
  await p.locator('section[aria-label="실시간 대화"] .icon-btn').click();
  await p.waitForSelector('.notice-error', { timeout: 15000 });
  const banner = await p.locator('.notice-error').innerText();
  const conn = await p.locator('.conn').innerText();
  const uttsKept = await p.locator('.utt').count();
  const twinStale = await p.locator('.twin-status').innerText();
  ok('6 연결 오류 → 이전 데이터 유지 + 최신 아님 표시', banner.includes('최신이 아닙니다') && conn.includes('오류') && uttsKept > 0 && twinStale.includes('갱신 실패'), conn.replace(/\n/g,' '));
  await p.screenshot({ path: 'shots/v6-offline.png' });

  out.push('page errors: ' + (errs.join(' / ') || 'none'));
  console.log(out.join('\n'));
  await b.close();
})();
