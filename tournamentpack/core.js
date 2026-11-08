/* Tournament Pack core: pure logic with no DOM, so it can be tested on its own.
   Loaded before the app files in the browser (window.TPCore) and by node tests (module.exports).
   Dates are plain "YYYY-MM-DD" strings and times are "HH:MM" (24 hour) strings, no timezones. */
(function (root) {
  "use strict";

  var VERSION = "Tournament Pack v1";
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  var SLOT_RE = /^r[1-3]m[1-4]$/;

  var SPORTS = [
    { id: "baseball", label: "Baseball", icon: "⚾", unit: "runs", gameMin: 90 },
    { id: "softball", label: "Softball", icon: "🥎", unit: "runs", gameMin: 90 },
    { id: "basketball", label: "Basketball", icon: "🏀", unit: "points", gameMin: 60 }
  ];
  function sportInfo(id) { return SPORTS.filter(function (s) { return s.id === id; })[0] || SPORTS[0]; }

  /* ---------- small helpers ---------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null ? "" : String(x));
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
  }
  function int(x, lo, hi, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean") return def;
    var n = Math.round(Number(x));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function uid() {
    var s = "";
    try {
      var b = new Uint8Array(6); (root.crypto || {}).getRandomValues(b);
      for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36);
    } catch (e) { s = Math.random().toString(36).slice(2, 8); }
    return s + Date.now().toString(36).slice(-4);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  /* ---------- dates and times ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toUTC(s) {
    var p = s.split("-"), y = +p[0], m = +p[1], d = +p[2];
    var t = Date.UTC(y, m - 1, d), dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
    return t;
  }
  function isYMD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 1900 && +s.slice(0, 4) <= 2200 && !isNaN(toUTC(s));
  }
  function fromUTC(t) { var d = new Date(t); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function addDays(s, n) { return fromUTC(toUTC(s) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }
  function weekday(s) { return new Date(toUTC(s)).getUTCDay(); }
  function localToday() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  /* Tests (and nothing else) can set window.__today = "YYYY-MM-DD" and window.__now = "YYYY-MM-DDTHH:MM". */
  function todayStr() {
    try { var o = root.__today; if (isYMD(o)) return o; } catch (e) { /* ignore */ }
    try { var n = root.__now; if (typeof n === "string" && isYMD(n.slice(0, 10))) return n.slice(0, 10); } catch (e2) { /* ignore */ }
    return localToday();
  }
  function nowParts() {
    try {
      var o = root.__now;
      if (typeof o === "string") { var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(o); if (m && isYMD(m[1]) && parseTime(m[2])) return { date: m[1], time: m[2] }; }
    } catch (e) { /* ignore */ }
    var d = new Date();
    return { date: todayStr(), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
  }
  function fmtDate(s, opts) {
    if (!isYMD(s)) return "";
    try { return new Date(toUTC(s)).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts || { month: "short", day: "numeric" })); }
    catch (e) { return s; }
  }
  function fmtDay(s) { return fmtDate(s, { weekday: "short", month: "short", day: "numeric" }); }
  /* Lenient time parser: "9:30", "930pm", "9 PM", "13:05" -> "HH:MM"; anything else -> "". */
  function parseTime(s) {
    if (typeof s !== "string") return "";
    var m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(s);
    if (!m) return "";
    var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] ? m[3].toLowerCase() : "";
    if (mi > 59) return "";
    if (ap) { if (h < 1 || h > 12) return ""; if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; }
    else if (h > 23) return "";
    return pad(h) + ":" + pad(mi);
  }
  function fmtTime(t) {
    t = parseTime(t); if (!t) return "";
    var h = +t.slice(0, 2), m = t.slice(3), ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + m + " " + ap;
  }
  function dayNum(d) { return Math.round(toUTC(d) / 86400000); }
  /* minutes on a plain wall clock (no daylight-saving shifts): date + time -> a number you can subtract */
  function startMin(date, time) {
    if (!isYMD(date)) return null;
    var t = parseTime(time);
    return dayNum(date) * 1440 + (t ? +t.slice(0, 2) * 60 + +t.slice(3) : 0);
  }
  function fromMin(m) {
    var day = Math.floor(m / 1440), r = m - day * 1440;
    return { date: fromUTC(day * 86400000), time: pad(Math.floor(r / 60)) + ":" + pad(r % 60) };
  }
  /* "Arrive by" = game time minus the warm-up minutes. Crosses midnight correctly. null when the game has no time. */
  function arriveBy(date, time, warm) {
    var s = startMin(date, time);
    if (s == null || !parseTime(time)) return null;
    return fromMin(s - int(warm, 0, 600, 45));
  }
  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + " min";
    if (min < 1440) { var h = Math.floor(min / 60), m = min % 60; return m ? h + " h " + m + " min" : h + " h"; }
    var d = Math.floor(min / 1440), hh = Math.floor((min % 1440) / 60);
    return d + (d === 1 ? " day" : " days") + (hh ? " " + hh + " h" : "");
  }
  function countdownText(delta) {
    if (delta > 0) return "in " + fmtDur(delta);
    if (delta === 0) return "starting now";
    return "started " + fmtDur(-delta) + " ago";
  }

  /* ---------- names, rules ---------- */
  function teamKey(n) { return String(n == null ? "" : n).trim().toLowerCase().replace(/\s+/g, " "); }
  function cleanName(n, max) { return str(n, max || 40).replace(/\s+/g, " ").trim(); }

  var CRITERIA = [
    { id: "pct", name: "Win percentage" },
    { id: "h2h", name: "Head-to-head" },
    { id: "pa", name: "Fewest runs allowed" },
    { id: "diff", name: "Run differential (capped)" },
    { id: "pf", name: "Most runs scored" }
  ];
  var CRIT_IDS = CRITERIA.map(function (c) { return c.id; });
  function critName(id, sport) {
    var u = sportInfo(sport).unit, c = CRITERIA.filter(function (x) { return x.id === id; })[0];
    if (!c) return id;
    return c.name.replace("runs", u).replace("Run", u === "points" ? "Point" : "Run");
  }
  function defaultRules(sport) {
    var bb = sport === "basketball";
    return { order: CRIT_IDS.slice(), off: [], tiesAllowed: true, cap: bb ? 15 : 8, forfeitWin: bb ? 2 : 7 };
  }
  function sanitizeRules(r, sport) {
    var d = defaultRules(sport || (isObj(r) && r.sport) || "baseball");
    if (!isObj(r)) return d;
    var order = [], off = [];
    (Array.isArray(r.order) ? r.order : []).forEach(function (x) { if (CRIT_IDS.indexOf(x) >= 0 && order.indexOf(x) < 0) order.push(x); });
    CRIT_IDS.forEach(function (x) { if (order.indexOf(x) < 0) order.push(x); });
    (Array.isArray(r.off) ? r.off : []).forEach(function (x) { if (CRIT_IDS.indexOf(x) >= 0 && off.indexOf(x) < 0) off.push(x); });
    return { order: order, off: off, tiesAllowed: r.tiesAllowed !== false, cap: int(r.cap, 0, 99, d.cap), forfeitWin: int(r.forfeitWin, 0, 99, d.forfeitWin) };
  }
  /* Plain-language list of the rules in force, for the Standings tab. */
  function explainRules(rules, sport) {
    var u = sportInfo(sport).unit, r = sanitizeRules(rules, sport), cap = r.cap > 0 ? r.cap : 0;
    var say = {
      pct: "A tie counts as half a win. Teams are ranked by percentage, not by number of wins, so a team that has played fewer games is not pushed down.",
      h2h: "Only games between the tied teams count. With three or more teams tied, each team's record in games among just those teams is used. If it is even (A beat B, B beat C, C beat A), go to the next step.",
      pa: "Over all pool games, the team that allowed the fewest " + u + " is first.",
      diff: u.charAt(0).toUpperCase() + u.slice(1) + " scored minus " + u + " allowed" + (cap ? ", but each game counts at most " + cap + " so a blowout is not worth more." : ", with no limit per game."),
      pf: "Over all pool games, the team that scored the most " + u + " is first."
    };
    var out = [], n = 0;
    r.order.forEach(function (id) { if (r.off.indexOf(id) < 0) { n++; out.push({ n: n, id: id, name: critName(id, sport), text: say[id] }); } });
    n++;
    out.push({ n: n, id: "coin", name: "Still tied", text: "If teams are still level after all of that, the tournament director decides (often a coin flip). Tournament Pack marks those teams as tied." });
    return out;
  }

  /* ---------- games ---------- */
  function scoreInt(x) { return int(x, 0, 999, null); }
  function sanitizeGame(g) {
    if (!isObj(g)) return null;
    var kind = g.kind === "bracket" ? "bracket" : "pool";
    var o = {
      id: typeof g.id === "string" && ID_RE.test(g.id) ? g.id : uid(), kind: kind,
      slot: kind === "bracket" && typeof g.slot === "string" && SLOT_RE.test(g.slot) ? g.slot : "",
      date: isYMD(g.date) ? g.date : "", time: parseTime(g.time), field: cleanName(g.field, 60), label: cleanName(g.label, 40),
      a: cleanName(g.a), b: cleanName(g.b), status: g.status === "final" ? "final" : "scheduled",
      sa: scoreInt(g.sa), sb: scoreInt(g.sb), innings: int(g.innings, 1, 30, null), forfeit: g.forfeit === "a" || g.forfeit === "b" ? g.forfeit : ""
    };
    if (kind === "bracket" && !o.slot) return null;
    if (kind === "pool" && (!o.a || !o.b || teamKey(o.a) === teamKey(o.b))) return null;
    if (o.forfeit) o.status = "final";
    if (o.status === "final" && !o.forfeit && (o.sa == null || o.sb == null)) o.status = "scheduled";
    if (o.status !== "final") { o.sa = null; o.sb = null; o.innings = null; o.forfeit = ""; }
    if (o.forfeit) { o.sa = null; o.sb = null; }
    return o;
  }
  /* The score of a finished game as the standings see it. Forfeits count as "forfeitWin to 0". */
  function effScore(g, rules) {
    if (!g || g.status !== "final") return null;
    var fw = rules && rules.forfeitWin != null ? rules.forfeitWin : 7;
    if (g.forfeit === "a") return { a: 0, b: fw, winner: "b", forfeit: true };
    if (g.forfeit === "b") return { a: fw, b: 0, winner: "a", forfeit: true };
    if (g.sa == null || g.sb == null) return null;
    return { a: g.sa, b: g.sb, winner: g.sa > g.sb ? "a" : g.sb > g.sa ? "b" : "tie" };
  }
  function capDiff(d, cap) { return cap > 0 ? Math.max(-cap, Math.min(cap, d)) : d; }
  function cmpGames(x, y) {
    if (x.date !== y.date) { if (!x.date) return 1; if (!y.date) return -1; return x.date < y.date ? -1 : 1; }
    var tx = x.time || "99:99", ty = y.time || "99:99";
    if (tx !== ty) return tx < ty ? -1 : 1;
    if ((x.field || "") !== (y.field || "")) return (x.field || "") < (y.field || "") ? -1 : 1;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  }
  function sortGames(games) { return games.slice().sort(cmpGames); }
  function groupByDay(games) {
    var out = [], map = {};
    sortGames(games).forEach(function (g) {
      var k = g.date || "";
      if (!map[k]) { map[k] = { date: k, games: [] }; out.push(map[k]); }
      map[k].games.push(g);
    });
    return out;
  }
  function isOurs(t, g) { var u = teamKey(t.team); return !!u && (teamKey(g.a) === u || teamKey(g.b) === u); }
  function ourSide(t, g) { var u = teamKey(t.team); if (!u) return null; return teamKey(g.a) === u ? "a" : teamKey(g.b) === u ? "b" : null; }
  function oppName(t, g) { var s = ourSide(t, g); var n = s === "a" ? g.b : s === "b" ? g.a : ""; return n || "TBD"; }
  /* Our result in a finished game: { res: "W"|"L"|"T", us, them, forfeit } or null. */
  function resultFor(t, g) {
    var side = ourSide(t, g), e = effScore(g, t.rules);
    if (!side || !e) return null;
    var us = side === "a" ? e.a : e.b, them = side === "a" ? e.b : e.a;
    var res = e.winner === "tie" ? "T" : (e.winner === side ? "W" : "L");
    return { res: res, us: us, them: them, forfeit: !!e.forfeit };
  }
  function gameMinutes(t) { return int(t && t.gameMin, 20, 300, sportInfo(t && t.sport).gameMin); }
  /* Rest between two of our games on the same day. The end of the first game is an estimate (start + typical game length). */
  function gapInfo(prev, next, gameMin) {
    if (!prev || !next || !prev.date || prev.date !== next.date || !prev.time || !next.time) return null;
    var min = startMin(next.date, next.time) - (startMin(prev.date, prev.time) + gameMin);
    var text;
    if (min <= 0) text = "Back to back: the next game starts before this one is expected to end";
    else if (min < 60) text = "Only about " + fmtDur(min) + " to eat and rest";
    else text = "About " + fmtDur(min) + " between games";
    return { min: min, warn: min < 60, text: text };
  }
  function ourGames(t) { return sortGames(t.games.filter(function (g) { return isOurs(t, g); })); }
  /* The next game of ours that has not been played: { game, start, delta (minutes, negative once it has started), timed } or null.
     A timed game stays "next" until 90 minutes after its expected end so a game that is running or not yet scored still shows. */
  function nextGame(t, now) {
    var nowMin = startMin(now.date, now.time), gm = gameMinutes(t), list = ourGames(t);
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (g.status === "final" || !g.date) continue;
      if (g.time) {
        var s = startMin(g.date, g.time);
        if (s + gm + 90 < nowMin) continue;
        return { game: g, start: s, delta: s - nowMin, timed: true };
      }
      if (g.date < now.date) continue;
      return { game: g, start: null, delta: null, timed: false, daysAway: diffDays(g.date, now.date) };
    }
    return null;
  }
  /* A scheduled game whose expected end has passed but that has no score. */
  function needsScore(t, g, now) {
    if (g.status === "final" || !g.date) return false;
    var nowMin = startMin(now.date, now.time);
    if (g.time) return startMin(g.date, g.time) + gameMinutes(t) < nowMin;
    return g.date < now.date;
  }

  /* ---------- standings ---------- */
  function fmtPct(n, d) {
    if (!d) return "-";
    var v = n / d, s = v.toFixed(3);
    return v >= 1 ? "1.000" : s.replace(/^0/, "");
  }
  function cmpR(x, y) { var l = x.n * y.d, r = y.n * x.d; return l > r ? 1 : l < r ? -1 : 0; }
  function partition(group, vals) {
    var sorted = group.slice().sort(function (a, b) { return cmpR(vals[b.key], vals[a.key]) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
    var parts = [];
    sorted.forEach(function (t) {
      var last = parts[parts.length - 1];
      if (last && cmpR(vals[last[0].key], vals[t.key]) === 0) last.push(t); else parts.push([t]);
    });
    return parts;
  }
  function namesOf(group) { return group.map(function (t) { return t.team; }); }
  function joinNames(a) {
    if (a.length <= 1) return a.join("");
    if (a.length === 2) return a[0] + " and " + a[1];
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function wlt(w, l, t) { return w + "-" + l + (t ? "-" + t : ""); }
  /* Record of each team in the group in games played only among the group. results: [{a, b, winner}] with team keys. */
  function h2hTable(group, results) {
    var inGroup = {}, tb = {};
    group.forEach(function (t) { inGroup[t.key] = 1; tb[t.key] = { team: t.team, key: t.key, w: 0, l: 0, t: 0, gp: 0 }; });
    results.forEach(function (r) {
      if (!inGroup[r.a] || !inGroup[r.b]) return;
      tb[r.a].gp++; tb[r.b].gp++;
      if (r.winner === "a") { tb[r.a].w++; tb[r.b].l++; }
      else if (r.winner === "b") { tb[r.b].w++; tb[r.a].l++; }
      else { tb[r.a].t++; tb[r.b].t++; }
    });
    return tb;
  }
  function cap1(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
  function valuesFor(c, group, ctx) {
    var vals = {}, text = "", table = null, u = ctx.unit, allSame = group.every(function (t) { return t.gp === group[0].gp; });
    function list(fn) { return group.map(function (t) { return t.team + " " + fn(t); }).join(", "); }
    function per(v, t) { return allSame ? String(v) : (Math.round(v / t.gp * 10) / 10) + " per game"; }
    var note = allSame ? "" : " Compared per game, because these teams played different numbers of games.";
    if (c === "pct") {
      group.forEach(function (t) { vals[t.key] = { n: 2 * t.w + t.t, d: 2 * t.gp }; });
      text = list(function (t) { return fmtPct(2 * t.w + t.t, 2 * t.gp); }) + ".";
    } else if (c === "h2h") {
      var tb = h2hTable(group, ctx.results);
      group.forEach(function (t) { var r = tb[t.key]; vals[t.key] = r.gp ? { n: 2 * r.w + r.t, d: 2 * r.gp } : { n: 1, d: 2 }; });
      table = group.map(function (t) { var r = tb[t.key]; return { team: t.team, w: r.w, l: r.l, t: r.t, gp: r.gp }; });
      var any = table.some(function (r) { return r.gp > 0; });
      text = "Counting only games among " + joinNames(namesOf(group)) + ": " + (any ? table.map(function (r) { return r.team + " " + (r.gp ? wlt(r.w, r.l, r.t) : "no games"); }).join(", ") : "they have not played each other") + ".";
    } else if (c === "pa") {
      group.forEach(function (t) { vals[t.key] = { n: -t.pa, d: t.gp }; });
      text = "Lower is better." + note + " " + cap1(u) + " allowed: " + list(function (t) { return per(t.pa, t); }) + ".";
    } else if (c === "diff") {
      group.forEach(function (t) { vals[t.key] = { n: t.cdiff, d: t.gp }; });
      text = "Higher is better." + (ctx.cap > 0 ? " Each game counts at most " + ctx.cap + "." : "") + note + " Differential: " +
        list(function (t) { return allSame ? (t.cdiff > 0 ? "+" : "") + t.cdiff : (t.cdiff > 0 ? "+" : "") + Math.round(t.cdiff / t.gp * 10) / 10 + " per game"; }) + ".";
    } else if (c === "pf") {
      group.forEach(function (t) { vals[t.key] = { n: t.pf, d: t.gp }; });
      text = "Higher is better." + note + " " + cap1(u) + " scored: " + list(function (t) { return per(t.pf, t); }) + ".";
    }
    return { vals: vals, text: text, table: table };
  }
  function newTie(group, ctx) {
    var tie = { teams: namesOf(group), steps: [], stillTied: [] };
    ctx.ties.push(tie);
    return tie;
  }
  /* Split a group of equal teams into ranked blocks. After any step that separates some of them, the whole ordering
     starts again for each smaller group that is still level ("restart"). skipUpTo: steps before this index whose value
     does not depend on who is in the group are already known to be equal, so they are not shown again. */
  function resolve(group, ctx, tie, skipUpTo) {
    if (group.length < 2) return [group];
    var order = ctx.order;
    for (var i = 0; i < order.length; i++) {
      var c = order[i];
      if (c !== "h2h" && i <= skipUpTo) continue;
      var info = valuesFor(c, group, ctx), parts = partition(group, info.vals);
      if (!tie && i === 0 && parts.length === 1) tie = newTie(group, ctx);
      if (tie) {
        var result = parts.length > 1 ? "Result: " + parts.map(function (p) { return p.length > 1 ? joinNames(namesOf(p)) + " (still tied)" : p[0].team; }).join(", then ") + "." : "No one is separated.";
        tie.steps.push({ crit: c, among: namesOf(group), split: parts.length > 1, text: info.text, result: result, table: c === "h2h" ? info.table : null });
      }
      if (parts.length > 1) {
        var out = [];
        parts.forEach(function (p) {
          if (p.length < 2) { out.push(p); return; }
          out = out.concat(resolve(p, ctx, tie || newTie(p, ctx), i));
        });
        return out;
      }
    }
    if (!tie) tie = newTie(group, ctx);
    tie.stillTied.push(namesOf(group));
    return [group];
  }
  /* games: all games of the tournament (only final pool games count). config: rules plus { sport }. */
  function standings(games, config) {
    config = config || {};
    var sport = config.sport || "baseball", rules = sanitizeRules(config, sport);
    var teams = {}, keys = [], warnings = [], pending = 0, results = [], counted = 0;
    function team(n) {
      var k = teamKey(n);
      if (!teams[k]) { teams[k] = { key: k, team: cleanName(n), w: 0, l: 0, t: 0, gp: 0, pf: 0, pa: 0, cdiff: 0 }; keys.push(k); }
      return teams[k];
    }
    var pool = (games || []).filter(function (g) { return g && g.kind === "pool" && g.a && g.b; });
    pool.forEach(function (g) { team(g.a); team(g.b); });
    pool.forEach(function (g) {
      var e = effScore(g, rules);
      if (!e) { if (g.status !== "final") pending++; return; }
      var A = team(g.a), B = team(g.b), d = e.a - e.b;
      A.pf += e.a; A.pa += e.b; B.pf += e.b; B.pa += e.a;
      A.cdiff += capDiff(d, rules.cap); B.cdiff -= capDiff(d, rules.cap);
      A.gp++; B.gp++; counted++;
      if (e.winner === "a") { A.w++; B.l++; } else if (e.winner === "b") { B.w++; A.l++; } else {
        A.t++; B.t++;
        if (!rules.tiesAllowed) warnings.push(A.team + " and " + B.team + " tied " + e.a + "-" + e.b + ", but ties are turned off in your rules. Check the score.");
      }
      results.push({ a: A.key, b: B.key, winner: e.winner });
    });
    var all = keys.map(function (k) { return teams[k]; });
    var ranked = all.filter(function (t) { return t.gp > 0; }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var unranked = all.filter(function (t) { return t.gp === 0; }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var order = rules.order.filter(function (id) { return rules.off.indexOf(id) < 0; });
    var ctx = { order: order, results: results, unit: sportInfo(sport).unit, cap: rules.cap, ties: [] };
    var blocks = resolve(ranked, ctx, null, -1);
    var rows = [], pos = 1;
    blocks.forEach(function (b) {
      b.forEach(function (t) {
        rows.push({ team: t.team, key: t.key, w: t.w, l: t.l, t: t.t, gp: t.gp, pct: (2 * t.w + t.t) / (2 * t.gp), pctText: fmtPct(2 * t.w + t.t, 2 * t.gp),
          pf: t.pf, pa: t.pa, diff: t.pf - t.pa, cdiff: t.cdiff, rank: pos, rankTo: pos + b.length - 1, tied: b.length > 1 });
      });
      pos += b.length;
    });
    unranked.forEach(function (t) { rows.push({ team: t.team, key: t.key, w: 0, l: 0, t: 0, gp: 0, pct: 0, pctText: "-", pf: 0, pa: 0, diff: 0, cdiff: 0, rank: null, rankTo: null, tied: false }); });
    var byKey = {}; rows.forEach(function (r) { byKey[r.key] = r; });
    ctx.ties.forEach(function (tie) {
      var rs = tie.teams.map(function (n) { return byKey[teamKey(n)]; });
      tie.from = Math.min.apply(null, rs.map(function (r) { return r.rank; }));
      tie.to = Math.max.apply(null, rs.map(function (r) { return r.rankTo; }));
      tie.final = rs.slice().sort(function (a, b) { return a.rank - b.rank || (a.key < b.key ? -1 : 1); }).map(function (r) { return r.team; });
      var open = tie.stillTied.filter(function (s) { return s.length > 1; });
      tie.resolved = open.length === 0;
      tie.summary = open.length ? "Still tied: " + open.map(joinNames).join("; ") + ". The tournament director decides (coin flip)." : "Final order: " + tie.final.join(", ") + ".";
    });
    return { rows: rows, ties: ctx.ties, warnings: warnings, counted: counted, pending: pending, order: order, rules: rules };
  }
  function standingsFor(t) { return standings(t.games, Object.assign({}, t.rules, { sport: t.sport })); }
  /* Head-to-head record among the named teams, from final pool games. */
  function headToHead(games, names, config) {
    var rules = sanitizeRules(config || {}, (config || {}).sport), set = {}, group = [];
    names.forEach(function (n) { var k = teamKey(n); if (!set[k]) { set[k] = 1; group.push({ key: k, team: n }); } });
    var results = [];
    (games || []).forEach(function (g) {
      if (!g || g.kind !== "pool") return;
      var e = effScore(g, rules); if (!e) return;
      results.push({ a: teamKey(g.a), b: teamKey(g.b), winner: e.winner });
    });
    var tb = h2hTable(group, results);
    return group.map(function (t) { return tb[t.key]; });
  }
  function rowFor(res, name) { var k = teamKey(name); return res.rows.filter(function (r) { return r.key === k; })[0] || null; }
  /* Where we stand and what happens if we win or lose every game we have left (other results are not predicted). */
  function scenarios(games, config, us) {
    var uk = teamKey(us); if (!uk) return null;
    var res = standings(games, config), me = rowFor(res, us);
    var rules = res.rules, ranked = res.rows.filter(function (r) { return r.gp > 0; }).length;
    var rem = (games || []).filter(function (g) { return g.kind === "pool" && g.status !== "final" && (teamKey(g.a) === uk || teamKey(g.b) === uk); });
    var out = { now: me && me.gp > 0 ? { rank: me.rank, rankTo: me.rankTo, tied: me.tied, w: me.w, l: me.l, t: me.t } : null, ofTeams: ranked, teams: res.rows.length, remaining: rem.length, win: null, lose: null };
    if (!rem.length) return out;
    var big = rules.cap > 0 ? rules.cap : 10;
    function run(win) {
      var best = Infinity, worst = 0;
      [1, big].forEach(function (margin) {
        var g2 = games.map(function (g) {
          if (rem.indexOf(g) < 0) return g;
          var usA = teamKey(g.a) === uk, us_s = win ? margin : 0, th_s = win ? 0 : margin;
          return Object.assign({}, g, { status: "final", forfeit: "", sa: usA ? us_s : th_s, sb: usA ? th_s : us_s });
        });
        var r = rowFor(standings(g2, config), us);
        best = Math.min(best, r.rank); worst = Math.max(worst, r.rankTo);
      });
      return { best: best, worst: worst };
    }
    out.win = run(true); out.lose = run(false);
    return out;
  }

  /* ---------- bracket ---------- */
  var BRACKETS = {
    4: { names: ["Semifinal", "Final"], r1: [[1, 4], [2, 3]] },
    6: { names: ["Quarterfinal", "Semifinal", "Final"], r1: [[1, 0], [4, 5], [3, 6], [2, 0]] },
    8: { names: ["Quarterfinal", "Semifinal", "Final"], r1: [[1, 8], [4, 5], [3, 6], [2, 7]] }
  };
  var BRACKET_SIZES = [4, 6, 8];
  function sanitizeBracket(b) {
    var size = isObj(b) ? Math.round(Number(b.size)) : 0;
    if (!isFinite(size) || !BRACKETS[size]) return { size: 0, seeds: [] };
    var seeds = [];
    for (var i = 0; i < size; i++) seeds.push(cleanName(isObj(b) && Array.isArray(b.seeds) ? b.seeds[i] : ""));
    for (var j = 0; j < size; j++) for (var k = 0; k < j; k++) if (seeds[j] && teamKey(seeds[j]) === teamKey(seeds[k])) seeds[j] = ""; // a team can hold only one seed
    return { size: size, seeds: seeds };
  }
  function seedP(seeds, k) {
    if (k === 0) return { absent: true, name: "", seed: null, label: "Bye" };
    return { name: seeds[k - 1] || "", seed: k, label: "Seed " + k };
  }
  /* The whole bracket worked out from seeds and results: { rounds: [{ name, matches: [...] }], champion }, or null with no bracket.
     A finished game only counts if it was played between the teams the bracket now says belong in that slot (otherwise m.stale). */
  function bracketTree(t) {
    var br = t.bracket;
    if (!br || !BRACKETS[br.size]) return null;
    var spec = BRACKETS[br.size], rules = sanitizeRules(t.rules, t.sport), bySlot = {};
    t.games.forEach(function (g) { if (g.kind === "bracket") bySlot[g.slot] = g; });
    var rounds = [], prev = null, nR = spec.names.length;
    for (var r = 1; r <= nR; r++) {
      var n = spec.r1.length / Math.pow(2, r - 1), ms = [], counter = 0;
      for (var i = 1; i <= n; i++) {
        var m = { slot: "r" + r + "m" + i, round: r, idx: i };
        if (r === 1) { m.a = seedP(br.seeds, spec.r1[i - 1][0]); m.b = seedP(br.seeds, spec.r1[i - 1][1]); }
        else { m.a = fromP(prev[2 * i - 2]); m.b = fromP(prev[2 * i - 1]); }
        m.bye = !!(m.a.absent || m.b.absent);
        if (!m.bye) counter++;
        m.title = m.bye ? "Bye" : r === nR ? "Final" : spec.names[r - 1] + (n > 1 ? " " + counter : "");
        if (m.bye) {
          var real = m.a.absent ? m.b : m.a;
          m.winner = real.name; m.winnerSeed = real.seed; m.state = "bye";
        } else {
          var g = bySlot[m.slot] || null; m.game = g;
          m.state = m.a.name && m.b.name ? "ready" : "tbd";
          if (g && g.status === "final") {
            if (m.state !== "ready" || teamKey(g.a) !== teamKey(m.a.name) || teamKey(g.b) !== teamKey(m.b.name)) m.stale = true;
            else {
              var e = effScore(g, rules);
              if (e && e.winner !== "tie") {
                m.state = "final"; m.score = { a: e.a, b: e.b, forfeit: !!e.forfeit };
                m.winner = e.winner === "a" ? m.a.name : m.b.name; m.winnerSeed = e.winner === "a" ? m.a.seed : m.b.seed;
                m.loser = e.winner === "a" ? m.b.name : m.a.name;
              } else m.stale = true; // a bracket game cannot end level
            }
          }
        }
        ms.push(m);
      }
      rounds.push({ name: r === nR ? "Final" : spec.names[r - 1], matches: ms });
      prev = ms;
    }
    function fromP(pm) {
      if (pm.bye) return { name: pm.winner || "", seed: pm.winnerSeed, label: pm.winnerSeed ? "Seed " + pm.winnerSeed : "Bye" };
      return { name: pm.winner || "", seed: pm.winnerSeed || null, from: pm.slot, label: "Winner of " + pm.title.replace("Quarterfinal", "QF").replace("Semifinal", "SF") };
    }
    var fin = rounds[rounds.length - 1].matches[0];
    return { size: br.size, rounds: rounds, champion: fin.winner || "", bySlot: bySlot };
  }
  function nextSlot(tree, m) {
    if (m.round >= tree.rounds.length) return null;
    return "r" + (m.round + 1) + "m" + Math.ceil(m.idx / 2);
  }
  /* Make the bracket games agree with the bracket: names follow the seeds and winners, results that no longer belong are cleared.
     Returns { games, cleared: [slot...] }. Nothing is changed in t. */
  function cascade(t) {
    var tree = bracketTree(t), cleared = [], out = [];
    var valid = {};
    if (tree) tree.rounds.forEach(function (rd) { rd.matches.forEach(function (m) { if (!m.bye) valid[m.slot] = m; }); });
    t.games.forEach(function (g0) {
      if (g0.kind !== "bracket") { out.push(g0); return; }
      var m = valid[g0.slot];
      if (!m) { cleared.push(g0.slot); return; } // slot no longer exists
      var g = Object.assign({}, g0);
      if (g.status === "final" && m.stale) { g.status = "scheduled"; g.sa = null; g.sb = null; g.forfeit = ""; g.innings = null; cleared.push(g.slot); }
      g.a = m.a.name; g.b = m.b.name;
      out.push(g);
    });
    return { games: out, cleared: cleared };
  }
  /* What would happen to the bracket if change(copyOfTournament) were applied? { t: newTournament, cleared: [slots other than the edited one] } */
  function previewBracket(t, change, editedSlot) {
    var c = clone(t); change(c);
    var cs = cascade(c); c.games = cs.games;
    return { t: c, cleared: cs.cleared.filter(function (s) { return s !== editedSlot; }) };
  }
  function slotTitle(t, slot) {
    var tree = bracketTree(t), hit = "";
    if (tree) tree.rounds.forEach(function (rd) { rd.matches.forEach(function (m) { if (m.slot === slot) hit = m.title; }); });
    return hit || slot;
  }
  /* The slots on our road to the final: every match we are in, and the ones after it until we lose. */
  function ourPath(t) {
    var tree = bracketTree(t), uk = teamKey(t.team);
    if (!tree || !uk) return [];
    var seed = 0;
    t.bracket.seeds.forEach(function (n, i) { if (teamKey(n) === uk) seed = i + 1; });
    if (!seed) return [];
    var byslot = {}, start = null;
    tree.rounds.forEach(function (rd) { rd.matches.forEach(function (m) { byslot[m.slot] = m; if (m.round === 1 && (m.a.seed === seed || m.b.seed === seed)) start = m; }); });
    var path = [], m = start;
    while (m) {
      path.push(m.slot);
      if (m.state === "final" && teamKey(m.winner) !== uk) break;
      var ns = nextSlot(tree, m); m = ns ? byslot[ns] : null;
    }
    return path;
  }
  /* Seed names from the pool standings, best first. unsure lists teams whose seed is a coin-flip tie. */
  function seedsFromStandings(t, size) {
    var res = standingsFor(t), seeds = [], unsure = [];
    var rows = res.rows.filter(function (r) { return r.gp > 0; });
    for (var i = 0; i < size; i++) seeds.push(rows[i] ? rows[i].team : "");
    rows.slice(0, size).forEach(function (r) { if (r.tied) unsure.push(r.team); });
    // a tie only matters when it reaches across the cut line or changes who gets which seed
    return { seeds: seeds, unsure: unsure, teams: rows.length };
  }

  /* ---------- pack list ---------- */
  var GROUPS = ["Gear", "Food & Drink", "Comfort", "Admin"];
  var PACK = {
    ball: {
      "Gear": ["Gear bag", "Cleats", "Helmet", "Bat", "Glove", "Batting gloves", "Uniform: jerseys and pants", "Hat, belt and socks"],
      "Food & Drink": ["Water jug and bottles", "Cooler with ice", "Snacks and fruit", "Sports drinks"],
      "Comfort": ["Sunscreen", "Folding chairs", "Pop-up tent", "Bug spray", "Rain gear", "Laundry bag"],
      "Admin": ["Cash for entry fees", "Roster and player cards", "First-aid kit", "Phone charger", "Hotel confirmation"]
    },
    basketball: {
      "Gear": ["Gear bag", "Basketball shoes", "Two jerseys (light and dark)", "Shorts", "Ankle braces", "Extra socks", "Warm-up shirt"],
      "Food & Drink": ["Water bottles", "Cooler with ice", "Snacks and fruit", "Sports drinks"],
      "Comfort": ["Towel", "Folding chairs", "Hoodie or blanket", "Laundry bag"],
      "Admin": ["Cash for gate fees", "Roster", "First-aid kit", "Phone charger", "Hotel confirmation"]
    }
  };
  function packTemplate(sport) {
    var src = sport === "basketball" ? PACK.basketball : PACK.ball, out = [];
    GROUPS.forEach(function (g) { (src[g] || []).forEach(function (text) { out.push({ id: uid(), text: text, group: g, done: false }); }); });
    if (sport === "softball") out.splice(8, 0, { id: uid(), text: "Hair ties", group: "Gear", done: false });
    return out;
  }
  function sanitizePack(p) {
    var out = [], seen = {};
    (Array.isArray(p) ? p : []).slice(0, 200).forEach(function (x) {
      if (!isObj(x)) return;
      var text = cleanName(x.text, 60); if (!text) return;
      var id = typeof x.id === "string" && ID_RE.test(x.id) && !seen[x.id] ? x.id : uid();
      seen[id] = 1;
      out.push({ id: id, text: text, group: GROUPS.indexOf(x.group) >= 0 ? x.group : "Gear", done: x.done === true });
    });
    return out;
  }
  function packProgress(pack) { var done = pack.filter(function (p) { return p.done; }).length; return { done: done, total: pack.length, text: done + " of " + pack.length + " packed" }; }

  /* ---------- tournament and settings records ---------- */
  function sanitizeTournament(o) {
    if (!isObj(o)) return null;
    var sport = SPORTS.some(function (s) { return s.id === o.sport; }) ? o.sport : "baseball";
    var start = isYMD(o.start) ? o.start : todayStr();
    var end = isYMD(o.end) && o.end >= start ? o.end : start;
    var nt = isObj(o.notes) ? o.notes : {};
    var t = {
      id: typeof o.id === "string" && ID_RE.test(o.id) ? o.id : uid(), name: cleanName(o.name, 60) || "Tournament", sport: sport, start: start, end: end,
      team: cleanName(o.team), gameMin: int(o.gameMin, 20, 300, sportInfo(sport).gameMin), created: isYMD(o.created) ? o.created : start,
      notes: { lodging: str(nt.lodging, 4000), food: str(nt.food, 4000), map: str(nt.map, 4000), other: str(nt.other, 4000) },
      rules: sanitizeRules(o.rules, sport), games: [], bracket: sanitizeBracket(o.bracket), pack: sanitizePack(o.pack)
    };
    var seen = {};
    (Array.isArray(o.games) ? o.games : []).slice(0, 400).forEach(function (g) {
      var s = sanitizeGame(g);
      if (!s || seen[s.id] || (s.kind === "bracket" && seen["slot:" + s.slot])) return;
      seen[s.id] = 1; if (s.kind === "bracket") seen["slot:" + s.slot] = 1;
      t.games.push(s);
    });
    t.games = cascade(t).games;
    return t;
  }
  function sanitizeSettings(s) {
    var o = isObj(s) ? s : {}, r = isObj(o.rules) ? o.rules : {}, d = sanitizeRules(r, "baseball");
    return { warm: int(o.warm, 0, 180, 45), rules: { order: d.order, off: d.off, tiesAllowed: d.tiesAllowed } };
  }
  function newTournament(opts, settings) {
    var sport = SPORTS.some(function (s) { return s.id === opts.sport; }) ? opts.sport : "baseball";
    var base = defaultRules(sport), sr = settings && settings.rules ? settings.rules : {};
    var rules = sanitizeRules({ order: sr.order, off: sr.off, tiesAllowed: sr.tiesAllowed, cap: base.cap, forfeitWin: base.forfeitWin }, sport);
    return sanitizeTournament({ id: uid(), name: opts.name, sport: sport, start: opts.start, end: opts.end, team: opts.team, gameMin: opts.gameMin, created: todayStr(),
      rules: rules, games: [], bracket: { size: 0, seeds: [] }, pack: packTemplate(sport), notes: {} });
  }
  function makeBackup(list, settings, today) {
    return { app: "tournamentpack", v: 1, saved: isYMD(today) ? today : todayStr(), settings: sanitizeSettings(settings), tournaments: list.map(function (t) { return sanitizeTournament(t); }).filter(Boolean) };
  }
  function validateBackup(obj) {
    if (!isObj(obj) || obj.app !== "tournamentpack") return { ok: false, error: "That file isn't a Tournament Pack backup." };
    if (typeof obj.v === "number" && obj.v > 1) return { ok: false, error: "That backup was made by a newer version of Tournament Pack." };
    if (!Array.isArray(obj.tournaments)) return { ok: false, error: "That backup has no tournaments in it." };
    if (obj.tournaments.length > 60) return { ok: false, error: "That backup has too many tournaments." };
    var list = [], seen = {};
    for (var i = 0; i < obj.tournaments.length; i++) {
      var t = sanitizeTournament(obj.tournaments[i]);
      if (!t) return { ok: false, error: "Part of that backup is damaged." };
      if (seen[t.id]) t.id = uid();
      seen[t.id] = 1; list.push(t);
    }
    return { ok: true, tournaments: list, settings: sanitizeSettings(obj.settings) };
  }
  function renameTeam(t, from, to) {
    var fk = teamKey(from), toName = cleanName(to);
    if (!toName) return { ok: false, error: "Type a name for the team." };
    var tk = teamKey(toName), c = clone(t);
    var clash = false;
    c.games.forEach(function (g) {
      if (g.kind !== "pool") return;
      var na = teamKey(g.a) === fk ? toName : g.a, nb = teamKey(g.b) === fk ? toName : g.b;
      if (teamKey(na) === teamKey(nb)) clash = true;
      g.a = na; g.b = nb;
    });
    if (clash && tk !== fk) return { ok: false, error: "Those two teams played each other, so they can't be the same team." };
    c.games.forEach(function (g) { if (g.kind === "bracket") { if (teamKey(g.a) === fk) g.a = toName; if (teamKey(g.b) === fk) g.b = toName; } });
    c.bracket.seeds = c.bracket.seeds.map(function (n) { return teamKey(n) === fk ? toName : n; });
    if (teamKey(c.team) === fk) c.team = toName;
    c.bracket = sanitizeBracket(c.bracket);
    c.games = cascade(c).games;
    return { ok: true, t: c };
  }
  function teamNames(t) {
    var seen = {}, out = [];
    function add(n) { var k = teamKey(n); if (n && !seen[k]) { seen[k] = 1; out.push(n); } }
    add(t.team);
    t.games.forEach(function (g) { if (g.kind === "pool") { add(g.a); add(g.b); } });
    (t.bracket && t.bracket.seeds || []).forEach(add);
    return out;
  }

  /* ---------- calendar file (.ics) and weekend summary ---------- */
  function icsEscape(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function utf8len(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
  function fold(line) {
    var out = [], cur = "", bytes = 0;
    Array.from(line).forEach(function (ch) {
      var b = utf8len(ch.codePointAt(0));
      if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  function icsStamp(date, time) { return date.replace(/-/g, "") + "T" + (time ? time.replace(":", "") : "00:00".replace(":", "")) + "00"; }
  /* Our games that are not played yet, as a calendar file. Times have no timezone on purpose, so the phone shows them in its own zone. */
  function icsFor(t, opts) {
    opts = opts || {};
    var warm = int(opts.warm, 0, 180, 45), gm = gameMinutes(t), today = isYMD(opts.today) ? opts.today : todayStr();
    var list = ourGames(t).filter(function (g) { return g.status !== "final" && g.date; });
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tournament Pack//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEscape(t.name)];
    list.forEach(function (g) {
      var opp = oppName(t, g), where = g.field ? "Field/court: " + g.field : "";
      var round = g.kind === "bracket" ? slotTitle(t, g.slot) : (g.label || "Pool play");
      var arrive = arriveBy(g.date, g.time, warm), desc = [];
      L.push("BEGIN:VEVENT");
      L.push("UID:" + g.id + "-" + t.id + "@tournamentpack");
      L.push("DTSTAMP:" + today.replace(/-/g, "") + "T000000Z");
      L.push("SUMMARY:" + icsEscape(t.team + " vs " + opp + " (" + round + ")"));
      if (g.time) {
        var s = startMin(g.date, g.time), e = fromMin(s + gm);
        L.push("DTSTART:" + icsStamp(g.date, g.time));
        L.push("DTEND:" + icsStamp(e.date, e.time));
        desc.push("Arrive by " + fmtTime(arrive.time) + (arrive.date !== g.date ? " (the day before)" : "") + " (" + warm + " min before the game)");
        desc.push("Game time: " + fmtTime(g.time));
      } else {
        L.push("DTSTART;VALUE=DATE:" + g.date.replace(/-/g, ""));
        L.push("DTEND;VALUE=DATE:" + addDays(g.date, 1).replace(/-/g, ""));
        desc.push("Game time to be announced");
      }
      desc.push(round + " at " + t.name); if (where) desc.push(where);
      if (g.field) L.push("LOCATION:" + icsEscape(g.field));
      L.push("DESCRIPTION:" + icsEscape(desc.join("\n")));
      L.push("BEGIN:VALARM"); L.push("ACTION:DISPLAY");
      if (g.time) { L.push("DESCRIPTION:" + icsEscape("Game vs " + opp + " in " + (warm + 30) + " min. Arrive by " + fmtTime(arrive.time) + ".")); L.push("TRIGGER:-PT" + (warm + 30) + "M"); }
      else { L.push("DESCRIPTION:" + icsEscape("Game vs " + opp + " today. Check the time.")); L.push("TRIGGER:PT7H"); }
      L.push("END:VALARM");
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return { text: L.map(fold).join("\r\n") + "\r\n", count: list.length };
  }
  function dateRange(t) { return t.end > t.start ? fmtDate(t.start) + " to " + fmtDate(t.end) : fmtDate(t.start); }
  /* A short text for the team chat: next game, our schedule and results, and the pool standings. */
  function summaryText(t, opts) {
    opts = opts || {};
    var warm = int(opts.warm, 0, 180, 45), now = opts.now || nowParts(), L = [];
    L.push(t.name + " (" + sportInfo(t.sport).label + ", " + dateRange(t) + ")");
    if (t.team) L.push("Team: " + t.team);
    var ng = nextGame(t, now);
    if (ng) {
      var g = ng.game, ab = arriveBy(g.date, g.time, warm);
      L.push("");
      L.push("NEXT GAME: " + fmtDay(g.date) + (g.time ? ", " + fmtTime(g.time) : ", time to be announced") + " vs " + oppName(t, g) + (g.field ? " at " + g.field : "") + (ab ? ". Arrive by " + fmtTime(ab.time) + "." : "."));
    }
    var days = groupByDay(ourGames(t));
    if (days.length) {
      L.push(""); L.push("OUR GAMES");
      days.forEach(function (d) {
        L.push(d.date ? fmtDay(d.date) : "No date");
        d.games.forEach(function (g) {
          var r = resultFor(t, g), when = g.time ? fmtTime(g.time) : "Time TBD";
          var line = "  " + when + " vs " + oppName(t, g) + (g.field ? " (" + g.field + ")" : "");
          if (r) line += ": " + (r.res === "W" ? "won" : r.res === "L" ? "lost" : "tied") + " " + r.us + "-" + r.them + (r.forfeit ? " (forfeit)" : "");
          L.push(line);
        });
      });
    }
    var res = standingsFor(t), ranked = res.rows.filter(function (r) { return r.gp > 0; });
    if (ranked.length) {
      L.push(""); L.push("POOL STANDINGS");
      ranked.forEach(function (r) { L.push((r.tied ? "T" : "") + r.rank + ". " + r.team + " " + wlt(r.w, r.l, r.t) + " (" + r.pctText + ", " + r.pf + " for, " + r.pa + " against)"); });
      res.ties.forEach(function (tie) { if (!tie.resolved) L.push(tie.summary); });
    }
    return L.join("\n");
  }

  /* ---------- sample tournament (placeholder names only) ---------- */
  function sampleTournament(today) {
    today = isYMD(today) ? today : todayStr();
    var d1 = addDays(today, -1), d3 = addDays(today, 1), d4 = addDays(today, 2), n = 0;
    function G(date, time, field, a, b, sa, sb, extra) {
      n++;
      var g = { id: "sg" + (n < 10 ? "0" : "") + n, kind: "pool", date: date, time: time, field: field, a: a, b: b, status: sa == null ? "scheduled" : "final", sa: sa, sb: sb, label: "Pool play" };
      return Object.assign(g, extra || {});
    }
    var O = "Our Team", B = "Team B", C = "Team C", D = "Team D", E = "Team E", F = "Team F";
    var games = [
      G(d1, "08:00", "Field 1", O, B, 6, 4), G(d1, "08:00", "Field 2", D, E, 5, 4),
      G(d1, "10:15", "Field 1", O, D, 10, 1), G(d1, "10:15", "Field 2", B, C, 5, 2),
      G(d1, "13:00", "Field 1", O, C, 7, 8), G(d1, "13:00", "Field 2", B, D, 9, 2),
      G(d1, "15:15", "Field 1", C, E, 6, 3),
      G(d3, "09:00", "Field 1", O, E, null, null), G(d3, "09:00", "Field 2", C, D, null, null), G(d3, "11:15", "Field 2", B, E, null, null), G(d3, "11:15", "Field 1", O, F, null, null),
      { id: "sb01", kind: "bracket", slot: "r1m1", date: d4, time: "09:00", field: "Field 1", a: "", b: "", status: "scheduled" },
      { id: "sb02", kind: "bracket", slot: "r1m2", date: d4, time: "09:00", field: "Field 2", a: "", b: "", status: "scheduled" },
      { id: "sb03", kind: "bracket", slot: "r2m1", date: d4, time: "11:30", field: "Field 1", a: "", b: "", status: "scheduled" }
    ];
    var pack = packTemplate("baseball"); pack.forEach(function (p, i) { p.done = i < 9; });
    return sanitizeTournament({
      id: uid(), name: "Sample: Spring Classic", sport: "baseball", start: d1, end: d4, team: O, gameMin: 90, created: today,
      notes: { lodging: "Sample text: Hotel placeholder, Room 000. Check-in after 3 PM.", food: "Sample text: Pancake place near the park for Sunday breakfast.", map: "Sample text: Park here, walk past the concession stand to Field 1.", other: "" },
      rules: defaultRules("baseball"), games: games, bracket: { size: 4, seeds: ["", "", "", ""] }, pack: pack
    });
  }

  var api = {
    VERSION: VERSION, ID_RE: ID_RE, SPORTS: SPORTS, sportInfo: sportInfo, CRITERIA: CRITERIA, GROUPS: GROUPS, BRACKET_SIZES: BRACKET_SIZES, BRACKETS: BRACKETS,
    uid: uid, clone: clone, str: str, int: int, plural: plural, isYMD: isYMD, addDays: addDays, diffDays: diffDays, weekday: weekday, todayStr: todayStr, nowParts: nowParts,
    fmtDate: fmtDate, fmtDay: fmtDay, parseTime: parseTime, fmtTime: fmtTime, startMin: startMin, fromMin: fromMin, arriveBy: arriveBy, fmtDur: fmtDur, countdownText: countdownText,
    teamKey: teamKey, cleanName: cleanName, critName: critName, defaultRules: defaultRules, sanitizeRules: sanitizeRules, explainRules: explainRules,
    sanitizeGame: sanitizeGame, effScore: effScore, capDiff: capDiff, cmpGames: cmpGames, sortGames: sortGames, groupByDay: groupByDay, isOurs: isOurs, ourSide: ourSide, oppName: oppName,
    resultFor: resultFor, gameMinutes: gameMinutes, gapInfo: gapInfo, ourGames: ourGames, nextGame: nextGame, needsScore: needsScore,
    standings: standings, standingsFor: standingsFor, headToHead: headToHead, rowFor: rowFor, scenarios: scenarios, fmtPct: fmtPct, joinNames: joinNames,
    bracketTree: bracketTree, nextSlot: nextSlot, cascade: cascade, previewBracket: previewBracket, slotTitle: slotTitle, ourPath: ourPath, seedsFromStandings: seedsFromStandings, sanitizeBracket: sanitizeBracket,
    packTemplate: packTemplate, sanitizePack: sanitizePack, packProgress: packProgress,
    sanitizeTournament: sanitizeTournament, sanitizeSettings: sanitizeSettings, newTournament: newTournament, makeBackup: makeBackup, validateBackup: validateBackup,
    renameTeam: renameTeam, teamNames: teamNames, icsFor: icsFor, summaryText: summaryText, dateRange: dateRange, sampleTournament: sampleTournament
  };
  root.TPCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
