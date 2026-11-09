/* Walk-Up settings, sound check, Bluetooth help, and backups (settings only, or everything with the audio). */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var D = WU.data = {};
  WU.onFile = WU.onFile || {};

  /* ---------- Settings tab ---------- */
  D.renderSettings = function () {
    var s = S.st.settings, sp = E.speech.supported(), voices = sp ? E.speech.voices() : [], an = C.sanitizePolish(S.st.announcer);
    var pre = C.presetOf(an), h = '<div class="sec-title"><h2>Settings</h2><span class="sub">' + esc(C.VERSION) + "</span></div>";
    if (S.mem) h += '<div class="banner bad" role="alert"><p><b>This browser is not letting Walk-Up save.</b> Everything you add is lost when you close the app. Use a backup to keep a copy.</p></div>';
    if (WU.db.memOnly) h += '<div class="banner bad" role="alert"><p><b>This browser will not keep songs or voices.</b> They work until you close the app. Make a backup with audio before you leave.</p></div>';
    h += '<section class="card"><h3>Sound</h3>' + U.range({ key: "master", label: "Master volume", min: 0, max: 100, step: 1, value: s.master, text: s.master + "%" }) +
      '<div class="row wrap top"><button type="button" class="btn" data-act="sound-check">Sound check</button><button type="button" class="btn ghost" data-act="bt-help">Using a Bluetooth speaker</button></div>' +
      '<p class="mute small-note">Phones keep audio asleep until you tap. If you hear nothing, check the phone\'s volume and the ringer or silent switch (an iPhone in silent mode mutes web audio).</p></section>';
    h += '<section class="card"><h3>Computer voice</h3>';
    if (sp) {
      h += '<p class="mute small-note">Used when a player has the computer voice instead of a recording, and for the sound check.</p>' +
        '<label class="field"><span class="label">Voice</span><select id="tvoice" data-setting="tvoice"><option value="">This phone\'s default</option>' + voices.map(function (v) { return '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === s.tvoice ? " selected" : "") + ">" + esc(v.name + (v.lang ? " (" + v.lang + ")" : "")) + "</option>"; }).join("") + "</select></label>" +
        U.range({ key: "trate", label: "Speed", min: 0.5, max: 1.5, step: 0.1, value: s.trate, text: s.trate.toFixed(1) + "x" }) + U.range({ key: "tvol", label: "Voice volume", min: 0, max: 100, step: 1, value: s.tvol, text: s.tvol + "%" }) +
        '<button type="button" class="btn ghost" data-act="tts-test">Say "Sound check"</button>';
    } else h += '<p class="mute">This browser can\'t speak. Recorded voices still work.</p>';
    h += "</section>";
    h += '<section class="card"><h3>Recording</h3><label class="chk"><input type="checkbox" data-setting="countIn"' + (s.countIn ? " checked" : "") + "> <span>3-2-1 count-in before recording</span></label>" +
      U.range({ key: "thr", label: "Silence threshold for auto-trim", min: -70, max: -20, step: 1, value: s.thr, text: s.thr + " dB" }) + "</section>";
    h += '<section class="card"><h3>Game mode</h3><label class="chk"><input type="checkbox" data-setting="wake"' + (s.wake ? " checked" : "") + "> <span>Keep the screen on while Game is open</span></label>" + (("wakeLock" in navigator) ? "" : '<p class="mute small-note">This browser can\'t keep the screen on by itself. Turn off auto-lock in the phone\'s settings during games.</p>') + "</section>";
    if (WU.req) h += WU.req.settingsHTML();
    h += '<section class="card"><h3>My announcer sound</h3><p class="msg">' + esc("EQ: " + (pre === "custom" ? "custom" : C.EQ_PRESETS.filter(function (x) { return x.id === pre; })[0].label) + ", compressor " + an.comp + ", room " + (an.wet ? C.REVERB[an.size].label + " " + an.wet + "%" : "off") + ".") +
      '</p><p class="mute small-note">New recordings start with this sound. Change it from any voice: tap "Save as my announcer sound".</p><button type="button" class="btn ghost" data-act="reset-ann">Reset to the factory sound</button></section>';
    h += '<section class="card"><h3>This phone</h3><p class="msg" id="storTx">Checking storage...</p></section>';
    h += '<section class="card" id="backupCard"><h3>Back up and restore</h3><p class="msg">' + esc(D.lastBackupText()) + '</p>' +
      '<p class="mute small-note">Your team, songs and voices are saved only on this phone. Clearing the browser\'s data erases them, so back up now and then.</p>' +
      '<div class="stack"><button type="button" class="btn" data-act="backup-settings">Back up settings</button><button type="button" class="btn" data-act="backup-all">Back up everything with audio</button>' +
      U.fileBtn({ text: "Restore from a backup file", cls: "ghost block", accept: "application/json,.json", attr: 'data-file="restore"', label: "Choose a Walk-Up backup file" }) + "</div>" +
      '<p class="mute small-note">"Back up settings" saves the team, batting order, mixes, voice polish and song list, but not the audio files. After restoring it on another phone, players show "needs a song" or "needs a voice" until you pick the files again. "Back up everything" includes the audio in one bigger file (up to 80 MB).</p></section>';
    h += '<section class="card"><h3>Something wrong?</h3><button type="button" class="btn ghost" onclick="window.nateHealth&&nateHealth.report()">Send a problem report</button></section>';
    h += '<section class="card"><h3>Start over</h3><button type="button" class="btn danger" data-act="clear-all">Clear everything</button></section>';
    h += '<section class="card"><h3>About</h3><p class="msg"><b>' + esc(C.VERSION) + '</b></p><p class="mute small-note">A walk-up studio and game-day player. Record each player\'s announcement, polish it, add the songs the kids pick, balance voice against music, and play it on cue. Everything stays on this phone. No account, no sign-in, nothing is uploaded.</p></section>';
    return h;
  };
  function niceDate(ymd) { try { return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }); } catch (e) { return ymd; } }
  D.lastBackupText = function () {
    if (!S.meta.lastBackup) return "You haven't made a backup yet.";
    var d = Math.round((Date.parse(WU.today() + "T00:00:00Z") - Date.parse(S.meta.lastBackup + "T00:00:00Z")) / 86400000);
    return "Last backup: " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago") + ".";
  };
  D.paintStorage = function () {
    var t = $("#storTx"); if (!t) return;
    WU.db.usage().then(function (u) {
      var base = u.count + (u.count === 1 ? " audio file, " : " audio files, ") + C.fmtSize(u.bytes) + " saved in Walk-Up.";
      t.textContent = base;
      try {
        if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
          if (e && e.quota && $("#storTx")) $("#storTx").textContent = base + " This browser is using " + C.fmtSize(e.usage || 0) + " of about " + C.fmtSize(e.quota) + " allowed.";
        }, function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    });
  };
  /* settings controls (sliders and checkboxes), wired by app.js */
  D.onSetting = function (key, mode, val) {
    var s = S.st.settings, view = $("#wuView");
    if (!isFinite(val)) return;
    if (key === "master") { s.master = C.int(val, 0, 100, 100); E.setMaster(s.master); U.setVal(view, key, s.master + "%"); }
    else if (key === "trate") { s.trate = C.clamp(C.q1(val), 0.5, 1.5); U.setVal(view, key, s.trate.toFixed(1) + "x"); }
    else if (key === "tvol") { s.tvol = C.int(val, 0, 100, 100); U.setVal(view, key, s.tvol + "%"); }
    else if (key === "thr") { s.thr = C.int(val, -70, -20, -45); U.setVal(view, key, s.thr + " dB"); }
    else return;
    WU.save();
  };
  D.onToggle = function (t) {
    var s = S.st.settings;
    if (t.dataset.setting === "countIn") s.countIn = t.checked;
    else if (t.dataset.setting === "wake") { s.wake = t.checked; WU.emit("wake"); }
    else if (t.dataset.setting === "tvoice") s.tvoice = C.str(t.value, 200);
    else return;
    WU.save();
  };

  /* ---------- sound check and Bluetooth help ---------- */
  WU.act["sound-check"] = function () {
    E.unlock();
    if (!E.supported()) { U.toast("This browser can't play audio.", "error"); return; }
    E.tone(880, 0.35);
    if (E.speech.supported()) setTimeout(function () { E.speech.speak("Sound check", WU.speechOpts(), function () {}); }, 520);
    U.toast(E.speech.supported() ? "Playing a tone, then \"Sound check\". Can you hear both?" : "Playing a tone. This browser can't speak, so there is no voice part.", "ok", 4500);
  };
  WU.act["tts-test"] = function () {
    E.unlock();
    if (!E.speech.supported()) { U.toast("This browser can't speak.", "error"); return; }
    E.speech.speak("Sound check", WU.speechOpts(), function () {});
  };
  WU.act["bt-help"] = function () {
    U.openSheet({
      title: "Bluetooth speaker", cls: "help",
      html: '<ol class="steps"><li><b>Pair the speaker first.</b> Turn it on and connect it in your phone\'s Bluetooth settings, outside of Walk-Up.</li>' +
        '<li><b>Open Walk-Up</b> and tap <b>Sound check</b> in Settings (or on the Game screen). You should hear a tone and then a voice say "Sound check".</li>' +
        '<li><b>Set the volume</b> on the phone and the speaker. Walk-Up\'s Master volume is on top of that.</li></ol>' +
        '<p class="msg">If you hear nothing: check the phone\'s volume, and the ringer or silent switch. An iPhone in silent mode mutes web audio, even over Bluetooth.</p>' +
        '<p class="msg">Bluetooth adds roughly a tenth of a second or more of delay between the tap and the sound. For walk-up songs that doesn\'t matter, because the voice and the music travel the same way and stay lined up.</p>' +
        '<p class="mute small-note">Tip: do the sound check before every game, with the speaker where it will be.</p>',
      footer: '<button type="button" class="btn ghost" data-act="sound-check">Sound check</button><button type="button" class="btn" data-close>Done</button>'
    });
  };
  WU.act["reset-ann"] = function () { S.st.announcer = C.factoryAnnouncer(); WU.commit("data"); U.toast("Announcer sound reset.", "ok"); };

  /* ---------- storage of files for the backups ---------- */
  function today() { return WU.today(); }
  function fileStamp() { return today(); }
  function markBackup() { S.meta.lastBackup = today(); WU.saveMeta(); }
  var ascii = function (obj) { return JSON.stringify(obj).replace(/[\u007f-￿]/g, function (c) { return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4); }); };

  WU.act["backup-settings"] = function () {
    try {
      var json = JSON.stringify(C.makeBackup(S.st, today(), "settings"), null, 1);
      U.downloadBlob(new Blob([json], { type: "application/json" }), "walkup-settings-" + fileStamp() + ".json");
      markBackup(); WU.emit("meta");
      U.toast("Settings backup saved. The audio files are not in it. Keep it somewhere safe, like Files or Google Drive.", "ok", 6000);
    } catch (e) { U.toast("Couldn't make the backup file. Try again.", "error"); }
  };
  async function keyedBlobs() {
    var keys = C.audioKeys(S.st).filter(function (k) { return WU.have(k); }), items = [], total = 0;
    for (var i = 0; i < keys.length; i++) {
      var rec = await WU.db.get(keys[i]);
      if (rec && rec.blob) { items.push({ key: keys[i], type: rec.type || rec.blob.type || "", size: rec.blob.size, blob: rec.blob }); total += rec.blob.size; }
    }
    return { items: items, total: total };
  }
  WU.act["backup-all"] = async function () {
    var info = await keyedBlobs(), est = Math.ceil(info.total * 4 / 3) + 20000, c = C.counts(S.st), tooBig = info.total > C.LIM.maxBundleBytes;
    var missing = C.audioKeys(S.st).length - info.items.length;
    var api = U.openSheet({
      title: "Back up everything", cls: "confirm",
      html: '<p class="msg">This makes one file with your team, mixes, song list, and all the audio on this phone: ' + info.items.length + (info.items.length === 1 ? " audio file" : " audio files") + " (" + C.fmtSize(info.total) + ").</p>" +
        '<p class="msg">The backup file will be about <b>' + C.fmtSize(est) + "</b>.</p>" +
        (missing > 0 ? '<p class="warnmsg">' + missing + (missing === 1 ? " song or voice is" : " songs and voices are") + " missing from this phone and can't be included.</p>" : "") +
        (tooBig ? '<p class="errmsg" role="alert">That is more than the 80 MB limit for one backup. Delete a few songs you don\'t need, or use "Back up settings" instead.</p>' : '<p class="mute small-note">Put the file somewhere safe (Files, Google Drive). You can use it to move to a new phone or give your whole setup to another coach.</p>'),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-ok' + (tooBig || !c.players && !info.items.length ? " disabled" : "") + ">Make the file</button>"
    });
    $("[data-ok]", api.el).addEventListener("click", async function () {
      api.close();
      var busy = U.busy("Packing your backup...");
      try {
        var blob = await D.buildBundle(info, function (i, n) { busy.text("Packing audio " + i + " of " + n + "..."); });
        U.downloadBlob(blob, "walkup-backup-" + fileStamp() + ".json");
        markBackup(); WU.emit("meta");
        busy.done(); U.toast("Backup saved (" + C.fmtSize(blob.size) + "). Keep it somewhere safe.", "ok", 6000);
      } catch (e) { busy.done(); U.toast("Couldn't make the backup file. Try again.", "error"); }
    });
  };
  function toB64(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /* One JSON file. The audio goes in as base64 chunks, written through Blob parts and folded into bigger Blobs as we go,
     so memory holds about one chunk at a time. Layout: header, then "audio":{"key":["chunk","chunk"],"key2":[...]}. */
  D.buildBundle = async function (info, onProgress) {
    var header = C.makeBackup(S.st, today(), "bundle");
    header.audioIndex = info.items.map(function (x) { return { key: x.key, type: x.type, size: x.size }; });
    var pieces = [ascii(header).slice(0, -1) + ',"audio":{'], bytes = 0, folded = [];
    function fold(force) { if (force || bytes > 6 * 1024 * 1024) { folded.push(new Blob(pieces)); pieces = []; bytes = 0; } }
    for (var i = 0; i < info.items.length; i++) {
      var it = info.items[i];
      if (onProgress) onProgress(i + 1, info.items.length);
      pieces.push((i ? "," : "") + '"' + it.key + '":[');
      for (var off = 0, j = 0; off < it.size; off += C.BUNDLE_CHUNK, j++) {
        var ab = await it.blob.slice(off, Math.min(it.size, off + C.BUNDLE_CHUNK)).arrayBuffer(), b64 = toB64(new Uint8Array(ab));
        pieces.push((j ? "," : "") + '"' + b64 + '"'); bytes += b64.length; fold(false);
      }
      pieces.push("]");
    }
    pieces.push("}}"); fold(true);
    return new Blob(folded, { type: "application/json" });
  };

  /* ---------- restore ---------- */
  D.readBackup = async function (file) {
    if (file.size > C.LIM.maxBundleBytes * 1.4 + 6e6) throw { plain: "That file is too big to be a Walk-Up backup." };
    var head = await file.slice(0, 4 * 1024 * 1024).text(), marker = ',"audio":{', idx = head.indexOf(marker), obj, audioStart = 0;
    try {
      if (idx >= 0) {
        if (!/^[\x00-\x7f]*$/.test(head.slice(0, idx))) throw 0;
        obj = JSON.parse(head.slice(0, idx) + "}"); audioStart = idx + marker.length;
      } else {
        if (file.size > 8 * 1024 * 1024) throw { plain: "That file is too big to be a Walk-Up settings backup." };
        obj = JSON.parse(file.size <= 4 * 1024 * 1024 ? head : await file.text());
      }
    } catch (e) { throw e && e.plain ? e : { plain: "That file isn't a Walk-Up backup (it can't be read)." }; }
    var v = C.validateBackup(obj);
    if (!v.ok) throw { plain: v.error };
    var order = (v.kind === "bundle" && Array.isArray(obj.audioIndex) ? obj.audioIndex : []).filter(function (a) { return a && typeof a.key === "string" && C.KEY_RE.test(a.key) && isFinite(a.size) && a.size >= 0; }).map(function (a) { return { key: a.key, size: Math.floor(a.size), type: C.str(a.type, 60).replace(/[^A-Za-z0-9.+\/;=_ -]/g, "") }; });
    return { v: v, obj: obj, audioStart: audioStart, order: order, exported: C.isYMD(obj.exported) ? obj.exported : "" };
  };
  async function readAudioInto(file, pos, order, want, onProgress) {
    for (var i = 0; i < order.length; i++) {
      var it = order[i];
      if (onProgress) onProgress(i + 1, order.length);
      var t = await file.slice(pos, pos + 70).text(), m = /^"([sv]:[A-Za-z0-9_-]{3,40})":\[/.exec(t);
      if (!m || m[1] !== it.key) throw { plain: "That backup file is damaged." };
      pos += m[0].length;
      var chunks = [], remaining = it.size;
      while (remaining > 0) {
        var raw = Math.min(C.BUNDLE_CHUNK, remaining), chars = Math.ceil(raw / 3) * 4;
        var txt = await file.slice(pos, pos + chars + 3).text();
        if (txt.charAt(0) !== '"' || txt.charAt(chars + 1) !== '"') throw { plain: "That backup file is damaged." };
        var bin;
        try { bin = atob(txt.slice(1, chars + 1)); } catch (e) { throw { plain: "That backup file is damaged." }; }
        var u8 = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
        chunks.push(u8); remaining -= raw; pos += chars + 2;
        var d = txt.charAt(chars + 2);
        if (remaining > 0 ? d !== "," : d !== "]") throw { plain: "That backup file is damaged." };
        pos += 1;
      }
      if (it.size === 0) pos += 1; // the closing ]
      var nx = (await file.slice(pos, pos + 1).text());
      if (nx !== "," && nx !== "}") throw { plain: "That backup file is damaged." };
      pos += 1;
      if (want[it.key]) {
        var blob = new Blob(chunks, { type: it.type || "audio/mpeg" });
        try { await WU.putAudio(it.key, blob); } catch (e) { throw { plain: e.plain || "Couldn't save the audio on this phone." }; }
      }
    }
  }
  WU.onFile.restore = async function (files) {
    var file = files[0]; if (!file) return;
    var r;
    try { r = await D.readBackup(file); } catch (e) { U.toast((e && e.plain ? e.plain : "That file isn't a Walk-Up backup.") + " Nothing was changed.", "error", 7000); return; }
    var c = r.v.counts, cur = C.counts(S.st), bundle = r.v.kind === "bundle";
    var has = cur.players || cur.songs;
    var about = c.players + (c.players === 1 ? " player" : " players") + " (" + c.lineup + " in the batting order), " + c.songs + (c.songs === 1 ? " song" : " songs") + ", " + c.voices + (c.voices === 1 ? " recorded voice" : " recorded voices") + (r.exported ? ". Made on " + niceDate(r.exported) : "") + ".";
    U.confirm({
      title: "Restore this backup?", message: "This backup has " + about,
      more: [bundle ? "It includes the audio, so songs and voices come back ready to play." : "It does not include the audio files. Players whose song or voice file is already on this phone keep it; the others will say \"needs a song\" or \"needs a voice\" until you pick the file again.",
        has ? "Restoring replaces everything in Walk-Up on this phone now (" + cur.players + " players, " + cur.songs + " songs). This can't be undone." : "Nothing is in Walk-Up on this phone yet, so nothing will be lost."],
      confirmText: "Restore", danger: !!has,
      onConfirm: async function () {
        var busy = U.busy("Restoring...");
        try {
          if (bundle && r.order.length) {
            var want = {}; r.v.audio.forEach(function (a) { want[a.key] = 1; });
            await readAudioInto(file, r.audioStart, r.order, want, function (i, n) { busy.text("Restoring audio " + i + " of " + n + "..."); });
          }
          E.stop(0.05); E.forgetAll();
          WU.replaceState(r.v.state);
          await WU.refreshHave(); await WU.gc(); await WU.refreshHave();
          S.meta.lastBackup = S.meta.lastBackup; busy.done();
          WU.emit("data"); U.closeAll();
          U.toast("Restored " + c.players + (c.players === 1 ? " player." : " players."), "ok");
        } catch (e) { busy.done(); U.toast((e && e.plain ? e.plain : "Couldn't restore that backup.") + " Your data on this phone was left as it was.", "error", 8000); await WU.refreshHave(); try { await WU.gc(); await WU.refreshHave(); } catch (x) { /* ignore */ } }
      }
    });
  };

  /* ---------- clear everything ---------- */
  WU.act["clear-all"] = function () {
    U.confirm({
      title: "Clear everything?", message: "This permanently removes your team, songs, voices and mixes from this phone.", more: ["Make a backup first if you want to keep them. This can't be undone."], confirmText: "Clear everything", danger: true,
      onConfirm: async function () {
        E.stop(0.05); E.forgetAll();
        await WU.db.clear(); S.have = new Set();
        S.st = C.emptyState(); WU.save(); WU.store.del("meta"); S.meta = { lastBackup: null, tips: {} };
        S.tab = "game"; WU.emit("data"); U.toast("Everything was cleared.", "ok");
      }
    });
  };
})();
