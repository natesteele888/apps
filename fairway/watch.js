/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway on a Wear OS watch (the Fairway app in watch/family, installed with the Steele Family watch app).
   Through the watch link (../watchlink.js, the "fg" field) this phone sends the watch your round: the course, your tees'
   yards, the greens you've marked, your notes, your bag and your scores. It takes back what the watch did: green marks
   and notes, and scores in a tournament kept on this phone only. In a shared tournament the watch writes your score
   straight to the tournament itself, so the phone can stay in your pocket.
   Nothing goes anywhere unless a watch is linked, and only while Fairway is open. Loaded after app.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW, WL = window.WatchLink;
  if (!C || !FW || !WL) return;
  const X = FW.watch = {};
  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
  // the same course key as the hole maps and Jack's notes use
  const ckOf = c => (C.courseKey ? C.courseKey(c) : c && c.id ? "id:" + clip(c.id, 40) : "n:" + clip(c && c.name, 60).toLowerCase());
  const NK = "fw:cnotes", mapKey = (ck, h) => "fw:map:" + ck + ":" + h;
  const pt = v => (v && isFinite(v.lat) && isFinite(v.lon) ? [Math.round(v.lat * 1e7) / 1e7, Math.round(v.lon * 1e7) / 1e7] : null);

  /* What the watch gets: this golfer's round in the open tournament, or null when there's nothing to send. */
  X.payload = function () {
    const u = FW.ui, S = u && u.S; if (!S || !S.ev || !S.code) return null;
    const ev = S.ev, mine = u.me(); if (!mine || !ev.course || !Array.isArray(ev.course.holes)) return null;
    const r = Math.min(ev.cur || 1, ev.rounds || 1), c = ev.course, ck = ckOf(c), tee = C.teeOf(ev, mine);
    const notes = (FW.LS.get(NK, {}) || {})[ck] || {};
    const h = c.holes.map((x, i) => {
      const n = i + 1, m = FW.LS.get(mapKey(ck, n), null) || {}, o = { p: x.par, y: C.yards(c, n, tee.id) || 0 };
      [["f", "gf"], ["c", "gc"], ["b", "gb"]].forEach(([k, g]) => { const s = pt(m[g]); if (s) o[k] = s; });
      const nl = (Array.isArray(notes[n]) ? notes[n] : []).filter(t => typeof t === "string" && t).slice(0, 5);
      if (nl.length) o.n = nl;
      return o;
    });
    const s = {}; h.forEach((_, i) => { const v = C.strokes(ev.p[mine.id], r, i + 1); if (v != null) s[i + 1] = v; });
    let bag = [];
    try { if (FW.bag && C.bagList) bag = C.bagList(FW.bag.get()).map(b => [b.n, b.y]); } catch (e) { bag = []; }
    return { v: 1, e: S.code, sh: S.place === FW.cloud && !ev.demo, r, p: mine.id, pn: clip(mine.n, 40), nm: clip(ev.name, 60),
      ck, cn: clip(c.name, 60), st: mine.st || 1, h, s, bag };
  };

  /* What the watch did, taken once each (watchlink.js remembers which). A score for another tournament waits until
     that one is open here. */
  X.take = function (doc) {
    const fresh = WL.fresh(doc, "fg"); if (!fresh.length) return 0;
    const u = FW.ui, S = u && u.S, took = [];
    fresh.forEach(x => {
      if (x.k === "s") {
        if (!S || !S.ev || x.e !== S.code) return;
        // a shared tournament already has it: the watch wrote it there itself
        if (S.place === FW.local && S.ev.p[x.p] && Number.isInteger(x.r) && Number.isInteger(x.h) && x.h >= 1 && x.h <= 18)
          u.write({ ["p." + x.p + ".s." + x.r + "_" + x.h]: x.s >= 1 && x.s <= 20 ? x.s : C.DELETE });
      } else if (x.k === "g" && typeof x.c === "string" && x.h >= 1 && x.h <= 18 && ["f", "c", "b"].indexOf(x.m) >= 0 && isFinite(x.lat) && isFinite(x.lon)) {
        let m = Object.assign({}, FW.LS.get(mapKey(x.c, x.h), null) || {}, { ["g" + x.m]: { lat: x.lat, lon: x.lon, acc: Number(x.acc) || 0 } });
        if (C.cleanHoleMap) m = C.cleanHoleMap(m) || m;
        FW.LS.set(mapKey(x.c, x.h), m);
      } else if (x.k === "n" && typeof x.c === "string" && x.h >= 1 && x.h <= 18 && typeof x.t === "string" && clip(x.t, 140)) {
        const all = FW.LS.get(NK, {}) || {}, holes = all[x.c] || {}, list = Array.isArray(holes[x.h]) ? holes[x.h] : [], t = clip(x.t, 140);
        if (list.indexOf(t) < 0) list.push(t);
        holes[x.h] = list.slice(-5); all[x.c] = holes; FW.LS.set(NK, all);
      }
      took.push(x);
    });
    WL.took("fg", took);
    return took.length;
  };

  let last = "", busy = false;
  async function tick() {
    if (busy || !WL.linked() || document.hidden || !FW.ui || !FW.ui.S.ev) return;
    busy = true;
    try {
      const doc = await WL.read();
      if (X.take(doc)) last = "";
      const p = X.payload();
      if (p) { const t = JSON.stringify(p); if (t !== last) { await WL.write("fg", Object.assign({ at: Date.now() }, p)); last = t; } }
    } catch (e) { /* no signal: next time */ } finally { busy = false; }
  }
  X.tick = tick;
  setInterval(tick, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  setTimeout(tick, 1500);

  /* The "Your watch" card on the Share tab. */
  X.panelHtml = () => `<div class="share fwwatch"><h2>Your watch</h2><div id="fwwl"></div></div>`;
  X.wire = function (el) {
    const box = el && el.querySelector("#fwwl"); if (!box) return;
    WL.panel(box, { intro: "Open Fairway on your Wear OS watch. It shows a code: type it here.", linkedText: "Yards, your score and Jack are on it.",
      btn: "btn", btnPri: "btn primary", onLinked: () => { last = ""; tick(); } });
  };
})();
