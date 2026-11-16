// Rules tests for toolbox/firestore.rules. Run: cd toolbox && npm install && npm test
// Uses fake test accounts only. OWNER_EMAIL in the rules is swapped for a test address.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, query, where, orderBy, updateDoc, writeBatch } from 'firebase/firestore';

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
    // Photo Blueprint: a public sheet by photographer A (its public copy in sp_feed), an old-style shared copy that still holds
    // the name and exact pin (sp_public), a private one by A, and the pictures
    await setDoc(doc(db, 'sp_feed/pubA'), spFeed('pubA', 'photoA'));
    await setDoc(doc(db, 'sp_public/pubA'), spSheet('pubA', 'photoA', true, { lat: 41.123456, lon: -81.512345, author: 'A', place: 'Somewhere exact' }));
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
// The public copy everyone can read: no author or place, the pin rounded to a tenth of a degree.
const spFeed = (id, uid, extra = {}) => { const { author, place, ...o } = spSheet(id, uid, true, { lat: 41.1, lon: -81.5 }); return { ...o, ...extra }; };

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
  await assertSucceeds(getDoc(doc(anon(), 'sp_feed/pubA')));
  await assertSucceeds(getDocs(query(collection(anon(), 'sp_feed'), orderBy('created', 'desc'))));
  await assertSucceeds(getDoc(doc(photoB(), 'sp_feed/pubA')));
  await assertFails(getDoc(doc(anon(), 'sp_sheets/privA')));
  await assertFails(getDoc(doc(photoB(), 'sp_sheets/privA')));
  await assertFails(getDocs(collection(photoB(), 'sp_sheets')));
  await assertSucceeds(getDoc(doc(photoA(), 'sp_sheets/privA')));
  await assertSucceeds(getDocs(query(collection(photoA(), 'sp_sheets'), where('uid', '==', 'photoA'))));
});

test('Photo Blueprint: the old shared copies (name and exact pin) are no longer public; only their owner can read and clear them', async () => {
  await assertFails(getDoc(doc(anon(), 'sp_public/pubA')), 'signed out');
  await assertFails(getDocs(query(collection(anon(), 'sp_public'), orderBy('created', 'desc'))), 'signed out list');
  await assertFails(getDoc(doc(photoB(), 'sp_public/pubA')), 'another photographer');
  await assertFails(getDocs(collection(photoB(), 'sp_public')));
  await assertSucceeds(getDoc(doc(photoA(), 'sp_public/pubA')));
  await assertSucceeds(getDocs(query(collection(photoA(), 'sp_public'), where('uid', '==', 'photoA'))), 'the cleanup query');
  await assertFails(setDoc(doc(photoB(), 'sp_public/newB'), spSheet('newB', 'photoB', true)), 'nothing new goes there');
  await assertFails(updateDoc(doc(photoA(), 'sp_public/pubA'), { title: 'Still exact' }), 'not even by its owner');
  await assertFails(deleteDoc(doc(photoB(), 'sp_public/pubA')));
  // The cleanup the app runs on sign-in: the public copy into the feed and the old one deleted, in one batch.
  const db = photoA(), b = writeBatch(db);
  b.set(doc(db, 'sp_feed/pubA'), spFeed('pubA', 'photoA', { title: 'Moved' }));
  b.delete(doc(db, 'sp_public/pubA'));
  await assertSucceeds(b.commit());
  await assertFails(getDoc(doc(photoA(), 'sp_public/pubA')), 'gone (and a missing doc reads as refused)');
});

test('Photo Blueprint: the feed refuses the name, the place and an exact pin', async () => {
  await assertFails(setDoc(doc(photoB(), 'sp_feed/f1'), spFeed('f1', 'photoB', { author: 'Someone' })), 'no name');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/f2'), spFeed('f2', 'photoB', { place: '12 Some Street' })), 'no place');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/f3'), spFeed('f3', 'photoB', { lat: 41.123456 })), 'exact latitude');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/f4'), spFeed('f4', 'photoB', { lon: -81.51 })), 'two decimals is still too exact');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/f5'), spFeed('f5', 'photoB', { public: false })), 'a feed sheet must be public');
  await assertSucceeds(setDoc(doc(photoB(), 'sp_feed/ok1'), spFeed('ok1', 'photoB', { lat: -33.9, lon: 151.2 })));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_feed/ok2'), spFeed('ok2', 'photoB', { lat: 41, lon: -81 })), 'whole degrees');
  await assertSucceeds(setDoc(doc(photoB(), 'sp_feed/ok3'), spFeed('ok3', 'photoB', { lat: 0.3, lon: -0.7 })));
});

test('Photo Blueprint: pictures follow the sheet (public for all, private for the owner only)', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'sp_images/pubA')));
  await assertFails(getDoc(doc(anon(), 'sp_images/privA')));
  await assertFails(getDoc(doc(photoB(), 'sp_images/privA')));
  await assertSucceeds(getDoc(doc(photoA(), 'sp_images/privA')));
});

test('Photo Blueprint: a photographer writes their own sheets; strangers and anonymous visitors cannot', async () => {
  await assertSucceeds(setDoc(doc(photoB(), 'sp_sheets/newB'), spSheet('newB', 'photoB', false)));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_feed/newB'), spFeed('newB', 'photoB')));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_images/newB'), { uid: 'photoB', public: true, data: 'data:image/jpeg;base64,CCCC', updated: 2 }));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/evil'), spSheet('evil', 'photoA', false)), 'uid must be yours');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/pubA'), spFeed('pubA', 'photoB')), 'cannot take over another id (owner check on resource)');
  await assertFails(setDoc(doc(anon(), 'sp_feed/anon1'), spFeed('anon1', 'nobody')));
  await assertFails(deleteDoc(doc(photoB(), 'sp_feed/pubA')));
  await assertFails(deleteDoc(doc(photoB(), 'sp_images/pubA')));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_feed/pubA')));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_images/pubA')));
});

test('Photo Blueprint: saving and deleting are one batch each, even when some copies were never made', async () => {
  // Publish: the owner's copy, the public copy, the picture.
  let db = photoB(), b = writeBatch(db);
  b.set(doc(db, 'sp_sheets/batchB'), spSheet('batchB', 'photoB', true, { lat: 41.123456, lon: -81.512345, author: 'B', place: 'Exact' }));
  b.set(doc(db, 'sp_feed/batchB'), spFeed('batchB', 'photoB'));
  b.set(doc(db, 'sp_images/batchB'), { uid: 'photoB', public: true, data: 'data:image/jpeg;base64,DDDD', updated: 3 });
  await assertSucceeds(b.commit());
  // A private sheet clears a public copy that was never there.
  db = photoB(); b = writeBatch(db);
  b.set(doc(db, 'sp_sheets/quietB'), spSheet('quietB', 'photoB', false));
  b.delete(doc(db, 'sp_feed/quietB'));
  await assertSucceeds(b.commit());
  // Delete clears every copy, including an old-style one that was never made.
  db = photoB(); b = writeBatch(db);
  for (const c of ['sp_sheets', 'sp_feed', 'sp_public', 'sp_images']) b.delete(doc(db, c + '/batchB'));
  await assertSucceeds(b.commit());
  await assertFails(deleteDoc(doc(photoB(), 'sp_sheets/privA')), 'still not someone else\'s');
});

test('Photo Blueprint: the shape is checked (keys, title, position, sizes)', async () => {
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x1'), spSheet('x1', 'photoB', false, { extra: 'field' })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x2'), spSheet('x2', 'photoB', false, { title: '' })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x3'), spSheet('x3', 'photoB', false, { lat: 91 })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x4'), spSheet('x4', 'photoB', false, { story: 'x'.repeat(6001) })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x5'), spSheet('x5', 'photoB', false, { thumb: 'x'.repeat(70001) })));
  await assertFails(setDoc(doc(photoB(), 'sp_sheets/x6'), spSheet('other', 'photoB', false)), 'id must match the path');
  await assertFails(setDoc(doc(photoB(), 'sp_feed/x7'), spFeed('x7', 'photoB', { extra: 'field' })));
  await assertFails(setDoc(doc(photoB(), 'sp_feed/x8'), spFeed('x8', 'photoB', { title: '' })));
  await assertFails(setDoc(doc(photoB(), 'sp_images/x8'), { uid: 'photoB', public: true, data: 'x'.repeat(950001), updated: 1 }), 'picture too big');
  await assertFails(setDoc(doc(photoB(), 'sp_images/x9'), { uid: 'photoB', public: true, data: 'ok', updated: 1, extra: 1 }));
  await assertSucceeds(setDoc(doc(photoB(), 'sp_sheets/ok1'), spSheet('ok1', 'photoB', false, { story: 'x'.repeat(6000) })));
});

test('Photo Blueprint: the owner can take a sheet private again and update the picture flag', async () => {
  await assertSucceeds(updateDoc(doc(photoA(), 'sp_images/pubA'), { public: false }));
  await assertFails(updateDoc(doc(photoB(), 'sp_images/pubA'), { public: false }));
  await assertSucceeds(deleteDoc(doc(photoA(), 'sp_feed/pubA')));
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


// ---------- Catch Log crews (apps/catchlog) ----------
const CREW = 'abcdefghjkmnpqrstuv2345k9x';
const crewData = { data: '{"profiles":[],"gear":{},"sessions":[],"spots":[]}', updated: 1 };
test('catchlog: two Google accounts that know the crew code can both read and write the crew and its photos', async () => {
  await assertSucceeds(setDoc(doc(g('dad'), 'cl_crews/' + CREW), crewData));
  await assertSucceeds(getDoc(doc(g('mom'), 'cl_crews/' + CREW)));
  await assertSucceeds(setDoc(doc(g('mom'), 'cl_crews/' + CREW), { ...crewData, updated: 2 }));
  await assertSucceeds(setDoc(doc(g('dad'), 'cl_crews/' + CREW + '/photos/ph_1'), { img: 'data:image/jpeg;base64,AAAA', updated: 1 }));
  await assertSucceeds(getDoc(doc(g('mom'), 'cl_crews/' + CREW + '/photos/ph_1')));
  await assertSucceeds(deleteDoc(doc(g('mom'), 'cl_crews/' + CREW + '/photos/ph_1')));
});
test('catchlog: no listing crews or photos, no deleting a crew, no signed-out or anonymous access', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'cl_crews/' + CREW), crewData);
    await setDoc(doc(ctx.firestore(), 'cl_crews/' + CREW + '/photos/ph_1'), { img: 'x', updated: 1 });
  });
  await assertFails(getDocs(collection(g('mom'), 'cl_crews')));
  await assertFails(getDocs(collection(g('mom'), 'cl_crews/' + CREW + '/photos')));
  await assertFails(deleteDoc(doc(g('mom'), 'cl_crews/' + CREW)));
  await assertFails(getDoc(doc(anon(), 'cl_crews/' + CREW)));
  await assertFails(getDoc(doc(anonUser(), 'cl_crews/' + CREW)));
  await assertFails(setDoc(doc(anonUser(), 'cl_crews/' + CREW), crewData));
  await assertFails(getDoc(doc(anonUser(), 'cl_crews/' + CREW + '/photos/ph_1')));
});
test('catchlog: the code must be a long lowercase code, and documents only take the expected fields and sizes', async () => {
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/short'), crewData));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/ABCDEFGHJKMNPQRSTUV2345K9X'), crewData));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW), { data: 5, updated: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW), { data: 'x'.repeat(900001), updated: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW), { ...crewData, extra: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW), { data: '{}', updated: 'now' }));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW + '/photos/ph_1'), { img: 'x'.repeat(600001), updated: 1 }));
  await assertFails(setDoc(doc(g('dad'), 'cl_crews/' + CREW + '/photos/ph_1'), { img: 'x', updated: 1, who: 'a' }));
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

test('this is me (app_me): anyone can mark a random phone code once; only the owner reads them', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'app_me/abcdefghij012345'), { app: 'lybs-dashboard' }));
  await assertFails(setDoc(doc(anon(), 'app_me/abcdefghij012345'), { app: 'apps-toolbox' }), 'no changing it later');
  await assertFails(setDoc(doc(anon(), 'app_me/short'), { app: 'lybs-dashboard' }), 'code must be 16 letters or digits');
  await assertFails(setDoc(doc(anon(), 'app_me/ABCDEFGHIJ012345'), { app: 'lybs-dashboard' }), 'lower case only');
  await assertFails(setDoc(doc(anon(), 'app_me/zzzzzzzzzz012345'), { app: 'lybs-dashboard', name: 'Someone' }), 'nothing but the app');
  await assertFails(setDoc(doc(anon(), 'app_me/yyyyyyyyyy012345'), { app: 'not ok!' }), 'app must look like a folder key');
  await assertFails(getDoc(doc(anon(), 'app_me/abcdefghij012345')), 'signed out cannot read');
  await assertFails(getDocs(collection(stranger(), 'app_me')), 'another account cannot list');
  await assertSucceeds(getDocs(collection(owner(), 'app_me')));
  await assertFails(deleteDoc(doc(anon(), 'app_me/abcdefghij012345')), 'signed out cannot delete');
  await assertSucceeds(deleteDoc(doc(owner(), 'app_me/abcdefghij012345')), 'the owner can clear one');
  // The owner's own "seen" list for the new-phone badge rides on the owner-only rule at the top.
  await assertSucceeds(setDoc(doc(owner(), 'app_seen/watch'), { codes: ['abcdefghij012345'], updated: 1 }));
  await assertFails(getDoc(doc(stranger(), 'app_seen/watch')));
});
