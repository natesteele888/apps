/* Who's Where core: pure logic with no DOM, so it can be tested on its own.
   Loaded before the app files in the browser (window.WhosWhereCore) and by node tests (module.exports).

   TIME MODEL. Everything is local wall-clock time: a date as "YYYY-MM-DD" and a time as minutes since midnight.
   Dates are turned into whole day numbers with Date.UTC (never toISOString, never local-time arithmetic), so a
   daylight-saving change can't shift anything. "Absolute minutes" = dayNumber * 1440 + minute, a plain integer
   timeline that is used for every overlap check. An event that runs past midnight simply has a larger end.
   On the daylight-saving weekend a clock hour repeats or is skipped; we treat every day as 1440 clock minutes
   (floating local time, the same way the calendar file states times). */
(function (root) {
  "use strict";

  var VERSION = "Who's Where v1";
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  var RESERVED = { ride: 1, none: 1, open: 1 };       // words an event's driver/snack field can hold instead of a person
  var LIM = { people: 24, events: 2500, occ: 104, title: 80, place: 80, address: 120, notes: 600, name: 24, kids: 24, skip: 400, early: 180, drive: 240 };

  var TYPES = [
    { id: "practice", label: "Practice", icon: "\uD83C\uDFC3" },
    { id: "game", label: "Game", icon: "\uD83C\uDFDF\uFE0F" },
    { id: "tournament", label: "Tournament", icon: "\uD83C\uDFC6" },
    { id: "other", label: "Other", icon: "\uD83D\uDCCC" }
  ];
  var TYPE_IDS = TYPES.map(function (t) { return t.id; });
  function typeInfo(id) { return TYPES.filter(function (t) { return t.id === id; })[0] || TYPES[3]; }
  var COLORS = [
    { hex: "#3aa0ff", name: "Blue" }, { hex: "#ff9f43", name: "Orange" }, { hex: "#2fd08a", name: "Green" }, { hex: "#ff7eb6", name: "Pink" },
    { hex: "#b08cff", name: "Purple" }, { hex: "#ffd23f", name: "Yellow" }, { hex: "#2ed1d1", name: "Teal" }, { hex: "#a3e635", name: "Lime" }
  ];
  function colorName(hex) { var c = COLORS.filter(function (x) { return x.hex === String(hex).toLowerCase(); })[0]; return c ? c.name : "Custom"; }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ---------- small helpers ---------- */
  function isObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
  function cut(s, max) { s = s.slice(0, max); var c = s.charCodeAt(s.length - 1); if (c >= 0xD800 && c <= 0xDBFF) s = s.slice(0, -1); return s; }
  function str(x, max, multi) {
    var s = typeof x === "string" ? x : (typeof x === "number" || typeof x === "boolean" ? String(x) : "");
    if (multi) s = s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    else s = s.replace(/[\u0000-\u001f\u007f]+/g, " ");
    return cut(s.trim(), max);
  }
  function int(x, lo, hi, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean") return def;
    var n = Math.round(Number(x));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function uid() { return "x" + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 9); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  /* ---------- dates (local y-m-d, no timezone maths) ---------- */
  function ymd(y, m, d) { var ys = String(y); while (ys.length < 4) ys = "0" + ys; return ys + "-" + pad2(m) + "-" + pad2(d); }
  function dayNum(s) { var p = s.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function fromDayNum(n) { var d = new Date(n * 86400000); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  function isYMD(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4);
    if (y < 2000 || y > 2100) return false;
    return fromDayNum(dayNum(s)) === s;
  }
  function addDays(s, n) { return fromDayNum(dayNum(s) + n); }
  function diffDays(a, b) { return dayNum(a) - dayNum(b); }
  function weekday(s) { return (((dayNum(s) + 4) % 7) + 7) % 7; }            // 0 = Sunday (1970-01-01 was a Thursday)
  function startOfWeek(s, ws) { return addDays(s, -((weekday(s) - ws + 7) % 7)); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function localToday() { var d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function todayStr() {
    try { var o = root.__today; if (isYMD(o)) return o; } catch (e) { /* ignore */ }
    return localToday();
  }
  function monthGrid(y, m, ws) {
    var first = ymd(y, m, 1), dim = daysInMonth(y, m), start = startOfWeek(first, ws);
    var rows = Math.ceil((diffDays(first, start) + dim) / 7), out = [];
    for (var r = 0; r < rows; r++) {
      var wk = [];
      for (var c = 0; c < 7; c++) { var d = addDays(start, r * 7 + c); wk.push({ date: d, inMonth: d.slice(0, 7) === first.slice(0, 7) }); }
      out.push(wk);
    }
    return out;
  }
  function addMonths(s, n) { var y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return ymd(y, m + 1, 1); }
  function fmtDate(s, style) {
    var w = weekday(s), m = +s.slice(5, 7) - 1, d = +s.slice(8, 10), y = s.slice(0, 4);
    if (style === "full") return DAYS[w] + ", " + MONTHS[m] + " " + d + ", " + y;
    if (style === "day") return DAYS[w] + ", " + MONTHS_SHORT[m] + " " + d;
    if (style === "md") return MONTHS_SHORT[m] + " " + d;
    if (style === "dow") return DAYS_SHORT[w];
    if (style === "month") return MONTHS[m] + " " + y;
    return DAYS_SHORT[w] + ", " + MONTHS_SHORT[m] + " " + d;                // "short"
  }
  function weekTitle(ws) {
    var we = addDays(ws, 6), a = +ws.slice(5, 7) - 1, b = +we.slice(5, 7) - 1, d1 = +ws.slice(8, 10), d2 = +we.slice(8, 10);
    if (ws.slice(0, 4) !== we.slice(0, 4)) return MONTHS_SHORT[a] + " " + d1 + ", " + ws.slice(0, 4) + " – " + MONTHS_SHORT[b] + " " + d2 + ", " + we.slice(0, 4);
    if (a === b) return MONTHS_SHORT[a] + " " + d1 + " – " + d2 + ", " + ws.slice(0, 4);
    return MONTHS_SHORT[a] + " " + d1 + " – " + MONTHS_SHORT[b] + " " + d2 + ", " + ws.slice(0, 4);
  }

  /* ---------- times ---------- */
  function parseTime(s) {
    var m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(s == null ? "" : s).trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }
  function timeVal(x) { return typeof x === "number" ? int(x, 0, 1439, null) : parseTime(x); }
  function fmtTime(min, h24) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    if (h24) return pad2(h) + ":" + pad2(m);
    return (h % 12 || 12) + ":" + pad2(m) + " " + (h < 12 ? "AM" : "PM");
  }
  function timeInput(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return pad2(Math.floor(min / 60)) + ":" + pad2(min % 60); }
  function fmtRange(a, b, h24) {
    var x = fmtTime(a, h24), y = fmtTime(b, h24);
    if (!h24 && b > a && x.slice(-2) === y.slice(-2)) x = x.slice(0, -3);
    return x + "–" + y;
  }
  function fmtDur(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h && m ? h + " hr " + m + " min" : h ? h + " hr" : m + " min";
  }

  /* ---------- event geometry (absolute wall-clock minutes) ---------- */
  function durOf(ev) { var d = ev.end - ev.start; return d > 0 ? d : d + 1440; }
  function absStart(ev) { return dayNum(ev.date) * 1440 + ev.start; }
  function absEnd(ev) { return absStart(ev) + durOf(ev); }
  function absArrive(ev) { return absStart(ev) - (ev.early || 0); }
  function absLeave(ev) { return absArrive(ev) - (ev.drive || 0); }
  function absToLocal(abs) { var d = Math.floor(abs / 1440); return { date: fromDayNum(d), min: abs - d * 1440 }; }
  function fmtAbs(abs, h24, refDate) {
    var l = absToLocal(abs), t = fmtTime(l.min, h24);
    return refDate && l.date !== refDate ? fmtDate(l.date, "dow") + " " + t : t;
  }
  function crossesMidnight(ev) { return ev.end <= ev.start; }
  function overlap(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }
  function samePlace(a, b) { var x = norm(a.place); return x !== "" && x === norm(b.place); }
  function isAdultId(x) { return typeof x === "string" && x !== "" && !RESERVED[x]; }
  function involves(ev, pid) { return (ev.kids || []).indexOf(pid) >= 0 || ev.driver === pid || ev.snack === pid; }
  function sortEvents(list) {
    return list.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }
  function eventsInRange(events, from, to) { return sortEvents(events.filter(function (e) { return e.date >= from && e.date <= to; })); }
  function eventsOn(events, d) { return eventsInRange(events, d, d); }
  function evLabel(ev) { return ev.title + (ev.place ? " at " + ev.place : ""); }

  /* ---------- the conflict detector ----------
     KID: two events with the same kid conflict when [arrive-by, end) of one overlaps [arrive-by, end) of the other.
          Arriving early counts before the start; nothing counts after the end. Back to back (one ends exactly when
          the next one's arrive-by time starts) is fine.
     ADULT (driver, or snack duty): an adult with a job on an event is tied up from "leave home by" (arrive-by minus
          drive time) until the event ends. Two jobs conflict when those windows overlap. Getting from one place to the
          next costs the NEXT event's drive time, which is already inside its leave-by, so "the gap between one event's
          end and the next leave-by is shorter than the drive time" is the same test: leave-by of the next event falls
          before the first one ends. Two events at the same place (same text, ignoring case and spacing) never conflict
          for an adult: they are already there and the drive time between them is 0. A blank place is treated as
          unknown, so it does not get that exemption. */
  function findConflicts(events) {
    var buckets = {}, order = [];
    function put(key, item) { if (!buckets[key]) { buckets[key] = []; order.push(key); } buckets[key].push(item); }
    events.forEach(function (ev) {
      var arr = absArrive(ev), end = absEnd(ev), lv = absLeave(ev);
      (ev.kids || []).forEach(function (k) { put("k:" + k, { from: arr, to: end, ev: ev, role: "kid" }); });
      if (isAdultId(ev.driver)) put("a:" + ev.driver, { from: lv, to: end, ev: ev, role: "driver" });
      if (isAdultId(ev.snack)) put("a:" + ev.snack, { from: lv, to: end, ev: ev, role: "snack" });
    });
    var found = {}, list = [];
    function sortKey(it) { return [it.from, absStart(it.ev), it.ev.id]; }
    function cmp(x, y) { var a = sortKey(x), b = sortKey(y); return a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0); }
    order.forEach(function (key) {
      var kind = key.charAt(0) === "k" ? "kid" : "adult", who = key.slice(2), L = buckets[key].slice().sort(cmp);
      for (var i = 0; i < L.length; i++) {
        for (var j = i + 1; j < L.length && L[j].from < L[i].to; j++) {
          var X = L[i], Y = L[j];
          if (X.ev.id === Y.ev.id) continue;
          if (kind === "adult" && samePlace(X.ev, Y.ev)) continue;
          var id = kind === "kid" ? "k|" + X.ev.id + "|" + Y.ev.id : "a|" + who + "|" + X.ev.id + "|" + Y.ev.id;
          if (found[id]) { if (kind === "kid" && found[id].people.indexOf(who) < 0) found[id].people.push(who); continue; }
          var lastEnd = Math.max(absEnd(X.ev), absEnd(Y.ev));
          found[id] = { id: id, kind: kind, people: [who], a: X.ev.id, b: Y.ev.id, roles: [X.role, Y.role], firstDate: X.ev.date < Y.ev.date ? X.ev.date : Y.ev.date, lastDate: absToLocal(lastEnd - 1).date, at: Math.min(X.from, Y.from) };
          list.push(found[id]);
        }
      }
    });
    list.sort(function (p, q) { return p.at - q.at || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0); });
    return list;
  }
  function activeConflicts(list, today) { return list.filter(function (c) { return c.lastDate >= today; }); }
  function conflictsByEvent(list) {
    var m = {};
    list.forEach(function (c) { (m[c.a] = m[c.a] || []).push(c); (m[c.b] = m[c.b] || []).push(c); });
    return m;
  }
  function byId(arr) { var m = {}; arr.forEach(function (x) { m[x.id] = x; }); return m; }
  function joinNames(n) { return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; }
  function nameOf(pm, id) { return pm[id] ? pm[id].name : "Someone"; }

  /* Plain-English sentence for a conflict. */
  function conflictText(c, evm, pm, h24) {
    var A = evm[c.a], B = evm[c.b];
    if (!A || !B) return "Two events clash.";
    var names = joinNames(c.people.map(function (p) { return nameOf(pm, p); })), many = c.people.length > 1;
    if (c.kind === "kid") {
      var realOverlap = overlap(absStart(A), absEnd(A), absStart(B), absEnd(B));
      if (realOverlap) return names + (many ? " are" : " is") + " booked twice: " + evLabel(A) + " (" + fmtRange(A.start, A.end, h24) + ") overlaps " + evLabel(B) + " (" + fmtRange(B.start, B.end, h24) + ")" + (A.date !== B.date ? ", " + fmtDate(B.date, "short") : "") + ".";
      return names + (many ? " have" : " has") + " to be at " + evLabel(B) + " by " + fmtAbs(absArrive(B), h24, B.date) + ", but " + evLabel(A) + " runs until " + fmtAbs(absEnd(A), h24, A.date) + ".";
    }
    var what = c.roles[1] === "snack" ? "bring the snack to " : "drive to ";
    return names + " has to leave by " + fmtAbs(absLeave(B), h24, B.date) + " to " + what + evLabel(B) + ", but is still at " + evLabel(A) + " until " + fmtAbs(absEnd(A), h24, A.date) + ".";
  }

  /* Is this adult free to take a job on ev (no clash with their other jobs)? */
  function adultFreeFor(adult, ev, events) {
    var from = absLeave(ev), to = absEnd(ev);
    for (var i = 0; i < events.length; i++) {
      var o = events[i];
      if (o.id === ev.id || (o.driver !== adult && o.snack !== adult)) continue;
      if (samePlace(ev, o)) continue;
      if (overlap(from, to, absLeave(o), absEnd(o))) return false;
    }
    return true;
  }
  function freeAdults(ev, role, events, people) {
    var cur = role === "snack" ? ev.snack : ev.driver;
    return people.filter(function (p) { return p.role === "adult" && p.id !== cur && adultFreeFor(p.id, ev, events); }).map(function (p) { return p.id; });
  }

  /* Ordered list of fixes for one conflict. type: assign (one tap), open (mark as needing someone), removeKids, edit. */
  function suggestFixes(c, events, people) {
    var evm = byId(events), pm = byId(people), A = evm[c.a], B = evm[c.b], out = [];
    if (!A || !B) return out;
    if (c.kind === "adult") {
      [[B, c.roles[1]], [A, c.roles[0]]].forEach(function (pair) {
        var ev = pair[0], role = pair[1], verb = role === "snack" ? "bring the snack to" : "drive";
        freeAdults(ev, role, events, people).slice(0, 2).forEach(function (pid) {
          out.push({ type: "assign", event: ev.id, person: pid, role: role, label: "Assign " + nameOf(pm, pid) + " to " + verb + " " + evLabel(ev) });
        });
      });
      out.push({ type: "open", event: B.id, role: c.roles[1], label: c.roles[1] === "snack" ? "Ask someone else to bring the snack to " + evLabel(B) : "Ask someone else to drive to " + evLabel(B) });
    } else {
      [A, B].forEach(function (ev) {
        var other = ev === A ? B : A, shared = c.people.filter(function (p) { return (other.kids || []).indexOf(p) >= 0; });
        out.push({ type: "removeKids", event: ev.id, kids: shared, label: "Take " + joinNames(shared.map(function (p) { return nameOf(pm, p); })) + " off " + evLabel(ev) });
      });
    }
    out.push({ type: "edit", event: B.id, label: "Edit " + evLabel(B) });
    out.push({ type: "edit", event: A.id, label: "Edit " + evLabel(A) });
    return out;
  }
  /* Apply one fix to an events array; returns a new array. */
  function applyFix(events, fix) {
    return events.map(function (e) {
      if (e.id !== fix.event) return e;
      var n = clone(e);
      if (fix.type === "assign") { if (fix.role === "snack") n.snack = fix.person; else n.driver = fix.person; }
      else if (fix.type === "open") { if (fix.role === "snack") n.snack = "open"; else n.driver = "ride"; }
      else if (fix.type === "removeKids") n.kids = n.kids.filter(function (k) { return fix.kids.indexOf(k) < 0; });
      else if (fix.type === "set" && (fix.field === "driver" || fix.field === "snack")) n[fix.field] = fix.value;
      return n;
    });
  }

  /* What needs attention, from today on. Returns {conflicts, events} each with date + sort order. */
  function driverMissing(ev) { return ev.driver === "" || ev.driver === "ride"; }
  function needsAttention(events, conflicts, today, horizonDays) {
    var lim = isFinite(horizonDays) ? addDays(today, horizonDays) : "9999-12-31", evm = byId(events);
    var cs = conflicts.filter(function (c) { return c.lastDate >= today && c.firstDate < lim && evm[c.a] && evm[c.b]; });
    var es = [];
    sortEvents(events).forEach(function (ev) {
      if (ev.date < today || ev.date >= lim) return;
      var issues = [];
      if (driverMissing(ev)) issues.push(ev.driver === "ride" ? "ride" : "driver");
      if (ev.snack === "open") issues.push("snack");
      if (issues.length) es.push({ event: ev, issues: issues });
    });
    function key(date, min) { return date + " " + pad2(Math.floor(min / 60)) + pad2(min % 60); }
    var items = cs.map(function (c) {
      var A = evm[c.a], B = evm[c.b], first = absStart(A) <= absStart(B) ? A : B;
      return { type: "conflict", conflict: c, date: first.date, key: key(first.date, first.start) };
    }).concat(es.map(function (x) { return { type: "event", event: x.event, issues: x.issues, date: x.event.date, key: key(x.event.date, x.event.start) }; }));
    items.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.type === b.type ? 0 : a.type === "conflict" ? -1 : 1; });
    return { items: items, conflicts: cs.length, missing: es.length, evm: evm };
  }

  /* ---------- recurrence (weekly; each occurrence is its own stored event, tied together by a series id) ---------- */
  function weeklyDates(start, o) {
    o = o || {};
    var out = [], skip = o.skip || [], max = Math.min(LIM.occ, o.count > 0 ? Math.floor(o.count) : LIM.occ);
    if (!o.until && !(o.count > 0)) return [start];
    for (var i = 0; i < max; i++) {
      var d = addDays(start, i * 7);
      if (o.until && d > o.until) break;
      if (skip.indexOf(d) < 0) out.push(d);
    }
    return out;
  }
  function seriesOf(events, sid) { return sortEvents(events.filter(function (e) { return sid && e.series === sid; })); }
  function seriesLast(events, sid) { var s = seriesOf(events, sid); return s.length ? s[s.length - 1].date : null; }
  function seriesEntry(state, sid) { return (state.series || []).filter(function (s) { return s.id === sid; })[0] || null; }
  function withSeries(list, sid, skip) {
    var rest = (list || []).filter(function (s) { return s.id !== sid; });
    return skip === null ? rest : rest.concat([{ id: sid, skip: skip }]);
  }
  /* Make a repeating series out of one event. Returns {events, series}; the first occurrence keeps the event's id. */
  function makeSeries(state, ev, o, idGen) {
    var dates = weeklyDates(ev.date, o);
    if (dates.length < 2) { var one = clone(ev); one.series = ""; return { events: state.events.filter(function (e) { return e.id !== ev.id; }).concat([one]), series: state.series || [] }; }
    var sid = (idGen || uid)();
    var added = dates.map(function (d, i) { var n = clone(ev); n.date = d; n.series = sid; n.id = i === 0 && d === ev.date ? ev.id : (idGen || uid)(); return n; });
    var rest = state.events.filter(function (e) { return e.id !== ev.id; });
    return { events: rest.concat(added), series: withSeries(state.series, sid, []) };
  }
  /* Edit this and all later events of a series: they are removed and written again from the new fields. */
  function rewriteFuture(state, anchorId, fields, until, idGen) {
    var anchor = state.events.filter(function (e) { return e.id === anchorId; })[0];
    if (!anchor || !anchor.series) return null;
    var sid = anchor.series, ent = seriesEntry(state, sid), skip = (ent ? ent.skip : []).filter(function (d) { return d !== fields.date; });
    var kept = state.events.filter(function (e) { return !(e.series === sid && e.date >= anchor.date); });
    var dates = weeklyDates(fields.date, { until: until, skip: skip });
    if (!dates.length) dates = [fields.date];
    var added = dates.map(function (d, i) { var n = clone(fields); n.date = d; n.series = sid; n.id = i === 0 ? anchor.id : (idGen || uid)(); return n; });
    return { events: kept.concat(added), series: withSeries(state.series, sid, skip) };
  }
  /* Delete one occurrence ("one") or this and all later ones ("future"). */
  function deleteFromSeries(state, evId, scope) {
    var ev = state.events.filter(function (e) { return e.id === evId; })[0];
    if (!ev) return { events: state.events, series: state.series || [] };
    var sid = ev.series, events, series = state.series || [];
    if (!sid || scope !== "future") {
      events = state.events.filter(function (e) { return e.id !== evId; });
      if (sid) { var ent = seriesEntry(state, sid), sk = ent ? ent.skip.slice() : []; if (sk.indexOf(ev.date) < 0) sk.push(ev.date); series = withSeries(series, sid, sk.slice(-LIM.skip)); }
    } else {
      events = state.events.filter(function (e) { return !(e.series === sid && e.date >= ev.date); });
    }
    if (sid && !seriesOf(events, sid).length) series = withSeries(series, sid, null);
    return { events: events, series: series };
  }

  /* ---------- calendar file (RFC 5545) ---------- */
  function icsEscape(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n"); }
  function utf8len(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
  function foldLine(line) {
    var out = [], cur = "", bytes = 0;
    for (var ch of line) {
      var b = utf8len(ch.codePointAt(0));
      if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function icsLocal(abs) { var l = absToLocal(abs); return l.date.replace(/-/g, "") + "T" + pad2(Math.floor(l.min / 60)) + pad2(l.min % 60) + "00"; }
  function icsStamp(now) {
    var d = now instanceof Date ? now : new Date(typeof now === "number" ? now : Date.now());
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }
  function driverText(ev, pm) { return ev.driver === "ride" ? "needs a ride" : ev.driver === "none" ? "no driving needed" : isAdultId(ev.driver) ? nameOf(pm, ev.driver) : "not decided yet"; }
  function snackText(ev, pm) { return ev.snack === "open" ? "needs someone" : isAdultId(ev.snack) ? nameOf(pm, ev.snack) : ""; }
  function eventDescription(ev, pm, h24) {
    var lines = [];
    var kids = (ev.kids || []).map(function (k) { return nameOf(pm, k); });
    if (kids.length) lines.push("Players: " + kids.join(", "));
    lines.push("Driver: " + driverText(ev, pm));
    if (snackText(ev, pm)) lines.push("Snack: " + snackText(ev, pm));
    if (ev.early > 0) lines.push("Arrive by " + fmtAbs(absArrive(ev), h24) + " (" + ev.early + " min early)");
    if (ev.drive > 0 && ev.driver !== "none") lines.push("Leave by " + fmtAbs(absLeave(ev), h24) + " (about " + ev.drive + " min drive)");
    if (ev.address) lines.push("Address: " + ev.address);
    if (ev.notes) lines.push("Notes: " + ev.notes);
    return lines.join("\n");
  }
  function vevent(ev, pm, stamp, h24) {
    var L = ["BEGIN:VEVENT", "UID:" + ev.id + "@whoswhere.local", "DTSTAMP:" + stamp,
      "DTSTART:" + icsLocal(absStart(ev)), "DTEND:" + icsLocal(absEnd(ev)), "SUMMARY:" + icsEscape(ev.title)];
    var loc = [ev.place, ev.address].filter(Boolean).join(", ");
    if (loc) L.push("LOCATION:" + icsEscape(loc));
    L.push("DESCRIPTION:" + icsEscape(eventDescription(ev, pm, h24)));
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(ev.title + " starts in 1 hour"), "TRIGGER:-PT60M", "END:VALARM", "END:VEVENT");
    return L;
  }
  /* A whole calendar file. Times are floating local time (no time zone), so they show at the same clock time anywhere. */
  function icsCalendar(events, people, now, h24) {
    var pm = byId(people || []), stamp = icsStamp(now), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Whos Where//Family Sports Week//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Who's Where"];
    sortEvents(events).forEach(function (ev) { L = L.concat(vevent(ev, pm, stamp, h24)); });
    L.push("END:VCALENDAR");
    return L.map(foldLine).join("\r\n") + "\r\n";
  }
  function fileSlug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "event"; }

  /* ---------- the week as plain text for a group chat ---------- */
  function weekText(events, people, ws, h24) {
    var pm = byId(people || []), out = ["Week of " + weekTitle(ws), ""];
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i), list = eventsOn(events, d);
      out.push(fmtDate(d, "short"));
      if (!list.length) out.push("• Nothing planned");
      list.forEach(function (ev) {
        var head = "• " + fmtRange(ev.start, ev.end, h24) + (crossesMidnight(ev) ? " (ends next day)" : "") + " " + evLabelText(ev);
        if (ev.early > 0) head += " (arrive " + fmtAbs(absArrive(ev), h24) + ")";
        out.push(head);
        var bits = [];
        var kids = (ev.kids || []).map(function (k) { return nameOf(pm, k); });
        if (kids.length) bits.push(kids.join(", "));
        if (ev.driver !== "none") bits.push("Driver: " + (isAdultId(ev.driver) ? nameOf(pm, ev.driver) : "NEEDED"));
        if (ev.snack === "open") bits.push("Snack: NEEDED"); else if (isAdultId(ev.snack)) bits.push("Snack: " + nameOf(pm, ev.snack));
        if (bits.length) out.push("  " + bits.join(" · "));
        if (ev.address) out.push("  Address: " + ev.address);
        if (ev.notes) out.push("  Note: " + ev.notes.replace(/\n+/g, " "));
      });
      out.push("");
    }
    return out.join("\n").replace(/\n+$/, "") + "\n";
  }
  function evLabelText(ev) { return ev.title + (ev.place ? " @ " + ev.place : ""); }
  function mapsUrl(ev) {
    var q = [ev.place, ev.address].filter(Boolean).join(", ");
    return q ? "https://maps.google.com/?q=" + encodeURIComponent(q) : "";
  }

  /* ---------- cleaning data (from storage or a backup file) ---------- */
  function hexColor(c) { c = String(c || "").toLowerCase(); return /^#[0-9a-f]{6}$/.test(c) ? c : ""; }
  function cleanId(id, seen) { return typeof id === "string" && ID_RE.test(id) && !RESERVED[id] && !seen[id] ? id : ""; }
  function sanitizePerson(p, seen, idx) {
    if (!isObj(p)) return null;
    var name = str(p.name, LIM.name);
    if (!name) return null;
    var id = cleanId(p.id, seen) || uid();
    return { id: id, name: name, role: p.role === "adult" ? "adult" : "player", color: hexColor(p.color) || COLORS[(idx || 0) % COLORS.length].hex };
  }
  function sanitizeSettings(s) {
    s = isObj(s) ? s : {};
    return { weekStart: s.weekStart === 1 ? 1 : 0, h24: s.h24 === true, driveMin: int(s.driveMin, 0, LIM.drive, 15), earlyMin: int(s.earlyMin, 0, LIM.early, 0) };
  }
  function sanitizeEvent(e, ctx, seen) {
    if (!isObj(e) || !isYMD(e.date)) return null;
    var start = timeVal(e.start), end = timeVal(e.end);
    if (start === null || end === null) return null;
    if (end === start) end = (start + 60) % 1440;
    var type = TYPE_IDS.indexOf(e.type) >= 0 ? e.type : "other";
    var kids = [], seenK = {};
    (Array.isArray(e.kids) ? e.kids : []).forEach(function (k) { if (typeof k === "string" && ctx.kids[k] && !seenK[k] && kids.length < LIM.kids) { seenK[k] = 1; kids.push(k); } });
    var driver = e.driver === "ride" || e.driver === "none" ? e.driver : (typeof e.driver === "string" && ctx.adults[e.driver] ? e.driver : "");
    var snack = e.snack === "open" ? "open" : (typeof e.snack === "string" && ctx.adults[e.snack] ? e.snack : "");
    return {
      id: cleanId(e.id, seen) || uid(), title: str(e.title, LIM.title) || typeInfo(type).label, type: type, date: e.date, start: start, end: end,
      place: str(e.place, LIM.place), address: str(e.address, LIM.address), kids: kids, driver: driver, snack: snack,
      notes: str(e.notes, LIM.notes, true), early: int(e.early, 0, LIM.early, 0), drive: int(e.drive, 0, LIM.drive, 0),
      series: typeof e.series === "string" && ID_RE.test(e.series) ? e.series : ""
    };
  }
  function sanitizeState(raw) {
    raw = isObj(raw) ? raw : {};
    var people = [], seen = Object.create(null), dropped = { people: 0, events: 0 }, ctx = { kids: Object.create(null), adults: Object.create(null) };
    (Array.isArray(raw.people) ? raw.people : []).forEach(function (p) {
      if (people.length >= LIM.people) { dropped.people++; return; }
      var q = sanitizePerson(p, seen, people.length);
      if (!q) { dropped.people++; return; }
      seen[q.id] = 1; people.push(q);
      (q.role === "adult" ? ctx.adults : ctx.kids)[q.id] = 1;
    });
    var events = [], seenE = Object.create(null);
    (Array.isArray(raw.events) ? raw.events : []).forEach(function (e) {
      if (events.length >= LIM.events) { dropped.events++; return; }
      var q = sanitizeEvent(e, ctx, seenE);
      if (!q) { dropped.events++; return; }
      seenE[q.id] = 1; events.push(q);
    });
    var sids = Object.create(null);
    events.forEach(function (e) { if (e.series) sids[e.series] = 1; });
    var series = [], seenS = Object.create(null);
    (Array.isArray(raw.series) ? raw.series : []).forEach(function (s) {
      if (!isObj(s) || typeof s.id !== "string" || !sids[s.id] || seenS[s.id]) return;
      seenS[s.id] = 1;
      series.push({ id: s.id, skip: (Array.isArray(s.skip) ? s.skip : []).filter(isYMD).slice(0, LIM.skip) });
    });
    events.forEach(function (e) { if (e.series && !seenS[e.series]) { seenS[e.series] = 1; series.push({ id: e.series, skip: [] }); } });
    return { people: people, events: events, series: series, settings: sanitizeSettings(raw.settings), dropped: dropped };
  }
  function makeBackup(state, today) {
    return { app: "whoswhere", v: 1, exported: today, people: state.people, events: state.events, series: state.series, settings: state.settings };
  }
  function validateBackup(obj) {
    if (!isObj(obj) || obj.app !== "whoswhere") return { ok: false, error: "That file isn't a Who's Where backup." };
    if (typeof obj.v !== "number" || obj.v > 1) return { ok: false, error: "That backup was made by a newer version of Who's Where. Update the app and try again." };
    if (!Array.isArray(obj.people) || !Array.isArray(obj.events)) return { ok: false, error: "That backup is missing its people or events." };
    var st = sanitizeState(obj);
    if (!st.people.length && !st.events.length) return { ok: false, error: "That backup has no people or events that can be read." };
    return { ok: true, state: st, dropped: st.dropped };
  }

  /* ---------- sample data (dates relative to today, so it always looks current) ---------- */
  function sampleState(today, weekStart, idGen) {
    var gen = idGen || uid, ws = startOfWeek(today, weekStart);
    var P = [
      { id: "kid1", name: "Kid 1", role: "player", color: COLORS[0].hex }, { id: "kid2", name: "Kid 2", role: "player", color: COLORS[1].hex },
      { id: "parentA", name: "Parent A", role: "adult", color: COLORS[2].hex }, { id: "parentB", name: "Parent B", role: "adult", color: COLORS[4].hex }
    ];
    var events = [], series = [];
    function dayOf(wd, add) { return addDays(ws, ((wd - weekStart + 7) % 7) + (add || 0)); }
    function t(h, m) { return h * 60 + (m || 0); }
    function add(f, weeks) {
      var base = { id: gen(), title: "", type: "practice", date: "", start: 0, end: 0, place: "", address: "", kids: [], driver: "", snack: "", notes: "", early: 0, drive: 0, series: "" };
      var ev = Object.assign(base, f);
      if (weeks > 1) {
        var r = makeSeries({ events: events, series: series }, ev, { count: weeks }, gen);
        events = r.events; series = r.series;
      } else events.push(ev);
    }
    add({ title: "Practice", date: dayOf(1), start: t(16, 30), end: t(17, 30), place: "Main Gym", kids: ["kid1"], driver: "parentB", early: 10, drive: 15 }, 4);
    add({ title: "Practice", date: dayOf(2), start: t(17), end: t(18, 15), place: "Main Gym", kids: ["kid1"], driver: "parentA", early: 10, drive: 15 }, 4);
    add({ title: "Practice", date: dayOf(2), start: t(17, 30), end: t(18, 30), place: "Rec Center", kids: ["kid2"], driver: "parentA", early: 5, drive: 20 }, 4);
    add({ title: "Game", type: "game", date: dayOf(3), start: t(18), end: t(19, 30), place: "Park Field 2", kids: ["kid1"], driver: "", snack: "open", early: 30, drive: 25, notes: "Wear the away jersey." }, 4);
    add({ title: "Practice", date: dayOf(4), start: t(16, 30), end: t(17, 30), place: "Rec Center", kids: ["kid2"], driver: "parentB", early: 5, drive: 20 }, 4);
    add({ title: "Team pizza night", type: "other", date: dayOf(5), start: t(18, 30), end: t(20), place: "Community Hall", kids: ["kid1", "kid2"], driver: "parentA", drive: 10 }, 1);
    add({ title: "Tournament day", type: "tournament", date: dayOf(6), start: t(8), end: t(14), place: "Riverside Complex", address: "100 Example Rd", kids: ["kid1", "kid2"], driver: "parentA", snack: "parentB", early: 45, drive: 35, notes: "Bring chairs and sunscreen." }, 1);
    add({ title: "Game", type: "game", date: dayOf(0), start: t(13), end: t(14, 30), place: "Park Field 1", kids: ["kid2"], driver: "parentB", snack: "parentA", early: 20, drive: 15 }, 1);
    return { people: P, events: events, series: series, settings: sanitizeSettings({ weekStart: weekStart }) };
  }

  var api = {
    VERSION: VERSION, ID_RE: ID_RE, LIM: LIM, TYPES: TYPES, TYPE_IDS: TYPE_IDS, typeInfo: typeInfo, COLORS: COLORS, colorName: colorName,
    DAYS: DAYS, DAYS_SHORT: DAYS_SHORT, MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT,
    isObj: isObj, str: str, int: int, uid: uid, clone: clone, norm: norm, byId: byId, joinNames: joinNames,
    ymd: ymd, dayNum: dayNum, fromDayNum: fromDayNum, isYMD: isYMD, addDays: addDays, diffDays: diffDays, weekday: weekday, startOfWeek: startOfWeek,
    daysInMonth: daysInMonth, todayStr: todayStr, monthGrid: monthGrid, addMonths: addMonths, fmtDate: fmtDate, weekTitle: weekTitle,
    parseTime: parseTime, fmtTime: fmtTime, timeInput: timeInput, fmtRange: fmtRange, fmtDur: fmtDur,
    durOf: durOf, absStart: absStart, absEnd: absEnd, absArrive: absArrive, absLeave: absLeave, absToLocal: absToLocal, fmtAbs: fmtAbs, crossesMidnight: crossesMidnight,
    samePlace: samePlace, isAdultId: isAdultId, involves: involves, sortEvents: sortEvents, eventsInRange: eventsInRange, eventsOn: eventsOn, evLabel: evLabel,
    findConflicts: findConflicts, activeConflicts: activeConflicts, conflictsByEvent: conflictsByEvent, conflictText: conflictText,
    adultFreeFor: adultFreeFor, freeAdults: freeAdults, suggestFixes: suggestFixes, applyFix: applyFix, driverMissing: driverMissing, needsAttention: needsAttention,
    weeklyDates: weeklyDates, seriesOf: seriesOf, seriesLast: seriesLast, makeSeries: makeSeries, rewriteFuture: rewriteFuture, deleteFromSeries: deleteFromSeries,
    icsEscape: icsEscape, foldLine: foldLine, icsCalendar: icsCalendar, icsStamp: icsStamp, eventDescription: eventDescription, fileSlug: fileSlug,
    weekText: weekText, mapsUrl: mapsUrl, driverText: driverText, snackText: snackText,
    sanitizePerson: sanitizePerson, sanitizeEvent: sanitizeEvent, sanitizeSettings: sanitizeSettings, sanitizeState: sanitizeState, makeBackup: makeBackup, validateBackup: validateBackup,
    sampleState: sampleState
  };
  root.WhosWhereCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
