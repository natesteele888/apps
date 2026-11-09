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
  await test('core: merging with the cloud copy keeps streaks, lets an unticked item stay unticked, and the newer settings win', () => {
    const T = 1e12, mk = () => C.defaults();
    const a = mk(), b = mk();
    a.days['2026-11-05'] = { c: { med: 1 }, done: 0, m: T }; b.days['2026-11-05'] = { c: { med: 1, vit: 1 }, done: 1, m: T + 10 };
    a.days['2026-11-06'] = { c: {}, done: 0, m: T + 50 }; b.days['2026-11-06'] = { c: { med: 1 }, done: 0, m: T + 20 }; // unticked later on this phone
    a.days['2026-11-07'] = { c: { x: 1 }, done: 1, m: T }; // only here
    b.days['2026-11-08'] = { c: { y: 1 }, done: 1, m: T }; // only there
    a.days['2026-11-09'] = { c: { med: 1 }, done: 0, m: T }; b.days['2026-11-09'] = { c: { vit: 1 }, done: 0, m: T }; // same time: both kept
    const m = C.merge(a, b);
    eq(m.days['2026-11-05'].done, 1, 'the newer copy of a day wins'); eq(Object.keys(m.days['2026-11-06'].c).length, 0, 'unticking sticks'); eq(m.days['2026-11-07'].done, 1); eq(m.days['2026-11-08'].done, 1);
    assert.deepStrictEqual(Object.keys(m.days['2026-11-09'].c).sort(), ['med', 'vit']);
    a.mod = 5; b.mod = 9; b.lists = [{ id: 'z', name: 'Cloud list', days: [1], items: [{ id: 'q', name: 'Q' }] }];
    eq(C.merge(a, b).lists[0].name, 'Cloud list', 'newer settings win'); eq(C.merge(b, a).lists[0].name, 'Cloud list'); eq(C.merge(a, b).mod, 9);
    a.mod = 20; eq(C.merge(a, b).lists[0].name, 'School days', 'this phone newer'); eq(C.merge(a, b, true).lists[0].name, 'Cloud list', 'first link prefers the account');
    a.timer = { id: 'med', end: 5 }; a.fired = { r1: '2026-11-09' }; b.fired = {}; eq(C.merge(a, b).timer.id, 'med', 'timers stay local'); eq(C.merge(a, b).fired.r1, '2026-11-09');
    const g = mk(), h = mk(); g.gifs = [{ id: 'f1', kind: 'file', name: 'mine' }]; h.gifs = [{ id: 'u1', kind: 'url', url: 'https://x.test/a.gif', name: 'link' }, { id: 'f2', kind: 'file', name: 'theirs' }]; h.mod = 3;
    assert.deepStrictEqual(C.merge(g, h).gifs.map(x => x.id).sort(), ['f1', 'u1'], 'file GIFs stay on their own phone');
    eq(JSON.parse(C.forCloud(Object.assign(mk(), { timer: { id: 'a', end: 1 }, fired: { r1: '2026-11-09' } }))).timer, null);
    eq(C.merge(a, null).lists.length, 2, 'no cloud copy: this phone as is');
  });
  await test('core: ticking and resetting a day stamp it, so the newest change always wins', () => {
    const s = C.defaults(); eq(C.toggle(s, MON, 'med').checked, true); const t1 = s.days[MON].m; assert.ok(t1 > 0);
    C.resetDay(s, MON); eq(C.count(s, MON), 0); assert.ok(s.days[MON].m >= t1, 'a reset is an empty, newer record');
    const cloud = C.defaults(); cloud.days[MON] = { c: { med: 1 }, done: 0, m: t1 }; eq(C.count(C.merge(s, cloud), MON), 0, 'the old check marks do not come back');
  });
  await test('core: list order moves and random celebration never repeats back to back', () => {
    const it = ['a', 'b', 'c'].map(id => ({ id, name: id })); eq(C.moveItem(it, 'a', 1).map(x => x.id).join(''), 'bac'); eq(C.moveItem(it, 'a', -1).map(x => x.id).join(''), 'abc'); eq(C.moveItem(it, 'c', 1).map(x => x.id).join(''), 'abc');
    for (let i = 0; i < 200; i++) { const n = C.pick(5, 2); assert.ok(n >= 0 && n < 5 && n !== 2); } eq(C.pick(1, 0), 0); eq(C.pick(5, -1, () => 0.9999), 4);
  });
  await test('celebration: every dance (including twerk and the Griddy) is finite for a whole minute and really moves', () => {
    assert.ok(X.STYLES.includes('twerk') && X.STYLES.includes('griddy')); for (const st of X.STYLES) assert.ok(X.NAMES[st], st + ' has a name');
    for (const st of X.STYLES) {
      const lo = {}, hi = {};
      for (let t = 0; t < 60; t += 0.037) { const p = X.pose(st, t); for (const [k, v] of Object.entries(p)) { assert.ok(Number.isFinite(v), st + ' ' + k + ' ' + t); lo[k] = Math.min(lo[k] ?? 1e9, v); hi[k] = Math.max(hi[k] ?? -1e9, v); } }
      assert.ok(Math.max(...Object.keys(lo).map(k => (hi[k] - lo[k]) * (k === 'sx' ? 100 : 1))) > 20, st + ' moves');
    }
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
  /* ============ cloud backup (Firebase stubbed: the real scripts live on gstatic, which tests can't reach) ============ */
  const FAKE_FB = `(function(){ if (window.firebase) return; var L = [], user = null; try { user = JSON.parse(localStorage.getItem('fakeUser')); } catch (e) {}
    function Ref(path) { this.path = path; } Ref.prototype.collection = function (c) { var p = this.path; return { doc: function (id) { return new Ref(p + '/' + c + '/' + id); } }; };
    Ref.prototype.get = async function () { var d = await window.__fsGet(this.path); if (d && d.__deny) { var e = new Error('denied'); e.code = 'permission-denied'; throw e; } return { exists: d != null, data: function () { return d; } }; };
    Ref.prototype.set = function (d, o) { return window.__fsSet(this.path, d, !!(o && o.merge)); }; Ref.prototype.update = function (d) { return window.__fsUpdate(this.path, d); }; Ref.prototype.delete = function () { return window.__fsDel(this.path); };
    function Tx() { this.w = []; } Tx.prototype.get = function (r) { return r.get(); }; Tx.prototype.set = function (r, d, o) { this.w.push([r, d, o]); };
    var auth = { get currentUser() { return user; }, onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(user); }, 0); }, signInWithPopup: async function () { user = { uid: window.__uid || 'kid1', email: 'family@example.com' }; localStorage.setItem('fakeUser', JSON.stringify(user)); L.forEach(function (f) { f(user); }); }, signOut: async function () { user = null; localStorage.removeItem('fakeUser'); L.forEach(function (f) { f(null); }); } };
    var fs = { collection: function (c) { return { doc: function (id) { return new Ref(c + '/' + id); } }; }, runTransaction: async function (fn) { var t = new Tx(); await fn(t); for (var i = 0; i < t.w.length; i++) await t.w[i][0].set(t.w[i][1], t.w[i][2]); } };
    window.firebase = { apps: [], initializeApp: function () { this.apps.push(1); }, auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: function () { this.setCustomParameters = function () {}; } }),
      firestore: Object.assign(function () { return fs; }, { FieldValue: { serverTimestamp: function () { return 'TS'; }, arrayUnion: function (v) { return { __op: 'union', v: v }; }, arrayRemove: function (v) { return { __op: 'remove', v: v }; } } }) }; })();`;
  const cloudDb = new Map(); let fsDeny = false;
  const mkPhone = async (opts = {}) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let hits = 0;
    await ctx.exposeFunction('__fsGet', async p => { if (fsDeny) return { __deny: true }; return cloudDb.has(p) ? JSON.parse(JSON.stringify(cloudDb.get(p))) : null; });
    await ctx.exposeFunction('__fsSet', async (p, d, merge) => { cloudDb.set(p, merge ? Object.assign({}, cloudDb.get(p) || {}, d) : d); });
    await ctx.exposeFunction('__fsUpdate', async (p, d) => { const cur = Object.assign({}, cloudDb.get(p) || {}); for (const [k, v] of Object.entries(d)) { if (v && v.__op === 'union') cur[k] = [...new Set((cur[k] || []).concat(v.v))]; else if (v && v.__op === 'remove') cur[k] = (cur[k] || []).filter(x => x !== v.v); else cur[k] = v; } cloudDb.set(p, cur); });
    await ctx.exposeFunction('__fsDel', async p => { cloudDb.delete(p); });
    await ctx.route(/gstatic\.com\/firebasejs/, r => { hits++; opts.offline ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }); });
    const o = await newPage(br, { context: ctx, today: MON }); await o.page.clock.install({ time: new Date('2026-11-09T06:50:00') });
    await o.page.goto(srv.url); await o.page.waitForSelector('.item'); o.hits = () => hits; return o;
  };
  const signIn = async page => { await page.locator('[data-tab=more]').click(); await page.locator('[data-act=cloudin]').click(); await page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); };
  const cloudState = () => { const d = cloudDb.get('gr_users/kid1'); return d ? JSON.parse(d.data) : null; };
  await test('cloud: nothing is loaded or stored online until you sign in; the app offers it after a finished day', async () => {
    cloudDb.clear(); const a = await mkPhone(); eq(a.hits(), 0, 'no Firebase scripts loaded'); eq(cloudDb.size, 0);
    eq(await a.page.locator('.nudge').count(), 0, 'no nudge before there is anything to lose');
    for (let i = 0; i < 6; i++) await a.page.locator('.item .chk').nth(i).click(); await a.page.waitForSelector('.celebrate'); await a.page.locator('.cel-go').click();
    await a.page.waitForSelector('.nudge'); assert.ok(/Keep your streak safe/.test(await a.page.locator('.nudge').innerText()));
    await a.page.locator('[data-act=nudgeno]').click(); eq(await a.page.locator('.nudge').count(), 0, 'Not now hides it for a week'); eq(a.hits(), 0); eq(cloudDb.size, 0);
    eq(a.errors.length, 0, a.errors.join('|'));
  });
  await test('cloud: signing in backs up the lists, streak and photos; a new phone gets them all back; the backup holds no timers', async () => {
    cloudDb.clear(); const a = await mkPhone();
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.locator('.item').nth(3).locator('.thumb').click()]); await fc.setFiles({ name: 'bag.png', mimeType: 'image/png', buffer: PNG }); await a.page.locator('.item').nth(3).locator('.thumb img').waitFor();
    await a.page.locator('.item', { hasText: 'Brush teeth' }).locator('.tbtn').click();
    for (const i of [0, 1, 2, 3, 4, 5]) { const row = a.page.locator('.item').nth(i); if (!(await row.evaluate(e => e.classList.contains('on')))) await row.locator('.chk').click(); }
    await a.page.waitForSelector('.celebrate'); await a.page.locator('.cel-go').click();
    await signIn(a.page); eq(a.hits() > 0, true); assert.ok(cloudDb.has('gr_users/kid1'), 'the account document exists');
    const cs = cloudState(); eq(cs.days[MON].done, 1, 'the finished day is backed up'); eq(cs.lists.length, 2); eq(cs.timer, null, 'no timer in the cloud'); assert.deepStrictEqual(Object.keys(cloudDb.get('gr_users/kid1')).sort(), ['data', 'pids', 'updated']);
    await a.page.waitForFunction(() => true); await a.page.clock.runFor(200); assert.ok(cloudDb.has('gr_users/kid1/photos/bag'), 'the bag photo went up'); assert.ok(cloudDb.get('gr_users/kid1/photos/bag').img.startsWith('data:image/jpeg'));
    eq(cloudDb.get('gr_users/kid1').pids.join(), 'bag'); assert.ok(await a.page.locator('#cloud').isVisible(), 'cloud badge'); eq(await a.page.locator('#cloud').innerText(), '☁️✓');
    // a brand new phone
    const b = await mkPhone(); eq(await b.page.locator('.item.on').count(), 0); eq(await b.page.locator('.thumb img').count(), 0);
    await signIn(b.page); await b.page.locator('[data-tab=today]').click(); await b.page.waitForSelector('.item.on'); eq(await b.page.locator('.item.on').count(), 6, 'check marks came over');
    await b.page.locator('.item').nth(3).locator('.thumb img').waitFor({ timeout: 5000 }); eq(await b.page.locator('.streak').innerText().then(t => t.replace(/\s+/g, ' ')), '🔥 1 streak', 'the streak came over');
    eq(a.errors.length, 0, a.errors.join('|')); eq(b.errors.length, 0, b.errors.join('|'));
  });
  await test('cloud: two phones keep both sets of changes; unticking, removing a photo and list edits sync across; a new phone adopts the account lists', async () => {
    cloudDb.clear(); const a = await mkPhone(); await a.page.locator('.item .chk').nth(0).click(); await signIn(a.page);
    const b = await mkPhone(); await signIn(b.page); await b.page.locator('[data-tab=today]').click(); await b.page.waitForSelector('.item.on'); eq(await b.page.locator('.item.on').count(), 1);
    await b.page.locator('.item .chk').nth(1).click(); await b.page.locator('.item .chk').nth(0).click(); // b ticks vitamins and unticks medicine
    await b.page.locator('[data-tab=list]').click(); await b.page.locator('#lname').fill('Weekdays'); await b.page.locator('#lname').blur();
    await b.page.clock.runFor(25000); await a.page.clock.runFor(1000);
    await a.page.locator('[data-tab=more]').click(); await a.page.locator('[data-act=cloudnow]').click(); await a.page.waitForTimeout(300); await a.page.locator('[data-tab=today]').click();
    eq((await a.page.locator('.item.on .iname').allInnerTexts()).join(), 'Vitamins', 'a sees b\'s changes (and medicine stays unticked)'); assert.ok(/Weekdays/.test(await a.page.locator('.hello p').innerText()), 'the new list name came over');
    const c = await mkPhone(); await c.page.locator('[data-tab=list]').click(); await c.page.locator('#lname').fill('Edited before signing in'); await c.page.locator('#lname').blur(); await signIn(c.page);
    await c.page.locator('[data-tab=list]').click(); eq(await c.page.locator('#lname').inputValue(), 'Weekdays', 'a phone linking for the first time takes the account\'s lists');
    // removing a photo elsewhere sticks
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.locator('[data-tab=today]').click().then(() => a.page.locator('.item').nth(2).locator('.thumb').click())]); await fc.setFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG });
    await a.page.locator('.item').nth(2).locator('.thumb img').waitFor(); await a.page.clock.runFor(25000); await a.page.waitForTimeout(300); assert.ok(cloudDb.has('gr_users/kid1/photos/teeth'));
    await a.page.locator('.item').nth(2).locator('.thumb').click(); await a.page.locator('[data-act=vdel]').click(); await a.page.locator('[data-act=vclose]').click(); await a.page.clock.runFor(25000); await a.page.waitForTimeout(300);
    eq(cloudDb.has('gr_users/kid1/photos/teeth'), false, 'removed from the cloud'); eq(cloudDb.get('gr_users/kid1').pids.includes('teeth'), false);
    eq(a.errors.length, 0, a.errors.join('|')); eq(b.errors.length, 0, b.errors.join('|')); eq(c.errors.length, 0, c.errors.join('|'));
  });
  await test('cloud: no signal or a blocked account never breaks the checklist; sign out keeps everything on the phone', async () => {
    cloudDb.clear(); fsDeny = false; const off = await mkPhone({ offline: true }); await off.page.locator('[data-tab=more]').click(); await off.page.locator('[data-act=cloudin]').click();
    await off.page.waitForFunction(() => /No connection/.test(document.querySelector('#cl').textContent)); await off.page.locator('[data-tab=today]').click(); await off.page.locator('.item .chk').nth(0).click(); eq(await off.page.locator('.item.on').count(), 1);
    const d = await mkPhone(); fsDeny = true; await d.page.locator('[data-tab=more]').click(); await d.page.locator('[data-act=cloudin]').click(); await d.page.waitForFunction(() => /not allowed/.test(document.querySelector('#cl').textContent)); fsDeny = false;
    await d.page.locator('[data-tab=today]').click(); await d.page.locator('.item .chk').nth(0).click(); eq(await d.page.locator('.item.on').count(), 1, 'still works');
    const e = await mkPhone(); await e.page.locator('.item .chk').nth(0).click(); await signIn(e.page); await e.page.locator('[data-act=cloudout]').click(); await e.page.waitForSelector('[data-act=cloudin]');
    eq(await e.page.evaluate(() => localStorage.getItem('getready.cloud')), null); await e.page.locator('[data-tab=today]').click(); eq(await e.page.locator('.item.on').count(), 1, 'the day is still on the phone');
    eq(off.errors.length + d.errors.length + e.errors.length, 0, off.errors.concat(d.errors, e.errors).join('|'));
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
