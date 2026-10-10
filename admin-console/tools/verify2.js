const { chromium } = require('playwright');
const fs = require('fs');
const API = 'http://127.0.0.1:8000';
const out = []; const ok = (n, c, x='') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  // 새 대화 N건: 과거 기록을 보는 중이면 자동 스크롤 멈춤
  await p.goto('http://127.0.0.1:5173/'); await p.waitForSelector('.utt');
  await p.locator('.convo-scroll').evaluate(el => el.scrollTop = 0);
  await p.waitForTimeout(300);
  for (const t of ['테스트 발화 1: P-1 3번 보강재 외관 다시 확인합니다.', '테스트 발화 2: 검사 부위 접근 통로 정리 완료.'])
    await fetch(API + '/voice-records', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ worker_id: 'W-TEST', zone_id: 'ZONE-B', task_id: 'T-102', block_id: 'P-1', transcript: t }) });
  await p.waitForSelector('.new-pill', { timeout: 25000 });
  const pill = await p.locator('.new-pill').innerText();
  const top = await p.locator('.convo-scroll').evaluate(el => el.scrollTop);
  ok('7a 과거 기록 열람 중 새 발화 → 자동 스크롤 멈춤 + "새 대화 N건"', pill.includes('새 대화 2건') && top < 50, pill);
  await p.screenshot({ path: 'shots/v7-newpill.png' });
  await p.locator('.new-pill').click(); await p.waitForTimeout(300);
  const atBottom = await p.locator('.convo-scroll').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  ok('7b 알림 클릭 → 최신으로 이동', atBottom);

  // DEMO 모드
  await p.goto('http://127.0.0.1:5173/?mode=demo'); await p.waitForSelector('.utt');
  ok('8 DEMO 모드 → 상단 샘플 데이터 표시', (await p.locator('.notice-demo').count()) === 1 && (await p.locator('.demo-chip').innerText()).includes('샘플'));
  await p.screenshot({ path: 'shots/v8-demo.png' });

  // Unity 설정됐지만 빌드 없음 → 실패 표시 + 구역도 유지
  const cfgPath = '/home/claude/ovot-admin-console/public/ovot-config.json';
  const orig = fs.readFileSync(cfgPath, 'utf8');
  const c = JSON.parse(orig); c.unity = { ...c.unity, enabled: true, loaderUrl: 'unity/Build/missing.loader.js', dataUrl: 'x', frameworkUrl: 'x', codeUrl: 'x' };
  fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2));
  try {
    await p.goto('http://127.0.0.1:5173/'); await p.waitForSelector('.utt');
    await p.waitForTimeout(1500);
    const st = await p.locator('.twin-status').innerText();
    ok('9 Unity 빌드 로드 실패 → 실패 표시 후 구역도로 대체', st.includes('Unity 로드 실패') && st.includes('연결 전') && (await p.locator('.zone-shape').count()) === 5, st.replace(/\n/g, ' '));
  } finally { fs.writeFileSync(cfgPath, orig); }

  // 반응형
  for (const [w, h, name] of [[1180, 860, 'r1180'], [390, 844, 'r390']]) {
    const q = await b.newPage({ viewport: { width: w, height: h } });
    await q.goto('http://127.0.0.1:5173/'); await q.waitForSelector('.utt');
    const overflow = await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok(`10 ${w}px 가로 스크롤 없음`, !overflow);
    await q.screenshot({ path: `shots/${name}.png`, fullPage: w < 500 });
    await q.close();
  }
  console.log(out.join('\n'));
  await b.close();
})();
