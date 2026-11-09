// Get Ready screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09', time: '2026-11-09T07:12:00' });
  await page.goto(srv.base + 'getready/'); await page.waitForSelector('.item');
  // pictures: simple drawings made in the page so no real photos are involved
  await page.evaluate(async () => {
    const draw = (bg, emoji) => new Promise(res => { const c = document.createElement('canvas'); c.width = c.height = 360; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 360, 360); x.font = '200px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 180, 190); c.toBlob(res, 'image/jpeg', .85); });
    const put = (id, b) => new Promise(r => { const q = indexedDB.open('getready', 1); q.onupgradeneeded = () => q.result.createObjectStore('files'); q.onsuccess = () => { const tx = q.result.transaction('files', 'readwrite'); tx.objectStore('files').put(b, 'photo:' + id); tx.oncomplete = r; }; });
    for (const [id, bg, e] of [['med', '#1d4ed8', '💊'], ['vit', '#0b3a8f', '🍊'], ['teeth', '#2563eb', '🪥'], ['bag', '#1e40af', '🎒'], ['water', '#0e7490', '🥤'], ['lunch', '#1d4ed8', '🥪']]) await put(id, await draw(bg, e));
    // a month of finished mornings so the streak and log look lived-in
    const s = JSON.parse(localStorage.getItem('getready.v1') || 'null') || {};
    const done = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-30', '2026-10-31', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    s.days = s.days || {}; const ids = ['med', 'vit', 'teeth', 'bag', 'water', 'lunch'], wk = ['wmed', 'wvit', 'wwater'];
    done.forEach(k => { const d = new Date(k + 'T12:00').getDay(), we = d === 0 || d === 6; s.days[k] = { c: Object.fromEntries((we ? [] : ids).map(i => [i, 1])), done: 1, m: 1 }; });
    s.days['2026-11-09'] = { c: { med: 1, vit: 1, teeth: 1 }, done: 0, m: 2 };
    localStorage.setItem('getready.v1', JSON.stringify(s));
  });
  await page.reload(); await page.waitForSelector('.thumb img'); await page.waitForTimeout(400);
  await shot(page, 'getready', 1, 'Check things off with a picture of each item beside it');
  await page.locator('.item', { hasText: 'School bag' }).locator('.thumb').click(); await page.waitForSelector('.overlay .pic'); await page.waitForTimeout(300);
  await shot(page, 'getready', 2, 'Tap a picture to see the item big, so it is easy to recognize');
  await page.locator('[data-act=vclose]').click();
  await page.locator('[data-tab=list]').click(); await page.waitForTimeout(300);
  await shot(page, 'getready', 3, 'A different list for different days, with timers and photos');
  await page.locator('[data-tab=alarms]').click(); await page.waitForTimeout(300);
  await shot(page, 'getready', 4, 'Reminders at the times you pick, with a calendar alarm option');
  await page.locator('[data-tab=log]').click(); await page.waitForTimeout(300);
  await shot(page, 'getready', 5, 'A streak and a calendar of every finished morning');
  await page.locator('[data-tab=today]').click(); await page.evaluate(() => window.GetReady.celebrate('griddy')); await page.waitForSelector('.celebrate canvas'); await page.waitForTimeout(900);
  await shot(page, 'getready', 6, 'Finish the list and a full-screen dance celebrates');
  finish('getready'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
