// Photo Blueprint tests: the sheet math, the EXIF reader on JPEGs built right here, and the app in a real browser at phone size.
// No accounts and no network: the cloud scripts and map tiles are blocked, so "Everyone" shows its no-signal card and "Mine" is the phone's own store.
const assert = require('assert');
const C = require('../apps/photoblueprint/core.js');
const X = require('../apps/photoblueprint/exif.js');
const F = require('../apps/photoblueprint/figures.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const path = require('path');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' expected ' + b + ' ± ' + tol + ' got ' + a);

/* ---------- a TIFF/Exif block builder (little- or big-endian) ---------- */
// entries: [tag, type, value]; type 2 string, 3 short(s), 4 long(s), 5 rational pairs [[n,d],...], 10 signed rational pairs.
function buildTiff(le, ifd0, exif, gps) {
  const ifds = [ifd0.concat(exif ? [[0x8769, 4, 0]] : [], gps ? [[0x8825, 4, 0]] : []), exif, gps].filter(Boolean);
  const ifdSize = e => 2 + 12 * e.length + 4;
  const offs = []; let p = 8; for (const e of ifds) { offs.push(p); p += ifdSize(e); }
  let dataOff = p; const data = [];
  const enc = (type, v) => {
    if (type === 2) { const b = Buffer.from(String(v) + '\0', 'latin1'); return [b, b.length]; }
    const arr = Array.isArray(v) && !Array.isArray(v[0]) && type !== 5 && type !== 10 ? v : (Array.isArray(v) ? v : [v]);
    if (type === 3) { const b = Buffer.alloc(2 * arr.length); arr.forEach((x, i) => le ? b.writeUInt16LE(x, 2 * i) : b.writeUInt16BE(x, 2 * i)); return [b, arr.length]; }
    if (type === 4) { const b = Buffer.alloc(4 * arr.length); arr.forEach((x, i) => le ? b.writeUInt32LE(x >>> 0, 4 * i) : b.writeUInt32BE(x >>> 0, 4 * i)); return [b, arr.length]; }
    const pairs = Array.isArray(v[0]) ? v : [v]; const b = Buffer.alloc(8 * pairs.length);
    pairs.forEach(([n, d], i) => { if (type === 5) { le ? b.writeUInt32LE(n, 8 * i) : b.writeUInt32BE(n, 8 * i); le ? b.writeUInt32LE(d, 8 * i + 4) : b.writeUInt32BE(d, 8 * i + 4); } else { le ? b.writeInt32LE(n, 8 * i) : b.writeInt32BE(n, 8 * i); le ? b.writeInt32LE(d, 8 * i + 4) : b.writeInt32BE(d, 8 * i + 4); } });
    return [b, pairs.length];
  };
  const head = Buffer.alloc(8); head.write(le ? 'II' : 'MM', 0, 'latin1'); le ? head.writeUInt16LE(42, 2) : head.writeUInt16BE(42, 2); le ? head.writeUInt32LE(8, 4) : head.writeUInt32BE(8, 4);
  const parts = [head];
  ifds.forEach((entries, k) => {
    const b = Buffer.alloc(ifdSize(entries)); le ? b.writeUInt16LE(entries.length, 0) : b.writeUInt16BE(entries.length, 0);
    entries.forEach(([tag, type, value], i) => {
      const o = 2 + 12 * i; le ? b.writeUInt16LE(tag, o) : b.writeUInt16BE(tag, o); le ? b.writeUInt16LE(type, o + 2) : b.writeUInt16BE(type, o + 2);
      let val = value; if (tag === 0x8769) val = offs[1]; if (tag === 0x8825) val = offs[ifds.length - 1];
      const [bytes, count] = enc(type, val); le ? b.writeUInt32LE(count, o + 4) : b.writeUInt32BE(count, o + 4);
      if (bytes.length <= 4) bytes.copy(b, o + 8); else { le ? b.writeUInt32LE(dataOff, o + 8) : b.writeUInt32BE(dataOff, o + 8); data.push(bytes); dataOff += bytes.length; if (dataOff % 2) { data.push(Buffer.alloc(1)); dataOff++; } }
    });
    parts.push(b);
  });
  return Buffer.concat(parts.concat(data));
}
// Wraps a TIFF block in an Exif APP1 segment right after a JPEG's SOI marker.
function withExif(jpeg, tiff) {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const seg = Buffer.alloc(4); seg.writeUInt16BE(0xffe1, 0); seg.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), seg, payload, jpeg.subarray(2)]);
}
const IFD0 = [[0x010f, 2, 'TestCam'], [0x0110, 2, 'TestCam X-1'], [0x0112, 3, 1]];
const EXIF = [[0x829a, 5, [1, 250]], [0x829d, 5, [8, 1]], [0x8827, 3, 100], [0x9003, 2, '2026:11:08 07:12:00'], [0x9204, 10, [-1, 3]], [0x920a, 5, [35, 1]], [0xa405, 3, 52], [0xa434, 2, 'Test 35mm f/1.8']];
const GPS = [[0x0001, 2, 'N'], [0x0002, 5, [[41, 1], [6, 1], [36, 1]]], [0x0003, 2, 'W'], [0x0004, 5, [[81, 1], [30, 1], [0, 1]]], [0x0011, 5, [42, 1]]];

(async () => {
  /* ---------- core ---------- */
  await test('core: angle of view, crop factor, 35 mm equivalent', () => {
    near(C.fov(24, 'ff'), 73.7, 0.1); near(C.fov(50, 'ff'), 39.6, 0.1); near(C.fov(35, 'apsc'), 37.3, 0.1); near(C.fov(200, 'ff'), 10.3, 0.1);
    eq(C.fov(0, 'ff'), null); eq(C.fov('x', 'ff'), null); eq(C.equivFocal(35, 'apsc'), 53); eq(C.equivFocal(25, 'mft'), 50); eq(C.equivFocal(null, 'ff'), null);
  });
  await test('core: shutter and aperture formats both ways', () => {
    eq(C.fmtShutter(1 / 250), '1/250'); eq(C.fmtShutter(0.5), '1/2'); eq(C.fmtShutter(2), '2s'); eq(C.fmtShutter(30), '30s'); eq(C.fmtShutter(1.5), '1.5s'); eq(C.fmtShutter(0.3), '0.3s'); eq(C.fmtShutter(0), ''); eq(C.fmtShutter(1 / 8000), '1/8000');
    near(C.parseShutter('1/250'), 0.004, 1e-9); near(C.parseShutter('250'), 0.004, 1e-9); eq(C.parseShutter('2s'), 2); eq(C.parseShutter('2'), 2 === C.parseShutter('2') ? 2 : C.parseShutter('2')); eq(C.parseShutter('0.5'), 0.5); eq(C.parseShutter('30"'), 30); eq(C.parseShutter('1/0'), null); eq(C.parseShutter('fast'), null); eq(C.parseShutter(''), null);
    eq(C.fmtAperture(8), 'f/8'); eq(C.fmtAperture(2.8), 'f/2.8'); eq(C.fmtAperture(0), ''); eq(C.parseAperture('f/2.8'), 2.8); eq(C.parseAperture('F11'), 11); eq(C.parseAperture('5.6'), 5.6); eq(C.parseAperture('wide'), null);
    eq(C.fmtFocal(35), '35mm'); eq(C.fmtEV(-0.33), '-0.3 EV'); eq(C.fmtEV(1), '+1 EV'); eq(C.fmtEV(0), '0 EV');
    near(C.apexToShutter(8), 1 / 256, 1e-9); eq(C.apexToAperture(6), 8); eq(C.apexToAperture(3), 2.8);
  });
  await test('core: compass names, coordinates, bearings, distance and the wedge', () => {
    eq(C.headingName(0), 'N'); eq(C.headingName(42), 'NE'); eq(C.headingName(350), 'N'); eq(C.headingName(-90), 'W'); eq(C.headingName(null), ''); eq(C.headingName(202.5), 'SSW');
    eq(C.fmtCoord(41.11, -81.5), '41.11000° N, 81.50000° W'); eq(C.fmtCoord(-33.9, 151.2), '33.90000° S, 151.20000° E'); eq(C.fmtCoord(0, 0), '');
    assert.ok(C.isLatLon(41, -81)); assert.ok(!C.isLatLon(91, 0)); assert.ok(!C.isLatLon(null, 5)); assert.ok(!C.isLatLon(0, 0));
    eq(C.bearing(41, -81, 42, -81), 0); eq(C.bearing(41, -81, 41, -80), 90); eq(C.bearing(0, 0, -1, 0), 180);
    near(C.distance(41, -81, 42, -81), 111195, 50); near(C.distance(0, 0, 0, 1), 111195, 50);
    const [la, lo] = C.destination(41, -81, 90, 1000); near(la, 41, 0.001); near(lo, -81 + 1000 / (111195 * Math.cos(41 * Math.PI / 180)), 0.0002);
    const w = C.wedge(41, -81, 0, 60, 100, 12); eq(w.length, 14); eq(w[0][0], 41); near(w[7][0], 41 + 100 / 111195, 1e-5, 'middle point straight north');
    near(C.bearing(41, -81, w[1][0], w[1][1]), 330, 1); near(C.bearing(41, -81, w[13][0], w[13][1]), 30, 1);
  });
  await test('core: units', () => {
    eq(C.fmtHeight(1.6, 'm'), '1.6 m'); eq(C.fmtHeight(1.6, 'ft'), '5.2 ft'); eq(C.fmtHeight(0.3, 'm'), '0.3 m'); eq(C.fmtHeight(60, 'ft'), '197 ft'); eq(C.fmtHeight(null), '');
    eq(C.fmtDistance(120, 'm'), '120 m'); eq(C.fmtDistance(1500, 'm'), '1.5 km'); eq(C.fmtDistance(120, 'ft'), '394 ft'); eq(C.fmtDistance(2000, 'ft'), '1.2 mi');
  });
  await test('core: new sheet, numbers, cleaning and validation', () => {
    const s = C.newSheet(1000); eq(s.posture, 'standing'); eq(s.height, 1.6); eq(s.created, 1000); assert.ok(/^[a-z0-9]{12}$/.test(s.id));
    eq(C.sheetNo('abcdefgh7k2q'), 'SP-7K2Q'); eq(C.sheetNo(''), 'SP-');
    const ids = new Set(); for (let i = 0; i < 500; i++) ids.add(C.newId()); eq(ids.size, 500);
    const errs = C.validate(s); assert.ok(errs.some(e => /title/i.test(e))); assert.ok(errs.some(e => /pin/i.test(e))); assert.ok(errs.some(e => /photo/i.test(e)));
    Object.assign(s, { title: ' Pier ', lat: 41, lon: -81, thumb: 'data:x', ig: 'https://example.com/p/1' });
    eq(C.validate(s).length, 1, 'bad instagram link'); s.ig = 'https://www.instagram.com/p/abc/'; eq(C.validate(s).length, 0);
    s.posture = 'flying'; eq(C.validate(s).length, 1); s.posture = 'prone';
    const c = C.clean(Object.assign({}, s, { focal: '35', heading: 370, iso: '', junk: 1, story: '  x ' })); eq(c.title, 'Pier'); eq(c.focal, 35); eq(c.heading, 10); eq(c.iso, null); eq(c.junk, undefined); eq(c.story, 'x');
    const line = C.exposureLine({ focal: 35, aperture: 8, shutter: 0.004, iso: 100, ev: -0.3 }); eq(line, '35mm · f/8 · 1/250 · ISO 100 · -0.3 EV'); eq(C.exposureLine({}), '');
    eq(C.fitImage(4000, 3000, 1600).w, 1600); eq(C.fitImage(4000, 3000, 1600).h, 1200); eq(C.fitImage(300, 500, 1600).h, 500);
  });
  await test('core: share links carry the sheet (not the picture) and survive a round trip', () => {
    const s = Object.assign(C.newSheet(), { title: 'Pier at dawn “quotes” ✓', story: 'line one\n\nline two', lat: 41.123456, lon: -81.5, heading: 42, posture: 'kneeling', focal: 35, aperture: 8, shutter: 0.004, iso: 100, thumb: 'data:image/jpeg;base64,AAAA' });
    const code = C.encodeShare(s); assert.ok(/^[A-Za-z0-9_-]+$/.test(code)); assert.ok(!/AAAA/.test(code) && code.length < 400);
    const d = C.decodeShare(code); eq(d.title, s.title); eq(d.story, s.story); eq(d.lat, 41.123456); eq(d.heading, 42); eq(d.posture, 'kneeling'); eq(d.thumb, ''); eq(d.shutter, 0.004);
    eq(C.decodeShare('nope!'), null); eq(C.decodeShare(''), null);
  });
  await test('figures: seven stances, each a real drawing file with a camera height', () => {
    eq(F.names.join(','), 'standing,kneeling,prone,crouching,sitting,tripod,monopod');
    eq(C.POSTURES.map(p => p.id).join(','), F.names.join(','));
    const fs = require('fs');
    for (const n of F.names) {
      const f = F.FIG[n], file = path.join(__dirname, '..', 'apps', 'photoblueprint', 'figures', f.file + '.png');
      assert.ok(fs.existsSync(file), 'drawing exists: ' + file); assert.ok(fs.statSync(file).size > 2000 && fs.statSync(file).size < 60000, n + ' size');
      const m = F.svg(n, { size: 80 }); assert.ok(m.includes('figures/' + f.file + '.png') && m.includes('width:80px') && m.includes('role="img"'), n);
      assert.ok(F.cameraY(n) > 0 && F.cameraY(n) < 120, n + ' camera y ' + F.cameraY(n)); assert.ok(F.label(n).length > 2);
    }
    assert.ok(F.cameraY('prone') > F.cameraY('standing'), 'the lens is lower when laying down');
    assert.ok(F.svg('unknown').includes(F.label('standing'))); eq(F.label('prone'), 'Laying down'); eq(F.label('tripod'), 'Tripod (static)');
  });

  /* ---------- exif ---------- */
  const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x01]), Buffer.from([0xff, 0xd9])]);
  for (const le of [true, false]) await test('exif: reads make, model, lens, exposure, date, GPS and direction (' + (le ? 'little' : 'big') + '-endian)', () => {
    const t = X.parse(withExif(fakeJpeg, buildTiff(le, IFD0, EXIF, GPS)));
    assert.ok(t, 'parsed'); eq(t.Make, 'TestCam'); eq(t.Model, 'TestCam X-1'); eq(t.LensModel, 'Test 35mm f/1.8'); eq(t.Orientation, 1);
    near(t.ExposureTime, 0.004, 1e-9); eq(t.FNumber, 8); eq(t.ISOSpeedRatings, 100); eq(t.DateTimeOriginal, '2026:11:08 07:12:00'); near(t.ExposureBiasValue, -1 / 3, 1e-9); eq(t.FocalLength, 35); eq(t.FocalLengthIn35mmFilm, 52);
    eq(t.GPSLatitudeRef, 'N'); eq(t.GPSLatitude.join(','), '41,6,36'); eq(t.GPSLongitudeRef, 'W'); eq(t.GPSImgDirection, 42);
    const s = C.applyExif(C.newSheet(), t);
    eq(s.camera, 'TestCam X-1'); eq(s.lens, 'Test 35mm f/1.8'); eq(s.aperture, 8); near(s.shutter, 0.004, 1e-9); eq(s.iso, 100); eq(s.focal, 35); eq(s.ev, -0.33); eq(s.taken, '2026-11-08T07:12');
    eq(s.lat, 41.11); eq(s.lon, -81.5); eq(s.heading, 42); eq(s.sensor, 'apsc', '52/35 crop means APS-C');
  });
  await test('exif: typed fields are kept, make is prefixed when the model lacks it, south and west are negative', () => {
    const t = X.parse(withExif(fakeJpeg, buildTiff(true, [[0x010f, 2, 'NIKON CORPORATION'], [0x0110, 2, 'Z 6']], [[0x9201, 10, [8, 1]], [0x9202, 10, [6, 1]]], [[0x0001, 2, 'S'], [0x0002, 5, [[33, 1], [54, 1], [0, 1]]], [0x0003, 2, 'E'], [0x0004, 5, [[151, 1], [12, 1], [0, 1]]]])));
    const s = C.applyExif(Object.assign(C.newSheet(), { camera: 'My body', focal: 50 }), t);
    eq(s.camera, 'My body'); eq(s.focal, 50); near(s.shutter, 1 / 256, 1e-9); eq(s.aperture, 8); eq(s.lat, -33.9); eq(s.lon, 151.2);
    eq(C.applyExif(C.newSheet(), { Make: 'NIKON CORPORATION', Model: 'Z 6' }).camera, 'NIKON Z 6');
    eq(C.applyExif(C.newSheet(), { Make: 'Apple', Model: 'iPhone 15 Pro' }).camera, 'Apple iPhone 15 Pro');
    eq(C.applyExif(C.newSheet(), null).camera, '');
  });
  await test('exif: no block, damaged files and non-JPEGs come back null, never throw', () => {
    eq(X.parse(fakeJpeg), null); eq(X.parse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null); eq(X.parse(new ArrayBuffer(0)), null);
    const good = withExif(fakeJpeg, buildTiff(true, IFD0, EXIF, GPS));
    for (const cut of [4, 12, 20, 40, 80, 120]) { let t; assert.doesNotThrow(() => { t = X.parse(good.subarray(0, cut)); }); assert.ok(t === null || typeof t === 'object'); }
    const bad = Buffer.from(good); bad.write('XX', 12, 'latin1'); eq(X.parse(bad), null, 'bad byte order mark');
    const t = X.parse(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), good.subarray(2)])); eq(t && t.Make, 'TestCam', 'Exif after a JFIF segment');
  });

  /* ---------- the app ---------- */
  const server = await startServer('photoblueprint');
  const browser = await launch();
  const block = async page => { await page.route(/tile\.openstreetmap\.org|www\.gstatic\.com|google\.com\/maps/, r => r.abort()); };
  // A real JPEG (drawn in the browser) with our Exif block spliced in, so the editor can decode it and read the notes.
  async function photo(page, withGps = true) {
    const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#f5b942'); gr.addColorStop(1, '#2b5f9e'); g.fillStyle = gr; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.beginPath(); g.arc(480, 120, 50, 0, 7); g.fill(); return c.toDataURL('image/jpeg', 0.8); });
    const jpeg = Buffer.from(dataUrl.split(',')[1], 'base64');
    return { name: 'pier.jpg', mimeType: 'image/jpeg', buffer: withExif(jpeg, buildTiff(true, IFD0, EXIF, withGps ? GPS : null)) };
  }
  // One browser context for the app tests, so the sheet saved on this "phone" is there for the next test (IndexedDB is per context).
  const shared = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: 'block' });
  await shared.addInitScript(() => { try { if (!localStorage.getItem('sp.feed')) localStorage.setItem('sp.feed', '"mine"'); } catch (e) {} });
  const open = async () => { const r = await newPage(browser, { context: shared }); await block(r.page); return r; };
  async function makeSheet(page, title) {
    await page.goto(server.url + '#new'); await page.waitForSelector('#ed');
    await page.setInputFiles('#file', await photo(page)); await page.waitForSelector('#drop img');
    await page.fill('[data-k="title"]', title); await page.click('#save'); await page.waitForURL(/#s\/[a-z0-9]+$/);
    return page.url().split('#s/')[1];
  }
  let sheetId = null;
  await test('app: map with no signal explains itself; Mine with no sheets points at New', async () => {
    const { page, errors } = await newPage(browser); await block(page);
    await page.goto(server.url); await page.waitForSelector('.leaflet-container');
    await page.waitForSelector('#mapmsg:not([hidden])'); assert.ok(/No signal/.test(await page.textContent('#mapmsg')));
    await page.click('[data-feed="mine"]'); await page.waitForFunction(() => /No pins yet/.test(document.querySelector('#mapmsg')?.textContent || ''));
    const box = await page.locator('.leaflet-control-attribution').boundingBox(); const navTop = (await page.locator('#nav').boundingBox()).y;
    assert.ok(box.y + box.height <= navTop + 1, 'map controls sit above the bottom nav');
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-map-empty.png') });
    await page.click('a[data-r="sheets"]'); await page.waitForSelector('.empty'); assert.ok(/No sheets yet/.test(await page.textContent('.empty')));
    eq(errors.length, 0, errors.join(' | ')); await page.context().close();
  });
  await test('app: a photo\'s camera notes fill the sheet and drop the pin; stance and direction; save', async () => {
    const { page, errors } = await open();
    await page.goto(server.url + '#new'); await page.waitForSelector('#ed');
    await page.setInputFiles('#file', await photo(page));
    await page.waitForSelector('#drop img');
    const chips = await page.textContent('#chips'); assert.ok(/camera/.test(chips) && /aperture/.test(chips) && /where it was taken/.test(chips), chips);
    eq(await page.inputValue('[data-k="camera"]'), 'TestCam X-1'); eq(await page.inputValue('[data-k="lens"]'), 'Test 35mm f/1.8');
    eq(await page.inputValue('#aperture'), 'f/8'); eq(await page.inputValue('#shutter'), '1/250'); eq(await page.inputValue('[data-k="focal"]'), '35'); eq(await page.inputValue('[data-k="iso"]'), '100'); eq(await page.inputValue('[data-k="sensor"]'), 'apsc'); eq(await page.inputValue('[data-k="taken"]'), '2026-11-08T07:12');
    assert.ok(/41\.11000° N, 81\.50000° W/.test(await page.textContent('#coords'))); await page.waitForSelector('.pin.me'); eq(await page.textContent('#hout'), 'NE 42°');
    eq(await page.locator('.leaflet-overlay-pane path').count(), 1, 'the field-of-view wedge is drawn');
    // Submit with no title: the sheet says what is missing.
    await page.click('#save'); await page.waitForSelector('#errs:not([hidden])'); assert.ok(/title/i.test(await page.textContent('#errs')));
    await page.fill('[data-k="title"]', 'Pier at dawn');
    await page.click('.poses label:has(input[value="kneeling"])'); eq(await page.inputValue('#height'), '0.9', 'height follows the stance until typed');
    await page.fill('#height', '1'); await page.click('.poses label:has(input[value="prone"])'); eq(await page.inputValue('#height'), '1', 'typed height sticks');
    await page.click('.poses label:has(input[value="kneeling"])');
    await page.fill('#shutter', '500'); await page.press('#shutter', 'Tab'); eq(await page.inputValue('#shutter'), '1/500');
    await page.fill('[data-k="story"]', 'Got there before the gulls.\n\nWaited for the light to hit the rail.');
    await page.fill('[data-k="ig"]', 'https://www.instagram.com/p/abc123/');
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-editor.png'), fullPage: true });
    await page.click('#save'); await page.waitForURL(/#s\/[a-z0-9]+$/); sheetId = page.url().split('#s/')[1];
    await page.waitForSelector('.sheet .tb');
    const sheet = await page.textContent('.sheet');
    for (const want of ['Pier at dawn', 'SP-', 'NE 42°', 'Kneeling', 'camera at 1 m', 'TestCam X-1', '1/500', 'ISO 100', 'f/8', '35mm (53mm eq.)', '37.3°', 'Got there before the gulls', 'Waited for the light'])
      assert.ok(sheet.includes(want), 'sheet shows ' + want);
    eq(await page.locator('.sheet .photo img:not(.lo)').count(), 1, 'full picture, not the blurred thumb');
    eq(await page.locator('.sheet .story p').count(), 2, 'two paragraphs');
    eq(await page.getAttribute('.sheet a.ig', 'href'), 'https://www.instagram.com/p/abc123/');
    assert.ok((await page.getAttribute('.sheet a[href*="google.com/maps"]', 'href')).includes('41.11,-81.5'));
    await page.waitForSelector('#mini .leaflet-overlay-pane path');
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-sheet.png'), fullPage: true });
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: the saved sheet is on the contact sheet and the map; opening it twice is fine; Back returns', async () => {
    const { page, errors } = await open();
    await page.goto(server.url + '#sheets'); await page.waitForSelector('.card');
    eq(await page.locator('.card').count(), 1); assert.ok(/On this phone only/.test(await page.textContent('.card')));
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-sheets.png') });
    await page.click('.card'); await page.waitForSelector('.sheet #mini.leaflet-container');
    await page.goBack(); await page.waitForSelector('.card'); eq(page.url().split('#')[1], 'sheets');
    await page.click('.card'); await page.waitForSelector('.sheet #mini.leaflet-container');
    await page.click('a[data-r="map"]'); await page.waitForSelector('.pin.me'); eq(await page.locator('.pin').count(), 1);
    await page.click('.pin'); await page.waitForSelector('.pop'); assert.ok(/Pier at dawn/.test(await page.textContent('.pop'))); eq(await page.locator('.pin.sel').count(), 1);
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-map.png') });
    await page.click('.pop'); await page.waitForSelector('.sheet .tb');
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: share copies a link that opens the sheet without the picture; Save a copy starts a new sheet', async () => {
    const { page, errors } = await open();
    await page.addInitScript(() => { window.__copied = ''; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; delete navigator.share; });
    await page.goto(server.url + '#s/' + sheetId); await page.waitForSelector('#share');
    await page.click('#share'); await page.waitForFunction(() => window.__copied);
    const url = await page.evaluate(() => window.__copied); assert.ok(url.startsWith('https://natesteele888.github.io/apps/photoblueprint/#s='), url);
    await page.goto(server.url + url.slice(url.indexOf('#'))); await page.waitForSelector('.sheet .tb');
    const t = await page.textContent('.sheet'); assert.ok(t.includes('Pier at dawn') && t.includes('picture stays with its photographer') && t.includes('Kneeling'));
    eq(await page.locator('#del').count(), 0, 'a shared sheet has no delete');
    await page.click('#copy'); await page.waitForSelector('#ed'); eq(await page.inputValue('[data-k="title"]'), 'Pier at dawn'); eq(await page.inputValue('#shutter'), '1/500');
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: edit keeps the picture and changes the title; a new photo without GPS keeps the pin', async () => {
    const { page, errors } = await open();
    await page.goto(server.url + '#edit/' + sheetId); await page.waitForSelector('#drop img');
    await page.fill('[data-k="title"]', 'Pier at dawn, take two');
    await page.setInputFiles('#file', await photo(page, false)); await page.waitForSelector('#chips span');
    assert.ok(/41\.11000° N/.test(await page.textContent('#coords')), 'pin kept');
    await page.click('#save'); await page.waitForURL(/#s\//); await page.waitForSelector('.sheet .tb');
    assert.ok((await page.textContent('.sheet .tb')).includes('Pier at dawn, take two')); eq(await page.locator('.sheet .photo img').count(), 1);
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: Me: paper theme, feet, backup file, restore adds nothing twice', async () => {
    const { page, errors } = await open();
    await page.goto(server.url + '#me'); await page.waitForSelector('[data-theme="paper"]');
    await page.click('[data-theme="paper"]'); eq(await page.getAttribute('html', 'data-theme'), 'paper');
    await page.click('[data-units="ft"]'); await page.waitForSelector('[data-units="ft"][aria-pressed="true"]');
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-me-paper.png') });
    await page.goto(server.url + '#s/' + sheetId); await page.waitForSelector('.sheet .tb'); assert.ok((await page.textContent('.sheet')).includes('camera at 3.3 ft'));
    await page.screenshot({ path: path.join(SHOTS, 'photoblueprint-sheet-paper.png'), fullPage: true });
    await page.goto(server.url + '#me'); await page.waitForSelector('#export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    const file = await dl.path(); const j = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    eq(j.app, 'photoblueprint'); eq(j.sheets.length, 1); assert.ok(j.sheets[0].image.startsWith('data:image/jpeg')); eq(j.sheets[0].title, 'Pier at dawn, take two');
    await page.setInputFiles('#import', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
    await page.waitForFunction(() => /Nothing new/.test(document.querySelector('#toast').textContent));
    j.sheets[0].id = 'restored0001'; j.sheets[0].title = 'Restored';
    await page.setInputFiles('#import', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
    await page.waitForFunction(() => /1 sheet restored/.test(document.querySelector('#toast').textContent));
    await page.goto(server.url + '#sheets'); await page.waitForSelector('.card'); eq(await page.locator('.card').count(), 2);
    await page.goto(server.url + '#me'); await page.click('[data-theme="blueprint"]'); await page.click('[data-units="m"]');
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: delete asks twice, then the sheet is gone', async () => {
    const { page, errors } = await open();
    await page.goto(server.url + '#s/restored0001'); await page.waitForSelector('#del');
    await page.click('#del'); assert.ok(/Really/.test(await page.textContent('#del'))); eq(page.url().split('#')[1], 's/restored0001');
    await page.click('#del'); await page.waitForURL(/#sheets$/); await page.waitForSelector('.card'); eq(await page.locator('.card').count(), 1);
    await page.goto(server.url + '#s/restored0001'); await page.waitForSelector('.empty'); assert.ok(/Not here|No signal/.test(await page.textContent('.empty')));
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: small phone (320×640): every screen fits with no sideways scroll', async () => {
    const { page, errors } = await open(); await page.setViewportSize({ width: 320, height: 640 });
    for (const h of ['#map', '#sheets', '#s/' + sheetId, '#new', '#me']) {
      await page.goto(server.url + h); await page.waitForTimeout(700);
      const w = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 320, h + ' scrollWidth ' + w);
    }
    await page.goto(server.url + '#new'); await page.waitForSelector('.poses');
    const boxes = await page.$$eval('.poses label', ls => ls.map(l => l.getBoundingClientRect().width)); assert.ok(boxes.every(b => b >= 80), 'stance cards are tappable: ' + boxes.join(','));
    const figs = await page.$$eval('.poses .figimg', ls => ls.map(l => [l.getBoundingClientRect().width, l.getBoundingClientRect().height])); assert.ok(figs.every(([w, h]) => w > 40 && h > 40), 'drawings have size: ' + JSON.stringify(figs));
    eq(errors.length, 0, errors.join(' | ')); await page.close();
  });
  await test('app: offline reload with the real service worker still opens the app and the saved sheet', async () => {
    const { page, ctx, errors } = await newPage(browser, { sw: true }); await block(page);
    await page.goto(server.url); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1200);
    const id = await makeSheet(page, 'Offline pier'); await page.waitForSelector('.sheet .tb');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('.sheet .tb'); assert.ok((await page.textContent('.sheet')).includes('Offline pier'));
    await page.goto(server.url + '#map'); await page.waitForSelector('.leaflet-container'); assert.ok((await page.textContent('body')).includes('PHOTO BLUEPRINT'));
    await page.click('[data-feed="mine"]'); await page.waitForSelector('.pin.me');
    await page.goto(server.url + '#s/' + id); await page.waitForSelector('.sheet .tb'); assert.ok((await page.textContent('.sheet')).includes('Offline pier'));
    await ctx.setOffline(false);
    eq(errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)).length, 0, errors.join(' | ')); await ctx.close();
  });

  await shared.close(); await browser.close(); server.stop();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) { console.log('  FAIL ' + results.filter(r => !r[1]).map(r => r[0]).join('\n  FAIL ')); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('HARNESS ' + (e && e.stack || e)); process.exit(1); });
