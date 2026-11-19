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
  // view starts as 'home' before boot runs, and boot's own go('home') closes any open sheet. Cloud.state leaves
  // 'off' only once boot has drawn home and started the cloud, so waiting on it keeps boot from closing the motion box.
  await page.waitForFunction(() => typeof newMeeting === 'function' && typeof view !== 'undefined' && view === 'home' && typeof Cloud !== 'undefined' && Cloud.state !== 'off');
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
    await test('the header matches the LYBS family header: logo and "← Dashboard" go back, actions sit in the row under it; the app installs on its own', async () => {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(srv.url);
      await page.waitForFunction(() => typeof view !== 'undefined' && view === 'home');
      const dash = await page.evaluate(() => { const a = document.querySelector('.topbar #btnDash'); const r = a && a.getBoundingClientRect();
        return a && { href: a.href, target: a.target, text: a.textContent.trim(), shown: r.width > 0 && r.height > 0 }; });
      eq(dash && dash.href, 'https://lybs-dashboard.web.app/', 'goes to the Dashboard');
      eq(dash.target, '', 'opens in place when not inside a frame');
      eq(dash.text, '← Dashboard'); eq(dash.shown, true, 'visible at phone size');
      const hd = await page.evaluate(() => ({
        title: document.querySelector('.topbar h1').textContent.trim(),
        logo: document.querySelector('.topbar .brand a').href,
        actsInHeader: !!document.querySelector('.topbar #btnSettings, .topbar #btnHome'),
        acts: !!document.querySelector('.toolsrow #btnSettings') && !!document.querySelector('.toolsrow #btnHome'),
        fit: document.documentElement.scrollWidth <= innerWidth }));
      eq(hd.title, 'Meeting Secretary'); eq(hd.logo, 'https://lybs-dashboard.web.app/', 'the logo goes back to the Dashboard too');
      eq(hd.actsInHeader, false, 'no page actions in the header'); eq(hd.acts, true, 'All meetings and Roster & Settings in the toolbar row');
      eq(hd.fit, true, 'nothing runs off the side');
      // Inside a frame (the Crossbar board page) the Dashboard links open a tab instead of loading in the frame.
      await page.setContent('<iframe id="f" src="' + srv.url + '" style="width:390px;height:700px"></iframe>');
      const fr = await (await page.waitForSelector('#f')).contentFrame();
      await fr.waitForSelector('#btnDash');
      eq(await fr.evaluate(() => [...document.querySelectorAll('.dash-link')].map(a => a.target).join(',')), '_blank,_blank');
      const man = await (await fetch(srv.url + 'manifest.json')).json();
      eq(man.scope, './', 'its own scope, so it installs as its own app'); eq(man.start_url, './'); eq(man.display, 'standalone');
      eq(man.short_name, 'Secretary');
      eq(errors.join('\n'), '', 'no console errors');
      await ctx.close();
    });

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
    await test('topics from the Dashboard: reports and board votes go after the opening items, refresh, stay removed, and reach the minutes', async () => {
      const { ctx, page } = await newPage(browser);
      await page.goto(srv.url);
      await setup(page);
      const r = await page.evaluate(() => {
        M.agenda = ['Call to Order', 'Approval of Prior Minutes', 'Fields', 'Adjournment'].map(t => ({ id: uid(), title: t, startT: null, notes: '' }));
        const feed = cleanDashTopics([
          { id: 'report__sponsors', title: 'Sponsorships report', detail: 'Made-up season: 3 sponsors.\nSince Nov 8: 1 new sponsor.' },
          { id: 'vote__demo-1', title: 'Vote to ratify: Demo motion', detail: 'Moved by Member A, Nov 19, by email. Passed.\nMotion: Demo ask. Vote 4–1–0.' },
          { id: 'evil', title: 'Not from the Dashboard' }, { id: 'report__x', title: '' },
        ]);
        const first = placeDashTopics(feed);
        const order = M.agenda.map(a => a.title);
        M.agenda.find(a => a.dashId === 'report__sponsors').detail = 'Edited by the secretary';
        placeDashTopics(cleanDashTopics([{ id: 'report__sponsors', title: 'Sponsorships report', detail: 'New numbers' }, { id: 'vote__demo-1', title: 'Vote to ratify: Demo motion', detail: 'Moved by Member A. Passed.\nMotion: Demo ask. Vote 5–0–0.' }]));
        const kept = M.agenda.find(a => a.dashId === 'report__sponsors').detail, fresh = M.agenda.find(a => a.dashId === 'vote__demo-1').detail;
        const i = M.agenda.findIndex(a => a.dashId === 'report__sponsors'); noteRemovedFeedTopic(M.agenda.splice(i, 1)[0]);
        const again = placeDashTopics(cleanDashTopics([{ id: 'report__sponsors', title: 'Sponsorships report', detail: 'x' }]));
        return { kept: feed.length, first, order, edited: kept, fresh, again, reported: boardActionsPayload().reported, mins: minutesHTML(), handoff: buildHandoff() };
      });
      eq(r.kept, 2, 'only report__ and vote__ topics with a title are taken');
      eq(r.first, 2);
      eq(JSON.stringify(r.order), JSON.stringify(['Call to Order', 'Approval of Prior Minutes', 'Sponsorships report', 'Vote to ratify: Demo motion', 'Fields', 'Adjournment']));
      eq(r.edited, 'Edited by the secretary', 'a checked-again topic keeps the secretary’s edit');
      assert.ok(r.fresh.includes('5–0–0'), 'an unedited one takes the new numbers');
      eq(r.again, 0, 'a removed topic is not added back');
      assert.ok(r.reported.includes('vote__demo-1'), 'the vote is reported back to the board page');
      assert.ok(/## Board votes taken between meetings[\s\S]*- Vote to ratify: Demo motion: Moved by Member A\. Passed\. \/ Motion/.test(r.handoff), 'the minutes handoff lists the vote');
      const mins = plain(r.mins);
      assert.ok(/Votes Taken Between Meetings .* Demo motion Moved by Member A\. Passed\. Motion: Demo ask\. Vote 5–0–0\./.test(mins), mins.slice(0, 900));
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
