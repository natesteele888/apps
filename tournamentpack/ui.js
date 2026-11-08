/* Tournament Pack, part 1: small UI pieces, storage, sheets, the Back button.
   All data lives in this phone's localStorage (keys start with "tpack."). Nothing is ever sent anywhere.
   Logic that is not about the screen lives in core.js. Parts 2 and 3 (views.js, app.js) use window.TP. */
(function () {
  "use strict";
  var C = window.TPCore;
  var TP = window.TP = { C: C, ACT: {}, CHANGE: {} };
  var $ = TP.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = TP.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  TP.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var esc = TP.esc;
  TP.reduced = function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var reduced = TP.reduced;

  var svg = function (body, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + body + "</svg>"; };
  TP.I = {
    gear: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    go: svg('<path d="M9 6l6 6-6 6"/>'),
    up: svg('<path d="M6 15l6-6 6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    games: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    table: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    bracket: svg('<path d="M3 5h6v5H3M3 14h6v5H3M9 7.5h4v9H9M13 12h8"/>'),
    pack: svg('<rect x="5" y="8" width="14" height="13" rx="3"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 14h6"/>'),
    notes: svg('<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/>'),
    pin: svg('<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>')
  };

  /* ================= storage ================= */
  var mem = {};
  var S = TP.S = {
    index: { ids: [] }, tours: {}, settings: C.sanitizeSettings(), meta: { lastBackup: null }, damaged: [], memMode: false,
    view: "list", tid: null, tab: "games", packEdit: false, lastDate: {}
  };
  var store = TP.store = {
    get: function (k) { if (S.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("tpack." + k); } catch (e) { return null; } },
    set: function (k, v) { if (S.memMode) { mem[k] = v; return true; } try { localStorage.setItem("tpack." + k, v); return true; } catch (e) { return false; } },
    del: function (k) { if (S.memMode) { delete mem[k]; return; } try { localStorage.removeItem("tpack." + k); } catch (e) { /* ignore */ } },
    keys: function () {
      if (S.memMode) return Object.keys(mem);
      var out = [];
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("tpack.") === 0) out.push(k.slice(6)); } } catch (e) { /* ignore */ }
      return out;
    }
  };
  function probeStorage() { try { localStorage.setItem("tpack.probe", "1"); localStorage.removeItem("tpack.probe"); return true; } catch (e) { return false; } }
  function readJSON(k) { var raw = store.get(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return undefined; } }
  var lastSaveErr = 0;
  function failedSave() {
    if (Date.now() - lastSaveErr > 4000) { lastSaveErr = Date.now(); TP.toast("Couldn't save on this phone. Storage may be full or blocked. Open Settings and download a backup to keep a copy.", "error", 7000); }
    return false;
  }
  TP.saveTour = function (t) { return store.set("t." + t.id, JSON.stringify(t)) || failedSave(); };
  TP.saveIndex = function () { return store.set("index", JSON.stringify({ v: 1, ids: S.index.ids })) || failedSave(); };
  TP.saveSettings = function () { return store.set("settings", JSON.stringify(S.settings)) || failedSave(); };
  TP.saveMeta = function () { return store.set("meta", JSON.stringify(S.meta)) || failedSave(); };
  TP.cur = function () { return S.tid ? S.tours[S.tid] || null : null; };
  TP.addTour = function (t) { S.tours[t.id] = t; if (S.index.ids.indexOf(t.id) < 0) S.index.ids.unshift(t.id); TP.saveTour(t); TP.saveIndex(); };
  TP.removeTour = function (id) { delete S.tours[id]; S.index.ids = S.index.ids.filter(function (x) { return x !== id; }); store.del("t." + id); TP.saveIndex(); };

  TP.loadAll = function () {
    S.tours = {}; S.damaged = [];
    S.settings = C.sanitizeSettings(readJSON("settings"));
    var m = readJSON("meta");
    S.meta = { lastBackup: m && C.isYMD(m.lastBackup) ? m.lastBackup : null };
    var idx = readJSON("index");
    var ids = idx && Array.isArray(idx.ids) ? idx.ids.filter(function (x) { return typeof x === "string" && C.ID_RE.test(x); }) : [];
    store.keys().filter(function (k) { return k.indexOf("t.") === 0; }).forEach(function (k) { var id = k.slice(2); if (C.ID_RE.test(id) && ids.indexOf(id) < 0) ids.push(id); });
    ids = ids.filter(function (x, i) { return ids.indexOf(x) === i; });
    ids.forEach(function (id) {
      var raw = store.get("t." + id);
      if (raw == null) return;
      try {
        var t = C.sanitizeTournament(JSON.parse(raw));
        if (t && t.id === id) S.tours[id] = t; else S.damaged.push(id);
      } catch (e) { S.damaged.push(id); }
    });
    S.index.ids = ids.filter(function (id) { return S.tours[id]; });
  };
  TP.initStorage = function () { S.memMode = !probeStorage(); TP.loadAll(); };

  /* ================= toast ================= */
  TP.toast = function (msg, kind, ms, action) {
    var host = $("#toasts"); if (!host) return null;
    var t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.innerHTML = '<span class="tx"></span>' + (action ? '<button type="button" class="tact"></button>' : "");
    $(".tx", t).textContent = msg;
    var kill = function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, reduced() ? 0 : 260); };
    if (action) { var b = $(".tact", t); b.textContent = action.label; b.addEventListener("click", function () { kill(); action.fn(); }); }
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in"); }); });
    setTimeout(kill, ms || (kind === "error" ? 5500 : action ? 6000 : 3200));
    return t;
  };

  /* ================= sheets ================= */
  var sheetStack = [], sheetSeq = 0;
  TP.sheetCount = function () { return sheetStack.length; };
  function syncInert() {
    var top = sheetStack[sheetStack.length - 1], app = $("#app");
    if (app) app.inert = sheetStack.length > 0;
    sheetStack.forEach(function (s) { s.el.inert = s !== top; });
    document.body.classList.toggle("lock", sheetStack.length > 0);
  }
  TP.openSheet = function (o) {
    var opener = document.activeElement, id = "sh" + (++sheetSeq), wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' + TP.I.x + "</button></header>" +
      '<div class="sh-body">' + (o.html || "") + "</div>" + (o.footer ? '<div class="sh-foot">' + o.footer + "</div>" : "") + "</section>";
    var api = {
      el: wrap, sheet: $(".sheet", wrap), body: $(".sh-body", wrap), closed: false,
      close: function () {
        if (api.closed) return; api.closed = true;
        var i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
        syncHistory();
        wrap.classList.remove("open");
        wrap.inert = true;
        setTimeout(function () { wrap.remove(); }, reduced() ? 0 : 260);
        syncInert();
        var below = sheetStack[sheetStack.length - 1];
        if (below) { try { below.sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (opener && opener.focus && document.contains(opener) && !sheetStack.length) { try { opener.focus({ preventScroll: true }); } catch (e2) { /* ignore */ } }
        if (o.onClose) o.onClose();
      }
    };
    wrap.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) api.close(); });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); api.close(); return; }
      if (e.key !== "Tab") return;
      var f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', api.sheet).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === api.sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    sheetStack.push(api);
    syncHistory();
    $("#sheets").appendChild(wrap);
    syncInert();
    requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add("open"); }); });
    var af = o.autofocus ? $(o.autofocus, wrap) : null;
    setTimeout(function () { try { (af || api.sheet).focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    if (o.onOpen) o.onOpen(api);
    return api;
  };
  TP.closeAllSheets = function () { sheetStack.slice().forEach(function (s) { s.close(); }); };
  TP.topSheet = function () { return sheetStack[sheetStack.length - 1] || null; };
  TP.confirmSheet = function (o) {
    return TP.openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more ? o.more.map(function (m) { return '<p class="msg">' + esc(m) + "</p>"; }).join("") : "") + (o.list ? "<ul class=\"msg-list\">" + o.list.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>" : "") + (o.extra || ""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen: function (api) { $("[data-ok]", api.el).addEventListener("click", function () { api.close(); o.onConfirm(); }); }
    });
  };

  /* Android Back (and the browser's Back) closes the top sheet, or leaves the tournament, instead of leaving the app.
     Every open sheet owns one history entry, and so does being inside a tournament or Settings. Entries are added and given back
     a moment after things change, so a sheet that replaces another (close, then open in the same tap) costs nothing, and the
     entry we land on always says how deep we should be. */
  var histDepth = 0, traveling = false, syncTimer = 0;
  function pageDepth() { return S.view === "list" ? 0 : 1; }
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  TP.syncHistory = syncHistory;
  function reconcileHistory() {
    if (traveling) return; // the popstate handler tidies up when our own trip back lands
    var want = pageDepth() + sheetStack.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ tpHist: ++histDepth }, ""); }
      else if (want < histDepth) {
        var n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(function () { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.tpHist) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", function (e) {
    var at = (e.state && e.state.tpHist) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else {
      var page = pageDepth();
      while (sheetStack.length > Math.max(0, at - page)) sheetStack[sheetStack.length - 1].close();
      if (at < page && !sheetStack.length && TP.leavePage) TP.leavePage();
    }
    reconcileHistory();
  });
})();
