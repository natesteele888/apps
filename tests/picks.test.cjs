// Gameday Picks tests: the pure core (slate keys, dates, ESPN parsing, records) in Node, then the page in a browser with
// Firebase and ESPN's scoreboard both stubbed (no network, no accounts: fake players with placeholder names).
const assert = require('assert');
const path = require('path');
const C = require('../apps/picks/core.js');
const X = require('../apps/picks/stats.js');
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
  await test('core: the watch gets this player and the NFL standings (top 8, the player kept in), never picks', () => {
    const players = {}; for (let i = 0; i < 10; i++) players['u' + i] = { name: 'Player' + i };
    const weeks = { '2026-2-10': { games: { g1: { done: true, winner: 'BUF' }, g2: { done: true, winner: 'KC' } } }, 'nba-2026-11-09': { games: { n1: { done: true, winner: 'BOS' } } } };
    const picks = { '2026-2-10': { u0: { g1: 'BUF', g2: 'KC' }, u1: { g1: 'BUF' }, u9: { g1: 'NYJ' } }, 'nba-2026-11-09': { u9: { n1: 'BOS' } } };
    const s = C.watchSummary(players, picks, weeks, 'u9');
    eq(s.uid, 'u9'); eq(s.name, 'Player9'); eq(s.board.length, 8); eq(s.board[0].name, 'Player0'); eq(s.board[0].w, 2);
    const me = s.board[7]; eq(me.me, true); eq(me.l, 1, 'only NFL counts'); eq(me.w, 0);
    assert.ok(!JSON.stringify(s).includes('BUF'), 'no picks go to the watch');
    eq(C.watchSummary({}, {}, {}, 'x').board.length, 0);
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

  await test('core: win chance from ESPN\'s predictor, the moneyline, or the records and home field', () => {
    eq(X.mlProb('-150'), 0.6); eq(X.mlProb('+150'), 0.4); eq(X.mlProb('EVEN'), 0.5); eq(X.mlProb('12'), null); eq(X.mlProb(null), null);
    const o = X.oddsChance({ odds: [{ moneyline: { home: { close: { odds: '-198' } }, away: { close: { odds: '+164' } } } }] });
    eq(o.src, 'odds'); assert.ok(Math.abs(o.home - 0.637) < 0.001 && Math.abs(o.away + o.home - 1) < 1e-9, 'the bookmaker\'s cut is taken out: ' + JSON.stringify(o));
    eq(X.oddsChance({ odds: [{ awayTeamOdds: { moneyLine: 120 }, homeTeamOdds: { moneyLine: -140 } }] }).src, 'odds', 'the older shape works too');
    eq(X.oddsChance({}), null); eq(X.oddsChance({ odds: [{ details: 'LAR -3.5' }] }), null);
    const S = (n, v) => ({ name: n, value: v });
    const p = X.predictorChance({ homeTeam: { statistics: [S('gameProjection', 64.591), S('teamChanceLoss', 35.127)] }, awayTeam: { statistics: [S('gameProjection', 35.127), S('teamChanceLoss', 64.591)] } });
    eq(p.src, 'espn'); assert.deepStrictEqual(X.percents(p), { away: 35, home: 65 });
    assert.deepStrictEqual(X.percents(X.predictorChance({ homeTeam: { statistics: [] }, awayTeam: { statistics: [S('gameProjection', 21.491), S('teamChanceLoss', 78.509)] } })), { away: 21, home: 79 }, 'one side filled in');
    eq(X.predictorChance({}), null); eq(X.predictorChance(null), null);
    assert.deepStrictEqual(X.parseRecord('5-3-1'), { w: 5, l: 3, x: 1 }); eq(X.parseRecord('junk'), null);
    const even = X.estimateChance('6-4', '6-4', 'nfl', false); assert.ok(even.home > 0.5 && even.home < 0.6, 'home field tips an even game: ' + even.home);
    eq(X.estimateChance('6-4', '6-4', 'nfl', true).home, 0.5, 'no home field at a neutral site');
    assert.ok(X.estimateChance('9-1', '1-9', 'nfl', false).away > 0.7, 'the better record is favoured'); assert.ok(X.estimateChance('', '', 'nba', false).home > 0.5, 'no records yet: home field only');
    assert.ok(X.estimateChance('17-0', '0-17', 'nfl', true).away <= 0.95, 'never a sure thing');
    const pc = X.percents({ away: 0.333, home: 0.667 }); eq(pc.away + pc.home, 100); eq(X.percents(null), null);
    eq(X.url.predictor('nfl', '401873079'), 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/401873079/competitions/401873079/predictor');
    eq(!!X.PREDICTS.nfl && !!X.PREDICTS.nba && !X.PREDICTS.mlb && !X.PREDICTS.nhl, true);
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
      set(v) { if (col === 'gp_players' && v.code === 'OWNER') return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' })); // the rules: only the owner's account
        data[col][id] = JSON.parse(JSON.stringify(v)); window.__writes.push([col, id, v]); notify(); return Promise.resolve(); },
      update(v) { data[col][id] = Object.assign({}, data[col][id], v); notify(); return Promise.resolve(); },
      delete() { delete data[col][id]; notify(); return Promise.resolve(); },
      get() { return Promise.resolve(snapOf(col, id)); }
    });
    const colRef = col => ({ onSnapshot(cb) { const f = () => cb({ docs: Object.keys(data[col]).map(id => snapOf(col, id)), empty: !Object.keys(data[col]).length, metadata: { fromCache: false } }); listeners.push(f); f(); return () => {}; }, doc: id => docRef(col, id) });
    const db = { doc: p => { const [col, id] = p.split('/'); return docRef(col, id); }, collection: colRef, enablePersistence: () => Promise.resolve() };
    let user = window.__signedOut ? null : { uid: 'me1', displayName: 'Player One', email: 'one@example.com' };
    window.__writes = []; window.__data = data; window.__notify = notify; window.__auth = [];
    // email sign-in: 'taken@example.com' already has an account; any other email is new; the right password is 'secret1'
    let authCb = () => {}; const become = u => { user = u; setTimeout(() => authCb(user), 0); return Promise.resolve({ user }); };
    const fail = code => Promise.reject(Object.assign(new Error(code), { code }));
    const auth = {
      onAuthStateChanged: cb => { authCb = cb; setTimeout(() => cb(user), 0); }, signOut: () => become(null), signInWithPopup: () => Promise.resolve(),
      createUserWithEmailAndPassword(em, pw) { window.__auth.push(['create', em]); if (em === 'taken@example.com' || em === 'timmy@players.natesteele888.github.io') return fail('auth/email-already-in-use'); if (pw.length < 6) return fail('auth/weak-password'); return become({ uid: 'new1', displayName: null, email: em }); },
      signInWithEmailAndPassword(em, pw) { window.__auth.push(['signin', em]); return (em === 'taken@example.com' && pw === 'secret1') || (em === 'timmy@players.natesteele888.github.io' && pw === 'gp-pin-1234') ? become({ uid: 'old1', displayName: null, email: em }) : fail('auth/invalid-credential'); },
      sendPasswordResetEmail(em) { window.__auth.push(['reset', em]); return Promise.resolve(); }
    };
    window.firebase = { initializeApp() {}, firestore: () => db, auth: Object.assign(() => auth, { GoogleAuthProvider: function () { this.setCustomParameters = () => {}; } }) };
  })();`;
  // ESPN: a fake scoreboard for any league, keyed on the URL. NFL week 10; a daily slate on TODAY with one final, one live, one upcoming.
  const rec = (c, summary) => Object.assign(c, { records: [{ type: 'total', summary }, { type: 'home', summary: '1-1' }] });
  // ESPN's matchup predictor: one NFL game has a number (Zetas 70%); anything else gets an empty answer.
  const predictor = url => /NFL-w10-3\/predictor/.test(url) ? { homeTeam: { statistics: [{ name: 'gameProjection', value: 70.2 }] }, awayTeam: { statistics: [{ name: 'gameProjection', value: 29.8 }] } } : {};
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
      event(base + '-3', '2026-11-10T00:30:00Z', rec(team('EEE', sport + ' Epsilons', 'Epsilon', '229955', false, null), '7-2'), rec(team('FFF', sport + ' Zetas', 'Zeta', '0b162a', true, null), '3-6-1'), 'pre', false)] };
  }
  async function open(opts) {
    const { ctx, page, errors } = await newPage(browser, { ctx: opts && opts.ctx });
    await page.route(/www\.gstatic\.com\/firebasejs/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: r.request().url().includes('firebase-app') ? FIREBASE_STUB : '' }));
    await page.route(/site\.api\.espn\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(espn(r.request().url())) }));
    const asked = [];
    await page.route(/sports\.core\.api\.espn\.com/, r => { asked.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(predictor(r.request().url())) }); });
    page.__asked = asked;
    await page.addInitScript(([d, out]) => { window.__today = d; if (out) window.__signedOut = true; }, [TODAY + 'T20:00:00Z', !!(opts && opts.signedOut)]);
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
  await test('page: other players\' picks stay hidden until you lock in yours, then show; locked picks can\'t change', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForSelector('[data-sport]');
    await page.click('[data-sport="mlb"]'); await page.waitForSelector('.game');
    await page.evaluate(d => { window.__data.gp_picks['p2_mlb-' + d] = { uid: 'p2', week: 'mlb-' + d, picks: { ['MLB-' + d + '-3']: 'EEE' } }; window.__notify(); }, TODAY);
    await page.waitForTimeout(200);
    const open3 = page.locator('.game').nth(2);
    assert.ok(!/Player Two/.test(await open3.textContent()), 'no names on an open game before locking');
    assert.ok(!/\d pick/.test(await open3.textContent()), 'not even a count');
    assert.ok(await page.locator('#lockin').isDisabled(), 'nothing picked yet, nothing to lock');
    await page.click('.side[data-t="FFF"]'); await page.waitForSelector('.side.mine');
    await page.click('#lockin'); eq(await page.textContent('#lockin'), 'Tap again to lock', 'the first tap asks to confirm');
    await page.click('#lockin'); await page.waitForSelector('.lockbar.done');
    const w = await page.evaluate(() => window.__writes.filter(x => x[0] === 'gp_picks').pop());
    assert.ok(w[2].locked && w[2].picks['MLB-' + TODAY + '-3'] === 'FFF', JSON.stringify(w));
    assert.ok(/Player Two/.test(await open3.textContent()), 'their pick shows once locked in');
    eq(await open3.locator('.side:not([disabled])').count(), 0, 'a locked slate can\'t change');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });
  await test('page: each team\'s record shows under its name, and open games show a win-chance gauge', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForSelector('.game');
    await page.waitForFunction(() => /ESPN/.test((document.querySelector('.wp-src') || {}).textContent || ''));
    const cards = page.locator('.game');
    eq(await cards.nth(2).locator('.side.aw .trec').textContent(), '7-2'); eq(await cards.nth(2).locator('.side.hm .trec').textContent(), '3-6-1', 'NFL ties show');
    assert.ok(/Epsilon NFL Epsilons, 7-2/.test(await cards.nth(2).locator('.side.aw').getAttribute('aria-label')), 'a screen reader hears the record');
    eq(await page.locator('.wp').count(), 1, 'only the game that has not started gets a gauge');
    eq(await cards.nth(2).locator('.wp-n').allTextContents().then(x => x.join(' ')), '30% 70%');
    eq(await cards.nth(2).locator('.wp-n.fav').textContent(), '70%', 'the favourite is marked');
    assert.ok(/ESPN matchup predictor/.test(await cards.nth(2).locator('.wp-src').textContent()));
    assert.ok(/Chance to win: NFL Epsilons 30%, NFL Zetas 70%/.test(await cards.nth(2).locator('.wp').getAttribute('aria-label')));
    const seg = await cards.nth(2).locator('.wp-bar i').evaluateAll(x => x.map(i => [i.getBoundingClientRect().width, getComputedStyle(i).backgroundColor]));
    assert.ok(seg[0][0] > 30 && seg[1][0] > seg[0][0] * 2, 'the bar splits about 30/70: ' + JSON.stringify(seg));
    assert.ok(seg[1][1] !== 'rgb(11, 22, 42)', 'a very dark team colour is lightened so it shows on the card');
    eq(page.__asked.length, 1, 'ESPN is asked only about the open game'); assert.ok(/football\/leagues\/nfl\/events\/NFL-w10-3\/competitions\/NFL-w10-3\/predictor$/.test(page.__asked[0]), page.__asked[0]);
    eq(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'nothing runs off a 390 px phone');
    await page.screenshot({ path: path.join(SHOTS, 'picks-gauge.png') });
    // MLB has no ESPN predictor: the gauge is an estimate from the records and home field, and nothing extra is fetched
    await page.click('[data-sport="mlb"]'); await page.waitForSelector('.wp');
    assert.ok(/estimate from records and home field/.test(await page.textContent('.wp-src')));
    eq(await page.locator('.wp-n.fav').textContent(), X.percents(X.estimateChance('7-2', '3-6-1', 'mlb', false)).away + '%', 'the better record is favoured');
    eq(page.__asked.length, 1);
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

  await test('page: a friend with no Google account signs up with an email on an invite link, then joins', async () => {
    const { ctx, page, errors } = await open({ signedOut: true, ctx: { viewport: { width: 390, height: 844 } } });
    await page.goto(server.url + '?code=good'); await page.waitForSelector('#ef');
    await page.screenshot({ path: path.join(SHOTS, 'picks-email-signin.png'), fullPage: true });
    eq(await page.textContent('#eGo'), 'Create account', 'an invite link opens on Create account');
    assert.ok(await page.isVisible('#si'), 'Google is still offered');
    await page.fill('#em', 'taken@example.com'); await page.fill('#pw', 'abc'); await page.click('#eGo');
    assert.ok(/at least 6/.test(await page.textContent('#eErr')), 'a short password is caught before sending');
    await page.fill('#pw', 'secret1'); await page.click('#eGo'); await page.waitForFunction(() => /already has an account/.test(document.querySelector('#eErr').textContent));
    await page.click('#eMode'); eq(await page.textContent('#eGo'), 'Sign in');
    await page.fill('#pw', 'wrong99'); await page.click('#eGo'); await page.waitForFunction(() => /don't match/.test(document.querySelector('#eErr').textContent));
    await page.fill('#em', ''); await page.click('#eReset'); assert.ok(/Type your email first/.test(await page.textContent('#eErr')));
    await page.fill('#em', 'taken@example.com'); await page.click('#eReset'); await page.waitForFunction(() => window.__auth.some(a => a[0] === 'reset'));
    await page.click('#eMode'); await page.fill('#em', 'friend@example.com'); await page.fill('#pw', 'secret1'); await page.click('#eGo');
    await page.waitForSelector('#join'); eq(await page.inputValue('#jcode'), 'GOOD', 'the code from the link is filled in');
    eq(await page.inputValue('#jname'), '', 'no Google name to borrow, so the name starts empty');
    await page.fill('#jname', 'Friend'); await page.click('#join button.gold');
    await page.waitForSelector('.game'); const w = await page.evaluate(() => window.__writes.find(x => x[0] === 'gp_players'));
    eq(w[1], 'new1'); eq(w[2].code, 'GOOD'); eq(w[2].name, 'Friend'); assert.ok(!('email' in w[2]), 'the email is not copied into the database');
    eq(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('page: a kid with no Google account or email picks a name and a 4-digit PIN, and the name + PIN signs them back in', async () => {
    const { ctx, page, errors } = await open({ signedOut: true, ctx: { viewport: { width: 390, height: 844 } } });
    await page.goto(server.url + '?code=good'); await page.waitForSelector('#pf');
    await page.screenshot({ path: path.join(SHOTS, 'picks-pin-signin.png'), fullPage: true });
    eq(await page.textContent('#pGo'), 'Start playing', 'an invite link opens on a new player');
    await page.fill('#pn', 'Timmy'); await page.fill('#pp', '12'); await page.click('#pGo');
    assert.ok(/4 numbers/.test(await page.textContent('#pErr')), 'a short PIN is caught before sending');
    await page.fill('#pp', '1234'); await page.click('#pGo');
    await page.waitForFunction(() => /Timmy2/.test(document.querySelector('#pErr').textContent));
    await page.click('#pMode'); eq(await page.textContent('#pGo'), 'Sign in');
    await page.fill('#pp', '9999'); await page.click('#pGo'); await page.waitForFunction(() => /don't match/.test(document.querySelector('#pErr').textContent));
    await page.fill('#pp', '1234'); await page.click('#pGo'); await page.waitForFunction(() => window.__auth.some(a => a[0] === 'signin' && a[1] === 'timmy@players.natesteele888.github.io'));
    await page.evaluate(() => firebase.auth().signOut()); await page.waitForSelector('#pf');
    await page.fill('#pn', 'Timmy 2'); await page.fill('#pp', '4321'); await page.click('#pGo');
    await page.waitForSelector('#join'); eq(await page.inputValue('#jname'), 'Timmy 2', 'the player name carries over');
    eq(await page.inputValue('#jcode'), 'GOOD');
    await page.click('#join button.gold'); await page.waitForSelector('.game');
    const w = await page.evaluate(() => window.__writes.find(x => x[0] === 'gp_players'));
    eq(Object.keys(w[2]).sort().join(','), 'code,joinedAt,name', 'nothing but the name and code is saved');
    eq(await page.evaluate(() => window.__auth.filter(a => a[0] === 'create').pop()[1]), 'timmy2@players.natesteele888.github.io');
    eq(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('page: any player can share the code they joined with', async () => {
    const { ctx, page, errors } = await open();
    await page.addInitScript(() => { navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
    await page.goto(server.url); await page.waitForSelector('#inv');
    await page.click('#inv'); const sh = await page.evaluate(() => window.__shared);
    assert.ok(/code=GOOD$/.test(sh.url) && /Code: GOOD/.test(sh.text) && /player name and a PIN/.test(sh.text), JSON.stringify(sh));
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) { console.log('  FAIL ' + results.filter(r => !r[1]).map(r => r[0]).join('\n  FAIL ')); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
