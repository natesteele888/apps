/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway Games tab: side games with a running tally (no money ever moves here) and round bingo (a 3 by 3 card of
   things that happen in every round). Loaded before app.js; app.js hands over its helpers as FW.ui and calls
   FW.games.tab when the Games tab is drawn. */
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

  /* ---------- side games ---------- */
  const stake = a => (a ? C.money(a) : "For fun");
  function betsHtml(ev, me, r) {
    const u = U(), esc = u.esc, org = u.isOrg();
    if (!ev.bets) return `<h2 class="sec">Side games</h2><p class="msg">${org ? "Skins, Nassau, wolf and more. Pick the games and Fairway keeps the tally." : "No side games yet. The organizer picks them here."}</p>
      ${org ? `<button type="button" class="btn primary block" id="betset">Pick the side games</button>` : ""}`;
    const t = C.betTally(ev, r), nm = p => (ev.p[p] ? ev.p[p].n : "Player");
    const owes = t.owes.length ? `<ul class="list owes">${t.owes.map(o => `<li class="ritem"><span><b>${esc(nm(o.from))}</b> owes <b>${esc(nm(o.to))}</b></span><i class="chip">${C.money(o.amt)}</i></li>`).join("")}</ul>`
      : `<p class="msg">Everyone's even so far.</p>`;
    const games = t.games.map(g => `<div class="betg"><div class="betg-h"><b>${esc(g.name)}</b><i class="chip">${esc(stake(g.amt))}</i></div><ul>${g.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("");
    return `<h2 class="sec">Who owes who <small>if the round ended now</small></h2>${owes}
      <p class="msg small">Just a tally. Fairway never moves money.</p>
      ${me || org ? `<button type="button" class="btn primary block" id="betmark">Mark a hole</button>` : ""}
      <h2 class="sec">Side games</h2>${games}
      ${org ? `<button type="button" class="btn ghost block" id="betset">Change the side games</button>` : ""}`;
  }
  function setupSheet(ev) {
    const u = U(), esc = u.esc, cur = ev.bets || { on: [], amt: {}, out: [] };
    const st = { on: cur.on.slice(), amt: Object.assign({}, cur.amt), out: cur.out.slice() };
    const draw = box => {
      $(".sheet-b", box).innerHTML = `<p class="msg small">Pick the games and the stake for each. It's a tally only; nobody pays through Fairway.</p>
        <ul class="list">${C.BETS.map(([g, n]) => `<li class="ritem betrow"><label class="betck"><input type="checkbox" data-g="${g}" ${st.on.indexOf(g) >= 0 ? "checked" : ""}> ${esc(n)}</label>
          <select data-amt="${g}" aria-label="Stake for ${esc(n)}" ${st.on.indexOf(g) >= 0 ? "" : "disabled"}>${C.BET_AMTS.map(a => `<option value="${a}" ${(st.amt[g] != null ? st.amt[g] : 1) === a ? "selected" : ""}>${a ? C.money(a) : "For fun"}</option>`).join("")}</select></li>`).join("")}</ul>
        <h2 class="sec">Who's playing</h2>
        <ul class="list">${C.players(ev).map(p => `<li class="ritem"><label class="betck"><input type="checkbox" data-in="${p.id}" ${st.out.indexOf(p.id) < 0 ? "checked" : ""}> ${esc(p.n)}</label></li>`).join("")}</ul>
        <button type="button" class="btn primary block" id="betsave">Save</button>`;
      $$("[data-g]", box).forEach(b => b.onchange = () => { const g = b.dataset.g; st.on = b.checked ? st.on.concat(g) : st.on.filter(x => x !== g); draw(box); });
      $$("[data-amt]", box).forEach(b => b.onchange = () => { st.amt[b.dataset.amt] = +b.value; });
      $$("[data-in]", box).forEach(b => b.onchange = () => { const p = b.dataset.in; st.out = b.checked ? st.out.filter(x => x !== p) : st.out.concat(p); });
      $("#betsave", box).onclick = () => {
        const on = C.BETS.map(b => b[0]).filter(g => st.on.indexOf(g) >= 0), amt = {};
        on.forEach(g => { amt[g] = st.amt[g] != null ? st.amt[g] : 1; });
        u.write({ bets: on.length ? { on, amt, out: st.out } : C.DELETE }); u.closeSheet(); u.toast("Saved");
      };
    };
    u.sheet("Side games", "", draw);
  }
  function markSheet(ev, r) {
    const u = U(), esc = u.esc, me = u.me(), who = C.betPlayers(ev), nm = p => esc(ev.p[p] ? ev.p[p].n : "Player");
    const mine = me && ev.p[me.id] ? C.round(ev, ev.p[me.id], r) : null;
    let h = mine ? (mine.last || mine.next || 1) : 1;
    const draw = box => {
      const k = C.key(r, h), m = (ev.bm && ev.bm[k]) || {}, par = ev.course.holes[h - 1].par;
      const pickOne = (id, lbl, val) => `<label class="fld"><span>${lbl}</span><select id="${id}"><option value="">Nobody yet</option>${who.map(p => `<option value="${p}" ${val === p ? "selected" : ""}>${nm(p)}</option>`).join("")}</select></label>`;
      const pickMany = (id, lbl, val) => `<fieldset class="fld"><legend>${lbl}</legend><ul class="list">${who.map(p => `<li class="ritem"><label class="betck"><input type="checkbox" data-${id}="${p}" ${(val || []).indexOf(p) >= 0 ? "checked" : ""}> ${nm(p)}</label></li>`).join("")}</ul></fieldset>`;
      const groups = []; who.forEach(p => { const g = ev.p[p].g; if (groups.indexOf(g) < 0) groups.push(g); });
      const myG = me && ev.p[me.id] ? ev.p[me.id].g : null;
      const wolfGroups = groups.sort((a, b) => a - b).filter(g => (myG == null || myG === g || u.isOrg()) && C.wolfOrder(ev, g, who).length >= 3);
      const parts = [];
      if (C.betOn(ev, "wolf")) wolfGroups.forEach(g => {
        const order = C.wolfOrder(ev, g, who), w = order[(h - 1) % order.length], pick = (m.wp || {})[g] || "";
        parts.push(`<label class="fld"><span>${wolfGroups.length > 1 ? `Group ${g}: ` : ""}${nm(w)} is the wolf</span><select data-wolf="${g}"><option value="">Not picked yet</option><option value="lone" ${pick === "lone" ? "selected" : ""}>Going alone (double)</option>${order.filter(p => p !== w).map(p => `<option value="${p}" ${pick === p ? "selected" : ""}>Partner: ${nm(p)}</option>`).join("")}</select></label>`);
      });
      if (C.betOn(ev, "long")) parts.push(pickOne("bld", "Long drive", m.ld));
      if (C.betOn(ev, "green") && par === 3) parts.push(pickOne("bgr", "Greenie (on in one, then par)", m.gr));
      if (C.betOn(ev, "sandy")) parts.push(pickMany("sa", "Sandies (out of the sand, then par)", m.sa));
      if (C.betOn(ev, "snake")) parts.push(pickMany("tp", "Three-putts (the last one holds the snake)", m.tp));
      $(".sheet-b", box).innerHTML = `<label class="fld"><span>Hole</span><select id="bh">${ev.course.holes.map((x, i) => `<option value="${i + 1}" ${i + 1 === h ? "selected" : ""}>Hole ${i + 1} · par ${x.par}</option>`).join("")}</select></label>
        ${parts.length ? parts.join("") : `<p class="msg">Nothing to mark on this hole for today's games. Skins, Nassau and best ball come straight from the scores.</p>`}
        ${parts.length ? `<button type="button" class="btn primary block" id="bmsave">Save</button>` : ""}`;
      $("#bh", box).onchange = e => { h = +e.target.value; draw(box); };
      const save = $("#bmsave", box); if (!save) return;
      save.onclick = () => {
        const patch = {}, base = "bm." + k + ".", val = id => { const x = $("#" + id, box); return x ? x.value : null; };
        const many = id => $$("[data-" + id + "]", box).filter(b => b.checked).map(b => b.getAttribute("data-" + id));
        if ($("#bld", box)) patch[base + "ld"] = val("bld") || C.DELETE;
        if ($("#bgr", box)) patch[base + "gr"] = val("bgr") || C.DELETE;
        if ($("[data-sa]", box)) { const l = many("sa"); patch[base + "sa"] = l.length ? l : C.DELETE; }
        if ($("[data-tp]", box)) { const l = many("tp"); patch[base + "tp"] = l.length ? l : C.DELETE; }
        $$("[data-wolf]", box).forEach(s => { patch[base + "wp." + s.dataset.wolf] = s.value || C.DELETE; });
        u.write(patch); u.closeSheet(); u.toast("Marked hole " + h);
      };
    };
    u.sheet("Mark a hole", "", draw);
  }

  G.tab = function (el, ev) {
    const u = U(), me = u.me(), r = Math.min(ev.cur, ev.rounds);
    el.innerHTML = betsHtml(ev, me, r) + bingoHtml(ev, me, r);
    const bs = $("#betset", el); if (bs) bs.onclick = () => setupSheet(ev);
    const bk = $("#betmark", el); if (bk) bk.onclick = () => markSheet(ev, r);
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
