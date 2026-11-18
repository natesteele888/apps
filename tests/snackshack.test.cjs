// Snack Shack Screen tests. Run: NODE_PATH=<node_modules with playwright> tests/run.sh snackshack
// Part 1 checks the folder-name rules and the loop order in core.js on their own.
// Part 2 drives the TV page and the setup page in Chromium with the Google Drive feed stubbed (made-up files, no real data).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../apps/snackshack/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const at = s => new Date(s);
const it = (folders, name, extra) => Object.assign({ id: name, name, type: 'image', path: folders }, extra || {});
const ok = (folders, when, gameDay) => C.allows(it(folders, 'x'), { now: at(when), gameDay: gameDay === undefined ? null : gameDay });

const FEED_ID = 'AKfycbTestFeedOnlyForTheseTests_0123456789';
const FEED = 'https://script.google.com/macros/s/' + FEED_ID + '/exec';
// 1x1 PNGs in different colors (made-up content)
const PNG = {
  red: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  blue: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
};

(async () => {
  /* ================= part 1: core ================= */
  await test('core: folder names turn into rules', async () => {
    eq(JSON.stringify(C.parseFolder('Always')), '{"name":"Always"}');
    eq(C.parseFolder('Evening').start, 1020);
    const t = C.parseFolder('5-8pm'); eq(t.start, 1020); eq(t.end, 1200);
    const t2 = C.parseFolder('9am-1pm'); eq(t2.start, 540); eq(t2.end, 780);
    eq(C.parseFolder('Sponsors').sponsor, true);
    eq(C.parseFolder('Snack Menu').menu, true);
    eq(C.parseFolder('Game Day').gameDay, true);
    eq(C.parseFolder('_Drafts').off, true); eq(C.parseFolder('Off').off, true);
    eq(JSON.stringify(C.parseFolder('Weekends').days), '[0,6]');
    eq(JSON.stringify(C.parseFolder('Fall Ball Sundays').days), '[0]');
    eq(C.parseClock('noon'), 720); eq(C.parseClock('12am'), 0); eq(C.parseClock('9:30pm'), 1290); eq(C.parseClock('25'), -1);
  });

  await test('core: days, times, dates, seasons and game days', async () => {
    eq(ok(['Always'], '2026-05-16T10:00'), true);
    eq(ok(['Evening'], '2026-05-16T16:59'), false); eq(ok(['Evening'], '2026-05-16T17:00'), true);
    eq(ok(['Morning'], '2026-05-16T11:59'), true); eq(ok(['Morning'], '2026-05-16T12:00'), false);
    eq(ok(['Saturday'], '2026-05-16T10:00'), true); eq(ok(['Saturday'], '2026-05-17T10:00'), false);
    eq(ok(['Weekdays'], '2026-05-18T10:00'), true);
    eq(ok(['Opening Day 2026-05-16'], '2026-05-16T23:59'), true); eq(ok(['Opening Day 2026-05-16'], '2026-05-17T00:00'), false);
    eq(ok(['Tourney 2026-06-04 to 2026-06-06'], '2026-06-05T09:00'), true); eq(ok(['Tourney 2026-06-04 to 2026-06-06'], '2026-06-07T09:00'), false);
    eq(ok(['Sign up until 2026-03-20'], '2026-03-20T18:00'), true, 'until includes the day'); eq(ok(['Sign up until 2026-03-20'], '2026-03-21T08:00'), false);
    eq(ok(['from 2026-04-01'], '2026-03-31T08:00'), false); eq(ok(['from 2026-04-01'], '2026-04-01T08:00'), true);
    eq(ok(['Apr 18'], '2027-04-18T08:00'), true, 'no year means every year'); eq(ok(['4/18'], '2027-04-19T08:00'), false);
    eq(ok(['Dec 20 to Jan 5'], '2027-01-02T08:00'), true, 'a range over the new year'); eq(ok(['Dec 20 to Jan 5'], '2027-02-02T08:00'), false);
    eq(ok(['Spring'], '2026-05-16T10:00'), true); eq(ok(['Spring'], '2026-10-16T10:00'), false);
    eq(ok(['Game Day'], '2026-05-16T10:00', true), true); eq(ok(['Game Day'], '2026-05-16T10:00', false), false);
    eq(ok(['Game Day'], '2026-05-16T10:00', null), true, 'no schedule means every day');
    eq(ok(['Game Day', 'Evening'], '2026-05-16T10:00', true), false, 'every folder on the way down has to match');
    eq(ok(['Always', '_Drafts'], '2026-05-16T10:00'), false);
  });

  await test('core: the loop order mixes in sponsors and the menu, taking turns', async () => {
    const items = [it(['Always'], '10 ten.png'), it(['Always'], '2 two.png'), it(['Always'], '1 one.png'), it(['Always'], '3 three.png'),
      it(['Sponsors'], 'A.png'), it(['Sponsors'], 'B.png'), it(['Menu'], 'menu.png'), it(['Evening'], 'night.png'), it(['Always'], 'big.mp4', { tooBig: true })];
    const ctx = { now: at('2026-05-16T10:00') };
    let r = C.buildLoop(items, ctx);
    eq(r.list.map(x => x.name).join(','), '1 one.png,2 two.png,3 three.png,A.png,10 ten.png,menu.png', 'numbers sort like people read them');
    r = C.buildLoop(items, Object.assign({}, ctx, { sponsorTurn: r.sponsorTurn, menuTurn: r.menuTurn }));
    eq(r.list[3].name, 'B.png', 'the next pass gives the next sponsor a turn');
    r = C.buildLoop(items, { now: at('2026-05-16T19:00'), todayCard: true });
    eq(r.list[0].type, 'today'); eq(r.list.filter(x => x.name === 'night.png').length, 1);
    r = C.buildLoop([it(['Sponsors'], 'A.png'), it(['Menu'], 'm.png')], ctx);
    eq(r.list.map(x => x.name).join(','), 'm.png,A.png', 'only a menu and sponsors still plays');
  });

  await test('core: file names, the feed address and the schedule', async () => {
    eq(C.titleOf('02 Hot_Dogs [15s].png'), 'Hot Dogs'); eq(C.secondsFor({ name: 'x [15s].png' }, 10), 15); eq(C.secondsFor({ name: 'x (1 sec).png' }, 10), 10);
    eq(C.feedUrl(FEED), FEED); eq(C.feedUrl(FEED_ID), FEED); eq(C.feedUrl(FEED.replace('/exec', '/dev')), FEED);
    eq(C.feedUrl('https://evil.example.com/macros/s/' + FEED_ID + '/exec'), ''); eq(C.feedUrl('hello'), ''); eq(C.feedId(FEED), FEED_ID);
    const feed = { schedule: true, events: [
      { title: 'Majors: Red vs Blue', start: '2026-05-16T17:30', end: '2026-05-16T19:30', where: 'Field 1' },
      { title: 'Minors: Green vs Gold', start: '2026-05-16T09:00', end: '2026-05-16T10:30' },
      { title: 'Picture day', start: '2026-05-18', end: '2026-05-18', allDay: true }] };
    const lines = C.todayLines(feed, at('2026-05-16T12:00'));
    eq(lines.map(l => l.time).join(','), '9:00 AM,5:30 PM'); eq(lines[0].ended, true); eq(lines[1].ended, false);
    eq(C.isGameDay(feed, at('2026-05-16T12:00')), true); eq(C.isGameDay(feed, at('2026-05-17T12:00')), false); eq(C.isGameDay({}, at('2026-05-17T12:00')), null);
    const up = C.comingUp(feed, at('2026-05-16T12:00'), 7); eq(up.length, 1); eq(up[0].dow, 'monday'); eq(up[0].items[0].time, '');
  });

  /* ================= part 2: the pages ================= */
  const server = await startServer('snackshack');
  const browser = await launch();
  const calls = [];
  const LIST = { ok: true, folder: 'Snack Shack Screen', schedule: true, items: [
    { id: 'f-red', name: '01 Welcome.png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['Always'] },
    { id: 'f-blue', name: '02 Rules [3s].png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['Always'] },
    { id: 'f-gd', name: 'Lineups.png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['Game Day'] },
    { id: 'f-spon', name: 'Sponsor A.png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['Sponsors'] },
    { id: 'f-night', name: 'Lights.png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['Evening'] },
    { id: 'f-draft', name: 'Not yet.png', type: 'image', mime: 'image/png', modified: '2026-05-01T00:00:00Z', path: ['_Drafts'] },
    { id: 'f-huge', name: 'Huge.mp4', type: 'video', mime: 'video/mp4', modified: '2026-05-01T00:00:00Z', path: ['Always'], tooBig: true },
    { id: 'deck', name: 'Menu deck', type: 'slides', modified: '2026-05-01T00:00:00Z', path: ['Menu'], pages: ['p1', 'p2'] }],
    events: [{ title: 'Majors: Red vs Blue', start: '2026-05-16T17:30', end: '2026-05-16T19:30', where: 'Field 1' },
      { title: 'Minors: Green vs Gold', start: '2026-05-16T09:00', end: '2026-05-16T10:30' },
      { title: 'Picture day', start: '2026-05-18', end: '2026-05-18', allDay: true }] };
  async function stubFeed(page, mode) {
    await page.route(/script\.google\.com\/macros\/s\//, route => {
      const u = new URL(route.request().url());
      calls.push(u.searchParams.get('a') + ':' + (u.searchParams.get('id') || '') + (u.searchParams.get('page') ? '~' + u.searchParams.get('page') : ''));
      if (mode === 'down') return route.abort();
      if (!u.pathname.includes(FEED_ID)) return route.fulfill({ status: 404, body: 'no' });
      const a = u.searchParams.get('a');
      let body = { ok: false, error: 'unknown' };
      if (a === 'list' || a === 'ping') body = LIST;
      else if (a === 'file' || a === 'slide') body = { ok: true, mime: 'image/png', data: u.searchParams.get('id') === 'f-blue' ? PNG.blue : PNG.red };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    });
  }
  const NOW = '2026-05-16T12:00:00'; // a Saturday, noon, with games that day
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });

  await test('screen: with no feed it plays sample slides and says where to set it up', async () => {
    const { page, errors } = await newPage(browser, { context: ctx });
    await page.addInitScript(n => { window.__now = n; }, NOW);
    await page.goto(server.url + 'screen.html?sec=60');
    await page.waitForSelector('.slide.on .card');
    assert.ok(/natesteele888\.github\.io\/apps\/snackshack/.test(await page.textContent('#hint')), 'setup hint');
    const first = await page.getAttribute('.slide.on', 'data-name');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(f => { const s = document.querySelectorAll('.slide'); return s[s.length - 1].getAttribute('data-name') !== f; }, first);
    eq((await page.textContent('#clock')).trim(), '12:00 PM');
    eq(errors.join('\n'), '');
    await page.close();
  });

  await test('screen: pulls the folder, saves each file and plays what fits now', async () => {
    const { page, errors } = await newPage(browser, { context: ctx });
    await stubFeed(page);
    await page.addInitScript(n => { window.__now = n; }, NOW);
    await page.goto(server.url + 'screen.html?f=' + FEED_ID + '&sec=60');
    await page.waitForFunction(() => window.__snack && window.__snack.playable().length >= 6, null, { timeout: 15000 });
    const files = calls.filter(c => /^(file|slide):/.test(c)).sort();
    eq(files.join(','), 'file:f-blue,file:f-gd,file:f-night,file:f-red,file:f-spon,slide:deck~p1,slide:deck~p2', 'every playable file once; drafts and too-big files skipped');
    // one full pass from a fresh queue
    const order = await page.evaluate(() => { const s = window.__snack; s.S.queue = []; s.S.turns = { s: 0, m: 0 }; return s.buildQueue().map(x => x.type === 'image' ? x.name : x.type); });
    eq(order.join(','), 'today,01 Welcome.png,02 Rules [3s].png,Lineups.png,Sponsor A.png,Menu deck 1,coming', 'noon: no evening slide; game day slide on; one sponsor; one menu slide; coming up last');
    // the today card lists both games, earliest first
    await page.evaluate(() => { window.__snack.S.queue = []; window.__snack.next(); });
    await page.waitForSelector('.slide.on[data-type="today"]');
    const today = await page.textContent('.slide.on');
    assert.ok(/2 games/.test(today) && today.indexOf('9:00 AM') < today.indexOf('5:30 PM'), today);
    await page.screenshot({ path: path.join(SHOTS, 'snackshack-today.png') });
    await page.evaluate(() => window.__snack.next());
    await page.waitForSelector('.slide.on[data-name="01 Welcome.png"] img');
    assert.ok(/^blob:/.test(await page.getAttribute('.slide.on img', 'src')), 'the picture plays from the saved copy');
    // Enter shows what's saved
    await page.keyboard.press('Enter');
    assert.ok(/Files saved on this screen: 7 of 9/.test(await page.textContent('#info')), await page.textContent('#info'));
    eq(errors.join('\n'), '');
    await page.close();
  });

  await test('screen: in the evening the evening folder joins in', async () => {
    const { page } = await newPage(browser, { context: ctx });
    await stubFeed(page);
    await page.addInitScript(() => { window.__now = '2026-05-16T19:00:00'; });
    await page.goto(server.url + 'screen.html?sec=60');
    await page.waitForFunction(() => window.__snack && window.__snack.playable().length >= 6);
    const order = await page.evaluate(() => window.__snack.buildQueue().map(x => x.name || x.type));
    assert.ok(order.includes('Lights.png'), order.join(','));
    await page.close();
  });

  await test('screen: keeps playing saved files when the internet is down', async () => {
    const { page, errors } = await newPage(browser, { context: ctx });
    await stubFeed(page, 'down');
    await page.addInitScript(n => { window.__now = n; }, NOW);
    await page.goto(server.url + 'screen.html?sec=60');
    await page.waitForFunction(() => window.__snack && window.__snack.playable().length >= 6);
    await page.waitForFunction(() => document.body.className === 'offline');
    await page.evaluate(() => { window.__snack.S.queue = []; window.__snack.next(); window.__snack.next(); });
    await page.waitForSelector('.slide.on[data-type="image"] img');
    assert.ok(/^blob:/.test(await page.getAttribute('.slide.on[data-type="image"] img', 'src')));
    eq(errors.filter(e => !/script\.google/.test(e)).join('\n'), '');
    await page.close();
  });

  await test('setup: checks the web app URL and hands back the screen link', async () => {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const { page, errors } = await newPage(browser, { context: pctx });
    await stubFeed(page);
    await page.goto(server.url);
    await page.fill('#feed', 'https://example.com/nope');
    await page.click('#check');
    assert.ok(/doesn't look like a web app URL/.test(await page.textContent('#feedMsg')));
    await page.fill('#feed', FEED);
    await page.click('#check');
    await page.waitForFunction(() => /Connected/.test(document.getElementById('feedMsg').textContent));
    const msg = await page.textContent('#feedMsg');
    assert.ok(/8 slides ready, 1 too big/.test(msg) && /game schedule/.test(msg), msg);
    assert.ok((await page.inputValue('#tvLink')).endsWith('/apps/snackshack/screen.html?f=' + FEED_ID));
    const script = await page.evaluate(() => fetch('feed.gs').then(r => r.text()));
    assert.ok(/function doGet/.test(script) && /inside_\(f\)/.test(script), 'the script the Copy button hands out');
    // no horizontal scroll on a phone
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(SHOTS, 'snackshack-setup.png'), fullPage: true });
    eq(errors.join('\n'), '');
    await pctx.close();
  });

  await test('the feed script only hands out files inside its own folder', async () => {
    const gs = fs.readFileSync(path.join(__dirname, '..', 'apps', 'snackshack', 'feed.gs'), 'utf8');
    assert.ok(/function file_\(id\)[\s\S]*?if \(!inside_\(f\)\)/.test(gs), 'file_ checks the folder');
    assert.ok(/function slide_\(id, page\)[\s\S]*?if \(!inside_\(f\)\)/.test(gs), 'slide_ checks the folder');
    assert.ok(!/setSharing|addViewer|addEditor/.test(gs), 'never changes sharing');
  });

  await ctx.close(); await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})();
