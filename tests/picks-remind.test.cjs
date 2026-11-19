// Gameday Picks pick reminders: who gets one and when (picks/remind.js), then the hourly sender (picks/reminders/Code.gs) run
// in Node with Apps Script, ESPN, Firestore and Cloud Messaging faked. No network, made-up players and teams only.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// in the repo (tests/) or in run.sh's temp layout (<work>/tests beside <work>/apps)
const APP = fs.existsSync(path.join(__dirname, '../apps/picks')) ? path.join(__dirname, '../apps/picks') : path.join(__dirname, '../picks');
const R = require(path.join(APP, 'remind.js'));
const results = [];
function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));

// A week in November (Eastern = UTC-5): Thursday 8:15 PM, Sunday 1:00 PM x2, Sunday 4:25 PM, Monday 8:15 PM.
const G = (date, a, h, state) => ({ date, state: state || 'pre', away: { abbr: a }, home: { abbr: h } });
const games = {
  thu: G('2026-11-20T01:15:00Z', 'AAA', 'BBB'),
  sun1: G('2026-11-22T18:00:00Z', 'CCC', 'DDD'),
  sun2: G('2026-11-22T18:00:00Z', 'EEE', 'FFF'),
  sun4: G('2026-11-22T21:25:00Z', 'GGG', 'HHH'),
  mon: G('2026-11-24T01:15:00Z', 'III', 'JJJ')
};
const at = s => new Date(s).getTime();
const me = (extra) => Object.assign({ uid: 'u1', name: 'Player One', on: true, picks: {}, locked: false }, extra);

test('Eastern days and times', () => {
  eq(R.etDay(at('2026-11-20T01:15:00Z')), '2026-11-19', 'Thursday night game is Thursday in the East');
  eq(R.etTime(at('2026-11-20T01:15:00Z')), '8:15 PM');
});
test('Thursday: nothing picked, reminder about two hours before kickoff, not at noon', () => {
  eq(R.due(me(), games, {}, at('2026-11-19T17:00:00Z')), null, 'noon is too early');
  const d = R.due(me(), games, {}, at('2026-11-19T23:30:00Z'));
  assert(d, 'due at 6:30 PM');
  eq(d.count, 5); eq(d.todayCount, 1); eq(d.day, '2026-11-19');
  eq(d.body, 'Player, you have 5 games not picked yet. 1 game today. First kickoff 8:15 PM ET (AAA at BBB).');
});
test('only once per game day', () => {
  const d = R.due(me(), games, {}, at('2026-11-19T23:30:00Z'));
  eq(R.due(me(), games, { [d.key]: 'x' }, at('2026-11-20T00:30:00Z')), null);
});
test('Thursday game picked: no Thursday reminder; Sunday morning reminder for the early games', () => {
  const p = me({ picks: { thu: 'AAA' } });
  eq(R.due(p, games, {}, at('2026-11-19T23:30:00Z')), null);
  const d = R.due(p, games, {}, at('2026-11-22T16:00:00Z')); // 11 AM Sunday
  assert(d); eq(d.count, 4); eq(d.todayCount, 3);
  assert(/First kickoff 1:00 PM ET/.test(d.body), d.body);
});
test('early games picked: the reminder moves to before the late game', () => {
  const p = me({ picks: { thu: 'AAA', sun1: 'CCC', sun2: 'FFF', mon: 'III' } });
  eq(R.due(p, games, {}, at('2026-11-22T16:00:00Z')), null, '11 AM: late game still 5 hours off');
  const d = R.due(p, games, {}, at('2026-11-22T19:30:00Z'));
  assert(d); assert(/4:25 PM ET \(GGG at HHH\)/.test(d.body), d.body);
  eq(d.body.includes('today'), false, 'all left are today, so no "today" count');
});
test('all picked, locked in, turned off, or the game already started: no reminder', () => {
  const now = at('2026-11-19T23:30:00Z');
  eq(R.due(me({ picks: { thu: 'A', sun1: 'C', sun2: 'E', sun4: 'G', mon: 'I' } }), games, {}, now), null, 'all picked');
  eq(R.due(me({ locked: '2026-11-19T00:00:00Z' }), games, {}, now), null, 'locked');
  eq(R.due(me({ on: false }), games, {}, now), null, 'off');
  eq(R.due(me(), games, {}, at('2026-11-20T01:13:00Z')), null, 'two minutes before is too late');
  eq(R.due(me(), Object.assign({}, games, { thu: Object.assign({}, games.thu, { state: 'in' }) }), {}, now), null, 'game already on');
});
test('dueAll and pruneSent', () => {
  const ds = R.dueAll([me(), me({ uid: 'u2', name: 'Two', picks: { thu: 'B' } })], games, {}, at('2026-11-19T23:30:00Z'));
  eq(ds.length, 1); eq(ds[0].uid, 'u1');
  const kept = R.pruneSent({ 'a|2026-11-01': 1, 'a|2026-11-15': 1 }, at('2026-11-19T23:30:00Z'));
  eq(JSON.stringify(kept), JSON.stringify({ 'a|2026-11-15': 1 }));
});

/* ---------- the sender, with Apps Script faked ---------- */
function sender(state) {
  const calls = [], props = {}, mail = [];
  const fsVal = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
  const fsDoc = (name, o) => ({ name: 'projects/nates-toolbox/databases/(default)/documents/' + name, fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsVal(v)])) });
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
  const espn = { season: { year: 2026, type: 2 }, week: { number: 12 }, events: Object.entries(games).map(([id, g]) => ({ id, date: g.date,
    competitions: [{ status: { type: { state: g.state } }, competitors: [{ homeAway: 'away', team: { abbreviation: g.away.abbr } }, { homeAway: 'home', team: { abbreviation: g.home.abbr } }] }] })) };
  const ctx = {
    UrlFetchApp: { fetch(url, o) {
      o = o || {}; calls.push([o.method || 'get', url, o.payload, o.headers]);
      if (url.includes('site.api.espn.com')) return resp(200, espn);
      if (url.includes('fcm.googleapis.com')) { const t = JSON.parse(o.payload).message.token; return state.fcm[t] === 'dead' ? resp(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) : resp(200, {}); }
      const m = url.match(/documents\/([^?]+)/); const p = decodeURIComponent(m[1]);
      if ((o.method || 'get') === 'patch') { state.patched.push([p, JSON.parse(o.payload)]); return resp(200, {}); }
      if (p === 'gp_remind') return resp(200, { documents: Object.entries(state.remind).map(([u, r]) => fsDoc('gp_remind/' + u, r)) });
      const doc = state.docs[p]; return doc ? resp(200, fsDoc(p, doc)) : resp(404, {});
    } },
    ScriptApp: { getOAuthToken: () => 'owner-token' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    MailApp: { sendEmail: m => mail.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Logger: { log() {} },
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(state.now); } static now() { return state.now; } },
    Intl, JSON, Object, Array, String, Number, Math, RegExp, Error, encodeURIComponent, decodeURIComponent
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'remind.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(APP, 'reminders/Code.gs'), 'utf8'), ctx);
  return { ctx, calls, props, mail };
}
const baseState = () => ({
  now: at('2026-11-19T23:30:00Z'), fcm: {}, patched: [],
  remind: { own1: { on: true, tok: { ph1: { t: 'tokA', at: 'x' } } }, kid1: { on: true, tok: { ph2: { t: 'tokB', at: 'x' } } }, off1: { on: false, tok: {} } },
  docs: { 'gp_players/own1': { name: 'Owner', code: 'OWNER' }, 'gp_players/kid1': { name: 'Kid', code: 'GOOD' }, 'gp_players/off1': { name: 'Off', code: 'GOOD' },
    'gp_picks/kid1_2026-2-12': { picks: { thu: 'AAA', sun1: 'C', sun2: 'E', sun4: 'G', mon: 'I' } } }
});
test('sender: sends to the player who still has picks to make, with the owner\'s own access, once', () => {
  const st = baseState(), s = sender(st);
  s.ctx.run();
  const pushes = s.calls.filter(c => c[1].includes('fcm.googleapis.com'));
  eq(pushes.length, 1, 'one push (the kid picked everything; one player is off)');
  const msg = JSON.parse(pushes[0][2]).message;
  eq(msg.token, 'tokA'); eq(msg.webpush.notification.title, '🏈 Make your picks');
  assert(/Owner, you have 5 games/.test(msg.data.body), msg.data.body);
  eq(pushes[0][3]['x-goog-user-project'], 'nates-toolbox'); eq(pushes[0][3].Authorization, 'Bearer owner-token');
  assert(s.calls.some(c => c[1].includes('gp_picks/own1_2026-2-12')), 'read this week\'s picks');
  eq(s.mail.length, 0, 'push worked, so no email');
  s.ctx.run();
  eq(s.calls.filter(c => c[1].includes('fcm.googleapis.com')).length, 1, 'not again the same day');
});
test('sender: a phone that is gone is dropped; the owner gets an email instead', () => {
  const st = baseState(); st.fcm.tokA = 'dead'; const s = sender(st);
  s.ctx.run();
  eq(st.patched.length, 1); eq(st.patched[0][0], 'gp_remind/own1');
  eq(JSON.stringify(st.patched[0][1].fields.tok), JSON.stringify({ mapValue: { fields: {} } }));
  eq(s.mail.length, 1); eq(s.mail[0].to, 'owner@example.com');
  assert(/5 games not picked/.test(s.mail[0].body));
});
test('sender: nothing outside the window', () => {
  const st = baseState(); st.now = at('2026-11-19T15:00:00Z'); const s = sender(st);
  s.ctx.run();
  eq(s.calls.filter(c => c[1].includes('fcm.googleapis.com')).length, 0);
});

const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
