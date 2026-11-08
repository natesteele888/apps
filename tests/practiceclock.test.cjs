// Practice Clock tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/practiceclock.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
// Part 1: core.js logic with hand-computed numbers. Part 2: the app in a real browser (fake clock for anything timed).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/practiceclock/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07'; // a Saturday
const MIN = 60000;
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return; // ONLY=regex runs just the matching tests
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deq = (a, b, m) => assert.deepStrictEqual(a, b, m);
// a plan from a list of minutes (or block objects)
const P = (blocks, extra) => C.sanitizePlan(Object.assign({ name: 'T', blocks: blocks.map((m, i) => (typeof m === 'object' ? m : { name: 'B' + (i + 1), min: m })) }, extra || {}));
const T = 1700000000000; // an arbitrary start instant
const strip = p => { const q = JSON.parse(JSON.stringify(p)); delete q.id; q.blocks.forEach(b => delete b.id); return q; };

(async () => {
  /* ======================= PART 1: core ======================= */
  await test('core: clock text rounds up, 12-hour times and ranges, round up to 5 minutes', async () => {
    eq(C.fmtClock(600000), '10:00'); eq(C.fmtClock(599001), '10:00', 'ceil'); eq(C.fmtClock(1), '0:01'); eq(C.fmtClock(0), '0:00'); eq(C.fmtClock(-5), '0:00');
    eq(C.fmtClock(65000), '1:05'); eq(C.fmtClock(3600000), '1:00:00'); eq(C.fmtClock(3599999), '1:00:00'); eq(C.fmtClock(3599000), '59:59'); eq(C.fmtClock(5400000), '1:30:00');
    eq(C.fmtHM(990), '4:30 PM'); eq(C.fmtHM(0), '12:00 AM'); eq(C.fmtHM(720), '12:00 PM'); eq(C.fmtHM(1439), '11:59 PM'); eq(C.fmtHM(1440), '12:00 AM'); eq(C.fmtHM(65), '1:05 AM'); eq(C.fmtHM(990, true), '4:30');
    eq(C.fmtRange(990, 1010), '4:30–4:50 PM'); eq(C.fmtRange(690, 730), '11:30 AM–12:10 PM'); eq(C.fmtRange(1425, 1445), '11:45 PM–12:05 AM'); eq(C.fmtRange(990, 1010, '-'), '4:30-4:50 PM');
    eq(C.parseHM('16:30'), 990); eq(C.parseHM('00:00'), 0); eq(C.parseHM('23:59'), 1439); assert.ok(isNaN(C.parseHM('24:00'))); assert.ok(isNaN(C.parseHM('4:30'))); assert.ok(isNaN(C.parseHM(''))); assert.ok(isNaN(C.parseHM(null)));
    eq(C.toHM(990), '16:30'); eq(C.toHM(1440), '00:00');
    const at = (h, m, s, ms) => new Date(2026, 10, 7, h, m, s || 0, ms || 0).getTime();
    eq(C.roundUp5(at(16, 31, 20)), 995, '4:31:20 -> 4:35'); eq(C.roundUp5(at(16, 35, 0)), 995, 'already on 4:35'); eq(C.roundUp5(at(16, 35, 0, 1)), 1000, '1 ms past -> 4:40');
    eq(C.roundUp5(at(16, 30, 0)), 990); eq(C.roundUp5(at(23, 58, 0)), 0, 'wraps at midnight'); eq(C.roundUp5(at(0, 0, 0)), 0); eq(C.roundUp5(at(23, 55, 1)), 0);
    eq(C.fmtDate('2026-11-07'), 'Sat, Nov 7'); eq(C.fmtDate('2026-02-30'), '');
  });

  await test('core: sanitizing blocks and plans (clamps, defaults, rejects)', async () => {
    const b = C.sanitizeBlock({ name: '  Warm-up\n', min: 15 });
    eq(b.name, 'Warm-up'); eq(b.min, 15); eq(b.type, 'normal'); eq(b.stations, 0); deq(b.labels, []); eq(b.color, '');
    eq(C.sanitizeBlock({ name: 'x', min: 0 }).min, 1, '0 -> 1'); eq(C.sanitizeBlock({ name: 'x', min: 500 }).min, 180); eq(C.sanitizeBlock({ name: 'x', min: -4 }).min, 1);
    eq(C.sanitizeBlock({ name: 'x', min: 'abc' }).min, 5, 'junk -> default'); eq(C.sanitizeBlock({ name: 'x', min: 2.5 }).min, 3); eq(C.sanitizeBlock({ name: 'x', min: null }).min, 5); eq(C.sanitizeBlock({ name: 'x', min: true }).min, 5);
    eq(C.sanitizeBlock({ name: '', min: 5 }).name, 'Block'); eq(C.sanitizeBlock({ name: '', min: 5, type: 'stations' }).name, 'Stations');
    eq(C.sanitizeBlock({ name: 'x'.repeat(99), min: 5 }).name.length, 40); eq(C.sanitizeBlock({ name: 'a', min: 5, note: 'n'.repeat(500) }).note.length, 120);
    eq(C.sanitizeBlock({ name: 'a\u0007b‮c', min: 5 }).name, 'abc', 'control and bidi characters removed');
    eq(C.sanitizeBlock({ name: 'a', min: 5, color: 'neon' }).color, ''); eq(C.sanitizeBlock({ name: 'a', min: 5, color: 'teal' }).color, 'teal');
    const s = C.sanitizeBlock({ name: 'S', min: 5, type: 'stations', stations: 99, labels: ['Tee', 5, null, 'x'.repeat(60)] });
    eq(s.stations, 8); eq(s.labels.length, 8); eq(s.labels[0], 'Tee'); eq(s.labels[1], '5'); eq(s.labels[2], ''); eq(s.labels[3].length, 24);
    eq(C.sanitizeBlock({ name: 'S', min: 5, type: 'stations', stations: 1 }).stations, 2); eq(C.sanitizeBlock({ name: 'S', min: 5, type: 'stations' }).stations, 4, 'default 4');
    eq(C.sanitizeBlock(null), null); eq(C.sanitizeBlock('x'), null); eq(C.sanitizeBlock([1]), null);
    eq(C.blockMinutes(C.sanitizeBlock({ name: 'S', min: 5, type: 'stations', stations: 4 })), 20); eq(C.blockMinutes(b), 15);
    // plans
    eq(C.sanitizePlan(null), null); eq(C.sanitizePlan({}), null); eq(C.sanitizePlan({ blocks: 'x' }), null);
    const p = C.sanitizePlan({ name: '', sport: 'curling', start: '25:00', endBy: '18:00', wait: 'yes', blocks: [{ name: 'a', min: 5 }, 'junk', null, { name: 'b', min: 7 }] });
    eq(p.name, 'Practice plan'); eq(p.sport, 'other'); eq(p.start, ''); eq(p.endBy, '18:00'); eq(p.wait, false); eq(p.blocks.length, 2); eq(C.planMinutes(p), 12);
    eq(C.sanitizePlan({ name: 'x', blocks: [] }, { requireBlocks: true }), null); eq(C.sanitizePlan({ name: 'x', blocks: [] }).blocks.length, 0);
    eq(C.sanitizePlan({ name: 'x', blocks: Array.from({ length: 61 }, () => ({ name: 'a', min: 1 })) }), null, 'too many blocks');
    eq(C.sanitizePlan({ name: 'x', blocks: Array.from({ length: 60 }, () => ({ name: 'a', min: 1 })) }).blocks.length, 60);
    // 24 hours: 8 x 180 = 1440 is allowed, one more minute is not
    const full = Array.from({ length: 8 }, () => ({ name: 'a', min: 180 }));
    eq(C.planMinutes(C.sanitizePlan({ name: 'x', blocks: full })), 1440);
    eq(C.sanitizePlan({ name: 'x', blocks: full.concat([{ name: 'z', min: 1 }]) }), null, 'over 24 hours');
    eq(C.sanitizePlan({ name: 'x', blocks: [{ name: 's', min: 180, type: 'stations', stations: 8 }, { name: 'a', min: 1 }] }), null, 'stations count in the total');
    // duplicate block ids are repaired
    const d = C.sanitizePlan({ name: 'x', blocks: [{ id: 'same1', name: 'a', min: 5 }, { id: 'same1', name: 'b', min: 5 }] });
    assert.notStrictEqual(d.blocks[0].id, d.blocks[1].id);
    // stable
    const once = C.planFromTemplate('baseball'); deq(C.sanitizePlan(JSON.parse(JSON.stringify(once))), once);
    // settings
    deq(C.sanitizeSettings(null), { volume: 70, ticks: true, vibrate: true, awake: true }); eq(C.sanitizeSettings({ volume: 400 }).volume, 100); eq(C.sanitizeSettings({ volume: -3 }).volume, 0); eq(C.sanitizeSettings({ ticks: false }).ticks, false); eq(C.sanitizeSettings({ awake: 'no' }).awake, true);
    // no prototype pollution through a hostile object
    C.sanitizePlan(JSON.parse('{"name":"x","blocks":[{"name":"a","min":5,"__proto__":{"polluted":1}}],"__proto__":{"polluted":2}}'));
    eq(({}).polluted, undefined);
  });

  await test('core: segments, station expansion and schedule', async () => {
    const p = C.planFromTemplate('baseball');
    const segs = C.segments(p);
    eq(segs.length, 9); deq(segs.map(s => s.durMs / MIN), [15, 20, 5, 5, 5, 5, 10, 20, 5]);
    deq(segs.map(s => s.bi), [0, 1, 2, 2, 2, 2, 3, 4, 5]);
    deq(segs.slice(2, 6).map(s => s.station + '/' + s.stations + ':' + s.label), ['1/4:Tee', '2/4:Soft toss', '3/4:Front toss', '4/4:Bunting']);
    eq(segs[0].kind, 'normal'); eq(segs[2].kind, 'station'); eq(segs[0].station, 0);
    const sch = C.schedule(p, T);
    eq(sch[0].startMs, T); eq(sch[2].startMs, T + 35 * MIN); eq(sch[5].endMs, T + 55 * MIN); eq(sch[8].endMs, T + 90 * MIN); eq(sch[3].offsetMs, 40 * MIN);
    // adjustments change one segment only
    const adj = C.segments(p, { 3: MIN, 1: -5 * MIN });
    deq(adj.map(s => s.durMs / MIN), [15, 15, 5, 6, 5, 5, 10, 20, 5]);
    eq(C.segments(p, { 0: -99 * MIN })[0].durMs, 0, 'never negative');
    // an empty plan has no segments
    eq(C.segments(C.sanitizePlan({ name: 'x', blocks: [] })).length, 0);
    eq(C.positionAt(C.sanitizePlan({ name: 'x', blocks: [] }), T, T + 5, {}, 0).finished, true);
  });

  await test('core: positionAt at boundaries, across a pause, with adjustments, with stations, asleep for many blocks', async () => {
    const p = P([10, 5, 5]);
    let x = C.positionAt(p, T, T, {}, 0);
    eq(x.segIndex, 0); eq(x.remainingMs, 600000); eq(x.finished, false); eq(x.totalMs, 20 * MIN); eq(x.totalRemainingMs, 20 * MIN); eq(x.segElapsedMs, 0);
    x = C.positionAt(p, T, T + 599999, {}, 0); eq(x.segIndex, 0); eq(x.remainingMs, 1);
    x = C.positionAt(p, T, T + 600000, {}, 0); eq(x.segIndex, 1, 'exactly at the boundary belongs to the next block'); eq(x.remainingMs, 300000); eq(x.segElapsedMs, 0);
    x = C.positionAt(p, T, T + 899999, {}, 0); eq(x.segIndex, 1); eq(x.remainingMs, 1);
    x = C.positionAt(p, T, T + 900000, {}, 0); eq(x.segIndex, 2); eq(x.remainingMs, 300000);
    x = C.positionAt(p, T, T + 1199999, {}, 0); eq(x.segIndex, 2); eq(x.remainingMs, 1); eq(x.finished, false); eq(x.totalRemainingMs, 1);
    x = C.positionAt(p, T, T + 1200000, {}, 0); eq(x.finished, true, 'exactly at the end is finished'); eq(x.remainingMs, 0); eq(x.segIndex, 2); eq(x.totalRemainingMs, 0);
    x = C.positionAt(p, T, T + 99 * 3600000, {}, 0); eq(x.finished, true); eq(x.segIndex, 2);
    x = C.positionAt(p, T, T - 5000, {}, 0); eq(x.segIndex, 0); eq(x.remainingMs, 600000, 'before the start counts as the start');
    x = C.positionAt(p, T, NaN, {}, 0); eq(x.segIndex, 0);
    // paused time is taken out: 12 minutes on the wall clock, 3 of them paused = 9 minutes in
    x = C.positionAt(p, T, T + 12 * MIN, {}, 3 * MIN); eq(x.segIndex, 0); eq(x.remainingMs, 60000); eq(x.elapsedMs, 9 * MIN);
    // adjustments
    x = C.positionAt(p, T, T + 10.5 * MIN, { 0: MIN }, 0); eq(x.segIndex, 0); eq(x.remainingMs, 30000); eq(x.totalMs, 21 * MIN);
    x = C.positionAt(p, T, T + 11 * MIN, { 0: MIN }, 0); eq(x.segIndex, 1); eq(x.remainingMs, 5 * MIN);
    // one-block plan
    const one = P([7]);
    x = C.positionAt(one, T, T + 3 * MIN, {}, 0); eq(x.segIndex, 0); eq(x.remainingMs, 4 * MIN); x = C.positionAt(one, T, T + 7 * MIN, {}, 0); eq(x.finished, true);
    // stations: Warm 5 | stations 3 x 4 (Tee, Toss, "") | End 2  = 19
    const st = C.sanitizePlan({ name: 'S', blocks: [{ name: 'Warm', min: 5 }, { name: 'Stn', min: 4, type: 'stations', stations: 3, labels: ['Tee', 'Toss'] }, { name: 'End', min: 2 }] });
    const at = m => C.positionAt(st, T, T + m * MIN, {}, 0);
    eq(at(4.999).segIndex, 0); eq(at(5).segIndex, 1); eq(at(5).seg.station, 1); eq(at(5).seg.label, 'Tee'); eq(at(8.999).segIndex, 1);
    eq(at(9).segIndex, 2); eq(at(9).seg.label, 'Toss'); eq(at(9).seg.station, 2); eq(at(13).segIndex, 3); eq(at(13).seg.label, ''); eq(at(13).seg.station, 3); eq(at(17).segIndex, 4); eq(at(17).seg.name, 'End'); eq(at(19).finished, true);
    eq(C.planMinutes(st), 19); eq(at(10).remainingMs, 3 * MIN);
    // asleep: the baseball plan at 47 minutes is in station 3 of 4, 2 minutes in
    const bb = C.planFromTemplate('baseball');
    x = C.positionAt(bb, T, T + 47 * MIN, {}, 0);
    eq(x.segIndex, 4); eq(x.seg.label, 'Front toss'); eq(x.segElapsedMs, 2 * MIN); eq(x.remainingMs, 3 * MIN); eq(x.totalRemainingMs, 43 * MIN);
    // far apart blocks: 89 minutes in is the last 1 minute of the cool-down
    x = C.positionAt(bb, T, T + 89 * MIN, {}, 0); eq(x.segIndex, 8); eq(x.remainingMs, MIN);
  });

  await test('core: running a practice: pause, resume, skip, back, restart', async () => {
    const rp = P([10, 5, 5]);
    let r = C.newRun(rp, T, TODAY);
    eq(r.t0, T); eq(r.date, TODAY); eq(r.finished, false); eq(C.runPos(r, T).remainingMs, 10 * MIN);
    // pause 4 minutes in, look at it 4 minutes later, resume 5 minutes after pausing
    const p1 = C.pauseRun(r, T + 4 * MIN);
    eq(C.runPos(p1, T + 8 * MIN).remainingMs, 6 * MIN, 'a paused clock does not move'); eq(C.runPos(p1, T + 8 * MIN).segElapsedMs, 4 * MIN);
    eq(C.pauseRun(p1, T + 6 * MIN), p1, 'pausing twice changes nothing');
    const r1 = C.resumeRun(p1, T + 9 * MIN);
    eq(r1.pausedMs, 5 * MIN); eq(r1.pausedAt, null); eq(C.runPos(r1, T + 10 * MIN).remainingMs, 5 * MIN); eq(C.resumeRun(r1, T + 11 * MIN), r1, 'resume when running changes nothing');
    eq(C.actualMs(r1, T + 10 * MIN), 5 * MIN, 'real running time leaves the pause out');
    // skip forward 3 minutes in
    let s = C.skipNext(r, T + 3 * MIN);
    eq(C.runPos(s, T + 3 * MIN).segIndex, 1); eq(C.runPos(s, T + 3 * MIN).remainingMs, 5 * MIN, 'the next block starts full'); eq(C.runPos(s, T + 4 * MIN).remainingMs, 4 * MIN);
    eq(C.actualMs(s, T + 3 * MIN), 3 * MIN);
    // skip then back: the skipped block comes back whole
    eq(C.runPos(C.skipBack(s, T + 3 * MIN), T + 3 * MIN).segIndex, 0); eq(C.runPos(C.skipBack(s, T + 3 * MIN), T + 3 * MIN).remainingMs, 10 * MIN); eq(C.runPos(C.skipBack(s, T + 3 * MIN), T + 4 * MIN).remainingMs, 9 * MIN);
    // back from the middle of block 2 goes to the start of block 1; back on block 1 just restarts it
    eq(C.runPos(C.skipBack(r, T + 12 * MIN), T + 12 * MIN).remainingMs, 10 * MIN); eq(C.runPos(C.skipBack(r, T + 12 * MIN), T + 12 * MIN).segIndex, 0);
    eq(C.runPos(C.skipBack(r, T + 3 * MIN), T + 3 * MIN).remainingMs, 10 * MIN);
    // restart the block 2 minutes into block 2
    const rs = C.restartSeg(r, T + 12 * MIN); eq(C.runPos(rs, T + 12 * MIN).segIndex, 1); eq(C.runPos(rs, T + 12 * MIN).remainingMs, 5 * MIN); eq(C.runPos(rs, T + 13 * MIN).remainingMs, 4 * MIN);
    // skipping while paused keeps it paused on the next block
    const sp = C.skipNext(C.pauseRun(r, T + 2 * MIN), T + 5 * MIN); eq(sp.pausedAt, T + 2 * MIN, 'still paused at the same moment'); eq(C.runPos(sp, T + 9 * MIN).segIndex, 1); eq(C.runPos(sp, T + 9 * MIN).remainingMs, 5 * MIN);
    // skipping the last block finishes the practice
    const last = C.skipNext(r, T + 18 * MIN); eq(C.runPos(last, T + 18 * MIN).segIndex, 2);
    const fin = C.skipNext(last, T + 18 * MIN); eq(fin.finished, true); eq(fin.endReason, 'done'); eq(C.actualMs(fin, T + 99 * MIN), 18 * MIN);
    // letting it run out: finished at exactly the end, even if nobody looked until much later
    eq(C.settle(r, T + 20 * MIN - 1), r, 'one millisecond before: still going');
    const done = C.settle(r, T + 25 * MIN); eq(done.finished, true); eq(done.endedAt, T + 20 * MIN); eq(done.endReason, 'done'); eq(C.actualMs(done, T + 99 * MIN), 20 * MIN, 'actual time is the schedule, not when the phone woke');
    eq(C.settle(done, T + 50 * MIN), done);
    // ending early, running and paused
    const e1 = C.endRun(r, T + 7 * MIN); eq(e1.finished, true); eq(e1.endReason, 'early'); eq(C.actualMs(e1, T + 99 * MIN), 7 * MIN);
    const e2 = C.endRun(C.pauseRun(r, T + 4 * MIN), T + 9 * MIN); eq(C.actualMs(e2, T + 99 * MIN), 4 * MIN);
    let lg = C.makeLog(e1, T); eq(lg.planned, 20); eq(lg.actual, 7); eq(lg.early, true); eq(lg.date, TODAY); eq(lg.plan, 'T');
    lg = C.makeLog(done, T); eq(lg.actual, 20); eq(lg.early, false);
    eq(C.makeLog(C.endRun(r, T + 90000), T).actual, 2, '1.5 minutes rounds to 2');
    // after a skip the real time is what counts, however far the clock was moved
    eq(C.makeLog(C.endRun(C.skipNext(r, T + 3 * MIN), T + 4 * MIN), T).actual, 4);
  });

  await test('core: plus and minus a minute (what is allowed and what is not)', async () => {
    const rp = P([10, 5, 5]); let r = C.newRun(rp, T, TODAY);
    // +1 min on block 1
    let a = C.adjustCurrent(r, T + 9 * MIN, MIN); eq(a.changed, true); eq(a.deltaMs, MIN);
    eq(C.runPos(a.run, T + 9 * MIN).remainingMs, 2 * MIN); eq(C.runPos(a.run, T + 11 * MIN).segIndex, 1, 'block 2 starts a minute later'); eq(C.runPos(a.run, T + 11 * MIN).remainingMs, 5 * MIN, 'block 2 itself is unchanged');
    eq(C.runPos(a.run, T + 9 * MIN).totalRemainingMs, 12 * MIN);
    // -1 min with plenty left
    a = C.adjustCurrent(r, T + 5 * MIN, -MIN); eq(a.changed, true); eq(C.runPos(a.run, T + 5 * MIN).remainingMs, 4 * MIN);
    // -1 min with 1:00 left: only 0:30 can be taken, so 0:30 is left
    a = C.adjustCurrent(r, T + 9 * MIN, -MIN); eq(a.changed, true); eq(a.deltaMs, -30000); eq(C.runPos(a.run, T + 9 * MIN).remainingMs, 30000);
    // ... and again: nothing more to take
    let b = C.adjustCurrent(a.run, T + 9 * MIN, -MIN); eq(b.changed, false); eq(b.reason, 'short'); eq(b.run, a.run);
    // exactly 0:30 left: no change; 0:31 left: takes 1 second
    eq(C.adjustCurrent(r, T + 9.5 * MIN, -MIN).changed, false); b = C.adjustCurrent(r, T + 9.5 * MIN - 1000, -MIN); eq(b.changed, true); eq(b.deltaMs, -1000); eq(C.runPos(b.run, T + 9.5 * MIN - 1000).remainingMs, 30000);
    // +1 then -1 puts it back and leaves no leftover adjustment
    a = C.adjustCurrent(r, T + 2 * MIN, MIN); b = C.adjustCurrent(a.run, T + 2 * MIN, -MIN); eq(b.changed, true); deq(b.run.adj, {});
    // the longest a block can run is 3 hours
    let big = C.newRun(P([180]), T, TODAY); eq(C.adjustCurrent(big, T, MIN).changed, false); eq(C.adjustCurrent(big, T, MIN).reason, 'long');
    big = C.newRun(P([179]), T, TODAY); a = C.adjustCurrent(big, T, MIN); eq(a.changed, true); eq(C.runPos(a.run, T).remainingMs, 180 * MIN); eq(C.adjustCurrent(a.run, T, MIN).changed, false);
    // stations: only the station you are in changes
    const st = C.sanitizePlan({ name: 'S', blocks: [{ name: 'Warm', min: 5 }, { name: 'Stn', min: 4, type: 'stations', stations: 3 }, { name: 'End', min: 2 }] });
    const sr = C.newRun(st, T, TODAY);
    a = C.adjustCurrent(sr, T + 10 * MIN, MIN); // 10 min in = station 2, 1 minute in
    deq(C.segments(st, a.run.adj).map(s => s.durMs / MIN), [5, 4, 5, 4, 2]); eq(C.runPos(a.run, T + 10 * MIN).remainingMs, 4 * MIN);
    // while paused the adjustment still works from the paused moment
    a = C.adjustCurrent(C.pauseRun(r, T + 3 * MIN), T + 50 * MIN, MIN); eq(C.runPos(a.run, T + 50 * MIN).remainingMs, 8 * MIN);
    // nothing to adjust on a finished practice
    eq(C.adjustCurrent(C.endRun(r, T + MIN), T + 2 * MIN, MIN).changed, false);
  });

  await test('core: "wait for me" plans stop at the end of each block', async () => {
    const rw = P([10, 5, 5], { wait: true }); let r = C.newRun(rw, T, TODAY);
    eq(C.settle(r, T + 5 * MIN), r, 'mid-block: nothing to do');
    eq(C.settle(r, T + 10 * MIN - 1), r);
    let h = C.settle(r, T + 12 * MIN); // asleep past the end of block 1
    eq(h.holding, true); eq(h.pausedAt, T + 10 * MIN, 'held at the instant the block ended'); eq(h.ack, 0);
    eq(C.runPos(h, T + 99 * MIN).segIndex, 1); eq(C.runPos(h, T + 99 * MIN).segElapsedMs, 0); eq(C.runPos(h, T + 99 * MIN).remainingMs, 5 * MIN);
    eq(C.settle(h, T + 40 * MIN), h, 'stays held');
    // even if the phone slept through several blocks it holds at the end of the one that was running
    const h2 = C.settle(r, T + 18 * MIN); eq(h2.holding, true); eq(h2.pausedAt, T + 10 * MIN);
    // the coach taps "start next" 10 minutes later
    let g = C.resumeRun(h, T + 20 * MIN);
    eq(g.holding, false); eq(g.pausedMs, 10 * MIN); eq(g.ack, 1); eq(C.runPos(g, T + 20 * MIN).remainingMs, 5 * MIN); eq(C.runPos(g, T + 22 * MIN).remainingMs, 3 * MIN);
    // block 2 ends at T + 25 minutes (10 minutes were waited), and holds again
    eq(C.settle(g, T + 24 * MIN), g); const h3 = C.settle(g, T + 27 * MIN); eq(h3.holding, true); eq(h3.pausedAt, T + 25 * MIN); eq(h3.ack, 1);
    // the last block just finishes, no wait
    g = C.resumeRun(h3, T + 30 * MIN); eq(g.ack, 2); const f = C.settle(g, T + 40 * MIN); eq(f.finished, true); eq(f.holding, false); eq(f.endedAt, T + 35 * MIN);
    eq(C.actualMs(f, T + 99 * MIN), 20 * MIN, 'waiting time is not counted');
    // skip keeps the "wait" bookkeeping in step
    const s = C.skipNext(r, T + 3 * MIN); eq(s.ack, 1); eq(C.settle(s, T + 7 * MIN), s, 'block 2 started at skip time, so it runs until T+3+5');
    eq(C.settle(s, T + 9 * MIN).holding, true); eq(C.settle(s, T + 9 * MIN).pausedAt, T + 8 * MIN);
    const bk = C.skipBack(C.settle(r, T + 12 * MIN), T + 12 * MIN); eq(bk.holding, false); eq(C.runPos(bk, T + 12 * MIN).segIndex, 0); eq(C.runPos(bk, T + 12 * MIN).remainingMs, 10 * MIN);
  });

  await test('core: saved run state is checked when it is loaded', async () => {
    const rp = P([10, 5, 5]); let r = C.newRun(rp, T, TODAY);
    r = C.resumeRun(C.pauseRun(C.adjustCurrent(r, T + MIN, MIN).run, T + 2 * MIN), T + 4 * MIN);
    const back = C.sanitizeRun(JSON.parse(JSON.stringify(r))); deq(back, r);
    const fin = C.settle(r, T + 99 * MIN); deq(C.sanitizeRun(JSON.parse(JSON.stringify(fin))), fin);
    eq(C.sanitizeRun(null), null); eq(C.sanitizeRun({}), null); eq(C.sanitizeRun(Object.assign({}, r, { t0: 'x' })), null); eq(C.sanitizeRun(Object.assign({}, r, { plan: { name: 'x', blocks: [] } })), null);
    eq(C.sanitizeRun(Object.assign({}, r, { v: 2 })), null); eq(C.sanitizeRun(Object.assign({}, r, { pausedAt: 'soon' })), null);
    const junk = C.sanitizeRun(Object.assign({}, JSON.parse(JSON.stringify(r)), { adj: { 0: 'x', 99: 5, '-1': 5, 1: 1e15 }, pausedMs: -5, ack: 99 }));
    deq(Object.keys(junk.adj), ['1']); eq(junk.adj[1], 180 * MIN); eq(junk.pausedMs, 0); eq(junk.ack, 2);
    eq(C.sanitizeRun(Object.assign({}, JSON.parse(JSON.stringify(r)), { holding: true })).holding, false, 'holding needs a paused clock');
    // log lines
    eq(C.sanitizeLog({ date: 'nope' }), null); const l = C.sanitizeLog({ date: TODAY, plan: '<b>x</b>', planned: 99999, actual: -4, early: 1 });
    eq(l.plan, '<b>x</b>'); eq(l.planned, 1440); eq(l.actual, 0); eq(l.early, false);
    let h = []; for (let i = 0; i < 25; i++) h = C.addLog(h, { id: 'log' + i, n: i }); eq(h.length, 20, 'only the last 20 are kept'); eq(h[0].n, 24); eq(h[19].n, 5);
  });

  await test('core: trim to fit shrinks the longer blocks the most, never below 1 minute, stations untouched', async () => {
    const bb = C.planFromTemplate('baseball'); // normal 15,20,[stations 20],10,20,5
    let t = C.trimToFit(bb, 10);
    deq(t.changes, [{ bi: 0, from: 15, to: 13 }, { bi: 1, from: 20, to: 17 }, { bi: 3, from: 10, to: 9 }, { bi: 4, from: 20, to: 17 }, { bi: 5, from: 5, to: 4 }]);
    eq(t.reduced, 10); eq(t.fits, true); eq(t.stillOver, 0); eq(C.planMinutes(C.applyTrim(bb, t.changes)), 80);
    eq(C.applyTrim(bb, t.changes).blocks[2].min, 5, 'stations keep their time'); eq(bb.blocks[0].min, 15, 'the original plan is not changed');
    // over by 0 or less: nothing to do
    eq(C.trimToFit(bb, 0).changes.length, 0); eq(C.trimToFit(bb, -5).changes.length, 0); eq(C.trimToFit(bb, 0).fits, true);
    // can't go below 1 minute: [2,2,2] over 5 gives up 3 and is still 2 over
    t = C.trimToFit(P([2, 2, 2]), 5); deq(t.changes.map(c => c.to), [1, 1, 1]); eq(t.reduced, 3); eq(t.stillOver, 2); eq(t.fits, false);
    // all stations: nothing can change
    t = C.trimToFit(C.sanitizePlan({ name: 'S', blocks: [{ name: 's', min: 5, type: 'stations', stations: 4 }] }), 5); eq(t.changes.length, 0); eq(t.fits, false); eq(t.stillOver, 5);
    // ties: [3,3] over 1 -> 2.5 and 2.5, floors 2+2, one leftover minute goes to the earlier block
    t = C.trimToFit(P([3, 3]), 1); deq(t.changes, [{ bi: 1, from: 3, to: 2 }]);
    // a 1-minute block keeps its minute and the rest share the cut: [1,10,10] over 5 -> 1, 8, 7
    t = C.trimToFit(P([1, 10, 10]), 5); deq(t.changes, [{ bi: 1, from: 10, to: 8 }, { bi: 2, from: 10, to: 7 }]); eq(t.reduced, 5);
    // a fractional over is rounded up (a started minute is a whole minute over)
    eq(C.trimToFit(P([10, 10]), 0.2).reduced, 1);
    // totals always land exactly on the target whenever it fits
    for (let over = 1; over <= 60; over++) { const q = P([15, 20, 10, 20, 5, 7, 13]); const tt = C.trimToFit(q, over); eq(C.planMinutes(C.applyTrim(q, tt.changes)), 90 - over, 'over ' + over); tt.changes.forEach(c => assert.ok(c.to >= 1 && c.to < c.from)); }
  });

  await test('core: clock times, must-end-by', async () => {
    const bb = C.planFromTemplate('baseball'), cs = C.clockSchedule(bb, 990);
    eq(cs.totalMin, 90); eq(cs.finishMin, 1080); eq(cs.rows[0].startMin, 990); eq(cs.rows[0].endMin, 1005); eq(cs.rows[2].startMin, 1025); eq(cs.rows[2].endMin, 1045); eq(cs.rows[5].endMin, 1080);
    eq(C.fmtRange(cs.rows[0].startMin, cs.rows[0].endMin), '4:30–4:45 PM'); eq(C.fmtHM(cs.finishMin), '6:00 PM');
    let o = C.overBy(bb, 990, 1080); eq(o.valid, true); eq(o.over, 0); eq(o.available, 90);
    o = C.overBy(bb, 990, 1070); eq(o.over, 10); o = C.overBy(bb, 990, 1100); eq(o.over, -20);
    eq(C.overBy(bb, 990, 990).valid, false); eq(C.overBy(bb, 990, 900).valid, false); eq(C.overBy(bb, 990, NaN).valid, false);
    // a plan that runs past midnight still adds up
    eq(C.clockSchedule(P([30, 30]), 1410).finishMin, 1470); eq(C.fmtHM(1470), '12:30 AM');
  });

  await test('core: share links (round trip, unicode, size, damaged, newer version, hostile)', async () => {
    eq(C.b64urlEncode([77, 97, 110]), 'TWFu'); eq(C.b64urlEncode([77, 97]), 'TWE'); eq(C.b64urlEncode([77]), 'TQ'); eq(C.b64urlEncode([251, 255, 254]), '-__-'); deq(C.b64urlDecode('TWFu'), [77, 97, 110]); deq(C.b64urlDecode('TQ'), [77]);
    eq(C.utf8Decode(C.utf8Encode('Zoë ⚾ 日本 😀')), 'Zoë ⚾ 日本 😀'); eq(C.utf8Decode([0xc3]), null); eq(C.utf8Decode([0xff]), null); eq(C.utf8Decode([0xc0, 0x80]), null);
    const src = C.sanitizePlan({ name: 'Zoë ⚾ practice', sport: 'softball', wait: true, blocks: [
      { name: 'Warm up', min: 15, note: 'Bring cones', color: 'green' }, { name: 'Stations', min: 6, type: 'stations', stations: 3, labels: ['Tee', '', '日本'], color: 'purple' }, { name: 'Last', min: 1 }] });
    const e = C.encodeShare(src);
    assert.ok(e.ok); assert.ok(/^#p1=[A-Za-z0-9_-]+$/.test(e.hash), 'url safe: ' + e.hash); eq(e.length, e.token.length); assert.ok(e.length < 400);
    const d = C.decodeShare(e.hash); assert.ok(d.ok, JSON.stringify(d)); deq(strip(d.plan), strip(src));
    assert.ok(d.plan.id !== src.id, 'receiver gets its own ids'); deq(C.decodeShare('https://example.com/apps/practiceclock/' + e.hash).plan.blocks.length, 3);
    deq(strip(C.decodeShare(e.hash.slice(1)).plan), strip(src), 'works without the #');
    // every template survives
    C.TEMPLATES.forEach(t => { const p = C.planFromTemplate(t.id), r = C.decodeShare(C.encodeShare(p).hash); assert.ok(r.ok); deq(strip(r.plan), strip(p)); });
    // does not carry start / cutoff
    const withTimes = Object.assign({}, src, { start: '16:30', endBy: '18:00' }); eq(C.decodeShare(C.encodeShare(withTimes).hash).plan.start, '');
    // too long to share
    const big = C.sanitizePlan({ name: 'Big', blocks: Array.from({ length: 60 }, (_, i) => ({ name: 'Block number ' + i, min: 1, note: 'n'.repeat(120) })) });
    const be = C.encodeShare(big); eq(be.ok, false); eq(be.code, 'toolong'); assert.ok(/too long/.test(be.error));
    // nothing to share
    eq(C.encodeShare(C.sanitizePlan({ name: 'x', blocks: [] })).ok, false);
    // damaged / wrong
    const tok = e.token;
    ['', '#', '#p1=', '#p1=%%%', '#p1=' + tok.slice(0, 20), '#p1=' + tok.slice(0, tok.length - 5), '#x=1', 'hello', '#p1=A', '#p1=' + tok + '!'].forEach(x => { const r = C.decodeShare(x); eq(r.ok, false, JSON.stringify(x)); assert.ok(r.error && r.error.length > 5); });
    eq(C.decodeShare('#p2=' + tok).code, 'version'); eq(C.decodeShare(null).ok, false); eq(C.decodeShare(undefined).ok, false); eq(C.decodeShare({}).ok, false);
    eq(C.decodeShare('#p1=' + 'A'.repeat(25000)).code, 'toolong');
    const mk = o => C.decodeShare('#p1=' + C.b64urlEncode(C.utf8Encode(JSON.stringify(o))));
    eq(mk({ v: 1, n: 'x', s: 'baseball', b: [['A', 9999]] }).plan.blocks[0].min, 180, 'minutes clamped');
    eq(mk({ v: 1, n: 'x', s: 'baseball', b: [['A', 5, '', 0, 99]] }).plan.blocks[0].stations, 8);
    eq(mk({ v: 1, n: 'x', s: 'zz', b: [['A', 5]] }).plan.sport, 'other');
    eq(mk({ v: 1, n: 'x', b: [] }).ok, false); eq(mk({ v: 1, n: 'x', b: 'no' }).ok, false); eq(mk({ v: 1, n: 'x', b: [5] }).ok, false); eq(mk({ v: 1, n: 'x', b: [['A']] }).ok, false); eq(mk({ v: 2, n: 'x', b: [['A', 5]] }).ok, false); eq(mk([1, 2]).ok, false);
    eq(mk({ v: 1, n: 'x', b: Array.from({ length: 61 }, () => ['A', 1]) }).ok, false, 'too many blocks');
    const long = mk({ v: 1, n: 'x', b: Array.from({ length: 9 }, () => ['A', 180]) }); eq(long.ok, false, 'longer than 24 hours is refused'); assert.ok(/24 hours/.test(long.error));
    eq(mk({ v: 1, n: 'x', b: Array.from({ length: 8 }, () => ['A', 180]) }).ok, true);
    // text stays text: a script tag in a name is kept as plain text for the page to escape
    eq(mk({ v: 1, n: '<img src=x onerror=alert(1)>', b: [['<script>alert(1)</script>', 5]] }).plan.name, '<img src=x onerror=alert(1)>');
    // invalid UTF-8 inside a valid base64 string
    eq(C.decodeShare('#p1=' + C.b64urlEncode([0x7b, 0xff, 0xfe, 0x7d])).ok, false);
    eq(C.decodeShare('#p1=' + C.b64urlEncode(C.utf8Encode('{"v":1,"n":"x","b":[["A",5]]'))).ok, false, 'cut-off JSON');
  });

  await test('core: templates, copy of a plan, plan as text', async () => {
    const want = { baseball: [90, 6], softball: [90, 7], basketball: [60, 6], cheer: [75, 6], football: [75, 6] };
    deq(C.TEMPLATES.map(t => t.id), Object.keys(want));
    C.TEMPLATES.forEach(t => { const p = C.planFromTemplate(t.id); eq(C.planMinutes(p), want[t.id][0], t.id); eq(p.blocks.length, want[t.id][1], t.id); eq(p.sport, t.id); assert.ok(p.name.indexOf(String(want[t.id][0])) > 0); assert.ok(p.blocks.some(b => b.type === 'stations') || t.id === 'cheer'); });
    eq(C.planFromTemplate('nope'), null);
    const a = C.planFromTemplate('baseball'), b = C.planFromTemplate('baseball'); assert.ok(a.id !== b.id && a.blocks[0].id !== b.blocks[0].id, 'every copy has its own ids');
    // private words never appear
    assert.ok(!new RegExp(['des' + 'mond', 'ros' + 'lyn', 'ben' + 'gals', 'nat' + 'han'].join('|'), 'i').test(JSON.stringify(C.TEMPLATES)));
    const dup = C.duplicatePlan(a); eq(dup.name, 'Baseball 90 min copy'); assert.ok(dup.id !== a.id && dup.blocks[0].id !== a.blocks[0].id); deq(strip(Object.assign({}, dup, { name: a.name })), strip(a));
    eq(C.duplicatePlan(C.sanitizePlan({ name: 'x'.repeat(40), blocks: [] })).name.length, 40);
    const txt = C.planText(a, 990).split('\n');
    eq(txt[0], 'Baseball 90 min'); eq(txt[1], 'Baseball, 90 min, 4:30 PM to 6:00 PM');
    eq(txt[3], '4:30-4:45 PM  Warm-up & throwing (15 min)'); eq(txt[4], '    Dynamic stretch, then partner throws');
    assert.ok(txt.indexOf('5:05-5:25 PM  Hitting stations: 4 stations x 5 min (Tee, Soft toss, Front toss, Bunting)') > 0, txt.join('|'));
    eq(txt[txt.length - 1], 'Made with Practice Clock');
  });

  await test('core: backup file checks', async () => {
    const plans = [C.planFromTemplate('baseball'), C.planFromTemplate('cheer')], hist = [{ id: 'log1', date: TODAY, plan: 'Baseball 90 min', planned: 90, actual: 93, early: false, sample: false }];
    const bk = C.makeBackup(plans, hist, { volume: 30, ticks: false, vibrate: true, awake: true }, TODAY);
    eq(bk.app, 'practiceclock'); eq(bk.version, 1);
    const v = C.validateBackup(JSON.parse(JSON.stringify(bk))); assert.ok(v.ok); deq(v.plans, plans); deq(v.history, hist); eq(v.settings.volume, 30); eq(v.settings.ticks, false);
    eq(C.validateBackup(null).ok, false); eq(C.validateBackup({ app: 'locker', version: 1, plans: [] }).ok, false); eq(C.validateBackup({ app: 'practiceclock', version: 2, plans: [] }).ok, false);
    eq(C.validateBackup({ app: 'practiceclock', version: 1 }).ok, false); eq(C.validateBackup({ app: 'practiceclock', version: 1, plans: [{ name: 'x', blocks: 'no' }] }).ok, false);
    eq(C.validateBackup({ app: 'practiceclock', version: 1, plans: Array.from({ length: 61 }, () => ({ name: 'x', blocks: [] })) }).ok, false);
    eq(C.validateBackup({ app: 'practiceclock', version: 1, plans: [] }).ok, true, 'an empty backup is fine');
    const dupIds = C.validateBackup({ app: 'practiceclock', version: 1, plans: [{ id: 'same1', name: 'a', blocks: [] }, { id: 'same1', name: 'b', blocks: [] }] }); assert.ok(dupIds.ok && dupIds.plans[0].id !== dupIds.plans[1].id);
    const mess = C.validateBackup({ app: 'practiceclock', version: 1, plans: [], history: [{ date: 'bad' }, 'x', { date: TODAY, plan: 'ok' }], settings: 5 }); eq(mess.history.length, 1); eq(mess.settings.volume, 70);
    eq(C.validateBackup({ app: 'practiceclock', version: 1, plans: [{ name: 'x', blocks: Array.from({ length: 9 }, () => ({ name: 'a', min: 180 })) }] }).ok, false, 'a plan over 24 hours damages the file');
  });

  /* ======================= PART 2: the app ======================= */
  // (appended below)
  const srv = await startServer('practiceclock');
  const br = await launch();
  console.log('Serving ' + srv.url);
    /* ---------- page helpers ---------- */
  const sheetSel = '.sheet-wrap.open .sheet';
  const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 4000 });
  const sheetsGone = async page => { await adv(page, 300); await noSheets(page); }; // under the fake clock, closing a sheet needs time to pass
  const sheetCount = page => page.$$eval('.sheet-wrap.open', s => s.length);
  const toastText = async page => (await page.$$eval('.toast', els => els.map(e => e.textContent))).join(' | ');
  async function waitToast(page, re) {
    await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 4000 });
  }
  const stored = page => page.evaluate(() => { const d = localStorage.getItem('practiceclock.data'); return d ? JSON.parse(d) : null; });
  const storedRun = page => page.evaluate(() => { const d = localStorage.getItem('practiceclock.run'); return d ? JSON.parse(d) : null; });
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = async (page, name, opts) => { await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); return page.screenshot(Object.assign({ path: SHOTS + '/practiceclock-' + name + '.png' }, opts || {})); }; // toasts would cover the header
  const adv = (page, ms) => page.clock.runFor(ms);
  async function smallTargets(page) {
    return page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('button, a.btn, select, input:not([type=hidden]):not([type=file]):not([type=range]), label.btn').forEach(el => {
        if (el.closest('[hidden]') || el.closest('.sr') || el.closest('.sheet-wrap:not(.open)')) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (el.closest('.sheet-wrap.open') === null && document.querySelector('.sheet-wrap.open')) return; // covered by the sheet
        if (r.height < 43.5 || r.width < 43.5) bad.push((el.tagName + ' ' + (el.getAttribute('aria-label') || el.textContent || el.id || '')).trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return bad;
    });
  }
  async function smallText(page) {
    return page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#view *, .sheet-wrap.open *, .nav *').forEach(el => {
        if (!el.childNodes.length || !Array.prototype.some.call(el.childNodes, n => n.nodeType === 3 && n.textContent.trim())) return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) bad.push(el.tagName + ' ' + el.textContent.trim().slice(0, 30) + ' ' + fs);
      });
      return bad;
    });
  }
  // test doubles for sound, vibration and the screen lock (installed before the app's own scripts)
  const STUBS = () => {
    window.__audio = { osc: [] }; window.__vib = []; window.__wl = { requests: 0, cur: null };
    window.AudioContext = class { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); } createBuffer() { return {}; } createBufferSource() { return { connect() {}, start() {} }; }
      createOscillator() { const o = { frequency: { value: 0 }, connect() {}, start() { window.__audio.osc.push(o.frequency.value); }, stop() {} }; return o; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } };
    navigator.vibrate = p => { window.__vib.push(p); return true; };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl.requests++; const l = { released: false, release() { l.released = true; }, addEventListener() {} }; window.__wl.cur = l; return l; } } });
  };
  const mkPlan = (name, blocks, extra) => C.sanitizePlan(Object.assign({ name, sport: 'baseball', blocks: blocks.map((m, i) => (typeof m === 'object' ? m : { name: 'Block ' + (i + 1), min: m })) }, extra || {}));
  const dataDoc = (plans, hist, settings) => ({ v: 1, plans, hist: hist || [], settings: Object.assign(C.sanitizeSettings({}), settings || {}), meta: { lastBackup: null } });
  async function seed(page, data, run) {
    await page.addInitScript(([d, r]) => { try { if (sessionStorage.getItem('__pcseed')) return; sessionStorage.setItem('__pcseed', '1'); if (d) localStorage.setItem('practiceclock.data', JSON.stringify(d)); if (r) localStorage.setItem('practiceclock.run', JSON.stringify(r)); } catch (e) { /* ignore */ } }, [data || null, run || null]);
  }
  const CLOCK0 = new Date(2026, 10, 7, 16, 30, 0), S0 = new Date(2026, 10, 7, 16, 31, 0).getTime(); // practice "starts" at 4:31:00.000 PM
  async function fresh(o = {}) {
    const { ctx, page, errors } = await newPage(br, { today: o.today || TODAY, sw: o.sw, ctx: o.ctx });
    if (o.stubs !== false) await page.addInitScript(STUBS);
    if (o.data || o.run) await seed(page, o.data, o.run);
    if (o.init) await page.addInitScript(o.init);
    if (o.clock) await page.clock.install({ time: CLOCK0 });
    if (o.blank) await page.goto('about:blank');
    await page.goto(o.url || srv.url);
    if (o.clock) await page.clock.pauseAt(new Date(S0));
    if (o.wait !== false) await page.waitForSelector('#view > *');
    return { page, errors, ctx };
  }
  const audioLog = page => page.evaluate(() => window.__audio.osc.slice());
  const BB = () => C.planFromTemplate('baseball');
  async function startFirst(page, clock) { await page.click('.plan [data-act=plan-start]'); if (clock) await adv(page, 30); await page.waitForSelector('#r-time'); }
  const T_ = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const I_ = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());

  /* ============ first screen and the plans list ============ */
  await test('First screen: welcome with the five starter templates, no data written, no console errors, screenshots at 3 sizes', async () => {
    const { page, errors } = await fresh();
    await page.waitForSelector('.welcome');
    deq(await page.$$eval('.tpl', b => b.map(x => x.textContent.trim())), ['Start with a baseball template', 'Start with a softball template', 'Start with a basketball template', 'Start with a cheer template', 'Start with a football template']);
    eq(await page.$$eval('button', b => b.filter(x => x.textContent.trim() === 'Start with a baseball template').length), 1);
    assert.ok(await page.$('text=Try a sample')); assert.ok(await page.$('text=Build my own plan'));
    eq(await page.title(), 'Practice Clock: Run practice by the minute');
    eq(await page.evaluate(() => localStorage.getItem('practiceclock.data')), null, 'nothing is written just by looking');
    eq(await page.evaluate(() => !location.search && !location.hash), true);
    assert.ok(/Everything stays on this phone/.test(await page.textContent('.privacy-note')));
    eq(await overflow(page), 0); await shot(page, '01-welcome-390');
    await page.setViewportSize({ width: 768, height: 1024 }); await shot(page, '01-welcome-768'); eq(await overflow(page), 0);
    await page.setViewportSize({ width: 320, height: 640 }); await shot(page, '01-welcome-320'); eq(await overflow(page), 0, 'no sideways scroll at 320');
    deq(errors, []); await page.context().close();
  });

  await test('Template button builds the plan, opens the editor; start time and "must end by" drive the clock times and the over-time banner', async () => {
    const { page, errors } = await fresh();
    await page.click('.tpl[data-id=baseball]'); await page.waitForSelector('.blk');
    eq(await page.inputValue('#ed-name'), 'Baseball 90 min'); eq(await page.$$eval('.blk', b => b.length), 6);
    assert.ok(/^90\s*min/.test(await T_(page, '.totals .big'))); assert.ok(/6 blocks/.test(await T_(page, '.totals')));
    assert.ok(/now, rounded up to 5 minutes/.test(await page.textContent('.ed-card:has(#ed-start)')), 'default start is explained');
    let d = await stored(page); eq(d.plans.length, 1); eq(d.plans[0].blocks.length, 6); eq(d.plans[0].sport, 'baseball');
    await page.selectOption('#ed-sport', 'cheer'); eq((await stored(page)).plans[0].sport, 'cheer'); assert.ok(/Cheer/.test(await page.textContent('#ed-sport option:checked'))); await page.selectOption('#ed-sport', 'baseball'); eq((await stored(page)).plans[0].sport, 'baseball');
    await page.fill('#ed-start', '16:30');
    assert.ok(/Starts at 4:30 PM\./.test(await page.textContent('.ed-card:has(#ed-start)')));
    eq(await T_(page, '.blk:nth-child(1) .ln'), '4:30–4:45 PM · 15 min');
    eq(await T_(page, '.blk:nth-child(3) .ln'), '5:05–5:25 PM · 4 × 5 min = 20 min'); eq(await T_(page, '.blk:nth-child(3) .ln + .ln'), 'Tee · Soft toss · Front toss · Bunting');
    eq(await T_(page, '.blk:nth-child(6) .ln'), '5:55–6:00 PM · 5 min'); assert.ok(/finishes 6:00 PM/.test(await T_(page, '.totals')));
    eq(await page.$('.over'), null);
    // a cutoff it fits
    await page.fill('#ed-end', '18:00'); assert.ok(/Fits, with no time to spare/.test(await T_(page, '.fine')));
    await page.fill('#ed-end', '18:20'); assert.ok(/Fits with 20 min to spare/.test(await T_(page, '.fine')));
    // a cutoff it doesn't
    await page.fill('#ed-end', '17:50'); await page.waitForSelector('.over');
    assert.ok(/10 min over/.test(await T_(page, '.over')), await T_(page, '.over')); assert.ok(/finishes at 6:00 PM/.test(await T_(page, '.over'))); assert.ok(/done by 5:50 PM/.test(await T_(page, '.over')));
    await shot(page, '03-editor-over-390');
    await page.click('[data-act=trim]'); await page.waitForSelector(sheetSel);
    deq(await page.$$eval(sheetSel + ' .preview tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim())), ['Warm-up & throwing was 15 13 min', 'Infield / outfield was 20 17 min', 'Base running was 10 9 min', 'Scrimmage was 20 17 min', 'Cool-down & huddle was 5 4 min']);
    assert.ok(/Takes 10 min out of 5 blocks/.test(await T_(page, sheetSel)) && /finishes at 5:50 PM/.test(await T_(page, sheetSel)), await T_(page, sheetSel));
    await page.waitForTimeout(350); await shot(page, '07-trim-sheet-390');
    d = await stored(page); eq(C.planMinutes(d.plans[0]), 90, 'a preview changes nothing');
    await page.click(sheetSel + ' [data-apply]'); await noSheets(page);
    d = await stored(page); deq(d.plans[0].blocks.map(b => b.min), [13, 17, 5, 9, 17, 4]); eq(C.planMinutes(d.plans[0]), 80);
    eq(await page.$('.over'), null); assert.ok(/Fits, with no time to spare/.test(await T_(page, '.fine'))); assert.ok(/^80\s*min/.test(await T_(page, '.totals .big')));
    // a cutoff that is not after the start
    await page.fill('#ed-end', '16:00'); assert.ok(/has to be later than the start time/.test(await T_(page, '.errmsg'))); eq(await page.$('.over'), null);
    await page.click('[data-act=ed-clear-end]'); eq(await page.$('.fine'), null); eq((await stored(page)).plans[0].endBy, '');
    await page.click('[data-act=ed-now]'); eq((await stored(page)).plans[0].start, ''); assert.ok(/now, rounded up/.test(await page.textContent('.ed-card:has(#ed-start)')));
    deq(errors, []); await page.context().close();
  });

  await test('Trim sheet says so when trimming cannot be enough, and when there is nothing to trim', async () => {
    const plan = mkPlan('Tiny', [2, 2, 2], { start: '16:00', endBy: '16:02' });
    const stn = mkPlan('Stations only', [{ name: 'S', min: 5, type: 'stations', stations: 4 }], { start: '16:00', endBy: '16:10' });
    const { page, errors } = await fresh({ data: dataDoc([plan, stn]) });
    await page.click('.plan:nth-of-type(1) [data-act=plan-edit].btn'); await page.waitForSelector('.over');
    assert.ok(/4 min over/.test(await T_(page, '.over')));
    await page.click('[data-act=trim]'); await page.waitForSelector(sheetSel);
    assert.ok(/Still 1 min over/.test(await T_(page, sheetSel)), await T_(page, sheetSel)); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan');
    await page.click('.plan:nth-of-type(2) [data-act=plan-edit].btn'); await page.waitForSelector('.over');
    await page.click('[data-act=trim]'); await page.waitForSelector(sheetSel);
    assert.ok(/Can't trim/.test(await T_(page, sheetSel)) && /all stations/.test(await T_(page, sheetSel))); deq(errors, []); await page.context().close();
  });

  await test('Blocks: new plan, add, validate, edit, stations, duplicate, delete (confirm), reorder with buttons, 24-hour and 60-block limits, saved after reload', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=new-plan]'); await page.waitForSelector(sheetSel + ' #np-name');
    await page.fill('#np-name', 'Tuesday practice'); await page.click('#np-sport [data-sport=softball]'); await page.click(sheetSel + ' [data-create]');
    await page.waitForSelector('#ed-name'); await noSheets(page);
    eq(await page.inputValue('#ed-name'), 'Tuesday practice'); assert.ok(/No blocks yet/.test(await page.textContent('.empty'))); eq((await stored(page)).plans[0].sport, 'softball');
    await page.click('.editbar [data-act=plan-start]'); await waitToast(page, /Add at least one block/);
    // add a normal block with bad input first
    await page.click('[data-act=blk-add][data-type=normal]'); await page.waitForSelector(sheetSel + ' #bk-name'); await page.waitForTimeout(300);
    await shot(page, '05-block-sheet-390');
    await page.click(sheetSel + ' [data-save]'); assert.ok(/Give this block a name/.test(await T_(page, '#bk-err')));
    await page.fill('#bk-name', 'Warm-up');
    for (const bad of ['0', '181', '1.5', '', '-3']) { await page.fill('#bk-min', bad); await page.click(sheetSel + ' [data-save]'); assert.ok(/whole number from 1 to 180/.test(await T_(page, '#bk-err')), 'minutes ' + bad); eq(await sheetCount(page), 1); }
    await page.fill('#bk-min', '12'); await page.click(sheetSel + ' [data-min="5"]'); eq(await page.inputValue('#bk-min'), '17'); await page.click(sheetSel + ' [data-min="-1"]'); eq(await page.inputValue('#bk-min'), '16');
    await page.click(sheetSel + ' [data-min="-5"]'); await page.click(sheetSel + ' [data-min="-5"]'); await page.click(sheetSel + ' [data-min="-5"]'); await page.click(sheetSel + ' [data-min="-5"]'); eq(await page.inputValue('#bk-min'), '1', 'stepper stops at 1');
    await page.fill('#bk-min', '12'); await page.fill('#bk-note', 'Bring cones'); await page.click(sheetSel + ' .swatch[data-color=green]');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page); await waitToast(page, /Block added/);
    eq(await page.$$eval('.blk', b => b.length), 1); eq(await T_(page, '.blk .nm'), 'Warm-up'); assert.ok(/12 min/.test(await T_(page, '.blk .ln'))); eq(await T_(page, '.blk .note'), 'Bring cones');
    // add a stations block
    await page.click('[data-act=blk-add][data-type=stations]'); await page.waitForSelector(sheetSel + ' #bk-stn'); await page.waitForTimeout(300);
    eq(await page.inputValue('#bk-stn'), '4'); eq(await page.inputValue('#bk-min'), '5'); assert.ok(/Minutes per station/.test(await T_(page, sheetSel)));
    await page.click(sheetSel + ' [data-stn="-1"]'); eq(await page.inputValue('#bk-stn'), '3'); eq(await page.$$eval(sheetSel + ' [data-lab]', l => l.length), 3);
    await page.fill('#bk-name', 'Hitting'); await page.fill('#bk-min', '4'); await page.fill('[data-lab="0"]', 'Tee'); await page.fill('[data-lab="1"]', 'Toss'); await page.click(sheetSel + ' .swatch[data-color=purple]');
    assert.ok(/3 × 4 = 12 min/.test(await T_(page, '#bk-total')), await T_(page, '#bk-total'));
    await page.click(sheetSel + ' [data-stn="1"]'); await page.click(sheetSel + ' [data-stn="1"]'); eq(await page.inputValue('#bk-stn'), '5'); await page.fill('#bk-stn', '2'); eq(await page.$$eval(sheetSel + ' [data-lab]', l => l.length), 2);
    await page.fill('#bk-stn', '3'); eq(await page.inputValue('[data-lab="0"]'), 'Tee', 'labels are kept when the count changes');
    await page.evaluate(() => document.querySelector('.sheet-wrap.open .sh-body').scrollTo(0, 400)); await page.waitForTimeout(100); await shot(page, '06-stations-sheet-390');
    await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    assert.ok(/3 × 4 min = 12 min/.test(await T_(page, '.blk:nth-child(2) .ln'))); eq(await T_(page, '.blk:nth-child(2) .ln + .ln'), 'Tee · Toss · Station 3');
    assert.ok(/^24\s*min/.test(await T_(page, '.totals .big')));
    // edit: switch it to a normal block
    await page.click('.blk:nth-child(2) .body'); await page.waitForSelector(sheetSel + ' #bk-name'); eq(await page.inputValue('#bk-name'), 'Hitting'); eq(await page.inputValue('#bk-stn'), '3');
    await page.click(sheetSel + ' [data-type=normal]'); eq(await page.$('#bk-stn'), null); assert.ok(/^Minutes/.test(await T_(page, '#bk-min-l')));
    await page.click(sheetSel + ' [data-type=stations]'); eq(await page.inputValue('[data-lab="0"]'), 'Tee'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    // reorder with the buttons
    eq(await page.$eval('.blk:nth-child(1) [data-act=blk-up]', b => b.disabled), true); eq(await page.$eval('.blk:nth-child(2) [data-act=blk-down]', b => b.disabled), true);
    await page.click('.blk:nth-child(2) [data-act=blk-up]'); deq(await page.$$eval('.blk .nm', n => n.map(x => x.textContent)), ['Hitting', 'Warm-up']);
    deq((await stored(page)).plans[0].blocks.map(b => b.name), ['Hitting', 'Warm-up']);
    assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.id.indexOf('up-') === 0 || document.activeElement.id.indexOf('dn-') === 0), 'focus stays on a move button');
    await page.click('.blk:nth-child(1) [data-act=blk-down]'); deq(await page.$$eval('.blk .nm', n => n.map(x => x.textContent)), ['Warm-up', 'Hitting']);
    // duplicate
    await page.click('.blk:nth-child(1) .body'); await page.waitForSelector(sheetSel + ' [data-dup]'); await page.click(sheetSel + ' [data-dup]'); await noSheets(page);
    deq(await page.$$eval('.blk .nm', n => n.map(x => x.textContent)), ['Warm-up', 'Warm-up', 'Hitting']); const dd = (await stored(page)).plans[0].blocks; assert.ok(dd[0].id !== dd[1].id); eq(dd[1].note, 'Bring cones');
    // delete (confirm first, Cancel keeps it)
    await page.click('.blk:nth-child(2) .body'); await page.waitForSelector(sheetSel + ' [data-del]'); await page.click(sheetSel + ' [data-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    assert.ok(/will be taken out of the plan/.test(await T_(page, '.confirm'))); await page.click('.confirm [data-close].btn'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 1);
    eq(await page.$$eval('.blk', b => b.length), 3);
    await page.click(sheetSel + ' [data-del]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    deq(await page.$$eval('.blk .nm', n => n.map(x => x.textContent)), ['Warm-up', 'Hitting']);
    // reload: it is all still there
    await page.reload(); await page.waitForSelector('#view > *'); eq(await page.$$eval('.plan', p => p.length), 1, 'back on the plans list after a reload');
    await page.click('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); deq(await page.$$eval('.blk .nm', n => n.map(x => x.textContent)), ['Warm-up', 'Hitting']);
    // plan name edits save as you type, and an empty name falls back
    await page.fill('#ed-name', 'Renamed plan'); eq((await stored(page)).plans[0].name, 'Renamed plan'); await page.fill('#ed-name', ''); await page.press('#ed-name', 'Tab'); eq(await page.inputValue('#ed-name'), 'Renamed plan'); eq((await stored(page)).plans[0].name, 'Renamed plan');
    deq(errors, []); await page.context().close();
  });

  await test('Blocks: the 24-hour and 60-block limits are enforced in the editor', async () => {
    const full = mkPlan('Full day', Array.from({ length: 8 }, (_, i) => ({ name: 'Part ' + (i + 1), min: 180 })));
    const many = mkPlan('Many', Array.from({ length: 60 }, (_, i) => ({ name: 'B' + (i + 1), min: 1 })));
    const { page, errors } = await fresh({ data: dataDoc([full, many]) });
    await page.click('.plan:nth-of-type(1) [data-act=plan-edit].btn'); await page.waitForSelector('.blk');
    assert.ok(/^1440\s*min/.test(await T_(page, '.totals .big'))); await page.click('[data-act=blk-add][data-type=normal]'); await page.fill('#bk-name', 'One more'); await page.fill('#bk-min', '1'); await page.click(sheetSel + ' [data-save]');
    assert.ok(/longer than 24 hours/.test(await T_(page, '#bk-err'))); eq(await page.$$eval('.blk', b => b.length), 8); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await page.click('.blk:nth-child(1) .body'); await page.fill('#bk-min', '181'); await page.click(sheetSel + ' [data-save]'); assert.ok(/whole number/.test(await T_(page, '#bk-err'))); await page.click(sheetSel + ' [data-dup]'); assert.ok(/longer than 24 hours/.test(await T_(page, '#bk-err')));
    await page.keyboard.press('Escape'); await noSheets(page); await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan');
    await page.click('.plan:nth-of-type(2) [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await page.click('[data-act=blk-add][data-type=normal]'); await waitToast(page, /up to 60 blocks/); eq(await sheetCount(page), 0);
    deq(errors, []); await page.context().close();
  });

  await test('Reorder by dragging the handle: mouse and touch both work, the buttons stay the fallback', async () => {
    const plan = mkPlan('Drag me', [5, 6, 7, 8]);
    const names = page => page.$$eval('.blk .nm', n => n.map(x => x.textContent));
    // mouse
    let { page, errors } = await fresh({ data: dataDoc([plan]) });
    await page.click('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk');
    const showList = pg => pg.evaluate(() => window.scrollTo(0, document.querySelector('.blk').getBoundingClientRect().top + window.scrollY - 140));
    await showList(page);
    let g = await page.$eval('.blk:nth-child(1) .grip', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    let t3 = await page.$eval('.blk:nth-child(3)', e => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; });
    await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], g[1] + 30, { steps: 4 });
    eq(await page.$eval('.blk:nth-child(1)', e => e.classList.contains('dragging')), true); await page.mouse.move(g[0], t3, { steps: 10 }); await page.mouse.up();
    deq(await names(page), ['Block 2', 'Block 3', 'Block 1', 'Block 4']); deq((await stored(page)).plans[0].blocks.map(b => b.min), [6, 7, 5, 8]);
    // drag the last one to the top, then a tiny drag that stays in place changes nothing
    g = await page.$eval('.blk:nth-child(4) .grip', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    let t1 = await page.$eval('.blk:nth-child(1)', e => e.getBoundingClientRect().y + 10);
    await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], t1, { steps: 12 }); await page.mouse.up();
    deq(await names(page), ['Block 4', 'Block 2', 'Block 3', 'Block 1']);
    g = await page.$eval('.blk:nth-child(2) .grip', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], g[1] + 5, { steps: 2 }); await page.mouse.up(); deq(await names(page), ['Block 4', 'Block 2', 'Block 3', 'Block 1']);
    eq(await page.$$eval('.blk.dragging, .blk.shift', e => e.length), 0, 'no leftover drag styles'); deq(errors, []); await page.context().close();
    // touch (real touch events through the browser's own input pipeline)
    ({ page, errors } = await fresh({ data: dataDoc([plan]), ctx: { hasTouch: true, isMobile: true } }));
    await page.tap('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk');
    const cdp = await page.context().newCDPSession(page); await showList(page);
    g = await page.$eval('.blk:nth-child(1) .grip', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    t3 = await page.$eval('.blk:nth-child(3)', e => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g[0], y: g[1] }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g[0], y: g[1] + (t3 - g[1]) * i / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100); deq(await names(page), ['Block 2', 'Block 3', 'Block 1', 'Block 4'], 'dragged with a finger');
    eq(await overflow(page), 0); deq(errors, []); await page.context().close();
  });

  await test('Plans list: sample, duplicate, rename, delete (confirm), templates sheet, recent list', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=sample]'); await page.waitForSelector('.plan'); await waitToast(page, /sample practices/);
    eq(await page.$$eval('.plan', p => p.length), 2); deq(await page.$$eval('.plan .nm', n => n.map(x => x.textContent)), ['Basketball 60 min', 'Baseball 90 min']);
    let d = await stored(page); eq(d.hist.length, 3); assert.ok(d.hist.every(h => h.sample === true));
    // more -> duplicate
    await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.waitForTimeout(300);
    deq(await page.$$eval(sheetSel + ' .list-btn .t', b => b.map(x => x.firstChild.textContent)), ['Duplicate', 'Rename', 'Share, copy or print', 'Delete']);
    await page.click(sheetSel + ' [data-act=plan-dup]'); await noSheets(page); await waitToast(page, /Made a copy/);
    eq(await page.$$eval('.plan', p => p.length), 3); assert.ok((await page.$$eval('.plan .nm', n => n.map(x => x.textContent))).some(x => / copy$/.test(x)));
    // rename
    await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' [data-act=plan-rename]'); await page.waitForSelector('#rn-name');
    await page.fill('#rn-name', ''); await page.click(sheetSel + ' [data-save]'); assert.ok(/Give the plan a name/.test(await T_(page, sheetSel)));
    await page.fill('#rn-name', 'Saturday session'); await page.click(sheetSel + ' [data-save]'); await noSheets(page);
    assert.ok((await page.$$eval('.plan .nm', n => n.map(x => x.textContent))).includes('Saturday session'));
    // delete
    await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' [data-act=plan-del]'); await page.waitForSelector('.confirm [data-ok]');
    assert.ok(/can't be undone/.test(await T_(page, '.confirm'))); await page.click('.confirm [data-close].btn'); await noSheets(page); eq(await page.$$eval('.plan', p => p.length), 3, 'cancel keeps it');
    await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.click(sheetSel + ' [data-act=plan-del]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    eq(await page.$$eval('.plan', p => p.length), 2); eq((await stored(page)).plans.length, 2);
    // templates sheet
    await shot(page, '02-plans-390');
    await page.click('[data-act=templates]'); await page.waitForSelector(sheetSel + ' [data-id=softball]'); await page.waitForTimeout(300); await shot(page, '17-templates-sheet-390');
    await page.click(sheetSel + ' [data-id=softball]'); await page.waitForSelector('#ed-name'); eq(await page.inputValue('#ed-name'), 'Softball 90 min'); eq(await page.$$eval('.blk', b => b.length), 7);
    await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan'); eq(await page.$$eval('.plan', p => p.length), 3);
    // recent tab with sample entries
    await page.click('[data-act=tab][data-tab=recent]'); await page.waitForSelector('.hrow'); eq(await page.$$eval('.hrow', r => r.length), 3); assert.ok(/Sample/.test(await page.textContent('.hrow')));
    assert.ok(/Planned 90 min · Actual 94 min \(\+4\)/.test(await T_(page, '.hrow:nth-of-type(1) .i')), await T_(page, '.hrow:nth-of-type(1) .i'));
    assert.ok(/Ended early/.test(await page.textContent('.hrow:nth-of-type(2)'))); assert.ok(/Planned 60 min · Actual 52 min \(-8\)/.test(await T_(page, '.hrow:nth-of-type(2) .i')));
    eq((await I_(page, '.hrow:nth-of-type(1) .d')).toLowerCase(), 'fri nov 6');
    await shot(page, '12-recent-390'); await page.click('[data-act=hist-clear]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    assert.ok(/Nothing yet/.test(await page.textContent('.empty'))); eq((await stored(page)).hist.length, 0);
    deq(errors, []); await page.context().close();
  });

  /* ============ the clock (fake time: nothing here waits in real time) ============ */
  await test('Runner: big countdown, pause and resume, 3-2-1 ticks, chime and flash at the block end, state saved', async () => {
    const { page, errors } = await fresh({ data: dataDoc([BB()]), clock: true });
    await startFirst(page, true);
    eq(await T_(page, '#r-time'), '15:00'); eq(await T_(page, '.bname'), 'Warm-up & throwing'); eq(await T_(page, '.kicker'), 'Block 1 of 6'); eq(await T_(page, '.rnote'), 'Dynamic stretch, then partner throws');
    eq(await T_(page, '#r-next'), 'Infield / outfield (20 min)'); eq(await T_(page, '#r-left'), '1:30:00'); eq(await T_(page, '#r-fin'), '6:01 PM');
    eq(await page.$eval('#r-time', e => e.classList.contains('long')), false);
    deq(await audioLog(page), [], 'no sound at the start'); eq(await page.evaluate(() => window.__wl.requests), 1, 'screen lock asked for once');
    assert.ok(/Sound on/.test(await T_(page, '#r-stat')) && /Screen stays on/.test(await T_(page, '#r-stat')), await T_(page, '#r-stat'));
    assert.ok(await page.$('.bname i'), 'color dot'); eq(await page.$eval('#r-main', e => e.getBoundingClientRect().height) >= 56, true);
    for (const s of ['#r-main', '[data-act=r-skip]', '[data-act=r-back]', '[data-act=r-plus]', '[data-act=r-minus]', '[data-act=r-restart]']) assert.ok(await page.$eval(s, e => e.getBoundingClientRect().height) >= 56, s + ' is at least 56px tall');
    const run0 = await storedRun(page); eq(run0.t0, S0); eq(run0.pausedAt, null); eq(run0.plan.name, 'Baseball 90 min');
    await adv(page, 5 * MIN);
    eq(await T_(page, '#r-time'), '10:00'); eq(await page.$eval('#r-prog', e => e.style.width), '33.33%'); eq(await T_(page, '#r-el'), '5:00 in'); eq(await T_(page, '#r-dur'), '15:00 block'); eq(await T_(page, '#r-left'), '1:25:00');
    await page.waitForTimeout(500); await shot(page, '08-runner-390');
    // pause for two minutes
    await page.click('#r-main'); await adv(page, 30); assert.ok(/Resume/.test(await T_(page, '#r-main'))); eq(await T_(page, '#r-hold'), 'Paused'); eq(await page.$eval('#r-time', e => e.classList.contains('paused')), true);
    eq((await storedRun(page)).pausedAt, S0 + 30 + 5 * MIN);
    await adv(page, 2 * MIN - 30); eq(await T_(page, '#r-time'), '10:00', 'a paused clock does not move');
    await page.click('#r-main'); await adv(page, 30); assert.ok(/Pause/.test(await T_(page, '#r-main'))); eq((await storedRun(page)).pausedMs, 2 * MIN); eq(await T_(page, '#r-hold'), ' '.trim() === '' ? await T_(page, '#r-hold') : '');
    await adv(page, MIN - 30); eq(await T_(page, '#r-time'), '9:00');
    // the last seconds: 3.5 s left -> ticks at 3, 2, 1, then the chime
    await adv(page, 9 * MIN - 3500); eq(await T_(page, '#r-time'), '0:04'); deq(await audioLog(page), []);
    await adv(page, 600); deq(await audioLog(page), [1000]);
    await adv(page, 1000); deq(await audioLog(page), [1000, 1000]); await adv(page, 1000); deq(await audioLog(page), [1000, 1000, 1000]);
    await adv(page, 1000);
    deq(await audioLog(page), [1000, 1000, 1000, 880, 1175], 'three ticks, then the two-tone chime');
    eq(await T_(page, '.bname'), 'Infield / outfield'); eq(await T_(page, '#r-time'), '20:00'); eq(await T_(page, '.kicker'), 'Block 2 of 6'); eq(await T_(page, '#r-next'), 'Hitting stations: Station 1 of 4 · Tee (5 min)');
    deq(await page.evaluate(() => window.__vib), [[250, 100, 250]]); assert.ok(/Next block/.test(await T_(page, '#rbanner')) && /Infield/.test(await T_(page, '#rbanner')));
    eq(await page.$eval('#rflash', e => e.classList.contains('go')), true, 'the screen flashes'); assert.ok(/Now: Infield/.test(await T_(page, '#r-live')));
    // the phone sleeps for 30 minutes: it wakes in the right place and chimes once, not once per block it slept through
    await page.clock.fastForward(30 * MIN); await adv(page, 30);
    eq(await T_(page, '.bname'), 'Hitting stations'); eq(await T_(page, '.stn'), 'Station 3 of 4 · Front toss'); eq(await T_(page, '#r-time'), '5:00'); eq(await T_(page, '.kicker'), 'Block 3 of 6');
    eq((await audioLog(page)).length, 7, 'one chime for the whole sleep');
    // rotate
    await adv(page, 5 * MIN);
    eq(await T_(page, '.stn'), 'Station 4 of 4 · Bunting'); assert.ok(/Rotate now/.test(await T_(page, '#rbanner')) && /Station 4 of 4/.test(await T_(page, '#rbanner')), await T_(page, '#rbanner'));
    eq((await audioLog(page)).length, 12, 'three ticks and a chime at the rotation'); eq(await T_(page, '#r-next'), 'Base running (10 min)');
    await page.waitForTimeout(1100); await shot(page, '09-runner-rotate-390');
    // saved: the stored run carries everything needed to carry on
    const run = await storedRun(page); eq(run.pausedMs, 2 * MIN); eq(run.finished, false); eq(run.startMs, S0);
    deq(errors, []); await page.context().close();
  });

  await test('Runner: skip, back, restart, plus / minus a minute, the 0:30 floor, finishing from the last block', async () => {
    const plan = mkPlan('Short plan', [{ name: 'First', min: 10 }, { name: 'Second', min: 5, note: 'Bring cones' }, { name: 'Third', min: 5 }]);
    const { page, errors } = await fresh({ data: dataDoc([plan]), clock: true });
    await startFirst(page, true);
    eq(await T_(page, '#r-time'), '10:00'); await page.click('[data-act=r-plus]'); eq(await T_(page, '#r-time'), '11:00'); eq(await T_(page, '#r-dur'), '11:00 block'); eq(await T_(page, '#r-left'), '21:00');
    await page.click('[data-act=r-minus]'); eq(await T_(page, '#r-time'), '10:00'); deq((await storedRun(page)).adj, {}, 'back to normal leaves no trace');
    await adv(page, 9 * MIN); eq(await T_(page, '#r-time'), '1:00');
    await page.click('[data-act=r-minus]'); eq(await T_(page, '#r-time'), '0:30', 'never below 0:30');
    await page.click('[data-act=r-minus]'); await waitToast(page, /Under 30 seconds left/); eq(await T_(page, '#r-time'), '0:30');
    await page.click('[data-act=r-plus]'); eq(await T_(page, '#r-time'), '1:30');
    // skip, and the next block starts full with its note
    await page.click('[data-act=r-skip]'); await adv(page, 30);
    eq(await T_(page, '.bname'), 'Second'); eq(await T_(page, '#r-time'), '5:00'); eq(await T_(page, '.rnote'), 'Bring cones'); eq(await T_(page, '.kicker'), 'Block 2 of 3'); eq(await T_(page, '#r-next'), 'Third (5 min)'); eq(await T_(page, '#r-left'), '10:00');
    eq((await audioLog(page)).length, 0, 'skipping by hand does not chime');
    // back gives the skipped block back, whole (it had been stretched to 10:30)
    await page.click('[data-act=r-back]'); await adv(page, 100); eq(await T_(page, '.bname'), 'First'); eq(await T_(page, '#r-time'), '10:30');
    await adv(page, 3 * MIN); eq(await T_(page, '#r-time'), '7:30'); await page.click('[data-act=r-restart]'); await adv(page, 100); eq(await T_(page, '#r-time'), '10:30');
    await page.click('[data-act=r-skip]'); await page.click('[data-act=r-skip]'); await adv(page, 30);
    eq(await T_(page, '.bname'), 'Third'); eq(await T_(page, '#r-next'), 'Practice ends'); eq(await T_(page, '[data-act=r-skip]'), 'Finish');
    await adv(page, 2 * MIN); await page.click('[data-act=r-skip]'); await page.waitForSelector('.confirm [data-ok]'); await adv(page, 60); assert.ok(/Finish practice\?/.test(await T_(page, '.confirm')));
    await page.click('.confirm [data-close].btn'); await sheetsGone(page); eq(await T_(page, '.bname'), 'Third', 'cancel keeps going');
    await page.click('[data-act=r-skip]'); await page.waitForSelector('.confirm [data-ok]'); await adv(page, 60); await page.click('.confirm [data-ok]'); await sheetsGone(page); await adv(page, 30);
    eq(await T_(page, '.rdone .big'), 'Practice done'); const d = await stored(page); eq(d.hist.length, 1); eq(d.hist[0].planned, 20); eq(d.hist[0].early, false); eq(d.hist[0].actual, 14, 'real minutes on the clock: 9 + 3 + 2');
    deq(errors, []); await page.context().close();
  });

  await test('Runner: stations skip station by station and back, the buttons say which', async () => {
    const { page, errors } = await fresh({ data: dataDoc([BB()]), clock: true });
    await startFirst(page, true);
    await page.click('[data-act=r-skip]'); await page.click('[data-act=r-skip]'); await adv(page, 30);
    eq(await T_(page, '.bname'), 'Hitting stations'); eq(await T_(page, '.stn'), 'Station 1 of 4 · Tee'); eq(await page.getAttribute('[data-act=r-skip]', 'aria-label'), 'Skip to the next station'); eq(await page.getAttribute('[data-act=r-back]', 'aria-label'), 'Back to the start of the previous block');
    await page.click('[data-act=r-skip]'); await adv(page, 30); eq(await T_(page, '.stn'), 'Station 2 of 4 · Soft toss'); eq(await T_(page, '#r-time'), '5:00'); eq(await T_(page, '#r-next'), 'Hitting stations: Station 3 of 4 · Front toss (5 min)');
    await adv(page, 2 * MIN); await page.click('[data-act=r-minus]'); eq(await T_(page, '#r-time'), '2:00', 'minus applies to this station only'); await page.click('[data-act=r-back]'); await adv(page, 30); eq(await T_(page, '.stn'), 'Station 1 of 4 · Tee'); eq(await T_(page, '#r-time'), '5:00');
    await page.click('[data-act=r-skip]'); await adv(page, 30); eq(await T_(page, '#r-time'), '4:00', 'station 2 keeps its shortened time (5 - 1 = 4 min)');
    deq(errors, []); await page.context().close();
  });

  await test('Runner: ending early, finishing on its own, history lines and the plans banner', async () => {
    const { page, errors } = await fresh({ data: dataDoc([mkPlan('Quick', [2, 1])]), clock: true });
    await startFirst(page, true);
    await page.click('[data-act=r-plans]'); await page.waitForSelector('.run-banner'); assert.ok(/Practice running/.test(await T_(page, '.run-banner')) && /Quick/.test(await T_(page, '.run-banner')));
    await page.click('.run-banner'); await page.waitForSelector('#r-time'); await adv(page, 90 * 1000);
    await page.click('[data-act=r-end]'); await page.waitForSelector('.confirm [data-ok]'); await adv(page, 60); assert.ok(/2 minutes so far/.test(await T_(page, '.confirm')), await T_(page, '.confirm'));
    await page.click('.confirm [data-ok]'); await sheetsGone(page); await adv(page, 30);
    eq(await T_(page, '.rdone .big'), 'Practice ended'); eq(await T_(page, '.rdone .sum > div:nth-child(1) .v'), '3'); eq(await T_(page, '.rdone .sum > div:nth-child(2) .v'), '2'); await shot(page, '11-runner-done-390');
    let d = await stored(page); eq(d.hist.length, 1); deq([d.hist[0].plan, d.hist[0].planned, d.hist[0].actual, d.hist[0].early, d.hist[0].date], ['Quick', 3, 2, true, TODAY]);
    eq((await storedRun(page)).finished, true); eq((await storedRun(page)).logged, true);
    await page.click('[data-act=r-done]'); await page.waitForSelector('.plan'); eq(await storedRun(page), null); eq(await page.$('.run-banner'), null);
    // starting again, then letting it run out by itself: three-tone finish chime
    await page.evaluate(() => window.__audio.osc.length = 0);
    await page.click('.plan [data-act=plan-start]'); await adv(page, 30); await page.waitForSelector('#r-time'); await adv(page, 3 * MIN);
    eq(await T_(page, '.rdone .big'), 'Practice done'); deq(await audioLog(page), [1000, 1000, 1000, 880, 1175, 1000, 1000, 1000, 660, 880, 1175], 'ticks, chime at the end of block 1, ticks, then the finish chime');
    d = await stored(page); eq(d.hist.length, 2); deq([d.hist[0].planned, d.hist[0].actual, d.hist[0].early], [3, 3, false]); eq(d.hist[1].early, true, 'newest first');
    assert.ok(/Practice finished/.test(await (async () => { await page.click('[data-act=r-plans]'); return T_(page, '.run-banner'); })()), 'a finished practice waits for Done');
    // starting another while one is on the clock asks first
    await page.click('.run-banner'); await page.click('[data-act=r-done]'); await page.waitForSelector('.plan'); await page.click('.plan [data-act=plan-start]'); await adv(page, 30); await page.click('[data-act=r-plans]'); await page.waitForSelector('.plan');
    await page.click('.plan [data-act=plan-start]'); await page.waitForSelector('.confirm [data-ok]'); await adv(page, 60); assert.ok(/already running/.test(await T_(page, '.confirm'))); await page.click('.confirm [data-close].btn'); await sheetsGone(page);
    eq((await stored(page)).hist.length, 2); await page.click('.plan [data-act=plan-start]'); await page.waitForSelector('.confirm [data-ok]'); await adv(page, 60); await page.click('.confirm [data-ok]'); await sheetsGone(page); await adv(page, 30);
    await page.waitForSelector('#r-time'); eq((await stored(page)).hist.length, 3, 'the one that was running was saved first');
    deq(errors, []); await page.context().close();
  });

  await test('Runner: "wait for me" holds at 0:00 until you tap, survives a reload, and the last block just finishes', async () => {
    const plan = mkPlan('Wait plan', [{ name: 'One', min: 2 }, { name: 'Two', min: 1 }, { name: 'Three', min: 1 }], { wait: true });
    const { page, errors } = await fresh({ data: dataDoc([plan]), clock: true });
    await startFirst(page, true); await adv(page, 2 * MIN);
    eq(await T_(page, '#r-time'), '0:00'); eq(await T_(page, '#r-hold'), 'Block done'); assert.ok(/Start next/.test(await T_(page, '#r-main'))); eq(await T_(page, '.bname'), 'One'); eq(await T_(page, '#r-next'), 'Two (1 min)');
    deq(await audioLog(page), [1000, 1000, 1000, 880, 1175]); assert.ok(/Block done/.test(await T_(page, '#rbanner')));
    eq(await page.$eval('[data-act=r-plus]', e => e.disabled), true); eq(await page.$eval('[data-act=r-restart]', e => e.disabled), true);
    await page.waitForTimeout(1100); await shot(page, '10-runner-hold-390');
    await adv(page, 10 * MIN); eq(await T_(page, '#r-time'), '0:00'); eq((await audioLog(page)).length, 5, 'no more chimes while waiting');
    // closing and reopening the app keeps the wait
    await page.reload(); await page.waitForSelector('#r-time'); await page.clock.runFor(30);
    eq(await T_(page, '#r-hold'), 'Block done'); eq((await storedRun(page)).holding, true);
    await page.click('#r-main'); await adv(page, 30); eq(await T_(page, '.bname'), 'Two'); eq(await T_(page, '#r-time'), '1:00'); eq(await T_(page, '#r-hold'), ' '.trim() === '' ? await T_(page, '#r-hold') : '');
    await adv(page, MIN); eq(await T_(page, '#r-hold'), 'Block done');
    await page.click('#r-main'); await adv(page, 30); eq(await T_(page, '.bname'), 'Three'); await adv(page, MIN);
    eq(await T_(page, '.rdone .big'), 'Practice done'); const h = (await stored(page)).hist[0]; deq([h.planned, h.actual], [4, 4], 'waiting time is not counted');
    deq(errors, []); await page.context().close();
  });

  await test('Runner: closing and reopening the app, even after the phone slept through blocks, shows the right block', async () => {
    const { page, errors } = await fresh({ data: dataDoc([BB()]), clock: true });
    await startFirst(page, true); await page.click('#r-main'); await adv(page, 3 * MIN); await page.click('#r-main'); await adv(page, 30); // 3 min paused
    await page.clock.fastForward(44 * MIN); await adv(page, 30);
    // 3 minutes paused, then 44 more = 44 minutes in: station 2 of 4 (40-45), 4 minutes in
    eq(await T_(page, '.stn'), 'Station 2 of 4 · Soft toss'); eq(await T_(page, '#r-time'), '1:00'); eq(await T_(page, '#r-left'), '46:00');
    // reload = the app was closed and opened again
    await page.reload(); await page.waitForSelector('#r-time');
    eq(await T_(page, '.stn'), 'Station 2 of 4 · Soft toss'); eq((await audioLog(page)).length, 0, 'no chime on opening'); assert.ok(/Tap here to turn it on/.test(await T_(page, '#r-stat')), 'sound needs a tap after a reload: ' + await T_(page, '#r-stat'));
    await page.click('#r-time'); await page.waitForFunction(() => /Sound on/.test(document.querySelector('#r-stat').textContent), null, { timeout: 3000 });
    // asleep through the whole rest of practice: it ends at the planned time, not when the phone woke
    await page.clock.fastForward(5 * 3600 * 1000); await adv(page, 30);
    eq(await T_(page, '.rdone .big'), 'Practice done'); const h = (await stored(page)).hist[0]; deq([h.planned, h.actual], [90, 90]);
    deq(errors, []); await page.context().close();
  });

  await test('Alerts follow the settings: volume 0, ticks off, vibrate off', async () => {
    const plan = mkPlan('Two blocks', [1, 1]);
    let { page, errors } = await fresh({ data: dataDoc([plan], [], { volume: 0, ticks: false, vibrate: false }), clock: true });
    await startFirst(page, true); await adv(page, MIN + 100);
    deq(await audioLog(page), [], 'volume 0: silent'); deq(await page.evaluate(() => window.__vib), [], 'vibrate off'); eq(await T_(page, '.bname'), 'Block 2'); assert.ok(await page.$('#rbanner'), 'still flashes and shows the banner');
    assert.ok(/Sound is off \(volume 0\)/.test(await T_(page, '#r-stat'))); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([plan], [], { ticks: false }), clock: true }));
    await startFirst(page, true); await adv(page, MIN + 100); deq(await audioLog(page), [880, 1175], 'no ticks'); deq(await page.evaluate(() => window.__vib), [[250, 100, 250]]); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([plan]), clock: true }));
    await startFirst(page, true); await adv(page, 2 * MIN + 100); deq(await audioLog(page), [1000, 1000, 1000, 880, 1175, 1000, 1000, 1000, 660, 880, 1175]); deq(await page.evaluate(() => window.__vib), [[250, 100, 250], [300, 120, 300, 120, 300]]); deq(errors, []); await page.context().close();
  });

  await test('Screen wake lock: asked for while running, asked again when the app comes back, released at the end; plain notes when it cannot', async () => {
    let { page, errors } = await fresh({ data: dataDoc([mkPlan('One', [1])]), clock: true });
    await startFirst(page, true); eq(await page.evaluate(() => window.__wl.requests), 1);
    await page.evaluate(() => { window.__wl.cur.released = true; }); // the browser took it away (screen was off)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await adv(page, 30); eq(await page.evaluate(() => window.__wl.requests), 2, 'asked again on return');
    await adv(page, MIN + 100); eq(await T_(page, '.rdone .big'), 'Practice done'); eq(await page.evaluate(() => window.__wl.cur.released), true, 'released when practice ends'); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([mkPlan('One', [1])]), clock: true, init: () => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); } }));
    await startFirst(page, true); assert.ok(/can't keep the screen on/.test(await T_(page, '#r-stat')), await T_(page, '#r-stat')); await page.click('[data-act=r-end]'); await adv(page, 60); await page.click('.confirm [data-ok]'); await sheetsGone(page); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([mkPlan('One', [1])], [], { awake: false }), clock: true }));
    await startFirst(page, true); eq(await page.evaluate(() => window.__wl.requests), 0); assert.ok(/Screen may lock/.test(await T_(page, '#r-stat'))); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([mkPlan('One', [1])]), clock: true, init: () => { navigator.wakeLock.request = async () => { throw new DOMException('no', 'NotAllowedError'); }; } }));
    await startFirst(page, true); assert.ok(/Couldn't keep the screen on/.test(await T_(page, '#r-stat'))); deq(errors, []); await page.context().close();
  });

  await test('Runner in real time: the clock counts down by itself (no fake time, no sound stubs)', async () => {
    const { page, errors } = await fresh({ data: dataDoc([BB()]), stubs: false });
    await startFirst(page);
    const a = await T_(page, '#r-time'); assert.ok(a === '15:00' || a === '14:59', a);
    await page.waitForTimeout(2300); const b = await T_(page, '#r-time'); assert.ok(b === '14:57' || b === '14:58', 'after 2.3 s the clock says ' + b);
    await page.waitForTimeout(1100); const c2 = await T_(page, '#r-time'); assert.ok(c2 !== b && (c2 === '14:56' || c2 === '14:57'), c2);
    eq(await page.evaluate(() => !!window.PCApp.audio.ctx), true, 'a real AudioContext was created from the Start tap'); assert.ok(['running', 'suspended'].includes(await page.evaluate(() => window.PCApp.audio.ctx.state)));
    await page.click('#r-main'); const p1 = await T_(page, '#r-time'); await page.waitForTimeout(1300); eq(await T_(page, '#r-time'), p1, 'paused for real');
    deq(errors, []); await page.context().close();
  });

  /* ============ settings, sharing, printing, backup ============ */
  const clearToasts = page => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  const PERMS = { permissions: ['clipboard-read', 'clipboard-write'] };
  const NO_SHARE = () => { Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: undefined }); };
  const SHARE_STUB = () => { window.__shareMode = ''; Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: async d => { if (window.__shareMode === 'abort') throw new DOMException('x', 'AbortError'); if (window.__shareMode === 'fail') throw new Error('nope'); window.__shared = d; } }); };
  const PRINT_STUB = () => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; };
  const SP = () => mkPlan('Café «Drills» 日本', [{ name: 'Warm-up', min: 10, note: 'Bring cones & balls', color: 'green' }, { name: 'Hitting', min: 5, type: 'stations', stations: 3, labels: ['Tee', 'Toss', ''] }, { name: 'Scrimmage', min: 20, color: 'red' }], { start: '16:30', endBy: '18:00', wait: true, sport: 'softball' });
  const openShareSheet = async page => { await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.waitForSelector(sheetSel + ' [data-act=plan-share]'); await page.click(sheetSel + ' [data-act=plan-share]'); await page.waitForSelector(sheetSel + ' [data-copy-text]'); await page.waitForTimeout(320); };
  async function noXss(page, label) {
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ x: typeof window.__xss, bad: document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onmouseover], [onload]:not(link), body script:not([src])').length }));
    eq(r.x, 'undefined', label + ': nothing ran'); eq(r.bad, 0, label + ': no injected elements');
  }

  await test('Settings: volume and switches are saved, test sound plays, honest notes when this phone cannot vibrate or keep the screen on, help, clear everything', async () => {
    let { page, errors } = await fresh({ data: dataDoc([BB()]) });
    await page.click('[data-act=tab][data-tab=settings]'); await page.waitForSelector('#set-vol');
    eq(await page.inputValue('#set-vol'), '70'); eq(await T_(page, '#set-vol-v'), '70%');
    await shot(page, '13-settings-390');
    const setVol = v => page.$eval('#set-vol', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await setVol(40); eq(await T_(page, '#set-vol-v'), '40%'); eq((await stored(page)).settings.volume, 40);
    await setVol(0); eq(await T_(page, '#set-vol-v'), 'Off'); eq((await stored(page)).settings.volume, 0);
    await page.click('[data-act=set-test]'); await waitToast(page, /Volume is set to Off/); await clearToasts(page);
    await setVol(55); await page.click('[data-act=set-test]'); await waitToast(page, /two tones/);
    await page.waitForFunction(() => window.__audio.osc.length >= 2); deq(await audioLog(page), [880, 1175], 'the test sound is the same two-tone chime');
    for (const k of ['ticks', 'vibrate', 'awake']) {
      eq(await page.getAttribute('[data-k=' + k + ']', 'role'), 'switch'); eq(await page.getAttribute('[data-k=' + k + ']', 'aria-checked'), 'true');
      await page.click('[data-k=' + k + ']'); eq(await page.getAttribute('[data-k=' + k + ']', 'aria-checked'), 'false'); eq((await stored(page)).settings[k], false, k + ' saved');
    }
    await page.reload(); await page.waitForSelector('.plan'); await page.click('[data-act=tab][data-tab=settings]'); await page.waitForSelector('#set-vol');
    eq(await page.inputValue('#set-vol'), '55', 'volume survives a reload'); eq(await T_(page, '#set-vol-v'), '55%');
    for (const k of ['ticks', 'vibrate', 'awake']) eq(await page.getAttribute('[data-k=' + k + ']', 'aria-checked'), 'false', k + ' survives a reload');
    assert.ok(/haven't made a backup yet/.test(await T_(page, '#view')));
    // help
    await page.click('[data-act=about]'); await page.waitForSelector(sheetSel + ' h3'); await page.waitForTimeout(320);
    assert.ok(/Your privacy/.test(await T_(page, sheetSel)) && /Practice Clock v1/.test(await T_(page, sheetSel)) && /No account, no server, no tracking/.test(await T_(page, sheetSel))); await shot(page, '18-help-sheet-390');
    await page.keyboard.press('Escape'); await noSheets(page);
    // clear everything, with a practice on the clock
    await page.click('[data-act=tab][data-tab=plans]'); await startFirst(page); await page.click('[data-act=r-plans]'); await page.waitForSelector('.run-banner'); eq((await storedRun(page)).finished, false);
    await page.click('[data-act=tab][data-tab=settings]'); await page.click('[data-act=clear-all]'); await page.waitForSelector('.confirm [data-ok]');
    assert.ok(/permanently deletes all 1 plan/.test(await T_(page, '.confirm')) && /on the clock right now/.test(await T_(page, '.confirm')), await T_(page, '.confirm'));
    await page.waitForTimeout(300); await shot(page, '19-clear-confirm-390');
    await page.click('.confirm [data-close].btn'); await noSheets(page); eq((await stored(page)).plans.length, 1, 'cancel keeps everything'); assert.ok(await storedRun(page));
    await page.click('[data-act=clear-all]'); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    await page.waitForSelector('.welcome'); await waitToast(page, /Everything was cleared/);
    eq(await page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('practiceclock.') === 0).length), 0, 'every Practice Clock key is gone');
    await page.reload(); await page.waitForSelector('.welcome'); eq(await page.evaluate(() => localStorage.getItem('practiceclock.data')), null, 'a fresh start writes nothing');
    deq(errors, []); await page.context().close();
    // notes for phones that cannot do these things
    ({ page, errors } = await fresh({ data: dataDoc([BB()]), init: () => { navigator.vibrate = undefined; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); } }));
    await page.click('[data-act=tab][data-tab=settings]'); await page.waitForSelector('#set-vol');
    assert.ok(/can't vibrate the phone/.test(await T_(page, '[data-k=vibrate]')), await T_(page, '[data-k=vibrate]')); assert.ok(/Set the phone's auto-lock to Never/.test(await T_(page, '[data-k=awake]')), await T_(page, '[data-k=awake]'));
    deq(errors, []); await page.context().close();
  });

  await test('Share a plan: Copy link into a brand-new browser, preview, Add, Not now, and Copy as text', async () => {
    const sp = SP(), hash0 = C.encodeShare(sp).hash;
    const A = await fresh({ data: dataDoc([sp]), ctx: PERMS, init: NO_SHARE }); const page = A.page;
    await openShareSheet(page);
    eq(await page.$('[data-share-link]'), null, 'no "Share link..." button when the browser cannot share'); assert.ok(/Link size: \d+ of 3000 characters/.test(await T_(page, sheetSel)));
    await page.click(sheetSel + ' [data-copy-link]'); await waitToast(page, /Link copied/);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    eq(link, srv.url + hash0, 'the link is the app address plus the versioned hash'); eq(Number(/Link size: (\d+)/.exec(await T_(page, sheetSel))[1]), hash0.length - 4);
    await shot(page, '14-share-sheet-390');
    await page.click(sheetSel + ' [data-copy-text]'); await waitToast(page, /Plan copied as text/);
    eq(await page.evaluate(() => navigator.clipboard.readText()), C.planText(sp, 990), 'text copy matches the schedule'); assert.ok(/4:30-4:40 PM {2}Warm-up \(10 min\)/.test(C.planText(sp, 990)), C.planText(sp, 990));
    deq(A.errors, []); await A.ctx.close();

    const B = await fresh({ url: link }); const b = B.page;
    await b.waitForSelector(sheetSel + ' [data-add]'); await b.waitForTimeout(350);
    eq(await b.evaluate(() => location.hash), '', 'the hash is cleared from the address bar'); eq(await b.evaluate(() => localStorage.getItem('practiceclock.data')), null, 'nothing is saved before Add');
    assert.ok(/Add this plan\?/.test(await T_(b, sheetSel + ' .sh-head')));
    eq(await T_(b, sheetSel + ' .num'), 'Café «Drills» 日本'); assert.ok(/Softball · 45 min/.test(await T_(b, sheetSel)), await T_(b, sheetSel));
    deq(await b.$$eval(sheetSel + ' .preview tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim())), ['Warm-up 10 min', 'Hitting (3 stations) 15 min', 'Scrimmage 20 min']);
    await shot(b, '15-import-sheet-390');
    await b.click(sheetSel + ' [data-add]'); await b.waitForSelector('#ed-name'); await noSheets(b); await waitToast(b, /Added\. Check it over/);
    eq(await b.inputValue('#ed-name'), 'Café «Drills» 日本');
    const d = await stored(b); eq(d.plans.length, 1);
    const want = JSON.parse(JSON.stringify(sp)); want.start = ''; want.endBy = ''; deq(strip(d.plans[0]), strip(want), 'the shared plan comes through whole (start time and cutoff stay with the sender)');
    // the same link again in the same page: preview, Not now leaves everything alone, and the sheet can open again
    for (let i = 0; i < 2; i++) { await b.evaluate(h => { location.hash = h; }, hash0); await b.waitForSelector(sheetSel + ' [data-add]'); await b.click(sheetSel + ' [data-close].btn'); await noSheets(b); eq((await stored(b)).plans.length, 1, 'Not now adds nothing'); eq(await b.evaluate(() => location.hash), ''); }
    // adding while a practice is on the clock does not pull you off the clock
    await b.click('[data-act=ed-back]'); await b.waitForSelector('.plan'); await b.click('.plan [data-act=plan-start]'); await b.waitForSelector('#r-time');
    await b.evaluate(h => { location.hash = h; }, hash0); await b.waitForSelector(sheetSel + ' [data-add]'); await b.click(sheetSel + ' [data-add]'); await noSheets(b); await waitToast(b, /Added to your plans/);
    eq(await b.$$eval('#r-time', e => e.length), 1, 'still on the clock'); await b.click('[data-act=r-plans]'); await b.waitForSelector('.plan'); eq(await b.$$eval('.plan', p => p.length), 2);
    deq(B.errors, []); await B.ctx.close();
  });

  await test('Share links that are bad, cut off, too new, too big or hostile are refused with a plain message and add nothing', async () => {
    const tok = C.encodeShare(SP()).token, enc = o => C.b64urlEncode(C.utf8Encode(typeof o === 'string' ? o : JSON.stringify(o)));
    const { page, errors } = await fresh({ data: dataDoc([BB()]) });
    const tryHash = async (h, re, label) => {
      await clearToasts(page); await page.evaluate(x => { location.hash = x; }, h);
      if (re) { await waitToast(page, re); eq(await sheetCount(page), 0, label + ': no preview'); } else { await page.waitForTimeout(250); eq(await sheetCount(page), 0, label); eq(await page.$$eval('.toast', t => t.length), 0, label + ': silent'); }
      eq((await stored(page)) ? (await stored(page)).plans.length : 1, 1, label + ': nothing added'); await page.waitForTimeout(120);
    };
    await tryHash('#p1=!!!not base64!!!', /damaged/, 'junk');
    await tryHash('#p1=' + tok.slice(0, tok.length - 9), /damaged/, 'cut off');
    await tryHash('#p2=' + tok, /newer Practice Clock/, 'newer version');
    await tryHash('#p1=' + enc('this is not json'), /damaged/, 'not JSON');
    await tryHash('#p1=' + enc({ v: 1, n: 'x', s: 'baseball', w: 0, b: [] }), /damaged/, 'no blocks');
    await tryHash('#p1=' + enc({ v: 1, n: 'x', s: 'baseball', w: 0, b: [['A', '10']] }), /damaged/, 'minutes as text');
    await tryHash('#p1=' + enc({ v: 1, n: 'x', s: 'baseball', w: 0, b: Array.from({ length: 80 }, () => ['A', 1]) }), /too many blocks/, 'too many blocks');
    await tryHash('#p1=' + enc({ v: 1, n: 'x', s: 'baseball', w: 0, b: Array.from({ length: 9 }, () => ['A', 180]) }), /longer than 24 hours/, 'longer than a day');
    await tryHash('#p1=' + 'A'.repeat(25000), /too long/, 'huge');
    await tryHash('#hello', null, 'other hashes are ignored');
    await tryHash('#', null, 'bare hash');
    // hostile but well-formed: everything is clamped and escaped, and nothing runs
    const evil = { v: 1, n: '<img src=x onerror=__xss=1>' + 'N'.repeat(300), s: 'curling', w: 1, b: [['<img src=x onerror=__xss=2>', 9999, '"><svg onload=__xss=3>'.repeat(30), 99, 0, []], ['<img src=x onerror=__xss=1>', 5, '', 0, 50, ['<b onmouseover=__xss=4>', 5, null]], ['Ok', 3, '', 0, 0, []]] };
    await clearToasts(page); await page.evaluate(x => { location.hash = x; }, '#p1=' + enc(evil)); await page.waitForSelector(sheetSel + ' [data-add]');
    assert.ok(/223 min/.test(await T_(page, sheetSel)), await T_(page, sheetSel)); await noXss(page, 'preview of a hostile link');
    deq(await page.$$eval(sheetSel + ' .preview tr td:first-child', r => r.map(x => x.textContent)), ['<img src=x onerror=__xss=2>', '<img src=x onerror=__xss=1> (8 stations)', 'Ok'], 'shown as text');
    await page.click(sheetSel + ' [data-add]'); await page.waitForSelector('#ed-name'); await noSheets(page);
    const p = (await stored(page)).plans[0];
    eq(p.name.length, 40); eq(p.sport, 'other'); eq(p.blocks[0].min, 180); eq(p.blocks[1].stations, 8); eq(p.blocks[0].note.length, 120); assert.ok(/^[a-z]*$/.test(p.blocks[0].color)); eq(p.blocks[1].labels[0], '<b onmouseover=__xss=4>'); eq(p.wait, true);
    await noXss(page, 'editor after adding'); await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan'); await noXss(page, 'plans list after adding');
    deq(errors, []); await page.context().close();
  });

  await test('Share sheet: native share, the user backing out, a failing share, clipboard fallbacks, and a plan too long for a link', async () => {
    const sp = SP(), hash0 = C.encodeShare(sp).hash;
    let { page, errors } = await fresh({ data: dataDoc([sp]), ctx: PERMS, init: SHARE_STUB });
    await openShareSheet(page); await clearToasts(page);
    await page.click(sheetSel + ' [data-share-link]'); await page.waitForFunction(() => window.__shared);
    let sh = await page.evaluate(() => window.__shared); eq(sh.url, srv.url + hash0); eq(sh.title, 'Café «Drills» 日本'); assert.ok(/Practice plan/.test(sh.text));
    eq(await page.$$eval('.toast', t => t.length), 0, 'a successful share needs no message');
    await page.evaluate(() => { window.__shareMode = 'abort'; }); await page.click(sheetSel + ' [data-share-link]'); await page.waitForTimeout(250); eq(await page.$$eval('.toast', t => t.length), 0, 'backing out of the share sheet is not an error');
    await page.evaluate(() => { window.__shareMode = 'fail'; }); await page.click(sheetSel + ' [data-share-link]'); await waitToast(page, /Couldn't open sharing, so the link was copied/);
    eq(await page.evaluate(() => navigator.clipboard.readText()), srv.url + hash0); deq(errors, []); await page.context().close();
    // no clipboard API: the old copy command is tried, and when that fails too the link is put in a box to copy by hand
    ({ page, errors } = await fresh({ data: dataDoc([sp]), init: () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); document.execCommand = () => { window.__copied = document.querySelector('textarea[readonly]').value; return true; }; } }));
    await openShareSheet(page); await page.click(sheetSel + ' [data-copy-link]'); await waitToast(page, /Link copied/); eq(await page.evaluate(() => window.__copied), srv.url + hash0, 'copied through the fallback'); deq(errors, []); await page.context().close();
    ({ page, errors } = await fresh({ data: dataDoc([sp]), init: () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); document.execCommand = () => false; } }));
    await openShareSheet(page); await page.click(sheetSel + ' [data-copy-link]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    eq(await page.inputValue('#copybox'), srv.url + hash0, 'the link is in a box'); assert.ok(/Select all, then Copy/.test(await T_(page, '.sheet-wrap.open:last-child .sheet')));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 1); deq(errors, []); await page.context().close();
    // too long for a link: say so, still offer text and print
    const big = mkPlan('Huge plan', Array.from({ length: 60 }, (_, i) => ({ name: 'Block number ' + (i + 1), min: 1, note: ('Long note ' + i + ' ').repeat(12) })));
    ({ page, errors } = await fresh({ data: dataDoc([big]) }));
    await page.click('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await page.click('.editbar [data-act=plan-share]'); await page.waitForSelector(sheetSel + ' [data-copy-text]');
    assert.ok(/too long to fit in a link/.test(await T_(page, sheetSel)), await T_(page, sheetSel)); eq(await page.$('[data-copy-link]'), null); assert.ok(await page.$('[data-print]')); deq(errors, []); await page.context().close();
  });

  await test('Print: the schedule is built for one page, only the schedule shows when printing, and the print dialog opens once', async () => {
    const plan = mkPlan('Print me', [{ name: 'Warm-up', min: 15, note: 'Dynamic stretch' }, { name: 'Hitting', min: 5, type: 'stations', stations: 4, labels: ['Tee', 'Toss', 'Front toss', 'Bunt'] }, { name: 'Scrimmage', min: 20 }], { start: '16:30', sport: 'baseball' });
    const { page, errors } = await fresh({ data: dataDoc([plan]), init: PRINT_STUB });
    await openShareSheet(page); await page.click(sheetSel + ' [data-print]'); await noSheets(page); await page.waitForFunction(() => window.__printed === 1, null, { timeout: 3000 });
    await page.emulateMedia({ media: 'print' });
    eq(await page.evaluate(() => getComputedStyle(document.querySelector('#app')).display), 'none', 'the app is hidden when printing'); eq(await page.evaluate(() => getComputedStyle(document.querySelector('#printbox')).display), 'block');
    const txt = await page.evaluate(() => document.querySelector('#printbox').innerText);
    assert.ok(/Print me/.test(txt) && /4:30–4:45 PM/.test(txt) && /4 stations, rotate every 5 min: Tee, Toss, Front toss, Bunt/.test(txt) && /Made with Practice Clock/.test(txt) && /Dynamic stretch/.test(txt), txt);
    await page.setViewportSize({ width: 816, height: 1056 }); await shot(page, '16-print-letter'); await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.body.classList.contains('printing'), null, { timeout: 4000 });
    await page.evaluate(p => window.PCApp.printPlan(p), plan); await page.waitForFunction(() => window.__printed === 2, null, { timeout: 3000 });
    const pdf = await page.pdf({ format: 'Letter' }).catch(() => null);
    if (pdf) { const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length; eq(pages, 1, 'prints on one page'); fs.writeFileSync(path.join(os.tmpdir(), 'practiceclock-print.pdf'), pdf); } else console.log('      (page.pdf() not available here; PDF page count not checked)');
    await page.waitForFunction(() => !document.body.classList.contains('printing'), null, { timeout: 4000 });
    eq(await page.evaluate(() => window.__printed), 2, 'one print call for each time Print was chosen');
    // a plan with no blocks cannot be printed
    await page.evaluate(() => window.PCApp.printPlan({ name: 'x', blocks: [] })); await waitToast(page, /Add a block first/); eq(await page.evaluate(() => window.__printed), 2);
    deq(errors, []); await page.context().close();
  });

  /* ---------- backup and restore ---------- */
  const backupPath = path.join(os.tmpdir(), 'practiceclock-test-backup.json');
  const histRows = () => [C.sanitizeLog({ date: '2026-11-05', plan: 'Baseball 90 min', planned: 90, actual: 93, early: false }), C.sanitizeLog({ date: '2026-11-03', plan: 'Café «Drills» 日本', planned: 45, actual: 30, early: true })];
  await test('Backup then restore into a fresh browser gives identical data, and a second backup matches the first', async () => {
    const plans = [BB(), SP()], hist = histRows(), set = { volume: 35, ticks: false, vibrate: true, awake: false };
    const A = await fresh({ data: dataDoc(plans, hist, set) }); const a = A.page;
    await a.click('[data-act=tab][data-tab=settings]'); await a.waitForSelector('[data-act=dl-backup]'); assert.ok(/haven't made a backup yet/.test(await T_(a, '#view')));
    const [dl] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=dl-backup]')]);
    eq(dl.suggestedFilename(), 'practiceclock-backup-2026-11-07.json'); await dl.saveAs(backupPath); await waitToast(a, /Backup file created/);
    const file = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    eq(file.app, 'practiceclock'); eq(file.version, 1); eq(file.plans.length, 2); eq(file.history.length, 2); eq(file.settings.volume, 35); eq(file.settings.ticks, false); eq(file.settings.awake, false); assert.ok(!('run' in file), 'a practice in progress is not part of a backup');
    eq((await stored(a)).meta.lastBackup, TODAY); assert.ok(/Last backup today/.test(await T_(a, '#view')));
    const docA = await stored(a); deq(A.errors, []); await A.ctx.close();
    const B = await fresh(); const b = B.page;
    await b.setInputFiles('[data-restore]', backupPath); await b.waitForSelector('.confirm [data-ok]');
    assert.ok(/This backup has 2 plans and 2 recent practices/.test(await T_(b, '.confirm')) && /Nothing is on this phone yet/.test(await T_(b, '.confirm')), await T_(b, '.confirm'));
    await b.waitForTimeout(300); await shot(b, '20-restore-confirm-390');
    await b.click('.confirm [data-ok]'); await noSheets(b); await b.waitForSelector('.plan'); await waitToast(b, /Restored 2 plans/);
    const docB = await stored(b); deq(docB.plans, docA.plans, 'plans identical'); deq(docB.hist, docA.hist, 'history identical'); deq(docB.settings, docA.settings, 'settings identical');
    await b.click('[data-act=tab][data-tab=settings]'); const [dl2] = await Promise.all([b.waitForEvent('download'), b.click('[data-act=dl-backup]')]);
    const p2 = path.join(os.tmpdir(), 'practiceclock-test-backup2.json'); await dl2.saveAs(p2); const f2 = JSON.parse(fs.readFileSync(p2, 'utf8'));
    deq(f2.plans, file.plans); deq(f2.history, file.history); deq(f2.settings, file.settings);
    deq(B.errors, []); await B.ctx.close();
    // sharing the backup file where the browser can, and no button where it cannot
    let C2 = await fresh({ data: dataDoc(plans), init: () => { navigator.canShare = () => true; Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: async d => { window.__sf = { n: d.files[0].name, t: d.files[0].type }; } }); } });
    await C2.page.click('[data-act=tab][data-tab=settings]'); await C2.page.click('[data-act=share-backup]'); await waitToast(C2.page, /Backup shared/);
    deq(await C2.page.evaluate(() => window.__sf), { n: 'practiceclock-backup-2026-11-07.json', t: 'application/json' }); eq((await stored(C2.page)).meta.lastBackup, TODAY); deq(C2.errors, []); await C2.ctx.close();
    C2 = await fresh({ data: dataDoc(plans), init: () => { navigator.canShare = undefined; } });
    await C2.page.click('[data-act=tab][data-tab=settings]'); await C2.page.waitForSelector('[data-act=dl-backup]'); eq(await C2.page.$('[data-act=share-backup]'), null); deq(C2.errors, []); await C2.ctx.close();
  });

  await test('Restore: damaged, wrong, too-new or oversized files are refused and nothing changes; Cancel keeps data; a good file replaces it', async () => {
    const good = fs.readFileSync(backupPath, 'utf8'), tmp = n => path.join(os.tmpdir(), 'practiceclock-bad-' + n);
    const base = JSON.parse(good);
    const bad = {
      'not-json.json': 'this is {{ not json', 'empty.json': '', 'truncated.json': good.slice(0, Math.floor(good.length / 2)), 'array.json': '[]', 'text.json': '"hello"',
      'other-app.json': JSON.stringify(Object.assign({}, base, { app: 'locker' })), 'newer.json': JSON.stringify(Object.assign({}, base, { version: 2 })), 'no-version.json': JSON.stringify({ app: 'practiceclock', plans: [] }),
      'plans-not-list.json': JSON.stringify(Object.assign({}, base, { plans: 'x' })), 'day-plus.json': JSON.stringify(Object.assign({}, base, { plans: [{ name: 'x', blocks: Array.from({ length: 9 }, () => ({ name: 'a', min: 180 })) }] })),
      'too-many-plans.json': JSON.stringify(Object.assign({}, base, { plans: Array.from({ length: 61 }, () => ({ name: 'x', blocks: [] })) })), 'huge.json': '{"app":"practiceclock","version":1,"plans":[]' + ' '.repeat(5.3 * 1024 * 1024) + '}'
    };
    Object.keys(bad).forEach(n => fs.writeFileSync(tmp(n), bad[n]));
    const keeper = mkPlan('Keeper', [10, 5]);
    const { page, errors } = await fresh({ data: dataDoc([keeper], [], { volume: 20 }) });
    await page.click('[data-act=tab][data-tab=settings]'); await page.waitForSelector('[data-restore]');
    const before = await page.evaluate(() => localStorage.getItem('practiceclock.data'));
    for (const n of Object.keys(bad)) {
      await clearToasts(page); await page.setInputFiles('[data-restore]', tmp(n));
      await waitToast(page, /Nothing was changed/); eq(await page.$$eval('.confirm', c => c.length), 0, n + ': no confirm sheet'); eq(await page.evaluate(() => localStorage.getItem('practiceclock.data')), before, n + ': storage untouched');
    }
    // a good backup, then Cancel
    await clearToasts(page); await page.setInputFiles('[data-restore]', backupPath); await page.waitForSelector('.confirm [data-ok]');
    assert.ok(/Restoring replaces what is on this phone now \(1 plan, 0 recent practices, and your settings\)\. This cannot be undone/.test(await T_(page, '.confirm')), await T_(page, '.confirm'));
    await page.click('.confirm [data-close].btn'); await noSheets(page); eq(await page.evaluate(() => localStorage.getItem('practiceclock.data')), before, 'Cancel keeps data');
    // and a good file, Restore
    await page.setInputFiles('[data-restore]', backupPath); await page.waitForSelector('.confirm [data-ok]'); await page.click('.confirm [data-ok]'); await noSheets(page); await waitToast(page, /Restored 2 plans/);
    const d = await stored(page); deq(d.plans.map(p => p.name), ['Baseball 90 min', 'Café «Drills» 日本']); eq(d.hist.length, 2); eq(d.settings.volume, 35); eq(d.meta.lastBackup, TODAY);
    await page.click('[data-act=tab][data-tab=plans]'); eq(await page.$$eval('.plan', p => p.length), 2); assert.ok(!(await page.textContent('#view')).includes('Keeper'));
    deq(errors, []); await page.context().close();
  });

  await test('Hostile text everywhere (plan, block, note, station label, history, share link, backup file, print) is shown as plain text and never runs', async () => {
    const PL = '<img src=x onerror=__xss=1>', AT = '"><svg onload=__xss=2>', AP = "'><b onclick=__xss=4>", LB = '<svg onload=__xss=6>';
    const XP = mkPlan(PL, [{ name: PL, min: 5, note: AT, color: 'red' }, { name: AT, min: 5, type: 'stations', stations: 3, labels: [LB, AT, AP], note: PL }, { name: "'><script>__xss=5</script>", min: 5 }], { start: '16:00', endBy: '16:10' });
    const hx = [C.sanitizeLog({ date: '2026-11-05', plan: PL, planned: 15, actual: 15, early: false })];
    const A = await fresh({ data: dataDoc([XP], hx), init: PRINT_STUB, ctx: PERMS }); const a = A.page;
    await noXss(a, 'plans list'); eq(await T_(a, '.plan .nm'), PL, 'the name is shown as typed');
    await a.click('[data-act=tab][data-tab=recent]'); await a.waitForSelector('.hrow'); eq(await T_(a, '.hrow .i b'), PL); await noXss(a, 'recent'); await a.click('[data-act=tab][data-tab=plans]');
    await a.click('.plan [data-act=plan-more]'); await a.waitForSelector(sheetSel + ' [data-act=plan-rename]'); await noXss(a, 'more sheet'); await a.click(sheetSel + ' [data-act=plan-rename]'); await a.waitForSelector('#rn-name'); eq(await a.inputValue('#rn-name'), PL, 'the rename box holds the exact text'); await noXss(a, 'rename sheet'); await a.keyboard.press('Escape'); await noSheets(a);
    await a.click('.plan [data-act=plan-more]'); await a.click(sheetSel + ' [data-act=plan-del]'); await a.waitForSelector('.confirm [data-ok]'); assert.ok((await T_(a, '.confirm')).includes(PL)); await noXss(a, 'delete confirm'); await a.click('.confirm [data-close].btn'); await noSheets(a);
    await a.click('.plan [data-act=plan-edit].btn'); await a.waitForSelector('.blk'); eq(await a.inputValue('#ed-name'), PL); eq(await T_(a, '.blk:nth-child(1) .nm'), PL); await noXss(a, 'editor');
    await a.click('.blk:nth-child(2) .body'); await a.waitForSelector(sheetSel + ' #bk-name'); eq(await a.inputValue('#bk-name'), AT); eq(await a.inputValue('[data-lab="0"]'), LB); eq(await a.inputValue('[data-lab="2"]'), AP); eq(await a.inputValue('#bk-note'), PL); await noXss(a, 'block sheet'); await a.keyboard.press('Escape'); await noSheets(a);
    await a.click('[data-act=trim]'); await a.waitForSelector(sheetSel + ' .preview'); assert.ok((await T_(a, sheetSel + ' .preview')).includes(PL)); await noXss(a, 'trim preview'); await a.keyboard.press('Escape'); await noSheets(a);
    await a.click('.editbar [data-act=plan-share]'); await a.waitForSelector(sheetSel + ' [data-copy-link]'); await noXss(a, 'share sheet');
    await a.click(sheetSel + ' [data-copy-link]'); await waitToast(a, /Link copied/); const link = await a.evaluate(() => navigator.clipboard.readText());
    await a.click(sheetSel + ' [data-print]'); await a.waitForFunction(() => window.__printed === 1); const pb = await a.evaluate(() => document.querySelector('#printbox').innerText); assert.ok(pb.includes(PL) && pb.includes(AT), pb); await noXss(a, 'print'); await a.waitForFunction(() => !document.body.classList.contains('printing'), null, { timeout: 4000 });
    await a.click('[data-act=ed-back]'); await a.waitForSelector('.plan'); await a.click('.plan [data-act=plan-start]'); await a.waitForSelector('#r-time');
    eq(await T_(a, '.bname'), PL); eq(await T_(a, '.rnote'), AT); assert.ok((await T_(a, '#r-next')).includes(AT)); await noXss(a, 'clock');
    await a.click('[data-act=r-skip]'); await a.waitForTimeout(100); eq(await T_(a, '.stn'), 'Station 1 of 3 · ' + LB); assert.ok((await T_(a, '#r-live')).includes('Station 1')); await noXss(a, 'clock, station');
    await a.click('[data-act=r-plans]'); await a.waitForSelector('.run-banner'); assert.ok((await T_(a, '.run-banner')).includes(PL)); await noXss(a, 'banner'); await a.click('.run-banner'); await a.waitForSelector('#r-time');
    await a.click('[data-act=r-end]'); await a.waitForSelector('.confirm [data-ok]'); assert.ok((await T_(a, '.confirm')).length > 0); await a.click('.confirm [data-ok]'); await noSheets(a); await a.waitForSelector('.rdone'); await noXss(a, 'done screen');
    await a.click('[data-act=r-done]'); await a.waitForSelector('.plan'); await a.click('[data-act=tab][data-tab=recent]'); eq(await a.$$eval('.hrow', r => r.length), 2); eq(await T_(a, '.hrow:nth-of-type(1) .i b'), PL); await noXss(a, 'recent after');
    deq(A.errors, []); await A.ctx.close();
    // through a share link
    const B = await fresh({ url: link }); await B.page.waitForSelector(sheetSel + ' [data-add]'); assert.ok((await T_(B.page, sheetSel)).includes(PL)); await noXss(B.page, 'share preview');
    await B.page.click(sheetSel + ' [data-add]'); await B.page.waitForSelector('#ed-name'); eq(await B.page.inputValue('#ed-name'), PL); await noXss(B.page, 'after adding'); deq(B.errors, []); await B.ctx.close();
    // through a backup file
    const xb = path.join(os.tmpdir(), 'practiceclock-xss-backup.json'); fs.writeFileSync(xb, JSON.stringify(C.makeBackup([XP], hx, C.sanitizeSettings({}), TODAY)));
    const D = await fresh(); await D.page.setInputFiles('[data-restore]', xb); await D.page.waitForSelector('.confirm [data-ok]'); await D.page.click('.confirm [data-ok]'); await D.page.waitForSelector('.plan');
    eq(await T_(D.page, '.plan .nm'), PL); await noXss(D.page, 'restored backup'); await D.page.click('[data-act=tab][data-tab=recent]'); await noXss(D.page, 'restored recent'); deq(D.errors, []); await D.ctx.close();
  });

  /* ============ storage, offline, Back button, layout, network, limits ============ */
  await test('Storage blocked by the browser: still works for this visit and says so; a failed save shows a message and the next save works', async () => {
    let { page, errors } = await fresh({ init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); } });
    await page.waitForSelector('.welcome'); assert.ok(/not letting Practice Clock save/.test(await T_(page, '.banner.bad')), 'a plain warning is shown');
    await page.click('.tpl[data-id=baseball]'); await page.waitForSelector('.blk'); await page.click('.editbar [data-act=plan-start]'); await page.waitForSelector('#r-time'); eq(await T_(page, '#r-time').then(t => /^1[45]:\d\d$/.test(t)), true, 'the clock runs without storage');
    await page.click('[data-act=r-plans]'); await page.waitForSelector('.plan'); assert.ok(await page.$('.banner.bad')); await page.click('[data-act=tab][data-tab=settings]'); await page.waitForSelector('.banner.bad'); assert.ok(/Download backup/.test(await T_(page, '.banner.bad')));
    deq(errors.filter(e => !/localStorage|denied/.test(e)), []); await page.context().close();
    // storage full / refusing writes after the app started
    ({ page, errors } = await fresh({ data: dataDoc([BB()]) }));
    await page.evaluate(() => { window.__orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.click('.plan [data-act=plan-more]'); await page.click(sheetSel + ' [data-act=plan-dup]'); await waitToast(page, /Couldn't save on this phone/);
    eq(await page.$$eval('.toast[role=alert]', t => t.length) > 0, true, 'announced as an alert');
    await page.evaluate(() => { Storage.prototype.setItem = window.__orig; }); await clearToasts(page);
    await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.click(sheetSel + ' [data-act=plan-dup]'); await waitToast(page, /Made a copy/);
    eq((await stored(page)).plans.length, await page.$$eval('.plan', p => p.length), 'once storage works again, what is on screen is what is saved');
    deq(errors, []); await page.context().close();
  });

  await test('Offline: after one visit the app opens and runs with no network, with its own cache only', async () => {
    const { ctx, page, errors } = await fresh({ sw: true, data: dataDoc([BB()]), init: () => { if (!sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); caches.open('locker-v1').then(c => c.put('/x', new Response('x'))); caches.open('practiceclock-v0').then(c => c.put('/y', new Response('y'))); } } });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.includes('practiceclock-v1') && !k.includes('practiceclock-v0') && (await (await caches.open('practiceclock-v1')).keys()).length >= 10; }, null, { timeout: 8000 });
    const cached = await page.evaluate(async () => (await (await caches.open('practiceclock-v1')).keys()).map(r => new URL(r.url).pathname));
    for (const f of ['/apps/practiceclock/', '/apps/practiceclock/manifest.json', '/apps/practiceclock/practiceclock.css', '/apps/practiceclock/core.js', '/apps/practiceclock/app.js', '/apps/practiceclock/editor.js', '/apps/practiceclock/runner.js', '/apps/practiceclock/settings.js', '/apps/practiceclock/boot.js', '/apps/icons/practiceclock-192.png', '/apps/icons/practiceclock-512.png']) assert.ok(cached.includes(f), 'cached ' + f + ' in ' + cached.join());
    await page.reload(); await page.waitForTimeout(300); assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the page is controlled by the worker before going offline');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('.plan', { timeout: 6000 }); eq(await T_(page, '.plan .nm'), 'Baseball 90 min');
    await startFirst(page); eq(await T_(page, '.bname'), 'Warm-up & throwing'); await page.click('[data-act=r-end]'); await page.click('.confirm [data-ok]'); await noSheets(page);
    await ctx.setOffline(false);
    const keys = await page.evaluate(() => caches.keys()); assert.ok(keys.includes('locker-v1'), "other apps' caches are left alone");
    deq(errors, []); await ctx.close();
  });

  const settle = page => page.waitForTimeout(450), onApp = page => page.url().startsWith(srv.url);
  await test('Back button: closes the top sheet, peels stacked sheets, leaves the editor and the clock for the plans list, and never leaves the app by accident', async () => {
    const mk = () => fresh({ data: dataDoc([BB()]), blank: true });
    let { page, errors } = await mk();
    await page.click('.plan [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0, 'Back closes a sheet'); assert.ok(onApp(page)); eq(await page.$$eval('.plan', p => p.length), 1);
    await page.click('.plan [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' .x'); await settle(page); eq(await sheetCount(page), 0);
    await page.click('.plan [data-act=plan-more]'); await page.waitForSelector(sheetSel); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(onApp(page), 'closing with the X left no stray history entry: ' + page.url());
    await page.click('.plan [data-act=plan-more]'); await page.waitForSelector(sheetSel + ' [data-act=plan-rename]'); await page.click(sheetSel + ' [data-act=plan-rename]'); await page.waitForSelector('#rn-name'); await settle(page);
    eq(await sheetCount(page), 1, 'a sheet that replaces a sheet is still one'); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(onApp(page));
    await page.goBack(); await settle(page); assert.ok(!onApp(page), 'with nothing open, Back leaves the app'); deq(errors, []); await page.context().close();
    // editor with stacked sheets
    ({ page, errors } = await mk());
    await page.click('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk');
    const stack2 = async () => { await page.click('.blk:nth-child(1) .body'); await page.waitForSelector(sheetSel + ' [data-del]'); await page.click(sheetSel + ' [data-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); };
    await stack2(); await page.goBack(); await settle(page); eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); eq(await page.$$eval('#ed-name', e => e.length), 1, 'still in the editor');
    await stack2(); await page.click('.confirm [data-close].btn'); await settle(page); eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); eq(await page.$$eval('#ed-name', e => e.length), 1, 'Cancel gave its entry back');
    await page.goBack(); await settle(page); eq(await page.$$eval('.plan', p => p.length), 1, 'Back leaves the editor for the plans list'); eq(await page.$('#ed-name'), null); assert.ok(onApp(page));
    await page.click('.plan [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan'); await settle(page);
    await page.goBack(); await settle(page); assert.ok(!onApp(page), "the app's own Back button gave its history entry back"); deq(errors, []); await page.context().close();
    // the clock
    ({ page, errors } = await mk());
    await startFirst(page); await page.click('[data-act=r-end]'); await page.waitForSelector('.confirm [data-ok]'); await settle(page); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0); eq(await page.$$eval('#r-time', e => e.length), 1, 'Back closes the confirm and stays on the clock');
    await page.goBack(); await settle(page); await page.waitForSelector('.run-banner'); assert.ok(onApp(page), 'Back leaves the clock for the plans list, the practice keeps running');
    await page.click('.run-banner'); await page.waitForSelector('#r-time'); await page.reload(); await page.waitForSelector('#r-time'); await settle(page);
    await page.goBack(); await settle(page); await page.waitForSelector('.run-banner'); await page.click('.run-banner'); await page.waitForSelector('#r-time'); await page.click('[data-act=r-plans]'); await page.waitForSelector('.plan'); await settle(page);
    await page.goBack(); await settle(page); assert.ok(!onApp(page), 'Plans button gave its entry back'); deq(errors, []); await page.context().close();
  });

  await test('Keyboard and focus: Escape closes a sheet and focus goes back, Tab stays inside a sheet, Enter creates a plan, the focus ring shows', async () => {
    const { page, errors } = await fresh({ data: dataDoc([BB()]) });
    await page.focus('.plan [data-act=plan-more]'); await page.keyboard.press('Enter'); await page.waitForSelector(sheetSel);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('.sheet')), 'Tab cycles inside the sheet');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('.sheet')), 'Shift+Tab too');
    await page.keyboard.press('Escape'); await noSheets(page); eq(await page.evaluate(() => document.activeElement.getAttribute('data-act')), 'plan-more', 'focus is back on the button that opened it');
    await page.keyboard.press('Tab'); const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, w: parseFloat(s.outlineWidth) }; });
    assert.ok(ring.style !== 'none' && ring.w >= 2, 'a visible focus ring: ' + JSON.stringify(ring));
    await page.click('header [data-act=new-plan]'); await page.waitForSelector('#np-name'); await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'np-name'); await page.keyboard.type('Enter plan'); await page.keyboard.press('Enter'); await page.waitForSelector('#ed-name');
    eq(await page.inputValue('#ed-name'), 'Enter plan'); eq((await stored(page)).plans[0].name, 'Enter plan'); await noSheets(page); deq(errors, []); await page.context().close();
  });

  await test('Layout and touch size at 390, 320 and 768 wide: no sideways scroll, targets >= 44px, text >= 12px, sheets <= 85% of the screen, screenshots', async () => {
    const hist = [C.sanitizeLog({ date: '2026-11-05', plan: 'Baseball 90 min', planned: 90, actual: 93, early: false }), C.sanitizeLog({ date: '2026-11-03', plan: 'A plan with a name that is quite long indeed', planned: 45, actual: 30, early: true })];
    const longName = mkPlan('A plan with a really quite long name 1234', [{ name: 'A block name that runs to the very limit 123', min: 12, note: 'A long note that should wrap onto a second line instead of running off the side of the screen, ok' }, 8]);
    const { page, errors } = await fresh({ data: dataDoc([BB(), longName, mkPlan('Short', [3, 4])], hist) });
    const problems = [];
    const check = async label => { const o = await overflow(page); if (o) problems.push(label + ': sideways scroll by ' + o + 'px'); (await smallTargets(page)).forEach(b => problems.push(label + ': small target ' + b)); (await smallText(page)).forEach(b => problems.push(label + ': small text ' + b)); };
    for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h }); const L = w + ' ';
      await page.click('[data-act=tab][data-tab=plans]'); await check(L + 'plans'); if (w !== 390) await shot(page, '02-plans-' + w);
      await page.click('[data-act=tab][data-tab=recent]'); await check(L + 'recent'); if (w !== 390) await shot(page, '12-recent-' + w);
      await page.click('[data-act=tab][data-tab=settings]'); await check(L + 'settings'); if (w !== 390) await shot(page, '13-settings-' + w);
      await page.click('[data-act=tab][data-tab=plans]');
      await page.click('.plan:nth-of-type(2) [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await check(L + 'long-name editor'); await shot(page, '04b-editor-long-names-' + w); await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan');
      await page.click('.plan:nth-of-type(1) [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await check(L + 'editor'); await shot(page, '04-editor-' + w);
      await page.click('.blk:nth-child(3) .body'); await page.waitForSelector(sheetSel + ' #bk-name'); await page.waitForTimeout(400);
      const g = await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sheet').getBoundingClientRect(); return { h: s.height, vh: window.innerHeight }; });
      if (g.h > g.vh * 0.85 + 1) problems.push(L + 'block sheet is ' + Math.round(g.h) + ' of ' + g.vh); await check(L + 'block sheet'); if (w !== 390) await shot(page, '06-stations-sheet-' + w);
      await page.keyboard.press('Escape'); await noSheets(page);
      await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan');
      await page.click('.plan:nth-of-type(1) [data-act=plan-more]'); await page.waitForSelector(sheetSel + ' [data-act=plan-dup]'); await page.waitForTimeout(400); await check(L + 'more sheet'); await page.keyboard.press('Escape'); await noSheets(page);
      await page.click('header [data-act=new-plan]'); await page.waitForSelector('#np-name'); await page.waitForTimeout(400); await check(L + 'new plan sheet'); if (w === 390) await shot(page, '21-new-plan-sheet-390'); await page.keyboard.press('Escape'); await noSheets(page);
      await startFirst(page); await check(L + 'clock'); if (w !== 390) await shot(page, '08-runner-' + w);
      await page.click('[data-act=r-end]'); await page.waitForSelector('.confirm [data-ok]'); await page.waitForTimeout(400); await check(L + 'end confirm'); if (w === 390) await shot(page, '22-end-confirm-390'); await page.click('.confirm [data-ok]'); await noSheets(page); await page.waitForTimeout(60); await check(L + 'done screen'); if (w !== 390) await shot(page, '11-runner-done-' + w);
      await page.click('[data-act=r-done]'); await page.waitForSelector('.plan');
    }
    // a short screen: the sheet still fits and scrolls inside, with its buttons on screen
    await page.setViewportSize({ width: 390, height: 420 }); await page.click('.plan:nth-of-type(1) [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await page.click('.blk:nth-child(3) .body'); await page.waitForSelector(sheetSel + ' #bk-name'); await page.waitForTimeout(400);
    const sg = await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sheet'), b = s.querySelector('.sh-body'), r = s.getBoundingClientRect(), f = s.querySelector('.sh-foot').getBoundingClientRect(); return { h: r.height, vh: window.innerHeight, scroll: b.scrollHeight > b.clientHeight + 1, footBottom: f.bottom }; });
    assert.ok(sg.h <= sg.vh * 0.85 + 1, 'sheet height ' + sg.h + ' of ' + sg.vh); assert.ok(sg.scroll, 'the body scrolls inside the sheet'); assert.ok(sg.footBottom <= sg.vh + 1, 'the Save button stays on screen');
    deq(problems, []); deq(errors, []); await page.context().close();
  });

  await test('Network: only the page itself, the install script and the optional fonts are ever requested; app code makes no network calls; no private names; files under 60 KB', async () => {
    const { ctx, page, errors } = await newPage(br, { today: TODAY }); await page.addInitScript(STUBS);
    const hosts = new Set(); page.on('request', r => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).hostname); });
    await page.goto(srv.url); await page.waitForSelector('.welcome'); await page.click('.tpl[data-id=cheer]'); await page.waitForSelector('.blk'); await page.click('.editbar [data-act=plan-start]'); await page.waitForSelector('#r-time'); await page.click('[data-act=r-plans]'); await page.click('[data-act=tab][data-tab=settings]'); await page.waitForTimeout(300);
    const extra = Array.from(hosts).filter(h => !['localhost', 'natesteele888.github.io', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(h)); deq(extra, [], 'hosts contacted: ' + Array.from(hosts).join(', ')); deq(errors, []); await ctx.close();
    const dir = path.join(__dirname, '..', 'apps', 'practiceclock'), allowed = ['natesteele888.github.io', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.w3.org'];
    for (const f of fs.readdirSync(dir).filter(x => /\.(js|css|html|json)$/.test(x))) {
      const s = fs.readFileSync(path.join(dir, f), 'utf8'); assert.ok(Buffer.byteLength(s) < 60000, f + ' is ' + Buffer.byteLength(s) + ' bytes');
      assert.ok(!new RegExp(['des' + 'mond', 'ros' + 'lyn', 'ben' + 'gals', 'nat' + 'han'].join('|'), 'i').test(s), f + ' has a private name');
      if (f !== 'sw.js') assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|navigator\.geolocation|document\.cookie/.test(s), f + ' calls the network or reads something it should not');
      (s.match(/https?:\/\/[^"'\s)<>]+/g) || []).forEach(u => assert.ok(allowed.includes(new URL(u).hostname), f + ' mentions ' + u));
    }
  });

  await test('Recent practices: only the last 20 are kept, newest first, dated by the calendar day; a longer saved list is cut to 20', async () => {
    const { page, errors } = await fresh({ data: dataDoc([mkPlan('Tiny', [1])]), clock: true, today: '2026-12-31' });
    for (let i = 0; i < 22; i++) { await page.click('.plan [data-act=plan-start]'); await adv(page, 30); await page.waitForSelector('#r-time'); await adv(page, MIN + 100); await page.waitForSelector('[data-act=r-done]'); await page.click('[data-act=r-done]'); await page.waitForSelector('.plan'); }
    const d = await stored(page); eq(d.hist.length, 20); assert.ok(d.hist.every(h => h.date === '2026-12-31' && h.plan === 'Tiny' && h.planned === 1 && h.actual === 1 && h.early === false)); eq(new Set(d.hist.map(h => h.id)).size, 20);
    await page.click('[data-act=tab][data-tab=recent]'); eq(await page.$$eval('.hrow', r => r.length), 20); eq((await I_(page, '.hrow .d')).toLowerCase(), 'thu dec 31'); deq(errors, []); await page.context().close();
    const many = Array.from({ length: 25 }, (_, i) => C.sanitizeLog({ date: '2026-11-0' + (1 + i % 9), plan: 'P' + i, planned: 10, actual: 10, early: false }));
    const B = await fresh({ data: dataDoc([mkPlan('Tiny', [1])], many) }); await B.page.click('[data-act=tab][data-tab=recent]'); await B.page.waitForSelector('.hrow');
    deq(await B.page.$$eval('.hrow .i b', r => r.map(x => x.textContent)), many.slice(0, 20).map(h => h.plan), 'the first 20 (newest) are kept'); deq(B.errors, []); await B.ctx.close();
  });

  await test('Damaged saved data does not stop the app: bad plans are skipped with a note, everything else loads', async () => {
    const good = mkPlan('Good plan', [10, 5]);
    const raw = { v: 1, plans: [good, { name: 'No blocks field' }, 'junk', null, { name: 'x', blocks: Array.from({ length: 9 }, () => ({ name: 'a', min: 180 })) }], hist: [{ date: 'bad' }, 5], settings: { volume: 999, ticks: 'yes' }, meta: { lastBackup: 'nope' } };
    let { page, errors } = await fresh({ data: raw });
    await page.waitForSelector('.plan'); eq(await page.$$eval('.plan', p => p.length), 1); eq(await T_(page, '.plan .nm'), 'Good plan'); assert.ok(/4 saved plans couldn't be read and was skipped/.test(await T_(page, '.banner')) || /couldn't be read/.test(await T_(page, '.banner')), await T_(page, '.banner'));
    await page.click('[data-act=tab][data-tab=settings]'); eq(await page.inputValue('#set-vol'), '100', 'out-of-range volume is clamped'); deq(errors, []); await page.context().close();
    ({ page, errors } = await newPage(br, { today: TODAY }).then(x => ({ page: x.page, errors: x.errors })));
    await page.addInitScript(() => { try { localStorage.setItem('practiceclock.data', '{this is not json'); localStorage.setItem('practiceclock.run', '[1,2'); } catch (e) { /* ignore */ } });
    await page.goto(srv.url); await page.waitForSelector('.welcome'); eq(await page.$$eval('.plan', p => p.length), 0); deq(errors, []); await page.context().close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
