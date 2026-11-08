/* Scoreboard screen: the big board, the control strip, the clock, the buzzer, keeping the screen awake,
   locking the controls, and the sheets that belong to a game in progress. */
(function () {
  "use strict";
  const SB = window.SB, C = SB.C, $ = SB.$, $$ = SB.$$, esc = SB.esc, ACT = SB.ACT;
  SB.game = null;      // the game in progress (also saved after every action)
  SB.view = "home";    // "home" or "board"
  const storedTV = SB.store.get("tvMode");
  const B = { lock: false, tick: 0, prevScore: null, flashTimer: 0, holdTimer: 0, awakeNoted: false, tv: { mode: (storedTV === "full" || storedTV === "overlay") ? storedTV : "off" }, tvReveal: false };
  const TV_LABELS = { off: "Off", full: "Full board", overlay: "Broadcast overlay" };

  const svg = (d, extra) => '<svg viewBox="0 0 24 24" aria-hidden="true" ' + (extra || 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"') + ">" + d + "</svg>";
  const IC = {
    play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
    pause: svg('<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" stroke="none"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
    next: svg('<path d="M9 5l7 7-7 7"/>'),
    swap: svg('<path d="M7 8h13M16 4l4 4-4 4M17 16H4M8 12l-4 4 4 4"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    log: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    dots: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>')
  };
  SB.icons = IC;

  /* ================= sound and screen awake ================= */
  let ac = null;
  SB.sound = { plays: 0 };
  SB.audioUnlock = function () {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ac) ac = new AC();
      if (ac.state === "suspended") ac.resume();
    } catch (e) { /* no sound on this browser */ }
  };
  /* a harsh two-tone buzzer; loud = longer, louder, three tones */
  SB.buzz = function (loud) {
    SB.sound.plays++; SB.sound.lastLoud = !!loud;
    try { if (navigator.vibrate) navigator.vibrate(loud ? [400, 120, 400] : 300); } catch (e) { /* ignore */ }
    try {
      SB.audioUnlock(); if (!ac) return;
      const t0 = ac.currentTime, dur = loud ? 2.2 : 1.1, g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(loud ? 0.9 : 0.35, t0 + 0.03);
      g.gain.setValueAtTime(loud ? 0.9 : 0.35, t0 + dur - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      g.connect(ac.destination);
      (loud ? [196, 247, 392] : [220, 233]).forEach(f => { const o = ac.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(g); o.start(t0); o.stop(t0 + dur + 0.05); });
    } catch (e) { /* ignore */ }
  };

  SB.wake = { state: "off", lock: null };
  SB.wakeOn = async function () {
    if (!("wakeLock" in navigator) || !navigator.wakeLock || !navigator.wakeLock.request) { SB.wake.state = "unsupported"; return; }
    try {
      if (SB.wake.lock && !SB.wake.lock.released) { SB.wake.state = "on"; return; }
      const l = await navigator.wakeLock.request("screen");
      SB.wake.lock = l; SB.wake.state = "on";
      l.addEventListener("release", () => { if (SB.wake.lock === l) { SB.wake.lock = null; if (SB.wake.state === "on") SB.wake.state = "off"; } });
    } catch (e) { SB.wake.state = "denied"; }
  };
  SB.wakeOff = function () { try { if (SB.wake.lock) SB.wake.lock.release(); } catch (e) { /* ignore */ } SB.wake.lock = null; SB.wake.state = "off"; };
  const wakeNote = () => SB.wake.state === "on" ? "The screen stays on while a game is open."
    : SB.wake.state === "off" ? "The screen stays on while a game is open (starting now)."
      : "This browser can't keep the screen on for you. Set your phone's auto-lock to Never while you keep score.";

  /* ================= acting on the game ================= */
  function announce(text) { const l = $("#live"); if (l) l.textContent = text; }
  function dispatch(a) {
    const g = SB.game; if (!g) return null;
    if (a.t === undefined) a.t = Date.now();
    const n = C.step(g, a);
    if (n === g) return g;
    SB.game = n; SB.save("game", n);
    const fl = C.flashFor(g, n, a);
    if (fl) flash(fl, n);
    announce(C.label(g, a) + ". " + C.summary(n));
    SB.renderBoard();
    return n;
  }
  SB.dispatch = dispatch;

  const FLASH = { BB: ["BB", "Walk"], K: ["K", "Strikeout"], OUT: ["OUT", ""], SIDE: ["3 OUTS", ""], FINAL: ["FINAL", ""], MERCY: ["MERCY", "Mercy rule reached"] };
  function flash(kind, g) {
    const el = $("#flash"); if (!el) return;
    let [big, sub] = FLASH[kind] || [kind, ""];
    if (kind === "SIDE") sub = (g.half === "top" ? "Top" : "Bottom") + " of the " + C.ordinal(g.inning);
    el.innerHTML = '<div class="fl-big">' + esc(big) + "</div>" + (sub ? '<div class="fl-sub">' + esc(sub) + "</div>" : "");
    el.dataset.f = kind; el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(B.flashTimer); B.flashTimer = setTimeout(() => { el.hidden = true; el.classList.remove("show"); }, 1500);
  }
  function hideFlash() { const el = $("#flash"); if (el) { el.hidden = true; el.classList.remove("show"); } clearTimeout(B.flashTimer); }

  /* ================= the clock ticker ================= */
  function clockMs(g, t) { return C.remaining(g.clock, t); }
  function paintClock(g, t) {
    const el = $("#view .clock"); if (!el) return;
    const txt = C.fmtClock(clockMs(g, t));
    if (el.textContent !== txt) el.textContent = txt;
    const lo = clockMs(g, t) < 60000 && g.clock.run;
    el.classList.toggle("low", lo);
  }
  function tick() {
    const g = SB.game;
    if (!g || !g.clock || SB.view !== "board") return;
    const t = Date.now();
    if (C.expired(g.clock, t)) {
      const due = C.buzzDue(g.clock, t);
      const n = C.step(g, { type: "clockExpire", t });
      SB.game = n; SB.save("game", n);
      SB.renderBoard();
      if (due) { announce("Time. End of " + C.periodWord(n).toLowerCase() + "."); if (SB.prefs.sound) SB.buzz(SB.prefs.loud); }
      return;
    }
    paintClock(g, t);
  }
  function startTick() { stopTick(); B.tick = setInterval(tick, 100); }
  function stopTick() { clearInterval(B.tick); B.tick = 0; }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || SB.view !== "board") return;
    SB.wakeOn(); tick();
  });

  /* ================= building the board ================= */
  const nameSize = n => { const L = Array.from(n).length; return L <= 5 ? "s" : L <= 9 ? "m" : "l"; };
  const dots = (n, total) => '<i class="on"></i>'.repeat(Math.max(0, n)) + "<i></i>".repeat(Math.max(0, total - n));
  const attrs = d => Object.keys(d || {}).map(k => " data-" + k + '="' + esc(d[k]) + '"').join("");
  const cb = (inner, o) => {
    o = o || {};
    const fk = Object.keys(o.data || {}).map(k => o.data[k]).join("-");
    return '<button type="button" class="cb' + (o.cls ? " " + o.cls : "") + '"' + attrs(o.data) + ' data-fk="' + esc(fk) + '"' + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : "") +
      (o.dis ? " disabled" : "") + (o.span ? ' style="--sp:' + o.span[0] + ";--spl:" + o.span[1] + '"' : "") + ">" + inner + "</button>";
  };
  const ord = n => ["", "1st", "2nd", "3rd", "4th"][n] || n + "th";
  const sgn = d => (d > 0 ? "+" : "−") + Math.abs(d);

  function teamBlock(g, i, tag, extra) {
    const t = g.teams[i], sc = String(g.score[i]);
    return '<section class="team ' + (i ? "t-away" : "t-home") + '" style="--tc:' + esc(t.c) + '" aria-label="' + esc(t.n) + '">' +
      '<h2 class="t-name" data-l="' + nameSize(t.n) + '">' + esc(t.n) + "</h2>" + (tag || '<div class="t-tag"></div>') +
      '<div class="t-score" data-d="' + Math.min(4, sc.length) + '" data-i="' + i + '" role="img" aria-label="' + esc(t.n) + " " + sc + '">' + sc + "</div>" + (extra || "") + "</section>";
  }
  function clockHTML(g, t) {
    const ms = clockMs(g, t), run = g.clock.run, zero = !run && g.clock.left <= 0;
    return '<button type="button" class="clock' + (run && ms < 60000 ? " low" : "") + '" data-act="b-clock" aria-label="Game clock ' + C.fmtClock(ms) + '. Tap to set the time.">' + C.fmtClock(ms) + "</button>" +
      '<div class="clk-state ' + (zero ? "zero" : run ? "run" : "stop") + '">' + (zero ? "TIME" : run ? "RUNNING" : "STOPPED") + "</div>" +
      '<div class="period">' + esc(C.periodWord(g).toUpperCase()) + "</div>";
  }
  const endBanner = g => (!g.clock.run && g.clock.left <= 0) ? '<div class="end-banner" role="status">End of ' + esc(C.periodWord(g).toLowerCase()) + "</div>" : "";
  const lastLabel = g => C.canUndo(g) ? g.u[g.u.length - 1].l : "";
  const undoBtn = (g, span) => cb(IC.undo + "<span>Undo</span>", { cls: "undo", span: span, data: { act: "undo" }, dis: !C.canUndo(g), aria: C.canUndo(g) ? "Undo: " + lastLabel(g) : "Undo (nothing to undo yet)" });
  const clockBtn = g => cb((g.clock.run ? IC.pause : IC.play) + "<span>" + (g.clock.run ? "Stop" : "Start") + "</span>", { cls: "go " + (g.clock.run ? "stop" : "start"), span: [2, 2], data: { act: "clock" }, aria: g.clock.run ? "Stop the clock" : "Start the clock" });
  const periodBtn = g => {
    const nxt = C.periodAbbr(g, g.period + 1), zero = !g.clock.run && g.clock.left <= 0;
    return cb('<span class="s1">NEXT</span><span>' + esc(nxt) + "</span>", { cls: "per stk" + (zero ? " attn" : ""), span: [1, 1], data: { act: "a", t: "period", d: 1 }, aria: "Start " + C.periodWord(g, g.period + 1).toLowerCase() });
  };
  const scoreBtn = (g, i, d, cls) => cb(sgn(d), { cls: (d > 0 ? "tc big " : "minus ") + (cls || ""), data: { act: "a", t: "score", team: i, d: d }, aria: g.teams[i].n + (d > 0 ? " plus " : " minus ") + Math.abs(d) + (Math.abs(d) === 1 ? " point" : " points") });
  const cluster = (g, i, inner) => '<div class="c-team c-' + (i ? "away" : "home") + '" style="--tc:' + esc(g.teams[i].c) + '">' + inner + "</div>";

  /* ----- basketball ----- */
  function bbBoard(g, t) {
    const bn = C.bonus(g), total = Math.max(g.cfg.timeouts, g.to[0], g.to[1]);
    const ext = i => '<div class="t-stats"><div class="stat"><span class="k">FOULS</span><b class="v">' + g.fouls[i] + '</b></div>' +
      '<div class="stat"><span class="k">T.O.</span><span class="dots" role="img" aria-label="' + g.to[i] + ' timeouts left">' + dots(g.to[i], total) + "</span></div>" +
      '<div class="bonus' + (bn[i] ? " on" : "") + '"' + (bn[i] ? "" : ' aria-hidden="true"') + ">BONUS</div></div>";
    const p = g.poss, mid = '<section class="mid" aria-label="Clock and period">' + clockHTML(g, t) +
      '<div class="poss" role="img" aria-label="' + (p < 0 ? "Possession arrow not set" : "Possession arrow: " + esc(g.teams[p].n)) + '"><i class="tl' + (p === 0 ? " on" : "") + '"></i><span>ARROW</span><i class="tr' + (p === 1 ? " on" : "") + '"></i></div>' + endBanner(g) + "</section>";
    const ctl = i => cluster(g, i, scoreBtn(g, i, 1) + scoreBtn(g, i, 2) + scoreBtn(g, i, 3) + scoreBtn(g, i, -1) +
      cb("Foul", { data: { act: "a", t: "foul", team: i, d: 1 }, aria: g.teams[i].n + " team foul" }) +
      cb("T.O.", { data: { act: "a", t: "timeout", team: i, d: -1 }, dis: g.to[i] <= 0, aria: g.teams[i].n + " timeout (" + g.to[i] + " left)" }));
    const midc = '<div class="c-mid">' + clockBtn(g) + periodBtn(g) +
      cb(IC.swap + "<span>Arrow</span>", { cls: "stk", span: [1, 1], data: { act: "a", t: "poss", team: "flip" }, aria: "Flip the possession arrow" }) + undoBtn(g, [2, 2]) + "</div>";
    return { face: teamBlock(g, 0, "", ext(0)) + mid + teamBlock(g, 1, "", ext(1)), ctl: ctl(0) + midc + ctl(1) };
  }
  /* ----- football ----- */
  function fbBoard(g, t) {
    const ddTxt = ord(g.down) + " &amp; " + (g.togo === 0 ? "Goal" : g.togo);
    const tag = i => '<button type="button" class="tag" data-act="a" data-t="poss" data-team="' + i + '" data-fk="poss' + i + '" aria-pressed="' + (g.poss === i) + '" aria-label="' + esc(g.teams[i].n) + ' has the ball"><i></i>BALL</button>';
    const ext = i => '<div class="t-stats"><div class="stat"><span class="k">T.O.</span><span class="dots" role="img" aria-label="' + g.to[i] + ' timeouts left">' + dots(g.to[i], Math.max(g.cfg.timeouts, g.to[i])) + "</span></div>" + tag(i) + "</div>";
    const mid = '<section class="mid" aria-label="Clock, quarter and down">' + clockHTML(g, t) +
      '<button type="button" class="dd" data-act="b-down" data-fk="dd" aria-label="' + ord(g.down) + " and " + (g.togo === 0 ? "goal" : g.togo) + (g.ballOn ? ", ball on " + esc(g.ballOn) : "") + '. Tap to change."><span class="dd-m">' + ddTxt + "</span>" +
      '<span class="dd-s">' + (g.ballOn ? "BALL ON " + esc(g.ballOn.toUpperCase()) : "TAP TO SET BALL SPOT") + "</span></button>" + endBanner(g) + "</section>";
    const ctl = i => cluster(g, i, scoreBtn(g, i, 6) + scoreBtn(g, i, 3) + scoreBtn(g, i, 2) + scoreBtn(g, i, 1) + scoreBtn(g, i, -1) +
      cb("T.O.", { data: { act: "a", t: "timeout", team: i, d: -1 }, dis: g.to[i] <= 0, aria: g.teams[i].n + " timeout (" + g.to[i] + " left)" }));
    const midc = '<div class="c-mid fb">' + clockBtn(g) + cb('<span class="s1">NEXT</span><span>' + esc(C.periodAbbr(g, g.period + 1)) + "</span>", { cls: "per stk" + (!g.clock.run && g.clock.left <= 0 ? " attn" : ""), span: [2, 1], data: { act: "a", t: "period", d: 1 }, aria: "Start " + C.periodWord(g, g.period + 1).toLowerCase() }) +
      undoBtn(g, [2, 1]) + cb("<span>Next down</span>", { span: [3, 1], data: { act: "nextdown" }, aria: "Next down" }) + cb("<span>1st &amp; " + g.cfg.firstDown + "</span>", { span: [3, 1], data: { act: "a", t: "firstDown" }, aria: "First down" }) + "</div>";
    return { face: teamBlock(g, 0, "", ext(0)) + mid + teamBlock(g, 1, "", ext(1)), ctl: ctl(0) + midc + ctl(1) };
  }
  /* ----- baseball ----- */
  function bsBoard(g) {
    const B_ = C.batIdx(g), F_ = 1 - B_, top = g.half === "top";
    const stats = i => '<div class="t-stats"><div class="stat"><span class="k">H</span><b class="v">' + g.hits[i] + '</b></div><div class="stat"><span class="k">E</span><b class="v">' + g.errs[i] + "</b></div>" +
      (g.cfg.pitch ? '<div class="stat"><span class="k">PITCHES</span><b class="v">' + g.pitches[i] + "</b></div>" : "") + "</div>";
    const tag = i => '<div class="t-tag' + (i === B_ && !g.final ? " on" : "") + '">' + (i === B_ && !g.final ? "AT BAT" : "") + "</div>";
    const cnt = (k, n, max, cls) => '<div class="cnt ' + cls + '"><span class="k">' + k + '</span><span class="dots" role="img" aria-label="' + n + " " + (k === "B" ? "balls" : k === "S" ? "strikes" : "outs") + '">' + dots(n, max) + "</span></div>";
    const banners = (g.final ? '<div class="end-banner" role="status"><span>FINAL</span><button type="button" class="reopen" data-act="a" data-t="reopen">Not over? Reopen</button></div>' : "") +
      (C.mercy(g) ? '<div class="end-banner mercy" role="status">Mercy rule reached</div>' : "");
    const od = g.onDeck || { name: "", num: "" };
    const onDeckBtn = '<button type="button" class="ondeck-set' + (od.name ? " has" : "") + '" data-act="b-ondeck" aria-label="' +
      (od.name ? "On deck: " + esc(od.name) + (od.num ? ", number " + esc(od.num) : "") + ". Tap to change." : "Add the on-deck batter's name and number") + '">' +
      '<span class="od-k">ON DECK</span><span class="od-v">' + (od.name ? esc(od.name) + (od.num ? ' <b>#' + esc(od.num) + "</b>" : "") : "Tap to add") + "</span></button>";
    const mid = '<section class="mid" aria-label="Inning and count"><div class="inn" role="img" aria-label="' + (top ? "Top" : "Bottom") + " of the " + C.ordinal(g.inning) + '"><i class="tri ' + (top ? "up" : "down") + '"></i><b>' + g.inning + "</b></div>" +
      '<div class="count">' + cnt("B", g.balls, 3, "b") + cnt("S", g.strikes, 2, "s") + cnt("O", g.outs, 2, "o") + "</div>" + onDeckBtn + banners + "</section>";
    const dis = g.final;
    const pb = (txt, t, extra, o) => cb(txt, Object.assign({ data: Object.assign({ act: "a", t: t }, extra || {}), dis: dis && !o.live }, o));
    const sub = (main, i) => "<span>" + main + '</span><small style="color:' + esc(g.teams[i].c) + '">' + esc(g.teams[i].n) + "</small>";
    const strip = '<div class="c-mid bs">' +
      pb("<span>Ball</span>", "ball", null, { cls: "bsb ball" }) + pb("<span>Strike</span>", "strike", null, { cls: "bsb strike" }) +
      pb("<span>Foul</span>", "foul", null, { cls: "bsb" }) + pb("<span>Out</span>", "out", null, { cls: "bsb out" }) +
      pb(sub("Run +1", B_), "run", { d: 1 }, { cls: "run sub", live: true, aria: g.teams[B_].n + " run plus 1" }) +
      pb(sub("Run −1", B_), "run", { d: -1 }, { cls: "run minus sub", live: true, aria: g.teams[B_].n + " run minus 1" }) +
      pb(sub("Hit", B_), "hit", null, { cls: "sub", aria: g.teams[B_].n + " hit" }) + pb(sub("Error", F_), "error", null, { cls: "sub", aria: g.teams[F_].n + " error" }) +
      pb("<span>End half</span>", "endHalf", null, { span: [2, 2], aria: "End the half inning" }) + undoBtn(g, [2, 2]) + "</div>";
    return { face: teamBlock(g, 0, tag(0), stats(0)) + mid + teamBlock(g, 1, tag(1), stats(1)) + '<div class="b-extra">' + SB.lineScoreHTML(g, true) + "</div>", ctl: strip };
  }
  /* ----- just keep score ----- */
  function gnBoard(g) {
    const ctl = i => cluster(g, i, scoreBtn(g, i, 1) + scoreBtn(g, i, 5) + scoreBtn(g, i, 10) + scoreBtn(g, i, -1) + scoreBtn(g, i, -5) + scoreBtn(g, i, -10));
    const mid = '<section class="mid"><button type="button" class="plabel' + (g.label ? "" : " empty") + '" data-act="b-label" data-fk="plabel" aria-label="Period label: ' + esc(g.label || "none") + '. Tap to change.">' + (g.label ? esc(g.label) : '<span class="ph">Tap to add a label</span>') + "</button></section>";
    const midc = '<div class="c-mid gn">' + cb("<span>Label</span>", { span: [3, 1], data: { act: "b-label" }, aria: "Edit the period label" }) + undoBtn(g, [3, 1]) + "</div>";
    return { face: teamBlock(g, 0, "", "") + mid + teamBlock(g, 1, "", ""), ctl: ctl(0) + midc + ctl(1) };
  }

  /* line score table, shared with the recent-game view */
  SB.lineScoreHTML = function (g, live) {
    const ls = C.lineScore(g); if (!ls) return "";
    const bi = C.batIdx(g);
    return '<div class="ls-wrap"><table class="ls"><caption class="sr">Line score</caption><thead><tr><th scope="col"><span class="sr">Team</span></th>' +
      ls.cols.map(c => "<th scope=\"col\">" + esc(c) + "</th>").join("") + (ls.hasHE ? '<th scope="col" class="tot">R</th><th scope="col" class="tot">H</th><th scope="col" class="tot">E</th>' : '<th scope="col" class="tot">T</th>') + "</tr></thead><tbody>" +
      ls.rows.map(r => '<tr style="--tc:' + esc(g.teams[r.team].c) + '"><th scope="row" class="tn">' + esc(r.name) + "</th>" +
        r.cells.map((c, x) => "<td" + (live && g.sport === "baseball" && !g.final && r.team === bi && x + 1 === g.inning ? ' class="cur"' : "") + ">" + esc(c) + "</td>").join("") +
        '<td class="tot">' + r.r + "</td>" + (ls.hasHE ? '<td class="tot">' + r.h + '</td><td class="tot">' + r.e + "</td>" : "") + "</tr>").join("") + "</tbody></table></div>";
  };

  function boardHTML(g) {
    const t = Date.now();
    const parts = g.sport === "basketball" ? bbBoard(g, t) : g.sport === "football" ? fbBoard(g, t) : g.sport === "baseball" ? bsBoard(g) : gnBoard(g);
    const tv = B.tv.mode, od = g.sport === "baseball" ? (g.onDeck || { name: "", num: "" }) : { name: "", num: "" };
    const lowerThird = (tv !== "off" && od.name) ?
      '<div class="lower-third" aria-hidden="true"><span class="lt-k">ON DECK</span><span class="lt-name">' + esc(od.name) + "</span>" + (od.num ? '<span class="lt-num">#' + esc(od.num) + "</span>" : "") + "</div>" : "";
    const revealTab = tv !== "off" ? '<button type="button" class="tv-reveal" data-act="tv-reveal" aria-label="' + (B.tvReveal ? "Hide scoring controls" : "Show scoring controls") + '" aria-pressed="' + B.tvReveal + '">' + IC.dots + "</button>" : "";
    return '<div class="board sp-' + g.sport + (B.lock ? " locked" : "") + (tv !== "off" ? " tv-" + tv + (B.tvReveal ? " tv-reveal-on" : "") : "") + (lowerThird ? " has-lt" : "") + '" id="board">' +
      '<header class="b-top"><button type="button" class="tb" data-act="b-home" aria-label="Back to the home screen (the game stays saved)">' + IC.back + "</button>" +
      '<div class="b-title">' + esc(C.sportInfo(g.sport).label.split(" ")[0]) + "</div>" +
      '<button type="button" class="tb" data-act="b-log" aria-label="Undo log">' + IC.log + "</button>" +
      '<button type="button" class="tb" data-act="b-lock" aria-label="Lock controls" aria-pressed="' + B.lock + '">' + IC.lock + "</button>" +
      '<button type="button" class="tb" data-act="b-menu" aria-label="Game menu">' + IC.dots + "</button></header>" +
      '<main class="b-face" id="face" aria-label="Scoreboard">' + parts.face + "</main>" +
      '<footer class="b-ctl" aria-label="Score controls">' + parts.ctl + "</footer>" + lowerThird + revealTab + "</div>";
  }

  SB.renderBoard = function () {
    const g = SB.game, view = $("#view");
    if (!g || !view) return;
    const ae = document.activeElement, fk = ae && view.contains(ae) ? ae.dataset.fk : null;
    view.innerHTML = boardHTML(g);
    $("#app").classList.add("on-board"); document.body.classList.add("board-open");
    const bd = $("#board"); if (bd) bd.inert = B.lock;
    const un = $("#unlock"); if (un) un.hidden = !B.lock;
    if (fk && !B.lock) { const nb = $('[data-fk="' + fk.replace(/"/g, "") + '"]', view); if (nb && !nb.disabled) { try { nb.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
    const prev = B.prevScore;
    if (prev && !SB.reduced()) [0, 1].forEach(i => { if (prev[i] !== g.score[i]) { const el = $('.t-score[data-i="' + i + '"]', view); if (el) el.classList.add("pop"); } });
    B.prevScore = g.score.slice();
    document.title = g.teams[0].n + " " + g.score[0] + " - " + g.score[1] + " " + g.teams[1].n + " | Scoreboard";
  };

  /* ================= entering and leaving ================= */
  SB.enterBoard = function () {
    if (!SB.game) return;
    SB.view = "board"; SB.boardDepth = 1; SB.syncHistory();
    SB.store.set("view", "board");
    B.prevScore = SB.game.score.slice(); B.lock = false; B.tvReveal = false;
    SB.renderBoard();
    startTick(); SB.wakeOn().then(() => { if (SB.wake.state !== "on" && !B.awakeNoted && SB.view === "board") { B.awakeNoted = true; SB.toast(wakeNote(), "", 6000); } });
    tick();
  };
  SB.leaveBoard = function (fromBack) {
    if (SB.view !== "board") return;
    stopTick(); hideFlash(); SB.wakeOff(); B.lock = false; clearTimeout(B.holdTimer);
    const un = $("#unlock"); if (un) un.hidden = true;
    SB.view = "home"; SB.boardDepth = 0; SB.store.set("view", "home");
    SB.closeAllSheets();
    $("#app").classList.remove("on-board"); document.body.classList.remove("board-open");
    document.title = "Scoreboard: A Scoreboard for Any Gym or Field";
    SB.syncHistory();
    SB.renderHome();
    void fromBack;
  };
  SB.onBoardBack = () => SB.leaveBoard(true);

  /* ================= lock controls ================= */
  function setLock(on) {
    B.lock = on; SB.renderBoard();
    const un = $("#unlock");
    if (un) { un.hidden = !on; if (on) { try { un.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
    if (on) announce("Controls locked. Press and hold the unlock button for one second to unlock."); else announce("Controls unlocked.");
  }
  (function wireHold() {
    const un = $("#unlock"); if (!un) return;
    const start = () => { if (B.holdTimer) return; un.classList.add("holding"); B.holdTimer = setTimeout(() => { B.holdTimer = 0; un.classList.remove("holding"); setLock(false); }, 1000); };
    const stop = () => { clearTimeout(B.holdTimer); B.holdTimer = 0; un.classList.remove("holding"); };
    un.addEventListener("pointerdown", e => { e.preventDefault(); start(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => un.addEventListener(ev, stop));
    un.addEventListener("contextmenu", e => e.preventDefault());
    un.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
    un.addEventListener("keyup", e => { if (e.key === "Enter" || e.key === " ") stop(); });
    un.addEventListener("blur", stop);
  })();

  /* ================= button handlers ================= */
  ACT.a = el => {
    const g = SB.game; if (!g) return;
    const a = { type: el.dataset.t };
    Object.keys(el.dataset).forEach(k => { if (k === "act" || k === "t" || k === "fk") return; const v = el.dataset[k]; a[k] = /^-?\d+$/.test(v) ? Number(v) : v; });
    if (a.type === "period" && a.d > 0 && g.clock) SB.audioUnlock();
    dispatch(a);
  };
  ACT.clock = () => {
    const g = SB.game; if (!g || !g.clock) return;
    SB.audioUnlock();
    if (g.clock.run) return dispatch({ type: "clockStop" });
    if (g.clock.left <= 0) return SB.toast("The clock is at 0:00. Start the next period, or tap the clock to set a time.");
    dispatch({ type: "clockStart" });
  };
  ACT.undo = () => {
    const g = SB.game; if (!g || !C.canUndo(g)) return;
    const l = g.u[g.u.length - 1].l;
    SB.game = C.undo(g); SB.save("game", SB.game); announce("Undid: " + l + ". " + C.summary(SB.game));
    SB.renderBoard(); SB.toast("Undid: " + l, "ok", 1800);
    refreshLog();
  };
  ACT.nextdown = () => {
    const g = SB.game; if (!g) return;
    if (g.down < 4) return dispatch({ type: "nextDown" });
    const who = g.poss < 0 ? "" : " The ball goes to " + g.teams[1 - g.poss].n + ".";
    SB.confirmSheet({ title: "Turnover on downs?", message: "That was 4th down." + who + " It becomes 1st & " + g.cfg.firstDown + ".", confirmText: "Turnover", cancelText: "Not yet", onConfirm() { dispatch({ type: "nextDown" }); } });
  };
  ACT["b-home"] = () => SB.leaveBoard();
  ACT["b-lock"] = () => setLock(!B.lock);

  /* ----- clock sheet ----- */
  ACT["b-clock"] = () => {
    const g = SB.game; if (!g || !g.clock) return;
    SB.closeAllSheets();
    const ms = Math.round(clockMs(g, Date.now()) / 1000) * 1000, mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60;
    const full = C.periodLen(g);
    const q = (txt, d, lab) => '<button type="button" class="btn ghost small" data-qadj="' + d + '" aria-label="' + lab + '">' + txt + "</button>";
    SB.openSheet({
      title: "Set the clock", autofocus: "#c-min",
      html: '<div class="len-row big"><label><span class="hint">Minutes</span><input type="number" inputmode="numeric" id="c-min" min="0" max="99" value="' + mm + '" aria-label="Minutes"></label><span class="colon" aria-hidden="true">:</span>' +
        '<label><span class="hint">Seconds</span><input type="number" inputmode="numeric" id="c-sec" min="0" max="59" value="' + (ss < 10 ? "0" : "") + ss + '" aria-label="Seconds"></label></div>' +
        '<div class="row wrap qrow">' + q("−1 min", -60, "Minus one minute") + q("+1 min", 60, "Plus one minute") + q("−10 s", -10, "Minus ten seconds") + q("+10 s", 10, "Plus ten seconds") + q("−1 s", -1, "Minus one second") + q("+1 s", 1, "Plus one second") + "</div>" +
        '<div class="row wrap qrow"><button type="button" class="btn ghost small" data-qfull>Full ' + esc(C.periodWord(g).toLowerCase()) + " (" + C.fmtClock(full * 1000) + ')</button></div>' +
        '<p class="hint" style="margin-top:10px">' + (g.clock.run ? "The clock is running. It keeps running from the new time." : "The clock is stopped. Tap Start on the board when play starts.") + "</p>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-setclock>Set clock</button>',
      onOpen(api) {
        const mn = $("#c-min", api.el), sc = $("#c-sec", api.el);
        const cur = () => (Number(mn.value) || 0) * 60 + (Number(sc.value) || 0);
        const put = s => { s = Math.max(0, Math.min(5999, s)); mn.value = Math.floor(s / 60); sc.value = (s % 60 < 10 ? "0" : "") + (s % 60); };
        api.el.addEventListener("click", e => {
          const qa = e.target.closest("[data-qadj]"); if (qa) put(cur() + Number(qa.dataset.qadj));
          if (e.target.closest("[data-qfull]")) put(full);
          if (e.target.closest("[data-setclock]")) { const v = cur(); api.close(); dispatch({ type: "clockSet", ms: v * 1000 }); }
        });
        api.el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); $("[data-setclock]", api.el).click(); } });
      }
    });
  };

  /* ----- football down and distance ----- */
  ACT["b-down"] = () => {
    const g = SB.game; if (!g || g.sport !== "football") return;
    const body = g => '<div class="field"><span class="label">Down</span>' + SB.pills("down", [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"]], g.down, "Down") + "</div>" +
      '<div class="field"><span class="label">Yards to go</span><div class="stepper-row"><button type="button" class="st" data-togo="-5" aria-label="Minus five yards">−5</button><button type="button" class="st" data-togo="-1" aria-label="Minus one yard">−1</button>' +
      '<output class="togo-v" id="togo-v" aria-live="polite">' + (g.togo === 0 ? "Goal" : g.togo) + '</output><button type="button" class="st" data-togo="1" aria-label="Plus one yard">+1</button><button type="button" class="st" data-togo="5" aria-label="Plus five yards">+5</button></div><span class="hint">Set 0 for goal to go.</span></div>' +
      '<label class="field"><span class="label">Ball on (optional)</span><input type="text" id="d-ball" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="For example OWN 35" value="' + esc(g.ballOn) + '"></label>' +
      '<div class="row wrap" style="gap:8px"><button type="button" class="btn ghost small" data-dd="first">1st &amp; ' + g.cfg.firstDown + '</button><button type="button" class="btn ghost small" data-dd="turn">Turnover (switch ball)</button></div>';
    SB.openSheet({
      title: "Down & distance", html: body(g), footer: '<button type="button" class="btn" data-close>Done</button>',
      onOpen(api) {
        const refresh = () => {
          const n = SB.game;
          $$('[data-pills="down"] button', api.el).forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === n.down)));
          $("#togo-v", api.el).textContent = n.togo === 0 ? "Goal" : n.togo;
          $("#d-ball", api.el).value = n.ballOn;
        };
        api.el.addEventListener("click", e => {
          const d = e.target.closest('[data-pills="down"] button'), s = e.target.closest("[data-togo]"), x = e.target.closest("[data-dd]");
          if (d) { dispatch({ type: "down", n: Number(d.dataset.v) }); refresh(); }
          if (s) { dispatch({ type: "togo", d: Number(s.dataset.togo) }); refresh(); }
          if (x) { dispatch({ type: x.dataset.dd === "first" ? "firstDown" : "turnover" }); refresh(); }
        });
        $("#d-ball", api.el).addEventListener("change", e => { dispatch({ type: "ballOn", text: e.target.value }); refresh(); });
      }
    });
  };

  /* ----- on-deck batter (baseball only): a quick name/number for the TV lower third ----- */
  ACT["b-ondeck"] = () => {
    const g = SB.game; if (!g || g.sport !== "baseball") return;
    const od = g.onDeck || { name: "", num: "" };
    SB.openSheet({
      title: "On deck", autofocus: "#od-name",
      html: '<label class="field"><span class="label">Batter’s name</span><input type="text" id="od-name" maxlength="24" autocomplete="off" placeholder="For example Jake T." value="' + esc(od.name) + '"></label>' +
        '<label class="field"><span class="label">Number (optional)</span><input type="text" inputmode="numeric" id="od-num" maxlength="4" autocomplete="off" placeholder="For example 7" value="' + esc(od.num) + '"></label>' +
        '<p class="hint">Shows as a lower third on the TV display while this sheet is closed.</p>',
      footer: '<button type="button" class="btn ghost" data-clear>Clear</button><button type="button" class="btn" data-save>Save</button>',
      onOpen(api) {
        const save = () => { const nm = $("#od-name", api.el).value, nu = $("#od-num", api.el).value; api.close(); dispatch({ type: "onDeck", name: nm, num: nu }); };
        $("[data-save]", api.el).addEventListener("click", save);
        $("[data-clear]", api.el).addEventListener("click", () => { api.close(); dispatch({ type: "onDeck", name: "", num: "" }); });
        $("#od-name", api.el).addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
      }
    });
  };

  /* ----- TV display: cast/mirror this phone to a bigger screen ----- */
  function setTVMode(mode) {
    if (!(mode in TV_LABELS)) return;
    B.tv.mode = mode; B.tvReveal = false; SB.store.set("tvMode", mode);
    SB.renderBoard();
  }
  ACT["tv-reveal"] = () => { B.tvReveal = !B.tvReveal; SB.renderBoard(); };
  ACT["b-tv"] = () => {
    const g = SB.game; if (!g) return;
    SB.openSheet({
      title: "Cast to TV", cls: "tall",
      html: '<p class="msg mute" style="margin-bottom:10px">Mirror this phone to a TV (AirPlay, screen mirroring or an HDMI cable), then pick how it should look there. Tap the small dot in the corner any time to bring the scoring controls back for a moment.</p>' +
        SB.pills("tvmode", [["off", "Off"], ["full", "Full board"], ["overlay", "Broadcast overlay"]], B.tv.mode, "TV display style") +
        '<p class="hint" style="margin-top:10px">Full board fills the whole screen with no buttons showing — best when the TV IS the scoreboard. Broadcast overlay shrinks it into a corner, for when something else is sharing the screen.</p>',
      footer: '<button type="button" class="btn" data-close>Done</button>',
      onOpen(api) {
        api.el.addEventListener("click", e => {
          const b = e.target.closest('[data-pills="tvmode"] button'); if (b) setTVMode(b.dataset.v);
        });
      }
    });
  };

  /* ----- generic period label ----- */
  ACT["b-label"] = () => {
    const g = SB.game; if (!g) return;
    SB.openSheet({
      title: "Period label", autofocus: "#pl-in",
      html: '<label class="field"><span class="label">Shown under the scores</span><input type="text" id="pl-in" maxlength="24" autocomplete="off" placeholder="For example Round 2" value="' + esc(g.label) + '"></label>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save</button>',
      onOpen(api) {
        const save = () => { const v = $("#pl-in", api.el).value; api.close(); dispatch({ type: "plabel", text: v }); };
        $("[data-save]", api.el).addEventListener("click", save);
        $("#pl-in", api.el).addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });   // preventDefault: the Enter must not also "press" the button that gets focus when the sheet closes
      }
    });
  };

  /* ----- undo log ----- */
  let logSheet = null;
  function logHTML(g) {
    const l = C.undoLog(g);
    return l.length ? '<ol class="log">' + l.map((x, i) => "<li" + (i === 0 ? ' class="first"' : "") + ">" + esc(x) + "</li>").join("") + "</ol>" +
      '<p class="hint">Newest first. Undo takes back the top one. The log keeps the last ' + C.UNDO_LIMIT + " actions.</p>"
      : '<p class="msg mute">Nothing to undo yet. Every score, foul, strike and so on shows up here as you go.</p>';
  }
  function refreshLog() { if (logSheet && !logSheet.closed) { logSheet.body.innerHTML = logHTML(SB.game); const u = $("[data-undo-top]", logSheet.el); if (u) u.disabled = !C.canUndo(SB.game); } }
  ACT["b-log"] = () => {
    const g = SB.game; if (!g) return;
    logSheet = SB.openSheet({
      title: "Undo log", html: logHTML(g), cls: "tall",
      footer: '<button type="button" class="btn ghost" data-close>Close</button><button type="button" class="btn" data-undo-top' + (C.canUndo(g) ? "" : " disabled") + ">Undo last</button>",
      onOpen(api) { $("[data-undo-top]", api.el).addEventListener("click", () => ACT.undo()); },
      onClose() { logSheet = null; }
    });
  };

  /* ----- fix numbers ----- */
  function fixRows(g) {
    const r = [];
    const row = (label, k, vals, max, extra) => r.push({ label, k, vals, max, extra: extra || {} });
    if (g.sport === "baseball") {
      for (let i = 0; i < g.inning; i++) row("Runs, inning " + (i + 1), "inn", [g.inn[0][i], g.inn[1][i]], 99, { i: i });
      row("Hits", "hits", g.hits, 99); row("Errors", "errs", g.errs, 99);
      if (g.cfg.pitch) row("Pitches (new pitcher: set 0)", "pitches", g.pitches, 999);
    } else {
      row("Score", "score", g.score, C.MAX_SCORE);
      if (g.sport === "basketball") row("Team fouls", "fouls", g.fouls, 99);
      if (g.to) row("Timeouts left", "to", g.to, 9);
    }
    return r;
  }
  ACT["b-fix"] = () => {
    const g = SB.game; if (!g) return;
    const rows = fixRows(g);
    SB.openSheet({
      title: "Fix numbers", cls: "tall",
      html: '<p class="msg mute" style="margin-bottom:8px">Change a number directly. Each fix goes in the undo log.</p><div class="fix-head" aria-hidden="true"><span></span><span style="color:' + esc(g.teams[0].c) + '">' + esc(g.teams[0].n) + '</span><span style="color:' + esc(g.teams[1].c) + '">' + esc(g.teams[1].n) + "</span></div>" +
        rows.map((r, ri) => '<div class="fix-row"><span class="fl">' + esc(r.label) + "</span>" + [0, 1].map(i => '<input type="number" inputmode="numeric" class="fix-in" min="0" max="' + r.max + '" value="' + r.vals[i] + '" data-row="' + ri + '" data-team="' + i + '" aria-label="' + esc(r.label + ", " + g.teams[i].n) + '">').join("") + "</div>").join(""),
      footer: '<button type="button" class="btn" data-close>Done</button>',
      onOpen(api) {
        api.el.addEventListener("change", e => {
          const inp = e.target.closest(".fix-in"); if (!inp) return;
          const r = rows[Number(inp.dataset.row)], team = Number(inp.dataset.team);
          dispatch(Object.assign({ type: "set", k: r.k, team: team, v: inp.value === "" ? 0 : Number(inp.value) }, r.extra.i !== undefined ? { i: r.extra.i } : {}));
          const n = SB.game;
          const map = { score: n.score, fouls: n.fouls, to: n.to, hits: n.hits, errs: n.errs, pitches: n.pitches };
          const vals = r.k === "inn" ? [n.inn[0][r.extra.i], n.inn[1][r.extra.i]] : map[r.k];
          if (vals) inp.value = vals[team];
        });
      }
    });
  };

  /* ----- game menu ----- */
  SB.focusAfterSheets = () => (SB.view === "board" ? $('#view [data-act="b-menu"]') : null);
  ACT["b-menu"] = () => {
    const g = SB.game; if (!g) return;
    const li = (act, t, sub, danger) => '<button type="button" class="list-btn' + (danger ? " danger" : "") + '" data-act="' + act + '"><span class="t">' + t + (sub ? "<small>" + sub + "</small>" : "") + "</span>" + IC.next + "</button>";
    SB.openSheet({
      title: "Game menu", cls: "tall",
      html: '<div class="list">' + li("b-edit", "Teams &amp; rules", "Names, colors, period length, innings...") + (g.clock ? li("b-clock", "Set the clock", "Type a minutes and seconds time") : "") + li("b-fix", "Fix numbers", "Change a score, foul, timeout or run directly") + li("b-log", "Undo log", "See and take back recent actions") + li("b-tv", "Cast to TV", TV_LABELS[B.tv.mode]) + "</div>" +
        (g.clock ? '<div class="menu-sec">' + SB.toggle("sound", "Buzzer sound", SB.prefs.sound, "Plays when the clock reaches zero.") + SB.toggle("loud", "Loud buzzer", SB.prefs.loud, "Longer and louder.") +
          '<button type="button" class="btn ghost small" data-act="test-buzz" style="margin-top:6px">Test the buzzer</button></div>' : "") +
        '<div class="list" style="margin-top:12px">' + li("share-text", "Share result", "Copies the score as text") + li("share-pic", "Share picture", "A picture of the board") + "</div>" +
        '<div class="list" style="margin-top:12px">' + li("b-finish", "Finish game", "Save it to Recent games") + li("b-discard", "Throw this game away", "Nothing is saved", true) + "</div>" +
        '<p class="hint" style="margin-top:12px">' + esc(wakeNote()) + "</p>",
      onOpen(api) {
        api.el.addEventListener("switch", () => {
          SB.prefs.sound = SB.switchVal(api.el, "sound"); SB.prefs.loud = SB.switchVal(api.el, "loud"); SB.savePrefs();
        });
      }
    });
  };
  ACT["test-buzz"] = () => { SB.audioUnlock(); SB.buzz(SB.prefs.loud); };
  const liveStatus = g => (g.final ? "final" : "live");
  ACT["share-text"] = () => { if (SB.game) SB.shareResult(SB.game, liveStatus(SB.game)); };
  ACT["share-pic"] = () => { if (SB.game) SB.sharePicture(SB.game, liveStatus(SB.game)); };

  /* ----- teams & rules for this game ----- */
  ACT["b-edit"] = () => {
    const g = SB.game; if (!g) return;
    SB.closeAllSheets();
    SB.openSheet({
      title: "Teams & rules", cls: "tall", html: SB.teamsHTML(g.teams) + '<h3 class="sub-h">' + esc(C.sportInfo(g.sport).label) + " rules</h3>" + SB.rulesHTML(g.sport, g.cfg),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save</button>',
      onOpen(api) {
        SB.wireRules(api.el);
        $("[data-save]", api.el).addEventListener("click", () => {
          const tms = SB.readTeams(api.el), cfg = SB.readRules(api.el, g.sport, g.cfg);
          api.close();
          const now = Date.now();
          [0, 1].forEach(i => { SB.game = C.apply(SB.game, { type: "team", team: i, n: tms[i].n, c: tms[i].c, t: now }); });
          SB.game = C.apply(SB.game, { type: "cfg", cfg: cfg, t: now });
          SB.save("game", SB.game); SB.renderBoard(); SB.toast("Saved.", "ok", 1500);
        });
      }
    });
  };
})();
