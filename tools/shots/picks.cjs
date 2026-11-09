// Gameday Picks screenshots with made-up demo data. See lib.cjs.
// Firebase and ESPN are both faked in the page: players, picks and schedules below are all invented.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const TODAY = '2026-11-09';
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const NFL = [['KC', 'Chiefs', 'Kansas City', 'e31837'], ['BUF', 'Bills', 'Buffalo', '00338d'], ['PHI', 'Eagles', 'Philadelphia', '004c54'], ['DAL', 'Cowboys', 'Dallas', '003594'], ['SF', '49ers', 'San Francisco', 'aa0000'], ['GB', 'Packers', 'Green Bay', '203731'], ['BAL', 'Ravens', 'Baltimore', '241773'], ['DET', 'Lions', 'Detroit', '0076b6'], ['MIA', 'Dolphins', 'Miami', '008e97'], ['SEA', 'Seahawks', 'Seattle', '002244'], ['CIN', 'Bengals', 'Cincinnati', 'fb4f14'], ['DEN', 'Broncos', 'Denver', 'fb4f14'], ['LAR', 'Rams', 'Los Angeles', '003594'], ['MIN', 'Vikings', 'Minnesota', '4f2683'], ['HOU', 'Texans', 'Houston', '03202f'], ['PIT', 'Steelers', 'Pittsburgh', 'ffb612']];
const NBA = [['BOS', 'Celtics', 'Boston', '007a33'], ['DEN', 'Nuggets', 'Denver', '0e2240'], ['MIL', 'Bucks', 'Milwaukee', '00471b'], ['PHX', 'Suns', 'Phoenix', 'e56020'], ['MIA', 'Heat', 'Miami', '98002e'], ['NYK', 'Knicks', 'New York', '006bb6'], ['LAL', 'Lakers', 'Los Angeles', '552583'], ['GSW', 'Warriors', 'Golden State', '1d428a'], ['DAL', 'Mavericks', 'Dallas', '00538c'], ['OKC', 'Thunder', 'Oklahoma City', '007ac1'], ['MIN', 'Timberwolves', 'Minnesota', '0c2340'], ['CLE', 'Cavaliers', 'Cleveland', '860038']];
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
let eid = 1000;
const ev = (teams, i, j, date, state, sa, sh) => {
  const mk = (t, ha, sc, win) => ({ homeAway: ha, score: sc == null ? undefined : String(sc), winner: win, team: { abbreviation: t[0], shortDisplayName: t[1], location: t[2], color: t[3] } });
  const done = state === 'post';
  return { id: String(eid++), date, competitions: [{ status: { type: { completed: done, state } }, competitors: [mk(teams[i], 'away', sa, done && sa > sh), mk(teams[j], 'home', sh, done && sh > sa)] }] };
};
function slate(teams, n, date, state, base) { // n games on a date, rotating teams
  const out = [], off = Math.floor(rnd() * teams.length);
  for (let g = 0; g < n; g++) { const i = (off + g * 2) % teams.length, j = (off + g * 2 + 1) % teams.length; const a = base + Math.floor(rnd() * 30), h = base + Math.floor(rnd() * 30) + (rnd() > .5 ? 1 : 0);
    out.push(ev(teams, i, j, date + 'T' + (17 + g % 4) + ':00:00Z', state, state === 'pre' ? undefined : a, state === 'pre' ? undefined : (h === a ? h + 3 : h))); }
  return out;
}
const slates = {}; // key -> events
for (let w = 1; w <= 8; w++) slates[`2026-2-${w}`] = slate(NFL, 6, addDays('2026-09-06', (w - 1) * 7), 'post', 10);
// week 9: Thursday and Sunday finished, Monday night live and then upcoming
const w9 = [ev(NFL, 0, 1, '2026-11-05T17:00:00Z', 'post', 27, 24), ev(NFL, 2, 3, '2026-11-08T17:00:00Z', 'post', 31, 17), ev(NFL, 4, 5, '2026-11-08T17:00:00Z', 'post', 20, 23), ev(NFL, 6, 7, '2026-11-08T17:00:00Z', 'post', 28, 21),
  ev(NFL, 8, 9, '2026-11-08T21:00:00Z', 'post', 14, 24), ev(NFL, 10, 11, '2026-11-08T21:00:00Z', 'post', 17, 13), ev(NFL, 12, 13, '2026-11-09T18:00:00Z', 'in', 10, 7), ev(NFL, 14, 15, '2026-11-10T01:15:00Z', 'pre')];
slates['2026-2-9'] = w9;
for (let d = -10; d <= -1; d++) slates['nba-' + addDays(TODAY, d)] = slate(NBA, 4 + (d % 2 ? 1 : 0), addDays(TODAY, d), 'post', 98);
const nbaToday = [ev(NBA, 0, 1, TODAY + 'T23:30:00Z', 'pre'), ev(NBA, 2, 3, TODAY + 'T23:30:00Z', 'pre'), ev(NBA, 4, 5, TODAY + 'T23:30:00Z', 'pre'), ev(NBA, 6, 7, TODAY + 'T23:30:00Z', 'pre'), ev(NBA, 8, 9, TODAY + 'T23:30:00Z', 'pre'), ev(NBA, 10, 11, TODAY + 'T23:30:00Z', 'pre')];
nbaToday.forEach((e, i) => { e.date = TODAY + 'T' + (23 + (i > 3 ? 1 : 0)) + ':' + (i % 2 ? '00' : '30') + ':00Z'; });
slates['nba-' + TODAY] = nbaToday;
// players and picks (accuracy differs so the leaderboard has a real order)
const players = { me: ['Riley', .66], p2: ['Jordan', .7], p3: ['Casey', .58], p4: ['Morgan', .52], p5: ['Avery', .62], p6: ['Quinn', .46] };
const picks = []; // {uid, week, picks}
for (const [key, events] of Object.entries(slates)) for (const [uid, [, acc]] of Object.entries(players)) {
  const p = {}; events.forEach(e => { const c = e.competitions[0].competitors, post = c[0].team && e.competitions[0].status.type.completed;
    const win = post ? (c.find(x => x.winner) || c[0]).team.abbreviation : null, lose = post ? c.find(x => !x.winner).team.abbreviation : null;
    if (post) p[e.id] = rnd() < acc ? win : lose; else if (rnd() < .75 || uid === 'me' && key.startsWith('nba') && events.indexOf(e) < 4) p[e.id] = c[rnd() > .5 ? 0 : 1].team.abbreviation; });
  if (Object.keys(p).length) picks.push({ uid, week: key, picks: p });
}
// my open NBA picks: four of the six made, so the screen shows "4 of 6 picked"
const mineNba = picks.find(x => x.uid === 'me' && x.week === 'nba-' + TODAY); if (mineNba) { const ids = Object.keys(mineNba.picks); ids.slice(4).forEach(i => delete mineNba.picks[i]); nbaToday.slice(0, 4).forEach((e, i) => { mineNba.picks[e.id] = e.competitions[0].competitors[i % 2].team.abbreviation; }); }

const FAKE_FB = `(function(){
  var D = ${JSON.stringify({ players, picks, slates })};
  var P = {}; Object.keys(D.players).forEach(function(u){ P[u] = { name: D.players[u][0], code: u === 'me' ? 'OWNER' : (u < 'p4' ? 'FAMILY2' : 'CREW42'), joinedAt: '2026-08-30T12:00:00Z' }; });
  
  var snap = function(arr){ return { docs: arr.map(function(x){ return { id: x[0], data: function(){ return x[1]; } }; }) }; };
  var COL = { gp_players: Object.keys(P).map(function(u){ return [u, P[u]]; }), 
    gp_picks: D.picks.map(function(x){ return [x.uid + '_' + x.week, x]; }),
    gp_codes: [['FAMILY2', { label: 'Family and cousins', active: true, createdAt: '2026-08-30T12:00:00Z' }], ['CREW42', { label: 'Work friends', active: true, createdAt: '2026-09-02T12:00:00Z' }], ['OLDONE', { label: 'Last season', active: false, createdAt: '2025-08-01T12:00:00Z' }]] };
  var fs = { _init: 0, enablePersistence: function(){ return Promise.resolve(); },
    collection: function(n){ return { onSnapshot: function(cb){ setTimeout(function(){ if (!COL.gp_weeks) COL.gp_weeks = Object.keys(D.slates).map(function(k){ return [k, { games: GPCore.parseGames({ events: D.slates[k] }), updatedAt: '2026-11-09T12:00:00Z' }]; }); cb(snap(COL[n] || [])); }, 20); return function(){}; } }; },
    doc: function(path){ var id = path.split('/')[1], c = path.split('/')[0]; return {
      onSnapshot: function(o, cb){ setTimeout(function(){ cb({ exists: true, metadata: { hasPendingWrites: false }, data: function(){ return P.me; } }); }, 20); return function(){}; },
      set: function(){ return Promise.resolve(); }, update: function(){ return Promise.resolve(); }, delete: function(){ return Promise.resolve(); } }; } };
  var user = { uid: 'me', displayName: 'Riley Demo' };
  var auth = { onAuthStateChanged: function(cb){ setTimeout(function(){ cb(user); }, 10); }, signOut: function(){ return Promise.resolve(); } };
  window.firebase = { apps: [], initializeApp: function(){}, auth: Object.assign(function(){ return auth; }, { GoogleAuthProvider: function(){ this.setCustomParameters = function(){}; } }), firestore: function(){ return fs; } };
})();`;

(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: TODAY });
  await page.route(/gstatic\.com\/firebasejs\/.*-app-compat/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }));
  await page.route(/gstatic\.com\/firebasejs\/.*(auth|firestore)-compat/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route(/firebaseio|googleapis\.com|firestore|natesteele888\.github\.io/, r => r.abort());
  await page.route(/site\.api\.espn\.com/, r => {
    const u = new URL(r.request().url()); const q = u.searchParams; let key = null;
    if (u.pathname.includes('football/nfl')) key = q.get('week') ? `${q.get('year')}-${q.get('seasontype')}-${q.get('week')}` : '2026-2-9';
    else { const s = /(baseball|basketball|hockey)/.exec(u.pathname)[1]; const pre = { basketball: 'nba' }[s]; const d = (q.get('dates') || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); key = pre ? pre + '-' + d : null; }
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ season: { year: 2026, type: 2 }, week: { number: 9 }, events: (key && slates[key]) || [] }) });
  });
  await page.addInitScript(() => { try { localStorage.setItem('gp.sport', 'nba'); } catch (e) {} });
  await page.goto(srv.base + 'picks/'); await page.waitForSelector('.game'); await page.waitForTimeout(600);
  await shot(page, 'picks', 1, 'Pick a side in every game; picks stay open until it starts');
  await page.locator('[data-sport=nfl]').click(); await page.waitForSelector('.game'); await page.waitForTimeout(600);
  await page.locator('.game').nth(2).scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot(page, 'picks', 2, 'Once a game starts, everyone\'s picks show and winners are marked');
  await page.locator('[data-view=board]').click(); await page.waitForTimeout(400);
  await shot(page, 'picks', 3, 'A leaderboard for each league keeps score');
  await page.locator('[data-view=stats]').click(); await page.waitForTimeout(400);
  await shot(page, 'picks', 4, 'See how your picks went, team by team');
  await page.locator('[data-sport=nba]').click(); await page.locator('[data-view=board]').click(); await page.waitForTimeout(400);
  await shot(page, 'picks', 5, 'Switch leagues with one tap: NFL, MLB, NBA and NHL');
  await page.locator('[data-view=admin]').click(); await page.waitForTimeout(400);
  await shot(page, 'picks', 6, 'Invite your crew with a code, and turn it off any time');
  finish('picks'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
