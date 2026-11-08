/* Film Lite base: small helpers, saved data, toasts, sheets and the Back-button history.
   All data lives in this phone's localStorage (keys start with "filmlite."). Nothing is ever sent anywhere. */
(function () {
  "use strict";
  const C = window.FilmCore;
  const FL = window.FL = window.FL || {};
  FL.C = C;
  FL.ACT = {};
  const $ = FL.$ = (s, r) => (r || document).querySelector(s);
  FL.$$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = FL.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = FL.reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  FL.today = () => C.todayStr(window.__today);

  const svg = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + d + "</svg>";
  const fill = d => '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' + d + "</svg>";
  FL.I = {
    back: svg('<path d="M15 5l-7 7 7 7"/>'), dots: fill('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'), go: svg('<path d="M9 6l6 6-6 6"/>'),
    gear: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    play: fill('<path d="M8 5v14l11-7z"/>'), pause: fill('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
    fback: svg('<path d="M6 5v14"/><path d="M19 6v12l-9-6z" fill="currentColor"/>'), ffwd: svg('<path d="M18 5v14"/><path d="M5 6v12l9-6z" fill="currentColor"/>'),
    rew: svg('<path d="M11 7l-7 5 7 5zM20 7l-7 5 7 5z" fill="currentColor"/>'), fwd: svg('<path d="M13 7l7 5-7 5zM4 7l7 5-7 5z" fill="currentColor"/>'),
    repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
    brA: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><text x="12" y="17" text-anchor="middle" font-size="13.5" font-weight="800" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">A</text>'),
    brB: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><text x="12" y="17" text-anchor="middle" font-size="13.5" font-weight="800" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">B</text>'),
    vol: svg('<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    mute: svg('<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6"/>'),
    nl: svg('<path d="M14 6l-6 6 6 6"/>'), nr: svg('<path d="M10 6l6 6-6 6"/>'),
    pen: svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    pic: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M4 16l5-5 4 4 3-3 4 4"/><circle cx="9" cy="9.5" r="1.3" fill="currentColor"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    flag: svg('<path d="M6 3v18"/><path d="M6 4h12l-2.5 4.5L18 13H6" fill="currentColor"/>'),
    full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), fullx: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
    film: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    tPen: svg('<path d="M3 17c3-8 5 4 8-3s5-3 10-6"/>'), tArrow: svg('<path d="M5 19L19 5M10 5h9v9"/>'), tCircle: svg('<circle cx="12" cy="12" r="8"/>'),
    tLine: svg('<path d="M5 19L19 5"/>'), tAngle: svg('<path d="M4 19h16M4 19L15 5"/><path d="M10 19a6 6 0 0 0-1.6-4"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'), dl: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>')
  };

  /* ================= saved data ================= */
  const mem = {};
  const D = FL.data = { settings: C.sanitizeSettings({}), clips: {}, order: [], memMode: false, saveFailed: false };
  const store = {
    get(k) { if (D.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("filmlite." + k); } catch (e) { return null; } },
    set(k, v) { if (D.memMode) { mem[k] = v; return true; } try { localStorage.setItem("filmlite." + k, v); return true; } catch (e) { return false; } },
    del(k) { if (D.memMode) { delete mem[k]; return; } try { localStorage.removeItem("filmlite." + k); } catch (e) { /* ignore */ } },
    keys() {
      if (D.memMode) return Object.keys(mem);
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("filmlite.") === 0) out.push(k.slice(9)); } } catch (e) { /* ignore */ }
      return out;
    }
  };
  function probe() { try { localStorage.setItem("filmlite.probe", "1"); localStorage.removeItem("filmlite.probe"); return true; } catch (e) { return false; } }
  const readJSON = k => { const raw = store.get(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return undefined; } };
  let lastErr = 0;
  function saveFailed() {
    D.saveFailed = true;
    if (Date.now() - lastErr > 4000) { lastErr = Date.now(); FL.toast("Couldn't save your notes on this phone. Storage may be full or blocked. Back up from Settings to keep a copy.", "error", 7000); }
  }
  D.load = function () {
    D.memMode = !probe(); D.saveFailed = false; D.clips = {}; D.order = [];
    D.settings = C.sanitizeSettings(readJSON("settings"));
    const idx = readJSON("index");
    let ids = idx && Array.isArray(idx.ids) ? idx.ids.filter(x => typeof x === "string" && C.ID_RE.test(x)) : [];
    store.keys().filter(k => k.indexOf("c.") === 0).forEach(k => { const id = k.slice(2); if (C.ID_RE.test(id) && ids.indexOf(id) < 0) ids.push(id); });
    ids = ids.filter((x, i) => ids.indexOf(x) === i);
    ids.forEach(id => {
      const raw = store.get("c." + id); if (raw == null) return;
      try { const c = C.sanitizeClip(JSON.parse(raw), FL.today()); if (c && c.id === id) { D.clips[id] = c; D.order.push(id); } } catch (e) { /* skip a damaged record */ }
    });
  };
  D.saveSettings = function () { if (!store.set("settings", JSON.stringify(D.settings))) saveFailed(); };
  D.saveIndex = function () { return store.set("index", JSON.stringify({ v: 1, ids: D.order })); };
  D.list = function () { return D.order.map(id => D.clips[id]).filter(Boolean); };
  D.saveClip = function (clip) {
    clip.updated = FL.today();
    if (!D.clips[clip.id]) D.clips[clip.id] = clip;
    D.order = [clip.id].concat(D.order.filter(x => x !== clip.id));
    let ok = store.set("c." + clip.id, JSON.stringify(clip));
    ok = D.saveIndex() && ok;
    if (!ok) { saveFailed(); return false; }
    D.saveFailed = false; return true;
  };
  D.deleteClip = function (id) { store.del("c." + id); delete D.clips[id]; D.order = D.order.filter(x => x !== id); D.saveIndex(); };
  D.clearAll = function () {
    store.keys().forEach(k => store.del(k));
    D.clips = {}; D.order = []; D.settings = C.sanitizeSettings({}); D.saveFailed = false;
  };
  /* Replace everything with a validated backup. Puts the old data back if a write fails part way. */
  D.replaceAll = function (settings, clips) {
    const old = {};
    store.keys().forEach(k => { old[k] = store.get(k); });
    const ids = clips.map(c => c.id);
    try {
      clips.forEach(c => { if (!store.set("c." + c.id, JSON.stringify(c))) throw new Error("write"); });
      if (!store.set("settings", JSON.stringify(settings))) throw new Error("write");
      if (!store.set("index", JSON.stringify({ v: 1, ids: ids }))) throw new Error("write");
      Object.keys(old).forEach(k => { if (k.indexOf("c.") === 0 && ids.indexOf(k.slice(2)) < 0) store.del(k); });
    } catch (e) {
      clips.forEach(c => store.del("c." + c.id));
      Object.keys(old).forEach(k => { if (old[k] != null) store.set(k, old[k]); });
      return false;
    }
    D.load();
    return true;
  };
  D.canSave = () => !D.memMode && !D.saveFailed;

  /* ================= toasts ================= */
  FL.toast = function (msg, kind, ms) {
    const host = $("#toasts"); if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.textContent = msg;
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("in")));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); }, ms || (kind === "error" ? 5500 : 2600));
    return t;
  };
  FL.hideToast = function (t) { if (!t) return; t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); };

  /* ================= sheets ================= */
  const sheetStack = FL.sheetStack = [];
  let sheetSeq = 0;
  function syncInert() {
    const top = sheetStack[sheetStack.length - 1], modal = sheetStack.some(s => !s.dock);
    $("#app").inert = modal;
    sheetStack.forEach(s => { s.el.inert = s !== top; });
    document.body.classList.toggle("lock", modal);
  }
  FL.openSheet = function (o) {
    /* a sheet is drawn outside the full-screen player, so leave full screen first or it would be invisible */
    if (document.fullscreenElement || document.webkitFullscreenElement) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
    const opener = document.activeElement;
    const id = "sh" + (++sheetSeq);
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap" + (o.dock ? " dock" : "");
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="' + (o.dock ? "false" : "true") + '" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' + FL.I.x + "</button></header>" +
      '<div class="sh-body">' + (o.html || "") + "</div>" + (o.footer ? '<div class="sh-foot">' + o.footer + "</div>" : "") + "</section>";
    const api = {
      el: wrap, sheet: $(".sheet", wrap), body: $(".sh-body", wrap), dock: !!o.dock, closed: false,
      close() {
        if (api.closed) return; api.closed = true;
        const i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
        syncHistory();
        wrap.classList.remove("open");
        wrap.inert = true;
        setTimeout(() => wrap.remove(), reduced() ? 0 : 260);
        syncInert();
        const below = sheetStack[sheetStack.length - 1];
        if (below) { try { below.sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        else if (opener && opener.focus && document.contains(opener) && !o.noRestoreFocus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (o.onClose) o.onClose();
      }
    };
    wrap.addEventListener("click", e => { if (e.target.closest("[data-close]")) api.close(); });
    wrap.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); api.close(); return; }
      if (e.key !== "Tab" || o.dock) return;
      const f = FL.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', api.sheet).filter(x => !x.disabled && x.offsetParent !== null);
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
  };
  FL.closeAllSheets = () => sheetStack.slice().forEach(s => s.close());
  FL.confirmSheet = function (o) {
    return FL.openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more || []).map(m => '<p class="msg">' + esc(m) + "</p>").join(""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen(api) { $("[data-ok]", api.el).addEventListener("click", () => { api.close(); o.onConfirm(); }); }
    });
  };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !e.defaultPrevented && sheetStack.length) { e.preventDefault(); sheetStack[sheetStack.length - 1].close(); }
  });

  /* Android Back (and the browser's Back) closes the top sheet, then a drawing, then the player, before it leaves the app.
     Every open sheet and every "layer" (the player, drawing mode) owns one history entry. Entries are added and given back a
     moment after things change, so one thing replacing another (close, then open in the same tap) costs nothing, and the entry
     we land on always says how many things should be open. */
  const layers = [];
  let histDepth = 0, traveling = false, syncTimer = 0;
  const want = () => layers.length + sheetStack.length;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  function reconcileHistory() {
    if (traveling) return;
    const w = want();
    try {
      if (w > histDepth) { while (histDepth < w) history.pushState({ flDepth: ++histDepth }, ""); }
      else if (w < histDepth) {
        const n = histDepth - w; histDepth = w; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  /* layer: {id, back()}. back() must close it without asking for another history change. */
  FL.pushLayer = function (id, back) { layers.push({ id: id, back: back }); syncHistory(); };
  FL.popLayer = function (id) { const i = layers.map(l => l.id).indexOf(id); if (i >= 0) { layers.splice(i, 1); syncHistory(); } };
  FL.hasLayer = id => layers.some(l => l.id === id);
  try { if (history.state && history.state.flDepth) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", e => {
    const at = (e.state && e.state.flDepth) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else {
      while (want() > at) {
        if (sheetStack.length) sheetStack[sheetStack.length - 1].close();
        else { const l = layers.pop(); l.back(); }
      }
    }
    reconcileHistory();
  });

  /* ================= files: save, share, copy ================= */
  FL.downloadBlob = function (blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 8000);
  };
  const coarse = () => { try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };
  FL.canShareFiles = function (type) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File(["x"], "x." + (type === "image/png" ? "png" : "json"), { type: type })] })); } catch (e) { return false; }
  };
  /* On a touch phone with a share sheet, share the file (so "Save Image" works). Anywhere else, download it. Returns "shared" or "saved". */
  FL.saveFile = async function (blob, name, title) {
    if (coarse() && FL.canShareFiles(blob.type)) {
      try { await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: title || name }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "cancelled"; /* fall through to a download */ }
    }
    FL.downloadBlob(blob, name);
    return "saved";
  };
  FL.copyText = async function (text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* try the old way */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy"); ta.remove(); return !!ok;
    } catch (e) { return false; }
  };
  /* Copy to the clipboard; if the browser says no, show the text so it can be selected by hand. */
  FL.copyOrShow = async function (text, doneMsg, title) {
    if (await FL.copyText(text)) return FL.toast(doneMsg || "Copied.", "ok");
    FL.openSheet({
      title: title || "Copy this", html: '<p class="msg">This browser wouldn\'t copy by itself. Select the text below and copy it.</p><div class="field" style="margin-top:12px"><textarea readonly rows="10" id="manual-copy" aria-label="Text to copy">' + esc(text) + "</textarea></div>",
      onOpen(api) { setTimeout(() => { const t = $("#manual-copy", api.el); if (t) { t.focus(); t.select(); } }, 60); }
    });
  };

  /* click handler: every [data-act] looks itself up in FL.ACT */
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = FL.ACT[el.getAttribute("data-act")];
    if (fn) fn(el, e);
  });
})();
