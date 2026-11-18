/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE.
   Snack Shack Screen setup page: copy the Drive feed script, check the web app URL, and hand back the TV link. */
(function () {
  "use strict";
  var C = window.SnackCore, KEY = "snackshack.feed";
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }
  function copy(text, done) {
    var ok = function () { toast(done); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(ok, function () { fallback(); });
    fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { toast("Couldn't copy. Press and hold to copy instead."); }
      document.body.removeChild(ta);
    }
  }
  function screenLink(id) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "screen.html?f=" + id; }
  function getJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var tm = setTimeout(function () { reject(new Error("timed out")); }, ms);
      fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) { clearTimeout(tm); resolve(j); }, function (e) { clearTimeout(tm); reject(e); });
    });
  }

  $("copyScript").addEventListener("click", function () {
    fetch("feed.gs", { cache: "no-cache" }).then(function (r) { return r.text(); }).then(function (t) { copy(t, "Script copied. Paste it into the new Apps Script project."); }, function () { toast("Couldn't load the script. Check the internet and try again."); });
  });

  function showTv(id) {
    var link = screenLink(id);
    $("tvLink").value = link;
    $("openTv").href = link;
    $("preview").href = link;
    $("tvBox").hidden = false;
  }
  function check() {
    var raw = $("feed").value, url = C.feedUrl(raw), msg = $("feedMsg");
    msg.className = "msg";
    if (!url) { msg.className = "msg bad"; msg.textContent = "That doesn't look like a web app URL. It starts with https://script.google.com/macros/s/ and ends in /exec."; return; }
    msg.textContent = "Checking the feed…";
    getJson(url + "?a=list&t=" + Date.now(), 45000).then(function (j) {
      if (!j || j.ok === false) throw new Error((j && j.error) || "the feed said no");
      var n = 0, too = 0;
      (j.items || []).forEach(function (it) { if (it.tooBig) too++; else n += it.type === "slides" ? (it.pages || []).length : 1; });
      lsSet(KEY, C.feedId(url));
      msg.className = "msg ok";
      msg.textContent = "Connected to \"" + (j.folder || "Snack Shack Screen") + "\": " + n + (n === 1 ? " slide" : " slides") + " ready" + (too ? ", " + too + " too big to play (keep files under 25 MB)" : "") + (j.schedule ? ", with the game schedule." : ".");
      showTv(C.feedId(url));
    }).catch(function (e) {
      msg.className = "msg bad";
      msg.textContent = "Couldn't reach the feed (" + String(e && e.message || e) + "). In the deployment, Who has access has to be Anyone. Then try again.";
    });
  }
  $("check").addEventListener("click", check);
  $("feed").addEventListener("keydown", function (e) { if (e.key === "Enter") check(); });
  $("copyTv").addEventListener("click", function () { copy($("tvLink").value, "Screen link copied."); });

  var saved = lsGet(KEY);
  if (saved && C.feedUrl(saved)) { $("feed").value = C.feedUrl(saved); showTv(saved); }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
