/* Play Board end-to-end test.
   Run:  NODE_PATH=<...>/scratchpad/pr/events/tests/node_modules node playboard.test.cjs
   Needs a static server: from <...>/scratchpad/newapps/serve run  python3 -m http.server 8765
   (serve/apps is a symlink to the clone, so the page is at /apps/playboard/).            */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PB_URL || 'http://localhost:8765/apps/playboard/';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots') + '/';
const CHROME = require("./lib.cjs").CHROME;
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Errors we expect: the icons are supplied later, install.js / fonts are blocked in tests.
const EXPECTED = /\/apps\/icons\/playboard-|install\.js|health\.js|fonts\.g|favicon/;

async function newPage(ctx, opts = {}) {
  const page = await ctx.newPage();
  page.__errs = [];
  page.on('pageerror', e => page.__errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (EXPECTED.test(url) || EXPECTED.test(m.text())) return;
    page.__errs.push('console: ' + m.text() + ' @' + url);
  });
  await page.route('**/install.js', r => r.abort()); await page.route('**/health.js', r => r.abort());
  await page.route('**/fonts.g*', r => r.abort());
  if (!opts.noGoto) await page.goto(BASE);
  return page;
}
const toks = page => page.evaluate(() => [...document.querySelectorAll('#lyrTokens .tok')].map(g => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform'));
  return { id: g.getAttribute('data-id'), label: g.querySelector('text').textContent, x: +m[1], y: +m[2] };
}));
const stored = async (page, key = 'plays') => { await sleep(420); return page.evaluate(k => JSON.parse(localStorage.getItem('playboard.' + k) || 'null'), key); };
// client coordinates of a board point (in SVG units)
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.getElementById('board'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
  pt.x = x; pt.y = y; const q = pt.matrixTransform(m); return { x: q.x, y: q.y };
}, [x, y]);
async function tokClient(page, label) {
  const t = (await toks(page)).find(t => t.label === label);
  return { ...(await toClient(page, t.x, t.y)), unit: t };
}
async function dragMouse(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
  await page.mouse.up();
}
async function openStarter(page, name) {
  await page.evaluate(() => { try { const b = document.querySelector('.back'); if (b) b.click(); } catch (e) {} });
  await sleep(250);
  await page.click(`.card-open[aria-label^="Open ${name}"]`);
  await page.waitForSelector('#lyrTokens .tok');
  await dismissHint(page);
}
async function dismissHint(page) { const h = page.locator('#hintOk'); if (await h.isVisible()) await h.click(); }
async function newPlay(page, { sport, variant, start, name }) {
  if (await page.locator('#boardView').isVisible()) { await page.click('.back'); await page.waitForSelector('#fab'); await sleep(150); }
  await page.click('#fab');
  await page.waitForSelector('.sheet.open');
  if (name) await page.fill('#npName', name);
  await page.click(`.sheet .pill:text-is("${sport}")`);
  if (variant) await page.click(`.sheet .pill:text-is("${variant}")`);
  if (start) await page.click(`.sheet .pill:text-is("${start}")`);
  await page.click('.sheet .btn.primary:text-is("Create play")');
  await page.waitForSelector('#lyrTokens', { state: 'attached' });
  await sleep(150);
  await dismissHint(page);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

  /* ============================================================ 1. first run, library, sports */
  console.log('\n[1] first run and library');
  const ctx = await browser.newContext({ ...mobile, acceptDownloads: true, permissions: [] });
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); } catch (e) {} });
  const page = await newPage(ctx);
  await page.waitForSelector('.card');
  ok(await page.locator('.card').count() === 6, 'six starter plays seeded on first run');
  ok(/Play Board/.test(await page.title()), 'title is Play Board');
  const thumbs = await page.locator('.thumb svg').count();
  ok(thumbs === 6, 'every starter card has a thumbnail svg', thumbs);
  ok(await stored(page).then(a => a.length === 6), 'starters stored in localStorage under playboard.plays');
  ok(await page.evaluate(() => localStorage.getItem('playboard.seeded')) === '1', 'seeded flag stored');
  await page.screenshot({ path: SHOTS + 'playboard-01-library.png' });

  // filter pills
  await page.click('.libfilter .pill:text-is("Baseball")');
  ok(await page.locator('.card').count() === 2, 'sport filter shows only baseball plays');
  await page.click('.libfilter .pill:text-is("All")');

  /* ============================================================ 2. every sport renders */
  console.log('\n[2] each sport renders');
  const sports = [
    ['Basketball', 'Half court', 'Both teams', 10, 'bb-half'],
    ['Basketball', 'Full court', 'Offense only', 5, 'bb-full'],
    ['Baseball / Softball', null, 'Fielders + batter', 11, 'baseball'],
    ['Football', 'Flag 5v5', 'Both teams', 10, 'fb-flag'],
    ['Football', '7v7', 'Both teams', 14, 'fb-7v7'],
    ['Football', '11v11', 'Both teams', 22, 'fb-11v11'],
    ['Soccer', '7v7', 'Both teams', 14, 'soc-7v7'],
    ['Soccer', '11v11', 'Offense only', 11, 'soc-11v11'],
    ['Volleyball', null, 'Six players', 6, 'volleyball']
  ];
  for (const [sport, variant, start, expect, tag] of sports) {
    await newPlay(page, { sport, variant, start, name: 'T ' + tag });
    const n = (await toks(page)).length;
    const court = await page.evaluate(() => document.querySelector('#lyrCourt').children.length);
    ok(n === expect && court >= 3, `${tag}: ${expect} tokens and a drawn court`, { n, court });
    const box = await page.locator('#boardWrap').boundingBox();
    ok(box.width <= 390 && box.width >= 240 && box.height > 150, `${tag}: board fits the screen (${Math.round(box.width)}x${Math.round(box.height)})`);
    await page.screenshot({ path: SHOTS + `playboard-02-${tag}.png` });
  }
  ok(page.__errs.length === 0, 'no console or page errors so far', page.__errs);

  /* ============================================================ 3. editing: drag, paths, steps */
  console.log('\n[3] editing');
  await newPlay(page, { sport: 'Basketball', variant: 'Half court', start: 'Offense only', name: 'Edit test' });
  let before = await tokClient(page, '2');
  const target = await toClient(page, before.unit.x + 40, before.unit.y - 70);
  await dragMouse(page, before, target);
  let after = (await toks(page)).find(t => t.label === '2');
  ok(Math.abs(after.x - (before.unit.x + 40)) <= 3 && Math.abs(after.y - (before.unit.y - 70)) <= 3, 'mouse drag moves a token in the first step', { before: before.unit, after });
  ok(await stored(page).then(a => { const p = a.find(p => p.name === 'Edit test'); const t = p.tokens.find(t => t.label === '2'); return Math.abs(t.x - after.x) <= 1; }), 'dragged position saved');
  const panelShown = await page.locator('.tokpanel').isVisible();
  ok(panelShown, 'tapping/dragging a token selects it and shows the token panel');

  // change label
  await page.fill('.tp-label', 'Q7');
  ok((await toks(page)).some(t => t.label === 'Q7'), 'label can be changed (up to 3 chars)');
  await page.fill('.tp-label', 'ABCDE');
  ok(await page.inputValue('.tp-label') === 'ABC', 'label is limited to 3 characters');
  await page.fill('.tp-label', '2');

  // freehand path with Cut
  await page.click('#tools .pill:has-text("Cut")');
  const t3 = await tokClient(page, '3');
  const pts = [[0, 0], [-30, -30], [-70, -50], [-110, -40], [-140, -80]].map(([dx, dy]) => ({ x: t3.x + dx, y: t3.y + dy }));
  await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
  for (let i = 1; i < pts.length; i++) { for (let k = 1; k <= 6; k++) await page.mouse.move(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / 6, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k / 6); }
  await page.mouse.up();
  const mv = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[0].m);
  const keys = Object.keys(mv);
  ok(keys.length === 1 && mv[keys[0]].k === 'run' && mv[keys[0]].p.length >= 2 && mv[keys[0]].p.length <= 8, 'freehand drag stores a simplified run path', mv);
  ok(await page.locator('#lyrPaths path').count() >= 2, 'path and arrow head are drawn');
  await page.screenshot({ path: SHOTS + 'playboard-03-path-drawn.png' });

  // Dribble, Screen by tapping waypoints
  await page.click('#tools .pill:has-text("Dribble")');
  const t1 = await tokClient(page, '1');
  await page.mouse.click(t1.x, t1.y);                                    // tap the player
  ok(await page.locator('.ctx button:text-is("Done")').isVisible(), 'tapping a player in a path tool starts tap-the-points mode');
  const w1 = await toClient(page, t1.unit.x + 60, t1.unit.y - 60), w2 = await toClient(page, t1.unit.x + 120, t1.unit.y - 40);
  await page.mouse.click(w1.x, w1.y); await page.mouse.click(w2.x, w2.y);
  await page.click('.ctx button:text-is("Done")');
  const mv2 = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[0].m);
  const drib = Object.values(mv2).find(m => m.k === 'drib');
  ok(drib && drib.p.length === 2, 'tapped waypoints store a dribble path with 2 points', mv2);

  await page.click('#tools .pill:has-text("Screen")');
  const t5 = await tokClient(page, '5');
  await dragMouse(page, t5, { x: t5.x - 10, y: t5.y + 60 });
  const mv3 = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[0].m);
  ok(Object.values(mv3).some(m => m.k === 'scr'), 'screen path stored', mv3);

  // Pass: from the ball holder (1) to 4
  await page.click('#tools .pill:has-text("Pass")');
  const t4 = await tokClient(page, '4');
  const t1b = await tokClient(page, '1');
  await dragMouse(page, t1b, t4);
  const mv4 = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[0].m);
  const passMv = Object.values(mv4).find(m => m.k === 'pass');
  ok(passMv && passMv.to, 'pass from the ball carrier to a teammate is stored', mv4);
  // pass from someone without the ball is refused with a message
  const t2 = await tokClient(page, '2');
  await dragMouse(page, t2, t4);
  ok(await page.locator('.toast').filter({ hasText: 'Only the player with the ball can pass' }).count() >= 1, 'pass from a player without the ball shows a toast');
  await page.screenshot({ path: SHOTS + 'playboard-03-paths-all.png' });

  // add step, note, and "end of one step is the start of the next"
  await page.click('#chips .chip.add');
  ok(await page.locator('#chips .chip:not(.add)').count() === 2, 'Add step adds a second step');
  await page.fill('#note', '5 sets the screen, 1 uses it');
  const posStep2 = await toks(page);
  const cutTok = Object.keys(mv).find(k => true);
  const moved = await stored(page).then(a => { const p = a.find(p => p.name === 'Edit test'); const id = Object.keys(p.steps[0].m).find(k => p.steps[0].m[k].k === 'run'); const end = p.steps[0].m[id].p.slice(-1)[0]; return { id, end }; });
  const startOfStep2 = posStep2.find(t => t.id === moved.id);
  ok(Math.abs(startOfStep2.x - moved.end[0]) < 1 && Math.abs(startOfStep2.y - moved.end[1]) < 1, 'step 2 starts where the step 1 path ended', { startOfStep2, end: moved.end });
  ok(await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[1].note === '5 sets the screen, 1 uses it'), 'step note saved');
  // Move tool in step 2: drag a player to where it should end -> a run path is created
  await page.click('#tools .pill:has-text("Move")');
  const s2t = await tokClient(page, '4');
  await dragMouse(page, s2t, await toClient(page, s2t.unit.x + 50, s2t.unit.y + 60));
  const mvS2 = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[1].m);
  ok(Object.values(mvS2).some(m => m.k === 'run'), 'in step 2, dragging a player sets where it ends (creates a run path)', mvS2);
  // undo / redo
  const nBefore = Object.keys(mvS2).length;
  await page.click('#actions .act[aria-label="Undo"]');
  const mvS2u = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[1].m);
  await sleep(450);
  const mvS2u2 = await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[1].m);
  ok(Object.keys(mvS2u2).length === nBefore - 1, 'Undo removes the last edit', { nBefore, now: Object.keys(mvS2u2).length });
  await page.click('#actions .act[aria-label="Redo"]');
  await sleep(450);
  ok(Object.keys(await stored(page).then(a => a.find(p => p.name === 'Edit test').steps[1].m)).length === nBefore, 'Redo brings it back');
  // add/remove player
  const nTok = (await toks(page)).length;
  await page.click('#actions .act[aria-label="Add a player"]');
  await page.click('.sheet .btn.primary');
  ok((await toks(page)).length === nTok + 1, 'Add a player adds a token');
  await page.fill('.tp-label', 'Z9');
  await page.click('.tokpanel .pill:has-text("Remove")');
  ok((await toks(page)).length === nTok, 'Remove deletes the selected token');
  await page.click('.toast button:text-is("Undo")');
  ok((await toks(page)).length === nTok + 1, 'toast Undo brings a removed player back');
  // keyboard nudge
  await page.click('#tools .pill:has-text("Move")');
  await page.click('#chips .chip >> nth=0');
  const k0 = await tokClient(page, 'Z9');
  await page.mouse.click(k0.x, k0.y);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  const k1 = (await toks(page)).find(t => t.label === 'Z9');
  ok(k1 && k1.x === k0.unit.x + 8 && k1.y === k0.unit.y, 'arrow keys nudge the selected token (2 presses = 8 units)', { k0: k0.unit, k1 });

  // delete step
  await page.click('#actions .act[aria-label="Delete this step"]');
  ok(await page.locator('#chips .chip:not(.add)').count() === 1, 'Delete step removes the step');
  await page.click('.toast button:text-is("Undo")');
  ok(await page.locator('#chips .chip:not(.add)').count() === 2, 'Undo restores the deleted step');
  ok(page.__errs.length === 0, 'no console or page errors during editing', page.__errs);

  /* ============================================================ 4. touch input */
  console.log('\n[4] touch drag (real touch events through CDP)');
  await newPlay(page, { sport: 'Basketball', variant: 'Half court', start: 'Offense only', name: 'Touch test' });
  const cdp = await ctx.newCDPSession(page);
  const tc = await tokClient(page, '3');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', tc.x, tc.y);
  for (let i = 1; i <= 10; i++) await touch('touchMove', tc.x - i * 8, tc.y + i * 12);
  await touch('touchEnd');
  await sleep(200);
  const tm = (await toks(page)).find(t => t.label === '3');
  ok(Math.hypot(tm.x - tc.unit.x, tm.y - tc.unit.y) > 40, 'finger drag moves a token', { from: tc.unit, to: tm });
  ok(await page.evaluate(() => window.scrollY) === scrollBefore, 'page does not scroll while dragging a token');
  // touch freehand path
  await page.click('#tools .pill:has-text("Cut")');
  const tc2 = await tokClient(page, '4');
  await touch('touchStart', tc2.x, tc2.y);
  for (let i = 1; i <= 12; i++) await touch('touchMove', tc2.x + i * 10, tc2.y - i * 5 + Math.sin(i) * 6);
  await touch('touchEnd');
  await sleep(200);
  const mvT = await stored(page).then(a => a.find(p => p.name === 'Touch test').steps[0].m);
  ok(Object.values(mvT).some(m => m.k === 'run'), 'finger freehand path is stored', mvT);

  /* ============================================================ 5. animation + scrub */
  console.log('\n[5] animation');
  await page.click('.back'); await page.waitForSelector('.card');
  await openStarter(page, 'Pick and roll');
  const t0 = await toks(page);
  await page.click('#btnPlay');
  await sleep(350);
  const t1s = await toks(page);
  await sleep(500);
  const t2s = await toks(page);
  const changed = (a, b) => a.some((t, i) => Math.hypot(t.x - b[i].x, t.y - b[i].y) > 0.5);
  ok(changed(t0, t1s) || changed(t1s, t2s), 'press Play: token positions change over time');
  ok(changed(t1s, t2s), 'positions keep changing while playing');
  ok(await page.locator('#btnPlay[aria-label="Pause"]').count() === 1, 'play button becomes Pause');
  ok(/Step \d of 3/.test(await page.textContent('#stepInfo')), 'step N of M label shown while playing');
  const noteDuring = await page.inputValue('#note');
  ok(noteDuring.length > 0, 'step note is shown while playing', noteDuring);
  await page.click('#btnPlay');
  ok(await page.locator('#btnPlay[aria-label="Play"]').count() === 1, 'pause works');
  const p1 = await toks(page); await sleep(300); const p2 = await toks(page);
  ok(!changed(p1, p2), 'positions hold still while paused');
  // run to the end
  await page.click('.speeds .pill:text-is("2x")');
  await page.click('#btnRestart');
  await page.waitForFunction(() => document.getElementById('btnPlay').getAttribute('aria-label') === 'Play', null, { timeout: 12000 });
  const endPos = await toks(page);
  const planned = await stored(page).then(a => a.find(p => p.name === 'Pick and roll'));
  const tl = await page.evaluate(id => { const p = JSON.parse(localStorage.getItem('playboard.plays')).find(p => p.name === 'Pick and roll'); return PBE.buildTL(PBE.cleanPlay(p)).final; }, 0);
  const lab5 = planned.tokens.find(t => t.label === '5');
  const fin5 = endPos.find(t => t.label === '5');
  ok(Math.abs(fin5.x - 248) < 2 && Math.abs(fin5.y - 130) < 2, 'at the end of the play, token 5 is at its planned final position', fin5);
  ok(await page.inputValue('#scrub') === '3000', 'scrubber reaches the end');
  // scrub by dragging the slider
  const sb = await page.locator('#scrub').boundingBox();
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2);
  await page.mouse.down(); await page.mouse.move(sb.x + sb.width * 0.2, sb.y + sb.height / 2, { steps: 5 }); await page.mouse.up();
  const sv = +(await page.inputValue('#scrub'));
  ok(sv > 300 && sv < 900, 'dragging the slider scrubs (value ' + sv + ')');
  ok(/Step 1 of 3/.test(await page.textContent('#stepInfo')), 'scrubbing updates the step label');
  const sA = await toks(page);
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2); await page.mouse.down(); await page.mouse.move(sb.x + sb.width * 0.8, sb.y + sb.height / 2, { steps: 5 }); await page.mouse.up();
  const sB = await toks(page);
  ok(changed(sA, sB), 'scrubbing moves the tokens');
  await page.screenshot({ path: SHOTS + 'playboard-05-scrubbed.png' });
  // ball follows passes: ball element moves to receiver by end
  await page.click('#btnRestart');
  await page.waitForFunction(() => document.getElementById('btnPlay').getAttribute('aria-label') === 'Play', null, { timeout: 15000 });
  const ballT = await page.evaluate(() => document.querySelector('#lyrBall .ball').getAttribute('transform'));
  const bm = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(ballT);
  const tok5 = (await toks(page)).find(t => t.label === '5');
  ok(Math.hypot(+bm[1] - tok5.x, +bm[2] - tok5.y) < 30, 'ball ends with the receiver after a pass', { ball: [bm[1], bm[2]], tok5 });
  // back to editing
  await page.click('.ctx button:has-text("Edit this step")');
  ok(await page.locator('#tools').isVisible() && await page.locator('#lyrPaths path').count() > 0, '"Edit this step" returns to editing');

  /* ============================================================ 6. library: save, reopen, rename, duplicate, delete, reload */
  console.log('\n[6] library');
  await page.reload(); await page.waitForSelector('#lyrTokens .tok');
  ok(await page.locator('#boardView').isVisible(), 'reload reopens the last play');
  await page.click('.back'); await page.waitForSelector('.card');
  const names = await page.locator('.card-t').allTextContents();
  ok(names.includes('Edit test') && names.includes('Touch test') && names.includes('Pick and roll'), 'saved plays persist after reload', names);
  ok(await page.$$eval('.card-t', t => t.every(x => x.scrollWidth <= x.clientWidth && x.scrollHeight <= x.clientHeight + 1)), 'library card titles are not cut off sideways');
  const cardsBefore = await page.locator('.card').count();
  await page.click('.card:has(.card-t:text-is("Edit test")) .card-more');
  await page.click('.sheet .row-btn:has-text("Duplicate")');
  await sleep(200);
  ok(await page.locator('.card').count() === cardsBefore + 1 && await page.locator('.card-t:text-is("Edit test copy")').count() === 1, 'duplicate adds a copy');
  await page.click('.card:has(.card-t:text-is("Edit test copy")) .card-more');
  await page.click('.sheet .row-btn:has-text("Rename")');
  await page.fill('#dtName', 'Renamed play'); await page.fill('#dtNotes', 'Some notes');
  await page.click('.sheet .btn.primary:text-is("Save")');
  await sleep(350);
  ok(await page.locator('.card-t:text-is("Renamed play")').count() === 1, 'rename works', await page.locator('.card-t').allTextContents());
  await page.click('.card:has(.card-t:text-is("Renamed play")) .card-more');
  await page.click('.sheet .row-btn:has-text("Delete")');
  ok(await page.locator('.sheet h2:text-is("Delete this play?")').isVisible(), 'delete asks in a bottom sheet (no native confirm)');
  await sleep(500);
  const sheetBox = await page.locator('.sheet').boundingBox();
  ok(Math.abs(sheetBox.y + sheetBox.height - 844) < 3, 'sheet is anchored to the bottom');
  const radius = await page.locator('.sheet').evaluate(e => getComputedStyle(e).borderTopLeftRadius);
  ok(radius === '20px', 'sheet has 20px top radius', radius);
  await page.click('.sheet .btn.danger');
  await sleep(200);
  ok(await page.locator('.card-t:text-is("Renamed play")').count() === 0, 'delete removes the play');
  await page.reload(); await page.waitForSelector('.card');
  ok(await page.locator('#libView').isVisible(), 'relaunching from the library lands in the library');
  ok(await page.locator('.card-t:text-is("Renamed play")').count() === 0 && await page.locator('.card-t:text-is("Pick and roll")').count() === 1, 'library state survives reload');

  /* ============================================================ 7. sharing */
  console.log('\n[7] share link, picture, print');
  await openStarter(page, 'Backdoor cut');
  await page.click('.icon-btn[aria-label^="Share"]');
  await page.waitForSelector('.linkbox');
  await page.waitForFunction(() => /#p=/.test(document.querySelector('.linkbox').value));
  const link = await page.inputValue('.linkbox');
  ok(/#p=[zj][A-Za-z0-9_-]+$/.test(link), 'share link has #p= payload with a form prefix', link.slice(0, 80));
  ok(link.length < 700, 'link is short (' + link.length + ' chars)');
  ok(!/Backdoor|names/i.test(link), 'link does not contain the plain play name');
  ok(link.includes('#p=z'), 'link uses deflate-raw compression when the browser supports it');
  // picture: no navigator.share in this context => download path
  const dlPromise = page.waitForEvent('download', { timeout: 8000 });
  await page.click('.sheet .btn:has-text("Save picture")');
  const dl = await dlPromise;
  const dlPath = await dl.path();
  const buf = fs.readFileSync(dlPath);
  ok(buf.length > 8000 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'picture export downloads a non-empty PNG (' + buf.length + ' bytes)');
  fs.copyFileSync(dlPath, SHOTS + 'playboard-07-export.png');
  await page.keyboard.press('Escape');
  await sleep(350);

  // open the link in a fresh context (fresh storage)
  const ctx2 = await browser.newContext({ ...mobile });
  const page2 = await newPage(ctx2, { noGoto: true });
  await page2.goto(link);
  await page2.waitForSelector('#banner:not([hidden])');
  ok(await page2.locator('#banner button:text-is("Save to my plays")').isVisible(), 'shared link shows a "Save to my plays" button');
  ok(!/\b(null|undefined|NaN)\b/.test(await page2.evaluate(() => document.body.innerText)), 'shared view shows no stray null/undefined/NaN text');
  ok(/Backdoor cut/.test(await page2.textContent('.titlebox')), 'shared play title is shown');
  ok((await toks(page2)).length === 10, 'shared play shows its tokens');
  ok(await page2.locator('#tools').isHidden() && await page2.locator('#actions').isHidden(), 'shared play is read only (no tools)');
  const lib2 = await stored(page2);
  ok(!lib2 || lib2.length === 6 || lib2.length === 0, 'opening a link does not auto-save it', lib2 && lib2.map(p => p.name));
  ok(!(lib2 || []).some(p => p.name === 'Backdoor cut' && p.updated > Date.now() - 20000) , 'no new copy of the play in storage yet');
  // drag attempt does nothing in read-only
  const rt = (await toks(page2)).find(t => t.label === '2');
  const rc = await toClient(page2, rt.x, rt.y);
  await dragMouse(page2, rc, { x: rc.x + 60, y: rc.y + 60 });
  const rt2 = (await toks(page2)).find(t => t.label === '2');
  ok(rt2.x === rt.x && rt2.y === rt.y, 'tokens cannot be dragged in a shared play');
  await page2.click('#btnPlay'); await sleep(500);
  ok(await page2.locator('#btnPlay[aria-label="Pause"]').count() === 1, 'shared play can be played');
  await page2.screenshot({ path: SHOTS + 'playboard-07-shared.png' });
  await page2.click('#banner button:text-is("Save to my plays")');
  await sleep(300);
  const lib3 = await stored(page2);
  ok(lib3.length === 7 && lib3.some(p => p.name === 'Backdoor cut' && p.steps.length === 2), 'Save to my plays adds the play (starters + the saved copy)', lib3.map(p => p.name));
  ok(!/#p=/.test(page2.url()), 'hash is cleared after saving');
  ok(await page2.locator('#banner').isHidden() && await page2.locator('#tools').isVisible(), 'after saving, the play is editable');
  ok(page2.__errs.length === 0, 'no errors on the shared-link page', page2.__errs);
  // a bad link shows a message not a crash
  const ctx2b = await browser.newContext({ ...mobile });
  const page3 = await newPage(ctx2b, { noGoto: true });
  await page3.goto(BASE + '#p=zAAAAAAAA');
  await page3.waitForSelector('.toast');
  await sleep(300);
  ok(/couldn't be opened/.test(await page3.textContent('.toast')) && await page3.locator('.card').count() > 0, 'a corrupted link shows a message and the library');
  await ctx2.close(); await ctx2b.close();

  // native share + clipboard paths
  const ctx3 = await browser.newContext({ ...mobile });
  await ctx3.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
  const page4 = await newPage(ctx3, { noGoto: true });
  await page4.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = d => true;
    navigator.share = d => { window.__shared.push({ url: d.url || null, files: d.files ? d.files.map(f => ({ name: f.name, type: f.type, size: f.size })) : null }); return Promise.resolve(); };
  });
  await page4.goto(BASE);
  await page4.waitForSelector('.card');
  await page4.click('.card-open >> nth=0'); await page4.waitForSelector('#lyrTokens .tok');
  await page4.click('.icon-btn[aria-label^="Share"]');
  await page4.waitForFunction(() => /#p=/.test(document.querySelector('.linkbox').value));
  await page4.click('.sheet .btn.primary:has-text("Share link")');
  await page4.click('.sheet .btn:has-text("Save picture")');
  await sleep(1200);
  const shared = await page4.evaluate(() => window.__shared);
  ok(shared.some(s => s.url && /#p=/.test(s.url)), 'Share link uses navigator.share({url}) when available');
  ok(shared.some(s => s.files && s.files[0] && s.files[0].type === 'image/png' && s.files[0].size > 8000), 'Save picture uses navigator.share({files}) when available', shared);
  await ctx3.close();

  // clipboard fallback (no navigator.share)
  const ctx4 = await browser.newContext({ ...mobile });
  await ctx4.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
  const page5 = await newPage(ctx4, { noGoto: true });
  await page5.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined }); } catch (e) {} });
  await page5.goto(BASE); await page5.waitForSelector('.card');
  await page5.click('.card-open >> nth=0'); await page5.waitForSelector('#lyrTokens .tok');
  await page5.click('.icon-btn[aria-label^="Share"]');
  await page5.waitForFunction(() => /#p=/.test(document.querySelector('.linkbox').value));
  await page5.click('.sheet .btn.primary:has-text("Share link")');
  await sleep(300);
  ok(await page5.locator('.toast:has-text("Link copied")').count() === 1, 'without navigator.share the link is copied and a toast says so');
  await ctx4.close();

  // print stylesheet
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('.icon-btn[aria-label^="Share"]');
  await page.click('.sheet .btn:has-text("Print")');
  await sleep(300);
  ok(await page.evaluate(() => window.__printed) === 1, 'Print button calls window.print once');
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({
    appHidden: getComputedStyle(document.getElementById('app')).display === 'none',
    figs: document.querySelectorAll('#printRoot .pfig').length,
    notes: [...document.querySelectorAll('#printRoot figcaption')].map(f => f.textContent.length > 0).length,
    vis: getComputedStyle(document.getElementById('printRoot')).display
  }));
  ok(pr.appHidden && pr.vis === 'block' && pr.figs === 3 && pr.notes === 2, 'print media: app hidden, overview + one diagram per step with notes', pr);
  await page.screenshot({ path: SHOTS + 'playboard-07-print-preview.png' });
  try { const pdf = await page.pdf({ format: 'A4', printBackground: false }); fs.writeFileSync(SHOTS + 'playboard-07-print.pdf', pdf); ok(pdf.length > 3000, 'print to PDF produced a document (' + pdf.length + ' bytes)'); const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; ok(pages === 1, 'print: one play fits on one page (' + pages + ' page)'); } catch (e) { ok(false, 'pdf render', String(e)); }
  await page.emulateMedia({ media: 'screen' });

  /* ============================================================ 8. more sheet, about, accessibility */
  console.log('\n[8] sheets, about, accessibility');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.click('.icon-btn[aria-label="More options"]');
  await page.waitForSelector('.sheet.open');
  await page.click('.sheet .row-btn:has-text("About and help")');
  await page.waitForSelector('.sheet h2:text-is("About and help")');
  ok(/Play Board v1/.test(await page.textContent('.sheet')), 'About shows the version string');
  await page.screenshot({ path: SHOTS + 'playboard-08-about.png' });
  await page.keyboard.press('Escape'); await sleep(350);
  ok(await page.locator('.sheet').count() === 0, 'Escape closes a sheet');
  // buttons have labels
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && !b.textContent.trim() && !b.getAttribute('aria-label')).length);
  ok(unlabeled === 0, 'every visible icon-only button has an aria-label', unlabeled);
  // tap targets
  const small = await page.evaluate(() => [...document.querySelectorAll('button,input[type=range],input[type=text],textarea')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || e.id).slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(r => r.h < 43.5 || r.w < 43.5));
  ok(small.length === 0, 'all visible controls are at least 44px', small);
  // hidden rule
  const hiddenWins = await page.evaluate(() => { const b = document.createElement('button'); b.className = 'btn pill act'; b.hidden = true; document.body.append(b); const d = getComputedStyle(b).display; b.remove(); return d; });
  ok(hiddenWins === 'none', '[hidden] beats display on classed elements', hiddenWins);
  // focus-visible styles exist
  const focusCss = await page.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /focus-visible/.test(r.selectorText || '')); } catch (e) { return false; } }));
  ok(focusCss, ':focus-visible rule exists');
  // no horizontal scroll
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page scroll at 390px');
  // safe-area padding present on fixed bars
  const css = await (await ctx.request.get(BASE + 'style.css')).text();
  ok(/env\(safe-area-inset-bottom\)/.test(css) && /env\(safe-area-inset-top\)/.test(css), 'safe-area insets used on fixed bars');
  ok(/prefers-reduced-motion/.test(css), 'prefers-reduced-motion handled');
  ok(!/window\.(confirm|alert|prompt)|[^.\w](alert|confirm|prompt)\(/.test(fs.readFileSync(path.join(ROOT, 'apps/playboard/app.js'), 'utf8')), 'no native confirm/alert/prompt in app code');
  // reduced motion: play still animates
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#btnRestart'); await sleep(400);
  const rm1 = await toks(page); await sleep(400); const rm2 = await toks(page);
  ok(changed(rm1, rm2), 'with prefers-reduced-motion the play animation still runs');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.click('#btnPlay');

  /* ============================================================ 9. other sports: pass / ball semantics */
  console.log('\n[9] baseball and football starters');
  await openStarter(page, 'Bunt coverage');
  await page.click('.chip >> nth=1');
  ok(await page.locator('#lyrPaths path').count() >= 4, 'bunt coverage step 2 draws throws/back-ups');
  await page.screenshot({ path: SHOTS + 'playboard-09-bunt.png' });
  await openStarter(page, 'Slant');
  await page.screenshot({ path: SHOTS + 'playboard-09-slant.png' });
  // volleyball rotate
  await newPlay(page, { sport: 'Volleyball', start: 'Six players', name: 'VB rot' });
  const vb0 = await toks(page);
  await page.click('.icon-btn[aria-label="More options"]');
  await page.click('.sheet .row-btn:has-text("Rotate the lineup")');
  await sleep(300);
  const vb1 = await toks(page);
  ok(vb0.some((t, i) => Math.hypot(t.x - vb1[i].x, t.y - vb1[i].y) > 50), 'volleyball Rotate lineup moves players one spot');

  /* ============================================================ 10. reload / offline */
  console.log('\n[10] offline');
  await page.goto(BASE); await page.waitForSelector('#lyrTokens .tok, .card');
  await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null || true);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
  await sleep(800);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const k = ks.find(k => k.startsWith('playboard-')); if (!k) return null; const c = await caches.open(k); return { k, urls: (await c.keys()).map(r => new URL(r.url).pathname) }; });
  ok(cached && cached.k === 'playboard-v2' && cached.urls.some(u => /app\.js$/.test(u)) && cached.urls.some(u => /engine\.js$/.test(u)) && cached.urls.some(u => /style\.css$/.test(u)), 'service worker cached the app shell in playboard-v2', cached);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#lyrTokens .tok, .card', { timeout: 8000 });
  ok(await page.locator('#boardView').isVisible() || await page.locator('.card').count() > 0, 'offline reload works after the first visit');
  ok(await page.evaluate(() => !!window.PBE), 'offline: scripts loaded from cache');
  await page.screenshot({ path: SHOTS + 'playboard-10-offline.png' });
  await ctx.setOffline(false);
  ok(page.__errs.length === 0, 'no console or page errors in the main session', page.__errs);

  /* ============================================================ 11. blocked storage */
  console.log('\n[11] storage that fails');
  const ctx5 = await browser.newContext({ ...mobile });
  const pageB = await newPage(ctx5, { noGoto: true });
  await pageB.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; Storage.prototype.getItem = function () { throw new Error('blocked'); }; });
  await pageB.goto(BASE);
  await pageB.waitForSelector('.card');
  ok(await pageB.locator('.card').count() === 6, 'app still works when localStorage throws (starters shown)');
  await pageB.click('.card-open >> nth=0'); await pageB.waitForSelector('#lyrTokens .tok');
  const tb = await tokClient(pageB, '2');
  await dragMouse(pageB, tb, { x: tb.x + 30, y: tb.y + 30 });
  await sleep(700);
  ok(await pageB.locator('.toast.err:has-text("Couldn\'t save on this phone")').count() >= 1, 'a failed save shows the toast "Couldn\'t save on this phone"');
  ok(pageB.__errs.length === 0, 'no page errors with blocked storage', pageB.__errs);
  await ctx5.close();

  /* ============================================================ 12. tablet */
  console.log('\n[12] tablet 768x1024');
  const ctx6 = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, hasTouch: true });
  const pageT = await newPage(ctx6);
  await pageT.waitForSelector('.card');
  await pageT.screenshot({ path: SHOTS + 'playboard-12-tablet-library.png' });
  await openStarter(pageT, 'Pick and roll');
  await pageT.click('.chip >> nth=1');
  await pageT.screenshot({ path: SHOTS + 'playboard-12-tablet-board.png' });
  ok(await pageT.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'tablet: no horizontal scroll');
  await newPlay(pageT, { sport: 'Basketball', variant: 'Full court', start: 'Offense only', name: 'tab full' });
  await pageT.screenshot({ path: SHOTS + 'playboard-12-tablet-fullcourt.png' });
  const bb = await pageT.locator('#boardWrap').boundingBox();
  ok(bb.height < 1024 - 150, 'tablet: full court board fits the screen height (' + Math.round(bb.height) + ')');
  ok(pageT.__errs.length === 0, 'no errors on tablet', pageT.__errs);
  await ctx6.close();


  /* ============================================================ 13. extras */
  console.log('\n[13] extras: back button, full court, tap-to-pass, persisted prefs');
  await page.goto(BASE); await page.waitForSelector('.card, #lyrTokens .tok');
  if (await page.locator('#boardView').isVisible()) { await page.click('.back'); await page.waitForSelector('.card'); }
  await page.click('.card-open >> nth=0');
  await page.waitForSelector('#lyrTokens .tok');
  await page.goBack();
  await sleep(300);
  ok(await page.locator('#libView').isVisible() && await page.locator('#boardView').isHidden(), 'browser/Android back from a play returns to the library');
  await openStarter(page, 'Give and go');
  // full court toggle
  const vbA = await page.getAttribute('#board', 'viewBox');
  await page.click('#courtToggle .pill');
  const vbB = await page.getAttribute('#board', 'viewBox');
  ok(vbA === '0 0 500 470' && vbB === '0 0 500 940', 'Full court toggle switches the viewBox (half -> full)', { vbA, vbB });
  ok((await stored(page)).find(p => p.name === 'Give and go').variant === 'full', 'full court choice is saved');
  ok(await page.locator('#courtToggle .pill[aria-pressed="true"]').count() === 1, 'court toggle is a pill with aria-pressed');
  await page.click('#courtToggle .pill');
  // tap-to-pass flow on step 3 (new step): holder is whoever has the ball at that point
  await page.click('#chips .chip.add');
  await page.click('#tools .pill:has-text("Pass")');
  const holderLabel = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('playboard.plays')).find(p => p.name === 'Give and go'); return null; });
  // after step 2 the ball is back with player 1 (2 passed back to 1)
  const h1 = await tokClient(page, '1');
  await page.mouse.click(h1.x, h1.y);
  ok(await page.locator('.ctx button:text-is("Cancel")').isVisible(), 'tapping the ball carrier with Pass starts tap-the-receiver mode');
  const h3 = await tokClient(page, '3');
  await page.mouse.click(h3.x, h3.y);
  const mvG = (await stored(page)).find(p => p.name === 'Give and go').steps[2].m;
  ok(Object.values(mvG).some(m => m.k === 'pass'), 'tap passer then receiver stores the pass', mvG);
  // play the whole thing: ball must end with 3
  await page.click('#btnRestart');
  await page.click('.speeds .pill:text-is("2x")');
  await page.waitForFunction(() => document.getElementById('btnPlay').getAttribute('aria-label') === 'Play', null, { timeout: 15000 });
  const bt = await page.evaluate(() => /translate\(([-\d.]+) ([-\d.]+)\)/.exec(document.querySelector('#lyrBall .ball').getAttribute('transform')).slice(1).map(Number));
  const t3x = (await toks(page)).find(t => t.label === '3');
  ok(Math.hypot(bt[0] - t3x.x, bt[1] - t3x.y) < 30, 'after a 3-step pass chain the ball is with the last receiver', { bt, t3x });
  // prefs persisted
  ok(await page.evaluate(() => localStorage.getItem('playboard.speed')) === '2', 'speed choice is remembered');
  ok(await page.evaluate(() => localStorage.getItem('playboard.hint')) === '1', 'first-run hint dismissal is remembered');
  // new bb play: hint (dismissed) not shown again
  await page.click('.back'); await page.waitForSelector('#fab');
  await page.click('#fab'); await page.click('.sheet .btn.primary:text-is("Create play")');
  await page.waitForSelector('#lyrTokens .tok');
  ok(await page.locator('#firstHint').isHidden(), 'first-run hint stays dismissed');
  // More sheet for basketball has no stray text and no Rotate
  await page.click('.icon-btn[aria-label="More options"]');
  await page.waitForSelector('.sheet.open');
  const moreTxt = await page.innerText('.sheet');
  ok(!/\bnull\b|undefined/.test(moreTxt) && !/Rotate the lineup/.test(moreTxt), 'basketball More sheet: no stray "null", no volleyball-only items');
  await page.keyboard.press('Escape'); await sleep(350);
  await page.click('.back'); await page.waitForSelector('#fab');
  // volleyball tool names are distinct
  await newPlay(page, { sport: 'Volleyball', start: 'Six players', name: 'vb names' });
  const vbTools = await page.locator('#tools .pill').allInnerTexts();
  ok(new Set(vbTools.map(s => s.trim())).size === vbTools.length, 'volleyball tool names are all different', vbTools);
  // empty board message, then empty library message
  await newPlay(page, { sport: 'Basketball', variant: 'Half court', start: 'Empty board', name: 'empty one' });
  ok(/board is empty/i.test(await page.innerText('#ctx')), 'an empty board explains what to do next');
  await page.click('.back'); await page.waitForSelector('#fab');
  await page.evaluate(() => { localStorage.setItem('playboard.plays', '[]'); });
  await page.reload(); await page.waitForSelector('#fab');
  ok(await page.locator('#libEmpty').isVisible() && /No plays yet/.test(await page.innerText('#libEmpty')), 'empty library shows an empty state');
  ok(await page.locator('.card').count() === 0, 'starters are not re-seeded after the library is emptied');
  ok(page.__errs.length === 0, 'no errors in extras', page.__errs);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
