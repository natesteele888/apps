// Where Do I Go? (apps/situations) runs LYBS Ballclub's own trainer from /lybs-ballclub/ on the same site.
// This test serves both repos side by side, the way github.io does, so a Ballclub change that renames a
// file or a page global the store page relies on fails here instead of on a player's phone.
// run.sh links the Ballclub repo into serve/ (set BALLCLUB=/path/to/lybs-ballclub, or keep it next to this repo).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { launch, startServer, newPage, ROOT } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}

(async () => {
  const bc = path.join(ROOT, 'serve', 'lybs-ballclub');
  if (!fs.existsSync(path.join(bc, 'js', 'situations.js'))) {
    console.log('FAIL  lybs-ballclub is not next to this repo (set BALLCLUB=/path/to/lybs-ballclub)');
    process.exit(1);
  }
  const server = await startServer('situations');
  const browser = await launch();

  await test('the store page draws Ballclub\'s field and plays a ball', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url);
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.ok(!(await page.textContent('#sit')).includes("Couldn't load"), 'no load error');
    const marks = await page.locator('#sitSvg *').count();
    assert.ok(marks > 20, 'field drawn, got ' + marks + ' shapes');
    const chips = await page.locator('#sitTypeChips button').count();
    assert.ok(chips > 0, 'ball types listed, got ' + chips);
    await page.locator('#sitTypeChips button').first().click();
    await page.click('#sitBtnRun');
    await page.waitForTimeout(1500);
    const clock = await page.textContent('#sitClock');
    assert.ok(parseFloat(clock) > 0, 'play clock moved, got ' + clock);
    const jobs = await page.locator('#sitJobs > *').count();
    assert.ok(jobs >= 1, 'jobs listed, got ' + jobs);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'no sideways scroll, got ' + sw);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('Fundamentals opens in the store page\'s own info sheet', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url);
    await page.waitForSelector('#sitFundamentalsBtn');
    await page.click('#sitFundamentalsBtn');
    await page.waitForSelector('#info.on');
    assert.ok((await page.textContent('#infoBody')).trim().length > 20, 'info sheet has text');
    await page.click('#infoClose');
    assert.ok(!(await page.locator('#info.on').count()), 'sheet closes');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('opens offline after one visit, with Ballclub\'s files from the worker', async () => {
    const { ctx, page, errors } = await newPage(browser, { sw: true });
    await page.goto(server.url);
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => { const ks = await caches.keys(); for (const k of ks) { const c = await caches.open(k); if (await c.match('/lybs-ballclub/data/situations.csv')) return true; } return false; }, null, { timeout: 10000 });
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.ok(!(await page.textContent('#sit')).includes("Couldn't load"), 'no load error offline');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });


  /* ---------------- org in a box ---------------- */
  // org.js's pure helpers run in Node, so the rules for what a settings file may hold are checked directly.
  await test('org settings: bad links, colors and slugs are dropped, good ones kept', async () => {
    const Org = require(path.join(ROOT, 'apps', 'situations', 'org.js'));
    const o = Org.clean({ name: '  Test <b>League</b>  ', abbreviation: 'TOOLONGNAME', slug: '../x',
      branding: { logoUrl: 'javascript:alert(1)', primaryColor: 'red', secondaryColor: '#ABCDEF' },
      teams: ['Reds', { name: 'Reds' }, { name: '' }, 7, { name: 'Blues', color: '#00f' }],
      plays: { situations: 'https://x.test/s.csv' } });
    assert.strictEqual(o.name, 'Test <b>League</b>', 'name kept as text (the page sets it with textContent)');
    assert.strictEqual(o.abbreviation, 'TOOLONGN');
    assert.ok(/^[a-z0-9-]+$/.test(o.slug), 'slug made safe, got ' + o.slug);
    assert.strictEqual(o.branding.logoUrl, null, 'javascript: link dropped');
    assert.strictEqual(o.branding.primaryColor, null, 'named color dropped');
    assert.strictEqual(o.branding.secondaryColor, '#abcdef');
    assert.deepStrictEqual(o.teams.map(t => t.id), ['reds', 'reds-2', 'blues']);
    assert.strictEqual(o.plays, null, 'plays need both files');
    assert.strictEqual(Org.link('../secret.json'), null);
    assert.strictEqual(Org.link('sample/logo.svg'), 'sample/logo.svg');
    assert.strictEqual(Org.onColor('#101a33'), '#ffffff');
    assert.strictEqual(Org.onColor('#f2b705'), '#111111');
    const back = Org.decode(Org.encode(Org.clean({ name: 'Été Baseball', teams: ['Ñandús'] })));
    assert.strictEqual(back.name, 'Été Baseball', 'share link keeps accents');
    assert.strictEqual(Org.decode('not-base64!!'), null);
    assert.strictEqual(Org.themeCss(Org.defaultOrg(), null), '', 'LYBS default adds no CSS');
  });

  await test('LYBS is the default and looks exactly as before', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url);
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual(await page.title(), 'Where Do I Go? — Baseball Situations');
    assert.ok(await page.locator('#orgBar').isHidden(), 'no org bar');
    assert.ok(await page.locator('#orgTeams').isHidden(), 'no team picker');
    assert.ok(await page.locator('#orgNote').isHidden(), 'no note');
    assert.strictEqual(await page.locator('#orgTheme').count(), 0, 'no org colors added');
    assert.strictEqual((await page.textContent('#orgFooter')).trim(), 'Same plays as the Situations tab in LYBS Ballclub.');
    assert.strictEqual(await page.getAttribute('meta[name="theme-color"]', 'content'), '#0c1512');
    const look = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.body).color,
      on: getComputedStyle(document.querySelector('.sitViewToggle button.on')).backgroundColor,
      btn: getComputedStyle(document.querySelector('footer .btn')).backgroundColor,
    }));
    assert.deepStrictEqual(look, { bg: 'rgb(12, 21, 18)', ink: 'rgb(242, 245, 241)', on: 'rgb(255, 197, 61)', btn: 'rgb(19, 36, 32)' });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('a league file sets its name, logo, colors and teams', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url + '?org=sample&team=owls');
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual((await page.textContent('#orgName')).trim(), 'Sample Valley Youth Baseball');
    assert.ok(await page.locator('#orgBar').isVisible(), 'org bar shows');
    await page.waitForFunction(() => { const i = document.getElementById('orgLogo'); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
    assert.strictEqual(await page.locator('#orgTeams button').count(), 4);
    assert.strictEqual((await page.textContent('#orgTeams [aria-pressed="true"]')).trim(), 'Owls');
    assert.strictEqual(await page.title(), 'Where Do I Go? — SVYB · Owls');
    const look = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      on: getComputedStyle(document.querySelector('.sitViewToggle button.on')).backgroundColor,
      fieldRole: getComputedStyle(document.querySelector('.situationsRoot')).getPropertyValue('--sit-amber').trim(),
    }));
    assert.strictEqual(look.bg, 'rgb(16, 26, 51)', 'league background');
    assert.strictEqual(look.on, 'rgb(242, 183, 5)', 'the Owls color on the buttons');
    assert.strictEqual(look.fieldRole, '#ffc53d', 'field role colors stay the same');
    await page.click('#orgTeams [data-team="hawks"]');
    assert.strictEqual((await page.textContent('#orgTeams [aria-pressed="true"]')).trim(), 'Hawks');
    assert.ok((await page.title()).endsWith('Hawks'));
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.sitViewToggle button.on')).backgroundColor), 'rgb(224, 78, 57)');
    await page.locator('#sitTypeChips button').first().click();
    await page.click('#sitBtnRun');
    await page.waitForTimeout(1200);
    assert.ok(parseFloat(await page.textContent('#sitClock')) > 0, 'plays still run');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'no sideways scroll, got ' + sw);
    assert.strictEqual((await page.textContent('#orgFooter')).trim().startsWith('A made-up league'), true);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('the phone remembers its league and team, and ?org=lybs goes back', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url + '?org=sample&team=foxes');
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    await page.goto(server.url);
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual((await page.textContent('#orgName')).trim(), 'Sample Valley Youth Baseball');
    assert.strictEqual((await page.textContent('#orgTeams [aria-pressed="true"]')).trim(), 'Foxes');
    await page.goto(server.url + '?org=lybs');
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.ok(await page.locator('#orgBar').isHidden(), 'back on LYBS');
    await page.goto(server.url);
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.ok(await page.locator('#orgBar').isHidden(), 'stays on LYBS');
    assert.strictEqual(await page.title(), 'Where Do I Go? — Baseball Situations');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('an unknown league shows LYBS with a short note', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url + '?org=no-such-league');
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.ok(await page.locator('#orgNote').isVisible(), 'note shows');
    assert.ok(await page.locator('#orgBar').isHidden(), 'LYBS look');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('the setup screen previews a league and builds a share link for another phone', async () => {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(server.url + '?setup');
    await page.waitForSelector('#setup.on #sName', { timeout: 10000 });
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    await page.fill('#sName', 'Test Town Baseball');
    await page.fill('#sAbbr', 'TTB');
    await page.fill('#sAccent', '#1a56db');
    await page.fill('#sBg', '#ffffff');
    await page.fill('#sTeams', 'Reds, #cc0000\nBlues');
    assert.strictEqual((await page.textContent('#orgName')).trim(), 'Test Town Baseball', 'preview while typing');
    assert.strictEqual(await page.locator('#orgTeams button').count(), 2);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).color), 'rgb(16, 32, 26)', 'dark text on a light background');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'setup fits a phone, got ' + sw);
    await page.click('#sShare');
    await page.waitForFunction(() => document.getElementById('sLink').value.includes('#org='));
    const link = await page.inputValue('#sLink');
    assert.deepStrictEqual(errors, []);
    await ctx.close();

    const two = await newPage(browser);
    await two.page.goto(link.replace(/^https?:\/\/[^/]+/, server.url.replace(/\/apps\/situations\/$/, '')));
    await two.page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual((await two.page.textContent('#orgName')).trim(), 'Test Town Baseball');
    assert.strictEqual(await two.page.evaluate(() => location.hash), '', 'long link tidied from the address bar');
    await two.page.goto(server.url);
    await two.page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual((await two.page.textContent('#orgName')).trim(), 'Test Town Baseball', 'remembered');
    assert.deepStrictEqual(two.errors, []);
    await two.ctx.close();
  });

  await test('a league can point at its own play files', async () => {
    const { ctx, page, errors } = await newPage(browser);
    const bcData = path.join(ROOT, 'serve', 'lybs-ballclub', 'data');
    const hits = [];
    await page.route('**/apps/situations/orgs/zz-plays.json', r => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ name: 'Own Plays League', plays: { situations: 'https://plays.example.test/s.csv', responsibilities: 'https://plays.example.test/r.csv' } }) }));
    await page.route('https://plays.example.test/**', r => {
      const u = r.request().url(); hits.push(u);
      const f = /s\.csv$/.test(u) ? 'situations.csv' : 'responsibilities.csv';
      r.fulfill({ contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(bcData, f), 'utf8') });
    });
    const ballclubCsv = [];
    page.on('request', q => { if (/\/lybs-ballclub\/data\//.test(q.url())) ballclubCsv.push(q.url()); });
    await page.goto(server.url + '?org=zz-plays');
    await page.waitForSelector('#sitTypeChips button', { timeout: 10000 });
    assert.strictEqual(hits.length, 2, 'both of the league\'s files loaded, got ' + hits.join(', '));
    assert.deepStrictEqual(ballclubCsv, [], 'LYBS play files not used');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})();
