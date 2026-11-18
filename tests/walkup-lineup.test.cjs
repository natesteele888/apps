// Walk-Up positions by inning (the lineup card) and what the Dugout watch gets. Run:
//   NODE_PATH=<node_modules with playwright> tests/run.sh walkup-lineup
// The logic (core.js) is tested in node. The page tests use the real Walk-Up page; the bridge test adds a fake Dugout app
// (window.WalkupNative) that records what the page would send to the watch. Placeholder names only.
const assert = require('assert');
const C = require('../apps/walkup/core.js');
const { chromium, startServer, newPage, CHROME } = require('./lib.cjs');

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const results = [];
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deep = (a, b, m) => assert.deepStrictEqual(a, b, m);

const FAKE_NATIVE = () => {
  try { delete Window.prototype.speechSynthesis; delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; } catch (e) {}
  window.__sent = { state: [], pitch: [] };
  window.WalkupNative = {
    postState: j => window.__sent.state.push(JSON.parse(j)),
    postPitch: j => window.__sent.pitch.push(JSON.parse(j)),
    ttsSpeak: (id) => { setTimeout(() => window.__wuTts && window.__wuTts(id, 'end'), 30); },
    ttsStop: () => {}
  };
};

/* nine players in the order, two more on the bench */
const IDS = ['pla01', 'pla02', 'pla03', 'pla04', 'pla05', 'pla06', 'pla07', 'pla08', 'pla09', 'pla10', 'pla11'];
const roster = () => IDS.map((id, i) => ({ id, name: 'Player ' + (i + 1), num: String(i + 1) }));

(async () => {
  await test('Core: a new team has 6 innings and no positions; old saved teams load the same', async () => {
    deep(C.emptyState().def, { n: 6, pos: {} });
    deep(C.sanitizeState({ roster: roster(), lineup: IDS.slice(0, 9) }).def, { n: 6, pos: {} }, 'a team saved before positions existed');
    deep(C.emptyDef(), { n: 6, pos: {} });
    eq(C.LIM.innings, 9);
    deep(C.DEF_POS, ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']);
  });

  await test('Core: saved positions are cleaned: innings 1 to 9, known positions only, roster players only', async () => {
    const st = C.sanitizeState({
      roster: roster(), lineup: IDS.slice(0, 9),
      def: { n: 40, pos: { pla01: ['p', ' ss ', 'bench', 'XX', 5, null, 'cf', 'lf', 'rf', '1b', '2b'], pla02: ['', '', ''], nobody: ['P'], 'bad id!': ['C'], pla03: 'SS', pla04: ['BENCH'] } }
    });
    eq(st.def.n, 9, 'never more than 9 innings');
    deep(st.def.pos.pla01, ['P', 'SS', 'Bench', '', '', '', 'CF', 'LF', 'RF'], 'cut to 9, unknown positions become blank');
    eq('pla02' in st.def.pos, false, 'a row with nothing in it is dropped');
    eq('nobody' in st.def.pos, false, 'someone who is not on the team is dropped');
    eq('bad id!' in st.def.pos, false);
    eq('pla03' in st.def.pos, false, 'a row that is not a list is dropped');
    deep(st.def.pos.pla04, ['Bench']);
    eq(C.sanitizeState({ roster: roster(), def: { n: 0 } }).def.n, 1, 'at least one inning');
    eq(C.sanitizeState({ roster: roster(), def: { n: 'seven' } }).def.n, 6, 'nonsense means the default');
    eq(C.sanitizeState({ roster: roster(), def: { n: 7.4 } }).def.n, 7);
    deep(C.sanitizeState({ roster: roster(), def: { pos: JSON.parse('{"__proto__":["P"],"pla01":["C"]}') } }).def.pos, { pla01: ['C'] }, 'no prototype tricks');
    // a backup carries the grid
    const b = C.makeBackup(st, '2026-11-07');
    deep(b.data.def, st.def);
  });

  await test('Core: set, get and the row the watch gets, always as long as the game', async () => {
    const d = C.emptyDef();
    C.defSet(d, 'pla01', 0, 'p'); C.defSet(d, 'pla01', 2, 'SS'); C.defSet(d, 'pla01', 3, 'bench');
    deep(d.pos.pla01, ['P', '', 'SS', 'Bench']);
    eq(C.defGet(d, 'pla01', 2), 'SS'); eq(C.defGet(d, 'pla01', 1), ''); eq(C.defGet(d, 'pla01', 8), ''); eq(C.defGet(d, 'pla02', 0), '');
    deep(C.defRow(d, 'pla01'), ['P', '', 'SS', 'Bench', '', '']);
    deep(C.defRow(d, 'pla02'), ['', '', '', '', '', '']);
    C.defSet(d, 'pla01', 3, ''); deep(d.pos.pla01, ['P', '', 'SS'], 'clearing the last one trims the row');
    C.defSet(d, 'pla01', 0, ''); C.defSet(d, 'pla01', 2, 'nope'); eq('pla01' in d.pos, false, 'an empty row goes away');
    C.defSet(d, 'pla01', 9, 'P'); C.defSet(d, 'pla01', -1, 'P'); C.defSet(d, 'bad id!', 0, 'P'); deep(d.pos, {}, 'out of range and bad ids change nothing');
    d.n = 3; C.defSet(d, 'pla05', 5, 'C'); deep(C.defRow(d, 'pla05'), ['', '', ''], 'innings past the game are kept but not sent');
    d.n = 6; deep(C.defRow(d, 'pla05'), ['', '', '', '', '', 'C'], 'and come back when the game is longer');
    eq(C.defUsed(C.emptyDef(), IDS), false); d.n = 3; eq(C.defUsed(d, IDS), false, 'only innings in the game count'); d.n = 6; eq(C.defUsed(d, IDS), true);
  });

  await test('Core: each inning is checked: a position twice, a position nobody plays, who sits', async () => {
    const d = C.emptyDef(), ids = IDS.slice(0, 10);
    C.DEF_POS.forEach((p, i) => C.defSet(d, ids[i], 0, p));
    C.defSet(d, ids[9], 0, 'Bench');
    let inn = C.defInning(d, ids, 0);
    eq(inn.ok, true); deep(inn.dupes, []); deep(inn.missing, []); deep(inn.sit, ['pla10']); deep(inn.open, []); eq(inn.placed, 9);
    deep(inn.by.SS, ['pla06']); eq(C.defWarn(inn), '');
    // inning 2: two at SS, nobody in LF, one not set
    C.DEF_POS.forEach((p, i) => C.defSet(d, ids[i], 1, p));
    C.defSet(d, ids[6], 1, 'SS'); C.defSet(d, ids[9], 1, '');
    inn = C.defInning(d, ids, 1);
    eq(inn.ok, false); deep(inn.dupes, ['SS']); deep(inn.missing, ['LF']); deep(inn.by.SS, ['pla06', 'pla07']); deep(inn.open, ['pla10']);
    eq(C.defWarn(inn), '2 at SS · no LF');
    // an inning with nobody placed yet is "not set", not a warning
    inn = C.defInning(d, ids, 2);
    eq(inn.empty, true); eq(inn.ok, false); eq(C.defWarn(inn), ''); eq(inn.missing.length, 9);
    const all = C.defCheck(d, ids);
    eq(all.length, 6); deep(all.map(x => x.ok), [true, false, false, false, false, false]);
  });

  await test('Core: Copy inning 1 to all fills the game, and knows when it would write over later innings', async () => {
    const d = C.emptyDef(), ids = IDS.slice(0, 10);
    C.DEF_POS.forEach((p, i) => C.defSet(d, ids[i], 0, p)); C.defSet(d, ids[9], 0, 'Bench');
    eq(C.defLaterUsed(d, ids), false);
    C.defCopyFirst(d, ids);
    for (let k = 0; k < 6; k++) eq(C.defInning(d, ids, k).ok, true, 'inning ' + (k + 1));
    deep(C.defRow(d, 'pla10'), ['Bench', 'Bench', 'Bench', 'Bench', 'Bench', 'Bench']);
    eq(C.defLaterUsed(d, ids), true);
    // a player with nothing in inning 1 ends up with nothing anywhere
    C.defSet(d, 'pla11', 3, 'P'); C.defCopyFirst(d, IDS); deep(C.defRow(d, 'pla11'), ['', '', '', '', '', '']);
  });

  const srv = await startServer('walkup');
  const br = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function open(native) {
    const { ctx, page, errors } = await newPage(br, {});
    if (native) await page.addInitScript(FAKE_NATIVE);
    await page.goto(srv.url);
    await page.waitForSelector('#wuNav .navb');
    return { ctx, page, errors };
  }
  const st = page => page.evaluate(() => JSON.parse(JSON.stringify(window.WalkupApp.S.st)));
  const pick = async (page, row, k, label) => {
    await page.click('.sheet.def .defgrid tbody tr:not(.sep) >> nth=' + row + ' >> [data-do=cell][data-k="' + k + '"]');
    await page.waitForSelector('.sheet-wrap.open .sheet.defpicker');
    await page.click('.sheet.defpicker .dp:has(b:text-is("' + label + '"))');
    await page.waitForFunction(() => !document.querySelector('.sheet.defpicker'));
  };

  await test('Page: Positions by inning from the Team tab: tap a box, pick a position, copy inning 1, warnings, and it stays after a reload', async () => {
    const { page, errors, ctx } = await open(false);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    await page.click('[data-act=tab][data-tab=team]');
    await page.click('[data-act=def-open]');
    await page.waitForSelector('.sheet-wrap.open .sheet.def');
    eq(await page.$$eval('.sheet.def .defgrid tbody tr:not(.sep)', r => r.length), 9, 'one row per player');
    eq(await page.$$eval('.sheet.def .defgrid thead th', r => r.length), 7, 'Player and 6 innings');
    assert.ok(/No positions yet/.test(await page.textContent('#defChecks')));
    // the sample team's own positions, in batting order: SS CF 2B C 1B 3B LF RF P
    const want = ['SS', 'CF', '2B', 'C', '1B', '3B', 'LF', 'RF', 'P'];
    for (let r = 0; r < 9; r++) await pick(page, r, 0, want[r]);
    let s = await st(page);
    deep(s.lineup.map(id => s.def.pos[id][0]), want);
    assert.ok(/Inning 1: all 9 set/.test(await page.textContent('#defChecks')), await page.textContent('#defChecks'));
    assert.ok(/Inning 2: not set/.test(await page.textContent('#defChecks')));
    // the picker shows who already has a position this inning
    await page.click('.sheet.def .defgrid tbody tr:not(.sep) >> nth=1 >> [data-do=cell][data-k="0"]');
    await page.waitForSelector('.sheet.defpicker');
    assert.ok(/#7/.test(await page.textContent('.sheet.defpicker .dp.taken:has(b:text-is("SS"))')), 'SS shows the sample shortstop');
    eq(await page.textContent('.sheet.defpicker .dp.on b'), 'CF', 'the current one is marked');
    await page.click('.sheet.defpicker [data-close].btn'); await page.waitForFunction(() => !document.querySelector('.sheet.defpicker'));
    // copy inning 1 to all
    await page.click('.sheet.def [data-do=copy]');
    await page.waitForFunction(() => /Inning 6: all 9 set/.test(document.querySelector('#defChecks').textContent));
    s = await st(page);
    deep(s.def.pos[s.lineup[0]], ['SS', 'SS', 'SS', 'SS', 'SS', 'SS']);
    // inning 3: the shortstop and the center fielder both at SS: a warning chip, and both boxes marked
    await pick(page, 1, 2, 'SS');
    await page.waitForFunction(() => /Inning 3: 2 at SS · no CF/.test(document.querySelector('#defChecks').textContent));
    eq(await page.$$eval('.sheet.def .dcell.dup', b => b.length), 2);
    assert.ok(await page.$('#defChecks .chip.warn'));
    // the catcher sits in inning 4: shows "Sit", and inning 4 has no C
    await pick(page, 3, 3, 'Sit');
    eq((await st(page)).def.pos[s.lineup[3]][3], 'Bench');
    await page.waitForFunction(() => /Inning 4: no C/.test(document.querySelector('#defChecks').textContent));
    // copying again asks first, because later innings have positions
    await page.click('.sheet.def [data-do=copy]');
    await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]');
    await page.waitForFunction(() => !/warn/.test(Array.from(document.querySelectorAll('#defChecks .chip')).map(c => c.className).join(' ')));
    // 7 innings
    await page.click('.sheet.def [data-key=defn][data-step="1"]');
    await page.waitForFunction(() => document.querySelectorAll('.sheet.def .defgrid thead th').length === 8);
    eq((await st(page)).def.n, 7);
    assert.ok(/Inning 7: not set/.test(await page.textContent('#defChecks')));
    // no page sideways scroll at phone width (the grid scrolls inside itself)
    eq(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0), true);
    // a reload keeps it
    await page.reload(); await page.waitForSelector('#wuNav .navb');
    s = await st(page);
    eq(s.def.n, 7); deep(s.def.pos[s.lineup[0]].slice(0, 6), ['SS', 'SS', 'SS', 'SS', 'SS', 'SS']);
    // clear all asks first
    await page.click('[data-act=tab][data-tab=team]'); await page.click('[data-act=def-open]'); await page.waitForSelector('.sheet.def');
    await page.click('.sheet.def [data-do=clear]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]');
    await page.waitForFunction(() => /No positions yet/.test(document.querySelector('#defChecks').textContent));
    deep((await st(page)).def.pos, {});
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await test('Bridge: the watch gets each player\'s positions by inning, only once a grid is set', async () => {
    const { page, errors, ctx } = await open(true);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    await page.waitForFunction(() => window.__sent.state.some(s => s.lineup && s.lineup.length === 9));
    let s = await page.evaluate(() => window.__sent.state[window.__sent.state.length - 1]);
    eq(s.innings, 0, 'no grid yet'); eq('inn' in s.lineup[0], false, 'and no per-inning rows');
    // a bench player and a grid
    await page.evaluate(() => {
      const W = window.WU, C = window.WalkupCore, S = W.S.st, ids = S.lineup.slice();
      S.lineup = ids.slice(0, 8); // the ninth sits out of the batting order
      C.DEF_POS.forEach((p, i) => C.defSet(S.def, ids[i], 0, p));
      C.defSet(S.def, ids[8], 1, 'Bench');
      S.def.n = 4;
      W.commit('data');
    });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.innings === 4 && s.bench.length === 1; });
    s = await page.evaluate(() => window.__sent.state[window.__sent.state.length - 1]);
    deep(s.lineup[0].inn, ['P', '', '', ''], 'one entry per inning');
    deep(s.lineup[5].inn, ['SS', '', '', '']);
    deep(s.bench[0].inn, ['RF', 'Bench', '', ''], 'the bench too');
    assert.ok(typeof s.lineup[0].pos === 'string', 'the single position is still sent for older watches');
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
