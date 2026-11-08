/* Scoreboard core: the game engine and every rule, with no DOM, so it can be tested on its own.
   Loaded before the UI files in the browser (window.SBCore) and by node tests (module.exports).

   A game is one plain object. apply(g, action) returns a NEW game (or the same object if nothing changed).
   step(g, action) = apply + remembers how to undo it. undo(g) puts back exactly what the last action changed.
   Clock actions carry their own timestamp (a.t), so nothing in here reads the real clock except step() as a fallback. */
(function (root) {
  "use strict";

  var VERSION = "Scoreboard v1";
  var UNDO_LIMIT = 100, MAX_SCORE = 999, MAX_MS = 5999 * 1000 + 999, MAX_PERIOD = 30, RECENT_LIMIT = 30;
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;

  var SPORTS = [
    { id: "basketball", label: "Basketball", icon: "🏀" },
    { id: "baseball", label: "Baseball / softball", icon: "⚾" },
    { id: "football", label: "Football", icon: "🏈" },
    { id: "generic", label: "Just keep score", icon: "🔢" }
  ];
  var SPORT_IDS = SPORTS.map(function (s) { return s.id; });
  function sportInfo(id) { return SPORTS.filter(function (s) { return s.id === id; })[0] || SPORTS[3]; }
  var COLORS = [
    { id: "cyan", name: "Cyan", hex: "#29d3e0" }, { id: "yellow", name: "Yellow", hex: "#ffc83d" },
    { id: "red", name: "Red", hex: "#ff5d4d" }, { id: "green", name: "Green", hex: "#4be07a" },
    { id: "blue", name: "Blue", hex: "#5b9bff" }, { id: "orange", name: "Orange", hex: "#ff9a3d" },
    { id: "purple", name: "Purple", hex: "#c78bff" }, { id: "white", name: "White", hex: "#f4f7f9" }
  ];
  var COLOR_HEX = COLORS.map(function (c) { return c.hex; });
  function colorName(hex) { var c = COLORS.filter(function (x) { return x.hex === hex; })[0]; return c ? c.name : "Color"; }

  /* ---------- small helpers ---------- */
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null ? "" : String(x));
    return s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
  }
  function int(x, lo, hi, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean") return def;
    var n = Math.round(Number(x));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function assign(o) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k]; } return o; }
  function set(g, ch) { return assign({}, g, ch); }
  function pair(arr, i, v) { return i ? [arr[0], v] : [v, arr[1]]; }
  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i] || 0; return s; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function isYMD(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(s) { if (!isYMD(s)) return ""; var p = s.split("-").map(Number); return MONTHS[p[1] - 1] + " " + p[2]; }
  function uid() {
    var s = "";
    try { var b = new Uint8Array(6); (root.crypto || {}).getRandomValues(b); for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36); }
    catch (e) { s = Math.random().toString(36).slice(2, 8); }
    return "g" + s + Date.now().toString(36).slice(-4);
  }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  /* ---------- rules (per sport) ---------- */
  var DEFAULTS = {
    basketball: { periods: 4, periodSec: 480, otSec: 180, bonusAt: 5, timeouts: 2, toReset: "half", foulReset: "period", otTimeouts: 1 },
    football: { periods: 4, periodSec: 720, otSec: 300, timeouts: 3, otTimeouts: 1, firstDown: 10 },
    baseball: { innings: 6, extra: true, mercyRuns: 0, mercyInning: 4, pitch: false },
    generic: {}
  };
  function sanitizeCfg(sport, c) {
    c = isObj(c) ? c : {};
    var d = DEFAULTS[sport] || {}, o = {};
    if (sport === "basketball") {
      o.periods = c.periods === 2 ? 2 : 4;
      o.periodSec = int(c.periodSec, 10, 5999, d.periodSec);
      o.otSec = int(c.otSec, 10, 5999, d.otSec);
      o.bonusAt = int(c.bonusAt, 0, 20, d.bonusAt);
      o.timeouts = int(c.timeouts, 0, 9, d.timeouts);
      o.toReset = c.toReset === "game" ? "game" : "half";
      o.foulReset = c.foulReset === "half" ? "half" : "period";
      o.otTimeouts = int(c.otTimeouts, 0, 9, d.otTimeouts);
    } else if (sport === "football") {
      o.periods = 4;
      o.periodSec = int(c.periodSec, 10, 5999, d.periodSec);
      o.otSec = int(c.otSec, 10, 5999, d.otSec);
      o.timeouts = int(c.timeouts, 0, 9, d.timeouts);
      o.otTimeouts = int(c.otTimeouts, 0, 9, d.otTimeouts);
      o.firstDown = int(c.firstDown, 1, 99, d.firstDown);
    } else if (sport === "baseball") {
      o.innings = int(c.innings, 1, 9, d.innings);
      o.extra = c.extra === undefined ? d.extra : c.extra === true;
      o.mercyRuns = int(c.mercyRuns, 0, 50, d.mercyRuns);
      o.mercyInning = int(c.mercyInning, 1, 9, d.mercyInning);
      o.pitch = c.pitch === true;
    }
    return o;
  }
  function sanitizeTeams(t) {
    var def = [{ n: "HOME", c: COLORS[0].hex }, { n: "AWAY", c: COLORS[1].hex }];
    return [0, 1].map(function (i) {
      var x = isObj(t && t[i]) ? t[i] : {};
      var n = str(x.n, 16).trim();
      return { n: n || def[i].n, c: COLOR_HEX.indexOf(x.c) >= 0 ? x.c : def[i].c };
    });
  }

  /* ---------- the clock (timestamp based) ----------
     {run:false, end:0, left:ms}  stopped with `left` ms on it
     {run:true,  end:T,  left:ms} running: it reaches zero at wall time T; `left` is what it had when it started */
  function stopped(ms) { return { run: false, end: 0, left: ms }; }
  function remaining(c, t) { return c.run ? Math.min(c.left, Math.max(0, c.end - t)) : c.left; }
  function freeze(c, t) { return c.run ? stopped(remaining(c, t)) : c; }
  function expired(c, t) { return !!c.run && t >= c.end; }
  /* true only if it hit zero just now; a clock that ran out while the phone slept should not buzz minutes later */
  function buzzDue(c, t, staleMs) { return !!c.run && t >= c.end && t - c.end <= (staleMs == null ? 4000 : staleMs); }
  function fmtClock(ms) {
    ms = Math.max(0, Math.floor(ms) || 0);
    if (ms >= 60000) { var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + pad2(s % 60); }
    if (ms === 0) return "0:00";
    var tn = Math.floor(ms / 100);
    return Math.floor(tn / 10) + "." + (tn % 10);
  }
  function clockApply(g, a) {
    var c = g.clock, t = a.t;
    if (typeof t !== "number" || !isFinite(t)) return g;
    var ms;
    switch (a.type) {
      case "clockStart": if (c.run || c.left <= 0) return g; return set(g, { clock: { run: true, end: t + c.left, left: c.left } });
      case "clockStop": if (!c.run) return g; return set(g, { clock: stopped(remaining(c, t)) });
      case "clockExpire": if (!expired(c, t)) return g; return set(g, { clock: stopped(0) });
      case "clockSet": ms = int(a.ms, 0, MAX_MS, null); if (ms === null) return g; break;
      case "clockAdjust": ms = clamp(remaining(c, t) + int(a.d, -MAX_MS, MAX_MS, 0), 0, MAX_MS); break;
      case "clockReset": ms = periodLen(g) * 1000; break;
      default: return g;
    }
    return set(g, { clock: c.run && ms > 0 ? { run: true, end: t + ms, left: ms } : stopped(ms) });
  }
  function periodLen(g) { return g.period > g.cfg.periods ? g.cfg.otSec : g.cfg.periodSec; }

  /* ---------- new game ---------- */
  function newGame(sport, o) {
    o = o || {};
    if (SPORT_IDS.indexOf(sport) < 0) sport = "generic";
    var cfg = sanitizeCfg(sport, o.cfg);
    var now = typeof o.now === "number" && isFinite(o.now) ? o.now : Date.now();
    var g = {
      v: 1, id: typeof o.id === "string" && ID_RE.test(o.id) ? o.id : uid(), sport: sport, created: now,
      date: isYMD(o.date) ? o.date : ymd(new Date(now)), cfg: cfg, teams: sanitizeTeams(o.teams), score: [0, 0], u: []
    };
    if (sport === "basketball" || sport === "football") {
      g.period = 1; g.clock = stopped(cfg.periodSec * 1000); g.to = [cfg.timeouts, cfg.timeouts]; g.poss = -1; g.pts = [];
      if (sport === "basketball") g.fouls = [0, 0];
      else { g.down = 1; g.togo = cfg.firstDown; g.ballOn = ""; }
    } else if (sport === "baseball") {
      g.inning = 1; g.half = "top"; g.balls = 0; g.strikes = 0; g.outs = 0;
      g.inn = [[0], [0]]; g.hits = [0, 0]; g.errs = [0, 0]; g.pitches = [0, 0]; g.final = false; g.onDeck = { name: "", num: "" };
    } else { g.label = ""; }
    return g;
  }

  /* ---------- periods (basketball, football) ---------- */
  function halfStart(g) { return g.cfg.periods / 2 + 1; }
  function periodApply(g, d) {
    if (d < 0) {
      if (g.period <= 1) return g;
      return set(g, { period: g.period - 1, pts: g.pts.slice(0, Math.max(0, g.period - 2)) });
    }
    if (g.period >= MAX_PERIOD) return g;
    var p = g.period + 1, cfg = g.cfg, ot = p > cfg.periods;
    var n = set(g, { period: p, clock: stopped((ot ? cfg.otSec : cfg.periodSec) * 1000), pts: g.pts.concat([[g.score[0] - sumCol(g.pts, 0), g.score[1] - sumCol(g.pts, 1)]]) });
    if (g.sport === "basketball" && (cfg.foulReset === "period" || ot || p === halfStart(g))) n.fouls = [0, 0];
    if (ot) n.to = [cfg.otTimeouts, cfg.otTimeouts];
    else if ((g.sport === "football" || cfg.toReset === "half") && p === halfStart(g)) n.to = [cfg.timeouts, cfg.timeouts];
    return n;
  }
  function sumCol(pts, i) { var s = 0; for (var k = 0; k < pts.length; k++) s += pts[k][i]; return s; }
  /* points per period: the finished ones plus whatever is on the board for the current one.
     If a score was corrected downward after a period ended, the raw difference for a later period can be negative;
     show it as zero and take the points off the earlier periods (latest first), so every column stays >= 0 and adds up to the score. */
  function periodScores(g) {
    var out = [], h = 0, a = 0, i, t, j;
    for (i = 0; i < g.period - 1; i++) {
      var p = g.pts[i] || [0, 0]; out.push([p[0], p[1]]); h += p[0]; a += p[1];
    }
    out.push([g.score[0] - h, g.score[1] - a]);
    for (t = 0; t < 2; t++) {
      for (i = out.length - 1; i > 0; i--) {
        if (out[i][t] >= 0) continue;
        var debt = -out[i][t]; out[i][t] = 0;
        for (j = i - 1; j >= 0 && debt > 0; j--) { var take = Math.min(Math.max(out[j][t], 0), debt); out[j][t] -= take; debt -= take; }
      }
    }
    return out;
  }
  function periodAbbr(g, p) {
    p = p || g.period;
    if (p > g.cfg.periods) { var k = p - g.cfg.periods; return k === 1 ? "OT" : k + "OT"; }
    return g.cfg.periods === 2 ? p + "H" : "Q" + p;
  }
  function periodWord(g, p) {
    p = p || g.period;
    if (p > g.cfg.periods) { var k = p - g.cfg.periods; return k === 1 ? "Overtime" : "Overtime " + k; }
    return g.cfg.periods === 2 ? "Half " + p : "Quarter " + p;
  }
  function bonus(g) { var b = g.cfg.bonusAt; return b > 0 ? [g.fouls[1] >= b, g.fouls[0] >= b] : [false, false]; }
  function possNext(g, t) { return t === "flip" ? (g.poss < 0 ? 0 : 1 - g.poss) : (t === 0 || t === 1 ? t : -1); }

  /* ---------- baseball ---------- */
  function batIdx(g) { return g.half === "top" ? 1 : 0; }  // away bats in the top, home in the bottom
  function growInn(inn, k) {
    return inn.map(function (r) { if (r.length >= k) return r; var x = r.slice(); while (x.length < k) x.push(0); return x; });
  }
  function bsEndHalf(n) {
    n.balls = 0; n.strikes = 0; n.outs = 0;
    var cfg = n.cfg, home = n.score[0], away = n.score[1];
    if (n.half === "top") {
      if (n.inning >= cfg.innings && home > away) { n.final = true; return; }
      n.half = "bot";
    } else {
      if (n.inning >= cfg.innings && (home !== away || !cfg.extra)) { n.final = true; return; }
      n.half = "top"; n.inning += 1; n.inn = growInn(n.inn, n.inning);
    }
  }
  function bsAddOut(n) { n.balls = 0; n.strikes = 0; n.outs += 1; if (n.outs >= 3) bsEndHalf(n); }
  function sums(inn) { return [sum(inn[0]), sum(inn[1])]; }
  /* mercy rule: runs ahead N once M innings are done (or M-1 and the top half when home leads). Only ever a banner. */
  function mercy(g) {
    if (g.sport !== "baseball" || !(g.cfg.mercyRuns > 0)) return false;
    var halves = 2 * (g.inning - 1) + (g.half === "bot" ? 1 : 0), m = g.cfg.mercyInning, diff = g.score[0] - g.score[1];
    if (halves >= 2 * m) return Math.abs(diff) >= g.cfg.mercyRuns;
    if (halves === 2 * m - 1) return diff >= g.cfg.mercyRuns;
    return false;
  }
  function bsApply(g, a) {
    var T = a.type;
    if (g.final && T !== "run" && T !== "set" && T !== "reopen" && T !== "setInning" && T !== "onDeck") return g;
    var n = assign({}, g), B = batIdx(g), F = 1 - B;
    var pitchUp = function () { if (g.cfg.pitch) n.pitches = pair(n.pitches, F, Math.min(999, n.pitches[F] + 1)); };
    var tm = a.team === 0 || a.team === 1 ? a.team : null;
    switch (T) {
      case "ball": pitchUp(); n.balls = g.balls + 1; if (n.balls >= 4) { n.balls = 0; n.strikes = 0; } return n;
      case "strike": pitchUp(); n.strikes = g.strikes + 1; if (n.strikes >= 3) bsAddOut(n); return n;
      case "foul": if (g.strikes >= 2 && !g.cfg.pitch) return g; pitchUp(); if (g.strikes < 2) n.strikes = g.strikes + 1; return n;
      case "out": pitchUp(); bsAddOut(n); return n;
      case "hit": n.hits = pair(g.hits, tm === null ? B : tm, Math.min(99, g.hits[tm === null ? B : tm] + 1)); n.balls = 0; n.strikes = 0; pitchUp(); return n;
      case "error": n.errs = pair(g.errs, tm === null ? F : tm, Math.min(99, g.errs[tm === null ? F : tm] + 1)); n.balls = 0; n.strikes = 0; pitchUp(); return n;
      case "endHalf": bsEndHalf(n); return n;
      case "run": {
        var d = int(a.d, -99, 99, 1), idx = g.inning - 1, row = g.inn[B].slice(), cur = row[idx] || 0, v = clamp(cur + d, 0, 99);
        if (v === cur) return g;
        row[idx] = v; n.inn = B ? [g.inn[0], row] : [row, g.inn[1]]; n.score = sums(n.inn);
        if (!g.final && d > 0 && g.half === "bot" && g.inning >= g.cfg.innings && n.score[0] > n.score[1]) n.final = true; // walk-off
        return n;
      }
      case "setInning": {
        var inn = int(a.inning, 1, MAX_PERIOD, null), half = a.half === "bot" ? "bot" : "top";
        if (inn === null || (inn === g.inning && half === g.half && !g.final && !g.balls && !g.strikes && !g.outs)) return g;
        n.inning = inn; n.half = half; n.balls = 0; n.strikes = 0; n.outs = 0; n.final = false; n.inn = growInn(g.inn, inn); return n;
      }
      case "reopen": if (!g.final) return g; n.final = false; return n;
      case "set": return setApply(g, a);
      case "onDeck": {
        var nm = str(a.name, 24).trim(), nu = str(a.num, 4).trim();
        if (nm === g.onDeck.name && nu === g.onDeck.num) return g;
        return set(g, { onDeck: { name: nm, num: nu } });
      }
    }
    return g;
  }

  /* ---------- fix-up numbers: one action covers every counter ---------- */
  function setApply(g, a) {
    var i = a.team === 1 ? 1 : 0, k = a.k, cur, v;
    switch (k) {
      case "score": if (g.sport === "baseball") return g; cur = g.score[i]; v = int(a.v, 0, MAX_SCORE, cur); if (v === cur) return g; return set(g, { score: pair(g.score, i, v) });
      case "fouls": if (g.sport !== "basketball") return g; cur = g.fouls[i]; v = int(a.v, 0, 99, cur); if (v === cur) return g; return set(g, { fouls: pair(g.fouls, i, v) });
      case "to": if (!g.to) return g; cur = g.to[i]; v = int(a.v, 0, 9, cur); if (v === cur) return g; return set(g, { to: pair(g.to, i, v) });
      case "hits": if (g.sport !== "baseball") return g; cur = g.hits[i]; v = int(a.v, 0, 99, cur); if (v === cur) return g; return set(g, { hits: pair(g.hits, i, v) });
      case "errs": if (g.sport !== "baseball") return g; cur = g.errs[i]; v = int(a.v, 0, 99, cur); if (v === cur) return g; return set(g, { errs: pair(g.errs, i, v) });
      case "pitches": if (g.sport !== "baseball") return g; cur = g.pitches[i]; v = int(a.v, 0, 999, cur); if (v === cur) return g; return set(g, { pitches: pair(g.pitches, i, v) });
      case "inn": {
        if (g.sport !== "baseball") return g;
        var x = int(a.i, 0, g.inning - 1, null); if (x === null) return g;
        cur = g.inn[i][x] || 0; v = int(a.v, 0, 99, cur); if (v === cur) return g;
        var row = g.inn[i].slice(); row[x] = v;
        var inn = i ? [g.inn[0], row] : [row, g.inn[1]];
        return set(g, { inn: inn, score: sums(inn) });
      }
    }
    return g;
  }

  /* ---------- apply: the reducer ---------- */
  function applyCfg(g, c) {
    var cfg = sanitizeCfg(g.sport, assign({}, g.cfg, isObj(c) ? c : {}));
    if (JSON.stringify(cfg) === JSON.stringify(g.cfg)) return g;
    var n = set(g, { cfg: cfg });
    if (g.clock) {
      // a clock still sitting untouched at the full length follows the new length
      var oldLen = periodLen(g) * 1000;
      if (!g.clock.run && g.clock.left === oldLen) n.clock = stopped(periodLen(n) * 1000);
    }
    if (g.to && cfg.timeouts !== g.cfg.timeouts && g.period <= cfg.periods) {
      var dt = cfg.timeouts - g.cfg.timeouts;
      n.to = [clamp(g.to[0] + dt, 0, cfg.timeouts), clamp(g.to[1] + dt, 0, cfg.timeouts)];
    }
    return n;
  }
  function apply(g, a) {
    if (!isObj(g) || !isObj(a) || typeof a.type !== "string") return g;
    var T = a.type, sp = g.sport, i = a.team === 1 ? 1 : 0;
    if (T === "team") {
      var t = g.teams[i], nn = a.n === undefined ? t.n : (str(a.n, 16).trim() || t.n), cc = COLOR_HEX.indexOf(a.c) >= 0 ? a.c : t.c;
      if (nn === t.n && cc === t.c) return g;
      var teams = g.teams.slice(); teams[i] = { n: nn, c: cc }; return set(g, { teams: teams });
    }
    if (T === "cfg") return applyCfg(g, a.cfg);
    if (T.indexOf("clock") === 0) return g.clock ? clockApply(g, a) : g;
    if (T === "score" && sp !== "baseball") {
      var v = clamp(g.score[i] + int(a.d, -99, 99, 0), 0, MAX_SCORE);
      return v === g.score[i] ? g : set(g, { score: pair(g.score, i, v) });
    }
    if (T === "set" && sp !== "baseball") return setApply(g, a);
    if (sp === "baseball") return bsApply(g, a);
    if (sp === "generic") {
      if (T === "plabel") { var lb = str(a.text, 24).trim(); return lb === g.label ? g : set(g, { label: lb }); }
      return g;
    }
    // basketball and football share periods, timeouts, possession
    switch (T) {
      case "period": return periodApply(g, int(a.d, -1, 1, 1));
      case "timeout": { var tv = clamp(g.to[i] + int(a.d, -1, 1, -1), 0, 9); return tv === g.to[i] ? g : set(g, { to: pair(g.to, i, tv) }); }
      case "poss": { var pv = possNext(g, a.team); return pv === g.poss ? g : set(g, { poss: pv }); }
    }
    if (sp === "basketball" && T === "foul") {
      var fv = clamp(g.fouls[i] + int(a.d, -1, 1, 1), 0, 99);
      return fv === g.fouls[i] ? g : set(g, { fouls: pair(g.fouls, i, fv) });
    }
    if (sp === "football") {
      var fd = g.cfg.firstDown;
      switch (T) {
        case "nextDown": return g.down < 4 ? set(g, { down: g.down + 1 }) : turnover(g);
        case "turnover": return turnover(g);
        case "firstDown": return g.down === 1 && g.togo === fd ? g : set(g, { down: 1, togo: fd });
        case "down": { var dn = int(a.n, 1, 4, g.down); return dn === g.down ? g : set(g, { down: dn }); }
        case "togo": { var tg = a.n !== undefined ? int(a.n, 0, 99, g.togo) : clamp(g.togo + int(a.d, -99, 99, 0), 0, 99); return tg === g.togo ? g : set(g, { togo: tg }); }
        case "ballOn": { var bo = str(a.text, 12).trim(); return bo === g.ballOn ? g : set(g, { ballOn: bo }); }
      }
    }
    return g;
  }
  function turnover(g) { return set(g, { poss: g.poss < 0 ? -1 : 1 - g.poss, down: 1, togo: g.cfg.firstDown, ballOn: "" }); }

  /* ---------- undo ---------- */
  var UNDOABLE = {};
  ["score", "foul", "timeout", "period", "poss", "ball", "strike", "out", "run", "hit", "error", "endHalf", "setInning", "reopen", "set",
    "nextDown", "turnover", "firstDown", "down", "togo", "ballOn"].forEach(function (k) { UNDOABLE[k] = 1; });
  function step(g, a) {
    var n = apply(g, a);
    if (n === g) return g;
    if (!UNDOABLE[a.type]) return n;
    var t = typeof a.t === "number" && isFinite(a.t) ? a.t : Date.now(), p = {}, any = false;
    for (var k in n) {
      if (k === "u" || !Object.prototype.hasOwnProperty.call(n, k)) continue;
      if (JSON.stringify(n[k]) !== JSON.stringify(g[k])) { p[k] = k === "clock" ? freeze(g.clock, t) : g[k]; any = true; }
    }
    if (!any) return g;
    n.u = g.u.concat([{ l: label(g, a), p: p }]);
    if (n.u.length > UNDO_LIMIT) n.u = n.u.slice(n.u.length - UNDO_LIMIT);
    return n;
  }
  function canUndo(g) { return !!g && g.u.length > 0; }
  function undo(g) {
    if (!canUndo(g)) return g;
    var e = g.u[g.u.length - 1], n = assign({}, g, e.p);
    n.u = g.u.slice(0, -1);
    return sanitizeGame(n) || g;
  }
  function undoLog(g) { return g.u.slice().reverse().map(function (e) { return e.l; }); }

  /* ---------- words ---------- */
  function signed(d) { return (d < 0 ? "-" : "+") + Math.abs(d); }
  function label(g, a) {
    var i = a.team === 1 ? 1 : 0, nm = g.teams[i].n, d = int(a.d, -99, 99, 0), B = g.sport === "baseball" ? batIdx(g) : 0;
    switch (a.type) {
      case "score": return nm + " " + signed(d);
      case "foul": return g.sport === "baseball" ? "Foul ball" : nm + (int(a.d, -1, 1, 1) < 0 ? " foul removed" : " foul");
      case "timeout": return nm + (int(a.d, -1, 1, -1) > 0 ? " timeout given back" : " timeout");
      case "period": return int(a.d, -1, 1, 1) < 0 ? "Back to " + periodWord(g, g.period - 1).toLowerCase() : "Start " + periodWord(g, g.period + 1).toLowerCase();
      case "poss": { var pv = possNext(g, a.team); return pv < 0 ? "Possession cleared" : "Possession: " + g.teams[pv].n; }
      case "ball": return g.balls === 3 ? "Ball four (walk)" : "Ball";
      case "strike": return g.strikes === 2 ? "Strike three (out)" : "Strike";
      case "out": return "Out";
      case "run": return g.teams[B].n + " run " + signed(int(a.d, -99, 99, 1));
      case "hit": return g.teams[a.team === 0 || a.team === 1 ? a.team : B].n + " hit";
      case "error": return g.teams[a.team === 0 || a.team === 1 ? a.team : 1 - B].n + " error";
      case "endHalf": return "End of the " + (g.half === "top" ? "top" : "bottom") + " of the " + ordinal(g.inning);
      case "setInning": return "Jump to " + (a.half === "bot" ? "bottom" : "top") + " of the " + ordinal(int(a.inning, 1, MAX_PERIOD, 1));
      case "reopen": return "Game not over";
      case "clockStart": return "Clock started";
      case "clockStop": return "Clock stopped";
      case "clockSet": return "Clock set to " + fmtClock(int(a.ms, 0, MAX_MS, 0));
      case "clockAdjust": return "Clock adjusted";
      case "clockReset": return "Clock reset";
      case "clockExpire": return "Time";
      case "team": return "Team changed";
      case "cfg": return "Rules changed";
      case "plabel": return "Label changed";
      case "nextDown": return g.down < 4 ? "Down " + (g.down + 1) : "Turnover on downs";
      case "turnover": return "Turnover";
      case "firstDown": return "First down";
      case "down": return "Down set to " + int(a.n, 1, 4, g.down);
      case "togo": return "Yards to go: " + (a.n !== undefined ? int(a.n, 0, 99, g.togo) : clamp(g.togo + int(a.d, -99, 99, 0), 0, 99));
      case "ballOn": return "Ball on " + (str(a.text, 12).trim() || "(blank)");
      case "set": {
        var names = { score: "score", fouls: "fouls", to: "timeouts", hits: "hits", errs: "errors", pitches: "pitches", inn: "runs, inning " + (int(a.i, 0, 99, 0) + 1) };
        return "Fixed " + g.teams[i].n + " " + (names[a.k] || "number") + " to " + int(a.v, 0, 999, 0);
      }
    }
    return str(a.type, 30);
  }
  /* what should flash on the board after this action (baseball), or null */
  function flashFor(p, n, a) {
    if (p.sport !== "baseball" || p === n) return null;
    if (n.final && !p.final) return "FINAL";
    if (mercy(n) && !mercy(p)) return "MERCY";
    if (n.half !== p.half || n.inning !== p.inning) return a.type === "setInning" ? null : "SIDE";
    if (a.type === "strike" && p.strikes === 2) return "K";
    if (a.type === "out") return "OUT";
    if (a.type === "ball" && p.balls === 3) return "BB";
    return null;
  }

  /* ---------- line score, status, result text ---------- */
  function lineScore(g) {
    var rows, cols, i;
    if (g.sport === "baseball") {
      var k = Math.max(g.cfg.innings, g.inning);
      cols = []; for (i = 1; i <= k; i++) cols.push(String(i));
      var cell = function (team, x) {
        var played;
        if (team === 1) played = x + 1 <= g.inning;
        else played = x + 1 < g.inning || (x + 1 === g.inning && g.half === "bot");
        if (played) return String(g.inn[team][x] || 0);
        if (team === 0 && g.final && x + 1 === g.inning && g.half === "top") return "X";
        return "";
      };
      rows = [1, 0].map(function (t) {
        var cells = []; for (var x = 0; x < k; x++) cells.push(cell(t, x));
        return { team: t, name: g.teams[t].n, cells: cells, r: g.score[t], h: g.hits[t], e: g.errs[t] };
      });
      return { cols: cols, rows: rows, hasHE: true };
    }
    if (g.sport === "basketball" || g.sport === "football") {
      var ps = periodScores(g);
      cols = ps.map(function (x, idx) { var p = idx + 1; return p > g.cfg.periods ? (p - g.cfg.periods === 1 ? "OT" : (p - g.cfg.periods) + "OT") : String(p); });
      rows = [1, 0].map(function (t) { return { team: t, name: g.teams[t].n, cells: ps.map(function (x) { return String(x[t]); }), r: g.score[t] }; });
      return { cols: cols, rows: rows, hasHE: false };
    }
    return null;
  }
  function statusText(g, status) {
    var b = g.sport === "baseball";
    if (status === "live") return progressText(g);
    if (status === "stopped") {
      if (b) return "Stopped, " + (g.half === "top" ? "top" : "bottom") + " of the " + ordinal(g.inning);
      if (g.sport === "generic") return g.label ? "Stopped, " + g.label : "Stopped";
      return "Stopped in " + periodAbbr(g);
    }
    if (b) return "Final, " + g.inning + (g.inning === 1 ? " inning" : " innings");
    if (g.sport === "generic") return "Final";
    return g.period > g.cfg.periods ? "Final/" + periodAbbr(g) : "Final";
  }
  /* "HOME 7, AWAY 4 (Final, 6 innings)" plus one line per team. Winner first; a tie lists home first. */
  function resultText(g, status) {
    var w = g.score[1] > g.score[0] ? 1 : 0, A = g.teams[w], Bm = g.teams[1 - w];
    var s = A.n + " " + g.score[w] + ", " + Bm.n + " " + g.score[1 - w] + " (" + statusText(g, status || "final") + ")";
    var ls = lineScore(g);
    if (ls) ls.rows.forEach(function (r) {
      var cells = r.cells.filter(function (c) { return c !== ""; }).join(" ");
      s += "\n" + r.name + ": " + cells + " = " + r.r + (ls.hasHE ? " R, " + r.h + " H, " + r.e + " E" : "");
    });
    return s;
  }
  function summary(g) { return g.teams[0].n + " " + g.score[0] + " - " + g.score[1] + " " + g.teams[1].n; }
  /* where a game in progress stands, for the Resume card */
  function progressText(g) {
    if (g.sport === "baseball") return g.final ? statusText(g, "final") : (g.half === "top" ? "Top " : "Bottom ") + ordinal(g.inning);
    if (g.sport === "generic") return g.label || "In progress";
    return periodWord(g) + ", " + fmtClock(g.clock.run ? remaining(g.clock, Date.now()) : g.clock.left);
  }

  /* ---------- sanitize (anything read from storage or a backup file) ---------- */
  var PATCH_KEYS = ["score", "teams", "cfg", "period", "clock", "fouls", "to", "poss", "pts", "down", "togo", "ballOn", "inning", "half", "balls", "strikes", "outs", "inn", "hits", "errs", "pitches", "final", "label"];
  function intPair(x, lo, hi, d0, d1) { x = Array.isArray(x) ? x : []; return [int(x[0], lo, hi, d0), int(x[1], lo, hi, d1)]; }
  function sanitizeUndo(u) {
    if (!Array.isArray(u)) return [];
    return u.slice(-UNDO_LIMIT).filter(function (e) {
      return isObj(e) && typeof e.l === "string" && isObj(e.p) && Object.keys(e.p).every(function (k) { return PATCH_KEYS.indexOf(k) >= 0; });
    }).map(function (e) { return { l: str(e.l, 80), p: e.p }; });
  }
  function sanitizeGame(raw) {
    if (!isObj(raw) || SPORT_IDS.indexOf(raw.sport) < 0) return null;
    var sp = raw.sport;
    var g = newGame(sp, { id: raw.id, cfg: raw.cfg, teams: raw.teams, now: typeof raw.created === "number" && isFinite(raw.created) ? raw.created : undefined, date: raw.date });
    g.created = typeof raw.created === "number" && isFinite(raw.created) ? raw.created : g.created;
    if (sp !== "baseball") g.score = intPair(raw.score, 0, MAX_SCORE, 0, 0);
    if (sp === "basketball" || sp === "football") {
      g.period = int(raw.period, 1, MAX_PERIOD, 1);
      var cl = isObj(raw.clock) ? raw.clock : {};
      g.clock = cl.run === true && typeof cl.end === "number" && isFinite(cl.end) && typeof cl.left === "number" && isFinite(cl.left)
        ? { run: true, end: cl.end, left: int(cl.left, 0, MAX_MS, 0) }
        : stopped(int(cl.left, 0, MAX_MS, periodLen(g) * 1000));
      g.to = intPair(raw.to, 0, 9, g.cfg.timeouts, g.cfg.timeouts);
      g.poss = int(raw.poss, -1, 1, -1);
      g.pts = (Array.isArray(raw.pts) ? raw.pts : []).slice(0, g.period - 1).map(function (x) { return intPair(x, -MAX_SCORE, MAX_SCORE, 0, 0); });
      while (g.pts.length < g.period - 1) g.pts.push([0, 0]);
      if (sp === "basketball") g.fouls = intPair(raw.fouls, 0, 99, 0, 0);
      else { g.down = int(raw.down, 1, 4, 1); g.togo = int(raw.togo, 0, 99, g.cfg.firstDown); g.ballOn = str(raw.ballOn, 12).trim(); }
    } else if (sp === "baseball") {
      g.inning = int(raw.inning, 1, MAX_PERIOD, 1); g.half = raw.half === "bot" ? "bot" : "top";
      g.balls = int(raw.balls, 0, 3, 0); g.strikes = int(raw.strikes, 0, 2, 0); g.outs = int(raw.outs, 0, 2, 0);
      var rin = Array.isArray(raw.inn) ? raw.inn : [];
      g.inn = [0, 1].map(function (t) { var r = Array.isArray(rin[t]) ? rin[t].slice(0, MAX_PERIOD) : []; return r.map(function (x) { return int(x, 0, 99, 0); }); });
      g.inn = growInn(g.inn, g.inning);
      g.score = sums(g.inn);
      g.hits = intPair(raw.hits, 0, 99, 0, 0); g.errs = intPair(raw.errs, 0, 99, 0, 0); g.pitches = intPair(raw.pitches, 0, 999, 0, 0);
      g.final = raw.final === true;
      var od = isObj(raw.onDeck) ? raw.onDeck : {};
      g.onDeck = { name: str(od.name, 24).trim(), num: str(od.num, 4).trim() };
    } else { g.label = str(raw.label, 24).trim(); }
    g.u = sanitizeUndo(raw.u);
    return g;
  }

  /* ---------- finished games, preferences, backups ---------- */
  function makeRecent(g, status, now, sample) {
    var c = sanitizeGame(assign({}, g, { u: [], clock: g.clock ? freeze(g.clock, now) : undefined }));
    c.status = status === "stopped" ? "stopped" : "final";
    c.ended = typeof now === "number" && isFinite(now) ? now : Date.now();
    if (sample) c.sample = true;
    return c;
  }
  function sanitizeRecent(raw) {
    var g = sanitizeGame(assign({}, isObj(raw) ? raw : {}, { u: [] }));
    if (!g) return null;
    if (g.clock) g.clock = freeze(g.clock, 0);
    g.status = raw.status === "stopped" ? "stopped" : "final";
    g.ended = typeof raw.ended === "number" && isFinite(raw.ended) ? raw.ended : g.created;
    if (raw.sample === true) g.sample = true;
    return g;
  }
  function addRecent(list, entry) {
    var out = [entry].concat(list.filter(function (x) { return x.id !== entry.id; }));
    return out.slice(0, RECENT_LIMIT);
  }
  function defaultPrefs() {
    var cfg = {}; SPORT_IDS.forEach(function (s) { cfg[s] = sanitizeCfg(s, {}); });
    return { sound: true, loud: false, teams: sanitizeTeams(), cfg: cfg, lastBackup: null };
  }
  function sanitizePrefs(p) {
    p = isObj(p) ? p : {};
    var o = defaultPrefs(), cfg = isObj(p.cfg) ? p.cfg : {};
    o.sound = p.sound !== false; o.loud = p.loud === true;
    o.teams = sanitizeTeams(p.teams);
    SPORT_IDS.forEach(function (s) { o.cfg[s] = sanitizeCfg(s, cfg[s]); });
    o.lastBackup = isYMD(p.lastBackup) ? p.lastBackup : null;
    return o;
  }
  function makeBackup(prefs, recent, now) {
    var p = sanitizePrefs(prefs); p.lastBackup = null;
    return { app: "scoreboard", v: 1, saved: new Date(typeof now === "number" ? now : Date.now()).toISOString(), prefs: p, recent: recent.slice(0, RECENT_LIMIT).map(function (g) { return sanitizeRecent(g); }).filter(Boolean) };
  }
  function validateBackup(obj) {
    if (!isObj(obj)) return { ok: false, error: "That file isn't a Scoreboard backup." };
    if (obj.app !== "scoreboard") return { ok: false, error: "That file isn't a Scoreboard backup." };
    if (obj.v !== 1) return { ok: false, error: "That backup is from a newer version of Scoreboard that this one can't read." };
    if (!Array.isArray(obj.recent)) return { ok: false, error: "That backup has no games list, so it looks damaged." };
    var seen = {}, recent = [];
    obj.recent.slice(0, RECENT_LIMIT).forEach(function (x) { var g = sanitizeRecent(x); if (g && !seen[g.id]) { seen[g.id] = 1; recent.push(g); } });
    return { ok: true, prefs: sanitizePrefs(obj.prefs), recent: recent, skipped: Math.min(obj.recent.length, RECENT_LIMIT) - recent.length };
  }

  /* three finished placeholder games, so the first screen is not empty */
  function sampleGames(today, now) {
    now = typeof now === "number" ? now : Date.now();
    var d = function (back) { var p = String(today).split("-").map(Number), x = new Date(p[0], p[1] - 1, p[2] - back); return ymd(x); };
    var A = { n: "TEAM A", c: COLORS[0].hex }, Bt = { n: "TEAM B", c: COLORS[1].hex };
    var bb = newGame("basketball", { id: "sample-bball", now: now - 3000, date: d(1), teams: [A, Bt] });
    bb.period = 4; bb.score = [48, 41]; bb.pts = [[10, 12], [14, 9], [12, 8]]; bb.fouls = [3, 4]; bb.to = [0, 1]; bb.clock = stopped(0);
    var bs = newGame("baseball", { id: "sample-base", now: now - 2000, date: d(3), teams: [A, Bt] });
    bs.inning = 6; bs.half = "bot"; bs.inn = [[0, 2, 0, 1, 3, 0], [1, 0, 0, 2, 0, 0]]; bs.score = [6, 3]; bs.hits = [7, 4]; bs.errs = [1, 2]; bs.final = true;
    var fb = newGame("football", { id: "sample-foot", now: now - 1000, date: d(6), teams: [A, Bt] });
    fb.period = 4; fb.score = [21, 14]; fb.pts = [[7, 0], [6, 7], [0, 7]]; fb.to = [1, 2]; fb.clock = stopped(0);
    return [fb, bs, bb].map(function (g, idx) { return makeRecent(g, "final", now - idx * 1000, true); });
  }

  var api = {
    VERSION: VERSION, SPORTS: SPORTS, SPORT_IDS: SPORT_IDS, sportInfo: sportInfo, COLORS: COLORS, COLOR_HEX: COLOR_HEX, colorName: colorName,
    DEFAULTS: DEFAULTS, UNDO_LIMIT: UNDO_LIMIT, RECENT_LIMIT: RECENT_LIMIT, MAX_SCORE: MAX_SCORE, MAX_MS: MAX_MS,
    isObj: isObj, str: str, int: int, isYMD: isYMD, ymd: ymd, fmtDate: fmtDate, ordinal: ordinal, uid: uid,
    sanitizeCfg: sanitizeCfg, sanitizeTeams: sanitizeTeams, newGame: newGame, apply: apply, step: step, undo: undo, canUndo: canUndo, undoLog: undoLog,
    stopped: stopped, remaining: remaining, freeze: freeze, expired: expired, buzzDue: buzzDue, fmtClock: fmtClock, periodLen: periodLen,
    periodScores: periodScores, periodAbbr: periodAbbr, periodWord: periodWord, bonus: bonus, batIdx: batIdx, mercy: mercy,
    label: label, flashFor: flashFor, lineScore: lineScore, statusText: statusText, resultText: resultText, summary: summary, progressText: progressText,
    sanitizeGame: sanitizeGame, makeRecent: makeRecent, sanitizeRecent: sanitizeRecent, addRecent: addRecent,
    defaultPrefs: defaultPrefs, sanitizePrefs: sanitizePrefs, makeBackup: makeBackup, validateBackup: validateBackup, sampleGames: sampleGames
  };
  root.SBCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
