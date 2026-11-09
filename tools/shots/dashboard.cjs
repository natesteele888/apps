// LYBS Dashboard screenshots with made-up demo data. See lib.cjs / README.md.
// The app lives in another repo (read only): APP_DIR points at a checkout of lybs-dashboard.
// That repo ships with an empty roster (data.js) and no Firebase; this script feeds it a fictional league
// (Hawks, Comets, Lightning, Rockets, Owls, Storm; first names + last initials only) and signs in a fake local admin.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const fs = require('fs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/lybs-dashboard';
const CHART = process.env.CHART_JS || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/vendor/package/dist/chart.umd.js'; // Chart.js 4.4.1 (the app loads it from cdnjs, blocked here)
const ID = 'dashboard';

// ---- fictional registrations: {year, first, last(initial), sport, division, allstar_division, gender, city, team, amount} ----
let seed = 20261109; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const pick = a => a[Math.floor(rnd() * a.length)];
const FIRST = ['Riley', 'Jordan', 'Casey', 'Morgan', 'Avery', 'Quinn', 'Sam', 'Taylor', 'Drew', 'Jamie', 'Parker', 'Skyler', 'Reese', 'Rowan', 'Finley', 'Emerson', 'Harper', 'Hayden', 'Kendall', 'Logan', 'Peyton', 'Sage', 'Blake', 'Cameron', 'Dakota', 'Elliot', 'Frankie', 'Gray', 'Kai', 'Lane', 'Micah', 'Noel', 'Oakley', 'Phoenix', 'Remy', 'Shiloh', 'Tatum', 'Wren', 'Zion', 'Ellis'];
const LAST = 'ABCDEFGHJKLMNPRSTWY'.split('');
const CITIES = ['Riverton', 'Maple Grove', 'Oakfield', 'Hillcrest', 'Lakeside'];
const PLAN = { // [sport, division, allstar bracket, price, count2025, count2026, teams]
  b: [['Baseball', 'Majors', '12U', 160, 26, 30, ['Hawks', 'Comets']], ['Baseball', 'Minors', '10U', 140, 34, 38, ['Lightning', 'Rockets']], ['Baseball', 'Rookies', '8U', 120, 30, 36, ['Owls', 'Storm']], ['T-Ball', 'T-Ball', '', 90, 24, 28, []],
       ['Softball', '12U', '12U', 150, 12, 16, []], ['Softball', '10U', '10U', 135, 14, 18, []], ['Softball', 'Farm', '8U', 115, 12, 15, []]] };
const used = new Set(), players = [];
const prev = {}; // 2025 players, some of whom return in 2026 so Health shows retention
PLAN.b.forEach(([sport, div, br, price, n25, n26, teams]) => {
  const make = (year, n, returning) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let p;
      if (returning && returning.length && i < returning.length * 0.62) p = { ...returning[i], year };
      else { let f, l, k; do { f = pick(FIRST); l = pick(LAST); k = `${f}|${l}|${sport}`; } while (used.has(k)); used.add(k); p = { year, first: f, last: l, sport, division: div, allstar_division: br, gender: sport === 'Softball' ? 'F' : (rnd() < 0.12 ? 'F' : 'M'), city: pick(CITIES), team: '', amount: price }; }
      p.amount = price + (rnd() < 0.15 ? -20 : 0); p.team = year === 2026 && teams.length ? teams[i % teams.length] : '';
      out.push(p);
    }
    return out;
  };
  const a = make(2025, n25), b = make(2026, n26, a);
  players.push(...a, ...b);
});
const DATA_JS = `const INITIAL_DATA = ${JSON.stringify(players)};`;
module.exports = { players };
if (require.main !== module) return;

(async () => {
  const srv = await serve(APP_DIR, 'lybs-dashboard'), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09', time: '2026-11-09T10:00:00-05:00' });
  await page.route(/^(?!http:\/\/(localhost|127\.0\.0\.1)).*/, r => r.abort()); // nothing leaves the machine
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.continue());     // generic web fonts only
  await page.route(/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(CHART) }));
  await page.route(/\/data\.js(\?|$)/, r => r.fulfill({ contentType: 'text/javascript', body: DATA_JS }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lll_users', JSON.stringify([{ id: 1, username: 'taylor_admin', pwHash: 'x' }]));
      localStorage.setItem('lll_admin_username', 'taylor_admin');
      sessionStorage.setItem('lll_session', JSON.stringify({ username: 'taylor_admin' }));
    } catch (e) {}
  });
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 160)));
  await page.goto(srv.base); await page.waitForTimeout(3000);
  const tab = async t => { await page.evaluate(t => switchTab(t), t); await page.waitForTimeout(1000); await page.evaluate(() => window.scrollTo(0, 0)); };
  const scrollToText = async (re, off = 20) => { await page.evaluate(([src, off]) => { const r = new RegExp(src, 'i'); const e = [...document.querySelectorAll('h1,h2,h3,h4,.card-title,.section-title,div,span')].filter(x => x.offsetParent && r.test(x.textContent.trim()) && x.textContent.trim().length < 60 && x.children.length < 3)[0]; if (e) { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -off); } }, [re, off]); await page.waitForTimeout(500); };
  await tab('overview');
  await shot(page, ID, 1, 'Registrations, revenue and growth for the season at a glance');
  await page.evaluate(() => window.scrollBy(0, 760)); await page.waitForTimeout(900);
  await shot(page, ID, 2, 'Charts of who signed up, by sport, division and town');
  await tab('yoy');
  await shot(page, ID, 3, 'See every sport and division compared to last year');
  await tab('health'); await page.waitForTimeout(600);
  await page.evaluate(() => { let e = [...document.querySelectorAll('div')].filter(x => /from Lunenburg/.test(x.textContent) && x.children.length < 2).pop(); while (e && e.offsetHeight < 280) e = e.parentElement; if (e) e.style.display = 'none'; }); // hard-coded real town name in the app copy
  await shot(page, ID, 4, 'League health: how many families came back this year');
  await tab('teams'); await page.locator('#tab-teams').getByText('Hawks', { exact: true }).first().click(); await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy(0, 560)); await page.waitForTimeout(400);
  await shot(page, ID, 5, 'Every team, its roster and how many players returned');
  await tab('allstars');
  await shot(page, ID, 6, 'All-Stars eligibility by age bracket, worked out for you');
  finish(ID);
  await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
