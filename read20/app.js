/* Read 20: the screens. Shelf, reader (with the nightly timer), log, settings.
   Everything is saved on this phone only (localStorage). Nothing is sent anywhere. */
(function () {
  "use strict";
  const C = window.R20Core, B = window.R20Books;
  const CL = window.R20Cloud, WD = window.R20Words, AU = window.R20Audio, BD = window.R20Board;
  const KEY = "read20.v1";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => window.__today || C.dayKey();
  const byId = {}; B.books.forEach(b => (byId[b.id] = b));

  let S = C.empty();
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
    try { raw = localStorage.getItem(KEY); S = C.sanitize(JSON.parse(raw)); }
    catch (e) { S = C.empty(); try { if (raw) localStorage.setItem(KEY + ".damaged", raw); } catch (e2) {} } // keep a damaged save instead of writing over it
  }
  function save(force) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); store.fail = false; } catch (e) { store.fail = true; }
    const now = Date.now();
    if (store.ready && (force || now - store.idbAt > 5000)) { store.idbAt = now; const copy = JSON.stringify(S); idb("readwrite", st => st.put(copy, "log")).catch(() => {}); }
    paintWarn(); if (CL) CL.schedule();
  }
  async function recover() {
    try {
      const raw = await idb("readonly", st => st.get("log")); if (!raw) return;
      const other = C.sanitize(JSON.parse(raw)), merged = C.merge(S, other);
      if (C.total(merged) > C.total(S)) { S = merged; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} if (ui.book) paintTimer(); else route(); }
    } catch (e) {}
  }
  /* The saved copy in the cloud has been merged in: keep whichever has more, never the other way round. */
  function adopt(merged) {
    const m = C.merge(S, merged); if (JSON.stringify(m) === JSON.stringify(S)) return;
    S = m; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    store.idbAt = 0; if (ui.book) paintTimer(); else if (!document.querySelector(".overlay")) route();
  }
  function cloudLine() {
    const st = CL.status;
    if (st === "ok") return "☁️ Backed up as " + esc(CL.email) + (CL.at ? " · " + new Date(CL.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
    if (st === "signedin" || st === "loading") return "☁️ Checking the cloud…";
    if (st === "offline") return CL.email ? "☁️ Signed in, but no connection right now. It will back up when there is signal." : "☁️ No connection right now. Try again when there is signal.";
    if (st === "denied") return "⚠️ The cloud backup is not allowed for this account yet. Ask Dad to publish the Read 20 rules.";
    return "";
  }
  function warnHtml() { return '<div class="warn" id="warn" role="alert"' + (store.fail ? "" : " hidden") + '>⚠️ This phone is not letting the app save. Open Read 20 from the home-screen icon (not a private tab), or tap ⚙️ and save a backup.</div>'; }
  function paintWarn() { const w = $("#warn"); if (w) w.hidden = !store.fail; }

  const ui = { level: 1, month: null, sel: null, book: null, page: 0, paused: false, idle: false, acc: 0, last: 0, lastAct: 0, timer: 0, finishedNow: false, hl: -1 };

  /* ---------- sound, speech ---------- */
  function chime() { AU.chime(); }
  function say(w) { if (S.say) AU.speak(w, 0.8); }

  /* ---------- routing: #  (shelf), #log, #b/<id> (reading) ---------- */
  function route() {
    const h = location.hash.replace(/^#/, "");
    stopTimer(); BD.unmount();
    if (h.startsWith("b/") && byId[h.slice(2)]) {
      if (!ui.book || ui.book.id !== h.slice(2)) { ui.book = byId[h.slice(2)]; ui.page = 0; ui.finishedNow = false; }
      ui.paused = false; ui.hl = -1; renderReader(); startTimer();
    } else if (h === "log") { ui.book = null; renderLog(); }
    else if (h === "sounds") { ui.book = null; renderSounds(); }
    else { ui.book = null; renderShelf(); }
  }
  const go = h => { if (location.hash.replace(/^#/, "") === h) route(); else location.hash = h; };

  function renderSounds() { $("#view").innerHTML = '<div id="soundsview"></div>'; BD.mount($("#soundsview")); nav("sounds"); }

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
    $("#tmgoal").textContent = sec >= goal ? "goal reached! ⭐" : "of " + C.fmtClock(goal);
    $("#tmbar").style.width = Math.min(100, sec / goal * 100) + "%";
    const st = ui.paused ? "paused" : ui.idle ? "idle" : "";
    el.className = "tm " + st;
    $("#pause").textContent = ui.paused ? "▶" : "⏸";
    $("#pause").setAttribute("aria-label", ui.paused ? "Start the timer again" : "Pause the timer");
    $("#idlebox").hidden = !ui.idle;
  }
  function touch() { ui.lastAct = Date.now(); if (ui.idle) { ui.idle = false; ui.last = Date.now(); paintTimer(); } }
  document.addEventListener("visibilitychange", () => { ui.last = Date.now(); if (!document.hidden) ui.lastAct = Date.now(); });

  function celebrate() {
    chime();
    const o = document.createElement("div"); o.className = "overlay"; o.id = "party";
    o.innerHTML = `<div class="card party" role="dialog" aria-label="Twenty minutes done"><div class="big">🎉⭐🎉</div><h2>${S.goal} minutes!</h2><p>${S.name ? esc(S.name) + ", you" : "You"} did your reading tonight. Great job!</p><button class="btn" id="keep">Keep reading</button><button class="btn alt" id="stop">I'm done tonight</button></div>`;
    document.body.appendChild(o); trackOverlay(o);
    $("#keep").onclick = () => { closeOverlay(o); touch(); };
    $("#stop").onclick = () => closeOverlay(o, () => go(""));
  }

  /* ---------- shelf ---------- */
  function nextUp() {
    const fin = C.finishedIds(S);
    for (const lv of B.LEVELS) { const bk = B.books.find(b => b.level === lv.n && !fin[b.id]); if (bk) return bk; }
    return B.books[0];
  }
  function ring(sec, goal) {
    const r = 54, c = 2 * Math.PI * r, p = Math.min(1, sec / goal);
    return `<svg viewBox="0 0 130 130" class="ring" aria-hidden="true"><circle cx="65" cy="65" r="${r}" class="rbg"/><circle cx="65" cy="65" r="${r}" class="rfg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/></svg>`;
  }
  function renderShelf() {
    const k = today(), sec = C.daySec(S, k), goal = C.goalSec(S), done = sec >= goal, streak = C.streak(S, k);
    const fin = C.finishedIds(S), nx = nextUp(), left = Math.max(0, Math.ceil((goal - sec) / 60));
    if (!ui.levelSet) { ui.level = nx.level; ui.levelSet = true; }
    const lv = B.LEVELS.find(l => l.n === ui.level), list = B.books.filter(b => b.level === ui.level);
    const readIn = list.filter(b => fin[b.id]).length;
    $("#view").innerHTML = `
    <header class="top"><h1>📖 Read ${S.goal}</h1><span class="cloudbadge" id="cloudbadge" title="Backed up online" ${CL.status === "ok" ? "" : "hidden"}>☁️✓</span><button class="icon" id="gear" aria-label="Settings">⚙️</button></header>
    ${warnHtml()}
    <section class="today ${done ? "ok" : ""}">
      <div class="ringbox">${ring(sec, goal)}<div class="rtxt"><b>${Math.floor(sec / 60)}</b><span>min</span></div></div>
      <div class="ttxt">
        <h2>${done ? "Tonight's reading is done! ⭐" : (S.name ? esc(S.name) + ", " + (sec ? "keep going!" : "ready to read?") : (sec ? "Keep going!" : "Ready to read?"))}</h2>
        <p>${done ? "You can read more if you want." : left + " more minute" + (left === 1 ? "" : "s") + " to go tonight."}</p>
        <p class="streak">${streak ? "🔥 " + streak + " night" + (streak === 1 ? "" : "s") + " in a row" : "Start a streak tonight!"}</p>
      </div>
    </section>
    <button class="btn big" id="next"><span class="bk">${esc(nx.cover)}</span><span><small>Read next</small><br>${esc(nx.title)}</span></button>
    <h2 class="sec">The Book Shop</h2>
    <div class="levels" role="tablist" aria-label="Levels">${B.LEVELS.map(l => `<button role="tab" aria-selected="${l.n === ui.level}" class="lv ${l.n === ui.level ? "on" : ""}" data-lv="${l.n}"><span>${l.icon}</span>Level ${l.n}</button>`).join("")}</div>
    <p class="lvinfo"><b>${esc(lv.name)}</b> · ${esc(lv.sub)}<br><small>${readIn} of ${list.length} read</small></p>
    <div class="shelf">${list.map(b => `<button class="cover" data-id="${esc(b.id)}" style="--c:${esc(b.color)}" aria-label="${esc(b.title)}${fin[b.id] ? ", read" : ""}"><span class="ce">${esc(b.cover)}</span><span class="ct">${esc(b.title)}</span>${fin[b.id] ? '<span class="check" aria-hidden="true">✓</span>' : ""}</button>`).join("")}</div>
    ${C.total(S) >= 600 && !CL.enabled() && (!S.bk || C.daysSince(S.bk, k) >= 7) ? '<section class="nudge"><b>Keep her reading safe ☁️</b><p>Her log lives on this phone. A parent can sign in with Google once to back it up online. She never has to sign in.</p><button class="btn alt" id="bknow">Set up the backup</button></section>' : ""}
    <button class="btn alt" id="manual">＋ Log a book from home</button>
    <p class="fine">Stories are free to share: written for this app, or old public-domain rhymes and fables. Everything stays on this phone.</p>`;
    nav("books");
    $("#gear").onclick = openSettings;
    $("#next").onclick = () => go("b/" + nx.id);
    $("#manual").onclick = openManual;
    if ($("#bknow")) $("#bknow").onclick = openSettings;
    document.querySelectorAll(".lv").forEach(b => (b.onclick = () => { ui.level = +b.dataset.lv; renderShelf(); }));
    const on = document.querySelector(".lv.on"); if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" });
    document.querySelectorAll(".cover").forEach(b => (b.onclick = () => go("b/" + b.dataset.id)));
  }

  /* ---------- reader ---------- */
  function renderReader() {
    const bk = ui.book, pg = bk.pages[ui.page], end = ui.page >= bk.pages.length;
    const n = bk.pages.length;
    $("#nav").hidden = true;
    const sz = ["s0", "s1", "s2"][S.size];
    const emo = end ? bk.cover : pg.pic, cnt = Array.from(emo).length;
    $("#view").innerHTML = `
    <div class="reader ${sz}" style="--c:${esc(bk.color)}">
      <header class="rtop">
        <button class="icon" id="back" aria-label="Back to the shelf">⬅</button>
        <div class="tm" id="tm"><div class="tmrow"><b id="tmnum">0:00</b><span id="tmgoal"></span></div><div class="tmtrack"><i id="tmbar"></i></div></div>
        <button class="icon" id="pause" aria-label="Pause the timer">⏸</button>
      </header>
      ${warnHtml()}
      <div class="idle" id="idlebox" hidden>Still reading? Tap anywhere to keep the timer going.</div>
      <div class="pic ${cnt > 2 ? "m3" : cnt > 1 ? "m2" : ""}" aria-hidden="true">${esc(emo)}</div>
      ${end ? `<div class="the-end"><h2>The End</h2><p>${esc(bk.title)}</p><button class="btn big" id="more">Pick another story</button><button class="btn alt" id="again">Read it again</button></div>`
        : `<p class="text" id="text">${pg.text.split(/\s+/).map((w, i) => `<span class="w" role="button" tabindex="0" data-i="${i}">${esc(w)}</span>`).join(" ")}</p>`}
      ${end ? "" : '<p class="hint">👆 Press and hold a word to break it into sounds</p>'}
      <footer class="rnav">
        <button class="pgbtn" id="prev" ${ui.page === 0 ? "disabled" : ""} aria-label="Previous page">◀</button>
        <div class="pgnum" aria-live="polite">${end ? "The End" : "Page " + (ui.page + 1) + " of " + n}</div>
        <button class="pgbtn go" id="nextp" ${end ? "disabled" : ""} aria-label="${ui.page === n - 1 ? "Finish the story" : "Next page"}">▶</button>
      </footer>
      <div class="tools"><button class="mini" id="sm" aria-label="Smaller words">A−</button><button class="mini" id="lg" aria-label="Bigger words">A+</button><button class="mini ${S.say ? "on" : ""}" id="spk" aria-pressed="${S.say}" aria-label="Say words out loud when tapped">🔊</button></div>
      ${end ? '<div class="confetti" aria-hidden="true">🎉</div>' : ""}
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
    <header class="top"><h1>🗓️ My Reading Log</h1><button class="icon" id="gear" aria-label="Settings">⚙️</button></header>
    <section class="stats"><div><b>🔥 ${C.streak(S, k)}</b><span>nights in a row</span></div><div><b>⭐ ${nights}</b><span>${S.goal}-minute nights</span></div><div><b>📚 ${Object.keys(fin).length}</b><span>stories finished</span></div><div><b>⏱ ${C.fmtTotal(totalSec)}</b><span>read in all</span></div></section>
    <div class="mhead"><button class="icon" id="pm" aria-label="Last month">◀</button><h2>${names[m]} ${y}</h2><button class="icon" id="nm" aria-label="Next month">▶</button></div>
    <p class="mfine">${st.nights} night${st.nights === 1 ? "" : "s"} done this month</p>
    <div class="cal" role="grid"><div class="dow">S</div><div class="dow">M</div><div class="dow">T</div><div class="dow">W</div><div class="dow">T</div><div class="dow">F</div><div class="dow">S</div>
    ${cells.map(c => { if (!c) return '<div class="day empty"></div>'; const s = C.daySec(S, c), dn = +c.slice(8); const cls = (C.isDone(S, c) ? "done " : s ? "some " : "") + (c === k ? "now " : "") + (c === ui.sel ? "sel" : "");
      return `<button class="day ${cls}" data-d="${c}" aria-label="${c}${s ? ", " + C.fmtMin(s) : ""}${C.isDone(S, c) ? ", goal reached" : ""}"><b>${dn}</b><i>${C.isDone(S, c) ? "⭐" : s ? Math.round(s / 60) + "m" : ""}</i></button>`; }).join("")}</div>
    <div id="detail"></div>
    <section class="keep"><h3>Keep her log safe</h3>
      <p class="ok">${store.fail ? "⚠️ This phone is not letting the app save." : "✓ Saved on this phone"}</p>
      <p class="cl2" id="cl2">${esc(cloudLine()) || "☁️ Not backed up online yet."}</p>
      <button class="btn" id="kcloud">${CL.status === "ok" ? "☁️ Back up now" : "☁️ Back up online (a parent signs in once)"}</button>
      <button class="btn alt" id="kfile">💾 Save a backup file</button>
      <p class="fine left" id="kmsg" role="status"></p>
    </section>`;
    nav("log");
    $("#gear").onclick = openSettings;
    $("#kcloud").onclick = () => { if (CL.status === "ok") { CL.syncNow(); $("#kmsg").textContent = "Backing up…"; setTimeout(() => { if ($("#cl2")) renderLog(); }, 1500); } else openSettings(); };
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
      Object.keys(d.books).forEach(id => { const b = byId[id], x = d.books[id]; if (!b) return; rows += `<li><span class="le">${esc(b.cover)}</span><span class="lt">${esc(b.title)}<small>Level ${b.level}${x.fin ? " · finished ✓" : ""}</small></span><span class="lm">${C.fmtMin(x.sec)}</span></li>`; });
      d.extra.forEach(x => { rows += `<li><span class="le">📕</span><span class="lt">${esc(x.title)}<small>from home</small></span><span class="lm">${C.fmtMin(x.sec)}</span></li>`; });
    }
    $("#detail").innerHTML = `<section class="dcard"><h3>${esc(label)}</h3>${d && d.sec ? `<p class="dtot">${C.fmtMin(d.sec)} total${C.isDone(S, k) ? " ⭐" : ""}</p><ul class="list">${rows}</ul>` : "<p class='dtot'>No reading logged this day.</p>"}</section>`;
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
  function closeOverlay(o, then) { const i = overlays.indexOf(o); if (i >= 0) overlays.splice(i, 1); o.remove(); if (then) afterTrip = then; syncHistory(); }
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
  function openSettings() {
    const o = sheet(`<h2>Settings</h2>
      <label>Reader's name (optional)<input id="sn" maxlength="20" autocomplete="off" value="${esc(S.name)}"></label>
      <label>Reading goal each night<select id="sg">${C.GOALS.map(g => `<option ${g === S.goal ? "selected" : ""} value="${g}">${g} minutes</option>`).join("")}</select></label>
      <label>Word size<select id="sz"><option value="0">Big</option><option value="1">Bigger</option><option value="2">Biggest</option></select></label>
      <label class="chk"><input type="checkbox" id="ss" ${S.say ? "checked" : ""}> Say a word out loud when it is tapped</label>
      <button class="btn alt" id="stest">🔊 Test the sound</button>
      <p class="fine left" id="stm" role="status"></p>
      <h3 class="subh">Cloud backup (for a parent)</h3>
      <p class="fine left">Sign in with Google once and her log is kept online, so a lost or new phone gets it back. She never needs to sign in to read.</p>
      <p class="fine left" id="cl" role="status"></p>
      <button class="btn" id="cin" hidden>Sign in with Google</button>
      <button class="btn alt" id="cnow" hidden>Back up now</button>
      <button class="btn alt" id="cout" hidden>Sign out of the backup</button>
      <h3 class="subh">Or save a file</h3>
      <p class="fine left">${S.bk ? "Last backup: " + esc(S.bk) : "No backup saved yet."} The file is saved on this phone; keep it somewhere safe.</p>
      <button class="btn alt" id="sb">💾 Save a backup file</button>
      <label class="btn alt filebtn">📂 Restore from a backup file<input type="file" id="sr" accept=".json,application/json" hidden></label>
      <p class="fine left" id="sm" role="status"></p>
      <button class="btn danger" id="se">Erase the reading log</button>
      <div class="row"><button class="btn" id="sd">Done</button></div>`);
    $("#sz").value = String(S.size);
    $("#stest").onclick = () => {
      AU.unlock(); const ok = AU.beep(), i = AU.info(); if (i.speech) setTimeout(() => AU.speak("Hello! Can you hear me?", 0.85), 700);
      $("#stm").textContent = !ok ? "This browser cannot make sound." : "You should hear a beep" + (i.speech ? " and then a voice" : "") + ". " + (i.speech ? (i.voices ? "" : "This phone has not loaded a speaking voice yet; try again in a few seconds. ") : "This phone has no speaking voice, so word-reading is off. Letter sounds still work. ") + "If you hear nothing: turn the media volume up and make sure the phone is not on silent.";
    };
    const paintCloud = () => {
      if (!$("#cl")) return; const st = CL.status, on = st === "ok" || st === "signedin" || st === "denied" || (st === "offline" && CL.email);
      $("#cl").textContent = cloudLine() || (st === "signedout" && CL.msg ? CL.msg : "Not set up yet.");
      $("#cin").hidden = on || st === "loading"; $("#cnow").hidden = !(st === "ok" || st === "offline" && CL.email); $("#cout").hidden = !on;
    };
    CL.onchange = () => { paintCloud(); if (!$("#cl")) CL.onchange = () => {}; };
    paintCloud();
    $("#cin").onclick = () => CL.signIn();
    $("#cnow").onclick = () => CL.syncNow();
    $("#cout").onclick = () => CL.signOut();
    $("#sb").onclick = () => { backup(); $("#sm").textContent = "Backup saved to this phone's Downloads."; };
    $("#sr").onchange = e => restore(e.target.files[0], msg => ($("#sm").textContent = msg));
    $("#se").onclick = () => { if (confirm("Erase every night in the reading log" + (CL.status === "ok" ? ", including the cloud backup" : "") + "? This cannot be undone.")) { S.days = {}; S.bk = ""; save(true); if (CL.status === "ok") CL.overwrite(); closeOverlay(o); route(); } };
    $("#sd").onclick = () => { S.name = $("#sn").value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20); S.goal = +$("#sg").value; S.size = +$("#sz").value; S.say = $("#ss").checked; save(); closeOverlay(o); route(); };
  }

  /* ---------- press and hold: syllables and sounds ---------- */
  function speak(text) { AU.speak(text, 0.75); }
  function openWord(raw) {
    const a = WD.analyze(raw); if (!a) return;
    const can = AU.canSpeak(), n = a.syllables.length;
    const sounds = sy => sy.sounds.map(c => `<i class="${c.silent ? "silent" : ""}"${c.silent ? ' title="silent e"' : ""}>${esc(c.t)}</i>`).join("");
    const chips = a.syllables.map((sy, i) => `<button class="syl c${i % 4}" data-i="${i}" ${can ? "" : "disabled"} aria-label="${esc(sy.text)}"><span class="st">${esc(sy.text)}</span>${a.tricky ? "" : `<span class="snd">${sounds(sy)}</span>`}</button>`).join('<span class="dot" aria-hidden="true">·</span>');
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

  /* ---------- backup and restore ---------- */
  function backup() {
    S.bk = today(); save(true);
    const blob = new Blob([JSON.stringify({ app: "read20", v: 1, saved: new Date().toISOString(), data: S }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "read20-backup-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function restore(file, say) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j || j.app !== "read20" || !j.data) throw new Error("not a Read 20 backup");
        const before = C.total(S); S = C.merge(S, j.data); save(true);
        say("Restored. " + Math.round((C.total(S) - before) / 60) + " minutes added back.");
      } catch (e) { say("That file is not a Read 20 backup."); }
    };
    r.onerror = () => say("Could not read that file."); r.readAsText(file);
  }

  /* ---------- bottom bar ---------- */
  function nav(on) {
    const n = $("#nav"); n.hidden = false;
    n.innerHTML = `<button class="${on === "books" ? "on" : ""}" data-go="">📚<span>Books</span></button><button class="${on === "sounds" ? "on" : ""}" data-go="sounds">🔤<span>Sounds</span></button><button class="${on === "log" ? "on" : ""}" data-go="log">🗓️<span>My Log</span></button>`;
    n.querySelectorAll("button").forEach(b => (b.onclick = () => go(b.dataset.go)));
  }

  function init() {
    load();
    window.addEventListener("hashchange", route);
    window.addEventListener("pagehide", () => save(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) { save(true); CL.flush(); } });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} // ask Chrome never to clear her log to free space
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    route(); recover().then(() => { store.ready = true; save(true); });
    CL.init({ get: () => S, apply: adopt, onchange: () => { if (!ui.book && !document.querySelector(".overlay")) { const h = $("#cloudbadge"); if (h) h.hidden = CL.status !== "ok"; } } });
  }
  window.R20App = { init, _state: () => S };
})();
