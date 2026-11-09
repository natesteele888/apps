// Eight Count screenshots with made-up demo data. See lib.cjs.
const { serve, chromium, phone, shot, finish } = require('./lib.cjs');
(async () => {
  const srv = await serve(), br = await chromium.launch({ args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await phone(br, { ctx: { permissions: ['camera', 'microphone'] } });
  // a made-up camera picture: a gym-floor gradient with a few cartoon figures, so no real video is involved
  await page.addInitScript(() => {
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const real = await gum(c); if (!c || !c.video) return real;
      const cv = document.createElement('canvas'); cv.width = 720; cv.height = 1280; const x = cv.getContext('2d');
      const draw = () => { const g = x.createLinearGradient(0, 0, 0, 1280); g.addColorStop(0, '#3b3f7a'); g.addColorStop(.5, '#6b5b95'); g.addColorStop(.51, '#c98a4b'); g.addColorStop(1, '#a9692f'); x.fillStyle = g; x.fillRect(0, 0, 720, 1280);
        x.font = '170px serif'; x.textAlign = 'center'; ['🤸', '🙌', '🤸', '🙆'].forEach((e, i) => x.fillText(e, 110 + i * 165, 600 + (i % 2) * 40)); requestAnimationFrame(draw); };
      draw();
      const out = cv.captureStream(30); real.getAudioTracks().forEach(t => out.addTrack(t)); return out;
    };
  });
  await page.goto(srv.base + 'eightcount/'); await page.waitForSelector('.rt');
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('eightcount.routines')); r[0].name = 'Game-day cheer'; localStorage.setItem('eightcount.routines', JSON.stringify(r)); });
  await page.reload(); await page.waitForSelector('.rt'); await page.waitForTimeout(400);
  const shots = {};
  // 1: practice running on the next move
  await page.click('.rt'); await page.waitForSelector('.go3');
  await page.click('[data-act="practice"]'); await page.waitForSelector('#player'); await page.waitForTimeout(300);
  await page.click('[data-p="start"]'); await page.waitForTimeout(8300);
  await shot(page, 'eightcount', 1, 'A big count, the move to hit, and what comes next');
  await page.goBack(); await page.waitForSelector('#player', { state: 'detached' }); await page.waitForTimeout(400);
  // 2: the routine and its count grid
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'eightcount', 2, 'Write the routine in 8-counts, one move on every beat');
  // 3: the sheet for editing one count
  await page.click('.cell[data-si="0"][data-ci="1"][data-b="4"]'); await page.waitForSelector('#cf'); await page.waitForTimeout(500);
  await shot(page, 'eightcount', 3, 'Tap a count and pick the move, or type your own');
  await page.goBack(); await page.waitForSelector('#sheetWrap', { state: 'hidden' }); await page.waitForTimeout(300);
  // 4: slow it down to learn it
  await page.click('[data-act="practice"]'); await page.waitForSelector('#player'); await page.click('[data-rate="50"]'); await page.waitForTimeout(400);
  await shot(page, 'eightcount', 4, 'Slow it to 50% to learn it, then build back up to full speed');
  await page.goBack(); await page.waitForSelector('#player', { state: 'detached' }); await page.waitForTimeout(300);
  // 5: lock in together
  await page.click('[data-act="lock"]'); await page.waitForSelector('#player'); await page.waitForTimeout(500);
  await shot(page, 'eightcount', 5, 'Lock every phone onto one clock so the team counts off together');
  await page.goBack(); await page.waitForSelector('#player', { state: 'detached' }); await page.waitForTimeout(300);
  // 6: record
  await page.click('[data-act="record"]'); await page.waitForSelector('#player'); await page.waitForTimeout(1500);
  await shot(page, 'eightcount', 6, 'Record a take with the count on top');
  finish('eightcount'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
