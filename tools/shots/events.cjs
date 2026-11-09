// Steele Events screenshots with a made-up party, guest list and host. See lib.cjs.
// The app lives in natesteele888/events (read only). Point APP_DIR at a checkout of it.
//   APP_DIR=/path/to/events NODE_PATH=/opt/node22/lib/node_modules node tools/shots/events.cjs
// Firebase (app, sign-in and Firestore) is replaced by a small in-memory fake, so no real data or traffic is involved.
const { serve, launch, phone, shot, finish } = require('./lib.cjs');
const APP_DIR = process.env.APP_DIR || '/tmp/claude-0/-home-user-apps/e86ab336-3879-59d4-a6a2-f41cdf72dcbd/scratchpad/events';

const T = ms => ({ __ts: ms });
const NOW = new Date('2026-11-09T10:00:00').getTime(), H = 3600e3;
const HOST = 'host-uid', E1 = 'party000001', E2 = 'cookout0002', E3 = 'openhouse03', CODE = 'COMET482';
const theme1 = { primary: '#1E5631', accent: '#D99A1F', bg: '#F3F1E7', text: '#1B2A1F', font: 'Bebas Neue' };
const questions = [
  { id: 'q1', type: 'choice', label: 'Pizza choice', options: ['Cheese', 'Pepperoni', 'Veggie'], required: true },
  { id: 'q2', type: 'text', label: 'Any allergies?', options: [], required: false }
];
const timeline = [{ time: '4:00 PM', label: 'Welcome and yard games' }, { time: '5:00 PM', label: 'Pizza and snacks' }, { time: '5:45 PM', label: 'Team awards' }, { time: '6:15 PM', label: 'Whiffle ball: parents vs. players' }];
const seed = {};
function event(id, title, date, start, published, th, img, extra = {}) {
  seed[`events/${id}`] = { ownerUid: HOST, ownerEmail: 'avery@example.com', admins: [], title, access: 'open', code: CODE, published, plusMax: 3, capacity: 40, date, start, deadline: null, reminders: { on: true, days: [7, 1] }, ...extra.main };
  seed[`events/${id}/public/card`] = { title, subtitle: extra.subtitle || '', hostName: 'The Taylor Family', theme: th, image: img, imageMode: 'banner', access: 'open', openCode: CODE };
  seed[`events/${id}/locked/${CODE}`] = { date, start, end: extra.end || '', location: 'Maple Grove Pavilion', address: '100 Example Lane', description: extra.description || '', timeline: extra.timeline || [], questions: extra.questions || [], wishlist: extra.wishlist || [], wishlistTitle: extra.wishlistTitle || '', plusMax: 3, capacity: 40, deadline: extra.deadline || null, showCount: true, remindersOn: true };
  seed[`events/${id}/meta/count`] = { yes: extra.yes || 0 };
}
event(E1, 'Hawks End-of-Season Party', '2026-11-21', '16:00', true, theme1, '@@IMG:ball', {
  subtitle: 'Pizza, awards and a whiffle ball game', end: '18:45', yes: 21, questions, timeline, deadline: T(new Date('2026-11-17T20:00:00').getTime()),
  description: 'Come celebrate a great season! We will have pizza, drinks and a few awards, then a whiffle ball game of parents vs. players.\n\nBring a lawn chair and a jacket, since the pavilion is open on the sides.',
  wishlistTitle: 'Things we still need', wishlist: [{ title: 'Folding chairs', url: '', price: '', note: 'Bring one if you have it', image: null }, { title: 'Fruit tray', url: '', price: '', note: 'Sign up in the comment box', image: null }, { title: 'Cooler with ice', url: '', price: '', note: 'One or two, please', image: null }]
});
event(E2, 'Fall Family Cookout', '2026-11-14', '12:00', true, { primary: '#A3334A', accent: '#F08A4B', bg: '#FFF3EA', text: '#3B1F25', font: 'Pacifico' }, '@@IMG:leaf', { yes: 18 });
event(E3, 'Holiday Open House', '2026-12-13', '15:00', false, { primary: '#5B21B6', accent: '#E8488A', bg: '#F7F1FF', text: '#2A1446', font: 'Pacifico' }, '@@IMG:star');
seed[`hosts/${HOST}`] = { email: 'avery@example.com', name: 'Avery', status: 'active' };
seed[`codes/${CODE}`] = { e: E1 };
const people = [
  ['Riley P.', 1, 3, 'Pepperoni', '', 'So glad we get to celebrate! We will bring a fruit tray.', 2], ['Jordan M.', 1, 4, 'Cheese', 'Nuts', 'Count us in. Happy to bring two folding chairs.', 3],
  ['Casey L.', 1, 2, 'Veggie', '', '', 5], ['Morgan T.', 1, 3, 'Pepperoni', '', '', 7], ['Quinn R.', 0, 1, '', '', 'Sorry, we are away that weekend. Have fun!', 9],
  ['Sam W.', 1, 4, 'Cheese', '', 'Can we bring a cooler of drinks too?', 12], ['Taylor B.', 1, 2, 'Pepperoni', 'Dairy', '', 15], ['Avery K.', 1, 3, 'Cheese', '', '', 20], ['Drew H.', 0, 1, '', '', 'Wish we could make it!', 26]
];
people.forEach(([name, att, party, pizza, allergy, note, hrs], i) => {
  const answers = att ? { q1: pizza, ...(allergy ? { q2: allergy } : {}) } : {};
  const email = att && i % 2 === 0 ? name.split(' ')[0].toLowerCase() + '@example.com' : '';
  seed[`events/${E1}/rsvps/r${i}`] = { name, attending: !!att, partySize: party, answers, note, email, remind: !!email, code: CODE, createdAt: T(NOW - hrs * H), updatedAt: T(NOW - hrs * H) };
});

// ---- the fake Firebase: one module body served for the SDK files the app imports ----
const sdkStub = `
const seed = window.__seed;
class Timestamp { constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; } toDate() { return new Date(this.ms); } toMillis() { return this.ms; } static now() { return new Timestamp(Date.now()); } static fromDate(d) { return new Timestamp(+d); } static fromMillis(m) { return new Timestamp(m); } }
const imgs = {};
function paint(name, bg, fg, draw) { const c = document.createElement('canvas'); c.width = 900; c.height = 420; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 900, 420); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); x.fillStyle = g; x.fillRect(0, 0, 900, 420); x.fillStyle = fg; draw(x); imgs[name] = c.toDataURL('image/jpeg', 0.8); }
paint('ball', ['#14532d', '#1E5631'], '#F3F1E7', x => { x.beginPath(); x.moveTo(450, 70); x.lineTo(670, 250); x.lineTo(450, 430); x.lineTo(230, 250); x.closePath(); x.globalAlpha = .25; x.fill(); x.globalAlpha = 1; x.beginPath(); x.arc(450, 205, 95, 0, 7); x.fill(); x.strokeStyle = '#C8102E'; x.lineWidth = 6; x.beginPath(); x.arc(370, 205, 100, -.8, .8); x.stroke(); x.beginPath(); x.arc(530, 205, 100, 2.34, 3.94); x.stroke(); });
paint('leaf', ['#A3334A', '#F08A4B'], '#FFF3EA', x => { for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(120 + i * 110, 140 + (i % 3) * 70, 38, 70, i * .7, 0, 7); x.fill(); } });
paint('star', ['#5B21B6', '#E8488A'], '#F7F1FF', x => { for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(80 + i * 95, 80 + (i % 4) * 90, 14 + (i % 3) * 6, 0, 7); x.fill(); } });
function revive(v) { if (v && typeof v === 'object') { if (v.__ts) return new Timestamp(v.__ts); if (Array.isArray(v)) return v.map(revive); const o = {}; for (const k in v) o[k] = revive(v[k]); return o; } if (typeof v === 'string' && v.startsWith('@@IMG:')) return imgs[v.slice(6)]; return v; }
const M = window.__fsMap || (window.__fsMap = new Map(Object.entries(seed).map(([k, v]) => [k, revive(v)])));
const fix = v => { if (v && typeof v === 'object') { if (v.__server) return new Timestamp(Date.now()); if (typeof v.toDate === 'function') return v; if (Array.isArray(v)) return v.map(fix); const o = {}; for (const k in v) o[k] = fix(v[k]); return o; } return v; };
const copy = v => { if (v && typeof v.toDate === 'function') return v; if (Array.isArray(v)) return v.map(copy); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = copy(v[k]); return o; } return v; };
export const initializeApp = () => ({});
export const getAuth = () => ({}); export const connectAuthEmulator = () => {}; export const connectFirestoreEmulator = () => {};
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb({ uid: 'host-uid', email: 'avery@example.com', emailVerified: true, displayName: 'Avery' }), 0); return () => {}; };
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {}, signInWithRedirect = async () => {}, signOut = async () => {}, createUserWithEmailAndPassword = async () => {}, signInWithEmailAndPassword = async () => {}, sendEmailVerification = async () => {}, sendPasswordResetEmail = async () => {}, updateProfile = async () => {};
export const getFirestore = () => ({});
export { Timestamp };
export const serverTimestamp = () => ({ __server: 1 });
export const doc = (db, ...s) => ({ path: s.join('/'), id: s[s.length - 1] });
export const collection = (db, ...s) => ({ coll: s.join('/') });
export const where = (f, op, v) => ({ w: [f, op, v] });
export const query = (c, ...ws) => ({ coll: c.coll, ws: ws.map(x => x.w) });
const snapOf = path => ({ id: path.split('/').pop(), ref: { path, id: path.split('/').pop() }, exists: () => M.has(path), data: () => copy(M.get(path)) });
export const getDoc = async ref => snapOf(ref.path);
export const getDocs = async q => {
  const base = q.coll + '/', docs = [];
  for (const [p, v] of M) { if (!p.startsWith(base) || p.slice(base.length).includes('/')) continue;
    if ((q.ws || []).every(([f, op, val]) => op === '==' ? v[f] === val : op === 'array-contains' ? (v[f] || []).includes(val) : true)) docs.push(snapOf(p)); }
  return { docs, empty: !docs.length, metadata: { fromCache: false }, forEach: fn => docs.forEach(fn) };
};
export const setDoc = async (ref, data) => { M.set(ref.path, fix(data)); };
export const updateDoc = async (ref, data) => { M.set(ref.path, { ...(M.get(ref.path) || {}), ...fix(data) }); };
export const writeBatch = () => { const ops = []; return { set: (r, d) => ops.push(() => M.set(r.path, fix(d))), update: (r, d) => ops.push(() => M.set(r.path, { ...(M.get(r.path) || {}), ...fix(d) })), delete: r => ops.push(() => M.delete(r.path)), commit: async () => ops.forEach(f => f()) }; };
`;

(async () => {
  const srv = await serve(APP_DIR, 'events'), br = await launch();
  const { page } = await phone(br, { time: '2026-11-09T10:00:00' });
  await page.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: sdkStub }));
  await page.route(/^https?:\/\/(?!localhost)/, r => /gstatic\.com\/firebasejs\//.test(r.request().url()) ? r.fallback() : r.abort());
  await page.addInitScript(s => { window.__seed = s; }, seed);
  const wait = ms => page.waitForTimeout(ms);

  // 1. the invitation a guest opens
  await page.goto(srv.base + `?e=${E1}&c=${CODE}`); await page.waitForSelector('.inv h1'); await wait(500);
  await shot(page, 'events', 1, 'Your own invitation, with colors, banner and schedule');
  await page.evaluate(() => { const c = document.querySelector('.desc'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 20); }); await wait(300);
  await shot(page, 'events', 2, 'Guests see the details and the plan for the day');

  // 2. a guest RSVPs (the form is filled in the way a guest would)
  await page.evaluate(() => { const c = document.querySelector('#rsvpCard'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 20); });
  await page.fill('#rName', 'Skyler D.'); await page.click('[data-att="1"]'); await page.click('[data-step="1"]'); await page.click('[data-step="1"]');
  await page.click('[data-qo="q1"][data-v="Pepperoni"]'); await page.fill('#rNote', 'We will bring a cooler!');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); const c = document.querySelector('#rsvpCard'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 20); }); await wait(400);
  await shot(page, 'events', 3, 'Guests RSVP from any phone, with no account');

  // 3. the host side
  await page.goto(srv.base + '#'); await page.waitForSelector('.evcard'); await wait(600);
  await shot(page, 'events', 4, 'Every event you host, live or still a draft');
  await page.evaluate(() => { location.hash = '#responses/party000001'; }); await page.waitForSelector('.gcard'); await wait(500);
  await page.evaluate(() => { const c = document.querySelector('.stats'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 20); }); await wait(300);
  await shot(page, 'events', 5, 'The guest list: headcount, pizza choices and comments');
  await page.evaluate(() => { location.hash = '#edit/party000001'; }); await page.waitForSelector('#dirty, .inp'); await wait(900); await page.evaluate(() => { const c = document.querySelector('.previewcol'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 20); }); await wait(300);
  await shot(page, 'events', 6, 'Design the invitation on screen with a live preview');
  finish('events'); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
