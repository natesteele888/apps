// Offseason Power Program screenshots with made-up progress. See lib.cjs.
// The app lives in natesteele888/fitness-hub (read only). Point APP_DIR at a checkout of it.
//   APP_DIR=/path/to/fitness-hub NODE_PATH=/opt/node22/lib/node_modules node tools/shots/fitness.cjs
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/fitness-hub';

// Day 1 was Mon Nov 2; today is Wed Nov 18 morning, day 17. Days 1 to 16 are done, one finished each day.
const dates = d => { const x = new Date('2026-11-02T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const completed = {}, completionDates = [];
for (let i = 1; i <= 16; i++) { completed[i] = true; completionDates.push(dates(i - 1)); }
const measurements = [
  { date: '2026-11-02', day: 1, height: 56.5, weight: 79, broadJump: 62, plank: 45, sgBroadL: 44, sgBroadR: 36, kickFG: 28, sprint10: 2.35 },
  { date: '2026-11-09', day: 8, broadJump: 65, plank: 58, sgBroadL: 46, sgBroadR: 38, kickFG: 30, sprint10: 2.3 },
  { date: '2026-11-16', day: 15, height: 56.8, weight: 80, broadJump: 68, plank: 70, sgBroadL: 49, sgBroadR: 41, kickFG: 32, sprint10: 2.24 }
];

(async () => {
  const srv = await serve(APP_DIR, 'fitness'), br = await launch();
  const { page } = await phone(br, { time: '2026-11-18T07:20:00' });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort()); // nothing leaves the machine (video thumbnails, sync, fonts)
  await page.goto(srv.base); await page.waitForSelector('.tab');
  const day = 17;
  // the app's storage key is read from its own source (it contains a person's name, so it is not written out here)
  const key = /STORE_KEY\s*=\s*"([^"]+)"/.exec(require('fs').readFileSync(APP_DIR + '/index.html', 'utf8'))[1];
  const checks = {};
  // warm-up and the start of the main set are ticked off: day 17 is mid-checklist
  await page.evaluate(([completed, completionDates, measurements, day, key]) => {
    localStorage.setItem(key, JSON.stringify({ completed, completionDates, selectedDay: day, checks: {}, measurements }));
  }, [completed, completionDates, measurements, day, key]);
  await page.reload(); await page.waitForSelector('.exbox');
  // tick the first boxes through the real UI
  const boxes = page.locator('#view-today .exbox'); const total = await boxes.count();
  for (let i = 0; i < Math.min(7, total); i++) await boxes.nth(i).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(250);
  await shot(page, 'fitness', 1, 'Tick off each move of the day as you go, mid-workout');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  await shot(page, 'fitness', 2, 'The day, the week and your streak at a glance');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(250);
  await shot(page, 'fitness', 3, 'Finish the cooldown and mark the day complete');
  await page.click('[data-tab=program]'); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'fitness', 4, 'Nine weeks in three phases, with finished days marked');
  await page.click('[data-tab=progress]'); await page.waitForTimeout(400);
  await page.evaluate(() => { const c = document.querySelectorAll('.metric-card')[2]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 24); });
  await page.waitForTimeout(300);
  await shot(page, 'fitness', 5, 'Jump, sprint and plank numbers with a trend line for each');
  await page.evaluate(() => { const c = document.querySelector('.asym'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 420); });
  await page.waitForTimeout(300);
  await shot(page, 'fitness', 6, 'See the gap between left and right leg at a glance');
  finish('fitness'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
