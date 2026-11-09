// Shared helper for the App Store screenshots. Each app has its own script (tools/shots/<id>.cjs) that opens the app
// with made-up demo data and calls shot() for every screen worth showing. Nothing real ever goes in these scripts:
// fictional first names only (Riley, Jordan, Casey...), example.com emails, teams like Hawks and Comets.
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/shots/<id>.cjs       (needs python3 with Pillow)
//
// Output: store/shots/<id>-<n>.webp at 540x1169 (a 390x844 phone at 2x, same as tools/sync.py makes) plus
// tools/shots/<id>.caps.json, the short caption shown under each screenshot in the store.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), net = require('net'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'store', 'shots');

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

/* Serve a folder (default: this repo) on a free port. Apps in this repo live at <base>/apps/<id>/ like on GitHub Pages. */
async function serve(dir = ROOT, mount = 'apps') {
  const port = await freePort(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-serve-'));
  fs.symlinkSync(dir, path.join(tmp, mount));
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: tmp, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r) break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  return { base: `http://localhost:${port}/${mount}/`, stop: () => { proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

async function launch() { return chromium.launch({ args: ['--no-sandbox'] }); }

/* A phone-sized page. install.js and web fonts are blocked (they are external); service workers are off so seeded data
   is what you see. Pass `today` ("2026-11-09") to fix the date the apps read, and `time` (ISO) to fake the clock. */
async function phone(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'no-preference', ...(opts.ctx || {}) });
  const page = await ctx.newPage();
  await page.route(/natesteele888\.github\.io\/apps\/install\.js/, r => r.abort());
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (opts.today) await page.addInitScript(d => { window.__today = d; }, opts.today);
  if (opts.time) await page.clock.install({ time: new Date(opts.time) });
  return { ctx, page };
}

const caps = {};
/* Save the current screen as store/shots/<id>-<n>.webp. `caption` is the one-line description shown under it in the store. */
async function shot(page, id, n, caption) {
  fs.mkdirSync(OUT, { recursive: true });
  const png = await page.screenshot();
  const tmp = path.join(os.tmpdir(), `shot-${id}-${n}.png`); fs.writeFileSync(tmp, png);
  const dest = path.join(OUT, `${id}-${n}.webp`);
  execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").resize((540,1169),Image.LANCZOS).save(sys.argv[2],"WEBP",quality=78)', tmp, dest]);
  fs.unlinkSync(tmp);
  (caps[id] = caps[id] || {})[n] = caption || '';
  return dest;
}
/* Write the captions file and remove old shots for this app that this run no longer makes (e.g. an old -3 when you now make 2). */
function finish(id) {
  const n = Object.keys(caps[id] || {}).map(Number).sort((a, b) => a - b);
  fs.writeFileSync(path.join(__dirname, `${id}.caps.json`), JSON.stringify({ id, caps: n.map(i => caps[id][i]) }, null, 2) + '\n');
  fs.readdirSync(OUT).filter(f => f.startsWith(id + '-') && /^\d+\.webp$/.test(f.slice(id.length + 1)) && !n.includes(+f.slice(id.length + 1, -5))).forEach(f => fs.unlinkSync(path.join(OUT, f)));
  console.log(`${id}: ${n.length} screenshots`);
}
module.exports = { chromium, serve, launch, phone, shot, finish, ROOT };
