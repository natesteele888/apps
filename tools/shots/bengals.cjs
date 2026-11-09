// Bengals Coaching App screenshots with made-up demo data. See lib.cjs.
// The app talks to Firebase through plain REST (Identity Toolkit + Realtime Database), so those calls are answered
// by a tiny in-memory fake here: nothing real is read or written. Signal cards are drawn pictures (the repo's own card
// pictures are real photos, which never go in a screenshot).
const fs = require('fs'), path = require('path');
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/ASL-Bengals';

const SEED = require('./bengals-seed.cjs')(APP_DIR);

function makeDb(seed) {
  const root = JSON.parse(JSON.stringify(seed));
  const walk = (p, create) => { let o = root; for (const k of p) { if (o[k] == null || typeof o[k] !== 'object') { if (!create) return undefined; o[k] = {}; } o = o[k]; } return o; };
  return {
    get(p) { if (!p.length) return root; const par = walk(p.slice(0, -1)); return par == null ? null : (par[p[p.length - 1]] ?? null); },
    set(p, v) { if (!p.length) return; const par = walk(p.slice(0, -1), true); if (v === null) delete par[p[p.length - 1]]; else par[p[p.length - 1]] = v; },
    patch(p, v) { const cur = this.get(p); const o = (cur && typeof cur === 'object') ? cur : {}; Object.assign(o, v); this.set(p, o); },
  };
}

async function wire(page, db) {
  // Anything else off-site is not needed (registered first: Playwright tries the newest route first).
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => route.abort());
  await page.route(/^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, route => {
    const u = route.request().url();
    const body = /securetoken/.test(u)
      ? { id_token: 'fake-id', refresh_token: 'fake-rt', expires_in: '3600' }
      : { idToken: 'fake-id', refreshToken: 'fake-rt', expiresIn: '3600', localId: 'fake-uid' };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route(/^https:\/\/[a-z0-9-]+\.firebaseio\.com\//, route => {
    const req = route.request(), u = new URL(req.url());
    const p = decodeURIComponent(u.pathname).replace(/\.json$/, '').split('/').filter(Boolean);
    const m = req.method(); let out = null;
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    if (m === 'GET') out = db.get(p);
    else if (m === 'PUT') { db.set(p, body); out = body; }
    else if (m === 'PATCH') { db.patch(p, body); out = body; }
    else if (m === 'POST') { const k = '-N' + Math.random().toString(36).slice(2, 12); db.set([...p, k], body); out = { name: k }; }
    else if (m === 'DELETE') { db.set(p, null); }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  // Signal card pictures: drawn gestures instead of the repo's real photos.
  const FIRST = { 1: '☝️', 2: '🤟', 3: '🖐️', 4: '✊', 5: '✌️', 6: '🖖' };
  const G = ['👆', '👉', '👈', '🤞', '👊', '🤙', '👌', '✊', '🤟', '✌️', '☝️', '🖐️'];
  const C = ['#b45309', '#c2410c', '#9a3412', '#1f2937', '#7c2d12', '#374151'];
  await page.route(/\/assets\/cards\/(\d+)\.png/, route => {
    const n = +/cards\/(\d+)/.exec(route.request().url())[1];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="277" height="339" viewBox="0 0 277 339"><rect width="277" height="339" fill="${C[n % C.length]}"/><circle cx="138" cy="90" r="34" fill="#f3c9a0"/><rect x="88" y="130" width="100" height="120" rx="22" fill="#fff"/><text x="138" y="215" font-size="86" text-anchor="middle">${FIRST[n] || G[n % G.length]}</text></svg>`;
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
}

async function boot(role = process.env.ROLE || 'coach') {
  const srv = await serve(APP_DIR, 'ASL-Bengals'), br = await launch();
  const db = makeDb(SEED);
  const { page } = await phone(br, { today: '2026-10-14', time: '2026-10-14T17:30:00' });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await wire(page, db);
  await page.addInitScript(([role]) => {
    try {
      localStorage.setItem('bengalsPlaybookAuthed', '1');
      localStorage.setItem('bengalsUserRole', role); if (role === 'coach') localStorage.setItem('bengalsCoachSession', '1');
      localStorage.setItem('bengalsGateSession', JSON.stringify({ refreshToken: 'fake-rt', kind: 'coach' }));
      localStorage.setItem('bengalsPlayerSession', JSON.stringify(role === 'coach' ? { playerId: 'p-taylor', name: 'Coach Taylor' } : { playerId: 'p-riley', name: 'Riley', position: 'QB' }));
      localStorage.setItem('bengalsWhatsNewSeen_v2', '1'); localStorage.setItem('aslBengalsPcTutorialSeen', '1'); localStorage.setItem('bengalsPosSkipped_p-taylor', '1'); localStorage.setItem('bengalsPosSkipped_p-riley', '1');
    } catch (e) {}
  }, [role]);
  await page.goto(srv.base + 'dev2/index.html');
  await page.waitForTimeout(5000);
  return { page, br, srv, db };
}
module.exports = { boot };

const FREEZE = `.gcTickerTrack, .gcTickerTrack * { animation: none !important; transform: none !important; }`;
async function settle(page, ms = 600) { await page.addStyleTag({ content: FREEZE }).catch(() => {}); await page.waitForTimeout(ms); }

if (require.main === module) (async () => {
  // ---- Player screens (signed in as "Riley") ----
  let env = await boot('player');
  let { page } = env;
  await page.locator('[data-mode=quiz]').click(); await page.waitForTimeout(1200);
  await page.evaluate(() => {   // answer the signal correctly so the green "Correct" shows
    const img = [...document.querySelectorAll('#quizMode img')].find(i => /cards\/(\d+)/.test(i.src));
    const c = window.ALL_CARDS.find(c => c.id === +/cards\/(\d+)/.exec(img.src)[1]);
    const m = c.meaning.toUpperCase(), bs = [...document.querySelectorAll('#quizMode .seq-choice')];
    (bs.find(b => b.textContent.trim().toUpperCase() === m) || bs.find(b => m.includes(b.textContent.trim().toUpperCase())) || bs[0]).click();
  });
  await settle(page);
  await shot(page, 'bengals', 1, 'Quiz yourself on the hand signals before game day');
  await page.locator('[data-mode=study]').click(); await settle(page, 1000);
  await shot(page, 'bengals', 2, 'Every signal the coaches use, in one study guide');
  await env.br.close(); env.srv.stop();

  // ---- Coach screens (signed in as "Coach Taylor") ----
  env = await boot('coach'); page = env.page;
  await page.locator('#playCallsTabBtn').click(); await page.waitForTimeout(500);
  await page.locator('.formation-card').first().click(); await page.waitForTimeout(1200);
  await page.locator('.play-tile').first().click(); await settle(page, 1200);
  await shot(page, 'bengals', 3, 'Every play drawn out, with direction and motion toggles');
  await page.locator('#thisweekSectionBtn').click(); await settle(page, 1800);
  await shot(page, 'bengals', 4, 'This Week: the next game and practices at a glance');
  await page.locator('#scheduleSectionBtn').click(); await settle(page, 1800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'bengals', 5, 'Schedule with results, times and fields for every game');
  await page.locator('#standingsSectionBtn').click(); await settle(page, 1800);
  await shot(page, 'bengals', 6, 'League standings with power rankings and playoff tools');
  await env.br.close(); env.srv.stop();
  finish('bengals');
})().catch(e => { console.error(e); process.exit(1); });
