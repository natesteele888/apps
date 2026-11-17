/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway core: the golf math with no screen in it, so it can be tested on its own (node tests/fairway.test.cjs).
   A tournament is one plain object (the same shape on the phone and in the shared database):
     { v, name, created, updated, rounds, cur, done, course, p }
     course: { name, tees: [{id, name, color}], holes: [{par, hcp, y: {teeId: yards}}] }
     p: { playerId: { n: name, tee: teeId, g: group number, st: start hole, at: joined time, s: { "round_hole": strokes } } }
   Scores sit under "round_hole" keys (both 1-based), so one phone can change one score without touching anyone else's. */
(function (root, factory) {
  const C = factory();
  if (typeof module === "object" && module.exports) module.exports = C; else root.FairwayCore = C;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = "Fairway v1";
  const MAX_PLAYERS = 120, MAX_ROUNDS = 4, MAX_TEES = 6, NAME_MAX = 30, EVENT_MAX = 60;
  const TEE_COLORS = { black: "#1b1b1b", blue: "#1f4fa8", white: "#f4f4ef", gold: "#c9a227", red: "#b3202a", green: "#1d6b3c", silver: "#a7adb4", orange: "#d86a1c" };

  /* ---------- the made-up sample course (no real course's card) ---------- */
  const SAMPLE_PARS = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
  const SAMPLE_BLUE = [402, 531, 377, 168, 415, 356, 189, 548, 431, 389, 152, 512, 441, 367, 201, 398, 557, 426];
  const SAMPLE_HCP = [7, 3, 11, 15, 1, 13, 17, 5, 9, 10, 18, 4, 2, 14, 12, 8, 6, 16];
  function sampleCourse() {
    const tees = [
      { id: "black", name: "Black", color: TEE_COLORS.black },
      { id: "blue", name: "Blue", color: TEE_COLORS.blue },
      { id: "white", name: "White", color: TEE_COLORS.white },
      { id: "red", name: "Red", color: TEE_COLORS.red }
    ];
    const holes = SAMPLE_PARS.map((par, i) => {
      const b = SAMPLE_BLUE[i], short = par === 3;
      return { par, hcp: SAMPLE_HCP[i], y: { black: b + (short ? 14 : 26), blue: b, white: b - (short ? 17 : 31), red: b - (short ? 38 : 79) } };
    });
    return { id: "sample-pines", name: "Sample Pines (made-up demo course)", tees, holes, sample: true };
  }

  /* ---------- ids ---------- */
  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  function rand(n, alphabet) {
    const a = new Uint8Array(n), out = [];
    (typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : require("crypto").webcrypto).getRandomValues(a);
    for (let i = 0; i < n; i++) out.push(alphabet[a[i] % alphabet.length]);
    return out.join("");
  }
  // A tournament's code: 20 characters, about 100 bits, so nobody finds one by guessing. It is the database document's id.
  const newCode = () => rand(20, B32);
  const isCode = c => typeof c === "string" && /^[a-z2-7]{20}$/.test(c);
  const newPid = () => rand(10, "abcdefghijklmnopqrstuvwxyz0123456789");
  const isPid = p => typeof p === "string" && /^[a-z0-9]{6,16}$/.test(p);

  /* ---------- cleaning what comes in (from a form, a link or the database) ---------- */
  const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  function cleanCourse(c) {
    c = c && typeof c === "object" ? c : {};
    const seen = {};
    let tees = (Array.isArray(c.tees) ? c.tees : []).slice(0, MAX_TEES).map((t, i) => {
      let id = clip(t && t.id, 16).toLowerCase().replace(/[^a-z0-9]/g, "") || "t" + (i + 1);
      while (seen[id]) id += "x";
      seen[id] = 1;
      const color = /^#[0-9a-f]{6}$/i.test(t && t.color) ? t.color.toLowerCase() : TEE_COLORS.white;
      return { id, name: clip(t && t.name, 16) || "Tee " + (i + 1), color };
    });
    if (!tees.length) tees = [{ id: "white", name: "White", color: TEE_COLORS.white }];
    const n = Array.isArray(c.holes) && c.holes.length >= 18 ? 18 : 9;
    const holes = [];
    for (let i = 0; i < n; i++) {
      const h = (Array.isArray(c.holes) && c.holes[i]) || {};
      const y = {};
      tees.forEach(t => { const v = int(h.y && h.y[t.id], 0, 800, 0); if (v) y[t.id] = v; });
      holes.push({ par: int(h.par, 3, 6, 4), hcp: int(h.hcp, 1, 18, i + 1), y });
    }
    const out = { name: clip(c.name, 60) || "My course", tees, holes };
    if (c.id) out.id = clip(c.id, 40);
    if (c.sample) out.sample = true;
    return out;
  }
  function cleanName(s) { return clip(s, NAME_MAX); }

  function newEvent(o) {
    o = o || {};
    const now = o.now || Date.now();
    const course = cleanCourse(o.course || sampleCourse());
    delete course.sample; // a tournament keeps its own copy of the course, the same shape the database checks
    return { v: 1, name: clip(o.name, EVENT_MAX) || "Golf day", created: now, updated: now, rounds: int(o.rounds, 1, MAX_ROUNDS, 1), cur: 1, done: false, course, p: {}, ctph: cleanCtpHoles(o.ctph, course.holes.length), ctp: {} };
  }
  function newPlayer(ev, o) {
    o = o || {};
    const tees = ev.course.tees;
    const tee = tees.some(t => t.id === o.tee) ? o.tee : (tees[Math.min(1, tees.length - 1)] || tees[0]).id;
    return { n: cleanName(o.name) || "Player", tee, g: int(o.group, 1, 60, 1), st: int(o.start, 1, ev.course.holes.length, 1), at: o.now || Date.now(), s: {} };
  }

  /* ---------- reading a tournament ---------- */
  const key = (r, h) => r + "_" + h;
  const holeCount = ev => ev.course.holes.length;
  const coursePar = course => course.holes.reduce((a, h) => a + h.par, 0);
  const players = ev => Object.keys(ev.p || {}).filter(isPid).map(id => Object.assign({ id }, ev.p[id]));
  function teeOf(ev, pl) { return ev.course.tees.find(t => t.id === pl.tee) || ev.course.tees[0]; }
  function yards(course, hole, teeId) { const h = course.holes[hole - 1]; return h && h.y ? h.y[teeId] || 0 : 0; }
  function teeYards(course, teeId) { return course.holes.reduce((a, h) => a + ((h.y && h.y[teeId]) || 0), 0); }
  // Holes in the order this player plays them: a shotgun start on 10 plays 10..18 then 1..9.
  function playOrder(n, start) { const s = Math.min(n, Math.max(1, start || 1)), o = []; for (let i = 0; i < n; i++) o.push(((s - 1 + i) % n) + 1); return o; }
  function strokes(pl, r, h) { const v = pl && pl.s ? pl.s[key(r, h)] : undefined; return Number.isInteger(v) && v >= 1 && v <= 20 ? v : null; }

  // One player's round: scores by hole, strokes, to par, how far through and the hole they're on.
  function round(ev, pl, r) {
    const n = holeCount(ev), order = playOrder(n, pl.st), sc = [];
    let tot = 0, par = 0, thru = 0;
    for (let h = 1; h <= n; h++) { const v = strokes(pl, r, h); sc.push(v); if (v != null) { tot += v; par += ev.course.holes[h - 1].par; thru++; } }
    const next = order.find(h => sc[h - 1] == null) || null;
    // the last hole they finished, in their own order (where the board's marker sits)
    let last = null; for (const h of order) if (sc[h - 1] != null) last = h;
    // to par after each hole, in play order (the classic board shows this number for every hole)
    const run = {}; let acc = 0;
    order.forEach(h => { const v = sc[h - 1]; if (v != null) { acc += v - ev.course.holes[h - 1].par; run[h] = acc; } });
    return { r, scores: sc, strokes: tot, par, toPar: tot - par, thru, done: thru === n, started: thru > 0, next, last, order, run, out: half(ev, sc, 0), inn: n === 18 ? half(ev, sc, 9) : null };
  }
  function half(ev, sc, from) { let t = 0, any = false; for (let i = from; i < from + 9 && i < sc.length; i++) if (sc[i] != null) { t += sc[i]; any = true; } return any ? t : null; }

  // Everyone, in place order. The overall to par adds up every hole played in every round.
  function standings(ev) {
    const rows = players(ev).map(pl => {
      const rs = []; let toPar = 0, total = 0, holes = 0;
      for (let r = 1; r <= ev.rounds; r++) { const x = round(ev, pl, r); rs.push(x); toPar += x.toPar; total += x.strokes; holes += x.thru; }
      const today = rs[Math.min(ev.cur, ev.rounds) - 1];
      return { id: pl.id, pl, name: pl.n, rounds: rs, toPar, total, holes, today };
    });
    rows.sort((a, b) => (a.holes ? 0 : 1) - (b.holes ? 0 : 1) || a.toPar - b.toPar || b.holes - a.holes || a.name.localeCompare(b.name));
    rows.forEach((row, i) => {
      if (!row.holes) { row.pos = "–"; row.rank = null; return; }
      const first = rows.findIndex(x => x.holes && x.toPar === row.toPar);
      const tied = rows.filter(x => x.holes && x.toPar === row.toPar).length > 1;
      row.rank = first + 1; row.pos = (tied ? "T" : "") + (first + 1);
    });
    return rows;
  }
  // Groups, each with who is in it and which hole they're on (the furthest-behind player's next hole).
  function groups(ev) {
    const m = {};
    players(ev).forEach(pl => { (m[pl.g] = m[pl.g] || []).push(pl); });
    return Object.keys(m).map(Number).sort((a, b) => a - b).map(g => {
      const list = m[g].sort((a, b) => a.at - b.at || a.n.localeCompare(b.n));
      const rs = list.map(pl => round(ev, pl, ev.cur));
      const thru = Math.min.apply(null, rs.map(x => x.thru));
      const open = rs.filter(x => !x.done);
      return { g, players: list, start: list[0].st, thru, done: !open.length, on: open.length ? (open.map(x => x.next).find(Boolean)) : null };
    });
  }

  /* ---------- words and colors for a number ---------- */
  // To par as the board shows it: E for even, -3 under, +2 over.
  const fmtPar = n => (n == null ? "" : n === 0 ? "E" : n < 0 ? String(n) : "+" + n);
  // Real tournament board colors: red under par, green over par, black at even.
  const tone = n => (n == null ? "" : n < 0 ? "under" : n > 0 ? "over" : "even");
  function scoreName(diff, st) {
    if (st === 1) return "Hole in one";
    if (diff <= -3) return "Albatross";
    return { "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Double bogey", "3": "Triple bogey" }[String(diff)] || "+" + diff;
  }
  // the scorecard mark: circles under par, squares over par
  function mark(diff) { return diff <= -2 ? "eagle" : diff === -1 ? "birdie" : diff === 0 ? "par" : diff === 1 ? "bogey" : "double"; }

  /* ---------- stats for the player card ---------- */
  function stats(ev, pl, onlyRound) {
    const o = { holes: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, aces: 0, byPar: { 3: [0, 0], 4: [0, 0], 5: [0, 0] }, best: null, streak: 0, bestStreak: 0 };
    for (let r = 1; r <= ev.rounds; r++) {
      if (onlyRound && r !== onlyRound) continue;
      const x = round(ev, pl, r);
      let run = 0;
      x.order.forEach(h => {
        const v = x.scores[h - 1]; if (v == null) return;
        const par = ev.course.holes[h - 1].par, d = v - par;
        o.holes++;
        if (v === 1) o.aces++;
        if (d <= -2) o.eagles++; else if (d === -1) o.birdies++; else if (d === 0) o.pars++; else if (d === 1) o.bogeys++; else o.doubles++;
        const bp = o.byPar[par] || (o.byPar[par] = [0, 0]); bp[0] += v; bp[1]++;
        if (d <= 0) { run++; o.bestStreak = Math.max(o.bestStreak, run); } else run = 0;
        if (!o.best || d < o.best.d) o.best = { d, h, r, v };
      });
      if (r === ev.cur) o.streak = run;
    }
    o.avg = {}; Object.keys(o.byPar).forEach(p => { const b = o.byPar[p]; if (b[1]) o.avg[p] = Math.round((b[0] / b[1]) * 100) / 100; });
    return o;
  }

  /* ---------- the demo: a made-up field halfway through ---------- */
  const DEMO_NAMES = ["Hank Rivers", "Jo Tamsin", "Cal Ortega", "Bea Lindqvist", "Moe Patel", "Dot Kessler", "Rory Vance", "Lou Marchetti", "Tess Albright", "Gus Okafor", "Wren Halloway", "Ike Moreno"];
  function seeded(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function demoEvent(now) {
    now = now || Date.now();
    const ev = newEvent({ name: "Saturday Club Classic (demo)", course: sampleCourse(), rounds: 2, now });
    ev.demo = true; ev.cur = 2;
    const rnd = seeded(7), skill = [-0.25, 0.05, 0.15, 0.3, 0.35, 0.5, 0.55, 0.7, 0.8, 0.95, 1.1, 1.25];
    const tees = ["black", "blue", "blue", "white", "blue", "white", "blue", "white", "red", "white", "blue", "red"];
    DEMO_NAMES.forEach((name, i) => {
      const pid = "demo" + String(i + 1).padStart(2, "0"), g = Math.floor(i / 4) + 1;
      const pl = newPlayer(ev, { name, tee: tees[i], group: g, start: g === 3 ? 10 : 1, now: now - (12 - i) * 1000 });
      const thru2 = [14, 14, 14, 14, 11, 11, 11, 11, 6, 6, 6, 6][i];
      for (let r = 1; r <= 2; r++) {
        const order = playOrder(18, r === 2 ? pl.st : 1), upto = r === 1 ? 18 : thru2;
        order.slice(0, upto).forEach(h => {
          const par = ev.course.holes[h - 1].par, x = rnd() * 0.85 + skill[i] * 0.22;
          const d = x < 0.05 ? -1 - (rnd() < 0.15 ? 1 : 0) : x < 0.24 ? -1 : x < 0.68 ? 0 : x < 0.92 ? 1 : 2;
          pl.s[key(r, h)] = Math.max(1, par + d);
        });
      }
      ev.p[pid] = pl;
    });
    ev.ctph = [7, 15];
    ev.ctp = { "1_7": { demo03: { d: 14.5, acc: 22, m: "gps", at: now - 9e6 }, demo01: { d: 21, acc: 0, m: "tape", at: now - 9.5e6 }, demo07: { d: 38.2, acc: 27, m: "gps", at: now - 8e6 } },
      "1_15": { demo05: { d: 9.3, acc: 0, m: "tape", at: now - 6e6 }, demo02: { d: 27.8, acc: 19, m: "gps", at: now - 6.2e6 } },
      "2_7": { demo02: { d: 31.5, acc: 24, m: "gps", at: now - 2e6 } } };
    return ev;
  }

  /* ---------- closest to the pin ---------- */
  // Holes the organizer marked, as hole numbers in order (at most every hole once).
  function cleanCtpHoles(list, n) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(h => { h = Math.round(Number(h)); if (h >= 1 && h <= n && out.indexOf(h) < 0) out.push(h); });
    return out.sort((a, b) => a - b).slice(0, 18);
  }
  // One measured ball: d feet from the pin, acc the GPS margin in feet (0 for a tape), m "gps" or "tape", ph a photo id.
  function cleanCtpEntry(e) {
    if (!e || typeof e !== "object") return null;
    const d = Number(e.d); if (!(d >= 0 && d <= 3000)) return null;
    const out = { d: Math.round(d * 10) / 10, m: e.m === "tape" ? "tape" : "gps", at: Number(e.at) || 0 };
    if (out.m === "gps") out.acc = Math.max(0, Math.min(1000, Math.round(Number(e.acc) || 0)));
    if (typeof e.ph === "string" && /^[a-z0-9]{6,16}$/.test(e.ph)) out.ph = e.ph;
    return out;
  }
  // Each marked hole for a round, with everyone measured there, nearest first.
  function ctpBoard(ev, r) {
    return (ev.ctph || []).map(h => {
      const box = (ev.ctp || {})[key(r, h)] || {};
      const list = Object.keys(box).filter(pid => ev.p[pid]).map(pid => Object.assign({ pid, name: ev.p[pid].n }, box[pid])).sort((a, b) => a.d - b.d || a.at - b.at);
      return { h, par: ev.course.holes[h - 1].par, list, best: list[0] || null };
    });
  }
  // Distance between two GPS points in metres (haversine), and a few readings averaged by how sure each one is.
  function metres(a, b) {
    const R = 6371008.8, rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function averageFix(readings) {
    // A phone never really knows its spot better than about 3 metres, whatever it reports (some report 0).
    const ok = (readings || []).filter(r => r && Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.acc >= 0 && r.acc < 100).map(r => ({ lat: r.lat, lon: r.lon, acc: Math.max(3, r.acc) }));
    if (!ok.length) return null;
    // the better half of the readings, each weighted by 1 / accuracy squared
    const best = ok.slice().sort((a, b) => a.acc - b.acc).slice(0, Math.max(1, Math.ceil(ok.length / 2)));
    let w = 0, lat = 0, lon = 0;
    best.forEach(r => { const k = 1 / (r.acc * r.acc); w += k; lat += r.lat * k; lon += r.lon * k; });
    return { lat: lat / w, lon: lon / w, acc: Math.sqrt(1 / w), n: ok.length };
  }
  const FT = 3.28084;
  // Pin and ball marks to feet, with the combined margin in feet.
  function ctpMeasure(pin, ball) {
    if (!pin || !ball) return null;
    return { ft: Math.round(metres(pin, ball) * FT * 10) / 10, acc: Math.round(Math.sqrt(pin.acc * pin.acc + ball.acc * ball.acc) * FT) };
  }
  function fmtFeet(ft) {
    if (ft == null) return "";
    if (ft < 100) { const f = Math.floor(ft), i = Math.round((ft - f) * 12); return i === 12 ? (f + 1) + " ft" : f + " ft" + (i ? " " + i + " in" : ""); }
    return Math.round(ft / 3) + " yds";
  }

  /* ---------- changes: the same dotted paths the shared database takes ---------- */
  // patch keys look like "p.abc123.s.1_7" or "name"; a value of DELETE removes the field.
  const DELETE = { __delete: true };
  function applyPatch(doc, patch) {
    const out = JSON.parse(JSON.stringify(doc || {}));
    Object.keys(patch || {}).forEach(path => {
      const parts = path.split("."), last = parts.pop();
      let o = out;
      for (const k of parts) { if (!o[k] || typeof o[k] !== "object") o[k] = {}; o = o[k]; }
      const v = patch[path];
      if (v && v.__delete) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v));
    });
    return out;
  }
  // The shape the database accepts (and what any phone trusts): drops anything odd and caps sizes.
  function cleanEvent(d) {
    if (!d || typeof d !== "object") return null;
    const ev = newEvent({ name: d.name, course: d.course, rounds: d.rounds, now: Number(d.created) || 1 });
    ev.updated = Number(d.updated) || ev.created;
    ev.cur = int(d.cur, 1, ev.rounds, 1);
    ev.done = d.done === true;
    if (d.demo) ev.demo = true;
    const n = ev.course.holes.length;
    Object.keys(d.p && typeof d.p === "object" ? d.p : {}).filter(isPid).slice(0, MAX_PLAYERS).forEach(id => {
      const x = d.p[id]; if (!x || typeof x !== "object") return;
      const pl = { n: cleanName(x.n) || "Player", tee: ev.course.tees.some(t => t.id === x.tee) ? x.tee : ev.course.tees[0].id, g: int(x.g, 1, 60, 1), st: int(x.st, 1, n, 1), at: Number(x.at) || 0, s: {} };
      Object.keys(x.s && typeof x.s === "object" ? x.s : {}).forEach(k => {
        const m = /^([1-4])_([0-9]{1,2})$/.exec(k), v = x.s[k];
        if (m && +m[1] <= ev.rounds && +m[2] >= 1 && +m[2] <= n && Number.isInteger(v) && v >= 1 && v <= 20) pl.s[k] = v;
      });
      ev.p[id] = pl;
    });
    ev.ctph = cleanCtpHoles(d.ctph, n);
    Object.keys(d.ctp && typeof d.ctp === "object" ? d.ctp : {}).forEach(k => {
      const m = /^([1-4])_([0-9]{1,2})$/.exec(k), box = d.ctp[k];
      if (!m || +m[1] > ev.rounds || ev.ctph.indexOf(+m[2]) < 0 || !box || typeof box !== "object") return;
      Object.keys(box).filter(pid => ev.p[pid]).forEach(pid => {
        const e = cleanCtpEntry(box[pid]); if (e) (ev.ctp[k] = ev.ctp[k] || {})[pid] = e;
      });
    });
    return ev;
  }
  // What one finished round looks like in this phone's history (for "previous rounds" on a player card).
  function historyRows(ev, code) {
    return players(ev).map(pl => {
      const out = [];
      for (let r = 1; r <= ev.rounds; r++) { const x = round(ev, pl, r); if (x.done) out.push({ code, event: ev.name, course: ev.course.name, date: ev.created, r, strokes: x.strokes, toPar: x.toPar, name: pl.n }); }
      return out;
    }).reduce((a, b) => a.concat(b), []);
  }
  const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

  return { VERSION, MAX_PLAYERS, MAX_ROUNDS, MAX_TEES, NAME_MAX, EVENT_MAX, TEE_COLORS, DEMO_NAMES, DELETE,
    sampleCourse, newCode, isCode, newPid, isPid, cleanCourse, cleanName, newEvent, newPlayer, cleanEvent,
    key, holeCount, coursePar, players, teeOf, yards, teeYards, playOrder, strokes, round, standings, groups,
    fmtPar, tone, scoreName, mark, stats, demoEvent, applyPatch, historyRows, sameName,
    cleanCtpHoles, cleanCtpEntry, ctpBoard, metres, averageFix, ctpMeasure, fmtFeet };
});
