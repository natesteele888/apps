// Bills tests: the month list and totals, adding and importing bills, paid marks, the private cloud record and the fingerprint lock.
// Firebase is stubbed (the real scripts live on gstatic) and the fingerprint is Chrome's virtual authenticator. Placeholder bills only.
const assert = require('assert');
const { launch, startServer, newPage } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const NOW = new Date('2026-11-14T10:00:00');

// One document store per test run; onSnapshot listeners get every write to their path.
const FAKE_FB = `(function(){ if (window.firebase) return; var L = [], user = null, subs = {}; try { user = JSON.parse(localStorage.getItem('fakeUser')); } catch (e) {}
  function snap(d) { return { exists: d != null, data: function () { return d; }, metadata: { hasPendingWrites: false } }; }
  function Ref(path) { this.path = path; }
  Ref.prototype.onSnapshot = function (cb, err) { var p = this.path; window.__fsSubscribe(p); (subs[p] = subs[p] || []).push(cb);
    window.__fsGet(p).then(function (d) { if (d && d.__deny) { var e = new Error('denied'); e.code = 'permission-denied'; err(e); return; } cb(snap(d)); });
    return function () { subs[p] = (subs[p] || []).filter(function (f) { return f !== cb; }); }; };
  Ref.prototype.set = async function (d) { await window.__fsSet(this.path, d); (subs[this.path] || []).forEach(function (f) { f(snap(JSON.parse(JSON.stringify(d)))); }); };
  var auth = { get currentUser() { return user; }, getRedirectResult: function () { return Promise.resolve(null); },
    onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(user); }, 0); },
    signInWithPopup: async function (p) { window.__lastPrompt = p.prompt; user = { uid: window.__uid || 'u1', email: 'owner@example.com' }; localStorage.setItem('fakeUser', JSON.stringify(user)); L.forEach(function (f) { f(user); }); return { user: user }; },
    signOut: async function () { user = null; localStorage.removeItem('fakeUser'); L.forEach(function (f) { f(null); }); } };
  var fs = { collection: function (c) { return { doc: function (id) { return new Ref(c + '/' + id); } }; } };
  window.firebase = { apps: [], initializeApp: function () { this.apps.push(1); },
    auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: function () { var s = this; this.setCustomParameters = function (o) { s.prompt = o.prompt; }; } }),
    firestore: function () { return fs; } }; })();`;

const toLink = (url, bills) => url + '#import=' + Buffer.from(JSON.stringify(bills)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const SAMPLE = [
  { name: 'Rent', amount: 1500, every: 1, start: '2026-12-01' },
  { name: 'Card A minimum', amount: 40, every: 1, start: '2026-12-02', full: 400, estimate: true },
  { name: 'Streaming', amount: 12.5, every: 1, start: '2026-11-20', end: '2027-01-20', autopay: true },
];

(async () => {
  const srv = await startServer('bills');
  const br = await launch();
  const cloudDb = new Map(); let deny = false, subscribes = 0;
  const mkPhone = async (opts = {}) => {
    const ctx = opts.ctx || await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    if (!opts.ctx) {
      await ctx.exposeFunction('__fsGet', async p => deny ? { __deny: true } : (cloudDb.has(p) ? JSON.parse(JSON.stringify(cloudDb.get(p))) : null));
      await ctx.exposeFunction('__fsSet', async (p, d) => { cloudDb.set(p, d); });
      await ctx.exposeFunction('__fsSubscribe', async () => { subscribes++; });
      await ctx.route(/gstatic\.com\/firebasejs/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }));
    }
    const o = await newPage(br, { context: ctx });
    await o.page.clock.setFixedTime(NOW);
    return o;
  };
  const state = () => { const d = cloudDb.get('bills_users/u1'); return d ? JSON.parse(d.data) : null; };
  const total = page => page.locator('#totBig').textContent();
  const signIn = async page => { await page.locator('#signBtn').click(); await page.waitForFunction(() => /Synced/.test(document.querySelector('#syncStatus').textContent)); };

  const A = await mkPhone();
  await test('signed out: the sign-in screen shows and no bills are loaded', async () => {
    await A.page.goto(srv.url); await A.page.waitForSelector('#signGate:not(.hidden)');
    eq(await total(A.page), '—'); eq(subscribes, 0);
  });
  await test('sign in: an empty account invites you to add bills', async () => {
    await signIn(A.page);
    assert.ok(/No bills yet/.test(await A.page.locator('#listHost').textContent()));
    eq(await total(A.page), '$0.00');
  });
  await test('add a bill: it lists under its month, counts toward the total and saves only to the private record', async () => {
    await A.page.locator('#addBtn').click();
    await A.page.fill('#bName', 'Electric'); await A.page.fill('#bAmt', '120'); await A.page.fill('#bStart', '2026-11-25');
    await A.page.fill('#bNote', 'acct 1234 5678 9012 3456');
    await A.page.locator('#bSave').click();
    eq(await total(A.page), '$120.00');
    eq(await A.page.locator('.row').count(), 1);
    const s = state(); eq(s.bills.length, 1); eq(s.bills[0].name, 'Electric');
    assert.ok(!/1234/.test(s.bills[0].note), 'long digit runs are dropped from notes: ' + s.bills[0].note);
    const ls = await A.page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    assert.ok(!/Electric/.test(ls), 'nothing about the bills is kept on the phone: ' + ls);
  });
  await test('import link: the list leaves the address bar at once, then adds after a yes', async () => {
    await A.page.goto(toLink(srv.url, SAMPLE));
    eq(await A.page.evaluate(() => location.hash), '');
    await A.page.waitForSelector('#importOffer:not(.hidden)');
    assert.ok(/Add 3 bills/.test(await A.page.locator('#importText').textContent()));
    await A.page.locator('#importYes').click();
    eq(state().bills.length, 4);
    // next 30 days (Nov 14 to Dec 14): Streaming Nov 20, Electric Nov 25, Rent Dec 1, Card A Dec 2
    eq(await total(A.page), '$1,672.50');
    eq(await A.page.locator('.row').count(), 4);
    assert.ok(/~\$40\.00/.test(await A.page.locator('#listHost').textContent()), 'estimates show with ~');
    assert.ok(/3 left/.test(await A.page.locator('#listHost').textContent()), 'installments count down');
    assert.ok(/at their minimum/.test(await A.page.locator('#totSub').textContent()));
  });
  await test('importing the same list again updates bills by name instead of doubling them', async () => {
    await A.page.goto(toLink(srv.url, [{ name: 'rent', amount: 1550, every: 1, start: '2026-12-01' }]));
    await A.page.waitForSelector('#importOffer:not(.hidden)'); await A.page.locator('#importYes').click();
    eq(state().bills.length, 4); eq(await total(A.page), '$1,722.50');
  });
  await test('paid marks: ticking a bill takes it out of the total and into Paid already', async () => {
    await A.page.locator('.row:has-text("Streaming") .chk').click();
    eq(await total(A.page), '$1,710.00');
    eq(await A.page.locator('#stPaid').textContent(), '$13');
    eq(Object.keys(state().paid).length, 1);
    await A.page.locator('.row:has-text("Streaming") .chk').click();
    eq(await total(A.page), '$1,722.50');
  });
  await test('one month\'s amount can differ from the usual one', async () => {
    await A.page.locator('.row:has-text("Card A") .mid').click();
    await A.page.fill('#oAmt', '55'); await A.page.locator('#oSave').click();
    eq(await total(A.page), '$1,737.50');
    assert.ok(!/~\$55/.test(await A.page.locator('#listHost').textContent()), 'a set amount is no longer an estimate');
  });
  await test('settings: cards can count at their full statement balance', async () => {
    await A.page.locator('#setBtn').click(); await A.page.locator('#sFull').check(); await A.page.mouse.click(10, 10);
    eq(await total(A.page), '$1,737.50', 'the amount set for this month still wins');
    await A.page.locator('.row:has-text("Card A") .mid').click(); await A.page.fill('#oAmt', '40'); await A.page.locator('#oSave').click();
    eq(await total(A.page), '$2,082.50', 'otherwise the full balance counts');
    await A.page.locator('#setBtn').click(); await A.page.locator('#sFull').uncheck(); await A.page.mouse.click(10, 10);
    eq(await total(A.page), '$1,722.50');
  });
  await test('month tabs: next month lists only December', async () => {
    await A.page.locator('.tab[data-r=next]').click();
    assert.ok(/Dec 2026/.test(await A.page.locator('#totLbl').textContent()));
    eq(await A.page.locator('.row').count(), 4, 'Electric, Rent, Card A and Streaming in December');
    await A.page.locator('.tab[data-r=next30]').click();
  });
  await test('past due: an unpaid bill from earlier this month stays on top and in the total', async () => {
    await A.page.locator('#addBtn').click();
    await A.page.fill('#bName', 'Water'); await A.page.fill('#bAmt', '60'); await A.page.fill('#bStart', '2026-11-10');
    await A.page.selectOption('#bEvery', '0');   // one time, so its Dec 10 repeat doesn't also land in the next 30 days
    await A.page.locator('#bSave').click();
    eq(await A.page.locator('.group').first().textContent(), 'Past due');
    eq(await total(A.page), '$1,782.50');
    await A.page.locator('.row:has-text("Water") .mid').click(); await A.page.locator('#oEdit').click();
    A.page.once('dialog', d => d.accept()); await A.page.locator('#bDel').click();
    eq(await total(A.page), '$1,722.50'); eq(state().bills.length, 4);
  });

  await test('fingerprint lock: turned on from the banner; afterwards nothing loads until the fingerprint passes', async () => {
    const cdp = await A.ctx.newCDPSession(A.page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await A.page.reload(); await A.page.waitForSelector('#lockOffer:not(.hidden)');
    await A.page.locator('#lockOfferOn').click();
    await A.page.waitForFunction(() => !!localStorage.getItem('bills.lock'));
    // A wrong finger: the app stays locked and loads nothing.
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    const before = subscribes;
    await A.page.reload();
    await A.page.waitForFunction(() => /didn’t unlock/.test(document.querySelector('#lockMsg').textContent));
    assert.ok(await A.page.evaluate(() => document.documentElement.classList.contains('locked')));
    eq(subscribes, before, 'no bills fetched while locked');
    eq(await A.page.locator('.row').count(), 0);
    // The right finger opens it.
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await A.page.locator('#lockGo').click();
    await A.page.waitForSelector('.row');
    eq(await total(A.page), '$1,722.50');
    // Turning the lock off needs the fingerprint too.
    await A.page.locator('#setBtn').click(); await A.page.locator('#lockOff').click();
    await A.page.waitForFunction(() => !localStorage.getItem('bills.lock'));
    await A.page.mouse.click(10, 10);
    await cdp.send('WebAuthn.disable');
  });
  await test('lock fallback: a fresh Google sign-in with the password opens it and turns the lock off', async () => {
    await A.page.evaluate(() => { localStorage.setItem('bills.lock', 'AAAA'); });
    await A.page.reload(); await A.page.waitForSelector('#lockGate');
    await A.page.locator('#lockGoogle').click();
    await A.page.waitForSelector('.row');
    eq(await A.page.evaluate(() => window.__lastPrompt), 'login');
    eq(await A.page.evaluate(() => localStorage.getItem('bills.lock')), null);
  });
  await test('sign out clears the bills from the screen', async () => {
    await A.page.locator('#setBtn').click(); await A.page.locator('#sOut').click();
    await A.page.waitForSelector('#signGate:not(.hidden)');
    eq(await A.page.locator('.row').count(), 0); eq(await total(A.page), '—');
  });
  await test('another Google account is turned away by the database and signed out', async () => {
    deny = true;
    await A.page.locator('#signBtn').click();
    await A.page.waitForSelector('#signGate:not(.hidden)');
    eq(await A.page.locator('.row').count(), 0);
    deny = false;
    eq(A.errors.length, 0, A.errors.join('|'));
  });
  await test('small phone: the list and the add button fit at 320 px', async () => {
    const B = await mkPhone(); await B.page.setViewportSize({ width: 320, height: 640 });
    await B.page.goto(srv.url); await signIn(B.page); await B.page.waitForSelector('.row');
    const w = await B.page.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 320, 'no sideways scroll: ' + w);
    eq(B.errors.length, 0, B.errors.join('|'));
    await B.ctx.close();
  });
  await test('offline: the service worker keeps the app itself, never the bills', async () => {
    const o = await newPage(br, { sw: true }); const { page, ctx } = o;
    await ctx.route(/gstatic\.com\/firebasejs/, r => r.abort());
    await page.goto(srv.url); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('#signGate:not(.hidden)');
    assert.ok(/offline/i.test(await page.locator('#signMsg').textContent()));
    const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
    assert.ok(cached.every(u => !/firestore|googleapis/.test(u)), cached.join(' '));
    await ctx.close();
  });

  await br.close(); srv.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' failed' : 'all passed: ' + results.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
