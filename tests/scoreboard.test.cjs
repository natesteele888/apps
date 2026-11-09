// Scoreboard tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/scoreboard.test.cjs
// Uses Google Chrome on the Mac, Playwright's Chromium elsewhere (lib.cjs CHROME). Starts its own static server on a free port.
// Part 1 tests core.js on its own (hand-computed expectations + a replay/undo property test).
// Part 2 drives the real page: every screen, the flows, storage, backup, XSS, offline, the Back button, layout.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/scoreboard/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07';
const NOW = 1794000000000; // a fixed instant, only used for the clock math
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deq = (a, b, m) => { try { assert.deepStrictEqual(a, b); } catch (e) { const ks = (a && typeof a === 'object' && b && typeof b === 'object') ? Object.keys(Object.assign({}, a, b)).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => k + ': got ' + JSON.stringify(a[k]) + ' want ' + JSON.stringify(b[k])).join('; ') : 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b); throw new Error((m ? m + ' -- ' : '') + ks); } };

/* ---------- core helpers ---------- */
const G = (sport, o) => C.newGame(sport, Object.assign({ id: 'testgame1', now: NOW, date: TODAY }, o || {}));
const T = (g, a) => C.step(g, Object.assign({ t: NOW }, typeof a === 'string' ? { type: a } : a));
const run = (g, list) => list.reduce((s, a) => T(s, a), g);
const times = (n, a) => Array.from({ length: n }, () => a);
const strip = (g, drop) => { const o = JSON.parse(JSON.stringify(g)); delete o.u; (drop || []).forEach(k => delete o[k]); return o; };
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

(async () => {
  /* =====================================================================================
     PART 1: core.js
     ===================================================================================== */
  await test('core: version, sports, defaults, new games start clean', () => {
    eq(C.VERSION, 'Scoreboard v1');
    deq(C.SPORT_IDS, ['basketball', 'baseball', 'football', 'generic']);
    const b = G('basketball');
    eq(b.id, 'testgame1');
    deq(b.score, [0, 0]); eq(b.period, 1); deq(b.clock, { run: false, end: 0, left: 480000 }); deq(b.to, [2, 2]); deq(b.fouls, [0, 0]); eq(b.poss, -1);
    deq(b.teams.map(t => t.n), ['HOME', 'AWAY']);
    const f = G('football');
    deq(f.clock, { run: false, end: 0, left: 720000 }); deq([f.down, f.togo, f.to[0]], [1, 10, 3]);
    const s = G('baseball');
    deq([s.inning, s.half, s.balls, s.strikes, s.outs, s.final], [1, 'top', 0, 0, 0, false]); eq(s.cfg.innings, 6);
    deq(s.inn, [[0], [0]]);
    const x = G('generic'); eq(x.label, ''); eq(x.clock, undefined);
    eq(G('nonsense').sport, 'generic', 'unknown sport falls back');
  });

  await test('core: fmtClock boundaries (M:SS above a minute, tenths below)', () => {
    eq(C.fmtClock(480000), '8:00'); eq(C.fmtClock(60000), '1:00'); eq(C.fmtClock(60001), '1:01'); eq(C.fmtClock(119001), '2:00');
    eq(C.fmtClock(59999), '59.9'); eq(C.fmtClock(5400), '5.4'); eq(C.fmtClock(600), '0.6'); eq(C.fmtClock(100), '0.1');
    eq(C.fmtClock(0), '0:00'); eq(C.fmtClock(-5), '0:00'); eq(C.fmtClock(NaN), '0:00'); eq(C.fmtClock(5999000), '99:59');
  });

  await test('core: clock math is timestamp based (start, stop, sleep, set, adjust)', () => {
    let g = G('basketball');
    g = T(g, { type: 'clockStart', t: 1000 });
    deq(g.clock, { run: true, end: 481000, left: 480000 });
    eq(C.remaining(g.clock, 11000), 470000, 'ten seconds later');
    eq(C.remaining(g.clock, 1000), 480000);
    eq(C.remaining(g.clock, 481000), 0);
    eq(C.remaining(g.clock, 9999999), 0, 'after the phone slept past zero');
    eq(C.remaining(g.clock, 500), 480000, 'never more than it started with');
    const stopped = T(g, { type: 'clockStop', t: 11000 });
    deq(stopped.clock, { run: false, end: 0, left: 470000 });
    eq(C.remaining(stopped.clock, 99999999), 470000, 'a stopped clock does not move');
    eq(T(stopped, { type: 'clockStop', t: 12000 }), stopped, 'stopping a stopped clock is a no-op');
    const again = T(stopped, { type: 'clockStart', t: 20000 });
    deq(again.clock, { run: true, end: 490000, left: 470000 });
    eq(T(again, { type: 'clockStart', t: 21000 }), again, 'starting a running clock is a no-op');
    // set to 1:30 while running keeps it running from the new time
    const set = T(again, { type: 'clockSet', ms: 90000, t: 30000 });
    deq(set.clock, { run: true, end: 120000, left: 90000 });
    // set while stopped
    deq(T(stopped, { type: 'clockSet', ms: 45000, t: 5 }).clock, { run: false, end: 0, left: 45000 });
    // adjust: +10 s on a stopped 7:50 clock, and never below zero
    deq(T(stopped, { type: 'clockAdjust', d: 10000, t: 5 }).clock, { run: false, end: 0, left: 480000 });
    eq(T(stopped, { type: 'clockAdjust', d: -9999999, t: 5 }).clock.left, 0);
    // reset goes back to a full period
    eq(T(stopped, { type: 'clockReset', t: 5 }).clock.left, 480000);
    // no timestamp, no change
    eq(C.apply(g, { type: 'clockStop' }), g);
    // starting at 0:00 does nothing
    const zero = T(G('basketball'), { type: 'clockSet', ms: 0, t: 1 });
    eq(T(zero, { type: 'clockStart', t: 2 }), zero);
    eq(C.apply(G('generic'), { type: 'clockStart', t: 1 }).clock, undefined, 'generic has no clock');
  });

  await test('core: expiry, buzzDue and a stale buzz after the screen slept', () => {
    let g = T(G('basketball'), { type: 'clockSet', ms: 5000, t: 0 });
    g = T(g, { type: 'clockStart', t: 100 });
    eq(g.clock.end, 5100);
    eq(C.expired(g.clock, 5099), false); eq(C.expired(g.clock, 5100), true);
    eq(C.buzzDue(g.clock, 5099), false, 'not yet');
    eq(C.buzzDue(g.clock, 5100), true, 'at zero');
    eq(C.buzzDue(g.clock, 9100), true, 'four seconds late is still fresh');
    eq(C.buzzDue(g.clock, 9101), false, 'more than four seconds late is stale');
    eq(C.buzzDue(C.stopped(0), 9999), false, 'a stopped clock never buzzes');
    const x = T(g, { type: 'clockExpire', t: 5200 });
    deq(x.clock, { run: false, end: 0, left: 0 });
    eq(T(g, { type: 'clockExpire', t: 5000 }), g, 'expire before time is a no-op');
    eq(x.u.length, 0, 'clock actions are not in the undo log');
  });

  await test('core: basketball scoring, floors at zero, labels in words', () => {
    let g = run(G('basketball'), [{ type: 'score', team: 0, d: 3 }, { type: 'score', team: 0, d: 2 }, { type: 'score', team: 0, d: 1 }, { type: 'score', team: 1, d: 2 }, { type: 'score', team: 0, d: -1 }]);
    deq(g.score, [5, 2]);
    const z = run(g, times(5, { type: 'score', team: 1, d: -1 }));
    deq(z.score, [5, 0]);
    eq(z.u.length, 5 + 2, 'only the two real -1s were recorded (5 earlier + 2)');
    deq(C.undoLog(g), ['HOME -1', 'AWAY +2', 'HOME +1', 'HOME +2', 'HOME +3']);
    eq(C.summary(g), 'HOME 5 - 2 AWAY');
    const big = T(G('basketball'), { type: 'set', k: 'score', team: 0, v: 5000 });
    eq(big.score[0], 999, 'capped at 999');
  });

  await test('core: basketball periods, quarter points, fouls reset, bonus', () => {
    let g = G('basketball');
    g = run(g, [{ type: 'score', team: 0, d: 3 }, { type: 'score', team: 0, d: 3 }, { type: 'score', team: 0, d: 2 }, { type: 'score', team: 1, d: 3 }, { type: 'score', team: 1, d: 3 }, { type: 'score', team: 1, d: 2 }]); // 8-8
    g = run(g, [{ type: 'score', team: 0, d: 2 }, { type: 'score', team: 1, d: -1 }]); // 10 - 7
    g = run(g, times(4, { type: 'foul', team: 0, d: 1 }));
    deq(C.bonus(g), [false, false], '4 fouls is not the bonus');
    g = T(g, { type: 'foul', team: 0, d: 1 });
    deq(g.fouls, [5, 0]);
    deq(C.bonus(g), [false, true], 'home fouled 5 times, so AWAY shoots in the bonus: the light is on the away side');
    g = run(g, [{ type: 'timeout', team: 0, d: -1 }]);
    deq(g.to, [1, 2]);
    g = T(g, { type: 'period', d: 1, t: 1 });
    eq(g.period, 2); deq(g.pts, [[10, 7]]); deq(g.fouls, [0, 0], 'fouls reset each period'); deq(g.to, [1, 2], 'timeouts do not reset between Q1 and Q2');
    deq(g.clock, { run: false, end: 0, left: 480000 }, 'a fresh full clock');
    g = T(g, { type: 'score', team: 1, d: 3 });
    deq(C.periodScores(g), [[10, 7], [0, 3]]);
    g = T(g, { type: 'period', d: 1, t: 2 });
    deq(g.to, [2, 2], 'timeouts refill at the half (start of the 3rd quarter)');
    g = run(g, [{ type: 'period', d: 1, t: 3 }, { type: 'period', d: 1, t: 4 }]);
    eq(g.period, 5); eq(C.periodAbbr(g), 'OT'); eq(C.periodWord(g), 'Overtime');
    deq(g.clock.left, 180000, 'overtime is 3 minutes by default'); deq(g.to, [1, 1], 'one overtime timeout each');
    g = T(g, { type: 'period', d: 1, t: 5 }); eq(C.periodAbbr(g), '2OT');
    deq(C.lineScore(g).cols, ['1', '2', '3', '4', 'OT', '2OT']);
    // going back one period drops that period's stored points
    const back = T(g, { type: 'period', d: -1, t: 6 }); eq(back.period, 5); eq(back.pts.length, 4);
    // bonus setting
    const b7 = G('basketball', { cfg: { bonusAt: 7 } });
    deq(C.bonus(run(b7, times(6, { type: 'foul', team: 1 }))), [false, false]);
    deq(C.bonus(run(b7, times(7, { type: 'foul', team: 1 }))), [true, false]);
    deq(C.bonus(run(G('basketball', { cfg: { bonusAt: 0 } }), times(12, { type: 'foul', team: 1 }))), [false, false], 'bonus off');
    // fouls come back down by one but not below zero
    eq(T(G('basketball'), { type: 'foul', team: 0, d: -1 }).fouls[0], 0);
  });

  await test('core: correcting a score down after the period ended never shows a negative quarter (found by the property test)', () => {
    let g = run(G('basketball'), [{ type: 'score', team: 0, d: 3 }, { type: 'score', team: 1, d: 2 }, { type: 'period', d: 1, t: 1 }]);
    deq(C.periodScores(g), [[3, 2], [0, 0]]);
    const back3 = T(g, { type: 'score', team: 0, d: -1 });   // 2-2: the missing point comes off quarter 1
    deq(C.periodScores(back3), [[2, 2], [0, 0]]);
    const none = run(g, [{ type: 'score', team: 0, d: -1 }, { type: 'score', team: 0, d: -1 }, { type: 'score', team: 0, d: -1 }]);
    deq(C.periodScores(none), [[0, 2], [0, 0]]); deq(none.score, [0, 2]);
    // three periods: the debt is paid by the latest earlier period first
    let h = run(G('basketball'), [{ type: 'score', team: 0, d: 2 }, { type: 'period', d: 1, t: 1 }, { type: 'score', team: 0, d: 3 }, { type: 'period', d: 1, t: 2 }, { type: 'score', team: 0, d: -3 }]);
    deq(C.periodScores(h).map(x => x[0]), [2, 0, 0], 'home had 2 and 3, then lost 3 in Q3: the 3 comes off Q2');
    h = T(h, { type: 'set', k: 'score', team: 0, v: 1 });
    deq(C.periodScores(h).map(x => x[0]), [1, 0, 0], 'fixed down to 1: Q2 gives its 3 and Q1 gives 1 more');
    eq(C.periodScores(h).reduce((a, x) => a + x[0], 0), h.score[0], 'and the columns still add up to the score');
  });

  await test('core: basketball in halves, fouls reset each half, timeouts never refill', () => {
    let h = G('basketball', { cfg: { periods: 2 } });
    h = run(h, [{ type: 'foul', team: 0 }, { type: 'foul', team: 0 }, { type: 'timeout', team: 1, d: -1 }]);
    h = T(h, { type: 'period', d: 1, t: 1 });
    eq(C.periodAbbr(h), '2H'); eq(C.periodWord(h), 'Half 2');
    deq(h.fouls, [0, 0], 'a new half resets fouls'); deq(h.to, [2, 2], 'timeouts refill at the half');
    h = T(h, { type: 'period', d: 1, t: 2 }); eq(C.periodAbbr(h), 'OT');
    // quarters, fouls reset each half, timeouts never refill
    let q = G('basketball', { cfg: { foulReset: 'half', toReset: 'game' } });
    q = run(q, [{ type: 'foul', team: 0 }, { type: 'foul', team: 0 }, { type: 'foul', team: 0 }, { type: 'timeout', team: 0, d: -1 }]);
    q = T(q, { type: 'period', d: 1, t: 1 });
    deq(q.fouls, [3, 0], 'fouls carry from Q1 to Q2 when they reset by the half');
    q = T(q, { type: 'period', d: 1, t: 2 });
    deq(q.fouls, [0, 0], 'and clear at the start of the 3rd quarter'); deq(q.to, [1, 2], 'timeouts did not refill');
  });

  await test('core: possession arrow flips, can be set, and undoes', () => {
    let g = G('basketball');
    g = T(g, { type: 'poss', team: 'flip' }); eq(g.poss, 0, 'first flip points at home');
    g = T(g, { type: 'poss', team: 'flip' }); eq(g.poss, 1);
    eq(T(g, { type: 'poss', team: 1 }), g, 'setting it to what it already is changes nothing');
    deq(C.undoLog(g), ['Possession: AWAY', 'Possession: HOME']);
    g = C.undo(g); eq(g.poss, 0); g = C.undo(g); eq(g.poss, -1);
  });

  await test('core: football downs, turnover on downs, first down, yards, scoring', () => {
    let g = G('football');
    g = run(g, [{ type: 'score', team: 0, d: 6 }, { type: 'score', team: 0, d: 1 }, { type: 'score', team: 1, d: 3 }, { type: 'score', team: 1, d: 2 }]);
    deq(g.score, [7, 5]);
    g = T(g, { type: 'poss', team: 0 });
    g = run(g, [{ type: 'nextDown' }, { type: 'nextDown' }]);
    deq([g.down, g.togo], [3, 10]);
    g = run(g, [{ type: 'togo', d: -6 }, { type: 'ballOn', text: 'OWN 35' }]);
    deq([g.togo, g.ballOn], [4, 'OWN 35']);
    const fd = T(g, { type: 'firstDown' });
    deq([fd.down, fd.togo], [1, 10]);
    g = T(g, { type: 'nextDown' }); eq(g.down, 4);
    const t = T(g, { type: 'nextDown' });
    deq([t.down, t.togo, t.poss, t.ballOn], [1, 10, 1, ''], 'after 4th down the ball goes to the other team, 1st and 10');
    eq(C.undoLog(t)[0], 'Turnover on downs');
    // goal to go
    eq(T(G('football'), { type: 'togo', d: -99 }).togo, 0);
    eq(T(G('football'), { type: 'down', n: 3 }).down, 3);
    eq(T(G('football'), { type: 'down', n: 9 }).down, 4, 'down is clamped to 4');
    // possession with nobody set stays unset after a turnover
    eq(T(G('football'), { type: 'turnover' }).poss, -1);
    // timeouts: 3 per half, refill at the half only
    let f = T(G('football'), { type: 'timeout', team: 0, d: -1 });
    deq(f.to, [2, 3]);
    f = T(f, { type: 'period', d: 1, t: 1 }); deq(f.to, [2, 3]);
    f = T(f, { type: 'period', d: 1, t: 2 }); deq(f.to, [3, 3]);
    eq(f.clock.left, 720000);
    f = run(f, [{ type: 'period', d: 1, t: 3 }, { type: 'period', d: 1, t: 4 }]); eq(C.periodAbbr(f), 'OT'); eq(f.clock.left, 300000);
    // first down distance follows the rules setting
    const f5 = G('football', { cfg: { firstDown: 5 } }); eq(f5.togo, 5);
  });

  await test('core: generic scoring and label', () => {
    let g = run(G('generic'), [{ type: 'score', team: 0, d: 10 }, { type: 'score', team: 0, d: 5 }, { type: 'score', team: 1, d: 1 }, { type: 'score', team: 0, d: -10 }]);
    deq(g.score, [5, 1]);
    g = C.step(g, { type: 'plabel', text: '  Round 2  ', t: 1 });
    eq(g.label, 'Round 2'); eq(g.u.length, 4, 'a label is not in the undo log');
    eq(C.step(g, { type: 'plabel', text: 'Round 2', t: 2 }), g);
    eq(C.apply(g, { type: 'plabel', text: 'x'.repeat(80) }).label.length, 24);
    eq(C.apply(g, { type: 'period', d: 1 }), g, 'periods do nothing here');
  });

  await test('core: baseball count, walk, strikeout, foul rule, three outs flip the half', () => {
    let g = G('baseball');
    g = run(g, times(3, 'ball')); eq(g.balls, 3);
    const walk = T(g, 'ball');
    deq([walk.balls, walk.strikes], [0, 0]); eq(C.flashFor(g, walk, { type: 'ball' }), 'BB'); eq(C.undoLog(walk)[0], 'Ball four (walk)');
    g = run(g, ['strike']); deq([g.balls, g.strikes], [3, 1]);
    const f1 = T(g, 'foul'); eq(f1.strikes, 2, 'a foul with 1 strike is strike 2');
    const f2 = T(f1, 'foul');
    eq(f2, f1, 'FOUL at 2 strikes changes nothing (same object)'); eq(f2.u.length, f1.u.length, 'and adds nothing to the undo log');
    eq(f2.strikes, 2);
    const k = T(f1, 'strike');
    deq([k.outs, k.balls, k.strikes], [1, 0, 0], 'strike three is an out and clears the count'); eq(C.flashFor(f1, k, { type: 'strike' }), 'K');
    eq(C.undoLog(k)[0], 'Strike three (out)');
    // hit clears the count and credits the batting team (away in the top)
    const h = T(run(G('baseball'), ['ball', 'ball', 'strike']), 'hit'); deq([h.balls, h.strikes, h.hits], [0, 0, [0, 1]]);
    // error credits the fielding team (home in the top)
    deq(T(G('baseball'), 'error').errs, [1, 0]);
    // three outs flip to the bottom, then to the next inning
    let o = run(G('baseball'), [{ type: 'run', d: 2 }, 'out', 'out']);
    deq([o.outs, o.half, o.inning, o.score], [2, 'top', 1, [0, 2]], 'runs in the top go to the away team');
    const third = T(o, 'out'); deq([third.outs, third.half, third.inning], [0, 'bot', 1]); eq(C.flashFor(o, third, { type: 'out' }), 'SIDE');
    o = run(third, [{ type: 'run', d: 1 }, 'endHalf']);
    deq([o.half, o.inning, o.score], ['top', 2, [1, 2]]); deq(o.inn, [[1, 0], [2, 0]]);
    eq(o.final, false);
    // runs never go below zero and -1 on nothing is a no-op
    const none = G('baseball'); eq(T(none, { type: 'run', d: -1 }), none);
    deq(T(run(none, [{ type: 'run', d: 2 }]), { type: 'run', d: -1 }).score, [0, 1]);
  });

  await test('core: baseball game over (home ahead after the top, walk-off, tie with and without extras)', () => {
    // innings 1. Home ahead after the top half: the game is over and home does not bat
    let a = G('baseball', { cfg: { innings: 1 } });
    a = T(a, { type: 'set', k: 'inn', team: 0, i: 0, v: 3 }); deq(a.score, [3, 0]);
    a = T(a, 'endHalf'); eq(a.final, true, 'home ahead after the top of the last inning'); eq(a.half, 'top');
    const ls = C.lineScore(a);
    deq(ls.rows[1].cells, ['X'], 'home line shows X'); deq(ls.rows[0].cells, ['0']);
    eq(C.flashFor(T(G('baseball', { cfg: { innings: 1 } }), { type: 'set', k: 'inn', team: 0, i: 0, v: 3 }), a, { type: 'endHalf' }), 'FINAL');
    eq(T(a, 'ball'), a, 'no more balls once it is final'); eq(T(a, 'out'), a);
    const re = T(a, 'reopen'); eq(re.final, false, 'reopen if it was a mistake');
    // walk-off
    let w = G('baseball', { cfg: { innings: 1 } });
    w = run(w, [{ type: 'run', d: 2 }, 'endHalf']); deq([w.half, w.final], ['bot', false]);
    w = T(w, { type: 'run', d: 2 }); deq([w.score, w.final], [[2, 2], false], 'tied is not a walk-off');
    const wo = T(w, { type: 'run', d: 1 }); deq([wo.score, wo.final], [[3, 2], true]); eq(C.flashFor(w, wo, { type: 'run' }), 'FINAL');
    deq(C.lineScore(wo).rows[1].cells, ['3'], 'the home cell shows the runs');
    // walk-off does not trigger before the last inning
    const e = T(run(G('baseball'), ['endHalf']), { type: 'run', d: 5 }); eq(e.final, false);
    // tied after the last inning: extras continue, or it is a tie
    let x = run(G('baseball', { cfg: { innings: 1 } }), [{ type: 'run', d: 1 }, 'endHalf', { type: 'run', d: 1 }]);
    eq(x.final, false, 'tied game in the bottom with a walk-off not reached (not ahead)');
    x = T(x, 'endHalf'); deq([x.final, x.inning, x.half], [false, 2, 'top'], 'extra innings'); deq(x.inn, [[1, 0], [1, 0]]);
    let y = run(G('baseball', { cfg: { innings: 1, extra: false } }), [{ type: 'run', d: 1 }, 'endHalf', { type: 'run', d: 1 }, 'endHalf']);
    eq(y.final, true, 'no extras: a tie is final'); eq(C.statusText(y, 'final'), 'Final, 1 inning');
    // the away team ahead after the last bottom is final too
    let z = run(G('baseball', { cfg: { innings: 1 } }), [{ type: 'run', d: 4 }, 'endHalf', 'endHalf']);
    eq(z.final, true);
  });

  await test('core: mercy rule only ever shows a banner', () => {
    const cfg = { mercyRuns: 10, mercyInning: 4, innings: 6 };
    let g = T(G('baseball', { cfg }), { type: 'setInning', inning: 4, half: 'bot' });
    eq(C.mercy(g), false, '0-0');
    const home = T(g, { type: 'set', k: 'inn', team: 0, i: 3, v: 10 }); eq(C.mercy(home), true, 'home up 10 in the bottom of the 4th');
    eq(C.mercy(T(g, { type: 'set', k: 'inn', team: 0, i: 3, v: 9 })), false, 'up 9 is not enough');
    const away = T(g, { type: 'set', k: 'inn', team: 1, i: 3, v: 10 }); eq(C.mercy(away), false, 'away up 10 has to wait for the whole 4th inning');
    let five = T(away, { type: 'setInning', inning: 5, half: 'top' }); eq(C.mercy(five), true, 'after 4 full innings away up 10 counts');
    eq(five.final, false, 'never ends the game');
    const top4 = T(away, { type: 'setInning', inning: 4, half: 'top' }); eq(C.mercy(top4), false);
    const off = T(five, { type: 'cfg', cfg: { mercyRuns: 0 } }); eq(C.mercy(off), false, 'off');
    eq(C.flashFor(five, T(five, 'ball'), { type: 'ball' }), null);
    eq(C.flashFor(T(five, { type: 'set', k: 'inn', team: 1, i: 3, v: 0 }), five, { type: 'set' }), 'MERCY', 'the banner flashes when the rule is first reached');
  });

  await test('core: pitch counter counts the fielding team, foul at 2 strikes still counts a pitch', () => {
    let g = G('baseball', { cfg: { pitch: true } });
    g = run(g, ['ball', 'strike', 'foul', 'foul']);   // 1,2,3 then foul at 2 strikes = pitch 4, strikes stay 2
    deq([g.strikes, g.pitches], [2, [4, 0]], 'home is in the field in the top half');
    g = T(g, 'hit'); deq(g.pitches, [5, 0]); g = T(g, 'error'); deq(g.pitches, [6, 0]);
    g = T(g, 'out'); deq(g.pitches, [7, 0]);
    g = run(g, ['endHalf', 'ball']); deq(g.pitches, [7, 1], 'the other team is now in the field');
    g = T(g, { type: 'set', k: 'pitches', team: 0, v: 0 }); deq(g.pitches, [0, 1], 'a new pitcher: set it to 0');
    const off = run(G('baseball'), ['ball', 'strike']); deq(off.pitches, [0, 0], 'off by default');
  });

  await test('core: fix-up numbers (set) and the setInning jump', () => {
    let g = G('baseball');
    g = run(g, ['endHalf', 'endHalf', 'endHalf']); // top 1, bot 1, top 2 -> now bottom of the 2nd... see below
    deq([g.inning, g.half], [2, 'bot']);
    g = T(g, { type: 'set', k: 'inn', team: 1, i: 0, v: 3 }); deq(g.score, [0, 3]);
    g = T(g, { type: 'set', k: 'inn', team: 0, i: 1, v: 2 }); deq(g.score, [2, 3]); deq(g.inn, [[0, 2], [3, 0]]);
    eq(T(g, { type: 'set', k: 'inn', team: 0, i: 5, v: 2 }), g, 'inning 6 does not exist yet');
    g = T(g, { type: 'set', k: 'hits', team: 1, v: 4 }); deq(g.hits, [0, 4]);
    g = T(g, { type: 'set', k: 'errs', team: 0, v: 2 }); deq(g.errs, [2, 0]);
    eq(C.undoLog(g)[0], 'Fixed HOME errors to 2');
    eq(T(g, { type: 'set', k: 'score', team: 0, v: 9 }), g, 'baseball score comes from the innings');
    const j = T(g, { type: 'setInning', inning: 5, half: 'top' }); deq([j.inning, j.half, j.outs], [5, 'top', 0]); eq(j.inn[0].length, 5);
    deq(j.score, [2, 3], 'jumping ahead keeps the runs');
    // and undo goes back to the exact earlier state
    const back = C.undo(j); deq(strip(back), strip(g));
    // basketball fix-ups
    let b = T(G('basketball'), { type: 'set', k: 'fouls', team: 1, v: 6 }); deq(b.fouls, [0, 6]);
    b = T(b, { type: 'set', k: 'to', team: 0, v: 0 }); deq(b.to, [0, 2]);
    eq(T(b, { type: 'set', k: 'bogus', team: 0, v: 1 }), b);
  });

  await test('core: undo restores exactly, and the stack stops at 100', () => {
    let g = G('generic');
    g = run(g, times(150, { type: 'score', team: 0, d: 1 }));
    eq(g.score[0], 150); eq(g.u.length, 100);
    for (let i = 0; i < 100; i++) g = C.undo(g);
    eq(g.score[0], 50, 'undid 100 of 150'); eq(C.canUndo(g), false);
    eq(C.undo(g), g, 'nothing left to undo');
    // undo of a period change brings back the clock as it was when the period was started
    let b = G('basketball');
    b = T(b, { type: 'clockStart', t: 1000 });
    b = T(b, { type: 'score', team: 0, d: 2, t: 11000 });          // clock is now at 7:50
    const p = T(b, { type: 'period', d: 1, t: 21000 });            // 7:40 left when the period was ended
    deq(p.clock, { run: false, end: 0, left: 480000 });
    const u = C.undo(p);
    eq(u.period, 1); deq(u.clock, { run: false, end: 0, left: 460000 }, 'clock back at 7:40, stopped');
    eq(u.u.length, 1);
  });

  await test('core: name, color and rules changes are not in the undo log; rules follow sensibly', () => {
    let g = G('basketball');
    g = C.step(g, { type: 'team', team: 0, n: 'TEAM A', c: C.COLORS[2].hex, t: 1 });
    deq(g.teams[0], { n: 'TEAM A', c: '#ff5d4d' }); eq(g.u.length, 0);
    eq(C.apply(g, { type: 'team', team: 0, n: '   ' }), g, 'a blank name keeps the old one');
    eq(C.apply(g, { type: 'team', team: 1, n: 'x'.repeat(50) }).teams[1].n.length, 16);
    eq(C.apply(g, { type: 'team', team: 1, c: 'url(javascript:alert(1))' }), g, 'colors must come from the palette');
    // changing the period length while the clock is untouched makes the clock follow
    const l = C.step(g, { type: 'cfg', cfg: { periodSec: 600 }, t: 1 });
    eq(l.clock.left, 600000); eq(l.u.length, 0);
    // but a clock that has been used is left alone
    const used = T(g, { type: 'clockSet', ms: 123000, t: 1 });
    eq(C.apply(used, { type: 'cfg', cfg: { periodSec: 600 } }).clock.left, 123000);
    // timeouts per team: more timeouts adds to what is left
    const g3 = C.apply(T(g, { type: 'timeout', team: 0, d: -1 }), { type: 'cfg', cfg: { timeouts: 4 } });
    deq(g3.to, [3, 4]);
    eq(C.sanitizeCfg('basketball', { periodSec: 1 }).periodSec, 10, 'clamped');
    eq(C.sanitizeCfg('baseball', { innings: 40 }).innings, 9);
  });

  await test('core: result text, status text and the line score (hand checked)', () => {
    // baseball, finished 2-1 in two innings
    let g = G('baseball', { cfg: { innings: 2 } });
    g = run(g, [{ type: 'run', d: 1 }, 'endHalf', { type: 'run', d: 2 }, 'endHalf', 'endHalf', 'endHalf']);
    eq(g.final, true); deq(g.score, [2, 1]);
    eq(C.resultText(g, 'final'), 'HOME 2, AWAY 1 (Final, 2 innings)\nAWAY: 1 0 = 1 R, 0 H, 0 E\nHOME: 2 X = 2 R, 0 H, 0 E');   // home led after the top of the 2nd, so it never batted: X
    eq(C.statusText(g, 'stopped'), 'Stopped, top of the 2nd');
    // a tie lists home first
    const tie = G('generic');
    eq(C.resultText(tie, 'final'), 'HOME 0, AWAY 0 (Final)');
    // basketball sample: 48-41
    const s = C.sampleGames(TODAY, NOW);
    const bb = s.filter(x => x.sport === 'basketball')[0];
    eq(C.resultText(bb, 'final'), 'TEAM A 48, TEAM B 41 (Final)\nTEAM B: 12 9 8 12 = 41\nTEAM A: 10 14 12 12 = 48');
    const fb = s.filter(x => x.sport === 'football')[0];
    eq(C.resultText(fb, 'final'), 'TEAM A 21, TEAM B 14 (Final)\nTEAM B: 0 7 7 0 = 14\nTEAM A: 7 6 0 8 = 21');
    // winner first even when away wins
    const aw = T(G('generic'), { type: 'score', team: 1, d: 5 });
    eq(C.resultText(aw, 'final'), 'AWAY 5, HOME 0 (Final)');
    // overtime
    let ot = G('basketball'); ot = run(ot, [{ type: 'period', d: 1, t: 1 }, { type: 'period', d: 1, t: 2 }, { type: 'period', d: 1, t: 3 }, { type: 'period', d: 1, t: 4 }]);
    eq(C.statusText(ot, 'final'), 'Final/OT'); eq(C.statusText(ot, 'stopped'), 'Stopped in OT');
    eq(C.progressText(ot), 'Overtime, 3:00');
    eq(C.progressText(G('baseball')), 'Top 1st'); eq(C.ordinal(12), '12th'); eq(C.ordinal(22), '22nd'); eq(C.ordinal(3), '3rd');
    // a game still on the 3rd inning shows blanks for innings not played yet
    const mid = run(G('baseball'), [{ type: 'run', d: 1 }]);
    deq(C.lineScore(mid).rows[0].cells, ['1', '', '', '', '', ''], 'away has batted in the 1st');
    deq(C.lineScore(mid).rows[1].cells, ['', '', '', '', '', ''], 'home has not');
  });

  await test('core: sanitize (storage, bad data) and recent games', () => {
    eq(C.sanitizeGame(null), null); eq(C.sanitizeGame('x'), null); eq(C.sanitizeGame({ sport: 'chess' }), null);
    const bad = C.sanitizeGame({ sport: 'basketball', score: [1e9, -5], period: 999, clock: { run: true, end: 'soon', left: 'x' }, to: [99, -1], poss: 7, fouls: ['a'], teams: [{ n: 123, c: 'red' }], cfg: { periodSec: -3 }, u: [{ l: 'ok', p: { score: [1, 1] } }, { l: 'evil', p: { __proto__: 1, hax: 1 } }, 'junk'] });
    deq(bad.score, [999, 0]); eq(bad.period, 30); eq(bad.clock.run, false); deq(bad.to, [9, 0]); eq(bad.poss, 1); deq(bad.fouls, [0, 0]);
    eq(bad.teams[0].n, '123'); eq(bad.teams[0].c, '#29d3e0', 'unknown color falls back'); eq(bad.teams[1].n, 'AWAY'); eq(bad.cfg.periodSec, 10);
    eq(bad.u.length, 1, 'junk undo entries are dropped');
    const bs = C.sanitizeGame({ sport: 'baseball', inning: 3, half: 'bot', inn: [[1, 2, 3], [4]], score: [99, 99], balls: 9, strikes: 9, outs: 9, final: 'yes' });
    deq(bs.inn, [[1, 2, 3], [4, 0, 0]]); deq(bs.score, [6, 4], 'score is rebuilt from the innings'); deq([bs.balls, bs.strikes, bs.outs, bs.final], [3, 2, 2, false]);
    // text stays text (the page escapes it); control characters become spaces
    eq(C.sanitizeGame({ sport: 'generic', label: '<b>x</b>\u0007' }).label, '<b>x</b>');
    // recent games
    const live = T(G('basketball'), { type: 'clockStart', t: 1000 });
    const r = C.makeRecent(live, 'final', 5000);
    deq(r.clock, { run: false, end: 0, left: 476000 }, 'a running clock is frozen when the game is saved'); eq(r.u.length, 0); eq(r.status, 'final'); eq(r.ended, 5000);
    eq(C.makeRecent(live, 'whatever', 1).status, 'final'); eq(C.makeRecent(live, 'stopped', 1).status, 'stopped');
    let list = [];
    for (let i = 0; i < 35; i++) list = C.addRecent(list, C.makeRecent(G('generic', { id: 'g-' + i }), 'final', i));
    eq(list.length, 30); eq(list[0].id, 'g-34'); eq(list[29].id, 'g-5');
    eq(C.addRecent(list, C.makeRecent(G('generic', { id: 'g-10' }), 'final', 99)).length, 30, 'same id replaces, no duplicates');
    eq(C.addRecent(list, C.makeRecent(G('generic', { id: 'g-10' }), 'final', 99))[0].id, 'g-10');
    // sample games are placeholders and flagged
    const smp = C.sampleGames(TODAY, NOW);
    eq(smp.length, 3); assert.ok(smp.every(x => x.sample === true && x.teams[0].n === 'TEAM A' && x.teams[1].n === 'TEAM B'));
    assert.ok(smp.every(x => C.isYMD(x.date))); eq(C.sampleGames('2026-01-02', NOW).filter(x => x.sport === 'basketball')[0].date, '2026-01-01', 'dates count back from today');
    // dates
    eq(C.fmtDate('2026-11-07'), 'Nov 7'); eq(C.fmtDate('2026-13-07'), ''); eq(C.isYMD('2026-02-30'), false); eq(C.isYMD('2026-02-28'), true);
  });

  await test('core: backup file validates (wrong app, wrong version, damaged, duplicates, size cap)', () => {
    const prefs = C.defaultPrefs(); prefs.teams[0].n = 'TEAM A'; prefs.sound = false;
    const smp = C.sampleGames(TODAY, NOW);
    const b = C.makeBackup(prefs, smp, NOW);
    eq(b.app, 'scoreboard'); eq(b.v, 1); eq(b.recent.length, 3); eq(b.prefs.lastBackup, null);
    const ok = C.validateBackup(JSON.parse(JSON.stringify(b)));
    eq(ok.ok, true); eq(ok.recent.length, 3); eq(ok.prefs.sound, false); eq(ok.prefs.teams[0].n, 'TEAM A');
    eq(C.validateBackup(null).ok, false); eq(C.validateBackup([]).ok, false); eq(C.validateBackup({ app: 'locker', v: 1, recent: [] }).ok, false);
    eq(C.validateBackup({ app: 'scoreboard', v: 2, recent: [] }).ok, false); eq(C.validateBackup({ app: 'scoreboard', v: 1 }).ok, false);
    const dup = C.validateBackup({ app: 'scoreboard', v: 1, recent: [smp[0], smp[0], { sport: 'chess' }, 'junk'] });
    eq(dup.ok, true); eq(dup.recent.length, 1); eq(dup.skipped, 3);
    const many = Array.from({ length: 50 }, (x, i) => C.makeRecent(G('generic', { id: 'many-' + i }), 'final', i));
    eq(C.validateBackup({ app: 'scoreboard', v: 1, recent: many }).recent.length, 30);
    // the running game is not part of a backup
    assert.ok(!('game' in b));
  });

  await test('core: hostile text stays inert text, never reaches anything but strings', () => {
    const evil = '<img src=x onerror=x()>';
    const g = C.sanitizeGame({ sport: 'football', teams: [{ n: evil, c: '#29d3e0' }, { n: '"><script>', c: 'red;background:url(x)' }], ballOn: evil, label: evil });
    eq(g.teams[0].n, evil.slice(0, 16)); eq(g.teams[1].c, '#ffc83d'); eq(g.ballOn, evil.slice(0, 12));
    eq(typeof C.resultText(g, 'final'), 'string');
  });

  /* ---- the property test: replay long random sequences, undo all the way back, compare ---- */
  function randAction(sport, r) {
    const pick = a => a[Math.floor(r() * a.length)], team = () => pick([0, 1]);
    const set = () => ({ type: 'set', team: team(), v: Math.floor(r() * 12) });
    const list = {
      basketball: [
        () => ({ type: 'score', team: team(), d: pick([1, 2, 3, -1, -2]) }), () => ({ type: 'foul', team: team(), d: pick([1, 1, 1, -1]) }),
        () => ({ type: 'timeout', team: team(), d: pick([-1, -1, 1]) }), () => ({ type: 'period', d: pick([1, 1, -1]) }),
        () => ({ type: 'poss', team: pick([0, 1, 'flip']) }), () => Object.assign(set(), { k: pick(['score', 'fouls', 'to']) })],
      football: [
        () => ({ type: 'score', team: team(), d: pick([6, 3, 2, 1, -1]) }), () => ({ type: 'timeout', team: team(), d: pick([-1, -1, 1]) }),
        () => ({ type: 'period', d: pick([1, 1, -1]) }), () => ({ type: 'poss', team: pick([0, 1, 'flip']) }), () => ({ type: 'nextDown' }), () => ({ type: 'turnover' }),
        () => ({ type: 'firstDown' }), () => ({ type: 'down', n: 1 + Math.floor(r() * 4) }), () => ({ type: 'togo', d: pick([-5, -1, 1, 5]) }),
        () => ({ type: 'ballOn', text: pick(['', 'OWN 20', 'OPP 45']) }), () => Object.assign(set(), { k: pick(['score', 'to']) })],
      baseball: [
        () => ({ type: 'ball' }), () => ({ type: 'ball' }), () => ({ type: 'strike' }), () => ({ type: 'strike' }), () => ({ type: 'foul' }), () => ({ type: 'out' }),
        () => ({ type: 'hit' }), () => ({ type: 'error' }), () => ({ type: 'run', d: pick([1, 1, 2, -1]) }), () => ({ type: 'endHalf' }),
        () => ({ type: 'setInning', inning: 1 + Math.floor(r() * 9), half: pick(['top', 'bot']) }), () => ({ type: 'reopen' }),
        () => Object.assign(set(), { k: pick(['hits', 'errs', 'pitches']) }), () => ({ type: 'set', k: 'inn', team: team(), i: Math.floor(r() * 3), v: Math.floor(r() * 5) })],
      generic: [() => ({ type: 'score', team: team(), d: pick([1, 5, 10, -1, -5, -10]) })]
    }[sport];
    return pick(list)();
  }
  function replay(sport, seed, steps, withClock) {
    const r = rng(seed), init = G(sport, sport === 'baseball' ? { cfg: { pitch: seed % 2 === 0 } } : {});
    const drop = withClock ? ['clock'] : [];
    let g = init, t = NOW; const before = [];
    for (let i = 0; i < steps; i++) {
      t += Math.floor(r() * 4000);
      if (withClock && g.clock && r() < 0.35) {
        const c = r(), a = c < 0.3 ? { type: 'clockStart' } : c < 0.6 ? { type: 'clockStop' } : c < 0.8 ? { type: 'clockSet', ms: Math.floor(r() * 600000) } : c < 0.9 ? { type: 'clockAdjust', d: Math.floor(r() * 20000) - 10000 } : { type: 'clockExpire' };
        g = C.step(g, Object.assign({ t }, a)); continue;
      }
      const a = Object.assign(randAction(sport, r), { t }), n = C.step(g, a);
      if (n.u !== g.u) before.push(strip(g, drop));   // an undo entry was added
      g = n;
    }
    const E = before.length, m = g.u.length;
    eq(m, Math.min(E, 100), sport + ' seed ' + seed + ': stack length is min(actions, 100)');
    for (let j = 1; j <= m; j++) {
      g = C.undo(g);
      deq(strip(g, drop), before[E - j], sport + ' seed ' + seed + ' (' + steps + ' steps' + (withClock ? ', clock actions mixed in' : '') + '): after undoing ' + j + ' of ' + m);
    }
    if (E <= 100) deq(strip(g, drop), strip(init, drop), 'back to the initial state');
    eq(C.canUndo(g), false);
    return E;
  }
  await test('core property: random sequence of <=100 actions, undo all the way back equals the initial state (4 sports x 6 seeds)', () => {
    let total = 0;
    ['basketball', 'baseball', 'football', 'generic'].forEach(sp => { for (let s = 1; s <= 6; s++) total += replay(sp, s * 7919, 70 + s * 5, false); });
    assert.ok(total > 1000, 'a real amount of work was replayed: ' + total);
  });
  await test('core property: 600-step random games, undo the last 100 and land on the exact earlier states (4 sports x 4 seeds)', () => {
    ['basketball', 'baseball', 'football', 'generic'].forEach(sp => { for (let s = 1; s <= 4; s++) replay(sp, s * 104729, 600, false); });
  });
  await test('core property: with clock start/stop/set/expire mixed in, everything but the clock still undoes exactly', () => {
    ['basketball', 'baseball', 'football', 'generic'].forEach(sp => { for (let s = 1; s <= 4; s++) replay(sp, s * 15485863, 160, true); });
  });
  await test('core property: the saved game survives JSON, sanitize and undo (what a reload does)', () => {
    ['basketball', 'baseball', 'football', 'generic'].forEach(sp => {
      const r = rng(31337), init = G(sp); let g = init;
      for (let i = 0; i < 80; i++) g = C.step(g, Object.assign(randAction(sp, r), { t: NOW + i * 1000 }));
      const back = C.sanitizeGame(JSON.parse(JSON.stringify(g)));
      deq(back, g, sp + ': a reload gives back the same game');
      let x = back; while (C.canUndo(x)) x = C.undo(x);
      deq(strip(x), strip(init), sp + ': and it still undoes to the start');
    });
  });

//__UI__
  /* =====================================================================================
     PART 2: the real page (Chrome via Playwright)
     ===================================================================================== */
  const srv = await startServer('scoreboard'), br = await launch();
  const URL0 = srv.url;
  // a reload right after a sheet closed can collide with the history step that gives its entry back; just try again
  const reload = async page => { for (let i = 0; i < 4; i++) { try { await page.reload(); return; } catch (e) { if (!/ERR_ABORTED|detached/.test(String(e))) throw e; await page.waitForTimeout(600); } } await page.reload(); };
  const sheetSel = '.sheet-wrap.open .sheet';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
  const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 4000 });
  const sheetCount = page => page.$$eval('.sheet-wrap.open', s => s.length);
  const txt = (page, sel) => page.$eval(sel, e => e.textContent.trim());
  const scoreOf = async (page, i) => Number(await txt(page, '.t-score[data-i="' + i + '"]'));
  const scores = async page => [await scoreOf(page, 0), await scoreOf(page, 1)];
  const click = async (page, sel, n) => { for (let i = 0; i < (n || 1); i++) await page.click(sel); };
  const SC = (team, d) => '[data-act=a][data-t=score][data-team="' + team + '"][data-d="' + d + '"]';
  const AT = (t, team) => '[data-act=a][data-t=' + t + ']' + (team !== undefined ? '[data-team="' + team + '"]' : '');
  const toastText = async page => (await page.$$eval('.toast', els => els.map(e => e.textContent))).join(' | ');
  async function waitToast(page, re) {
    await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 5000 });
  }
  const live = page => page.evaluate(() => JSON.parse(JSON.stringify(window.SBApp.SB.game)));
  const lsAll = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('scoreboard.') === 0) o[k.slice(11)] = localStorage.getItem(k); } return o; });
  async function openSheet(page, sel) { await page.click(sel); await page.waitForSelector(sheetSel); await page.waitForTimeout(330); }
  async function closeSheets(page) { while (await sheetCount(page)) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); } await noSheets(page); }
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  async function settleUI(page) {
    await page.waitForFunction(() => { const f = document.getElementById('flash'); return (!f || f.hidden) && !document.querySelector('.toast'); }, null, { timeout: 12000 });
    await page.waitForTimeout(60);
  }
  async function shot(page, nn, name, w) { await settleUI(page); await page.screenshot({ path: SHOTS + '/scoreboard-' + String(nn).padStart(2, '0') + '-' + name + '-' + w + '.png' }); }
  async function smallTargets(page) {
    return page.evaluate(() => {
      const bad = [], sheet = document.querySelector('.sheet-wrap.open:last-child .sheet') || document.querySelector('.sheet-wrap.open .sheet');
      const root = sheet || document;
      root.querySelectorAll('button, a, select, input:not([type=hidden]):not([type=file]), [role=switch]').forEach(el => {
        if (el.closest('[hidden]') || el.closest('.sr') || (!sheet && el.closest('[inert]') && !el.closest('#unlock'))) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 43.5 || r.width < 43.5) bad.push((el.tagName + ' ' + (el.getAttribute('aria-label') || el.textContent || el.id || '')).trim().replace(/\s+/g, ' ').slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return bad;
    });
  }
  async function smallText(page) {
    return page.evaluate(() => {
      const bad = [], sheet = document.querySelector('.sheet-wrap.open:last-child .sheet') || document.querySelector('.sheet-wrap.open .sheet');
      const root = sheet || document.body;
      root.querySelectorAll('*').forEach(el => {
        if (el.closest('svg') || el.closest('[hidden]') || el.closest('.sr') || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;
        if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 11.95) bad.push(el.tagName + '.' + el.className + ' "' + el.textContent.trim().slice(0, 24) + '" ' + fs + 'px');
      });
      return bad;
    });
  }

  /* ---- seeded states (built with the real engine) ---- */
  const COL = C.COLORS.map(c => c.hex);
  const AB = [{ n: 'TEAM A', c: COL[0] }, { n: 'TEAM B', c: COL[1] }];
  const mk = (sport, acts, o) => acts.reduce((g, a) => T(g, a), G(sport, Object.assign({ teams: AB }, o || {})));
  const sc = (team, d, n) => times(n || 1, { type: 'score', team, d });
  const SEED = {
    basketball: () => mk('basketball', [...sc(0, 3, 4), ...sc(1, 2, 5), { type: 'period', d: 1, t: 1 }, ...sc(0, 2, 6), ...sc(1, 3, 4), ...times(5, { type: 'foul', team: 0 }), ...times(2, { type: 'foul', team: 1 }),
      { type: 'timeout', team: 0, d: -1 }, { type: 'poss', team: 0 }, { type: 'clockSet', ms: 342000, t: 2 }]),
    basketballEnd: () => mk('basketball', [...sc(0, 3, 4), ...sc(1, 2, 5), { type: 'clockSet', ms: 0, t: 1 }]),
    baseball: () => mk('baseball', [{ type: 'run', d: 1 }, ...times(3, 'out'), { type: 'run', d: 2 }, 'hit', 'endHalf', { type: 'run', d: 1 }, 'hit', 'error', 'endHalf', 'ball', 'ball', 'strike', 'out']),
    baseballPitch: () => mk('baseball', [{ type: 'run', d: 1 }, 'ball', 'strike', 'foul', 'hit'], { cfg: { pitch: true } }),
    baseballLast: () => mk('baseball', [{ type: 'run', d: 2 }, 'endHalf', { type: 'run', d: 1 }], { cfg: { innings: 1 } }),
    baseballMercy: () => mk('baseball', [{ type: 'setInning', inning: 5, half: 'top' }, { type: 'set', k: 'inn', team: 0, i: 2, v: 11 }, { type: 'set', k: 'inn', team: 1, i: 1, v: 1 }], { cfg: { mercyRuns: 10, mercyInning: 4 } }),
    football: () => mk('football', [...sc(0, 6, 2), ...sc(0, 1, 2), ...sc(1, 3), ...sc(1, 6), { type: 'period', d: 1, t: 1 }, { type: 'poss', team: 0 }, 'nextDown', 'nextDown', { type: 'togo', d: -4 }, { type: 'ballOn', text: 'OWN 35' }, { type: 'timeout', team: 1, d: -1 }, { type: 'clockSet', ms: 411000, t: 2 }]),
    generic: () => mk('generic', [...sc(0, 10, 3), ...sc(1, 5, 4), { type: 'plabel', text: 'Round 2', t: 1 }])
  };
  const SAMPLES = () => C.sampleGames(TODAY, NOW);

  async function seedLS(page, kv) {
    await page.addInitScript(([kv]) => {
      try {
        if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1');
        for (const k in kv) localStorage.setItem('scoreboard.' + k, typeof kv[k] === 'string' ? kv[k] : JSON.stringify(kv[k]));
      } catch (e) { /* blocked */ }
    }, [kv]);
  }
  async function loadState(page, st) {
    await page.evaluate(([st]) => {
      Object.keys(localStorage).filter(k => k.indexOf('scoreboard.') === 0).forEach(k => localStorage.removeItem(k));
      for (const k in st) localStorage.setItem('scoreboard.' + k, typeof st[k] === 'string' ? st[k] : JSON.stringify(st[k]));
    }, [st]);
    await reload(page); await page.waitForSelector('#view .home, #view .board'); await settleUI(page);
  }
  const board = g => ({ game: g, view: 'board' });

  /* ---- page factory ---- */
  const WAKE_OK = () => { const s = { released: false, release() { this.released = true; }, addEventListener() {} }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => s } }); };
  const WAKE_NONE = () => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); };
  const WAKE_DENIED = () => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { throw new DOMException('no', 'NotAllowedError'); } } }); };
  const FAKE_NOW = () => { const real = Date.now.bind(Date); let f = null; try { const s = sessionStorage.getItem('__fake'); if (s) f = Number(s); } catch (e) { /* ignore */ } window.__setFake = v => { f = v; try { sessionStorage.setItem('__fake', String(v)); } catch (e) { /* ignore */ } }; window.__getFake = () => f; Date.now = () => (f === null ? real() : f); };
  const XSS_HOOK = () => { window.x = () => { window.__xss = (window.__xss || 0) + 1; }; };
  async function fresh(o) {
    o = o || {};
    const { ctx, page, errors } = await newPage(br, Object.assign({ today: TODAY }, o.np || {}));
    await page.addInitScript(o.wake === 'none' ? WAKE_NONE : o.wake === 'denied' ? WAKE_DENIED : WAKE_OK);
    if (o.wake === 'real') { /* nothing: use the browser's own */ }
    if (o.fakeNow) await page.addInitScript(FAKE_NOW);
    if (o.xss) await page.addInitScript(XSS_HOOK);
    for (const f of [].concat(o.init || [])) await page.addInitScript(f);
    if (o.ls) await seedLS(page, o.ls);
    if (o.perm) await ctx.grantPermissions(o.perm, { origin: new URL(URL0).origin });
    await page.goto(URL0);
    await page.waitForSelector('#view .home, #view .board');
    return { ctx, page, errors };
  }
  const noErr = errors => deq(errors, [], 'no console errors');
  const startSport = async (page, sport) => { await page.click('[data-act=start][data-sport=' + sport + ']'); await page.waitForSelector('.board.sp-' + sport); };
  const DEFAULT_TXT = { basketball: '8:00', football: '12:00' };

  /* ===================================================================== screens, sizes, layout */
  async function tour(page, w, h, base, full) {
    const problems = [];
    const check = async (what) => {
      const ov = await overflow(page); if (ov > 0) problems.push(w + ' ' + what + ': horizontal overflow by ' + ov + 'px');
      (await smallTargets(page)).forEach(x => problems.push(w + ' ' + what + ': tap target under 44px: ' + x));
      (await smallText(page)).forEach(x => problems.push(w + ' ' + what + ': text under 12px: ' + x));
    };
    const sheetCheck = async (what) => {
      const r = await page.$eval(sheetSel, e => ({ h: e.getBoundingClientRect().height, vh: innerHeight, sw: e.scrollWidth, cw: e.clientWidth }));
      if (r.h > r.vh * 0.85 + 1) problems.push(w + ' ' + what + ': sheet taller than 85vh (' + Math.round(r.h) + ' of ' + r.vh + ')');
      if (r.sw > r.cw + 1) problems.push(w + ' ' + what + ': sheet scrolls sideways');
      await check(what);
    };
    let n = base;
    const S = async (name, sheet) => { if (sheet) await sheetCheck(name); else await check(name); await shot(page, n++, name, w); };
    await loadState(page, {});
    await S('home-empty');
    await loadState(page, { recent: SAMPLES() });
    await S('home-recent');
    await loadState(page, { recent: SAMPLES(), game: SEED.basketball() });
    await S('home-resume');
    for (const k of ['basketball', 'baseball', 'football', 'generic']) {
      await loadState(page, board(SEED[k]())); await page.waitForSelector('.board');
      await S(k);
    }
    await loadState(page, board(SEED.basketball()));
    await page.click('[data-act=b-lock]'); await page.waitForSelector('.board.locked'); await page.waitForTimeout(200);
    await check('locked'); await shot(page, n++, 'locked', w);
    await loadState(page, board(SEED.basketballEnd())); await S('basketball-time-out');
    await loadState(page, board(SEED.baseballLast())); await S('baseball-last-inning');
    await loadState(page, board(SEED.baseballMercy())); await S('baseball-mercy');
    // sheets
    await loadState(page, board(SEED.basketball()));
    await openSheet(page, '[data-act=b-menu]'); await S('menu', true);
    await page.click(sheetSel + ' [data-act=b-fix]'); await page.waitForTimeout(330); await S('fix-numbers', true);
    await closeSheets(page);
    await openSheet(page, '[data-act=b-clock]'); await S('clock-sheet', true); await closeSheets(page);
    await openSheet(page, '[data-act=b-log]'); await S('undo-log', true); await closeSheets(page);
    await loadState(page, {}); await openSheet(page, '[data-act=settings]'); await S('settings', true); await closeSheets(page);
    if (full) {
      await loadState(page, board(SEED.football())); await openSheet(page, '[data-act=b-down]'); await S('down-distance', true); await closeSheets(page);
      await loadState(page, board(SEED.basketball())); await openSheet(page, '[data-act=b-menu]');
      await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(330); await S('finish', true); await closeSheets(page);
      await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-edit]'); await page.waitForSelector(sheetSel + ' .t-in'); await page.waitForTimeout(330); await S('teams-and-rules', true); await closeSheets(page);
      await loadState(page, { recent: SAMPLES() }); await openSheet(page, '[data-act=rules][data-sport=baseball]'); await S('rules-baseball', true); await closeSheets(page);
      await openSheet(page, '[data-act=rules][data-sport=basketball]'); await S('rules-basketball', true); await closeSheets(page);
      await page.click('.team-edit[data-team="0"] .te-color'); await page.waitForTimeout(200); await S('team-colors');
      await page.click('.team-edit[data-team="0"] .te-color');
      await page.click('[data-act=open-recent]'); await page.waitForSelector(sheetSel + ' .rv-board'); await page.waitForTimeout(330); await S('recent-game', true); await closeSheets(page);
      await page.click('[data-act=open-recent] >> nth=1'); await page.waitForSelector(sheetSel + ' .rv-board'); await page.waitForTimeout(330); await S('recent-game-baseball', true); await closeSheets(page);
    }
    return problems;
  }

  await test('Layout 390x844: every screen, no overflow, 44px targets, 12px text, sheets <= 85vh, zero console errors (01-..)', async () => {
    const { page, errors } = await fresh();
    const problems = await tour(page, 390, 844, 1, true);
    deq(problems, [], 'layout problems at 390');
    noErr(errors); await page.context().close();
  });
  await test('Layout 768x1024 (tablet): every main screen, no overflow, targets, text', async () => {
    const { page, errors } = await fresh({ np: { ctx: { viewport: { width: 768, height: 1024 } } } });
    const problems = await tour(page, 768, 1024, 30, false);
    deq(problems, [], 'layout problems at 768');
    noErr(errors); await page.context().close();
  });
  await test('Layout 320x640 (small phone): every main screen, no horizontal scroll, targets, text', async () => {
    const { page, errors } = await fresh({ np: { ctx: { viewport: { width: 320, height: 640 } } } });
    const problems = await tour(page, 320, 640, 50, false);
    deq(problems, [], 'layout problems at 320');
    noErr(errors); await page.context().close();
  });
  await test('Layout 844x390 (phone on its side): every board is readable, huge scores, targets, text (70-..)', async () => {
    const { page, errors } = await fresh({ np: { ctx: { viewport: { width: 844, height: 390 } } } });
    const problems = await tour(page, 844, 390, 70, false);
    // the score glyphs fill the board: at least ~35vmin tall
    for (const k of ['basketball', 'baseball', 'football', 'generic']) {
      await loadState(page, board(SEED[k]()));
      const hgt = await page.$eval('.t-score[data-i="0"]', e => { const r = document.createRange(); r.selectNodeContents(e); return { box: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize), vmin: Math.min(innerWidth, innerHeight) }; });
      // digit cap height is about 0.7 of the font size for these fonts
      if (hgt.fs * 0.7 < hgt.vmin * 0.35) problems.push(k + ': score glyphs ~' + Math.round(hgt.fs * 0.7) + 'px tall, want >= ' + Math.round(hgt.vmin * 0.35));
    }
    deq(problems, [], 'landscape problems');
    noErr(errors); await page.context().close();
  });


  /* ===================================================================== home, samples */
  await test('Home: the first screen has the "Start a basketball game" button, four sports, rule lines, the version in Settings, no console errors', async () => {
    const { page, errors } = await fresh();
    const b = page.getByRole('button', { name: 'Start a basketball game', exact: true });
    await b.waitFor(); assert.ok(await b.isVisible());
    eq(await txt(page, 'h1'), 'Scoreboard'); assert.match(await page.title(), /Scoreboard/);
    deq(await page.$$eval('[data-act=start] b', els => els.map(e => e.textContent)), ['Start a basketball game', 'Start a baseball game', 'Start a football game', 'Just keep score']);
    deq(await page.$$eval('.t-in', i => i.map(x => x.value)), ['HOME', 'AWAY']);
    assert.match(await txt(page, '[data-act=start][data-sport=basketball] small'), /8:00 quarters/);
    assert.match(await txt(page, '[data-act=start][data-sport=baseball] small'), /6 innings/);
    assert.ok(await page.isVisible('[data-act=sample]'), 'Try a sample is offered on an empty list');
    // visible, the way a person sees it: inside the viewport on the first screen
    const box = await b.boundingBox(); assert.ok(box.y + box.height < 844, 'the start button is on the first screen');
    await openSheet(page, '[data-act=settings]');
    assert.ok((await page.$eval(sheetSel, e => e.textContent)).includes('Scoreboard v1'), 'version string in Settings');
    noErr(errors); await page.context().close();
  });

  await test('Home: "Try a sample" adds three placeholder games; a tapped game shows its final board and line score; delete asks first', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=sample]');
    eq((await page.$$('[data-act=open-recent]')).length, 3); assert.match(await toastText(page), /three sample games/i);
    deq(await page.$$eval('.grow-row .gs', e => e.map(x => x.textContent.trim())), ['TEAM A 21 - 14 TEAM B', 'TEAM A 6 - 3 TEAM B', 'TEAM A 48 - 41 TEAM B']);
    assert.ok(!(await page.isVisible('[data-act=sample]')), 'the sample button goes away once there are games');
    await page.click('[data-act=open-recent] >> nth=2'); await page.waitForSelector(sheetSel + ' .rv-board');
    deq(await page.$$eval(sheetSel + ' .rv-t b', e => e.map(x => x.textContent)), ['48', '41']);
    deq(await page.$$eval(sheetSel + ' table.ls tbody tr', rows => rows.map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' '))), ['TEAM B 12 9 8 12 41', 'TEAM A 10 14 12 12 48']);
    assert.match(await txt(page, sheetSel + ' .rv-st'), /Final.*Nov 6.*Sample/);
    // delete -> confirm sheet -> gone; Cancel keeps it
    await page.click(sheetSel + ' [data-act=rv-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await page.waitForTimeout(350);
    eq(await sheetCount(page), 1); eq((await page.$$('[data-act=open-recent]')).length, 3, 'cancel keeps the game');
    await page.click(sheetSel + ' [data-act=rv-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.click('.sheet-wrap.open:last-child [data-ok]'); await noSheets(page);
    eq((await page.$$('[data-act=open-recent]')).length, 2); assert.match(await toastText(page), /deleted/i);
    assert.ok(!(await lsAll(page)).recent.includes('sample-bball'), 'removed from storage too');
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== basketball */
  await test('Basketball: score, undo, undo log in words, fouls and bonus, timeouts, arrow, next period, fix numbers, Esc and focus', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball');
    eq(await txt(page, '.t-home .t-name'), 'HOME'); eq(await txt(page, '.t-away .t-name'), 'AWAY');
    eq(await txt(page, '.clock'), '8:00'); eq(await txt(page, '.period'), 'QUARTER 1');
    await click(page, SC(0, 3), 2); await click(page, SC(1, 2)); await click(page, SC(1, -1));
    deq(await scores(page), [6, 1]);
    assert.match(await page.getAttribute('[data-act=undo]', 'aria-label'), /Undo: AWAY -1/);
    await page.click('[data-act=undo]'); deq(await scores(page), [6, 2]);
    await openSheet(page, '[data-act=b-log]');
    deq(await page.$$eval(sheetSel + ' .log li', l => l.map(x => x.textContent)), ['AWAY +2', 'HOME +3', 'HOME +3'], 'the log is in words, newest first');
    await page.click(sheetSel + ' [data-undo-top]'); deq(await scores(page), [6, 0]);
    deq(await page.$$eval(sheetSel + ' .log li', l => l.map(x => x.textContent)), ['HOME +3', 'HOME +3'], 'the open log follows the undo');
    await closeSheets(page);
    // fouls and the bonus light (it shows on the team that shoots, i.e. the one that was fouled)
    await click(page, AT('foul', 0), 4);
    eq(await page.$$eval('.bonus.on', e => e.length), 0, 'no bonus at 4');
    await page.click(AT('foul', 0));
    eq(await txt(page, '.t-home .t-stats .stat .v'), '5');
    eq(await page.$$eval('.t-away .bonus.on', e => e.length), 1, 'away shoots in the bonus once home has 5'); eq(await page.$$eval('.t-home .bonus.on', e => e.length), 0);
    // timeouts: 2 each, the button disables at 0
    eq(await page.$$eval('.t-home .dots i.on', e => e.length), 2);
    await page.click(AT('timeout', 0)); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 1);
    await page.click(AT('timeout', 0)); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 0);
    assert.ok(await page.$eval(AT('timeout', 0), b => b.disabled), 'no timeouts left');
    // possession arrow
    eq(await page.$$eval('.poss i.on', e => e.length), 0);
    await page.click(AT('poss', 'flip')); eq(await page.$$eval('.poss .tl.on', e => e.length), 1); assert.match(await page.getAttribute('.poss', 'aria-label'), /arrow: HOME/);
    await page.click(AT('poss', 'flip')); eq(await page.$$eval('.poss .tr.on', e => e.length), 1);
    // next period: fouls reset, clock full
    assert.match(await txt(page, '.cb.per'), /Q2/);
    await page.click(AT('period')); eq(await txt(page, '.period'), 'QUARTER 2'); eq(await txt(page, '.t-home .t-stats .stat .v'), '0'); eq(await page.$$eval('.bonus.on', e => e.length), 0); eq(await txt(page, '.clock'), '8:00');
    assert.match(await txt(page, '.cb.per'), /Q3/);
    // fix numbers: type a score
    await openSheet(page, '[data-act=b-menu]');
    await page.click(sheetSel + ' [data-act=b-fix]'); await page.waitForSelector('.fix-in'); await page.waitForTimeout(300);
    await page.fill('.fix-in[data-row="0"][data-team="0"]', '40'); await page.press('.fix-in[data-row="0"][data-team="0"]', 'Tab');
    eq(await scoreOf(page, 0), 40); assert.match(await page.title(), /^HOME 40 - 0 AWAY/);
    await page.press('.fix-in[data-row="0"][data-team="0"]', 'Escape'); await page.waitForTimeout(350);
    eq(await sheetCount(page), 1, 'Esc closes only the top sheet');
    await page.keyboard.press('Escape'); await noSheets(page);
    eq(await page.evaluate(() => document.activeElement && document.activeElement.dataset.act), 'b-menu', 'focus goes back to the button that opened the menu');
    await openSheet(page, '[data-act=b-log]'); assert.ok((await page.$eval(sheetSel + ' .log li', e => e.textContent)) === 'Fixed HOME score to 40'); await closeSheets(page);
    noErr(errors); await page.context().close();
  });

  const BASE = 1794000000000;
  const setFake = (page, v) => page.evaluate(x => window.__setFake(x), v);
  const adv = async (page, ms) => { await page.evaluate(m => window.__setFake(window.__getFake() + m), ms); await page.waitForTimeout(280); };
  const plays = page => page.evaluate(() => window.SBApp.SB.sound.plays);

  await test('Basketball clock (fake time): start, stop, set mm:ss, zero ends the period with a buzz, next period, a stale zero stays quiet', async () => {
    const { page, errors } = await fresh({ fakeNow: true });
    await setFake(page, BASE);
    await startSport(page, 'basketball');
    await page.click('[data-act=clock]'); eq(await txt(page, '.clk-state'), 'RUNNING');
    await adv(page, 10000); eq(await txt(page, '.clock'), '7:50');
    await page.click('[data-act=clock]'); eq(await txt(page, '.clk-state'), 'STOPPED');
    await adv(page, 30000); eq(await txt(page, '.clock'), '7:50', 'a stopped clock does not move');
    // tap the clock, type 0:03
    await page.click('.clock'); await page.waitForSelector(sheetSel + ' #c-min'); await page.waitForTimeout(300);
    await page.fill('#c-min', '0'); await page.fill('#c-sec', '03'); await page.click('[data-setclock]'); await noSheets(page);
    eq(await txt(page, '.clock'), '3.0', 'under a minute shows tenths');
    const p0 = await plays(page);
    await page.click('[data-act=clock]'); await adv(page, 1000); eq(await txt(page, '.clock'), '2.0');
    await adv(page, 2100);
    eq(await txt(page, '.clock'), '0:00'); eq(await txt(page, '.clk-state'), 'TIME'); eq(await txt(page, '.end-banner'), 'End of quarter 1');
    eq(await plays(page), p0 + 1, 'the buzzer sounded once and the clock stopped itself');
    assert.ok(await page.$eval('.cb.per', b => b.classList.contains('attn')), 'NEXT is highlighted');
    await page.click('[data-act=clock]'); await waitToast(page, /clock is at 0:00/i);
    await page.click(AT('period')); eq(await txt(page, '.period'), 'QUARTER 2'); eq(await txt(page, '.clock'), '8:00'); eq(await page.$$eval('.end-banner', e => e.length), 0);
    // quick set buttons in the clock sheet: -1 min, +10 s, full
    await page.click('.clock'); await page.waitForSelector('#c-min'); await page.waitForTimeout(300);
    await page.click('[data-qadj="-60"]'); eq(await page.inputValue('#c-min'), '7'); await page.click('[data-qadj="10"]'); eq(await page.inputValue('#c-sec'), '10');
    await page.click('[data-qfull]'); eq(await page.inputValue('#c-min'), '8'); eq(await page.inputValue('#c-sec'), '00');
    await page.fill('#c-min', '0'); await page.fill('#c-sec', '05'); await page.press('#c-sec', 'Enter'); await noSheets(page); eq(await txt(page, '.clock'), '5.0');
    // the screen slept through zero: the clock is at 0:00 when it wakes, but it does not buzz minutes late
    const p1 = await plays(page);
    await page.click('[data-act=clock]'); await adv(page, 60000);
    eq(await txt(page, '.clock'), '0:00'); eq(await plays(page), p1, 'no stale buzz'); eq(await txt(page, '.end-banner'), 'End of quarter 2');
    noErr(errors); await page.context().close();
  });

  await test('Basketball clock (real time sanity): it counts down by itself and holds when stopped', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball');
    await page.click('[data-act=clock]'); await page.waitForTimeout(1400);
    assert.ok(['7:58', '7:59'].includes(await txt(page, '.clock')), 'about 1.4 s gone: ' + await txt(page, '.clock'));
    await page.click('[data-act=clock]'); const a = await txt(page, '.clock'); await page.waitForTimeout(800);
    eq(await txt(page, '.clock'), a);
    noErr(errors); await page.context().close();
  });

  await test('Clock survives a reload while running (timestamp based) and the buzzer toggles (sound off is quiet, loud is flagged, test button plays)', async () => {
    const { page, errors } = await fresh({ fakeNow: true });
    await setFake(page, BASE);
    await startSport(page, 'basketball'); await page.click('[data-act=clock]'); await adv(page, 5000);
    await reload(page); await page.waitForSelector('.board');
    eq(await txt(page, '.clk-state'), 'RUNNING'); eq(await txt(page, '.clock'), '7:55', 'the reload did not lose time');
    await adv(page, 5000); eq(await txt(page, '.clock'), '7:50');
    // sound off in the game menu
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-switch=sound]'); await closeSheets(page);
    eq(JSON.parse((await lsAll(page)).prefs).sound, false);
    await page.click('[data-act=clock]');
    await page.click('.clock'); await page.waitForSelector('#c-min'); await page.waitForTimeout(300); await page.fill('#c-min', '0'); await page.fill('#c-sec', '02'); await page.click('[data-setclock]'); await noSheets(page);
    const p0 = await plays(page); await page.click('[data-act=clock]'); await adv(page, 2200);
    eq(await txt(page, '.clock'), '0:00'); eq(await plays(page), p0, 'sound off: no buzz, the clock still stops');
    // loud + test button
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-switch=sound]'); await page.click(sheetSel + ' [data-switch=loud]');
    await page.click(sheetSel + ' [data-act=test-buzz]');
    eq(await plays(page), p0 + 1); eq(await page.evaluate(() => window.SBApp.SB.sound.lastLoud), true);
    const pr = JSON.parse((await lsAll(page)).prefs); eq(pr.sound, true); eq(pr.loud, true);
    noErr(errors); await page.context().close();
  });

  await test('Lock controls: taps do nothing while locked; a short press does not unlock; a 1 second hold does; keyboard hold works too', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball'); await page.click(SC(0, 2));
    await page.click('[data-act=b-lock]'); await page.waitForSelector('.board.locked');
    assert.ok(await page.isVisible('#unlock')); eq(await page.$eval('#board', b => b.inert), true);
    eq(await page.evaluate(() => document.activeElement.id), 'unlock', 'keyboard focus is on the unlock button');
    const sb = await page.$eval('.t-score[data-i="0"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(sb[0], sb[1]); await page.mouse.click(sb[0] + 30, sb[1] + 40);
    deq(await scores(page), [2, 0], 'tapping the board did nothing');
    const ub = await page.$eval('#unlock', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; });
    assert.ok(ub[2] >= 44 && ub[3] >= 44, 'unlock target is big enough');
    await page.mouse.move(ub[0], ub[1]); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(120);
    assert.ok(await page.isVisible('.board.locked'), 'a short press leaves it locked');
    await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
    await page.waitForSelector('.board:not(.locked)'); assert.ok(!(await page.isVisible('#unlock')));
    await page.click(SC(0, 1)); deq(await scores(page), [3, 0], 'works again after unlock');
    // keyboard: Enter held for a second
    await page.click('[data-act=b-lock]'); await page.waitForSelector('.board.locked');
    await page.keyboard.down('Enter'); await page.waitForTimeout(400); await page.keyboard.up('Enter'); assert.ok(await page.isVisible('.board.locked'));
    await page.keyboard.down('Enter'); await page.waitForTimeout(1200); await page.keyboard.up('Enter'); await page.waitForSelector('.board:not(.locked)');
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== baseball */
  await test('Baseball: count, walk, foul rule, strikeout, three outs flip the half, runs, hit and error, line score, undo', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'baseball');
    const dots = k => page.$$eval('.cnt.' + k + ' .dots i.on', e => e.length);
    eq(await page.$$eval('.cnt.b i', e => e.length), 3); eq(await page.$$eval('.cnt.s i', e => e.length), 2); eq(await page.$$eval('.cnt.o i', e => e.length), 2);
    await click(page, AT('ball'), 3); eq(await dots('b'), 3);
    await page.click(AT('ball')); eq(await page.getAttribute('#flash', 'data-f'), 'BB'); assert.ok(!(await page.$eval('#flash', e => e.hidden))); assert.match(await txt(page, '#flash'), /BB/);
    eq(await dots('b'), 0, 'ball four is a walk and clears the count');
    await click(page, AT('strike'), 2); eq(await dots('s'), 2);
    const u0 = (await live(page)).u.length;
    await page.click(AT('foul')); eq(await dots('s'), 2, 'a foul with two strikes is not strike three'); eq((await live(page)).u.length, u0, 'and adds nothing to the undo log');
    await page.click(AT('strike')); eq(await dots('o'), 1); eq(await dots('s'), 0); eq(await page.getAttribute('#flash', 'data-f'), 'K');
    await page.click(AT('foul')); eq(await dots('s'), 1, 'a foul with no strikes is strike one');
    await page.click('[data-act=undo]'); eq(await dots('s'), 0);
    await click(page, AT('out'), 2); eq(await page.getAttribute('#flash', 'data-f'), 'SIDE'); assert.match(await txt(page, '#flash'), /Bottom of the 1st/i);
    eq(await page.getAttribute('.inn', 'aria-label'), 'Bottom of the 1st'); eq(await dots('o'), 0); assert.match(await txt(page, '.t-home .t-tag'), /AT BAT/);
    await page.click(AT('run') + '[data-d="1"]'); deq(await scores(page), [1, 0]);
    await page.click(AT('hit')); eq(await txt(page, '.t-home .t-stats .stat .v'), '1', 'hit goes to the team at bat (home in the bottom)');
    await page.click(AT('error')); eq(await page.$$eval('.t-away .stat .v', e => e.map(x => x.textContent).join(',')), '0,1', 'error goes to the team in the field (away)');
    deq(await page.$$eval('table.ls tbody tr', rows => rows.map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' | '))), ['AWAY | 0 |  |  |  |  |  | 0 | 0 | 1', 'HOME | 1 |  |  |  |  |  | 1 | 1 | 0']);
    await page.click(AT('endHalf')); eq(await page.getAttribute('.inn', 'aria-label'), 'Top of the 2nd');
    await page.click('[data-act=undo]'); eq(await page.getAttribute('.inn', 'aria-label'), 'Bottom of the 1st');
    await page.click(AT('run') + '[data-d="-1"]'); deq(await scores(page), [0, 0]);
    assert.ok((await page.getAttribute('[data-act=a][data-t=run][data-d="1"]', 'aria-label')).includes('HOME'), 'the run button names the team');
    noErr(errors); await page.context().close();
  });

  await test('Baseball: walk-off, Final banner, reopen; mercy rule is only a banner; pitch counter counts the team in the field', async () => {
    let { page, errors } = await fresh({ ls: board(SEED.baseballLast()) });   // last inning (1), bottom, away 2 - home 1
    await page.click(AT('run') + '[data-d="1"]'); deq(await scores(page), [2, 2]); eq(await page.$$eval('.end-banner', e => e.length), 0, 'a tie is not a walk-off');
    await page.click(AT('run') + '[data-d="1"]'); deq(await scores(page), [3, 2]);
    eq(await page.getAttribute('#flash', 'data-f'), 'FINAL'); assert.match(await txt(page, '.end-banner'), /FINAL/);
    assert.ok(await page.$eval(AT('ball'), b => b.disabled), 'no more pitches once it is final');
    assert.ok(!(await page.$eval(AT('run') + '[data-d="-1"]', b => b.disabled)), 'runs can still be fixed');
    await page.click('.reopen'); eq(await page.$$eval('.end-banner', e => e.length), 0); assert.ok(!(await page.$eval(AT('ball'), b => b.disabled)));
    noErr(errors); await page.context().close();
    ({ page, errors } = await fresh({ ls: board(SEED.baseballMercy()) }));
    eq(await txt(page, '.end-banner.mercy'), 'Mercy rule reached'); eq((await live(page)).final, false, 'the mercy rule never ends the game by itself');
    assert.ok(!(await page.$eval(AT('ball'), b => b.disabled)));
    noErr(errors); await page.context().close();
    ({ page, errors } = await fresh({ ls: board(SEED.baseballPitch()) }));
    eq(await txt(page, '.t-home .stat:nth-child(3) .v'), '4', 'pitches thrown by home (in the field in the top)');
    await click(page, AT('strike'), 2); await page.click(AT('foul'));
    eq(await txt(page, '.t-home .stat:nth-child(3) .v'), '7'); eq(await page.$$eval('.cnt.s .dots i.on', e => e.length), 2, 'foul with two strikes counts a pitch but not a strike');
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== football */
  await test('Football: scores, downs, turnover prompt on 4th down, down & distance sheet, possession, quarters and timeouts', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'football');
    eq(await txt(page, '.clock'), '12:00'); eq(await txt(page, '.dd-m'), '1st & 10');
    await page.click(SC(0, 6)); await page.click(SC(0, 1)); await page.click(SC(1, 3)); deq(await scores(page), [7, 3]);
    await page.click(AT('poss', 0)); eq(await page.getAttribute('.t-home .tag', 'aria-pressed'), 'true');
    await click(page, '[data-act=nextdown]', 3); eq(await txt(page, '.dd-m'), '4th & 10');
    await page.click('[data-act=nextdown]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(300);
    eq(await txt(page, sheetSel + ' h2'), 'Turnover on downs?');
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page); eq(await txt(page, '.dd-m'), '4th & 10', 'Not yet leaves it as is');
    await page.click('[data-act=nextdown]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-ok]'); await noSheets(page);
    eq(await txt(page, '.dd-m'), '1st & 10'); eq(await page.getAttribute('.t-away .tag', 'aria-pressed'), 'true', 'the ball went to the other team'); eq(await page.getAttribute('.t-home .tag', 'aria-pressed'), 'false');
    await openSheet(page, '[data-act=b-down]');
    await page.click(sheetSel + ' [data-pills=down] [data-v="3"]'); eq(await txt(page, '.dd-m'), '3rd & 10');
    await page.click(sheetSel + ' [data-togo="5"]'); eq(await txt(page, '.dd-m'), '3rd & 15'); eq(await txt(page, sheetSel + ' #togo-v'), '15');
    await page.click(sheetSel + ' [data-togo="-5"]'); await click(page, sheetSel + ' [data-togo="-1"]', 3); eq(await txt(page, '.dd-m'), '3rd & 7');
    await page.fill(sheetSel + ' #d-ball', 'OWN 35'); await page.press(sheetSel + ' #d-ball', 'Tab'); eq(await txt(page, '.dd-s'), 'BALL ON OWN 35');
    await page.click(sheetSel + ' [data-dd=first]'); eq(await txt(page, '.dd-m'), '1st & 10');
    await closeSheets(page);
    // timeouts, quarters
    await page.click(AT('timeout', 0)); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 2);
    await page.click(AT('period')); eq(await txt(page, '.period'), 'QUARTER 2'); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 2, 'timeouts do not refill until the half');
    await page.click(AT('period')); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 3, 'they refill at the start of the 3rd quarter');
    await openSheet(page, '[data-act=b-log]'); assert.match(await txt(page, sheetSel + ' .log li'), /Start quarter 3/); await closeSheets(page);
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== generic */
  await test('Just keep score: +1/+5/+10/-1/-5/-10, label, floor at zero, three-digit scores, undo', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'generic');
    await click(page, SC(0, 10), 2); await page.click(SC(0, 5)); await page.click(SC(1, 1)); await page.click(SC(1, -5)); deq(await scores(page), [25, 0]);
    await page.click('[data-act=undo]'); deq(await scores(page), [25, 1]);
    await page.click('.plabel'); await page.waitForSelector('#pl-in'); await page.waitForTimeout(300);
    await page.fill('#pl-in', 'Round 2'); await page.press('#pl-in', 'Enter'); await noSheets(page);
    eq(await txt(page, '.plabel'), 'Round 2');
    await click(page, SC(0, 10), 8); eq(await scoreOf(page, 0), 105); eq(await page.getAttribute('.t-score[data-i="0"]', 'data-d'), '3');
    assert.ok((await page.$$('[data-act=clock]')).length === 0, 'no clock on the generic board');
    noErr(errors); await page.context().close();
  });


  await test('Teams & rules during a game: rename, pick a color, change the period length and bonus; none of it goes in the undo log', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball');
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-edit]'); await page.waitForSelector(sheetSel + ' .t-in'); await page.waitForTimeout(300);
    await page.fill(sheetSel + ' .team-edit[data-team="0"] .t-in', 'TEAM A');
    await page.click(sheetSel + ' .team-edit[data-team="1"] .te-color'); await page.click(sheetSel + ' .team-edit[data-team="1"] .sw[data-v="#4be07a"]');
    await page.click(sheetSel + ' [data-pills=preset] [data-v="12"]'); await page.click(sheetSel + ' [data-pills=bonusAt] [data-v="7"]');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    eq(await txt(page, '.t-home .t-name'), 'TEAM A'); eq(await page.$eval('.t-away', e => e.style.getPropertyValue('--tc')), '#4be07a'); eq(await txt(page, '.clock'), '12:00', 'an untouched clock follows the new length');
    const g = await live(page); eq(g.cfg.bonusAt, 7); eq(g.cfg.periodSec, 720); eq(g.u.length, 0);
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== finish, recent, resume */
  await test('Finish game: asks first, saves to Recent with its final board, can be saved as stopped, then deleted', async () => {
    const { page, errors } = await fresh({ ls: board(SEED.basketball()) });
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForSelector(sheetSel + ' .resultbox'); await page.waitForTimeout(300);
    eq(await txt(page, sheetSel + ' .resultbox'), C.resultText(SEED.basketball(), 'final'));
    await page.click(sheetSel + ' [data-close].btn'); await page.waitForTimeout(350);   // Keep playing
    assert.ok(await page.isVisible('.board'), 'Keep playing leaves the game as it was'); eq(await sheetCount(page), 1);
    await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-ok]');
    await page.waitForSelector('.home'); await page.waitForSelector(sheetSel + ' .rv-board'); await page.waitForTimeout(300);
    deq(await page.$$eval(sheetSel + ' .rv-t b', e => e.map(x => x.textContent)), ['24', '22']); assert.match(await txt(page, sheetSel + ' .rv-st'), /^Final/);
    await closeSheets(page);
    eq((await page.$$('[data-act=open-recent]')).length, 1); eq(await page.$$eval('.resume', e => e.length), 0, 'no game in progress now'); eq((await lsAll(page)).game, undefined);
    assert.match(await txt(page, '.grow-row .gs'), /TEAM A 24 - 22 TEAM B/);
    // stopped early
    await page.click('[data-act=start][data-sport=generic]'); await page.waitForSelector('.board'); await page.click(SC(0, 5));
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForSelector(sheetSel + ' [data-stop]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-stop]');
    await page.waitForSelector(sheetSel + ' .rv-board'); assert.match(await txt(page, sheetSel + ' .rv-st'), /^Stopped/); await closeSheets(page);
    eq((await page.$$('[data-act=open-recent]')).length, 2);
    // throw away from the menu
    await page.click('[data-act=start][data-sport=football]'); await page.waitForSelector('.board'); await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-discard]');
    await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForSelector('.home');
    eq((await page.$$('[data-act=open-recent]')).length, 2, 'a thrown-away game is not saved'); eq((await lsAll(page)).game, undefined);
    noErr(errors); await page.context().close();
  });

  await test('Resume: Back to home keeps the game; starting another while one is open asks (save as stopped, throw away, cancel)', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball'); await click(page, SC(0, 2), 1);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home .resume');
    assert.match(await txt(page, '.resume .rc-s'), /HOME 2 - 0 AWAY/); assert.match(await txt(page, '.resume .rc-p'), /Quarter 1/);
    await page.click('[data-act=resume]'); await page.waitForSelector('.board'); deq(await scores(page), [2, 0]);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home .resume');
    await page.click('[data-act=start][data-sport=football]'); await page.waitForSelector(sheetSel + ' [data-keep]'); await page.waitForTimeout(300);
    assert.match(await txt(page, sheetSel), /already open/i); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    assert.ok(await page.isVisible('.home .resume'), 'cancel changes nothing'); eq((await page.$$('[data-act=open-recent]')).length, 0);
    await page.click('[data-act=start][data-sport=football]'); await page.waitForSelector(sheetSel + ' [data-keep]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-keep]');
    await page.waitForSelector('.board.sp-football'); await page.click('[data-act=b-home]'); await page.waitForSelector('.home');
    eq((await page.$$('[data-act=open-recent]')).length, 1); assert.match(await txt(page, '.grow-row .gd'), /Stopped in Q1/);
    await page.click('[data-act=start][data-sport=baseball]'); await page.waitForSelector(sheetSel + ' [data-toss]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-toss]');
    await page.waitForSelector('.board.sp-baseball'); await page.click('[data-act=b-home]'); await page.waitForSelector('.home');
    eq((await page.$$('[data-act=open-recent]')).length, 1, 'thrown away: not saved'); eq((await live(page)).sport, 'baseball');
    await page.click('[data-act=discard-live]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-ok]'); await noSheets(page);
    eq(await page.$$eval('.resume', e => e.length), 0);
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== share */
  await test('Share result copies plain text (home list, recent view and live board); falls back to a copy box', async () => {
    const { page, errors } = await fresh({ perm: ['clipboard-read', 'clipboard-write'], ls: { recent: SAMPLES(), game: SEED.basketball(), view: 'board' } });
    const clip = () => page.evaluate(() => navigator.clipboard.readText());
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=share-text]'); await waitToast(page, /Copied/i);
    assert.ok((await clip()).startsWith('TEAM A 24, TEAM B 22 (Quarter 2, 5:42)\nTEAM B: '), 'live share: ' + (await clip()));
    await closeSheets(page); await page.click('[data-act=b-home]'); await page.waitForSelector('.home');
    await page.click('[data-act=open-recent] >> nth=2'); await page.waitForSelector(sheetSel + ' [data-act=rv-share]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-act=rv-share]');
    await waitToast(page, /Copied/i);
    eq(await clip(), 'TEAM A 48, TEAM B 41 (Final)\nTEAM B: 12 9 8 12 = 41\nTEAM A: 10 14 12 12 = 48');
    noErr(errors); await page.context().close();
    const f = await fresh({ ls: { recent: SAMPLES() }, init: () => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); document.execCommand = () => false; } });
    await f.page.click('[data-act=open-recent] >> nth=1'); await f.page.waitForSelector(sheetSel + ' [data-act=rv-share]'); await f.page.waitForTimeout(300); await f.page.click(sheetSel + ' [data-act=rv-share]');
    await f.page.waitForSelector('.copybox'); eq(await f.page.inputValue('.copybox'), 'TEAM A 6, TEAM B 3 (Final, 6 innings)\nTEAM B: 1 0 0 2 0 0 = 3 R, 4 H, 2 E\nTEAM A: 0 2 0 1 3 0 = 6 R, 7 H, 1 E');
    noErr(f.errors); await f.page.context().close();
  });

  await test('Share picture: a real 1280x720 PNG is downloaded; with navigator.share it is handed over as a file instead', async () => {
    const { page, errors } = await fresh({ ls: { recent: SAMPLES() }, init: () => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); } });
    await page.click('[data-act=open-recent] >> nth=1'); await page.waitForSelector(sheetSel + ' [data-act=rv-pic]'); await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(sheetSel + ' [data-act=rv-pic]')]);
    eq(dl.suggestedFilename(), 'scoreboard-2026-11-04.png');
    const file = path.join(tmp, 'pic.png'); await dl.saveAs(file); const buf = fs.readFileSync(file);
    eq(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature'); eq(buf.readUInt32BE(16), 1280); eq(buf.readUInt32BE(20), 720); assert.ok(buf.length > 8000, 'it has real content: ' + buf.length);
    fs.copyFileSync(file, SHOTS + '/scoreboard-90-share-picture-baseball-1280.png');
    noErr(errors); await page.context().close();
    const s = await fresh({ ls: { recent: SAMPLES() }, init: () => { Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true }); Object.defineProperty(navigator, 'share', { value: async d => { window.__shared = { n: d.files[0].name, t: d.files[0].type, s: d.files[0].size, title: d.title }; }, configurable: true }); } });
    await s.page.click('[data-act=open-recent] >> nth=2'); await s.page.waitForSelector(sheetSel + ' [data-act=rv-pic]'); await s.page.waitForTimeout(300); await s.page.click(sheetSel + ' [data-act=rv-pic]');
    await s.page.waitForFunction(() => window.__shared);
    const sh = await s.page.evaluate(() => window.__shared); eq(sh.n, 'scoreboard-2026-11-06.png'); eq(sh.t, 'image/png'); assert.ok(sh.s > 8000); eq(sh.title, 'TEAM A 48 - 41 TEAM B');
    noErr(s.errors); await s.page.context().close();
  });

  /* ===================================================================== storage */
  await test('Persistence: teams, colors, rules, the game in progress and recent games all survive a reload', async () => {
    const { page, errors } = await fresh();
    await page.fill('.team-edit[data-team="0"] .t-in', 'TEAM A'); await page.press('.team-edit[data-team="0"] .t-in', 'Tab');
    await page.click('.team-edit[data-team="1"] .te-color'); await page.click('.team-edit[data-team="1"] .sw[data-v="#c78bff"]');
    await openSheet(page, '[data-act=rules][data-sport=basketball]'); await page.click(sheetSel + ' [data-pills=preset] [data-v="10"]'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    assert.match(await txt(page, '[data-act=start][data-sport=basketball] small'), /^10:00 quarters/);
    await reload(page); await page.waitForSelector('.home');
    deq(await page.$$eval('.t-in', i => i.map(x => x.value)), ['TEAM A', 'AWAY']); assert.match(await txt(page, '[data-act=start][data-sport=basketball] small'), /^10:00 quarters/);
    eq(await page.$eval('.team-edit[data-team="1"] .te-color', e => e.style.getPropertyValue('--c')), '#c78bff');
    await startSport(page, 'basketball'); eq(await txt(page, '.clock'), '10:00'); eq(await txt(page, '.t-home .t-name'), 'TEAM A');
    eq(await page.$eval('.t-away', e => e.style.getPropertyValue('--tc')), '#c78bff');
    await click(page, SC(0, 3), 2); await page.click(AT('foul', 1)); await page.click(AT('timeout', 0));
    await reload(page); await page.waitForSelector('.board.sp-basketball');
    deq(await scores(page), [6, 0]); eq(await txt(page, '.t-away .t-stats .stat .v'), '1'); eq(await page.$$eval('.t-home .dots i.on', e => e.length), 1);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home .resume'); await reload(page); await page.waitForSelector('.home .resume');
    assert.match(await txt(page, '.resume .rc-s'), /TEAM A 6 - 0 AWAY/);
    // baseball: the count and undo history are stored too
    await page.click('[data-act=discard-live]'); await page.waitForSelector(sheetSel + ' [data-ok]'); await page.waitForTimeout(300); await page.click(sheetSel + ' [data-ok]'); await noSheets(page);
    await startSport(page, 'baseball'); await click(page, AT('ball'), 2); await page.click(AT('strike')); await page.click(AT('out'));
    await reload(page); await page.waitForSelector('.board.sp-baseball');
    deq(await page.$$eval('.cnt .dots', d => d.map(x => x.querySelectorAll('i.on').length)), [0, 0, 1], 'out cleared the count, one out');
    await page.click('[data-act=undo]'); deq(await page.$$eval('.cnt .dots', d => d.map(x => x.querySelectorAll('i.on').length)), [2, 1, 0], 'undo history survived the reload');
    noErr(errors); await page.context().close();
  });

  await test('Storage blocked: the app still renders and works, and says plainly that it cannot save', async () => {
    const { page, errors } = await fresh({ init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); } });
    assert.match(await txt(page, '.banner.bad'), /not letting Scoreboard save/i);
    await startSport(page, 'basketball'); await click(page, SC(0, 3), 2); await page.click('[data-act=undo]'); deq(await scores(page), [3, 0]);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home .resume'); assert.match(await txt(page, '.banner.bad'), /not letting Scoreboard save/i);
    await openSheet(page, '[data-act=settings]'); assert.match(await txt(page, sheetSel), /not letting Scoreboard save/i);
    noErr(errors); await page.context().close();
    const q = await fresh({ init: () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__fail && k === 'scoreboard.game') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; } });
    await startSport(q.page, 'basketball'); await q.page.evaluate(() => { window.__fail = true; }); await q.page.click(SC(0, 2)); await waitToast(q.page, /couldn't save/i);
    deq(await scores(q.page), [2, 0], 'the score still counts on screen'); noErr(q.errors); await q.page.context().close();
  });

  const backupJSON = o => JSON.stringify(o);
  await test('Backup, clear everything, restore: round trip; a bad file, a wrong-app file and a damaged backup are refused and change nothing', async () => {
    const { page, errors } = await fresh({ ls: { recent: SAMPLES() } });
    await openSheet(page, '[data-act=settings]'); await page.click(sheetSel + ' [data-switch=sound]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(sheetSel + ' [data-act=dl-backup]')]);
    eq(dl.suggestedFilename(), 'scoreboard-backup-2026-11-07.json');
    const file = path.join(tmp, 'backup.json'); await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    eq(data.app, 'scoreboard'); eq(data.v, 1); eq(data.recent.length, 3); eq(data.prefs.sound, false); assert.ok(!('game' in data));
    await waitToast(page, /Backup saved/i); assert.match(await txt(page, '#last-bk'), /today/);
    // clear everything asks first
    await page.click(sheetSel + ' [data-act=clear-all]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await page.waitForTimeout(350); eq((await page.$$('[data-act=open-recent]')).length, 3, 'cancel keeps everything');
    await page.click(sheetSel + ' [data-act=clear-all]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.click('.sheet-wrap.open:last-child [data-ok]'); await noSheets(page);
    eq((await page.$$('[data-act=open-recent]')).length, 0); assert.ok(await page.isVisible('[data-act=sample]'));
    const ls = await lsAll(page); assert.ok(!('recent' in ls) && !('game' in ls) && !('prefs' in ls), 'storage emptied: ' + Object.keys(ls));
    await openSheet(page, '[data-act=settings]'); eq(await page.getAttribute(sheetSel + ' [data-switch=sound]', 'aria-checked'), 'true', 'settings are back to defaults');
    // bad files are refused
    const refuse = async (name, buf, re) => {
      await page.setInputFiles(sheetSel + ' [data-restore]', { name, mimeType: 'application/json', buffer: Buffer.from(buf) });
      await waitToast(page, re); assert.match(await toastText(page), /Nothing was changed/); eq(await sheetCount(page), 1, 'no confirm sheet for a bad file');
    };
    await refuse('notes.json', 'hello this is not json', /isn't a Scoreboard backup/i);
    await refuse('other.json', backupJSON({ app: 'locker', v: 1, recent: [] }), /isn't a Scoreboard backup/i);
    await refuse('damaged.json', backupJSON({ app: 'scoreboard', v: 1 }), /looks damaged/i);
    await refuse('future.json', backupJSON({ app: 'scoreboard', v: 9, recent: [] }), /newer version/i);
    eq(Object.keys(await lsAll(page)).filter(k => k === 'recent').length, 0, 'still nothing stored');
    // now the real one: confirm sheet, then restored
    await page.setInputFiles(sheetSel + ' [data-restore]', file); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    assert.match(await txt(page, '.sheet-wrap.open:last-child'), /backup has 3 recent games/);
    await shot(page, 91, 'restore-confirm', 390);
    await page.click('.sheet-wrap.open:last-child [data-ok]'); await noSheets(page); await waitToast(page, /Restored 3 games/);
    eq((await page.$$('[data-act=open-recent]')).length, 3); await reload(page); await page.waitForSelector('.home'); eq((await page.$$('[data-act=open-recent]')).length, 3, 'it was stored, not just shown');
    await openSheet(page, '[data-act=settings]'); eq(await page.getAttribute(sheetSel + ' [data-switch=sound]', 'aria-checked'), 'false', 'settings came back from the backup');
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== XSS */
  await test('XSS: markup typed into names, labels and notes (and slipped into a restored file) is shown as text and never runs', async () => {
    const { page, errors } = await fresh({ xss: true });
    const T1 = '<svg onload=x()>', T2 = '"onfocus="x()', LAB = '<img src=x onerror=x()>';
    await page.fill('.team-edit[data-team="0"] .t-in', T1); await page.press('.team-edit[data-team="0"] .t-in', 'Tab');
    await page.fill('.team-edit[data-team="1"] .t-in', T2); await page.press('.team-edit[data-team="1"] .t-in', 'Tab');
    const inert = async what => {
      eq(await page.evaluate(() => window.__xss), undefined, what + ': nothing ran');
      eq(await page.$$eval('#app img, #app svg[onload], #app [onerror], #app [onfocus], .sheet-wrap img, .sheet-wrap [onerror]', e => e.length), 0, what + ': nothing was injected into the page');
    };
    await startSport(page, 'generic');
    eq(await txt(page, '.t-home .t-name'), T1); eq(await txt(page, '.t-away .t-name'), T2); await inert('board');
    await page.click(SC(0, 1)); await page.click('.plabel'); await page.waitForSelector('#pl-in'); await page.waitForTimeout(300); await page.fill('#pl-in', LAB); await page.press('#pl-in', 'Enter'); await noSheets(page);
    eq(await txt(page, '.plabel'), LAB); await inert('label');
    await openSheet(page, '[data-act=b-log]'); eq(await txt(page, sheetSel + ' .log li'), T1 + ' +1'); await inert('undo log'); await closeSheets(page);
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-edit]'); await page.waitForSelector(sheetSel + ' .t-in'); eq(await page.inputValue(sheetSel + ' .t-in >> nth=0'), T1); await inert('edit sheet'); await closeSheets(page);
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForSelector(sheetSel + ' .resultbox'); eq((await txt(page, sheetSel + ' .resultbox')).split('\n')[0], T1 + ' 1, ' + T2 + ' 0 (Final)'); await inert('finish sheet');
    await page.click(sheetSel + ' [data-ok]'); await page.waitForSelector(sheetSel + ' .rv-board'); await inert('recent view'); await closeSheets(page);
    assert.match(await txt(page, '.grow-row .gs'), /<svg onload=x\(\)> 1 - 0/); await inert('home list');
    eq(await page.$eval('[data-act=open-recent]', e => /^[A-Za-z0-9_-]+$/.test(e.dataset.id)), true, 'ids are plain');
    // football ball spot
    await startSport(page, 'football'); await page.click('[data-act=b-down]'); await page.waitForSelector('#d-ball'); await page.waitForTimeout(300);
    await page.fill('#d-ball', '<u>x</u>'); await page.press('#d-ball', 'Tab'); eq(await txt(page, '.dd-s'), 'BALL ON <U>X</U>'); await inert('ball on'); await closeSheets(page);
    // a hostile backup: strings with markup, a bad color, a bad id
    const evil = C.sampleGames(TODAY, NOW); evil[0].id = '"><img src=x onerror=x()>'; evil[0].teams = [{ n: '<img src=x onerror=x()>', c: 'red;background:url(x)' }, { n: '<b>x</b>', c: '#ffc83d' }]; evil[0].label = LAB; evil[0].date = '<img src=x onerror=x()>';
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home');
    await openSheet(page, '[data-act=settings]');
    await page.setInputFiles(sheetSel + ' [data-restore]', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'scoreboard', v: 1, saved: '<script>x()</script>', prefs: { teams: [{ n: LAB, c: 'expression(x())' }, { n: LAB }] }, recent: evil })) });
    await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.click('.sheet-wrap.open:last-child [data-ok]'); await noSheets(page);
    eq((await page.$$('[data-act=open-recent]')).length, 3); await inert('restored home');
    await page.click('[data-act=open-recent] >> nth=0'); await page.waitForSelector(sheetSel + ' .rv-board'); await inert('restored game'); await closeSheets(page);
    eq(await page.$$eval('.t-in', i => i.map(x => x.value).join('|')), LAB.slice(0, 16) + '|' + LAB.slice(0, 16));
    eq(await page.evaluate(() => window.__xss), undefined);
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== offline */
  await test('Offline: after one visit the service worker serves the whole app with no network, and only prunes its own caches', async () => {
    const { ctx, page, errors } = await fresh({ np: { sw: true }, init: () => { if (!sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); caches.open('situations-v99').then(c => c.put('/x', new Response('x'))); caches.open('scoreboard-v0').then(c => c.put('/y', new Response('y'))); } } });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.includes('scoreboard-v1') && !k.includes('scoreboard-v0') && (await (await caches.open('scoreboard-v1')).keys()).length >= 8; }, null, { timeout: 10000 });
    const cached = await page.evaluate(async () => (await (await caches.open('scoreboard-v1')).keys()).map(r => new URL(r.url).pathname));
    for (const f of ['/apps/scoreboard/', '/apps/scoreboard/core.js', '/apps/scoreboard/ui.js', '/apps/scoreboard/rules.js', '/apps/scoreboard/share.js', '/apps/scoreboard/board.js', '/apps/scoreboard/app.js', '/apps/scoreboard/scoreboard.css', '/apps/scoreboard/manifest.json']) assert.ok(cached.includes(f), 'cached ' + f + ' in ' + cached.join());
    await reload(page); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the page is controlled by the worker');
    await ctx.setOffline(true);
    await reload(page); await page.waitForSelector('.home', { timeout: 7000 });
    await startSport(page, 'basketball'); await page.click(SC(0, 3)); deq(await scores(page), [3, 0]);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home .resume');
    await ctx.setOffline(false);
    const keys = await page.evaluate(() => caches.keys()); assert.ok(keys.includes('situations-v99'), "another app's cache is untouched"); assert.ok(!keys.includes('scoreboard-v0'), 'an old scoreboard- cache is removed');
    noErr(errors); await ctx.close();
  });

  /* ===================================================================== Back button */
  const inApp = page => page.url().startsWith(URL0);
  const settle = page => page.waitForTimeout(500);
  await test('Back: closes one sheet and stays in the app; stacked sheets peel one at a time; Cancel gives the entry back', async () => {
    let { page, errors } = await fresh();
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0); assert.ok(inApp(page), 'still in the app: ' + page.url()); noErr(errors); await page.context().close();
    ({ page } = await fresh());
    await openSheet(page, '[data-act=settings]'); await page.click(sheetSel + ' [data-act=rules][data-sport=baseball]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(inApp(page)); await page.context().close();
    ({ page } = await fresh());
    await openSheet(page, '[data-act=settings]'); await page.click(sheetSel + ' [data-act=rules][data-sport=baseball]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.waitForTimeout(300);
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page); eq(await sheetCount(page), 1);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(inApp(page), 'the cancelled sheet left no stray entry'); await page.context().close();
  });
  await test('Back: closing a sheet with its X or Esc gives its history entry back (Back then leaves the page, not a ghost sheet)', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.waitForTimeout(300); await page.click(sheetSel + ' .x'); await settle(page); eq(await sheetCount(page), 0);
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await settle(page); eq(await sheetCount(page), 0);
    await page.click('[data-act=settings]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0); assert.ok(inApp(page), 'closed sheets left no stray entries: ' + page.url());
    await page.goBack(); await settle(page); assert.ok(!inApp(page), 'a second Back leaves the app: ' + page.url());
    noErr(errors); await page.context().close();
  });
  await test('Back: on the scoreboard it goes Home and keeps the game; a sheet that replaces another keeps Back in step', async () => {
    const { page, errors } = await fresh();
    await startSport(page, 'basketball'); await page.click(SC(0, 2));
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-clock]'); await page.waitForSelector('#c-min'); await page.waitForTimeout(400);
    eq(await sheetCount(page), 1, 'the menu closed and the clock sheet replaced it');
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(await page.isVisible('.board'), 'one Back only closed the sheet'); assert.ok(inApp(page));
    await page.goBack(); await settle(page); assert.ok(await page.isVisible('.home .resume'), 'the next Back goes Home'); assert.ok(inApp(page));
    eq((await live(page)).score[0], 2, 'and the game is still there');
    await page.click('[data-act=resume]'); await page.waitForSelector('.board'); deq(await scores(page), [2, 0]);
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home'); await settle(page);
    await page.goBack(); await settle(page); assert.ok(!inApp(page), 'with the entry given back, Back leaves the app: ' + page.url());
    noErr(errors); await page.context().close();
  });
  await test('Back: finishing a game, Esc, and a confirm over the menu all leave history tidy', async () => {
    const { page, errors } = await fresh({ ls: board(SEED.basketball()) });
    await openSheet(page, '[data-act=b-menu]'); await page.click(sheetSel + ' [data-act=b-finish]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.waitForTimeout(300);
    await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForSelector('.home'); await page.waitForSelector(sheetSel + ' .rv-board'); await settle(page);
    eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(await page.isVisible('.home')); assert.ok(inApp(page), 'back from the result sheet stays on Home');
    await page.goBack(); await settle(page); assert.ok(!inApp(page), 'then Back leaves: ' + page.url());
    noErr(errors); await page.context().close();
  });

  /* ===================================================================== wake lock, motion */
  await test('Wake lock: requested when a game opens and released when it closes; a plain note when the browser cannot or says no', async () => {
    let { page, errors } = await fresh();
    await startSport(page, 'basketball'); eq(await page.evaluate(() => window.SBApp.SB.wake.state), 'on'); assert.ok(!/keep the screen on/.test(await toastText(page)));
    await page.click('[data-act=b-home]'); await page.waitForSelector('.home'); eq(await page.evaluate(() => window.SBApp.SB.wake.state), 'off'); noErr(errors); await page.context().close();
    ({ page, errors } = await fresh({ wake: 'none' }));
    await startSport(page, 'basketball'); await waitToast(page, /can't keep the screen on/i); eq(await page.evaluate(() => window.SBApp.SB.wake.state), 'unsupported');
    await openSheet(page, '[data-act=b-menu]'); assert.match(await txt(page, sheetSel), /can't keep the screen on/i); noErr(errors); await page.context().close();
    ({ page, errors } = await fresh({ wake: 'denied' }));
    await startSport(page, 'basketball'); await waitToast(page, /can't keep the screen on/i); eq(await page.evaluate(() => window.SBApp.SB.wake.state), 'denied'); noErr(errors); await page.context().close();
  });

  await test('prefers-reduced-motion: no score pop and transitions are near zero; with motion allowed the pop is there', async () => {
    let { page, errors } = await fresh({ np: { reducedMotion: true } });
    await startSport(page, 'basketball'); await page.click(SC(0, 1));
    eq(await page.$eval('.t-score[data-i="0"]', e => e.classList.contains('pop')), false);
    assert.ok(await page.$eval('.cb', e => parseFloat(getComputedStyle(e).transitionDuration)) < 0.01, 'transitions are off');
    await page.click('[data-act=b-menu]'); await page.waitForSelector(sheetSel);
    assert.ok(await page.$eval(sheetSel, e => parseFloat(getComputedStyle(e).transitionDuration)) < 0.01, 'the sheet does not slide');
    noErr(errors); await page.context().close();
    ({ page, errors } = await fresh());
    await startSport(page, 'basketball'); await page.click(SC(0, 1)); eq(await page.$eval('.t-score[data-i="0"]', e => e.classList.contains('pop')), true);
    await page.context().close();
  });

  await test('Files: each under 60 KB, every file is in the service worker shell, manifest is valid, nothing calls the network but the two allowed hosts', async () => {
    const dir = path.join(__dirname, '..', 'apps', 'scoreboard');
    const files = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile());
    files.forEach(f => assert.ok(fs.statSync(path.join(dir, f)).size < 60 * 1024, f + ' is ' + fs.statSync(path.join(dir, f)).size + ' bytes'));
    const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
    files.filter(f => f !== 'sw.js' && !/\.(png)$/.test(f)).forEach(f => assert.ok(f === 'index.html' ? sw.includes('"./"') : sw.includes('"' + f + '"'), 'sw.js lists ' + f));
    assert.ok(sw.includes('const CACHE = "scoreboard-v1"') && sw.includes('startsWith("scoreboard-")'));
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    eq(man.orientation, 'any'); eq(man.display, 'standalone'); assert.ok(man.icons.length >= 2 && man.name && man.short_name);
    const code = files.filter(f => /\.(js|html)$/.test(f) && f !== 'sw.js').map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon/.test(code), 'no network calls in app code');
    const urls = (code.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(u => !/^https?:\/\/www\.w3\.org/.test(u));
    urls.forEach(u => assert.ok(/natesteele888\.github\.io\/apps\/(install|health)\.js|fonts\.(googleapis|gstatic)\.com/.test(u), 'unexpected external reference: ' + u));
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}|\b\d{3}[.) -]\d{3}[.-]\d{4}\b/i.test(code + fs.readFileSync(path.join(dir, 'scoreboard.css'), 'utf8')), 'no emails or phone numbers');
    assert.ok(/<script src="https:\/\/natesteele888\.github\.io\/apps\/(install|health)\.js" defer><\/script>/.test(code), 'shared install script');
  });

  /* ---- big scores never touch (390x844 and 320x640, every sport, 2 and 3 digit scores), long names in Recent games wrap ---- */
  const SCORE_SEED = (sport, a, b) => {
    if (sport === 'baseball') return mk('baseball', [{ type: 'set', k: 'inn', team: 0, i: 0, v: a }, { type: 'set', k: 'inn', team: 1, i: 0, v: b }]);
    return mk(sport, [...sc(0, 1, a), ...sc(1, 1, b)]);
  };
  async function scoreGaps(page) {
    return page.evaluate(() => {
      const box = i => { const el = document.querySelector('.t-score[data-i="' + i + '"]'), r = document.createRange(); r.selectNodeContents(el); const g = r.getBoundingClientRect(), t = el.closest('.team').getBoundingClientRect(); return { l: g.left, r: g.right, tl: t.left, tr: t.right, fs: parseFloat(getComputedStyle(el).fontSize) }; };
      const h = box(0), a = box(1);
      return { gap: a.l - h.r, hOut: Math.max(h.tl - h.l, h.r - h.tr, 0), aOut: Math.max(a.tl - a.l, a.r - a.tr, 0), fs: [h.fs, a.fs] };
    });
  }
  for (const [w, h] of [[390, 844], [320, 640]]) {
    await test('Layout ' + w + 'x' + h + ': two big scores always have a gap and stay in their own half (21/17, 100/99, every sport, locked too)', async () => {
      const { page, errors } = await fresh({ np: { ctx: { viewport: { width: w, height: h } } } });
      const bad = [];
      for (const sport of ['basketball', 'baseball', 'football', 'generic']) {
        for (const [a, b] of [[21, 17], [88, 88], [100, 99], [999, 999]]) {
          await loadState(page, board(SCORE_SEED(sport, a, b)));
          for (const locked of [false, true]) {
            if (locked) { await page.evaluate(() => document.querySelector('.board').classList.add('locked')); await page.waitForTimeout(50); }
            const r = await scoreGaps(page);
            const tag = w + ' ' + sport + ' ' + a + '/' + b + (locked ? ' locked' : '');
            if (r.gap < 8) bad.push(tag + ': gap only ' + Math.round(r.gap) + 'px');
            if (r.hOut > 0.5 || r.aOut > 0.5) bad.push(tag + ': a score spills out of its half by ' + Math.round(Math.max(r.hOut, r.aOut)) + 'px');
            if (Math.min(...r.fs) < 40) bad.push(tag + ': shrank below 40px (' + r.fs + ')');
          }
        }
      }
      deq(bad, [], 'score layout problems');
      noErr(errors); await page.context().close();
    });
    await test('Layout ' + w + 'x' + h + ': Recent games lines wrap instead of cutting off team names', async () => {
      const { page, errors } = await fresh({ np: { ctx: { viewport: { width: w, height: h } } } });
      const mkR = (sport, a, b, id) => { const g = SCORE_SEED(sport, a, b); g.teams = [{ n: 'HAWKS', c: COL[0] }, { n: 'THUNDERBOLTS', c: COL[1] }]; g.id = id; return C.makeRecent(g, 'final', NOW); };
      await loadState(page, { recent: [mkR('basketball', 48, 41, 'r-1'), mkR('basketball', 100, 99, 'r-2'), mkR('football', 21, 17, 'r-3')] });
      const rows = await page.$$eval('.grow-row .gs', els => els.map(e => ({ t: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, ws: getComputedStyle(e).whiteSpace, to: getComputedStyle(e).textOverflow, fs: parseFloat(getComputedStyle(e).fontSize) })));
      eq(rows.length, 3);
      rows.forEach(r => {
        assert.ok(r.sw <= r.cw + 1, '"' + r.t + '" is cut off (' + r.sw + ' > ' + r.cw + ')');
        assert.ok(r.ws !== 'nowrap' || r.to !== 'ellipsis', '"' + r.t + '" still uses an ellipsis');
        assert.ok(r.fs >= 16, 'text stayed readable');
      });
      eq(await overflow(page), 0, 'no sideways scroll');
      await shot(page, 95, 'recent-long-names', w);
      noErr(errors); await page.context().close();
    });
  }

//__UI2__

  await br.close(); srv.stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const passed = results.filter(r => r[1]).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) { console.log('FAILED: ' + results.filter(r => !r[1]).map(r => r[0]).join('; ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
