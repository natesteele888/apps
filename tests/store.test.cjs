// App Store owner view: the footer logo tapped 7 times starts a Google sign-in (Firebase stubbed), and only an
// account the Toolbox rules let read profile/me gets the Mine tab: every app in the catalog plus the Dugout
// phone and watch downloads. Visitors load no Firebase at all. Placeholder account only.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { launch, startServer, newPage, SHOTS, ROOT } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'registry.json'), 'utf8'));
const EXPECT = REG.apps.filter(a => !a.retired && !a.redirectsTo && a.live && a.id !== 'store');
// A stand-in for the Firebase compat SDK: sign-in picks a test account, and profile/me is readable only when __owner is set.
const STUB = `(()=>{const L=localStorage;let user=L.getItem('stub.user')?{uid:'u1',displayName:'Test Owner'}:null;const subs=[];
const a={get currentUser(){return user},signInWithPopup:async()=>{user={uid:'u1',displayName:'Test Owner'};L.setItem('stub.user','1');subs.forEach(f=>f(user));return{user}},
 signInWithRedirect:async()=>{},getRedirectResult:async()=>null,signOut:async()=>{user=null;L.removeItem('stub.user');subs.forEach(f=>f(null))},
 onAuthStateChanged:f=>{subs.push(f);setTimeout(()=>f(user),0);return()=>{}}};
const auth=()=>a;auth.GoogleAuthProvider=function(){this.setCustomParameters=()=>{}};
window.__fbLoads=(window.__fbLoads||0)+1;
window.firebase={apps:[],initializeApp(){this.apps.push({})},auth,firestore:()=>({doc:p=>({get:async()=>{window.__reads=(window.__reads||[]).concat(p);
 if(L.getItem('stub.owner')==='1')return{exists:true};const e=new Error('denied');e.code='permission-denied';throw e}})})}})();`;

async function open(br, srv, { owner = false, store = {}, hash = '' } = {}) {
  const { ctx, page, errors } = await newPage(br);
  const gstatic = [];
  await page.route(/www\.gstatic\.com\/firebasejs/, r => { gstatic.push(r.request().url()); r.fulfill({ contentType: 'text/javascript', body: /app-compat/.test(r.request().url()) ? STUB : '' }); });
  await page.route(/api\.github\.com/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'dugout-v137', name: 'Dugout 137' }) }));
  await page.addInitScript(([o, st]) => { if (o) localStorage.setItem('stub.owner', '1'); for (const k in st) localStorage.setItem(k, st[k]); }, [owner, store]);
  await page.goto(srv.url + 'index.html' + hash);
  await page.waitForSelector('[data-owner-tap]');
  return { ctx, page, errors, gstatic };
}
const tabs = page => page.$$eval('#tabs [data-tab]', b => b.map(x => x.dataset.tab));
async function tap(page, n) { for (let i = 0; i < n; i++) await page.click('[data-owner-tap]'); }

(async () => {
  const srv = await startServer('store');
  const br = await launch();
  try {
    await test('a visitor sees the footer logo, no Mine tab, and no Firebase loads', async () => {
      const { ctx, page, errors, gstatic } = await open(br, srv);
      assert.ok(!(await tabs(page)).includes('mine'));
      await page.goto(srv.url + 'index.html#apps'); await page.waitForSelector('#main .row');
      const pub = [...new Set(await page.$$eval('#main .row b', b => b.map(x => x.textContent)))].sort();
      assert.deepStrictEqual(pub, REG.apps.filter(a => a.store === true).map(a => a.name).sort(), 'public store lists only the turned-on apps');
      assert.strictEqual(pub.length, 4);
      await tap(page, 6); await page.waitForTimeout(300);
      assert.strictEqual(gstatic.length, 0, 'six taps load nothing');
      assert.ok(!(await tabs(page)).includes('mine'));
      assert.deepStrictEqual(errors, []); await ctx.close();
    });
    await test('7 taps as the owner unlock Mine with every app and the downloads', async () => {
      const { ctx, page, errors } = await open(br, srv, { owner: true });
      await tap(page, 7);
      await page.waitForFunction(() => location.hash === '#mine');
      assert.ok((await tabs(page)).includes('mine'));
      await page.waitForFunction(() => /Version 137/.test(document.body.innerText));
      const names = await page.$$eval('#main .mrow b', b => b.map(x => x.textContent));
      for (const a of EXPECT) assert.ok(names.includes(a.name), 'missing ' + a.name);
      for (const n of ['Steele Usage', 'Snack Shack', 'Meeting Secretary', 'Catch Log', 'Gameday Picks', 'Read 20', 'Fairway', 'Dugout for your phone', 'Dugout for the watch', 'Steele Family watch'])
        assert.ok(names.some(x => x.includes(n.split(' ')[0])) , 'missing ' + n);
      const apks = await page.$$eval('#main a[href$=".apk"]', a => a.map(x => x.href));
      assert.deepStrictEqual(apks, ['dugout-phone', 'dugout-watch', 'steele-family-watch'].map(f => `https://github.com/natesteele888/apps/releases/latest/download/${f}.apk`));
      const opens = await page.$$eval('#main .mrow a[href^="https://natesteele888"], #main .mrow a[href*="web.app"]', a => a.length);
      assert.strictEqual(opens, EXPECT.length, 'one OPEN link per app');
      assert.deepStrictEqual(await page.evaluate(() => window.__reads), ['profile/me']);
      await page.screenshot({ path: SHOTS + '/store-mine.png' });
      // reload keeps the owner view
      await page.reload(); await page.waitForFunction(() => /Version 137/.test(document.body.innerText));
      assert.ok((await tabs(page)).includes('mine'));
      // sign out takes it away
      await page.click('[data-owner-out]');
      await page.waitForFunction(() => !document.querySelector('#tabs [data-tab="mine"]'));
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('store.owner')), '');
      assert.deepStrictEqual(errors, []); await ctx.close();
    });
    await test('anyone else who signs in is turned away by the rules', async () => {
      const { ctx, page, errors } = await open(br, srv);
      await tap(page, 7);
      await page.waitForFunction(() => /just for the owner/.test(document.getElementById('toast').textContent));
      assert.ok(!(await tabs(page)).includes('mine'));
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('stub.user')), null, 'signed back out');
      assert.notStrictEqual(await page.evaluate(() => location.hash), '#mine');
      assert.deepStrictEqual(errors, []); await ctx.close();
    });
    await test('a leftover owner flag is dropped when the rules say no', async () => {
      const { ctx, page, errors } = await open(br, srv, { store: { 'store.owner': '1', 'stub.user': '1' }, hash: '#mine' });
      await page.waitForFunction(() => !document.querySelector('#tabs [data-tab="mine"]'));
      assert.ok(!/Phone and watch downloads/.test(await page.evaluate(() => document.body.innerText)));
      assert.deepStrictEqual(errors, []); await ctx.close();
    });
    await test('taps spread out over more than 4 seconds do nothing', async () => {
      const { ctx, page, gstatic } = await open(br, srv, { owner: true });
      await tap(page, 4); await page.waitForTimeout(4200); await tap(page, 3); await page.waitForTimeout(300);
      assert.strictEqual(gstatic.length, 0); await ctx.close();
    });
  } finally { await br.close(); srv.stop(); }
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? failed + ' failed' : 'all passed (' + results.length + ')');
  process.exit(failed ? 1 : 0);
})();
