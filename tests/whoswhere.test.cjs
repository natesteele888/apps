// Who's Where tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/whoswhere.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
// ONLY=<text> runs just the tests whose name contains that text.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/whoswhere/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07'; // a Saturday; the next day (Sunday 2026-11-01 was the US clock change)
const ONLY = process.env.ONLY || '';
const results = [];
async function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deq = (a, b, m) => assert.deepStrictEqual(a, b, m);

/* ---------- builders for pure-logic tests ---------- */
let seq = 0;
const T = (h, m) => h * 60 + (m || 0);
const E = o => Object.assign({ id: 'ev' + (++seq) + 'x', title: 'Event', type: 'other', date: '2026-11-10', start: T(17), end: T(18), place: '', address: '', kids: [], driver: '', snack: '', notes: '', early: 0, drive: 0, series: '' }, o);
const PEOPLE = [
  { id: 'k1', name: 'Kid 1', role: 'player', color: '#3aa0ff' }, { id: 'k2', name: 'Kid 2', role: 'player', color: '#ff9f43' }, { id: 'k3', name: 'Kid 3', role: 'player', color: '#2fd08a' },
  { id: 'pa', name: 'Parent A', role: 'adult', color: '#2fd08a' }, { id: 'pb', name: 'Parent B', role: 'adult', color: '#b08cff' }, { id: 'pc', name: 'Parent C', role: 'adult', color: '#ffd23f' }
];
const PM = C.byId(PEOPLE);
const cfIds = list => C.findConflicts(list).map(c => c.kind + ':' + c.people.join('+') + ':' + list.find(e => e.id === c.a).title + '>' + list.find(e => e.id === c.b).title).sort();
const countCf = list => C.findConflicts(list).length;
const textOf = (list, i) => { const cs = C.findConflicts(list); return C.conflictText(cs[i || 0], C.byId(list), PM, false); };
function withTZ(tz, fn) { const old = process.env.TZ; process.env.TZ = tz; try { return fn(); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; } }
function counter() { let n = 0; return () => 'gen' + (++n); }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- a small calendar-file parser, written separately from the app, to read the .ics text back ---------- */
function parseICS(text) {
  assert.ok(text.endsWith('\r\n'), 'ends with CRLF');
  assert.ok(!/(^|[^\r])\n/.test(text), 'no bare LF anywhere');
  assert.ok(!/\r(?!\n)/.test(text), 'no bare CR anywhere');
  const phys = text.split('\r\n'); phys.pop();
  phys.forEach(l => assert.ok(Buffer.byteLength(l, 'utf8') <= 75, 'line over 75 octets (' + Buffer.byteLength(l, 'utf8') + '): ' + l.slice(0, 40)));
  const lines = [];
  phys.forEach(l => { if (l.charAt(0) === ' ') { assert.ok(lines.length, 'fold with nothing before it'); lines[lines.length - 1] += l.slice(1); } else lines.push(l); });
  const unesc = v => v.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c);
  const root = { name: 'ROOT', props: {}, kids: [] }, stack = [root];
  lines.forEach(l => {
    const i = l.indexOf(':'); assert.ok(i > 0, 'content line has a colon: ' + l);
    const head = l.slice(0, i), val = l.slice(i + 1), name = head.split(';')[0].toUpperCase();
    if (name === 'BEGIN') { const o = { name: val, props: {}, kids: [] }; stack[stack.length - 1].kids.push(o); stack.push(o); }
    else if (name === 'END') { assert.strictEqual(stack[stack.length - 1].name, val, 'END matches BEGIN'); stack.pop(); }
    else { const top = stack[stack.length - 1]; assert.ok(!(name in top.props), 'duplicate ' + name); top.props[name] = unesc(val); }
  });
  assert.strictEqual(stack.length, 1, 'all BEGINs closed');
  return root.kids[0];
}

/* ---------- page helpers ---------- */
const sheetSel = '.sheet-wrap.open .sheet';
const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 4000 });
const sheetCount = page => page.$$eval('.sheet-wrap.open', s => s.length);
const settle = page => page.waitForTimeout(450);
const toastText = page => page.$$eval('.toast', els => els.map(e => e.textContent).join(' | '));
async function waitToast(page, re) {
  await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 4000 });
}
const ls = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('whoswhere.') === 0) o[k] = localStorage.getItem(k); } return o; });
const data = async page => JSON.parse((await ls(page))['whoswhere.data'] || 'null');
const sampleDoc = (today, ws) => C.sampleState(today || TODAY, ws === undefined ? 0 : ws, counter());
async function seed(page, state) {
  const payload = JSON.stringify(Object.assign({ v: 1 }, state));
  await page.addInitScript(p => { try { if (localStorage.getItem('whoswhere.data') === null && !sessionStorage.getItem('__seeded')) { localStorage.setItem('whoswhere.data', p); sessionStorage.setItem('__seeded', '1'); } } catch (e) {} }, payload);
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('button, a.btn, select, input:not([type=hidden]):not([type=file])').forEach(el => {
      if (el.closest('[hidden]') || el.closest('.sr') || el.closest('.print-only')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 43.5 || r.width < 43.5) bad.push((el.tagName + ' ' + (el.getAttribute('aria-label') || el.textContent || el.id || '')).trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return bad;
  });
}
const goToday = async page => { if (await page.$('[data-act=go-today]')) await page.click('[data-act=go-today]'); };
const tab = (page, t) => page.click('#nav [data-act=tab][data-tab="' + t + '"]');
const shot = async (page, name, full) => { await page.waitForTimeout(380); if (!/toast/.test(name)) await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); return page.screenshot({ path: SHOTS + '/whoswhere-' + name + '.png', fullPage: !!full }); };
const downloadText = async (page, clickSel) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(clickSel)]);
  const p = path.join(os.tmpdir(), 'ww-test-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + dl.suggestedFilename());
  await dl.saveAs(p);
  return { name: dl.suggestedFilename(), text: fs.readFileSync(p, 'utf8'), path: p };
};
const evByTitle = (st, title, date) => st.events.filter(e => e.title === title && (!date || e.date === date));

(async () => {
  /* ================= pure logic ================= */
  await test('core: dates are plain calendar arithmetic (leap days, year ends, clock-change weekend)', async () => {
    eq(C.dayNum('1970-01-01'), 0); eq(C.dayNum('1970-01-02'), 1); eq(C.dayNum('2000-01-01'), 10957); eq(C.dayNum('2000-03-01'), 11017);
    eq(C.weekday('2000-01-01'), 6); eq(C.weekday('2024-02-29'), 4); eq(C.weekday('2026-11-01'), 0); eq(C.weekday('2026-11-07'), 6); eq(C.weekday('2026-03-08'), 0);
    eq(C.addDays('2026-10-31', 1), '2026-11-01'); eq(C.addDays('2026-11-01', 1), '2026-11-02'); eq(C.addDays('2026-03-07', 1), '2026-03-08'); eq(C.addDays('2026-03-08', 1), '2026-03-09');
    eq(C.addDays('2026-12-31', 1), '2027-01-01'); eq(C.addDays('2028-02-28', 1), '2028-02-29'); eq(C.addDays('2028-02-29', 1), '2028-03-01'); eq(C.addDays('2026-03-01', -1), '2026-02-28');
    eq(C.addDays('2026-11-01', 7), '2026-11-08'); eq(C.addDays('2026-11-01', -7), '2026-10-25'); eq(C.addDays('2026-11-01', 0), '2026-11-01');
    eq(C.diffDays('2026-11-02', '2026-10-31'), 2); eq(C.diffDays('2026-11-08', '2026-11-01'), 7); eq(C.diffDays('2026-03-09', '2026-03-07'), 2); eq(C.diffDays('2026-01-01', '2026-12-31'), -364);
    ['2026-11-07', '2028-02-29', '2000-01-01', '2100-12-31'].forEach(d => assert.ok(C.isYMD(d), d));
    ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '1999-12-31', '2101-01-01', '2026-1-1', '', null, undefined, 20261107, '2026-11-07T00:00', '2026-11-07 '].forEach(d => assert.ok(!C.isYMD(d), String(d)));
    eq(C.startOfWeek('2026-11-07', 0), '2026-11-01'); eq(C.startOfWeek('2026-11-07', 1), '2026-11-02'); eq(C.startOfWeek('2026-11-01', 1), '2026-10-26'); eq(C.startOfWeek('2026-11-01', 0), '2026-11-01');
    eq(C.startOfWeek('2026-11-02', 0), '2026-11-01'); eq(C.startOfWeek('2027-01-01', 0), '2026-12-27');
    eq(C.addMonths('2026-11-01', 2), '2027-01-01'); eq(C.addMonths('2026-11-01', -11), '2025-12-01'); eq(C.addMonths('2026-01-01', -1), '2025-12-01'); eq(C.addMonths('2026-12-01', 1), '2027-01-01');
    eq(C.daysInMonth(2028, 2), 29); eq(C.daysInMonth(2026, 2), 28); eq(C.daysInMonth(2026, 11), 30);
    eq(C.weekTitle('2026-11-01'), 'Nov 1 – 7, 2026'); eq(C.weekTitle('2026-11-29'), 'Nov 29 – Dec 5, 2026'); eq(C.weekTitle('2026-12-27'), 'Dec 27, 2026 – Jan 2, 2027');
    eq(C.fmtDate('2026-11-07', 'short'), 'Sat, Nov 7'); eq(C.fmtDate('2026-11-07', 'day'), 'Saturday, Nov 7'); eq(C.fmtDate('2026-11-07', 'full'), 'Saturday, November 7, 2026'); eq(C.fmtDate('2026-11-07', 'md'), 'Nov 7');
  });

  await test('core: month grids start on the right day and have the right number of rows', async () => {
    let g = C.monthGrid(2026, 11, 0);
    eq(g.length, 5); eq(g[0][0].date, '2026-11-01'); eq(g[0][0].inMonth, true); eq(g[4][6].date, '2026-12-05'); eq(g[4][1].date, '2026-11-30'); eq(g[4][1].inMonth, true); eq(g[4][2].inMonth, false);
    g = C.monthGrid(2026, 11, 1);
    eq(g.length, 6); eq(g[0][0].date, '2026-10-26'); eq(g[0][0].inMonth, false); eq(g[0][6].date, '2026-11-01'); eq(g[0][6].inMonth, true); eq(g[5][6].date, '2026-12-06');
    eq(C.monthGrid(2026, 2, 0).length, 4, 'Feb 2026 starts on a Sunday and has 28 days'); eq(C.monthGrid(2026, 2, 0)[3][6].date, '2026-02-28');
    eq(C.monthGrid(2027, 1, 0)[0][0].date, '2026-12-27'); eq(C.monthGrid(2028, 2, 1).length, 5);
    g.forEach(w => eq(w.length, 7));
  });

  await test('core: "today" is the local calendar date in every time zone (never the UTC date)', async () => {
    const RD = Date;
    const stub = (y, m, d, h, mi) => { globalThis.Date = class extends RD { constructor(...a) { if (a.length === 0) super(y, m, d, h, mi, 0); else super(...a); } static now() { return new RD(y, m, d, h, mi, 0).getTime(); } }; };
    try {
      for (const tz of ['America/New_York', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        withTZ(tz, () => {
          stub(2026, 10, 2, 0, 1); eq(C.todayStr(), '2026-11-02', tz + ' just after midnight');
          stub(2026, 10, 1, 23, 59); eq(C.todayStr(), '2026-11-01', tz + ' just before midnight');
          stub(2026, 0, 1, 0, 0); eq(C.todayStr(), '2026-01-01', tz + ' new year');
        });
      }
    } finally { globalThis.Date = RD; }
    globalThis.__today = '2030-05-06'; eq(C.todayStr(), '2030-05-06', 'test override'); globalThis.__today = 'junk'; assert.ok(C.isYMD(C.todayStr()), 'junk override ignored'); delete globalThis.__today;
  });

  await test('core: clock times parse and print correctly in 12 and 24 hour style', async () => {
    eq(C.parseTime('17:30'), 1050); eq(C.parseTime('00:00'), 0); eq(C.parseTime('7:05'), 425); eq(C.parseTime('23:59'), 1439); eq(C.parseTime('17:30:45'), 1050); eq(C.parseTime(' 08:15 '), 495);
    ['24:00', '12:60', '7', '7:5', '', null, undefined, 'ab:cd', '-1:30', '17:30pm', '1730'].forEach(v => eq(C.parseTime(v), null, String(v)));
    eq(C.fmtTime(0, false), '12:00 AM'); eq(C.fmtTime(720, false), '12:00 PM'); eq(C.fmtTime(785, false), '1:05 PM'); eq(C.fmtTime(1439, false), '11:59 PM'); eq(C.fmtTime(59, false), '12:59 AM'); eq(C.fmtTime(60, false), '1:00 AM');
    eq(C.fmtTime(0, true), '00:00'); eq(C.fmtTime(1050, true), '17:30'); eq(C.fmtTime(1440 + 30, false), '12:30 AM', 'wraps past midnight'); eq(C.fmtTime(-30, true), '23:30');
    eq(C.timeInput(425), '07:05'); eq(C.timeInput(1470), '00:30');
    eq(C.fmtRange(1020, 1080, false), '5:00–6:00 PM'); eq(C.fmtRange(690, 780, false), '11:30 AM–1:00 PM'); eq(C.fmtRange(1380, 60, false), '11:00 PM–1:00 AM'); eq(C.fmtRange(720, 735, false), '12:00–12:15 PM'); eq(C.fmtRange(1020, 1080, true), '17:00–18:00');
    eq(C.fmtRange(750, 735, false), '12:30 PM–12:15 PM', 'a 23h45m event that crosses midnight is not shortened');
    eq(C.fmtDur(30), '30 min'); eq(C.fmtDur(60), '1 hr'); eq(C.fmtDur(90), '1 hr 30 min'); eq(C.fmtDur(125), '2 hr 5 min');
  });

  await test('core: event geometry (arrive-by, leave-by, past midnight, clock-change night)', async () => {
    const a = E({ date: '2026-11-10', start: T(17), end: T(18), early: 15, drive: 20 });
    eq(C.durOf(a), 60); eq(C.absEnd(a) - C.absStart(a), 60); eq(C.absStart(a) - C.absArrive(a), 15); eq(C.absArrive(a) - C.absLeave(a), 20);
    const m = E({ date: '2026-11-07', start: T(23), end: T(1) });
    eq(C.durOf(m), 120); eq(C.crossesMidnight(m), true); const l = C.absToLocal(C.absEnd(m)); eq(l.date, '2026-11-08'); eq(l.min, 60); eq(C.fmtAbs(C.absEnd(m), false, '2026-11-07'), 'Sun 1:00 AM');
    const d = E({ date: '2026-11-01', start: T(1, 30), end: T(2, 30) });
    eq(C.durOf(d), 60, 'clock-change night counts as plain clock minutes'); eq(C.absStart(d), C.dayNum('2026-11-01') * 1440 + 90);
    const early = E({ date: '2026-11-08', start: 10, end: 60, early: 30, drive: 0 });
    eq(C.absToLocal(C.absArrive(early)).date, '2026-11-07', 'arriving early can reach back into the day before'); eq(C.absToLocal(C.absArrive(early)).min, 1420);
    eq(C.crossesMidnight(a), false);
  });

  await test('core: kid conflicts (overlap, back to back, arrive-early counts before the start only, midnight)', async () => {
    const k = ['k1'];
    eq(countCf([E({ kids: k, start: T(17), end: T(18) }), E({ kids: k, start: T(17, 30), end: T(18, 30) })]), 1, 'plain overlap');
    eq(countCf([E({ kids: k, start: T(17), end: T(18) }), E({ kids: k, start: T(18), end: T(19) })]), 0, 'back to back is fine');
    eq(countCf([E({ kids: k, start: T(17), end: T(18) }), E({ kids: k, start: T(18), end: T(19), early: 10 })]), 1, 'arrive-by 5:50 is inside the first event');
    eq(countCf([E({ kids: k, start: T(17), end: T(18) }), E({ kids: k, start: T(18), end: T(19), early: 0 })]), 0);
    eq(countCf([E({ kids: k, start: T(14), end: T(15) }), E({ kids: k, start: T(15), end: T(16), early: 5 })]), 1);
    eq(countCf([E({ kids: k, start: T(14), end: T(15), early: 60 }), E({ kids: k, start: T(15), end: T(16) })]), 0, 'nothing is counted after the end, and early time is only before the start');
    eq(countCf([E({ kids: k, start: T(17), end: T(18), early: 30 }), E({ kids: k, start: T(15), end: T(16, 30) })]), 0, 'other event ends exactly at arrive-by 4:30');
    eq(countCf([E({ kids: k, start: T(17), end: T(18), early: 30 }), E({ kids: k, start: T(15), end: T(16, 31) })]), 1, 'one minute into the early window');
    eq(countCf([E({ kids: k, start: T(17), end: T(20) }), E({ kids: k, start: T(18), end: T(18, 30) })]), 1, 'one inside the other');
    eq(countCf([E({ kids: ['k1'], start: T(17), end: T(18) }), E({ kids: ['k2'], start: T(17), end: T(18) })]), 0, 'different kids never clash');
    eq(countCf([E({ kids: [], start: T(17), end: T(18) }), E({ kids: [], start: T(17), end: T(18) })]), 0, 'no kids, no kid clash');
    eq(countCf([E({ kids: k, date: '2026-11-10' }), E({ kids: k, date: '2026-11-11' })]), 0, 'same time on different days');
    // chain: A 5-7, B 6-8, C 7-9 => A/B and B/C, but A/C only touch
    eq(countCf([E({ title: 'A', kids: k, start: T(17), end: T(19) }), E({ title: 'B', kids: k, start: T(18), end: T(20) }), E({ title: 'C', kids: k, start: T(19), end: T(21) })]), 2);
    // past midnight
    eq(countCf([E({ kids: k, date: '2026-11-07', start: T(23), end: T(1) }), E({ kids: k, date: '2026-11-08', start: T(0, 30), end: T(1, 30) })]), 1, 'a late event runs into the next morning');
    eq(countCf([E({ kids: k, date: '2026-11-07', start: T(23), end: T(1) }), E({ kids: k, date: '2026-11-08', start: T(1), end: T(2) })]), 0, 'touching at 1:00 AM');
    eq(countCf([E({ kids: k, date: '2026-11-07', start: T(23), end: T(1) }), E({ kids: k, date: '2026-11-08', start: T(1), end: T(2), early: 15 })]), 1, 'arrive-by 12:45 AM');
    eq(countCf([E({ kids: k, date: '2026-11-08', start: T(0, 10), end: T(1), early: 30 }), E({ kids: k, date: '2026-11-07', start: T(22), end: T(23, 45) })]), 1, 'arrive-by 11:40 PM the evening before');
    // shared kids
    let cs = C.findConflicts([E({ kids: ['k1', 'k2'], start: T(17), end: T(18) }), E({ kids: ['k2', 'k3'], start: T(17, 30), end: T(18, 30) })]);
    eq(cs.length, 1); deq(cs[0].people, ['k2']);
    cs = C.findConflicts([E({ kids: ['k1', 'k2'], start: T(17), end: T(18) }), E({ kids: ['k1', 'k2'], start: T(17, 30), end: T(18, 30) })]);
    eq(cs.length, 1, 'two shared kids make one conflict, not two'); deq(cs[0].people.slice().sort(), ['k1', 'k2']);
  });

  await test('core: kid conflict sentences read as plain English', async () => {
    const a = E({ title: 'Practice', place: 'Gym', kids: ['k1'], start: T(17), end: T(18) }), b = E({ title: 'Game', place: 'Field', kids: ['k1'], start: T(17, 30), end: T(18, 30) });
    eq(textOf([a, b]), 'Kid 1 is booked twice: Practice at Gym (5:00–6:00 PM) overlaps Game at Field (5:30–6:30 PM).');
    const c = E({ title: 'Practice', kids: ['k1'], start: T(17), end: T(18) }), d = E({ title: 'Game', kids: ['k1'], start: T(18), end: T(19), early: 10 });
    eq(textOf([c, d]), 'Kid 1 has to be at Game by 5:50 PM, but Practice runs until 6:00 PM.');
    const f = E({ title: 'Practice', kids: ['k1', 'k2'], start: T(17), end: T(18) }), g = E({ title: 'Game', kids: ['k2', 'k1'], start: T(17, 30), end: T(18, 30) });
    eq(textOf([f, g]), 'Kid 1 and Kid 2 are booked twice: Practice (5:00–6:00 PM) overlaps Game (5:30–6:30 PM).');
    eq(C.conflictText(C.findConflicts([a, b])[0], C.byId([a, b]), PM, true), 'Kid 1 is booked twice: Practice at Gym (17:00–18:00) overlaps Game at Field (17:30–18:30).');
  });

  await test('core: grown-up conflicts (the brief\'s example, boundaries, same place, snack duty, midnight)', async () => {
    // Practice at Gym ends 5:15 PM. Game at Field 2 starts 5:30, arrive 10 min early (5:20), 20 min drive: leave by 5:00.
    const x = E({ title: 'Practice', place: 'Gym', start: T(16, 30), end: T(17, 15), drive: 10, driver: 'pa', kids: ['k1'] });
    const y = E({ title: 'Game', place: 'Field 2', start: T(17, 30), end: T(18, 30), early: 10, drive: 20, driver: 'pa', kids: ['k2'] });
    eq(textOf([x, y]), 'Parent A has to leave by 5:00 PM to drive to Game at Field 2, but is still at Practice at Gym until 5:15 PM.');
    eq(textOf([y, x]), textOf([x, y]), 'order of the list does not matter');
    eq(C.findConflicts([x, y])[0].kind, 'adult');
    // leave-by exactly when the first event ends: fine. One minute earlier: clash
    eq(countCf([x, Object.assign({}, y, { start: T(17, 45) })]), 0, 'leave-by 5:15 = end 5:15');
    eq(countCf([x, Object.assign({}, y, { start: T(17, 44) })]), 1, 'leave-by 5:14');
    // gap vs drive time
    const g1 = E({ place: 'Gym', start: T(16), end: T(17), driver: 'pa' });
    eq(countCf([g1, E({ place: 'Field', start: T(17, 30), end: T(18, 30), drive: 30, driver: 'pa' })]), 0, '30 min gap, 30 min drive');
    eq(countCf([g1, E({ place: 'Field', start: T(17, 30), end: T(18, 30), drive: 31, driver: 'pa' })]), 1, '30 min gap, 31 min drive');
    eq(countCf([g1, E({ place: 'Field', start: T(17, 30), end: T(18, 30), drive: 15, early: 15, driver: 'pa' })]), 0, 'early arrival eats into the gap too');
    eq(countCf([g1, E({ place: 'Field', start: T(17, 30), end: T(18, 30), drive: 15, early: 16, driver: 'pa' })]), 1);
    // same place: never a clash, even for the same time; text is compared ignoring case and spacing
    eq(countCf([E({ place: 'Main Gym', start: T(17), end: T(18), drive: 15, driver: 'pa' }), E({ place: ' main  GYM ', start: T(17, 30), end: T(18, 30), drive: 15, driver: 'pa' })]), 0, 'same place');
    eq(countCf([E({ place: 'Main Gym', start: T(17), end: T(18), driver: 'pa' }), E({ place: 'Main Gym 2', start: T(17), end: T(18), driver: 'pa' })]), 1, 'different place text');
    eq(countCf([E({ place: '', start: T(17), end: T(18), driver: 'pa' }), E({ place: '', start: T(17, 30), end: T(18, 30), driver: 'pa' })]), 1, 'blank places are unknown, so not "the same"');
    eq(countCf([E({ place: 'Gym', start: T(17), end: T(18), driver: 'pa' }), E({ place: '', start: T(17, 30), end: T(18, 30), driver: 'pa' })]), 1);
    // not drivers
    ['', 'ride', 'none'].forEach(v => eq(countCf([E({ place: 'A', driver: v }), E({ place: 'B', driver: v })]), 0, 'driver "' + v + '"'));
    eq(countCf([E({ place: 'A', driver: 'pa' }), E({ place: 'B', driver: 'pb' })]), 0, 'two different grown-ups');
    eq(countCf([E({ place: 'A', driver: 'pa', date: '2026-11-10' }), E({ place: 'B', driver: 'pa', date: '2026-11-11' })]), 0, 'two days');
    // snack duty counts too
    const sx = E({ title: 'Practice', place: 'Gym', start: T(16, 30), end: T(17, 15), drive: 10, driver: 'pa' });
    const sy = E({ title: 'Game', place: 'Field', start: T(17, 30), end: T(18, 30), drive: 20, snack: 'pa' });
    let cs = C.findConflicts([sx, sy]); eq(cs.length, 1); deq(cs[0].roles, ['driver', 'snack']);
    eq(textOf([sx, sy]), 'Parent A has to leave by 5:10 PM to bring the snack to Game at Field, but is still at Practice at Gym until 5:15 PM.');
    eq(countCf([E({ place: 'Gym', start: T(17), end: T(18), drive: 10, driver: 'pa', snack: 'pa' })]), 0, 'driver and snack on the same event is one job at one place');
    eq(countCf([E({ place: 'Gym', start: T(17), end: T(18), driver: 'pa', snack: 'pa' }), E({ place: 'Field', start: T(17, 30), end: T(18, 30), driver: 'pa', snack: 'pa' })]), 1, 'four jobs, still one conflict');
    eq(countCf([E({ place: 'Gym', start: T(17), end: T(18), driver: 'pa' }), E({ place: 'Field', start: T(17, 30), end: T(18, 30), snack: 'open' })]), 0, 'unclaimed snack is nobody');
    // past midnight
    eq(countCf([E({ place: 'Gym', date: '2026-11-07', start: T(22, 30), end: T(0, 30), driver: 'pa' }), E({ place: 'Field', date: '2026-11-08', start: T(0, 45), end: T(2), drive: 15, driver: 'pa' })]), 0, 'leave-by 12:30 AM = end 12:30 AM');
    eq(countCf([E({ place: 'Gym', date: '2026-11-07', start: T(22, 30), end: T(0, 30), driver: 'pa' }), E({ place: 'Field', date: '2026-11-08', start: T(0, 45), end: T(2), drive: 16, driver: 'pa' })]), 1, 'leave-by 12:29 AM');
    eq(countCf([E({ place: 'Gym', date: '2026-11-08', start: T(0, 20), end: T(1), drive: 30, driver: 'pa' }), E({ place: 'Field', date: '2026-11-07', start: T(22), end: T(23, 50), driver: 'pa' })]), 0, 'leave-by 11:50 PM the evening before = the other ends 11:50 PM');
    eq(countCf([E({ place: 'Gym', date: '2026-11-08', start: T(0, 20), end: T(1), drive: 30, driver: 'pa' }), E({ place: 'Field', date: '2026-11-07', start: T(22), end: T(23, 51), driver: 'pa' })]), 1, 'one minute later');
    eq(textOf([E({ title: 'Late', place: 'Gym', date: '2026-11-07', start: T(22, 30), end: T(0, 30), driver: 'pa' }), E({ title: 'Early', place: 'Field', date: '2026-11-08', start: T(0, 45), end: T(2), drive: 30, driver: 'pa' })]),
      'Parent A has to leave by 12:15 AM to drive to Early at Field, but is still at Late at Gym until Sun 12:30 AM.'.replace('until Sun 12:30 AM', 'until Sun 12:30 AM'), 'day names appear when the clock time belongs to another day');
  });

  await test('core: clock-change weekend (Sun 2026-11-01) and a 1:30-2:30 AM event behave the same in every time zone', async () => {
    const run = () => {
      const a = E({ title: 'Early', place: 'A', date: '2026-11-01', start: T(1, 30), end: T(2, 30), driver: 'pa', kids: ['k1'] });
      const b = E({ title: 'Next', place: 'B', date: '2026-11-01', start: T(2, 30), end: T(3, 30), driver: 'pa', kids: ['k1'] });
      const o = [];
      o.push(C.durOf(a), countCf([a, b]));                                                               // touching: 60 and 0
      o.push(countCf([a, Object.assign({}, b, { drive: 10 })]));                                          // leave-by 2:20 < 2:30
      o.push(countCf([a, Object.assign({}, b, { start: T(2, 15) })]));                                    // kid overlap AND grown-up overlap: two conflicts
      const sat = E({ title: 'Sat late', place: 'C', date: '2026-10-31', start: T(23), end: T(1, 30), driver: 'pa', kids: ['k1'] });
      o.push(countCf([sat, a]));                                                                          // sat ends 1:30 (Sun) = a starts 1:30: touching for the kid
      o.push(countCf([sat, Object.assign({}, a, { start: T(1, 15) })]));                                   // 1:15 inside 23:00-1:30: kid and grown-up
      o.push(C.absToLocal(C.absEnd(sat)).date, C.absToLocal(C.absEnd(sat)).min);
      o.push(C.weeklyDates('2026-10-25', { count: 4 }).join(), C.addDays('2026-11-01', 1), C.weekday('2026-11-01'));
      const ics = C.icsCalendar([a], PEOPLE, 0, false); o.push(/DTSTART:20261101T013000\r\n/.test(ics), /DTEND:20261101T023000\r\n/.test(ics));
      return JSON.stringify(o);
    };
    const want = JSON.stringify([60, 0, 1, 2, 0, 2, '2026-11-01', 90, '2026-10-25,2026-11-01,2026-11-08,2026-11-15', '2026-11-02', 0, true, true]);
    for (const tz of ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland', 'UTC', 'Asia/Kolkata']) eq(withTZ(tz, run), want, tz);
  });

  await test('core: the detector agrees with a slow brute-force check on 400 random events (shuffled, 3 time zones)', async () => {
    const rnd = mulberry(20261107), places = ['Gym', 'Field 1', 'field 1 ', 'Rec', ''], kidsAll = ['k1', 'k2', 'k3', 'k4'], adultsAll = ['pa', 'pb', 'pc'];
    const evs = [];
    for (let i = 0; i < 400; i++) {
      const start = Math.floor(rnd() * 96) * 15, dur = (1 + Math.floor(rnd() * 8)) * 15;
      evs.push(E({ id: 'r' + i, title: 'T' + i, date: C.addDays('2026-10-30', Math.floor(rnd() * 5)), start: start, end: (start + dur) % 1440, place: places[Math.floor(rnd() * places.length)],
        kids: kidsAll.filter(() => rnd() < 0.3), driver: rnd() < 0.7 ? adultsAll[Math.floor(rnd() * 3)] : ['', 'ride', 'none'][Math.floor(rnd() * 3)], snack: rnd() < 0.3 ? adultsAll[Math.floor(rnd() * 3)] : (rnd() < 0.3 ? 'open' : ''),
        early: [0, 0, 5, 10, 30][Math.floor(rnd() * 5)], drive: [0, 10, 15, 25, 45][Math.floor(rnd() * 5)] }));
    }
    // independent arithmetic: minutes since 1970 from Date.UTC
    const abs = e => { const p = e.date.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 60000 + e.start; };
    const dur = e => (e.end - e.start + 1440) % 1440 || 1440;
    const np = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const want = new Set();
    for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
      const p = evs[i], q = evs[j];
      const kidsShared = p.kids.filter(k => q.kids.includes(k));
      if (kidsShared.length && abs(p) - p.early < abs(q) + dur(q) && abs(q) - q.early < abs(p) + dur(p)) want.add('kid|' + [p.id, q.id].sort().join('|'));
      const jobs = e => [e.driver, e.snack].filter(v => v && !['ride', 'none', 'open'].includes(v));
      const shared = jobs(p).filter(a => jobs(q).includes(a));
      const same = np(p.place) !== '' && np(p.place) === np(q.place);
      shared.forEach(a => { if (!same && abs(p) - p.early - p.drive < abs(q) + dur(q) && abs(q) - q.early - q.drive < abs(p) + dur(p)) want.add('adult|' + a + '|' + [p.id, q.id].sort().join('|')); });
    }
    for (const tz of ['America/New_York', 'Pacific/Auckland', 'UTC']) {
      withTZ(tz, () => {
        const shuffled = evs.slice().sort(() => rnd() - 0.5);
        const got = new Set(C.findConflicts(shuffled).map(c => c.kind + '|' + (c.kind === 'adult' ? c.people[0] + '|' : '') + [c.a, c.b].sort().join('|')));
        eq(got.size, want.size, tz + ' count'); assert.ok([...want].every(x => got.has(x)), tz + ' every expected conflict found');
      });
    }
    assert.ok(want.size > 100, 'the random week really is busy (' + want.size + ' conflicts)');
    const t0 = Date.now(); const big = []; for (let i = 0; i < 2500; i++) big.push(E({ id: 'b' + i, date: C.addDays('2026-01-01', i % 200), start: (i % 20) * 60, end: (i % 20) * 60 + 30, kids: ['k' + (i % 4)], driver: ['pa', 'pb'][i % 2], place: 'P' + (i % 7) }));
    C.findConflicts(big); assert.ok(Date.now() - t0 < 1500, 'the largest allowed set (2500 events) is checked quickly: ' + (Date.now() - t0) + 'ms');
  });

  await test('core: fixes (who is free, one-tap assign, ask someone else, take a kid off) really clear the conflict', async () => {
    const x = E({ title: 'Practice', place: 'Main Gym', start: T(17), end: T(18, 15), early: 10, drive: 15, driver: 'pa', kids: ['k1'] });
    const y = E({ title: 'Practice', place: 'Rec Center', start: T(17, 30), end: T(18, 30), early: 5, drive: 20, driver: 'pa', kids: ['k2'] });
    const other = E({ title: 'Busy', place: 'Elsewhere', start: T(17), end: T(18), driver: 'pb', date: '2026-11-10' });
    const cs = C.findConflicts([x, y, other]); eq(cs.length, 1);
    deq(C.freeAdults(y, 'driver', [x, y, other], PEOPLE), ['pc'], 'Parent B is driving elsewhere then; Parent A is the current driver of x but is busy with it; only C is free');
    deq(C.freeAdults(y, 'driver', [x, y], PEOPLE), ['pb', 'pc']);
    const fixes = C.suggestFixes(cs[0], [x, y], PEOPLE);
    const types = fixes.map(f => f.type + ':' + (f.person || f.event === y.id ? (f.person || 'y') : 'x'));
    assert.ok(fixes[0].label.startsWith('Assign Parent B to drive'), fixes[0].label);
    eq(fixes[0].event, y.id, 'first suggestion is for the later event'); eq(fixes[0].person, 'pb');
    assert.ok(fixes.some(f => f.type === 'open' && f.label === 'Ask someone else to drive to Practice at Rec Center'));
    assert.ok(fixes.filter(f => f.type === 'edit').length === 2);
    const after = C.applyFix([x, y], fixes[0]);
    eq(countCf(after), 0, 'assigning the free parent clears it'); eq(after.find(e => e.id === y.id).driver, 'pb'); eq(x.driver, 'pa', 'original not mutated');
    const open = C.applyFix([x, y], fixes.find(f => f.type === 'open')); eq(open.find(e => e.id === y.id).driver, 'ride'); eq(countCf(open), 0);
    // kid conflict fixes
    const a = E({ title: 'Practice', kids: ['k1', 'k2'], start: T(17), end: T(18) }), b = E({ title: 'Game', kids: ['k1'], start: T(17, 30), end: T(18, 30) });
    const kc = C.findConflicts([a, b])[0], kf = C.suggestFixes(kc, [a, b], PEOPLE);
    eq(kf[0].type, 'removeKids'); eq(kf[0].label, 'Take Kid 1 off Practice'); deq(kf[0].kids, ['k1']);
    const fixed = C.applyFix([a, b], kf[0]); deq(fixed.find(e => e.id === a.id).kids, ['k2']); eq(countCf(fixed), 0);
    // the snack role gets a snack fix
    const sx = E({ place: 'Gym', start: T(16, 30), end: T(17, 15), drive: 10, driver: 'pa' }), sy = E({ title: 'Game', place: 'Field', start: T(17, 30), end: T(18, 30), drive: 20, snack: 'pa' });
    const sf = C.suggestFixes(C.findConflicts([sx, sy])[0], [sx, sy], PEOPLE);
    assert.ok(sf[0].label.startsWith('Assign Parent B to bring the snack to Game at Field'), sf[0].label); eq(sf[0].role, 'snack');
    eq(C.applyFix([sx, sy], { type: 'set', event: sy.id, field: 'snack', value: '' }).find(e => e.id === sy.id).snack, '');
    eq(C.applyFix([sx, sy], { type: 'set', event: sy.id, field: 'title', value: 'hack' }).find(e => e.id === sy.id).title, 'Game', 'only driver and snack can be set');
    eq(C.adultFreeFor('pa', y, [x, y]), false); eq(C.adultFreeFor('pb', y, [x, y]), true);
  });

  await test('core: needs-attention list (upcoming only, horizon edges, "no driving needed" and no-snack are fine)', async () => {
    const t = '2026-11-07';
    const evs = [
      E({ id: 'past1', title: 'Past', date: '2026-11-06', driver: '' }),
      E({ id: 'today1', title: 'Today', date: '2026-11-07', start: T(9), end: T(10), driver: 'ride' }),
      E({ id: 'edge13', title: 'Edge13', date: '2026-11-20', driver: '', snack: 'open' }),
      E({ id: 'edge14', title: 'Edge14', date: '2026-11-21', driver: '' }),
      E({ id: 'none1', title: 'Walk', date: '2026-11-09', driver: 'none', snack: '' }),
      E({ id: 'ok1', title: 'Fine', date: '2026-11-09', driver: 'pa', snack: 'pb' }),
      E({ id: 'later', title: 'Later', date: '2027-02-01', driver: '', snack: 'open' })
    ];
    let na = C.needsAttention(evs, [], t, 14);
    deq(na.items.map(i => i.event.id), ['today1', 'edge13'], 'today counts, the 14th day from today does not (14 days = today..Nov 20)');
    deq(na.items[0].issues, ['ride']); deq(na.items[1].issues, ['driver', 'snack']); eq(na.missing, 2); eq(na.conflicts, 0);
    na = C.needsAttention(evs, [], t, 60); deq(na.items.map(i => i.event.id), ['today1', 'edge13', 'edge14'], '60 days reaches Jan 5');
    na = C.needsAttention(evs, [], t, Infinity); deq(na.items.map(i => i.event.id), ['today1', 'edge13', 'edge14', 'later']);
    // conflicts: only if they are not wholly in the past, ordered with events by time
    const c1 = E({ id: 'c1', date: '2026-11-06', place: 'A', start: T(17), end: T(18), driver: 'pa' }), c2 = E({ id: 'c2', date: '2026-11-06', place: 'B', start: T(17, 30), end: T(18, 30), driver: 'pa' });
    const c3 = E({ id: 'c3', date: '2026-11-10', place: 'A', start: T(17), end: T(18), driver: 'pa' }), c4 = E({ id: 'c4', date: '2026-11-10', place: 'B', start: T(17, 30), end: T(18, 30), driver: 'pa' });
    const all = [c1, c2, c3, c4, E({ id: 'nd', date: '2026-11-10', start: T(8), end: T(9), driver: '' })];
    const raw = C.findConflicts(all); eq(raw.length, 2);
    eq(C.activeConflicts(raw, t).length, 1, 'the one on Nov 6 is over');
    na = C.needsAttention(all, C.activeConflicts(raw, t), t, 14);
    deq(na.items.map(i => i.type + ':' + (i.event ? i.event.id : i.conflict.a)), ['event:nd', 'conflict:c3'], 'the 8 AM event sorts before the 5 PM conflict');
    // the cross-midnight conflict stays "active" through the morning after
    const late = [E({ id: 'l1', date: '2026-11-06', place: 'A', start: T(22), end: T(1), driver: 'pa' }), E({ id: 'l2', date: '2026-11-07', place: 'B', start: T(0, 30), end: T(1, 30), driver: 'pa' })];
    eq(C.activeConflicts(C.findConflicts(late), '2026-11-07').length, 1); eq(C.activeConflicts(C.findConflicts(late), '2026-11-08').length, 0);
  });

  await test('core: weekly repeats, edit "all later", delete one / all later (with skipped dates remembered)', async () => {
    deq(C.weeklyDates('2026-10-25', { count: 4 }), ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
    deq(C.weeklyDates('2026-10-25', { until: '2026-11-08' }), ['2026-10-25', '2026-11-01', '2026-11-08'], 'until is included');
    deq(C.weeklyDates('2026-10-25', { until: '2026-11-07' }), ['2026-10-25', '2026-11-01']);
    deq(C.weeklyDates('2026-10-25', { until: '2026-10-24' }), [], 'until before the start');
    deq(C.weeklyDates('2026-10-25', { count: 1 }), ['2026-10-25']); deq(C.weeklyDates('2026-10-25', {}), ['2026-10-25']); deq(C.weeklyDates('2026-10-25'), ['2026-10-25']);
    deq(C.weeklyDates('2026-10-25', { count: 4, until: '2026-11-01' }), ['2026-10-25', '2026-11-01'], 'whichever ends first');
    deq(C.weeklyDates('2026-10-25', { count: 4, skip: ['2026-11-08'] }), ['2026-10-25', '2026-11-01', '2026-11-15'], 'skipped dates still use up their turn');
    deq(C.weeklyDates('2026-12-21', { count: 3 }), ['2026-12-21', '2026-12-28', '2027-01-04']); deq(C.weeklyDates('2028-02-22', { count: 2 }), ['2028-02-22', '2028-02-29']);
    eq(C.weeklyDates('2026-01-01', { until: '2030-01-01' }).length, C.LIM.occ, 'never more than 104 events'); eq(C.weeklyDates('2026-01-01', { count: 500 }).length, 104);
    const gen = counter();
    const base = E({ id: 'first', title: 'Practice', date: '2026-11-03', start: T(17), end: T(18), kids: ['k1'] });
    let st = C.makeSeries({ events: [E({ id: 'keep', title: 'Other' })], series: [] }, base, { count: 5 }, gen);
    eq(st.events.length, 6); eq(st.series.length, 1); const sid = st.series[0].id;
    deq(C.seriesOf(st.events, sid).map(e => e.date), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01']); eq(C.seriesOf(st.events, sid)[0].id, 'first'); eq(C.seriesLast(st.events, sid), '2026-12-01');
    eq(new Set(st.events.map(e => e.id)).size, 6, 'ids are unique');
    eq(C.makeSeries({ events: [], series: [] }, base, { until: '2026-11-03' }, gen).series.length, 0, 'one date is not a series'); eq(C.makeSeries({ events: [], series: [] }, base, { until: '2026-10-01' }, gen).events.length, 1, 'bad until keeps the event');
    // delete one occurrence: remembered as skipped
    st = Object.assign({}, st, C.deleteFromSeries(st, C.seriesOf(st.events, sid)[2].id, 'one'));
    deq(C.seriesOf(st.events, sid).map(e => e.date), ['2026-11-03', '2026-11-10', '2026-11-24', '2026-12-01']); deq(st.series[0].skip, ['2026-11-17']);
    // edit this and all later from Nov 10: new time and a new weekday (Wed), until Dec 16; the skipped Nov 17 is irrelevant now
    const anchor = C.seriesOf(st.events, sid)[1];
    const fields = Object.assign({}, base, { date: '2026-11-11', start: T(18), end: T(19), title: 'Practice B' }); delete fields.id; delete fields.series;
    let r = C.rewriteFuture(st, anchor.id, fields, '2026-12-16', gen);
    deq(C.seriesOf(r.events, sid).map(e => e.date + ' ' + e.title + ' ' + e.start), ['2026-11-03 Practice 1020', '2026-11-11 Practice B 1080', '2026-11-18 Practice B 1080', '2026-11-25 Practice B 1080', '2026-12-02 Practice B 1080', '2026-12-09 Practice B 1080', '2026-12-16 Practice B 1080']);
    eq(C.seriesOf(r.events, sid)[1].id, anchor.id, 'the edited event keeps its id'); eq(r.events.filter(e => e.id === 'keep').length, 1, 'unrelated events untouched');
    // same weekday: the skipped date stays skipped
    r = C.rewriteFuture(st, anchor.id, Object.assign({}, fields, { date: '2026-11-10' }), '2026-12-01', gen);
    deq(C.seriesOf(r.events, sid).map(e => e.date), ['2026-11-03', '2026-11-10', '2026-11-24', '2026-12-01'], 'Nov 17 does not come back');
    eq(C.rewriteFuture(st, 'keep', fields, '2026-12-01', gen), null, 'not a series');
    // delete this and all later
    const del = C.deleteFromSeries(st, anchor.id, 'future'); deq(C.seriesOf(del.events, sid).map(e => e.date), ['2026-11-03']); eq(del.series.length, 1);
    const delAll = C.deleteFromSeries(st, C.seriesOf(st.events, sid)[0].id, 'future'); eq(delAll.series.length, 0, 'empty series is forgotten'); eq(delAll.events.length, 1);
    const plain = C.deleteFromSeries({ events: [E({ id: 'solo' })], series: [] }, 'solo', 'one'); eq(plain.events.length, 0); eq(plain.series.length, 0);
    eq(C.deleteFromSeries(st, 'nope', 'one').events.length, st.events.length);
  });

  await test('core: calendar file is valid text/calendar (CRLF, folding, escaping, floating times, alarm) and parses back', async () => {
    const gen = counter();
    const tricky = E({ id: 'tr1', title: 'Cup, Final; "Round" 1', place: 'Field #2, North; Park', address: '12 Example Rd, Town', date: '2026-11-07', start: T(23), end: T(1), kids: ['k1', 'k2'], driver: 'pa', snack: 'open', early: 20, drive: 15, notes: 'Line one\nLine two, with; punctuation and a back\\slash' });
    const long = E({ id: 'lg1', title: 'A'.repeat(200), notes: 'é'.repeat(120), date: '2026-11-08', start: T(9), end: T(10, 30), place: '🏆'.repeat(40) });
    const emoji = E({ id: 'em1', title: '🏆 Game ⚾ ' + '🏆'.repeat(30), date: '2026-11-01', start: T(1, 30), end: T(2, 30) });
    const simple = E({ id: 'sm1', title: 'Practice', date: '2026-12-31', start: T(17), end: T(18) });
    const now = Date.UTC(2026, 10, 7, 12, 34, 56);
    const text = C.icsCalendar([long, tricky, simple, emoji], PEOPLE, now, false);
    const cal = parseICS(text);
    eq(cal.name, 'VCALENDAR'); eq(cal.props.VERSION, '2.0'); assert.ok(cal.props.PRODID); eq(cal.props.CALSCALE, 'GREGORIAN');
    const vs = cal.kids.filter(k => k.name === 'VEVENT'); eq(vs.length, 4);
    const by = id => vs.find(v => v.props.UID === id + '@whoswhere.local');
    eq(new Set(vs.map(v => v.props.UID)).size, 4, 'unique UIDs');
    vs.forEach(v => { eq(v.props.DTSTAMP, '20261107T123456Z', 'DTSTAMP is UTC'); assert.ok(/^\d{8}T\d{6}$/.test(v.props.DTSTART), 'floating start (no Z, no TZID): ' + v.props.DTSTART); assert.ok(v.props.DTEND > v.props.DTSTART);
      const al = v.kids.find(k => k.name === 'VALARM'); assert.ok(al, 'alarm'); eq(al.props.TRIGGER, '-PT60M'); eq(al.props.ACTION, 'DISPLAY'); assert.ok(al.props.DESCRIPTION); });
    const t = by('tr1');
    eq(t.props.SUMMARY, 'Cup, Final; "Round" 1'); eq(t.props.LOCATION, 'Field #2, North; Park, 12 Example Rd, Town'); eq(t.props.DTSTART, '20261107T230000'); eq(t.props.DTEND, '20261108T010000');
    eq(t.props.DESCRIPTION, 'Players: Kid 1, Kid 2\nDriver: Parent A\nSnack: needs someone\nArrive by 10:40 PM (20 min early)\nLeave by 10:25 PM (about 15 min drive)\nAddress: 12 Example Rd, Town\nNotes: Line one\nLine two, with; punctuation and a back\\slash');
    eq(by('lg1').props.SUMMARY, 'A'.repeat(200)); assert.ok(by('lg1').props.DESCRIPTION.endsWith('é'.repeat(120))); eq(by('lg1').props.LOCATION, '🏆'.repeat(40));
    eq(by('em1').props.SUMMARY, '🏆 Game ⚾ ' + '🏆'.repeat(30)); eq(by('em1').props.DTSTART, '20261101T013000'); eq(by('em1').props.DTEND, '20261101T023000');
    eq(by('sm1').props.DTSTART, '20261231T170000'); eq(by('sm1').props.DTEND, '20261231T180000'); eq(by('sm1').props.SUMMARY, 'Practice');
    assert.ok(text.indexOf('\r\n ') > 0, 'long lines really were folded'); assert.ok(text.split('\r\n').some(l => Buffer.byteLength(l) > 70 && Buffer.byteLength(l) <= 75), 'folded right up to the limit');
    // escaping helpers directly
    eq(C.icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne'); eq(C.icsEscape('x\r\ny\rz'), 'x\\ny\\nz'); eq(C.icsEscape('tab\there\u0000'), 'tab\there');
    // folding never goes over 75 octets and never splits a character
    ['x'.repeat(74), 'x'.repeat(75), 'x'.repeat(76), 'é'.repeat(50), '🏆'.repeat(40), 'ab' + '🏆'.repeat(40)].forEach(s => {
      const f = C.foldLine('SUMMARY:' + s); f.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, 'fold length')); eq(f.split('\r\n').map((l, i) => i ? l.slice(1) : l).join(''), 'SUMMARY:' + s);
    });
    eq(C.foldLine('x'.repeat(75)).indexOf('\r\n'), -1, 'exactly 75 octets is not folded'); assert.ok(C.foldLine('x'.repeat(76)).indexOf('\r\n') > 0);
    eq(C.icsStamp(Date.UTC(2026, 0, 2, 3, 4, 5)), '20260102T030405Z');
    // empty list is still a valid file
    const empty = parseICS(C.icsCalendar([], [], now, false)); eq(empty.kids.length, 0);
    eq(C.fileSlug('Cup, Final; "Round" 1'), 'cup-final-round-1'); eq(C.fileSlug('!!!'), 'event'); eq(C.fileSlug('🏆'), 'event');
    // sample data round-trips through the file too
    const s = sampleDoc(); const sc = parseICS(C.icsCalendar(s.events, s.people, now, true)); eq(sc.kids.length, s.events.length);
    assert.ok(sc.kids.every(v => /^\d{8}T\d{4}00$/.test(v.props.DTSTART)));
  });

  await test('core: the week as text for the group chat (exact output)', async () => {
    const evs = [
      E({ id: 'w1', title: 'Practice', date: '2026-11-03', start: T(17), end: T(18, 15), place: 'Main Gym', kids: ['k1'], driver: 'pa', early: 10 }),
      E({ id: 'w2', title: 'Game', date: '2026-11-04', start: T(18), end: T(19, 30), place: 'Field 2', kids: ['k1', 'k2'], driver: '', snack: 'open', notes: 'Wear the\naway jersey', address: '1 Example Rd' }),
      E({ id: 'w3', title: 'Late', date: '2026-11-07', start: T(22), end: T(0, 30), kids: [], driver: 'none', snack: 'pb' }),
      E({ id: 'w4', title: 'Next week', date: '2026-11-08' })
    ];
    const want = 'Week of Nov 1 – 7, 2026\n\nSun, Nov 1\n• Nothing planned\n\nMon, Nov 2\n• Nothing planned\n\nTue, Nov 3\n• 5:00–6:15 PM Practice @ Main Gym (arrive 4:50 PM)\n  Kid 1 · Driver: Parent A\n\nWed, Nov 4\n• 6:00–7:30 PM Game @ Field 2\n  Kid 1, Kid 2 · Driver: NEEDED · Snack: NEEDED\n  Address: 1 Example Rd\n  Note: Wear the away jersey\n\nThu, Nov 5\n• Nothing planned\n\nFri, Nov 6\n• Nothing planned\n\nSat, Nov 7\n• 10:00 PM–12:30 AM (ends next day) Late\n  Snack: Parent B\n';
    eq(C.weekText(evs, PEOPLE, '2026-11-01', false), want);
    assert.ok(C.weekText(evs, PEOPLE, '2026-11-01', true).includes('• 17:00–18:15 Practice @ Main Gym (arrive 16:50)'));
    eq(C.mapsUrl(evs[0]), 'https://maps.google.com/?q=Main%20Gym'); eq(C.mapsUrl(evs[1]), 'https://maps.google.com/?q=Field%202%2C%201%20Example%20Rd'); eq(C.mapsUrl(evs[3]), '');
    eq(C.mapsUrl({ place: 'A&B <x>', address: '' }), 'https://maps.google.com/?q=A%26B%20%3Cx%3E');
  });

  await test('core: cleaning data (junk, limits, unknown people, odd ids) and backup validation', async () => {
    const st = C.sanitizeState({
      people: [{ id: 'kid1', name: '  Kid 1 ', role: 'player', color: '#3AA0FF' }, { id: 'kid1', name: 'Dup', role: 'player' }, { id: 'ride', name: 'Reserved id', role: 'adult' }, { id: '__proto__', name: 'Proto', role: 'adult' }, { id: 'a b', name: '<img onerror=alert(1)>', role: 'adult', color: 'red' }, { name: '' }, 'junk', null, 7],
      events: [
        { id: 'e1', title: '<b>x</b>', type: 'weird', date: '2026-11-10', start: '17:00', end: 1080, kids: ['kid1', 'ghost', 'kid1'], driver: 'ghost', snack: 'open', early: 9999, drive: -5, notes: 'a\u0000b\r\nc', place: 'P\nQ' },
        { id: 'e2', date: '2026-02-30', start: 10, end: 20 }, { id: 'e3', date: '2026-11-10', start: 'x', end: 20 }, { id: 'e4', date: '2026-11-10', start: 600, end: 600, title: '' }, { id: 'e1', date: '2026-11-11', start: 600, end: 660, type: 'game', series: 's 1' }, 5, null
      ],
      series: [{ id: 'nope', skip: ['2026-11-11'] }], settings: { weekStart: 5, h24: 'yes', driveMin: 'abc', earlyMin: 999 }
    });
    eq(st.people.length, 5, 'junk dropped, odd ids replaced'); eq(st.dropped.people, 4);
    eq(st.people[0].name, 'Kid 1'); eq(st.people[0].color, '#3aa0ff'); eq(new Set(st.people.map(p => p.id)).size, 5); assert.ok(st.people.every(p => C.ID_RE.test(p.id) && !['ride', 'none', 'open'].includes(p.id)));
    eq(st.people[4].name, '<img onerror=alert(1)>', 'text kept as text'); assert.ok(/^#[0-9a-f]{6}$/.test(st.people[4].color), 'bad color replaced');
    eq(st.events.length, 3); eq(st.dropped.events, 4);
    const e1 = st.events[0]; eq(e1.title, '<b>x</b>'); eq(e1.type, 'other'); eq(e1.start, 1020); eq(e1.end, 1080); deq(e1.kids, ['kid1']); eq(e1.driver, ''); eq(e1.snack, 'open'); eq(e1.early, 180); eq(e1.drive, 0); eq(e1.notes, 'abc'.slice(0, 1) + 'b\nc'); eq(e1.place, 'P Q');
    eq(st.events[1].title, 'Other', 'empty title falls back to the type'); eq(st.events[1].end, 660, 'end = start is made an hour long'); assert.notStrictEqual(st.events[2].id, 'e1', 'duplicate event id replaced'); eq(st.events[2].series, '', 'bad series id dropped');
    eq(st.series.length, 0, 'series entries for unknown series dropped'); deq(st.settings, { weekStart: 0, h24: false, driveMin: 15, earlyMin: 180 });
    // synthesised series entry for an event that names a series
    const s2 = C.sanitizeState({ people: [], events: [{ id: 'q1x', date: '2026-11-10', start: 60, end: 120, series: 'ser1' }] }); deq(s2.series, [{ id: 'ser1', skip: [] }]);
    // limits
    const many = { people: [], events: [] }; for (let i = 0; i < 3000; i++) many.events.push({ id: 'm' + i + 'xx', date: '2026-11-10', start: 60, end: 120 }); for (let i = 0; i < 40; i++) many.people.push({ id: 'p' + i + 'xx', name: 'P' + i, role: 'adult' });
    const lim = C.sanitizeState(many); eq(lim.events.length, 2500); eq(lim.people.length, 24); eq(lim.dropped.events, 500);
    eq(C.sanitizeState({ events: [{ id: 'z1x', date: '2026-11-10', start: 1, end: 2, title: 'x'.repeat(500), notes: 'y'.repeat(5000) }] }).events[0].title.length, 80);
    eq(C.sanitizeState({ events: [{ id: 'z1x', date: '2026-11-10', start: 1, end: 2, title: 'x'.repeat(79) + '🏆' }] }).events[0].title, 'x'.repeat(79), 'never cuts an emoji in half');
    eq(C.sanitizeState(null).people.length, 0); eq(C.sanitizeState('x').events.length, 0); eq(C.sanitizeState([1, 2]).events.length, 0);
    // backup
    const s = sampleDoc(); const bk = JSON.parse(JSON.stringify(C.makeBackup(s, TODAY)));
    eq(bk.app, 'whoswhere'); eq(bk.v, 1); eq(bk.exported, TODAY);
    const v = C.validateBackup(bk); eq(v.ok, true); deq(v.state.people, s.people); deq(v.state.events, s.events); deq(v.state.series, s.series); deq(v.state.settings, s.settings); eq(v.dropped.events, 0);
    [[null, /isn't a Who's Where backup/], [[], /isn't a Who's Where backup/], [{ app: 'locker', v: 1, people: [], events: [] }, /isn't a Who's Where backup/], [{ app: 'whoswhere', v: 2, people: [], events: [] }, /newer version/], [{ app: 'whoswhere', v: 1, people: [] }, /missing/],
      [{ app: 'whoswhere', v: 1, people: [], events: [] }, /no people or events/], [{ app: 'whoswhere', v: 1, people: [{ name: '' }], events: [{ date: 'bad' }] }, /no people or events/], [{ app: 'whoswhere', v: 'one', people: [], events: [] }, /newer version/]]
      .forEach(([o, re]) => { const r = C.validateBackup(o); eq(r.ok, false, JSON.stringify(o)); assert.ok(re.test(r.error), r.error); });
    const half = C.validateBackup({ app: 'whoswhere', v: 1, people: s.people, events: s.events.concat([{ junk: 1 }, { date: 'x' }]) }); eq(half.ok, true); eq(half.dropped.events, 2);
  });

  await test('core: sample week has exactly the deliberate problems, whichever weekday it is made on', async () => {
    for (const today of ['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-07', '2027-01-01', '2028-02-29']) for (const ws of [0, 1]) {
      const s = sampleDoc(today, ws), start = C.startOfWeek(today, ws);
      eq(s.events.length, 23, 'events'); eq(s.people.length, 4); eq(s.settings.weekStart, ws);
      const week = C.eventsInRange(s.events, start, C.addDays(start, 6)); eq(week.length, 8, 'one of each template in the current week, ' + today + '/' + ws);
      const cs = C.findConflicts(s.events); eq(cs.length, 4, 'one conflict per week for 4 weeks'); assert.ok(cs.every(c => c.kind === 'adult' && c.people[0] === 'parentA'));
      eq(s.events.filter(e => C.driverMissing(e)).length, 4, 'one game a week with no driver'); eq(s.events.filter(e => e.snack === 'open').length, 4);
      eq(C.eventsInRange(s.events, start, C.addDays(start, 6)).filter(e => S_has(s, e)).length, 1);
      eq(C.sanitizeState(JSON.parse(JSON.stringify(s))).dropped.events, 0); eq(JSON.stringify(C.sanitizeState(JSON.parse(JSON.stringify(s))).events), JSON.stringify(s.events), 'sample is already clean data');
      const na = C.needsAttention(s.events, C.activeConflicts(cs, today), today, Infinity); assert.ok(na.conflicts >= 3 && na.missing >= 3, 'always something to show from today on: ' + today);
    }
    function S_has(s, e) { return C.driverMissing(e); }
  });

  /* ================= in the browser ================= */
  const srv = await startServer('whoswhere');
  const br = await launch();
  console.log('Serving ' + srv.url);
  const open = async (opts = {}, state) => {
    const { ctx, page, errors } = await newPage(br, Object.assign({ today: TODAY }, opts));
    if (state) await seed(page, state);
    await page.goto(srv.url);
    await page.waitForSelector(state ? '#top:not([hidden])' : '.welcome');
    return { ctx, page, errors };
  };
  const withSample = (opts) => open(opts, sampleDoc());
  const dayHeading = (page, ymd) => page.textContent('#dh-' + ymd + ' .dd');

  await test('first run: welcome screen, nothing saved, nothing in the address, exact sample button, screenshots', async () => {
    const { page, errors } = await open();
    assert.ok(await page.isVisible('text=Fill in a sample week')); eq(await page.textContent('[data-act=sample]'), 'Fill in a sample week');
    eq(await page.isHidden('#nav'), true); eq(await page.isHidden('#top'), true);
    assert.ok((await page.title()).startsWith("Who's Where")); assert.ok(await page.textContent('.tagline') .then(t => /group-chat scroll/.test(t)));
    eq(Object.keys(await ls(page)).filter(k => k !== 'whoswhere.probe').length, 0, 'opening writes nothing');
    assert.ok(await page.$('[data-restore]'), 'restore link is on the first screen');
    assert.ok(await page.$('[data-act=add-person][data-role=player]'));
    await shot(page, '01-welcome-390'); eq(await overflow(page), 0);
    await page.setViewportSize({ width: 320, height: 640 }); eq(await overflow(page), 0, 'welcome at 320'); await shot(page, '01-welcome-320');
    await page.setViewportSize({ width: 768, height: 1024 }); eq(await overflow(page), 0); await shot(page, '01-welcome-768');
    eq(await page.evaluate(() => location.search + location.hash), '', 'no data in the address');
    deq(errors, []); await page.context().close();
  });

  await test('sample week: opens on the first week with a problem; conflict, missing driver and unclaimed snack all show', async () => {
    const { page, errors } = await open();
    await page.click('[data-act=sample]'); await page.waitForSelector('#top:not([hidden])');
    eq(await page.textContent('#view-title'), 'Nov 8 – 14, 2026', 'Saturday Nov 7: the first problem is Tue Nov 10, next week');
    assert.ok(await page.isVisible('[data-act=go-today]'), 'there is a way back to today');
    eq(await page.$$eval('.ev.bad', e => e.length), 2, 'two events with the red badge'); eq(await page.$$eval('.ev .badge.bad', e => e.length), 2);
    assert.ok((await page.textContent('.ev.bad')).includes('Conflict'));
    eq((await page.textContent('.sum')).replace(/\s+/g, ' ').trim(), '!1 conflict, 1 event needs a driver, 1 snack job unclaimed. See what needs attention');
    assert.ok((await page.textContent('#dh-2026-11-11')).includes('Wednesday, Nov 11'));
    const game = await page.$('#dh-2026-11-11'); const sec = await game.evaluateHandle(h => h.closest('.day'));
    const txt = await sec.evaluate(s => s.textContent);
    assert.ok(/No driver yet/.test(txt) && /Snack: needs someone/.test(txt), txt);
    eq(await page.textContent('.nbadge'), '4', 'tab badge: 2 conflicts + 2 games in the next 14 days');
    eq(await page.getAttribute('#nav [data-tab=attention]', 'aria-label'), 'Attention, 4 to look at');
    assert.ok(/Sample week added with placeholder names/.test(await toastText(page)));
    await shot(page, '02-week-sample-390');
    const st = await data(page); eq(st.people.length, 4); eq(st.events.length, 23); eq(st.settings.weekStart, 0);
    await goToday(page); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026'); eq(await page.textContent('.wk-title .sub'), 'This week');
    assert.ok(await page.isVisible('.day.today'), 'today is marked'); eq(await page.textContent('.day.today .tag'), 'Today');
    eq((await page.textContent('.sum')).replace(/\s+/g, ' ').trim(), '✓All set. Every upcoming event this week has a driver and nothing clashes.', 'the Tuesday problem this week is already over');
    eq(await page.$$eval('.ev.bad', e => e.length), 0, 'past conflicts are not shown in red');
    deq(errors, []); await page.context().close();
  });

  await test('week view: every part of an event card, 12/24 hour, previous/next, Today, past-midnight event', async () => {
    const st = sampleDoc(); st.events.push(C.sanitizeEvent({ id: 'late1', title: 'Late game', type: 'game', date: '2026-11-07', start: '22:30', end: '00:30', place: 'Dome', kids: ['kid1'], driver: 'parentB', early: 15, drive: 20 }, { kids: { kid1: 1 }, adults: { parentB: 1 } }, {}));
    const { page, errors } = await open({}, st);
    eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026');
    const card = page.locator('.ev', { hasText: 'Tournament day' });
    const t = (await card.innerText()).replace(/\s+/g, ' ');
    assert.ok(/8:00 AM to 2:00 PM/.test(t) && /Tournament day/.test(t) && /Riverside Complex/.test(t) && /Kid 1/.test(t) && /Kid 2/.test(t) && /Parent A/.test(t) && /Parent B/.test(t), t);
    const late = (await page.locator('.ev', { hasText: 'Late game' }).innerText()).replace(/\s+/g, ' '); assert.ok(/10:30 PM to 12:30 AM next day/.test(late), late);
    await page.click('[data-act=step][data-n="1"]'); eq(await page.textContent('#view-title'), 'Nov 8 – 14, 2026'); eq(await page.$$eval('.wk-title .sub', e => e.length), 0, 'no "This week" label when away; a Today button instead'); assert.ok(await page.isVisible('[data-act=go-today]'));
    await page.click('[data-act=step][data-n="1"]'); eq(await page.textContent('#view-title'), 'Nov 15 – 21, 2026');
    await page.click('[data-act=step][data-n="-1"]'); await page.click('[data-act=step][data-n="-1"]'); await page.click('[data-act=step][data-n="-1"]'); eq(await page.textContent('#view-title'), 'Oct 25 – 31, 2026');
    eq(await page.$$eval('.ev', e => e.length), 0, 'a week with nothing in it'); eq(await page.$$eval('.none', e => e.length), 7);
    await goToday(page); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026');
    // 24-hour clock through settings
    await page.click('[data-act=settings]'); await page.click(sheetSel + ' [data-grp=h24][data-v="1"]');
    assert.ok(/16:30/.test(await page.locator('.ev', { hasText: 'Practice' }).first().innerText()), '24 hour clock on cards');
    const t24 = (await page.locator('.ev', { hasText: 'Tournament day' }).innerText()).replace(/\s+/g, ' '); assert.ok(/08:00 to 14:00/.test(t24), t24);
    deq(errors, []); await page.context().close();
  });

  await test('week view: a week that starts on Monday (settings) and weeks across the year end', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=settings]'); await page.click(sheetSel + ' [data-grp=weekStart][data-v="1"]'); await page.click(sheetSel + ' .x'); await noSheets(page);
    eq(await page.textContent('#view-title'), 'Nov 2 – 8, 2026'); eq((await page.$$eval('.day-h h3', h => h.map(x => x.textContent.slice(0, 3)))).join(), 'Mon,Tue,Wed,Thu,Fri,Sat,Sun');
    eq((await data(page)).settings.weekStart, 1);
    await page.evaluate(() => { window.WhosWhereApp.S.cursor = '2026-12-30'; window.WhosWhereApp.render(); });
    eq(await page.textContent('#view-title'), 'Dec 28, 2026 – Jan 3, 2027'); await page.click('[data-act=step][data-n="1"]'); eq(await page.textContent('#view-title'), 'Jan 4 – 10, 2027');
    deq(errors, []); await page.context().close();
  });

  await test('needs attention: counts, horizons, conflict card, fixes and the exact sentence', async () => {
    const { page, errors } = await withSample();
    await tab(page, 'attention');
    eq(await page.$$eval('.cf', e => e.length), 2); eq(await page.$$eval('article.need', e => e.length), 2); eq((await page.textContent('.sub-line')).trim(), '2 conflicts, 2 events that need someone.');
    eq((await page.textContent('.cf .cf-text')).trim(), 'Parent A has to leave by 5:05 PM to drive to Practice at Rec Center, but is still at Practice at Main Gym until 6:15 PM.');
    const fixes = await page.$$eval('article.cf', cs => Array.from(cs[0].querySelectorAll('.fixbtn')).map(x => x.textContent.trim()));
    assert.ok(fixes[0] === 'Assign Parent B to drive Practice at Rec Center' && fixes.includes('Ask someone else to drive to Practice at Rec Center') && fixes.includes('Edit Practice at Main Gym'), fixes.join(' | '));
    eq(await page.$$eval('.att-day', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join('|')), 'Tuesday, Nov 10|Wednesday, Nov 11|Tuesday, Nov 17|Wednesday, Nov 18');
    deq(await page.$$eval('article.need .issues li', l => l.slice(0, 2).map(x => x.textContent)), ['No driver yet', 'Snack job is unclaimed']);
    await shot(page, '03-attention-390', true);
    await page.click('[data-act=horizon][data-n="60"]'); eq(await page.$$eval('.cf', e => e.length), 3, 'Nov 10, 17, 24'); eq(await page.$$eval('article.need', e => e.length), 3, 'Nov 11, 18, 25');
    await page.click('[data-act=horizon][data-n="0"]'); eq(await page.$$eval('.cf', e => e.length), 3);
    await page.click('[data-act=horizon][data-n="14"]');
    // no driving needed / no snack needed
    await page.locator('article.need').first().locator('.fixbtn', { hasText: 'No driving needed' }).click(); await page.waitForTimeout(100);
    eq(await page.$$eval('article.need', e => e.length), 2); const t1 = await page.locator('article.need').first().innerText(); assert.ok(/Snack job is unclaimed/.test(t1) && !/No driver yet/.test(t1), t1);
    eq((await data(page)).events.find(e => e.title === 'Game' && e.date === '2026-11-11').driver, 'none');
    deq(errors, []); await page.context().close();
  });

  await test('one-tap fix: "Assign Parent B" clears the conflict, shows what happened, and Undo puts it back', async () => {
    const { page, errors } = await withSample();
    await tab(page, 'attention');
    await page.locator('article.cf').first().locator('.fixbtn', { hasText: 'Assign Parent B to drive Practice at Rec Center' }).click();
    await waitToast(page, /Parent B will drive to Practice at Rec Center/); await page.waitForTimeout(400); await shot(page, '20-toast-undo-390');
    eq(await page.$$eval('.cf', e => e.length), 1, 'one conflict left'); eq(await page.textContent('.nbadge'), '3');
    let st = await data(page); eq(evByTitle(st, 'Practice', '2026-11-10').find(e => e.place === 'Rec Center').driver, 'parentB'); eq(evByTitle(st, 'Practice', '2026-11-17').find(e => e.place === 'Rec Center').driver, 'parentA', 'other weeks untouched');
    await page.click('.toast .tbtn'); await waitToast(page, /Undone/);
    eq(await page.$$eval('.cf', e => e.length), 2); st = await data(page); eq(evByTitle(st, 'Practice', '2026-11-10').find(e => e.place === 'Rec Center').driver, 'parentA');
    // assign a driver to the game: the event leaves the list
    await page.locator('article.need').first().locator('.fixbtn', { hasText: 'Parent B drives' }).click(); await waitToast(page, /Parent B will drive to Game at Park Field 2/);
    st = await data(page); eq(evByTitle(st, 'Game', '2026-11-11')[0].driver, 'parentB'); const t2 = await page.locator('article.need').first().innerText(); assert.ok(/Snack job is unclaimed/.test(t2) && !/No driver yet/.test(t2), t2);
    // "ask someone else" marks needs a ride
    await page.locator('article.cf').first().locator('.fixbtn', { hasText: 'Ask someone else to drive' }).click(); await waitToast(page, /needs someone to drive/);
    st = await data(page); eq(evByTitle(st, 'Practice', '2026-11-10').find(e => e.place === 'Rec Center').driver, 'ride');
    assert.ok((await page.$$eval('article.need .issues li', l => l.map(x => x.textContent))).includes('Needs a ride'));
    deq(errors, []); await page.context().close();
  });

  await test('kid conflict: card, fix "take Kid 1 off", and the red marker on the month grid', async () => {
    const st = sampleDoc(); const g = C.sanitizeEvent({ id: 'kc1x', title: 'Clinic', type: 'other', date: '2026-11-11', start: '18:30', end: '19:30', kids: ['kid1'], place: 'Hall', driver: 'parentB' }, { kids: { kid1: 1 }, adults: { parentB: 1 } }, {}); st.events.push(g);
    const { page, errors } = await open({}, st);
    await tab(page, 'attention');
    const kidCard = page.locator('.cf', { hasText: 'Kid 1 is booked twice' }); eq(await kidCard.count(), 1);
    assert.ok(/Game at Park Field 2 \(6:00–7:30 PM\) overlaps Clinic at Hall \(6:30–7:30 PM\)/.test(await kidCard.locator('.cf-text').textContent()), await kidCard.locator('.cf-text').textContent());
    await tab(page, 'month'); await page.click('[data-act=step][data-n="1"]'); eq(await page.textContent('#view-title'), 'December 2026'); await page.click('[data-act=step][data-n="-1"]');
    eq(await page.$$eval('.mcell[data-date="2026-11-11"] .cfmark', e => e.length), 1); assert.ok(/conflict/.test(await page.getAttribute('.mcell[data-date="2026-11-11"]', 'aria-label')));
    await tab(page, 'attention');
    await page.click('.cf:has-text("Kid 1 is booked twice") .fixbtn:has-text("Take Kid 1 off Clinic")'); await waitToast(page, /Take Kid 1 off Clinic/);
    eq(await page.locator('.cf', { hasText: 'Kid 1 is booked twice' }).count(), 0); deq((await data(page)).events.find(e => e.id === 'kc1x').kids, []);
    deq(errors, []); await page.context().close();
  });

  await test('month: dots per kid, conflict marker, today ring, tap a day opens it, add on that day', async () => {
    const { page, errors } = await withSample();
    await tab(page, 'month');
    eq(await page.textContent('#view-title'), 'November 2026'); eq(await page.textContent('.wk-title .sub'), 'This month'); eq(await page.$$eval('.mrow', r => r.length), 5); eq(await page.$$eval('.mcell', r => r.length), 35);
    eq((await page.$$eval('.mh', h => h.map(x => x.textContent)).then(a => a.join())), 'Sun,Mon,Tue,Wed,Thu,Fri,Sat'); eq(await page.$eval('.mh', h => getComputedStyle(h).textTransform), 'uppercase');
    eq(await page.$$eval('.mcell.today', c => c.length), 1); eq(await page.getAttribute('.mcell.today', 'data-date'), '2026-11-07');
    eq(await page.$$eval('.mcell[data-date="2026-11-10"] .dots i', d => d.length), 2, 'Tuesday: Kid 1 and Kid 2'); eq(await page.$$eval('.mcell[data-date="2026-11-09"] .dots i', d => d.length), 1);
    eq(await page.$$eval('.mcell[data-date="2026-11-10"] .dots i', d => d.map(x => getComputedStyle(x).backgroundColor).join('|')), 'rgb(58, 160, 255)|rgb(255, 159, 67)', 'Kid 1 blue, Kid 2 orange');
    eq(await page.$$eval('.mcell[data-date="2026-11-01"] .dots i', d => d.length), 1, 'Sunday game: Kid 2'); eq(await page.$$eval('.mcell[data-date="2026-11-08"] .dots i', d => d.length), 0);
    eq(await page.$$eval('.mcell.out', c => c.length), 5, 'five days of December fill the last row');
    eq(await page.getAttribute('.mcell[data-date="2026-11-10"]', 'aria-label'), 'Tuesday, November 10, 2026: 2 events, 1 conflict'); eq(await page.getAttribute('.mcell[data-date="2026-11-12"]', 'aria-label'), 'Thursday, November 12, 2026: 1 event');
    eq(await page.getAttribute('.mcell[data-date="2026-11-13"]', 'aria-label'), 'Friday, November 13, 2026: nothing planned');
    await shot(page, '04-month-390');
    await page.click('.mcell[data-date="2026-11-10"]'); await page.waitForSelector(sheetSel);
    eq(await page.textContent(sheetSel + ' h2'), 'Tuesday, Nov 10'); eq(await page.$$eval(sheetSel + ' .ev', e => e.length), 2); await shot(page, '05-day-sheet-390');
    await page.click(sheetSel + ' .ev:first-child'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); eq(await sheetCount(page), 2, 'detail stacks on the day');
    await page.keyboard.press('Escape'); await settle(page); eq(await sheetCount(page), 1);
    await page.click(sheetSel + ' [data-act=add-on]'); await page.waitForSelector('#f-date'); eq(await page.inputValue('#f-date'), '2026-11-10'); await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); await settle(page);
    await page.click('.mcell[data-date="2026-11-13"]'); await page.waitForSelector(sheetSel); assert.ok(/Nothing planned this day/.test(await page.textContent(sheetSel)));
    deq(errors, []); await page.context().close();
  });

  await test('person filter dims everything that is not about that person', async () => {
    const { page, errors } = await withSample();
    await goToday(page); await page.click('[data-act=step][data-n="1"]');
    const total = await page.$$eval('.ev', e => e.length);
    eq(await page.$$eval('.ev.dim', e => e.length), 0);
    await page.click('[data-act=filter][data-id=kid1]'); eq(await page.getAttribute('[data-act=filter][data-id=kid1]', 'aria-pressed'), 'true'); eq(await page.getAttribute('[data-act=filter][data-id=""]', 'aria-pressed'), 'false');
    const dimmed = await page.$$eval('.ev.dim', e => e.length);
    // Nov 8-14 has: Mon practice (Kid 1), Tue practice (Kid 1), Tue practice (Kid 2), Wed game (Kid 1), Thu practice (Kid 2) = 5. Kid 1 is in 3 of them.
    eq(total, 5); eq(dimmed, 2); eq(await page.$$eval('.ev:not(.dim)', e => e.length), 3, 'Kid 1: Mon, Tue, Wed');
    await page.click('[data-act=filter][data-id=parentB]'); const b = await page.$$eval('.ev:not(.dim)', e => e.length); eq(b, 2, 'Parent B drives on Mon and Thu');
    await tab(page, 'month'); eq(await page.$$eval('.mcell[data-date="2026-11-10"] .dots i.dim', d => d.length), 2, 'month dots dim too');
    await tab(page, 'people'); eq(await page.$$eval('.filters', f => f.length), 0, 'no filter bar on the People tab');
    await tab(page, 'week'); await page.click('[data-act=filter][data-id=""]'); eq(await page.$$eval('.ev.dim', e => e.length), 0);
    deq(errors, []); await page.context().close();
  });

  /* ---------- set up a family and add events by clicking ---------- */
  await test('flow: set up my own family, add an event by clicking, see it, it survives a reload', async () => {
    const { page, errors } = await open();
    await page.click('[data-act=add-person][data-role=player]'); await page.waitForSelector('#p-name');
    await page.click(sheetSel + ' [data-act=save-person]'); assert.ok(/Type a name/.test(await page.textContent('#p-err')), 'name is required');
    await page.fill('#p-name', 'Player 1'); await page.click(sheetSel + ' [data-grp=pcolor][data-v="#ff9f43"]'); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    await page.waitForSelector('#top:not([hidden])'); assert.ok(/Add more people, then your first event/.test(await toastText(page)));
    assert.ok(await page.isVisible('text=No events yet'));
    await tab(page, 'people'); await page.click('[data-act=add-person][data-role=adult]'); await page.fill('#p-name', 'Grown-up 1'); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    await page.click('[data-act=add-person][data-role=adult]'); await page.fill('#p-name', 'Grown-up 2'); await page.keyboard.press('Enter'); await noSheets(page);
    eq(await page.$$eval('.list-btn', b => b.length), 3);
    let st = await data(page); eq(st.people.map(p => p.name + ':' + p.role + ':' + p.color).join(), 'Player 1:player:#ff9f43,Grown-up 1:adult:#3aa0ff,Grown-up 2:adult:#2fd08a', 'first unused color is chosen for each new person');
    await tab(page, 'week'); await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title');
    await shot(page, '06-form-top-390'); eq(await page.inputValue('#f-date'), TODAY, 'new events start on today'); eq(await page.inputValue('#f-start'), '17:00'); eq(await page.inputValue('#f-end'), '18:00'); eq(await page.inputValue('#f-early'), '0'); eq(await page.inputValue('#f-drive'), '15');
    await page.click(sheetSel + ' [data-grp=type][data-v=game]'); eq(await page.getAttribute('#f-title', 'placeholder'), 'Game');
    await page.fill('#f-title', 'Home opener'); await page.fill('#f-date', '2026-11-09'); await page.fill('#f-start', '18:30'); await page.fill('#f-end', '20:00'); await page.fill('#f-place', 'Field 2'); await page.fill('#f-addr', '1 Example Rd, Town');
    await page.click(sheetSel + ' [data-grp=kids][data-v]'); await page.click(sheetSel + ' [data-grp=driver]:has-text("Grown-up 1")'); await page.click(sheetSel + ' [data-grp=snack]:has-text("Needs someone")');
    await page.fill('#f-early', '20'); await page.fill('#f-drive', '25'); await page.fill('#f-notes', 'Bring water');
    await shot(page, '06-form-390');
    await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    eq(await page.textContent('#view-title'), 'Nov 8 – 14, 2026', 'jumps to the week of the new event');
    const card = (await page.locator('.ev', { hasText: 'Home opener' }).innerText()).replace(/\s+/g, ' ');
    assert.ok(/6:30 PM to 8:00 PM/.test(card) && /Field 2/.test(card) && /Player 1/.test(card) && /Grown-up 1/.test(card) && /Snack: needs someone/.test(card), card);
    st = await data(page); eq(st.events.length, 1); const e = st.events[0];
    deq([e.title, e.type, e.date, e.start, e.end, e.place, e.address, e.kids.length, e.driver === st.people[1].id, e.snack, e.early, e.drive, e.notes, e.series], ['Home opener', 'game', '2026-11-09', 1110, 1200, 'Field 2', '1 Example Rd, Town', 1, true, 'open', 20, 25, 'Bring water', '']);
    await page.reload(); await page.waitForSelector('#top:not([hidden])'); await page.click('[data-act=step][data-n="1"]'); await page.waitForSelector('.ev'); eq((await page.textContent('.ev .ev-title')).trim(), '🏟️ Home opener');
    // open the card: detail shows everything, with a directions link that is a plain https link
    await page.click('.ev'); await page.waitForSelector(sheetSel);
    const d = await page.textContent(sheetSel);
    ['Monday, November 9, 2026', '6:30–8:00 PM', '1 hr 30 min', 'Arrive by 6:10 PM (20 min early)', 'Leave home by 5:45 PM (about 25 min drive)', 'Field 2', '1 Example Rd, Town', 'Player 1', 'Grown-up 1', 'Needs someone', 'Bring water'].forEach(s => assert.ok(d.includes(s), 'detail has "' + s + '": ' + d));
    eq(await page.getAttribute(sheetSel + ' a.dirbtn', 'href'), 'https://maps.google.com/?q=Field%202%2C%201%20Example%20Rd%2C%20Town'); eq(await page.getAttribute(sheetSel + ' a.dirbtn', 'target'), '_blank'); assert.ok((await page.getAttribute(sheetSel + ' a.dirbtn', 'rel')).includes('noopener'));
    await shot(page, '07-detail-390');
    deq(errors, []); await page.context().close();
  });

  await test('form: validation messages, times past midnight, quick length, defaults from Settings, copy to another day', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=settings]'); await page.fill('#s-drive', '30'); await page.fill('#s-early', '10'); await page.click(sheetSel + ' .x'); await noSheets(page);
    await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title'); eq(await page.inputValue('#f-drive'), '30'); eq(await page.inputValue('#f-early'), '10');
    await page.fill('#f-date', ''); await page.click(sheetSel + ' [data-act=save-ev]'); eq((await page.textContent('#f-err')).trim(), 'Pick a date for the event.');
    await page.fill('#f-date', '2026-11-12'); await page.fill('#f-start', ''); await page.click(sheetSel + ' [data-act=save-ev]'); eq((await page.textContent('#f-err')).trim(), 'Set a start time and an end time.');
    await page.fill('#f-start', '17:00'); await page.fill('#f-end', '17:00'); await page.click(sheetSel + ' [data-act=save-ev]'); eq((await page.textContent('#f-err')).trim(), 'The end time can’t be the same as the start time.');
    await page.click(sheetSel + ' [data-act=len][data-n="90"]'); eq(await page.inputValue('#f-end'), '18:30'); await page.fill('#f-start', '23:00'); await page.click(sheetSel + ' [data-act=len][data-n="120"]'); eq(await page.inputValue('#f-end'), '01:00');
    assert.ok(await page.isVisible('#f-cross'), 'the "ends after midnight" note shows');
    await page.click(sheetSel + ' [data-grp=repeat][data-v=weekly]'); await page.fill('#f-count', '1'); await page.click(sheetSel + ' [data-act=save-ev]'); assert.ok(/between 2 and 52/.test(await page.textContent('#f-err')));
    await page.click(sheetSel + ' [data-grp=repend][data-v=until]'); await page.fill('#f-until', '2026-11-01'); await page.click(sheetSel + ' [data-act=save-ev]'); assert.ok(/last day for the repeat/.test(await page.textContent('#f-err')));
    await page.click(sheetSel + ' [data-grp=repeat][data-v=""]'); await page.fill('#f-title', 'Night clinic'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    const e = (await data(page)).events.find(x => x.title === 'Night clinic'); deq([e.start, e.end, e.date, e.type], [1380, 60, '2026-11-12', 'practice']);
    const card = (await page.locator('.ev', { hasText: 'Night clinic' }).innerText()).replace(/\s+/g, ' '); assert.ok(/11:00 PM to 1:00 AM next day/.test(card), card);
    // an empty title becomes the type's name
    await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title'); await page.click(sheetSel + ' [data-grp=type][data-v=tournament]'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    assert.ok((await data(page)).events.some(x => x.title === 'Tournament'));
    // copy to another day: opens a prefilled form for the next day
    await page.click('.ev:has-text("Night clinic")'); await page.click(sheetSel + ' [data-act=dup-ev]'); await page.waitForSelector('#f-title'); eq(await page.inputValue('#f-title'), 'Night clinic'); eq(await page.inputValue('#f-date'), '2026-11-13'); eq(await page.inputValue('#f-start'), '23:00');
    assert.ok(/Add an event/.test(await page.textContent(sheetSel + ' h2')));
    await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page); eq((await data(page)).events.filter(x => x.title === 'Night clinic').length, 2);
    deq(errors, []); await page.context().close();
  });

  await test('form: live "this would clash" warning while typing, and a heads-up toast when you save a clash', async () => {
    const { page, errors } = await withSample();
    await goToday(page); await page.click('[data-act=step][data-n="1"]');
    await page.click('.day:has(#dh-2026-11-09) [data-act=add-on]'); await page.waitForSelector('#f-title'); eq(await page.inputValue('#f-date'), '2026-11-09');
    eq(await page.$$eval('#f-preview .warnbox', e => e.length), 0, 'nothing to say yet');
    await page.fill('#f-place', 'Other Gym'); await page.fill('#f-start', '17:00'); await page.fill('#f-end', '18:00'); await page.click(sheetSel + ' [data-grp=kids][data-v=kid1]');
    await page.waitForSelector('#f-preview .warnbox'); const w = await page.textContent('#f-preview'); assert.ok(/Kid 1 is booked twice: Practice at Main Gym \(4:30–5:30 PM\) overlaps Practice at Other Gym \(5:00–6:00 PM\)/.test(w), w);
    await shot(page, '08-form-warning-390');
    await page.fill('#f-start', '17:30'); await page.fill('#f-end', '18:30'); await page.fill('#f-early', '0'); await page.waitForTimeout(50); eq(await page.$$eval('#f-preview .warnbox', e => e.length), 0, 'start 5:30 = the other ends 5:30: fine');
    await page.fill('#f-early', '5'); await page.waitForSelector('#f-preview .warnbox');
    await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page); await waitToast(page, /it clashes with something/);
    deq(errors, []); await page.context().close();
  });

  await test('weekly repeat by clicking: make 4, edit just one, edit all later, delete one, delete all later', async () => {
    const { page, errors } = await open({}, { people: [{ id: 'kid1', name: 'Kid 1', role: 'player', color: '#3aa0ff' }, { id: 'parA', name: 'Parent A', role: 'adult', color: '#2fd08a' }], events: [], series: [], settings: C.sanitizeSettings({}) });
    const dates = async () => (await data(page)).events.map(e => e.date + '@' + e.start).sort().join();
    await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title'); await page.fill('#f-title', 'Practice'); await page.fill('#f-date', '2026-11-10');
    await page.click(sheetSel + ' [data-grp=repeat][data-v=weekly]'); await page.fill('#f-count', '4'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    await waitToast(page, /4 events added/); eq(await dates(), '2026-11-10@1020,2026-11-17@1020,2026-11-24@1020,2026-12-01@1020');
    let st = await data(page); eq(new Set(st.events.map(e => e.series)).size, 1); assert.ok(st.events[0].series); eq(st.series.length, 1);
    // edit just the second one: later start time and place
    await page.click('[data-act=step][data-n="1"]'); await page.click('.ev'); assert.ok(/Every week until Tue, Dec 1 \(2 more after this one\)/.test(await page.textContent(sheetSel)));
    await page.click(sheetSel + ' [data-act=edit-ev]'); await page.waitForSelector('#f-title'); assert.ok(/Weekly series/.test(await page.textContent(sheetSel))); eq(await page.inputValue('#f-until'), '2026-12-01');
    await page.fill('#f-start', '18:00'); await page.fill('#f-end', '19:00'); await page.fill('#f-place', 'Gym B'); await page.click(sheetSel + ' [data-act=save-ev]');
    await page.waitForSelector('[data-act=save-scope]'); assert.ok(/Just this event/.test(await page.textContent('[data-act=save-scope][data-scope=one]')));
    await shot(page, '09-series-scope-390');
    await page.click('[data-act=save-scope][data-scope=one]'); await noSheets(page);
    eq(await dates(), '2026-11-10@1020,2026-11-17@1080,2026-11-24@1020,2026-12-01@1020'); st = await data(page); eq(st.events.filter(e => e.place === 'Gym B').length, 1);
    // edit this and all later from Nov 24: change to Wednesday 7:30 PM, until Dec 16
    await page.click('[data-act=step][data-n="1"]'); await page.click('.ev'); await page.click(sheetSel + ' [data-act=edit-ev]'); await page.waitForSelector('#f-title');
    await page.fill('#f-date', '2026-11-25'); await page.fill('#f-start', '19:30'); await page.fill('#f-end', '20:30'); await page.fill('#f-until', '2026-12-16'); await page.fill('#f-title', 'Practice (new time)');
    await page.click(sheetSel + ' [data-act=save-ev]'); await page.waitForSelector('[data-act=save-scope]'); await page.click('[data-act=save-scope][data-scope=future]'); await noSheets(page);
    eq(await dates(), '2026-11-10@1020,2026-11-17@1080,2026-11-25@1170,2026-12-02@1170,2026-12-09@1170,2026-12-16@1170');
    st = await data(page); eq(st.events.filter(e => e.title === 'Practice (new time)').length, 4); eq(st.events.filter(e => e.title === 'Practice').length, 2, 'earlier ones are left alone'); eq(new Set(st.events.map(e => e.series)).size, 1); eq(st.events.find(e => e.date === '2026-11-17').place, 'Gym B');
    // delete just one (Dec 2), then delete this and all later (from Dec 9)
    await page.evaluate(() => { window.WhosWhereApp.S.cursor = '2026-12-02'; window.WhosWhereApp.render(); }); await page.click('.ev'); await page.click(sheetSel + ' [data-act=del-ev]'); await page.waitForSelector('[data-act=do-del]');
    assert.ok(/part of a weekly series/.test(await page.textContent('.sheet-wrap.open:last-child'))); await shot(page, '10-delete-series-390');
    await page.click('[data-act=do-del][data-scope=one]'); await waitToast(page, /Event deleted/); eq(await dates(), '2026-11-10@1020,2026-11-17@1080,2026-11-25@1170,2026-12-09@1170,2026-12-16@1170');
    st = await data(page); deq(st.series[0].skip, ['2026-12-02'], 'a deleted date is remembered');
    await page.click('.toast .tbtn'); eq((await dates()).split(',').length, 6, 'Undo brings it back'); st = await data(page); deq(st.series[0].skip, [], 'and forgets the skip');
    await page.click('[data-act=step][data-n="1"]'); await page.click('.ev'); await page.click(sheetSel + ' [data-act=del-ev]'); await page.waitForSelector('[data-act=do-del]'); await page.click('[data-act=do-del][data-scope=future]');
    await waitToast(page, /this and all later/); eq(await dates(), '2026-11-10@1020,2026-11-17@1080,2026-11-25@1170,2026-12-02@1170');
    // deleting a plain event asks first
    await page.evaluate(() => { window.WhosWhereApp.S.cursor = '2026-11-10'; window.WhosWhereApp.render(); }); await page.click('.ev'); await page.click(sheetSel + ' [data-act=del-ev]'); await page.waitForSelector('[data-act=do-del]'); eq(await page.$$eval('[data-act=do-del]', b => b.length), 2, 'one / this and all later');
    deq(errors, []); await page.context().close();
  });

  await test('weekly repeat: make a series "until a date" from the form and add a repeat to an existing plain event', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title'); await page.fill('#f-title', 'Film night'); await page.fill('#f-date', '2026-12-03'); await page.click(sheetSel + ' [data-grp=repeat][data-v=weekly]'); await page.click(sheetSel + ' [data-grp=repend][data-v=until]');
    assert.ok(await page.isHidden('#rep-count') && await page.isVisible('#rep-until')); await page.fill('#f-until', '2026-12-17'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    eq((await data(page)).events.filter(e => e.title === 'Film night').map(e => e.date).join(), '2026-12-03,2026-12-10,2026-12-17');
    // existing non-series event gets a repeat
    await page.evaluate(() => { window.WhosWhereApp.S.cursor = '2026-11-06'; window.WhosWhereApp.render(); }); await page.click('.ev:has-text("Team pizza night")'); await page.click(sheetSel + ' [data-act=edit-ev]'); await page.waitForSelector('#f-title');
    await page.click(sheetSel + ' [data-grp=repeat][data-v=weekly]'); await page.fill('#f-count', '3'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    eq((await data(page)).events.filter(e => e.title === 'Team pizza night').map(e => e.date).join(), '2026-11-06,2026-11-13,2026-11-20');
    deq(errors, []); await page.context().close();
  });

  await test('people: edit name/role/color, deleting someone explains what changes and removes them everywhere', async () => {
    const { page, errors } = await withSample();
    await tab(page, 'people'); eq(await page.$$eval('.list-btn', b => b.length), 4); await shot(page, '11-people-390');
    const rowText = (await page.textContent('[data-act=edit-person][data-id=parentA]')).replace(/\s+/g, ' '); assert.ok(/Parent A Grown-up · \d+ upcoming events/.test(rowText), rowText);
    await page.click('[data-act=edit-person][data-id=kid1]'); await page.waitForSelector('#p-name'); eq(await page.inputValue('#p-name'), 'Kid 1'); await page.fill('#p-name', 'Player One'); await page.click(sheetSel + ' [data-grp=pcolor][data-v="#ff7eb6"]'); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    let st = await data(page); eq(st.people[0].name, 'Player One'); eq(st.people[0].color, '#ff7eb6');
    await tab(page, 'week'); const wv = await page.textContent('#view'); assert.ok(wv.includes('Player One') && !wv.includes('Kid 1'), 'the new name shows on the week');
    const pre = (await data(page)).events, preB = pre.filter(e => e.driver === 'parentB').length, preNoDriver = pre.filter(e => e.driver === '').length, preSnackOpen = pre.filter(e => e.snack === 'open').length, preBSnack = pre.filter(e => e.snack === 'parentB').length;
    assert.ok(preB > 5 && preBSnack >= 1, 'Parent B has real jobs in the sample');
    await tab(page, 'people'); await page.click('[data-act=edit-person][data-id=parentB]'); await page.click(sheetSel + ' [data-act=del-person]'); await page.waitForSelector('.confirm');
    const msg = await page.textContent('.sheet-wrap.open:last-child .sh-body'); assert.ok(new RegExp(preB + ' events will go back to needing a driver').test(msg) && /snack job will go back to being unclaimed/.test(msg), msg);
    await page.click('.confirm [data-ok]'); await noSheets(page);
    st = await data(page); eq(st.people.length, 3); assert.ok(st.events.every(e => e.driver !== 'parentB' && e.snack !== 'parentB')); eq(st.events.filter(e => e.snack === 'open').length, preSnackOpen + preBSnack, 'the snack jobs Parent B had are unclaimed again');
    eq(st.events.filter(e => e.driver === '').length, preNoDriver + preB, 'the drives Parent B had are open again');
    // kid removal takes them off events
    await page.click('[data-act=edit-person][data-id=kid2]'); await page.click(sheetSel + ' [data-act=del-person]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    st = await data(page); assert.ok(st.events.every(e => !e.kids.includes('kid2')));
    // role change
    await page.click('[data-act=edit-person][data-id=parentA]'); await page.click(sheetSel + ' [data-grp=prole][data-v=player]'); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    st = await data(page); eq(st.people.find(p => p.id === 'parentA').role, 'player'); assert.ok(st.events.every(e => e.driver !== 'parentA' && e.snack !== 'parentA'), 'a player cannot hold a driving or snack job');
    deq(errors, []); await page.context().close();
  });

  await test('people can be added from inside the event form and are picked straight away', async () => {
    const { page, errors } = await open({}, { people: [{ id: 'kid1', name: 'Kid 1', role: 'player', color: '#3aa0ff' }], events: [], series: [], settings: C.sanitizeSettings({}) });
    await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title'); assert.ok(/No grown-ups yet/.test(await page.textContent('#g-driver')));
    await page.click('#g-driver [data-act=add-person]'); await page.waitForSelector('#p-name'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); eq(await sheetCount(page), 2); eq(await page.textContent('.sheet-wrap.open:last-child h2'), 'Add a grown-up');
    await page.fill('#p-name', 'Helper'); await page.click('.sheet-wrap.open:last-child [data-act=save-person]'); await settle(page);
    eq(await sheetCount(page), 1); eq(await page.getAttribute('#g-driver [data-v]:has-text("Helper")', 'aria-pressed'), 'true', 'new grown-up is picked as the driver');
    deq(errors, []); await page.context().close();
  });

  await test('settings: first day of week, clock, defaults; "Help & about" is plain language with the version', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await shot(page, '12-settings-390');
    eq(await page.getAttribute(sheetSel + ' [data-grp=weekStart][data-v="0"]', 'aria-pressed'), 'true'); eq(await page.getAttribute(sheetSel + ' [data-grp=h24][data-v="0"]', 'aria-pressed'), 'true');
    await page.fill('#s-drive', '999'); await page.dispatchEvent('#s-drive', 'change'); eq(await page.inputValue('#s-drive'), '240', 'clamped'); await page.fill('#s-early', '-4'); await page.dispatchEvent('#s-early', 'change'); eq(await page.inputValue('#s-early'), '0');
    await page.fill('#s-drive', '20'); await page.dispatchEvent('#s-drive', 'change');
    let st = await data(page); deq(st.settings, { weekStart: 0, h24: false, driveMin: 20, earlyMin: 0 });
    await page.click(sheetSel + ' [data-act=about]'); await page.waitForSelector(sheetSel + ' .ver'); const t = await page.textContent(sheetSel);
    assert.ok(t.includes("Who's Where v1"), 'version shown'); assert.ok(/saved on this phone only/.test(t) && /Clearing the browser/.test(t) && /Two events at the same place never clash/.test(t)); await shot(page, '13-about-390');
    deq(errors, []); await page.context().close();
  });

  /* ---------- sharing ---------- */
  await test('calendar files: one event, this week, everything: all parse back and match what is on screen', async () => {
    const { page, errors } = await withSample();
    // one event
    await page.click('.ev:has-text("Tournament day")'); const one = await downloadText(page, sheetSel + ' [data-act=ev-ics]');
    assert.ok(/^whoswhere-tournament-day-2026-11-07\.ics$/.test(one.name), one.name); let cal = parseICS(one.text); const v = cal.kids.filter(k => k.name === 'VEVENT'); eq(v.length, 1);
    eq(v[0].props.SUMMARY, 'Tournament day'); eq(v[0].props.DTSTART, '20261107T080000'); eq(v[0].props.DTEND, '20261107T140000'); eq(v[0].props.LOCATION, 'Riverside Complex, 100 Example Rd'); assert.ok(/Driver: Parent A\nSnack: Parent B\nArrive by 7:15 AM \(45 min early\)\nLeave by 6:40 AM \(about 35 min drive\)/.test(v[0].props.DESCRIPTION), v[0].props.DESCRIPTION);
    eq(v[0].kids.find(k => k.name === 'VALARM').props.TRIGGER, '-PT60M'); await page.keyboard.press('Escape'); await settle(page);
    // this week (Nov 1-7: 8 events)
    const wk = await downloadText(page, '[data-act=week-ics]'); eq(wk.name, 'whoswhere-week-2026-11-01.ics'); cal = parseICS(wk.text); eq(cal.kids.filter(k => k.name === 'VEVENT').length, 8);
    const dts = cal.kids.map(k => k.props.DTSTART.slice(0, 8)); assert.ok(dts.every(d => d >= '20261101' && d <= '20261107'), dts.join()); assert.ok(cal.kids.every(k => /^2026110[1-7]T\d{6}$/.test(k.props.DTSTART)));
    // everything, from settings
    await page.click('[data-act=settings]'); const all = await downloadText(page, sheetSel + ' [data-act=all-ics]'); eq(all.name, 'whoswhere-everything.ics'); cal = parseICS(all.text); eq(cal.kids.filter(k => k.name === 'VEVENT').length, 23);
    eq(new Set(cal.kids.map(k => k.props.UID)).size, 23); assert.ok(cal.kids.every(k => k.kids[0].name === 'VALARM'));
    await page.keyboard.press('Escape'); await settle(page);
    // an empty week says so instead of downloading an empty file
    await page.click('[data-act=step][data-n="-1"]'); await page.click('[data-act=step][data-n="-1"]'); await page.click('[data-act=step][data-n="-1"]'); await page.click('[data-act=week-ics]'); await waitToast(page, /Nothing is planned this week/);
    deq(errors, []); await page.context().close();
  });

  await test('copy this week as text: clipboard has the exact agenda; a phone without clipboard access gets a select-all box', async () => {
    const { ctx, page, errors } = await withSample({ ctx: { permissions: ['clipboard-read', 'clipboard-write'] } });
    await goToday(page); await page.click('[data-act=copy-week]'); await waitToast(page, /Copied/);
    const text = await page.evaluate(() => navigator.clipboard.readText()); const s = sampleDoc();
    eq(text, C.weekText(s.events, s.people, '2026-11-01', false)); assert.ok(text.startsWith('Week of Nov 1 – 7, 2026\n\nSun, Nov 1\n• 1:00–2:30 PM Game @ Park Field 1 (arrive 12:40 PM)'));
    await ctx.close();
    const t2 = await withSample(); await t2.page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
    await t2.page.goto(srv.url); await t2.page.waitForSelector('.ev'); await t2.page.click('[data-act=copy-week]'); await t2.page.waitForSelector(sheetSel + ' #copybox'); const v = await t2.page.inputValue('#copybox'); assert.ok(v.startsWith('Week of Nov 8 – 14, 2026') || v.startsWith('Week of Nov 1 – 7, 2026'));
    eq(await t2.page.$eval('#copybox', e => e.readOnly), true); await shot(t2.page, '14-copy-fallback-390');
    deq(t2.errors, []); deq(errors, []); await t2.ctx.close();
  });

  await test('print: the week becomes a plain black-on-white page (stylesheet checked in print mode)', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=step][data-n="1"]');
    await page.evaluate(() => { window.__printed = null; window.__keepPrint = true; window.print = () => { window.__printed = document.getElementById('printbox').innerText; window.__cls = document.body.className; }; });
    await page.click('[data-act=print-week]'); const p = await page.evaluate(() => window.__printed);
    assert.ok(/Who’s Where: week of Nov 8 – 14, 2026/.test(p) && /Tuesday, Nov 10/.test(p) && /Practice/.test(p) && /Rec Center/.test(p) && /Drive: needed/.test(p) && /Snack: needed/.test(p), p);
    eq(await page.evaluate(() => window.__cls), 'print-week');
    await page.emulateMedia({ media: 'print' });
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('app')).display), 'none', 'the app chrome is hidden when printing');
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('printbox')).display), 'block'); eq(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)'); eq(await page.evaluate(() => getComputedStyle(document.querySelector('#printbox h1')).color), 'rgb(0, 0, 0)');
    await shot(page, '15-print-390'); await page.emulateMedia({ media: 'screen' });
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('printbox')).display), 'none', 'on screen the print page is never visible');
    await page.evaluate(() => { window.__keepPrint = false; document.body.classList.remove('print-week'); }); eq(await page.evaluate(() => getComputedStyle(document.getElementById('printbox')).display), 'none');
    // the browser's own Print menu works too
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); assert.ok((await page.evaluate(() => document.getElementById('printbox').innerText)).includes('week of')); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); eq(await page.evaluate(() => document.getElementById('printbox').innerHTML), '');
    deq(errors, []); await page.context().close();
  });

  /* ---------- backup and restore ---------- */
  await test('backup -> clear everything -> restore round trip; the confirm sheet says what will be replaced', async () => {
    const { page, errors } = await withSample();
    await page.click('[data-act=settings]'); assert.ok(/You haven’t made a backup yet/.test(await page.textContent(sheetSel)));
    const bk = await downloadText(page, sheetSel + ' [data-act=dl-backup]'); eq(bk.name, 'whoswhere-backup-2026-11-07.json'); const obj = JSON.parse(bk.text); eq(obj.app, 'whoswhere'); eq(obj.events.length, 23); eq(obj.people.length, 4);
    deq(obj.events, (await data(page)).events); assert.ok(/Backup file created/.test(await toastText(page))); eq((await ls(page))['whoswhere.meta'].includes('"lastBackup":"2026-11-07"'), true);
    await page.click(sheetSel + ' [data-act=clear-all]'); await page.waitForSelector('.confirm'); await page.click('.confirm [data-ok]'); await page.waitForSelector('.welcome'); await noSheets(page);
    eq(await page.textContent('[data-act=sample]'), 'Fill in a sample week'); eq(await data(page).catch(() => null), null, 'data erased'); eq((await ls(page))['whoswhere.meta'], undefined, 'meta erased');
    // restore from the first screen
    await page.setInputFiles('.welcome [data-restore]', bk.path); await page.waitForSelector('.confirm');
    const msg = await page.textContent('.sheet-wrap.open:last-child .sh-body'); assert.ok(/4 people and 23 events/.test(msg) && /Nothing is saved on this phone yet, so nothing will be lost/.test(msg), msg);
    await page.click('.confirm [data-ok]'); await page.waitForSelector('#top:not([hidden])'); await noSheets(page);
    const st = await data(page); deq(st.events, obj.events); deq(st.people, obj.people); deq(st.settings, obj.settings); deq(st.series, obj.series); assert.ok(/Restored 4 people and 23 events/.test(await toastText(page)));
    // restore over existing data asks, and says what is replaced
    await page.click('[data-act=add-ev]'); await page.fill('#f-title', 'Extra'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page); eq((await data(page)).events.length, 24);
    await page.click('[data-act=settings]'); await page.setInputFiles(sheetSel + ' [data-restore]', bk.path); await page.waitForSelector('.confirm');
    const m2 = await page.textContent('.sheet-wrap.open:last-child .sh-body'); assert.ok(/replaces everything in Who’s Where on this phone now \(4 people and 24 events\)\. This cannot be undone\./.test(m2), m2); await shot(page, '16-restore-confirm-390');
    await page.click('.confirm [data-close].btn'); await settle(page); eq((await data(page)).events.length, 24, 'cancel changes nothing');
    await page.setInputFiles(sheetSel + ' [data-restore]', bk.path); await page.waitForSelector('.confirm'); await page.click('.confirm [data-ok]'); await noSheets(page); eq((await data(page)).events.length, 23);
    deq(errors, []); await page.context().close();
  });

  await test('restore: bad files are refused with a plain message and nothing changes', async () => {
    const { page, errors } = await withSample();
    const tmp = (n, c) => { const p = path.join(os.tmpdir(), 'ww-bad-' + n); fs.writeFileSync(p, c); return p; };
    const before = JSON.stringify(await data(page));
    const cases = [['garbage.json', 'this is not json {{{', /isn't a Who's Where backup \(it can't be read\)/], ['other.json', JSON.stringify({ app: 'locker', v: 1, athletes: [] }), /isn't a Who's Where backup/], ['newer.json', JSON.stringify({ app: 'whoswhere', v: 9, people: [], events: [] }), /newer version/],
      ['empty.json', JSON.stringify({ app: 'whoswhere', v: 1, people: [], events: [] }), /no people or events/], ['array.json', '[1,2,3]', /isn't a Who's Where backup/], ['partial.json', JSON.stringify({ app: 'whoswhere', v: 1, people: [] }), /missing its people or events/],
      ['junk.json', JSON.stringify({ app: 'whoswhere', v: 1, people: [{ name: '' }], events: [{ date: 'nope' }] }), /no people or events that can be read/]];
    await page.click('[data-act=settings]');
    for (const [n, c, re] of cases) {
      await page.setInputFiles(sheetSel + ' [data-restore]', tmp(n, c)); await page.waitForSelector('.toast.error'); const t = await page.$$eval('.toast.error', e => e.map(x => x.textContent).join(' ')); assert.ok(re.test(t), n + ': ' + t); assert.ok(/Nothing was changed/.test(t), n);
      eq(await page.$$eval('.confirm', c => c.length), 0, n + ': no confirm sheet'); eq(JSON.stringify(await data(page)), before, n + ': data untouched'); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    }
    // a backup with a few bad items restores the good ones and says so
    const mixed = C.makeBackup(sampleDoc(), TODAY); mixed.events.push({ junk: 1 }, { date: '2026-13-40', start: 1, end: 2 }); mixed.people.push('x');
    await page.setInputFiles(sheetSel + ' [data-restore]', tmp('mixed.json', JSON.stringify(mixed))); await page.waitForSelector('.confirm'); assert.ok(/3 items in the file couldn't be read and will be left out/.test(await page.textContent('.sheet-wrap.open:last-child .sh-body')));
    await page.click('.confirm [data-ok]'); await noSheets(page); eq((await data(page)).events.length, 23);
    // too big
    const big = path.join(os.tmpdir(), 'ww-bad-big.json'); fs.writeFileSync(big, Buffer.alloc(26 * 1024 * 1024, 32)); await page.click('[data-act=settings]'); await page.setInputFiles(sheetSel + ' [data-restore]', big); await waitToast(page, /too big/);
    deq(errors, []); await page.context().close();
  });

  /* ---------- safety: text typed in is only ever text ---------- */
  await test('XSS: markup typed into every text field (and a hostile backup) shows as plain text and never runs', async () => {
    const payload = '<img src=x onerror="window.__xss=(window.__xss||0)+1">', short = '<img src=x onerror=_x++>', scr = '<script>_x=9</script>';
    const { page, errors } = await open();
    await page.evaluate(() => { window.__xss = 0; window._x = 0; });
    await page.click('[data-act=add-person][data-role=player]'); await page.fill('#p-name', short); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    await tab(page, 'people'); await page.click('[data-act=add-person][data-role=adult]'); await page.fill('#p-name', scr); await page.click(sheetSel + ' [data-act=save-person]'); await noSheets(page);
    await tab(page, 'week'); await page.click('[data-act=add-ev]'); await page.waitForSelector('#f-title');
    await page.fill('#f-title', payload); await page.fill('#f-place', payload); await page.fill('#f-addr', payload); await page.fill('#f-notes', payload);
    await page.click(sheetSel + ' [data-grp=kids]'); await page.click(sheetSel + ' [data-grp=driver]:has-text("script")'); await page.click(sheetSel + ' [data-grp=snack]:has-text("Needs someone")');
    await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    await page.waitForSelector('.ev'); eq(await page.textContent('.ev .ev-title'), '🏃 ' + payload); eq(await page.$$eval('#view img', i => i.length), 0, 'no image element was created');
    await page.click('.ev'); await page.waitForSelector(sheetSel); const dt = await page.textContent(sheetSel); assert.ok(dt.includes(payload) && dt.includes(scr) && dt.includes(short), 'shown as text in the detail'); eq(await page.$$eval(sheetSel + ' img, ' + sheetSel + ' script', i => i.length), 0);
    assert.ok((await page.getAttribute(sheetSel + ' a.dirbtn', 'href')).startsWith('https://maps.google.com/?q=%3Cimg'), 'the map link is encoded');
    await page.click(sheetSel + ' [data-act=edit-ev]'); await page.waitForSelector('#f-title'); eq(await page.inputValue('#f-title'), payload, 'the form shows the text too'); await page.keyboard.press('Escape'); await settle(page);
    await tab(page, 'attention'); eq(await page.$$eval('#view img', i => i.length), 0); await tab(page, 'month'); await page.click('.mcell[data-date="' + TODAY + '"]'); await page.waitForSelector(sheetSel); eq(await page.$$eval('img, script:not([src])', i => i.filter(x => !x.closest('head')).length), 0); await page.keyboard.press('Escape'); await settle(page);
     await page.evaluate(() => { window.print = () => {}; window.__keepPrint = true; }); await tab(page, 'week'); await page.click('[data-act=print-week]'); eq(await page.$$eval('#printbox img, #printbox script', i => i.length), 0, 'print page is escaped too');
    eq(await page.evaluate(() => [window.__xss, window._x].join()), '0,0', 'nothing ran'); deq(errors, []); await page.context().close();
    // a hostile backup file
    const t = await open(); const evil = { app: 'whoswhere', v: 1, people: [{ id: 'kid1', name: short, role: 'player', color: '"><img src=x onerror=window.__xss=2>' }, { id: 'pa1', name: 'Adult', role: 'adult', color: 'url(javascript:1)' }],
      events: [{ id: 'ev1x', title: payload, date: '2026-11-09', start: 600, end: 660, kids: ['kid1'], driver: 'pa1', place: '"><img src=x onerror=window.__xss=3>', series: '"><b>' }], series: [{ id: '"><b>', skip: ['"><b>'] }], settings: { weekStart: '<b>' } };
    const f = path.join(os.tmpdir(), 'ww-evil.json'); fs.writeFileSync(f, JSON.stringify(evil)); await t.page.evaluate(() => { window.__xss = 0; });
    await t.page.setInputFiles('[data-restore]', f); await t.page.waitForSelector('.confirm'); await t.page.click('.confirm [data-ok]'); await t.page.waitForSelector('#top:not([hidden])');
    const st = await data(t.page); assert.ok(st.people.every(p => /^#[0-9a-f]{6}$/.test(p.color)), 'colors are always plain hex'); eq(st.events[0].series, ''); eq(st.series.length, 0);
    await tab(t.page, 'people'); await tab(t.page, 'week'); await goToday(t.page); await t.page.click('[data-act=step][data-n="1"]'); await t.page.waitForSelector('.ev'); eq(await t.page.$$eval('#view img, #top img', i => i.filter(x => !x.closest('.welcome')).length), 0);
    eq(await t.page.evaluate(() => window.__xss), 0, 'hostile backup ran nothing'); deq(t.errors, []); await t.ctx.close();
  });

  /* ---------- keeping data ---------- */
  await test('persistence: everything survives a reload; a second tab sees the same data', async () => {
    const { page, errors } = await withSample();
    await page.click('.ev:has-text("Game")'); await page.click(sheetSel + ' [data-act=edit-ev]'); await page.fill('#f-title', 'Home game'); await page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(page);
    await tab(page, 'attention'); await page.click('[data-act=horizon][data-n="60"]'); await page.reload(); await page.waitForSelector('#top:not([hidden])');
    eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026', 'view resets to this week after a reload'); assert.ok(await page.isVisible('.ev:has-text("Home game")'));
    eq((await data(page)).events.length, 23); const p2 = await page.context().newPage(); await p2.goto(srv.url); await p2.waitForSelector('#top:not([hidden])'); assert.ok(await p2.evaluate(() => window.WhosWhereApp.S.events.some(e => e.title === 'Home game')));
    deq(errors, []); await page.context().close();
  });

  await test('resilience: storage blocked still works with a visible note; damaged data is kept aside; save failure tells you', async () => {
    let t = await newPage(br, { today: TODAY });
    await t.page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
    await t.page.goto(srv.url); await t.page.waitForSelector('.welcome');
    await t.page.click('[data-act=sample]'); await t.page.waitForSelector('#top:not([hidden])');
    assert.ok(/Can’t save on this browser/.test(await t.page.textContent('.banner.bad')), 'the note shows'); assert.ok(await t.page.isVisible('.ev'), 'the app still works in memory');
    await t.page.click('[data-act=add-ev]'); await t.page.fill('#f-title', 'In memory'); await t.page.click(sheetSel + ' [data-act=save-ev]'); await noSheets(t.page); assert.ok(await t.page.isVisible('.ev:has-text("In memory")'));
    await t.page.click('[data-act=settings]'); assert.ok(/Can’t save on this browser/.test(await t.page.textContent(sheetSel))); const bk = await downloadText(t.page, sheetSel + ' [data-act=dl-backup]'); assert.ok(JSON.parse(bk.text).events.some(e => e.title === 'In memory'), 'a backup still captures it');
    await shot(t.page, '17-cant-save-390');
    deq(t.errors.filter(e => !/localStorage|denied/.test(e)), []); await t.ctx.close();
    // damaged data
    t = await newPage(br, { today: TODAY }); await t.page.addInitScript(() => { try { if (!sessionStorage.getItem('d')) { sessionStorage.setItem('d', '1'); localStorage.setItem('whoswhere.data', '{"people":[{"id":"x1x"'); } } catch (e) {} });
    await t.page.goto(srv.url); await t.page.waitForSelector('.welcome'); await t.page.click('[data-act=sample]'); await t.page.waitForSelector('.banner.bad'); assert.ok(/Saved data couldn’t be read/.test(await t.page.textContent('.banner.bad')));
    eq((await ls(t.page))['whoswhere.damaged'], '{"people":[{"id":"x1x"', 'the unreadable text was kept');
    await t.page.click('[data-act=dismiss-damaged]'); eq(await t.page.$$eval('.banner.bad', b => b.length), 0); deq(t.errors, []); await t.ctx.close();
    // a few bad items inside good data
    t = await newPage(br, { today: TODAY }); const s = sampleDoc(); s.events.push({ junk: true }, { date: 'bad' });
    await seed(t.page, s); await t.page.goto(srv.url); await t.page.waitForSelector('.banner'); assert.ok(/2 saved items couldn’t be read and left out/.test(await t.page.textContent('.banner'))); eq((await t.page.evaluate(() => window.WhosWhereApp.S.events.length)), 23);
    await t.page.click('[data-act=tip-off][data-id=dropped]'); eq(await t.page.$$eval('.banner', b => b.length), 0); await t.page.reload(); await t.page.waitForSelector('#top:not([hidden])'); eq(await t.page.$$eval('.banner', b => b.length), 0, 'dismissed stays dismissed'); await t.ctx.close();
    // save failure while the app runs
    t = await withSample();
    await t.page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; window.__restoreSet = () => { Storage.prototype.setItem = o; }; });
    await t.page.click('[data-act=add-ev]'); await t.page.fill('#f-title', 'X'); await t.page.click(sheetSel + ' [data-act=save-ev]'); await waitToast(t.page, /Couldn't save on this phone/); eq(await t.page.$$eval('.toast[role=alert]', x => x.length) > 0, true);
    await t.page.evaluate(() => window.__restoreSet()); deq(t.errors, []); await t.ctx.close();
    // restore that cannot be saved leaves things as they were
    t = await withSample(); const f = path.join(os.tmpdir(), 'ww-ok.json'); fs.writeFileSync(f, JSON.stringify(C.makeBackup({ people: [PEOPLE[0]], events: [], series: [], settings: C.sanitizeSettings({}) }, TODAY)));
    await t.page.click('[data-act=settings]'); await t.page.setInputFiles(sheetSel + ' [data-restore]', f); await t.page.waitForSelector('.confirm');
    await t.page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await t.page.click('.confirm [data-ok]'); await waitToast(t.page, /Couldn't restore \(storage problem\)/); eq(await t.page.evaluate(() => window.WhosWhereApp.S.events.length), 23, 'still has the old data'); await t.ctx.close();
  });

  await test('offline: after one visit the app reloads with no network (service worker, its own cache only)', async () => {
    const { ctx, page, errors } = await open({ sw: true });
    await page.addInitScript(() => { if (!sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); caches.open('locker-v99').then(c => c.put('/x', new Response('x'))); caches.open('whoswhere-v0').then(c => c.put('/y', new Response('y'))); } });
    await page.goto(srv.url); await page.waitForSelector('.welcome'); await page.click('[data-act=sample]');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.includes('whoswhere-v1') && !k.includes('whoswhere-v0') && (await (await caches.open('whoswhere-v1')).keys()).length >= 8; }, null, { timeout: 8000 });
    const cached = await page.evaluate(async () => (await (await caches.open('whoswhere-v1')).keys()).map(r => new URL(r.url).pathname));
    for (const f of ['/apps/whoswhere/', '/apps/whoswhere/core.js', '/apps/whoswhere/base.js', '/apps/whoswhere/views.js', '/apps/whoswhere/forms.js', '/apps/whoswhere/app.js', '/apps/whoswhere/whoswhere.css', '/apps/whoswhere/manifest.json', '/apps/icons/whoswhere-192.png', '/apps/icons/whoswhere-512.png']) assert.ok(cached.includes(f), 'cached ' + f + ' in ' + cached.join());
    await page.reload(); await page.waitForTimeout(300); assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by the worker');
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.ev', { timeout: 6000 });
    assert.ok(await page.isVisible('#view-title')); await page.click('.ev'); await page.waitForSelector(sheetSel); await page.keyboard.press('Escape'); await settle(page); await tab(page, 'month'); assert.ok(await page.isVisible('.mgrid'));
    await ctx.setOffline(false); eq((await page.evaluate(() => caches.keys())).includes('locker-v99'), true, 'other apps\' caches untouched');
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    deq(errors, []); await ctx.close();
  });

  await test('the app makes no network requests of its own (only the same-origin files, plus the two allowed external links)', async () => {
    const { ctx, page } = await newPage(br, { today: TODAY }); const reqs = [];
    ctx.on('request', r => reqs.push(r.url())); await page.goto(srv.url); await page.waitForSelector('.welcome'); await page.click('[data-act=sample]'); await tab(page, 'month'); await tab(page, 'attention'); await page.waitForTimeout(300);
    const foreign = reqs.filter(u => !u.startsWith(srv.url.replace(/apps\/whoswhere\/$/, '')) && !u.startsWith('data:'));
    assert.ok(foreign.every(u => /natesteele888\.github\.io\/apps\/install\.js|fonts\.(googleapis|gstatic)\.com/.test(u)), foreign.join());
    const src = ['core', 'base', 'views', 'forms', 'app'].map(f => fs.readFileSync(path.join(__dirname, '../apps/whoswhere/' + f + '.js'), 'utf8')).join('\n');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no network APIs in the code');
    const priv = (src + fs.readFileSync(path.join(__dirname, '../apps/whoswhere/index.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '../apps/whoswhere/manifest.json'), 'utf8')).match(/[\w.+-]+@[\w-]+\.[a-z]{2,}|\b\d{3}[.) -]\d{3}[.-]\d{4}\b/gi) || []; deq(priv, []); // no emails or phone numbers
    await ctx.close();
  });

  /* ---------- time ---------- */
  await test('time: a new day moves "Today" and the needs-attention list; the real clock works too', async () => {
    const { page, errors } = await withSample();
    await goToday(page); eq(await page.textContent('.day.today .dd'), 'Saturday, Nov 7');
    await page.evaluate(() => { window.__today = '2026-11-10'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('.day.today .dd') && document.querySelector('.day.today .dd').textContent === 'Tuesday, Nov 10', null, { timeout: 3000 });
    eq(await page.textContent('#view-title'), 'Nov 8 – 14, 2026', 'the app follows the new day to the week that contains it'); eq(await page.textContent('.nbadge'), '4', 'from Tue Nov 10: conflicts Nov 10 + 17, games Nov 11 + 18');
    await page.evaluate(() => { window.__today = '2026-11-11'; document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForFunction(() => document.querySelector('.day.today .dd').textContent === 'Wednesday, Nov 11'); eq(await page.textContent('.nbadge'), '4', 'the Nov 10 clash is over, but the Nov 24 clash is now inside the two weeks');
    // real clock, no override
    const r = await newPage(br, {}); await r.page.goto(srv.url); await r.page.waitForSelector('.welcome'); await r.page.click('[data-act=sample]'); await r.page.waitForSelector('#top:not([hidden])');
    const now = new Date(), y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0'); const real = y + '-' + m + '-' + d;
    await r.page.click('[data-act=go-today]'); eq(await r.page.evaluate(() => window.WhosWhereCore.todayStr()), real); assert.ok(await r.page.isVisible('.day.today'), 'today is highlighted with the real clock'); eq(await r.page.getAttribute('.day.today h3', 'id'), 'dh-' + real);
    deq(r.errors, []); await r.ctx.close(); deq(errors, []); await page.context().close();
  });

  /* ---------- touch, keyboard, layout ---------- */
  await test('swipe left/right changes the week and the month (touch events), but not while a sheet is open', async () => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const { page, errors } = await newPage(br, { today: TODAY, context: ctx }); await seed(page, sampleDoc()); await page.goto(srv.url); await page.waitForSelector('.ev');
    const swipe = async (dx, dy = 0) => { const cdp = await ctx.newCDPSession(page); const y = 400, x0 = dx < 0 ? 330 : 60; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx / 2, y: y + dy / 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx, y: y + dy }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150); };
    eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026');
    await swipe(-200); eq(await page.textContent('#view-title'), 'Nov 8 – 14, 2026', 'swipe left = next week'); await swipe(200); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026', 'swipe right = previous week');
    await swipe(-30); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026', 'a short drag is not a swipe'); await swipe(-200, 150); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026', 'a mostly vertical drag (scrolling) is not a swipe');
    await tab(page, 'month'); await swipe(-200); eq(await page.textContent('#view-title'), 'December 2026'); await swipe(200); eq(await page.textContent('#view-title'), 'November 2026');
    await tab(page, 'week'); await page.click('.ev'); await page.waitForSelector(sheetSel); await swipe(-200); await page.keyboard.press('Escape'); await settle(page); eq(await page.textContent('#view-title'), 'Nov 1 – 7, 2026', 'no swipe change under a sheet');
    deq(errors, []); await ctx.close();
  });

  await test('keyboard: tab order reaches the controls, Escape closes sheets and returns focus, a focus ring is drawn', async () => {
    const { page, errors } = await withSample();
    await page.keyboard.press('Tab'); const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; }); assert.ok(/solid 3px/.test(ring), 'focus ring: ' + ring);
    const a = await page.evaluate(() => document.activeElement.textContent.trim()); assert.ok(/Add event|Who/.test(a), a);
    await page.focus('.ev'); await page.keyboard.press('Enter'); await page.waitForSelector(sheetSel); assert.ok(await page.evaluate(() => document.activeElement.closest('.sheet') !== null), 'focus moved into the sheet');
    assert.ok(await page.evaluate(() => document.getElementById('app').inert), 'page behind is inert');
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.activeElement.closest('.sheet') !== null), 'focus stays inside the sheet');
    await page.keyboard.press('Escape'); await settle(page); eq(await sheetCount(page), 0); eq(await page.evaluate(() => document.activeElement.className.split(' ')[0]), 'ev', 'focus returns to the card that opened it');
    // keep keyboard focus on the same control after a filter press redraws the screen
    await page.focus('[data-act=filter][data-id=kid1]'); await page.keyboard.press('Enter'); eq(await page.evaluate(() => document.activeElement.getAttribute('data-id')), 'kid1');
    await page.focus('[data-act=step][data-n="1"]'); await page.keyboard.press('Enter'); eq(await page.evaluate(() => document.activeElement.getAttribute('data-n')), '1');
    deq(errors, []); await page.context().close();
  });

  await test('layout: no sideways scroll or small tap targets on any screen at 390, 320 and 768; sheets never taller than 85%; screenshots', async () => {
    const sizes = [[390, 844, '390'], [320, 640, '320'], [768, 1024, '768']];
    for (const [w, h, tag] of sizes) {
      const { page, errors } = await withSample({ ctx: { viewport: { width: w, height: h } } });
      const problems = [];
      for (const t of ['week', 'month', 'attention', 'people']) {
        await tab(page, t); if (t === 'attention') await page.click('[data-act=horizon][data-n="0"]'); await page.waitForTimeout(80);
        const o = await overflow(page); if (o > 0) problems.push(t + ' overflows by ' + o);
        const bad = await smallTargets(page); if (bad.length) problems.push(t + ' small: ' + bad.join('; '));
        if (tag !== '390' || t !== 'attention') await shot(page, (t === 'week' ? '02-week' : t === 'month' ? '04-month' : t === 'attention' ? '03-attention' : '11-people') + '-' + tag, t === 'attention');
      }
      await tab(page, 'week'); await goToday(page);
      const sheets = [['.ev', '[data-act=open-ev]', 'detail'], ['[data-act=add-ev]', null, 'form'], ['[data-act=settings]', null, 'settings']];
      for (const [sel, , name] of sheets) {
        await page.click(sel === '.ev' ? '.ev' : sel); await page.waitForSelector(sheetSel); await page.waitForTimeout(350);
        const r = await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sheet'); const b = s.getBoundingClientRect(); const out = Array.from(s.querySelectorAll('input, button, select, textarea, a')).filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > b.right + 0.5 || q.left < b.left - 0.5); }).map(e => (e.id || e.textContent || e.tagName).trim().slice(0, 20)); return { h: b.height, vh: innerHeight, o: document.documentElement.scrollWidth - innerWidth, sw: s.scrollWidth - s.clientWidth, out: out }; });
        if (r.out.length) problems.push(name + ' sheet has controls sticking out: ' + r.out.join(', '));
        if (r.h > r.vh * 0.851) problems.push(name + ' sheet is ' + Math.round(r.h) + ' of ' + r.vh); if (r.o > 0 || r.sw > 0) problems.push(name + ' sheet overflows ' + r.o + '/' + r.sw);
        const bad = await smallTargets(page); if (bad.length) problems.push(name + ' small: ' + bad.join('; '));
        if (tag === '320' || name === 'settings') await shot(page, '18-' + name + '-' + tag);
        await page.keyboard.press('Escape'); await settle(page);
      }
      eq(problems.join('\n'), '', tag); deq(errors, []); await page.context().close();
    }
  });

  await test('layout: long names and a busy week still fit at 320 (chips wrap, nothing is cut off sideways)', async () => {
    const st = sampleDoc(); st.people[0].name = 'Alexandria-Montgomery'; st.events.push(C.sanitizeEvent({ id: 'long1x', title: 'Tournament semi-finals and the long awaited trophy ceremony afterwards', type: 'tournament', date: '2026-11-06', start: '07:15', end: '23:30', place: 'The Very Long Named Regional Sports Complex Field Number Twelve', kids: ['kid1', 'kid2'], driver: 'parentB', snack: 'open', notes: 'x'.repeat(300), early: 90, drive: 90 }, { kids: { kid1: 1, kid2: 1 }, adults: { parentA: 1, parentB: 1 } }, {}));
    const { page, errors } = await open({ ctx: { viewport: { width: 320, height: 640 } } }, st);
    eq(await overflow(page), 0); await shot(page, '19-long-text-320'); await page.click('.ev:has-text("Tournament semi")'); await page.waitForSelector(sheetSel); eq(await overflow(page), 0); assert.ok(await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sh-body'); return s.scrollWidth <= s.clientWidth; }));
    await shot(page, '19-long-detail-320'); deq(errors, []); await page.context().close();
  });

  await test('reduced motion: sheets still open and close; dark colours have enough contrast (text >= 4.5:1)', async () => {
    const { page, errors } = await withSample({ reducedMotion: true });
    await page.click('.ev'); await page.waitForSelector(sheetSel); await page.keyboard.press('Escape'); await noSheets(page);
    eq(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    eq(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ev')).transitionDuration) < 0.01 || getComputedStyle(document.querySelector('.ev')).transitionDuration), true);
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    [['#eef3ff', '#0a0f1f'], ['#eef3ff', '#131c36'], ['#a3b4da', '#131c36'], ['#a3b4da', '#0a0f1f'], ['#04101f', '#3aa0ff'], ['#ffb340', '#2b2410'], ['#ff6b7a', '#331620'], ['#1a0509', '#ff6b7a'], ['#a3b4da', '#0e1529'], ['#ffb340', '#131c36']].forEach(([f, b]) => assert.ok(ratio(hex(f), hex(b)) >= 4.5, f + ' on ' + b + ' = ' + ratio(hex(f), hex(b)).toFixed(2)));
    ['#3aa0ff', '#ff9f43', '#2fd08a', '#ff7eb6', '#b08cff', '#ffd23f', '#2ed1d1', '#a3e635'].forEach(c => assert.ok(ratio(hex('#0a0f1f'), hex(c)) >= 4.5, 'person colour ' + c + ' with dark text'));
    deq(errors, []); await page.context().close();
  });

  /* ---------- the Back button ---------- */
  const fresh = async () => withSample();
  await test('Back button: closes one sheet and stays in the app', async () => {
    const { page, errors } = await fresh(); const start = page.url();
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0, 'sheet closed'); assert.ok(page.url().startsWith(srv.url), 'still on the app: ' + page.url()); deq(errors, []); await page.context().close();
  });
  await test('Back button: two stacked sheets peel off one at a time', async () => {
    const { page } = await fresh();
    await tab(page, 'month'); await page.click('.mcell[data-date="2026-11-10"]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' .ev:first-child'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 1, 'one left'); await page.goBack(); await settle(page); eq(await sheetCount(page), 0, 'none left'); assert.ok(page.url().startsWith(srv.url)); await page.context().close();
  });
  await test('Back button: closing with the X or Cancel gives the history entry back (no ghost sheet)', async () => {
    const { page } = await fresh();
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' .x'); await settle(page); eq(await sheetCount(page), 0);
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(page.url().startsWith(srv.url), 'a closed sheet left no stray entry: ' + page.url());
    await page.goBack(); await settle(page); assert.ok(!page.url().startsWith(srv.url), 'a second Back leaves the app: ' + page.url()); await page.context().close();
    const t = await fresh(); await t.page.click('[data-act=add-ev]'); await t.page.waitForSelector('#f-title'); await t.page.click(sheetSel + ' [data-close].btn'); await settle(t.page); eq(await sheetCount(t.page), 0);
    await t.page.click('[data-act=settings]'); await t.page.waitForSelector(sheetSel); await t.page.goBack(); await settle(t.page); assert.ok(t.page.url().startsWith(srv.url)); await t.page.context().close();
  });
  await test('Back button: a sheet that replaces another (detail to Edit, Settings to About) leaves no stray entries', async () => {
    const { page } = await fresh();
    await page.click('.ev'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' [data-act=edit-ev]'); await page.waitForSelector('#f-title'); await settle(page); eq(await sheetCount(page), 1);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0, 'one Back closes the form'); assert.ok(page.url().startsWith(srv.url));
    await page.click('[data-act=settings]'); await page.click(sheetSel + ' [data-act=about]'); await page.waitForSelector(sheetSel + ' .ver'); await settle(page); eq(await sheetCount(page), 1);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(page.url().startsWith(srv.url)); await page.context().close();
    // the detail sheet, then confirm-delete on top: Back peels the confirm first
    const t = await fresh(); await t.page.click('.ev:has-text("Tournament")').catch(async () => { await t.page.click('[data-act=go-today]'); await t.page.click('.ev:has-text("Tournament")'); });
    await t.page.waitForSelector(sheetSel); await t.page.click(sheetSel + ' [data-act=del-ev]'); await t.page.waitForSelector('.confirm'); await settle(t.page); eq(await sheetCount(t.page), 2);
    await t.page.goBack(); await settle(t.page); eq(await sheetCount(t.page), 1); eq(await t.page.$$eval('.confirm', c => c.length), 0); await t.page.goBack(); await settle(t.page); eq(await sheetCount(t.page), 0); await t.page.context().close();
  });
  await test('Back button: an event deleted from the detail sheet closes it and the Back button still works', async () => {
    const { page } = await fresh(); await goToday(page); const n0 = (await data(page)).events.length;
    await page.click('.ev:has-text("Tournament")'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' [data-act=del-ev]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await settle(page);
    eq(await sheetCount(page), 0, 'the detail sheet closed itself'); eq((await data(page)).events.length, n0 - 1); await page.goBack(); await settle(page); assert.ok(!page.url().startsWith(srv.url) || (await page.evaluate(() => !!document.querySelector('#view'))), 'Back leaves cleanly'); await page.context().close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
