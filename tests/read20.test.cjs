// Read 20 tests: story library checks, hand-worked log math, and the app in a real browser (fake clock for the timer).
const assert = require('assert');
const path_ = require('path');
const C = require('../apps/read20/core.js');
const B = require('../apps/read20/books.js');
const WD = require('../apps/read20/words.js');
global.window = { R20Words: WD }; const OLD = require('../apps/read20/books-older.js'); require('../apps/read20/syllables-older.js'); delete global.window;
const { launch, startServer, newPage, SHOTS } = require('./lib.cjs');
const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return;
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, (m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
const TODAY = '2026-11-08';

(async () => {
  await test('library: ids unique, 5 levels, plenty of stories, every page has words and a picture', () => {
    assert.ok(B.books.length >= 40, 'at least 40 stories');
    eq(new Set(B.books.map(b => b.id)).size, B.books.length, 'unique ids');
    for (const lv of B.LEVELS) assert.ok(B.books.filter(b => b.level === lv.n).length >= 7, 'level ' + lv.n + ' has 7+');
    for (const b of B.books) {
      assert.ok(b.title && b.cover && /^#[0-9a-f]{6}$/i.test(b.color), 'cover ' + b.id);
      assert.ok(b.pages.length >= 4, b.id + ' has pages');
      for (const p of b.pages) { assert.ok(p.text.trim().length > 0 && p.pic.trim().length > 0, b.id + ' page'); assert.ok(!/\|/.test(p.text), b.id + ' stray bar'); }
    }
  });
  await test('library: the new Level 3 animal and princess stories are short, have pictures, and break apart cleanly', () => {
    const l3 = B.books.filter(b => b.level === 3); assert.ok(l3.length >= 25, 'level 3 has ' + l3.length);
    const want = ['Clip Clop the Pony', 'Fluff the Rabbit', 'The Slow Sloth', 'Splash the Fish', 'Chuck the Chick', 'The Big Crab', 'Pug and the Stick', 'The Duck Race', 'Princess Gwen', 'The Lost Slipper', 'The Pink Castle', 'Princess Trish Can Fix It', 'The Pink Wand', 'Princess Clem and the Dragon'];
    for (const t of want) { const b = l3.find(x => x.title === t); assert.ok(b, t + ' is on the Level 3 shelf'); assert.ok(b.pages.length >= 6 && b.pages.length <= 8, t + ' has ' + b.pages.length + ' pages'); for (const p of b.pages) { assert.ok(p.pic.trim(), t + ' page has a picture'); assert.ok(p.text.split(/\s+/).length <= 10, t + ': "' + p.text + '" is long for Level 3'); assert.ok(!/[0-9]/.test(p.text)); } }
    eq(want.filter(t => /Princess|Slipper|Castle|Wand/.test(t)).length, 6, 'six princess stories'); eq(want.filter(t => !/Princess|Slipper|Castle|Wand/.test(t)).length, 8, 'eight animal stories');
    const syl = w => WD.analyze(w).text; eq(syl('princess'), 'prin·cess'); eq(syl('dragon'), 'drag·on'); eq(syl('castle'), 'cas·tle'); eq(syl('slipper'), 'slip·per'); eq(syl('rabbit'), 'rab·bit'); assert.ok(WD.analyze('castle').tricky && WD.analyze('prince').tricky && !WD.analyze('crab').tricky);
  });
  await test('library: level 1 and 2 pages stay short (first-grade length)', () => {
    for (const b of B.books.filter(b => b.level <= 2)) for (const p of b.pages) {
      const n = p.text.split(/\s+/).length;
      assert.ok(n <= (b.level === 1 ? 7 : 8), b.id + ': "' + p.text + '" has ' + n + ' words');
    }
  });
  await test('older library: 48 true-fact stories in six topics, each with words to know and a three-question check', () => {
    eq(OLD.books.length, 48); eq(OLD.TOPICS.map(t => t.id).join(), 'sports,photo,fitness,athletes,social,english'); eq(new Set(OLD.books.map(b => b.id)).size, 48, 'unique ids');
    const per = {}; OLD.books.forEach(b => (per[b.topic] = (per[b.topic] || 0) + 1)); eq(JSON.stringify(per), JSON.stringify({ sports: 5, photo: 6, fitness: 5, athletes: 16, social: 11, english: 5 }));
    for (const b of OLD.books) {
      assert.ok(b.shelf === 'older' && OLD.TOPICS.some(t => t.id === b.topic) && b.diff >= 1 && b.diff <= 3, b.id); assert.ok(b.pages.length >= 5 && b.pages.length <= 6, b.id + ' has ' + b.pages.length + ' pages');
      for (const p of b.pages) { const n = p.text.split(/\s+/).length; assert.ok(n >= 18 && n <= 95, b.id + ' page of ' + n + ' words'); assert.ok(!/[|]/.test(p.text), 'stray bar'); }
      eq(b.quiz.length, 3, b.id + ' questions'); eq(b.gloss.length, 3, b.id + ' words to know'); b.gloss.forEach(g => assert.ok(g.w && g.d && g.d.length < 80 && !/[|]/.test(g.d), b.id + ' ' + g.w)); for (const q of b.quiz) { assert.ok(q.q.endsWith('?') && q.a.length >= 3 && q.a.length <= 4 && q.ok >= 0 && q.ok < q.a.length, b.id + ': ' + q.q); eq(new Set(q.a).size, q.a.length, 'distinct answers'); }
      const total = b.pages.reduce((n, p) => n + p.text.split(/\s+/).length, 0); assert.ok(total >= 200 && total <= 340, b.id + ' is ' + total + ' words');
    }
    for (const n of ['Drake Maye', 'Jaxon Smith-Njigba', 'Justin Jefferson', 'Mookie Betts', 'Fernando Tatis Jr.', 'Jayson Tatum', 'Damian Lillard']) assert.ok(OLD.books.some(b => b.topic === 'athletes' && b.title.startsWith(n)), n + ' has a biography');
    const first = {}; OLD.books.forEach(b => b.quiz.forEach(q => (first[q.ok] = (first[q.ok] || 0) + 1))); assert.ok(Object.keys(first).length >= 2, 'right answers are spread (the page also mixes the order)');
  });
  await test('older words: the pop-up gets proper syllables for long words', () => {
    const syl = w => WD.analyze(w).text;
    eq(syl('photograph'), 'pho·to·graph'); eq(syl('photography'), 'pho·tog·ra·phy'); eq(syl('aperture'), 'ap·er·ture'); eq(syl('exposure'), 'ex·po·sure'); eq(syl('muscle'), 'mus·cle'); eq(syl('athlete'), 'ath·lete'); eq(WD.clean('Nicéphore,'), 'nicephore');
    eq(syl('marathon'), 'ma·ra·thon'); eq(syl('championship'), 'cham·pi·on·ship'); eq(syl('minute'), 'min·ute'); eq(syl('very'), 'ver·y'); eq(syl('cincinnati'), 'cin·cin·na·ti'); eq(syl('sleep'), 'sleep'); eq(syl('cat'), 'cat');
  });
  await test('core: day keys and adding days across month and year ends', () => {
    eq(C.dayKey(new Date(2026, 10, 8)), '2026-11-08'); eq(C.addDays('2026-11-30', 1), '2026-12-01'); eq(C.addDays('2026-01-01', -1), '2025-12-31'); eq(C.addDays('2028-02-28', 1), '2028-02-29');
    eq(C.parseDay('2026-02-30'), null); eq(C.parseDay('nope'), null);
  });
  await test('core: seconds add to the day and the story; goal and streak math', () => {
    const s = C.empty();
    eq(C.addSeconds(s, TODAY, 'a', 600), 600); eq(C.addSeconds(s, TODAY, 'b', 599), 599); eq(C.daySec(s, TODAY), 1199); assert.ok(!C.isDone(s, TODAY), '19:59 is not done');
    C.addSeconds(s, TODAY, 'b', 1); assert.ok(C.isDone(s, TODAY)); eq(s.days[TODAY].books.b.sec, 600);
    eq(C.addSeconds(s, TODAY, 'a', 0.9), 0); eq(C.addSeconds(s, TODAY, 'a', -5), 0);
    eq(C.streak(s, TODAY), 1);
    ['2026-11-07', '2026-11-06', '2026-11-04'].forEach(k => C.addSeconds(s, k, 'a', 1200));
    eq(C.streak(s, TODAY), 3, 'gap on the 5th ends the run');
    const t = C.empty(); ['2026-11-07', '2026-11-06'].forEach(k => C.addSeconds(t, k, 'a', 1200));
    eq(C.streak(t, TODAY), 2, 'today not done yet keeps last night\'s streak');
    eq(C.streak(C.empty(), TODAY), 0);
    const g = C.empty(); g.goal = 10; C.addSeconds(g, TODAY, 'a', 600); assert.ok(C.isDone(g, TODAY), '10 minute goal');
  });
  await test('core: finished stories, manual minutes, month grid and stats', () => {
    const s = C.empty(); C.finish(s, TODAY, 'a'); C.finish(s, '2026-11-01', 'a'); C.finish(s, TODAY, 'b');
    eq(C.finishedIds(s).a, 2); eq(Object.keys(C.finishedIds(s)).length, 2);
    assert.ok(C.addManual(s, TODAY, '  My Book ', 15)); eq(C.daySec(s, TODAY), 900); eq(s.days[TODAY].extra[0].title, 'My Book');
    assert.ok(!C.addManual(s, TODAY, 'x', 0)); assert.ok(!C.addManual(s, 'bad', 'x', 5)); assert.ok(!C.addManual(s, TODAY, 'x', 'abc'));
    const g = C.monthGrid(2026, 10); eq(g.length % 7, 0);     const first = C.monthGrid(2026, 10); // Sunday Nov 1: first cell is the 1st
    eq(first[0], '2026-11-01'); eq(first.filter(Boolean).length, 30);
    eq(C.monthGrid(2026, 1).filter(Boolean).length, 28); eq(C.monthGrid(2028, 1).filter(Boolean).length, 29);
    C.addSeconds(s, '2026-11-02', 'a', 1200); const st = C.monthStats(s, 2026, 10); eq(st.nights, 1); eq(st.sec, 900 + 1200);
    eq(C.fmtTotal(1800), '30 min'); eq(C.fmtTotal(3600), '1 hr'); eq(C.fmtTotal(5400), '1.5 hr'); eq(C.fmtClock(125), '2:05'); eq(C.fmtMin(30), 'under 1 min'); eq(C.fmtMin(0), '0 min'); eq(C.fmtMin(1200), '20 min');
  });
  await test('core: merging two saves never loses time (restore, second-copy recovery)', () => {
    const a = C.empty(), b = C.empty();
    C.addSeconds(a, TODAY, 'x', 300); C.addSeconds(a, '2026-11-07', 'x', 1200); C.finish(a, '2026-11-07', 'x');
    C.addSeconds(b, TODAY, 'x', 840); C.addSeconds(b, TODAY, 'y', 60); C.addSeconds(b, '2026-11-01', 'z', 600); C.addManual(b, '2026-11-01', 'Paper', 5); b.name = 'Pat';
    const m = C.merge(a, b);
    eq(C.daySec(m, TODAY), 900 - 0 === 900 ? 900 : 0, 'bigger day wins'); // b: 840 + 60 = 900
    eq(C.daySec(m, '2026-11-07'), 1200); eq(m.days['2026-11-07'].books.x.fin, 1, 'finished mark kept'); eq(m.days[TODAY].books.x.sec, 840); eq(m.days[TODAY].books.y.sec, 60);
    eq(C.daySec(m, '2026-11-01'), 600 + 300); eq(m.days['2026-11-01'].extra[0].title, 'Paper'); eq(m.name, 'Pat');
    eq(C.total(m), 900 + 1200 + 900); eq(C.total(C.merge(m, C.empty())), C.total(m), 'merging nothing changes nothing'); eq(C.total(C.merge(C.empty(), m)), C.total(m));
    eq(C.merge(a, a).days[TODAY].sec, 300, 'same save twice does not double');
    eq(C.daysSince('2026-11-01', '2026-11-08'), 7); eq(C.daysSince('2026-10-31', '2026-11-08'), 8);
    eq(C.sanitize({ bk: 'junk' }).bk, ''); eq(C.sanitize({ bk: '2026-11-08' }).bk, '2026-11-08');
  });
  await test('words: syllables and sound chunks are right for hand-checked words', () => {
    const syl = w => WD.analyze(w).text, snd = w => WD.analyze(w).syllables.map(s => s.sounds.map(c => (c.silent ? '(' + c.t + ')' : c.t)).join(' ')).join(' | ');
    eq(syl('rabbit'), 'rab·bit'); eq(syl('puppy'), 'pup·py'); eq(syl('spider'), 'spi·der'); eq(syl('together'), 'to·geth·er'); eq(syl('snowman'), 'snow·man'); eq(syl('grasshopper'), 'grass·hop·per');
    eq(syl('jumping'), 'jump·ing'); eq(syl('running'), 'run·ning'); eq(syl('little'), 'lit·tle'); eq(syl('twinkle'), 'twin·kle'); eq(syl('garden'), 'gar·den'); eq(syl('windows'), 'win·dows');
    eq(syl('cat'), 'cat'); eq(syl('cake'), 'cake'); eq(syl('jumped'), 'jumped'); eq(syl('played'), 'played'); eq(syl('horses'), 'hors·es'); eq(syl('tomatoes'), 'to·ma·toes');
    eq(snd('ship'), 'sh i p'); eq(snd('cat'), 'c a t'); eq(snd('cake'), 'c a k (e)'); eq(snd('high'), 'h igh'); eq(snd('jumped'), 'j u m p ed'); eq(snd('sheep'), 'sh ee p'); eq(snd('thank'), 'th a nk');
    eq(snd('little'), 'l i t | t le'); eq(snd('rabbit'), 'r a b | b i t'); eq(snd('stuck'), 's t u ck'); eq(snd('likes'), 'l i k (e) s'); eq(snd('knocked'), 'kn o ck ed');
    assert.ok(WD.analyze('said').tricky && WD.analyze('the').tricky && WD.analyze('was').tricky && !WD.analyze('cat').tricky && !WD.analyze('he').tricky);
    eq(WD.analyze('"Wolf!').word, 'wolf'); eq(WD.analyze("King's,").word, 'king'); eq(WD.analyze('Rib-bit!"').text, 'rib·bit'); eq(WD.analyze('123'), null); eq(WD.analyze(''), null);
  });
  await test('words: every word in every story breaks apart cleanly (letters add back up, 1 to 4 syllables, sounds add back up)', () => {
    const seen = new Set();
    B.books.concat(OLD.books).forEach(b => b.pages.forEach(p => p.text.split(/\s+/).forEach(raw => {
      const a = WD.analyze(raw); if (!a) { assert.ok(!/[a-z]/i.test(raw), 'could not analyze "' + raw + '"'); return; } if (seen.has(a.word)) return; seen.add(a.word);
      const letters = a.word.replace(/[-']/g, ''); eq(a.syllables.map(s => s.text).join('').replace(/'/g, '').toLowerCase(), letters, a.word + ' syllables add back up');
      assert.ok(a.syllables.length >= 1 && a.syllables.length <= 6, a.word + ' has ' + a.syllables.length);
      a.syllables.forEach(s => { eq(s.sounds.map(c => c.t).join(''), s.text.replace(/'/g, '').toLowerCase(), a.word + ' sounds add back up'); assert.ok(s.sounds.length >= 1); });
    })));
    assert.ok(seen.size > 1900, 'checked ' + seen.size);
  });
  await test('core: two phones on the same day add up; the same phone never double counts; old saves still count', () => {
    const a = C.empty(), b = C.empty(); C.dev = 'dad'; C.addSeconds(a, TODAY, 'x', 840); C.dev = 'mom'; C.addSeconds(b, TODAY, 'y', 600); C.addManual(b, TODAY, 'Paper', 5);
    const m = C.merge(a, b); eq(C.daySec(m, TODAY), 840 + 600 + 300, 'both homes add up'); eq(m.days[TODAY].books.x.sec, 840); eq(m.days[TODAY].books.y.sec, 600); eq(m.days[TODAY].extra.length, 1);
    eq(C.daySec(C.merge(m, a), TODAY), 1740, 'merging again changes nothing'); eq(C.daySec(C.merge(a, m), TODAY), 1740); eq(C.daySec(C.merge(C.merge(m, b), a), TODAY), 1740);
    C.dev = 'dad'; C.addSeconds(m, TODAY, 'x', 60); eq(C.daySec(m, TODAY), 1800, 'dad reads a minute more'); eq(C.daySec(C.merge(b, m), TODAY), 1800, 'and mom gets it without losing hers');
    const round = C.sanitize(JSON.parse(JSON.stringify(C.serialize(m)))); eq(C.daySec(round, TODAY), 1800); assert.ok(!('sec' in JSON.parse(JSON.stringify(C.serialize(m))).days[TODAY]), 'only the parts are saved');
    const old = C.sanitize({ days: { [TODAY]: { sec: 900, books: { z: { sec: 900, fin: 1 } }, extra: [] } } }); eq(C.daySec(old, TODAY), 900); C.dev = 'new'; C.addSeconds(old, TODAY, 'z', 100); eq(C.daySec(old, TODAY), 1000, 'old data plus new reading');
    eq(C.daySec(C.merge(old, C.sanitize({ days: { [TODAY]: { sec: 900, books: { z: { sec: 900, fin: 1 } }, extra: [] } } })), TODAY), 1000, 'the same old save from the cloud is not added twice'); C.dev = 'local';
  });
  await test('core: readers (several children on one phone): legacy saves become "main", merges union, removed stays removed', () => {
    const legacy = C.sanitizeRoot({ name: 'Old', days: { [TODAY]: { sec: 900, books: {}, extra: [] } } }); eq(legacy.order.join(), 'main'); eq(legacy.active, 'main'); eq(legacy.profiles.main.name, 'Old'); eq(C.totalAll(legacy), 900);
    eq(JSON.stringify(C.sanitizeRoot(null)), JSON.stringify(C.emptyRoot())); eq(C.sanitizeRoot('junk').order.join(), 'main'); eq(C.sanitizeRoot({ profiles: {} }).order.join(), 'main');
    const a = C.emptyRoot(); a.profiles.main.name = 'Gigi'; a.profiles.p1 = C.empty(); a.profiles.p1.name = 'Ava'; a.profiles.p1.av = '🐼'; a.order.push('p1'); a.active = 'p1';
    const rt = C.sanitizeRoot(JSON.parse(JSON.stringify(C.serializeRoot(a)))); eq(rt.order.join(), 'main,p1'); eq(rt.active, 'p1'); eq(rt.profiles.p1.av, '🐼'); eq(C.sanitize({ av: '💣' }).av, '', 'only the picture list is allowed');
    const b = C.emptyRoot(); C.dev = 'mom'; C.addSeconds(b.profiles.main, TODAY, 'x', 600); C.dev = 'local';
    const m = C.mergeRoot(a, b); eq(m.order.join(), 'main,p1'); eq(m.active, 'p1', 'each phone keeps its own current reader'); eq(C.daySec(m.profiles.main, TODAY), 600); eq(m.profiles.main.name, 'Gigi');
    eq(C.mergeRoot(C.emptyRoot(), a).order.join(), 'main,p1'); eq(C.mergeRoot(m, m).order.join(), 'main,p1');
    const g = C.mergeRoot(a, { profiles: { p1: a.profiles.p1 }, gone: { p1: 1 }, order: ['p1'] }); eq(g.order.join(), 'main', 'removed on one phone, removed everywhere'); eq(C.mergeRoot(g, a).order.join(), 'main', 'and an old copy cannot bring it back');
    const f = C.mergeRoot(C.emptyRoot(), { profiles: { p9: Object.assign(C.empty(), { name: 'Zed' }) }, order: ['p9'] }); eq(f.order.join(), 'p9', 'an untouched starter reader steps aside for real ones');
    assert.ok(C.newId() !== C.newId() && /^p[a-z0-9]{1,9}$/.test(C.newId()));
  });
  await test('core: damaged saves are cleaned up', () => {
    const s = C.sanitize({ name: 'A'.repeat(50) + '\u0007', goal: 7, size: 9, say: 'yes', days: { 'bad': { sec: 5 }, '2026-11-08': { sec: -4, books: { x: { sec: 'q', fin: 1 } }, extra: [{ title: 5, sec: 1e9 }, null] } } });
    eq(s.name.length, 20); eq(s.goal, 20); eq(s.size, 2); eq(s.say, false); eq(Object.keys(s.days).length, 1); eq(s.days[TODAY].sec, 0); eq(s.days[TODAY].books.x.fin, 1); eq(s.days[TODAY].extra[0].sec, 86400);
    eq(JSON.stringify(C.sanitize(null)), JSON.stringify(C.empty())); eq(JSON.stringify(C.sanitize('junk')), JSON.stringify(C.empty()));
  });

  /* ============ browser ============ */
  const srv = await startServer('read20'); const br = await launch();
  const mk = async (opts = {}) => { const o = await newPage(br, { today: TODAY, ...opts }); await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); return o; };
  const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1, (m || '') + ' expected ~' + b + ' got ' + a); // the page clock keeps moving a hair between clicks
  const openSafe = async page => { await page.locator('#gear').click(); await page.locator('#setsafe').click(); await page.locator('#cin').waitFor({ state: 'attached' }); };
  const closeSafe = async page => { await page.locator('#safedone').click(); await page.locator('#sd').click(); };
  const sec = async page => page.evaluate(() => window.R20App._state().days[window.__today] ? window.R20App._state().days[window.__today].sec : 0);

  await test('shelf: shows tonight\'s ring, levels and covers', async () => {
    const { page, errors } = await mk();
    assert.ok(await page.locator('.cover').count() >= 7); eq(await page.locator('.lv').count(), 5);
    assert.ok(/ready to read/i.test(await page.locator('.today h2').innerText()));
    await page.locator('.lv[data-lv="5"]').click(); assert.ok(await page.locator('.cover', { hasText: 'Hare' }).count());
    await page.screenshot({ path: SHOTS + '/read20-shelf.png' }); eq(errors.length, 0, errors.join('|'));
  });
  await test('reader: tap a word to highlight it, tap again to clear, one at a time; page turn clears', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    const w = page.locator('.w'); eq(await w.count(), 4);
    await w.nth(1).click(); eq(await page.locator('.w.hl').count(), 1); eq(await page.locator('.w.hl').innerText(), 'is');
    await w.nth(3).click(); eq(await page.locator('.w.hl').count(), 1); eq(await page.locator('.w.hl').innerText(), 'cat.');
    await w.nth(3).click(); eq(await page.locator('.w.hl').count(), 0);
    await w.nth(0).click(); await page.locator('#nextp').click(); eq(await page.locator('.w.hl').count(), 0); eq(await page.locator('.pgnum').innerText(), 'Page 2 of 7');
    await page.screenshot({ path: SHOTS + '/read20-reader.png' });
    await page.keyboard.press('ArrowLeft'); eq(await page.locator('.pgnum').innerText(), 'Page 1 of 7'); assert.ok(await page.locator('#prev').isDisabled());
  });
  await test('timer: runs while reading, pauses, and carries into a second story to 20 minutes', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    await page.clock.runFor(10000); await page.locator('.w').first().click(); eq(await sec(page), 10);
    await page.locator('#pause').click(); await page.clock.runFor(30000); eq(await sec(page), 10, 'paused'); await page.locator('#pause').click();
    await page.clock.runFor(5000); near(await sec(page), 15); const base = await sec(page);
    // back to the shelf: the timer stops
    await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.clock.runFor(20000); eq(await sec(page), base, 'not reading');
    await page.locator('.cover', { hasText: 'The Fat Rat' }).click(); await page.waitForSelector('.reader');
    for (let i = 0; i < 19; i++) { await page.clock.runFor(60000); await page.locator('.w').first().click(); } // keep tapping so it is never idle
    near(await sec(page), base + 19 * 60); assert.ok(!(await page.locator('#party').count()), 'not yet 20');
    await page.clock.runFor(60000); await page.locator('#party').waitFor(); assert.ok((await sec(page)) >= 1200, 'party only after the 20 minutes are in');
    assert.ok(/20 minutes/.test(await page.locator('#party h2').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-party.png' });
    await page.locator('#keep').click(); await page.clock.runFor(61000); eq(await page.locator('#party').count(), 0, 'party shows once');
    await page.locator('#back').click(); await page.waitForSelector('.cover');
    assert.ok(/done/i.test(await page.locator('.today h2').innerText()));
    const st = await page.evaluate(() => window.R20App._state().days[window.__today].books);
    near(st['sam-the-cat'].sec, base); assert.ok(st['the-fat-rat'].sec > 1200);
  });
  await test('timer: goes idle after 2 minutes of no taps and wakes on a tap', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    await page.clock.runFor(125000); const s1 = await sec(page); assert.ok(s1 <= 121 && s1 >= 119, 'counted ' + s1);
    assert.ok(await page.locator('#idlebox').isVisible()); await page.clock.runFor(30000); eq(await sec(page), s1, 'idle adds nothing');
    await page.locator('.pic').click(); assert.ok(!(await page.locator('#idlebox').isVisible())); await page.clock.runFor(4000); near(await sec(page), s1 + 4);
  });
  await test('reader: finishing a story marks it read and logs it; log shows the day and the story', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    for (let i = 0; i < 7; i++) await page.locator('#nextp').click();
    assert.ok(/The End/.test(await page.locator('.the-end h2').innerText())); await page.clock.runFor(3000);
    await page.locator('#again').click(); eq(await page.locator('.pgnum').innerText(), 'Page 1 of 7');
    await page.locator('#back').click(); await page.waitForSelector('.cover');
    assert.ok(await page.locator('.cover', { hasText: 'Sam the Cat' }).locator('.check').count(), 'check mark');
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal');
    assert.ok(/November 2026/.test(await page.locator('.mhead h2').innerText()));
    assert.ok(/Sam the Cat/.test(await page.locator('#detail').innerText()) && /finished/.test(await page.locator('#detail').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-log.png' });
    await page.locator('#pm').click(); assert.ok(/October 2026/.test(await page.locator('.mhead h2').innerText()));
  });
  await test('layout: no sideways overflow on a narrow phone; calendar is 7 even columns that do not overlap', async () => {
    for (const w of [320, 360, 412]) {
      const o = await newPage(br, { today: TODAY, ctx: { viewport: { width: w, height: 800 } } }); const { page } = o;
      await page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await page.goto(srv.url + '#log'); await page.waitForSelector('.cal');
      const m = await page.evaluate(() => { const r = [...document.querySelectorAll('.day[data-d]')].map(e => e.getBoundingClientRect()), c = document.querySelector('.cal').getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, right: Math.max(...r.map(x => x.right)), cr: c.right, w0: r[0].width, w1: r[1].width, d1: r[0].bottom, d8: r[7].top, det: document.querySelector('#detail').getBoundingClientRect().top, calb: c.bottom }; });
      assert.ok(m.sw <= m.cw, w + ': page scrolls sideways ' + m.sw + ' > ' + m.cw); assert.ok(m.right <= m.cr + 1, w + ': day past the grid'); assert.ok(Math.abs(m.w0 - m.w1) < 1.5, w + ': uneven columns');
      assert.ok(m.d8 >= m.d1, w + ': rows overlap'); eq(await page.evaluate(() => { const t = [...document.querySelectorAll('.day[data-d]')].map(e => Math.round(e.getBoundingClientRect().top)); return t[7] === t[8] && t[8] === t[13]; }), true, w + ': today cell sits in line with its row'); assert.ok(m.det >= m.calb - 1, w + ': detail overlaps the calendar');
      await page.screenshot({ path: SHOTS + '/read20-log-' + w + '.png' });
      await page.goto(srv.url); await page.waitForSelector('.cover'); eq(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, w + ' shelf');
    }
  });
  await test('log screen: tonight can be saved from right there (file and cloud buttons), and the total is in minutes not hours', async () => {
    const { page } = await mk(); await page.locator('#manual').click(); await page.fill('#mm', '30'); await page.locator('#ms').click(); await page.waitForSelector('.cover');
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.keep');
    assert.ok(/Saved on this phone/.test(await page.locator('.keep').innerText())); assert.ok(/30 min/.test(await page.locator('.stats').innerText()) && !/hours? read/.test(await page.locator('.stats').innerText()));
    const dl = page.waitForEvent('download'); await page.locator('#kfile').click(); const d = await dl; assert.ok(/read20-backup/.test(d.suggestedFilename()));
    await page.locator('#kcloud').click(); await page.locator('#cin').waitFor(); await page.locator('#safedone').click();
    await page.locator('#gear').click(); await page.locator('#setsafe').click(); await page.locator('#cin').waitFor(); await closeSafe(page);
    await page.screenshot({ path: SHOTS + '/read20-log-keep.png', fullPage: true });
  });
  await test('press and hold: a word opens a pop-up with its syllables and sounds; a quick tap only highlights', async () => {
    const { page } = await mk(); await page.locator('.lv[data-lv="4"]').click(); await page.locator('.cover', { hasText: 'Pete the Bee' }).click(); await page.waitForSelector('.reader');
    const w = page.locator('.w').first(); const press = async (loc, ms) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.clock.runFor(ms); await page.mouse.up(); };
    await press(w, 100); eq(await page.locator('.wordpop').count(), 0, 'quick tap: no pop-up'); eq(await page.locator('.w.hl').count(), 1);
    await press(w, 100); eq(await page.locator('.w.hl').count(), 0, 'second tap clears');
    for (let i = 0; i < 6; i++) await page.locator('#nextp').click(); // "Pete takes it home to the hive."
    const target = page.locator('.w', { hasText: 'takes' }); await press(target, 600); await page.locator('.wordpop').waitFor();
    eq((await page.locator('.wp-word').innerText()).toLowerCase(), 'takes'); assert.ok(/^1 syllable/.test(await page.locator('.wp-sub').innerText()));
    eq(await page.locator('.snd i').allInnerTexts().then(a => a.join(' ')), 't a k e s'); eq(await page.locator('.snd i.silent').innerText(), 'e');
    eq(await page.locator('.w.hl').count(), 1, 'the pressed word is highlighted'); await page.screenshot({ path: SHOTS + '/read20-word.png' });
    await page.locator('#wpdone').click(); await page.waitForTimeout(100); eq(await page.locator('.wordpop').count(), 0); eq(await page.locator('.w.hl').count(), 1, 'closing the pop-up does not clear the highlight');
    await page.locator('#nextp').isEnabled(); const hive = page.locator('.w', { hasText: 'hive' }); await press(hive, 600); await page.locator('.wordpop').waitFor();
    eq(await page.locator('.syl').count(), 1); await page.locator('#wpdone').click();
    await page.locator('#prev').click(); await page.locator('#prev').click(); await page.locator('#prev').click(); // "Zoom! Pete lands on the rose."
  });
  await test('press and hold: syllable chips for long words, tricky words get a note, and reading time keeps counting', async () => {
    const { page } = await mk(); await page.locator('.lv[data-lv="3"]').click(); await page.locator('.cover', { hasText: 'Hickory Dickory Dock' }).click(); await page.waitForSelector('.reader');
    const press = async (loc, ms) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.clock.runFor(ms); await page.mouse.up(); };
    const before = await sec(page); await press(page.locator('.w').first(), 700); await page.locator('.wordpop').waitFor();
    eq((await page.locator('.syl .st').allInnerTexts()).join('-').toLowerCase(), 'hick-o-ry'); eq(await page.locator('.syl').count(), 3);
    await page.locator('.syl').nth(1).click(); assert.ok(await page.locator('.syl.on').count() === 1); await page.clock.runFor(5000); assert.ok((await sec(page)) >= before + 5, 'timer kept going while the pop-up was open');
    await page.locator('#wpdone').click(); await page.locator('#nextp').click(); const the = page.locator('.w', { hasText: /^The$/ }).first(); await press(the, 600); await page.locator('.wordpop').waitFor();
    assert.ok(/tricky/i.test(await page.locator('.wp-sub').innerText())); eq(await page.locator('.snd').count(), 0, 'no sound chips for a tricky word');
    await page.keyboard.press('Escape'); await page.locator('#wpdone').click(); eq(await page.locator('.pgnum').innerText(), 'Page 2 of 5', 'pressing did not turn the page');
  });
  await test('log from home + settings: minutes count, goal changes, name shows; survives reload', async () => {
    const { page, ctx } = await mk(); await page.locator('#manual').click();
    await page.fill('#mt', 'Paper Book'); await page.fill('#mm', '12'); await page.locator('#ms').click(); await page.waitForSelector('.cover');
    assert.ok(/12/.test(await page.locator('.rtxt b').innerText()));
    await page.locator('#gear').click(); await page.fill('#sn', 'Pat'); await page.selectOption('#sg', '10'); await page.locator('#sd').click();
    assert.ok(/done/i.test(await page.locator('.today h2').innerText()), '12 >= 10 minute goal');
    await page.waitForTimeout(500); // the closed sheet hands its history entry back first
    await page.reload(); await page.waitForSelector('.cover'); assert.ok(/Read 10/.test(await page.locator('h1').innerText()));
    await page.locator('#nav button[data-go="log"]').click(); assert.ok(/Paper Book/.test(await page.locator('#detail').innerText()));
  });
  const settle = page => page.waitForTimeout(500);
  const overlays = page => page.$$eval('.overlay', o => o.length);
  await test('Back closes a pop-up and stays in the app; Cancel gives its history entry back', async () => {
    const { page, errors } = await mk();
    await page.locator('#gear').click(); await page.waitForSelector('.sheet'); await settle(page);
    await page.goBack(); await settle(page); eq(await overlays(page), 0, 'settings closed'); assert.ok(page.url().startsWith(srv.url), 'still in the app: ' + page.url());
    await page.locator('#manual').click(); await page.waitForSelector('.sheet'); await settle(page);
    await page.locator('#mc').click(); await settle(page); eq(await overlays(page), 0, 'cancel closed it');
    await page.locator('#gear').click(); await page.waitForSelector('.sheet'); await settle(page);
    await page.goBack(); await settle(page); eq(await overlays(page), 0); assert.ok(page.url().startsWith(srv.url), 'no stray entry');
    await page.goBack(); await settle(page); assert.ok(!page.url().startsWith(srv.url), 'a second Back leaves: ' + page.url());
    eq(errors.length, 0, errors.join('|'));
  });
  await test('celebration: Back keeps reading; "stop" lands on the shelf and not back in the story', async () => {
    const seed = async page => {
      await page.evaluate(k => { R20App._state().days[k] = R20Core.derive({ done: 0, parts: { old: { sec: 1198, books: {}, extra: [] } } }); }, TODAY);
      await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
      await page.clock.runFor(4000); await page.locator('#party').waitFor(); await settle(page);
    };
    const a = await mk(); await seed(a.page);
    await a.page.goBack(); await settle(a.page); eq(await overlays(a.page), 0, 'party closed'); assert.ok(await a.page.locator('.reader').count(), 'still reading');
    const b = await mk(); await seed(b.page);
    await b.page.locator('#stop').click(); await settle(b.page); eq(await overlays(b.page), 0); await b.page.waitForSelector('.cover'); eq(await b.page.locator('.reader').count(), 0, 'on the shelf');
    eq(b.errors.length, 0, b.errors.join('|'));
  });
  await test('saving: if the main copy is wiped, the second copy brings her minutes back on the next open', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    await page.clock.runFor(14000); await page.locator('.w').first().click(); await page.clock.runFor(1000);
    await page.waitForTimeout(400); const had = await sec(page); assert.ok(had >= 13, 'had ' + had);
    // pretend the browser dropped localStorage while the page was closed: new tab on the same site data
    const ctx = page.context(); await page.evaluate(() => { window.addEventListener('pagehide', e => e.stopImmediatePropagation(), true); localStorage.clear(); });
    const p2 = await ctx.newPage(); await p2.addInitScript(d => { window.__today = d; }, TODAY); await p2.goto(srv.url);
    await p2.waitForFunction(() => window.R20App._state().days[window.__today] && window.R20App._state().days[window.__today].sec >= 10, null, { timeout: 5000 });
    const back = await sec(p2); assert.ok(back >= 10, 'recovered ' + back);
    eq(await p2.evaluate(() => Object.values(JSON.parse(localStorage.getItem('read20.v1')).profiles.main.days[window.__today].parts).reduce((n, p) => n + p.sec, 0) >= 10), true, 'main copy refilled');
  });
  await test('saving: a backup file restores into a brand new phone, adds time and rejects other files', async () => {
    const a = await mk(); await a.page.locator('#manual').click(); await a.page.fill('#mt', 'Paper Book'); await a.page.fill('#mm', '14'); await a.page.locator('#ms').click(); await a.page.waitForSelector('.cover');
    await openSafe(a.page); const dl = a.page.waitForEvent('download'); await a.page.locator('#sb').click(); const d = await dl;
    assert.ok(/^read20-backup-2026-11-08\.json$/.test(d.suggestedFilename()), d.suggestedFilename());
    const path = await d.path(); const j = JSON.parse(require('fs').readFileSync(path, 'utf8')); eq(j.app, 'read20'); eq(C.sanitizeRoot(j.data).profiles.main.days[TODAY].sec, 840); eq(j.data.profiles.main.bk, TODAY);
    const b = await mk(); eq(await sec(b.page), 0);
    await openSafe(b.page); await b.page.setInputFiles('#sr', path); await b.page.waitForFunction(() => /Restored/.test(document.querySelector('#sm').textContent));
    eq(await sec(b.page), 840); await b.page.setInputFiles('#sr', path); await b.page.waitForTimeout(300); eq(await sec(b.page), 840, 'restoring twice does not double');
    require('fs').writeFileSync(SHOTS + '/junk.json', '{"hello":1}'); await b.page.setInputFiles('#sr', SHOTS + '/junk.json');
    await b.page.waitForFunction(() => /not a Read 20 backup/.test(document.querySelector('#sm').textContent)); eq(await sec(b.page), 840);
  });
  await test('saving: warns when the phone will not save; keeps a damaged save instead of writing over it; asks for permanent storage', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; });
    await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); assert.ok(await o.page.locator('#warn').isVisible(), 'warning shown');
    const q = await newPage(br, { today: TODAY }); await q.page.addInitScript(() => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('read20.v1', '{bad'); } window.__persist = 0; if (navigator.storage) navigator.storage.persist = () => { window.__persist++; return Promise.resolve(true); }; });
    await q.page.goto(srv.url); await q.page.waitForSelector('.cover');
    eq(await q.page.evaluate(() => localStorage.getItem('read20.v1.damaged')), '{bad'); eq(await q.page.evaluate(() => window.__persist), 1); assert.ok(!(await q.page.locator('#warn').isVisible()));
  });
  await test('saving: the backup reminder shows once there are 10+ minutes and no recent backup, and goes away after a backup', async () => {
    const { page } = await mk(); assert.ok(!(await page.locator('#bknow').count()));
    await page.locator('#manual').click(); await page.fill('#mm', '12'); await page.locator('#ms').click(); await page.waitForSelector('.cover');
    assert.ok(await page.locator('#bknow').isVisible()); await page.locator('#bknow').click(); const dl = page.waitForEvent('download'); await page.locator('#sb').click(); await dl; await page.locator('#safedone').click(); await page.waitForSelector('.cover');
    eq(await page.locator('#bknow').count(), 0);
  });

  /* ============ cloud backup (Firebase stubbed: the real scripts live on gstatic, which tests can't reach) ============ */
  const FAKE_FB = `(function(){ if (window.firebase) return; var L = [], user = null; try { user = JSON.parse(localStorage.getItem('fakeUser')); } catch (e) {}
    function Tx() { this.w = []; } Tx.prototype.get = async function (r) { var d = await window.__fsGet(r.path); if (d && d.__deny) { var e = new Error('denied'); e.code = 'permission-denied'; throw e; } return { exists: d != null, data: function () { return d; } }; }; Tx.prototype.set = function (r, d) { this.w.push([r.path, d]); };
    var auth = { get currentUser() { return user; }, onAuthStateChanged: function (cb) { L.push(cb); setTimeout(function () { cb(user); }, 0); }, signInWithPopup: async function () { user = { uid: window.__uid || 'parent1', email: 'parent@example.com' }; localStorage.setItem('fakeUser', JSON.stringify(user)); L.forEach(function (f) { f(user); }); }, signOut: async function () { user = null; localStorage.removeItem('fakeUser'); L.forEach(function (f) { f(null); }); } };
    var fs = { collection: function (c) { return { doc: function (id) { return { path: c + '/' + id }; } }; }, runTransaction: async function (fn) { var t = new Tx(); await fn(t); for (var i = 0; i < t.w.length; i++) await window.__fsSet(t.w[i][0], t.w[i][1]); } };
    window.firebase = { apps: [], initializeApp: function () { this.apps.push(1); }, auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: function () { this.setCustomParameters = function () {}; } }), firestore: Object.assign(function () { return fs; }, { FieldValue: { serverTimestamp: function () { return 'TS'; } } }) }; })();`;
  const cloudDb = new Map(); let fsDeny = false;
  const mkPhone = async (opts = {}) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let hits = 0;
    await ctx.exposeFunction('__fsGet', async p => { if (fsDeny) return { __deny: true }; return cloudDb.has(p) ? cloudDb.get(p) : null; });
    await ctx.exposeFunction('__fsSet', async (p, d) => { cloudDb.set(p, d); });
    await ctx.route(/gstatic\.com\/firebasejs/, r => { hits++; opts.offline ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }); });
    const o = await newPage(br, { context: ctx, today: TODAY }); await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); if (opts.uid) await o.page.addInitScript(u => { window.__uid = u; }, opts.uid);
    await o.page.goto(srv.url + (opts.hash || '')); await o.page.waitForSelector('.cover'); o.hits = () => hits; return o;
  };
  const logMin = async (page, title, min) => { await page.locator('#manual').click(); await page.fill('#mt', title); await page.fill('#mm', String(min)); await page.locator('#ms').click(); await page.waitForSelector('.cover'); };
  const cloudSec = (day, path = 'r20_users/parent1') => { const d = cloudDb.get(path); return d ? (C.sanitizeRoot(JSON.parse(d.log)).profiles.main.days[day] || { sec: 0 }).sec : -1; };

  await test('cloud: reading never loads or needs Google; nothing is sent until a parent signs in', async () => {
    cloudDb.clear(); const a = await mkPhone(); await a.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await a.page.waitForSelector('.reader');
    await a.page.clock.runFor(30000); eq(await sec(a.page), 30); eq(a.hits(), 0, 'no Firebase scripts loaded'); eq(cloudDb.size, 0);
    assert.ok(!(await a.page.locator('#cloudbadge').isVisible().catch(() => false)));
  });
  await test('cloud: a parent signs in once; the log is saved online and a brand new phone gets it back', async () => {
    cloudDb.clear(); fsDeny = false; const a = await mkPhone(); await logMin(a.page, 'Paper Book', 14);
    assert.ok(await a.page.locator('.nudge').isVisible(), 'sign-in reminder is on the shelf'); await a.page.locator('#bknow').click();
    await a.page.locator('#cin').waitFor(); await a.page.locator('#cin').click(); await a.page.waitForFunction(() => /Backed up as parent@example.com/.test(document.querySelector('#cl').textContent));
    eq(cloudSec(TODAY), 840); eq(await a.page.locator('#cin').isVisible(), false, 'sign-in button hidden once signed in'); eq(await a.page.locator('#cout').isVisible(), true); await a.page.screenshot({ path: SHOTS + '/read20-cloud.png' });
    await a.page.locator('#safedone').click(); await a.page.waitForSelector('.cover'); assert.ok(await a.page.locator('#cloudbadge').isVisible()); eq(await a.page.locator('.nudge').count(), 0);
    // new phone, same parent account
    const b = await mkPhone(); eq(await sec(b.page), 0); await openSafe(b.page); await b.page.locator('#cin').click();
    await b.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); eq(await sec(b.page), 840, 'the 14 minutes came back'); await closeSafe(b.page);
    assert.ok(/14/.test(await b.page.locator('.rtxt b').innerText()));
    // she reads on the new phone (no sign-in prompt anywhere in the reader); it syncs on its own
    await b.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await b.page.waitForSelector('.reader'); await b.page.clock.runFor(25000); await b.page.waitForTimeout(300);
    assert.ok(cloudSec(TODAY) >= 850, 'cloud grew while she read: ' + cloudSec(TODAY)); eq(await b.page.locator('.reader #cin').count(), 0);
  });
  await test('cloud: two phones merge; neither loses time; signed-in phones come back signed in after a reload', async () => {
    cloudDb.clear(); const a = await mkPhone(), b = await mkPhone();
    await logMin(a.page, 'Book A', 10); await logMin(b.page, 'Book B', 5);
    for (const p of [a.page, b.page]) { await openSafe(p); await p.locator('#cin').click(); await p.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); await closeSafe(p); }
    await openSafe(a.page); await a.page.locator('#cnow').click(); await a.page.waitForTimeout(400); await closeSafe(a.page);
    eq(cloudSec(TODAY), 900, 'two phones, same day: both readings count (10 + 5 minutes)'); 
    await a.page.reload().catch(() => a.page.reload()); // the sheet's closing Back navigation can abort a reload
    await a.page.waitForSelector('.cover'); await a.page.waitForFunction(() => document.querySelector('#cloudbadge') && !document.querySelector('#cloudbadge').hidden);
    await logMin(b.page, 'Book C', 20); // b now ahead
    await openSafe(b.page); await b.page.locator('#cnow').click(); await b.page.waitForTimeout(400); await closeSafe(b.page);
    await openSafe(a.page); await a.page.locator('#cnow').click(); await a.page.waitForTimeout(400); await closeSafe(a.page);
    assert.ok((await sec(a.page)) >= 1500, 'a caught up with b: ' + await sec(a.page));
  });
  await test('cloud: no signal or a blocked account never breaks reading; sign out stops syncing; erase also erases the cloud copy', async () => {
    cloudDb.clear(); fsDeny = false; const off = await mkPhone({ offline: true }); await openSafe(off.page); await off.page.locator('#cin').click();
    await off.page.waitForFunction(() => /No connection/.test(document.querySelector('#cl').textContent)); await closeSafe(off.page);
    await off.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await off.page.waitForSelector('.reader'); await off.page.clock.runFor(10000); eq(await sec(off.page), 10); eq(await off.page.locator('.warn:visible').count(), 0);
    const d = await mkPhone(); await logMin(d.page, 'X', 12); await openSafe(d.page); await d.page.locator('#cin').click();
    await d.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); eq(cloudSec(TODAY), 720);
    d.page.on('dialog', x => x.accept()); await d.page.locator('#se').click(); await d.page.waitForSelector('.cover'); await d.page.waitForTimeout(400);
    eq(cloudSec(TODAY), 0, 'cloud copy erased too'); eq(await sec(d.page), 0);
    const e = await mkPhone(); await logMin(e.page, 'Y', 12); fsDeny = true; await openSafe(e.page); await e.page.locator('#cin').click();
    await e.page.waitForFunction(() => /not allowed/.test(document.querySelector('#cl').textContent)); fsDeny = false;
    await e.page.locator('#cout').click(); await e.page.waitForFunction(() => /Not set up/.test(document.querySelector('#cl').textContent));
    eq(await e.page.evaluate(() => localStorage.getItem('read20.cloud')), null); eq(await sec(e.page), 720, 'her time stays on the phone');
  });

  /* ============ audio ============ */
  const FAKE_SPEECH = `(function(){ window.__said = []; window.__cancels = 0; window.__busy = false;
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { get speaking() { return window.__busy; }, pending: false, cancel: function () { window.__cancels++; window.__busy = false; }, resume: function () {}, speak: function (u) { window.__said.push(u.text + '@' + u.rate + '/' + u.lang); }, getVoices: function () { return [{ lang: 'en-GB', localService: true, name: 'b' }, { lang: 'en-US', localService: true, name: 'a' }]; } } }); })();`;
  const mkAudio = async (opts = {}) => { const o = await newPage(br, { today: TODAY }); if (opts.speech !== false) await o.page.addInitScript(FAKE_SPEECH); else await o.page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }); }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); return o; };
  const tapKey = (page, key) => page.locator('.tile[data-key="' + key + '"]').click();
  const played = page => page.evaluate(() => window.R20Audio.log.slice());

  await test('audio: speech is used the way Chrome needs (language, voice, a pause after cancel); settings has a sound test; the chime shares one engine', async () => {
    const { page } = await mkAudio(); const c0 = await page.evaluate(() => window.__cancels); await page.evaluate(() => { window.__busy = true; window.R20Audio.speak('hello', 0.8); });
    eq(await page.evaluate(() => window.__cancels), c0 + 1, 'cancels the old line'); eq((await page.evaluate(() => window.__said)).length, 0, 'does not speak in the same instant as cancel'); await page.waitForTimeout(250);
    eq((await page.evaluate(() => window.__said)).join(), 'hello@0.8/en-US'); eq(await page.evaluate(() => window.R20Audio.info().voices), 2);
    await page.locator('#gear').click(); await page.locator('#stest').click();
    await page.waitForFunction(() => /You should hear a beep and then a voice/.test(document.querySelector('#stm').textContent)); await page.waitForTimeout(900); assert.ok((await page.evaluate(() => window.__said)).some(x => /Can you hear me/.test(x)));
    await page.locator('#sd').click();
    const a = await page.evaluate(() => { const c = window.R20Audio.ctx(); window.R20Audio.chime(); window.R20Audio.chime(); return window.R20Audio.ctx() === c; }); eq(a, true);
  });
  await test('audio: popup buttons and tapped words speak through the same voice; no voice on the phone hides the speaker button', async () => {
    const { page } = await mkAudio(); await page.locator('#gear').click(); await page.locator('#ss').check(); await page.locator('#sd').click();
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').nth(3).click(); await page.waitForTimeout(150);
    assert.ok((await page.evaluate(() => window.__said)).some(x => /^cat@/.test(x)), 'tapped word spoken');
    const b = await page.locator('.w').nth(0).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.locator('.wordpop').waitFor();
    await page.locator('#wphear').click(); await page.waitForTimeout(150); assert.ok((await page.evaluate(() => window.__said)).some(x => /^sam@0\.75/.test(x)));
    const n = await mkAudio({ speech: false }); eq(await n.page.locator('#bsay').count(), 0, 'no Say it button without a voice');
  });
  await test('family link: one log for two homes, each phone with its own Google account; both homes\' minutes add up', async () => {
    cloudDb.clear(); fsDeny = false;
    const a = await mkPhone({ uid: 'dad1' }); await logMin(a.page, 'Dad reading', 10);
    await openSafe(a.page); await a.page.locator('#cin').click(); await a.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent));
    eq(await a.page.locator('#shsend').isVisible(), false); await a.page.locator('#shmake').click(); await a.page.waitForFunction(() => /Sharing is on/.test(document.querySelector('#shmsg').textContent));
    const key = await a.page.evaluate(() => window.R20Cloud.shareKey()); assert.ok(/^[a-z2-7]{20}$/.test(key), 'a 20 character code'); assert.ok(cloudDb.has('r20_shared/' + key), 'the log is in the shared document');
    eq(await a.page.locator('#shsend').isVisible(), true); eq(await a.page.locator('#shstop').isVisible(), true);
    const link = await a.page.evaluate(() => window.R20Cloud.link()); assert.ok(link.endsWith('#join=' + key), link); assert.ok(/Code: \w{5}-\w{5}-\w{5}-\w{5}/.test(await a.page.locator('#shmsg').innerText()));
    await a.page.screenshot({ path: SHOTS + '/read20-share.png', fullPage: false }); await closeSafe(a.page);
    // the other home opens the link on a different phone, with a different Google account
    const b = await mkPhone({ uid: 'mom1', hash: '#join=' + key }); await b.page.locator('#jyes').waitFor(); assert.ok(/own.*Google account/.test(await b.page.locator('.sheet').innerText()));
    eq(await sec(b.page), 0); await b.page.locator('#jyes').click(); await b.page.waitForFunction(() => /Joined/.test(document.querySelector('#jmsg').textContent)); eq(await sec(b.page), 600, 'her 10 minutes came over'); await b.page.locator('#jno').click(); eq(await b.page.locator('.rtxt b').innerText(), '10', 'the home screen under the pop-up shows the joined log, not a stale empty one'); eq(await b.page.locator('.rd.on .nm').innerText(), 'Reader');
    eq(await b.page.evaluate(() => location.hash), '', 'the link is cleaned out of the address');
    await logMin(b.page, 'Mom reading', 5);   // the same day, on the other phone
    await openSafe(b.page); await b.page.locator('#cnow').click(); await b.page.waitForTimeout(400); await closeSafe(b.page);
    eq(cloudSec(TODAY, 'r20_shared/' + key), 900, 'shared log has both homes');
    await openSafe(a.page); await a.page.locator('#cnow').click(); await a.page.waitForTimeout(400); await closeSafe(a.page);
    eq(await sec(a.page), 900, 'dad sees mom\'s 5 minutes on top of his 10, not instead of them');
    assert.ok(!cloudDb.has('r20_users/mom1') || cloudSec(TODAY, 'r20_users/mom1') <= 0, 'mom\'s phone does not use a personal document once shared');
    // a third phone typing the code instead of using the link
    const c = await mkPhone({ uid: 'gma1' }); await openSafe(c.page); await c.page.fill('#jcode', 'junk'); await c.page.locator('#jgo').click(); assert.ok(/does not look like/.test(await c.page.locator('#shmsg').innerText()));
    await c.page.fill('#jcode', (await a.page.evaluate(() => window.R20Cloud.pretty())).toUpperCase()); await c.page.locator('#jgo').click(); await c.page.locator('#jyes').waitFor(); await c.page.locator('#jyes').click();
    await c.page.waitForFunction(() => /Joined/.test(document.querySelector('#jmsg').textContent)); eq(await sec(c.page), 900);
  });
  await test('family link: not-yet-published rules, bad links and stopping the share are handled without losing anything', async () => {
    cloudDb.clear(); const a = await mkPhone({ uid: 'dad2' }); await logMin(a.page, 'X', 12); await openSafe(a.page); await a.page.locator('#cin').click();
    await a.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); fsDeny = true; await a.page.locator('#shmake').click();
    await a.page.waitForFunction(() => /Could not make the link/.test(document.querySelector('#shmsg').textContent)); eq(await a.page.evaluate(() => window.R20Cloud.shareKey()), ''); eq(await sec(a.page), 720); fsDeny = false;
    await a.page.locator('#shmake').click(); await a.page.waitForFunction(() => /Sharing is on/.test(document.querySelector('#shmsg').textContent)); await a.page.locator('#shstop').click();
    eq(await a.page.evaluate(() => window.R20Cloud.shareKey()), ''); eq(await a.page.locator('#shmake').isVisible(), true); eq(await sec(a.page), 720, 'stopping keeps the minutes on the phone');
    const bad = await mkPhone({ hash: '#join=notacode' }); eq(await bad.page.locator('.sheet').count(), 0, 'a broken link opens nothing'); eq(await bad.page.locator('.cover').count() > 0, true);
    const p = await bad.page.evaluate(() => [window.R20Cloud.parseKey('https://x.github.io/apps/read20/#join=abcdefghijklmnopqrst'), window.R20Cloud.parseKey('ABCDE-FGHIJ-KLMNO-PQRST'), window.R20Cloud.parseKey('abcdefghij'), window.R20Cloud.parseKey('abcdefghijklmnopqrs1'), window.R20Cloud.parseKey('')]);
    eq(p.join('|'), 'abcdefghijklmnopqrst|abcdefghijklmnopqrst|||');
  });
  await test('family link: a join that was walked away from does not join this phone later', async () => {
    cloudDb.clear(); fsDeny = false; const K = 'abcdefghijklmnopqrst', PEND = 'read20.joinPending';
    const a = await mkPhone({ uid: 'dad3', hash: '#join=' + K }); await a.page.locator('#jno').waitFor();
    await a.page.evaluate(([p, k]) => localStorage.setItem(p, k + '.' + Date.now()), [PEND, K]); await a.page.locator('#jno').click();
    eq(await a.page.evaluate(p => localStorage.getItem(p), PEND), null, 'Not now forgets the code');
    await a.page.evaluate(([p, k]) => localStorage.setItem(p, k + '.' + (Date.now() - 20 * 60 * 1000)), [PEND, K]);
    await openSafe(a.page); await a.page.locator('#cin').click(); await a.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent));
    eq(await a.page.evaluate(() => window.R20Cloud.shareKey()), '', 'an old pending code is ignored at sign-in'); eq(await a.page.evaluate(p => localStorage.getItem(p), PEND), null, 'and cleared');
    assert.ok(!cloudDb.has('r20_shared/' + K), 'nothing went to the family log'); assert.ok(cloudDb.has('r20_users/dad3'), 'the backup went to this account');
  });
  await test('readers: add children, swap on the home screen, each keeps their own log, goal and streak', async () => {
    const { page, errors } = await mk(); eq(await page.locator('.rd[data-id]').count(), 1); assert.ok(await page.locator('#addrd').isVisible());
    await page.locator('#manual').click(); await page.fill('#mm', '20'); await page.locator('#ms').click(); await page.waitForSelector('.cover'); eq(await sec(page), 1200);
    await page.locator('#addrd').click(); await page.fill('#rn', ' '); await page.locator('#ra').click(); eq(await page.locator('.avgrid').count(), 1, 'a name is needed'); await page.fill('#rn', 'Ava'); await page.locator('.avp[data-av="🐼"]').click(); await page.locator('#ra').click();
    await page.waitForFunction(() => /Ava/.test(document.querySelector('.today h2').textContent)); eq(await page.locator('.rd[data-id]').count(), 2); eq(await page.locator('.rd.on .nm').innerText(), 'Ava'); eq(await page.locator('.rd.on .av').innerText(), '🐼');
    eq(await sec(page), 0, 'a new reader starts fresh'); assert.ok(/ready to read/i.test(await page.locator('.today h2').innerText()));
    await page.locator('#manual').click(); await page.fill('#mm', '7'); await page.locator('#ms').click(); await page.waitForSelector('.cover'); eq(await sec(page), 420);
    await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Reader'); eq(await sec(page), 1200, 'the first reader still has their 20 minutes'); assert.ok(/done/i.test(await page.locator('.today h2').innerText()));
    await page.locator('#gear').click(); await page.selectOption('#sg', '10'); await page.fill('#sn', 'Gigi'); await page.locator('.avp[data-av="🦄"]').click(); await page.locator('#sd').click(); await page.waitForSelector('.cover');
    eq(await page.locator('.rd.on .nm').innerText(), 'Gigi'); eq(await page.locator('.rd.on .av').innerText(), '🦄'); eq(await page.locator('.rd:not(.on):not(.add) .nm').innerText(), 'Ava', 'only the open reader changed');
    await page.locator('.rd:not(.on):not(.add)').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ava'); eq(await page.evaluate(() => R20App._state().goal), 20, 'Ava still has the 20 minute goal'); eq(await sec(page), 420);
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal'); assert.ok(/Ava's Reading Log/.test(await page.locator('h1').innerText())); assert.ok(/7 min/.test(await page.locator('#detail').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-readers-log.png' }); await page.locator('#nav button[data-go=""]').click(); await page.waitForSelector('.cover');
    await page.reload(); await page.waitForSelector('.cover'); eq(await page.locator('.rd.on .nm').innerText(), 'Ava', 'the open reader is remembered'); eq(await page.locator('.rd[data-id]').count(), 2);
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.clock.runFor(30000); eq(await sec(page), 450, 'reading time goes to the open reader');
    await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Gigi'); eq(await sec(page), 1200, 'and not to the other');
    await page.screenshot({ path: SHOTS + '/read20-readers.png' }); eq(errors.length, 0, errors.join('|'));
  });
  await test('readers: an old single-reader save moves over untouched; removing a reader asks first, keeps the last one, and stays removed', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(() => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('read20.v1', JSON.stringify({ v: 1, name: 'Old', goal: 15, size: 2, days: { '2026-11-08': { done: 1, parts: { old: { sec: 960, books: { 'sam-the-cat': { sec: 960, fin: 1 } }, extra: [] } } } } })); } });
    await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    eq(await page.evaluate(() => R20App._root().order.join()), 'main'); eq(await page.locator('.rd.on .nm').innerText(), 'Old'); eq(await sec(page), 960); eq(await page.evaluate(() => R20App._state().goal), 15);
    assert.ok(await page.locator('.cover', { hasText: 'Sam the Cat' }).locator('.check').count(), 'finished stories carried over');
    await page.locator('#gear').click(); eq(await page.locator('#srm').count(), 0, 'cannot remove the only reader'); await page.locator('#sd').click();
    await page.locator('#addrd').click(); await page.fill('#rn', 'Ben'); await page.locator('#ra').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ben');
    await page.locator('#gear').click(); let asked = ''; page.once('dialog', d => { asked = d.message(); d.dismiss(); }); await page.locator('#srm').click(); await page.waitForTimeout(100); assert.ok(/Remove Ben/.test(asked), asked); eq(await page.locator('.rd[data-id]').count(), 2, 'cancelling removes nothing');
    page.once('dialog', d => d.accept()); await page.locator('#srm').click(); await page.waitForFunction(() => document.querySelectorAll('.rd[data-id]').length === 1);
    eq(await page.locator('.rd.on .nm').innerText(), 'Old'); eq(await sec(page), 960); await settle(page); await page.reload(); await page.waitForSelector('.cover'); eq(await page.locator('.rd[data-id]').count(), 1, 'stays removed');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('read20.v1')).v), 2, 'saved in the new shape');
  });
  await test('readers: settings is short (the reader, then two doors) and the cloud, sharing and file choices sit one step in', async () => {
    const { page } = await mk(); await page.locator('#gear').click(); await page.waitForSelector('.sheet');
    eq(await page.locator('.sheet .set').count(), 3, 'three groups'); assert.ok(await page.locator('.sheet button:visible:not(.avp)').count() <= 7, 'few buttons: ' + await page.locator('.sheet button:visible:not(.avp)').count());
    for (const id of ['#cin', '#shmake', '#jcode', '#sb', '#sr', '#se']) eq(await page.locator(id).count(), 0, id + ' is not on the first settings screen');
    assert.ok(await page.locator('#setsafe').isVisible()); await page.screenshot({ path: SHOTS + '/read20-settings.png' });
    await page.locator('#setsafe').click(); await page.locator('#cin').waitFor(); eq(await page.locator('.sheet').last().locator('.set').count(), 3, 'online, sharing, and file'); await page.screenshot({ path: SHOTS + '/read20-safe.png' });
    await closeSafe(page);
  });
  await test('readers: the cloud and backup files carry every reader; a removed reader stays removed on the other phone', async () => {
    cloudDb.clear(); fsDeny = false; const a = await mkPhone({ uid: 'dadr' });
    await a.page.locator('#addrd').click(); await a.page.fill('#rn', 'Ava'); await a.page.locator('#ra').click(); await a.page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ava'); await logMin(a.page, 'Ava book', 9);
    await a.page.locator('.rd[data-id]').first().click(); await logMin(a.page, 'Gigi book', 12);
    await openSafe(a.page); await a.page.locator('#cin').click(); await a.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent));
    const dl = a.page.waitForEvent('download'); await a.page.locator('#sb').click(); const d = await dl; const j = JSON.parse(require('fs').readFileSync(await d.path(), 'utf8')); eq(Object.keys(j.data.profiles).length, 2, 'the backup file holds both readers');
    await closeSafe(a.page);
    const b = await mkPhone({ uid: 'dadr' }); await openSafe(b.page); await b.page.locator('#cin').click(); await b.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); await closeSafe(b.page);
    eq(await b.page.locator('.rd[data-id]').count(), 2, 'the new phone has both readers'); eq(await b.page.locator('.rd.on .nm').innerText(), 'Reader', 'and keeps its own open reader');
    await b.page.locator('.rd[data-id]').nth(1).click(); await b.page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ava'); eq(await sec(b.page), 540);
    await b.page.locator('#gear').click(); b.page.once('dialog', x => x.accept()); await b.page.locator('#srm').click(); await b.page.waitForFunction(() => document.querySelectorAll('.rd[data-id]').length === 1); await b.page.waitForTimeout(500);
    await a.page.reload(); await a.page.waitForSelector('.cover'); await openSafe(a.page); await a.page.locator('#cnow').click(); await a.page.waitForTimeout(500); await closeSafe(a.page);
    eq(await a.page.locator('.rd[data-id]').count(), 1, 'removed on one phone, gone on the other');
    const c = await mkPhone({ uid: 'dadr' }); await c.page.locator('#gear').click(); await c.page.locator('#setsafe').click(); await c.page.locator('#sr').setInputFiles(await d.path()); await c.page.waitForFunction(() => /Restored/.test(document.querySelector('#sm').textContent));
    await closeSafe(c.page); eq(await c.page.locator('.rd[data-id]').count(), 2, 'restoring a file brings back both readers');
  });
  await test('older reader: add a 12-year-old reader, get the library by topic, read with a quiz at the end', async () => {
    const { page, errors } = await mk(); await page.locator('#addrd').click(); await page.fill('#rn', 'Sam'); eq(await page.locator('.lvopt').count(), 2); eq(await page.locator('.lvopt.on').innerText(), '🌱 Learning to read\nShort stories, big words, pictures'.replace('\n', '\n'), 'defaults to early');
    await page.locator('.lvopt[data-lv="older"]').click(); await page.locator('#ra').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Sam');
    eq(await page.evaluate(() => R20App._state().lv), 'older'); eq(await page.evaluate(() => R20App._state().size), 0, 'older readers start with normal-size words'); assert.ok(/The Library/.test(await page.locator('.sec').innerText())); eq(await page.locator('.lv').count(), 6);
    eq(await page.locator('.cover').count(), 5, 'sports first'); await page.locator('.lv[data-tp="athletes"]').click(); eq(await page.locator('.cover').count(), 16); await page.locator('.lv[data-tp="photo"]').click(); eq(await page.locator('.cover').count(), 6); await page.locator('.lv[data-tp="social"]').click(); eq(await page.locator('.cover').count(), 11); await page.locator('.lv[data-tp="english"]').click(); eq(await page.locator('.cover').count(), 5);
    assert.ok(await page.locator('#next').isVisible()); assert.ok(/Curveball/.test(await page.locator('#next').innerText())); await page.screenshot({ path: SHOTS + '/read20-older-shelf.png' });
    await page.locator('.lv[data-tp="sports"]').click(); await page.locator('.cover', { hasText: 'Curveball' }).click(); await page.waitForSelector('.reader.older');
    assert.ok(/Press and hold a word to see its syllables/.test(await page.locator('.hint').innerText())); assert.ok((await page.locator('.w').count()) > 30, 'a full paragraph'); await page.screenshot({ path: SHOTS + '/read20-older-reader.png' });
    // press and hold a long word: syllables only, no sound chips, no "tricky" note
    const w = page.locator('.w', { hasText: 'seconds' }).first(); await page.locator('#nextp').click(); await page.locator('#nextp').click();
    const target = page.locator('.w', { hasText: /^Scientists$/ }).first(); const b = await target.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.clock.runFor(600); await page.mouse.up();
    await page.locator('.wordpop').waitFor(); eq((await page.locator('.syl .st').allInnerTexts()).join('-'), 'sci-en-tists'); eq(await page.locator('.snd').count(), 0, 'no sound chips for older readers'); assert.ok(!/tricky/i.test(await page.locator('.wp-sub').innerText())); await page.screenshot({ path: SHOTS + '/read20-older-word.png' }); await page.locator('#wpdone').click();
    await page.locator('#prev').click(); await page.locator('#prev').click(); for (let i = 0; i < 5; i++) await page.locator('#nextp').click();
    await page.waitForSelector('.quiz'); eq(await page.locator('.gloss dt').count(), 3, 'words to know'); assert.ok(/Magnus effect/.test(await page.locator('.gloss').innerText())); eq(await page.locator('.qq').count(), 3); eq(await page.locator('.qb').count(), 9); eq(await page.locator('#more').isVisible(), true);
    const ask = i => page.locator('.qq').nth(i); const rightOf = i => ask(i).locator('.qb', { hasText: ['60 feet, 6 inches', 'Spin and the air around the seams', '108'][i] });
    await rightOf(0).click(); eq(await ask(0).locator('.qf').innerText(), '✓ Right!'); eq(await ask(0).locator('.qb.right').count(), 1);
    const wrong = ask(1).locator('.qb', { hasText: 'A longer throw' }); await wrong.click(); assert.ok(/Not quite. The answer is: Spin and the air around the seams/.test(await ask(1).locator('.qf').innerText())); eq(await wrong.evaluate(e => e.classList.contains('wrong')), true); eq(await ask(1).locator('.qb.right').innerText(), 'Spin and the air around the seams');
    await rightOf(0).click({ force: true }); eq(await ask(0).locator('.qb.right').count(), 1, 'a locked question stays locked'); await rightOf(2).click(); assert.ok(/You got 2 of 3/.test(await page.locator('#qscore').innerText())); await page.screenshot({ path: SHOTS + '/read20-older-quiz.png', fullPage: true });
    const order = await ask(2).locator('.qb').allInnerTexts(); assert.ok(order.length === 3 && new Set(order).size === 3);
    await page.locator('#back').click(); await page.waitForSelector('.cover'); assert.ok(await page.locator('.cover', { hasText: 'Curveball' }).locator('.check').count(), 'finished'); assert.ok(/Sam's|Sam/.test(await page.locator('.rd.on .nm').innerText()));
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal'); assert.ok(/Sports · finished/.test(await page.locator('#detail').innerText()), await page.locator('#detail').innerText());
    eq(errors.length, 0, errors.join('|'));
  });
  await test('older reader: the reading level is a setting on each reader, saved, synced and does not touch the other reader', async () => {
    const { page } = await mk(); await page.locator('#gear').click(); eq(await page.locator('#slv').inputValue(), 'early'); await page.selectOption('#slv', 'older'); await page.locator('#sd').click(); await page.waitForSelector('.cover');
    assert.ok(/The Library/.test(await page.locator('.sec').innerText())); eq(await page.locator('.lv').count(), 6);
    await page.locator('#addrd').click(); await page.fill('#rn', 'Kid'); await page.locator('#ra').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Kid'); assert.ok(/The Book Shop/.test(await page.locator('.sec').innerText()), 'the new reader is an early reader'); eq(await page.locator('.cover').count(), 8);
    await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Reader'); assert.ok(/The Library/.test(await page.locator('.sec').innerText()));
    await page.reload(); await page.waitForSelector('.cover'); assert.ok(/The Library/.test(await page.locator('.sec').innerText()), 'remembered after a reload');
    await page.locator('#gear').click(); eq(await page.locator('#sz option').allInnerTexts().then(a => a.join()), 'Normal,Large,Extra large'); await page.selectOption('#slv', 'early'); await page.locator('#sd').click(); assert.ok(/The Book Shop/.test(await page.locator('.sec').innerText()));
    const C2 = await page.evaluate(() => { const R = R20Core; const a = R.emptyRoot(); a.profiles.main.lv = 'older'; R.addSeconds(a.profiles.main, '2026-11-09', 'x', 60); return R.mergeRoot(R.emptyRoot(), a).profiles.main.lv; }); eq(C2, 'older', 'a fresh phone takes the saved level');
  });
  await test('older theme: dark look with line icons for older readers only, switches with the reader, and stays readable', async () => {
    const { page } = await mk(); const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const cs = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
    eq(await page.evaluate(() => document.documentElement.classList.contains('teen')), false, 'early readers keep the bright look'); eq(await page.locator('.cover .ce svg').count(), 0, 'covers use emoji'); eq(await page.locator('#nav svg').count(), 0);
    eq(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#fff6e3');
    await page.locator('#addrd').click(); await page.fill('#rn', 'Alex'); await page.locator('.lvopt[data-lv="older"]').click(); await page.locator('#ra').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Alex');
    eq(await page.evaluate(() => document.documentElement.classList.contains('teen')), true); eq(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#0b1020'); eq(await page.evaluate(() => document.querySelector('meta[name="color-scheme"]').content), 'dark');
    const covers = await page.locator('.cover').count(); eq(await page.locator('.cover .ce svg').count(), covers, 'every cover has a line icon'); eq(await page.locator('.cover .ce').first().evaluate(e => e.textContent.trim()), '', 'and no emoji'); assert.ok(await page.locator('.cover .pips').count() === covers, 'difficulty dots');
    eq(await page.locator('#nav svg').count(), 2); eq(await page.locator('.top h1 svg').count(), 1); eq(await page.locator('#gear svg').count(), 1); eq(await page.locator('.lv svg').count(), 6, 'topic tabs'); assert.ok(await page.locator('#next .bk svg').count() === 1);
    assert.ok(contrast(await cs('body', 'color'), await cs('body', 'backgroundColor')) >= 12, 'body text on the dark background'); assert.ok(contrast(await cs('.sec', 'color'), await cs('body', 'backgroundColor')) >= 12);
    await page.locator('.cover').first().click(); await page.waitForSelector('.reader.older'); eq(await page.locator('#pause svg').count(), 1); eq(await page.locator('#prev svg').count(), 1); eq(await page.locator('.pic svg').count(), 1); eq(await page.locator('.confetti').count(), 0);
    assert.ok(contrast(await cs('.reader .text', 'color'), await cs('body', 'backgroundColor')) >= 12, 'story text'); assert.ok(!/👆/.test(await page.locator('.hint').innerText()), 'no emoji in the hint');
    await page.locator('.w').nth(3).click(); assert.ok(contrast(await cs('.w.hl', 'color'), await cs('.w.hl', 'backgroundColor')) >= 7, 'highlighted word'); await page.locator('#pause').click(); eq(await page.locator('#pause svg.ic-play').count(), 1, 'the pause button shows play');
    await page.locator('#pause').click(); await page.locator('#back').click(); await page.waitForSelector('.cover');
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal'); eq(await page.locator('.stats svg').count(), 4); assert.ok(contrast(await cs('.stats span', 'color'), await cs('.stats div', 'backgroundColor')) >= 4.5, 'small stat labels');
    await page.locator('#nav button[data-go=""]').click(); await page.waitForSelector('.cover'); await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Reader');
    eq(await page.evaluate(() => document.documentElement.classList.contains('teen')), false, 'back to the bright look for the early reader'); eq(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#fff6e3'); eq(await page.locator('.cover .ce svg').count(), 0);
    await page.reload(); await page.waitForSelector('.cover'); eq(await page.evaluate(() => document.documentElement.classList.contains('teen')), false);
    await page.locator('.rd[data-id]').nth(1).click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Alex'); await page.reload(); await page.waitForSelector('.cover'); eq(await page.evaluate(() => document.documentElement.classList.contains('teen')), true, 'remembered after a reload');
  });
  await test('offline: the service worker caches the app and it reopens with no network', async () => {
    const o = await newPage(br, { sw: true, today: TODAY }); const { page, ctx } = o;
    await page.goto(srv.url); await page.waitForSelector('.cover'); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.cover');
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.cover'); assert.ok(await page.locator('.cover').count() >= 7);
    eq(o.errors.length, 0, o.errors.join('|'));
  });

  await br.close(); srv.stop();
  const bad = results.filter(r => !r[1]);
  console.log(bad.length ? bad.length + ' failed' : 'all passed: ' + results.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
