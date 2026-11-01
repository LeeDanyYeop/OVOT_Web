// 검은 무대 · 퍼짐 등장 · 깊이 음영 · 관제 호 · 연결 구역 수 · 타일 5열
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8000', WEB = 'http://127.0.0.1:5173/';
const out = []; const ok = (n, c, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WEB); await p.waitForSelector('.yard-label');
  // N1 바탕 검정
  const bg = await p.locator('.yd-feature .yd-tile-wide').evaluate(e => getComputedStyle(e).backgroundColor);
  ok('N1 구역도 바탕 검정(#05070D) + 대기 빛', bg === 'rgb(5, 7, 13)', bg);
  // N2 등장: 초기 프레임은 가운데로 모여 있다가 퍼짐 (점 픽셀 분포 폭 비교)
  const spread = async () => p.locator('.yd-feature canvas').evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let minX = 1e9, maxX = -1; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200 && d[i + 2] > 120) { const x = (i / 4) % cv.width; if (x < minX) minX = x; if (x > maxX) maxX = x; } } return maxX - minX; });
  const w0 = await spread(); await p.waitForTimeout(1200); const w1 = await spread();
  ok('N2 0~0.8초 가운데 한 점에서 퍼져 나와 작업장이 됨 (파란 점 분포 폭 증가)', w1 > w0 * 1.3, `${w0}px → ${w1}px`);
  // N3 깊이 음영: 같은 완료 색이라도 밝기 범위가 넓음 (뒤 어둡고 앞 밝음)
  const lum = await p.locator('.yd-feature canvas').evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let lo = 999, hi = 0; for (let i = 0; i < d.length; i += 4) { const [r, g, bb, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a === 255 && r < 10 && bb > 60 && Math.abs(g / bb - 126 / 236) < 0.06) { if (bb < lo) lo = bb; if (bb > hi) hi = bb; } } return [lo, hi]; });
  ok('N3 뒤쪽 점 어둡게 · 앞쪽 밝게 (완료 색 파랑 채널 범위)', lum[1] >= 220 && lum[0] <= 120, `B ${lum[0]}~${lum[1]}`);
  // N4 호·연결 수 = 서버 작업 데이터가 있는 구역 수, 0.4초 간격으로 올라감
  await p.reload(); await p.waitForSelector('.yard-label');
  const seq = []; const t0 = Date.now();
  for (let i = 0; i < 40; i++) { seq.push([Date.now() - t0, +(await p.locator('.yard-count b').innerText())]); await p.waitForTimeout(80); }
  const tasks = await (await fetch(API + '/tasks')).json();
  const withData = new Set(tasks.filter(t => t.zone_id).map(t => t.zone_id)).size;
  const steps = []; for (let i = 1; i < seq.length; i++) if (seq[i][1] !== seq[i - 1][1]) steps.push(seq[i][0]);
  const gaps = steps.slice(1).map((v, i) => v - steps[i]);
  const final = seq[seq.length - 1][1];
  ok('N4 연결 구역 수가 하나씩 올라가 서버 작업 데이터가 있는 구역 수에서 멈춤 (D·E 는 호 없음)', final === withData && steps.length === withData && gaps.every(g => g > 250 && g < 650), `최종 ${final}/${withData} · 증가 시각 ${steps.join(', ')}ms · 간격 ${gaps.join(', ')}ms`);
  await p.locator('.yd-feature').screenshot({ path: 'shots/v7-arcs.png' });
  // N5 색 규칙 유지: 강조 #007EEC, 주황 없음 (캔버스 픽셀)
  const orange = await p.locator('.yd-feature canvas').evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const [r, g, bb, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a > 100 && r > 150 && r > g + 40 && g > bb + 20) n++; } return n; });
  ok('N5 구역도에 주황 픽셀 없음', orange === 0, `${orange}`);
  // N6 5열 한 줄
  const tops = await p.locator('.yd-grid5 .yd-item').evaluateAll(es => [...new Set(es.map(e => Math.round(e.getBoundingClientRect().top)))].length);
  ok('N6 구역 타일 5개가 한 줄 (1600px)', tops === 1, `행 ${tops}`);
  // N7 동작 줄이기: 호·연결 수가 바로 최종 상태
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const q = await ctx.newPage(); await q.goto(WEB); await q.waitForSelector('.yard-label'); await q.waitForTimeout(600);
  const rq = +(await q.locator('.yard-count b').innerText());
  ok('N7 동작 줄이기 설정이면 회전·애니메이션 없이 최종 상태 표시', rq === withData, `${rq}`);
  console.log(out.join('\n')); console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
