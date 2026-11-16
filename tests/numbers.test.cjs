// App numbers: install.js's anonymous counts, the "This is me" mark (toolbox/me.html) and the numbers page's new-phone badge.
// Every page is served on its real https address through page.route (install.js only counts on https), with Firestore's
// REST calls and the Firebase SDK replaced by stand-ins. Only made-up codes and test data.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { launch } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const REPO = path.join(__dirname, '..', 'apps');
const TYPES = { html: 'text/html', js: 'application/javascript', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
const DASH = 'https://lybs-dashboard.web.app/';
const DASH_HTML = '<!doctype html><html><head><meta name="application-name" content="LYBS Dashboard"><title>LYBS Dashboard</title></head>' +
  '<body><h1>Dashboard</h1><script src="https://natesteele888.github.io/apps/install.js" defer></script></body></html>';
function isoWeek(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const y = d.getFullYear(), w = 1 + Math.round(((d - new Date(y, 0, 4)) / 864e5 - 3 + (new Date(y, 0, 4).getDay() + 6) % 7) / 7); return y + '-W' + (w < 10 ? '0' : '') + w; }
const WEEK = isoWeek(Date.now());

// A phone-sized context where install.js behaves as on a real phone: https pages, navigator.webdriver false, and every
// Firestore REST call recorded (posts[]) and answered by answer(col) (200 by default).
async function phone(browser, answer) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });
  const posts = [];
  await ctx.route(/^https:\/\/firestore\.googleapis\.com\//, r => {
    const u = new URL(r.request().url()), col = u.pathname.split('/').pop();
    posts.push({ col, id: u.searchParams.get('documentId'), body: JSON.parse(r.request().postData() || '{}') });
    r.fulfill({ status: answer ? answer(col) : 200, contentType: 'application/json', body: '{}' });
  });
  await ctx.route(/^https:\/\/natesteele888\.github\.io\/apps\//, r => {
    const p = new URL(r.request().url()).pathname.replace(/^\/apps\//, '').replace(/\/$/, '/index.html');
    const f = path.join(REPO, p);
    if (!f.startsWith(REPO) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: TYPES[path.extname(f).slice(1)] || 'text/plain', body: fs.readFileSync(f) });
  });
  await ctx.route(/^https:\/\/lybs-dashboard\.web\.app\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: DASH_HTML }));
  await ctx.route(/^https:\/\/www\.gstatic\.com\//, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|natesteele888\.github\.io\/apps\/health\.js/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return { ctx, page, posts, errors };
}
const settle = page => page.waitForTimeout(400);

// The Firebase compat SDK, in memory and kept across reloads in sessionStorage (window.__fs), signed in as the owner.
function fakeFirebase(seed) {
  const copy = o => JSON.parse(JSON.stringify(o));
  let saved = null; try { saved = sessionStorage.getItem('__fs'); } catch (e) {}
  const data = window.__fs = saved ? JSON.parse(saved) : copy(seed || {});
  const keep = () => { try { sessionStorage.setItem('__fs', JSON.stringify(data)); } catch (e) {} };
  const snap = (c, id) => ({ id, exists: !!(data[c] && data[c][id]), data: () => data[c] && data[c][id] ? copy(data[c][id]) : undefined });
  const q = (c, filters) => ({
    where: (f, op, v) => q(c, filters.concat([[f, op, v]])),
    get: async () => { const docs = Object.keys(data[c] || {}).filter(id => filters.every(([f, op, v]) => op === 'in' ? v.includes(data[c][id][f]) : data[c][id][f] === v)).map(id => snap(c, id));
      return { docs, size: docs.length, forEach: fn => docs.forEach(fn) }; }
  });
  const fsApi = { collection: c => Object.assign(q(c, []), { doc: id => ({ get: async () => snap(c, id), set: async o => { data[c] = data[c] || {}; data[c][id] = copy(o); keep(); } }) }) };
  const auth = { onAuthStateChanged: f => setTimeout(() => f({ uid: 'owner', email: 'owner@example.com' }), 0) };
  window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth: Object.assign(() => auth, { GoogleAuthProvider: function () { this.setCustomParameters = () => {}; } }), firestore: () => fsApi };
  // The real SDK scripts are served empty, so they can't replace this one.
}

(async () => {
  const browser = await launch();

  await test('install.js counts an open on the LYBS Dashboard with only the app, the week and a random code', async () => {
    const { ctx, page, posts, errors } = await phone(browser);
    await page.goto(DASH); await settle(page);
    const pid = await page.evaluate(() => localStorage.getItem('nate.phone'));
    assert.ok(/^[a-z0-9]{16}$/.test(pid), 'a random phone code');
    eq(posts.length, 1, JSON.stringify(posts));
    eq(posts[0].col, 'app_opens'); eq(posts[0].id, 'lybs-dashboard~' + WEEK + '~' + pid);
    eq(JSON.stringify(posts[0].body), JSON.stringify({ fields: { app: { stringValue: 'lybs-dashboard' }, week: { stringValue: WEEK } } }));
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('?nateme marks this browser as mine on that site: it sends its code once to app_me and never counts again', async () => {
    const { ctx, page, posts, errors } = await phone(browser);
    await page.goto(DASH); await settle(page);
    const pid = await page.evaluate(() => localStorage.getItem('nate.phone'));
    eq(posts.length, 1, 'counted before it was marked');
    await page.goto(DASH + '?nateme'); await settle(page);
    eq(posts.length, 2, JSON.stringify(posts));
    eq(posts[1].col, 'app_me'); eq(posts[1].id, pid, 'the same code, so the numbers page can leave out what it counted before');
    eq(JSON.stringify(posts[1].body), JSON.stringify({ fields: { app: { stringValue: 'lybs-dashboard' } } }), 'nothing but the app');
    assert.ok(/Marked as you/.test(await page.textContent('.nate-me-toast')), 'says so on the page');
    eq(await page.evaluate(() => Array.from(document.body.children).some(e => e.shadowRoot)), false, 'no install bar over it');
    // Later opens, with no ?nateme: nothing is sent, and an app's own count call does nothing.
    await page.goto(DASH); await settle(page);
    await page.evaluate(() => window.nateCount && window.nateCount('reads')); await settle(page);
    eq(posts.length, 2, 'no more counts from this browser: ' + JSON.stringify(posts.slice(2)));
    eq(await page.$('.nate-me-toast'), null, 'the note only shows when marking');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('a mark that could not reach app_me is sent again on the next open, and still counts nothing meanwhile', async () => {
    let fail = true;
    const { ctx, page, posts, errors } = await phone(browser, col => col === 'app_me' && fail ? 403 : 200);
    await page.goto(DASH + '#nateme'); await settle(page);
    eq(posts.map(p => p.col).join(','), 'app_me');
    fail = false;
    await page.goto(DASH); await settle(page);
    eq(posts.map(p => p.col).join(','), 'app_me,app_me', 'tried again, still no open counted');
    await page.goto(DASH); await settle(page);
    eq(posts.length, 2, 'and once it got through, never again');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await test('This is me page marks every app at natesteele888.github.io and lists the sites that need their own tap', async () => {
    const { ctx, page, posts, errors } = await phone(browser);
    await page.goto('https://natesteele888.github.io/apps/toolbox/me.html');
    await page.waitForFunction(() => /Done: this browser is marked as yours/.test(document.getElementById('here').textContent));
    assert.ok(/\?nateme$/.test(page.url()), page.url());
    eq(posts.map(p => p.col).join(','), 'app_me');
    eq(posts[0].body.fields.app.stringValue, 'apps-toolbox');
    eq(await page.evaluate(() => localStorage.getItem('nate.me')), '1');
    await page.waitForSelector('#others:not([hidden]) .site');
    const sites = await page.$$eval('#sites .site', els => els.map(e => [e.querySelector('span').textContent, e.querySelector('a').getAttribute('href')]));
    assert.ok(/LYBS Dashboard/.test(sites[0][0]), 'the Dashboard comes first: ' + JSON.stringify(sites));
    eq(sites[0][1], 'https://lybs-dashboard.web.app/?nateme');
    assert.ok(sites.every(([, h]) => /^https:\/\/[a-z0-9.-]+\/\?nateme$/.test(h) && !/github\.io/.test(h)), JSON.stringify(sites));
    // Another app on the same site is covered by the same mark.
    await page.goto('https://natesteele888.github.io/apps/toolbox/me.html'); await settle(page);
    eq(posts.length, 1, 'already marked and sent');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  const opens = (app, pids) => Object.fromEntries(pids.map(p => [app + '~' + WEEK + '~' + p, { app, week: WEEK }]));
  const SEED = {
    app_opens: { ...opens('lybs-dashboard', ['mymine00000000aa', 'otherb0000000000', 'otherc0000000000']), ...opens('lybs-ballclub', ['otherd0000000000', 'mymine00000000aa']), ...opens('apps-toolbox', ['othere0000000000']) },
    app_installs: { 'lybs-dashboard~otherb0000000000': { app: 'lybs-dashboard', week: WEEK }, 'lybs-dashboard~mymine00000000aa': { app: 'lybs-dashboard', week: WEEK } },
    app_reads: {}, app_goals: {},
    app_me: { mymine00000000aa: { app: 'lybs-dashboard' } }
  };
  const rowOf = (page, name) => page.$$eval('tbody tr', (trs, n) => { const tr = trs.find(t => t.cells[0].textContent.startsWith(n)); return tr ? Array.from(tr.cells).map(c => c.textContent) : null; }, name);

  await test('numbers page leaves out my marked phones and flags new phones on the LYBS Dashboard and Ballclub until Got it', async () => {
    const { ctx, page, errors } = await phone(browser);
    await page.addInitScript(fakeFirebase, SEED);
    await page.goto('https://natesteele888.github.io/apps/toolbox/numbers.html');
    await page.waitForSelector('#newbox');
    eq(await page.textContent('#newbox p'), '2 new phones on LYBS Dashboard, 1 new phone on LYBS Ballclub since you last looked.');
    eq(await page.textContent('#mineline'), '1 of your own phone or browser is left out. This is me');
    eq(await page.textContent('.tiles .tile b'), '4', 'phones this week, without mine');
    const dash = await rowOf(page, 'LYBS Dashboard');
    eq(dash[0], 'LYBS Dashboard2 new'); eq(dash[1], '2', 'this week, without mine'); eq(dash[4], '1', 'installs, without mine');
    eq((await rowOf(page, 'LYBS Ballclub'))[0], 'LYBS Ballclub1 new');
    eq((await rowOf(page, "Nate's Toolbox"))[0], "Nate's Toolbox", 'only the watched apps get a badge');
    await page.click('#gotit');
    await page.waitForSelector('#nonew');
    eq(await page.textContent('#nonew'), 'No new phones on LYBS Dashboard or LYBS Ballclub since you last looked.');
    eq(await page.$('.new'), null, 'badges cleared');
    const seen = await page.evaluate(() => window.__fs.app_seen.watch.codes.slice().sort());
    eq(JSON.stringify(seen), JSON.stringify(['otherb0000000000', 'otherc0000000000', 'otherd0000000000']), 'only random codes, and never mine');
    // Someone new opens the Dashboard: one new phone, once.
    await page.evaluate(w => { window.__fs.app_opens['lybs-dashboard~' + w + '~otherf0000000000'] = { app: 'lybs-dashboard', week: w }; sessionStorage.setItem('__fs', JSON.stringify(window.__fs)); }, WEEK);
    await page.reload(); await page.waitForSelector('#newbox');
    eq(await page.textContent('#newbox p'), '1 new phone on LYBS Dashboard since you last looked.');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });

  await browser.close();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? `${failed}/${results.length} failed` : `all passed (${results.length})`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
