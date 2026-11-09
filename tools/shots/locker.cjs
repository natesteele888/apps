// Locker screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const TODAY = '2026-11-09'; // Monday
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wd = s => new Date(s + 'T12:00:00Z').getUTCDay();
function doc() {
  const d = n => addDays(TODAY, n);
  const drills = [
    { id: 'drtee', name: 'Tee swings', unit: 'swings', target: 50, days: [0, 1, 2, 3, 4, 5, 6], created: d(-60) },
    { id: 'drwall', name: 'Throws against the wall', unit: 'throws', target: 30, days: [1, 2, 3, 4, 5, 6], created: d(-60) },
    { id: 'drgrd', name: 'Ground balls', unit: 'reps', target: 25, days: [1, 3, 5], created: d(-60) }
  ];
  const days = {};
  for (let n = -21; n <= -1; n++) {
    const k = d(n), w = wd(k), r = {};
    if (n === -1 || n === -9) { days[k] = { r: {}, s: 1, done: false }; if (n === -9) continue; }
    r.drtee = [50]; if (w !== 0) r.drwall = [30]; if ([1, 3, 5].includes(w)) r.drgrd = [25];
    if (n !== -9) days[k] = { r, s: w === 0 ? 2 : 3, done: true };
  }
  days[d(-1)] = { r: { drtee: [50], drwall: [30] }, s: 2, done: false };
  days[d(-1)] = { r: { drtee: [50], drwall: [30], drgrd: [25] }, s: 3, done: true };
  days[d(-9)] = { r: {}, s: 1, done: false };
  days[TODAY] = { r: { drtee: [50], drwall: [18] }, s: 1, done: false };
  const opps = ['Comets', 'Lightning', 'Rockets', 'Hawks', 'Storm', 'Tigers', 'Eagles', 'Wolves'];
  const games = [], arm = [];
  const bats = [[4, 2, 1, 0, 0, 1, 1, 2, 1, 1], [3, 1, 0, 0, 1, 1, 0, 2, 2, 0], [4, 3, 1, 1, 0, 0, 0, 3, 2, 1], [4, 1, 0, 0, 0, 0, 2, 0, 0, 0], [3, 2, 0, 0, 0, 2, 1, 1, 2, 2], [4, 2, 2, 0, 0, 0, 1, 1, 1, 0], [3, 1, 0, 0, 1, 1, 1, 3, 1, 0], [4, 3, 0, 0, 0, 0, 0, 2, 2, 1]];
  const pit = [{ outs: 13, np: 62, k: 5, bb: 2, h: 3, r: 2, er: 2 }, null, { outs: 15, np: 71, k: 6, bb: 1, h: 4, r: 1, er: 1 }, null, { outs: 9, np: 48, k: 3, bb: 2, h: 2, r: 1, er: 1 }, null, { outs: 18, np: 79, k: 7, bb: 1, h: 3, r: 0, er: 0 }, null];
  opps.forEach((o, i) => {
    const date = d(-52 + i * 7), b = bats[i], res = [7, 3, 9, 4, 6, 2, 8, 5][i], th = [4, 5, 2, 6, 6, 3, 1, 5][i];
    const g = { id: 'g' + i + 'x', sport: 'baseball', date, opp: o, result: res > th ? 'W' : res < th ? 'L' : 'T', us: res, them: th, season: '2026', notes: i === 6 ? 'Best outing yet. Fastball felt great.' : '',
      bat: { ab: b[0], h: b[1], d2: b[2], d3: b[3], hr: b[4], bb: b[5], k: b[6], rbi: b[7], r: b[8], sb: b[9] } };
    if (pit[i]) { g.pit = pit[i]; arm.push({ id: 'ar' + i + 'x', date, np: pit[i].np, note: 'Game vs ' + o, gameId: g.id }); }
    games.push(g);
  });
  arm.push({ id: 'ar9x', date: d(-3), np: 35, note: 'Bullpen', gameId: '' });
  return {
    v: 1, id: 'ath1demo', name: 'Riley', sports: ['baseball'], birthYear: 2014, created: d(-60),
    profile: { cardName: 'Riley Hawks', positions: 'SS, P', bats: 'R', throws: 'R', height: "5'0\"", weight: '95 lb', gradYear: 2032, teams: 'Hawks 12U', email: '', phone: '', bio: 'Loves turning two. Works on the changeup every day.', showContact: false, cardSeason: '2026' },
    drills, days, games, settings: { ipg: 6 }, arm: { preset: 'Majors', custom: null, log: arm },
    clips: [
      { id: 'cl1x', title: 'Opposite-field double', url: 'https://example.com/video/1', date: d(-10), tags: ['hitting'], note: 'Hands inside the ball.' },
      { id: 'cl2x', title: 'Changeup grip', url: 'https://example.com/video/2', date: d(-4), tags: ['pitching'], note: 'Keep the arm speed up.' }
    ]
  };
}
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: TODAY });
  const a = doc(); if (!a.arm.custom) delete a.arm.custom;
  await page.addInitScript(a => { try { if (localStorage.getItem('locker.index')) return; localStorage.setItem('locker.meta', JSON.stringify({ lastBackup: '2026-11-08', tips: { today: true, games: true, arm: true, clips: true, card: true }, snooze: null })); localStorage.setItem('locker.a.' + a.id, JSON.stringify(a)); localStorage.setItem('locker.index', JSON.stringify({ v: 1, ids: [a.id], active: a.id })); } catch (e) {} }, a);
  await page.goto(srv.base + 'locker/'); await page.waitForSelector('#top:not([hidden])'); await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0, 0));
  const tab = async t => { await page.click('[data-act=tab][data-tab="' + t + '"]'); await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0, 0)); };
  await shot(page, 'locker', 1, 'Tap off today\'s drills and keep the streak going');
  await tab('games');
  await shot(page, 'locker', 3, 'Every game in one list, with the score and your numbers');
  await page.click('[data-act=gmode][data-v=season]'); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0, 60));
  await shot(page, 'locker', 2, 'A season of games adds up to batting and pitching stats');
  await tab('arm');
  await shot(page, 'locker', 4, 'Pitch counts and the rest days that go with them');
  await tab('clips');
  await shot(page, 'locker', 5, 'Save favorite video links with a note');
  await tab('card');
  await shot(page, 'locker', 6, 'A one-page athlete card made from your own season');
  finish('locker'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
