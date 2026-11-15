// Read 20 screenshots with made-up demo data. See lib.cjs.
// Fictional readers only: Riley (an early reader) and Jordan (an older reader). No real names, no real accounts.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09', time: '2026-11-09T19:00:00' });
  await page.route(/gstatic\.com|googleapis\.com|firebase/, r => r.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const nights = ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-10-31', '2026-10-30', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-24', '2026-10-23', '2026-10-22'];
    const mk = (books, bonus) => { const days = {};
      nights.forEach((k, i) => {
        const sec = k === '2026-11-09' ? 780 : 1200 + (i % 3) * 120, a = books[i % books.length], b = books[(i + 3) % books.length];
        const bk = {}; bk[a] = { sec: Math.round(sec * .6), fin: 1 }; bk[b] = { sec: sec - Math.round(sec * .6), fin: i % 2 };
        days[k] = { done: k === '2026-11-09' ? 0 : 1, parts: { demo: { sec, books: bk, extra: bonus && i % 5 === 0 ? [{ title: 'Bedtime book from home', sec: 300 }] : [] } } };
        if (bonus && i % 5 === 0) days[k].parts.demo.sec += 300; });
      return days; };
    const early = ['sam-the-cat', 'the-fat-rat', 'a-big-pig', 'pen-the-hen', 'bud-the-bug', 'i-can-run', 'my-pet', 'at-the-pond', 'chip-the-chimp', 'fran-the-frog', 'kate-learns-to-cheer', 'pyramid-day'];
    const older = ['the-curveball-mystery', 'why-warm-up', 'finding-the-main-idea', 'be-a-word-detective', 'the-first-photograph', 'ancient-egypt-gift-of-the-nile'];
    const prof = (name, av, lv, size, days) => ({ v: 1, name, av, lv, goal: 20, size, say: false, bk: '', days });
    localStorage.setItem('read20.dev', 'demo');
    localStorage.setItem('read20.v1', JSON.stringify({ v: 2, active: 'main', order: ['main', 'jordan1'], gone: {}, profiles: { main: prof('Riley', '🦊', 'early', 1, mk(early, true)), jordan1: prof('Jordan', '🐼', 'older', 0, mk(older, false)) } }));
  });
  await page.goto(srv.base + 'read20/'); await page.waitForSelector('.cover'); await page.waitForTimeout(400);
  await shot(page, 'read20', 1, 'Every child gets their own profile, streak and shelf');
  await page.locator('.lv[data-lv="4"]').click(); await page.locator('.cover', { hasText: 'Kate Learns to Cheer' }).click(); await page.waitForSelector('.reader');
  for (let i = 0; i < 4; i++) await page.locator('#nextp').click();
  await page.clock.runFor(95000); await page.locator('.w').nth(1).click(); await page.waitForTimeout(300);
  await shot(page, 'read20', 2, 'Big words; tap one to keep your place while the timer runs');
  await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.locator('.cover', { hasText: 'Pyramid Day' }).click(); await page.waitForSelector('.reader');
  { const b = await page.locator('.w', { hasText: /^pyramid/ }).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.clock.runFor(600); await page.mouse.up(); }
  await page.locator('.wordpop').waitFor(); await page.waitForTimeout(300);
  await shot(page, 'read20', 3, 'Press and hold any word to see its syllables and sounds');
  await page.locator('#wpdone').click(); await page.locator('#back').click(); await page.waitForSelector('.cover');
  await page.locator('.rd[data-id]').nth(1).click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Jordan');
  await page.locator('.lv[data-tp="social"]').click(); await page.waitForTimeout(300); await page.evaluate(() => window.scrollTo(0, 150)); await page.waitForTimeout(200);
  await shot(page, 'read20', 4, 'A library for older readers: sports, science, social studies and English');
  await page.locator('.lv[data-tp="sports"]').click(); await page.locator('.cover', { hasText: 'Curveball' }).click(); await page.waitForSelector('.reader.older');
  for (let i = 0; i < 5; i++) await page.locator('#nextp').click(); await page.waitForSelector('.quiz');
  await page.locator('.qq').nth(0).locator('.qb', { hasText: '60 feet, 6 inches' }).click(); await page.locator('.qq').nth(1).locator('.qb', { hasText: 'Spin and the air around the seams' }).click();
  await page.evaluate(() => document.querySelector('.gloss').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await shot(page, 'read20', 5, 'Words to know and a quick quiz at the end of every story');
  await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Riley');
  await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal'); await page.locator('.day[data-d="2026-11-06"]').click(); await page.waitForTimeout(300);
  await shot(page, 'read20', 6, 'A calendar of every night, with the stories and the streak');
  finish('read20'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
