// Steele Usage tests: GitHub Actions minutes read from GitHub's billing usage report (api.github.com stubbed),
// the month math (Windows 2x, macOS 10x, repos, per day), the out-of-minutes countdown, errors, the older
// billing endpoint as a fallback, sample numbers, settings and forgetting the token. Placeholder repos only.
const assert = require('assert');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const NOW = Date.parse('2026-11-18T05:00:00Z');   // Nov 18, 12:00 AM in New York; resets Dec 1 00:00 UTC
const TOKEN = 'github_pat_TESTONLY1234';
const item = (day, repo, sku, q) => ({ date: '2026-11-' + String(day).padStart(2, '0') + 'T00:00:00Z', product: 'actions', sku, quantity: q, unitType: 'Minutes', pricePerUnit: 0.008, grossAmount: q * 0.008, discountAmount: q * 0.008, netAmount: 0, repositoryName: 'owner/' + repo });
const UNDER = { usageItems: [
  item(2, 'web-apps', 'actions_linux', 300), item(5, 'web-apps', 'actions_linux', 200), item(9, 'site', 'actions_windows', 100),
  item(12, 'reports', 'actions_linux', 50), item(18, 'web-apps', 'actions_linux', 20),
  { date: '2026-11-03T00:00:00Z', product: 'actions', sku: 'actions_storage', quantity: 5, unitType: 'GigabyteHours', netAmount: 0, repositoryName: 'owner/site' },
  { date: '2026-11-03T00:00:00Z', product: 'copilot', sku: 'copilot_premium_request', quantity: 9, unitType: 'Requests', netAmount: 0, repositoryName: '' },
  item(28, 'web-apps', 'actions_linux', 999) ] };   // Oct-shaped stray: day 28 is after "today" but inside Nov, still counted by GitHub's own date
const OVER = { usageItems: [item(3, 'brain', 'actions_linux', 1500), item(10, 'reports', 'actions_macos', 60)] };

async function open(br, srv, { token = TOKEN, routes = {}, width = 390, store = {} } = {}) {
  const { ctx, page, errors } = await newPage(br, { ctx: { viewport: { width, height: 844 }, timezoneId: 'America/New_York' } });
  const calls = [];
  await page.route(/api\.github\.com/, async r => {
    const u = new URL(r.request().url()); calls.push({ path: u.pathname + u.search, auth: r.request().headers()['authorization'] });
    const hit = Object.keys(routes).find(k => u.pathname.endsWith(k));
    const [status, body] = hit ? routes[hit] : [404, { message: 'Not Found' }];
    await r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.addInitScript(([t, tok, st]) => { window.__now = t; if (tok) localStorage.setItem('usage.token', tok); for (const k in st) localStorage.setItem(k, st[k]); }, [NOW, token, store]);
  await page.goto(srv.url);
  return { ctx, page, errors, calls };
}
const text = (page, id) => page.$eval('#' + id, e => e.textContent.trim());

(async () => {
  const srv = await startServer('usage');
  const br = await launch();

  await test('no token: setup with the token steps, sample numbers work, nothing sent to GitHub', async () => {
    const { ctx, page, errors, calls } = await open(br, srv, { token: '' });
    assert.ok(await page.isVisible('#setup'));
    assert.ok(/Plan/.test(await text(page, 'setup')) && /Read-only/.test(await text(page, 'setup')));
    eq(await page.inputValue('#setupUser'), 'natesteele888');
    await page.click('#setupDemo');
    await page.waitForSelector('#main:not(.hidden)');
    assert.ok(/Sample numbers/.test(await text(page, 'statusLeft')));
    eq(calls.length, 0, 'GitHub calls');
    await page.screenshot({ path: SHOTS + '/usage-demo.png', fullPage: true });
    eq(errors.length, 0, errors.join('\n')); await ctx.close();
  });

  await test('under the limit: minutes left, Windows counts 2x, only Actions minutes, repos sorted', async () => {
    const { ctx, page, errors, calls } = await open(br, srv, { routes: { '/settings/billing/usage': [200, UNDER] } });
    await page.waitForSelector('#main:not(.hidden)');
    // 300+200+100*2+50+20+999 = 1769 counted
    eq(await text(page, 'monthUsed'), '1,769 of 2,000');
    eq(await text(page, 'monthPct'), '88%');
    eq(await text(page, 'heroBig'), '231');
    assert.ok(/Actions minutes left/.test(await text(page, 'heroLbl')));
    assert.ok(/Resets .*Nov 30.*7 PM/.test(await text(page, 'heroFoot')), await text(page, 'heroFoot'));
    eq(await text(page, 'monthReset'), '12d 18h'); eq(await text(page, 'monthDate'), 'Nov 30');
    eq(await page.$$eval('#monthBar .seg.warn', s => s.length), 11);
    const repos = await page.$$eval('#repos .rn', e => e.map(x => x.textContent));
    eq(repos.join(','), 'web-apps,site,reports');
    assert.ok(/Windows 100 ×2/.test(await text(page, 'mfoot')), await text(page, 'mfoot'));
    eq(await text(page, 'todayUsed'), '20 of ~67 a day');
    const c = calls[0]; eq(c.path, '/users/natesteele888/settings/billing/usage?year=2026&month=11'); eq(c.auth, 'Bearer ' + TOKEN);
    await page.screenshot({ path: SHOTS + '/usage-under.png', fullPage: true });
    await page.click('.tabs button[data-view="day"]');
    assert.ok(await page.$$eval('#chart rect', r => r.length) >= 18, 'one bar per day so far');
    eq(errors.length, 0, errors.join('\n')); await ctx.close();
  });

  await test('out of minutes: big countdown to the reset, red, macOS counts 10x', async () => {
    const { ctx, page, errors } = await open(br, srv, { routes: { '/settings/billing/usage': [200, OVER] } });
    await page.waitForSelector('#main:not(.hidden)');
    eq(await text(page, 'heroLbl'), 'Until Actions minutes are back');
    eq(await text(page, 'heroBig'), '12d18h');
    assert.ok(await page.$eval('#heroBig', e => e.classList.contains('bad')));
    eq(await text(page, 'monthUsed'), '2,100 of 2,000');
    eq(await text(page, 'monthPct'), '105%');
    eq(await page.$$eval('#monthBar .seg.bad', s => s.length), 12);
    assert.ok(/Public repos still run free/.test(await text(page, 'heroTip')));
    const tri = await page.$eval('#monthBar .tri', e => parseFloat(e.style.left));
    assert.ok(tri > 55 && tri < 58, 'marker at 17 of 30 days: ' + tri);
    await page.screenshot({ path: SHOTS + '/usage-over.png', fullPage: true });
    eq(errors.length, 0, errors.join('\n')); await ctx.close();
  });

  await test('a token without Plan access gets a plain fix, and the older billing endpoint is used when the new one is missing', async () => {
    let o = await open(br, srv, { routes: { '/settings/billing/usage': [403, { message: 'Resource not accessible by personal access token' }] } });
    await o.page.waitForSelector('#errBox:not(.hidden)');
    assert.ok(/Plan: Read-only/.test(await text(o.page, 'errBox')));
    assert.ok(await o.page.isVisible('#setup'), 'no numbers yet, so setup stays');
    await o.ctx.close();
    o = await open(br, srv, { routes: { '/settings/billing/actions': [200, { total_minutes_used: 1234, total_paid_minutes_used: 0, included_minutes: 2000, minutes_used_breakdown: { UBUNTU: 1234 } }] } });
    await o.page.waitForSelector('#main:not(.hidden)');
    eq(await text(o.page, 'monthUsed'), '1,234 of 2,000');
    assert.ok(/only sent a month total/.test(await text(o.page, 'repos')));
    eq(o.errors.length, 0, o.errors.join('\n')); await o.ctx.close();
  });

  await test('last numbers stay up when GitHub is unreachable, with a note', async () => {
    const o = await open(br, srv, { routes: { '/settings/billing/usage': [200, UNDER] } });
    await o.page.waitForSelector('#main:not(.hidden)');
    await o.page.unroute(/api\.github\.com/); await o.page.route(/api\.github\.com/, r => r.abort());
    await o.page.click('#refreshBtn');
    await o.page.waitForSelector('#errBox:not(.hidden)');
    assert.ok(/Couldn’t reach GitHub/.test(await text(o.page, 'errBox')));
    eq(await text(o.page, 'monthUsed'), '1,769 of 2,000');
    await o.ctx.close();
  });

  await test('settings: plan size changes the math, Forget removes the token and the numbers', async () => {
    const o = await open(br, srv, { routes: { '/settings/billing/usage': [200, UNDER] } });
    await o.page.waitForSelector('#main:not(.hidden)');
    await o.page.click('#settingsBtn');
    assert.ok(/ends …1234/.test(await o.page.textContent('.sheet')));
    await o.page.fill('#sPlan', '3000'); await o.page.click('#sSave');
    await o.page.waitForFunction(() => /of 3,000/.test(document.getElementById('monthUsed').textContent));
    eq(await text(o.page, 'monthPct'), '59%');
    await o.page.click('#settingsBtn'); await o.page.click('#sForget');
    assert.ok(await o.page.isVisible('#setup'));
    const left = await o.page.evaluate(() => [localStorage.getItem('usage.token'), localStorage.getItem('usage.cache')]);
    eq(left.join(','), ',');
    await o.ctx.close();
  });

  await test('a 320 px phone has no sideways scroll', async () => {
    const o = await open(br, srv, { width: 320, routes: { '/settings/billing/usage': [200, UNDER] } });
    await o.page.waitForSelector('#main:not(.hidden)');
    const over = await o.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    eq(over, 0, 'overflow px');
    await o.ctx.close();
  });

  await br.close(); srv.stop();
  const bad = results.filter(r => !r[1]).length;
  console.log(bad ? bad + ' failed' : 'all passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
