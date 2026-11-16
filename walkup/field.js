/* Walk-Up Field mode: the tablet at the field that plays walk-ups for any Lunenburg team.
   It signs in to LYBS Ballclub as an anonymous field tablet, asks a board member to let it in (a 6-letter code they match in
   Ballclub's Data Admin > Field tablets), then reads only game-day data: every team's schedule, and for today's games at this
   field the roster, the coach's saved lineup and each player's walk-up song (Ballclub's database rules allow nothing else).
   Lineups load as soon as the page opens and stay fresh every 5 minutes until first pitch, then hold still.
   Songs come from this tablet's own Walk-Up song library (Walk-Up > Songs): a coach's pick is found by name; anyone without
   one gets a song named for them, else one shared from the library, else a built-in sound. Everyone gets the announcer.
   What it saved for today stays on this tablet (localStorage "walkup.field.*") so the games still play with no signal,
   and is dropped the next day. Nothing goes to GitHub, and nothing is written to Ballclub but the tablet's own request. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, F = window.FieldCore, U = WU.U, E = WU.eng, esc = U.esc;
  var CFG = window.FIELD_CFG = window.FIELD_CFG || {
    apiKey: "AIzaSyCK2-ZDnWxSs-5ghhueRIR4OaSZ-1NgHGY", // LYBS Ballclub's public web key (a project id, not a secret)
    db: "https://lybs-ballclub-default-rtdb.firebaseio.com",
    leagueInfo: "/lybs-ballclub/data/league-info.json",
    refreshMs: 5 * 60 * 1000
  };
  var K = { auth: "walkup.field.auth", set: "walkup.field.settings", day: "walkup.field.day", game: "walkup.field.game", order: "walkup.field.order" };
  var root = document.getElementById("field");

  /* ---------- the computer voice inside the Dugout app (Android's web view has none) ---------- */
  var N = window.WalkupNative;
  if (N && !("speechSynthesis" in window) && typeof N.ttsSpeak === "function") {
    var utts = {}, seq = 0;
    window.SpeechSynthesisUtterance = function (text) { this.text = String(text || ""); this.rate = 1; this.volume = 1; this.pitch = 1; this.voice = null; this.lang = ""; this.onend = null; this.onerror = null; this.onstart = null; };
    window.speechSynthesis = {
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      speak: function (u) { var id = "t" + (++seq); utts[id] = u; this.speaking = true; try { N.ttsSpeak(id, u.text, Number(u.rate) || 1, u.volume == null ? 1 : Number(u.volume)); } catch (e) { window.__wuTts(id, "error"); } },
      cancel: function () { this.speaking = false; try { N.ttsStop(); } catch (e) { /* ignore */ } utts = {}; },
      getVoices: function () { return []; }, pause: function () {}, resume: function () {}, addEventListener: function () {}, removeEventListener: function () {}
    };
    window.__wuTts = function (id, ev) {
      var u = utts[id]; if (!u) return;
      if (ev === "start") { if (u.onstart) try { u.onstart({}); } catch (e) { /* ignore */ } return; }
      delete utts[id];
      if (!Object.keys(utts).length) window.speechSynthesis.speaking = false;
      var f = ev === "end" ? u.onend : u.onerror;
      if (f) try { f({}); } catch (e) { console.error(e); }
    };
  }

  /* ---------- storage that never throws ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function today() { return window.__today || F.ymd(new Date()); }
  function nowMin() { return window.__nowMin != null ? window.__nowMin : F.minutesOf(new Date()); }

  var S = {
    view: "boot", uid: "", code: "", approved: false, asked: false, gateMsg: "",
    set: Object.assign({ field: "", label: "", countdown: 2 }, lsGet(K.set) || {}),
    day: null, teams: [], fields: F.FIELDS.slice(), lib: { songs: [], settings: C.emptyState().settings },
    game: null, sides: [null, null], bat: 0, next: [0, 0], playing: null, count: null, loading: false, lastErr: ""
  };
  function saveSet() { lsSet(K.set, S.set); }

  /* ---------- Ballclub sign-in: one anonymous account for this tablet ---------- */
  var tok = null;
  function jpost(url, body, form) {
    return fetch(url, { method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }, body: form ? body : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error("auth"); e.status = r.status; throw e; } return j; }); });
  }
  function signUp() {
    return jpost("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + CFG.apiKey, { returnSecureToken: true }).then(function (j) {
      lsSet(K.auth, { uid: j.localId, rt: j.refreshToken });
      tok = { id: j.idToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
      return j.localId;
    });
  }
  function refresh(a) {
    return jpost("https://securetoken.googleapis.com/v1/token?key=" + CFG.apiKey, "grant_type=refresh_token&refresh_token=" + encodeURIComponent(a.rt), true).then(function (j) {
      lsSet(K.auth, { uid: j.user_id || a.uid, rt: j.refresh_token || a.rt });
      tok = { id: j.id_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
      return j.user_id || a.uid;
    });
  }
  function idToken() {
    if (tok && Date.now() < tok.exp - 60000) return Promise.resolve(tok.id);
    var a = lsGet(K.auth);
    var p = a && a.rt ? refresh(a).catch(function (e) { if (e && e.status === 400) { lsDel(K.auth); return signUp(); } throw e; }) : signUp();
    return p.then(function () { return tok.id; });
  }
  function dbUrl(path, t) { return CFG.db + "/" + path + ".json?auth=" + encodeURIComponent(t); }
  function get(path) {
    return idToken().then(function (t) { return fetch(dbUrl(path, t)); }).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error("denied"); e.denied = true; throw e; }
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }
  function put(path, v) {
    return idToken().then(function (t) { return fetch(dbUrl(path, t), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }); })
      .then(function (r) { if (!r.ok) { var e = new Error("http " + r.status); e.denied = r.status === 401 || r.status === 403; throw e; } return true; });
  }

  /* ---------- let in? ---------- */
  function checkGate() {
    return idToken().then(function () {
      var a = lsGet(K.auth) || {};
      S.uid = a.uid || ""; S.code = F.deviceCode(S.uid);
      return get("fieldKiosks/" + S.uid);
    }).then(function (g) {
      S.approved = !!(g && g.ok === true);
      S.gateMsg = "";
      return S.approved;
    }, function (e) {
      if (e && e.denied) { S.approved = false; S.gateMsg = "LYBS Select isn't ready for field tablets yet. Once its update is in, this screen works."; return false; }
      S.gateMsg = "";
      throw e;
    });
  }
  function ask() {
    var v = { code: S.code, at: Date.now() };
    if (S.set.label) v.label = String(S.set.label).slice(0, 40);
    return put("fieldKioskRequests/" + S.uid, v).then(function () { S.asked = true; U.toast("Asked. A board member can let this tablet in now.", "ok", 5000); render(); },
      function (e) { U.toast(e && e.denied ? "LYBS Select isn't ready for field tablets yet." : "Couldn't reach LYBS Select. Check the Wi-Fi and try again.", "error", 6000); });
  }

  /* ---------- the song library on this tablet (Walk-Up > Songs) ---------- */
  function loadLibrary() {
    var st = C.emptyState();
    try { st = C.sanitizeState(JSON.parse(localStorage.getItem("walkup.state") || "null")); } catch (e) { /* none yet */ }
    return WU.db.keys().then(function (keys) { return new Set(keys); }, function () { return new Set(); }).then(function (have) {
      S.have = have;
      S.lib = { songs: st.songs.filter(function (s) { return s.kind === "file" && have.has("s:" + s.id); }), settings: st.settings };
      E.setMaster(st.settings.master);
    });
  }

  /* ---------- teams, schedules and today's lineups ---------- */
  function registryTeams() {
    var t = window.TEAM_REGISTRY && window.TEAM_REGISTRY.teams;
    if (!t || typeof t !== "object") return null;
    return Object.keys(t).filter(function (id) { return /^[A-Za-z0-9_-]{1,60}$/.test(id); })
      .map(function (id) { return { teamId: id, name: String(t[id].name || id), shortName: String(t[id].shortName || "") }; });
  }
  function freshDay() {
    var d = lsGet(K.day);
    if (!d || d.date !== today() || typeof d.teams !== "object") d = { date: today(), teams: {}, list: [], at: 0 };
    return d;
  }
  function saveDay() { if (!lsSet(K.day, S.day)) U.toast("This tablet is out of room to save today's games.", "warn", 5000); }
  function teamsWithSched() {
    return S.teams.map(function (t) { var c = S.day.teams[t.teamId] || {}; return { teamId: t.teamId, name: t.name, shortName: t.shortName, schedule: c.schedule }; });
  }
  function games() { return F.gamesAt(teamsWithSched(), S.day.date, S.set.field); }
  function loadTeam(id) {
    return Promise.all([get("teams/" + id + "/roster"), get("teams/" + id + "/lineups"), get("teams/" + id + "/walkupSongs")]).then(function (r) {
      var c = S.day.teams[id] || (S.day.teams[id] = {});
      c.roster = r[0] || []; c.lineups = r[1] || []; c.picks = r[2] || {}; c.at = Date.now();
    });
  }
  /* schedules for every team, then lineups for the teams playing here today whose games haven't started */
  function sync(force) {
    if (S.loading) return Promise.resolve();
    S.loading = true; render();
    var list = registryTeams();
    if (list) { S.teams = list; S.day.list = list; } else S.teams = S.day.list || [];
    return Promise.all(S.teams.map(function (t) {
      return get("teams/" + t.teamId + "/schedule").then(function (s) { (S.day.teams[t.teamId] = S.day.teams[t.teamId] || {}).schedule = s || []; }, function () { /* keep what we had */ });
    })).then(function () {
      var want = {}, n = nowMin();
      games().forEach(function (g) {
        var w = F.loadWindow(g, n);
        g.sides.forEach(function (s) {
          if (s.visitor) return;
          var have = S.day.teams[s.teamId] && S.day.teams[s.teamId].at;
          if (force || w !== "started" || !have) want[s.teamId] = 1;
        });
      });
      return Promise.all(Object.keys(want).map(function (id) { return loadTeam(id).catch(function () { /* keep what we had */ }); }));
    }).then(function () {
      S.day.at = Date.now(); saveDay(); S.lastErr = "";
    }, function () { S.lastErr = "Couldn't reach LYBS Select. Showing what this tablet saved."; })
      .then(function () { S.loading = false; if (S.game) buildGame(S.game.key); render(); });
  }

  /* ---------- the order set at this tablet (today only): a team's {order, out}, or the other town's numbers ---------- */
  function ords() { var o = lsGet(K.order); return o && o.date === S.day.date && o.games && typeof o.games === "object" ? o : { date: S.day.date, games: {} }; }
  function getOrd(k) { var g = S.game && ords().games[S.game.key]; return g ? g[k] || null : null; }
  function setOrd(k, v) {
    var o = ords(), g = o.games[S.game.key] = o.games[S.game.key] || {};
    if (v == null) delete g[k]; else g[k] = v;
    lsSet(K.order, o);
  }

  /* ---------- one game's two batting orders ---------- */
  function buildSide(side, which, k) {
    var settings = Object.assign({}, S.lib.settings, { tstyle: "pa" }), b;
    if (side.visitor) {
      var vrows = F.visitorRows(getOrd(k));
      if (!vrows.length) return { side: side, st: null, visitor: true, note: "No lineup for the other town. Type their numbers to announce them." };
      b = F.buildSide(C, { side: which, rows: vrows, picks: {}, songs: S.lib.songs, settings: settings });
      return { side: side, st: b.st, visitor: true, note: "The other town, announced by number." };
    }
    var c = S.day.teams[side.teamId] || {}, pick = F.pickLineup(c.lineups, S.day.date);
    var base = F.orderRows(c.roster, pick && pick.lineup), saved = getOrd(k), rows = F.applyOrder(base, saved);
    b = F.buildSide(C, { side: which, rows: rows, picks: c.picks, songs: S.lib.songs, settings: settings });
    var note = !c.at ? "Not loaded yet." : !base.length ? "No players on this team's roster yet." :
      saved ? "Order set at this tablet." :
      pick && pick.exact ? "Coach's lineup for today." :
      pick ? "Coach's last saved lineup" + (pick.lineup.date ? " (" + niceDate(pick.lineup.date) + ")" : "") + ". Check the order." : "No lineup saved, so this is roster order.";
    return { side: side, st: b.st, base: base, note: note, picked: b.picked, unmatched: b.unmatched, loadedAt: c.at };
  }
  function buildGame(key) {
    var g = games().filter(function (x) { return x.key === key; })[0];
    if (!g) { S.game = null; S.view = "today"; return; }
    S.game = g;
    S.sides = [buildSide(g.sides[0], "a", 0), buildSide(g.sides[1], "b", 1)];
    var saved = lsGet(K.game);
    if (saved && saved.key === key) { S.bat = saved.bat === 1 ? 1 : 0; S.next = [+saved.next[0] || 0, +saved.next[1] || 0]; }
    else { S.bat = S.sides[0].st ? 0 : 1; S.next = [0, 0]; }
    S.next = S.next.map(function (n, i) { var len = S.sides[i].st ? S.sides[i].st.roster.length : 0; return len && n < len ? n : 0; });
  }

  /* ---------- changing the order at the tablet ---------- */
  function startEdit() {
    var sd = S.sides[S.bat]; stop(true);
    if (sd.visitor) S.edit = { which: S.bat, visitor: true, list: F.arr(getOrd(S.bat)).map(function (n) { return { num: String(n) }; }) };
    else {
      var saved = getOrd(S.bat) || {}, out = {};
      F.arr(saved.out).forEach(function (x) { out[x] = 1; });
      var ins = F.applyOrder(sd.base || [], saved).map(function (r) { return { row: r, out: false }; });
      var outs = (sd.base || []).filter(function (r) { return out[F.rowKey(r)]; }).map(function (r) { return { row: r, out: true }; });
      S.edit = { which: S.bat, visitor: false, list: ins.concat(outs) };
    }
    S.view = "order"; render();
  }
  function endEdit() {
    var e = S.edit; if (!e) return;
    if (e.visitor) setOrd(e.which, e.list.length ? e.list.map(function (x) { return x.num; }) : null);
    else setOrd(e.which, { order: e.list.map(function (x) { return F.rowKey(x.row); }), out: e.list.filter(function (x) { return x.out; }).map(function (x) { return F.rowKey(x.row); }) });
    S.edit = null; buildGame(S.game.key); S.view = "game"; saveGame(); render();
  }
  function resetEdit() {
    var e = S.edit; if (!e) return;
    if (e.visitor) e.list = [];
    else { setOrd(e.which, null); e.list = (S.sides[e.which].base || []).map(function (r) { return { row: r, out: false }; }); }
    render();
  }
  function moveEdit(i, j) {
    var l = S.edit && S.edit.list; if (!l || i === j || j < 0 || j >= l.length) return false;
    var x = l.splice(i, 1)[0]; l.splice(j, 0, x); return true;
  }
  function addNums() {
    var el = document.getElementById("fmNums"), nums = F.parseNums(el ? el.value : "");
    if (!nums.length) { U.toast("Type a jersey number first.", "warn", 3000); return; }
    nums.forEach(function (n) { if (S.edit.list.length < 40) S.edit.list.push({ num: n }); });
    if (el) el.value = "";
    render();
    var again = document.getElementById("fmNums"); if (again) again.focus();
  }
  function saveGame() { if (S.game) lsSet(K.game, { key: S.game.key, bat: S.bat, next: S.next }); }
  function niceDate(d) { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch (e) { return d; } }
  function clock(ms) { try { return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }

  /* ---------- playing ---------- */
  var token = 0, countTimer = null;
  function speechOpts(st) { var s = st.settings; return { voiceURI: s.tvoice || (E.speech ? C.pickVoice(E.speech.voices()) : ""), rate: s.trate, volume: s.tvol / 100 }; }
  function tap(i) {
    var sd = S.sides[S.bat]; if (!sd || !sd.st) return;
    var p = sd.st.roster[i]; if (!p) return;
    E.unlock();
    stop(true);
    var secs = Math.max(0, Math.min(5, +S.set.countdown || 0));
    if (!secs) { play(sd, i); return; }
    S.count = { i: i, left: secs }; render();
    countTimer = setInterval(function () {
      if (!S.count) return;
      S.count.left--;
      if (S.count.left <= 0) { clearInterval(countTimer); countTimer = null; var c = S.count; S.count = null; play(sd, c.i); }
      else render();
    }, 1000);
  }
  function cancelCount() { if (countTimer) clearInterval(countTimer); countTimer = null; if (S.count) { S.count = null; render(); } }
  function play(sd, i) {
    var p = sd.st.roster[i], my = ++token, n = sd.st.roster.length;
    S.next[S.bat] = n ? (i + 1) % n : 0; saveGame();
    S.playing = { bat: S.bat, i: i, state: "loading" }; render();
    var ul = E.unlock();
    Promise.all([E.prepare(p, sd.st, speechOpts(sd.st)), ul]).then(function (r) {
      if (my !== token) return;
      if (!r[1]) { S.playing = null; render(); U.toast("The tablet is keeping the sound asleep. Tap again, and check the volume.", "error", 7000); return; }
      E.play(r[0], { key: "f:" + p.id, onEnd: function () { if (my === token) { S.playing = null; render(); } } });
      S.playing.state = "playing"; render();
    }, function () {
      if (my !== token) return;
      S.playing = null; render();
      U.toast("Couldn't play that one. Its song may have been removed from this tablet.", "error", 6000);
    });
  }
  function stop(quiet) { cancelCount(); token++; var was = E.stop(quiet ? 0.05 : C.LIM.stopFade); S.playing = null; if (!quiet) render(); return was; }

  /* ---------- screens ---------- */
  function header(title, back) {
    return '<header class="fm-top">' + (back ? '<button type="button" class="btn ghost small" data-a="' + back + '">Back</button>' : '<span class="fm-brand">Walk-Up</span>') +
      '<h1>' + esc(title) + '</h1><button type="button" class="btn ghost small" data-a="settings" aria-label="Field mode settings">' + U.I.gear + '</button></header>';
  }
  function viewGate() {
    var h = header("Field mode") + '<main class="fm-main fm-gate">';
    if (S.gateMsg) return h + '<div class="card"><p class="lead">' + esc(S.gateMsg) + '</p><button type="button" class="btn" data-a="retry">Try again</button></div></main>';
    h += '<div class="card"><p class="lead">Let this tablet in</p><p class="mute">A board member opens <b>LYBS Select</b>, then <b>Data Admin</b> and <b>Field tablets</b>, and taps <b>Let in</b> next to this code.</p>' +
      '<div class="fm-code" aria-label="Tablet code">' + esc(S.code.split("").join(" ")) + '</div>' +
      '<label class="fm-lbl">Name this tablet <input id="fmLabel" maxlength="40" placeholder="Press box tablet" value="' + esc(S.set.label) + '"></label>' +
      '<div class="stack"><button type="button" class="btn block big" data-a="ask">' + (S.asked ? "Ask again" : "Ask to be let in") + '</button>' +
      '<button type="button" class="btn ghost block" data-a="retry">I\'ve been let in</button></div></div></main>';
    return h;
  }
  function viewSettings() {
    var h = header("Field mode settings", "back") + '<main class="fm-main"><div class="card"><p class="lead">Which field is this tablet at?</p><div class="fm-fields">';
    S.fields.concat([""]).forEach(function (f) { h += '<button type="button" class="btn ' + (S.set.field === f ? "" : "ghost") + '" data-a="field" data-f="' + esc(f) + '">' + esc(f || "Every Lunenburg field") + '</button>'; });
    h += '</div></div><div class="card"><p class="lead">Countdown before a walk-up</p><p class="mute">Tap the screen during the countdown to cancel.</p><div class="fm-fields">';
    [0, 1, 2, 3, 5].forEach(function (n) { h += '<button type="button" class="btn ' + (+S.set.countdown === n ? "" : "ghost") + '" data-a="cd" data-n="' + n + '">' + (n ? n + " s" : "None") + '</button>'; });
    h += '</div></div><div class="card"><p class="lead">Songs on this tablet: ' + S.lib.songs.length + '</p><p class="mute">Kids\' walk-up songs come from this tablet\'s Walk-Up song library. Add the league\'s songs there; a song a coach picked in LYBS Select plays when its name matches.</p>' +
      '<a class="btn ghost block" href="./">Open Walk-Up songs</a></div></main>';
    return h;
  }
  function viewToday() {
    var gs = games(), n = nowMin(), title = S.set.field || "Every Lunenburg field";
    var h = header(title) + '<main class="fm-main">';
    h += '<div class="fm-bar"><span class="mute">' + esc(niceDate(S.day.date)) + (S.day.at ? " · updated " + esc(clock(S.day.at)) : "") + '</span><button type="button" class="btn ghost small" data-a="sync"' + (S.loading ? " disabled" : "") + '>' + (S.loading ? "Loading…" : "Refresh") + '</button></div>';
    if (S.lastErr) h += '<p class="msg warn">' + esc(S.lastErr) + '</p>';
    if (!S.lib.songs.length) h += '<p class="msg warn">No songs on this tablet yet, so everyone gets a built-in sound. Add songs in Walk-Up.</p>';
    if (!gs.length) {
      h += '<div class="card"><p class="lead">No games ' + (S.set.field ? "at " + esc(S.set.field) + " " : "") + 'today.</p><p class="mute">Games show up here from each team\'s schedule in LYBS Select. A game needs its field in the location to show at this field.</p>' +
        (S.set.field ? '<button type="button" class="btn ghost block" data-a="field" data-f="">Show every Lunenburg game today</button>' : "") + '</div>';
    }
    gs.forEach(function (g) {
      var w = F.loadWindow(g, n), when = w === "started" ? "Started" : w === "early" ? "Lineups refresh until first pitch" : "Lineups stay fresh until first pitch";
      h += '<button type="button" class="fm-game" data-a="open" data-k="' + esc(g.key) + '"><span class="fm-time">' + esc(g.timeLabel) + '</span>' +
        '<span class="fm-vs">' + esc(g.sides[0].name) + ' <span class="mute">at</span> ' + esc(g.sides[1].name) + '</span>' +
        '<span class="mute small">' + esc(g.location || "") + (g.location ? " · " : "") + esc(when) + '</span></button>';
    });
    return h + '</main>';
  }
  function who(p) { return p.name ? (p.num ? "#" + p.num + " " : "") + p.name : p.num ? "Number " + p.num : "Player"; }
  function tile(sd, p, i) {
    var song = p.songId ? C.songById(sd.st.songs, p.songId) : null, isNext = S.next[S.bat] === i, on = S.playing && S.playing.bat === S.bat && S.playing.i === i;
    return '<button type="button" class="fm-tile' + (isNext ? " next" : "") + (on ? " on" : "") + '" data-a="tap" data-i="' + i + '">' +
      '<span class="fm-num">' + esc(p.num && p.name ? "#" + p.num : "") + '</span><span class="fm-name">' + esc(p.name || (p.num ? "#" + p.num : "Player")) + '</span>' +
      '<span class="fm-song">' + esc(song ? song.title : "No song") + '</span>' + (isNext ? '<span class="fm-tag">Up next</span>' : "") + (on ? '<span class="fm-tag live">' + (S.playing.state === "loading" ? "Getting ready" : "Playing") + '</span>' : "") + '</button>';
  }
  function viewGame() {
    var g = S.game, h = header(g.sides[0].name + " at " + g.sides[1].name, "home") + '<main class="fm-main fm-game-v">';
    h += '<div class="fm-teams" role="tablist">';
    S.sides.forEach(function (sd, k) { h += '<button type="button" role="tab" aria-selected="' + (S.bat === k) + '" class="fm-team' + (S.bat === k ? " on" : "") + '" data-a="bat" data-k="' + k + '">' + esc(sd.side.name) + '<span class="small mute">' + (k ? "Bottom" : "Top") + '</span></button>'; });
    h += '</div>';
    var sd = S.sides[S.bat];
    h += '<div class="fm-bar"><span class="mute">' + esc(sd.note) + (sd.loadedAt ? " Loaded " + esc(clock(sd.loadedAt)) + "." : "") + '</span>' + (sd.visitor ? '<button type="button" class="btn small" data-a="order">' + (sd.st ? "Change numbers" : "Type their numbers") + '</button>' :
      '<span class="stack-h">' + (sd.base && sd.base.length ? '<button type="button" class="btn ghost small" data-a="order">Change order</button>' : "") +
      '<button type="button" class="btn ghost small" data-a="reload"' + (S.loading ? " disabled" : "") + '>' + (S.loading ? "Loading…" : "Reload lineups") + '</button></span>') + '</div>';
    if (sd.unmatched && sd.unmatched.length) h += '<p class="msg warn">Not on this tablet: ' + sd.unmatched.map(function (u) { return esc(C.firstWord(u.name) + " (" + u.song + ")"); }).join(", ") + '. They get another song for now.</p>';
    if (!sd.st && sd.visitor) h += '<div class="card"><p class="mute">Type the other town\'s jersey numbers in batting order, and each batter is announced "Now batting, number 7" with a song from this tablet.</p><button type="button" class="btn block big" data-a="order">Type their numbers</button></div>';
    else if (!sd.st) h += '<div class="card"><p class="mute">' + esc(sd.note) + '</p></div>';
    else if (!sd.st.roster.length) h += '<div class="card"><p class="mute">' + esc(sd.note) + '</p></div>';
    else { h += '<div class="fm-grid">'; sd.st.roster.forEach(function (p, i) { h += tile(sd, p, i); }); h += '</div>'; }
    var nx = sd.st && sd.st.roster[S.next[S.bat]];
    h += '</main><footer class="fm-foot">' + (nx ? '<button type="button" class="btn big fm-play" data-a="tap" data-i="' + S.next[S.bat] + '">' + U.I.play + ' Play ' + esc(who(nx)) + '</button>' : "<span></span>") +
      '<button type="button" class="btn big fm-stop" data-a="stop">' + U.I.stop + ' Stop</button></footer>';
    if (S.count) { var cp = sd.st.roster[S.count.i]; h += '<div class="fm-count" data-a="cancel" role="alertdialog" aria-label="Countdown, tap to cancel"><div class="fm-count-n">' + S.count.left + '</div><div class="fm-count-who">' + esc(who(cp)) + '</div><div class="mute">Tap to cancel</div></div>'; }
    return h;
  }
  function viewOrder() {
    var e = S.edit, sd = S.sides[e.which], ins = 0;
    var h = header(sd.side.name + (e.visitor ? ": numbers" : ": batting order"), "order-done") + '<main class="fm-main fm-order">';
    if (e.visitor) h += '<div class="card"><p class="lead">Their jersey numbers, in batting order</p><div class="fm-addnum"><input id="fmNums" inputmode="numeric" autocomplete="off" placeholder="7, 12, 3" aria-label="Jersey numbers"><button type="button" class="btn" data-a="nums-add">Add</button></div></div>';
    else h += '<p class="mute">Drag a player by the handle, or use the arrows. Tap Not here for anyone missing today.</p>';
    if (!e.list.length) h += '<p class="mute">' + (e.visitor ? "No numbers yet." : "No players.") + '</p>';
    h += '<ol class="fm-olist" id="fmOList">';
    e.list.forEach(function (x, i) {
      var label = e.visitor ? "Number " + x.num : (x.row.num ? "#" + x.row.num + " " : "") + x.row.name;
      if (!x.out) ins++;
      h += '<li class="fm-orow' + (x.out ? " out" : "") + '" data-i="' + i + '"><span class="fm-handle" data-drag="' + i + '" aria-hidden="true">&#8801;</span>' +
        '<span class="fm-opos">' + (x.out ? "" : ins) + '</span><span class="fm-oname">' + esc(label) + (x.out ? ' <span class="mute small">not here</span>' : "") + '</span>' +
        '<button type="button" class="btn ghost small" data-a="o-up" data-i="' + i + '" aria-label="Move ' + esc(label) + ' up"' + (i ? "" : " disabled") + '>&#9650;</button>' +
        '<button type="button" class="btn ghost small" data-a="o-down" data-i="' + i + '" aria-label="Move ' + esc(label) + ' down"' + (i < e.list.length - 1 ? "" : " disabled") + '>&#9660;</button>' +
        (e.visitor ? '<button type="button" class="btn ghost small" data-a="o-del" data-i="' + i + '">Remove</button>' : '<button type="button" class="btn ghost small" data-a="o-out" data-i="' + i + '">' + (x.out ? "Here" : "Not here") + '</button>') + '</li>';
    });
    h += '</ol></main><footer class="fm-foot"><button type="button" class="btn big" data-a="order-done">Done</button>' +
      '<button type="button" class="btn big ghost" data-a="o-reset">' + (e.visitor ? "Clear" : "Coach's order") + '</button></footer>';
    return h;
  }
  function render() {
    var h = S.view === "boot" ? header("Field mode") + '<main class="fm-main"><p class="mute">Getting ready…</p></main>' :
      S.view === "gate" ? viewGate() : S.view === "settings" ? viewSettings() : S.view === "game" && S.game ? viewGame() : S.view === "order" && S.edit && S.game ? viewOrder() : viewToday();
    var kept = ["fmLabel", "fmNums"].map(function (id) { var el = document.getElementById(id); return el ? el.value : null; });
    root.querySelector("#fmView").innerHTML = h;
    ["fmLabel", "fmNums"].forEach(function (id, i) { var el = document.getElementById(id); if (el && kept[i] != null) el.value = kept[i]; });
  }

  /* ---------- taps ---------- */
  root.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-a]"); if (!el || !root.contains(el)) return;
    var a = el.dataset.a;
    if (a === "ask") { var l = document.getElementById("fmLabel"); S.set.label = l ? l.value.trim().slice(0, 40) : ""; saveSet(); ask(); }
    else if (a === "retry") start();
    else if (a === "settings") { if (S.view !== "settings") S.back = S.view; S.view = "settings"; render(); }
    else if (a === "back") { S.view = S.back === "game" && S.game ? "game" : S.approved ? "today" : "gate"; render(); }
    else if (a === "home") { stop(true); S.game = null; S.view = S.approved ? "today" : "gate"; render(); }
    else if (a === "field") { S.set.field = el.dataset.f || ""; S.set.fieldChosen = true; saveSet(); if (S.game) { stop(true); S.game = null; } S.view = S.approved ? "today" : "gate"; render(); if (S.approved) sync(false); }
    else if (a === "cd") { S.set.countdown = +el.dataset.n || 0; saveSet(); render(); }
    else if (a === "sync") sync(false);
    else if (a === "reload") sync(true);
    else if (a === "open") { buildGame(el.dataset.k); S.view = "game"; wake(); render(); }
    else if (a === "bat") { S.bat = +el.dataset.k ? 1 : 0; saveGame(); render(); }
    else if (a === "tap") tap(+el.dataset.i);
    else if (a === "stop") stop(false);
    else if (a === "cancel") cancelCount();
    else if (a === "order") startEdit();
    else if (a === "order-done") endEdit();
    else if (a === "o-reset") resetEdit();
    else if (a === "o-up" || a === "o-down") { var i = +el.dataset.i; if (moveEdit(i, a === "o-up" ? i - 1 : i + 1)) render(); }
    else if (a === "o-out") { var x = S.edit.list[+el.dataset.i]; if (x) { x.out = !x.out; var l = S.edit.list; l.splice(l.indexOf(x), 1); if (x.out) l.push(x); else l.splice(l.filter(function (y) { return !y.out; }).length, 0, x); render(); } }
    else if (a === "o-del") { S.edit.list.splice(+el.dataset.i, 1); render(); }
    else if (a === "nums-add") addNums();
  });

  root.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target && ev.target.id === "fmNums") { ev.preventDefault(); addNums(); } });

  /* dragging a player by the handle: the list reorders under the finger */
  var drag = null;
  root.addEventListener("pointerdown", function (ev) {
    var hd = ev.target.closest && ev.target.closest("[data-drag]"); if (!hd || !S.edit) return;
    ev.preventDefault(); drag = { i: +hd.dataset.drag, id: ev.pointerId };
    var li = hd.closest(".fm-orow"); if (li) li.classList.add("drag");
  });
  document.addEventListener("pointermove", function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var over = document.elementFromPoint(ev.clientX, ev.clientY), li = over && over.closest && over.closest(".fm-orow");
    if (!li) return;
    var j = +li.dataset.i;
    if (moveEdit(drag.i, j)) { drag.i = j; render(); var nl = root.querySelector('.fm-orow[data-i="' + j + '"]'); if (nl) nl.classList.add("drag"); }
  });
  function endDrag(ev) { if (drag && ev.pointerId === drag.id) { drag = null; var d = root.querySelector(".fm-orow.drag"); if (d) d.classList.remove("drag"); } }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  /* keep the screen on during a game where the browser allows it (the Dugout app does it for the whole of Field mode) */
  var lock = null;
  function wake() { try { if (navigator.wakeLock && !lock) navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }, function () {}); } catch (e) { /* ignore */ } }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.view === "game") wake(); });

  /* ---------- start ---------- */
  var timer = null;
  function start() {
    render();
    S.day = freshDay();
    var info = fetch(CFG.leagueInfo).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.fields = F.homeFields(j); }, function () { /* keep the built-in list */ });
    return Promise.all([loadLibrary(), info]).then(function () {
      return checkGate().then(function (ok) {
        if (!ok) { S.view = "gate"; render(); return; }
        S.view = S.set.field || S.set.fieldChosen ? "today" : "settings";
        render();
        if (S.view === "today") sync(false); // a new tablet loads once its field is picked
        if (!timer) timer = setInterval(function () { if (S.approved && !document.hidden) sync(false); }, CFG.refreshMs);
      }, function () {
        /* no signal: a tablet that was let in before still plays what it saved for today */
        if (S.day.at) { S.approved = true; S.teams = S.day.list || []; S.lastErr = "No signal. Showing what this tablet saved today."; S.view = "today"; }
        else { S.view = "gate"; S.gateMsg = "No signal. Connect this tablet to Wi-Fi to load today's games."; }
        render();
      });
    });
  }
  root.innerHTML = '<div id="fmView"></div><div class="wu-toasts" id="wuToasts" aria-live="polite"></div>';
  WU.field = { S: S, F: F, start: start, sync: sync };
  /* saved on the tablet, so Field mode opens with no signal once it has opened once */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* works without it */ }); });
  start();
})();
