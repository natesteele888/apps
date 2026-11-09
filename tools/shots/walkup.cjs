// Walk-Up screenshots with made-up demo data. See lib.cjs.
// Songs are tones made here (no real music); the player's voice is the phone's computer voice, stubbed so it is the same every run.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const fs = require('fs'), os = require('os'), path = require('path');
const TODAY = '2026-11-09';
function wavFile(samples, sr) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}
/* a made-up "song": chords that change every beat group, with a soft kick on the beat */
function song(sec, sr, chords, bpm) {
  const a = new Float32Array(Math.round(sec * sr)), beat = 60 / bpm;
  for (let i = 0; i < a.length; i++) {
    const t = i / sr, ch = chords[Math.floor(t / (beat * 4)) % chords.length], bt = t % beat;
    a[i] = 0.16 * ch.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) * Math.min(1, t / 0.02) + 0.5 * Math.sin(2 * Math.PI * (90 - 40 * bt) * bt) * Math.exp(-bt * 14);
  }
  return a;
}
const SONGS = [
  ['Big Swing Anthem', [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 277.18, 329.63], [174.61, 220, 261.63]], 112],
  ['Power Chords', [[164.81, 246.94], [146.83, 220], [130.81, 196], [146.83, 220]], 128],
  ['Dugout Groove', [[220, 261.63, 329.63], [246.94, 293.66, 369.99]], 96],
  ['Victory Lap', [[293.66, 369.99, 440], [329.63, 415.3, 493.88], [392, 493.88, 587.33]], 120],
  ['Slow Jam', [[196, 246.94, 293.66], [174.61, 220, 261.63]], 80]
];
const NAMES = [['Riley', '7', 'SS'], ['Jordan', '12', 'CF'], ['Casey', '3', '2B'], ['Morgan', '24', 'C'], ['Avery', '9', '1B'], ['Quinn', '18', '3B'], ['Sam', '5', 'LF'], ['Taylor', '31', 'RF'], ['Alex', '2', 'P']];
const SPY = () => {
  class Utt { constructor(t) { this.text = t; this.rate = 1; this.volume = 1; this.voice = null; } }
  window.SpeechSynthesisUtterance = Utt;
  const fake = { speak(u) { setTimeout(() => { if (u.onend) u.onend({}); }, 60); }, cancel() {}, getVoices() { return [{ name: 'Demo Voice', lang: 'en-US', voiceURI: 'demo-a' }]; }, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
};
(async () => {
  const srv = await serve(), br = await launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'walkup-shots-'));
  const files = SONGS.map(([n, ch, bpm]) => { const f = path.join(tmp, n + '.wav'); fs.writeFileSync(f, wavFile(song(24, 22050, ch, bpm), 22050)); return f; });
  const { page } = await phone(br, { today: TODAY, ctx: { permissions: ['microphone'] } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.addInitScript(SPY);
  await page.goto(srv.base + 'walkup/'); await page.waitForSelector('#wuNav .navb');
  const tab = async t => { await page.click('[data-act=tab][data-tab="' + t + '"]'); await page.waitForTimeout(400); };
  const noSheets = () => page.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 5000 });
  await page.click('text=Add a sample lineup'); await page.waitForSelector('#gPlay');
  await page.waitForTimeout(6000);
  await tab('songs');
  for (const f of files) { await page.setInputFiles('[data-file="songs-add"]', [f]); await page.waitForSelector('.sheet.trim #trMain:not([hidden])', { timeout: 8000 }); await page.waitForTimeout(500); await page.click('.sheet-wrap.open .sheet [data-close].btn'); await noSheets(); }
  // real-sounding fake names, songs given to the players, and a few different mixes
  await page.evaluate(([names]) => {
    const S = WalkupApp.S, st = S.st, WU = WalkupApp.WU;
    st.roster.forEach((p, i) => { p.name = names[i][0]; p.num = names[i][1]; p.pos = names[i][2]; p.songId = st.songs[i % st.songs.length].id; });
    st.roster[2].mix.bal = -35; st.roster[3].mix.bal = 35; st.roster[3].mix.vd = 2.5; st.roster[1].mix.vd = 1.5;
    st.batter = 3;
    WU.commit('data');
  }, [NAMES]);
  const clean = () => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await tab('game'); await page.waitForTimeout(800); await clean();
  await shot(page, 'walkup', 1, 'Your batting order, with who is up and who is on deck');
  await page.click('[data-act=g-mix]'); await page.waitForSelector('.sheet-wrap.open .sheet.mix, .sheet-wrap.open .sheet'); await page.waitForTimeout(1300); await clean();
  await shot(page, 'walkup', 2, 'Balance the voice against the song with one slider');
  await page.click('.mx-tabs [data-tab=timing]'); await page.waitForTimeout(500);
  await shot(page, 'walkup', 3, 'Choose when the voice starts, to the tenth of a second');
  await page.click('.mx-tabs [data-tab=soften]'); await page.waitForTimeout(500);
  await shot(page, 'walkup', 4, 'Soften the music while the name is read');
  await page.keyboard.press('Escape'); await noSheets().catch(() => {});
  await tab('songs'); await page.waitForTimeout(500);
  await shot(page, 'walkup', 5, 'Add each song once, then give it to any player');
  await tab('team'); await page.waitForTimeout(500);
  await shot(page, 'walkup', 6, 'The whole team, with each player\'s song and voice');
  finish('walkup'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
