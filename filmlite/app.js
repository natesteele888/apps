/* Film Lite app: the first screen, opening videos, settings, help, backup and restore.
   Notes live in this phone's localStorage. Videos are only ever played from the file you pick; they are never uploaded or kept. */
(function () {
  "use strict";
  const FL = window.FL, C = FL.C, $ = FL.$, esc = FL.esc, I = FL.I, D = FL.data, ACT = FL.ACT;
  let opening = false;

  /* ================= first screen ================= */
  function recentHTML() {
    const list = D.list();
    if (!list.length) return '<div class="recent-empty">Clips you tag will show up here, with their notes. Nothing yet.</div>';
    return list.map(c => '<button type="button" class="rc" data-act="recent" data-id="' + esc(c.id) + '"><span class="ic">' + I.film + '</span><span class="tx"><b>' + esc(c.title) + "</b><span>" +
      c.tags.length + (c.tags.length === 1 ? " tag" : " tags") + " &middot; " + esc(C.fmtDate(c.updated)) + (c.id === "example" ? " &middot; built-in example" : "") + '</span></span><span class="go">' + I.go + "</span></button>").join("");
  }
  FL.renderHome = function () {
    document.body.classList.remove("in-player");
    const warn = D.memMode ? '<div class="banner bad" role="alert"><b>This browser can\'t save on this device.</b><span>You can still review videos and tag moments, but your notes will be gone when you close the app. Copy them out before you leave.</span></div>' :
      (D.saveFailed ? '<div class="banner bad" role="alert"><b>Your last change couldn\'t be saved.</b><span>Storage may be full. Back up from Settings to keep a copy.</span></div>' : "");
    $("#view").innerHTML = '<div class="home"><div class="home-top"><img src="/apps/icons/filmlite-192.png" alt="" width="48" height="48"><h1>Film Lite</h1>' +
      '<button type="button" class="icon-btn" data-act="help" aria-label="Help and keyboard shortcuts">' + I.help + '</button><button type="button" class="icon-btn" data-act="settings" aria-label="Settings">' + I.gear + "</button></div>" + warn +
      '<section class="hero" aria-labelledby="heroT"><p class="tagline" id="heroT">Review a clip, tag the moments</p>' +
      '<p class="lead">Pick a video from your phone, step through it frame by frame, slow it down, tag the moments that matter, and share the notes. The video never leaves the phone.</p>' +
      '<label class="btn big block file-btn">Choose a video<input type="file" accept="video/*" data-pick aria-label="Choose a video"></label>' +
      '<button type="button" class="btn ghost big block" data-act="example" id="exBtn">See an example</button>' +
      '<div class="progress" id="exProg" hidden aria-hidden="true"><i></i></div><p class="small-note" id="exNote">On a computer you can also drop a video file anywhere on this page.</p></section>' +
      '<div class="note-card">' + I.shield + "<p>Your video is only played here. It isn't uploaded and the app doesn't keep it. " + (D.canSave() ? "Your notes are saved on this phone. Pick the same file again later and your notes come back." : "Notes can't be saved in this browser right now, so copy them out before you close the app.") + "</p></div>" +
      '<div class="sec-title"><h2>Recent clips</h2><span class="sub">' + (D.order.length ? "tap one to reopen" : "notes only") + '</span></div><div id="recent">' + recentHTML() + "</div></div>";
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  };

  /* ================= opening a video ================= */
  function openError(msg, name) {
    FL.closeAllSheets();
    FL.openSheet({
      title: "Can't open that video", cls: "confirm",
      html: '<p class="msg">' + esc(msg) + "</p>" + (name ? '<p class="msg mute" style="font-size:15px">File: ' + esc(name) + "</p>" : ""),
      footer: '<button type="button" class="btn ghost" data-close>Close</button><label class="btn grow2 file-btn">Choose a different video<input type="file" accept="video/*" data-pick aria-label="Choose a different video"></label>'
    });
  }
  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|3g2|ogv|mpg|mpeg|ts|wmv|flv)$/i;
  FL.openFile = async function (file) {
    if (opening || !file) return;
    if (!file.size) return openError("That file is empty.", file.name);
    if (file.type && file.type.indexOf("video/") !== 0 && !VIDEO_EXT.test(file.name || "")) return openError("That doesn't look like a video file. Choose a video from your camera roll or files.", file.name);
    opening = true; const openToast = FL.toast("Opening the video...", "", 20000);
    try {
      const m = await FL.Player.loadMedia(file);
      const meta = { name: file.name || "video", size: file.size, lm: file.lastModified || 0, dur: m.dur };
      let clip = C.matchClip(D.list(), meta), back = false;
      if (clip) back = clip.tags.length > 0;
      else clip = C.sanitizeClip({ id: C.fingerprint(meta), name: meta.name, size: meta.size, lm: meta.lm, dur: Math.round(m.dur), title: C.stripExt(meta.name), created: FL.today(), tags: [] }, FL.today());
      FL.closeAllSheets();
      FL.Player.show(clip, m, { welcome: back });
    } catch (e) { openError(FL.Player.errorText(e && e.kind), file.name); }
    finally { opening = false; FL.hideToast(openToast); }
  };
  document.addEventListener("change", e => {
    const t = e.target;
    if (t && t.matches && t.matches("[data-pick]")) { const f = t.files && t.files[0]; t.value = ""; if (f) FL.openFile(f); }
    else if (t && t.matches && t.matches("[data-restore]")) { const f = t.files && t.files[0]; t.value = ""; if (f) onRestoreFile(f); }
  });
  /* drag a video onto the page (computers) */
  let dragN = 0;
  const hint = document.createElement("div"); hint.className = "drop-hint"; hint.textContent = "Drop a video to open it"; hint.setAttribute("aria-hidden", "true");
  document.body.appendChild(hint);
  const hasFiles = e => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0;
  window.addEventListener("dragenter", e => { if (hasFiles(e)) { dragN++; hint.classList.add("on"); } });
  window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", e => { if (hasFiles(e)) { dragN = Math.max(0, dragN - 1); if (!dragN) hint.classList.remove("on"); } });
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragN = 0; hint.classList.remove("on");
    const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) FL.openFile(f);
  });

  /* ================= the built-in example ================= */
  function exampleClip(blobSize, dur) {
    return C.sanitizeClip({ id: "example", name: "example.webm", size: blobSize, lm: 0, dur: Math.round(dur), title: "Example clip", created: FL.today(), tags: FL.Example.tags() }, FL.today());
  }
  ACT["example"] = async () => {
    if (opening) return;
    opening = true;
    const btn = $("#exBtn"), prog = $("#exProg"), note = $("#exNote");
    if (btn) { btn.disabled = true; btn.textContent = "Making the example..."; }
    if (prog) { prog.hidden = false; prog.setAttribute("aria-hidden", "false"); }
    if (note) note.textContent = "Recording a short bouncing-ball clip on this phone. It takes about 4 seconds.";
    try {
      let m = null, blob = null;
      try {
        blob = await FL.Example.make(f => { const i = prog && $("i", prog); if (i) i.style.width = Math.round(f * 100) + "%"; });
        m = await FL.Player.loadMedia(blob);
      } catch (e) { m = null; }
      if (m) {
        let clip = D.clips.example;
        if (!clip) { clip = exampleClip(blob.size, m.dur); D.saveClip(clip); }
        FL.closeAllSheets();
        FL.Player.show(clip, m, { welcome: false });
      } else {
        FL.Player.show(C.sanitizeClip({ id: "example", name: "example", title: "Example clip (still picture)", tags: [] }, FL.today()), null, { still: true });
      }
    } finally { opening = false; }
  };

  /* ================= recent clips ================= */
  function clipById(id) { return D.clips[id] || null; }
  ACT["recent"] = el => {
    const c = clipById(el.dataset.id); if (!c) return;
    if (c.id === "example") return ACT["example"]();
    FL.openSheet({
      title: "Choose the video again", cls: "help",
      html: '<p class="msg">Film Lite doesn\'t keep videos. To see your ' + c.tags.length + (c.tags.length === 1 ? " tag" : " tags") + " for <b>" + esc(c.title) + "</b> again, pick the same video file.</p>" +
        '<div class="note-card" style="margin-top:12px">' + I.film + "<p><b>" + esc(c.name || c.title) + "</b><br>" + (c.size ? esc(C.fmtSize(c.size)) + " &middot; " : "") + (c.dur ? esc(C.fmtTime(c.dur, 0)) + " long &middot; " : "") + "notes saved " + esc(C.fmtDate(c.updated)) + "</p></div>" +
        '<div class="stack"><button type="button" class="btn ghost block" data-act="recent-copy" data-id="' + esc(c.id) + '">' + I.copy + 'Copy notes</button>' +
        '<button type="button" class="btn ghost block" data-act="recent-dl" data-id="' + esc(c.id) + '">' + I.dl + 'Download notes (.txt)</button>' +
        '<button type="button" class="btn danger block" data-act="recent-del" data-id="' + esc(c.id) + '">' + I.trash + "Delete these notes</button></div>",
      footer: '<button type="button" class="btn ghost" data-close>Close</button><label class="btn grow2 file-btn">Choose the video again<input type="file" accept="video/*" data-pick aria-label="Choose the video again"></label>'
    });
  };
  ACT["recent-copy"] = el => { const c = clipById(el.dataset.id); if (c) FL.copyOrShow(C.notesToText(c), "Notes copied. Paste them into a message or note.", "Copy your notes"); };
  ACT["recent-dl"] = el => { const c = clipById(el.dataset.id); if (c) { FL.downloadBlob(new Blob([C.notesToText(c) + "\n"], { type: "text/plain" }), "filmlite-" + C.slug(c.title) + "-notes.txt"); FL.toast("Notes saved as a .txt file.", "ok"); } };
  ACT["recent-del"] = el => {
    const c = clipById(el.dataset.id); if (!c) return;
    FL.confirmSheet({
      title: "Delete these notes?", message: "This removes all " + c.tags.length + (c.tags.length === 1 ? " tag" : " tags") + " for \"" + c.title + "\" from this phone. The video file is not touched. This can't be undone.", confirmText: "Delete notes", danger: true,
      onConfirm() { D.deleteClip(c.id); FL.closeAllSheets(); FL.renderHome(); FL.toast("Notes deleted.", "ok"); }
    });
  };

  /* ================= settings ================= */
  function settingsHTML() {
    const s = D.settings, seg = (act, vals, cur, fmt) => '<div class="seg" role="group">' + vals.map(v => '<button type="button" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + fmt(v) + "</button>").join("") + "</div>";
    return '<div class="field"><span class="label">Frame rate for frame steps</span>' + seg("set-fps", C.FPS_OPTIONS, s.fps, v => v + " fps") + '<p class="hint">Most phone video is 30 or 60 frames per second. Pick the one your clip uses so one step moves exactly one frame.</p></div>' +
      '<div class="field"><span class="label">Speed when a clip opens</span>' + seg("set-speed", C.SPEEDS, s.speed, v => v + "x") + "</div>" +
      '<label class="chk"><input type="checkbox" id="sPrecise"' + (s.precise ? " checked" : "") + '><span>Precise time<small>Show hundredths of a second, like 0:12.43.</small></span></label>' +
      '<div class="field" style="margin-top:10px"><label class="label" for="sPreset">Quick labels for tags</label><select id="sPreset">' + C.PRESETS.map(p => '<option value="' + p.id + '"' + (p.id === s.preset ? " selected" : "") + ">" + esc(p.label) + "</option>").join("") + '</select><p class="hint">Tap one on a tag to say which part of the motion it is about.</p></div>' +
      '<div class="field" id="sCustomF"' + (s.preset === "custom" ? "" : " hidden") + '><label class="label" for="sCustom">Your labels</label><input type="text" id="sCustom" maxlength="160" autocomplete="off" placeholder="Stance, Swing, Finish" value="' + esc(s.custom.join(", ")) + '"><p class="hint">Separate with commas. Up to ' + C.MAX_PARTS + " labels.</p></div>" +
      '<div class="sheet-sec"><h3>Back up your notes</h3><p class="msg">' + (D.memMode ? '<b class="errmsg" style="margin:0">This browser is not letting Film Lite save.</b> Anything you tag is lost when you close the app. ' : "") +
      "Your notes and settings live only on this phone. Clearing the browser's data erases them, so back up now and then. A backup never includes videos.</p>" +
      '<div class="stack" style="margin-top:12px"><button type="button" class="btn block" data-act="backup">' + I.dl + 'Back up my notes</button>' +
      '<label class="btn ghost block file-btn">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Film Lite backup file"></label></div>' +
      '<p class="hint mute" style="margin-top:10px;font-size:14px">Restoring replaces the notes and settings on this phone. After a restore, pick each video again and its notes come back.</p></div>' +
      '<div class="sheet-sec"><h3>Something wrong?</h3><button type="button" class="btn ghost block" onclick="window.nateHealth&&nateHealth.report()">Send a problem report</button></div>' +
      '<div class="sheet-sec"><h3>About</h3><p class="msg">' + esc(C.VERSION) + ". Videos are played straight from your phone's files. They are never uploaded, and Film Lite does not keep a copy. Nothing leaves this phone.</p>" +
      '<button type="button" class="btn danger block" style="margin-top:12px" data-act="clear-all">' + I.trash + "Clear everything</button></div>";
  }
  ACT["settings"] = () => {
    FL.closeAllSheets();
    FL.openSheet({
      title: "Settings", cls: "help", html: settingsHTML(),
      onOpen(api) {
        $("#sPrecise", api.el).addEventListener("change", e => { D.settings.precise = e.target.checked; D.saveSettings(); FL.Player.applySettings(); });
        $("#sPreset", api.el).addEventListener("change", e => { D.settings.preset = e.target.value; D.saveSettings(); $("#sCustomF", api.el).hidden = D.settings.preset !== "custom"; });
        $("#sCustom", api.el).addEventListener("input", e => { D.settings.custom = C.parseLabels(e.target.value); D.saveSettings(); });
      }
    });
  };
  const pickSeg = el => FL.$$("[data-act=" + el.dataset.act + "]", el.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === el)));
  ACT["set-fps"] = el => { D.settings.fps = Number(el.dataset.v); D.saveSettings(); pickSeg(el); FL.Player.applySettings(); };
  ACT["set-speed"] = el => { D.settings.speed = Number(el.dataset.v); D.saveSettings(); pickSeg(el); };
  ACT["clear-all"] = () => {
    const n = D.order.length;
    FL.confirmSheet({
      title: "Clear everything?", message: "This removes the notes for " + n + (n === 1 ? " clip" : " clips") + " and your settings from this phone. Videos aren't touched. This can't be undone.", more: ["Back up first if you might want them again."],
      confirmText: "Clear everything", danger: true,
      onConfirm() { D.clearAll(); FL.closeAllSheets(); if (FL.Player.isOpen()) FL.Player.close({ keepHome: true }); FL.renderHome(); FL.toast("Everything was cleared.", "ok"); }
    });
  };

  /* ================= backup and restore ================= */
  ACT["backup"] = () => {
    try {
      const obj = C.makeBackup(D.settings, D.list(), FL.today());
      FL.downloadBlob(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }), "filmlite-backup-" + FL.today() + ".json");
      FL.toast("Backup file made (" + obj.clips.length + (obj.clips.length === 1 ? " clip" : " clips") + "). Keep it somewhere safe, like Files or Google Drive.", "ok", 5000);
    } catch (e) { FL.toast("Couldn't make the backup file. Try again.", "error"); }
  };
  function onRestoreFile(file) {
    const bad = m => FL.toast(m + " Nothing was changed.", "error", 6000);
    if (file.size > 25 * 1024 * 1024) return bad("That file is too big to be a Film Lite backup.");
    const rd = new FileReader();
    rd.onerror = () => bad("Couldn't read that file.");
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Film Lite backup (it can't be read)."); }
      const v = C.validateBackup(obj, FL.today());
      if (!v.ok) return bad(v.error);
      const n = D.order.length;
      FL.confirmSheet({
        title: "Replace everything?",
        message: "This backup has " + v.clips.length + (v.clips.length === 1 ? " clip" : " clips") + " with " + v.tagCount + (v.tagCount === 1 ? " tag" : " tags") + ", plus settings." + (v.skipped ? " " + v.skipped + " unreadable " + (v.skipped === 1 ? "entry was" : "entries were") + " skipped." : ""),
        more: [n ? "Restoring replaces the notes for " + n + (n === 1 ? " clip" : " clips") + " and the settings on this phone now. This can't be undone." : "Nothing is saved on this phone yet, so nothing will be lost."],
        confirmText: "Restore", danger: n > 0,
        onConfirm() {
          if (!D.replaceAll(v.settings, v.clips)) return FL.toast("Couldn't restore (storage problem). Your notes on this phone were left as they were.", "error", 6500);
          FL.closeAllSheets(); if (FL.Player.isOpen()) FL.Player.close({ keepHome: true });
          FL.renderHome(); FL.toast("Restored " + v.clips.length + (v.clips.length === 1 ? " clip." : " clips.") + " Pick a video again to see its notes.", "ok", 5000);
        }
      });
    };
    rd.readAsText(file);
  }

  /* ================= help ================= */
  ACT["help"] = FL.openHelp = () => {
    FL.closeAllSheets();
    const row = (k, t) => "<span>" + k + "</span><span>" + t + "</span>";
    FL.openSheet({
      title: "Help", cls: "help",
      html: "<h3>How it works</h3><ul><li>Choose a video. It plays from your phone; nothing is uploaded.</li><li>Step frame by frame, slow it down, or loop part of it.</li><li>Pause and tap <b>Tag this moment</b> to add a note. Add a start and an end to tag a stretch.</li><li>Tap <b>Draw</b> to circle, arrow, or measure an angle on the paused frame.</li><li>Copy the notes or download them as a text file.</li></ul>" +
        "<h3>Your notes come back</h3><p>Notes are saved on this phone, matched to the video by its name, size, date and length. Pick the same file again and they reappear. The video itself is never kept, so Film Lite stays small.</p>" +
        "<h3>Video won't open?</h3><p>Some cameras save HEVC (H.265) or MKV, which not every browser plays. On iPhone use Settings, Camera, Formats, Most Compatible. Or convert to MP4 (H.264).</p>" +
        '<h3>Keyboard</h3><div class="keys">' + row("<kbd>Space</kbd>", "Play or pause") + row("<kbd>&larr;</kbd> <kbd>&rarr;</kbd>", "One frame back or forward") + row("<kbd>Shift</kbd> + <kbd>&larr;</kbd> <kbd>&rarr;</kbd>", "5 seconds") +
        row("<kbd>[</kbd> <kbd>]</kbd>", "0.1 second back or forward") + row("<kbd>1</kbd> to <kbd>5</kbd>", "Speed 0.25x, 0.5x, 1x, 1.5x, 2x") + row("<kbd>T</kbd>", "Tag this moment") + row("<kbd>D</kbd>", "Draw on this frame") +
        row("<kbd>R</kbd>", "Repeat the whole video") + row("<kbd>M</kbd>", "Mute") + row("<kbd>F</kbd>", "Full screen") + row("<kbd>Esc</kbd>", "Close a sheet or leave drawing") + row("<kbd>?</kbd>", "This help") + "</div>" +
        '<p class="ver">' + esc(C.VERSION) + "</p>"
    });
  };

  /* ================= start ================= */
  function start() {
    D.load();
    FL.renderHome();
    if (D.memMode) setTimeout(() => FL.toast("This browser can't save notes on this device. They'll be lost when you close the app.", "error", 7000), 400);
    if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
