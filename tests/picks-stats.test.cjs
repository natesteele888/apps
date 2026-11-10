// Gameday Picks stats tests: the Standings tab, team pages and the scouting card. The pure parts (picks/stats.js) in Node,
// then the page with Firebase and ESPN stubbed (no network: made-up teams and players with placeholder names).
const assert = require('assert');
const path = require('path');
const X = require('../apps/picks/stats.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const TODAY = '2026-11-10';

/* ---------- fixtures in ESPN's shapes ---------- */
const st = (name, type, value, displayValue) => ({ name, type, value, displayValue: displayValue == null ? String(value) : displayValue });
function conf(prefix, label, n, opts = {}) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const w = 20 - i, l = i + 2, id = prefix + (i + 1);
    const stats = [st('wins', 'wins', w), st('losses', 'losses', l), st('streak', 'streak', 1, i % 2 ? 'L2' : 'W3'), st('gamesBehind', 'gamesbehind', i, i ? String(i) : '-'),
      st('overall', 'total', null, w + '-' + l), st('Home', 'home', null, '5-1'), st('Road', 'road', null, '4-2'), st('Last Ten Games', 'lasttengames', null, '7-3'),
      st('pointDifferential', 'pointdifferential', 40 - i * 8, (40 - i * 8 > 0 ? '+' : '') + (40 - i * 8))];
    if (!opts.noSeed) stats.push(st('playoffSeed', 'playoffseed', i + 1));
    if (opts.pct !== false) stats.push(st('winPercent', 'winpercent', w / (w + l), (w / (w + l)).toFixed(3).replace(/^0/, '')));
    if (opts.ot) stats.push(st('otLosses', 'otlosses', 1), st('points', 'points', w * 2 + 1));
    if (opts.ties) stats.push(st('ties', 'ties', i === 2 ? 1 : 0));
    entries.push({ team: { id, abbreviation: (prefix + (i + 1)).toUpperCase(), displayName: label + ' Team ' + (i + 1), shortDisplayName: label + ' ' + (i + 1), location: label + ' City ' + (i + 1), logos: [] }, stats });
  }
  entries.reverse();
  return { name: label + ' Conference', abbreviation: label, standings: { entries } };
}
const STANDINGS = {
  nba: { children: [conf('e', 'East', 15), conf('w', 'West', 15)] },
  nfl: { children: [conf('a', 'AFC', 16, { ties: true }), conf('n', 'NFC', 16, { ties: true })] },
  nhl: { children: [conf('h', 'East', 16, { ot: true }), conf('k', 'West', 16, { ot: true })] },
  mlb: { children: [conf('m', 'AL', 15), conf('q', 'NL', 15)] }
};
const LEAD = (stat, abbr, v, who, pos) => ({ name: stat, displayName: stat, abbreviation: abbr, leaders: [{ displayValue: v, value: +v || 0, athlete: { displayName: 'Player ' + who, shortName: 'P. ' + who, position: { abbreviation: pos } } }] });
const comp = (t, home, score, winner, extra = {}) => Object.assign({ homeAway: home ? 'home' : 'away', team: { id: t.id, abbreviation: t.id.toUpperCase(), displayName: t.name, shortDisplayName: t.short, name: t.short, location: t.city || 'Town', color: '336699' }, score, winner }, extra);
const T = (id, n) => ({ id, name: 'East Team ' + n, short: 'East ' + n, city: 'East City ' + n });
function ev(id, date, away, home, state, done, extra = {}) {
  return { id, date, competitions: [Object.assign({ competitors: [away, home], status: { type: { state, completed: !!done, shortDetail: done ? 'Final' : state === 'in' ? '3rd 4:12' : '7:30 PM' } },
    venue: { fullName: 'Fake Arena ' + id, address: { city: 'Faketown', state: 'MA' } }, broadcasts: [{ names: ['FAKE-TV'] }] }, extra)] };
}
// today's NBA slate: East 1 hosts East 2 later tonight, with each side's season leaders and records
const DAY = { events: [
  ev('g1', '2026-11-11T00:30:00Z',
    comp(T('e2', 2), false, '0', undefined, { records: [{ type: 'total', summary: '18-3' }, { type: 'home', summary: '9-1' }, { type: 'road', summary: '9-2' }], leaders: [LEAD('pointsPerGame', 'PTS', '27.4', 'Two', 'G')] }),
    comp(T('e1', 1), true, '0', undefined, { records: [{ type: 'total', summary: '20-2' }, { type: 'home', summary: '11-0' }, { type: 'road', summary: '9-2' }],
      leaders: [LEAD('pointsPerGame', 'PTS', '30.1', 'Alpha', 'F'), LEAD('reboundsPerGame', 'REB', '11.2', 'Bravo', 'C'), LEAD('assistsPerGame', 'AST', '8.0', 'Charlie', 'G'), { name: 'rating', abbreviation: 'RAT', leaders: [{ displayValue: '30 PPG, 7 RPG', athlete: { displayName: 'Player Alpha' } }] }] }),
    'pre', false)] };
const sc = v => ({ value: v, displayValue: String(v) });
// East 1's schedule this season: 6 played (one vs East 2), two to come. Older seasons hold more games vs East 2.
function sched(year, games) { return { season: { year, displayName: (year - 1) + '-' + String(year).slice(2) }, team: { id: 'e1', abbreviation: 'E1', displayName: 'East Team 1', recordSummary: '20-2', standingSummary: '1st in East Conference', logo: '' }, events: games }; }
const played = (id, date, opp, n, home, us, them) => ev(id, date, home ? comp(T(opp, n), false, sc(them), them > us) : comp(T('e1', 1), false, sc(us), us > them), home ? comp(T('e1', 1), true, sc(us), us > them) : comp(T(opp, n), true, sc(them), them > us), 'post', true);
const SCHED = {
  2027: sched(2027, [played('s1', '2026-10-25T23:00:00Z', 'e7', 7, false, 99, 104), played('s2', '2026-10-28T23:00:00Z', 'e2', 2, true, 110, 101), played('s3', '2026-10-30T23:00:00Z', 'e8', 8, true, 112, 90),
    played('s4', '2026-11-01T23:00:00Z', 'e9', 9, false, 100, 95), played('s5', '2026-11-03T23:00:00Z', 'e10', 10, true, 120, 118), played('s6', '2026-11-06T23:00:00Z', 'e11', 11, false, 88, 97),
    ev('s7', '2026-11-11T00:30:00Z', comp(T('e2', 2), false, sc(0)), comp(T('e1', 1), true, sc(0)), 'pre', false), ev('s8', '2026-11-14T00:00:00Z', comp(T('e1', 1), false, sc(0)), comp(T('e9', 9), true, sc(0)), 'pre', false)]),
  2026: sched(2026, [played('o1', '2026-01-10T23:00:00Z', 'e2', 2, false, 90, 95), played('o2', '2026-02-10T23:00:00Z', 'e2', 2, true, 105, 100), played('o3', '2026-03-10T23:00:00Z', 'e5', 5, true, 105, 100)]),
  2025: sched(2025, [played('p1', '2025-01-10T23:00:00Z', 'e2', 2, true, 101, 99), played('p2', '2025-02-10T23:00:00Z', 'e2', 2, false, 80, 99), played('p3', '2025-03-10T23:00:00Z', 'e2', 2, true, 111, 99)])
};
function espn(u) {
  const url = new URL(u), p = url.pathname;
  const sp = p.includes('/basketball/') ? 'nba' : p.includes('/hockey/') ? 'nhl' : p.includes('/baseball/') ? 'mlb' : 'nfl';
  if (p.endsWith('/standings')) return STANDINGS[sp];
  if (/\/teams\/[^/]+\/schedule$/.test(p)) return SCHED[url.searchParams.get('season') || 2027] || { events: [] };
  if (p.endsWith('/scoreboard')) {
    if (sp === 'nfl' && !url.search) return { season: { year: 2026, type: 2 }, week: { number: 10 }, events: [] };
    const d = url.searchParams.get('dates');
    if (!d) return { season: { year: 2026, type: sp === 'mlb' ? 4 : 2 }, events: [] };
    return sp === 'nba' && d === TODAY.replace(/-/g, '') ? DAY : { events: [] };
  }
  return {};
}

(async () => {
  /* ---------- core ---------- */
  await test('core: standings per conference, best seed first, with each league\'s own columns', () => {
    const nba = X.parseStandings(STANDINGS.nba, 'nba');
    eq(nba.length, 2); eq(nba[0].name, 'East Conference'); eq(nba[0].teams[0].name, 'East Team 1', 'shuffled entries sorted by seed');
    eq(nba[0].teams[0].rec, '20-2'); eq(nba[0].teams[0].home, '5-1'); eq(nba[0].teams[0].last10, '7-3'); eq(nba[0].teams[0].streak, 'W3'); eq(nba[0].teams[1].gb, '1');
    const nhl = X.parseStandings(STANDINGS.nhl, 'nhl'); eq(nhl[0].teams[0].rec, '20-2-1', 'NHL shows overtime losses'); eq(nhl[0].teams[0].pts, 41);
    const nfl = X.parseStandings(STANDINGS.nfl, 'nfl'); eq(nfl[0].teams[2].rec, '18-4-1', 'an NFL tie shows'); eq(nfl[0].teams[0].rec, '20-2');
    const bare = X.parseStandings({ children: [conf('z', 'Z', 4, { noSeed: true, pct: false })] }, 'mlb'); eq(bare[0].teams[0].name, 'Z Team 1'); assert.ok(Math.abs(bare[0].teams[0].pct - 20 / 22) < 1e-9);
    const nested = X.parseStandings({ children: [{ name: 'League', children: [conf('d', 'Div', 3)] }] }, 'mlb'); eq(nested.length, 1);
    eq(X.pctText(0.5), '.500'); eq(X.pctText(1), '1.000'); eq(X.pctText(0), '.000');
  });

  await test('core: top players, records, where and TV from the scoreboard; last 5 and head to head from team schedules', () => {
    const ex = X.extras(DAY).g1;
    eq(ex.home.id, 'e1'); eq(ex.home.records.total, '20-2'); eq(ex.home.records.home, '11-0'); eq(ex.home.leaders.length, 4);
    eq(ex.home.leaders[0].value, '30.1'); eq(ex.home.leaders[0].abbr, 'PTS'); eq(ex.home.leaders[0].short, 'P. Alpha'); eq(ex.home.leaders[3].rating, true);
    eq(ex.venue, 'Fake Arena g1'); eq(ex.place, 'Faketown, MA'); eq(ex.tv, 'FAKE-TV'); eq(ex.pre, true);
    const cur = X.teamView(SCHED[2027], 'e1'), o1 = X.teamView(SCHED[2026], 'e1'), o2 = X.teamView(SCHED[2025], 'e1');
    eq(cur.done.length, 6); eq(cur.done[0].id, 's6', 'newest first'); eq(cur.done.slice(0, 5).map(g => g.res).join(''), 'LWWWW');
    eq(cur.done[0].me.score, '88'); eq(cur.done[0].atHome, false); eq(cur.next.id, 's7'); eq(cur.next.op.name, 'East Team 2');
    const h = X.headToHead([cur, o1, o2], 'e2', 5);
    eq(h.map(g => g.id).join(','), 's2,o2,o1,p3,p2', 'five most recent across seasons'); eq(X.tally(h).w + '-' + X.tally(h).l, '3-2');
    eq(X.seasonYear(SCHED[2027]), 2027);
    const tie = X.parseGames({ events: [ev('t', '2026-11-08T18:00:00Z', comp(T('a', 1), false, '24', false), comp(T('b', 2), true, '24', false), 'post', true)] })[0]; eq(tie.tie, true);
  });

  await test('core: the playoff picture follows each league\'s format', () => {
    const nfl = X.picture(X.parseStandings(STANDINGS.nfl, 'nfl'), 'nfl')[0];
    eq(nfl.seeds.length, 7); eq(nfl.byes.length, 1); eq(nfl.pairs.map(p => p[0].s + 'v' + p[1].s).join(' '), '2v7 3v6 4v5');
    const mlb = X.picture(X.parseStandings(STANDINGS.mlb, 'mlb'), 'mlb')[0];
    eq(mlb.byes.map(t => t.s).join(','), '1,2'); eq(mlb.pairs.map(p => p[0].s + 'v' + p[1].s).join(' '), '3v6 4v5');
    eq(X.picture(X.parseStandings(STANDINGS.nhl, 'nhl'), 'nhl')[0].pairs.map(p => p[0].s + 'v' + p[1].s).join(' '), '1v8 2v7 3v6 4v5');
    const nba = X.picture(X.parseStandings(STANDINGS.nba, 'nba'), 'nba')[0];
    eq(nba.seeds.length, 6); eq(nba.playIn.map(p => p[0].s + 'v' + p[1].s).join(' '), '7v8 9v10'); eq(nba.pairs[0][1].tbd, 'Play-In winner (8)');
  });

  /* ---------- the page ---------- */
  const server = await startServer('picks');
  const browser = await launch();
  const FIREBASE_STUB = `(() => {
    const data = { gp_players: { me1: { name: 'Player One', code: 'GOOD', joinedAt: '2026-11-01' } }, gp_weeks: {}, gp_picks: {}, gp_codes: {} };
    const listeners = []; const notify = () => listeners.forEach(f => f());
    const snapOf = (col, id) => ({ id, exists: data[col][id] !== undefined, data: () => data[col][id], metadata: { hasPendingWrites: false, fromCache: false } });
    const docRef = (col, id) => ({
      onSnapshot(a, b) { const cb = typeof a === 'function' ? a : b; const f = () => cb(snapOf(col, id)); listeners.push(f); f(); return () => {}; },
      set(v) { if (col === 'gp_players' && v.code === 'OWNER') return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        data[col][id] = JSON.parse(JSON.stringify(v)); window.__writes.push([col, id, v]); notify(); return Promise.resolve(); },
      update(v) { data[col][id] = Object.assign({}, data[col][id], v); notify(); return Promise.resolve(); },
      delete() { delete data[col][id]; notify(); return Promise.resolve(); }
    });
    const colRef = col => ({ onSnapshot(cb) { const f = () => cb({ docs: Object.keys(data[col]).map(id => snapOf(col, id)) }); listeners.push(f); f(); return () => {}; }, doc: id => docRef(col, id) });
    const db = { doc: p => { const [col, id] = p.split('/'); return docRef(col, id); }, collection: colRef, enablePersistence: () => Promise.resolve() };
    const user = { uid: 'me1', displayName: 'Player One' };
    window.__writes = [];
    window.firebase = { initializeApp() {}, firestore: () => db, auth: Object.assign(() => ({ onAuthStateChanged: cb => setTimeout(() => cb(user), 0), signOut: () => Promise.resolve() }), { GoogleAuthProvider: function () { this.setCustomParameters = () => {}; } }) };
  })();`;
  async function open(opts = {}) {
    const o = await newPage(browser, opts);
    await o.page.route(/www\.gstatic\.com\/firebasejs/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().includes('firebase-app') ? FIREBASE_STUB : '' }));
    await o.page.route(/site\.api\.espn\.com/, r => { if (o.offline) return r.abort(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(espn(r.request().url())) }); });
    await o.page.route(/espncdn\.com/, r => r.abort());
    await o.page.addInitScript(([d, sp]) => { window.__today = d; localStorage.setItem('gp.sport', sp); }, [TODAY + 'T15:00:00', opts.sport || 'nba']);
    return o;
  }
  const scrollW = page => page.evaluate(() => document.documentElement.scrollWidth);

  await test('page: Standings tab: each league\'s standings, then a team page with record, next game (when and where) and results', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForSelector('.game');
    assert.ok(/Fake Arena g1/.test(await page.textContent('.x-where')) && /FAKE-TV/.test(await page.textContent('.x-where')), 'the pick card says where and on what channel');
    await page.click('[data-view="league"]'); await page.waitForSelector('table.x-st');
    const first = await page.textContent('table.x-st tbody tr'); assert.ok(/East 1/.test(first) && /\.909/.test(first), first);
    eq(await page.$$eval('table.x-st', t => t[0].querySelectorAll('tr.x-cut').length), 1, 'the playoff cut line');
    await page.screenshot({ path: path.join(SHOTS, 'picks-standings.png') });
    await page.click('table.x-st tbody tr:first-child .x-tmbtn'); await page.waitForSelector('.x-thead');
    const body = await page.textContent('#view');
    assert.ok(/East Team 1/.test(body) && /20-2/.test(body) && /1st in East Conference/.test(body), 'name, record, place');
    assert.ok(/Next game/.test(body) && /vs\s+(E2\s*)?East Team 2/.test(body) && /Fake Arena s7/.test(body) && /Faketown, MA/.test(body), 'next game and where');
    eq((await page.$$eval('.x-res .x-wl', b => b.map(x => x.textContent))).slice(0, 2).join(','), 'L,W', 'results newest first');
    assert.ok(/88-97/.test(body) && /Coming up/.test(body));
    await page.screenshot({ path: path.join(SHOTS, 'picks-team.png') });
    await page.goBack(); await page.waitForSelector('table.x-st'); assert.ok(!(await page.$('.x-thead')), 'Back closes the team page');
    await page.click('[data-lsub="playoffs"]'); await page.waitForSelector('.x-match'); assert.ok(/Play-In winner \(8\)/.test(await page.textContent('#view')));
    await page.click('[data-sport="nfl"]'); await page.waitForFunction(() => /The 1 seed skips/.test(document.querySelector('#view').textContent));
    await page.click('[data-sport="mlb"]'); await page.waitForFunction(() => /season is over/.test(document.querySelector('#view').textContent));
    eq(await scrollW(page), 390); eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('page: press and hold a team to scout it (record, top players, last 5, last 5 head to head) without making a pick', async () => {
    const { ctx, page, errors } = await open({ ctx: { hasTouch: true } });
    await page.goto(server.url); await page.waitForSelector('.side.hm');
    const box = await page.locator('.side.hm').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    await page.waitForFunction(() => /Last 5 vs/.test((document.querySelector('#xsheet') || {}).textContent || ''));
    await page.waitForFunction(() => document.querySelectorAll('#xsheet .x-res').length >= 10);
    const t = await page.textContent('#xsheet');
    assert.ok(/East City 1 East 1/.test(t) && /20-2/.test(t) && /11-0/.test(t), 'record and home record');
    assert.ok(/30\.1/.test(t) && /P\. Alpha/.test(t) && /11\.2/.test(t) && /Best overall: Player Alpha/.test(t), 'top players');
    assert.ok(/Last 5\s*4-1/.test(t), 'last five: ' + t);
    assert.ok(/Last 5 vs East 2\s*3-2/.test(t), 'head to head across seasons: ' + t);
    eq(await page.evaluate(() => window.__writes.filter(w => w[0] === 'gp_picks').length), 0, 'holding did not make a pick');
    await page.screenshot({ path: path.join(SHOTS, 'picks-scout.png') });
    await page.click('.x-tab[data-side="away"]'); await page.waitForFunction(() => /27\.4/.test(document.querySelector('#xsheet').textContent));
    await page.goBack(); await page.waitForFunction(() => document.querySelector('#xsheet').hidden, null, { timeout: 3000 });
    await page.click('[data-scout]'); await page.waitForSelector('#xsheet:not([hidden])'); await page.click('.x-close'); assert.ok(await page.$eval('#xsheet', d => d.hidden), 'the Scout button opens it too, Close closes it');
    await page.click('.side.hm'); await page.waitForFunction(() => window.__writes.some(w => w[0] === 'gp_picks'));
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('page: with no signal the Standings tab shows the last saved copy and says when', async () => {
    const o = await open(); const { ctx, page, errors } = o;
    await page.goto(server.url); await page.click('[data-view="league"]'); await page.waitForSelector('table.x-st');
    o.offline = true; await page.reload(); await page.click('[data-view="league"]'); await page.waitForSelector('table.x-st');
    assert.ok(/No signal\. Showing what was saved/.test(await page.textContent('#view')));
    await page.click('[data-sport="nhl"]'); await page.waitForSelector('.empty'); assert.ok(/Couldn't load/.test(await page.textContent('#view')));
    eq(errors.filter(e => !/Failed to fetch|ERR_/.test(e)).length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('page: 320 px phone: standings, team page and scouting card fit, and their buttons are big enough to tap', async () => {
    const { ctx, page, errors } = await open({ ctx: { viewport: { width: 320, height: 640 } } });
    await page.goto(server.url); await page.click('[data-view="league"]'); await page.waitForSelector('table.x-st');
    eq(await scrollW(page), 320, 'standings fit');
    const small = await page.$$eval('#view button', bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height < 36; }).map(b => b.textContent.trim().slice(0, 20) + ' ' + Math.round(b.getBoundingClientRect().height)));
    eq(small.length, 0, 'small: ' + small.join(', '));
    await page.click('table.x-st tbody tr:first-child .x-tmbtn'); await page.waitForSelector('.x-thead'); eq(await scrollW(page), 320, 'team page fits');
    await page.click('[data-view="picks"]'); await page.waitForSelector('[data-scout]'); await page.click('[data-scout]');
    await page.waitForFunction(() => document.querySelectorAll('#xsheet .x-res').length >= 5);
    eq(await page.evaluate(() => document.querySelector('.x-panel').scrollWidth <= 320), true, 'the card fits');
    await page.screenshot({ path: path.join(SHOTS, 'picks-scout-small.png') });
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) { console.log('  FAIL ' + results.filter(r => !r[1]).map(r => r[0]).join('\n  FAIL ')); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
