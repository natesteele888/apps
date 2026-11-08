/* Practice Clock shell: storage, sheets, toasts, Back-button sync, the plans list and the recent list.
   The editor is in editor.js, the clock in runner.js, settings / backup / sharing in settings.js.
   All data lives in this phone's localStorage (keys start with "practiceclock."). Nothing is sent anywhere. */
(function () {
  "use strict";
  const Core = window.PracticeClockCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const svg = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + d + "</svg>";
  const I = {
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    go: svg('<path d="M9 5l7 7-7 7"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 001.5.86l12-7.5a1 1 0 000-1.72l-12-7.5A1 1 0 007 4.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5v14l10-7z"/><rect x="16.5" y="5" width="3" height="14" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 5v14L9 12z"/><rect x="4.5" y="5" width="3" height="14" rx="1"/></svg>',
    up: svg('<path d="M6 15l6-6 6 6"/>'), down: svg('<path d="M6 9l6 6 6-6"/>'),
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>',
    share: svg('<path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7"/>'),
    restart: svg('<path d="M4 12a8 8 0 108-8H8M8 4L5 7l3 3"/>'),
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>',
    plans: svg('<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>'),
    recent: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/>'),
    sound: svg('<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 010 6"/>'),
    mute: svg('<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/>'),
    mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="9.5" y="1.8" width="5" height="2.6" rx="1" fill="currentColor" stroke="none"/><circle cx="12" cy="13.5" r="8"/><path d="M12 8.5v5l3.5 2.2"/></svg>'
  };

  const S = {
    plans: [], hist: [], settings: Core.sanitizeSettings({}), meta: { lastBackup: null }, run: null,
    view: "plans", planId: null, memMode: false, dropped: 0
  };
  const PC = window.PCApp = { Core: Core, S: S, I: I, ACT: {}, V: {}, $: $, $$: $$, esc: esc, reduced: reduced, svg: svg };

  /* ================= storage ================= */
  const mem = {};
  const store = PC.store = {
    get(k) { if (S.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("practiceclock." + k); } catch (e) { return null; } },
    set(k, v) { if (S.memMode) { mem[k] = v; return true; } try { localStorage.setItem("practiceclock." + k, v); return true; } catch (e) { return false; } },
    del(k) { if (S.memMode) { delete mem[k]; return; } try { localStorage.removeItem("practiceclock." + k); } catch (e) { /* ignore */ } }
  };
  function probeStorage() { try { localStorage.setItem("practiceclock.probe", "1"); localStorage.removeItem("practiceclock.probe"); return true; } catch (e) { return false; } }
  let lastSaveErr = 0;
  function failSave() {
    if (Date.now() - lastSaveErr > 4000) { lastSaveErr = Date.now(); toast("Couldn't save on this phone. Storage may be full or blocked. Use Settings, then Download backup file, to keep a copy.", "error", 7000); }
    return false;
  }
  PC.saveData = function () {
    const ok = store.set("data", JSON.stringify({ v: 1, plans: S.plans, hist: S.hist, settings: S.settings, meta: S.meta }));
    return ok || failSave();
  };
  PC.saveRun = function () {
    if (!S.run) { store.del("run"); return true; }
    return store.set("run", JSON.stringify(S.run)) || failSave();
  };
  function readJSON(k) { const raw = store.get(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return undefined; } }
  PC.loadAll = function () {
    S.plans = []; S.hist = []; S.settings = Core.sanitizeSettings({}); S.meta = { lastBackup: null }; S.run = null; S.dropped = 0;
    const d = readJSON("data");
    if (d && typeof d === "object") {
      const seen = {};
      (Array.isArray(d.plans) ? d.plans : []).slice(0, Core.LIMITS.maxPlans).forEach(p => {
        const c = Core.sanitizePlan(p);
        if (!c) { S.dropped++; return; }
        if (seen[c.id]) c.id = Core.uid();
        seen[c.id] = 1; S.plans.push(c);
      });
      (Array.isArray(d.hist) ? d.hist : []).slice(0, Core.LIMITS.histMax).forEach(h => { const x = Core.sanitizeLog(h); if (x) S.hist.push(x); });
      S.settings = Core.sanitizeSettings(d.settings);
      if (d.meta && Core.isYMD(d.meta.lastBackup)) S.meta.lastBackup = d.meta.lastBackup;
    }
    const r = readJSON("run");
    if (r) S.run = Core.sanitizeRun(r);
  };
  PC.getPlan = id => S.plans.filter(p => p.id === id)[0] || null;
  PC.addPlan = function (plan) {
    if (S.plans.length >= Core.LIMITS.maxPlans) { toast("You already have " + Core.LIMITS.maxPlans + " plans. Delete one first.", "error"); return false; }
    S.plans.unshift(plan); PC.saveData(); return true;
  };
  PC.savePlan = function (plan) { const i = S.plans.findIndex(p => p.id === plan.id); if (i >= 0) S.plans[i] = plan; PC.saveData(); };
  PC.removePlan = function (id) { S.plans = S.plans.filter(p => p.id !== id); PC.saveData(); };
  PC.today = () => Core.todayStr();
  PC.now = () => Date.now();

  /* ================= toast ================= */
  function toast(msg, kind, ms) {
    const host = $("#toasts"); if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.textContent = msg;
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("in")));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); }, ms || (kind === "error" ? 5500 : 3200));
    return t;
  }
  PC.toast = toast;

  /* ================= sheets ================= */
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
  function closeAllSheets() { sheetStack.slice().forEach(s => s.close()); }
  function confirmSheet(o) {
    return openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more ? o.more.map(m => '<p class="msg">' + esc(m) + "</p>").join("") : "") + (o.extra || ""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen(api) { $("[data-ok]", api.el).addEventListener("click", () => { api.close(); o.onConfirm(); }); }
    });
  }
  PC.openSheet = openSheet; PC.closeAllSheets = closeAllSheets; PC.confirmSheet = confirmSheet; PC.sheetCount = () => sheetStack.length;

  /* ================= Back button =================
     Each open sheet owns one history entry, and so does a "deeper" screen (the editor or the clock). Entries are
     added and given back a moment after things change, so a sheet that replaces another one costs nothing, and
     the entry we land on always says how many things should be open. Android Back then closes the top sheet,
     or leaves the editor / clock for the plans list, instead of leaving the app. */
  let histDepth = 0, traveling = false, syncTimer = 0, viewDepth = 0, PC_markHistory = null;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  function reconcileHistory() {
    if (traveling) return;
    const want = viewDepth + sheetStack.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ pcSheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        const n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.pcSheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  // Opening a shared link while the app is open adds a history entry of its own. Keep the count in step with it.
  PC_markHistory = function () { try { history.replaceState(histDepth ? { pcSheets: histDepth } : null, "", location.pathname + location.search); } catch (e) { /* ignore */ } };
  window.addEventListener("popstate", e => {
    if (!e.state && /^#p\d+=/.test(location.hash || "")) return;
    const at = (e.state && e.state.pcSheets) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else {
      while (sheetStack.length > Math.max(0, at - viewDepth)) sheetStack[sheetStack.length - 1].close();
      if (at < viewDepth) { viewDepth = 0; S.view = "plans"; render(); }
    }
    reconcileHistory();
  });

  /* ================= views ================= */
  const DEEP = { editor: 1, runner: 1 };
  let lastView = null;
  function render() {
    const v = PC.V[S.view] || PC.V.plans;
    const el = $("#view"), same = lastView === S.view, y = window.scrollY;
    const ae = document.activeElement, keepId = same && ae && ae.id && el.contains(ae) ? ae.id : null;
    el.className = v.cls || "";
    v.render(el);
    const nav = $("#nav");
    nav.hidden = !v.tab;
    if (v.tab) {
      nav.innerHTML = '<div class="nav-in">' + [["plans", "Plans", I.plans], ["recent", "Recent", I.recent], ["settings", "Settings", I.gear]].map(t =>
        '<button type="button" data-act="tab" data-tab="' + t[0] + '"' + (S.view === t[0] ? ' aria-current="page"' : "") + ">" + t[2] + "<span>" + t[1] + "</span></button>").join("") + "</div>";
    }
    if (v.after) v.after(el);
    lastView = S.view;
    if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
    if (keepId) { const n = document.getElementById(keepId); if (n && n !== document.activeElement) { try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }
  function go(view, planId) {
    S.view = view; if (planId !== undefined) S.planId = planId;
    viewDepth = DEEP[view] ? 1 : 0;
    closeAllSheets();
    render();
    syncHistory();
    try { $("#view").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  PC.render = render; PC.go = go; PC.markHistory = () => { if (PC_markHistory) PC_markHistory(); };

  /* ---------- plans list ---------- */
  const sportTag = id => { const s = Core.sportInfo(id); return '<span class="tag">' + s.icon + " " + esc(s.label) + "</span>"; };
  const planMeta = p => Core.planMinutes(p) + " min · " + p.blocks.length + (p.blocks.length === 1 ? " block" : " blocks");
  function memBanner() {
    return S.memMode ? '<div class="banner bad" role="alert"><p><b>This browser is not letting Practice Clock save.</b> Plans you make will be lost when you close the app. Use Settings, then Download backup file, to keep a copy.</p></div>' : "";
  }
  function runBanner() {
    if (!S.run) return "";
    const fin = S.run.finished;
    return '<button type="button" class="run-banner" data-act="open-runner"><span class="t" id="runbanner-t">' + (fin ? "Practice finished" : "Practice running") + "<small>" + esc(S.run.plan.name) + ' · tap to open the clock</small></span><span class="go" aria-hidden="true">' + I.go + "</span></button>";
  }
  PC.V.plans = {
    tab: true,
    render(el) {
      let h = memBanner() + runBanner();
      if (S.dropped) h += '<div class="banner"><p>' + S.dropped + (S.dropped === 1 ? " saved plan" : " saved plans") + " couldn't be read and was skipped. The rest are fine.</p></div>";
      if (!S.plans.length) {
        h += '<section class="welcome"><div class="logo"><span class="mark">' + I.mark + "</span></div><h1>Practice Clock</h1>" +
          '<p class="tagline">Run practice by the minute</p>' +
          '<p class="lede">Build a plan out of timed blocks, then run it from the field. A big countdown moves from block to block on its own and tells you when to rotate stations.</p>' +
          '<div class="tpl-list">' + Core.TEMPLATES.map(t => '<button type="button" class="list-btn tpl" data-act="use-template" data-id="' + t.id + '" data-ic="' + Core.sportInfo(t.sport).icon + '">Start with a ' + t.id + " template</button>").join("") + "</div>" +
          '<div class="stack" style="margin-top:14px"><button type="button" class="btn ghost block" data-act="new-plan">Build my own plan</button><button type="button" class="btn ghost block" data-act="sample">Try a sample</button></div>' +
          '<p class="privacy-note">Everything stays on this phone. No account, and nothing is sent anywhere. Already have a backup? <label class="file-btn" style="color:var(--accent);font-weight:800;min-height:44px;display:inline-flex;align-items:center;padding:0 4px">Restore it<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Practice Clock backup file"></label></p></section>';
        el.innerHTML = h;
        return;
      }
      h += '<header class="top"><span class="mark">' + I.mark + '</span><h1>Plans</h1><button type="button" class="icon-btn" data-act="new-plan">' + I.plus + "New plan</button></header>";
      h += S.plans.map(p =>
        '<article class="card plan" data-plan="' + p.id + '"><button type="button" class="plan-main" data-act="plan-edit" data-id="' + p.id + '"><div class="nm">' + esc(p.name) + '</div><div class="meta">' + sportTag(p.sport) + " " + esc(planMeta(p)) + "</div></button>" +
        '<div class="plan-actions"><button type="button" class="btn start" data-act="plan-start" data-id="' + p.id + '">' + I.play + 'Start</button><button type="button" class="btn ghost" data-act="plan-edit" data-id="' + p.id + '">Edit</button>' +
        '<button type="button" class="btn ghost more" data-act="plan-more" data-id="' + p.id + '" aria-label="More for ' + esc(p.name) + '">' + I.more + "</button></div></article>").join("");
      h += '<div class="sec-title"><h2>Starter plans</h2></div><button type="button" class="list-btn" data-act="templates"><span class="t">Use a template<small>Baseball, softball, basketball, cheer or football</small></span><span class="go">' + I.go + "</span></button>";
      el.innerHTML = h;
    }
  };
  PC.ACT["tab"] = el => { S.view = el.dataset.tab; viewDepth = 0; render(); syncHistory(); };
  PC.ACT["open-runner"] = () => go("runner");
  PC.ACT["plan-edit"] = el => go("editor", el.dataset.id);
  PC.ACT["plan-start"] = el => { const p = PC.getPlan(el.dataset.id); if (p) PC.startRun(p); };

  function useTemplate(id, quiet) {
    const p = Core.planFromTemplate(id); if (!p) return null;
    if (!PC.addPlan(p)) return null;
    if (!quiet) toast("Added " + p.name + ". Change anything you like.", "ok");
    return p;
  }
  PC.ACT["use-template"] = el => { const p = useTemplate(el.dataset.id); if (p) go("editor", p.id); };
  PC.ACT["templates"] = () => openSheet({
    title: "Starter templates",
    html: '<p class="msg mute" style="margin-bottom:12px">Each one is a copy you can change. Nothing is locked.</p><div class="tpl-list">' +
      Core.TEMPLATES.map(t => '<button type="button" class="list-btn" data-act="use-template" data-id="' + t.id + '"><span class="ic">' + Core.sportInfo(t.sport).icon + '</span><span class="t">' + esc(t.title) + "<small>" + t.blocks.length + " blocks, " + Core.planMinutes(Core.planFromTemplate(t.id)) + ' min</small></span><span class="go">' + I.go + "</span></button>").join("") + "</div>"
  });
  PC.ACT["sample"] = () => {
    const a = useTemplate("baseball", true), b = useTemplate("basketball", true);
    if (!a || !b) return;
    const t = PC.today();
    const mk = (back, plan, planned, actual, early) => ({ id: Core.uid(), date: addDaysYMD(t, -back), plan: plan, planned: planned, actual: actual, early: early, sample: true });
    S.hist = [mk(1, "Baseball 90 min", 90, 94, false), mk(3, "Basketball 60 min", 60, 52, true), mk(6, "Baseball 90 min", 90, 91, false)];
    PC.saveData(); render();
    toast("Added a baseball and a basketball plan, plus three sample practices in Recent.", "ok", 4500);
  };
  function addDaysYMD(ymd, n) {
    const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n));
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  /* ---------- new plan / more ---------- */
  PC.ACT["new-plan"] = () => {
    let sport = "other";
    const sh = openSheet({
      title: "New plan", autofocus: "#np-name",
      html: '<label class="field"><span class="label">Name</span><input type="text" id="np-name" maxlength="40" autocomplete="off" placeholder="Tuesday practice"></label>' +
        '<div class="field"><span class="label">Sport</span><div class="pills" id="np-sport">' + Core.SPORTS.map(s => '<button type="button" class="pill" data-sport="' + s.id + '" aria-pressed="' + (s.id === sport) + '">' + s.icon + " " + esc(s.label) + "</button>").join("") + "</div></div>" +
        '<p class="mute" style="font-size:15px;margin-bottom:8px">You will add the blocks next.</p><button type="button" class="btn ghost block small" data-act="templates">Or start from a template instead</button>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-create>Create plan</button>',
      onOpen(api) {
        api.el.addEventListener("click", e => {
          const b = e.target.closest("[data-sport]");
          if (b) { sport = b.dataset.sport; $$("[data-sport]", api.el).forEach(x => x.setAttribute("aria-pressed", String(x === b))); }
          if (e.target.closest("[data-create]")) create();
          if (e.target.closest('[data-act="templates"]')) api.close();
        });
        $("#np-name", api.el).addEventListener("keydown", e => { if (e.key === "Enter") create(); });
        function create() {
          const name = Core.str($("#np-name", api.el).value, Core.LIMITS.nameMax);
          const p = Core.sanitizePlan({ name: name || "New plan", sport: sport, blocks: [] });
          if (!PC.addPlan(p)) return;
          api.close(); go("editor", p.id);
        }
      }
    });
    return sh;
  };
  PC.ACT["plan-more"] = el => {
    const p = PC.getPlan(el.dataset.id); if (!p) return;
    openSheet({
      title: p.name,
      html: '<button type="button" class="list-btn" data-act="plan-dup" data-id="' + p.id + '"><span class="t">Duplicate<small>Make a copy to change</small></span>' + I.go + "</button>" +
        '<button type="button" class="list-btn" data-act="plan-rename" data-id="' + p.id + '"><span class="t">Rename<small>Change the plan\'s name</small></span>' + I.go + "</button>" +
        '<button type="button" class="list-btn" data-act="plan-share" data-id="' + p.id + '"><span class="t">Share, copy or print<small>Link, text, or a one-page schedule</small></span>' + I.go + "</button>" +
        '<button type="button" class="list-btn warn" data-act="plan-del" data-id="' + p.id + '"><span class="t">Delete<small>Removes this plan from the phone</small></span>' + I.go + "</button>"
    });
  };
  PC.ACT["plan-dup"] = el => {
    const p = PC.getPlan(el.dataset.id); if (!p) return;
    const c = Core.duplicatePlan(p);
    closeAllSheets();
    if (c && PC.addPlan(c)) { render(); toast("Made a copy: " + c.name, "ok"); }
  };
  PC.ACT["plan-rename"] = el => {
    const p = PC.getPlan(el.dataset.id); if (!p) return;
    closeAllSheets();
    openSheet({
      title: "Rename plan", autofocus: "#rn-name",
      html: '<label class="field"><span class="label">Name</span><input type="text" id="rn-name" maxlength="40" autocomplete="off" value="' + esc(p.name) + '"></label>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save</button>',
      onOpen(api) {
        const save = () => {
          const n = Core.str($("#rn-name", api.el).value, Core.LIMITS.nameMax);
          if (!n) { if (!$(".errmsg", api.el)) $("#rn-name", api.el).insertAdjacentHTML("afterend", '<p class="errmsg" role="alert">Give the plan a name.</p>'); return; }
          p.name = n; PC.savePlan(p); api.close(); render(); toast("Renamed.", "ok");
        };
        $("[data-save]", api.el).addEventListener("click", save);
        $("#rn-name", api.el).addEventListener("keydown", e => { if (e.key === "Enter") save(); });
      }
    });
  };
  PC.ACT["plan-del"] = el => {
    const p = PC.getPlan(el.dataset.id); if (!p) return;
    closeAllSheets();
    confirmSheet({
      title: "Delete this plan?", message: "“" + p.name + "” will be removed from this phone. This can't be undone.",
      more: ["Want a copy first? Share or copy it as text before you delete."], confirmText: "Delete plan", danger: true,
      onConfirm() { PC.removePlan(p.id); if (S.view === "editor") go("plans"); else render(); toast("Deleted.", "ok"); }
    });
  };

  /* ---------- recent practices ---------- */
  PC.V.recent = {
    tab: true,
    render(el) {
      let h = memBanner() + '<header class="top"><span class="mark">' + I.mark + "</span><h1>Recent practices</h1></header>";
      if (!S.hist.length) {
        h += '<div class="empty"><h3>Nothing yet</h3><p>When a practice ends, Practice Clock saves one line here: the date, the plan, and how long you planned versus how long it really took. Only the last ' + Core.LIMITS.histMax + " are kept.</p></div>";
      } else {
        h += S.hist.map(x => {
          const d = Core.fmtDate(x.date).split(", ");
          const diff = x.actual - x.planned;
          return '<div class="hrow"><div class="d"><small>' + esc(d[0] || "") + "</small>" + esc(d[1] || x.date) + '</div><div class="i"><b>' + esc(x.plan) + "</b><span>Planned " + x.planned + " min · Actual " + x.actual + " min" +
            (diff ? " (" + (diff > 0 ? "+" : "") + diff + ")" : "") + "</span>" + (x.early ? ' <span class="tag early">Ended early</span>' : "") + (x.sample ? ' <span class="tag sample">Sample</span>' : "") + "</div></div>";
        }).join("");
        h += '<div style="margin-top:14px"><button type="button" class="btn danger block small" data-act="hist-clear">Clear this list</button></div>';
      }
      el.innerHTML = h;
    }
  };
  PC.ACT["hist-clear"] = () => confirmSheet({
    title: "Clear recent practices?", message: "This removes all " + S.hist.length + " saved practice " + (S.hist.length === 1 ? "line" : "lines") + ". Your plans are not touched.", confirmText: "Clear list", danger: true,
    onConfirm() { S.hist = []; PC.saveData(); render(); toast("Cleared.", "ok"); }
  });

  /* ================= events and start-up ================= */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const f = PC.ACT[el.dataset.act];
    if (f) f(el, e);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
  document.addEventListener("change", e => { if (e.target && e.target.matches && e.target.matches("[data-restore]") && PC.onRestoreFile) { PC.onRestoreFile(e.target.files && e.target.files[0]); e.target.value = ""; } });

  PC.init = function () {
    S.memMode = !probeStorage();
    PC.loadAll();
    S.view = S.run ? "runner" : "plans";
    viewDepth = DEEP[S.view] ? 1 : 0;
    render();
    syncHistory();
    if (PC.runnerBoot) PC.runnerBoot();
    if (PC.checkShareHash) PC.checkShareHash();
    if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  };
})();
