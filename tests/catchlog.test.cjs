// Catch Log tests: the sign-in gate, starting and joining a crew by link, adding anglers, logging a trip with a photo,
// trophies, editing and removing a catch, tackle combos, spots, and a second phone seeing the same crew.
// Firebase is stubbed (the real scripts live on gstatic) with one shared document store, transactions and photo sub-documents.
// Leaflet comes from unpkg; the test serves it from LEAFLET (a folder holding leaflet.js) when set, otherwise it is blocked
// and the map must fail gracefully. Placeholder anglers only.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { launch, startServer, newPage } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));

// A tiny Firestore stand-in: doc refs with get/set/delete/onSnapshot, sub-collections and runTransaction.
const FAKE_FB = `(function(){ if (window.firebase) return; var L = [], user = null, subs = {}; try { user = JSON.parse(localStorage.getItem('fakeUser')); } catch (e) {}
  function snap(d) { return { exists: d != null, data: function () { return d; } }; }
  function denied() { var e = new Error('denied'); e.code = 'permission-denied'; return e; }
  function Ref(path) { this.path = path; }
  Ref.prototype.collection = function (c) { var base = this.path; return { doc: function (id) { return new Ref(base + '/' + c + '/' + id); } }; };
  Ref.prototype.get = async function () { var d = await window.__fsGet(this.path); if (d && d.__deny) throw denied(); return snap(d); };
  Ref.prototype.set = async function (d) { var r = await window.__fsSet(this.path, d); if (r === 'deny') throw denied(); window.__fsNotify(this.path); };
  Ref.prototype.delete = async function () { await window.__fsDel(this.path); };
  Ref.prototype.onSnapshot = function (cb, err) { var p = this.path; (subs[p] = subs[p] || []).push(cb);
    window.__fsGet(p).then(function (d) { if (d && d.__deny) { err(denied()); return; } cb(snap(d)); });
    return function () { subs[p] = (subs[p] || []).filter(function (f) { return f !== cb; }); }; };
  window.__fsPush = function (p, d) { (subs[p] || []).forEach(function (f) { f(snap(d)); }); };
  var auth = { get currentUser() { return user; }, getRedirectResult: function () { return Promise.resolve(null); },
    onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(user); }, 0); },
    signInWithPopup: async function (p) { window.__lastPrompt = p.prompt; user = { uid: window.__uid || 'u1', email: 'angler@example.com', displayName: 'Test Angler' }; localStorage.setItem('fakeUser', JSON.stringify(user)); L.forEach(function (f) { f(user); }); return { user: user }; },
    signOut: async function () { user = null; localStorage.removeItem('fakeUser'); L.forEach(function (f) { f(null); }); } };
  var db = { collection: function (c) { return { doc: function (id) { return new Ref(c + '/' + id); } }; },
    runTransaction: async function (fn) { var writes = []; var t = { get: function (r) { return r.get(); }, set: function (r, d) { writes.push([r, d]); } };
      var out = await fn(t); for (var i = 0; i < writes.length; i++) await writes[i][0].set(writes[i][1]); return out; } };
  window.firebase = { apps: [], initializeApp: function () { this.apps.push(1); },
    auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: function () { var s = this; this.setCustomParameters = function (o) { s.prompt = o.prompt; }; } }),
    firestore: function () { return db; } }; })();`;

// A small PNG for the photo inputs (the app turns it into a JPEG).
const PHOTO = path.join(require('os').tmpdir(), 'catchlog-test-photo.png');
fs.writeFileSync(PHOTO, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGPUqLBhIAUwkaR6VMOohiGlAQDUIgD8UJ9wngAAAABJRU5ErkJggg==', 'base64'));

(async () => {
  const srv = await startServer('catchlog');
  const br = await launch();
  const cloud = new Map(); let deny = false;
  const pages = [];
  const leaflet = process.env.LEAFLET && fs.existsSync(path.join(process.env.LEAFLET, 'leaflet.js')) ? process.env.LEAFLET : null;
  const mkPhone = async () => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
      geolocation: { latitude: 42.55, longitude: -71.75 }, permissions: ['geolocation'] });
    await ctx.exposeFunction('__fsGet', async p => deny ? { __deny: true } : (cloud.has(p) ? JSON.parse(JSON.stringify(cloud.get(p))) : null));
    await ctx.exposeFunction('__fsSet', async (p, d) => { if (deny) return 'deny'; cloud.set(p, JSON.parse(JSON.stringify(d))); return 'ok'; });
    await ctx.exposeFunction('__fsDel', async p => { cloud.delete(p); });
    // A write reaches every phone listening to that document, like Firestore's live updates.
    await ctx.exposeFunction('__fsNotify', async p => { const d = cloud.get(p); for (const pg of pages) { try { await pg.evaluate(([p, d]) => window.__fsPush && window.__fsPush(p, d), [p, d]); } catch (e) {} } });
    await ctx.route(/gstatic\.com\/firebasejs/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }));
    await ctx.route(/unpkg\.com\/leaflet/, r => {
      if (!leaflet) return r.abort();
      const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
      return r.fulfill({ contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(leaflet, f)) });
    });
    await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
    const o = await newPage(br, { context: ctx });
    o.page.on('dialog', d => d.accept());
    pages.push(o.page);
    return o;
  };
  const crewDoc = () => { const k = [...cloud.keys()].find(k => /^cl_crews\/[^/]+$/.test(k)); return k ? { key: k, d: JSON.parse(cloud.get(k).data) } : null; };
  const text = page => page.locator('#root').innerText();
  const click = (page, label) => page.locator('button', { hasText: label }).first().click();

  const A = await mkPhone();
  await test('signed out: the Google sign-in gate shows, with no console errors', async () => {
    await A.page.goto(srv.url);
    await A.page.waitForSelector('text=Sign in with Google');
    assert.ok(/crew link/.test(await text(A.page)));
    eq(cloud.size, 0);
    eq(A.errors.length, 0, A.errors.join(' | '));
  });
  await test('manifest and icons are wired to the shared icon folder', async () => {
    const m = await (await fetch(srv.url + 'manifest.json')).json();
    eq(m.name, 'Catch Log');
    assert.ok(m.icons.every(i => i.src.startsWith('/apps/icons/catchlog-')), JSON.stringify(m.icons));
    for (const s of ['192', '512', 'maskable']) assert.ok(fs.existsSync(path.join(__dirname, '..', 'apps', 'icons', 'catchlog-' + s + '.png')), s);
  });
  await test('sign in: asks which Google account, then offers to join or start a crew', async () => {
    await click(A.page, 'Sign in with Google');
    await A.page.waitForSelector('text=Join your crew');
    eq(await A.page.evaluate(() => window.__lastPrompt), 'select_account');
  });
  await test('a pasted link that is not a crew link is refused', async () => {
    await A.page.fill('#crewPaste', 'https://example.com/nope');
    await click(A.page, 'Join crew');
    await A.page.waitForSelector('text=doesn’t look like a crew link');
  });
  await test('start a new crew: one document with a long random code, then the first angler is asked for', async () => {
    await click(A.page, 'Start a new crew');
    await A.page.waitForSelector('#npFirst');
    const c = crewDoc(); assert.ok(c, 'crew saved');
    assert.ok(/^cl_crews\/[a-z0-9]{20,40}$/.test(c.key), c.key);
    eq(c.d.profiles.length, 0);
  });
  await test('add an angler: needs a name and initial, then lands on home as that angler', async () => {
    await click(A.page, 'CREATE PROFILE');
    await A.page.waitForSelector('text=Add a first name');
    await A.page.fill('#npFirst', 'Alex'); await A.page.fill('#npLast', 'q'); await A.page.fill('#npHome', 'Lakeside');
    await click(A.page, 'CREATE PROFILE');
    await A.page.waitForSelector('text=LOG A CATCH');
    assert.ok(/Alex Q\./.test(await text(A.page)));
    eq(crewDoc().d.profiles.length, 1); eq(crewDoc().d.profiles[0].lastInitial, 'Q');
  });
  await test('tacklebox: a rod and reel combo saves for this angler', async () => {
    await click(A.page, 'TACKLEBOX');
    await A.page.waitForSelector('text=TACKLEBOX');
    const t = await text(A.page);
    assert.ok(/combo/i.test(t), 'combo section shows: ' + t.slice(0, 300));
  });
  await test('log a trip: a new spot, two catches (one with a photo), then Done saves one trip', async () => {
    await A.page.evaluate(() => goHome());
    await click(A.page, 'LOG A CATCH');
    await A.page.waitForSelector('#speciesInput');
    assert.ok(await A.page.locator('#saveCatchBtn').isDisabled(), 'needs a spot and species first');
    await A.page.fill('#newSpotNameInput', 'Test Pond');
    // A GPS pin, so the Spots tab has something to put on its map.
    await click(A.page, 'Use My Location'); await A.page.waitForSelector('text=Location Pinned');
    await click(A.page, 'Use This Spot');
    await A.page.fill('#speciesInput', 'Largemouth Bass'); await A.page.fill('#weightInput', '3.5');
    await A.page.setInputFiles('#catchPhotoInput', PHOTO);
    await A.page.waitForSelector('text=Photo Added');
    await click(A.page, 'Save Catch');
    await A.page.waitForSelector('text=Nice Largemouth Bass!');
    await click(A.page, 'Log Another');
    await A.page.fill('#speciesInput', 'Bluegill'); await A.page.fill('#lengthInput', '7');
    await click(A.page, 'Save Catch');
    await A.page.waitForSelector('text=This Trip (2)');
    await click(A.page, 'Done Fishing');
    await A.page.waitForSelector('text=Trip saved');
    const d = crewDoc().d;
    eq(d.sessions.length, 1); eq(d.sessions[0].catches.length, 2); eq(d.sessions[0].spotName, 'Test Pond');
    eq(d.spots.length, 1, 'the new spot is saved for the crew');
    const pid = d.sessions[0].catches[0].photo;
    assert.ok(/^ph_/.test(pid), 'the photo is stored as its own document, not inside the log: ' + String(pid).slice(0, 30));
    assert.ok(cloud.has(crewDoc().key + '/photos/' + pid), 'photo document exists');
    assert.ok(!/data:image/.test(cloud.get(crewDoc().key).data), 'no picture data in the crew log');
    eq(await A.page.evaluate(() => localStorage.getItem('cl_draft_' + Cloud.crew)), null, 'the finished trip leaves no draft on the phone');
  });
  await test('trophies: today and all-time list the biggest catches', async () => {
    await click(A.page, 'TROPHIES');
    await A.page.waitForSelector('text=All-Time');
    assert.ok(/Largemouth Bass/.test(await text(A.page)));
    await click(A.page, 'By Spot');
    assert.ok(/Test Pond/.test(await text(A.page)));
  });
  await test('my catches: fix a catch, then remove the one with a photo (its photo document goes too)', async () => {
    await A.page.evaluate(() => goHome());
    await click(A.page, 'MY CATCHES');
    await A.page.locator('.rank-row', { hasText: 'Bluegill' }).click();
    await A.page.fill('#edSpecies', 'Bluegill Sunfish'); await A.page.fill('#edLength', '8');
    await click(A.page, 'Save');
    await A.page.waitForSelector('text=Bluegill Sunfish');
    const fixed = crewDoc().d.sessions[0].catches.find(c => c.species === 'Bluegill Sunfish');
    assert.ok(fixed && fixed.length === 8, 'edit saved');
    const pid = crewDoc().d.sessions[0].catches.find(c => c.species === 'Largemouth Bass').photo;
    await A.page.locator('.rank-row', { hasText: 'Largemouth Bass' }).click();
    await click(A.page, 'Remove this catch');
    await A.page.waitForSelector('text=Catch removed');
    eq(crewDoc().d.sessions[0].catches.length, 1);
    await A.page.waitForTimeout(200);
    assert.ok(!cloud.has(crewDoc().key + '/photos/' + pid), 'photo document removed');
  });
  await test('spots: the spot is listed, and the map ' + (leaflet ? 'draws' : 'fails gracefully when it can’t load'), async () => {
    await A.page.evaluate(() => goHome());
    await click(A.page, 'SPOTS');
    await A.page.waitForSelector('#spotsMap');
    assert.ok(/Test Pond/.test(await text(A.page)));
    if (leaflet) await A.page.waitForSelector('#spotsMap.leaflet-container');
    else await A.page.waitForSelector('text=Map couldn’t load');
  });
  await test('a second phone joins by the crew link, picks an angler and sees the same log', async () => {
    const link = await A.page.evaluate(() => crewLink());
    assert.ok(/#crew=[a-z0-9]{20,}$/.test(link), link);
    const B = await mkPhone();
    await B.page.addInitScript(() => { window.__uid = 'u2'; });
    await B.page.goto(link.replace(/^https?:\/\/[^/]+/, srv.url.replace(/\/apps\/catchlog\/$/, '')));
    await click(B.page, 'Sign in with Google');
    await B.page.waitForSelector('text=Tap your name');
    eq(await B.page.evaluate(() => location.hash), '', 'the code leaves the address bar');
    await click(B.page, 'Alex Q.');
    await B.page.waitForSelector('text=LOG A CATCH');
    await click(B.page, 'TROPHIES'); await click(B.page, 'All-Time');
    assert.ok(/Bluegill Sunfish/.test(await text(B.page)));
    eq(B.errors.length, 0, B.errors.join(' | '));
  });
  await test('a crew the account can’t open shows the can’t-open screen', async () => {
    deny = true;
    const C = await mkPhone();
    await C.page.goto(srv.url + '#crew=abcdefghjkmnpqrstuv2345k9x');
    await click(C.page, 'Sign in with Google');
    await C.page.waitForSelector('text=Can’t open this crew');
    deny = false;
  });
  await test('every screen fits one phone screen: no page scroll, main action visible (360x740 and 412x800)', async () => {
    // A long crew list, so the crew screen has to keep the list scrolling inside itself.
    await A.page.evaluate(() => mutate(d => { for (let i = 1; i <= 12; i++) d.profiles.push({ id: 'p_t' + i, firstName: 'Angler' + i, lastInitial: 'T', age: null, hometown: '', avatar: '🐟', photo: null }); }));
    const screens = [
      ['home', "goHome()", 'button.catch-cta'],
      ['crew', "setTab('crew')", '.screen-footer button'],
      ['add angler', "startCreate()", '.screen-footer button'],
      ['catch form', "cancelCreate(); goHome(); startCatch()", '#saveCatchBtn'],
      ['trophies', "setTab('trophies')", '.chip'],
      ['my catches', "setTab('history')", '.screen-header'],
      ['spots', "setTab('spots')", '.screen-footer button'],
      ['add spot', "setTab('spots'); toggleAddLocation()", '.screen-footer .btn-primary'],
      ['tacklebox', "setTab('gear')", '.screen-footer button'],
      ['settings', "setTab('settings')", '.settings-row'],
    ];
    for (const [w, h] of [[360, 740], [412, 800]]) {
      await A.page.setViewportSize({ width: w, height: h });
      for (const [name, js, sel] of screens) {
        await A.page.evaluate(js); await A.page.waitForTimeout(80);
        const r = await A.page.evaluate(sel => {
          const el = document.querySelector(sel); const b = el && el.getBoundingClientRect();
          return { page: document.scrollingElement.scrollHeight, inner: innerHeight, found: !!el, top: b && b.top, bottom: b && b.bottom };
        }, sel);
        assert.ok(r.page <= r.inner + 1, `${name} at ${w}x${h}: page scrolls (${r.page} > ${r.inner})`);
        assert.ok(r.found && r.top >= 0 && r.bottom <= r.inner + 1, `${name} at ${w}x${h}: main action off screen ${JSON.stringify(r)}`);
      }
      await A.page.evaluate("setTab('crew')");
      const inner = await A.page.evaluate(() => { const b = document.querySelector('.screen-body'); return b.scrollHeight > b.clientHeight; });
      assert.ok(inner, `crew at ${w}x${h}: the long list scrolls inside its own area`);
    }
    await A.page.evaluate("cancelCatch()");
    await A.page.setViewportSize({ width: 390, height: 844 });
  });
  await test('no console errors on the first phone through the whole run', async () => {
    eq(A.errors.length, 0, A.errors.join(' | '));
  });

  await br.close(); srv.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? `${failed} FAILED of ${results.length}` : `ALL ${results.length} PASSED`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
