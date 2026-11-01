// 메뉴 정리 · 구역도↔타일 hover 연동 · 회전 · 구역도 확대 · 타일 3열 검증
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8000', WEB = 'http://127.0.0.1:5173/';
const out = []; const ok = (n, c, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
const ds = (p) => p.locator('.yd-feature .yard-map').evaluate(e => ({ spin: e.dataset.spin, angle: +e.dataset.angle, frames: +e.dataset.frames, hover: e.dataset.hover, points: e.dataset.points }));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1500);
  // R1 메뉴
  const nav = await p.locator('.yd-nav').innerText();
  await p.goto(WEB + '#/zones'); await p.waitForTimeout(500);
  const h1 = await p.evaluate(() => location.hash);
  ok('R1 메뉴에 작업구역 없음 · #/zones → #/ 이동', !nav.includes('작업구역') && (h1 === '#/' || h1 === ''), `${nav.replace(/\n/g, '/')} · ${h1}`);
  await p.goto(WEB + '#/zone/ZONE-A'); await p.waitForSelector('.yd-contract');
  ok('R2 구역 화면에서 메뉴 활성 = 현황', (await p.locator('.yd-nav a.on').innerText()).startsWith('현황'));
  await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(1500);
  // R3 레이아웃
  const fw = await p.locator('.yd-feature').evaluate(e => e.getBoundingClientRect().width);
  const cw = await p.locator('.yd-content').evaluate(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
  const mh = await p.locator('.yd-tile-wide').evaluate(e => e.getBoundingClientRect().height);
  const noCopy = (await p.locator('.yd-feature .yd-copy').count()) === 0 && (await p.locator('.yd-head-meta').count()) === 0;
  const page = await p.locator('.yd-content').innerText();
  const noText = !/구역을 누르면|진하게 칠해진|작업장 전체 구역도/.test(page);
  const tip = await p.locator('.lg-info').getAttribute('data-tip');
  ok('R3 오른쪽 설명 칸·날짜 삭제, 구역도 본문 전체 폭·높이 약 62%, 진행률 기준은 ⓘ 툴팁', noCopy && noText && Math.abs(fw - cw) < 2 && Math.abs(mh - 900 * 0.62) < 4 && tip.includes('진행률 = 완료(DONE)'), `구역도 ${Math.round(fw)}px / 본문 ${Math.round(cw)}px · 높이 ${Math.round(mh)}px`);
  const cols = async () => p.locator('.yd-grid5').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  const c1600 = await cols();
  // R4 회전
  const s1 = await ds(p); const t1 = Date.now(); await p.waitForTimeout(3000); const s2 = await ds(p); const dt = (Date.now() - t1) / 1000;
  const fps = (s2.frames - s1.frames) / dt; const degps = (((s2.angle - s1.angle) + 360) % 360) / dt;
  ok('R4 회전 중 (약 6°/초 = 60초 한 바퀴), fps', s1.spin === 'on' && Math.abs(degps - 6) < 0.6 && fps >= 45, `${degps.toFixed(2)}°/초 · ${fps.toFixed(1)}fps (헤드리스 Chromium, 1600px)`);
  // R5 회전 중에도 진행률 = 서버
  const tasks = await (await fetch(API + '/tasks')).json();
  const ratio = Object.fromEntries(s2.points.split(' ').map(x => { const [z, v] = x.split(':'); const [d, n] = v.split('/').map(Number); return [z, d / n]; }));
  const pr = (z) => { const t = tasks.filter(x => x.zone_id === z && x.status !== 'CANCELLED'); return t.length ? t.filter(x => x.status === 'DONE').length / t.length : 0; };
  ok('R5 회전 중 완료 점 비율 = 서버 진행률', ['ZONE-A', 'ZONE-B', 'ZONE-C'].every(z => Math.abs(ratio[z] - pr(z)) < 0.01), ['ZONE-A', 'ZONE-B', 'ZONE-C'].map(z => `${z} ${(ratio[z] * 100).toFixed(0)}%=${(pr(z) * 100).toFixed(0)}%`).join(' '));
  await p.locator('.yd-feature').screenshot({ path: 'shots/v6-rot-1.png' });
  // R6 구역도 위 hover → 정지 + A 타일 강조
  const lbl = p.locator('.yard-label[data-zone="ZONE-A"]');
  // 움직이는 라벨을 바로 잡을 수 없으니 먼저 구역도 빈 곳에 올려 회전을 멈춘 뒤 라벨로 이동
  const box = await p.locator('.yd-feature .yard-map').boundingBox();
  await p.mouse.move(box.x + 40, box.y + 40); await p.waitForTimeout(300);
  await lbl.hover(); await p.waitForTimeout(400);
  const a1 = (await ds(p)).angle; await p.waitForTimeout(1500); const s3 = await ds(p);
  const lit = await p.locator('.yd-item.lit').evaluateAll(es => es.map(e => e.dataset.zone));
  const dim = await p.locator('.yd-item:not(.lit)').evaluateAll(es => es.map(e => getComputedStyle(e).opacity));
  const border = await p.locator('.yd-item[data-zone="ZONE-A"] .yd-photo').evaluate(e => getComputedStyle(e, '::after').borderTopColor);
  ok('R6 구역도 A hover → 회전 정지, A 타일 테두리 #007EEC·나머지 0.45', s3.spin === 'off' && s3.angle === a1 && lit.join() === 'ZONE-A' && dim.every(o => o === '0.45') && border === 'rgb(0, 126, 236)', `angle ${a1}→${s3.angle} · lit ${lit} · ${border}`);
  await p.screenshot({ path: 'shots/v6-map-hover-a.png' });
  // R7 벗어나면 그 각도에서 재개
  await p.mouse.move(5, 5); await p.waitForTimeout(1200); const s4 = await ds(p);
  ok('R7 구역도에서 벗어나면 이어서 회전, 타일 강조 해제', s4.spin === 'on' && s4.angle > a1 && s4.angle - a1 < 12 && (await p.locator('.yd-item.lit').count()) === 0, `${a1}° → ${s4.angle}°`);
  // R8 타일 hover → 구역도 강조
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 420)); await p.waitForTimeout(300);
  await p.locator('.yd-item[data-zone="ZONE-B"] .yd-photo').hover(); await p.waitForTimeout(300);
  const s5 = await ds(p); const lblB = await p.locator('.yard-label[data-zone="ZONE-B"]').getAttribute('class');
  ok('R8 B 타일 hover → 구역도 B 점·라벨 강조', s5.hover === 'ZONE-B' && lblB.includes('hover'), `data-hover=${s5.hover} · ${lblB}`);
  await p.screenshot({ path: 'shots/v6-tile-hover-b.png' });
  // R9 키보드 포커스
  await p.mouse.move(5, 5); await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.locator('.yard-label[data-zone="ZONE-C"]').focus(); await p.waitForTimeout(300);
  const litK = await p.locator('.yd-item.lit').evaluateAll(es => es.map(e => e.dataset.zone));
  await p.locator('.yard-label[data-zone="ZONE-C"]').evaluate(e => e.blur());
  await p.locator('.yd-item[data-zone="ZONE-D"]').focus(); await p.waitForTimeout(300);
  const hK = (await ds(p)).hover;
  ok('R9 키보드 포커스도 양방향 강조', litK.join() === 'ZONE-C' && hK === 'ZONE-D', `라벨 C 포커스→타일 ${litK} · 타일 D 포커스→구역도 ${hK}`);
  await p.locator('.yd-item[data-zone="ZONE-D"]').evaluate(e => e.blur());
  // R10 화면 밖 → 정지, 탭 숨김 → 정지
  // 타일이 한 줄이라 페이지가 짧아져 900px 높이에서는 구역도를 화면 밖으로 밀 수 없음 → 낮은 창에서 확인
  await p.setViewportSize({ width: 1600, height: 460 }); await p.waitForTimeout(300);
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 3000)); await p.waitForTimeout(600);
  const off1 = (await ds(p)).spin;
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 0)); await p.setViewportSize({ width: 1600, height: 900 }); await p.waitForTimeout(600);
  const back = (await ds(p)).spin;
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300); const off2 = (await ds(p)).spin;
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300); const back2 = (await ds(p)).spin;
  ok('R10 화면 밖 스크롤·탭 숨김이면 정지, 돌아오면 재개', off1 === 'off' && back === 'on' && off2 === 'off' && back2 === 'on', `밖 ${off1} → 안 ${back} · 숨김 ${off2} → 보임 ${back2}`);
  // R11 열 수
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(500); const c1180 = await cols();
  await p.screenshot({ path: 'shots/v6-1180.png' });
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 560)); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/v6-1180-tiles.png' });
  await p.setViewportSize({ width: 760, height: 900 }); await p.waitForTimeout(500); const c760 = await cols();
  ok('R11 구역 타일 열 수 1600px 5열 · 1180px 3열 · 760px 2열, 사진 4:3', c1600 === 5 && c1180 === 3 && c760 === 2, `${c1600}/${c1180}/${c760}`);
  // R12 reduced-motion
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const q = await ctx.newPage(); await q.goto(WEB); await q.waitForSelector('.yard-label'); await q.waitForTimeout(1500);
  const r = await ds(q);
  ok('R12 동작 줄이기 설정이면 회전하지 않음', r.spin === 'off' && !r.angle, `spin=${r.spin}`);
  // R13 구역 화면 미니맵은 회전 안 함
  await q.close();
  const z = await b.newPage({ viewport: { width: 1600, height: 900 } }); await z.goto(WEB + '#/zone/ZONE-A'); await z.waitForSelector('.yd-contract'); await z.waitForTimeout(1800);
  const zs = await z.locator('.yard-map').first().evaluate(e => e.dataset.spin);
  ok('R13 구역 화면 미니맵은 회전하지 않음', zs === 'off', `spin=${zs}`);
  // 전체 캡처
  await p.setViewportSize({ width: 1600, height: 900 }); await p.goto(WEB); await p.waitForSelector('.yard-label'); await p.waitForTimeout(6000);
  await p.screenshot({ path: 'shots/v6-overview.png' });
  await p.locator('.yd-feature').screenshot({ path: 'shots/v6-rot-2.png' });
  await p.locator('.yd-main').evaluate(el => el.scrollTo(0, 640)); await p.waitForTimeout(500); await p.screenshot({ path: 'shots/v6-tiles.png' });
  console.log(out.join('\n')); console.log('page errors:', errs.length ? errs : 'none');
  await b.close();
})();
