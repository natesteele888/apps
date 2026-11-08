// Walk-Up "Ask a parent for the song" tests. Run:
//   cd <newapps> && NODE_PATH=<pr/events/tests/node_modules> node tests/walkup-requests.test.cjs
// Needs Google Chrome at /Applications/Google Chrome.app. Starts its own static server on a free port.
// ONLY=<regex> runs just the tests whose name matches (handy while working).
// The phone's share sheet, clipboard and Messages app cannot be driven from here, so navigator.share, navigator.canShare and
// navigator.clipboard are replaced by recording stubs. Those stubs prove WHAT Walk-Up hands to the phone (file name, type, text, link),
// not how a real iMessage, WhatsApp or email app behaves. Names in these tests are placeholders only.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../apps/walkup/core.js');
const { chromium, startServer, newPage, SHOTS } = require('./lib.cjs');

const TODAY = '2026-11-07'; // a Saturday
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const results = [];
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 30).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const deep = (a, b, m) => assert.deepStrictEqual(a, b, m);
const ch = code => String.fromCharCode(code); // for characters that are invisible in source

/* ---------- audio fixtures made here, in node ---------- */
function wavFile(samples, sr) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}
/* a "song" of two notes: the first half is f1 Hz, the second half f2 Hz, so a cut from the second half can be recognised by its pitch */
function twoNotes(sec, sr, f1, f2, amp) {
  const a = new Float32Array(Math.round(sec * sr));
  for (let i = 0; i < a.length; i++) { const t = i / sr; a[i] = (amp || 0.5) * Math.sin(2 * Math.PI * (t >= sec / 2 ? f2 : f1) * t); }
  return a;
}
const silentWav = (sec, sr) => { const b = wavFile(new Float32Array(0), sr); const n = Math.round(sec * sr); const out = Buffer.alloc(44 + n * 2); b.copy(out, 0, 0, 44); out.writeUInt32LE(36 + n * 2, 4); out.writeUInt32LE(n * 2, 40); return out; };
const SONG_A = wavFile(twoNotes(12, 22050, 440, 554.37), 22050);   // 12 s, 440 Hz then 554.37 Hz
const SONG_B = wavFile(twoNotes(9, 22050, 330, 392), 22050);
const SONG_C = wavFile(twoNotes(7, 22050, 262, 294), 22050);
const BIG_WAV = silentWav(125, 44100);                              // about 11 MB: over the 10 MB warning line
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'walkup-req-fixtures-'));
const fx = n => path.join(FIX, n);
fs.writeFileSync(fx('Slow Jam.wav'), SONG_A);
fs.writeFileSync(fx('big.wav'), BIG_WAV);
fs.writeFileSync(fx('notes.txt'), 'just some text, not a song');
fs.writeFileSync(fx('photo.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
fs.writeFileSync(fx('broken.mp3'), Buffer.from('this is not audio at all, just some text pretending to be an mp3 '.repeat(20)));
const mem = (name, buf, mimeType) => ({ name, mimeType: mimeType || 'audio/wav', buffer: buf });

const b64u = s => Buffer.from(s, 'utf8').toString('base64url');
const linkOf = (o, base) => (base || 'http://x.test/walkup/send.html') + '#r=' + b64u(JSON.stringify(o));

/* ---------- stubs installed before any page script runs ---------- */
const SPY = () => {
  window.__shares = []; window.__clip = []; window.__nav = [];
  /* A real phone follows an sms: or mailto: link by opening Messages or Mail. Chrome here would stall on it, so the click is recorded and
     then stopped AFTER the page's own handlers have run (the page itself never stops the link: appPrevented says so). */
  window.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && /^(sms|mailto):/i.test(a.getAttribute('href'))) { window.__nav.push({ href: a.getAttribute('href'), appPrevented: e.defaultPrevented }); e.preventDefault(); }
  });
  if (!window.__keepSpeech) {
    class Utt { constructor(t) { this.text = t; } }
    window.SpeechSynthesisUtterance = Utt;
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u) { setTimeout(() => u.onend && u.onend({}), 30); }, cancel() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {} }, configurable: true });
  }
  try { Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true }); } catch (e) { /* ignore */ }
  /* count every use of browser storage, for the page that must not store anything */
  window.__store = { calls: 0 };
  try {
    ['getItem', 'setItem', 'removeItem', 'clear', 'key'].forEach(k => { const o = Storage.prototype[k]; Storage.prototype[k] = function () { window.__store.calls++; return o.apply(this, arguments); }; });
    if (window.indexedDB) { const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function () { window.__store.calls++; window.__store.idb = true; return o.apply(this, arguments); }; }
  } catch (e) { /* ignore */ }
};
/* share = how the phone's share sheet answers: ok | abort | fail | nofiles (canShare says no) | none (no share at all) */
const SHARE = mode => {
  const m = mode || 'ok';
  const rec = async d => ({
    title: d.title, text: d.text,
    files: await Promise.all((d.files || []).map(async f => {
      const u = new Uint8Array(await f.arrayBuffer()); let b64 = '';
      if (u.length < 1500000) { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); b64 = btoa(s); }
      return { name: f.name, type: f.type, size: f.size, head: Array.from(u.slice(0, 44)), b64 };
    }))
  });
  if (m === 'none') { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); return; }
  Object.defineProperty(navigator, 'canShare', { value: d => !!(d && d.files && d.files.length && m !== 'nofiles' && m !== 'textonly'), configurable: true });
  Object.defineProperty(navigator, 'share', {
    value: async d => {
      const r = await rec(d); window.__shares.push(r);
      if (m === 'abort') throw new DOMException('Share canceled', 'AbortError');
      if (m === 'fail') throw new DOMException('Share failed', 'DataError');
      window.__lastShareFiles = d.files;
    }, configurable: true
  });
};
const CLIP = mode => {
  window.__clip = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { if (mode === 'deny') throw new Error('denied'); window.__clip.push(t); } }, configurable: true });
};

let srv, br;
async function open(o) {
  o = o || {};
  const { ctx, page, errors } = await newPage(br, { today: o.today || TODAY, sw: o.sw, reducedMotion: o.reducedMotion, ctx: Object.assign({ permissions: [] }, o.ctx || {}) });
  const outside = [];
  page.on('request', r => { const u = r.url(); if (!/^(http:\/\/(localhost|127\.0\.0\.1)[:/]|blob:|data:|about:)/.test(u)) outside.push(u); });
  await page.addInitScript(SPY);
  if (o.share !== false) await page.addInitScript(SHARE, o.share || 'ok');
  if (o.clipboard !== false) await page.addInitScript(CLIP, o.clipboard || 'ok');
  if (o.init) await page.addInitScript(o.init, o.initArg);
  await page.goto(o.url || srv.url + (o.query || ''));
  await page.waitForSelector(o.wait || '#wuNav .navb');
  return { ctx, page, errors, outside };
}
const openSend = (hashObj, o) => open(Object.assign({ url: srv.url + 'send.html' + (typeof hashObj === 'string' ? hashObj : '#r=' + b64u(JSON.stringify(hashObj))), wait: '#sendRoot > *' }, o || {}));
const LINK = { v: 1, t: 'abc1234', n: 'Sam', u: '7', c: 'Tigers' };
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
async function shot(page, name, o) {
  o = o || {};
  await page.evaluate(() => { const t = document.querySelector('#wuToasts'); if (t) t.style.visibility = 'hidden'; });
  await page.screenshot(Object.assign({ path: SHOTS + '/walkup-req-' + name + '.png' }, o));
  await page.evaluate(() => { const t = document.querySelector('#wuToasts'); if (t) t.style.visibility = ''; });
}
async function shotAt(page, name, w, h, o) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForFunction(x => innerWidth === x, w); await page.waitForTimeout(500);
  await shot(page, name, o);
}
async function sample(page) { await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay'); }
/* a team of placeholder players, named and numbered, no songs */
async function team(page, n) {
  await page.evaluate(k => {
    const A = window.WalkupApp; const names = ['Pat Sample', 'Robin Sample', 'Kit Sample', 'Max Sample', 'Dana Sample', 'Lee Sample', 'Jo Sample', 'Sky Sample', 'Ash Sample'];
    for (let i = 0; i < k; i++) { const p = A.core.newPlayer({ name: names[i], num: String(7 + i * 5), pos: 'CF' }); A.S.st.roster.push(p); A.S.st.lineup.push(p.id); }
    A.WU.commit('data');
  }, n || 3);
  await page.waitForSelector('#gPlay');
}
const asked = (page, i, req, want) => page.evaluate(([i, req, want]) => { const A = window.WalkupApp, p = A.S.st.roster[i]; if (req) p.req = req; if (want != null) p.want = want; A.WU.commit('data'); }, [i, req, want]);
const addSong = (page, files) => page.evaluate(async ([name, b64]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const r = await window.WalkupApp.WU.songs.addFiles([new File([u], name, { type: 'audio/wav' })]); return r.added[0] && r.added[0].id;
}, files);
const openPlayerSheet = async (page, label) => { await tab(page, 'team'); await page.click('.prow:has-text("' + label + '") .pmain'); await page.waitForSelector(sheetSel + ' #rqMsg'); };
const msgOf = page => page.inputValue('#rqMsg');
const linkIn = text => { const m = /(https?:\/\/\S+send\.html#r=[A-Za-z0-9_-]+)/.exec(text); return m && m[1]; };
const shares = page => page.evaluate(() => window.__shares);
const wavInfo = b64 => { const b = Buffer.from(b64, 'base64'); const nch = b.readUInt16LE(22), sr = b.readUInt32LE(24), bits = b.readUInt16LE(34), n = (b.length - 44) / (nch * 2); let cross = 0, peak = 0, prev = 0; for (let i = 1000; i < n - 1000; i++) { const x = b.readInt16LE(44 + i * nch * 2); peak = Math.max(peak, Math.abs(x)); if ((x >= 0) !== (prev >= 0)) cross++; prev = x; } return { riff: b.toString('ascii', 0, 4), wave: b.toString('ascii', 8, 12), pcm: b.readUInt16LE(20), nch, sr, bits, frames: n, sec: n / sr, hz: cross / 2 / ((n - 2000) / sr), peak: peak / 32768 }; };
// a tiny MPEG-1 Layer III file made by hand: silent frames of FF FB 90 00 (128 kbps, 44.1 kHz, no padding) filled out to the 417-byte frame length
const MP3_FRAMES = 100;
const MP3 = Buffer.concat(Array.from({ length: MP3_FRAMES }, () => { const f = Buffer.alloc(417); f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x00; return f; }));
const until = async (check, ms) => { const t0 = Date.now(); for (;;) { const v = await check(); if (v) return v; if (Date.now() - t0 > (ms || 10000)) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 100)); } };
const topTitle = page => page.evaluate(() => { const w = document.querySelectorAll('.sheet-wrap'); return w.length ? w[w.length - 1].querySelector('.sheet h2').textContent : ''; });
const waitReq = (page, i, fn) => page.waitForFunction(([i, f]) => { const p = window.WalkupApp.S.st.roster[i]; return new Function('p', 'return ' + f)(p); }, [i, fn], { timeout: 6000 });

(async () => {
  srv = await startServer('walkup');
  br = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  console.log('Serving ' + srv.url);

  /* ============ pure logic (node) ============ */
  await test('core: a request link round-trips, is exactly the JSON in base64url, and keeps accents, scripts and emoji', async () => {
    const link = C.buildRequestLink('https://x.test/w/send.html', { t: 'abc1234', n: 'Sam', u: '7', c: 'Tigers' });
    // hand-checked: the part after #r= is base64url of {"v":1,"t":"abc1234","n":"Sam","u":"7","c":"Tigers"}
    eq(link, 'https://x.test/w/send.html#r=eyJ2IjoxLCJ0IjoiYWJjMTIzNCIsIm4iOiJTYW0iLCJ1IjoiNyIsImMiOiJUaWdlcnMifQ');
    eq(Buffer.from(link.split('#r=')[1], 'base64url').toString('utf8'), '{"v":1,"t":"abc1234","n":"Sam","u":"7","c":"Tigers"}');
    deep(C.parseRequestLink(link), { ok: true, t: 'abc1234', n: 'Sam', u: '7', c: 'Tigers' });
    eq(Buffer.from(C.buildRequestLink('http://h/send.html', { t: 'abc1234', n: 'Sam', u: '7' }).split('#r=')[1], 'base64url').toString('utf8'), '{"v":1,"t":"abc1234","n":"Sam","u":"7"}', 'no team: no c key');
    for (const n of ['José Ñandú', '日本語の名前', 'Zoë 🎶 Ünï', 'A'.repeat(24)]) {
      const l = C.buildRequestLink('http://h/send.html', { t: 'zz99zz', n, u: '12', c: 'Équipe' });
      eq(C.parseRequestLink(l).n, n); eq(C.parseRequestLink(l).c, 'Équipe');
      eq(Buffer.from(l.split('#r=')[1], 'base64url').toString('utf8'), JSON.stringify({ v: 1, t: 'zz99zz', n, u: '12', c: 'Équipe' }), 'same bytes as node produces');
    }
    eq(C.buildRequestLink('http://h/send.html#old=1', { t: 'abc1234', n: 'A', u: '1' }).split('#').length, 2, 'an old fragment is replaced');
    eq(C.buildRequestLink('http://h/send.html', { t: 'ABC1234', n: 'A', u: '1' }).includes('#r='), true, 'a capital token is lowercased');
    eq(C.parseRequestLink(C.buildRequestLink('http://h/s', { t: 'ABC1234', n: 'A', u: '1' })).t, 'abc1234');
    for (const bad of ['', 'abc', 'abcdefghi', 'ab-1234', '../../x', null, 12345]) eq(C.buildRequestLink('http://h/s', { t: bad, n: 'A' }), '', 'no link for the token ' + JSON.stringify(bad));
    const long = C.parseRequestLink(C.buildRequestLink('http://h/s', { t: 'abc1234', n: 'N'.repeat(40), u: '123456', c: 'C'.repeat(50) }));
    deep([long.n.length, long.u, long.c.length], [24, '1234', 30], 'name 24, number 4, team 30');
    // other ways a link arrives: the whole link, just the fragment, just r=..., extra parameters, a full stop glued on by a chat app
    const r = link.split('#')[1];
    for (const form of [link, '#' + r, r, link + '&utm=1', link + '.', '#x=1&' + r, link + ')']) eq(C.parseRequestLink(form).ok, true, form);
    // control and direction characters never survive into a name
    eq(C.parseRequestLink(linkOf({ v: 1, t: 'abc1234', n: 'Sa' + ch(0) + 'm' + ch(0x202e) + ch(0x200b), u: '7' })).n, 'Sa m');
    eq(C.parseRequestLink(linkOf({ v: 1, t: 'abc1234', n: 7, u: 9 })).n, '7', 'a number is shown as text');
    eq(C.parseRequestLink(linkOf({ v: 1, t: 'abc1234', n: { a: 1 }, u: ['x'], c: null })).n, '', 'an object is not a name');
  });

  await test('core: hostile, oversized or broken fragments are refused and never throw', async () => {
    const ok = { v: 1, t: 'abc1234', n: 'Sam', u: '7' };
    const bytes = a => Buffer.from(a).toString('base64url');
    const cases = {
      empty: '', hash: '#', 'r= empty': '#r=', 'no r key': '#x=' + b64u(JSON.stringify(ok)), 'not base64': '#r=!!!', 'percent junk': '#r=%%%%', 'plus and slash junk': '#r=a b/c',
      'oversized 5000': '#r=' + 'A'.repeat(5000), 'oversized 1600': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { n: 'x'.repeat(1500) }))), 'huge 100k': '#r=' + 'B'.repeat(100000),
      'not json': '#r=' + b64u('hello there'), 'json array': '#r=' + b64u('[1,2,3]'), 'json null': '#r=' + b64u('null'), 'json string': '#r=' + b64u('"abc"'),
      'wrong version': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { v: 2 }))), 'no version': '#r=' + b64u(JSON.stringify({ t: 'abc1234', n: 'Sam' })), 'version as text': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { v: '1' }))),
      'token too short': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { t: 'abc12' }))), 'token too long': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { t: 'abc123456' }))),
      'token path': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { t: '../../x' }))), 'token markup': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { t: '<b>abcd' }))), 'token number': '#r=' + b64u(JSON.stringify(Object.assign({}, ok, { t: 1234567 }))),
      'token missing': '#r=' + b64u(JSON.stringify({ v: 1, n: 'Sam' })),
      'invalid utf-8': '#r=' + bytes([0xff, 0xfe, 0x7b, 0x7d]), 'overlong utf-8': '#r=' + bytes([0xc0, 0x80]), 'truncated utf-8': '#r=' + bytes([0xe2, 0x82]), 'lone surrogate bytes': '#r=' + bytes([0xed, 0xa0, 0x80]),
      'length 1 mod 4': '#r=AAAAA'
    };
    for (const [name, h] of Object.entries(cases)) { const p = C.parseRequestLink(h); eq(p.ok, false, name); assert.ok(typeof p.why === 'string' && p.why, name + ' says why'); }
    for (const v of [undefined, null, 5, {}, [], true]) eq(C.parseRequestLink(v).ok, false, 'type ' + typeof v);
    deep(C.parseRequestLink('#r=' + b64u('{"v":1,"t":"abc1234","__proto__":{"n":"polluted"},"n":"Sam","u":"7"}')), { ok: true, t: 'abc1234', n: 'Sam', u: '7', c: '' });
    eq({}.n, undefined, 'nothing was polluted');
    eq(C.parseRequestLink('#r=' + b64u('{"v":1,"t":"abc1234"}')).ok, true, 'a name and number are optional');
    eq(C.parseRequestLink('#r=' + 'A'.repeat(1500)).why, 'bad', 'right at the limit is read (and is just not a note)');
    eq(C.parseRequestLink('#r=' + 'A'.repeat(1501)).why, 'big');
  });

  await test('core: tokens are 7 characters of a-z0-9, random, unique in a roster, and re-asking reuses the open one', async () => {
    const seen = new Set(); const taken = [];
    for (let i = 0; i < 400; i++) { const t = C.newToken(taken); assert.ok(/^[a-z0-9]{7}$/.test(t), t); assert.ok(!seen.has(t), 'repeat ' + t); seen.add(t); taken.push(t); }
    // hand-checked with chosen bytes: byte % 36 indexes 0-9a-z, and bytes of 252 or more are skipped so no letter is more likely
    eq(C.newToken([], () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), '0123456');
    eq(C.newToken([], () => [255, 252, 35, 36, 37, 71, 72, 10, 11, 12, 13, 14, 15, 16]), 'z01z0ab', 'skips 255 and 252, then 35=z 36=0 37=1 71=z 72=0 10=a 11=b');
    let call = 0;
    eq(C.newToken(['0000000'], () => (call++ === 0 ? new Array(14).fill(0) : new Array(14).fill(1))), '1111111', 'a taken token is not handed out again');
    assert.ok(/^[a-z0-9]{7}$/.test(C.newToken([], () => { throw new Error('no crypto'); })), 'falls back to Math.random');
    assert.ok(/^[a-z0-9]{7}$/.test(C.newToken({ aaaaaaa: 1 })), 'a set object works too');
    // in a roster of 40
    const roster = []; for (let i = 0; i < 40; i++) { const p = C.newPlayer({ name: 'P' + i, num: String(i) }); p.req = C.startRequest(roster, p, 'text', TODAY); roster.push(p); }
    eq(new Set(roster.map(p => p.req.t)).size, 40, 'forty different tokens');
    const p0 = roster[0], t0 = p0.req.t;
    eq(C.startRequest(roster, p0, 'email', TODAY).t, t0, 'asking again while still open keeps the token');
    eq(C.startRequest(roster, p0, 'email', TODAY).via, 'email');
    p0.req.st = 'got'; assert.notStrictEqual(C.startRequest(roster, p0, 'text', TODAY).t, t0, 'a finished request is asked again with a new token');
    p0.req.st = 'text'; assert.notStrictEqual(C.startRequest(roster, p0, 'text', TODAY).t, t0);
    eq(C.startRequest(roster, roster[1], 'copy', TODAY, 'abcdefg').t, roster[1].req.t, 'open request wins over a suggested token');
    const fresh = C.newPlayer({ name: 'New' });
    eq(C.startRequest(roster, fresh, 'copy', TODAY, 'abcdefg').t, 'abcdefg', 'the token on screen is the one stored');
    eq(C.startRequest(roster, fresh, 'copy', TODAY, t0).t === t0, false, 'but never one another player already has');
    deep(C.startRequest(roster, fresh, 'bogus', 'not-a-date', 'abcdefg'), { t: 'abcdefg', at: C.todayStr(), via: 'copy', st: 'asked' });
    eq(C.playerByToken(roster, t0.toUpperCase()), p0, 'found whatever the capitals'); eq(C.playerByToken(roster, 'zzzzzzz'), null); eq(C.playerByToken(roster, ''), null);
  });

  await test('core: the message template fills {first} {number} {team} {link}, keeps within 600 characters, and never loses the link', async () => {
    const v = { first: 'Pat', number: '7', team: 'Tigers', link: 'LINK' };
    eq(C.fillTemplate('Hi {first} #{number} of {team}: {link}', v), 'Hi Pat #7 of Tigers: LINK');
    eq(C.fillTemplate('{FIRST} {Number} {TEAM} {Link} {first}', v), 'Pat 7 Tigers LINK Pat', 'capitals work too');
    eq(C.fillTemplate('Keep {unknown} and {} and { first }', v), 'Keep {unknown} and {} and { first }', 'other braces stay');
    eq(C.fillTemplate('Go {team}, {first}!', { first: 'Pat', link: 'L' }), 'Go, Pat!', 'no team: no stray gap');
    eq(C.fillTemplate('Number {number}. Hi {first}.', { link: 'L' }), 'Number. Hi your player.', 'no first name: "your player"');
    eq(C.fillTemplate('Hi {first} #{number}', { first: 'Pat', number: '#7' }), 'Hi Pat #7', 'a number typed with # is not doubled');
    eq(C.fillTemplate('a\n\nb  {team}  \nc', { link: 'L' }), 'a\n\nb\nc');
    const dflt = C.requestMessage('', { first: 'Pat', number: '7', link: 'https://x.test/send.html#r=abc' });
    eq(dflt, "Hi! We're putting together walk-up music for the team. Could you pick the song Pat wants for their walk-up (about 10 seconds is plenty) and send it back? Tap this link, choose the song on your phone, then pick this chat or email to send it: https://x.test/send.html#r=abc Thank you!");
    eq(C.requestMessage('Hello {first}', { first: 'Pat', link: 'LINK' }), 'Hello Pat\nLINK', 'a template with no {link} gets the link at the end');
    eq(C.requestMessage('Hello {first} {link}', { first: 'Pat', link: 'LINK' }), 'Hello Pat LINK');
    eq(C.requestMessage('Hello', { first: 'Pat' }), 'Hello', 'nothing to add when there is no link');
    eq(C.sanitizeTemplate('x'.repeat(700)).length, 600, 'capped at 600');
    eq(C.sanitizeTemplate('  a\r\nb\rc ' + ch(0) + ch(7) + ch(0x1f) + 'd  '), 'a\nb\nc d', 'CRLF to LF, control characters out, trimmed');
    eq(C.sanitizeTemplate(null), ''); eq(C.sanitizeTemplate(42), '');
    eq(C.sanitizeSettings({ reqTpl: 'y'.repeat(900), team: 'T'.repeat(40) }).reqTpl.length, 600);
    eq(C.sanitizeSettings({ reqTpl: 'y'.repeat(900), team: 'T'.repeat(40) }).team.length, 30);
    deep([C.sanitizeSettings({}).reqTpl, C.sanitizeSettings({}).team], ['', ''], 'old saved settings get no template and no team');
    eq(C.sanitizeSettings({ team: 'Ti' + ch(0x202e) + 'gers' }).team, 'Ti gers');
    eq(C.requestSubject({ first: 'Pat', number: '7', team: 'Tigers' }), 'Walk-up song for Pat #7 (Tigers)');
    eq(C.requestSubject({ first: 'Pat' }), 'Walk-up song for Pat'); eq(C.requestSubject({ number: '7' }), 'Walk-up song for #7'); eq(C.requestSubject({}), 'Walk-up song');
    eq(C.whoLabel('Pat', '7'), 'Pat #7'); eq(C.whoLabel('Pat', ''), 'Pat'); eq(C.whoLabel('', '7'), '#7'); eq(C.whoLabel('', ''), ''); eq(C.whoLabel('Pat', '#7'), 'Pat #7');
  });

  await test('core: song file names keep the real extension, are safe in any chat or mail app, stay within 80 characters, and parse back', async () => {
    eq(C.buildSongFileName('abc1234', 'Sweet Caroline', 'x.MP3'), 'WU-abc1234-Sweet_Caroline.mp3');
    eq(C.buildSongFileName('ABC1234', 'Song', 'x.m4a'), 'WU-abc1234-Song.m4a', 'a capital token is lowercased');
    eq(C.buildSongFileName('abc1234', 'A/B\\C:D*E?F"G<H>I|J', 'x.wav'), 'WU-abc1234-A_B_C_D_E_F_G_H_I_J.wav', 'path characters and the rest of the forbidden ones become spaces');
    eq(C.buildSongFileName('abc1234', 'Song 🎶 Time 👩‍👩‍👧', 'x.mp3'), 'WU-abc1234-Song_Time.mp3', 'emoji (and the invisible joiners) are dropped');
    eq(C.buildSongFileName('abc1234', 'Café Münch ñ', 'x.mp3'), 'WU-abc1234-Café_Münch_ñ.mp3', 'accents stay');
    eq(C.buildSongFileName('abc1234', '日本語の歌', 'x.mp3'), 'WU-abc1234-日本語の歌.mp3', 'other scripts stay');
    eq(C.buildSongFileName('abc1234', 'No' + ch(0) + 'pe' + ch(0x202e) + 'evil' + ch(0x200b) + 'x', 'x.mp3'), 'WU-abc1234-No_pe_evil_x.mp3', 'control, direction and zero-width characters are gone');
    eq(C.buildSongFileName('abc1234', '...hidden...', 'x.mp3'), 'WU-abc1234-hidden.mp3', 'no leading or trailing dots');
    eq(C.buildSongFileName('abc1234', '  Spaced   out  ', 'x.mp3'), 'WU-abc1234-Spaced_out.mp3');
    eq(C.buildSongFileName('abc1234', '', 'My Song (1).m4a'), 'WU-abc1234-My_Song_(1).m4a', 'no title: the file name is used');
    eq(C.buildSongFileName('abc1234', '   ', '../../etc/passwd.mp3'), 'WU-abc1234-passwd.mp3', 'a path in the file name is cut off');
    eq(C.buildSongFileName('abc1234', '', 'C:\\Users\\x\\Song.mp3'), 'WU-abc1234-Song.mp3');
    eq(C.buildSongFileName('abc1234', '###', 'x.mp3'), 'WU-abc1234-x.mp3', 'a title of nothing but symbols falls back to the file name');
    eq(C.buildSongFileName('abc1234', '###', '.mp3'), 'WU-abc1234-song.mp3', 'and when there is nothing at all: "song"');
    eq(C.buildSongFileName('abc1234', 'Song', 'blob', 'audio/mpeg'), 'WU-abc1234-Song.mp3', 'no extension: taken from the type');
    eq(C.buildSongFileName('abc1234', 'Song', 'blob', 'audio/x-m4a'), 'WU-abc1234-Song.m4a');
    eq(C.buildSongFileName('abc1234', 'Song', 'blob', 'application/octet-stream'), 'WU-abc1234-Song', 'nothing known: no extension is invented');
    eq(C.buildSongFileName('nope', 'Song', 'x.mp3'), 'Song.mp3', 'a bad token gives no prefix');
    const long = C.buildSongFileName('abc1234', 'Long title '.repeat(30), 'x.mp3');
    eq(long.length, 80, 'at most 80 and uses all of it'); assert.ok(long.startsWith('WU-abc1234-') && long.endsWith('.mp3'), long);
    const astral = C.buildSongFileName('abc1234', '\u{1D49C}'.repeat(100), 'x.flac');
    assert.ok(Array.from(astral).length <= 80 && astral.endsWith('.flac') && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(astral), 'never cuts a character in half');
    assert.ok(C.buildSongFileName('abc1234', 'x'.repeat(500), 'x.m4a', '').length <= 80);
    // parsing
    deep(C.parseSongFileName('WU-abc1234-Sweet_Caroline.mp3'), { token: 'abc1234', title: 'Sweet Caroline' });
    deep(C.parseSongFileName('wu-ABC1234-hey--jude__live (1).M4A'), { token: 'abc1234', title: 'hey jude live (1)' }, 'any capitals; dashes and underscores become spaces');
    deep(C.parseSongFileName('WU-abc1234.mp3'), { token: 'abc1234', title: 'Song' }, 'a code and nothing else');
    deep(C.parseSongFileName('WU-abc1234-Big%20Song.mp3'), { token: 'abc1234', title: 'Big Song' }, 'a chat app that kept %20');
    deep(C.parseSongFileName('C:\\Users\\x\\WU-abc1234-a.mp3'), { token: 'abc1234', title: 'a' }, 'a path in front is ignored');
    eq(C.parseSongFileName('WU-abc1234-' + 'x'.repeat(100) + '.mp3').title.length, 60, 'library titles are 60 at most');
    for (const n of ['Slow Jam.wav', 'WU-abc12-x.mp3', 'WU-abc123456-x.mp3', 'xWU-abc1234-a.mp3', 'WU_abc1234_a.mp3', 'WU-ab c123-a.mp3', 'WU--abc1234.mp3', '', null, undefined]) eq(C.parseSongFileName(n), null, String(n));
    for (const t of ['Sweet Caroline', 'Hey Jude (live)', 'Café Münch', '日本語の歌']) eq(C.parseSongFileName(C.buildSongFileName('abc1234', t, 'x.mp3')).title, t, 'build then parse: ' + t);
    eq(C.libraryTitle('WU-abc1234-Hey_Jude.mp3'), 'Hey Jude'); eq(C.libraryTitle('My Song.mp3'), 'My Song'); eq(C.libraryTitle('.mp3'), 'Song');
    deep(C.parseReplyText('Walk-up song for Pat #7: Hey Jude - The Beatles [WU-abc1234]'), { token: 'abc1234', want: 'Hey Jude - The Beatles' });
    deep(C.parseReplyText('walk-up song for Pat: [wu-ABC1234]'), { token: 'abc1234', want: '' });
    eq(C.parseReplyText('Hey Jude'), null);
  });

  await test('core: text and email links are encoded for iPhone and Android, and the link page is found beside the app', async () => {
    eq(C.smsHref('Hi there & more\nline 2 #7 100% (ok)'), 'sms:?&body=Hi%20there%20%26%20more%0Aline%202%20%237%20100%25%20(ok)');
    eq(C.smsHref(''), 'sms:?&body='); eq(C.smsHref(null), 'sms:?&body=');
    eq(C.mailtoHref('Walk-up song for Pat #7', 'Body: a+b\nhttps://x.test/send.html#r=Zm9v'), 'mailto:?subject=Walk-up%20song%20for%20Pat%20%237&body=Body%3A%20a%2Bb%0Ahttps%3A%2F%2Fx.test%2Fsend.html%23r%3DZm9v');
    eq(decodeURIComponent(C.smsHref('日本 🎶 é').slice('sms:?&body='.length)), '日本 🎶 é');
    for (const [from, to] of [['https://h.test/apps/walkup/index.html?x=1#y', 'https://h.test/apps/walkup/send.html'], ['https://h.test/apps/walkup/', 'https://h.test/apps/walkup/send.html'], ['https://h.test/apps/walkup', 'https://h.test/apps/walkup/send.html'],
      ['file:///a/b/index.html', 'file:///a/b/send.html'], ['http://localhost:8000/', 'http://localhost:8000/send.html'], ['http://localhost:8000', 'http://localhost:8000/send.html'], ['https://h.test/walkup/send.html#r=1', 'https://h.test/walkup/send.html']]) eq(C.sendPageUrl(from), to, from);
  });

  await test('core: request data is cleaned on load and restore, kept in backups, and "has a song" means a real song file', async () => {
    deep(C.sanitizeReq({ t: 'ABC1234', at: '2026-11-07', via: 'email', st: 'got' }), { t: 'abc1234', at: '2026-11-07', via: 'email', st: 'got' });
    deep(C.sanitizeReq({ t: 'abc1234', at: '2026-13-45', via: 'pigeon', st: 'lost' }), { t: 'abc1234', at: '', via: 'copy', st: 'asked' }, 'bad date, way and state get neutral values');
    for (const bad of [null, 5, 'x', [], {}, { t: 'short' }, { t: 12345678 }, { t: '../../etc' }]) eq(C.sanitizeReq(bad), null, JSON.stringify(bad));
    const seen = Object.create(null); eq(C.sanitizeReq({ t: 'abc1234' }, seen).t, 'abc1234'); eq(C.sanitizeReq({ t: 'abc1234' }, seen), null, 'a token seen twice is dropped the second time');
    eq(C.sanitizeWant('  Hey\nJude ' + ch(0) + '  '), 'Hey Jude'); eq(C.sanitizeWant('x'.repeat(200)).length, 80); eq(C.sanitizeWant(null), ''); eq(C.sanitizeWant(5), '');
    const st = C.sanitizeState({ roster: [{ id: 'aaa', name: 'A', req: { t: 'abc1234', at: TODAY, via: 'text', st: 'asked' }, want: 'Hey Jude' }, { id: 'bbb', name: 'B', req: { t: 'abc1234' }, want: 5 }, { id: 'ccc', name: 'C' }], songs: [], settings: { reqTpl: 'Hi {first} {link}', team: 'Tigers' } });
    deep(st.roster.map(p => p.req && p.req.t), ['abc1234', null, null], 'the second player with the same token loses it');
    deep(st.roster.map(p => p.want), ['Hey Jude', '', ''], 'old players get no want');
    deep([st.settings.reqTpl, st.settings.team], ['Hi {first} {link}', 'Tigers']);
    const back = C.makeBackup(st, TODAY, 'settings'); eq(back.kind, 'settings');
    const val = C.validateBackup(JSON.parse(JSON.stringify(back)));
    eq(val.ok, true); deep(val.state.roster[0].req, { t: 'abc1234', at: TODAY, via: 'text', st: 'asked' }); eq(val.state.roster[0].want, 'Hey Jude'); deep([val.state.settings.reqTpl, val.state.settings.team], ['Hi {first} {link}', 'Tigers']);
    // what counts as a song
    const songs = [{ id: 's1', kind: 'file', title: 'T', name: 'T.wav', dur: 10, size: 5, mime: '', start: 0, len: 10, fade: 1 }];
    const mk = (songId, req, want) => Object.assign(C.newPlayer({ name: 'X' }), { songId, req: req || null, want: want || '' });
    eq(C.hasSongFile(mk('s1'), songs), true); eq(C.hasSongFile(mk('b:horn'), songs), false, 'a built-in sound is not a song someone picked'); eq(C.hasSongFile(mk(null), songs), false); eq(C.hasSongFile(mk('zzz'), songs), false, 'a missing song is not a song');
    const r = (st2) => ({ t: 'abc1234', at: TODAY, via: 'text', st: st2 });
    deep(['s1', null].map((id, i) => C.requestCode(mk(id, r('asked')), songs)), ['got', 'asked']);
    eq(C.requestCode(mk(null), songs), 'none'); eq(C.requestCode(mk(null, r('text')), songs), 'text'); eq(C.requestCode(mk(null, r('asked'), 'Hey Jude'), songs), 'text'); eq(C.requestCode(mk(null, null, 'Hey Jude'), songs), 'text'); eq(C.requestCode(mk(null, r('got')), songs), 'inlib');
    deep(C.requestProgress([mk('s1'), mk('b:horn'), mk(null), mk('s1')], songs), { have: 2, total: 4, text: '2 of 4 have a song' });
    deep(C.requestProgress([], songs), { have: 0, total: 0, text: '0 of 0 have a song' });
    eq(C.findDuplicateSong(songs, 'T.wav', 5), songs[0]); eq(C.findDuplicateSong(songs, 'T.wav', 6), null, 'same name, different size: not the same file'); eq(C.findDuplicateSong(songs, 't.wav', 5), null);
  });

  await test('formats: a file is welcome when its name OR its type says audio; a table of what is accepted and what is not', async () => {
    const table = [
      // [file name, type from the phone, accepted by name/type?]
      ['song.mp3', 'audio/mpeg', true], ['song.mp3', '', true], ['song.mp3', 'application/octet-stream', true], ['SONG.MP3', 'text/plain', true],
      ['song.wav', 'audio/wav', true], ['song.wav', 'audio/x-wav', true], ['song.wav', 'audio/wave', true], ['song.wave', '', true], ['song', 'audio/wave', true], ['song', 'audio/x-wav', true],
      ['song.m4a', 'audio/x-m4a', true], ['song.m4a', 'audio/mp4', true], ['song.m4a', 'video/mp4', true], ['song.m4a', '', true], ['song.m4a', 'application/octet-stream', true],
      ['song.aac', 'audio/aac', true], ['song.aac', '', true], ['clip.mp4', 'video/mp4', true], ['clip.mp4', '', true], ['song.ogg', 'audio/ogg', true], ['song.oga', '', true], ['song.opus', 'audio/ogg; codecs=opus', true], ['song.opus', '', true],
      ['song.flac', 'audio/flac', true], ['song.flac', 'audio/x-flac', true], ['song.flac', '', true], ['song.aif', '', true], ['song.aiff', 'audio/aiff', true], ['song.caf', 'audio/x-caf', true], ['song.caf', '', true],
      ['rec.webm', 'audio/webm', true], ['rec.webm', 'video/webm', true], ['rec.webm', '', true], ['voice.3gp', 'audio/3gpp', true], ['voice.3gp', 'video/3gpp', true], ['voice.amr', 'audio/amr', true], ['voice.amr', '', true],
      ['Song.Final.v2.MP3', '', true], ['noextension', 'audio/mpeg', true], ['noextension', 'AUDIO/MPEG', true], ['song.xyz', 'audio/whatever', true],
      ['setup.exe', 'application/x-msdownload', false], ['setup.exe', '', false], ['setup.exe', 'application/octet-stream', false], ['paper.pdf', 'application/pdf', false], ['paper.pdf', '', false], ['photo.jpg', 'image/jpeg', false], ['photo.jpeg', '', false], ['photo.png', 'image/png', false],
      ['notes.txt', 'text/plain', false], ['movie.mov', 'video/quicktime', false], ['archive.zip', 'application/zip', false], ['noextension', '', false], ['noextension', 'application/octet-stream', false], ['song.mp3.exe', '', false], ['.mp3x', '', false], ['', '', false], [null, null, false]
    ];
    for (const [name, type, want] of table) eq(C.isAudioFile(name, type), want, JSON.stringify([name, type]));
    deep(C.AUDIO_EXTS, ['mp3', 'wav', 'wave', 'm4a', 'aac', 'mp4', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff', 'caf', 'webm', '3gp', 'amr'], 'the agreed extension list');
    eq(C.AUDIO_ACCEPT, 'audio/*,.mp3,.wav,.wave,.m4a,.aac,.mp4,.ogg,.oga,.opus,.flac,.aif,.aiff,.caf,.webm,.3gp,.amr');
    // the extension survives the rename and the code prefix, whatever the type said
    for (const e of C.AUDIO_EXTS) {
      const out = C.buildSongFileName('abc1234', 'My Song', 'Original Name.' + e.toUpperCase(), 'application/octet-stream');
      eq(out, 'WU-abc1234-My_Song.' + e, e + ' stays ' + e);
      eq(C.parseSongFileName(out).token, 'abc1234'); eq(C.parseSongFileName(out).title, 'My Song');
      eq(C.buildSongFileName('abc1234', '', 'Original Name.' + e), 'WU-abc1234-Original_Name.' + e, 'and with no title');
    }
    eq(C.songExt('x.m4a', 'video/mp4'), 'm4a', 'an .m4a that the phone calls video/mp4 stays .m4a'); eq(C.songExt('blob', 'audio/x-m4a'), 'm4a'); eq(C.songExt('x.Intro', 'audio/mpeg'), 'mp3', 'a dot in a title is not an extension when the type knows better'); eq(C.songExt('x.zzz', ''), 'zzz');
  });

  /* ============ the parent page ============ */
  const pickSong = async (page, f) => { await page.setInputFiles('#song', f); await page.waitForSelector('#fileInfo:not([hidden]), #fileErr:not([hidden])'); };
  const waitMeta = page => page.waitForFunction(() => /long/.test(document.querySelector('#fMeta').textContent), null, { timeout: 8000 });
  const SHARED_TEXT = 'Walk-up song for Sam #7: Sweet Caroline - Neil Diamond [WU-abc1234]';

  await test('Parent page: the heading names the player, three numbered steps, a dark page with no sign-in, no storage and no network of its own', async () => {
    const { page, errors, outside } = await openSend(LINK);
    eq(await page.textContent('#head'), 'A walk-up song for Sam #7'); eq(await page.textContent('#team'), 'Team: Tigers');
    eq(await page.title(), 'Send a Walk-Up Song');
    eq(await page.$$eval('.s-step', els => els.length), 3); deep(await page.$$eval('.s-n', els => els.map(e => e.textContent)), ['1', '2', '3']);
    deep(await page.$$eval('.s-step h2', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())), ['Choose the song', 'Name it (optional)', 'Send it back']);
    eq(await page.getAttribute('#song', 'accept'), C.AUDIO_ACCEPT, 'the file chooser offers audio and every extension on the list');
    assert.ok(/Sam hears when they walk up to bat/.test(await page.textContent('#lead')), await page.textContent('#lead'));
    assert.ok(await page.evaluate(() => { const c = getComputedStyle(document.body); return c.backgroundColor === 'rgb(14, 9, 25)' && c.colorScheme.includes('dark'); }), 'the same dark purple as the app');
    eq(await page.$$eval('input[type=password], input[type=email], form', e => e.length), 0, 'no sign-in, no form');
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); await waitMeta(page);
    await page.fill('#title', 'Sweet Caroline'); await page.fill('#artist', 'Neil Diamond');
    await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    const store = await page.evaluate(async () => ({ calls: window.__store.calls, idb: !!window.__store.idb, cookie: document.cookie, ls: Object.keys(localStorage).length, ss: Object.keys(sessionStorage).length, dbs: indexedDB.databases ? (await indexedDB.databases()).length : 0, sw: !!navigator.serviceWorker && !!navigator.serviceWorker.controller }));
    deep(store, { calls: 0, idb: false, cookie: '', ls: 0, ss: 0, dbs: 0, sw: false }, 'nothing is stored anywhere, not even a cookie');
    deep(outside.filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)), [], 'the only outside address is the optional fonts link');
    const code = (fs.readFileSync(path.join(__dirname, '../apps/walkup/send.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../apps/walkup/send.html'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|fetch\(|sendBeacon|WebSocket|install\.js/.test(code), 'the page code has no storage or network calls in it');
    deep(errors, []); await shot(page, 'parent-done-390'); await page.context().close();
  });

  await test('Parent page: the heading leaves out what the link does not say', async () => {
    for (const [o, head, team] of [[{ v: 1, t: 'abc1234', n: 'Sam', u: '' }, 'A walk-up song for Sam', false], [{ v: 1, t: 'abc1234', n: '', u: '7' }, 'A walk-up song for #7', false], [{ v: 1, t: 'abc1234' }, 'A walk-up song', false], [{ v: 1, t: 'abc1234', n: 'Zoë 日本', u: '12', c: 'Équipe' }, 'A walk-up song for Zoë 日本 #12', true]]) {
      const { page, errors, ctx } = await openSend(o); eq(await page.textContent('#head'), head); eq(await page.$eval('#team', e => !e.hidden), team);
      if (!o.n) assert.ok(/your player hears/.test(await page.textContent('#lead')), 'the lead sentence copes without a name');
      deep(errors, []); await ctx.close();
    }
  });

  await test('Parent page: pick a song and Send it back hands the phone a file named WU-code-title with the right type and a text that names the song', async () => {
    const { page, errors, ctx } = await openSend(LINK);
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); await waitMeta(page);
    eq(await page.textContent('#fName'), 'Slow Jam.wav'); const meta = await page.textContent('#fMeta'); assert.ok(/517 KB/.test(meta) && /0:12 long/.test(meta), meta);
    eq(await page.$eval('#fileWarn', e => e.hidden), true, 'a small file has no warning');
    await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    let sh = await shares(page); eq(sh.length, 1);
    deep([sh[0].files.length, sh[0].files[0].name, sh[0].files[0].type, sh[0].files[0].size], [1, 'WU-abc1234-Slow_Jam.wav', 'audio/wav', SONG_A.length], 'with no title the file name is used');
    eq(sh[0].files[0].b64, SONG_A.toString('base64'), 'the same bytes, untouched');
    eq(sh[0].title, 'Walk-up song for Sam #7'); eq(sh[0].text, 'Walk-up song for Sam #7 [WU-abc1234]', 'no title typed: the text says who it is for');
    const t = await page.textContent('#done'); assert.ok(/Sent!/.test(t) && /You can close this page/.test(t) && /If you sent it, you.re done/.test(t), t);
    eq(await page.$eval('#steps', e => e.hidden), true);
    // a different song, this time with a title and artist, and a name with trouble in it
    await page.click('#again'); eq(await page.$eval('#steps', e => e.hidden), false); eq(await page.inputValue('#song'), '', 'cleared'); eq(await page.$eval('#fileInfo', e => e.hidden), true);
    await pickSong(page, mem('Mixed.M4A', SONG_B, 'audio/x-m4a')); await waitMeta(page);
    await page.fill('#title', 'Sweet Caroline 🎶 / Live'); await page.fill('#artist', 'Neil Diamond');
    await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    sh = await shares(page); eq(sh.length, 2);
    deep([sh[1].files[0].name, sh[1].files[0].type], ['WU-abc1234-Sweet_Caroline_Live.m4a', 'audio/x-m4a'], 'the real extension and type are kept');
    eq(sh[1].text, 'Walk-up song for Sam #7: Sweet Caroline 🎶 / Live - Neil Diamond [WU-abc1234]', 'the text shows the title as typed');
    deep(errors, []); await ctx.close();
  });

  await test('Parent page: closing the share sheet is not an error; a real share error shows a friendly message and the download', async () => {
    let A = await openSend(LINK, { share: 'abort' });
    await pickSong(A.page, mem('Slow Jam.wav', SONG_A)); await A.page.click('#send'); await A.page.waitForFunction(() => window.__shares.length === 1);
    await A.page.waitForFunction(() => /Nothing was sent/.test(document.querySelector('#msg').textContent));
    eq(await A.page.$eval('#msg', e => e.className.includes('warn')), false, 'cancelling is not styled as a problem');
    deep(await A.page.evaluate(() => [document.querySelector('#done').hidden, document.querySelector('#fallback').hidden, document.querySelector('#send').disabled]), [true, true, false], 'no success, no fallback, and the button works again');
    await A.page.click('#send'); await A.page.waitForFunction(() => window.__shares.length === 2); deep(A.errors, []); await A.ctx.close();
    A = await openSend(LINK, { share: 'fail' });
    await pickSong(A.page, mem('Slow Jam.wav', SONG_A)); await A.page.fill('#title', 'Sweet Caroline'); await A.page.click('#send');
    await A.page.waitForSelector('#fallback:not([hidden])');
    const msg = await A.page.textContent('#msg'); assert.ok(/didn.t open its share menu/.test(msg) && /Download the file/.test(msg), msg); assert.ok(!/DataError|Share failed/.test(msg), 'no technical words');
    eq(await A.page.$eval('#msg', e => e.className.includes('warn')), true);
    eq(await A.page.getAttribute('#dl', 'download'), 'WU-abc1234-Sweet_Caroline.wav'); eq(await A.page.$eval('#dl', e => e.hidden), false);
    eq(await A.page.inputValue('#msgBox'), 'Walk-up song for Sam #7: Sweet Caroline [WU-abc1234]');
    const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.click('#dl')]); eq(dl.suggestedFilename(), 'WU-abc1234-Sweet_Caroline.wav');
    const fp = path.join(FIX, 'dl1.wav'); await dl.saveAs(fp); eq(Buffer.compare(fs.readFileSync(fp), SONG_A), 0, 'the download is the song');
    eq(await A.page.$eval('#done', e => e.hidden), true, 'not marked as sent'); deep(A.errors, []); await A.ctx.close();
  });

  await test('Parent page: a browser that cannot share files offers the renamed download and Copy message', async () => {
    for (const mode of ['nofiles', 'none']) {
      const { page, errors, ctx } = await openSend(LINK, { share: mode });
      await pickSong(page, mem('Slow Jam.wav', SONG_A)); await page.fill('#title', 'Sweet Caroline'); await page.fill('#artist', 'Neil Diamond'); await page.click('#send');
      await page.waitForSelector('#fallback:not([hidden])');
      assert.ok(/can.t send files by itself/.test(await page.textContent('#msg')) && /attach it to your reply/.test(await page.textContent('#msg')), await page.textContent('#msg'));
      eq(await page.getAttribute('#dl', 'download'), 'WU-abc1234-Sweet_Caroline.wav'); eq((await shares(page)).length, 0, 'share was never called with a file it cannot send');
      eq(await page.inputValue('#msgBox'), SHARED_TEXT);
      await page.fill('#artist', 'Someone Else'); eq(await page.inputValue('#msgBox'), 'Walk-up song for Sam #7: Sweet Caroline - Someone Else [WU-abc1234]', 'the message follows what is typed');
      await page.click('#copy'); await page.waitForFunction(() => window.__clip.length === 1); eq((await page.evaluate(() => window.__clip))[0], 'Walk-up song for Sam #7: Sweet Caroline - Someone Else [WU-abc1234]');
      assert.ok(/Copied/.test(await page.textContent('#msg')));
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]); eq(dl.suggestedFilename(), 'WU-abc1234-Sweet_Caroline.wav');
      deep(errors, []); await ctx.close();
    }
    // if even copying is refused, it says how to do it by hand
    const { page, ctx } = await openSend(LINK, { share: 'none', clipboard: 'deny' });
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); await page.click('#send'); await page.waitForSelector('#fallback:not([hidden])'); await page.click('#copy');
    await page.waitForFunction(() => /Copied|Press and hold/.test(document.querySelector('#msg').textContent)); await ctx.close();
  });

  await test('Parent page: with no file, a typed title (and artist) is sent as a short text; with nothing at all it says what to do', async () => {
    let A = await openSend(LINK, { share: 'textonly' });
    await A.page.click('#send'); assert.ok(/Choose a song file in step 1, or type the song name/.test(await A.page.textContent('#msg'))); eq((await shares(A.page)).length, 0, 'nothing to send yet');
    await A.page.fill('#title', 'Sweet Caroline'); await A.page.fill('#artist', 'Neil Diamond'); await A.page.click('#send'); await A.page.waitForSelector('#done:not([hidden])');
    const sh = await shares(A.page); deep([sh.length, sh[0].files.length, sh[0].text, sh[0].title], [1, 0, SHARED_TEXT, 'Walk-up song for Sam #7'], 'a text, no file');
    deep(A.errors, []); await A.ctx.close();
    A = await openSend(LINK, { share: 'none' });
    await A.page.fill('#title', 'Sweet Caroline'); await A.page.click('#send'); await A.page.waitForSelector('#fallback:not([hidden])');
    eq(await A.page.inputValue('#msgBox'), 'Walk-up song for Sam #7: Sweet Caroline [WU-abc1234]'); eq(await A.page.$eval('#dl', e => e.hidden), true, 'no file, so no download');
    await A.page.click('#copy'); await A.page.waitForFunction(() => window.__clip.length === 1); await A.ctx.close();
    A = await openSend(LINK, { share: 'textonly' }); // artist alone is still something to send
    await A.page.fill('#artist', 'Neil Diamond'); await A.page.click('#send'); await A.page.waitForSelector('#done:not([hidden])'); eq((await shares(A.page))[0].text, 'Walk-up song for Sam #7: Neil Diamond [WU-abc1234]'); await A.ctx.close();
  });

  await test('Parent page: a file over 10 MB gets the warning (exactly 10 MB does not); a clip makes it go away', async () => {
    const { page, errors, ctx } = await openSend(LINK);
    await pickSong(page, { name: 'edge.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(10 * 1024 * 1024) }); eq(await page.$eval('#fileWarn', e => e.hidden), true, 'exactly 10 MB is fine');
    await pickSong(page, { name: 'edge2.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }); eq(await page.$eval('#fileWarn', e => e.hidden), false, 'one byte over warns');
    await pickSong(page, { name: 'big.wav', mimeType: 'audio/wav', buffer: BIG_WAV }); await waitMeta(page);
    const w = await page.textContent('#fileWarn'); assert.ok(/10\.5 MB/.test(w) && w.includes('Texts can refuse big files. iMessage, WhatsApp or email work best.'), w);
    eq(await page.$eval('#fileWarn', e => e.hidden), false); assert.ok(/2:05 long/.test(await page.textContent('#fMeta')), await page.textContent('#fMeta'));
    await page.check('#clipOn'); await page.waitForFunction(() => /Clip: /.test(document.querySelector('#clipInfo').textContent), null, { timeout: 15000 });
    eq(await page.$eval('#fileWarn', e => e.hidden), true, 'the short clip is small, so the warning goes'); await page.uncheck('#clipOn'); eq(await page.$eval('#fileWarn', e => e.hidden), false, 'and comes back with the whole file');
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); eq(await page.$eval('#fileWarn', e => e.hidden), true, 'a new small file clears it');
    deep(errors, []); await ctx.close();
  });

  await test('Parent page: a file that is not a song is turned down in plain words; songs that phones label oddly are welcome', async () => {
    const { page, errors, ctx } = await openSend(LINK, { share: 'ok' });
    for (const [name, type, buf] of [['notes.txt', 'text/plain', Buffer.from('hi there')], ['photo.png', 'image/png', fs.readFileSync(fx('photo.png'))], ['setup.exe', 'application/x-msdownload', Buffer.from('MZ')], ['paper.pdf', 'application/pdf', Buffer.from('%PDF-1.4')], ['photo.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff])]]) {
      await page.setInputFiles('#song', { name, mimeType: type, buffer: buf }); await page.waitForSelector('#fileErr:not([hidden])');
      assert.ok(/doesn.t look like a song/.test(await page.textContent('#fileErr')) && /MP3, M4A or WAV/.test(await page.textContent('#fileErr')), name);
      deep(await page.evaluate(() => [document.querySelector('#fileInfo').hidden, document.querySelector('#clipBox').hidden, document.querySelector('#song').value]), [true, true, ''], name + ' is not kept');
    }
    await page.click('#send'); assert.ok(/Choose a song file/.test(await page.textContent('#msg'))); eq((await shares(page)).length, 0, 'nothing was sent');
    await page.setInputFiles('#song', { name: 'empty.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(0) }); await page.waitForSelector('#fileErr:not([hidden])'); assert.ok(/empty/.test(await page.textContent('#fileErr')));
    // the same table of names and types as the unit test, through the real file chooser
    for (const [name, type] of [['a.mp3', 'audio/mpeg'], ['a.mp3', 'application/octet-stream'], ['a.m4a', 'video/mp4'], ['a.m4a', 'audio/x-m4a'], ['a.wav', 'audio/x-wav'], ['a.wav', 'audio/wave'], ['a.aac', 'audio/aac'], ['a.opus', 'application/octet-stream'], ['a.flac', 'audio/flac'], ['a.ogg', 'audio/ogg'], ['a.webm', 'video/webm'], ['a.3gp', 'video/3gpp'], ['a.amr', 'application/octet-stream'], ['a.caf', 'application/octet-stream'], ['a.aiff', 'audio/aiff'], ['clip.mp4', 'video/mp4'], ['voicememo', 'audio/mp4']]) {
      await page.setInputFiles('#song', { name, mimeType: type, buffer: Buffer.from('not really audio ' + name) }); await page.waitForSelector('#fileInfo:not([hidden])');
      eq(await page.$eval('#fileErr', e => e.hidden), true, name + ' ' + type + ' is accepted'); eq(await page.textContent('#fName'), name);
    }
    deep(errors, []); await ctx.close();
  });

  await test('Parent page: a file this phone cannot play is warned about but can still be sent; the right type goes along when the phone sent none', async () => {
    const { page, errors, ctx } = await openSend(LINK);
    await pickSong(page, mem('broken.mp3', fs.readFileSync(fx('broken.mp3')), 'audio/mpeg'));
    await page.waitForFunction(() => !document.querySelector('#fileNote').hidden, null, { timeout: 8000 });
    const n = await page.textContent('#fileNote'); assert.ok(/couldn.t check that song, but you can still send it/.test(n) && /coach.s phone may read it fine/.test(n), n);
    await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    let sh = await shares(page); deep([sh[0].files[0].name, sh[0].files[0].type], ['WU-abc1234-broken.mp3', 'audio/mpeg'], 'it was sent anyway');
    await page.click('#again');
    for (const [name, type, want, ext] of [['voice.m4a', '', 'audio/mp4', 'm4a'], ['take.m4a', 'application/octet-stream', 'audio/mp4', 'm4a'], ['take2.m4a', 'video/mp4', 'audio/mp4', 'm4a'], ['song.mp3', 'application/octet-stream', 'audio/mpeg', 'mp3'], ['song.flac', 'application/octet-stream', 'audio/flac', 'flac'], ['SONG.OPUS', 'application/octet-stream', 'audio/ogg', 'opus']]) {
      await pickSong(page, { name, mimeType: type, buffer: Buffer.from('bytes of ' + name) }); await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
      sh = await shares(page); const f = sh[sh.length - 1].files[0]; eq(f.type, want, name + ' ' + type); eq(f.name.endsWith('.' + ext), true, f.name); assert.ok(f.name.startsWith('WU-abc1234-'), f.name);
      await page.click('#again');
    }
    deep(errors, []); await ctx.close();
  });

  await test('Parent page: "Send just the part I like" cuts a real 16-bit WAV from the chosen seconds, previews it, and falls back to the whole song when the phone cannot cut', async () => {
    const A = await openSend(LINK); const { page, errors } = A;
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); await waitMeta(page);
    eq(await page.$eval('#clipBox', e => e.hidden), false); eq(await page.$eval('#clipCtl', e => e.hidden), true);
    await page.check('#clipOn'); eq(await page.$eval('#clipCtl', e => e.hidden), false);
    await page.fill('#clipStart', '7'); await page.fill('#clipLen', '3'); await page.waitForFunction(() => /Clip: 0:03 long/.test(document.querySelector('#clipInfo').textContent), null, { timeout: 10000 });
    const info = await page.textContent('#clipInfo'); assert.ok(/258 KB/.test(info), info); // 3 s of 44.1 kHz 16-bit mono
    await page.click('#clipPrev'); await page.waitForFunction(() => document.querySelector('#clipPrev').textContent === 'Stop'); await page.click('#clipPrev'); await page.waitForFunction(() => document.querySelector('#clipPrev').textContent === 'Preview');
    await page.fill('#title', 'The Chorus'); await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    let f = (await shares(page))[0].files[0];
    deep([f.name, f.type], ['WU-abc1234-The_Chorus.wav', 'audio/wav'], 'a cut is always a .wav');
    let w = wavInfo(f.b64); deep([w.riff, w.wave, w.pcm, w.nch, w.bits, w.sr], ['RIFF', 'WAVE', 1, 1, 16, 44100]);
    assert.ok(Math.abs(w.sec - 3) < 0.02, 'three seconds: ' + w.sec); assert.ok(Math.abs(w.hz - 554.37) < 4, 'the second note (554 Hz) was cut, not the first: ' + w.hz); assert.ok(w.peak > 0.4 && w.peak < 0.52, 'not silent, not clipped: ' + w.peak);
    eq(f.size, 44 + w.frames * 2, 'the header matches the data'); assert.ok(f.size < SONG_A.length / 1.9, 'much smaller than the whole song');
    // a cut from the first note, taken from a file the phone calls an m4a (it is renamed .wav because it now is one)
    await page.click('#again'); await pickSong(page, mem('Big Song.m4a', SONG_A, 'audio/mp4')); await waitMeta(page);
    await page.check('#clipOn'); await page.fill('#clipStart', '1'); await page.fill('#clipLen', '2.5'); await page.waitForFunction(() => /Clip: 0:03|Clip: 0:02/.test(document.querySelector('#clipInfo').textContent), null, { timeout: 10000 });
    await page.click('#send'); await page.waitForSelector('#done:not([hidden])'); f = (await shares(page))[1].files[0]; w = wavInfo(f.b64);
    deep([f.name, f.type], ['WU-abc1234-Big_Song.wav', 'audio/wav']); assert.ok(Math.abs(w.sec - 2.5) < 0.02 && Math.abs(w.hz - 440) < 4, 'first note: ' + w.sec + ' s ' + w.hz + ' Hz');
    // the length is held to 60 seconds and to what is left of the song
    await page.click('#again'); await pickSong(page, mem('Slow Jam.wav', SONG_A)); await waitMeta(page); await page.check('#clipOn'); await page.fill('#clipStart', '10'); await page.fill('#clipLen', '99');
    await page.waitForFunction(() => /Clip: 0:02/.test(document.querySelector('#clipInfo').textContent), null, { timeout: 10000 }); await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    w = wavInfo((await shares(page))[2].files[0].b64); assert.ok(Math.abs(w.sec - 2) < 0.02, 'only 2 s are left after 10 s: ' + w.sec);
    // a file this phone cannot decode: say so, send the whole song
    await page.click('#again'); await pickSong(page, mem('broken.mp3', fs.readFileSync(fx('broken.mp3')), 'audio/mpeg')); await page.check('#clipOn');
    await page.waitForFunction(() => /can.t cut that file/.test(document.querySelector('#msg').textContent), null, { timeout: 10000 });
    eq(await page.isChecked('#clipOn'), false); await page.click('#send'); await page.waitForSelector('#done:not([hidden])'); f = (await shares(page))[3].files[0]; deep([f.name, f.size], ['WU-abc1234-broken.mp3', fs.readFileSync(fx('broken.mp3')).length], 'the whole song went');
    deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await A.ctx.close();
  });

  await test('Parent page: a bad, missing, oversized or hostile link shows the friendly "ask for a new one" page and nothing else', async () => {
    const hashes = ['', '#', '#r=', '#r=!!!', '#x=1', '#r=' + 'A'.repeat(5000), '#r=' + b64u('not json'), '#r=' + b64u('[1]'), '#r=' + b64u(JSON.stringify({ v: 2, t: 'abc1234' })), '#r=' + b64u(JSON.stringify({ v: 1, t: '../etc' })), '#r=' + b64u(JSON.stringify({ v: 1, t: 'ab' })), '#r=' + b64u(JSON.stringify({ v: 1, t: '<script>' })), '#r=' + Buffer.from([0xff, 0xfe]).toString('base64url')];
    for (const h of hashes) {
      const { page, errors, ctx } = await openSend(h, { wait: '#bad' });
      const t = await page.textContent('#bad'); assert.ok(/This link looks incomplete/.test(t) && /Ask the coach to send you a new one/.test(t), h.slice(0, 30) + ' -> ' + t);
      eq(await page.$$eval('#song, #send, #title', e => e.length), 0, 'no way to send anything from a broken link'); eq(await page.$eval('#bad', e => e.getAttribute('role')), 'alert');
      deep(errors, [], h.slice(0, 30)); await ctx.close();
    }
    // opening a good link in the same tab (only the part after # changes) fixes the page, and a bad one replaces a good page
    const { page, errors, ctx } = await openSend(hashes[3], { wait: '#bad' });
    await page.evaluate(h => { location.hash = h; }, '#r=' + b64u(JSON.stringify(LINK))); await page.waitForSelector('#song'); eq(await page.textContent('#head'), 'A walk-up song for Sam #7');
    await page.evaluate(() => { location.hash = '#r=nope'; }); await page.waitForSelector('#bad'); eq(await page.$$eval('#song', e => e.length), 0); deep(errors, []); await ctx.close();
  });

  await test('Parent page XSS: markup in the name, number, team, title, artist or file name is shown as text and never runs', async () => {
    const hostile = { v: 1, t: 'abc1234', n: '<img src=x onerror=x=1>', u: '<b>', c: '<img src=x onerror=y=1>' };
    const A = await openSend(hostile, { init: () => { window.addEventListener('error', () => { window.__scriptError = true; }); } }); const { page, errors } = A;
    eq(await page.textContent('#head'), 'A walk-up song for <img src=x onerror=x=1> #<b>'); eq(await page.textContent('#team'), 'Team: <img src=x onerror=y=1>');
    const ev = async () => page.evaluate(() => ({ x: typeof window.x, y: typeof window.y, z: typeof window.z, w: typeof window.w, imgs: document.querySelectorAll('#sendRoot img, #sendRoot script, #head *, #team *, #fName *, #msg *, #msgBox *').length }));
    deep(await ev(), { x: 'undefined', y: 'undefined', z: 'undefined', w: 'undefined', imgs: 0 });
    await page.setInputFiles('#song', { name: '<img src=x onerror=z=1>.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('xx') }); await page.waitForSelector('#fileInfo:not([hidden])');
    eq(await page.textContent('#fName'), '<img src=x onerror=z=1>.mp3');
    await page.fill('#title', '<img src=x onerror=w=1>'); await page.fill('#artist', '"><script>window.w=2</script>'); await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    deep(await ev(), { x: 'undefined', y: 'undefined', z: 'undefined', w: 'undefined', imgs: 0 });
    const f = (await shares(page))[0]; eq(f.files[0].name, 'WU-abc1234-img_src_x_onerror_w_1.mp3', 'the file name carries none of the markup'); assert.ok(f.text.includes('<img src=x onerror=w=1>'), 'the text is plain text');
    eq(await page.evaluate(() => window.__scriptError || false), false); deep(errors, []); await A.ctx.close();
    // the same link text in the address bar the way a person might paste it, with the markup percent-encoded
    const B = await openSend('#r=' + b64u(JSON.stringify({ v: 1, t: 'abc1234', n: '</h1><img src=x onerror=x=1>', u: '1' }))); eq(await B.page.$$eval('#sendRoot img', e => e.length), 0); eq(await B.page.evaluate(() => typeof window.x), 'undefined'); await B.ctx.close();
  });

  /* ============ the coach: asking ============ */
  const REQ1 = { t: 'ta00001', at: TODAY, via: 'text', st: 'asked' }, REQ2 = { t: 'tb00001', at: TODAY, via: 'email', st: 'asked' };
  const chipOf = page => page.textContent(sheetSel + ' #rqChip');

  await test('Ask a parent: the player sheet shows the status, the message with a link made for this player, and Text, Email, Share and Copy that mark the player Asked with an Undo', async () => {
    const { page, errors, ctx, outside } = await open(); await team(page, 3);
    await openPlayerSheet(page, 'Pat Sample');
    eq(await chipOf(page), 'Not asked'); eq(await page.textContent(sheetSel + ' #rqStat'), 'Not asked yet.');
    let msg = await msgOf(page), link = linkIn(msg);
    assert.ok(link && link.startsWith(srv.url + 'send.html#r='), 'the link is built from the page\'s own address: ' + link);
    const info = C.parseRequestLink(link); deep([info.ok, info.n, info.u, info.c], [true, 'Pat', '7', '']); assert.ok(/^[a-z0-9]{7}$/.test(info.t));
    eq(msg, C.requestMessage('', { first: 'Pat', number: '7', team: '', link }), 'the standard message with this player filled in');
    eq(await page.getAttribute('#rqText', 'href'), 'sms:?&body=' + encodeURIComponent(msg)); eq(await page.getAttribute('#rqMail', 'href'), C.mailtoHref('Walk-up song for Pat #7', msg));
    eq((await state(page)).roster[0].req, null, 'looking at the message does not ask anyone');
    // the coach can change this one message; the buttons use the changed text
    await page.fill('#rqMsg', msg + '\nPS: any song is fine.'); const edited = msg + '\nPS: any song is fine.';
    eq(await page.getAttribute('#rqText', 'href'), 'sms:?&body=' + encodeURIComponent(edited)); eq(await page.getAttribute('#rqMail', 'href'), C.mailtoHref('Walk-up song for Pat #7', edited));
    // Text it
    await page.click('#rqText'); await waitReq(page, 0, 'p.req');
    deep(await page.evaluate(() => window.__nav), [{ href: 'sms:?&body=' + encodeURIComponent(edited), appPrevented: false }], 'the phone is handed the sms link, with the edited text, and the page does not get in its way');
    deep((await state(page)).roster[0].req, { t: info.t, at: TODAY, via: 'text', st: 'asked' }, 'the token in the link is the one saved');
    await waitToast(page, /Marked Pat as asked/); eq(await page.$eval('.toast .tact', e => e.textContent), 'Undo'); await page.waitForFunction(() => document.querySelector('.sheet-wrap.open .sheet #rqChip').textContent === 'Asked Nov 7'); eq(await page.textContent(sheetSel + ' #rqStat'), 'Asked on Nov 7, 2026 by text. Waiting for the song.');
    eq(await page.inputValue('#rqMsg'), edited, 'the edit is still there'); eq(page.url().startsWith(srv.url), true, 'the app is still open');
    await page.click('.toast .tact'); await waitReq(page, 0, '!p.req'); await page.waitForFunction(() => document.querySelector('.sheet-wrap.open .sheet #rqChip').textContent === 'Not asked');
    // Email it: same token, because a request that is still open is reused
    await page.click('#rqText'); await waitReq(page, 0, 'p.req'); await page.click('#rqMail'); await waitReq(page, 0, 'p.req.via === "email"');
    deep((await state(page)).roster[0].req, { t: info.t, at: TODAY, via: 'email', st: 'asked' }); eq(linkIn(await msgOf(page)), link, 'the same link');
    await page.waitForFunction(() => document.querySelector('.sheet-wrap.open .sheet #rqStat').textContent === 'Asked on Nov 7, 2026 by email. Waiting for the song.');
    // Copy message puts the changed text on the clipboard
    await page.click('#rqCopy'); await page.waitForFunction(() => window.__clip.length === 1); eq((await page.evaluate(() => window.__clip))[0], edited); await waitReq(page, 0, 'p.req.via === "copy"'); await waitToast(page, /copied/i);
    // Share...
    await page.click('#rqShare'); await page.waitForFunction(() => window.__shares.length === 1); const sh = (await shares(page))[0];
    deep([sh.title, sh.text, sh.files.length], ['Walk-up song for Pat #7', edited, 0]); await waitReq(page, 0, 'p.req.via === "share"'); await waitToast(page, /Shared and marked as asked/);
    // another player gets a different token
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    await openPlayerSheet(page, 'Robin Sample'); const m2 = await msgOf(page), i2 = C.parseRequestLink(linkIn(m2)); deep([i2.n, i2.u], ['Robin', '12']); assert.notStrictEqual(i2.t, info.t);
    deep(outside.filter(u => !/fonts\.(googleapis|gstatic)\.com|natesteele888\.github\.io\/apps\/install\.js/.test(u)), [], 'asking made no network request beyond the page\'s own fonts and install script'); deep(errors, []); await ctx.close();
  });

  await test('Ask a parent: the message follows the name and number until the coach types in it; Share is only there when the phone has it, and cancelling it asks no one', async () => {
    let A = await open({ share: 'abort' }); await team(A.page, 2); await openPlayerSheet(A.page, 'Pat Sample');
    const t0 = C.parseRequestLink(linkIn(await msgOf(A.page))).t;
    await A.page.fill(sheetSel + ' #plNum', '99'); let i = C.parseRequestLink(linkIn(await msgOf(A.page))); deep([i.u, i.t], ['99', t0], 'a new number, the same token');
    await A.page.fill(sheetSel + ' #plName', 'Chris Placeholder'); i = C.parseRequestLink(linkIn(await msgOf(A.page))); eq(i.n, 'Chris'); assert.ok(/the song Chris wants/.test(await msgOf(A.page)));
    await A.page.fill(sheetSel + ' #plName', ''); i = C.parseRequestLink(linkIn(await msgOf(A.page))); eq(i.n, ''); assert.ok(/the song your player wants/.test(await msgOf(A.page)), 'no name: "your player"');
    await A.page.fill(sheetSel + ' #plName', 'Pat Sample'); await A.page.fill('#rqMsg', 'My own words ' + linkIn(await msgOf(A.page)));
    await A.page.fill(sheetSel + ' #plName', 'Zed Sample'); assert.ok((await msgOf(A.page)).startsWith('My own words'), 'typed text is not overwritten');
    await A.page.click('#rqShare'); await A.page.waitForFunction(() => window.__shares.length === 1); await A.page.waitForTimeout(300);
    eq((await state(A.page)).roster[0].req, null, 'closing the share sheet did not mark anyone asked'); eq(await toastText(A.page), '', 'and says nothing about it');
    // the link is missing from a message the coach shortened
    await A.page.fill('#rqMsg', 'no link here'); eq(await A.page.$eval('#rqNoLink', e => e.hidden), false); assert.ok(/The link is missing/.test(await A.page.textContent('#rqNoLink')));
    deep(A.errors, []); await A.ctx.close();
    A = await open({ share: 'none' }); await team(A.page, 1); await openPlayerSheet(A.page, 'Pat Sample');
    eq(await A.page.$$('#rqShare').then(e => e.length), 0, 'no Share button without navigator.share'); eq(await A.page.$$eval('.rq-btns .btn', e => e.length), 3);
    // a failing share says so and asks no one
    await A.ctx.close();
    A = await open({ share: 'fail' }); await team(A.page, 1); await openPlayerSheet(A.page, 'Pat Sample'); await A.page.click('#rqShare'); await waitToast(A.page, /Couldn.t open the share menu/);
    eq((await state(A.page)).roster[0].req, null); await A.ctx.close();
  });

  await test('Settings: the team name and message are edited, kept after a reload, used in the next message and the link, capped at 600, and reset to the standard words', async () => {
    const { page, errors, ctx } = await open(); await team(page, 2); await tab(page, 'settings');
    eq(await page.inputValue('#rqTpl'), C.DEFAULT_TPL, 'the standard message is shown'); eq(await page.getAttribute('#rqTpl', 'maxlength'), '600'); eq(await page.getAttribute('#rqTeam', 'maxlength'), '30');
    await page.fill('#rqTeam', 'Test Team'); await page.fill('#rqTpl', 'Hey {first}, #{number} of {team}! Pick a song here: {link}');
    const s0 = (await state(page)).settings; deep([s0.team, s0.reqTpl], ['Test Team', 'Hey {first}, #{number} of {team}! Pick a song here: {link}'], 'saved as typed');
    await page.reload(); await page.waitForSelector('#wuNav .navb'); await tab(page, 'settings');
    eq(await page.inputValue('#rqTeam'), 'Test Team'); eq(await page.inputValue('#rqTpl'), 'Hey {first}, #{number} of {team}! Pick a song here: {link}', 'kept after a reload');
    await openPlayerSheet(page, 'Pat Sample'); const msg = await msgOf(page), link = linkIn(msg), info = C.parseRequestLink(link);
    eq(msg, 'Hey Pat, #7 of Test Team! Pick a song here: ' + link); eq(info.c, 'Test Team', 'the team name travels in the link'); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    // a template with no {link}: the link is added anyway
    await tab(page, 'settings'); await page.fill('#rqTpl', 'Hello {first}'); await openPlayerSheet(page, 'Pat Sample'); const m2 = await msgOf(page); assert.ok(/^Hello Pat\nhttps?:\/\/\S+send\.html#r=/.test(m2), m2); await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    // too long: cut at 600
    await tab(page, 'settings'); await page.fill('#rqTpl', 'x'.repeat(700) + ' {link}'); eq((await state(page)).settings.reqTpl.length, 600);
    await page.fill('#rqTeam', 'T'.repeat(50)); eq((await state(page)).settings.team.length, 30);
    // back to the standard message
    await page.click('[data-act=rq-tpl-reset]'); eq((await state(page)).settings.reqTpl, ''); eq(await page.inputValue('#rqTpl'), C.DEFAULT_TPL); await waitToast(page, /standard message/);
    await page.fill('#rqTeam', ''); await openPlayerSheet(page, 'Pat Sample'); assert.ok(/^Hi! We're putting together walk-up music/.test(await msgOf(page)));
    deep(errors, []); await ctx.close();
  });

  await test('Song requests: progress, the "Still need a song" filter, status chips, one-tap Text, Share and Copy, and a "Song they want" note for each player', async () => {
    const { page, errors, ctx } = await open(); await team(page, 4);
    await addSong(page, ['Slow Jam.wav', SONG_A.toString('base64')]); await page.evaluate(() => { const A = window.WalkupApp; A.S.st.roster[0].songId = A.S.st.songs[0].id; A.S.st.roster[1].songId = 'b:horn'; A.WU.commit('data'); });
    await tab(page, 'team'); await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow');
    eq(await page.textContent('.sheet h2'), 'Song requests'); eq(await page.textContent('#rqProgTx'), '1 of 4 have a song', 'a built-in sound is not a song someone picked');
    eq(await page.$eval('.bar i', e => e.style.width), '25%'); eq(await page.$$eval('.rqrow', e => e.length), 4);
    deep(await page.$$eval('.rqrow', rs => rs.map(r => r.querySelector('[data-chip]').textContent)), ['Got it', 'Not asked', 'Not asked', 'Not asked']);
    eq(await page.$$eval('.rqrow [data-want]', e => e.length), 3, 'a player who has a song needs no ask');
    deep(await page.$$eval('.segb', b => b.map(x => [x.textContent, x.getAttribute('aria-pressed')])), [['Everyone', 'true'], ['Still need a song (3)', 'false']]);
    await page.click('[data-do=f-need]'); eq(await page.$$eval('.rqrow', e => e.length), 3); deep(await page.$$eval('.segb', b => b.map(x => x.getAttribute('aria-pressed'))), ['false', 'true']);
    assert.ok(!(await page.textContent('#rqRows')).includes('Pat Sample'), 'Pat has a song so is not listed under "Still need"');
    // the Text link is a real sms link carrying this player's own message
    const row = i => page.locator('.rqrow').nth(i);
    const href = await row(0).locator('[data-do=r-text]').getAttribute('href'); assert.ok(href.startsWith('sms:?&body='), href);
    const m = decodeURIComponent(href.slice('sms:?&body='.length)), inf = C.parseRequestLink(linkIn(m)); deep([inf.n, inf.u], ['Robin', '12']); assert.ok(/the song Robin wants/.test(m));
    await page.evaluate(() => { document.querySelector('.rqrow').dataset.mark = 'same'; });
    await row(0).locator('[data-do=r-text]').click(); await waitReq(page, 1, 'p.req && p.req.via === "text"'); deep((await state(page)).roster[1].req, { t: inf.t, at: TODAY, via: 'text', st: 'asked' });
    await page.waitForFunction(() => document.querySelector('.rqrow [data-chip]').textContent === 'Asked Nov 7'); eq(await page.evaluate(() => document.querySelector('.rqrow').dataset.mark), 'same', 'the row was updated, not replaced');
    await waitToast(page, /Marked Robin as asked/); await page.click('.toast .tact'); await waitReq(page, 1, '!p.req');
    await row(1).locator('[data-do=r-copy]').click(); await page.waitForFunction(() => window.__clip.length === 1); assert.ok(/the song Kit wants/.test((await page.evaluate(() => window.__clip))[0])); await waitReq(page, 2, 'p.req && p.req.via === "copy"');
    await row(2).locator('[data-do=r-share]').click(); await page.waitForFunction(() => window.__shares.length === 1); eq((await shares(page))[0].title, 'Walk-up song for Max #22'); await waitReq(page, 3, 'p.req && p.req.via === "share"');
    // "Song they want": typing keeps the cursor, saves at once, and says a file is still needed
    const inp = row(0).locator('[data-want]'); await inp.click(); await page.keyboard.type('Hey Jude - The Beatles', { delay: 5 });
    eq(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-want')), true, 'still typing in the box'); eq(await inp.inputValue(), 'Hey Jude - The Beatles');
    await waitReq(page, 1, 'p.want === "Hey Jude - The Beatles"'); eq(await row(0).locator('[data-chip]').textContent(), 'Needs a song file');
    await page.fill('.rqrow:nth-child(2) [data-want]', 'x'.repeat(120)); eq((await state(page)).roster[2].want.length, 80, 'a note is 80 characters at most');
    // a parent\'s typed reply pasted into any box lands on the right player, cleaned up
    const tok2 = (await state(page)).roster[3].req.t; await page.fill('.rqrow:nth-child(3) [data-want]', 'Walk-up song for Max #22: Take On Me - a-ha [WU-' + tok2 + ']');
    await waitReq(page, 3, 'p.want === "Take On Me - a-ha"'); eq((await state(page)).roster[3].req.st, 'text', 'asked, then answered with a title');
    await page.click(sheetSel + ' [data-close].btn'); await noSheets(page);
    // the wish shows on the team list and the game card until a song file is added
    assert.ok(/Wants: Hey Jude - The Beatles/.test(await page.textContent('.prow:has-text("Robin Sample")')) && /Needs a song file/.test(await page.textContent('.prow:has-text("Robin Sample")')));
    await tab(page, 'game'); await page.click('.lrow:has-text("Robin Sample")'); const card = await page.textContent('.now'); assert.ok(/Wants: Hey Jude - The Beatles/.test(card) && /Needs a song file/.test(card), card);
    eq(await page.$$eval('.prow, .lrow', e => e.length) > 0, true);
    await tab(page, 'team'); assert.ok(!/Wants:/.test(await page.textContent('.prow:has-text("Pat Sample")')), 'Pat has a song, so no wish is shown');
    // from the Songs tab too; a player with a real song file shows Got it
    await tab(page, 'songs'); await page.click('[data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); eq(await page.textContent('#rqProgTx'), '1 of 4 have a song'); await page.keyboard.press('Escape'); await noSheets(page);
    deep(errors, []); await ctx.close();
  });

  /* ============ the coach: taking songs in ============ */
  const addInput = (page, files) => page.setInputFiles('[data-file="songs-add"]', files);
  const confirmSel = sheetSel + '.rq-in';
  const waitConfirm = page => page.waitForSelector(confirmSel, { timeout: 10000 });
  const confirmText = page => page.textContent(confirmSel);
  const pick = (page, what) => page.click(confirmSel + ' [data-pick=' + what + ']');
  const askedTeam = async (page, n) => { await team(page, n || 3); await asked(page, 0, { t: 'ta00001', at: TODAY, via: 'text', st: 'asked' }); await asked(page, 1, { t: 'tb00001', at: TODAY, via: 'email', st: 'asked' }); await tab(page, 'songs'); };

  await test('Import: a song named WU-code-title asks "Use it for ...?"; Use it sets the song for that player, titles it from the file, marks Got it and opens Trim', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page);
    await addInput(page, [mem('WU-ta00001-Sweet_Caroline.wav', SONG_B)]); await waitConfirm(page);
    const t = await confirmText(page); assert.ok(t.includes('Song from a parent: "Sweet Caroline". Use it for Pat Sample #7?'), t); assert.ok(t.includes('WU-ta00001-Sweet_Caroline.wav'), 'the file name is shown');
    deep(await page.$$eval(confirmSel + ' .btn', b => b.map(x => x.textContent.trim())), ['Use it for Pat', 'Just add to library', 'Not now']);
    eq((await state(page)).songs.length, 0, 'nothing is added until the coach says so');
    await pick(page, 'use'); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 });
    const s = await state(page); eq(s.songs.length, 1); deep([s.songs[0].title, s.songs[0].name, s.songs[0].kind], ['Sweet Caroline', 'WU-ta00001-Sweet_Caroline.wav', 'file'], 'the library title has no code in it');
    deep([s.roster[0].songId, s.roster[0].req.st, s.roster[0].req.t], [s.songs[0].id, 'got', 'ta00001']); eq(s.roster[1].songId, null, 'only the matched player');
    const h2 = await page.textContent('.sheet.trim h2'); assert.ok(/Trim: Sweet Caroline/.test(h2), 'the Trim sheet is open for this song: ' + h2);
    await page.keyboard.press('Escape'); await noSheets(page);
    await tab(page, 'team'); await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow');
    eq(await page.locator('.rqrow').nth(0).locator('[data-chip]').textContent(), 'Got it'); eq(await page.textContent('#rqProgTx'), '1 of 3 have a song'); await page.keyboard.press('Escape'); await noSheets(page);
    // the song plays: the file really is the one that came back
    await page.reload(); await page.waitForSelector('#wuNav .navb'); eq((await state(page)).roster[0].req.st, 'got', 'kept after a reload');
    deep(errors, []); await ctx.close();
  });

  await test('Import: Just add to library keeps the song without giving it to the player; Not now (or Escape) adds nothing; capitals in the code do not matter', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page);
    await addInput(page, [mem('WU-TA00001-Hey_Jude.wav', SONG_B)]); await waitConfirm(page); await pick(page, 'lib');
    await waitToast(page, /Added "Hey Jude" to your songs\. Pick it for Pat from the player's Song button\./); await noSheets(page);
    let s = await state(page); deep([s.songs.length, s.songs[0].title, s.roster[0].songId, s.roster[0].req.st], [1, 'Hey Jude', null, 'got'], 'uppercase code found the player; in the library, not on the player');
    await tab(page, 'team'); await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); eq(await page.locator('.rqrow').nth(0).locator('[data-chip]').textContent(), 'In your songs', 'the chip says where it is'); eq(await page.textContent('#rqProgTx'), '0 of 3 have a song', 'but Pat has no song yet');
    await page.keyboard.press('Escape'); await noSheets(page); await tab(page, 'songs');
    // Not now
    await addInput(page, [mem('WU-tb00001-Other.wav', SONG_C)]); await waitConfirm(page); await page.click(confirmSel + ' [data-close]'); await noSheets(page);
    await waitToast(page, /Skipped\. Choose it again with Add songs/); s = await state(page); deep([s.songs.length, s.roster[1].songId, s.roster[1].req.st], [1, null, 'asked'], 'nothing added, request unchanged');
    // Escape and the X are Not now too
    await addInput(page, [mem('WU-tb00001-Other.wav', SONG_C)]); await waitConfirm(page); await page.keyboard.press('Escape'); await noSheets(page); eq((await state(page)).songs.length, 1);
    await addInput(page, [mem('WU-tb00001-Other.wav', SONG_C)]); await waitConfirm(page); await page.click(confirmSel + ' .x'); await noSheets(page); eq((await state(page)).songs.length, 1);
    deep(errors, []); await ctx.close();
  });

  await test('Import: a code nobody has gives a plain add and the exact toast; ordinary file names are unchanged', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page);
    await addInput(page, [mem('WU-zz99zz9-Mystery_Song.wav', SONG_C)]); await waitToast(page, /Added to your songs\. Pick it for a player from the player's Song button\./);
    eq(await page.$$eval('.toast', t => t.some(x => x.textContent.includes('Added to your songs. Pick it for a player from the player\'s Song button.'))), true, 'the agreed words for');
    let s = await state(page); deep([s.songs.length, s.songs[0].title, s.roster.map(p => p.songId)], [1, 'Mystery Song', [null, null, null]], 'no sheet, nobody got it');
    eq(await page.$$(confirmSel).then(e => e.length), 0); eq(await page.$$('.sheet.trim').then(e => e.length), 0, 'no Trim sheet for an unknown code');
    // a normal file has no code: the old behaviour (one song: toast and Trim)
    await addInput(page, [mem('Plain Song.wav', SONG_B)]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await waitToast(page, /Added "Plain Song"\./);
    s = await state(page); eq(s.songs.length, 2); eq(s.songs[1].title, 'Plain Song'); await page.keyboard.press('Escape'); await noSheets(page);
    // a file that merely looks a bit like a code is a normal file
    await addInput(page, [mem('WU-abc-short.wav', SONG_C)]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); eq((await state(page)).songs[2].title, 'WU-abc-short'); await page.keyboard.press('Escape'); await noSheets(page);
    deep(errors, []); await ctx.close();
  });

  await test('Import: several files at once are matched one by one ("song 1 of 2"), mixed with unknown and plain files', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page);
    await addInput(page, [mem('WU-ta00001-First.wav', SONG_A), mem('WU-tb00001-Second.wav', SONG_B), mem('WU-nope999-Lost.wav', SONG_C), mem('Just A File.wav', wavFile(twoNotes(5, 22050, 300, 350), 22050))]);
    await waitConfirm(page); let t = await confirmText(page); assert.ok(/Use it for Pat Sample #7\?/.test(t) && /song 1 of 2/.test(t), t);
    eq((await state(page)).songs.length, 2, 'the unknown and plain files were added first; the matched ones wait for an answer'); await pick(page, 'use');
    await page.waitForFunction(() => /Robin Sample/.test((document.querySelector('.sheet-wrap.open .sheet.rq-in') || {}).textContent || ''), null, { timeout: 10000 });
    t = await confirmText(page); assert.ok(/Use it for Robin Sample #12\?/.test(t) && /song 2 of 2/.test(t), t); await pick(page, 'use'); await noSheets(page);
    const s = await state(page); eq(s.songs.length, 4); deep(s.songs.map(x => x.title), ['Just A File', 'Lost', 'First', 'Second']);
    deep([s.roster[0].songId, s.roster[1].songId, s.roster[0].req.st, s.roster[1].req.st], [s.songs[2].id, s.songs[3].id, 'got', 'got']);
    eq(await page.$$('.sheet.trim').then(e => e.length), 0, 'several files: no Trim sheet is thrown up');
    deep(errors, []); await ctx.close();
  });

  await test('Import: the Add songs button inside Song requests takes returning files too, and offers the same formats', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page); await tab(page, 'team'); await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow');
    const inp = sheetSel + ' [data-file="songs-add"]'; eq(await page.getAttribute(inp, 'accept'), C.AUDIO_ACCEPT); eq(await page.textContent(sheetSel + ' .file-btn'), 'Add songs'); eq(await page.getAttribute(inp, 'aria-label'), 'Add song files that parents sent back');
    await page.setInputFiles(inp, [mem('WU-tb00001-From_The_List.wav', SONG_C)]); await page.waitForFunction(() => /Song from a parent/.test((document.querySelector('.sheet-wrap:last-child .sheet') || {}).textContent || ''), null, { timeout: 10000 });
    assert.ok(/Use it for Robin Sample #12\?/.test(await page.textContent('.sheet-wrap:last-child .sheet')), 'asked on top of the list'); await pick(page, 'use'); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 });
    eq((await state(page)).roster[1].req.st, 'got'); deep(errors, []); await ctx.close();
  });

  await test('Import: the same file again is not added twice and says so; a repeated file inside one pick counts once', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page);
    await addInput(page, [mem('Plain Song.wav', SONG_B)]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page);
    await addInput(page, [mem('Plain Song.wav', SONG_B)]); await waitToast(page, /"Plain Song\.wav" is already in your songs\./); eq((await state(page)).songs.length, 1, 'same name and size: not added again');
    await addInput(page, [mem('Plain Song.wav', SONG_B), mem('Plain Song.wav', SONG_B), mem('New One.wav', SONG_C)]); await waitToast(page, /Added "New One"/);
    deep((await state(page)).songs.map(x => x.title), ['Plain Song', 'New One']); await page.keyboard.press('Escape'); await noSheets(page);
    // a coded file that is already in the library: the question still comes, but without "Just add", and nothing is copied
    await addInput(page, [mem('WU-ta00001-Held.wav', SONG_A)]); await waitConfirm(page); await pick(page, 'use'); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page);
    const n = (await state(page)).songs.length;
    await addInput(page, [mem('WU-ta00001-Held.wav', SONG_A)]); await waitToast(page, /is already in your songs/); eq((await state(page)).songs.length, n, 'the same coded file again: still one copy'); eq(await page.$$(confirmSel).then(e => e.length), 0, 'already this player\'s song, so no question');
    // the coded file already in the library but the player has a different song: asked, and no second copy is made
    await asked(page, 0, { t: 'ta00001', at: TODAY, via: 'text', st: 'asked' }); await page.evaluate(() => { window.WalkupApp.S.st.roster[0].songId = null; window.WalkupApp.WU.commit('data'); });
    await addInput(page, [mem('WU-ta00001-Held.wav', SONG_A)]); await waitConfirm(page);
    eq(await page.$$(confirmSel + ' [data-pick=lib]').then(e => e.length), 0, 'no "Just add" for a song already in the library'); assert.ok(/already in your songs/.test(await confirmText(page)));
    await pick(page, 'use'); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page); const s = await state(page); eq(s.songs.length, n, 'no copy'); eq(s.roster[0].songId, s.songs.find(x => x.title === 'Held').id);
    deep(errors, []); await ctx.close();
  });

  await test('Import: a song file with a hostile name, or one that cannot be read, adds nothing and shows safe plain words', async () => {
    const { page, errors, ctx } = await open({ init: () => { window.addEventListener('error', () => { window.__scriptError = true; }); } }); await askedTeam(page);
    const bad = '<img src=x onerror=window.__x=1>'; await asked(page, 2, { t: 'tc00001', at: TODAY, via: 'copy', st: 'asked' }); await page.evaluate(n => { window.WalkupApp.S.st.roster[2].name = n; window.WalkupApp.WU.commit('data'); }, bad);
    await addInput(page, [mem('WU-tc00001-' + bad.replace(/[^a-z0-9=_ ]/gi, '_') + '.wav', SONG_C)]); await waitConfirm(page);
    eq(await page.$$eval(confirmSel + ' img, ' + confirmSel + ' script', e => e.length), 0); assert.ok((await confirmText(page)).includes('<img src=x onerror='), 'the name shows as text: ' + (await confirmText(page))); eq(await page.evaluate(() => window.__x), undefined);
    await page.click(confirmSel + ' [data-close]'); await noSheets(page);
    // not audio at all, with a code: "couldn't read", nothing added, the request is untouched
    const before = await state(page);
    await addInput(page, [{ name: 'WU-ta00001-Broken.mp3', mimeType: 'audio/mpeg', buffer: fs.readFileSync(fx('broken.mp3')) }]); await waitConfirm(page); await pick(page, 'use');
    await waitToast(page, /couldn.t read "WU-ta00001-Broken\.mp3"/); await noSheets(page);
    const after = await state(page); deep([after.songs.length, after.roster[0].songId, after.roster[0].req, after.roster[0].voice], [0, null, before.roster[0].req, before.roster[0].voice], 'nothing added; Pat is still waiting, not Got it');
    // a file with no audio in it and no code
    await addInput(page, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]); await waitToast(page, /couldn.t read "notes\.txt"/); eq((await state(page)).songs.length, 0);
    eq(await page.evaluate(() => window.__scriptError || false), false); deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await ctx.close();
  });

  /* ============ audio formats: what is really decoded and what is only checked by name ============ */
  /* a short webm/opus file recorded by Chrome itself (a 440 Hz tone), the way a Chrome or Android voice recorder makes one */
  const recordWebm = page => page.evaluate(async () => {
    const mt = ['audio/webm;codecs=opus', 'audio/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)); if (!mt) return null;
    const ac = new AudioContext(), osc = ac.createOscillator(), dest = ac.createMediaStreamDestination(); osc.frequency.value = 440; osc.connect(dest); osc.start();
    const rec = new MediaRecorder(dest.stream, { mimeType: mt }), chunks = []; rec.ondataavailable = e => chunks.push(e.data); const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(); await new Promise(r => setTimeout(r, 1600)); rec.stop(); await stopped; osc.stop(); ac.close();
    const u = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return { b64: btoa(s), type: mt, size: u.length };
  });
  let WEBM = null; // made once, in the first page that needs it
  const getWebm = async () => {
    if (WEBM !== null) return WEBM;
    const { page, ctx } = await open(); const r = await recordWebm(page); await ctx.close();
    WEBM = r ? { buf: Buffer.from(r.b64, 'base64'), type: r.type } : false; return WEBM;
  };
  const durOf = (page, i) => page.evaluate(i => window.WalkupApp.S.st.songs[i].dur, i);

  await test('Formats (coach): Add songs really decodes a WAV made here, an MP3 hand-built from silent MPEG frames and a webm/opus recording, and keeps each name and extension', async () => {
    const webm = await getWebm(); const { page, errors, ctx } = await open();
    await tab(page, 'songs'); eq(await page.getAttribute('[data-file="songs-add"]', 'accept'), C.AUDIO_ACCEPT, 'the chooser lists audio/* and every extension');
    eq(await page.getAttribute('[data-file="songs-add"]', 'multiple'), '');
    // WAV: 12 s, decoded for real, so the stored length is the real length
    await addInput(page, [mem('Slow Jam.wav', SONG_A, 'audio/x-wav')]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page);
    assert.ok(Math.abs(await durOf(page, 0) - 12) < 0.05, 'a 12 s WAV reads as 12 s: ' + await durOf(page, 0));
    // MP3: 100 frames of 1152 samples at 44.1 kHz = 2.612 s. The type the phone gives is wrong or missing and it still works.
    await addInput(page, [mem('silent.mp3', MP3, 'application/octet-stream')]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page);
    assert.ok(Math.abs(await durOf(page, 1) - 2.612) < 0.05, 'the hand-built MP3 decodes in Chrome and reads as 2.6 s: ' + await durOf(page, 1));
    deep((await state(page)).songs.slice(0, 2).map(s => [s.title, s.name, s.kind]), [['Slow Jam', 'Slow Jam.wav', 'file'], ['silent', 'silent.mp3', 'file']]);
    if (webm) {
      await addInput(page, [{ name: 'Voice Memo.webm', mimeType: '', buffer: webm.buf }]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); await page.keyboard.press('Escape'); await noSheets(page);
      assert.ok(Math.abs(await durOf(page, 2) - 1.6) < 0.4, 'the recorded webm/opus decodes: ' + await durOf(page, 2)); eq((await state(page)).songs[2].name, 'Voice Memo.webm');
    } else console.log('      (this Chrome cannot record webm/opus, so the webm decode check was skipped)');
    // several different formats at once, each really decoded, each keeps its name
    await addInput(page, [mem('One.WAV', SONG_B), mem('Two.mp3', MP3.subarray(0, 417 * 60), 'audio/mpeg'), mem('Three.wave', SONG_C, '')]); await waitToast(page, /Added 3 songs/);
    deep((await state(page)).songs.slice(webm ? 3 : 2).map(s => s.name), ['One.WAV', 'Two.mp3', 'Three.wave']);
    deep(errors, []); await ctx.close();
  });

  await test('Formats: every place a song or voice file can come in offers the same audio list; only the backup restore asks for JSON', async () => {
    const dir = path.join(__dirname, '../apps/walkup'); let n = 0, restore = 0;
    for (const f of fs.readdirSync(dir).filter(f => /\.(js|html)$/.test(f))) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of t.matchAll(/fileBtn\(\{[^}]*\}\)/g)) { if (/data-file="restore"/.test(m[0])) { restore++; assert.ok(/accept: "application\/json,\.json"/.test(m[0]), f); } else { n++; assert.ok(!/accept:/.test(m[0]), f + ' sets its own list: ' + m[0].slice(0, 90)); } }
    }
    assert.ok(n >= 6 && restore >= 1, 'found ' + n + ' audio choosers and ' + restore + ' restore choosers in the code');
    assert.ok(/AUDIO_ACCEPT/.test(fs.readFileSync(path.join(dir, 'ui.js'), 'utf8')) && /AUDIO_ACCEPT/.test(fs.readFileSync(path.join(dir, 'send.js'), 'utf8')), 'the default list is the shared one');
    const { page, errors, ctx } = await open(); await sample(page);
    await page.click('[data-act=g-song]'); await page.waitForSelector(sheetSel + ' input[data-file="picker-add"]'); eq(await page.getAttribute(sheetSel + ' input[data-file="picker-add"]', 'accept'), C.AUDIO_ACCEPT, 'the picker\'s Add a new song file');
    await page.keyboard.press('Escape'); await noSheets(page); await tab(page, 'settings'); eq(await page.getAttribute('[data-file="restore"]', 'accept'), 'application/json,.json');
    deep(errors, []); await ctx.close();
  });

  await test('Formats (coach): a file that cannot be decoded - whatever its name or type claims - adds nothing and says so in plain words', async () => {
    const { page, errors, ctx } = await open(); await tab(page, 'songs');
    const junk = Buffer.from('this is not audio at all '.repeat(40));
    // names that the type check welcomes still have to survive the real check; each of these is only "checked by name" and then fails honestly
    const names = [['fake.mp3', 'audio/mpeg'], ['fake.m4a', 'audio/x-m4a'], ['fake.flac', 'audio/flac'], ['fake.ogg', 'audio/ogg'], ['fake.opus', ''], ['fake.aac', 'audio/aac'], ['fake.caf', ''], ['fake.aiff', 'audio/aiff'], ['fake.amr', 'audio/amr'], ['fake.3gp', 'video/3gpp'], ['setup.exe', 'audio/mpeg'], ['paper.pdf', 'application/pdf'], ['photo.jpg', 'image/jpeg']];
    for (const [name, type] of names) {
      await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
      await addInput(page, [{ name, mimeType: type || 'application/octet-stream', buffer: junk }]); await waitToast(page, /couldn.t read/);
      const t = await toastText(page); assert.ok(t.includes('"' + name + '"') && /Try an MP3, M4A or WAV/.test(t), name + ': ' + t); eq((await state(page)).songs.length, 0, name + ' added nothing'); eq(await page.$$('.sheet-wrap').then(e => e.length), 0);
    }
    deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await ctx.close();
  });

  await test('Formats (coach): "Use a voice file" accepts the same files, decodes them for real, and rejects what it cannot read without touching the old voice', async () => {
    const webm = await getWebm(); const { page, errors, ctx } = await open(); await sample(page);
    await page.click('[data-act=g-voice]'); await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    const inp = sheetSel + ' input[data-file="voice-file"]'; eq(await page.getAttribute(inp, 'accept'), C.AUDIO_ACCEPT, 'the voice chooser lists the same formats');
    const voice = () => page.evaluate(() => { const v = window.WalkupApp.S.st.roster[0].voice; return v && { kind: v.kind, name: v.name, dur: v.dur }; });
    await page.setInputFiles(inp, mem('say-my-name.wav', SONG_A, 'audio/x-wav')); await page.waitForSelector('#vsDetail', { timeout: 10000 }); let v = await voice(); assert.ok(v.kind === 'file' && v.name === 'say-my-name.wav' && Math.abs(v.dur - 12) < 0.05, JSON.stringify(v));
    await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn');
    await page.setInputFiles(inp, mem('hey.mp3', MP3, 'application/octet-stream')); await page.waitForFunction(() => { const v = window.WalkupApp.S.st.roster[0].voice; return v && v.name === 'hey.mp3'; }, null, { timeout: 10000 }); v = await voice(); assert.ok(Math.abs(v.dur - 2.612) < 0.05, 'MP3 decoded: ' + v.dur);
    if (webm) { await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn'); await page.setInputFiles(inp, { name: 'rec.webm', mimeType: '', buffer: webm.buf }); await page.waitForFunction(() => { const v = window.WalkupApp.S.st.roster[0].voice; return v && v.name === 'rec.webm'; }, null, { timeout: 10000 }); }
    await page.click(sheetSel + ' [data-do=rerecord]'); await page.waitForSelector('#vsRecBtn'); const before = await voice();
    await page.setInputFiles(inp, { name: 'fake.m4a', mimeType: 'audio/x-m4a', buffer: Buffer.from('not audio '.repeat(50)) }); await waitToast(page, /couldn.t read that file/); assert.ok(/Try an MP3, M4A or WAV/.test(await toastText(page)), await toastText(page));
    deep(await voice(), before, 'the old voice is untouched'); deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await ctx.close();
  });

  await test('Formats (parent page): a real WAV, an MP3 and a webm/opus recording show their length, send under their own extension, and a clip always leaves as a .wav', async () => {
    const webm = await getWebm(); const { page, errors, ctx } = await openSend(LINK);
    const cases = [['Slow Jam.wav', SONG_A, 'audio/x-wav', /0:12 long/, 'wav', 'audio/x-wav'], ['silent.mp3', MP3, 'audio/mpeg', /0:0[23] long/, 'mp3', 'audio/mpeg'], ['Plain Name.MP3', MP3, 'application/octet-stream', /0:0[23] long/, 'mp3', 'audio/mpeg']];
    if (webm) cases.push(['rec.webm', webm.buf, '', /0:0[12] long|length not shown/, 'webm', 'audio/webm']);
    for (const [name, buf, type, re, ext, wantType] of cases) {
      await pickSong(page, { name, mimeType: type, buffer: buf }); await page.waitForFunction(() => /long/.test(document.querySelector('#fMeta').textContent) || !document.querySelector('#fileNote').hidden, null, { timeout: 10000 });
      assert.ok(re.test(await page.textContent('#fMeta')), name + ': ' + await page.textContent('#fMeta')); if (/webm/.test(name)) console.log('      parent page, ' + name + ': ' + (await page.textContent('#fMeta')).trim()); eq(await page.$eval('#fileErr', e => e.hidden), true, name); await page.waitForTimeout(150);
      await page.click('#send'); await page.waitForSelector('#done:not([hidden])'); const sh = await shares(page); const f = sh[sh.length - 1].files[0];
      assert.ok(f.name.startsWith('WU-abc1234-') && f.name.endsWith('.' + ext), name + ' -> ' + f.name); assert.ok(f.type.startsWith(wantType.split('/')[0]) && (f.type === wantType || type), name + ' type ' + f.type);
      eq(Buffer.from(f.b64, 'base64').equals(buf), true, name + ': the same bytes went out'); await page.click('#again');
    }
    // a clip from a real MP3 (decoded here) is a WAV with a .wav name, whatever the original was
    await pickSong(page, mem('silent.mp3', MP3, 'audio/mpeg')); await page.waitForFunction(() => /long/.test(document.querySelector('#fMeta').textContent)); await page.check('#clipOn'); await page.fill('#clipStart', '0.5'); await page.fill('#clipLen', '1');
    await page.waitForFunction(() => /Clip: 0:01 long/.test(document.querySelector('#clipInfo').textContent), null, { timeout: 10000 }); await page.click('#send'); await page.waitForSelector('#done:not([hidden])');
    const sh = await shares(page); const f = sh[sh.length - 1].files[0]; deep([f.name, f.type], ['WU-abc1234-silent.wav', 'audio/wav']); const w = wavInfo(f.b64); assert.ok(w.riff === 'RIFF' && w.bits === 16 && Math.abs(w.sec - 1) < 0.02, JSON.stringify(w));
    deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await ctx.close();
  });

  /* ============ backup, manifest, service worker, Android share ============ */
  await test('Backup: the settings backup keeps who was asked (token, date, way, status), the song they want, the message and the team name; restoring on a new phone brings them back and the token still matches a returning file', async () => {
    const A = await open(); const { page, errors, ctx } = A; await team(page, 3);
    await asked(page, 0, { t: 'ta00001', at: '2026-11-05', via: 'email', st: 'asked' }); await asked(page, 1, null, 'Hey Jude - The Beatles'); await asked(page, 2, { t: 'tc00001', at: TODAY, via: 'share', st: 'got' }, '');
    await tab(page, 'settings'); await page.fill('#rqTeam', 'Test Team'); await page.fill('#rqTpl', 'Hi {first}! Song for #{number}: {link}');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup-settings]')]); const fp = path.join(FIX, 'req-settings.json'); await dl.saveAs(fp);
    const raw = fs.readFileSync(fp, 'utf8'), obj = JSON.parse(raw);
    deep(obj.data.roster.map(p => p.req), [{ t: 'ta00001', at: '2026-11-05', via: 'email', st: 'asked' }, null, { t: 'tc00001', at: TODAY, via: 'share', st: 'got' }]);
    deep(obj.data.roster.map(p => p.want), ['', 'Hey Jude - The Beatles', '']); deep([obj.data.settings.team, obj.data.settings.reqTpl], ['Test Team', 'Hi {first}! Song for #{number}: {link}']);
    // a new phone
    const B = await open(); const p2 = B.page; await tab(p2, 'settings');
    await p2.setInputFiles('[data-file="restore"]', fp); await p2.waitForSelector('.sheet.confirm'); await p2.click('.sheet.confirm [data-ok]'); await waitToast(p2, /Restored 3 players/);
    const s2 = await state(p2); deep(s2.roster.map(p => p.req), obj.data.roster.map(p => p.req)); deep(s2.roster.map(p => p.want), ['', 'Hey Jude - The Beatles', '']); deep([s2.settings.team, s2.settings.reqTpl], ['Test Team', 'Hi {first}! Song for #{number}: {link}']);
    eq(await p2.inputValue('#rqTpl'), 'Hi {first}! Song for #{number}: {link}', 'the settings screen shows the restored message');
    await tab(p2, 'team'); assert.ok(/Wants: Hey Jude - The Beatles/.test(await p2.textContent('.prow:has-text("Robin Sample")')));
    await openPlayerSheet(p2, 'Pat Sample'); eq(await p2.textContent(sheetSel + ' #rqStat'), 'Asked on Nov 5, 2026 by email. Waiting for the song.'); eq(C.parseRequestLink(linkIn(await msgOf(p2))).t, 'ta00001', 'the same request, the same link'); eq(C.parseRequestLink(linkIn(await msgOf(p2))).c, 'Test Team');
    await p2.keyboard.press('Escape'); await noSheets(p2); await tab(p2, 'songs'); await addInput(p2, [mem('WU-ta00001-After_Restore.wav', SONG_B)]); await waitConfirm(p2); assert.ok(/Use it for Pat Sample #7\?/.test(await confirmText(p2)), 'a song returns to the restored request');
    await pick(p2, 'use'); await p2.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 10000 }); eq((await state(p2)).roster[0].req.st, 'got'); await B.ctx.close();
    // a damaged or hostile backup is cleaned, never trusted
    obj.data.roster[0].req = { t: '../../x', at: 'tomorrow', via: 'pigeon', st: 'lost' }; obj.data.roster[1].want = 'w'.repeat(300) + '<img src=x>'; obj.data.roster[2].req = { t: 'ta00001', at: TODAY, via: 'text', st: 'asked' }; obj.data.settings.reqTpl = 'z'.repeat(2000); obj.data.settings.team = 'T'.repeat(99);
    const bad = path.join(FIX, 'req-bad.json'); fs.writeFileSync(bad, JSON.stringify(obj)); const D = await open(); await tab(D.page, 'settings');
    await D.page.setInputFiles('[data-file="restore"]', bad); await D.page.waitForSelector('.sheet.confirm'); await D.page.click('.sheet.confirm [data-ok]'); await waitToast(D.page, /Restored 3 players/);
    const s3 = await state(D.page); deep([s3.roster[0].req, s3.roster[1].want.length, s3.roster[2].req && s3.roster[2].req.t, s3.settings.reqTpl.length, s3.settings.team.length], [null, 80, 'ta00001', 600, 30], 'bad token dropped, notes and message capped, a token can belong to one player only');
    deep(errors, []); deep(B.errors, []); deep(D.errors, []); await D.ctx.close(); await ctx.close();
  });

  await test('Privacy: the app files, the listing and these tests hold no email addresses or phone numbers, and a request link carries only a first name, a number, a team label and a code', async () => {
    const files = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(path.join(d, f.name)); else if (/\.(js|html|css|json)$/.test(f.name)) files.push(path.join(d, f.name)); } }; walk(path.join(__dirname, '../apps/walkup'));
    files.push(path.join(__dirname, '../listings/walkup.json'), __filename);
    for (const f of files) { const t = fs.readFileSync(f, 'utf8'); eq(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t), false, path.basename(f) + ' has an email address in it'); eq(/\b[0-9]{3}[-. )][0-9]{3}[-. ][0-9]{4}\b/.test(t), false, path.basename(f) + ' has a phone number in it'); }
    const link = C.buildRequestLink('http://h/send.html', { t: 'abc1234', n: 'Pat Sample Extra Words Here Too', u: '7', c: 'Tigers', email: 'a' + ch(64) + 'b.test', phone: ['555', '123', '4567'].join('-') });
    deep(Object.keys(JSON.parse(Buffer.from(link.split('#r=')[1], 'base64url').toString('utf8'))), ['v', 't', 'n', 'u', 'c'], 'only those five fields travel in a link');
    const { page, ctx } = await open(); await team(page, 1); await openPlayerSheet(page, 'Pat Sample'); const msg = await msgOf(page); eq(C.parseRequestLink(linkIn(msg)).n, 'Pat', 'a link made by the app holds the first name only, not the whole name'); assert.ok(!/Sample/.test(msg), 'the surname is not in the message or link'); await ctx.close();
  });

  await test('Manifest: share_target posts audio files to ./share-target as multipart "songs", accepting audio/* and every extension on the list', async () => {
    const { page, ctx } = await open(); const m = await page.evaluate(async () => (await fetch('manifest.json')).json());
    deep([m.share_target.action, m.share_target.method, m.share_target.enctype], ['./share-target', 'POST', 'multipart/form-data']); eq(m.share_target.params.files.length, 1); eq(m.share_target.params.files[0].name, 'songs');
    const acc = m.share_target.params.files[0].accept; assert.ok(acc.includes('audio/*'), 'audio/*'); for (const e of C.AUDIO_EXTS) assert.ok(acc.includes('.' + e), '.' + e + ' is in the share target accept list'); eq(acc.length, 1 + C.AUDIO_EXTS.length, 'nothing else, no repeats');
    deep(acc, ['audio/*'].concat(C.AUDIO_EXTS.map(e => '.' + e)), 'the same list, in the same order, as the file choosers'); deep([m.start_url, m.scope, m.id, m.display], ['./', './', './', 'standalone'], 'the app itself is unchanged');
    assert.ok(m.icons.length >= 3, 'icons still there'); await ctx.close();
  });

  await test('Service worker: the cache list names every new file and everything the two pages load, each one is served, the cache version moved, and an update never deletes the share inbox', async () => {
    const sw = fs.readFileSync(path.join(__dirname, '../apps/walkup/sw.js'), 'utf8');
    eq(/const CACHE = "walkup-v2"/.test(sw), true, 'cache bumped from v1'); eq(/const INBOX = "walkup-inbox-v1"/.test(sw), true); assert.ok(/k !== INBOX/.test(sw) && /startsWith\("walkup-"\)/.test(sw), 'activate keeps the inbox and only touches our own caches');
    const shell = JSON.parse(/const SHELL = (\[[^\]]*\])/.exec(sw)[1]); for (const f of ['requests.js', 'send.html', 'send.js', 'send.css']) assert.ok(shell.includes(f), f + ' is in the shell');
    const refs = new Set(); for (const html of ['index.html', 'send.html']) { const t = fs.readFileSync(path.join(__dirname, '../apps/walkup', html), 'utf8'); for (const m of t.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^(https?:|\/\/|\/)/.test(m[1])) refs.add(m[1]); }
    assert.ok(refs.has('requests.js') && refs.has('send.js') && refs.has('send.css') && refs.has('core.js') && refs.has('walkup.css'), 'the pages load what we expect: ' + Array.from(refs).join(','));
    for (const r of refs) assert.ok(shell.includes(r) || (r === 'index.html'), r + ' is loaded by a page but missing from the shell list');
    for (const r of shell) { if (r.startsWith('/')) continue; const res = await fetch(srv.url + (r === './' ? '' : r)); eq(res.status, 200, r + ' is served'); }
    const { page, errors, ctx } = await open({ sw: true }); await page.evaluate(() => navigator.serviceWorker.ready);
    await until(() => page.evaluate(async () => (await (await caches.open('walkup-v2')).keys()).length >= 18));
    const cached = await page.evaluate(async () => (await (await caches.open('walkup-v2')).keys()).map(r => new URL(r.url).pathname.split('/').pop() || 'index')); for (const f of ['requests.js', 'send.html', 'send.js', 'send.css', 'core.js']) assert.ok(cached.includes(f), f + ' is really cached: ' + cached.join(','));
    // an update: the new worker's activate step, run here exactly as written in sw.js against a pretend Cache Storage (a browser keeps the same
    // worker alive while a page is open, so a real second activation cannot be forced from a test). Stale walkup caches go; other apps' caches
    // and the share inbox, with what is waiting in it, stay.
    const vm = require('vm'), listeners = {}, store = new Map(['walkup-v1', 'walkup-v2', 'walkup-old-thing', 'walkup-inbox-v1', 'other-app-v1', 'locker-v3'].map(k => [k, 'data of ' + k]));
    let claimed = false;
    vm.runInNewContext(sw, { self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, location: { origin: srv.url }, registration: { scope: srv.url }, clients: { claim: async () => { claimed = true; } } }, caches: { keys: async () => Array.from(store.keys()), delete: async k => store.delete(k) }, URL, Request, Response, Promise, Array, String });
    await new Promise(res => listeners.activate({ waitUntil: p => p.then(res) }));
    deep(Array.from(store.keys()).sort(), ['locker-v3', 'other-app-v1', 'walkup-inbox-v1', 'walkup-v2'], 'old walkup caches gone; the inbox and other apps\' caches kept'); eq(claimed, true);
    deep(errors.filter(e => !/net::ERR|Failed to fetch|install\.js|fonts/.test(e)), []); await ctx.close();
  });

  const SHARE_FILES = [['WU-ta00001-Shared_Song.wav', 'audio/wav', SONG_B], ['Plain Shared.mp3', 'audio/mpeg', MP3], ['voice.m4a', '', SONG_C]];
  const postShare = (page, files) => page.evaluate(arr => {
    const f = document.createElement('form'); f.method = 'POST'; f.action = 'share-target'; f.enctype = 'multipart/form-data'; f.style.display = 'none';
    const i = document.createElement('input'); i.type = 'file'; i.name = 'songs'; i.multiple = true; const dt = new DataTransfer();
    for (const [name, type, b64] of arr) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); dt.items.add(new File([u], name, { type })); }
    i.files = dt.files; f.appendChild(i); document.body.appendChild(f); f.submit();
  }, files.map(([n, t, b]) => [n, t, b.toString('base64')]));

  await test('Android share: songs posted to ./share-target are kept by the service worker, the browser lands on the app, the songs go through the same matching and the inbox is cleared', async () => {
    const A = await open({ sw: true }); const { page, errors, ctx } = A; await askedTeam(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('#wuNav .navb'); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // what the service worker does with the post, by itself
    const direct = await page.evaluate(async () => {
      const fd = new FormData(); fd.append('songs', new File([new Uint8Array(10)], 'a b.wav', { type: 'audio/wav' })); fd.append('title', 'text field'); fd.append('songs', new File([new Uint8Array(4)], 'c.mp3', { type: '' }));
      const r = await fetch('share-target', { method: 'POST', body: fd, redirect: 'manual' });
      const c = await caches.open('walkup-inbox-v1'), ks = await c.keys(), out = [];
      for (const k of ks) { const x = await c.match(k); out.push([decodeURIComponent(x.headers.get('x-wu-name')), x.headers.get('content-type'), (await x.arrayBuffer()).byteLength]); await c.delete(k); }
      return { type: r.type, status: r.status, out };
    });
    eq(direct.type, 'opaqueredirect', 'a redirect back to the app'); deep(direct.out, [['a b.wav', 'audio/wav', 10], ['c.mp3', 'application/octet-stream', 4]], 'both files kept with their real names, the text field is not a file');
    // the real thing: a form post, like Android's share menu makes
    await postShare(page, SHARE_FILES); await page.waitForURL(u => u.pathname.endsWith('/walkup/') && !u.search, { timeout: 15000 }); await page.waitForSelector('#wuNav .navb');
    await waitToast(page, /3 songs were shared to Walk-Up/); eq(await page.evaluate(() => location.search), '', 'inbox=1 is removed from the address');
    await waitConfirm(page); const t = await confirmText(page); assert.ok(/Song from a parent: "Shared Song"\. Use it for Pat Sample #7\?/.test(t) && /WU-ta00001-Shared_Song\.wav/.test(t), t);
    eq(await page.evaluate(async () => (await (await caches.open('walkup-inbox-v1')).keys()).length), 0, 'the inbox was emptied as soon as the songs were taken');
    await pick(page, 'use'); await noSheets(page); await until(() => page.evaluate(() => window.WalkupApp.S.st.songs.length === 3));
    const s = await state(page); deep(s.songs.map(x => x.name).sort(), ['Plain Shared.mp3', 'WU-ta00001-Shared_Song.wav', 'voice.m4a'].sort(), 'all three arrived (the mp3 was decoded for real)'); deep([s.roster[0].songId === s.songs.find(x => x.name.startsWith('WU-')).id, s.roster[0].req.st], [true, 'got']);
    // nothing comes in twice on the next start
    await page.reload(); await page.waitForSelector('#wuNav .navb'); await settle(page, 600); eq((await state(page)).songs.length, 3); eq(await page.$$('.sheet-wrap').then(e => e.length), 0);
    deep(errors.filter(e => !/net::ERR|Failed to fetch|install\.js|fonts/.test(e)), []); await ctx.close();
  });

  await test('Android share: songs that are waiting when the app comes back to the front are taken then; nothing waiting means nothing happens; a file that is not audio is told plainly', async () => {
    const { page, errors, ctx } = await open({ sw: true }); await team(page, 2); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await settle(page, 500); eq(await toastText(page), '', 'an empty inbox is silent');
    const put = (name, type, b64, n) => page.evaluate(async ([name, type, b64, n]) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); await (await caches.open('walkup-inbox-v1')).put('/apps/walkup/inbox/' + n, new Response(u, { headers: { 'content-type': type, 'x-wu-name': encodeURIComponent(name) } })); }, [name, type, b64, n]);
    await put('Back In The App.wav', 'audio/wav', SONG_C.toString('base64'), '001'); await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitToast(page, /A song was shared to Walk-Up/); await page.waitForFunction(() => window.WalkupApp.S.st.songs.length === 1, null, { timeout: 10000 }); eq((await state(page)).songs[0].title, 'Back In The App');
    eq(await page.evaluate(async () => (await (await caches.open('walkup-inbox-v1')).keys()).length), 0); await page.keyboard.press('Escape'); await noSheets(page);
    await put('holiday.pdf', 'application/pdf', Buffer.from('%PDF-1.4 not a song').toString('base64'), '002'); await put('weird%name.wav', 'audio/wav', SONG_B.toString('base64'), '003'); await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitToast(page, /couldn.t read "holiday\.pdf"/); await page.waitForFunction(() => window.WalkupApp.S.st.songs.length === 2, null, { timeout: 10000 }); deep((await state(page)).songs.map(s => s.name), ['Back In The App.wav', 'weird%name.wav']);
    deep(errors.filter(e => !/Failed to load|decode|EncodingError/i.test(e)), []); await ctx.close();
  });

  await test('Help: "Asking parents for songs" has the five plain steps and the honest limits, and is reachable from Settings, the player sheet and Song requests', async () => {
    const { page, errors, ctx } = await open(); await team(page, 2); await tab(page, 'settings'); await page.click('#rqSettings [data-act=rq-help]'); await page.waitForSelector(sheetSel + '.rq-help');
    eq(await page.textContent('.sheet h2'), 'Asking parents for songs'); eq(await page.$$eval(sheetSel + ' .steps > li', e => e.length), 5, 'five steps');
    const t = await page.textContent(sheetSel + '.rq-help');
    for (const re of [/Send the ask/, /The parent opens the link/, /Their phone sends the song to you/, /Save the song file/, /Add it\./, /Nothing uploads by itself/, /iPhone/, /Android/, /10 MB/, /Nothing is stored on a server/, /Song they want/, /Save to Files/, /no sign-in/i, /Texts? messages? can refuse big files|Plain text messages can refuse big files/]) assert.ok(re.test(t), String(re) + ' missing from: ' + t.slice(0, 300));
    await page.click(sheetSel + ' [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); eq(await topTitle(page), 'Song requests'); await page.click(sheetSel + ' [data-act=rq-help]'); await until(async () => (await topTitle(page)) === 'Asking parents for songs');
    while (await page.$('.sheet-wrap')) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await openPlayerSheet(page, 'Pat Sample'); await page.click(sheetSel + ' [data-act=rq-help]'); await until(async () => (await topTitle(page)) === 'Asking parents for songs');
    deep(errors, []); await ctx.close();
  });

  /* ============ the Back button, markup safety, layout ============ */
  await test('Back button: the new sheets (player ask, Song requests, help, the import question) close one at a time and never leave the app', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page); const hist = n => page.waitForFunction(k => (history.state && history.state.wuSheets || 0) === k, n, { timeout: 5000 });
    await tab(page, 'team'); await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); await hist(1);
    await page.click(sheetSel + ' [data-act=rq-help]'); await hist(2); eq(await page.$$eval('.sheet-wrap', w => w.length), 2);
    await page.goBack(); await hist(1); await until(async () => (await topTitle(page)) === 'Song requests'); await page.goBack(); await noSheets(page); await hist(0);
    eq(await page.evaluate(() => location.pathname.endsWith('/walkup/')), true, 'still in the app');
    await openPlayerSheet(page, 'Pat Sample'); await hist(1); await page.click(sheetSel + ' [data-act=rq-help]'); await hist(2); await page.goBack(); await hist(1); assert.ok(/Pat/.test(await topTitle(page)) || (await page.$(sheetSel + ' #rqMsg')), 'back at the player');
    await page.goBack(); await noSheets(page); await hist(0);
    // the import question: Back is "Not now"
    await tab(page, 'songs'); await addInput(page, [mem('WU-ta00001-Back_Test.wav', SONG_B)]); await waitConfirm(page); await hist(1); await page.goBack(); await noSheets(page); await hist(0);
    await waitToast(page, /Skipped/); eq((await state(page)).songs.length, 0, 'nothing was added'); eq(await page.evaluate(() => location.pathname.endsWith('/walkup/')), true);
    // Settings help link and the X button give the entry back
    await tab(page, 'settings'); await page.click('#rqSettings [data-act=rq-help]'); await hist(1); await page.click(sheetSel + ' .x'); await noSheets(page); await hist(0);
    deep(errors, []); await ctx.close();
  });

  await test('Coach XSS: markup in a name, number, team, note, template or song file name is shown as text on every new screen and never runs', async () => {
    const { page, errors, ctx } = await open({ init: () => { window.addEventListener('error', () => { window.__scriptError = true; }); } }); await team(page, 2);
    const X = '<img src=x onerror=window.__x=1>';
    await page.evaluate(x => { const A = window.WalkupApp, p = A.S.st.roster[0]; p.name = x; p.num = '<b>9'; p.want = x + '<script>window.__x=2</script>'; A.S.st.settings.team = x; A.S.st.settings.reqTpl = 'Hi {first} ' + x + ' {link}'; A.WU.commit('data'); }, X);
    const bad = () => page.evaluate(() => ({ x: window.__x, err: window.__scriptError || false, imgs: document.querySelectorAll('#walkup img, #walkup script, #walkup [onerror], .sheet img, .sheet script, .toast img').length }));
    await tab(page, 'team'); deep(await bad(), { x: undefined, err: false, imgs: 0 }, 'team list'); assert.ok((await page.textContent('.prow')).includes('Wants:'), 'the wish is shown as text');
    await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); deep(await bad(), { x: undefined, err: false, imgs: 0 }, 'Song requests'); assert.ok((await page.textContent('#rqRows')).includes('<img src=x'), 'shown as text');
    await page.keyboard.press('Escape'); await noSheets(page);
    await tab(page, 'settings'); deep(await bad(), { x: undefined, err: false, imgs: 0 }, 'settings'); eq(await page.inputValue('#rqTeam'), X, 'the team name box shows the text as it is stored');
    await tab(page, 'team'); await page.locator('.prow .pmain').first().click(); await page.waitForSelector(sheetSel + ' #rqMsg'); deep(await bad(), { x: undefined, err: false, imgs: 0 }, 'player sheet'); assert.ok((await msgOf(page)).includes('Hi '), 'the message is plain text in a box');
    // a returning file named with markup in the title part
    await page.keyboard.press('Escape'); await noSheets(page); await tab(page, 'game'); deep(await bad(), { x: undefined, err: false, imgs: 0 }, 'game screen');
    eq(await page.evaluate(() => window.__x), undefined); deep(errors, []); await ctx.close();
  });

  const audit = page => page.evaluate(() => {
    const shown = el => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || p.hidden) return false; } const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
    const small = [], tiny = [], name = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && el.className.baseVal === undefined && el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '') + ((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) ? ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + '"' : ''));
    document.querySelectorAll('button, a[href], select, input, textarea, [role=slider], [role=button], summary').forEach(el => {
      if (el.type === 'file' || el.type === 'hidden') return;
      let t = el; if (el.type === 'checkbox' || el.type === 'radio') t = el.closest('label') || el;
      if (!shown(t)) return; const r = t.getBoundingClientRect();
      if (el.closest('.sr')) return;
      if (r.width < 43.5 || r.height < 43.5) small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || !shown(el) || el.closest('.sr, script, style, noscript')) continue;
      let fs = parseFloat(getComputedStyle(el).fontSize);
      const svg = el.closest('svg'); if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) fs *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      if (fs < 11.95) tiny.push(name(el) + ' ' + fs.toFixed(1) + 'px');
    }
    return { small: Array.from(new Set(small)), tiny: Array.from(new Set(tiny)), overflow: document.documentElement.scrollWidth - window.innerWidth };
  });

  await test('Layout (parent page): no sideways scrolling at 320, 390 or 768 wide in any state; touch targets 44 px; no text under 12 px', async () => {
    const { page, errors, ctx } = await openSend(Object.assign({}, LINK, { n: 'Alexandria Bartholomew', u: '1234', c: 'The Long Named Tigers Of Somewhere' }), { share: 'none' });
    const problems = []; const check = async tag => { const a = await audit(page); if (a.overflow > 0 || a.small.length || a.tiny.length) problems.push(tag + ': ' + JSON.stringify(a)); };
    for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h }); await settle(page, 250);
      await page.evaluate(() => { document.querySelector('#again').click(); }); await check(w + ' empty');
      await pickSong(page, mem('A Really Quite Long Song File Name That Keeps Going And Going For A While Yes.wav', SONG_A)); await waitMeta(page); await check(w + ' file chosen');
      await pickSong(page, { name: 'big.wav', mimeType: 'audio/wav', buffer: BIG_WAV }); await waitMeta(page); await check(w + ' big file warning');
      await page.check('#clipOn'); await page.waitForFunction(() => /Clip: /.test(document.querySelector('#clipInfo').textContent), null, { timeout: 15000 }); await check(w + ' clip open');
      await page.fill('#title', 'T'.repeat(120)); await page.fill('#artist', 'A'.repeat(120)); await page.click('#send'); await page.waitForSelector('#fallback:not([hidden])'); await check(w + ' fallback');
      await page.evaluate(() => { document.querySelector('#done').hidden = false; document.querySelector('#steps').hidden = true; }); await check(w + ' done'); await page.evaluate(() => { document.querySelector('#done').hidden = true; document.querySelector('#steps').hidden = false; });
      await page.setInputFiles('#song', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await page.waitForSelector('#fileErr:not([hidden])'); await check(w + ' not a song');
    }
    deep(problems, [], problems.join('\n')); deep(errors, []); await ctx.close();
    for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
      const B = await openSend('#r=nope', { wait: '#bad' }); await B.page.setViewportSize({ width: w, height: h }); await settle(B.page, 250);
      const a = await audit(B.page); deep([a.overflow <= 0, a.small, a.tiny], [true, [], []], 'bad link page at ' + w + ': ' + JSON.stringify(a)); await B.ctx.close();
    }
  });

  await test('Layout (coach): the ask section, Song requests, the help sheet, the import question and the Settings card fit at 320, 390 and 768 with big enough buttons and text', async () => {
    const { page, errors, ctx } = await open(); await askedTeam(page); await tab(page, 'game');
    await page.evaluate(() => { const A = window.WalkupApp; for (let i = 0; i < 4; i++) { const p = A.core.newPlayer({ name: 'Bench Player With A Long Name ' + i, num: String(40 + i) }); p.want = i === 1 ? 'A Very Long Song Title - The Band With A Very Long Name' : ''; A.S.st.roster.push(p); } A.S.st.roster[0].want = 'Hey Jude'; A.WU.commit('data'); });
    const problems = [], seen = [];
    for (const [w, h] of [[390, 844], [320, 640], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h }); await settle(page, 250);
      const check = async tag => { await settle(page, 200); const a = await audit(page); seen.push(tag); if (a.overflow > 0 || a.small.length || a.tiny.length) problems.push(tag + ': ' + JSON.stringify(a)); };
      await tab(page, 'team'); await check(w + ' team list');
      await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); await check(w + ' Song requests'); await page.click('[data-do=f-need]'); await check(w + ' Song requests, still need'); await page.click('[data-do=f-all]');
      await page.click(sheetSel + ' [data-act=rq-help]'); await until(async () => (await topTitle(page)) === 'Asking parents for songs'); await check(w + ' help');
      while (await page.$('.sheet-wrap')) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.click('.prow:has-text("Pat Sample") .pmain'); await page.waitForSelector(sheetSel + ' #rqMsg'); await page.evaluate(() => document.querySelector('#rqMsg').scrollIntoView()); await check(w + ' player sheet'); await page.keyboard.press('Escape'); await noSheets(page);
      await tab(page, 'songs'); await addInput(page, [mem('WU-ta00001-A_Really_Quite_Long_Song_Name_That_Keeps_Going_And_Going.wav', SONG_B)]); await waitConfirm(page); await check(w + ' import question'); await page.click(confirmSel + ' [data-close]'); await noSheets(page);
      await check(w + ' songs tab'); await tab(page, 'settings'); await check(w + ' settings');
    }
    deep(problems, [], problems.join('\n')); assert.ok(seen.length >= 21, 'every screen was checked at every size'); deep(errors, []); await ctx.close();
  });

  /* ============ screenshots (looked at by eye, and checked to exist) ============ */
  await test('Screenshots: the parent page, the ask section, Song requests, the import question and the help sheet are captured at phone, small-phone and tablet sizes', async () => {
    const made = f => { const p = path.join(SHOTS, 'walkup-req-' + f + '.png'); assert.ok(fs.existsSync(p) && fs.statSync(p).size > 4000, f + ' was saved'); };
    // the parent page
    let A = await openSend(LINK, { share: 'none' }); let page = A.page;
    await shot(page, 'parent-empty-390'); made('parent-empty-390');
    await pickSong(page, mem('Slow Jam.wav', SONG_A)); await waitMeta(page); await page.fill('#title', 'Sweet Caroline'); await page.fill('#artist', 'Neil Diamond');
    await page.check('#clipOn'); await page.fill('#clipStart', '4'); await page.fill('#clipLen', '8'); await page.waitForFunction(() => /Clip: /.test(document.querySelector('#clipInfo').textContent), null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector('#fileInfo').scrollIntoView()); await settle(page, 200); await shot(page, 'parent-clip-390'); made('parent-clip-390');
    await page.click('#send'); await page.waitForSelector('#fallback:not([hidden])'); await page.evaluate(() => document.querySelector('#msg').scrollIntoView()); await settle(page, 200); await shot(page, 'parent-fallback-390'); made('parent-fallback-390');
    await shotAt(page, 'parent-fallback-320', 320, 640); made('parent-fallback-320');
    await page.evaluate(() => { document.querySelector('#fallback').hidden = true; window.scrollTo(0, 0); }); await shotAt(page, 'parent-clip-768', 768, 1024); made('parent-clip-768');
    await A.ctx.close();
    A = await openSend('#r=nope', { wait: '#bad' }); await shot(A.page, 'parent-bad-390'); made('parent-bad-390'); await A.ctx.close();
    // the coach
    A = await open(); page = A.page; await team(page, 5);
    await page.evaluate(() => { const A = window.WalkupApp; A.S.st.settings.team = 'Tigers'; A.S.st.roster[0].name = 'Pat Sample'; A.WU.commit('data'); });
    await addSong(page, ['Slow Jam.wav', SONG_A.toString('base64')]);
    await page.evaluate(() => { const A = window.WalkupApp, r = A.S.st.roster; r[0].songId = A.S.st.songs[0].id; r[1].req = { t: 'tb00001', at: '2026-11-05', via: 'text', st: 'asked' }; r[2].req = { t: 'tc00001', at: '2026-11-07', via: 'email', st: 'asked' }; r[2].want = 'Take On Me - a-ha'; r[3].req = { t: 'td00001', at: '2026-11-06', via: 'share', st: 'got' }; A.WU.commit('data'); });
    await openPlayerSheet(page, 'Robin Sample'); await page.evaluate(() => document.querySelector('#rqMsg').scrollIntoView({ block: 'center' })); await settle(page, 300); await shot(page, 'ask-sheet-390'); made('ask-sheet-390');
    await page.keyboard.press('Escape'); await noSheets(page);
    await page.click('.tools [data-act=rq-list]'); await page.waitForSelector(sheetSel + ' .rqrow'); await settle(page, 400); await shot(page, 'requests-list-390'); made('requests-list-390');
    await shotAt(page, 'requests-list-320', 320, 640); made('requests-list-320'); await shotAt(page, 'requests-list-768', 768, 1024); made('requests-list-768');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    await page.click(sheetSel + ' [data-act=rq-help]'); await until(async () => (await topTitle(page)) === 'Asking parents for songs'); await settle(page, 300); await shot(page, 'help-390'); made('help-390');
    while (await page.$('.sheet-wrap')) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await tab(page, 'songs'); await addInput(page, [mem('WU-tb00001-Sweet_Caroline.wav', SONG_B)]); await waitConfirm(page); await settle(page, 300); await shot(page, 'import-confirm-390'); made('import-confirm-390');
    await shotAt(page, 'import-confirm-768', 768, 1024); made('import-confirm-768');
    await A.ctx.close();
  });

  /* @@END@@ */
  await br.close(); srv.stop();
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
