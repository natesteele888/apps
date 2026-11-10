/* Gameday Picks: the Standings tab (standings, playoff picture, a page per team) and the scouting card
   (press and hold a team on the pick screen, or tap "Scout this matchup").
   Uses the page's globals (S, $, esc, toast, render, contrast, today, store) at call time; loaded before the page script.
   Data: ESPN's public standings, scoreboard and team-schedule JSON. Nothing here is written to Firebase: the last good
   copy of each screen is kept on this phone only, so it still opens with no signal. */
"use strict";
const X = window.GPStats;

/* ---------- data: network first, last good copy on the phone ---------- */
const XM = {};
function xSaved(k) { try { return JSON.parse(localStorage.getItem("gps:" + k) || "null"); } catch (_) { return null; } }
function xKeep(k, v) {
  const rec = { at: Date.now(), v }; XM[k] = rec;
  try {
    localStorage.setItem("gps:" + k, JSON.stringify(rec));
    const ks = Object.keys(localStorage).filter(x => x.startsWith("gps:"));
    if (ks.length > 40) ks.map(x => [x, (JSON.parse(localStorage.getItem(x)) || {}).at || 0]).sort((a, b) => a[1] - b[1]).slice(0, ks.length - 40).forEach(([x]) => localStorage.removeItem(x));
  } catch (_) { window.nateHealth && nateHealth.note("save", "couldn't keep an offline copy of the stats"); }
}
// → {v, at, stale}. Fresh for 2 minutes in memory, so moving between screens doesn't refetch.
async function xLoad(k, url, parse) {
  const m = XM[k]; if (m && Date.now() - m.at < 120000) return { v: m.v, at: m.at, stale: false };
  try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); const v = parse(await r.json()); xKeep(k, v); return { v, at: Date.now(), stale: false }; }
  catch (e) { const s = m || xSaved(k); if (s) return { v: s.v, at: s.at, stale: true }; throw e; }
}
const xStandings = sp => xLoad("st-" + sp, X.url.standings(sp), d => X.parseStandings(d, sp));
const xSchedule = (sp, id, season) => xLoad("tm-" + sp + "-" + id + (season ? "-" + season : ""), X.url.schedule(sp, id, season), d => Object.assign(X.teamView(d, id), { year: X.seasonYear(d) }));
const xNow = sp => xLoad("now-" + sp, X.url.scoreboard(sp), d => X.seasonOf(d));
function xAgo(at) { const d = new Date(at); let h = d.getHours(), ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return h + ":" + String(d.getMinutes()).padStart(2, "0") + " " + ap; }
const xStale = r => (r && r.stale ? `<p class="x-warn">No signal. Showing what was saved at ${esc(xAgo(r.at))}.</p>` : "");
const xFail = what => `<p class="empty">Couldn't load ${esc(what)}. Check your signal and try again.</p>`;
function xLogo(t, size) {
  const s = size || 26;
  if (t && t.logo) return `<img class="x-logo" src="${esc(t.logo)}" alt="" loading="lazy" style="width:${s}px;height:${s}px" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'x-logo x-ph',textContent:${esc(JSON.stringify((t && t.abbr) || ""))}}))">`;
  return `<span class="x-logo x-ph" style="width:${s}px;height:${s}px;background:${esc((t && t.color) || "#4a5568")};color:${contrast((t && t.color) || "#4a5568")}">${esc((t && t.abbr) || "")}</span>`;
}
const xDay = iso => X.when(iso).split(" · ")[0].replace(/^\w+, /, "");
const xTeamBtn = t => `data-team="${esc(t.id)}" aria-label="${esc(t.name)}: team page"`;

/* ---------- the Standings tab ---------- */
let xSeq = 0;
function renderLeague() {
  const v = $("#view"), sp = X.sport(S.sport), n = ++xSeq, live = () => n === xSeq && document.body.contains(v);
  if (S.team) return renderTeamPage(v, live);
  const sub = S.lsub === "playoffs" ? "playoffs" : "standings";
  v.innerHTML = `<div class="pills x-sub" role="group" aria-label="Show"><button class="pill" data-lsub="standings" aria-pressed="${sub === "standings"}">Standings</button><button class="pill" data-lsub="playoffs" aria-pressed="${sub === "playoffs"}">Playoff picture</button></div><div id="lv"><p class="status">Loading ${esc(sp.name)}…</p></div>`;
  v.querySelectorAll("[data-lsub]").forEach(b => b.onclick = () => { S.lsub = b.dataset.lsub; store("gp.lsub", S.lsub); render(); });
  (sub === "playoffs" ? renderPlayoffPicture : renderStandingsTable)(v.querySelector("#lv"), live);
}
function xWire(root) { root.querySelectorAll("[data-team]").forEach(b => b.onclick = () => openTeamPage(b.dataset.team)); }

async function renderStandingsTable(v, live) {
  const sp = X.sport(S.sport); let r;
  try { r = await xStandings(S.sport); } catch (_) { if (live()) v.innerHTML = xFail(sp.name + " standings"); return; }
  if (!live()) return;
  if (!r.v.length) { v.innerHTML = `<p class="empty">No ${esc(sp.name)} standings yet.</p>`; return; }
  const cols = sp.ot ? [["W", "w"], ["L", "l"], ["OTL", "otl"], ["PTS", "pts"]] : [["W", "w"], ["L", "l"]].concat(sp.ties ? [["T", "ties"]] : []).concat([["PCT", "pct"], ["GB", "gb"]]);
  const cut = sp.seeds + (sp.playIn ? 2 : 0);
  v.innerHTML = xStale(r) + r.v.map(g => `<div class="card x-card"><h3>${esc(g.name)}</h3><table class="x-st"><thead><tr><th></th><th>Team</th>${cols.map(c => `<th>${c[0]}</th>`).join("")}<th class="x-hide">Strk</th></tr></thead><tbody>
    ${g.teams.map((t, i) => `<tr class="${i === cut ? "x-cut" : ""}"><td class="x-rk">${i + 1}</td><td class="x-tm"><button class="x-tmbtn" type="button" ${xTeamBtn(t)}>${xLogo(t)}<b>${esc(t.short || t.name)}</b></button></td>
      ${cols.map(c => `<td>${c[1] === "pct" ? X.pctText(t.pct) : esc(t[c[1]] == null ? "" : t[c[1]])}</td>`).join("")}<td class="x-hide"><span class="x-strk ${esc((t.streak || "")[0] || "")}">${esc(t.streak)}</span></td></tr>`).join("")}</tbody></table></div>`).join("")
    + `<p class="x-note">Dashed line: the playoff cut (${sp.playIn ? "with the Play-In" : "top " + sp.seeds + " per " + sp.unit}). Tap a team for its schedule and results.</p>`;
  xWire(v);
}

async function renderPlayoffPicture(v, live) {
  const sp = X.sport(S.sport); let r, now = null;
  try { [r, now] = await Promise.all([xStandings(S.sport), xNow(S.sport).catch(() => null)]); } catch (_) { if (live()) v.innerHTML = xFail(sp.name + " standings"); return; }
  if (!live()) return;
  const type = now && now.v.type;
  const head = type === 3 ? `<p class="x-note">The ${esc(sp.name)} playoffs are on. Every playoff game and series score is on <b>Make picks</b>.</p>`
    : type === 4 ? `<p class="x-note">The ${esc(sp.name)} season is over. These were the final seeds.</p>`
    : `<p class="x-note"><b>If the playoffs started today.</b> Seeds come from the standings and change every game day.</p>`;
  const seed = t => t && t.tbd ? `<span class="x-tbd">${esc(t.tbd)}</span>` : t ? `<button class="x-seed" type="button" ${xTeamBtn(t)}><span class="x-n">${t.s}</span>${xLogo(t)}<span class="x-sn">${esc(t.short || t.name)}</span><span class="x-r">${esc(t.rec)}</span></button>` : "";
  v.innerHTML = xStale(r) + head + X.picture(r.v, S.sport).map(p => `<div class="card x-card"><h3>${esc(p.name)}</h3>
    <div class="x-round">Seeds</div>${p.seeds.map(seed).join("")}
    ${p.byes.length ? `<p class="x-note">${p.byes.length > 1 ? "Seeds " + p.byes.map(t => t.s).join(" and ") + " skip" : "The 1 seed skips"} the first round.</p>` : ""}
    ${p.playIn.length ? `<div class="x-round">Play-In</div>${p.playIn.map(m => `<div class="x-match">${seed(m[0])}<span class="x-vs">vs</span>${seed(m[1])}</div>`).join("")}<p class="x-note">7 v 8: the winner is the 7 seed. 9 v 10: the winner plays the loser of 7 v 8 for the 8 seed.</p>` : ""}
    <div class="x-round">First round</div>${p.pairs.map(m => `<div class="x-match">${seed(m[0])}<span class="x-vs">vs</span>${seed(m[1])}</div>`).join("") || `<p class="empty">Not enough teams yet.</p>`}</div>`).join("")
    + (S.sport === "nhl" ? `<p class="x-note">NHL seeds as ESPN lists them; the real bracket is set by division, so first-round pairings can differ.</p>` : "");
  xWire(v);
}

/* ---------- a team's page: record, next game (when and where), results, what's coming ---------- */
function openTeamPage(id) { if (!id) return; xCloseSheet(true); S.team = id; S.view = "league"; S.xAll = {}; try { history.pushState({ gp: "team", id }, ""); } catch (_) {} render(); window.scrollTo(0, 0); }
function closeTeamPage() { if (history.state && history.state.gp === "team") history.back(); else { S.team = null; render(); } }
function xRow(sp, id) { return xStandings(sp).then(st => { let row = null; st.v.some(g => (row = g.teams.find(t => t.id === String(id))) && (row.group = g.name)); return row; }).catch(() => null); }

async function renderTeamPage(v, live) {
  const sp = X.sport(S.sport), id = S.team, back = `<button class="x-back" type="button" id="xback">‹ Back</button>`;
  v.innerHTML = back + `<p class="status">Loading…</p>`; v.querySelector("#xback").onclick = closeTeamPage;
  let r; try { r = await xSchedule(S.sport, id); } catch (_) { if (live()) { v.innerHTML = back + xFail("this team's schedule"); v.querySelector("#xback").onclick = closeTeamPage; } return; }
  const row = await xRow(S.sport, id); if (!live()) return;
  const tv = r.v, t = tv.team, nx = tv.live[0] || tv.next;
  const fact = (b, s) => (b ? `<div class="x-fact"><b>${esc(b)}</b><small>${esc(s)}</small></div>` : "");
  const all = S.xAll || {};
  const list = (arr, fn, key, n) => arr.slice(0, all[key] ? arr.length : n).map(fn).join("") + (arr.length > n && !all[key] ? `<button class="x-more" type="button" data-more="${key}">Show all ${arr.length}</button>` : "");
  const tl = X.tally(tv.done);
  v.innerHTML = back + xStale(r) + `<div class="x-thead">${xLogo(t, 60)}<div><h2>${esc(t.name)}</h2><p>${esc(t.standing || (row && row.group) || sp.name)}</p></div><div class="x-big">${esc(t.record || (row && row.rec) || "")}</div></div>
    <div class="x-facts">${fact(row && row.home, "Home")}${fact(row && row.road, "Away")}${fact(row && row.streak, "Streak")}${fact(row && row.last10, "Last 10")}${fact(sp.ot && row && row.pts != null ? String(row.pts) : "", "Points")}${fact(row && row.diff, "Point diff")}</div>
    ${nx ? xNextCard(nx, !!tv.live[0]) : `<div class="card x-card"><h3>Next game</h3><p class="x-note">Nothing on the schedule yet${tv.done.length ? " (the season is over)" : ""}.</p></div>`}
    <div class="card x-card"><h3>Results <small>${tl.w}-${tl.l}${tl.t ? "-" + tl.t : ""}${tv.seasonLabel ? " · " + esc(tv.seasonLabel) : ""}</small></h3>${list(tv.done, xResRow, "done", 10) || `<p class="x-note">No games played yet.</p>`}</div>
    ${tv.upcoming.length > 1 ? `<div class="card x-card"><h3>Coming up</h3>${list(tv.upcoming.slice(1), xUpRow, "up", 8)}</div>` : ""}`;
  v.querySelector("#xback").onclick = closeTeamPage;
  v.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { S.xAll = Object.assign({}, S.xAll, { [b.dataset.more]: true }); render(); });
  xWire(v);
}
function xNextCard(g, isLive) {
  return `<div class="card x-card"><h3>${isLive ? "Playing now" : "Next game"}</h3>
    <div class="x-vsline">${g.atHome ? "vs" : "at"} ${xLogo(g.op, 24)} ${esc(g.op.name)}</div>
    <p class="x-note">${isLive ? `<b class="x-live">LIVE</b> · ${esc(g.detail)} · ${esc(g.me.score || 0)}-${esc(g.op.score || 0)}` : esc(X.when(g.date))}${g.tv ? " · " + esc(g.tv) : ""}</p>
    ${g.venue || g.place ? `<p class="x-note">📍 ${esc([g.venue, g.place].filter(Boolean).join(" · "))}${g.neutral ? " (neutral site)" : ""}</p>` : ""}${g.note ? `<p class="x-note x-gold">${esc(g.note)}</p>` : ""}</div>`;
}
const xResRow = g => `<div class="x-res"><span class="x-d">${esc(xDay(g.date))}</span><span class="x-wl ${esc(g.res || "T")}">${esc(g.res || "–")}</span>
  <button class="x-tmbtn x-o" type="button" ${xTeamBtn(g.op)}><span>${g.atHome ? "vs" : "@"} ${esc(g.op.short || g.op.name)}</span></button><span class="x-s">${esc(g.me.score || "")}-${esc(g.op.score || "")}</span></div>`;
const xUpRow = g => `<div class="x-res"><span class="x-d">${esc(xDay(g.date))}</span>
  <button class="x-tmbtn x-o" type="button" ${xTeamBtn(g.op)}>${xLogo(g.op, 20)}<span>${g.atHome ? "vs" : "@"} ${esc(g.op.short || g.op.name)}</span></button><span class="x-s x-dim">${esc(X.when(g.date).split(" · ")[1] || "")}</span></div>`;

/* ---------- the scouting card: record, top players, last 5, last 5 head to head ---------- */
// Press and hold a team on the pick screen (or tap "Scout this matchup"). One tab per team in the game.
function xScout(gid, side) {
  const ex = (S.extra && S.extra[S.sel] && S.extra[S.sel][gid]) || null, g = S.weeks[S.sel] && S.weeks[S.sel].games[gid];
  if (!g) return;
  let d = $("#xsheet");
  if (!d) { d = document.createElement("div"); d.id = "xsheet"; d.className = "x-sheet"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Team stats"); document.body.appendChild(d); }
  const st = { gid, side: side === "home" ? "home" : "away", ex, g, sport: S.sport };
  d._st = st; d.hidden = false; document.body.classList.add("x-noscroll");
  if (!history.state || history.state.gp !== "scout") try { history.pushState({ gp: "scout" }, ""); } catch (_) {}
  xPaintSheet(d);
}
function xCloseSheet(quiet) {
  const d = $("#xsheet"); if (!d || d.hidden) return;
  d.hidden = true; document.body.classList.remove("x-noscroll");
  if (!quiet && history.state && history.state.gp === "scout") history.back();
}
async function xPaintSheet(d) {
  const st = d._st, g = st.g, ex = st.ex, sp = st.sport;
  const me = g[st.side], op = g[st.side === "home" ? "away" : "home"], meX = ex && ex[st.side], opX = ex && ex[st.side === "home" ? "away" : "home"];
  const tab = (s, t) => `<button type="button" class="x-tab" data-side="${s}" aria-pressed="${st.side === s}"><span class="badge" style="background:${esc(t.color)};color:${contrast(t.color)}">${esc(t.abbr)}</span>${esc(t.name)}</button>`;
  d.innerHTML = `<div class="x-scrim" data-close></div><div class="x-panel"><div class="x-grab"></div>
    <div class="x-tabs">${tab("away", g.away)}<span class="x-at">at</span>${tab("home", g.home)}</div>
    <div id="xbody"><p class="status">Loading ${esc(me.city + " " + me.name)}…</p></div>
    <button type="button" class="btn x-close" data-close>Close</button></div>`;
  d.querySelectorAll("[data-close]").forEach(b => b.onclick = () => xCloseSheet());
  d.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { st.side = b.dataset.side; xPaintSheet(d); });
  const body = d.querySelector("#xbody"), mine = () => d._st === st && !d.hidden && d.contains(body);
  // the team id comes from today's scoreboard (kept in memory); fall back to the standings by abbreviation
  let id = meX && meX.id, oid = opX && opX.id, row = null, orow = null;
  try { const s = await xStandings(sp); s.v.forEach(gr => gr.teams.forEach(t => { if (t.id === id || (!id && t.abbr === me.abbr)) row = Object.assign({ group: gr.name }, t); if (t.id === oid || (!oid && t.abbr === op.abbr)) orow = t; })); } catch (_) {}
  id = id || (row && row.id); oid = oid || (orow && orow.id);
  let tv = null, older = [];
  if (id) { try { tv = (await xSchedule(sp, id)).v; } catch (_) {} }
  // head to head: this season first, then up to three older seasons until there are five
  let h2h = [];
  if (tv && oid) {
    h2h = X.headToHead([tv], oid, 5);
    for (let k = 1; h2h.length < 5 && tv.year && k <= 3; k++) { try { older.push((await xSchedule(sp, id, tv.year - k)).v); } catch (_) { break; } h2h = X.headToHead([tv].concat(older), oid, 5); }
  }
  if (!mine()) return;
  const rec = (meX && meX.records.total) || (tv && tv.team.record) || (row && row.rec) || "";
  const home = (meX && meX.records.home) || (row && row.home) || "", road = (meX && meX.records.road) || (row && row.road) || "";
  const last5 = tv ? tv.done.slice(0, 5) : [], l5 = X.tally(last5), hh = X.tally(h2h);
  const fact = (b, s) => (b ? `<div class="x-fact"><b>${esc(b)}</b><small>${esc(s)}</small></div>` : "");
  const players = (meX && meX.leaders) || [];
  const rating = players.find(p => p.rating), stats = players.filter(p => !p.rating).slice(0, 4);
  const gl = r => `<div class="x-res"><span class="x-d">${esc(xDay(r.date))}</span><span class="x-wl ${esc(r.res || "T")}">${esc(r.res || "–")}</span><span class="x-o">${r.atHome ? "vs" : "@"} ${esc(r.op.short || r.op.name)}</span><span class="x-s">${esc(r.me.score || "")}-${esc(r.op.score || "")}</span></div>`;
  body.innerHTML = `<div class="x-thead">${xLogo({ logo: (meX && meX.logo) || (tv && tv.team.logo) || "", abbr: me.abbr, color: me.color }, 48)}<div><h2>${esc(me.city + " " + me.name)}</h2><p>${esc((tv && tv.team.standing) || (row && row.group) || X.sport(sp).name)}</p></div><div class="x-big">${esc(rec)}</div></div>
    <div class="x-facts">${fact(home, "Home")}${fact(road, "Away")}${fact(row && row.streak, "Streak")}</div>
    <h4>Top players</h4>${stats.length ? `<div class="x-players">${stats.map(p => `<div class="x-pl"><b>${esc(p.value)}</b><small>${esc(p.abbr || p.stat)}</small><span>${esc(p.short || p.player)}${p.pos ? " · " + esc(p.pos) : ""}</span></div>`).join("")}</div>${rating ? `<p class="x-note">Best overall: <b>${esc(rating.player)}</b> (${esc(rating.value)})</p>` : ""}` : `<p class="x-note">${ex ? "ESPN doesn't list top players for this game." : "Top players show once the day's games load. Tap Refresh scores."}</p>`}
    <h4>Last 5 <small>${last5.length ? l5.w + "-" + l5.l + (l5.t ? "-" + l5.t : "") : ""}</small></h4>${last5.length ? last5.map(gl).join("") : `<p class="x-note">${tv ? "No games played yet this season." : "Couldn't load the schedule. Check your signal."}</p>`}
    <h4>Last 5 vs ${esc(op.name)} <small>${h2h.length ? hh.w + "-" + hh.l + (hh.t ? "-" + hh.t : "") : ""}</small></h4>${h2h.length ? h2h.map(gl).join("") : `<p class="x-note">${tv && oid ? "No games between them in the last few seasons." : "Couldn't look this up right now."}</p>`}
    ${id ? `<button type="button" class="btn small x-full" data-team="${esc(id)}">Full schedule and results</button>` : ""}`;
  body.querySelectorAll("[data-team]").forEach(b => b.onclick = () => { S.sport = sp; openTeamPage(b.dataset.team); });
}

// Where and on what channel, for a game card on the pick screen (from today's scoreboard, in memory only).
function xWhere(gid) {
  const e = S.extra && S.extra[S.sel] && S.extra[S.sel][gid]; if (!e) return "";
  const where = [e.venue, e.place].filter(Boolean).join(" · ");
  return where || e.tv || e.note ? `<div class="x-where">${e.note ? `<b class="x-gold">${esc(e.note)}</b> · ` : ""}${where ? "📍 " + esc(where) : ""}${e.tv ? (where ? " · " : "") + "📺 " + esc(e.tv) : ""}</div>` : "";
}

// Press and hold (about half a second) on a team's pick button opens the card instead of picking.
function xHold(root) {
  root.querySelectorAll(".side[data-g]").forEach(b => {
    let t = null, x0 = 0, y0 = 0;
    const clear = () => { clearTimeout(t); t = null; };
    b.addEventListener("pointerdown", e => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; clear(); t = setTimeout(() => { t = null; b.dataset.held = "1"; if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {} xScout(b.dataset.g, b.classList.contains("hm") ? "home" : "away"); }, 500); });
    b.addEventListener("pointermove", e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clear(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => b.addEventListener(ev, clear));
    b.addEventListener("contextmenu", e => e.preventDefault()); // no copy/share menu on a long press
  });
  root.querySelectorAll("[data-scout]").forEach(b => b.onclick = () => xScout(b.dataset.scout, "away"));
}

addEventListener("popstate", e => {
  const s = e.state || {};
  if (s.gp !== "scout") xCloseSheet(true);
  const id = s.gp === "team" ? s.id : null;
  if (id !== (S.team || null)) { S.team = id; if (id) S.view = "league"; render(); }
});
