/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway hole review: once your score is in, a short card under the scorer says how the hole went (tee shot, putts,
   penalties, sand: a tap each, kept only on this phone), shows the hole coming up from your tees and, when the last
   few holes show a pattern, what Jack noticed. No AI and nothing sent anywhere: it's counting. Loaded before app.js;
   app.js calls FW.review.html and FW.review.wire from the Score tab. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const R = FW.review = {};
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = code => "fw:hn:" + code;
  R.notes = code => C.cleanHoleNotes(FW.LS.get(KEY(code), {}));
  function save(code, k, note) {
    const all = R.notes(code), v = C.cleanHoleNote(note);
    if (v) all[k] = v; else delete all[k];
    FW.LS.set(KEY(code), all);
  }
  const seg = (name, cur, opts) => `<div class="hrseg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-hn="${name}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;

  // Only for the golfer holding this phone, and only once their score for the hole is in.
  R.html = function (ev, pl, r, h) {
    const u = U(), esc = u.esc, v = C.strokes(pl, r, h);
    if (v == null) return "";
    const hole = Object.assign({}, ev.course.holes[h - 1], { par: C.parOf(ev.course, h, pl.tee) }), n = R.notes(u.S.code)[C.key(r, h)] || {}, d = v - hole.par;
    const line = C.holeLine(hole.par, v, n), nx = C.nextHole(ev, pl, r, h), tip = C.jackNoticed(ev, pl, r, R.notes(u.S.code));
    return `<section class="hreview" aria-label="Your hole ${C.holeNo(ev.course, h)}">
      <div class="hr-h"><b>Your ${C.holeNo(ev.course, h)}</b><span>${v} · ${esc(C.scoreName(d, v))}</span></div>
      <p class="msg small">${line ? esc(line) + "." : "How did it go? A tap each, kept on this phone."}</p>
      ${hole.par > 3 ? `<div class="hrrow"><span>Tee shot</span>${seg("t", n.t, [["fairway", "Fairway"], ["left", "Left"], ["right", "Right"], ["short", "Short"]])}</div>` : ""}
      <div class="hrrow"><span>Putts</span>${seg("p", n.p, [[0, "0"], [1, "1"], [2, "2"], [3, "3"], [4, "4+"]])}</div>
      <div class="hrrow"><span>Penalties</span>${seg("x", n.x || 0, [[0, "None"], [1, "1"], [2, "2+"]])}</div>
      <div class="hrrow"><span>Sand</span>${seg("b", n.b ? 1 : 0, [[0, "No"], [1, "Yes"]])}</div>
      ${nx ? `<div class="hrnext"><span><small>Up next</small><b>Hole ${nx.h} · par ${nx.par}</b><small>${nx.yds ? nx.yds + " yds from the " + esc(nx.tee) + " tees · " : ""}handicap ${nx.hcp}</small>${nx.par === 3 && nx.yds && FW.bag ? `<small class="hrnote">From your bag: ${esc(C.clubWords(FW.bag.club(nx.yds)))}</small>` : ""}${FW.jack && FW.jack.notesFor(ev.course, nx.h).length ? `<small class="hrnote">Your note: ${esc(FW.jack.notesFor(ev.course, nx.h)[0])}</small>` : ""}</span></div>` : ""}
      ${tip ? `<div class="hrjack"><small>Jack noticed</small><p>${esc(tip)}</p></div>` : ""}
    </section>`;
  };
  R.wire = function (el, ev, pl, r, h) {
    const u = U(), k = C.key(r, h);
    $$("[data-hn]", el).forEach(b => b.onclick = () => {
      const n = Object.assign({}, R.notes(u.S.code)[k] || {}), f = b.dataset.hn, v = +b.dataset.v;
      if (f === "t") n.t = n.t === b.dataset.v ? undefined : b.dataset.v;
      else if (f === "b") n.b = v === 1;
      else n[f] = n[f] === v && f === "p" ? undefined : v;
      save(u.S.code, k, n); u.render();
    });
  };
})();
