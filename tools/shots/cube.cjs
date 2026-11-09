// Cube Clock screenshots with made-up solves and a fake leaderboard. See lib.cjs.
// The app lives in natesteele888/cube-clock (read only); its web folder is public/. Point APP_DIR at a checkout of the repo.
//   APP_DIR=/path/to/cube-clock NODE_PATH=/opt/node22/lib/node_modules node tools/shots/cube.cjs
// Firebase is replaced by a small fake (anonymous sign-in and a list of players below), so no real traffic or data is involved.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const path = require('path');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/cube-clock';

// ---- made-up solves: a simple seeded random so every run gives the same screens ----
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const FACES = ['U', 'D', 'L', 'R', 'F', 'B'], AX = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
function scramble3() { const out = []; let last = ''; while (out.length < 20) { const f = FACES[Math.floor(rnd() * 6)]; if (f === last || (out.length && AX[f] === AX[last] && out[out.length - 2] && out[out.length - 2][0] === f)) continue; last = f; out.push(f + ['', "'", '2'][Math.floor(rnd() * 3)]); } return out.join(' '); }
const NOW = new Date('2026-11-09T16:30:00').getTime(), H = 3600e3, DAY = 24 * H;
const at = (daysAgo, h, m) => new Date(NOW - daysAgo * DAY).setHours(h, m, 0, 0);
function session(start, n, lo, hi) { // n solves about 40 to 70 s apart... plus time to scramble, so roughly a minute and a half
  const out = []; let t = start;
  for (let i = 0; i < n; i++) { const ms = Math.round((lo + (hi - lo) * rnd()) * 1000 / 10) * 10; out.push({ t: ms, p: 0, d: t, s: scramble3() }); t += 70e3 + rnd() * 50e3; }
  return out;
}
const s333 = [].concat(session(at(6, 18, 5), 14, 20.5, 27), session(at(4, 17, 40), 16, 17.8, 23.5), session(at(2, 18, 10), 18, 15.2, 20.6), session(at(0, 15, 8), 26, 11.9, 17.2));
s333[s333.length - 4].p = 2000;   // a +2 and a DNF in today's session, like a real one
s333[s333.length - 9].p = -1;
const mk = (n, lo, hi, days) => [].concat(...days.map(([ago, h, m, c]) => session(at(ago, h, m), c, lo, hi)));
const solves = { '333': s333, '222': mk(0, 3.1, 6.8, [[3, 16, 0, 12], [1, 17, 30, 14]]), '444': mk(0, 71, 98, [[5, 16, 10, 6], [2, 16, 40, 8]]), pyra: mk(0, 5.2, 11.5, [[1, 19, 0, 10]]) };

// ---- fake leaderboard players (fictional nicknames) ----
const BOARD = {
  '333': [['Quinn', 8420, 9610, 10240, 212], ['Riley', 9780, 11050, 11690, 154], ['Casey', 10930, 12380, 13010, 97], ['Jordan', 12110, 13420, 14180, 83], ['Morgan', 13350, 14900, 15620, 61], ['Taylor', 15040, 16770, 17350, 44], ['Sam', 16620, 18200, 19060, 38]],
  '222': [['Riley', 1830, 2540, 2910, 301], ['Quinn', 2210, 2980, 3340, 188], ['Casey', 2650, 3470, 3820, 120], ['Sam', 3320, 4190, 4560, 52]],
  '444': [['Quinn', 41200, 47800, 51300, 40], ['Jordan', 58900, 63400, 66100, 22]], pyra: [['Casey', 3120, 4380, 4920, 77], ['Morgan', 4410, 5890, 6420, 35]], '555': [], mega: []
};
const sdkStub = `
export const initializeApp = () => ({});
export const getAuth = () => ({}); export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb({ uid: 'me-uid' }), 0); return () => {}; };
export const signInAnonymously = async () => ({});
export const getFirestore = () => ({}); export const serverTimestamp = () => 0; export const setDoc = async () => {}; export const doc = () => ({});
export const collection = () => ({}); export const where = (f, o, v) => ({ f, v }); export const orderBy = () => ({}); export const limit = n => ({ n });
export const query = (c, ...parts) => ({ parts });
export const onSnapshot = (q, cb) => { const puz = (q.parts.find(p => p.f === 'puzzle') || {}).v; const n = (q.parts.find(p => p.n) || {}).n || 10;
  const rows = (window.__board[puz] || []).slice(); const mine = window.__mine[puz]; if (mine) rows.push(mine);
  rows.sort((a, b) => a[1] - b[1]);
  setTimeout(() => cb({ docs: rows.slice(0, n).map(r => ({ data: () => ({ uid: r[0] === window.__me ? 'me-uid' : 'u-' + r[0], name: r[0], best: r[1], ao5: r[2], ao12: r[3], solves: r[4] }) })) }), 0); return () => {}; };
`;

(async () => {
  const srv = await serve(path.join(APP_DIR, 'public'), 'cube'), br = await launch();
  const { page } = await phone(br, { time: '2026-11-09T16:30:00' });
  // Firebase SDK files from gstatic become the fake above; anything else off this machine is refused.
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: sdkStub }));
  await page.route(/^https?:\/\/(?!localhost)(?!www\.gstatic\.com\/firebasejs)/, r => r.abort());
  const best = list => Math.min(...list.map(x => x.p === -1 ? Infinity : x.t + (x.p || 0)));
  const me = 'Avery';
  const mine = {}; for (const k of Object.keys(solves)) { const l = solves[k]; mine[k] = [me, best(l), k === '333' ? 13760 : null, k === '333' ? 14930 : null, l.length]; }
  await page.addInitScript(([board, mine, me]) => { window.__board = board; window.__mine = mine; window.__me = me; }, [BOARD, mine, me]);
  await page.addInitScript(([solves, me]) => {
    localStorage.setItem('cubeclock.v1', JSON.stringify({ solves, opts: { mode: 'hold', sound: false, scramble: true, view: 'vertical' } }));
    localStorage.setItem('cubeclock.name', me); localStorage.setItem('cubeclock.seen', '1'); localStorage.setItem('cubeclock.seen.timer', '1');
  }, [solves, me]);
  await page.goto(srv.base); await page.waitForSelector('#cube-grid *'); await page.waitForTimeout(700);
  await shot(page, 'cube', 1, 'Pick a puzzle and see your best time on every one');

  await page.evaluate(() => document.getElementById('nav-home').click()); await page.waitForTimeout(300);
  await page.click('#nav-leaders'); await page.waitForSelector('#lead-wrap *'); await page.waitForTimeout(600);
  await shot(page, 'cube', 3, 'A live leaderboard for every puzzle');

  await page.click('#nav-session'); await page.waitForTimeout(600);
  await shot(page, 'cube', 4, 'Each practice session, split up automatically');

  await page.click('#nav-stats'); await page.waitForTimeout(700);
  await shot(page, 'cube', 5, 'Personal best, averages of 5 and 12, and days practised');
  await page.evaluate(() => { const c = document.getElementById('chart-wrap'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 140); }); await page.waitForTimeout(500);
  await shot(page, 'cube', 6, 'A trend graph of every solve, with a rolling average on top');
  // a real solve: hold, release, and stop the timer (the clock is fast-forwarded so it reads 13.48)
  await page.evaluate(() => document.getElementById('nav-home').click()); await page.waitForTimeout(300);
  await page.click('[data-go="333"]'); await page.waitForSelector('#view-timer:not([hidden])'); await page.waitForTimeout(400);
  await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('Space'); await page.waitForTimeout(200);
  await page.clock.fastForward(13480); await page.waitForTimeout(100);
  await page.keyboard.down('Space'); await page.waitForTimeout(100); await page.keyboard.up('Space'); await page.waitForTimeout(900);
  await shot(page, 'cube', 2, 'Hold, release, solve: a fresh scramble for every attempt');
  finish('cube'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
