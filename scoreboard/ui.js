/* Scoreboard UI kit: storage, toasts, sheets (with the Android Back sync) and small form pieces.
   Everything is saved in this phone's localStorage (keys start with "scoreboard."). Nothing is ever sent anywhere.
   Shared with the other UI files through window.SB. */
(function () {
  "use strict";
  const C = window.SBCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const SB = window.SB = { C, $, $$, esc, reduced, ACT: {}, boardDepth: 0, onBoardBack: null, memMode: false };

  /* today's date as YYYY-MM-DD; tests set window.__today */
  SB.today = () => (typeof window.__today === "string" && C.isYMD(window.__today)) ? window.__today : C.ymd(new Date());

  /* ================= storage ================= */
  const mem = {};
  SB.store = {
    get(k) { if (SB.memMode) return k in mem ? mem[k] : null; try { return localStorage.getItem("scoreboard." + k); } catch (e) { return null; } },
    set(k, v) { if (SB.memMode) { mem[k] = v; return true; } try { localStorage.setItem("scoreboard." + k, v); return true; } catch (e) { return false; } },
    del(k) { if (SB.memMode) { delete mem[k]; return; } try { localStorage.removeItem("scoreboard." + k); } catch (e) { /* ignore */ } },
    keys() {
      if (SB.memMode) return Object.keys(mem);
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("scoreboard.") === 0) out.push(k.slice(11)); } } catch (e) { /* ignore */ }
      return out;
    }
  };
  SB.probeStorage = () => { try { localStorage.setItem("scoreboard.probe", "1"); localStorage.removeItem("scoreboard.probe"); return true; } catch (e) { return false; } };
  SB.readJSON = k => { const raw = SB.store.get(k); if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return undefined; } };
  let lastSaveErr = 0;
  /* returns false when the browser would not keep it; says so at most once every few seconds */
  SB.save = (k, obj) => {
    const ok = SB.store.set(k, JSON.stringify(obj));
    if (!ok && Date.now() - lastSaveErr > 5000) { lastSaveErr = Date.now(); SB.toast("Couldn't save on this phone. Storage may be full or blocked. Back up from Settings to keep a copy.", "error", 7000); }
    return ok;
  };

  /* ================= toast ================= */
  SB.toast = function (msg, kind, ms) {
    const host = $("#toasts"); if (!host) return null;
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", kind === "error" ? "alert" : "status");
    t.innerHTML = '<span class="tx"></span>';
    $(".tx", t).textContent = msg;
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("in")));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), reduced() ? 0 : 260); }, ms || (kind === "error" ? 5500 : 2600));
    return t;
  };

  /* ================= sheets ================= */
  const sheetStack = [];
  let sheetSeq = 0;
  SB.sheetCount = () => sheetStack.length;
  function syncInert() {
    const top = sheetStack[sheetStack.length - 1];
    $("#app").inert = sheetStack.length > 0;
    sheetStack.forEach(s => { s.el.inert = s !== top; });
    document.body.classList.toggle("lock", sheetStack.length > 0);
  }
  SB.openSheet = function (o) {
    const opener = document.activeElement;
    const id = "sh" + (++sheetSeq);
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="backdrop" data-close></div><section class="sheet ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + 't" tabindex="-1">' +
      '<div class="grab" aria-hidden="true"></div><header class="sh-head"><h2 id="' + id + 't">' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Close">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>' +
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
        if (!sheetStack.length) {
          const back = (opener && document.contains(opener) && opener.focus) ? opener : (SB.focusAfterSheets ? SB.focusAfterSheets() : null);
          if (back) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        }
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
  };
  SB.closeAllSheets = () => sheetStack.slice().forEach(s => s.close());
  SB.topSheet = () => sheetStack[sheetStack.length - 1] || null;

  /* Android Back (and the browser's Back) closes the top sheet, or leaves the scoreboard, instead of leaving the app.
     Each open sheet owns one history entry, and so does the scoreboard screen itself (SB.boardDepth = 1).
     Entries are added and given back a moment after things change, so a sheet that replaces another one
     (close, then open in the same tap) costs nothing, and the entry we land on always says how many levels should be open. */
  let histDepth = 0, traveling = false, syncTimer = 0;
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  SB.syncHistory = syncHistory;
  function reconcileHistory() {
    if (traveling) return;
    const want = sheetStack.length + SB.boardDepth;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ sbSheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        const n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
  }
  try { if (history.state && history.state.sbSheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", e => {
    const at = (e.state && e.state.sbSheets) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else {
      while (sheetStack.length > Math.max(0, at - SB.boardDepth)) sheetStack[sheetStack.length - 1].close();
      if (at < SB.boardDepth && SB.onBoardBack) SB.onBoardBack();
    }
    reconcileHistory();
  });

  SB.confirmSheet = function (o) {
    return SB.openSheet({
      title: o.title, cls: "confirm",
      html: '<p class="msg">' + esc(o.message) + "</p>" + (o.more ? o.more.map(m => '<p class="msg">' + esc(m) + "</p>").join("") : "") + (o.extra || ""),
      footer: '<button type="button" class="btn ghost" data-close>' + esc(o.cancelText || "Cancel") + '</button><button type="button" class="btn ' + (o.danger ? "danger solid" : "") + '" data-ok>' + esc(o.confirmText || "OK") + "</button>",
      onOpen(api) { $("[data-ok]", api.el).addEventListener("click", () => { api.close(); o.onConfirm(); }); },
      onClose: o.onClose
    });
  };

  /* ================= small form pieces ================= */
  /* one-choice pills: options are [[value, label], ...] */
  SB.pills = (name, opts, val, label) => '<div class="pills" role="group" data-pills="' + esc(name) + '"' + (label ? ' aria-label="' + esc(label) + '"' : "") + ">" +
    opts.map(o => '<button type="button" class="pill" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(val)) + '">' + esc(o[1]) + "</button>").join("") + "</div>";
  SB.pillVal = (root, name) => { const b = $('[data-pills="' + name + '"] [aria-pressed="true"]', root); return b ? b.dataset.v : null; };
  SB.numField = (id, label, val, min, max, hint) => '<label class="field"><span class="label">' + esc(label) + '</span><input type="number" inputmode="numeric" id="' + id + '" min="' + min + '" max="' + max + '" value="' + esc(val) + '">' +
    (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</label>";
  SB.toggle = (name, label, on, hint) => '<div class="toggle-row"><div class="tr-t"><span class="tr-l" id="tg-' + name + '">' + esc(label) + "</span>" + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") +
    '</div><button type="button" class="switch" role="switch" data-switch="' + name + '" aria-checked="' + (!!on) + '" aria-labelledby="tg-' + name + '"><i></i></button></div>';
  SB.switchVal = (root, name) => { const b = $('[data-switch="' + name + '"]', root); return !!b && b.getAttribute("aria-checked") === "true"; };
  SB.swatches = (name, val) => '<div class="swatches" role="group" data-pills="' + name + '" aria-label="Color">' +
    C.COLORS.map(c => '<button type="button" class="sw" data-v="' + c.hex + '" style="--c:' + c.hex + '" aria-pressed="' + (c.hex === val) + '" aria-label="' + c.name + '"><span aria-hidden="true">' + c.name + "</span></button>").join("") + "</div>";

  /* one team: a color button (opens the swatches) next to the name box */
  SB.teamRow = (i, t, label) => '<div class="team-edit" data-team="' + i + '"><div class="te-row"><button type="button" class="te-color" data-act="toggle-colors" style="--c:' + esc(t.c) + '" aria-expanded="false" aria-label="' + esc(label + " color: " + C.colorName(t.c) + ". Tap to change.") + '"><i></i></button>' +
    '<label class="te-name"><span class="label">' + esc(label) + '</span><input type="text" class="t-in" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(t.n) + '" aria-label="' + esc(label) + ' name"></label></div>' +
    '<div class="sw-wrap" hidden>' + SB.swatches("color" + i, t.c) + "</div></div>";
  SB.ACT["toggle-colors"] = el => {
    const w = $(".sw-wrap", el.closest(".team-edit")); const open = w.hidden;
    w.hidden = !open; el.setAttribute("aria-expanded", String(open));
  };

  document.addEventListener("click", e => {
    const sw = e.target.closest(".swatches button");
    if (sw) {
      const box = sw.closest(".team-edit");
      if (box) { const b = $(".te-color", box); b.style.setProperty("--c", sw.dataset.v); b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/color: [A-Za-z]+\./, "color: " + C.colorName(sw.dataset.v) + ".")); $(".sw-wrap", box).hidden = true; b.setAttribute("aria-expanded", "false"); }
    }
    const p = e.target.closest("[data-pills] > button");
    if (p) { $$("button", p.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === p))); if (p.parentNode.dataset.pills === "preset") { /* handled by the form */ } return; }
    const s = e.target.closest("[data-switch]");
    if (s) { s.setAttribute("aria-checked", String(s.getAttribute("aria-checked") !== "true")); s.dispatchEvent(new CustomEvent("switch", { bubbles: true })); }
  });

  SB.downloadBlob = function (blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
  };
})();
