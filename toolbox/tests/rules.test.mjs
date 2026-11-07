// Rules tests for toolbox/firestore.rules. Run: cd toolbox && npm install && npm test
// Uses fake test accounts only. OWNER_EMAIL in the rules is swapped for a test address.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';

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
  });
});

const owner = () => env.authenticatedContext('owner', { email: OWNER, email_verified: true }).firestore();
const stranger = () => env.authenticatedContext('stranger', { email: 'someone@example.com', email_verified: true }).firestore();
const player = () => env.authenticatedContext('player1', { email: 'player@example.com', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

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
