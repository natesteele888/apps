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

  /* ---------- round bingo: a 3 by 3 card of things that happen in every round ---------- */
  // The first three mark themselves from the scorecard; the rest are tapped when they happen.
  const BINGO = ["Birdie", "Par on a par 5", "Par on a par 3", "Three-putt", "Ball in the water", "Lost ball", "Sand save", "Chip-in", "Hit a tree", "One-putt", "Mulligan", "Gimme putt"];
  const BINGO_AUTO = 3, BINGO_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  // Each golfer's own shuffle, the same on every phone: 8 squares around a free middle (cell 4 holds -1).
  function bingoCard(ev, pid) {
    const rnd = seeded(hashStr(pid + ":" + (ev.created || 0))), idx = BINGO.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const cells = idx.slice(0, 8); cells.splice(4, 0, -1); return cells;
  }
  // Which squares the scorecard has already earned this round.
  function bingoAuto(ev, pid, r) {
    const pl = ev.p[pid], got = {}; if (!pl) return got;
    ev.course.holes.forEach((hole, i) => {
      const v = strokes(pl, r, i + 1); if (v == null) return;
      if (v < hole.par) got[0] = true;
      if (v === hole.par && hole.par === 5) got[1] = true;
      if (v === hole.par && hole.par === 3) got[2] = true;
    });
    return got;
  }
  function bingoState(ev, pid, r) {
    const cells = bingoCard(ev, pid), auto = bingoAuto(ev, pid, r), tapped = (ev.bg && ev.bg[pid]) || [];
    const hit = cells.map(sq => sq < 0 || !!auto[sq] || tapped.indexOf(sq) >= 0);
    const line = BINGO_LINES.find(l => l.every(i => hit[i])) || null;
    const need = Math.min.apply(null, BINGO_LINES.map(l => l.filter(i => !hit[i]).length));
    return { cells: cells.map((sq, i) => ({ sq, t: sq < 0 ? "Free" : BINGO[sq], auto: sq >= 0 && sq < BINGO_AUTO, hit: hit[i] })), line, need };
  }
  function cleanBingo(x, ev) {
    const out = {}; if (!x || typeof x !== "object") return out;
    Object.keys(x).filter(pid => isPid(pid) && ev.p[pid]).forEach(pid => {
      const l = []; (Array.isArray(x[pid]) ? x[pid] : []).forEach(v => { if (Number.isInteger(v) && v >= BINGO_AUTO && v < BINGO.length && l.indexOf(v) < 0) l.push(v); });
      if (l.length) out[pid] = l;
    });
    return out;
  }

  /* ---------- side games: a running tally of who owes who. Fairway never moves money. ---------- */
  const BETS = [["skins", "Skins"], ["tskins", "Team skins"], ["nassau", "Nassau"], ["wolf", "Wolf"], ["bball", "Best ball"],
    ["ctp", "Closest to the pin"], ["long", "Long drive"], ["green", "Greenies"], ["sandy", "Sandies"], ["snake", "Snake"]];
  const BET_IDS = BETS.map(b => b[0]), BET_AMTS = [0, 1, 2, 5, 10, 20];
  // Settings: which games are on, the stake for each (0 plays for bragging rights) and who sits out.
  function cleanBets(x, ev) {
    if (!x || typeof x !== "object") return null;
    const on = []; (Array.isArray(x.on) ? x.on : []).forEach(g => { if (BET_IDS.indexOf(g) >= 0 && on.indexOf(g) < 0) on.push(g); });
    const amt = {}; on.forEach(g => { const v = x.amt && typeof x.amt === "object" ? Number(x.amt[g]) : NaN; amt[g] = BET_AMTS.indexOf(v) >= 0 ? v : 1; });
    const out = []; (Array.isArray(x.out) ? x.out : []).forEach(p => { if (isPid(p) && ev.p[p] && out.indexOf(p) < 0) out.push(p); });
    return { on, amt, out };
  }
  // Marks by round and hole: ld long drive, gr greenie, sa sandies, tp three-putts (the snake), wp each group's wolf pick.
  function cleanBetMarks(x, ev) {
    const out = {}, n = ev.course.holes.length; if (!x || typeof x !== "object") return out;
    const one = p => (isPid(p) && ev.p[p] ? p : null);
    const many = v => { const o = []; (Array.isArray(v) ? v : []).forEach(p => { if (one(p) && o.indexOf(p) < 0) o.push(p); }); return o; };
    Object.keys(x).forEach(k => {
      const m = /^([1-4])_([0-9]{1,2})$/.exec(k), b = x[k];
      if (!m || +m[1] > ev.rounds || +m[2] < 1 || +m[2] > n || !b || typeof b !== "object") return;
      const o = {};
      if (one(b.ld)) o.ld = b.ld;
      if (one(b.gr)) o.gr = b.gr;
      const sa = many(b.sa); if (sa.length) o.sa = sa;
      const tp = many(b.tp); if (tp.length) o.tp = tp;
      if (b.wp && typeof b.wp === "object") {
        const wp = {}; Object.keys(b.wp).forEach(g => { const v = b.wp[g]; if (/^[0-9]{1,2}$/.test(g) && +g >= 1 && +g <= 60 && (v === "lone" || one(v))) wp[g] = v; });
        if (Object.keys(wp).length) o.wp = wp;
      }
      if (Object.keys(o).length) out[k] = o;
    });
    return out;
  }
  const betOn = (ev, g) => !!(ev.bets && ev.bets.on.indexOf(g) >= 0);
  const betAmt = (ev, g) => (ev.bets && ev.bets.amt && ev.bets.amt[g] != null ? ev.bets.amt[g] : 1);
  function betPlayers(ev) { const out = (ev.bets && ev.bets.out) || []; return players(ev).filter(p => out.indexOf(p.id) < 0).map(p => p.id); }
  // A group's wolf order: who joined first tees off first, then it goes round by hole number.
  function wolfOrder(ev, g, who) { return who.filter(p => ev.p[p].g === g).sort((a, b) => (ev.p[a].at || 0) - (ev.p[b].at || 0) || (a < b ? -1 : 1)); }
  function wolfOf(ev, g, h, who) { const o = wolfOrder(ev, g, who || betPlayers(ev)); return o.length >= 3 ? o[(h - 1) % o.length] : null; }
  const andList = l => (l.length < 3 ? l.join(" and ") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1]);
  const money = v => { const c = Math.round(Math.abs(v) * 100); return "$" + (c % 100 ? (c / 100).toFixed(2) : String(c / 100)); };

  // The whole tally for one round: each game's results, everyone's balance and the fewest payments that settle it.
  function betTally(ev, r) {
    const who = betPlayers(ev), nm = p => (ev.p[p] ? ev.p[p].n : "Player"), n = holeCount(ev), holes = ev.course.holes;
    const bm = ev.bm || {}, bal = {}; who.forEach(p => { bal[p] = 0; });
    const sc = (p, h) => strokes(ev.p[p], r, h), all = (list, h) => list.every(p => sc(p, h) != null);
    const games = [];
    // every loser pays the stake, split between the winners
    function pay(win, lose, unit, real) { if (!real || !win.length || !lose.length) return; lose.forEach(l => win.forEach(w => { bal[l] -= unit / win.length; bal[w] += unit / win.length; })); }
    const teams = teamIds(ev).map(t => ({ t, n: ev.teams[t].n, m: who.filter(p => teamOf(ev, p) === t) })).filter(x => x.m.length);
    (ev.bets ? ev.bets.on : []).forEach(g => {
      const amt = betAmt(ev, g), unit = amt || 1, real = amt > 0, lines = [], game = { g, name: BETS.find(b => b[0] === g)[1], amt, lines };
      const others = p => who.filter(x => x !== p);
      if (who.length < 2) lines.push("Needs two golfers or more.");
      else if (g === "skins" || g === "tskins") {
        const sides = g === "skins" ? who.map(p => ({ n: nm(p), m: [p] })) : teams;
        if (sides.length < 2) lines.push("Needs two teams. Set them up on the Teams tab.");
        else {
          let carry = 1, won = 0;
          for (let h = 1; h <= n; h++) {
            if (!sides.every(s => all(s.m, h))) { lines.push(`Hole ${h} waits on everyone's score${carry > 1 ? `, ${carry} skins riding` : ""}.`); carry = 0; break; }
            const best = sides.map(s => Math.min.apply(null, s.m.map(p => sc(p, h)))), low = Math.min.apply(null, best), at = best.filter(v => v === low).length;
            if (at > 1) { carry++; continue; }
            const w = sides[best.indexOf(low)];
            lines.push(`Hole ${h}: ${w.n}${carry > 1 ? ` wins ${carry} skins` : " wins the skin"}.`);
            pay(w.m, who.filter(p => w.m.indexOf(p) < 0), unit * carry, real); won += carry; carry = 1;
          }
          if (carry > 1) lines.push(`${carry - 1} skin${carry > 2 ? "s" : ""} carried past the last hole.`);
          if (!won && !lines.length) lines.push("No skins won yet.");
        }
      } else if (g === "nassau") {
        const legs = n === 18 ? [["Front nine", 1, 9], ["Back nine", 10, 18], ["Total", 1, 18]] : [["Total", 1, n]];
        legs.forEach(([lbl, a, b]) => {
          const hs = []; for (let h = a; h <= b; h++) hs.push(h);
          if (!hs.every(h => all(who, h))) { lines.push(`${lbl}: still being played.`); return; }
          const tot = who.map(p => hs.reduce((s, h) => s + sc(p, h), 0)), low = Math.min.apply(null, tot), win = who.filter((p, i) => tot[i] === low);
          if (win.length === who.length) { lines.push(`${lbl}: all square at ${low}.`); return; }
          lines.push(`${lbl}: ${andList(win.map(nm))}${win.length > 1 ? " tie" : " wins"} with ${low}.`);
          pay(win, who.filter(p => win.indexOf(p) < 0), unit, real);
        });
      } else if (g === "bball") {
        if (teams.length < 2) lines.push("Needs two teams. Set them up on the Teams tab.");
        else {
          const done = [], tot = teams.map(() => 0);
          for (let h = 1; h <= n; h++) if (teams.every(s => all(s.m, h))) { done.push(h); teams.forEach((s, i) => { tot[i] += Math.min.apply(null, s.m.map(p => sc(p, h))); }); }
          if (!done.length) lines.push("No holes in from every team yet.");
          else {
            const low = Math.min.apply(null, tot), win = teams.filter((s, i) => tot[i] === low);
            teams.forEach((s, i) => lines.push(`${s.n}: ${tot[i]} through ${done.length}.`));
            if (done.length === n) { const wm = [].concat.apply([], win.map(s => s.m)); lines.push(win.length === teams.length ? "All square." : `${andList(win.map(s => s.n))}${win.length > 1 ? " tie" : " win"}.`); pay(wm, who.filter(p => wm.indexOf(p) < 0), unit, real); }
          }
        }
      } else if (g === "ctp") {
        ctpBoard(ev, r).forEach(x => {
          const b = x.list.find(e => who.indexOf(e.pid) >= 0);
          if (!b) { lines.push(`Hole ${x.h}: nobody on yet.`); return; }
          lines.push(`Hole ${x.h}: ${nm(b.pid)}, ${fmtFeet(b.d)}.`); pay([b.pid], others(b.pid), unit, real);
        });
        if (!(ev.ctph || []).length) lines.push("Pick the closest to the pin holes on the Score tab.");
      } else if (g === "long" || g === "green" || g === "sandy") {
        for (let h = 1; h <= n; h++) {
          const m = bm[key(r, h)] || {}, par = holes[h - 1].par;
          if (g === "long" && m.ld && who.indexOf(m.ld) >= 0) { lines.push(`Hole ${h}: ${nm(m.ld)}.`); pay([m.ld], others(m.ld), unit, real); }
          if (g === "green" && m.gr && who.indexOf(m.gr) >= 0) {
            const v = sc(m.gr, h);
            if (v == null) lines.push(`Hole ${h}: ${nm(m.gr)}, once they make par.`);
            else if (v <= par) { lines.push(`Hole ${h}: ${nm(m.gr)}.`); pay([m.gr], others(m.gr), unit, real); }
            else lines.push(`Hole ${h}: ${nm(m.gr)} hit it close but missed par.`);
          }
          if (g === "sandy") (m.sa || []).filter(p => who.indexOf(p) >= 0).forEach(p => {
            const v = sc(p, h);
            if (v != null && v <= par) { lines.push(`Hole ${h}: ${nm(p)}.`); pay([p], others(p), unit, real); }
          });
        }
        if (!lines.length) lines.push(g === "long" ? "Mark the long drive from Mark a hole." : g === "green" ? "Greenies: on the green in one on a par 3 and make par. Mark them from Mark a hole." : "Sandies: out of the sand and par or better. Mark them from Mark a hole.");
      } else if (g === "snake") {
        let holder = null, last = 0;
        for (let h = 1; h <= n; h++) { const tp = ((bm[key(r, h)] || {}).tp || []).filter(p => who.indexOf(p) >= 0); if (tp.length) { holder = tp[tp.length - 1]; last = h; } }
        if (!holder) lines.push("Nobody has three-putted yet.");
        else { lines.push(`${nm(holder)} holds the snake (three-putt on ${last}) and pays everyone if it ends now.`); pay(others(holder), [holder], unit * others(holder).length, real); }
      } else if (g === "wolf") {
        const gs = []; who.forEach(p => { const gg = ev.p[p].g; if (gs.indexOf(gg) < 0) gs.push(gg); });
        gs.sort((a, b) => a - b).forEach(gg => {
          const order = wolfOrder(ev, gg, who);
          if (order.length < 3) return;
          const pre = gs.length > 1 ? `Group ${gg}, ` : "", tally = {}; order.forEach(p => { tally[p] = 0; });
          for (let h = 1; h <= n; h++) {
            const w = order[(h - 1) % order.length], pick = ((bm[key(r, h)] || {}).wp || {})[gg];
            if (!pick || !all(order, h) || (pick !== "lone" && order.indexOf(pick) < 0)) continue;
            const a = pick === "lone" ? [w] : [w, pick], b = order.filter(p => a.indexOf(p) < 0);
            const ba = Math.min.apply(null, a.map(p => sc(p, h))), bb = Math.min.apply(null, b.map(p => sc(p, h)));
            if (ba === bb) { lines.push(`${pre}hole ${h}: halved.`); continue; }
            const stake = pick === "lone" ? 2 * unit : unit, win = ba < bb ? a : b, lose = ba < bb ? b : a;
            lines.push(`${pre}hole ${h}: ${pick === "lone" ? (ba < bb ? `${nm(w)} wins alone` : `${nm(w)} loses alone`) : `${win.map(nm).join(" and ")} win`}.`);
            lose.forEach(l => win.forEach(x => { tally[l] -= stake; tally[x] += stake; }));
          }
          if (real) order.forEach(p => { bal[p] += tally[p]; });
        });
        if (!lines.length) lines.push("Each hole, the wolf picks a partner or goes alone. Pick from Mark a hole.");
      }
      games.push(game);
    });
    // fewest payments: the biggest debt goes to the biggest winner first
    const owes = [], debt = who.filter(p => bal[p] < -0.004).map(p => ({ p, v: -bal[p] })), cred = who.filter(p => bal[p] > 0.004).map(p => ({ p, v: bal[p] }));
    debt.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
    while (debt.length && cred.length) {
      const d = debt[0], c = cred[0], v = Math.min(d.v, c.v);
      owes.push({ from: d.p, to: c.p, amt: Math.round(v * 100) / 100 });
      d.v -= v; c.v -= v;
      if (d.v < 0.004) debt.shift(); if (c.v < 0.004) cred.shift();
      debt.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
    }
    Object.keys(bal).forEach(p => { bal[p] = Math.round(bal[p] * 100) / 100; });
    return { who, games, bal, owes };
  }

  /* ---------- after a hole: how it went, the hole coming up and what Jack noticed ---------- */
  // "How it went" stays on the golfer's own phone, never in the shared tournament: t tee shot, p putts, x penalties, b in the sand.
  const TEE_SHOTS = ["fairway", "left", "right", "short"];
  function cleanHoleNote(x) {
    if (!x || typeof x !== "object") return null;
    const o = {};
    if (TEE_SHOTS.indexOf(x.t) >= 0) o.t = x.t;
    if (Number.isInteger(x.p) && x.p >= 0 && x.p <= 6) o.p = x.p;
    if (Number.isInteger(x.x) && x.x >= 0 && x.x <= 6) o.x = x.x;
    if (x.b === true) o.b = true;
    return Object.keys(o).length ? o : null;
  }
  function cleanHoleNotes(x) {
    const out = {}; if (!x || typeof x !== "object") return out;
    Object.keys(x).forEach(k => { if (/^[1-4]_([1-9]|1[0-8])$/.test(k)) { const v = cleanHoleNote(x[k]); if (v) out[k] = v; } });
    return out;
  }
  // One plain line: "Missed left, 2 putts, 1 penalty, in the sand". Greens in regulation come from the score and putts.
  function holeLine(par, v, n) {
    if (!n) return "";
    const out = [];
    if (n.t && par > 3) out.push(n.t === "fairway" ? "Fairway" : n.t === "short" ? "Short of the fairway" : "Missed " + n.t);
    if (n.p != null) {
      out.push(n.p === 0 ? "holed it from off the green" : n.p === 1 ? "1 putt" : n.p + " putts");
      if (v != null && v - n.p <= par - 2) out.push("green in regulation");
    }
    if (n.x) out.push(n.x === 1 ? "1 penalty" : n.x + " penalties");
    if (n.b) out.push("in the sand");
    const s = out.join(", ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // The next hole in this golfer's own order, with the yards from their tees.
  function nextHole(ev, pl, r, h) {
    const order = playOrder(holeCount(ev), pl.st), i = order.indexOf(h);
    if (i < 0 || i >= order.length - 1) return null;
    const nh = order[i + 1], hole = ev.course.holes[nh - 1], tee = teeOf(ev, pl);
    return { h: nh, par: hole.par, hcp: hole.hcp, yds: yards(ev.course, nh, tee.id) || null, tee: tee.name };
  }
  // Plain, clean words about a pattern in the last few holes. No AI here, just counting.
  function jackNoticed(ev, pl, r, notes) {
    const order = playOrder(holeCount(ev), pl.st).filter(h => strokes(pl, r, h) != null);
    const last = order.slice(-4), recent = last.map(h => ({ h, v: strokes(pl, r, h), par: ev.course.holes[h - 1].par, n: notes[key(r, h)] || {} }));
    if (recent.length < 3) return null;
    const tees = recent.filter(x => x.par > 3 && x.n.t), missed = tees.filter(x => x.n.t !== "fairway").length;
    if (tees.length >= 3 && missed >= 3) return `You've missed ${missed} of your last ${tees.length} fairways. Club down off the tee for a few holes and play from the short grass.`;
    const pen = recent.slice(-3).filter(x => x.n.x);
    if (pen.length >= 2) return "Two penalties in three holes. Pick the safe side of the hole and take the trouble out of play.";
    const three = recent.filter(x => x.n.p >= 3).length;
    if (three >= 2) return `${three} three-putts in your last ${recent.length} holes. Lag the long ones close and take your two.`;
    const run = recent.slice(-3).reduce((a, x) => a + x.v - x.par, 0);
    if (run <= -2) return `${-run} under over your last three holes. Keep doing exactly what you're doing.`;
    if (run >= 5) return "A rough patch. Fairways and the middle of the green for the next couple of holes; bogey is fine.";
    return null;
  }

  /* ---------- Jack's settings and each golfer's own caddie notes (both kept on the golfer's phone) ---------- */
  const JACK_LANGS = [["clean", "Clean"], ["little", "A little"], ["lot", "A lot"], ["crude", "Super crude"]], JACK_LISTEN = ["hey", "always", "off"];
  // Kid and beginner profiles are locked to Clean; Super crude needs the adult check and only plays through earbuds.
  function cleanJack(x) {
    x = x && typeof x === "object" ? x : {};
    const o = { lang: JACK_LANGS.some(l => l[0] === x.lang) ? x.lang : "clean", kid: x.kid === true, adult: x.adult === true, buds: x.buds === true, listen: JACK_LISTEN.indexOf(x.listen) >= 0 ? x.listen : "hey" };
    if (o.kid) o.lang = "clean";
    if (o.lang === "crude" && !o.adult) o.lang = "lot";
    return o;
  }
  // The level Jack actually speaks at right now: Super crude drops to A lot whenever the earbuds aren't in.
  function jackLevel(j) { j = cleanJack(j); return j.lang === "crude" && !j.buds ? "lot" : j.lang; }
  // Swearing only, never anything sexual. At Clean the swears simply drop out of what Jack reads aloud.
  const SWEARS = /\b(f+u+c+k\w*|motherf\w*|sh[i1]t\w*|bullsh\w*|ass(hole)?s?|bastards?|bitch\w*|crap\w*|piss\w*|god ?dam\w*|dam(n|mit)\w*(?: it)?|hell)\b/gi;
  function speakable(text, level) {
    const t = clip(text, 400);
    if (level !== "clean") return t;
    return t.replace(SWEARS, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/([.!?])[,\s]*,\s*/g, "$1 ").replace(/^[,\s]+/, "").trim();
  }
  // Notes are filed by course (its id, or its name) and hole: up to 5 short notes a hole.
  const NOTE_MAX = 200, NOTES_PER_HOLE = 5;
  function courseKey(course) { return course && course.id ? "id:" + clip(course.id, 40) : "n:" + clip(course && course.name, 60).toLowerCase(); }
  function cleanCourseNotes(x) {
    const out = {}; if (!x || typeof x !== "object") return out;
    Object.keys(x).slice(0, 50).forEach(ck => {
      const holes = x[ck]; if (!/^(id|n):/.test(ck) || !holes || typeof holes !== "object") return;
      const o = {};
      Object.keys(holes).forEach(h => {
        if (!/^([1-9]|1[0-8])$/.test(h)) return;
        const l = (Array.isArray(holes[h]) ? holes[h] : []).map(t => clip(t, NOTE_MAX)).filter(Boolean).slice(0, NOTES_PER_HOLE);
        if (l.length) o[h] = l;
      });
      if (Object.keys(o).length) out[ck] = o;
    });
    return out;
  }
  // What Jack says walking up to a hole: par and yards, then the golfer's own notes in their own words.
  function holeTalk(ev, pl, h, notes, level) {
    const hole = ev.course.holes[h - 1], tee = teeOf(ev, pl), y = yards(ev.course, h, tee.id);
    const mine = ((notes || {})[courseKey(ev.course)] || {})[h] || [];
    let s = `Hole ${h}, par ${hole.par}${y ? `, ${y} yards` : ""}.`;
    if (mine.length) s += " Your notes: " + mine.map(t => speakable(t, level)).filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : t + ".")).join(" ");
    return s;
  }

  /* ---------- round recap: made from the cards once every card in a round is in ---------- */
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  function roundDone(ev, r) { const ps = players(ev); return ps.length >= 2 && ps.every(p => round(ev, p, r).done); }
  function recap(ev, r) {
    if (!roundDone(ev, r)) return null;
    const ps = players(ev), rs = ps.map(p => ({ p, x: round(ev, p, r) })), items = [], holes = ev.course.holes;
    const last = r === ev.rounds;
    // champions: the winning team, or the leader (overall on the last day, else the day's low round)
    let champ = null;
    const tb = teamBoard(ev).filter(t => t.holes);
    if (tb.length >= 2 && last) champ = { name: tb[0].pos.charAt(0) === "T" ? "A tie at the top" : tb[0].name, line: tb[0].pos.charAt(0) === "T" ? tb.filter(t => t.toPar === tb[0].toPar).map(t => t.name).join(" and ") : `${fmtPar(tb[0].toPar)} as a team${tb[1] ? `, won by ${tb[1].toPar - tb[0].toPar}` : ""}` };
    else {
      const st = last ? standings(ev).filter(x => x.holes) : rs.slice().sort((a, b) => a.x.toPar - b.x.toPar).map(o => ({ name: o.p.n, toPar: o.x.toPar }));
      const tied = st.filter(x => x.toPar === st[0].toPar);
      champ = tied.length > 1 ? { name: "A tie at the top", line: tied.map(x => x.name).join(" and ") + " at " + fmtPar(st[0].toPar) } : { name: st[0].name, line: `${fmtPar(st[0].toPar)}${st[1] ? `, ${last ? "won by" : "by"} ${st[1].toPar - st[0].toPar}` : ""}` };
    }
    champ.label = champ.name === "A tie at the top" ? "Tied at the top" : last ? "Champion" : "Leading the day";
    const low = rs.slice().sort((a, b) => a.x.strokes - b.x.strokes)[0];
    items.push({ k: "Low round", t: `${low.p.n}, ${low.x.strokes} (${fmtPar(low.x.toPar)})` });
    const birdies = rs.map(o => ({ o, n: o.x.scores.filter((v, i) => v != null && v < holes[i].par).length })).sort((a, b) => b.n - a.n);
    if (birdies[0].n) items.push({ k: "Most birdies", t: `${birdies[0].o.p.n}, ${birdies[0].n}` });
    let worst = null;
    rs.forEach(o => o.x.scores.forEach((v, i) => { if (v != null && (!worst || v - holes[i].par > worst.d)) worst = { p: o.p, v, h: i + 1, d: v - holes[i].par }; }));
    if (worst && worst.d >= 2) items.push({ k: "Worst hole", t: `${worst.p.n}'s ${worst.v} on the par ${holes[worst.h - 1].par} ${ordinal(worst.h)}` });
    // on the move: biggest climb from halfway (in each golfer's own order) to the finish
    const n = holeCount(ev);
    if (n === 18 && ps.length >= 3) {
      const half = rs.map(o => ({ id: o.p.id, v: o.x.order.slice(0, 9).reduce((a, h) => a + o.x.scores[h - 1] - holes[h - 1].par, 0) }));
      const place = (list, id) => { const me = list.find(x => x.id === id).v; return list.filter(x => x.v < me).length + 1; };
      const fin = rs.map(o => ({ id: o.p.id, v: o.x.toPar }));
      const moves = rs.map(o => ({ p: o.p, up: place(half, o.p.id) - place(fin, o.p.id) })).sort((a, b) => b.up - a.up);
      if (moves[0].up >= 2) items.push({ k: "On the move", t: `${moves[0].p.n}, up ${moves[0].up} spots on the back nine` });
    }
    // side games and the rest of the fun
    const sg = [];
    if (ev.bets) {
      const t = betTally(ev, r), top = Object.keys(t.bal).sort((a, b) => t.bal[b] - t.bal[a])[0];
      if (top && t.bal[top] > 0) sg.push(`${ev.p[top].n} up ${money(t.bal[top])}`);
    }
    ctpBoard(ev, r).forEach(x => { if (x.best) sg.push(`CTP ${x.h}: ${x.best.name}, ${fmtFeet(x.best.d)}`); });
    const bingo = ps.filter(p => bingoState(ev, p.id, r).line).map(p => p.n);
    if (bingo.length) sg.push("Bingo: " + bingo.join(", "));
    if (sg.length) items.push({ k: "Side games", t: sg.join(". ") });
    const title = (ev.rounds > 1 ? `Round ${r} recap` : "Round recap");
    let text = `${title}, ${ev.name}. ${champ.name === "A tie at the top" ? "A tie at the top: " + champ.line : champ.label + ": " + champ.name + ", " + champ.line}. ` + items.map(i => `${i.k}: ${i.t}.`).join(" ");
    if (text.length > 480) text = text.slice(0, 477) + "...";
    return { title, champ, items, text };
  }

  /* ---------- season race: points from every finished tournament this phone has followed this year ---------- */
  const SEASON_PTS = [500, 300, 190, 135, 110, 100, 90, 85, 80, 75, 70, 65, 60, 55, 50];
  function seasonRace(hist, year) {
    const rows = (Array.isArray(hist) ? hist : []).filter(h => h && typeof h.name === "string" && typeof h.code === "string" && Number.isFinite(h.toPar) && new Date(h.date || 0).getUTCFullYear() === year);
    const events = {}; rows.forEach(h => { (events[h.code] = events[h.code] || []).push(h); });
    const table = {};
    Object.keys(events).forEach(code => {
      const by = {}; events[code].forEach(h => { const k = cleanName(h.name).toLowerCase(); const o = by[k] = by[k] || { name: cleanName(h.name), toPar: 0, rounds: 0, tw: false, bonus: 0 }; o.toPar += h.toPar; o.rounds++; if (h.tw) o.tw = true; o.bonus += (h.sg ? 50 : 0) + (h.bg ? 25 : 0); });
      const list = Object.keys(by).map(k => Object.assign({ k }, by[k])), most = Math.max.apply(null, list.map(x => x.rounds));
      const full = list.filter(x => x.rounds === most).sort((a, b) => a.toPar - b.toPar);
      list.forEach(x => {
        const place = x.rounds === most ? full.filter(y => y.toPar < x.toPar).length + 1 : null;
        const pts = (place ? SEASON_PTS[place - 1] || 40 : 25) + (x.tw ? 100 : 0) + x.bonus;
        const t = table[x.k] = table[x.k] || { name: x.name, pts: 0, events: 0, wins: 0 };
        t.pts += pts; t.events++; if (place === 1) t.wins++;
      });
    });
    const out = Object.keys(table).map(k => table[k]).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.name.localeCompare(b.name));
    out.forEach((x, i) => { x.place = out.findIndex(y => y.pts === x.pts) + 1; });
    return { year, events: Object.keys(events).length, list: out };
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
    const bg = cleanBingo(d.bg, ev); if (Object.keys(bg).length) ev.bg = bg;
    const bets = cleanBets(d.bets, ev); if (bets && bets.on.length) ev.bets = bets;
    const bmk = cleanBetMarks(d.bm, ev); if (Object.keys(bmk).length) ev.bm = bmk;
    return ev;
  }
  // What one finished round looks like in this phone's history (for "previous rounds" on a player card).
  // tw: on the winning team once it's over; sg: the round's biggest side-game winner; bg: got a bingo. The season race counts them.
  function historyRows(ev, code) {
    const tb = ev.done ? teamBoard(ev).filter(t => t.holes) : [], winTeam = tb.length >= 2 && tb[0].toPar < tb[1].toPar ? tb[0] : null, topSg = {};
    for (let r = 1; r <= ev.rounds; r++) if (ev.bets) { const t = betTally(ev, r), top = Object.keys(t.bal).sort((a, b) => t.bal[b] - t.bal[a])[0]; if (top && t.bal[top] > 0) topSg[r] = top; }
    return players(ev).map(pl => {
      const out = [];
      for (let r = 1; r <= ev.rounds; r++) {
        const x = round(ev, pl, r); if (!x.done) continue;
        const row = { code, event: ev.name, course: ev.course.name, date: ev.created, r, strokes: x.strokes, toPar: x.toPar, name: pl.n };
        if (winTeam && winTeam.members.some(m => m.id === pl.id)) row.tw = true;
        if (topSg[r] === pl.id) row.sg = true;
        if (bingoState(ev, pl.id, r).line) row.bg = true;
        out.push(row);
      }
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
    reminders, icsFor, directions, cleanMsg, shout, BINGO, BINGO_AUTO, bingoCard, bingoState, cleanBingo,
    BETS, BET_AMTS, cleanBets, cleanBetMarks, betOn, betAmt, betPlayers, wolfOrder, wolfOf, betTally, money,
    TEE_SHOTS, cleanHoleNote, cleanHoleNotes, holeLine, nextHole, jackNoticed,
    JACK_LANGS, cleanJack, jackLevel, speakable, courseKey, cleanCourseNotes, holeTalk,
    roundDone, recap, seasonRace, SEASON_PTS };
});
