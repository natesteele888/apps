// Gridiron Hub screenshots with made-up demo data. See lib.cjs.
// The site uses the Firebase JS SDK from gstatic; those module URLs are answered by a tiny in-memory fake below, signed in
// as a fictional coach. The repo's team photos are real kids, so every photo is replaced by a drawn picture, and the
// opponent logos by drawn badges.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/ASL-Bengals';

const FAKE_APP = `export const initializeApp = (c) => ({ config: c });`;
const FAKE_STORAGE = `export const getStorage = () => ({}); export const ref = () => ({}); export const uploadBytes = async () => ({}); export const getDownloadURL = async () => '';`;
const FAKE_AUTH = `
const g = globalThis.__fb;
export const getAuth = () => g.auth;
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(g.auth.currentUser), 0); return () => {}; };
export const signOut = async () => {}; export const signInWithEmailAndPassword = async () => ({ user: g.auth.currentUser });
export const createUserWithEmailAndPassword = async () => ({ user: g.auth.currentUser });
export const GoogleAuthProvider = class {}; export const signInWithPopup = async () => ({ user: g.auth.currentUser });
export const sendPasswordResetEmail = async () => {}; export const updateProfile = async () => {};`;
const FAKE_FS = `
const g = globalThis.__fb;
const ts = (d) => ({ toDate: () => new Date(d), toMillis: () => +new Date(d) });
const norm = (p) => p.join('/');
export const getFirestore = () => ({});
export const doc = (db, ...p) => ({ kind: 'doc', path: norm(p), id: p[p.length - 1] });
export const collection = (db, ...p) => ({ kind: 'col', path: norm(p) });
export const orderBy = (f, d) => ({ t: 'order', f, d });
export const where = (f, op, v) => ({ t: 'where', f, op, v });
export const limit = (n) => ({ t: 'limit', n });
export const query = (c, ...cs) => ({ kind: 'q', col: c, cs });
export const serverTimestamp = () => ts(Date.now());
export const arrayUnion = (x) => ({ __union: x });
export const arrayRemove = (x) => ({ __remove: x });
export const Timestamp = { now: () => ts(Date.now()), fromDate: (d) => ts(d) };
const colDocs = (path) => Object.keys(g.docs).filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(k => ({ id: k.slice(path.length + 1), d: g.docs[k] }));
const mk = (id, d) => ({ id, exists: () => d != null, data: () => d, get: (f) => d && d[f] });
function run(t) {
  if (t.kind === 'doc') return mk(t.id, g.docs[t.path]);
  const c = t.kind === 'col' ? t : t.col, cs = t.kind === 'q' ? t.cs : [];
  let rows = colDocs(c.path);
  cs.filter(x => x.t === 'where').forEach(w => { rows = rows.filter(r => w.op === '==' ? r.d[w.f] === w.v : w.op === 'array-contains' ? (r.d[w.f] || []).includes(w.v) : true); });
  const o = cs.find(x => x.t === 'order');
  if (o) rows.sort((a, b) => { const x = a.d[o.f], y = b.d[o.f]; const vx = x && x.toMillis ? x.toMillis() : x, vy = y && y.toMillis ? y.toMillis() : y; return (vx > vy ? 1 : vx < vy ? -1 : 0) * (o.d === 'desc' ? -1 : 1); });
  const docs = rows.map(r => mk(r.id, r.d));
  return { docs, empty: !docs.length, size: docs.length, forEach: (f) => docs.forEach(f) };
}
export const getDoc = async (r) => run(r);
export const getDocs = async (q) => run(q);
export const onSnapshot = (t, ok) => { const f = () => ok(run(t)); setTimeout(f, 0); g.subs.push(f); return () => { g.subs = g.subs.filter(x => x !== f); }; };
const apply = (old, data) => { const o = Object.assign({}, old); for (const k in data) { const v = data[k]; if (v && v.__union !== undefined) o[k] = Array.from(new Set([...(o[k] || []), v.__union])); else if (v && v.__remove !== undefined) o[k] = (o[k] || []).filter(x => x !== v.__remove); else o[k] = v; } return o; };
const bump = () => g.subs.slice().forEach(f => f());
export const setDoc = async (r, data, opt) => { g.docs[r.path] = opt && opt.merge ? apply(g.docs[r.path], data) : apply({}, data); bump(); };
export const updateDoc = async (r, data) => { g.docs[r.path] = apply(g.docs[r.path], data); bump(); };
export const addDoc = async (c, data) => { const id = 'n' + Math.random().toString(36).slice(2, 9); g.docs[c.path + '/' + id] = apply({}, data); bump(); return { id }; };
export const deleteDoc = async (r) => { delete g.docs[r.path]; bump(); };
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
`;

function seed() {
  const d = (s) => ({ toDate: () => new Date(s), toMillis: () => +new Date(s) });
  const docs = {
    'users/u-taylor': { role: 'coach', teamIds: ['11u'], email: 'coach.taylor@example.com', name: 'Coach Taylor' },
    'teams/11u': { bannerUrl: '' },
    'teams/11u/events/e1': { title: 'Practice', date: '2026-10-14', time: '5:30 PM', location: 'Memorial Field', cancelled: false },
    'teams/11u/events/e2': { title: 'Practice', date: '2026-10-16', time: '5:30 PM', location: 'Memorial Field', cancelled: false },
    'teams/11u/events/e3': { title: 'Film night', date: '2026-10-17', time: '6:00 PM', location: 'Community Center', cancelled: true },
    'teams/11u/events/e1/rsvps/u-taylor': { status: 'going' },
    'teams/11u/messages/m1': { text: 'Great practice tonight. Bring a water bottle and your mouthguard Thursday.', postedByName: 'coach.taylor@example.com', postedAt: d('2026-10-13T20:10:00'), readBy: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    'teams/11u/messages/m2': { text: 'We will carpool from the field after Sunday\'s game. Reply here if you need a ride.', postedByName: 'parent.sam@example.com', postedAt: d('2026-10-12T18:45:00'), readBy: ['a', 'b', 'c', 'd'] },
    'teams/11u/messages/m3': { text: 'Jerseys are in. Pick up at the next practice.', postedByName: 'coach.jordan@example.com', postedAt: d('2026-10-10T09:30:00'), readBy: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
  };
  ['a','b','c','d','e','f','g','h','i','j','k','l'].forEach((x, i) => { if (i < 8) docs['teams/11u/events/e1/rsvps/' + x] = { status: 'going' }; else docs['teams/11u/events/e1/rsvps/' + x] = { status: 'not-going' }; docs['teams/11u/events/e2/rsvps/' + x] = { status: i < 9 ? 'going' : 'not-going' }; });
  const roster = [['Riley', 1], ['Jordan', 2], ['Casey', 3], ['Morgan', 4], ['Avery', 5], ['Quinn', 6], ['Sam', 12], ['Jamie', 21], ['Drew', 24], ['Reese', 44], ['Skyler', 54], ['Parker', 62], ['Rowan', 70], ['Hayden', 73], ['Emerson', 75], ['Kendall', 91]];
  roster.forEach(([name, number], i) => { docs['teams/11u/roster/p' + i] = { name, number }; });
  return docs;
}

// Drawn pictures instead of the repo's real photos and opponent logos.
function art(kind, label, i) {
  const bg = ['#b45309', '#7c2d12', '#9a3412', '#1f2937'][i % 4];
  if (kind === 'photo') return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="1200" height="700" fill="url(#g)"/><rect y="520" width="1200" height="180" fill="#166534"/><g stroke="#fff" stroke-width="6" opacity=".6"><line x1="0" y1="560" x2="1200" y2="560"/><line x1="0" y1="640" x2="1200" y2="640"/></g><text x="600" y="400" font-size="260" text-anchor="middle">🏈</text></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="${bg}"/><text x="100" y="125" font-size="72" font-weight="800" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
}

async function boot() {
  const srv = await serve(APP_DIR, 'ASL-Bengals'), br = await launch();
  const { page } = await phone(br, { today: '2026-10-14', time: '2026-10-14T17:30:00' });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  const js = (body) => ({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
  await page.route(/gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/, r => r.fulfill(js(FAKE_APP)));
  await page.route(/gstatic\.com\/firebasejs\/[^/]+\/firebase-auth\.js/, r => r.fulfill(js(FAKE_AUTH)));
  await page.route(/gstatic\.com\/firebasejs\/[^/]+\/firebase-firestore\.js/, r => r.fulfill(js(FAKE_FS)));
  await page.route(/gstatic\.com\/firebasejs\/[^/]+\/firebase-storage\.js/, r => r.fulfill(js(FAKE_STORAGE)));
  await page.addInitScript(([docs]) => {
    globalThis.__fb = { docs, subs: [], auth: { currentUser: { uid: 'u-taylor', email: 'coach.taylor@example.com', displayName: 'Coach Taylor' } } };
  }, [seed()]);
  let n = 0;
  await page.route(/\/gridiron-hub\/assets\/img\/(?!team-logos).*\.(jpg|jpeg|png)(\?.*)?$/i, r => {
    if (/logo/i.test(r.request().url())) return r.continue();
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: art('photo', '', n++) });
  });
  await page.route(/\/team-logos\//, r => {
    const nm = decodeURIComponent(r.request().url().split('/').pop()).replace(/\..*/, '');
    if (/bengals/i.test(nm)) return r.continue();
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: art('logo', nm.slice(0, 2).toUpperCase(), nm.length) });
  });
  return { page, br, srv };
}

// The site's schedule and home pages list real neighbouring towns; swap them for made-up teams before showing.
const SWAP = [['Charlton/Dudley', 'Lakeside'], ['Nipmuc', 'Ridgeview'], ['Leicester/Spencer', 'Hillcrest'], ['Tyngsboro', 'Eastgate'], ['North Middlesex Regional High School', 'Eastgate Field'], ['North Middlesex', 'Valley'], ['Leominster', 'Brookside'], ['Northbridge/Uxbridge', 'Northfield'], ['Tantasqua', 'Pinecrest'], ['Ayer Shirley Regional High School', 'Memorial Field'], ['McCloskey Field', 'Brookside Park'], ['Central Mass Locals', 'Metro Locals'], ['Milford', 'Comets']];
async function swapNames(page) {
  await page.route(/\/gridiron-hub\/(index|schedule|teams)\.html(\?.*)?$/, async r => {
    const resp = await r.fetch(); let b = await resp.text();
    SWAP.forEach(([a, c]) => { b = b.split(a).join(c); });
    r.fulfill({ response: resp, body: b });
  });
}
module.exports = { boot, swapNames };
const h2 = async (page, text, off = 80) => { await page.evaluate(([t, o]) => { const e = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === t); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - o); }, [text, off]); await page.waitForTimeout(500); };
const top = async (page, sel, off = 70) => { await page.evaluate(([s, o]) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - o); }, [sel, off]); await page.waitForTimeout(500); };
if (require.main === module) (async () => {
  const { page, br, srv } = await boot();
  await swapNames(page);
  const go = async (p, wait = 1500) => { await page.goto(srv.base + 'gridiron-hub/' + p); await page.addStyleTag({ content: 'footer{display:none!important} #addPlayerForm,#pasteRosterForm,#addEventForm{display:none!important} body{padding-bottom:900px}' }); await page.waitForTimeout(wait); };
  // The team page: roster, then the message board with "seen by", then practice RSVPs.
  await go('team.html?id=11u');
  await h2(page, 'Roster', 90); await shot(page, 'gridiron', 1, 'Every team has a roster, with a page for each player');
  await h2(page, 'Team Messages', 90); await shot(page, 'gridiron', 2, 'A team message board that shows who has seen each post');
  await h2(page, 'Practice Schedule', 90); await shot(page, 'gridiron', 3, 'Practice schedule with one-tap RSVPs and live counts');
  await go('schedule.html'); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot(page, 'gridiron', 4, 'Schedule and results for every team, with a calendar button');
  await go('index.html', 2500); await h2(page, 'Teams', 90);
  await shot(page, 'gridiron', 5, 'Season results and updates for the whole organization');
  await go('programs.html'); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot(page, 'gridiron', 6, 'Every program, ages and season dates in one place');
  await br.close(); srv.stop();
  finish('gridiron');
})().catch(e => { console.error(e); process.exit(1); });
