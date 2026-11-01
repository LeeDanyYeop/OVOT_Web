const { chromium } = require('playwright');
const API = 'http://127.0.0.1:8000', WEB = 'http://127.0.0.1:5173/';
const j = (u, o) => fetch(API + u, o).then(r => r.json());
const out = []; const ok = (n, c, x='') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${x ? ' | ' + x : ''}`);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WEB); await p.waitForSelector('.pship-label');
  ok('C1 기본 화면이 캔버스 레이아웃', (await p.locator('.cv-window').count()) === 1 && (await p.locator('.pship canvas').count()) === 1);
  // 왼쪽 목록 → 선박 구역도·오른쪽 패널
  await p.locator('.cv-zone', { hasText: '작업구역 B' }).click(); await p.waitForTimeout(300);
  const selPin = (await p.locator('.pship-label.selected b').textContent());
  const sub = await p.locator('.cv-right-title p').innerText();
  ok('C2 목록에서 B 선택 → 선박 구역도·AI 요약이 B 기준', selPin.startsWith('작업구역 B') && sub.startsWith('작업구역 B'), `${selPin} / ${sub}`);
  // 선박 구역도 클릭 → 목록
  await p.locator('.pship-label[data-zone="ZONE-C"]').click(); await p.waitForTimeout(300);
  ok('C3 구역도에서 C 클릭 → 목록 선택 변경', (await p.locator('.cv-zone.on').innerText()).startsWith('작업구역 C'));
  // 숫자 카드가 서버 데이터와 일치하는지 (C 구역 확인 필요)
  const statNeeds = Number(await p.locator('.cv-stat').first().locator('strong').innerText());
  const zoneNeeds = Number(await p.locator('.cv-zone.on em').innerText().catch(() => '0'));
  ok('C4 숫자 카드(확인 필요)와 구역 목록 수 일치', statNeeds === zoneNeeds, `${statNeeds} = ${zoneNeeds}`);
  // 포스트잇 → 오른쪽 확인 카드로 이동
  const first = p.locator('.cv-sticky li button').first();
  const txt = (await first.innerText()).trim();
  await first.click(); await p.waitForTimeout(600);
  ok('C5 "지금 확인할 것" 클릭 → 확인 요청 탭', (await p.locator('.cv-right .tabs button[aria-selected="true"]').innerText()).startsWith('확인 필요'), txt.slice(0, 30));
  // 대화 바 → 시트, 발언 선택 → 분석 연결
  await p.locator('.cv-zone', { hasText: '전체 구역' }).click();
  await p.locator('.cv-convo-bar').click(); await p.waitForSelector('.cv-sheet .utt');
  await p.locator('.cv-sheet [data-voice="V-110"]').click(); await p.waitForSelector('.selected-voice');
  const n = await p.locator('.selected-voice article.ev').count();
  ok('C6 대화 시트에서 발언 선택 → 연결 분석 표시', n === (await j('/events?voice_id=V-110')).length, `${n}건`);
  await p.locator('.cv-sheet [aria-label="대화 기록 닫기"]').click();
  // 왼쪽 검색 → 시트 검색어
  await p.locator('.cv-search input').fill('비드'); await p.locator('.cv-search input').press('Enter');
  await p.waitForTimeout(400);
  const hits = await p.locator('.cv-sheet .utt').count();
  ok('C7 왼쪽 검색 → 대화 기록 검색 결과', hits >= 1 && (await p.locator('.cv-sheet .search').inputValue()) === '비드', `${hits}건`);
  await p.locator('.cv-sheet [aria-label="대화 기록 닫기"]').click();
  // 확인·반려 영속
  const needs = await j('/events?event_status=NEEDS_CONFIRMATION');
  await p.locator(`.cv-right [data-event="${needs[0].event_id}"] .btn`, { hasText: '확인' }).click(); await p.waitForSelector('.toast');
  await p.waitForTimeout(800); await p.reload(); await p.waitForSelector('.cv-zone');
  const st = (await j(`/events?voice_id=${needs[0].voice_id}`)).find(e => e.event_id === needs[0].event_id).event_status;
  ok('C8 확인 처리 → 서버 저장·새로고침 후 유지', st === 'CONFIRMED' && (await p.locator(`.cv-right [data-event="${needs[0].event_id}"]`).count()) === 0, `#${needs[0].event_id} ${st}`);
  // 작업·인계 탭 (왼쪽 메뉴)
  await p.locator('.cv-nav button', { hasText: '작업·인계' }).click(); await p.waitForTimeout(300);
  const ho = (await j('/handoffs')).find(h => h.status === 'ACCEPTED');
  const row = p.locator('.cv-right .ho', { hasText: `#${ho.handoff_id} ` });
  const btns = await row.locator('.ev-actions .btn').allInnerTexts();
  await row.locator('.btn', { hasText: '진행 시작' }).click(); await p.waitForTimeout(900);
  const after = (await j('/handoffs')).find(h => h.handoff_id === ho.handoff_id).status;
  ok('C9 메뉴 "작업·인계" → 허용 전이 버튼만, 진행 시작 저장', btns.join() === '진행 시작,반려' && after === 'IN_PROGRESS', `${btns.join()} → ${after}`);
  // 1180: 오른쪽 서랍
  const q = await b.newPage({ viewport: { width: 1180, height: 820 } });
  await q.goto(WEB); await q.waitForSelector('.pship-label');
  const closedX = await q.locator('.cv-right').evaluate(el => el.getBoundingClientRect().left);
  await q.locator('.cv-drawer-btn').click(); await q.waitForTimeout(400);
  const openX = await q.locator('.cv-right').evaluate(el => el.getBoundingClientRect().left);
  const canvasRight = await q.locator('.cv-canvas').evaluate(el => el.getBoundingClientRect().right);
  ok('C10 1280px 미만 → 오른쪽 패널 서랍 열기 (닫힘: 캔버스 밖)', closedX >= canvasRight && openX < canvasRight, `${Math.round(closedX)} → ${Math.round(openX)}`);
  await q.screenshot({ path: 'shots/cv-1180-drawer.png' });
  // 주황색 제거 확인 + 인계 카운터
  await p.goto(WEB); await p.waitForSelector('.pship-label'); await p.waitForTimeout(4000);
  const orange = await p.evaluate(() => {
    const hits = [];
    const isOrange = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return r > 190 && g > 90 && g < 200 && b < 90 && r - b > 120; };
    for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const k of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'fill', 'stroke']) if (isOrange(cs[k])) hits.push(el.className + ':' + k); }
    return hits;
  });
  ok('C13 화면 요소에 주황색 없음', orange.length === 0, orange.slice(0, 3).join(', '));
  const pal = await p.evaluate(() => {
    const bad = new Set();
    const ok = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/); if (!m) return true; const [r, g, b] = m.slice(1, 4).map(Number); const a = m[4] === undefined ? 1 : Number(m[4]); if (a === 0) return true;
      const gray = Math.max(r, g, b) - Math.min(r, g, b) <= 24; const accent = r <= 30 && g >= 100 && g <= 150 && b >= 200; const red = r > 200 && g < 120 && b < 120; return gray || accent || red; };
    for (const el of document.querySelectorAll('.cv-page *')) { const cs = getComputedStyle(el); for (const k of ['color', 'backgroundColor', 'borderTopColor']) if (!ok(cs[k])) bad.add(`${el.className}:${k}:${cs[k]}`); }
    return { bad: [...bad], bg: getComputedStyle(document.querySelector('.cv-window')).backgroundColor, font: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('16px Pretendard') };
  });
  ok('C15 색: 배경 #05070D, 강조 #007EEC 외에는 흰색·회색(오류 빨강 제외)', pal.bad.length === 0 && pal.bg === 'rgb(5, 7, 13)', pal.bad.slice(0, 3).join(' / ') || pal.bg);
  ok('C16 글꼴: Pretendard 지정·로딩', pal.font.startsWith('Pretendard') && pal.loaded, pal.font.slice(0, 60));
  const counter = (await p.locator('.pship-counter strong').innerText()).replace(/\s+/g, ' ');
  const segHandoffs = (await j('/handoffs')).filter(h => /^ZONE-[A-E]$/.test(h.from_zone_id) && /^ZONE-[A-E]$/.test(h.to_zone_id)).length;
  ok('C14 인계 카운터 = 실제 인계 기록 수', counter === `${String(segHandoffs).padStart(2, '0')} / ${String(segHandoffs).padStart(2, '0')}`, counter);
  // 클래식 화면 유지
  await p.goto(WEB + '?layout=classic'); await p.waitForSelector('.board .utt');
  ok('C11 ?layout=classic → 기존 4분할 화면', (await p.locator('.board .panel').count()) === 4);
  // 연결 오류
  await p.goto(WEB); await p.waitForSelector('.cv-zone');
  require('child_process').execSync('pkill -f "[u]vicorn main:app" || true');
  await p.locator('.cv-convo-bar').click(); await p.locator('.cv-sheet [aria-label="최신 기록 갱신"]').click();
  await p.waitForSelector('.notice-error', { timeout: 15000 });
  ok('C12 서버 중단 → 이전 데이터 유지 + 오류·갱신 실패 표시', (await p.locator('.pship-label').count()) === 5 && (await p.locator('.cv-clock .warn').count()) === 1 && (await p.locator('.notice-error').innerText()).includes('최신이 아닙니다'));
  await p.screenshot({ path: 'shots/cv-offline.png' });
  out.push('page errors: ' + (errs.join(' / ') || 'none'));
  console.log(out.join('\n')); await b.close();
})();
