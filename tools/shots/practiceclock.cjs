// Practice Clock screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish, ROOT } = require('./lib.cjs');
const C = require(ROOT + '/practiceclock/core.js');
(async () => {
  const plan = (id, name, extra) => Object.assign(C.planFromTemplate(id), { name }, extra || {});
  const plans = [plan('baseball', 'Tuesday practice', { start: '16:30', endBy: '18:15' }), plan('basketball', 'Gym night: shooting'), plan('cheer', 'Saturday cheer practice')];
  const hist = [['2026-11-05', 'Gym night: shooting', 60, 58], ['2026-11-03', 'Tuesday practice', 90, 92], ['2026-10-29', 'Saturday cheer practice', 75, 61, true], ['2026-10-27', 'Tuesday practice', 90, 90]]
    .map(([date, plan, planned, actual, early], i) => ({ id: 'h' + i + 'demoaa', date, plan, planned, actual, early: !!early }));
  const data = { v: 1, plans: plans.map(C.sanitizePlan), hist, settings: Object.assign(C.sanitizeSettings({}), { awake: true }), meta: { lastBackup: null } };
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09' });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release() {}, addEventListener() {} }) } }); });
  await page.addInitScript(d => { try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1'); localStorage.setItem('practiceclock.data', JSON.stringify(d)); } catch (e) {} }, data);
  await page.clock.install({ time: new Date(2026, 10, 9, 16, 28, 0) });
  await page.goto(srv.base + 'practiceclock/'); await page.waitForSelector('.plan');
  await page.clock.pauseAt(new Date(2026, 10, 9, 16, 30, 0));
  const adv = ms => page.clock.runFor(ms);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.waitForTimeout(300);
  // 1: the list of plans
  // run first so the best screen leads: start the baseball plan and run into the station block
  await page.click('.plan [data-act=plan-start]'); await adv(30);
  await page.waitForSelector('#r-time');
  await adv((15 + 20 + 5 + 5 + 1.25) * 60000); await page.waitForTimeout(300);
  await shot(page, 'practiceclock', 1, 'Run the whole practice by the minute with a big countdown');
  // 2: a plan with its blocks
  await page.click('[data-act=r-plans]'); await page.waitForSelector('.plan'); await page.waitForTimeout(300);
  await page.click('.plan:nth-of-type(1) [data-act=plan-edit].btn'); await page.waitForSelector('.blk'); await page.waitForTimeout(300);
  await shot(page, 'practiceclock', 2, 'Build a plan from timed blocks and see when practice ends');
  await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(300);
  await shot(page, 'practiceclock', 3, 'Stations, notes and colors for every block');
  await page.click('[data-act=ed-back]'); await page.waitForSelector('.plan'); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'practiceclock', 4, 'Your plans and the practice running, one tap away');
  await page.click('[data-act=tab][data-tab=recent]'); await page.waitForSelector('.hrow'); await page.waitForTimeout(300);
  await shot(page, 'practiceclock', 5, 'Recent practices, planned against how long they really ran');
  finish('practiceclock'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
