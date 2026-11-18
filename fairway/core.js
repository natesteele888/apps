/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway core: the golf math with no screen in it, so it can be tested on its own (node tests/fairway.test.cjs).
   A tournament is one plain object (the same shape on the phone and in the shared database):
     { v, name, created, updated, rounds, cur, done, course, p }
     course: { name, tees: [{id, name, color}], holes: [{par, hcp, y: {teeId: yards}}] }
     p: { playerId: { n: name, tee: teeId, g: group number, st: start hole, at: joined time, s: { "round_hole": strokes }, hc: index, t: team } }
     and, all optional (Phase 1): rally, fmt, teams, dr, m, pk, tt (see "PHASE 1" below)
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
  // A handicap index as golfers say it (+2.1 is written -2.1 here), or null when there isn't one.
  function cleanHc(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/^\+/, "-")); return Number.isFinite(n) && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : null; }

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
    const pl = { n: cleanName(o.name) || "Player", tee, g: int(o.group, 1, 60, 1), st: int(o.start, 1, ev.course.holes.length, 1), at: o.now || Date.now(), s: {} };
    const hc = cleanHc(o.hc); if (hc != null) pl.hc = hc;
    return pl;
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

  /* ======================================================================
     PHASE 1: getting a tournament going, the format, the draft, teams, matchups, picks and tee times.
     Every part is optional on a tournament, so older tournaments read the same as before.
       rally: { on, date "YYYY-MM-DD", note, goal, r: { id: { n, s "in"|"maybe"|"out", at } } }
       fmt:   { kind "solo"|"teams"|"match", nt teams, draft "snake"|"straight", clk seconds, mt "singles"|"2v2"|"both"|"none" }
       teams: { "t1": { n, cap: playerId } }       a player's team comes from the draft (see teamOf), or p.<id>.t
       dr:    { on, done, ord: [teamId], pk: [playerId], at }   the draft: round-one order and every pick so far
       m:     { id: { a: [playerId], b: [playerId], r } }      singles (one a side) and 2v2 best ball
       pk:    { playerId: teamId }                              "who wins?" picks, bragging rights only
       tt:    { date, where, g: { "1": "08:10" } }             tee times by group
     ====================================================================== */
  const KINDS = ["solo", "teams", "match"], DRAFTS = ["snake", "straight"], CLOCKS = [0, 30, 60, 300], MTS = ["singles", "2v2", "both", "none"];
  const isDate = s => typeof s === "string" && /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(s);
  const isTime = s => typeof s === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s);
  const isTid = s => typeof s === "string" && /^t[1-8]$/.test(s);
  const RS = ["in", "maybe", "out"];
  function cleanRally(x) {
    if (!x || typeof x !== "object") return null;
    const out = { on: x.on === true, date: isDate(x.date) ? x.date : "", note: clip(x.note, 140), goal: int(x.goal, 2, MAX_PLAYERS, 12), r: {} };
    Object.keys(x.r && typeof x.r === "object" ? x.r : {}).filter(isPid).slice(0, MAX_PLAYERS).forEach(id => {
      const e = x.r[id]; if (!e || typeof e !== "object" || RS.indexOf(e.s) < 0) return;
      out.r[id] = { n: cleanName(e.n) || "Golfer", s: e.s, at: Number(e.at) || 0 };
    });
    return out;
  }
  function cleanFmt(x) {
    x = x && typeof x === "object" ? x : {};
    return { kind: KINDS.indexOf(x.kind) >= 0 ? x.kind : "solo", nt: int(x.nt, 2, 8, 2), draft: DRAFTS.indexOf(x.draft) >= 0 ? x.draft : "snake",
      clk: CLOCKS.indexOf(Number(x.clk)) >= 0 ? Number(x.clk) : 60, mt: MTS.indexOf(x.mt) >= 0 ? x.mt : "singles" };
  }
  // Rally answers, newest first, with the counts.
  function rallyList(ev) {
    const r = (ev.rally && ev.rally.r) || {};
    const list = Object.keys(r).map(id => Object.assign({ id }, r[id])).sort((a, b) => RS.indexOf(a.s) - RS.indexOf(b.s) || a.at - b.at);
    return { list, in: list.filter(x => x.s === "in").length, maybe: list.filter(x => x.s === "maybe").length };
  }
  // Making it official: everyone who said I'm in becomes a player with the same id (so their phone knows them), four to a group.
  function officialPatch(ev, now) {
    now = now || Date.now();
    const patch = { "rally.on": false }, counts = {};
    players(ev).forEach(p => { counts[p.g] = (counts[p.g] || 0) + 1; });
    const starts = {}; players(ev).forEach(p => { if (!starts[p.g]) starts[p.g] = p.st; });
    let g = 1;
    rallyList(ev).list.filter(x => x.s === "in" && !ev.p[x.id]).forEach(x => {
      while ((counts[g] || 0) >= 4) g++;
      counts[g] = (counts[g] || 0) + 1;
      patch["p." + x.id] = newPlayer(ev, { name: x.n, group: g, start: starts[g] || 1, now: x.at || now });
    });
    return patch;
  }
  // The first group with room (four to a group), or a new one, for someone joining.
  function openGroup(ev) {
    const gs = groups(ev), g = gs.find(x => x.players.length < 4);
    return g ? { g: g.g, st: g.start } : { g: gs.length ? Math.max.apply(null, gs.map(x => x.g)) + 1 : 1, st: 1 };
  }

  /* ---------- teams and the draft ---------- */
  const teamIds = ev => Object.keys(ev.teams || {}).filter(isTid).sort();
  // Every pick slot in order (team ids), for this many players besides the captains.
  function pickSlots(ord, picks, kind) {
    const out = []; if (!ord.length) return out;
    for (let i = 0; i < picks; i++) {
      const rnd = Math.floor(i / ord.length), k = i % ord.length;
      out.push(kind === "snake" && rnd % 2 === 1 ? ord[ord.length - 1 - k] : ord[k]);
    }
    return out;
  }
  // A player's team: a captain's own team, else the team that drafted them, else one the organizer set.
  function teamOf(ev, pid) {
    const ts = ev.teams || {};
    for (const t of teamIds(ev)) if (ts[t].cap === pid) return t;
    const dr = ev.dr;
    if (dr && Array.isArray(dr.pk)) {
      const i = dr.pk.indexOf(pid);
      if (i >= 0) { const slot = pickSlots(dr.ord, i + 1, (ev.fmt || {}).draft)[i]; if (slot) return slot; }
    }
    const t = ev.p[pid] && ev.p[pid].t;
    return isTid(t) && ts[t] ? t : null;
  }
  const hcOf = p => (p && Number.isFinite(p.hc) ? p.hc : null);
  const byHc = (a, b) => (hcOf(a) == null ? 99 : hcOf(a)) - (hcOf(b) == null ? 99 : hcOf(b)) || a.n.localeCompare(b.n);
  // Where the draft stands: who's on the clock, who's left (best handicap first), and the next few teams up.
  function draftState(ev, now) {
    const dr = ev.dr || {}, f = ev.fmt || cleanFmt(), ids = teamIds(ev);
    const caps = ids.map(t => ev.teams[t].cap), pool = players(ev).filter(p => caps.indexOf(p.id) < 0);
    const taken = (dr.pk || []).filter(id => ev.p[id]);
    const avail = pool.filter(p => taken.indexOf(p.id) < 0).sort(byHc);
    const slots = pickSlots(dr.ord || [], pool.length, f.draft), n = taken.length;
    const done = !!dr.on && (dr.done || n >= pool.length || !avail.length);
    const on = dr.on && !done ? slots[n] || null : null;
    let left = null;
    if (on && f.clk) left = Math.max(-3600, Math.round(f.clk - ((now || Date.now()) - (dr.at || 0)) / 1000));
    return { started: !!dr.on, done, on, cap: on ? ev.teams[on].cap : null, pick: n + 1, total: pool.length, avail, next: slots.slice(n + 1, n + 6), left, clk: f.clk };
  }
  // The changes for one pick.
  function pickPatch(ev, pid, now) {
    const st = draftState(ev, now);
    if (!st.on || !ev.p[pid] || st.avail.every(p => p.id !== pid)) return null;
    const pk = ((ev.dr && ev.dr.pk) || []).concat(pid);
    const patch = { "dr.pk": pk, "dr.at": now || Date.now() };
    if (pk.length >= st.total) patch["dr.done"] = true;
    return patch;
  }
  // Starting the draft with these captains, in this round-one order.
  function draftStartPatch(ev, caps, now) {
    const teams = {}, ord = [];
    caps.filter(id => ev.p[id]).slice(0, 8).forEach((id, i) => { const t = "t" + (i + 1); teams[t] = { n: "Team " + ev.p[id].n.split(" ").slice(-1)[0], cap: id }; ord.push(t); });
    return { teams, dr: { on: true, done: false, ord, pk: [], at: now || Date.now() } };
  }
  // Captains picked for the organizer: lowest handicaps, or at random.
  function pickCaptains(ev, n, how, rnd) {
    const list = players(ev);
    if (how === "low") return list.sort(byHc).slice(0, n).map(p => p.id);
    const r = rnd || Math.random, a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n).map(p => p.id);
  }
  // Each team's members (captain first, then in draft order) and its total to par, best first.
  function teamBoard(ev) {
    const ids = teamIds(ev); if (!ids.length) return [];
    const rows = standings(ev), byId = {}; rows.forEach(r => { byId[r.id] = r; });
    const pkOrder = (ev.dr && ev.dr.pk) || [];
    const out = ids.map(t => {
      const members = players(ev).filter(p => teamOf(ev, p.id) === t)
        .sort((a, b) => (a.id === ev.teams[t].cap ? -1 : b.id === ev.teams[t].cap ? 1 : 0) || pkOrder.indexOf(a.id) - pkOrder.indexOf(b.id));
      const hcs = members.map(hcOf).filter(v => v != null);
      const played = members.filter(p => byId[p.id] && byId[p.id].holes);
      return { id: t, name: ev.teams[t].n, cap: ev.teams[t].cap, members, toPar: played.reduce((a, p) => a + byId[p.id].toPar, 0), holes: played.reduce((a, p) => a + byId[p.id].holes, 0),
        avg: hcs.length ? Math.round((hcs.reduce((a, b) => a + b, 0) / hcs.length) * 10) / 10 : null };
    });
    out.sort((a, b) => (a.holes ? 0 : 1) - (b.holes ? 0 : 1) || a.toPar - b.toPar || a.name.localeCompare(b.name));
    out.forEach((t, i) => { const first = out.findIndex(x => x.holes && x.toPar === t.toPar); t.pos = !t.holes ? "–" : (out.filter(x => x.holes && x.toPar === t.toPar).length > 1 ? "T" : "") + (first + 1); });
    return out;
  }

  /* ---------- matchups: match play, singles or 2v2 best ball ---------- */
  // Win chance for the side that's `up` with `left` holes to go (each hole won, lost or halved).
  function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function matchStatus(ev, mt) {
    const a = (mt.a || []).filter(id => ev.p[id]), b = (mt.b || []).filter(id => ev.p[id]), r = mt.r || ev.cur || 1, n = holeCount(ev);
    if (!a.length || !b.length) return null;
    const order = playOrder(n, ev.p[a[0]].st), best = side => h => { const v = side.map(id => strokes(ev.p[id], r, h)); return v.some(x => x == null) ? null : Math.min.apply(null, v); };
    const sa = best(a), sb = best(b);
    let up = 0, played = 0, done = false, when = null;
    for (const h of order) {
      const x = sa(h), y = sb(h); if (x == null || y == null) break;
      played++; if (x < y) up++; else if (y < x) up--;
      if (Math.abs(up) > n - played) { done = true; when = n - played; break; }
    }
    const left = n - played;
    if (!done && left === 0) done = true;
    let text;
    if (done) text = up === 0 ? "Halved" : when ? Math.abs(up) + "&" + when : Math.abs(up) + " UP";
    else text = !played ? "Not started" : up === 0 ? "All square" : Math.abs(up) + " UP";
    const sd = Math.sqrt(Math.max(0.0001, 0.5 * left));
    const pa = done ? (up > 0 ? 1 : up < 0 ? 0 : 0.5) : up === 0 ? 0.5 : phi(up / sd);
    return { a, b, r, up, played, left, done, text, thru: played, lead: up > 0 ? "a" : up < 0 ? "b" : null, pa: Math.round(pa * 100) / 100 };
  }
  const matchIds = ev => Object.keys(ev.m || {}).filter(isPid);
  // Pair two teams by draft order: captain against captain, first pick against first pick, and so on.
  function autoMatches(ev, kind, newId) {
    const tb = teamBoard(ev); if (tb.length !== 2) return {};
    const A = tb.find(t => t.id === "t1") || tb[0], B = tb.find(t => t !== A), out = {}, r = ev.cur || 1, mk = newId || newPid;
    const n = Math.min(A.members.length, B.members.length);
    if (kind === "2v2") for (let i = 0; i + 1 < n; i += 2) out[mk()] = { a: [A.members[i].id, A.members[i + 1].id], b: [B.members[i].id, B.members[i + 1].id], r };
    else for (let i = 0; i < n; i++) out[mk()] = { a: [A.members[i].id], b: [B.members[i].id], r };
    return out;
  }

  /* ---------- picks: who wins? ---------- */
  const picksLocked = ev => players(ev).some(p => Object.keys(p.s || {}).some(k => k.indexOf("1_") === 0));
  function pickCounts(ev) { const o = {}; Object.keys(ev.pk || {}).forEach(pid => { const t = ev.pk[pid]; if (ev.p[pid] && ev.teams && ev.teams[t]) o[t] = (o[t] || 0) + 1; }); return o; }

  /* ---------- tee times and the calendar file ---------- */
  function cleanTt(x, n) {
    if (!x || typeof x !== "object") return null;
    const g = {};
    Object.keys(x.g && typeof x.g === "object" ? x.g : {}).forEach(k => { if (/^[1-9][0-9]?$/.test(k) && +k <= 60 && isTime(x.g[k])) g[k] = x.g[k]; });
    return { date: isDate(x.date) ? x.date : "", where: clip(x.where, 80), g };
  }
  const teeTime = (ev, g) => (ev.tt && ev.tt.g && ev.tt.g[String(g)]) || "";
  // "08:10" → "8:10 AM"
  function fmtTime(t) { if (!isTime(t)) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; }
  function fmtDate(d) { if (!isDate(d)) return ""; const [y, mo, da] = d.split("-").map(Number); const dt = new Date(Date.UTC(y, mo - 1, da)); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()] + ", " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1] + " " + da; }
  // Minutes before the tee time for each reminder: the night before at 7 PM, two hours out, leave now, check in.
  function reminders(time, drive) {
    const [h, m] = time.split(":").map(Number), mins = h * 60 + m, d = int(drive, 0, 240, 25);
    return [{ k: "night", label: "The night before", before: mins + (24 * 60 - 19 * 60) }, { k: "two", label: "Two hours out", before: 120 },
      { k: "leave", label: "Leave now", before: 30 + d }, { k: "check", label: "Check in and warm up", before: 30 }];
  }
  const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const icsWhen = (date, time, addMin) => { const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number); const t = new Date(Date.UTC(y, mo - 1, d, h, mi + (addMin || 0))); const p = n => String(n).padStart(2, "0"); return t.getUTCFullYear() + p(t.getUTCMonth() + 1) + p(t.getUTCDate()) + "T" + p(t.getUTCHours()) + p(t.getUTCMinutes()) + "00"; };
  // One calendar event in the phone's own time (no time zone, so it's the course's local time), with the four alarms.
  function icsFor(ev, g, o) {
    o = o || {};
    const time = teeTime(ev, g), date = ev.tt && ev.tt.date; if (!time || !date) return "";
    const stamp = new Date(o.now || Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dur = holeCount(ev) === 9 ? 135 : 270, rem = reminders(time, o.drive).filter(x => !o.off || o.off.indexOf(x.k) < 0);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fairway//Tee time//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:" + (o.uid || "tee") + "-g" + g + "@fairway", "DTSTAMP:" + stamp, "DTSTART:" + icsWhen(date, time), "DTEND:" + icsWhen(date, time, dur),
      "SUMMARY:" + icsEsc(ev.name + ", group " + g + " tees off"), "LOCATION:" + icsEsc(ev.tt.where || ev.course.name),
      "DESCRIPTION:" + icsEsc("Group " + g + " at " + fmtTime(time) + "." + (o.link ? " Scores: " + o.link : ""))];
    rem.forEach(x => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(x.label + ": " + ev.name + " at " + fmtTime(time)), "TRIGGER:-PT" + x.before + "M", "END:VALARM"));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }
  // A maps search for the course (opens the phone's maps app with the drive).
  const directions = ev => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((ev.tt && ev.tt.where) || ev.course.name);

  /* ---------- the chat: each message its own small record next to the tournament ---------- */
  function cleanMsg(x) {
    if (!x || typeof x !== "object") return null;
    const k = ["m", "a", "p"].indexOf(x.k) >= 0 ? x.k : "m";
    const t = String(x.t == null ? "" : x.t).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
    const out = { k, n: cleanName(x.n) || "Golfer", t, at: Number(x.at) || 0 };
    if (isPid(x.by)) out.by = x.by;
    if (k === "p") { out.o = (Array.isArray(x.o) ? x.o : []).map(s => clip(s, 40)).filter(Boolean).slice(0, 6); out.v = {}; Object.keys(x.v && typeof x.v === "object" ? x.v : {}).filter(isPid).forEach(id => { const i = Math.round(Number(x.v[id])); if (i >= 0 && i < out.o.length) out.v[id] = i; }); if (out.o.length < 2) return null; }
    if (!out.t && k !== "p") return null;
    return out;
  }
  // What a score says in the chat when it's worth shouting about (birdie or better).
  function shout(ev, pid, r, h, v) {
    const pl = ev.p[pid]; if (!pl || !v) return null;
    const d = v - ev.course.holes[h - 1].par; if (d > -1) return null;
    return scoreName(d, v) + "! " + pl.n + " on " + h + (ev.rounds > 1 ? " (round " + r + ")" : "") + ".";
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
      const hc = typeof x.hc === "number" ? cleanHc(x.hc) : null; if (hc != null) pl.hc = hc;
      if (isTid(x.t)) pl.t = x.t;
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
    // Phase 1 parts
    const rally = cleanRally(d.rally); if (rally) ev.rally = rally;
    if (d.fmt && typeof d.fmt === "object") ev.fmt = cleanFmt(d.fmt);
    if (d.teams && typeof d.teams === "object") {
      ev.teams = {};
      Object.keys(d.teams).filter(isTid).forEach(t => { const x = d.teams[t]; if (!x || typeof x !== "object") return; ev.teams[t] = { n: clip(x.n, 30) || "Team " + t.slice(1), cap: isPid(x.cap) && ev.p[x.cap] ? x.cap : null }; });
    }
    if (d.dr && typeof d.dr === "object") {
      const seen = {}, ord = (Array.isArray(d.dr.ord) ? d.dr.ord : []).filter(t => isTid(t) && ev.teams && ev.teams[t] && !seen[t] && (seen[t] = 1));
      const pk = []; (Array.isArray(d.dr.pk) ? d.dr.pk : []).forEach(id => { if (isPid(id) && ev.p[id] && pk.indexOf(id) < 0 && pk.length < MAX_PLAYERS) pk.push(id); });
      ev.dr = { on: d.dr.on === true, done: d.dr.done === true, ord, pk, at: Number(d.dr.at) || 0 };
    }
    if (d.m && typeof d.m === "object") {
      ev.m = {};
      Object.keys(d.m).filter(isPid).slice(0, 60).forEach(id => {
        const x = d.m[id]; if (!x || typeof x !== "object") return;
        const side = v => { const o = []; (Array.isArray(v) ? v : []).forEach(p => { if (isPid(p) && ev.p[p] && o.indexOf(p) < 0 && o.length < 2) o.push(p); }); return o; };
        const a = side(x.a), b = side(x.b).filter(p => a.indexOf(p) < 0);
        if (a.length && b.length) ev.m[id] = { a, b, r: int(x.r, 1, ev.rounds, 1) };
      });
    }
    if (d.pk && typeof d.pk === "object") {
      ev.pk = {};
      Object.keys(d.pk).filter(id => isPid(id) && ev.p[id]).forEach(id => { if (isTid(d.pk[id]) && ev.teams && ev.teams[d.pk[id]]) ev.pk[id] = d.pk[id]; });
    }
    const tt = cleanTt(d.tt, n); if (tt) ev.tt = tt;
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
  // Board names the way a TV leaderboard shows them: the last name, with a first initial only when two share it.
  function boardNames(list) {
    const parts = list.map(x => cleanName(x.name || x.n).split(/\s+/).filter(Boolean));
    const last = parts.map(w => (w.length ? w[w.length - 1] : "Player").toUpperCase());
    const count = {}; last.forEach(l => { count[l] = (count[l] || 0) + 1; });
    const out = {};
    list.forEach((x, i) => { const w = parts[i]; out[x.id] = count[last[i]] > 1 && w.length > 1 ? w[0].charAt(0).toUpperCase() + ". " + last[i] : last[i]; });
    return out;
  }

  return { VERSION, MAX_PLAYERS, MAX_ROUNDS, MAX_TEES, NAME_MAX, EVENT_MAX, TEE_COLORS, DEMO_NAMES, DELETE,
    sampleCourse, newCode, isCode, newPid, isPid, cleanCourse, cleanName, newEvent, newPlayer, cleanEvent,
    key, holeCount, coursePar, players, teeOf, yards, teeYards, playOrder, strokes, round, standings, groups,
    fmtPar, tone, scoreName, mark, stats, demoEvent, applyPatch, historyRows, sameName, boardNames,
    cleanCtpHoles, cleanCtpEntry, ctpBoard, metres, averageFix, ctpMeasure, fmtFeet,
    cleanHc, isDate, isTime, isTid, cleanRally, cleanFmt, rallyList, officialPatch, openGroup, teamIds, pickSlots, teamOf, draftState, pickPatch,
    draftStartPatch, pickCaptains, teamBoard, matchStatus, matchIds, autoMatches, picksLocked, pickCounts, cleanTt, teeTime, fmtTime, fmtDate,
    reminders, icsFor, directions, cleanMsg, shout };
});
