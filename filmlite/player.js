/* Film Lite player: the video, its controls, the scrub bar with tag markers, loops, and the tag list.
   The video stays a local blob: URL on this phone. It is never uploaded and never stored by the app. */
(function () {
  "use strict";
  const FL = window.FL, C = FL.C, $ = FL.$, esc = FL.esc, I = FL.I, D = FL.data, ACT = FL.ACT;
  let P = null; // the open clip: {clip, v, url, dur, ar, fps, loop, filter, el, ...}
  const view = () => $("#view");
  const R = {}; // pieces shared with tags.js
  FL.Player = R;
  R.state = () => P;

  /* ---------- opening a video file ---------- */
  function fixDuration(v) {
    return new Promise(resolve => {
      if (isFinite(v.duration) && v.duration > 0) return resolve(v.duration);
      // Some recorded videos (webm) say their length is unknown. Jumping far past the end makes the browser work it out.
      let timer = 0;
      const done = () => {
        clearTimeout(timer); v.removeEventListener("timeupdate", chk); v.removeEventListener("durationchange", chk);
        const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        try { v.currentTime = 0; } catch (e) { /* ignore */ }
        resolve(d);
      };
      const chk = () => { if (isFinite(v.duration) && v.duration > 0) done(); };
      v.addEventListener("timeupdate", chk); v.addEventListener("durationchange", chk);
      timer = setTimeout(done, 5000);
      try { v.currentTime = 1e7; } catch (e) { done(); }
    });
  }
  R.fixDuration = fixDuration;
  /* Resolves {v, url, dur, vw, vh}, or rejects {kind: "format"|"decode"|"network"|"timeout"|"empty"|"audio"}. */
  R.loadMedia = function (blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), v = document.createElement("video");
      v.preload = "auto"; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", ""); v.setAttribute("disablepictureinpicture", "");
      let settled = false, timer = 0;
      const fail = kind => { if (settled) return; settled = true; clearTimeout(timer); try { v.removeAttribute("src"); v.load(); } catch (e) { /* ignore */ } URL.revokeObjectURL(url); reject({ kind: kind }); };
      timer = setTimeout(() => fail("timeout"), 25000);
      v.addEventListener("error", () => { const c = v.error ? v.error.code : 4; fail(c === 3 ? "decode" : c === 2 ? "network" : "format"); });
      v.addEventListener("loadedmetadata", async () => {
        try {
          const dur = await fixDuration(v);
          if (settled) return;
          if (!(dur > 0)) return fail("empty");
          if (!v.videoWidth || !v.videoHeight) return fail("audio");
          settled = true; clearTimeout(timer);
          resolve({ v: v, url: url, dur: dur, vw: v.videoWidth, vh: v.videoHeight });
        } catch (e) { fail("empty"); }
      }, { once: true });
      v.src = url;
    });
  };
  R.errorText = function (kind) {
    const tip = " On an iPhone, record with Settings > Camera > Formats > Most Compatible, or convert the file to MP4 (H.264).";
    if (kind === "audio") return "That file has sound but no picture, so there is nothing to review.";
    if (kind === "empty") return "Couldn't work out how long that video is, so it can't be stepped through." + tip;
    if (kind === "timeout") return "That video took too long to open. It may be damaged, or too big for this browser." + tip;
    if (kind === "network") return "The browser lost the file while opening it. Try choosing it again.";
    return "This browser can't play that video. Some cameras save in a format (like HEVC/H.265, MKV or AVI) that not every browser opens." + tip;
  };

  /* ---------- building the screen ---------- */
  const tool = (act, ic, label, extra) => '<button type="button" class="tool" data-act="' + act + '"' + (extra || "") + ">" + ic + "<span>" + label + "</span></button>";
  function html() {
    const speeds = C.SPEEDS.map(s => '<button type="button" data-act="speed" data-speed="' + s + '" aria-pressed="false">' + s + "x</button>").join("");
    const tools = C.TOOLS.map(t => tool("dr-tool", I["t" + t.charAt(0).toUpperCase() + t.slice(1)], t.charAt(0).toUpperCase() + t.slice(1), ' data-tool="' + t + '" aria-pressed="false"')).join("");
    const colors = ["Yellow", "Red", "Blue"].map((n, i) => '<button type="button" class="sw" style="--c:' + C.COLORS[i] + '" data-act="dr-color" data-i="' + i + '" aria-label="' + n + ' pen" aria-pressed="false"></button>').join("");
    const widths = ["Thin", "Medium", "Thick"].map((n, i) => '<button type="button" class="wd" data-act="dr-width" data-i="' + i + '" aria-label="' + n + ' line" aria-pressed="false"><i style="height:' + (2 + i * 3) + 'px"></i></button>').join("");
    return '<section class="player" id="player" aria-label="Video review">' +
      '<header class="pl-head"><button type="button" class="hd-btn" data-act="pl-back" aria-label="Back to my clips">' + I.back + "<span>Clips</span></button>" +
      '<h1 class="pl-title" id="plTitle"></h1><button type="button" class="hd-btn icon" data-act="pl-menu" aria-label="Clip menu, notes and settings">' + I.dots + "</button></header>" +
      '<div class="pl-left"><div class="stage-box"><div class="stage idle" id="stage"><canvas class="ov" id="ov" aria-hidden="true"></canvas>' +
      '<div class="stage-play" aria-hidden="true">' + I.play + '</div><div class="stage-badge" id="stageBadge" hidden></div>' +
      '<button type="button" class="stage-btn" data-act="fullscreen" id="fsBtn" aria-label="Full screen" hidden>' + I.full + '</button><div class="stage-msg" id="stageMsg" hidden></div></div></div>' +
      '<div class="pl-scrub" id="plScrub"><div class="scrub" id="scrub" role="slider" tabindex="0" aria-label="Video position" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">' +
      '<div class="sc-track"><div class="sc-fill" id="scFill"></div><div class="sc-loop" id="scLoop" hidden></div></div><div class="sc-marks" id="scMarks"></div><div class="sc-thumb" id="scThumb"></div></div>' +
      '<div class="pl-time"><b class="cur" id="tCur">0:00.0</b><span class="tot" id="tTot">/ 0:00</span><span class="fr" id="tFr">frame 0</span>' +
      '<button type="button" class="fps" id="fpsBtn" data-act="fps" aria-label="Frame rate used for frame steps. Tap to change.">30 fps</button></div>' +
      '<div class="loop-chip" id="loopChip" hidden><span id="loopTxt"></span><button type="button" data-act="loop-stop">Stop loop</button></div></div>' +
      '<div class="pl-trans" id="trans">' +
      '<button type="button" class="tb" data-act="jump" data-d="-5" aria-label="Back 5 seconds">' + I.rew + "<span>-5 s</span></button>" +
      '<button type="button" class="tb" data-act="step" data-d="-1" data-hold aria-label="Back one frame">' + I.fback + "<span>-1 frame</span></button>" +
      '<button type="button" class="tb play" data-act="play" id="playBtn" aria-label="Play">' + I.play + "</button>" +
      '<button type="button" class="tb" data-act="step" data-d="1" data-hold aria-label="Forward one frame">' + I.ffwd + "<span>+1 frame</span></button>" +
      '<button type="button" class="tb" data-act="jump" data-d="5" aria-label="Forward 5 seconds">' + I.fwd + "<span>+5 s</span></button></div></div>" +
      '<div class="pl-right"><div class="pl-speed" id="plSpeed" role="group" aria-label="Playback speed"><div class="seg">' + speeds + "</div></div>" +
      '<div class="pl-act" id="plAct"><button type="button" class="btn tag-btn" data-act="tag-now">' + I.flag + 'Tag this moment</button><button type="button" class="btn ghost" data-act="draw">' + I.pen + "Draw</button></div>" +
      '<div class="pl-draw" id="plDraw" hidden><p class="dr-hint" id="drHint" aria-live="polite"></p><div class="dr-tools" role="group" aria-label="Drawing tool">' + tools + "</div>" +
      '<div class="dr-row2" role="group" aria-label="Colour and thickness">' + colors + '<span class="gap"></span>' + widths + "</div>" +
      '<div class="dr-row3">' + tool("dr-undo", I.undo, "Undo") + tool("dr-clear", I.trash, "Clear") + tool("dr-pic", I.pic, "Save picture") + "</div>" +
      '<div class="dr-row4"><button type="button" class="btn ghost" data-act="dr-cancel" id="drCancel">Cancel</button><button type="button" class="btn grow2" data-act="dr-save" id="drSave">Save with tag</button></div></div>' +
      '<div class="pl-rest" id="plRest"><div class="tools" id="tools">' +
      tool("repeat", I.repeat, "Repeat", ' id="btnRepeat" aria-pressed="false"') + tool("loop-a", I.brA, "Loop A", ' id="btnA" aria-pressed="false"') + tool("loop-b", I.brB, "Loop B", ' id="btnB" aria-pressed="false"') +
      tool("mute", I.vol, "Mute", ' id="btnMute" aria-pressed="false"') + tool("nudge", I.nl, "-0.1 s", ' data-d="-0.1"') + tool("nudge", I.nr, "+0.1 s", ' data-d="0.1"') +
      tool("picture", I.pic, "Picture") + tool("copy-notes", I.copy, "Copy notes") +
      '</div><div id="tagsBox"></div></div></div></section>';
  }

  /* ---------- show / close ---------- */
  R.show = function (clip, media, opts) {
    opts = opts || {};
    if (P) { teardown(); FL.popLayer("player"); }
    P = { clip: clip, v: media ? media.v : null, url: media ? media.url : null, dur: media ? media.dur : 0, ar: media ? media.vw / media.vh : FL.Example.W / FL.Example.H, still: !!opts.still,
      fps: D.settings.fps, filter: "all", loop: null, lastT: -1, activeId: null, ovKey: "", draft: null, ed: null, drawMode: false, held: false, saved: !!D.clips[clip.id] };
    if (!(P.ar > 0.2 && P.ar < 5)) P.ar = 16 / 9;
    const host = view();
    host.innerHTML = html();
    document.body.classList.add("in-player");
    const el = P.el = {};
    ["player", "stage", "ov", "scrub", "scFill", "scThumb", "scMarks", "scLoop", "tCur", "tTot", "tFr", "fpsBtn", "loopChip", "loopTxt", "playBtn", "plTitle", "plRest", "plAct", "plSpeed", "plDraw", "tagsBox", "stageMsg", "stageBadge", "fsBtn", "btnRepeat", "btnA", "btnB", "btnMute", "plScrub", "trans", "drHint", "drSave", "drCancel"]
      .forEach(id => { el[id] = document.getElementById(id); });
    el.stage.style.setProperty("--ar", P.ar.toFixed(4));
    el.plTitle.textContent = clip.title;
    if (P.still) buildStill(opts); else { el.stage.insertBefore(P.v, el.stage.firstChild); bindVideo(); P.v.playbackRate = D.settings.speed; }
    bindUI();
    FL.pushLayer("player", () => R.close({ fromHistory: true }));
    R.applySettings();
    renderMarks(); renderTags(); renderLoopUI(); sync(true);
    requestAnimationFrame(() => { refreshOverlay(true); });
    if (!P.still) P.raf = requestAnimationFrame(tick);
    if (opts.welcome && clip.tags.length) FL.toast("Welcome back. Your " + clip.tags.length + (clip.tags.length === 1 ? " tag is" : " tags are") + " here.", "ok");
    try { host.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  function teardown() {
    if (!P) return;
    cancelAnimationFrame(P.raf);
    clearInterval(P.holdTimer); clearTimeout(P.holdTimer0);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", onFull); document.removeEventListener("webkitfullscreenchange", onFull);
    if (P.ed) { P.ed.destroy(); P.ed = null; }
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
    if (P.v) { try { P.v.pause(); P.v.removeAttribute("src"); P.v.load(); } catch (e) { /* ignore */ } }
    if (P.url) { try { URL.revokeObjectURL(P.url); } catch (e) { /* ignore */ } }
    document.body.classList.remove("in-player");
    FL.popLayer("draw");
    FL.sheetStack.filter(s => s.dock).forEach(s => s.close());
    P = null;
  }
  R.close = function (o) {
    if (!P) return;
    teardown();
    if (!o || !o.fromHistory) FL.popLayer("player");
    if (!o || !o.keepHome) FL.renderHome();
  };
  R.isOpen = () => !!P;

  /* ---------- the example fallback: a still picture, tag tools off ---------- */
  function buildStill(opts) {
    const cv = FL.Example.still(); cv.className = "still"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "A still picture standing in for the example video");
    P.el.stage.insertBefore(cv, P.el.stage.firstChild);
    P.el.stage.classList.remove("idle"); P.el.stage.classList.add("nomedia");
    ["plScrub", "trans", "plSpeed", "plAct", "plRest"].forEach(k => { P.el[k].hidden = true; });
    const note = document.createElement("div");
    note.className = "pl-right-note"; note.style.cssText = "padding:18px 16px;";
    note.innerHTML = '<div class="banner"><b>This browser can\'t make the example video.</b><span>So this is just a still picture, and the tagging tools are switched off. Choose a video from your phone to try the real thing.</span></div>' +
      '<label class="btn block big file-btn">Choose a video<input type="file" accept="video/*" data-pick aria-label="Choose a video"></label>';
    P.el.plRest.parentNode.appendChild(note);
  }

  /* ---------- video events ---------- */
  function bindVideo() {
    const v = P.v;
    v.addEventListener("play", () => { P.el.stage.classList.add("playing"); P.el.stage.classList.remove("idle"); updatePlay(); });
    v.addEventListener("pause", () => { P.el.stage.classList.remove("playing"); updatePlay(); sync(true); });
    v.addEventListener("seeked", () => sync(true));
    v.addEventListener("timeupdate", () => sync());
    v.addEventListener("ratechange", updateSpeed);
    v.addEventListener("volumechange", updateMute);
    v.addEventListener("ended", () => {
      if (P && P.loop && !v.loop) { v.currentTime = P.loop.a; v.play().catch(() => {}); }
      updatePlay(); sync(true);
    });
    v.addEventListener("error", () => { if (P && P.v === v) showStageMsg(R.errorText(v.error && v.error.code === 3 ? "decode" : "format")); });
    v.addEventListener("durationchange", () => { if (isFinite(v.duration) && v.duration > 0 && Math.abs(v.duration - P.dur) > 0.05) { P.dur = v.duration; renderMarks(); sync(true); } });
  }
  function showStageMsg(text) {
    const m = P.el.stageMsg;
    m.innerHTML = "<p></p>"; m.firstChild.textContent = text;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = "Back to my clips"; b.setAttribute("data-act", "pl-back");
    m.appendChild(b); m.hidden = false;
  }
  function updatePlay() {
    if (!P) return;
    const playing = !P.v.paused && !P.v.ended;
    P.el.playBtn.innerHTML = playing ? I.pause : I.play;
    P.el.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function updateSpeed() {
    if (!P) return;
    FL.$$("[data-speed]", P.el.plSpeed).forEach(b => b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.speed) - P.v.playbackRate) < 0.001)));
  }
  function updateMute() {
    if (!P) return;
    const m = P.v.muted || P.v.volume === 0;
    P.el.btnMute.setAttribute("aria-pressed", String(m));
    P.el.btnMute.innerHTML = (m ? I.mute : I.vol) + "<span>" + (m ? "Muted" : "Mute") + "</span>";
  }

  /* ---------- time, position, frames ---------- */
  const pct = t => P.dur > 0 ? C.clamp(t / P.dur, 0, 1) * 100 : 0;
  function sync(force) {
    if (!P || P.still) return;
    const v = P.v, t = v.currentTime;
    if (!force && t === P.lastT) return;
    P.lastT = t;
    const prec = D.settings.precise, p = pct(t);
    P.el.tCur.textContent = C.fmtTime(t, prec ? 2 : 1);
    P.el.tTot.textContent = "/ " + C.fmtTime(P.dur, prec ? 2 : 0);
    P.el.tFr.textContent = "frame " + C.frameIndex(t, P.fps);
    P.el.scFill.style.width = p + "%"; P.el.scThumb.style.left = p + "%";
    P.el.scrub.setAttribute("aria-valuemax", String(Math.round(P.dur * 100) / 100)); P.el.scrub.setAttribute("aria-valuenow", String(Math.round(t * 100) / 100));
    P.el.scrub.setAttribute("aria-valuetext", C.fmtTime(t, 1) + " of " + C.fmtTime(P.dur, 1));
    refreshOverlay();
    const act = C.activeTagAt(P.clip.tags, t, P.fps);
    if (act !== P.activeId) { P.activeId = act; FL.$$(".tg", P.el.tagsBox).forEach(li => { const on = li.dataset.id === act; li.classList.toggle("active", on); if (on) li.setAttribute("aria-current", "true"); else li.removeAttribute("aria-current"); }); }
  }
  function tick() {
    if (!P) return;
    P.raf = requestAnimationFrame(tick);
    const v = P.v;
    if (P.loop && !v.paused && !v.seeking) { const w = C.loopWrap(v.currentTime, P.loop.a, P.loop.b, 0.012); if (w != null) v.currentTime = w; }
    sync();
  }
  /* Move the playhead. A seek by the user outside a running loop turns the loop off. */
  R.seek = function (t, o) {
    if (!P || P.still) return;
    t = C.clamp(t, 0, P.dur);
    if (o && o.user && P.loop && !C.inLoop(t, P.loop.a, P.loop.b, 0.05)) { clearLoop(); FL.toast("Loop off"); }
    P.el.stage.classList.remove("idle");
    try { P.v.currentTime = t; } catch (e) { /* ignore */ }
    sync(true);
  };
  R.seekFrame = function (ft) { R.seek(C.seekTime(ft, P.fps, P.dur), { user: true }); };
  function step(dir) {
    if (!P || P.drawMode) return;
    P.v.pause();
    R.seekFrame(C.stepTime(P.v.currentTime, dir, P.fps, P.dur));
  }
  function jump(d) { if (!P || P.drawMode) return; R.seek(C.nudgeTime(P.v.currentTime, d, P.dur), { user: true }); }
  function togglePlay() {
    if (!P || P.drawMode || P.still) return;
    const v = P.v;
    if (v.paused || v.ended) {
      if (v.ended || v.currentTime >= P.dur - 0.01) v.currentTime = P.loop ? P.loop.a : 0;
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => FL.toast("Couldn't start the video. Tap play again.", "error"));
    } else v.pause();
  }
  R.pause = () => { if (P && P.v) P.v.pause(); };
  R.togglePlay = togglePlay;

  /* ---------- loops ---------- */
  function setLoop(a, b, tagId) { P.loop = { a: a, b: b, tagId: tagId || null }; renderLoopUI(); }
  function clearLoop() { if (!P) return; P.loop = null; P.freeA = null; P.freeB = null; renderLoopUI(); }
  R.clearLoop = clearLoop;
  function renderLoopUI() {
    if (!P || P.still) return;
    const L = P.loop, el = P.el;
    el.scLoop.hidden = !L;
    if (L) { el.scLoop.style.left = pct(L.a) + "%"; el.scLoop.style.width = Math.max(0.5, pct(L.b) - pct(L.a)) + "%"; }
    el.loopChip.hidden = !L;
    if (L) el.loopTxt.textContent = (L.tagId ? "Looping this tag " : "Looping ") + C.fmtTime(L.a, 1) + " to " + C.fmtTime(L.b, 1);
    el.btnA.setAttribute("aria-pressed", String(P.freeA != null)); el.btnB.setAttribute("aria-pressed", String(P.freeB != null));
    el.btnA.innerHTML = I.brA + "<span>Loop A</span>" + (P.freeA != null ? "<small>" + C.fmtTime(P.freeA, 1) + "</small>" : "");
    el.btnB.innerHTML = I.brB + "<span>Loop B</span>" + (P.freeB != null ? "<small>" + C.fmtTime(P.freeB, 1) + "</small>" : "");
    FL.$$("[data-act=tag-loop]", el.tagsBox).forEach(b => b.classList.toggle("looping", !!L && L.tagId === b.dataset.id));
  }
  ACT["loop-a"] = () => {
    if (!P || P.drawMode) return;
    const t = C.nudgeTime(P.v.currentTime, 0, P.dur);
    P.freeA = t; if (P.freeB != null && P.freeB <= t) P.freeB = null;
    if (P.loop && !P.loop.tagId) P.loop = null;
    renderLoopUI(); FL.toast("Loop start set at " + C.fmtTime(t, 1) + ". Now set Loop B.", "ok");
  };
  ACT["loop-b"] = () => {
    if (!P || P.drawMode) return;
    const t = C.nudgeTime(P.v.currentTime, 0, P.dur);
    if (P.freeA == null) P.freeA = 0;
    if (t <= P.freeA + 0.05) return FL.toast("Loop B has to come after Loop A.", "error");
    P.freeB = t; setLoop(P.freeA, t, null);
    R.seek(P.freeA); P.v.play().catch(() => {});
  };
  ACT["loop-stop"] = () => { clearLoop(); FL.toast("Loop off"); };
  ACT["tag-loop"] = el => {
    if (!P || P.drawMode) return;
    const g = P.clip.tags.filter(x => x.id === el.dataset.id)[0]; if (!g) return;
    if (P.loop && P.loop.tagId === g.id) { clearLoop(); return FL.toast("Loop off"); }
    const r = C.tagLoopRange(g, P.dur); if (!r) return;
    P.freeA = P.freeB = null;
    setLoop(r.a, r.b, g.id); R.seek(r.a); P.v.play().catch(() => {});
  };

  /* ---------- markers and the tag list ---------- */
  function renderMarks() {
    if (!P || P.still) return;
    const tags = P.clip.tags, lanes = C.assignLanes(tags);
    let h = "";
    tags.forEach(g => { if (g.e != null && g.e > g.t) h += '<i class="mk-seg c-' + g.cat + '" style="left:' + pct(g.t) + "%;width:" + Math.max(0.6, pct(g.e) - pct(g.t)) + "%;margin-top:" + (8 + Math.min(lanes[g.id] || 0, 1) * 6) + 'px"></i>'; });
    tags.forEach(g => { h += '<i class="mk c-' + g.cat + '" style="left:' + pct(g.t) + '%"></i>'; });
    P.el.scMarks.innerHTML = h;
  }
  R.renderMarks = renderMarks;
  function renderTags() {
    if (!P || P.still) return;
    const all = P.clip.tags, counts = C.countByCat(all);
    let list = C.filterTags(all, P.filter);
    if (P.filter !== "all" && !counts[P.filter]) { P.filter = "all"; list = C.sortTags(all); }
    let h = '<div class="tags-head"><h2>Tags <span class="mute">' + all.length + "</span></h2></div>";
    if (!FL.data.canSave()) h += '<p class="warn-line">' + (D.memMode ? "This browser can't save on this device, so your tags will be lost when you close the app. You can still copy the notes." : "Your last change couldn't be saved. Storage may be full. Copy the notes or back up from Settings.") + "</p>";
    if (all.length) {
      h += '<div class="filters" role="group" aria-label="Filter tags">' + '<button type="button" class="chip" data-act="filter" data-cat="all" aria-pressed="' + (P.filter === "all") + '">All <span class="n">' + counts.all + "</span></button>" +
        C.CATS.map(c => '<button type="button" class="chip c-' + c.id + '" data-act="filter" data-cat="' + c.id + '" aria-pressed="' + (P.filter === c.id) + '"><span class="dot"></span>' + esc(c.label) + ' <span class="n">' + counts[c.id] + "</span></button>").join("") + "</div>";
    }
    if (!all.length) h += '<div class="tags-empty">No tags yet. Pause on a moment that matters, then tap <b>Tag this moment</b>.</div>';
    else {
      h += '<ul class="taglist" aria-label="Tags in time order">' + list.map(g => {
        const seg = g.e != null && g.e > g.t;
        return '<li class="tg c-' + g.cat + '" data-id="' + esc(g.id) + '"><button type="button" class="main" data-act="tag-seek" data-id="' + esc(g.id) + '" aria-label="Go to ' + C.fmtTime(g.t, 1) + '">' +
          '<span class="t1"><span class="tm">' + C.fmtTime(g.t, 1) + (seg ? "-" + C.fmtTime(g.e, 1) : "") + '</span><span class="kind">' + esc(C.catLabel(g.cat)) + "</span>" +
          (g.part ? '<span class="part">' + esc(g.part) + "</span>" : "") + (g.d ? '<span class="has-d" title="Has a drawing" aria-label="Has a drawing">' + I.pen + "</span>" : "") + '</span><span class="nt">' + esc(g.note) + "</span></button>" +
          '<span class="side"><button type="button" data-act="tag-loop" data-id="' + esc(g.id) + '" aria-label="Loop this tag" title="Loop this tag">' + I.repeat + '</button><button type="button" data-act="tag-edit" data-id="' + esc(g.id) + '" aria-label="Edit this tag" title="Edit this tag">' + I.pen + "</button></span></li>";
      }).join("") + "</ul>";
      if (!list.length) h += '<div class="tags-empty">No tags in this group.</div>';
    }
    P.el.tagsBox.innerHTML = h;
    P.activeId = null; renderLoopUI(); sync(true);
  }
  R.renderTags = renderTags;
  ACT["filter"] = el => { if (!P) return; P.filter = el.dataset.cat; renderTags(); };
  ACT["tag-seek"] = el => {
    if (!P || P.drawMode) return;
    const g = P.clip.tags.filter(x => x.id === el.dataset.id)[0]; if (!g) return;
    P.v.pause(); R.seek(g.t, { user: true });
  };

  /* ---------- drawings shown on the frame they were made on ---------- */
  function refreshOverlay(force) {
    if (!P || P.drawMode || P.still) return;
    const hit = C.drawingTagsAt(P.clip.tags, P.v.currentTime, P.fps), key = hit.map(g => g.id).join(",");
    if (!force && key === P.ovKey) return;
    P.ovKey = key;
    const strokes = []; hit.forEach(g => g.d.s.forEach(s => strokes.push(s)));
    FL.Draw.show(P.el.ov, strokes, P.ar);
    const b = P.el.stageBadge;
    if (hit.length) { b.hidden = false; b.textContent = "Drawing: " + hit.map(g => C.catLabel(g.cat)).filter((x, i, a) => a.indexOf(x) === i).join(", "); } else b.hidden = true;
  }
  R.refreshOverlay = refreshOverlay;
  R.resetOverlayKey = () => { if (P) P.ovKey = "\u0000"; };
  function onResize() { if (!P) return; if (P.ed) P.ed.redraw(); else refreshOverlay(true); }

  /* ---------- scrub bar ---------- */
  function scrubTime(e) {
    const r = P.el.scrub.getBoundingClientRect();
    return C.clamp((e.clientX - r.left) / (r.width || 1), 0, 1) * P.dur;
  }
  function bindScrub() {
    const sc = P.el.scrub;
    let active = null;
    sc.addEventListener("pointerdown", e => {
      if (P.drawMode || (e.button != null && e.button > 0)) return;
      e.preventDefault(); active = e.pointerId;
      try { sc.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      sc.focus({ preventScroll: true });
      let t = scrubTime(e);
      const r = sc.getBoundingClientRect(); // a touch near a tag marker lands exactly on that tag
      let best = null;
      P.clip.tags.forEach(g => { const d = Math.abs(g.t / P.dur * r.width - (t / P.dur * r.width)); if (d <= 10 && (!best || d < best.d)) best = { d: d, t: g.t }; });
      if (best) t = best.t;
      R.seek(t, { user: true });
    });
    sc.addEventListener("pointermove", e => { if (active === e.pointerId) R.seek(scrubTime(e), { user: true }); });
    const end = e => { if (active === e.pointerId) active = null; };
    sc.addEventListener("pointerup", end); sc.addEventListener("pointercancel", end);
  }

  /* ---------- buttons ---------- */
  function bindUI() {
    bindScrub();
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFull); document.addEventListener("webkitfullscreenchange", onFull);
    const can = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    P.el.fsBtn.hidden = !can || P.still;
    // press and hold a frame-step button to keep stepping
    const tr = P.el.trans;
    tr.addEventListener("pointerdown", e => {
      const b = e.target.closest("[data-hold]"); if (!b || (e.button != null && e.button > 0)) return;
      P.held = false; clearTimeout(P.holdTimer0); clearInterval(P.holdTimer);
      P.holdTimer0 = setTimeout(() => { P.held = true; P.holdTimer = setInterval(() => step(Number(b.dataset.d)), 90); }, 450);
    });
    const stop = () => { clearTimeout(P.holdTimer0); clearInterval(P.holdTimer); };
    ["pointerup", "pointercancel", "pointerleave"].forEach(n => tr.addEventListener(n, stop));
    tr.addEventListener("contextmenu", e => e.preventDefault());
    P.el.stage.addEventListener("click", e => {
      if (e.target.closest("button") || P.drawMode || P.still || !P.el.stageMsg.hidden) return;
      togglePlay();
    });
    if (!P.still) { updatePlay(); updateSpeed(); updateMute(); }
  }
  ACT["play"] = togglePlay;
  ACT["step"] = el => { if (P && P.held) { P.held = false; return; } step(Number(el.dataset.d)); };
  ACT["jump"] = el => jump(Number(el.dataset.d));
  ACT["nudge"] = el => { if (!P || P.drawMode) return; P.v.pause(); R.seek(C.nudgeTime(P.v.currentTime, Number(el.dataset.d), P.dur), { user: true }); };
  ACT["speed"] = el => { if (P) P.v.playbackRate = Number(el.dataset.speed); };
  ACT["repeat"] = () => { if (!P) return; P.v.loop = !P.v.loop; P.el.btnRepeat.setAttribute("aria-pressed", String(P.v.loop)); FL.toast(P.v.loop ? "Repeat on: the whole video plays again and again." : "Repeat off"); };
  ACT["mute"] = () => { if (P) { P.v.muted = !P.v.muted; if (!P.v.muted && P.v.volume === 0) P.v.volume = 1; } };
  ACT["fps"] = () => {
    if (!P) return;
    const i = C.FPS_OPTIONS.indexOf(D.settings.fps); D.settings.fps = C.FPS_OPTIONS[(i + 1) % C.FPS_OPTIONS.length]; D.saveSettings();
    R.applySettings(); FL.toast("Frame steps now use " + D.settings.fps + " frames per second.", "ok");
  };
  ACT["pl-back"] = () => { if (P && P.drawMode && P.ed && P.ed.strokes.length) return FL.confirmSheet({ title: "Leave and lose the drawing?", message: "Your drawing hasn't been saved.", confirmText: "Leave", danger: true, onConfirm() { R.close(); } }); R.close(); };
  ACT["fullscreen"] = () => {
    if (!P) return;
    const el = P.el.player;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { FL.toast("This browser won't go full screen.", "error"); }
  };
  function onFull() {
    if (!P) return;
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    P.el.fsBtn.innerHTML = on ? I.fullx : I.full; P.el.fsBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    setTimeout(onResize, 120);
  }
  R.applySettings = function () {
    if (!P) return;
    P.fps = D.settings.fps;
    if (P.el.fpsBtn) P.el.fpsBtn.textContent = P.fps + " fps";
    if (!P.still) updateSpeed();
    sync(true);
  };

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", e => {
    if (!P || P.still || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tn = t && t.tagName;
    if (tn === "INPUT" || tn === "TEXTAREA" || tn === "SELECT" || (t && t.isContentEditable)) return;
    if (FL.sheetStack.some(s => !s.dock)) return;
    if ((tn === "BUTTON" || tn === "A") && (e.key === " " || e.key === "Enter")) return;
    const k = e.key;
    if (P.drawMode) { if (k === "Escape" && !FL.sheetStack.length) { e.preventDefault(); ACT["dr-cancel"](); } return; }
    let used = true;
    if (k === " " || k === "k") togglePlay();
    else if (k === "ArrowLeft") e.shiftKey ? jump(-5) : step(-1);
    else if (k === "ArrowRight") e.shiftKey ? jump(5) : step(1);
    else if (k === ",") step(-1); else if (k === ".") step(1);
    else if (k === "[") ACT["nudge"]({ dataset: { d: "-0.1" } }); else if (k === "]") ACT["nudge"]({ dataset: { d: "0.1" } });
    else if (k === "Home") R.seek(0, { user: true }); else if (k === "End") R.seek(P.dur, { user: true });
    else if (k === "t" || k === "T") ACT["tag-now"](); else if (k === "d" || k === "D") ACT["draw"]();
    else if (k === "f" || k === "F") { if (!P.el.fsBtn.hidden) ACT["fullscreen"](); }
    else if (k === "m" || k === "M") ACT["mute"](); else if (k === "r" || k === "R") ACT["repeat"]();
    else if (k === "?" || k === "h" || k === "H") { if (FL.openHelp) FL.openHelp(); }
    else if (/^[1-5]$/.test(k)) P.v.playbackRate = C.SPEEDS[Number(k) - 1];
    else used = false;
    if (used) e.preventDefault();
  });

  /* ---------- notes: copy, download, menu ---------- */
  R.notesText = () => C.notesToText(P.clip);
  ACT["copy-notes"] = () => { if (!P) return; if (!P.clip.tags.length) return FL.toast("No tags to copy yet."); FL.copyOrShow(R.notesText(), "Notes copied. Paste them into a message or note.", "Copy your notes"); };
  ACT["download-notes"] = () => {
    if (!P) return;
    FL.downloadBlob(new Blob([R.notesText() + "\n"], { type: "text/plain" }), "filmlite-" + C.slug(P.clip.title) + "-notes.txt");
    FL.toast("Notes saved as a .txt file.", "ok");
  };
  ACT["share-notes"] = async () => {
    if (!P) return;
    try { await navigator.share({ title: P.clip.title, text: R.notesText() }); } catch (e) { if (!e || e.name !== "AbortError") FL.toast("Couldn't open the share sheet. Use Copy notes instead.", "error"); }
  };
  ACT["picture"] = async () => {
    if (!P || P.still) return;
    let strokes = [];
    if (P.drawMode && P.ed) strokes = P.ed.strokes.slice();
    else C.drawingTagsAt(P.clip.tags, P.v.currentTime, P.fps).forEach(g => g.d.s.forEach(s => strokes.push(s)));
    try {
      const blob = await FL.Draw.exportPng(P.v, strokes);
      const name = "filmlite-" + C.slug(P.clip.title) + "-" + P.v.currentTime.toFixed(1) + "s.png";
      const r = await FL.saveFile(blob, name, "Film Lite frame");
      if (r === "saved") FL.toast("Picture saved: " + name, "ok", 4000); else if (r === "shared") FL.toast("Picture ready to share.", "ok");
    } catch (e) { FL.toast("Couldn't make the picture. The video may not have a frame to grab yet.", "error"); }
  };
  ACT["dr-pic"] = ACT["picture"];

  ACT["pl-menu"] = () => {
    if (!P) return;
    const clip = P.clip, canShare = !!navigator.share && !!clip.tags.length;
    FL.openSheet({
      title: "This clip",
      html: '<div class="field"><label class="label" for="clipTitle">Name</label><input type="text" id="clipTitle" maxlength="80" value="' + esc(clip.title) + '" autocomplete="off"><p class="hint">' + esc(clip.name || "") + (clip.size ? " &middot; " + esc(C.fmtSize(clip.size)) : "") + "</p></div>" +
        '<div class="stack"><button type="button" class="btn block" data-act="copy-notes">' + I.copy + 'Copy notes</button>' +
        '<button type="button" class="btn ghost block" data-act="download-notes">' + I.dl + 'Download notes (.txt)</button>' +
        (canShare ? '<button type="button" class="btn ghost block" data-act="share-notes">Share notes...</button>' : "") +
        '<label class="btn ghost block file-btn">Choose a different video<input type="file" accept="video/*" data-pick aria-label="Choose a different video"></label>' +
        '<button type="button" class="btn ghost block" data-act="help">' + I.help + 'Shortcuts and help</button>' +
        '<button type="button" class="btn ghost block" data-act="settings">' + I.gear + 'Settings</button>' +
        '<button type="button" class="btn danger block" data-act="clip-delete">' + I.trash + "Delete this clip's notes</button></div>" +
        '<p class="hint mute" style="margin-top:12px">The video itself is never saved in Film Lite. Pick the same file again later and your notes come back.</p>',
      onOpen(api) {
        const inp = $("#clipTitle", api.el);
        const save = () => { const t = C.str(inp.value, 80).replace(/\s+/g, " ").trim(); if (!t || t === clip.title) { inp.value = clip.title; return; } clip.title = t; if (P && P.el.plTitle) P.el.plTitle.textContent = t; if (clip.tags.length || D.clips[clip.id]) D.saveClip(clip); };
        inp.addEventListener("change", save); inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); inp.blur(); } });
        api.el.addEventListener("click", e => { if (e.target.closest("[data-act]:not([data-close])")) { save(); } }, true);
      }
    });
  };
  ACT["clip-delete"] = () => {
    if (!P) return;
    const clip = P.clip;
    FL.confirmSheet({
      title: "Delete these notes?", message: "This removes all " + clip.tags.length + (clip.tags.length === 1 ? " tag" : " tags") + " for \"" + clip.title + "\" from this phone. The video file is not touched. This can't be undone.",
      confirmText: "Delete notes", danger: true,
      onConfirm() { clip.tags = []; D.deleteClip(clip.id); FL.closeAllSheets(); if (P) { R.clearLoop(); renderMarks(); renderTags(); R.resetOverlayKey(); refreshOverlay(true); } FL.toast("Notes deleted.", "ok"); }
    });
  };
})();
