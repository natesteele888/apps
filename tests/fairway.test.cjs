// Fairway (golf tournaments) tests. Run:
//   cd <apps> && NODE_PATH=<node_modules with playwright> tests/run.sh fairway
// Part 1 tests core.js on its own: scoring math, the board, groups, stats, closest-to-the-pin distances, cleaning.
// Part 2 drives the real page with Firebase blocked (so tournaments run on the phone): the demo board, field, score,
// course and player card, starting a tournament, closest to the pin with the browser's own made-up GPS, the sound
// switch, and names shown as text. Live sharing between phones needs the shared database and is not tested here.
const assert = require('assert');
const C = require('../apps/fairway/core.js');
const { launch, startServer, newPage } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const NOW = 1794000000000;
function twoPlayers() {
  const ev = C.newEvent({ name: 'Test Cup', now: NOW });
  ev.p.aaaaaa1 = C.newPlayer(ev, { name: 'Alpha Test', tee: 'blue', g: 1, st: 1 });
  ev.p.bbbbbb1 = C.newPlayer(ev, { name: 'Bravo Test', tee: 'white', g: 1, st: 1 });
  return ev;
}
const pl = (ev, id) => Object.assign({ id }, ev.p[id]);

(async () => {
  /* ===================== PART 1: core.js ===================== */
  await test('core: the sample course is made up, par 72, four tees', () => {
    const c = C.sampleCourse();
    assert.match(c.name, /made-up/); eq(c.holes.length, 18); eq(C.coursePar(c), 72); eq(c.tees.length, 4);
    const ev = C.newEvent({ name: 'X', now: NOW }); eq(ev.course.sample, undefined, 'no sample flag in a tournament');
    deq(ev.ctph, []); deq(ev.ctp, {});
  });

  await test('core: to-par words and colors match the Masters board (red under, green over)', () => {
    eq(C.fmtPar(0), 'E'); eq(C.fmtPar(-3), '-3'); eq(C.fmtPar(2), '+2');
    eq(C.tone(-1), 'under'); eq(C.tone(1), 'over'); eq(C.tone(0), 'even');
  });

  await test('core: a round adds up (to par, thru, next hole) and the board ties and ranks', () => {
    const ev = twoPlayers(); const pars = ev.course.holes.slice(0, 3).map(h => h.par);
    // Alpha: par, birdie, bogey relative to each hole; Bravo: par, par, par
    [0, -1, 1].forEach((d, i) => { ev.p.aaaaaa1.s['1_' + (i + 1)] = pars[i] + d; });
    pars.forEach((p, i) => { ev.p.bbbbbb1.s['1_' + (i + 1)] = p; });
    const r = C.round(ev, pl(ev, 'aaaaaa1'), 1);
    eq(r.toPar, 0); eq(r.thru, 3); eq(r.next, 4); eq(r.strokes, pars.reduce((a, b) => a + b, 0));
    const s = C.standings(ev); eq(s[0].pos, 'T1'); eq(s[1].pos, 'T1');
    ev.p.aaaaaa1.s['1_4'] = ev.course.holes[3].par - 1;
    const s2 = C.standings(ev); eq(s2[0].name, 'Alpha Test'); eq(s2[0].pos, '1'); eq(s2[0].toPar, -1); eq(s2[1].pos, '2');
  });

  await test('core: a group starting on 10 plays 10 to 18 then 1 to 9', () => {
    deq(C.playOrder(18, 10).slice(0, 10), [10, 11, 12, 13, 14, 15, 16, 17, 18, 1]);
    deq(C.playOrder(9, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  await test('core: the demo is twelve made-up golfers in three groups', () => {
    const ev = C.demoEvent(NOW); eq(C.players(ev).length, 12); eq(C.groups(ev).length, 3);
    eq(C.groups(ev)[2].start, 10); eq(ev.cur, 2);
  });

  await test('core: cleaning drops bad scores, keys and closest-to-the-pin entries', () => {
    const ev = twoPlayers(); ev.p.aaaaaa1.s['1_1'] = 4; ev.p.aaaaaa1.s['1_2'] = 99; ev.p.aaaaaa1.s['9_1'] = 4; ev.p.aaaaaa1.s.junk = 3;
    ev.ctph = [2, 2, 19, 'x', 5]; ev.ctp = { '1_2': { aaaaaa1: { d: 12.5, m: 'gps', at: 1, acc: 20 }, ghost01: { d: 1, m: 'tape', at: 1 } }, '1_7': { aaaaaa1: { d: 3, m: 'tape', at: 1 } } };
    const c = C.cleanEvent(ev);
    deq(c.p.aaaaaa1.s, { '1_1': 4 }); deq(c.ctph, [2, 5]);
    deq(Object.keys(c.ctp), ['1_2'], 'only marked holes'); deq(Object.keys(c.ctp['1_2']), ['aaaaaa1'], 'only players in the tournament');
    eq(C.cleanCtpEntry({ d: -1, m: 'gps' }), null); eq(C.cleanCtpEntry({ d: 5000, m: 'gps' }), null);
    eq(C.cleanCtpEntry({ d: 5, m: 'tape', at: 1, ph: 'BAD!' }).ph, undefined);
  });

  await test('core: closest-to-the-pin distance, averaging and feet words', () => {
    const ft = C.metres({ lat: 40, lon: -75 }, { lat: 40.00003, lon: -75 }) * 3.28084;
    assert.ok(ft > 10.8 && ft < 11.1, 'about 11 feet, got ' + ft);
    const f = C.averageFix([{ lat: 40, lon: -75, acc: 5 }, { lat: 40.0001, lon: -75, acc: 50 }, { lat: 41, lon: -75, acc: 150 }, { lat: 40, lon: -75, acc: 0 }]);
    eq(f.n, 3, 'a reading 150 m out is ignored'); assert.ok(Math.abs(f.lat - 40) < 0.00001, 'the sure readings win'); assert.ok(f.acc >= 2 && f.acc <= 3);
    eq(C.averageFix([]), null);
    const m = C.ctpMeasure({ lat: 40, lon: -75, acc: 4 }, { lat: 40.00003, lon: -75, acc: 3 });
    assert.ok(m.ft > 10.8 && m.ft < 11.1); eq(m.acc, 16, 'margins combine: 5 m is 16 ft');
    eq(C.fmtFeet(14.5), '14 ft 6 in'); eq(C.fmtFeet(9.99), '10 ft'); eq(C.fmtFeet(8), '8 ft'); eq(C.fmtFeet(150), '50 yds');
    const ev = twoPlayers(); ev.ctph = [2]; ev.ctp = { '1_2': { aaaaaa1: { d: 12, m: 'gps', at: 2, acc: 20 }, bbbbbb1: { d: 8.5, m: 'tape', at: 3 } } };
    const b = C.ctpBoard(ev, 1); eq(b.length, 1); eq(b[0].best.name, 'Bravo Test'); eq(b[0].list.length, 2);
    eq(C.ctpBoard(ev, 2)[0].best, null, 'round 2 is still open');
  });

  await test('core: changes use dotted paths, and DELETE clears a score', () => {
    const ev = twoPlayers();
    const a = C.applyPatch(ev, { 'p.aaaaaa1.s.1_1': 4, 'ctp.1_2.aaaaaa1': { d: 3, m: 'tape', at: 1 } });
    eq(a.p.aaaaaa1.s['1_1'], 4); eq(a.ctp['1_2'].aaaaaa1.d, 3);
    const b = C.applyPatch(a, { 'p.aaaaaa1.s.1_1': C.DELETE }); eq(b.p.aaaaaa1.s['1_1'], undefined);
  });

  /* ===================== PART 2: the page ===================== */
  let server, browser;
  try { server = await startServer('fairway'); browser = await launch(); }
  catch (e) { results.push(['harness', false, e]); console.log('HARNESS ' + e.message); }
  const open = async (opts = {}) => {
    const p = await newPage(browser, opts);
    await p.page.route(/gstatic\.com\/firebasejs/, r => r.abort()); // never the real database from a test
    await p.page.goto(server.url); await p.page.waitForSelector('#demo');
    return p;
  };

  if (browser) await test('page: the demo board, field, score, course and a flipping player card', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#demo'); await page.waitForSelector('.lb tbody tr');
    eq(await page.locator('.lb tbody tr').count(), 12);
    assert.ok(await page.locator('.lb tbody tr').first().locator('.tp.under').count(), 'the leader is red (under par)');
    assert.ok(await page.locator('.ctp').count(), 'closest to the pin on the board');
    await page.click('[data-tab=field]'); await page.waitForSelector('.frow'); eq(await page.locator('.frow').count(), 12);
    await page.click('[data-tab=score]'); await page.waitForSelector('.scorer li');
    await page.click('[data-tab=course]'); await page.waitForSelector('table.course');
    await page.click('[data-tab=board]'); await page.locator('[data-player]').first().click();
    await page.waitForSelector('.flipper.flipped', { timeout: 3000 });
    await page.click('[data-ct=stats]'); assert.match(await page.locator('.cbody').textContent(), /Birdies|birdies/);
    await page.click('.cbtns [data-cclose]'); await page.waitForFunction(() => !document.querySelector('#cardlayer').innerHTML);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: start a tournament on this phone, mark a closest-to-the-pin hole and measure with GPS', async () => {
    const { page, errors, ctx } = await open({ ctx: { geolocation: { latitude: 40, longitude: -75, accuracy: 4 }, permissions: ['geolocation'] } });
    await page.click('#new'); await page.fill('#nn', 'Test Classic'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click();
    await page.waitForFunction(() => window.FW.debug.S.view === 'event' && window.FW.debug.S.ev);
    const code = await page.evaluate(() => window.FW.debug.S.code); assert.match(code, /^[a-z2-7]{20}$/);
    await page.click('[data-tab=more]'); await page.click('label:has([data-ctph="2"]) span');
    await page.waitForFunction(c => (JSON.parse(localStorage.getItem('fw:ev:' + c)).ctph || []).includes(2), code);
    await page.click('[data-tab=score]'); await page.click('.strip [data-h="2"]');
    await page.click('#ctpopen'); await page.click('#meas');
    await page.click('#mpin'); await page.waitForFunction(() => /Marked/.test(document.querySelector('#g1').textContent), null, { timeout: 15000 });
    await ctx.setGeolocation({ latitude: 40.00003, longitude: -75, accuracy: 4 });
    await page.click('#mball'); await page.waitForFunction(() => /ft/.test(document.querySelector('#cres').textContent), null, { timeout: 15000 });
    assert.match(await page.locator('#cres').textContent(), /give or take \d+ feet/);
    await page.click('#csave');
    const e = await page.waitForFunction(c => { const d = JSON.parse(localStorage.getItem('fw:ev:' + c)); const b = d.ctp && d.ctp['1_2']; return b && Object.values(b)[0]; }, code).then(h => h.jsonValue());
    eq(e.m, 'gps'); assert.ok(e.d > 9 && e.d < 13, 'about 11 feet, got ' + e.d);
    await page.click('[data-tab=board]'); assert.match(await page.locator('.ctp').textContent(), /Alpha Test/);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: the sound switch remembers off, and names are shown as text', async () => {
    const { page, errors, ctx } = await open();
    const before = await page.getAttribute('#snd', 'aria-pressed');
    await page.click('#snd'); eq(await page.evaluate(() => localStorage.getItem('fw:sound')), before === 'true' ? 'off' : 'on');
    await page.click('#new'); await page.fill('#nn', '<img src=x onerror=window.__pwn=1>'); await page.fill('#nme', '<b>Bold</b>');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=board]');
    eq(await page.evaluate(() => !!window.__pwn), false); eq(await page.locator('.lb b:text("Bold")').count(), 0);
    deq(errors, []); await ctx.close();
  });

  if (browser) await browser.close();
  if (server) server.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' FAILED' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
