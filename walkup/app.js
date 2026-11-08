/* Walk-Up app shell: the four tabs, the Game screen (Play, Stop, Prev, Next), warming up the next walk-ups, the wake lock, startup. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, D = WU.data, esc = U.esc, $ = U.$, $$ = U.$$;
  var A = WU.app = {};
  var TABS = [["game", "Game", "game"], ["team", "Team", "team"], ["songs", "Songs", "note"], ["settings", "Settings", "gear"]];
  var token = 0, rafId = 0, rafOn = false;
  WU.onFile = WU.onFile || {};

  /* ---------- the frame ---------- */
  function paintTop() {
    var t = TABS.filter(function (x) { return x[0] === S.tab; })[0];
    $("#wuTop").innerHTML = '<h1 class="brand">Walk-Up</h1><span class="tabname">' + esc(t ? t[1] : "") + "</span>";
  }
  function paintNav() {
    $("#wuNav").innerHTML = TABS.map(function (t) {
      var on = t[0] === S.tab;
      return '<button type="button" class="navb' + (on ? " on" : "") + '" data-act="tab" data-tab="' + t[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + U.I[t[2]] + "<span>" + t[1] + "</span></button>";
    }).join("");
  }
  function paintBanners() {
    var h = "";
    if (S.mem) h += '<div class="banner bad" role="alert"><p><b>Can\'t save on this browser.</b> Your team and songs are lost when you close this page. A private window or blocked site data causes this. Make a backup in Settings before you leave.</p></div>';
    else if (WU.db && WU.db.memOnly) h += '<div class="banner bad" role="alert"><p><b>Can\'t keep songs or voices on this browser.</b> They play until you close this page. Make a backup with audio in Settings before you leave.</p></div>';
    if (S.loadFailed) h += '<div class="banner warn" role="status"><p><b>Your saved team could not be read.</b> A copy was set aside so nothing was erased. You can start again or restore a backup from Settings.</p></div>';
    $("#wuBanners").innerHTML = h;
  }

  /* ---------- the Game screen ---------- */
  function emptyGame() {
    return '<div class="empty hero"><h2>Walk-up music for your team</h2>' +
      "<p>Record each player's announcement, pick the song they chose, and play it on cue. Everything stays on this phone.</p>" +
      '<ol class="how"><li>Add your players.</li><li>Record a voice and pick a song for each.</li><li>On game day, tap Play when they step up.</li></ol>' +
      '<div class="stack"><button type="button" class="btn block big" data-act="sample">Add a sample lineup</button>' +
      '<button type="button" class="btn ghost block" data-act="add-player">Add a player</button>' +
      '<button type="button" class="btn ghost block" data-act="paste-list">Paste a list of players</button>' +
      U.fileBtn({ text: "Restore from a backup file", cls: "ghost block", accept: "application/json,.json", attr: 'data-file="restore"', label: "Choose a Walk-Up backup file" }) +
      '</div><p class="mute small-note">Not sure yet? The sample lineup uses built-in sounds so you can hear how it works.</p></div>';
  }
  function noLineup() {
    return '<div class="empty"><h2>Nobody is batting yet</h2><p>You have players, but none are in the batting order. Put players in the order on the Team tab.</p>' +
      '<div class="stack"><button type="button" class="btn block big" data-act="tab" data-tab="team">Go to Team</button></div></div>';
  }
  function roleLine(label, idx) {
    var p = idx >= 0 ? WU.player(S.st.lineup[idx]) : null;
    return p ? '<div class="role"><span class="rk">' + label + '</span><span class="rv">' + WU.team.nameHTML(p) + "</span></div>" : "";
  }
  var HELP = { "needs-song": "The song file isn't on this phone. Open Songs and choose the file again.", "needs-voice": "The voice file isn't on this phone. Tap Voice to record or add it again.", empty: "Nothing to play yet. Tap Voice and Song to set this player up.", "no-song": "No song yet. The voice will play on its own.", "no-voice": "No voice yet. The song will play on its own." };
  function gameHTML() {
    var st = S.st, n = st.lineup.length;
    if (!st.roster.length) return emptyGame();
    if (!n) return noLineup();
    var p = WU.cur(), r = C.roles(n, st.batter), s = WU.status(p), h = "";
    h += '<section class="card now" aria-label="Now batting"><div class="kick"><span>Now batting</span><span class="idx">' + (st.batter + 1) + " of " + n + "</span></div>" +
      '<div class="bigline">' + (p.num ? '<b class="bignum">#' + esc(p.num) + "</b>" : "") + '<h2 class="bigname">' + (p.name ? esc(p.name) : '<i class="mute">No name</i>') + "</h2></div>" +
      '<div class="pchips">' + (p.pos ? '<em class="pos">' + esc(p.pos) + "</em>" : "") + WU.team.chip(p) + WU.team.sub(p) + "</div>" +
      (HELP[s.code] ? '<div class="hint ' + WU.chipClass(s.code) + '"><p>' + esc(HELP[s.code]) + "</p>" + (s.code === "needs-song" ? '<button type="button" class="btn small" data-act="tab" data-tab="songs">Open Songs</button>' : "") + "</div>" : "") +
      '<div class="quick"><button type="button" class="qb" data-act="g-song" aria-label="Change song for ' + esc(C.playerLabel(p)) + '">' + U.I.note + "<span>Song</span></button>" +
      '<button type="button" class="qb" data-act="g-voice" aria-label="Voice for ' + esc(C.playerLabel(p)) + '">' + U.I.mic + "<span>Voice</span></button>" +
      '<button type="button" class="qb" data-act="g-mix" aria-label="Mix music and voice for ' + esc(C.playerLabel(p)) + '">' + mixIcon() + "<span>Mix</span></button>" +
      '<button type="button" class="qb" data-act="edit-player" data-id="' + p.id + '" aria-label="Edit ' + esc(C.playerLabel(p)) + '">' + editIcon() + "<span>Edit</span></button></div></section>";
    h += '<div class="transport"><button type="button" class="tbtn" id="gPrev" data-act="prev" aria-label="Previous batter">' + U.I.prev + "<span>Prev</span></button>" +
      '<button type="button" class="playbtn" id="gPlay" data-act="play" aria-label="Play ' + esc(C.playerLabel(p)) + '">' + U.I.play + "<span>PLAY</span></button>" +
      '<button type="button" class="tbtn" id="gNext" data-act="next" aria-label="Next batter">' + U.I.next + "<span>Next</span></button></div>";
    h += '<div class="prog"><div class="bar" id="gBar" role="progressbar" aria-label="Playback" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="gProg"></i></div><div class="row sp"><span class="mono" id="gTime">0:00</span><span class="gstate" id="gState"></span></div></div>';
    if (n > 1) h += '<div class="roles">' + roleLine("On deck", r.onDeck) + roleLine("In the hole", r.inHole) + "</div>";
    h += '<section class="card tools">' + U.range({ key: "master", label: "Master volume", min: 0, max: 100, step: 1, value: st.settings.master, text: st.settings.master + "%" }) +
      '<div class="row wrap"><button type="button" class="btn ghost small" data-act="sound-check">Sound check</button><button type="button" class="btn ghost small" data-act="bt-help">Using a Bluetooth speaker</button></div></section>';
    h += '<div class="sec-title"><h2>Batting order</h2><span class="sub">tap to jump</span></div><div class="llist">';
    st.lineup.forEach(function (id, i) {
      var q = WU.player(id); if (!q) return;
      var tag = i === r.now ? "Now" : i === r.onDeck ? "On deck" : i === r.inHole ? "In the hole" : "";
      h += '<button type="button" class="lrow' + (i === r.now ? " on" : "") + '" data-act="pick" data-i="' + i + '"' + (i === r.now ? ' aria-current="true"' : "") + ' aria-label="Batter ' + (i + 1) + ", " + esc(C.playerLabel(q)) + (tag ? ", " + tag : "") + '">' +
        '<span class="ord num" aria-hidden="true">' + (i + 1) + '</span><span class="pname">' + WU.team.nameHTML(q) + "</span>" + (tag ? '<span class="rtag">' + tag + "</span>" : "") + WU.team.chip(q) + "</button>";
    });
    return h + "</div>";
  }
  function mixIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="14" r="2.2" fill="currentColor"/><circle cx="12" cy="8" r="2.2" fill="currentColor"/><circle cx="19" cy="15" r="2.2" fill="currentColor"/></svg>'; }
  function editIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'; }

  /* ---------- the transport ---------- */
  function gamePlaying() { var cp = WU.cur(), pl = E.playing(); return !!(cp && pl && pl.key === "g:" + cp.id); }
  function paintTransport() {
    var btn = $("#gPlay"); if (!btn) return;
    var p = WU.cur(), pl = E.playing(), mine = !!(p && pl && pl.key === "g:" + p.id), loading = S.play.state === "loading" && p && S.play.id === p.id;
    if (!mine && S.play.state === "playing") S.play = { state: "idle", id: null };
    btn.classList.toggle("stop", mine);
    btn.classList.toggle("busy", !!loading && !mine);
    btn.dataset.act = mine ? "stop" : "play";
    btn.setAttribute("aria-label", mine ? "Stop " + C.playerLabel(p) : "Play " + (p ? C.playerLabel(p) : ""));
    btn.innerHTML = (mine ? U.I.stop : U.I.play) + "<span>" + (mine ? "STOP" : "PLAY") + "</span>";
    var tx = $("#gState");
    if (tx) tx.textContent = mine ? "Playing" : loading ? "Getting ready..." : "";
    if (!mine) {
      var b = $("#gProg"); if (b) b.style.width = "0%";
      var t = $("#gTime"); if (t) t.textContent = "0:00";
    }
    if (mine) startRaf();
  }
  function tick() {
    rafId = 0;
    var pl = E.playing(), p = WU.cur();
    if (!pl || !p || pl.key !== "g:" + p.id) { rafOn = false; paintTransport(); return; }
    var pct = pl.total > 0 ? Math.min(100, pl.elapsed / pl.total * 100) : 0, b = $("#gProg"), t = $("#gTime"), bar = $("#gBar");
    if (b) b.style.width = pct.toFixed(1) + "%";
    if (t) t.textContent = C.fmtClock(Math.min(pl.elapsed, pl.total)) + " / " + C.fmtClock(pl.total);
    if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
    rafId = requestAnimationFrame(tick);
  }
  function startRaf() { if (rafId) return; rafOn = true; rafId = requestAnimationFrame(tick); }
  function stopRaf() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; rafOn = false; }

  /* ---------- playing ---------- */
  var MSG = {
    empty: "Nothing to play yet. Add a voice or a song for this player first.",
    "needs-song": "This player's song file isn't on this phone. Open Songs and choose the file again.",
    "needs-voice": "This player's voice file isn't on this phone. Tap Voice to record or add it again."
  };
  WU.act.play = function () {
    var p = WU.cur(); if (!p) return;
    var ul = E.unlock(); A.armWarm();
    var s = WU.status(p);
    if (MSG[s.code]) { U.toast(MSG[s.code], "error", 6000); return; }
    if (!E.supported()) { U.toast("This browser can't play audio.", "error"); return; }
    var my = ++token, t0 = performance.now();
    S.play = { state: "loading", id: p.id };
    paintTransport();
    Promise.all([E.prepare(p, S.st, WU.speechOpts()), ul]).then(function (r) {
      if (my !== token) return;
      if (!r[1]) { S.play = { state: "idle", id: null }; paintTransport(); U.toast("Your phone is keeping the sound asleep. Tap Play again. If it stays quiet, check the volume and the ringer or silent switch.", "error", 8000); return; }
      try {
        E.play(r[0], { key: "g:" + p.id, onEnd: function () { if (my === token) { S.play = { state: "idle", id: null }; paintTransport(); } } });
      } catch (e) { S.play = { state: "idle", id: null }; paintTransport(); U.toast(e && e.message ? e.message : "Couldn't play that.", "error"); return; }
      S.play = { state: "playing", id: p.id };
      A.lastPlay = { id: p.id, ms: Math.round(performance.now() - t0), plan: r[0].plan };
      paintTransport();
      if (p.voice && p.voice.kind === "tts" && !E.speech.supported()) U.toast("This browser can't speak, so only the song plays.", "warn", 5000);
      if (S.st.settings.master === 0) U.toast("The master volume is at 0%. Turn it up to hear anything.", "warn", 5000);
      setTimeout(function () { if (my === token && S.play.state === "playing" && E.state() !== "running") U.toast("The sound is still asleep. Tap Play again, and check the volume and the ringer or silent switch.", "error", 8000); }, 900);
    }, function (e) {
      if (my !== token) return;
      S.play = { state: "idle", id: null }; paintTransport();
      var k = e && e.kind;
      U.toast(k === "missing" ? "A file for this player isn't on this phone. Open Edit to fix it." : k === "decode" ? "This phone couldn't read one of this player's files. Open Edit to replace it." : k === "noaudio" ? "This browser can't play audio." : "Couldn't get that walk-up ready. Try again.", "error", 7000);
    });
  };
  WU.act.stop = function () { token++; E.stop(C.LIM.stopFade); S.play = { state: "idle", id: null }; paintTransport(); U.live("Stopped"); };
  function setBatter(i, quiet) {
    var n = S.st.lineup.length; if (!n) return;
    i = ((i % n) + n) % n;
    var changed = i !== S.st.batter;
    if (E.playing()) E.stop(C.LIM.stopFade);
    token++; S.play = { state: "idle", id: null };
    S.st.batter = i;
    WU.commit("data");
    var p = WU.cur();
    if (p && !quiet) U.live("Now batting: " + C.playerLabel(p));
    if (changed) WU.warm();
  }
  WU.act.next = function () { E.unlock(); A.armWarm(); setBatter(C.nextIndex(S.st.lineup.length, S.st.batter)); var b = $("#gNext"); if (b) b.focus({ preventScroll: true }); };
  WU.act.prev = function () { E.unlock(); A.armWarm(); setBatter(C.prevIndex(S.st.lineup.length, S.st.batter)); var b = $("#gPrev"); if (b) b.focus({ preventScroll: true }); };
  WU.act.pick = function (el) { E.unlock(); A.armWarm(); setBatter(parseInt(el.dataset.i, 10)); };
  WU.act["g-song"] = function () { var p = WU.cur(); if (p) WU.songs.openPicker(p.id); };
  WU.act["g-voice"] = function () { var p = WU.cur(); if (p) WU.voice.open(p.id); };
  WU.act["g-mix"] = function () { var p = WU.cur(); if (p) WU.openMix(p.id); };

  /* ---------- sample lineup ---------- */
  WU.act.sample = function () {
    var sm = C.sampleState(E.speech.supported()), room = C.LIM.roster - S.st.roster.length;
    if (room <= 0) { U.toast("The team is full.", "error"); return; }
    var add = sm.roster.slice(0, room);
    S.st.roster = S.st.roster.concat(add);
    S.st.lineup = S.st.lineup.concat(add.map(function (p) { return p.id; }));
    if (S.st.lineup.length === add.length) S.st.batter = 0;
    S.tab = "game";
    WU.commit("data");
    U.toast("Added a sample lineup of " + add.length + " players. Tap Play to hear one.", "ok", 5000);
    var b = $("#gPlay"); if (b) b.focus({ preventScroll: true });
  };

  /* ---------- tabs ---------- */
  function setTab(t) {
    if (!TABS.some(function (x) { return x[0] === t; })) return;
    var same = t === S.tab;
    S.tab = t;
    A.render();
    if (!same) { window.scrollTo(0, 0); }
    syncWake();
  }
  WU.act.tab = function (el) { setTab(el.dataset.tab); };

  /* ---------- drawing everything ---------- */
  A.render = function () {
    if (!$("#wuView")) return;
    var y = window.scrollY, v = $("#wuView"), h;
    stopRaf();
    paintTop(); paintBanners(); paintNav();
    if (S.tab === "game") h = gameHTML();
    else if (S.tab === "team") h = WU.team.renderTab();
    else if (S.tab === "songs") h = WU.songs.renderTab();
    else h = D.renderSettings();
    v.innerHTML = h;
    if (S.tab === "game") paintTransport();
    else if (S.tab === "songs") WU.songs.paintPreviewButtons(v);
    else if (S.tab === "settings") D.paintStorage();
    window.scrollTo(0, y);
  };

  /* ---------- keep the screen on during a game ---------- */
  var wl = null, wlBusy = false;
  function wantWake() { return S.tab === "game" && S.st.settings.wake && S.st.lineup.length > 0 && document.visibilityState === "visible"; }
  function syncWake() {
    if (!("wakeLock" in navigator)) return;
    try {
      if (wantWake() && !wl && !wlBusy) {
        wlBusy = true;
        navigator.wakeLock.request("screen").then(function (l) {
          wlBusy = false; wl = l;
          l.addEventListener("release", function () { if (wl === l) wl = null; });
          if (!wantWake()) { wl = null; l.release().catch(function () { /* ignore */ }); }
        }, function () { wlBusy = false; });
      } else if (!wantWake() && wl) { var l = wl; wl = null; l.release().catch(function () { /* ignore */ }); }
    } catch (e) { wlBusy = false; }
  }
  A.wakeActive = function () { return !!wl; };

  /* ---------- warm up the next walk-ups so Play is instant ---------- */
  var warmOn = false, warmTimer = 0, warmRun = 0;
  A.armWarm = function () { if (!warmOn) { warmOn = true; WU.warm(); } };
  WU.warm = function () {
    if (!warmOn) return;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(function () {
      var st = S.st, n = st.lineup.length; if (!n) return;
      var ids = [], run = ++warmRun;
      for (var k = 0; k < Math.min(3, n); k++) ids.push(st.lineup[(st.batter + k) % n]);
      (async function () {
        for (var i = 0; i < ids.length; i++) {
          if (run !== warmRun) return;
          var p = WU.player(ids[i]); if (!p) continue;
          var c = WU.status(p).code;
          if (c === "needs-song" || c === "needs-voice" || c === "empty") continue;
          try { await E.prepare(p, S.st, WU.speechOpts()); } catch (e) { /* the real Play reports the problem */ }
        }
        A.warmedAt = Date.now();
      })();
    }, 250);
  };

  /* ---------- events ---------- */
  function onSettingsInput(e) {
    var t = e.target;
    if (!t.closest || !t.closest("#wuView")) return;
    if (t.matches && t.matches('input[type="range"][data-key]')) { D.onSetting(t.dataset.key, "set", parseFloat(t.value)); if (t.dataset.key === "master") { $$('input[data-key="master"]').forEach(function (i) { if (i !== t) i.value = t.value; }); $$('[data-val="master"]').forEach(function (v) { v.textContent = t.value + "%"; }); } }
  }
  function wire(root) {
    root.addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]");
      if (!el || !root.contains(el) || el.disabled) return;
      var fn = WU.act[el.dataset.act];
      if (fn) fn(el, e);
    });
    root.addEventListener("input", onSettingsInput);
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t.type === "file" && t.dataset.file) {
        var files = Array.prototype.slice.call(t.files || []), fn = WU.onFile[t.dataset.file];
        t.value = "";
        if (fn && files.length) { E.unlock(); Promise.resolve().then(function () { return fn(files, t); }).catch(function (err) { console.error(err); U.toast("Something went wrong with that file.", "error"); }); }
      } else if (t.dataset && t.dataset.setting) D.onToggle(t);
    });
  }

  /* ---------- start ---------- */
  A.start = function () {
    var host = document.getElementById("walkup");
    if (!host) return;
    U.mount(host);
    WU.load();
    E.setMaster(S.st.settings.master);
    E.onchange = function () { WU.emit("audio"); };
    WU.on(function (what) {
      if (what === "audio") { paintTransport(); return; }
      if (what === "data" || what === "meta") { A.render(); syncWake(); if (what === "data") WU.warm(); }
      if (what === "wake") syncWake();
    });
    wire(host);
    /* the very first tap anywhere wakes the audio, so the first Play is not late */
    document.addEventListener("click", function () { E.unlock(); A.armWarm(); }, { once: true, capture: true });
    document.addEventListener("visibilitychange", function () { syncWake(); });
    var done = false, go = function () { if (done) return; done = true; A.render(); syncWake(); };
    var slow = setTimeout(go, 1500);
    WU.refreshHave().then(function () {
      if (S.loadFailed || S.mem) return 0;
      return WU.gc();
    }).then(function () { return WU.refreshHave(); }).then(function () { clearTimeout(slow); if (done) A.render(); else go(); });
    if (S.st.settings.wake) syncWake();
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* the app works without it */ }); });
    window.WalkupApp = { S: S, eng: E, WU: WU, core: C, wakeActive: A.wakeActive, lastPlay: function () { return A.lastPlay; }, warmed: function () { return A.warmedAt || 0; } };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", A.start); else A.start();
})();
