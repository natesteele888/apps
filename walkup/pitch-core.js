/* Walk-Up pitching: the pitch log, today's count for each pitcher, limits, warnings and rest days. Pure functions, no page.
   The log is a list of small events, each with its own id, so the phone and the watch can both add pitches while apart
   and merge later without counting anything twice: a merge keeps every event once (by id) and the counts are worked out
   from the events.
     { k: "p", p: pitcherId }            one pitch
     { k: "u", x: eventId }              undo of one pitch
     { k: "s", p: pitcherId, n: name }   this pitcher is now on the mound
   Counts are per calendar day, so a doubleheader adds up against the same daily max.
   The limits are MAC League's Spring daily max and rest-day tables, the same ones LYBS Ballclub uses. */
(function (root) {
  "use strict";
  var TIERS = [[1, 20, 0], [21, 35, 1], [36, 50, 2], [51, 65, 3], [66, 999, 4]];
  var RULES = {
    Majors: { dailyMax: 85, tiers: TIERS },
    Minors: { dailyMax: 75, tiers: TIERS },
    Juniors: { dailyMax: 95, tiers: TIERS },
    Seniors: { dailyMax: 105, tiers: [[1, 30, 0], [31, 45, 1], [46, 60, 2], [61, 80, 3], [81, 999, 4]] }
  };
  var DIVISIONS = ["Majors", "Minors", "Juniors", "Seniors", "None"];
  var LIM = { pitchers: 40, events: 4000, name: 40, keepDays: 3 };
  var ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(day, n) { var d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d.getTime()); }
  function uid(prefix) {
    var s = "", a = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < 10; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return (prefix || "e") + s;
  }
  function str(x, max) { return typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : ""; }
  function int(x, lo, hi, dflt) { var n = Math.round(Number(x)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; }

  function emptyLog() { return { v: 1, division: "Majors", max: 0, pitchers: [], setupAt: 0, events: [] }; }
  function sanitizePitcher(r, seen) {
    if (!r || typeof r !== "object") return null;
    var id = typeof r.id === "string" && ID_RE.test(r.id) && !seen[r.id] ? r.id : uid("p");
    var name = str(r.name, LIM.name);
    if (!name) return null;
    seen[id] = 1;
    return { id: id, name: name, limit: int(r.limit, 0, 200, 0), club: r.club === true };
  }
  function sanitizeEvent(r) {
    if (!r || typeof r !== "object" || typeof r.i !== "string" || !ID_RE.test(r.i)) return null;
    var t = Number(r.t);
    if (!isFinite(t) || t <= 0) return null;
    if (r.k === "p" && typeof r.p === "string" && ID_RE.test(r.p)) return { i: r.i, k: "p", p: r.p, t: t };
    if (r.k === "u" && typeof r.x === "string" && ID_RE.test(r.x)) return { i: r.i, k: "u", x: r.x, t: t };
    if (r.k === "s" && typeof r.p === "string" && ID_RE.test(r.p)) return { i: r.i, k: "s", p: r.p, n: str(r.n, LIM.name), t: t };
    return null;
  }
  function sanitize(raw) {
    var r = raw && typeof raw === "object" ? raw : {}, log = emptyLog(), seenP = {}, seenE = {};
    log.division = DIVISIONS.indexOf(r.division) >= 0 ? r.division : "Majors";
    log.max = int(r.max, 0, 200, 0);
    log.setupAt = int(r.setupAt, 0, 9e15, 0);
    log.pitchers = (Array.isArray(r.pitchers) ? r.pitchers : []).map(function (p) { return sanitizePitcher(p, seenP); }).filter(Boolean).slice(0, LIM.pitchers);
    log.events = (Array.isArray(r.events) ? r.events : []).map(sanitizeEvent).filter(function (e) { if (!e || seenE[e.i]) return false; seenE[e.i] = 1; return true; });
    log.events.sort(function (a, b) { return a.t - b.t || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0); });
    if (log.events.length > LIM.events) log.events = log.events.slice(log.events.length - LIM.events);
    return log;
  }
  /* Everything from both sides once. The pitcher list and limits come from whichever side changed them last.
     Events older than `cutoff` (a YYYY-MM-DD day) are left out: this side already added them up into its history. */
  function merge(mine, theirs, cutoff) {
    var a = sanitize(mine), b = sanitize(theirs), have = {}, added = 0;
    a.events.forEach(function (e) { have[e.i] = 1; });
    b.events.forEach(function (e) {
      if (have[e.i]) return;
      if (cutoff && ymd(e.t) < cutoff) return;
      have[e.i] = 1; a.events.push(e); added++;
    });
    var setup = false;
    if (b.setupAt > a.setupAt) { a.division = b.division; a.max = b.max; a.pitchers = b.pitchers; a.setupAt = b.setupAt; setup = true; }
    var out = sanitize(a);
    return { log: out, changed: added > 0 || setup, added: added };
  }

  function undoneSet(log) { var u = {}; log.events.forEach(function (e) { if (e.k === "u") u[e.x] = 1; }); return u; }
  /* { pitcherId: pitches } for one day */
  function counts(log, day) {
    var u = undoneSet(log), c = {};
    log.events.forEach(function (e) { if (e.k === "p" && !u[e.i] && ymd(e.t) === day) c[e.p] = (c[e.p] || 0) + 1; });
    return c;
  }
  function namesFromEvents(log) { var n = {}; log.events.forEach(function (e) { if (e.k === "s" && e.n) n[e.p] = e.n; }); return n; }
  function pitcherById(log, id) { for (var i = 0; i < log.pitchers.length; i++) if (log.pitchers[i].id === id) return log.pitchers[i]; return null; }
  function nameOf(log, id) { var p = pitcherById(log, id); return p ? p.name : (namesFromEvents(log)[id] || "Pitcher"); }
  /* who is on the mound today: the last "s" event today, or nobody */
  function current(log, day) {
    for (var i = log.events.length - 1; i >= 0; i--) {
      var e = log.events[i];
      if (ymd(e.t) !== day) continue;
      if (e.k === "s") return { id: e.p, name: nameOf(log, e.p) };
    }
    return null;
  }
  /* the smallest of the league's daily max, the team's own max and this pitcher's own limit; 0 means no limit at all */
  function limitFor(log, pitcherId) {
    var vals = [], r = RULES[log.division], p = pitcherById(log, pitcherId);
    if (r) vals.push(r.dailyMax);
    if (log.max > 0) vals.push(log.max);
    if (p && p.limit > 0) vals.push(p.limit);
    return vals.length ? Math.min.apply(null, vals) : 0;
  }
  /* green while well under, yellow at 10 left, red at 5 left, limit at 0 */
  function zone(left, limit) {
    if (!limit) return "green";
    if (left <= 0) return "limit";
    if (left <= 5) return "red";
    if (left <= 10) return "yellow";
    return "green";
  }
  function tiersOf(division) { var r = RULES[division]; return r ? r.tiers : null; }
  function restDaysFor(pitches, division) {
    var t = tiersOf(division); if (!t || pitches <= 0) return 0;
    for (var i = 0; i < t.length; i++) if (pitches >= t[i][0] && pitches <= t[i][1]) return t[i][2];
    return t[t.length - 1][2];
  }
  /* the next pitch count that adds a rest day: { at, rest } or null */
  function nextRestStep(pitches, division) {
    var t = tiersOf(division); if (!t) return null;
    var now = restDaysFor(pitches, division);
    for (var i = 0; i < t.length; i++) if (t[i][0] > pitches && t[i][2] > now) return { at: t[i][0], rest: t[i][2] };
    return null;
  }
  /* Ballclub's eligibility rules, from {date, pitches} appearances: rest days owed, and no pitching three days running. */
  function eligibility(apps, division, asOf) {
    var t = tiersOf(division); if (!t) return { eligible: true, eligibleOn: null };
    var sorted = (apps || []).filter(function (a) { return a && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.pitches > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var cutoff = addDays(asOf, -10), fromRest = null;
    sorted.forEach(function (a) {
      if (a.date < cutoff || a.date >= asOf) return;
      var on = addDays(a.date, restDaysFor(a.pitches, division) + 1);
      if (!fromRest || on > fromRest) fromRest = on;
    });
    var y = addDays(asOf, -1), y2 = addDays(asOf, -2);
    var both = sorted.some(function (a) { return a.date === y; }) && sorted.some(function (a) { return a.date === y2; });
    var cands = [fromRest, both ? addDays(asOf, 1) : null].filter(Boolean).sort();
    var on = cands.length ? cands[cands.length - 1] : null;
    var ok = !on || on <= asOf;
    return { eligible: ok, eligibleOn: ok ? null : on };
  }
  function canon(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  /* One row per pitcher for the bullpen: everyone on the list, plus anyone who pitched today but isn't on it.
     history: { "YYYY-MM-DD": { name: pitches } } from earlier days. club: { name: [{date, pitches}] } from Ballclub. */
  function bullpen(log, day, history, club) {
    var c = counts(log, day), rows = [], seen = {}, names = namesFromEvents(log);
    var apps = {};
    function addApp(name, date, n) { var k = canon(name); if (!k || !(n > 0)) return; (apps[k] = apps[k] || []).push({ date: date, pitches: n }); }
    Object.keys(history || {}).forEach(function (d) { var h = history[d] || {}; Object.keys(h).forEach(function (nm) { if (d !== day) addApp(nm, d, h[nm]); }); });
    Object.keys(club || {}).forEach(function (nm) { (club[nm] || []).forEach(function (a) { if (a && a.date !== day) addApp(nm, a.date, Number(a.pitches)); }); });
    function row(id, name) {
      var n = c[id] || 0, lim = limitFor(log, id), left = lim ? lim - n : 0;
      var el = eligibility(apps[canon(name)] || [], log.division, day);
      seen[id] = 1;
      rows.push({ id: id, name: name, count: n, limit: lim, left: left, zone: zone(left, lim), eligible: el.eligible, eligibleOn: el.eligibleOn, restAfter: restDaysFor(n, log.division) });
    }
    log.pitchers.forEach(function (p) { row(p.id, p.name); });
    Object.keys(c).forEach(function (id) { if (!seen[id]) row(id, names[id] || nameOf(log, id)); });
    return rows;
  }

  /* ---------- changes: each returns the new event, or null ---------- */
  function addPitch(log, pitcherId, now) { var e = { i: uid("e"), k: "p", p: pitcherId, t: now }; log.events.push(e); return e; }
  function setCurrent(log, pitcherId, name, now) { var e = { i: uid("e"), k: "s", p: pitcherId, n: str(name, LIM.name), t: now }; log.events.push(e); return e; }
  /* undo the newest pitch of this pitcher today that isn't undone yet */
  function undo(log, pitcherId, day, now) {
    var u = undoneSet(log);
    for (var i = log.events.length - 1; i >= 0; i--) {
      var e = log.events[i];
      if (e.k === "p" && e.p === pitcherId && !u[e.i] && ymd(e.t) === day) { var x = { i: uid("e"), k: "u", x: e.i, t: Math.max(now, e.t + 1) }; log.events.push(x); return x; }
    }
    return null;
  }
  /* Adds up days older than keepDays into history ({day: {name: pitches}}) and drops their events. Returns the cutoff day. */
  function rollup(log, history, today) {
    var cutoff = addDays(today, -LIM.keepDays), old = {}, u = undoneSet(log);
    var keep = log.events.filter(function (e) { return ymd(e.t) >= cutoff; });
    if (keep.length === log.events.length) return cutoff;
    log.events.forEach(function (e) {
      var d = ymd(e.t);
      if (d >= cutoff || e.k !== "p" || u[e.i]) return;
      var nm = nameOf(log, e.p);
      old[d] = old[d] || {}; old[d][nm] = (old[d][nm] || 0) + 1;
    });
    Object.keys(old).forEach(function (d) { history[d] = history[d] || {}; Object.keys(old[d]).forEach(function (nm) { history[d][nm] = (history[d][nm] || 0) + old[d][nm]; }); });
    log.events = keep;
    return cutoff;
  }
  /* today's totals for a log, as {name: pitches}, for history and for logging in Ballclub */
  function totals(log, day) { var c = counts(log, day), out = {}; Object.keys(c).forEach(function (id) { out[nameOf(log, id)] = c[id]; }); return out; }

  var API = {
    RULES: RULES, DIVISIONS: DIVISIONS, LIM: LIM, ymd: ymd, addDays: addDays, uid: uid, emptyLog: emptyLog, sanitize: sanitize, merge: merge,
    counts: counts, current: current, limitFor: limitFor, zone: zone, restDaysFor: restDaysFor, nextRestStep: nextRestStep,
    eligibility: eligibility, bullpen: bullpen, addPitch: addPitch, setCurrent: setCurrent, undo: undo, rollup: rollup, totals: totals,
    nameOf: nameOf, pitcherById: pitcherById, canon: canon
  };
  if (typeof module === "object" && module.exports) module.exports = API; else root.WalkupPitch = API;
})(typeof self !== "undefined" ? self : this);
