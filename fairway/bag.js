/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway My bag: which clubs you carry and how far each one goes, kept on this phone. The hole review and Jack use
   it to name a club for a par 3, and the hole map uses it for the club to the green. Loaded before app.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const B = FW.bag = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = "fw:bag";
  B.get = () => C.cleanBag(FW.LS.get(KEY, null));
  B.club = yds => C.clubFor(B.get(), yds);

  B.sheet = function (back) {
    const u = U(), esc = u.esc, bag = B.get();
    const draw = box => {
      $(".sheet-b", box).innerHTML = `<p class="msg small">Tick the clubs you carry and put in how far you hit each one. Blank uses a typical number. It stays on this phone.</p>
        <ul class="list bag">${C.CLUBS.map(([id, n, typ]) => `<li class="ritem"><label class="betck"><input type="checkbox" data-club="${id}" ${bag.on.indexOf(id) >= 0 ? "checked" : ""}> ${esc(n)}</label>
          <input type="number" inputmode="numeric" min="10" max="400" data-yds="${id}" value="${bag.y[id] || ""}" placeholder="${typ}" aria-label="${esc(n)} yards"><small>yds</small></li>`).join("")}</ul>
        <p class="err" id="bagerr" role="alert"></p>
        <button type="button" class="btn primary block" id="bagsave">Save my bag</button>`;
      $("#bagsave", box).onclick = () => {
        const on = $$("[data-club]", box).filter(b => b.checked).map(b => b.dataset.club), y = {};
        if (!on.length) { $("#bagerr", box).textContent = "Tick at least one club."; return; }
        $$("[data-yds]", box).forEach(i => { if (i.value !== "") y[i.dataset.yds] = +i.value; });
        FW.LS.set(KEY, C.cleanBag({ on, y })); u.toast("Bag saved"); u.render();
        if (back) back(); else u.closeSheet();
      };
    };
    u.sheet("My bag", "", draw);
  };
})();
