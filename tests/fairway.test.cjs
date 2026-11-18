// Fairway (golf tournaments) tests. Run:
//   cd <apps> && NODE_PATH=<node_modules with playwright> tests/run.sh fairway
// Part 1 tests core.js on its own: scoring math, the board, groups, stats, closest-to-the-pin distances, cleaning,
// and Phase 1: who's in, making it official, the draft, team board, match play, tee times, the calendar file, chat.
// Part 2 drives the real page with Firebase blocked (so tournaments run on the phone): the demo board, field, score,
// course and player card, starting a tournament, closest to the pin with the browser's own made-up GPS, the sound
// switch, names shown as text, and a tournament got going on one phone (official, chat, tee time, calendar file).
// Live sharing between phones needs the shared database and is not tested here.
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
const ok = (v, m) => assert.ok(v, m);
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

  await test('core: board names are last names, with an initial only when two share one', () => {
    const n = C.boardNames([{ id: 'a', name: 'Cal Ortega' }, { id: 'b', name: 'Jo Tamsin' }, { id: 'c', name: 'Bea Tamsin' }, { id: 'd', name: 'Hank' }]);
    eq(n.a, 'ORTEGA'); eq(n.b, 'J. TAMSIN'); eq(n.c, 'B. TAMSIN'); eq(n.d, 'HANK');
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

  await test('core phase 1: who is in, then official puts everyone in on the tee sheet, four to a group', () => {
    let ev = C.newEvent({ name: 'Test Cup', now: NOW });
    ev.rally = { on: true, date: '2026-11-21', goal: 8, note: '', r: {} };
    ['Al Test', 'Bo Test', 'Cy Test', 'Di Test', 'Ed Test', 'Fa Test'].forEach((n, i) => { ev.rally.r['rid00' + i] = { n, s: i < 5 ? 'in' : 'maybe', at: NOW + i }; });
    ev.rally.r.rid009 = { n: 'Out Test', s: 'out', at: NOW };
    ev = C.cleanEvent(ev);
    const rl = C.rallyList(ev); eq(rl.in, 5); eq(rl.maybe, 1);
    ev = C.cleanEvent(C.applyPatch(ev, C.officialPatch(ev, NOW)));
    eq(ev.rally.on, false); eq(C.players(ev).length, 5, 'only the ins');
    deq(C.players(ev).map(p => p.g).sort(), [1, 1, 1, 1, 2]);
    assert.ok(ev.p.rid000, 'a rally answer keeps its id as the player id');
  });

  await test('core phase 1: snake draft by lowest handicap, team board and who-wins picks', () => {
    let ev = C.newEvent({ name: 'Test Cup', now: NOW });
    [3, 8, 12, 20, 5, 15].forEach((hc, i) => { ev.p['pl00000' + i] = C.newPlayer(ev, { name: 'Golfer ' + i, hc, group: 1 + (i >> 2) }); });
    ev.fmt = C.cleanFmt({ kind: 'teams', nt: 2, draft: 'snake', clk: 60 });
    const caps = C.pickCaptains(ev, 2, 'low'); deq(caps.slice().sort(), ['pl000000', 'pl000004']);
    ev = C.cleanEvent(C.applyPatch(ev, C.draftStartPatch(ev, caps, NOW)));
    let st = C.draftState(ev, NOW + 10000); eq(st.on, C.teamOf(ev, st.cap)); eq(st.left, 50); eq(st.avail.length, 4);
    const order = [];
    for (;;) { st = C.draftState(ev, NOW); if (!st.on) break; order.push(st.on); ev = C.cleanEvent(C.applyPatch(ev, C.pickPatch(ev, st.avail[0].id, NOW))); }
    eq(order.length, 4); eq(order[1], order[2], 'snake: the second team picks twice in a row');
    eq(ev.dr.done, true);
    const board = C.teamBoard(ev); eq(board.length, 2); eq(board[0].members.length + board[1].members.length, 6);
    assert.strictEqual(C.cleanFmt({ kind: 'bad', clk: 7 }).kind, 'solo'); eq(C.cleanFmt({ clk: 7 }).clk, 60);
  });

  await test('core phase 1: match play holes up, closed out, and a win chance', () => {
    const ev = twoPlayers(); ev.m = { mt00001: { a: ['aaaaaa1'], b: ['bbbbbb1'], r: 1 } };
    [1, 2, 3].forEach(h => { ev.p.aaaaaa1.s['1_' + h] = 4; ev.p.bbbbbb1.s['1_' + h] = h < 3 ? 5 : 4; });
    let ms = C.matchStatus(ev, ev.m.mt00001); assert.match(ms.text, /2 UP/); assert.ok(ms.pa > 0.6 && ms.pa < 0.9, 'chance ' + ms.pa);
    for (let h = 4; h <= 18; h++) { ev.p.aaaaaa1.s['1_' + h] = 3; ev.p.bbbbbb1.s['1_' + h] = 5; }
    ms = C.matchStatus(ev, ev.m.mt00001); assert.match(ms.text, /\d+&\d+/); eq(ms.pa, 1);
  });

  await test('core phase 1: tee times, reminders and the calendar file use the course, never a player', () => {
    let ev = twoPlayers(); ev.tt = { date: '2026-11-21', where: 'Sample Pines', g: { 1: '08:10', 99: '25:00' } }; ev = C.cleanEvent(ev);
    deq(ev.tt.g, { 1: '08:10' }, 'bad group and bad time dropped');
    eq(C.fmtTime('08:10'), '8:10 AM'); eq(C.fmtTime('13:05'), '1:05 PM'); eq(C.fmtDate('2026-11-21'), 'Sat, Nov 21');
    const ics = C.icsFor(ev, 1, { now: NOW, drive: 25, uid: 'abc' });
    assert.match(ics, /DTSTART:20261121T081000/); assert.match(ics, /LOCATION:Sample Pines/);
    eq((ics.match(/BEGIN:VALARM/g) || []).length, 4); assert.match(ics, /TRIGGER:-PT55M/, 'leave now = drive + 30');
    assert.ok(!/Alpha|Bravo/.test(ics), 'no names in the calendar file');
    assert.match(C.directions(ev), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Sample%20Pines$/);
  });

  await test('core phase 1: chat messages are cleaned, polls keep only real votes, birdies shout', () => {
    eq(C.cleanMsg({ k: 'm', n: 'Al', t: '   ', at: 1 }), null);
    eq(C.cleanMsg({ k: 'm', n: 'Al', t: 'x'.repeat(900), at: 1 }).t.length, 500);
    const p = C.cleanMsg({ k: 'p', n: 'Al', t: 'Who?', o: ['A', 'B', ''], v: { rid0001: 1, bad: 0, rid0002: 7 }, by: 'rid0001', at: 1 });
    deq(p.o, ['A', 'B']); deq(p.v, { rid0001: 1 });
    eq(C.cleanMsg({ k: 'p', n: 'Al', t: 'Who?', o: ['A'], at: 1 }), null, 'a poll needs two options');
    const ev = twoPlayers(); eq(C.shout(ev, 'aaaaaa1', 1, 1, 3), 'Birdie! Alpha Test on 1.'); eq(C.shout(ev, 'aaaaaa1', 1, 1, 4), null);
    eq(C.cleanHc('+2.1'), -2.1); eq(C.cleanHc('abc'), null);
  });

  await test('core games: a 3 by 3 bingo card per golfer, scores mark birdies, three in a row wins', () => {
    const ev = twoPlayers(), c1 = C.bingoCard(ev, 'aaaaaa1');
    eq(c1.length, 9); eq(c1[4], -1); deq(C.bingoCard(ev, 'aaaaaa1'), c1, 'the same card on every phone');
    eq(new Set(c1).size, 9, 'no square twice');
    let st = C.bingoState(ev, 'aaaaaa1', 1); eq(st.line, null); eq(st.cells[4].hit, true);
    const at = c1.indexOf(0); // the Birdie square, if this card has it
    ev.p.aaaaaa1.s['1_1'] = 3; // birdie on a par 4
    st = C.bingoState(ev, 'aaaaaa1', 1); if (at >= 0) eq(st.cells[at].hit, true, 'a birdie marks itself');
    const line = [[3, 4, 5], [1, 4, 7], [0, 4, 8], [2, 4, 6]].find(l => l.every(i => c1[i] < 0 || c1[i] >= C.BINGO_AUTO));
    ev.bg = { aaaaaa1: line.filter(i => i !== 4).map(i => c1[i]) };
    st = C.bingoState(ev, 'aaaaaa1', 1); deq(st.line && st.line.slice().sort(), line.slice().sort());
    deq(C.cleanBingo({ aaaaaa1: [0, 3, 3, 99, 'x'], zzzzzz9: [4] }, ev), { aaaaaa1: [3] }, 'auto squares, repeats and unknown golfers dropped');
  });

  await test('core side games: skins carry, Nassau, wolf, snake and greenies tally who owes who, and it all nets to zero', () => {
    const ev = twoPlayers();
    ev.p.cccccc1 = C.newPlayer(ev, { name: 'Charlie Test', tee: 'blue', g: 1, st: 1 });
    ev.p.dddddd1 = C.newPlayer(ev, { name: 'Delta Test', tee: 'blue', g: 1, st: 1 });
    ['aaaaaa1', 'bbbbbb1', 'cccccc1', 'dddddd1'].forEach((id, i) => { ev.p[id].at = i; ev.course.holes.forEach((h, j) => { ev.p[id].s['1_' + (j + 1)] = h.par; }); });
    ev.p.aaaaaa1.s['1_1'] -= 1; // a birdie on 1 takes the first skin
    ev.p.bbbbbb1.s['1_3'] -= 1; // 2 halved, so 3 is worth two skins
    const par3 = ev.course.holes.findIndex(h => h.par === 3) + 1;
    const raw = JSON.parse(JSON.stringify(ev));
    raw.bets = { on: ['skins', 'nassau', 'snake', 'wolf', 'green', 'venmo'], amt: { skins: 1, nassau: 5, snake: 2, wolf: 1, green: 0 }, out: ['zzzzzz9'] };
    raw.bm = { '1_1': { wp: { 1: 'cccccc1' } }, '1_5': { tp: ['cccccc1'] }, '1_9': { tp: ['dddddd1', 'nobody1'] }, ['1_' + par3]: { gr: 'dddddd1' }, '9_1': { ld: 'aaaaaa1' } };
    const e = C.cleanEvent(raw);
    deq(e.bets.on, ['skins', 'nassau', 'snake', 'wolf', 'green'], 'unknown games dropped'); deq(e.bets.out, [], 'unknown golfers dropped');
    eq(e.bm['9_1'], undefined, 'marks for a round that does not exist are dropped'); deq(e.bm['1_9'].tp, ['dddddd1']);
    const t = C.betTally(e, 1), g = id => t.games.find(x => x.g === id);
    eq(g('skins').lines[0], 'Hole 1: Alpha Test wins the skin.'); eq(g('skins').lines[1], 'Hole 3: Bravo Test wins 2 skins.');
    ok(/Delta Test holds the snake/.test(g('snake').lines[0]), 'the last three-putt holds the snake');
    eq(g('wolf').lines[0], 'hole 1: Alpha Test and Charlie Test win.', 'the wolf (first to join) and partner win with the birdie');
    eq(g('green').lines[0], 'Hole ' + par3 + ': Delta Test.'); eq(g('green').amt, 0, 'a game for fun shows winners but owes nothing');
    eq(Math.round(Object.values(t.bal).reduce((a, b) => a + b, 0) * 100), 0, 'every dollar won is a dollar lost');
    eq(t.bal.dddddd1 < 0, true, 'the snake holder is down');
    const paid = {}; t.owes.forEach(o => { paid[o.from] = (paid[o.from] || 0) - o.amt; paid[o.to] = (paid[o.to] || 0) + o.amt; });
    Object.keys(t.bal).forEach(p => eq(Math.round((paid[p] || 0) * 100), Math.round(t.bal[p] * 100), 'the payments settle ' + p));
    ok(t.owes.length <= 3, 'four golfers settle in three payments or fewer');
    eq(C.money(3.5), '$3.50'); eq(C.money(4), '$4');
  });

  await test('core hole review: one plain line, the next hole from your tees, and Jack only speaks up on a pattern', () => {
    const ev = twoPlayers(), a = ev.p.aaaaaa1, pars = ev.course.holes.map(h => h.par);
    eq(C.holeLine(4, 5, { t: 'left', p: 2, x: 1, b: true }), 'Missed left, 2 putts, 1 penalty, in the sand');
    eq(C.holeLine(4, 4, { t: 'fairway', p: 2 }), 'Fairway, 2 putts, green in regulation');
    eq(C.holeLine(3, 3, { t: 'fairway', p: 2 }), '2 putts, green in regulation', 'no tee shot on a par 3');
    eq(C.holeLine(4, 4, null), '');
    const nx = C.nextHole(ev, a, 1, 1); eq(nx.h, 2); eq(nx.par, pars[1]); ok(nx.yds > 0); eq(C.nextHole(ev, a, 1, 18), null, 'nothing after the last hole');
    a.st = 10; eq(C.nextHole(ev, a, 1, 18).h, 1, 'a start on 10 goes 18 then 1'); a.st = 1;
    deq(C.cleanHoleNotes({ '1_3': { t: 'shank', p: 9, b: 1 }, '1_4': { p: 2, email: 'x' }, '5_1': { p: 1 } }), { '1_4': { p: 2 } }, 'odd values, odd fields and odd holes are dropped');
    const notes = {};
    [1, 2].forEach(h => { a.s['1_' + h] = pars[h - 1]; notes['1_' + h] = { t: 'fairway', p: 2 }; });
    eq(C.jackNoticed(ev, a, 1, notes), null, 'too few holes to call it a pattern');
    a.s['1_3'] = pars[2]; notes['1_3'] = { t: 'fairway', p: 2 }; eq(C.jackNoticed(ev, a, 1, notes), null, 'a steady run says nothing');
    const long = [1, 2, 3, 4, 5, 6].filter(h => pars[h - 1] > 3).slice(0, 3);
    long.forEach(h => { a.s['1_' + h] = pars[h - 1] + 1; notes['1_' + h] = { t: 'right', p: 2 }; });
    const all = Object.keys(a.s).map(k => +k.split('_')[1]).sort((x, y) => x - y), last4 = all.slice(-4).filter(h => pars[h - 1] > 3);
    if (last4.length >= 3 && last4.every(h => notes['1_' + h].t !== 'fairway')) ok(/fairways/.test(C.jackNoticed(ev, a, 1, notes)), 'missed fairways get noticed');
    const b = ev.p.bbbbbb1, bn = {}; [1, 2, 3].forEach(h => { b.s['1_' + h] = pars[h - 1] + 1; bn['1_' + h] = { p: 3 }; });
    ok(/three-putts/.test(C.jackNoticed(ev, b, 1, bn)), 'three-putts get noticed');
    for (const w of ['damn', 'hell']) ok(!/\b(damn|hell)\b/i.test(C.jackNoticed(ev, b, 1, bn) + (C.jackNoticed(ev, a, 1, notes) || '')), 'clean words only: ' + w);
  });

  await test('core Jack: Clean by default, kids locked to Clean, Super crude needs the adult check and earbuds, notes per course and hole', () => {
    eq(C.cleanJack({}).lang, 'clean', 'Clean is the default');
    eq(C.cleanJack({ lang: 'lot', kid: true }).lang, 'clean', 'a kid or beginner profile is always Clean');
    eq(C.cleanJack({ lang: 'crude' }).lang, 'lot', 'no Super crude without the adult check');
    eq(C.jackLevel({ lang: 'crude', adult: true }), 'lot', 'Super crude drops to A lot without earbuds');
    eq(C.jackLevel({ lang: 'crude', adult: true, buds: true }), 'crude');
    eq(C.speakable('I really fucking hate this hole. Stay up on the right', 'clean'), 'I really hate this hole. Stay up on the right');
    eq(C.speakable('pass the shell, hello', 'clean'), 'pass the shell, hello', 'only whole swear words drop out');
    eq(C.speakable('I really fucking hate this hole', 'lot'), 'I really fucking hate this hole', 'their own words at the higher levels');
    const ev = twoPlayers(), ck = C.courseKey(ev.course);
    const notes = C.cleanCourseNotes({ [ck]: { 3: ['Hate this hole', 'Stay up on the right', '', 'x'.repeat(300)], 19: ['no such hole'] }, bad: { 1: ['x'] } });
    eq(notes[ck][3].length, 3); eq(notes[ck][3][2].length, 200, 'notes are capped'); eq(notes[ck][19], undefined); eq(notes.bad, undefined);
    const talk = C.holeTalk(ev, ev.p.aaaaaa1, 3, notes, 'clean');
    ok(/^Hole 3, par \d, \d+ yards\. Your notes: Hate this hole\. Stay up on the right\./.test(talk), talk);
    eq(C.courseKey({ name: 'Sample Pines' }), 'n:sample pines');
  });

  await test('core recap and season race: made once every card is in, champion, low round, worst hole, then points across the year', () => {
    const ev = twoPlayers(), pars = ev.course.holes.map(h => h.par);
    ev.p.cccccc1 = C.newPlayer(ev, { name: 'Charlie Test', tee: 'blue', g: 1, st: 1 });
    eq(C.recap(ev, 1), null, 'nothing until the cards are in');
    ['aaaaaa1', 'bbbbbb1', 'cccccc1'].forEach((id, i) => pars.forEach((par, j) => { ev.p[id].s['1_' + (j + 1)] = par + (i === 1 ? 1 : 0); }));
    ev.p.aaaaaa1.s['1_2'] -= 1; ev.p.cccccc1.s['1_6'] += 3;
    const rc = C.recap(ev, 1);
    eq(rc.champ.name, 'Alpha Test'); eq(rc.champ.label, 'Champion'); ok(/^-1, won by/.test(rc.champ.line), rc.champ.line);
    eq(rc.items.find(i => i.k === 'Low round').t, 'Alpha Test, ' + (pars.reduce((a, b) => a + b, 0) - 1) + ' (-1)');
    eq(rc.items.find(i => i.k === 'Worst hole').t, "Charlie Test's " + (pars[5] + 3) + ' on the par ' + pars[5] + ' 6th');
    ok(rc.text.length <= 500, 'fits in one chat message'); ok(/^Round recap, Test Cup\. Champion: Alpha Test/.test(rc.text), rc.text);
    const y = new Date(NOW).getUTCFullYear(), hist = C.historyRows(ev, 'aaaaaaaaaaaaaaaaaaaa');
    const two = hist.concat(hist.map(h => Object.assign({}, h, { code: 'bbbbbbbbbbbbbbbbbbbb', toPar: h.name === 'Bravo Test' ? -9 : h.toPar })));
    const sr = C.seasonRace(two, y);
    eq(sr.events, 2); eq(sr.list[0].pts, 800, 'a win (500) and a second (300)'); eq(sr.list[0].wins, 1);
    eq(C.seasonRace(two, y - 1).list.length, 0, 'only this year counts');
  });

  await test('core My bag: typical yards until you set yours, the shortest club that gets there, and Jack names it on a par 3', () => {
    const b = C.cleanBag(null);
    eq(C.bagList(b)[0].id, 'dr', 'longest first'); eq(C.bagList(b)[0].set, false);
    eq(C.clubFor(b, 150).n, '6 iron'); eq(C.clubWords(C.clubFor(b, 300)), "Driver, and it won't get there"); eq(C.clubWords(C.clubFor(b, 40)), 'A soft sand wedge');
    const mine = C.cleanBag({ on: ['dr', '7i', 'zz'], y: { '7i': 160, dr: '250', zz: 3, pw: 5 } });
    deq(mine, { on: ['dr', '7i'], y: { '7i': 160, dr: 250 } }, 'unknown clubs and silly yards dropped');
    eq(C.clubFor(mine, 150).n, '7 iron', 'your own yards win');
    const ev = twoPlayers(), h = ev.course.holes.findIndex(x => x.par === 3) + 1;
    ok(/par 3, \d+ yards\. [A-Z]/.test(C.holeTalk(ev, ev.p.aaaaaa1, h, {}, 'clean', mine)), 'a club is named on a par 3');
    ok(!/iron|wood|Driver|wedge|Hybrid/.test(C.holeTalk(ev, ev.p.aaaaaa1, 1, {}, 'clean', mine)), 'not on a par 4');
  });

  await test('core hole map: cleaning, GPS yards to the green, tap-to-measure and your GPS spot on the picture', () => {
    const N = 111320, gt = { lat: 40, lon: -75, acc: 4 }, gc = { lat: 40 + 400 / N, lon: -75, acc: 4 };
    const m = C.cleanHoleMap({ img: 'data:image/jpeg;base64,AAAA', ar: 0.5, tee: [0.5, 0.9], green: [0.5, 0.1], gt, gc, gf: { lat: gc.lat - 12 / N, lon: -75, acc: 3 }, owner: 'x', tee2: 1 });
    deq(Object.keys(m).sort(), ['ar', 'gc', 'gf', 'green', 'gt', 'img', 'tee'], 'odd fields dropped');
    eq(C.cleanHoleMap({ img: 'data:image/png;base64,AA' }), null, 'only JPEG pictures'); eq(C.cleanHoleMap({ tee: [2, 0] }), null, 'spots stay on the picture');
    eq(C.yardsBetween(gt, gc), 437, '400 metres is 437 yards');
    const mid = { lat: 40 + 200 / N, lon: -75 }, gy = C.greenYards(m, mid); ok(Math.abs(gy.c - 219) <= 1, 'middle ' + gy.c); ok(Math.abs(gy.f - 205) <= 1, 'front ' + gy.f); eq(gy.b, undefined);
    deq(C.tapMeasure(m, 999, [0.5, 0.5]), { from: 219, to: 219, fromYou: false }, 'GPS marks beat the scorecard yards for the scale');
    const card = C.tapMeasure({ tee: [0.5, 0.9], green: [0.5, 0.1], ar: 1 }, 400, [0.5, 0.5]); eq(card.from, 200); eq(card.to, 200);
    const pic = C.gpsToPic(m, mid); ok(Math.abs(pic[0] - 0.5) < 0.001 && Math.abs(pic[1] - 0.5) < 0.001, 'halfway up the hole is halfway up the picture');
    const east = C.gpsToPic(m, { lat: mid.lat, lon: -75 + 50 / (N * Math.cos(40 * Math.PI / 180)) }); ok(Math.abs(east[0] - 0.7) < 0.002, 'right of the line is right on the picture: ' + east[0]);
    eq(C.gpsToPic(m, { lat: 41, lon: -75 }), null, 'off the picture shows nothing');
    eq(C.gpsToPic({ tee: [0.5, 0.9], green: [0.5, 0.1] }, mid), null, 'needs the GPS marks too');
  });

  await test("core who's where: a routing card until every hole is marked, then the real layout, and each group on its hole", () => {
    const ev = C.demoEvent(NOW), n = C.holeCount(ev);
    const lay = C.whereLayout(ev, {}); eq(lay.real, false); eq(lay.holes.length, n);
    ok(lay.holes.every(x => [x.a[0], x.a[1], x.b[0], x.b[1]].every(v => v >= 0 && v <= 100)), 'inside the box');
    eq(lay.holes[0].a[0] < lay.holes[0].b[0], true, 'hole 1 plays left to right'); eq(lay.holes[3].a[0] > lay.holes[3].b[0], true, 'hole 4 comes back');
    const nine = { course: { holes: ev.course.holes.slice(0, 9) } }; eq(C.whereLayout(nine, {}).holes.length, 9, 'a nine-hole course');
    const N = 111320, maps = {};
    for (let h = 1; h <= n; h++) maps[h] = { gt: { lat: 40 + h * 300 / N, lon: -75 }, gc: { lat: 40 + (h * 300 + 250) / N, lon: -75 } };
    eq(C.whereLayout(ev, maps).real, true, 'every tee and green marked');
    const part = Object.assign({}, maps); delete part[7]; eq(C.whereLayout(ev, part).real, false, 'one hole missing keeps the routing card');
    const at = C.groupSpots(ev, lay), gs = C.groups(ev).filter(g => !g.done);
    eq(at.spots.length, gs.length, 'a dot for each group still out');
    at.spots.forEach(s => { const g = gs.find(x => x.g === s.g); eq(s.h, g.on, 'group ' + s.g + ' sits on its hole'); });
    ok(!JSON.stringify(at).match(/lat|lon/), 'no locations in the dots');
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
    await page.click('[data-bm=field]'); await page.waitForSelector('.frow'); eq(await page.locator('.frow').count(), 12);
    await page.click('[data-bm=course]'); await page.waitForSelector('table.course');
    await page.click('[data-tab=score]'); await page.waitForSelector('.scorer li');
    await page.click('[data-tab=board]'); await page.click('[data-bm=leaders]'); await page.locator('[data-player]').first().click();
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

  if (browser) await test('page: get a tournament going on this phone, make it official, chat, tee time and calendar file', async () => {
    const { page, errors, ctx } = await open({ ctx: { acceptDownloads: true } });
    await page.click('#rally'); await page.fill('#nn', 'Test Rally'); await page.fill('#nd', '2026-11-21'); await page.fill('#nme', 'Alpha Test');
    await page.click('[data-nk=teams]'); await page.locator('#nf [type=submit]').click();
    await page.waitForFunction(() => window.FW.debug.S.tab === 'going');
    assert.match(await page.locator('body').textContent(), /Sat, Nov 21/);
    eq(await page.isDisabled('#rgo'), true, 'official needs at least two who are in');
    await page.evaluate(() => window.FW.ui.write({ 'rally.r.bravo00001': { n: 'Bravo Test', s: 'in', at: Date.now() } }));
    await page.waitForFunction(() => !document.querySelector('#rgo').disabled);
    page.once('dialog', d => d.accept()); // "Make it official?" asks first
    await page.click('#rgo'); await page.waitForFunction(() => window.FW.debug.S.tab === 'teams');
    const code = await page.evaluate(() => window.FW.debug.S.code);
    eq(await page.evaluate(c => Object.keys(JSON.parse(localStorage.getItem('fw:ev:' + c)).p).length, code), 2);
    await page.click('[data-tab=chat]'); await page.fill('#ct', '<b>Tee</b> it up'); await page.locator('#cf [type=submit]').click();
    await page.waitForSelector('.chat li.cm.mine'); assert.match(await page.locator('.chat li.cm.mine').textContent(), /<b>Tee<\/b> it up/, 'chat shown as text');
    await page.click('[data-tab=more]'); await page.fill('[data-ttg="1"]', '08:10'); await page.locator('[data-ttg="1"]').dispatchEvent('change');
    await page.waitForSelector('.teecard'); assert.match(await page.locator('.teecard').textContent(), /8:10 AM/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#addcal')]);
    assert.match(dl.suggestedFilename(), /\.ics$/);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: the Games tab bingo card, tap three in a row', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Bingo Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=games]'); await page.waitForSelector('.bgo button');
    eq(await page.locator('.bgo button').count(), 9);
    const sqs = await page.evaluate(() => { const S = window.FW.debug.S, C = window.FairwayCore, me = window.FW.ui.me(), c = C.bingoCard(S.ev, me.id);
      const l = [[3, 4, 5], [1, 4, 7], [0, 4, 8], [2, 4, 6]].find(x => x.every(i => c[i] < 0 || c[i] >= C.BINGO_AUTO)); return l.filter(i => i !== 4).map(i => c[i]); });
    for (const q of sqs) await page.click(`.bgo [data-sq="${q}"]`);
    await page.waitForSelector('.bgo.won');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: side games, pick skins and the snake, mark a three-putt, see who owes who', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Skins Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.evaluate(() => { const S = window.FW.debug.S, C = window.FairwayCore, me = window.FW.ui.me();
      const id = C.newPid(); window.FW.ui.write({ ['p.' + id]: C.newPlayer(S.ev, { name: 'Bravo Test', tee: S.ev.course.tees[0].id, g: 1, st: 1 }),
        ['p.' + me.id + '.s.1_1']: 3, ['p.' + id + '.s.1_1']: 4 }); });
    await page.click('[data-tab=games]'); await page.click('#betset');
    await page.check('[data-g=skins]'); await page.check('[data-g=snake]'); await page.selectOption('[data-amt=snake]', '5');
    await page.click('#betsave'); await page.waitForSelector('.betg');
    ok(/Alpha Test wins the skin/.test(await page.locator('.betg').first().textContent()), 'the birdie wins hole 1');
    await page.click('#betmark'); await page.selectOption('#bh', '1');
    await page.locator('.sheet [data-tp]').last().check(); await page.click('#bmsave');
    await page.waitForFunction(() => /holds the snake/.test(document.body.textContent));
    ok(/Bravo Test\s*owes\s*Alpha Test/.test(await page.locator('.owes').textContent()), 'who owes who shows up');
    ok(/never moves money/.test(await page.textContent('body')));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: once your score is in, the hole review saves taps on this phone and shows the next hole', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Review Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=score]'); await page.waitForSelector('.scorer');
    eq(await page.locator('.hreview').count(), 0, 'no review before a score');
    await page.locator('.scorer li').first().locator('.val').click();
    await page.waitForSelector('.hreview');
    ok(/Up next/.test(await page.textContent('.hreview')), 'the next hole is shown');
    const par = await page.evaluate(() => window.FW.debug.S.ev.course.holes[window.FW.debug.S.hole - 1].par);
    if (par > 3) await page.click('[data-hn=t][data-v=left]');
    await page.click('[data-hn=p][data-v="2"]');
    await page.waitForFunction(() => /2 putts/.test(document.querySelector('.hreview').textContent));
    const saved = await page.evaluate(() => JSON.stringify(localStorage)); ok(/fw:hn:/.test(saved), 'kept on this phone');
    const shared = await page.evaluate(() => JSON.stringify(window.FW.debug.S.ev)); ok(!/"putts"|"hn"/.test(shared), 'never in the shared tournament');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: Jack keeps a caddie note for the hole on this phone, and it shows on the Score tab', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Notes Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=score]'); await page.waitForSelector('#jackopen');
    await page.click('#jackopen'); await page.fill('#jn', 'Stay up on the right'); await page.click('#jsave');
    await page.waitForFunction(() => /Stay up on the right/.test(document.querySelector('#jackopen').textContent));
    const saved = await page.evaluate(() => localStorage.getItem('fw:cnotes')); ok(/Stay up on the right/.test(saved), 'kept on this phone');
    const shared = await page.evaluate(() => JSON.stringify(window.FW.debug.S.ev)); ok(!/Stay up on the right/.test(shared), 'never in the shared tournament');
    await page.click('#jset'); await page.click('[data-js=lang][data-v=crude]'); await page.waitForSelector('#jadult');
    await page.click('#jno'); eq(await page.locator('[data-js=lang][data-v=clean]').getAttribute('aria-pressed'), 'true', 'still Clean after saying no');
    await page.check('#jkid'); ok(await page.locator('[data-js=lang][data-v=lot]').isDisabled(), 'a kid profile locks the other levels');
    await page.click('#jdone');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('fw:jack')).lang), 'clean');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: the round recap tops the board once every card is in, and the season race shows on Games', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Recap Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.evaluate(() => { const S = window.FW.debug.S, C = window.FairwayCore, me = window.FW.ui.me(), id = C.newPid(), patch = {};
      patch['p.' + id] = C.newPlayer(S.ev, { name: 'Bravo Test', tee: S.ev.course.tees[0].id, g: 1, st: 1 });
      S.ev.course.holes.forEach((h, i) => { patch['p.' + me.id + '.s.1_' + (i + 1)] = h.par; });
      window.FW.ui.write(patch);
      const p2 = {}; window.FW.debug.S.ev.course.holes.forEach((h, i) => { p2['p.' + id + '.s.1_' + (i + 1)] = h.par + 1; }); window.FW.ui.write(p2); });
    await page.click('[data-tab=board]'); await page.waitForSelector('.recap');
    ok(/Alpha Test/.test(await page.textContent('.recap .rc-champ')));
    await page.click('#rcshare'); await page.waitForFunction(() => /Shared in the chat/.test(document.querySelector('#rcshare').textContent));
    await page.click('[data-tab=games]'); await page.waitForSelector('.season li');
    ok(/Alpha Test · you/.test(await page.textContent('.season')), 'you are marked in the race');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: My bag saves on this phone and the next par 3 names a club from it', async () => {
    const { page, errors, ctx } = await open();
    await page.click('#new'); await page.fill('#nn', 'Bag Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=score]'); await page.waitForSelector('#jackopen');
    await page.click('#jackopen'); await page.click('#jbag'); await page.fill('[data-yds="7i"]', '172'); await page.click('#bagsave');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('fw:bag')).y['7i']), 172);
    await page.waitForSelector('#jn'); await page.click('.sheet-h .x');
    const before = await page.evaluate(() => { const ev = window.FW.debug.S.ev; return ev.course.holes.findIndex(x => x.par === 3); });
    await page.evaluate(h => { window.FW.debug.S.hole = h; window.FW.debug.render(); }, before);
    await page.locator('.scorer li').first().locator('.val').click();
    await page.waitForSelector('.hreview');
    ok(/From your bag:/.test(await page.textContent('.hreview')), 'the par 3 coming up names a club');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test('page: hole map, add a picture, set the tee and green, tap to measure, GPS yards once the green is marked', async () => {
    const { page, errors, ctx } = await open({ ctx: { geolocation: { latitude: 40, longitude: -75, accuracy: 4 }, permissions: ['geolocation'] } });
    await page.click('#new'); await page.fill('#nn', 'Map Day'); await page.fill('#nme', 'Alpha Test');
    await page.locator('#nf [type=submit]').click(); await page.waitForFunction(() => window.FW.debug.S.ev);
    await page.click('[data-tab=score]'); await page.waitForSelector('#mapopen'); await page.click('#mapopen');
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#5a8f4e'; x.fillRect(0, 0, 300, 600); return c.toDataURL('image/png').split(',')[1]; });
    await page.setInputFiles('#mapimg', { name: 'hole.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector('.hmap img');
    const box = await page.locator('.hmap').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9); await page.waitForFunction(() => /middle of the green/.test(document.querySelector('#maphint').textContent));
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.1); await page.waitForFunction(() => /Tap anywhere/.test(document.querySelector('#maphint').textContent));
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
    await page.waitForFunction(() => /From the tee: \d+ yds · to the green: \d+ yds/.test(document.querySelector('#maphint').textContent));
    await page.click('#gpson'); await page.waitForSelector('[data-mk=gc]');
    await ctx.setGeolocation({ latitude: 40.003, longitude: -75, accuracy: 4 }); await page.waitForTimeout(3500);
    await page.click('[data-mk=gc]');
    await ctx.setGeolocation({ latitude: 40.0012, longitude: -75, accuracy: 4 }); await page.waitForTimeout(3500);
    await page.waitForFunction(() => { const b = document.querySelector('.gyds .mid b'); return b && +b.textContent > 150 && +b.textContent < 250; });
    const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('fw:map:') === 0).length); eq(saved, 1, 'the map is kept on this phone');
    const shared = await page.evaluate(() => JSON.stringify(window.FW.debug.S.ev)); ok(!/40\.003|"gc"|base64/.test(shared), 'no location or picture in the shared tournament');
    await page.click('.sheet-h .x');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await test("page: who's where shows each group as a dot on the Course view, yours in gold", async () => {
    const { page, errors, ctx } = await open();
    await page.click('#demo'); await page.waitForSelector('.lb tbody tr');
    await page.click('[data-bm=course]'); await page.waitForSelector('.where svg');
    const dots = await page.locator('.where .wdot').count(), out = await page.evaluate(() => window.FairwayCore.groups(window.FW.debug.S.ev).filter(g => !g.done).length);
    eq(dots, out, 'one dot per group still out'); ok(/Group \d+ (on|starting on) hole \d+/.test(await page.textContent('.wlist')));
    ok(/never by anyone's location/.test(await page.textContent('#bsub')));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll at 390 px, got ' + wide);
    deq(errors, []); await ctx.close();
  });

  if (browser) await browser.close();
  if (server) server.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' FAILED' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
