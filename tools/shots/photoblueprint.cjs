// Photo Blueprint screenshots with made-up demo data. See lib.cjs.
// Pictures are drawn in the page (gradients and shapes, no photos of anyone); map tiles are drawn locally (no OpenStreetMap traffic).
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const { execFileSync } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const tileCache = {};
function tile(z, x, y) { // a quiet street-map look: pale ground, a few roads, a park and some water
  const k = z + '/' + x + '/' + y; if (tileCache[k]) return tileCache[k];
  const out = path.join(os.tmpdir(), 'pbtile-' + z + '-' + x + '-' + y + '.png');
  execFileSync('python3', ['-c', `
import sys,random
from PIL import Image,ImageDraw
z,x,y=map(int,sys.argv[1:4]); r=random.Random(z*7919+x*104729+y*1299709)
im=Image.new('RGB',(256,256),(242,240,236)); d=ImageDraw.Draw(im)
for _ in range(2): a=r.randint(0,170); b=r.randint(0,170); d.rectangle([a,b,a+r.randint(30,60),b+r.randint(30,60)],fill=(228,234,214))
for _ in range(4):
  p=r.randint(20,236); w=r.choice([5,7,9]); a=(p,0,p+r.randint(-30,30),256); c=(0,p,256,p+r.randint(-30,30))
  for L in (a,c): d.line([(L[0],L[1]),(L[2],L[3])],fill=(150,150,150),width=w+3)
  for L in (a,c): d.line([(L[0],L[1]),(L[2],L[3])],fill=(255,255,255),width=w)
for _ in range(3): p=r.randint(10,246); d.line([(p,0),(p+r.randint(-60,60),256)],fill=(190,190,190),width=2)
im.save(sys.argv[4])`, z, x, y, out]);
  return (tileCache[k] = fs.readFileSync(out));
}

(async () => {
  const srv = await serve(), br = await launch();
  const { page } = await phone(br, { today: '2026-11-09' });
  await page.route(/natesteele888\.github\.io|googleapis|gstatic|firebase|firestore|nominatim/, r => r.abort());
  await page.route(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url()); r.fulfill({ contentType: 'image/png', body: tile(+m[1], +m[2], +m[3]) }); });
  await page.addInitScript(() => { try { localStorage.setItem('sp.feed', '"mine"'); } catch (e) {} });
  await page.goto(srv.base + 'photoblueprint/'); await page.waitForSelector('#nav'); await page.waitForTimeout(500);

  await page.evaluate(async () => {
    // pictures: simple landscapes drawn on a canvas
    const scene = (w, h, sky, sun, hill1, hill2, kind) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, h * .7); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = sun; x.beginPath(); x.arc(w * (kind % 3 ? .7 : .3), h * .38, h * .09, 0, 7); x.fill();
      x.fillStyle = hill2; x.beginPath(); x.moveTo(0, h * .62); for (let i = 0; i <= 8; i++) x.lineTo(w * i / 8, h * (.5 + .08 * Math.sin(i * 1.3 + kind))); x.lineTo(w, h); x.lineTo(0, h); x.fill();
      x.fillStyle = hill1; x.beginPath(); x.moveTo(0, h * .75); for (let i = 0; i <= 8; i++) x.lineTo(w * i / 8, h * (.68 + .06 * Math.sin(i * 2.1 + kind * 2))); x.lineTo(w, h); x.lineTo(0, h); x.fill();
      if (kind === 1) { x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, h * .6, w, h * .08); }
      if (kind === 3) { x.fillStyle = '#222'; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(w * (.3 + i * .12), h * .83, 28, 7, 0, 0, 7); x.fill(); } }
      if (kind === 4) { x.fillStyle = '#3b2a24'; x.fillRect(w * .4, h * .55, w * .2, h * .18); x.beginPath(); x.moveTo(w * .38, h * .55); x.lineTo(w * .5, h * .44); x.lineTo(w * .62, h * .55); x.fill(); }
      return c; };
    const url = (c, q) => c.toDataURL('image/jpeg', q);
    const P = [
      ['#f6b26b', '#fde9c9', '#fff1b8', '#3d5a4a', '#6f8f6a'], ['#9fb7c9', '#e3ecf2', '#fffbe6', '#51636f', '#7d93a1'], ['#2b3a67', '#e58f65', '#ffe8a3', '#1c2a24', '#3a4d44'],
      ['#7fb6d8', '#dff1fa', '#fffbe6', '#2f5f78', '#4d8ca8'], ['#1f2e57', '#6b86c4', '#f3f0ff', '#18231e', '#2c3e36'], ['#e08f6b', '#ffd9b0', '#fff0c8', '#4a3b34', '#85604f']];
    const recs = [
      { title: 'Fog over the east pier', kind: 1, posture: 'standing', height: 1.6, camera: 'Fuji X-T4', lens: 'XF 16-55mm f/2.8', focal: 35, sensor: 'apsc', aperture: 8, shutter: 1 / 250, iso: 200, support: 'Handheld', light: 'Overcast', lat: 36.6182, lon: -121.8932, heading: 70, place: 'East pier, north rail', taken: '2026-11-07T07:12', story: 'Fog was sitting right on the water at sunrise. I stood at the end of the rail and waited for a gull to cross the frame.\\n\\nShot a few frames, then dropped the exposure a bit so the pier lights stayed soft.', ig: '', distance: 40 },
      { title: 'Last light on the ridge', kind: 2, posture: 'tripod', height: 1.4, camera: 'Sony A7 III', lens: '70-200mm f/4', focal: 135, sensor: 'ff', aperture: 11, shutter: 0.5, iso: 100, support: 'Tripod', light: 'Golden hour', lat: 36.5801, lon: -121.9407, heading: 255, place: 'Overlook point', taken: '2026-11-05T17:02', story: 'Locked the tripod low on the rock ledge and used a 2 second timer to keep it sharp. The color only lasted about four minutes.', distance: 900 },
      { title: 'Kayaks at dawn', kind: 3, posture: 'kneeling', height: 0.9, camera: 'Canon R6', lens: 'RF 24-105mm f/4', focal: 50, sensor: 'ff', aperture: 5.6, shutter: 1 / 500, iso: 400, support: 'Handheld', light: 'Golden hour', lat: 36.6021, lon: -121.9017, heading: 140, place: 'Boat ramp', taken: '2026-11-02T06:40', story: 'Went down on one knee on the ramp so the kayaks line up with the far shore.' },
      { title: 'Old barn, blue hour', kind: 4, posture: 'monopod', height: 1.6, camera: 'Nikon Z6', lens: '35mm f/1.8', focal: 35, sensor: 'ff', aperture: 2.8, shutter: 1 / 30, iso: 1600, support: 'Monopod', light: 'Blue hour', lat: 36.5655, lon: -121.9102, heading: 15, place: 'County road', taken: '2026-10-28T18:05', story: 'Braced on a monopod for the slow shutter.' },
      { title: 'Puddle reflection', kind: 5, posture: 'prone', height: 0.3, camera: 'iPhone', lens: 'Main camera', focal: 24, sensor: 'phone', aperture: 1.8, shutter: 1 / 120, iso: 80, support: 'Braced', light: 'Mixed', lat: 36.6095, lon: -121.8805, heading: 200, place: 'Market street', taken: '2026-10-24T16:30', story: 'Laid the phone flat on the wet pavement.' },
      { title: 'Rail at golden hour', kind: 0, posture: 'crouching', height: 0.7, camera: 'Fuji X-T4', lens: 'XF 23mm f/2', focal: 23, sensor: 'apsc', aperture: 4, shutter: 1 / 1000, iso: 160, support: 'Handheld', light: 'Golden hour', lat: 36.5901, lon: -121.9250, heading: 300, place: 'Harbor walk', taken: '2026-10-19T17:20', story: 'Crouched to get the rail leading to the sun.' }];
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('photoblueprint', 1); r.onupgradeneeded = () => r.result.createObjectStore('sheets', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = rej; });
    const db = await open();
    const now = Date.now();
    await new Promise(res => { const tx = db.transaction('sheets', 'readwrite'), st = tx.objectStore('sheets');
      recs.forEach((r, i) => { const pal = P[i]; const big = scene(1200, 800, [pal[0], pal[1]], pal[2], pal[3], pal[4], r.kind), small = scene(360, 240, [pal[0], pal[1]], pal[2], pal[3], pal[4], r.kind);
        const kind = r.kind; delete r.kind;
        st.put(Object.assign({ id: 'demo' + i + ['k7qm', 'x2ab', 'p9ze', 'v4nt', 'h6rc', 'w3dj'][i], uid: '', author: 'Riley', public: false, created: now - i * 86400000, updated: now - i * 86400000, thumb: url(small, .8), w: 1200, h: 800, ev: null, filters: '', ig: '', distance: null }, r, { image: url(big, .85), pending: false, published: false })); });
      tx.oncomplete = res; });
  });
  await page.reload(); await page.waitForSelector('.pin, .photopin, .mapmsg:not([hidden])'); await page.waitForTimeout(1500);
  await shot(page, 'photoblueprint', 1, 'Every photo gets a pin at the exact spot it was shot from');
  await page.locator('[data-r=sheets]').click(); await page.waitForSelector('.grid .card img'); await page.waitForTimeout(400);
  await shot(page, 'photoblueprint', 2, 'A contact sheet of your photos, each with how it was shot');
  await page.locator('.card', { hasText: 'Last light on the ridge' }).click(); await page.waitForSelector('.sheet .tb'); await page.waitForTimeout(700);
  await shot(page, 'photoblueprint', 3, 'A blueprint sheet: stance, camera height, gear and exposure');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.specs').getBoundingClientRect().top + window.scrollY - 70)); await page.waitForTimeout(500);
  await shot(page, 'photoblueprint', 4, 'The stance drawn to scale, with every setting in a neat table');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.where').getBoundingClientRect().top + window.scrollY - 40)); await page.waitForTimeout(1200);
  await shot(page, 'photoblueprint', 5, 'A mini map of where you stood, and the story of the shot');
  await page.locator('a.btn', { hasText: 'Edit' }).click(); await page.waitForSelector('#edmap'); await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#edmap').getBoundingClientRect().top + window.scrollY - 120)); await page.waitForTimeout(1200);
  await shot(page, 'photoblueprint', 6, 'Tap the map to drop the pin, then aim where the lens pointed');
  finish('photoblueprint'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
