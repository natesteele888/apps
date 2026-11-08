/* Practice Clock core: pure logic with no DOM, so it can be tested on its own.
   Loaded before the app in the browser (window.PracticeClockCore) and by node tests (module.exports).

   Time model in one paragraph: a running practice stores a start timestamp, the total milliseconds spent
   paused, and the minute adjustments the coach made. "Where are we?" is always computed from the clock
   (now - start - paused), never by counting ticks, so a sleeping phone or a throttled tab can't drift.
   Skip / back / restart move the start timestamp (a "rebase"); +/-1 minute changes one block's length. */
(function (root) {
  "use strict";

  var VERSION = "Practice Clock v1";
  var MIN = 60000;
  var L = {
    blockMin: 1, blockMax: 180, stationsMin: 2, stationsMax: 8, maxBlocks: 60, maxPlanMin: 1440, maxPlans: 60,
    nameMax: 40, blockNameMax: 40, noteMax: 120, labelMax: 24, histMax: 20, shareMax: 3000, hashMax: 20000,
    minLeftMs: 30000 /* -1 min never leaves less than 0:30 on the clock */, segMaxMs: 180 * MIN
  };
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  var HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  var SPORTS = [
    { id: "baseball", label: "Baseball", icon: "⚾" },
    { id: "softball", label: "Softball", icon: "🥎" },
    { id: "basketball", label: "Basketball", icon: "🏀" },
    { id: "cheer", label: "Cheer", icon: "📣" },
    { id: "football", label: "Football", icon: "🏈" },
    { id: "other", label: "Other", icon: "🏅" }
  ];
  var SPORT_IDS = SPORTS.map(function (s) { return s.id; });
  function sportInfo(id) { return SPORTS.filter(function (s) { return s.id === id; })[0] || SPORTS[5]; }

  var COLORS = [
    { id: "amber", hex: "#ffb020", name: "Amber" }, { id: "red", hex: "#ff6a5c", name: "Red" },
    { id: "green", hex: "#5fd38d", name: "Green" }, { id: "blue", hex: "#5bb8ff", name: "Blue" },
    { id: "purple", hex: "#b48cff", name: "Purple" }, { id: "pink", hex: "#ff8fc7", name: "Pink" },
    { id: "teal", hex: "#4fd6c8", name: "Teal" }, { id: "slate", hex: "#a9b4c0", name: "Gray" }
  ];
  var COLOR_IDS = COLORS.map(function (c) { return c.id; });
  function colorHex(id) { var c = COLORS.filter(function (x) { return x.id === id; })[0]; return c ? c.hex : ""; }

  /* ---------- small helpers ---------- */
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  // text: control characters and bidi overrides out, line breaks become spaces, trimmed, cut to length
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null || typeof x === "object" ? "" : String(x));
    s = s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "");
    return s.trim().slice(0, max);
  }
  function int(x, lo, hi, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean" || typeof x === "object") return def;
    var n = Math.round(Number(x));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function num(x, def) { return typeof x === "number" && isFinite(x) ? x : def; }
  function uid() {
    var s = "";
    try {
      var b = new Uint8Array(6); (root.crypto || {}).getRandomValues(b);
      for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36);
    } catch (e) { s = Math.random().toString(36).slice(2, 8); }
    return s + Date.now().toString(36).slice(-4);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isYMD(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10), t = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  /* Tests (and nothing else) can set window.__today = "YYYY-MM-DD" to pin the date. */
  function todayStr(nowMs) {
    try { var o = root.__today; if (isYMD(o)) return o; } catch (e) { /* ignore */ }
    var d = new Date(typeof nowMs === "number" ? nowMs : Date.now());
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function fmtDate(ymd) {
    if (!isYMD(ymd)) return "";
    var d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + ", " +
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function diffDays(a, b) { return Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86400000); }

  /* ---------- clock-of-day helpers (minutes since midnight) ---------- */
  function parseHM(s) { var m = typeof s === "string" ? HM_RE.exec(s) : null; return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function toHM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
  function meridiem(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return min < 720 ? "AM" : "PM"; }
  function fmtHM(min, noSuffix) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + pad(m) + (noSuffix ? "" : " " + (h < 12 ? "AM" : "PM"));
  }
  // "4:30-4:50 PM" when both ends are in the same half of the day, else "11:30 AM-12:10 PM"
  function fmtRange(a, b, sep) {
    sep = sep == null ? "–" : sep;
    return meridiem(a) === meridiem(b) ? fmtHM(a, true) + sep + fmtHM(b) : fmtHM(a) + sep + fmtHM(b);
  }
  // local clock time of a timestamp as minutes since midnight (fractions kept)
  function minutesOfDay(ms) { var d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000; }
  // the next 5-minute mark at or after this moment (4:35:00 stays 4:35, 4:35:01 becomes 4:40); wraps at midnight
  function roundUp5(ms) {
    var d = new Date(ms), secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    return ((Math.ceil(secs / 300 - 1e-9) * 5) % 1440) || 0;
  }
  // 'm:ss' under an hour, 'h:mm:ss' from an hour; rounds UP so 0:00 only shows when the block is really over
  function fmtClock(ms) {
    var s = Math.max(0, Math.ceil((ms - 1e-6) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h > 0 ? h + ":" + pad(m) + ":" + pad(r) : m + ":" + pad(r);
  }
  function fmtMin(n) { return n + " min"; }

  /* ---------- blocks and plans ---------- */
  function sanitizeBlock(b) {
    if (!isObj(b)) return null;
    var type = b.type === "stations" ? "stations" : "normal";
    var o = {
      id: typeof b.id === "string" && ID_RE.test(b.id) ? b.id : uid(),
      name: str(b.name, L.blockNameMax) || (type === "stations" ? "Stations" : "Block"),
      min: int(b.min, L.blockMin, L.blockMax, 5),
      note: str(b.note, L.noteMax),
      color: COLOR_IDS.indexOf(b.color) >= 0 ? b.color : "",
      type: type, stations: 0, labels: []
    };
    if (type === "stations") {
      o.stations = int(b.stations, L.stationsMin, L.stationsMax, 4);
      var src = Array.isArray(b.labels) ? b.labels : [];
      for (var i = 0; i < o.stations; i++) o.labels.push(str(src[i], L.labelMax));
    }
    return o;
  }
  function blockMinutes(b) { return b.type === "stations" ? b.stations * b.min : b.min; }
  function planMinutes(p) { var t = 0; for (var i = 0; i < p.blocks.length; i++) t += blockMinutes(p.blocks[i]); return t; }
  function validHM(s) { return typeof s === "string" && HM_RE.test(s) ? s : ""; }
  /* Returns a clean plan, or null when it can't be one (not an object, too many blocks, longer than 24 hours,
     or no blocks when opts.requireBlocks). Out-of-range numbers are clamped, unknown things dropped. */
  function sanitizePlan(p, opts) {
    opts = opts || {};
    if (!isObj(p) || !Array.isArray(p.blocks) || p.blocks.length > L.maxBlocks) return null;
    var seen = {}, blocks = [];
    for (var i = 0; i < p.blocks.length; i++) {
      var b = sanitizeBlock(p.blocks[i]);
      if (!b) continue;
      if (seen[b.id]) b.id = uid();
      seen[b.id] = 1; blocks.push(b);
    }
    if (opts.requireBlocks && !blocks.length) return null;
    var plan = {
      id: typeof p.id === "string" && ID_RE.test(p.id) ? p.id : uid(),
      name: str(p.name, L.nameMax) || "Practice plan",
      sport: SPORT_IDS.indexOf(p.sport) >= 0 ? p.sport : "other",
      start: validHM(p.start), endBy: validHM(p.endBy), wait: p.wait === true,
      blocks: blocks
    };
    if (planMinutes(plan) > L.maxPlanMin) return null;
    return plan;
  }

  function sanitizeSettings(s) {
    s = isObj(s) ? s : {};
    return {
      volume: int(s.volume, 0, 100, 70),
      ticks: s.ticks === false ? false : true,
      vibrate: s.vibrate === false ? false : true,
      awake: s.awake === false ? false : true
    };
  }

  /* ---------- schedule and position ---------- */
  /* A plan is a list of segments: a normal block is one segment, a stations block is N segments
     ("Station 2 of 4"). adj maps segment index -> milliseconds added (or removed) by the coach. */
  function segments(plan, adj) {
    var out = [];
    adj = adj || {};
    for (var bi = 0; bi < plan.blocks.length; bi++) {
      var b = plan.blocks[bi], n = b.type === "stations" ? b.stations : 1;
      for (var k = 1; k <= n; k++) {
        var idx = out.length, base = b.min * MIN, a = adj[idx];
        out.push({
          index: idx, bi: bi, blockId: b.id, name: b.name, note: b.note, color: b.color,
          kind: b.type === "stations" ? "station" : "normal", station: b.type === "stations" ? k : 0, stations: b.type === "stations" ? n : 0,
          label: b.type === "stations" ? (b.labels[k - 1] || "") : "", baseMs: base,
          durMs: Math.max(0, base + (typeof a === "number" && isFinite(a) ? a : 0))
        });
      }
    }
    return out;
  }
  // segments with absolute start and end timestamps for a practice that begins at startMs
  function schedule(plan, startMs, adj) {
    var segs = segments(plan, adj), t = startMs;
    for (var i = 0; i < segs.length; i++) { segs[i].offsetMs = t - startMs; segs[i].startMs = t; t += segs[i].durMs; segs[i].endMs = t; }
    return segs;
  }
  /* Where is the practice at nowMs? Boundaries belong to the block that starts there: at exactly the end of
     block 1 you are at 0 seconds into block 2. Paused time is subtracted; callers who are paused pass the
     moment they paused as nowMs. */
  function positionAt(plan, startMs, nowMs, adjustments, pausedMs) {
    var segs = segments(plan, adjustments), total = 0, i;
    for (i = 0; i < segs.length; i++) total += segs[i].durMs;
    var elapsed = nowMs - startMs - (pausedMs || 0);
    if (!isFinite(elapsed) || elapsed < 0) elapsed = 0;
    if (!segs.length) return { segIndex: -1, seg: null, segElapsedMs: 0, segDurMs: 0, segOffsetMs: 0, remainingMs: 0, elapsedMs: 0, totalMs: 0, totalRemainingMs: 0, finished: true, count: 0 };
    var acc = 0;
    for (i = 0; i < segs.length; i++) {
      var end = acc + segs[i].durMs;
      if (elapsed < end) {
        return { segIndex: i, seg: segs[i], segElapsedMs: elapsed - acc, segDurMs: segs[i].durMs, segOffsetMs: acc, remainingMs: end - elapsed, elapsedMs: elapsed, totalMs: total, totalRemainingMs: total - elapsed, finished: false, count: segs.length };
      }
      acc = end;
    }
    var last = segs[segs.length - 1];
    return { segIndex: segs.length - 1, seg: last, segElapsedMs: last.durMs, segDurMs: last.durMs, segOffsetMs: total - last.durMs, remainingMs: 0, elapsedMs: total, totalMs: total, totalRemainingMs: 0, finished: true, count: segs.length };
  }
  function offsetOf(plan, adj, segIndex) {
    var segs = segments(plan, adj), t = 0;
    for (var i = 0; i < segIndex && i < segs.length; i++) t += segs[i].durMs;
    return t;
  }

  /* ---------- the running practice (a plain object that is saved on the phone) ---------- */
  function cloneRun(r) { var o = {}, k; for (k in r) o[k] = r[k]; o.adj = {}; for (k in r.adj) o.adj[k] = r.adj[k]; return o; }
  function newRun(plan, nowMs, date) {
    return { v: 1, planId: plan.id, plan: clone(plan), date: isYMD(date) ? date : todayStr(nowMs), t0: nowMs, startMs: nowMs, pausedAt: null, pausedMs: 0, adj: {}, ack: 0, holding: false, finished: false, endedAt: null, endReason: "", logged: false };
  }
  // the moment the clock is "at": now, or the moment it was paused / ended
  function runNow(run, nowMs) { return run.pausedAt != null ? run.pausedAt : nowMs; }
  function runPos(run, nowMs) { return positionAt(run.plan, run.startMs, runNow(run, nowMs), run.adj, run.pausedMs); }
  /* Applies what time passing does: finishing the practice, or, for a "wait for me" plan, stopping at the end
     of a block until the coach taps. Safe to call as often as you like; returns the same object when nothing changed. */
  function settle(run, nowMs) {
    if (run.finished) return run;
    var pos = runPos(run, nowMs), r;
    if (pos.finished) {
      var endAt = run.pausedAt != null ? run.pausedAt : run.startMs + run.pausedMs + pos.totalMs;
      r = cloneRun(run); r.finished = true; r.holding = false; r.pausedAt = endAt; r.endedAt = endAt; r.endReason = r.endReason || "done";
      return r;
    }
    if (run.pausedAt == null && run.plan.wait && pos.segIndex > run.ack) {
      var segs = segments(run.plan, run.adj), off = 0;
      for (var i = 0; i <= run.ack && i < segs.length; i++) off += segs[i].durMs;
      r = cloneRun(run); r.pausedAt = run.startMs + run.pausedMs + off; r.holding = true;
      return r;
    }
    return run;
  }
  function withAck(r, nowMs) { var p = runPos(r, nowMs); r.ack = p.segIndex < 0 ? 0 : p.segIndex; return r; }
  function pauseRun(run, nowMs) {
    if (run.finished || run.pausedAt != null) return run;
    var r = cloneRun(run); r.pausedAt = nowMs; return r;
  }
  function resumeRun(run, nowMs) {
    if (run.finished || run.pausedAt == null) return run;
    var r = cloneRun(run);
    r.pausedMs += Math.max(0, nowMs - run.pausedAt); r.pausedAt = null; r.holding = false;
    return settle(withAck(r, nowMs), nowMs);
  }
  // jump to the start of the next segment (the next station, or the next block); on the last one, finish
  function skipNext(run, nowMs) {
    if (run.finished) return run;
    var pos = runPos(run, nowMs);
    if (pos.finished) return settle(run, nowMs);
    var r = cloneRun(run); r.startMs -= pos.remainingMs; r.holding = false;
    return settle(withAck(r, nowMs), nowMs);
  }
  // jump to the start of the previous segment (the first one just restarts)
  function skipBack(run, nowMs) {
    if (run.finished) return run;
    var pos = runPos(run, nowMs), target = offsetOf(run.plan, run.adj, Math.max(0, pos.segIndex - 1));
    var r = cloneRun(run); r.startMs += pos.elapsedMs - target; r.holding = false;
    return withAck(r, nowMs);
  }
  function restartSeg(run, nowMs) {
    if (run.finished) return run;
    var pos = runPos(run, nowMs);
    if (pos.finished) return run;
    var r = cloneRun(run); r.startMs += pos.segElapsedMs; r.holding = false;
    return withAck(r, nowMs);
  }
  /* +/- minutes on the CURRENT segment only (one station, not the whole block). Rules:
     -1 min never leaves less than 0:30 on the clock, and does nothing once 0:30 or less is left (use Skip);
     +1 min stops at 3 hours for one block. Returns {run, changed, reason}. */
  function adjustCurrent(run, nowMs, deltaMs) {
    if (run.finished || run.holding) return { run: run, changed: false, reason: "none" };
    var pos = runPos(run, nowMs);
    if (pos.finished) return { run: run, changed: false, reason: "none" };
    var d = pos.segDurMs, e = pos.segElapsedMs, nd = d + deltaMs;
    if (deltaMs < 0) { nd = Math.max(nd, e + L.minLeftMs); if (nd >= d) return { run: run, changed: false, reason: "short" }; }
    else { nd = Math.min(nd, L.segMaxMs); if (nd <= d) return { run: run, changed: false, reason: "long" }; }
    var r = cloneRun(run), delta = nd - pos.seg.baseMs;
    if (delta === 0) delete r.adj[pos.segIndex]; else r.adj[pos.segIndex] = delta;
    return { run: r, changed: true, reason: "", deltaMs: nd - d };
  }
  // end early (the coach tapped End practice)
  function endRun(run, nowMs) {
    if (run.finished) return run;
    var r = cloneRun(run), at = runNow(run, nowMs);
    r.finished = true; r.holding = false; r.pausedAt = at; r.endedAt = at; r.endReason = "early";
    return r;
  }
  // real running time (pauses taken out), however many skips and rewinds happened
  function actualMs(run, nowMs) {
    var end = run.endedAt != null ? run.endedAt : runNow(run, nowMs);
    return Math.max(0, end - run.t0 - run.pausedMs);
  }
  function makeLog(run, nowMs) {
    return {
      id: uid(), date: isYMD(run.date) ? run.date : todayStr(nowMs), plan: run.plan.name,
      planned: planMinutes(run.plan), actual: Math.round(actualMs(run, nowMs) / MIN), early: run.endReason === "early"
    };
  }
  function sanitizeLog(x) {
    if (!isObj(x) || !isYMD(x.date)) return null;
    return {
      id: typeof x.id === "string" && ID_RE.test(x.id) ? x.id : uid(), date: x.date, plan: str(x.plan, L.nameMax) || "Practice",
      planned: int(x.planned, 0, 1440, 0), actual: int(x.actual, 0, 5000, 0), early: x.early === true, sample: x.sample === true
    };
  }
  function addLog(hist, entry) { return [entry].concat(hist).slice(0, L.histMax); }
  function sanitizeRun(x) {
    if (!isObj(x) || x.v !== 1) return null;
    var plan = sanitizePlan(x.plan, { requireBlocks: true });
    if (!plan) return null;
    var segCount = segments(plan).length, adj = {};
    if (isObj(x.adj)) Object.keys(x.adj).forEach(function (k) {
      var i = +k, v = x.adj[k];
      if (/^\d{1,3}$/.test(k) && i < segCount && typeof v === "number" && isFinite(v)) adj[i] = Math.max(-L.segMaxMs, Math.min(L.segMaxMs, Math.round(v)));
    });
    var t0 = num(x.t0, NaN), startMs = num(x.startMs, NaN);
    if (!isFinite(t0) || !isFinite(startMs) || t0 < 0 || startMs < 0) return null;
    var pausedAt = x.pausedAt === null || x.pausedAt === undefined ? null : num(x.pausedAt, NaN);
    if (pausedAt !== null && !isFinite(pausedAt)) return null;
    var r = {
      v: 1, planId: typeof x.planId === "string" ? x.planId : plan.id, plan: plan, date: isYMD(x.date) ? x.date : todayStr(t0), t0: t0, startMs: startMs,
      pausedAt: pausedAt, pausedMs: Math.max(0, num(x.pausedMs, 0)), adj: adj, ack: int(x.ack, 0, Math.max(0, segCount - 1), 0),
      holding: x.holding === true && pausedAt !== null, finished: x.finished === true, endedAt: x.endedAt == null ? null : num(x.endedAt, null),
      endReason: x.endReason === "early" ? "early" : (x.endReason === "done" ? "done" : ""), logged: x.logged === true
    };
    if (r.finished && r.endedAt == null) r.endedAt = r.pausedAt != null ? r.pausedAt : t0;
    return r;
  }

  /* ---------- clock times for the editor ---------- */
  // start/end (minutes since midnight, may pass 1440) of every block when the plan starts at startMin
  function clockSchedule(plan, startMin) {
    var t = startMin, rows = [];
    for (var i = 0; i < plan.blocks.length; i++) {
      var m = blockMinutes(plan.blocks[i]);
      rows.push({ bi: i, min: m, startMin: t, endMin: t + m });
      t += m;
    }
    return { rows: rows, finishMin: t, totalMin: t - startMin };
  }
  /* "Must end by" check. valid=false when there is no cutoff or it is not later than the start.
     over > 0 means that many minutes past the cutoff; over < 0 means that many to spare. */
  function overBy(plan, startMin, endByMin) {
    if (!isFinite(startMin) || !isFinite(endByMin) || endByMin <= startMin) return { valid: false, over: 0, available: 0 };
    var avail = endByMin - startMin;
    return { valid: true, available: avail, over: planMinutes(plan) - avail };
  }

  /* ---------- trim to fit ---------- */
  /* Takes overMin minutes out of the normal blocks, each losing in proportion to its length (largest
     remainders get the leftover minutes, longer blocks first on ties), none going below 1 minute. Stations
     blocks keep their times. Does not change the plan: returns what would change so it can be previewed. */
  function trimToFit(plan, overMin) {
    var idx = [], i;
    for (i = 0; i < plan.blocks.length; i++) if (plan.blocks[i].type === "normal") idx.push(i);
    var S = 0, canGive = 0;
    idx.forEach(function (bi) { S += plan.blocks[bi].min; canGive += plan.blocks[bi].min - 1; });
    overMin = Math.max(0, Math.ceil(overMin - 1e-9));
    var cut = Math.min(overMin, canGive), target = S - cut;
    var alloc = {}, fixed = {}, changed = true;
    idx.forEach(function (bi) { alloc[bi] = plan.blocks[bi].min; });
    if (cut > 0) {
      var free = idx.slice(), avail = target, f = 1;
      while (changed && free.length) {
        changed = false;
        var sf = 0; free.forEach(function (bi) { sf += plan.blocks[bi].min; });
        f = avail / sf;
        for (i = free.length - 1; i >= 0; i--) {
          if (plan.blocks[free[i]].min * f < 1) { fixed[free[i]] = 1; alloc[free[i]] = 1; avail -= 1; free.splice(i, 1); changed = true; }
        }
      }
      var used = 0, rem = [];
      free.forEach(function (bi) { var raw = plan.blocks[bi].min * f, fl = Math.floor(raw + 1e-9); alloc[bi] = fl; used += fl; rem.push({ bi: bi, r: raw - fl, m: plan.blocks[bi].min }); });
      rem.sort(function (a, b) { return (b.r - a.r) || (b.m - a.m) || (a.bi - b.bi); });
      for (i = 0; used < avail && i < rem.length; i++) { alloc[rem[i].bi] += 1; used++; }
    }
    var changes = [], reduced = 0;
    idx.forEach(function (bi) { var from = plan.blocks[bi].min, to = alloc[bi]; if (to !== from) { changes.push({ bi: bi, from: from, to: to }); reduced += from - to; } });
    return { changes: changes, reduced: reduced, stillOver: overMin - reduced, fits: overMin - reduced <= 0 };
  }
  function applyTrim(plan, changes) {
    var p = clone(plan);
    changes.forEach(function (c) { if (p.blocks[c.bi] && p.blocks[c.bi].type === "normal") p.blocks[c.bi].min = c.to; });
    return p;
  }

  /* ---------- sharing: the plan packed into a link ---------- */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function utf8Encode(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
      else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Decode(b) {
    var s = "", i = 0;
    while (i < b.length) {
      var c = b[i++], n = 0, cp;
      if (c < 0x80) { s += String.fromCharCode(c); continue; }
      if (c >= 0xc2 && c < 0xe0) { n = 1; cp = c & 31; } else if (c >= 0xe0 && c < 0xf0) { n = 2; cp = c & 15; } else if (c >= 0xf0 && c < 0xf5) { n = 3; cp = c & 7; } else return null;
      for (var k = 0; k < n; k++) { if (i >= b.length || (b[i] & 0xc0) !== 0x80) return null; cp = (cp << 6) | (b[i++] & 63); }
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      if (cp >= 0x10000) { cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); } else s += String.fromCharCode(cp);
    }
    return s;
  }
  function b64urlEncode(bytes) {
    var s = "", i;
    for (i = 0; i + 2 < bytes.length; i += 3) { var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    if (bytes.length - i === 1) { var a = bytes[i] << 16; s += B64[a >> 18] + B64[(a >> 12) & 63]; }
    else if (bytes.length - i === 2) { var c = (bytes[i] << 16) | (bytes[i + 1] << 8); s += B64[c >> 18] + B64[(c >> 12) & 63] + B64[(c >> 6) & 63]; }
    return s;
  }
  function b64urlDecode(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | B64.indexOf(s[i]); bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); buf &= (1 << bits) - 1; }
    }
    return out;
  }
  // [name, min, note, colorNumber(0 none, 1..8), stationCount(0 normal), labels] with unused tail left off
  function packBlock(b) {
    var a = [b.name, b.min, b.note, b.color ? COLOR_IDS.indexOf(b.color) + 1 : 0, b.type === "stations" ? b.stations : 0];
    if (b.type === "stations" && b.labels.some(function (x) { return !!x; })) a.push(b.labels);
    while (a.length > 2 && (a[a.length - 1] === 0 || a[a.length - 1] === "")) a.pop();
    return a;
  }
  function encodeShare(plan) {
    var clean = sanitizePlan(plan, { requireBlocks: true });
    if (!clean) return { ok: false, code: "empty", error: "Add at least one block before sharing a plan." };
    var json = JSON.stringify({ v: 1, n: clean.name, s: clean.sport, w: clean.wait ? 1 : 0, b: clean.blocks.map(packBlock) });
    var token = b64urlEncode(utf8Encode(json));
    if (token.length > L.shareMax) return { ok: false, code: "toolong", length: token.length, error: "This plan is too long to fit in a link (" + token.length + " of " + L.shareMax + " characters). Shorten some notes or use Copy as text instead." };
    return { ok: true, token: token, hash: "#p1=" + token, length: token.length };
  }
  /* Accepts "#p1=...", "p1=..." or a whole link. Never throws; always returns {ok, plan} or {ok:false, code, error}. */
  function decodeShare(input) {
    var bad = function (code, error) { return { ok: false, code: code, error: error }; };
    try {
      var s = typeof input === "string" ? input : "";
      var h = s.indexOf("#"); if (h >= 0) s = s.slice(h + 1);
      if (s.length > L.hashMax) return bad("toolong", "That link is too long to be a Practice Clock plan.");
      var m = /^p(\d+)=(.*)$/.exec(s);
      if (!m) return bad("format", "That isn't a Practice Clock plan link.");
      if (m[1] !== "1") return bad("version", "This plan was shared from a newer Practice Clock. Update the app and ask for the link again.");
      if (m[2].length > L.shareMax + 200) return bad("toolong", "That link is too long to be a Practice Clock plan.");
      var bytes = b64urlDecode(m[2]); if (!bytes) return bad("damaged", "That plan link is damaged (it may have been cut off).");
      var text = utf8Decode(bytes); if (text == null) return bad("damaged", "That plan link is damaged (it may have been cut off).");
      var o; try { o = JSON.parse(text); } catch (e) { return bad("damaged", "That plan link is damaged (it may have been cut off)."); }
      if (!isObj(o) || o.v !== 1 || !Array.isArray(o.b) || !o.b.length) return bad("damaged", "That plan link is damaged (it may have been cut off).");
      if (o.b.length > L.maxBlocks) return bad("toolong", "That plan has too many blocks.");
      var blocks = [];
      for (var i = 0; i < o.b.length; i++) {
        var a = o.b[i];
        if (!Array.isArray(a) || typeof a[0] !== "string" || typeof a[1] !== "number") return bad("damaged", "Part of that plan is damaged.");
        var st = int(a[4], 0, L.stationsMax, 0), ci = int(a[3], 0, COLOR_IDS.length, 0);
        blocks.push({ name: a[0], min: a[1], note: typeof a[2] === "string" ? a[2] : "", color: ci ? COLOR_IDS[ci - 1] : "", type: st >= L.stationsMin ? "stations" : "normal", stations: st, labels: Array.isArray(a[5]) ? a[5] : [] });
      }
      var plan = sanitizePlan({ name: o.n, sport: o.s, wait: o.w === 1, blocks: blocks }, { requireBlocks: true });
      if (!plan) return bad("toolong", "That plan is longer than 24 hours, so it can't be a practice.");
      return { ok: true, plan: plan };
    } catch (e) { return bad("damaged", "That plan link couldn't be read."); }
  }

  /* ---------- text version of a plan ---------- */
  function planText(plan, startMin, opts) {
    opts = opts || {};
    var sep = opts.sep == null ? "-" : opts.sep, cs = clockSchedule(plan, startMin), lines = [];
    lines.push(plan.name);
    lines.push(sportInfo(plan.sport).label + ", " + cs.totalMin + " min, " + fmtHM(startMin) + " to " + fmtHM(cs.finishMin));
    lines.push("");
    cs.rows.forEach(function (r) {
      var b = plan.blocks[r.bi], what = b.name + " (" + r.min + " min)";
      if (b.type === "stations") {
        var names = b.labels.map(function (x, i) { return x || "Station " + (i + 1); }).join(", ");
        what = b.name + ": " + b.stations + " stations x " + b.min + " min (" + names + ")";
      }
      lines.push(fmtRange(r.startMin, r.endMin, sep) + "  " + what);
      if (b.note) lines.push("    " + b.note);
    });
    lines.push("");
    lines.push("Made with Practice Clock");
    return lines.join("\n");
  }

  /* ---------- starter templates (generic, no names) ---------- */
  function nb(name, min, note, color) { return { name: name, min: min, note: note || "", color: color || "", type: "normal" }; }
  function sb(name, per, labels, note, color) { return { name: name, min: per, note: note || "", color: color || "", type: "stations", stations: labels.length, labels: labels }; }
  var TEMPLATES = [
    { id: "baseball", title: "Baseball 90 min", sport: "baseball", blocks: [
      nb("Warm-up & throwing", 15, "Dynamic stretch, then partner throws", "green"), nb("Infield / outfield", 20, "Ground balls, fly balls, relays", "blue"),
      sb("Hitting stations", 5, ["Tee", "Soft toss", "Front toss", "Bunting"], "Rotate when the clock says", "purple"),
      nb("Base running", 10, "Leads, steals, first to third", "amber"), nb("Scrimmage", 20, "Game situations, runners on", "red"), nb("Cool-down & huddle", 5, "Stretch, water, one thing for next time", "teal")] },
    { id: "softball", title: "Softball 90 min", sport: "softball", blocks: [
      nb("Warm-up & throwing", 15, "Dynamic stretch, then partner throws", "green"), nb("Pitching & catching", 15, "Pairs, small groups", "blue"), nb("Infield / outfield", 15, "Ground balls, fly balls, relays", "blue"),
      sb("Hitting stations", 5, ["Tee", "Soft toss", "Front toss", "Slap & bunt"], "Rotate when the clock says", "purple"),
      nb("Base running & sliding", 10, "Leads, steals, sliding", "amber"), nb("Scrimmage", 10, "Game situations", "red"), nb("Cool-down & huddle", 5, "Stretch, water, one thing for next time", "teal")] },
    { id: "basketball", title: "Basketball 60 min", sport: "basketball", blocks: [
      nb("Dynamic warm-up", 8, "", "green"), nb("Ball handling", 10, "Both hands, then with a defender", "blue"),
      sb("Shooting stations", 4, ["Layups", "Mid-range", "Catch & shoot"], "Count makes at each", "purple"),
      nb("3v3 games", 20, "Winners stay on", "red"), nb("Free throws", 7, "Two in a row to leave the line", "amber"), nb("Cool-down", 3, "Stretch and water", "teal")] },
    { id: "cheer", title: "Cheer 75 min", sport: "cheer", blocks: [
      nb("Warm-up & stretch", 10, "", "green"), nb("Jumps & motions", 5, "Sharp and together", "blue"), nb("Stunts", 20, "Groups work with a spotter", "purple"),
      nb("Tumbling", 15, "Mats out", "amber"), nb("Routine run-throughs", 20, "Full out, then fix one thing", "red"), nb("Cool-down", 5, "Stretch and water", "teal")] },
    { id: "football", title: "Football 75 min", sport: "football", blocks: [
      nb("Warm-up & stretch", 10, "", "green"), sb("Position drills", 6, ["Line", "Backs", "Receivers"], "Rotate when the clock says", "purple"),
      nb("Team offense", 15, "Install and walk-through", "blue"), nb("Team defense", 15, "Alignments and tackling form", "blue"),
      nb("Special teams", 7, "", "amber"), nb("Conditioning & cool-down", 10, "Finish strong, then stretch", "teal")] }
  ];
  function templateById(id) { return TEMPLATES.filter(function (t) { return t.id === id; })[0] || null; }
  function planFromTemplate(id) {
    var t = templateById(id); if (!t) return null;
    return sanitizePlan({ name: t.title, sport: t.sport, blocks: clone(t.blocks) });
  }
  function duplicatePlan(plan) {
    var p = clone(plan); p.id = uid(); p.name = str(plan.name + " copy", L.nameMax);
    p.blocks.forEach(function (b) { b.id = uid(); });
    return sanitizePlan(p);
  }

  /* ---------- backup file ---------- */
  function makeBackup(plans, hist, settings, savedOn) {
    return { app: "practiceclock", version: 1, saved: savedOn || todayStr(), plans: plans, history: hist, settings: settings };
  }
  function validateBackup(obj) {
    if (!isObj(obj) || obj.app !== "practiceclock") return { ok: false, error: "This isn't a Practice Clock backup file." };
    if (typeof obj.version !== "number" || obj.version > 1) return { ok: false, error: "This backup was made by a newer Practice Clock. Update the app and try again." };
    if (!Array.isArray(obj.plans)) return { ok: false, error: "This backup has no plans list in it." };
    if (obj.plans.length > L.maxPlans) return { ok: false, error: "This backup has too many plans." };
    var plans = [], seen = {};
    for (var i = 0; i < obj.plans.length; i++) {
      var p = sanitizePlan(obj.plans[i]);
      if (!p) return { ok: false, error: "Part of this backup is damaged (plan " + (i + 1) + ")." };
      if (seen[p.id]) p.id = uid();
      seen[p.id] = 1; plans.push(p);
    }
    var hist = [];
    (Array.isArray(obj.history) ? obj.history : []).slice(0, L.histMax).forEach(function (h) { var x = sanitizeLog(h); if (x) hist.push(x); });
    return { ok: true, plans: plans, history: hist, settings: sanitizeSettings(obj.settings) };
  }

  var api = {
    VERSION: VERSION, MIN: MIN, LIMITS: L, ID_RE: ID_RE, SPORTS: SPORTS, SPORT_IDS: SPORT_IDS, sportInfo: sportInfo, COLORS: COLORS, COLOR_IDS: COLOR_IDS, colorHex: colorHex,
    str: str, int: int, uid: uid, clone: clone, isYMD: isYMD, todayStr: todayStr, fmtDate: fmtDate, diffDays: diffDays,
    parseHM: parseHM, toHM: toHM, fmtHM: fmtHM, fmtRange: fmtRange, minutesOfDay: minutesOfDay, roundUp5: roundUp5, fmtClock: fmtClock, fmtMin: fmtMin,
    sanitizeBlock: sanitizeBlock, sanitizePlan: sanitizePlan, sanitizeSettings: sanitizeSettings, blockMinutes: blockMinutes, planMinutes: planMinutes,
    segments: segments, schedule: schedule, positionAt: positionAt, offsetOf: offsetOf,
    newRun: newRun, runNow: runNow, runPos: runPos, settle: settle, pauseRun: pauseRun, resumeRun: resumeRun, skipNext: skipNext, skipBack: skipBack,
    restartSeg: restartSeg, adjustCurrent: adjustCurrent, endRun: endRun, actualMs: actualMs, makeLog: makeLog, sanitizeLog: sanitizeLog, addLog: addLog, sanitizeRun: sanitizeRun,
    clockSchedule: clockSchedule, overBy: overBy, trimToFit: trimToFit, applyTrim: applyTrim,
    encodeShare: encodeShare, decodeShare: decodeShare, utf8Encode: utf8Encode, utf8Decode: utf8Decode, b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    planText: planText, TEMPLATES: TEMPLATES, templateById: templateById, planFromTemplate: planFromTemplate, duplicatePlan: duplicatePlan,
    makeBackup: makeBackup, validateBackup: validateBackup
  };
  root.PracticeClockCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
