/* Walk-Up parent page. A coach sends a link to this page; a parent picks a song and sends it back through the phone's own share sheet.
   Nothing is uploaded, nothing is stored (no localStorage, no IndexedDB, no cookies), and the page makes no network calls of its own.
   The note about who the song is for travels in the part of the link after #, which a browser never sends to any server.
   Everything that came from the link is put on the page as text, never as HTML. */
(function () {
  "use strict";
  var C = window.WalkupCore, root = document.getElementById("sendRoot");
  var MB10 = 10 * 1024 * 1024;
  /* the type a share sheet expects, by extension, for files a phone labelled with nothing, application/octet-stream or video/mp4 */
  var TYPE_OF = { mp3: "audio/mpeg", wav: "audio/wav", wave: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", mp4: "audio/mp4", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aif: "audio/aiff", aiff: "audio/aiff", caf: "audio/x-caf", webm: "audio/webm", "3gp": "audio/3gpp", amr: "audio/amr" };
  var BIG_TEXT = "Texts can refuse big files. iMessage, WhatsApp or email work best.";

  var info = null, file = null, dur = null, decoded = null, clipBlob = null, clipKey = "", clipTimer = 0, clipJob = 0, urls = [], prevAudio = null, fileSeq = 0;
  var el = {};

  function $(id) { return document.getElementById(id); }
  function ext(name) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; }
  /* a file is welcome when its name OR its type says audio; this phone being able to play it is not required (the coach's phone may read it fine) */
  function isAudio(f) { return C.isAudioFile(f.name, f.type); }
  function clean(s, max) { return C.cleanLabel(s, max || 60); }
  function say(text, kind) {
    var m = el.msg; m.textContent = text || ""; m.className = "s-msg " + (kind || ""); m.hidden = !text;
  }
  function track(blob) { var u = URL.createObjectURL(blob); urls.push(u); return u; }
  function freeUrls() { urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); urls = []; }

  /* ---------- the friendly page for a link that does not work ---------- */
  function renderBad() {
    root.className = "send bad";
    root.innerHTML = '<div class="s-brand">Walk-Up</div><section id="bad" class="s-bad card" role="alert"><h1>This link looks incomplete</h1>' +
      '<p>Ask the coach to send you a new one. When the link works, this page says "A walk-up song for" and the player\'s name.</p>' +
      '<p class="mute">Nothing was sent and nothing was saved.</p></section>';
  }

  /* ---------- the page ---------- */
  function build() {
    root.className = "send";
    root.innerHTML =
      '<header class="s-head"><div class="s-brand">Walk-Up</div><h1 id="head"></h1><p class="s-team" id="team" hidden></p></header>' +
      '<p class="s-lead" id="lead"></p>' +
      '<ol class="s-steps" id="steps">' +
      '<li class="s-step"><span class="s-n" aria-hidden="true">1</span><div class="s-body"><h2>Choose the song</h2>' +
      '<p class="mute">Pick the file from this phone: Files, Downloads, Music or a voice memo.</p>' +
      '<label class="btn big block file-btn"><span id="pickTx">Choose a song file</span><input type="file" id="song" accept="' + C.AUDIO_ACCEPT + '" aria-label="Choose a song file from this phone"></label>' +
      '<div class="s-file" id="fileInfo" hidden><b id="fName"></b><span id="fMeta"></span></div>' +
      '<p class="errmsg" id="fileErr" role="alert" hidden></p><p class="warnmsg" id="fileWarn" hidden></p><p class="warnmsg" id="fileNote" hidden></p>' +
      '<p class="mute small-note">No file? Type the song name in step 2 and send that instead.</p></div></li>' +
      '<li class="s-step"><span class="s-n" aria-hidden="true">2</span><div class="s-body"><h2>Name it <span class="opt">(optional)</span></h2>' +
      '<label class="field"><span class="label">Song title</span><input type="text" id="title" maxlength="60" autocomplete="off" placeholder="Song title"></label>' +
      '<label class="field"><span class="label">Artist</span><input type="text" id="artist" maxlength="60" autocomplete="off" placeholder="Artist"></label>' +
      '<div id="clipBox" class="s-clip" hidden><label class="chk"><input type="checkbox" id="clipOn"> <span>Send just the part I like</span></label>' +
      '<p class="mute small-note">Makes the file much smaller. About 10 seconds is plenty.</p>' +
      '<div id="clipCtl" hidden><div class="s-two"><label class="field"><span class="label">Start (seconds)</span><input type="number" id="clipStart" inputmode="decimal" min="0" step="1" value="0"></label>' +
      '<label class="field"><span class="label">Length (seconds)</span><input type="number" id="clipLen" inputmode="decimal" min="1" max="60" step="1" value="10"></label></div>' +
      '<div class="row wrap"><button type="button" class="btn ghost small" id="clipPrev">Preview</button><span class="mute" id="clipInfo" role="status"></span></div></div></div>' +
      '</div></li>' +
      '<li class="s-step"><span class="s-n" aria-hidden="true">3</span><div class="s-body"><h2>Send it back</h2>' +
      '<p class="mute">Tap the button, then pick the chat or email this link came from.</p>' +
      '<button type="button" class="btn big block" id="send">Send it back</button>' +
      '<p class="s-msg" id="msg" role="status" aria-live="polite" hidden></p>' +
      '<div class="s-fallback" id="fallback" hidden><label class="field"><span class="label">Message to send with it</span><textarea id="msgBox" rows="3" readonly></textarea></label>' +
      '<div class="stack"><a class="btn block" id="dl" hidden>Download the file</a><button type="button" class="btn ghost block" id="copy">Copy message</button></div></div>' +
      '</div></li></ol>' +
      '<section class="s-done card" id="done" role="status" hidden><div class="s-check" aria-hidden="true">&#10003;</div><h2>Sent!</h2>' +
      '<p>You can close this page. If you sent it, you\'re done.</p><p class="mute small-note">Nothing was uploaded or saved by this page.</p>' +
      '<button type="button" class="btn ghost block" id="again">Send a different song</button></section>' +
      '<p class="s-foot mute small-note">This page does not upload or save anything. The song goes only to the chat or email you choose.</p>';
    ["head", "team", "lead", "steps", "song", "pickTx", "fileInfo", "fName", "fMeta", "fileErr", "fileWarn", "fileNote", "title", "artist", "clipBox", "clipOn", "clipCtl", "clipStart", "clipLen", "clipPrev", "clipInfo", "send", "msg", "fallback", "msgBox", "dl", "copy", "done", "again"].forEach(function (id) { el[id] = $(id); });
    var who = C.whoLabel(info.n, info.u);
    el.head.textContent = "A walk-up song" + (who ? " for " + who : "");
    if (info.c) { el.team.textContent = "Team: " + info.c; el.team.hidden = false; }
    el.lead.textContent = "The coach is asking you to pick the song " + (info.n || "your player") + " hears when they walk up to bat. About 10 seconds is plenty. The coach can trim it.";
    el.song.addEventListener("change", onPick);
    el.send.addEventListener("click", onSend);
    el.copy.addEventListener("click", onCopy);
    el.again.addEventListener("click", reset);
    el.clipOn.addEventListener("change", onClipToggle);
    el.clipStart.addEventListener("input", schedClip);
    el.clipLen.addEventListener("input", schedClip);
    el.clipPrev.addEventListener("click", onPreview);
    el.title.addEventListener("input", function () { refreshFallbackText(); });
    el.artist.addEventListener("input", function () { refreshFallbackText(); });
  }

  /* ---------- choosing the song ---------- */
  function readDuration(f) {
    return new Promise(function (res) {
      var a = document.createElement("audio"), url = "", done = false, t = 0;
      function fin(v) { if (done) return; done = true; clearTimeout(t); try { a.removeAttribute("src"); a.load(); } catch (e) { /* ignore */ } if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } } res(v); }
      t = setTimeout(function () { fin(null); }, 4000);
      try {
        url = URL.createObjectURL(f); a.preload = "metadata";
        a.onloadedmetadata = function () { fin(isFinite(a.duration) && a.duration > 0 ? a.duration : null); };
        a.onerror = function () { fin(null); };
        a.src = url;
      } catch (e) { fin(null); }
    });
  }
  function onPick() {
    var f = el.song.files && el.song.files[0];
    say("");
    if (!f) return;
    el.fileErr.hidden = true; el.fileWarn.hidden = true; el.fileNote.hidden = true;
    if (!isAudio(f)) {
      el.fileErr.textContent = "That doesn't look like a song. Pick an audio file such as an MP3, M4A or WAV.";
      el.fileErr.hidden = false; setFile(null); el.song.value = ""; return;
    }
    if (!f.size) { el.fileErr.textContent = "That file is empty. Pick a different one."; el.fileErr.hidden = false; setFile(null); el.song.value = ""; return; }
    setFile(f);
    var mine = ++fileSeq;
    readDuration(f).then(function (d) {
      if (mine !== fileSeq || file !== f) return;
      dur = d; showFile();
      /* this phone cannot play it, which says little about the coach's phone, so the song can still be sent */
      el.fileNote.textContent = d ? "" : "This phone couldn't check that song, but you can still send it. The coach's phone may read it fine.";
      el.fileNote.hidden = !!d;
    });
  }
  function setFile(f) {
    file = f; dur = null; decoded = null; clipBlob = null; clipKey = ""; clipJob++; stopPreview();
    el.clipOn.checked = false; el.clipCtl.hidden = true; el.clipInfo.textContent = ""; el.clipBox.hidden = !f;
    el.fallback.hidden = true; el.dl.hidden = true;
    el.fileNote.hidden = true;
    if (!f) { el.fileInfo.hidden = true; el.pickTx.textContent = "Choose a song file"; el.fileWarn.hidden = true; return; }
    showFile();
  }
  function showFile() {
    if (!file) return;
    el.fName.textContent = file.name;
    el.fMeta.textContent = " " + C.fmtSize(file.size) + " · " + (dur ? C.fmtClock(dur) + " long" : "length not shown");
    el.fileInfo.hidden = false; el.pickTx.textContent = "Choose a different song";
    updateWarn(file.size);
  }
  function updateWarn(bytes) {
    if (bytes > MB10) { el.fileWarn.textContent = "This file is " + C.fmtSize(bytes) + ". " + BIG_TEXT; el.fileWarn.hidden = false; }
    else el.fileWarn.hidden = true;
  }

  /* ---------- the optional short clip, made here as a 16-bit WAV ---------- */
  function readBuf(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(f); });
  }
  function decodeFile(f) {
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return Promise.reject(new Error("noaudio"));
    return readBuf(f).then(function (ab) {
      return new Promise(function (res, rej) {
        var ctx = new AC(1, 1, 44100), p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    });
  }
  /* channels of `buf` from `start` for `len` seconds, as a WAV blob (at most two channels, with 8 ms fades so the cut does not click) */
  function wavOf(buf, start, len) {
    var sr = buf.sampleRate, nch = Math.min(2, buf.numberOfChannels), s0 = Math.max(0, Math.round(start * sr)), n = Math.max(1, Math.min(buf.length - s0, Math.round(len * sr)));
    var bytes = n * nch * 2, ab = new ArrayBuffer(44 + bytes), v = new DataView(ab), i, c;
    function str(o, s) { for (var k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); }
    str(0, "RIFF"); v.setUint32(4, 36 + bytes, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, bytes, true);
    var fade = Math.min(Math.round(0.008 * sr), n >> 1), data = [];
    for (c = 0; c < nch; c++) data.push(buf.getChannelData(c));
    for (i = 0; i < n; i++) {
      var g = i < fade ? i / fade : i >= n - fade ? (n - 1 - i) / fade : 1;
      for (c = 0; c < nch; c++) {
        var x = Math.max(-1, Math.min(1, data[c][s0 + i] * g));
        v.setInt16(44 + (i * nch + c) * 2, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }
  function clipArgs() {
    var total = decoded ? decoded.duration : dur;
    var len = Math.min(60, Math.max(1, parseFloat(el.clipLen.value) || 10)), start = Math.max(0, parseFloat(el.clipStart.value) || 0);
    /* the clip starts where it was asked to and is cut short by the end of the song, never moved back */
    if (total) { start = Math.min(start, Math.max(0, total - 1)); len = Math.min(len, total - start); }
    return { start: Math.round(start * 10) / 10, len: Math.round(len * 10) / 10 };
  }
  function onClipToggle() {
    el.clipCtl.hidden = !el.clipOn.checked;
    stopPreview();
    if (el.clipOn.checked) makeClip(); else { clipBlob = null; clipKey = ""; clipJob++; el.clipInfo.textContent = ""; if (file) updateWarn(file.size); }
  }
  function schedClip() { clearTimeout(clipTimer); clipBlob = null; clipKey = ""; stopPreview(); clipTimer = setTimeout(makeClip, 300); }
  /* Resolves with the clip blob, or null if this phone cannot cut the file (then the whole song is sent). */
  function makeClip() {
    if (!file || !el.clipOn.checked) return Promise.resolve(null);
    var a = clipArgs(), key = file.name + "|" + file.size + "|" + a.start + "|" + a.len, job = ++clipJob;
    if (clipBlob && clipKey === key) return Promise.resolve(clipBlob);
    el.clipInfo.textContent = "Getting your clip ready...";
    var p = decoded ? Promise.resolve(decoded) : decodeFile(file).then(function (b) { decoded = b; dur = dur || b.duration; return b; });
    return p.then(function (buf) {
      if (job !== clipJob) return null;
      var a2 = clipArgs(), blob = wavOf(buf, a2.start, a2.len);
      if (document.activeElement !== el.clipStart) el.clipStart.value = a2.start;
      if (document.activeElement !== el.clipLen) el.clipLen.value = a2.len;
      clipBlob = blob; clipKey = file.name + "|" + file.size + "|" + a2.start + "|" + a2.len;
      el.clipInfo.textContent = "Clip: " + C.fmtClock(a2.len) + " long, " + C.fmtSize(blob.size);
      updateWarn(blob.size);
      return blob;
    }, function () {
      if (job !== clipJob) return null;
      el.clipOn.checked = false; el.clipCtl.hidden = true; el.clipInfo.textContent = "";
      say("This phone can't cut that file. The whole song will be sent instead.", "warn");
      return null;
    });
  }
  function stopPreview() { if (prevAudio) { try { prevAudio.pause(); } catch (e) { /* ignore */ } prevAudio = null; } if (el.clipPrev) el.clipPrev.textContent = "Preview"; }
  function onPreview() {
    if (prevAudio) { stopPreview(); return; }
    makeClip().then(function (blob) {
      if (!blob) return;
      var a = new Audio(track(blob)); prevAudio = a; el.clipPrev.textContent = "Stop";
      a.onended = function () { if (prevAudio === a) stopPreview(); };
      var p = a.play(); if (p && p.catch) p.catch(function () { if (prevAudio === a) stopPreview(); say("This phone wouldn't play the preview. You can still send the clip.", "warn"); });
    });
  }

  /* ---------- what gets sent ---------- */
  function words() {
    var title = clean(el.title.value, 60), artist = clean(el.artist.value, 60);
    return { title: title, artist: artist, name: [title, artist].filter(Boolean).join(" - ") };
  }
  function messageText() {
    var w = words(), who = C.whoLabel(info.n, info.u);
    return "Walk-up song for " + (who || "my player") + (w.name ? ": " + w.name : "") + " [WU-" + info.t + "]";
  }
  function shareTitle() { var who = C.whoLabel(info.n, info.u); return "Walk-up song" + (who ? " for " + who : ""); }
  function refreshFallbackText() { if (!el.fallback.hidden) el.msgBox.value = messageText(); }
  /* the file as it will be named in the chat or email */
  function outFile(blob) {
    var w = words(), src = blob ? (file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") + ".wav") : file.name;
    var name = C.buildSongFileName(info.t, w.title, src, blob ? "audio/wav" : file.type);
    var type = blob ? "audio/wav" : /^audio\//i.test(file.type) ? file.type : (TYPE_OF[ext(file.name)] || file.type || "audio/mpeg");
    return new File([blob || file], name, { type: type });
  }
  function showFallback(out, why) {
    el.fallback.hidden = false; el.msgBox.value = messageText();
    if (out) { var old = el.dl.href; el.dl.href = track(out); el.dl.download = out.name; el.dl.hidden = false; if (old && old.indexOf("blob:") === 0) { try { URL.revokeObjectURL(old); } catch (e) { /* ignore */ } } }
    else el.dl.hidden = true;
    if (why) say(why, "warn");
  }
  function showDone() {
    el.done.hidden = false; el.steps.hidden = true; say("");
    try { el.done.scrollIntoView({ block: "start" }); } catch (e) { /* ignore */ }
  }
  function reset() {
    el.done.hidden = true; el.steps.hidden = false; say("");
    el.song.value = ""; setFile(null); el.title.value = ""; el.artist.value = "";
    try { root.scrollIntoView({ block: "start" }); } catch (e) { /* ignore */ }
  }
  function canShareFile(out) { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [out] })); } catch (e) { return false; } }
  var sending = false;
  function onSend() {
    if (sending) return;
    say(""); el.fallback.hidden = true;
    var w = words();
    if (!file) {
      if (!w.name) { say("Choose a song file in step 1, or type the song name in step 2 and send that.", "warn"); el.song.focus(); return; }
      sendText(); return;
    }
    sending = true; el.send.disabled = true;
    var clipFirst = el.clipOn.checked ? makeClip() : Promise.resolve(null);
    clipFirst.then(function (blob) {
      var out = outFile(blob);
      if (!canShareFile(out)) { showFallback(out, "This browser can't send files by itself. Download the file, then attach it to your reply to the coach."); return; }
      return navigator.share({ files: [out], title: shareTitle(), text: messageText() }).then(showDone, function (err) {
        var n = err && err.name;
        if (n === "AbortError") { say("No problem. Nothing was sent. Tap Send it back when you're ready."); return; }
        showFallback(out, "Your phone didn't open its share menu. Download the file below and attach it to your reply instead." + (n === "NotAllowedError" ? " You can also tap Send it back once more." : ""));
      });
    }).then(function () { sending = false; el.send.disabled = false; }, function () { sending = false; el.send.disabled = false; say("Something went wrong. Please try again.", "warn"); });
  }
  function sendText() {
    var text = messageText();
    if (navigator.share) {
      sending = true; el.send.disabled = true;
      navigator.share({ title: shareTitle(), text: text }).then(showDone, function (err) {
        if (err && err.name === "AbortError") say("No problem. Nothing was sent. Tap Send it back when you're ready.");
        else showFallback(null, "Your phone didn't open its share menu. Copy the message and paste it into your reply instead.");
      }).then(function () { sending = false; el.send.disabled = false; });
    } else showFallback(null, "This browser can't open a share menu. Copy the message and paste it into your reply to the coach.");
  }
  function onCopy() {
    var text = el.msgBox.value || messageText();
    function fallbackCopy() {
      try { el.msgBox.focus(); el.msgBox.select(); if (document.execCommand("copy")) { say("Copied. Paste it into your reply to the coach.", "ok"); return; } } catch (e) { /* ignore */ }
      say("Press and hold the message above, choose Copy, then paste it into your reply.", "warn");
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say("Copied. Paste it into your reply to the coach.", "ok"); }, fallbackCopy);
      else fallbackCopy();
    } catch (e) { fallbackCopy(); }
  }

  /* ---------- start ---------- */
  function start() {
    stopPreview(); freeUrls(); file = null; dur = null; decoded = null; clipBlob = null; clipKey = ""; sending = false;
    info = C.parseRequestLink(location.hash);
    if (!info.ok) { renderBad(); return; }
    build();
  }
  window.addEventListener("hashchange", start);
  start();
})();
