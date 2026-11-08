/* Practice Clock: settings, backup and restore, help, and sharing a plan (link, text, print, and opening a shared link). */
(function () {
  "use strict";
  const PC = window.PCApp, Core = PC.Core, S = PC.S, I = PC.I, $ = PC.$, $$ = PC.$$, esc = PC.esc;
  const openSheet = PC.openSheet, confirmSheet = PC.confirmSheet, toast = PC.toast;

  /* ================= settings ================= */
  const canVibrate = () => { try { return typeof navigator.vibrate === "function"; } catch (e) { return false; } };
  const canWake = () => { try { return !!(navigator.wakeLock && navigator.wakeLock.request); } catch (e) { return false; } };
  function sw(k, title, sub) {
    return '<button type="button" class="switch-row" role="switch" aria-checked="' + S.settings[k] + '" data-act="set-toggle" data-k="' + k + '"><span class="t">' + title + (sub ? "<small>" + sub + "</small>" : "") + '</span><span class="sw"></span></button>';
  }
  function lastBackupText() {
    if (!S.meta.lastBackup) return "You haven't made a backup yet.";
    const d = Core.diffDays(PC.today(), S.meta.lastBackup);
    return "Last backup " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago") + ".";
  }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })); } catch (e) { return false; }
  }
  PC.V.settings = {
    tab: true,
    render(el) {
      const vol = S.settings.volume;
      let h = (S.memMode ? '<div class="banner bad" role="alert"><p><b>This browser is not letting Practice Clock save.</b> Plans and settings will be lost when you close the app. Use Download backup to keep a copy.</p></div>' : "");
      h += '<header class="top"><span class="mark">' + I.mark + "</span><h1>Settings</h1></header>";
      h += '<section class="card"><div class="label" style="margin-bottom:6px">Sound and alerts</div>' +
        '<div class="field" style="margin-bottom:6px"><label class="label" for="set-vol" style="display:flex;justify-content:space-between"><span>Chime volume</span><span id="set-vol-v">' + (vol === 0 ? "Off" : vol + "%") + '</span></label><input type="range" id="set-vol" min="0" max="100" step="5" value="' + vol + '"></div>' +
        '<button type="button" class="btn ghost small" data-act="set-test">' + I.sound + "Test sound</button>" +
        '<div style="margin-top:8px">' + sw("ticks", "Tick in the last 3 seconds", "A soft tick at 3, 2 and 1 so nobody is surprised.") +
        sw("vibrate", "Vibrate at the end of a block", canVibrate() ? "Buzzes the phone when the next block starts." : "This browser can't vibrate the phone (iPhones can't), so this does nothing here.") +
        sw("awake", "Keep the screen on while practice runs", canWake() ? "Stops the phone from locking mid-practice." : "This browser can't do this. Set the phone's auto-lock to Never during practice.") + "</div></section>";
      h += '<section class="card"><div class="label" style="margin-bottom:6px">Your plans and data</div><p class="msg">Everything is saved on this phone only: your plans, settings and recent practices. There is no account and no server. Clearing the browser\'s data erases it, so back up now and then.</p>' +
        '<p class="mute" style="margin:8px 0 12px;font-size:15px">' + esc(lastBackupText()) + '</p><div class="stack"><button type="button" class="btn block" data-act="dl-backup">Download backup file</button>' +
        (canShareFiles() ? '<button type="button" class="btn ghost block" data-act="share-backup">Share backup file...</button>' : "") +
        '<label class="btn ghost block file-btn">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Practice Clock backup file"></label></div></section>';
      h += '<section class="card"><button type="button" class="list-btn" data-act="about"><span class="t">Help and about<small>' + esc(Core.VERSION) + '</small></span><span class="go">' + I.go + '</span></button>' +
        '<button type="button" class="list-btn warn" data-act="clear-all" style="margin-top:8px;margin-bottom:0"><span class="t">Clear everything<small>Deletes all plans, recent practices and settings</small></span><span class="go">' + I.go + "</span></button></section>";
      h += '<p class="ver">' + esc(Core.VERSION) + "</p>";
      el.innerHTML = h;
    }
  };
  PC.ACT["set-toggle"] = el => {
    const k = el.dataset.k; if (!(k in S.settings)) return;
    S.settings[k] = !S.settings[k]; PC.saveData(); PC.onSettingsChanged && PC.onSettingsChanged(); PC.render();
  };
  document.addEventListener("input", e => {
    if (!e.target || e.target.id !== "set-vol") return;
    S.settings.volume = Core.int(e.target.value, 0, 100, 70);
    const v = $("#set-vol-v"); if (v) v.textContent = S.settings.volume === 0 ? "Off" : S.settings.volume + "%";
  });
  document.addEventListener("change", e => { if (e.target && e.target.id === "set-vol") { PC.saveData(); PC.onSettingsChanged && PC.onSettingsChanged(); } });
  PC.ACT["set-test"] = () => {
    PC.audio.unlock();
    if (PC.audio.unsupported) return toast("This browser can't play sounds.", "error");
    if (S.settings.volume <= 0) return toast("Volume is set to Off.", "error");
    setTimeout(() => { PC.audio.chime("block"); }, 60);
    toast("You should hear two tones. If you don't, check the phone's volume and silent switch.", "ok", 4500);
  };

  /* ================= backup and restore ================= */
  function markBackup() { S.meta.lastBackup = PC.today(); PC.saveData(); }
  function backupFile() { return { name: "practiceclock-backup-" + PC.today() + ".json", json: JSON.stringify(Core.makeBackup(S.plans, S.hist, S.settings, PC.today()), null, 1) }; }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
  }
  PC.ACT["dl-backup"] = () => {
    try {
      const f = backupFile();
      downloadBlob(new Blob([f.json], { type: "application/json" }), f.name);
      markBackup();
      toast("Backup file created: " + f.name + ". Keep it somewhere safe, like Files or Google Drive.", "ok", 5500);
      if (S.view === "settings") PC.render();
    } catch (e) { toast("Couldn't make the backup file. Try again.", "error"); }
  };
  PC.ACT["share-backup"] = async () => {
    try {
      const f = backupFile(), file = new File([f.json], f.name, { type: "application/json" });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return toast("This phone can't share files from here. Use Download instead.", "error");
      await navigator.share({ files: [file], title: "Practice Clock backup" });
      markBackup(); toast("Backup shared. Make sure you saved it somewhere safe.", "ok", 5000); PC.render();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast("Couldn't share the backup. Try Download instead.", "error");
    }
  };
  PC.onRestoreFile = function (file) {
    if (!file) return;
    const bad = m => toast(m + " Nothing was changed.", "error", 6000);
    if (file.size > 5 * 1024 * 1024) return bad("That file is too big to be a Practice Clock backup.");
    const rd = new FileReader();
    rd.onerror = () => bad("Couldn't read that file.");
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Practice Clock backup (it can't be read)."); }
      const v = Core.validateBackup(obj);
      if (!v.ok) return bad(v.error);
      const n = S.plans.length, h = S.hist.length;
      confirmSheet({
        title: "Replace everything?",
        message: "This backup has " + v.plans.length + (v.plans.length === 1 ? " plan" : " plans") + " and " + v.history.length + " recent " + (v.history.length === 1 ? "practice" : "practices") + ".",
        more: [n || h ? "Restoring replaces what is on this phone now (" + n + (n === 1 ? " plan" : " plans") + ", " + h + " recent " + (h === 1 ? "practice" : "practices") + ", and your settings). This cannot be undone." : "Nothing is on this phone yet, so nothing will be lost."],
        confirmText: "Restore", danger: n + h > 0, onConfirm() { applyRestore(v); }
      });
    };
    rd.readAsText(file);
  };
  function applyRestore(v) {
    const old = { plans: S.plans, hist: S.hist, settings: S.settings };
    S.plans = v.plans; S.hist = v.history; S.settings = v.settings;
    if (!PC.saveData()) { S.plans = old.plans; S.hist = old.hist; S.settings = old.settings; return toast("Couldn't restore (storage problem). Your data on this phone was left as it was.", "error", 6500); }
    S.meta.lastBackup = PC.today(); PC.saveData();
    PC.closeAllSheets(); S.dropped = 0;
    if (S.view === "editor") PC.go("plans"); else PC.render();
    PC.onSettingsChanged && PC.onSettingsChanged();
    toast("Restored " + v.plans.length + (v.plans.length === 1 ? " plan." : " plans."), "ok");
  }

  /* ================= clear everything, help ================= */
  PC.ACT["clear-all"] = () => confirmSheet({
    title: "Clear everything?", message: "This permanently deletes all " + S.plans.length + (S.plans.length === 1 ? " plan" : " plans") + ", your recent practices and your settings from this phone.",
    more: ["Want a copy first? Download a backup, then clear."].concat(S.run && !S.run.finished ? ["A practice is on the clock right now. It will be stopped."] : []),
    extra: '<button type="button" class="btn ghost block" data-act="dl-backup" style="margin-top:12px">Download a backup first</button>', confirmText: "Clear everything", danger: true,
    onConfirm() {
      PC.dropRun && PC.dropRun();
      S.plans = []; S.hist = []; S.settings = Core.sanitizeSettings({}); S.meta = { lastBackup: null }; S.dropped = 0;
      PC.store.del("data"); PC.store.del("run");
      PC.closeAllSheets(); PC.go("plans"); toast("Everything was cleared.", "ok");
    }
  });
  PC.ACT["about"] = () => openSheet({
    title: "Help and about", cls: "help",
    html: "<h3>What is Practice Clock?</h3><p>A practice plan, cut into timed blocks, and a big clock to run it from the field. When a block ends the next one starts on its own.</p>" +
      "<h3>Build a plan</h3><p>Tap <b>New plan</b> or start from a template. Add blocks with a name and minutes. A <b>stations</b> block rotates every few minutes: the clock says “Rotate now” and flashes.</p>" +
      "<h3>Run it</h3><p>Tap <b>Start</b>. Pause, skip ahead, go back, or add or take off a minute. If the phone sleeps the clock stays right, because it works from the time, not from counting. Turn on “wait for me” to stop at the end of every block.</p>" +
      "<h3>Share</h3><p>Share a plan as a link. The link holds the plan itself, nothing else. You can also copy it as text or print a one-page schedule.</p>" +
      "<h3>Your privacy</h3><ul><li>Everything is saved on this phone only. No account, no server, no tracking.</li><li>Only what you choose to share (a link, text, a backup file) leaves the app.</li></ul>" +
      "<h3>Keep a backup</h3><p>A phone can clear a web app's saved data, for example after a reset. Download a backup file now and then.</p>" +
      '<p class="ver">' + esc(Core.VERSION) + "</p>"
  });

  /* ================= share, copy, print ================= */
  const startMinOf = p => (p.start ? Core.parseHM(p.start) : Core.roundUp5(Date.now()));
  async function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand && document.execCommand("copy"); ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }
  function showCopyBox(title, text) {
    openSheet({ title: title, html: '<p class="msg" style="margin-bottom:8px">Your browser wouldn\'t copy for you. Press and hold in the box, choose Select all, then Copy.</p><textarea class="copybox" readonly aria-label="Text to copy" id="copybox">' + esc(text) + "</textarea>", autofocus: "#copybox",
      onOpen(api) { setTimeout(() => { const t = $("#copybox", api.el); if (t) { t.focus(); t.select(); } }, 60); } });
  }
  function linkFor(plan) {
    const e = Core.encodeShare(plan);
    if (!e.ok) return e;
    e.url = location.href.split("#")[0] + e.hash;
    return e;
  }
  PC.ACT["plan-share"] = el => {
    const p = PC.getPlan(el.dataset.id); if (!p) return;
    PC.closeAllSheets();
    const e = linkFor(p), canShare = typeof navigator.share === "function";
    openSheet({
      title: "Share or print",
      html: '<p class="msg">“' + esc(p.name) + '”. A shared link holds the plan itself (names, minutes, notes). Whoever opens it can add their own copy.</p>' +
        '<div class="stack" style="margin-top:14px">' +
        (e.ok ? (canShare ? '<button type="button" class="btn block" data-share-link>' + I.share + "Share link...</button>" : "") + '<button type="button" class="btn ' + (canShare ? "ghost " : "") + 'block" data-copy-link>Copy link</button>' : '<p class="errmsg" role="alert">' + esc(e.error) + "</p>") +
        '<button type="button" class="btn ghost block" data-copy-text>Copy as text</button><button type="button" class="btn ghost block" data-print>Print / save as PDF</button></div>' +
        (e.ok ? '<p class="mute" style="font-size:14px;margin-top:12px">Link size: ' + e.length + " of " + Core.LIMITS.shareMax + " characters.</p>" : ""),
      onOpen(api) {
        const on = (sel, fn) => { const b = $(sel, api.el); if (b) b.addEventListener("click", fn); };
        on("[data-copy-link]", async () => { (await copyText(e.url)) ? toast("Link copied.", "ok") : showCopyBox("Copy the link", e.url); });
        on("[data-share-link]", async () => {
          try { await navigator.share({ title: p.name, text: "Practice plan: " + p.name, url: e.url }); }
          catch (er) { if (er && er.name === "AbortError") return; (await copyText(e.url)) ? toast("Couldn't open sharing, so the link was copied.", "ok") : showCopyBox("Copy the link", e.url); }
        });
        on("[data-copy-text]", async () => { const t = Core.planText(p, startMinOf(p)); (await copyText(t)) ? toast("Plan copied as text.", "ok") : showCopyBox("Copy the plan", t); });
        on("[data-print]", () => { api.close(); setTimeout(() => PC.printPlan(p), 80); });
      }
    });
  };
  PC.printHtml = function (p) {
    const startMin = startMinOf(p), cs = Core.clockSchedule(p, startMin), sp = Core.sportInfo(p.sport);
    let h = "<h1>" + esc(p.name) + '</h1><div class="psub">' + esc(sp.label) + " · " + cs.totalMin + " min · " + esc(Core.fmtHM(startMin)) + " to " + esc(Core.fmtHM(cs.finishMin)) + "</div>";
    h += "<table><thead><tr><th>Time</th><th>What</th><th>Min</th></tr></thead><tbody>";
    cs.rows.forEach(r => {
      const b = p.blocks[r.bi];
      let sub = b.note ? esc(b.note) : "";
      if (b.type === "stations") sub = esc(b.stations + " stations, rotate every " + b.min + " min: " + b.labels.map((x, i) => x || "Station " + (i + 1)).join(", ")) + (b.note ? "<br>" + esc(b.note) : "");
      h += '<tr><td class="t">' + esc(Core.fmtRange(r.startMin, r.endMin)) + "</td><td>" + esc(b.name) + (sub ? "<small>" + sub + "</small>" : "") + '</td><td class="m">' + r.min + "</td></tr>";
    });
    return h + '</tbody></table><div class="pfoot">Made with Practice Clock</div>';
  };
  PC.printPlan = function (p) {
    if (!p.blocks.length) return toast("Add a block first, then print.", "error");
    const box = $("#printbox"); box.innerHTML = PC.printHtml(p);
    document.body.classList.add("printing");
    const undo = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", undo); };
    window.addEventListener("afterprint", undo);
    setTimeout(() => { try { window.print(); } catch (e) { toast("Couldn't open the print dialog.", "error"); } setTimeout(undo, 1500); }, 60);
  };

  /* ================= opening a shared link ================= */
  let opening = false;
  PC.checkShareHash = function () {
    const h = location.hash || "";
    if (!/^#p\d+=/.test(h) || opening) return;
    opening = true;
    const res = Core.decodeShare(h);
    PC.markHistory();
    if (!res.ok) { opening = false; toast(res.error, "error", 7000); return; }
    const p = res.plan;
    openSheet({
      title: "Add this plan?", cls: "import",
      html: '<p class="msg">Someone shared a practice plan with you. It is only a copy: it won\'t change anything you already have. Look it over, then add it.</p>' +
        '<div class="card" style="margin-top:12px"><div class="num" style="font-size:28px;line-height:1.1;overflow-wrap:anywhere">' + esc(p.name) + '</div><div class="mute" style="margin-top:2px">' + esc(Core.sportInfo(p.sport).label) + " · " + Core.planMinutes(p) + " min · " + p.blocks.length + (p.blocks.length === 1 ? " block" : " blocks") + '</div>' +
        '<table class="preview"><tbody>' + p.blocks.map(b => "<tr><td>" + esc(b.name) + (b.type === "stations" ? " (" + b.stations + " stations)" : "") + '</td><td class="n">' + Core.blockMinutes(b) + " min</td></tr>").join("") + "</tbody></table></div>",
      footer: '<button type="button" class="btn ghost" data-close>Not now</button><button type="button" class="btn" data-add>Add plan</button>',
      onClose() { opening = false; },
      onOpen(api) {
        $("[data-add]", api.el).addEventListener("click", () => {
          if (!PC.addPlan(p)) return;
          api.close();
          if (S.run && !S.run.finished) { PC.render(); toast("Added to your plans.", "ok"); } else { PC.go("editor", p.id); toast("Added. Check it over, then start practice.", "ok"); }
        });
      }
    });
  };
  window.addEventListener("hashchange", () => { PC.checkShareHash(); });
})();
