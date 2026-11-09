// Scoreboard screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish, ROOT } = require('./lib.cjs');
const C = require(ROOT + '/scoreboard/core.js');
const NOW = 1794000000000, TODAY = '2026-11-07';
const T = (g, a) => C.step(g, Object.assign({ t: NOW }, typeof a === 'string' ? { type: a } : a));
const times = (n, a) => Array.from({ length: n }, () => a);
const sc = (team, d, n) => times(n || 1, { type: 'score', team, d });
const TEAMS = [{ n: 'HAWKS', c: C.COLORS[0].hex }, { n: 'JETS', c: C.COLORS[1].hex }];
const mk = (sport, acts, o) => acts.reduce((g, a) => T(g, a), C.newGame(sport, Object.assign({ id: 'demo1', now: NOW, date: TODAY, teams: TEAMS }, o || {})));
const bball = () => mk('basketball', [...sc(0, 3, 3), ...sc(1, 2, 4), ...times(5, { type: 'foul', team: 0 }), ...times(2, { type: 'foul', team: 1 }),
  { type: 'timeout', team: 0, d: -1 }, { type: 'poss', team: 0 }, { type: 'clockSet', ms: 135000, t: 2 }]);
const base = () => mk('baseball', [{ type: 'run', d: 1 }, ...times(3, 'out'), { type: 'run', d: 2 }, 'hit', 'endHalf', { type: 'run', d: 1 }, 'hit', 'error', 'endHalf', 'ball', 'ball', 'strike', 'out']);
const foot = () => mk('football', [...sc(0, 6, 2), ...sc(0, 1, 2), ...sc(1, 3), ...sc(1, 6), { type: 'period', d: 1, t: 1 }, { type: 'poss', team: 0 }, 'nextDown', 'nextDown', { type: 'togo', d: -4 }, { type: 'ballOn', text: 'OWN 35' }, { type: 'timeout', team: 1, d: -1 }, { type: 'clockSet', ms: 411000, t: 2 }]);
const samples = () => JSON.parse(JSON.stringify(C.sampleGames(TODAY, NOW)).replace(/TEAM A/g, 'HAWKS').replace(/TEAM B/g, 'JETS'));
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: TODAY, time: new Date(NOW).toISOString() });
  await page.addInitScript(() => { const s = { released: false, release() { this.released = true; }, addEventListener() {} }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => s } }); });
  await page.goto(srv.base + 'scoreboard/'); await page.waitForSelector('#view .home, #view .board');
  const load = async (st) => {
    await page.evaluate(st => { Object.keys(localStorage).filter(k => k.indexOf('scoreboard.') === 0).forEach(k => localStorage.removeItem(k)); for (const k in st) localStorage.setItem('scoreboard.' + k, typeof st[k] === 'string' ? st[k] : JSON.stringify(st[k])); }, st);
    await page.reload(); await page.waitForSelector('#view .home, #view .board'); await page.waitForTimeout(500);
  };
  const sheet = '.sheet-wrap.open';
  await load({ game: bball(), view: 'board' });
  await shot(page, 'scoreboard', 1, 'Big scores, fouls, timeouts and a clock you can read from the stands');
  await load({ game: base(), view: 'board' });
  await shot(page, 'scoreboard', 2, 'Baseball with innings, balls, strikes and outs');
  await load({ game: foot(), view: 'board' });
  await shot(page, 'scoreboard', 3, 'Football with down and distance, and who has the ball');
  await load({ game: bball(), view: 'board' });
  await page.click('[data-act=b-log]'); await page.waitForSelector(sheet); await page.waitForTimeout(500);
  await shot(page, 'scoreboard', 4, 'Undo any mistake, one change at a time');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.click('[data-act=b-lock]'); await page.waitForSelector('.board.locked'); await page.waitForTimeout(400);
  await shot(page, 'scoreboard', 5, 'Lock the screen so a bumped phone cannot change the score');
  await load({ recent: samples() });
  await page.evaluate(() => { const e = [...document.querySelectorAll('h2,h3,.sec')].find(x => /RECENT/i.test(x.textContent)); if (e) e.scrollIntoView(); else window.scrollTo(0, 99999); }); await page.waitForTimeout(300);
  await shot(page, 'scoreboard', 6, 'Start a game in one tap, and look back at recent finals');
  finish('scoreboard'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
