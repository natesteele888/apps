// Rules tests for toolbox/firestore.rules. Run: cd toolbox && npm install && npm test
// Uses fake test accounts only. OWNER_EMAIL in the rules is swapped for a test address.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, query, where, orderBy, updateDoc } from 'firebase/firestore';

const OWNER = 'owner@example.com';
let env;

before(async () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    .replaceAll('OWNER_EMAIL', OWNER);
  env = await initializeTestEnvironment({
    projectId: 'demo-toolbox',
    firestore: { rules, host: '127.0.0.1', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects/p1'), { name: 'Test project' });
    await setDoc(doc(db, 'public_icons/app1'), { any: 'x' });
    await setDoc(doc(db, 'public_listings/app1'), { sub: 'x' });
    await setDoc(doc(db, 'gp_codes/GOOD'), { active: true });
    await setDoc(doc(db, 'gp_codes/OFF'), { active: false });
    await setDoc(doc(db, 'gp_players/player1'), { name: 'P', code: 'GOOD', joinedAt: 1 });
    // Photo Blueprint: a public sheet by photographer A, a private one by A, and the pictures for both
    await setDoc(doc(db, 'sp_public/pubA'), spSheet('pubA', 'photoA', true));
    await setDoc(doc(db, 'sp_sheets/pubA'), spSheet('pubA', 'photoA', true));
    await setDoc(doc(db, 'sp_sheets/privA'), spSheet('privA', 'photoA', false));
    await setDoc(doc(db, 'sp_images/pubA'), { uid: 'photoA', public: true, data: 'data:image/jpeg;base64,AAAA', updated: 1 });
    await setDoc(doc(db, 'sp_images/privA'), { uid: 'photoA', public: false, data: 'data:image/jpeg;base64,BBBB', updated: 1 });
  });
});

const owner = () => env.authenticatedContext('owner', { email: OWNER, email_verified: true }).firestore();
const stranger = () => env.authenticatedContext('stranger', { email: 'someone@example.com', email_verified: true }).firestore();
const player = () => env.authenticatedContext('player1', { email: 'player@example.com', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const photoA = () => env.authenticatedContext('photoA', { email: 'a@example.com', email_verified: true }).firestore();
const photoB = () => env.authenticatedContext('photoB', { email: 'b@example.com', email_verified: true }).firestore();
const spSheet = (id, uid, pub, extra = {}) => ({ id, uid, author: 'A', public: pub, created: 1, updated: 1, title: 'Pier at dawn', story: '', lat: 41.1, lon: -81.5,
  heading: 40, posture: 'kneeling', height: 0.9, camera: 'Body', lens: 'Lens', focal: 35, sensor: 'ff', aperture: 8, shutter: 0.004, iso: 100, ev: 0,
  filters: '', support: '', light: '', taken: '', ig: '', thumb: 'data:image/jpeg;base64,AAAA', w: 10, h: 10, place: '', distance: null, ...extra });

test('owner can read and write projects', async () => {
  await assertSucceeds(getDoc(doc(owner(), 'projects/p1')));
  await assertSucceeds(getDocs(collection(owner(), 'projects')));
  await assertSucceeds(setDoc(doc(owner(), 'projects/p2'), { name: 'New' }));
});

test('owner email that is not verified is refused', async () => {
  const db = env.authenticatedContext('fake', { email: OWNER, email_verified: false }).firestore();
  await assertFails(getDoc(doc(db, 'projects/p1')));
});

test('a stranger cannot read or write projects', async () => {
  await assertFails(getDoc(doc(stranger(), 'projects/p1')));
  await assertFails(getDocs(collection(stranger(), 'projects')));
  await assertFails(setDoc(doc(stranger(), 'projects/p2'), { name: 'x' }));
  await assertFails(getDoc(doc(anon(), 'projects/p1')));
});

test('a Gameday Picks player cannot read Toolbox data', async () => {
  await assertFails(getDoc(doc(player(), 'projects/p1')));
  await assertFails(getDoc(doc(player(), 'profile/me')));
  await assertSucceeds(getDocs(collection(player(), 'gp_picks')));
});

test('anyone can read public_icons and public_listings, but not write them', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'public_icons/app1')));
  await assertSucceeds(getDocs(collection(anon(), 'public_icons')));
  await assertSucceeds(getDoc(doc(anon(), 'public_listings/app1')));
  await assertSucceeds(getDocs(collection(anon(), 'public_listings')));
  await assertFails(setDoc(doc(anon(), 'public_icons/app1'), { any: 'y' }));
  await assertFails(setDoc(doc(stranger(), 'public_listings/app1'), { sub: 'y' }));
  await assertSucceeds(setDoc(doc(owner(), 'public_listings/app1'), { sub: 'y' }));
});

test('Picks invite codes: good code joins, wrong or switched-off code does not', async () => {
  const join = (uid, code) => setDoc(
    doc(env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true }).firestore(), 'gp_players/' + uid),
    { name: 'New', code, joinedAt: 1 });
  await assertSucceeds(join('newbie', 'GOOD'));
  await assertFails(join('guesser', 'WRONG'));
  await assertFails(join('late', 'OFF'));
  await assertFails(join('sneaky', 'OWNER'));
});

// ---------- Get Ready cloud backup (gr_users/<uid> and its photos) ----------
const gr = (uid) => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true }).firestore();
const grData = { data: '{"v":2,"days":{}}', updated: 1 };

test('getready: a signed-in account can create, read, update and delete its own backup and photos', async () => {
  const db = gr('kidA');
  await assertSucceeds(setDoc(doc(db, 'gr_users/kidA'), grData));
  await assertSucceeds(setDoc(doc(db, 'gr_users/kidA'), { ...grData, pids: ['bag'] }));
  await assertSucceeds(setDoc(doc(db, 'gr_users/kidA/photos/bag'), { img: 'data:image/jpeg;base64,AAAA', updated: 1 }));
  await assertSucceeds(getDoc(doc(db, 'gr_users/kidA')));
  await assertSucceeds(getDoc(doc(db, 'gr_users/kidA/photos/bag')));
  await assertSucceeds(deleteDoc(doc(db, 'gr_users/kidA/photos/bag')));
  await assertSucceeds(deleteDoc(doc(db, 'gr_users/kidA')));
});
test('getready: nobody can read or write another account\'s backup or photos, and signed-out visitors get nothing', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'gr_users/kidA'), grData);
    await setDoc(doc(ctx.firestore(), 'gr_users/kidA/photos/bag'), { img: 'x', updated: 1 });
  });
  await assertFails(getDoc(doc(gr('kidB'), 'gr_users/kidA')));
  await assertFails(setDoc(doc(gr('kidB'), 'gr_users/kidA'), grData));
  await assertFails(deleteDoc(doc(gr('kidB'), 'gr_users/kidA')));
  await assertFails(getDoc(doc(gr('kidB'), 'gr_users/kidA/photos/bag')));
  await assertFails(setDoc(doc(gr('kidB'), 'gr_users/kidA/photos/bag'), { img: 'x', updated: 1 }));
  await assertFails(getDoc(doc(anon(), 'gr_users/kidA')));
  await assertFails(setDoc(doc(anon(), 'gr_users/kidA/photos/bag'), { img: 'x', updated: 1 }));
});
test('getready: documents only accept the expected fields and sane sizes', async () => {
  const db = gr('kidA');
  await assertFails(setDoc(doc(db, 'gr_users/kidA'), { data: 5, updated: 1 }));
  await assertFails(setDoc(doc(db, 'gr_users/kidA'), { data: 'x'.repeat(400001), updated: 1 }));
  await assertFails(setDoc(doc(db, 'gr_users/kidA'), { ...grData, extra: 'nope' }));
  await assertFails(setDoc(doc(db, 'gr_users/kidA'), { ...grData, pids: 'bag' }));
  await assertFails(setDoc(doc(db, 'gr_users/kidA/photos/bag'), { img: 'x'.repeat(600001), updated: 1 }));
  await assertFails(setDoc(doc(db, 'gr_users/kidA/photos/bag'), { img: 'x', updated: 1, extra: 1 }));
});

// ---------- Read 20 cloud backup (r20_users/<uid>) ----------
const r20 = (uid, email = 'parent@example.com') => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const r20Data = { log: '{"v":1,"days":{}}', updated: 1 };

test('read20: a signed-in account can create, read, update and delete its own backup', async () => {
  const db = r20('parentA');
  await assertSucceeds(setDoc(doc(db, 'r20_users/parentA'), r20Data));
  await assertSucceeds(getDoc(doc(db, 'r20_users/parentA')));
  await assertSucceeds(setDoc(doc(db, 'r20_users/parentA'), { ...r20Data, log: '{"v":1,"days":{"2026-11-08":{}}}' }));
  await assertSucceeds(deleteDoc(doc(db, 'r20_users/parentA')));
});
test('read20: nobody can read or write another account\'s backup, and signed-out visitors get nothing', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'r20_users/parentA'), r20Data); });
  await assertFails(getDoc(doc(r20('parentB'), 'r20_users/parentA')));
  await assertFails(setDoc(doc(r20('parentB'), 'r20_users/parentA'), r20Data));
  await assertFails(deleteDoc(doc(r20('parentB'), 'r20_users/parentA')));
  await assertFails(getDoc(doc(anon(), 'r20_users/parentA')));
  await assertFails(setDoc(doc(anon(), 'r20_users/parentA'), r20Data));
});
test('read20: the backup document only accepts a log string of a sane size', async () => {
  const db = r20('parentA');
  await assertFails(setDoc(doc(db, 'r20_users/parentA'), { log: 5, updated: 1 }));
  await assertFails(setDoc(doc(db, 'r20_users/parentA'), { log: 'x'.repeat(900001), updated: 1 }));
  await assertFails(setDoc(doc(db, 'r20_users/parentA'), { ...r20Data, extra: 'nope' }));
});
test('read20: a backup account is not a Gameday Picks player or the owner', async () => {
  await assertFails(getDoc(doc(r20('parentA'), 'gp_players/player1')));
  await assertFails(getDoc(doc(r20('parentA'), 'projects/p1')));
});

// ---------- Photo Blueprint ----------
test('Photo Blueprint: anyone can read the public feed, nobody else can read a private sheet', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'sp_public/pubA')));
  await assertSucceeds(getDocs(query(collection(anon(), 'sp_public'), orderBy('created', 'desc'))));
  await assertSucceeds(getDoc(doc(photoB(), 'sp_public/pubA')));
  await assertFails(getDoc(doc(anon(), 'sp_sheets/privA')));
  await assertFails(getDoc(doc(photoB(), 'sp_sheets/privA')));
  await assertFails(getDocs(collection(photoB(), 'sp_sheets')));
  await assertSucceeds(getDoc(doc(photoA(), 'sp_sheets/privA')));
  await assertSucceeds(getDocs(query(collection(photoA(), 'sp_sheets'), where('uid', '==', 'photoA'))));
});

test('Photo Blueprint: pictures follow the sheet (public for all, private for the owner only)', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'sp_images/pubA')));
  await assertFails(getDoc(doc(anon(), 'sp_images/privA')));
  await assertFails(getDoc(doc(photoB(), 'sp_images/privA')));
  await assertSucceeds(getDoc(doc(photoA(), 'sp_images/privA')));
});

test('Photo Blueprint: a photographer writes their own sheets; strangers and anonymous visitors cannot', async () => {
  await assertSucceeds(setDoc(doc(photoB(), 'sp_sheets/newB'), spSheet('newB', 'photoB', false)));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_public/newB'), spSheet('newB', 'photoB', true)));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_images/newB'), { uid: 'photoB', public: true, data: 'data:image/jpeg;base64,CCCC', updated: 2 }));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/evil'), spSheet('evil', 'photoA', false)), 'uid must be yours');
  await assertFails(setDoc(doc(photoB(), 'sp_public/pubA'), spSheet('pubA', 'photoB', true)), 'cannot take over another id... (owner check on resource)');
  await assertFails(setDoc(doc(anon(), 'sp_public/anon1'), spSheet('anon1', 'nobody', true)));
  await assertFails(deleteDoc(doc(photoB(), 'sp_public/pubA')));
  await assertFails(deleteDoc(doc(photoB(), 'sp_images/pubA')));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_public/pubA')));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_images/pubA')));
});

test('Photo Blueprint: the shape is checked (keys, title, position, sizes, public flag on the feed)', async () => {
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x1'), spSheet('x1', 'photoB', false, { extra: 'field' })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x2'), spSheet('x2', 'photoB', false, { title: '' })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x3'), spSheet('x3', 'photoB', false, { lat: 91 })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x4'), spSheet('x4', 'photoB', false, { story: 'x'.repeat(6001) })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x5'), spSheet('x5', 'photoB', false, { thumb: 'x'.repeat(70001) })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x6'), spSheet('other', 'photoB', false)), 'id must match the path');
  await assertFails(setDoc(doc(photoB(), 'sp_public/x7'), spSheet('x7', 'photoB', false)), 'a feed sheet must be public');
  await assertFails(setDoc(doc(photoB(), 'sp_images/x8'), { uid: 'photoB', public: true, data: 'x'.repeat(950001), updated: 1 }), 'picture too big');
  await assertFails(setDoc(doc(photoB(), 'sp_images/x9'), { uid: 'photoB', public: true, data: 'ok', updated: 1, extra: 1 }));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_sheets/ok1'), spSheet('ok1', 'photoB', false, { story: 'x'.repeat(6000) })));
});

test('Photo Blueprint: the owner can take a sheet private again and update the picture flag', async () => {
  await assertSucceeds(updateDoc(doc(photoA(), 'sp_images/pubA'), { public: false }));
  await assertFails(updateDoc(doc(photoB(), 'sp_images/pubA'), { public: false }));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_public/pubA')));
  await assertFails(getDoc(doc(anon(), 'sp_images/pubA')));
});

test('Photo Blueprint accounts cannot read Toolbox, Picks or Read 20 data', async () => {
  await assertFails(getDoc(doc(photoA(), 'projects/p1')));
  await assertFails(getDocs(collection(photoA(), 'gp_picks')));
  await assertFails(getDoc(doc(photoA(), 'r20_users/someone')));
});

// ---------- Read 20 family link (r20_shared/<code>) ----------
const KEY = 'abcdefghijklmnopqrst';
const g = (uid) => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const anonUser = () => env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

test('read20 shared: two different Google accounts that know the code can both read and write the one log', async () => {
  await assertSucceeds(setDoc(doc(g('dad'), 'r20_shared/' + KEY), r20Data));
  await assertSucceeds(getDoc(doc(g('mom'), 'r20_shared/' + KEY)));
  await assertSucceeds(setDoc(doc(g('mom'), 'r20_shared/' + KEY), { ...r20Data, log: '{"v":1,"days":{"2026-11-09":{}}}' }));
});
test('read20 shared: no listing, no deleting, no signed-out or anonymous access', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'r20_shared/' + KEY), r20Data); });
  await assertFails(getDocs(collection(g('mom'), 'r20_shared')));
  await assertFails(deleteDoc(doc(g('mom'), 'r20_shared/' + KEY)));
  await assertFails(getDoc(doc(anon(), 'r20_shared/' + KEY)));
  await assertFails(getDoc(doc(anonUser(), 'r20_shared/' + KEY)));
  await assertFails(setDoc(doc(anonUser(), 'r20_shared/' + KEY), r20Data));
});
test('read20 shared: the code must be 20 letters/digits, and the document only takes a log string of sane size', async () => {
  await assertFails(setDoc(doc(g('dad'), 'r20_shared/short'), r20Data));
  await assertFails(setDoc(doc(g('dad'), 'r20_shared/ABCDEFGHIJKLMNOPQRST'), r20Data));
  await assertFails(setDoc(doc(g('dad'), 'r20_shared/' + KEY), { log: 5, updated: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'r20_shared/' + KEY), { log: 'x'.repeat(900001), updated: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'r20_shared/' + KEY), { ...r20Data, extra: 1 }));
});

// ---------- App numbers (install.js) ----------
const PHONE = 'k3j9x0a8b7c6d5e4';
const openDoc = { app: 'apps-picks', week: '2026-W46' };
test('app numbers: a signed-out phone can add one install and one open per week, and nothing else', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'app_installs/apps-picks~' + PHONE), openDoc));
  await assertSucceeds(setDoc(doc(anon(), 'app_opens/apps-picks~2026-W46~' + PHONE), openDoc));
  await assertFails(setDoc(doc(anon(), 'app_installs/apps-picks~' + PHONE), openDoc));
  await assertFails(getDoc(doc(anon(), 'app_installs/apps-picks~' + PHONE)));
  await assertFails(getDocs(collection(anon(), 'app_opens')));
  await assertFails(getDocs(collection(g('dad'), 'app_opens')));
  await assertFails(deleteDoc(doc(anon(), 'app_opens/apps-picks~2026-W46~' + PHONE)));
});
test('app numbers: the id must match the app, week and a 16-character phone code, with no extra fields', async () => {
  await assertFails(setDoc(doc(anon(), 'app_installs/cube-clock~' + PHONE), openDoc));
  await assertFails(setDoc(doc(anon(), 'app_installs/apps-picks~short'), openDoc));
  await assertFails(setDoc(doc(anon(), 'app_opens/apps-picks~2026-W45~' + PHONE), openDoc));
  await assertFails(setDoc(doc(anon(), 'app_opens/apps-picks~' + PHONE), openDoc));
  await assertFails(setDoc(doc(anon(), 'app_installs/apps-picks~' + PHONE), { ...openDoc, name: 'x' }));
  await assertFails(setDoc(doc(anon(), 'app_installs/apps-picks~' + PHONE), { app: 'apps-picks', week: 'soon' }));
});
test('app numbers: the owner can read every count', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'app_installs/apps-picks~' + PHONE), openDoc); });
  await assertSucceeds(getDocs(collection(owner(), 'app_installs')));
  await assertSucceeds(getDocs(collection(owner(), 'app_opens')));
});

test('app numbers: reads and goals are anonymous once-a-week counts like opens', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'app_reads/read20~2026-W46~' + PHONE), { app: 'read20', week: '2026-W46' }));
  await assertSucceeds(setDoc(doc(anon(), 'app_goals/read20~2026-W46~' + PHONE), { app: 'read20', week: '2026-W46' }));
  await assertFails(setDoc(doc(anon(), 'app_reads/read20~2026-W46~' + PHONE), { app: 'read20', week: '2026-W46' }));
  await assertFails(setDoc(doc(anon(), 'app_goals/read20~2026-W45~' + PHONE), { app: 'read20', week: '2026-W46' }));
  await assertFails(setDoc(doc(anon(), 'app_reads/read20~2026-W46~' + PHONE + 'x'), { app: 'read20', week: '2026-W46' }));
  await assertFails(setDoc(doc(anon(), 'app_goals/read20~2026-W47~' + PHONE), { app: 'read20', week: '2026-W47', name: 'x' }));
  await assertFails(getDocs(collection(anon(), 'app_reads')));
  await assertSucceeds(getDocs(collection(owner(), 'app_goals')));
});
