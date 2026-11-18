/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway: the screens. Home (get one going, start, join, demo, your tournaments and courses), a new tournament, the
   course builder, joining from a QR code or link, and a tournament's five tabs: Board (leaders, hole by hole, field and
   course), Score, Teams, Chat and Share. While a tournament is still being got going it shows Going, Chat and Share.
   Tapping a player anywhere opens their card, which flips over to their stats, their scorecard and their earlier rounds.
   The Phase 1 screens (going, join, setup, draft, teams, matchups, chat, tee times) live in teams.js. */
(function () {
  "use strict";
  const C = window.FairwayCore, FW = window.FW;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BASE = location.origin + location.pathname.replace(/index\.html$/, "");
  const linkFor = code => BASE + "?t=" + code;
  const hex = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#f4f4ef");
  const light = c => { const n = parseInt(hex(c).slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 160; };
  const initials = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const S = {
    view: "home", code: null, ev: null, place: null, live: "", unsub: null, tab: "board", boardMode: "leaders", boardRound: null,
    fieldMode: "place", group: null, hole: null, scoreRound: null, draft: null, draftFrom: "home", card: null, needRender: false
  };
  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    board: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M8 9v11" stroke="currentColor" stroke-width="2"/></svg>',
    field: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3l10 4-10 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    score: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l1-4L16 5l3 3L9 18l-4 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    course: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20c3-6 6-2 8-8s5-8 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="17" r="2.2" fill="currentColor"/></svg>',
    teams: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 19c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M13.5 14.6c.9-.4 1.9-.6 3-.6 2.4 0 4.2 1.4 4.8 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    games: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" stroke="currentColor" stroke-width="1.6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    going: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="4" width="6" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" stroke="currentColor" stroke-width="2"/></svg>'
  };

  /* ---------- toasts and sheets ---------- */
  function toast(msg, kind) {
    const t = document.createElement("div"); t.className = "toast " + (kind || ""); t.textContent = msg;
    $("#toasts").appendChild(t); setTimeout(() => t.classList.add("out"), 3200); setTimeout(() => t.remove(), 3700);
  }
  function sheet(title, html, onOpen) {
    const box = $("#sheets");
    box.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><h2>${esc(title)}</h2><button type="button" class="x" data-close aria-label="Close">×</button></div><div class="sheet-b">${html}</div></div>`;
    $$("[data-close]", box).forEach(b => b.onclick = closeSheet);
    if (onOpen) onOpen($(".sheet", box));
  }
  function closeSheet() { const v = $("#sheets video"); if (v && v.srcObject) v.srcObject.getTracks().forEach(t => t.stop()); $("#sheets").innerHTML = ""; }

  /* ---------- navigation (the phone's Back button walks back through screens) ---------- */
  function go(view, o, replace) {
    Object.assign(S, o || {});
    if (view !== "event") stopLive();
    S.view = view;
    const url = view === "event" || view === "join" ? "?t=" + S.code : location.pathname;
    try { history[replace ? "replaceState" : "pushState"]({ fw: view, code: S.code, tab: S.tab }, "", url); } catch (e) { /* file:// or sandbox */ }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", e => {
    if (S.card) { closeCard(true); return; }
    if ($("#sheets").innerHTML) closeSheet();
    const st = e.state || {};
    if (st.fw === "event" && st.code) { S.tab = st.tab || "board"; if (S.code !== st.code || !S.unsub) openEvent(st.code); S.view = "event"; render(); return; }
    if (st.fw === "join" && st.code) { S.code = st.code; S.view = "join"; render(); return; }
    stopLive(); S.view = st.fw && st.fw !== "event" ? st.fw : "home"; render();
  });

  /* ---------- the live connection to one tournament ---------- */
  function stopLive() { if (S.unsub) { S.unsub(); S.unsub = null; } FW.phase1.chatStop(); }
  function openEvent(code) {
    stopLive();
    const m = FW.mineGet(code);
    S.code = code; S.place = m && m.local ? FW.local : FW.cloud; S.ev = FW.cacheGet(code);
    S.live = S.place === FW.local ? "local" : "connecting";
    S.group = null; S.hole = null; S.scoreRound = null; S.boardRound = null;
    S.unsub = S.place.open(code, (ev, meta) => {
      if (!ev) { if (S.place === FW.local || !(meta && meta.cache)) S.live = "gone"; soft(); return; }
      S.ev = ev; FW.cacheSet(code, ev); FW.historyKeep(code, ev); FW.mineSet(code, { name: ev.name });
      if (S.place === FW.cloud) S.live = meta && meta.pending ? "saving" : meta && meta.cache ? "offline" : "live";
      soft();
    }, err => { S.live = FW.denied(err) ? "denied" : "error"; window.nateHealth && nateHealth.note("sync", "tournament link: " + (err && (err.code || err.message))); soft(); });
    FW.phase1.chatStart(code);
  }
  // A new copy arrived: redraw, unless someone is typing (then redraw once they're done).
  function soft() {
    const a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && $("#view").contains(a)) { S.needRender = true; return; }
    render();
    if (S.card) drawCard(false);
  }
  document.addEventListener("focusout", () => setTimeout(() => { if (S.needRender && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) { S.needRender = false; render(); } }, 0));

  async function write(patch, quiet) {
    if (!S.ev) return;
    S.ev = C.cleanEvent(C.applyPatch(S.ev, patch)); render(); if (S.card) drawCard(false);
    try {
      const r = await S.place.patch(S.code, patch);
      if (r === "pending" && !quiet) S.live = "saving";
    } catch (e) {
      if (FW.denied(e)) { S.live = "denied"; toast("The shared scoreboard refused that change. It's saved on this phone only.", "error"); }
      else toast("Couldn't save that. Check your signal and try again.", "error");
      window.nateHealth && nateHealth.note("sync", "save: " + (e && (e.code || e.message)));
      render();
    }
  }

  /* ---------- pieces ---------- */
  const parText = n => `<span class="tp ${C.tone(n)}">${esc(C.fmtPar(n))}</span>`;
  function soundBtn() {
    if (!FW.sound || !FW.sound.supported) return "";
    const on = FW.sound.on;
    return `<button type="button" class="iconbtn sound" id="snd" aria-pressed="${on}" aria-label="${on ? "Turn off the course sounds" : "Turn on the course sounds"}">${on ? ICON.on : ICON.off}</button>`;
  }
  document.addEventListener("fw-sound", () => { const b = $("#snd"); if (b) b.outerHTML = soundBtn(), wireSound(); });
  function wireSound() { const b = $("#snd"); if (b) b.onclick = () => { const on = FW.sound.toggle(); toast(on ? "Course sounds on" : "Course sounds off"); }; }
  function liveBadge() {
    const L = { live: ["live", "Live"], saving: ["saving", "Saving…"], offline: ["offline", "No signal: saved here"], connecting: ["saving", "Connecting…"], local: ["local", "This phone only"], denied: ["local", "This phone only"], error: ["offline", "Can't reach the scoreboard"], gone: ["offline", "Not found"] }[S.live] || ["saving", ""];
    return `<button type="button" class="live ${L[0]}" id="livebtn"><i></i>${esc(L[1])}</button>`;
  }
  function liveExplain() {
    const t = {
      local: "This tournament is on this phone only. Pass the phone around to score, or show the board on it.",
      denied: "The shared scoreboard isn't switched on yet, so this tournament is on this phone only. Pass the phone around to score.",
      offline: "No signal right now. Scores you enter are saved on this phone and go up by themselves when the signal comes back.",
      saving: "Sending your latest scores. They're already saved on this phone.",
      live: "Live: every phone in this tournament sees each score a moment after it's entered.",
      error: "Can't reach the shared scoreboard. What you enter is kept on this phone.",
      gone: "This tournament isn't on the shared scoreboard. It may have been started on another phone in this-phone-only mode."
    }[S.live] || "Connecting to the shared scoreboard.";
    sheet("Scoreboard status", `<p class="msg">${esc(t)}</p>`);
  }
  function teeDot(t) { return `<span class="tdot" style="background:${hex(t && t.color)}" aria-hidden="true"></span>`; }
  function teeLabel(course, t) { const y = C.teeYards(course, t.id); return `${teeDot(t)}${esc(t.name)}${y ? ` <small>${y.toLocaleString()} yds</small>` : ""}`; }
  function me() {
    const m = FW.mineGet(S.code); if (!m || !S.ev) return null;
    const id = m.me && S.ev.p[m.me] ? m.me : m.rid && S.ev.p[m.rid] ? m.rid : null;
    return id ? Object.assign({ id }, S.ev.p[id]) : null;
  }
  const isOrg = () => { const m = FW.mineGet(S.code); return !!(m && m.org); };
  function statusText(x) { return x.done ? "F" : x.thru ? "Thru " + x.thru : "Tee " + (x.order[0] || 1); }

  /* ======================================================================
     HOME
     ====================================================================== */
  function viewHome(v) {
    const mine = FW.mine(), courses = FW.courses();
    v.innerHTML = `<header class="hero"><div class="hero-top"><span></span>${soundBtn()}</div>
      <div class="crest" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 48V14l16 7-16 7" fill="currentColor"/><ellipse cx="32" cy="48" rx="13" ry="3" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>
      <h1>Fairway</h1><p class="tag">Live golf tournament scoring</p></header>
      <section class="pad">
        <button type="button" class="btn primary block" id="rally">Get a tournament going</button>
        <button type="button" class="btn block" id="new">Start one now</button>
        <button type="button" class="btn block" id="join">Join a tournament</button>
        <button type="button" class="btn ghost block" id="demo">See the demo board</button>
      </section>
      ${mine.length ? `<section class="pad"><h2 class="sec">Your tournaments</h2><ul class="list">${mine.map(m => {
        const ev = FW.cacheGet(m.code);
        const sub = ev ? `${esc(ev.course.name)} · ${C.players(ev).length} players` : "Tap to open";
        return `<li><button type="button" class="row" data-open="${esc(m.code)}"><span><b>${esc((ev && ev.name) || m.name || "Tournament")}</b><small>${sub}</small></span><span class="chips">${m.demo ? '<i class="chip">Demo</i>' : ""}${m.org ? '<i class="chip">Yours</i>' : ""}${m.local && !m.demo ? '<i class="chip">This phone</i>' : ""}</span></button></li>`;
      }).join("")}</ul></section>` : ""}
      <section class="pad"><h2 class="sec">Courses</h2><ul class="list">
        <li><button type="button" class="row" data-course="sample"><span><b>${esc(C.sampleCourse().name)}</b><small>18 holes · par 72 · 4 tees</small></span><i class="chip">Sample</i></button></li>
        ${courses.map(c => `<li><button type="button" class="row" data-course="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${c.holes.length} holes · par ${C.coursePar(c)} · ${c.tees.length} tee${c.tees.length > 1 ? "s" : ""}</small></span></button></li>`).join("")}
      </ul><button type="button" class="btn ghost block" id="build">Build a course</button></section>
      <footer class="foot"><button type="button" class="link" onclick="window.nateHealth&&nateHealth.report()">Something wrong?</button><small>${esc(C.VERSION)}</small></footer>`;
    $("#new", v).onclick = () => go("new", { newMode: "now" });
    $("#rally", v).onclick = () => go("new", { newMode: "rally" });
    $("#join", v).onclick = joinSheet;
    $("#demo", v).onclick = openDemo;
    $("#build", v).onclick = () => editCourse(null);
    $$("[data-open]", v).forEach(b => b.onclick = () => { openEvent(b.dataset.open); go("event", { tab: "board" }); });
    $$("[data-course]", v).forEach(b => b.onclick = () => editCourse(b.dataset.course === "sample" ? "sample" : b.dataset.course));
    wireSound();
  }
  function openDemo() {
    let m = FW.mine().find(x => x.demo);
    if (!m) {
      const code = C.newCode();
      FW.local.create(code, C.demoEvent());
      m = FW.mineSet(code, { name: "Demo", local: true, demo: true, org: true, me: null });
    }
    openEvent(m.code); go("event", { tab: "board" });
  }

  /* ---------- joining: the phone's camera, this app's scanner, or a pasted link ---------- */
  function codeFrom(text) {
    const s = String(text || "").trim(), m = /[?&]t=([a-z2-7]{20})\b/.exec(s);
    return m ? m[1] : C.isCode(s.toLowerCase()) ? s.toLowerCase() : null;
  }
  function joinSheet() {
    const canScan = "BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    sheet("Join a tournament", `<p class="msg">Point your phone's camera at the tournament's QR code and tap the link. Or:</p>
      ${canScan ? `<button type="button" class="btn primary block" id="scan">Scan the QR code here</button><div id="scanbox"></div>` : ""}
      <label class="fld"><span>Paste the link or code</span><input id="paste" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="natesteele888.github.io/apps/fairway/?t=…"></label>
      <button type="button" class="btn block" id="go">Open</button><p class="err" id="perr" role="alert"></p>`, box => {
      $("#go", box).onclick = () => { const c = codeFrom($("#paste", box).value); if (!c) { $("#perr", box).textContent = "That isn't a tournament link. It ends with ?t= and 20 letters and numbers."; return; } closeSheet(); startJoin(c); };
      $("#paste", box).onkeydown = e => { if (e.key === "Enter") $("#go", box).click(); };
      if (canScan) $("#scan", box).onclick = () => scan($("#scanbox", box));
    });
  }
  async function scan(box) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
    catch (e) { box.innerHTML = `<p class="err">The camera didn't open. Use your phone's own camera app on the QR code instead.</p>`; return; }
    box.innerHTML = `<video class="scanv" playsinline muted></video><p class="msg">Hold the QR code inside the frame.</p>`;
    const vid = $("video", box); vid.srcObject = stream; vid.play().catch(() => {});
    const det = new window.BarcodeDetector({ formats: ["qr_code"] });
    const t = setInterval(async () => {
      if (!document.body.contains(vid)) { clearInterval(t); stream.getTracks().forEach(x => x.stop()); return; }
      try { const r = await det.detect(vid); const c = r.length && codeFrom(r[0].rawValue); if (c) { clearInterval(t); closeSheet(); startJoin(c); } } catch (e) { /* next frame */ }
    }, 300);
  }
  function startJoin(code) {
    if (FW.mineGet(code)) { openEvent(code); go("event", { tab: "board" }); return; }
    S.code = code; S.ev = null; S.live = "connecting"; S.joinStep = null; go("join");
  }

  /* ======================================================================
     JOIN: who are you, which tees, which group
     ====================================================================== */
  async function viewJoin(v) {
    const code = S.code;
    if (!S.ev || S.evCode !== code) {
      v.innerHTML = `${topbar("Joining…")}<section class="pad"><p class="msg">Opening the tournament…</p></section>`; wireTop(v);
      try {
        const ev = await FW.cloud.get(code);
        if (S.view !== "join" || S.code !== code) return;
        if (!ev) { S.joinErr = "gone"; } else { S.ev = ev; S.evCode = code; S.joinErr = null; }
      } catch (e) { if (S.view !== "join") return; S.joinErr = FW.denied(e) ? "denied" : "offline"; }
      if (S.joinErr) {
        const msg = { gone: "This tournament isn't on the shared scoreboard. Ask whoever started it for a fresh QR code.", denied: "The shared scoreboard isn't switched on yet, so tournaments can't be joined from another phone. Whoever started it can run it on their phone for now.", offline: "Couldn't reach the scoreboard. Check your signal and try again." }[S.joinErr];
        v.innerHTML = `${topbar("Join")}<section class="pad"><p class="msg">${esc(msg)}</p><button type="button" class="btn block" id="retry">Try again</button></section>`;
        wireTop(v); $("#retry", v).onclick = () => { S.evCode = null; render(); }; return;
      }
    }
    const ev = S.ev;
    if (ev.rally && ev.rally.on) { FW.mineSet(code, { name: ev.name, me: null, org: false }); openEvent(code); go("event", { tab: "going" }, true); return; }
    FW.phase1.viewJoin(v, ev);
  }
  function topbar(title, right) { return `<div class="top"><button type="button" class="iconbtn" id="back" aria-label="Back">${ICON.back}</button><h1>${esc(title)}</h1>${right || "<span></span>"}</div>`; }
  function wireTop(v) { const b = $("#back", v); if (b) b.onclick = () => { if (history.state && history.state.fw && history.length > 1) history.back(); else go("home", {}, true); }; wireSound(); const l = $("#livebtn", v); if (l) l.onclick = liveExplain; }

  /* ======================================================================
     NEW TOURNAMENT
     ====================================================================== */
  function viewNew(v) {
    const courses = [C.sampleCourse()].concat(FW.courses());
    const pick = S.newCourse && courses.some(c => c.id === S.newCourse) ? S.newCourse : courses[courses.length > 1 ? 1 : 0].id;
    const rally = S.newMode === "rally", kind = S.newKind || "teams";
    v.innerHTML = `${topbar(rally ? "Get one going" : "New tournament", soundBtn())}<form class="pad" id="nf" autocomplete="off">
      ${rally ? `<p class="msg">Throw out a date and see who's in. Make it official once enough people are.</p>` : ""}
      <label class="fld"><span>Tournament name</span><input id="nn" maxlength="${C.EVENT_MAX}" required placeholder="Saturday Scramble"></label>
      ${rally ? `<label class="fld"><span>Date</span><input type="date" id="nd"></label>
        <label class="fld"><span>How many do you want?</span><input id="ngoal" type="number" min="2" max="120" inputmode="numeric" value="12"></label>
        <label class="fld"><span>A note for everyone (optional)</span><input id="nnote" maxlength="140" placeholder="Morning tee time, captains and a draft if we get 12"></label>` : ""}
      <p class="stepno">How do you want to play?</p>
      <div class="pick" id="nkind">${[["teams", "Teams with a draft", "Captains pick their teams"], ["solo", "Everyone for themselves", "Lowest score wins"], ["match", "Match play", "Head to head, hole by hole"]].map(([k, t, d]) => `<button type="button" class="pk${kind === k ? " on" : ""}" data-nk="${k}"><span class="grow"><b>${t}</b><small>${d}</small></span><span class="ck" aria-hidden="true"></span></button>`).join("")}</div>
      <fieldset class="fld"><legend>Course</legend><div class="opts">${courses.map(c => `<label class="opt"><input type="radio" name="course" value="${esc(c.id)}" ${c.id === pick ? "checked" : ""}><span><b>${esc(c.name)}</b><small>${c.holes.length} holes · par ${C.coursePar(c)} · ${c.tees.map(t => esc(t.name)).join(", ")}</small></span></label>`).join("")}</div>
        <button type="button" class="btn ghost small" id="nb">Build a new course</button></fieldset>
      <fieldset class="fld"><legend>Rounds</legend><div class="seg" role="radiogroup">${[1, 2, 3, 4].map(n => `<label><input type="radio" name="rounds" value="${n}" ${n === 1 ? "checked" : ""}><span>${n}</span></label>`).join("")}</div></fieldset>
      <fieldset class="fld"><legend>Are you playing?</legend>
        <label class="fld"><span>Your name (leave empty if you're only running it)</span><input id="nme" maxlength="${C.NAME_MAX}" value="${esc(FW.LS.get("fw:name", ""))}"></label>
        <div id="ntees"></div></fieldset>
      <button type="submit" class="btn primary block">${rally ? "Get it going" : "Start and get the QR code"}</button><p class="err" id="nerr" role="alert"></p></form>`;
    $$("[data-nk]", v).forEach(b => b.onclick = () => { S.newKind = b.dataset.nk; $$("[data-nk]", v).forEach(x => x.classList.toggle("on", x === b)); });
    wireTop(v);
    const drawTees = () => {
      const c = courses.find(x => x.id === ($("input[name=course]:checked", v) || {}).value) || courses[0];
      const last = FW.LS.get("fw:tee", null), sel = c.tees.some(t => t.id === last) ? last : c.tees[Math.min(1, c.tees.length - 1)].id;
      $("#ntees", v).innerHTML = `<div class="tees">${c.tees.map(t => `<label class="tee"><input type="radio" name="ntee" value="${esc(t.id)}" ${t.id === sel ? "checked" : ""}><span>${teeLabel(c, t)}</span></label>`).join("")}</div>`;
    };
    $$("input[name=course]", v).forEach(r => r.onchange = () => { S.newCourse = r.value; drawTees(); }); drawTees();
    $("#nb", v).onclick = () => editCourse(null, "new");
    $("#nf", v).onsubmit = async e => {
      e.preventDefault();
      const btn = $("button[type=submit]", v); btn.disabled = true;
      const course = courses.find(x => x.id === ($("input[name=course]:checked", v) || {}).value) || courses[0];
      const ev = C.newEvent({ name: $("#nn", v).value, course, rounds: +($("input[name=rounds]:checked", v) || {}).value || 1 });
      const code = C.newCode(), name = C.cleanName($("#nme", v).value);
      ev.fmt = C.cleanFmt({ kind: S.newKind || "teams", nt: 2 });
      let pid = null, rid = null;
      if (rally) {
        const date = ($("#nd", v) || {}).value || "";
        ev.rally = C.cleanRally({ on: true, date, goal: $("#ngoal", v).value, note: $("#nnote", v).value, r: {} });
        if (C.isDate(date)) ev.tt = { date, where: "", g: {} };
        if (name) { rid = C.newPid(); ev.rally.r[rid] = { n: name, s: "in", at: Date.now() }; FW.LS.set("fw:name", name); }
      } else if (name) { pid = C.newPid(); ev.p[pid] = C.newPlayer(ev, { name, tee: ($("input[name=ntee]:checked", v) || {}).value, group: 1, start: 1 }); FW.LS.set("fw:name", name); FW.LS.set("fw:tee", ev.p[pid].tee); }
      let local = false;
      try { await FW.cloud.create(code, ev); }
      catch (err) {
        local = true;
        try { await FW.local.create(code, ev); } catch (e2) { btn.disabled = false; $("#nerr", v).textContent = "This phone's storage is full, so the tournament couldn't be saved."; return; }
        toast(FW.denied(err) ? "The shared scoreboard isn't switched on yet, so this one runs on this phone." : "No signal, so this one runs on this phone for now.");
      }
      FW.mineSet(code, Object.assign({ name: ev.name, me: pid, org: true, local }, rid ? { rid } : {}));
      FW.cacheSet(code, ev); S.newKind = null;
      openEvent(code); go("event", { tab: rally ? "going" : "more" }, true);
    };
  }

  /* ======================================================================
     COURSE BUILDER
     ====================================================================== */
  function editCourse(id, from) {
    const base = id === "sample" ? C.sampleCourse() : id ? FW.courses().find(c => c.id === id) : null;
    const c = base ? JSON.parse(JSON.stringify(base)) : { name: "", tees: [{ id: "blue", name: "Blue", color: C.TEE_COLORS.blue }, { id: "white", name: "White", color: C.TEE_COLORS.white }], holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, hcp: i + 1, y: {} })) };
    if (base && base.sample) { c.name = ""; delete c.sample; delete c.id; S.draftNote = "A copy of the sample course. Change the name, pars and yardages to match yours."; } else S.draftNote = "";
    S.draft = c; S.draftFrom = from || "home";
    go("course");
  }
  function viewCourse(v) {
    const c = S.draft; if (!c) { go("home", {}, true); return; }
    const n = c.holes.length, tot = c.tees.map(t => c.holes.reduce((a, h) => a + (+(h.y || {})[t.id] || 0), 0));
    const colorOpts = sel => Object.keys(C.TEE_COLORS).map(k => `<option value="${C.TEE_COLORS[k]}" ${C.TEE_COLORS[k] === sel ? "selected" : ""}>${k[0].toUpperCase() + k.slice(1)}</option>`).join("");
    v.innerHTML = `${topbar(c.id ? "Edit course" : "Build a course", soundBtn())}<form class="pad" id="cf" autocomplete="off">
      ${S.draftNote ? `<p class="msg">${esc(S.draftNote)}</p>` : ""}
      <label class="fld"><span>Course name</span><input id="cn" maxlength="60" required value="${esc(c.name)}" placeholder="Pine Hollow"></label>
      <fieldset class="fld"><legend>Holes</legend><div class="seg">${[9, 18].map(k => `<label><input type="radio" name="nh" value="${k}" ${k === n ? "checked" : ""}><span>${k}</span></label>`).join("")}</div></fieldset>
      <fieldset class="fld"><legend>Tee boxes</legend><div class="teeedit">${c.tees.map((t, i) => `<div class="teerow" data-i="${i}">${teeDot(t)}<input aria-label="Tee name" class="tname" maxlength="16" value="${esc(t.name)}"><select aria-label="Tee color" class="tcol">${colorOpts(t.color)}</select>${c.tees.length > 1 ? `<button type="button" class="x" data-rmtee="${i}" aria-label="Remove ${esc(t.name)} tees">×</button>` : ""}</div>`).join("")}</div>
        ${c.tees.length < C.MAX_TEES ? `<button type="button" class="btn ghost small" id="addtee">Add a tee box</button>` : ""}</fieldset>
      <h2 class="sec">Scorecard <small>par ${c.holes.reduce((a, h) => a + h.par, 0)}${tot.some(Boolean) ? " · " + c.tees.map((t, i) => esc(t.name) + " " + tot[i].toLocaleString()).join(" · ") : ""}</small></h2>
      <p class="msg">Par and yards for each tee, from the course's own scorecard. Handicap (Hcp) is the hole's difficulty rank, 1 the hardest.</p>
      <div class="cardwrap" data-keep="cedit"><table class="cedit"><thead><tr><th>Hole</th><th>Par</th><th>Hcp</th>${c.tees.map(t => `<th>${teeDot(t)}${esc(t.name)}</th>`).join("")}</tr></thead><tbody>
        ${c.holes.map((h, i) => `<tr data-h="${i}"><th>${i + 1}</th><td><select class="par" aria-label="Hole ${i + 1} par">${[3, 4, 5, 6].map(p => `<option ${p === h.par ? "selected" : ""}>${p}</option>`).join("")}</select></td><td><input class="hcp" inputmode="numeric" aria-label="Hole ${i + 1} handicap" value="${esc(h.hcp)}"></td>${c.tees.map(t => `<td><input class="yd" inputmode="numeric" data-t="${esc(t.id)}" aria-label="Hole ${i + 1} ${esc(t.name)} yards" value="${esc((h.y || {})[t.id] || "")}"></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
      <button type="submit" class="btn primary block">Save course</button>
      ${c.id ? `<button type="button" class="btn danger ghost block" id="cdel">Remove this course from this phone</button>` : ""}
      <p class="err" id="cerr" role="alert"></p></form>`;
    wireTop(v);
    const read = () => {
      c.name = $("#cn", v).value;
      $$(".teerow", v).forEach(r => { const t = c.tees[+r.dataset.i]; t.name = $(".tname", r).value; t.color = $(".tcol", r).value; });
      $$("tr[data-h]", v).forEach(r => { const h = c.holes[+r.dataset.h]; h.par = +$(".par", r).value; h.hcp = +$(".hcp", r).value || h.hcp; h.y = h.y || {}; $$(".yd", r).forEach(inp => { const y = parseInt(inp.value, 10); if (y > 0) h.y[inp.dataset.t] = Math.min(800, y); else delete h.y[inp.dataset.t]; }); });
    };
    $$("input[name=nh]", v).forEach(r => r.onchange = () => { read(); const k = +r.value; while (c.holes.length < k) c.holes.push({ par: 4, hcp: c.holes.length + 1, y: {} }); c.holes.length = k; render(); });
    const addT = $("#addtee", v); if (addT) addT.onclick = () => { read(); const used = c.tees.map(t => t.color), k = Object.keys(C.TEE_COLORS).find(x => used.indexOf(C.TEE_COLORS[x]) < 0) || "white"; c.tees.push({ id: k + (c.tees.some(t => t.id === k) ? c.tees.length : ""), name: k[0].toUpperCase() + k.slice(1), color: C.TEE_COLORS[k] }); render(); };
    $$("[data-rmtee]", v).forEach(b => b.onclick = () => { read(); const t = c.tees.splice(+b.dataset.rmtee, 1)[0]; c.holes.forEach(h => { if (h.y) delete h.y[t.id]; }); render(); });
    $$(".tcol", v).forEach(s => s.onchange = () => { read(); render(); });
    const del = $("#cdel", v); if (del) del.onclick = () => { if (!confirm("Remove " + (c.name || "this course") + " from this phone? Tournaments already started keep their copy.")) return; FW.courseDrop(c.id); toast("Course removed"); go(S.draftFrom === "new" ? "new" : "home", {}, true); };
    $("#cf", v).onsubmit = e => {
      e.preventDefault(); read();
      if (!C.cleanName(c.name)) { $("#cerr", v).textContent = "Give the course a name."; return; }
      const clean = C.cleanCourse(Object.assign({}, c, { id: c.id || "c" + C.newPid() }));
      FW.courseSave(clean); toast("Saved " + clean.name);
      S.newCourse = clean.id; S.draft = null;
      if (S.draftFrom === "new") { history.back(); } else go("home", {}, true);
    };
  }

  /* ======================================================================
     A TOURNAMENT
     ====================================================================== */
  function viewEvent(v) {
    if (!S.ev) {
      v.innerHTML = `${topbar("Tournament", liveBadge())}<section class="pad"><p class="msg">${S.live === "connecting" ? "Opening…" : S.live === "denied" ? "The shared scoreboard isn't switched on yet, so this tournament can't be opened on this phone." : "Couldn't open this tournament. Check your signal and try again."}</p></section>`;
      wireTop(v); $("#tabs").hidden = true; return;
    }
    const ev = S.ev, round = Math.min(ev.cur, ev.rounds);
    v.innerHTML = `<div class="top evtop"><button type="button" class="iconbtn" id="back" aria-label="Home">${ICON.back}</button><div class="ttl"><h1>${esc(ev.name)}</h1><small>${esc(ev.course.name)} · ${ev.done ? "Final" : ev.rounds > 1 ? "Round " + round + " of " + ev.rounds : "Par " + C.coursePar(ev.course)}</small></div>${liveBadge()}</div><div id="tab" class="tabbody"></div>`;
    wireTop(v);
    $("#back", v).onclick = () => go("home", {}, false);
    const body = $("#tab", v);
    const going = !!(ev.rally && ev.rally.on);
    const list = going ? [["going", "Going"], ["chat", "Chat"], ["more", "Share"]] : [["board", "Board"], ["score", "Score"], ["teams", "Teams"], ["games", "Games"], ["chat", "Chat"], ["more", "Share"]];
    if (S.tab === "field" || S.tab === "course") { S.boardMode = S.tab; S.tab = "board"; }
    if (!list.some(x => x[0] === S.tab)) S.tab = list[0][0];
    ({ board: tabBoard, score: tabScore, teams: FW.phase1.tabTeams, games: FW.games.tab, chat: FW.phase1.tabChat, going: FW.phase1.tabGoing, more: tabMore }[S.tab] || tabBoard)(body, ev);
    const tabs = $("#tabs"), unread = S.tab === "chat" ? 0 : FW.phase1.unread(S.code);
    tabs.hidden = false;
    tabs.innerHTML = list.map(([k, l]) => `<button type="button" data-tab="${k}" aria-current="${S.tab === k}">${ICON[k]}<span>${l}</span>${k === "chat" && unread ? `<i class="dot" aria-label="${unread} new">${unread > 9 ? "9+" : unread}</i>` : ""}</button>`).join("");
    $$("[data-tab]", tabs).forEach(b => b.onclick = () => { if (S.tab === b.dataset.tab) return; S.tab = b.dataset.tab; try { history.replaceState({ fw: "event", code: S.code, tab: S.tab }, "", "?t=" + S.code); } catch (e) { /* ignore */ } render(); window.scrollTo(0, 0); });
    $$("[data-player]", body).forEach(b => b.onclick = () => openCard(b.dataset.player));
  }

  /* ---------- Board: the leaders, and the classic hole-by-hole board ---------- */
  function tabBoard(el, ev) {
    const rows = C.standings(ev), r = S.boardRound || Math.min(ev.cur, ev.rounds), n = C.holeCount(ev);
    const seg = `<div class="pills" role="group" aria-label="Board">${[["leaders", "Leaders"], ["holes", "Hole by hole"], ["field", "Field"], ["course", "Course"]].map(([k, l]) => `<button type="button" class="pill" data-bm="${k}" aria-pressed="${S.boardMode === k}">${l}</button>`).join("")}</div>`;
    if (S.boardMode === "field" || S.boardMode === "course") {
      el.innerHTML = seg + `<div id="bsub"></div>`; (S.boardMode === "field" ? tabField : tabCourse)($("#bsub", el), ev); wireBoard(el); return;
    }
    if (!rows.length) { el.innerHTML = seg + emptyField(); wireBoard(el); return; }
    let html;
    if (S.boardMode === "holes") {
      const pars = ev.course.holes.map(h => h.par), bn = C.boardNames(rows);
      html = `${ev.rounds > 1 ? `<div class="pills small" role="group" aria-label="Round">${Array.from({ length: ev.rounds }, (_, i) => `<button type="button" class="pill" data-br="${i + 1}" aria-pressed="${r === i + 1}">Round ${i + 1}</button>`).join("")}</div>` : ""}
        <div class="board holes"><div class="bhead">Leaders</div><div class="cardwrap" data-keep="hbh"><table class="hbh"><thead>
          <tr><th class="nm">Hole</th>${pars.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr>
          <tr class="parrow"><th class="nm">Par</th>${pars.map(p => `<td>${p}</td>`).join("")}</tr></thead><tbody>
          ${rows.map(row => { const x = row.rounds[r - 1];
            return `<tr><th class="nm"><button type="button" data-player="${esc(row.id)}"><span class="pos">${esc(row.pos)}</span>${esc(bn[row.id])}</button></th>${pars.map((_, i) => { const h = i + 1, v = x.run[h]; return `<td class="${v == null ? "" : C.tone(v)}${x.last === h && !x.done ? " now" : ""}">${v == null ? "" : esc(v === 0 ? "E" : Math.abs(v))}</td>`; }).join("")}</tr>`; }).join("")}
        </tbody></table></div><p class="legend"><span class="tp under">Red</span> under par, <span class="tp over">green</span> over par, black even. Each number is the player's score to par after that hole${n === 18 ? "" : ""}.</p></div>`;
    } else {
      const R = ev.rounds, bn = C.boardNames(rows);
      html = `<div class="board"><div class="bhead">Leaders</div><table class="lb"><thead><tr><th>Pos</th><th class="pn">Player</th><th>To par</th><th>Thru</th>${R > 1 ? Array.from({ length: R }, (_, i) => `<th class="rd">R${i + 1}</th>`).join("") : ""}<th>Tot</th></tr></thead><tbody>
        ${rows.map(row => `<tr data-player="${esc(row.id)}" tabindex="0" role="button" aria-label="${esc(row.name)}, ${esc(row.pos)}, ${esc(C.fmtPar(row.toPar))}"><td class="pos">${esc(row.pos)}</td><td class="pn">${teeDot(C.teeOf(ev, row.pl))}${esc(bn[row.id])}</td><td class="big">${row.holes ? parText(row.toPar) : ""}</td><td class="thru">${esc(row.today.done ? "F" : row.today.thru || "–")}</td>${R > 1 ? row.rounds.map(x => `<td class="rd">${x.done ? x.strokes : x.started ? `<span class="tp ${C.tone(x.toPar)} sm">${esc(C.fmtPar(x.toPar))}</span>` : ""}</td>`).join("") : ""}<td class="tot">${row.total || ""}</td></tr>`).join("")}
      </tbody></table></div><p class="legend">Tap a name for their card. <span class="tp under">Red</span> is under par, <span class="tp over">green</span> over.</p>${ctpPanel(ev, r)}`;
    }
    el.innerHTML = seg + (S.boardMode === "holes" ? "" : FW.recap.html(ev, r)) + html;
    wireBoard(el); FW.recap.wire(el, ev, r);
    $$("tr[data-player]", el).forEach(t => t.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(t.dataset.player); } });
  }
  function wireBoard(el) {
    $$("[data-bm]", el).forEach(b => b.onclick = () => { S.boardMode = b.dataset.bm; render(); });
    $$("[data-br]", el).forEach(b => b.onclick = () => { S.boardRound = +b.dataset.br; render(); });
    $$("[data-ctp]", el).forEach(b => b.onclick = () => ctpList(+b.dataset.ctp, +b.dataset.ctpr));
    const go2 = $("#gojoin", el); if (go2) go2.onclick = () => { S.tab = "more"; render(); };
  }
  function emptyField() { return `<div class="empty"><p>No players yet.</p><p class="msg">Show the QR code on the Share tab: everyone scans it, types their name and picks their tees.</p><button type="button" class="btn primary" id="gojoin">Show the QR code</button></div>`; }

  /* ---------- Field: the vertical tournament view, who leads and where everyone is ---------- */
  function track(ev, x) {
    return `<span class="track" aria-hidden="true">${x.order.map(h => { const v = x.scores[h - 1]; const d = v == null ? null : v - ev.course.holes[h - 1].par; return `<i class="${d == null ? "" : C.tone(d)}${x.next === h ? " at" : ""}"></i>`; }).join("")}</span>`;
  }
  function tabField(el, ev) {
    const rows = C.standings(ev);
    if (!rows.length) { el.innerHTML = emptyField(); wireBoard(el); return; }
    const lead = rows[0], lx = lead.today, co = rows.filter(r => r.holes && r.toPar === lead.toPar).length;
    const where = x => x.done ? "Finished" : x.thru ? "On " + x.next : "Tees off on " + (x.order[0] || 1);
    const rowHtml = row => { const x = row.today; return `<li><button type="button" class="frow" data-player="${esc(row.id)}"><span class="pos">${esc(row.pos)}</span><span class="who"><b>${esc(row.name)}</b><small>${esc(where(x))}${x.thru && !x.done ? " · thru " + x.thru : ""}</small>${track(ev, x)}</span><span class="score">${row.holes ? parText(row.toPar) : "<span class='tp'>–</span>"}</span></button></li>`; };
    let list;
    if (S.fieldMode === "group") {
      const byId = {}; rows.forEach(r => byId[r.id] = r);
      list = C.groups(ev).map(g => `<li class="ghead"><b>Group ${g.g}</b><small>${g.done ? "Finished" : g.thru ? "On hole " + g.on : "Starts on " + g.start}</small></li>${g.players.map(p => rowHtml(byId[p.id])).join("")}`).join("");
    } else list = rows.map(rowHtml).join("");
    el.innerHTML = `<button type="button" class="leader" data-player="${esc(lead.id)}"><small>${co > 1 ? "Tied for the lead" : "Leader"}</small><b>${esc(lead.name)}</b><span class="lscore">${lead.holes ? parText(lead.toPar) : ""}</span><span class="lwhere">${esc(lead.holes ? where(lx) + (lx.thru && !lx.done ? " · thru " + lx.thru : "") : "Hasn't teed off")}</span>${track(ev, lx)}</button>
      <div class="pills" role="group" aria-label="Order"><button type="button" class="pill" data-fm="place" aria-pressed="${S.fieldMode === "place"}">By place</button><button type="button" class="pill" data-fm="group" aria-pressed="${S.fieldMode === "group"}">By group</button></div>
      <ul class="field">${list}</ul>`;
    $$("[data-fm]", el).forEach(b => b.onclick = () => { S.fieldMode = b.dataset.fm; render(); });
  }

  /* ---------- Score: one group's card, a hole at a time ---------- */
  function tabScore(el, ev) {
    const gs = C.groups(ev), mine = me();
    if (!gs.length) { el.innerHTML = emptyField(); wireBoard(el); return; }
    if (S.group == null || !gs.some(g => g.g === S.group)) S.group = mine ? mine.g : gs[0].g;
    const g = gs.find(x => x.g === S.group), r = S.scoreRound || Math.min(ev.cur, ev.rounds), n = C.holeCount(ev);
    const order = C.playOrder(n, g.start), rs = g.players.map(p => C.round(ev, p, r));
    if (S.hole == null || S.holeGroup !== g.g) { S.hole = order.find(h => rs.some(x => x.scores[h - 1] == null)) || order[order.length - 1]; S.holeGroup = g.g; }
    const h = S.hole, hole = ev.course.holes[h - 1], idx = order.indexOf(h), allIn = rs.every(x => x.scores[h - 1] != null);
    el.innerHTML = `${gs.length > 1 ? `<div class="pills small" role="group" aria-label="Group">${gs.map(x => `<button type="button" class="pill" data-g="${x.g}" aria-pressed="${x.g === g.g}">Group ${x.g}</button>`).join("")}</div>` : ""}
      ${ev.rounds > 1 ? `<div class="pills small" role="group" aria-label="Round">${Array.from({ length: ev.rounds }, (_, i) => `<button type="button" class="pill" data-sr="${i + 1}" aria-pressed="${r === i + 1}">Round ${i + 1}${i + 1 === ev.cur ? " (now)" : ""}</button>`).join("")}</div>` : ""}
      <div class="strip" data-keep="strip" role="group" aria-label="Hole">${order.map(k => { const done = rs.every(x => x.scores[k - 1] != null), some = rs.some(x => x.scores[k - 1] != null); return `<button type="button" data-h="${k}" aria-pressed="${k === h}" class="${done ? "done" : some ? "part" : ""}">${k}</button>`; }).join("")}</div>
      <div class="holecard"><div class="hn"><small>Hole</small><b>${h}</b></div><div class="hinfo"><b>Par ${hole.par}</b><small>Handicap ${hole.hcp}</small></div>
        <div class="hy">${ev.course.tees.filter(t => g.players.some(p => p.tee === t.id)).map(t => `<span>${teeDot(t)}${C.yards(ev.course, h, t.id) || "–"} yds</span>`).join("")}</div></div>
      ${caddieRow(ev, g, r, h, mine)}
      ${(ev.ctph || []).indexOf(h) >= 0 ? (() => { const x = C.ctpBoard(ev, r).find(y => y.h === h); return `<button type="button" class="ctpbar" id="ctpopen"><span><b>Closest to the pin</b><small>${x.best ? esc(x.best.name) + ", " + esc(C.fmtFeet(x.best.d)) : "Nobody measured yet"}</small></span><span class="chev">Measure</span></button>`; })() : ""}
      ${mine && mine.g === g.g ? FW.map.holeHtml(ev, h) + FW.jack.holeHtml(ev, h) : ""}
      <ul class="scorer">${g.players.map((p, i) => { const v = rs[i].scores[h - 1], d = v == null ? null : v - hole.par, t = C.teeOf(ev, p);
        return `<li data-pid="${esc(p.id)}"><button type="button" class="sname" data-player="${esc(p.id)}">${teeDot(t)}<span><b>${esc(p.n)}</b><small>${rs[i].thru ? parText(rs[i].toPar) + " thru " + rs[i].thru : "No scores yet"}${mine && mine.id === p.id ? " · you" : ""}</small></span></button>
          <div class="stepper"><button type="button" class="minus" aria-label="One less for ${esc(p.n)}">−</button><button type="button" class="val ${v == null ? "empty" : C.mark(d)}" aria-label="${v == null ? "Set par for " + esc(p.n) : esc(p.n) + ": " + v}">${v == null ? "Par?" : v}</button><button type="button" class="plus" aria-label="One more for ${esc(p.n)}">+</button></div>
          <small class="sword ${d == null ? "" : C.tone(d)}">${v == null ? "" : esc(C.scoreName(d, v))}${v != null ? ` <button type="button" class="link clr" aria-label="Clear ${esc(p.n)}'s score">clear</button>` : ""}</small></li>`; }).join("")}</ul>
      ${mine && mine.g === g.g ? FW.review.html(ev, mine, r, h) : ""}
      <div class="navrow"><button type="button" class="btn" id="prev" ${idx <= 0 ? "disabled" : ""}>‹ Hole ${order[idx - 1] || ""}</button><button type="button" class="btn ${allIn ? "primary" : ""}" id="next" ${idx >= order.length - 1 ? "disabled" : ""}>Hole ${order[idx + 1] || ""} ›</button></div>
      <h2 class="sec">Group ${g.g} card</h2>${groupCard(ev, g.players, r, order, h)}
      ${!mine && !isOrg() ? `<p class="msg">You're watching. To keep score for this group, tap Join on the Share tab.</p>` : ""}`;
    const co = $("#ctpopen", el); if (co) co.onclick = () => ctpList(h, r);
    wireCaddie(el, ev, g, r, h, mine);
    $$("[data-g]", el).forEach(b => b.onclick = () => { S.group = +b.dataset.g; S.hole = null; render(); });
    $$("[data-sr]", el).forEach(b => b.onclick = () => { S.scoreRound = +b.dataset.sr; S.hole = null; render(); });
    $$(".strip [data-h]", el).forEach(b => b.onclick = () => { S.hole = +b.dataset.h; render(); });
    const strip = $(".strip", el), on = strip && $("[aria-pressed=true]", strip); if (on && strip.scrollTo) strip.scrollLeft = Math.max(0, on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2);
    $("#prev", el).onclick = () => { S.hole = order[idx - 1]; render(); };
    $("#next", el).onclick = () => { S.hole = order[idx + 1]; render(); };
    if (mine && mine.g === g.g) { FW.review.wire(el, ev, mine, r, h); FW.jack.wire(el, ev, mine, h); FW.map.wire(el, ev, mine, h); }
    $$(".scorer li", el).forEach(li => {
      const pid = li.dataset.pid, cur = C.strokes(ev.p[pid], r, h);
      const set = val => {
        if (val != null) jackReact(ev, pid, r, h, cur, val);
        write({ ["p." + pid + ".s." + C.key(r, h)]: val == null ? C.DELETE : val });
        const sh = val != null && !S.ev.demo && C.shout(S.ev, pid, r, h, val); if (sh) FW.phase1.autoPost(sh, "a" + pid + "r" + r + "h" + h);
      };
      $(".val", li).onclick = () => { if (cur == null) set(hole.par); };
      $(".minus", li).onclick = () => set(cur == null ? hole.par - 1 : Math.max(1, cur - 1));
      $(".plus", li).onclick = () => set(cur == null ? hole.par + 1 : Math.min(20, cur + 1));
      const clr = $(".clr", li); if (clr) clr.onclick = () => set(null);
    });
  }
  function groupCard(ev, list, r, order, hl) {
    const n = C.holeCount(ev), halves = n === 18 ? [[1, 9, "Out"], [10, 18, "In"]] : [[1, 9, "Tot"]];
    return halves.map(([a, b, lbl]) => {
      const holes = []; for (let k = a; k <= b; k++) holes.push(k);
      return `<div class="cardwrap" data-keep="gc${a}"><table class="sc"><thead><tr><th class="nm">Hole</th>${holes.map(k => `<th class="${k === hl ? "hl" : ""}">${k}</th>`).join("")}<th>${lbl}</th></tr>
        <tr class="parrow"><th class="nm">Par</th>${holes.map(k => `<td>${ev.course.holes[k - 1].par}</td>`).join("")}<td>${holes.reduce((s, k) => s + ev.course.holes[k - 1].par, 0)}</td></tr></thead><tbody>
        ${list.map(p => { let t = 0, any = false; return `<tr><th class="nm">${esc(p.n.split(" ")[0])}</th>${holes.map(k => { const v = C.strokes(p, r, k); if (v != null) { t += v; any = true; } return `<td>${v == null ? "" : `<span class="mk ${C.mark(v - ev.course.holes[k - 1].par)}">${v}</span>`}</td>`; }).join("")}<td class="sum">${any ? t : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`;
    }).join("");
  }

  /* ---------- Course: the scorecard by tee ---------- */
  function tabCourse(el, ev) {
    const c = ev.course, mine = me(), n = c.holes.length;
    const halves = n === 18 ? [[1, 9, "Out"], [10, 18, "In"]] : [[1, n, "Tot"]];
    el.innerHTML = `<div class="pad0">${FW.where.html(ev)}<h2 class="sec">${esc(c.name)} <small>par ${C.coursePar(c)}</small></h2>
      <ul class="teesum">${c.tees.map(t => `<li class="${mine && mine.tee === t.id ? "mine" : ""}">${teeLabel(c, t)}${mine && mine.tee === t.id ? " <i class='chip'>Your tees</i>" : ""}</li>`).join("")}</ul>
      ${halves.map(([a, b, lbl]) => { const hs = []; for (let k = a; k <= b; k++) hs.push(k);
        return `<div class="cardwrap" data-keep="cc${a}"><table class="sc course"><thead><tr><th class="nm">Hole</th>${hs.map(k => `<th>${k}</th>`).join("")}<th>${lbl}</th></tr></thead><tbody>
          ${c.tees.map(t => `<tr class="${mine && mine.tee === t.id ? "mine" : ""}"><th class="nm">${teeDot(t)}${esc(t.name)}</th>${hs.map(k => `<td>${C.yards(c, k, t.id) || ""}</td>`).join("")}<td class="sum">${hs.reduce((s, k) => s + C.yards(c, k, t.id), 0) || ""}</td></tr>`).join("")}
          <tr class="parrow"><th class="nm">Par</th>${hs.map(k => `<td>${c.holes[k - 1].par}</td>`).join("")}<td class="sum">${hs.reduce((s, k) => s + c.holes[k - 1].par, 0)}</td></tr>
          <tr class="hcprow"><th class="nm">Hcp</th>${hs.map(k => `<td>${c.holes[k - 1].hcp}</td>`).join("")}<td></td></tr>
        </tbody></table></div>`; }).join("")}
      ${n === 18 ? `<p class="msg">Total: ${c.tees.map(t => esc(t.name) + " " + C.teeYards(c, t.id).toLocaleString() + " yds").join(" · ")}</p>` : ""}
      ${mine ? `<label class="fld"><span>Change your tees</span><select id="mytee">${c.tees.map(t => `<option value="${esc(t.id)}" ${t.id === mine.tee ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : ""}
      <button type="button" class="btn ghost block" id="savec">Save this course to my phone</button></div>`;
    const mt = $("#mytee", el); if (mt) mt.onchange = () => { FW.LS.set("fw:tee", mt.value); write({ ["p." + mine.id + ".tee"]: mt.value }); toast("Tees changed"); };
    $("#savec", el).onclick = () => { const cc = C.cleanCourse(Object.assign({}, c, { id: "c" + C.newPid() })); delete cc.sample; FW.courseSave(cc); toast("Saved to your courses"); };
  }

  /* ---------- Share & manage: the QR code, the link, players, rounds ---------- */
  function qrSvg(text) {
    if (!window.qrcode) return "";
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2; let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code to join"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b2a1c"/></svg>`;
  }
  function tabMore(el, ev) {
    const m = FW.mineGet(S.code) || {}, org = !!m.org, local = S.place === FW.local, mine = me(), link = linkFor(S.code), list = C.players(ev);
    const canShare = !local;
    el.innerHTML = `<div class="pad0">
      ${canShare ? `<div class="share"><h2>Scan to join</h2>${qrSvg(link)}<p class="msg">Everyone scans this with their phone's camera, types their name and picks their tees. No account needed.</p>
        <div class="row2"><button type="button" class="btn" id="copy">Copy link</button>${navigator.share ? `<button type="button" class="btn" id="sharebtn">Share</button>` : ""}<button type="button" class="btn" id="bigqr">Full screen</button></div></div>`
        : `<div class="share"><h2>${m.demo ? "This is the demo" : "On this phone only"}</h2><p class="msg">${m.demo ? "Made-up players on a made-up course, so you can try every screen. Score a few holes, tap players, flip their cards." : "This tournament runs on this phone, so there's no QR code to share. Pass the phone around to score, or put the board up on it."}</p>${m.demo ? `<button type="button" class="btn block" id="resetdemo">Start the demo over</button>` : ""}</div>`}
      ${!mine && canShare ? `<button type="button" class="btn primary block" id="joinme">Join and keep score</button>` : ""}
      ${mine ? `<p class="msg">You're <b>${esc(mine.n)}</b>, group ${mine.g}. <button type="button" class="link" id="notme">Not you?</button></p>` : ""}
      ${mine && FW.watch ? FW.watch.panelHtml() : ""}
      ${ev.rally && ev.rally.on ? "" : FW.phase1.teeHtml(ev, org)}
      ${org ? `<button type="button" class="btn block" id="setup">Set it up</button>` + manageHtml(ev, list) : `<p class="msg">Changing rounds and players is on the phone that started this tournament.</p>`}
      <button type="button" class="btn ghost danger block" id="forget">Remove from this phone</button></div>`;
    const cp = $("#copy", el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { sheet("Copy the link", `<textarea class="copybox" readonly rows="3">${esc(link)}</textarea>`); } };
    const sh = $("#sharebtn", el); if (sh) sh.onclick = () => navigator.share({ title: ev.name, text: "Join " + ev.name + " on Fairway", url: link }).catch(() => {});
    const bq = $("#bigqr", el); if (bq) bq.onclick = () => { const o = document.createElement("div"); o.className = "bigqr"; o.innerHTML = `<h2>${esc(ev.name)}</h2>${qrSvg(link)}<p>Scan to join · tap to close</p>`; o.onclick = () => o.remove(); document.body.appendChild(o); };
    const jm = $("#joinme", el); if (jm) jm.onclick = () => { S.ev = ev; S.evCode = S.code; stopLive(); go("join"); };
    const nm = $("#notme", el); if (nm) nm.onclick = () => { FW.mineSet(S.code, { me: null }); render(); };
    if (mine && FW.watch) FW.watch.wire(el);
    const rd = $("#resetdemo", el); if (rd) rd.onclick = () => { FW.local.create(S.code, C.demoEvent()); toast("Demo reset"); };
    $("#forget", el).onclick = () => {
      if (!confirm(local ? "Remove this tournament from this phone? It only lives here, so its scores go too." : "Remove this tournament from this phone? Its scores stay on the shared board, and the link still opens it.")) return;
      const code = S.code; stopLive(); FW.mineDrop(code); go("home", {}, true);
    };
    FW.phase1.wireTee(el, ev);
    const su = $("#setup", el); if (su) su.onclick = FW.phase1.setupSheet;
    if (org) wireManage(el, ev);
  }
  function manageHtml(ev, list) {
    const R = ev.rounds, gs = C.groups(ev);
    return `<h2 class="sec">Run the tournament</h2>
      <div class="card"><label class="fld"><span>Name</span><input id="mname" maxlength="${C.EVENT_MAX}" value="${esc(ev.name)}"></label>
        ${R > 1 ? `<div class="fld"><span>Round being played</span><div class="seg">${Array.from({ length: R }, (_, i) => `<label><input type="radio" name="cur" value="${i + 1}" ${ev.cur === i + 1 ? "checked" : ""}><span>${i + 1}</span></label>`).join("")}</div></div>` : ""}
        <label class="check"><input type="checkbox" id="mdone" ${ev.done ? "checked" : ""}><span>Final results (the board says Final)</span></label>
        <label class="check"><input type="checkbox" id="mfam" ${ev.fam ? "checked" : ""}><span>Family event: Jack the caddie stays clean on every phone</span></label>
        <div class="fld"><span>Closest-to-the-pin holes</span><div class="ctph">${ev.course.holes.map((h, i) => `<label class="${h.par === 3 ? "p3" : ""}"><input type="checkbox" data-ctph="${i + 1}" ${(ev.ctph || []).indexOf(i + 1) >= 0 ? "checked" : ""}><span>${i + 1}<small>par ${h.par}</small></span></label>`).join("")}</div></div></div>
      <h2 class="sec">Players <small>${list.length}</small></h2>
      <ul class="list plist">${gs.map(g => g.players.map(p => `<li><button type="button" class="row" data-edit="${esc(p.id)}"><span><b>${esc(p.n)}</b><small>Group ${p.g} · ${esc(C.teeOf(ev, p).name)} tees · starts ${p.st}</small></span><span class="chev">Edit</span></button></li>`).join("")).join("")}</ul>
      <button type="button" class="btn block" id="addp">Add a player</button>`;
  }
  function wireManage(el, ev) {
    const nm = $("#mname", el); nm.onchange = () => { const v = (nm.value || "").trim().slice(0, C.EVENT_MAX); if (v && v !== ev.name) write({ name: v }); };
    $$("input[name=cur]", el).forEach(r => r.onchange = () => { write({ cur: +r.value }); S.scoreRound = null; S.boardRound = null; S.hole = null; });
    $("#mdone", el).onchange = e => write({ done: e.target.checked });
    $("#mfam", el).onchange = e => write({ fam: e.target.checked ? true : C.DELETE });
    $$("[data-ctph]", el).forEach(c => c.onchange = () => write({ ctph: $$("[data-ctph]", el).filter(x => x.checked).map(x => +x.dataset.ctph) }));
    $("#addp", el).onclick = () => playerSheet(null);
    $$("[data-edit]", el).forEach(b => b.onclick = () => playerSheet(b.dataset.edit));
  }
  function playerSheet(pid) {
    const ev = S.ev, p = pid ? ev.p[pid] : null, gs = C.groups(ev), nextG = gs.length ? Math.max.apply(null, gs.map(g => g.g)) + 1 : 1;
    const grp = p ? p.g : (gs.find(g => g.players.length < 4) || { g: nextG }).g;
    sheet(p ? "Edit player" : "Add a player", `<form id="pf" autocomplete="off">
      <label class="fld"><span>Name</span><input id="pn" maxlength="${C.NAME_MAX}" required value="${esc(p ? p.n : "")}"></label>
      <label class="fld"><span>Tees</span><select id="pt">${ev.course.tees.map(t => `<option value="${esc(t.id)}" ${(p ? p.tee : FW.LS.get("fw:tee", "")) === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      <label class="fld"><span>Handicap index (optional)</span><input id="phc" inputmode="decimal" maxlength="5" value="${p && Number.isFinite(p.hc) ? (p.hc < 0 ? "+" + Math.abs(p.hc) : p.hc) : ""}" placeholder="12.4"></label>
      <label class="fld"><span>Group</span><input id="pg" type="number" min="1" max="60" inputmode="numeric" value="${grp}"></label>
      <label class="fld"><span>Starting hole</span><select id="ps">${ev.course.holes.map((h, i) => `<option value="${i + 1}" ${(p ? p.st : ((gs.find(g => g.g === grp) || {}).start || 1)) === i + 1 ? "selected" : ""}>Hole ${i + 1}</option>`).join("")}</select></label>
      <button type="submit" class="btn primary block">${p ? "Save" : "Add"}</button>
      ${p ? `<button type="button" class="btn ghost danger block" id="prm">Remove ${esc(p.n)}</button>` : ""}</form>`, box => {
      const gIn = $("#pg", box), sIn = $("#ps", box);
      gIn.oninput = () => { const g = gs.find(x => x.g === +gIn.value); if (g) sIn.value = String(g.start); };
      $("#pf", box).onsubmit = e => {
        e.preventDefault();
        const name = C.cleanName($("#pn", box).value); if (!name) return;
        const g = Math.min(60, Math.max(1, parseInt(gIn.value, 10) || 1)), st = +sIn.value || 1, tee = $("#pt", box).value;
        const hc = C.cleanHc($("#phc", box).value);
        if (p) write({ ["p." + pid + ".n"]: name, ["p." + pid + ".tee"]: tee, ["p." + pid + ".g"]: g, ["p." + pid + ".st"]: st, ["p." + pid + ".hc"]: hc == null ? C.DELETE : hc });
        else { if (C.players(ev).length >= C.MAX_PLAYERS) { toast("That's the most players one tournament holds.", "error"); return; } write({ ["p." + C.newPid()]: C.newPlayer(ev, { name, tee, group: g, start: st, hc }) }); }
        closeSheet(); toast(p ? "Saved" : "Added " + name);
      };
      const rm = $("#prm", box); if (rm) rm.onclick = () => { if (!confirm("Remove " + p.n + " and their scores?")) return; write({ ["p." + pid]: C.DELETE }); closeSheet(); };
    });
  }


  /* ======================================================================
     THE HOLE MAP AND JACK THE CADDIE (holemap.js draws, caddie.js talks)
     ====================================================================== */
  const M = window.FairwayMap, J = window.FairwayJack;
  // Jack's level comes from his settings (jack.js: Clean, A little, A lot, Super crude, the kid lock and the adult
  // check). The organizer's Family event switch keeps him clean on every phone in the tournament.
  const LV = { clean: 0, little: 1, lot: 2, crude: 3 };
  const jackLevel = () => (S.ev && S.ev.fam) ? 0 : (LV[C.jackLevel(FW.jack.settings())] || 0);
  // Whose hole it is on this screen: you, if you're in this group, or the group's first player.
  const subjectOf = (g, mine) => (mine && g.players.find(p => p.id === mine.id)) || g.players[0];
  function holeSketch(ev, h, teeId, big) {
    const hole = ev.course.holes[h - 1];
    const p = M.plan({ seed: ev.course.name + " " + h, par: hole.par, yards: C.yards(ev.course, h, teeId), hcp: hole.hcp });
    return M.svg(p, { id: (big ? "hb" : "hs") + h, big, title: "Sketch of hole " + h + ", par " + hole.par });
  }
  function teeLine(ev, g, r, h, mine) {
    const sub = subjectOf(g, mine), hole = ev.course.holes[h - 1];
    return J.lineFor({ kind: "tee", par: hole.par, y: C.yards(ev.course, h, sub.tee), hcp: hole.hcp, n: sub.n, h }, jackLevel());
  }
  function caddieRow(ev, g, r, h, mine) {
    if (!M || !J || !FW.jack) return "";
    const sub = subjectOf(g, mine), js = FW.jack.settings(), key = [S.code, r, g.g, h, jackLevel()].join(":");
    if (!S.jack || S.jack.key !== key) S.jack = Object.assign({ key }, teeLine(ev, g, r, h, mine));
    const lock = js.kid ? "Kid's profile: clean" : ev.fam ? "Family event: clean" : C.JACK_LANGS[jackLevel()][1];
    return `<div class="hplus">
      <button type="button" class="sketch" id="hsketch" aria-label="Hole ${h} sketch. Tap to make it bigger">${holeSketch(ev, h, sub.tee, false)}</button>
      <div class="jack" aria-live="polite"><div class="jhead"><span class="jface" aria-hidden="true">J</span><span><b>Jack</b><small>${esc(lock)}</small></span><button type="button" class="link" id="jkset">Settings</button></div>
        <p class="jline" id="jline">${esc(S.jack.text)}</p>
        <div class="jbtns"><button type="button" class="btn small" id="jask">Ask Jack</button>${"speechSynthesis" in window ? `<button type="button" class="btn small ghost" id="jsay">Say it</button>` : ""}</div></div>
    </div>`;
  }
  function wireCaddie(el, ev, g, r, h, mine) {
    const mp = $("#hsketch", el); if (mp) mp.onclick = () => sketchSheet(ev, g, h, mine);
    const st = $("#jkset", el); if (st) st.onclick = () => FW.jack.settingsSheet(() => { closeSheet(); S.jack = null; render(); });
    const ask = $("#jask", el); if (ask) ask.onclick = () => { const k = S.jack && S.jack.key; S.jack = Object.assign({ key: k }, teeLine(ev, g, r, h, mine)); const ln = $("#jline", el); if (ln) ln.textContent = S.jack.text; };
    const ag = $("#jsay", el); if (ag) ag.onclick = () => S.jack && FW.jack.say(S.jack.text);
  }
  // Jack's word on a score just entered on this phone (the screen redraws right after, with it in place).
  function jackReact(ev, pid, r, h, cur, val) {
    if (!J || !FW.jack) return;
    const p = ev.p[pid], par = ev.course.holes[h - 1].par, x = C.round(ev, Object.assign({ id: pid }, p), r);
    const tp = x.toPar - (cur == null ? 0 : cur - par) + (val - par), thru = x.thru + (cur == null ? 1 : 0);
    const rows = C.standings(ev), lead = rows.length > 1 && rows[0].id === pid;
    const line = J.lineFor({ kind: "score", par, diff: val - par, tp, thru, n: p.n, h, lead }, jackLevel());
    S.jack = Object.assign({ key: [S.code, r, S.group, h, jackLevel()].join(":") }, line);
  }
  function sketchSheet(ev, g, h, mine) {
    const sub = subjectOf(g, mine), hole = ev.course.holes[h - 1], y = C.yards(ev.course, h, sub.tee), own = mine && mine.g === g.g;
    sheet("Hole " + h, `<div class="mapbig">${holeSketch(ev, h, sub.tee, true)}</div>
      <p class="maplegend"><b>Par ${hole.par}</b>${y ? ` · ${y} yds from the ${esc(C.teeOf(ev, sub).name)} tees` : ""} · Handicap ${hole.hcp}</p>
      <p class="msg small">A pencil sketch drawn from the hole's par and yardage, not the real layout. Numbers on the fairway are yards to the middle of the green.${own ? " For the real hole, add your own picture on the hole map." : ""}</p>
      ${own ? `<button type="button" class="btn block" id="skmap">Open the hole map</button>` : ""}`, box => {
      const b = $("#skmap", box); if (b) b.onclick = () => { closeSheet(); FW.map.sheet(ev, mine, h); };
    });
  }

  /* ======================================================================
     CLOSEST TO THE PIN: stand at the hole, mark it, walk to the ball, mark it
     ====================================================================== */
  // A few GPS readings over a few seconds, averaged (phones wander 10 to 30 feet, so one reading isn't enough).
  function readFix(onTick) {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej(new Error("nogps")); return; }
      const got = [], t0 = Date.now();
      let id = null, done = false;
      const finish = () => { if (done) return; done = true; if (id != null) navigator.geolocation.clearWatch(id); clearTimeout(tm); const f = C.averageFix(got); f ? res(f) : rej(new Error(got.length ? "weak" : "nofix")); };
      const tm = setTimeout(finish, 9000);
      id = navigator.geolocation.watchPosition(p => {
        got.push({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy });
        onTick && onTick(got.length, p.coords.accuracy);
        if (got.length >= 6 || (got.length >= 3 && Date.now() - t0 > 4000)) finish();
      }, e => { if (done) return; done = true; clearTimeout(tm); if (id != null) navigator.geolocation.clearWatch(id); rej(e && e.code === 1 ? new Error("denied") : new Error("nofix")); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 });
    });
  }
  // A photo, redrawn smaller (which also drops the camera's location notes), as JPEG text.
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        let q = 0.72, out = cv.toDataURL("image/jpeg", q);
        while (out.length > 450000 && q > 0.35) { q -= 0.12; out = cv.toDataURL("image/jpeg", q); }
        res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
      img.src = url;
    });
  }
  const ftText = e => esc(C.fmtFeet(e.d)) + (e.m === "tape" ? " (tape)" : e.acc ? ` <small>±${esc(e.acc)} ft</small>` : "");
  function ctpPanel(ev, r) {
    const b = C.ctpBoard(ev, r); if (!b.length) return "";
    return `<div class="ctp"><h2 class="sec">Closest to the pin${ev.rounds > 1 ? " · round " + r : ""}</h2><ul class="list">${b.map(x => `<li><button type="button" class="row" data-ctp="${x.h}" data-ctpr="${r}"><span><b>Hole ${x.h}</b><small>Par ${x.par} · ${x.list.length ? x.list.length + " measured" : "nobody yet"}</small></span><span class="ctpbest">${x.best ? `<b>${esc(x.best.name)}</b><small>${ftText(x.best)}${x.best.ph ? " · photo" : ""}</small>` : "<small>Open</small>"}</span></button></li>`).join("")}</ul></div>`;
  }
  function ctpList(h, r) {
    const ev = S.ev, x = C.ctpBoard(ev, r).find(y => y.h === h); if (!x) return;
    sheet("Hole " + h + ": closest to the pin", `${x.list.length ? `<ol class="ctplist">${x.list.map(e => `<li><span><b>${esc(e.name)}</b><small>${e.m === "tape" ? "Measured with a tape" : "GPS, give or take " + esc(e.acc) + " ft"}</small></span><span>${esc(C.fmtFeet(e.d))}${e.ph ? ` <button type="button" class="link" data-ph="${esc(e.ph)}">Photo</button>` : ""}</span></li>`).join("")}</ol>` : `<p class="msg">Nobody has measured a ball here yet.</p>`}
      <div id="phbox"></div><button type="button" class="btn primary block" id="meas">Measure a ball</button>
      <p class="msg small">Phone GPS is close, not exact: usually within 10 to 30 feet. For a tight finish, measure with a tape and enter it.</p>`, box => {
      $("#meas", box).onclick = () => ctpSheet(h, r);
      $$("[data-ph]", box).forEach(b => b.onclick = async () => {
        const pb = $("#phbox", box); pb.innerHTML = `<p class="msg">Loading the photo…</p>`;
        try { const img = await FW.photoGet(S.code, b.dataset.ph); pb.innerHTML = img && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img) ? `<img class="ctpimg" alt="The ball by the pin" src="${img}">` : `<p class="msg">That photo isn't here.</p>`; }
        catch (e) { pb.innerHTML = `<p class="msg">Couldn't load the photo. Check your signal.</p>`; }
      });
    });
  }
  function ctpSheet(h, r) {
    const ev = S.ev, mine = me(), gs = C.groups(ev), g = gs.find(x => x.g === S.group) || (mine && gs.find(x => x.g === mine.g)) || gs[0];
    const pick = (mine && g && g.players.some(p => p.id === mine.id)) ? mine.id : g ? g.players[0].id : null;
    if (!pick) return;
    const st = { pin: null, ball: null, photo: null };
    sheet("Hole " + h + ": measure a ball", `<label class="fld"><span>Whose ball</span><select id="cw">${C.players(ev).sort((a, b) => a.g - b.g || a.n.localeCompare(b.n)).map(p => `<option value="${esc(p.id)}" ${p.id === pick ? "selected" : ""}>${esc(p.n)} (group ${p.g})</option>`).join("")}</select></label>
      <ol class="steps"><li id="s1"><b>Stand right at the hole</b> and tap Mark pin. Hold still for a few seconds.<button type="button" class="btn block" id="mpin">Mark pin</button><small class="gps" id="g1"></small></li>
        <li id="s2"><b>Walk to the ball</b>, stand over it and tap Mark ball.<button type="button" class="btn block" id="mball" disabled>Mark ball</button><small class="gps" id="g2"></small></li></ol>
      <div id="cres"></div>
      <details class="tape"><summary>Measured with a tape instead?</summary><div class="row2"><label class="fld"><span>Feet</span><input id="tf" inputmode="numeric" maxlength="3"></label><label class="fld"><span>Inches</span><input id="ti" inputmode="numeric" maxlength="2"></label></div></details>
      <label class="fld"><span>Photo of the ball by the pin (optional)</span><input type="file" id="cph" accept="image/*" capture="environment"></label>
      <button type="button" class="btn primary block" id="csave" disabled>Save</button><p class="err" id="cerr" role="alert"></p>`, box => {
      const err = m => { $("#cerr", box).textContent = m; };
      const why = e => ({ denied: "Location is off for this site. Allow location in your browser settings, or use a tape and enter it below.", nogps: "This phone can't share its location. Use a tape and enter it below.", weak: "The GPS signal is too weak right now. Try again in the open, or use a tape.", nofix: "Couldn't get a GPS reading. Try again in the open, or use a tape." }[e && e.message] || "Couldn't get a GPS reading.");
      const show = () => {
        const m = C.ctpMeasure(st.pin, st.ball), tf = parseInt($("#tf", box).value, 10), ti = parseInt($("#ti", box).value, 10) || 0;
        const tape = tf >= 0 && !isNaN(tf);
        $("#cres", box).innerHTML = tape ? `<p class="bigft">${esc(C.fmtFeet(tf + Math.min(11, ti) / 12))}</p><p class="msg">From the tape.</p>` : m ? `<p class="bigft">${esc(C.fmtFeet(m.ft))}</p><p class="msg">About ${esc(C.fmtFeet(m.ft))} from the pin, give or take ${esc(m.acc)} feet (phone GPS).</p>` : "";
        $("#csave", box).disabled = !(tape || m);
      };
      const mark = async (which, btn, out) => {
        btn.disabled = true; err(""); out.textContent = "Reading the GPS…";
        try {
          const f = await readFix((n, acc) => { out.textContent = `Reading ${n} · within about ${Math.round(Math.max(3, acc) * 3.28)} ft`; });
          st[which] = f; out.textContent = `Marked: ${f.n} readings, within about ${Math.round(f.acc * 3.28)} ft`;
          if (which === "pin") { $("#mball", box).disabled = false; $("#s1", box).classList.add("ok"); } else $("#s2", box).classList.add("ok");
          btn.textContent = which === "pin" ? "Mark pin again" : "Mark ball again";
        } catch (e) { out.textContent = ""; err(why(e)); }
        btn.disabled = false; if (which === "ball" && !st.pin) btn.disabled = true;
        show();
      };
      $("#mpin", box).onclick = () => mark("pin", $("#mpin", box), $("#g1", box));
      $("#mball", box).onclick = () => mark("ball", $("#mball", box), $("#g2", box));
      $("#tf", box).oninput = show; $("#ti", box).oninput = show;
      $("#cph", box).onchange = async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { st.photo = await shrink(f); toast("Photo added"); } catch (x) { err("Couldn't read that photo."); } };
      $("#csave", box).onclick = async () => {
        const pid = $("#cw", box).value, tf = parseInt($("#tf", box).value, 10), ti = parseInt($("#ti", box).value, 10) || 0, m = C.ctpMeasure(st.pin, st.ball);
        const tape = tf >= 0 && !isNaN(tf);
        const e = tape ? { d: Math.round((tf + Math.min(11, ti) / 12) * 10) / 10, m: "tape", at: Date.now() } : m ? { d: m.ft, acc: m.acc, m: "gps", at: Date.now() } : null;
        if (!e || !C.cleanCtpEntry(e)) { err("Mark the pin and the ball first, or enter a tape measurement."); return; }
        $("#csave", box).disabled = true;
        if (st.photo) { const id = C.newPid(); try { await FW.photoPut(S.code, id, st.photo); e.ph = id; } catch (x) { toast("The photo didn't save, but the distance did.", "error"); } }
        write({ ["ctp." + C.key(r, h) + "." + pid]: C.cleanCtpEntry(e) });
        closeSheet(); toast((ev.p[pid] ? ev.p[pid].n : "Ball") + ": " + C.fmtFeet(e.d));
      };
    });
  }

  /* ======================================================================
     THE PLAYER CARD: opens, flips over to stats and the scorecard
     ====================================================================== */
  function openCard(pid) {
    if (!S.ev || !S.ev.p[pid]) return;
    S.card = { pid, side: "front", r: Math.min(S.ev.cur, S.ev.rounds), tab: "card" };
    try { history.pushState({ fw: "event", code: S.code, tab: S.tab, card: pid }, "", "?t=" + S.code); } catch (e) { /* ignore */ }
    drawCard(true);
    // the flip, a beat after the card lands
    setTimeout(() => { if (S.card && S.card.pid === pid && S.card.side === "front") flip(); }, reduced() ? 0 : 650);
  }
  function flip() { if (!S.card) return; S.card.side = S.card.side === "front" ? "back" : "front"; const f = $("#cardlayer .flipper"); if (f) f.classList.toggle("flipped", S.card.side === "back"); }
  function closeCard(fromPop) {
    if (!S.card) return;
    S.card = null;
    const L = $("#cardlayer"); L.classList.add("out"); setTimeout(() => { L.innerHTML = ""; L.classList.remove("out"); }, reduced() ? 0 : 220);
    if (!fromPop && history.state && history.state.card) history.back();
  }
  function drawCard(fresh) {
    const L = $("#cardlayer"), ev = S.ev, cs = S.card; if (!cs || !ev) return;
    const pl = ev.p[cs.pid]; if (!pl) { closeCard(); return; }
    const p = Object.assign({ id: cs.pid }, pl), row = C.standings(ev).find(x => x.id === cs.pid), t = C.teeOf(ev, p), x = row.rounds[cs.r - 1];
    const st = C.stats(ev, p), stR = C.stats(ev, p, cs.r);
    const past = FW.history().filter(h => h.code !== S.code && C.sameName(h.name, p.n)).sort((a, b) => b.date - a.date).slice(0, 8);
    const fmtD = d => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const stat = (n, l, tone) => `<div class="stat"><b class="${tone || ""}">${n}</b><small>${l}</small></div>`;
    const back = cs.tab === "stats" ? `<div class="stats">${stat(st.eagles, "Eagles or better", "under")}${stat(st.birdies, "Birdies", "under")}${stat(st.pars, "Pars")}${stat(st.bogeys, "Bogeys", "over")}${stat(st.doubles, "Double+", "over")}${stat(st.holes, "Holes played")}</div>
        <div class="stats three">${[3, 4, 5].map(k => stat(st.avg[k] != null ? st.avg[k].toFixed(2) : "–", "Par " + k + " average")).join("")}</div>
        ${(() => { const mine = []; for (let rr = 1; rr <= ev.rounds; rr++) C.ctpBoard(ev, rr).forEach(x => { const i = x.list.findIndex(e => e.pid === p.id); if (i >= 0) mine.push(`Hole ${x.h}${ev.rounds > 1 ? " (R" + rr + ")" : ""}: ${esc(C.fmtFeet(x.list[i].d))}, ${i === 0 ? "closest so far" : "number " + (i + 1)}`); }); return mine.length ? `<p class="msg"><b>Closest to the pin.</b> ${mine.join(". ")}.</p>` : ""; })()}
        <p class="msg">${st.bestStreak ? `Best run: ${st.bestStreak} hole${st.bestStreak > 1 ? "s" : ""} at par or better.` : ""}${st.best && st.best.d < 0 ? ` Best hole: ${esc(C.scoreName(st.best.d, st.best.v))} on ${st.best.h}${ev.rounds > 1 ? " in round " + st.best.r : ""}.` : ""}${st.aces ? " A hole in one!" : ""}</p>`
      : cs.tab === "rounds" ? `<ul class="rounds">${row.rounds.map(rx => `<li><span><b>Round ${rx.r}</b><small>${esc(ev.name)}</small></span><span>${rx.done ? rx.strokes + " " + parText(rx.toPar) : rx.started ? parText(rx.toPar) + " thru " + rx.thru : "Not started"}</span></li>`).join("")}
          ${past.map(h => `<li><span><b>${esc(fmtD(h.date))}</b><small>${esc(h.event)} · ${esc(h.course)}${h.r > 1 ? " · R" + h.r : ""}</small></span><span>${h.strokes} ${parText(h.toPar)}</span></li>`).join("")}</ul>
          ${past.length ? "" : `<p class="msg">Earlier tournaments this phone has seen ${esc(p.n.split(" ")[0])} finish show up here.</p>`}`
      : `${ev.rounds > 1 ? `<div class="pills small">${row.rounds.map(rx => `<button type="button" class="pill" data-cr="${rx.r}" aria-pressed="${rx.r === cs.r}">R${rx.r}</button>`).join("")}</div>` : ""}
         ${playerCard(ev, p, x)}
         <p class="cardsum">${x.started ? `${x.strokes} strokes · ${parText(x.toPar)} · ${x.done ? "finished" : "thru " + x.thru}` : "No scores this round yet"} · ${stR.birdies + stR.eagles} under, ${stR.bogeys + stR.doubles} over</p>`;
    const html = `<div class="cscrim" data-cclose></div><div class="cwrap" role="dialog" aria-modal="true" aria-label="${esc(p.n)}'s player card">
      <div class="flipper ${cs.side === "back" ? "flipped" : ""}${fresh && !reduced() ? " enter" : ""}">
        <div class="face front" style="--tee:${hex(t.color)}">
          <div class="cband"><span>${esc(ev.name)}</span><span>${esc(t.name)} tees</span></div>
          <div class="avatar" style="background:${hex(t.color)};color:${light(t.color) ? "#123" : "#fff"}">${esc(initials(p.n))}</div>
          <h2>${esc(p.n)}</h2>
          <div class="cbig">${row.holes ? parText(row.toPar) : '<span class="tp">–</span>'}</div>
          <div class="cfacts"><div><b>${esc(row.pos)}</b><small>Position</small></div><div><b>${esc(statusText(row.today))}</b><small>${ev.done ? "Final" : "Today"}</small></div><div><b>${row.total || "–"}</b><small>Strokes</small></div></div>
          <p class="hint">Tap to flip</p></div>
        <div class="face back">
          <div class="cband"><b>${esc(p.n)}</b><span>${row.holes ? parText(row.toPar) : ""} · ${esc(row.pos)}</span></div>
          <div class="pills small ctabs">${[["card", "Scorecard"], ["stats", "Stats"], ["rounds", "Rounds"]].map(([k, l]) => `<button type="button" class="pill" data-ct="${k}" aria-pressed="${cs.tab === k}">${l}</button>`).join("")}</div>
          <div class="cbody">${back}</div></div>
      </div>
      <div class="cbtns"><button type="button" class="btn" id="cflip">Flip</button><button type="button" class="btn" data-cclose>Close</button></div></div>`;
    L.innerHTML = html;
    $$("[data-cclose]", L).forEach(b => b.onclick = () => closeCard());
    $("#cflip", L).onclick = flip;
    $(".front", L).onclick = flip;
    $$("[data-ct]", L).forEach(b => b.onclick = e => { e.stopPropagation(); cs.tab = b.dataset.ct; drawCard(false); });
    $$("[data-cr]", L).forEach(b => b.onclick = e => { e.stopPropagation(); cs.r = +b.dataset.cr; drawCard(false); });
    if (fresh) { const f = $("#cflip", L); if (f) f.focus({ preventScroll: true }); }
  }
  function playerCard(ev, p, x) {
    const n = C.holeCount(ev), halves = n === 18 ? [[1, 9, "Out"], [10, 18, "In"]] : [[1, n, "Tot"]], c = ev.course;
    return halves.map(([a, b, lbl]) => { const hs = []; for (let k = a; k <= b; k++) hs.push(k);
      const sum = hs.reduce((s, k) => s + (x.scores[k - 1] || 0), 0), any = hs.some(k => x.scores[k - 1] != null);
      return `<table class="sc pcard"><thead><tr><th class="nm">Hole</th>${hs.map(k => `<th>${k}</th>`).join("")}<th>${lbl}</th></tr></thead><tbody>
        <tr class="ydrow"><th class="nm">Yds</th>${hs.map(k => `<td>${C.yards(c, k, p.tee) || ""}</td>`).join("")}<td>${hs.reduce((s, k) => s + C.yards(c, k, p.tee), 0) || ""}</td></tr>
        <tr class="parrow"><th class="nm">Par</th>${hs.map(k => `<td>${c.holes[k - 1].par}</td>`).join("")}<td>${hs.reduce((s, k) => s + c.holes[k - 1].par, 0)}</td></tr>
        <tr><th class="nm">Score</th>${hs.map(k => { const v = x.scores[k - 1]; return `<td>${v == null ? "" : `<span class="mk ${C.mark(v - c.holes[k - 1].par)}">${v}</span>`}</td>`; }).join("")}<td class="sum">${any ? sum : ""}</td></tr>
      </tbody></table>`; }).join("");
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (S.card) closeCard(); else if ($("#sheets").innerHTML) closeSheet(); } });

  /* ======================================================================
     RENDER
     ====================================================================== */
  function render() {
    const v = $("#view");
    // keep sideways scroll (the hole-by-hole board, scorecards) where it was
    const keep = {}; $$("[data-keep]", v).forEach(el => keep[el.dataset.keep] = [el.scrollLeft, el.scrollTop]);
    if (S.view !== "event") $("#tabs").hidden = true;
    document.body.dataset.view = S.view;
    if (FW.sound) FW.sound.scene(S.view === "event" ? (S.tab === "score" && S.ev ? "course" : "quiet") : "menu");
    ({ home: viewHome, join: viewJoin, new: viewNew, course: viewCourse, event: viewEvent }[S.view] || viewHome)(v);
    $$("[data-keep]", v).forEach(el => { const k = keep[el.dataset.keep]; if (k) { el.scrollLeft = k[0]; el.scrollTop = k[1]; } });
  }
  FW.debug = { S, render };
  FW.ui = { S, esc, write, render, soft, badge: soft, sheet, closeSheet, toast, me, isOrg, teeDot, parText, go, linkFor, openEvent, topbar, wireTop };

  /* ---------- start: a link with ?t=<code> joins or opens that tournament ---------- */
  (function start() {
    const code = new URLSearchParams(location.search).get("t");
    if (code && C.isCode(code)) {
      if (FW.mineGet(code)) { openEvent(code); S.view = "event"; S.tab = "board"; }
      else { S.code = code; S.view = "join"; }
      try { history.replaceState({ fw: S.view, code, tab: S.tab }, "", "?t=" + code); } catch (e) { /* ignore */ }
    } else { try { history.replaceState({ fw: "home" }, "", location.pathname); } catch (e) { /* ignore */ } }
    render();
  })();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
