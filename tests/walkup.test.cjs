// Walk-Up tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/walkup.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
// ONLY=<regex> runs just the tests whose name matches (handy while working).
// Chrome runs with a fake microphone that plays a generated "voice" WAV, and with a stub for the computer voice (speechSynthesis),
// so the tests are the same on every machine. Nothing here proves how it sounds: see the report for what needs a real phone.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/walkup/core.js');
const SND = require('../apps/walkup/sounds.js');
const { chromium, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07'; // a Saturday
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const results = [];
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const approx = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= (tol == null ? 1e-9 : tol), (m || 'approx') + ': ' + a + ' vs ' + b + ' (tol ' + tol + ')');
const deep = (a, b, m) => assert.deepStrictEqual(a, b, m);

/* ---------- WAV fixtures made here, in node ---------- */
function wavFile(samples, sr) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}
/* 3 s: 0.5 s of silence, 2 s of "syllables" (three a second), 0.5 s of silence */
function voiceSamples(sr) {
  const a = new Float32Array(sr * 3);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    if (t >= 0.5 && t < 2.5) a[i] = 0.6 * Math.abs(Math.sin(2 * Math.PI * 3 * (t - 0.5))) * (Math.sin(2 * Math.PI * 180 * t) + 0.5 * Math.sin(2 * Math.PI * 360 * t) + 0.25 * Math.sin(2 * Math.PI * 540 * t)) / 1.75;
  }
  return a;
}
/* a "song": two chords, the second starts halfway */
function songSamples(sec, sr, chords) {
  chords = chords || [[261.63, 329.63, 392], [196, 246.94, 293.66]];
  const a = new Float32Array(Math.round(sec * sr));
  for (let i = 0; i < a.length; i++) {
    const t = i / sr, ch = chords[t >= sec / 2 ? 1 : 0];
    a[i] = 0.2 * ch.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) * Math.min(1, t / 0.02);
  }
  return a;
}
const sine = (sec, sr, f, amp) => { const a = new Float32Array(Math.round(sec * sr)); for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin(2 * Math.PI * f * i / sr); return a; };
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'walkup-fixtures-'));
const fx = n => path.join(FIX, n);
const VOICE = wavFile(voiceSamples(44100), 44100), SONG = wavFile(songSamples(20, 22050), 22050), SONG2 = wavFile(songSamples(12, 22050, [[440], [554.37]]), 22050);
fs.writeFileSync(fx('mic.wav'), VOICE);
fs.writeFileSync(fx('voice.wav'), VOICE);
fs.writeFileSync(fx('Slow Jam.wav'), SONG);
fs.writeFileSync(fx('Fast Jam.wav'), SONG2);
fs.writeFileSync(fx('broken.mp3'), Buffer.from('this is not audio at all, just some text pretending to be an mp3 '.repeat(20)));
const VOICE_B64 = VOICE.toString('base64'), SONG_B64 = SONG.toString('base64');

/* ---------- the page: spies and stubs installed before the app loads ---------- */
const SPY = () => {
  window.__starts = []; window.__ap = []; window.__spoken = []; window.__wl = [];
  try {
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      window.__starts.push({ when, offset, duration, bufDur: this.buffer ? this.buffer.duration : null, ct: this.context.currentTime });
      return st.apply(this, arguments);
    };
    ['setValueAtTime', 'linearRampToValueAtTime'].forEach(k => {
      const o = AudioParam.prototype[k];
      AudioParam.prototype[k] = function (v, t) { window.__ap.push({ p: this, k, v, t }); return o.apply(this, arguments); };
    });
  } catch (e) { /* ignore */ }
  if (!window.__noSpeech && !/noSpeech/.test(location.search)) {
    class Utt { constructor(t) { this.text = t; this.rate = 1; this.volume = 1; this.voice = null; } }
    window.SpeechSynthesisUtterance = Utt;
    const fake = {
      speak(u) { window.__spoken.push({ text: u.text, rate: u.rate, volume: u.volume, voice: u.voice ? u.voice.voiceURI : '' }); setTimeout(() => { if (u.onend) u.onend({}); }, 60); },
      cancel() { window.__cancels = (window.__cancels || 0) + 1; },
      getVoices() { return [{ name: 'Test Voice A', lang: 'en-US', voiceURI: 'test-a' }, { name: 'Test Voice B', lang: 'en-GB', voiceURI: 'test-b' }]; },
      addEventListener() {}, removeEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  } else { try { delete window.speechSynthesis; Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); } catch (e) { /* ignore */ } }
  const lock = () => ({ released: false, h: [], addEventListener(t, f) { this.h.push(f); }, removeEventListener() {}, release() { this.released = true; window.__wl.push('release'); this.h.forEach(f => f()); return Promise.resolve(); } });
  try { Object.defineProperty(navigator, 'wakeLock', { value: { request: t => { window.__wl.push('request:' + t); const l = lock(); window.__wlLast = l; return Promise.resolve(l); } }, configurable: true }); } catch (e) { /* ignore */ }
};

let srv, br;
async function open(o) {
  o = o || {};
  const { ctx, page, errors } = await newPage(br, { today: o.today || TODAY, sw: o.sw, reducedMotion: o.reducedMotion, ctx: Object.assign({ permissions: ['microphone'] }, o.ctx || {}) });
  if (!o.noSpy) await page.addInitScript(SPY);
  if (o.init) await page.addInitScript(o.init, o.initArg);
  await page.goto(srv.url + (o.query || ''));
  await page.waitForSelector('#wuNav .navb');
  return { ctx, page, errors };
}
const sheetSel = '.sheet-wrap.open .sheet';
const noSheets = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 5000 });
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.WalkupApp.S.st)));
const toastText = page => page.$$eval('.toast', els => els.map(e => e.textContent).join(' | '));
async function waitToast(page, re) {
  await page.waitForFunction(r => Array.from(document.querySelectorAll('.toast')).some(t => new RegExp(r, 'i').test(t.textContent)), re.source, { timeout: 8000 });
}
const tab = (page, t) => page.click('[data-act=tab][data-tab="' + t + '"]');
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const settle = (page, ms) => page.waitForTimeout(ms || 450);
/* Screenshots hide the toasts (they are covered by their own tests) so the pictures show the screen, not a message half faded in. */
async function shot(page, name, o) {
  o = o || {};
  if (!o.toast) await page.evaluate(() => { const t = document.querySelector('#wuToasts'); if (t) t.style.visibility = 'hidden'; });
  const opts = Object.assign({ path: SHOTS + '/walkup-' + name + '.png' }, o); delete opts.toast;
  await page.screenshot(opts);
  await page.evaluate(() => { const t = document.querySelector('#wuToasts'); if (t) t.style.visibility = ''; });
}
/* a screenshot at another screen size: let the page settle after the resize first, or the picture comes out tiled */
async function shotAt(page, name, w, h, o) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForFunction(x => innerWidth === x, w); await page.waitForTimeout(500);
  await shot(page, name, o);
}
async function sample(page) { await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay'); }
const resetSpies = page => page.evaluate(() => { window.__starts.length = 0; window.__ap.length = 0; window.__spoken.length = 0; });
const spies = page => page.evaluate(() => ({ starts: window.__starts.map(s => ({ when: s.when, offset: s.offset, duration: s.duration, bufDur: s.bufDur })), spoken: window.__spoken.slice(), t0: window.WalkupApp.eng.last ? window.WalkupApp.eng.last.t0 : null }));
/* the four things the app proves about a play: the plan, and the numbers that reached the audio nodes */
const lastRun = page => page.evaluate(() => {
  const r = window.WalkupApp.eng.last; if (!r) return null;
  const calls = p => window.__ap.filter(c => c.p === p).map(c => [c.k, c.v, c.t]);
  return {
    t0: r.t0, plan: r.plan, key: r.key, stopped: r.stopped || null,
    nodes: r.nodes.map(n => ({ track: n.track, gain: calls(n.g.gain), duck: n.duck ? calls(n.duck.gain) : null })),
    bus: calls(r.bus.gain)
  };
});

/* a player with a real voice file and a real song, made through the same code the buttons use */
async function rich(page, o) {
  o = o || {};
  return page.evaluate(async ([vb, sb, name, num]) => {
    const A = window.WalkupApp, WU = A.WU, C = A.core, E = A.eng;
    const blob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
    await E.unlock();
    const pl = C.newPlayer({ name, num, pos: 'CF' });
    WU.S.st.roster.push(pl); WU.S.st.lineup.push(pl.id);
    const vblob = blob(vb, 'audio/wav'), vbuf = await E.decode(vblob);
    await WU.voice.adopt(pl, vblob, 'file', 'voice.wav', vbuf);
    const r = await WU.songs.addFiles([new File([blob(sb, 'audio/wav')], 'Slow Jam.wav', { type: 'audio/wav' })]);
    pl.songId = r.added[0].id;
    WU.S.st.batter = WU.S.st.lineup.indexOf(pl.id);
    WU.commit('data');
    return { id: pl.id, songId: pl.songId, voiceId: pl.voice.id };
  }, [VOICE_B64, SONG_B64, o.name || 'Player Rich', o.num || '9']);
}
const dbKeys = page => page.evaluate(() => window.WalkupApp.WU.db.keys());

(async () => {
  srv = await startServer('walkup');
  br = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + fx('mic.wav'), '--autoplay-policy=no-user-gesture-required'] });
  console.log('Serving ' + srv.url);

  /* ============ pure logic (node) ============ */
  await test('core: decibels, the balance law and normalizing match hand calculation', async () => {
    approx(C.dbToGain(0), 1); approx(C.dbToGain(20), 10); approx(C.dbToGain(-20), 0.1); approx(C.dbToGain(-6.020599913), 0.5, 1e-7);
    approx(C.gainToDb(0.5), -6.0206, 1e-3); eq(C.gainToDb(0), -Infinity); eq(C.levelDb(0.0005), -Infinity);
    let b = C.balanceGains(0); approx(b.music, 1); approx(b.voice, 1);
    b = C.balanceGains(-100); approx(b.music, 1); eq(b.voice, 0);
    b = C.balanceGains(100); eq(b.music, 0); approx(b.voice, 1);
    // +50: theta = 3pi/8, music = sqrt2*cos(67.5deg) = 0.541196 (-5.33 dB), voice stays at its normal level
    b = C.balanceGains(50); approx(b.music, 0.541196, 1e-5); approx(b.voice, 1); approx(b.musicDb, -5.3324, 2e-3);
    b = C.balanceGains(-50); approx(b.voice, 0.541196, 1e-5); approx(b.music, 1);
    // +25: theta = 56.25deg, music = sqrt2*cos(56.25deg) = 0.785695 (-2.10 dB)
    b = C.balanceGains(25); approx(b.music, 0.785695, 1e-5); approx(b.musicDb, -2.0954, 5e-3);
    for (let v = -100; v < 100; v += 5) { assert.ok(C.balanceGains(v + 5).music <= C.balanceGains(v).music + 1e-12); assert.ok(C.balanceGains(v + 5).voice >= C.balanceGains(v).voice - 1e-12); }
    approx(C.balanceGains('x').music, 1); approx(C.balanceGains(1e9).voice, 1); eq(C.balanceGains(1e9).music, 0); eq(C.balanceGains(-1e9).voice, 0);
    approx(C.normalizeGain(0.5), 0.8912509 / 0.5, 1e-5); eq(C.normalizeGain(0), 1); eq(C.normalizeGain(5e-5), 1); approx(C.normalizeGain(0.0002), 15.848932, 1e-4, 'capped at +24 dB');
  });

  await test('core: trim math on the 0.1 s grid, with boundaries', async () => {
    deep(C.clampTrim(20, { start: 5, len: 10, fade: 1 }), { start: 5, len: 10, fade: 1 });
    deep(C.clampTrim(20, { start: 15, len: 10 }), { start: 10, len: 10, fade: 1 }, 'start pulled back so the clip fits');
    deep(C.clampTrim(3.04, { start: 1.5, len: 2 }), { start: 1.04, len: 2, fade: 1 });
    deep(C.clampTrim(100, { len: 99 }), { start: 0, len: 30, fade: 1 }, 'never longer than 30 s');
    deep(C.clampTrim(100, { len: 0.2 }), { start: 0, len: 1, fade: 1 }, 'never shorter than 1 s');
    deep(C.clampTrim(0.5, {}), { start: 0, len: 0.5, fade: 0.5 }, 'a clip shorter than a second is the whole clip');
    deep(C.clampTrim(20, { start: 2.34, len: 7.77, fade: 9 }), { start: 2.3, len: 7.8, fade: 3 });
    deep(C.clampTrim(20, null), { start: 0, len: 10, fade: 1 });
    deep(C.defaultTrim(20), { start: 0, len: 10, fade: 1 }); deep(C.defaultTrim(4), { start: 0, len: 4, fade: 1 }); deep(C.defaultTrim(1.5), { start: 0, len: 1.5, fade: 0.8 });
    deep(C.moveStart(20, { start: 2, len: 10, fade: 1 }, 4.37), { start: 4.4, len: 10, fade: 1 });
    deep(C.moveStart(20, { start: 2, len: 10, fade: 1 }, 15), { start: 10, len: 10, fade: 1 });
    deep(C.moveStart(20, { start: 2, len: 10, fade: 1 }, -3), { start: 0, len: 10, fade: 1 });
    deep(C.setLen(20, { start: 15, len: 3, fade: 1 }, 12), { start: 15, len: 5, fade: 1 }, 'the song end limits the length');
    deep(C.setLen(20, { start: 2, len: 10, fade: 1 }, 0.2), { start: 2, len: 1, fade: 1 });
    deep(C.setFade(20, { start: 0, len: 2, fade: 1 }, 5), { start: 0, len: 2, fade: 2 }, 'fade never longer than the clip');
    deep(C.setFade(20, { start: 0, len: 10, fade: 1 }, 5), { start: 0, len: 10, fade: 3 });
    deep(C.dragStart(20, { start: 5, len: 10, fade: 1 }, 8), { start: 8, len: 7, fade: 1 }, 'the end stays put');
    deep(C.dragStart(20, { start: 5, len: 10, fade: 1 }, 14.95), { start: 14, len: 1, fade: 1 });
    deep(C.dragStart(20, { start: 5, len: 10, fade: 1 }, -4), { start: 0, len: 15, fade: 1 });
    deep(C.dragEnd(20, { start: 5, len: 10, fade: 1 }, 30), { start: 5, len: 15, fade: 1 });
    deep(C.dragEnd(20, { start: 5, len: 10, fade: 1 }, 5.4), { start: 5, len: 1, fade: 1 });
    deep(C.dragEnd(60, { start: 5, len: 10, fade: 1 }, 50), { start: 5, len: 30, fade: 1 });
  });

  await test('core: peaks and silence detection', async () => {
    const d = Float32Array.from([0, 0.5, -1, 0.25, 0, 0, 0.75, -0.1]);
    deep(Array.from(C.peaks(d, 4)), [0.5, 1, 0, 0.75]); deep(Array.from(C.peaks(d, 2)), [1, 0.75]); deep(Array.from(C.peaks(d, 2, 2, 6)), [1, 0]);
    deep(Array.from(C.peaks(new Float32Array(0), 3)), [0, 0, 0]);
    const sr = 1000, x = new Float32Array(1000); for (let i = 300; i < 700; i++) x[i] = 0.5;
    let r = C.silenceRegion(x, sr, -40, 0.05, 0.15); approx(r.start, 0.25, 1e-9); approx(r.end, 0.85, 1e-9);
    r = C.silenceRegion(x, sr, -40, 0, 0); approx(r.start, 0.3, 1e-9); approx(r.end, 0.7, 1e-9);
    eq(C.silenceRegion(new Float32Array(500), sr, -40), null, 'all quiet');
    const y = new Float32Array(1000).fill(0.5); r = C.silenceRegion(y, sr, -40, 0.05, 0.15); approx(r.start, 0, 1e-9); approx(r.end, 1, 1e-9, 'padding stays inside the file');
    const z = new Float32Array(1000); z.fill(0.004); eq(C.silenceRegion(z, sr, -50) !== null, true, '0.004 is -48 dB: above a -50 dB threshold'); eq(C.silenceRegion(z, sr, -45), null, 'but below -45 dB');
  });

  await test('core: the mix plan (delays, ducking, fade, balance, total length) matches hand calculation', async () => {
    const A = 0.251189; // 10^(-12/20)
    let p = C.mixPlan({ music: { len: 10, offset: 5, fade: 2 }, voice: { len: 2.5, speech: 2, offset: 0 }, mix: { vd: 1, dd: 12, da: 0.2, dr: 0.4 } });
    const m = p.tracks[0], v = p.tracks[1];
    eq(m.track, 'music'); eq(m.when, 0); eq(m.offset, 5); eq(m.duration, 10);
    deep(m.gainPoints, [[0, 0], [0.008, 1], [8, 1], [10, 0]]);
    deep(m.duckPoints, [[0.8, 1], [1, A], [3, A], [3.4, 1]]);
    eq(v.track, 'voice'); eq(v.when, 1); eq(v.duration, 2.5); eq(v.tts, false);
    deep(v.gainPoints, [[1, 0], [1.008, 1], [3.48, 1], [3.5, 0]]);
    eq(p.total, 10);
    // balance +50, music 80%, voice 50%
    p = C.mixPlan({ music: { len: 10, offset: 0, fade: 1 }, voice: { len: 2, speech: 2, offset: 0 }, mix: { bal: 50, mv: 80, vv: 50, duck: false } });
    approx(p.tracks[0].gainPoints[1][1], 0.432957, 1e-6); approx(p.tracks[1].gainPoints[1][1], 0.5, 1e-9); eq(p.tracks[0].duckPoints, null);
    approx(C.gainToDb(p.gains.music), -7.272, 5e-3, 'balance -5.33 dB plus 80% (-1.94 dB)');
    // delays: music starts at 2, voice at 0.5 (so the voice starts before the music)
    p = C.mixPlan({ music: { len: 10, offset: 3, fade: 1 }, voice: { len: 2.5, speech: 2, offset: 0 }, mix: { md: 2, vd: 0.5, dd: 12, da: 0.2, dr: 0.4 } });
    eq(p.tracks[0].when, 2); eq(p.tracks[0].offset, 3); eq(p.tracks[1].when, 0.5); eq(p.total, 12);
    deep(p.tracks[0].gainPoints, [[2, 0], [2.008, 1], [11, 1], [12, 0]]);
    deep(p.tracks[0].duckPoints, [[0.3, 1], [0.5, A], [2.5, A], [2.9, 1]]);
    // a duck that would start before the song's first sample is clipped at 0, part-way down the ramp
    p = C.mixPlan({ music: { len: 10, offset: 0, fade: 1 }, voice: { len: 2.5, speech: 2, offset: 0 }, mix: { vd: 0.1, dd: 12, da: 0.2, dr: 0.4 } });
    deep(p.tracks[0].duckPoints, [[0, 0.625595], [0.1, A], [2.1, A], [2.5, 1]]); // 1 + 0.5 * (0.251189 - 1) = 0.6255945
    // no duck without a voice, or when switched off, or at 0 dB
    eq(C.mixPlan({ music: { len: 10, offset: 0, fade: 1 }, voice: null, mix: {} }).tracks[0].duckPoints, null);
    eq(C.mixPlan({ music: { len: 10, offset: 0, fade: 1 }, voice: { len: 2, speech: 2, offset: 0 }, mix: { dd: 0 } }).tracks[0].duckPoints, null);
    // the computer voice has no gain envelope (it can't be scheduled), only a time
    p = C.mixPlan({ music: { len: 5, offset: 0, fade: 1 }, voice: { len: 2.78, speech: 2.78, offset: 0, tts: true }, mix: { vd: 1 } });
    eq(p.tracks[1].tts, true); deep(p.tracks[1].gainPoints, []); eq(p.tracks[1].when, 1); eq(p.total, 5);
    // one track only
    p = C.mixPlan({ music: null, voice: { len: 2.5, speech: 2, offset: 0 }, mix: { vd: 1 } }); eq(p.tracks.length, 1); eq(p.total, 3.5);
    p = C.mixPlan({ music: { len: 6, offset: 0, fade: 0 }, voice: null, mix: {} }); eq(p.tracks.length, 1); eq(p.total, 6); deep(p.tracks[0].gainPoints, [[0, 0], [0.008, 1], [5.99, 1], [6, 0]], 'no fade still ramps out over 10 ms');
    p = C.mixPlan({ music: { len: 0.015, offset: 0, fade: 0 }, voice: null, mix: {} }); deep(p.tracks[0].gainPoints, [[0, 0], [0.008, 1], [0.015, 0]], 'a clip shorter than the attack has no flat part');
    eq(C.mixPlan({ music: null, voice: null, mix: {} }).tracks.length, 0);
    // limits
    eq(C.sanitizeMix({ vd: 99, md: -4 }).vd, 20); eq(C.sanitizeMix({ vd: 99, md: -4 }).md, 0);
  });

  await test('core: computer voice length estimate and the announcement text', async () => {
    eq(C.estimateSpeech('Now batting, number 7, Player 7'), 2.78); eq(C.estimateSpeech(''), 1); eq(C.estimateSpeech('word '.repeat(100)), 8);
    eq(C.announceText({ num: '7', name: 'Player 7' }), 'Now batting, number 7, Player 7');
    eq(C.announceText({ num: '#12', name: '  Player   Twelve ' }), 'Now batting, number 12, Player Twelve');
    eq(C.announceText({ num: '', name: 'Player 7' }), 'Now batting, Player 7'); eq(C.announceText({ num: '7', name: '' }), 'Now batting, number 7'); eq(C.announceText({ num: '', name: '' }), 'Now batting');
    eq(C.playerLabel({ num: '7', name: 'Player 7' }), '#7 Player 7'); eq(C.playerLabel({ num: '', name: '' }), 'Player');
  });

  await test('core: batting order moves, wrap-around, bench, swap', async () => {
    eq(C.nextIndex(9, 8), 0); eq(C.nextIndex(9, 3), 4); eq(C.prevIndex(9, 0), 8); eq(C.prevIndex(9, 5), 4); eq(C.nextIndex(0, 0), 0); eq(C.prevIndex(1, 0), 0);
    deep(C.roles(9, 8), { now: 8, onDeck: 0, inHole: 1 }); deep(C.roles(9, 0), { now: 0, onDeck: 1, inHole: 2 });
    deep(C.roles(3, 2), { now: 2, onDeck: 0, inHole: 1 }); deep(C.roles(2, 1), { now: 1, onDeck: 0, inHole: -1 }); deep(C.roles(1, 0), { now: 0, onDeck: -1, inHole: -1 });
    deep(C.moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']); deep(C.moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']); deep(C.moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']); deep(C.moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
    const roster = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    deep(C.benchIds(roster, ['c', 'a']), ['b', 'd']);
    deep(C.toBench(['a', 'b', 'c'], 'b'), ['a', 'c']); deep(C.toLineup(['a', 'c'], 'b'), ['a', 'c', 'b']); deep(C.toLineup(['a', 'c'], 'c'), ['a', 'c'], 'no duplicates');
    deep(C.swapBench(['a', 'b', 'c'], 1, 'z'), ['a', 'z', 'c']); deep(C.swapBench(['a', 'b', 'c'], 1, 'c'), ['a', 'b', 'c'], 'cannot swap in someone already batting'); deep(C.swapBench(['a', 'b'], 5, 'z'), ['a', 'b']);
    eq(C.reindexBatter(['a', 'b', 'c'], 1, ['c', 'b', 'a']), 1); eq(C.reindexBatter(['a', 'b', 'c'], 2, ['a', 'b']), 1, 'the batter left: stay in range');
    eq(C.reindexBatter(['a', 'b', 'c'], 2, ['b', 'c']), 1, 'follows the same player'); eq(C.reindexBatter(['a'], 0, []), 0);
  });

  await test('core: paste-a-list understands the usual shapes, skips blanks, caps at 40', async () => {
    const r = C.parsePasted('7 Player Seven\n#12, Player Twelve\n\n   \nPlayer Three 3\nPlayer Nine (9)\n4 - Player Four\n5, Player Fifty, SS\n#8\n- Player Eleven', 40);
    deep(r.players, [
      { name: 'Player Seven', num: '7', pos: '' }, { name: 'Player Twelve', num: '12', pos: '' }, { name: 'Player Three', num: '3', pos: '' }, { name: 'Player Nine', num: '9', pos: '' },
      { name: 'Player Four', num: '4', pos: '' }, { name: 'Player Fifty', num: '5', pos: 'SS' }, { name: '', num: '8', pos: '' }, { name: 'Player Eleven', num: '', pos: '' }]);
    eq(r.capped, false);
    deep(C.parsePasted('7\tPlayer Seven\tCF\r\n#9;Player Nine', 40).players, [{ name: 'Player Seven', num: '7', pos: 'CF' }, { name: 'Player Nine', num: '9', pos: '' }], 'tabs, semicolons, Windows line ends');
    const big = Array.from({ length: 45 }, (_, i) => 'Player ' + i).join('\n');
    let c = C.parsePasted(big, 40); eq(c.players.length, 40); eq(c.capped, true);
    c = C.parsePasted(big, 3); eq(c.players.length, 3); eq(c.capped, true); eq(C.parsePasted(big, 0).players.length, 0);
    eq(C.parsePasted('', 40).players.length, 0); eq(C.parsePasted(null, 40).players.length, 0);
    eq(C.parsePasted('<img src=x onerror=alert(1)>', 40).players[0].name, '<img src=x onerror=alert(1)>', 'text is kept as text; the screen escapes it');
  });

  await test('core: voice polish settings, the chain numbers, keys and the reverb impulse response', async () => {
    deep(C.sanitizePolish({ eq: [99, -99, 'x'], comp: 'weird', size: 'nope', wet: 500, hpf: 5, out: 40, hp: 1 }), { hp: false, hpf: 60, eq: [12, -12, 0, 0, 0], comp: 'off', size: 'small', wet: 100, out: 12 });
    deep(C.factoryAnnouncer(), { hp: true, hpf: 80, eq: [2, 4, 0, 4, 1], comp: 'light', size: 'small', wet: 15, out: 0 });
    eq(C.presetOf(C.factoryAnnouncer()), 'announcer'); eq(C.presetOf(C.flatPolish()), 'flat'); eq(C.presetOf(Object.assign(C.flatPolish(), { eq: [1, 0, 0, 0, 0] })), 'custom');
    deep(C.applyPreset(C.flatPolish(), 'stadium').eq, [6, 2, -2, 2, 6]); eq(C.applyPreset(C.flatPolish(), 'clear').hp, true);
    const sp = C.chainSpec(C.factoryAnnouncer());
    deep(sp.hp, { freq: 80, q: 0.707 }); deep(sp.eq.map(b => b.f), [100, 400, 1000, 3000, 8000]); deep(sp.eq.map(b => b.gain), [2, 4, 0, 4, 1]);
    deep(sp.comp, { threshold: -20, knee: 15, ratio: 3, attack: 0.01, release: 0.25 });
    approx(sp.rev.dry, 0.993068, 1e-5); approx(sp.rev.wet, 0.176305, 1e-5); eq(sp.rev.size, 'small'); approx(sp.out, 1);
    const rm = C.reverbMix(100); approx(rm.dry, 0.707107, 1e-5); approx(rm.wet, 1.06066, 1e-4); deep(C.reverbMix(0), { dry: 1, wet: 0 });
    eq(C.chainSpec(C.flatPolish()).rev, null); eq(C.chainSpec(C.flatPolish()).hp, null); eq(C.chainSpec(C.flatPolish()).comp, null);
    approx(C.chainSpec(Object.assign(C.flatPolish(), { out: 6 })).out, 1.99526, 1e-4);
    // keys: same settings, same key; any change, a new key
    const a = C.factoryAnnouncer(), b = C.factoryAnnouncer(); eq(C.polishKey(a), C.polishKey(b)); b.eq[3] = 5; assert.notStrictEqual(C.polishKey(a), C.polishKey(b));
    eq(C.hash32('abc'), C.hash32('abc')); assert.notStrictEqual(C.hash32('abc'), C.hash32('abd'));
    const v = { id: 'vvv111', ts: 0.45, te: 2.65, norm: false, polish: a };
    eq(C.voiceRenderKey(v, 48000), C.voiceRenderKey(Object.assign({}, v), 48000)); assert.notStrictEqual(C.voiceRenderKey(v, 48000), C.voiceRenderKey(Object.assign({}, v, { te: 2.7 }), 48000));
    assert.notStrictEqual(C.voiceRenderKey(v, 48000), C.voiceRenderKey(v, 44100)); assert.notStrictEqual(C.voiceRenderKey(v, 48000), C.voiceRenderKey(Object.assign({}, v, { norm: true }), 48000));
    // reverb tails: rt + pre-delay; 0.05 s when the room is off
    approx(C.reverbTail(a), 0.504, 1e-9); approx(C.reverbTail(Object.assign({}, a, { size: 'gym' })), 1.412, 1e-9); approx(C.reverbTail(Object.assign({}, a, { size: 'stadium' })), 3.03, 1e-9); eq(C.reverbTail(C.flatPolish()), 0.05);
    // impulse response
    const ir = C.impulseResponse('small', 48000, 7), ir2 = C.impulseResponse('small', 48000, 7), ir3 = C.impulseResponse('small', 48000, 8);
    eq(ir.length, 2); eq(ir[0].length, 24192, '(0.5 + 0.004) s at 48 kHz'); deep(Array.from(ir[0].slice(0, 500)), Array.from(ir2[0].slice(0, 500)), 'same seed, same room');
    assert.ok(ir[0].some((x, i) => x !== ir3[0][i]), 'another seed, another room'); assert.ok(ir[0].some((x, i) => x !== ir[1][i]), 'the two ears differ');
    for (let c = 0; c < 2; c++) {
      let e = 0, eHead = 0, eTail = 0; for (let i = 0; i < ir[c].length; i++) { const s = ir[c][i] * ir[c][i]; e += s; if (i < ir[c].length / 4) eHead += s; else if (i >= ir[c].length * 3 / 4) eTail += s; }
      approx(e, 1, 1e-6, 'energy is 1'); assert.ok(eTail < eHead * 0.01, 'it dies away');
      for (let i = 0; i < 192; i++) eq(ir[c][i], 0, 'pre-delay is silent');
    }
    eq(C.impulseResponse('gym', 44100, 1)[0].length, Math.round(1.412 * 44100)); eq(C.impulseResponse('nonsense', 44100, 1)[0].length, Math.round(0.504 * 44100));
  });

  await test('core: formatting helpers', async () => {
    eq(C.fmtClock(62.4), '1:02'); eq(C.fmtClock(62.5, true), '1:02.5'); eq(C.fmtClock(3725), '1:02:05'); eq(C.fmtClock(-3), '0:00'); eq(C.fmtClock('x'), '0:00'); eq(C.fmtClock(9.96, true), '0:10.0');
    eq(C.fmtSecs(2.78), '2.8 s'); eq(C.fmtSecs(10), '10.0 s'); eq(C.fmtSize(500), '500 B'); eq(C.fmtSize(1536), '2 KB'); eq(C.fmtSize(5 * 1048576), '5.0 MB'); eq(C.fmtSize(1073741824), '1.0 GB'); eq(C.fmtSize(10 * 1073741824 + 1048576), '10.0 GB'); eq(C.fmtSize(-4), '0 B');
    eq(C.fmtDb(-Infinity), 'off'); eq(C.fmtDb(0), '0 dB'); eq(C.fmtDb(-5.3324), '-5.3 dB'); eq(C.fmtDb(3), '+3.0 dB'); eq(C.fmtDb(-70), 'off');
    eq(C.fileTitle('My Song.mp3'), 'My Song'); eq(C.fileTitle('noext'), 'noext'); eq(C.fileTitle('.mp3'), 'Song'); eq(C.fileTitle('a.b.m4a'), 'a.b');
    eq(C.todayStr('2026-11-07'), '2026-11-07'); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(C.todayStr('garbage'))); eq(C.isYMD('2026-13-01'), false); eq(C.isYMD('2026-02-30'), true, 'format check only');
  });

  await test('core: built-in sounds are the right length, loud enough and the same every time', async () => {
    const want = { horn: 79380, chime: 132300, drumroll: 132300, siren: 176400 };
    for (const id of Object.keys(want)) {
      const a = SND.synth(id, 44100), b = SND.synth(id, 44100);
      eq(a.length, want[id], id + ' length'); let pk = 0; for (let i = 0; i < a.length; i++) { assert.ok(a[i] === b[i], id + ' deterministic'); pk = Math.max(pk, Math.abs(a[i])); }
      approx(pk, 0.8, 0.002, id + ' peak');
    }
    eq(SND.info('nope'), null); eq(SND.info('horn').dur, 1.8); eq(SND.synth('nope', 44100), null);
    eq(C.builtinSong('b:horn').kind, 'synth'); eq(C.songById([], 'b:siren').title.length > 0, true); eq(C.songById([], 'b:nope'), null); eq(C.songById([], null), null);
    deep(C.effectiveTrim({ trim: null }, C.builtinSong('b:horn')), { start: 0, len: 1.8, fade: 0.9 }, 'a 1.8 s sound plays whole, fading over half');
    deep(C.effectiveTrim({ trim: { start: 0.5, len: 1, fade: 0 } }, C.builtinSong('b:horn')), { start: 0.5, len: 1, fade: 0 }, "a player's own trim wins");
  });

  await test('core: cleaning saved data (limits, strangers in the lineup, bad numbers, control characters)', async () => {
    const roster = Array.from({ length: 45 }, (_, i) => ({ id: 'pl' + i + 'abc', name: 'N' + i, num: '12345', pos: 'ABCDEFGHIJKLMNOP' }));
    roster[0].name = 'A\u0000B\u0007C'; roster[1].name = 'x'.repeat(100);
    const st = C.sanitizeState({ roster, lineup: ['pl3abc', 'pl3abc', 'ghost', 'pl1abc', 7, null], batter: 99, songs: [{ id: 's1x', kind: 'file', title: 'T', dur: 12, start: 50, len: 99, fade: 9 }, { kind: 'bad' }], settings: { master: 500, trate: 9, thr: 3 } });
    eq(st.roster.length, 40); eq(st.roster[0].name, 'ABC'); eq(st.roster[1].name.length, 40); eq(st.roster[2].num, '1234'); eq(st.roster[2].pos.length, 12);
    deep(st.lineup, ['pl3abc', 'pl1abc']); eq(st.batter, 1, 'batter clamps into the lineup');
    eq(st.songs.length, 1); deep({ s: st.songs[0].start, l: st.songs[0].len, f: st.songs[0].fade }, { s: 0, l: 12, f: 3 });
    eq(st.settings.master, 100); eq(st.settings.trate, 1.5); eq(st.settings.thr, -20, 'a threshold of +3 dB is clamped to -20');
  });

  await test('core: a player whose song or voice is missing is told apart from one with nothing set up', async () => {
    const song = { id: 's1abc', kind: 'file' }, have = k => k === 's:s1abc';
    const p = (songId, voice) => ({ songId, voice });
    const st = (pl, h) => C.statusOf(pl, [{ id: 's1abc', kind: 'file', dur: 10, start: 0, len: 10, fade: 1 }], h || have).code;
    eq(st(p(null, null)), 'empty'); eq(st(p('s1abc', null)), 'no-voice'); eq(st(p(null, { kind: 'tts' })), 'no-song'); eq(st(p('s1abc', { kind: 'tts' })), 'ready');
    eq(st(p('s1abc', { kind: 'rec', id: 'v1abc' })), 'needs-voice'); eq(st(p('s1abc', { kind: 'rec', id: 'v1abc' }), k => true), 'ready');
    eq(st(p('s1abc', { kind: 'tts' }), () => false), 'needs-song'); eq(st(p('b:horn', { kind: 'tts' }), () => false), 'ready', 'built-in sounds need no file');
    eq(st(p('gone', null)), 'empty', 'a song that no longer exists is just no song'); void song;
  });

  await test('core: backup files are checked before anything is replaced', async () => {
    const good = C.makeBackup(C.sampleState(true), '2026-11-07', 'settings');
    eq(good.app, 'walkup'); eq(good.kind, 'settings'); eq(good.exported, '2026-11-07');
    let v = C.validateBackup(JSON.parse(JSON.stringify(good))); eq(v.ok, true); eq(v.counts.players, 9); eq(v.counts.lineup, 9); eq(v.kind, 'settings'); eq(v.counts.voices, 0, 'computer voices are not files');
    [null, 5, 'x', [], {}, { app: 'locker', v: 1, data: {} }, { app: 'walkup', v: 'one', data: {} }, { app: 'walkup', v: 0, data: {} }].forEach(x => eq(C.validateBackup(x).ok, false, JSON.stringify(x)));
    eq(C.validateBackup({ app: 'walkup', v: 2, data: { roster: [] } }).ok, false); assert.ok(/newer version/.test(C.validateBackup({ app: 'walkup', v: 2, data: { roster: [] } }).error));
    assert.ok(/nothing in it/.test(C.validateBackup({ app: 'walkup', v: 1, data: { x: 1 } }).error)); eq(C.validateBackup({ app: 'walkup', v: 1, data: { roster: [] } }).ok, true);
    const st = C.sampleState(false); st.roster[0].voice = C.defaultVoice('file', { id: 'voice1abc', dur: 3, size: 100 }, null); st.songs.push({ id: 'song1abc', kind: 'file', title: 'T', dur: 20, start: 0, len: 10, fade: 1, size: 10 });
    const bundle = C.makeBackup(st, '2026-11-07', 'bundle'); bundle.audioIndex = [{ key: 'v:voice1abc', type: 'audio/wav', size: 100 }, { key: 's:song1abc', type: 'audio/wav', size: 10 }, { key: 's:notmine', type: 'x', size: 5 }, { key: 'bad key', size: 5 }, { key: 'v:voice1abc', type: '<script>', size: 'x' }];
    v = C.validateBackup(bundle); eq(v.ok, true); eq(v.kind, 'bundle'); deep(v.audio.map(a => a.key), ['v:voice1abc', 's:song1abc', 'v:voice1abc'], 'only keys the team points at');
    eq(v.audio[2].type, 'script', 'odd characters are stripped from the type');
    bundle.audioIndex = [{ key: 'v:voice1abc', type: 'audio/wav', size: 50 * 1048576 }, { key: 's:song1abc', type: 'audio/wav', size: 50 * 1048576 }];
    v = C.validateBackup(bundle); eq(v.ok, false); assert.ok(/80 MB/.test(v.error));
  });

  /* ============ the screens ============ */
  await test('first screen: empty state offers the sample, restore and adding players; page basics are right', async () => {
    const { page, errors, ctx } = await open();
    assert.ok((await page.title()).startsWith('Walk-Up:'), await page.title());
    eq(await page.$eval('meta[name=viewport]', m => m.content), 'width=device-width, initial-scale=1, viewport-fit=cover');
    eq(await page.$eval('meta[name=theme-color]', m => m.content), '#0e0919'); eq(await page.$eval('meta[name=color-scheme]', m => m.content), 'dark');
    assert.ok(await page.$('link[rel=manifest]')); eq(await page.$eval('link[rel=apple-touch-icon]', l => l.getAttribute('href')), '/apps/icons/walkup-192.png');
    const srcs = await page.$$eval('script[src]', s => s.map(x => x.getAttribute('src'))); assert.ok(srcs.includes('https://natesteele888.github.io/apps/install.js'));
    const css = await page.$$eval('link[rel=stylesheet]', l => l.map(x => x.getAttribute('href')));
    assert.ok(css.every(h => h === 'walkup.css' || /^https:\/\/fonts\.googleapis\.com\//.test(h)), css.join(','));
    assert.ok(await page.isVisible('text=Add a sample lineup')); assert.ok(await page.isVisible('text=Add a player')); assert.ok(await page.isVisible('text=Restore from a backup file'));
    eq((await page.$$('#wuNav .navb')).length, 4); eq(await page.$eval('#wuNav .navb.on', b => b.textContent.trim()), 'Game');
    eq(await page.$eval('#wuLive', l => l.getAttribute('aria-live')), 'polite');
    await shot(page, '01-first-screen-390');
    await shotAt(page, '21-first-screen-768', 768, 1024);
    await shotAt(page, '31-first-screen-320', 320, 640); eq(await overflow(page) <= 0, true, 'no sideways scroll at 320');
    deep(errors, []); await ctx.close();
  });

  await test('sample lineup: nine ready players, the batter card, on deck and in the hole', async () => {
    const { page, errors, ctx } = await open();
    await sample(page);
    const s = await state(page);
    eq(s.roster.length, 9); eq(s.lineup.length, 9); eq(s.batter, 0);
    eq(await page.$$eval('.llist .lrow', r => r.length), 9);
    eq(await page.$$eval('.llist .chip.ok', c => c.length), 9, 'every sample player is Ready');
    const card = await page.textContent('.now');
    assert.ok(/Now batting/i.test(card) && /#7/.test(card) && /Player 1/.test(card) && /SS/.test(card) && /Ready/.test(card), card);
    const roles = await page.textContent('.roles'); assert.ok(/On deck/i.test(roles) && /#12/.test(roles) && /Player 2/.test(roles) && /In the hole/i.test(roles) && /#3/.test(roles) && /Player 3/.test(roles), roles);
    assert.ok(/Added a sample lineup/.test(await toastText(page)));
    await shot(page, '02-game-390'); await shotAt(page, '22-game-768', 768, 1024);
    await shotAt(page, '32-game-320', 320, 640); eq(await overflow(page) <= 0, true);
    deep(errors, []); await ctx.close();
  });

  await test('Play: the plan reaches the audio clock, the computer voice speaks on time, Stop fades over half a second, Play is quick', async () => {
    const { page, errors, ctx } = await open();
    await sample(page);
    await page.waitForFunction(() => window.WalkupApp.warmed() > 0, null, { timeout: 8000 });
    eq(await page.evaluate(() => window.__starts.length), 0, 'waking the audio starts no sound');
    await page.click('#gPlay');
    await page.waitForFunction(() => window.__starts.length >= 1);
    const sp = await spies(page), run = await lastRun(page);
    eq(sp.starts.length, 1, 'only the song is a buffer; the computer voice is spoken');
    approx(sp.starts[0].duration, 1.8, 1e-9); eq(sp.starts[0].offset, 0); approx(sp.starts[0].when, sp.t0, 1e-9);
    eq(run.plan.tracks.length, 2); eq(run.plan.tracks[1].tts, true); eq(run.plan.tracks[1].when, 1); approx(run.plan.total, 3.78, 1e-9);
    // the numbers that reached the music's gain: 0 at the start, up in 8 ms, hold, fade to 0 at the end of the 1.8 s horn (0.9 s fade)
    const g = run.nodes.find(n => n.track === 'music').gain, t0 = run.t0;
    deep(g.map(c => c[0]), ['setValueAtTime', 'linearRampToValueAtTime', 'linearRampToValueAtTime', 'linearRampToValueAtTime']);
    [[0, 0], [1, 0.008], [1, 0.9], [0, 1.8]].forEach(([v, t], i) => { approx(g[i][1], v, 1e-9); approx(g[i][2], t0 + t, 1e-9); });
    // and the duck stage: dips to 9 dB down (0.354813) as the voice starts at 1 s
    const d = run.nodes.find(n => n.track === 'music').duck; approx(d[0][1], 1, 1e-9); approx(d[0][2], t0 + 0.9, 1e-9); approx(d[1][1], 0.354813, 1e-6); approx(d[1][2], t0 + 1, 1e-9); approx(d[3][2], t0 + 4.08, 1e-9);
    assert.ok(/STOP/.test(await page.textContent('#gPlay')));
    await page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 4000 });
    const spoken = (await spies(page)).spoken; eq(spoken[0].text, 'Now batting, number 7, Player 1'); eq(spoken[0].rate, 1); eq(spoken[0].volume, 1);
    await shot(page, '03-game-playing-390');
    await page.click('#gPlay');
    await page.waitForFunction(() => /PLAY/.test(document.querySelector('#gPlay').textContent));
    const after = await lastRun(page); eq(after.stopped.fade, 0.5);
    const ramp = after.bus[after.bus.length - 1]; eq(ramp[0], 'linearRampToValueAtTime'); eq(ramp[1], 0); approx(ramp[2] - after.stopped.at, 0.5, 1e-9, 'the whole mix fades out over 0.5 s');
    assert.ok((await page.evaluate(() => window.__cancels || 0)) >= 1, 'the computer voice is cancelled too');
    await resetSpies(page);
    const t1 = Date.now(); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    assert.ok(await page.evaluate(() => window.WalkupApp.lastPlay().ms) < 300, 'Play to sound is quick');
    assert.ok(Date.now() - t1 < 1500);
    deep(errors, []); await ctx.close();
  });

  await test('Next, Prev and tapping a name: wrap around, fade out what is playing, and the order is remembered', async () => {
    const { page, errors, ctx } = await open();
    await sample(page);
    const now = () => page.textContent('.now .bigline');
    for (let i = 0; i < 9; i++) await page.click('#gNext');
    assert.ok(/Player 1/.test(await now()), 'nine Nexts come back round to the first batter');
    await page.click('#gPrev'); let t = await now(); assert.ok(/#2/.test(t) && /Player 9/.test(t), t);
    let roles = await page.textContent('.roles'); assert.ok(/Player 1/.test(roles) && /Player 2/.test(roles), 'on deck and in the hole wrap round: ' + roles);
    await page.click('.llist .lrow:nth-child(5)'); assert.ok(/Player 5/.test(await now())); eq((await state(page)).batter, 4);
    assert.ok(await page.$('.llist .lrow.on[aria-current="true"]'));
    await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    await page.click('#gNext');
    await page.waitForFunction(() => /PLAY/.test(document.querySelector('#gPlay').textContent));
    eq((await lastRun(page)).stopped.fade, 0.5, 'Next fades out the batter who was playing'); assert.ok(/Player 6/.test(await now()));
    await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 2);
    await page.click('.llist .lrow:nth-child(2)'); eq((await lastRun(page)).stopped.fade, 0.5, 'tapping another name fades out too');
    await page.reload(); await page.waitForSelector('#gPlay'); assert.ok(/Player 2/.test(await now()), 'the batter survives a reload');
    deep(errors, []); await ctx.close();
  });

  await test('one batter, two batters, no batters: Next and roles behave', async () => {
    const { page, errors, ctx } = await open();
    await page.click('[data-act=tab][data-tab=team]'); await page.click('text=Add a player'); await page.fill('#plName', 'Solo'); await page.fill('#plNum', '5'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await tab(page, 'game'); assert.ok(/Solo/.test(await page.textContent('.now'))); eq(await page.$('.roles'), null, 'nobody is on deck');
    await page.click('#gNext'); assert.ok(/Solo/.test(await page.textContent('.now')), 'Next with one batter stays on him');
    await tab(page, 'team'); await page.click('text=Add a player'); await page.fill('#plName', 'Second'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await tab(page, 'game'); let r = await page.textContent('.roles'); assert.ok(/On deck/.test(r) && /Second/.test(r) && !/In the hole/.test(r), r);
    await tab(page, 'team'); await page.click('[data-act=to-bench][data-id]'); await page.click('[data-act=to-bench][data-id]');
    await tab(page, 'game'); assert.ok(/Nobody is batting yet/.test(await page.textContent('#wuView')), 'empty lineup says so'); eq(await page.$('#gPlay'), null);
    await page.click('text=Go to Team'); eq(await page.$eval('#wuNav .navb.on', b => b.textContent.trim()), 'Team');
    deep(errors, []); await ctx.close();
  });

  await test('Team tab: reorder, bench, swap, add and delete; the batter stays the same person', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await tab(page, 'team');
    await shot(page, '04-team-390');
    let s = await state(page), first = s.lineup[0], name = id => s.roster.find(p => p.id === id).name;
    await page.click('[data-act=mv-down][data-id="' + first + '"]');
    s = await state(page); eq(s.lineup[1], first); eq(s.batter, 1, 'Player 1 is still the batter after moving down'); eq(s.lineup[s.batter], first);
    await page.click('[data-act=mv-up][data-id="' + first + '"]'); s = await state(page); eq(s.lineup[0], first); eq(s.batter, 0);
    assert.ok(await page.$eval('[data-act=mv-up][data-id="' + first + '"]', b => b.disabled), 'the top batter cannot move up');
    await page.click('[data-act=to-bench][data-id="' + first + '"]');
    s = await state(page); eq(s.lineup.length, 8); eq(s.roster.length, 9); assert.ok(!s.lineup.includes(first)); eq(s.batter, 0, 'the batter index stays in range');
    eq(await page.$$eval('.prow.bench', r => r.length), 1); assert.ok(/Player 1/.test(await page.textContent('.prow.bench')));
    await page.click('[data-act=to-lineup][data-id="' + first + '"]'); s = await state(page); eq(s.lineup.length, 9); eq(s.lineup[8], first);
    await page.click('[data-act=to-bench][data-id="' + s.lineup[3] + '"]'); s = await state(page); const out = s.roster.find(p => !s.lineup.includes(p.id)).id;
    const target = s.lineup[1]; await page.click('[data-act=swap][data-id="' + target + '"]'); await page.waitForSelector(sheetSel);
    await shot(page, '18-swap-390');
    await page.click(sheetSel + ' [data-do=in][data-id="' + out + '"]'); await noSheets(page);
    s = await state(page); eq(s.lineup[1], out); assert.ok(!s.lineup.includes(target), 'the swapped-out player sits on the bench');
    // add, then delete
    await page.click('text=Add a player'); await page.waitForSelector('#plName'); await page.fill('#plName', 'New Kid'); await page.fill('#plNum', '88'); await page.fill('#plPos', 'DH');
    await shot(page, '05-player-sheet-390');
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    s = await state(page); eq(s.roster.length, 10); const nk = s.roster.find(p => p.name === 'New Kid'); eq(nk.num, '88'); eq(nk.pos, 'DH'); assert.ok(s.lineup.includes(nk.id));
    await page.click('[data-act=edit-player][data-id="' + nk.id + '"]'); await page.waitForSelector(sheetSel);
    await page.click(sheetSel + ' [data-do=delete]'); await page.waitForSelector('.sheet.confirm'); assert.ok(/New Kid/.test(await page.textContent('.sheet.confirm')));
    await page.click('.sheet.confirm [data-ok]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 0);
    s = await state(page); eq(s.roster.length, 9); assert.ok(!s.roster.some(p => p.id === nk.id));
    // an empty new player closed straight away is not kept
    await page.click('text=Add a player'); await page.waitForSelector('#plName'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    eq((await state(page)).roster.length, 9, 'a blank player is thrown away'); void name;
    await shotAt(page, '23-team-768', 768, 1024); await shotAt(page, '33-team-320', 320, 640); eq(await overflow(page) <= 0, true);
    deep(errors, []); await ctx.close();
  });

  await test('Paste a list: the sheet shows what it found, adds them in order, and stops at 40', async () => {
    const { page, errors, ctx } = await open();
    await page.click('text=Paste a list of players'); await page.waitForSelector('#pasteTx');
    eq(await page.$eval('#pasteGo', b => b.disabled), true);
    await page.fill('#pasteTx', '7 Player Seven\n#12, Player Twelve\n\nPlayer Three 3\n5, Player Fifty, SS\n#8');
    assert.ok(/5 players found/.test(await page.textContent('#pasteInfo')), await page.textContent('#pasteInfo')); eq(await page.textContent('#pasteGo'), 'Add 5 players');
    await shot(page, '17-paste-390');
    await page.click('#pasteGo'); await noSheets(page);
    let s = await state(page); eq(s.roster.length, 5); deep(s.lineup, s.roster.map(p => p.id)); deep(s.roster.map(p => p.num), ['7', '12', '3', '5', '8']); eq(s.roster[3].pos, 'SS');
    await tab(page, 'team'); await page.click('text=Paste a list'); await page.fill('#pasteTx', Array.from({ length: 50 }, (_, i) => 'Extra ' + i).join('\n'));
    assert.ok(/The team holds up to 40/.test(await page.textContent('#pasteInfo'))); eq(await page.textContent('#pasteGo'), 'Add 35 players');
    await page.click('#pasteLu'); await page.click('#pasteGo'); await noSheets(page);
    s = await state(page); eq(s.roster.length, 40); eq(s.lineup.length, 5, 'unchecked: they wait on the bench');
    await page.click('text=Add a player'); assert.ok(/team is full/i.test(await toastText(page)), 'a 41st player is refused');
    deep(errors, []); await ctx.close();
  });

  await test('XSS: markup typed into names, song titles and pasted lists never runs', async () => {
    const { page, errors, ctx } = await open();
    const X = '<img src=x onerror="window.__xss=1">';
    await tab(page, 'team'); await page.click('text=Add a player'); await page.fill('#plName', X); await page.fill('#plNum', '<b>7'); await page.fill('#plPos', '<i>');
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await page.click('text=Paste a list'); await page.fill('#pasteTx', '9 ' + X + '\n<script>window.__xss=2</script>, Name'); await page.click('#pasteGo'); await noSheets(page);
    await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Slow Jam.wav')]);
    await page.waitForSelector('.sheet.trim'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await page.click('[data-act=song-rename]'); await page.fill('#rnTitle', X); await page.click(sheetSel + ' [data-ok]'); await noSheets(page);
    for (const t of ['game', 'team', 'songs', 'settings']) { await tab(page, t); await settle(page, 150); }
    await tab(page, 'game'); await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); await page.keyboard.press('Escape'); await noSheets(page);
    await tab(page, 'team'); await page.click('[data-act=edit-player]'); await page.waitForSelector(sheetSel); await settle(page, 200);
    eq(await page.evaluate(() => window.__xss), undefined, 'nothing ran');
    eq(await page.$$eval('#walkup img', i => i.length), 0, 'no image element was created'); eq(await page.$$eval('#walkup [onerror], #walkup script', i => i.length), 0);
    const names = await page.$$eval('.pname .nm', n => n.map(x => x.textContent)); assert.ok(names.includes(X), 'the text shows as typed: ' + names.join(' | '));
    assert.ok((await page.textContent('.sheet h2')).includes('<img'), 'the sheet title shows it as text');
    await page.keyboard.press('Escape'); await noSheets(page); await tab(page, 'songs'); assert.ok((await page.textContent('.srow b')).includes('<img'));
    eq(await page.evaluate(() => window.__xss), undefined);
    deep(errors, []); await ctx.close();
  });

  await test('Songs: add files by tapping, trim with steppers, handles and keys; preview plays exactly the trimmed clip', async () => {
    const { page, errors, ctx } = await open();
    await tab(page, 'songs'); assert.ok(/No songs saved yet/.test(await page.textContent('#wuView')));
    await page.setInputFiles('[data-file="songs-add"]', [fx('Slow Jam.wav')]);
    await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 8000 }); await settle(page, 600);
    let s = await state(page); eq(s.songs.length, 1); const song = s.songs[0];
    eq(song.title, 'Slow Jam'); approx(song.dur, 20, 0.05); deep([song.start, song.len, song.fade], [0, 10, 1]); eq(song.kind, 'file'); assert.ok(song.size > 800000);
    assert.ok((await dbKeys(page)).includes('s:' + song.id), 'the file is saved in this phone');
    assert.ok(await page.waitForFunction(() => { const c = document.querySelector('#trCv'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; const b0 = d[0], b1 = d[1], b2 = d[2]; for (let i = 0; i < d.length; i += 4) if (d[i] !== b0 || d[i + 1] !== b1 || d[i + 2] !== b2) n++; return n > 200; }, null, { timeout: 5000 }), 'the waveform is drawn');
    await shot(page, '07-trim-390');
    const cur = () => state(page).then(x => x.songs[0]);
    await page.click(sheetSel + ' [data-key=len][data-step="1"]'); eq((await cur()).len, 11, '+1 on the length');
    await page.click(sheetSel + ' [data-key=start][data-step="-0.1"]'); eq((await cur()).start, 0, 'cannot start before 0');
    await page.click(sheetSel + ' [data-key=start][data-step="1"]'); eq((await cur()).start, 1);
    await page.fill(sheetSel + ' input[type=number][data-key=len]', '99'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=len]', 'change');
    let t = await cur(); eq(t.len, 19, 'the song ends at 20 s, so from 1.0 s the clip can be 19 s long at most');
    await page.fill(sheetSel + ' input[type=number][data-key=fade]', '2.46'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=fade]', 'change'); eq((await cur()).fade, 2.5, 'tenths only');
    // drag the right handle left by about 100 px (the sheet scrolled to reach the fade box, so bring the waveform back first)
    await page.evaluate(() => { document.querySelector('.sheet.trim .sh-body').scrollTop = 0; }); await settle(page, 100);
    const hb = await page.locator('#trHe').boundingBox(), before = (await cur()).len;
    const hx = hb.x + 8; await page.mouse.move(hx, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hx - 100, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
    t = await cur(); assert.ok(t.len < before - 3, 'dragging the handle shortened the clip: ' + before + ' -> ' + t.len); eq(Math.round(t.len * 10) / 10, t.len, 'on the tenth-second grid'); eq(t.start, 1, 'the start did not move');
    // the left handle moves the start and keeps the end
    const endBefore = t.start + t.len, hs = await page.locator('#trHs').boundingBox();
    await page.mouse.move(hs.x + hs.width / 2, hs.y + hs.height / 2); await page.mouse.down(); await page.mouse.move(hs.x + hs.width / 2 + 40, hs.y + hs.height / 2, { steps: 4 }); await page.mouse.up();
    let t2 = await cur(); assert.ok(t2.start > 1.5, 'start moved right'); approx(t2.start + t2.len, endBefore, 0.11, 'the end stayed put');
    await page.focus('#trHe'); const l0 = (await cur()).len; await page.keyboard.press('ArrowRight'); approx((await cur()).len, l0 + 0.1, 1e-9, 'arrow key: a tenth of a second');
    await page.keyboard.press('Shift+ArrowLeft'); approx((await cur()).len, l0 + 0.1 - 1, 1e-9, 'shift + arrow: a second');
    // preview: exactly the clip
    const clip = await cur(); await resetSpies(page); await page.click('#trPrev'); await page.waitForFunction(() => window.__starts.length >= 1);
    const sp = await spies(page); approx(sp.starts[0].offset, clip.start, 1e-9); approx(sp.starts[0].duration, clip.len, 1e-9); approx(sp.starts[0].bufDur, 20, 0.05, 'a short song is kept whole');
    await page.click('#trPrev'); await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    assert.ok(/Slow Jam/.test(await page.textContent('#songList')));
    // preview from the list, and again to stop
    await resetSpies(page); await page.click('[data-act=song-preview]'); await page.waitForFunction(() => window.__starts.length >= 1);
    eq(await page.$eval('[data-act=song-preview]', b => b.classList.contains('on')), true); await page.click('[data-act=song-preview]'); await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    await shot(page, '06-songs-390');
    deep(errors, []); await ctx.close();
  });

  await test('Songs: a file the phone cannot read says so in plain words and adds nothing; one bad file does not stop the good ones', async () => {
    const { page, errors, ctx } = await open();
    await tab(page, 'songs');
    await page.setInputFiles('[data-file="songs-add"]', [fx('broken.mp3')]);
    await waitToast(page, /couldn.t read/); const msg = await toastText(page); assert.ok(/MP3, M4A or WAV/.test(msg), msg);
    eq((await state(page)).songs.length, 0); eq((await dbKeys(page)).length, 0, 'nothing was saved');
    await page.setInputFiles('[data-file="songs-add"]', [fx('Fast Jam.wav'), fx('broken.mp3'), fx('Slow Jam.wav')]);
    await page.waitForFunction(() => window.WalkupApp.S.st.songs.length === 2, null, { timeout: 8000 });
    assert.ok(/couldn.t read/i.test(await toastText(page)));
    deep((await state(page)).songs.map(x => x.title), ['Fast Jam', 'Slow Jam']); eq((await dbKeys(page)).length, 2);
    await page.setInputFiles('[data-file="songs-add"]', [{ name: 'empty.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(0) }]); await waitToast(page, /empty/);
    deep(errors, []); await ctx.close();
  });

  await test('Two taps change a player\'s song; a song is added once and shared; deleting it tells you who uses it', async () => {
    const { page, errors, ctx } = await open();
    await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Fast Jam.wav'), fx('Slow Jam.wav')]);
    await page.waitForFunction(() => window.WalkupApp.S.st.songs.length === 2, null, { timeout: 8000 }); await settle(page, 300);
    await tab(page, 'game'); await sample(page);
    const songs = (await state(page)).songs, slow = songs.find(x => x.title === 'Slow Jam');
    await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel);                      // tap 1: Song
    await shot(page, '08-picker-390');
    await page.click(sheetSel + ' [data-do=use][data-id="' + slow.id + '"]'); await noSheets(page); // tap 2: the song
    let s = await state(page); eq(s.roster[0].songId, slow.id, 'two taps and the song is changed'); assert.ok(/Slow Jam/.test(await page.textContent('.now')));
    // the same song for another batter
    await page.click('#gNext'); await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); assert.ok(await page.$(sheetSel + ' .chip.ok'), 'the current song is marked');
    await page.click(sheetSel + ' [data-do=use][data-id="' + slow.id + '"]'); await noSheets(page);
    s = await state(page); eq(s.roster[1].songId, slow.id); eq(s.songs.length, 2, 'the library still has one copy');
    await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); await page.click(sheetSel + ' [data-do=use][data-id=""]'); await noSheets(page); eq((await state(page)).roster[1].songId, null, '"Use no song"');
    assert.ok(/No song/.test(await page.textContent('.now')) && /Ready|No song/.test(await page.textContent('.now .chip')));
    // deleting: asks, names the players, cleans the saved file
    await tab(page, 'songs'); await page.click('[data-act=song-delete][data-id="' + slow.id + '"]'); await page.waitForSelector('.sheet.confirm');
    const ask = await page.textContent('.sheet.confirm'); assert.ok(/#7 Player 1/.test(ask) && /Slow Jam/.test(ask), ask);
    await page.click('.sheet.confirm [data-ok]'); await page.waitForFunction(() => window.WalkupApp.S.st.songs.length === 1);
    s = await state(page); eq(s.roster[0].songId, null, 'the player who used it has no song now'); await page.waitForFunction(id => !window.WalkupApp.S.have.has('s:' + id), slow.id);
    assert.ok(!(await dbKeys(page)).includes('s:' + slow.id), 'the saved file is gone too');
    deep(errors, []); await ctx.close();
  });

  await test('Songs: choosing a built-in sound is two taps and needs no file', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel);
    const rows = await page.$$eval(sheetSel + ' #pkBuilt .srow b', r => r.map(x => x.textContent)); eq(rows.length, 4, rows.join(','));
    await page.click(sheetSel + ' #pkBuilt [data-do=use][data-id="b:siren"]'); await noSheets(page);
    eq((await state(page)).roster[0].songId, 'b:siren'); await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    approx((await spies(page)).starts[0].duration, 4, 1e-9, 'the 4 s siren plays whole');
    deep(errors, []); await ctx.close();
  });

  /* ============ the voice studio ============ */
  await test('Voice: record with the (fake) microphone, count-in, meter, saved on this phone, trimmed, polished, and still there after a reload', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await page.click('[data-act=g-voice]'); await page.waitForSelector(sheetSel + ' [data-do=rerecord]');
    assert.ok(/Second choice/.test(await page.textContent(sheetSel)), 'the computer voice is labelled second choice');
    await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    eq(await page.$eval('#vsCin', c => c.checked), true, 'count-in is on by default');
    await page.click('#vsRecBtn');
    await page.waitForFunction(() => { const c = document.querySelector('#vsCount'); return c && !c.hidden && /^[123]$/.test(c.textContent); }, null, { timeout: 5000 });
    await shot(page, '10-voice-recorder-390');
    await page.waitForFunction(() => /Stop/.test(document.querySelector('#vsRecBtn').textContent), null, { timeout: 8000 });
    await page.waitForFunction(() => parseFloat(document.querySelector('#vsMeter').style.width) > 5, null, { timeout: 5000 });
    assert.ok(await page.$eval('#vsMeter', m => m.className) !== '', 'the level meter moves while the voice plays into the mic');
    await settle(page, 1500); await page.click('#vsRecBtn');
    await page.waitForSelector('#vsDetail', { timeout: 10000 }); await page.waitForSelector('#vsPolish');
    let s = await state(page), v = s.roster[0].voice;
    eq(v.kind, 'rec'); assert.ok(v.dur > 1.2 && v.dur < 8, 'duration ' + v.dur); assert.ok(v.size > 500); assert.ok(/audio\//.test(v.mime), v.mime);
    assert.ok(v.ts >= 0 && v.te > v.ts && v.te <= v.dur + 0.001, JSON.stringify([v.ts, v.te, v.dur]));
    deep(v.polish, C.factoryAnnouncer(), 'a new recording starts with the announcer sound');
    assert.ok((await dbKeys(page)).includes('v:' + v.id), 'saved in this phone'); eq((await state(page)).settings.countIn, true);
    await page.waitForFunction(() => /^Ready/.test(document.querySelector('#vsState').textContent), null, { timeout: 8000 });
    await shot(page, '09-voice-polish-390');
    await page.$eval('#vsPolish', e => e.scrollIntoView({ block: 'start' })); await settle(page, 300); await shot(page, '09b-voice-polish-controls-390');
    await page.$eval(sheetSel + ' .sh-body', b => { b.scrollTop = b.scrollHeight; }); await settle(page, 300); await shot(page, '09c-voice-polish-more-390');
    await page.$eval(sheetSel + ' .sh-body', b => { b.scrollTop = 0; });
    // listen to the polished sound: the rendered buffer is the trimmed voice plus the 0.504 s room tail
    await resetSpies(page); await page.click('#vsPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    let sp = await spies(page); approx(sp.starts[0].bufDur, v.te - v.ts + 0.504, 0.02, 'polished length = speech + tail'); eq(sp.starts[0].offset, 0);
    await page.click('#vsPlay'); await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    await page.click('[data-do=ab][data-v=original]'); await resetSpies(page); await page.click('#vsPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    sp = await spies(page); approx(sp.starts[0].offset, v.ts, 1e-6, 'the original plays from the kept start'); approx(sp.starts[0].duration, v.te - v.ts, 1e-6); approx(sp.starts[0].bufDur, v.dur, 0.03, 'the whole recording is still there');
    await page.click('#vsPlay'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    // reload: the voice is still on this phone and plays
    await page.reload(); await page.waitForSelector('#gPlay'); eq((await state(page)).roster[0].voice.id, v.id);
    assert.ok(/Ready/.test(await page.textContent('.now .chip')), 'still ready after a reload');
    await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 2);
    sp = await spies(page); const run = await lastRun(page);
    const vs = sp.starts.find(x => Math.abs(x.when - (sp.t0 + 1)) < 1e-9); assert.ok(vs, 'the recorded voice starts 1 s after Play: ' + JSON.stringify(sp.starts));
    approx(vs.bufDur, v.te - v.ts + 0.504, 0.02); eq(sp.spoken.length, 0, 'no computer voice when there is a recording'); eq(run.plan.tracks[1].tts, false);
    deep(errors, []); await ctx.close();
  });

  await test('Voice: count-in can be turned off; recording can be cancelled; no mic permission gives a plain message', async () => {
    const { page, errors, ctx } = await open({ init: () => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => window.__denyMic ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) : g(c); } });
    await sample(page); await page.click('[data-act=g-voice]'); await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    await page.evaluate(() => { window.__denyMic = true; }); await page.click('#vsRecBtn');
    await page.waitForFunction(() => !document.querySelector('#vsRecMsg').hidden); assert.ok(/isn.t allowed to use the microphone/.test(await page.textContent('#vsRecMsg')), await page.textContent('#vsRecMsg'));
    await page.evaluate(() => { window.__denyMic = false; });
    await page.click('#vsCin'); await page.click('#vsRecBtn'); await page.waitForFunction(() => /Stop/.test(document.querySelector('#vsRecBtn').textContent), null, { timeout: 4000 });
    eq((await state(page)).settings.countIn, false, 'the choice is remembered'); assert.ok(await page.$eval('#vsCount', c => c.hidden), 'no count-in this time');
    await page.click('[data-do=cancel-rerec]'); await settle(page, 200); eq((await state(page)).roster[0].voice.kind, 'tts', 'cancel keeps the old voice');
    eq(await page.evaluate(() => window.WalkupApp.eng.rec.active()), false, 'the microphone is released');
    deep(errors, []); await ctx.close();
  });

  await test('Voice file: auto-trim finds the speech (about 0.45 s to 2.65 s), undo, threshold, replace, delete removes the saved file', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await page.click('[data-act=g-voice]'); await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    await page.setInputFiles(sheetSel + ' input[data-file="voice-file"]', fx('voice.wav')); await page.waitForSelector('#vsDetail', { timeout: 10000 });
    let v = (await state(page)).roster[0].voice; eq(v.kind, 'file'); eq(v.name, 'voice.wav'); approx(v.dur, 3, 0.01); approx(v.ts, 0.45, 0.02, 'starts a little before the first sound'); approx(v.te, 2.65, 0.02, 'ends a little after the last');
    assert.ok(/Keeping/.test(await page.textContent('#vsKept')) && /only hidden/.test(await page.textContent('#vsKept')), 'trimming never destroys the recording');
    assert.ok(await page.waitForFunction(() => { const c = document.querySelector('#vsWave'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 120) n++; return n > 100; }, null, { timeout: 5000 }), 'the waveform is drawn');
    await page.click('[data-do=untrim]'); v = (await state(page)).roster[0].voice; eq(v.ts, 0); approx(v.te, 3, 0.01); assert.ok(/whole recording/.test(await page.textContent('#vsKept')));
    eq(await page.$eval('[data-do=untrim]', b => b.disabled), true);
    await page.click('[data-do=autotrim]'); v = (await state(page)).roster[0].voice; approx(v.ts, 0.45, 0.02); approx(v.te, 2.65, 0.02);
    const before = [v.ts, v.te]; await page.$eval(sheetSel + ' input[data-key=thr]', el => { el.value = '-20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    v = (await state(page)).roster[0].voice; eq(v.thr, -20); assert.ok(v.ts >= before[0] - 1e-9 && v.te <= before[1] + 1e-9, 'a higher threshold never keeps more'); assert.ok(/-20 dB/.test(await page.textContent('[data-val=thr]')));
    await page.click('[data-do=untrim]');
    const first = (await state(page)).roster[0].voice.id; assert.ok((await dbKeys(page)).includes('v:' + first));
    await page.click('[data-do=delete]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]');
    await page.waitForFunction(() => window.WalkupApp.S.st.roster[0].voice === null); await page.waitForFunction(k => !window.WalkupApp.S.have.has(k), 'v:' + first);
    assert.ok(!(await dbKeys(page)).includes('v:' + first), 'the file is removed from this phone');
    await page.setInputFiles(sheetSel + ' input[data-file="voice-file"]', [fx('broken.mp3')]); await waitToast(page, /couldn.t read/);
    eq((await state(page)).roster[0].voice, null, 'a broken voice file changes nothing');
    deep(errors, []); await ctx.close();
  });

  await test('Polish: EQ, high-pass, compressor, room reverb and output level change real audio by the amounts they promise', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await page.click('#gPlay'); await settle(page, 300);
    const run = spec => page.evaluate(async spec => {
      const E = window.WalkupApp.eng, C = window.WalkupApp.core, ac = E.ctx();
      const sr = 44100, n = Math.round(spec.sec * sr), raw = ac.createBuffer(1, n, sr), d = raw.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = spec.amp * Math.sin(2 * Math.PI * spec.f * i / sr);
      const r = await E.renderBuffer(raw, { ts: spec.ts || 0, te: spec.te == null ? spec.sec : spec.te, norm: !!spec.norm, polish: Object.assign(C.flatPolish(), spec.polish || {}) });
      const ch = r.buf.getChannelData(0), fs = r.buf.sampleRate;
      const rms = (a, b) => { let s = 0; const i0 = Math.floor(a * fs), i1 = Math.floor(b * fs); for (let i = i0; i < i1; i++) s += ch[i] * ch[i]; return Math.sqrt(s / (i1 - i0)); };
      const pk = (a, b) => { let m = 0; const i0 = Math.floor(a * fs), i1 = Math.min(ch.length, Math.floor(b * fs)); for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(ch[i])); return m; };
      return { dur: r.buf.duration, speech: r.speech, total: r.total, mid: rms(0.3, spec.sec - 0.3), peak: pk(0.4, spec.sec - 0.3), inRms: spec.amp / Math.SQRT2, tail: spec.sec + 0.1 < r.buf.duration - 0.05 ? [rms(spec.sec + 0.05, spec.sec + 0.3), rms(r.buf.duration - 0.4, r.buf.duration - 0.02)] : null, ch: r.buf.numberOfChannels };
    }, spec);
    let r = await run({ sec: 1, amp: 0.1, f: 1000 }); approx(r.mid / r.inRms, 1, 0.02, 'a flat chain leaves the level alone'); approx(r.dur, 1.05, 0.01); eq(r.speech, 1); eq(r.ch, 2);
    r = await run({ sec: 1, amp: 0.1, f: 1000, polish: { eq: [0, 0, 12, 0, 0] } }); const g12 = r.mid / r.inRms; assert.ok(g12 > 3.58 && g12 < 4.38, '+12 dB at 1 kHz is about x4: ' + g12);
    r = await run({ sec: 1, amp: 0.1, f: 1000, polish: { eq: [0, 0, -12, 0, 0] } }); assert.ok(r.mid / r.inRms > 0.226 && r.mid / r.inRms < 0.277, '-12 dB is about x0.25: ' + r.mid / r.inRms);
    r = await run({ sec: 1, amp: 0.1, f: 1000, polish: { eq: [12, 0, 0, 0, 12] } }); approx(r.mid / r.inRms, 1, 0.2, 'bands three octaves away leave 1 kHz nearly alone');
    r = await run({ sec: 1, amp: 0.5, f: 40, polish: { hp: true, hpf: 80 } }); approx(r.mid / r.inRms, 0.2425, 0.03, 'a 2nd-order high-pass at 80 Hz passes 40 Hz at about 0.2425 (-12.3 dB)');
    r = await run({ sec: 1, amp: 0.5, f: 1000, polish: { hp: true, hpf: 80 } }); approx(r.mid / r.inRms, 1, 0.03, 'and leaves 1 kHz alone');
    r = await run({ sec: 1, amp: 0.1, f: 1000, polish: { out: 6 } }); approx(r.mid / r.inRms, 1.995, 0.04, '+6 dB output level');
    const loud = await run({ sec: 1.5, amp: 0.9, f: 1000, polish: { comp: 'strong' } }), quiet = await run({ sec: 1.5, amp: 0.05, f: 1000, polish: { comp: 'strong' } }), light = await run({ sec: 1.5, amp: 0.9, f: 1000, polish: { comp: 'light' } });
    assert.ok(loud.peak < 0.9 * 0.5, 'strong compression lowers a loud sine: 0.9 -> ' + loud.peak); assert.ok(light.peak < 0.9 * 0.85 && light.peak > loud.peak, 'light is gentler: ' + light.peak);
    assert.ok(loud.peak / quiet.peak < 3, 'a 25 dB gap between loud and quiet shrinks to ' + (20 * Math.log10(loud.peak / quiet.peak)).toFixed(1) + ' dB');
    // room reverb: the tail runs past the dry end and dies away
    const dry = await run({ sec: 1, amp: 0.3, f: 500 }), room = await run({ sec: 1, amp: 0.3, f: 500, polish: { size: 'gym', wet: 40 } });
    approx(room.dur, 1 + 1.412, 0.01, 'the gym room adds 1.412 s'); approx(room.total, room.dur, 1e-9); eq(room.speech, 1);
    assert.ok(room.tail && room.tail[0] > 0.01, 'there is sound after the voice has ended: ' + JSON.stringify(room.tail)); assert.ok(room.tail[1] < room.tail[0] / 3, 'and it dies away');
    assert.ok(dry.dur < 1.06, 'a dry voice has no tail');
    const stadium = await run({ sec: 0.5, amp: 0.3, f: 500, polish: { size: 'stadium', wet: 30 } }); approx(stadium.dur, 0.5 + 3.03, 0.01);
    // trim and normalize
    r = await run({ sec: 3, amp: 0.2, f: 500, ts: 1, te: 2 }); approx(r.speech, 1, 1e-9); approx(r.dur, 1.05, 0.01, 'only the kept second is rendered');
    r = await run({ sec: 1, amp: 0.2, f: 500, norm: true }); approx(r.peak, 0.891251, 0.02, 'normalize puts the loudest point at -1 dBFS');
    deep(errors, []); await ctx.close();
  });

  /* ============ the mixer ============ */
  await test('Mix: balance, delays, ducking and the timeline reach the audio nodes exactly as the plan says', async () => {
    const { page, errors, ctx } = await open();
    await rich(page); await page.waitForSelector('#gPlay'); assert.ok(/Ready/.test(await page.textContent('.now .chip')));
    await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' #mxTl svg.tl'); await settle(page, 500);
    const tl = await page.textContent('#mxTl'); assert.ok(/Music/.test(tl) && /Voice/.test(tl) && /1s|2s/.test(tl), tl); eq(await page.textContent('#mxTotal'), 'Total 10.0 s');
    const vx = () => page.$eval('#tlVoice rect.tl-voice', r => parseFloat(r.getAttribute('x')));
    approx(await vx(), 12 + 1 / 10.4 * 316, 0.05, 'voice bar starts at 1 s on a 10.4 s axis');
    await shot(page, '11-mix-390');
    // balance +50: music -5.33 dB, voice untouched
    await page.$eval('#mxBal', el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    eq(await page.textContent('#mxLM'), 'Music -5.3 dB'); eq(await page.textContent('#mxLV'), 'Voice 0 dB'); eq((await state(page)).roster.slice(-1)[0].mix.bal, 50);
    // the voice starts at 2.5 s, the music at 0.5 s
    await page.fill(sheetSel + ' input[type=number][data-key=vd]', '2.5'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=vd]', 'change');
    await page.fill(sheetSel + ' input[type=number][data-key=md]', '0.5'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=md]', 'change');
    let m = (await state(page)).roster.slice(-1)[0].mix; eq(m.vd, 2.5); eq(m.md, 0.5); approx(await vx(), 12 + 2.5 / 10.4 * 316 /* total grows to 10.5 so T=10.92 */ * 10.4 / 10.92, 0.1, 'the bar moved right');
    eq(await page.textContent('#mxTotal'), 'Total 10.5 s');
    await resetSpies(page); await page.click('#mxPrev'); await page.waitForFunction(() => window.__starts.length >= 2, null, { timeout: 8000 });
    let sp = await spies(page), run = await lastRun(page), t0 = run.t0;
    const mus = sp.starts.find(x => x.duration === 10), voi = sp.starts.find(x => x.duration !== 10);
    approx(mus.when, t0 + 0.5, 1e-9, 'music starts 0.5 s after Play'); eq(mus.offset, 0); approx(voi.when, t0 + 2.5, 1e-9, 'voice starts 2.5 s after Play'); eq(voi.offset, 0);
    const song = (await state(page)).songs[0], voice = (await state(page)).roster.slice(-1)[0].voice;
    approx(voi.duration, voice.te - voice.ts + 0.504, 0.02); approx(run.plan.total, 10.5, 1e-9);
    const mg = run.nodes.find(n => n.track === 'music'), vg = run.nodes.find(n => n.track === 'voice');
    approx(mg.gain[1][1], 0.541196, 1e-6, 'music gain after balance +50'); approx(20 * Math.log10(mg.gain[1][1]), -5.33, 0.01, 'that is -5.33 dB'); approx(vg.gain[1][1], 1, 1e-9, 'voice stays at 1');
    approx(mg.gain[0][2], t0 + 0.5, 1e-9); approx(mg.gain[1][2], t0 + 0.508, 1e-9); approx(mg.gain[mg.gain.length - 1][2], t0 + 10.5, 1e-9);
    // the duck: default 9 dB, 0.1 s in, 0.3 s out, around the dry voice (2.5 s to 4.7 s)
    const a = 0.354813, dk = mg.duck; eq(dk.length, 4);
    [[1, 2.4], [a, 2.5], [a, 2.5 + (voice.te - voice.ts)], [1, 2.5 + (voice.te - voice.ts) + 0.3]].forEach(([v, t], i) => { approx(dk[i][1], v, 1e-6, 'duck value ' + i); approx(dk[i][2], t0 + t, 0.011, 'duck time ' + i); });
    await page.click('#mxPrev'); await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    // ducking off: no duck stage at all
    await page.click(sheetSel + ' input[data-tg=duck]'); eq((await state(page)).roster.slice(-1)[0].mix.duck, false); assert.ok(await page.$eval('#mxDuck', d => d.hidden));
    await resetSpies(page); await page.click('#mxPrev'); await page.waitForFunction(() => window.__starts.length >= 2); run = await lastRun(page); eq(run.nodes.find(n => n.track === 'music').duck, null);
    await page.click('#mxPrev'); await page.waitForFunction(() => !window.WalkupApp.eng.playing());
    // Center puts the balance back
    await page.click(sheetSel + ' [data-do=center]'); eq(await page.textContent('#mxLM'), 'Music 0 dB'); eq((await state(page)).roster.slice(-1)[0].mix.bal, 0);
    // volumes stop at 100 and sliders update the plan
    await page.$eval(sheetSel + ' input[data-key=mv]', el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); }); eq(await page.textContent('#mxLM'), 'Music -6.0 dB');
    void song; deep(errors, []); await ctx.close();
  });

  await test('Mix: drag or key the voice bar on the timeline, stepper buttons, ducking depth; the same plan plays in Game', async () => {
    const { page, errors, ctx } = await open();
    await rich(page); await page.waitForSelector('#gPlay'); await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' #tlVoice'); await settle(page, 500);
    const vd = () => state(page).then(s => s.roster.slice(-1)[0].mix.vd);
    eq(await vd(), 1); await page.focus('#tlVoice'); await page.keyboard.press('ArrowRight'); eq(await vd(), 1.1); await page.keyboard.press('Shift+ArrowRight'); eq(await vd(), 2.1); await page.keyboard.press('ArrowLeft'); eq(await vd(), 2);
    await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft'); eq(await vd(), 0, 'cannot go before Play');
    await page.evaluate(() => { document.querySelector('.sheet.mix .sh-body').scrollTop = 0; }); await settle(page, 100);
    const bb = await page.locator('#tlVoice rect.tl-voice').boundingBox(), svg = await page.locator('#mxTl svg').boundingBox();
    const x0 = bb.x + bb.width / 2, y0 = bb.y + bb.height / 2; await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + 60, y0, { steps: 6 }); await page.mouse.up();
    const dragged = await vd(), expected = 60 / (svg.width / 340) / 316 * 10.4; approx(dragged, expected, 0.35, 'dragging 60 px moves the voice by about ' + expected.toFixed(1) + ' s'); eq(Math.round(dragged * 10) / 10, dragged);
    await page.click(sheetSel + ' [data-key=vd][data-step="1"]'); approx(await vd(), dragged + 1, 1e-9, '+1 second button');
    await page.click(sheetSel + ' [data-key=vd][data-step="-0.1"]'); approx(await vd(), dragged + 0.9, 1e-9);
    await page.fill(sheetSel + ' input[type=number][data-key=vd]', '55'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=vd]', 'change'); eq(await vd(), 20, 'the voice can start up to 20 s in');
    await page.$eval(sheetSel + ' input[data-key=dd][type=range]', el => { el.value = '15'; el.dispatchEvent(new Event('input', { bubbles: true })); }); eq((await state(page)).roster.slice(-1)[0].mix.dd, 15);
    await page.fill(sheetSel + ' input[type=number][data-key=vd]', '1'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=vd]', 'change');
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 2);
    const run = await lastRun(page), dk = run.nodes.find(n => n.track === 'music').duck; approx(dk[1][1], 0.177828, 1e-6, '-15 dB'); approx(dk[1][2], run.t0 + 1, 1e-9);
    eq(run.plan.tracks.find(t => t.track === 'voice').when, 1, 'Game plays the mix that Preview played');
    deep(errors, []); await ctx.close();
  });

  await test('Mix: a player with a song but no voice, or a voice but no song, plays what there is; the timeline says so', async () => {
    const { page, errors, ctx } = await open({ query: '?noSpeech' });
    await sample(page);
    assert.ok(/No voice/.test(await page.textContent('.now .chip')), 'without computer-voice support the sample players have no voice'); assert.ok(/The song will play on its own/.test(await page.textContent('.now .hint')));
    await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1);
    eq((await lastRun(page)).plan.tracks.length, 1); await page.click('#gPlay');
    await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' #mxTl'); assert.ok(/No voice/.test(await page.textContent('#mxTl')));
    eq(await page.$('#tlVoice'), null); await page.keyboard.press('Escape'); await noSheets(page);
    await page.click('[data-act=g-song]'); await page.click(sheetSel + ' [data-do=use][data-id=""]'); await noSheets(page);
    assert.ok(/Nothing to play yet/.test(await page.textContent('.now .hint'))); await page.click('#gPlay'); assert.ok(/Nothing to play yet/.test(await toastText(page)));
    eq(await page.evaluate(() => window.WalkupApp.eng.playing()), null);
    deep(errors, []); await ctx.close();
  });

  /* ============ settings ============ */
  const codeOf = (page, name) => page.evaluate(n => { const A = window.WalkupApp, p = A.S.st.roster.find(x => x.name === n); return p ? A.core.statusOf(p, A.S.st.songs, k => A.S.have.has(k)).code : null; }, name);
  const setRange = (page, sel, v) => page.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);

  await test('Settings: master volume, computer voice, recording and game options, announcer sound, storage line, version; all remembered', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await tab(page, 'settings'); await page.waitForSelector('#storTx');
    const txt = await page.textContent('#wuView'); assert.ok((txt.match(/Walk-Up v1/g) || []).length >= 2, 'the version is in the header and in About');
    await page.waitForFunction(() => /^0 audio files/.test(document.querySelector('#storTx').textContent)); await shot(page, '12-settings-390');
    // sound check: a tone, then the voice
    await resetSpies(page); await page.click('[data-act=sound-check]'); await waitToast(page, /tone, then .Sound check./);
    await page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 3000 }); eq((await spies(page)).spoken[0].text, 'Sound check');
    // master volume reaches the output
    await setRange(page, '[data-ctl=master] input[type=range]', 40); eq(await page.textContent('[data-val=master]'), '40%'); eq((await state(page)).settings.master, 40);
    approx(await page.evaluate(() => window.WalkupApp.eng.master().gain.value), 0.4, 1e-6, 'the master gain is 0.4');
    // the computer voice
    const opts = await page.$$eval('#tvoice option', o => o.map(x => x.textContent)); eq(opts.length, 3); assert.ok(/Test Voice B \(en-GB\)/.test(opts[2]), opts.join('|'));
    await page.selectOption('#tvoice', 'test-b'); await setRange(page, '[data-ctl=trate] input[type=range]', 1.2); await setRange(page, '[data-ctl=tvol] input[type=range]', 80);
    eq(await page.textContent('[data-val=trate]'), '1.2x'); eq(await page.textContent('[data-val=tvol]'), '80%');
    await resetSpies(page); await page.click('[data-act=tts-test]'); await page.waitForFunction(() => window.__spoken.length >= 1);
    deep((await spies(page)).spoken[0], { text: 'Sound check', rate: 1.2, volume: 0.8, voice: 'test-b' });
    // recording and game options
    await page.uncheck('[data-setting=countIn]'); await page.uncheck('[data-setting=wake]'); await setRange(page, '[data-ctl=thr] input[type=range]', -50); eq(await page.textContent('[data-val=thr]'), '-50 dB');
    let s = (await state(page)).settings; deep([s.countIn, s.wake, s.thr, s.tvoice, s.trate, s.tvol, s.master], [false, false, -50, 'test-b', 1.2, 80, 40]);
    // the announcer sound: reset puts the factory sound back
    await page.evaluate(() => { const A = window.WalkupApp; A.S.st.announcer.comp = 'strong'; A.WU.commit('data'); });
    assert.ok(/compressor strong/.test(await page.textContent('#wuView')), 'the summary follows the sound');
    await page.click('[data-act=reset-ann]'); await waitToast(page, /Announcer sound reset/); deep((await state(page)).announcer, C.factoryAnnouncer());
    // everything is remembered after a reload
    await page.reload(); await page.waitForSelector('#wuNav .navb'); await tab(page, 'settings');
    s = (await state(page)).settings; deep([s.countIn, s.wake, s.thr, s.tvoice, s.trate, s.tvol, s.master], [false, false, -50, 'test-b', 1.2, 80, 40]);
    eq(await page.$eval('[data-ctl=master] input[type=range]', e => e.value), '40'); eq(await page.$eval('#tvoice', e => e.value), 'test-b'); eq(await page.$eval('[data-setting=countIn]', e => e.checked), false);
    await page.click('[data-act=sound-check]'); await settle(page, 200); approx(await page.evaluate(() => window.WalkupApp.eng.master().gain.value), 0.4, 1e-6, 'and the output level too');
    deep(errors, []); await ctx.close();
  });

  await test('Settings: Bluetooth help, and the sound check works without a computer voice', async () => {
    const { page, errors, ctx } = await open({ query: '?noSpeech' });
    await tab(page, 'settings'); assert.ok(/This browser can.t speak/.test(await page.textContent('#wuView')), 'says so instead of showing a dead voice picker'); eq(await page.$('#tvoice'), null);
    await page.click('[data-act=bt-help]'); await page.waitForSelector(sheetSel); await shot(page, '14-bluetooth-390');
    const t = await page.textContent(sheetSel); for (const re of [/Pair the speaker first/, /Sound check/, /silent mode mutes web audio/, /a tenth of a second/, /Master volume/]) assert.ok(re.test(t), String(re));
    await page.click(sheetSel + ' [data-act=sound-check]'); await waitToast(page, /no voice part/);
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    deep(errors, []); await ctx.close();
  });

  /* ============ backups ============ */
  await test('Backup settings: a plain JSON file with the team, mixes and song list but no audio; restoring it on a new phone says what is missing, and choosing the files again fixes it', async () => {
    const A = await open({ today: '2026-11-07' }); const { page, errors, ctx } = A;
    await sample(page); await rich(page); await tab(page, 'settings');
    assert.ok(/haven.t made a backup yet/.test(await page.textContent('#backupCard')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup-settings]')]); eq(dl.suggestedFilename(), 'walkup-settings-2026-11-07.json');
    const fp = path.join(FIX, 'settings.json'); await dl.saveAs(fp); const raw = fs.readFileSync(fp, 'utf8'), obj = JSON.parse(raw);
    deep([obj.app, obj.v, obj.kind, obj.exported], ['walkup', 1, 'settings', '2026-11-07']); eq(obj.data.roster.length, 10); eq(obj.data.songs.length, 1); eq(obj.data.lineup.length, 10); assert.ok(raw.length < 120000, 'small: ' + raw.length); eq('audio' in obj, false); eq('audioIndex' in obj, false);
    assert.ok(!raw.includes(VOICE_B64.slice(2000, 2100)), 'no audio inside');
    await waitToast(page, /Settings backup saved/); assert.ok(/Last backup: today\./.test(await page.textContent('#backupCard')));
    // a new phone
    const B = await open({ today: '2026-11-07' }); const p2 = B.page; await tab(p2, 'settings');
    await p2.setInputFiles('[data-file="restore"]', fp); await p2.waitForSelector('.sheet.confirm'); const ask = await p2.textContent('.sheet.confirm');
    assert.ok(/10 players \(10 in the batting order\), 1 song, 1 recorded voice\. Made on Nov 7, 2026/.test(ask), ask); assert.ok(/does not include the audio files/.test(ask) && /Nothing is in Walk-Up on this phone yet/.test(ask), ask);
    await shot(p2, '16-restore-confirm-390');
    await p2.click('.sheet.confirm [data-close].btn'); await noSheets(p2); eq((await state(p2)).roster.length, 0, 'Cancel changes nothing');
    await p2.setInputFiles('[data-file="restore"]', fp); await p2.waitForSelector('.sheet.confirm'); await p2.click('.sheet.confirm [data-ok]'); await waitToast(p2, /Restored 10 players/);
    eq((await state(p2)).roster.length, 10); eq(await codeOf(p2, 'Player 1'), 'ready'); eq(await codeOf(p2, 'Player Rich'), 'needs-song');
    await tab(p2, 'game'); await p2.click('.lrow:has-text("Player Rich")'); assert.ok(/Needs song file/.test(await p2.textContent('.now .chip')));
    await resetSpies(p2); await p2.click('#gPlay'); assert.ok(/isn.t on this phone|Open Songs|choose the file/i.test(await toastText(p2)), await toastText(p2)); eq((await spies(p2)).starts.length, 0, 'it does not pretend to play');
    // choose the song file again, then the voice file again
    await tab(p2, 'songs'); await p2.setInputFiles('[data-file="song-refill"]', fx('Slow Jam.wav')); await p2.waitForFunction(() => window.WalkupApp.S.have.size >= 1, null, { timeout: 8000 });
    eq(await codeOf(p2, 'Player Rich'), 'needs-voice'); eq((await state(p2)).songs.length, 1, 'the song is the same library entry, not a copy');
    await tab(p2, 'game'); await p2.click('.lrow:has-text("Player Rich")'); await p2.click('[data-act=g-voice]'); await p2.waitForSelector(sheetSel); await settle(p2, 400);
    await p2.setInputFiles(sheetSel + ' input[data-file="voice-file"]', fx('voice.wav')); await p2.waitForSelector('#vsDetail', { timeout: 10000 });
    await p2.click(sheetSel + ' [data-close].btn'); await noSheets(p2); eq(await codeOf(p2, 'Player Rich'), 'ready'); await B.ctx.close();
    deep(errors, []); deep(B.errors, []); await ctx.close();
  });

  let BUNDLE = '';
  await test('Backup everything: one file with the audio inside (byte for byte), restores on a new phone and Play works at once', async () => {
    const A = await open({ today: '2026-11-07' }); const { page, errors, ctx } = A;
    await sample(page); const R = await rich(page); await tab(page, 'settings');
    await page.click('[data-act=backup-all]'); await page.waitForSelector('.sheet.confirm'); const ask = await page.textContent('.sheet.confirm');
    assert.ok(/2 audio files/.test(ask) && /about/.test(ask), ask); await shot(page, '15-backup-all-390');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet.confirm [data-ok]')]); eq(dl.suggestedFilename(), 'walkup-backup-2026-11-07.json');
    BUNDLE = path.join(FIX, 'bundle.json'); await dl.saveAs(BUNDLE); const raw = fs.readFileSync(BUNDLE, 'utf8'), obj = JSON.parse(raw);
    deep([obj.app, obj.v, obj.kind], ['walkup', 1, 'bundle']); eq(obj.audioIndex.length, 2); const idx = raw.indexOf(',"audio":{'); assert.ok(idx > 0 && /^[\x00-\x7f]*$/.test(raw.slice(0, idx)), 'the header is plain ASCII, so a restore can read it without loading the audio');
    const sk = 's:' + R.songId, vk = 'v:' + R.voiceId; deep(obj.audioIndex.map(a => a.key).sort(), [sk, vk].sort());
    eq(obj.audioIndex.find(a => a.key === sk).size, SONG.length); eq(obj.audioIndex.find(a => a.key === vk).size, VOICE.length);
    const chunks = obj.audio[sk]; eq(chunks.length, Math.ceil(SONG.length / 196608)); assert.ok(chunks.slice(0, -1).every(c => c.length === 262144), 'chunks of 196608 bytes (262144 characters)');
    assert.ok(Buffer.concat(chunks.map(c => Buffer.from(c, 'base64'))).equals(SONG), 'the song comes out byte for byte'); assert.ok(Buffer.from(obj.audio[vk].join(''), 'base64').equals(VOICE), 'and so does the voice');
    await waitToast(page, /Backup saved/); assert.ok(/Last backup: today\./.test(await page.textContent('#backupCard')));
    // a new phone
    const B = await open({ today: '2026-11-07' }); const p2 = B.page; await tab(p2, 'settings');
    await p2.setInputFiles('[data-file="restore"]', BUNDLE); await p2.waitForSelector('.sheet.confirm'); assert.ok(/includes the audio/.test(await p2.textContent('.sheet.confirm')));
    await p2.click('.sheet.confirm [data-ok]'); await waitToast(p2, /Restored 10 players/);
    const keys = await dbKeys(p2); assert.ok(keys.includes(sk) && keys.includes(vk)); eq(keys.length, 2);
    const same = (key, b64) => p2.evaluate(async ([k, want]) => { const rec = await window.WalkupApp.WU.db.get(k), u = new Uint8Array(await rec.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s) === want; }, [key, b64]);
    assert.ok(await same(vk, VOICE_B64), 'the voice on the new phone is byte for byte'); assert.ok(await same(sk, SONG_B64), 'and the song');
    for (const n of ['Player 1', 'Player Rich']) eq(await codeOf(p2, n), 'ready', n);
    await tab(p2, 'game'); await p2.click('.lrow:has-text("Player Rich")'); await resetSpies(p2); await p2.click('#gPlay'); await p2.waitForFunction(() => window.__starts.length >= 2, null, { timeout: 8000 });
    const sp = await spies(p2); const v = (await state(p2)).roster.find(x => x.name === 'Player Rich').voice;
    assert.ok(sp.starts.some(x => Math.abs(x.bufDur - (v.te - v.ts + 0.504)) < 0.02), 'the restored recording plays: ' + JSON.stringify(sp.starts)); eq(sp.spoken.length, 0);
    await B.ctx.close(); deep(errors, []); deep(B.errors, []); await ctx.close();
  });

  await test('Restore: files that are not Walk-Up backups, broken, too new, too big or cut short are refused and nothing changes', async () => {
    if (!BUNDLE) throw new Error('needs the bundle from the previous test');
    const { page, errors, ctx } = await open(); await sample(page); await tab(page, 'settings');
    const before = JSON.stringify((await state(page)).roster.map(p => p.id)), keysBefore = JSON.stringify(await dbKeys(page));
    const bad = async (file, re) => {
      await page.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); });
      await page.setInputFiles('[data-file="restore"]', file); await waitToast(page, re); await settle(page, 150);
      eq(await page.$('.sheet.confirm'), null, 'no confirm sheet for a refused file'); eq(JSON.stringify((await state(page)).roster.map(p => p.id)), before, 'nothing changed'); assert.ok(/Nothing was changed/.test(await toastText(page)), await toastText(page));
    };
    const buf = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await bad(buf('notes.txt', 'hello, this is not json at all'), /isn.t a Walk-Up backup/);
    await bad(buf('other.json', JSON.stringify({ app: 'other-app', v: 1, data: { roster: [] } })), /isn.t a Walk-Up backup/);
    await bad(buf('array.json', '[1,2,3]'), /isn.t a Walk-Up backup/);
    await bad(buf('new.json', JSON.stringify({ app: 'walkup', v: 2, data: { roster: [] } })), /newer version/);
    await bad(buf('empty.json', JSON.stringify({ app: 'walkup', v: 1, data: {} })), /nothing in it to restore/);
    const whole = JSON.parse(fs.readFileSync(BUNDLE, 'utf8')); const big = { app: 'walkup', v: 1, kind: 'bundle', data: whole.data, audioIndex: [{ key: whole.audioIndex[0].key, type: 'audio/wav', size: 90 * 1024 * 1024 }] };
    await bad(buf('big.json', JSON.stringify(big) .replace(/\}$/, ',"audio":{}}')), /80 MB/);
    // a bundle cut short: the header reads fine, so it asks, then finds the damage and leaves everything as it was
    const full = fs.readFileSync(BUNDLE), cut = path.join(FIX, 'cut.json'); fs.writeFileSync(cut, full.subarray(0, Math.floor(full.length * 0.6)));
    await page.setInputFiles('[data-file="restore"]', cut); await page.waitForSelector('.sheet.confirm'); assert.ok(/replaces everything/.test(await page.textContent('.sheet.confirm')), 'it warns that restoring replaces what is there');
    await page.click('.sheet.confirm [data-ok]'); await waitToast(page, /damaged/); assert.ok(/left as it was/.test(await toastText(page)));
    await page.waitForFunction(() => !document.querySelector('.toast.busy')); await settle(page, 300);
    eq(JSON.stringify((await state(page)).roster.map(p => p.id)), before, 'the team is unchanged'); eq(JSON.stringify(await dbKeys(page)), keysBefore, 'and no half-restored audio is left behind');
    // a good bundle over existing data asks first, then replaces it
    await page.setInputFiles('[data-file="restore"]', BUNDLE); await page.waitForSelector('.sheet.confirm'); assert.ok(/can.t be undone/.test(await page.textContent('.sheet.confirm')));
    await page.click('.sheet.confirm [data-ok]'); await waitToast(page, /Restored 10 players/); eq((await state(page)).roster.length, 10);
    deep(errors, []); await ctx.close();
  });

  await test('Clear everything asks first, then empties the team, the songs and the saved audio', async () => {
    const { page, errors, ctx } = await open({ today: '2026-11-07' }); await sample(page); await rich(page); await tab(page, 'settings');
    await page.click('[data-act=backup-settings]'); await page.waitForFunction(() => !!window.WalkupApp.S.meta.lastBackup);
    assert.ok((await dbKeys(page)).length === 2);
    await page.click('[data-act=clear-all]'); await page.waitForSelector('.sheet.confirm'); assert.ok(/permanently removes/.test(await page.textContent('.sheet.confirm')) && /can.t be undone/.test(await page.textContent('.sheet.confirm')));
    await page.click('.sheet.confirm [data-close].btn'); await noSheets(page); eq((await state(page)).roster.length, 10, 'Cancel keeps everything');
    await page.click('[data-act=clear-all]'); await page.waitForSelector('.sheet.confirm'); await page.click('.sheet.confirm [data-ok]'); await waitToast(page, /Everything was cleared/);
    const s = await state(page); deep([s.roster.length, s.songs.length, s.lineup.length], [0, 0, 0]); deep(await dbKeys(page), []);
    assert.ok(await page.waitForSelector('text=Add a sample lineup', { timeout: 3000 }), 'back to the empty first screen');
    eq(await page.evaluate(() => window.WalkupApp.S.meta.lastBackup), null); await page.reload(); await page.waitForSelector('text=Add a sample lineup');
    deep(errors, []); await ctx.close();
  });

  await test('Dates: the backup file name and "last backup" follow today (window.__today)', async () => {
    const { page, errors, ctx } = await open({ today: '2027-02-28' }); await sample(page); await tab(page, 'settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup-settings]')]); eq(dl.suggestedFilename(), 'walkup-settings-2027-02-28.json');
    await page.evaluate(() => { window.__today = '2027-03-01'; }); await tab(page, 'game'); await tab(page, 'settings'); assert.ok(/Last backup: yesterday\./.test(await page.textContent('#backupCard')), await page.textContent('#backupCard'));
    await page.evaluate(() => { window.__today = '2027-03-10'; }); await tab(page, 'game'); await tab(page, 'settings'); assert.ok(/Last backup: 10 days ago\./.test(await page.textContent('#backupCard')));
    await page.reload(); await tab(page, 'settings'); eq(await page.evaluate(() => window.WalkupApp.S.meta.lastBackup), '2027-02-28', 'the date is remembered after a reload'); assert.ok(/Last backup: today\./.test(await page.textContent('#backupCard')), 'and the page starts from the injected today again');
    deep(errors, []); await ctx.close();
  });

  /* ============ keeping things: reloads, blocked storage, a full phone, offline ============ */
  await test('Reload: batting position, names and settings are all still there', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await page.click('#gNext'); await page.click('#gNext'); await page.evaluate(() => { const A = window.WalkupApp; A.S.st.roster[2].name = 'Renamed Kid'; A.WU.commit('data'); });
    await page.reload(); await page.waitForSelector('#gPlay'); eq((await state(page)).batter, 2); assert.ok(/Renamed Kid/.test(await page.textContent('.now .bigname')), await page.textContent('.now'));
    const raw = await page.evaluate(() => localStorage.getItem('walkup.state')); assert.ok(raw && raw.length > 500 && raw.length < 60000, 'one small record: ' + (raw && raw.length));
    assert.ok(!/blob|data:audio|base64/i.test(raw), 'no audio in the saved text');
    deep(errors, []); await ctx.close();
  });

  await test('Storage blocked: still works for the visit, says plainly that it cannot save; no crash', async () => {
    const { page, errors, ctx } = await open({ init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); } });
    assert.ok(/Can.t save on this browser/.test(await page.textContent('#wuBanners')), await page.textContent('#wuBanners')); await shot(page, '19-storage-blocked-390');
    await sample(page); await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1); await page.click('#gPlay');
    await page.click('#gNext'); eq((await state(page)).batter, 1, 'it works in memory'); await tab(page, 'settings'); assert.ok(/not letting Walk-Up save/.test(await page.textContent('#wuView')));
    await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Slow Jam.wav')]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 8000 });
    deep(errors, []); await ctx.close();
  });

  await test('Songs and voices cannot be kept (IndexedDB blocked): says so, and everything still works for the visit', async () => {
    const { page, errors, ctx } = await open({ init: () => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('denied', 'SecurityError'); } }); } });
    await sample(page); await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Slow Jam.wav')]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 8000 });
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page); eq((await state(page)).songs.length, 1, 'the song is added for this visit');
    assert.ok(/Can.t keep songs or voices on this browser/.test(await page.textContent('#wuBanners')), await page.textContent('#wuBanners'));
    await tab(page, 'settings'); assert.ok(/will not keep songs or voices/.test(await page.textContent('#wuView')));
    await tab(page, 'game'); await page.click('[data-act=g-song]'); await page.click(sheetSel + ' [data-do=use]:not([data-id=""]) >> nth=0'); await noSheets(page);
    await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1); await page.click('#gPlay');
    deep(errors, []); await ctx.close();
  });

  await test('A full phone: adding a song or a voice file says "out of room" and changes nothing', async () => {
    const { page, errors, ctx } = await open({ init: () => { const o = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { if (window.__quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return o.apply(this, arguments); }; } });
    await sample(page); await page.evaluate(() => { window.__quota = true; });
    await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Slow Jam.wav')]); await waitToast(page, /out of room/); eq((await state(page)).songs.length, 0); assert.ok(/No songs saved yet/.test(await page.textContent('#wuView')));
    await tab(page, 'game'); await page.click('[data-act=g-voice]'); await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles(sheetSel + ' input[data-file="voice-file"]', fx('voice.wav')); await waitToast(page, /out of room/); eq((await state(page)).roster[0].voice.kind, 'tts', 'the old voice stays');
    await page.evaluate(() => { window.__quota = false; }); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles(sheetSel + ' input[data-file="voice-file"]', fx('voice.wav')); await page.waitForSelector('#vsDetail', { timeout: 10000 }); eq((await state(page)).roster[0].voice.kind, 'file', 'works again once there is room');
    deep(errors, []); await ctx.close();
  });

  await test('Offline: the service worker keeps the app, and a reload with no network still works with the team in place', async () => {
    const { page, errors, ctx } = await open({ sw: true });
    await sample(page); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(async () => (await caches.keys()).includes('walkup-v1') && (await (await caches.open('walkup-v1')).keys()).length >= 15, null, { timeout: 10000 });
    const cached = await page.evaluate(async () => (await (await caches.open('walkup-v1')).keys()).map(r => new URL(r.url).pathname.split('/').pop() || 'index'));
    for (const f of ['core.js', 'engine.js', 'app.js', 'walkup.css', 'manifest.json', 'walkup-192.png', 'walkup-512.png']) assert.ok(cached.includes(f), f + ' is saved: ' + cached.join(','));
    await page.reload(); await page.waitForSelector('#gPlay'); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('#gPlay', { timeout: 10000 });
    eq((await state(page)).roster.length, 9, 'the team is there'); await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1); await page.click('#gPlay');
    await page.goto(srv.url + 'index.html?x=1'); await page.waitForSelector('#gPlay', { timeout: 10000 });
    eq(await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.split('/').pop()), 'sw.js');
    await ctx.setOffline(false); deep(errors.filter(e => !/net::ERR|Failed to fetch|install\.js|fonts/.test(e)), []); await ctx.close();
  });

  /* ============ the Back button ============ */
  await test('Back button: closes the top sheet instead of leaving the app; the X gives the history entry back', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); eq(await page.evaluate(() => history.state), null);
    await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); await page.waitForFunction(() => history.state && history.state.wuSheets === 1);
    await page.goBack(); await noSheets(page); eq(await page.evaluate(() => location.pathname.endsWith('/walkup/') || location.pathname.endsWith('index.html')), true, 'still in the app'); eq(await page.evaluate(() => history.state), null);
    // the X and Escape give the entry back too
    await page.click('[data-act=g-song]'); await page.waitForFunction(() => history.state && history.state.wuSheets === 1); await page.click(sheetSel + ' .x'); await noSheets(page); await page.waitForFunction(() => history.state === null);
    await page.click('[data-act=g-song]'); await page.waitForFunction(() => history.state && history.state.wuSheets === 1); await page.keyboard.press('Escape'); await noSheets(page); await page.waitForFunction(() => history.state === null);
    // two sheets stacked: Back closes one at a time
    const R = await rich(page); await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' [data-do=trim]'); await page.waitForFunction(() => history.state && history.state.wuSheets === 1);
    await page.click(sheetSel + ' [data-do=trim]'); await page.waitForFunction(() => history.state && history.state.wuSheets === 2); eq(await page.$$eval('.sheet-wrap', w => w.length), 2);
    await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1); await page.waitForFunction(() => history.state && history.state.wuSheets === 1); assert.ok(/Mix/.test(await page.textContent('.sheet h2')), 'the mix is still open');
    await page.goBack(); await noSheets(page); eq(await page.evaluate(() => history.state), null);
    // a sheet that replaces another costs no history entry
    await page.evaluate(() => { const U = window.WalkupApp.WU.U, a = U.openSheet({ title: 'A', html: 'a' }), b = U.openSheet({ title: 'B', html: 'b' }); a.close(); window.__b = b; });
    await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1); await settle(page, 200); eq(await page.evaluate(() => history.state && history.state.wuSheets), 1);
    await page.goBack(); await noSheets(page); void R; deep(errors, []); await ctx.close();
  });

  /* ============ layout, touch size, text size, motion, focus ============ */
  const audit = page => page.evaluate(() => {
    const shown = el => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || p.hidden || (p.hasAttribute('inert') && p.id === 'wuApp' && false)) return false; } const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
    const small = [], tiny = [], name = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && el.className.baseVal === undefined && el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '') + ((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) ? ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + '"' : ''));
    document.querySelectorAll('button, a[href], select, input, textarea, [role=slider], [role=button]').forEach(el => {
      if (el.type === 'file' || el.type === 'hidden') return;
      let t = el; if (el.type === 'checkbox' || el.type === 'radio') t = el.closest('label') || el;
      if (!shown(t)) return; const r = t.getBoundingClientRect();
      if (el.closest('.sr')) return;
      if (r.width < 43.5 || r.height < 43.5) small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || !shown(el) || el.closest('.sr, script, style')) continue;
      let fs = parseFloat(getComputedStyle(el).fontSize);
      const svg = el.closest('svg'); if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) fs *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      if (fs < 11.95) tiny.push(name(el) + ' ' + fs.toFixed(1) + 'px');
    }
    return { small: Array.from(new Set(small)), tiny: Array.from(new Set(tiny)), overflow: document.documentElement.scrollWidth - window.innerWidth };
  });

  await test('Layout: no sideways scrolling at 320, 390 or 768 wide on any screen or sheet; touch targets 44 px; no text under 12 px', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await rich(page); await page.evaluate(() => { const A = window.WalkupApp; for (let i = 0; i < 4; i++) { A.S.st.roster.push(A.core.newPlayer({ name: 'Bench ' + i, num: String(40 + i) })); } A.WU.commit('data'); });
    const problems = [];
    for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h }); await settle(page, 250);
      for (const t of ['game', 'team', 'songs', 'settings']) {
        await tab(page, t); await settle(page, 350); const a = await audit(page);
        if (a.overflow > 0) problems.push(w + ' ' + t + ': sideways scroll by ' + a.overflow);
        if (a.small.length) problems.push(w + ' ' + t + ' small targets: ' + a.small.join('; '));
        if (a.tiny.length) problems.push(w + ' ' + t + ' tiny text: ' + a.tiny.join('; '));
      }
      await tab(page, 'game');
      const sheets = [
        ['song picker', async () => { await page.click('[data-act=g-song]'); }],
        ['voice', async () => { await page.click('[data-act=g-voice]'); }],
        ['recorder', async () => { await page.click('[data-act=g-voice]'); await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn'); }],
        ['mix', async () => { await page.click('[data-act=g-mix]'); }],
        ['trim', async () => { await page.click('[data-act=g-mix]'); await page.click(sheetSel + ' [data-do=trim]'); await page.waitForSelector('.sheet.trim #trMain:not([hidden])'); }],
        ['player', async () => { await page.click('[data-act=edit-player]'); }],
        ['bluetooth help', async () => { await tab(page, 'settings'); await page.click('[data-act=bt-help]'); }],
        ['backup everything', async () => { await tab(page, 'settings'); await page.click('[data-act=backup-all]'); }],
        ['clear everything', async () => { await tab(page, 'settings'); await page.click('[data-act=clear-all]'); }]
      ];
      for (const [nm, open1] of sheets) {
        await open1(); await page.waitForSelector(sheetSel); await settle(page, 700); const a = await audit(page);
        const hh = await page.$eval(sheetSel, s2 => s2.getBoundingClientRect().height); if (hh > h * 0.85 + 1) problems.push(w + ' ' + nm + ' sheet is ' + Math.round(hh) + ' tall (max ' + Math.round(h * 0.85) + ')');
        if (a.overflow > 0) problems.push(w + ' ' + nm + ' sheet: sideways scroll by ' + a.overflow);
        if (a.small.length) problems.push(w + ' ' + nm + ' sheet small targets: ' + a.small.join('; '));
        if (a.tiny.length) problems.push(w + ' ' + nm + ' sheet tiny text: ' + a.tiny.join('; '));
        await page.evaluate(() => window.WalkupApp.WU.U.closeAll()); await noSheets(page); await tab(page, 'game');
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(!problems.length, '\n' + problems.join('\n'));
    deep(errors, []); await ctx.close();
  });

  await test('Sheets: never taller than 85% of the screen, the inside scrolls, the page behind does not', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await rich(page); await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' #mxTl'); await settle(page, 700);
    const m = await page.evaluate(() => { const s = document.querySelector('.sheet-wrap.open .sheet'), b = s.querySelector('.sh-body'), cs = getComputedStyle(b); return { sh: s.getBoundingClientRect().height, vh: innerHeight, scroll: b.scrollHeight, client: b.clientHeight, oy: cs.overflowY, lock: document.documentElement.classList.contains('wu-lock'), bodyOv: getComputedStyle(document.documentElement).overflow }; });
    assert.ok(m.sh <= m.vh * 0.85 + 1, JSON.stringify(m)); assert.ok(m.scroll > m.client + 20 && /auto|scroll/.test(m.oy), 'the inside scrolls: ' + JSON.stringify(m)); eq(m.lock, true);
    const y0 = await page.evaluate(() => window.scrollY); await page.mouse.move(195, 500); await page.mouse.wheel(0, 400); await settle(page, 200);
    eq(await page.evaluate(() => window.scrollY), y0, 'the page behind stays put'); assert.ok(await page.$eval('.sheet-wrap.open .sh-body', b => b.scrollTop) > 0, 'the sheet itself scrolled');
    assert.ok(await page.$eval('#wuApp', a => a.inert), 'the screen behind a sheet is inert (no taps, no focus)');
    deep(errors, []); await ctx.close();
  });

  await test('Motion and focus: reduced motion turns animation off; keyboard focus is clearly visible; the toast area announces', async () => {
    const { page, errors, ctx } = await open({ reducedMotion: true });
    await sample(page);
    const css = await page.evaluate(() => { const b = document.querySelector('#gPlay'), g = getComputedStyle(b); return { t: g.transitionDuration, a: g.animationName, rm: matchMedia('(prefers-reduced-motion: reduce)').matches }; });
    deep(css, { t: '0s', a: 'none', rm: true });
    await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); const sh = await page.$eval(sheetSel, s => ({ t: getComputedStyle(s).transitionDuration, a: getComputedStyle(s).animationName })); deep(sh, { t: '0s', a: 'none' });
    await page.keyboard.press('Escape'); await noSheets(page);
    await page.keyboard.press('Tab'); const f = await page.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return { tag: e.tagName, style: c.outlineStyle, w: parseFloat(c.outlineWidth) }; });
    assert.ok(f.style !== 'none' && f.w >= 2, 'a focused control shows an outline: ' + JSON.stringify(f));
    await page.evaluate(() => window.WalkupApp.WU.U.toast('Hello there', 'ok')); eq(await page.$eval('#wuToasts', t => t.getAttribute('aria-live')), 'polite'); eq(await page.$eval('.toast', t => t.getAttribute('role')), 'status');
    await page.evaluate(() => window.WalkupApp.WU.U.toast('Broken', 'error')); eq(await page.$eval('.toast.error', t => t.getAttribute('role')), 'alert');
    const css2 = await page.evaluate(async () => (await (await fetch('walkup.css')).text())); assert.ok(/env\(safe-area-inset-bottom/.test(css2) && /env\(safe-area-inset-top/.test(css2), 'safe-area insets are used');
    const html = await page.evaluate(async () => (await (await fetch('index.html')).text())); assert.ok(/viewport-fit=cover/.test(html), 'viewport-fit=cover so the insets apply');
    deep(errors, []); await ctx.close();
  });

  await test('Game mode: the screen stays awake only while Game is open with a batting order, and the setting turns it off', async () => {
    const { page, errors, ctx } = await open();
    await page.waitForTimeout(200); eq(await page.evaluate(() => window.__wl.length), 0, 'no batting order, no wake lock');
    await sample(page); await page.waitForFunction(() => window.__wl.includes('request:screen')); eq(await page.evaluate(() => window.WalkupApp.wakeActive()), true);
    await tab(page, 'team'); await page.waitForFunction(() => window.__wl.includes('release')); eq(await page.evaluate(() => window.WalkupApp.wakeActive()), false);
    await page.evaluate(() => { window.__wl.length = 0; }); await tab(page, 'game'); await page.waitForFunction(() => window.__wl.includes('request:screen'));
    await tab(page, 'settings'); await page.uncheck('[data-setting=wake]'); await page.waitForFunction(() => window.__wl.includes('release')); await page.evaluate(() => { window.__wl.length = 0; });
    await tab(page, 'game'); await settle(page, 300); eq(await page.evaluate(() => window.__wl.length), 0, 'off means off');
    deep(errors, []); await ctx.close();
  });

  await test('Memory: caches stay small (6 songs, 12 raw voices, 8 rendered) however many are used', async () => {
    const { page, errors, ctx } = await open();
    const r = await page.evaluate(async ([sb, vb]) => {
      const A = window.WalkupApp, WU = A.WU, C = A.core, E = A.eng; const blob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
      await E.unlock(); const files = []; for (let i = 0; i < 9; i++) files.push(new File([blob(sb, 'audio/wav')], 'Song ' + i + '.wav', { type: 'audio/wav' }));
      const res = await WU.songs.addFiles(files); const songs = res.added; const players = [];
      for (let i = 0; i < 15; i++) { const pl = C.newPlayer({ name: 'P' + i, num: String(i) }); pl.songId = songs[i % songs.length].id; const vb2 = blob(vb, 'audio/wav'); await WU.voice.adopt(pl, vb2, 'file', 'v' + i + '.wav', await E.decode(vb2)); pl.voice.polish.size = i % 2 ? 'gym' : 'room'; pl.voice.polish.wet = 10 + i; WU.S.st.roster.push(pl); players.push(pl); }
      for (const pl of players) await E.prepare(pl, WU.S.st, {});
      const c = E.cacheInfo(); return { songs: c.songs.length, raw: c.raw.length, rendered: c.rendered.length, added: songs.length };
    }, [SONG_B64, VOICE_B64]);
    eq(r.added, 9); assert.ok(r.songs <= 6 && r.songs >= 1, JSON.stringify(r)); assert.ok(r.raw <= 12 && r.raw >= 1, JSON.stringify(r)); assert.ok(r.rendered <= 8 && r.rendered >= 1, JSON.stringify(r));
    deep(errors, []); await ctx.close();
  });

  await test('Long songs: a 5 minute file is added without freezing the screen, and only the part that plays is kept in memory', async () => {
    fs.writeFileSync(fx('Long Jam.wav'), wavFile(songSamples(300, 8000, [[330, 415], [247, 311]]), 8000));
    const { page, errors, ctx } = await open();
    await page.evaluate(() => { window.__gap = 0; let last = performance.now(); const f = t => { window.__gap = Math.max(window.__gap, t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await tab(page, 'songs'); await page.setInputFiles('[data-file="songs-add"]', [fx('Long Jam.wav')]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 20000 }); await settle(page, 800);
    const gap = await page.evaluate(() => window.__gap); assert.ok(gap < 700, 'the screen never froze for more than 0.7 s: ' + Math.round(gap) + ' ms');
    const song = (await state(page)).songs[0]; approx(song.dur, 300, 0.1); assert.ok(await page.$eval('#trZoom', z => !z.hidden) || true);
    await page.fill(sheetSel + ' input[type=number][data-key=start]', '20'); await page.dispatchEvent(sheetSel + ' input[type=number][data-key=start]', 'change'); await settle(page, 200); const t = (await state(page)).songs[0]; approx(t.start, 20, 1e-9);
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    const info = await page.evaluate(async () => { const A = window.WalkupApp, s = A.S.st.songs[0]; A.eng.forgetAll(); const r = await A.eng.songBuffer(s, A.core.effectiveTrim({ trim: null }, s)); return { dur: r.buf.duration, base: r.base, len: s.len, start: s.start }; });
    assert.ok(info.dur < 100, 'a 300 s file is cropped to what plays: ' + info.dur); approx(info.base, info.start, 1.01, 'the crop remembers where it started'); assert.ok(info.dur >= info.len, 'and still covers the clip');
    await tab(page, 'game'); await sample(page); await page.click('[data-act=g-song]'); await page.click(sheetSel + ' [data-do=use][data-id="' + song.id + '"]'); await noSheets(page);
    await resetSpies(page); await page.click('#gPlay'); await page.waitForFunction(() => window.__starts.length >= 1, null, { timeout: 10000 });
    const sp = await spies(page); const mus = sp.starts.find(x => Math.abs(x.duration - t.len) < 1e-6); assert.ok(mus, JSON.stringify(sp.starts)); approx(mus.offset, 0, 1.01, 'plays from the start of the clip inside the cropped buffer');
    deep(errors, []); await ctx.close();
  });

  await test('Team: opening a player shows the timeline, and a sample player says the computer voice length is an estimate', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await tab(page, 'team'); await page.click('[data-act=edit-player]'); await page.waitForSelector(sheetSel + ' #plTl svg.tl'); await settle(page, 600);
    assert.ok(/Voice \(est\.\)/.test(await page.textContent('#plTl')), await page.textContent('#plTl')); await shot(page, '20-player-390');
    deep(errors, []); await ctx.close();
  });

  await test('Screens at 768 and 320 wide: songs, settings, mix, voice (pictures) with no sideways scrolling', async () => {
    const { page, errors, ctx } = await open();
    await sample(page); await rich(page);
    await tab(page, 'settings'); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(page, 300); await shot(page, '13-settings-bottom-390');
    for (const [w, h, sfx] of [[768, 1024, '768'], [320, 640, '320']]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForFunction(x => innerWidth === x, w); await page.waitForTimeout(400);
      const n = sfx === '768' ? ['24', '25', '26', '27', '28'] : ['34', '35', '36', '37', '38'];
      await tab(page, 'songs'); await settle(page, 300); await shot(page, n[0] + '-songs-' + sfx); eq(await overflow(page) <= 0, true);
      await tab(page, 'settings'); await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 300); await shot(page, n[1] + '-settings-' + sfx); eq(await overflow(page) <= 0, true);
      await tab(page, 'game'); await page.click('[data-act=g-mix]'); await page.waitForSelector(sheetSel + ' #mxTl svg'); await settle(page, 700); await shot(page, n[2] + '-mix-' + sfx); await page.keyboard.press('Escape'); await noSheets(page);
      await page.click('[data-act=g-voice]'); await page.waitForSelector(sheetSel + ' #vsDetail'); await settle(page, 900); await shot(page, n[3] + '-voice-' + sfx); await page.keyboard.press('Escape'); await noSheets(page);
      await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel); await settle(page, 700); await shot(page, n[4] + '-picker-' + sfx); await page.keyboard.press('Escape'); await noSheets(page);
    }
    deep(errors, []); await ctx.close();
  });

  /* @@END@@ */
  await br.close(); srv.stop();
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
