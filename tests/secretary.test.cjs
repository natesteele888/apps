// Meeting Secretary tests: vote counts, the Unanimous button and the minutes text.
//   NODE_PATH=<node_modules with playwright> tests/run.sh secretary
// The app is one big page, so these drive its own functions inside a real browser at phone size.
// Demo members only (Member A, Member B...): the real board list lives in synced settings, never in this repo.
const assert = require('assert');
const { launch, startServer, newPage } = require('./lib.cjs');

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name + '  (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { results.push([name, false, e]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Six members, Member F absent, so five can vote.
async function setup(page, extra) {
  await page.waitForFunction(() => typeof newMeeting === 'function' && typeof view !== 'undefined' && view === 'home');
  await page.evaluate(extra => {
    SETTINGS.roster = ['A', 'B', 'C', 'D', 'E', 'F'].map(l => ({ name: 'Member ' + l, role: 'Director' }));
    SETTINGS.secretary = extra.secretary || '';
    SETTINGS.quorum = 4;
    M = newMeeting();
    M.attendance['Member F'] = 'absent';
    M.status = 'live'; M.startedAt = new Date(Date.now() - 60000).toISOString(); M.calledToOrder = '19:00';
    M.currentAgendaId = M.agenda[0].id;
  }, extra || {});
}
// Opens the motion box, types the motion and applies the given taps, then saves.
async function addMotion(page, text, { nay = [], abstain = [], unanimous = false } = {}) {
  await page.evaluate(() => openCapture('motion'));
  await page.fill('#cText', text);
  for (const n of nay) await page.click(`#cVotes .vchip[data-n="${n}"]`);
  for (const n of abstain) { await page.click(`#cVotes .vchip[data-n="${n}"]`); await page.click(`#cVotes .vchip[data-n="${n}"]`); }
  if (unanimous) await page.click('#cUnan');
  const box = await page.evaluate(() => ({ unan: document.querySelector('#cUnan').textContent, chips: document.querySelectorAll('#cVotes .vchip').length, yay: document.querySelector('#cYay').value, nay: document.querySelector('#cNay').value, abs: document.querySelector('#cAbs').value }));
  await page.click('#cSave');
  return box;
}

(async () => {
  const srv = await startServer('secretary');
  const browser = await launch();
  try {
    await test('Unanimous button and vote chips count only members present', async () => {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      const box = await addMotion(page, 'Motion to approve the field budget', { unanimous: true });
      eq(box.chips, 5, 'one chip per member present');
      eq(box.unan, 'Unanimous (5–0–0)', 'button counts the 5 present, not all 6');
      eq([box.yay, box.nay, box.abs].join('-'), '5-0-0');
      const it = await page.evaluate(() => M.items.at(-1));
      eq(it.result, 'Approved'); eq(it.votes, undefined, 'no Nay or Abstain names stored');
      eq(errors.join('\n'), '', 'no console errors');
      await ctx.close();
    });

    await test('one Nay: 4–1–0, named, and never called unanimous', async () => {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      const box = await addMotion(page, 'Motion to buy new helmets', { nay: ['Member B'] });
      eq([box.yay, box.nay, box.abs].join('-'), '4-1-0');
      const it = await page.evaluate(() => M.items.at(-1));
      eq(JSON.stringify(it.votes), '{"Member B":"nay"}');
      const groups = await page.evaluate(() => voteGroups(M.items.at(-1)).map(g => g.label + ':' + g.count));
      eq(groups.join(' | '), 'In favor:4 | Opposed:1 | Abstained:0 | Not present for the vote:1');
      const mins = plain(await page.evaluate(() => minutesHTML()));
      assert.ok(mins.includes('Approved 4–1–0'), 'minutes show Approved 4–1–0: ' + mins.slice(0, 400));
      assert.ok(!mins.includes('Unanimous of members present'), 'a split vote is not unanimous');
      eq(errors.join('\n'), '', 'no console errors');
      await ctx.close();
    });

    await test('an Abstain counts on its own: 4–0–1', async () => {
      const { ctx, page } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      const box = await addMotion(page, 'Motion to move the meeting date', { abstain: ['Member C'] });
      eq([box.yay, box.nay, box.abs].join('-'), '4-0-1');
      const mins = plain(await page.evaluate(() => minutesHTML()));
      assert.ok(mins.includes('Approved 4–0–1'), 'minutes show 4–0–1');
      assert.ok(!mins.includes('Unanimous of members present'));
      await ctx.close();
    });

    await test('minutes: unanimous line, attendance and quorum', async () => {
      const { ctx, page } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      await addMotion(page, 'Motion to approve the field budget', { unanimous: true });
      const mins = plain(await page.evaluate(() => minutesHTML()));
      assert.ok(mins.includes('Approved 5–0–0'), 'shows 5–0–0');
      assert.ok(mins.includes('Unanimous of members present'), 'says unanimous of members present');
      assert.ok(/Present 5 Member A, Member B, Member C, Member D, Member E/.test(mins), 'present list: ' + mins.slice(0, 600));
      assert.ok(/Absent 1 Member F/.test(mins), 'absent list');
      assert.ok(mins.includes('A quorum was present.'), 'quorum of 4 met by 5');
      await ctx.close();
    });

    await test('closing line: no stray comma without a secretary, name with one', async () => {
      const { ctx, page } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      let mins = plain(await page.evaluate(() => minutesHTML()));
      assert.ok(mins.includes('Respectfully submitted, Secretary'), 'no secretary picked: ' + mins.slice(-200));
      assert.ok(!/submitted, , Secretary/.test(mins), 'no double comma');
      await setup(page, { secretary: 'Member D' });
      mins = plain(await page.evaluate(() => minutesHTML()));
      assert.ok(mins.includes('Respectfully submitted, Member D, Secretary'), 'secretary named: ' + mins.slice(-200));
      await ctx.close();
    });
  } finally {
    await browser.close();
    srv.stop();
  }
  const failed = results.filter(r => !r[1]);
  console.log(failed.length ? failed.length + ' failed of ' + results.length : 'all passed (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
