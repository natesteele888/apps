/* Walk-Up and LYBS Ballclub's walk-up song requests.
   Families ask for a song on Ballclub's Roster (lybs-ballclub js/song-requests.js); a coach approves or declines it here
   in one tap, and approved songs come onto this phone and onto the player, starting where the family set them.
   This only works for a coach signed in to Ballclub with the team's coach code on this phone (the same site, so Walk-Up
   can use that sign-in). It talks only to Ballclub's own database, behind that sign-in. Song files and names never go
   anywhere else, and nothing is ever stored in this repo. Without that sign-in this file does nothing at all. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var CL = WU.club = {};
  /* Ballclub's database and its public web key (the same one Ballclub's own page gives every visitor) */
  var DB = "https://lybs-ballclub-default-rtdb.firebaseio.com";
  var KEY = "AIzaSyCK2-ZDnWxSs-5ghhueRIR4OaSZ-1NgHGY";
  var DONE_KEY = "walkup-club-done-v1"; // pid -> the approved song's time, once it's on this phone
  var tok = null, mem = null, previewEl = null, previewUrl = null;

  /* ---------- the Ballclub coach sign-in on this phone ---------- */
  CL.session = function () {
    try {
      var g = JSON.parse(localStorage.getItem("lybsGateSession") || "null");
      if (!g || g.role !== "coach" || typeof g.refreshToken !== "string" || typeof g.teamId !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(g.teamId)) return null;
      return g;
    } catch (e) { return null; }
  };
  function copy(team, k) { try { var s = localStorage.getItem("lybsOfflineCopy:teams/" + team + "/" + k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function done() { try { return JSON.parse(localStorage.getItem(DONE_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function markDone(pid, at) { var d = done(); d[pid] = at; try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch (e) {} }
  async function idToken() {
    var g = CL.session(); if (!g) throw new Error("nosession");
    if (tok && tok.exp > Date.now() + 60000 && tok.rt === g.refreshToken) return tok.id;
    var res = await fetch("https://securetoken.googleapis.com/v1/token?key=" + KEY, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(g.refreshToken) });
    if (!res.ok) throw new Error("signin");
    var d = await res.json();
    tok = { id: d.id_token, exp: Date.now() + Number(d.expires_in || 3600) * 1000, rt: g.refreshToken };
    return tok.id;
  }
  async function get(path) {
    var res = await fetch(DB + "/" + path + ".json?auth=" + encodeURIComponent(await idToken()));
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  async function patch(updates) {
    var res = await fetch(DB + "/.json?auth=" + encodeURIComponent(await idToken()), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) throw new Error("HTTP " + res.status);
  }

  /* ---------- what's waiting ---------- */
  function arr(x) { return Array.isArray(x) ? x : x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []; }
  function snapshot(team, reqs, songs, roster) {
    var byId = {}; arr(roster).forEach(function (p) { if (p && p.id != null) byId[p.id] = p; });
    var pend = Object.keys(reqs || {}).map(function (rid) { var r = reqs[rid]; return r && typeof r === "object" ? { rid: rid, r: r } : null; })
      .filter(function (x) { return x && x.r.st === "pending" && typeof x.r.pid === "string"; })
      .sort(function (a, b) { return String(a.r.at || "").localeCompare(String(b.r.at || "")); });
    var d = done(), todo = Object.keys(songs || {}).filter(function (pid) { var s = songs[pid]; return s && typeof s === "object" && d[pid] !== s.at; });
    return { team: team, reqs: reqs || {}, songs: songs || {}, players: byId, pending: pend, todo: todo };
  }
  /* from Ballclub's own copies on this phone first (no network), then fresh */
  CL.state = function () {
    var g = CL.session(); if (!g) return null;
    if (mem && mem.team === g.teamId) return mem;
    return snapshot(g.teamId, copy(g.teamId, "songRequests"), copy(g.teamId, "walkupSongs"), copy(g.teamId, "roster"));
  };
  CL.count = function () { var s = CL.state(); return s ? s.pending.length + s.todo.length : 0; };
  CL.refresh = async function () {
    var g = CL.session(); if (!g) return null;
    var base = "teams/" + g.teamId + "/", r = await Promise.all([get(base + "songRequests"), get(base + "walkupSongs"), get(base + "roster")]);
    mem = snapshot(g.teamId, r[0], r[1], r[2]);
    WU.emit("club");
    return mem;
  };

  /* ---------- names ---------- */
  function clubName(st, pid) { var p = st.players[pid]; return p ? String(p.name || "") : ""; }
  function label(st, pid) {
    var p = st.players[pid]; if (!p) return "A player";
    var first = String(p.name || "").trim().split(/\s+/)[0] || "";
    return ((p.number ? "#" + p.number + " " : "") + first).trim() || "A player";
  }
  /* the Walk-Up player with the same name as the Ballclub player */
  function here(st, pid) {
    var n = C.normName(clubName(st, pid)); if (!n) return null;
    for (var i = 0; i < S.st.roster.length; i++) if (C.normName(S.st.roster[i].name) === n) return S.st.roster[i];
    return null;
  }
  function fileOf(st, s) { return s.kind === "library" ? "walkupLibraryFiles/" + s.lib : "songFiles/" + st.team + "/" + s.file; }
  function asFile(rec, title) {
    var bin = atob(String(rec.data || "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var type = /^audio\//.test(rec.type || "") ? rec.type : "audio/mpeg", ext = (/\.([a-z0-9]{2,4})$/i.exec(rec.name || "") || [, "mp3"])[1];
    return new File([bytes], C.str(title, 80).replace(/[\\/:*?"<>|]+/g, " ") + "." + ext, { type: type });
  }
  function fmt(sec) { sec = Math.max(0, Math.round(Number(sec) || 0)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }

  /* ---------- putting an approved song onto the player ---------- */
  CL.bring = async function (pid) {
    var st = mem || CL.state(); if (!st) return false;
    var s = st.songs[pid], p = here(st, pid); if (!s) return false;
    if (!p) { U.toast(label(st, pid) + " isn't in your Walk-Up team yet. Bring in your Ballclub lineup first.", "warn", 6000); return false; }
    if (s.kind === "link") {
      p.want = C.cleanLabel(s.title, C.REQ.want) || p.want; WU.commit("data"); markDone(pid, s.at);
      U.toast(p.name + "'s song is a link, so it still needs the file: " + s.title, "warn", 7000);
      return true;
    }
    var busy = U.busy("Getting " + s.title + "..."), rec;
    try { rec = await get(fileOf(st, s)); } catch (e) { rec = null; } finally { busy.done(); }
    if (!rec || !rec.data) { U.toast("Couldn't get \"" + s.title + "\" from Ballclub just now.", "error"); return false; }
    var r = await WU.songs.addFiles([asFile(rec, s.title)]), song = r.added[0];
    if (!song) return false;
    WU.songs.choose(p.id, song.id);
    p.trim = C.clampTrim(song.dur, { start: Number(s.start) || 0, len: song.len, fade: song.fade });
    WU.commit("data"); markDone(pid, s.at);
    U.toast(p.name + "'s walk-up song: " + s.title + (s.start ? ", from " + fmt(s.start) : "") + ".", "ok");
    return true;
  };

  /* ---------- the sheet ---------- */
  function stopPreview() { if (previewEl) { try { previewEl.pause(); } catch (e) {} } if (previewUrl) URL.revokeObjectURL(previewUrl); previewEl = previewUrl = null; }
  WU.act["club-songs"] = function () { CL.open(); };
  CL.open = function () {
    var off = null, api = U.openSheet({
      title: "Song requests from Ballclub", cls: "club-songs tall",
      html: '<div id="clRows"><p class="mute">Checking Ballclub...</p></div><p class="mute small-note">Families ask on Ballclub\'s Roster. Approved songs come onto this phone, starting where the family set them. The old song stays until you approve.</p>',
      footer: '<button type="button" class="btn" data-close>Done</button>',
      onClose: function () { stopPreview(); if (off) off(); }
    });
    var el = api.el;
    function paint() {
      var st = mem || CL.state(), h = "";
      if (!st) { $("#clRows", el).innerHTML = '<p class="mute">Sign in to Ballclub with the coach code on this phone first.</p>'; return; }
      st.pending.forEach(function (x) {
        var r = x.r, src = r.kind === "library" ? "League library" : r.kind === "link" ? "A link" : "An uploaded file";
        h += '<div class="clrow" data-rid="' + esc(x.rid) + '"><div><b>' + esc(label(st, r.pid)) + "</b>: " + esc(r.title) + (r.start ? " from " + fmt(r.start) : "") +
          '<div class="mute small-note">' + esc(src) + " · asked by " + esc(r.by || "a family") + '</div></div><div class="row wrap">' +
          '<button type="button" class="btn ghost small" data-do="hear">' + (r.kind === "link" ? "Open" : "Play") + '</button><button type="button" class="btn small" data-do="ok">Approve</button><button type="button" class="btn ghost small" data-do="no">Decline</button></div></div>';
      });
      st.todo.forEach(function (pid) {
        var s = st.songs[pid];
        h += '<div class="clrow" data-pid="' + esc(pid) + '"><div><b>' + esc(label(st, pid)) + "</b>: " + esc(s.title) + '<div class="mute small-note">Approved, not on this phone yet</div></div><button type="button" class="btn small" data-do="bring">Put on this phone</button></div>';
      });
      $("#clRows", el).innerHTML = h || '<p class="mute">Nothing waiting. Share the request link from Ballclub\'s Roster so families can ask.</p>';
    }
    paint();
    CL.refresh().then(paint, function () { if (!api.closed) { paint(); U.toast("Couldn't reach Ballclub just now. This is the last copy on this phone.", "warn", 6000); } });
    off = WU.on(function (w) { if (!api.closed && w === "club") paint(); });
    el.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      var row = b.closest(".clrow"), st = mem || CL.state(); if (!row || !st) return;
      var rid = row.dataset.rid, x = rid ? st.reqs[rid] : null, d = b.dataset.do;
      if (d === "bring") { b.disabled = true; await CL.bring(row.dataset.pid); await CL.refresh().catch(function () {}); return; }
      if (!x) return;
      if (d === "hear") {
        if (x.kind === "link") { if (/^https?:\/\//.test(x.link || "")) window.open(x.link, "_blank", "noopener"); return; }
        if (previewEl) { stopPreview(); return; }
        var rec = null; try { rec = await get(fileOf(st, x)); } catch (er) {}
        if (!rec || !rec.data) { U.toast("Couldn't get that song just now.", "error"); return; }
        previewUrl = URL.createObjectURL(asFile(rec, x.title)); previewEl = new Audio(previewUrl);
        previewEl.addEventListener("loadedmetadata", function () { try { previewEl.currentTime = Number(x.start) || 0; } catch (er) {} }, { once: true });
        previewEl.play().catch(function () { U.toast("This phone couldn't play that file.", "error"); });
        return;
      }
      var base = "teams/" + st.team + "/songRequests/" + rid, up = {}, at = new Date().toISOString();
      if (d === "ok") {
        b.disabled = true; stopPreview();
        up[base + "/st"] = "approved"; up[base + "/decidedAt"] = at;
        var song = { kind: x.kind, title: x.title, start: Number(x.start) || 0, at: at, rid: rid };
        if (x.kind === "library") song.lib = x.lib; else if (x.kind === "link") song.link = x.link; else song.file = x.file;
        up["teams/" + st.team + "/walkupSongs/" + x.pid] = song;
        try { await patch(up); } catch (er) { b.disabled = false; U.toast("Couldn't approve that just now. Check your signal.", "error"); return; }
        await CL.refresh().catch(function () {});
        await CL.bring(x.pid);
        await CL.refresh().catch(function () {});
      } else if (d === "no") {
        CL.decline(st, rid, x);
      }
    });
  };
  CL.decline = function (st, rid, x) {
    var api = U.openSheet({
      title: "Decline " + x.title + "?", cls: "confirm",
      html: '<p class="msg">The old song stays. The family sees your note on Ballclub.</p><label class="field"><span class="label">A short note (optional)</span><input type="text" id="clNote" maxlength="300" autocomplete="off" placeholder="Pick a clean version"></label>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn danger solid" data-ok>Decline</button>',
      onOpen: function (a) {
        $("[data-ok]", a.el).addEventListener("click", async function () {
          var base = "teams/" + st.team + "/songRequests/" + rid, up = {};
          up[base + "/st"] = "declined"; up[base + "/decidedAt"] = new Date().toISOString(); up[base + "/note"] = String($("#clNote", a.el).value || "").trim().slice(0, 300);
          try { await patch(up); } catch (er) { U.toast("Couldn't decline that just now. Check your signal.", "error"); return; }
          a.close(); await CL.refresh().catch(function () {});
        });
      }
    });
    return api;
  };

  /* ---------- the badge ---------- */
  CL.buttonHTML = function (cls) {
    if (!CL.session()) return "";
    var n = CL.count();
    return '<button type="button" class="btn ' + (cls || "ghost small") + '" data-act="club-songs">Ballclub requests' + (n ? ' <span class="badge" aria-label="' + n + ' waiting">' + n + "</span>" : "") + "</button>";
  };
  /* once a session, when the app opens: a quiet check, and a nudge when something waits */
  CL.start = function () {
    if (!CL.session() || !navigator.onLine) return;
    CL.refresh().then(function (st) {
      var n = st ? st.pending.length + st.todo.length : 0;
      if (n) U.toast(n === 1 ? "1 walk-up song from Ballclub is waiting for you." : n + " walk-up songs from Ballclub are waiting for you.", "", 9000, { text: "Open", fn: CL.open });
    }, function () {});
  };
  CL._test = { snapshot: snapshot, asFile: asFile, fmt: fmt };
})();
