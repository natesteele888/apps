// Rules tests for toolbox/firestore.rules. Run: cd toolbox && npm install && npm test
// Uses fake test accounts only. OWNER_EMAIL in the rules is swapped for a test address.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, query, where, orderBy, limitToLast, updateDoc, writeBatch } from 'firebase/firestore';

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

// ---------- Fairway golf tournaments (golf_events): the code is the key, no sign-in ----------
const FW_CODE = 'abcdefghijklmnopqrst';
const fwHoles = n => Array.from({ length: n }, (_, i) => ({ par: 4, hcp: i + 1, y: { blue: 400 } }));
const fwEvent = (extra = {}) => ({ v: 1, name: 'Test Cup', created: 1, updated: 1, rounds: 2, cur: 1, done: false,
  course: { name: 'Test Course', tees: [{ id: 'blue', name: 'Blue', color: '#1f4fa8' }], holes: fwHoles(18) },
  p: { pl0000001: { n: 'Test Golfer', tee: 'blue', g: 1, st: 1, at: 1, s: {} } }, ...extra });

test('fairway: anyone with the code can start, read and score a tournament, signed in or not', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent()));
  await assertSucceeds(getDoc(doc(anon(), 'golf_events/' + FW_CODE)));
  await assertSucceeds(getDoc(doc(stranger(), 'golf_events/' + FW_CODE)));
  await assertSucceeds(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { 'p.pl0000001.s.1_1': 4, updated: 2 }));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE), { 'p.pl0000002': { n: 'Second Golfer', tee: 'blue', g: 1, st: 1, at: 2, s: {} }, updated: 3 }));
  await assertSucceeds(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { cur: 2, done: true, name: 'Test Cup Final', updated: 4 }));
});

test('fairway: no listing, no deleting, and the code must be 20 letters and digits 2-7', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent()));
  await assertFails(getDocs(collection(anon(), 'golf_events')));
  await assertFails(getDocs(collection(stranger(), 'golf_events')));
  await assertFails(deleteDoc(doc(anon(), 'golf_events/' + FW_CODE)));
  await assertFails(setDoc(doc(anon(), 'golf_events/short'), fwEvent()));
  await assertFails(setDoc(doc(anon(), 'golf_events/ABCDEFGHIJKLMNOPQRST'), fwEvent()));
  await assertFails(setDoc(doc(anon(), 'golf_events/abcdefghijklmnopqrs1'), fwEvent()), '1 is not in the code alphabet');
});

test('fairway: the shape is checked, and the course and start time cannot change', async () => {
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ extra: 'x' })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ name: '' })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ rounds: 5 })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ cur: 3 })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ course: { name: 'X', tees: [], holes: fwHoles(18) } })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ course: { name: 'X', tees: [{ id: 'a' }], holes: fwHoles(12) } })));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ course: { name: 'X', tees: [{ id: 'a' }], holes: fwHoles(18), sample: true } })));
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ course: { name: 'Nine', tees: [{ id: 'a' }], holes: fwHoles(9) } })));
  await assertFails(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { 'course.name': 'Changed', updated: 2 }));
  await assertFails(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { created: 99 }));
  await assertFails(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { secret: 'x' }));
});

test('fairway: a tournament holds at most 120 players', async () => {
  const p = {}; for (let i = 0; i < 121; i++) p['pl' + String(i).padStart(7, '0')] = { n: 'G', tee: 'blue', g: 1, st: 1, at: 1, s: {} };
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ p })));
  delete p.pl0000120;
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ p })));
});

test('fairway: a tournament code gives no way into anything else', async () => {
  await assertFails(getDoc(doc(anon(), 'projects/p1')));
  await assertFails(getDocs(collection(anon(), 'cl_crews')));
});

test('fairway: closest to the pin distances live in the tournament, photos in small documents under it', async () => {
  const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00001'), { img: jpg, updated: 1 }), 'no tournament yet');
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent({ ctph: [7, 15], ctp: {} })));
  await assertSucceeds(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { 'ctp.1_7.pl0000001': { d: 14.5, m: 'gps', acc: 22, at: 5 }, updated: 5 }));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE), { ctph: [3, 7, 15], updated: 6 }));
  await assertFails(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { ctph: Array.from({ length: 19 }, (_, i) => i + 1), updated: 7 }));
  await assertFails(updateDoc(doc(anon(), 'golf_events/' + FW_CODE), { ctph: 'all', updated: 7 }));
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00001'), { img: jpg, updated: 1 }));
  await assertSucceeds(getDoc(doc(stranger(), 'golf_events/' + FW_CODE + '/ctp/ph00001')));
  await assertFails(getDocs(collection(anon(), 'golf_events/' + FW_CODE + '/ctp')));
  await assertFails(deleteDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00001')));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00002'), { img: 'javascript:alert(1)', updated: 1 }));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00002'), { img: jpg, updated: 1, who: 'x' }));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/ph00002'), { img: 'data:image/jpeg;base64,' + 'A'.repeat(600000), updated: 1 }));
  await assertFails(setDoc(doc(anon(), 'golf_events/' + FW_CODE + '/ctp/BAD!'), { img: jpg, updated: 1 }));
});

test('fairway phase 1: rally, format, teams, draft, matchups, picks and tee times fit in the tournament', async () => {
  const ref = doc(anon(), 'golf_events/' + FW_CODE);
  await assertSucceeds(setDoc(ref, fwEvent({ p: {}, rally: { on: true, date: '2026-11-21', note: '', goal: 8, r: { rs0000001: { n: 'Test Golfer', s: 'in', at: 1 } } },
    fmt: { kind: 'teams', nt: 2, draft: 'snake', clk: 60, mt: 'singles' }, tt: { date: '2026-11-21', where: '', g: {} } })));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE), { 'rally.r.rs0000002': { n: 'Second Golfer', s: 'maybe', at: 2 }, updated: 2 }));
  await assertSucceeds(updateDoc(ref, { 'p.rs0000001': { n: 'Test Golfer', tee: 'blue', g: 1, st: 1, at: 3, s: {} }, 'p.rs0000002': { n: 'Second Golfer', tee: 'blue', g: 1, st: 1, at: 3, s: {} },
    'rally.on': false, updated: 3 }));
  await assertSucceeds(updateDoc(ref, { teams: { t1: { n: 'Team 1', cap: 'rs0000001' }, t2: { n: 'Team 2', cap: 'rs0000002' } },
    dr: { on: true, done: false, ord: ['t1', 't2'], pk: [], at: 4 }, updated: 4 }));
  await assertSucceeds(updateDoc(ref, { 'dr.pk': ['rs0000001'], updated: 5 }));
  await assertSucceeds(updateDoc(ref, { 'm.mt0000001': { a: ['rs0000001'], b: ['rs0000002'], r: 1 }, 'pk.rs0000002': 't1', 'tt.g.1': '08:10', updated: 6 }));
  // shapes and caps
  await assertFails(updateDoc(ref, { 'rally.extra': 'x', updated: 7 }));
  await assertFails(updateDoc(ref, { 'fmt.extra': 1, updated: 7 }));
  await assertFails(updateDoc(ref, { 'dr.who': 'x', updated: 7 }));
  await assertFails(updateDoc(ref, { 'tt.home': 'x', updated: 7 }));
  await assertFails(updateDoc(ref, { teams: Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['t' + i, { n: 'T' }])), updated: 7 }));
  await assertFails(updateDoc(ref, { m: Object.fromEntries(Array.from({ length: 61 }, (_, i) => ['mt' + String(i).padStart(6, '0'), { a: [], b: [], r: 1 }])), updated: 7 }));
  await assertFails(updateDoc(ref, { 'dr.ord': 'all', updated: 7 }));
});

test('fairway games: bingo marks fit in the tournament, capped', async () => {
  const ref = doc(anon(), 'golf_events/' + FW_CODE);
  await assertSucceeds(setDoc(ref, fwEvent()));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE), { 'bg.pl0000001': [3, 7], updated: 2 }));
  await assertFails(updateDoc(ref, { bg: 'all', updated: 3 }));
  await assertFails(updateDoc(ref, { bg: Object.fromEntries(Array.from({ length: 121 }, (_, i) => ['pl' + String(i).padStart(7, '0'), [3]])), updated: 3 }));
});

test('fairway games: side game settings and hole marks fit, capped (a tally only, no money fields)', async () => {
  const ref = doc(anon(), 'golf_events/' + FW_CODE);
  await assertSucceeds(setDoc(ref, fwEvent()));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE), { bets: { on: ['skins', 'wolf'], amt: { skins: 1, wolf: 2 }, out: [] }, updated: 2 }));
  await assertSucceeds(updateDoc(ref, { 'bm.1_4.tp': ['pl0000001'], 'bm.1_4.wp.1': 'lone', updated: 3 }));
  await assertFails(updateDoc(ref, { bets: { on: ['skins'], card: '4242' }, updated: 4 }), 'no other fields');
  await assertFails(updateDoc(ref, { bets: { on: Array.from({ length: 11 }, () => 'skins') }, updated: 4 }));
  await assertFails(updateDoc(ref, { bm: 'all', updated: 4 }));
  await assertFails(updateDoc(ref, { bm: Object.fromEntries(Array.from({ length: 73 }, (_, i) => ['k' + i, {}])), updated: 4 }));
});

test('fairway phase 1: the chat lives under the tournament; votes and birdie shouts are the only edits', async () => {
  const chat = id => doc(anon(), 'golf_events/' + FW_CODE + '/chat/' + id);
  const msg = { k: 'm', by: 'pl0000001', n: 'Test Golfer', t: 'On my way', at: 1 };
  await assertFails(setDoc(chat('msg0000000001'), msg), 'no tournament yet');
  await assertSucceeds(setDoc(doc(anon(), 'golf_events/' + FW_CODE), fwEvent()));
  await assertSucceeds(setDoc(chat('msg0000000001'), msg));
  await assertSucceeds(getDocs(query(collection(stranger(), 'golf_events/' + FW_CODE + '/chat'), orderBy('at'), limitToLast(150))));
  await assertFails(updateDoc(chat('msg0000000001'), { t: 'Edited' }), 'a message cannot be changed');
  await assertFails(deleteDoc(chat('msg0000000001')));
  await assertFails(setDoc(chat('msg0000000002'), { ...msg, t: '' }));
  await assertFails(setDoc(chat('msg0000000002'), { ...msg, t: 'x'.repeat(501) }));
  await assertFails(setDoc(chat('msg0000000002'), { ...msg, email: 'x' }));
  await assertFails(setDoc(chat('BAD!'), msg));
  // a poll: anyone can vote, nothing else can change
  const poll = { k: 'p', by: 'pl0000001', n: 'Test Golfer', t: 'Power rankings', o: ['Team 1', 'Team 2'], v: {}, at: 2 };
  await assertSucceeds(setDoc(chat('poll000000001'), poll));
  await assertSucceeds(updateDoc(doc(stranger(), 'golf_events/' + FW_CODE + '/chat/poll000000001'), { 'v.pl0000002': 1 }));
  await assertFails(updateDoc(chat('poll000000001'), { o: ['Rigged', 'Team 2'] }));
  await assertFails(setDoc(chat('poll000000002'), { ...poll, o: ['Only one'] }));
  // the app's birdie shout can be replaced by a better one (birdie to eagle), but stays a shout
  const shout = { k: 'a', n: 'Fairway', t: 'Birdie! Test Golfer on 7.', at: 3 };
  await assertSucceeds(setDoc(chat('apl0000001r1h7'), shout));
  await assertSucceeds(setDoc(chat('apl0000001r1h7'), { ...shout, t: 'Eagle! Test Golfer on 7.' }));
  await assertFails(setDoc(chat('apl0000001r1h7'), { ...msg }));
  // a chat for a code nobody has can't be started, and the chat gives no way into other tournaments' lists
  await assertFails(setDoc(doc(anon(), 'golf_events/zzzzzzzzzzzzzzzzzzzz/chat/msg0000000001'), msg));
  await assertFails(getDocs(collection(anon(), 'golf_events')));
});

// ---------- Watch link (fw_links, fw_pair): the 26-letter link code is the key, no sign-in ----------
const WL_KEY = 'abcdefghijklmnopqrstuvwxyz';
const WL_CODE = 'abcd2345';
const wlNow = () => new Date();

test('watch link: anyone with the link code can create, read and update it, signed in or not', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { gr: '{"v":2}', updated: wlNow() }));
  await assertSucceeds(getDoc(doc(anon(), 'fw_links/' + WL_KEY)));
  await assertSucceeds(updateDoc(doc(anon(), 'fw_links/' + WL_KEY), { w: '{"v":1,"e":[]}' }));
  await assertSucceeds(updateDoc(doc(stranger(), 'fw_links/' + WL_KEY), { cc: '{}', r20: '{}', pp: '{}', gp: '{}', sc: '{"v":1,"ev":[]}', updated: wlNow() }));
});

test('watch link: no listing, no deleting, the code must be 26 letters and digits 2-7, and only the known text fields', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { gr: '{}' }));
  await assertFails(getDocs(collection(anon(), 'fw_links')));
  await assertFails(getDocs(collection(stranger(), 'fw_links')));
  await assertFails(deleteDoc(doc(anon(), 'fw_links/' + WL_KEY)));
  await assertFails(setDoc(doc(anon(), 'fw_links/short'), { gr: '{}' }));
  await assertFails(setDoc(doc(anon(), 'fw_links/abcdefghijklmnopqrstuvwxy1'), { gr: '{}' }), '1 is not in the code alphabet');
  await assertFails(setDoc(doc(anon(), 'fw_links/ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { gr: '{}' }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { gr: '{}', extra: 'x' }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { gr: { not: 'text' } }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { cc: 'x'.repeat(20001) }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { lk: '{}' }), 'Locker is not on the watch');
  await assertSucceeds(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { pp: 'x'.repeat(30000) }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { pp: 'x'.repeat(40001) }));
  await assertFails(setDoc(doc(anon(), 'fw_links/' + WL_KEY), { gr: '{}', updated: 'yesterday' }));
});

test('watch link pairing: a note is created once under the watch code, read and removed, never changed or listed', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'fw_pair/' + WL_CODE), { k: WL_KEY, at: wlNow() }));
  await assertSucceeds(getDoc(doc(anon(), 'fw_pair/' + WL_CODE)));
  await assertFails(updateDoc(doc(anon(), 'fw_pair/' + WL_CODE), { k: 'zyxwvutsrqponmlkjihgfedcba' }));
  await assertFails(getDocs(collection(anon(), 'fw_pair')));
  await assertSucceeds(deleteDoc(doc(anon(), 'fw_pair/' + WL_CODE)));
  await assertFails(setDoc(doc(anon(), 'fw_pair/abcd234'), { k: WL_KEY, at: wlNow() }), 'the code is 8 characters');
  await assertFails(setDoc(doc(anon(), 'fw_pair/' + WL_CODE), { k: 'short', at: wlNow() }));
  await assertFails(setDoc(doc(anon(), 'fw_pair/' + WL_CODE), { k: WL_KEY, at: wlNow(), x: 1 }));
  await assertFails(setDoc(doc(anon(), 'fw_pair/' + WL_CODE), { k: WL_KEY }));
});

test('watch link: a link or pairing code gives no way into anything else', async () => {
  await assertFails(getDoc(doc(anon(), 'gr_users/' + WL_KEY)));
  await assertFails(getDoc(doc(anon(), 'r20_shared/' + WL_KEY.slice(0, 20))));
});

// ---------- Gameday Picks from the watch: an anonymous watch sign-in that a player's phone has okayed ----------
const WATCH = 'watchAnon0123';
const watchDb = (uid = WATCH) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const wPicks = (uid, week, extra = {}) => ({ uid, week, picks: { g1: 'BUF' }, updatedAt: '2026-11-17T12:00:00Z', ...extra });

test('picks from the watch: nothing until the player okays the watch, then only that player\'s own NFL picks', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12')); });
  await assertFails(getDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12')), 'not okayed yet');
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12')));
  await assertFails(setDoc(doc(watchDb(), 'gp_watch/' + WATCH), { uid: WATCH, at: 'now' }), 'a watch cannot okay itself');
  await assertFails(setDoc(doc(stranger(), 'gp_watch/' + WATCH), { uid: 'stranger', at: 'now' }), 'only a player can okay a watch');
  await assertFails(setDoc(doc(player(), 'gp_watch/' + WATCH), { uid: 'someoneElse', at: 'now' }), 'only for themselves');
  await assertFails(setDoc(doc(player(), 'gp_watch/' + WATCH), { uid: 'player1', at: 'now', x: 1 }));
  await assertSucceeds(setDoc(doc(player(), 'gp_watch/' + WATCH), { uid: 'player1', at: '2026-11-17T12:00:00Z' }));
  await assertSucceeds(getDoc(doc(watchDb(), 'gp_watch/' + WATCH)));
  await assertFails(getDocs(collection(player(), 'gp_watch')), 'no listing watches');

  await assertSucceeds(getDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12')));
  await assertSucceeds(getDoc(doc(watchDb(), 'gp_picks/player1_2026-2-13')), 'a week with no picks yet reads as missing, not refused');
  await assertSucceeds(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-13'), wPicks('player1', '2026-2-13')));
  await assertSucceeds(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12', { picks: { g1: 'NYJ', g2: 'KC' } })));
  await assertFails(getDocs(collection(watchDb(), 'gp_picks')), 'the watch cannot see anyone else\'s picks');
  await assertFails(getDoc(doc(watchDb(), 'gp_players/player1')));
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player2_2026-2-12'), wPicks('player2', '2026-2-12')), 'another player');
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player1_nba-2026-11-09'), wPicks('player1', 'nba-2026-11-09')), 'NFL only');
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12', { extra: 1 })));
  const many = {}; for (let i = 0; i < 41; i++) many['g' + i] = 'BUF';
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12', { picks: many })));
  await assertFails(setDoc(doc(watchDb('otherWatch99'), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12')), 'a different watch');
});

test('picks from the watch: another player cannot take over a watch, and a removed player\'s watch stops working', async () => {
  await assertSucceeds(setDoc(doc(player(), 'gp_watch/' + WATCH), { uid: 'player1', at: '2026-11-17T12:00:00Z' }));
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'gp_players/player2'), { name: 'Q', code: 'GOOD', joinedAt: 1 }); });
  const p2 = env.authenticatedContext('player2', { email: 'p2@example.com', email_verified: true }).firestore();
  await assertFails(setDoc(doc(p2, 'gp_watch/' + WATCH), { uid: 'player2', at: 'now' }));
  await assertFails(deleteDoc(doc(p2, 'gp_watch/' + WATCH)));
  await assertSucceeds(updateDoc(doc(player(), 'gp_watch/' + WATCH), { at: '2026-11-18T12:00:00Z' }));
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), 'gp_players/player1')); });
  await assertFails(setDoc(doc(watchDb(), 'gp_picks/player1_2026-2-12'), wPicks('player1', '2026-2-12')));
  await assertSucceeds(deleteDoc(doc(owner(), 'gp_watch/' + WATCH)), 'the owner can clear it');
});
