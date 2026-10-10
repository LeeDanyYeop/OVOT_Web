const { chromium } = require('playwright');
const fs = require('fs');
const API = 'http://127.0.0.1:8000', WEB = 'http://127.0.0.1:5173/';
const j = (u, o) => fetch(API + u, o).then(r => r.json());
const out = []; const ok = (n, c, x='') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
const contracts = JSON.parse(fs.readFileSync('/home/claude/ovot-admin-console/src/settings/contracts.json', 'utf8')).contracts;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1200);
  const pts = await p.locator('.yd-feature .yard-map').getAttribute('data-points');
  const total = pts.split(' ').reduce((s, x) => s + Number(x.split('/')[1]), 0);
  ok('Z1 점 밀도 증가 (구역 점 합계)', total > 25000, `${total}개 · ${pts}`);
  const scenes = await p.locator('.yd-feature .yard-map').getAttribute('data-scenes');
  const g = scenes.split(' ').find(s => s.startsWith('gantry>'));
  // C 는 0% → 크레인 점은 모두 미완료(50%) 색이어야 함
  ok('Z2 골리앗 크레인이 C구역 소속, C 진행률(0%) 따라 전부 미완료 색', g && g.startsWith('gantry>ZONE-C:0/'), g);
  await p.screenshot({ path: 'shots/z-overview.png' });
  // C 를 100% 로 바꾸면 크레인도 완료 색
  await fetch(API + '/tasks/T-103/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DONE' }) });
  await p.reload(); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1200);
  const g2 = (await p.locator('.yd-feature .yard-map').getAttribute('data-scenes')).split(' ').find(s => s.startsWith('gantry>'));
  const [d, n] = g2.split(':')[1].split('/').map(Number);
  ok('Z3 C구역 100% → 크레인 점 전부 완료 색', d === n && n > 0, g2);
  await p.screenshot({ path: 'shots/z-crane-done.png', clip: { x: 520, y: 260, width: 520, height: 300 } });
  await fetch(API + '/tasks/T-103/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PENDING' }) });
  // 사진 타일 (B 사진은 요청을 404 로 막아 '없음' 상태를 만든다)
  await p.route('**/zones/ZONE-B.jpg', r => r.fulfill({ status: 404, body: '' }));
  await p.reload(); await p.waitForSelector('.yard-label'); await p.waitForTimeout(800);
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 700)); await p.waitForTimeout(800);
  const photoA = await p.locator('.yd-item[data-zone="ZONE-A"] .yd-photo').getAttribute('data-photo');
  const photoB = await p.locator('.yd-item[data-zone="ZONE-B"] .yd-photo').getAttribute('data-photo');
  const msgB = await p.locator('.yd-item[data-zone="ZONE-B"] .yd-photo-msg').innerText().catch(() => '');
  const noCanvasInTiles = (await p.locator('.yd-item canvas').count()) === 0;
  ok('Z4 사진 타일: 있으면 표시, 없으면 등록 안내 (점 그림 없음)', photoA === 'ok' && photoB === 'missing' && msgB.includes('사진 등록 필요') && msgB.includes('public/zones/ZONE-B.jpg') && noCanvasInTiles, `A=${photoA} B=${photoB}`);
  await p.screenshot({ path: 'shots/z-tiles.png' });
  // 구역 화면 하청·일정
  const today = new Date(); const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let allMatch = true, detail = [];
  for (const c of contracts) {
    await p.goto(WEB + '#/zone/' + c.zone_id); await p.waitForSelector('.yd-contract');
    const shown = await p.locator('.yd-contract .yc-list li').evaluateAll(els => els.map(e => e.dataset.state));
    let active = false;
    const expect = c.milestones.map(m => { if (m.done) return 'done'; if (new Date(m.date + 'T00:00:00') < t0) return 'late'; if (!active) { active = true; return 'active'; } return 'planned'; });
    const name = await p.locator('.yc-head strong').innerText();
    if (JSON.stringify(shown) !== JSON.stringify(expect) || !name.includes('가상')) { allMatch = false; }
    detail.push(`${c.zone_id}:${shown.filter(s => s === 'late').length}지연`);
    if (c.zone_id === 'ZONE-A') await p.screenshot({ path: 'shots/z-zone-a.png' });
  }
  ok('Z5 일정 상태(완료·진행 중·예정·지연)가 오늘 날짜 기준 계산과 일치, 회사명에 가상 표시', allMatch, detail.join(' '));
  const note = await p.locator('.yc-note').innerText();
  ok('Z6 예시 데이터·서버 미연동 안내', note.includes('예시 데이터') && note.includes('서버 미연동'));
  // D·E 구역도 일정표
  await p.goto(WEB + '#/zone/ZONE-D'); await p.waitForSelector('.yd-contract .yc-list li');
  ok('Z7 작업 데이터 없는 D구역도 하청사·일정표 표시', (await p.locator('.yc-list li').count()) > 0 && (await p.locator('.yd-head p').innerText()).includes('작업 데이터 없음'));
  out.push('page errors: ' + (errs.join(' / ') || 'none'));
  console.log(out.join('\n')); await b.close();
})();
