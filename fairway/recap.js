/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway round recap and season race. The recap is made from the cards once every card in a round is in, sits on
   top of the Board, and one tap shares it in this tournament's chat (and nowhere else). The season race adds up
   points from every finished tournament this phone has followed this year. Loaded before app.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const R = FW.recap = {};
  const $ = (s, r) => (r || document).querySelector(s);
  const shared = {}; // recaps shared from this phone, so a redraw doesn't offer it again

  R.html = function (ev, r) {
    const esc = U().esc, rc = C.recap(ev, r);
    if (!rc) return "";
    const can = !ev.demo && (U().me() || U().isOrg());
    return `<section class="recap" aria-label="${esc(rc.title)}">
      <small class="rc-eye">${esc(rc.title)} · ${esc(rc.champ.label)}</small>
      <b class="rc-champ">${esc(rc.champ.name)}</b><span class="rc-line">${esc(rc.champ.line)}</span>
      <ul>${rc.items.map(i => `<li><i class="chip">${esc(i.k)}</i><span>${esc(i.t)}</span></li>`).join("")}</ul>
      ${can ? `<button type="button" class="btn block" id="rcshare" ${shared[U().S.code + ":" + r] ? "disabled" : ""}>${shared[U().S.code + ":" + r] ? "Shared in the chat" : "Share in the chat"}</button><p class="msg small">Goes to this tournament's chat only.</p>` : ""}
    </section>`;
  };
  R.wire = function (el, ev, r) {
    const b = $("#rcshare", el); if (!b) return;
    b.onclick = () => { const rc = C.recap(ev, r); if (!rc) return; FW.phase1.autoPost(rc.text, "recap" + r); shared[U().S.code + ":" + r] = true; b.disabled = true; b.textContent = "Shared in the chat"; };
  };

  R.seasonHtml = function () {
    const u = U(), esc = u.esc, year = new Date().getFullYear(), s = C.seasonRace(FW.history(), year), me = u.me();
    if (!s.list.length) return `<h2 class="sec">Season race <small>${year}</small></h2><p class="msg">Finish a round and the year's points race starts here.</p>`;
    const mine = me ? s.list.find(x => C.sameName(x.name, me.n)) : null, top = s.list.slice(0, 10);
    if (mine && top.indexOf(mine) < 0) top.push(mine);
    return `<h2 class="sec">Season race <small>${year} · ${s.events} tournament${s.events === 1 ? "" : "s"}</small></h2>
      <ol class="season">${top.map(x => `<li class="${x === mine ? "mine" : ""}"><span class="pos">${x.place}</span><span class="nm"><b>${esc(x.name)}${x === mine ? " · you" : ""}</b><small>${x.wins ? x.wins + (x.wins === 1 ? " win · " : " wins · ") : ""}${x.events} event${x.events === 1 ? "" : "s"}</small></span><b class="pts">${x.pts.toLocaleString()}</b></li>`).join("")}</ol>
      <p class="msg small">Points for where you finish each tournament (500 for a win), plus 100 for a winning team, 50 for the day's best side-game haul and 25 for a bingo. From the tournaments on this phone.</p>`;
  };
})();
