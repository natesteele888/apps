// Read 20 tests: story library checks, hand-worked log math, and the app in a real browser (fake clock for the timer).
const assert = require('assert');
const C = require('../apps/read20/core.js');
const B = require('../apps/read20/books.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const TODAY = '2026-11-08';

(async () => {
  await test('library: ids unique, 5 levels, plenty of stories, every page has words and a picture', () => {
    assert.ok(B.books.length >= 40, 'at least 40 stories');
    eq(new Set(B.books.map(b => b.id)).size, B.books.length, 'unique ids');
    for (const lv of B.LEVELS) assert.ok(B.books.filter(b => b.level === lv.n).length >= 7, 'level ' + lv.n + ' has 7+');
    for (const b of B.books) {
      assert.ok(b.title && b.cover && /^#[0-9a-f]{6}$/i.test(b.color), 'cover ' + b.id);
      assert.ok(b.pages.length >= 4, b.id + ' has pages');
      for (const p of b.pages) { assert.ok(p.text.trim().length > 0 && p.pic.trim().length > 0, b.id + ' page'); assert.ok(!/\|/.test(p.text), b.id + ' stray bar'); }
    }
  });
  await test('library: level 1 and 2 pages stay short (first-grade length)', () => {
    for (const b of B.books.filter(b => b.level <= 2)) for (const p of b.pages) {
      const n = p.text.split(/\s+/).length;
      assert.ok(n <= (b.level === 1 ? 7 : 8), b.id + ': "' + p.text + '" has ' + n + ' words');
    }
  });
  await test('core: day keys and adding days across month and year ends', () => {
    eq(C.dayKey(new Date(2026, 10, 8)), '2026-11-08'); eq(C.addDays('2026-11-30', 1), '2026-12-01'); eq(C.addDays('2026-01-01', -1), '2025-12-31'); eq(C.addDays('2028-02-28', 1), '2028-02-29');
    eq(C.parseDay('2026-02-30'), null); eq(C.parseDay('nope'), null);
  });
  await test('core: seconds add to the day and the story; goal and streak math', () => {
    const s = C.empty();
    eq(C.addSeconds(s, TODAY, 'a', 600), 600); eq(C.addSeconds(s, TODAY, 'b', 599), 599); eq(C.daySec(s, TODAY), 1199); assert.ok(!C.isDone(s, TODAY), '19:59 is not done');
    C.addSeconds(s, TODAY, 'b', 1); assert.ok(C.isDone(s, TODAY)); eq(s.days[TODAY].books.b.sec, 600);
    eq(C.addSeconds(s, TODAY, 'a', 0.9), 0); eq(C.addSeconds(s, TODAY, 'a', -5), 0);
    eq(C.streak(s, TODAY), 1);
    ['2026-11-07', '2026-11-06', '2026-11-04'].forEach(k => C.addSeconds(s, k, 'a', 1200));
    eq(C.streak(s, TODAY), 3, 'gap on the 5th ends the run');
    const t = C.empty(); ['2026-11-07', '2026-11-06'].forEach(k => C.addSeconds(t, k, 'a', 1200));
    eq(C.streak(t, TODAY), 2, 'today not done yet keeps last night\'s streak');
    eq(C.streak(C.empty(), TODAY), 0);
    const g = C.empty(); g.goal = 10; C.addSeconds(g, TODAY, 'a', 600); assert.ok(C.isDone(g, TODAY), '10 minute goal');
  });
  await test('core: finished stories, manual minutes, month grid and stats', () => {
    const s = C.empty(); C.finish(s, TODAY, 'a'); C.finish(s, '2026-11-01', 'a'); C.finish(s, TODAY, 'b');
    eq(C.finishedIds(s).a, 2); eq(Object.keys(C.finishedIds(s)).length, 2);
    assert.ok(C.addManual(s, TODAY, '  My Book ', 15)); eq(C.daySec(s, TODAY), 900); eq(s.days[TODAY].extra[0].title, 'My Book');
    assert.ok(!C.addManual(s, TODAY, 'x', 0)); assert.ok(!C.addManual(s, 'bad', 'x', 5)); assert.ok(!C.addManual(s, TODAY, 'x', 'abc'));
    const g = C.monthGrid(2026, 10); eq(g.length % 7, 0);     const first = C.monthGrid(2026, 10); // Sunday Nov 1: first cell is the 1st
    eq(first[0], '2026-11-01'); eq(first.filter(Boolean).length, 30);
    eq(C.monthGrid(2026, 1).filter(Boolean).length, 28); eq(C.monthGrid(2028, 1).filter(Boolean).length, 29);
    C.addSeconds(s, '2026-11-02', 'a', 1200); const st = C.monthStats(s, 2026, 10); eq(st.nights, 1); eq(st.sec, 900 + 1200);
    eq(C.fmtClock(125), '2:05'); eq(C.fmtMin(30), 'under 1 min'); eq(C.fmtMin(0), '0 min'); eq(C.fmtMin(1200), '20 min');
  });
  await test('core: damaged saves are cleaned up', () => {
    const s = C.sanitize({ name: 'A'.repeat(50) + '\u0007', goal: 7, size: 9, say: 'yes', days: { 'bad': { sec: 5 }, '2026-11-08': { sec: -4, books: { x: { sec: 'q', fin: 1 } }, extra: [{ title: 5, sec: 1e9 }, null] } } });
    eq(s.name.length, 20); eq(s.goal, 20); eq(s.size, 2); eq(s.say, false); eq(Object.keys(s.days).length, 1); eq(s.days[TODAY].sec, 0); eq(s.days[TODAY].books.x.fin, 1); eq(s.days[TODAY].extra[0].sec, 86400);
    eq(JSON.stringify(C.sanitize(null)), JSON.stringify(C.empty())); eq(JSON.stringify(C.sanitize('junk')), JSON.stringify(C.empty()));
  });

  /* ============ browser ============ */
  const srv = await startServer('read20'); const br = await launch();
  const mk = async (opts = {}) => { const o = await newPage(br, { today: TODAY, ...opts }); await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); return o; };
  const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1, (m || '') + ' expected ~' + b + ' got ' + a); // the page clock keeps moving a hair between clicks
  const sec = async page => page.evaluate(() => window.R20App._state().days[window.__today] ? window.R20App._state().days[window.__today].sec : 0);

  await test('shelf: shows tonight\'s ring, levels and covers', async () => {
    const { page, errors } = await mk();
    assert.ok(await page.locator('.cover').count() >= 7); eq(await page.locator('.lv').count(), 5);
    assert.ok(/ready to read/i.test(await page.locator('.today h2').innerText()));
    await page.locator('.lv[data-lv="5"]').click(); assert.ok(await page.locator('.cover', { hasText: 'Hare' }).count());
    await page.screenshot({ path: SHOTS + '/read20-shelf.png' }); eq(errors.length, 0, errors.join('|'));
  });
  await test('reader: tap a word to highlight it, tap again to clear, one at a time; page turn clears', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    const w = page.locator('.w'); eq(await w.count(), 4);
    await w.nth(1).click(); eq(await page.locator('.w.hl').count(), 1); eq(await page.locator('.w.hl').innerText(), 'is');
    await w.nth(3).click(); eq(await page.locator('.w.hl').count(), 1); eq(await page.locator('.w.hl').innerText(), 'cat.');
    await w.nth(3).click(); eq(await page.locator('.w.hl').count(), 0);
    await w.nth(0).click(); await page.locator('#nextp').click(); eq(await page.locator('.w.hl').count(), 0); eq(await page.locator('.pgnum').innerText(), 'Page 2 of 7');
    await page.screenshot({ path: SHOTS + '/read20-reader.png' });
    await page.keyboard.press('ArrowLeft'); eq(await page.locator('.pgnum').innerText(), 'Page 1 of 7'); assert.ok(await page.locator('#prev').isDisabled());
  });
  await test('timer: runs while reading, pauses, and carries into a second story to 20 minutes', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    await page.clock.runFor(10000); await page.locator('.w').first().click(); eq(await sec(page), 10);
    await page.locator('#pause').click(); await page.clock.runFor(30000); eq(await sec(page), 10, 'paused'); await page.locator('#pause').click();
    await page.clock.runFor(5000); near(await sec(page), 15); const base = await sec(page);
    // back to the shelf: the timer stops
    await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.clock.runFor(20000); eq(await sec(page), base, 'not reading');
    await page.locator('.cover', { hasText: 'The Fat Rat' }).click(); await page.waitForSelector('.reader');
    for (let i = 0; i < 19; i++) { await page.clock.runFor(60000); await page.locator('.w').first().click(); } // keep tapping so it is never idle
    near(await sec(page), base + 19 * 60); assert.ok(!(await page.locator('#party').count()), 'not yet 20');
    await page.clock.runFor(60000); await page.locator('#party').waitFor(); assert.ok((await sec(page)) >= 1200, 'party only after the 20 minutes are in');
    assert.ok(/20 minutes/.test(await page.locator('#party h2').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-party.png' });
    await page.locator('#keep').click(); await page.clock.runFor(61000); eq(await page.locator('#party').count(), 0, 'party shows once');
    await page.locator('#back').click(); await page.waitForSelector('.cover');
    assert.ok(/done/i.test(await page.locator('.today h2').innerText()));
    const st = await page.evaluate(() => window.R20App._state().days[window.__today].books);
    near(st['sam-the-cat'].sec, base); assert.ok(st['the-fat-rat'].sec > 1200);
  });
  await test('timer: goes idle after 2 minutes of no taps and wakes on a tap', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    await page.clock.runFor(125000); const s1 = await sec(page); assert.ok(s1 <= 121 && s1 >= 119, 'counted ' + s1);
    assert.ok(await page.locator('#idlebox').isVisible()); await page.clock.runFor(30000); eq(await sec(page), s1, 'idle adds nothing');
    await page.locator('.pic').click(); assert.ok(!(await page.locator('#idlebox').isVisible())); await page.clock.runFor(4000); near(await sec(page), s1 + 4);
  });
  await test('reader: finishing a story marks it read and logs it; log shows the day and the story', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    for (let i = 0; i < 7; i++) await page.locator('#nextp').click();
    assert.ok(/The End/.test(await page.locator('.the-end h2').innerText())); await page.clock.runFor(3000);
    await page.locator('#again').click(); eq(await page.locator('.pgnum').innerText(), 'Page 1 of 7');
    await page.locator('#back').click(); await page.waitForSelector('.cover');
    assert.ok(await page.locator('.cover', { hasText: 'Sam the Cat' }).locator('.check').count(), 'check mark');
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal');
    assert.ok(/November 2026/.test(await page.locator('.mhead h2').innerText()));
    assert.ok(/Sam the Cat/.test(await page.locator('#detail').innerText()) && /finished/.test(await page.locator('#detail').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-log.png' });
    await page.locator('#pm').click(); assert.ok(/October 2026/.test(await page.locator('.mhead h2').innerText()));
  });
  await test('layout: no sideways overflow on a narrow phone; calendar is 7 even columns that do not overlap', async () => {
    for (const w of [320, 360, 412]) {
      const o = await newPage(br, { today: TODAY, ctx: { viewport: { width: w, height: 800 } } }); const { page } = o;
      await page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await page.goto(srv.url + '#log'); await page.waitForSelector('.cal');
      const m = await page.evaluate(() => { const r = [...document.querySelectorAll('.day[data-d]')].map(e => e.getBoundingClientRect()), c = document.querySelector('.cal').getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, right: Math.max(...r.map(x => x.right)), cr: c.right, w0: r[0].width, w1: r[1].width, d1: r[0].bottom, d8: r[7].top, det: document.querySelector('#detail').getBoundingClientRect().top, calb: c.bottom }; });
      assert.ok(m.sw <= m.cw, w + ': page scrolls sideways ' + m.sw + ' > ' + m.cw); assert.ok(m.right <= m.cr + 1, w + ': day past the grid'); assert.ok(Math.abs(m.w0 - m.w1) < 1.5, w + ': uneven columns');
      assert.ok(m.d8 >= m.d1, w + ': rows overlap'); eq(await page.evaluate(() => { const t = [...document.querySelectorAll('.day[data-d]')].map(e => Math.round(e.getBoundingClientRect().top)); return t[7] === t[8] && t[8] === t[13]; }), true, w + ': today cell sits in line with its row'); assert.ok(m.det >= m.calb - 1, w + ': detail overlaps the calendar');
      await page.screenshot({ path: SHOTS + '/read20-log-' + w + '.png' });
      await page.goto(srv.url); await page.waitForSelector('.cover'); eq(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, w + ' shelf');
    }
  });
  await test('log from home + settings: minutes count, goal changes, name shows; survives reload', async () => {
    const { page, ctx } = await mk(); await page.locator('#manual').click();
    await page.fill('#mt', 'Paper Book'); await page.fill('#mm', '12'); await page.locator('#ms').click(); await page.waitForSelector('.cover');
    assert.ok(/12/.test(await page.locator('.rtxt b').innerText()));
    await page.locator('#gear').click(); await page.fill('#sn', 'Pat'); await page.selectOption('#sg', '10'); await page.locator('#sd').click();
    assert.ok(/done/i.test(await page.locator('.today h2').innerText()), '12 >= 10 minute goal');
    await page.reload(); await page.waitForSelector('.cover'); assert.ok(/Read 10/.test(await page.locator('h1').innerText()));
    await page.locator('#nav button[data-go="log"]').click(); assert.ok(/Paper Book/.test(await page.locator('#detail').innerText()));
  });
  await test('offline: the service worker caches the app and it reopens with no network', async () => {
    const o = await newPage(br, { sw: true, today: TODAY }); const { page, ctx } = o;
    await page.goto(srv.url); await page.waitForSelector('.cover'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.cover');
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.cover'); assert.ok(await page.locator('.cover').count() >= 7);
    eq(o.errors.length, 0, o.errors.join('|'));
  });

  await br.close(); srv.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' failed' : 'all passed: ' + results.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
