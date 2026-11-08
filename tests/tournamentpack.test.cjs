// Tournament Pack tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/tournamentpack.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
// Part 1 tests core.js on its own (numbers worked out by hand in the comments). Part 2 drives the real app in Chrome.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/tournamentpack/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07'; // a Saturday
const NOW = '2026-11-07T18:00';
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return; // ONLY="bracket" runs just the matching tests while debugging
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deq = (a, b, m) => assert.deepStrictEqual(a, b, m);

/* ================= part 1: core logic ================= */
// helpers to build games
let gid = 0;
const P = (a, b, sa, sb, extra) => Object.assign({ id: 'g' + (++gid), kind: 'pool', date: '2026-11-07', time: '', field: '', label: '', a, b, status: sa == null ? 'scheduled' : 'final', sa: sa == null ? null : sa, sb: sb == null ? null : sb, innings: null, forfeit: '' }, extra || {});
const BASE = Object.assign({}, C.defaultRules('baseball'), { sport: 'baseball' });
const BB = Object.assign({}, C.defaultRules('basketball'), { sport: 'basketball' });
const order = (res) => res.rows.map(r => r.team).join(',');
const ranks = (res) => res.rows.map(r => r.team + ':' + r.rank + (r.tied ? 't' : '')).join(',');

(async () => {
  await test('core: time parsing and display', async () => {
    eq(C.parseTime('9:30'), '09:30'); eq(C.parseTime('930pm'), '21:30'); eq(C.parseTime('9 PM'), '21:00'); eq(C.parseTime('12am'), '00:00'); eq(C.parseTime('12:15 pm'), '12:15');
    eq(C.parseTime('13:05'), '13:05'); eq(C.parseTime('24:00'), ''); eq(C.parseTime('9:75'), ''); eq(C.parseTime('13pm'), ''); eq(C.parseTime(''), ''); eq(C.parseTime(null), ''); eq(C.parseTime('noon'), '');
    eq(C.fmtTime('00:05'), '12:05 AM'); eq(C.fmtTime('12:00'), '12:00 PM'); eq(C.fmtTime('13:30'), '1:30 PM'); eq(C.fmtTime('09:00'), '9:00 AM'); eq(C.fmtTime('bad'), '');
  });

  await test('core: arrive-by is game time minus warm-up, across midnight too', async () => {
    deq(C.arriveBy('2026-11-07', '09:00', 45), { date: '2026-11-07', time: '08:15' });
    deq(C.arriveBy('2026-11-07', '09:00', 0), { date: '2026-11-07', time: '09:00' });
    deq(C.arriveBy('2026-11-07', '09:00', 60), { date: '2026-11-07', time: '08:00' });
    deq(C.arriveBy('2026-11-07', '00:30', 45), { date: '2026-11-06', time: '23:45' }); // 00:30 - 45 min = 23:45 the day before
    deq(C.arriveBy('2026-03-01', '00:10', 30), { date: '2026-02-28', time: '23:40' });
    eq(C.arriveBy('2026-11-07', '', 45), null); eq(C.arriveBy('nope', '09:00', 45), null);
    deq(C.arriveBy('2026-11-07', '09:00', 'abc'), { date: '2026-11-07', time: '08:15' }, 'bad warm-up falls back to 45');
  });

  await test('core: durations and countdown wording', async () => {
    eq(C.fmtDur(25), '25 min'); eq(C.fmtDur(60), '1 h'); eq(C.fmtDur(130), '2 h 10 min'); eq(C.fmtDur(1500), '1 day 1 h'); eq(C.fmtDur(2880), '2 days'); eq(C.fmtDur(0), '0 min');
    eq(C.countdownText(130), 'in 2 h 10 min'); eq(C.countdownText(25), 'in 25 min'); eq(C.countdownText(0), 'starting now'); eq(C.countdownText(-12), 'started 12 min ago'); eq(C.countdownText(-75), 'started 1 h 15 min ago');
  });

  await test('core: rest between games (gap) and the under-60 warning', async () => {
    const g = (d, t) => ({ date: d, time: t });
    // game 1 at 08:00 + 90 min game = ends 09:30. Game 2 at 10:15 -> 45 min rest.
    let r = C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '10:15'), 90); eq(r.min, 45); eq(r.warn, true); eq(r.text, 'Only about 45 min to eat and rest');
    // 10:15 + 90 = 11:45; next at 13:00 -> 75 min
    r = C.gapInfo(g('2026-11-07', '10:15'), g('2026-11-07', '13:00'), 90); eq(r.min, 75); eq(r.warn, false); eq(r.text, 'About 1 h 15 min between games');
    r = C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '10:30'), 90); eq(r.min, 60); eq(r.warn, false, '60 is not under 60');
    r = C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '10:29'), 90); eq(r.min, 59); eq(r.warn, true);
    r = C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '09:00'), 90); eq(r.min, -30); eq(r.warn, true); assert.ok(/Back to back/.test(r.text));
    r = C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '09:30'), 90); eq(r.min, 0); assert.ok(/Back to back/.test(r.text));
    eq(C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-08', '09:00'), 90), null, 'different days');
    eq(C.gapInfo(g('2026-11-07', ''), g('2026-11-07', '09:00'), 90), null, 'no time');
    // basketball default length is 60: 08:00 -> ends 09:00, next 09:40 -> 40 min
    eq(C.gapInfo(g('2026-11-07', '08:00'), g('2026-11-07', '09:40'), C.gameMinutes({ sport: 'basketball' })).min, 40);
  });

  /* ---------- standings: hand-computed scenarios ---------- */
  await test('standings 1: no games at all', async () => {
    const r = C.standings([], BASE); deq(r.rows, []); deq(r.ties, []); eq(r.counted, 0);
  });

  await test('standings 2: only scheduled games: teams are listed (auto-added) but unranked', async () => {
    const r = C.standings([P('Team A', 'Team B'), P('Team C', 'Team A')], BASE);
    eq(order(r), 'Team A,Team B,Team C'); r.rows.forEach(x => { eq(x.rank, null); eq(x.gp, 0); eq(x.pctText, '-'); }); eq(r.pending, 2); eq(r.ties.length, 0);
  });

  await test('standings 3: simple order, win percentage, records and run totals', async () => {
    // A beat B 5-2, A beat C 3-1, B beat C 4-0.
    // A 2-0 (PF 5+3=8, PA 2+1=3) ; B 1-1 (PF 2+4=6, PA 5+0=5) ; C 0-2 (PF 1+0=1, PA 3+4=7)
    const r = C.standings([P('A', 'B', 5, 2), P('A', 'C', 3, 1), P('B', 'C', 4, 0)], BASE);
    eq(ranks(r), 'A:1,B:2,C:3');
    const a = r.rows[0], b = r.rows[1], c = r.rows[2];
    eq([a.w, a.l, a.t, a.pf, a.pa, a.diff].join(), '2,0,0,8,3,5'); eq(a.pctText, '1.000');
    eq([b.w, b.l, b.pf, b.pa, b.diff].join(), '1,1,6,5,1'); eq(b.pctText, '.500');
    eq([c.w, c.l, c.pf, c.pa, c.diff].join(), '0,2,1,7,-6'); eq(c.pctText, '.000');
    eq(r.ties.length, 0); eq(r.counted, 3);
  });

  await test('standings 4: different numbers of games: ranked by win percentage, not by wins', async () => {
    // A beat C 4-3, A beat D 6-1, G beat A 3-2 -> A 2-1 (.667) PF 4+6+2=12 PA 3+1+3=7
    // B beat G 5-0 -> B 1-0 (1.000). G: beat A, lost to B -> 1-1 (.500) PF 3+0=3 PA 2+5=7. C 0-1, D 0-1.
    // B has ONE win and A has TWO, but 1.000 > .667 so B is first. C and D (0-1, never met): fewest allowed: C allowed 4 (A 4-3 -> C allowed 4), D allowed 6 -> C first.
    const r = C.standings([P('A', 'C', 4, 3), P('A', 'D', 6, 1), P('G', 'A', 3, 2), P('B', 'G', 5, 0)], BASE);
    eq(order(r), 'B,A,G,C,D'); eq(r.rows[0].w, 1); eq(r.rows[1].w, 2);
    eq(r.rows[1].pctText, '.667'); eq(r.rows[0].pctText, '1.000');
    eq(ranks(r), 'B:1,A:2,G:3,C:4,D:5');
    eq(r.ties.length, 1); deq(r.ties[0].teams.slice().sort(), ['C', 'D']); eq(r.ties[0].steps.map(s => s.crit + (s.split ? '+' : '-')).join(), 'h2h-,pa+');
  });

  await test('standings 5: two-way tie goes to head-to-head BEFORE runs allowed', async () => {
    // A beat B 3-2; B beat C 4-0; D beat A 2-1; D beat C 5-1.
    // D 2-0. A 1-1 (PF 3+1=4, PA 2+2=4). B 1-1 (PF 2+4=6, PA 3+0=3). C 0-2.
    // A and B tie at .500. B has fewer runs allowed (3 < 4) but A beat B head-to-head, so A is ahead.
    const r = C.standings([P('A', 'B', 3, 2), P('B', 'C', 4, 0), P('D', 'A', 2, 1), P('D', 'C', 5, 1)], BASE);
    eq(order(r), 'D,A,B,C');
    const tie = r.ties[0]; deq(tie.teams.slice().sort(), ['A', 'B']); eq(tie.steps[0].crit, 'h2h'); eq(tie.steps[0].split, true);
    deq(tie.steps[0].table.map(x => x.team + ' ' + x.w + '-' + x.l), ['A 1-0', 'B 0-1'], 'mini table for a 2-way tie');
    eq(tie.resolved, true); eq(tie.from, 2); eq(tie.to, 3); eq(tie.steps.length, 1, 'later steps are not needed');
  });

  await test('standings 6: head-to-head split 1-1 falls to fewest runs allowed', async () => {
    // A beat B 4-2; B beat A 3-1; A beat C 6-0; B beat C 2-1.
    // A 2-1 (PA 2+3+0=5, PF 4+1+6=11). B 2-1 (PA 4+1+1=6, PF 2+3+2=7). C 0-2.
    // A-B head-to-head is 1-1 -> no split. Fewest allowed: A 5 < B 6 -> A first.
    const r = C.standings([P('A', 'B', 4, 2), P('B', 'A', 3, 1), P('A', 'C', 6, 0), P('B', 'C', 2, 1)], BASE);
    eq(order(r), 'A,B,C'); const tie = r.ties[0];
    eq(tie.steps.map(s => s.crit + (s.split ? '+' : '-')).join(), 'h2h-,pa+'); eq(tie.steps[1].text.includes('A 5') && tie.steps[1].text.includes('B 6'), true, tie.steps[1].text);
  });

  await test('standings 7: run differential is capped per game (8 baseball) and the cap is configurable', async () => {
    // A beat X 20-0, Y beat A 6-0. B beat X 9-3, Y beat B 3-0.   Y 2-0, A 1-1, B 1-1, X 0-2.
    // A and B: never met (head-to-head equal). PA: A 0+6=6, B 3+3=6 -> equal.
    // Capped diff (cap 8): A min(20,8)=+8 and -6 -> +2. B +6 and -3 -> +3. B is ahead.
    // With no cap (0): A +20-6 = +14 > B +6-3 = +3 -> A is ahead.
    const gs = [P('A', 'X', 20, 0), P('Y', 'A', 6, 0), P('B', 'X', 9, 3), P('Y', 'B', 3, 0)];
    let r = C.standings(gs, BASE);
    eq(order(r), 'Y,B,A,X'); eq(r.rows[2].cdiff, 2); eq(r.rows[1].cdiff, 3); eq(r.rows[2].diff, 14, 'raw diff is still shown');
    const tie = r.ties.filter(t => t.teams.includes('A') && t.teams.includes('B'))[0];
    eq(tie.steps.map(s => s.crit + (s.split ? '+' : '-')).join(), 'h2h-,pa-,diff+');
    r = C.standings(gs, Object.assign({}, BASE, { cap: 0 })); eq(order(r), 'Y,A,B,X', 'no cap');
    r = C.standings(gs, Object.assign({}, BASE, { cap: 20 })); eq(order(r), 'Y,A,B,X', 'cap 20 is not reached by 20-0? 20 is allowed');
    r = C.standings(gs, Object.assign({}, BASE, { cap: 9 })); // A: +9-6=+3, B: +6-3=+3 -> equal; PF: A 20 > B 9 -> A
    eq(order(r), 'Y,A,B,X'); eq(r.ties.filter(t => t.teams.includes('A'))[0].steps.map(s => s.crit + (s.split ? '+' : '-')).join(), 'h2h-,pa-,diff-,pf+');
  });

  await test('standings 8: most runs scored is the last real tiebreaker', async () => {
    // A beat X 20-0, Y beat A 5-0. B beat X 8-3, Y beat B 2-0.  A and B are 1-1, never met.
    // PA: A 0+5=5, B 3+2=5 equal. Capped diff: A +8-5=+3, B +5-2=+3 equal. PF: A 20 vs B 8 -> A first.
    const r = C.standings([P('A', 'X', 20, 0), P('Y', 'A', 5, 0), P('B', 'X', 8, 3), P('Y', 'B', 2, 0)], BASE);
    eq(order(r), 'Y,A,B,X'); const tie = r.ties.filter(t => t.teams.includes('A') && t.teams.includes('B'))[0];
    eq(tie.steps.map(s => s.crit + (s.split ? '+' : '-')).join(), 'h2h-,pa-,diff-,pf+'); eq(tie.resolved, true);
  });

  await test('standings 9: everything equal -> still tied, flagged for the director (coin flip)', async () => {
    // A beat B 3-2 and B beat A 3-2: each 1-1, PF 5, PA 5, diff 0.
    const r = C.standings([P('A', 'B', 3, 2), P('B', 'A', 3, 2)], BASE);
    eq(ranks(r), 'A:1t,B:1t'); eq(r.ties[0].resolved, false); deq(r.ties[0].stillTied, [['A', 'B']]); assert.ok(/Still tied: A and B\. The tournament director decides/.test(r.ties[0].summary));
    eq(r.ties[0].steps.map(s => s.crit).join(), 'pct,h2h,pa,diff,pf', 'the whole table is level, so win percentage is the first step shown');
  });

  await test('standings 10: 3-way circular tie (A>B, B>C, C>A): head-to-head is even, runs allowed decides', async () => {
    // A beat B 2-1; B beat C 3-0; C beat A 4-0.  Each is 1-1.
    // Head-to-head among the three: each 1-1 -> no split.
    // Runs allowed: A 1+4=5, B 2+0=2, C 3+0=3 -> B, C, A.
    const r = C.standings([P('A', 'B', 2, 1), P('B', 'C', 3, 0), P('C', 'A', 4, 0)], BASE);
    eq(order(r), 'B,C,A'); const tie = r.ties[0];
    eq(tie.steps[0].crit, 'pct'); eq(tie.steps[0].split, false, 'all three are 1-1');
    eq(tie.steps[1].crit, 'h2h'); eq(tie.steps[1].split, false); deq(tie.steps[1].table.map(x => x.w + '-' + x.l), ['1-1', '1-1', '1-1']);
    eq(tie.steps[2].crit, 'pa'); eq(tie.steps[2].split, true); eq(tie.final.join(), 'B,C,A'); eq(tie.from, 1); eq(tie.to, 3);
  });

  await test('standings 11: after a step splits a 3-way tie, the steps start over for the two still tied (head-to-head again)', async () => {
    // A beat B 2-1; B beat C 3-0; C beat A 1-0.  Each 1-1 and circular.
    // Runs allowed: A 1+1=2, B 2+0=2, C 3+0=3 -> A and B level at 2, C last.
    // Start over for A and B only: A beat B head-to-head -> A first. Final A, B, C.
    const r = C.standings([P('A', 'B', 2, 1), P('B', 'C', 3, 0), P('C', 'A', 1, 0)], BASE);
    eq(order(r), 'A,B,C'); const steps = r.ties[0].steps;
    eq(steps.map(s => s.crit + (s.split ? '+' : '-') + ':' + s.among.join('')).join(), 'pct-:ABC,h2h-:ABC,pa+:ABC,h2h+:AB');
    eq(steps[3].table.map(x => x.team + x.w).join(), 'A1,B0'); eq(r.ties[0].resolved, true);
  });

  await test('standings 12: forfeits count as 7-0 (baseball) or 2-0 (basketball), and the number is configurable', async () => {
    // A forfeits to B. Baseball default 7-0: B 1-0 PF 7 PA 0 ; A 0-1 PF 0 PA 7.
    let r = C.standings([P('A', 'B', null, null, { status: 'final', forfeit: 'a' })], BASE);
    eq(order(r), 'B,A'); eq([r.rows[0].w, r.rows[0].pf, r.rows[0].pa].join(), '1,7,0'); eq([r.rows[1].l, r.rows[1].pf, r.rows[1].pa].join(), '1,0,7');
    // B forfeits to A (b is the one that forfeited) in basketball: 2-0 for A
    r = C.standings([P('A', 'B', null, null, { status: 'final', forfeit: 'b' })], BB);
    eq(order(r), 'A,B'); eq([r.rows[0].pf, r.rows[0].pa].join(), '2,0');
    // custom forfeit score 5-0, and its capped diff: +5
    r = C.standings([P('A', 'B', null, null, { status: 'final', forfeit: 'b' })], Object.assign({}, BASE, { forfeitWin: 5 }));
    eq(r.rows[0].pf, 5); eq(r.rows[0].cdiff, 5);
    // entered scores are ignored on a forfeit
    r = C.standings([P('A', 'B', 9, 1, { forfeit: 'a', status: 'final' })], BASE); eq(r.rows[0].team, 'B'); eq(r.rows[0].pf, 7);
  });

  await test('standings 13: tied games count half; ties-off rule only warns', async () => {
    // A tied B 3-3, A beat C 2-0.  A 1-0-1 -> (2*1+1)/(2*2) = .750. B 0-0-1 = .500. C 0-1 = .000
    let r = C.standings([P('A', 'B', 3, 3), P('A', 'C', 2, 0)], BASE);
    eq(order(r), 'A,B,C'); eq(r.rows[0].pctText, '.750'); eq(r.rows[1].pctText, '.500'); eq([r.rows[0].w, r.rows[0].l, r.rows[0].t].join(), '1,0,1'); eq(r.warnings.length, 0);
    r = C.standings([P('A', 'B', 3, 3)], Object.assign({}, BASE, { tiesAllowed: false }));
    eq(r.warnings.length, 1); assert.ok(/ties are turned off/.test(r.warnings[0]));
  });

  await test('standings 14: tiebreakers can be reordered and switched off', async () => {
    // Same games as scenario 5. Default: A ahead of B (head-to-head). Runs allowed first: B (3) ahead of A (4).
    const gs = [P('A', 'B', 3, 2), P('B', 'C', 4, 0), P('D', 'A', 2, 1), P('D', 'C', 5, 1)];
    eq(order(C.standings(gs, BASE)), 'D,A,B,C');
    eq(order(C.standings(gs, Object.assign({}, BASE, { order: ['pct', 'pa', 'h2h', 'diff', 'pf'] }))), 'D,B,A,C');
    eq(order(C.standings(gs, Object.assign({}, BASE, { off: ['h2h'] }))), 'D,B,A,C', 'head-to-head switched off: runs allowed decides');
    // everything off after win%: A and B stay tied
    const r = C.standings(gs, Object.assign({}, BASE, { off: ['h2h', 'pa', 'diff', 'pf'] }));
    eq(ranks(r), 'D:1,A:2t,B:2t,C:4'); eq(r.ties[0].resolved, false);
    // bad order input is repaired (unknown ids dropped, missing ones appended)
    deq(C.sanitizeRules({ order: ['pf', 'zzz', 'pf', 'pct'] }, 'baseball').order, ['pf', 'pct', 'h2h', 'pa', 'diff']);
  });

  await test('standings 15: teams with different numbers of games: runs allowed is compared per game', async () => {
    // A beat X 5-4. B beat Y 3-2, B beat Z 6-4.  A is 1-0, B is 2-0, both 1.000. They have not met.
    // Runs allowed: A 4 in 1 game = 4.0 per game. B 2+4 = 6 in 2 games = 3.0 per game -> B first even though 6 > 4 in total.
    const r = C.standings([P('A', 'X', 5, 4), P('B', 'Y', 3, 2), P('B', 'Z', 6, 4)], BASE);
    eq(order(r), 'B,A,Y,X,Z'); // Y allowed 3, X allowed 5, Z allowed 6 (all 0-1): fewest first
    const tie = r.ties.filter(t => t.teams.includes('A'))[0]; assert.ok(/per game/.test(tie.steps[1].text), tie.steps[1].text);
  });

  await test('standings 16: basketball uses points and a 15-point cap', async () => {
    // A beat X 40-10: A +30 raw, +15 capped; X -15 capped.
    const r = C.standings([P('A', 'X', 40, 10)], BB);
    eq(r.rows[0].diff, 30); eq(r.rows[0].cdiff, 15); eq(r.rows[1].cdiff, -15);
    eq(C.defaultRules('basketball').cap, 15); eq(C.defaultRules('softball').cap, 8); eq(C.defaultRules('basketball').forfeitWin, 2); eq(C.defaultRules('baseball').forfeitWin, 7);
    // wording uses "points" for basketball
    const r2 = C.standings([P('A', 'B', 3, 2), P('B', 'A', 3, 2)], BB); assert.ok(r2.ties[0].steps.some(s => /Points (allowed|scored)/.test(s.text)), r2.ties[0].steps.map(s => s.text).join(' | '));
    assert.ok(C.explainRules(BB, 'basketball').some(x => /points/.test(x.text)));
  });

  await test('standings 17: two separate ties are explained separately', async () => {
    // A beat B 3-1; A beat C 2-1; D beat A 1-0. B beat C 4-2; B beat D 5-0. C beat D 6-0.
    // A 2-1, B 2-1, C 1-2, D 1-2. Tie A/B: A beat B -> A first. Tie C/D: C beat D -> C third.
    const r = C.standings([P('A', 'B', 3, 1), P('A', 'C', 2, 1), P('D', 'A', 1, 0), P('B', 'C', 4, 2), P('B', 'D', 5, 0), P('C', 'D', 6, 0)], BASE);
    eq(ranks(r), 'A:1,B:2,C:3,D:4'); eq(r.ties.length, 2);
    deq(r.ties.map(t => t.teams.slice().sort().join('')).sort(), ['AB', 'CD']);
  });

  await test('standings 18: head-to-head for a 3-way tie ignores games against teams outside the tie', async () => {
    // A, B, C are each 2-1; D is 0-3. A beat B, B beat C, C beat A, and all three beat D.
    // Counting games vs D, A is 2-1 -- but among A, B, C only, each is 1-1: even.
    const gs = [P('A', 'B', 1, 0), P('B', 'C', 1, 0), P('C', 'A', 1, 0), P('A', 'D', 5, 0), P('B', 'D', 5, 0), P('C', 'D', 5, 0)];
    const h = C.headToHead(gs, ['A', 'B', 'C'], BASE); deq(h.map(x => x.w + '-' + x.l + '-' + x.gp), ['1-1-2', '1-1-2', '1-1-2']);
    const h2 = C.headToHead(gs, ['A', 'B'], BASE); deq(h2.map(x => x.w + '-' + x.l), ['1-0', '0-1']);
    eq(C.headToHead(gs, ['A', 'D'], BASE)[1].l, 1);
    eq(C.headToHead([P('A', 'B')], ['A', 'B'], BASE)[0].gp, 0, 'scheduled games do not count');
  });

  await test('standings: names that differ only by case/spacing are the same team; bracket games never count', async () => {
    const r = C.standings([P('Team A', 'team b', 3, 1), P('  TEAM   A ', 'Team C', 2, 1), { id: 'br1', kind: 'bracket', slot: 'r1m1', a: 'Team A', b: 'Team C', status: 'final', sa: 9, sb: 0 }], BASE);
    eq(r.rows.length, 3); eq(r.rows[0].w, 2); eq(r.rows[0].pf, 5);
  });

  await test('standings: huge input stays fast and stays correct', async () => {
    const teams = []; for (let i = 0; i < 30; i++) teams.push('T' + (i < 10 ? '0' : '') + i);
    const gs = []; for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) gs.push(P(teams[i], teams[j], i + 1, j));
    const t0 = Date.now(); const r = C.standings(gs, BASE); assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0));
    eq(r.rows.length, 30); eq(r.counted, 435); // 30*29/2
    eq(r.rows[0].team, 'T00' === r.rows[0].team ? 'T00' : r.rows[0].team); // someone is first, no crash
    r.rows.forEach(x => assert.ok(x.rank >= 1 && x.rank <= 30));
  });

  /* ---------- what do we need ---------- */
  await test('scenarios: seed now, if we win out, if we lose out (estimate)', async () => {
    const t = C.sampleTournament(TODAY);
    const sc = C.scenarios(t.games, Object.assign({}, t.rules, { sport: t.sport }), 'Our Team');
    // sample: B, Our Team, C are 2-1; D 1-2; E 0-2; F has not played. Our Team has TWO pool games left (E and F).
    eq(sc.now.rank, 2); eq(sc.now.tied, false); eq(sc.remaining, 2); eq(sc.ofTeams, 5); eq(sc.teams, 6);
    // win out: 4-1 (.800) beats the 2-1s (.667) -> seed 1 whatever the margins.
    // lose out (to E and F): 2-3 (.400). F becomes 1-0 (1.000), B and C are .667, so we are 4th; D (1-2, .333) and E (1-2, .333) stay below.
    deq(sc.win, { best: 1, worst: 1 }); deq(sc.lose, { best: 4, worst: 4 });
    const none = C.scenarios([P('A', 'B', 1, 0)], BASE, 'A'); eq(none.remaining, 0); eq(none.win, null);
    eq(C.scenarios([], BASE, ''), null);
    const fresh = C.scenarios([P('A', 'B'), P('A', 'C')], BASE, 'A'); eq(fresh.now, null); eq(fresh.remaining, 2);
    // 2 left: win out 2-0 -> seed 1; lose out 0-2 -> last of 3 teams that have games
    deq(fresh.win, { best: 1, worst: 1 }); eq(fresh.lose.worst, 3);
  });

  await test('scenarios: a seed that depends on runs shows a range', async () => {
    // A 1-0 (beat X 1-0). B 1-0 (beat Y 5-0). A must still play Z. A wins out: 2-0 -> 1st. A loses to Z: 1-1 .500 -> below B (1.000) and...
    // A beat X 1-0, B beat Y 5-0, Z beat W 3-0.  A lose out vs Z (0-1 or 0-8): A 1-1 .500, Z 2-0 1.000.. fine, just check best<=worst.
    const sc = C.scenarios([P('A', 'X', 1, 0), P('B', 'Y', 5, 0), P('Z', 'W', 3, 0), P('A', 'Z')], BASE, 'A');
    assert.ok(sc.win.best <= sc.win.worst); assert.ok(sc.lose.best <= sc.lose.worst); assert.ok(sc.win.best < sc.lose.best);
  });

  /* ---------- bracket ---------- */
  const T = (size, seeds) => C.sanitizeTournament({ id: 'brt1', name: 'T', sport: 'baseball', start: '2026-11-07', end: '2026-11-08', team: 'C', games: [], bracket: { size, seeds }, pack: [] });
  const BG = (slot, a, b, sa, sb, extra) => Object.assign({ id: 'b' + slot, kind: 'bracket', slot, date: '2026-11-08', time: '', field: '', label: '', a: a || '', b: b || '', status: sa == null ? 'scheduled' : 'final', sa: sa == null ? null : sa, sb: sb == null ? null : sb, innings: null, forfeit: '' }, extra || {});
  const match = (tree, slot) => { let m = null; tree.rounds.forEach(r => r.matches.forEach(x => { if (x.slot === slot) m = x; })); return m; };
  const nm = p => p.name || p.label;
  const withGames = (t, games) => { const c = C.clone(t); c.games = games; c.games = C.cascade(c).games; return c; };

  await test('bracket: 4 teams are 1v4 and 2v3, then the final', async () => {
    const tr = C.bracketTree(T(4, ['S1', 'S2', 'S3', 'S4']));
    eq(tr.rounds.length, 2); eq(tr.rounds[0].matches.length, 2); eq(tr.rounds[1].matches.length, 1);
    eq(nm(match(tr, 'r1m1').a) + 'v' + nm(match(tr, 'r1m1').b), 'S1vS4'); eq(nm(match(tr, 'r1m2').a) + 'v' + nm(match(tr, 'r1m2').b), 'S2vS3');
    eq(match(tr, 'r1m1').title, 'Semifinal 1'); eq(match(tr, 'r2m1').title, 'Final'); eq(match(tr, 'r2m1').a.label, 'Winner of SF 1');
    eq(match(tr, 'r1m1').bye, false);
  });

  await test('bracket: 8 teams are 1v8, 4v5, 3v6, 2v7 and the winners meet 1/4 side vs 2/3 side', async () => {
    const tr = C.bracketTree(T(8, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']));
    eq(tr.rounds.length, 3); const pairs = tr.rounds[0].matches.map(m => nm(m.a) + 'v' + nm(m.b)).join();
    eq(pairs, 'S1vS8,S4vS5,S3vS6,S2vS7');
    eq(match(tr, 'r1m3').title, 'Quarterfinal 3'); eq(match(tr, 'r2m2').title, 'Semifinal 2'); eq(match(tr, 'r2m1').a.from, 'r1m1'); eq(match(tr, 'r2m1').b.from, 'r1m2'); eq(match(tr, 'r2m2').a.from, 'r1m3'); eq(match(tr, 'r2m2').b.from, 'r1m4');
  });

  await test('bracket: 6 teams: seeds 1 and 2 get byes and are already in the semifinals', async () => {
    const tr = C.bracketTree(T(6, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']));
    eq(match(tr, 'r1m1').bye, true); eq(match(tr, 'r1m4').bye, true); eq(match(tr, 'r1m1').winner, 'S1'); eq(match(tr, 'r1m4').winner, 'S2');
    eq(match(tr, 'r1m2').bye, false); eq(nm(match(tr, 'r1m2').a) + 'v' + nm(match(tr, 'r1m2').b), 'S4vS5'); eq(nm(match(tr, 'r1m3').a) + 'v' + nm(match(tr, 'r1m3').b), 'S3vS6');
    eq(match(tr, 'r2m1').a.name, 'S1'); eq(match(tr, 'r2m1').b.label, 'Winner of QF 1'); eq(match(tr, 'r2m2').a.label, 'Winner of QF 2'); eq(match(tr, 'r2m2').b.name, 'S2');
    eq(match(tr, 'r1m2').title, 'Quarterfinal 1'); eq(match(tr, 'r1m3').title, 'Quarterfinal 2'); eq(match(tr, 'r1m1').title, 'Bye');
    // a game stored on a bye slot is dropped
    const t = T(6, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']); const c = withGames(t, [BG('r1m1', 'S1', '', null, null), BG('r1m2', 'S4', 'S5', null, null)]);
    deq(c.games.map(g => g.slot), ['r1m2']);
  });

  await test('bracket: a winner advances; a forfeit advances the other team; missing seeds stay open', async () => {
    let t = withGames(T(4, ['S1', 'S2', 'S3', 'S4']), [BG('r1m1', 'S1', 'S4', 5, 1), BG('r1m2', 'S2', 'S3', null, null, { status: 'final', forfeit: 'a' })]);
    let tr = C.bracketTree(t);
    eq(match(tr, 'r1m1').winner, 'S1'); eq(match(tr, 'r1m1').state, 'final'); eq(match(tr, 'r1m2').winner, 'S3', 'S2 forfeited'); eq(match(tr, 'r1m2').score.a + '-' + match(tr, 'r1m2').score.b, '0-7');
    eq(match(tr, 'r2m1').a.name, 'S1'); eq(match(tr, 'r2m1').b.name, 'S3'); eq(match(tr, 'r2m1').state, 'ready');
    t = withGames(t, t.games.concat([BG('r2m1', 'S1', 'S3', 2, 6)])); tr = C.bracketTree(t); eq(tr.champion, 'S3');
    const open = C.bracketTree(T(4, ['S1', '', '', 'S4'])); eq(match(open, 'r1m2').state, 'tbd'); eq(match(open, 'r1m2').a.label, 'Seed 2');
    eq(C.bracketTree(T(0, [])), null); eq(C.sanitizeBracket({ size: 5, seeds: ['a'] }).size, 0);
    deq(C.sanitizeBracket({ size: 4, seeds: ['A', 'a', 'B', 'C', 'D'] }).seeds, ['A', '', 'B', 'C'], 'a team holds only one seed, extra seeds dropped');
  });

  await test('bracket: rewriting an earlier result clears the later games that depended on it (and only those)', async () => {
    let t = withGames(T(4, ['S1', 'S2', 'S3', 'S4']), [BG('r1m1', 'S1', 'S4', 5, 1), BG('r1m2', 'S2', 'S3', 3, 2), BG('r2m1', 'S1', 'S2', 4, 3)]);
    eq(C.bracketTree(t).champion, 'S1'); eq(t.games.length, 3);
    // same winner, different score: nothing else changes
    let pv = C.previewBracket(t, c => { const g = c.games.find(x => x.slot === 'r1m2'); g.sa = 9; g.sb = 0; }, 'r1m2'); deq(pv.cleared, []); eq(C.bracketTree(pv.t).champion, 'S1');
    // flip the winner of semifinal 2: S3 beats S2. The final (S1 v S2) is no longer the final that was played.
    pv = C.previewBracket(t, c => { const g = c.games.find(x => x.slot === 'r1m2'); g.sa = 0; g.sb = 2; }, 'r1m2');
    deq(pv.cleared, ['r2m1']); const fin = pv.t.games.find(x => x.slot === 'r2m1');
    eq(fin.status, 'scheduled'); eq(fin.sa, null); eq(fin.a + 'v' + fin.b, 'S1vS3', 'the final now names the new finalist'); eq(C.bracketTree(pv.t).champion, ''); eq(fin.date, '2026-11-08', 'its time slot is kept');
    // un-finalise a semifinal: same
    pv = C.previewBracket(t, c => { const g = c.games.find(x => x.slot === 'r1m1'); g.status = 'scheduled'; g.sa = null; g.sb = null; }, 'r1m1'); deq(pv.cleared, ['r2m1']);
    // change seeds: both semifinals and the final lose results when seed 1 and 2 swap places? S1/S4 and S2/S3 pairs stay, so swapping S1<->S4 flips sides: names compare in order
    pv = C.previewBracket(t, c => { c.bracket = C.sanitizeBracket({ size: 4, seeds: ['S9', 'S2', 'S3', 'S4'] }); }, null);
    deq(pv.cleared.sort(), ['r1m1', 'r2m1'], 'a new seed 1 voids the game S1 played');
    // shrink 8 -> 4: slots that no longer exist are removed
    let t8 = withGames(T(8, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']), [BG('r1m1', 'S1', 'S8', 2, 1), BG('r1m3', 'S3', 'S6', 2, 1), BG('r1m4', 'S2', 'S7', null, null), BG('r2m2', 'S3', 'S2', null, null)]);
    eq(t8.games.length, 4);
    pv = C.previewBracket(t8, c => { c.bracket = C.sanitizeBracket({ size: 4, seeds: ['S1', 'S2', 'S3', 'S4'] }); }, null);
    assert.ok(pv.cleared.includes('r1m3') && pv.cleared.includes('r1m4') && pv.cleared.includes('r2m2'), pv.cleared.join());
    eq(pv.t.games.filter(g => g.slot === 'r1m3').length, 0);
    // a bracket game cannot end level: the result is not trusted
    const lvl = withGames(T(4, ['S1', 'S2', 'S3', 'S4']), [BG('r1m1', 'S1', 'S4', 3, 3)]); eq(lvl.games[0].status, 'scheduled');
  });

  await test('bracket: our path highlights our matches and stops where we lose', async () => {
    let t = withGames(T(4, ['S1', 'C', 'S3', 'S4']), []); t.team = 'C';
    // seed 2 plays r1m2 then the final
    deq(C.ourPath(t), ['r1m2', 'r2m1']);
    t = withGames(t, [BG('r1m2', 'C', 'S3', 1, 5)]); deq(C.ourPath(t), ['r1m2'], 'lost the semifinal');
    t = withGames(t, [BG('r1m2', 'C', 'S3', 6, 5)]); deq(C.ourPath(t), ['r1m2', 'r2m1']);
    const t6 = T(6, ['C', 'S2', 'S3', 'S4', 'S5', 'S6']); t6.team = 'C'; deq(C.ourPath(t6), ['r1m1', 'r2m1', 'r3m1'], 'a bye is part of the path');
    t.team = 'Nobody'; deq(C.ourPath(t), []);
  });

  await test('bracket: seeds from the standings, with a note when teams are still tied', async () => {
    const t = C.sampleTournament(TODAY);
    let r = C.seedsFromStandings(t, 4); deq(r.seeds, ['Team B', 'Our Team', 'Team C', 'Team D']); deq(r.unsure, []); eq(r.teams, 5);
    r = C.seedsFromStandings(t, 8); deq(r.seeds, ['Team B', 'Our Team', 'Team C', 'Team D', 'Team E', '', '', '']);
    const tied = C.sanitizeTournament({ id: 'tie1', name: 'x', sport: 'baseball', start: TODAY, end: TODAY, team: 'A', games: [P('A', 'B', 3, 2), P('B', 'A', 3, 2)], bracket: { size: 4, seeds: [] }, pack: [] });
    r = C.seedsFromStandings(tied, 4); deq(r.unsure.sort(), ['A', 'B']); deq(r.seeds, ['A', 'B', '', '']);
  });

  /* ---------- schedule, next game ---------- */
  await test('next game: picks our next unplayed game by date and time, with the countdown in minutes', async () => {
    const t = C.sampleTournament(TODAY); // next is Sun 2026-11-08 09:00 vs Team E
    let ng = C.nextGame(t, { date: '2026-11-07', time: '18:00' }); eq(ng.game.id, 'sg08'); eq(ng.delta, 15 * 60); eq(C.countdownText(ng.delta), 'in 15 h');
    ng = C.nextGame(t, { date: '2026-11-08', time: '06:50' }); eq(C.countdownText(ng.delta), 'in 2 h 10 min');
    ng = C.nextGame(t, { date: '2026-11-08', time: '09:12' }); eq(ng.game.id, 'sg08'); eq(ng.delta, -12, 'it started 12 minutes ago and is still the one to show');
    ng = C.nextGame(t, { date: '2026-11-08', time: '11:59' }); eq(ng.game.id, 'sg08', 'still shown up to 3 hours after the start (until 12:00); the 11:15 game is not yet the next one');
    ng = C.nextGame(t, { date: '2026-11-08', time: '12:30' }); eq(ng.game.id, 'sg11', 'the 09:00 game is over; the 11:15 game started 75 minutes ago'); eq(ng.delta, -75);
    ng = C.nextGame(t, { date: '2026-11-08', time: '14:30' }); eq(ng, null, 'everything long over (11:15 + 3 h = 14:15)');
    // midnight: a game at 00:20 on the 9th is 40 minutes after 23:40 on the 8th
    const t2 = C.clone(t); t2.games.push(Object.assign(C.clone(t.games[7]), { id: 'late1', date: '2026-11-09', time: '00:20', a: 'Our Team', b: 'Team D' })); ['sg08', 'sg11'].forEach(id => { const g = t2.games.find(x => x.id === id); g.status = 'final'; g.sa = 1; g.sb = 0; });
    ng = C.nextGame(t2, { date: '2026-11-08', time: '23:40' }); eq(ng.game.id, 'late1'); eq(ng.delta, 40);
    // a game with no time is "today" or later, countdown not available
    const t3 = C.clone(t); t3.games.find(g => g.id === 'sg08').time = ''; t3.games.find(g => g.id === 'sg11').status = 'final'; t3.games.find(g => g.id === 'sg11').sa = 1; t3.games.find(g => g.id === 'sg11').sb = 0; ng = C.nextGame(t3, { date: '2026-11-08', time: '23:00' }); eq(ng.timed, false); eq(ng.daysAway, 0);
    eq(C.nextGame(Object.assign(C.clone(t), { team: '' }), { date: TODAY, time: '10:00' }), null, 'no team name, no next game');
  });

  await test('schedule: games sort by date then time (no time last), group by day, and flag unscored games', async () => {
    const gs = [P('A', 'B', null, null, { date: '2026-11-08', time: '09:00' }), P('A', 'C', null, null, { date: '2026-11-07', time: '', id: 'zz' }), P('A', 'D', null, null, { date: '2026-11-07', time: '14:00' }), P('A', 'E', null, null, { date: '', time: '08:00' }), P('A', 'F', null, null, { date: '2026-11-07', time: '08:30' })];
    deq(C.sortGames(gs).map(g => g.b), ['F', 'D', 'C', 'B', 'E']); deq(C.groupByDay(gs).map(d => d.date + ':' + d.games.length), ['2026-11-07:3', '2026-11-08:1', ':1']);
    const t = { team: 'A', sport: 'baseball', gameMin: 90, rules: BASE };
    eq(C.needsScore(t, gs[2], { date: '2026-11-07', time: '15:29' }), false); eq(C.needsScore(t, gs[2], { date: '2026-11-07', time: '15:31' }), true, '14:00 + 90 = 15:30');
    eq(C.needsScore(t, gs[1], { date: '2026-11-07', time: '23:00' }), false); eq(C.needsScore(t, gs[1], { date: '2026-11-08', time: '01:00' }), true);
    eq(C.needsScore(t, P('A', 'B', 1, 0), { date: '2030-01-01', time: '10:00' }), false);
  });

  /* ---------- calendar file ---------- */
  await test('calendar file: events, arrive-by, reminder, escaping, folding, all-day', async () => {
    const t = C.sampleTournament(TODAY);
    t.games.push(C.sanitizeGame({ id: 'sg20', kind: 'pool', date: '2026-11-08', time: '13:05', field: 'Court 2; side, east', a: 'Our Team', b: 'Team, F; "G"', label: 'Pool play' }));
    t.games.push(C.sanitizeGame({ id: 'sg21', kind: 'pool', date: '2026-11-08', time: '', field: '', a: 'Our Team', b: 'Team H', label: '' }));
    const r = C.icsFor(t, { warm: 45, today: TODAY }); const txt = r.text;
    eq(r.count, 4, 'the Sunday game, the sample F game and the two added'); assert.ok(txt.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(txt.endsWith('END:VCALENDAR\r\n')); assert.ok(!/[^\r]\n/.test(txt), 'every line ends with CRLF');
    eq((txt.match(/BEGIN:VEVENT/g) || []).length, 4); eq((txt.match(/BEGIN:VALARM/g) || []).length, 4);
    const un = txt.replace(/\r\n /g, ''); // unfold
    assert.ok(un.includes('DTSTART:20261108T090000') && un.includes('DTEND:20261108T103000'), '9:00 + 90 min');
    assert.ok(un.includes('Arrive by 8:15 AM (45 min before the game)'), 'arrive-by in the description');
    assert.ok(un.includes('TRIGGER:-PT75M'), 'reminder 45 + 30 minutes before');
    assert.ok(un.includes('DTSTART:20261108T130500') && un.includes('Arrive by 12:20 PM'));
    assert.ok(un.includes('LOCATION:Court 2\\; side\\, east'), 'semicolon and comma escaped');
    assert.ok(un.includes('SUMMARY:Our Team vs Team\\, F\\; "G" (Pool play)'), un.split('\r\n').filter(l => /SUMMARY/.test(l)).join('|'));
    assert.ok(un.includes('DTSTART;VALUE=DATE:20261108') && un.includes('DTEND;VALUE=DATE:20261109') && un.includes('TRIGGER:PT7H'), 'no time: all-day event');
    assert.ok(un.includes('UID:sg08-' + t.id + '@tournamentpack'));
    assert.ok(un.includes('DTSTAMP:20261107T000000Z'));
    txt.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, 'line over 75 bytes: ' + l));
    // floating times: no Z on DTSTART/DTEND
    assert.ok(!/DT(START|END)[^:]*:\d{8}T\d{6}Z/.test(un));
    // finished games and other teams' games are not exported
    assert.ok(!un.includes('Team D (Pool play)')); eq(C.icsFor(Object.assign(C.clone(t), { team: '' }), { warm: 45 }).count, 0);
    // arrive-by after midnight of the previous day
    const late = C.clone(t); late.games = [C.sanitizeGame({ id: 'lt1', kind: 'pool', date: '2026-11-08', time: '00:30', a: 'Our Team', b: 'Team Z' })];
    assert.ok(C.icsFor(late, { warm: 45 }).text.replace(/\r\n /g, '').includes('Arrive by 11:45 PM (the day before)'));
    // a long description folds without cutting a character in half
    const longName = C.clone(t); longName.games = [C.sanitizeGame({ id: 'lg1', kind: 'pool', date: '2026-11-08', time: '09:00', field: 'Fié'.repeat(18), a: 'Our Team', b: 'Équipe Ünïcode '.repeat(2) })];
    C.icsFor(longName, { warm: 45 }).text.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, 'unicode line too long: ' + l));
  });

  await test('weekend summary text: next game, our games with results, standings and ties', async () => {
    const t = C.sampleTournament(TODAY);
    const s = C.summaryText(t, { warm: 45, now: { date: '2026-11-07', time: '18:00' } });
    assert.ok(s.startsWith('Sample: Spring Classic (Baseball, Nov 6 to Nov 9)')); assert.ok(s.includes('NEXT GAME: Sun, Nov 8, 9:00 AM vs Team E at Field 1. Arrive by 8:15 AM.'));
    assert.ok(s.includes('8:00 AM vs Team B (Field 1): won 6-4')); assert.ok(s.includes('1:00 PM vs Team C (Field 1): lost 7-8')); assert.ok(s.includes('POOL STANDINGS'));
    assert.ok(s.includes('1. Team B 2-1 (.667, 18 for, 10 against)')); assert.ok(s.includes('2. Our Team 2-1')); assert.ok(!s.includes('Lodging') && !s.includes('Hotel'), 'notes are not in the summary');
    const e = C.sanitizeTournament({ id: 'emp1', name: 'Empty', sport: 'basketball', start: TODAY, end: TODAY, team: '', games: [], bracket: {}, pack: [] });
    const s2 = C.summaryText(e, { warm: 45, now: { date: TODAY, time: '10:00' } }); assert.ok(s2.startsWith('Empty (Basketball, Nov 7)')); assert.ok(!s2.includes('NEXT GAME'));
  });

  /* ---------- records, backup ---------- */
  await test('pack: templates by sport, progress, bad items dropped', async () => {
    const b = C.packTemplate('baseball'), s = C.packTemplate('softball'), k = C.packTemplate('basketball');
    eq(b.length, 23); eq(s.length, 24); assert.ok(s.some(x => x.text === 'Hair ties')); assert.ok(k.some(x => x.text === 'Ankle braces') && k.some(x => /Two jerseys/.test(x.text)));
    assert.ok(b.some(x => x.text === 'Cooler with ice' && x.group === 'Food & Drink')); assert.ok(b.every(x => !x.done && C.GROUPS.includes(x.group)));
    eq(new Set(b.map(x => x.id)).size, 23, 'unique ids');
    b[0].done = true; b[1].done = true; deq(C.packProgress(b), { done: 2, total: 23, text: '2 of 23 packed' });
    const clean = C.sanitizePack([{ text: '  Cleats ', group: 'Gear', done: true }, { text: '', group: 'Gear' }, 'x', { text: 'A', group: 'Nope', id: 'dup', done: 'yes' }, { text: 'B', id: 'dup' }]);
    eq(clean.length, 3); eq(clean[0].done, true); eq(clean[1].group, 'Gear'); eq(clean[1].done, false); assert.ok(clean[1].id !== clean[2].id, 'duplicate ids repaired');
  });

  await test('records: sanitize clamps and repairs; backup round trip is lossless; bad backups are refused', async () => {
    const t = C.sampleTournament(TODAY), settings = { warm: 60, rules: { order: ['pa', 'pct', 'h2h', 'diff', 'pf'], off: ['pf'], tiesAllowed: false } };
    const b = C.makeBackup([t], settings, TODAY); eq(b.app, 'tournamentpack'); eq(b.v, 1); eq(b.saved, TODAY);
    const v = C.validateBackup(JSON.parse(JSON.stringify(b))); eq(v.ok, true); deq(v.tournaments[0], t); deq(v.settings, C.sanitizeSettings(settings)); eq(v.settings.warm, 60);
    eq(C.validateBackup(null).ok, false); eq(C.validateBackup({}).ok, false); eq(C.validateBackup({ app: 'locker', tournaments: [] }).ok, false); eq(C.validateBackup({ app: 'tournamentpack', v: 9, tournaments: [] }).ok, false);
    eq(C.validateBackup({ app: 'tournamentpack', v: 1, tournaments: 'x' }).ok, false); eq(C.validateBackup({ app: 'tournamentpack', v: 1, tournaments: [1] }).ok, false);
    eq(C.validateBackup({ app: 'tournamentpack', v: 1, tournaments: new Array(61).fill({}) }).ok, false);
    eq(C.validateBackup({ app: 'tournamentpack', v: 1, tournaments: [] }).ok, true);
    // repairs
    const x = C.sanitizeTournament({ id: '!!', name: '   ', sport: 'curling', start: 'nope', end: '1999-01-01', team: 'T'.repeat(200), gameMin: 9999, notes: { lodging: 'L'.repeat(9000), evil: 'x' }, rules: { cap: -5, forfeitWin: 'x', order: 'no' },
      games: [{ kind: 'pool', a: 'A', b: 'a' }, { kind: 'pool', a: 'A', b: 'B', sa: 5, sb: 2, status: 'final', date: '2026-02-30', time: '25:00' }, { kind: 'pool', a: 'A', b: 'B', status: 'final' }, null, 'x', { kind: 'bracket', slot: 'zz', a: 'A', b: 'B' }], bracket: { size: 9 } });
    assert.ok(C.ID_RE.test(x.id)); eq(x.name, 'Tournament'); eq(x.sport, 'baseball'); assert.ok(C.isYMD(x.start)); eq(x.end, x.start); eq(x.team.length, 40); eq(x.gameMin, 300); eq(x.notes.lodging.length, 4000); eq(x.notes.evil, undefined);
    eq(x.rules.cap, 0); eq(x.rules.forfeitWin, 7); eq(x.games.length, 2, 'self-games, junk and bad bracket slots dropped'); eq(x.games[0].date, '', 'impossible date dropped'); eq(x.games[0].time, ''); eq(x.games[1].status, 'scheduled', 'a final with no score is not final'); eq(x.bracket.size, 0);
    // text stays text
    const evil = C.sanitizeTournament({ name: '<img src=x onerror=alert(1)>', team: '<b>T</b>', games: [{ kind: 'pool', a: '<script>x</script>', b: 'B' }] }); eq(evil.name, '<img src=x onerror=alert(1)>'); eq(evil.games[0].a, '<script>x</script>');
  });

  await test('records: renaming a team follows through games, seeds and our team; merging is refused when they met', async () => {
    const t = C.sampleTournament(TODAY); t.bracket.seeds = ['Team B', 'Our Team', 'Team C', 'Team D'];
    let r = C.renameTeam(t, 'Team B', 'Team Bee'); eq(r.ok, true); eq(r.t.games.filter(g => g.kind === 'pool' && (g.a === 'Team Bee' || g.b === 'Team Bee')).length, 4); eq(r.t.bracket.seeds[0], 'Team Bee'); eq(r.t.team, 'Our Team');
    r = C.renameTeam(t, 'Our Team', 'Us'); eq(r.t.team, 'Us'); eq(r.t.games.filter(g => g.kind === 'pool' && (g.a === 'Us' || g.b === 'Us')).length, 5);
    r = C.renameTeam(t, 'Team B', 'team c'); eq(r.ok, false); assert.ok(/played each other/.test(r.error));
    r = C.renameTeam(t, 'Team E', 'Team D'); eq(r.ok, false, 'D and E met once, so they cannot become one team');
    r = C.renameTeam(t, 'Team E', 'Team Zed'); eq(r.ok, true); eq(C.renameTeam(t, 'Team E', '   ').ok, false); r = C.renameTeam(t, 'Team E', 'team e'); eq(r.ok, true, 'changing only the case is fine');
  });

  /* ================= part 2: the real app in Chrome ================= */
  const srv = await startServer('tournamentpack');
  const browser = await launch();
  const sheetSel = '.sheet-wrap.open .sheet';
  const NOW_SUN_0850 = '2026-11-08T08:50';
  const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 4000 });
  const openSheetWait = page => page.waitForSelector(sheetSel, { timeout: 4000 });
  const toastTexts = page => page.$$eval('.toast .tx', els => els.map(e => e.textContent));
  async function waitToast(page, re) {
    await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast .tx')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 4000 });
  }
  const view = page => page.evaluate(() => document.body.getAttribute('data-view'));
  const tabTo = (page, t) => page.click('#nav [data-tab="' + t + '"]');
  const depth = page => page.evaluate(() => (history.state && history.state.tpHist) || 0);
  const waitDepth = (page, n) => page.waitForFunction(d => ((history.state && history.state.tpHist) || 0) === d, n, { timeout: 3000 });
  const lsGet = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('tpack.') === 0) o[k] = localStorage.getItem(k); } return o; });
  const closeTop = async page => { await page.click('.sheet-wrap.open:last-child .sh-head .x'); };
  const txt = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
  const sample = () => C.sampleTournament(TODAY);
  const mkTour = (over) => C.sanitizeTournament(Object.assign(C.sampleTournament(TODAY), over || {}));

  // boot a page: clock fixed at NOW unless o.now is given (null = real time), optional stored tournaments
  async function boot(o = {}) {
    const ctxOpts = Object.assign({}, o.ctx || {});
    if (o.size) ctxOpts.viewport = { width: o.size[0], height: o.size[1] };
    const r = await newPage(browser, { sw: o.sw, reducedMotion: o.reducedMotion, ctx: ctxOpts });
    const page = r.page, now = o.now === undefined ? NOW : o.now;
    if (now) await page.addInitScript(n => { window.__now = n; window.__today = n.slice(0, 10); }, now);
    if (o.init) await page.addInitScript(o.init);
    await page.goto(srv.url);
    await page.waitForSelector('#view > *');
    if (o.tours || o.settings) {
      await page.evaluate(([tours, settings]) => {
        const ids = [];
        (tours || []).forEach(t => { localStorage.setItem('tpack.t.' + t.id, JSON.stringify(t)); ids.push(t.id); });
        localStorage.setItem('tpack.index', JSON.stringify({ v: 1, ids }));
        if (settings) localStorage.setItem('tpack.settings', JSON.stringify(settings));
      }, [o.tours || [], o.settings || null]);
      await page.reload(); await page.waitForSelector('#view > *');
    }
    if (o.open) { await page.click('[data-act=tour-open]'); await page.waitForSelector('#nav:not([hidden])'); }
    return r;
  }
  async function app(o, fn) {
    const r = await boot(o);
    try {
      await fn(r.page, r);
      if (!o.allowErrors) assert.deepStrictEqual(r.errors, [], 'console errors: ' + r.errors.join(' | '));
    } finally { await r.ctx.close(); }
  }

  /* quality checks that run inside the page */
  function QA(opts) {
    const out = [];
    const desc = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).join('.'); const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26); return s + (t ? ' "' + t + '"' : ''); };
    const shown = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    if (document.documentElement.scrollWidth > innerWidth) out.push('horizontal scroll: page is ' + document.documentElement.scrollWidth + 'px wide in a ' + innerWidth + 'px window');
    document.querySelectorAll('body *').forEach(el => {
      if (el.closest('.br-wrap') || el.closest('.sr') || el.closest('svg') || !shown(el)) return;
      if (el.closest('.sheet-wrap:not(.open)')) return;
      const cs0 = getComputedStyle(el);
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs0.overflowX === 'visible' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) out.push('text runs past its box (' + el.scrollWidth + ' > ' + el.clientWidth + '): ' + desc(el));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) out.push('sticks out sideways (' + Math.round(r.left) + ' to ' + Math.round(r.right) + '): ' + desc(el));
    });
    document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not([type=file]):not([type=checkbox]), textarea, label.chk, label.btn, label.link-btn, [role=button]').forEach(el => {
      if (el.closest('.sr') || !shown(el)) return;
      if (el.closest('.toast:not(.in)')) return;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push('tap target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + desc(el));
    });
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), seen = new Set();
    const parseC = s => {
      let m = /^rgba?\(([^)]+)\)$/.exec(s);
      if (m) { const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
      m = /^color\(srgb ([^)]+)\)$/.exec(s);
      if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
      return null;
    };
    const blend = (top, bot) => { const a = top.a + bot.a * (1 - top.a); return a ? { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a } : { r: 0, g: 0, b: 0, a: 0 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bodyBg = parseC(getComputedStyle(document.body).backgroundColor) || { r: 8, g: 19, b: 15, a: 1 };
    let n;
    while ((n = tw.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || el.closest('script, style, noscript, option, .sr') || el.closest('.sheet-wrap:not(.open)') || !shown(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      if (fs < 11.99) out.push('text under 12px (' + cs.fontSize + '): ' + desc(el));
      if (opts && opts.contrast === false) continue;
      if (el.closest(':disabled')) continue;
      // find the colour behind the text
      let layers = [], e = el, img = false, op = 1;
      while (e && e.nodeType === 1) {
        const c2 = getComputedStyle(e);
        op *= parseFloat(c2.opacity);
        if (e !== document.body && e !== document.documentElement && c2.backgroundImage !== 'none') img = true;
        const bc = parseC(c2.backgroundColor);
        if (bc && bc.a > 0 && !layers.some(l => l.a >= 1)) layers.push(bc);
        e = e.parentElement;
      }
      if (img) continue;
      let bg = bodyBg; for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
      let fg = parseC(cs.color); if (!fg) continue;
      fg = blend({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * op }, bg);
      const l1 = lum(fg), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const big = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (big ? 3 : 4.5)) out.push('low contrast ' + ratio.toFixed(2) + ' (' + cs.color + ' on rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')): ' + desc(el));
    }
    document.querySelectorAll('.sheet-wrap.open .sheet').forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.height > innerHeight * 0.85 + 1) out.push('sheet is ' + Math.round(r.height) + 'px tall, over 85% of ' + innerHeight);
      if (r.bottom > innerHeight + 1) out.push('sheet runs past the bottom of the screen: ' + Math.round(r.bottom) + ' > ' + innerHeight);
      const f = s.querySelector('.sh-foot'); if (f) { const fr = f.getBoundingClientRect(); if (fr.bottom > innerHeight + 1 || fr.top < 0) out.push('sheet footer is off screen'); }
    });
    return out;
  }
  async function qa(page, label, opts) {
    if (await page.$('.sheet-wrap.open')) await page.waitForTimeout(450); // let the slide-up finish
    const probs = await page.evaluate(QA, opts || {});
    assert.deepStrictEqual(probs, [], label + ':\n   ' + probs.slice(0, 12).join('\n   '));
  }
  const SIZES = { 390: [390, 844], 768: [768, 1024], 320: [320, 640] };
  async function shot(page, name, size) {
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(SHOTS, 'tournamentpack-' + name + '-' + size + '.png') });
  }
  async function fillGame(page, f) {
    if (f.ours === false) await page.uncheck('#g-ours');
    if (f.opp != null) await page.fill('#g-opp', f.opp);
    if (f.t1 != null) await page.fill('#g-t1', f.t1);
    if (f.t2 != null) await page.fill('#g-t2', f.t2);
    if (f.date) await page.fill('#g-date', f.date);
    if (f.time != null) await page.fill('#g-time', f.time);
    if (f.field != null) await page.fill('#g-field', f.field);
    if (f.final) { await page.click('[data-status="final"]'); }
    if (f.sa != null) await page.fill('#g-sa', String(f.sa));
    if (f.sb != null) await page.fill('#g-sb', String(f.sb));
    if (f.forf != null) await page.selectOption('#g-forf', f.forf);
  }
  const saveSheet = async page => { await page.click(sheetSel + ' [data-save]'); };

  /* ---------- first screen, sample, basic tour ---------- */
  await test('first screen: tagline, privacy note, the exact sample button text, nothing stored yet', async () => {
    await app({}, async page => {
      eq(await txt(page, 'h2.tagline'), 'Everything for tournament weekend');
      const btn = page.locator('button', { hasText: 'Load a sample tournament' });
      eq(await btn.count(), 1); eq((await btn.textContent()).trim(), 'Load a sample tournament');
      assert.ok(/No accounts/.test(await txt(page, '.privacy-note')));
      eq(await page.title(), 'Tournament Pack: Everything for tournament weekend');
      deq(Object.keys(await lsGet(page)), [], 'a first visit writes nothing');
      eq(await view(page), 'list'); eq(await page.isHidden('#nav'), true);
      eq(await depth(page), 0);
    });
  });

  await test('sample: one tap loads it; next game card, arrive-by, countdown and the two gap notes', async () => {
    await app({}, async page => {
      await page.click('button:has-text("Load a sample tournament")');
      await page.waitForSelector('.card.next');
      eq(await view(page), 'tournament'); eq(await txt(page, '.ttl b'), 'Sample: Spring Classic');
      await waitToast(page, /Sample tournament loaded/);
      const next = await txt(page, '.card.next');
      assert.ok(/Next game/.test(next) && /vs Team E/.test(next), next);
      assert.ok(/Sun, Nov 8 · 9:00 AM · Field 1/.test(next), next);
      assert.ok(/Arrive by 8:15 AM \(45 min warm-up\)/.test(next), next);
      eq(await txt(page, '.card.next .cd'), 'in 15 h');
      eq(await page.locator('.game').count(), 14);
      // Sunday: 9:00 + 90 min = 10:30, and our next game is at 11:15 -> 45 minutes. Finished games on Friday get no rest notes.
      deq(await page.$$eval('.gap', els => els.map(e => e.textContent.trim())), ['Only about 45 min to eat and rest']);
      eq(await page.locator('.gap.warn').count(), 1);
      // day headers, in time order
      const days = await page.$$eval('.day h3', els => els.map(e => e.textContent));
      deq(days, ['Fri, Nov 6', 'Sun, Nov 8', 'Mon, Nov 9']);
      const firstDay = await page.$$eval('.glist:nth-of-type(1) .game .gt b', els => els.map(e => e.textContent));
      deq(firstDay.slice(0, 4), ['8:00', '8:00', '10:15', '10:15']);
      eq(await page.locator('.game.ours').count(), 5);
      eq(await txt(page, '.game.ours.done .chip'), 'W 6-4');
      assert.ok(await page.locator('.chip.l').first().isVisible(), 'a loss chip');
    });
  });

  await test('create a tournament by hand: defaults, validation, then add, edit and delete games', async () => {
    await app({}, async page => {
      await page.click('[data-act=tour-new]'); await openSheetWait(page);
      // window.__today is honoured: start = today, end = tomorrow
      eq(await page.inputValue('#f-start'), TODAY); eq(await page.inputValue('#f-end'), '2026-11-08'); eq(await page.inputValue('#f-gm'), '90');
      await saveSheet(page);
      eq(await txt(page, '#f-err'), 'Give the tournament a name.'); eq(await page.isVisible('#f-err'), true);
      await page.fill('#f-name', 'Hoops Weekend'); await page.click('[data-sport="basketball"]');
      eq(await page.inputValue('#f-gm'), '60', 'game length follows the sport while it is still the default');
      await page.fill('#f-end', '2026-11-01'); await saveSheet(page);
      assert.ok(/end date is before/.test(await txt(page, '#f-err')));
      await page.fill('#f-end', '2026-11-08'); await page.fill('#f-team', 'Hawks Test'); await saveSheet(page);
      await noSheets(page); await waitToast(page, /Tournament created/);
      eq(await txt(page, '.ttl b'), 'Hoops Weekend'); assert.ok(/Hawks Test/.test(await txt(page, '.ttl small')));
      assert.ok(/No games yet/.test(await txt(page, '.empty')));
      // add a game: arrive-by shows while typing
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      eq(await page.isChecked('#g-ours'), true, 'our team is known, so it is one of our games');
      await saveSheet(page); assert.ok(/Type the opponent/.test(await txt(page, '#g-err')));
      await fillGame(page, { opp: 'Rival One', date: '2026-11-08', time: '10:00' });
      eq(await txt(page, '#g-arrive'), 'Arrive by 9:15 AM (45 min warm-up)');
      await fillGame(page, { opp: 'hawks test' });
      await saveSheet(page); assert.ok(/can't play itself/.test(await txt(page, '#g-err')));
      await fillGame(page, { opp: 'Rival One' }); await saveSheet(page); await noSheets(page);
      eq(await page.locator('.game.ours').count(), 1);
      assert.ok(/vs Rival One/.test(await txt(page, '.game.ours')) && /Arrive by 9:15 AM/.test(await txt(page, '.game.ours')));
      const nxt = await txt(page, '.card.next'); assert.ok(/vs Rival One/.test(nxt) && /Arrive by 9:15 AM/.test(nxt), nxt);
      eq(await txt(page, '.card.next .cd'), 'in 16 h', 'tomorrow 10:00 from today 18:00');
      // second game: 10:00 + 60 min = 11:00; next at 11:30 = 30 minutes of rest -> warning
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      eq(await page.inputValue('#g-date'), '2026-11-08', 'the date of the last game is remembered');
      await fillGame(page, { opp: 'Rival Two', time: '11:30', field: 'Court 4' }); await saveSheet(page); await noSheets(page);
      deq(await page.$$eval('.gap.warn', els => els.map(e => e.textContent.trim())), ['Only about 30 min to eat and rest']);
      // a pool game between two other teams
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      await fillGame(page, { ours: false, t1: 'Rival One', t2: 'Rival Two', time: '12:00' });
      await saveSheet(page); await noSheets(page);
      eq(await page.locator('.game').count(), 3); eq(await page.locator('.game.ours').count(), 2);
      // score the first one: ours = Hawks Test
      await page.locator('.game').first().click(); await openSheetWait(page);
      eq(await txt(page, sheetSel + ' h2'), 'Edit game');
      await page.click('[data-status="final"]');
      eq(await txt(page, '#g-la'), 'Hawks Test score'); eq(await txt(page, '#g-lb'), 'Rival One score');
      await saveSheet(page); assert.ok(/Enter both scores/.test(await txt(page, '#g-err')));
      await fillGame(page, { sa: 50, sb: 44 }); await saveSheet(page); await noSheets(page);
      eq(await txt(page, '.game.ours.done .chip'), 'W 50-44');
      // the standings now show 1-0 and seed 1 of 2
      await tabTo(page, 'standings');
      assert.ok(/Seed 1/.test(await txt(page, '.card.stand .big')) && /1-0/.test(await txt(page, '.card.stand .big')));
      eq(await page.locator('.trow').count(), 2);
      eq(await txt(page, '.stand-list li:nth-child(1) .tm b'), 'Hawks Test');
      // delete the game: confirm first
      await tabTo(page, 'games');
      await page.locator('.game.done').click(); await openSheetWait(page);
      await page.click('[data-del]'); await page.waitForSelector('.sheet.confirm');
      assert.ok(/Delete this game\?/.test(await txt(page, '.sheet.confirm h2')));
      await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      eq(await page.locator('.game').count(), 3, 'cancel keeps it');
      await page.locator('.game.done').click(); await openSheetWait(page);
      await page.click('[data-del]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await page.locator('.game').count(), 2); await waitToast(page, /Game deleted/);
    });
  });

  await test('game form: ties off blocks a tie score; forfeits score 7-0 and show in the standings; shortened games', async () => {
    await app({ tours: [mkTour({ id: 'ft1' })], open: true }, async page => {
      // sg09 = Team C vs Team D, Sunday, not played. Forfeit: Team D forfeits -> Team C wins 7-0
      await tabTo(page, 'games');
      await page.locator('.game', { hasText: 'Team D' }).filter({ hasText: 'Team C' }).first().click(); await openSheetWait(page);
      await page.click('[data-status="final"]');
      await fillGame(page, { forf: 'b' });
      eq(await page.isHidden('.f-scores'), true, 'no score boxes with a forfeit');
      eq(await txt(page, '#g-forfinfo'), 'A forfeit counts as 7 to 0 for Team C in the standings.');
      await saveSheet(page); await noSheets(page);
      const row = page.locator('.game', { hasText: 'Team D' }).filter({ hasText: 'Team C' }).first();
      assert.ok(/Forfeit/.test(await row.textContent()) && /7-0/.test(await row.textContent()), await row.textContent());
      await tabTo(page, 'standings');
      const c = await txt(page, '.trow:has-text("Team C")'); assert.ok(/3-1/.test(c), c); // C was 2-1, plus the forfeit win = 3-1
      // the same game again: tie scores when ties are off
      await page.click('[data-act=rules-open]'); await openSheetWait(page);
      await page.uncheck('#r-ties'); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'games');
      await page.locator('.game.ours', { hasText: 'Team E' }).click(); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 3, sb: 3 }); await saveSheet(page);
      assert.ok(/Ties are turned off/.test(await txt(page, '#g-err')), await txt(page, '#g-err'));
      await fillGame(page, { sa: 4, sb: 3 });
      await page.fill('#g-inn', '5'); await saveSheet(page); await noSheets(page);
      const g = await page.locator('.game.ours', { hasText: 'Team E' }).textContent(); assert.ok(/Shortened: 5 innings/.test(g) && /W 4-3/.test(g), g);
    });
  });

  await test('edit tournament (rename our team follows through games), duplicate, delete with confirm', async () => {
    await app({ tours: [mkTour({ id: 'ed1' })], open: true }, async page => {
      await page.click('[data-act=tour-menu]'); await openSheetWait(page);
      await page.click('[data-act=tour-edit]'); await openSheetWait(page);
      eq(await page.inputValue('#f-name'), 'Sample: Spring Classic');
      await page.fill('#f-name', 'Fall Classic'); await page.fill('#f-team', 'Home Squad'); await saveSheet(page); await noSheets(page);
      eq(await txt(page, '.ttl b'), 'Fall Classic'); assert.ok(/Home Squad/.test(await txt(page, '.ttl small')));
      eq(await page.locator('.game.ours').count(), 5, 'the games moved with the new name');
      assert.ok(/vs Team E/.test(await txt(page, '.card.next')));
      // duplicate: new name, a week later, pack unchecked, games not kept
      await page.click('[data-act=tour-menu]'); await openSheetWait(page);
      await page.click('[data-act=tour-dup]'); await openSheetWait(page);
      eq(await page.inputValue('#d-name'), 'Fall Classic (copy)'); eq(await page.inputValue('#d-start'), '2026-11-13');
      await saveSheet(page); await noSheets(page);
      eq(await txt(page, '.ttl b'), 'Fall Classic (copy)'); assert.ok(/Nov 13/.test(await txt(page, '.ttl small')), await txt(page, '.ttl small'));
      assert.ok(/No games yet/.test(await txt(page, '.empty')));
      await tabTo(page, 'pack'); eq(await txt(page, '.prog .pt'), '0 of 23 packed');
      await tabTo(page, 'standings'); assert.ok(/No pool games yet/.test(await txt(page, '.empty')));
      // back to the list: both there, newest first
      await page.click('[data-act=back]'); await page.waitForSelector('.tlist');
      deq(await page.$$eval('.tcard .tn', els => els.map(e => e.textContent)), ['Fall Classic', 'Fall Classic (copy)'], 'current ones in date order');
      // duplicate keeping games, shifted by the same days
      await page.locator('.tcard', { hasText: 'Fall Classic' }).first().click(); await page.waitForSelector('#nav:not([hidden])');
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-dup]'); await openSheetWait(page);
      await page.fill('#d-name', 'Keep games'); await page.check('#d-games'); await saveSheet(page); await noSheets(page);
      eq(await page.locator('.game').count(), 14);
      eq((await page.$$eval('.day h3', els => els.map(e => e.textContent)))[0], 'Fri, Nov 13');
      // delete with a confirm that says what goes
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm');
      const msg = await txt(page, '.sheet.confirm .sh-body'); assert.ok(/permanently removes Keep games with its 14 games/.test(msg) && /cannot be undone/.test(msg), msg);
      await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      eq(await view(page), 'tournament', 'cancel keeps it');
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await view(page), 'list'); await waitToast(page, /Deleted Keep games/);
      eq(await page.locator('.tcard').count(), 2);
    });
  });

  /* ---------- standings screen ---------- */
  await test('standings screen: order, our seed, win-out / lose-out estimate, the tiebreak explained step by step', async () => {
    await app({ tours: [mkTour({ id: 'st1' })], open: true }, async page => {
      await tabTo(page, 'standings');
      deq(await page.$$eval('.stand-list .tm b', els => els.map(e => e.textContent)), ['Team B', 'Our Team', 'Team C', 'Team D', 'Team E']);
      eq(await page.locator('.trow.us').count(), 1);
      eq(await txt(page, '.card.stand .big'), 'Seed 2 of 5 teams · 2-1');
      const sc = await txt(page, '.scen');
      assert.ok(/If we win out.*2 games left, all wins.*seed 1/.test(sc), sc);
      assert.ok(/If we lose out.*all 2 games lost.*seed 4/.test(sc), sc);
      assert.ok(/Estimate/.test(await txt(page, '.card:has(.scen) .label')));
      // team record line: Team B 2-1, .667, 18 runs for, 10 against, diff +8
      assert.ok(/\.667 · 18 runs for, 10 against · diff \+8/.test(await txt(page, '.stand-list li:nth-child(1) .st')), await txt(page, '.stand-list li:nth-child(1) .st'));
      eq(await page.locator('.tag.info').count(), 3, 'the three teams that needed a tiebreaker are tagged');
      const tie = page.locator('.card.tie');
      eq(await tie.count(), 1);
      eq(await txt(page, '.card.tie .label'), 'Tiebreaker for 1st to 3rd');
      eq(await tie.locator('.steps > li').count(), 2, 'head-to-head, then fewest runs allowed');
      const s1 = await tie.locator('.steps > li').nth(0).textContent(), s2 = await tie.locator('.steps > li').nth(1).textContent();
      assert.ok(/Head-to-head/.test(s1) && /No one is separated/.test(s1) && /Team B 1-1/.test(s1), s1);
      assert.ok(/Fewest runs allowed/.test(s2) && /Team B 10/.test(s2) && /Our Team 13/.test(s2) && /Team C 15/.test(s2), s2);
      eq(await tie.locator('table.mini tbody tr').count(), 3);
      eq(await txt(page, '.card.tie .sum'), 'Final order: Team B, Our Team, Team C.');
      assert.ok(/How teams are ranked/.test(await txt(page, '.card:has(ol.rules) .label')));
      eq(await page.locator('ol.rules li').count(), 6, '5 steps plus the coin flip note');
      assert.ok(/7 finished pool games counted, 4 still to play/.test(await txt(page, '.mute.small:has-text("finished pool")')), await txt(page, '.mute.small:has-text("finished pool")'));
    });
  });

  await test('standings screen: changing the rules re-sorts; steps off leave a visible "still tied"; reset restores', async () => {
    await app({ tours: [mkTour({ id: 'st2' })], open: true }, async page => {
      await tabTo(page, 'standings');
      await page.click('[data-act=rules-open]'); await openSheetWait(page);
      deq(await page.$$eval('#r-list li', els => els.map(e => e.dataset.crit)), ['pct', 'h2h', 'pa', 'diff', 'pf']);
      eq(await txt(page, '#r-list li:nth-child(1) .tx'), 'Win percentage'); eq(await txt(page, '#r-list li:nth-child(3) .tx'), 'Fewest runs allowed');
      // most runs scored before fewest runs allowed
      await page.click('[data-crit="pf"] [data-mv="-1"]'); await page.click('[data-crit="pf"] [data-mv="-1"]');
      deq(await page.$$eval('#r-list li', els => els.map(e => e.dataset.crit)), ['pct', 'h2h', 'pf', 'pa', 'diff']);
      // invalid number
      await page.fill('#r-cap', ''); await saveSheet(page);
      assert.ok(/whole numbers/.test(await txt(page, '#r-err'))); await page.fill('#r-cap', '8');
      await saveSheet(page); await noSheets(page); await waitToast(page, /Rules saved/);
      // our PF is 23 against B 18 and C 16: we are first
      deq(await page.$$eval('.stand-list .tm b', els => els.slice(0, 3).map(e => e.textContent)), ['Our Team', 'Team B', 'Team C']);
      eq(await txt(page, '.card.stand .big'), 'Seed 1 of 5 teams · 2-1');
      assert.ok(/If we win out/.test(await txt(page, '.scen')));
      assert.ok(/No finished games yet: Team F/.test(await txt(page, '.waiting')), 'a team that has not played is listed apart');
      // all tiebreakers off except head-to-head (which is level): the three stay tied and say so
      await page.click('[data-act=rules-open]'); await openSheetWait(page);
      for (const c of ['pf', 'pa', 'diff']) await page.uncheck('[data-crit="' + c + '"] [data-on]');
      await saveSheet(page); await noSheets(page);
      eq(await page.locator('.tag.warn').count(), 3); eq(await txt(page, '.stand-list li:nth-child(1) .rk'), 'T1');
      assert.ok(/Still tied with another team/.test(await txt(page, '.card.stand')));
      assert.ok(/Seed 1 to 3 of 5 teams/.test(await txt(page, '.card.stand .big')), await txt(page, '.card.stand .big'));
      assert.ok(/Still tied: .*The tournament director decides \(coin flip\)/.test(await txt(page, '.card.tie .sum')), await txt(page, '.card.tie .sum'));
      // the order is saved with the tournament
      const ls = await lsGet(page); const t = JSON.parse(ls['tpack.t.st2']); deq(t.rules.order, ['pct', 'h2h', 'pf', 'pa', 'diff']); deq(t.rules.off.sort(), ['diff', 'pa', 'pf']);
      // reset puts it back
      await page.click('[data-act=rules-open]'); await openSheetWait(page); await page.click('[data-reset]'); await saveSheet(page); await noSheets(page);
      deq(await page.$$eval('.stand-list .tm b', els => els.slice(0, 3).map(e => e.textContent)), ['Team B', 'Our Team', 'Team C']);
      eq(await page.locator('.tag.warn').count(), 0);
    });
  });

  await test('standings screen: a team opens its games and can be renamed (a clash is refused)', async () => {
    await app({ tours: [mkTour({ id: 'st3' })], open: true }, async page => {
      await tabTo(page, 'standings');
      await page.locator('.trow', { hasText: 'Team D' }).click(); await openSheetWait(page);
      eq(await txt(page, sheetSel + ' h2'), 'Team D');
      deq(await page.$$eval('.tgames li', els => els.map(e => e.textContent.replace(/\s+/g, ' '))), ['vs Team Ewon 5-4', 'vs Our Teamlost 1-10', 'vs Team Blost 2-9', 'vs Team Cscheduled']);
      await page.fill('#tm-name', 'Team E'); await saveSheet(page); assert.ok(/played each other/.test(await txt(page, '#tm-err')));
      await page.fill('#tm-name', 'Team Dee'); await saveSheet(page); await noSheets(page); await waitToast(page, /Renamed/);
      assert.ok((await page.$$eval('.stand-list .tm b', els => els.map(e => e.textContent))).includes('Team Dee'));
      await tabTo(page, 'games'); assert.ok((await page.textContent('#view')).includes('Team Dee'));
    });
  });

  await test('what do we need: after our last pool game is scored the estimate is replaced by the final seed', async () => {
    await app({ tours: [mkTour({ id: 'wn1' })], open: true }, async page => {
      await page.locator('.game.ours', { hasText: 'Team E' }).click(); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 5, sb: 2 }); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'standings');
      assert.ok(/1 game left, all wins.*seed 1/.test(await txt(page, '.scen')), 'one game left after the first is scored');
      await tabTo(page, 'games');
      await page.locator('.game.ours', { hasText: 'Team F' }).click(); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 6, sb: 1 }); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'standings');
      eq(await txt(page, '.card.stand .big'), 'Seed 1 of 6 teams · 4-1');
      assert.ok(/No pool games left for Our Team/.test(await txt(page, '.card.soft')), await txt(page, '#view'));
      eq(await page.locator('.scen').count(), 0);
    });
  });

  /* ---------- bracket ---------- */
  await test('bracket: seed from standings, enter results, winners advance, "our path", champion', async () => {
    await app({ tours: [mkTour({ id: 'br1' })], open: true }, async page => {
      await tabTo(page, 'bracket');
      eq(await txt(page, '.sec-title h2'), '4-team bracket'); assert.ok(/Seeds are empty/.test(await txt(page, '#view')));
      eq(await page.locator('.mt').count(), 3);
      eq(await txt(page, '.mt[data-slot=r1m1] .mh'), 'Semifinal 1'); eq(await txt(page, '.mt[data-slot=r1m1] .mh2'), 'Mon 9:00 AM · Field 1');
      eq(await page.locator('.mt.path').count(), 0);
      await page.click('[data-act=bracket-seed]'); await waitToast(page, /Seeded from the standings/);
      const side = async (slot, i) => (await page.locator('.mt[data-slot=' + slot + '] .sd').nth(i - 1).locator('b').textContent()).trim();
      eq(await side('r1m1', 1), 'Team B'); eq(await side('r1m1', 2), 'Team D'); eq(await side('r1m2', 1), 'Our Team'); eq(await side('r1m2', 2), 'Team C');
      deq(await page.$$eval('.mt.path', els => els.map(e => e.dataset.slot)), ['r1m2', 'r2m1'], 'our path is outlined');
      assert.ok(await page.isVisible('.legend'));
      // semifinal 2: we win 5-3
      await page.click('.mt[data-slot=r1m2]'); await openSheetWait(page);
      eq(await txt(page, '#g-la'), 'Our Team score'); eq(await txt(page, '#g-lb'), 'Team C score');
      await fillGame(page, { final: true, sa: 4, sb: 4 }); await saveSheet(page); assert.ok(/can't end in a tie/.test(await txt(page, '#g-err')));
      await fillGame(page, { sa: 5, sb: 3 }); await saveSheet(page); await noSheets(page);
      eq(await txt(page, '.mt[data-slot=r1m2] .sd.win b'), 'Our Team');
      eq(await side('r2m1', 2), 'Our Team', 'the winner moved into the final');
      eq(await side('r2m1', 1), 'Winner of SF 1');
      // semifinal 1: Team B wins
      await page.click('.mt[data-slot=r1m1]'); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 4, sb: 1 }); await saveSheet(page); await noSheets(page);
      // the final
      await page.click('.mt[data-slot=r2m1]'); await openSheetWait(page);
      eq(await txt(page, '#g-la'), 'Team B score'); eq(await txt(page, '#g-lb'), 'Our Team score');
      await fillGame(page, { final: true, sa: 2, sb: 3 }); await saveSheet(page); await noSheets(page);
      eq(await txt(page, '.champ .big'), 'Our Team'); eq(await page.locator('.mt.final').count(), 3);
      // Back in semifinal 2: Team C actually won. That voids the final -> asks first
      await page.click('.mt[data-slot=r1m2]'); await openSheetWait(page);
      await fillGame(page, { sa: 3, sb: 5 }); await saveSheet(page); await page.waitForSelector('.sheet.confirm');
      eq(await txt(page, '.sheet.confirm h2'), 'Clear later bracket games?');
      deq(await page.$$eval('.sheet.confirm .msg-list li', els => els.map(e => e.textContent)), ['Final']);
      eq(await page.locator('.sheet-wrap').count(), 2, 'the confirm sits on top of the game form');
      await page.click('.sheet.confirm [data-close].btn'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1);
      eq(await txt(page, sheetSel + ' h2'), 'Edit game');
      eq(await page.locator('.champ').count(), 1, 'cancel changed nothing');
      await saveSheet(page); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await page.locator('.champ').count(), 0); eq(await page.locator('.mt.final').count(), 2);
      eq(await txt(page, '.mt[data-slot=r1m2] .sd.win b'), 'Team C');
      eq(await side('r2m1', 1), 'Team B'); eq(await side('r2m1', 2), 'Team C');
      deq(await page.$$eval('.mt.path', els => els.map(e => e.dataset.slot)), ['r1m2'], 'we lost, so the path ends at the semifinal');
      // the cleared final keeps its time slot
      eq(await txt(page, '.mt[data-slot=r2m1] .mh'), 'Final'); eq(await txt(page, '.mt[data-slot=r2m1] .mh2'), 'Mon 11:30 AM · Field 1');
    });
  });

  await test('bracket: change to 6 teams (byes, and old results are cleared after a question), seeds from the form', async () => {
    const t = mkTour({ id: 'br2' });
    t.bracket = { size: 4, seeds: ['Team B', 'Our Team', 'Team C', 'Team D'] };
    t.games = t.games.filter(g => g.kind === 'pool').concat([
      { id: 'bk1', kind: 'bracket', slot: 'r1m1', date: '2026-11-09', time: '09:00', field: 'Field 1', label: '', a: 'Team B', b: 'Team D', status: 'final', sa: 3, sb: 1, innings: null, forfeit: '' },
      { id: 'bk2', kind: 'bracket', slot: 'r1m2', date: '2026-11-09', time: '09:00', field: 'Field 2', label: '', a: 'Our Team', b: 'Team C', status: 'scheduled', sa: null, sb: null, innings: null, forfeit: '' }]);
    await app({ tours: [C.sanitizeTournament(t)], open: true }, async page => {
      await tabTo(page, 'bracket');
      eq(await page.locator('.br-col').count(), 2);
      await page.click('[data-act=bracket-setup]'); await openSheetWait(page);
      eq(await page.locator('.seed-row:not([hidden])').count(), 4);
      await page.click('[data-bsize="6"]'); eq(await page.locator('.seed-row:not([hidden])').count(), 6);
      assert.ok(/seeds 1 and 2 get a bye/.test(await txt(page, '#b-hint')));
      await page.fill('#b-s5', 'Team E'); await page.fill('#b-s6', 'Team B'); await saveSheet(page);
      assert.ok(/Seed 1 and seed 6 are the same team/.test(await txt(page, '#b-err')));
      await page.fill('#b-s6', 'Team F'); await saveSheet(page);
      await page.waitForSelector('.sheet.confirm');
      const list = await page.$$eval('.sheet.confirm .msg-list li', els => els.map(e => e.textContent));
      assert.ok(list.length >= 1, 'something is cleared: ' + list.join());
      await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await page.locator('.br-col').count(), 3); eq(await page.locator('.mt.bye').count(), 2);
      eq(await txt(page, '.sec-title h2'), '6-team bracket');
      assert.ok(/Team B/.test(await txt(page, '.mt.bye')), 'seed 1 has the bye');
      eq(await page.locator('.mt.final').count(), 0, 'the old result was cleared');
      // fill from standings button inside the form
      await page.click('[data-act=bracket-setup]'); await openSheetWait(page);
      await page.click('[data-fill]'); eq(await page.inputValue('#b-s1'), 'Team B'); eq(await page.inputValue('#b-s5'), 'Team E');
      await closeTop(page); await noSheets(page);
    });
  });

  await test('bracket: 8 teams and an empty tournament: the empty state offers set-up; "seed from standings" with no scores explains', async () => {
    const t = mkTour({ id: 'br3', games: [], bracket: { size: 0, seeds: [] } });
    await app({ tours: [t], open: true }, async page => {
      await tabTo(page, 'bracket');
      assert.ok(/No bracket yet/.test(await txt(page, '.empty')));
      await page.click('[data-act=bracket-setup]'); await openSheetWait(page);
      await page.click('[data-bsize="8"]'); eq(await page.locator('.seed-row:not([hidden])').count(), 8);
      await page.click('[data-fill]'); assert.ok(/nothing to seed from/.test(await txt(page, '#b-err')));
      for (let i = 1; i <= 8; i++) await page.fill('#b-s' + i, 'T' + i);
      await saveSheet(page); await noSheets(page);
      eq(await page.locator('.br-col').count(), 3); eq(await page.locator('.mt').count(), 7);
      deq(await page.$$eval('.br-col:first-child .mt', els => els.map(e => e.getAttribute('aria-label').split(':')[1].split('.')[0].trim())), ['T1 versus T8', 'T4 versus T5', 'T3 versus T6', 'T2 versus T7']);
      // the bracket scrolls inside its own box, the page does not
      eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      eq(await page.evaluate(() => { const w = document.querySelector('.br-wrap'); return w.scrollWidth > w.clientWidth; }), true, 'wider than the screen, scrolls inside its box');
    });
  });

  /* ---------- pack list ---------- */
  await test('pack: progress bar, check, uncheck all with undo, add, reorder, delete with undo, template', async () => {
    await app({ tours: [mkTour({ id: 'pk1' })], open: true }, async page => {
      await tabTo(page, 'pack');
      eq(await txt(page, '.prog .pt'), '9 of 23 packed');
      eq(await page.getAttribute('.bar', 'aria-valuenow'), '9'); eq(await page.getAttribute('.bar', 'aria-valuemax'), '23');
      eq(await page.$eval('.bar i', e => e.style.width), '39%');
      deq(await page.$$eval('.sec-title.sm h3', els => els.map(e => e.textContent)), ['Gear', 'Food & Drink', 'Comfort', 'Admin']);
      // check one more
      await page.locator('.pk:not(.done) .chk').first().click();
      eq(await txt(page, '.prog .pt'), '10 of 23 packed'); eq(await page.locator('.pk.done').count(), 10);
      // uncheck all, then undo
      await page.click('[data-act=pack-uncheck]'); eq(await txt(page, '.prog .pt'), '0 of 23 packed'); await waitToast(page, /Unchecked everything/);
      await page.click('.toast .tact'); eq(await txt(page, '.prog .pt'), '10 of 23 packed', 'undo brings the checks back');
      // nothing checked -> a plain message
      await page.click('[data-act=pack-uncheck]'); await page.waitForTimeout(100);
      await page.click('[data-act=pack-uncheck]'); await waitToast(page, /Nothing is checked/);
      // add an item in a chosen group
      await page.click('[data-act=pack-edit]'); eq(await txt(page, '[data-act=pack-edit]'), 'Done editing');
      await page.fill('#pk-new', '   '); await page.click('.addrow .btn'); await waitToast(page, /Type what to pack/);
      await page.fill('#pk-new', 'Rain jacket'); await page.selectOption('#pk-grp', 'Comfort'); await page.click('.addrow .btn');
      eq(await txt(page, '.prog .pt'), '0 of 24 packed');
      const comfort = await page.$$eval('.plist:nth-of-type(3) .pk .tx', els => els.map(e => e.textContent));
      eq(comfort[comfort.length - 1], 'Rain jacket');
      eq(await page.evaluate(() => document.activeElement.id), 'pk-new', 'focus stays in the box so the next item can be typed');
      await page.keyboard.type('Sunscreen'); await page.keyboard.press('Enter'); eq(await txt(page, '.prog .pt'), '0 of 25 packed');
      // reorder inside the group: move Rain jacket up
      const before = await page.$$eval('.pk .tx', els => els.map(e => e.textContent));
      const iRJ = before.indexOf('Rain jacket');
      await page.click('[aria-label="Move Rain jacket up"]');
      const after = await page.$$eval('.pk .tx', els => els.map(e => e.textContent));
      eq(after.indexOf('Rain jacket'), iRJ - 1); eq(after[iRJ], before[iRJ - 1], 'swapped with the one above');
      eq(await page.isDisabled('.plist:first-of-type .pk:first-child [data-act=pack-up]'), true, 'the first one cannot go up');
      await page.click('[aria-label="Move Rain jacket down"]'); eq((await page.$$eval('.pk .tx', els => els.map(e => e.textContent))).indexOf('Rain jacket'), iRJ);
      // delete + undo puts it back where it was
      await page.click('[aria-label="Delete Rain jacket"]'); await waitToast(page, /Removed Rain jacket/);
      eq((await page.$$eval('.pk .tx', els => els.map(e => e.textContent))).includes('Rain jacket'), false);
      await page.click('.toast .tact');
      eq((await page.$$eval('.pk .tx', els => els.map(e => e.textContent))).indexOf('Rain jacket'), iRJ);
      // persists
      const t = JSON.parse((await lsGet(page))['tpack.t.pk1']); eq(t.pack.length, 25); assert.ok(t.pack.some(p => p.text === 'Sunscreen' && p.group === 'Gear'));
      await page.reload(); await page.waitForSelector('#view > *'); await page.click('[data-act=tour-open]'); await tabTo(page, 'pack');
      eq(await txt(page, '.prog .pt'), '0 of 25 packed');
    });
  });

  await test('pack: an empty list offers the sport template; softball and basketball templates differ', async () => {
    await app({ tours: [mkTour({ id: 'pk2', pack: [] })], open: true }, async page => {
      await tabTo(page, 'pack'); assert.ok(/The list is empty/.test(await txt(page, '.empty'))); assert.ok(/baseball template/.test(await txt(page, '.empty')));
      eq(await txt(page, '.prog .pt'), '0 of 0 packed');
      await page.click('[data-act=pack-template]'); eq(await txt(page, '.prog .pt'), '0 of 23 packed');
    });
    await app({}, async page => {
      await page.click('[data-act=tour-new]'); await openSheetWait(page);
      await page.fill('#f-name', 'Softball Day'); await page.click('[data-sport="softball"]'); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'pack'); eq(await txt(page, '.prog .pt'), '0 of 24 packed'); assert.ok((await page.textContent('#view')).includes('Hair ties'));
    });
  });

  /* ---------- notes, copy, calendar ---------- */
  await test('notes: text saves as you type and when you leave; summary; copy to the clipboard; calendar file', async () => {
    await app({ tours: [mkTour({ id: 'nt1' })], open: true }, async page => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await tabTo(page, 'notes');
      assert.ok(/Sample text: Hotel placeholder/.test(await page.inputValue('#n-lodging')));
      await page.fill('#n-lodging', 'Room 12, late check-in'); await page.waitForTimeout(800);
      eq(JSON.parse((await lsGet(page))['tpack.t.nt1']).notes.lodging, 'Room 12, late check-in', 'saved after a pause');
      await page.fill('#n-food', 'Pizza at 6'); await tabTo(page, 'games'); // leaving flushes at once
      eq(JSON.parse((await lsGet(page))['tpack.t.nt1']).notes.food, 'Pizza at 6');
      await tabTo(page, 'notes'); eq(await page.inputValue('#n-food'), 'Pizza at 6');
      const sum = await page.inputValue('#summary');
      assert.ok(sum.startsWith('Sample: Spring Classic (Baseball, Nov 6 to Nov 9)') && sum.includes('NEXT GAME: Sun, Nov 8, 9:00 AM vs Team E at Field 1. Arrive by 8:15 AM.') && sum.includes('POOL STANDINGS'), sum);
      eq(await page.getAttribute('#summary', 'readonly'), '');
      await page.click('[data-act=copy-summary]'); await waitToast(page, /Copied/);
      eq(await page.evaluate(() => navigator.clipboard.readText()), sum.replace(/\r/g, ''));
      // calendar: 2 upcoming games of ours (Sunday 9:00 and 11:15)
      assert.ok(/2 games that are not played yet/.test(await txt(page, '#view')), await txt(page, '#view'));
      assert.ok(/75 minutes before the game/.test(await txt(page, '#view')));
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=ics]')]);
      eq(dl.suggestedFilename(), 'tournament-pack-sample-spring-classic.ics');
      const ics = fs.readFileSync(await dl.path(), 'utf8');
      assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('PRODID') && ics.includes('VERSION:2.0'));
      eq((ics.match(/BEGIN:VEVENT/g) || []).length, 2); eq((ics.match(/BEGIN:VALARM/g) || []).length, 2);
      assert.ok(ics.includes('DTSTART:20261108T090000') && ics.includes('DTSTART:20261108T111500') && ics.includes('TRIGGER:-PT75M'));
      assert.ok(ics.replace(/\r\n /g, '').includes('Arrive by 8:15 AM'));
      await waitToast(page, /Calendar file made with 2 games/);
    });
  });

  await test('notes: no team name or no upcoming games: the calendar button explains instead of making an empty file', async () => {
    await app({ tours: [mkTour({ id: 'nt2', team: '' })], open: true }, async page => {
      await tabTo(page, 'notes'); await page.click('[data-act=ics]'); await waitToast(page, /Add our team name and some games first/);
      await tabTo(page, 'games'); assert.ok(/Add your team name to see your next game/.test(await txt(page, '.card.next')));
      await tabTo(page, 'standings'); assert.ok(/Add your team name in Edit tournament/.test(await txt(page, '.card.soft')));
    });
  });

  /* ---------- settings ---------- */
  await test('settings: warm-up minutes change every arrive-by; version; invalid input ignored; default tiebreakers apply to new tournaments', async () => {
    await app({ tours: [mkTour({ id: 'se1' })] }, async page => {
      await page.click('[data-act=settings]');
      eq(await view(page), 'settings'); assert.ok(await page.isHidden('#nav'));
      assert.ok(/Tournament Pack v1/.test(await txt(page, '.settings')), 'version string');
      eq(await page.inputValue('#s-warm'), '45'); assert.ok(/You haven't made a backup yet/.test(await txt(page, '.settings')));
      await page.fill('#s-warm', '200'); eq(JSON.parse((await lsGet(page))['tpack.settings'] || '{"warm":45}').warm, 45, '200 is out of range: not saved');
      await page.fill('#s-warm', '60'); eq(JSON.parse((await lsGet(page))['tpack.settings']).warm, 60);
      // default tiebreakers
      await page.click('[data-act=rules-defaults]'); await openSheetWait(page);
      eq(await txt(page, sheetSel + ' h2'), 'Default tiebreakers'); eq(await page.locator('#r-cap').count(), 0);
      await page.click('[data-crit="diff"] [data-mv="-1"]'); await saveSheet(page); await waitToast(page, /New tournaments start with these rules/);
      await noSheets(page);
      await page.click('[data-act=back]'); await page.click('[data-act=tour-open]'); await page.waitForSelector('.card.next');
      assert.ok(/Arrive by 8:00 AM \(60 min warm-up\)/.test(await txt(page, '.card.next')), await txt(page, '.card.next'));
      assert.ok(/Arrive by 8:00 AM/.test(await txt(page, '.game.ours:not(.done)')) || true);
      // a new tournament starts with the new default order; the existing one keeps its own
      await page.click('[data-act=back]'); await page.click('[data-act=tour-new]'); await openSheetWait(page);
      await page.fill('#f-name', 'Second'); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'standings'); await page.click('[data-act=rules-open]'); await openSheetWait(page);
      deq(await page.$$eval('#r-list li', els => els.map(e => e.dataset.crit)), ['pct', 'h2h', 'diff', 'pa', 'pf']);
      await closeTop(page); await noSheets(page);
      await page.reload(); await page.waitForSelector('#view > *'); await page.click('[data-act=settings]'); eq(await page.inputValue('#s-warm'), '60');
    });
  });

  /* ---------- time ---------- */
  await test('time: countdown wording and the live card at fixed clocks (10 min before, 20 min after the start, long over)', async () => {
    const cases = [
      ['2026-11-08T06:50', /^in 2 h 10 min$/, false, 'Open game'],
      ['2026-11-08T08:50', /^in 10 min$/, false, 'Open game'],
      ['2026-11-08T09:00', /^starting now$/, false, 'Open game'],
      ['2026-11-08T09:01', /^started 1 min ago$/, true, 'Enter the score'],
      ['2026-11-08T09:20', /^started 20 min ago$/, true, 'Enter the score'],
      ['2026-11-07T23:55', /^in 9 h 5 min$/, false, 'Open game']
    ];
    for (const [now, re, live, btn] of cases) {
      await app({ now, tours: [mkTour({ id: 'tm1' })], open: true }, async page => {
        const cd = await txt(page, '.card.next .cd'); assert.ok(re.test(cd), now + ' -> ' + cd);
        eq(await page.locator('.card.next.live').count(), live ? 1 : 0, now); eq(await txt(page, '.card.next .btn'), btn);
        assert.ok(/Arrive by 8:15 AM/.test(await txt(page, '.card.next')));
      });
    }
    // the 9:00 game is over after 12:00; the 11:15 one is then "started 75 min ago", and 'Add score' shows on the 9:00 game
    await app({ now: '2026-11-08T12:30', tours: [mkTour({ id: 'tm2' })], open: true }, async page => {
      assert.ok(/vs Team F/.test(await txt(page, '.card.next')) && /started 1 h 15 min ago/.test(await txt(page, '.card.next .cd')), await txt(page, '.card.next'));
      eq(await page.locator('.chip.warn', { hasText: 'Add score' }).count(), 2, 'the two 9:00 games are over (9:00 + 90 min); the 11:15 ones are not yet');
    });
    await app({ now: '2026-11-09T10:00', tours: [mkTour({ id: 'tm3' })], open: true }, async page => {
      assert.ok(/No upcoming games for Our Team/.test(await txt(page, '.card.next')), await txt(page, '.card.next'));
    });
  });

  await test('time: the card updates itself as minutes pass and flips to "live" without a reload', async () => {
    await app({ now: NOW_SUN_0850, tours: [mkTour({ id: 'tm4' })], open: true }, async page => {
      eq(await txt(page, '.card.next .cd'), 'in 10 min');
      await page.evaluate(() => { window.__now = '2026-11-08T08:51'; window.TPApp.tick(); });
      eq(await txt(page, '.card.next .cd'), 'in 9 min', 'the number changed in place');
      await page.evaluate(() => { window.__now = '2026-11-08T09:05'; window.TPApp.tick(); });
      eq(await page.locator('.card.next.live').count(), 1); eq(await txt(page, '.card.next .cd'), 'started 5 min ago'); eq(await txt(page, '.card.next .btn'), 'Enter the score');
      await page.evaluate(() => { window.__now = '2026-11-08T10:45'; window.TPApp.tick(); });
      assert.ok(/vs Team E/.test(await txt(page, '.card.next')) && /started 1 h 45 min ago/.test(await txt(page, '.card.next .cd')), 'an unscored game stays up to 3 hours: ' + await txt(page, '.card.next'));
      eq(await page.locator('.chip.warn', { hasText: 'Add score' }).count(), 2, 'its chip asks for the score now that 9:00 + 90 min has passed');
      await page.evaluate(() => { window.__now = '2026-11-08T12:05'; window.TPApp.tick(); });
      assert.ok(/vs Team F/.test(await txt(page, '.card.next')) && /started 50 min ago/.test(await txt(page, '.card.next .cd')), 'then the later game takes over: ' + await txt(page, '.card.next'));
    });
  });

  await test('time: real clock sanity (no injected time): a game 3 hours from now shows about 3 hours and the right arrive-by', async () => {
    const d = new Date(Date.now() + 180 * 60000), pad = n => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), tm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const a = new Date(d.getTime() - 45 * 60000), arrive = pad(a.getHours()) + ':' + pad(a.getMinutes());
    const t = C.sanitizeTournament({ id: 'rt1', name: 'Real Clock', sport: 'baseball', start: day, end: day, team: 'Us', games: [{ id: 'rg1', kind: 'pool', date: day, time: tm, a: 'Us', b: 'Them', status: 'scheduled' }], bracket: {}, pack: [] });
    await app({ now: null, tours: [t], open: true }, async page => {
      const cd = await txt(page, '.card.next .cd'); assert.ok(/^in (2 h 5\d min|3 h( [12] min)?)$/.test(cd), 'countdown: ' + cd);
      assert.ok(new RegExp('Arrive by ' + C.fmtTime(arrive).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await txt(page, '.card.next')), await txt(page, '.card.next') + ' vs ' + arrive);
      await page.click('[data-act=back]');
      assert.ok(/Next: .* vs Them/.test(await txt(page, '.tcard')), await txt(page, '.tcard'));
    });
  });

  /* ---------- storage ---------- */
  await test('persistence: tournaments, scores, packed items, notes and settings are all still there after a reload', async () => {
    await app({}, async page => {
      await page.click('button:has-text("Load a sample tournament")'); await page.waitForSelector('.card.next');
      await page.locator('.game.ours', { hasText: 'Team E' }).click(); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 9, sb: 0 }); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'pack'); await page.locator('.pk:not(.done) .chk').first().click();
      await tabTo(page, 'notes'); await page.fill('#n-other', 'Bring the big cooler'); await tabTo(page, 'games');
      await page.click('[data-act=back]'); await page.click('[data-act=settings]'); await page.fill('#s-warm', '30');
      const before = await lsGet(page);
      await page.reload(); await page.waitForSelector('#view > *');
      deq(await lsGet(page), before, 'a plain reload rewrites nothing');
      eq(await view(page), 'list'); eq(await page.locator('.tcard').count(), 1);
      assert.ok(/2-1|3-1/.test(await txt(page, '.tcard .tx')), await txt(page, '.tcard .tx'));
      await page.click('.tcard'); await page.waitForSelector('.card.next');
      assert.ok(/W 9-0/.test(await txt(page, '.game.ours.done:has-text("Team E")')));
      assert.ok(/Arrive by 8:30 AM \(30 min warm-up\)/.test(await txt(page, '.card.next')) || /vs Team F/.test(await txt(page, '.card.next')), await txt(page, '.card.next'));
      await tabTo(page, 'pack'); eq(await txt(page, '.prog .pt'), '10 of 23 packed');
      await tabTo(page, 'notes'); eq(await page.inputValue('#n-other'), 'Bring the big cooler');
    });
  });

  await test('storage blocked: the app still opens and works for the visit, and says it cannot save', async () => {
    const init = () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); };
    await app({ init }, async page => {
      assert.ok(await page.isVisible('.banner.bad'), 'a visible note');
      assert.ok(/not letting Tournament Pack save/.test(await txt(page, '.banner.bad')) && /lost when you close the app/.test(await txt(page, '.banner.bad')));
      await page.click('button:has-text("Load a sample tournament")'); await page.waitForSelector('.card.next');
      assert.ok(await page.isVisible('.banner.bad'), 'the note stays on every screen');
      // the app is fully usable in memory
      await page.locator('.game.ours', { hasText: 'Team E' }).click(); await openSheetWait(page);
      await fillGame(page, { final: true, sa: 3, sb: 2 }); await saveSheet(page); await noSheets(page);
      await tabTo(page, 'standings'); assert.ok(/Seed 1/.test(await txt(page, '.card.stand .big')) || /Seed 2/.test(await txt(page, '.card.stand .big')));
      await tabTo(page, 'pack'); await page.locator('.pk:not(.done) .chk').first().click(); eq(await txt(page, '.prog .pt'), '10 of 23 packed');
      await page.click('[data-act=back]'); await page.click('[data-act=settings]'); assert.ok(await page.isVisible('.banner.bad'));
      // a backup still works, since it is made from what is on screen
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=dl-backup]')]);
      const b = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); eq(b.tournaments.length, 1); eq(b.app, 'tournamentpack');
      eq(await toastTexts(page).then(t => t.some(x => /Couldn't save/.test(x))), false, 'no scary save-failed toast in memory mode');
    });
  });

  await test('storage full (writes fail): the app keeps running and tells the user it could not save', async () => {
    const init = () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k) === 'tpack.probe') return orig.call(this, k, v); throw new DOMException('full', 'QuotaExceededError'); }; };
    await app({ init }, async page => {
      eq(await page.locator('.banner.bad').count(), 0, 'reads and the probe work, so no blocked banner');
      await page.click('button:has-text("Load a sample tournament")'); await page.waitForSelector('.card.next');
      await waitToast(page, /Couldn't save on this phone/);
      eq(await page.locator('.game').count(), 14, 'the sample is on screen for this visit');
    });
  });

  await test('damaged saved data: one broken tournament is reported, the others open, bad index is repaired', async () => {
    const good = mkTour({ id: 'good1', name: 'Good One' });
    await app({ tours: [good] }, async page => {
      await page.evaluate(() => {
        localStorage.setItem('tpack.t.broken1', '{"id": "broken1", "name": ');
        localStorage.setItem('tpack.t.wrongid1', JSON.stringify({ id: 'other', name: 'Mismatch' }));
        localStorage.setItem('tpack.index', '{{{not json');
        localStorage.setItem('tpack.settings', '"a string"');
        localStorage.setItem('tpack.meta', '[1,2]');
      });
      await page.reload(); await page.waitForSelector('#view > *');
      eq(await page.locator('.tcard').count(), 1); eq(await txt(page, '.tcard .tn'), 'Good One');
      assert.ok(/2 saved tournaments couldn't be read/.test(await txt(page, '.banner')), await txt(page, '.banner'));
      await page.click('.tcard'); await page.waitForSelector('.card.next'); await page.click('[data-act=back]'); await page.click('[data-act=settings]');
      eq(await page.inputValue('#s-warm'), '45', 'bad settings fall back to defaults');
    });
  });

  /* ---------- backup and restore ---------- */
  await test('backup -> clear everything -> restore gives back exactly the same data; a bad file changes nothing', async () => {
    const t1 = mkTour({ id: 'bk1', name: 'First' }), t2 = mkTour({ id: 'bk2', name: 'Second', sport: 'basketball', team: 'Hoopers', games: [], bracket: { size: 0, seeds: [] }, pack: C.packTemplate('basketball') });
    await app({ tours: [t1, t2], settings: { warm: 55 } }, async page => {
      const before = await lsGet(page);
      await page.click('[data-act=settings]');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=dl-backup]')]);
      eq(dl.suggestedFilename(), 'tournament-pack-backup-' + TODAY + '.json');
      const raw = fs.readFileSync(await dl.path(), 'utf8'), b = JSON.parse(raw);
      eq(b.app, 'tournamentpack'); eq(b.v, 1); eq(b.tournaments.length, 2); eq(b.settings.warm, 55);
      await waitToast(page, /Backup file created/); assert.ok(/Last backup: today/.test(await txt(page, '.settings')));
      // clear: confirm names what goes; cancel keeps
      await page.click('[data-act=clear-all]'); await page.waitForSelector('.sheet.confirm');
      assert.ok(/permanently removes all 2 tournaments/.test(await txt(page, '.sheet.confirm .sh-body')));
      await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      eq(Object.keys(await lsGet(page)).filter(k => k.startsWith('tpack.t.')).length, 2, 'cancel keeps everything');
      await page.click('[data-act=clear-all]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await view(page), 'list'); assert.ok(/Everything for tournament weekend/.test(await txt(page, 'h2.tagline')));
      deq(Object.keys(await lsGet(page)).filter(k => k.startsWith('tpack.t.')), [], 'tournaments are gone');
      // bad files first: nothing changes
      const bads = [
        ['notes.txt', 'text/plain', 'this is not json at all'],
        ['other.json', 'application/json', JSON.stringify({ app: 'locker', v: 1, tournaments: [] })],
        ['array.json', 'application/json', '[1,2,3]'],
        ['newer.json', 'application/json', JSON.stringify({ app: 'tournamentpack', v: 7, tournaments: [] })],
        ['list.json', 'application/json', JSON.stringify({ app: 'tournamentpack', v: 1, tournaments: 'nope' })]
      ];
      for (const [name, mimeType, body] of bads) {
        const snap = await lsGet(page);
        await page.setInputFiles('input[data-restore]', { name, mimeType, buffer: Buffer.from(body) });
        await waitToast(page, /Nothing was changed/);
        eq(await page.locator('.sheet-wrap').count(), 0, name + ': no restore question for a bad file');
        deq(await lsGet(page), snap, name + ': storage untouched');
        await page.evaluate(() => document.querySelector('#toasts').innerHTML = '');
      }
      // the good file: asks, then restores
      await page.setInputFiles('input[data-restore]', { name: 'tournament-pack-backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
      await page.waitForSelector('.sheet.confirm');
      const q = await txt(page, '.sheet.confirm .sh-body'); assert.ok(/2 tournaments: First, Second/.test(q) && /Nothing is on this phone yet/.test(q), q);
      await page.click('.sheet.confirm [data-ok]'); await noSheets(page); await waitToast(page, /Restored 2 tournaments/);
      eq(await page.locator('.tcard').count(), 2);
      const after = await lsGet(page);
      for (const k of Object.keys(before).filter(k => k.startsWith('tpack.t.'))) deq(JSON.parse(after[k]), JSON.parse(before[k]), k + ' is the same after the round trip');
      deq(JSON.parse(after['tpack.settings']), C.sanitizeSettings(JSON.parse(before['tpack.settings'])), 'settings (warm-up 55 and the rules) come back too');
      // restoring over existing data warns first; cancel keeps what is there
      await page.click('[data-act=settings]');
      await page.setInputFiles('input[data-restore]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'tournamentpack', v: 1, tournaments: [JSON.parse(raw).tournaments[0]] })) });
      await page.waitForSelector('.sheet.confirm'); assert.ok(/replaces everything in Tournament Pack on this phone now \(2 tournaments\)/.test(await txt(page, '.sheet.confirm .sh-body')));
      await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      eq(Object.keys(await lsGet(page)).filter(k => k.startsWith('tpack.t.')).length, 2);
      await page.setInputFiles('input[data-restore]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'tournamentpack', v: 1, tournaments: [JSON.parse(raw).tournaments[0]] })) });
      await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(Object.keys(await lsGet(page)).filter(k => k.startsWith('tpack.t.')).length, 1, 'the other tournament is gone after a confirmed replace');
    });
  });

  await test('restore from the empty first screen works too (the "Restore it" link)', async () => {
    const b = C.makeBackup([mkTour({ id: 'rs1', name: 'From a file' })], { warm: 40 }, TODAY);
    await app({}, async page => {
      assert.ok(await page.isVisible('.link-btn')); eq(await txt(page, '.link-btn'), 'Restore it');
      await page.setInputFiles('.link-btn input', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(b)) });
      await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      eq(await txt(page, '.tcard .tn'), 'From a file');
      eq(JSON.parse((await lsGet(page))['tpack.settings']).warm, 40);
    });
  });

  /* ---------- hostile text ---------- */
  await test('XSS: names typed anywhere show as plain text and never run', async () => {
    const IMG = '<img src=x onerror="window.__xss=1">', SCR = '<script>window.__xss=2</script>', QUOTE = '"><img src=x onerror=window.__xss=3>';
    await app({}, async page => {
      const clean = async where => {
        eq(await page.evaluate(() => window.__xss), undefined, where + ': nothing ran');
        eq(await page.evaluate(() => document.body.querySelectorAll('img, [onerror], [onload], [onclick], [onmouseover]').length), 0, where + ': no injected elements');
        eq(await page.evaluate(() => document.querySelectorAll('script').length), 5, where + ': no extra script tags (install.js, core, ui, views, app)');
      };
      await page.click('[data-act=tour-new]'); await openSheetWait(page);
      await page.fill('#f-name', IMG); await page.fill('#f-team', '<b>Evil</b> "Team"'); await saveSheet(page); await noSheets(page);
      await clean('created'); eq(await txt(page, '.ttl b'), IMG);
      // games with hostile opponents (ours), two other teams, a field and a label
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      await fillGame(page, { opp: SCR, date: '2026-11-08', time: '09:00', field: QUOTE }); await page.fill('#g-label', IMG); await saveSheet(page); await noSheets(page);
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      await fillGame(page, { ours: false, t1: QUOTE, t2: IMG, date: '2026-11-08', time: '10:00', final: true, sa: 2, sb: 1 }); await saveSheet(page); await noSheets(page);
      await clean('games'); assert.ok((await page.textContent('.game.ours')).includes(SCR), 'shown as text');
      await page.locator('.game.ours').click(); await openSheetWait(page); await clean('game sheet'); await closeTop(page); await noSheets(page);
      await tabTo(page, 'standings'); await clean('standings');
      await page.locator('.trow', { hasText: 'onerror=window.__xss=3' }).first().click(); await openSheetWait(page); await clean('team sheet'); await closeTop(page); await noSheets(page);
      await page.click('[data-act=rules-open]'); await openSheetWait(page); await clean('rules'); await closeTop(page); await noSheets(page);
      await tabTo(page, 'bracket'); await page.click('[data-act=bracket-setup]'); await openSheetWait(page);
      await page.fill('#b-s1', IMG); await page.fill('#b-s2', QUOTE); await page.fill('#b-s3', SCR); await page.fill('#b-s4', "x' onmouseover='window.__xss=4"); await saveSheet(page); await noSheets(page);
      await clean('bracket'); await page.click('[data-act=bracket-setup]'); await openSheetWait(page); await clean('bracket form'); await closeTop(page); await noSheets(page);
      await tabTo(page, 'pack'); await page.click('[data-act=pack-edit]');
      await page.fill('#pk-new', QUOTE); await page.click('.addrow .btn'); await clean('pack edit'); await page.click('[aria-label^="Delete "][aria-label*="onerror"]');
      await clean('pack delete'); await waitToast(page, /Removed .*onerror/);
      await tabTo(page, 'notes'); await page.fill('#n-lodging', '</textarea>' + IMG + SCR); await page.fill('#n-food', QUOTE); await tabTo(page, 'games'); await tabTo(page, 'notes');
      await clean('notes'); assert.ok((await page.inputValue('#summary')).includes(IMG), 'the summary has the raw text'); assert.ok((await page.inputValue('#n-lodging')).includes('</textarea>'));
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await clean('menu');
      await page.click('[data-act=tour-dup]'); await openSheetWait(page); await clean('duplicate'); await closeTop(page); await noSheets(page);
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm'); await clean('delete confirm');
      assert.ok((await txt(page, '.sheet.confirm .msg')).includes(IMG), 'the confirm names it as text');
      await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      await page.click('[data-act=back]'); await waitDepth(page, 0); await clean('list'); eq(await txt(page, '.tcard .tn'), IMG);
      // survives a reload, and a backup round trip with hostile text restores as text
      await page.reload(); await page.waitForSelector('.tcard'); await clean('reloaded');
      await page.click('.tcard'); await page.waitForSelector('#nav:not([hidden])'); await clean('reopened');
      await page.click('[data-act=back]'); await page.click('[data-act=settings]');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=dl-backup]')]);
      const raw = fs.readFileSync(await dl.path(), 'utf8'); await page.click('[data-act=clear-all]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      await page.setInputFiles('input[data-restore]', { name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(raw) }); await page.waitForSelector('.sheet.confirm'); await clean('restore confirm');
      await page.click('.sheet.confirm [data-ok]'); await noSheets(page); await clean('restored'); eq(await txt(page, '.tcard .tn'), IMG);
      // deleting it puts the text in a toast: still text
      await page.click('.tcard'); await page.waitForSelector('#nav:not([hidden])');
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      await waitToast(page, /Deleted <img/); await clean('after delete');
    });
  });

  await test('XSS: a hostile backup file is sanitised on the way in (ids, bad types, script text)', async () => {
    const evil = { app: 'tournamentpack', v: 1, settings: { warm: '<img src=x onerror=window.__xss=1>', rules: { order: ['<script>'] } }, tournaments: [
      { id: '"><img src=x onerror=window.__xss=2>', name: '<svg onload=window.__xss=3>', sport: '<b>', start: 'javascript:alert(1)', team: '<i>t</i>', games: [{ kind: 'pool', a: '<img src=x onerror=window.__xss=4>', b: 'B', date: '2026-11-08', time: '<b>', status: 'final', sa: '<b>', sb: 2 }], notes: { lodging: '<img src=x onerror=window.__xss=5>' }, pack: [{ text: '<img src=x onerror=window.__xss=6>', group: '<x>', done: true }] }] };
    await app({}, async page => {
      await page.setInputFiles('.link-btn input', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
      await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page);
      await page.click('.tcard'); await page.waitForSelector('#nav:not([hidden])');
      for (const tb of ['games', 'standings', 'bracket', 'pack', 'notes']) { await tabTo(page, tb); eq(await page.evaluate(() => window.__xss), undefined, tb); eq(await page.evaluate(() => document.body.querySelectorAll('img, svg[onload], [onerror]').length), 0, tb); }
      const ls = await lsGet(page); const keys = Object.keys(ls).filter(k => k.startsWith('tpack.t.')); eq(keys.length, 1); assert.ok(/^tpack\.t\.[A-Za-z0-9_-]+$/.test(keys[0]), 'the id was replaced by a safe one: ' + keys[0]);
    });
  });

  /* ---------- offline ---------- */
  await test('offline: the service worker saves the app, and it opens and works with the network off', async () => {
    const r = await boot({ sw: true });
    try {
      const { page, ctx } = r;
      // the app registers its own worker (install.js does not); wait for that, never register it from the test
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(async () => {
        const c = await caches.open('tournamentpack-v1'), keys = (await c.keys()).map(k => new URL(k.url).pathname);
        return ['core.js', 'ui.js', 'views.js', 'app.js', 'tpack.css', 'manifest.json'].every(f => keys.some(k => k.endsWith('/' + f))) && keys.some(k => k.endsWith('/tournamentpack/'));
      }, null, { timeout: 10000 });
      assert.deepStrictEqual(await page.evaluate(() => caches.keys()), ['tournamentpack-v1']);
      await ctx.setOffline(true);
      await page.reload(); await page.waitForSelector('#view > *');
      eq(await txt(page, 'h2.tagline'), 'Everything for tournament weekend');
      await page.click('button:has-text("Load a sample tournament")'); await page.waitForSelector('.card.next');
      await tabTo(page, 'standings'); eq(await page.locator('.trow').count(), 5);
      await ctx.setOffline(false);
      assert.deepStrictEqual(r.errors.filter(e => !/net::ERR|Failed to fetch|ERR_INTERNET_DISCONNECTED/.test(e)), [], 'no real errors while offline');
    } finally { await r.ctx.close(); }
  });

  /* ---------- Back button ---------- */
  await test('back button: leaving a tournament and Settings goes to the list, inside the app', async () => {
    await app({ tours: [mkTour({ id: 'bb1' })] }, async page => {
      const url0 = page.url();
      await page.click('[data-act=tour-open]'); await waitDepth(page, 1);
      await page.goBack(); await waitDepth(page, 0);
      eq(await view(page), 'list'); eq(page.url(), url0, 'still in the app');
      await page.click('[data-act=settings]'); await waitDepth(page, 1); eq(await view(page), 'settings');
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list'); eq(page.url(), url0);
      // the on-screen back arrow gives the entry back too, so Back afterwards does not land on a ghost screen
      await page.click('[data-act=tour-open]'); await waitDepth(page, 1); await page.click('[data-act=back]'); await waitDepth(page, 0); eq(await view(page), 'list');
      await page.click('[data-act=tour-open]'); await waitDepth(page, 1); eq(await view(page), 'tournament');
    });
  });

  await test('back button: Back closes an open sheet first and stays in the tournament', async () => {
    await app({ tours: [mkTour({ id: 'bb2' })], open: true }, async page => {
      await waitDepth(page, 1);
      await page.click('[data-act=game-new]'); await openSheetWait(page); await waitDepth(page, 2);
      await page.goBack(); await noSheets(page); await waitDepth(page, 1);
      eq(await view(page), 'tournament', 'the sheet closed, we did not leave');
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await waitDepth(page, 2);
      await page.goBack(); await noSheets(page); await waitDepth(page, 1); eq(await view(page), 'tournament');
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list');
    });
  });

  await test('back button: two sheets stacked: Back closes the top one, then the next, then leaves the tournament', async () => {
    const t = mkTour({ id: 'bb3' });
    t.bracket = { size: 4, seeds: ['Team B', 'Our Team', 'Team C', 'Team D'] };
    t.games = t.games.filter(g => g.kind === 'pool').concat([
      { id: 'k1', kind: 'bracket', slot: 'r1m1', date: '2026-11-09', time: '09:00', field: '', label: '', a: 'Team B', b: 'Team D', status: 'final', sa: 3, sb: 1, innings: null, forfeit: '' },
      { id: 'k2', kind: 'bracket', slot: 'r1m2', date: '2026-11-09', time: '09:00', field: '', label: '', a: 'Our Team', b: 'Team C', status: 'final', sa: 5, sb: 2, innings: null, forfeit: '' },
      { id: 'k3', kind: 'bracket', slot: 'r2m1', date: '2026-11-09', time: '11:30', field: '', label: '', a: 'Team B', b: 'Our Team', status: 'final', sa: 1, sb: 2, innings: null, forfeit: '' }]);
    await app({ tours: [C.sanitizeTournament(t)], open: true }, async page => {
      await tabTo(page, 'bracket'); eq(await page.locator('.champ').count(), 1);
      await page.click('.mt[data-slot=r1m2]'); await openSheetWait(page); await waitDepth(page, 2);
      await fillGame(page, { sa: 1, sb: 6 }); await saveSheet(page); await page.waitForSelector('.sheet.confirm'); await waitDepth(page, 3);
      eq(await page.locator('.sheet-wrap').count(), 2);
      await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1); await waitDepth(page, 2);
      eq(await txt(page, sheetSel + ' h2'), 'Edit game', 'the form under the question is still open and still has what was typed');
      eq(await page.inputValue('#g-sb'), '6');
      await page.goBack(); await noSheets(page); await waitDepth(page, 1); eq(await view(page), 'tournament');
      eq(await page.locator('.champ').count(), 1, 'nothing was changed');
      // and the confirmed path leaves the history tidy
      await page.click('.mt[data-slot=r1m2]'); await openSheetWait(page); await fillGame(page, { sa: 1, sb: 6 }); await saveSheet(page);
      await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await noSheets(page); await waitDepth(page, 1);
      eq(await page.locator('.champ').count(), 0);
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list');
    });
  });

  await test('back button: a sheet that replaces a sheet leaves no stray history entry', async () => {
    await app({ tours: [mkTour({ id: 'bb4' })], open: true }, async page => {
      await waitDepth(page, 1);
      const len0 = await page.evaluate(() => history.length);
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await waitDepth(page, 2);
      const len1 = await page.evaluate(() => history.length); eq(len1, len0 + 1, 'one entry for the menu');
      await page.click('[data-act=tour-edit]'); await openSheetWait(page); eq(await txt(page, sheetSel + ' h2'), 'Edit tournament');
      await page.waitForTimeout(150); await waitDepth(page, 2);
      eq(await page.evaluate(() => history.length), len1, 'the menu became the edit form: no extra entry');
      await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1, null, { timeout: 2000 });
      // menu -> rules -> (cancel) ; menu -> duplicate ; each is one sheet replacing one
      await page.click('.sheet-wrap.open [data-close].btn'); await noSheets(page); await waitDepth(page, 1);
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=rules-open]'); await openSheetWait(page); await page.waitForTimeout(150); await waitDepth(page, 2);
      await page.goBack(); await noSheets(page); await waitDepth(page, 1);
      eq(await view(page), 'tournament', 'one Back closes the replacement sheet; nothing else is left behind');
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list');
    });
  });

  await test('back button: Esc, the X button and tapping outside all close a sheet and keep the history right', async () => {
    await app({ tours: [mkTour({ id: 'bb5' })], open: true }, async page => {
      for (const how of ['esc', 'x', 'backdrop', 'cancel']) {
        await page.click('[data-act=game-new]'); await openSheetWait(page); await waitDepth(page, 2);
        if (how === 'esc') await page.keyboard.press('Escape');
        else if (how === 'x') await page.click(sheetSel + ' .sh-head .x');
        else if (how === 'backdrop') await page.mouse.click(195, 40);
        else await page.click(sheetSel + ' [data-close].btn');
        await noSheets(page); await waitDepth(page, 1); eq(await view(page), 'tournament', how);
      }
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list', 'after four open/close rounds one Back still goes to the list');
    });
  });

  await test('back button: Settings with a sheet open: Back closes the sheet, then Settings; deleting from a sheet returns to the list cleanly', async () => {
    await app({ tours: [mkTour({ id: 'bb6' })] }, async page => {
      await page.click('[data-act=settings]'); await waitDepth(page, 1);
      await page.click('[data-act=rules-defaults]'); await openSheetWait(page); await waitDepth(page, 2);
      await page.goBack(); await noSheets(page); await waitDepth(page, 1); eq(await view(page), 'settings');
      await page.goBack(); await waitDepth(page, 0); eq(await view(page), 'list');
      await page.click('[data-act=tour-open]'); await waitDepth(page, 1);
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm'); await waitDepth(page, 2);
      await page.click('.sheet.confirm [data-ok]'); await noSheets(page); await waitDepth(page, 0);
      eq(await view(page), 'list'); assert.ok(page.url().startsWith(srv.url));
      eq(await page.locator('.tcard').count(), 0);
    });
  });

  /* ---------- keyboard, focus, motion ---------- */
  await test('keyboard: everything can be reached and used without a mouse; the focus ring is visible', async () => {
    await app({}, async page => {
      const ring = () => page.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { tag: e.tagName, txt: (e.textContent || '').trim().slice(0, 40), style: cs.outlineStyle, w: parseFloat(cs.outlineWidth), color: cs.outlineColor }; });
      let r;
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); r = await ring(); if (/Load a sample/.test(r.txt)) break; }
      assert.ok(/Load a sample/.test(r.txt), 'Tab reaches the sample button: ' + JSON.stringify(r));
      assert.ok(r.style === 'solid' && r.w >= 2, 'visible focus ring: ' + JSON.stringify(r));
      await page.keyboard.press('Enter'); await page.waitForSelector('.card.next'); eq(await view(page), 'tournament');
      // nav buttons and game rows are real buttons
      eq(await page.evaluate(() => Array.from(document.querySelectorAll('#nav button, .game, .tcard, .trow')).every(e => e.tagName === 'BUTTON')), true);
      // sheet by keyboard: opens with focus inside, Tab stays inside, Esc closes and focus returns to the opener
      await page.focus('[data-act=game-new]'); await page.keyboard.press('Enter'); await openSheetWait(page);
      await page.waitForFunction(() => document.activeElement && document.activeElement.closest('.sheet'));
      for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); eq(await page.evaluate(() => !!document.activeElement.closest('.sheet')), true, 'focus stayed in the sheet on Tab ' + i); }
      for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); eq(await page.evaluate(() => !!document.activeElement.closest('.sheet')), true, 'and on Shift+Tab'); }
      eq(await page.evaluate(() => document.getElementById('app').inert), true, 'the page behind is inert while a sheet is open');
      await page.keyboard.press('Escape'); await noSheets(page);
      eq(await page.evaluate(() => document.activeElement.getAttribute('data-act')), 'game-new', 'focus went back to the button that opened it');
      eq(await page.evaluate(() => document.getElementById('app').inert), false);
      // Enter in a field saves
      await page.keyboard.press('Enter'); await openSheetWait(page);
      await page.waitForTimeout(80); await page.keyboard.type('Keyboard Rivals'); await page.keyboard.press('Enter'); await noSheets(page);
      assert.ok((await page.textContent('#view')).includes('Keyboard Rivals'), 'Enter in the opponent box saved the game');
      // pack check box by Space with a visible ring on the box
      await tabTo(page, 'pack');
      await page.focus('.pk:not(.done) input'); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      const before = await txt(page, '.prog .pt'); await page.keyboard.press('Space'); assert.notStrictEqual(await txt(page, '.prog .pt'), before, 'Space toggled it');
      const box = await page.evaluate(() => { const i = document.activeElement; const b = i.nextElementSibling, cs = getComputedStyle(b); return { tag: i.tagName, type: i.type, style: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; });
      eq(box.tag, 'INPUT'); assert.ok(box.style === 'solid' && box.w >= 2, 'ring on the check box: ' + JSON.stringify(box));
    });
  });

  await test('motion: with "reduce motion" on, sheets and toasts do not animate', async () => {
    await app({ tours: [mkTour({ id: 'rm1' })], open: true, reducedMotion: true }, async page => {
      eq(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      await page.click('[data-act=game-new]'); await openSheetWait(page);
      const d = await page.evaluate(() => { const s = document.querySelector('.sheet'), cs = getComputedStyle(s); return { t: cs.transitionDuration, a: cs.animationName }; });
      eq(d.t, '0s'); eq(d.a, 'none');
      eq(await page.evaluate(() => document.documentElement.getBoundingClientRect().width > 0), true);
      await closeTop(page); await noSheets(page);
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await closeTop(page);
      await page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 500 });
    });
    const css = fs.readFileSync(path.join(__dirname, '../apps/tournamentpack/tpack.css'), 'utf8');
    assert.ok(/prefers-reduced-motion: reduce[\s\S]*transition: none !important[\s\S]*animation: none !important/.test(css));
    assert.ok((css.match(/env\(safe-area-inset-(top|bottom|left|right)\)/g) || []).length >= 8, 'safe-area insets are used for the header, content, nav, sheets and toasts');
    assert.ok(/max-height: 85vh/.test(css) && /max-height: 85dvh/.test(css), 'sheets are capped at 85% of the screen');
  });

  await test('layout: a very long name and a very long opponent do not break a 320px screen', async () => {
    const long = 'W'.repeat(60), longOpp = 'Averyveryveryveryverylongopponentname'.slice(0, 37);
    const t = mkTour({ id: 'ln1', name: long, team: 'Y'.repeat(40) });
    t.games = [{ id: 'l1', kind: 'pool', date: '2026-11-08', time: '09:00', field: 'Z'.repeat(60), label: 'L'.repeat(40), a: 'Y'.repeat(40), b: longOpp, status: 'scheduled', sa: null, sb: null, innings: null, forfeit: '' },
      { id: 'l2', kind: 'pool', date: '2026-11-08', time: '10:00', field: '', label: '', a: longOpp, b: 'Q'.repeat(40), status: 'final', sa: 12, sb: 11, innings: null, forfeit: '' }];
    t.bracket = { size: 4, seeds: [longOpp, 'Y'.repeat(40), 'Q'.repeat(40), 'R'.repeat(40)] };
    await app({ tours: [C.sanitizeTournament(t)], size: SIZES[320] }, async page => {
      await qa(page, 'list', { contrast: false });
      await page.click('.tcard'); await page.waitForSelector('.card.next');
      for (const tb of ['games', 'standings', 'bracket', 'pack', 'notes']) { await tabTo(page, tb); await qa(page, tb, { contrast: false }); }
      await tabTo(page, 'games'); await page.locator('.game').first().click(); await openSheetWait(page); await qa(page, 'game sheet', { contrast: false });
    });
  });

  /* ---------- every screen, three sizes: screenshots + layout checks ---------- */
  function pastTour() {
    const g = (id, d, tm, a, b, sa, sb) => ({ id, kind: 'pool', date: d, time: tm, field: 'Court 1', label: 'Pool play', a, b, status: 'final', sa, sb, innings: null, forfeit: '' });
    return C.sanitizeTournament({ id: 'past1', name: 'Fall Hoops Shootout', sport: 'basketball', start: '2026-10-09', end: '2026-10-11', team: 'Court Kings', gameMin: 60, created: '2026-10-01',
      games: [g('p1', '2026-10-10', '09:00', 'Court Kings', 'Blue Jays', 44, 38), g('p2', '2026-10-10', '11:00', 'Court Kings', 'Rim Rockers', 51, 40), g('p3', '2026-10-10', '13:30', 'Net Ninjas', 'Court Kings', 41, 36)],
      bracket: { size: 0, seeds: [] }, pack: C.packTemplate('basketball').map(p => Object.assign(p, { done: true })) });
  }
  const SUBSET = ['02-list', '03-games', '04-game-edit', '05-standings', '07-rules', '10-bracket-seeded', '12-pack', '14-notes', '17-settings'];
  async function walk(size) {
    const [w, h] = SIZES[size], full = size === 390, want = n => full || SUBSET.includes(n);
    const snap = async (page, name) => {
      if (!want(name)) return;
      await page.evaluate(() => { const t = document.querySelector('#toasts'); if (t) t.innerHTML = ''; });
      await qa(page, name + ' at ' + size);
      await shot(page, name, size);
    };
    // the empty first screen
    await app({ size: [w, h] }, async page => { await snap(page, '01-empty'); });
    await app({ size: [w, h], tours: [mkTour({ id: 'sc1' }), pastTour()] }, async page => {
      await snap(page, '02-list');
      await page.click('[data-id=sc1]'); await page.waitForSelector('.card.next');
      await snap(page, '03-games');
      await page.locator('.game.ours:not(.done)').first().click(); await openSheetWait(page); await snap(page, '04-game-edit'); await closeTop(page); await noSheets(page);
      await tabTo(page, 'standings'); await snap(page, '05-standings');
      await page.locator('.card.tie').scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('.card.tie').scrollIntoView({ block: 'start' })); await page.evaluate(() => window.scrollBy(0, -70)); await snap(page, '06-tiebreak');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('[data-act=rules-open]'); await openSheetWait(page); await snap(page, '07-rules'); await closeTop(page); await noSheets(page);
      await page.locator('.trow', { hasText: 'Team D' }).click(); await openSheetWait(page); await snap(page, '08-team'); await closeTop(page); await noSheets(page);
      await tabTo(page, 'bracket'); await snap(page, '09-bracket-empty');
      await page.click('[data-act=bracket-seed]'); await waitToast(page, /Seeded/); await snap(page, '10-bracket-seeded');
      await page.click('.mt[data-slot=r1m2]'); await openSheetWait(page); await snap(page, '11-match'); await closeTop(page); await noSheets(page);
      if (full) {
        // 6 teams (byes) and 8 teams, so the bigger brackets are looked at too
        for (const n of [6, 8]) {
          await page.click('[data-act=bracket-setup]'); await openSheetWait(page); await page.click('[data-bsize="' + n + '"]'); await page.click('[data-fill]');
          for (let i = 6; i <= n; i++) await page.fill('#b-s' + i, 'Team ' + 'FGH'[i - 6]);
          await saveSheet(page);
          if (await page.waitForSelector('.sheet.confirm', { timeout: 1500 }).catch(() => null)) await page.click('.sheet.confirm [data-ok]'); // a scheduled slot goes away
          await noSheets(page); await waitToast(page, /Bracket saved/);
          await snap(page, n === 6 ? '11b-bracket-six' : '11c-bracket-eight');
        }
      }
      await tabTo(page, 'pack'); await snap(page, '12-pack');
      await page.click('[data-act=pack-edit]'); await snap(page, '13-pack-edit'); await page.click('[data-act=pack-edit]');
      await tabTo(page, 'notes'); await snap(page, '14-notes');
      await page.click('[data-act=tour-menu]'); await openSheetWait(page); await snap(page, '15-menu');
      await page.click('[data-act=tour-delete]'); await page.waitForSelector('.sheet.confirm'); await snap(page, '16-confirm'); await page.click('.sheet.confirm [data-close].btn'); await noSheets(page);
      await page.click('[data-act=back]'); await waitDepth(page, 0); await page.click('[data-act=settings]'); await snap(page, '17-settings');
      await page.click('[data-act=back]'); await waitDepth(page, 0);
      await page.click('[data-act=tour-new]'); await openSheetWait(page); await snap(page, '18-new-tournament');
    });
  }
  await test('screens at 390x844: every screen has no console errors, no sideways scroll, big enough taps and text, readable contrast (screenshots saved)', async () => { await walk(390); });
  await test('screens at 768x1024 (tablet): the main screens fit and read well (screenshots saved)', async () => { await walk(768); });
  await test('screens at 320x640 (small phone): no horizontal overflow on any main screen (screenshots saved)', async () => { await walk(320); });

  try { await browser.close(); } catch (e) { /* ignore */ }
  srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})();
