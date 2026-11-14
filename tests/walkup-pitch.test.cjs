// Walk-Up pitching and the Dugout phone-app bridge. Run:
//   NODE_PATH=<node_modules with playwright> tests/run.sh walkup-pitch
// The math (pitch-core.js) is tested in node; the page tests use the real Walk-Up page with a fake Dugout app
// (window.WalkupNative) that records what the page would send to the watch. Placeholder names only.
const assert = require('assert');
const P = require('../apps/walkup/pitch-core.js');
const { chromium, startServer, newPage } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));

const FAKE_NATIVE = () => {
  // Android's web view has no speech; take Chrome's away so the bridge's stand-in (Android text-to-speech) is used.
  try { delete Window.prototype.speechSynthesis; delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; } catch (e) {}
  window.__sent = { state: [], pitch: [], tts: [] };
  window.WalkupNative = {
    postState: j => window.__sent.state.push(JSON.parse(j)),
    postPitch: j => window.__sent.pitch.push(JSON.parse(j)),
    ttsSpeak: (id, text) => { window.__sent.tts.push(text); setTimeout(() => window.__wuTts && window.__wuTts(id, 'end'), 30); },
    ttsStop: () => {}
  };
};

(async () => {
  await test('Math: counts per day, yellow at 10 left, red at 5, undo, limits', async () => {
    const now = Date.now(), day = P.ymd(now), log = P.emptyLog();
    log.pitchers = [{ id: 'pAAAA1', name: 'Pitcher A', limit: 0 }, { id: 'pBBBB2', name: 'Pitcher B', limit: 30 }];
    P.setCurrent(log, 'pAAAA1', 'Pitcher A', now);
    for (let i = 0; i < 74; i++) P.addPitch(log, 'pAAAA1', now + i + 1);
    let r = P.bullpen(log, day, {}, {})[0];
    eq(r.left, 11); eq(r.zone, 'green');
    P.addPitch(log, 'pAAAA1', now + 100); eq(P.bullpen(log, day, {}, {})[0].zone, 'yellow');
    for (let i = 0; i < 5; i++) P.addPitch(log, 'pAAAA1', now + 200 + i);
    r = P.bullpen(log, day, {}, {})[0]; eq(r.left, 5); eq(r.zone, 'red');
    for (let i = 0; i < 5; i++) P.addPitch(log, 'pAAAA1', now + 300 + i);
    eq(P.bullpen(log, day, {}, {})[0].zone, 'limit');
    P.undo(log, 'pAAAA1', day, now + 400); eq(P.counts(log, day).pAAAA1, 84);
    eq(P.limitFor(log, 'pBBBB2'), 30); log.max = 25; eq(P.limitFor(log, 'pBBBB2'), 25);
    log.division = 'None'; log.max = 0; eq(P.limitFor(log, 'pAAAA1'), 0);
  });

  await test('Math: the phone and the watch both count while apart, and merging counts every pitch once', async () => {
    const now = Date.now(), day = P.ymd(now), phone = P.emptyLog();
    phone.pitchers = [{ id: 'pAAAA1', name: 'Pitcher A' }];
    P.addPitch(phone, 'pAAAA1', now);
    const watch = JSON.parse(JSON.stringify(phone));
    P.addPitch(watch, 'pAAAA1', now + 1); P.addPitch(watch, 'pAAAA1', now + 2);
    P.addPitch(phone, 'pAAAA1', now + 3);
    const a = P.merge(phone, watch); eq(P.counts(a.log, day).pAAAA1, 4);
    const b = P.merge(a.log, watch); eq(b.added, 0); eq(P.counts(b.log, day).pAAAA1, 4);
    const c = P.merge(watch, a.log); eq(P.counts(c.log, day).pAAAA1, 4);
    // an undo on the watch of a pitch the phone made
    P.undo(c.log, 'pAAAA1', day, now + 10);
    eq(P.counts(P.merge(a.log, c.log).log, day).pAAAA1, 3);
  });

  await test('Math: rest days and three days in a row, like Ballclub', async () => {
    const day = '2026-04-15';
    eq(P.eligibility([{ date: '2026-04-14', pitches: 50 }], 'Majors', day).eligibleOn, '2026-04-17');
    eq(P.eligibility([{ date: '2026-04-14', pitches: 15 }], 'Majors', day).eligible, true);
    eq(P.eligibility([{ date: '2026-04-14', pitches: 15 }, { date: '2026-04-13', pitches: 15 }], 'Majors', day).eligible, false);
    assert.deepStrictEqual(P.nextRestStep(18, 'Majors'), { at: 21, rest: 1 });
    eq(P.nextRestStep(70, 'Majors'), null);
  });

  const srv = await startServer('walkup');
  const br = await chromium.launch({ executablePath: require('./lib.cjs').CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function open(native) {
    const { ctx, page, errors } = await newPage(br, {});
    if (native) await page.addInitScript(FAKE_NATIVE);
    await page.goto(srv.url);
    await page.waitForSelector('#wuNav .navb');
    return { ctx, page, errors };
  }

  await test('Page: the pitching card sits above the walk-up player, counts, undoes and turns red near the limit', async () => {
    const { page, errors, ctx } = await open(false);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    const order = await page.evaluate(() => { const a = document.querySelector('#ptCard'), b = document.querySelector('#gPlay'); return a.getBoundingClientRect().top < b.getBoundingClientRect().top; });
    eq(order, true, 'pitching is on top');
    await page.click('#ptCard [data-act=pt-add]'); await page.click('#ptCard [data-act=pt-add]'); await page.click('#ptCard [data-act=pt-add]');
    eq(await page.textContent('#ptCount'), '3');
    await page.click('#ptCard [data-act=pt-undo]'); eq(await page.textContent('#ptCount'), '2');
    await page.evaluate(() => { const L = window.WU.pitch.log(); L.max = 9; L.setupAt = Date.now(); window.WU.emit('pitch'); });
    await page.click('#ptCard [data-act=pt-add]'); await page.click('#ptCard [data-act=pt-add]');
    eq(await page.getAttribute('#ptCard', 'class'), 'card pitch z-red');
    eq(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0), true);
    // the bullpen: add a second pitcher and switch to them
    await page.click('#ptCard [data-act=pt-pen]'); await page.waitForSelector('.sheet-wrap.open #ptNew');
    await page.fill('#ptNew', 'Pitcher Two'); await page.click('.sheet-wrap.open [data-act=pt-newp]');
    await page.waitForFunction(() => /Pitcher Two/.test(document.querySelector('#ptCard .pt-who').textContent));
    eq(await page.textContent('#ptCount'), '0');
    // it stays after a reload
    await page.reload(); await page.waitForSelector('#ptCard');
    eq(await page.textContent('#ptCount'), '0');
    assert.ok(/Pitcher Two/.test(await page.textContent('#ptCard .pt-who')));
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await test('Bridge: in the Dugout app the page sends the lineup and pitches, and runs the watch\'s commands', async () => {
    const { page, errors, ctx } = await open(true);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    await page.waitForFunction(() => window.__sent.state.some(s => s.lineup && s.lineup.length > 0));
    const st = await page.evaluate(() => window.__sent.state[window.__sent.state.length - 1]);
    eq(st.batter, 0); assert.ok(st.lineup[0].id && st.lineup[0].ready === true);
    // the watch moves to batter 3
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'select', index: 2 })));
    eq(await page.evaluate(() => window.WalkupApp.S.st.batter), 2);
    // play that batter, then moving does NOT stop the song
    const id = st.lineup[2].id;
    await page.evaluate(i => window.__wuCmd(JSON.stringify({ cmd: 'play', id: i })), id);
    await page.waitForFunction(() => window.__sent.state.some(s => s.playing && s.playing.id));
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'select', index: 0 })));
    eq(await page.evaluate(() => !!window.WalkupApp.eng.playing()), true, 'still playing');
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'stop' })));
    await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    // pitches from the watch merge in once
    await page.click('#ptCard [data-act=pt-add]');
    await page.waitForFunction(() => window.__sent.pitch.length > 0);
    const watchLog = await page.evaluate(() => JSON.parse(JSON.stringify(window.WU.pitch.log())));
    const pid = watchLog.events.filter(e => e.k === 'p')[0].p;
    watchLog.events.push({ i: 'ewatch0001', k: 'p', p: pid, t: Date.now() }, { i: 'ewatch0002', k: 'p', p: pid, t: Date.now() + 1 });
    await page.evaluate(l => { window.__wuCmd(JSON.stringify({ cmd: 'pitchlog', log: l })); window.__wuCmd(JSON.stringify({ cmd: 'pitchlog', log: l })); }, watchLog);
    eq(await page.textContent('#ptCount'), '3');
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
