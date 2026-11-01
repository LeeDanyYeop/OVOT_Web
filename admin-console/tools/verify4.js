const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8000', WEB = 'http://127.0.0.1:5173/';
const j = (u, o) => fetch(API + u, o).then(r => r.json());
const patch = (u, b) => j(u, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const out = []; const ok = (n, c, x='') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
// 미니맵 캔버스의 파란 점 픽셀을 진한(완료)/연한(미완료)로 센다
const countDots = (page) => page.locator(`.yd-feature .yard-map canvas`).evaluate((cv) => {
  // 검은 무대: 완료(#007EEC)·미완료(50%)는 같은 색상이고 깊이 음영으로 밝기가 섞이므로, 강조색 색상(hue)의 점이 있는지만 본다. 비율은 data-points 로 확인
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let strong = 0, faint = 0;
  for (let i = 0; i < d.length; i += 4) { const [r, g, b, a] = [d[i], d[i+1], d[i+2], d[i+3]]; if (a < 250 || r > 12 || b < 40) continue; if (Math.abs(g / b - 0.534) > 0.06) continue; if (b >= 150) strong++; else faint++; }
  return { strong, faint };
});
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 테스트 데이터: A구역 작업 2건 중 1건을 진행 중으로 → 50%
  await patch('/tasks/T-105/status', { status: 'IN_PROGRESS' });
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1300);
  ok('Y1 기본 화면 = 흰 배경 작업장(구역 5곳 라벨)', (await p.locator('.yd-window').count()) === 1 && (await p.locator('.yard-map .yard-label').count()) === 5);
  const tasks = await j('/tasks');
  const pct = (z) => { const t = tasks.filter(x => x.zone_id === z && x.status !== 'CANCELLED'); return t.length ? Math.round(100 * t.filter(x => x.status === 'DONE').length / t.length) : null; };
  const labels = {};
  for (const z of ['ZONE-A', 'ZONE-B', 'ZONE-C']) labels[z] = (await p.locator(`.yard-map .yard-label[data-zone="${z}"] em`).innerText()).trim();
  ok('Y2 구역 진행률 = 서버 작업 상태로 계산한 값', labels['ZONE-A'] === `${pct('ZONE-A')}%` && labels['ZONE-B'] === `${pct('ZONE-B')}%` && labels['ZONE-C'] === `${pct('ZONE-C')}%`, JSON.stringify(labels));
  const all = tasks.filter(t => t.status !== 'CANCELLED'); const totalPct = Math.round(100 * all.filter(t => t.status === 'DONE').length / all.length);
  ok('Y3 하단 전체 진행도 = 서버 값', (await p.locator('.yd-progress-main strong').innerText()) === `${totalPct}%`, `${totalPct}%`);
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 560)); await p.waitForTimeout(1000);
  const stats = Object.fromEntries((await p.locator('.yd-feature .yard-map').getAttribute('data-points')).split(' ').map(x => { const [z, v] = x.split(':'); const [d, n] = v.split('/').map(Number); return [z, d / n]; }));
  const px = await countDots(p);
  ok('Y4 점 색: 불투명(완료) 점 비율 = 진행률, 미완료는 50% 투명 (A 50%, B 100%, C 0%) + 개요 캔버스에 강조색 점 표시 (밝은 점·어두운 점 모두)', Math.abs(stats['ZONE-A'] - 0.5) < 0.01 && stats['ZONE-B'] === 1 && stats['ZONE-C'] === 0 && px.strong > 0 && px.faint > 0, `A ${(stats['ZONE-A']*100).toFixed(1)}% B ${stats['ZONE-B']*100}% C ${stats['ZONE-C']*100}% · 강조색 픽셀 밝음 ${px.strong} 어두움 ${px.faint}`);
  await p.screenshot({ path: 'shots/yd-50pct.png' });
  // 구역 클릭 → 디지털트윈 화면
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 0)); await p.waitForTimeout(200);
  { const bx = await p.locator('.yd-feature .yard-map').boundingBox(); await p.mouse.move(bx.x + 40, bx.y + 40); await p.waitForTimeout(300); } // 마우스를 올리면 회전이 멈춤
  await p.locator('.yard-map .yard-label[data-zone="ZONE-C"]').click(); await p.waitForTimeout(800);
  const hash = await p.evaluate(() => location.hash); const title = await p.locator('.yd-head h1').innerText();
  ok('Y5 구역도에서 C 클릭 → 구역 디지털트윈 화면', hash === '#/zone/ZONE-C' && title === '작업구역 C' && (await p.locator('.yd-twin').count()) === 1, `${hash} ${title}`);
  const rows = await p.locator('.yd-table tbody tr').count();
  ok('Y6 구역 화면 작업 목록 = 서버 작업 수, 진행도 바가 구역 기준', rows === tasks.filter(t => t.zone_id === 'ZONE-C').length && (await p.locator('.yd-progress-label').innerText()).startsWith('작업구역 C'), `${rows}건`);
  // 구역 화면에서 확인 처리 → 유지
  const needC = (await j('/events?event_status=NEEDS_CONFIRMATION')).find(e => e.task_id === 'T-103');
  await p.locator(`.yd-section [data-event="${needC.event_id}"] .btn`, { hasText: '확인' }).click(); await p.waitForSelector('.toast');
  await p.waitForTimeout(600); await p.reload(); await p.waitForSelector('.yd-table');
  const st = (await j(`/events?voice_id=${needC.voice_id}`)).find(e => e.event_id === needC.event_id).event_status;
  ok('Y7 구역 화면 확인 처리 → 저장·새로고침 후 유지', st === 'CONFIRMED' && (await p.locator(`[data-event="${needC.event_id}"]`).count()) === 0, `#${needC.event_id} ${st}`);
  // 작업·인계 페이지 인계 전이
  await p.goto(WEB + '#/work'); await p.waitForSelector('.yd-sheet .ho');
  const ho = (await j('/handoffs')).find(h => h.status === 'ACCEPTED');
  const row = p.locator('.ho', { hasText: `#${ho.handoff_id} ` });
  const btns = await row.locator('.ev-actions .btn').allInnerTexts();
  await row.locator('.btn', { hasText: '진행 시작' }).click(); await p.waitForTimeout(900);
  const after = (await j('/handoffs')).find(h => h.handoff_id === ho.handoff_id).status;
  ok('Y8 작업·인계: 허용 전이 버튼만, 진행 시작 저장', btns.join() === '진행 시작,반려' && after === 'IN_PROGRESS', `${btns.join()} → ${after}`);
  // 확인 요청 페이지: 구역 칩 필터
  await p.goto(WEB + '#/confirm'); await p.waitForSelector('.yd-chips');
  await p.locator('.yd-chips button', { hasText: '작업구역 B' }).click(); await p.waitForTimeout(300);
  const metas = await p.locator('.yd-sheet article.ev').evaluateAll(els => els.map(e => e.innerText));
  ok('Y9 확인 요청 페이지 구역 필터(B)', metas.length > 0 && metas.every(t => t.includes('작업구역 B')), `${metas.length}건`);
  // 색·글꼴
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1000);
  const pal = await p.evaluate(() => {
    const bad = new Set();
    const okc = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/); if (!m) return true; const [r, g, b] = m.slice(1, 4).map(Number); const a = m[4] === undefined ? 1 : Number(m[4]); if (a === 0) return true;
      return Math.max(r, g, b) - Math.min(r, g, b) <= 12 || (r <= 10 && g >= 110 && g <= 140 && b >= 220) || (r === 128 && g === 191 && b === 246) || (r === 3 && g === 67 && b === 125) /* #007EEC 50% (검은 무대 위) */ || (r > 200 && g < 40 && b < 60); };
    for (const el of document.querySelectorAll('.yd-page *')) { const cs = getComputedStyle(el); for (const k of ['color', 'backgroundColor', 'borderTopColor']) if (!okc(cs[k])) bad.add(`${el.className}:${k}:${cs[k]}`); }
    return { bad: [...bad], outer: getComputedStyle(document.querySelector('.yd-page')).backgroundColor, win: getComputedStyle(document.querySelector('.yd-window')).backgroundColor, font: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('16px Pretendard') };
  });
  ok('Y10 색: 흰 창·#F4F4F5 바탕, 강조 #007EEC 외 회색 계열만 (주황 없음)', pal.bad.length === 0 && pal.outer === 'rgb(244, 244, 245)' && pal.win === 'rgb(255, 255, 255)', pal.bad.slice(0, 3).join(' / '));
  ok('Y11 글꼴 Pretendard', pal.font.startsWith('Pretendard') && pal.loaded);
  // DEMO / 다른 레이아웃
  const d = await b.newPage(); await d.goto(WEB + '?mode=demo'); await d.waitForSelector('.yd-demo');
  ok('Y12 DEMO 모드 → 샘플 데이터 표시', (await d.locator('.yd-demo').innerText()).includes('샘플 데이터'));
  await d.goto(WEB + '?layout=classic'); await d.waitForSelector('.board .panel');
  ok('Y13 ?layout=classic 이전 화면 유지', (await d.locator('.board .panel').count()) === 4);
  // 1180 접이식 메뉴
  const q = await b.newPage({ viewport: { width: 1180, height: 820 } }); await q.goto(WEB); await q.waitForSelector('.yard-label');
  const hidden = await q.locator('.yd-nav').isHidden(); await q.locator('.yd-menu-btn').click(); const shown = await q.locator('.yd-nav').isVisible();
  ok('Y14 1280px 미만 접이식 메뉴', hidden && shown);
  await q.screenshot({ path: 'shots/yd-1180-menu.png' });
  // 연결 오류: 데이터를 받은 뒤 서버 중단
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(500);
  require('child_process').execSync('pkill -f "[u]vicorn main:app" || true');
  await p.evaluate(() => { location.hash = '/convo' }); await p.waitForSelector('[aria-label="최신 기록 갱신"]');
  await p.locator('[aria-label="최신 기록 갱신"]').click();
  await p.waitForSelector('.notice-error', { timeout: 15000 });
  const staleBar = await p.locator('.yd-progress.stale').count();
  const sub = await p.locator('.yd-progress-sub').innerText();
  ok('Y15 서버 중단 → 이전 데이터 유지 + 진행도 바 회색·마지막 갱신 기준 표시', staleBar === 1 && sub.includes('마지막 갱신') && (await p.locator('.utt').count()) > 0 && (await p.locator('.yd-conn.err').count()) === 1, sub);
  await p.screenshot({ path: 'shots/yd-offline.png' });
  out.push('page errors: ' + (errs.join(' / ') || 'none'));
  console.log(out.join('\n')); await b.close();
})();
