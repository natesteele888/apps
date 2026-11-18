// My Stats tests (the page that sends LYBS stats to the watch). Run:
//   NODE_PATH=<node_modules with playwright> tests/run.sh mystats
// Part 1: core.js with made-up players and hand-worked numbers. Part 2: the page in a real browser, with a stand-in for the
// Firebase SDK (signed in, made-up stats) and the watch link's network caught, so nothing real is read or written.
const assert = require('assert');
const C = require('../apps/stats/core.js');
const { launch, startServer, newPage } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));

// made-up players and numbers only
const ROWS = [
  { key: 'sam|q', year: 2026, sport: 'Baseball', team: 'Majors Coachname', batting: { gp: 16, pa: 52, ab: 44, h: 16, r: 12, rbi: 11, bb: 7, so: 8, hbp: 1, sb: 7, cs: 1, '2b': 4, '3b': 1, hr: 1, tb: 25, avg: '.364' },
    pitching: { gp: 7, gs: 4, ip: '17.1', ip_dec: 17.333, so: 24, bb: 6, h: 15, er: 11, w: 3, l: 2, pitches: 310, era: '5.71' }, fielding: { tc: 20 } },
  { key: 'sam|q', year: 2025, sport: 'Baseball', team: 'Minors Blue', batting: { gp: 14, pa: 45, ab: 38, h: 12, r: 10, rbi: 8, bb: 6, so: 9, hbp: 1, sb: 9, cs: 2, '2b': 3, hr: 0 },
    pitching: { gp: 5, gs: 2, ip: '9.2', so: 11, bb: 9, h: 8, er: 5, w: 1, l: 1 } },
  // the same season imported twice: the one with more games stays
  { key: 'sam|q', year: 2025, sport: 'Baseball', team: 'Minors Blue', batting: { gp: 3, ab: 9, h: 1 }, pitching: {} },
  { key: 'alex|z', year: 2026, sport: 'Baseball', team: 'Majors Red', batting: { gp: 10, ab: 30, h: 9 }, pitching: {} },
  { key: 'samantha|b', year: 2024, sport: 'Softball', team: '10U Select', batting: { gp: 9, ab: 20, h: 8 }, pitching: {} },
];

(async () => {
  await test('core: levels from team names, never the rest of the name', async () => {
    eq(C.levelOf('Majors Coachname'), 'Majors'); eq(C.levelOf('LYBS Minors Black'), 'Minors'); eq(C.levelOf('Majors B Blue'), 'Majors B');
    eq(C.levelOf('Rookies Green'), 'Rookies'); eq(C.levelOf('10U Select'), 'Select'); eq(C.levelOf('Montachusett 11U'), '11U'); eq(C.levelOf('Coachname Hawks'), ''); eq(C.levelOf(null), '');
  });

  await test('core: innings from ip_dec or the baseball way', async () => {
    eq(C.innings({ ip_dec: 17.333 }), 17.333); eq(C.innings({ ip: '9.2' }), 9.667); eq(C.innings({ ip: '4' }), 4); eq(C.innings({ ip: '4.5' }), 0); eq(C.innings({}), 0); eq(C.innings(null), 0);
  });

  await test('core: the picker lists players by name, and search matches first names', async () => {
    const list = C.players(ROWS);
    eq(list.map(p => p.name).join(','), 'Alex Z.,Sam Q.,Samantha B.');
    eq(list.find(p => p.key === 'sam|q').years.join(','), '2026,2025');
    eq(C.search(list, 'sam').length, 2); eq(C.search(list, 'SAMA')[0].key, 'samantha|b'); eq(C.search(list, '').length, 0); eq(C.search(list, 'q.').length, 1);
  });

  await test('core: what goes to the watch is numbers, year and level only', async () => {
    const w = C.forWatch(ROWS, 'sam|q', 99);
    eq(w.v, 1); eq(w.at, 99); eq(w.s.length, 2, 'the double import kept one');
    eq(w.s[0].y, 2026); eq(w.s[0].lv, 'Majors'); eq(w.s[0].b.h, 16); eq(w.s[0].b['2b'], 4); eq(w.s[0].p.ip, 17.333); eq(w.s[0].p.pc, 310);
    eq(w.s[1].b.g, 14, 'the 14-game copy of 2025'); eq(w.s[1].p.ip, 9.667);
    const text = JSON.stringify(w);
    assert.ok(!/sam|coachname|blue|baseball/i.test(text), 'no name, team or sport words: ' + text);
    eq(C.forWatch(ROWS, 'nobody|x').s.length, 0);
  });

  await test('core: the page shows the same AVG, OPS and ERA the watch works out', async () => {
    const l = C.line(C.forWatch(ROWS, 'sam|q').s[0]);
    eq(l.avg, '.364'); eq(l.ops, '1.030'); eq(l.era, '5.71'); eq(l.ip, '17.1');
    eq(C.line({ b: { ab: 0, h: 0, bb: 0, hbp: 0, '2b': 0, '3b': 0, hr: 0, tb: 0 }, p: { ip: 0, er: 0 } }).avg, '—');
  });

  /* ======================= PART 2: the page ======================= */
  const FAKE_FB = `
    window.firebase = (function () {
      let cb = null, signedIn = !!window.__signedIn;
      const user = { displayName: 'Test Admin', uid: 'u1' };
      const auth = () => ({ onAuthStateChanged: f => { cb = f; setTimeout(() => f(signedIn ? user : null), 10); },
        signInWithPopup: async () => { signedIn = true; cb && cb(user); }, signOut: async () => { signedIn = false; cb && cb(null); } });
      auth.GoogleAuthProvider = function () {};
      const firestore = () => ({ collection: c => ({ doc: d => ({ get: async () => {
        if (window.__denied) { const e = new Error('no'); e.code = 'permission-denied'; throw e; }
        window.__read = c + '/' + d; return { exists: true, data: () => ({ rows: window.__rows }) };
      } }) }) });
      return { initializeApp: () => {}, auth, firestore };
    })();`;
  const browser = await launch();
  const srv = await startServer('stats');
  async function open(opts) {
    const { ctx, page, errors } = await newPage(browser);
    const writes = [];
    // one handler (Playwright tries the newest route first, so two would let the catch-all win): the fake SDK for
    // app-compat, nothing for auth and firestore
    await page.route(/gstatic\.com\/firebasejs\//, r => {
      if (opts.sdkDown && opts.sdkDown.on) { opts.sdkDown.asked++; return r.abort(); }
      return r.fulfill({ contentType: 'text/javascript', body: /firebase-app-compat\.js/.test(r.request().url()) ? FAKE_FB : '' });
    });
    await page.route(/firestore\.googleapis\.com/, async r => {
      const q = r.request();
      if (q.method() === 'PATCH') { writes.push({ url: q.url(), body: JSON.parse(q.postData()) }); return r.fulfill({ status: opts.status || 200, contentType: 'application/json', body: '{}' }); }
      return r.fulfill({ status: 404, body: '' });
    });
    await page.addInitScript(o => {
      window.__rows = o.rows; window.__signedIn = o.signedIn; window.__denied = o.denied;
      if (o.linked) localStorage.setItem('steele.watchlink', 'abcdefghijklmnopqrstuvwxyz');
      if (o.player) localStorage.setItem('stats.player', o.player);
    }, { rows: ROWS, signedIn: !!opts.signedIn, denied: !!opts.denied, linked: !!opts.linked, player: opts.player || '' });
    await page.goto(srv.url);
    return { ctx, page, errors, writes };
  }

  try {
    await test('page: signed out shows the sign-in button; signing in lists players to pick', async () => {
      const { ctx, page, errors } = await open({ linked: true });
      await page.getByRole('button', { name: 'Sign in with Google' }).click();
      await page.getByPlaceholder('Type a first name').fill('sa');
      await page.getByRole('button', { name: /Sam Q\./ }).waitFor();
      eq(await page.getByRole('button', { name: /Samantha B\./ }).count(), 1);
      eq(await page.evaluate(() => window.__read), 'lybs_bins/lybs-gcstats');
      eq(errors.length, 0, errors.join('\n'));
      await ctx.close();
    });

    await test('page: picking a player sends the numbers to the watch by itself, once', async () => {
      const { ctx, page, errors, writes } = await open({ signedIn: true, linked: true });
      await page.getByPlaceholder('Type a first name').fill('sam');
      await page.getByRole('button', { name: /Sam Q\./ }).click();
      await page.getByText(/Sent! 2 seasons/).waitFor();
      eq(writes.length, 1);
      assert.ok(/fw_links\/abcdefghijklmnopqrstuvwxyz\?updateMask\.fieldPaths=ps&updateMask\.fieldPaths=updated$/.test(writes[0].url), writes[0].url);
      const sent = JSON.parse(writes[0].body.fields.ps.stringValue);
      eq(sent.s.length, 2); eq(sent.s[0].b.h, 16);
      assert.ok(!/sam|coachname/i.test(writes[0].body.fields.ps.stringValue));
      // the table shows the season
      await page.getByRole('cell', { name: '2026 Majors' }).waitFor();
      // opening again sends nothing new
      await page.reload(); await page.getByText('The watch has these numbers.').waitFor();
      eq(writes.length, 1, 'no second write for the same numbers');
      eq(errors.length, 0, errors.join('\n'));
      await ctx.close();
    });

    await test('page: rules not published yet says so; no watch linked asks to link first', async () => {
      let o = await open({ signedIn: true, linked: true, player: 'sam|q', status: 403 });
      await o.page.getByText(/database rules need publishing/).waitFor();
      await o.ctx.close();
      o = await open({ signedIn: true, linked: false, player: 'sam|q' });
      await o.page.getByText('Link the watch above first.').waitFor();
      eq(await o.page.getByRole('button', { name: 'Send to the watch' }).isDisabled(), true);
      eq(o.writes.length, 0);
      await o.ctx.close();
    });

    await test('page: no signal for sign-in shows Try again, which signs in once signal is back', async () => {
      const sdkDown = { on: true, asked: 0 };
      const { ctx, page, errors } = await open({ linked: true, sdkDown });
      await page.getByText(/No connection\. My Stats needs signal/).waitFor();
      sdkDown.on = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByRole('button', { name: 'Sign in with Google' }).waitFor();
      eq(await page.evaluate(() => [...document.scripts].filter(s => /firebase-app-compat/.test(s.src)).length), 1, 'app script loaded once');
      eq(errors.filter(e => !/ERR_FAILED|Failed to load resource/.test(e)).length, 0, errors.join('\n'));
      await ctx.close();
    });

    await test('page: an account that can\'t read player stats is told so', async () => {
      const { ctx, page } = await open({ signedIn: true, denied: true, linked: true });
      await page.getByText(/can't see player stats/).waitFor();
      eq(await page.locator('#player').isHidden(), true);
      await ctx.close();
    });
  } finally { srv.stop(); await browser.close(); }

  const failed = results.filter(r => !r[1]);
  console.log(failed.length ? failed.length + ' FAILED' : 'all passed (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
