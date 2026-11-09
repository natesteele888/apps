/* Nate's apps: shared "Add to home screen" pop-up.
   Every app loads this one file:
     <script src="https://natesteele888.github.io/apps/install.js" defer></script>
   It shows a small bar on the first open in a browser tab (how to add it, with an Install
   button when Chrome offers one), and hides itself once the app is installed or opened from
   the home screen. "Not now" hides it for a week. Opening an app with ?install or #install
   shows it right away (the install page in the Toolbox uses that). An app's own settings can
   call window.nateInstall.show(). No data is stored except the "not now" date and an
   "installed here" mark. */
(function () {
  if (window.__nateInstall) return; window.__nateInstall = true;
  var standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone;
  /* Remember real installs so the install page (natesteele888.github.io/apps/) can show what's actually on this phone.
     Key = this app's folder, e.g. "nate.installed:/apps/situations/". Only a timestamp is stored. */
  var DIR = location.pathname.replace(/[^/]*\.[a-z0-9]+$/i, "").replace(/([^/])$/, "$1/");
  function markInstalled() { try { localStorage.setItem("nate.installed:" + DIR, String(Date.now())); } catch (e) {} }
  if (standalone) { markInstalled(); return; }
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
    deferred = null; markInstalled();
    show([appName() + " is on your home screen", "Long-press its icon and drop it on another to make a folder."], false);
    setTimeout(hide, 6000);
  });
  /* First open in a browser tab: say how to add it right away, without waiting for Chrome's own offer (which can
     take a moment or a second visit) and on iPhone and iPad, which never offer. The bar gains an Install button the
     moment Chrome does offer. "Not now" hides it for a week; an app already on this phone's home screen is left alone. */
  var ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(navigator.userAgent);
  function installedHere() { try { return !!localStorage.getItem("nate.installed:" + DIR); } catch (e) { return false; } }
  function howTo(force) {
    if (!document.body || (!force && (host || installedHere()))) return;
    if (host) hide();
    if (deferred) { show(["Add " + appName() + " to your home screen", "Opens full screen, like a real app."], true); return; }
    if (ios) {
      var chromeIOS = /CriOS/.test(navigator.userAgent);
      show(["Add " + appName() + " to your home screen", chromeIOS ? "Tap the Share button (top right), then Add to Home Screen." : "Tap the Share button (square with an arrow), then Add to Home Screen."], false);
      return;
    }
    show(["Add " + appName() + " to your home screen", android
      ? (asked ? "Already installed? It's in your app drawer. If not, open this page in your browser and tap Install." : "Tap ⋮ in Chrome, then Add to Home screen (or Install app).")
      : "In your browser's menu, choose Install app or Add to Home screen."], false);
    /* No Install offer on Android usually means this page is open in an app's mini-browser (Android hides Install
       there): offer a one-tap jump into the real browser. */
    if (android && host) {
      var root = host.shadowRoot || host, x = root.querySelector(".x"), b = document.createElement("button");
      b.className = "go"; b.type = "button"; b.textContent = "Open in browser";
      b.onclick = function () {
        var pkg = /SamsungBrowser/.test(navigator.userAgent) ? "com.sec.android.app.sbrowser" : "com.android.chrome";
        location.href = "intent://" + location.host + location.pathname + location.search + "#Intent;scheme=https;package=" + pkg + ";S.browser_fallback_url=" + encodeURIComponent(location.href) + ";end";
      };
      x.parentNode.insertBefore(b, x);
    }
  }
  if (asked || !later()) setTimeout(function () { howTo(false); }, asked ? 1500 : 3000);
  /* An app can offer it again from its own settings: window.nateInstall.show() */
  window.nateInstall = { show: function () { howTo(true); } };
})();
