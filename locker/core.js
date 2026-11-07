/* Locker core: pure logic with no DOM, so it can be tested on its own.
   Loaded before app.js in the browser (window.LockerCore) and by node tests (module.exports). */
(function (root) {
  "use strict";

  var VERSION = "Locker v1";
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;

  var SPORTS = [
    { id: "baseball", label: "Baseball", icon: "⚾" },
    { id: "softball", label: "Softball", icon: "🥎" },
    { id: "basketball", label: "Basketball", icon: "🏀" },
    { id: "football", label: "Football", icon: "🏈" },
    { id: "cheer", label: "Cheer / Dance", icon: "📣" },
    { id: "other", label: "Other", icon: "🏅" }
  ];
  var SPORT_IDS = SPORTS.map(function (s) { return s.id; });
  function sportInfo(id) { return SPORTS.filter(function (s) { return s.id === id; })[0] || SPORTS[5]; }

  /* ---------- small helpers ---------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null ? "" : String(x));
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
  }
  function int(x, lo, hi, def) {
    if (x === null || x === undefined || x === "") return def;
    var n = Math.round(Number(x));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function uid() {
    var s = "";
    try {
      var b = new Uint8Array(6); (root.crypto || {}).getRandomValues(b);
      for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36);
    } catch (e) { s = Math.random().toString(36).slice(2, 8); }
    return s + Date.now().toString(36).slice(-4);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- dates (all dates are plain "YYYY-MM-DD" strings, no timezones) ---------- */
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
  function fromUTC(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function addDays(s, n) { return fromUTC(toUTC(s) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }
  function weekday(s) { return new Date(toUTC(s)).getUTCDay(); }
  function localToday() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  /* Tests (and nothing else) can set window.__today = "YYYY-MM-DD" to pin the date. */
  function todayStr() {
    try { var o = root.__today; if (isYMD(o)) return o; } catch (e) { /* ignore */ }
    return localToday();
  }
  function fmtDate(s, opts) {
    if (!isYMD(s)) return "";
    try { return new Date(toUTC(s)).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts || { month: "short", day: "numeric" })); }
    catch (e) { return s; }
  }
  var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first when showing day toggles
  var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
  function daysLabel(days) {
    var d = days.slice().sort();
    if (d.length === 7) return "Every day";
    if (d.join() === "1,2,3,4,5") return "Weekdays";
    if (d.join() === "0,6") return "Weekends";
    return WEEK_ORDER.filter(function (x) { return d.indexOf(x) >= 0; }).map(function (x) { return DAY_SHORT[x]; }).join(" ");
  }

  /* ---------- starter drills ---------- */
  var STARTERS = {
    baseball: [["Tee swings", "swings", 50], ["Throws against the wall", "throws", 30], ["Ground balls", "reps", 25], ["Soft toss", "swings", 40]],
    softball: [["Tee swings", "swings", 50], ["Throws against the wall", "throws", 30], ["Ground balls", "reps", 25], ["Windmill pitches", "pitches", 30]],
    basketball: [["Free throws", "shots", 50], ["Dribbling", "min", 5], ["Layups", "shots", 20], ["Wall passes", "passes", 30]],
    football: [["Catches", "catches", 20], ["Throws", "throws", 20], ["Ladder drills", "min", 5], ["Push-ups", "reps", 20]],
    cheer: [["Jumps", "jumps", 20], ["Stretch", "min", 10], ["Motions practice", "min", 5], ["Run-throughs", "runs", 3]],
    other: [["Practice reps", "reps", 20], ["Stretch", "min", 10]]
  };
  function startersFor(sports) {
    var out = [], seen = {};
    (sports && sports.length ? sports : ["other"]).forEach(function (sp) {
      (STARTERS[sp] || []).forEach(function (s) {
        var k = s[0].toLowerCase();
        if (!seen[k]) { seen[k] = 1; out.push({ name: s[0], unit: s[1], target: s[2] }); }
      });
    });
    return out;
  }

  /* ---------- daily reps and streaks ---------- */
  function schedDrills(a, date) {
    var wd = weekday(date);
    return a.drills.filter(function (d) { return d.days.indexOf(wd) >= 0 && d.created <= date; });
  }
  function repsFor(a, date, drillId) {
    var rec = a.days[date];
    if (!rec || !rec.r || !rec.r[drillId]) return 0;
    return rec.r[drillId].reduce(function (x, y) { return x + y; }, 0);
  }
  function entriesFor(a, date, drillId) {
    var rec = a.days[date];
    return rec && rec.r && rec.r[drillId] ? rec.r[drillId].length : 0;
  }
  function liveDay(a, date) {
    var sched = schedDrills(a, date), done = sched.length > 0;
    sched.forEach(function (d) { if (repsFor(a, date, d.id) < d.target) done = false; });
    return { sched: sched, done: done };
  }
  /* The first day that can count toward (or break) a streak. */
  function startDate(a) {
    var m = null;
    a.drills.forEach(function (d) { if (!m || d.created < m) m = d.created; });
    Object.keys(a.days).forEach(function (k) { if (!m || k < m) m = k; });
    return m;
  }
  /* done | missed | rest | open (today, not finished yet) | none (before you started) | future.
     Past days use the result saved the last time that day was changed, so editing drills
     later does not rewrite history. Today is always worked out live. */
  function dayStatus(a, date, today) {
    if (date > today) return "future";
    var start = startDate(a);
    if (!start || date < start) return "none";
    var live;
    if (date === today) {
      live = liveDay(a, date);
      return live.sched.length === 0 ? "rest" : (live.done ? "done" : "open");
    }
    var rec = a.days[date];
    if (rec && typeof rec.s === "number") return rec.s === 0 ? "rest" : (rec.done ? "done" : "missed");
    live = liveDay(a, date);
    return live.sched.length === 0 ? "rest" : (live.done ? "done" : "missed");
  }
  function refreshDay(a, date) {
    var live = liveDay(a, date);
    var rec = a.days[date] || (a.days[date] = { r: {} });
    rec.s = live.sched.length;
    rec.done = live.done;
    return rec;
  }
  /* Streak = days in a row where every scheduled drill hit its target. A day with nothing
     scheduled neither adds to nor breaks the streak; today only breaks it once it is over. */
  function streaks(a, today) {
    var start = startDate(a);
    if (!start || start > today) return { cur: 0, best: 0 };
    var from = start;
    if (diffDays(today, start) > 3660) from = addDays(today, -3660);
    var run = 0, best = 0;
    for (var d = from; d <= today; d = addDays(d, 1)) {
      var st = dayStatus(a, d, today);
      if (st === "done") { run++; if (run > best) best = run; }
      else if (st === "missed") run = 0;
    }
    return { cur: run, best: best };
  }
  function isTimeUnit(u) { return /^(min|mins|minute|minutes)$/i.test(String(u || "").trim()); }
  function weekSummary(a, end) {
    var per = {}, order = [], daysDone = 0, daysSched = 0, reps = 0, minutes = 0, i;
    a.drills.forEach(function (d) { per[d.id] = { id: d.id, name: d.name, unit: d.unit, total: 0 }; order.push(d.id); });
    for (i = 6; i >= 0; i--) {
      var date = addDays(end, -i), st = dayStatus(a, date, end);
      if (st === "done") { daysDone++; daysSched++; }
      else if (st === "missed" || st === "open") daysSched++;
      var rec = a.days[date];
      if (rec && rec.r) {
        Object.keys(rec.r).forEach(function (id) {
          var sum = rec.r[id].reduce(function (x, y) { return x + y; }, 0);
          var d = per[id];
          if (d) d.total += sum;
          if (d && isTimeUnit(d.unit)) minutes += sum; else reps += sum;
        });
      }
    }
    return { per: order.map(function (id) { return per[id]; }).filter(function (p) { return p.total > 0; }), daysDone: daysDone, daysSched: daysSched, reps: reps, minutes: minutes };
  }

  /* ---------- game stats ---------- */
  var BAT_KEYS = ["ab", "h", "d2", "d3", "hr", "bb", "k", "rbi", "r", "sb"];
  var PIT_KEYS = ["outs", "np", "k", "bb", "h", "r", "er"];
  var BK_KEYS = ["pts", "reb", "ast", "stl", "blk", "to", "tpm"];
  var FB_KEYS = ["tkl", "rec", "yds", "td"];

  function sumKeys(games, section, keys) {
    var t = {};
    keys.forEach(function (k) { t[k] = 0; });
    games.forEach(function (g) {
      var s = g[section];
      if (s) keys.forEach(function (k) { t[k] += (s[k] | 0); });
    });
    return t;
  }
  function battingTotals(games) {
    var t = sumKeys(games, "bat", BAT_KEYS);
    t.g = games.length;
    t.singles = t.h - t.d2 - t.d3 - t.hr;
    t.tb = t.h + t.d2 + 2 * t.d3 + 3 * t.hr; // = singles + 2*2B + 3*3B + 4*HR
    t.pa = t.ab + t.bb;
    t.avg = t.ab ? t.h / t.ab : null;
    t.obp = t.pa ? (t.h + t.bb) / t.pa : null;
    t.slg = t.ab ? t.tb / t.ab : null;
    t.ops = (t.obp !== null && t.slg !== null) ? t.obp + t.slg : null;
    return t;
  }
  function pitchingTotals(games, ipg) {
    ipg = ipg === 7 ? 7 : 6;
    var t = sumKeys(games, "pit", PIT_KEYS);
    t.g = games.filter(function (g) { return g.pit && (g.pit.outs > 0 || g.pit.np > 0); }).length;
    t.ip = t.outs / 3;
    t.ipText = fmtIP(t.outs);
    t.era = t.outs > 0 ? (t.er * ipg) / t.ip : null;
    t.whip = t.outs > 0 ? (t.bb + t.h) / t.ip : null;
    t.ipg = ipg;
    return t;
  }
  function basketballTotals(games) {
    var t = sumKeys(games, "bk", BK_KEYS), g = games.length;
    t.g = g;
    t.ppg = g ? t.pts / g : null; t.rpg = g ? t.reb / g : null; t.apg = g ? t.ast / g : null;
    t.spg = g ? t.stl / g : null; t.bpg = g ? t.blk / g : null;
    return t;
  }
  function footballTotals(games) {
    var t = sumKeys(games, "fb", FB_KEYS);
    t.g = games.length;
    return t;
  }
  function record(games) {
    var r = { w: 0, l: 0, t: 0 };
    games.forEach(function (g) { if (g.result === "W") r.w++; else if (g.result === "L") r.l++; else if (g.result === "T") r.t++; });
    return r;
  }
  function fmtIP(outs) { outs = outs | 0; return Math.floor(outs / 3) + "." + (outs % 3); }
  function fmtRate(x) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    var s = x.toFixed(3);
    return x < 1 ? s.replace(/^0/, "") : s;
  }
  function fmtDec(x, d) { return (x === null || x === undefined || !isFinite(x)) ? "—" : x.toFixed(d); }

  /* ---------- arm care: pitch counts and rest days ---------- */
  /* Copied from one league's published Pitch Smart style tables (regular season). */
  var STD_TIERS = [
    { min: 1, max: 20, restDays: 0 }, { min: 21, max: 35, restDays: 1 }, { min: 36, max: 50, restDays: 2 },
    { min: 51, max: 65, restDays: 3 }, { min: 66, max: 999, restDays: 4 }
  ];
  var PRESETS = {
    Majors: { dailyMax: 85, tiers: clone(STD_TIERS) },
    Minors: { dailyMax: 75, tiers: clone(STD_TIERS) },
    Juniors: { dailyMax: 95, tiers: clone(STD_TIERS) },
    Seniors: { dailyMax: 105, tiers: [
      { min: 1, max: 30, restDays: 0 }, { min: 31, max: 45, restDays: 1 }, { min: 46, max: 60, restDays: 2 },
      { min: 61, max: 80, restDays: 3 }, { min: 81, max: 999, restDays: 4 }
    ] }
  };
  var PRESET_NAMES = ["Majors", "Minors", "Juniors", "Seniors", "Custom"];

  function restFor(np, tiers) {
    np = Number(np) || 0;
    if (np <= 0) return 0;
    for (var i = 0; i < tiers.length; i++) if (np >= tiers[i].min && np <= tiers[i].max) return tiers[i].restDays;
    return tiers.length ? tiers[tiers.length - 1].restDays : 0;
  }
  function sanitizeRules(raw) {
    var fallback = clone(PRESETS.Majors);
    if (!isObj(raw)) return fallback;
    var dailyMax = int(raw.dailyMax, 1, 300, 85);
    var src = Array.isArray(raw.tiers) ? raw.tiers.slice(0, 8) : [];
    var tiers = [], prev = 0, ok = src.length >= 1;
    src.forEach(function (t, i) {
      if (!isObj(t)) { ok = false; return; }
      var last = i === src.length - 1;
      var mx = last ? 999 : int(t.max, 1, 998, null);
      var rd = int(t.restDays, 0, 14, null);
      if (mx === null || rd === null || mx <= prev) { ok = false; return; }
      tiers.push({ min: prev + 1, max: mx, restDays: rd });
      prev = mx;
    });
    if (!ok || !tiers.length) return fallback;
    return { dailyMax: dailyMax, tiers: tiers };
  }
  function getRules(arm) { return arm.preset === "Custom" ? arm.custom : (PRESETS[arm.preset] || PRESETS.Majors); }
  /* One row per day with pitches: total, rest needed, first day available again. */
  function armDays(arm, log) {
    var rules = getRules(arm), by = {}, out = [], block = null;
    log.forEach(function (e) { by[e.date] = (by[e.date] || 0) + e.np; });
    Object.keys(by).sort().forEach(function (date) {
      var total = by[date], rest = restFor(total, rules.tiers), avail = addDays(date, rest + 1);
      out.push({ date: date, total: total, rest: rest, avail: avail, over: total > rules.dailyMax, early: block !== null && date < block });
      if (block === null || avail > block) block = avail;
    });
    return { rules: rules, days: out, availableFrom: block };
  }
  function armSummary(arm, log, today) {
    var info = armDays(arm, log), rules = info.rules, todayTotal = 0, blockPrior = null, week7 = 0, lastDate = null;
    var weekStart = addDays(today, -6);
    info.days.forEach(function (d) {
      if (d.date === today) todayTotal = d.total;
      if (d.date < today && (blockPrior === null || d.avail > blockPrior)) blockPrior = d.avail;
      if (d.date >= weekStart && d.date <= today) week7 += d.total;
      if (d.date <= today) lastDate = d.date;
    });
    var resting = blockPrior !== null && today < blockPrior;
    var from = info.availableFrom;
    var status = resting ? "rest" : (todayTotal > 0 ? "pitched" : "ok");
    var restLeft = 0;
    if (resting) restLeft = diffDays(from, today);
    else if (todayTotal > 0) restLeft = Math.max(0, diffDays(from, today) - 1);
    return {
      rules: rules, status: status, resting: resting, restLeft: restLeft,
      nextAvail: from !== null && from > today ? from : today, availableNow: !(from !== null && from > today),
      todayTotal: todayTotal, pitchesLeft: Math.max(0, rules.dailyMax - todayTotal), overToday: Math.max(0, todayTotal - rules.dailyMax),
      week7: week7, days: info.days, lastDate: lastDate
    };
  }

  /* ---------- links ---------- */
  function normalizeUrl(s) {
    s = String(s == null ? "" : s).trim();
    if (!s || s.length > 2000 || /\s/.test(s)) return null;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null; // javascript:, data:, file: ...
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    try {
      var u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!u.hostname || (u.hostname.indexOf(".") < 0 && u.hostname !== "localhost")) return null;
      return u.href;
    } catch (e) { return null; }
  }

  /* ---------- sanitizing (used on every load and on every restore) ---------- */
  function sanitizeStats(raw, keys, big) {
    var o = {}, src = isObj(raw) ? raw : {};
    keys.forEach(function (k) { o[k] = int(src[k], 0, big || 999, 0); });
    return o;
  }
  function sanitizeGame(raw, defSport) {
    if (!isObj(raw) || !isYMD(raw.date)) return null;
    var sport = SPORT_IDS.indexOf(raw.sport) >= 0 ? raw.sport : defSport;
    var g = {
      id: typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : uid(),
      sport: sport, date: raw.date,
      opp: str(raw.opp, 60).trim(),
      result: raw.result === "W" || raw.result === "L" || raw.result === "T" ? raw.result : "",
      us: int(raw.us, 0, 999, null), them: int(raw.them, 0, 999, null),
      season: str(raw.season, 24).trim() || raw.date.slice(0, 4),
      notes: str(raw.notes, 600)
    };
    if (sport === "baseball" || sport === "softball") {
      g.bat = sanitizeStats(raw.bat, BAT_KEYS);
      g.pit = sanitizeStats(raw.pit, PIT_KEYS, 999);
    } else if (sport === "basketball") g.bk = sanitizeStats(raw.bk, BK_KEYS, 999);
    else if (sport === "football") g.fb = sanitizeStats(raw.fb, FB_KEYS, 9999);
    return g;
  }
  function sanitizeAthlete(raw) {
    if (!isObj(raw)) return null;
    if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
    var name = str(raw.name, 40).trim();
    if (!name) return null;
    var today = todayStr();
    var sports = uniq((Array.isArray(raw.sports) ? raw.sports : []).filter(function (s) { return SPORT_IDS.indexOf(s) >= 0; }));
    if (!sports.length) sports = ["other"];
    var created = isYMD(raw.created) ? raw.created : today;
    var p = isObj(raw.profile) ? raw.profile : {};
    var a = {
      v: 1, id: raw.id, name: name, sports: sports,
      birthYear: int(raw.birthYear, 1980, 2100, null),
      created: created,
      profile: {
        cardName: str(p.cardName, 40).trim(), positions: str(p.positions, 60).trim(),
        bats: ["R", "L", "S"].indexOf(p.bats) >= 0 ? p.bats : "", throws: ["R", "L"].indexOf(p.throws) >= 0 ? p.throws : "",
        height: str(p.height, 14).trim(), weight: str(p.weight, 14).trim(), gradYear: int(p.gradYear, 2000, 2100, null),
        teams: str(p.teams, 80).trim(), email: str(p.email, 80).trim(), phone: str(p.phone, 24).trim(),
        bio: str(p.bio, 140).trim(), showContact: p.showContact === true, cardSeason: str(p.cardSeason, 24).trim()
      },
      drills: [], days: {}, games: [], settings: { ipg: raw.settings && raw.settings.ipg === 7 ? 7 : 6 },
      arm: { preset: "Majors", custom: sanitizeRules(raw.arm && raw.arm.custom), log: [] },
      clips: []
    };
    (Array.isArray(raw.drills) ? raw.drills.slice(0, 30) : []).forEach(function (d) {
      if (!isObj(d)) return;
      var nm = str(d.name, 40).trim();
      if (!nm) return;
      var days = uniq((Array.isArray(d.days) ? d.days : []).map(function (x) { return int(x, 0, 6, null); }).filter(function (x) { return x !== null; })).sort();
      a.drills.push({
        id: typeof d.id === "string" && ID_RE.test(d.id) ? d.id : uid(), name: nm,
        unit: str(d.unit, 14).trim() || "reps", target: int(d.target, 1, 9999, 10),
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], created: isYMD(d.created) ? d.created : created
      });
    });
    if (isObj(raw.days)) {
      Object.keys(raw.days).filter(isYMD).sort().slice(-3660).forEach(function (k) {
        var rec = raw.days[k];
        if (!isObj(rec)) return;
        var r = {};
        if (isObj(rec.r)) {
          Object.keys(rec.r).forEach(function (id) {
            if (!ID_RE.test(id) || !Array.isArray(rec.r[id])) return;
            var arr = rec.r[id].map(function (n) { return int(n, 1, 99999, null); }).filter(function (n) { return n !== null; }).slice(0, 1000);
            if (arr.length) r[id] = arr;
          });
        }
        var out = { r: r };
        if (typeof rec.s === "number") { out.s = int(rec.s, 0, 50, 0); out.done = rec.done === true; }
        a.days[k] = out;
      });
    }
    (Array.isArray(raw.games) ? raw.games.slice(0, 3000) : []).forEach(function (g) {
      var s = sanitizeGame(g, sports[0]);
      if (s) a.games.push(s);
    });
    var arm = isObj(raw.arm) ? raw.arm : {};
    a.arm.preset = PRESET_NAMES.indexOf(arm.preset) >= 0 ? arm.preset : "Majors";
    (Array.isArray(arm.log) ? arm.log.slice(0, 3000) : []).forEach(function (e) {
      if (!isObj(e) || !isYMD(e.date)) return;
      var np = int(e.np, 1, 999, null);
      if (np === null) return;
      a.arm.log.push({
        id: typeof e.id === "string" && ID_RE.test(e.id) ? e.id : uid(), date: e.date, np: np, note: str(e.note, 80).trim(),
        gameId: typeof e.gameId === "string" && ID_RE.test(e.gameId) ? e.gameId : ""
      });
    });
    (Array.isArray(raw.clips) ? raw.clips.slice(0, 1000) : []).forEach(function (c) {
      if (!isObj(c)) return;
      var url = normalizeUrl(c.url);
      if (!url) return;
      var tags = uniq((Array.isArray(c.tags) ? c.tags : []).map(function (t) { return str(t, 20).trim().toLowerCase(); }).filter(Boolean)).slice(0, 8);
      a.clips.push({
        id: typeof c.id === "string" && ID_RE.test(c.id) ? c.id : uid(),
        title: str(c.title, 80).trim() || url, url: url, date: isYMD(c.date) ? c.date : created, tags: tags, note: str(c.note, 300)
      });
    });
    return a;
  }

  /* A backup file is the whole app: { app, version, exportedAt, active, athletes: [...] }. */
  function makeBackup(athletes, active, when) {
    return { app: "locker", version: 1, exportedAt: when || new Date().toISOString(), active: active, athletes: athletes };
  }
  function validateBackup(obj) {
    if (!isObj(obj) || obj.app !== "locker") return { ok: false, error: "This isn't a Locker backup file." };
    if (typeof obj.version !== "number" || obj.version > 1) return { ok: false, error: "This backup was made by a newer Locker. Update the app and try again." };
    if (!Array.isArray(obj.athletes) || !obj.athletes.length) return { ok: false, error: "This backup has no athletes in it." };
    if (obj.athletes.length > 50) return { ok: false, error: "This backup has too many athletes." };
    var list = [], seen = {};
    for (var i = 0; i < obj.athletes.length; i++) {
      var a = sanitizeAthlete(obj.athletes[i]);
      if (!a) return { ok: false, error: "Part of this backup is damaged." };
      if (seen[a.id]) return { ok: false, error: "This backup has the same athlete twice." };
      seen[a.id] = 1; list.push(a);
    }
    return { ok: true, athletes: list, active: typeof obj.active === "string" && seen[obj.active] ? obj.active : list[0].id };
  }

  var api = {
    VERSION: VERSION, ID_RE: ID_RE, SPORTS: SPORTS, SPORT_IDS: SPORT_IDS, sportInfo: sportInfo, STARTERS: STARTERS, startersFor: startersFor,
    PRESETS: PRESETS, PRESET_NAMES: PRESET_NAMES, WEEK_ORDER: WEEK_ORDER, DAY_SHORT: DAY_SHORT, DAY_LETTER: DAY_LETTER,
    uid: uid, clone: clone, int: int, str: str, isYMD: isYMD, addDays: addDays, diffDays: diffDays, weekday: weekday, todayStr: todayStr, fmtDate: fmtDate, daysLabel: daysLabel,
    schedDrills: schedDrills, repsFor: repsFor, entriesFor: entriesFor, liveDay: liveDay, startDate: startDate, dayStatus: dayStatus, refreshDay: refreshDay,
    streaks: streaks, weekSummary: weekSummary, isTimeUnit: isTimeUnit,
    BAT_KEYS: BAT_KEYS, PIT_KEYS: PIT_KEYS, BK_KEYS: BK_KEYS, FB_KEYS: FB_KEYS,
    battingTotals: battingTotals, pitchingTotals: pitchingTotals, basketballTotals: basketballTotals, footballTotals: footballTotals, record: record,
    fmtIP: fmtIP, fmtRate: fmtRate, fmtDec: fmtDec,
    restFor: restFor, sanitizeRules: sanitizeRules, getRules: getRules, armDays: armDays, armSummary: armSummary,
    normalizeUrl: normalizeUrl, sanitizeGame: sanitizeGame, sanitizeAthlete: sanitizeAthlete, makeBackup: makeBackup, validateBackup: validateBackup
  };
  root.LockerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
