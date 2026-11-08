/* Walk-Up mixer: the timeline picture and the "Mix" sheet. The top of the sheet is the simple part (readout, voice-start nudges,
   five-stop relative volume, soften-under-voice) on its first tab; the fine controls (timing, balance scrubber and volumes, ducking depth, music length) are one short tab each,
   so the sheet fits a phone with no scrolling.
   Everything here edits the player's mix settings; what plays is always built from core.mixPlan. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var NS = "http://www.w3.org/2000/svg";
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 6v12L2.5 12zM21 6v12l-8.5-6z"/></svg>';
  var ICON_FWD = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 6v12l8.5-6zM3 6v12l8.5-6z"/></svg>';

  /* ---------- the timeline picture ---------- */
  var TL = { W: 340, H: 132, L: 12, R: 12, MY: 20, MH: 34, VY: 62, VH: 30, AX: 104 };
  var TLC = { W: 340, H: 100, L: 12, R: 12, MY: 14, MH: 28, VY: 46, VH: 26, AX: 80 }; /* same width and margins (so dragging maps the same), less height: the Mix sheet has to fit a phone without scrolling */
  function axisStep(T) { return T <= 8 ? 1 : T <= 20 ? 2 : T <= 50 ? 5 : 10; }
  /* Returns svg markup for a plan. o.T fixes the length of the time axis (used while dragging). */
  WU.timeline = function (plan, o) {
    o = o || {}; var G = o.compact ? TLC : TL;
    var T = o.T || Math.max(4, plan.total * 1.04), iw = G.W - G.L - G.R, X = function (t) { return +(G.L + Math.max(0, Math.min(T, t)) / T * iw).toFixed(2); };
    var music = null, voice = null, i;
    plan.tracks.forEach(function (t) { if (t.track === "music") music = t; else voice = t; });
    var h = '<svg class="tl" viewBox="0 0 ' + G.W + " " + G.H + '" role="img" aria-label="' + esc(o.label || "Mix timeline") + '" preserveAspectRatio="xMidYMid meet">';
    h += '<rect x="0" y="0" width="' + G.W + '" height="' + G.H + '" rx="10" class="tl-bg"/>';
    var step = axisStep(T);
    for (i = 0; i * step <= T + 1e-6; i++) {
      var gx = X(i * step);
      h += '<line x1="' + gx + '" y1="' + (G.MY - 6) + '" x2="' + gx + '" y2="' + G.AX + '" class="tl-grid"/><text x="' + gx + '" y="' + (G.AX + 14) + '" class="tl-tick" text-anchor="middle">' + (i * step) + "s</text>";
    }
    h += '<line x1="' + G.L + '" y1="' + G.AX + '" x2="' + (G.W - G.R) + '" y2="' + G.AX + '" class="tl-axis"/>';
    if (music) {
      var g = plan.gains.music, ht = G.MH * (0.3 + 0.7 * Math.min(1, g)), yb = G.MY + G.MH, yt = yb - ht;
      var x0 = X(music.when), x1 = X(music.when + music.duration), pts = music.gainPoints, fs = pts.length > 3 ? pts[2][0] : music.when + music.duration, xf = X(fs);
      h += '<polygon class="tl-music" points="' + x0 + "," + yb + " " + x0 + "," + yt + " " + xf + "," + yt + " " + x1 + "," + yb + '"/>';
      if (music.duckPoints && music.duckPoints.length) {
        var dp = music.duckPoints.filter(function (p) { return p[0] <= music.when + music.duration; }), d = [];
        // the part of the music taken away by ducking: between the top edge and the lowered level
        dp.forEach(function (p) { var px = Math.max(x0, Math.min(x1, X(p[0]))); d.push(px + "," + (yt + ht * (1 - p[1]))); });
        if (d.length) {
          var first = Math.max(x0, Math.min(x1, X(dp[0][0]))), last = Math.max(x0, Math.min(x1, X(dp[dp.length - 1][0])));
          h += '<polygon class="tl-duck" points="' + first + "," + yt + " " + d.join(" ") + " " + last + "," + yt + '"/>';
        }
      }
      h += '<text x="' + (x0 + 5) + '" y="' + (G.MY + 13) + '" class="tl-lbl">Music</text>';
    } else h += '<text x="' + (G.L + 4) + '" y="' + (G.MY + 20) + '" class="tl-none">No song</text>';
    if (voice) {
      var vx0 = X(voice.when), vx1 = X(voice.when + voice.duration), vw = Math.max(6, vx1 - vx0), hit = "";
      if (o.interactive) { var hw = Math.max(vw + 8, 72), hh = Math.max(G.VH + 28, 72), hx = Math.max(2, Math.min(vx0 - 4, G.W - 2 - hw)), hy = Math.max(0, Math.min(G.H - hh, G.VY + G.VH / 2 - hh / 2)); hit = '<rect class="tl-hit" x="' + hx + '" y="' + hy + '" width="' + hw + '" height="' + hh + '"/>'; } /* a finger-sized place to grab, even when the voice bar is short */
      h += '<g class="tl-vg" id="tlVoice"' + (o.interactive ? ' tabindex="0" role="slider" aria-label="When the voice starts" aria-valuemin="0" aria-valuemax="20" aria-valuenow="' + voice.when + '" aria-valuetext="' + voice.when.toFixed(1) + ' seconds"' : "") + '><rect x="' + vx0 + '" y="' + G.VY + '" width="' + vw + '" height="' + G.VH + '" rx="6" class="tl-voice' + (voice.tts ? " est" : "") + '"/>' +
        '<text x="' + (vx0 + 5) + '" y="' + (G.VY + 19) + '" class="tl-lbl dark">' + (voice.tts ? "Voice (est.)" : "Voice") + "</text>" + (o.interactive ? '<rect x="' + (vx0 - 3) + '" y="' + (G.VY - 3) + '" width="6" height="' + (G.VH + 6) + '" rx="3" class="tl-grab"/>' : "") + hit + "</g>";
    } else h += '<text x="' + (G.L + 4) + '" y="' + (G.VY + 20) + '" class="tl-none">No voice</text>';
    h += '<line id="tlHead" class="tl-head" x1="' + G.L + '" y1="' + (G.MY - 8) + '" x2="' + G.L + '" y2="' + G.AX + '" style="display:none"/></svg>';
    return h;
  };
  WU.timelineMeta = function (plan, T) { return { T: T || Math.max(4, plan.total * 1.04), iw: TL.W - TL.L - TL.R, L: TL.L, W: TL.W }; };
  WU.timelineLabel = function (pl, plan) {
    var m = C.sanitizeMix(pl.mix), parts = [];
    plan.tracks.forEach(function (t) { parts.push((t.track === "music" ? "Music" : "Voice") + " from " + t.when.toFixed(1) + " to " + (t.when + t.duration).toFixed(1) + " seconds"); });
    if (m.duck && plan.tracks.some(function (t) { return t.duckPoints; })) parts.push("music ducks " + m.dd + " dB under the voice");
    return "Timeline. " + (parts.join(". ") || "Nothing to play yet") + ". Total " + plan.total.toFixed(1) + " seconds.";
  };
  WU.mixSummary = function (pl) {
    var plan = E.planFor(pl, S.st), m = C.sanitizeMix(pl.mix);
    if (!plan.tracks.length) return "Nothing to mix yet.";
    return "Total " + C.fmtSecs(plan.total) + (pl.voice ? " · voice starts at " + C.fmtSecs(m.vd) : "") + (plan.tracks.some(function (t) { return t.duckPoints; }) ? " · music ducks " + m.dd + " dB" : "");
  };
  /* run a playhead across an svg inside `wrap` while the mix with `key` plays */
  WU.timelineHead = function (wrap, key, T) {
    var meta = WU.timelineMeta({ total: 0 }, T), raf = 0, stopped = false;
    function loop() {
      if (stopped) return;
      var head = $("#tlHead", wrap), p = E.playing();
      if (!head) { raf = requestAnimationFrame(loop); return; }
      if (!p || p.key !== key) { head.style.display = "none"; return; }
      var x = meta.L + Math.min(meta.T, p.elapsed) / meta.T * meta.iw;
      head.setAttribute("x1", x.toFixed(2)); head.setAttribute("x2", x.toFixed(2)); head.style.display = "";
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return function () { stopped = true; cancelAnimationFrame(raf); };
  };

  /* ---------- the Mix sheet ---------- */
  WU.openMix = function (pid) {
    var pl = WU.player(pid); if (!pl) return null;
    var st = { closed: false, T: 0, stopHead: null, drag: null, prev: false, tab: "mix" }, off = null;
    var sh = U.openSheet({
      title: "Mix: " + (pl.name || "player"), cls: "mix", html: "", footer: '<button type="button" class="btn" id="mxPrev" data-st="play">' + U.I.play + " <span>Preview</span></button>" + '<button type="button" class="btn ghost" data-close>Done</button>',
      onClose: function () {
        st.closed = true; stopHold(); if (st.stopHead) st.stopHead(); if (off) off();
        var p = E.playing(); if (p && p.key === "mix") E.stop(0.1);
        WU.emit("data"); if (WU.warm) WU.warm();
      }
    });
    var el = sh.el, q = function (s) { return $(s, el); };
    var song = function () { return pl.songId ? WU.song(pl.songId) : null; };

    /* The five-stop "Relative volume" slider: one tap or drag instead of a scrubber. The numbers are the balance
       values behind each stop; none of them silences either side (the fine slider on the Levels tab still goes to the ends). */
    var REL = [-70, -35, 0, 35, 70], REL_NAMES = ["Loudest music", "Louder music", "Even", "Louder voice", "Loudest voice"];
    function relIndex(bal) { var best = 2, d = 1e9; REL.forEach(function (v, i) { var x = Math.abs(v - bal); if (x < d) { d = x; best = i; } }); return best; }

    var TABS = [["mix", "Mix"], ["timing", "Timing"], ["levels", "Levels"], ["soften", "Soften"], ["music", "Music"]];
    function panel(k, inner) { return '<div class="mx-panel" role="tabpanel" id="mxP-' + k + '" aria-labelledby="mxT-' + k + '" data-panel="' + k + '"' + (st.tab === k ? "" : " hidden") + ">" + inner + "</div>"; }
    function setTab(k, focus) {
      st.tab = k;
      $$(".mx-tabs [data-tab]", el).forEach(function (b) { var on = b.dataset.tab === k; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      $$(".mx-panel", el).forEach(function (p) { p.hidden = p.dataset.panel !== k; });
    }
    /* The sheet is a picture and a row of readouts that always show, then one short tab at a time, so nothing needs scrolling on a phone. */
    function build() {
      var m = C.sanitizeMix(pl.mix), sg = song(), tr = sg ? C.effectiveTrim(pl, sg) : null, both = !!(pl.voice && sg);
      var h = '<div class="tlwrap" id="mxTl"></div><div class="mx-read" id="mxRead"></div><div class="mx-tot"><b id="mxTotal"></b><span class="mute" id="mxNote"></span></div>';
      h += '<div class="mx-tabs" role="tablist" aria-label="Mix controls">' + TABS.map(function (t) { var on = st.tab === t[0]; return '<button type="button" role="tab" id="mxT-' + t[0] + '" aria-controls="mxP-' + t[0] + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + '</div><div class="mx-panels">';
      var mixIn = "";
      if (pl.voice) mixIn += '<div class="mx-nudge"><button type="button" class="btn ghost" data-nudge="-0.1" aria-label="Start the voice 0.1 seconds earlier. Hold to keep going.">' + ICON_BACK + '</button><div class="mx-vd"><small>Voice starts at</small><b id="mxVd"></b></div><button type="button" class="btn ghost" data-nudge="0.1" aria-label="Start the voice 0.1 seconds later. Hold to keep going.">' + ICON_FWD + "</button></div>";
      if (both) {
        mixIn += '<div class="mx-rel"><div class="mx-h">Relative volume</div><input type="range" class="rng rel" id="mxRel" min="0" max="4" step="1" value="' + relIndex(m.bal) + '" aria-label="Relative volume of the music and the voice">' +
          '<div class="rel-lbls" id="mxRelL">' + REL_NAMES.map(function (n, i) { return '<button type="button" data-rel="' + i + '">' + n.replace(" ", "<br>") + "</button>"; }).join("") + "</div>" +
          '<p class="mute small-note" id="mxRelNote" hidden></p></div>' +
          '<div class="row sp mx-soft"><span class="mx-h">Soften music during voice</span><label class="sw"><input type="checkbox" data-tg="duck"' + (m.duck ? " checked" : "") + ' aria-label="Soften the music while the voice talks"><span class="knob"></span></label></div>';
      } else mixIn += '<p class="mute small-note">' + (pl.voice ? "This player has no song yet. Close this sheet and tap Change song to set the volume between music and voice." : "This player has no voice yet, so there is nothing to balance.") + "</p>";
      h += panel("mix", mixIn);
      h += panel("timing",
        U.stepper({ key: "vd", label: "Voice starts at", value: m.vd.toFixed(1), min: 0, max: 20, step: 0.1, coarse: 1, slider: true }) +
        U.stepper({ key: "md", label: "Music starts at", value: m.md.toFixed(1), min: 0, max: 20, step: 0.1, coarse: 1, slider: true }) +
        '<p class="mute small-note">Seconds after Play, 0 to 20.</p>');
      h += panel("levels",
        '<div class="bal-ends"><span>Music louder</span><span>Voice louder</span></div>' +
        '<input type="range" class="rng bal" id="mxBal" data-key="bal" min="-100" max="100" step="1" value="' + m.bal + '" aria-label="Balance between music and voice. Left is music louder, right is voice louder.">' +
        '<div class="row sp"><span class="lvl" id="mxLM"></span><button type="button" class="btn ghost small" data-do="center">Center</button><span class="lvl" id="mxLV"></span></div>' +
        U.range({ key: "mv", label: "Music volume", min: 0, max: 100, step: 1, value: m.mv, text: m.mv + "%" }) +
        U.range({ key: "vv", label: "Voice volume", min: 0, max: 100, step: 1, value: m.vv, text: m.vv + "%" }) +
        '<p class="mute small-note">Volumes stop at 100% so nothing distorts.</p>');
      h += panel("soften",
        '<p class="mute" id="mxDuckOff"' + (both && m.duck ? " hidden" : "") + ">" + (both ? "Soften is off. Turn it on in the Mix tab." : "Soften needs a voice and a song.") + "</p>" +
        '<div id="mxDuck"' + (both && m.duck ? "" : " hidden") + ">" +
        U.range({ key: "dd", label: "How much quieter", min: 0, max: 18, step: 1, value: m.dd, text: "-" + m.dd + " dB" }) +
        U.range({ key: "da", label: "Dips in over", min: 0.05, max: 0.5, step: 0.05, value: m.da, text: m.da.toFixed(2) + " s" }) +
        U.range({ key: "dr", label: "Comes back over", min: 0.05, max: 0.5, step: 0.05, value: m.dr, text: m.dr.toFixed(2) + " s" }) + "</div>");
      h += panel("music", sg && tr ?
        U.stepper({ key: "len", label: "Music plays for", value: tr.len.toFixed(1), min: 1, max: 30, step: 0.1, coarse: 1, slider: true }) +
        U.stepper({ key: "fade", label: "Fade out", value: tr.fade.toFixed(1), min: 0, max: 3, step: 0.1 }) +
        '<p class="mute small-note">Seconds of the song, 1 to 30. Starts at ' + C.fmtClock(tr.start, true) + " in the song" + (pl.trim ? " (this player's own trim)" : "") + '.</p><div class="row wrap"><button type="button" class="btn ghost small" data-do="trim">Trim with the waveform</button>' + (pl.trim ? '<button type="button" class="btn ghost small" data-do="untrim">Use the song\'s trim</button>' : "") + "</div>"
        : '<p class="mute">This player has no song. Close this sheet and tap Change song.</p>');
      sh.body.innerHTML = h + "</div>";
      redraw();
    }
    /* what the plan says, in plain words, under the picture: "Music 0.0 - 10.0 s" and "Voice 1.0 - 3.2 s" */
    function paintRead(plan) {
      var rd = q("#mxRead"), t = {};
      plan.tracks.forEach(function (x) { t[x.track] = x; });
      var line = function (cls, name, x, note) { return x ? '<div class="' + cls + '">' + name + " <b>" + x.when.toFixed(1) + " &ndash; " + (x.when + x.duration).toFixed(1) + " s</b>" + (note || "") + "</div>" : ""; };
      rd.innerHTML = line("rd-m", "Music", t.music) + line("rd-v", "Voice", t.voice, t.voice && t.voice.tts ? " (estimated)" : "");
      var vd = q("#mxVd"); if (vd) vd.textContent = C.sanitizeMix(pl.mix).vd.toFixed(1) + " s";
    }
    function paintRel() {
      var r = q("#mxRel"); if (!r) return;
      var bal = C.sanitizeMix(pl.mix).bal, i = relIndex(bal), exact = REL[i] === bal;
      if (document.activeElement !== r) r.value = i;
      r.setAttribute("aria-valuetext", REL_NAMES[i] + (exact ? "" : ", fine-tuned"));
      $$("#mxRelL button", el).forEach(function (b, k) { b.classList.toggle("on", k === i && exact); b.setAttribute("aria-pressed", k === i && exact ? "true" : "false"); });
      var n = q("#mxRelNote"); n.hidden = exact; if (!exact) n.textContent = "Fine-tuned on the Levels tab. Tap a word to go back to a preset.";
    }
    function redraw() {
      var plan = E.planFor(pl, S.st), m = C.sanitizeMix(pl.mix);
      st.T = Math.max(4, plan.total * 1.04);
      q("#mxTl").innerHTML = WU.timeline(plan, { interactive: !!pl.voice, compact: true, label: WU.timelineLabel(pl, plan) });
      q("#mxTotal").textContent = "Total " + C.fmtSecs(plan.total);
      q("#mxNote").textContent = pl.voice && pl.voice.kind === "tts" ? "Computer voice: length is estimated" : "";
      paintRead(plan); paintRel();
      var g = plan.balance, mDb = C.levelDb(g.music * m.mv / 100), vDb = C.levelDb(g.voice * m.vv / 100);
      q("#mxLM").textContent = "Music " + C.fmtDb(mDb); q("#mxLV").textContent = "Voice " + C.fmtDb(vDb);
      var b = q("#mxPrev"); b.disabled = !plan.tracks.length; paintPrev();
      if (st.stopHead) st.stopHead();
      st.stopHead = WU.timelineHead(q("#mxTl"), "mix", st.T);
    }
    function paintPrev() { var b = q("#mxPrev"); if (!b) return; var k = st.prev ? "stop" : "play"; if (b.dataset.st === k) return; /* only touch the button when it changes, so a tap is never lost to a redraw */ b.dataset.st = k; b.innerHTML = (st.prev ? U.I.stop : U.I.play) + " <span>" + (st.prev ? "Stop" : "Preview") + "</span>"; }
    function stopPrev() { var p = E.playing(); if (p && p.key === "mix") E.stop(0.1); st.prev = false; paintPrev(); }
    function touch(redrawToo) { WU.save(); stopPrev(); if (redrawToo !== false) redraw(); }

    /* ---- the simple controls ---- */
    var held = false, holdT = 0, holdI = 0;
    function setRel(i) {
      i = Math.max(0, Math.min(4, i | 0)); pl.mix.bal = REL[i];
      var r = q("#mxRel"); if (r) r.value = i; var f = q("#mxBal"); if (f) f.value = REL[i];
      touch();
    }
    /* move when the voice starts by a tenth of a second (or hold to keep going) */
    function nudge(d) {
      var vd = Math.max(0, Math.min(20, Math.round((C.sanitizeMix(pl.mix).vd + d) * 10) / 10));
      if (vd === C.sanitizeMix(pl.mix).vd) return;
      pl.mix.vd = vd; U.setCtl(el, "vd", vd.toFixed(1)); touch();
    }
    function stopHold() { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = 0; }
    el.addEventListener("pointerdown", function (e) {
      var nd = e.target.closest("[data-nudge]"); if (!nd) return;
      var d = parseFloat(nd.dataset.nudge); held = false; stopHold();
      holdT = setTimeout(function () { held = true; holdI = setInterval(function () { nudge(d); }, 90); }, 450);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { el.addEventListener(n, function (e) { if (e.target.closest && e.target.closest("[data-nudge]")) { stopHold(); setTimeout(function () { held = false; }, 0); /* after the click that ends a hold has been swallowed */ } }, true); });
    el.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest("[data-nudge]")) e.preventDefault(); });
    el.addEventListener("input", function (e) { if (e.target && e.target.id === "mxRel") setRel(+e.target.value); });
    el.addEventListener("keydown", function (e) {
      var t = e.target.closest && e.target.closest("[data-tab]"); if (!t) return;
      var i = TABS.map(function (x) { return x[0]; }).indexOf(t.dataset.tab), n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
      if (n < 0) return; e.preventDefault(); setTab(TABS[(n + TABS.length) % TABS.length][0], true);
    });

    // preview: exactly what game mode plays
    el.addEventListener("click", function (e) {
      var b = e.target.closest("#mxPrev"), d = e.target.closest("[data-do]"), rl = e.target.closest("[data-rel]"), nd = e.target.closest("[data-nudge]"), tb = e.target.closest("[data-tab]");
      if (tb) { setTab(tb.dataset.tab); return; }
      if (rl) { setRel(+rl.dataset.rel); return; }
      if (nd) { if (held) { held = false; return; } nudge(parseFloat(nd.dataset.nudge)); return; }
      if (b) {
        if (st.prev) { stopPrev(); return; }
        E.unlock(); st.prev = true; paintPrev();
        var busy = null, slow = setTimeout(function () { busy = U.busy("Getting the mix ready..."); }, 400);
        E.prepare(pl, S.st, WU.speechOpts()).then(function (pb) {
          clearTimeout(slow); if (busy) busy.done();
          if (st.closed || !st.prev) return;
          E.play(pb, { key: "mix", onEnd: function () { st.prev = false; paintPrev(); } });
        }).catch(function (err) {
          clearTimeout(slow); if (busy) busy.done(); st.prev = false; paintPrev();
          U.toast(err && err.kind === "missing" ? "A file for this player isn't on this phone. Add it again." : "Couldn't play this mix.", "error");
        });
        return;
      }
      if (!d) return;
      var a = d.dataset.do;
      if (a === "center") { pl.mix.bal = 0; var r = q("#mxBal"); r.value = 0; touch(); }
      else if (a === "trim") { WU.songs.openPlayerTrim(pl); }
      else if (a === "untrim") { pl.trim = null; touch(false); build(); }
    });
    var offEvt = WU.on(function (what) {
      if (st.closed) return;
      if (what === "data") { var scroll = sh.body.scrollTop; build(); sh.body.scrollTop = scroll; }
      else if (what === "audio" && st.prev && !E.playing()) { st.prev = false; paintPrev(); }
    });
    off = offEvt;
    el.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.tg === "duck") { pl.mix.duck = t.checked; q("#mxDuck").hidden = !t.checked; q("#mxDuckOff").hidden = t.checked; touch(); }
    });
    U.bindControls(el, function (key, mode, val) {
      var m = C.sanitizeMix(pl.mix), sg = song();
      if (!isFinite(val)) { build(); return; }
      var cur = { bal: m.bal, mv: m.mv, vv: m.vv, vd: m.vd, md: m.md, dd: m.dd, da: m.da, dr: m.dr }[key];
      if (cur !== undefined) {
        var nv = mode === "step" ? cur + val : val;
        pl.mix[key] = nv; m = C.sanitizeMix(pl.mix); pl.mix[key] = m[key];
        U.setCtl(el, key, key === "vd" || key === "md" ? m[key].toFixed(1) : m[key]);
        var txt = { mv: m.mv + "%", vv: m.vv + "%", dd: "-" + m.dd + " dB", da: m.da.toFixed(2) + " s", dr: m.dr.toFixed(2) + " s" }[key];
        if (txt) U.setVal(el, key, txt);
        touch();
      } else if ((key === "len" || key === "fade") && sg) {
        var tr = C.effectiveTrim(pl, sg), n = key === "len" ? C.setLen(sg.dur, tr, mode === "step" ? tr.len + val : val) : C.setFade(sg.dur, tr, mode === "step" ? tr.fade + val : val);
        pl.trim = n; U.setCtl(el, "len", n.len.toFixed(1)); U.setCtl(el, "fade", n.fade.toFixed(1)); touch();
        var fi = el.querySelector('input[type="range"][data-key="fade"]'); if (fi) fi.max = Math.min(3, n.len);
      }
    });

    // drag the voice bar on the timeline to move when the voice starts
    function tx(x) { var svg = $("svg", q("#mxTl")), r = svg.getBoundingClientRect(); return (x - r.left) / (r.width / TL.W); }
    el.addEventListener("pointerdown", function (e) {
      var g = e.target.closest("#tlVoice"); if (!g || !pl.voice) return;
      var m = C.sanitizeMix(pl.mix), meta = WU.timelineMeta({ total: 0 }, st.T);
      st.drag = { x0: tx(e.clientX), vd0: m.vd, pxs: meta.iw / st.T, T: st.T };
      try { q("#mxTl").setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault();
    });
    el.addEventListener("pointermove", function (e) {
      if (!st.drag) return;
      var dt = (tx(e.clientX) - st.drag.x0) / st.drag.pxs, vd = Math.max(0, Math.min(20, Math.round((st.drag.vd0 + dt) * 10) / 10));
      if (vd === pl.mix.vd) return;
      pl.mix.vd = vd; WU.save(); stopPrev();
      var plan = E.planFor(pl, S.st);
      q("#mxTl").innerHTML = WU.timeline(plan, { interactive: true, compact: true, T: st.drag.T, label: WU.timelineLabel(pl, plan) });
      q("#mxTotal").textContent = "Total " + C.fmtSecs(plan.total); paintRead(plan);
      U.setCtl(el, "vd", vd.toFixed(1));
    });
    var endDrag = function () { if (st.drag) { st.drag = null; redraw(); } };
    el.addEventListener("pointerup", endDrag); el.addEventListener("pointercancel", endDrag);
    el.addEventListener("keydown", function (e) {
      if (!e.target.closest || !e.target.closest("#tlVoice")) return;
      var d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0; if (!d) return;
      e.preventDefault();
      pl.mix.vd = Math.max(0, Math.min(20, Math.round((C.sanitizeMix(pl.mix).vd + d * (e.shiftKey ? 1 : 0.1)) * 10) / 10));
      U.setCtl(el, "vd", pl.mix.vd.toFixed(1)); touch();
      var g = $("#tlVoice", el); if (g) g.focus();
    });
    build();
    return sh;
  };
})();
