/* Walk-Up song library: add songs once (stored on this phone), pick one for a player in two taps, trim the good part. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var SG = WU.songs = {};
  WU.onFile = WU.onFile || {};

  var round3 = function (x) { return Math.round(x * 1000) / 1000; };
  SG.decodeMessage = function (name) {
    return "This phone couldn't read \"" + name + "\". Try an MP3, M4A or WAV file. If it came from a video or a voice app, save or convert it to MP3 first.";
  };

  /* ---------- adding files ---------- */
  /* Reads each file, checks it plays, saves it, and adds it to the library with a default trim. Resolves { added, failed }. */
  SG.addFiles = async function (files) {
    var list = Array.prototype.slice.call(files || []), added = [], failed = [], busy = U.busy("Adding songs...");
    try {
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        busy.text(list.length > 1 ? "Adding song " + (i + 1) + " of " + list.length + "..." : "Reading \"" + f.name + "\"...");
        if (!f.size) { failed.push(f.name + " is empty."); continue; }
        if (f.size > C.LIM.maxSongBytes) { failed.push("\"" + f.name + "\" is too big (" + C.fmtSize(f.size) + "). The limit is 60 MB. Try an MP3."); continue; }
        var buf;
        try { buf = await E.decode(f); } catch (e) { failed.push(e && e.kind === "noaudio" ? "This browser can't play audio." : SG.decodeMessage(f.name)); continue; }
        if (buf.duration < 0.2) { failed.push("\"" + f.name + "\" is too short to use."); continue; }
        var id = C.uid();
        try { await WU.putAudio("s:" + id, f); } catch (e) { failed.push(e.plain || "Couldn't save \"" + f.name + "\"."); if (e.message === "quota") break; continue; }
        var t = C.defaultTrim(buf.duration, { len: C.LIM.defLen, fade: C.LIM.defFade });
        var song = { id: id, kind: "file", title: C.libraryTitle(f.name), name: C.str(f.name, C.LIM.file), dur: round3(buf.duration), size: f.size, mime: C.str(f.type, 60), start: t.start, len: t.len, fade: t.fade };
        S.st.songs.push(song);
        try { E.putSongBuffer(song, buf, t); } catch (e) { /* the cache is only a speed-up */ }
        added.push(song);
      }
    } finally { busy.done(); }
    if (added.length) WU.commit("data");
    if (failed.length) U.toast(failed.slice(0, 2).join(" "), "error", 9000);
    return { added: added, failed: failed };
  };

  /* ---------- previews ---------- */
  SG.togglePreview = function (song) {
    var key = "sp:" + song.id, p = E.playing();
    if (p && p.key === key) { E.stop(0.1); return; }
    E.unlock();
    var tr = C.clampTrim(song.dur, { start: song.start, len: song.len, fade: song.fade });
    E.songBuffer(song, tr).then(function (r) {
      E.playSimple(r.buf, { offset: tr.start, duration: tr.len, fade: tr.fade, base: r.base, key: key });
    }).catch(function (e) { U.toast(e && e.kind === "missing" ? "This song's file isn't on this phone. Add it again." : "Couldn't play that song.", "error"); });
  };
  function paintPreviewButtons(root) {
    var p = E.playing(), key = p ? p.key : "";
    $$(".pbtn[data-id]", root).forEach(function (b) {
      var on = key === "sp:" + b.dataset.id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-label", (on ? "Stop " : "Play ") + (b.dataset.title || "song"));
      b.innerHTML = on ? U.I.stop : U.I.play;
    });
  }
  SG.paintPreviewButtons = paintPreviewButtons;

  /* ---------- song rows ---------- */
  function subtitle(s) {
    var users = WU.songUsers(s.id);
    return C.fmtClock(s.dur) + " · " + C.fmtSize(s.size) + " · plays " + C.fmtSecs(s.len) + " from " + C.fmtClock(s.start, true) +
      (users.length ? "<br>Used by " + esc(users.slice(0, 3).map(C.playerLabel).join(", ")) + (users.length > 3 ? " and " + (users.length - 3) + " more" : "") : "<br>Not used yet");
  }
  function builtinRows(forPicker, currentId) {
    return window.WalkupSounds.SOUNDS.map(function (b) {
      var song = C.builtinSong(b.id);
      return '<div class="srow"><button type="button" class="pbtn" data-do="preview" data-id="' + song.id + '" data-title="' + esc(song.title) + '" aria-label="Play ' + esc(song.title) + '">' + U.I.play + '</button>' +
        '<div class="smain"><b>' + esc(song.title) + "</b><small>Built in · " + C.fmtSecs(song.dur) + "</small></div>" +
        (forPicker ? (currentId === song.id ? '<span class="chip ok">Current</span>' : '<button type="button" class="btn small" data-do="use" data-id="' + song.id + '">Use</button>') : "") + "</div>";
    }).join("");
  }
  function songRows(forPicker, currentId) {
    if (!S.st.songs.length) return '<p class="mute pad">No songs saved yet. Tap "Add songs" to pick files from this phone.</p>';
    return S.st.songs.map(function (s) {
      return '<div class="srow" data-sid="' + s.id + '"><button type="button" class="pbtn" data-do="preview" data-id="' + s.id + '" data-title="' + esc(s.title) + '" aria-label="Play ' + esc(s.title) + '">' + U.I.play + "</button>" +
        '<div class="smain"><b>' + esc(s.title) + "</b><small>" + subtitle(s) + "</small></div>" +
        (forPicker ? (currentId === s.id ? '<span class="chip ok">Current</span>' : '<button type="button" class="btn small" data-do="use" data-id="' + s.id + '">Use</button>') : "") +
        (WU.have("s:" + s.id) ? "" : '<small class="warn-txt">File missing</small>') + "</div>";
    }).join("");
  }

  /* ---------- the Songs tab ---------- */
  SG.renderTab = function () {
    var n = S.st.songs.length;
    return '<div class="sec-title"><h2>Songs</h2><span class="sub">' + n + " saved</span></div>" +
      '<p class="mute lead">Add each song once. Then choose it for any player. Two players can share one song.</p>' +
      U.fileBtn({ text: "Add songs", cls: "block", multiple: true, attr: 'data-file="songs-add"', label: "Add song files" }) +
      '<button type="button" class="btn ghost block top" data-act="rq-list">' + U.I.team + " Ask parents for songs</button>" +
      '<div class="card slist" id="songList">' + (n ? S.st.songs.map(function (s) {
        return '<div class="srow tall" data-sid="' + s.id + '"><button type="button" class="pbtn" data-act="song-preview" data-id="' + s.id + '" data-title="' + esc(s.title) + '" aria-label="Play ' + esc(s.title) + '">' + U.I.play + "</button>" +
          '<div class="smain"><b>' + esc(s.title) + "</b><small>" + subtitle(s) + '</small></div><div class="sacts">' +
          '<button type="button" class="btn ghost small" data-act="song-trim" data-id="' + s.id + '">Trim</button>' +
          '<button type="button" class="btn ghost small" data-act="song-rename" data-id="' + s.id + '">Rename</button>' +
          '<button type="button" class="btn danger small" data-act="song-delete" data-id="' + s.id + '">Delete</button></div>' +
          (WU.have("s:" + s.id) ? "" : '<div class="refill full"><p class="warn-txt">The file for this song isn\'t on this phone. Choose the same file again and every player keeps this song.</p>' + U.fileBtn({ text: "Choose the file again", cls: "small", attr: 'data-file="song-refill" data-id="' + s.id + '"', label: "Choose the file for " + s.title + " again" }) + "</div>") + "</div>";
      }).join("") : '<p class="mute pad">No songs saved yet. Tap "Add songs" and pick files from this phone.</p>') + "</div>" +
      '<div class="sec-title"><h2>Built-in sounds</h2></div><div class="card slist" id="builtinList">' + builtinRows(false) + "</div>";
  };
  WU.act["song-preview"] = function (el) { var s = WU.song(el.dataset.id); if (s) SG.togglePreview(s); };
  WU.act["song-trim"] = function (el) { var s = WU.song(el.dataset.id); if (s) SG.openSongTrim(s); };
  WU.act["song-rename"] = function (el) { var s = WU.song(el.dataset.id); if (s) SG.openRename(s); };
  WU.act["song-delete"] = function (el) { var s = WU.song(el.dataset.id); if (s) SG.askDelete(s); };
  WU.onFile["songs-add"] = async function (files) {
    if (WU.req) return WU.req.importSongs(files); /* songs that came back from a parent are matched to their player there */
    var r = await SG.addFiles(files);
    if (r.added.length === 1) { U.toast("Added \"" + r.added[0].title + "\".", "ok"); SG.openSongTrim(r.added[0]); }
    else if (r.added.length > 1) U.toast("Added " + r.added.length + " songs.", "ok");
  };

  /* a song whose file is gone (after a settings-only restore, or cleared browser data): put the file back, keep the song, trim and players */
  WU.onFile["song-refill"] = async function (files, input) {
    var song = WU.song(input.dataset.id), f = files[0]; if (!song || song.kind !== "file" || !f) return;
    var busy = U.busy("Reading \"" + f.name + "\"...");
    try {
      if (f.size > C.LIM.maxSongBytes) { U.toast("\"" + f.name + "\" is too big (" + C.fmtSize(f.size) + "). The limit is 60 MB.", "error", 7000); return; }
      var buf;
      try { buf = await E.decode(f); } catch (e) { U.toast(SG.decodeMessage(f.name), "error", 8000); return; }
      if (buf.duration < 0.2) { U.toast("\"" + f.name + "\" is too short to use.", "error"); return; }
      try { await WU.putAudio("s:" + song.id, f); } catch (e) { U.toast(e.plain || "Couldn't save that file.", "error", 7000); return; }
      song.dur = round3(buf.duration); song.size = f.size; song.mime = C.str(f.type, 60); song.name = C.str(f.name, C.LIM.file);
      var t = C.clampTrim(song.dur, { start: song.start, len: song.len, fade: song.fade });
      song.start = t.start; song.len = t.len; song.fade = t.fade;
      E.forget(song.id);
      try { E.putSongBuffer(song, buf, t); } catch (e) { /* only a speed-up */ }
      WU.commit("data"); U.toast("\"" + song.title + "\" has its file back.", "ok");
    } finally { busy.done(); }
  };

  SG.openRename = function (song) {
    U.openSheet({
      title: "Rename song", autofocus: "#rnTitle", select: true,
      html: '<label class="field"><span class="label">Song title</span><input type="text" id="rnTitle" maxlength="' + C.LIM.title + '" value="' + esc(song.title) + '" autocomplete="off"></label><p class="mute small-note">The file stays as it is. Only the name shown in Walk-Up changes.</p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-ok>Save</button>',
      onOpen: function (api) {
        var inp = $("#rnTitle", api.el), save = function () { var t = C.str(inp.value, C.LIM.title); if (!t) { inp.focus(); return; } song.title = t; WU.commit("data"); api.close(); };
        $("[data-ok]", api.el).addEventListener("click", save);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
      }
    });
  };
  SG.askDelete = function (song) {
    var users = WU.songUsers(song.id);
    U.confirm({
      title: "Delete this song?", message: "\"" + song.title + "\" will be removed from this phone.",
      more: users.length ? ["These players use it and will have no song: " + users.map(C.playerLabel).join(", ") + "."] : ["No player uses it."],
      confirmText: "Delete song", danger: true,
      onConfirm: function () {
        var p = E.playing(); if (p && p.key === "sp:" + song.id) E.stop(0.05);
        S.st.songs = S.st.songs.filter(function (x) { return x.id !== song.id; });
        users.forEach(function (u) { u.songId = null; u.trim = null; });
        WU.dropAudio("s:" + song.id);
        WU.commit("data"); U.toast("Song deleted.", "ok");
      }
    });
  };

  /* ---------- pick a song for a player (two taps: Change song, then the song) ---------- */
  SG.openPicker = function (pid) {
    var pl = WU.player(pid); if (!pl) return;
    var off, api = U.openSheet({
      title: "Song for " + (pl.name || "player"), cls: "picker",
      html: '<div id="pkTop"></div><div class="card slist" id="pkList"></div><div class="sec-title tight"><h3>Built-in sounds</h3></div><div class="card slist" id="pkBuilt"></div>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button>',
      onClose: function () { if (off) off(); var p = E.playing(); if (p && /^sp:/.test(p.key)) E.stop(0.05); }
    });
    var el = api.el;
    function paint() {
      var p = WU.player(pid); if (!p) return;
      $("#pkTop", el).innerHTML = U.fileBtn({ text: "Add a new song file", cls: "block", multiple: true, attr: 'data-file="picker-add" data-pid="' + pid + '"', label: "Add new song files" }) +
        '<div class="srow none"><div class="smain"><b>No song</b><small>Voice only</small></div>' + (!p.songId ? '<span class="chip ok">Current</span>' : '<button type="button" class="btn ghost small" data-do="use" data-id="">Use no song</button>') + "</div>";
      $("#pkList", el).innerHTML = songRows(true, p.songId);
      $("#pkBuilt", el).innerHTML = builtinRows(true, p.songId);
      paintPreviewButtons(el);
    }
    paint();
    off = WU.on(function (what) { if (api.closed) return; if (what === "audio") paintPreviewButtons(el); else paint(); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      if (b.dataset.do === "preview") { var s = WU.song(b.dataset.id); if (s) SG.togglePreview(s); }
      else if (b.dataset.do === "use") { SG.choose(pid, b.dataset.id || null); api.close(); }
    });
  };
  SG.choose = function (pid, songId) {
    var p = WU.player(pid); if (!p) return;
    if (p.songId !== songId) p.trim = null;
    p.songId = songId;
    WU.commit("data");
    var s = songId ? WU.song(songId) : null;
    U.toast(s ? "Song set: " + s.title : "Song removed.", "ok");
  };
  WU.onFile["picker-add"] = async function (files, input) {
    var pid = input.dataset.pid, r = await SG.addFiles(files), pl = WU.player(pid);
    if (r.added.length && pl) {
      SG.choose(pid, r.added[0].id);
      var top = U.topSheet(); if (top && top.sheet.classList.contains("picker")) top.close();
      if (r.added.length === 1) SG.openSongTrim(r.added[0]);
    }
  };

  /* ---------- the trim editor ---------- */
  SG.openSongTrim = function (song) {
    SG.openTrim({
      title: "Trim: " + song.title, song: song,
      getTrim: function () { return { start: song.start, len: song.len, fade: song.fade }; },
      setTrim: function (t) { song.start = t.start; song.len = t.len; song.fade = t.fade; WU.commit("data"); },
      note: "This is the part of the song every player who uses it will get, unless a player has their own trim."
    });
  };
  SG.openPlayerTrim = function (pl) {
    var song = pl.songId ? WU.song(pl.songId) : null; if (!song) return;
    SG.openTrim({
      title: "Trim for " + (pl.name || "player"), song: song,
      getTrim: function () { return C.effectiveTrim(pl, song); },
      setTrim: function (t) { pl.trim = t; WU.commit("data"); },
      canReset: true, onReset: function () { pl.trim = null; WU.commit("data"); return C.effectiveTrim(pl, song); },
      note: "This trim is only for " + (pl.name || "this player") + ". The song's own trim is not changed."
    });
  };

  SG.openTrim = function (o) {
    var song = o.song, st = { buf: null, dur: 0, v0: 0, v1: 0, peaks: null, closed: false, token: 0, prev: false, trim: null, raf: 0 };
    var html = '<p class="tr-file mute">' + esc(song.title) + (song.kind === "file" ? " · " + C.fmtClock(song.dur) + " · " + C.fmtSize(song.size) : " · built-in sound") + "</p>" +
      '<div id="trLoad" class="loadbox" role="status"><div class="spin"></div><p>Reading the song...</p></div><p id="trErr" class="errmsg" role="alert" hidden></p>' +
      '<div id="trMain" hidden>' +
      '<div class="wave" id="trWave" role="group" aria-label="Song waveform. Drag the two handles to choose the part that plays."><canvas id="trCv"></canvas>' +
      '<div class="hdl hs" id="trHs" role="slider" tabindex="0" aria-label="Start of the clip"><i></i></div><div class="hdl he" id="trHe" role="slider" tabindex="0" aria-label="End of the clip"><i></i></div><div class="phead" id="trHead" hidden></div></div>' +
      '<div class="wave-ax"><span id="trV0">0:00</span><span id="trV1">0:00</span></div>' +
      '<div class="row wrap zoomrow" id="trZoom" hidden><button type="button" class="btn ghost small" data-z="clip">Zoom to the clip</button><button type="button" class="btn ghost small" data-z="all">Whole song</button></div>' +
      '<div class="final" id="trFinal"></div>' +
      '<button type="button" class="btn block" id="trPrev">' + U.I.play + ' <span>Preview</span></button>' +
      '<div class="ctls">' + U.stepper({ key: "start", label: "Starts at", hint: "seconds into the song", value: 0, min: 0, max: 100, step: 0.1, coarse: 1, slider: true }) +
      U.stepper({ key: "len", label: "Length", hint: "how many seconds play (1 to 30)", value: 10, min: 1, max: 30, step: 0.1, coarse: 1, slider: true }) +
      U.stepper({ key: "fade", label: "Fade out", hint: "seconds (0 to 3)", value: 1, min: 0, max: 3, step: 0.1, slider: true }) + "</div>" +
      '<p class="mute small-note" id="trLimit"></p><p class="mute small-note">' + esc(o.note || "") + "</p>" +
      (o.canReset ? '<button type="button" class="btn ghost block" id="trReset">Use the song\'s own trim</button>' : "") + "</div>";
    var sh = U.openSheet({
      title: o.title, cls: "trim", html: html, footer: '<button type="button" class="btn" data-close>Done</button>',
      onClose: function () {
        st.closed = true; cancelAnimationFrame(st.raf); window.removeEventListener("resize", onResize);
        var p = E.playing(); if (p && p.key === "trim") E.stop(0.1);
        if (st.buf && st.trim) { try { E.putSongBuffer(song, st.buf, st.trim); } catch (e) { /* ignore */ } }
        st.buf = null;
        WU.emit("data");
      }
    });
    var el = sh.el, q = function (s) { return $(s, el); }, cv = q("#trCv"), wave = q("#trWave");

    function pct(t) { return Math.max(0, Math.min(1, (t - st.v0) / Math.max(0.001, st.v1 - st.v0))) * 100 + "%"; }
    function bars() { return Math.max(30, Math.floor((cv.clientWidth || 300) / 4)); }
    function draw() {
      var t = st.trim; if (!t) return;
      U.drawWave(cv, { peaks: st.peaks, v0: st.v0, v1: st.v1, s0: t.start, s1: t.start + t.len });
      q("#trHs").style.left = pct(t.start); q("#trHe").style.left = pct(t.start + t.len);
      q("#trHs").setAttribute("aria-valuenow", t.start); q("#trHs").setAttribute("aria-valuemin", 0); q("#trHs").setAttribute("aria-valuemax", st.dur);
      q("#trHs").setAttribute("aria-valuetext", "starts at " + C.fmtClock(t.start, true));
      q("#trHe").setAttribute("aria-valuenow", t.start + t.len); q("#trHe").setAttribute("aria-valuemin", 0); q("#trHe").setAttribute("aria-valuemax", st.dur);
      q("#trHe").setAttribute("aria-valuetext", "ends at " + C.fmtClock(t.start + t.len, true));
      q("#trV0").textContent = C.fmtClock(st.v0, st.v1 - st.v0 < 60); q("#trV1").textContent = C.fmtClock(st.v1, st.v1 - st.v0 < 60);
    }
    function loadPeaks() {
      var tok = ++st.token;
      E.peaksAsync(st.buf, bars(), st.v0, st.v1, function () { return st.closed || tok !== st.token; }).then(function (p) { if (!p || tok !== st.token) return; st.peaks = p; draw(); });
    }
    function setView(a, b) { st.v0 = a; st.v1 = b; q("#trWave").dataset.view = a.toFixed(1) + "-" + b.toFixed(1); loadPeaks(); draw(); }
    function onResize() { if (st.buf) { loadPeaks(); draw(); } }
    window.addEventListener("resize", onResize);
    function zoomClip() {
      var t = st.trim, span = Math.min(st.dur, Math.max(t.len * 2.5, 20)), mid = t.start + t.len / 2, a = Math.max(0, mid - span / 2), b = a + span;
      if (b > st.dur) { b = st.dur; a = Math.max(0, b - span); }
      setView(a, b);
    }
    function sync() {
      var t = st.trim, L = C.limits(st.dur), D = L.D;
      var startMax = Math.max(0, Math.floor((D - t.len) * 10 + 1e-6) / 10), lenMax = Math.max(L.minLen, Math.min(C.LIM.maxLen, Math.floor((D - t.start) * 10 + 1e-6) / 10));
      $$('input[data-key="start"]', el).forEach(function (i) { i.max = startMax; });
      $$('input[data-key="len"]', el).forEach(function (i) { i.min = L.minLen; i.max = lenMax; });
      $$('input[data-key="fade"]', el).forEach(function (i) { i.max = Math.min(C.LIM.maxFade, t.len); });
      U.setCtl(el, "start", t.start.toFixed(1)); U.setCtl(el, "len", t.len.toFixed(1)); U.setCtl(el, "fade", t.fade.toFixed(1));
      q("#trFinal").innerHTML = "Final clip: <b>" + C.fmtSecs(t.len) + "</b> · " + C.fmtClock(t.start, true) + " to " + C.fmtClock(t.start + t.len, true) + (t.fade ? " · fades out over " + C.fmtSecs(t.fade) : "");
      var limited = t.len < C.LIM.maxLen && t.start + t.len >= D - 0.05 && D - t.start < C.LIM.maxLen;
      q("#trLimit").textContent = limited ? "The song ends at " + C.fmtClock(D, true) + ", so the clip can't be longer from here. Move the start earlier for more." : "";
    }
    function commit(n) {
      if (!st.trim || (n.start === st.trim.start && n.len === st.trim.len && n.fade === st.trim.fade)) { sync(); return; }
      st.trim = n; o.setTrim(n);
      if (st.prev) E.stop(0.05);
      if (st.v1 - st.v0 < st.dur - 0.01 && (n.start < st.v0 || n.start + n.len > st.v1)) zoomClip();
      sync(); draw();
    }
    U.bindControls(el, function (key, mode, val) {
      if (!st.trim) return;
      if (!isFinite(val)) { sync(); return; }
      var t = st.trim, d = st.dur;
      if (key === "start") commit(C.moveStart(d, t, mode === "step" ? t.start + val : val));
      else if (key === "len") commit(C.setLen(d, t, mode === "step" ? t.len + val : val));
      else if (key === "fade") commit(C.setFade(d, t, mode === "step" ? t.fade + val : val));
    });
    // dragging the handles (mouse, touch and pen)
    var drag = null;
    function tAt(x) { var r = wave.getBoundingClientRect(); return st.v0 + Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * (st.v1 - st.v0); }
    function applyDrag(t) { var tr = st.trim; commit(drag === "s" ? C.dragStart(st.dur, tr, t) : C.dragEnd(st.dur, tr, t)); }
    wave.addEventListener("pointerdown", function (e) {
      if (!st.trim) return;
      var h = e.target.closest(".hdl"), t = tAt(e.clientX), tr = st.trim;
      drag = h ? (h.classList.contains("hs") ? "s" : "e") : (Math.abs(t - tr.start) <= Math.abs(t - (tr.start + tr.len)) ? "s" : "e");
      try { wave.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault(); applyDrag(t);
    });
    wave.addEventListener("pointermove", function (e) { if (drag) applyDrag(tAt(e.clientX)); });
    var endDrag = function () { drag = null; };
    wave.addEventListener("pointerup", endDrag); wave.addEventListener("pointercancel", endDrag);
    wave.addEventListener("keydown", function (e) {
      var h = e.target.closest && e.target.closest(".hdl"); if (!h || !st.trim) return;
      var d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0; if (!d) return;
      e.preventDefault(); var amt = d * (e.shiftKey ? 1 : 0.1), t = st.trim;
      commit(h.classList.contains("hs") ? C.dragStart(st.dur, t, t.start + amt) : C.dragEnd(st.dur, t, t.start + t.len + amt));
    });
    q("#trZoom").addEventListener("click", function (e) { var b = e.target.closest("[data-z]"); if (!b) return; if (b.dataset.z === "clip") zoomClip(); else setView(0, st.dur); });
    var rb = q("#trReset"); if (rb) rb.addEventListener("click", function () { st.trim = C.clampTrim(st.dur, o.onReset()); if (st.prev) E.stop(0.05); sync(); draw(); U.toast("Using the song's own trim.", "ok"); });

    // preview exactly the selection, with its fade
    function paintPrev() { var b = q("#trPrev"); b.innerHTML = (st.prev ? U.I.stop : U.I.play) + " <span>" + (st.prev ? "Stop preview" : "Preview") + "</span>"; q("#trHead").hidden = !st.prev; }
    function headLoop() {
      cancelAnimationFrame(st.raf);
      var p = E.playing();
      if (!st.prev || st.closed || !p || p.key !== "trim") { st.prev = false; if (!st.closed) paintPrev(); return; }
      var pos = st.trim.start + Math.min(p.elapsed, st.trim.len);
      q("#trHead").style.left = pct(pos); q("#trHead").hidden = pos < st.v0 || pos > st.v1;
      st.raf = requestAnimationFrame(headLoop);
    }
    q("#trPrev").addEventListener("click", function () {
      if (!st.buf || !st.trim) return;
      if (st.prev) { E.stop(0.1); st.prev = false; paintPrev(); return; }
      E.unlock();
      var t = st.trim;
      E.playSimple(st.buf, { offset: t.start, duration: t.len, fade: t.fade, key: "trim", onEnd: function () { st.prev = false; if (!st.closed) paintPrev(); } });
      st.prev = true; paintPrev(); headLoop();
    });
    var off = WU.on(function (what) { if (st.closed) { off(); return; } if (what === "audio" && st.prev && !E.playing()) { st.prev = false; paintPrev(); } });

    E.songFull(song).then(function (buf) {
      if (st.closed) return;
      st.buf = buf; st.dur = song.dur > 0 ? song.dur : round3(buf.duration);
      if (!(song.dur > 0)) { song.dur = st.dur; }
      st.trim = C.clampTrim(st.dur, o.getTrim());
      q("#trLoad").hidden = true; q("#trMain").hidden = false;
      q("#trZoom").hidden = st.dur <= 45;
      setView(0, st.dur); sync(); draw();
      if (st.dur > 45 && st.trim.start > 0) zoomClip();
    }).catch(function (e) {
      if (st.closed) return;
      q("#trLoad").hidden = true;
      var m = q("#trErr"); m.hidden = false;
      m.textContent = e && e.kind === "missing" ? "This song's file isn't on this phone. Delete the song and add the file again." : e && e.kind === "decode" ? SG.decodeMessage(song.name || song.title) : "Couldn't open this song.";
    });
    return sh;
  };

  WU.on(function (what) {
    var root = U.root(); if (!root) return;
    if (what === "audio") paintPreviewButtons(root);
  });
})();
