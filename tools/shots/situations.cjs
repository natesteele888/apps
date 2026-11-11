// Where Do I Go? screenshots. See lib.cjs. The app runs LYBS Ballclub's Situations trainer from /lybs-ballclub/,
// so this serves a copy of lybs-ballclub next to this repo (set BALLCLUB=/path/to/lybs-ballclub, default ../lybs-ballclub)
// or, without one, reads Ballclub's published files. No names or data: the trainer has none.
const { launch, phone, shot, finish, ROOT } = require('./lib.cjs');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const BALLCLUB = process.env.BALLCLUB || path.resolve(ROOT, '..', 'lybs-ballclub');
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  const port = await freePort(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-sit-'));
  fs.symlinkSync(ROOT, path.join(tmp, 'apps'));
  const local = fs.existsSync(path.join(BALLCLUB, 'js', 'situations.js'));
  if (local) fs.symlinkSync(BALLCLUB, path.join(tmp, 'lybs-ballclub'));
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: tmp, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  const br = await launch();
  const { page } = await phone(br);
  await page.route(/natesteele888\.github\.io\/apps\/(install|health)\.js/, r => r.abort());
  if (!local) await page.route(/\/lybs-ballclub\//, async r => {
    const res = await fetch('https://natesteele888.github.io' + new URL(r.request().url()).pathname);
    r.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || undefined });
  });
  await page.goto(`http://localhost:${port}/apps/situations/`); await page.waitForSelector('#sitSvg'); await page.waitForTimeout(500);
  const run = async ms => { await page.locator('#sitBtnRun').click(); await page.waitForTimeout(ms); };
  // runners on first and third, one out, a grounder, seen from the shortstop
  await page.locator('[data-base="1"]').click(); await page.locator('[data-base="3"]').click(); await page.locator('[data-out="0"]').click();
  await page.locator('[data-me="SS"]').click(); await page.waitForTimeout(300);
  await run(1700);
  await shot(page, 'situations', 1, 'Runners, outs and the hit, then watch all nine fielders move');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const r = document.getElementById('sitBigJobBox').getBoundingClientRect(); window.scrollBy(0, r.top - 330); }); await page.waitForTimeout(300);
  await shot(page, 'situations', 2, 'Your job on the play, in plain words, for your position');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-me=""]').click(); await page.locator('[data-tt="air"]').click();
  await page.locator('[data-base="2"]').click(); await page.waitForTimeout(300); await run(1500);
  await shot(page, 'situations', 3, 'Fly balls, base hits and bunts too, with cutoffs and relays');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-view="quiz"]').click(); await page.waitForTimeout(500);
  await page.locator('.sitQuizOpt').first().click(); await page.waitForTimeout(500);
  await shot(page, 'situations', 4, 'Quiz yourself on numbers, notation and where you go');
  await page.locator('[data-view="builder"]').click(); await page.locator('#sitFundamentalsBtn').click(); await page.waitForTimeout(400);
  await shot(page, 'situations', 5, 'The few rules that cover almost every ball, in plain words');
  finish('situations'); await br.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
