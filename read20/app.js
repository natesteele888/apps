/* Read 20: the screens. Shelf, reader (with the nightly timer), log, settings.
   Everything is saved on this phone only (localStorage). Nothing is sent anywhere. */
(function () {
  "use strict";
  const C = window.R20Core, B = window.R20Books;
  const CL = window.R20Cloud, WD = window.R20Words, AU = window.R20Audio, I = window.R20Icons;
  const teen = () => S.lv === "older";   // older readers get the darker look with line icons
  const icon = (name, fallback, size) => (teen() ? I(name, size) : fallback);
  const KEY = "read20.v1";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => window.__today || C.dayKey();
  const byId = {}; B.books.forEach(b => (byId[b.id] = b));

  let stale = false;   // the log changed (from the cloud) while a pop-up covered the screen
  let R = C.emptyRoot(), S = R.profiles[R.active];   // R: every reader on this phone; S: the reader whose log is open
  const act = () => { S = R.profiles[R.active]; };
  /* Saving: the log is written to localStorage on every tick (instant, survives a closed app) and mirrored into
     IndexedDB every few seconds as a second copy. If either one is lost, the other brings the time back. */
  const store = { fail: false, idbAt: 0, ready: false }; // ready: the second copy has been read, so it is safe to write to it
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      try {
        const rq = indexedDB.open("read20", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("s");
        rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => { const db = rq.result, tx = db.transaction("s", mode), r = fn(tx.objectStore("s")); tx.oncomplete = () => { db.close(); res(r && r.result); }; tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); }; };
      } catch (e) { rej(e); }
    });
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); R = C.sanitizeRoot(JSON.parse(raw)); }
    catch (e) { R = C.emptyRoot(); try { if (raw) localStorage.setItem(KEY + ".damaged", raw); } catch (e2) {} } // keep a damaged save instead of writing over it
    act();
  }
  function save(force) {
    try { localStorage.setItem(KEY, JSON.stringify(C.serializeRoot(R))); store.fail = false; } catch (e) { store.fail = true; }
    const now = Date.now();
    if (store.ready && (force || now - store.idbAt > 5000)) { store.idbAt = now; const copy = JSON.stringify(C.serializeRoot(R)); idb("readwrite", st => st.put(copy, "log")).catch(() => {}); }
    paintWarn(); if (CL) CL.schedule();
  }
  async function recover() {
    try {
      const raw = await idb("readonly", st => st.get("log")); if (!raw) return;
      const merged = C.mergeRoot(R, JSON.parse(raw));
      if (C.totalAll(merged) > C.totalAll(R) || merged.order.length > R.order.length) { R = merged; act(); try { localStorage.setItem(KEY, JSON.stringify(C.serializeRoot(R))); } catch (e) {} if (ui.book) paintTimer(); else route(); }
    } catch (e) {}
  }
  /* The saved copy in the cloud has been merged in: keep whichever has more, never the other way round. */
  function adopt(merged) {
    const m = C.mergeRoot(R, merged); if (JSON.stringify(C.serializeRoot(m)) === JSON.stringify(C.serializeRoot(R))) return;
    R = m; act(); try { localStorage.setItem(KEY, JSON.stringify(C.serializeRoot(R))); } catch (e) {}
    store.idbAt = 0; if (ui.book) paintTimer(); else if (!document.querySelector(".overlay")) route(); else stale = true;   // a pop-up is open: redraw the screen under it when it closes
  }
  const bkDate = () => R.order.reduce((m, i) => (R.profiles[i].bk > m ? R.profiles[i].bk : m), "");
  const markBackup = () => R.order.forEach(i => (R.profiles[i].bk = today()));
  const who = p => p.name || "Reader";
  const avOf = id => R.profiles[id].av || C.AVATARS[R.order.indexOf(id) % C.AVATARS.length];
  function cloudLine() {
    const st = CL.status;
    if (st === "ok") return "☁️ Backed up as " + esc(CL.email) + (CL.at ? " · " + new Date(CL.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
    if (st === "signedin" || st === "loading") return "☁️ Checking the cloud…";
    if (st === "offline") return CL.email ? "☁️ Signed in, but no connection right now. It will back up when there is signal." : "☁️ No connection right now. Try again when there is signal.";
    if (st === "denied") return "⚠️ The cloud backup is not allowed for this account yet. Ask Dad to publish the Read 20 rules.";
    return "";
  }
  function cloudChanged() { if (!ui.book && !document.querySelector(".overlay")) { const h = $("#cloudbadge"); if (h) h.hidden = CL.status !== "ok"; } }
  function warnHtml() { return '<div class="warn" id="warn" role="alert"' + (store.fail ? "" : " hidden") + '>⚠️ This phone is not letting the app save. Open Read 20 from the home-screen icon (not a private tab), or tap ⚙️ and save a backup.</div>'; }
  function paintWarn() { const w = $("#warn"); if (w) w.hidden = !store.fail; }

  const ui = { level: 1, month: null, sel: null, book: null, page: 0, paused: false, idle: false, acc: 0, last: 0, lastAct: 0, timer: 0, finishedNow: false, hl: -1 };

  /* ---------- sound, speech ---------- */
  function chime() { AU.chime(); }
  function say(w) { if (S.say) AU.speak(w, 0.8); }

  /* ---------- routing: #  (shelf), #log, #b/<id> (reading) ---------- */
  function applyTheme() {
    const t = teen(); document.documentElement.classList.toggle("teen", t);
    const set = (n, v) => { const m = document.querySelector('meta[name="' + n + '"]'); if (m) m.setAttribute("content", v); };
    set("theme-color", t ? "#0b1020" : "#fff6e3"); set("color-scheme", t ? "dark" : "light");
  }
  function route() {
    const h = location.hash.replace(/^#/, "");
    stopTimer(); applyTheme();
    if (h.startsWith("b/") && byId[h.slice(2)]) {
      if (!ui.book || ui.book.id !== h.slice(2)) { ui.book = byId[h.slice(2)]; ui.page = 0; ui.finishedNow = false; }
      ui.paused = false; ui.hl = -1; renderReader(); startTimer();
    } else if (h === "log") { ui.book = null; renderLog(); }
    else if (h.startsWith("join=")) { const key = CL.parseKey(h); try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} ui.book = null; renderShelf(); if (key) openJoin(key); }
    else { ui.book = null; renderShelf(); }
  }
  const go = h => { if (location.hash.replace(/^#/, "") === h) route(); else location.hash = h; };

  /* ---------- timer ---------- */
  function startTimer() {
    ui.last = Date.now(); ui.lastAct = ui.last; ui.acc = 0; ui.idle = false;
    clearInterval(ui.timer); ui.timer = setInterval(tick, 1000); paintTimer();
  }
  function stopTimer() { clearInterval(ui.timer); ui.timer = 0; }
  function running() { return ui.book && !ui.paused && !ui.idle && !document.hidden; }
  function tick() {
    const now = Date.now(), dt = (now - ui.last) / 1000; ui.last = now;
    if (!ui.book) return;
    if (!ui.paused && !ui.idle && now - ui.lastAct > 120000) { ui.idle = true; paintTimer(); return; }
    if (!running()) return;
    const k = today(), before = C.daySec(S, k);
    ui.acc += Math.min(dt, 3);
    const whole = Math.floor(ui.acc); ui.acc -= whole;
    if (whole > 0) { C.addSeconds(S, k, ui.book.id, whole); save(); }
    paintTimer();
    const d = C.day(S, k);
    if (before < C.goalSec(S) && C.daySec(S, k) >= C.goalSec(S) && d && !d.done) { d.done = 1; save(); celebrate(); }
  }
  function paintTimer() {
    const el = $("#tm"); if (!el) return;
    const sec = C.daySec(S, today()), goal = C.goalSec(S);
    $("#tmnum").textContent = C.fmtClock(sec);
    $("#tmgoal").textContent = sec >= goal ? (teen() ? "goal reached" : "goal reached! ⭐") : "of " + C.fmtClock(goal);
    $("#tmbar").style.width = Math.min(100, sec / goal * 100) + "%";
    const st = ui.paused ? "paused" : ui.idle ? "idle" : "";
    el.className = "tm " + st;
    $("#pause").innerHTML = teen() ? I(ui.paused ? "play" : "pause") : ui.paused ? "▶" : "⏸";
    $("#pause").setAttribute("aria-label", ui.paused ? "Start the timer again" : "Pause the timer");
    $("#idlebox").hidden = !ui.idle;
  }
  function touch() { ui.lastAct = Date.now(); if (ui.idle) { ui.idle = false; ui.last = Date.now(); paintTimer(); } }
  document.addEventListener("visibilitychange", () => { ui.last = Date.now(); if (!document.hidden) ui.lastAct = Date.now(); });

  function celebrate() {
    chime();
    const o = document.createElement("div"); o.className = "overlay"; o.id = "party";
    o.innerHTML = `<div class="card party" role="dialog" aria-label="Twenty minutes done"><div class="big">${teen() ? I("star", 56) : "🎉⭐🎉"}</div><h2>${S.goal} minutes!</h2><p>${S.name ? esc(S.name) + ", you" : "You"} did your reading tonight. Great job!</p><button class="btn" id="keep">Keep reading</button><button class="btn alt" id="stop">I'm done tonight</button></div>`;
    document.body.appendChild(o); trackOverlay(o);
    $("#keep").onclick = () => { closeOverlay(o); touch(); };
    $("#stop").onclick = () => closeOverlay(o, () => go(""));
  }

  /* ---------- shelf ---------- */
  function nextUp() {
    const fin = C.finishedIds(S);
    if (S.lv === "older") return B.books.find(b => b.shelf === "older" && !fin[b.id]) || B.books.find(b => b.shelf === "older");
    for (const lv of B.LEVELS) { const bk = B.books.find(b => b.level === lv.n && !fin[b.id]); if (bk) return bk; }
    return B.books.find(b => b.shelf !== "older");
  }
  function ring(sec, goal) {
    const r = 54, c = 2 * Math.PI * r, p = Math.min(1, sec / goal);
    return `<svg viewBox="0 0 130 130" class="ring" aria-hidden="true"><circle cx="65" cy="65" r="${r}" class="rbg"/><circle cx="65" cy="65" r="${r}" class="rfg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/></svg>`;
  }
  function renderShelf() {
    const k = today(), sec = C.daySec(S, k), goal = C.goalSec(S), done = sec >= goal, streak = C.streak(S, k);
    const fin = C.finishedIds(S), nx = nextUp(), left = Math.max(0, Math.ceil((goal - sec) / 60));
    const older = S.lv === "older";
    if (!ui.levelSet) { ui.level = nx.level || 1; ui.topic = nx.topic || "sports"; ui.levelSet = true; }
    const lv = B.LEVELS.find(l => l.n === ui.level) || B.LEVELS[0], tp = (B.TOPICS || []).find(t => t.id === ui.topic) || (B.TOPICS || [])[0];
    const list = older ? B.books.filter(b => b.shelf === "older" && b.topic === tp.id) : B.books.filter(b => b.level === ui.level);
    const readIn = list.filter(b => fin[b.id]).length;
    $("#view").innerHTML = `
    <header class="top"><h1>${icon("logo", "📖 ")}Read ${S.goal}</h1><span class="cloudbadge" id="cloudbadge" title="Backed up online" ${CL.status === "ok" ? "" : "hidden"}>☁️✓</span><button class="icon" id="gear" aria-label="Settings">${icon("sliders", "⚙️")}</button></header>
    ${warnHtml()}
    <div class="readers" role="tablist" aria-label="Readers">${R.order.map(id => `<button role="tab" aria-selected="${id === R.active}" class="rd ${id === R.active ? "on" : ""}" data-id="${esc(id)}"><span class="av" aria-hidden="true">${avOf(id)}</span><span class="nm">${esc(who(R.profiles[id]))}</span></button>`).join("")}<button class="rd add" id="addrd" aria-label="Add a reader"><span class="av" aria-hidden="true">＋</span><span class="nm">Add</span></button></div>
    <section class="today ${done ? "ok" : ""}">
      <div class="ringbox">${ring(sec, goal)}<div class="rtxt"><b>${Math.floor(sec / 60)}</b><span>min</span></div></div>
      <div class="ttxt">
        <h2>${done ? "Tonight's reading is done!" + (teen() ? "" : " ⭐") : (S.name ? esc(S.name) + ", " + (sec ? "keep going!" : "ready to read?") : (sec ? "Keep going!" : "Ready to read?"))}</h2>
        <p>${done ? "You can read more if you want." : left + " more minute" + (left === 1 ? "" : "s") + " to go tonight."}</p>
        <p class="streak">${streak ? icon("flame", "🔥", 18) + " " + streak + " night" + (streak === 1 ? "" : "s") + " in a row" : "Start a streak tonight!"}</p>
      </div>
    </section>
    <button class="btn big" id="next"><span class="bk">${older ? I(nx.topic, 34) : esc(nx.cover)}</span><span><small>Read next</small><br>${esc(nx.title)}</span></button>
    ${older ? `<h2 class="sec">The Library</h2>
    <div class="levels" role="tablist" aria-label="Topics">${B.TOPICS.map(t => `<button role="tab" aria-selected="${t.id === tp.id}" class="lv ${t.id === tp.id ? "on" : ""}" data-tp="${t.id}"><span>${I(t.id, 18)}</span>${t.name}</button>`).join("")}</div>
    <p class="lvinfo"><b>${esc(tp.name)}</b> · ${esc(tp.sub)}<br><small>${readIn} of ${list.length} read</small></p>` : `<h2 class="sec">The Book Shop</h2>
    <div class="levels" role="tablist" aria-label="Levels">${B.LEVELS.map(l => `<button role="tab" aria-selected="${l.n === ui.level}" class="lv ${l.n === ui.level ? "on" : ""}" data-lv="${l.n}"><span>${l.icon}</span>Level ${l.n}</button>`).join("")}</div>
    <p class="lvinfo"><b>${esc(lv.name)}</b> · ${esc(lv.sub)}<br><small>${readIn} of ${list.length} read</small></p>`}
    <div class="shelf">${list.map(b => `<button class="cover${older ? " tp-" + b.topic : ""}" data-id="${esc(b.id)}" style="--c:${esc(b.color)}" aria-label="${esc(b.title)}${fin[b.id] ? ", read" : ""}"><span class="ce">${older ? I(b.topic, 46) : esc(b.cover)}</span><span class="ct">${esc(b.title)}</span>${older ? `<span class="pips" aria-label="difficulty ${b.diff} of 3">${"●".repeat(b.diff)}${"○".repeat(3 - b.diff)}</span>` : ""}${fin[b.id] ? `<span class="check" aria-hidden="true">${older ? I("check", 18) : "✓"}</span>` : ""}</button>`).join("")}</div>
    ${C.totalAll(R) >= 600 && !CL.enabled() && (!bkDate() || C.daysSince(bkDate(), k) >= 7) ? '<section class="nudge"><b>Keep the reading log safe ☁️</b><p>The log lives on this phone. A parent can sign in with Google once to back it up online. Readers never have to sign in.</p><button class="btn alt" id="bknow">Set up the backup</button></section>' : ""}
    <button class="btn alt" id="manual">＋ Log a book from home</button>
    <p class="fine">Stories are free to share: written for this app, or old public-domain rhymes and fables. Everything stays on this phone.</p>`;
    nav("books");
    $("#gear").onclick = openSettings;
    document.querySelectorAll(".rd[data-id]").forEach(b => (b.onclick = () => { if (b.dataset.id !== R.active) switchTo(b.dataset.id); }));
    $("#addrd").onclick = openAddReader;
    $("#next").onclick = () => go("b/" + nx.id);
    $("#manual").onclick = openManual;
    if ($("#bknow")) $("#bknow").onclick = openSafe;
    document.querySelectorAll(".lv").forEach(b => (b.onclick = () => { if (b.dataset.tp) ui.topic = b.dataset.tp; else ui.level = +b.dataset.lv; renderShelf(); }));
    const on = document.querySelector(".lv.on"); if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" });
    document.querySelectorAll(".cover").forEach(b => (b.onclick = () => go("b/" + b.dataset.id)));
  }

  /* ---------- reader ---------- */
  function renderReader() {
    const bk = ui.book, pg = bk.pages[ui.page], end = ui.page >= bk.pages.length;
    const n = bk.pages.length;
    $("#nav").hidden = true;
    const sz = ["s0", "s1", "s2"][S.size];
    const older = bk.shelf === "older";
    const emo = end || older ? bk.cover : pg.pic, cnt = Array.from(emo).length;
    $("#view").innerHTML = `
    <div class="reader ${sz}${older ? " older" : ""}" style="--c:${esc(bk.color)}">
      <header class="rtop">
        <button class="icon" id="back" aria-label="Back to the shelf">${icon("back", "⬅")}</button>
        <div class="tm" id="tm"><div class="tmrow"><b id="tmnum">0:00</b><span id="tmgoal"></span></div><div class="tmtrack"><i id="tmbar"></i></div></div>
        <button class="icon" id="pause" aria-label="Pause the timer">${icon("pause", "⏸")}</button>
      </header>
      ${warnHtml()}
      <div class="idle" id="idlebox" hidden>Still reading? Tap anywhere to keep the timer going.</div>
      <div class="pic ${older ? "sm tp-" + bk.topic : cnt > 2 ? "m3" : cnt > 1 ? "m2" : ""}" aria-hidden="true">${older ? I(bk.topic, 40) : esc(emo)}</div>
      ${end ? `<div class="the-end"><h2>The End</h2><p>${esc(bk.title)}</p>${older && bk.gloss && bk.gloss.length ? glossHtml(bk) : ""}${older && bk.quiz && bk.quiz.length ? quizHtml(bk) : ""}<button class="btn big" id="more">Pick another story</button><button class="btn alt" id="again">Read it again</button></div>`
        : `<p class="text" id="text">${pg.text.split(/\s+/).map((w, i) => `<span class="w" role="button" tabindex="0" data-i="${i}">${esc(w)}</span>`).join(" ")}</p>`}
      ${end ? "" : `<p class="hint">${older ? "" : "👆 "}Press and hold a word to ${older ? "see its syllables" : "break it into sounds"}</p>`}
      <footer class="rnav">
        <button class="pgbtn" id="prev" ${ui.page === 0 ? "disabled" : ""} aria-label="Previous page">${icon("back", "◀", 26)}</button>
        <div class="pgnum" aria-live="polite">${end ? "The End" : "Page " + (ui.page + 1) + " of " + n}</div>
        <button class="pgbtn go" id="nextp" ${end ? "disabled" : ""} aria-label="${ui.page === n - 1 ? "Finish the story" : "Next page"}">${icon("next", "▶", 26)}</button>
      </footer>
      <div class="tools"><button class="mini" id="sm" aria-label="Smaller words">A−</button><button class="mini" id="lg" aria-label="Bigger words">A+</button><button class="mini ${S.say ? "on" : ""}" id="spk" aria-pressed="${S.say}" aria-label="Say words out loud when tapped">${icon("volume", "🔊", 20)}</button></div>
      ${end && !older ? '<div class="confetti" aria-hidden="true">🎉</div>' : ""}
    </div>`;
    $("#back").onclick = () => go("");
    $("#pause").onclick = () => { ui.paused = !ui.paused; ui.last = Date.now(); ui.lastAct = Date.now(); paintTimer(); };
    $("#prev").onclick = () => turn(-1); $("#nextp").onclick = () => turn(1);
    $("#sm").onclick = () => size(-1); $("#lg").onclick = () => size(1);
    $("#spk").onclick = () => { S.say = !S.say; save(); renderReader(); startTimerKeep(); };
    if (end) {
      if (!ui.finishedNow) { ui.finishedNow = true; C.finish(S, today(), bk.id); save(); }
      $("#more").onclick = () => { const nx = nextUp(); go(nx && nx.id !== bk.id ? "b/" + nx.id : ""); };
      $("#again").onclick = () => { ui.page = 0; ui.hl = -1; renderReader(); startTimerKeep(); };
      if (older && bk.quiz && bk.quiz.length) wireQuiz(bk);
    } else {
      document.querySelectorAll(".w").forEach(w => {
        const hit = () => { const i = +w.dataset.i; ui.hl = ui.hl === i ? -1 : i; paintHl(); if (ui.hl >= 0) say(w.textContent.replace(/[^\w']/g, "")); };
        let t = 0, x0 = 0, y0 = 0;
        const stop = () => { clearTimeout(t); t = 0; };
        w.onpointerdown = e => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; stop(); t = setTimeout(() => { t = 0; ui.lp = true; setTimeout(() => (ui.lp = false), 700); ui.hl = +w.dataset.i; paintHl(); openWord(w.textContent); }, 450); };
        w.onpointermove = e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) stop(); };
        w.onpointerup = w.onpointercancel = w.onpointerleave = stop;
        w.oncontextmenu = e => e.preventDefault();
        w.onclick = () => { if (ui.lp) { ui.lp = false; return; } hit(); };
        w.onkeydown = e => { if (e.key === "Enter" && e.shiftKey || e.key === "?") { e.preventDefault(); ui.hl = +w.dataset.i; paintHl(); openWord(w.textContent); } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hit(); } };
      });
      paintHl();
    }
    paintTimer();
  }
  function startTimerKeep() { paintTimer(); } // the interval keeps running across re-draws
  function paintHl() { document.querySelectorAll(".w").forEach(w => w.classList.toggle("hl", +w.dataset.i === ui.hl)); }
  function turn(d) {
    const n = ui.book.pages.length, p = ui.page + d;
    if (p < 0 || p > n) return;
    ui.page = p; ui.hl = -1; renderReader(); touch();
  }
  function size(d) { S.size = Math.min(2, Math.max(0, S.size + d)); save(); renderReader(); }

  document.addEventListener("pointerdown", () => { if (ui.book) touch(); }, true);
  document.addEventListener("keydown", e => {
    if (!ui.book) return; touch();
    if (e.key === "ArrowRight") turn(1); else if (e.key === "ArrowLeft") turn(-1);
  });
  let sx = null;
  document.addEventListener("touchstart", e => { sx = ui.book && e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener("touchend", e => { if (sx == null || !ui.book) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70) turn(dx < 0 ? 1 : -1); }, { passive: true });

  /* ---------- log ---------- */
  function renderLog() {
    const k = today(), now = C.parseDay(k);
    if (!ui.month) ui.month = { y: now.getFullYear(), m: now.getMonth() };
    if (!ui.sel) ui.sel = k;
    const { y, m } = ui.month, cells = C.monthGrid(y, m), st = C.monthStats(S, y, m);
    const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const fin = C.finishedIds(S), totalSec = C.total(S), nights = Object.keys(S.days).filter(d => C.isDone(S, d)).length;
    $("#view").innerHTML = `
    <header class="top"><h1>${icon("calendar", "🗓️ ")}${S.name ? esc(S.name) + "'s" : "My"} Reading Log</h1><button class="icon" id="gear" aria-label="Settings">${icon("sliders", "⚙️")}</button></header>
    <section class="stats"><div><b>${icon("flame", "🔥", 20)} ${C.streak(S, k)}</b><span>nights in a row</span></div><div><b>${icon("star", "⭐", 20)} ${nights}</b><span>${S.goal}-minute nights</span></div><div><b>${icon("done", "📚", 20)} ${Object.keys(fin).length}</b><span>stories finished</span></div><div><b>${icon("clock", "⏱", 20)} ${C.fmtTotal(totalSec)}</b><span>read in all</span></div></section>
    <div class="mhead"><button class="icon" id="pm" aria-label="Last month">${icon("back", "◀", 20)}</button><h2>${names[m]} ${y}</h2><button class="icon" id="nm" aria-label="Next month">${icon("next", "▶", 20)}</button></div>
    <p class="mfine">${st.nights} night${st.nights === 1 ? "" : "s"} done this month</p>
    <div class="cal" role="grid"><div class="dow">S</div><div class="dow">M</div><div class="dow">T</div><div class="dow">W</div><div class="dow">T</div><div class="dow">F</div><div class="dow">S</div>
    ${cells.map(c => { if (!c) return '<div class="day empty"></div>'; const s = C.daySec(S, c), dn = +c.slice(8); const cls = (C.isDone(S, c) ? "done " : s ? "some " : "") + (c === k ? "now " : "") + (c === ui.sel ? "sel" : "");
      return `<button class="day ${cls}" data-d="${c}" aria-label="${c}${s ? ", " + C.fmtMin(s) : ""}${C.isDone(S, c) ? ", goal reached" : ""}"><b>${dn}</b><i>${C.isDone(S, c) ? icon("star", "⭐", 14) : s ? Math.round(s / 60) + "m" : ""}</i></button>`; }).join("")}</div>
    <div id="detail"></div>
    <section class="keep"><h3>Keep the log safe</h3>
      <p class="ok">${store.fail ? "⚠️ This phone is not letting the app save." : "✓ Saved on this phone"}</p>
      <p class="cl2" id="cl2">${esc(cloudLine()) || "☁️ Not backed up online yet."}</p>
      <button class="btn" id="kcloud">${CL.status === "ok" ? "☁️ Back up now" : "☁️ Back up online (a parent signs in once)"}</button>
      <button class="btn alt" id="kfile">💾 Save a backup file</button>
      <p class="fine left" id="kmsg" role="status"></p>
    </section>`;
    nav("log");
    $("#gear").onclick = openSettings;
    $("#kcloud").onclick = () => { if (CL.status === "ok") { CL.syncNow(); $("#kmsg").textContent = "Backing up…"; setTimeout(() => { if ($("#cl2")) renderLog(); }, 1500); } else openSafe(); };
    $("#kfile").onclick = () => { backup(); $("#kmsg").textContent = "Backup file saved to this phone's Downloads."; };
    $("#pm").onclick = () => { ui.month = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; renderLog(); };
    $("#nm").onclick = () => { ui.month = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; renderLog(); };
    document.querySelectorAll(".day[data-d]").forEach(b => (b.onclick = () => { ui.sel = b.dataset.d; renderLog(); }));
    renderDetail();
  }
  function renderDetail() {
    const k = ui.sel, d = S.days[k], dt = C.parseDay(k);
    const label = dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    let rows = "";
    if (d) {
      Object.keys(d.books).forEach(id => { const b = byId[id], x = d.books[id]; if (!b) return; rows += `<li><span class="le">${b.shelf === "older" ? I(b.topic, 30) : esc(b.cover)}</span><span class="lt">${esc(b.title)}<small>${b.shelf === "older" ? esc(topicName(b.topic)) : "Level " + b.level}${x.fin ? " · finished ✓" : ""}</small></span><span class="lm">${C.fmtMin(x.sec)}</span></li>`; });
      d.extra.forEach(x => { rows += `<li><span class="le">📕</span><span class="lt">${esc(x.title)}<small>from home</small></span><span class="lm">${C.fmtMin(x.sec)}</span></li>`; });
    }
    $("#detail").innerHTML = `<section class="dcard"><h3>${esc(label)}</h3>${d && d.sec ? `<p class="dtot">${C.fmtMin(d.sec)} total${C.isDone(S, k) ? (teen() ? "" : " ⭐") : ""}</p><ul class="list">${rows}</ul>` : "<p class='dtot'>No reading logged this day.</p>"}</section>`;
  }

  /* ---------- sheets ---------- */
  function sheet(html) {
    const o = document.createElement("div"); o.className = "overlay"; o.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true">${html}</div>`;
    o.addEventListener("pointerdown", e => { if (e.target === o) closeOverlay(o); });
    document.body.appendChild(o); trackOverlay(o); return o;
  }
  /* Android Back (and the browser's Back) closes the top pop-up instead of leaving the app, same as Locker.
     Each open pop-up owns one history entry; entries are added and given back a moment after the pop-ups change,
     so a tap that closes one and moves on costs nothing, and the entry we land on says how many should be open. */
  const overlays = [];
  let histDepth = 0, traveling = false, syncTimer = 0, afterTrip = null;
  function trackOverlay(o) { overlays.push(o); syncHistory(); }
  /* "then" runs once the pop-up's history entry is given back, so a page change can't land on top of it. */
  function closeOverlay(o, then) { const i = overlays.indexOf(o); if (i >= 0) overlays.splice(i, 1); o.remove(); if (then) afterTrip = then; else if (stale && !overlays.length && !ui.book) { stale = false; route(); } syncHistory(); }
  function syncHistory() { clearTimeout(syncTimer); syncTimer = setTimeout(reconcileHistory, 0); }
  function reconcileHistory() {
    if (traveling) return; // the popstate handler tidies up when our own trip back lands
    const want = overlays.length;
    try {
      if (want > histDepth) { while (histDepth < want) history.pushState({ r20Sheets: ++histDepth }, ""); }
      else if (want < histDepth) {
        const n = histDepth - want; histDepth = want; traveling = true;
        history.go(-n);
        setTimeout(() => { if (traveling) { traveling = false; reconcileHistory(); } }, 600);
      }
    } catch (e) { traveling = false; }
    if (!traveling && afterTrip) { const f = afterTrip; afterTrip = null; f(); }
  }
  try { if (history.state && history.state.r20Sheets) history.replaceState(null, ""); } catch (e) { /* ignore */ }
  window.addEventListener("popstate", e => {
    const at = (e.state && e.state.r20Sheets) || 0;
    histDepth = at;
    if (traveling) traveling = false;
    else while (overlays.length > at) closeOverlay(overlays[overlays.length - 1]);
    reconcileHistory();
  });
  function openManual() {
    const o = sheet(`<h2>Log a book from home</h2><p class="fine">A paper book counts too.</p>
      <label>Book title<input id="mt" maxlength="60" autocomplete="off" placeholder="Title"></label>
      <label>Minutes read<input id="mm" type="number" inputmode="numeric" min="1" max="240" value="10"></label>
      <label>Day<input id="md" type="date" value="${today()}" max="${today()}"></label>
      <div class="row"><button class="btn alt" id="mc">Cancel</button><button class="btn" id="ms">Save</button></div>`);
    $("#mc").onclick = () => closeOverlay(o);
    $("#ms").onclick = () => {
      if (C.addManual(S, $("#md").value || today(), $("#mt").value, $("#mm").value)) { save(); closeOverlay(o); route(); }
      else $("#mm").focus();
    };
  }
  /* ---------- readers (one phone, several children) ---------- */
  function switchTo(id) { if (!R.profiles[id]) return; R.active = id; act(); save(true); ui.levelSet = false; ui.month = null; ui.sel = null; route(); }
  const avatarGrid = sel => `<div class="avgrid" role="radiogroup" aria-label="Picture">${C.AVATARS.map(a => `<button type="button" role="radio" class="avp ${a === sel ? "on" : ""}" data-av="${a}" aria-checked="${a === sel}" aria-label="${a}">${a}</button>`).join("")}</div>`;
  function wireAvatars(root, set) { root.querySelectorAll(".avp").forEach(b => (b.onclick = () => { root.querySelectorAll(".avp").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); set(b.dataset.av); })); }
  function openAddReader() {
    let av = C.AVATARS[R.order.length % C.AVATARS.length];
    const o = sheet(`<h2>Add a reader</h2><p class="fine left">Each reader gets their own log, streak, goal and word size. Swap between them on the home screen.</p>
      <label>Name<input id="rn" maxlength="20" autocomplete="off" placeholder="Name"></label>
      <div class="lbl">Pick a picture</div>${avatarGrid(av)}
      <div class="lbl">Reading level</div>
      <div class="lvpick" role="radiogroup" aria-label="Reading level"><button type="button" role="radio" class="lvopt on" data-lv="early" aria-checked="true"><b>🌱 Learning to read</b><small>Short stories, big words, pictures</small></button><button type="button" role="radio" class="lvopt" data-lv="older" aria-checked="false"><b>📚 Older reader</b><small>Grades 5 and up: sports, photography, fitness, athletes, social studies and English</small></button></div>
      <div class="row"><button class="btn alt" id="rc">Cancel</button><button class="btn" id="ra">Add</button></div>`);
    wireAvatars(o, a => (av = a));
    let lvl = "early"; o.querySelectorAll(".lvopt").forEach(b => (b.onclick = () => { lvl = b.dataset.lv; o.querySelectorAll(".lvopt").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); }));
    $("#rc").onclick = () => closeOverlay(o);
    $("#ra").onclick = () => {
      const name = $("#rn").value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20); if (!name) { $("#rn").focus(); return; }
      const id = C.newId(), p = C.empty(); p.name = name; p.av = av; p.lv = lvl; if (lvl === "older") p.size = 0; R.profiles[id] = p; R.order.push(id);
      closeOverlay(o); switchTo(id);
    };
    $("#rn").focus();
  }
  function removeReader(o) {
    if (R.order.length < 2) return; const id = R.active, nm = who(S);
    if (!confirm("Remove " + nm + " and all of " + nm + "'s reading history from this phone" + (CL.status === "ok" ? " and from the cloud backup" : "") + "? This cannot be undone.")) return;
    R.gone[id] = 1; delete R.profiles[id]; R.order = R.order.filter(x => x !== id); R.active = R.order[0]; act(); save(true); if (CL.status === "ok") CL.overwrite();
    closeOverlay(o); ui.levelSet = false; ui.month = null; ui.sel = null; route();
  }

  /* ---------- settings: one reader's choices, and two short doors to everything else ---------- */
  function openSettings() {
    let av = S.av || avOf(R.active);
    const safe = CL.status === "ok" ? "☁️ Backed up online" + (CL.shareKey() ? " and shared with another home" : "") : "Saved on this phone only. A parent can add an online backup.";
    const o = sheet(`<h2>Settings</h2>
      <section class="set"><h3>${esc(avOf(R.active))} ${esc(who(S))}</h3>
        <label>Name<input id="sn" maxlength="20" autocomplete="off" value="${esc(S.name)}" placeholder="Name"></label>
        <div class="lbl">Picture</div>${avatarGrid(av)}
        <label>Reading goal each night<select id="sg">${C.GOALS.map(g => `<option ${g === S.goal ? "selected" : ""} value="${g}">${g} minutes</option>`).join("")}</select></label>
        <label>Reading level<select id="slv"><option value="early">Learning to read</option><option value="older">Older reader (grades 5 and up)</option></select></label>
        <label>Word size<select id="sz">${(S.lv === "older" ? ["Normal", "Large", "Extra large"] : ["Big", "Bigger", "Biggest"]).map((t, i) => `<option value="${i}">${t}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" id="ss" ${S.say ? "checked" : ""}> Say a word out loud when it is tapped</label>
        ${R.order.length > 1 ? `<button class="linkbtn danger" id="srm">Remove ${esc(who(S))}…</button>` : ""}
      </section>
      <section class="set"><h3>Keep the log safe</h3><p class="fine left">${esc(safe)}</p><button class="btn alt" id="setsafe">Back up and share…</button></section>
      <section class="set"><h3>Help</h3>
        <button class="btn alt" id="stest">🔊 Test the sound</button><p class="fine left" id="stm" role="status"></p>
        <button class="btn alt" type="button" onclick="window.nateHealth&&nateHealth.report()">✉️ Send a problem report</button></section>
      <div class="row"><button class="btn" id="sd">Done</button></div>`);
    $("#sz").value = String(S.size); $("#slv").value = S.lv;
    wireAvatars(o, a => (av = a));
    $("#setsafe").onclick = openSafe;
    if ($("#srm")) $("#srm").onclick = () => removeReader(o);
    $("#stest").onclick = () => {
      AU.unlock(); const ok = AU.beep(), i = AU.info(); if (i.speech) setTimeout(() => AU.speak("Hello! Can you hear me?", 0.85), 700);
      $("#stm").textContent = !ok ? "This browser cannot make sound." : "You should hear a beep" + (i.speech ? " and then a voice" : "") + ". " + (i.speech ? (i.voices ? "" : "This phone has not loaded a speaking voice yet; try again in a few seconds. ") : "This phone has no speaking voice, so word-reading is off. ") + "If you hear nothing: turn the media volume up and make sure the phone is not on silent.";
    };
    $("#sd").onclick = () => { S.name = $("#sn").value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20); S.av = av; if ($("#slv").value !== S.lv) { S.lv = $("#slv").value; ui.levelSet = false; } S.goal = +$("#sg").value; S.size = +$("#sz").value; S.say = $("#ss").checked; save(); closeOverlay(o); route(); };
  }

  /* ---------- keep the log safe: online backup, sharing with another home, files ---------- */
  function openSafe() {
    const o = sheet(`<h2>Keep the log safe</h2>
      <p class="fine left">${store.fail ? "⚠️ This phone is not letting the app save." : "✓ Always saved on this phone."} This covers every reader on this phone.</p>
      <section class="set"><h3>1 · Back up online</h3>
        <p class="fine left">A parent signs in with Google once. After that a lost, reset or new phone gets the log back. Readers never need to sign in.</p>
        <p class="fine left" id="cl" role="status"></p>
        <button class="btn" id="cin" hidden>Sign in with Google</button>
        <button class="btn alt" id="cnow" hidden>Back up now</button>
        <button class="btn alt" id="cout" hidden>Sign out of the backup</button></section>
      <section class="set"><h3>2 · Share with another home</h3>
        <p class="fine left" id="shmsg" role="status"></p>
        <button class="btn" id="shmake" hidden>Create a family link</button>
        <button class="btn" id="shsend" hidden>📤 Send the family link</button>
        <button class="btn alt" id="shcopy" hidden>Copy the link</button>
        <button class="btn alt" id="shstop" hidden>Stop sharing on this phone</button>
        <label class="fine left">Got a link or code from the other home?<input id="jcode" placeholder="Paste it here" autocomplete="off"></label>
        <button class="btn alt" id="jgo">Join their log</button></section>
      <section class="set"><h3>Or use a file</h3>
        <p class="fine left">${bkDate() ? "Last backup file: " + esc(bkDate()) + "." : "No backup file yet."} Keep it somewhere safe.</p>
        <button class="btn alt" id="sb">💾 Save a backup file</button>
        <button class="btn alt" id="sbs">📤 Send a backup file…</button>
        <label class="btn alt filebtn">📂 Restore from a backup file<input type="file" id="sr" accept=".json,application/json" hidden></label>
        <p class="fine left" id="sm" role="status"></p></section>
      <button class="linkbtn danger" id="se">Erase ${esc(who(S))}'s reading log…</button>
      <div class="row"><button class="btn" id="safedone">Done</button></div>`);
    const paintCloud = () => {
      if (!$("#cl")) return; const st = CL.status, on = st === "ok" || st === "signedin" || st === "denied" || (st === "offline" && CL.email);
      $("#cl").textContent = cloudLine() || (st === "signedout" && CL.msg ? CL.msg : "Not set up yet.");
      $("#cin").hidden = on || st === "loading"; $("#cnow").hidden = !(st === "ok" || st === "offline" && CL.email); $("#cout").hidden = !on;
      const key = CL.shareKey(); $("#shmake").hidden = !(on && !key); $("#shsend").hidden = $("#shcopy").hidden = $("#shstop").hidden = !key;
      $("#shmsg").textContent = key ? "Sharing is on. Reading minutes from both homes add up. Code: " + CL.pretty(key) : on ? "Make one link and text it to the other home. They open it, sign in with their own Google account, and both phones share one log, so nobody needs your Google account." : "Sign in above first, then you can make a family link.";
    };
    CL.onchange = () => { paintCloud(); cloudChanged(); if (!$("#cl")) CL.onchange = cloudChanged; };
    paintCloud();
    $("#cin").onclick = () => CL.signIn();
    $("#shmake").onclick = async () => { $("#shmsg").textContent = "Making the link…"; const k = await CL.makeShare(); paintCloud(); if (!k) $("#shmsg").textContent = "Could not make the link. Check the signal, and that the cloud backup is allowed."; };
    $("#shsend").onclick = () => shareLink($("#shmsg"));
    $("#shcopy").onclick = async () => { try { await navigator.clipboard.writeText(CL.link()); $("#shmsg").textContent = "Link copied. Paste it into a text message."; } catch (e) { $("#shmsg").textContent = CL.link(); } };
    $("#shstop").onclick = () => { CL.leave(); paintCloud(); };
    $("#jgo").onclick = () => { const k = CL.parseKey($("#jcode").value); if (!k) { $("#shmsg").textContent = "That does not look like a Read 20 link or code."; return; } openJoin(k); };
    $("#cnow").onclick = () => CL.syncNow();
    $("#cout").onclick = () => CL.signOut();
    $("#sbs").onclick = () => sendBackup(m => ($("#sm").textContent = m));
    $("#sb").onclick = () => { backup(); $("#sm").textContent = "Backup saved to this phone's Downloads."; };
    $("#sr").onchange = e => restore(e.target.files[0], msg => ($("#sm").textContent = msg));
    $("#se").onclick = () => { if (confirm("Erase every night in " + who(S) + "'s reading log" + (CL.status === "ok" ? ", including the cloud backup" : "") + "? This cannot be undone.")) { S.days = {}; S.bk = ""; save(true); if (CL.status === "ok") CL.overwrite(); closeOverlay(o); route(); } };
    $("#safedone").onclick = () => { closeOverlay(o); route(); };
  }

  /* ---------- "Check yourself": the questions at the end of an older-reader story ---------- */
  const glossHtml = bk => `<section class="gloss" aria-label="Words to know"><h3>Words to know</h3><dl>${bk.gloss.map(g => `<dt>${esc(g.w)}</dt><dd>${esc(g.d)}</dd>`).join("")}</dl></section>`;
  /* The answers are mixed up the same way every time (so the right one is not always first), chosen from the story and question. */
  function mixed(bk, i) {
    let h = 7; (bk.id + i).split("").forEach(c => (h = (h * 31 + c.charCodeAt(0)) % 100003));
    const o = bk.quiz[i].a.map((t, j) => ({ t, j }));
    for (let k = o.length - 1; k > 0; k--) { h = (h * 1103 + 12345) % 100003; const r = h % (k + 1); [o[k], o[r]] = [o[r], o[k]]; }
    return o;
  }
  function quizHtml(bk) {
    return `<section class="quiz" aria-label="Check yourself"><h3>Check yourself</h3>${bk.quiz.map((q, i) => `<div class="qq" data-i="${i}"><p class="qt">${i + 1}. ${esc(q.q)}</p><div class="qo">${mixed(bk, i).map(o => `<button type="button" class="qb" data-j="${o.j}">${esc(o.t)}</button>`).join("")}</div><p class="qf" role="status"></p></div>`).join("")}<p class="qs" id="qscore" role="status"></p></section>`;
  }
  function wireQuiz(bk) {
    let got = 0, done = 0;
    document.querySelectorAll(".qq").forEach(qq => {
      const q = bk.quiz[+qq.dataset.i];
      qq.querySelectorAll(".qb").forEach(b => (b.onclick = () => {
        if (qq.classList.contains("done")) return; qq.classList.add("done"); const ok = +b.dataset.j === q.ok; done++; if (ok) got++;
        qq.querySelectorAll(".qb").forEach(x => { x.disabled = true; if (+x.dataset.j === q.ok) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        qq.querySelector(".qf").textContent = ok ? "✓ Right!" : "Not quite. The answer is: " + q.a[q.ok];
        if (done === bk.quiz.length) $("#qscore").textContent = "You got " + got + " of " + done + (got === done ? " 🎉" : ". Read it again and try the ones you missed!");
      }));
    });
  }
  const topicName = id => ((B.TOPICS || []).find(t => t.id === id) || { name: "Reading" }).name;

  /* ---------- press and hold: syllables and sounds ---------- */
  function speak(text) { AU.speak(text, 0.75); }
  function openWord(raw) {
    const a = WD.analyze(raw); if (!a) return;
    const older = !!(ui.book && ui.book.shelf === "older"); if (older) a.tricky = false;   // older readers get the syllables only
    const can = AU.canSpeak(), n = a.syllables.length;
    const sounds = sy => sy.sounds.map(c => `<i class="${c.silent ? "silent" : ""}"${c.silent ? ' title="silent e"' : ""}>${esc(c.t)}</i>`).join("");
    const chips = a.syllables.map((sy, i) => `<button class="syl c${i % 4}" data-i="${i}" ${can ? "" : "disabled"} aria-label="${esc(sy.text)}"><span class="st">${esc(sy.text)}</span>${a.tricky || older ? "" : `<span class="snd">${sounds(sy)}</span>`}</button>`).join('<span class="dot" aria-hidden="true">·</span>');
    const o = sheet(`<div class="wordpop">
      <h2 class="wp-word">${esc(a.text)}</h2>
      <p class="wp-sub">${a.tricky ? "🧠 A tricky word! It does not sound out the way it looks. Look at it and remember it." : n + " syllable" + (n === 1 ? "" : "s") + (can ? " · tap a part to hear it" : "")}</p>
      <div class="wp-syl">${chips}</div>
      ${can ? '<button class="btn alt" id="wphear">🔊 Say the whole word</button>' : ""}
      <button class="btn" id="wpdone">Got it</button></div>`);
    o.querySelectorAll(".syl").forEach(b => (b.onclick = () => { o.querySelectorAll(".syl").forEach(x => x.classList.remove("on")); b.classList.add("on"); speak(a.syllables[+b.dataset.i].text); }));
    if ($("#wphear")) $("#wphear").onclick = () => speak(a.word.replace(/-/g, " "));
    $("#wpdone").onclick = () => closeOverlay(o); $("#wpdone").focus();
  }

  /* ---------- family link: one log for two homes ---------- */
  async function shareLink(msgEl) {
    const url = CL.link(), text = "Join our Read 20 reading log. Open this link and sign in with your own Google account:";
    try { if (navigator.share) { await navigator.share({ title: "Read 20 family link", text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); msgEl.textContent = "Link copied. Paste it into a text message."; } catch (e) { msgEl.textContent = url; }
  }
  function openJoin(key) {
    const o = sheet(`<h2>Join this reading log?</h2>
      <p>This phone and the phone that sent the link will share <b>one</b> reading log. Reading minutes from both homes add up, and each of you signs in with your <b>own</b> Google account.</p>
      <p class="fine left" id="jmsg" role="status"></p>
      <div class="row"><button class="btn alt" id="jno">Not now</button><button class="btn" id="jyes">Join</button></div>`);
    const prev = CL.onchange;
    const update = () => {
      if (!$("#jmsg")) { CL.onchange = prev; return; }
      const st = CL.status, mine = CL.shareKey() === key;
      $("#jmsg").textContent = st === "ok" && mine ? "✓ Joined! You and the other home now share one log." : st === "denied" ? "Sharing is not turned on yet. Ask Dad to publish the Read 20 rules in Firebase." : st === "offline" ? "No signal right now. Try again when you have signal." : st === "loading" || st === "signedin" ? "Joining…" : "";
      if (st === "ok" && mine) { $("#jyes").hidden = true; $("#jno").textContent = "Done"; }
    };
    CL.onchange = () => { prev(); update(); };
    $("#jno").onclick = () => { if (CL.shareKey() !== key) CL.forgetJoin(); closeOverlay(o); };
    $("#jyes").onclick = async () => { $("#jmsg").textContent = "Joining…"; $("#jyes").disabled = true; const ok = await CL.join(key); $("#jyes").disabled = false; if (!ok && CL.status !== "denied" && CL.status !== "offline") $("#jmsg").textContent = CL.status === "ok" ? "" : "Sign in with Google to finish joining."; update(); };
  }

  /* ---------- backup and restore ---------- */
  function backupText() { markBackup(); save(true); return JSON.stringify({ app: "read20", v: 2, saved: new Date().toISOString(), data: C.serializeRoot(R) }, null, 1); }
  function backup() {
    const blob = new Blob([backupText()], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "read20-backup-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /* Opens the phone's share sheet (text message, email...) with the backup file attached. */
  async function sendBackup(say) {
    const f = new File([backupText()], "read20-backup-" + today() + ".json", { type: "application/json" });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "Read 20 backup" }); say("Sent. On the other phone: Settings, Restore from a backup file."); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    backup(); say("This phone cannot share files, so it was saved to Downloads instead.");
  }
  function restore(file, say) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j || j.app !== "read20" || !j.data) throw new Error("not a Read 20 backup");
        const before = C.totalAll(R); R = C.mergeRoot(R, j.data); act(); save(true);
        say("Restored. " + Math.round((C.totalAll(R) - before) / 60) + " minutes added back.");
      } catch (e) { say("That file is not a Read 20 backup."); }
    };
    r.onerror = () => say("Could not read that file."); r.readAsText(file);
  }

  /* ---------- bottom bar ---------- */
  function nav(on) {
    const n = $("#nav"); n.hidden = false;
    n.innerHTML = `<button class="${on === "books" ? "on" : ""}" data-go="">${icon("books", "📚", 26)}<span>Books</span></button><button class="${on === "log" ? "on" : ""}" data-go="log">${icon("calendar", "🗓️", 26)}<span>My Log</span></button>`;
    n.querySelectorAll("button").forEach(b => (b.onclick = () => go(b.dataset.go)));
  }

  function init() {
    try { let d = localStorage.getItem("read20.dev"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("read20.dev", d); } C.dev = d; } catch (e) { C.dev = "t" + Math.random().toString(36).slice(2, 8); }
    load(); applyTheme();
    window.addEventListener("hashchange", route);
    window.addEventListener("pagehide", () => save(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) { save(true); CL.flush(); } });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} // ask Chrome never to clear her log to free space
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    CL.init({ get: () => R, apply: adopt, onchange: cloudChanged });
    route(); recover().then(() => { store.ready = true; save(true); });
  }
  window.R20App = { init, _state: () => S, _root: () => R };
})();
