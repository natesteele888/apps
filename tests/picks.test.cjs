// Gameday Picks tests: the pure core (slate keys, dates, ESPN parsing, records) in Node, then the page in a browser with
// Firebase and ESPN's scoreboard both stubbed (no network, no accounts: fake players with placeholder names).
const assert = require('assert');
const path = require('path');
const C = require('../apps/picks/core.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const TODAY = '2026-11-09'; // a Monday
const team = (abbr, name, city, color, home, score, winner) => ({ homeAway: home ? 'home' : 'away', team: { abbreviation: abbr, shortDisplayName: name, location: city, color }, score, winner });
const event = (id, date, away, home, state, done) => ({ id, date, competitions: [{ competitors: [away, home], status: { type: { state, completed: !!done } } }] });

(async () => {
  await test('core: slate keys for each league, old NFL keys still read as NFL', () => {
    eq(C.sportOf('2026-2-10'), 'nfl'); eq(C.sportOf('nba-2026-11-09'), 'nba'); eq(C.sportOf('mlb-2026-04-01'), 'mlb'); eq(C.sportOf('junk'), 'nfl');
    eq(C.nflKey(2026, 2, 10), '2026-2-10'); eq(C.dayKey('nhl', '2026-11-09'), 'nhl-2026-11-09');
    assert.deepStrictEqual(C.parseKey('2026-3-2'), { sport: 'nfl', y: 2026, t: 3, w: 2 }); assert.deepStrictEqual(C.parseKey('nba-2026-11-09'), { sport: 'nba', date: '2026-11-09' }); eq(C.parseKey('x'), null);
    eq(C.fetchUrl('2026-2-10'), 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=2026&seasontype=2&week=10');
    eq(C.fetchUrl('mlb-2026-11-09'), 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20261109');
    eq(C.fetchUrl('nhl-2026-11-09'), 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=20261109'); eq(C.fetchUrl('bad'), null);
    eq(C.ORDER.join(','), 'nfl,mlb,nba,nhl'); eq(C.sport('nba').emoji, '🏀'); eq(C.sport('zzz').name, 'NFL');
  });
  await test('core: local days, the day list, and labels', () => {
    eq(C.localDay(new Date(2026, 10, 9, 23, 59)), '2026-11-09'); eq(C.addDays('2026-11-30', 1), '2026-12-01'); eq(C.addDays('2027-01-01', -1), '2026-12-31'); eq(C.addDays('2028-02-28', 1), '2028-02-29');
    const days = C.dayList(TODAY); eq(days.length, 10); eq(days[0], '2026-11-06'); eq(days[3], TODAY); eq(days[9], '2026-11-15');
    eq(C.label('nba-' + TODAY, TODAY), 'Today'); eq(C.label('nba-2026-11-10', TODAY), 'Tomorrow'); eq(C.label('nba-2026-11-08', TODAY), 'Yesterday'); eq(C.label('nba-2026-11-12', TODAY), 'Thu 12');
    eq(C.label('2026-2-10', TODAY), 'Wk 10'); eq(C.label('2026-1-2', TODAY), 'Pre 2'); eq(C.label('2026-3-1', TODAY), 'Playoffs 1'); eq(C.nflWeeks(2), 18); eq(C.nflWeeks(3), 5); eq(C.nflWeeks(1), 4);
  });
  await test('core: ESPN events become games; records and team stats count only finals, per league or all', () => {
    const d = { events: [
      event('g1', '2026-11-09T00:00:00Z', team('AAA', 'Alphas', 'Alpha City', '112233', false, '3', false), team('BBB', 'Betas', 'Beta Town', 'aabbcc', true, '5', true), 'post', true),
      event('g2', '2026-11-10T00:00:00Z', team('CCC', 'Gammas', 'Gamma', null, false, null), team('DDD', 'Deltas', 'Delta', '000000', true, null), 'pre', false),
      { id: 'broken', competitions: [] }] };
    const games = C.parseGames(d); eq(Object.keys(games).length, 2);
    eq(games.g1.winner, 'BBB'); eq(games.g1.done, true); eq(games.g1.home.color, '#aabbcc'); eq(games.g2.away.color, '#555555'); eq(games.g2.state, 'pre'); eq(games.g1.away.score, '3');
    assert.ok(C.started(games.g1, new Date('2026-11-08T00:00:00Z')), 'a game in progress is started whatever the clock says'); assert.ok(!C.started(games.g2, new Date('2026-11-09T00:00:00Z'))); assert.ok(C.started(games.g2, new Date('2026-11-10T00:00:01Z')));
    eq(C.parseGames(null).constructor, Object);
    const weeks = { 'nba-2026-11-09': { games }, '2026-2-10': { games: { f1: { away: { abbr: 'X', name: 'X' }, home: { abbr: 'Y', name: 'Y' }, done: true, winner: 'X' } } } };
    const picks = { 'nba-2026-11-09': { u1: { g1: 'BBB', g2: 'CCC' }, u2: { g1: 'AAA' } }, '2026-2-10': { u1: { f1: 'Y' } } };
    assert.deepStrictEqual(C.record(picks, weeks, 'u1', 'nba'), { w: 1, l: 0, total: 1 }); assert.deepStrictEqual(C.record(picks, weeks, 'u1', 'nfl'), { w: 0, l: 1, total: 1 });
    assert.deepStrictEqual(C.record(picks, weeks, 'u1', null), { w: 1, l: 1, total: 2 }); assert.deepStrictEqual(C.record(picks, weeks, 'u2', 'nba'), { w: 0, l: 1, total: 1 }); assert.deepStrictEqual(C.record(picks, weeks, 'nobody', null), { w: 0, l: 0, total: 0 });
    const st = C.teamStats(picks, weeks, 'u1', 'nba'); const by = Object.fromEntries(st);
    eq(by.BBB.f, 1); eq(by.BBB.fw, 1); eq(by.AAA.a, 1); eq(by.AAA.al, 1); eq(by.CCC.f, 1); eq(by.CCC.fw + by.CCC.fl, 0, 'an unplayed game has no result'); eq(C.teamStats(picks, weeks, 'u1', 'nhl').length, 0);
  });

  /* ---------- the page, with Firebase and ESPN stubbed ---------- */
  const server = await startServer('picks');
  const browser = await launch();
  // Firebase compat, just enough: a signed-in fake player, live collections kept in memory, writes that echo back.
  const FIREBASE_STUB = `(() => {
    const data = { gp_players: { me1: { name: 'Player One', code: 'GOOD', joinedAt: '2026-11-01' }, p2: { name: 'Player Two', code: 'GOOD', joinedAt: '2026-11-01' } }, gp_weeks: {}, gp_picks: {}, gp_codes: {} };
    const listeners = []; const notify = () => listeners.forEach(f => f());
    const snapOf = (col, id) => ({ id, exists: data[col][id] !== undefined, data: () => data[col][id], metadata: { hasPendingWrites: false, fromCache: false } });
    const docRef = (col, id) => ({
      onSnapshot(a, b) { const cb = typeof a === 'function' ? a : b; const f = () => cb(snapOf(col, id)); listeners.push(f); f(); return () => {}; },
      set(v) { data[col][id] = JSON.parse(JSON.stringify(v)); window.__writes.push([col, id, v]); notify(); return Promise.resolve(); },
      update(v) { data[col][id] = Object.assign({}, data[col][id], v); notify(); return Promise.resolve(); },
      delete() { delete data[col][id]; notify(); return Promise.resolve(); },
      get() { return Promise.resolve(snapOf(col, id)); }
    });
    const colRef = col => ({ onSnapshot(cb) { const f = () => cb({ docs: Object.keys(data[col]).map(id => snapOf(col, id)), empty: !Object.keys(data[col]).length, metadata: { fromCache: false } }); listeners.push(f); f(); return () => {}; }, doc: id => docRef(col, id) });
    const db = { doc: p => { const [col, id] = p.split('/'); return docRef(col, id); }, collection: colRef, enablePersistence: () => Promise.resolve() };
    const user = { uid: 'me1', displayName: 'Player One', email: 'one@example.com' };
    window.__writes = []; window.__data = data; window.__notify = notify;
    window.firebase = { initializeApp() {}, firestore: () => db, auth: Object.assign(() => ({ onAuthStateChanged: cb => setTimeout(() => cb(user), 0), signOut: () => Promise.resolve(), signInWithPopup: () => Promise.resolve() }), { GoogleAuthProvider: function () { this.setCustomParameters = () => {}; } }) };
  })();`;
  // ESPN: a fake scoreboard for any league, keyed on the URL. NFL week 10; a daily slate on TODAY with one final, one live, one upcoming.
  function espn(url, now) {
    const u = new URL(url); const daily = /dates=(\d{8})/.exec(url);
    const day = daily ? daily[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null;
    const sport = u.pathname.includes('baseball') ? 'MLB' : u.pathname.includes('basketball') ? 'NBA' : u.pathname.includes('hockey') ? 'NHL' : 'NFL';
    if (sport === 'NFL' && !u.search) return { season: { year: 2026, type: 2 }, week: { number: 10 }, events: [] };
    if (sport !== 'NFL' && day !== TODAY) return { events: [] };
    const base = sport + '-' + (day || 'w10');
    return { events: [
      event(base + '-1', '2026-11-09T00:10:00Z', team('AAA', sport + ' Alphas', 'Alpha City', '112233', false, '3', false), team('BBB', sport + ' Betas', 'Beta Town', 'aabbcc', true, '5', true), 'post', true),
      event(base + '-2', '2026-11-09T18:00:00Z', team('CCC', sport + ' Gammas', 'Gamma', '336699', false, '1'), team('DDD', sport + ' Deltas', 'Delta', '993366', true, '1'), 'in', false),
      event(base + '-3', '2026-11-10T00:30:00Z', team('EEE', sport + ' Epsilons', 'Epsilon', '229955', false, null), team('FFF', sport + ' Zetas', 'Zeta', '552299', true, null), 'pre', false)] };
  }
  async function open(opts) {
    const { ctx, page, errors } = await newPage(browser, { ctx: opts && opts.ctx });
    await page.route(/www\.gstatic\.com\/firebasejs/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().includes('firebase-app') ? FIREBASE_STUB : '' }));
    await page.route(/site\.api\.espn\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(espn(r.request().url())) }));
    await page.addInitScript(d => { window.__today = d; }, TODAY + 'T20:00:00Z');
    return { ctx, page, errors };
  }
  await test('page: four league tabs; NFL opens on the current week, the others on today; the choice sticks', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForSelector('[data-sport]');
    eq(await page.$$eval('[data-sport]', b => b.map(x => x.textContent.trim()).join('|')), '🏈 NFL|⚾ MLB|🏀 NBA|🏒 NHL');
    await page.waitForSelector('.pill[aria-pressed="true"]'); eq(await page.textContent('.pill[aria-pressed="true"]'), 'Wk 10'); eq(await page.locator('.pill').count(), 18);
    await page.waitForSelector('.game'); eq(await page.locator('.game').count(), 3);
    await page.click('[data-sport="nba"]'); await page.waitForSelector('[data-sport="nba"][aria-pressed="true"]');
    await page.waitForSelector('.pill[aria-pressed="true"]'); eq(await page.textContent('.pill[aria-pressed="true"]'), 'Today'); eq(await page.locator('.pill').count(), 10);
    await page.waitForSelector('.game'); assert.ok((await page.textContent('.games')).includes('NBA Alphas')); eq(await page.textContent('.mid span'), '🏀');
    await page.click('.pill:has-text("Tomorrow")'); await page.waitForFunction(() => /No NBA games on this day/.test(document.querySelector('.status').textContent));
    await page.screenshot({ path: path.join(SHOTS, 'picks-nba.png') });
    await page.reload(); await page.waitForSelector('[data-sport="nba"][aria-pressed="true"]'); eq(await page.textContent('.pill[aria-pressed="true"]'), 'Today', 'back on today for the remembered league');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });
  await test('page: picks save under a league-dated slate, lock once a game starts, and show on the board per league', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForSelector('[data-sport]');
    await page.click('[data-sport="mlb"]'); await page.waitForSelector('.game');
    const openSides = page.locator('.side:not([disabled])'); eq(await openSides.count(), 2, 'only the upcoming game is open');
    eq(await page.locator('.side[disabled]').count(), 4, 'final and live games are locked');
    await page.click('.side[data-t="FFF"]'); await page.waitForSelector('.side.mine');
    const w = await page.evaluate(() => window.__writes.filter(x => x[0] === 'gp_picks'));
    eq(w.length, 1); eq(w[0][1], 'me1_mlb-' + TODAY); eq(w[0][2].week, 'mlb-' + TODAY); eq(Object.values(w[0][2].picks)[0], 'FFF');
    assert.ok(/1 of 1 open games picked/.test(await page.textContent('.status')));
    await page.click('.side[data-t="FFF"]'); await page.waitForFunction(() => !document.querySelector('.side.mine')); // tap again to clear
    await page.click('.side[data-t="EEE"]'); await page.waitForSelector('.side.mine');
    // a finished game that another player picked shows their name and their result on the board
    await page.evaluate(d => { window.__data.gp_picks['p2_mlb-' + d] = { uid: 'p2', week: 'mlb-' + d, picks: { ['MLB-' + d + '-1']: 'BBB' } }; window.__notify(); }, TODAY);
    await page.waitForTimeout(300);
    await page.click('[data-view="board"]'); await page.waitForSelector('.lrow');
    const board = await page.textContent('#view'); assert.ok(/MLB leaderboard/.test(board) && /Player Two/.test(board), board);
    const rows = await page.$$eval('.board .lrow', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert.ok(/^1\s*Player Two\s*1-0/.test(rows[0]), rows.join(' / '));
    await page.click('[data-sport="nhl"]'); await page.waitForSelector('[data-sport="nhl"][aria-pressed="true"]'); await page.waitForTimeout(200);
    assert.ok(/NHL leaderboard/.test(await page.textContent('#view')) && /no results/.test(await page.textContent('.board .lrow')), 'the NHL board is separate');
    assert.ok(/All leagues together/.test(await page.textContent('#view')));
    await page.click('[data-view="stats"]'); await page.waitForSelector('.empty'); assert.ok(/Make some NHL picks/.test(await page.textContent('#view')));
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });
  await test('page: 320 px phone: the league tabs and a game card fit', async () => {
    const { ctx, page, errors } = await open({ ctx: { viewport: { width: 320, height: 640 } } });
    await page.goto(server.url); await page.waitForSelector('.game');
    eq(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    const tabs = await page.$$eval('[data-sport]', b => b.map(x => x.getBoundingClientRect().height)); assert.ok(tabs.every(h => h >= 44), 'tabs are tappable: ' + tabs.join(','));
    await page.screenshot({ path: path.join(SHOTS, 'picks-small.png') });
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) { console.log('  FAIL ' + results.filter(r => !r[1]).map(r => r[0]).join('\n  FAIL ')); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
