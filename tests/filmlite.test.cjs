// Film Lite tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/filmlite.test.cjs
// Uses Google Chrome on the Mac, Playwright's Chromium elsewhere (lib.cjs CHROME). Starts its own static server on a free port.
// The video used by the browser tests is made by the app's own example generator (a real MediaRecorder webm
// whose header says "duration unknown", which also exercises the seek-to-end duration fix).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/filmlite/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07';
const APPDIR = path.resolve(__dirname, '../apps/filmlite');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'filmlite-test-'));
const SAMPLE = path.join(TMP, 'swing-clip.webm');
const results = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name) && !/^setup:/.test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || 'near') + ': ' + a + ' vs ' + b + ' (tol ' + tol + ')');
const deq = (a, b, m) => assert.deepStrictEqual(a, b, m);
const shot = async (page, name) => { await page.waitForTimeout(600); await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {}); return page.screenshot({ path: path.join(SHOTS, 'filmlite-' + name + '.png') }); }; // wait: sheets and toasts finish animating first

/* ---------- page helpers ---------- */
const vstate = page => page.evaluate(() => { const v = document.querySelector('.player video'); return v ? { t: v.currentTime, dur: v.duration, rate: v.playbackRate, paused: v.paused, loop: v.loop, muted: v.muted, seeking: v.seeking } : null; });
const ct = async page => (await vstate(page)).t;
async function seek(page, t) {
  await page.evaluate(x => { FL.Player.seek(x, { user: true }); }, t);
  await page.waitForFunction(x => { const v = document.querySelector('.player video'); return !v.seeking && Math.abs(v.currentTime - x) < 0.02; }, t, { timeout: 4000 });
}
async function openSample(page, file) {
  await page.waitForSelector('.home');
  await page.setInputFiles('.home input[data-pick]', file || SAMPLE);
  await page.waitForSelector('.player video', { timeout: 12000 });
  await page.waitForFunction(() => { const v = document.querySelector('.player video'); return v && v.readyState >= 2; }, null, { timeout: 8000 });
}
const sheetCount = page => page.$$eval('.sheet-wrap.open', s => s.length);
const settle = page => page.waitForTimeout(450);
const toasts = page => page.$$eval('.toast', els => els.map(e => e.textContent));
async function waitToast(page, re) {
  await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 5000 });
}
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('button, a.btn, select, label.btn, input[type=text], textarea').forEach(el => {
      if (el.closest('[hidden]') || el.closest('.sr') || el.closest('.sheet-wrap:not(.open)')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 43.5 || r.width < 43.5) bad.push((el.tagName + ' ' + (el.getAttribute('aria-label') || el.textContent || el.id || '')).trim().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return bad;
  });
}
async function tinyText(page) {
  return page.evaluate(() => {
    const bad = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (parseFloat(cs.fontSize) < 11.99) bad.push(parseFloat(cs.fontSize) + 'px "' + n.nodeValue.trim().slice(0, 30) + '"');
    }
    return bad;
  });
}
async function tagNow(page, { kind, part, note }) {
  await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open');
  if (kind) await page.click('.sheet-wrap.open [data-kind="' + kind + '"]');
  if (part) await page.click('.sheet-wrap.open [data-part="' + part + '"]');
  if (note != null) await page.fill('#edNote', note);
  await page.click('[data-act=ed-save]');
  await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'), null, { timeout: 4000 });
}
const tagRows = page => page.$$eval('.tg', rows => rows.map(r => ({ tm: r.querySelector('.tm').textContent, kind: r.querySelector('.kind').textContent, part: (r.querySelector('.part') || {}).textContent || '', note: r.querySelector('.nt').textContent, draw: !!r.querySelector('.has-d') })));
const lsDump = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('filmlite.') === 0) o[k] = localStorage.getItem(k); } return o; });
const ovBlank = page => page.evaluate(() => FL.Draw.blank(document.getElementById('ov')));
async function dragOn(page, sel, pts) {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + pts[0][0] * b.width, b.y + pts[0][1] * b.height); await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(b.x + p[0] * b.width, b.y + p[1] * b.height, { steps: 6 });
  await page.mouse.up();
}
function pngInfo(file) {
  const b = fs.readFileSync(file);
  return { sig: b.slice(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: b.length };
}
async function pngCount(page, file, rgb, tol) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async ([b64, rgb, tol]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) n++;
    return { w: c.width, h: c.height, count: n };
  }, [b64, rgb, tol]);
}

(async () => {
  const srv = await startServer('filmlite'), br = await launch();

  /* ============================================================
     core.js: pure logic with hand-computed answers
     ============================================================ */
  await test('core: time formatting and rounding edge cases', () => {
    eq(C.fmtTime(0, 1), '0:00.0'); eq(C.fmtTime(0, 2), '0:00.00'); eq(C.fmtTime(12.34, 1), '0:12.3'); eq(C.fmtTime(12.3449, 2), '0:12.34'); eq(C.fmtTime(12.346, 2), '0:12.35');
    eq(C.fmtTime(59.999, 1), '1:00.0', '59.999 rounds up into the next minute'); eq(C.fmtTime(59.999, 2), '1:00.00'); eq(C.fmtTime(59.949, 1), '0:59.9');
    eq(C.fmtTime(3599.96, 1), '1:00:00.0'); eq(C.fmtTime(3661.5, 0), '1:01:02'); eq(C.fmtTime(7325, 0), '2:02:05');
    eq(C.fmtTime(0.4, 0), '0:00'); eq(C.fmtTime(0.5, 0), '0:01'); eq(C.fmtTime(125, 0), '2:05'); eq(C.fmtTime(9.05, 2), '0:09.05'); eq(C.fmtTime(600, 1), '10:00.0');
    eq(C.fmtTime(-3, 1), '0:00.0'); eq(C.fmtTime(NaN, 1), '0:00.0'); eq(C.fmtTime(Infinity, 1), '0:00.0'); eq(C.fmtTime('abc'), '0:00.0'); eq(C.fmtTime(null, 2), '0:00.00');
    eq(C.fmtSize(0), '0 B'); eq(C.fmtSize(1536), '2 KB'); eq(C.fmtSize(5242880), '5 MB'); eq(C.fmtSize(1288490189), '1.2 GB'); eq(C.fmtSize(-1), ''); eq(C.fmtDate('2026-11-07'), 'Nov 7, 2026'); eq(C.fmtDate('2026-02-30'), '');
  });
  await test('core: frame stepping snaps to frame boundaries and clamps at 0 and the end', () => {
    near(C.stepTime(0, 1, 30, 10), 1 / 30, 1e-6, '0 -> 1/30'); eq(C.stepTime(0, -1, 30, 10), 0, 'back at 0 stays at 0');
    eq(C.stepTime(10, 1, 30, 10), 10, 'forward at the end stays at the end'); near(C.stepTime(10, -1, 30, 10), 299 / 30, 1e-6, 'back from the end');
    near(C.stepTime(0.05, -1, 30, 10), 1 / 30, 1e-6, 'back from mid-frame 1.5 goes to the start of frame 1'); near(C.stepTime(0.05, 1, 30, 10), 2 / 30, 1e-6, 'forward from mid-frame goes to frame 2');
    near(C.stepTime(0.5, 1, 24, 10), 13 / 24, 1e-6, '24 fps'); near(C.stepTime(1, 1, 60, 10), 61 / 60, 1e-6, '60 fps'); near(C.stepTime(1, -1, 60, 10), 59 / 60, 1e-6);
    near(C.stepTime(1 / 30 + 0.0007, -1, 30, 10), 0, 1e-6, 'a hair past a frame start still counts as that frame');
    near(C.stepTime(3.51, 1, 30, 3.51), 3.51, 1e-9, 'end that is not a whole number of frames'); near(C.stepTime(3.51, -1, 30, 3.51), 3.5, 1e-6, 'back from a partial last frame goes to its start');
    eq(C.stepTime(NaN, 1, 30, 10), C.stepTime(0, 1, 30, 10), 'bad time treated as 0'); eq(C.stepTime(-5, -1, 30, 10), 0); near(C.stepTime(20, -1, 30, 10), 299 / 30, 1e-6, 'past the end clamps first');
    near(C.snapToFrame(0.05, 30), 2 / 30, 1e-9); near(C.snapToFrame(0.04, 30), 1 / 30, 1e-9); eq(C.snapToFrame(1, 24), 1); eq(C.snapToFrame(-1, 30), 0);
    eq(C.frameIndex(1 / 30, 30), 1, 'float boundary lands on the frame'); eq(C.frameIndex(10, 30), 300); eq(C.frameIndex(0.0333, 30), 0); eq(C.frameIndex(-2, 30), 0);
    near(C.frameTime(300, 30), 10, 1e-9); near(C.seekTime(1 / 30, 30, 10), 1 / 30 + 0.02 / 30, 1e-9); eq(C.seekTime(10, 30, 10), 10, 'seek target never passes the end');
    assert.ok(C.sameFrame(1 / 30, 1 / 30 + 0.02, 30) && !C.sameFrame(1 / 30, 2 / 30 + 0.001, 30));
    eq(C.nudgeTime(0.05, -0.1, 10), 0); eq(C.nudgeTime(9.95, 0.1, 10), 10); eq(C.nudgeTime(5, 0.1, 10), 5.1); eq(C.nudgeTime(5.1, -0.1, 10), 5); eq(C.nudgeTime(12, 5, 10), 10); eq(C.nudgeTime(3, -5, 10), 0);
  });
  await test('core: tag sorting, overlap, lanes, filters and counts', () => {
    const tg = (id, t, e, cat) => ({ id: id, t: t, e: e == null ? null : e, cat: cat || 'fix', part: '', note: '', d: null });
    deq(C.sortTags([tg('c', 5), tg('a', 1), tg('b', 1, 3), tg('d', 1)]).map(x => x.id), ['a', 'd', 'b', 'c'], 'by start, then segments after moments, then id');
    assert.ok(C.tagsOverlap(tg('a', 0, 5), tg('b', 3, 8))); assert.ok(!C.tagsOverlap(tg('a', 0, 2), tg('b', 3, 8))); assert.ok(C.tagsOverlap(tg('a', 0, 3), tg('b', 3, 8)), 'touching counts'); assert.ok(C.tagsOverlap(tg('a', 4), tg('b', 3, 8))); assert.ok(!C.tagsOverlap(tg('a', 9), tg('b', 3, 8)));
    deq(C.assignLanes([tg('a', 0, 5), tg('b', 3, 8), tg('c', 6, 9), tg('p', 4)]), { a: 0, b: 1, c: 0 }, 'overlapping segments get different rows; moments get none');
    const mixed = [tg('a', 1, null, 'good'), tg('b', 2, null, 'fix'), tg('c', 3, null, 'fix'), tg('d', 4, null, 'coach')];
    deq(C.filterTags(mixed, 'fix').map(x => x.id), ['b', 'c']); eq(C.filterTags(mixed, 'all').length, 4); eq(C.filterTags(mixed, '').length, 4);
    deq(C.countByCat(mixed), { all: 4, good: 1, fix: 2, question: 0, coach: 1 });
    // loop ranges
    deq(C.tagLoopRange(tg('a', 5, 7), 20), { a: 5, b: 7 }, 'a segment loops itself'); deq(C.tagLoopRange(tg('a', 5), 20), { a: 4, b: 7 }, 'a moment loops 1 s before to 2 s after');
    deq(C.tagLoopRange(tg('a', 0.4), 20), { a: 0, b: 2.4 }, 'clamped at 0'); deq(C.tagLoopRange(tg('a', 19.5), 20), { a: 18.5, b: 20 }, 'clamped at the end'); deq(C.tagLoopRange(tg('a', 20), 20), { a: 19, b: 20 });
    // wrap
    eq(C.loopWrap(7, 5, 7), 5, 'at the end jumps to the start'); eq(C.loopWrap(7.4, 5, 7), 5); eq(C.loopWrap(6.99, 5, 7), null); eq(C.loopWrap(6.99, 5, 7, 0.02), 5, 'lead time'); eq(C.loopWrap(1, 5, 7), null, 'before the loop: leave it'); eq(C.loopWrap(5, 5, 5.01), null, 'degenerate loop never wraps'); eq(C.loopWrap(NaN, 5, 7), null);
    assert.ok(C.inLoop(5, 5, 7) && C.inLoop(7.04, 5, 7) && !C.inLoop(7.2, 5, 7) && !C.inLoop(4.9, 5, 7));
    // drawings and the highlighted tag
    const withD = Object.assign(tg('d', 2), { d: { ar: 1.78, s: [{ k: 'line', c: 0, w: 1, p: [[0, 0], [1, 1]] }] } });
    deq(C.drawingTagsAt([withD, tg('x', 2)], 2.005, 30).map(x => x.id), ['d']); deq(C.drawingTagsAt([withD], 2.05, 30), [], 'next frame has no drawing'); deq(C.drawingTagsAt([withD], 1.95, 30), []);
    eq(C.activeTagAt([tg('a', 1), tg('b', 2, 4)], 3, 30), 'b'); eq(C.activeTagAt([tg('a', 1), tg('b', 2, 4)], 1.02, 30), 'a'); eq(C.activeTagAt([tg('a', 1), tg('b', 2, 4)], 1.5, 30), null); eq(C.activeTagAt([], 1, 30), null);
  });
  await test('core: angle between two lines (hand computed) and stroke coordinates', () => {
    const A = (l1, l2, tol) => C.angleDeg(l1, l2, tol).deg;
    near(A([[0, 0], [1, 0]], [[0, 0], [0, 1]], 0.01), 90, 1e-9, 'perpendicular');
    near(A([[0, 0], [1, 0]], [[0, 1], [1, 1]], 0.01), 0, 1e-9, 'parallel, same way'); near(A([[0, 0], [1, 0]], [[1, 1], [0, 1]], 0.01), 180, 1e-9, 'parallel, opposite way');
    near(A([[0, 0], [1, 0]], [[0, 0], [1, 1]], 0.01), 45, 1e-9, '45 at a shared corner');
    near(A([[1, 0], [0, 0]], [[0, 0], [-1, 1]], 0.01), 135, 1e-9, 'obtuse corner: line 1 ends where line 2 starts, angle measured AT the corner (not the 45 the drawn directions give)');
    near(A([[1, 0], [0, 0]], [[0.2, 0], [-0.8, 1]], 0.01), 45, 1e-9, 'ends farther apart than the join distance: plain direction angle (45), not a corner');
    near(A([[1, 0], [0, 0]], [[0, 0], [-1, 1]], 0), 135, 1e-9, 'ends exactly on each other still join even with a join distance of 0');
    near(A([[0, 0], [2, 0]], [[0, 5], [5, 5]], 0.01), 0, 1e-9, 'different lengths'); near(A([[0, 0], [0, 0]], [[0, 0], [1, 0]], 0), 0, 1e-9, 'zero-length line gives 0 not NaN');
    const j = C.angleDeg([[0, 1], [0, 0]], [[0, 0], [1, 0]], 0.01); assert.ok(j.joined); deq(j.vertex, [0, 0]); near(j.deg, 90, 1e-9);
    // an angle stroke on a 2:1 frame: arms (0.5,0.25) and (0.5,0.5) from the corner (0.25,0.5) measure 26.6 degrees on screen, 45 if you ignore the shape
    const st = [[0.25, 0.5], [0.5, 0.25], [0.25, 0.5], [0.5, 0.5]];
    eq(C.strokeAngle(st, 2).deg, 26.6, 'true on-screen degrees on a wide frame'); eq(C.strokeAngle(st, 1).deg, 45); eq(C.strokeAngle(st, 0).deg, 45, 'bad aspect treated as square');
    deq(C.norm(195, 211, 390, 422), [0.5, 0.5]); deq(C.norm(-5, 999, 390, 422), [0, 1], 'clamped to the frame'); deq(C.norm(1, 1, 3, 3), [0.3333, 0.3333]); deq(C.denorm([0.25, 0.5], 400, 200), [100, 100]);
    const back = C.denorm(C.norm(123, 77, 640, 360), 640, 360); near(back[0], 123, 0.05); near(back[1], 77, 0.05);
  });
  await test('core: fingerprint and matching a video to its notes', () => {
    eq(C.fnv1a('').toString(16), '811c9dc5'); eq(C.fnv1a('a').toString(16), 'e40c292c'); eq(C.fnv1a('foobar').toString(16), 'bf9cf968', 'published FNV-1a test vectors');
    eq(C.fpKey({ name: 'a.mp4', size: 100, lm: 5, dur: 12.4 }), 'a.mp4|100|5|12'); eq(C.fpKey({ name: 'a.mp4', size: 100, lm: 5, dur: 12.5 }), 'a.mp4|100|5|13');
    const m = { name: 'swing.mp4', size: 5000, lm: 1700000000000, dur: 12.4 };
    const f = C.fingerprint(m); assert.ok(/^f[0-9a-f]{16}$/.test(f) && C.ID_RE.test(f), f);
    eq(C.fingerprint(Object.assign({}, m, { dur: 12.49 })), f, 'tiny length differences between browsers do not matter');
    assert.notStrictEqual(C.fingerprint(Object.assign({}, m, { dur: 13.6 })), f); assert.notStrictEqual(C.fingerprint(Object.assign({}, m, { name: 'swing2.mp4' })), f); assert.notStrictEqual(C.fingerprint(Object.assign({}, m, { size: 5001 })), f); assert.notStrictEqual(C.fingerprint(Object.assign({}, m, { lm: m.lm + 1 })), f);
    const clip = (o) => Object.assign({ id: C.fingerprint(m), name: m.name, size: m.size, lm: m.lm, dur: 12, tags: [] }, o || {});
    eq(C.matchClip([clip()], m).id, f, 'exact'); eq(C.matchClip([], m), null);
    eq(C.matchClip([clip({ id: 'oldid123' })], Object.assign({}, m, { lm: m.lm + 99999 })).id, 'oldid123', 'same name and size, the phone changed the date');
    eq(C.matchClip([clip({ id: 'oldid123' })], Object.assign({}, m, { name: 'IMG_0001.mov' })).id, 'oldid123', 'same size and date, renamed');
    eq(C.matchClip([clip({ id: 'oldid123' })], Object.assign({}, m, { dur: 20 })), null, 'a different length is a different video');
    eq(C.matchClip([clip({ id: 'oldid123' })], Object.assign({}, m, { name: 'other.mp4', lm: 5 })), null, 'nothing in common');
    eq(C.matchClip([clip({ id: 'example', size: 5000 })], Object.assign({}, m, { lm: 3 })), null, 'the built-in example never matches a real file loosely');
  });
  await test('core: notes text, labels, settings and presets', () => {
    const clip = { title: 'Practice swing', name: 'x.mp4', tags: [
      { id: 'b', t: 12.4, e: null, cat: 'fix', part: '', note: 'Elbow dropped', d: null },
      { id: 'a', t: 3.04, e: 5.5, cat: 'good', part: 'Load', note: 'Good\nweight shift', d: null },
      { id: 'c', t: 61.25, e: null, cat: 'question', part: 'Hands', note: '', d: null }] };
    eq(C.notesToText(clip), 'Practice swing\n\n0:03.0-0:05.5 Good (Load) - Good weight shift\n0:12.4 Fix - Elbow dropped\n1:01.3 Question (Hands)', 'time order, segments, parts, one line each');
    eq(C.notesToText({ title: '', name: 'x.mp4', tags: [] }), 'x.mp4\n\n(No tags yet)'); eq(C.notesToText(clip, { header: false }).split('\n')[0], '0:03.0-0:05.5 Good (Load) - Good weight shift');
    eq(C.tagLine({ t: 0.04, e: null, cat: 'coach', part: '', note: '' }), '0:00.0 Coach note');
    deq(C.parseLabels('Stance, Swing ,, stance, Finish;Follow  through\nA'), ['Stance', 'Swing', 'Finish', 'Follow through', 'A'], 'trim, no blanks, no repeats ignoring case, commas semicolons and new lines');
    eq(C.parseLabels('1,2,3,4,5,6,7,8,9,10').length, 8, 'at most 8'); eq(C.parseLabels('x'.repeat(50))[0].length, 20, 'each at most 20 characters'); deq(C.parseLabels(null), []);
    deq(C.partsFor({ preset: 'baseball-hit' }), ['Load', 'Stride', 'Hands', 'Contact', 'Finish']); deq(C.partsFor({ preset: 'baseball-pitch' }), ['Grip', 'Balance', 'Arm slot', 'Release', 'Follow-through']);
    deq(C.partsFor({ preset: 'basketball-shoot' }), ['Feet', 'Elbow', 'Release', 'Follow-through']); deq(C.partsFor({ preset: 'cheer' }), ['Timing', 'Landing', 'Formation', 'Spacing']);
    deq(C.partsFor({ preset: 'none' }), []); deq(C.partsFor({ preset: 'custom', custom: ['One', 'Two'] }), ['One', 'Two']); deq(C.partsFor({ preset: 'bogus' }), C.partsFor({ preset: 'baseball-hit' }), 'unknown preset falls back to the default');
    deq(C.sanitizeSettings({ fps: 25, speed: 3, precise: 'yes', preset: 'x', custom: 'nope' }), { fps: 30, speed: 1, precise: false, preset: 'baseball-hit', custom: [] }, 'bad values fall back to defaults');
    deq(C.sanitizeSettings({ fps: '60', speed: '0.25', precise: true, preset: 'cheer' }), { fps: 60, speed: 0.25, precise: true, preset: 'cheer', custom: [] }); deq(C.sanitizeSettings(null), C.sanitizeSettings({}));
    eq(C.slug('My Swing #3.MOV'), 'my-swing-3'); eq(C.slug('???'), 'clip'); eq(C.slug(''), 'clip');
  });
  await test('core: sanitizing tags, drawings and clips; backup validation round trip', () => {
    eq(C.sanitizeTag({ t: 'x' }), null); eq(C.sanitizeTag(null), null); eq(C.sanitizeTag({ t: null }), null); eq(C.sanitizeTag({ t: Infinity }), null);
    let g = C.sanitizeTag({ t: 12.34567, e: 12.3, cat: 'weird', part: ' Load  ', note: 'x'.repeat(600) + '\u0000' });
    eq(g.t, 12.346); eq(g.e, null, 'end must come after start'); eq(g.cat, 'fix', 'unknown category'); eq(g.part, 'Load'); eq(g.note.length, 500); assert.ok(C.ID_RE.test(g.id));
    g = C.sanitizeTag({ id: 'abc', t: -5, e: 9999999, cat: 'good' }); eq(g.t, 0); eq(g.e, 360000, 'capped'); eq(g.id, 'abc');
    eq(C.sanitizeTag({ t: 1, e: 1.0005 }).e, null, 'an end a hair after the start is no end');
    eq(C.sanitizeDrawing({ s: [] }), null); eq(C.sanitizeDrawing({ s: [{ k: 'nope', c: 0, w: 0, p: [[0, 0]] }] }), null, 'unknown tool dropped');
    const d = C.sanitizeDrawing({ ar: 99, s: [{ k: 'circle', c: 7, w: -1, p: [[0.5, 0.5], [2, -1]] }, { k: 'circle', p: [[0.1, 0.1]] }, { k: 'angle', p: [[0, 0], [1, 1]] }, { k: 'pen', p: [[0.2, 0.3]] }, { k: 'line', p: [[0, 0], ['a', 1]] }] });
    eq(d.s.length, 2, 'wrong point counts and non-numbers dropped, a one-point pen is a dot'); eq(d.ar, 5, 'aspect capped'); deq(d.s[0], { k: 'circle', c: 2, w: 0, p: [[0.5, 0.5], [1, 0]] }, 'colours and widths clamped, points clamped to the frame');
    const pen = C.sanitizeDrawing({ s: [{ k: 'pen', p: Array.from({ length: 900 }, (_, i) => [i / 900, 0.5]) }] }); eq(pen.s[0].p.length, 400, 'a pen stroke keeps at most 400 points');
    eq(C.sanitizeDrawing({ s: Array.from({ length: 90 }, () => ({ k: 'line', p: [[0, 0], [1, 1]] })) }).s.length, 60, 'at most 60 shapes');
    eq(C.sanitizeClip({ id: 'a' }), null, 'id too short'); eq(C.sanitizeClip({ id: 'ok-id', name: 'My Clip.mp4' }, TODAY).title, 'My Clip'); eq(C.sanitizeClip({ id: 'ok-id' }, TODAY).created, TODAY);
    const c = C.sanitizeClip({ id: 'ok-id', name: 'a.mp4', title: '  <b>x</b>  ', tags: [{ id: 'dup', t: 1 }, { id: 'dup', t: 2 }, { t: 'bad' }, null] }, TODAY);
    eq(c.title, '<b>x</b>'); eq(c.tags.length, 2); assert.notStrictEqual(c.tags[0].id, c.tags[1].id, 'duplicate tag ids get a new id');
    eq(C.sanitizeClip({ id: 'ok-id', tags: Array.from({ length: 400 }, (_, i) => ({ t: i })) }, TODAY).tags.length, 300, 'at most 300 tags');
    const clips = [C.sanitizeClip({ id: 'clip-one', name: 'a.mp4', size: 10, lm: 5, dur: 4, tags: [{ id: 't-1', t: 1.5, e: 2.5, cat: 'good', part: 'Load', note: 'Nice', d: { ar: 1.7778, s: [{ k: 'arrow', c: 1, w: 2, p: [[0.1, 0.2], [0.8, 0.9]] }] } }] }, TODAY)];
    const b = C.makeBackup({ fps: 60, speed: 0.5, precise: true, preset: 'cheer' }, clips, TODAY);
    eq(b.app, 'filmlite'); eq(b.v, 1); eq(b.saved, TODAY); assert.ok(/never included/.test(b.note));
    const v = C.validateBackup(JSON.parse(JSON.stringify(b)), TODAY);
    assert.ok(v.ok); deq(v.clips, clips, 'round trip keeps everything, drawings included'); eq(v.settings.fps, 60); eq(v.tagCount, 1);
    for (const bad of [null, 5, 'x', [], {}, { app: 'other', v: 1, clips: [] }, { app: 'filmlite', clips: [] }, { app: 'filmlite', v: 1 }, { app: 'filmlite', v: 1, clips: 'no' }]) eq(C.validateBackup(bad, TODAY).ok, false, JSON.stringify(bad));
    assert.ok(/newer version/.test(C.validateBackup({ app: 'filmlite', v: 2, clips: [] }, TODAY).error));
    const many = C.validateBackup({ app: 'filmlite', v: 1, clips: Array.from({ length: 260 }, (_, i) => ({ id: 'clip' + i, name: 'x' + i })).concat([{ id: 'clip3', name: 'dup' }, 'junk']) }, TODAY);
    eq(many.clips.length, 200, 'at most 200 clips'); const mixed = C.validateBackup({ app: 'filmlite', v: 1, clips: [{ id: 'good-id', name: 'a' }, { id: 'good-id', name: 'dup' }, 'junk', { id: 'x' }] }, TODAY);
    eq(mixed.clips.length, 1); eq(mixed.skipped, 3, 'duplicates and junk are skipped and counted');
  });
  await test('files: every script, stylesheet and icon the page uses is in the offline list; no file over 60 KB; no network calls in the code', () => {
    const idx = fs.readFileSync(path.join(APPDIR, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(APPDIR, 'sw.js'), 'utf8');
    const shell = JSON.parse(sw.match(/const SHELL = (\[.*?\]);/)[1]);
    const refs = []; idx.replace(/<script src="([^"h][^"]*)"/g, (m, s) => refs.push(s)); idx.replace(/<link rel="stylesheet" href="([^"h][^"]*)"/g, (m, s) => refs.push(s));
    assert.ok(refs.length >= 8, refs.join());
    refs.forEach(r => assert.ok(shell.includes(r), r + ' is in SHELL'));
    ['./', 'manifest.json', '/apps/icons/filmlite-192.png', '/apps/icons/filmlite-512.png'].forEach(r => assert.ok(shell.includes(r), r));
    assert.ok(/const CACHE = "filmlite-v2"/.test(sw) && /startsWith\("filmlite-"\)/.test(sw) && /ignoreSearch: ?true/.test(sw));
    const man = JSON.parse(fs.readFileSync(path.join(APPDIR, 'manifest.json'), 'utf8'));
    eq(man.id, './'); eq(man.start_url, './'); eq(man.scope, './'); eq(man.display, 'standalone'); eq(man.orientation, 'any'); eq(man.icons.length, 3); eq(man.icons[2].purpose, 'maskable');
    man.icons.forEach(i => assert.ok(fs.existsSync(path.join(APPDIR, '..', i.src.replace('/apps/', '')))));
    for (const f of fs.readdirSync(APPDIR)) {
      const full = path.join(APPDIR, f), sz = fs.statSync(full).size; assert.ok(sz < 60 * 1024, f + ' is ' + sz + ' bytes');
      if (/\.js$/.test(f) && f !== 'sw.js') { const src = fs.readFileSync(full, 'utf8'); assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src), f + ' makes no network calls'); }
    }
    const urls = (idx.match(/https?:\/\/[^"')\s]+/g) || []).filter(u => !/^https:\/\/(natesteele888\.github\.io\/apps\/install\.js|fonts\.(googleapis|gstatic)\.com)/.test(u) && !/w3\.org/.test(u));
    deq(urls, [], 'only the shared install script and the optional fonts are referenced');
    const css = fs.readFileSync(path.join(APPDIR, 'filmlite.css'), 'utf8'); assert.ok(/prefers-reduced-motion/.test(css) && /safe-area-inset-bottom/.test(css));
  });

  /* ============================================================
     the browser: make a real video with the app's own example maker
     ============================================================ */
  await test('Example: "See an example" makes a real video in a few seconds and opens it with 3 sample tags, shown in the player', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    const reqs = []; page.on('request', r => { const u = r.url(); if (!/^(data:|blob:|about:)/.test(u) && !/^http:\/\/localhost:/.test(u) && !/^https:\/\/(natesteele888\.github\.io\/apps\/install\.js|fonts\.(googleapis|gstatic)\.com\/)/.test(u)) reqs.push(u); });
    await page.goto(srv.url); await page.waitForSelector('.home');
    await shot(page, '01-home-390');
    eq((await page.textContent('#exBtn')).trim(), 'See an example'); assert.ok((await page.textContent('.home label.file-btn')).includes('Choose a video'));
    const t0 = Date.now();
    await page.click('text=See an example');
    await page.waitForSelector('.player video', { timeout: 9000 });
    await page.waitForFunction(() => { const v = document.querySelector('.player video'); return v && v.readyState >= 2; });
    const took = Date.now() - t0; assert.ok(took < 7500, 'example opened within ~6 s, took ' + took + 'ms');
    const s = await vstate(page); assert.ok(isFinite(s.dur) && s.dur > 3.2 && s.dur < 4.2, 'duration fixed and finite: ' + s.dur);
    eq((await page.$$('.tg')).length, 3, 'three sample tags'); eq(await page.textContent('#plTitle'), 'Example clip');
    deq((await tagRows(page)).map(r => r.kind), ['Good', 'Fix', 'Question']); deq((await tagRows(page)).map(r => r.draw), [false, true, true], 'two sample tags carry drawings');
    eq((await page.$$('#scMarks .mk')).length, 3, 'markers on the scrub bar'); eq((await page.$$('#scMarks .mk-seg')).length, 1, 'the segment tag shows a bar');
    await page.waitForTimeout(250); await shot(page, '02-example-390');
    deq(reqs, [], 'no requests except this app, the shared install script and the optional fonts');
    deq(errors, []); await page.context().close();
  });
  // make the sample file for the rest of the tests (the example's own bytes)
  await test('setup: save the example video to a file for "Choose a video" tests', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 });
    const b64 = await page.evaluate(async () => { const b = await (await fetch(document.querySelector('.player video').src)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); }); });
    fs.writeFileSync(SAMPLE, Buffer.from(b64, 'base64'));
    assert.ok(fs.statSync(SAMPLE).size > 20000, 'sample is ' + fs.statSync(SAMPLE).size + ' bytes');
    deq(errors, []); await page.context().close();
  });

  await test('Choosing a file: opens, fixes the unknown-length webm so the scrub bar works, shows the empty tag list and the "same file again" note', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    const s = await vstate(page); assert.ok(isFinite(s.dur) && s.dur > 3.2 && s.dur < 4.2, 'finite duration ' + s.dur);
    eq(await page.textContent('#plTitle'), 'swing-clip'); eq((await page.textContent('#tTot')).trim(), '/ 0:04'); assert.ok(/No tags yet/.test(await page.textContent('#tagsBox')));
    // click the scrub bar halfway: lands about halfway
    const b = await page.locator('#scrub').boundingBox();
    await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2); await page.waitForTimeout(300);
    near((await ct(page)) / s.dur, 0.5, 0.03, 'scrub click lands near the middle');
    await page.mouse.click(b.x + b.width * 0.98, b.y + b.height / 2); await page.waitForTimeout(250); assert.ok((await ct(page)) > s.dur * 0.9, 'near the end');
    await page.mouse.click(b.x + 2, b.y + b.height / 2); await page.waitForTimeout(250); assert.ok((await ct(page)) < 0.2, 'near the start');
    deq(errors, []); await page.context().close();
  });

  await test('Player: frame step moves exactly 1/fps, clamps at 0 and the end; jump and nudge; fps setting (24/30/60)', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    const dur = (await vstate(page)).dur;
    await page.click('[data-act=step][data-d="-1"]'); await page.waitForTimeout(150); near(await ct(page), 0, 0.002, 'back at 0 stays at 0');
    await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near(await ct(page), 1 / 30, 0.002, 'first step');
    await seek(page, 1.0); const t1 = await ct(page);
    await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); const t2 = await ct(page); near(t2 - t1, 1 / 30, 0.0025, '+1 frame');
    await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near((await ct(page)) - t2, 1 / 30, 0.0025, '+1 frame again');
    await page.click('[data-act=step][data-d="-1"]'); await page.waitForTimeout(250); near(await ct(page), t2, 0.0025, 'back one frame');
    eq((await vstate(page)).paused, true, 'stepping pauses');
    // 60 fps from Settings
    await page.click('#fpsBtn'); await page.waitForTimeout(100); eq((await page.textContent('#fpsBtn')).trim(), '60 fps', 'tapping the fps chip cycles 30 -> 60');
    const t3 = await ct(page); await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near((await ct(page)) - t3, 1 / 60, 0.0025, 'one step at 60 fps'); eq(await page.textContent('#tFr'), 'frame ' + C.frameIndex(await ct(page), 60));
    await page.click('#fpsBtn'); eq((await page.textContent('#fpsBtn')).trim(), '24 fps'); const t4 = await ct(page); await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near(await ct(page), C.stepTime(t4, 1, 24, dur), 0.0025, 'one step at 24 fps lands on the next 24 fps frame'); const t5 = await ct(page); assert.ok(t5 > t4 && t5 - t4 <= 1 / 24 + 0.003, 'moved forward by at most a frame'); await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near((await ct(page)) - t5, 1 / 24, 0.0025, 'then exactly 1/24 per step');
    // the end
    await seek(page, dur); await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); assert.ok((await ct(page)) <= dur + 0.001 && (await ct(page)) > dur - 0.05, 'forward at the end clamps');
    // +-5 s and +-0.1 s
    await seek(page, 0.5); await page.click('[data-act=jump][data-d="5"]'); await page.waitForTimeout(250); near(await ct(page), dur, 0.02, '+5 s clamps to the end');
    await page.click('[data-act=jump][data-d="-5"]'); await page.waitForTimeout(250); near(await ct(page), 0, 0.02, '-5 s clamps to 0');
    await seek(page, 1.0); await page.click('[data-act=nudge][data-d="0.1"]'); await page.waitForTimeout(250); near(await ct(page), 1.1, 0.003, '+0.1 s'); await page.click('[data-act=nudge][data-d="-0.1"]'); await page.click('[data-act=nudge][data-d="-0.1"]'); await page.waitForTimeout(250); near(await ct(page), 0.9, 0.003, '-0.2 s');
    deq(errors, []); await page.context().close();
  });

  await test('Player: speed control sets playbackRate; play really plays (real time); repeat and mute toggles; keyboard shortcuts', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    for (const sp of [0.25, 0.5, 1.5, 2, 1]) {
      await page.click('[data-speed="' + sp + '"]'); await page.waitForTimeout(60); eq((await vstate(page)).rate, sp, 'rate ' + sp);
      eq(await page.$eval('[data-speed="' + sp + '"]', e => e.getAttribute('aria-pressed')), 'true'); eq(await page.$$eval('[data-speed][aria-pressed=true]', e => e.length), 1);
    }
    await page.click('#playBtn'); await page.waitForTimeout(700); let s = await vstate(page); eq(s.paused, false); assert.ok(s.t > 0.35 && s.t < 1.4, 'played about 0.7 s of video in 0.7 s: ' + s.t); eq(await page.getAttribute('#playBtn', 'aria-label'), 'Pause');
    await page.click('#playBtn'); s = await vstate(page); eq(s.paused, true); await page.waitForFunction(() => document.getElementById('playBtn').getAttribute('aria-label') === 'Play', null, { timeout: 2000 });
    await page.click('.stage', { position: { x: 80, y: 90 } }); await page.waitForTimeout(150); eq((await vstate(page)).paused, false, 'tapping the video plays'); await page.click('.stage', { position: { x: 80, y: 90 } }); await page.waitForTimeout(100); eq((await vstate(page)).paused, true, 'tapping again pauses');
    await page.click('[data-act=repeat]'); eq((await vstate(page)).loop, true); eq(await page.getAttribute('#btnRepeat', 'aria-pressed'), 'true'); await page.click('[data-act=repeat]'); eq((await vstate(page)).loop, false);
    await page.click('[data-act=mute]'); eq((await vstate(page)).muted, true); await page.waitForFunction(() => document.getElementById('btnMute').getAttribute('aria-pressed') === 'true', null, { timeout: 2000 }); await page.click('[data-act=mute]'); eq((await vstate(page)).muted, false); await page.waitForFunction(() => document.getElementById('btnMute').getAttribute('aria-pressed') === 'false', null, { timeout: 2000 });
    // keyboard
    await page.evaluate(() => document.activeElement && document.activeElement.blur()); await seek(page, 1.0);
    await page.keyboard.press('Space'); await page.waitForTimeout(200); eq((await vstate(page)).paused, false, 'space plays'); await page.keyboard.press('Space'); await page.waitForTimeout(100); eq((await vstate(page)).paused, true, 'space pauses');
    const t0 = await ct(page); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); near(await ct(page), C.stepTime(t0, 1, 30, (await vstate(page)).dur), 0.003, 'right arrow steps to the next frame'); const t1 = await ct(page); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250); near(await ct(page), C.stepTime(t1, -1, 30, (await vstate(page)).dur), 0.003, 'left arrow steps back one frame'); near(t1 - (await ct(page)), 1 / 30, 0.003);
    await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(250); near((await ct(page)) - t0, 3.63 - t0 < 5 ? (await vstate(page)).dur - t0 : 5, 0.05, 'shift+right jumps 5 s (clamped at the end)');
    await page.keyboard.press('3'); eq((await vstate(page)).rate, 1, 'key 3 is 1x'); await page.keyboard.press('5'); eq((await vstate(page)).rate, 2); await page.keyboard.press('1'); eq((await vstate(page)).rate, 0.25);
    await page.keyboard.press('Home'); await page.waitForTimeout(200); near(await ct(page), 0, 0.02);
    await page.keyboard.press('t'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'), null, { timeout: 3000 });
    await page.keyboard.press('?'); await page.waitForSelector('.sheet-wrap.open'); assert.ok(/Space/.test(await page.textContent('.sheet-wrap.open')), 'help lists the shortcuts');
    await shot(page, '08-help-390'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    deq(errors, []); await page.context().close();
  });

  await test('Tagging: Tag this moment pauses, opens the sheet; kind, part and note; saved, listed in time order, marked on the scrub bar, kept after reload', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 2.0); await page.click('#playBtn'); await page.waitForTimeout(150);
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await settle(page);
    eq((await vstate(page)).paused, true, 'tagging pauses'); assert.ok(/Tag this moment/i.test(await page.textContent('.sheet-wrap.open h2')));
    const startShown = await page.textContent('#edS'); eq(startShown, C.fmtTime(await ct(page), 1), 'start is where the video paused');
    await page.click('[data-kind=fix]'); await page.click('[data-part=Contact]'); await page.fill('#edNote', 'Elbow dropped at contact'); eq(await page.textContent('#edCount'), '24/500');
    await shot(page, '03-tag-sheet-390');
    await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); await waitToast(page, /Tag saved/);
    // an earlier one, added second, should still list first
    await seek(page, 0.5); await tagNow(page, { kind: 'good', part: 'Load', note: 'Nice balanced start' });
    const rows = await tagRows(page); eq(rows.length, 2);
    eq(rows[0].tm, '0:00.5'); eq(rows[0].kind, 'Good'); eq(rows[0].part, 'Load'); eq(rows[0].note, 'Nice balanced start'); assert.ok(/^0:0[12]\.\d$/.test(rows[1].tm), rows[1].tm); eq(rows[1].kind, 'Fix'); eq(rows[1].part, 'Contact');
    eq((await page.$$('#scMarks .mk')).length, 2); eq(await page.$$eval('#scMarks .mk.c-good', e => e.length), 1, 'marker takes the kind colour'); eq(await page.$$eval('#scMarks .mk.c-fix', e => e.length), 1);
    eq(await page.textContent('.tags-head h2'), 'Tags 2');
    // Contact chip toggles off on a second tap, and the editor remembers the last kind
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.$eval('[data-kind=good]', e => e.getAttribute('aria-pressed')), 'true', 'last kind is preselected');
    await page.click('[data-part=Stride]'); await page.click('[data-part=Stride]'); eq(await page.$eval('[data-part=Stride]', e => e.getAttribute('aria-pressed')), 'false'); await page.click('.sheet-wrap.open [data-close].btn'); await settle(page); eq((await tagRows(page)).length, 2, 'cancel adds nothing');
    // persistence
    const dump = await lsDump(page); const keys = Object.keys(dump); assert.ok(keys.some(k => /^filmlite\.c\./.test(k)) && keys.includes('filmlite.index'), keys.join());
    await page.reload(); await page.waitForSelector('.home'); eq(await page.$$eval('.rc', r => r.length), 1); assert.ok(/swing-clip/.test(await page.textContent('.rc')) && /2 tags/.test(await page.textContent('.rc')) && /Nov 7, 2026/.test(await page.textContent('.rc')));
    await shot(page, '04-home-recent-390');
    deq(errors, []); await page.context().close();
  });

  await test('Tagging: segment with Set start here / Set end here, end must follow start, edit, filter, delete with confirm', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 1.0); await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open');
    await page.click('[data-act=ed-set-end]'); await waitToast(page, /end has to come after/i); eq(await page.textContent('#edE'), 'none', 'no end at the same moment');
    await seek(page, 1.8); await page.click('[data-act=ed-set-end]'); eq(await page.textContent('#edE'), '0:01.8'); eq(await page.$eval('#edClr', e => e.hidden), false);
    await page.click('[data-act=ed-clr-end]'); eq(await page.textContent('#edE'), 'none'); await page.click('[data-act=ed-set-end]'); eq(await page.textContent('#edE'), '0:01.8');
    await seek(page, 1.2); await page.click('[data-act=ed-set-start]'); eq(await page.textContent('#edS'), '0:01.2', 'start moved to where the video is now');
    await seek(page, 2.5); await page.click('[data-act=ed-set-start]'); eq(await page.textContent('#edS'), '0:02.5'); eq(await page.textContent('#edE'), 'none', 'a start after the end clears the end');
    await seek(page, 1.0); await page.click('[data-act=ed-set-start]'); await seek(page, 1.8); await page.click('[data-act=ed-set-end]');
    await page.click('[data-kind=question]'); await page.fill('#edNote', 'Watch the front foot'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    let rows = await tagRows(page); eq(rows[0].tm, '0:01.0-0:01.8'); eq(rows[0].kind, 'Question'); eq((await page.$$('#scMarks .mk-seg')).length, 1);
    await seek(page, 3.0); await tagNow(page, { kind: 'good', note: 'second' }); await seek(page, 0.2); await tagNow(page, { kind: 'coach', note: 'first' });
    eq((await tagRows(page)).map(r => r.note).join('|'), 'first|Watch the front foot|second', 'sorted by time');
    // filter
    await page.click('[data-act=filter][data-cat=good]'); deq((await tagRows(page)).map(r => r.note), ['second']); eq(await page.$eval('[data-act=filter][data-cat=good]', e => e.getAttribute('aria-pressed')), 'true');
    await page.click('[data-act=filter][data-cat=all]'); eq((await tagRows(page)).length, 3);
    // tap a tag: seeks there and pauses
    await page.click('.tg:nth-child(2) .main'); await page.waitForTimeout(250); near(await ct(page), 1.0, 0.03, 'tap seeks to the tag'); eq((await vstate(page)).paused, true); eq(await page.$eval('.tg:nth-child(2)', e => e.classList.contains('active')), true, 'the tag at the playhead is highlighted');
    // edit
    await page.click('.tg:nth-child(2) [data-act=tag-edit]'); await page.waitForSelector('.sheet-wrap.dock.open'); assert.ok(/Edit tag/.test(await page.textContent('.sheet-wrap.open h2'))); eq(await page.inputValue('#edNote'), 'Watch the front foot'); eq(await page.$eval('[data-kind=question]', e => e.getAttribute('aria-pressed')), 'true');
    await page.fill('#edNote', 'Front foot lands late'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    rows = await tagRows(page); eq(rows[1].note, 'Front foot lands late'); eq(rows.length, 3, 'edit does not duplicate');
    // delete asks first
    await page.click('.tg:nth-child(2) [data-act=tag-edit]'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.click('[data-act=ed-delete]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    assert.ok(/Delete this tag/.test(await page.textContent('.sheet-wrap.open:last-child h2'))); await shot(page, '12-delete-tag-390');
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page); eq((await tagRows(page)).length, 3, 'cancel keeps it');
    await page.click('[data-act=ed-delete]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    deq((await tagRows(page)).map(r => r.note), ['first', 'second']); eq((await page.$$('#scMarks .mk-seg')).length, 0);
    deq(errors, []); await page.context().close();
  });

  await test('Loops: "Loop this tag" repeats the segment (time polling); free Loop A/B; Stop; a seek outside turns the loop off', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 1.0); await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await seek(page, 1.8); await page.click('[data-act=ed-set-end]'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    const sample = ms => page.evaluate(m => new Promise(res => { const v = document.querySelector('.player video'), out = [], t0 = performance.now(); const iv = setInterval(() => { out.push(v.currentTime); if (performance.now() - t0 > m) { clearInterval(iv); res(out); } }, 20); }), ms);
    await page.click('[data-act=tag-loop]'); await page.waitForSelector('#loopChip:not([hidden])'); assert.ok(/Looping this tag 0:01\.0 to 0:01\.8/.test(await page.textContent('#loopTxt')), await page.textContent('#loopTxt'));
    await shot(page, '07-loop-390');
    const s1 = await sample(3000); const wraps1 = s1.slice(1).filter((x, i) => x < s1[i] - 0.3).length;
    assert.ok(wraps1 >= 2, 'looped at least twice in 3 s at 1x (0.8 s segment), saw ' + wraps1 + ' wraps; ' + s1.filter((_, i) => i % 15 === 0).map(x => x.toFixed(2)).join(' '));
    assert.ok(Math.min(...s1) >= 0.95 && Math.max(...s1) <= 1.95, 'stayed inside the segment: ' + Math.min(...s1) + '..' + Math.max(...s1));
    await page.click('[data-speed="0.5"]'); const s2 = await sample(2200); assert.ok(Math.max(...s2) <= 1.9 && Math.min(...s2) >= 0.95, 'also at 0.5x'); assert.ok(s2.slice(1).some((x, i) => x < s2[i] - 0.3), 'wraps at 0.5x too');
    eq(await page.$eval('[data-act=tag-loop]', e => e.classList.contains('looping')), true);
    await page.click('[data-act=loop-stop]'); await page.waitForSelector('#loopChip', { state: 'hidden' }); await page.click('[data-speed="1"]');
    // a one-moment tag loops 1 s before to 2 s after
    await page.evaluate(() => FL.Player.pause()); await seek(page, 1.5); await tagNow(page, { kind: 'fix', note: 'moment' });
    await page.click('.tg:nth-child(2) [data-act=tag-loop]'); assert.ok(/0:00\.5 to 0:03\.5/.test(await page.textContent('#loopTxt')), await page.textContent('#loopTxt'));
    await page.click('[data-act=loop-stop]');
    // free loop A/B
    await page.evaluate(() => FL.Player.pause()); await seek(page, 0.5); await page.click('[data-act=loop-a]'); eq(await page.$eval('#btnA small', e => e.textContent), '0:00.5'); await seek(page, 1.2); await page.click('[data-act=loop-b]'); await page.waitForSelector('#loopChip:not([hidden])');
    assert.ok(/^Looping 0:00\.5 to 0:01\.2/.test(await page.textContent('#loopTxt'))); const s3 = await sample(2200); assert.ok(Math.min(...s3) >= 0.45 && Math.max(...s3) <= 1.3, 'inside A..B: ' + Math.min(...s3) + '..' + Math.max(...s3)); assert.ok(s3.slice(1).some((x, i) => x < s3[i] - 0.3), 'wrapped');
    await page.click('[data-act=loop-b]'); // B at the playhead again, loop continues to run: fine
    await page.click('[data-act=loop-stop]'); eq(await page.$eval('#loopChip', e => e.hidden), true);
    await page.evaluate(() => FL.Player.pause()); await seek(page, 0.5); await page.click('[data-act=loop-a]'); await seek(page, 0.5); await page.click('[data-act=loop-b]'); await waitToast(page, /Loop B has to come after Loop A/);
    await seek(page, 1.0); await page.click('[data-act=loop-b]'); await page.waitForSelector('#loopChip:not([hidden])'); await page.click('[data-act=nudge][data-d="0.1"]'); await page.waitForTimeout(150);
    await seek(page, 3.0); await waitToast(page, /Loop off/); eq(await page.$eval('#loopChip', e => e.hidden), true, 'seeking outside the loop turns it off'); await page.click('[data-act=play]'); await page.waitForTimeout(200); await page.click('[data-act=play]');
    deq(errors, []); await page.context().close();
  });

  await test('Drawing: pen/arrow/circle/line/angle on the paused frame (mouse), undo/clear, saved with the tag as vector data, replayed on that frame only', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 1.5); eq(await ovBlank(page), true, 'overlay starts empty');
    await page.click('[data-act=draw]'); await page.waitForSelector('#plDraw:not([hidden])'); eq(await page.$eval('#stage', e => e.classList.contains('drawing')), true); eq(await page.$eval('#drSave', e => e.disabled), true, 'nothing to save yet');
    await dragOn(page, '#ov', [[0.1, 0.1], [0.4, 0.3], [0.6, 0.2]]); eq(await ovBlank(page), false, 'pen drew non-blank pixels'); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 1);
    await page.click('[data-act=dr-undo]'); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 0); eq(await ovBlank(page), true, 'undo removed it');
    for (const [tool, pts] of [['pen', [[0.1, 0.1], [0.3, 0.2]]], ['arrow', [[0.2, 0.5], [0.5, 0.8]]], ['circle', [[0.7, 0.5], [0.85, 0.5]]], ['line', [[0.1, 0.9], [0.9, 0.9]]]]) { await page.click('[data-tool=' + tool + ']'); await dragOn(page, '#ov', pts); }
    await page.click('[data-act=dr-color][data-i="1"]'); await page.click('[data-act=dr-width][data-i="2"]');
    await page.click('[data-tool=angle]'); assert.ok(/first line/.test(await page.textContent('#drHint')));
    await dragOn(page, '#ov', [[0.3, 0.3], [0.3, 0.7]]); assert.ok(/second line/.test(await page.textContent('#drHint')), 'asks for the second line'); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 4, 'one line alone is not a shape yet');
    await dragOn(page, '#ov', [[0.3, 0.7], [0.55, 0.7]]); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 5);
    const ang = await page.evaluate(() => { const s = FL.Player.state().ed.strokes[4]; return { k: s.k, n: s.p.length, deg: FL.C.strokeAngle(s.p, FL.Player.state().ar).deg, joined: FL.C.strokeAngle(s.p, FL.Player.state().ar).joined }; });
    eq(ang.k, 'angle'); eq(ang.n, 4); eq(ang.joined, true, 'second line started on the end of the first, so it measures the corner'); near(ang.deg, 90, 1.5, 'drawn as a right angle');
    await shot(page, '05-draw-390');
    await page.click('[data-act=dr-clear]'); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 0); eq(await ovBlank(page), true);
    // touch pointer events draw too
    await page.click('[data-tool=pen]');
    await page.evaluate(() => { const c = document.getElementById('ov'), r = c.getBoundingClientRect(); const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x * r.width, clientY: r.top + y * r.height, button: t === 'pointermove' ? -1 : 0 })); ev('pointerdown', 0.2, 0.2); ev('pointermove', 0.4, 0.4); ev('pointermove', 0.6, 0.3); ev('pointerup', 0.6, 0.3); });
    eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 1, 'a touch stroke is a stroke'); eq(await ovBlank(page), false);
    await page.click('[data-tool=arrow]'); await dragOn(page, '#ov', [[0.2, 0.5], [0.5, 0.8]]); await page.click('[data-tool=circle]'); await dragOn(page, '#ov', [[0.7, 0.5], [0.85, 0.5]]);
    // save with tag -> sheet, drawing attached
    await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.$eval('#stage', e => e.classList.contains('drawing')), false, 'drawing mode ended');
    eq(await page.textContent('#edDrawTxt'), 'Drawing with 3 shapes'); await page.click('[data-kind=fix]'); await page.fill('#edNote', 'Hands too low'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    const rows = await tagRows(page); eq(rows.length, 1); eq(rows[0].draw, true); eq(await ovBlank(page), false, 'the drawing shows on the frame it was made on');
    // stored as vector data in 0..1 coordinates
    const dump = await lsDump(page); const clipKey = Object.keys(dump).find(k => /^filmlite\.c\./.test(k)); const stored = JSON.parse(dump[clipKey]); const dd = stored.tags[0].d;
    eq(dd.s.length, 3); assert.ok(dd.s.every(s => s.p.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)), 'normalized coordinates'); near(dd.ar, 640 / 360, 0.001); deq(dd.s.map(s => s.k), ['pen', 'arrow', 'circle']);
    // replay: elsewhere is blank, the tag frame shows it again, one frame later is blank
    await seek(page, 3.0); await page.waitForTimeout(150); eq(await ovBlank(page), true, 'blank away from the tag'); await page.click('.tg .main'); await page.waitForTimeout(300); eq(await ovBlank(page), false, 'seeking to the tag shows the drawing'); assert.ok(/Drawing: Fix/.test(await page.textContent('#stageBadge')));
    await shot(page, '06-drawing-replay-390');
    await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(300); eq(await ovBlank(page), true, 'one frame later it is gone');
    await page.click('[data-act=step][data-d="-1"]'); await page.waitForTimeout(300); eq(await ovBlank(page), false, 'and back again');
    // the same drawing renders at another size (vector), also after reload
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300); await page.evaluate(() => { FL.Player.resetOverlayKey(); FL.Player.refreshOverlay(true); }); eq(await ovBlank(page), false, 'still drawn at 320 wide');
    await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForSelector('.home'); await page.click('.rc'); await page.waitForSelector('.sheet-wrap.open');
    await page.setInputFiles('.sheet-wrap.open input[data-pick]', SAMPLE); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2);
    await page.click('.tg .main'); await page.waitForTimeout(400); eq(await ovBlank(page), false, 'drawing survives a reload and picking the file again');
    deq(errors, []); await page.context().close();
  });

  await test('Drawing: edit an existing tag\'s drawing from the editor; cancel asks before throwing a drawing away; Save with tag needs a drawing', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 1.0); await page.click('[data-act=draw]'); await page.click('[data-act=dr-save]', { force: true }).catch(() => {}); // disabled: nothing happens
    await page.waitForTimeout(200); eq(await page.$eval('#plDraw', e => e.hidden), false, 'still drawing: Save needs a shape first');
    await dragOn(page, '#ov', [[0.2, 0.2], [0.6, 0.6]]); await page.click('[data-act=dr-cancel]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 1); assert.ok(/Discard this drawing/.test(await page.textContent('.sheet-wrap.open h2')));
    await page.click('.sheet-wrap.open [data-close].btn'); await settle(page); eq(await page.$eval('#plDraw', e => e.hidden), false, 'Keep drawing keeps it'); eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 1);
    await page.click('[data-act=dr-cancel]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 1); await page.click('.sheet-wrap.open [data-ok]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); eq(await page.$eval('#plDraw', e => e.hidden), true, 'discarded'); eq((await tagRows(page)).length, 0);
    // tag first, then add a drawing from inside the editor (note and kind kept)
    await seek(page, 1.0); await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.click('[data-kind=good]'); await page.fill('#edNote', 'Keep this note'); eq(await page.textContent('#edDrawTxt'), 'None yet');
    await page.click('[data-act=ed-draw]'); await page.waitForSelector('#plDraw:not([hidden])'); await dragOn(page, '#ov', [[0.3, 0.3], [0.7, 0.3]]); await page.click('[data-tool=line]'); await dragOn(page, '#ov', [[0.3, 0.5], [0.7, 0.5]]);
    await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.inputValue('#edNote'), 'Keep this note', 'the note you typed is still there'); eq(await page.$eval('[data-kind=good]', e => e.getAttribute('aria-pressed')), 'true'); eq(await page.textContent('#edDrawTxt'), 'Drawing with 2 shapes');
    await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    // edit it: the strokes come back; remove one shape; save
    await page.click('[data-act=tag-edit]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.textContent('#edDrawBtn'), 'Edit drawing'); await page.click('[data-act=ed-draw]'); await page.waitForSelector('#plDraw:not([hidden])');
    eq(await page.evaluate(() => FL.Player.state().ed.strokes.length), 2, 'existing shapes load into the editor'); eq(await ovBlank(page), false); await page.click('[data-act=dr-undo]'); await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.textContent('#edDrawTxt'), 'Drawing with 1 shape');
    await page.click('[data-act=ed-draw-rm]'); eq(await page.textContent('#edDrawTxt'), 'None yet'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); eq((await tagRows(page))[0].draw, false); eq(await ovBlank(page), true);
    deq(errors, []); await page.context().close();
  });

  await test('Save picture: PNG of the frame plus the drawing downloads and decodes as an image', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page);
    await seek(page, 1.0);
    // plain frame, from the tools grid
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=picture]')]); let f = path.join(TMP, 'pic1.png'); await dl.saveAs(f);
    let info = pngInfo(f); eq(info.sig, '89504e470d0a1a0a', 'PNG signature'); eq(info.w, 640); eq(info.h, 360); assert.ok(info.size > 5000, 'real picture data, ' + info.size + ' bytes'); assert.ok(/^filmlite-swing-clip-1\.0s\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    // with a drawing in yellow (#ffd23f)
    await page.click('[data-act=draw]'); await dragOn(page, '#ov', [[0.1, 0.1], [0.9, 0.2]]);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=dr-pic]')]); f = path.join(TMP, 'pic2.png'); await dl.saveAs(f);
    const withD = await pngCount(page, f, [255, 210, 63], 12), without = await pngCount(page, path.join(TMP, 'pic1.png'), [255, 210, 63], 12);
    eq(withD.w, 640); assert.ok(withD.count > 600, 'the yellow stroke is in the picture: ' + withD.count + ' yellow pixels'); assert.ok(without.count < 40, 'and not in the plain one: ' + without.count);
    await page.click('[data-act=dr-cancel]'); await page.click('.sheet-wrap.open [data-ok]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    deq(errors, []); await page.context().close();
  });

  await test('Notes: copy, download .txt; same text as the tag list; clip name can be changed', async () => {
    const { ctx, page, errors } = await newPage(br, { today: TODAY });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(srv.url).origin });
    await page.goto(srv.url); await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 });
    await page.click('[data-act=copy-notes]'); await waitToast(page, /Notes copied/);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    const lines = txt.split('\n'); eq(lines[0], 'Example clip'); eq(lines[1], ''); eq(lines.length, 5);
    assert.ok(/^0:00\.7 Good - Nice and steady/.test(lines[2]), lines[2]); assert.ok(/^0:01\.5-0:02\.4 Fix - Watch the drop/.test(lines[3]), lines[3]); assert.ok(/^0:02\.9 Question - Why does the ball slow down/.test(lines[4]), lines[4]);
    await page.click('[data-act=pl-menu]'); await page.waitForSelector('.sheet-wrap.open'); await shot(page, '09-clip-menu-390');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet-wrap.open [data-act=download-notes]')]); const f = path.join(TMP, 'notes.txt'); await dl.saveAs(f);
    eq(fs.readFileSync(f, 'utf8'), txt + '\n', 'download matches the copied text'); eq(dl.suggestedFilename(), 'filmlite-example-clip-notes.txt');
    await page.fill('#clipTitle', 'Batting practice'); await page.keyboard.press('Enter'); eq(await page.textContent('#plTitle'), 'Batting practice');
    await page.click('.sheet-wrap.open .x'); await settle(page);
    await page.click('[data-act=copy-notes]'); await waitToast(page, /Notes copied/); eq((await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0], 'Batting practice');
    deq(errors, []); await page.context().close();
  });
  await test('Notes: when the browser refuses to copy, the text is shown to copy by hand', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { get() { return undefined; } }); document.execCommand = () => false; });
    await page.goto(srv.url); await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 });
    await page.click('[data-act=copy-notes]'); await page.waitForSelector('.sheet-wrap.open #manual-copy'); assert.ok(/0:00\.7 Good/.test(await page.inputValue('#manual-copy')));
    deq(errors, []); await page.context().close();
  });

  await test('Notes come back: tag, leave, reload, pick the same file (also with a changed date) and the tags return; a different file is separate', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page); eq(await page.evaluate(() => document.querySelectorAll('.tg').length), 0);
    await seek(page, 1.0); await tagNow(page, { kind: 'fix', part: 'Hands', note: 'Hands drift' });
    await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); eq(await page.$$eval('.rc', r => r.length), 1);
    // recents: tap -> "Choose the video again"
    await page.click('.rc'); await page.waitForSelector('.sheet-wrap.open'); assert.ok(/Choose the video again/.test(await page.textContent('.sheet-wrap.open h2'))); assert.ok(/1 tag/.test(await page.textContent('.sheet-wrap.open')) && /swing-clip\.webm/.test(await page.textContent('.sheet-wrap.open')));
    await shot(page, '10-recent-sheet-390'); eq((await page.textContent('.sheet-wrap.open .sh-foot label')).trim(), 'Choose the video again');
    await page.reload(); await page.waitForSelector('.home'); await page.click('.rc'); await page.waitForSelector('.sheet-wrap.open');
    await page.setInputFiles('.sheet-wrap.open input[data-pick]', SAMPLE); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2);
    await waitToast(page, /Welcome back\. Your 1 tag is here/); const rows = await tagRows(page); eq(rows.length, 1); eq(rows[0].note, 'Hands drift'); eq(rows[0].part, 'Hands');
    // same bytes and name but a new file date (what some phones do): matched loosely
    await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); const buf = fs.readFileSync(SAMPLE);
    await page.setInputFiles('.home input[data-pick]', { name: 'swing-clip.webm', mimeType: 'video/webm', buffer: buf }); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2);
    eq((await tagRows(page)).length, 1, 'same name and size, different date still finds the notes');
    // another file is its own clip with no tags
    await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); const other = path.join(TMP, 'other-clip.webm'); fs.writeFileSync(other, Buffer.concat([buf, Buffer.from([0, 0, 0])]));
    await page.setInputFiles('.home input[data-pick]', other); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2); eq((await tagRows(page)).length, 0); eq(await page.textContent('#plTitle'), 'other-clip');
    await tagNow(page, { kind: 'good', note: 'other' }); await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); eq(await page.$$eval('.rc', r => r.length), 2); assert.ok(/other-clip/.test(await page.textContent('.rc:first-child')), 'most recently changed first');
    // delete notes from the recents sheet (asks first)
    await page.click('.rc:last-child'); await page.waitForSelector('.sheet-wrap.open'); await page.click('.sheet-wrap.open [data-act=recent-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    assert.ok(/cannot be undone|can't be undone/.test(await page.textContent('.sheet-wrap.open:last-child'))); await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); eq(await page.$$eval('.rc', r => r.length), 1);
    deq(errors, []); await page.context().close();
  });

  await test('Errors: a file the browser cannot play, not a video, empty, audio only: plain message, app stays usable', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await page.waitForSelector('.home');
    await page.setInputFiles('.home input[data-pick]', { name: 'clip.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from('this is definitely not matroska '.repeat(500)) });
    await page.waitForSelector('.sheet-wrap.open', { timeout: 10000 }); const t = await page.textContent('.sheet-wrap.open'); assert.ok(/can't play that video/i.test(t) && /Most Compatible/.test(t) && /MP4/.test(t), t); assert.ok(/clip\.mkv/.test(t));
    await shot(page, '11-error-390'); eq(await page.$('.player'), null, 'still on the first screen'); await page.click('.sheet-wrap.open [data-close].btn'); await settle(page);
    await page.setInputFiles('.home input[data-pick]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await page.waitForSelector('.sheet-wrap.open'); assert.ok(/doesn't look like a video/.test(await page.textContent('.sheet-wrap.open'))); await page.click('.sheet-wrap.open [data-close].btn'); await settle(page);
    await page.setInputFiles('.home input[data-pick]', { name: 'empty.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(0) }); await page.waitForSelector('.sheet-wrap.open'); assert.ok(/empty/.test(await page.textContent('.sheet-wrap.open'))); await page.click('.sheet-wrap.open [data-close].btn'); await settle(page);
    // and a real video still opens afterwards
    await openSample(page); eq(await page.textContent('#plTitle'), 'swing-clip');
    deq(errors, []); await page.context().close();
  });

  await test('Settings: frame rate, default speed, precise time, tag part presets and custom labels; saved across reload', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await page.waitForSelector('.home'); await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open'); await settle(page); await shot(page, '13-settings-390');
    assert.ok(/Film Lite v1/.test(await page.textContent('.sheet-wrap.open')));
    await page.click('[data-act=set-fps][data-v="60"]'); await page.click('[data-act=set-speed][data-v="0.5"]'); await page.check('#sPrecise'); await page.selectOption('#sPreset', 'basketball-shoot');
    await page.click('.sheet-wrap.open .x'); await settle(page);
    await openSample(page); eq((await vstate(page)).rate, 0.5, 'default speed applied when a clip opens'); eq((await page.textContent('#fpsBtn')).trim(), '60 fps'); await seek(page, 1.0);
    assert.ok(/^0:01\.00$/.test((await page.textContent('#tCur')).trim()), 'precise time shows hundredths: ' + await page.textContent('#tCur')); assert.ok(/^\/ 0:03\.6\d$/.test((await page.textContent('#tTot')).trim()), await page.textContent('#tTot'));
    const t0 = await ct(page); await page.click('[data-act=step][data-d="1"]'); await page.waitForTimeout(250); near((await ct(page)) - t0, 1 / 60, 0.0025);
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); deq(await page.$$eval('[data-part]', e => e.map(x => x.textContent)), ['Feet', 'Elbow', 'Release', 'Follow-through']); await page.keyboard.press('Escape');
    // custom
    await page.click('[data-act=pl-menu]'); await page.click('.sheet-wrap.open [data-act=settings]'); await page.waitForSelector('.sheet-wrap.open #sPreset'); eq(await page.$$eval('.sheet-wrap.open', s => s.length), 1, 'menu was replaced by settings, not stacked');
    await page.selectOption('#sPreset', 'custom'); await page.fill('#sCustom', 'Stance, Swing , stance, Finish'); await page.click('.sheet-wrap.open .x'); await settle(page);
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); deq(await page.$$eval('[data-part]', e => e.map(x => x.textContent)), ['Stance', 'Swing', 'Finish']); await page.keyboard.press('Escape'); await settle(page);
    await page.click('[data-act=pl-menu]'); await page.click('.sheet-wrap.open [data-act=settings]'); await page.selectOption('#sPreset', 'none'); await page.click('.sheet-wrap.open .x'); await settle(page);
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.$$eval('[data-part]', e => e.length), 0, 'no part row when presets are off'); await page.keyboard.press('Escape'); await settle(page);
    await page.reload(); await page.waitForSelector('.home'); await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open');
    eq(await page.$eval('[data-act=set-fps][data-v="60"]', e => e.getAttribute('aria-pressed')), 'true'); eq(await page.$eval('[data-act=set-speed][data-v="0.5"]', e => e.getAttribute('aria-pressed')), 'true'); eq(await page.$eval('#sPrecise', e => e.checked), true); eq(await page.$eval('#sPreset', e => e.value), 'none'); eq(await page.inputValue('#sCustom'), 'Stance, Swing, Finish', 'custom labels kept');
    deq(errors, []); await page.context().close();
  });

  await test('Backup -> clear everything -> restore round trip, and bad files are refused', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await openSample(page); await seek(page, 1.0); await page.click('[data-act=draw]'); await dragOn(page, '#ov', [[0.2, 0.2], [0.7, 0.4]]); await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open');
    await page.click('[data-kind=question]'); await page.fill('#edNote', 'Backup me'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    await page.click('[data-act=pl-menu]'); await page.click('.sheet-wrap.open [data-act=settings]'); await page.waitForSelector('.sheet-wrap.open [data-act=backup]');
    await page.click('[data-act=set-fps][data-v="24"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup]')]); const bf = path.join(TMP, 'backup.json'); await dl.saveAs(bf); eq(dl.suggestedFilename(), 'filmlite-backup-' + TODAY + '.json');
    const bk = JSON.parse(fs.readFileSync(bf, 'utf8')); eq(bk.app, 'filmlite'); eq(bk.clips.length, 1); eq(bk.clips[0].tags[0].note, 'Backup me'); eq(bk.clips[0].tags[0].d.s.length, 1); eq(bk.settings.fps, 24); assert.ok(!/video\/|blob:|base64/.test(JSON.stringify(bk)), 'no video data in a backup');
    // clear everything (confirm)
    await page.click('[data-act=clear-all]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); assert.ok(/can't be undone/.test(await page.textContent('.sheet-wrap.open:last-child')));
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page); eq(Object.keys(await lsDump(page)).filter(k => /\.c\./.test(k)).length, 1, 'cancel clears nothing');
    await page.click('[data-act=clear-all]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForSelector('.home'); await waitToast(page, /cleared/i);
    eq(await page.$$eval('.rc', r => r.length), 0); eq(Object.keys(await lsDump(page)).filter(k => /\.c\./.test(k)).length, 0, 'all clip records gone'); assert.ok(/Nothing yet/.test(await page.textContent('#recent')));
    // bad files first: nothing changes
    for (const [name, content, re] of [['junk.json', 'not json at all', /isn't a Film Lite backup/], ['other.json', JSON.stringify({ app: 'other', v: 1, clips: [] }), /isn't a Film Lite backup/], ['future.json', JSON.stringify({ app: 'filmlite', v: 9, clips: [] }), /newer version/], ['noclips.json', JSON.stringify({ app: 'filmlite', v: 1 }), /no clips list/]]) {
      await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open [data-restore]'); await page.setInputFiles('.sheet-wrap.open [data-restore]', { name: name, mimeType: 'application/json', buffer: Buffer.from(content) });
      await waitToast(page, re); assert.ok(/Nothing was changed/.test((await toasts(page)).join(' ')), name); eq(await page.$$eval('.sheet-wrap.open', s => s.length), 1, 'no confirm sheet for a bad file'); await page.click('.sheet-wrap.open .x'); await settle(page);
      await page.waitForTimeout(250);
    }
    // the good one: confirm sheet says what will be replaced
    await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open [data-restore]'); await page.setInputFiles('.sheet-wrap.open [data-restore]', bf); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    const ct1 = await page.textContent('.sheet-wrap.open:last-child'); assert.ok(/Replace everything\?/.test(ct1) && /1 clip with 1 tag/.test(ct1) && /Nothing is saved on this phone yet/.test(ct1), ct1); await shot(page, '14-restore-confirm-390');
    await page.click('.sheet-wrap.open:last-child [data-ok]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); await waitToast(page, /Restored 1 clip/);
    eq(await page.$$eval('.rc', r => r.length), 1); await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open'); eq(await page.$eval('.sheet-wrap.open [data-act=set-fps][data-v="24"]', e => e.getAttribute('aria-pressed')), 'true', 'settings restored'); await page.click('.sheet-wrap.open .x'); await settle(page); eq(await page.$$eval('.sheet-wrap', e => e.length), 0, 'closed sheets are removed from the page');
    // pick the video again: the tag and its drawing are back
    await page.click('.rc'); await page.waitForSelector('.sheet-wrap.open'); await page.setInputFiles('.sheet-wrap.open input[data-pick]', SAMPLE); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2);
    const rows = await tagRows(page); eq(rows.length, 1); eq(rows[0].note, 'Backup me'); eq(rows[0].draw, true);
    // restoring over existing notes warns about replacing them
    await page.click('[data-act=pl-menu]'); await page.click('.sheet-wrap.open [data-act=settings]'); await page.waitForSelector('.sheet-wrap.open [data-restore]'); await page.setInputFiles('.sheet-wrap.open [data-restore]', bf); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
    assert.ok(/replaces the notes for 1 clip/.test(await page.textContent('.sheet-wrap.open:last-child'))); await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page);
    deq(errors, []); await page.context().close();
  });

  await test('Security: <img onerror> in a note, title, custom label and file name never runs and shows as plain text', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">', XL = '<svg/onload=__xss=1>';
    await page.goto(srv.url); await page.waitForSelector('.home');
    await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open #sPreset'); await page.selectOption('#sPreset', 'custom'); await page.fill('#sCustom', XL + ', Safe'); await page.click('.sheet-wrap.open .x'); await settle(page);
    const buf = fs.readFileSync(SAMPLE); await page.setInputFiles('.home input[data-pick]', { name: '<img src=x onerror=window.__xss=9>.webm', mimeType: 'video/webm', buffer: buf }); await page.waitForSelector('.player video'); await page.waitForFunction(() => document.querySelector('.player video').readyState >= 2);
    eq(await page.textContent('#plTitle'), '<img src=x onerror=window.__xss=9>'); await seek(page, 1.0);
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); assert.ok((await page.$$eval('[data-part]', e => e.map(x => x.textContent))).includes(XL), 'custom label shown as text'); await page.click('[data-part="Safe"]');
    await page.fill('#edNote', X); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
    await page.click('[data-act=pl-menu]'); await page.waitForSelector('#clipTitle'); await page.fill('#clipTitle', X); await page.keyboard.press('Enter'); await page.click('.sheet-wrap.open .x'); await settle(page);
    eq(await page.textContent('.tg .nt'), X); eq(await page.textContent('#plTitle'), X);
    await page.click('[data-act=tag-edit]'); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.inputValue('#edNote'), X); await page.keyboard.press('Escape'); await settle(page);
    await page.click('[data-act=copy-notes]').catch(() => {}); await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); eq(await page.textContent('.rc b'), X);
    await page.click('.rc'); await page.waitForSelector('.sheet-wrap.open'); await page.waitForTimeout(200); await page.click('.sheet-wrap.open .x'); await settle(page);
    await page.reload(); await page.waitForSelector('.home'); await page.waitForTimeout(300);
    eq(await page.evaluate(() => window.__xss), undefined, 'no handler ran'); eq(await page.$$eval('img[src="x"]', e => e.length), 0, 'no stray image element anywhere');
    deq(errors, []); await page.context().close();
  });

  await test('Storage blocked: the app still works and says plainly that notes can\'t be saved', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    await page.goto(srv.url); await page.waitForSelector('.home');
    assert.ok(/can't save on this device/i.test(await page.textContent('.banner')), 'banner on the first screen'); await waitToast(page, /can't save notes/i); await shot(page, '15-storage-blocked-390');
    await openSample(page); await seek(page, 1.0); await tagNow(page, { kind: 'fix', note: 'in memory only' });
    eq((await tagRows(page)).length, 1, 'tagging still works'); assert.ok(/can't save on this device/i.test(await page.textContent('.warn-line')), 'warning in the player'); await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); eq(await page.$$eval('.rc', r => r.length), 1, 'kept in memory until the app closes');
    await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open'); assert.ok(/not letting Film Lite save/i.test(await page.textContent('.sheet-wrap.open')));
    await page.click('[data-act=set-fps][data-v="60"]'); eq(await page.$eval('[data-act=set-fps][data-v="60"]', e => e.getAttribute('aria-pressed')), 'true');
    deq(errors.filter(e => !/localStorage|denied|blocked/i.test(e)), []); await page.context().close();
  });

  await test('Offline: after one visit the app reloads with no network (service worker, own cache only)', async () => {
    const { ctx, page, errors } = await newPage(br, { today: TODAY, sw: true });
    await page.addInitScript(() => { if (!sessionStorage.getItem('__c')) { sessionStorage.setItem('__c', '1'); caches.open('locker-v99').then(c => c.put('/x', new Response('x'))); caches.open('filmlite-v0').then(c => c.put('/y', new Response('y'))); } });
    await page.goto(srv.url); await page.waitForSelector('.home');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.includes('filmlite-v2') && !k.includes('filmlite-v0') && (await (await caches.open('filmlite-v2')).keys()).length >= 8; }, null, { timeout: 8000 });
    const cached = await page.evaluate(async () => (await (await caches.open('filmlite-v2')).keys()).map(r => new URL(r.url).pathname));
    for (const f of ['/apps/filmlite/', '/apps/filmlite/app.js', '/apps/filmlite/core.js', '/apps/filmlite/base.js', '/apps/filmlite/player.js', '/apps/filmlite/tags.js', '/apps/filmlite/draw.js', '/apps/filmlite/example.js', '/apps/filmlite/filmlite.css', '/apps/filmlite/manifest.json']) assert.ok(cached.includes(f), 'cached ' + f);
    await page.reload(); await page.waitForTimeout(300); assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the worker');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('.home', { timeout: 6000 }); eq(await page.textContent('#exBtn'), 'See an example');
    await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 10000 }); eq((await tagRows(page)).length, 3, 'the example works with no network at all');
    await ctx.setOffline(false);
    const keys = await page.evaluate(() => caches.keys()); assert.ok(keys.includes('locker-v99'), 'other apps\' caches untouched');
    deq(errors, []); await ctx.close();
  });

  await test('Fallback: a browser that cannot record gets a still picture, a plain note, and tag tools switched off', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.addInitScript(() => { window.MediaRecorder = undefined; });
    await page.goto(srv.url); await page.waitForSelector('.home'); await page.click('#exBtn'); await page.waitForSelector('.player .still', { timeout: 6000 });
    assert.ok(/can't make the example video/.test(await page.textContent('.pl-right'))); eq(await page.$eval('#plAct', e => e.hidden), true, 'Tag this moment is not offered'); eq(await page.$eval('#trans', e => e.hidden), true);
    await shot(page, '16-no-recorder-390'); assert.ok(await page.$('.player input[data-pick]'), 'still offers Choose a video'); eq(await page.$$eval('.tg', t => t.length), 0);
    await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); eq(await page.$$eval('.rc', r => r.length), 0, 'nothing saved for the still');
    deq(errors, []); await page.context().close();
  });

  await test('Drag and drop a video file onto the page (computers) opens it', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await page.goto(srv.url); await page.waitForSelector('.home'); const b64 = fs.readFileSync(SAMPLE).toString('base64');
    await page.evaluate(async b => {
      const bin = atob(b), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([bytes], 'dropped.webm', { type: 'video/webm' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.__dropHint = document.querySelector('.drop-hint').classList.contains('on');
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, b64);
    eq(await page.evaluate(() => window.__dropHint), true, 'drop hint shows while dragging'); await page.waitForSelector('.player video', { timeout: 10000 }); eq(await page.textContent('#plTitle'), 'dropped'); eq(await page.$eval('.drop-hint', e => e.classList.contains('on')), false);
    deq(errors, []); await page.context().close();
  });

  /* ============================================================
     Android Back button
     ============================================================ */
  const fresh = async (opts) => {
    const { ctx, page, errors } = await newPage(br, Object.assign({ today: TODAY }, opts || {}));
    await page.goto('about:blank'); await page.goto(srv.url); await page.waitForSelector('.home');
    return { ctx, page, errors };
  };
  const onApp = page => page.url().startsWith(srv.url);
  await test('Back button: closes a sheet and stays in the app; a closed sheet leaves no stray history entry', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=help]'); await page.waitForSelector('.sheet-wrap.open'); await page.goBack(); await settle(page);
    eq(await sheetCount(page), 0, 'sheet closed'); assert.ok(onApp(page), 'still on the app: ' + page.url());
    await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open'); await page.click('.sheet-wrap.open .x'); await settle(page); eq(await sheetCount(page), 0);
    await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open'); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(onApp(page), 'a closed sheet left no stray entry: ' + page.url());
    await page.goBack(); await settle(page); assert.ok(!onApp(page), 'a second Back leaves the app: ' + page.url());
    deq(errors, []); await page.context().close();
  });
  await test('Back button: two stacked sheets peel one at a time; Cancel on the top one gives its entry back', async () => {
    const { page, errors } = await fresh();
    const stack = async () => { await page.click('[data-act=settings]'); await page.waitForSelector('.sheet-wrap.open [data-act=clear-all]'); await page.click('[data-act=clear-all]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2); };
    await stack(); await page.goBack(); await settle(page); eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(onApp(page));
    await stack(); await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page); eq(await sheetCount(page), 1); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); assert.ok(onApp(page), 'cancel gave its entry back');
    deq(errors, []); await page.context().close();
  });
  await test('Back button: a sheet that replaces another (clip menu -> Settings) keeps Back in step', async () => {
    const { page, errors } = await fresh();
    await openSample(page); await page.click('[data-act=pl-menu]'); await page.waitForSelector('.sheet-wrap.open'); await page.click('.sheet-wrap.open [data-act=settings]'); await settle(page); eq(await sheetCount(page), 1);
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0, 'one Back closes it'); assert.ok(onApp(page)); eq(await page.$$eval('.player', e => e.length), 1, 'still in the player');
    await page.click('[data-act=pl-menu]'); await page.waitForSelector('.sheet-wrap.open'); await page.click('.sheet-wrap.open [data-act=help]'); await settle(page); await page.goBack(); await settle(page); eq(await sheetCount(page), 0); eq(await page.$$eval('.player', e => e.length), 1);
    deq(errors, []); await page.context().close();
  });
  await test('Back button: from the player Back goes to the first screen (not out of the app); the next Back leaves', async () => {
    const { page, errors } = await fresh();
    await openSample(page); await page.goBack(); await settle(page); await page.waitForSelector('.home'); eq(await page.$('.player'), null, 'player closed'); assert.ok(onApp(page));
    eq(await page.evaluate(() => !!document.querySelector('video')), false, 'video element is gone'); await page.goBack(); await settle(page); assert.ok(!onApp(page), 'then Back leaves: ' + page.url());
    deq(errors, []); await page.context().close();
  });
  await test('Back button: the tag editor closes first, then the player; the "Clips" button gives its entry back', async () => {
    const { page, errors } = await fresh();
    await openSample(page); await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open');
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0, 'editor closed'); eq(await page.$$eval('.player', e => e.length), 1, 'still watching'); assert.ok(onApp(page));
    await page.goBack(); await settle(page); await page.waitForSelector('.home'); assert.ok(onApp(page));
    await openSample(page); await page.click('[data-act=pl-back]'); await page.waitForSelector('.home'); await settle(page);
    await page.goBack(); await settle(page); assert.ok(!onApp(page), 'using the Clips button left no stray entry: ' + page.url());
    deq(errors, []); await page.context().close();
  });
  await test('Back button: leaves drawing mode first (nothing saved); editor draft round trip keeps Back in step', async () => {
    const { page, errors } = await fresh();
    await openSample(page); await seek(page, 1.0); await page.click('[data-act=draw]'); await page.waitForSelector('#plDraw:not([hidden])'); await dragOn(page, '#ov', [[0.2, 0.2], [0.6, 0.5]]);
    await page.goBack(); await settle(page); eq(await page.$eval('#plDraw', e => e.hidden), true, 'drawing mode left'); eq(await page.$$eval('.player', e => e.length), 1); eq((await tagRows(page)).length, 0); assert.ok(onApp(page));
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.fill('#edNote', 'draft kept'); await page.click('[data-act=ed-draw]'); await page.waitForSelector('#plDraw:not([hidden])'); await page.waitForTimeout(400);
    await dragOn(page, '#ov', [[0.2, 0.2], [0.6, 0.5]]); await page.goBack(); await settle(page); await page.waitForSelector('.sheet-wrap.dock.open'); eq(await page.inputValue('#edNote'), 'draft kept', 'Back from drawing returns to the editor with the note');
    await page.goBack(); await settle(page); eq(await sheetCount(page), 0); eq(await page.$$eval('.player', e => e.length), 1); await page.goBack(); await settle(page); await page.waitForSelector('.home'); assert.ok(onApp(page));
    deq(errors, []); await page.context().close();
  });

  /* ============================================================
     layout and looks
     ============================================================ */
  await test('Layout 390x844: no horizontal scroll, tap targets >= 44px, sheets <= 85vh, screens captured', async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    const problems = [];
    await page.goto(srv.url); await page.waitForSelector('.home'); if (await overflow(page) > 0) problems.push('home overflow'); (await smallTargets(page)).forEach(x => problems.push('home: ' + x));
    await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 }); await page.waitForTimeout(400);
    if (await overflow(page) > 0) problems.push('player overflow'); (await smallTargets(page)).forEach(x => problems.push('player: ' + x)); (await tinyText(page)).forEach(x => problems.push('tiny text: ' + x));
    await page.click('[data-act=tag-edit]'); await page.waitForSelector('.sheet-wrap.dock.open'); await settle(page);
    const h = await page.$eval('.sheet-wrap.open .sheet', e => e.getBoundingClientRect().height); assert.ok(h <= 844 * 0.85 + 1, 'editor height ' + h); (await smallTargets(page)).forEach(x => problems.push('editor: ' + x));
    await page.evaluate(() => { document.querySelector('.sheet-wrap.open .sh-body').scrollTop = 400; }); await shot(page, '03b-tag-edit-scrolled-390'); await page.keyboard.press('Escape'); await settle(page);
    for (const [sel, n] of [['[data-act=pl-menu]', 'menu'], ['[data-act=help]', 'help']]) {
      if (n === 'help') { await page.click('[data-act=pl-menu]'); await page.click('.sheet-wrap.open [data-act=help]'); } else await page.click(sel);
      await page.waitForSelector('.sheet-wrap.open'); await settle(page);
      const hh = await page.$eval('.sheet-wrap.open .sheet', e => e.getBoundingClientRect().height); if (hh > 844 * 0.85 + 1) problems.push(n + ' sheet too tall ' + hh); (await smallTargets(page)).forEach(x => problems.push(n + ': ' + x));
      await page.keyboard.press('Escape'); await settle(page);
    }
    await page.evaluate(() => { document.getElementById('plRest').scrollTop = 260; }); await page.waitForTimeout(100); await shot(page, '02b-tag-list-390');
    // focus ring is visible on a keyboard-focused button
    await page.focus('#playBtn'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; }); assert.ok(/solid 3px/.test(ring), 'focus ring: ' + ring);
    eq(problems.join('\n'), ''); deq(errors, []); await page.context().close();
  });
  await test('Layout 320x640: no horizontal scroll on any screen or sheet; everything reachable', async () => {
    const { page, errors } = await newPage(br, { today: TODAY, ctx: { viewport: { width: 320, height: 640 } } });
    const problems = [];
    await page.goto(srv.url); await page.waitForSelector('.home'); if (await overflow(page) > 0) problems.push('home ' + await overflow(page)); await shot(page, '01-home-320');
    await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 }); await page.waitForTimeout(500); if (await overflow(page) > 0) problems.push('player ' + await overflow(page)); await shot(page, '02-example-320');
    (await smallTargets(page)).forEach(x => problems.push('player: ' + x)); (await tinyText(page)).forEach(x => problems.push('tiny text: ' + x));
    const act = await page.evaluate(() => { const t = document.querySelector('.tag-btn').getBoundingClientRect(), d = document.querySelector('[data-act=draw]').getBoundingClientRect(), p = document.getElementById('plAct').getBoundingClientRect(); return { tagH: t.height, sameRow: Math.abs(t.top - d.top) < 2, inside: t.left >= p.left && d.right <= p.right + 0.5, labelFits: document.querySelector('.tag-btn').scrollWidth <= document.querySelector('.tag-btn').clientWidth + 1 }; });
    assert.ok(act.tagH <= 60 && act.sameRow && act.inside && act.labelFits, 'Tag and Draw buttons sit on one row with room for their text: ' + JSON.stringify(act));
    const r = await page.evaluate(() => { const rest = document.getElementById('plRest').getBoundingClientRect(); const a = document.getElementById('plAct').getBoundingClientRect(); return { restTop: rest.top, restH: rest.height, actBottom: a.bottom }; }); assert.ok(r.restH >= 110, 'the tools and tag list still get room to scroll: ' + JSON.stringify(r));
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await settle(page); if (await overflow(page) > 0) problems.push('editor ' + await overflow(page)); const eh = await page.$eval('.sheet-wrap.open .sheet', e => e.getBoundingClientRect().height); assert.ok(eh >= 230 && eh <= 640 * 0.85 + 1, 'editor height ' + eh); await shot(page, '03-tag-sheet-320');
    const reach = await page.evaluate(() => { const body = document.querySelector('.sheet-wrap.open .sh-body'), foot = document.querySelector('.sheet-wrap.open [data-act=ed-save]').getBoundingClientRect(); const n = document.getElementById('edNote'); n.scrollIntoView({ block: 'nearest' }); const nr = n.getBoundingClientRect(), br = body.getBoundingClientRect(); return { noteInBody: nr.top >= br.top - 1 && nr.bottom <= br.bottom + 1, saveOnScreen: foot.bottom <= innerHeight && foot.top >= 0, canScroll: body.scrollHeight > body.clientHeight }; });
    eq(reach.noteInBody, true, 'the note box can be scrolled into view inside the editor'); eq(reach.saveOnScreen, true, 'Save tag stays on screen'); eq(reach.canScroll, true, 'a small screen scrolls the editor body instead of cutting it off');
    await page.keyboard.press('Escape'); await settle(page);
    await page.click('[data-act=draw]'); await page.waitForSelector('#plDraw:not([hidden])'); if (await overflow(page) > 0) problems.push('draw ' + await overflow(page)); const row2 = await page.evaluate(() => { const els = Array.from(document.querySelectorAll('.dr-row2 .sw, .dr-row2 .wd')).map(e => e.getBoundingClientRect()); return { n: els.length, sameRow: Math.max(...els.map(r => r.top)) - Math.min(...els.map(r => r.top)) < 2, right: Math.max(...els.map(r => r.right)) <= innerWidth }; }); assert.ok(row2.n === 6 && row2.sameRow && row2.right, 'colour and thickness buttons share one row at 320: ' + JSON.stringify(row2)); await shot(page, '05-draw-320'); const dr = await page.evaluate(() => { const b = document.getElementById('drSave').getBoundingClientRect(); return { bottom: b.bottom, h: innerHeight }; }); assert.ok(dr.bottom <= dr.h, 'Save button is on screen while drawing: ' + JSON.stringify(dr));
    await page.click('[data-act=dr-cancel]'); await page.waitForFunction(() => document.getElementById('plDraw').hidden);
    for (const act of ['pl-menu']) { await page.click('[data-act=' + act + ']'); await page.waitForSelector('.sheet-wrap.open'); await settle(page); if (await overflow(page) > 0) problems.push(act + ' ' + await overflow(page)); await page.click('.sheet-wrap.open [data-act=settings]'); await settle(page); await page.waitForTimeout(300); if (await overflow(page) > 0) problems.push('settings ' + await overflow(page)); (await smallTargets(page)).forEach(x => problems.push('settings: ' + x)); await shot(page, '13-settings-320'); await page.keyboard.press('Escape'); await settle(page); }
    eq(problems.join('\n'), ''); deq(errors, []); await page.context().close();
  });
  await test('Layout 768x1024 and landscape phone 844x390: two-column player, tag editor beside the video, no overflow', async () => {
    let { page, errors } = await newPage(br, { today: TODAY, ctx: { viewport: { width: 768, height: 1024 } } });
    const problems = [];
    await page.goto(srv.url); await page.waitForSelector('.home'); if (await overflow(page) > 0) problems.push('home768'); await shot(page, '01-home-768');
    await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 }); await page.waitForTimeout(500); if (await overflow(page) > 0) problems.push('player768'); await shot(page, '02-example-768');
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await settle(page); await shot(page, '03-tag-sheet-768'); await page.keyboard.press('Escape'); await settle(page);
    deq(errors, []); await page.context().close();
    ({ page, errors } = await newPage(br, { today: TODAY, ctx: { viewport: { width: 844, height: 390 } } }));
    await page.goto(srv.url); await page.waitForSelector('.home'); if (await overflow(page) > 0) problems.push('home landscape');
    await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 9000 }); await page.waitForTimeout(500); if (await overflow(page) > 0) problems.push('player landscape'); await shot(page, '02-example-landscape');
    const lay = await page.evaluate(() => { const l = document.querySelector('.pl-left').getBoundingClientRect(), r = document.querySelector('.pl-right').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return { leftW: l.width, rightX: r.left, stageH: s.height, stageW: s.width, scrubVisible: document.getElementById('scrub').getBoundingClientRect().bottom <= innerHeight, transVisible: document.getElementById('trans').getBoundingClientRect().bottom <= innerHeight + 1 }; });
    assert.ok(lay.rightX >= lay.leftW - 1 && lay.stageH >= 150, 'two columns with a real video area: ' + JSON.stringify(lay)); assert.ok(lay.scrubVisible && lay.transVisible, 'scrub bar and buttons fit on screen without scrolling: ' + JSON.stringify(lay));
    await page.click('[data-act=tag-now]'); await page.waitForSelector('.sheet-wrap.dock.open'); await settle(page); await shot(page, '03-tag-sheet-landscape');
    const side = await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sheet').getBoundingClientRect(), v = document.getElementById('stage').getBoundingClientRect(); return { sheetX: s.left, stageRight: v.right }; }); assert.ok(side.sheetX >= side.stageRight - 1, 'editor sits beside the video, not over it: ' + JSON.stringify(side));
    await page.click('[data-kind=good]'); await page.fill('#edNote', 'landscape ok'); await page.click('[data-act=ed-save]'); await page.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); eq((await tagRows(page)).length, 4);
    await page.click('[data-act=draw]'); await page.waitForSelector('#plDraw:not([hidden])'); await dragOn(page, '#ov', [[0.2, 0.2], [0.6, 0.5]]); await shot(page, '05-draw-landscape'); await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.keyboard.press('Escape');
    eq(problems.join('\n'), ''); deq(errors, []); await page.context().close();
  });
  await test('Looks: reduced motion respected; dark theme declared; focus order reaches the main controls by keyboard', async () => {
    const { page, errors } = await newPage(br, { today: TODAY, reducedMotion: true });
    await page.goto(srv.url); await page.waitForSelector('.home');
    eq(await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration.replace(/s$/, '') <= 0.001), true, 'no transitions under reduced motion'); eq(await page.getAttribute('meta[name=color-scheme]', 'content'), 'dark');
    const seen = []; for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || document.activeElement.tagName).trim().slice(0, 30))); }
    assert.ok(seen.some(x => /Help/.test(x)) && seen.some(x => /Settings/.test(x)) && seen.some(x => /Choose a video/.test(x)) && seen.some(x => /example/.test(x)), 'Tab reaches help, settings, choose, example: ' + seen.join(' | '));
    await page.keyboard.press('Enter'); // on "See an example" or whichever is focused: must not throw
    deq(errors, []); await page.context().close();
  });

  await br.close(); srv.stop();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
