/* Walk-Up game sounds: buttons for the moments between batters (the anthem, music between innings, the coach's own clips).
   Each button plays a song from this phone's library from its start to its end. "Next" puts a button in Up next, which plays
   by itself when the sound before it ends. Stop ends everything, Up next included. The watch can do all of it (bridge.js).
   The anthem can be fetched with one tap: a public-domain recording, nothing from it is kept in this repo. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$;
  var B = WU.board = {};
  var token = 0;

  /* The Star-Spangled Banner, played instrumentally by the United States Navy Band: one verse at regular tempo, 1:18.
     A work of the U.S. Navy made as part of official duties, so it is public domain (and so is the song). From Wikimedia Commons. */
  var ANTHEM = {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/25/%22The_Star-Spangled_Banner%22_performed_by_the_United_States_Navy_Band.mp3",
    file: "Star-Spangled Banner - United States Navy Band.mp3",
    title: "National anthem (U.S. Navy Band)",
    credit: "The United States Navy Band, public domain (a U.S. government recording), from Wikimedia Commons."
  };
  B.ANTHEM = ANTHEM;

  /* ---------- lookups ---------- */
  B.tiles = function () { return S.st.board || []; };
  B.tile = function (id) { var b = B.tiles(); for (var i = 0; i < b.length; i++) if (b[i].id === id) return b[i]; return null; };
  B.song = function (t) { return t && t.songId ? WU.song(t.songId) : null; };
  B.ready = function (t) { var s = B.song(t); return !!(s && WU.have("s:" + s.id)); };
  B.playingId = function () { var p = E.playing(); return p && p.key.indexOf("b:") === 0 ? p.key.slice(2) : null; };
  B.queue = function () { return S.queue.filter(function (id) { return !!B.tile(id); }); };
  function changed() { WU.emit("board"); }

  /* ---------- playing ---------- */
  /* a walk-up started on the phone: forget a game sound that was still getting ready */
  B.cancel = function () { token++; if (S.play.board) S.play = { state: "idle", id: null }; };
  /* Stop: nothing plays and nothing waits */
  B.stopAll = function () { token++; if (S.play.board) S.play = { state: "idle", id: null }; if (S.queue.length) { S.queue = []; changed(); } };
  B.play = function (id) {
    var t = B.tile(id); if (!t) return false;
    var song = B.song(t);
    if (!song) { U.toast("\"" + t.label + "\" has no sound yet. Tap Edit under Game sounds to pick one.", "error", 6000); return false; }
    if (!WU.have("s:" + song.id)) { U.toast("The file for \"" + t.label + "\" isn't on this phone. Open Songs and choose it again.", "error", 7000); return false; }
    if (!E.supported()) { U.toast("This browser can't play audio.", "error"); return false; }
    var ul = E.unlock(), my = ++token, r = C.tileRegion(t, song);
    S.play = { state: "loading", id: t.id, board: true };
    WU.emit("audio");
    Promise.all([E.songBuffer(song, { start: r.start, len: r.len }), ul]).then(function (x) {
      if (my !== token) return;
      S.play = { state: "idle", id: null };
      if (!x[1]) { WU.emit("audio"); U.toast("Your phone is keeping the sound asleep. Tap the sound again. If it stays quiet, check the volume and the ringer or silent switch.", "error", 8000); return; }
      E.playSimple(x[0].buf, { offset: r.start, duration: r.len, fade: 0, base: x[0].base, key: "b:" + t.id, onEnd: function (why) { if (why === "end" && my === token) B.next(); } });
      U.live("Playing " + t.label);
      changed();
    }, function (e) {
      if (my !== token) return;
      S.play = { state: "idle", id: null };
      WU.emit("audio");
      U.toast(e && e.kind === "missing" ? "The file for \"" + t.label + "\" isn't on this phone. Open Songs and choose it again." : "This phone couldn't play \"" + t.label + "\".", "error", 7000);
    });
    return true;
  };
  /* Up next */
  B.add = function (id) {
    var t = B.tile(id); if (!t || !B.ready(t)) return;
    var before = S.queue.length;
    S.queue = C.queueAdd(B.queue(), id);
    if (S.queue.length > before) U.live("Up next: " + t.label);
    else if (S.queue.length >= C.LIM.queue) U.toast("Up next is full.", "warn");
    changed();
  };
  B.remove = function (id) { var q = B.queue(); S.queue = C.queueDrop(q, q.indexOf(id)); changed(); };
  /* play the first one waiting (one that can't play is skipped); false when none could */
  B.next = function () {
    while (S.queue.length) {
      var id = S.queue[0];
      S.queue = S.queue.slice(1);
      changed();
      if (B.tile(id) && B.play(id)) return true;
    }
    return false;
  };

  /* ---------- the Game screen card ---------- */
  function tileSub(t) {
    var s = B.song(t);
    if (!s) return t.id === "anthem" ? "Tap to get the anthem" : "Tap to pick a sound";
    if (!WU.have("s:" + s.id)) return "File not on this phone";
    var r = C.tileRegion(t, s);
    return C.fmtClock(r.len);
  }
  B.cardHTML = function () {
    var tiles = B.tiles(), on = B.playingId(), loading = S.play.board ? S.play.id : null, q = B.queue();
    var h = '<section class="card board" id="gBoard" aria-label="Game sounds"><div class="row sp"><h3>Game sounds</h3><button type="button" class="btn ghost small" data-act="b-edit">Edit</button></div>';
    if (!tiles.length) h += '<p class="mute small-note">No game sounds. Tap Edit to add the anthem, music between innings or your own clips.</p>';
    else {
      h += '<div class="tiles">' + tiles.map(function (t) {
        var me = on === t.id, wait = loading === t.id, has = !!B.song(t);
        var act = me ? "stop" : has ? "b-play" : "b-tile";
        return '<div class="tile' + (me ? " on" : "") + (has ? "" : " empty") + '"><button type="button" class="tplay" data-act="' + act + '" data-id="' + t.id + '" aria-label="' + (me ? "Stop " : has ? "Play " : "Set up ") + esc(t.label) + '">' +
          "<b>" + esc(t.label) + "</b><small>" + (me ? "Playing. Tap to stop" : wait ? "Getting ready..." : esc(tileSub(t))) + "</small></button>" +
          (has ? '<button type="button" class="tnext" data-act="b-queue" data-id="' + t.id + '" aria-label="Play ' + esc(t.label) + ' next"' + (q.indexOf(t.id) >= 0 ? " disabled" : "") + ">Next</button>" : "") + "</div>";
      }).join("") + "</div>";
    }
    if (q.length) {
      h += '<div class="upnext"><div class="row sp"><b>Up next</b><button type="button" class="btn small" data-act="b-next">Play ' + esc(B.tile(q[0]).label) + " now</button></div><ol>" +
        q.map(function (id) { var t = B.tile(id); return "<li><span>" + esc(t.label) + '</span><button type="button" class="x" data-act="b-unq" data-id="' + id + '" aria-label="Take ' + esc(t.label) + ' out of Up next">' + U.I.x + "</button></li>"; }).join("") +
        '</ol><p class="mute small-note">Up next plays by itself when the sound before it ends. Stop ends everything.</p></div>';
    }
    return h + "</section>";
  };
  B.paint = function () { var el = $("#gBoard"); if (el) el.outerHTML = B.cardHTML(); };

  WU.act["b-play"] = function (el) { B.play(el.dataset.id); };
  WU.act["b-queue"] = function (el) { B.add(el.dataset.id); };
  WU.act["b-unq"] = function (el) { B.remove(el.dataset.id); };
  WU.act["b-next"] = function () { E.unlock(); B.next(); };
  WU.act["b-edit"] = function () { B.openEdit(); };
  WU.act["b-tile"] = function (el) { B.openTile(el.dataset.id); };

  /* ---------- editing ---------- */
  /* A button's start and end skip the quiet before and after the sound. The coach can still move both. */
  B.assign = function (t, songId) {
    var s = songId ? WU.song(songId) : null;
    t.songId = s ? s.id : null; t.start = 0; t.end = 0;
    WU.commit("data");
    if (!s) return Promise.resolve(t);
    return E.songFull(s).then(function (buf) {
      if (t.songId !== s.id) return t;
      var r = C.silenceRegion(buf.getChannelData(0), buf.sampleRate, -50, 0.02, 0.3);
      if (r) { t.start = Math.round(r.start * 100) / 100; t.end = r.end < s.dur - 0.05 ? Math.round(r.end * 100) / 100 : 0; }
      WU.commit("data");
      return t;
    }, function () { return t; });
  };
  /* one tap: download the anthem into the song library and put it on the button */
  B.getAnthem = async function (t) {
    var name = C.str(ANTHEM.file, C.LIM.file), have = S.st.songs.filter(function (s) { return s.name === name && WU.have("s:" + s.id); })[0];
    if (have) { await B.assign(t, have.id); U.toast("The anthem is on \"" + t.label + "\".", "ok"); return true; }
    var busy = U.busy("Getting the national anthem..."), blob = null;
    try {
      var res = await fetch(ANTHEM.url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
      if (res.ok) blob = await res.blob();
    } catch (e) { blob = null; }
    busy.done();
    if (!blob || blob.size < 100000) { U.toast("Couldn't download the anthem just now. Check the internet and try again, or choose your own file.", "error", 8000); return false; }
    var r = await WU.songs.addFiles([new File([blob], ANTHEM.file, { type: "audio/mpeg" })]), s = r.added[0];
    if (!s) return false;
    s.title = ANTHEM.title; s.intro = false;
    await B.assign(t, s.id);
    U.toast("Got the anthem: " + C.fmtClock(C.tileRegion(t, s).len) + ", the U.S. Navy Band.", "ok", 6000);
    return true;
  };
  WU.onFile["board-add"] = async function (files, input) {
    var r = await WU.songs.addFiles(files), t = B.tile(input.dataset.tid);
    if (r.added.length && t) await B.assign(t, r.added[0].id);
  };
  B.addTile = function () {
    if (B.tiles().length >= C.LIM.board) { U.toast("That's the most game sounds there can be (" + C.LIM.board + ").", "warn"); return null; }
    var t = { id: C.uid(), label: "New sound", songId: null, start: 0, end: 0 };
    S.st.board.push(t);
    WU.commit("data");
    return t;
  };
  B.move = function (id, d) {
    var b = B.tiles(), i = -1;
    b.forEach(function (t, k) { if (t.id === id) i = k; });
    S.st.board = C.moveItem(b, i, d);
    WU.commit("data");
  };
  B.drop = function (id) {
    if (B.playingId() === id) WU.act.stop(0.05);
    S.st.board = B.tiles().filter(function (t) { return t.id !== id; });
    S.queue = S.queue.filter(function (x) { return x !== id; });
    WU.commit("data");
  };

  /* the list of buttons: order, edit, add */
  B.openEdit = function () {
    var off, api = U.openSheet({
      title: "Game sounds", cls: "board-edit",
      html: '<p class="mute small-note">These play from Walk-Up and from the watch (swipe down on the batter). Songs come from your song library; each one starts where the sound starts.</p><div class="card slist" id="beList"></div>',
      footer: '<button type="button" class="btn ghost" data-do="add">Add a sound</button><button type="button" class="btn" data-close>Done</button>',
      onClose: function () { if (off) off(); }
    });
    var el = api.el;
    function paint() {
      var b = B.tiles();
      $("#beList", el).innerHTML = b.length ? b.map(function (t, i) {
        var s = B.song(t);
        return '<div class="srow"><div class="smain"><b>' + esc(t.label) + "</b><small>" + esc(s ? s.title : "No sound yet") + '</small></div><div class="sacts">' +
          '<button type="button" class="btn ghost small" data-do="up" data-id="' + t.id + '" aria-label="Move ' + esc(t.label) + ' up"' + (i ? "" : " disabled") + ">&uarr;</button>" +
          '<button type="button" class="btn ghost small" data-do="down" data-id="' + t.id + '" aria-label="Move ' + esc(t.label) + ' down"' + (i < b.length - 1 ? "" : " disabled") + ">&darr;</button>" +
          '<button type="button" class="btn ghost small" data-do="edit" data-id="' + t.id + '">Edit</button></div></div>';
      }).join("") : '<p class="mute pad">No game sounds. Tap "Add a sound".</p>';
    }
    paint();
    off = WU.on(function (what) { if (!api.closed && what === "data") paint(); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b || b.disabled) return;
      var d = b.dataset.do;
      if (d === "add") { var t = B.addTile(); if (t) B.openTile(t.id); }
      else if (d === "up") B.move(b.dataset.id, -1);
      else if (d === "down") B.move(b.dataset.id, 1);
      else if (d === "edit") B.openTile(b.dataset.id);
    });
  };

  /* one button: its name, its sound, where it starts and ends */
  B.openTile = function (id) {
    var t = B.tile(id); if (!t) return;
    var off, api = U.openSheet({
      title: "Game sound", cls: "board-tile", autofocus: t.label === "New sound" ? "#btName" : null, select: true,
      html: '<label class="field"><span class="label">Name on the button</span><input type="text" id="btName" maxlength="' + C.LIM.boardLabel + '" value="' + esc(t.label) + '" autocomplete="off"></label><div id="btBody"></div>',
      footer: '<button type="button" class="btn danger" data-do="delete">Delete</button><button type="button" class="btn" data-close>Done</button>',
      onClose: function () { if (off) off(); if (B.playingId() === id) WU.act.stop(0.05); }
    });
    var el = api.el, shown = null;
    function songOpts(tt) {
      return '<option value="">No sound yet</option>' + S.st.songs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === tt.songId ? " selected" : "") + ">" + esc(x.title) + "</option>"; }).join("");
    }
    function paint() {
      var tt = B.tile(id); if (!tt) { api.close(); return; }
      var s = B.song(tt), r = s ? C.tileRegion(tt, s) : null, playing = B.playingId() === id;
      var h = '<label class="field"><span class="label">Sound</span><select id="btSong">' + songOpts(tt) + "</select></label>" +
        U.fileBtn({ text: "Add a new song file", cls: "ghost block", attr: 'data-file="board-add" data-tid="' + id + '"', label: "Add a new song file for " + tt.label });
      if (tt.id === "anthem" || /anthem/i.test(tt.label)) h += '<button type="button" class="btn ghost block top" data-do="anthem">Get the national anthem</button><p class="mute small-note">' + esc(ANTHEM.credit) + " Or choose your own file above.</p>";
      if (s && r) {
        h += U.stepper({ key: "start", label: "Starts at", hint: "seconds into the song", value: tt.start, min: 0, max: Math.max(0, Math.floor((s.dur - 0.5) * 10) / 10), step: 0.5, coarse: 5, slider: true }) +
          U.stepper({ key: "end", label: "Ends at", hint: "seconds into the song (the end of the song unless changed)", value: Math.round((r.start + r.len) * 10) / 10, min: 0, max: Math.floor(s.dur * 10) / 10, step: 0.5, coarse: 5, slider: true }) +
          '<p class="mute small-note" id="btLen">Plays for ' + C.fmtClock(r.len) + ".</p>" +
          '<button type="button" class="btn block top" data-do="preview">' + (playing ? "Stop" : "Play it") + "</button>";
      }
      $("#btBody", el).innerHTML = h;
      shown = tt.songId || null;
    }
    paint();
    var name = $("#btName", el);
    name.addEventListener("input", function () { var tt = B.tile(id); if (!tt) return; tt.label = C.cleanLabel(name.value, C.LIM.boardLabel) || "Sound"; WU.save(); changed(); });
    name.addEventListener("change", function () { WU.commit("data"); });
    el.addEventListener("change", function (e) { if (e.target.id === "btSong") B.assign(B.tile(id), e.target.value || null); });
    U.bindControls(el, function (key, mode, v) {
      var tt = B.tile(id), s = B.song(tt); if (!tt || !s) return;
      var r = C.tileRegion(tt, s), start = r.start, end = r.start + r.len;
      if (key === "start") start = mode === "step" ? start + v : v;
      else if (key === "end") end = mode === "step" ? end + v : v;
      if (!isFinite(start) || !isFinite(end)) { paint(); return; }
      start = C.clamp(Math.round(start * 10) / 10, 0, Math.max(0, s.dur - 0.5));
      end = C.clamp(Math.round(end * 10) / 10, start + 0.5, s.dur);
      tt.start = start; tt.end = end >= s.dur - 0.05 ? 0 : end;
      WU.save(); changed();
      var nr = C.tileRegion(tt, s);
      U.setCtl(el, "start", nr.start); U.setCtl(el, "end", Math.round((nr.start + nr.len) * 10) / 10);
      var l = $("#btLen", el); if (l) l.textContent = "Plays for " + C.fmtClock(nr.len) + ".";
    });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      var d = b.dataset.do, tt = B.tile(id); if (!tt) return;
      if (d === "preview") { if (B.playingId() === id) WU.act.stop(0.05); else B.play(id); }
      else if (d === "anthem") B.getAnthem(tt);
      else if (d === "delete") U.confirm({ title: "Delete this game sound?", message: "\"" + tt.label + "\" comes off the Game screen and the watch. The song stays in your library.", confirmText: "Delete", danger: true, onConfirm: function () { B.drop(id); api.close(); } });
    });
    off = WU.on(function (what) {
      if (api.closed) return;
      /* a new sound redraws the body (the name box isn't in it, so typing a name is never cut off);
         the same sound only updates the numbers in place, so a tap on a stepper is never lost to a redraw */
      if (what === "data") {
        var tt = B.tile(id), s = tt && B.song(tt);
        if (!tt || (tt.songId || null) !== shown || !s || !$('[data-key="start"]', el)) { paint(); return; }
        var nr = C.tileRegion(tt, s), sel = $("#btSong", el);
        U.setCtl(el, "start", nr.start); U.setCtl(el, "end", Math.round((nr.start + nr.len) * 10) / 10);
        var l = $("#btLen", el); if (l) l.textContent = "Plays for " + C.fmtClock(nr.len) + ".";
        if (sel && document.activeElement !== sel) sel.innerHTML = songOpts(tt);
      }
      else if (what === "audio") { var p = $('[data-do="preview"]', el); if (p) p.textContent = B.playingId() === id ? "Stop" : "Play it"; }
    });
  };
})();
