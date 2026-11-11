// health.js tests: the shared health check and problem report every app loads, driven on Photo Blueprint's page.
// install.js is blocked (lib.cjs); health.js is served from this repo in place of the github.io copy.
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
const healthJs = fs.readFileSync(path.join(__dirname, '..', 'apps', 'health.js'), 'utf8');
const APPS = ['situations', 'picks', 'toolbox', 'eightcount', 'playboard', 'locker', 'practiceclock', 'read20', 'getready', 'whoswhere', 'tournamentpack', 'walkup', 'scoreboard', 'filmlite', 'photoblueprint', 'secretary'];

(async () => {
  await test('every app loads health.js next to install.js, and has a report button or call', () => {
    for (const a of APPS) {
      const html = fs.readFileSync(path.join(__dirname, '..', 'apps', a, 'index.html'), 'utf8');
      assert.ok(html.includes('natesteele888.github.io/apps/health.js" defer'), a + ' loads health.js');
      const files = fs.readdirSync(path.join(__dirname, '..', 'apps', a)).filter(f => /\.(js|html)$/.test(f)).map(f => fs.readFileSync(path.join(__dirname, '..', 'apps', a, f), 'utf8')).join('\n');
      assert.ok(/nateHealth\.report\(\)/.test(files), a + ' has a Something wrong? button');
    }
  });

  const server = await startServer('photoblueprint');
  const browser = await launch();
  const SHARE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  async function open(init, ctxOpts) {
    const { ctx, page, errors } = await newPage(browser, { ctx: { userAgent: SHARE_UA, ...(ctxOpts || {}) } });
    await page.unroute(/natesteele888\.github\.io\/apps\/(install|health)\.js/);
    await page.route(/natesteele888\.github\.io\/apps\/install\.js/, r => r.abort());
    await page.route(/natesteele888\.github\.io\/apps\/health\.js/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: healthJs }));
    await page.route(/tile\.openstreetmap|www\.gstatic|fonts\./, r => r.abort());
    if (init) await page.addInitScript(init);
    return { ctx, page, errors };
  }
  const shadowText = page => page.evaluate(() => { const h = Array.from(document.body.children).find(e => e.shadowRoot && (e.shadowRoot.querySelector('.bar') || e.shadowRoot.querySelector('.sheet'))); return h ? h.shadowRoot.textContent : ''; });

  await test('on a healthy phone: saving checks out, the report names the app and phone, nothing is shown', async () => {
    const { ctx, page, errors } = await open();
    await page.goto(server.url); await page.waitForFunction(() => window.nateHealth);
    const st = await page.evaluate(() => window.nateHealth.status); eq(st.save, true); eq(st.installed, false);
    const t = await page.evaluate(() => window.nateHealth.text('')); 
    assert.ok(t.startsWith('Photo Blueprint · problem report'), t.split('\n')[0]);
    assert.ok(t.includes('Phone: Android · Chrome') && t.includes('Saving: OK') && t.includes('Installed on home screen: no') && t.includes('Recent problems: none logged'), t);
    eq(await shadowText(page), '', 'no bar when all is well');
    eq(errors.length, 0, errors.join(' | ')); await ctx.close();
  });
  await test('crashes and failed promises are logged on the phone, folded when repeated, and survive a reload', async () => {
    const { ctx, page } = await open();
    await page.goto(server.url); await page.waitForFunction(() => window.nateHealth);
    await page.evaluate(() => { setTimeout(() => { throw new Error('boom test'); }, 0); Promise.reject(new Error('nope test')); });
    await page.waitForFunction(() => window.nateHealth.log().length >= 2);
    let log = await page.evaluate(() => window.nateHealth.log());
    assert.ok(log.some(e => e.k === 'error' && /boom test/.test(e.m) && /app\.js|:\d+/.test(e.m) === false || /boom test/.test(e.m)), JSON.stringify(log));
    assert.ok(log.some(e => /Promise: nope test/.test(e.m)), JSON.stringify(log));
    await page.evaluate(() => { window.nateHealth.note('sync', 'cloud said no'); window.nateHealth.note('sync', 'cloud said no'); window.nateHealth.note('sync', 'cloud said no'); });
    log = await page.evaluate(() => window.nateHealth.log()); const s = log.find(e => e.k === 'sync'); eq(s.n, 3, 'three repeats folded into one line');
    await page.reload(); await page.waitForFunction(() => window.nateHealth);
    log = await page.evaluate(() => window.nateHealth.log()); assert.ok(log.length >= 3 && log.some(e => /boom test/.test(e.m)), 'kept across reloads');
    const t = await page.evaluate(() => window.nateHealth.text('it froze')); assert.ok(/Recent problems:/.test(t) && /sync: cloud said no \(x3\)/.test(t) && /What happened: it froze/.test(t), t);
    await page.evaluate(() => { for (let i = 0; i < 40; i++) window.nateHealth.note('error', 'e' + i); });
    eq((await page.evaluate(() => window.nateHealth.log())).length, 30, 'capped at 30');
    await ctx.close();
  });
  await test('when the phone cannot save, a bar says so and offers Report', async () => {
    const { ctx, page } = await open(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'nate.health.test') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); }; });
    await page.goto(server.url); await page.waitForFunction(() => window.nateHealth && window.nateHealth.status.save === false);
    await page.waitForFunction(() => Array.from(document.body.children).some(e => e.shadowRoot && e.shadowRoot.querySelector('.bar')));
    const t = await shadowText(page); assert.ok(/can't save right now/.test(t) && /Report/.test(t), t);
    assert.ok((await page.evaluate(() => window.nateHealth.text(''))).includes('Saving: FAILED'));
    await page.evaluate(() => { const h = Array.from(document.body.children).find(e => e.shadowRoot && e.shadowRoot.querySelector('.bar')); h.shadowRoot.querySelector('.go').click(); });
    await page.waitForFunction(() => Array.from(document.body.children).some(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')));
    assert.ok(/Something wrong\?/.test(await shadowText(page)), 'Report opens the sheet');
    await ctx.close();
  });
  await test('the report sheet: typed words go into the text, Send uses the share sheet, or copies when there is none', async () => {
    const { ctx, page } = await open(() => { window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
    await page.goto(server.url + '#me'); await page.waitForFunction(() => window.nateHealth); await page.waitForSelector('#report');
    await page.click('#report');
    await page.waitForFunction(() => Array.from(document.body.children).some(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')));
    await page.evaluate(() => { const h = Array.from(document.body.children).find(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')); const r = h.shadowRoot; r.querySelector('#w').value = 'the dance did not play'; r.querySelector('#s').click(); });
    await page.waitForFunction(() => window.__shared);
    const d = await page.evaluate(() => window.__shared); eq(d.title, 'Photo Blueprint problem report'); assert.ok(/What happened: the dance did not play/.test(d.text) && /Phone: Android/.test(d.text), d.text);
    await page.waitForFunction(() => !Array.from(document.body.children).some(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')), null, { timeout: 3000 });
    await ctx.close();
    const two = await open(() => { delete navigator.share; window.__copied = ''; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
    await two.page.goto(server.url); await two.page.waitForFunction(() => window.nateHealth);
    await two.page.evaluate(() => window.nateHealth.report());
    await two.page.waitForFunction(() => Array.from(document.body.children).some(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')));
    await two.page.evaluate(() => { const h = Array.from(document.body.children).find(e => e.shadowRoot && e.shadowRoot.querySelector('.sheet')); h.shadowRoot.querySelector('#s').click(); });
    await two.page.waitForFunction(() => window.__copied);
    assert.ok(/problem report/.test(await two.page.evaluate(() => window.__copied))); assert.ok(/Copied/.test(await shadowText(two.page)));
    await two.ctx.close();
  });
  await test('an app can note its own failed save and the report shows it; an installed app says so', async () => {
    const { ctx, page } = await open(() => { const mm = window.matchMedia; window.matchMedia = q => /standalone/.test(q) ? { matches: true } : mm.call(window, q); });
    await page.goto(server.url); await page.waitForFunction(() => window.nateHealth);
    await page.evaluate(() => window.nateHealth.note('save', 'Checklist could not be saved'));
    const t = await page.evaluate(() => window.nateHealth.text('')); assert.ok(/Installed on home screen: yes/.test(t) && /save: Checklist could not be saved/.test(t), t);
    await ctx.close();
  });

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) { console.log('  FAIL ' + results.filter(r => !r[1]).map(r => r[0]).join('\n  FAIL ')); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
