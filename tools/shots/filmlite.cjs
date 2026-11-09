// Film Lite screenshots with made-up demo data. See lib.cjs.
// The clip is the app's own example (a bouncing ball drawn on a canvas and recorded in the page), so no real people appear.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const TODAY = '2026-11-09';
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: TODAY });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(srv.base + 'filmlite/'); await page.waitForSelector('.home');
  await page.click('#exBtn'); await page.waitForSelector('.player video', { timeout: 15000 });
  await page.waitForFunction(() => { const v = document.querySelector('.player video'); return v && v.readyState >= 2 && v.duration > 1; }, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const seek = async t => { await page.evaluate(x => FL.Player.seek(x, { user: true }), t); await page.waitForTimeout(500); };
  const dismiss = async () => { await page.waitForTimeout(300); };
  await seek(1.5);
  await shot(page, 'filmlite', 1, 'Step a clip frame by frame, with the tag drawn on the picture');
  await seek(2.9);
  await shot(page, 'filmlite', 2, 'A circle or arrow on the exact frame, saved with the tag');
  await page.evaluate(() => { const l = document.querySelector('.tg'); const sc = (function f(e) { while (e && e !== document.body) { if (e.scrollHeight > e.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e; e = e.parentElement; } return document.scrollingElement; })(l); sc.scrollTop += l.getBoundingClientRect().top - 330; }); await page.waitForTimeout(400);
  await shot(page, 'filmlite', 3, 'Every tagged moment in a list: Good, Fix, Question, Coach note');
  await page.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0); });
  // draw an angle on a new frame
  await seek(0.9);
  await page.click('[data-act=draw]'); await page.waitForSelector('#plDraw:not([hidden])'); await page.waitForTimeout(300);
  const drag = async pts => { const b = await page.locator('#ov').boundingBox(); await page.mouse.move(b.x + pts[0][0] * b.width, b.y + pts[0][1] * b.height); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(b.x + p[0] * b.width, b.y + p[1] * b.height, { steps: 6 }); await page.mouse.up(); };
  await page.click('[data-act=dr-color][data-i="1"]');
  await page.click('[data-tool=angle]');
  await drag([[0.5, 0.78], [0.3, 0.3]]); await drag([[0.5, 0.78], [0.78, 0.45]]);
  await page.click('[data-tool=circle]'); await drag([[0.45, 0.3], [0.52, 0.3]]);
  await page.waitForTimeout(400);
  await shot(page, 'filmlite', 4, 'Measure an angle on the paused frame');
  await page.click('[data-act=dr-save]'); await page.waitForSelector('.sheet-wrap.dock.open'); await page.waitForTimeout(500);
  await page.click('.sheet-wrap.open [data-kind="fix"]'); await page.fill('#edNote', 'Launch angle looks too flat here');
  await page.waitForTimeout(300);
  await shot(page, 'filmlite', 5, 'Add a short note and pick what kind of moment it is');
  finish('filmlite'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
