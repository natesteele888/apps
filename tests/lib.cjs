// Shared helpers for the app tests: static server, browser launch, small utilities.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
// Google Chrome on the Mac; anywhere else (a cloud session, CI) Playwright's own Chromium.
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = require('fs').existsSync(MAC_CHROME) ? MAC_CHROME : undefined;
function freePort() { return new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); }); }
async function startServer(app = 'locker') {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'serve'), stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/apps/${app}/manifest.json`); if (r.ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  return { port, url: `http://localhost:${port}/apps/${app}/`, stop: () => proc.kill() };
}
async function launch() {
  return chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
}
// New context at phone size. install.js and fonts are blocked (they are external); icons 404 and are ignored.
async function newPage(browser, opts = {}) {
  const ctx = opts.context || await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: opts.sw ? 'allow' : 'block', reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference', ...(opts.ctx || {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (/Failed to load resource/.test(t)) return; errors.push('console: ' + t); } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route(/natesteele888\.github\.io\/apps\/(install|health)\.js/, r => r.abort());
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (opts.today) await page.addInitScript(d => { window.__today = d; }, opts.today);
  return { ctx, page, errors };
}
module.exports = { chromium, launch, startServer, newPage, SHOTS, ROOT, CHROME };
