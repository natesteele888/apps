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
      <button type="button" class="btn block" id="rcpic">Save as a picture</button>
      ${can ? `<button type="button" class="btn block" id="rcshare" ${shared[U().S.code + ":" + r] ? "disabled" : ""}>${shared[U().S.code + ":" + r] ? "Shared in the chat" : "Share in the chat"}</button><p class="msg small">Goes to this tournament's chat only.</p>` : ""}
    </section>`;
  };
  /* ---------- the recap as a picture, to save or send from the phone's own share menu ---------- */
  const PIC = { w: 1080, h: 1350, green: "#0d4a30", green2: "#145c3d", cream: "#f6f3e8", gold: "#d8b54a", ink: "#13201a", muted: "#5d6b62", under: "#c8102e", over: "#0a6b3d" };
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  // Text at the biggest size up to px that fits in max pixels.
  function fit(x, t, px, max, weight) { let s = px; do { x.font = `${weight || 700} ${s}px ${FONT}`; s -= 2; } while (s > 14 && x.measureText(t).width > max); return t; }
  // Draws the recap on a 1080 by 1350 canvas: the champion, the day's notes and the top of the board.
  R.draw = function (x, ev, r) {
    const rc = C.recap(ev, r); if (!rc) return false;
    const P = PIC, W = P.w, pad = 72;
    x.fillStyle = P.green; x.fillRect(0, 0, W, P.h);
    x.strokeStyle = P.gold; x.lineWidth = 6; x.strokeRect(28, 28, W - 56, P.h - 56);
    x.textBaseline = "alphabetic"; x.textAlign = "center";
    x.fillStyle = P.gold; fit(x, "FAIRWAY", 30, W, 800); x.fillText("F A I R W A Y", W / 2, 112);
    x.fillStyle = "#fff"; fit(x, ev.name, 64, W - pad * 2, 800); x.fillText(ev.name, W / 2, 196);
    const sub = ev.course.name + (ev.rounds > 1 ? " · Round " + r + " of " + ev.rounds : "");
    x.fillStyle = P.cream; fit(x, sub, 34, W - pad * 2, 500); x.fillText(sub, W / 2, 248);
    // the champion, on a cream card
    x.fillStyle = P.cream; x.fillRect(pad, 296, W - pad * 2, 250);
    const eye = (rc.champ.name === "A tie at the top" ? (r === ev.rounds ? "Final" : "After round " + r) : rc.champ.label).toUpperCase();
    x.fillStyle = P.green2; fit(x, eye, 30, W - pad * 3, 800); x.fillText(eye, W / 2, 356);
    x.fillStyle = P.ink; fit(x, rc.champ.name, 84, W - pad * 3, 800); x.fillText(rc.champ.name, W / 2, 450);
    x.fillStyle = P.muted; fit(x, rc.champ.line, 36, W - pad * 3, 600); x.fillText(rc.champ.line, W / 2, 508);
    // the day's notes
    x.textAlign = "left"; let y = 618;
    rc.items.slice(0, 4).forEach(i => {
      x.fillStyle = P.gold; fit(x, i.k.toUpperCase(), 26, 300, 800); x.fillText(i.k.toUpperCase(), pad, y);
      x.fillStyle = "#fff"; fit(x, i.t, 36, W - pad * 2 - 300, 600); x.fillText(i.t, pad + 300, y);
      y += 64;
    });
    // the top of the board
    y = Math.max(y + 20, 900);
    const rows = C.standings(ev).filter(s => s.holes).slice(0, 5), names = C.boardNames(rows);
    x.fillStyle = P.cream; x.fillRect(pad, y - 54, W - pad * 2, 84 + rows.length * 62);
    x.fillStyle = P.green; fit(x, "LEADERS", 28, 400, 800); x.fillText("LEADERS", pad + 28, y);
    rows.forEach((s, i) => {
      const yy = y + 62 * (i + 1);
      x.textAlign = "left"; x.fillStyle = P.muted; fit(x, String(s.pos), 34, 90, 700); x.fillText(String(s.pos), pad + 28, yy);
      x.fillStyle = P.ink; fit(x, names[s.id], 38, W - pad * 2 - 360, 700); x.fillText(names[s.id], pad + 130, yy);
      x.textAlign = "right"; x.fillStyle = s.toPar < 0 ? P.under : s.toPar > 0 ? P.over : P.ink;
      const tp = C.fmtPar(s.toPar); fit(x, tp, 40, 160, 800); x.fillText(tp, W - pad - 28, yy);
    });
    x.textAlign = "center"; x.fillStyle = P.cream; fit(x, "Scored with Fairway", 26, W, 500); x.fillText("Scored with Fairway", W / 2, P.h - 64);
    return true;
  };
  // Makes the picture and hands it to the phone's share menu (Save image, Messages, and so on), or saves the file.
  R.picture = function (ev, r) {
    const u = U(), cv = document.createElement("canvas"); cv.width = PIC.w; cv.height = PIC.h;
    const x = cv.getContext && cv.getContext("2d");
    if (!x || !R.draw(x, ev, r) || !cv.toBlob) { u.toast("This phone can't make the picture.", "error"); return; }
    cv.toBlob(blob => {
      if (!blob) { u.toast("This phone can't make the picture.", "error"); return; }
      const name = ("fairway-" + ev.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-r" + r).slice(0, 60) + ".png";
      let file = null; try { file = new File([blob], name, { type: "image/png" }); } catch (e) { /* older phones */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: ev.name }).catch(() => {}); return; }
      const a = document.createElement("a"), url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); u.toast("Picture saved");
    }, "image/png");
  };
  R.wire = function (el, ev, r) {
    const pic = $("#rcpic", el); if (pic) pic.onclick = () => R.picture(ev, r);
    const b = $("#rcshare", el); if (!b) return;
    b.onclick = () => {
      const rc = C.recap(ev, r); if (!rc) return;
      // Mark it shared first: posting to a phone-only tournament's chat can redraw the Board straight away.
      shared[U().S.code + ":" + r] = true; b.disabled = true; b.textContent = "Shared in the chat";
      FW.phase1.autoPost(rc.text, "recap" + r);
    };
  };

  R.seasonHtml = function () {
    // rounds saved before quick rounds were marked are found by the phone's own list of its rounds
    const hist = FW.history().map(h => (!h.q && (FW.mineGet(h.code) || {}).round ? Object.assign({}, h, { q: true }) : h));
    const u = U(), esc = u.esc, year = new Date().getFullYear(), s = C.seasonRace(hist, year), me = u.me();
    if (!s.list.length) return `<h2 class="sec">Season race <small>${year}</small></h2><p class="msg">Finish a round and the year's points race starts here.</p>`;
    const mine = me ? s.list.find(x => C.sameName(x.name, me.n)) : null, top = s.list.slice(0, 10);
    if (mine && top.indexOf(mine) < 0) top.push(mine);
    return `<h2 class="sec">Season race <small>${year} · ${s.events} tournament${s.events === 1 ? "" : "s"}</small></h2>
      <ol class="season">${top.map(x => `<li class="${x === mine ? "mine" : ""}"><span class="pos">${x.place}</span><span class="nm"><b>${esc(x.name)}${x === mine ? " · you" : ""}</b><small>${x.wins ? x.wins + (x.wins === 1 ? " win · " : " wins · ") : ""}${x.events ? x.events + " event" + (x.events === 1 ? "" : "s") + " · " : ""}${x.rounds} round${x.rounds === 1 ? "" : "s"}${x.avg != null ? ", averages " + esc(C.fmtPar(Math.round(x.avg))) : ""}${x.best ? " · best " + x.best.strokes : ""}</small></span><b class="pts">${x.pts.toLocaleString()}</b></li>`).join("")}</ol>
      <p class="msg small">Points for where you finish each tournament (500 for a win), plus 100 for a winning team, 50 for the day's best side-game haul and 25 for a bingo. Quick rounds add to your rounds, average (to par for 18 holes) and best 18, not your points. From the rounds on this phone.</p>`;
  };
})();
