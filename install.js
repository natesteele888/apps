/* Nate's apps: shared "Add to home screen" pop-up.
   Every app loads this one file:
     <script src="https://natesteele888.github.io/apps/install.js" defer></script>
   It shows a small bar when Chrome says the app can be installed, and hides itself
   once the app is installed or opened from the home screen. "Not now" hides it for
   a week. Opening an app with ?install or #install shows it right away (the install
   page in the Toolbox uses that). No data is stored except that one "not now" date. */
(function () {
  if (window.__nateInstall) return; window.__nateInstall = true;
  var standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone;
  if (standalone) return;
  var KEY = "nate.install.later:" + location.pathname.split("/").slice(0, 3).join("/");
  var asked = /(^|[?&#])install\b/.test(location.search + location.hash);
  function later() { try { return Date.now() - (+localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch (e) { return false; } }
  var deferred = null, host = null;

  function appName() {
    var m = document.querySelector('meta[name="application-name"],meta[name="apple-mobile-web-app-title"]');
    return (m && m.content) || (document.title || "this app").split(/\s[|·–—-]\s/)[0].trim();
  }
  function iconUrl() {
    var l = document.querySelector('link[rel="apple-touch-icon"],link[rel="icon"][sizes="192x192"],link[rel="icon"]');
    return l ? l.href : "";
  }
  function show(text, withButton) {
    if (host) host.remove();
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483000;pointer-events:none";
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var ic = iconUrl();
    root.innerHTML = '<style>' +
      ':host{all:initial}' +
      '.bar{pointer-events:auto;margin:0 auto calc(12px + env(safe-area-inset-bottom,0px));width:min(520px,calc(100% - 24px));box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:16px;font:15px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#ffffff;color:#14201b;border:1px solid #d6e0db;box-shadow:0 10px 30px rgba(0,0,0,.18);animation:up .25s ease-out}' +
      '@media (prefers-color-scheme:dark){.bar{background:#17211d;color:#eef3f0;border-color:#2c3b35}}' +
      '@media (prefers-reduced-motion:reduce){.bar{animation:none}}' +
      '@keyframes up{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}' +
      'img{width:40px;height:40px;border-radius:10px;flex:none}' +
      '.t{flex:1;min-width:0}.t b{display:block;font-size:15px}.t small{opacity:.7;font-size:13px}' +
      'button{font:inherit;font-weight:700;border-radius:999px;cursor:pointer;padding:9px 16px;border:0}' +
      '.go{background:#1d7a4d;color:#fff}.x{background:transparent;color:inherit;opacity:.65;padding:9px 8px}' +
      'button:focus-visible{outline:3px solid #3ddc97;outline-offset:2px}' +
      '</style><div class="bar" role="dialog" aria-label="Install app">' +
      (ic ? '<img alt="" src="' + ic.replace(/"/g, "&quot;") + '">' : "") +
      '<div class="t"><b></b><small></small></div>' +
      (withButton ? '<button class="go" type="button">Install</button>' : "") +
      '<button class="x" type="button" aria-label="Not now">' + (withButton ? "Not now" : "OK") + "</button></div>";
    root.querySelector("b").textContent = text[0];
    root.querySelector("small").textContent = text[1];
    var go = root.querySelector(".go");
    if (go) go.onclick = function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function (c) { deferred = null; if (c && c.outcome === "accepted") hide(); });
    };
    root.querySelector(".x").onclick = function () {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      hide();
    };
    document.body.appendChild(host);
  }
  function hide() { if (host) { host.remove(); host = null; } }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    if (asked || !later()) {
      var go = function () { show(["Add " + appName() + " to your home screen", "Opens full screen, like a real app."], true); };
      document.body ? go() : document.addEventListener("DOMContentLoaded", go);
    }
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    show([appName() + " is on your home screen", "Long-press its icon and drop it on another to make a folder."], false);
    setTimeout(hide, 6000);
  });
  /* Opened from the install page but Chrome hasn't offered to install yet: tell how. */
  if (asked) setTimeout(function () {
    if (!deferred && !host && document.body) show(["Install " + appName(), "Tap ⋮ in Chrome, then Install app (or Add to home screen)."], false);
  }, 4000);
})();
