// Read 20 screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09', time: '2026-11-09T19:00:00' });
  await page.route(/gstatic\.com|googleapis\.com|firebase/, r => r.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const books = ['sam-the-cat', 'the-fat-rat', 'a-big-pig', 'pen-the-hen', 'bud-the-bug', 'i-can-run', 'my-pet', 'at-the-pond', 'chip-the-chimp', 'fran-the-frog', 'jack-and-jill'];
    const days = {};
    const nights = ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-10-31', '2026-10-30', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-24', '2026-10-23', '2026-10-21', '2026-10-20', '2026-10-19'];
    nights.forEach((k, i) => {
      const sec = k === '2026-11-09' ? 780 : 1200 + (i % 3) * 120;
      const a = books[i % books.length], b = books[(i + 3) % books.length];
      const bk = {}; bk[a] = { sec: Math.round(sec * .6), fin: 1 }; bk[b] = { sec: sec - Math.round(sec * .6), fin: i % 2 };
      days[k] = { done: k === '2026-11-09' ? 0 : 1, parts: { demo: { sec, books: bk, extra: i % 5 === 0 ? [{ title: 'Bedtime book from home', sec: 300 }] : [] } } };
      if (i % 5 === 0) days[k].parts.demo.sec += 300;
    });
    localStorage.setItem('read20.dev', 'demo');
    localStorage.setItem('read20.v1', JSON.stringify({ v: 1, name: 'Riley', goal: 20, size: 1, say: false, bk: '', days }));
    });
  await page.goto(srv.base + 'read20/'); await page.waitForSelector('.cover'); await page.waitForTimeout(400);
  await shot(page, 'read20', 1, 'A shelf of short stories, and tonight\'s reading at a glance');
  await page.locator('.lv[data-lv="3"]').click(); await page.waitForTimeout(300);
  await shot(page, 'read20', 2, 'Five levels of free stories, from easy to harder');
  await page.locator('.cover', { hasText: 'Fran the Frog' }).click(); await page.waitForSelector('.reader');
  await page.locator('#nextp').click(); await page.locator('#nextp').click();
  await page.clock.runFor(95000); await page.locator('.w').nth(1).click(); await page.waitForTimeout(300);
  await shot(page, 'read20', 3, 'Big words; tap one to keep your place while the timer runs');
  await page.locator('#back').click(); await page.waitForSelector('.cover');
  await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal');
  await page.locator('.day[data-d="2026-11-06"]').click(); await page.waitForTimeout(300);
  await shot(page, 'read20', 4, 'A calendar of every night, with the stories and the streak');
  await page.locator('#pm').click(); await page.locator('.day[data-d="2026-10-28"]').click(); await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(400);
  await shot(page, 'read20', 5, 'Look back at any month and see what was read');
  finish('read20'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
