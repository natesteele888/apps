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

  await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
})();
