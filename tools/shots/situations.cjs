// Where Do I Go? screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09' });
  await page.route(/natesteele888\.github\.io|googleapis|gstatic/, r => r.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wdig.v1.cfg', JSON.stringify({ name: 'Hawks 10U', sub: 'Where do I go?' }));
    localStorage.setItem('wdig.v1.team', JSON.stringify({
      schedule: [['Sat Nov 14', 'vs Comets', '10:00a', 'Home'], ['Sat Nov 21', '@ Lightning', '1:00p', 'Away'], ['Sat Nov 28', 'vs Rockets', '10:00a', 'Home'], ['Sat Dec 5', '@ Wildcats', '11:30a', 'Away']],
      roster: [['Riley', 'SS'], ['Jordan', 'P'], ['Casey', 'C'], ['Morgan', '1B'], ['Avery', '2B'], ['Quinn', '3B'], ['Sam', 'LF'], ['Taylor', 'CF'], ['Drew', 'RF']] }));
  });
  await page.goto(srv.base + 'situations/'); await page.waitForSelector('#svg'); await page.waitForTimeout(500);
  const play = async ms => { await page.locator('#btnRun').click(); await page.waitForTimeout(ms); };
  // runners on first and third, one out, a grounder: the play is being worked through
  await page.locator('[data-base="1"]').click(); await page.locator('[data-base="3"]').click(); await page.locator('[data-out="1"]').click();
  await page.locator('[data-me="SS"]').click();
  await page.waitForTimeout(300);
  await play(1700);
  await shot(page, 'situations', 1, 'Runners, outs and the hit, then watch all nine fielders move');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const r = document.getElementById('bigJobBox').getBoundingClientRect(); window.scrollBy(0, r.top - 330); }); await page.waitForTimeout(300);
  await shot(page, 'situations', 2, 'Your job on the play, in plain words, for your position');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-me=""]').click(); await page.locator('[data-tt="air"]').click();
  await page.locator('[data-base="2"]').click(); await page.locator('[data-out="2"]').click();
  await page.waitForTimeout(300); await play(1500);
  await shot(page, 'situations', 3, 'Fly balls, base hits and bunts too, with cutoffs and relays');
  await page.locator('[data-tab=quiz]').click(); await page.waitForTimeout(400);
  await page.locator('[data-qpos="SS"]').click(); await page.waitForTimeout(400);
  await page.locator('#qReveal').click(); await page.waitForTimeout(600);
  await shot(page, 'situations', 4, 'Quiz yourself on where you go, then see the right answer');
  await page.locator('[data-tab=rules]').click(); await page.waitForTimeout(400);
  await shot(page, 'situations', 5, 'The few rules that cover almost every ball, in plain words');
  await page.locator('[data-tab=team]').click(); await page.waitForTimeout(400);
  await shot(page, 'situations', 6, 'Keep the roster and game schedule with the plays');
  finish('situations'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
