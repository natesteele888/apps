// Tournament Pack screenshots with a made-up tournament (Hawks at the Fall Classic). See lib.cjs.
// Two moments: Saturday evening (schedule with arrive-by times, standings, packing list) and Sunday midday (bracket in progress).
const { serve, launch, phone, shot, finish } = require('./lib.cjs');

const TEAMS = { H: 'Hawks', C: 'Comets', L: 'Lightning', R: 'Rockets', S: 'Storm', W: 'Wolves' };
function build(sundayMidday) {
  const fri = '2026-11-13', sat = '2026-11-14', sun = '2026-11-15';
  let n = 0;
  const G = (date, time, field, a, b, sa, sb) => ({ id: 'dg' + (++n), kind: 'pool', date, time, field, a: TEAMS[a], b: TEAMS[b], status: sa == null ? 'scheduled' : 'final', sa, sb, label: 'Pool play' });
  const games = [
    G(fri, '18:00', 'Field 1', 'H', 'C', 6, 4), G(fri, '18:00', 'Field 2', 'L', 'R', 5, 2), G(fri, '19:45', 'Field 1', 'S', 'W', 7, 1),
    G(sat, '08:00', 'Field 1', 'H', 'S', 3, 5), G(sat, '08:00', 'Field 2', 'C', 'L', 9, 3),
    G(sat, '10:15', 'Field 1', 'H', 'W', 10, 2), G(sat, '10:15', 'Field 2', 'C', 'R', 8, 5),
    G(sat, '12:30', 'Field 1', 'S', 'L', 6, 4), G(sat, '12:30', 'Field 2', 'R', 'W', 6, 4)
  ];
  const B = (slot, date, time, field, a, b, sa, sb) => ({ id: 'db' + slot, kind: 'bracket', slot, date, time, field, a, b, status: sa == null ? 'scheduled' : 'final', sa, sb, label: '' });
  games.push(sundayMidday ? B('r1m1', sun, '09:00', 'Field 1', 'Storm', 'Lightning', 7, 2) : B('r1m1', sun, '09:00', 'Field 1', '', '', null, null));
  games.push(sundayMidday ? B('r1m2', sun, '09:00', 'Field 2', 'Hawks', 'Comets', 5, 4) : B('r1m2', sun, '09:00', 'Field 2', '', '', null, null));
  games.push(B('r2m1', sun, '14:00', 'Field 1', '', '', null, null));
  return {
    id: 'demo1', name: 'Fall Classic', sport: 'baseball', start: fri, end: sun, team: 'Hawks', gameMin: 90, created: fri,
    notes: { lodging: '', food: '', map: '', other: '' }, games,
    bracket: { size: 4, seeds: ['Storm', 'Hawks', 'Comets', 'Lightning'] }, pack: []
  };
}

(async () => {
  const srv = await serve(), br = await launch();
  async function open(sundayMidday, now) {
    const { ctx, page } = await phone(br);
    await page.addInitScript(n => { window.__now = n; window.__today = n.slice(0, 10); }, now);
    await page.goto(srv.base + 'tournamentpack/'); await page.waitForSelector('#view > *');
    await page.evaluate(([raw, mid]) => {
      const C = window.TPCore, t = C.sanitizeTournament(raw);
      t.pack = C.packTemplate('baseball'); t.pack.forEach((p, i) => { p.done = i < 15 && i !== 4 && i !== 11; });
      t.games = C.cascade(t).games;
      localStorage.setItem('tpack.t.' + t.id, JSON.stringify(t));
      localStorage.setItem('tpack.index', JSON.stringify({ v: 1, ids: [t.id] }));
    }, [build(sundayMidday), sundayMidday]);
    await page.reload(); await page.waitForSelector('[data-act=tour-open]');
    await page.click('[data-act=tour-open]'); await page.waitForSelector('#nav:not([hidden])'); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const tab = async (page, t) => { await page.click('#nav [data-tab="' + t + '"]'); await page.waitForTimeout(350); };

  let { ctx, page } = await open(false, '2026-11-14T18:30');
  await shot(page, 'tournamentpack', 1, 'Every game with arrive-by times, and how long you get to rest');
  await page.evaluate(() => window.scrollTo(0, 0));
  await tab(page, 'standings');
  await shot(page, 'tournamentpack', 2, 'Pool standings that follow the real tiebreakers');
  await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(300);
  await shot(page, 'tournamentpack', 3, 'See exactly why one team ranks ahead of another');
  await tab(page, 'pack');
  await shot(page, 'tournamentpack', 5, 'A packing list for the weekend, checked off as you go');
  await ctx.close();

  ({ ctx, page } = await open(true, '2026-11-15T12:20'));
  await tab(page, 'bracket');
  await shot(page, 'tournamentpack', 4, 'The bracket fills in as winners advance, with your path marked');
  finish('tournamentpack'); await ctx.close(); await br.close(); srv.stop();
})().catch(e => { console.error(e); process.exit(1); });
