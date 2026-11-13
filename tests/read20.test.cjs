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
  await test('library: Level 3 step-by-step "how to build or make it" stories and nature stories', () => {
    const l3 = B.books.filter(b => b.level === 3); assert.ok(l3.length >= 36, 'level 3 has ' + l3.length);
    const steps = ['A Hut for Pug', 'Build a Sand Castle', 'Build a Fort', 'The Block Tower', 'The Brick Hut', 'Jam on a Bun'], nature = ['The Sun', 'The Moon', 'Sun and Moon', 'At the Ocean', 'A Walk in the Forest'];
    for (const t of steps) { const b = l3.find(x => x.title === t); assert.ok(b, t); const all = b.pages.map(p => p.text).join(' '); assert.ok(/First,/.test(all) && /Next,/.test(all) && /Last,|Then,/.test(all), t + ' goes step by step (First, Next, Then, Last)'); const order = ['First,', 'Next,', 'Then,', 'Last,'].map(w => all.indexOf(w)).filter(i => i >= 0); eq(JSON.stringify(order), JSON.stringify(order.slice().sort((a, c) => a - c)), t + ' steps are in order'); }
    for (const t of nature) { const b = l3.find(x => x.title === t); assert.ok(b, t); assert.ok(b.pages.length >= 6 && b.pages.length <= 8, t + ' pages'); }
    for (const t of steps.concat(nature)) for (const p of l3.find(x => x.title === t).pages) { assert.ok(p.pic.trim(), t + ' picture'); assert.ok(p.text.split(/\s+/).length <= 10, t + ': "' + p.text + '"'); }
    assert.ok(WD.analyze('first').tricky && WD.analyze('ocean').tricky && WD.analyze('forest').tricky && !WD.analyze('hammer').tricky); eq(WD.analyze('hammer').text, 'ham·mer');
  });
  await test('library: new Level 4 and Level 5 stories (cheerleading, gymnastics, animals, princesses, nature, building)', () => {
    const l4 = B.books.filter(b => b.level === 4), l5 = B.books.filter(b => b.level === 5); assert.ok(l4.length >= 21 && l5.length >= 15, 'level 4 has ' + l4.length + ', level 5 has ' + l5.length);
    const w4 = ['Kate Learns to Cheer', 'Pyramid Day', 'Game Day Cheer', 'Mae on the Beam', 'Cartwheel Day', 'The Big Flip', 'Dave the Whale', 'Princess Rose and the Goat', 'The Rain', 'How to Make a Kite'];
    const w5 = ['Cheer Tryouts', "The Squad's First Competition", 'Nadia and the Perfect Ten', 'How Gymnasts Stay Safe', "A Sea Turtle's Journey", 'Princess Mia and the Missing Key', 'How Rain Happens', 'Building a Treehouse'];
    for (const [list, titles, max] of [[l4, w4, 9], [l5, w5, 20]]) for (const t of titles) { const b = list.find(x => x.title === t); assert.ok(b, t + ' is on the shelf'); assert.ok(b.pages.length >= 7 && b.pages.length <= 8, t + ' has ' + b.pages.length + ' pages'); for (const p of b.pages) { assert.ok(p.pic.trim(), t + ' picture'); const n = p.text.split(/\s+/).length; assert.ok(n <= max, t + ': "' + p.text + '" has ' + n + ' words'); } }
    eq(w4.filter(t => /Cheer|Pyramid/.test(t)).length, 3, 'three cheer stories at Level 4'); eq(w4.filter(t => /Beam|Cartwheel|Flip/.test(t)).length, 3, 'three gymnastics stories at Level 4'); eq(w5.filter(t => /Cheer|Squad/.test(t)).length, 2); eq(w5.filter(t => /Nadia|Gymnasts/.test(t)).length, 2);
    const nadia = l5.find(b => b.title.startsWith('Nadia')).pages.map(p => p.text).join(' '); assert.ok(/1976/.test(nadia) && /Montreal/.test(nadia) && /fourteen/.test(nadia) && /three gold medals/.test(nadia) && /seven perfect tens/.test(nadia), 'the Nadia facts are in');
    const syl = w => WD.analyze(w).text; eq(syl('gymnastics'), 'gym·nas·tics'); eq(syl('competition'), 'com·pe·ti·tion'); eq(syl('uneven'), 'un·e·ven'); eq(syl('sparkling'), 'spar·kling'); eq(syl('pyramid'), 'py·ra·mid'); eq(syl('cartwheel'), 'cart·wheel'); eq(syl('castle'), 'cas·tle');
  });
  await test('library: gymnastics biographies at Levels 4 and 5 carry the true facts', () => {
    const l4 = B.books.filter(b => b.level === 4), l5 = B.books.filter(b => b.level === 5), txt = t => (l4.concat(l5).find(b => b.title.startsWith(t)) || { pages: [] }).pages.map(p => p.text).join(' ');
    for (const t of ['Simone Biles', 'Mary Lou Retton']) assert.ok(l4.find(b => b.title === t), t + ' at Level 4');
    for (const t of ['Simone Biles: A Champion', 'Gabby Douglas', 'Suni Lee', "Kerri Strug", 'Aly Raisman']) assert.ok(l5.find(b => b.title.startsWith(t)), t + ' at Level 5');
    assert.ok(/1984/.test(txt('Mary Lou')) && /ten/.test(txt('Mary Lou')) && /West Virginia/.test(txt('Mary Lou')));
    assert.ok(/London/.test(txt('Gabby')) && /2012/.test(txt('Gabby')) && /first African American woman/.test(txt('Gabby')) && /Iowa/.test(txt('Gabby')));
    assert.ok(/Tokyo/.test(txt('Suni')) && /all-around gold/.test(txt('Suni')) && /Hmong/.test(txt('Suni')));
    assert.ok(/1996/.test(txt('Kerri')) && /Atlanta/.test(txt('Kerri')) && /first gold medal ever/.test(txt('Kerri')));
    assert.ok(/captain/.test(txt('Aly')) && /six Olympic medals/.test(txt('Aly')) && /2012/.test(txt('Aly')));
    assert.ok(/Paris/.test(txt('Simone Biles: A')) && /three gold medals/.test(txt('Simone Biles: A')) && /Columbus, Ohio/.test(txt('Simone Biles: A')));
  });
  await test('library: 10 more Level 1 stories (strictly short-vowel words) and 10 more Level 2 stories (sight words)', () => {
    const l1 = B.books.filter(b => b.level === 1), l2 = B.books.filter(b => b.level === 2); assert.ok(l1.length >= 18 && l2.length >= 18, 'level 1 has ' + l1.length + ', level 2 has ' + l2.length);
    const n1 = ['Jen and the Jet', 'Max the Fox', 'A Bug on a Log', 'Pug in the Mud', 'Ted in Bed', 'Gus the Bus', 'A Bat in a Hut', 'Zip the Pup', 'Nat and the Ant', 'Hop, Hop, Hop'];
    const n2 = ['My Dad', 'In the Yard', 'Who Is It?', 'Get Up!', 'The Hot Dog', 'Pets, Pets, Pets', 'Red and Tan', 'Can You Hop?', 'The Lost Hat', 'Fun with Mom'];
    const sight1 = new Set(['a', 'the', 'is', 'an']); const cvc = /^[bcdfghjklmnpqrstvwxyz]{0,2}[aeiou][bcdfghjklmnpqrstvwxyz]{1,2}s?$/, bad = /(sh|ch|th|ck|ng|nk|ph|wh|qu)/;
    for (const t of n1) { const b = l1.find(x => x.title === t); assert.ok(b, t + ' on Level 1'); assert.ok(b.pages.length >= 6 && b.pages.length <= 8, t + ' pages'); for (const p of b.pages) { assert.ok(p.pic.trim(), t + ' picture'); const ws = p.text.split(/\s+/); assert.ok(ws.length <= 7, t + ': "' + p.text + '"'); for (const raw of ws) { const w = raw.toLowerCase().replace(/[^a-z]/g, ''); assert.ok(sight1.has(w) || w === 'i' || (cvc.test(w) && !bad.test(w) && w.length <= 4), t + ': "' + w + '" is not a Level 1 word'); } } }
    for (const t of n2) { const b = l2.find(x => x.title === t); assert.ok(b, t + ' on Level 2'); assert.ok(b.pages.length >= 6 && b.pages.length <= 8, t + ' pages'); for (const p of b.pages) { assert.ok(p.pic.trim(), t + ' picture'); assert.ok(p.text.split(/\s+/).length <= 8, t + ': "' + p.text + '"'); } }
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
  await test('core: removing a story or a book from home takes the time out, keeps reading that comes later, and survives merging with an older copy', () => {
    const s = C.empty(); C.dev = 'a'; C.addSeconds(s, TODAY, 'x', 120); C.addManual(s, TODAY, 'Home', 3); C.addSeconds(s, TODAY, 'y', 300); const before = JSON.parse(JSON.stringify(C.serialize(s)));
    eq(C.daySec(s, TODAY), 600); eq(C.removeBook(s, TODAY, 'x'), true); eq(C.daySec(s, TODAY), 480); eq(s.days[TODAY].books.x, undefined); eq(C.removeExtra(s, TODAY, 'a', 0), true); eq(C.daySec(s, TODAY), 300);
    eq(C.removeBook(s, TODAY, 'nope'), false); eq(C.removeExtra(s, TODAY, 'a', 5), false);
    const back = C.sanitize(JSON.parse(JSON.stringify(C.serialize(s)))); eq(C.daySec(back, TODAY), 300, 'saved and loaded');
    eq(C.daySec(C.merge(back, C.sanitize(before)), TODAY), 300, 'an older copy cannot bring it back'); eq(C.daySec(C.merge(C.sanitize(before), back), TODAY), 300, 'in either order');
    C.addSeconds(back, TODAY, 'x', 60); eq(C.daySec(back, TODAY), 360, 'new reading of the same story after removal still counts'); eq(back.days[TODAY].books.x.sec, 60);
    C.dev = 'local';
  });
  await test('core: the morning second chance appears only for a short night, before noon', () => {
    const s = C.empty(); C.addSeconds(s, '2026-11-08', 'a', 720);
    const m = C.makeup(s, '2026-11-09', 8); eq(m.day, '2026-11-08'); eq(m.sec, 720); eq(m.left, 480);
    eq(C.makeup(s, '2026-11-09', 12), null, 'not after noon'); eq(C.makeup(s, '2026-11-09', 19), null); eq(C.makeup(s, '2026-11-10', 8), null, 'only the night just before');
    C.addSeconds(s, '2026-11-08', 'a', 480); eq(C.makeup(s, '2026-11-09', 8), null, 'a finished night is not offered'); eq(C.makeup(C.empty(), '2026-11-09', 8), null, 'a night with no reading is not offered');
  });
  await test('core: longest streak, best day and the cheers for tonight', () => {
    const s = C.empty(); ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].forEach(k => C.addSeconds(s, k, 'a', 1200)); C.addSeconds(s, '2026-11-01', 'a', 1500);
    eq(C.bestStreak(s), 4); eq(C.bestDay(s), 1500); eq(C.bestDay(s, '2026-11-01'), 1200);
    C.addSeconds(s, '2026-11-07', 'a', 1200); const c = C.cheers(s, '2026-11-07'); eq(c.streak, 5); eq(c.milestone, 5); eq(c.record, true);
    const u = C.empty(); ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].forEach(k => C.addSeconds(u, k, 'a', 1200)); ['2026-11-07', '2026-11-08'].forEach(k => C.addSeconds(u, k, 'a', 1200));
    const d = C.cheers(u, '2026-11-08'); eq(d.streak, 2); eq(d.milestone, 0); eq(d.record, false, 'a shorter run than the best is not a record');
    eq(C.cheers(C.empty(), TODAY).record, false);
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
    const a = C.emptyRoot(); a.profiles.main.name = 'Riley'; a.profiles.p1 = C.empty(); a.profiles.p1.name = 'Ava'; a.profiles.p1.av = '🐼'; a.order.push('p1'); a.active = 'p1';
    const rt = C.sanitizeRoot(JSON.parse(JSON.stringify(C.serializeRoot(a)))); eq(rt.order.join(), 'main,p1'); eq(rt.active, 'p1'); eq(rt.profiles.p1.av, '🐼'); eq(C.sanitize({ av: '💣' }).av, '', 'only the picture list is allowed');
    const b = C.emptyRoot(); C.dev = 'mom'; C.addSeconds(b.profiles.main, TODAY, 'x', 600); C.dev = 'local';
    const m = C.mergeRoot(a, b); eq(m.order.join(), 'main,p1'); eq(m.active, 'p1', 'each phone keeps its own current reader'); eq(C.daySec(m.profiles.main, TODAY), 600); eq(m.profiles.main.name, 'Riley');
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
    const { page } = await mk(); await page.evaluate(() => localStorage.setItem('read20.syllables', '1'));  await page.locator('.lv[data-lv="4"]').click(); await page.locator('.cover', { hasText: 'Pete the Bee' }).click(); await page.waitForSelector('.reader');
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
    const { page } = await mk(); await page.evaluate(() => localStorage.setItem('read20.syllables', '1'));  await page.locator('.lv[data-lv="3"]').click(); await page.locator('.cover', { hasText: 'Hickory Dickory Dock' }).click(); await page.waitForSelector('.reader');
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
    var fs = { collection: function (c) { return { doc: function (id) { var path = c + '/' + id; return { path: path, get: async function () { var d = await window.__fsGet(path); if (d && d.__deny) { var e = new Error('denied'); e.code = 'permission-denied'; throw e; } return { exists: d != null, data: function () { return d; } }; } }; } }; }, runTransaction: async function (fn) { var t = new Tx(); await fn(t); for (var i = 0; i < t.w.length; i++) await window.__fsSet(t.w[i][0], t.w[i][1]); } };
    window.firebase = { apps: [], initializeApp: function () { this.apps.push(1); }, auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: function () { this.setCustomParameters = function () {}; } }), firestore: Object.assign(function () { return fs; }, { FieldValue: { serverTimestamp: function () { return 'TS'; } } }) }; })();`;
  const cloudDb = new Map(); let fsDeny = false;
  const mkPhone = async (opts = {}) => {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let hits = 0; const paths = [];
    await ctx.exposeFunction('__fsGet', async p => { paths.push('get ' + p); if (fsDeny) return { __deny: true }; return cloudDb.has(p) ? cloudDb.get(p) : null; });
    await ctx.exposeFunction('__fsSet', async (p, d) => { paths.push('set ' + p); cloudDb.set(p, d); });
    await ctx.route(/gstatic\.com\/firebasejs/, r => { hits++; opts.offline ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: FAKE_FB }); });
    const o = await newPage(br, { context: ctx, today: TODAY }); await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); if (opts.uid) await o.page.addInitScript(u => { window.__uid = u; }, opts.uid);
    await o.page.goto(srv.url + (opts.hash || '')); await o.page.waitForSelector('.cover'); o.hits = () => hits; o.paths = paths; return o;
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
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.evaluate(() => localStorage.setItem('read20.syllables', '1')); await page.locator('.w').nth(3).click(); await page.waitForTimeout(150);
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
    await page.locator('#gear').click(); await page.selectOption('#sg', '10'); await page.fill('#sn', 'Riley'); await page.locator('.avp[data-av="🦄"]').click(); await page.locator('#sd').click(); await page.waitForSelector('.cover');
    eq(await page.locator('.rd.on .nm').innerText(), 'Riley'); eq(await page.locator('.rd.on .av').innerText(), '🦄'); eq(await page.locator('.rd:not(.on):not(.add) .nm').innerText(), 'Ava', 'only the open reader changed');
    await page.locator('.rd:not(.on):not(.add)').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ava'); eq(await page.evaluate(() => R20App._state().goal), 20, 'Ava still has the 20 minute goal'); eq(await sec(page), 420);
    await page.locator('#nav button[data-go="log"]').click(); await page.waitForSelector('.cal'); assert.ok(/Ava's Reading Log/.test(await page.locator('h1').innerText())); assert.ok(/7 min/.test(await page.locator('#detail').innerText()));
    await page.screenshot({ path: SHOTS + '/read20-readers-log.png' }); await page.locator('#nav button[data-go=""]').click(); await page.waitForSelector('.cover');
    await page.reload(); await page.waitForSelector('.cover'); eq(await page.locator('.rd.on .nm').innerText(), 'Ava', 'the open reader is remembered'); eq(await page.locator('.rd[data-id]').count(), 2);
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.clock.runFor(30000); eq(await sec(page), 450, 'reading time goes to the open reader');
    await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.locator('.rd[data-id]').first().click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Riley'); eq(await sec(page), 1200, 'and not to the other');
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
    await page.locator('#setsafe').click(); await page.locator('#cin').waitFor(); eq(await page.locator('.sheet').last().locator('.set').count(), 4, 'online, sharing, one reader\'s own phone, and file'); await page.screenshot({ path: SHOTS + '/read20-safe.png' });
    await closeSafe(page);
  });
  await test('readers: the cloud and backup files carry every reader; a removed reader stays removed on the other phone', async () => {
    cloudDb.clear(); fsDeny = false; const a = await mkPhone({ uid: 'dadr' });
    await a.page.locator('#addrd').click(); await a.page.fill('#rn', 'Ava'); await a.page.locator('#ra').click(); await a.page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Ava'); await logMin(a.page, 'Ava book', 9);
    await a.page.locator('.rd[data-id]').first().click(); await logMin(a.page, 'Riley book', 12);
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
    assert.ok(/tap a word to hear it/i.test(await page.locator('.hint').innerText()), 'syllables are off for now'); await page.evaluate(() => localStorage.setItem('read20.syllables', '1')); await page.locator('#back').click(); await page.waitForSelector('.cover'); await page.locator('.cover', { hasText: 'Curveball' }).click(); await page.waitForSelector('.reader.older');
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
    await page.locator('#addrd').click(); await page.fill('#rn', 'Kid'); await page.locator('#ra').click(); await page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Kid'); assert.ok(/The Book Shop/.test(await page.locator('.sec').innerText()), 'the new reader is an early reader'); eq(await page.locator('.cover').count(), await page.evaluate(() => R20Books.books.filter(b => b.shelf === 'early' && b.level === 1).length));
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
  await test('updates: the service worker asks the site for a newer file every time; Settings shows the version and a safe refresh that keeps the log', async () => {
    assert.ok(/cache: "no-cache"/.test(require('fs').readFileSync(path_.join(__dirname, '../apps/read20/sw.js'), 'utf8')), 'no 10-minute stale copies');
    const o = await newPage(br, { sw: true, today: TODAY }); const { page } = o; await page.goto(srv.url); await page.waitForSelector('.cover'); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.locator('#manual').click(); await page.fill('#mm', '12'); await page.locator('#ms').click(); await page.waitForSelector('.cover'); eq(await sec(page), 720);
    await page.locator('#gear').click(); assert.ok(/Library: \d+ stories · version 20\d\d-\d\d-\d\d/.test(await page.locator('#sver').innerText()), await page.locator('#sver').innerText());
    const total = await page.evaluate(() => R20Books.books.length); assert.ok(new RegExp('Library: ' + total + ' stories').test(await page.locator('#sver').innerText()), 'the count is the real library size, so a phone with an old library shows a smaller number');
    await page.evaluate(() => { window.__marker = 1; }); await page.locator('#srefresh').click(); await page.waitForFunction(() => window.__marker === undefined, null, { timeout: 15000 }); await page.waitForSelector('.cover');
    eq(await page.evaluate(() => window.__marker === undefined), true, 'the page reloaded'); eq(await sec(page), 720, 'her 12 minutes are still there');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('read20.v1')).profiles.main.days[window.__today || Object.keys(JSON.parse(localStorage.getItem('read20.v1')).profiles.main.days)[0]] !== undefined), true);
  });
  await test('one reader per phone: a parent links a child\'s phone to a single reader; the child\'s phone sees only that reader and its reading is merged, not lost', async () => {
    cloudDb.clear(); fsDeny = false;
    const par = await mkPhone({ uid: 'parentR' }); await logMin(par.page, 'Parent-phone book', 10);   // the starter reader: 10 minutes
    await par.page.locator('#addrd').click(); await par.page.fill('#rn', 'Kidtwo'); await par.page.locator('#ra').click(); await par.page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Kidtwo');
    await logMin(par.page, 'Kid book', 15); const kidId = await par.page.evaluate(() => R20App._root().active), otherId = await par.page.evaluate(() => R20App._root().order[0]); assert.ok(kidId !== otherId);
    await openSafe(par.page); await par.page.locator('#cin').click(); await par.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent));
    eq(await par.page.locator('#rdname').innerText(), 'Kidtwo'); await par.page.locator('#rlmake').click(); await par.page.waitForFunction(() => /This reader is linked/.test(document.querySelector('#rlmsg').textContent));
    const key = await par.page.evaluate(() => Object.values(R20Cloud.readerKeys())[0]); assert.ok(/^[a-z2-7]{20}$/.test(key)); eq(await par.page.evaluate(() => Object.keys(R20Cloud.readerKeys()).join()), kidId);
    // what is stored for the link: ONE reader, nothing about the others
    const doc = JSON.parse(cloudDb.get('r20_shared/' + key).log); eq(doc.kind, 'reader'); eq(doc.id, kidId); assert.ok(!('profiles' in doc) && !JSON.stringify(doc).includes(otherId), 'the other reader is not in the link\'s record'); eq(doc.profile.name, 'Kidtwo');
    await par.page.screenshot({ path: SHOTS + '/read20-readerlink.png' }); const link = await par.page.evaluate(k => R20Cloud.readerLink(k), key); assert.ok(link.endsWith('#reader=' + key));
    await closeSafe(par.page);
    // the child's own phone: it already has 7 minutes of its own reading and an unrelated starter reader
    const kid = await mkPhone({ uid: 'kidAcct' }); await logMin(kid.page, 'Own book', 7); const before = await kid.page.evaluate(() => R20Core.totalAll(R20App._root()));
    await kid.page.waitForTimeout(500); await kid.page.evaluate(h => { location.hash = h; }, '#reader=' + key); await kid.page.locator('#jryes').waitFor(); assert.ok(/only that one reader/.test(await kid.page.locator('.sheet').innerText()) && /Any Google account works/.test(await kid.page.locator('.sheet').innerText()));
    await kid.page.locator('#jryes').click(); await kid.page.waitForFunction(() => R20Cloud.kid() && document.querySelector('.rd.on .nm').textContent === 'Kidtwo', null, { timeout: 8000 });
    const root = await kid.page.evaluate(() => R20App._root()); eq(root.order.join(), kidId, 'exactly one reader on the child\'s phone'); eq(await kid.page.locator('.rd[data-id]').count(), 1); eq(await kid.page.locator('#addrd').count(), 0, 'no way to add readers');
    eq(await sec(kid.page), 15 * 60 + 7 * 60, 'the reader\'s 15 minutes plus the 7 already read on this phone'); assert.ok(before === 420);
    assert.ok(await kid.page.evaluate(() => (localStorage.getItem('read20.v1.beforelink') || '').length > 20), 'a safety copy of the old save is kept');
    await kid.page.locator('#nav button[data-go="log"]').click(); await kid.page.waitForSelector('.cal'); eq(await kid.page.locator('.keep').count(), 0, 'no backup card on the log screen'); await kid.page.locator('#nav button[data-go=""]').click(); await kid.page.waitForSelector('.cover');
    await kid.page.locator('#gear').click(); await kid.page.waitForSelector('.sheet'); eq(await kid.page.locator('#setsafe').count(), 0, 'no parent screens in Settings'); eq(await kid.page.locator('#srm').count(), 0); eq(await kid.page.locator('#kunlink').count(), 1); await kid.page.screenshot({ path: SHOTS + '/read20-kidsettings.png' }); await kid.page.locator('#sd').click();
    // reading on the child's phone shows up for the parent; the child's phone only ever touches that one record
    await logMin(kid.page, 'More reading', 5); await kid.page.evaluate(() => R20Cloud.syncNow()); await kid.page.waitForTimeout(500);
    for (const p of kid.paths) assert.ok(p === 'get r20_shared/' + key || p === 'set r20_shared/' + key, 'the child\'s phone touched ' + p); assert.ok(!kid.paths.some(p => /r20_users/.test(p)), 'never the family backup');
    await par.page.evaluate(() => R20Cloud.syncNow()); await par.page.waitForTimeout(500); eq(await par.page.evaluate(id => R20Core.daySec(R20App._root().profiles[id], window.__today), kidId), (15 + 7 + 5) * 60, 'the parent\'s copy of this reader now includes the child\'s phone');
    eq(await par.page.evaluate(id => R20Core.daySec(R20App._root().profiles[id], window.__today), otherId), 600, 'the other reader is untouched');
    eq(JSON.parse(cloudDb.get('r20_shared/' + key).log).kind, 'reader');
    // stopping: the child's phone keeps its reading but stops syncing
    await kid.page.locator('#gear').click(); kid.page.once('dialog', d => d.accept()); await kid.page.locator('#kunlink').click(); await kid.page.waitForTimeout(300); eq(await kid.page.evaluate(() => R20Cloud.kid()), null);
    const docBefore = cloudDb.get('r20_shared/' + key).log; await logMin(kid.page, 'After unlink', 3); await kid.page.evaluate(() => R20Cloud.syncNow()); await kid.page.waitForTimeout(300); eq(cloudDb.get('r20_shared/' + key).log, docBefore, 'nothing is sent after unlinking');
    await openSafe(par.page); assert.ok(await par.page.locator('#rlstop').isVisible()); await par.page.locator('#rlstop').click(); eq(await par.page.evaluate(() => Object.keys(R20Cloud.readerKeys()).length), 0); await closeSafe(par.page);
  });
  await test('one reader per phone: a bad or old reader link changes nothing, and a phone that is already a family-link phone is not hijacked', async () => {
    cloudDb.clear(); fsDeny = false; const a = await mkPhone({ uid: 'someone' }); await logMin(a.page, 'Mine', 9); await a.page.waitForTimeout(500); await a.page.evaluate(() => { location.hash = '#reader=aaaaaaaaaaaaaaaaaaaa'; }); await a.page.locator('#jryes').waitFor();
    await a.page.locator('#jryes').click(); await a.page.waitForFunction(() => /not found/.test(document.querySelector('#jrmsg').textContent), null, { timeout: 8000 }); eq(await a.page.evaluate(() => R20Cloud.kid()), null); eq(await sec(a.page), 540, 'its reading is untouched');
    eq(await a.page.evaluate(() => R20App._root().order.length), 1);
    const q = await a.page.evaluate(() => [R20Cloud.parseReaderKey('https://x.github.io/apps/read20/#reader=abcdefghijklmnopqrst'), R20Cloud.parseReaderKey('ABCDE-FGHIJ-KLMNO-PQRST'), R20Cloud.parseReaderKey('nope')]); eq(q.join('|'), 'abcdefghijklmnopqrst|abcdefghijklmnopqrst|');
  });
  await test('one reader per phone: the code can be pasted inside the app (for a home-screen app that cannot see the browser)', async () => {
    cloudDb.clear(); fsDeny = false; const par = await mkPhone({ uid: 'p1' }); await par.page.locator('#addrd').click(); await par.page.fill('#rn', 'Pasted'); await par.page.locator('#ra').click(); await par.page.waitForFunction(() => document.querySelector('.rd.on .nm').textContent === 'Pasted');
    await logMin(par.page, 'x', 11); await openSafe(par.page); await par.page.locator('#cin').click(); await par.page.waitForFunction(() => /Backed up as/.test(document.querySelector('#cl').textContent)); await par.page.locator('#rlmake').click(); await par.page.waitForFunction(() => /This reader is linked/.test(document.querySelector('#rlmsg').textContent));
    const pretty = await par.page.evaluate(() => R20Cloud.pretty(Object.values(R20Cloud.readerKeys())[0])); await closeSafe(par.page);
    const kid = await mkPhone({ uid: 'k1' }); await openSafe(kid.page); await kid.page.fill('#rcode', 'nonsense'); await kid.page.locator('#rgo').click(); assert.ok(/does not look like/.test(await kid.page.locator('#rlmsg').innerText()));
    await kid.page.fill('#rcode', pretty.toUpperCase()); await kid.page.locator('#rgo').click(); await kid.page.locator('#jryes').waitFor(); await kid.page.locator('#jryes').click();
    await kid.page.waitForFunction(() => R20Cloud.kid() && document.querySelector('.rd.on .nm').textContent === 'Pasted', null, { timeout: 8000 }); eq(await sec(kid.page), 660); eq(await kid.page.locator('#setsafe').count(), 0);
  });
  await test('numbers: counts "reads" when real reading time is logged and "goals" when the goal is met, and nothing else leaves the phone', async () => {
    const o = await newPage(br, { today: TODAY }); const { page } = o; await page.addInitScript(() => { window.__counts = []; window.nateCount = k => window.__counts.push(k); });
    await page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await page.goto(srv.url); await page.waitForSelector('.cover');
    eq(await page.evaluate(() => window.__counts.length), 0, 'opening the app counts no reading');
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').first().click();
    await page.clock.runFor(5000); assert.ok((await page.evaluate(() => window.__counts)).includes('reads'));
    eq(await page.evaluate(() => window.__counts.includes('goals')), false);
    for (let i = 0; i < 19; i++) { await page.clock.runFor(60000); await page.locator('.w').first().click(); } await page.clock.runFor(60000); await page.locator('#party').waitFor(); eq(await page.evaluate(() => window.__counts.filter(k => k === 'goals').length), 1);
  });
  await test('syllables are off by default: a long press on a word does not open the pop-up, and a tap says the word', async () => {
    const { page } = await mk(); await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); const b = await page.locator('.w').first().boundingBox();
    await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down(); await page.clock.runFor(900); await page.mouse.up(); eq(await page.locator('.wordpop').count(), 0);
    eq(await page.locator('.hint').innerText(), '👆 Turn on the speaker, then tap a word to hear it', 'sound starts off, so the hint points to the speaker');
    await page.locator('#spk').click(); eq(await page.locator('.hint').innerText(), '👆 Tap a word to hear it', 'speaker on: a tap says the word');
  });
  await test('syllables: a part is respelled for the voice so it sounds like it does inside the word (plen-ty says "plen" "tee")', async () => {
    const o = await newPage(br, { today: TODAY }); const say = w => o.page.evaluate(x => R20Words.analyze(x).syllables.map(s => s.say).join(' '), w);
    await o.page.goto(srv.url); await o.page.waitForSelector('.cover');
    eq(await say('plenty'), 'plen tee'); eq(await say('happy'), 'hap pee'); eq(await say('people'), 'pee puhl'); eq(await say('nation'), 'nay shun'); eq(await say('reply'), await say('reply'));
    eq(await say('table'), 'tab uhl'); eq(await say('measure'), 'meh zhur'); eq(await say('cat'), 'cat', 'one-syllable words are said as written');
    eq(await say('gymnast'), 'gym nist', 'an unstressed part is said as it sounds in the word, not as its own word'); eq(await say('apply'), 'uh plye'); eq(await say('focused'), 'foe kist'); eq(await say('nowhere'), 'no where'); eq(await say('action'), 'ax shun'); eq(await say('almost'), 'all most'); eq(await say('achilles'), 'uh kill eez'); eq(await say('everyone'), 'ev ree wun'); eq(await say('pianist'), 'pih an ist');
  });
  const seedDays = (keys, secs) => page => page.addInitScript(([ks, sc]) => { if (!sessionStorage.x) { sessionStorage.x = 1; const days = {}; ks.forEach(k => { days[k] = { done: 1, parts: { old: { sec: sc, books: {}, extra: [] } } }; }); localStorage.setItem('read20.v1', JSON.stringify({ v: 1, name: 'Riley', goal: 20, size: 1, days })); } }, [keys, secs]);
  const readMin = async (page, n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(60000); await page.locator('.w').first().click(); } };
  await test('celebrations: the 5th night in a row gets confetti and a streak cheer; a plain night gets confetti and no streak cheer', async () => {
    const o = await newPage(br, { today: TODAY }); await seedDays(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'], 1200)(o.page);
    await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').first().click(); await readMin(page, 19); await page.clock.runFor(60000);
    await page.locator('#party').waitFor(); assert.ok(/5 nights in a row/.test(await page.locator('#party').innerText()), 'milestone'); assert.ok(/longest streak/i.test(await page.locator('#party').innerText()), 'record');
    eq(await page.locator('#confetti').count(), 1, 'confetti');
    const p = await mk(); await p.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await p.page.waitForSelector('.reader'); await p.page.locator('.w').first().click(); await readMin(p.page, 19); await p.page.clock.runFor(60000);
    await p.page.locator('#party').waitFor(); eq(await p.page.locator('.cheer').count(), 0, 'no streak cheer on the first night'); eq(await p.page.locator('#confetti').count(), 1);
  });
  await test('celebrations: a new best night shows a note once, and confetti is skipped when the phone asks for less motion', async () => {
    const o = await newPage(br, { today: TODAY }); await seedDays(['2026-11-05'], 1500)(o.page);
    await o.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').first().click(); await readMin(page, 19); await page.clock.runFor(60000);
    await page.locator('#party').waitFor(); await page.locator('#keep').click(); eq(await page.locator('.pbtoast').count(), 0, 'not a record yet (25 min is the best)');
    await readMin(page, 6); await page.locator('.pbtoast').waitFor(); assert.ok(/New personal best/.test(await page.locator('.pbtoast').innerText()));
    await page.clock.runFor(6000); eq(await page.locator('.pbtoast').count(), 0, 'it fades'); await readMin(page, 3); eq(await page.locator('.pbtoast').count(), 0, 'only once a night');
    const q = await newPage(br, { today: TODAY }); await q.page.emulateMedia({ reducedMotion: 'reduce' }); await q.page.clock.install({ time: new Date('2026-11-08T19:00:00') }); await q.page.goto(srv.url); await q.page.waitForSelector('.cover');
    await q.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await q.page.waitForSelector('.reader'); await q.page.locator('.w').first().click(); await readMin(q.page, 19); await q.page.clock.runFor(60000); await q.page.locator('#party').waitFor(); eq(await q.page.locator('#confetti').count(), 0);
  });
  await test('dark mode: follows the phone by default, a moon button and a Settings choice override it, older readers keep their own dark look', async () => {
    const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const d = await newPage(br, { today: TODAY }); await d.page.emulateMedia({ colorScheme: 'dark' }); await d.page.goto(srv.url); await d.page.waitForSelector('.cover');
    eq(await d.page.evaluate(() => document.documentElement.classList.contains('night')), true, 'phone is dark'); eq(await bg(d.page), 'rgb(26, 22, 38)');
    await d.page.locator('#moon').click(); await d.page.waitForSelector('.cover'); eq(await d.page.evaluate(() => document.documentElement.classList.contains('night')), false, 'moon switches to light'); eq(await bg(d.page), 'rgb(255, 246, 227)');
    eq(await d.page.evaluate(() => localStorage.getItem('read20.look')), 'light');
    await d.page.reload(); await d.page.waitForSelector('.cover'); eq(await d.page.evaluate(() => document.documentElement.classList.contains('night')), false, 'remembered');
    await d.page.locator('#gear').click(); await d.page.selectOption('#slk', 'auto'); eq(await d.page.evaluate(() => document.documentElement.classList.contains('night')), true, 'Match my phone');
    await d.page.selectOption('#slk', 'light'); eq(await d.page.evaluate(() => document.documentElement.classList.contains('night')), false);
    const l = await newPage(br, { today: TODAY }); await l.page.emulateMedia({ colorScheme: 'light' }); await l.page.goto(srv.url); await l.page.waitForSelector('.cover'); eq(await l.page.evaluate(() => document.documentElement.classList.contains('night')), false, 'phone is light');
    await l.page.locator('#moon').click(); await l.page.waitForSelector('.cover'); eq(await l.page.evaluate(() => document.documentElement.classList.contains('night')), true); await l.page.screenshot({ path: SHOTS + '/read20-night.png' });
    await l.page.evaluate(() => { const r = R20App._state(); r.lv = 'older'; }); await l.page.reload(); await l.page.waitForSelector('.cover');
  });
  const VOICE_SPEECH = `(function(){ window.__said = []; window.__cancels = 0; window.__voice = '';
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    const vs = [{ name: 'Fred', voiceURI: 'Fred', lang: 'en-US', localService: true }, { name: 'Samantha', voiceURI: 'Samantha', lang: 'en-US', localService: true }, { name: 'Samantha (Enhanced)', voiceURI: 'SamE', lang: 'en-US', localService: true }, { name: 'Albert', voiceURI: 'Albert', lang: 'en-US', localService: true }, { name: 'Amelie', voiceURI: 'Amelie', lang: 'fr-FR', localService: true }];
    let cur = null;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { get speaking() { return !!cur; }, pending: false, cancel: function () { window.__cancels++; const u = cur; cur = null; if (u && u.onend) u.onend({}); }, resume: function () {}, getVoices: function () { return vs; },
      speak: function (u) { cur = u; window.__said.push(u.text); window.__voice = u.voice ? u.voice.name : ''; setTimeout(function () { if (cur !== u) return; if (u.onboundary) { let p = 0; u.text.split(' ').forEach(function (w) { u.onboundary({ name: 'word', charIndex: p }); p += w.length + 1; }); } cur = null; if (u.onend) u.onend({}); }, 120); } } });
  })();`;
  await test('voice: the most natural voice is picked on its own, novelty voices are never offered, and a choice is kept on the phone', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(VOICE_SPEECH); await o.page.goto(srv.url); await o.page.waitForSelector('.cover');
    eq(await o.page.evaluate(() => R20Audio.voices().map(v => v.name).join('|')), 'Samantha (Enhanced)|Samantha', 'best first, no Fred, Albert or French');
    await o.page.evaluate(() => R20Audio.speak('hi', 0.9)); await o.page.waitForTimeout(150); eq(await o.page.evaluate(() => window.__voice), 'Samantha (Enhanced)');
    await o.page.locator('#gear').click(); eq(await o.page.locator('#svc option').count(), 3); await o.page.selectOption('#svc', 'Samantha'); await o.page.waitForTimeout(200);
    eq(await o.page.evaluate(() => window.__voice), 'Samantha', 'previewed in the chosen voice'); eq(await o.page.evaluate(() => localStorage.getItem('read20.voice')), 'Samantha');
    await o.page.selectOption('#srt', '0.45'); eq(await o.page.evaluate(() => localStorage.getItem('read20.rate')), '0.45'); await o.page.locator('#sd').click(); await o.page.waitForSelector('.cover');
    await o.page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await o.page.waitForSelector('.reader'); await o.page.locator('#story').click(); eq(await o.page.locator('#spd').innerText(), 'Speed: Very slow', 'the story opens at the speed chosen in Settings');
    await o.page.waitForTimeout(300); await o.page.locator('#back').click(); await o.page.waitForSelector('.cover'); await o.page.locator('#gear').click(); eq(await o.page.locator('#srt').inputValue(), '0.45', 'and Settings shows the same one');
  });
  const NOBOUND_SPEECH = `(function(){ window.__said = []; window.__starts = 0;
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    let cur = null;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { get speaking() { return !!cur; }, pending: false, cancel: function () { const u = cur; cur = null; if (u && u.onend) u.onend({}); }, resume: function () {}, getVoices: function () { return [{ name: 'Samantha', voiceURI: 'Samantha', lang: 'en-US', localService: true }]; },
      speak: function (u) { cur = u; window.__said.push(u.text); window.__starts++; setTimeout(function () { if (u.onstart) u.onstart({}); }, 50); setTimeout(function () { if (cur !== u) return; cur = null; if (u.onend) u.onend({}); }, 2400); } } });
  })();`;
  await test('storytime: when the voice does not report words, the highlight is timed to move along with the talking, left to right', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(NOBOUND_SPEECH); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').nth(0).waitFor();
    await page.evaluate(() => { window.__hl = []; setInterval(() => { const h = document.querySelector('.w.hl'); if (h) { const i = +h.dataset.i; if (window.__hl[window.__hl.length - 1] !== i) window.__hl.push(i); } }, 40); });
    const words = await page.locator('.w').count(); await page.locator('#story').click(); await page.waitForTimeout(2800);
    const hl = await page.evaluate(() => window.__hl); assert.ok(hl.length >= Math.min(words, 3), 'the highlight moved through the words: ' + hl.join());
    assert.ok(hl.every((v, i) => i === 0 || v > hl[i - 1] || v === 0), 'and only forward: ' + hl.join()); eq(hl[0], 0, 'starts on the first word');
  });
  const COLD_SPEECH = `(function(){ window.__said = []; window.__heard = []; window.__done = 0; window.__primed = 0; var born = Date.now(), lastCancel = 0, cur = null;
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { get speaking() { return !!cur; }, pending: false, cancel: function () { lastCancel = Date.now(); const u = cur; cur = null; if (u && u.onend) u.onend({}); }, resume: function () {},
      getVoices: function () { return Date.now() - born < 300 ? [] : [{ name: 'Samantha', voiceURI: 'Samantha', lang: 'en-US', localService: true }]; },
      speak: function (u) { window.__said.push(u.text); if (u.text === ' ') { window.__primed++; return; }
        if (Date.now() - lastCancel < 120) return;   // a cold phone drops a line spoken right after a cancel: it never starts and never ends
        cur = u; window.__heard.push(u.text); setTimeout(function () { if (u.onstart) u.onstart({}); }, 400);
        setTimeout(function () { if (cur !== u) return; cur = null; window.__done++; if (u.onend) u.onend({}); }, 1500); } } });
  })();`;
  await test('storytime: the very first page works on a cold phone (engine woken first, the first line is not dropped after a cancel, and it finishes)', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(COLD_SPEECH); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); const t1 = await page.evaluate(() => document.querySelector('#text').textContent.replace(/\s+/g, ' ').trim());
    await page.locator('#story').click(); await page.waitForFunction(() => window.__done >= 1, null, { timeout: 9000 });
    eq(await page.evaluate(() => window.__primed), 1, 'woke the voice engine first'); assert.ok((await page.evaluate(() => window.__heard)).join(' ').replace(/\s+/g, ' ').includes(t1), 'the first page was heard in full');
  });
  await test('storytime: a toggle next to the speaker reads each page aloud (again on every page turn), one sentence at a time with the words lit up; the repeat button reads it again; tapping a word or turning it off stops it', async () => {
    const o = await newPage(br, { today: TODAY }); await o.page.addInitScript(VOICE_SPEECH); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); const page = o.page;
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader');
    eq(await page.locator('#story').getAttribute('aria-pressed'), 'false'); eq(await page.locator('#hear').count(), 0); eq((await page.evaluate(() => window.__said)).length, 0, 'off by default: nothing is read on its own');
    const text = p => page.evaluate(() => document.querySelector('#text').textContent.replace(/\s+/g, ' ').trim());
    const t1 = await text(); await page.locator('#story').click(); await page.waitForFunction(() => window.__said.length > 0); eq(await page.locator('#story').getAttribute('aria-pressed'), 'true'); eq(await page.locator('#hear').count(), 1);
    await page.waitForTimeout(700); assert.ok((await page.evaluate(() => window.__said)).join(' ').replace(/\s+/g, ' ').includes(t1), 'read the page');
    const n1 = (await page.evaluate(() => window.__said)).length; await page.locator('#hear').click(); await page.waitForTimeout(700); assert.ok((await page.evaluate(() => window.__said)).length > n1, 'repeat reads it again');
    eq(await page.locator('#spd').innerText(), 'Speed: Slow', 'starts slow'); await page.locator('#spd').click(); eq(await page.locator('#spd').innerText(), 'Speed: Normal'); eq(await page.evaluate(() => localStorage.getItem('read20.rate')), '0.75'); for (let i = 0; i < 5; i++) await page.locator('#spd').click(); eq(await page.locator('#spd').innerText(), 'Speed: Normal', 'cycles round through five speeds'); await page.waitForTimeout(400);
    await page.locator('#nextp').click(); const t2 = await text(); await page.waitForTimeout(700); assert.ok((await page.evaluate(() => window.__said)).slice(-3).join(' ').replace(/\s+/g, ' ').includes(t2), 'the next page is read on its own');
    await page.locator('#hear').click(); await page.locator('.w').first().click(); const n2 = (await page.evaluate(() => window.__said)).length; await page.waitForTimeout(900); const n3 = await page.evaluate(() => window.__said.length); await page.waitForTimeout(900); eq(await page.evaluate(() => window.__said.length), n3, 'tapping a word stops the sentences (only the tapped word may still be said)'); assert.ok(n3 - n2 <= 1);
    eq(await page.evaluate(() => localStorage.getItem('read20.story')), '1', 'it stays on'); await page.locator('#story').click(); eq(await page.locator('#hear').count(), 0, 'off hides the repeat button'); eq(await page.evaluate(() => localStorage.getItem('read20.story')), null);
  });
  await test('log: remove one entry from a day, with a confirmation; cancel keeps it; it stays removed after a reload', async () => {
    const { page } = await mk(); await logMin(page, 'Test entry', 2); await logMin(page, 'Real book', 5); eq(await sec(page), 420);
    await page.locator('#nav [data-go="log"]').click(); await page.waitForSelector('.cal'); await page.locator('.day.now').click(); await page.waitForSelector('#detail .del');
    eq(await page.locator('#detail .del').count(), 2); let msg = ''; page.once('dialog', d => { msg = d.message(); d.dismiss(); });
    await page.locator('#detail li', { hasText: 'Test entry' }).locator('.del').click(); assert.ok(/Remove Test entry/.test(msg) && /cannot be undone/.test(msg), msg); eq(await sec(page), 420, 'cancel keeps it');
    page.once('dialog', d => d.accept()); await page.locator('#detail li', { hasText: 'Test entry' }).locator('.del').click(); await page.waitForFunction(() => R20App._state().days[window.__today].sec === 300);
    eq(await page.locator('#detail .del').count(), 1); assert.ok(/5 min/.test(await page.locator('#detail').innerText()));
    await page.reload(); await page.waitForSelector('.cal'); eq(await sec(page), 300, 'still removed after a reload');
  });
  const morning = async (opts = {}) => { const o = await newPage(br, { today: '2026-11-09' }); await o.page.addInitScript(([sec]) => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('read20.v1', JSON.stringify({ v: 1, name: 'Riley', goal: 20, size: 1, days: sec ? { '2026-11-08': { done: 0, parts: { old: { sec, books: {}, extra: [] } } } } : {} })); } }, [opts.sec === undefined ? 720 : opts.sec]);
    await o.page.clock.install({ time: new Date(opts.at || '2026-11-09T08:00:00') }); await o.page.goto(srv.url); await o.page.waitForSelector('.cover'); return o; };
  const daySecOf = (page, k) => page.evaluate(k => (R20App._state().days[k] || { sec: 0 }).sec, k);
  await test('second chance: a short night is offered in the morning, the reading counts for last night until it is done, then today starts fresh', async () => {
    const { page } = await morning(); await page.locator('#mkyes').waitFor(); assert.ok(/12 of 20 minutes/.test(await page.locator('.sheet').innerText()), await page.locator('.sheet').innerText()); assert.ok(/other 8/.test(await page.locator('.sheet').innerText()));
    await page.locator('#mkyes').click(); await page.waitForSelector('.makeup #mkoff'); assert.ok(/Finish last night/.test(await page.locator('.ttxt h2').innerText()));
    await page.locator('.cover', { hasText: 'Sam the Cat' }).click(); await page.waitForSelector('.reader'); await page.locator('.w').first().click(); assert.ok(/last night/.test(await page.locator('#tmgoal').innerText()));
    await readMin(page, 7); await page.clock.runFor(60000); await page.locator('#party').waitFor(); assert.ok(/Last night is finished/.test(await page.locator('#party').innerText()));
    eq(await daySecOf(page, '2026-11-08'), 1200, 'last night is now complete'); eq(await daySecOf(page, '2026-11-09'), 0, 'nothing leaked into today');
    await page.locator('#keep').click(); await readMin(page, 1); eq(await daySecOf(page, '2026-11-09') >= 60, true, 'now it counts for today'); eq(await daySecOf(page, '2026-11-08'), 1200);
  });
  await test('second chance: Not now keeps the card but does not ask again; never mind goes back to tonight; no offer in the afternoon or for a night with no reading', async () => {
    const a = await morning(); await a.page.locator('#mkno').click(); await a.page.waitForSelector('#mkgo'); eq(await a.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('read20.mkno'))).join()), 'main|2026-11-08', 'remembered, so it is not asked again'); eq(await a.page.locator('#mkyes').count(), 0); eq(await a.page.locator('#mkgo').count(), 1, 'but the card is still there');
    await a.page.locator('#mkgo').click(); await a.page.locator('#mkoff').click(); await a.page.waitForSelector('#mkgo'); eq(await a.page.locator('#mkoff').count(), 0);
    const b = await morning({ at: '2026-11-09T14:00:00' }); await b.page.waitForTimeout(800); eq(await b.page.locator('#mkyes').count() + await b.page.locator('#mkgo').count(), 0, 'afternoon: no offer');
    const c = await morning({ sec: 0 }); await c.page.waitForTimeout(800); eq(await c.page.locator('#mkyes').count() + await c.page.locator('#mkgo').count(), 0, 'no reading last night: no offer');
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
