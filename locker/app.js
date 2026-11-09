/* Locker app: everything on screen. All data lives in this phone's localStorage (keys start with "locker.").
   Nothing is ever sent anywhere. Logic that is not about the screen lives in core.js. */
(function () {
  "use strict";
  const C = window.LockerCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const ACT = {}; // click handlers, looked up by data-act

  const I = {
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    go: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    arm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
    clips: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-2.2 5.4-2.2 6 0M14 10h4M14 13h3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M5 9h14M9 13v3"/></svg>',
    shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>'
  };

  /* ================= storage ================= */
  const mem = {};
  const S = {
    index: { ids: [], active: null }, ath: {}, damaged: [], meta: { lastBackup: null, tips: {}, snooze: null },
    memMode: false, tab: "today", viewDate: null, gf: { id: null, season: undefined, sport: null, mode: "log" }, clipTag: "", day: null, pulse: null
  };
  const store = {
    get(k) { if (S.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("locker." + k); } catch (e) { return null; } },
    set(k, v) { if (S.memMode) { mem[k] = v; return true; } try { localStorage.setItem("locker." + k, v); return true; } catch (e) { return false; } },
    del(k) { if (S.memMode) { delete mem[k]; return; } try { localStorage.removeItem("locker." + k); } catch (e) { /* ignore */ } },
    keys() {
      if (S.memMode) return Object.keys(mem);
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("locker.") === 0) out.push(k.slice(7)); } } catch (e) { /* ignore */ }
      return out;
    }
  };
  function probeStorage() {
    try { localStorage.setItem("locker.probe", "1"); localStorage.removeItem("locker.probe"); return true; } catch (e) { return false; }
  }
  function readJSON(k) { const raw = store.get(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return undefined; } }
  let lastSaveErr = 0;
  function saveAth(a) {
    const ok = store.set("a." + a.id, JSON.stringify(a));
    if (!ok && Date.now() - lastSaveErr > 4000) { lastSaveErr = Date.now(); toast("Couldn't save on this phone. Storage may be full or blocked. Open the menu and tap Back up & restore to keep a copy.", "error", 7000); }
    return ok;
  }
  function saveIndex() { return store.set("index", JSON.stringify({ v: 1, ids: S.index.ids, active: S.index.active })); }
  function saveMeta() { return store.set("meta", JSON.stringify(S.meta)); }
  function cur() { return S.ath[S.index.active] || null; }

  function loadAll() {
    S.ath = {}; S.damaged = [];
    const m = readJSON("meta");
    S.meta = { lastBackup: null, tips: {}, snooze: null };
    if (m && typeof m === "object") {
      if (C.isYMD(m.lastBackup)) S.meta.lastBackup = m.lastBackup;
      if (C.isYMD(m.snooze)) S.meta.snooze = m.snooze;
      if (m.tips && typeof m.tips === "object") Object.keys(m.tips).forEach(k => { if (/^[a-z]{2,12}$/.test(k) && m.tips[k] === true) S.meta.tips[k] = true; });
    }
    const idx = readJSON("index");
    let ids = idx && Array.isArray(idx.ids) ? idx.ids.filter(x => typeof x === "string" && C.ID_RE.test(x)) : [];
    store.keys().filter(k => k.indexOf("a.") === 0).forEach(k => { const id = k.slice(2); if (C.ID_RE.test(id) && ids.indexOf(id) < 0) ids.push(id); });
    ids = ids.filter((x, i) => ids.indexOf(x) === i);
    ids.forEach(id => {
      const raw = store.get("a." + id);
      if (raw == null) return;
      try {
        const a = C.sanitizeAthlete(JSON.parse(raw));
        if (a && a.id === id) S.ath[id] = a; else S.damaged.push(id);
      } catch (e) { S.damaged.push(id); }
    });
    S.index.ids = ids.filter(id => S.ath[id]);
    S.index.active = idx && S.ath[idx.active] ? idx.active : (S.index.ids[0] || null);
    S.tab = "today"; S.viewDate = null;
  }

  /* ================= small UI pieces ================= */
  const toastHost = () => $("#toasts");
  function toast(msg, kind, ms) {
    const host = toastHost(); if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.innerHTML = '<span class="tx"></span>';
    $(".tx", t).textContent = msg;
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("in")));
    const kill = () => { t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); };
    setTimeout(kill, ms || (kind === "error" ? 5500 : 3200));
    return t;
  }

  const sheetStack = [];
  let sheetSeq = 0;
  function syncInert() {
    const top = sheetStack[sheetStack.length - 1];
    $("#app").inert = sheetStack.length > 0;
    sheetStack.forEach(s => { s.el.inert = s !== top; });
    document.body.classList.toggle("lock", sheetStack.length > 0);
  }
  function openSheet(o) {
    const opener = document.activeElement;
    const id = "sh" + (++sheetSeq);
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' + I.x + "</button></header>" +
      '<div class="sh-body">' + (o.html || "") + "</div>" + (o.footer ? '<div class="sh-foot">' + o.footer + "</div>" : "") + "</section>";
    const api = {
      el: wrap, sheet: $(".sheet", wrap), body: $(".sh-body", wrap), closed: false,
      close() {
        if (api.closed) return; api.closed = true;
        const i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
        syncHistory();
        wrap.classList.remove("open");
        wrap.inert = true; // a closing sheet must not keep keyboard focus or swallow keys while it slides away
        setTimeout(() => wrap.remove(), reduced() ? 0 : 260);
        syncInert();
        const below = sheetStack[sheetStack.length - 1];
        if (below) { try { below.sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (opener && opener.focus && document.contains(opener) && !sheetStack.length) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (o.onClose) o.onClose();
      }
    };
    wrap.addEventListener("click", e => { if (e.target.closest("[data-close]")) api.close(); });
    wrap.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); api.close(); return; }
      if (e.key !== "Tab") return;
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', api.sheet).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === api.sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    sheetStack.push(api);
    syncHistory();
    $("#sheets").appendChild(wrap);
    syncInert();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("open")));
    const af = o.autofocus ? $(o.autofocus, wrap) : null;
    setTimeout(() => { try { (af || api.sheet).focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    if (o.onOpen) o.onOpen(api);
    return api;
  }
  function closeAllSheets() { sheetStack.slice().forEach(s => s.close()); }
  /* Android Back (and the browser's Back) closes the top sheet instead of leaving the app.
     Each open sheet owns one history entry. Entries are added and given back a moment after the sheets change,
     so a sheet that replaces another one (close, then open in the same tap) costs nothing, and the entry we land
     on always says how many sheets should be open. */
  let histDepth = 0, traveling = false, syncTimer = 0;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  function reconcileHistory() {
    if (traveling) return; // the popstate handler tidies up when our own trip back lands
    const want = sheetStack.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ lkSheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        const n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.lkSheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", e => {
    const at = (e.state && e.state.lkSheets) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else while (sheetStack.length > at) sheetStack[sheetStack.length - 1].close();
    reconcileHistory();
  });

  function confirmSheet(o) {
    return openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more ? o.more.map(m => '<p class="msg">' + esc(m) + "</p>").join("") : "") + (o.extra || ""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen(api) { $("[data-ok]", api.el).addEventListener("click", () => { api.close(); o.onConfirm(); }); }
    });
  }

  function confetti() {
    if (reduced()) return;
    const box = document.createElement("div");
    box.className = "confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["#c6ff3d", "#eef7f1", "#ffb340", "#6fd6ff", "#9ccc2b"];
    let html = "";
    for (let i = 0; i < 38; i++) {
      const dx = Math.round((Math.random() - 0.5) * 160), rot = Math.round(Math.random() * 900 - 450), left = Math.round(Math.random() * 100), delay = Math.round(Math.random() * 350);
      html += '<i style="left:' + left + "%;background:" + cols[i % cols.length] + ";--dx:" + dx + "px;--rot:" + rot + "deg;animation-delay:" + delay + 'ms"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2400);
  }

  function tip(key, html) {
    if (S.meta.tips[key]) return "";
    return '<div class="tip" role="note"><div class="tx">' + html + '</div><button type="button" data-act="tip-off" data-id="' + key + '" aria-label="Hide this tip">Got it</button></div>';
  }

  /* ================= athletes ================= */
  const hasArm = a => a.sports.indexOf("baseball") >= 0 || a.sports.indexOf("softball") >= 0;
  const initial = n => (Array.from(String(n).trim())[0] || "?").toUpperCase();
  const sportsText = a => a.sports.map(s => C.sportInfo(s).icon + " " + C.sportInfo(s).label).join("  ");

  function athleteFormHTML(a) {
    const sel = a ? a.sports : [];
    return '<label class="field"><span class="label">Name or nickname</span><input type="text" id="f-name" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="What should we call you?" value="' + esc(a ? a.name : "") + '"></label>' +
      '<div class="field"><span class="label" id="f-sp-l">Sports (tap all you play)</span><div class="pills" role="group" aria-labelledby="f-sp-l">' +
      C.SPORTS.map(s => '<button type="button" class="pill" data-sport="' + s.id + '" aria-pressed="' + (sel.indexOf(s.id) >= 0) + '">' + s.icon + " " + esc(s.label) + "</button>").join("") + "</div></div>" +
      '<label class="field"><span class="label">Birth year (optional)</span><input type="number" id="f-birth" inputmode="numeric" min="1980" max="2100" placeholder="For example 2015" value="' + (a && a.birthYear ? a.birthYear : "") + '"><span class="hint">Only used on your own phone.</span></label>' +
      '<p class="errmsg" id="f-err" role="alert" hidden></p>';
  }
  function readAthleteForm(root) {
    const name = ($("#f-name", root).value || "").trim();
    const sports = $$("[data-sport]", root).filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.sport);
    const by = $("#f-birth", root).value;
    const err = $("#f-err", root);
    const fail = m => { err.textContent = m; err.hidden = false; return null; };
    if (!name) return fail("Type your name or a nickname first.");
    if (!sports.length) return fail("Tap at least one sport.");
    let birthYear = null;
    if (by !== "") {
      birthYear = C.int(by, 1980, 2100, null);
      if (birthYear === null || String(by).length !== 4) return fail("Birth year should be four numbers, like 2015. Or leave it empty.");
    }
    err.hidden = true;
    return { name, sports, birthYear };
  }

  function renderWelcome() {
    const v = $("#view");
    v.innerHTML = '<div class="welcome"><div class="logo"><span class="mark">' + I.lock + '</span></div><h1>Locker</h1><p class="tagline">Your sports notebook, in your pocket.</p>' +
      '<div class="card">' + athleteFormHTML(null) +
      '<p class="privacy-note">' + I.shield + '<span>Everything you add stays on this phone. No account, no sign-in, nothing is sent anywhere.</span></p>' +
      '<button type="button" class="btn block" data-act="create-first">Let\'s go</button></div>' +
      '<p class="mute" style="font-size:15px;text-align:center">Already have a backup file? <button type="button" class="file-btn" style="color:var(--accent);font-weight:800;min-height:44px;display:inline-block;padding:0 6px">Restore it<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Locker backup file"></button></p></div>';
  }
  function addAthlete(f) {
    const a = C.sanitizeAthlete({ id: C.uid(), name: f.name, sports: f.sports, birthYear: f.birthYear, created: C.todayStr() });
    S.ath[a.id] = a; S.index.ids.push(a.id); S.index.active = a.id;
    saveAth(a); saveIndex();
    S.tab = "today"; S.viewDate = null;
    askPersist();
    return a;
  }
  function openAthleteSheet(id) {
    const a = id ? S.ath[id] : null;
    openSheet({
      title: a ? "Edit athlete" : "Add an athlete", autofocus: "#f-name",
      html: athleteFormHTML(a) + (a ? '<div class="game-sec"><button type="button" class="btn danger block" data-act="del-ath" data-id="' + a.id + '">Delete this athlete</button></div>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>' + (a ? "Save" : "Add athlete") + "</button>",
      onOpen(api) {
        $("[data-save]", api.el).addEventListener("click", () => {
          const f = readAthleteForm(api.el); if (!f) return;
          if (a) { a.name = f.name; a.sports = f.sports; a.birthYear = f.birthYear; if (!hasArm(a) && S.tab === "arm") S.tab = "today"; saveAth(a); toast("Saved.", "ok"); }
          else { addAthlete(f); toast("Added " + f.name + ". Switch between athletes at the top.", "ok"); }
          api.close(); render();
        });
      }
    });
  }
  function openSwitchSheet() {
    const items = S.index.ids.map(id => {
      const a = S.ath[id];
      return '<button type="button" class="list-btn" data-act="pick-ath" data-id="' + id + '" aria-current="' + (id === S.index.active) + '"><span class="avatar">' + esc(initial(a.name)) + '</span><span class="t">' + esc(a.name) + "<small>" + esc(sportsText(a)) + "</small></span>" + (id === S.index.active ? '<span class="mute" style="font-weight:700">Now</span>' : "") + "</button>";
    }).join("");
    openSheet({
      title: "Who's playing?",
      html: items + '<button type="button" class="btn ghost block" data-act="add-ath" style="margin-top:6px">+ Add another athlete</button>' +
        '<p class="mute" style="margin-top:12px;font-size:15px">Each athlete has their own reps, games, arm log, clips and card.</p>'
    });
  }

  ACT["create-first"] = () => {
    const f = readAthleteForm($("#view")); if (!f) return;
    addAthlete(f); render();
    toast("Welcome, " + f.name + "! Add your first drill to get started.", "ok", 4200);
  };
  ACT["pick-ath"] = el => {
    if (S.index.active !== el.dataset.id) { S.index.active = el.dataset.id; saveIndex(); S.tab = "today"; S.viewDate = null; S.clipTag = ""; }
    closeAllSheets(); render();
  };
  ACT["add-ath"] = () => { closeAllSheets(); openAthleteSheet(null); };
  ACT["del-ath"] = el => {
    const a = S.ath[el.dataset.id]; if (!a) return;
    confirmSheet({
      title: "Delete " + a.name + "?",
      message: "This removes " + a.name + "'s reps, games, arm log, clips and card from this phone. This cannot be undone.",
      more: ["Want a copy first? Download a backup, then delete."],
      extra: '<button type="button" class="btn ghost block" data-act="dl-backup" style="margin-top:12px">Download a backup first</button>',
      confirmText: "Delete " + a.name, danger: true,
      onConfirm() {
        store.del("a." + a.id);
        delete S.ath[a.id];
        S.index.ids = S.index.ids.filter(x => x !== a.id);
        if (S.index.active === a.id) S.index.active = S.index.ids[0] || null;
        saveIndex(); S.tab = "today"; S.viewDate = null;
        closeAllSheets(); render(); toast(a.name + " was deleted.", "ok");
      }
    });
  };

  /* ================= menu, backup, restore, about ================= */
  function openMenu() {
    const a = cur();
    openSheet({
      title: "Menu",
      html: '<button type="button" class="list-btn" data-act="edit-ath" data-id="' + a.id + '"><span class="t">Edit ' + esc(a.name) + "<small>Name, sports, birth year</small></span>" + I.go + "</button>" +
        '<button type="button" class="list-btn" data-act="add-ath"><span class="t">Add another athlete<small>For a brother, sister or teammate on this phone</small></span>' + I.go + "</button>" +
        '<button type="button" class="list-btn" data-act="backup-sheet"><span class="t">Back up &amp; restore<small>' + esc(lastBackupText()) + "</small></span>" + I.go + "</button>" +
        '<button type="button" class="list-btn" data-act="about"><span class="t">Help &amp; about<small>' + esc(C.VERSION) + "</small></span>" + I.go + "</button>"
    });
  }
  ACT["menu"] = openMenu;
  ACT["switch"] = openSwitchSheet;
  ACT["edit-ath"] = el => { closeAllSheets(); openAthleteSheet(el.dataset.id); };

  function lastBackupText() {
    if (!S.meta.lastBackup) return "You haven't made a backup yet";
    const d = C.diffDays(C.todayStr(), S.meta.lastBackup);
    return "Last backup " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago");
  }
  function hasAnyData() {
    return S.index.ids.some(id => { const a = S.ath[id]; return a.drills.length || Object.keys(a.days).length || a.games.length || a.arm.log.length || a.clips.length; });
  }
  function backupDueDays() {
    if (!S.index.ids.length || !hasAnyData()) return 0;
    const today = C.todayStr();
    if (S.meta.snooze && S.meta.snooze > today) return 0;
    let first = null;
    S.index.ids.forEach(id => { const c = S.ath[id].created; if (!first || c < first) first = c; });
    const base = S.meta.lastBackup && S.meta.lastBackup > first ? S.meta.lastBackup : first;
    const d = C.diffDays(today, base);
    return d >= 14 ? d : 0;
  }
  function markBackup() { S.meta.lastBackup = C.todayStr(); S.meta.snooze = null; saveMeta(); }
  function backupFile() {
    const list = S.index.ids.map(id => C.sanitizeAthlete(S.ath[id]));
    return { name: "locker-backup-" + C.todayStr() + ".json", json: JSON.stringify(C.makeBackup(list, S.index.active), null, 1) };
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
  }
  function doDownloadBackup() {
    if (!S.index.ids.length) return toast("Nothing to back up yet.", "error");
    try {
      const f = backupFile();
      downloadBlob(new Blob([f.json], { type: "application/json" }), f.name);
      markBackup();
      toast("Backup file created: " + f.name + ". Keep it somewhere safe, like Files or Google Drive.", "ok", 5500);
      if (!$("#view .welcome")) render();
    } catch (e) { toast("Couldn't make the backup file. Try again.", "error"); }
  }
  async function doShareBackup() {
    try {
      const f = backupFile(), file = new File([f.json], f.name, { type: "application/json" });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return toast("This phone can't share files from here. Use Download instead.", "error");
      await navigator.share({ files: [file], title: "Locker backup" });
      markBackup(); toast("Backup shared. Make sure you saved it somewhere safe.", "ok", 5000); render();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast("Couldn't share the backup. Try Download instead.", "error");
    }
  }
  ACT["dl-backup"] = doDownloadBackup;
  ACT["share-backup"] = doShareBackup;
  ACT["backup-later"] = () => { S.meta.snooze = C.addDays(C.todayStr(), 3); saveMeta(); render(); };
  ACT["clear-damaged"] = () => {
    confirmSheet({
      title: "Clear the damaged record?", message: "This permanently removes " + S.damaged.length + " saved athlete record that Locker couldn't read. Your other athletes are not touched.",
      confirmText: "Clear it", danger: true,
      onConfirm() { S.damaged.forEach(id => store.del("a." + id)); S.damaged = []; closeAllSheets(); toast("Cleared.", "ok"); }
    });
  };
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })); } catch (e) { return false; }
  }
  ACT["backup-sheet"] = () => {
    closeAllSheets();
    openSheet({
      title: "Back up & restore", cls: "help",
      html: '<p class="msg">' + esc(lastBackupText()) + ".</p>" +
        '<p class="msg" style="margin-top:8px">Locker keeps everything on this phone only. If the phone is reset, or the browser clears its saved data, your stuff can disappear. A backup file is your safety copy.</p>' +
        '<div class="stack" style="margin-top:14px"><button type="button" class="btn block" data-act="dl-backup">Download backup file</button>' +
        (canShareFiles() ? '<button type="button" class="btn ghost block" data-act="share-backup">Share backup file...</button>' : "") +
        '<label class="btn ghost block file-btn" style="cursor:pointer">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Locker backup file"></label></div>' +
        '<p class="mute" style="margin-top:12px;font-size:15px">Save the file somewhere you can find it later (Files, Google Drive, or email it to yourself). Restoring replaces everything now in Locker on this phone.</p>' +
        (S.memMode ? '<p class="errmsg">This browser is not letting Locker save. Anything you add will be lost when you close the app. Back up before you leave.</p>' : "") +
        (S.damaged.length ? '<div class="game-sec"><p class="warnmsg">' + S.damaged.length + " saved athlete record couldn't be read. Your other athletes are fine.</p><button type=\"button\" class=\"btn danger block small\" data-act=\"clear-damaged\" style=\"margin-top:8px\">Clear the damaged record</button></div>" : "")
    });
  };
  function onRestoreFile(file) {
    if (!file) return;
    const bad = m => toast(m + " Nothing was changed.", "error", 6000);
    if (file.size > 25 * 1024 * 1024) return bad("That file is too big to be a Locker backup.");
    const rd = new FileReader();
    rd.onerror = () => bad("Couldn't read that file.");
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Locker backup (it can't be read)."); }
      const v = C.validateBackup(obj);
      if (!v.ok) return bad(v.error);
      const names = v.athletes.map(a => a.name).join(", ");
      const n = S.index.ids.length;
      confirmSheet({
        title: "Replace everything?",
        message: "This backup has " + v.athletes.length + (v.athletes.length === 1 ? " athlete" : " athletes") + ": " + names + ".",
        more: [n ? "Restoring replaces everything in Locker on this phone now (" + n + (n === 1 ? " athlete" : " athletes") + "). This cannot be undone." : "Nothing is on this phone yet, so nothing will be lost."],
        confirmText: "Restore", danger: n > 0, onConfirm() { applyRestore(v); }
      });
    };
    rd.readAsText(file);
  }
  function applyRestore(v) {
    const old = {};
    store.keys().filter(k => k === "index" || k.indexOf("a.") === 0).forEach(k => { old[k] = store.get(k); });
    const ids = v.athletes.map(a => a.id);
    try {
      v.athletes.forEach(a => { if (!store.set("a." + a.id, JSON.stringify(a))) throw new Error("write"); });
      if (!store.set("index", JSON.stringify({ v: 1, ids: ids, active: v.active }))) throw new Error("write");
      Object.keys(old).forEach(k => { if (k.indexOf("a.") === 0 && ids.indexOf(k.slice(2)) < 0) store.del(k); });
    } catch (e) {
      v.athletes.forEach(a => store.del("a." + a.id));
      Object.keys(old).forEach(k => { if (old[k] != null) store.set(k, old[k]); });
      return toast("Couldn't restore (storage problem). Your data on this phone was left as it was.", "error", 6500);
    }
    loadAll(); markBackup(); closeAllSheets(); render();
    toast("Restored " + v.athletes.length + (v.athletes.length === 1 ? " athlete." : " athletes."), "ok");
  }

  ACT["about"] = () => {
    closeAllSheets();
    openSheet({
      title: "Help & about", cls: "help",
      html: "<h3>What is Locker?</h3><p>Your sports notebook, in your pocket. Keep your daily practice, your games, your arm care, your favorite videos and your athlete card in one place.</p>" +
        "<h3>Today</h3><p>Add the drills you do. Tap <b>+1</b>, <b>+5</b> or <b>+10</b> as you finish reps. When every drill planned for the day hits its goal, the day counts and your streak grows. A day with nothing planned won't break your streak, but a planned day you skip will.</p>" +
        "<h3>Games</h3><p>Tap <b>Log a game</b> after a game and fill in what you did. The Season tab adds it all up and works out averages for you.</p>" +
        "<h3>Arm</h3><p>For baseball and softball. Log pitches thrown and Locker shows when you can pitch again. It warns you, it never blocks you.</p>" +
        "<h3>Clips</h3><p>Save links to videos. Only the link is saved here. The video stays where it lives.</p>" +
        "<h3>Card</h3><p>A one-page athlete card made from what you type. Save it as a picture, share it or print it. Nothing leaves your phone until you tap one of those buttons.</p>" +
        "<h3>Your privacy</h3><ul><li>Everything is saved on this phone only. There are no accounts and no servers.</li><li>Nothing about you goes into a web link.</li><li>Only files you choose to save or share (a backup, a card picture) leave the app.</li></ul>" +
        "<h3>Keep a backup</h3><p>A phone can clear a web app's saved data, for example after a reset or when it is low on space. Download a backup file now and then and keep it somewhere safe.</p>" +
        '<h3>About pitch counts</h3><div class="disclaimer"><p><b>Presets come from one league\'s rules. Always check your own league or tournament rules.</b></p><p>A pitch count includes only pitches thrown in games unless your league says otherwise.</p></div>' +
        '<div class="row wrap" style="margin-top:14px"><button type="button" class="btn ghost small" data-act="tips-reset">Show tips again</button><button type="button" class="btn ghost small" data-act="backup-sheet">Back up &amp; restore</button><button type="button" class="btn ghost small" onclick="window.nateHealth&&nateHealth.report()">Something wrong? Send a report</button></div>' +
        '<p class="ver">' + esc(C.VERSION) + " &middot; Made for young athletes and their families</p>"
    });
  };
  ACT["tips-reset"] = () => { S.meta.tips = {}; saveMeta(); closeAllSheets(); render(); toast("Tips are back.", "ok"); };
  ACT["tip-off"] = el => { S.meta.tips[el.dataset.id] = true; saveMeta(); render(); };

  function askPersist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }
  }

  /* ================= shell: header, nav, banners ================= */
  function tabsFor(a) {
    const t = [{ id: "today", label: "Today", icon: I.today }, { id: "games", label: "Games", icon: I.games }];
    if (hasArm(a)) t.push({ id: "arm", label: "Arm", icon: I.arm });
    t.push({ id: "clips", label: "Clips", icon: I.clips }, { id: "card", label: "Card", icon: I.card });
    return t;
  }
  function renderHeader(a) {
    $("#top").innerHTML = '<button type="button" class="chip-ath" data-act="switch" aria-haspopup="dialog" aria-label="Switch athlete. Showing ' + esc(a.name) + '"><span class="avatar" aria-hidden="true">' + esc(initial(a.name)) + '</span><span class="nm">' + esc(a.name) + '<span class="sp">' + esc(sportsText(a)) + "</span></span>" + I.chev + "</button>" +
      '<button type="button" class="icon-btn" data-act="menu" aria-haspopup="dialog" aria-label="Menu">' + I.dots + "</button>";
  }
  function renderNav(a) {
    $("#nav").innerHTML = '<div class="nav-in">' + tabsFor(a).map(t => '<button type="button" data-act="tab" data-tab="' + t.id + '"' + (S.tab === t.id ? ' aria-current="page"' : "") + ">" + t.icon + "<span>" + t.label + "</span></button>").join("") + "</div>";
  }
  function bannersHTML() {
    let h = "";
    if (S.memMode) h += '<div class="banner bad" role="alert"><p><b>This browser is not letting Locker save.</b> What you add will be lost when you close the app. Use Back up to keep a copy.</p><div class="row"><button type="button" class="btn small" data-act="backup-sheet">Back up</button></div></div>';
    const due = backupDueDays();
    if (due) h += '<div class="banner"><p><b>Time for a backup.</b> ' + (S.meta.lastBackup ? "It has been " + due + " days since your last one." : "You haven't backed up yet.") + " If this phone clears Locker's saved data, a backup file brings everything back.</p><div class=\"row\"><button type=\"button\" class=\"btn small\" data-act=\"dl-backup\">Back up now</button><button type=\"button\" class=\"btn ghost small\" data-act=\"backup-later\">Later</button></div></div>";
    return h;
  }
  ACT["tab"] = el => { S.tab = el.dataset.tab; S.viewDate = null; render(); window.scrollTo(0, 0); const m = $("#view"); if (m) m.focus({ preventScroll: true }); };

  /* render() redraws header, tabs and the current screen, then puts keyboard focus back where it was. */
  const VIEWS = {};
  function focusKey() {
    const el = document.activeElement;
    if (!el || el === document.body || !(el.closest && el.closest("#app"))) return null;
    return ["act", "id", "n", "tab", "date", "v"].map(k => el.dataset && el.dataset[k] != null ? "[data-" + k + '="' + el.dataset[k] + '"]' : "").join("");
  }
  function render() {
    const a = cur();
    const key = focusKey();
    const v = $("#view");
    S.day = C.todayStr();
    if (!a) {
      $("#top").hidden = true; $("#nav").hidden = true; v.classList.add("welcome-mode");
      renderWelcome(); return;
    }
    v.classList.remove("welcome-mode");
    $("#top").hidden = false; $("#nav").hidden = false;
    if (!tabsFor(a).some(t => t.id === S.tab)) S.tab = "today";
    renderHeader(a); renderNav(a);
    v.innerHTML = bannersHTML() + VIEWS[S.tab](a);
    if (VIEWS[S.tab + ":after"]) VIEWS[S.tab + ":after"](a);
    if (key) { let n = null; try { n = $(key, $("#app")); } catch (e) { /* ignore */ } if (n) { try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }

  /* ================= Today: daily reps and streaks ================= */
  const viewDay = () => { const t = C.todayStr(), v = S.viewDate; return v && v <= t && C.diffDays(t, v) <= 6 ? v : t; };
  const dayLong = d => C.fmtDate(d, { weekday: "long", month: "short", day: "numeric" });
  const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));

  function ringHTML(count, target) {
    const r = 32, c = 2 * Math.PI * r, p = Math.min(1, count / target);
    return '<div class="ring" aria-hidden="true"><svg viewBox="0 0 76 76"><circle class="trk" cx="38" cy="38" r="32"/><circle class="bar" cx="38" cy="38" r="32" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(2) + '"/></svg><span class="rn">' + count + "</span></div>";
  }
  function drillCardHTML(a, d, vd, opt) {
    const count = C.repsFor(a, vd, d.id), hit = count >= d.target, n = C.entriesFor(a, vd, d.id), nm = esc(d.name);
    const b = k => '<button type="button" data-act="rep" data-id="' + d.id + '" data-n="' + k + '" aria-label="Add ' + k + " to " + nm + '">+' + k + "</button>";
    return '<article class="drill' + (hit ? " hit" : "") + (opt ? " opt" : "") + (S.pulse === d.id ? " pulse" : "") + '"><div class="dtop">' + ringHTML(count, d.target) +
      '<div><h3 class="nm">' + nm + '</h3><p class="sub"><b>' + count + "</b> of " + d.target + " " + esc(d.unit) + (hit ? " &middot; Goal hit!" : "") + (opt ? " &middot; optional today" : "") + "</p></div></div>" +
      '<div class="reps" role="group" aria-label="Add to ' + nm + '">' + b(1) + b(5) + b(10) +
      '<button type="button" class="sm" data-act="rep-custom" data-id="' + d.id + '" aria-label="Add a different number to ' + nm + '">Other</button>' +
      '<button type="button" class="sm" data-act="undo" data-id="' + d.id + '"' + (n ? "" : " disabled") + ' aria-label="Undo last add for ' + nm + '">Undo</button></div></article>';
  }
  function emptyDrillsHTML(a) {
    const st = C.startersFor(a.sports);
    return '<div class="empty"><div class="big" aria-hidden="true">&#128170;</div><h3>Add your first drill</h3><p>A drill is something you practice, like 50 tee swings. Tap one below to add it, or make your own.</p>' +
      '<div class="pills" style="justify-content:center;margin-bottom:14px">' + st.map((s, i) => '<button type="button" class="pill" data-act="add-starter" data-n="' + i + '">+ ' + esc(s.name) + " " + s.target + (C.isTimeUnit(s.unit) ? " min" : "") + "</button>").join("") + "</div>" +
      '<button type="button" class="btn" data-act="drill-new">Make my own drill</button></div>';
  }
  VIEWS.today = a => {
    const today = C.todayStr(), vd = viewDay();
    let h = tip("today", "Add the drills you do. Tap <b>+1</b>, <b>+5</b> or <b>+10</b> as you finish reps. Hit every goal and the day counts toward your streak.");
    if (!a.drills.length) return h + emptyDrillsHTML(a);
    const st = C.streaks(a, today), tst = C.dayStatus(a, today, today);
    let msg;
    if (tst === "done") msg = "Today is done. Nice work!";
    else if (tst === "rest") msg = "Rest day today. Your streak is safe.";
    else if (st.cur > 0) msg = "Finish today's drills to keep your streak alive.";
    else if (st.best > 0) msg = "Finish every drill today to start a new streak.";
    else msg = "Finish every drill today to start your first streak.";
    h += '<section class="card streak' + (S.pulse === "streak" ? " pulse" : "") + '" aria-label="Streak"><div class="big"><span class="flame" aria-hidden="true">&#128293;</span><span id="streak-n">' + st.cur + "</span><small>" + (st.cur === 1 ? "day" : "days") + '</small></div><div class="meta"><div><div class="n">' + st.best + '</div><div class="l">Best streak</div></div></div><p class="msg">' + msg + "</p></section>";
    h += '<div class="strip" role="group" aria-label="Last 7 days">';
    for (let i = 6; i >= 0; i--) {
      const d = C.addDays(today, -i), s = C.dayStatus(a, d, today), wd = C.weekday(d);
      const mark = s === "done" ? "&#10003;" : s === "missed" ? "&#10005;" : s === "rest" ? "&ndash;" : "";
      const word = { done: "done", missed: "missed", rest: "rest day", open: "not finished yet", none: "before you started", future: "" }[s];
      h += '<button type="button" class="dstrip st-' + s + (d === today ? " today" : "") + '" data-act="pickday" data-date="' + d + '" aria-pressed="' + (d === vd) + '" aria-label="' + esc(dayLong(d) + ": " + word) + '"><span class="dl">' + C.DAY_SHORT[wd] + '</span><span class="dn">' + Number(d.slice(8)) + '</span><span class="mk" aria-hidden="true">' + mark + "</span></button>";
    }
    h += "</div>";
    h += '<div class="sec-title"><h2>Daily reps</h2><span class="sub">' + (vd === today ? "Today &middot; " : "") + esc(C.fmtDate(vd, { weekday: "short", month: "short", day: "numeric" })) + "</span></div>";
    if (vd !== today) h += '<div class="card"><div class="row sp"><span>Fixing <b>' + esc(dayLong(vd)) + '</b></span><button type="button" class="btn small" data-act="pickday" data-date="' + today + '">Back to today</button></div></div>';
    const sched = C.schedDrills(a, vd), opt = a.drills.filter(d => sched.indexOf(d) < 0 && d.created <= vd);
    if (!sched.length) h += '<div class="card"><p><b>Rest day.</b> Nothing is planned for ' + (vd === today ? "today" : "this day") + ". It will not break your streak.</p></div>";
    h += sched.map(d => drillCardHTML(a, d, vd, false)).join("");
    if (opt.length) h += '<p class="label" style="margin:14px 2px 8px">Not planned for ' + (vd === today ? "today" : "this day") + " (extra credit)</p>" + opt.map(d => drillCardHTML(a, d, vd, true)).join("");
    const w = C.weekSummary(a, today);
    h += '<div class="sec-title"><h2>This week</h2><span class="sub">Last 7 days</span></div><div class="card"><div class="week-sum"><span><b>' + w.daysDone + "</b> of " + w.daysSched + " days</span>" + (w.reps ? "<span><b>" + w.reps + "</b> reps</span>" : "") + (w.minutes ? "<span><b>" + w.minutes + "</b> min</span>" : "") + "</div>" +
      (w.per.length ? '<p class="mute" style="font-size:15px;margin-top:6px">' + w.per.map(p => esc(p.name) + " " + p.total + (C.isTimeUnit(p.unit) ? " min" : "")).join(" &middot; ") + "</p>" : '<p class="mute" style="font-size:15px;margin-top:4px">Nothing yet this week. Tap +1 to start.</p>') + "</div>";
    h += '<button type="button" class="btn ghost block" data-act="drills">Edit my drills</button>';
    return h;
  };
  VIEWS["today:after"] = () => { S.pulse = null; };

  function celebrate(a) {
    S.pulse = reduced() ? null : "streak";
    const st = C.streaks(a, C.todayStr());
    const nice = { 3: "Three in a row!", 7: "A whole week!", 14: "Two weeks strong!", 30: "A month of reps!", 50: "50 days!", 100: "100 days. Wow!" }[st.cur];
    toast("Day complete! " + (nice || "Streak: " + plural(st.cur, "day")), "ok", 3600);
    render();
    confetti();
  }
  function addRep(drillId, n) {
    const a = cur(), d = a.drills.find(x => x.id === drillId); if (!d) return;
    const vd = viewDay();
    n = C.int(n, 1, 99999, 0); if (!n) return;
    const before = C.repsFor(a, vd, drillId), wasDone = C.liveDay(a, vd).done;
    if (before + n > 99999) return toast("That is a lot of reps! Try a smaller number.", "error");
    const rec = a.days[vd] || (a.days[vd] = { r: {} });
    (rec.r[drillId] = rec.r[drillId] || []).push(n);
    C.refreshDay(a, vd);
    saveAth(a);
    const nowDone = rec.done && C.liveDay(a, vd).done;
    if (nowDone && !wasDone) return celebrate(a);
    if (before < d.target && before + n >= d.target && !reduced()) S.pulse = d.id;
    render();
  }
  ACT["rep"] = el => addRep(el.dataset.id, Number(el.dataset.n));
  ACT["undo"] = el => {
    const a = cur(), vd = viewDay(), rec = a.days[vd], arr = rec && rec.r && rec.r[el.dataset.id];
    if (!arr || !arr.length) return;
    const last = arr.pop();
    if (!arr.length) delete rec.r[el.dataset.id];
    C.refreshDay(a, vd); saveAth(a); render();
    toast("Took off " + last + ".", "ok", 1800);
  };
  ACT["pickday"] = el => { const d = el.dataset.date; S.viewDate = d === C.todayStr() ? null : d; render(); };
  ACT["rep-custom"] = el => {
    const a = cur(), d = a.drills.find(x => x.id === el.dataset.id); if (!d) return;
    openSheet({
      title: "Add to " + d.name, autofocus: "#rep-n",
      html: '<label class="field"><span class="label">How many ' + esc(d.unit) + "?</span><input type=\"number\" id=\"rep-n\" inputmode=\"numeric\" min=\"1\" max=\"9999\" placeholder=\"For example 12\"></label><p class=\"errmsg\" id=\"rep-err\" role=\"alert\" hidden>Type a number from 1 to 9999.</p>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>Add</button>',
      onOpen(api) {
        const go = () => {
          const n = C.int($("#rep-n", api.el).value, 1, 9999, null);
          if (n === null || !/^\d+$/.test($("#rep-n", api.el).value.trim())) { $("#rep-err", api.el).hidden = false; return; }
          api.close(); addRep(d.id, n);
        };
        $("[data-save]", api.el).addEventListener("click", go);
        $("#rep-n", api.el).addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      }
    });
  };

  /* drills: add, edit, reorder, delete */
  let drillsSheet = null;
  function drillsListHTML(a) {
    const used = a.drills.map(d => d.name.toLowerCase());
    const starters = C.startersFor(a.sports).filter(s => used.indexOf(s.name.toLowerCase()) < 0);
    return (a.drills.length ? a.drills.map((d, i) => '<div class="dr-row"><button type="button" class="mini" data-act="drill-up" data-id="' + d.id + '"' + (i === 0 ? " disabled" : "") + ' aria-label="Move ' + esc(d.name) + ' up">&uarr;</button><button type="button" class="mini" data-act="drill-down" data-id="' + d.id + '"' + (i === a.drills.length - 1 ? " disabled" : "") + ' aria-label="Move ' + esc(d.name) + ' down">&darr;</button><div class="t">' + esc(d.name) + "<small>" + d.target + " " + esc(d.unit) + " &middot; " + esc(C.daysLabel(d.days)) + '</small></div><button type="button" class="edit" data-act="drill-edit" data-id="' + d.id + '" aria-label="Edit ' + esc(d.name) + '">Edit</button></div>').join("") : '<p class="mute">No drills yet.</p>') +
      '<button type="button" class="btn block" data-act="drill-new" style="margin-top:14px">+ Add a drill</button>' +
      (starters.length ? '<p class="label" style="margin:16px 0 8px">Ideas for ' + esc(a.name) + '</p><div class="pills">' + starters.map(s => '<button type="button" class="pill" data-act="add-starter" data-n="' + C.startersFor(a.sports).findIndex(x => x.name === s.name) + '">+ ' + esc(s.name) + "</button>").join("") + "</div>" : "");
  }
  function refreshDrillsSheet() { if (drillsSheet && !drillsSheet.closed) drillsSheet.body.innerHTML = drillsListHTML(cur()); }
  ACT["drills"] = () => { drillsSheet = openSheet({ title: "My drills", html: drillsListHTML(cur()), onClose() { drillsSheet = null; } }); };
  ACT["add-starter"] = el => {
    const a = cur(), s = C.startersFor(a.sports)[Number(el.dataset.n)]; if (!s) return;
    if (a.drills.some(d => d.name.toLowerCase() === s.name.toLowerCase())) return toast("You already have that drill.", "error");
    a.drills.push({ id: C.uid(), name: s.name, unit: s.unit, target: s.target, days: [0, 1, 2, 3, 4, 5, 6], created: C.todayStr() });
    saveAth(a); render(); refreshDrillsSheet();
    toast("Added " + s.name + ". Tap Edit drills to change the goal or days.", "ok", 3400);
  };
  ACT["drill-up"] = el => moveDrill(el.dataset.id, -1);
  ACT["drill-down"] = el => moveDrill(el.dataset.id, 1);
  function moveDrill(id, dir) {
    const a = cur(), i = a.drills.findIndex(d => d.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= a.drills.length) return;
    const t = a.drills[i]; a.drills[i] = a.drills[j]; a.drills[j] = t;
    saveAth(a); render(); refreshDrillsSheet();
    const again = drillsSheet && $('[data-act="' + (dir < 0 ? "drill-up" : "drill-down") + '"][data-id="' + id + '"]:not([disabled])', drillsSheet.el);
    if (again) again.focus({ preventScroll: true });
  }
  ACT["drill-new"] = () => openDrillForm(null);
  ACT["drill-edit"] = el => openDrillForm(el.dataset.id);
  function openDrillForm(id) {
    const a = cur(), d = id ? a.drills.find(x => x.id === id) : null;
    const days = d ? d.days : [0, 1, 2, 3, 4, 5, 6];
    openSheet({
      title: d ? "Edit drill" : "New drill", autofocus: d ? null : "#d-name",
      html: '<label class="field"><span class="label">Drill name</span><input type="text" id="d-name" maxlength="40" autocomplete="off" placeholder="For example Tee swings" value="' + esc(d ? d.name : "") + '"></label>' +
        '<div class="cols2"><label class="field"><span class="label">Goal per day</span><input type="number" id="d-target" inputmode="numeric" min="1" max="9999" value="' + (d ? d.target : 20) + '"></label>' +
        '<label class="field"><span class="label">Counted in</span><input type="text" id="d-unit" maxlength="14" list="d-units" autocomplete="off" value="' + esc(d ? d.unit : "reps") + '"><datalist id="d-units"><option value="reps"><option value="min"><option value="swings"><option value="throws"><option value="shots"><option value="catches"></datalist></label></div>' +
        '<div class="field"><span class="label" id="d-days-l">Days I do this</span><div class="daytog" role="group" aria-labelledby="d-days-l">' + C.WEEK_ORDER.map(w => '<button type="button" class="pill" data-day="' + w + '" aria-pressed="' + (days.indexOf(w) >= 0) + '" aria-label="' + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w] + '">' + C.DAY_SHORT[w].slice(0, 3) + "</button>").join("") + '</div><span class="hint">Days you leave off are rest days. They do not break your streak.</span></div>' +
        '<p class="errmsg" id="d-err" role="alert" hidden></p>' +
        (d ? '<div class="game-sec"><button type="button" class="btn danger block" data-del>Delete this drill</button></div>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>' + (d ? "Save" : "Add drill") + "</button>",
      onOpen(api) {
        const err = m => { const e = $("#d-err", api.el); e.textContent = m; e.hidden = !m; };
        api.el.addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); });
        $("[data-save]", api.el).addEventListener("click", () => {
          const name = $("#d-name", api.el).value.trim(), unit = $("#d-unit", api.el).value.trim() || "reps";
          const tv = $("#d-target", api.el).value.trim(), target = /^\d+$/.test(tv) ? C.int(tv, 1, 9999, null) : null;
          const sel = $$("[data-day]", api.el).filter(b => b.getAttribute("aria-pressed") === "true").map(b => Number(b.dataset.day)).sort();
          if (!name) return err("Give the drill a name.");
          if (target === null || target < 1) return err("Type a goal from 1 to 9999.");
          if (!sel.length) return err("Tap at least one day.");
          if (a.drills.some(x => x.id !== (d && d.id) && x.name.toLowerCase() === name.toLowerCase())) return err("You already have a drill with that name.");
          if (d) { d.name = name; d.unit = unit; d.target = target; d.days = sel; }
          else a.drills.push({ id: C.uid(), name: name, unit: unit, target: target, days: sel, created: C.todayStr() });
          saveAth(a); api.close(); render(); refreshDrillsSheet();
          toast(d ? "Saved." : "Added " + name + ".", "ok");
        });
        const del = $("[data-del]", api.el);
        if (del) del.addEventListener("click", () => confirmSheet({
          title: "Delete " + d.name + "?", message: "The drill goes away. Your past days and streak stay as they were.", confirmText: "Delete drill", danger: true,
          onConfirm() { a.drills = a.drills.filter(x => x.id !== d.id); saveAth(a); api.close(); render(); refreshDrillsSheet(); toast("Deleted.", "ok"); }
        }));
      }
    });
  }

  /* ================= Games ================= */
  const GAME_SPORTS = ["baseball", "softball", "basketball", "football"];
  const gameSports = a => C.SPORT_IDS.filter(s => a.sports.indexOf(s) >= 0 || a.games.some(g => g.sport === s));
  const byDateDesc = (x, y) => (y.date.localeCompare(x.date)) || (x.id < y.id ? 1 : -1);
  function seasonList(a) {
    const best = {};
    a.games.forEach(g => { if (!best[g.season] || g.date > best[g.season]) best[g.season] = g.date; });
    return Object.keys(best).sort((x, y) => best[y].localeCompare(best[x]));
  }
  function gamesState(a) {
    if (S.gf.id !== a.id) S.gf = { id: a.id, season: undefined, sport: null, mode: S.gf.mode || "log" };
    const seasons = seasonList(a), sports = gameSports(a);
    if (S.gf.season === undefined || (S.gf.season !== "all" && seasons.indexOf(S.gf.season) < 0)) S.gf.season = seasons[0] || "all";
    if (!S.gf.sport || sports.indexOf(S.gf.sport) < 0) S.gf.sport = sports[0];
    return { seasons, sports };
  }
  function filteredGames(a) { gamesState(a); return a.games.filter(g => g.sport === S.gf.sport && (S.gf.season === "all" || g.season === S.gf.season)).sort(byDateDesc); }

  function gameSummary(g) {
    const bits = [];
    if (g.bat && g.bat.ab + g.bat.bb > 0) {
      bits.push(g.bat.h + "-for-" + g.bat.ab);
      if (g.bat.hr) bits.push(g.bat.hr + " HR"); if (g.bat.rbi) bits.push(g.bat.rbi + " RBI"); if (g.bat.sb) bits.push(g.bat.sb + " SB");
    }
    if (g.pit && (g.pit.outs > 0 || g.pit.np > 0)) { bits.push(C.fmtIP(g.pit.outs) + " IP"); if (g.pit.np) bits.push(g.pit.np + " P"); if (g.pit.k) bits.push(g.pit.k + " K"); }
    if (g.bk) { bits.push(g.bk.pts + " PTS", g.bk.reb + " REB", g.bk.ast + " AST"); }
    if (g.fb) { const f = g.fb; if (f.tkl) bits.push(f.tkl + " TKL"); if (f.rec) bits.push(f.rec + " REC"); if (f.yds) bits.push(f.yds + " YDS"); if (f.td) bits.push(f.td + " TD"); }
    if (!bits.length) return g.notes ? g.notes : "No stats saved";
    return bits.join(" · ");
  }
  function gameRowHTML(g) {
    const score = g.us !== null && g.them !== null ? g.us + "-" + g.them : "";
    const res = g.result ? '<span class="gres ' + g.result + '">' + g.result + (score ? " " + score : "") + "</span>" : (score ? '<span class="gres">' + score + "</span>" : "");
    return '<button type="button" class="grow" data-act="game-edit" data-id="' + g.id + '"><span class="gdate"><b>' + Number(g.date.slice(8)) + "</b><span>" + esc(C.fmtDate(g.date, { month: "short" })) + " " + g.date.slice(0, 4) + '</span></span><span class="ginfo"><span class="opp" style="display:block">' + (g.opp ? "vs " + esc(g.opp) : "Game") + '</span><span class="sum" style="display:block">' + esc(gameSummary(g)) + "</span></span>" + res + "</button>";
  }
  const tile = (k, v, hero) => '<div class="stat' + (hero ? " hero" : "") + '"><div class="v">' + v + '</div><div class="k">' + k + "</div></div>";

  function seasonHTML(a, games) {
    const sport = S.gf.sport, rec = C.record(games);
    const seasonName = S.gf.season === "all" ? "All time" : S.gf.season;
    let h = '<div class="card"><div class="row sp"><div><div class="label">' + esc(C.sportInfo(sport).label + " · " + seasonName) + '</div><div class="num" style="font-size:42px;line-height:1">' + plural(games.length, "game") + '</div></div><div style="text-align:right"><div class="num" style="font-size:42px;line-height:1">' + rec.w + "-" + rec.l + (rec.t ? "-" + rec.t : "") + '</div><div class="label">' + (rec.t ? "W-L-T" : "W-L") + "</div></div></div></div>";
    if (!games.length) return h + '<p class="mute" style="text-align:center">No games in this season yet.</p>';
    if (sport === "baseball" || sport === "softball") {
      const b = C.battingTotals(games), p = C.pitchingTotals(games, a.settings.ipg);
      h += '<div class="card"><div class="block-title"><h3>Batting</h3></div><div class="statgrid">' + tile("AVG", C.fmtRate(b.avg), 1) + tile("OBP", C.fmtRate(b.obp), 1) + tile("SLG", C.fmtRate(b.slg), 1) + tile("OPS", C.fmtRate(b.ops), 1) + "</div>" +
        '<div class="statgrid five">' + tile("AB", b.ab) + tile("H", b.h) + tile("2B", b.d2) + tile("3B", b.d3) + tile("HR", b.hr) + tile("BB", b.bb) + tile("K", b.k) + tile("RBI", b.rbi) + tile("R", b.r) + tile("SB", b.sb) + "</div>" +
        '<p class="formula">AVG = hits &divide; at bats. OBP = (hits + walks) &divide; (at bats + walks). SLG = total bases &divide; at bats. OPS = OBP + SLG.</p></div>';
      if (p.g > 0 || p.outs > 0) {
        h += '<div class="card"><div class="block-title"><h3>Pitching</h3></div><div class="statgrid">' + tile("ERA", C.fmtDec(p.era, 2), 1) + tile("WHIP", C.fmtDec(p.whip, 2), 1) + tile("IP", p.ipText, 1) + tile("K", p.k, 1) + "</div>" +
          '<div class="statgrid six">' + tile("G", p.g) + tile("P", p.np) + tile("BB", p.bb) + tile("H", p.h) + tile("R", p.r) + tile("ER", p.er) + "</div>" +
          '<div class="field" style="margin:10px 0 0"><span class="label" id="ipg-l">Innings in a full game</span><div class="pills" role="group" aria-labelledby="ipg-l" style="margin-top:6px"><button type="button" class="pill" data-act="ipg" data-v="6" aria-pressed="' + (a.settings.ipg === 6) + '">6 innings</button><button type="button" class="pill" data-act="ipg" data-v="7" aria-pressed="' + (a.settings.ipg === 7) + '">7 innings</button></div></div>' +
          '<p class="formula">ERA = earned runs &times; ' + p.ipg + " &divide; innings pitched. WHIP = (walks + hits) &divide; innings pitched. 4.1 IP means 4 and 1/3 innings.</p></div>";
      }
    } else if (sport === "basketball") {
      const t = C.basketballTotals(games);
      h += '<div class="card"><div class="block-title"><h3>Per game</h3></div><div class="statgrid">' + tile("PPG", C.fmtDec(t.ppg, 1), 1) + tile("RPG", C.fmtDec(t.rpg, 1), 1) + tile("APG", C.fmtDec(t.apg, 1), 1) + tile("SPG", C.fmtDec(t.spg, 1), 1) + "</div></div>" +
        '<div class="card"><div class="block-title"><h3>Totals</h3></div><div class="statgrid">' + tile("PTS", t.pts) + tile("REB", t.reb) + tile("AST", t.ast) + tile("STL", t.stl) + tile("BLK", t.blk) + tile("TO", t.to) + tile("3PM", t.tpm) + tile("Games", t.g) + "</div></div>";
    } else if (sport === "football") {
      const t = C.footballTotals(games);
      h += '<div class="card"><div class="block-title"><h3>Totals</h3></div><div class="statgrid">' + tile("Tackles", t.tkl, 1) + tile("Catches", t.rec, 1) + tile("Yards", t.yds, 1) + tile("TD", t.td, 1) + "</div></div>";
    } else h += '<p class="mute" style="text-align:center">' + esc(C.sportInfo(sport).label) + " games keep a score and notes. Tap Log to see them.</p>";
    return h;
  }
  VIEWS.games = a => {
    const { seasons, sports } = gamesState(a);
    let h = tip("games", "After each game, tap <b>Log a game</b> and fill in your numbers. The <b>Season</b> tab adds them up for you.");
    if (!a.games.length) {
      return h + '<div class="empty"><div class="big" aria-hidden="true">&#127942;</div><h3>No games yet</h3><p>After your next game, tap the button below and write down how you did.</p><button type="button" class="btn" data-act="game-new">Log your first game</button></div>';
    }
    h += '<button type="button" class="btn block" data-act="game-new">+ Log a game</button><div style="height:12px"></div>';
    h += '<div class="row" style="margin-bottom:12px"><label class="sr" for="gsel">Season</label><select id="gsel" style="flex:1 1 auto">' + seasons.map(s => '<option value="' + esc(s) + '"' + (S.gf.season === s ? " selected" : "") + ">" + esc(s) + "</option>").join("") + '<option value="all"' + (S.gf.season === "all" ? " selected" : "") + ">All time</option></select></div>";
    if (sports.length > 1) h += '<div class="pills" style="margin-bottom:12px" role="group" aria-label="Sport">' + sports.map(s => '<button type="button" class="pill" data-act="gsport" data-v="' + s + '" aria-pressed="' + (S.gf.sport === s) + '">' + C.sportInfo(s).icon + " " + esc(C.sportInfo(s).label) + "</button>").join("") + "</div>";
    h += '<div class="seg" role="group" aria-label="View"><button type="button" class="pill" data-act="gmode" data-v="log" aria-pressed="' + (S.gf.mode === "log") + '">Log</button><button type="button" class="pill" data-act="gmode" data-v="season" aria-pressed="' + (S.gf.mode === "season") + '">Season</button></div>';
    const games = filteredGames(a);
    if (S.gf.mode === "season") return h + seasonHTML(a, games);
    return h + (games.length ? games.map(gameRowHTML).join("") : '<p class="mute" style="text-align:center;padding:16px 0">No ' + esc(C.sportInfo(S.gf.sport).label.toLowerCase()) + " games in this season. Pick another season above, or tap Log a game.</p>");
  };
  ACT["gmode"] = el => { S.gf.mode = el.dataset.v; render(); };
  ACT["gsport"] = el => { S.gf.sport = el.dataset.v; render(); };
  ACT["ipg"] = el => { const a = cur(); a.settings.ipg = Number(el.dataset.v) === 7 ? 7 : 6; saveAth(a); render(); };
  ACT["game-new"] = () => openGameSheet(null);
  ACT["game-edit"] = el => openGameSheet(el.dataset.id);

  function syncArmFromGame(a, g) {
    a.arm.log = a.arm.log.filter(e => e.gameId !== g.id);
    if ((g.sport === "baseball" || g.sport === "softball") && g.pit && g.pit.np > 0) {
      a.arm.log.push({ id: C.uid(), date: g.date, np: g.pit.np, note: "Game" + (g.opp ? " vs " + g.opp : ""), gameId: g.id });
      return true;
    }
    return false;
  }
  const getPath = (o, p) => p.split(".").reduce((x, k) => (x ? x[k] : undefined), o);
  function setPath(o, p, v) { const ks = p.split("."), last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; }
  function stepperHTML(path, label, val, o) {
    o = o || {};
    const stack = !!o.big, L = esc(label);
    const bigBtn = (s) => '<button type="button" class="st big" data-step="' + s + '" aria-label="' + (s > 0 ? "Plus " : "Minus ") + Math.abs(s) + " " + L + '">' + (s > 0 ? "+" : "−") + Math.abs(s) + "</button>";
    return '<div class="stepper' + (stack ? " stack" : "") + '" data-path="' + path + '" data-max="' + (o.max || 999) + '"><div class="nm">' + L + (o.sub ? "<small>" + o.sub + "</small>" : "") + '</div><div class="ctl">' +
      (o.big ? bigBtn(-o.big) : "") + '<button type="button" class="st" data-step="-1" aria-label="Minus one ' + L + '">−</button><input type="number" inputmode="numeric" min="0" max="' + (o.max || 999) + '" value="' + val + '" aria-label="' + L + '"><button type="button" class="st" data-step="1" aria-label="Plus one ' + L + '">+</button>' + (o.big ? bigBtn(o.big) : "") + "</div></div>";
  }
  function gameStatsHTML(g) {
    const S1 = (p, l, o) => stepperHTML(p, l, getPath(g, p), o);
    const sp = g.sport;
    if (sp === "baseball" || sp === "softball") {
      return '<div class="game-sec"><h3>Batting</h3>' + S1("bat.ab", "At bats") + S1("bat.h", "Hits") + S1("bat.d2", "Doubles (2B)") + S1("bat.d3", "Triples (3B)") + S1("bat.hr", "Home runs") + S1("bat.bb", "Walks (BB)") + S1("bat.k", "Strikeouts (K)") + S1("bat.rbi", "RBI") + S1("bat.r", "Runs scored") + S1("bat.sb", "Stolen bases") + '<p class="errmsg" id="err-bat" role="alert" hidden></p></div>' +
        '<div class="game-sec"><div class="row sp"><h3 style="margin:0">Pitching</h3><button type="button" class="pill" data-act="g-pitch" aria-pressed="' + !!g._pitch + '">I pitched</button></div><div id="pit-body"' + (g._pitch ? "" : " hidden") + ' style="margin-top:6px">' +
        S1("pit.outs", "Outs recorded", { big: 3, sub: '<span id="ip-live">' + C.fmtIP(g.pit.outs) + " innings</span> &middot; 3 outs = 1 inning" }) + S1("pit.np", "Pitches thrown", { big: 5, sub: "Also added to your Arm log" }) + S1("pit.k", "Strikeouts") + S1("pit.bb", "Walks") + S1("pit.h", "Hits allowed") + S1("pit.r", "Runs allowed") + S1("pit.er", "Earned runs") + '<p class="errmsg" id="err-pit" role="alert" hidden></p></div></div>';
    }
    if (sp === "basketball") return '<div class="game-sec"><h3>Stats</h3>' + S1("bk.pts", "Points (PTS)", { big: 5 }) + S1("bk.reb", "Rebounds (REB)") + S1("bk.ast", "Assists (AST)") + S1("bk.stl", "Steals (STL)") + S1("bk.blk", "Blocks (BLK)") + S1("bk.to", "Turnovers (TO)") + S1("bk.tpm", "3-pointers made", { sub: "Already counted in your points" }) + "</div>";
    if (sp === "football") return '<div class="game-sec"><h3>Stats</h3>' + S1("fb.tkl", "Tackles") + S1("fb.rec", "Catches") + S1("fb.yds", "Yards", { big: 10, max: 9999 }) + S1("fb.td", "Touchdowns") + "</div>";
    return '<p class="mute" style="margin-top:8px">' + esc(C.sportInfo(sp).label) + " games keep a score and notes. Use the notes box below for how it went.</p>";
  }
  function gameErrors(g) {
    const e = {};
    if (g.sport === "baseball" || g.sport === "softball") {
      if (g.bat.h > g.bat.ab) e.bat = "Hits can't be more than at bats.";
      else if (g.bat.d2 + g.bat.d3 + g.bat.hr > g.bat.h) e.bat = "Doubles, triples and home runs can't add up to more than hits.";
      if (g._pitch && g.pit.er > g.pit.r) e.pit = "Earned runs can't be more than runs allowed.";
    }
    return e;
  }
  function openGameSheet(id) {
    const a = cur(), ex = id ? a.games.find(x => x.id === id) : null, today = C.todayStr();
    gamesState(a);
    const g = ex ? C.clone(ex) : { sport: S.gf.sport || a.sports[0], date: today, opp: "", result: "", us: null, them: null, season: "", notes: "" };
    g.bat = Object.assign({ ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, rbi: 0, r: 0, sb: 0 }, g.bat || {});
    g.pit = Object.assign({ outs: 0, np: 0, k: 0, bb: 0, h: 0, r: 0, er: 0 }, g.pit || {});
    g.bk = Object.assign({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tpm: 0 }, g.bk || {});
    g.fb = Object.assign({ tkl: 0, rec: 0, yds: 0, td: 0 }, g.fb || {});
    g._pitch = !!(g.pit.outs || g.pit.np);
    let seasonManual = !!(ex && ex.season !== ex.date.slice(0, 4)), resultManual = !!(ex && ex.result);
    if (!g.season) g.season = g.date.slice(0, 4);
    const sports = gameSports(a).length ? Array.from(new Set(a.sports.concat(ex ? [ex.sport] : []))) : a.sports;
    const html = () =>
      (sports.length > 1 ? '<div class="field"><span class="label" id="g-sp-l">Sport</span><div class="pills" role="group" aria-labelledby="g-sp-l">' + sports.map(s => '<button type="button" class="pill" data-gsport="' + s + '" aria-pressed="' + (g.sport === s) + '">' + C.sportInfo(s).icon + " " + esc(C.sportInfo(s).label) + "</button>").join("") + "</div></div>" : "") +
      '<div class="cols2"><label class="field"><span class="label">Date</span><input type="date" id="g-date" max="' + today + '" value="' + g.date + '"></label><label class="field"><span class="label">Season</span><input type="text" id="g-season" maxlength="24" value="' + esc(g.season) + '"></label></div>' +
      '<label class="field"><span class="label">Opponent</span><input type="text" id="g-opp" maxlength="60" autocomplete="off" placeholder="Who did you play?" value="' + esc(g.opp) + '"></label>' +
      '<div class="field"><span class="label" id="g-res-l">Result</span><div class="pills" role="group" aria-labelledby="g-res-l">' + [["W", "Win"], ["L", "Loss"], ["T", "Tie"], ["", "No result"]].map(r => '<button type="button" class="pill" data-gres="' + r[0] + '" aria-pressed="' + (g.result === r[0]) + '">' + r[1] + "</button>").join("") + "</div></div>" +
      '<div class="cols2"><label class="field"><span class="label">Our score</span><input type="number" id="g-us" inputmode="numeric" min="0" max="999" value="' + (g.us === null ? "" : g.us) + '"></label><label class="field"><span class="label">Their score</span><input type="number" id="g-them" inputmode="numeric" min="0" max="999" value="' + (g.them === null ? "" : g.them) + '"></label></div>' +
      '<div id="g-stats">' + gameStatsHTML(g) + "</div>" +
      '<label class="field" style="margin-top:14px"><span class="label">Notes (optional)</span><textarea id="g-notes" maxlength="600" placeholder="How did it go? What will you work on?">' + esc(g.notes) + "</textarea></label>" +
      '<p class="errmsg" id="g-err" role="alert" hidden></p>' +
      (ex ? '<div class="game-sec"><button type="button" class="btn danger block" data-del>Delete this game</button></div>' : "");
    openSheet({
      title: ex ? "Edit game" : "Log a game", html: html(),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>' + (ex ? "Save game" : "Save game") + "</button>",
      onOpen(api) {
        const root = api.el;
        const showErrors = () => {
          const e = gameErrors(g);
          ["bat", "pit"].forEach(k => { const n = $("#err-" + k, root); if (n) { n.textContent = e[k] || ""; n.hidden = !e[k]; } });
          return e;
        };
        const restats = () => { $("#g-stats", root).innerHTML = gameStatsHTML(g); showErrors(); };
        const setStat = (path, v, input) => {
          const box = input.closest(".stepper"), max = Number(box.dataset.max) || 999;
          v = clamp(Math.round(Number(v) || 0), 0, max);
          setPath(g, path, v);
          if (path === "pit.outs") { const l = $("#ip-live", root); if (l) l.textContent = C.fmtIP(v) + " innings"; }
          showErrors();
          return v;
        };
        const autoResult = () => {
          const us = $("#g-us", root).value, th = $("#g-them", root).value;
          g.us = us === "" ? null : C.int(us, 0, 999, null); g.them = th === "" ? null : C.int(th, 0, 999, null);
          if (!resultManual && g.us !== null && g.them !== null) { g.result = g.us > g.them ? "W" : g.us < g.them ? "L" : "T"; $$("[data-gres]", root).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.gres === g.result))); }
        };
        root.addEventListener("click", e => {
          const st = e.target.closest("[data-step]");
          if (st) { const box = st.closest(".stepper"), inp = $("input", box), path = box.dataset.path; inp.value = setStat(path, (Number(inp.value) || 0) + Number(st.dataset.step), inp); return; }
          const gs = e.target.closest("[data-gsport]");
          if (gs) { g.sport = gs.dataset.gsport; $$("[data-gsport]", root).forEach(b => b.setAttribute("aria-pressed", String(b === gs))); restats(); return; }
          const gr = e.target.closest("[data-gres]");
          if (gr) { g.result = gr.dataset.gres; resultManual = true; $$("[data-gres]", root).forEach(b => b.setAttribute("aria-pressed", String(b === gr))); return; }
          const gp = e.target.closest('[data-act="g-pitch"]');
          if (gp) { g._pitch = !g._pitch; gp.setAttribute("aria-pressed", String(g._pitch)); $("#pit-body", root).hidden = !g._pitch; showErrors(); }
        });
        root.addEventListener("input", e => {
          const t = e.target;
          if (t.closest(".stepper") && t.tagName === "INPUT") { setStat(t.closest(".stepper").dataset.path, t.value, t); return; }
          if (t.id === "g-us" || t.id === "g-them") autoResult();
          if (t.id === "g-season") { seasonManual = true; g.season = t.value; }
        });
        root.addEventListener("change", e => {
          const t = e.target;
          if (t.closest(".stepper") && t.tagName === "INPUT") t.value = setStat(t.closest(".stepper").dataset.path, t.value, t);
          if (t.id === "g-date" && C.isYMD(t.value)) { g.date = t.value; if (!seasonManual) { g.season = t.value.slice(0, 4); $("#g-season", root).value = g.season; } }
        });
        $("[data-save]", root).addEventListener("click", () => {
          const err = $("#g-err", root);
          const d = $("#g-date", root).value;
          const fail = m => { err.textContent = m; err.hidden = false; toast(m, "error"); };
          if (!C.isYMD(d)) return fail("Pick the date of the game.");
          if (d > today) return fail("Pick today or an earlier date.");
          g.date = d; g.opp = $("#g-opp", root).value.trim(); g.notes = $("#g-notes", root).value; g.season = ($("#g-season", root).value.trim() || d.slice(0, 4));
          autoResult();
          const e = showErrors(), first = e.bat || e.pit;
          if (first) return fail(first);
          err.hidden = true;
          const clean = C.sanitizeGame(Object.assign({}, g, { id: ex ? ex.id : C.uid() }), a.sports[0]);
          if (!clean) return fail("Couldn't save that game. Check the date.");
          if (ex) a.games[a.games.findIndex(x => x.id === ex.id)] = clean; else a.games.push(clean);
          const toArm = syncArmFromGame(a, clean);
          S.gf.season = clean.season; S.gf.sport = clean.sport;
          saveAth(a); api.close(); render();
          toast(ex ? "Game saved." : "Game logged." + (toArm ? " Pitches were added to your Arm log." : ""), "ok", 3200);
        });
        const del = $("[data-del]", root);
        if (del) del.addEventListener("click", () => confirmSheet({
          title: "Delete this game?", message: "This removes the game" + (ex.opp ? " against " + ex.opp : "") + " and its stats" + (ex.pit && ex.pit.np ? ", including its pitches in your Arm log" : "") + ". This cannot be undone.", confirmText: "Delete game", danger: true,
          onConfirm() { a.games = a.games.filter(x => x.id !== ex.id); a.arm.log = a.arm.log.filter(x => x.gameId !== ex.id); saveAth(a); api.close(); render(); toast("Game deleted.", "ok"); }
        }));
      }
    });
  }

  /* ================= Arm care ================= */
  const restWord = n => n === 0 ? "no rest days" : plural(n, "rest day");
  VIEWS.arm = a => {
    const today = C.todayStr(), sum = C.armSummary(a.arm, a.arm.log, today), rules = sum.rules;
    let h = tip("arm", "Log how many pitches you throw in games. Locker shows when you can pitch again. It warns you, it never stops you.");
    let cls = "", big = "", line = "";
    if (sum.status === "rest") { cls = "rest"; big = "Rest needed"; line = plural(sum.restLeft, "more day") + " of rest."; }
    else if (sum.status === "pitched") { cls = sum.overToday ? "pitched over" : "pitched"; big = "Pitched today"; line = sum.todayTotal + " pitches today" + (sum.overToday ? ", " + sum.overToday + " over the daily max." : ". " + sum.pitchesLeft + " left before the daily max."); }
    else { big = "OK to pitch"; line = "Up to " + rules.dailyMax + " pitches today."; }
    h += '<section class="status ' + cls + '" aria-label="Pitching status" aria-live="polite"><div class="big">' + big + "</div><p>" + esc(line) + "</p></section>";
    h += '<div class="statgrid"><div class="stat"><div class="v" style="font-size:24px">' + (sum.availableNow ? "Today" : esc(C.fmtDate(sum.nextAvail, { weekday: "short", month: "short", day: "numeric" }))) + '</div><div class="k">' + (sum.status === "pitched" ? "Next available" : "Available") + '</div></div><div class="stat"><div class="v">' + sum.restLeft + '</div><div class="k">Rest days left</div></div><div class="stat"><div class="v">' + sum.week7 + '</div><div class="k">Last 7 days</div></div><div class="stat"><div class="v">' + sum.todayTotal + '</div><div class="k">Today</div></div></div>';
    h += '<button type="button" class="btn block" data-act="arm-add" style="margin-top:12px">+ Log pitches</button>';
    h += '<div class="sec-title"><h2>Pitch log</h2><span class="sub">' + esc(a.arm.preset) + " &middot; " + rules.dailyMax + " max a day</span></div>";
    if (!a.arm.log.length) h += '<div class="empty"><div class="big" aria-hidden="true">&#9918;</div><h3>No pitches logged</h3><p>After you pitch in a game, tap Log pitches and enter how many you threw.</p></div>';
    else {
      const dayMap = {}; sum.days.forEach(d => { dayMap[d.date] = d; });
      h += a.arm.log.slice().sort((x, y) => y.date.localeCompare(x.date) || (x.id < y.id ? 1 : -1)).slice(0, 60).map(e => {
        const dd = dayMap[e.date];
        return '<button type="button" class="logrow" data-act="arm-edit" data-id="' + e.id + '"><span class="np">' + e.np + "<small>PITCHES</small></span><span class=\"inf\"><b>" + esc(C.fmtDate(e.date, { weekday: "short", month: "short", day: "numeric" })) + (dd && dd.over ? '<span class="badge bad">Over ' + rules.dailyMax + "</span>" : "") + (dd && dd.early ? '<span class="badge">Rest day</span>' : "") + "</b><span>" + [esc(e.note || (e.gameId ? "From a game" : "")), dd && dd.total !== e.np ? "day total " + dd.total : "", dd ? restWord(dd.rest) : ""].filter(Boolean).join(" &middot; ") + "</span></span>" + I.go + "</button>";
      }).join("");
      if (a.arm.log.length > 60) h += '<p class="mute" style="text-align:center;font-size:14px">Showing the latest 60 entries. Older ones still count for rest days.</p>';
    }
    h += '<div class="sec-title"><h2>Rules</h2><span class="sub">Pick your league\'s division</span></div><div class="card"><div class="pills" role="group" aria-label="Rules preset" style="margin-bottom:12px">' + C.PRESET_NAMES.map(p => '<button type="button" class="pill" data-act="arm-preset" data-v="' + p + '" aria-pressed="' + (a.arm.preset === p) + '">' + p + "</button>").join("") + "</div>" +
      '<p><b>Daily max: ' + rules.dailyMax + " pitches</b></p><table class=\"tier-table\"><thead><tr><th>Pitches thrown</th><th>Rest needed</th></tr></thead><tbody>" +
      rules.tiers.map(t => "<tr><td>" + (t.max >= 999 ? t.min + " or more" : t.min + " to " + t.max) + "</td><td>" + restWord(t.restDays) + "</td></tr>").join("") + "</tbody></table>" +
      (a.arm.preset === "Custom" ? '<button type="button" class="btn ghost block small" data-act="arm-rules">Edit my custom rules</button>' : "") +
      '<div class="disclaimer"><p><b>Presets come from one league\'s rules. Always check your own league or tournament rules.</b></p><p>A pitch count includes only pitches thrown in games unless your league says otherwise.</p></div></div>';
    return h;
  };
  ACT["arm-preset"] = el => { const a = cur(); a.arm.preset = el.dataset.v; saveAth(a); render(); };
  ACT["arm-add"] = () => openArmSheet(null);
  ACT["arm-edit"] = el => openArmSheet(el.dataset.id);
  function openArmSheet(id) {
    const a = cur(), ex = id ? a.arm.log.find(e => e.id === id) : null, today = C.todayStr();
    const linked = ex && ex.gameId && a.games.some(g => g.id === ex.gameId);
    const e = ex ? C.clone(ex) : { date: today, np: 0, note: "" };
    openSheet({
      title: ex ? "Edit pitches" : "Log pitches",
      html: (linked ? '<p class="warnmsg" style="margin:0 0 10px">These pitches came from a game. To change them, edit the game.</p>' : "") +
        '<label class="field"><span class="label">Date</span><input type="date" id="a-date" max="' + today + '" value="' + e.date + '"' + (linked ? " disabled" : "") + "></label>" +
        (linked ? "" : stepperHTML("np", "Pitches thrown", e.np, { big: 5, max: 300 })) + (linked ? '<p class="msg"><b>' + e.np + "</b> pitches</p>" : "") +
        '<label class="field" style="margin-top:12px"><span class="label">Note (optional)</span><input type="text" id="a-note" maxlength="80" autocomplete="off" placeholder="For example Tournament game 2" value="' + esc(e.note) + '"></label>' +
        '<div id="a-live" class="card flat" style="padding:10px 0;margin:0" aria-live="polite"></div><p class="errmsg" id="a-err" role="alert" hidden></p>' +
        (ex && !linked ? '<div class="game-sec"><button type="button" class="btn danger block" data-del>Delete this entry</button></div>' : "") +
        (linked ? '<div class="game-sec"><button type="button" class="btn ghost block" data-open-game>Open the game</button></div>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>Save</button>',
      onOpen(api) {
        const root = api.el;
        const live = () => {
          const date = C.isYMD($("#a-date", root).value) ? $("#a-date", root).value : e.date;
          const others = a.arm.log.filter(x => !ex || x.id !== ex.id);
          const trial = others.concat(e.np > 0 ? [{ id: "trial", date: date, np: e.np, note: "", gameId: "" }] : []);
          const info = C.armDays(a.arm, trial), day = info.days.filter(d => d.date === date)[0], box = $("#a-live", root);
          if (!day) { box.innerHTML = '<p class="mute">Enter how many pitches you threw.</p>'; return; }
          let t = '<p><b>' + day.total + " pitches that day</b> &rarr; " + restWord(day.rest) + ". Next available: <b>" + esc(C.fmtDate(day.avail, { weekday: "short", month: "short", day: "numeric" })) + "</b>.</p>";
          if (day.over) t += '<p class="warnmsg">Heads up: that is more than the ' + info.rules.dailyMax + " pitch daily max.</p>";
          if (day.early) t += '<p class="warnmsg">Heads up: this date falls in a rest period from an earlier day.</p>';
          box.innerHTML = t;
        };
        const setNp = v => { e.np = clamp(Math.round(Number(v) || 0), 0, 300); const i = $(".stepper input", root); if (i) i.value = e.np; live(); };
        root.addEventListener("click", ev => {
          const st = ev.target.closest("[data-step]"); if (st) setNp(e.np + Number(st.dataset.step));
          if (ev.target.closest("[data-open-game]")) { api.close(); openGameSheet(ex.gameId); }
        });
        root.addEventListener("input", ev => { if (ev.target.closest(".stepper")) { e.np = clamp(Math.round(Number(ev.target.value) || 0), 0, 300); live(); } });
        root.addEventListener("change", ev => { if (ev.target.closest(".stepper")) setNp(ev.target.value); if (ev.target.id === "a-date") live(); });
        live();
        $("[data-save]", root).addEventListener("click", () => {
          const err = $("#a-err", root), date = $("#a-date", root).value;
          const fail = m => { err.textContent = m; err.hidden = false; toast(m, "error"); };
          if (!C.isYMD(date)) return fail("Pick the date.");
          if (date > today) return fail("Pick today or an earlier date.");
          if (!linked && e.np < 1) return fail("Enter how many pitches you threw.");
          const note = $("#a-note", root).value.trim().slice(0, 80);
          if (ex) { const t = a.arm.log.find(x => x.id === ex.id); if (!linked) { t.date = date; t.np = e.np; } t.note = note; }
          else a.arm.log.push({ id: C.uid(), date: date, np: e.np, note: note, gameId: "" });
          saveAth(a); api.close(); render();
          const s = C.armSummary(a.arm, a.arm.log, C.todayStr());
          toast(s.resting ? "Saved. Rest needed until " + C.fmtDate(s.nextAvail, { weekday: "short", month: "short", day: "numeric" }) + "." : "Saved.", "ok", 3400);
        });
        const del = $("[data-del]", root);
        if (del) del.addEventListener("click", () => confirmSheet({
          title: "Delete this entry?", message: "This removes " + ex.np + " pitches on " + C.fmtDate(ex.date, { month: "short", day: "numeric" }) + ".", confirmText: "Delete", danger: true,
          onConfirm() { a.arm.log = a.arm.log.filter(x => x.id !== ex.id); saveAth(a); api.close(); render(); toast("Deleted.", "ok"); }
        }));
      }
    });
  }
  ACT["arm-rules"] = () => {
    const a = cur(), r = C.clone(a.arm.custom);
    const rowsHTML = () => r.tiers.map((t, i) => {
      const last = i === r.tiers.length - 1, prevMax = r.tiers[i - 1] ? r.tiers[i - 1].max : 0;
      return '<div class="tier-row"><div><span class="label">' + (last ? "More than" : "Up to (pitches)") + "</span>" +
        (last ? '<div class="static">' + prevMax + "</div>" : '<input type="number" data-k="max" data-i="' + i + '" inputmode="numeric" min="1" max="998" value="' + t.max + '" aria-label="Tier ' + (i + 1) + ' up to pitches">') +
        '</div><div><span class="label">Rest days</span><input type="number" data-k="restDays" data-i="' + i + '" inputmode="numeric" min="0" max="14" value="' + t.restDays + '" aria-label="Tier ' + (i + 1) + ' rest days"></div>' +
        (!last && r.tiers.length > 2 ? '<button type="button" class="mini" data-rm="' + i + '" aria-label="Remove tier ' + (i + 1) + '">&times;</button>' : "<span></span>") + "</div>";
    }).join("");
    openSheet({
      title: "My custom rules",
      html: '<label class="field"><span class="label">Daily max pitches</span><input type="number" id="r-max" inputmode="numeric" min="1" max="300" value="' + r.dailyMax + '"></label><p class="label" style="margin-bottom:6px">Rest days after pitching</p><div id="r-rows">' + rowsHTML() + '</div><button type="button" class="btn ghost small" data-add style="margin-top:10px">+ Add a tier</button><p class="errmsg" id="r-err" role="alert" hidden></p>' +
        '<div class="disclaimer"><p><b>Presets come from one league\'s rules. Always check your own league or tournament rules.</b></p></div>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>Save rules</button>',
      onOpen(api) {
        const root = api.el, redraw = () => { $("#r-rows", root).innerHTML = rowsHTML(); };
        const collect = () => { $$("#r-rows input", root).forEach(i => { r.tiers[Number(i.dataset.i)][i.dataset.k] = Number(i.value); }); };
        root.addEventListener("click", e => {
          const rm = e.target.closest("[data-rm]"), add = e.target.closest("[data-add]");
          if (rm) { collect(); r.tiers.splice(Number(rm.dataset.rm), 1); redraw(); }
          if (add) {
            if (r.tiers.length >= 8) return toast("That is the most tiers allowed.", "error");
            collect(); const prev = r.tiers[r.tiers.length - 2] ? r.tiers[r.tiers.length - 2].max : 0, lastT = r.tiers[r.tiers.length - 1];
            r.tiers.splice(r.tiers.length - 1, 0, { min: prev + 1, max: prev + 15, restDays: Math.max(0, lastT.restDays - 1) }); redraw();
          }
        });
        $("[data-save]", root).addEventListener("click", () => {
          collect();
          const dm = C.int($("#r-max", root).value, 1, 300, null), err = $("#r-err", root);
          const fail = m => { err.textContent = m; err.hidden = false; };
          if (dm === null) return fail("Daily max should be a number from 1 to 300.");
          let prev = 0;
          for (let i = 0; i < r.tiers.length; i++) {
            const t = r.tiers[i], last = i === r.tiers.length - 1;
            if (!(t.restDays >= 0 && t.restDays <= 14) || t.restDays !== Math.round(t.restDays)) return fail("Rest days should be a whole number from 0 to 14.");
            if (!last && (!(t.max > prev) || t.max > 998 || t.max !== Math.round(t.max))) return fail("Each tier must be higher than the one before it.");
            if (!last) prev = t.max;
          }
          const rules = C.sanitizeRules({ dailyMax: dm, tiers: r.tiers });
          a.arm.custom = rules; a.arm.preset = "Custom";
          saveAth(a); api.close(); render(); toast("Custom rules saved.", "ok");
        });
      }
    });
  };

  /* ================= Clips ================= */
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  const allTags = a => { const t = {}; a.clips.forEach(c => c.tags.forEach(x => { t[x] = (t[x] || 0) + 1; })); return Object.keys(t).sort(); };
  VIEWS.clips = a => {
    let h = tip("clips", "Found a video you want to keep? Tap <b>Add a clip</b> and paste the link. Only the link is saved, the video stays where it lives.");
    if (!a.clips.length) return h + '<div class="empty"><div class="big" aria-hidden="true">&#127916;</div><h3>No clips yet</h3><p>Copy a video link (YouTube, Hudl, Google Drive, anywhere), then tap the button and paste it in.</p><button type="button" class="btn" data-act="clip-new">Add your first clip</button></div>';
    const tags = allTags(a);
    if (S.clipTag && tags.indexOf(S.clipTag) < 0) S.clipTag = "";
    h += '<button type="button" class="btn block" data-act="clip-new">+ Add a clip</button><div style="height:12px"></div>';
    if (tags.length) h += '<div class="pills scroll" role="group" aria-label="Filter by tag" style="margin-bottom:12px"><button type="button" class="pill" data-act="clip-tag" data-v="" aria-pressed="' + (!S.clipTag) + '">All</button>' + tags.map(t => '<button type="button" class="pill" data-act="clip-tag" data-v="' + esc(t) + '" aria-pressed="' + (S.clipTag === t) + '">' + esc(t) + "</button>").join("") + "</div>";
    const list = a.clips.filter(c => !S.clipTag || c.tags.indexOf(S.clipTag) >= 0).sort((x, y) => y.date.localeCompare(x.date) || (x.id < y.id ? 1 : -1));
    h += list.map(c => '<article class="clip"><h3>' + esc(c.title) + '</h3><p class="host">' + esc(hostOf(c.url)) + " &middot; " + esc(C.fmtDate(c.date, { month: "short", day: "numeric", year: "numeric" })) + "</p>" + (c.note ? '<p class="note">' + esc(c.note) + "</p>" : "") +
      (c.tags.length ? '<div class="tags">' + c.tags.map(t => '<span class="tag">' + esc(t) + "</span>").join("") + "</div>" : "") +
      '<div class="acts"><a class="btn small" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open ' + esc(c.title) + ' in a new tab">Open video</a><button type="button" class="btn ghost small" data-act="clip-edit" data-id="' + c.id + '" aria-label="Edit ' + esc(c.title) + '">Edit</button></div></article>').join("");
    return h;
  };
  ACT["clip-tag"] = el => { S.clipTag = el.dataset.v; render(); };
  ACT["clip-new"] = () => openClipSheet(null);
  ACT["clip-edit"] = el => openClipSheet(el.dataset.id);
  function openClipSheet(id) {
    const a = cur(), c = id ? a.clips.find(x => x.id === id) : null, today = C.todayStr(), mine = allTags(a);
    openSheet({
      title: c ? "Edit clip" : "Add a clip", autofocus: c ? null : "#c-url",
      html: '<label class="field"><span class="label">Video link</span><input type="text" id="c-url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Paste a link that starts with https://" value="' + esc(c ? c.url : "") + '"></label>' +
        '<label class="field"><span class="label">Title</span><input type="text" id="c-title" maxlength="80" autocomplete="off" placeholder="For example Double in the gap" value="' + esc(c ? c.title : "") + '"></label>' +
        '<label class="field"><span class="label">Date</span><input type="date" id="c-date" max="' + today + '" value="' + (c ? c.date : today) + '"></label>' +
        '<label class="field"><span class="label">Tags (separate with commas)</span><input type="text" id="c-tags" maxlength="120" autocomplete="off" placeholder="hitting, game, practice" value="' + esc(c ? c.tags.join(", ") : "") + '"></label>' +
        (mine.length ? '<div class="pills" style="margin:-6px 0 14px" role="group" aria-label="Your tags">' + mine.map(t => '<button type="button" class="pill" data-addtag="' + esc(t) + '">+ ' + esc(t) + "</button>").join("") + "</div>" : "") +
        '<label class="field"><span class="label">Note (optional)</span><textarea id="c-note" maxlength="300" placeholder="What should you remember about this one?">' + esc(c ? c.note : "") + '</textarea></label><p class="errmsg" id="c-err" role="alert" hidden></p>' +
        (c ? '<div class="game-sec"><button type="button" class="btn danger block" data-del>Delete this clip</button></div>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>Save clip</button>',
      onOpen(api) {
        const root = api.el;
        root.addEventListener("click", e => {
          const t = e.target.closest("[data-addtag]"); if (!t) return;
          const inp = $("#c-tags", root), have = inp.value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
          if (have.indexOf(t.dataset.addtag) < 0) inp.value = have.concat([t.dataset.addtag]).join(", ");
        });
        $("[data-save]", root).addEventListener("click", () => {
          const err = $("#c-err", root), fail = m => { err.textContent = m; err.hidden = false; toast(m, "error"); };
          const url = C.normalizeUrl($("#c-url", root).value);
          if (!url) return fail("That doesn't look like a web link. Paste a link that starts with http or https.");
          const date = $("#c-date", root).value;
          if (!C.isYMD(date) || date > today) return fail("Pick today or an earlier date.");
          const tags = $("#c-tags", root).value.split(",").map(x => C.str(x, 20).trim().toLowerCase()).filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 8);
          const data = { url: url, title: C.str($("#c-title", root).value, 80).trim() || hostOf(url) || url, date: date, tags: tags, note: C.str($("#c-note", root).value, 300) };
          if (c) Object.assign(c, data); else a.clips.push(Object.assign({ id: C.uid() }, data));
          saveAth(a); api.close(); render(); toast("Clip saved.", "ok");
        });
        const del = $("[data-del]", root);
        if (del) del.addEventListener("click", () => confirmSheet({
          title: "Delete this clip?", message: "This removes the saved link. The video itself is not touched.", confirmText: "Delete clip", danger: true,
          onConfirm() { a.clips = a.clips.filter(x => x.id !== c.id); saveAth(a); api.close(); render(); toast("Clip deleted.", "ok"); }
        }));
      }
    });
  }

  /* ================= Card ================= */
  let fontsP = null;
  function fontsReady() {
    if (!fontsP) {
      fontsP = new Promise(res => {
        const t = setTimeout(res, 1500), done = () => { clearTimeout(t); res(); };
        try {
          if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 100px "Barlow Condensed"'), document.fonts.load('600 40px "Barlow"')]).then(done, done);
          else done();
        } catch (e) { done(); }
      });
    }
    return fontsP;
  }
  function cardHighlights(a) {
    const pref = a.profile.cardSeason;
    if (pref === "none") return { label: "", rows: [] };
    const seasons = seasonList(a);
    const season = pref === "all" ? "all" : (pref && seasons.indexOf(pref) >= 0 ? pref : seasons[0]);
    if (!season) return { label: "", rows: [] };
    const rows = [];
    a.sports.forEach(sp => {
      const games = a.games.filter(g => g.sport === sp && (season === "all" || g.season === season));
      if (!games.length) return;
      const nm = C.sportInfo(sp).label.toUpperCase();
      if (sp === "baseball" || sp === "softball") {
        const b = C.battingTotals(games), p = C.pitchingTotals(games, a.settings.ipg);
        if (b.ab + b.bb > 0) rows.push({ tag: nm + " · BATTING", tiles: [["AVG", C.fmtRate(b.avg)], ["OBP", C.fmtRate(b.obp)], ["HR", String(b.hr)], ["RBI", String(b.rbi)]] });
        if (p.outs > 0) rows.push({ tag: nm + " · PITCHING", tiles: [["ERA", C.fmtDec(p.era, 2)], ["IP", p.ipText], ["K", String(p.k)], ["WHIP", C.fmtDec(p.whip, 2)]] });
      } else if (sp === "basketball") {
        const t = C.basketballTotals(games);
        rows.push({ tag: nm, tiles: [["PPG", C.fmtDec(t.ppg, 1)], ["RPG", C.fmtDec(t.rpg, 1)], ["APG", C.fmtDec(t.apg, 1)], ["SPG", C.fmtDec(t.spg, 1)]] });
      } else if (sp === "football") {
        const t = C.footballTotals(games);
        rows.push({ tag: nm, tiles: [["TACKLES", String(t.tkl)], ["CATCHES", String(t.rec)], ["YARDS", String(t.yds)], ["TD", String(t.td)]] });
      } else { const r = C.record(games); rows.push({ tag: nm, tiles: [["GAMES", String(games.length)], ["WINS", String(r.w)], ["LOSSES", String(r.l)]] }); }
    });
    return { label: season === "all" ? "ALL-TIME" : String(season).toUpperCase(), rows: rows.slice(0, 2) };
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = text.split(/\s+/).filter(Boolean), lines = [];
    let curL = "";
    words.forEach(w => { const t = curL ? curL + " " + w : w; if (ctx.measureText(t).width > maxW && curL) { lines.push(curL); curL = w; } else curL = t; });
    if (curL) lines.push(curL);
    if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, "") + "…"; return cut; }
    return lines;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCard(cv, a) {
    const W = 1080, H = 1350, ctx = cv.getContext("2d");
    cv.width = W; cv.height = H;
    const NUM = '"Barlow Condensed","Arial Narrow","Roboto Condensed",system-ui,sans-serif', TXT = '"Barlow",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    const LIME = "#c6ff3d", MUTE = "#92b0a4", INK = "#0a1512", TEXT = "#eef7f1";
    const spacing = v => { try { ctx.letterSpacing = v; } catch (e) { /* not supported */ } };
    const p = a.profile;
    let g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0d241d"); g.addColorStop(1, "#0a1512");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = LIME; ctx.lineWidth = 3;
    for (let i = -H; i < W; i += 54) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = LIME; ctx.fillRect(0, 0, W, 22); ctx.fillRect(0, H - 14, W, 14);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = MUTE; ctx.font = "700 30px " + NUM; spacing("6px"); ctx.fillText("ATHLETE CARD", 64, 92); spacing("0px");
    // avatar + name
    const nameText = (p.cardName || a.name).toUpperCase();
    ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(150, 250, 86, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.font = "700 108px " + NUM; ctx.fillText(initial(p.cardName || a.name), 150, 288); ctx.textAlign = "left";
    let fs = 140; ctx.fillStyle = TEXT;
    do { ctx.font = "700 " + fs + "px " + NUM; fs -= 4; } while (ctx.measureText(nameText).width > 700 && fs > 52);
    ctx.fillText(nameText, 270, 262, 710);
    ctx.fillStyle = LIME; ctx.font = "600 38px " + TXT; spacing("3px");
    ctx.fillText(a.sports.map(s => C.sportInfo(s).label.toUpperCase()).join("  ·  "), 270, 318, 710); spacing("0px");
    ctx.fillStyle = "#23443a"; ctx.fillRect(64, 372, W - 128, 3);
    // info grid
    const items = [];
    if (p.positions) items.push(["POSITION", p.positions]);
    if (p.bats || p.throws) items.push(["BATS / THROWS", (p.bats || "-") + " / " + (p.throws || "-")]);
    if (p.height) items.push(["HEIGHT", p.height]);
    if (p.weight) items.push(["WEIGHT", p.weight]);
    if (p.gradYear) items.push(["CLASS OF", String(p.gradYear)]);
    const teams = p.teams ? ["TEAM", p.teams] : null;
    let y = 412;
    const cell = (it, x, yy, w) => {
      ctx.fillStyle = MUTE; ctx.font = "700 24px " + TXT; spacing("3px"); ctx.fillText(it[0], x, yy, w); spacing("0px");
      ctx.fillStyle = TEXT; ctx.font = "700 46px " + NUM; ctx.fillText(it[1], x, yy + 48, w);
    };
    for (let i = 0; i < items.length; i += 2) { cell(items[i], 64, y, 460); if (items[i + 1]) cell(items[i + 1], 556, y, 460); y += 96; }
    if (teams) { cell(teams, 64, y, 950); y += 96; }
    if (!items.length && !teams) { ctx.fillStyle = MUTE; ctx.font = "500 32px " + TXT; ctx.fillText("Add your position, height and team in Edit card details.", 64, y + 30, 950); y += 80; }
    // bottom reserves
    const hasContact = p.showContact && (p.email || p.phone);
    const contactH = hasContact ? 130 : 0;
    let bioLines = [];
    if (p.bio) { ctx.font = "italic 500 40px " + TXT; bioLines = wrapLines(ctx, "“" + p.bio + "”", 950, 3); }
    const bioH = bioLines.length ? bioLines.length * 52 + 30 : 0;
    const limit = H - 70 - contactH - bioH;
    // highlights
    const hl = cardHighlights(a);
    const rowH = 168, headH = 70;
    let nRows = Math.min(hl.rows.length, Math.floor((limit - y - headH) / rowH));
    if (nRows > 0) {
      const ph = headH + nRows * rowH;
      rrect(ctx, 64, y, W - 128, ph, 26); ctx.fillStyle = "#12251f"; ctx.fill(); ctx.strokeStyle = "#2f5a4c"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = LIME; ctx.font = "700 32px " + NUM; spacing("5px"); ctx.fillText(hl.label + " HIGHLIGHTS", 96, y + 48); spacing("0px");
      for (let r = 0; r < nRows; r++) {
        const row = hl.rows[r], ry = y + headH + r * rowH - 6;
        ctx.fillStyle = MUTE; ctx.font = "700 22px " + TXT; spacing("2px"); ctx.fillText(row.tag, 96, ry + 22, 880); spacing("0px");
        const n = row.tiles.length, tw = (W - 192) / n;
        row.tiles.forEach((t, i) => {
          const cx = 96 + tw * i + tw / 2;
          ctx.textAlign = "center";
          ctx.fillStyle = LIME; ctx.font = "700 98px " + NUM; ctx.fillText(t[1], cx, ry + 104, tw - 12);
          ctx.fillStyle = TEXT; ctx.font = "700 26px " + TXT; spacing("2px"); ctx.fillText(t[0], cx, ry + 142, tw - 12); spacing("0px");
          ctx.textAlign = "left";
        });
      }
      y += ph + 30;
    }
    if (bioLines.length) { ctx.fillStyle = TEXT; ctx.font = "italic 500 40px " + TXT; const by = Math.max(y, limit) + 10; bioLines.forEach((l, i) => ctx.fillText(l, 64, by + 36 + i * 52, 950)); }
    if (hasContact) {
      const cy = H - 70 - contactH + 40;
      ctx.fillStyle = "#23443a"; ctx.fillRect(64, cy - 28, W - 128, 3);
      ctx.fillStyle = TEXT; ctx.font = "600 36px " + TXT;
      let line = 0;
      if (p.email) { ctx.fillText(p.email, 64, cy + 30 + line * 50, 950); line++; }
      if (p.phone) ctx.fillText(p.phone, 64, cy + 30 + line * 50, 950);
    }
    ctx.fillStyle = MUTE; ctx.font = "700 24px " + NUM; spacing("5px"); ctx.textAlign = "right"; ctx.fillText("LOCKER", W - 64, H - 36); ctx.textAlign = "left"; spacing("0px");
  }
  function paintCard(a, cv) {
    if (!cv) return;
    drawCard(cv, a);
    fontsReady().then(() => { if (document.contains(cv) && cur() === a) drawCard(cv, a); });
  }
  VIEWS.card = a => {
    const seasons = seasonList(a), p = a.profile, hasContactInfo = p.email || p.phone;
    let h = tip("card", "This is your athlete card. It only shows what you type. Nothing is shared until you tap <b>Share</b>, <b>Save</b> or <b>Print</b>.");
    h += '<div class="cardwrap"><canvas id="cardcv" width="1080" height="1350" role="img" aria-label="Preview of your athlete card"></canvas></div>';
    h += '<p class="privacy-pill">' + I.shield + "<span>The card has whatever you typed in its details. It stays on this phone and is only shared when you choose.</span></p>";
    h += '<div class="stack">' + (canShareFiles() ? '<button type="button" class="btn block" data-act="card-share">Share picture</button>' : "") +
      '<button type="button" class="btn' + (canShareFiles() ? " ghost" : "") + ' block" data-act="card-save">Save picture</button><button type="button" class="btn ghost block" data-act="card-print">Print</button><button type="button" class="btn ghost block" data-act="card-edit">Edit card details</button></div>';
    h += '<div class="card" style="margin-top:14px"><label class="field" style="margin:0"><span class="label">Stats shown on the card</span><select id="card-season"><option value=""' + (p.cardSeason === "" ? " selected" : "") + ">Latest season" + (seasons[0] ? " (" + esc(seasons[0]) + ")" : "") + "</option>" + seasons.map(s => '<option value="' + esc(s) + '"' + (p.cardSeason === s ? " selected" : "") + ">" + esc(s) + "</option>").join("") + '<option value="all"' + (p.cardSeason === "all" ? " selected" : "") + '>All time</option><option value="none"' + (p.cardSeason === "none" ? " selected" : "") + ">No stats on the card</option></select></label>" +
      (hasContactInfo ? '<div class="row sp" style="margin-top:12px"><span>Show my email and phone on the card</span><button type="button" class="pill" data-act="card-contact" aria-pressed="' + p.showContact + '">' + (p.showContact ? "On" : "Off") + "</button></div>" : '<p class="mute" style="font-size:15px;margin-top:10px">Want a coach to reach you? Add an email or phone in Edit card details. It only shows if you turn it on.</p>') + "</div>";
    return h;
  };
  VIEWS["card:after"] = a => paintCard(a, $("#cardcv"));
  async function cardBlob(a) {
    await fontsReady();
    const cv = document.createElement("canvas"); drawCard(cv, a);
    return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error("no blob"))), "image/png"));
  }
  ACT["card-save"] = async () => {
    try { downloadBlob(await cardBlob(cur()), "locker-athlete-card.png"); toast("Card picture saved to your downloads.", "ok"); }
    catch (e) { toast("Couldn't make the picture. Try again.", "error"); }
  };
  ACT["card-share"] = async () => {
    try {
      const file = new File([await cardBlob(cur())], "locker-athlete-card.png", { type: "image/png" });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return toast("This phone can't share a picture from here. Use Save picture instead.", "error");
      await navigator.share({ files: [file], title: "Athlete card" });
    } catch (e) { if (!e || e.name !== "AbortError") toast("Couldn't share the picture. Try Save picture instead.", "error"); }
  };
  ACT["card-print"] = async () => {
    try {
      await fontsReady();
      const cv = document.createElement("canvas"); drawCard(cv, cur());
      $("#printimg").src = cv.toDataURL("image/png");
      document.body.classList.add("print-card");
      const off = () => { document.body.classList.remove("print-card"); window.removeEventListener("afterprint", off); };
      window.addEventListener("afterprint", off);
      setTimeout(off, 120000);
      setTimeout(() => window.print(), 80);
    } catch (e) { toast("Couldn't get the card ready to print.", "error"); }
  };
  ACT["card-contact"] = () => { const a = cur(); a.profile.showContact = !a.profile.showContact; saveAth(a); render(); };
  ACT["card-edit"] = () => {
    const a = cur(), p = a.profile;
    const pg = (attr, cur2, opts) => opts.map(o => '<button type="button" class="pill" data-' + attr + '="' + o[0] + '" aria-pressed="' + (cur2 === o[0]) + '">' + o[1] + "</button>").join("");
    openSheet({
      title: "Card details",
      html: '<p class="mute" style="margin-bottom:12px">Everything here is optional. It only goes on your card if you fill it in.</p>' +
        '<label class="field"><span class="label">Name on the card</span><input type="text" id="p-name" maxlength="40" autocomplete="off" placeholder="' + esc(a.name) + '" value="' + esc(p.cardName) + '"></label>' +
        '<label class="field"><span class="label">Position(s)</span><input type="text" id="p-pos" maxlength="60" autocomplete="off" placeholder="For example SS, P, CF" value="' + esc(p.positions) + '"></label>' +
        '<div class="cols2"><div class="field"><span class="label" id="p-b-l">Bats</span><div class="pills" role="group" aria-labelledby="p-b-l">' + pg("bats", p.bats, [["R", "R"], ["L", "L"], ["S", "Both"]]) + '</div></div><div class="field"><span class="label" id="p-t-l">Throws</span><div class="pills" role="group" aria-labelledby="p-t-l">' + pg("throws", p.throws, [["R", "R"], ["L", "L"]]) + "</div></div></div>" +
        '<div class="cols2"><label class="field"><span class="label">Height</span><input type="text" id="p-h" maxlength="14" autocomplete="off" placeholder="4&#39;11&quot;" value="' + esc(p.height) + '"></label><label class="field"><span class="label">Weight</span><input type="text" id="p-w" maxlength="14" autocomplete="off" placeholder="88 lb" value="' + esc(p.weight) + '"></label></div>' +
        '<div class="cols2"><label class="field"><span class="label">Graduation year</span><input type="number" id="p-grad" inputmode="numeric" min="2000" max="2100" placeholder="2032" value="' + (p.gradYear || "") + '"></label></div>' +
        '<label class="field"><span class="label">Team(s)</span><input type="text" id="p-teams" maxlength="80" autocomplete="off" placeholder="Team name, club or school" value="' + esc(p.teams) + '"></label>' +
        '<label class="field"><span class="label">One line about you</span><input type="text" id="p-bio" maxlength="140" autocomplete="off" placeholder="For example Loves shortstop and tacos" value="' + esc(p.bio) + '"></label>' +
        '<div class="game-sec"><h3>Contact (optional)</h3><p class="mute" style="font-size:15px;margin-bottom:10px">Only type this if you want it on the card. Parents: you decide what is safe to share.</p>' +
        '<label class="field"><span class="label">Email</span><input type="email" id="p-email" maxlength="80" autocomplete="off" autocapitalize="none" value="' + esc(p.email) + '"></label><label class="field"><span class="label">Phone</span><input type="tel" id="p-phone" maxlength="24" autocomplete="off" value="' + esc(p.phone) + '"></label>' +
        '<div class="row sp"><span>Show contact info on the card</span><button type="button" class="pill" id="p-show" aria-pressed="' + p.showContact + '">' + (p.showContact ? "On" : "Off") + "</button></div></div>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn grow2" data-save>Save</button>',
      onOpen(api) {
        const root = api.el;
        root.addEventListener("click", e => {
          const b = e.target.closest("[data-bats],[data-throws]");
          if (b) { const attr = b.dataset.bats !== undefined ? "bats" : "throws", on = b.getAttribute("aria-pressed") === "true"; $$("[data-" + attr + "]", root).forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", String(!on)); return; }
          const s = e.target.closest("#p-show"); if (s) { const on = s.getAttribute("aria-pressed") !== "true"; s.setAttribute("aria-pressed", String(on)); s.textContent = on ? "On" : "Off"; }
        });
        $("[data-save]", root).addEventListener("click", () => {
          const pick = attr => { const b = $$("[data-" + attr + "]", root).filter(x => x.getAttribute("aria-pressed") === "true")[0]; return b ? b.dataset[attr] : ""; };
          const gy = $("#p-grad", root).value.trim();
          Object.assign(a.profile, {
            cardName: C.str($("#p-name", root).value, 40).trim(), positions: C.str($("#p-pos", root).value, 60).trim(), bats: pick("bats"), throws: pick("throws"),
            height: C.str($("#p-h", root).value, 14).trim(), weight: C.str($("#p-w", root).value, 14).trim(), gradYear: gy ? C.int(gy, 2000, 2100, null) : null,
            teams: C.str($("#p-teams", root).value, 80).trim(), bio: C.str($("#p-bio", root).value, 140).trim(), email: C.str($("#p-email", root).value, 80).trim(), phone: C.str($("#p-phone", root).value, 24).trim(),
            showContact: $("#p-show", root).getAttribute("aria-pressed") === "true"
          });
          saveAth(a); api.close(); render(); toast("Card updated.", "ok");
        });
      }
    });
  };

  /* ================= wiring ================= */
  document.addEventListener("click", e => {
    const sp = e.target.closest("[data-sport]");
    if (sp) { sp.setAttribute("aria-pressed", String(sp.getAttribute("aria-pressed") !== "true")); return; }
    const el = e.target.closest("[data-act]");
    if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches && t.matches("[data-restore]")) { const f = t.files && t.files[0]; t.value = ""; onRestoreFile(f); return; }
    if (t.id === "gsel") { S.gf.season = t.value; render(); return; }
    if (t.id === "card-season") { const a = cur(); a.profile.cardSeason = t.value; saveAth(a); render(); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sheetStack.length) sheetStack[sheetStack.length - 1].close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target && e.target.id === "f-name") { const b = $('[data-act="create-first"]') || $("[data-save]", e.target.closest(".sheet-wrap") || document); if (b) b.click(); }
  });
  function checkNewDay() { if (S.day && S.day !== C.todayStr() && cur()) { S.viewDate = null; render(); } }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkNewDay(); });
  setInterval(checkNewDay, 60000);

  function init() {
    S.memMode = !probeStorage();
    loadAll();
    askPersist();
    render();
    if (S.damaged.length) setTimeout(() => toast("One saved athlete couldn't be read. Your other athletes are fine. Open the menu, then Back up & restore, for options.", "error", 8000), 500);
    if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  window.LockerApp = { S: S, render: render, core: C, store: store, reload: function () { loadAll(); render(); } };
  init();
})();
