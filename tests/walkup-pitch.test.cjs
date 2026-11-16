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
  window.__sent = { state: [], pitch: [], tts: [], league: 0 };
  window.WalkupNative = {
    postState: j => window.__sent.state.push(JSON.parse(j)),
    postPitch: j => window.__sent.pitch.push(JSON.parse(j)),
    ttsSpeak: (id, text) => { window.__sent.tts.push(text); setTimeout(() => window.__wuTts && window.__wuTts(id, 'end'), 30); },
    ttsStop: () => {},
    openLeague: () => { window.__sent.league++; }
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

  await test('Page: pitching is off until turned on, then sits above the walk-up player, counts, undoes and turns red near the limit', async () => {
    const { page, errors, ctx } = await open(false);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    eq(await page.$('#ptCard'), null, 'no pitching card by default');
    await page.click('[data-act=pt-show]'); await page.waitForSelector('#ptCard');
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
    assert.ok(await page.$('.sheet-wrap.open [data-act=pt-league]'), 'the bullpen offers the official counts');
    await page.fill('#ptNew', 'Pitcher Two'); await page.click('.sheet-wrap.open [data-act=pt-newp]');
    await page.waitForFunction(() => /Pitcher Two/.test(document.querySelector('#ptCard .pt-who').textContent));
    eq(await page.textContent('#ptCount'), '0');
    // it stays after a reload
    await page.reload(); await page.waitForSelector('#ptCard');
    eq(await page.textContent('#ptCount'), '0');
    assert.ok(/Pitcher Two/.test(await page.textContent('#ptCard .pt-who')));
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await test('Bridge: game sounds go to the watch, and the watch plays one, fills Up next, skips to it and stops everything', async () => {
    const { page, errors, ctx } = await open(true);
    await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
    const last = () => page.evaluate(() => window.__sent.state[window.__sent.state.length - 1]);
    const cmd = c => page.evaluate(x => window.__wuCmd(JSON.stringify(x)), c);
    /* the page sends its state a moment after a change; wait for the one that says so */
    const until = (src, ms) => page.waitForFunction(new Function('const s = window.__sent.state[window.__sent.state.length - 1]; return !!s && (' + src + ');'), null, { timeout: ms || 5000 });
    const sent = () => page.waitForTimeout(250);
    await page.waitForFunction(() => window.__sent.state.some(s => s.board && s.board.length === 2));
    let st = await last();
    assert.deepStrictEqual(st.board, [{ id: 'innings', label: 'Between innings', ready: false }, { id: 'anthem', label: 'National anthem', ready: false }]);
    assert.deepStrictEqual(st.queue, []);
    await cmd({ cmd: 'queue', id: 'anthem' }); await sent(); eq((await last()).queue.length, 0, 'a button with no sound cannot wait in Up next');
    await cmd({ cmd: 'sound', id: 'anthem' }); await sent(); eq(await page.evaluate(() => !!window.WalkupApp.eng.playing()), false, 'nor play');
    // give both buttons a 3 s sound, made here (no files from anyone)
    await page.evaluate(async () => {
      const sr = 8000, n = sr * 3, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / sr)), true);
      const WU = window.WalkupApp.WU, r = await WU.songs.addFiles([new File([b], 'Tone.wav', { type: 'audio/wav' })]);
      await WU.board.assign(WU.board.tile('innings'), r.added[0].id);
      await WU.board.assign(WU.board.tile('anthem'), r.added[0].id);
    });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.board.every(t => t.ready); });
    // the watch plays the anthem: the watch is told what plays (a game sound, not a batter)
    await cmd({ cmd: 'sound', id: 'anthem' });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.playing && s.playing.board === 'anthem'; }, null, { timeout: 8000 });
    st = await last(); eq(st.playing.id, null); eq(st.playing.label, 'National anthem'); eq(st.playing.ext, 0);
    // a second play while one plays does nothing; Up next does
    await cmd({ cmd: 'sound', id: 'innings' }); await sent(); eq((await last()).playing.board, 'anthem');
    await cmd({ cmd: 'queue', id: 'innings' }); await until("s.queue.length === 1");
    assert.deepStrictEqual((await last()).queue, [{ id: 'innings', label: 'Between innings' }]);
    await cmd({ cmd: 'unqueue', id: 'innings' }); await until("s.queue.length === 0");
    await cmd({ cmd: 'queue', id: 'innings' }); await until("s.queue.length === 1");
    // skip to it: it plays now
    await cmd({ cmd: 'upnext' });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.playing && s.playing.board === 'innings' && s.queue.length === 0; }, null, { timeout: 8000 });
    // Stop ends everything
    await cmd({ cmd: 'queue', id: 'anthem' }); await until("s.queue.length === 1");
    await cmd({ cmd: 'stop', now: true });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return !s.playing && s.queue.length === 0; });
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
    eq(await page.evaluate(() => window.WalkupApp.eng.last.stopped.fade), 0.5, 'a plain stop fades out as before');
    // the watch's Stop button asks for a cut right away (no half-second fade)
    await page.evaluate(i => window.__wuCmd(JSON.stringify({ cmd: 'play', id: i })), id);
    await page.waitForFunction(() => !!window.WalkupApp.eng.playing());
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'stop', now: true })));
    await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    eq(await page.evaluate(() => window.WalkupApp.eng.last.stopped.fade), 0.05, 'the watch Stop cuts right away');
    // the watch can ask to keep playing; the sample lineup's built-in sounds can't, so the page says ext 0 and does nothing
    await page.evaluate(i => window.__wuCmd(JSON.stringify({ cmd: 'play', id: i })), id);
    await page.waitForFunction(() => window.__sent.state.some(s => s.playing && s.playing.id && s.playing.ext === 0 && s.playing.extended === false));
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'extend' })));
    eq(await page.evaluate(() => window.WalkupApp.eng.playing().extended), false);
    await page.evaluate(() => window.__wuCmd(JSON.stringify({ cmd: 'stop', now: true })));
    await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    // the bench goes to the watch, and the watch can swap a bench player into a batting spot
    await page.evaluate(() => { const S = window.WalkupApp.S; S.st.lineup = S.st.lineup.slice(0, 8); window.WU.commit('data'); });
    await page.waitForFunction(() => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.lineup.length === 8 && s.bench && s.bench.length === 1; });
    const st2 = await page.evaluate(() => window.__sent.state[window.__sent.state.length - 1]);
    const outId = st2.lineup[3].id, inId = st2.bench[0].id;
    await page.evaluate(([o, i]) => window.__wuCmd(JSON.stringify({ cmd: 'swap', out: o, in: i })), [outId, inId]);
    eq(await page.evaluate(() => window.WalkupApp.S.st.lineup[3]), inId, 'bench player takes the 4th spot');
    await page.waitForFunction(o => { const s = window.__sent.state[window.__sent.state.length - 1]; return s.bench.length === 1 && s.bench[0].id === o; }, outId);
    // a stale swap (that player isn't in the order any more) changes nothing
    const before = await page.evaluate(() => window.WalkupApp.S.st.lineup.join());
    await page.evaluate(([o, i]) => window.__wuCmd(JSON.stringify({ cmd: 'swap', out: o, in: i })), [outId, inId]);
    eq(await page.evaluate(() => window.WalkupApp.S.st.lineup.join()), before, 'stale swap ignored');
    // pitches merge in once, even with the pitching card hidden on the phone (the watch's Pitch Count app works alone)
    eq(await page.$('#ptCard'), null);
    await page.evaluate(() => window.WU.pitch.add());
    await page.waitForFunction(() => window.__sent.pitch.length > 0);
    const watchLog = await page.evaluate(() => JSON.parse(JSON.stringify(window.WU.pitch.log())));
    const pid = watchLog.events.filter(e => e.k === 'p')[0].p;
    watchLog.events.push({ i: 'ewatch0001', k: 'p', p: pid, t: Date.now() }, { i: 'ewatch0002', k: 'p', p: pid, t: Date.now() + 1 });
    await page.evaluate(l => { window.__wuCmd(JSON.stringify({ cmd: 'pitchlog', log: l })); window.__wuCmd(JSON.stringify({ cmd: 'pitchlog', log: l })); }, watchLog);
    eq(await page.evaluate(() => window.WU.pitch.row(window.WU.pitch.cur().id).count), 3);
    // "Official counts" opens the MAC League's site in Dugout's own screen
    await page.evaluate(() => window.WU.act['pt-league']());
    eq(await page.evaluate(() => window.__sent.league), 1);
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
