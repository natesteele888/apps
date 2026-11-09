// Play Board screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br);
  await page.goto(srv.base + 'playboard/'); await page.waitForSelector('.card'); await page.waitForTimeout(500);
  const hint = async () => { const h = page.locator('#hintOk'); if (await h.isVisible()) await h.click(); };
  const toks = () => page.evaluate(() => [...document.querySelectorAll('#lyrTokens .tok')].map(g => { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform')); return { label: g.querySelector('text').textContent, x: +m[1], y: +m[2] }; }));
  const toClient = (x, y) => page.evaluate(([x, y]) => { const svg = document.getElementById('board'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]);
  // draw a freehand run from a token, ending dx/dy (board units) away
  const drag = async (label, pts) => {
    const t = (await toks()).find(t => t.label === label);
    const cs = []; for (const [dx, dy] of [[0, 0], ...pts]) cs.push(await toClient(t.x + dx, t.y + dy));
    await page.mouse.move(cs[0].x, cs[0].y); await page.mouse.down();
    for (let i = 1; i < cs.length; i++) for (let k = 1; k <= 8; k++) await page.mouse.move(cs[i - 1].x + (cs[i].x - cs[i - 1].x) * k / 8, cs[i - 1].y + (cs[i].y - cs[i - 1].y) * k / 8);
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  const makePlay = async (name, sport, variant, start) => {
    await page.click('#fab'); await page.waitForSelector('.sheet.open'); await page.fill('#npName', name);
    await page.click(`.sheet .pill:text-is("${sport}")`);
    if (variant) await page.click(`.sheet .pill:text-is("${variant}")`);
    if (start) await page.click(`.sheet .pill:text-is("${start}")`);
    await page.click('.sheet .btn.primary:text-is("Create play")'); await page.waitForSelector('#lyrTokens .tok'); await page.waitForTimeout(300); await hint();
  };
  const open = async name => { await page.click(`.card-open[aria-label^="Open ${name}"]`); await page.waitForSelector('#lyrTokens .tok'); await page.waitForTimeout(400); await hint(); await page.waitForTimeout(200); };
  const back = async () => { await page.click('.back'); await page.waitForSelector('.card'); await page.waitForTimeout(300); };

  const tool = async n => { await page.click(`#tools .pill:has-text("${n}")`); await top(); };
  const top = async () => { await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); }); await page.waitForTimeout(200); };
  // a soccer play drawn with the real tools (it joins the library)
  await makePlay('Corner kick', 'Soccer', null, 'Both teams');
  await tool('Run');
  await drag('7', [[40, -60], [90, -120], [130, -190]]);
  await drag('3', [[-10, -80], [-40, -170], [-60, -240]]);
  await drag('4', [[60, -50], [120, -90]]);
  await tool('Pass');
  const t5 = (await toks()).find(t => t.label === '5'), t7 = (await toks()).find(t => t.label === '7');
  await drag('5', [[t7.x - t5.x, t7.y - t5.y]]);
  await tool('Move'); await page.keyboard.press('Escape');
  await page.mouse.click(45, 520);
  await page.waitForTimeout(300);
  await top(); await shot(page, 'playboard', 3, 'Soccer, volleyball and more: draw runs and passes with your finger');
  await back();
  await shot(page, 'playboard', 2, 'Keep your plays on your phone, one card for each');
  // basketball play, running
  await open('Pick and roll');
  await page.click('#btnPlay'); await page.waitForTimeout(2300);
  await top(); await shot(page, 'playboard', 1, 'Draw a play, press play and watch every player move');
  await back();
  await open('Slant'); await top();
  await shot(page, 'playboard', 4, 'Football formations with routes, step by step');
  await back();
  await open('Cutoff relay'); await top();
  await shot(page, 'playboard', 5, 'Baseball and softball diamonds for relays and bunt plays');
  await back();
  finish('playboard'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
