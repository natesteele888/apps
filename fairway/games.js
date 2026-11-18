/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway Games tab: round bingo (a 3 by 3 card of things that happen in every round). Loaded before app.js; app.js
   hands over its helpers as FW.ui and calls FW.games.tab when the Games tab is drawn. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const G = FW.games = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function bingoHtml(ev, me, r) {
    const u = U(), esc = u.esc;
    let card = "";
    if (me) {
      const st = C.bingoState(ev, me.id, r);
      card = `<div class="bgo${st.line ? " won" : ""}" role="group" aria-label="Your bingo card">${st.cells.map((c, i) => {
        const win = st.line && st.line.indexOf(i) >= 0;
        if (c.sq < 0) return `<button type="button" class="free hit${win ? " win" : ""}" disabled>Free</button>`;
        return `<button type="button" data-sq="${c.sq}" class="${c.hit ? "hit" : ""}${win ? " win" : ""}" aria-pressed="${c.hit}" ${c.auto ? "disabled" : ""}>${esc(c.t)}${c.auto ? "<small>from your card</small>" : ""}</button>`;
      }).join("")}</div>
      <p class="msg small">${st.line ? "<b>Bingo!</b> It's in the chat." : `Three in a row wins. Your closest line needs ${st.need} more.`} Birdies and pars on par 3s and par 5s mark themselves from your scores; tap the rest when they happen.</p>`;
    } else card = `<p class="msg">Join the tournament to get your own card. You can watch everyone's below.</p>`;
    const rows = C.players(ev).map(p => ({ p, st: C.bingoState(ev, p.id, r) })).sort((a, b) => (a.st.line ? 0 : 1) - (b.st.line ? 0 : 1) || a.st.need - b.st.need || a.p.n.localeCompare(b.p.n));
    const list = rows.length ? `<h2 class="sec">Everyone's card</h2><ul class="list">${rows.map(x => `<li class="ritem"><b>${esc(x.p.n)}</b><i class="chip ${x.st.line ? "in" : ""}">${x.st.line ? "Bingo" : x.st.need + " to go"}</i></li>`).join("")}</ul>` : "";
    return `<h2 class="sec">Round bingo</h2>${card}${list}`;
  }

  G.tab = function (el, ev) {
    const u = U(), me = u.me(), r = Math.min(ev.cur, ev.rounds);
    el.innerHTML = bingoHtml(ev, me, r);
    $$("[data-sq]", el).forEach(b => b.onclick = () => {
      if (!me || b.disabled) return;
      const sq = +b.dataset.sq, cur = (ev.bg && ev.bg[me.id]) || [], had = C.bingoState(ev, me.id, r).line;
      const next = cur.indexOf(sq) >= 0 ? cur.filter(x => x !== sq) : cur.concat(sq);
      const patch = { ["bg." + me.id]: next.length ? next : C.DELETE };
      u.write(patch);
      const after = C.bingoState(C.cleanEvent(C.applyPatch(ev, patch)), me.id, r);
      if (after.line && !had && !ev.demo) FW.phase1.autoPost("BINGO! " + me.n + " got three in a row.", "bg" + me.id + "r" + r);
    });
  };
})();
