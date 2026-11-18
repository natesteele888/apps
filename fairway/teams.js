/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway Phase 1 screens: getting a tournament going, joining in two taps, the setup, the draft and teams, matchups and
   picks, the chat with polls, and tee times with a calendar file. Loaded before app.js; app.js hands over its helpers as
   FW.ui and calls these when it draws a screen. Every list a golfer picks from is a plain list of big rows. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW = window.FW || {};
  const U = () => FW.ui;
  const P = FW.phase1 = {};
  const vid = () => { const u = U(), m = FW.mineGet(u.S.code) || {}; if (m.vid) return m.vid; const id = C.newPid(); FW.mineSet(u.S.code, { vid: id }); return id; };
  // Who this phone is in the tournament: the player it joined as, or the name it answered the rally with.
  function whoAmI() {
    const u = U(), m = FW.mineGet(u.S.code) || {}, ev = u.S.ev, me = u.me();
    if (me) return { id: me.id, n: me.n };
    if (m.rid && ev && ev.rally && ev.rally.r[m.rid]) return { id: m.rid, n: ev.rally.r[m.rid].n };
    const n = FW.LS.get("fw:name", ""); return n ? { id: m.rid || vid(), n } : null;
  }
  const pickRow = (attrs, title, sub, on, right) => `<button type="button" class="pk${on ? " on" : ""}" ${attrs}><span class="grow"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>${right != null ? right : `<span class="ck" aria-hidden="true"></span>`}</button>`;
  const hcText = p => (p && Number.isFinite(p.hc) ? (p.hc < 0 ? "+" + Math.abs(p.hc) : String(p.hc)) : "");

  /* ======================================================================
     GET A TOURNAMENT GOING: I'm in, Maybe or Can't, and the count
     ====================================================================== */
  P.tabGoing = function (el, ev) {
    const u = U(), esc = u.esc, r = ev.rally, st = C.rallyList(ev), m = FW.mineGet(u.S.code) || {}, mine = m.rid && r.r[m.rid];
    const name = mine ? mine.n : FW.LS.get("fw:name", ""), goal = r.goal || 12, pct = Math.min(100, Math.round((st.in / goal) * 100));
    el.innerHTML = `<div class="rally">
        <p class="eyebrow">${esc(m.org ? "You're getting it going" : "Who's in?")}</p>
        <h2 class="rdate">${esc(r.date ? C.fmtDate(r.date) : "Date to be set")}</h2>
        <p class="msg">${esc(ev.course.name)}${r.note ? " · " + esc(r.note) : ""}</p>
        <div class="rcount"><b>${st.in} in</b><span>${st.maybe} maybe · goal ${goal}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${mine ? "" : `<label class="fld"><span>Your name</span><input id="rname" maxlength="${C.NAME_MAX}" autocomplete="name" value="${esc(name)}" placeholder="First and last"></label>`}
        <div class="pick" role="group" aria-label="Your answer">
          ${pickRow('data-rs="in"', "I'm in", "", mine && mine.s === "in")}
          ${pickRow('data-rs="maybe"', "Maybe", "", mine && mine.s === "maybe")}
          ${pickRow('data-rs="out"', "Can't make it", "", mine && mine.s === "out")}
        </div>
        <p class="err" id="rerr" role="alert"></p>
        ${mine ? `<p class="msg small">You answered as <b>${esc(mine.n)}</b>.</p>` : ""}
      </div>
      ${st.list.length ? `<h2 class="sec">Answers <small>${st.list.length}</small></h2><ul class="list">${st.list.map(x => `<li class="ritem"><b>${esc(x.n)}</b><i class="chip ${x.s}">${x.s === "in" ? "In" : x.s === "maybe" ? "Maybe" : "Out"}</i></li>`).join("")}</ul>` : ""}
      <div class="row2"><button type="button" class="btn" id="rcopy">Copy invite link</button>${navigator.share ? `<button type="button" class="btn" id="rshare">Share</button>` : ""}</div>
      <p class="msg small">Send the link wherever your group talks. Fairway never posts anything for you.</p>
      ${m.org ? `<button type="button" class="btn primary block" id="rgo" ${st.in < 2 ? "disabled" : ""}>Make it official</button><p class="msg small">Everyone who's in goes on the tee sheet, four to a group. You can still add people after.</p>` : ""}`;
    const answer = s => {
      const nm = mine ? mine.n : C.cleanName(($("#rname", el) || {}).value);
      if (!nm) { $("#rerr", el).textContent = "Type your name first so everyone knows who's in."; return; }
      const id = m.rid || C.newPid();
      FW.LS.set("fw:name", nm); FW.mineSet(u.S.code, { rid: id });
      u.write({ ["rally.r." + id]: { n: nm, s, at: mine ? mine.at : Date.now() } });
    };
    $$("[data-rs]", el).forEach(b => b.onclick = () => answer(b.dataset.rs));
    const link = u.linkFor(u.S.code);
    $("#rcopy", el).onclick = async () => { try { await navigator.clipboard.writeText(link); u.toast("Link copied"); } catch (e) { u.sheet("Copy the link", `<textarea class="copybox" readonly rows="3">${esc(link)}</textarea>`); } };
    const sh = $("#rshare", el); if (sh) sh.onclick = () => navigator.share({ title: ev.name, text: "Who's in for " + ev.name + "?", url: link }).catch(() => {});
    const go = $("#rgo", el); if (go) go.onclick = () => {
      if (!confirm("Make " + ev.name + " official? Everyone who said I'm in goes on the tee sheet.")) return;
      const patch = C.officialPatch(ev);
      u.write(patch); if (m.rid && patch["p." + m.rid]) FW.mineSet(u.S.code, { me: m.rid });
      u.S.tab = C.cleanFmt(ev.fmt).kind === "solo" ? "more" : "teams"; u.toast("It's official"); u.render();
    };
  };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }

  /* ======================================================================
     JOIN IN TWO TAPS: your name, then your tees
     ====================================================================== */
  P.viewJoin = function (v, ev) {
    const u = U(), esc = u.esc, code = u.S.code, course = ev.course;
    const players = C.players(ev).sort((a, b) => a.n.localeCompare(b.n));
    const maybes = C.rallyList(ev).list.filter(x => x.s !== "out" && !ev.p[x.id]);
    const j = u.S.joinStep || { step: 1 };
    const tees = course.tees;
    let body;
    if (j.step === 1) {
      body = `<p class="stepno">Step 1 of 2</p><h2 class="jh">Tap your name</h2>
        ${players.length || maybes.length ? `<div class="pick">${players.map(p => pickRow(`data-pid="${esc(p.id)}"`, esc(p.n), "Group " + p.g, false, "")).join("")}${maybes.map(x => pickRow(`data-rid="${esc(x.id)}"`, esc(x.n), x.s === "maybe" ? "Said maybe" : "", false, "")).join("")}</div>` : ""}
        <div class="pick">${pickRow('data-new="1"', players.length || maybes.length ? "I'm not on the list" : "Type your name", "", false, "")}</div>
        ${j.typing ? `<form id="jf" autocomplete="off"><label class="fld"><span>Your name</span><input id="jn" maxlength="${C.NAME_MAX}" required value="${esc(FW.LS.get("fw:name", ""))}" placeholder="First and last"></label><button type="submit" class="btn primary block">Next</button><p class="err" id="jerr" role="alert"></p></form>` : ""}
        <button type="button" class="btn ghost block" id="watch">Just watch the board</button>`;
    } else {
      body = `<p class="stepno">Step 2 of 2</p><h2 class="jh">Your tees, ${esc(j.name.split(" ")[0])}</h2>
        <div class="pick">${tees.map(t => pickRow(`data-tee="${esc(t.id)}"`, `${u.teeDot(t)}${esc(t.name)}`, C.teeYards(course, t.id) ? C.teeYards(course, t.id).toLocaleString() + " yds" : "", false, "")).join("")}</div>
        <button type="button" class="btn ghost block" id="jback">Not ${esc(j.name.split(" ")[0])}? Go back</button>`;
    }
    v.innerHTML = `${u.topbar("Join")}<section class="pad"><div class="evhead"><h1>${esc(ev.name)}</h1><p>${esc(course.name)} · ${C.parText(course)}${ev.tt && ev.tt.date ? " · " + esc(C.fmtDate(ev.tt.date)) : ""}</p></div>${body}</section>`;
    u.wireTop(v);
    const step2 = o => { u.S.joinStep = Object.assign({ step: 2 }, o); u.render(); };
    $$("[data-pid]", v).forEach(b => b.onclick = () => step2({ pid: b.dataset.pid, name: ev.p[b.dataset.pid].n }));
    $$("[data-rid]", v).forEach(b => b.onclick = () => step2({ rid: b.dataset.rid, name: ev.rally.r[b.dataset.rid].n }));
    const nb = $("[data-new]", v); if (nb) nb.onclick = () => { u.S.joinStep = { step: 1, typing: true }; u.render(); const i = $("#jn"); if (i) i.focus(); };
    const jf = $("#jf", v); if (jf) jf.onsubmit = e => { e.preventDefault(); const nm = C.cleanName($("#jn", v).value); if (!nm) { $("#jerr", v).textContent = "Type your name so the board can show it."; return; } step2({ name: nm }); };
    const w = $("#watch", v); if (w) w.onclick = () => { u.S.joinStep = null; FW.mineSet(code, { name: ev.name, me: null, org: false }); u.openEvent(code); u.go("event", { tab: "board" }, true); };
    const bk = $("#jback", v); if (bk) bk.onclick = () => { u.S.joinStep = null; u.render(); };
    $$("[data-tee]", v).forEach(b => b.onclick = () => {
      const tee = b.dataset.tee; FW.LS.set("fw:tee", tee); FW.LS.set("fw:name", j.name);
      let pid = j.pid, patch;
      if (pid) patch = { ["p." + pid + ".tee"]: tee };
      else { pid = j.rid || C.newPid(); const g = C.openGroup(ev); patch = { ["p." + pid]: C.newPlayer(ev, { name: j.name, tee, group: g.g, start: g.st }) }; }
      u.S.joinStep = null;
      FW.mineSet(code, { name: ev.name, me: pid, org: false });
      u.openEvent(code); if (!u.S.ev) u.S.ev = ev;
      u.write(patch);
      u.S.group = null; u.go("event", { tab: "score" }, true);
      u.toast("You're in");
    });
  };

  /* ======================================================================
     SET IT UP: one question, then the usual settings, tap a row to change it
     ====================================================================== */
  const KIND = [["teams", "Teams with a draft", "Captains pick their teams"], ["scramble", "Scramble", "Draft teams that play one ball; the captain keeps the card"], ["solo", "Everyone for themselves", "Lowest score wins"], ["match", "Match play", "Head to head, hole by hole"]];
  const DETAILS = [
    ["nt", "Teams", [2, 3, 4, 5, 6, 7, 8], v => v + " teams", C.teamKind],
    ["draft", "Draft order", ["snake", "straight"], v => (v === "snake" ? "Snake" : "Straight"), C.teamKind],
    ["clk", "Pick clock", [60, 30, 300, 0], v => (v ? (v < 60 ? v + " seconds" : v / 60 + (v === 60 ? " minute" : " minutes")) : "No clock"), C.teamKind],
    ["mt", "Matchups", ["singles", "2v2", "both", "none"], v => ({ singles: "Singles", "2v2": "2v2", both: "Both", none: "None" }[v]), f => f.kind !== "solo"]
  ];
  P.setupSheet = function () {
    const u = U(), ev = u.S.ev, f = C.cleanFmt(ev.fmt);
    const draw = box => {
      $(".sheet-b", box).innerHTML = `<p class="stepno">How do you want to play?</p>
        <div class="pick">${KIND.map(([k, t, s]) => pickRow(`data-kind="${k}"`, t, s, f.kind === k)).join("")}</div>
        ${f.kind !== "solo" ? `<p class="stepno">The details · tap to change</p><div class="pick">${DETAILS.filter(d => d[4](f)).map(([k, t, , show]) => pickRow(`data-cyc="${k}"`, t, "", false, `<span class="val">${u.esc(show(f[k]))}</span>`)).join("")}</div>` : ""}
        <button type="button" class="btn primary block" id="fsave">Save</button>`;
      $$("[data-kind]", box).forEach(b => b.onclick = () => { f.kind = b.dataset.kind; draw(box); });
      $$("[data-cyc]", box).forEach(b => b.onclick = () => { const d = DETAILS.find(x => x[0] === b.dataset.cyc), o = d[2]; f[d[0]] = o[(o.indexOf(f[d[0]]) + 1) % o.length]; draw(box); });
      $("#fsave", box).onclick = () => { u.write({ fmt: C.cleanFmt(f) }); u.closeSheet(); u.toast("Saved"); };
    };
    u.sheet("Set it up", "", draw);
  };

  /* ======================================================================
     TEAMS: captains, the draft on the clock, team boards, who wins, matchups
     ====================================================================== */
  let tick = null;
  P.tabTeams = function (el, ev) {
    const u = U(), esc = u.esc, f = C.cleanFmt(ev.fmt), org = u.isOrg(), me = u.me();
    if (tick) { clearInterval(tick); tick = null; }
    const parts = [];
    if (C.teamKind(f)) {
      const st = C.draftState(ev);
      if (!st.started) parts.push(captainsHtml(ev, f, org, me));
      else if (!st.done) parts.push(draftHtml(ev, st, org, me));
      if (st.started) parts.push(boardHtml(ev), picksHtml(ev, me));
    }
    const ms = C.matchIds(ev);
    if (f.kind !== "solo" || ms.length) parts.push(matchesHtml(ev, f, org));
    if (!parts.length) parts.push(`<div class="empty"><p>Everyone for themselves</p><p class="msg">${org ? "Want teams, a draft or matchups? Change it here." : "No teams in this one. The board has the scores."}</p></div>`);
    if (org) parts.push(`<button type="button" class="btn ghost block" id="setup">Set it up: ${esc((KIND.find(k => k[0] === f.kind) || KIND[1])[1])}</button>`);
    el.innerHTML = parts.join("");
    wireTeams(el, ev, f, org, me);
    $$("[data-tsc]", el).forEach(b => b.onclick = () => { u.S.tsc = b.dataset.tsc; u.render(); });
  };
  function captainsHtml(ev, f, org, me) {
    const u = U(), esc = u.esc, list = C.players(ev).sort((a, b) => a.n.localeCompare(b.n)), sel = u.S.caps || [];
    const mine = me ? `<div class="card hcbox"><label class="fld"><span>Your handicap index (optional, for the draft)</span><input id="myhc" inputmode="decimal" maxlength="5" value="${esc(hcText(me))}" placeholder="12.4"></label></div>` : "";
    if (!org) return `${mine}<div class="empty"><p>Draft coming up</p><p class="msg">Once the captains are set, the draft runs here live. ${list.length} golfers so far.</p></div>`;
    return `${mine}<h2 class="sec">Pick ${f.nt} captains <small>${sel.length} of ${f.nt}</small></h2>
      ${list.length < f.nt + 1 ? `<p class="msg">You need at least ${f.nt + 1} golfers for ${f.nt} teams. Share the QR code first.</p>` : ""}
      <div class="row2"><button type="button" class="btn small" id="caplow">Lowest handicaps</button><button type="button" class="btn small" id="caprand">Random</button></div>
      <div class="pick">${list.map(p => pickRow(`data-cap="${esc(p.id)}"`, esc(p.n), p.hc != null ? "Index " + esc(hcText(p)) : "", sel.indexOf(p.id) >= 0)).join("")}</div>
      <button type="button" class="btn primary block" id="dstart" ${sel.length === f.nt && list.length > f.nt ? "" : "disabled"}>Start the draft</button>
      <p class="msg small">The order of the first round is random. ${f.draft === "snake" ? "Snake: it turns around every round." : "Straight: same order every round."}</p>`;
  }
  function clockText(st) { if (st.left == null) return ""; const s = Math.max(0, st.left); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function draftHtml(ev, st, org, me) {
    const u = U(), esc = u.esc, team = ev.teams[st.on], cap = ev.p[st.cap];
    const mine = me && me.id === st.cap, can = mine || org;
    return `<div class="clockcard"><div><small>Pick ${st.pick} of ${st.total} · on the clock</small><b>${esc(team.n)}</b><span>${esc(cap ? cap.n : "")}</span></div>
        ${st.clk ? `<div class="clock ${st.left != null && st.left <= 10 ? "late" : ""}" id="dclock" role="timer">${clockText(st)}</div>` : ""}</div>
      ${st.next.length ? `<p class="upnext">Up next: ${st.next.map(t => esc(ev.teams[t].n)).join(", ")}</p>` : ""}
      ${mine ? `<p class="yourpick">You're up. Tap a golfer to draft them.</p>` : org ? `<p class="msg small">You can pick for ${esc(team.n)} if their captain's phone isn't handy.</p>` : ""}
      <h2 class="sec">Available <small>${st.avail.length} · best handicap first</small></h2>
      <div class="pick" id="pool">${st.avail.map(p => pickRow(`data-draft="${esc(p.id)}" ${can ? "" : "disabled"}`, esc(p.n), p.hc != null ? "Index " + esc(hcText(p)) : "", false, can ? `<span class="go">Draft</span>` : "")).join("")}</div>`;
  }
  // How the team board counts, picked on this phone (nothing is saved to the tournament).
  const TS_LABEL = { total: "All count", best1: "Best ball", best2: "Best 2" };
  const TS_LEGEND = { total: "Each team's score is every player's to par added up.", best1: "Best ball: each hole counts the team's low score, against that golfer's par.", best2: "Best 2: each hole counts the team's two low scores added up." };
  TS_LEGEND.scr = "Scramble: each team plays one ball, and the captain's card is the team's score.";
  function boardHtml(ev) {
    const u = U(), esc = u.esc, base = C.teamBoard(ev), small = Math.min.apply(null, base.map(t => t.members.length).concat([9]));
    const opts = C.isScramble(ev) ? ["scr"] : C.TEAM_SCORING.filter(k => k === "total" || (k === "best1" ? small >= 2 : small >= 3));
    const how = C.isScramble(ev) ? "scr" : opts.indexOf(u.S.tsc) >= 0 ? u.S.tsc : "total", tb = how === "total" || how === "scr" ? base : C.teamBoard(ev, how);
    return `<h2 class="sec">Team board</h2>${opts.length > 1 ? `<div class="pills small" role="group" aria-label="How teams score">${opts.map(k => `<button type="button" class="pill" data-tsc="${k}" aria-pressed="${how === k}">${TS_LABEL[k]}</button>`).join("")}</div>` : ""}<div class="tboard">${tb.map(t => `<div class="trow"><span class="pos">${esc(t.pos)}</span><span class="tn"><b>${esc(t.name)}</b><small>${t.members.map(p => esc(p.n.split(" ")[0])).join(", ")}${t.avg != null ? " · avg " + t.avg : ""}</small></span><span class="score">${t.holes ? u.parText(t.toPar) : "<span class='tp'>–</span>"}</span></div>`).join("")}</div>
      <p class="legend">${TS_LEGEND[how]}</p>
      <div class="rosters">${tb.map(t => `<div class="roster"><h3>${esc(t.name)}</h3><ol>${t.members.map(p => `<li><button type="button" data-player="${esc(p.id)}">${esc(p.n)}${p.id === t.cap ? " <i class='chip'>C</i>" : ""}</button></li>`).join("")}</ol></div>`).join("")}</div>`;
  }
  function picksHtml(ev, me) {
    const u = U(), esc = u.esc, ids = C.teamIds(ev); if (ids.length < 2) return "";
    const locked = C.picksLocked(ev), counts = C.pickCounts(ev), tot = Object.values(counts).reduce((a, b) => a + b, 0), my = me && ev.pk && ev.pk[me.id];
    return `<h2 class="sec">Who wins? <small>${locked ? "picks are locked" : "picks lock at the first score"}</small></h2>
      <div class="pick">${ids.map(t => { const n = counts[t] || 0, pct = tot ? Math.round((n / tot) * 100) : 0; return pickRow(`data-pk="${t}" ${!me || locked ? "disabled" : ""}`, esc(ev.teams[t].n), tot ? n + (n === 1 ? " pick" : " picks") : "", my === t, `<span class="val">${tot ? pct + "%" : ""}</span>`); }).join("")}</div>
      ${!me ? `<p class="msg small">Join to make a pick. Bragging rights only.</p>` : `<p class="msg small">Bragging rights only.</p>`}`;
  }
  function matchesHtml(ev, f, org) {
    const u = U(), esc = u.esc, ids = C.matchIds(ev), nm = id => esc(ev.p[id].n.split(" ").slice(-1)[0]);
    const rows = ids.map(id => ({ id, s: C.matchStatus(ev, ev.m[id]) })).filter(x => x.s);
    const two = C.teamIds(ev).length === 2 && C.draftState(ev).done;
    return `<h2 class="sec">Matchups <small>match play${rows.some(x => x.s.a.length > 1) ? ", 2v2 is best ball" : ""}</small></h2>
      ${rows.length ? rows.map(({ id, s }) => `<div class="match"><span class="ma ${s.lead === "a" ? "lead" : ""}">${s.a.map(nm).join(" & ")}</span><span class="ms ${s.lead === "a" ? "up" : s.lead === "b" ? "dn" : ""}">${esc(s.text)}${s.played && !s.done ? `<small>thru ${s.played}</small>` : ""}</span><span class="mb ${s.lead === "b" ? "lead" : ""}">${s.b.map(nm).join(" & ")}</span>
          <span class="mbar" aria-label="Chance to win ${Math.round(s.pa * 100)}% to ${100 - Math.round(s.pa * 100)}%"><i style="width:${Math.round(s.pa * 100)}%"></i></span>
          <span class="mpct"><span>${Math.round(s.pa * 100)}%</span>${org ? `<button type="button" class="link" data-rmm="${esc(id)}">Remove</button>` : ""}<span>${100 - Math.round(s.pa * 100)}%</span></span></div>`).join("")
        : `<p class="msg">No matchups yet.${org ? "" : " The organizer sets them."}</p>`}
      ${rows.length ? `<p class="legend">Chance to win comes from the match score and the holes left, and moves with every score.</p>` : ""}
      ${org ? `<div class="row2">${two && f.mt !== "none" ? `<button type="button" class="btn small" id="automt">Pair the teams up</button>` : ""}<button type="button" class="btn small" id="addm">Add a match</button></div>` : ""}`;
  }
  function wireTeams(el, ev, f, org, me) {
    const u = U();
    const st = $("#setup", el); if (st) st.onclick = P.setupSheet;
    const hc = $("#myhc", el); if (hc) hc.onchange = () => { const v = C.cleanHc(hc.value); u.write({ ["p." + me.id + ".hc"]: v == null ? C.DELETE : v }); };
    $$("[data-cap]", el).forEach(b => b.onclick = () => { const s = u.S.caps = (u.S.caps || []).slice(), i = s.indexOf(b.dataset.cap); if (i >= 0) s.splice(i, 1); else if (s.length < f.nt) s.push(b.dataset.cap); u.render(); });
    const cl = $("#caplow", el); if (cl) cl.onclick = () => { u.S.caps = C.pickCaptains(ev, f.nt, "low"); u.render(); };
    const cr = $("#caprand", el); if (cr) cr.onclick = () => { u.S.caps = C.pickCaptains(ev, f.nt, "random"); u.render(); };
    const ds = $("#dstart", el); if (ds) ds.onclick = () => {
      const caps = (u.S.caps || []).filter(id => ev.p[id]); if (caps.length !== f.nt) return;
      for (let i = caps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = caps[i]; caps[i] = caps[j]; caps[j] = t; }
      const p = C.draftStartPatch(ev, caps); u.S.caps = null; u.write({ teams: p.teams, dr: p.dr }); u.toast("The draft is on");
    };
    $$("[data-draft]", el).forEach(b => b.onclick = () => {
      if (b.disabled) return;
      const p = C.pickPatch(u.S.ev, b.dataset.draft); if (!p) { u.toast("That pick just changed. Try again."); u.render(); return; }
      u.write(p); FW.sound && FW.sound.hit && FW.sound.hit();
    });
    const dc = $("#dclock", el);
    if (dc) tick = setInterval(() => { if (!document.body.contains(dc)) { clearInterval(tick); tick = null; return; } const s = C.draftState(u.S.ev); dc.textContent = clockText(s); dc.classList.toggle("late", s.left != null && s.left <= 10); }, 1000);
    $$("[data-pk]", el).forEach(b => b.onclick = () => { if (!b.disabled && me) u.write({ ["pk." + me.id]: b.dataset.pk }); });
    $$("[data-rmm]", el).forEach(b => b.onclick = () => { if (confirm("Remove this matchup?")) u.write({ ["m." + b.dataset.rmm]: C.DELETE }); });
    const am = $("#automt", el); if (am) am.onclick = () => {
      const kinds = f.mt === "both" ? ["singles", "2v2"] : [f.mt]; const patch = {};
      kinds.forEach(k => { const ms = C.autoMatches(u.S.ev, k); Object.keys(ms).forEach(id => { patch["m." + id] = ms[id]; }); });
      if (!Object.keys(patch).length) { u.toast("Each team needs players first."); return; }
      u.write(patch); u.toast("Matchups set");
    };
    const ad = $("#addm", el); if (ad) ad.onclick = addMatchSheet;
  }
  // Add a match: tap one or two golfers for each side.
  function addMatchSheet() {
    const u = U(), esc = u.esc, ev = u.S.ev, list = C.players(ev).sort((a, b) => a.n.localeCompare(b.n)), sides = { a: [], b: [] };
    u.sheet("Add a match", "", box => {
      const draw = () => {
        const side = sides.a.length && u.S.mside === "b" ? "b" : (u.S.mside = sides.a.length ? u.S.mside || "a" : "a");
        $(".sheet-b", box).innerHTML = `<div class="pills" role="group"><button type="button" class="pill" data-side="a" aria-pressed="${side === "a"}">Side 1 (${sides.a.length})</button><button type="button" class="pill" data-side="b" aria-pressed="${side === "b"}" ${sides.a.length ? "" : "disabled"}>Side 2 (${sides.b.length})</button></div>
          <p class="msg small">Tap one golfer for singles, two for 2v2 best ball.</p>
          <div class="pick">${list.map(p => { const on = sides[side].indexOf(p.id) >= 0, other = sides[side === "a" ? "b" : "a"].indexOf(p.id) >= 0; return pickRow(`data-mp="${esc(p.id)}" ${other ? "disabled" : ""}`, esc(p.n), other ? "On the other side" : "", on); }).join("")}</div>
          <button type="button" class="btn primary block" id="msave" ${sides.a.length && sides.b.length && sides.a.length === sides.b.length ? "" : "disabled"}>Save the match</button>`;
        $$("[data-side]", box).forEach(b => b.onclick = () => { u.S.mside = b.dataset.side; draw(); });
        $$("[data-mp]", box).forEach(b => b.onclick = () => { if (b.disabled) return; const s = sides[side], i = s.indexOf(b.dataset.mp); if (i >= 0) s.splice(i, 1); else { if (s.length >= 2) s.shift(); s.push(b.dataset.mp); } if (side === "a" && s.length && !sides.b.length && u.S.mside !== "b" && s.length === 1) { /* stay on side 1 so 2v2 is possible */ } draw(); });
        $("#msave", box).onclick = () => { u.write({ ["m." + C.newPid()]: { a: sides.a.slice(), b: sides.b.slice(), r: Math.min(ev.cur, ev.rounds) } }); u.S.mside = null; u.closeSheet(); u.toast("Match added"); };
      };
      u.S.mside = "a"; draw();
    });
  }

  /* ======================================================================
     CHAT: one chat per tournament, polls, and big moments posted by the app
     ====================================================================== */
  const CH = { code: null, off: null, list: [] };
  P.chatStart = function (code) {
    if (CH.code === code && CH.off) return;
    P.chatStop(); CH.code = code; CH.list = [];
    CH.off = FW.chatOpen(code, list => { CH.list = list; const u = U(); if (u && u.S.view === "event" && u.S.code === code) { if (u.S.tab === "chat") { seen(code); u.soft(); } else u.badge(); } }, () => { CH.err = true; });
  };
  P.chatStop = function () { if (CH.off) CH.off(); CH.off = null; CH.code = null; CH.list = []; };
  const seen = code => FW.LS.set("fw:chatseen:" + code, Date.now());
  P.unread = code => { if (CH.code !== code) return 0; const t = FW.LS.get("fw:chatseen:" + code, 0) || 0, me = (FW.mineGet(code) || {}); return CH.list.filter(m => m.at > t && m.by !== me.me && m.by !== me.rid).length; };
  P.autoPost = function (text, key) {
    const u = U(), code = u.S.code; if (!text || !code) return;
    FW.chatPost(code, key, { k: "a", n: "Fairway", t: text, at: Date.now() }).catch(() => { /* a missed shout isn't worth an error */ });
  };
  P.tabChat = function (el, ev) {
    const u = U(), esc = u.esc, who = whoAmI(), code = u.S.code;
    P.chatStart(code); seen(code);
    const time = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const msg = m => {
      if (m.k === "a") return `<li class="cm auto"><span>${esc(m.t)}</span><small>${time(m.at)}</small></li>`;
      const mine = who && m.by === who.id;
      if (m.k === "p") {
        const votes = Object.keys(m.v || {}), tot = votes.length, myv = who && m.v ? m.v[who.id] : undefined;
        return `<li class="cm poll${mine ? " mine" : ""}"><small>${esc(m.n)} asks · ${time(m.at)}</small><b>${esc(m.t)}</b><div class="pick">${m.o.map((o, i) => { const n = votes.filter(k => m.v[k] === i).length; return pickRow(`data-vote="${esc(m.id)}" data-i="${i}" ${who ? "" : "disabled"}`, esc(o), "", myv === i, `<span class="val">${tot ? Math.round((n / tot) * 100) + "%" : ""}</span>`); }).join("")}</div><small>${tot} ${tot === 1 ? "vote" : "votes"}</small></li>`;
      }
      return `<li class="cm${mine ? " mine" : ""}"><small>${esc(m.n)} · ${time(m.at)}</small><span>${esc(m.t)}</span></li>`;
    };
    el.innerHTML = `<ul class="chat" id="chatlist">${CH.list.length ? CH.list.map(msg).join("") : `<li class="cm auto"><span>Nothing here yet. Birdies, eagles and polls show up here too.</span></li>`}</ul>
      ${who ? `<form class="chatbar" id="cf" autocomplete="off"><input id="ct" maxlength="500" placeholder="Talk some trash, ${esc(who.n.split(" ")[0])}" aria-label="Message"><button type="submit" class="btn primary small">Send</button></form>
        <button type="button" class="btn ghost block" id="poll">Start a poll</button>`
      : `<p class="msg">Join the tournament to chat. You can read along.</p>`}`;
    const cl = $("#chatlist", el); if (cl && cl.lastElementChild && cl.lastElementChild.scrollIntoView && !u.S.chatKeepTop) { try { cl.lastElementChild.scrollIntoView({ block: "nearest" }); } catch (e) { /* old phones */ } }
    const cf = $("#cf", el); if (cf) cf.onsubmit = e => {
      e.preventDefault(); const t = $("#ct", el).value.trim(); if (!t) return;
      $("#ct", el).value = "";
      FW.chatPost(code, C.newPid() + C.newPid(), { k: "m", by: who.id, n: who.n, t, at: Date.now() }).catch(err => u.toast(FW.denied(err) ? "The chat isn't switched on yet." : "Couldn't send that. Check your signal.", "error"));
    };
    const pb = $("#poll", el); if (pb) pb.onclick = () => pollSheet(who);
    $$("[data-vote]", el).forEach(b => b.onclick = () => { if (b.disabled || !who) return; FW.chatVote(code, b.dataset.vote, who.id, +b.dataset.i).catch(() => u.toast("Couldn't vote. Check your signal.", "error")); });
  };
  function pollSheet(who) {
    const u = U(), code = u.S.code;
    u.sheet("Start a poll", `<form id="pf" autocomplete="off"><label class="fld"><span>Question</span><input id="pq" maxlength="200" required placeholder="Who's buying the first round?"></label>
      ${[1, 2, 3, 4].map(i => `<label class="fld"><span>Choice ${i}${i > 2 ? " (optional)" : ""}</span><input class="po" maxlength="40" ${i <= 2 ? "required" : ""}></label>`).join("")}
      <button type="submit" class="btn primary block">Post the poll</button></form>
      <button type="button" class="btn ghost block" id="pr">Power rankings at the turn</button>`, box => {
      $("#pr", box).onclick = () => {
        const tb = C.teamBoard(u.S.ev), names = (tb.length >= 2 ? tb.map(t => t.name) : C.standings(u.S.ev).slice(0, 4).map(r => r.name)).slice(0, 6);
        $("#pq", box).value = "Power rankings: who's playing best right now?"; $$(".po", box).forEach((x, i) => { x.value = names[i] || ""; });
      };
      $("#pf", box).onsubmit = e => {
        e.preventDefault(); const q = $("#pq", box).value.trim(), o = $$(".po", box).map(x => x.value.trim()).filter(Boolean);
        if (!q || o.length < 2) return;
        FW.chatPost(code, C.newPid() + C.newPid(), { k: "p", by: who.id, n: who.n, t: q, o, v: {}, at: Date.now() }).then(() => u.toast("Poll posted")).catch(() => u.toast("Couldn't post the poll.", "error"));
        u.closeSheet();
      };
    });
  }

  /* ======================================================================
     TEE TIMES: your group's time, a calendar file with four reminders, directions
     ====================================================================== */
  P.teeHtml = function (ev, org) {
    const u = U(), esc = u.esc, me = u.me(), tt = ev.tt || { date: "", where: "", g: {} }, gs = C.groups(ev);
    const myT = me ? C.teeTime(ev, me.g) : "", drive = FW.LS.get("fw:drive", 25);
    let html = `<h2 class="sec">Tee times</h2>`;
    if (me && myT && tt.date) {
      html += `<div class="teecard"><small>Your group tees off</small><b>${esc(C.fmtTime(myT))}</b><span>${esc(C.fmtDate(tt.date))} · group ${me.g}${tt.where ? " · " + esc(tt.where) : ""}</span></div>
        <div class="pick">${C.reminders(myT, drive).map(r => pickRow(`data-rem="${r.k}"`, esc(r.label), esc(remWhen(tt.date, myT, r.before)), (FW.LS.get("fw:remoff", []) || []).indexOf(r.k) < 0)).join("")}
          ${pickRow('data-drive="1"', "Your drive", "For the leave-now reminder", false, `<span class="val">${drive} min</span>`)}</div>
        <div class="row2"><button type="button" class="btn primary" id="addcal">Add to my calendar</button><a class="btn" id="dirs" href="${esc(C.directions(ev))}" target="_blank" rel="noopener">Directions</a></div>
        <p class="msg small">Puts the tee time and the reminders you left on into your phone's calendar. If the time changes, add it again.</p>`;
    } else if (gs.length && tt.date && Object.keys(tt.g).length) {
      html += `<ul class="list">${gs.filter(g => tt.g[g.g]).map(g => `<li class="ritem"><b>${esc(C.fmtTime(tt.g[g.g]))}</b><span>Group ${g.g}: ${g.players.map(p => esc(p.n.split(" ").slice(-1)[0])).join(", ")}</span></li>`).join("")}</ul>`;
    } else if (!org) html += `<p class="msg">The organizer hasn't set the tee times yet.</p>`;
    if (org) html += `<div class="card"><label class="fld"><span>Date</span><input type="date" id="ttd" value="${esc(tt.date)}"></label>
        <label class="fld"><span>Course address or name, for directions</span><input id="ttw" maxlength="80" value="${esc(tt.where)}" placeholder="${esc(ev.course.name)}"></label>
        ${gs.map(g => `<label class="fld"><span>Group ${g.g} (${g.players.map(p => esc(p.n.split(" ")[0])).join(", ")})</span><input type="time" data-ttg="${g.g}" value="${esc(tt.g[g.g] || "")}"></label>`).join("")}
        ${gs.length ? "" : `<p class="msg small">Group times show up here once people join.</p>`}</div>`;
    return html;
  };
  function remWhen(date, time, before) {
    const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number), t = new Date(y, mo - 1, d, h, mi - before);
    const day = t.getDate() !== d ? "Night before, " : "";
    return day + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  P.wireTee = function (el, ev) {
    const u = U(), me = u.me();
    $$("[data-rem]", el).forEach(b => b.onclick = () => { const off = (FW.LS.get("fw:remoff", []) || []).slice(), i = off.indexOf(b.dataset.rem); if (i >= 0) off.splice(i, 1); else off.push(b.dataset.rem); FW.LS.set("fw:remoff", off); u.render(); });
    const dr = $("[data-drive]", el); if (dr) dr.onclick = () => { const o = [15, 25, 35, 45, 60, 90], c = FW.LS.get("fw:drive", 25); FW.LS.set("fw:drive", o[(o.indexOf(c) + 1) % o.length]); u.render(); };
    const ac = $("#addcal", el); if (ac) ac.onclick = () => {
      const ics = C.icsFor(ev, me.g, { drive: FW.LS.get("fw:drive", 25), uid: u.S.code, link: u.linkFor(u.S.code), off: FW.LS.get("fw:remoff", []) });
      if (!ics) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "tee-time.ics";
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      u.toast("Open the file to add it to your calendar");
    };
    const d = $("#ttd", el); if (d) d.onchange = () => u.write({ "tt.date": C.isDate(d.value) ? d.value : "" });
    const w = $("#ttw", el); if (w) w.onchange = () => u.write({ "tt.where": w.value.trim().slice(0, 80) });
    $$("[data-ttg]", el).forEach(i => i.onchange = () => u.write({ ["tt.g." + i.dataset.ttg]: C.isTime(i.value) ? i.value : C.DELETE }));
  };
})();
