/* Who's Where, part 1: shared pieces (state, saving on this phone, toasts, bottom sheets, Back button).
   Everything lives in this phone's localStorage under keys that start with "whoswhere.". Nothing is sent anywhere. */
(function () {
  "use strict";
  const C = window.WhosWhereCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const ACT = {};   // click handlers, looked up by data-act

  const svg = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + d + "</svg>";
  const I = {
    week: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2"/>'),
    month: svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M9 9.5v11M15 9.5v11M3.5 15h17"/>'),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>'),
    people: svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.5-3.6 3-5.5 6-5.5s5.5 1.9 6 5.5"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M17.5 14.5c2.2.2 3.4 1.8 3.7 4.5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.6"'),
    left: svg('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.8"'),
    right: svg('<path d="M9 5l7 7-7 7"/>', ' stroke-width="2.8"'),
    go: svg('<path d="M9 6l6 6-6 6"/>', ' width="18" height="18" stroke-width="2.6"'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>', ' stroke-width="2.4"'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', ' width="20" height="20" style="flex:0 0 auto"'),
    pin: svg('<path d="M12 21s-7-6.2-7-11.2A7 7 0 0 1 19 9.8C19 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>', ' width="16" height="16"')
  };

  /* ================= state and saving ================= */
  const S = {
    people: [], events: [], series: [], settings: C.sanitizeSettings({}), meta: { lastBackup: null, tips: {} },
    view: "week", cursor: null, monthCursor: null, filter: null, horizon: 14,
    memMode: false, damaged: false, droppedNote: "", cf: [], cfBy: {}, evm: {}, pm: {}, undo: null
  };
  const mem = {};
  const store = {
    get(k) { if (S.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("whoswhere." + k); } catch (e) { return null; } },
    set(k, v) { if (S.memMode) { mem[k] = v; return true; } try { localStorage.setItem("whoswhere." + k, v); return true; } catch (e) { return false; } },
    del(k) { if (S.memMode) { delete mem[k]; return; } try { localStorage.removeItem("whoswhere." + k); } catch (e) { /* ignore */ } }
  };
  function probeStorage() { try { localStorage.setItem("whoswhere.probe", "1"); localStorage.removeItem("whoswhere.probe"); return true; } catch (e) { return false; } }
  const today = () => C.todayStr();

  let lastSaveErr = 0;
  function save() {
    if (S.events.length && !S.meta.since) { S.meta.since = today(); saveMeta(); }
    const ok = store.set("data", JSON.stringify({ v: 1, people: S.people, events: S.events, series: S.series, settings: S.settings }));
    if (!ok && Date.now() - lastSaveErr > 4000) { lastSaveErr = Date.now(); toast("Couldn't save on this phone. Storage may be full or blocked. Open Settings and tap Back up to keep a copy.", "error", 7000); }
    return ok;
  }
  function saveMeta() { return store.set("meta", JSON.stringify(S.meta)); }
  function setState(st) {
    S.people = st.people; S.events = st.events; S.series = st.series || []; S.settings = st.settings || S.settings;
    S.cursor = null; S.filter = null;
  }
  function load() {
    S.memMode = !probeStorage();
    S.damaged = false;
    const rawMeta = store.get("meta");
    S.meta = { lastBackup: null, tips: {} };
    try {
      const m = rawMeta ? JSON.parse(rawMeta) : null;
      if (m && typeof m === "object") {
        if (C.isYMD(m.lastBackup)) S.meta.lastBackup = m.lastBackup;
        if (C.isYMD(m.since)) S.meta.since = m.since;
        if (C.isYMD(m.snooze)) S.meta.snooze = m.snooze;
        if (m.tips && typeof m.tips === "object") Object.keys(m.tips).forEach(k => { if (/^[a-z]{2,12}$/.test(k) && m.tips[k] === true) S.meta.tips[k] = true; });
      }
    } catch (e) { /* ignore a damaged meta record */ }
    const raw = store.get("data");
    let st = C.sanitizeState({});
    if (raw != null) {
      try {
        const obj = JSON.parse(raw);
        if (!C.isObj(obj)) throw new Error("shape");
        st = C.sanitizeState(obj);
        if (st.dropped.events || st.dropped.people) S.droppedNote = (st.dropped.events + st.dropped.people) + " saved item" + (st.dropped.events + st.dropped.people === 1 ? "" : "s") + " couldn’t be read and left out.";
      } catch (e) {
        S.damaged = true; store.set("damaged", raw);   // keep the unreadable text, start clean
      }
    }
    setState(st);
    S.view = "week";
    derive();
  }
  /* Everything computed from the saved data: who is who, and every conflict. Run after any change. */
  function derive() {
    S.pm = C.byId(S.people); S.evm = C.byId(S.events);
    S.cf = C.activeConflicts(C.findConflicts(S.events), today());
    S.cfBy = C.conflictsByEvent(S.cf);
  }
  const kids = () => S.people.filter(p => p.role === "player");
  const adults = () => S.people.filter(p => p.role === "adult");
  const h24 = () => S.settings.h24;
  const hasData = () => S.people.length > 0 || S.events.length > 0;
  const hasAnyEvents = () => S.events.length > 0;

  /* Undo for quick actions: one step back. */
  function snapshot() { return JSON.stringify({ people: S.people, events: S.events, series: S.series }); }
  function withUndo(label, fn, okMsg) {
    const snap = snapshot();
    fn();
    derive(); save(); WW.render();
    toast(okMsg || label, "ok", 6000, { label: "Undo", fn() {
      try { const o = JSON.parse(snap); S.people = o.people; S.events = o.events; S.series = o.series; } catch (e) { return; }
      derive(); save(); WW.render(); toast("Undone.", "ok");
    } });
  }

  /* ================= toast ================= */
  function toast(msg, kind, ms, action) {
    const host = $("#toasts"); if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.innerHTML = '<span class="tx"></span>' + (action ? '<button type="button" class="tbtn"></button>' : "");
    $(".tx", t).textContent = msg;
    const kill = () => { t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); };
    if (action) { const b = $(".tbtn", t); b.textContent = action.label; b.addEventListener("click", () => { kill(); action.fn(); }); t.style.pointerEvents = "auto"; }
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("in")));
    setTimeout(kill, ms || (kind === "error" ? 5500 : 3200));
    return t;
  }

  /* ================= bottom sheets ================= */
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
    $$("#toasts .toast").forEach(t => { if (!t.querySelector(".tbtn") && !t.classList.contains("error")) t.remove(); });   // old "saved" messages would sit on top of the new sheet
    const id = "sh" + (++sheetSeq);
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' + I.x + "</button></header>" +
      '<div class="sh-body">' + (o.html || "") + "</div>" + (o.footer ? '<div class="sh-foot">' + o.footer + "</div>" : "") + "</section>";
    const api = {
      el: wrap, sheet: $(".sheet", wrap), body: $(".sh-body", wrap), closed: false, render: o.render || null, kind: o.kind || "",
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
  /* Escape also works when focus has not moved into the sheet yet (or was lost). */
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || e.defaultPrevented || e.isComposing || !sheetStack.length) return;
    sheetStack[sheetStack.length - 1].close();
  });
  function closeAllSheets() { sheetStack.slice().forEach(s => s.close()); }
  /* Sheets that show live data (an event, a day) draw themselves again after any change. */
  function refreshSheets() {
    sheetStack.slice().forEach(s => {
      if (!s.render || s.closed) return;
      const r = s.render();
      if (!r) { s.close(); return; }
      const top = s.body.scrollTop;
      s.body.innerHTML = r.html; s.body.scrollTop = top;
      const h = $(".sh-head h2", s.el); if (h && r.title) h.textContent = r.title;
    });
  }
  /* Android Back (and the browser's Back) closes the top sheet instead of leaving the app.
     Each open sheet owns one history entry. Entries are added and given back a moment after the sheets change,
     so a sheet that replaces another one (close, then open in the same tap) costs nothing, and the entry we land
     on always says how many sheets should be open. */
  let histDepth = 0, traveling = false, syncTimer = 0;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  function reconcileHistory() {
    if (traveling) return;
    const want = sheetStack.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ wwSheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        const n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.wwSheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", e => {
    const at = (e.state && e.state.wwSheets) || 0;
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

  /* ================= small shared bits ================= */
  function person(id) { return S.pm[id] || null; }
  function chip(p, extra) {
    if (!p) return "";
    return '<span class="chip ' + (extra || "") + '" style="--c:' + esc(p.color) + '"><i class="dot" aria-hidden="true"></i>' + esc(p.name) + "</span>";
  }
  function fmtT(min) { return C.fmtTime(min, h24()); }
  function readJSONFile(file, done, bad) {
    if (file.size > 25 * 1024 * 1024) return bad("That file is too big to be a Who's Where backup.");
    const rd = new FileReader();
    rd.onerror = () => bad("Couldn't read that file.");
    rd.onload = () => { let obj; try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Who's Where backup (it can't be read)."); } done(obj); };
    rd.readAsText(file);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
  }

  window.WW = { C, S, ACT, $, $$, esc, I, reduced, store, save, saveMeta, load, derive, setState, today, kids, adults, h24, hasData, hasAnyEvents, snapshot, withUndo,
    toast, openSheet, closeAllSheets, refreshSheets, confirmSheet, person, chip, fmtT, readJSONFile, downloadBlob, sheetStack, render() {} };
})();
