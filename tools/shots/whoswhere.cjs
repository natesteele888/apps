// Who's Where screenshots with made-up demo data. See lib.cjs.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const TODAY = '2026-11-09'; // Monday
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const T = (h, m) => h * 60 + (m || 0);
let seq = 0;
const ev = o => Object.assign({ id: 'evt' + (++seq) + 'demo', title: '', type: 'practice', date: '', start: 0, end: 0, place: '', address: '', kids: [], driver: '', snack: '', notes: '', early: 0, drive: 0, series: '' }, o);
const day = n => addDays(TODAY, n); // Monday = 0
const data = {
  v: 1,
  people: [
    { id: 'riley', name: 'Riley', role: 'player', color: '#3aa0ff' }, { id: 'jordan', name: 'Jordan', role: 'player', color: '#ff9f43' },
    { id: 'casey', name: 'Casey', role: 'adult', color: '#2fd08a' }, { id: 'morgan', name: 'Morgan', role: 'adult', color: '#b08cff' }
  ],
  events: [
    ev({ title: 'Practice', date: day(0), start: T(16, 30), end: T(17, 30), place: 'Main Gym', kids: ['riley'], driver: 'morgan', early: 10, drive: 15 }),
    ev({ title: 'Practice', date: day(1), start: T(17), end: T(18, 15), place: 'Main Gym', kids: ['riley'], driver: 'casey', early: 10, drive: 15 }),
    ev({ title: 'Practice', date: day(1), start: T(17, 30), end: T(18, 30), place: 'Rec Center', kids: ['jordan'], driver: 'casey', early: 5, drive: 20 }),
    ev({ title: 'Game vs Comets', type: 'game', date: day(2), start: T(18), end: T(19, 30), place: 'Park Field 2', kids: ['riley'], driver: '', snack: 'open', early: 30, drive: 25, notes: 'Wear the away jersey.' }),
    ev({ title: 'Practice', date: day(3), start: T(16, 30), end: T(17, 30), place: 'Rec Center', kids: ['jordan'], driver: 'morgan', early: 5, drive: 20 }),
    ev({ title: 'Tutoring', type: 'other', date: day(3), start: T(17), end: T(17, 45), place: 'Library', kids: ['jordan'], driver: 'casey', drive: 10 }),
    ev({ title: 'Team pizza night', type: 'other', date: day(4), start: T(18, 30), end: T(20), place: 'Community Hall', kids: ['riley', 'jordan'], driver: 'casey', drive: 10 }),
    ev({ title: 'Tournament day', type: 'tournament', date: day(5), start: T(8), end: T(14), place: 'Riverside Complex', kids: ['riley', 'jordan'], driver: 'casey', snack: 'morgan', early: 45, drive: 35, notes: 'Bring chairs and sunscreen.' }),
    ev({ title: 'Game vs Rockets', type: 'game', date: day(6), start: T(13), end: T(14, 30), place: 'Park Field 1', kids: ['jordan'], driver: 'morgan', snack: 'casey', early: 20, drive: 15 }),
    ev({ title: 'Practice', date: day(7), start: T(16, 30), end: T(17, 30), place: 'Main Gym', kids: ['riley'], driver: 'morgan', early: 10, drive: 15 }),
    ev({ title: 'Practice', date: day(9), start: T(17), end: T(18), place: 'Rec Center', kids: ['jordan'], driver: 'casey', early: 5, drive: 20 }),
    ev({ title: 'Game vs Lightning', type: 'game', date: day(10), start: T(18), end: T(19, 30), place: 'Park Field 2', kids: ['riley'], driver: 'morgan', snack: 'open', early: 30, drive: 25 }),
    ev({ title: 'Practice', date: day(-3), start: T(16, 30), end: T(17, 30), place: 'Main Gym', kids: ['riley'], driver: 'casey' })
  ],
  series: [], settings: { weekStart: 1, h24: false, driveMin: 15, earlyMin: 0 }
};
(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: TODAY });
  await page.addInitScript(p => { try { if (localStorage.getItem('whoswhere.data') === null) { localStorage.setItem('whoswhere.data', p.d); localStorage.setItem('whoswhere.meta', p.m); } } catch (e) {} },
    { d: JSON.stringify(data), m: JSON.stringify({ lastBackup: TODAY, tips: { week: true, month: true, attention: true, people: true }, snooze: null }) });
  await page.goto(srv.base + 'whoswhere/'); await page.waitForSelector('#top:not([hidden])'); await page.waitForTimeout(600);
  await shot(page, 'whoswhere', 1, 'One week for every kid, with who is driving');
  await page.click('[data-act=tab][data-tab=attention]'); await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 120)); await page.waitForTimeout(200);
  await shot(page, 'whoswhere', 2, 'See double-booked kids and drivers, with a one-tap fix');
  await page.click('[data-act=tab][data-tab=week]'); await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 335)); await page.waitForTimeout(300);
  await shot(page, 'whoswhere', 3, 'Games, tournaments and who still needs a ride');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-act=tab][data-tab=month]'); await page.waitForTimeout(500);
  await shot(page, 'whoswhere', 4, 'The whole month at a glance, with clashes marked');
  await page.click('[data-act=tab][data-tab=week]'); await page.waitForTimeout(400);
  await page.locator('[data-act=open-ev]', { hasText: 'Tournament day' }).first().click(); await page.waitForTimeout(600);
  await shot(page, 'whoswhere', 5, 'Tap an event for the place, the driver, the snack and a calendar file');
  finish('whoswhere'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
