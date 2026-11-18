/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway hole map: your picture of the hole (a hand sketch or a screenshot), with its tee and green tapped in once,
   GPS yards to the middle, front and back of the green once you've marked them standing there, tap-to-measure on the
   picture, and the club from My bag. Your location is used live on this phone only and is never saved or shared.
   Maps are kept on this phone, by course and hole. Loaded before app.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const M = FW.map = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const key = (course, h) => "fw:map:" + C.courseKey(course) + ":" + h;
  M.get = (course, h) => C.cleanHoleMap(FW.LS.get(key(course, h), null));
  function put(course, h, m) { const v = C.cleanHoleMap(m); if (!v) { FW.LS.del(key(course, h)); return true; } return FW.LS.set(key(course, h), v); }

  // The live spot, only while a map is open: one watch, stopped as soon as the map closes.
  let watch = null, here = null;
  function startGps(onFix) {
    if (!navigator.geolocation || watch != null) return !!navigator.geolocation;
    watch = navigator.geolocation.watchPosition(p => { here = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; onFix(); },
      () => { stopGps(); onFix(true); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    return true;
  }
  function stopGps() { if (watch != null && navigator.geolocation) navigator.geolocation.clearWatch(watch); watch = null; here = null; }

  // A hole picture, redrawn small enough to keep 18 of them on a phone, as JPEG text.
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 640 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        let q = 0.7, out = cv.toDataURL("image/jpeg", q);
        while (out.length > 180000 && q > 0.3) { q -= 0.1; out = cv.toDataURL("image/jpeg", q); }
        res({ img: out, ar: cv.width / cv.height });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
      img.src = url;
    });
  }

  // A bar under the hole card: yards to the middle when we know them, else a nudge to map the hole.
  M.holeHtml = function (ev, h) {
    const m = M.get(ev.course, h);
    return `<button type="button" class="jackbar mapbar" id="mapopen"><span><b>Hole map</b><small>${m && (m.img || m.gc) ? "Yards, tap-to-measure and your club" : "Add a picture of the hole, then mark the green"}</small></span><span class="chev">Map</span></button>`;
  };
  M.wire = function (el, ev, mine, h) { const b = $("#mapopen", el); if (b) b.onclick = () => M.sheet(ev, mine, h); };

  M.sheet = function (ev, mine, h) {
    const u = U(), esc = u.esc, tee = C.teeOf(ev, mine), card = C.yards(ev.course, h, tee.id), par = ev.course.holes[h - 1].par;
    let mode = null, tap = null, gpsErr = false;
    const club = y => (FW.bag && y > 0 ? C.clubWords(FW.bag.club(y)) : "");
    const draw = box => {
      if (!document.body.contains(box)) { stopGps(); return; }
      const m = M.get(ev.course, h) || {}, gy = C.greenYards(m, here), you = here ? C.gpsToPic(m, here) : null;
      const meas = tap ? C.tapMeasure(m, card, tap, you) : null, scale = !!C.picScale(m, card);
      const pic = m.img ? `<div class="hmap" style="padding-top:${(100 / (m.ar || 0.75)).toFixed(2)}%"><img src="${m.img}" alt="Your picture of hole ${h}">
          <svg viewBox="0 0 100 ${(100 / (m.ar || 0.75)).toFixed(2)}" preserveAspectRatio="none" id="mapsvg" aria-hidden="true">
            ${m.tee && tap ? `<line x1="${(you || m.tee)[0] * 100}" y1="${(you || m.tee)[1] * 100 / (m.ar || 0.75)}" x2="${tap[0] * 100}" y2="${tap[1] * 100 / (m.ar || 0.75)}" class="mline"/>` : ""}
            ${m.green && tap ? `<line x1="${tap[0] * 100}" y1="${tap[1] * 100 / (m.ar || 0.75)}" x2="${m.green[0] * 100}" y2="${m.green[1] * 100 / (m.ar || 0.75)}" class="mline"/>` : ""}
            ${[[m.tee, "mtee", 2.2], [m.green, "mgreen", 2.6], [tap, "mtap", 2], [you, "myou", 2.4]].map(([p, c, r]) => p ? `<circle class="${c}" cx="${p[0] * 100}" cy="${p[1] * 100 / (m.ar || 0.75)}" r="${r}"/>` : "").join("")}
          </svg></div>` : `<div class="hmap none"><p>No picture of hole ${h} yet. A hand sketch or a screenshot works.</p></div>`;
      const yards = gy ? `<div class="gyds" role="status"><div><small>Front</small><b>${gy.f != null ? gy.f : "–"}</b></div><div class="mid"><small>Middle</small><b>${gy.c != null ? gy.c : "–"}</b></div><div><small>Back</small><b>${gy.b != null ? gy.b : "–"}</b></div></div>
          ${gy.c != null && club(gy.c) ? `<p class="msg small">From your bag: <b>${esc(club(gy.c))}</b>${here && here.acc > 15 ? ` · GPS is rough right now (±${Math.round(here.acc * 1.09)} yds)` : ""}</p>` : ""}`
        : `<p class="msg small">${watch == null ? "" : gpsErr ? "This phone won't share its location with Fairway right now." : here ? "Mark the green below to get yards to it." : "Finding you…"}</p>`;
      const hint = mode === "tee" ? "Tap the tee on the picture." : mode === "green" ? "Now tap the middle of the green." : meas ? `${meas.fromYou ? "From you" : "From the tee"}: <b>${meas.from}</b> yds · to the green: <b>${meas.to}</b> yds${club(meas.to) ? ` · ${esc(club(meas.to))} in` : ""}` : m.img && scale ? "Tap anywhere on the picture to measure it." : m.img ? "Set the tee and green on the picture to measure." : "";
      $(".sheet-b", box).innerHTML = `<p class="msg small">Hole ${h} · par ${par}${card ? ` · ${card} yds from the ${esc(tee.name)} tees` : ""}</p>
        ${pic}<p class="msg small" id="maphint">${hint}</p>
        ${watch == null ? `<button type="button" class="btn primary block" id="gpson">Use GPS for yards</button>` : yards}
        <div class="row2">${m.img ? `<button type="button" class="btn small" id="setpts">${m.tee && m.green ? "Move the tee and green" : "Set the tee and green"}</button>` : ""}
          <label class="btn small filebtn">${m.img ? "New picture" : "Add a picture"}<input type="file" accept="image/*" id="mapimg"></label></div>
        ${watch != null && here ? `<h2 class="sec">Standing on it? Mark it</h2><div class="row2"><button type="button" class="btn small" data-mk="gt">The tee</button><button type="button" class="btn small" data-mk="gf">Front of green</button><button type="button" class="btn small" data-mk="gc">Middle of green</button><button type="button" class="btn small" data-mk="gb">Back of green</button></div>
          <p class="msg small">Marks stay on this phone for this course and help next time you play it. Your location itself is never saved or shared.</p>` : ""}
        <p class="err" id="maperr" role="alert"></p>`;
      const err = t => { $("#maperr", box).textContent = t; };
      // a fresh fix redraws at most every few seconds, so taps on the map aren't lost mid-redraw
      const on = $("#gpson", box); if (on) on.onclick = () => {
        let last = 0;
        const ok = startGps(bad => { if (bad) gpsErr = true; const now = Date.now(); if (bad || now - last > 3000) { last = now; draw(box); } });
        if (!ok) { err("This phone has no GPS for the browser."); return; }
        draw(box);
      };
      const sp = $("#setpts", box); if (sp) sp.onclick = () => { mode = "tee"; tap = null; draw(box); };
      $("#mapimg", box).onchange = e => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        shrink(f).then(p => { const cur = M.get(ev.course, h) || {}; if (!put(ev.course, h, Object.assign({}, cur, p, { tee: null, green: null }))) { err("This phone is out of room for more hole pictures."); return; } mode = "tee"; tap = null; draw(box); u.render(); })
          .catch(() => err("That picture didn't open. Try a screenshot or a photo."));
      };
      const svg = $("#mapsvg", box), img = svg && svg.parentNode;
      if (img) img.onclick = e => {
        const r = img.getBoundingClientRect(), p = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
        if (!(p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)) return;
        const cur = M.get(ev.course, h) || {};
        if (mode === "tee") { put(ev.course, h, Object.assign({}, cur, { tee: p })); mode = "green"; }
        else if (mode === "green") { put(ev.course, h, Object.assign({}, cur, { green: p })); mode = null; u.render(); }
        else tap = p;
        draw(box);
      };
      $$("[data-mk]", box).forEach(b => b.onclick = () => {
        if (!here) return;
        if (here.acc > 25) { err(`GPS is only good to about ${Math.round(here.acc * 1.09)} yards right now. Give it a few seconds in the open.`); return; }
        const cur = M.get(ev.course, h) || {}; put(ev.course, h, Object.assign({}, cur, { [b.dataset.mk]: here })); u.toast("Marked"); draw(box); u.render();
      });
    };
    u.sheet("Hole " + h + " map", "", box => {
      draw(box);
      // stop the GPS as soon as the map closes, however it closes
      const host = box.parentNode, mo = window.MutationObserver ? new MutationObserver(() => { if (!document.body.contains(box)) { stopGps(); mo.disconnect(); } }) : null;
      if (mo && host) mo.observe(host, { childList: true });
    });
  };
})();
