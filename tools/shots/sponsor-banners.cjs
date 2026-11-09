// Sponsor Banner Inventory screenshots with made-up demo data. See lib.cjs / README.md.
// The app lives in another repo (read only): APP_DIR points at a checkout of sponsor-banner-inventory.
// Firebase Auth is replaced by a tiny fake SDK and the Apps Script backend by a route returning invented banners.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const fs = require('fs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/sponsor-banner-inventory';
const LEAFLET = process.env.LEAFLET_DIR || '/home/user/apps/photoblueprint/vendor'; // leaflet 1.9.4 (the app loads it from unpkg, which is blocked here)

const FAKE_SDK = `(function(){
  var user = { displayName: 'Taylor Admin', email: 'taylor@example.com', getIdToken: function(){ return Promise.resolve('demo-token'); } };
  var fb = { apps: [], initializeApp: function(c){ fb.apps.push(c); return {}; },
    auth: function(){ return { currentUser: user,
      onAuthStateChanged: function(cb){ setTimeout(function(){ cb(user); }, 20); },
      getRedirectResult: function(){ return Promise.resolve({}); },
      signInWithPopup: function(){ return Promise.resolve({ user: user }); },
      signInWithEmailAndPassword: function(){ return Promise.resolve({ user: user }); },
      signOut: function(){ return Promise.resolve(); } }; } };
  fb.auth.GoogleAuthProvider = function(){ this.setCustomParameters = function(){}; };
  window.firebase = fb;
})();`;

// invented sponsors: name, bg, fg, tier, amount, contact, onList, hung, pin, note
const S = [
  ['Hometown Hardware', '#b91c1c', '#fff', 'MVP', '$600.00', 'Jordan Ellis', 1, 1, [42.6761, -71.7352], 'Left field fence, near the scoreboard.'],
  ['Blue Heron Dental', '#1d4ed8', '#fff', 'Championship', '$400.00', 'Riley Hart', 1, 1, [42.6757, -71.7331], 'Renewed again this year. Loves the Comets.'],
  ['Sunny Side Bakery', '#f59e0b', '#1f2937', 'All-Star', '$250.00', 'Casey Moore', 1, 1, [42.6749, -71.7318], 'Brings donuts to opening day.'],
  ['Pine Ridge Landscaping', '#15803d', '#fff', 'MVP', '$600.00', 'Morgan Lee', 1, 0, null, 'New banner printed, needs hanging at Field 2.'],
  ['Northfield Auto Care', '#111827', '#fbbf24', 'Championship', '$400.00', 'Avery Stone', 1, 1, [42.6768, -71.7309], 'Center field, faces the parking lot.'],
  ['Corner Cafe', '#7c3aed', '#fff', 'All-Star', '$250.00', 'Quinn Baker', 1, 0, null, 'Waiting on payment before it goes up.'],
  ['Riverbend Realty', '#0e7490', '#fff', 'MVP', '$600.00', 'Sam Rivera', 1, 1, [42.6742, -71.7340], 'Right field fence, Field 3.'],
  ['Maple Lane Pizza', '#ea580c', '#fff', 'Championship', '$400.00', 'Taylor Brooks', 0, 1, [42.6753, -71.7296], 'Legacy sponsor from a past season.'],
  ['Lakeside Plumbing', '#0369a1', '#fff', 'All-Star', '$250.00', 'Jordan Pierce', 0, 0, null, 'Faded, replace if they come back.'],
  ['Granite State Insurance', '#475569', '#fff', 'Championship', '$400.00', 'Riley Walker', 1, 1, [42.6764, -71.7326], 'Backstop, Field 1.'],
].map((r, i) => ({
  id: i + 1, filename: `banner-${i + 1}.jpg`, driveFileId: 'demo' + (i + 1), sponsorName: r[0], onSponsorList: !!r[6], tier: r[3], amountPaid: r[4],
  contactName: r[5], contactPhone: `(555) 010-${String(10 + i * 7).padStart(4, '0')}`, contactEmail: r[5].split(' ')[0].toLowerCase() + '@example.com',
  address: `${100 + i * 12} Example Road`, condition: i === 8 ? 'Faded' : 'Good', hung: !!r[7], lat: r[8] ? r[8][0] : null, lng: r[8] ? r[8][1] : null,
  locationLabel: '', notes: r[9], updatedAt: '2026-10-20T12:00:00Z', _bg: r[1], _fg: r[2]
}));

const bannerSvg = (b, full) => {
  const w = full ? 800 : 120, h = full ? 300 : 120, fs = full ? 62 : 17;
  const words = b.sponsorName.toUpperCase().split(' '), mid = Math.ceil(words.length / 2);
  const lines = full ? (words.length > 2 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [words.join(' ')]) : words;
  const t = lines.map((l, i) => `<text x="${w / 2}" y="${h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05 + fs * 0.35}" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="${fs}" fill="${b._fg}">${l}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${b._bg}"/><rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${b._fg}" stroke-width="${full ? 5 : 2}" opacity=".6"/>${t}</svg>`;
};
const strip = b => { const o = { ...b }; delete o._bg; delete o._fg; return o; };
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dcebd2"/><path d="M0 128H256M128 0V256" stroke="#f4f1e8" stroke-width="14"/><path d="M0 40L256 220" stroke="#e6e2d4" stroke-width="6"/><rect x="150" y="150" width="80" height="70" fill="#c5ddb4"/><circle cx="60" cy="60" r="28" fill="#bcd8f0"/><path d="M0 0H256V256H0Z" fill="none" stroke="#cfdcc4"/></svg>`;
const PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#2f6df6" stroke="#0a1628" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="5" fill="#fff"/></svg>`;

(async () => {
  const srv = await serve(APP_DIR, 'sponsor-banners'), br = await launch();
  const { page } = await phone(br);
  await page.route(/^(?!http:\/\/(localhost|127\.0\.0\.1)).*/, r => r.abort()); // nothing else leaves the machine
  // (routes registered later win, so the specific ones above are re-registered below the catch-all)
  // (routes registered later win, so the catch-all above is registered first)
  // (routes registered later win, so the catch-all that blocks everything else is registered first)
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.continue()); // generic web fonts only, no app data
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.route(/unpkg\.com\/leaflet@[^/]+\/dist\/leaflet\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(LEAFLET + '/leaflet.js') }));
  await page.route(/unpkg\.com\/leaflet@[^/]+\/dist\/leaflet\.css/, r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(LEAFLET + '/leaflet.css') }));
  await page.route(/tile\.openstreetmap\.org/, r => r.fulfill({ contentType: 'image/svg+xml', body: TILE }));
  await page.route(/marker-(icon|shadow)|layers(-2x)?\.png/, r => r.fulfill({ contentType: 'image/svg+xml', body: /shadow/.test(r.request().url()) ? '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' : PIN }));
  await page.route(/script\.google\.com/, async r => {
    const h = { 'access-control-allow-origin': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    const q = JSON.parse(r.request().postData() || '{}');
    let body;
    if (q.action === 'list') body = { ok: true, banners: S.map(strip) };
    else if (q.action === 'image') { const b = S.find(x => x.driveFileId === q.id); body = { ok: true, mime: 'image/svg+xml', base64: Buffer.from(bannerSvg(b, q.size === 'full')).toString('base64') }; }
    else body = { ok: true };
    r.fulfill({ contentType: 'application/json', headers: h, body: JSON.stringify(body) });
  });

  await page.goto(srv.base);
  await page.waitForSelector('.banner-card'); await page.waitForSelector('.banner-card img'); await page.waitForTimeout(600);
  await shot(page, 'sponsor-banners', 1, 'Every sponsor banner with its photo and hung status');

  await page.locator('.chip[data-filter=notHung]').click(); await page.waitForTimeout(600);
  await shot(page, 'sponsor-banners', 2, 'Filter to the banners still waiting to be hung');
  await page.locator('.chip[data-filter=all]').click();

  await page.locator('.banner-card', { hasText: 'Blue Heron' }).click(); await page.waitForSelector('#detailImg[src]'); await page.waitForTimeout(500);
  await shot(page, 'sponsor-banners', 3, 'Photo, tier and amount paid for each banner');
  await page.locator('#f_contactName').scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('#detailSheet').scrollTo(0, 420)); await page.waitForTimeout(300);
  await shot(page, 'sponsor-banners', 4, 'Sponsor contact details a tap away for renewals');
  await page.locator('#detailClose').click(); await page.waitForTimeout(300);

  await page.locator('.tab-btn[data-view=map]').click(); await page.waitForSelector('.leaflet-marker-icon'); await page.waitForTimeout(900);
  await shot(page, 'sponsor-banners', 5, 'A map of where every banner hangs around the fields');
  await page.locator('.leaflet-marker-icon').nth(1).click(); await page.waitForSelector('.leaflet-popup'); await page.waitForTimeout(400);
  await shot(page, 'sponsor-banners', 6, 'Tap a pin to see which banner hangs there');

  finish('sponsor-banners'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
