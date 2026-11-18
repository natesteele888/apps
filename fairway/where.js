/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway who's where: every group as a dot on a course overview, placed on the hole the scorecard says they're
   on. No one's location is used or shared. With GPS tee and green marks for every hole on this phone it draws the
   real layout; otherwise a routing card of the two nines. Shown on the Board's Course view. Loaded before app.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const W = FW.where = {};

  W.html = function (ev) {
    const u = U(), esc = u.esc, mine = u.me(), n = C.holeCount(ev), maps = {};
    if (FW.map) for (let h = 1; h <= n; h++) maps[h] = FW.map.get(ev.course, h);
    const lay = C.whereLayout(ev, maps), at = C.groupSpots(ev, lay);
    if (!at.spots.length && !at.done.length) return "";
    const holes = lay.holes.map(x => `<g class="wh"><line x1="${x.a[0]}" y1="${x.a[1]}" x2="${x.b[0]}" y2="${x.b[1]}"/><circle class="wgr" cx="${x.b[0]}" cy="${x.b[1]}" r="2.6"/><text x="${x.a[0]}" y="${x.a[1] + 4.6}">${C.holeNo(ev.course, x.h)}</text></g>`).join("");
    const dots = at.spots.map(s => `<g class="wdot${mine && mine.g === s.g ? " mine" : ""}"><circle cx="${s.x}" cy="${s.y}" r="4.2"/><text x="${s.x}" y="${s.y + 1.5}">${s.g}</text></g>`).join("");
    const list = at.spots.map(s => `<li${mine && mine.g === s.g ? ' class="mine"' : ""}><b>Group ${s.g}</b> ${s.started ? "on" : "starting on"} hole ${C.holeNo(ev.course, s.h)}${mine && mine.g === s.g ? " · you" : ""}</li>`).join("")
      + (at.done.length ? `<li>Finished: group${at.done.length > 1 ? "s" : ""} ${at.done.join(", ")}</li>` : "");
    return `<h2 class="sec">Who's where <small>${lay.real ? "from your course marks" : "by the hole they're on"}</small></h2>
      <div class="where"><svg viewBox="0 0 100 100" role="img" aria-label="Course overview with each group on its hole">${holes}${dots}</svg></div>
      <ul class="wlist">${list}</ul>
      <p class="msg small">Placed by each group's scorecard, never by anyone's location.${lay.real ? "" : " Mark every tee and green on the hole maps and this becomes the real course."}</p>`;
  };
})();
