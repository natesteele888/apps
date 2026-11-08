/* Walk-Up UI helpers: escaping, toasts, one sheet system (with the Android Back button), steppers, the waveform painter.
   The app draws inside the element it is given (WU.mount), so it can later live inside another page. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var U = WU.U = {};
  var root = null;

  U.$ = function (s, r) { return (r || root || document).querySelector(s); };
  U.$$ = function (s, r) { return Array.prototype.slice.call((r || root || document).querySelectorAll(s)); };
  U.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  U.reduced = function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var $ = U.$, $$ = U.$$, esc = U.esc;

  U.I = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 5v14L7 12zM5 5h2.4v14H5z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l10-7zM16.6 5H19v14h-2.4z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/></svg>',
    game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-4 3-6 6-6s5.5 2 6 6M16 5.5a3 3 0 010 5.6M18 14c2 .8 3.2 2.700 3.500 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    go: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>'
  };

  /* ---------- toasts and the screen-reader line ---------- */
  /* act (optional): { text, fn } adds a button to the toast, for things like Undo; the toast stays a little longer */
  U.toast = function (msg, kind, ms, act) {
    var host = $("#wuToasts"); if (!host) return null;
    var t = document.createElement("div");
    t.className = "toast " + (kind || "") + (act ? " has-act" : "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    var tx = document.createElement("span"); tx.className = "tx"; tx.textContent = msg; t.appendChild(tx);
    function hide() { t.classList.remove("in"); setTimeout(function () { t.remove(); }, U.reduced() ? 0 : 260); }
    if (act && act.fn) {
      var b = document.createElement("button"); b.type = "button"; b.className = "tact"; b.textContent = act.text || "Undo";
      b.addEventListener("click", function () { hide(); try { act.fn(); } catch (e) { console.error(e); } });
      t.appendChild(b);
    }
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in"); }); });
    setTimeout(hide, ms || (act ? 7000 : kind === "error" ? 6000 : 3200));
    return t;
  };
  /* a message that stays until done() - for slow jobs like adding songs */
  U.busy = function (msg) {
    var t = U.toast(msg, "busy", 600000);
    return { text: function (m) { if (t) $(".tx", t).textContent = m; }, done: function () { if (t) { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 260); } } };
  };
  U.live = function (msg) { var l = $("#wuLive"); if (l) l.textContent = msg; };

  /* ---------- sheets ---------- */
  var stack = [], seq = 0;
  U.sheetCount = function () { return stack.length; };
  function syncInert() {
    var top = stack[stack.length - 1], app = $("#wuApp");
    if (app) app.inert = stack.length > 0;
    stack.forEach(function (s) { s.el.inert = s !== top; });
    document.documentElement.classList.toggle("wu-lock", stack.length > 0);
  }
  U.openSheet = function (o) {
    var opener = document.activeElement, id = "wush" + (++seq), wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' + U.I.x + "</button></header>" +
      '<div class="sh-body">' + (o.html || "") + "</div>" + (o.footer ? '<div class="sh-foot">' + o.footer + "</div>" : "") + "</section>";
    var api = {
      el: wrap, sheet: $(".sheet", wrap), body: $(".sh-body", wrap), closed: false,
      setTitle: function (t) { $("h2", wrap).textContent = t; },
      close: function () {
        if (api.closed) return; api.closed = true;
        var i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
        syncHistory();
        wrap.classList.remove("open"); wrap.inert = true;
        setTimeout(function () { wrap.remove(); }, U.reduced() ? 0 : 260);
        syncInert();
        var below = stack[stack.length - 1];
        if (below) { try { below.sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (opener && opener.focus && document.contains(opener) && !stack.length) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (o.onClose) { try { o.onClose(api); } catch (e) { console.error(e); } }
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
    stack.push(api);
    syncHistory();
    $("#wuSheets").appendChild(wrap);
    syncInert();
    requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add("open"); }); });
    var af = o.autofocus ? $(o.autofocus, wrap) : null;
    setTimeout(function () { try { (af || api.sheet).focus({ preventScroll: true }); if (af && af.select && o.select) af.select(); } catch (e) { /* ignore */ } }, 30);
    if (o.onOpen) o.onOpen(api);
    return api;
  };
  U.closeAll = function () { stack.slice().forEach(function (s) { s.close(); }); };
  U.topSheet = function () { return stack[stack.length - 1] || null; };

  /* Android Back closes the top sheet instead of leaving the app. Each open sheet owns one history entry.
     Entries are added and given back a moment after the sheets change, so a sheet that replaces another costs nothing. */
  var histDepth = 0, traveling = false, syncTimer = 0;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcile, 0); }
  function reconcile() {
    if (traveling) return;
    var want = stack.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ wuSheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        var n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(function () { if (traveling) { traveling = false; reconcile(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.wuSheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", function (e) {
    var at = (e.state && e.state.wuSheets) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else while (stack.length > at) stack[stack.length - 1].close();
    reconcile();
  });

  /* Escape closes the top sheet even if focus has not landed inside it yet */
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && stack.length && !e.defaultPrevented) stack[stack.length - 1].close(); });

  U.confirm = function (o) {
    return U.openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more ? o.more.map(function (m) { return '<p class="msg">' + esc(m) + "</p>"; }).join("") : "") + (o.extra || ""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen: function (api) { $("[data-ok]", api.el).addEventListener("click", function () { api.close(); o.onConfirm(); }); }
    });
  };

  /* ---------- steppers and sliders ---------- */
  /* o: key, label, hint, value (number), min, max, step, coarse, fmt, slider (bool) */
  U.stepper = function (o) {
    var v = o.value, h = '<div class="stepper' + (o.slider ? " has-slider" : "") + '" data-ctl="' + o.key + '"><div class="nm">' + esc(o.label) + (o.hint ? "<small>" + esc(o.hint) + "</small>" : "") + '</div><div class="ctl">';
    if (o.coarse) h += '<button type="button" class="st big" data-step="-' + o.coarse + '" data-key="' + o.key + '" aria-label="Down ' + o.coarse + '">-' + o.coarse + "</button>";
    h += '<button type="button" class="st" data-step="-' + o.step + '" data-key="' + o.key + '" aria-label="Down ' + o.step + '">&minus;</button>';
    h += '<input type="number" inputmode="decimal" data-key="' + o.key + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + v + '" aria-label="' + esc(o.label) + '">';
    h += '<button type="button" class="st" data-step="' + o.step + '" data-key="' + o.key + '" aria-label="Up ' + o.step + '">+</button>';
    if (o.coarse) h += '<button type="button" class="st big" data-step="' + o.coarse + '" data-key="' + o.key + '" aria-label="Up ' + o.coarse + '">+' + o.coarse + "</button>";
    h += "</div>";
    if (o.slider) h += '<input type="range" class="rng" data-key="' + o.key + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + v + '" aria-label="' + esc(o.label) + ' slider">';
    return h + "</div>";
  };
  U.range = function (o) {
    return '<div class="slide" data-ctl="' + o.key + '"><div class="row sp"><span class="nm">' + esc(o.label) + '</span><span class="val" data-val="' + o.key + '">' + esc(o.text || "") + '</span></div><input type="range" class="rng" data-key="' + o.key + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + o.value + '" aria-label="' + esc(o.label) + '"></div>';
  };
  /* wire every stepper / slider inside el to fn(key, mode, value): mode is "step" (value = the amount) or "set" (value = the number) */
  U.bindControls = function (el, fn) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]");
      if (b && el.contains(b)) fn(b.dataset.key, "step", parseFloat(b.dataset.step));
    });
    el.addEventListener("input", function (e) {
      var t = e.target;
      if (t.matches && t.matches('input[type="range"][data-key]')) fn(t.dataset.key, "set", parseFloat(t.value));
    });
    el.addEventListener("change", function (e) {
      var t = e.target;
      if (t.matches && t.matches('input[type="number"][data-key]')) { var n = parseFloat(t.value); fn(t.dataset.key, "set", isFinite(n) ? n : NaN); }
    });
  };
  U.setCtl = function (el, key, value) {
    $$('input[data-key="' + key + '"]', el).forEach(function (i) { if (document.activeElement !== i || i.type === "range") i.value = value; });
  };
  U.setVal = function (el, key, text) { var v = $('[data-val="' + key + '"]', el); if (v) v.textContent = text; };

  /* file chooser styled as a button. o: text, cls, accept, multiple, attr (extra attributes on the input), label */
  U.fileBtn = function (o) {
    return '<label class="btn file-btn ' + (o.cls || "") + '"><span>' + (o.text) + '</span><input type="file" accept="' + (o.accept || (window.WalkupCore && window.WalkupCore.AUDIO_ACCEPT) || "audio/*") + '"' + (o.multiple ? " multiple" : "") + " " + (o.attr || "") + ' aria-label="' + esc(o.label || o.textPlain || "Choose a file") + '"></label>';
  };

  /* ---------- waveform painter ---------- */
  function cssVar(el, name, def) { try { return getComputedStyle(el).getPropertyValue(name).trim() || def; } catch (e) { return def; } }
  /* o: peaks (Float32Array), v0, v1 (the time the canvas shows), s0, s1 (the kept part), hi (colour of the kept part), lo */
  U.drawWave = function (cv, o) {
    var w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return false;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cssVar(cv, "--wave-bg", "#150f22"); g.fillRect(0, 0, w, h);
    var p = o.peaks, n = p ? p.length : 0, mx = 0.05, i;
    for (i = 0; i < n; i++) if (p[i] > mx) mx = p[i];
    var hi = o.hi || cssVar(cv, "--accent", "#b46bff"), lo = o.lo || cssVar(cv, "--wave-dim", "#4b3a73"), step = n ? w / n : w, bw = Math.max(1, step - 1);
    g.fillStyle = cssVar(cv, "--line2", "#4a3a7e"); g.fillRect(0, Math.round(h / 2), w, 1);
    for (i = 0; i < n; i++) {
      var t = o.v0 + (i + 0.5) / n * (o.v1 - o.v0), bh = Math.max(2, p[i] / mx * h * 0.92);
      g.fillStyle = t >= o.s0 && t <= o.s1 ? hi : lo;
      g.fillRect(i * step, (h - bh) / 2, bw, bh);
    }
    return true;
  };

  /* ---------- mounting ---------- */
  U.mount = function (el) {
    root = el;
    el.classList.add("wu");
    el.innerHTML = '<div class="wu-app" id="wuApp"><header class="top" id="wuTop"></header><div id="wuBanners"></div><main id="wuView" tabindex="-1"></main><nav class="nav" id="wuNav" aria-label="Sections"></nav></div>' +
      '<div class="wu-sheets" id="wuSheets"></div><div class="wu-toasts" id="wuToasts" aria-live="polite"></div><div class="sr" id="wuLive" role="status" aria-live="polite"></div>';
    return el;
  };
  U.root = function () { return root; };
  U.downloadBlob = function (blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 8000);
  };
})();
