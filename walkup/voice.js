/* Walk-Up voice studio: record the announcement, trim the silence (never destructively), polish it (EQ, compressor, room reverb),
   and listen to the original or the polished sound. The polished voice is rendered once with an OfflineAudioContext and that exact
   audio is what plays in game mode. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var V = WU.voice = {};
  WU.onFile = WU.onFile || {};
  var round3 = function (x) { return Math.round(x * 1000) / 1000; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var EQ_LABELS = ["100 Hz", "400 Hz", "1 kHz", "3 kHz", "8 kHz"];

  /* A new voice take (from the microphone or a file): save the file, start from the announcer sound, trim the silence. */
  V.adopt = async function (pl, blob, kind, name, buf) {
    if (!(buf.duration >= 0.2)) throw Object.assign(new Error("short"), { plain: "That recording is too short. Try again." });
    if (buf.duration > 60) throw Object.assign(new Error("long"), { plain: "That voice file is longer than a minute. A walk-up announcement is a few seconds. Use a shorter file." });
    var id = C.uid(), old = pl.voice;
    await WU.putAudio("v:" + id, blob);
    var keep = old && old.kind !== "tts" ? old : null;
    var v = C.defaultVoice(kind, { id: id, name: name, dur: round3(buf.duration), size: blob.size, mime: blob.type, thr: S.st.settings.thr }, S.st.announcer);
    if (keep) { v.polish = C.sanitizePolish(keep.polish); v.norm = keep.norm; v.thr = keep.thr; }
    v.te = v.dur;
    V.autoTrim(v, buf);
    pl.voice = v;
    E.putVoiceRaw(id, buf);
    if (keep) WU.dropAudio("v:" + keep.id);
    WU.commit("data");
    return v;
  };
  /* find where the voice starts and stops (louder than the threshold) and keep only that, plus a little air around it */
  V.autoTrim = function (v, buf) {
    var r = C.silenceRegion(buf.getChannelData(0), buf.sampleRate, v.thr, 0.05, 0.15);
    if (!r || r.end - r.start < 0.1) { v.ts = 0; v.te = v.dur; return false; }
    v.ts = round3(r.start); v.te = round3(Math.min(v.dur, r.end));
    return true;
  };

  V.open = function (pid) {
    var pl = WU.player(pid); if (!pl) return null;
    var st = { rerecord: false, ab: "polished", raw: null, peaks: null, token: 0, rtok: 0, rendering: "", closed: false, rec: false, counting: false, cancelCount: false, raf: 0, recTimer: 0, preview: false, rawErr: "", v0: 0 };
    var sh = U.openSheet({
      title: "Voice for " + (pl.name || "player"), cls: "voice tall", html: "", footer: '<button type="button" class="btn" data-close>Done</button>',
      onClose: function () {
        st.closed = true; cancelAnimationFrame(st.raf); clearTimeout(st.renderTimer); clearTimeout(st.recTimer); st.cancelCount = true;
        if (E.rec.active()) E.rec.cancel();
        var p = E.playing(); if (p && p.key === "voice") E.stop(0.05);
        if (off) off();
        WU.emit("data");
        if (WU.warm) WU.warm();
      }
    });
    var el = sh.el, q = function (s) { return $(s, el); }, off = null;

    /* ----- pieces of the screen ----- */
    function recorderHTML() {
      return '<div class="recp"><div class="meter" aria-hidden="true"><i id="vsMeter"></i></div>' +
        '<div class="rec-row"><span class="rtime num" id="vsTime" aria-live="off">0:00</span><button type="button" class="btn recb" id="vsRecBtn" data-do="rec">' + U.I.rec + " <span>Record</span></button></div>" +
        '<div class="count" id="vsCount" hidden aria-hidden="true"></div>' +
        '<label class="chk"><input type="checkbox" id="vsCin"' + (S.st.settings.countIn ? " checked" : "") + '> <span>3-2-1 count-in before recording</span></label>' +
        '<p class="mute small-note">Hold the phone a hand\'s width from your mouth and say it clearly, like "Now batting, number 7, Player Seven." Stop when you are done. Silence at the start and end is trimmed for you.</p>' +
        '<p class="errmsg" id="vsRecMsg" role="alert" hidden></p></div>';
    }
    function sourceHTML(hasOld) {
      return '<div class="or"><span>or</span></div><div class="stack">' +
        U.fileBtn({ text: "Use a voice file", cls: "ghost block", attr: 'data-file="voice-file" data-pid="' + pid + '"', label: "Choose a voice file" }) +
        '<button type="button" class="btn ghost block" data-do="tts"><span>Use the computer voice</span><small>Second choice</small></button></div>' +
        '<p class="mute small-note">The computer voice is your phone reading "' + esc(C.announceText(pl)) + '". It can\'t be polished with EQ or reverb. A recorded voice sounds much better.</p>';
    }
    function polishHTML(v) {
      var p = C.sanitizePolish(v.polish), pre = C.presetOf(p), h = '<section class="card polish" id="vsPolish"><div class="row sp"><h3>Polish</h3><div class="seg ab" role="group" aria-label="Listen to"><button type="button" data-do="ab" data-v="polished" aria-pressed="' + (st.ab === "polished") + '">Polished</button><button type="button" data-do="ab" data-v="original" aria-pressed="' + (st.ab === "original") + '">Original</button></div></div>';
      h += '<div class="row"><button type="button" class="btn grow" id="vsPlay" data-do="play">' + U.I.play + " <span>Play</span></button></div>" +
        '<p class="mute small-note" id="vsState" role="status">&nbsp;</p>';
      h += '<div class="label">Sound</div><div class="pills" role="group" aria-label="Sound presets">' + C.EQ_PRESETS.map(function (x) { return '<button type="button" class="pill" data-do="preset" data-v="' + x.id + '" aria-pressed="' + (pre === x.id) + '">' + x.label + "</button>"; }).join("") + (pre === "custom" ? '<span class="chip">Custom</span>' : "") + "</div>";
      h += '<label class="chk"><input type="checkbox" data-tg="hp"' + (p.hp ? " checked" : "") + "> <span>Cut rumble (high-pass)</span></label>" + U.range({ key: "hpf", label: "Rumble cut below", min: 60, max: 200, step: 5, value: p.hpf, text: p.hpf + " Hz" });
      h += '<div class="label">Equalizer</div>';
      for (var i = 0; i < 5; i++) h += U.range({ key: "eq" + i, label: EQ_LABELS[i], min: -12, max: 12, step: 1, value: p.eq[i], text: (p.eq[i] > 0 ? "+" : "") + p.eq[i] + " dB" });
      h += '<div class="label">Compressor</div><div class="seg" role="group" aria-label="Compressor">' + C.COMP_IDS.map(function (id) { return '<button type="button" data-do="comp" data-v="' + id + '" aria-pressed="' + (p.comp === id) + '">' + (id === "off" ? "Off" : id === "light" ? "Light" : "Strong") + "</button>"; }).join("") + "</div>";
      h += '<div class="label">Room reverb</div><div class="seg" role="group" aria-label="Room size">' + C.REVERB_IDS.map(function (id) { return '<button type="button" data-do="room" data-v="' + id + '" aria-pressed="' + (p.size === id) + '">' + C.REVERB[id].label + "</button>"; }).join("") + "</div>" +
        U.range({ key: "wet", label: "Room amount (0 = off)", min: 0, max: 100, step: 1, value: p.wet, text: p.wet + "%" });
      h += U.range({ key: "out", label: "Output level", min: -12, max: 12, step: 1, value: p.out, text: (p.out > 0 ? "+" : "") + p.out + " dB" });
      h += '<div class="stack top"><button type="button" class="btn ghost block" data-do="load-ann">Use my announcer sound</button><button type="button" class="btn ghost block" data-do="save-ann">Save as my announcer sound</button><button type="button" class="btn ghost block" data-do="all">Use this sound for ALL voices</button></div></section>';
      return h;
    }
    function detailHTML(v) {
      var kept = v.te - v.ts, trimmed = v.ts > 0.001 || v.te < v.dur - 0.001;
      return '<section class="card" id="vsDetail"><div class="row sp"><div><b>' + esc(v.kind === "rec" ? "Recorded voice" : "Voice file") + '</b><small class="block mute">' + esc(v.name) + " · " + C.fmtSecs(v.dur) + " · " + C.fmtSize(v.size) + "</small></div></div>" +
        '<canvas class="vwave" id="vsWave" role="img" aria-label="Waveform of the voice. The kept part is bright."></canvas>' +
        '<p class="mute small-note" id="vsKept">' + (trimmed ? "Keeping " + C.fmtClock(v.ts, true) + " to " + C.fmtClock(v.te, true) + " (" + C.fmtSecs(kept) + " of " + C.fmtSecs(v.dur) + "). The rest is only hidden." : "Keeping the whole recording (" + C.fmtSecs(v.dur) + ").") + "</p>" +
        U.range({ key: "thr", label: "Silence threshold", min: -70, max: -20, step: 1, value: v.thr, text: v.thr + " dB" }) +
        '<div class="row wrap"><button type="button" class="btn ghost small" data-do="autotrim">Auto-trim silence</button><button type="button" class="btn ghost small" data-do="untrim"' + (trimmed ? "" : " disabled") + ">Undo trim</button></div>" +
        '<label class="chk"><input type="checkbox" data-tg="norm"' + (v.norm ? " checked" : "") + "> <span>Normalize (loudest point to -1 dBFS)</span></label>" +
        '<div class="row wrap"><button type="button" class="btn ghost small" data-do="rerecord">' + U.I.mic + " Re-record</button>" +
        U.fileBtn({ text: "Replace with a file", cls: "ghost small", attr: 'data-file="voice-file" data-pid="' + pid + '"', label: "Replace with a voice file" }) +
        '<button type="button" class="btn danger small" data-do="delete">Delete voice</button></div></section>';
    }
    function ttsHTML() {
      return '<section class="card"><div><b>Computer voice</b> <span class="chip warn">Second choice</span></div><p class="msg">Your phone will say: <b>"' + esc(C.announceText(pl)) + '"</b></p>' +
        '<p class="mute small-note">The computer voice is spoken by your phone. It can\'t use EQ or reverb, and the timeline shows an estimated length. Record a voice for the full sound.</p>' +
        '<div class="row wrap"><button type="button" class="btn ghost small" data-do="tts-test">' + U.I.play + ' Test it</button><button type="button" class="btn ghost small" data-do="rerecord">' + U.I.mic + ' Record a voice instead</button><button type="button" class="btn danger small" data-do="delete">Remove</button></div></section>';
    }
    function paint() {
      var v = pl.voice, h = "", hasRec = v && v.kind !== "tts";
      if (!v || st.rerecord) {
        h += '<section class="card"><h3>' + (v && v.kind !== "tts" ? "Record again" : "Record the announcement") + "</h3>" + recorderHTML() + "</section>" + sourceHTML() + (st.rerecord ? '<button type="button" class="btn ghost block top" data-do="cancel-rerec">Cancel</button>' : "");
        if (hasRec && !st.rerecord) h = "";
      }
      if (v && !st.rerecord) h += (hasRec ? detailHTML(v) + polishHTML(v) : ttsHTML());
      else if (v && hasRec && st.rerecord) h += '<p class="mute small-note">Your current voice stays until the new take is saved.</p>';
      sh.body.innerHTML = h;
      st.rawErr = "";
      if (v && hasRec && !st.rerecord) loadRaw(v);
      if (v && hasRec && !st.rerecord) scheduleRender(0);
      if (!v || st.rerecord) meterLoop();
    }

    /* ----- the waveform of the voice ----- */
    function loadRaw(v) {
      var tok = ++st.token;
      st.raw = null;
      E.voiceRaw(v).then(function (raw) {
        if (st.closed || tok !== st.token) return;
        st.raw = raw;
        var cv = q("#vsWave"); if (!cv) return;
        return E.peaksAsync(raw, Math.max(30, Math.floor((cv.clientWidth || 300) / 3)), 0, raw.duration, function () { return st.closed || tok !== st.token; }).then(function (p) { st.peaks = p; drawWave(); });
      }).catch(function (e) {
        if (st.closed || tok !== st.token) return;
        st.rawErr = e && e.kind === "missing" ? "This voice's file isn't on this phone. Record again or choose a voice file." : "Couldn't read this voice.";
        var s = q("#vsState"); if (s) s.textContent = st.rawErr;
        var k = q("#vsKept"); if (k && e && e.kind === "missing") k.textContent = st.rawErr;
      });
    }
    function drawWave() {
      var cv = q("#vsWave"), v = pl.voice; if (!cv || !st.peaks || !st.raw || !v) return;
      U.drawWave(cv, { peaks: st.peaks, v0: 0, v1: st.raw.duration, s0: v.ts, s1: v.te });
    }
    function refreshDetail() {
      var d = q("#vsDetail"); if (!d || !pl.voice) return;
      var v = pl.voice, trimmed = v.ts > 0.001 || v.te < v.dur - 0.001, kept = v.te - v.ts;
      q("#vsKept").textContent = trimmed ? "Keeping " + C.fmtClock(v.ts, true) + " to " + C.fmtClock(v.te, true) + " (" + C.fmtSecs(kept) + " of " + C.fmtSecs(v.dur) + "). The rest is only hidden." : "Keeping the whole recording (" + C.fmtSecs(v.dur) + ").";
      var u = q('[data-do="untrim"]'); if (u) u.disabled = !trimmed;
      drawWave();
    }

    /* ----- rendering the polished sound ----- */
    function setState(t) { var s = q("#vsState"); if (s) s.textContent = t || " "; }
    function scheduleRender(ms) {
      clearTimeout(st.renderTimer);
      var v = pl.voice; if (!v || v.kind === "tts") return;
      st.rendering = "pending"; setState("Polishing...");
      st.renderTimer = setTimeout(function () {
        var tok = ++st.rtok;
        E.renderVoice(v).then(function (r) {
          if (st.closed || tok !== st.rtok) return;
          st.rendering = ""; setState("Ready. " + C.fmtSecs(r.speech) + " of voice" + (r.total - r.speech > 0.1 ? " plus " + C.fmtSecs(r.total - r.speech) + " of room" : "") + ".");
        }).catch(function (e) {
          if (st.closed || tok !== st.rtok) return;
          st.rendering = "";
          setState(e && e.kind === "missing" ? "This voice's file isn't on this phone." : e && e.kind === "noaudio" ? "This browser can't process audio." : "Couldn't process this voice.");
        });
      }, ms == null ? 250 : ms);
    }
    function polishChanged() { WU.save(); scheduleRender(); stopPlay(); }

    /* ----- playing it back ----- */
    function paintPlay() {
      var b = q("#vsPlay"); if (!b) return;
      b.innerHTML = (st.preview ? U.I.stop : U.I.play) + " <span>" + (st.preview ? "Stop" : "Play") + "</span>";
    }
    function stopPlay() { var p = E.playing(); if (p && p.key === "voice") E.stop(0.05); st.preview = false; paintPlay(); }
    async function play() {
      var v = pl.voice; if (!v || v.kind === "tts") return;
      if (st.preview) { stopPlay(); return; }
      E.unlock();
      try {
        if (st.ab === "polished") {
          var r = await E.renderVoice(v); if (st.closed) return;
          E.playSimple(r.buf, { offset: 0, duration: r.buf.duration, fade: 0, key: "voice", onEnd: function () { st.preview = false; paintPlay(); } });
        } else {
          var raw = await E.voiceRaw(v); if (st.closed) return;
          var g = v.norm ? C.normalizeGain(rawPeak(raw, v)) : 1;
          E.playSimple(raw, { offset: v.ts, duration: Math.max(0.1, v.te - v.ts), fade: 0, gain: Math.min(g, 8), key: "voice", onEnd: function () { st.preview = false; paintPlay(); } });
        }
        st.preview = true; paintPlay();
      } catch (e) { U.toast(e && e.kind === "missing" ? "This voice's file isn't on this phone." : "Couldn't play this voice.", "error"); }
    }
    function rawPeak(raw, v) {
      var m = 0, a = Math.floor(v.ts * raw.sampleRate), b = Math.min(raw.length, Math.ceil(v.te * raw.sampleRate));
      for (var c = 0; c < raw.numberOfChannels; c++) { var d = raw.getChannelData(c); for (var i = a; i < b; i++) { var x = d[i] < 0 ? -d[i] : d[i]; if (x > m) m = x; } }
      return m;
    }

    /* ----- recording ----- */
    function meterLoop() {
      cancelAnimationFrame(st.raf);
      var m = q("#vsMeter"), t = q("#vsTime");
      if (!m) return;
      var lvl = E.rec.active() ? E.rec.level() : 0;
      m.style.width = Math.round(Math.pow(lvl, 0.5) * 100) + "%";
      m.className = lvl > 0.97 ? "hot" : lvl > 0.05 ? "good" : "";
      if (t && st.rec) t.textContent = C.fmtClock(E.rec.seconds());
      st.raf = requestAnimationFrame(meterLoop);
    }
    function recMsg(t) { var m = q("#vsRecMsg"); if (m) { m.textContent = t || ""; m.hidden = !t; } }
    function paintRec() {
      var b = q("#vsRecBtn"); if (!b) return;
      b.innerHTML = (st.rec ? U.I.stop : U.I.rec) + " <span>" + (st.rec ? "Stop" : st.counting ? "Cancel" : "Record") + "</span>";
      b.classList.toggle("on", st.rec);
    }
    async function recToggle() {
      if (st.rec) return stopRec();
      if (st.counting) { st.cancelCount = true; return; }
      recMsg("");
      if (!E.rec.supported()) { recMsg(window.isSecureContext === false ? "Recording needs a secure page (https). Open Walk-Up from its web address instead of from a file." : "This browser can't record from the microphone. Use a voice file instead."); return; }
      E.unlock();
      try { await E.rec.open(); } catch (e) { recMsg(E.rec.explain(e)); return; }
      if (st.closed) { E.rec.cancel(); return; }
      var cin = q("#vsCin"), useCount = cin && cin.checked;
      S.st.settings.countIn = !!useCount; WU.save();
      if (useCount) {
        st.counting = true; st.cancelCount = false; paintRec();
        var c = q("#vsCount"); c.hidden = false;
        for (var n = 3; n >= 1 && !st.cancelCount && !st.closed; n--) { c.textContent = n; E.tone(n === 1 ? 880 : 660, 0.12); await sleep(800); }
        c.hidden = true; st.counting = false;
        if (st.cancelCount || st.closed) { E.rec.cancel(); st.cancelCount = false; paintRec(); return; }
      }
      try { E.rec.begin(); } catch (e) { E.rec.cancel(); recMsg("The microphone didn't start. You can use a voice file instead."); paintRec(); return; }
      st.rec = true; paintRec();
      st.recTimer = setTimeout(function () { if (st.rec) stopRec(); }, C.LIM.maxVoiceSec * 1000);
    }
    async function stopRec() {
      if (!st.rec) return;
      st.rec = false; clearTimeout(st.recTimer); paintRec();
      var take;
      try { take = await E.rec.stop(); } catch (e) { recMsg("Nothing was recorded. Try again."); return; }
      var busy = U.busy("Saving your recording...");
      try {
        var buf = await E.decode(take.blob);
        await V.adopt(pl, take.blob, "rec", "Recording " + C.fmtClock(buf.duration, true), buf);
        st.rerecord = false; st.ab = "polished";
        busy.done();
        if (!st.closed) paint();
        U.toast("Voice saved.", "ok");
      } catch (e) {
        busy.done();
        recMsg(e && e.plain ? e.plain : e && e.kind === "decode" ? "This browser couldn't read the recording. Use a voice file instead." : "Couldn't save the recording.");
      }
    }
    WU.onFile["voice-file"] = async function (files, input) {
      var f = files[0], pid2 = input.dataset.pid;
      if (!f || pid2 !== pid || st.closed) return;
      if (f.size > C.LIM.maxSongBytes) return U.toast("That file is too big for a voice. Use a short recording.", "error");
      var busy = U.busy("Reading the voice file...");
      try {
        var buf = await E.decode(f);
        await V.adopt(pl, f, "file", C.str(f.name, C.LIM.file), buf);
        st.rerecord = false; busy.done();
        if (!st.closed) paint();
        U.toast("Voice saved.", "ok");
      } catch (e) {
        busy.done();
        U.toast(e && e.plain ? e.plain : e && e.kind === "decode" ? "This phone couldn't read that file. Try an MP3, M4A or WAV." : "Couldn't use that file.", "error", 7000);
      }
    };

    /* ----- clicks ----- */
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b || b.disabled) return;
      var a = b.dataset.do, v = pl.voice;
      if (a === "rec") recToggle();
      else if (a === "tts") { stopPlay(); if (v && v.kind !== "tts") WU.dropAudio("v:" + v.id); pl.voice = C.defaultVoice("tts", {}, null); WU.commit("data"); st.rerecord = false; paint(); }
      else if (a === "tts-test") {
        E.unlock(); var cancel = E.speech.speak(C.announceText(pl), WU.speechOpts(), function () {});
        if (!E.speech.supported()) U.toast("This browser can't speak. Record a voice instead.", "error");
        void cancel;
      }
      else if (a === "rerecord") { st.rerecord = true; stopPlay(); paint(); }
      else if (a === "cancel-rerec") { st.rerecord = false; if (E.rec.active()) E.rec.cancel(); st.rec = false; st.counting = false; st.cancelCount = true; paint(); }
      else if (a === "play") play();
      else if (a === "ab") { st.ab = b.dataset.v; $$('[data-do="ab"]', el).forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === st.ab)); }); if (st.preview) { stopPlay(); play(); } }
      else if (a === "autotrim" && v && st.raw) { V.autoTrim(v, st.raw); WU.save(); refreshDetail(); scheduleRender(); stopPlay(); }
      else if (a === "untrim" && v) { v.ts = 0; v.te = v.dur; WU.save(); refreshDetail(); scheduleRender(); stopPlay(); }
      else if (a === "delete") {
        U.confirm({ title: "Delete this voice?", message: "The voice for " + (pl.name || "this player") + " will be removed from this phone.", confirmText: "Delete voice", danger: true, onConfirm: function () {
          stopPlay(); if (v && v.kind !== "tts") WU.dropAudio("v:" + v.id); pl.voice = null; st.rerecord = false; WU.commit("data"); paint();
        } });
      } else if (v && v.kind !== "tts") {
        var p = C.sanitizePolish(v.polish);
        if (a === "preset") { v.polish = C.applyPreset(p, b.dataset.v); WU.save(); repaintPolish(); polishChanged(); }
        else if (a === "comp") { p.comp = b.dataset.v; v.polish = C.sanitizePolish(p); repaintPolish(); polishChanged(); }
        else if (a === "room") { p.size = b.dataset.v; if (p.wet === 0) p.wet = 20; v.polish = C.sanitizePolish(p); repaintPolish(); polishChanged(); }
        else if (a === "load-ann") { v.polish = C.sanitizePolish(S.st.announcer); repaintPolish(); polishChanged(); U.toast("Loaded your announcer sound.", "ok"); }
        else if (a === "save-ann") { S.st.announcer = C.sanitizePolish(v.polish); WU.save(); U.toast("Saved as your announcer sound. New recordings start with it.", "ok"); }
        else if (a === "all") {
          var n = S.st.roster.filter(function (x) { return x.voice && x.voice.kind !== "tts"; }).length;
          U.confirm({ title: "Use this sound for all voices?", message: "The EQ, compressor and room of this voice will be copied to " + n + (n === 1 ? " voice" : " voices") + ", and saved as your announcer sound.", more: ["Each voice keeps its own recording, trim and level."], confirmText: "Use for all", onConfirm: function () {
            var snap = C.sanitizePolish(v.polish);
            S.st.roster.forEach(function (x) { if (x.voice && x.voice.kind !== "tts") x.voice.polish = C.sanitizePolish(snap); });
            S.st.announcer = C.clone(snap); WU.commit("data"); U.toast("Applied to " + n + (n === 1 ? " voice." : " voices."), "ok");
          } });
        }
      }
    });
    function repaintPolish() {
      var v = pl.voice, old = q("#vsPolish"); if (!old || !v) return;
      var tmp = document.createElement("div"); tmp.innerHTML = polishHTML(v);
      old.replaceWith(tmp.firstChild); paintPlay();
    }
    el.addEventListener("change", function (e) {
      var t = e.target, v = pl.voice; if (!v || !t.dataset) return;
      if (t.dataset.tg === "hp") { var p = C.sanitizePolish(v.polish); p.hp = t.checked; v.polish = p; polishChanged(); }
      else if (t.dataset.tg === "norm") { v.norm = t.checked; polishChanged(); }
    });
    U.bindControls(el, function (key, mode, val) {
      var v = pl.voice; if (!v || !isFinite(val)) return;
      var p = C.sanitizePolish(v.polish), txt = "";
      if (key === "thr") {
        v.thr = C.int(val, -70, -20, -45); txt = v.thr + " dB"; U.setVal(el, "thr", txt);
        if (st.raw) { V.autoTrim(v, st.raw); refreshDetail(); }
        WU.save(); scheduleRender(); stopPlay(); return;
      }
      if (key === "hpf") { p.hpf = val; txt = C.sanitizePolish(p).hpf + " Hz"; }
      else if (key === "wet") { p.wet = val; txt = C.sanitizePolish(p).wet + "%"; }
      else if (key === "out") { p.out = val; var o = C.sanitizePolish(p).out; txt = (o > 0 ? "+" : "") + o + " dB"; }
      else if (/^eq[0-4]$/.test(key)) { var i = +key.slice(2); p.eq[i] = val; var d = C.sanitizePolish(p).eq[i]; txt = (d > 0 ? "+" : "") + d + " dB"; }
      else return;
      v.polish = C.sanitizePolish(p); U.setVal(el, key, txt);
      // keep the preset pills honest without rebuilding the sliders being dragged
      var pre = C.presetOf(v.polish); $$('[data-do="preset"]', el).forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === pre)); });
      polishChanged();
    });
    off = WU.on(function (what) { if (what === "audio" && st.preview && !E.playing()) { st.preview = false; paintPlay(); } });
    paint();
    return sh;
  };
})();
