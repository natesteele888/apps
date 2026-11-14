/* Walk-Up pitching panel: the top half of the Game screen. Tap +1 for each pitch your pitcher throws, Undo a mis-tap,
   see how many are left today (green, then yellow at 10 left, red at 5 left), and open the bullpen to switch pitchers.
   The log is saved on this phone under "walkup.pitch" (the math is in pitch-core.js). Pitcher names never leave the phone,
   except to a paired watch through the Walk-Up phone app. Pitchers and past counts can be read from LYBS Ballclub's own
   saved copies on this phone (same site, nothing is fetched). */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var P = window.WalkupPitch, U = WU.U, esc = U.esc, $ = U.$;
  var PT = WU.pitch = {};
  var log = P.emptyLog(), hist = {}, sheet = null;
  PT.cutoff = null;

  function today() { return P.ymd(Date.now()); }
  function trimHist(h) {
    var keep = P.addDays(today(), -30), out = {};
    Object.keys(h || {}).forEach(function (d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= keep && h[d] && typeof h[d] === "object") out[d] = h[d]; });
    return out;
  }
  PT.load = function () {
    try { log = P.sanitize(JSON.parse(WU.store.get("pitch") || "null")); } catch (e) { log = P.emptyLog(); }
    try { var h = JSON.parse(WU.store.get("pitchHist") || "{}"); hist = h && typeof h === "object" ? trimHist(h) : {}; } catch (e) { hist = {}; }
    PT.cutoff = P.rollup(log, hist, today());
    persist();
  };
  function persist() { WU.store.set("pitch", JSON.stringify(log)); WU.store.set("pitchHist", JSON.stringify(hist)); }
  function changed() { persist(); WU.emit("pitch"); }
  PT.log = function () { return log; };
  PT.history = function () { return hist; };
  /* pitching is off until a coach turns it on: Walk-Up is often used without a pitch count */
  PT.shown = function () { return WU.store.get("pitchShow") === "1"; };
  PT.show = function (on) { WU.store.set("pitchShow", on ? "1" : "0"); WU.emit("data"); };
  WU.act["pt-show"] = function () { PT.show(true); };
  document.addEventListener("change", function (e) { var t = e.target; if (t && t.id === "setPitchShow") PT.show(t.checked); });

  /* ---------- who is pitching, and the numbers ---------- */
  PT.cur = function () {
    var c = P.current(log, today());
    if (c) return c;
    return log.pitchers.length ? { id: log.pitchers[0].id, name: log.pitchers[0].name } : null;
  };
  PT.rows = function () { var club = PT.club(); return P.bullpen(log, today(), hist, club ? club.apps : null); };
  PT.row = function (id) { var r = PT.rows(); for (var i = 0; i < r.length; i++) if (r[i].id === id) return r[i]; return null; };
  function setupChanged() { log.setupAt = Date.now(); changed(); }
  function addPitcher(name) {
    name = String(name || "").trim().slice(0, P.LIM.name);
    if (!name) return null;
    var have = log.pitchers.filter(function (p) { return P.canon(p.name) === P.canon(name); })[0];
    if (have) return have;
    if (log.pitchers.length >= P.LIM.pitchers) { U.toast("The pitcher list is full.", "error"); return null; }
    var p = { id: P.uid("p"), name: name, limit: 0, club: false };
    log.pitchers.push(p);
    log.setupAt = Date.now();
    return p;
  }

  /* ---------- actions ---------- */
  function buzz(row, prevLeft) {
    if (!row || !row.limit || !navigator.vibrate) return;
    try {
      if (row.left <= 0) navigator.vibrate([300, 150, 300, 150, 300]);
      else if (row.left <= 5) navigator.vibrate([120, 90, 120]);
      else if (row.left <= 10 && prevLeft > 10) navigator.vibrate(400);
    } catch (e) { /* ignore */ }
  }
  PT.add = function () {
    var c = PT.cur(), now = Date.now();
    if (!c) { var p = addPitcher("Pitcher 1"); if (!p) return; c = { id: p.id, name: p.name }; }
    var before = PT.row(c.id), prevLeft = before ? before.left : 999;
    if (!P.current(log, today())) P.setCurrent(log, c.id, c.name, now);
    P.addPitch(log, c.id, now);
    changed();
    var r = PT.row(c.id);
    buzz(r, prevLeft);
    if (r && r.limit && r.left <= 5) U.live(r.left <= 0 ? r.name + " is at the limit." : r.left + " pitches left for " + r.name);
  };
  PT.undo = function () {
    var c = PT.cur(); if (!c) return;
    if (P.undo(log, c.id, today(), Date.now())) { changed(); U.live("Took back one pitch."); }
    else U.toast("No pitch to take back for " + c.name + " today.", "warn");
  };
  PT.choose = function (id) {
    var name = P.nameOf(log, id);
    P.setCurrent(log, id, name, Date.now());
    changed();
    U.live(name + " is pitching.");
  };
  /* another device's log (the watch): keep every pitch once */
  PT.merge = function (other) {
    var r = P.merge(log, other, PT.cutoff);
    if (r.changed) { log = r.log; changed(); }
    return r.changed;
  };

  /* ---------- LYBS Ballclub, read from its own saved copies on this phone ---------- */
  function arr(x) { return Array.isArray(x) ? x : x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []; }
  function divisionOf(s) {
    s = String(s || "").toLowerCase();
    var m = P.DIVISIONS.filter(function (d) { return d !== "None" && s.indexOf(d.toLowerCase()) >= 0; });
    return m[0] || null;
  }
  PT.club = function () {
    try {
      var a = JSON.parse(localStorage.getItem("lybsAuthedTeam") || "null"), g = JSON.parse(localStorage.getItem("lybsGateSession") || "null");
      var team = (a && a.teamId) || (g && g.teamId);
      if (typeof team !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(team)) return null;
      var copy = function (k) { var s = localStorage.getItem("lybsOfflineCopy:teams/" + team + "/" + k); return s ? JSON.parse(s) : null; };
      var roster = arr(copy("roster")).map(function (p) { return p && typeof p.name === "string" ? p.name.trim() : ""; }).filter(Boolean);
      var depth = arr(copy("pitcherDepth")).filter(function (s) { return typeof s === "string" && s.trim(); });
      var apps = {};
      arr(copy("schedule")).forEach(function (gm) {
        if (!gm || typeof gm.date !== "string" || !Array.isArray(gm.pitchCounts)) return;
        gm.pitchCounts.forEach(function (pc) { if (pc && pc.name && pc.pitches != null) (apps[pc.name] = apps[pc.name] || []).push({ date: gm.date, pitches: Number(pc.pitches) }); });
      });
      var cfg = copy("config");
      return { team: team, names: depth.length ? depth : roster, apps: apps, division: cfg ? divisionOf(cfg.division || cfg.divisionName || cfg.name) : null };
    } catch (e) { return null; }
  };

  /* ---------- the card on the Game screen ---------- */
  var ZONE_TEXT = { green: "", yellow: "Getting close", red: "Almost done", limit: "At the limit" };
  PT.cardHTML = function () {
    var c = PT.cur();
    if (!c) {
      return '<section class="card pitch z-none" id="ptCard" aria-label="Pitching"><div class="pt-top"><h3>Pitching</h3><button type="button" class="btn ghost small" data-act="pt-pen">Bullpen</button></div>' +
        '<p class="mute small-note">Count your pitcher\'s pitches here. Tap +1 for each pitch.</p>' +
        '<div class="pt-btns"><button type="button" class="btn ghost" data-act="pt-pen">Pick a pitcher</button><button type="button" class="btn pt-add" data-act="pt-add">+1 Pitch</button></div></section>';
    }
    var r = PT.row(c.id) || { count: 0, limit: P.limitFor(log, c.id), left: P.limitFor(log, c.id), zone: "green" };
    var step = P.nextRestStep(r.count, log.division);
    var left = r.limit ? (r.left > 0 ? r.left + " left" : "Limit reached") : "No limit set";
    var h = '<section class="card pitch z-' + r.zone + '" id="ptCard" aria-label="Pitching">' +
      '<div class="pt-top"><button type="button" class="pt-who" data-act="pt-pen" aria-label="Pitching: ' + esc(c.name) + '. Open the bullpen">' + esc(c.name) + ' <span aria-hidden="true">&#9662;</span></button>' +
      (ZONE_TEXT[r.zone] ? '<span class="pt-flag">' + ZONE_TEXT[r.zone] + "</span>" : "") + "</div>" +
      '<div class="pt-mid"><div class="pt-count"><b class="num" id="ptCount">' + r.count + '</b><span>pitches</span></div>' +
      '<div class="pt-left"><b>' + esc(left) + "</b>" + (r.limit ? "<span>of " + r.limit + " today</span>" : "") + "</div></div>" +
      (step ? '<p class="pt-hint">Pitch ' + step.at + " means " + step.rest + (step.rest === 1 ? " day" : " days") + " of rest.</p>" : "") +
      '<div class="pt-btns"><button type="button" class="btn ghost" data-act="pt-undo">Undo</button><button type="button" class="btn pt-add" data-act="pt-add" aria-label="Add a pitch for ' + esc(c.name) + '">+1 Pitch</button></div></section>';
    return h;
  };
  PT.paint = function () {
    var el = $("#ptCard"); if (!el) return;
    var t = document.createElement("div"); t.innerHTML = PT.cardHTML();
    el.replaceWith(t.firstChild);
    if (sheet && !sheet.closed && sheet.repaint) sheet.repaint();
  };

  /* ---------- the bullpen sheet ---------- */
  function niceDay(d) { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return d; } }
  function penHTML() {
    var rows = PT.rows(), c = PT.cur(), h = "";
    if (!rows.length) h += '<p class="msg">No pitchers yet. Add the kids who can pitch, or get them from Ballclub in Pitching settings.</p>';
    h += '<div class="llist">' + rows.map(function (r) {
      var sub = r.count + (r.count === 1 ? " pitch" : " pitches") + " today" + (r.limit ? ", " + (r.left > 0 ? r.left + " left" : "at the limit") : "");
      if (!r.eligible) sub = "Resting until " + niceDay(r.eligibleOn) + (r.count ? ". " + sub : "");
      return '<button type="button" class="lrow pt-row z-' + (r.eligible ? r.zone : "rest") + (c && c.id === r.id ? " on" : "") + '" data-act="pt-choose" data-id="' + esc(r.id) + '">' +
        '<span class="pname">' + esc(r.name) + '</span><span class="pt-sub">' + esc(sub) + "</span>" + (c && c.id === r.id ? '<span class="rtag">Pitching</span>' : "") + "</button>";
    }).join("") + "</div>";
    h += '<div class="row wrap top"><label class="field grow"><span class="label">Add a pitcher</span><input type="text" id="ptNew" maxlength="40" autocomplete="off" placeholder="Name"></label>' +
      '<button type="button" class="btn small" data-act="pt-newp">Add</button></div>';
    return h;
  }
  WU.act["pt-pen"] = function () {
    sheet = U.openSheet({
      title: "Bullpen", html: penHTML(),
      footer: '<button type="button" class="btn ghost" data-act="pt-settings">Pitching settings</button><button type="button" class="btn" data-close>Done</button>',
      onClose: function () { sheet = null; }
    });
    sheet.repaint = function () { var y = sheet.body.scrollTop; sheet.body.innerHTML = penHTML(); sheet.body.scrollTop = y; };
    sheet.body.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "ptNew") { e.preventDefault(); WU.act["pt-newp"](); } });
  };
  WU.act["pt-newp"] = function () {
    var i = $("#ptNew"); if (!i) return;
    var p = addPitcher(i.value);
    if (!p) return;
    P.setCurrent(log, p.id, p.name, Date.now());
    changed();
    i.value = "";
  };
  WU.act["pt-choose"] = function (el) { PT.choose(el.dataset.id); if (sheet) sheet.close(); };
  WU.act["pt-add"] = function () { PT.add(); };
  WU.act["pt-undo"] = function () { PT.undo(); };

  /* ---------- settings ---------- */
  function settingsHTML() {
    var club = PT.club(), t = P.totals(log, today()), names = Object.keys(t);
    var h = '<label class="field"><span class="label">League pitch limits</span><select id="ptDiv">' + P.DIVISIONS.map(function (d) {
      var r = P.RULES[d];
      return '<option value="' + d + '"' + (d === log.division ? " selected" : "") + ">" + (r ? d + " (" + r.dailyMax + " a day)" : "No league limit") + "</option>";
    }).join("") + "</select></label>" +
      '<label class="field"><span class="label">Our own team max (optional)</span><input id="ptMax" type="number" inputmode="numeric" min="0" max="200" value="' + (log.max || "") + '" placeholder="None"></label>' +
      '<p class="mute small-note">Each pitcher uses the smallest of the league limit, the team max and their own limit below. The card turns yellow at 10 left and red at 5 left.</p>';
    h += '<h3 class="pt-h">Pitchers</h3>';
    h += log.pitchers.length ? '<div class="stack">' + log.pitchers.map(function (p) {
      return '<div class="row pt-prow"><span class="grow">' + esc(p.name) + '</span><label class="pt-lim"><span class="sr">Own limit for ' + esc(p.name) + '</span><input type="number" inputmode="numeric" min="0" max="200" data-plim="' + esc(p.id) + '" value="' + (p.limit || "") + '" placeholder="Limit"></label>' +
        '<button type="button" class="btn ghost small" data-act="pt-del" data-id="' + esc(p.id) + '" aria-label="Remove ' + esc(p.name) + '">Remove</button></div>';
    }).join("") + "</div>" : '<p class="msg">No pitchers yet.</p>';
    h += '<h3 class="pt-h">LYBS Ballclub</h3>';
    if (club) h += '<p class="mute small-note">Uses the pitchers and logged pitch counts Ballclub last showed on this phone' + (club.division ? " (" + esc(club.division) + ")" : "") + '. Pitchers resting from earlier games show "Resting" in the bullpen.</p>' +
      '<button type="button" class="btn ghost block" data-act="pt-club"' + (club.names.length ? "" : " disabled") + ">Add " + club.names.length + " pitchers from Ballclub</button>";
    else h += '<p class="mute small-note">Open your team in LYBS Ballclub on this phone once, and its pitchers and logged pitch counts show up here.</p>';
    h += '<h3 class="pt-h">Today\'s totals</h3>';
    h += names.length ? '<p class="msg" id="ptTot">' + names.map(function (n) { return esc(n) + ": " + t[n]; }).join("<br>") + '</p><button type="button" class="btn ghost small" data-act="pt-copy">Copy for Ballclub</button>' : '<p class="msg">No pitches yet today.</p>';
    h += '<label class="chk top"><input type="checkbox" id="ptShow"' + (PT.shown() ? " checked" : "") + "> <span>Show pitching on the Game screen</span></label>";
    return h;
  }
  WU.act["pt-settings"] = function () {
    var s = U.openSheet({ title: "Pitching settings", html: settingsHTML(), footer: '<button type="button" class="btn" data-close>Done</button>' });
    s.body.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "ptDiv") { log.division = P.DIVISIONS.indexOf(t.value) >= 0 ? t.value : "Majors"; setupChanged(); }
      else if (t.id === "ptMax") { log.max = Math.max(0, Math.min(200, parseInt(t.value, 10) || 0)); setupChanged(); }
      else if (t.dataset && t.dataset.plim) { var p = P.pitcherById(log, t.dataset.plim); if (p) { p.limit = Math.max(0, Math.min(200, parseInt(t.value, 10) || 0)); setupChanged(); } }
      else if (t.id === "ptShow") PT.show(t.checked);
    });
    s.repaintAll = function () { s.body.innerHTML = settingsHTML(); };
    PT.settingsSheet = s;
  };
  WU.act["pt-del"] = function (el) {
    log.pitchers = log.pitchers.filter(function (p) { return p.id !== el.dataset.id; });
    setupChanged();
    if (PT.settingsSheet && !PT.settingsSheet.closed) PT.settingsSheet.repaintAll();
  };
  WU.act["pt-club"] = function () {
    var club = PT.club(); if (!club) return;
    var n = 0;
    club.names.forEach(function (nm) { var before = log.pitchers.length; var p = addPitcher(nm); if (p && log.pitchers.length > before) { p.club = true; n++; } });
    if (club.division && P.DIVISIONS.indexOf(club.division) >= 0) log.division = club.division;
    setupChanged();
    U.toast(n ? "Added " + n + " pitchers from Ballclub." : "Those pitchers are already on the list.", "ok");
    if (PT.settingsSheet && !PT.settingsSheet.closed) PT.settingsSheet.repaintAll();
  };
  WU.act["pt-copy"] = function () {
    var t = P.totals(log, today()), txt = Object.keys(t).map(function (n) { return n + ": " + t[n]; }).join("\n");
    try { navigator.clipboard.writeText(txt).then(function () { U.toast("Copied. Paste it into the game in Ballclub.", "ok"); }, function () { U.toast("Couldn't copy. Select the totals and copy them.", "error"); }); }
    catch (e) { U.toast("Couldn't copy. Select the totals and copy them.", "error"); }
  };

  WU.on(function (what) { if (what === "pitch") PT.paint(); });
})();
