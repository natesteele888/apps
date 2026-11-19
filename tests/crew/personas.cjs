// The virtual test team: about 100 made-up people (personas.json) each use the apps they'd really open,
// in their own way (tapping everything, double-tapping, no signal, big text, coming back the next day ...),
// inside the no-browser sandbox (sandbox.cjs). Each one writes down what broke and what they thought:
// what made sense, what was confusing, what should change, what was good.
// Safe by design: nothing leaves this machine, Firebase is an in-memory stand-in (writes are counted,
// never sent), storage is fresh, and every typed value is made up ("Crew test").
// Usage: node tests/crew/personas.cjs <serveRoot> <outDir>      (needs jsdom: npm i jsdom@25)
//   CREW_APPS=regex   only apps whose name matches      CREW_PERSONAS=regex   only personas whose id/label matches
//   CREW_WORKERS=n    run in n processes (default 4)    OLDPHONE=<path to oldphone.cjs JSON output>  optional
const fs = require('fs'), path = require('path'), { fork } = require('child_process');
const { startServer, openPage, shown, label, sleep } = require('./sandbox.cjs');
const { pages } = require('./pages.cjs');
const ROOT = path.resolve(process.argv[2] || '.'); const OUT = path.resolve(process.argv[3] || 'crew-out');

const NICE = { 'baseball-field': 'Coaching Tools', 'cube-clock/public': 'Cube Clock', events: 'Steele Events', 'fitness-hub': 'Offseason Power Program', 'lybs-ballclub': 'LYBS Ballclub',
  'lybs-cards': 'Steele Cards (old link)', 'lybs-cards/card-kit': 'Steele Cards kit', planner: 'Christmas Planner', portfolio: 'Portfolio', 'sponsor-banner-inventory': 'Sponsor Banners',
  'asl-bengals/gridiron-hub': 'Gridiron Hub', apps: 'Steele apps home' };
const EXTRA = [['Steele Cards pack', 'lybs-cards/pack.html'], ['Fishing log', 'Fishing-Club/fishing-log-5.html']];
function appList() {
  const list = pages(ROOT, { skipRepos: ['lybs-reporting'] }).map(([n, p]) => [NICE[n] || n, p]);
  for (const e of EXTRA) if (fs.existsSync(path.join(ROOT, e[1]))) list.push(e);
  return list;
}
// Buttons nobody in the crew presses: anything that would wipe, send, pay, sign in or leave.
const SKIP = /delete|remove|erase|wipe|reset|clear all|start over|sign ?in|sign ?up|sign ?out|log ?in|log ?out|create (an )?account|google|forgot|pay|buy|donate|checkout|send|e-?mail|text me|share|install|leave|quit|end (game|round|tournament)|unlink|forget|report|publish|submit|approve|invite/i;
const PRIMARY = /\b(start|new|play|game|join|go|begin|open|add|create|score|next|continue|let'?s|try|demo|sample)\b/i;
const HELP = /help|how (it|to|does)|guide|tutorial|walkthrough|start here|what'?s this|\?$|tips|faq|learn/i;
const DEMO = /demo|sample|example|try it|practice mode|made-up/i;

function controls(w, d) { return [...d.querySelectorAll('button, [role=button], a[href], input:not([type=hidden]), select, textarea, summary')].filter(e => shown(w, e) && !e.disabled); }
function buttons(w, d) { return controls(w, d).filter(e => /^(BUTTON|SUMMARY)$/.test(e.tagName) || e.getAttribute('role') === 'button' || (e.tagName === 'A' && /^#|^javascript:/i.test(e.getAttribute('href') || ''))); }
const pxOf = v => { const m = String(v || '').match(/^([\d.]+)(px|rem|em)$/); return m ? +m[1] * (m[2] === 'px' ? 1 : 16) : NaN; };

// Facts about a page that every persona then weighs in their own way. Read once per app, fresh, on a newer phone.
async function facts(server, rel) {
  const p = await openPage(server, rel, { width: 360 });
  const w = p.window, d = p.document;
  const btns = buttons(w, d), all = controls(w, d);
  const labels = btns.map(label);
  const inputs = all.filter(e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/^(button|submit|checkbox|radio|range|color|file)$/.test(e.type));
  const unlabeled = inputs.filter(e => !(e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.title || (e.id && d.querySelector(`label[for="${e.id}"]`)) || e.closest('label')));
  const vp = (d.querySelector('meta[name=viewport]') || { content: '' }).content || '';
  const tiny = new Set(); for (const e of d.querySelectorAll('body *')) { if (tiny.size > 30) break; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2) || !shown(w, e)) continue; const fsz = pxOf(w.getComputedStyle(e).fontSize); if (fsz && fsz < 12) tiny.add(`"${e.textContent.trim().slice(0, 24)}" ${Math.round(fsz * 10) / 10}px`); }
  const text = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ').trim();
  const signInBtns = labels.filter(l => /sign ?in|log ?in|continue with google|create (an )?account|sign ?up/i.test(l));
  const other = labels.filter(l => !/sign ?in|log ?in|google|create (an )?account|sign ?up|forgot|something wrong|report/i.test(l));
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const srcs = [...d.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(s => !/^https?:/.test(s));
  const jsText = srcs.map(s => { try { return fs.readFileSync(path.join(ROOT, path.dirname(rel), s.split('?')[0]), 'utf8'); } catch (e) { return ''; } }).join('\n');
  const f = {
    title: d.title, loadErrors: [...p.log.errors], skipped: p.log.skipped, bytes: p.log.bytes, requests: p.log.requests, external: [...p.log.blocked],
    buttons: btns.length, controls: all.length, labels: labels.slice(0, 40), unnamed: btns.filter(e => !label(e) && !e.querySelector('img[alt],svg title')).length,
    unlabeledInputs: unlabeled.length, inputs: inputs.length, imgsNoAlt: [...d.querySelectorAll('img')].filter(i => shown(w, i) && !i.hasAttribute('alt')).length,
    lang: !!d.documentElement.getAttribute('lang'), h1: !!d.querySelector('h1'), zoomLocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0+)?\b/i.test(vp),
    tiny: [...tiny].slice(0, 6), tinyCount: tiny.size, words: text.split(' ').length, emptyish: text.length < 40,
    help: labels.some(l => HELP.test(l)) || [...d.querySelectorAll('a')].some(a => HELP.test(label(a))), demo: labels.some(l => DEMO.test(l)),
    primary: labels.find(l => PRIMARY.test(l)) || null, signInWall: signInBtns.length > 0 && other.length <= 2,
    jargon: labels.filter(l => /^[A-Z0-9]{2,5}$/.test(l) && !/^(OK|GO|ON|OFF|AM|PM|TV|NEW|ADD)$/.test(l)).slice(0, 6),
    longLabels: labels.filter(l => l.split(' ').length > 7).slice(0, 4), iconOnly: labels.filter(l => l && !/[a-z]{2}/i.test(l)).length,
    sw: /serviceWorker\.register/.test(html + jsText), manifest: !!d.querySelector('link[rel=manifest]'),
    offlineNote: /offline|no signal|no connection|no internet|saved on this (phone|device)/i.test(html + jsText),
    backup: labels.some(l => /export|backup|back up|download|save a copy|csv/i.test(l)) || /export|backup/i.test(jsText.slice(0, 200000)) ,
  };
  // Rough time to first use on one bar of signal (~400 kbps, 400 ms round trips, 6 at a time).
  f.slowSecs = Math.round((Math.ceil(f.requests / 6) * 0.4 + f.bytes / 50000) * 10) / 10;
  p.close();
  return f;
}

// One tap, the way a phone sends it. Then: did anything happen?
async function tap(p, el) {
  const w = p.window, d = p.document;
  let changed = 0; const mo = new w.MutationObserver(m => { changed += m.length; }); mo.observe(d, { subtree: true, childList: true, attributes: true, characterData: true });
  const vals = () => [...d.querySelectorAll('input, select, textarea')].map(e => e.value + (e.checked ? '+' : '')).join('|');
  const before = { vals: vals(), href: w.location.href, ls: JSON.stringify(Object.assign({}, w.localStorage)), acted: p.log.acted, opened: p.log.opened.length, errs: p.log.errors.length };
  p.log.acted = false;
  try { for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true })); el.click(); } catch (e) { p.log.errors.push('crash: ' + String(e.message).split('\n')[0].slice(0, 180)); }
  await sleep(70); mo.disconnect();
  const did = changed > 0 || p.log.acted || w.location.href !== before.href || JSON.stringify(Object.assign({}, w.localStorage)) !== before.ls || p.log.opened.length > before.opened || vals() !== before.vals;
  return { did, newErrors: p.log.errors.slice(before.errs) };
}

// The journeys. Each style uses the page differently and records taps that did nothing and anything that broke.
async function journey(server, persona, app, rel) {
  const base = { width: persona.width, userAgent: persona.userAgent, offline: persona.offline };
  const rec = { persona: persona.id, app, dead: [], broke: [], taps: 0, typed: 0, writes: 0, lostWork: false, reopenErrors: [], firstScreen: 0 };
  let p = await openPage(server, rel, base);
  // A page whose own module script couldn't run in the sandbox gets no "nothing happened" notes: its buttons were never wired up here.
  const skippedPage = p.log.skipped.some(x => /module script (app|with imports|[^(]*\.m?js)/.test(x)) && !p.log.skipped.some(x => /pointed at the stand-in/.test(x));
  rec.loadErrors = [...p.log.errors]; rec.firstScreen = buttons(p.window, p.document).length;
  rec.bodyText = (p.document.body ? p.document.body.textContent : '').replace(/\s+/g, ' ').trim().length;
  const tapped = new Set(); const t0 = Date.now();
  const doTap = async (el, why) => {
    const l = label(el) || el.className || el.tagName; rec.taps++;
    const r = await tap(p, el);
    const fileBtn = (el.getAttribute('for') && /file/.test((p.document.getElementById(el.getAttribute('for')) || {}).type || '')) || el.querySelector('input[type=file]');
    if (!r.did && !fileBtn && el.tagName !== 'A' && !el.closest('label') && !skippedPage) rec.dead.push(l);
    for (const e of r.newErrors) rec.broke.push(`${why || 'tapping'} "${l}": ${e}`);
  };
  // A tab that's already on does nothing when tapped again, and that's fine: skip those, like the browser testers do.
  const isOn = e => e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || !!e.getAttribute('aria-current') || /(^|\s)(active|on|sel|selected|current)(\s|$)/.test(e.className || '');
  const pick = (filter) => buttons(p.window, p.document).filter(e => !SKIP.test(label(e)) && !isOn(e) && !tapped.has(label(e) + '|' + e.tagName) && (!filter || filter(e)));
  const fill = () => { for (const e of controls(p.window, p.document)) {
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || /^(password|email|tel|file|hidden|submit|button)$/.test(e.type) || /e-?mail|phone|password/i.test(e.name + e.id + (e.getAttribute('placeholder') || ''))) continue;
    if (e.tagName === 'SELECT') { if (e.options.length > 1) e.selectedIndex = 1; } else if (e.type === 'checkbox' || e.type === 'radio') { e.checked = true; } else if (e.type === 'number' || e.type === 'range') { e.value = '7'; } else if (/date|time/.test(e.type)) { continue; } else { e.value = 'Crew test'; }
    rec.typed++; for (const t of ['input', 'change']) e.dispatchEvent(new p.window.Event(t, { bubbles: true }));
  } };
  const budget = () => rec.taps < 28 && Date.now() - t0 < 9000;
  const st = persona.style;
  if (st === 'tapper' || st === 'bigtext' || st === 'screenreader' || st === 'reader' || st === 'slow3g' || st === 'offline') {
    const cap = st === 'tapper' ? 28 : st === 'reader' ? 10 : 6;
    let list = pick(); if (st === 'reader') list.sort((a, b) => (HELP.test(label(b)) || DEMO.test(label(b))) - (HELP.test(label(a)) || DEMO.test(label(a))));
    while (list.length && rec.taps < cap && budget()) { const el = list[0]; tapped.add(label(el) + '|' + el.tagName); await doTap(el); list = pick(); if (st === 'reader') list = list.filter(e => !/^(✕|×|x|close|back)$/i.test(label(e))); }
  } else if (st === 'speedrun' || st === 'onehand') {
    for (let depth = 0; depth < 6 && budget(); depth++) {
      let list = pick(); if (st === 'onehand') list = list.reverse();
      const el = list.find(e => PRIMARY.test(label(e))) || list[0]; if (!el) break; tapped.add(label(el) + '|' + el.tagName);
      await doTap(el, 'tapping'); if (st === 'speedrun' && el.isConnected && shown(p.window, el)) await doTap(el, 'double-tapping');
    }
  } else if (st === 'fatfinger') {
    for (let i = 0; i < 8 && budget(); i++) {
      const list = pick(); if (list.length < 2) break; const meant = list[Math.min(i, list.length - 2)], hit = list[Math.min(i, list.length - 2) + 1];
      tapped.add(label(meant) + '|' + meant.tagName); tapped.add(label(hit) + '|' + hit.tagName);
      await doTap(hit, 'missing and hitting'); if (meant.isConnected && shown(p.window, meant)) { await doTap(meant, 'tapping'); }
    }
  } else if (st === 'typer' || st === 'impatient' || st === 'returner') {
    for (let round = 0; round < (st === 'typer' ? 4 : 2) && budget(); round++) {
      fill();
      const list = pick(); const el = list.find(e => /save|add|done|next|create|start|ok|keep|set|apply|go/i.test(label(e))) || list.find(e => PRIMARY.test(label(e))) || list[0];
      if (!el) break; tapped.add(label(el) + '|' + el.tagName); await doTap(el, 'saving with');
    }
    if (st !== 'typer') {
      const typedShows = (p.document.body ? p.document.body.textContent : '').includes('Crew test');
      const storage = Object.assign({}, p.window.localStorage);
      p.close();
      p = await openPage(server, rel, { ...base, storage });
      rec.reopenErrors = p.log.errors.map(e => (st === 'returner' ? 'coming back the next day: ' : 'reloading halfway: ') + e);
      const kept = JSON.stringify(storage).includes('Crew test') || (p.document.body ? p.document.body.textContent : '').includes('Crew test');
      rec.lostWork = typedShows && !kept;
    }
  }
  rec.writes = p.log.writes.length; rec.alerts = p.log.alerts.slice(0, 3); rec.signins = p.log.signins;
  rec.dead = [...new Set(rec.dead)].slice(0, 8);
  p.close();
  return rec;
}

// What each persona thinks, from what the page is and what happened to them. Plain words, their angle.
function feedback(persona, f, r, old) {
  const g = [], s = [], c = [], ch = []; // good, makes sense, confusing, change
  const first = persona.skill === 'first' || persona.skill === 'grand', kid = persona.skill === 'kid', st = persona.style;
  if (r.broke.length) ch.push(`Fix the break: ${r.broke[0].replace(/^(tapping|double-tapping|missing and hitting|saving with) /, 'it broke when I tapped ')}`);
  if (r.loadErrors.length) ch.push(`It showed an error as soon as it opened (${r.loadErrors[0].slice(0, 90)})`);
  for (const e of r.reopenErrors.slice(0, 1)) ch.push(`It broke ${e.slice(0, 120)}`);
  if (r.lostWork) c.push('What I typed was gone when I came back');
  else if ((st === 'impatient' || st === 'returner') && r.typed) g.push('My stuff was still there when I came back');
  if (r.dead.length >= 2) c.push(`Tapped ${r.dead.slice(0, 3).map(x => `"${x}"`).join(', ')} and nothing happened`);
  if (f.signInWall && (persona.usage === 'oneoff' || persona.usage === 'spectator' || first)) c.push('It asked me to sign in before it showed me anything');
  if (f.buttons > 14 && (first || kid)) c.push(`${f.buttons} things to tap on the first screen; I didn't know where to start`);
  else if (f.buttons && f.buttons <= 6 && f.primary) s.push(`Clear first step ("${f.primary}")`);
  if (first && f.demo) g.push('The sample/demo let me see how it works before setting anything up');
  if (first && !f.help && !f.demo && f.buttons > 6) ch.push('Add a one-line "start here" or a sample for first-timers');
  if (persona.usage === 'gameday' && f.primary && /start|game|score|new|play/i.test(f.primary)) g.push(`Got to game mode fast ("${f.primary}")`);
  if ((st === 'bigtext' || persona.skill === 'grand') && f.zoomLocked) ch.push("Let me pinch to zoom; the page blocks it");
  if ((st === 'bigtext' || persona.skill === 'grand') && f.tinyCount > 3) ch.push(`Some text is too small to read (${f.tiny[0]})`);
  if (st === 'screenreader') { if (f.unnamed) c.push(`${f.unnamed} buttons read out as just "button"`); else g.push('Every button read out with a name'); if (f.unlabeledInputs) c.push(`${f.unlabeledInputs} boxes to fill in have no name read out`); if (!f.lang) ch.push('Set the page language so read-aloud uses the right voice'); }
  if (kid && f.longLabels.length) c.push(`Long button words (${f.longLabels[0]})`);
  if (kid && f.iconOnly >= 3) s.push('Big picture buttons were easy');
  if ((first || kid) && f.jargon.length) c.push(`Didn't know what ${f.jargon.slice(0, 3).join(', ')} meant`);
  if (st === 'slow3g') { if (f.slowSecs > 6) ch.push(`Took about ${Math.round(f.slowSecs)}s to load on one bar (${Math.round(f.bytes / 1024)} KB)`); else g.push(`Loaded quickly even on one bar (about ${f.slowSecs}s)`); }
  if (st === 'offline') {
    if (r.loadErrors.length || r.bodyText < 40) c.push('Blank or broken with no signal at the field');
    else if (f.sw) g.push('Worked with no signal (it saves itself on the phone)'); else ch.push("Make it work with no signal: it doesn't keep a copy on the phone");
    if (f.external.length >= 3) ch.push(`Needs ${f.external.length} outside sites to fully load (${f.external.slice(0, 3).join(', ')})`);
  }
  if (persona.oldTier && old) {
    const hits = persona.oldTier === 'B' ? [...old.B, ...old.A] : old.A;
    if (hits.length) c.push(`May not work on my older phone (${String(hits[0]).replace(/^.*?: /, '').slice(0, 70)})`); else g.push('Worked on my older phone');
  }
  if (persona.usage === 'admin' && f.inputs > 2 && !f.backup) ch.push('Give me a way to export or back up what I enter');
  if (persona.usage === 'admin' && f.backup) g.push('There is an export/backup');
  if (r.writes && persona.usage !== 'admin' && first) s.push('It saved to the shared list (the sandbox only counted it)');
  if (f.manifest && persona.usage === 'gameday') g.push('Installs on the home screen like an app');
  if (!r.broke.length && !r.dead.length && !r.loadErrors.length && r.taps >= 3) g.push(`Everything I tapped worked (${r.taps} taps)`);
  return { good: g, makesSense: s, confusing: c, change: ch };
}

async function runSlice(personas, list, oldMap) {
  const server = await startServer(ROOT); const out = { facts: {}, journeys: [] };
  const byName = Object.fromEntries(list.map(([n, p]) => [n, p]));
  const factsFor = async (name) => (out.facts[name] = out.facts[name] || await facts(server, byName[name]));
  let done = 0;
  for (const persona of personas) for (const app of persona.apps) {
    if (++done % 20 === 0) process.stderr.write(`[${process.env.CREW_SLICE}] ${done} journeys\n`);
    if (!byName[app]) continue;
    try {
      const f = await factsFor(app); const r = await journey(server, persona, app, byName[app]);
      r.feedback = feedback(persona, f, r, oldMap[path.dirname(byName[app])]); delete r.bodyText; out.journeys.push(r);
    } catch (e) { out.journeys.push({ persona: persona.id, app, harnessError: String(e && e.message).slice(0, 200) }); }
  }
  server.server.close(); return out;
}

async function main() {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8')).personas;
  const AP = process.env.CREW_APPS ? new RegExp(process.env.CREW_APPS, 'i') : null, PP = process.env.CREW_PERSONAS ? new RegExp(process.env.CREW_PERSONAS, 'i') : null;
  const list = appList().filter(([n]) => !AP || AP.test(n));
  const personas = all.filter(p => !PP || PP.test(p.id + ' ' + p.label)).map(p => ({ ...p, apps: p.apps.filter(a => list.some(([n]) => n === a)) })).filter(p => p.apps.length);
  let oldMap = {}; try { oldMap = JSON.parse(fs.readFileSync(process.env.OLDPHONE, 'utf8')); } catch (e) {}
  if (process.env.CREW_SLICE) { // a worker
    const [i, n] = process.env.CREW_SLICE.split('/').map(Number);
    const res = await runSlice(personas.filter((_, k) => k % n === i), list, oldMap);
    fs.writeFileSync(path.join(OUT, `slice-${i}.json`), JSON.stringify(res)); process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const n = Math.max(1, +(process.env.CREW_WORKERS || 4)); const t0 = Date.now();
  console.log(`personas: ${personas.length}, apps: ${list.length}, journeys: ${personas.reduce((a, p) => a + p.apps.length, 0)}, workers: ${n}`);
  await Promise.all([...Array(n)].map((_, i) => new Promise(res => fork(__filename, process.argv.slice(2), { env: { ...process.env, CREW_SLICE: `${i}/${n}` } }).on('exit', res))));
  const merged = { ranAt: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), facts: {}, journeys: [] };
  for (let i = 0; i < n; i++) { try { const s = JSON.parse(fs.readFileSync(path.join(OUT, `slice-${i}.json`), 'utf8')); Object.assign(merged.facts, s.facts); merged.journeys.push(...s.journeys); fs.unlinkSync(path.join(OUT, `slice-${i}.json`)); } catch (e) { console.log('worker', i, 'gave no results'); } }
  fs.writeFileSync(path.join(OUT, 'personas-results.json'), JSON.stringify(merged, null, 1));
  fs.writeFileSync(path.join(OUT, 'personas-report.md'), report(merged, all));
  console.log(`done in ${merged.secs}s: ${merged.journeys.length} journeys, ${merged.journeys.filter(j => j.broke && j.broke.length).length} with a break`);
}

// Per app: the breaks first, then what people thought, each line with how many personas said it.
function report(m, all) {
  const byId = Object.fromEntries(all.map(p => [p.id, p])); const apps = {};
  for (const j of m.journeys) (apps[j.app] = apps[j.app] || []).push(j);
  const tally = (js, key) => { const t = {}; for (const j of js) for (const x of (j.feedback || {})[key] || []) { const k = x.replace(/\(\d+ taps\)/, '').trim(); (t[k] = t[k] || new Set()).add(j.persona); } return Object.entries(t).sort((a, b) => b[1].size - a[1].size); };
  const score = js => js.filter(j => j.broke && j.broke.length).length * 10 + js.filter(j => (j.loadErrors || []).length || (j.reopenErrors || []).length).length * 6 + js.reduce((a, j) => a + ((j.feedback || {}).confusing || []).length, 0);
  let md = `# Virtual test team: persona run\n\nRan ${m.ranAt.slice(0, 16).replace('T', ' ')} UTC, ${m.journeys.length} journeys by ${new Set(m.journeys.map(j => j.persona)).size} made-up personas across ${Object.keys(apps).length} apps, in ${m.secs}s.\nNo-browser sandbox: nothing left this machine, Firebase was a stand-in, every value typed was made up. Sizes and layout are not measured here (the browser testers do that).\nApps run with the most trouble first.\n`;
  for (const [app, js] of Object.entries(apps).sort((a, b) => score(b[1]) - score(a[1]))) {
    const f = m.facts[app] || {}; md += `\n## ${app}\n${js.length} personas · ${Math.round((f.bytes || 0) / 1024)} KB · about ${f.slowSecs}s on one bar${f.skipped && f.skipped.length ? ' · partly checked: ' + f.skipped.join(', ') : ''}\n`;
    const breaks = {}; for (const j of js) for (const b of [...(j.broke || []), ...(j.loadErrors || []).map(e => 'opening: ' + e), ...(j.reopenErrors || [])]) (breaks[b.replace(/"[^"]*"/, '"…"').slice(0, 160)] = breaks[b.replace(/"[^"]*"/, '"…"').slice(0, 160)] || []).push(j.persona + ': ' + b);
    const be = Object.entries(breaks).sort((a, b) => b[1].length - a[1].length);
    if (be.length) { md += `\n**Breaks**\n`; for (const [, v] of be.slice(0, 6)) md += `- ${v[0].replace(/^p\d+: /, '')} (${v.length} persona${v.length > 1 ? 's' : ''})\n`; }
    for (const [key, title] of [['change', 'Should change'], ['confusing', 'Confusing'], ['makesSense', 'Makes sense'], ['good', 'Good']]) {
      const t = tally(js, key); if (!t.length) continue; md += `\n**${title}**\n`;
      for (const [k, ids] of t.slice(0, 6)) { const who = [...ids].map(i => byId[i] ? byId[i].kind : i); md += `- ${k} (${ids.size}: ${[...new Set(who)].slice(0, 3).join('; ')}${new Set(who).size > 3 ? '…' : ''})\n`; }
    }
    if ((js.find(j => j.harnessError))) md += `\n_Some journeys couldn't run in the sandbox: ${js.find(j => j.harnessError).harnessError}_\n`;
  }
  return md;
}
main();
