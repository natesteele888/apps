// LYBS Ballclub screenshots with made-up demo data. See lib.cjs / README.md.
// The app lives in another repo (read only): APP_DIR points at a checkout of lybs-ballclub, served at /lybs-ballclub/.
// The league's Realtime Database, sign-in, and every committed league data file (data/*.json) are replaced by
// fictional ones: a 6-team league (Hawks, Comets, Lightning, Rockets, Owls, Storm), first names only.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/lybs-ballclub';
const ID = 'ballclub', TEAM = 'hawks', DIV = '33696';
const J = o => JSON.stringify(o);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

// ---------------- the made-up league ----------------
const REGISTRY = `window.TEAM_REGISTRY = { codeHashes: {}, teams: { ${TEAM}: { name: 'Hawks', shortName: 'Hawks', sport: 'Baseball', colors: { primary: '#2E52E8', secondary: '#1A2CBD' }, macLeagueDivisionId: '${DIV}', macLeagueDivisionName: 'Majors' } } };`;
const NAMES = ['Hawks', 'Comets', 'Lightning', 'Rockets', 'Owls', 'Storm'];
const TID = Object.fromEntries(NAMES.map((n, i) => [n, String(500100 + i)]));
const REC = { Hawks: [6, 2, 0, 58, 31], Comets: [5, 3, 0, 49, 38], Lightning: [5, 3, 0, 47, 35], Rockets: [3, 4, 1, 36, 41], Owls: [2, 6, 0, 29, 52], Storm: [1, 7, 0, 22, 60] };
const rows = NAMES.map(n => { const [w, l, t, rf, ra] = REC[n], gp = w + l + t, d = rf - ra; return { teamId: TID[n], team: '12u ' + n, gp: String(gp), w: String(w), l: String(l), t: String(t), pct: ((w + t / 2) / gp).toFixed(3).replace(/^0/, ''), rf: String(rf), ra: String(ra), diff: (d > 0 ? '+' : '') + d, isUs: n === 'Hawks' }; });
const tm = (n, score) => ({ teamId: TID[n], name: '12u ' + n, score });
const STANDINGS = { divisions: { [DIV]: { divisionId: DIV, name: 'Majors', rows, fetchedAt: '2026-11-09T14:40:00.000Z', teamDirectory: NAMES.map(n => ({ teamId: TID[n], team: '12u ' + n })),
  todayGames: [
    { gameId: 'g1', time: '6:00 PM', teams: [tm('Comets', null), tm('Hawks', null)], location: 'Riverside Park, Field 2' },
    { gameId: 'g2', time: '6:00 PM', teams: [tm('Lightning', null), tm('Rockets', null)], location: 'Riverside Park, Field 1' },
    { gameId: 'g3', time: '7:45 PM', teams: [tm('Owls', null), tm('Storm', null)], location: 'Riverside Park, Field 1' }] } },
  allTeams: NAMES.map(n => ({ teamId: TID[n], team: '12u ' + n })), scrapedAt: '2026-11-09T14:40:00.000Z' };
const PLAYERS = [['Riley', 'M', 3, 'SS', 'R/R'], ['Jordan', 'K', 7, 'P/1B', 'L/L'], ['Casey', 'T', 12, 'C', 'R/R'], ['Morgan', 'L', 5, '2B', 'R/R'], ['Avery', 'S', 9, 'CF', 'L/R'], ['Quinn', 'B', 21, 'LF', 'R/R'], ['Sam', 'R', 14, '3B', 'R/R'], ['Taylor', 'D', 2, 'RF', 'S/R'], ['Drew', 'P', 18, 'P/OF', 'R/R'], ['Jamie', 'W', 24, '1B', 'L/L'], ['Parker', 'H', 11, 'OF', 'R/R'], ['Skyler', 'N', 30, 'C/3B', 'R/R']]
  .map((p, i) => ({ id: 'r' + i, name: `${p[0]} ${p[1]}.`, number: String(p[2]), position: p[3], batsThrows: p[4] }));
const G = (id, date, opp, ha, time, loc, us, them) => ({ id, date, gameTime: time, arriveTime: time.replace(/(\d+):(\d+)/, (m, h, mi) => `${+h - (mi === '00' ? 1 : 0)}:${mi === '00' ? '30' : '15'}`), opponent: opp, homeAway: ha, location: loc, gameType: 'regular', ourScore: us, oppScore: them });
const GAMES = [
  G('s1', '2026-10-13', 'Owls', 'Home', '6:00 PM', 'Riverside Park, Field 2', 9, 3), G('s2', '2026-10-15', 'Storm', 'Away', '6:00 PM', 'Maple Grove Field', 7, 2),
  G('s3', '2026-10-20', 'Rockets', 'Home', '6:00 PM', 'Riverside Park, Field 2', 4, 6), G('s4', '2026-10-22', 'Lightning', 'Away', '6:00 PM', 'Hillcrest Complex, Field 1', 8, 5),
  G('s5', '2026-10-27', 'Comets', 'Away', '6:00 PM', 'Eastside Field', 5, 3), G('s6', '2026-10-29', 'Owls', 'Away', '6:00 PM', 'Oak Street Field', 11, 4),
  G('s7', '2026-11-03', 'Storm', 'Home', '6:00 PM', 'Riverside Park, Field 2', 10, 1), G('s8', '2026-11-05', 'Rockets', 'Away', '6:00 PM', 'Pine Hill Field', 4, 7),
  G('s9', '2026-11-09', 'Comets', 'Home', '6:00 PM', 'Riverside Park, Field 2'), G('s10', '2026-11-12', 'Lightning', 'Home', '6:00 PM', 'Riverside Park, Field 2'),
  G('s11', '2026-11-16', 'Rockets', 'Away', '6:00 PM', 'Pine Hill Field'), G('s12', '2026-11-19', 'Owls', 'Home', '6:00 PM', 'Riverside Park, Field 2')];
const PRACTICES = [{ id: 'p1', type: 'practice', date: '2026-11-10', time: '5:30 PM', location: 'Riverside Park, Field 3' }, { id: 'p2', type: 'cage', date: '2026-11-11', time: '6:00 PM', location: 'Batting cage at the rec center' }, { id: 'p3', type: 'practice', date: '2026-11-14', time: '9:00 AM', location: 'Riverside Park, Field 3' }];
const ANNOUNCE = [{ id: 'a1', text: 'Tonight: please arrive by 5:30 for warm-ups. Bring water, it is chilly so wear layers.', authorName: 'Coach Taylor', createdAt: '2026-11-09T12:10:00.000Z' }, { id: 'a2', text: 'Picture day moved to Saturday after practice. Wear your jersey.', authorName: 'Coach Taylor', createdAt: '2026-11-07T18:00:00.000Z' }];
const dp = i => ({ id: PLAYERS[i].id, name: PLAYERS[i].name });
const DEPTH = { P: [dp(1), dp(8)], C: [dp(2), dp(11)], '1B': [dp(9), dp(1)], '2B': [dp(3)], '3B': [dp(6), dp(11)], SS: [dp(0), dp(3)], LF: [dp(5)], CF: [dp(4), dp(10)], RF: [dp(7), dp(10)] };
const LINEUPS = [{ id: 'l1', name: 'vs Comets', date: '2026-11-09', slots: [[7, 'RF'], [0, 'SS'], [4, 'CF'], [1, 'P'], [3, '2B'], [6, '3B'], [9, '1B'], [2, 'C'], [5, 'LF']].map(([i, pos]) => ({ playerId: PLAYERS[i].id, name: PLAYERS[i].name, position: pos })) },
  { id: 'l2', name: 'Default lineup', date: '2026-10-20', slots: [[0, 'SS'], [4, 'CF'], [7, 'RF'], [3, '2B'], [1, 'P'], [6, '3B'], [2, 'C'], [9, '1B'], [5, 'LF']].map(([i, pos]) => ({ playerId: PLAYERS[i].id, name: PLAYERS[i].name, position: pos })) }];
const DB = {
  shared: { macLeagueStandings: STANDINGS },
  teams: { [TEAM]: { roster: PLAYERS, schedule: GAMES, practices: PRACTICES, announcements: ANNOUNCE, depthChart: DEPTH, lineups: LINEUPS } },
};
// league files committed in the app repo (real league names, coaches, towns): swapped for fictional ones
const LEAGUE_INFO = { source: 'demo', facilities: [{ town: 'Riverton', name: 'Riverside Park', address: '100 Example Road, Riverton', lat: 42.5, lng: -71.5 }, { town: 'Maple Grove', name: 'Maple Grove Field', address: '20 Sample Street', lat: 42.45, lng: -71.6 }], facilityRules: ['No smoking or vaping at any field.', 'Clean up your dugout after every game.', 'Dogs must be on a leash.'],
  governance: { administratorEmail: '', note: 'Each town gets a single vote on league matters.', officials: [{ name: 'Casey', town: 'Riverton', role: 'President' }, { name: 'Morgan', town: 'Maple Grove', role: 'Rep' }] },
  leagueAges: { 2026: [{ division: 'T-Ball', range: '5/1/2019 to 8/31/2022' }, { division: 'Baseball 8U Rookies', range: '5/1/2017 to 4/30/2020' }, { division: 'Baseball 10U Minors', range: '5/1/2015 to 4/30/2017' }, { division: 'Baseball 12U Majors', range: '5/1/2013 to 4/30/2015' }], 2027: [], note: '' },
  seasons: [{ id: '2026-fall', label: '2026 Fall Season', status: 'current', items: ['Season start: Sunday, September 13th', 'Season conclusion: Thursday, November 19th', 'Majors games: Mondays and Thursdays at 6pm'] }] };
const DATA = {
  'standings-seed.json': STANDINGS, 'league-info.json': LEAGUE_INFO, 'mac-league-clubs.json': { clubs: [] },
  'mac-league-fall-2026-schedule.json': { season: '2026 Fall', weeks: [] }, 'season-archive.json': { teams: [] }, 'team-details-seed.json': { teams: {} },
};

module.exports = { J, CORS, REGISTRY, DB, DATA, TEAM, DIV, ID, APP_DIR, PLAYERS };
if (require.main !== module) return;

(async () => {
  const srv = await serve(APP_DIR, 'lybs-ballclub'), br = await launch();
  const store = JSON.parse(J(DB)); // the fake Realtime Database, in memory
  const { ctx, page } = await phone(br, { today: '2026-11-09', time: '2026-11-09T15:00:00-05:00' });
  const getAt = p => p.split('/').filter(Boolean).reduce((c, k) => (c == null ? null : c[k] ?? null), store);
  const setAt = (p, v) => { const ks = p.split('/').filter(Boolean); let c = store; ks.slice(0, -1).forEach(k => { if (typeof c[k] !== 'object' || !c[k]) c[k] = {}; c = c[k]; }); if (v == null) delete c[ks[ks.length - 1]]; else c[ks[ks.length - 1]] = v; };
  await page.route(/^(?!http:\/\/(localhost|127\.0\.0\.1)).*/, r => r.abort()); // nothing leaves the machine
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.continue());     // generic web fonts only
  await page.route(/firebase(-app|-auth)-compat/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.firebase={initializeApp(){},auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb(null),10)},getRedirectResult(){return Promise.resolve(null)},signOut(){return Promise.resolve()},setPersistence(){return Promise.resolve()}}}};window.firebase.auth.GoogleAuthProvider=function(){};window.firebase.auth.Auth={Persistence:{LOCAL:"local"}};' }));
  await page.route(/firebaseio\.com/, async r => {
    const req = r.request(), u = new URL(req.url()), path = decodeURIComponent(u.pathname).replace(/\.json$/, '');
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return r.fulfill({ contentType: 'application/json', headers: CORS, body: J(getAt(path)) });
    const body = JSON.parse(req.postData() || 'null');
    if (req.method() === 'PATCH') Object.keys(body).forEach(k => setAt(k, body[k])); else setAt(path, body);
    r.fulfill({ contentType: 'application/json', headers: CORS, body: J(body) });
  });
  await page.route(/securetoken\.googleapis\.com|identitytoolkit\.googleapis\.com/, r => r.fulfill({ contentType: 'application/json', headers: CORS, body: J({ idToken: 'demo', id_token: 'demo', refreshToken: 'demo', refresh_token: 'demo', expiresIn: '3600', expires_in: '3600' }) }));
  await page.route(/\/js\/team-registry\.js/, r => r.fulfill({ contentType: 'text/javascript', body: REGISTRY }));
  await page.route(/\/data\/([\w.-]+\.json)/, r => { const f = r.request().url().match(/\/data\/([\w.-]+\.json)/)[1]; return DATA[f] ? r.fulfill({ contentType: 'application/json', body: J(DATA[f]) }) : r.fallback(); });
  // a coach of the Hawks, already signed in with a team code and named
  await page.addInitScript(([t]) => {
    try {
      localStorage.setItem('lybsGateSession', JSON.stringify({ refreshToken: 'demo', teamId: t, role: 'coach' }));
      localStorage.setItem('lybsAuthedTeam', JSON.stringify({ teamId: t, role: 'coach' }));
      localStorage.setItem(`lybsIdentity_${t}_coach`, JSON.stringify({ teamId: t, role: 'coach', name: 'Coach Taylor' }));
    } catch (e) {}
  }, [TEAM]);
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(srv.base); await page.waitForTimeout(2500);
  const go = async (cat, tab) => { await page.locator(`[data-cat=${cat}]`).click(); if (tab) await page.locator(`#tabBar [data-tab=${tab}]`).click(); await page.waitForTimeout(700); };
  const top = () => page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main,.tabPanel,#appShell').forEach(e => e.scrollTop = 0); });
  const scrollTo = sel => page.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, sel);
  await go('home'); await top(); await page.waitForTimeout(500);
  await shot(page, ID, 1, 'Your team home: record, standings and tonight\'s games');
  await page.evaluate(() => { const l = [...document.querySelectorAll('.sectionLabel')].find(e => /^\s*Announcements\s*$/i.test(e.textContent)); if (l) l.scrollIntoView({ block: 'start' }); window.scrollBy(0, -150); }); await page.waitForTimeout(400);
  await shot(page, ID, 2, 'Post updates for families and see what is coming up');
  await go('schedule', 'schedule'); await top(); await page.waitForTimeout(400);
  await shot(page, ID, 3, 'Every game with the score and a win or loss badge');
  await go('roster', 'roster'); await top(); await page.waitForTimeout(400);
  await shot(page, ID, 4, 'The roster with numbers, positions and bats/throws');
  await go('roster', 'lineups'); await page.locator('#tab-lineups .listRow').first().click(); await page.waitForTimeout(600); await top();
  await shot(page, ID, 5, 'Build the batting order and fielding positions for each game');
  await go('standings', 'standings'); await top(); await page.waitForTimeout(400);
  await shot(page, ID, 6, 'Full league standings with runs for and against');
  finish(ID);
  await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
