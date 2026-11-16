// Walk-Up Field mode: the tablet at the field that plays every Lunenburg team's walk-ups. Run:
//   NODE_PATH=<node_modules with playwright> tests/run.sh walkup-field
// The logic (field-core.js) is tested in node. The page tests use the real Field mode page with LYBS Select's sign-in and
// database faked by routing their addresses, so nothing reaches Firebase. Placeholder names only.
const assert = require('assert');
const F = require('../apps/walkup/field-core.js');
const C = require('../apps/walkup/core.js');
const { chromium, startServer, newPage, CHROME } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));

const DAY = '2026-05-09';
const roster = (t, n) => Array.from({ length: n }, (_, i) => ({ id: t + 'p' + i, name: 'Player ' + t.toUpperCase() + (i + 1) + ' Test', number: String(i + 1) }));
function league() {
  const black = roster('k', 9), blue = roster('u', 9);
  return {
    teams: {
      'majors-black': {
        roster: black,
        lineups: [{ id: 'l2', name: 'Today', date: DAY, slots: black.slice().reverse().map(p => ({ playerId: p.id, name: p.name, position: 'P' })) },
                  { id: 'l1', name: 'Old', date: '2026-05-01', slots: black.map(p => ({ playerId: p.id, name: p.name })) }],
        schedule: [{ id: 'g1', opponent: 'Majors Blue', date: DAY, gameTime: '6:00 PM', homeAway: 'home', location: 'Fitzgerald Field, Lunenburg', status: 'scheduled' },
                   { id: 'g2', opponent: 'Leominster', date: DAY, gameTime: '8:00 PM', homeAway: 'away', location: 'Doyle Field, Leominster' }],
        walkupSongs: { kp0: { song: 'Not On This Tablet', at: 1 } }
      },
      'majors-blue': {
        roster: blue,
        lineups: [{ id: 'l3', name: 'Last week', date: '2026-05-02', slots: blue.map(p => ({ playerId: p.id, name: p.name })) }],
        schedule: [{ id: 'h1', opponent: 'Majors Black', date: DAY, gameTime: '6:00 PM', homeAway: 'away', location: 'Fitzgerald Field' }]
      },
      'minors-black': {
        roster: roster('m', 8), lineups: [],
        schedule: [{ id: 'm1', opponent: 'Townsend', date: DAY, gameTime: '5:30 PM', homeAway: 'home', location: 'Powell Field' },
                   { id: 'm2', opponent: 'Ayer', date: DAY, gameTime: '7:30 PM', homeAway: 'home', location: 'Powell Field', status: 'cancelled' }]
      }
    }
  };
}
const REGISTRY = 'window.TEAM_REGISTRY = { codeHashes: {}, teams: { "majors-black": { name: "Majors Black", shortName: "Majors Black" }, "majors-blue": { name: "Majors Blue", shortName: "Majors Blue" }, "minors-black": { name: "Minors Black", shortName: "Minors Black" } } };';
const INFO = { facilities: [{ name: 'Fitzgerald Field', town: 'Lunenburg', home: true }, { name: 'McNally Park', town: 'Lunenburg', home: true }, { name: 'Powell Field', town: 'Lunenburg', home: true }, { name: 'Doyle Field', town: 'Leominster' }] };

(async () => {
  await test('Core: the tablet code is 6 easy letters and the same every time', async () => {
    const a = F.deviceCode('uidAAAA'), b = F.deviceCode('uidAAAA'), c = F.deviceCode('uidBBBB');
    assert.ok(/^[A-HJ-NP-Z2-9]{6}$/.test(a), a); eq(a, b); assert.notStrictEqual(a, c);
  });

  await test('Core: today\'s games at a field, two Lunenburg teams become one game, called-off games are left out', async () => {
    const L = league().teams;
    const teams = Object.keys(L).map(id => ({ teamId: id, name: id === 'majors-black' ? 'Majors Black' : id === 'majors-blue' ? 'Majors Blue' : 'Minors Black', schedule: L[id].schedule }));
    const fitz = F.gamesAt(teams, DAY, 'Fitzgerald Field');
    eq(fitz.length, 1);
    eq(fitz[0].sides[0].teamId, 'majors-blue', 'Blue is away so bats first'); eq(fitz[0].sides[1].teamId, 'majors-black');
    eq(fitz[0].timeLabel, '6:00 PM');
    const powell = F.gamesAt(teams, DAY, 'Powell Field');
    eq(powell.length, 1, 'cancelled game is gone'); eq(powell[0].sides[0].visitor, true); eq(powell[0].sides[0].name, 'Townsend');
    const all = F.gamesAt(teams, DAY, '');
    eq(all.length, 3, 'every field includes the away game'); eq(all[0].timeLabel, '5:30 PM', 'earliest first');
    eq(F.homeFields(INFO).join('|'), 'Fitzgerald Field|McNally Park|Powell Field');
  });

  await test('Core: lineups pick today\'s, else the newest, and walk-up songs are found by name', async () => {
    const L = league().teams;
    const p = F.pickLineup(L['majors-black'].lineups, DAY); eq(p.exact, true); eq(p.lineup.id, 'l2');
    const q = F.pickLineup(L['majors-blue'].lineups, DAY); eq(q.exact, false); eq(q.lineup.id, 'l3');
    eq(F.pickLineup([], DAY), null);
    const rows = F.orderRows(L['majors-black'].roster, p.lineup);
    eq(rows[0].pid, 'kp8', 'today\'s order'); eq(rows[0].num, '9');
    const songs = [{ id: 's1', kind: 'file', title: 'Thunderstruck', dur: 200 }, { id: 's2', kind: 'file', title: 'Eye of the Tiger (Live)', dur: 240 }];
    eq(F.songMatch('thunderstruck', songs), 's1'); eq(F.songMatch('Eye of the Tiger', songs), 's2'); eq(F.songMatch('Something Else', songs), null);
    const b = F.buildSide(C, { side: 'a', rows, picks: { kp8: { song: 'Thunderstruck', start: 30 }, kp7: { song: 'Nope' } }, songs, settings: C.emptyState().settings });
    eq(b.st.roster.length, 9); eq(b.st.roster[0].songId, 's1'); eq(b.st.roster[0].trim.start, 30); eq(b.picked, 1);
    eq(b.unmatched.length, 1); eq(b.st.roster[0].name, 'Player', 'announced by first name');
    assert.ok(b.st.roster.every(p => p.songId && p.voice), 'everyone gets a song and the voice');
    eq(F.loadWindow({ time: 18 * 60 }, 16 * 60), 'early'); eq(F.loadWindow({ time: 18 * 60 }, 17 * 60 + 30), 'open'); eq(F.loadWindow({ time: 18 * 60 }, 18 * 60 + 1), 'started');
  });

  const srv = await startServer('walkup');
  const br = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

  // A pretend LYBS Select: anonymous sign-in, and a database that only lets in an approved tablet.
  async function open(opts = {}) {
    const { ctx, page, errors } = await newPage(br, { today: DAY, ctx: { viewport: { width: 1024, height: 700 } }, context: opts.context });
    const db = opts.db || { data: league(), kiosks: {}, requests: {}, uid: 'uidTablet1', down: false, reads: [] };
    await page.addInitScript(m => { window.__nowMin = m; }, opts.nowMin == null ? 17 * 60 : opts.nowMin);
    await page.addInitScript(() => {
      try { delete Window.prototype.speechSynthesis; delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; } catch (e) {}
      window.__tts = [];
      window.WalkupNative = { ttsSpeak: (id, text) => { window.__tts.push(text); setTimeout(() => window.__wuTts && window.__wuTts(id, 'end'), 30); }, ttsStop: () => {} };
    });
    await page.route(/\/lybs-ballclub\/js\/team-registry\.js/, r => r.fulfill({ contentType: 'text/javascript', body: REGISTRY }));
    await page.route(/\/lybs-ballclub\/data\/league-info\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(INFO) }));
    await page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, r => {
      if (db.down) return r.abort();
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ localId: db.uid, user_id: db.uid, idToken: 'tok', id_token: 'tok', refreshToken: 'rt', refresh_token: 'rt', expiresIn: '3600', expires_in: '3600' }) });
    });
    await page.route(/firebaseio\.com/, r => {
      if (db.down) return r.abort();
      const u = new URL(r.request().url()), path = u.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/');
      const ok = body => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body === undefined ? null : body) });
      const deny = () => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Permission denied"}' });
      if (path[0] === 'fieldKioskRequests' && r.request().method() === 'PUT') { db.requests[path[1]] = JSON.parse(r.request().postData()); return ok(db.requests[path[1]]); }
      if (path[0] === 'fieldKiosks') return path[1] === db.uid ? ok(db.kiosks[db.uid]) : deny();
      if (path[0] === 'teams') {
        if (!(db.kiosks[db.uid] && db.kiosks[db.uid].ok)) return deny();
        db.reads.push(path.join('/'));
        const t = db.data.teams[path[1]]; return ok(t && t[path[2]]);
      }
      deny();
    });
    await page.goto(srv.url + 'field.html');
    return { ctx, page, errors, db };
  }

  await test('Page: a new tablet shows its code, asks to be let in, then shows today\'s games at its field', async () => {
    const { page, errors, ctx, db } = await open();
    await page.waitForSelector('.fm-code');
    const code = F.deviceCode('uidTablet1');
    eq((await page.textContent('.fm-code')).replace(/\s/g, ''), code);
    await page.fill('#fmLabel', 'Press box');
    await page.click('[data-a=ask]');
    await page.waitForFunction(() => /Ask again/.test(document.querySelector('[data-a=ask]').textContent));
    eq(db.requests.uidTablet1.code, code); eq(db.requests.uidTablet1.label, 'Press box');
    eq(db.reads.length, 0, 'no team data before it is let in');
    db.kiosks.uidTablet1 = { ok: true, code };
    await page.click('[data-a=retry]');
    await page.waitForSelector('[data-a=field][data-f="Fitzgerald Field"]');
    await page.click('[data-a=field][data-f="Fitzgerald Field"]');
    await page.waitForSelector('.fm-game');
    eq(await page.locator('.fm-game').count(), 1);
    assert.ok(/Majors Blue\s*at\s*Majors Black/.test(await page.textContent('.fm-game')));
    await page.waitForFunction(() => window.WU.field.S.day.teams['majors-black'] && window.WU.field.S.day.teams['majors-black'].at);
    assert.ok(db.reads.includes('teams/majors-black/lineups') && db.reads.includes('teams/majors-blue/roster'), 'loads both teams playing here');
    assert.ok(!db.reads.includes('teams/minors-black/roster'), 'not teams playing elsewhere');
    eq(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0), true);
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  async function approvedGame(opts = {}) {
    const db = { data: league(), kiosks: { uidTablet1: { ok: true, code: 'X' } }, requests: {}, uid: 'uidTablet1', down: false, reads: [] };
    const o = await open({ ...opts, db });
    await o.page.waitForSelector('[data-a=field][data-f="Fitzgerald Field"]');
    await o.page.click('[data-a=field][data-f="Fitzgerald Field"]');
    await o.page.waitForFunction(() => window.WU.field.S.day.teams['majors-blue'] && window.WU.field.S.day.teams['majors-blue'].at);
    await o.page.click('.fm-game');
    await o.page.waitForSelector('.fm-tile');
    return o;
  }

  await test('Page: a game has both lineups, plays the next batter after a countdown, and Stop cuts it', async () => {
    const { page, errors, ctx } = await approvedGame();
    eq(await page.locator('.fm-tile').count(), 9);
    assert.ok(/last saved lineup/i.test(await page.textContent('.fm-bar')), 'Blue uses its older lineup and says so');
    assert.ok(/#1/.test(await page.textContent('.fm-tile >> nth=0')));
    await page.click('[data-a=bat][data-k="1"]');
    assert.ok(/lineup for today/i.test(await page.textContent('.fm-bar')));
    assert.ok(/#9/.test(await page.textContent('.fm-tile >> nth=0')), 'Black bats in today\'s order');
    assert.ok(/Not on this tablet/.test(await page.textContent('.fm-main')), 'says which picked song is missing');
    await page.click('.fm-play');
    await page.waitForSelector('.fm-count');
    await page.waitForSelector('.fm-count', { state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => window.__tts.length > 0, null, { timeout: 8000 });
    eq(await page.evaluate(() => window.__tts[0]), 'Now batting. Number 9. Player!', 'announces number and first name');
    eq(await page.evaluate(() => window.WU.field.S.next[1]), 1, 'the next batter moves on');
    await page.click('[data-a=stop]');
    eq(await page.evaluate(() => window.WU.field.S.playing), null);
    // a tap during the countdown cancels
    const before = (await page.evaluate(() => window.__tts.length));
    await page.click('.fm-tile >> nth=3');
    await page.waitForSelector('.fm-count'); await page.click('.fm-count');
    await page.waitForTimeout(2600);
    eq(await page.evaluate(() => window.__tts.length), before, 'nothing played');
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await test('Page: with no signal later, the tablet still opens today\'s game from what it saved', async () => {
    const o = await approvedGame();
    const ctx = o.ctx;
    o.db.down = true;
    await o.page.close();
    const { page, errors } = await open({ context: ctx, db: o.db });
    await page.waitForSelector('.fm-game');
    assert.ok(/No signal/.test(await page.textContent('.fm-main')));
    await page.click('.fm-game'); await page.waitForSelector('.fm-tile');
    eq(await page.locator('.fm-tile').count(), 9);
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await test('Page: once the game starts the lineups hold still unless Reload is tapped', async () => {
    const { page, errors, ctx, db } = await approvedGame({ nowMin: 18 * 60 + 10 });
    const n = db.reads.filter(r => r === 'teams/majors-black/lineups').length;
    await page.evaluate(() => window.WU.field.sync(false));
    eq(db.reads.filter(r => r === 'teams/majors-black/lineups').length, n, 'a refresh after first pitch leaves lineups alone');
    await page.click('[data-a=reload]');
    await page.waitForFunction(() => !window.WU.field.S.loading);
    assert.ok(db.reads.filter(r => r === 'teams/majors-black/lineups').length > n, 'Reload lineups fetches them');
    assert.deepStrictEqual(errors, []); await ctx.close();
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
