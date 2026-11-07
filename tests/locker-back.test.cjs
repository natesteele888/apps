// Locker: the phone's Back button closes the top sheet instead of leaving the app.
const assert = require('assert');
const { launch, startServer, newPage } = require('./lib.cjs');
const { sampleAthlete, seed } = require('./fixtures.cjs');
const TODAY = '2026-11-07';
const sheets = page => page.$$eval('.sheet-wrap.open', s => s.length);
const settle = page => page.waitForTimeout(450);
(async () => {
  const srv = await startServer(), br = await launch();
  let fails = 0;
  const check = async (name, fn) => { try { await fn(); console.log('PASS  ' + name); } catch (e) { fails++; console.log('FAIL  ' + name + '\n      ' + String(e.stack || e).split('\n').slice(0, 4).join('\n      ')); } };
  const fresh = async () => {
    const { page, errors } = await newPage(br, { today: TODAY });
    await seed(page, [sampleAthlete(TODAY)]);
    await page.goto('about:blank'); await page.goto(srv.url); await page.waitForSelector('#top:not([hidden])');
    return { page, errors };
  };
  await check('Back closes one sheet and stays in the app', async () => {
    const { page, errors } = await fresh();
    await page.click('[data-act=menu]'); await page.waitForSelector('.sheet-wrap.open');
    await page.goBack(); await settle(page);
    assert.strictEqual(await sheets(page), 0, 'sheet closed');
    assert.ok(page.url().startsWith(srv.url), 'still on the app: ' + page.url());
    assert.deepStrictEqual(errors, []);
  });
  const openStacked = async page => {
    await page.click('[data-act=tab][data-tab=clips]'); await page.waitForSelector('[data-act=clip-edit]');
    await page.click('[data-act=clip-edit]'); await page.waitForSelector('.sheet-wrap.open [data-del]');
    await page.click('.sheet-wrap.open [data-del]'); await page.waitForFunction(() => document.querySelectorAll('.sheet-wrap.open').length === 2);
  };
  await check('Back peels two stacked sheets one at a time', async () => {
    const { page } = await fresh(); await openStacked(page);
    await page.goBack(); await settle(page); assert.strictEqual(await sheets(page), 1, 'one left');
    await page.goBack(); await settle(page); assert.strictEqual(await sheets(page), 0, 'none left');
    assert.ok(page.url().startsWith(srv.url));
  });
  await check('Closing with the X gives the history entry back (Back then leaves the page, not a ghost sheet)', async () => {
    const { page } = await fresh();
    await page.click('[data-act=menu]'); await page.waitForSelector('.sheet-wrap.open');
    await page.click('.sheet-wrap.open .x'); await settle(page);
    assert.strictEqual(await sheets(page), 0);
    await page.click('[data-act=menu]'); await page.waitForSelector('.sheet-wrap.open');
    await page.goBack(); await settle(page);
    assert.strictEqual(await sheets(page), 0);
    assert.ok(page.url().startsWith(srv.url), 'a closed sheet left no stray entry: ' + page.url());
    await page.goBack(); await settle(page);
    assert.ok(!page.url().startsWith(srv.url), 'a second Back leaves the app: ' + page.url());
  });
  await check('Cancel on the top sheet gives its entry back; Back then closes the one below', async () => {
    const { page } = await fresh(); await openStacked(page);
    await page.click('.sheet-wrap.open:last-child [data-close].btn'); await settle(page);
    assert.strictEqual(await sheets(page), 1);
    await page.goBack(); await settle(page); assert.strictEqual(await sheets(page), 0);
    assert.ok(page.url().startsWith(srv.url));
  });
  await check('Menu then Back up & restore (a sheet that replaces another) keeps Back in step', async () => {
    const { page } = await fresh();
    await page.click('[data-act=menu]'); await page.waitForSelector('.sheet-wrap.open');
    await page.click('.sheet-wrap.open [data-act=backup-sheet]'); await settle(page);
    assert.strictEqual(await sheets(page), 1);
    await page.goBack(); await settle(page); assert.strictEqual(await sheets(page), 0, 'one Back closes it');
    assert.ok(page.url().startsWith(srv.url));
  });
  await br.close(); srv.stop();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
