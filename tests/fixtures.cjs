// Sample data for tests. Names are placeholders only.
const C = require('../apps/locker/core.js');
function sampleAthlete(today, over = {}) {
  const id = over.id || 'ath1sample';
  const d = n => C.addDays(today, n);
  const drills = [
    { id: 'dr1tee', name: 'Tee swings', unit: 'swings', target: 50, days: [0, 1, 2, 3, 4, 5, 6], created: d(-30) },
    { id: 'dr2wall', name: 'Throws against the wall', unit: 'throws', target: 30, days: [1, 2, 3, 4, 5, 6], created: d(-30) }
  ];
  const days = {};
  // done 5 days ago .. 2 days ago; yesterday missed
  [-6, -5, -4, -3, -2].forEach(n => { const wd = C.weekday(d(n)); const r = { dr1tee: [50] }; if (wd !== 0) r.dr2wall = [30]; days[d(n)] = { r, s: wd === 0 ? 1 : 2, done: true }; });
  const games = [
    { id: 'g1', sport: 'baseball', date: d(-12), opp: 'Opponent A', result: 'W', us: 7, them: 4, season: today.slice(0, 4), notes: '', bat: { ab: 4, h: 2, d2: 1, d3: 0, hr: 0, bb: 1, k: 1, rbi: 2, r: 1, sb: 1 }, pit: { outs: 13, np: 62, k: 5, bb: 2, h: 3, r: 2, er: 2 } },
    { id: 'g2', sport: 'baseball', date: d(-5), opp: 'Opponent B', result: 'L', us: 3, them: 5, season: today.slice(0, 4), notes: '', bat: { ab: 3, h: 1, d2: 0, d3: 0, hr: 1, bb: 0, k: 0, rbi: 1, r: 1, sb: 0 }, pit: { outs: 6, np: 30, k: 2, bb: 1, h: 1, r: 0, er: 0 } }
  ];
  const doc = {
    v: 1, id, name: 'Player One', sports: ['baseball'], birthYear: 2015, created: d(-30),
    profile: { cardName: '', positions: 'SS, P', bats: 'R', throws: 'R', height: "4'11\"", weight: '88 lb', gradYear: 2033, teams: 'Example Team', email: '', phone: '', bio: 'Loves the game.', showContact: false, cardSeason: '' },
    drills, days, games, settings: { ipg: 6 },
    arm: { preset: 'Majors', custom: { dailyMax: 85, tiers: C.PRESETS.Majors.tiers }, log: [{ id: 'ar1', date: d(-12), np: 62, note: 'Game vs Opponent A', gameId: 'g1' }, { id: 'ar2', date: d(-5), np: 30, note: 'Game vs Opponent B', gameId: 'g2' }] },
    clips: [{ id: 'cl1', title: 'Good swing', url: 'https://example.com/video/1', date: d(-3), tags: ['hitting'], note: 'Elbow up.' }]
  };
  return Object.assign(doc, over);
}
// Writes locker.* keys before the page's own scripts run (only if nothing is stored yet).
async function seed(page, docs, active) {
  const payload = { docs, active: active || docs[0].id };
  await page.addInitScript(p => {
    try {
      if (localStorage.getItem('locker.index')) return;
      p.docs.forEach(d => localStorage.setItem('locker.a.' + d.id, JSON.stringify(d)));
      localStorage.setItem('locker.index', JSON.stringify({ v: 1, ids: p.docs.map(d => d.id), active: p.active }));
    } catch (e) {}
  }, payload);
}
module.exports = { sampleAthlete, seed };
