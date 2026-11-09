/* Nate's apps: shared health check and problem report. Every app loads this one file next to install.js:
     <script src="https://natesteele888.github.io/apps/health.js" defer></script>
   What it does, on every open, with no account and no server:
   1. Checks that this phone can save (writes and reads back a test value) and asks the browser to keep the
      app's data safe. If saving fails it says so in a small bar, so nobody is left wondering.
   2. Keeps a short log of problems on the phone: crashes, failed saves, failed syncs (an app can add its own
      with nateHealth.note(kind, message)). No names, no content: a message and a file:line at most, 30 entries.
   3. nateHealth.report() opens a small "Something wrong?" sheet: what happened (optional), then Send puts a
      plain-text report (app, phone, installed or not, saving, storage, recent problems) in the share sheet so it
      can be texted to whoever looks after the apps. Nothing leaves the phone unless Send is tapped. */
(function () {
  if (window.nateHealth) return;
  var DIR = location.pathname.replace(/[^/]*\.[a-z0-9]+$/i, "").replace(/([^/])$/, "$1/");
  var KEY = "nate.health:" + DIR, TEST = "nate.health.test", MAX = 30;
  var standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || !!navigator.standalone;
  var ua = navigator.userAgent;
  var ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var status = { save: null, persisted: null, usage: null, quota: null, installed: standalone, checkedAt: 0 };
  var log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(log)) log = []; } catch (e) { log = []; }

  function appName() {
    var m = document.querySelector('meta[name="application-name"],meta[name="apple-mobile-web-app-title"]');
    return (m && m.content) || (document.title || "this app").split(/\s[|·:–—-]\s/)[0].trim();
  }
  function short(file) { return String(file || "").split("?")[0].split("/").slice(-1)[0]; }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  /* Adds a problem to the log. kind: "error", "save", "sync" or your own word. Repeats within a minute are folded. */
  function note(kind, msg) {
    var m = clip(msg, 200), last = log[log.length - 1];
    if (last && last.k === kind && last.m === m && Date.now() - last.t < 60000) { last.n = (last.n || 1) + 1; }
    else { log.push({ t: Date.now(), k: String(kind || "note"), m: m }); if (log.length > MAX) log = log.slice(-MAX); }
    try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {}
  }
  window.addEventListener("error", function (e) {
    if (!e || e.target !== window && e.target !== undefined && !e.message) return; // a picture or script that failed to load is not a crash
    note("error", (e.message || "Script error") + (e.filename ? " @ " + short(e.filename) + ":" + (e.lineno || 0) : ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason; note("error", "Promise: " + clip(r && (r.message || r.code || r) || "unknown", 160));
  });

  /* 1. Can this phone save? */
  function check() {
    status.checkedAt = Date.now();
    try { localStorage.setItem(TEST, "1"); status.save = localStorage.getItem(TEST) === "1"; localStorage.removeItem(TEST); }
    catch (e) { status.save = false; }
    if (status.save === false) note("save", "This phone could not save (storage full or blocked)");
    if (navigator.storage) {
      if (navigator.storage.estimate) navigator.storage.estimate().then(function (x) { status.usage = x.usage || 0; status.quota = x.quota || 0; }).catch(function () {});
      if (navigator.storage.persisted) navigator.storage.persisted().then(function (p) {
        status.persisted = p;
        // Ask the browser to keep this app's data when the phone runs low. Chrome says yes quietly for an installed app; never a pop-up.
        if (!p && navigator.storage.persist) return navigator.storage.persist().then(function (g) { status.persisted = g; });
      }).catch(function () {});
    }
    return status.save;
  }

  /* ---------- the little bar and the report sheet (own shadow root, so no app's CSS leaks in) ---------- */
  var host = null;
  var CSS = ':host{all:initial}' +
    '.bar,.sheet{pointer-events:auto;box-sizing:border-box;font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff;color:#14201b;border:1px solid #d6e0db;box-shadow:0 10px 30px rgba(0,0,0,.18)}' +
    '@media (prefers-color-scheme:dark){.bar,.sheet{background:#17211d;color:#eef3f0;border-color:#2c3b35}}' +
    '.bar{margin:0 auto calc(12px + env(safe-area-inset-bottom,0px));width:min(520px,calc(100% - 24px));display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:16px}' +
    '.bar .t{flex:1;min-width:0}.t b{display:block;font-size:15px}.t small{opacity:.75;font-size:13px}' +
    'button{font:inherit;font-weight:700;border-radius:999px;cursor:pointer;padding:9px 16px;border:0;min-height:40px}' +
    '.go{background:#1d7a4d;color:#fff}.x{background:transparent;color:inherit;opacity:.7;padding:9px 8px}' +
    'button:focus-visible,textarea:focus-visible{outline:3px solid #3ddc97;outline-offset:2px}' +
    '.sheet{margin:0 auto;width:min(560px,100%);border-radius:20px 20px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}' +
    '.sheet h2{margin:0 0 4px;font-size:18px}.sheet p{margin:0 0 10px;font-size:14px;opacity:.8}' +
    'textarea{display:block;width:100%;box-sizing:border-box;min-height:84px;padding:10px;border-radius:12px;border:1px solid #d6e0db;font:inherit;background:transparent;color:inherit;resize:vertical}' +
    '@media (prefers-color-scheme:dark){textarea{border-color:#2c3b35}}' +
    'pre{margin:10px 0 0;max-height:34vh;overflow:auto;padding:10px;border-radius:12px;background:rgba(127,127,127,.12);font:12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap}' +
    '.row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.msg{font-size:13px;opacity:.8;margin:8px 0 0}';
  function mount(inner, role) {
    unmount();
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147482000;pointer-events:none";
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML = "<style>" + CSS + "</style>" + inner;
    document.body.appendChild(host);
    return root;
  }
  function unmount() { if (host) { host.remove(); host = null; } }
  function saveBar() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", saveBar); return; }
    var root = mount('<div class="bar" role="alert"><div class="t"><b>This phone can\'t save right now</b><small>' + appName() + ' may lose what you do. Free up some space (photos, downloads), then open the app again.</small></div><button class="go" type="button">Report</button><button class="x" type="button" aria-label="Dismiss">OK</button></div>');
    root.querySelector(".go").onclick = function () { report(); };
    root.querySelector(".x").onclick = unmount;
  }

  /* ---------- the report ---------- */
  function fmtBytes(n) { if (!n && n !== 0) return "?"; return n > 9e8 ? (n / 1e9).toFixed(1) + " GB" : n > 9e5 ? Math.round(n / 1e6) + " MB" : Math.round(n / 1e3) + " KB"; }
  function device() {
    var phone = ios ? (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad" : "iPhone") : /Android/i.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "other";
    var browser = /CriOS/.test(ua) ? "Chrome" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /EdgA?\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
    var inApp = /; wv\)|FBAN|FBAV|Instagram|Snapchat|Line\//.test(ua) ? " (inside another app)" : "";
    return phone + " · " + browser + inApp;
  }
  function when(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  /* The plain-text report. `what` is the person's own words (optional). */
  function text(what) {
    var L = [];
    L.push(appName() + " · problem report · " + when(Date.now()));
    L.push("Page: " + location.pathname + (location.hash || ""));
    L.push("Phone: " + device());
    L.push("Installed on home screen: " + (status.installed ? "yes" : "no" + (ios ? " (Safari can erase saved data after 7 days unused; add it to the home screen)" : "")));
    L.push("Saving: " + (status.save === false ? "FAILED" : status.save ? "OK" : "not checked"));
    if (status.quota) L.push("Storage: " + fmtBytes(status.usage) + " used of " + fmtBytes(status.quota) + (status.persisted ? ", kept safe" : ""));
    L.push("Signal now: " + (navigator.onLine ? "online" : "offline"));
    L.push("");
    L.push("Recent problems" + (log.length ? ":" : ": none logged"));
    log.slice().reverse().forEach(function (e) { L.push("- " + when(e.t) + " " + e.k + ": " + e.m + (e.n > 1 ? " (x" + e.n + ")" : "")); });
    if (what && String(what).trim()) { L.push(""); L.push("What happened: " + clip(what, 600)); }
    return L.join("\n");
  }
  /* The "Something wrong?" sheet. */
  function report() {
    if (!document.body) return;
    var root = mount('<div class="sheet" role="dialog" aria-label="Report a problem"><h2>Something wrong?</h2><p>Say what happened, if you like. Send puts a short report in your share sheet, so you can text it to whoever looks after ' + appName() + '. It has no names or photos in it.</p>' +
      '<textarea id="w" placeholder="What were you doing, and what went wrong?"></textarea><pre id="p"></pre><div class="msg" id="m"></div>' +
      '<div class="row"><button class="x" type="button" id="c">Cancel</button><button class="go" type="button" id="s">Send</button></div></div>');
    var w = root.querySelector("#w"), pre = root.querySelector("#p"), msg = root.querySelector("#m");
    pre.textContent = text("");
    root.querySelector("#c").onclick = unmount;
    root.querySelector("#s").onclick = function () {
      var body = text(w.value);
      var done = function (how) { msg.textContent = how; setTimeout(unmount, how.indexOf("Copied") === 0 ? 4000 : 800); };
      if (navigator.share) {
        navigator.share({ title: appName() + " problem report", text: body }).then(function () { done("Sent."); }).catch(function (e) { if (!e || e.name !== "AbortError") copy(body, done); });
      } else copy(body, done);
    };
    setTimeout(function () { try { w.focus(); } catch (e) {} }, 50);
  }
  function copy(body, done) {
    var fallback = function () { try { window.prompt("Copy this report and paste it into a message:", body); done("Copied. Paste it into a message."); } catch (e) { done("Couldn't copy."); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(function () { done("Copied. Paste it into a message."); }).catch(fallback);
    else fallback();
  }

  check();
  if (status.save === false) saveBar();
  window.nateHealth = { note: note, report: report, text: text, check: check, status: status, log: function () { return log.slice(); } };
})();
