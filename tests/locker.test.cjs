// Locker tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/locker.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/locker/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const { sampleAthlete, seed } = require('./fixtures.cjs');

const TODAY = '2026-11-07'; // a Saturday
const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 5).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, (m || 'approx') + ': ' + a + ' vs ' + b);

/* ---------- page helpers ---------- */
const sheetSel = '.sheet-wrap.open .sheet';
const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 4000 });
const toasts = page => page.$$eval('.toast', els => els.map(e => e.textContent));
const toastText = async page => (await toasts(page)).join(' | ');
async function waitToast(page, re) {
  await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 4000 });
}
const lsDocs = page => page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('locker.') === 0) { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { o[k] = localStorage.getItem(k); } } }
  return o;
});
const activeDoc = page => page.evaluate(() => { const S = window.LockerApp.S; return JSON.parse(JSON.stringify(S.ath[S.index.active])); });
async function createFirst(page, name, sports, birth) {
  await page.fill('#f-name', name);
  for (const s of sports) await page.click('[data-sport="' + s + '"]');
  if (birth) await page.fill('#f-birth', String(birth));
  await page.click('[data-act=create-first]');
  await page.waitForSelector('#top:not([hidden])');
}
const tab = (page, t) => page.click('[data-act=tab][data-tab="' + t + '"]');
async function statVal(page, blockTitle, label) {
  return page.evaluate(([bt, lb]) => {
    const card = Array.from(document.querySelectorAll('.card')).find(c => c.querySelector('.block-title h3') && c.querySelector('.block-title h3').textContent.trim() === bt);
    if (!card) return null;
    const s = Array.from(card.querySelectorAll('.stat')).find(x => x.querySelector('.k').textContent.trim() === lb);
    return s ? s.querySelector('.v').textContent.trim() : null;
  }, [blockTitle, label]);
}
const stepFill = (page, p, v) => page.fill(sheetSel + ' .stepper[data-path="' + p + '"] input', String(v));
async function setStorage(page, docs, active) {
  await page.evaluate(([d, a]) => {
    Object.keys(localStorage).filter(k => k.indexOf('locker.') === 0).forEach(k => localStorage.removeItem(k));
    d.forEach(x => localStorage.setItem('locker.a.' + x.id, JSON.stringify(x)));
    localStorage.setItem('locker.index', JSON.stringify({ v: 1, ids: d.map(x => x.id), active: a || d[0].id }));
  }, [docs, active]);
}
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('button, a.btn, select, input:not([type=hidden]):not([type=file])').forEach(el => {
      if (el.closest('[hidden]') || el.closest('.sr')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 43.5 || r.width < 43.5) bad.push((el.tagName + ' ' + (el.getAttribute('aria-label') || el.textContent || el.id || '')).trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return bad;
  });
}

/* a drill-based doc for streak tests */
function streakDoc(opts) {
  const d = { id: 'streak1', name: 'Player', sports: ['baseball'], created: opts.created || '2026-01-01', drills: [{ id: 'drA', name: 'Tee swings', unit: 'swings', target: opts.target || 20, days: opts.days || [1, 2, 3, 4, 5], created: opts.created || '2026-01-01' }], days: {} };
  (opts.done || []).forEach(x => { d.days[x] = { r: { drA: [opts.target || 20] }, s: 1, done: true }; });
  (opts.missed || []).forEach(x => { d.days[x] = { r: {}, s: 1, done: false }; });
  return C.sanitizeAthlete(d);
}

(async () => {
  const srv = await startServer();
  const br = await launch();
  console.log('Serving ' + srv.url);

  /* ============ pure logic ============ */
  await test('core: batting and pitching math matches hand calculation', async () => {
    const games = [
      { bat: { ab: 4, h: 2, d2: 1, d3: 0, hr: 0, bb: 1, k: 1, rbi: 2, r: 1, sb: 1 }, pit: { outs: 13, np: 62, k: 5, bb: 2, h: 3, r: 2, er: 2 } },
      { bat: { ab: 3, h: 1, d2: 0, d3: 0, hr: 1, bb: 0, k: 0, rbi: 1, r: 1, sb: 0 }, pit: { outs: 6, np: 30, k: 2, bb: 1, h: 1, r: 0, er: 0 } }
    ];
    const b = C.battingTotals(games);
    eq(b.ab, 7); eq(b.h, 3); eq(b.hr, 1); eq(b.rbi, 3); eq(b.tb, 7);
    approx(b.avg, 3 / 7); approx(b.obp, 4 / 8); approx(b.slg, 1); approx(b.ops, 1.5);
    eq(C.fmtRate(b.avg), '.429'); eq(C.fmtRate(b.obp), '.500'); eq(C.fmtRate(b.slg), '1.000'); eq(C.fmtRate(b.ops), '1.500');
    const p6 = C.pitchingTotals(games, 6), p7 = C.pitchingTotals(games, 7);
    eq(p6.outs, 19); eq(p6.ipText, '6.1'); eq(p6.np, 92);
    eq(C.fmtDec(p6.era, 2), '1.89'); eq(C.fmtDec(p7.era, 2), '2.21'); eq(C.fmtDec(p6.whip, 2), '1.11');
    eq(C.fmtIP(13), '4.1'); eq(C.fmtIP(14), '4.2'); eq(C.fmtIP(15), '5.0'); eq(C.fmtIP(0), '0.0'); eq(C.fmtIP(1), '0.1');
    eq(C.fmtRate(C.battingTotals([]).avg), '—'); eq(C.fmtDec(C.pitchingTotals([], 6).era, 2), '—');
    const t = C.basketballTotals([{ bk: { pts: 10, reb: 4, ast: 2, stl: 1, blk: 0, to: 3, tpm: 2 } }, { bk: { pts: 15, reb: 6, ast: 4, stl: 2, blk: 1, to: 1, tpm: 3 } }]);
    eq(C.fmtDec(t.ppg, 1), '12.5'); eq(C.fmtDec(t.rpg, 1), '5.0'); eq(C.fmtDec(t.apg, 1), '3.0'); eq(C.fmtDec(t.spg, 1), '1.5'); eq(t.tpm, 5);
    eq(C.fmtRate(0.05), '.050'); eq(C.fmtRate(0), '.000');
  });

  await test('core: rest-day tiers at every boundary (Majors, Minors, Seniors)', async () => {
    const M = C.PRESETS.Majors.tiers;
    [[0, 0], [1, 0], [20, 0], [21, 1], [35, 1], [36, 2], [50, 2], [51, 3], [65, 3], [66, 4], [85, 4], [86, 4], [200, 4]].forEach(([n, r]) => eq(C.restFor(n, M), r, 'Majors ' + n));
    const S = C.PRESETS.Seniors.tiers;
    [[30, 0], [31, 1], [45, 1], [46, 2], [60, 2], [61, 3], [80, 3], [81, 4], [105, 4]].forEach(([n, r]) => eq(C.restFor(n, S), r, 'Seniors ' + n));
    eq(C.PRESETS.Majors.dailyMax, 85); eq(C.PRESETS.Minors.dailyMax, 75); eq(C.PRESETS.Juniors.dailyMax, 95); eq(C.PRESETS.Seniors.dailyMax, 105);
    // over-the-max flag: exactly 85 is fine, 86 warns
    const arm = { preset: 'Majors', custom: C.PRESETS.Majors };
    eq(C.armDays(arm, [{ date: '2026-11-01', np: 85 }]).days[0].over, false);
    eq(C.armDays(arm, [{ date: '2026-11-01', np: 86 }]).days[0].over, true);
    eq(C.armDays({ preset: 'Minors', custom: C.PRESETS.Majors }, [{ date: '2026-11-01', np: 75 }]).days[0].over, false);
    eq(C.armDays({ preset: 'Minors', custom: C.PRESETS.Majors }, [{ date: '2026-11-01', np: 76 }]).days[0].over, true);
  });

  await test('core: next-available date, days left, 7-day total, same-day totals, early flag', async () => {
    const arm = { preset: 'Majors', custom: C.PRESETS.Majors };
    const mk = (np, date) => C.armSummary(arm, [{ id: 'x1x', date: date || '2026-11-06', np: np, note: '', gameId: '' }], TODAY);
    let s = mk(20); eq(s.status, 'ok'); eq(s.restLeft, 0); eq(s.availableNow, true);
    s = mk(21); eq(s.status, 'rest'); eq(s.restLeft, 1); eq(s.nextAvail, '2026-11-08');
    s = mk(35); eq(s.restLeft, 1);
    s = mk(36); eq(s.restLeft, 2); eq(s.nextAvail, '2026-11-09');
    s = mk(65); eq(s.restLeft, 3); eq(s.nextAvail, '2026-11-10');
    s = mk(66); eq(s.restLeft, 4); eq(s.nextAvail, '2026-11-11');
    s = mk(85); eq(s.restLeft, 4);
    s = mk(66, '2026-11-02'); eq(s.status, 'ok', 'available exactly on the fifth day');
    s = mk(66, '2026-11-03'); eq(s.status, 'rest'); eq(s.restLeft, 1);
    // pitched today (40 pitches => 2 rest days after today)
    s = mk(40, TODAY); eq(s.status, 'pitched'); eq(s.restLeft, 2); eq(s.nextAvail, '2026-11-10'); eq(s.pitchesLeft, 45);
    s = mk(90, TODAY); eq(s.overToday, 5);
    // two entries on one day add up
    const two = C.armDays(arm, [{ date: '2026-11-05', np: 40 }, { date: '2026-11-05', np: 30 }]);
    eq(two.days.length, 1); eq(two.days[0].total, 70); eq(two.days[0].rest, 4);
    // rolling 7 days is today and the six days before it
    s = C.armSummary(arm, [{ date: '2026-10-31', np: 10 }, { date: '2026-11-01', np: 20 }, { date: '2026-11-07', np: 5 }], TODAY); eq(s.week7, 25);
    // pitching again inside a rest period is flagged
    const early = C.armDays(arm, [{ date: '2026-11-01', np: 66 }, { date: '2026-11-03', np: 20 }]);
    eq(early.days[0].early, false); eq(early.days[1].early, true);
    // no log
    s = C.armSummary(arm, [], TODAY); eq(s.status, 'ok'); eq(s.week7, 0);
  });

  await test('core: streaks across a missed day, a non-scheduled weekday and a month boundary', async () => {
    // Drill Mon-Fri. Done 16-20 Feb, 23, 24 (7 in a row, weekends are rest), missed Wed 25, then done Thu 26, Fri 27, Mon 2 Mar.
    const done = ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23', '2026-02-24', '2026-02-26', '2026-02-27', '2026-03-02'];
    const a = streakDoc({ done, created: '2026-02-16' });
    let s = C.streaks(a, '2026-03-03'); // Tue: not finished yet, must not break the streak
    eq(s.cur, 3, 'current across the weekend and the month change'); eq(s.best, 7, 'best');
    eq(C.dayStatus(a, '2026-02-25', '2026-03-03'), 'missed'); eq(C.dayStatus(a, '2026-02-28', '2026-03-03'), 'rest'); eq(C.dayStatus(a, '2026-03-03', '2026-03-03'), 'open');
    // finishing today adds one
    a.days['2026-03-03'] = { r: { drA: [20] } }; C.refreshDay(a, '2026-03-03');
    s = C.streaks(a, '2026-03-03'); eq(s.cur, 4); eq(s.best, 7);
    // a missed scheduled day yesterday means the streak is 0 until today is finished
    const b = streakDoc({ done: ['2026-03-02'], created: '2026-02-25' });
    s = C.streaks(b, '2026-03-04'); eq(s.cur, 0, 'Tue 3 Mar was missed'); eq(s.best, 1);
    // today is a rest day: streak is carried
    s = C.streaks(streakDoc({ done: ['2026-02-27'], created: '2026-02-25' }), '2026-02-28'); eq(s.cur, 1);
    // year boundary and leap day, drill every day
    s = C.streaks(streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2026-12-30', '2026-12-31', '2027-01-01'], created: '2026-12-30' }), '2027-01-02'); eq(s.cur, 3);
    s = C.streaks(streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2028-02-27', '2028-02-28', '2028-02-29'], created: '2028-02-27' }), '2028-03-01'); eq(s.cur, 3);
    // a drill created today does not retroactively break yesterday
    const c = streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], created: '2026-03-03' });
    s = C.streaks(c, '2026-03-04'); eq(s.cur, 0); eq(C.dayStatus(c, '2026-03-02', '2026-03-04'), 'none');
    // no drills at all
    s = C.streaks(C.sanitizeAthlete({ id: 'nodrills', name: 'P' }), '2026-03-04'); eq(s.cur, 0); eq(s.best, 0);
    // editing a drill later does not rewrite a finished day
    const d = streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2026-03-01'], created: '2026-03-01' });
    d.drills[0].target = 500;
    eq(C.dayStatus(d, '2026-03-01', '2026-03-02'), 'done');
    // week summary
    const w = C.weekSummary(streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2026-03-01', '2026-03-02'], created: '2026-03-01' }), '2026-03-03');
    eq(w.reps, 40); eq(w.daysDone, 2);
  });

  await test('core: dates, links and file validation', async () => {
    eq(C.addDays('2026-12-31', 1), '2027-01-01'); eq(C.addDays('2028-02-28', 1), '2028-02-29'); eq(C.addDays('2026-03-08', 1), '2026-03-09'); eq(C.diffDays('2026-11-02', '2026-10-31'), 2);
    eq(C.weekday('2026-11-07'), 6); eq(C.isYMD('2026-02-30'), false); eq(C.isYMD('2026-13-01'), false);
    eq(C.normalizeUrl('javascript:alert(1)'), null); eq(C.normalizeUrl('data:text/html,hi'), null); eq(C.normalizeUrl('ftp://x.com/a'), null);
    eq(C.normalizeUrl('not a url'), null); eq(C.normalizeUrl(''), null); eq(C.normalizeUrl('https://'), null); eq(C.normalizeUrl('file:///etc/passwd'), null);
    eq(C.normalizeUrl('youtube.com/watch?v=abc'), 'https://youtube.com/watch?v=abc'); eq(C.normalizeUrl('HTTPS://Example.com/x'), 'https://example.com/x');
    const evil = JSON.parse('{"id":"abc1","name":"P","days":{"__proto__":{"r":{"x":[1]}},"2026-03-01":{"r":{"__proto__":[1]}}},"drills":[],"games":[{"date":"2026-03-01","sport":"baseball","bat":{"__proto__":{"ab":9}}}]}');
    const a = C.sanitizeAthlete(evil);
    assert.ok(a && ({}).ab === undefined && ({}).r === undefined, 'no prototype pollution');
    eq(C.validateBackup({ app: 'nope' }).ok, false); eq(C.validateBackup({ app: 'locker', version: 1, athletes: [] }).ok, false);
    eq(C.validateBackup({ app: 'locker', version: 1, athletes: [{ id: 'abc', name: '' }] }).ok, false);
    eq(C.validateBackup({ app: 'locker', version: 2, athletes: [{ id: 'abc', name: 'P' }] }).ok, false);
    eq(C.validateBackup({ app: 'locker', version: 1, athletes: [{ id: 'abc', name: 'P' }, { id: 'abc', name: 'Q' }] }).ok, false);
    eq(C.validateBackup({ app: 'locker', version: 1, athletes: [{ id: '../x', name: 'P' }] }).ok, false);
    eq(C.validateBackup({ app: 'locker', version: 1, athletes: [{ id: 'abc', name: 'P' }] }).ok, true);
    // sanitizing is stable
    const once = C.sanitizeAthlete(sampleAthlete(TODAY));
    assert.deepStrictEqual(C.sanitizeAthlete(JSON.parse(JSON.stringify(once))), once);
  });

  /* ============ first run, athletes ============ */
  await test('first run: setup form, validation, [hidden] works, storage keys, persist() and no personal data in URL', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.addInitScript(() => { try { const o = navigator.storage.persist.bind(navigator.storage); navigator.storage.persist = () => { window.__persist = (window.__persist || 0) + 1; return o(); }; } catch (e) {} });
    const hosts = new Set();
    page.on('request', r => { try { const u = new URL(r.url()); if (u.hostname !== 'localhost') hosts.add(u.hostname + u.pathname); } catch (e) {} });
    await page.goto(srv.url);
    await page.waitForSelector('#f-name');
    eq(await page.isHidden('#top'), true); eq(await page.isHidden('#nav'), true);
    eq(await page.$eval('#f-err', e => getComputedStyle(e).display), 'none', 'hidden attr honoured');
    await page.screenshot({ path: SHOTS + '/locker-01-welcome-390.png' });
    await page.click('[data-act=create-first]');
    eq(await page.isVisible('#f-err'), true); assert.ok(/name/i.test(await page.textContent('#f-err')));
    await page.fill('#f-name', 'Player One');
    await page.click('[data-act=create-first]');
    assert.ok(/sport/i.test(await page.textContent('#f-err')));
    eq(await page.getAttribute('[data-sport=baseball]', 'aria-pressed'), 'false');
    await page.click('[data-sport=baseball]'); eq(await page.getAttribute('[data-sport=baseball]', 'aria-pressed'), 'true');
    await page.fill('#f-birth', '15'); await page.click('[data-act=create-first]');
    assert.ok(/four numbers/i.test(await page.textContent('#f-err')));
    await page.fill('#f-birth', '2015'); await page.click('[data-act=create-first]');
    await page.waitForSelector('#top:not([hidden])');
    eq(await page.$eval('.chip-ath .nm', e => e.firstChild.textContent), 'Player One');
    const d = await lsDocs(page);
    const keys = Object.keys(d).sort();
    eq(keys.length, 2); assert.ok(keys[0].startsWith('locker.a.') && keys[1] === 'locker.index', keys.join());
    const doc = d[keys[0]]; eq(doc.name, 'Player One'); eq(doc.birthYear, 2015); assert.deepStrictEqual(doc.sports, ['baseball']);
    eq(d['locker.index'].active, doc.id);
    eq(await page.$$eval('.nav button', b => b.map(x => x.textContent.trim()).join(',')), 'Today,Games,Arm,Clips,Card');
    eq(await page.evaluate(() => location.href.indexOf('Player') < 0 && !location.search && !location.hash), true, 'no personal data in the URL');
    assert.ok(await page.evaluate(() => window.__persist >= 1), 'navigator.storage.persist() called');
    // empty state tells a kid what to tap
    assert.ok(/Add your first drill/.test(await page.textContent('#view')));
    await page.screenshot({ path: SHOTS + '/locker-02-today-empty-390.png' });
    // only the expected hosts were contacted (fonts + install pop-up are blocked in tests)
    const bad = [...hosts].filter(h => !/^(fonts\.googleapis\.com|fonts\.gstatic\.com|natesteele888\.github\.io\/apps\/install\.js)/.test(h));
    assert.deepStrictEqual(bad, [], 'unexpected network hosts: ' + bad.join());
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('two athletes stay separate; switch, add, edit and delete with bottom-sheet confirm', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player One', ['baseball']);
    await page.click('[data-act=add-starter][data-n="0"]');   // Tee swings
    eq(await page.$$eval('.drill .nm', e => e.map(x => x.textContent).join()), 'Tee swings');
    // add the second athlete (basketball) from the switch sheet
    await page.click('[data-act=switch]'); await page.waitForSelector(sheetSel);
    await page.click('[data-act=add-ath]'); await page.waitForSelector(sheetSel + ' #f-name');
    await page.fill('#f-name', 'Player Two'); await page.click(sheetSel + ' [data-sport=basketball]');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$eval('.chip-ath .nm', e => e.firstChild.textContent), 'Player Two');
    eq(await page.$$eval('.nav button', b => b.map(x => x.textContent.trim()).join(',')), 'Today,Games,Clips,Card', 'no Arm tab for basketball');
    assert.ok(/Add your first drill/.test(await page.textContent('#view')), 'second athlete starts empty');
    assert.ok(/Free throws/.test(await page.textContent('#view')), 'basketball starters');
    await page.click('[data-act=add-starter][data-n="0"]');
    eq(await page.$$eval('.drill .nm', e => e.map(x => x.textContent).join()), 'Free throws');
    await page.click('[data-act=rep][data-n="10"]');
    // back to the first athlete: their drill and reps are untouched
    await page.click('[data-act=switch]'); await page.waitForSelector(sheetSel);
    eq(await page.$$eval('.list-btn[data-act=pick-ath]', e => e.length), 2);
    await page.click('[data-act=pick-ath]:has-text("Player One")'); await noSheets(page);
    eq(await page.$$eval('.drill .nm', e => e.map(x => x.textContent).join()), 'Tee swings');
    eq(await page.$eval('.drill .sub b', e => e.textContent), '0');
    eq(await page.$$eval('.nav button', b => b.length), 5);
    const docs = await lsDocs(page); const ids = docs['locker.index'].ids; eq(ids.length, 2);
    const two = docs['locker.a.' + ids[1]]; eq(two.drills[0].name, 'Free throws'); eq(Object.values(two.days)[0].r[two.drills[0].id][0], 10);
    eq(Object.keys(docs['locker.a.' + ids[0]].days).length, 0);
    // edit
    await page.click('[data-act=menu]'); await page.click('[data-act=edit-ath]'); await page.waitForSelector(sheetSel + ' #f-name');
    await page.fill(sheetSel + ' #f-name', 'Player Uno'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$eval('.chip-ath .nm', e => e.firstChild.textContent), 'Player Uno');
    // delete needs a confirm sheet; cancel keeps it
    await page.click('[data-act=menu]'); await page.click('[data-act=edit-ath]'); await page.waitForSelector(sheetSel + ' [data-act=del-ath]');
    await page.click(sheetSel + ' [data-act=del-ath]'); await page.waitForSelector('.confirm');
    assert.ok(/cannot be undone/i.test(await page.textContent('.confirm .msg')));
    await page.click('.confirm [data-close].btn'); await page.waitForTimeout(350);
    eq((await lsDocs(page))['locker.index'].ids.length, 2);
    await page.click(sheetSel + ' [data-act=del-ath]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    const after = await lsDocs(page); eq(after['locker.index'].ids.length, 1); eq(Object.keys(after).filter(k => k.indexOf('locker.a.') === 0).length, 1);
    eq(await page.$eval('.chip-ath .nm', e => e.firstChild.textContent), 'Player Two');
    // delete the last athlete goes back to first-run
    await page.click('[data-act=menu]'); await page.click('[data-act=edit-ath]'); await page.waitForSelector(sheetSel + ' [data-act=del-ath]');
    await page.click(sheetSel + ' [data-act=del-ath]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    await page.waitForSelector('#f-name'); eq(Object.keys(await lsDocs(page)).filter(k => k.indexOf('locker.a.') === 0).length, 0);
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ Today ============ */
  await test('Today: build drills, tap reps, complete a day, celebrate, undo, streak', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player One', ['baseball']);
    await page.click('[data-act=add-starter][data-n="0"]');
    await page.click('[data-act=drills]'); await page.waitForSelector(sheetSel);
    await page.click(sheetSel + ' [data-act=drill-new]'); await page.waitForSelector(sheetSel + ' #d-name');
    await page.fill(sheetSel + ' #d-name', 'Wall ball'); await page.fill(sheetSel + ' #d-target', '30'); await page.fill(sheetSel + ' #d-unit', 'throws');
    // Sunday off for this drill
    await page.click(sheetSel + ' [data-day="0"]');
    await page.click(sheetSel + ' [data-save]'); await page.waitForSelector('.sheet-wrap.open [data-act=drill-edit]');
    // two drills listed in the manager; reorder moves Wall ball up
    await page.click('.sheet-wrap.open [data-act=drill-up][data-id]:not([disabled])');
    eq(await page.$$eval('.sheet-wrap.open .dr-row .t', e => e.map(x => x.firstChild.textContent).join()), 'Wall ball,Tee swings');
    await page.keyboard.press('Escape'); await noSheets(page);
    eq(await page.$$eval('.drill .nm', e => e.map(x => x.textContent).join()), 'Wall ball,Tee swings');
    // Saturday: both scheduled. Fill Wall ball: +10 +10 then Other 10
    const ids = await page.$$eval('.drill [data-act=rep][data-n="1"]', b => b.map(x => x.dataset.id));
    const [wall, tee] = ids;
    await page.click(`[data-act=rep][data-id="${wall}"][data-n="10"]`); await page.click(`[data-act=rep][data-id="${wall}"][data-n="10"]`);
    await page.click(`[data-act=rep-custom][data-id="${wall}"]`); await page.waitForSelector(sheetSel + ' #rep-n');
    await page.click(sheetSel + ' [data-save]'); assert.ok(await page.isVisible(sheetSel + ' #rep-err'), 'empty number is refused');
    await page.fill(sheetSel + ' #rep-n', '10'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    assert.ok(/30\s*of 30/.test((await page.textContent('.drill')).replace(/\s+/g, ' ')), 'wall drill hit its goal');
    eq(await page.$eval('#streak-n', e => e.textContent), '0', 'day not complete yet');
    // undo takes off the last tap (the 10 from Other)
    await page.click(`[data-act=undo][data-id="${wall}"]`);
    eq((await page.textContent('.drill .sub b')), '20');
    await page.click(`[data-act=rep][data-id="${wall}"][data-n="5"]`); await page.click(`[data-act=rep][data-id="${wall}"][data-n="5"]`);
    eq((await page.textContent('.drill .sub b')), '30');
    // finish Tee swings: 50 -> celebration
    for (let i = 0; i < 4; i++) await page.click(`[data-act=rep][data-id="${tee}"][data-n="10"]`);
    eq(await page.$$eval('.confetti', e => e.length), 0, 'not yet');
    await page.click(`[data-act=rep][data-id="${tee}"][data-n="10"]`);
    await page.waitForSelector('.confetti'); assert.ok(await page.$('.streak.pulse'), 'streak card pulses');
    await waitToast(page, /Day complete/);
    eq(await page.$eval('#streak-n', e => e.textContent), '1');
    await page.screenshot({ path: SHOTS + '/locker-03-today-complete-390.png' });
    // today shows done in the strip, persisted
    eq(await page.$eval('.dstrip.today', e => e.className.includes('st-done')), true);
    const doc = await activeDoc(page); const rec = doc.days[TODAY]; eq(rec.done, true); eq(rec.s, 2);
    eq(rec.r[wall].reduce((a, b) => a + b, 0), 30); eq(rec.r[tee].reduce((a, b) => a + b, 0), 50);
    // undo breaks the day again, streak back to 0
    await page.click(`[data-act=undo][data-id="${tee}"]`);
    eq(await page.$eval('#streak-n', e => e.textContent), '0');
    // reload keeps everything
    await page.reload(); await page.waitForSelector('#streak-n');
    eq((await page.$$eval('.drill .sub b', b => b.map(x => x.textContent)))[1], '40');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Today: celebration is skipped under prefers-reduced-motion', async () => {
    const { page, errors } = await newPage(br, { today: TODAY, reducedMotion: true });
    await seed(page, [streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2026-11-05', '2026-11-06'], created: '2026-11-05', target: 20 })]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    eq(await page.$eval('#streak-n', e => e.textContent), '2');
    await page.click('[data-act=rep][data-n="10"]'); await page.click('[data-act=rep][data-n="10"]');
    await waitToast(page, /Day complete/);
    eq(await page.$eval('#streak-n', e => e.textContent), '3');
    await page.waitForTimeout(400);
    eq(await page.$$eval('.confetti, .pulse', e => e.length), 0, 'no confetti or pulse');
    eq(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Today: seeded history gives the right streak, best, 7-day strip and week totals (missed day, rest weekdays, month boundary)', async () => {
    const done = ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23', '2026-02-24', '2026-02-26', '2026-02-27', '2026-03-02'];
    const { page, errors } = await newPage(br, { today: '2026-03-03' });
    await seed(page, [streakDoc({ done, created: '2026-02-16', target: 20 })]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    eq(await page.$eval('#streak-n', e => e.textContent), '3');
    eq(await page.$eval('.streak .meta .n', e => e.textContent), '7');
    const strip = await page.$$eval('.dstrip', b => b.map(x => (x.dataset.date + ':' + x.className.match(/st-(\w+)/)[1])));
    assert.deepStrictEqual(strip, ['2026-02-25:missed', '2026-02-26:done', '2026-02-27:done', '2026-02-28:rest', '2026-03-01:rest', '2026-03-02:done', '2026-03-03:open']);
    eq(await page.$$eval('.dstrip', b => b.length), 7);
    assert.ok(/3 of 5 days/.test((await page.textContent('.week-sum')).replace(/\s+/g, ' ')), await page.textContent('.week-sum'));
    assert.ok(/60\s*reps/.test((await page.textContent('.week-sum')).replace(/\s+/g, ' ')));
    // fix the missed Wednesday from the strip: the streak joins up (done 16-27, Mon 2, plus Wed 25)
    await page.click('[data-act=pickday][data-date="2026-02-25"]');
    assert.ok(/Fixing/.test(await page.textContent('#view')));
    await page.click('[data-act=rep][data-n="10"]'); await page.click('[data-act=rep][data-n="10"]');
    await waitToast(page, /Day complete/);
    await page.click('[data-act=pickday][data-date="2026-03-03"]');
    eq(await page.$eval('#streak-n', e => e.textContent), '11', 'streak joins 16 Feb .. 2 Mar (5+2+1+2+1 school days)');
    eq(await page.$eval('.streak .meta .n', e => e.textContent), '11');
    // finish today
    await page.click('[data-act=rep][data-n="10"]'); await page.click('[data-act=rep][data-n="10"]');
    eq(await page.$eval('#streak-n', e => e.textContent), '12');
    // a rest day (Sunday) in the strip: viewing it says rest and does not break anything
    await page.click('[data-act=pickday][data-date="2026-03-01"]');
    assert.ok(/Rest day/.test(await page.textContent('#view')));
    eq(await page.$eval('#streak-n', e => e.textContent), '12');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Today: streak counts across a year boundary in the UI', async () => {
    const { page, errors } = await newPage(br, { today: '2027-01-02' });
    await seed(page, [streakDoc({ days: [0, 1, 2, 3, 4, 5, 6], done: ['2026-12-30', '2026-12-31', '2027-01-01'], created: '2026-12-30', target: 20 })]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    eq(await page.$eval('#streak-n', e => e.textContent), '3');
    eq(await page.$$eval('.dstrip', b => b.map(x => x.dataset.date).join()), '2026-12-27,2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Today: edit and delete a drill; drills not planned for today are optional; day rolls over', async () => {
    const { page, errors } = await newPage(br, { today: '2026-03-03' }); // Tuesday
    await seed(page, [streakDoc({ days: [1, 3], done: [], created: '2026-03-03', target: 20 })]); // Mon + Wed only
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    assert.ok(/Rest day/.test(await page.textContent('#view')));
    assert.ok(/optional today/.test(await page.textContent('#view')), 'unplanned drill still tappable as extra credit');
    assert.ok(/Rest day today. Your streak is safe/.test(await page.textContent('.streak')));
    // extra credit reps don't break or finish anything
    await page.click('[data-act=rep][data-n="10"]'); eq(await page.$eval('#streak-n', e => e.textContent), '0');
    // edit: make it every day with a goal of 5
    await page.click('[data-act=drills]'); await page.click(sheetSel + ' [data-act=drill-edit]'); await page.waitForSelector(sheetSel + ' #d-name');
    eq(await page.inputValue(sheetSel + ' #d-name'), 'Tee swings');
    await page.fill(sheetSel + ' #d-target', '5'); await page.click(sheetSel + ' [data-day="2"]'); await page.click(sheetSel + ' [data-save]');
    await page.waitForSelector('.sheet-wrap.open [data-act=drill-edit]');
    await page.keyboard.press('Escape'); await noSheets(page);
    assert.ok(/of 5/.test(await page.textContent('.drill .sub')));
    // validation: empty name / no days
    await page.click('[data-act=drills]'); await page.click(sheetSel + ' [data-act=drill-edit]'); await page.fill(sheetSel + ' #d-name', '');
    await page.click(sheetSel + ' [data-save]'); assert.ok(await page.isVisible(sheetSel + ' #d-err'));
    await page.fill(sheetSel + ' #d-name', 'Tee swings');
    // delete with confirm; reps history stays in the doc
    await page.click(sheetSel + ' [data-del]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await page.waitForTimeout(350);
    await page.keyboard.press('Escape'); await noSheets(page).catch(() => {});
    const doc = await activeDoc(page); eq(doc.drills.length, 0); assert.ok(doc.days['2026-03-03']);
    assert.ok(/Add your first drill/.test(await page.textContent('#view')));
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ Games ============ */
  await test('Games: log two games, season totals match hand-computed numbers, validation, edit, filter, delete', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player One', ['baseball']);
    await tab(page, 'games');
    assert.ok(/Log your first game/.test(await page.textContent('#view')), 'empty state names the button');
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp');
    await page.fill('#g-opp', 'Opponent A'); await page.fill('#g-date', '2026-10-26');
    await page.fill('#g-us', '7'); await page.fill('#g-them', '4');
    eq(await page.getAttribute(sheetSel + ' [data-gres="W"]', 'aria-pressed'), 'true', 'result auto from score');
    await stepFill(page, 'bat.ab', 4);
    await page.click(sheetSel + ' .stepper[data-path="bat.h"] [data-step="1"]'); await page.click(sheetSel + ' .stepper[data-path="bat.h"] [data-step="1"]');
    await page.click(sheetSel + ' .stepper[data-path="bat.d2"] [data-step="1"]');
    await stepFill(page, 'bat.bb', 1); await stepFill(page, 'bat.k', 1); await stepFill(page, 'bat.rbi', 2); await stepFill(page, 'bat.r', 1); await stepFill(page, 'bat.sb', 1);
    // validation: hits more than at bats blocks the save
    await stepFill(page, 'bat.h', 5);
    assert.ok(await page.isVisible('#err-bat'), 'inline error'); assert.ok(/can't be more than at bats/.test(await page.textContent('#err-bat')));
    await page.click(sheetSel + ' [data-save]'); await waitToast(page, /at bats/); eq((await activeDoc(page)).games.length, 0);
    await stepFill(page, 'bat.h', 2);
    eq(await page.isHidden('#err-bat'), true);
    // pitching is behind "I pitched"
    eq(await page.isHidden('#pit-body'), true);
    await page.click(sheetSel + ' [data-act=g-pitch]'); eq(await page.isVisible('#pit-body'), true);
    await stepFill(page, 'pit.outs', 13); eq((await page.textContent('#ip-live')).trim(), '4.1 innings');
    await page.click(sheetSel + ' .stepper[data-path="pit.outs"] [data-step="-1"]'); eq((await page.textContent('#ip-live')).trim(), '4.0 innings');
    await page.click(sheetSel + ' .stepper[data-path="pit.outs"] [data-step="1"]'); eq((await page.textContent('#ip-live')).trim(), '4.1 innings');
    await page.click(sheetSel + ' .stepper[data-path="pit.np"] [data-step="5"]'); await stepFill(page, 'pit.np', 62);
    await stepFill(page, 'pit.k', 5); await stepFill(page, 'pit.bb', 2); await stepFill(page, 'pit.h', 3); await stepFill(page, 'pit.r', 2); await stepFill(page, 'pit.er', 3);
    assert.ok(/Earned runs/.test(await page.textContent('#err-pit'))); await stepFill(page, 'pit.er', 2);
    await page.screenshot({ path: SHOTS + '/locker-04-game-sheet-390.png' });
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    await waitToast(page, /Pitches were added to your Arm log/);
    // second game
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp');
    await page.fill('#g-opp', 'Opponent B'); await page.fill('#g-date', '2026-11-02'); await page.fill('#g-us', '3'); await page.fill('#g-them', '5');
    eq(await page.getAttribute(sheetSel + ' [data-gres="L"]', 'aria-pressed'), 'true');
    await stepFill(page, 'bat.ab', 3); await stepFill(page, 'bat.h', 1); await stepFill(page, 'bat.hr', 1); await stepFill(page, 'bat.rbi', 1); await stepFill(page, 'bat.r', 1);
    await page.click(sheetSel + ' [data-act=g-pitch]'); await stepFill(page, 'pit.outs', 6); await stepFill(page, 'pit.np', 30); await stepFill(page, 'pit.k', 2); await stepFill(page, 'pit.bb', 1); await stepFill(page, 'pit.h', 1);
    await page.fill('#g-notes', 'Good day.');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    // log shows newest first with summaries
    const rows = await page.$$eval('.grow', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    eq(rows.length, 2); assert.ok(/vs Opponent B/.test(rows[0]) && /L 3-5/.test(rows[0]) && /1-for-3/.test(rows[0]) && /2\.0 IP/.test(rows[0]), rows[0]);
    assert.ok(/vs Opponent A/.test(rows[1]) && /W 7-4/.test(rows[1]) && /2-for-4/.test(rows[1]) && /4\.1 IP/.test(rows[1]), rows[1]);
    await page.screenshot({ path: SHOTS + '/locker-05-games-log-390.png' });
    // season totals
    await page.click('[data-act=gmode][data-v=season]');
    const bat = {}; for (const k of ['AVG', 'OBP', 'SLG', 'OPS', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'K', 'RBI', 'R', 'SB']) bat[k] = await statVal(page, 'Batting', k);
    assert.deepStrictEqual(bat, { AVG: '.429', OBP: '.500', SLG: '1.000', OPS: '1.500', AB: '7', H: '3', '2B': '1', '3B': '0', HR: '1', BB: '1', K: '1', RBI: '3', R: '2', SB: '1' });
    const pit = {}; for (const k of ['ERA', 'WHIP', 'IP', 'K', 'G', 'P', 'BB', 'H', 'R', 'ER']) pit[k] = await statVal(page, 'Pitching', k);
    assert.deepStrictEqual(pit, { ERA: '1.89', WHIP: '1.11', IP: '6.1', K: '7', G: '2', P: '92', BB: '3', H: '4', R: '2', ER: '2' });
    eq((await page.textContent('.card .num')).trim(), '2 games'); assert.ok(/1-1/.test(await page.textContent('#view')));
    await page.click('[data-act=ipg][data-v="7"]');
    eq(await statVal(page, 'Pitching', 'ERA'), '2.21', '7-inning games'); eq((await activeDoc(page)).settings.ipg, 7);
    await page.click('[data-act=ipg][data-v="6"]'); eq(await statVal(page, 'Pitching', 'ERA'), '1.89');
    await page.screenshot({ path: SHOTS + '/locker-06-season-390.png', fullPage: true });
    // Arm log got the two pitch entries, linked to the games
    let doc = await activeDoc(page); eq(doc.arm.log.length, 2); assert.ok(doc.arm.log.every(e => e.gameId)); eq(doc.arm.log.map(e => e.np).sort().join(), '30,62');
    // edit game 2: set pitches to 0 -> arm entry removed; set to 40 -> entry back
    await page.click('[data-act=gmode][data-v=log]'); await page.click('.grow:has-text("Opponent B")'); await page.waitForSelector(sheetSel + ' #g-opp');
    eq(await page.inputValue('#g-opp'), 'Opponent B'); eq(await page.inputValue(sheetSel + ' .stepper[data-path="pit.np"] input'), '30'); eq(await page.inputValue('#g-notes'), 'Good day.');
    await stepFill(page, 'pit.np', 0); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq((await activeDoc(page)).arm.log.length, 1);
    await page.click('.grow:has-text("Opponent B")'); await page.waitForSelector(sheetSel + ' #g-opp'); await stepFill(page, 'pit.np', 40); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    doc = await activeDoc(page); eq(doc.arm.log.length, 2); eq(doc.arm.log.filter(e => e.np === 40).length, 1);
    // a game from last season, season filter
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp');
    await page.fill('#g-date', '2025-06-01'); eq(await page.inputValue('#g-season'), '2025', 'season follows the date');
    await page.fill('#g-opp', 'Old Opp'); await stepFill(page, 'bat.ab', 2); await stepFill(page, 'bat.h', 2);
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$eval('#gsel', e => e.value), '2025', 'view jumps to the season just logged');
    eq(await page.$$eval('.grow', r => r.length), 1);
    eq(await page.$$eval('#gsel option', o => o.map(x => x.value).join()), '2026,2025,all');
    await page.selectOption('#gsel', 'all'); eq(await page.$$eval('.grow', r => r.length), 3);
    await page.click('[data-act=gmode][data-v=season]'); eq(await statVal(page, 'Batting', 'AB'), '9'); eq(await statVal(page, 'Batting', 'AVG'), '.556');
    await page.selectOption('#gsel', '2026'); eq(await statVal(page, 'Batting', 'AB'), '7');
    // delete a game: confirm sheet, arm entry goes with it
    await page.click('[data-act=gmode][data-v=log]'); await page.click('.grow:has-text("Opponent A")'); await page.waitForSelector(sheetSel + ' [data-del]');
    await page.click(sheetSel + ' [data-del]'); await page.waitForSelector('.confirm [data-ok]'); assert.ok(/cannot be undone/.test(await page.textContent('.confirm .msg')));
    await page.click('.confirm [data-ok]'); await noSheets(page);
    doc = await activeDoc(page); eq(doc.games.length, 2); eq(doc.arm.log.length, 1);
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Games: basketball and football stat entry, per-game rates, multi-sport filter, other sport notes only', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player Hoops', ['basketball', 'football', 'cheer']);
    await tab(page, 'games');
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp');
    eq(await page.getAttribute(sheetSel + ' [data-gsport="basketball"]', 'aria-pressed'), 'true');
    await page.fill('#g-date', '2026-11-01'); await stepFill(page, 'bk.pts', 10); await stepFill(page, 'bk.reb', 4); await stepFill(page, 'bk.ast', 2); await stepFill(page, 'bk.stl', 1); await stepFill(page, 'bk.to', 3); await stepFill(page, 'bk.tpm', 2);
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp'); await page.fill('#g-date', '2026-11-03');
    await stepFill(page, 'bk.pts', 15); await stepFill(page, 'bk.reb', 6); await stepFill(page, 'bk.ast', 4); await stepFill(page, 'bk.stl', 2); await stepFill(page, 'bk.blk', 1); await stepFill(page, 'bk.to', 1); await stepFill(page, 'bk.tpm', 3);
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    await page.click('[data-act=gmode][data-v=season]');
    eq(await statVal(page, 'Per game', 'PPG'), '12.5'); eq(await statVal(page, 'Per game', 'RPG'), '5.0'); eq(await statVal(page, 'Per game', 'APG'), '3.0'); eq(await statVal(page, 'Per game', 'SPG'), '1.5');
    eq(await statVal(page, 'Totals', 'PTS'), '25'); eq(await statVal(page, 'Totals', '3PM'), '5'); eq(await statVal(page, 'Totals', 'Games'), '2');
    // football: switch the sport in the sheet
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp');
    await page.click(sheetSel + ' [data-gsport="football"]'); await page.fill('#g-date', '2026-11-04');
    await stepFill(page, 'fb.tkl', 6); await stepFill(page, 'fb.yds', 85); await stepFill(page, 'fb.td', 1); await page.click(sheetSel + ' .stepper[data-path="fb.yds"] [data-step="10"]');
    eq(await page.inputValue(sheetSel + ' .stepper[data-path="fb.yds"] input'), '95');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$eval('#gsel', e => e.value), '2026');
    assert.ok(/Football/.test(await page.textContent('.pills[aria-label=Sport]')));
    eq(await statVal(page, 'Totals', 'Tackles'), '6'); eq(await statVal(page, 'Totals', 'Yards'), '95');
    // cheer: notes only
    await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel + ' #g-opp'); await page.click(sheetSel + ' [data-gsport="cheer"]');
    assert.ok(/notes/i.test(await page.textContent(sheetSel + ' #g-stats')));
    eq(await page.$$eval(sheetSel + ' .stepper', e => e.length), 0);
    await page.fill('#g-opp', 'Regional comp'); await page.fill('#g-notes', 'Hit every stunt'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    await page.click('[data-act=gmode][data-v=log]');
    assert.ok(/Hit every stunt/.test(await page.textContent('#view')) && /Regional comp/.test(await page.textContent('#view')));
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ Arm ============ */
  await test('Arm: status, next available and rest days for boundary counts (20/21, 35/36, 65/66, 85/86 on Majors)', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY, { arm: { preset: 'Majors', custom: { dailyMax: 85, tiers: C.PRESETS.Majors.tiers }, log: [] } })]);
    await page.goto(srv.url); await tab(page, 'arm');
    assert.ok(/OK to pitch/.test(await page.textContent('.status .big'))); assert.ok(/No pitches logged/.test(await page.textContent('#view')));
    const doc = await activeDoc(page);
    const expectations = [[20, 'ok', 0, null], [21, 'rest', 1, 'Nov 8'], [35, 'rest', 1, 'Nov 8'], [36, 'rest', 2, 'Nov 9'], [50, 'rest', 2, 'Nov 9'], [51, 'rest', 3, 'Nov 10'], [65, 'rest', 3, 'Nov 10'], [66, 'rest', 4, 'Nov 11'], [85, 'rest', 4, 'Nov 11'], [86, 'rest', 4, 'Nov 11']];
    for (const [np, status, left, avail] of expectations) {
      doc.arm.log = [{ id: 'e1x', date: '2026-11-06', np, note: '', gameId: '' }];
      await setStorage(page, [doc]); await page.reload(); await tab(page, 'arm'); await page.waitForSelector('.status');
      const big = (await page.textContent('.status .big')).trim();
      eq(big, status === 'ok' ? 'OK to pitch' : 'Rest needed', 'status for ' + np);
      const tiles = await page.$$eval('.statgrid .stat', t => t.map(x => x.querySelector('.v').textContent.trim() + '|' + x.querySelector('.k').textContent.trim()));
      eq(tiles[1], left + '|Rest days left', 'rest days left for ' + np);
      if (avail) assert.ok(tiles[0].startsWith('Sat'.slice(0, 0)) && tiles[0].includes(avail), 'next available for ' + np + ': ' + tiles[0]); else eq(tiles[0], 'Today|Available');
      eq(await page.$$eval('.logrow .badge.bad', b => b.length), np > 85 ? 1 : 0, 'over-max warning only above 85 (' + np + ')');
      if (np === 66) await page.screenshot({ path: SHOTS + '/locker-07-arm-rest-390.png', fullPage: true });
    }
    // pitched today
    doc.arm.log = [{ id: 'e1x', date: TODAY, np: 40, note: '', gameId: '' }];
    await setStorage(page, [doc]); await page.reload(); await tab(page, 'arm'); await page.waitForSelector('.status');
    eq((await page.textContent('.status .big')).trim(), 'Pitched today'); assert.ok(/45 left/.test(await page.textContent('.status')));
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Arm: log sheet warns (never blocks) above the daily max, presets change the max, custom rules editor, disclaimer', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY, { arm: { preset: 'Majors', custom: { dailyMax: 85, tiers: C.PRESETS.Majors.tiers }, log: [] } })]);
    await page.goto(srv.url); await tab(page, 'arm');
    const disclaimer = (await page.textContent('.disclaimer')).replace(/\s+/g, ' ');
    assert.ok(disclaimer.includes("Presets come from one league's rules. Always check your own league or tournament rules."));
    assert.ok(disclaimer.includes('A pitch count includes only pitches thrown in games unless your league says otherwise.'));
    // 85: no warning
    await page.click('[data-act=arm-add]'); await page.waitForSelector(sheetSel + ' #a-date');
    await page.fill('#a-date', '2026-11-04'); await stepFill(page, 'np', 85);
    assert.ok(!/more than the 85/.test(await page.textContent('#a-live')), 'no warning at exactly 85'); assert.ok(/4 rest days/.test(await page.textContent('#a-live')));
    await stepFill(page, 'np', 86); assert.ok(/more than the 85/.test(await page.textContent('#a-live')), 'warning at 86');
    await page.click(sheetSel + ' .stepper[data-path="np"] [data-step="-5"]'); eq(await page.inputValue(sheetSel + ' .stepper input'), '81');
    await stepFill(page, 'np', 90); await page.fill('#a-note', 'Tournament');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);   // saved even though it is over the max
    eq((await activeDoc(page)).arm.log.length, 1);
    assert.ok(await page.$('.logrow .badge.bad'), 'over badge'); assert.ok(/Over 85/.test(await page.textContent('.logrow .badge.bad')));
    // a second entry inside the rest period is flagged
    await page.click('[data-act=arm-add]'); await page.waitForSelector(sheetSel + ' #a-date'); await page.fill('#a-date', '2026-11-06'); await stepFill(page, 'np', 20);
    assert.ok(/rest period/.test(await page.textContent('#a-live'))); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    // status: pitched 11-04 with 90 => rest until 11-09; today 11-07 => 2 left
    eq((await page.textContent('.status .big')).trim(), 'Rest needed'); assert.ok(/2 more days/.test(await page.textContent('.status')));
    // preset change: Minors max 75
    await page.click('[data-act=arm-preset][data-v=Minors]'); assert.ok(/Daily max: 75/.test(await page.textContent('.card')));
    assert.ok(/Over 75/.test(await page.textContent('#view')));
    eq(await page.getAttribute('[data-act=arm-preset][data-v=Minors]', 'aria-pressed'), 'true'); eq(await page.getAttribute('[data-act=arm-preset][data-v=Majors]', 'aria-pressed'), 'false');
    await page.click('[data-act=arm-preset][data-v=Seniors]'); assert.ok(/Daily max: 105/.test(await page.textContent('#view'))); assert.ok(/31 to 45/.test(await page.textContent('.tier-table')));
    // custom rules
    await page.click('[data-act=arm-preset][data-v=Custom]'); await page.click('[data-act=arm-rules]'); await page.waitForSelector(sheetSel + ' #r-max');
    await page.fill('#r-max', '50');
    await page.fill(sheetSel + ' input[data-k=max][data-i="0"]', '10'); await page.fill(sheetSel + ' input[data-k=restDays][data-i="0"]', '1');
    await page.fill(sheetSel + ' input[data-k=max][data-i="1"]', '5'); // not higher than the tier before: rejected
    await page.click(sheetSel + ' [data-save]'); assert.ok(await page.isVisible('#r-err'));
    await page.fill(sheetSel + ' input[data-k=max][data-i="1"]', '30'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    const doc = await activeDoc(page); eq(doc.arm.preset, 'Custom'); eq(doc.arm.custom.dailyMax, 50); eq(doc.arm.custom.tiers[0].max, 10); eq(doc.arm.custom.tiers[0].restDays, 1); eq(doc.arm.custom.tiers[1].min, 11);
    assert.ok(/Daily max: 50/.test(await page.textContent('#view')));
    // Custom status uses the new numbers: 90 on 11-04 is "over 50" and still 4 rest days
    assert.ok(/Over 50/.test(await page.textContent('#view')));
    // edit and delete a log entry
    await page.click('.logrow:has-text("Tournament")'); await page.waitForSelector(sheetSel + ' [data-del]'); await page.click(sheetSel + ' [data-del]');
    await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    eq((await activeDoc(page)).arm.log.length, 1);
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ Clips ============ */
  await test('Clips: validate links, safe open attributes, tags filter, edit/delete, text is escaped', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player One', ['baseball']);
    await tab(page, 'clips'); assert.ok(/Add your first clip/.test(await page.textContent('#view')));
    await page.click('[data-act=clip-new]'); await page.waitForSelector(sheetSel + ' #c-url');
    for (const bad of ['javascript:alert(1)', 'ftp://example.com/a', 'data:text/html,hi', 'just words', '']) {
      await page.fill('#c-url', bad); await page.click(sheetSel + ' [data-save]');
      assert.ok(await page.isVisible('#c-err'), 'rejects ' + bad); eq((await activeDoc(page)).clips.length, 0);
    }
    await page.fill('#c-url', 'www.youtube.com/watch?v=abc123'); await page.fill('#c-title', '<img src=x onerror="window.__xss=1">Good swing'); await page.fill('#c-tags', 'Hitting, game , hitting');
    await page.fill('#c-note', '<b>bold?</b> Elbow up'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$$eval('.clip img, .clip b', e => e.length), 0, 'no injected elements'); eq(await page.evaluate(() => window.__xss), undefined);
    assert.ok(/<img src=x/.test(await page.textContent('.clip h3')));
    const link = await page.$eval('.clip a.btn', a => ({ href: a.href, target: a.target, rel: a.rel }));
    eq(link.href, 'https://www.youtube.com/watch?v=abc123'); eq(link.target, '_blank'); assert.ok(/noopener/.test(link.rel));
    const doc = await activeDoc(page); assert.deepStrictEqual(doc.clips[0].tags, ['hitting', 'game']);
    // second clip + filter
    await page.click('[data-act=clip-new]'); await page.waitForSelector(sheetSel + ' #c-url'); await page.fill('#c-url', 'https://example.com/clip2'); await page.fill('#c-title', 'Second'); await page.fill('#c-tags', 'practice');
    await page.click(sheetSel + ' [data-addtag="game"]'); eq(await page.inputValue('#c-tags'), 'practice, game');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await page.$$eval('.clip', e => e.length), 2);
    await page.click('[data-act=clip-tag][data-v=practice]'); eq(await page.$$eval('.clip', e => e.length), 1); eq(await page.textContent('.clip h3'), 'Second');
    await page.click('[data-act=clip-tag][data-v=game]'); eq(await page.$$eval('.clip', e => e.length), 2);
    await page.click('[data-act=clip-tag][data-v=""]');
    // edit then delete
    await page.click('.clip:has-text("Second") [data-act=clip-edit]');
    await page.waitForSelector(sheetSel + ' #c-url'); await page.fill('#c-title', 'Second (edited)'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    assert.ok(/Second \(edited\)/.test(await page.textContent('#view')));
    await page.click('.clip:has-text("Second") [data-act=clip-edit]'); await page.waitForSelector(sheetSel + ' [data-del]'); await page.click(sheetSel + ' [data-del]');
    await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    eq((await activeDoc(page)).clips.length, 1);
    await page.screenshot({ path: SHOTS + '/locker-08-clips-390.png' });
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ Card ============ */
  await test('Card: preview renders, PNG export is a real 1080x1350 image, share path, contact hidden by default, print stylesheet shows only the card', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.addInitScript(() => { navigator.canShare = () => true; navigator.share = async d => { window.__shared = { n: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; }; });
    await seed(page, [sampleAthlete(TODAY)]);
    await page.goto(srv.url); await tab(page, 'card');
    assert.ok(/only shows what you type|whatever you typed/i.test(await page.textContent('#view')));
    const dims = await page.$eval('#cardcv', c => [c.width, c.height]); assert.deepStrictEqual(dims, [1080, 1350]);
    const nonEmpty = await page.$eval('#cardcv', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 150 && d[i + 1] > 200 && d[i + 2] < 120) n++; return n; });
    assert.ok(nonEmpty > 50, 'lime pixels on the canvas: ' + nonEmpty);
    // download
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=card-save]')]);
    const p = path.join(os.tmpdir(), 'locker-test-card.png'); await dl.saveAs(p);
    const buf = fs.readFileSync(p); assert.ok(buf.length > 20000, 'png size ' + buf.length);
    eq(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a'); eq(buf.readUInt32BE(16), 1080); eq(buf.readUInt32BE(20), 1350);
    // share
    await page.click('[data-act=card-share]'); await page.waitForFunction(() => window.__shared);
    const sh = await page.evaluate(() => window.__shared); eq(sh.type, 'image/png'); assert.ok(sh.size > 20000);
    // contact is off by default and absent until the user types it and turns it on
    assert.ok(/Add an email or phone/.test(await page.textContent('#view'))); eq((await activeDoc(page)).profile.showContact, false);
    await page.click('[data-act=card-edit]'); await page.waitForSelector(sheetSel + ' #p-name');
    await page.fill('#p-name', 'Pat Player'); await page.fill('#p-email', 'player@example.com'); await page.fill('#p-phone', '555-0100'); await page.fill('#p-bio', 'x'.repeat(200).slice(0, 150));
    await page.click(sheetSel + ' [data-bats="L"]'); await page.click(sheetSel + ' [data-bats="L"]'); eq(await page.getAttribute(sheetSel + ' [data-bats="L"]', 'aria-pressed'), 'false');
    await page.click(sheetSel + ' [data-bats="S"]'); await page.click(sheetSel + ' [data-throws="L"]'); await page.fill('#p-grad', '2034');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    let doc = await activeDoc(page); eq(doc.profile.cardName, 'Pat Player'); eq(doc.profile.bats, 'S'); eq(doc.profile.throws, 'L'); eq(doc.profile.gradYear, 2034); eq(doc.profile.bio.length, 140); eq(doc.profile.showContact, false);
    const shot1 = await page.$eval('#cardcv', c => c.toDataURL());
    await page.click('[data-act=card-contact]'); eq((await activeDoc(page)).profile.showContact, true);
    const shot2 = await page.$eval('#cardcv', c => c.toDataURL()); assert.notStrictEqual(shot1, shot2, 'card changes when contact is switched on');
    await page.screenshot({ path: SHOTS + '/locker-09-card-390.png', fullPage: true });
    // stats selector
    await page.selectOption('#card-season', 'none'); const noStats = await page.$eval('#cardcv', c => c.toDataURL()); assert.notStrictEqual(noStats, shot2);
    // print: only the card is visible
    await page.evaluate(() => { window.print = () => { window.__printed = 1; }; });
    await page.click('[data-act=card-print]'); await page.waitForFunction(() => window.__printed);
    assert.ok((await page.$eval('#printimg', i => i.src)).startsWith('data:image/png'));
    await page.emulateMedia({ media: 'print' });
    eq(await page.$eval('#app', e => getComputedStyle(e).display), 'none'); eq(await page.$eval('#printbox', e => getComputedStyle(e).display), 'block');
    eq(await page.$eval('#toasts', e => getComputedStyle(e).display), 'none');
    await page.pdf({ path: path.join(os.tmpdir(), 'locker-card-print.pdf') }).catch(() => {});
    await page.emulateMedia({ media: 'screen' });
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  /* ============ backup / restore ============ */
  const backupPath = path.join(os.tmpdir(), 'locker-test-backup.json');
  let docsA = null;
  await test('Backup then restore into a fresh browser gives identical data; banner and share paths', async () => {
    const second = sampleAthlete(TODAY, { id: 'ath2other', name: 'Player Two', sports: ['basketball'] });
    second.games = [{ id: 'bg1', sport: 'basketball', date: '2026-11-01', opp: 'Opponent C', result: 'W', us: 40, them: 30, season: '2026', notes: '', bk: { pts: 12, reb: 3, ast: 2, stl: 1, blk: 0, to: 2, tpm: 1 } }];
    second.arm = { preset: 'Majors', custom: { dailyMax: 85, tiers: C.PRESETS.Majors.tiers }, log: [] };
    const first = sampleAthlete(TODAY);
    const A = await newPage(br, { today: TODAY });
    await A.page.addInitScript(() => { navigator.canShare = () => true; navigator.share = async d => { window.__shared = { n: d.files[0].name, t: d.files[0].type }; }; });
    await seed(A.page, [first, second]);
    await A.page.goto(srv.url); await A.page.waitForSelector('#streak-n');
    // seeded athlete created 30 days ago and never backed up: gentle banner
    assert.ok(/Time for a backup/.test(await A.page.textContent('.banner')));
    // "Later" hides it
    await A.page.click('[data-act=backup-later]'); eq(await A.page.$$eval('.banner', b => b.length), 0);
    // make a real change so the stored docs are the app's own writes, then back up from the menu
    await A.page.click('[data-act=rep][data-n="5"]');
    docsA = await lsDocs(A.page);
    await A.page.click('[data-act=menu]'); await A.page.click('[data-act=backup-sheet]'); await A.page.waitForSelector(sheetSel + ' [data-act=dl-backup]');
    assert.ok(/haven't made a backup yet|You haven't made a backup yet/.test(await A.page.textContent(sheetSel)));
    const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.click(sheetSel + ' [data-act=dl-backup]')]);
    assert.ok(/^locker-backup-2026-11-07\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await dl.saveAs(backupPath);
    await waitToast(A.page, /Backup file created/);
    const file = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    eq(file.app, 'locker'); eq(file.version, 1); eq(file.athletes.length, 2); eq(file.active, 'ath1sample');
    eq((await lsDocs(A.page))['locker.meta'].lastBackup, '2026-11-07');
    // share path
    await A.page.click(sheetSel + ' [data-act=share-backup]'); await A.page.waitForFunction(() => window.__shared);
    const sh = await A.page.evaluate(() => window.__shared); assert.ok(/^locker-backup-/.test(sh.n)); eq(sh.t, 'application/json');
    await A.page.keyboard.press('Escape'); await noSheets(A.page);
    eq(await A.page.$$eval('.banner', b => b.length), 0, 'banner gone after a backup');
    eq(await A.page.screenshot({ path: SHOTS + '/locker-10-today-390.png' }) !== null, true);
    await A.ctx.close();

    // fresh context: restore from the welcome screen
    const B = await newPage(br, { today: TODAY });
    await B.page.goto(srv.url); await B.page.waitForSelector('#f-name');
    await B.page.setInputFiles('[data-restore]', backupPath);
    await B.page.waitForSelector('.confirm'); assert.ok(/2 athletes: Player One, Player Two/.test(await B.page.textContent('.confirm .msg')));
    await B.page.screenshot({ path: SHOTS + '/locker-11-restore-confirm-390.png' });
    await B.page.click('.confirm [data-ok]'); await noSheets(B.page);
    await B.page.waitForSelector('#streak-n'); await waitToast(B.page, /Restored 2 athletes/);
    const docsB = await lsDocs(B.page);
    const pick = d => Object.fromEntries(Object.entries(d).filter(([k]) => k.indexOf('locker.a.') === 0));
    assert.deepStrictEqual(pick(docsB), pick(docsA), 'athlete documents identical after restore');
    assert.deepStrictEqual(docsB['locker.index'], docsA['locker.index'], 'index identical');
    // a second backup from the restored phone is the same data
    await B.page.click('[data-act=menu]'); await B.page.click('[data-act=backup-sheet]');
    const [dl2] = await Promise.all([B.page.waitForEvent('download'), B.page.click(sheetSel + ' [data-act=dl-backup]')]);
    const p2 = path.join(os.tmpdir(), 'locker-test-backup2.json'); await dl2.saveAs(p2);
    const f2 = JSON.parse(fs.readFileSync(p2, 'utf8')); assert.deepStrictEqual(f2.athletes, file.athletes); eq(f2.active, file.active);
    await B.page.keyboard.press('Escape');
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });

  await test('Restore: corrupted or wrong files are rejected and nothing is lost; cancel keeps data; good restore replaces', async () => {
    const good = fs.readFileSync(backupPath, 'utf8');
    const tmp = n => path.join(os.tmpdir(), 'locker-bad-' + n);
    const bad = {
      'not-json.json': 'this is {{ not json', 'empty.json': '', 'truncated.json': good.slice(0, Math.floor(good.length / 2)),
      'array.json': '[]', 'other-app.json': JSON.stringify({ app: 'other', version: 1, athletes: [{ id: 'abc', name: 'P' }] }),
      'no-athletes.json': JSON.stringify({ app: 'locker', version: 1, athletes: [] }), 'nameless.json': JSON.stringify({ app: 'locker', version: 1, athletes: [{ id: 'abc1', name: '' }] }),
      'newer.json': JSON.stringify(Object.assign(JSON.parse(good), { version: 7 })), 'bad-id.json': JSON.stringify({ app: 'locker', version: 1, athletes: [{ id: '../../x', name: 'P' }] }),
      'dupe.json': JSON.stringify({ app: 'locker', version: 1, athletes: [{ id: 'abc1', name: 'P' }, { id: 'abc1', name: 'Q' }] })
    };
    Object.entries(bad).forEach(([n, c]) => fs.writeFileSync(tmp(n), c));
    const { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY, { id: 'keepme01', name: 'Keeper' })]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    const before = await lsDocs(page);
    for (const n of Object.keys(bad)) {
      await page.click('[data-act=menu]'); await page.click('[data-act=backup-sheet]'); await page.waitForSelector(sheetSel + ' [data-restore]');
      await page.setInputFiles(sheetSel + ' [data-restore]', tmp(n));
      await waitToast(page, /Nothing was changed/);
      eq(await page.$$eval('.confirm', c => c.length), 0, n + ': no confirm sheet');
      assert.deepStrictEqual(await lsDocs(page), before, n + ': storage untouched');
      await page.keyboard.press('Escape'); await noSheets(page); await page.waitForTimeout(150);
      await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    }
    // cancel at the confirm step
    await page.click('[data-act=menu]'); await page.click('[data-act=backup-sheet]'); await page.waitForSelector(sheetSel + ' [data-restore]');
    await page.setInputFiles(sheetSel + ' [data-restore]', backupPath); await page.waitForSelector('.confirm');
    assert.ok(/replaces everything/i.test(await page.textContent('.confirm')));
    await page.click('.confirm [data-close].btn'); await page.waitForTimeout(350);
    assert.deepStrictEqual(await lsDocs(page), before, 'cancel keeps data');
    // confirm: the old athlete is replaced by the two from the backup
    await page.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(s => s.remove()));
    await page.reload(); await page.waitForSelector('#streak-n');
    await page.click('[data-act=menu]'); await page.click('[data-act=backup-sheet]'); await page.waitForSelector(sheetSel + ' [data-restore]');
    await page.setInputFiles(sheetSel + ' [data-restore]', backupPath); await page.waitForSelector('.confirm'); await page.click('.confirm [data-ok]'); await noSheets(page);
    const after = await lsDocs(page);
    eq(Object.keys(after).filter(k => k.indexOf('locker.a.') === 0).sort().join(), 'locker.a.ath1sample,locker.a.ath2other'); eq(after['locker.a.keepme01'], undefined);
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Backup reminder: only when there is data and 14+ days without a backup', async () => {
    const seedWith = async (extra, d) => { const { page, errors } = await newPage(br, { today: TODAY }); await seed(page, [sampleAthlete(TODAY, d || {})]); if (extra) await page.addInitScript(extra); await page.goto(srv.url); await page.waitForSelector('#top:not([hidden])'); return { page, errors }; };
    let t = await seedWith(); assert.ok(await t.page.$('.banner'), '30 days old, no backup: banner'); await t.page.context().close();
    t = await seedWith(() => { if (!localStorage.getItem('locker.meta')) localStorage.setItem('locker.meta', JSON.stringify({ lastBackup: '2026-11-03' })); });
    eq(await t.page.$$eval('.banner', b => b.length), 0, 'backed up 4 days ago: no banner'); await t.page.context().close();
    t = await seedWith(() => { if (!localStorage.getItem('locker.meta')) localStorage.setItem('locker.meta', JSON.stringify({ lastBackup: '2026-10-19' })); });
    assert.ok(/19 days/.test(await t.page.textContent('.banner')), 'backed up 19 days ago: banner'); await t.page.context().close();
    t = await seedWith(null, { created: '2026-11-01' }); eq(await t.page.$$eval('.banner', b => b.length), 0, 'new athlete: no banner'); await t.page.context().close();
    // no data at all (just created 20 days ago, nothing entered)
    t = await seedWith(null, { created: '2026-10-18', drills: [], days: {}, games: [], clips: [], arm: { preset: 'Majors', custom: { dailyMax: 85, tiers: C.PRESETS.Majors.tiers }, log: [] } });
    eq(await t.page.$$eval('.banner', b => b.length), 0, 'no data: no banner'); await t.page.context().close();
  });

  /* ============ resilience ============ */
  await test('Resilience: bad record does not break the app; save failure shows an active toast; blocked storage still runs', async () => {
    // one corrupt athlete + one good: app loads, warns, keeps the corrupt raw string
    let { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY)]);
    await page.addInitScript(() => { if (!localStorage.getItem('locker.a.brokenone')) { localStorage.setItem('locker.a.brokenone', '{"id":"brokenone","name":'); const i = JSON.parse(localStorage.getItem('locker.index')); i.ids.push('brokenone'); localStorage.setItem('locker.index', JSON.stringify(i)); } });
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    await waitToast(page, /couldn't be read/);
    eq(await page.$eval('.toast', t => t.getAttribute('role')), 'alert');
    eq((await lsDocs(page))['locker.a.brokenone'], '{"id":"brokenone","name":', 'raw damaged record left alone');
    await page.click('[data-act=menu]'); await page.click('[data-act=backup-sheet]'); assert.ok(/couldn't be read/.test(await page.textContent(sheetSel)));
    await page.click(sheetSel + ' [data-act=clear-damaged]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    eq((await lsDocs(page))['locker.a.brokenone'], undefined);
    // save failure
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; window.__restoreSet = () => { Storage.prototype.setItem = o; }; });
    await page.click('[data-act=rep][data-n="1"]'); await waitToast(page, /Couldn't save/);
    eq(await page.$$eval('.toast[role=alert]', t => t.length) > 0, true);
    await page.evaluate(() => window.__restoreSet());
    assert.deepStrictEqual(errors, []); await page.context().close();
    // storage blocked completely
    ({ page, errors } = await newPage(br, { today: TODAY }));
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
    await page.goto(srv.url); await page.waitForSelector('#f-name');
    await createFirst(page, 'Player One', ['baseball']);
    assert.ok(/not letting Locker save/.test(await page.textContent('.banner')));
    await page.click('[data-act=add-starter][data-n="0"]'); await page.click('[data-act=rep][data-n="5"]');
    eq(await page.$eval('.drill .sub b', e => e.textContent), '5');
    assert.deepStrictEqual(errors.filter(e => !/localStorage|denied/.test(e)), []); await page.context().close();
  });

  await test('Offline: after one visit the app reloads with no network (service worker, own caches only)', async () => {
    const { ctx, page, errors } = await newPage(br, { today: TODAY, sw: true });
    await seed(page, [sampleAthlete(TODAY)]);
    // another app's cache on the same origin must survive our worker's activate step; an old locker- cache goes away
    await page.addInitScript(() => { if (!sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); caches.open('situations-v99').then(c => c.put('/x', new Response('x'))); caches.open('locker-v0').then(c => c.put('/y', new Response('y'))); } });
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.includes('locker-v1') && !k.includes('locker-v0') && (await (await caches.open('locker-v1')).keys()).length >= 4; }, null, { timeout: 8000 });
    const cached = await page.evaluate(async () => (await (await caches.open('locker-v1')).keys()).map(r => new URL(r.url).pathname));
    for (const f of ['/apps/locker/', '/apps/locker/app.js', '/apps/locker/core.js', '/apps/locker/locker.css', '/apps/locker/manifest.json']) assert.ok(cached.includes(f), 'cached ' + f + ' in ' + cached.join());
    await page.reload(); await page.waitForTimeout(300);   // now controlled by the worker
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the worker before going offline');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('#streak-n', { timeout: 6000 });
    eq(await page.$eval('.chip-ath .nm', e => e.firstChild.textContent), 'Player One');
    await page.click('[data-act=rep][data-n="1"]'); await tab(page, 'games'); await tab(page, 'card'); await page.waitForSelector('#cardcv');
    await ctx.setOffline(false);
    const keys = await page.evaluate(() => caches.keys()); assert.ok(keys.includes('situations-v99'), 'other apps\' caches untouched'); // worker only prunes locker- caches
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  /* ============ layout, a11y ============ */
  await test('Layout 390x844: no horizontal scroll, tap targets >= 44px, sheets <= 85vh, focus ring, screenshots', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY), sampleAthlete(TODAY, { id: 'ath2other', name: 'Player Two', sports: ['basketball', 'football'] })]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    const problems = [];
    for (const t of ['today', 'games', 'arm', 'clips', 'card']) {
      await tab(page, t); await page.waitForTimeout(250);
      const ov = await overflow(page); if (ov > 0) problems.push(t + ' overflows by ' + ov);
      (await smallTargets(page)).forEach(x => problems.push(t + ' small target: ' + x));
      await page.screenshot({ path: SHOTS + '/locker-12-' + t + '-390.png' });
    }
    await tab(page, 'games'); await page.click('[data-act=gmode][data-v=season]'); (await smallTargets(page)).forEach(x => problems.push('season small target: ' + x)); if (await overflow(page) > 0) problems.push('season overflow');
    // sheets
    const sheets = [['[data-act=switch]', 'switch'], ['[data-act=menu]', 'menu']];
    for (const [sel, n] of sheets) {
      await page.click(sel); await page.waitForSelector(sheetSel); await page.waitForTimeout(350);
      const h = await page.$eval(sheetSel, e => [e.getBoundingClientRect().height, innerHeight, getComputedStyle(e).borderTopLeftRadius, getComputedStyle(e).borderBottomLeftRadius]);
      if (h[0] > h[1] * 0.85 + 1) problems.push(n + ' sheet too tall ' + h[0]);
      eq(h[2], '20px'); eq(h[3], '0px');
      (await smallTargets(page)).forEach(x => problems.push(n + ' sheet small target: ' + x));
      await page.screenshot({ path: SHOTS + '/locker-13-sheet-' + n + '-390.png' });
      await page.keyboard.press('Escape'); await noSheets(page);
    }
    await tab(page, 'games'); await page.click('[data-act=gmode][data-v=log]'); await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel); await page.waitForTimeout(350);
    const gh = await page.$eval(sheetSel, e => [e.getBoundingClientRect().height, innerHeight, e.querySelector('.sh-body').scrollHeight > e.querySelector('.sh-body').clientHeight]);
    if (gh[0] > gh[1] * 0.85 + 1) problems.push('game sheet too tall ' + gh[0]); assert.ok(gh[2], 'long sheet scrolls inside');
    (await smallTargets(page)).forEach(x => problems.push('game sheet small target: ' + x)); if (await overflow(page) > 0) problems.push('game sheet overflow');
    await page.screenshot({ path: SHOTS + '/locker-14-game-sheet-top-390.png' });
    await page.keyboard.press('Escape'); await noSheets(page);
    // background is inert while a sheet is open; focus returns afterwards
    await page.click('[data-act=menu]'); await page.waitForSelector(sheetSel); eq(await page.$eval('#app', e => e.inert), true);
    await page.keyboard.press('Escape'); await noSheets(page); eq(await page.$eval('#app', e => e.inert), false);
    // keyboard focus ring
    await page.focus('body'); await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; });
    assert.ok(ring[0] !== 'none' && parseFloat(ring[1]) >= 2, 'focus ring ' + ring.join());
    // safe-area padding on fixed bars
    const css = await page.evaluate(() => [Array.from(document.styleSheets).some(s => { try { return Array.from(s.cssRules).some(r => /safe-area-inset-bottom/.test(r.cssText) && /\.nav/.test(r.cssText)); } catch (e) { return false; } })]);
    assert.ok(css[0], 'nav uses safe-area-inset-bottom');
    eq(problems.join('\n'), '');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Layout 768x1024: tabs and sheets are not broken; screenshots', async () => {
    const { page, errors } = await newPage(br, { today: TODAY, ctx: { viewport: { width: 768, height: 1024 } } });
    await seed(page, [sampleAthlete(TODAY)]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    const problems = [];
    for (const t of ['today', 'games', 'arm', 'clips', 'card']) {
      await tab(page, t); await page.waitForTimeout(250);
      if (await overflow(page) > 0) problems.push(t + ' overflow');
      await page.screenshot({ path: SHOTS + '/locker-15-' + t + '-768.png' });
    }
    await tab(page, 'games'); await page.click('[data-act=game-new]'); await page.waitForSelector(sheetSel); await page.waitForTimeout(350);
    const r = await page.$eval(sheetSel, e => { const b = e.getBoundingClientRect(); return [b.width, b.height, innerHeight]; }); if (r[0] > 641 || r[1] > r[2] * 0.85 + 1) problems.push('tablet sheet ' + r.join());
    await page.screenshot({ path: SHOTS + '/locker-16-game-sheet-768.png' });
    eq(problems.join('\n'), '');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Small phone 320x640 does not overflow', async () => {
    const { page, errors } = await newPage(br, { today: TODAY, ctx: { viewport: { width: 320, height: 640 } } });
    await seed(page, [sampleAthlete(TODAY)]);
    await page.goto(srv.url); await page.waitForSelector('#streak-n');
    const problems = [];
    for (const t of ['today', 'games', 'arm', 'clips', 'card']) { await tab(page, t); if (await overflow(page) > 0) problems.push(t + ' overflow ' + await overflow(page)); }
    await page.screenshot({ path: SHOTS + '/locker-17-card-320.png' });
    await tab(page, 'games'); await page.click('[data-act=gmode][data-v=season]'); if (await overflow(page) > 0) problems.push('season overflow');
    await page.screenshot({ path: SHOTS + '/locker-17-season-320.png', fullPage: true });
    eq(problems.join('\n'), ''); assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await test('Help & about: plain language, version string, tips can be dismissed and brought back', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await createFirst(page, 'Player One', ['baseball']);
    assert.ok(await page.$('.tip')); await page.click('[data-act=tip-off]'); eq(await page.$$eval('.tip', t => t.length), 0);
    await page.reload(); await page.waitForSelector('#top:not([hidden])'); eq(await page.$$eval('.tip', t => t.length), 0, 'dismissed tip stays dismissed');
    await page.click('[data-act=menu]'); await page.click('[data-act=about]'); await page.waitForSelector(sheetSel);
    const txt = await page.textContent(sheetSel); assert.ok(txt.includes('Locker v1')); assert.ok(/stays? on this phone|saved on this phone/i.test(txt) || /on this phone only/i.test(txt));
    assert.ok(txt.includes("Presets come from one league's rules."));
    await page.screenshot({ path: SHOTS + '/locker-18-about-390.png' });
    await page.click(sheetSel + ' [data-act=tips-reset]'); await noSheets(page).catch(() => {}); await page.waitForSelector('.tip');
    assert.deepStrictEqual(errors, []);
    await page.context().close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
