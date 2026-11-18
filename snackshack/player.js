/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE.
   Snack Shack Screen: the TV loop. Open screen.html?f=<feed id> once on the screen and it runs on its own:
   - asks the Drive feed what's in the folder every few minutes and saves each picture, video and slide on the screen,
   - plays only what's saved, so a slow or dropped connection never shows a blank screen,
   - picks what plays from the folder names (see core.js) for this day and time, with sponsors and the menu mixed in,
   - keeps going on what it has when the internet is down, and picks up new files when it's back.
   Remote: right/left skip, OK shows what it's playing and when it last heard from Drive. */
(function () {
  "use strict";
  var C = window.SnackCore;
  var Q = parseQuery(location.search);
  var LS = { feed: "snackshack.feed", list: "snackshack.list", turns: "snackshack.turns" };
  var MEDIA = "snackshack-media";
  var REFRESH_MS = Q.refresh ? Math.max(5, +Q.refresh) * 1000 : 5 * 60 * 1000;
  var SECS = Q.sec ? Math.max(2, Math.min(600, +Q.sec || 10)) : C.DEFAULTS.seconds;
  var started = Date.now();

  function parseQuery(s) {
    var o = {};
    String(s || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf("="), k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? "1" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
      o[k] = v;
    });
    return o;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function now() { return window.__now ? new Date(window.__now) : new Date(); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- where the feed is ----------
  var feedArg = Q.f || Q.feed || "";
  if (feedArg && C.feedUrl(feedArg)) lsSet(LS.feed, C.feedId(feedArg));
  if (Q.reset) { try { localStorage.removeItem(LS.feed); localStorage.removeItem(LS.list); } catch (e) {} }
  var FEED = C.feedUrl(lsGet(LS.feed) || "");

  var S = {
    feed: null,           // the last list the feed sent (kept on the screen)
    ready: {},            // media key -> object URL, for everything saved and playable
    online: true, lastHeard: 0, lastTry: 0, error: "",
    queue: [], current: null, timer: 0, turns: { s: 0, m: 0 }, shown: 0, fetching: false
  };
  try { S.feed = JSON.parse(lsGet(LS.list) || "null"); } catch (e) { S.feed = null; }
  try { var t = JSON.parse(lsGet(LS.turns) || "null"); if (t) S.turns = t; } catch (e) {}
  if (S.feed && S.feed.heard) S.lastHeard = S.feed.heard;

  // ---------- the media store (Cache Storage when the browser has it, memory otherwise) ----------
  var hasCaches = typeof caches !== "undefined" && !!caches.open && location.protocol !== "file:";
  function mediaKey(it) { return it.id + (it.page ? "~" + it.page : "") + "@" + (it.modified || ""); }
  function cacheUrl(key) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "__media/" + encodeURIComponent(key); }
  function loadSaved() {
    if (!hasCaches) return Promise.resolve();
    return caches.open(MEDIA).then(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (r) {
          var key = decodeURIComponent(r.url.split("/__media/")[1] || "");
          return c.match(r).then(function (res) { return res && res.blob(); }).then(function (b) { if (b && b.size) S.ready[key] = URL.createObjectURL(b); });
        }));
      });
    }).catch(function () {});
  }
  function saveMedia(key, blob) {
    S.ready[key] = URL.createObjectURL(blob);
    if (!hasCaches) return Promise.resolve();
    return caches.open(MEDIA).then(function (c) { return c.put(cacheUrl(key), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } })); }).catch(function () {});
  }
  function dropUnused(keep) {
    Object.keys(S.ready).forEach(function (k) {
      if (keep[k]) return;
      if (S.current && S.current.key === k) return;
      try { URL.revokeObjectURL(S.ready[k]); } catch (e) {}
      delete S.ready[k];
      if (hasCaches) caches.open(MEDIA).then(function (c) { return c.delete(cacheUrl(k)); }).catch(function () {});
    });
  }

  // ---------- talking to the feed ----------
  function getJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false, tm = setTimeout(function () { if (!done) { done = true; reject(new Error("timed out")); } }, ms || 30000);
      fetch(url, { cache: "no-store", redirect: "follow" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) { if (!done) { done = true; clearTimeout(tm); resolve(j); } }, function (e) { if (!done) { done = true; clearTimeout(tm); reject(e); } });
    });
  }
  function b64Blob(b64, mime) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: mime || "application/octet-stream" });
  }
  /* Slides decks turn into one item per slide. */
  function expand(items) {
    var out = [];
    (items || []).forEach(function (it) {
      if (it.type === "slides") (it.pages || []).forEach(function (p, i) { out.push({ id: it.id, page: p, name: it.name + " " + (i + 1), type: "image", path: it.path, modified: it.modified, slide: true }); });
      else out.push(it);
    });
    out.forEach(function (it) { it.key = mediaKey(it); });
    return out;
  }
  function refresh() {
    if (!FEED || S.fetching) return Promise.resolve();
    S.fetching = true; S.lastTry = Date.now();
    return getJson(FEED + "?a=list&t=" + Date.now(), 30000).then(function (j) {
      if (!j || j.ok === false) throw new Error((j && j.error) || "feed said no");
      j.heard = Date.now();
      S.feed = j; S.online = true; S.error = ""; S.lastHeard = j.heard;
      lsSet(LS.list, JSON.stringify(j));
      var items = expand(j.items), keep = {};
      items.forEach(function (it) { keep[it.key] = 1; });
      dropUnused(keep);
      return fetchMissing(items);
    }).catch(function (e) {
      S.online = false; S.error = String(e && e.message || e);
    }).then(function () {
      S.fetching = false; paintChip();
      // first files just landed while a waiting card is up: start the real loop now
      if (S.current && (S.current.type === "loading" || S.current.type === "idle") && playable().length) { S.queue = []; next(); }
    });
  }
  /* One file at a time, so a TV stick on a thin connection isn't swamped. */
  function fetchMissing(items) {
    var todo = items.filter(function (it) {
      var parked = (it.path || []).some(function (n) { return C.parseFolder(n).off; });
      return !it.tooBig && !parked && (it.type === "image" || it.type === "video") && !S.ready[it.key];
    });
    var i = 0;
    function step() {
      if (i >= todo.length) return Promise.resolve();
      var it = todo[i++];
      var url = it.slide ? FEED + "?a=slide&id=" + encodeURIComponent(it.id) + "&page=" + encodeURIComponent(it.page) : FEED + "?a=file&id=" + encodeURIComponent(it.id);
      return getJson(url, 120000).then(function (j) {
        if (j && j.ok && j.data) return saveMedia(it.key, b64Blob(j.data, j.mime || it.mime)).then(function () {
          if (S.current && (S.current.type === "loading" || S.current.type === "idle")) { S.queue = []; next(); }
        });
      }).catch(function () {}).then(step);
    }
    return step();
  }

  // ---------- what to play ----------
  function playable() {
    if (!FEED) return C.DEMO;
    if (!S.feed) return [];
    return expand(S.feed.items).filter(function (it) { return !!S.ready[it.key]; });
  }
  function buildQueue() {
    var t = now(), items = playable(), feed = S.feed;
    var gameDay = FEED ? C.isGameDay(feed, t) : null;
    var today = FEED && feed && feed.schedule ? C.todayLines(feed, t) : [];
    var r = C.buildLoop(items, { now: t, gameDay: gameDay, sponsorTurn: S.turns.s, menuTurn: S.turns.m, todayCard: today.length > 0 });
    S.turns = { s: r.sponsorTurn, m: r.menuTurn }; lsSet(LS.turns, JSON.stringify(S.turns));
    var list = r.list.slice();
    if (FEED && feed && feed.schedule && C.comingUp(feed, t, 7).length) list.push({ type: "coming", id: "coming" });
    if (!list.length) list.push({ type: FEED && !S.feed ? "loading" : "idle", id: "idle" });
    return list;
  }

  // ---------- showing it ----------
  function cardHtml(it) {
    var t = now();
    if (it.type === "today") {
      var lines = C.todayLines(S.feed, t);
      return '<div class="card"><p class="kicker">Today at the field</p><p class="big">' + (lines.length === 1 ? "1 game" : lines.length + " games") + '</p><div class="games">' +
        lines.slice(0, 8).map(function (l) { return '<div class="t' + (l.ended ? " ended" : "") + '">' + esc(l.time) + '</div><div class="g' + (l.ended ? " ended" : "") + '">' + esc(l.title) + (l.where ? '<span class="w">' + esc(l.where) + "</span>" : "") + "</div>"; }).join("") + "</div></div>";
    }
    if (it.type === "coming") {
      var days = C.comingUp(S.feed, t, 7).slice(0, 4);
      return '<div class="card"><p class="kicker">Coming up</p><div class="days">' + days.map(function (d) {
        var dt = new Date(d.day + "T12:00");
        return '<div><div class="d">' + esc(dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })) + '</div>' +
          d.items.slice(0, 3).map(function (e) { return '<div class="e">' + esc((e.time ? e.time + "  " : "") + e.title) + "</div>"; }).join("") + "</div>";
      }).join("") + "</div></div>";
    }
    if (it.type === "loading") return '<div class="card"><p class="kicker">Snack Shack</p><p class="big">Getting the latest from Drive</p><p class="small">This takes a minute the first time. After that it plays even without internet.</p></div>';
    if (it.type === "idle") return '<div class="card"><p class="kicker">' + esc(t.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })) + '</p><p class="big">Welcome to the field</p><p class="bigclock">' + esc(clockText(t)) + "</p></div>";
    var c = it.card || {};
    return '<div class="card">' + (c.kicker ? '<p class="kicker">' + esc(c.kicker) + "</p>" : "") + '<p class="big">' + esc(c.big || "") + "</p>" +
      (c.list ? "<ul>" + c.list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + (c.small ? '<p class="small">' + esc(c.small) + "</p>" : "") + "</div>";
  }
  function show(it) {
    clearTimeout(S.timer);
    var stage = $("stage"), el = document.createElement("div"), secs = SECS, video = null;
    el.className = "slide";
    el.setAttribute("data-type", it.type || "");
    el.setAttribute("data-name", it.name || it.type || "");
    if ((it.type === "image" || it.type === "video") && S.ready[it.key]) {
      var src = S.ready[it.key];
      if (it.type === "image") {
        el.innerHTML = '<div class="bg"></div><img alt="">';
        el.firstChild.style.backgroundImage = "url(" + src + ")";
        el.lastChild.src = src;
        secs = C.secondsFor(it, SECS);
      } else {
        video = document.createElement("video");
        video.muted = !Q.sound; video.playsInline = true; video.autoplay = true; video.preload = "auto";
        video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
        video.src = src;
        el.appendChild(video);
      }
    } else {
      el.innerHTML = cardHtml(it);
      secs = it.type === "today" || it.type === "coming" ? Math.max(SECS, 12) : SECS;
    }
    stage.appendChild(el);
    S.current = it; S.shown++;
    // fade in, then drop the old slide
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      el.className = "slide on";
      var olds = stage.querySelectorAll(".slide");
      setTimeout(function () { for (var i = 0; i < olds.length; i++) if (olds[i] !== el && olds[i].parentNode) { var v = olds[i].querySelector("video"); if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} } olds[i].parentNode.removeChild(olds[i]); } }, 900);
    }); });
    if (video) {
      var moved = false, go = function () { if (!moved) { moved = true; next(); } };
      video.addEventListener("ended", go);
      video.addEventListener("error", go);
      var p = video.play();
      if (p && p.catch) p.catch(function () { if (!video.muted) { video.muted = true; video.play().catch(go); } else go(); });
      S.timer = setTimeout(go, 10 * 60 * 1000); // a stuck video never holds the screen
    } else {
      S.timer = setTimeout(next, secs * 1000);
    }
  }
  function next() {
    // fresh code and a clean slate once a day, at a quiet moment (only when the internet is there to load it)
    if (Date.now() - started > 20 * 3600 * 1000 && navigator.onLine !== false && S.online && now().getHours() < 6) { location.reload(); return; }
    if (!S.queue.length) S.queue = buildQueue();
    show(S.queue.shift());
  }
  function prev() { S.queue = []; next(); }

  // ---------- the corner clock, the setup hint, the OK button panel ----------
  function clockText(t) { var h = t.getHours(), m = t.getMinutes(); return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h >= 12 ? "PM" : "AM"); }
  function paintChip() {
    $("clock").textContent = clockText(now());
    var off = FEED && !S.online;
    document.body.className = off ? "offline" : "";
    var h = $("hint");
    if (!FEED) { h.hidden = false; h.textContent = "Sample slides. Set this screen up at natesteele888.github.io/apps/snackshack"; }
    else h.hidden = true;
  }
  function showInfo() {
    var box = $("info"), items = S.feed ? expand(S.feed.items) : [], saved = items.filter(function (it) { return S.ready[it.key]; }).length;
    var heard = S.lastHeard ? new Date(S.lastHeard).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not yet";
    box.innerHTML = "<div><b>Snack Shack Screen</b></div>" +
      "<div>Drive feed: " + (FEED ? "connected" : "not set up (showing sample slides)") + "</div>" +
      (FEED ? "<div>Files saved on this screen: " + saved + " of " + items.length + "</div><div>Last heard from Drive: " + esc(heard) + "</div>" +
        (S.online ? "" : "<div>Right now: offline, playing what's saved</div>") : "") +
      "<div>Now showing: " + esc(S.current ? C.titleOf(S.current.name) || S.current.type : "") + "</div>";
    box.hidden = false;
    clearTimeout(showInfo.t); showInfo.t = setTimeout(function () { box.hidden = true; }, 8000);
  }
  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowRight" || k === "MediaTrackNext") { e.preventDefault(); next(); }
    else if (k === "ArrowLeft" || k === "MediaTrackPrevious") { e.preventDefault(); prev(); }
    else if (k === "Enter" || k === " " || k === "Select") { e.preventDefault(); showInfo(); }
  });

  // keep the screen awake where the browser allows it
  function wake() { try { if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {} }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", function () { refresh(); });

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});

  window.__snack = { S: S, next: next, refresh: refresh, buildQueue: buildQueue, playable: playable };
  paintChip(); setInterval(paintChip, 15000); wake();
  loadSaved().then(function () {
    next();
    refresh();
    setInterval(refresh, REFRESH_MS);
  });
})();
