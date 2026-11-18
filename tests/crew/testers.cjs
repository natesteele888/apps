// Virtual testers ("the Nate crew"): open every game day app like a first-time user on two phones,
// tap every button once, and write down what breaks, looks off or does nothing.
// Safe by design: every request that is not to this machine is blocked, so nothing ever reaches
// Firebase, ESPN or any live data. Fresh browser storage per app, nothing real typed anywhere.
// Usage: node tests/crew/testers.cjs <serveRoot> <outDir>   (serveRoot holds apps/, and optionally asl-bengals/, lybs-ballclub/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.argv[2] || '.'); const OUT = path.resolve(process.argv[3] || 'crew-out');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const PAGES = [
  ['Fairway', 'apps/fairway/index.html'], ['Dugout / Walk-Up', 'apps/walkup/index.html'], ['Walk-Up field', 'apps/walkup/field.html'],
  ['Walk-Up parent page', 'apps/walkup/send.html'], ['Tournament Pack', 'apps/tournamentpack/index.html'], ['Scoreboard', 'apps/scoreboard/index.html'],
  ['Practice Clock', 'apps/practiceclock/index.html'], ['Play Board', 'apps/playboard/index.html'], ['Film Lite', 'apps/filmlite/index.html'],
  ['Locker', 'apps/locker/index.html'], ['Eight Count', 'apps/eightcount/index.html'], ['Where Do I Go?', 'apps/situations/index.html'],
  ['Bengals coaching app', 'asl-bengals/dev2/index.html'], ['Bengals Play Builder', 'asl-bengals/dev2/playbuilder.html'],
  ['Bengals Stat Keeper', 'asl-bengals/dev2/stat-keeper.html'], ['Bengals Game Wizard', 'asl-bengals/dev2/game-wizard.html'],
].filter(([, p]) => fs.existsSync(path.join(ROOT, p)) || (console.log('skip (not checked out):', p), false));
const PHONES = {
  phone: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' },
  oldphone: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-J737V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0 Mobile Safari/537.36' },
};
// Buttons a tester never presses: anything that would wipe, send, pay, sign in or leave.
const SKIP = /delete|remove|erase|wipe|reset|clear all|start over|sign ?in|sign ?out|log ?out|google|pay|buy|send|email|text |share|install|leave|quit|end (game|round|tournament)|unlink|forget/i;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
async function probe(page) {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3; };
    const els = [...document.querySelectorAll('button, [role=button], a[href], input:not([type=hidden]), select, textarea')].filter(vis);
    const label = e => (e.getAttribute('aria-label') || e.innerText || e.value || e.title || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const small = els.filter(e => { const r = e.getBoundingClientRect(); return (e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') && (r.width < 36 || r.height < 36) && !(e.closest('label')); }).map(e => { const r = e.getBoundingClientRect(); return `${label(e) || e.className || e.tagName} (${Math.round(r.width)}x${Math.round(r.height)})`; });
    const noname = els.filter(e => (e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') && !label(e) && !e.querySelector('img[alt]')).map(e => e.outerHTML.slice(0, 80));
    const sw = document.documentElement.scrollWidth; const wide = sw > innerWidth + 1 ? [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 4).map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]} right=${Math.round(e.getBoundingClientRect().right)}`) : [];
    const clipped = [...document.querySelectorAll('button, h1, h2, h3, .title, label')].filter(e => vis(e) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis').slice(0, 5).map(e => label(e));
    const tiny = [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2) && vis(e) && parseFloat(getComputedStyle(e).fontSize) < 11).slice(0, 5).map(e => `"${e.innerText.trim().slice(0, 25)}" ${getComputedStyle(e).fontSize}`);
    return { title: document.title, overflowPx: sw - innerWidth, wide, small: small.slice(0, 12), smallCount: small.length, noname: noname.slice(0, 6), clipped, tiny, buttons: els.filter(e => e.tagName === 'BUTTON' || e.getAttribute('role') === 'button').length, text: document.body.innerText.trim().slice(0, 200) };
  });
}
async function testPage(browser, name, rel, phoneKey, port) {
  const ctx = await browser.newContext({ ...PHONES[phoneKey], serviceWorkers: 'block', acceptDownloads: true, permissions: [] });
  const blocked = new Set();
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue(); blocked.add(u.hostname); return r.abort(); });
  const page = await ctx.newPage(); const errors = []; const failed = [];
  page.on('pageerror', e => errors.push('crash: ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED|firebase|firestore|googleapis|gstatic|install\.js|health\.js/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() === 404 && new URL(r.url()).hostname === '127.0.0.1') failed.push(new URL(r.url()).pathname); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const url = `http://127.0.0.1:${port}/${rel}`; const t0 = Date.now();
  try { await page.goto(url, { waitUntil: 'load', timeout: 20000 }); } catch (e) { errors.push('load: ' + e.message.split('\n')[0]); }
  await page.waitForTimeout(1200);
  const loadMs = Date.now() - t0;
  const slug = (name + '-' + phoneKey).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.screenshot({ path: path.join(OUT, 'shots', slug + '.png') }).catch(() => {});
  const first = await probe(page).catch(e => ({ err: e.message }));
  // Tap every button once (fresh load each time so one sheet can't hide the next button).
  const labels = await page.evaluate(() => [...document.querySelectorAll('button, [role=button]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; }).map(e => (e.getAttribute('aria-label') || e.innerText || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40))).catch(() => []);
  const dead = [], crashedOn = [], tapped = [], skipped = [];
  const uniq = [...new Set(labels)].filter(Boolean).slice(0, 30);
  for (const lab of uniq) {
    if (SKIP.test(lab)) { skipped.push(lab); continue; }
    const before = errors.length;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 }); await page.waitForTimeout(300);
      const loc = page.locator('button, [role=button]').filter({ hasText: lab }).first();
      const target = (await loc.count()) ? loc : page.locator(`[aria-label="${lab.replace(/"/g, '\\"')}"]`).first();
      if (!(await target.count()) || !(await target.isVisible())) continue;
      await page.evaluate(() => { window.__muts = 0; new MutationObserver(m => { window.__muts += m.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); });
      const href0 = page.url();
      await target.click({ timeout: 3000 });
      await page.waitForTimeout(450);
      const muts = await page.evaluate(() => window.__muts).catch(() => 1);
      tapped.push(lab);
      if (!muts && page.url() === href0) dead.push(lab);
      if (errors.length > before) crashedOn.push(`${lab} -> ${errors[errors.length - 1]}`);
    } catch (e) { if (!/intercept|not visible|timeout/i.test(e.message)) crashedOn.push(`${lab} -> ${e.message.split('\n')[0].slice(0, 120)}`); }
  }
  await ctx.close();
  return { app: name, page: rel, phone: phoneKey, loadMs, errors: [...new Set(errors)].slice(0, 12), missingFiles: [...new Set(failed)].slice(0, 8), outsideHostsBlocked: [...blocked], first, tapped: tapped.length, skipped, dead, crashedOn };
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const results = [];
  for (const [name, rel] of PAGES) for (const ph of Object.keys(PHONES)) {
    const r = await testPage(browser, name, rel, ph, port).catch(e => ({ app: name, page: rel, phone: ph, harness: e.message }));
    results.push(r); console.log(`${name} [${ph}]: errors=${(r.errors || []).length} dead=${(r.dead || []).length} overflow=${r.first && r.first.overflowPx} small=${r.first && r.first.smallCount}`);
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'testers.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 1));
  console.log('CREW-JSON-BEGIN'); console.log(JSON.stringify(results)); console.log('CREW-JSON-END');
})();
