// Get Ready tests: the checklist, streak, reminder and calendar math, plus the app in a real browser (fake clock for timers and reminders).
const assert = require('assert');
const C = require('../apps/getready/core.js');
const X = require('../apps/getready/celebrate.js');
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const MON = '2026-11-09'; // a Monday
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const doAll = (s, k) => C.itemsFor(s, k).forEach(i => { if (!C.isChecked(s, k, i.id)) C.toggle(s, k, i.id); });

(async () => {
  await test('core: day keys, adding days across month and year ends, weekdays', () => {
    eq(C.addDays('2026-11-30', 1), '2026-12-01'); eq(C.addDays('2026-01-01', -1), '2025-12-31'); eq(C.addDays('2028-02-28', 1), '2028-02-29');
    eq(C.parseDay('2026-02-30'), null); eq(C.dow(MON), 1); eq(C.fmt(125), '2:05'); eq(C.fmt(-3), '0:00'); eq(C.timerLabel(30), '30 sec'); eq(C.timerLabel(180), '3 min');
  });
  await test('core: a damaged save falls back safely and keeps what is good', () => {
    eq(C.sanitize(null).lists.length, 2); eq(C.sanitize('x').lists[0].items.length, 6);
    const s = C.sanitize({ lists: [{ id: 'L', name: '  Mon Thu  ', days: [1, 4, 9, 'x', 1], items: [{ id: 'a', name: '  Glasses  ', timer: 99 }, { id: 'a', name: 'dup' }, { name: '' }, null, { id: 'b', name: 'B', timer: 120 }] },
      { id: 'L', name: 'Tue Fri', days: [2, 4, 5], items: [{ id: 'a', name: 'same id elsewhere' }, { id: 'c', name: 'C' }] }, 7, null],
      reminders: [{ id: 'r', label: '', time: '25:99', days: [], on: 1 }], days: { 'nope': {}, [MON]: { c: { a: 1, b: 0 }, done: 1, l: 'L' } }, timer: { id: 'a', end: 'soon' }, gifs: [{ kind: 'url', url: 'javascript:alert(1)' }, { kind: 'url', url: 'https://x.test/a.gif' }, { kind: 'file', id: 'f' }] });
    eq(s.lists.length, 2); const [a, b] = s.lists; eq(a.name, 'Mon Thu'); assert.deepStrictEqual(a.days, [1, 4]); assert.deepStrictEqual(b.days, [2, 5], 'a day belongs to one list (the first)'); assert.notStrictEqual(a.id, b.id, 'duplicate list ids are fixed');
    eq(a.items.length, 2); eq(a.items[0].name, 'Glasses'); eq(a.items[0].timer, 0); eq(a.items[1].timer, 120); eq(b.items.length, 1, 'an item id is only used once'); eq(b.items[0].name, 'C');
    eq(s.reminders[0].time, '07:00'); eq(s.reminders[0].label, 'Reminder'); assert.deepStrictEqual(s.reminders[0].days, []);
    assert.deepStrictEqual(Object.keys(s.days), [MON]); eq(s.days[MON].l, 'L'); eq(s.timer, null); eq(s.gifs.length, 2); eq(s.gifs[0].kind, 'url');
    eq(C.sanitize({ lists: [] }).lists.length, 0, 'no lists stays no lists');
  });
  await test('core: an older one-list save becomes a school list plus a weekend list, keeping every item', () => {
    const s = C.sanitize({ v: 1, items: [{ id: 'a', name: 'Bag' }, { id: 'b', name: 'Water', timer: 60 }], school: [1, 2, 3, 4, 5], days: { [MON]: { c: { a: 1 }, done: 0 } } });
    eq(s.lists.length, 2); eq(s.lists[0].name, 'School days'); assert.deepStrictEqual(s.lists[0].days, [1, 2, 3, 4, 5]); eq(s.lists[0].items.map(i => i.id).join(), 'a,b'); assert.deepStrictEqual(s.lists[1].days, [0, 6]);
    eq(C.isChecked(s, MON, 'a'), true, 'old check marks still count'); eq(C.count(s, MON), 1);
    const all = C.sanitize({ items: [{ id: 'a', name: 'Bag' }], school: [0, 1, 2, 3, 4, 5, 6] }); eq(all.lists.length, 1, 'no weekend list when every day was a school day');
  });
  await test('core: which list a day uses, switching it for one date, and a weekday only ever belongs to one list', () => {
    const s = C.defaults(); eq(C.listFor(s, MON).name, 'School days'); eq(C.listFor(s, '2026-11-08').name, 'Weekend'); eq(C.itemsFor(s, '2026-11-08').length, 3);
    C.setListDays(s, 'school', [1, 2, 3, 4, 5, 6]); assert.deepStrictEqual(s.lists[1].days, [0], 'Saturday moved to the school list'); eq(C.listFor(s, '2026-11-07').name, 'School days');
    C.setListDays(s, 'school', [1, 4]); eq(C.listFor(s, '2026-11-10'), null, 'a day with no list is a day off'); assert.deepStrictEqual(C.activeDays(s), [0, 1, 4]);
    C.setDayList(s, '2026-11-10', 'weekend'); eq(C.listFor(s, '2026-11-10').name, 'Weekend'); eq(C.itemsFor(s, '2026-11-10').length, 3);
    C.setDayList(s, '2026-11-10', ''); eq(C.listFor(s, '2026-11-10'), null); C.setDayList(s, MON, 'school'); eq(s.days[MON], undefined, 'the usual list is not stored as a pick');
    C.setDayList(s, MON, 'nope'); eq(C.listFor(s, MON).name, 'School days'); eq(C.findItem(s, 'bag').name, 'School bag'); eq(C.listOf(s, 'bag').id, 'school'); eq(C.findItem(s, 'x'), null);
  });
  await test('core: ticking items, finishing the day once, unticking, adding and removing items', () => {
    const s = C.defaults(), items = s.lists[0].items, n = items.length;
    for (let i = 0; i < n - 1; i++) { const r = C.toggle(s, MON, items[i].id); assert.ok(r.checked && !r.justDone); }
    eq(C.count(s, MON), n - 1); assert.ok(!C.isDone(s, MON));
    const last = C.toggle(s, MON, items[n - 1].id); assert.ok(last.justDone && C.isDone(s, MON));
    const off = C.toggle(s, MON, items[0].id); assert.ok(!off.checked && !C.isDone(s, MON), 'unticking undoes the day');
    const again = C.toggle(s, MON, items[0].id); assert.ok(again.justDone, 'finishing again counts again');
    items.push({ id: 'x', name: 'X', timer: 0 }); C.settle(s, MON); assert.ok(!C.isDone(s, MON), 'a new item makes the day unfinished');
    s.lists[0].items = items.filter(i => i.id !== 'x'); assert.ok(C.settle(s, MON), 'removing it finishes the day');
    eq(C.toggle(s, MON, 'ghost').checked, false); eq(C.isComplete({ lists: [{ id: 'e', name: 'E', days: [1], items: [] }], days: {} }, MON), false, 'an empty list is never complete'); eq(C.toggle(s, '2026-11-08', items[0].id).checked, false, 'an item from another list cannot be ticked');
  });
  await test('core: streak skips weekends, survives an unfinished today, breaks on a missed school day', () => {
    const s = C.defaults(); s.lists = [s.lists[0]]; // school days only; weekends are days off
    ['2026-11-04', '2026-11-05', '2026-11-06', MON].forEach(k => doAll(s, k)); // Wed Thu Fri (weekend off) Mon
    eq(C.streak(s, MON), 4); eq(C.streak(s, '2026-11-08'), 3, 'Sunday: not a school day, streak holds'); eq(C.streak(s, '2026-11-10'), 4, 'Tuesday not done yet: still 4');
    eq(C.streak(s, '2026-11-11'), 0, 'Tuesday was missed, so Wednesday starts over');
    const t = C.defaults(); eq(C.streak(t, MON), 0); t.lists = []; eq(C.streak(t, MON), 0, 'no lists at all');
    const w = C.defaults(); ['2026-11-06', '2026-11-07', '2026-11-08', MON].forEach(k => doAll(w, k)); eq(C.streak(w, MON), 4, 'with a weekend list, the weekend counts'); const m = C.defaults(); ['2026-11-06', MON].forEach(k => doAll(m, k)); eq(C.streak(m, MON), 1, 'a missed weekend day breaks it');
    C.setDayList(s, '2026-11-07', 'school'); doAll(s, '2026-11-07'); eq(C.streak(s, '2026-11-08'), 4, 'a done day with no list adds to it');
    eq(C.doneDays(s), 5);
  });
  await test('core: reminders are due from their time for two hours, once a day, on the right weekdays', () => {
    const s = C.defaults(), at = (d, h, m) => new Date(2026, 10, d, h, m);
    eq(C.dueReminders(s, at(9, 6, 59)).length, 0); eq(C.dueReminders(s, at(9, 7, 0)).map(r => r.id).join(), 'r1');
    eq(C.dueReminders(s, at(9, 7, 31)).map(r => r.id).join(), 'r1,r2'); eq(C.dueReminders(s, at(9, 9, 1)).length, 1, 'r1 expires after 2 hours, r2 still in range');
    eq(C.dueReminders(s, at(9, 9, 31)).length, 0);
    s.fired.r1 = '2026-11-09'; eq(C.dueReminders(s, at(9, 7, 5)).length, 0, 'already fired today'); eq(C.dueReminders(s, at(10, 7, 5)).length, 1, 'next day fires again');
    eq(C.dueReminders(s, at(8, 7, 5)).length, 0, 'Sunday: off'); s.reminders[1].on = 0; eq(C.dueReminders(s, at(10, 7, 40)).map(r => r.id).join(), 'r1', 'r2 switched off'); s.reminders[0].on = 0; eq(C.dueReminders(s, at(10, 7, 40)).length, 0, 'both off');
  });
  await test('core: the calendar file has repeating events with alarms and valid line endings', () => {
    const s = C.defaults(); s.reminders[0].label = 'Medicine, vitamins; go!'; s.reminders[1].on = 0;
    const ics = C.ics(s, new Date(2026, 10, 8, 20, 0)); // a Sunday evening: first event is Monday
    assert.ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics)); eq((ics.match(/BEGIN:VEVENT/g) || []).length, 1, 'switched-off reminder skipped');
    assert.ok(ics.includes('DTSTART:20261109T070000'), 'starts Monday'); assert.ok(ics.includes('DTEND:20261109T071000'));
    assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')); assert.ok(ics.includes('SUMMARY:Medicine\\, vitamins\\; go!')); assert.ok(ics.includes('TRIGGER:PT0S') && ics.includes('ACTION:DISPLAY'));
    assert.ok(!/[^\r]\n/.test(ics), 'all CRLF'); assert.ok(ics.split('\r\n').every(l => l.length <= 75));
    s.reminders[0].label = 'x'.repeat(200); assert.ok(C.ics(s, new Date()).split('\r\n').every(l => l.length <= 75), 'long lines are folded');
  });
  await test('core: list order moves and random celebration never repeats back to back', () => {
    const it = ['a', 'b', 'c'].map(id => ({ id, name: id })); eq(C.moveItem(it, 'a', 1).map(x => x.id).join(''), 'bac'); eq(C.moveItem(it, 'a', -1).map(x => x.id).join(''), 'abc'); eq(C.moveItem(it, 'c', 1).map(x => x.id).join(''), 'abc');
    for (let i = 0; i < 200; i++) { const n = C.pick(5, 2); assert.ok(n >= 0 && n < 5 && n !== 2); } eq(C.pick(1, 0), 0); eq(C.pick(5, -1, () => 0.9999), 4);
  });
  await test('celebration: every dance pose is finite for a whole minute and the arms really move', () => {
    for (const st of X.STYLES) { let lo = 1e9, hi = -1e9; for (let t = 0; t < 60; t += 0.037) { const p = X.pose(st, t); for (const v of Object.values(p)) assert.ok(Number.isFinite(v), st + ' ' + t); const m = p.ra + p.re + p.sx * 100; lo = Math.min(lo, m); hi = Math.max(hi, m); } assert.ok(hi - lo > 20, st + ' arm swing ' + (hi - lo)); }
  });

  const srv = await startServer('getready'); const br = await launch();
  const mk = async (opts = {}) => {
    const o = await newPage(br, { today: MON, ...opts });
    await o.page.clock.install({ time: new Date('2026-11-09T06:50:00') });
    await o.page.goto(srv.url); await o.page.waitForSelector('.item'); return o;
  };
  const first = page => page.locator('.chip.on[data-act=editlist]');
  const names = page => page.$$eval('.item .iname', els => els.map(e => e.textContent));

  await test('page: the default list shows; checking everything plays a full-screen dance once, and it survives a reload', async () => {
    const o = await mk(); const { page } = o;
    eq((await names(page)).length, 6); assert.ok((await names(page)).includes('Morning medicine')); eq(await page.locator('.bartxt').innerText().then(t => t.replace(/\s+/g, ' ')), '0 of 6 ready 6 to go');
    for (let i = 0; i < 5; i++) await page.locator('.item .chk').nth(i).click();
    eq(await page.locator('.celebrate').count(), 0, 'not before the last one');
    await page.locator('.item .chk').nth(5).click(); await page.waitForSelector('.celebrate');
    const box = await page.locator('.celebrate').boundingBox(); eq(box.width, 390); eq(box.height, 844);
    await page.waitForSelector('.celebrate canvas'); await page.screenshot({ path: SHOTS + '/getready-dance.png' });
    await page.locator('.cel-go').click(); await page.waitForTimeout(100); eq(await page.locator('.celebrate').count(), 0);
    assert.ok(/ready for school/.test(await page.locator('.allset').innerText())); eq(await page.locator('.streak').innerText().then(t => t.replace(/\s+/g, ' ')), '🔥 1 streak');
    await page.locator('[data-act=again]').click(); await page.waitForSelector('.celebrate'); await page.goBack(); await page.waitForTimeout(150); eq(await page.locator('.celebrate').count(), 0, 'the Back gesture closes it');
    await page.reload(); await page.waitForSelector('.item'); eq(await page.locator('.item.on').count(), 6, 'checks survive a reload');
    await page.locator('.item .chk').nth(0).click(); await page.waitForTimeout(500); eq(await page.locator('.celebrate').count(), 0, 'unticking never celebrates');
    await page.locator('.item .chk').nth(0).click(); await page.waitForSelector('.celebrate', { timeout: 3000 });
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: add, rename, reorder, timer and remove items; changes show on Today and are kept', async () => {
    const o = await mk(); const { page } = o; page.on('dialog', d => d.accept());
    await page.locator('[data-tab=list]').click(); eq(await first(page).innerText(), 'School days'); eq(await page.locator('.erow').count(), 6);
    await page.locator('#newItem').fill('Glasses'); await page.locator('#newItem').press('Enter'); eq(await page.locator('.erow').count(), 7);
    await page.locator('.chip', { hasText: 'Jacket' }).click(); eq(await page.locator('.erow').count(), 8); eq(await page.locator('.chip', { hasText: 'Jacket' }).count(), 0, 'suggestion used up');
    await page.locator('.erow').nth(7).locator('[data-act=rename]').fill('Rain jacket'); await page.locator('.erow').nth(7).locator('[data-act=rename]').blur();
    await page.locator('.erow').nth(0).locator('[data-act=settimer]').selectOption('300');
    await page.locator('.erow').nth(1).locator('[data-act=down]').click(); eq(await page.locator('.erow [data-act=rename]').nth(2).inputValue(), 'Vitamins');
    await page.locator('.erow').nth(3).locator('[data-act=del]').click(); eq(await page.locator('.erow').count(), 7);
    await page.locator('[data-tab=today]').click(); eq((await names(page)).join('|'), 'Morning medicine|Brush teeth|Vitamins|Water bottle|Lunch|Glasses|Rain jacket');
    eq(await page.locator('.item').nth(0).locator('.tbtn').innerText(), '⏱ 5:00');
    await page.reload(); await page.waitForSelector('.item'); eq((await names(page)).length, 7, 'saved'); eq(await page.locator('.item').count(), 7);
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: a timer counts down on screen, a tap stops it, and finishing checks the item off', async () => {
    const o = await mk(); const { page } = o; const row = page.locator('.item', { hasText: 'Brush teeth' });
    await row.locator('.tbtn').click(); eq(await row.locator('.tbtn').innerText(), '2:00'); await page.clock.runFor(31000); assert.ok(/^1:(28|29|30)$/.test(await row.locator('.tbtn').innerText()), 'counting down');
    await row.locator('.tbtn').click(); eq(await row.locator('.tbtn').innerText(), '⏱ 2:00', 'stopped'); eq(await page.locator('.item.on').count(), 0);
    await row.locator('.tbtn').click(); await page.clock.runFor(60000); await page.reload(); await page.waitForSelector('.item'); assert.ok(/^(0:5\d|1:0\d)$/.test(await page.locator('.tbtn.run').innerText()), 'a running timer survives a reload');
    for (let i = 0; i < 90 && !(await page.locator('.item.on').count()); i++) await page.clock.runFor(1000);
    await page.waitForSelector('.item.on'); await page.waitForSelector('.toast'); assert.ok(/Brush teeth is done/.test(await page.locator('.toast').first().innerText()));
    eq(await page.locator('.item.on .iname').innerText(), 'Brush teeth'); eq(await page.locator('.tbtn').count(), 0, 'no timer button on a checked item');
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: a photo is added with the plus, shows next to the item, opens big, can be retaken, removed, and the Back gesture closes it', async () => {
    const o = await mk(); const { page } = o; const row = page.locator('.item').nth(3);
    eq(await row.locator('.thumb img').count(), 0); eq(await row.locator('.thumb .plus').innerText(), '+');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), row.locator('.thumb').click()]); assert.ok(await fc.isMultiple() === false);
    await fc.setFiles({ name: 'bag.png', mimeType: 'image/png', buffer: PNG }); await row.locator('.thumb img').waitFor();
    await page.reload(); await page.waitForSelector('.item'); await page.locator('.item').nth(3).locator('.thumb img').waitFor(); // kept on the phone
    await page.locator('.item').nth(3).locator('.thumb').click(); await page.waitForSelector('.overlay .pic');
    assert.ok(/School bag/.test(await page.locator('.overlay h3').innerText())); await page.screenshot({ path: SHOTS + '/getready-photo.png' });
    await page.goBack(); await page.waitForTimeout(150); eq(await page.locator('.overlay').count(), 0, 'Back closes the photo');
    await page.locator('.item').nth(3).locator('.thumb').click();
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act=vpick]').click()]); await fc2.setFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForTimeout(300); await page.locator('[data-act=vdel]').click(); await page.waitForSelector('.overlay .none'); await page.locator('[data-act=vclose]').click();
    eq(await page.locator('.item').nth(3).locator('.thumb img').count(), 0, 'removed');
    await page.reload(); await page.waitForSelector('.item'); await page.waitForTimeout(300); eq(await page.locator('.item').nth(3).locator('.thumb img').count(), 0, 'still removed after reload');
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: reminders pop up at their time once, not on a day off, and can be edited and switched off', async () => {
    const o = await mk(); const { page } = o; // Monday 6:50
    await page.clock.runFor(5 * 60000); eq(await page.locator('.toast').count(), 0, '6:55: nothing yet');
    await page.clock.runFor(5 * 60000 + 5000); await page.waitForSelector('.toast'); assert.ok(/Time to start getting ready/.test(await page.locator('.toast').innerText()));
    await page.locator('.toast').click(); eq(await page.locator('.toast').count(), 0, 'tap to dismiss');
    await page.clock.runFor(10 * 60000); eq(await page.locator('.toast').count(), 0, 'only once');
    await page.locator('[data-tab=alarms]').click(); eq(await page.locator('.rrow').count(), 2);
    await page.locator('[data-act=radd]').click(); eq(await page.locator('.rrow').count(), 3);
    const r = page.locator('.rrow').nth(2); await r.locator('[data-act=rtime]').fill('07:10'); await r.locator('[data-act=rlabel]').fill('Shoes on'); await r.locator('[data-act=rlabel]').blur();
    await r.locator('[data-act=rday][data-d="1"]').click(); await r.locator('[data-act=rday][data-d="6"]').click(); eq(await r.locator('.chip.on').count(), 5, 'Monday off, Saturday on');
    await r.locator('[data-act=rtoggle]').click(); assert.ok(await r.evaluate(e => e.classList.contains('off')));
    const st = await page.evaluate(() => GetReady.state().reminders[2]); eq(st.time, '07:10'); eq(st.label, 'Shoes on'); eq(st.on, 0); assert.deepStrictEqual(st.days, [2, 3, 4, 5, 6]);
    await page.locator('.rrow').nth(2).locator('[data-act=rdel]').click(); eq(await page.locator('.rrow').count(), 2);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act=ics]').click()]); eq(dl.suggestedFilename(), 'getready-reminders.ics');
    const text = require('fs').readFileSync(await dl.path(), 'utf8'); assert.ok(text.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') && text.includes('Time to start getting ready'));
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: a Sunday shows the weekend list and no reminders', async () => {
    const o = await newPage(br, { today: '2026-11-08' }); await o.page.clock.install({ time: new Date('2026-11-08T07:05:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.item');
    eq(await o.page.locator('.item').count(), 3); assert.ok(/Weekend/.test(await o.page.locator('.hello p').innerText())); await o.page.clock.runFor(60000); eq(await o.page.locator('.toast').count(), 0);
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: lists get their own days: one list for Mon and Thu, another for Tue and Fri, a day with none is a day off', async () => {
    const o = await mk(); const { page } = o; page.on('dialog', d => d.accept());
    await page.locator('[data-tab=list]').click();
    await page.locator('[data-act=newlist]').click(); await page.locator('#lname').fill('Class days'); await page.locator('#lname').blur(); eq(await page.locator('.chip.on[data-act=editlist]').innerText(), 'Class days', 'tab shows the new name');
    await page.locator('#newItem').fill('Gym clothes'); await page.locator('#newItem').press('Enter'); await page.locator('.chip', { hasText: 'Library book' }).click(); eq(await page.locator('.erow').count(), 2);
    await page.locator('[data-act=lday][data-d="2"]').click(); await page.locator('[data-act=lday][data-d="5"]').click(); // Tue, Fri move here from School days
    await page.locator('[data-act=editlist]', { hasText: 'School days' }).click(); eq(await page.locator('.chip.on[data-act=lday]').count(), 3, 'School days lost Tue and Fri (Mon, Wed, Thu left)');
    await page.locator('[data-act=lday][data-d="3"]').click(); eq(await page.locator('.chip.on[data-act=lday]').count(), 2, 'Wednesday switched off: a day off');
    assert.ok(/Wed<\/b> day off/.test(await page.locator('.fine', { hasText: 'Sun' }).innerHTML()));
    await page.locator('[data-tab=today]').click(); assert.ok(/School days/.test(await page.locator('.hello p').innerText())); eq(await page.locator('.item').count(), 6, 'Monday is the school list');
    await page.addInitScript(() => { window.__today = '2026-11-10'; }); await page.reload(); await page.waitForSelector('.item'); eq((await names(page)).join('|'), 'Gym clothes|Library book', 'Tuesday uses the other list');
    await page.addInitScript(() => { window.__today = '2026-11-11'; }); await page.reload();
    await page.waitForSelector('.card'); assert.ok(/No list on Wednesdays/.test(await page.locator('.card').first().innerText())); eq(await page.locator('.item').count(), 0);
    await page.locator('[data-act=daylist]').selectOption({ label: 'Class days' }); await page.waitForSelector('.item'); eq(await page.locator('.item').count(), 2, 'a day off can borrow a list');
    await page.locator('.item .chk').nth(0).click(); await page.locator('.item .chk').nth(1).click(); await page.waitForSelector('.celebrate'); await page.locator('.cel-go').click();
    await page.locator('[data-tab=log]').click(); await page.locator('.cal .d.today').click(); assert.ok(/Class days: All done/.test(await page.locator('.card').innerText()));
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: copying a list copies its photos, deleting a list removes it, and a day can switch lists', async () => {
    const o = await mk(); const { page } = o; page.on('dialog', d => d.accept());
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.item').nth(3).locator('.thumb').click()]); await fc.setFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG }); await page.locator('.item').nth(3).locator('.thumb img').waitFor();
    await page.locator('[data-tab=list]').click(); await page.locator('[data-act=duplist]').click(); await page.waitForSelector('.erow'); eq(await page.locator('.chip.on[data-act=editlist]').innerText(), 'School days copy'); eq(await page.locator('.erow').count(), 6);
    await page.locator('.erow').nth(3).locator('.thumb img').waitFor(); eq(await page.locator('.chip.on[data-act=lday]').count(), 0, 'the copy has no days yet');
    await page.reload(); await page.locator('[data-tab=list]').click(); await page.locator('[data-act=editlist]', { hasText: 'copy' }).click(); await page.locator('.erow').nth(3).locator('.thumb img').waitFor();
    await page.locator('[data-tab=today]').click(); await page.locator('[data-act=daylist]').selectOption({ label: 'School days copy' }); await page.waitForTimeout(100); assert.ok(/copy/.test(await page.locator('.hello p').innerText()));
    await page.locator('[data-act=daylist]').selectOption({ label: 'School days' }); assert.ok(!/copy/.test(await page.locator('.hello p').innerText()));
    await page.locator('[data-tab=list]').click(); await page.locator('[data-act=editlist]', { hasText: 'copy' }).click(); await page.locator('[data-act=dellist]').click(); eq(await page.locator('[data-act=editlist]').count(), 2);
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: an older save from before lists opens as a school list plus a weekend list, with its photos and checks', async () => {
    const q = await newPage(br, { today: MON }); await q.page.addInitScript(() => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('getready.v1', JSON.stringify({ v: 1, items: [{ id: 'm', name: 'Meds' }, { id: 'b', name: 'Bag', timer: 60 }], school: [1, 2, 3, 4, 5], days: { '2026-11-09': { c: { m: 1 }, done: 0 } } })); } });
    await q.page.clock.install({ time: new Date('2026-11-09T06:50:00') }); await q.page.goto(srv.url); await q.page.waitForSelector('.item');
    eq((await names(q.page)).join('|'), 'Meds|Bag'); eq(await q.page.locator('.item.on').count(), 1); assert.ok(/1 of 2/.test(await q.page.locator('.bartxt').innerText()));
    await q.page.addInitScript(() => { window.__today = '2026-11-14'; }); await q.page.reload(); await q.page.waitForSelector('.item'); eq(await q.page.locator('.item').count(), 3, 'Saturday has the new weekend list');
    eq(q.errors.length, 0, q.errors.join('|'));
  });
  await test('page: the log marks finished days, shows the streak, and steps between months', async () => {
    const o = await mk(); const { page } = o;
    for (let i = 0; i < 6; i++) await page.locator('.item .chk').nth(i).click(); await page.waitForSelector('.celebrate'); await page.locator('.cel-go').click();
    await page.locator('[data-tab=log]').click(); eq(await page.locator('.cal .d.done').count(), 1); eq(await page.locator('.cal .d.today.done').count(), 1);
    assert.ok(/1\s*day streak|🔥 1/.test(await page.locator('.stats').innerText())); eq(await page.locator('[data-act=monnext]').isDisabled(), true);
    await page.locator('[data-act=monprev]').click(); assert.ok(/October 2026/.test(await page.locator('.mon b').innerText())); eq(await page.locator('.cal .d.done').count(), 0); await page.locator('[data-act=monnext]').click();
    await page.locator('.cal .d.today').click(); assert.ok(/All done/.test(await page.locator('.card').innerText())); await page.screenshot({ path: SHOTS + '/getready-log.png' });
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: your own GIF links and files join the pool, preview, and a broken link falls back to the dancers', async () => {
    const o = await mk(); const { page } = o;
    await page.locator('[data-tab=more]').click();
    page.once('dialog', d => d.accept('https://example.invalid/dance.gif')); await page.locator('[data-act=gifurl]').click(); eq(await page.locator('.gifrow').count(), 1);
    page.once('dialog', d => d.accept('http://example.com/not-secure.gif')); await page.locator('[data-act=gifurl]').click(); eq(await page.locator('.gifrow').count(), 1, 'only https links');
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act=gifadd]').click()]); await fc.setFiles({ name: 'party.gif', mimeType: 'image/gif', buffer: gif });
    await page.waitForFunction(() => document.querySelectorAll('.gifrow').length === 2);
    await page.locator('.gifrow').nth(1).locator('[data-act=gifprev]').click(); await page.waitForSelector('.celebrate img.cel-gif'); await page.locator('.cel-go').click();
    await page.locator('.gifrow').nth(0).locator('[data-act=gifprev]').click(); await page.waitForSelector('.celebrate canvas', { timeout: 5000 }); await page.locator('.cel-go').click();
    await page.locator('.chip', { hasText: 'Twirl' }).click(); await page.waitForSelector('.celebrate canvas'); await page.locator('.cel-go').click();
    await page.locator('.gifrow').nth(1).locator('[data-act=gifdel]').click(); eq(await page.locator('.gifrow').count(), 1);
    eq(o.errors.length, 0, o.errors.join('|'));
  });
  await test('page: a damaged save does not break the app, and the layout fits a small phone', async () => {
    const q = await newPage(br, { today: MON, ctx: { viewport: { width: 320, height: 640 } } }); await q.page.addInitScript(() => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('getready.v1', '{bad'); } });
    await q.page.goto(srv.url); await q.page.waitForSelector('.item'); eq(await q.page.locator('.item').count(), 6);
    eq(await q.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    for (const t of ['list', 'alarms', 'more', 'log']) { await q.page.locator('[data-tab=' + t + ']').click(); eq(await q.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, t + ' fits'); }
    eq(q.errors.length, 0, q.errors.join('|'));
  });
  await test('offline: the service worker caches the app and it reopens with no network', async () => {
    const o = await newPage(br, { sw: true, today: MON }); const { page, ctx } = o;
    await page.goto(srv.url); await page.waitForSelector('.item'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.item');
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.item'); eq(await page.locator('.item').count(), 6);
    eq(o.errors.length, 0, o.errors.join('|'));
  });

  await br.close(); srv.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' failed' : 'all passed: ' + results.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
