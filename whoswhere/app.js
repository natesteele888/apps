/* Who's Where, part 4: start-up, tabs, week and month stepping, swipe, printing hooks. */
(function () {
  "use strict";
  const WW = window.WW;
  const { C, S, ACT, $, $$ } = WW;
  let renderedDay = "";

  /* Keep keyboard focus on "the same" control after the screen is drawn again. */
  function focusSel() {
    const a = document.activeElement;
    if (!a || a === document.body || !a.closest || !a.closest("#view, #top, #nav")) return null;
    let s = a.tagName.toLowerCase();
    ["data-act", "data-id", "data-tab", "data-n", "data-date", "data-fix", "data-role"].forEach(k => { if (a.hasAttribute(k)) s += "[" + k + '="' + String(a.getAttribute(k)).replace(/"/g, '\\"') + '"]'; });
    return s;
  }
  WW.render = function (opts) {
    const y = window.scrollY, fs = focusSel();
    WW.derive(); renderedDay = C.todayStr();
    WW.renderTop(); WW.renderView(); WW.refreshSheets();
    window.scrollTo(0, opts && opts.top ? 0 : y);
    if (fs && !WW.sheetStack.length) { try { const el = $(fs); if (el) el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  };

  /* ---------- clicks ---------- */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("change", e => {
    if (e.target.matches && e.target.matches("[data-restore]")) { const f = e.target.files && e.target.files[0]; e.target.value = ""; WW.onRestoreFile(f); }
  });

  ACT["tab"] = el => {
    S.view = el.dataset.tab;
    if (S.view === "month") S.monthCursor = (S.cursor || C.todayStr()).slice(0, 7) + "-01";
    WW.render({ top: true });
  };
  function step(n) {
    if (S.view === "month") { const c = S.monthCursor || (S.cursor || C.todayStr()).slice(0, 7) + "-01"; S.monthCursor = C.addMonths(c, n); }
    else if (S.view === "week") S.cursor = C.addDays(WW.weekRange()[0], 7 * n);
    else return;
    WW.render({ top: true });
  }
  ACT["step"] = el => step(+el.dataset.n);
  ACT["go-today"] = () => { S.cursor = null; S.monthCursor = null; WW.render({ top: true }); };
  ACT["filter"] = el => { S.filter = el.dataset.id || null; WW.render(); };
  ACT["horizon"] = el => { S.horizon = +el.dataset.n; WW.render(); };

  /* ---------- swipe left or right to change week or month ---------- */
  let sx = 0, sy = 0, st = 0, tracking = false;
  const view = $("#view");
  view.addEventListener("touchstart", e => {
    tracking = false;
    if (e.touches.length !== 1 || WW.sheetStack.length || (S.view !== "week" && S.view !== "month")) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
  }, { passive: true });
  view.addEventListener("touchend", e => {
    if (!tracking) return; tracking = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st < 800 && Math.abs(dx) > 70 && Math.abs(dy) < 50 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---------- printing: also when the browser's own Print is used ---------- */
  window.addEventListener("beforeprint", () => {
    if (document.body.classList.contains("print-week")) return;
    $("#printbox").innerHTML = WW.printHTML();
    document.body.classList.add("print-week");
  });
  window.addEventListener("afterprint", () => { document.body.classList.remove("print-week"); $("#printbox").innerHTML = ""; });

  /* A phone app can stay open for days: draw again when the date has changed. */
  function dayCheck() { if (renderedDay && renderedDay !== C.todayStr()) WW.render(); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) dayCheck(); });
  window.addEventListener("pageshow", dayCheck);

  /* ---------- go ---------- */
  WW.load();
  WW.render();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }
  if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  window.WhosWhereApp = WW;
})();
