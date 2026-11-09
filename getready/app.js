/* Get Ready: the screens. Today, Log, List, Alarms, More.
   Everything is saved on this phone only (localStorage for the checklist, IndexedDB for photos and your own GIFs).
   Nothing is sent anywhere. */
(function () {
  "use strict";
  const C = window.GRCore, DB = window.GRDB, CEL = window.GRCelebrate;
  const KEY = "getready.v1";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nowMs = () => (window.__now != null ? window.__now : Date.now());
  const nowDate = () => new Date(nowMs());
  const today = () => window.__today || C.dayKey(nowDate());
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TABS = [["today", "Today"], ["log", "Log"], ["list", "Lists"], ["alarms", "Alarms"], ["more", "More"]];

  let S = C.defaults(), failed = false;
  const photos = {}, gifURL = {};
  const ui = { tab: "today", edit: "", month: null, sel: null, viewer: null, photoFor: null, shown: "", lastCel: "", lastRem: 0 };

  /* ---------- saving ---------- */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); S = raw ? C.sanitize(JSON.parse(raw)) : C.defaults(); }
    catch (e) { S = C.defaults(); try { if (raw) localStorage.setItem(KEY + ".damaged", raw); } catch (e2) {} } // keep a damaged save instead of writing over it
    return !!raw;
  }
  function save() {
    const j = JSON.stringify(S);
    try { localStorage.setItem(KEY, j); failed = false; } catch (e) { failed = true; }
    DB.put("state", j).catch(() => {}); // a second copy, in case the phone clears one of the two
    const w = $("#warn"); if (w) w.hidden = !failed;
  }
  const item = id => C.findItem(S, id);

  /* ---------- small helpers ---------- */
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.5l3 3 5-6"/></svg>',
    log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17" r="1" fill="currentColor"/></svg>',
    alarms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2" fill="#000"/><circle cx="15" cy="12" r="2" fill="#000"/><circle cx="8" cy="17" r="2" fill="#000"/></svg>'
  };
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function beep(kind) {
    if (!S.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(), t0 = ctx.currentTime, notes = kind === "timer" ? [880, 880, 1175] : [784, 988, 784, 988, 1175];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "square"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        const t = t0 + i * 0.22; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 2500);
    } catch (e) {}
  }
  function toast(msg, ms) {
    const b = document.createElement("button"); b.type = "button"; b.className = "toast"; b.innerHTML = '<span></span><b aria-hidden="true">✕</b>';
    b.firstChild.textContent = msg; b.onclick = () => b.remove();
    $("#toasts").appendChild(b);
    if (ms !== 0) setTimeout(() => b.remove(), ms || 4000);
  }

  /* ---------- pop-ups that the phone's Back gesture closes ---------- */
  const stack = []; let skip = 0;
  function pushOv(el, onClose) {
    stack.push({ el, onClose }); document.body.appendChild(el); document.documentElement.classList.add("lock");
    try { history.pushState({ gr: stack.length }, ""); } catch (e) {}
  }
  function popOv() {
    const o = stack.pop(); if (!o) return;
    o.el.remove(); if (o.onClose) o.onClose();
    if (!stack.length) document.documentElement.classList.remove("lock");
  }
  function closeTop() { if (!stack.length) return; popOv(); skip++; try { history.back(); } catch (e) { skip--; } }
  window.addEventListener("popstate", () => { if (skip > 0) { skip--; return; } popOv(); });

  /* ---------- photos ---------- */
  async function loadPhotos() {
    try {
      const keys = (await DB.keys()) || [];
      for (const k of keys) {
        if (typeof k !== "string" || k.indexOf("photo:") !== 0) continue;
        const b = await DB.get(k);
        if (b) photos[k.slice(6)] = URL.createObjectURL(b);
      }
    } catch (e) {}
    if (!stack.length) render();
  }
  async function shrink(file) {
    try {
      let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { bmp = await createImageBitmap(file); }
      const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.82));
      return blob || file;
    } catch (e) { return file; }
  }
  async function setPhoto(id, file) {
    if (!item(id) || !file) return;
    const blob = await shrink(file);
    try { await DB.put("photo:" + id, blob); } catch (e) { toast("Could not save the photo on this phone."); return; }
    if (photos[id]) URL.revokeObjectURL(photos[id]);
    photos[id] = URL.createObjectURL(blob);
    toast("Photo saved 📸", 2000);
    if (ui.viewer && ui.viewer.id === id) paintViewer();
    if (!stack.length || ui.viewer) render();
  }
  function askPhoto(id, camera) { ui.photoFor = id; const el = $(camera ? "#cam" : "#pick"); el.value = ""; el.click(); }
  function openViewer(id) {
    const el = document.createElement("div"); el.className = "overlay"; el.setAttribute("role", "dialog");
    ui.viewer = { id, el }; paintViewer(); pushOv(el, () => { ui.viewer = null; });
  }
  function paintViewer() {
    const v = ui.viewer, it = v && item(v.id); if (!it) return;
    const has = !!photos[v.id];
    v.el.setAttribute("aria-label", "Photo of " + it.name);
    v.el.innerHTML = '<h3>' + esc(it.name) + '</h3>' +
      (has ? '<img class="pic" alt="Photo of ' + esc(it.name) + '" src="' + photos[v.id] + '">' : '<div class="none">No photo yet.<br>Tap Take photo so you can recognize it.</div>') +
      '<div class="btns"><button class="btn pri" data-act="vcam">📷 ' + (has ? "Retake" : "Take photo") + '</button><button class="btn" data-act="vpick">Choose photo</button>' +
      (has ? '<button class="btn danger" data-act="vdel">Remove photo</button>' : "") + '<button class="btn" data-act="vclose">Close</button></div>';
  }

  /* ---------- checking things off ---------- */
  function doToggle(id) {
    const r = C.toggle(S, today(), id);
    if (r.checked && S.timer && S.timer.id === id) S.timer = null;
    save(); vibrate(12); render();
    if (r.justDone) setTimeout(() => celebrate(), 300);
  }
  /* A random dance: one of the built-in dancers, or (half the time, if you added some) one of your own GIFs. */
  async function celebrate(forceStyle) {
    let style = forceStyle, src = "";
    if (!style) {
      const own = S.gifs.length && Math.random() < 0.5;
      const group = own ? S.gifs.map(g => "g:" + g.id) : CEL.STYLES.map(s => "s:" + s);
      const i = C.pick(group.length, group.indexOf(ui.lastCel)), key = group[i];
      ui.lastCel = key;
      if (key[0] === "s") style = key.slice(2);
      else { const g = S.gifs.find(x => "g:" + x.id === key); try { src = await gifSrc(g); } catch (e) {} }
    }
    const h = CEL.build({ style, gif: src, sound: !!S.sound, close: () => { if (stack.length && stack[stack.length - 1].el === h.el) closeTop(); } });
    pushOv(h.el, () => h.stop());
  }
  async function gifSrc(g) {
    if (!g) return "";
    if (g.kind === "url") return g.url;
    if (gifURL[g.id]) return gifURL[g.id];
    const b = await DB.get("gif:" + g.id);
    return b ? (gifURL[g.id] = URL.createObjectURL(b)) : "";
  }

  /* ---------- timers ---------- */
  function startTimer(id) {
    const it = item(id); if (!it || !it.timer) return;
    S.timer = { id, end: nowMs() + it.timer * 1000 }; save(); render();
  }
  function stopTimer() { S.timer = null; save(); render(); }
  function finishTimer() {
    const id = S.timer.id, it = item(id); S.timer = null; save();
    beep("timer"); vibrate([200, 100, 200, 100, 300]);
    if (it) { toast("⏱ " + it.name + " is done!"); notify(it.name + " is done!", "timer-" + id); if (!C.isChecked(S, today(), id)) { doToggle(id); return; } }
    render();
  }

  /* ---------- reminders ---------- */
  function notify(body, tag) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const opts = { body, tag, icon: "/apps/icons/getready-192.png", vibrate: [200, 100, 200] };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.showNotification("Get Ready", opts); else new Notification("Get Ready", opts); }).catch(() => {});
      else new Notification("Get Ready", opts);
    } catch (e) {}
  }
  function fire(r) {
    S.fired[r.id] = C.dayKey(nowDate()); save();
    beep("alarm"); vibrate([300, 150, 300, 150, 300]);
    toast("⏰ " + r.label, 20000); notify(r.label, "rem-" + r.id);
  }
  const checkReminders = () => C.dueReminders(S, nowDate()).forEach(fire);

  function tick() {
    if (S.timer) {
      const left = C.remaining(S.timer, nowMs());
      if (left <= 0) finishTimer();
      else { const b = [...document.querySelectorAll("[data-timer]")].find(e => e.dataset.timer === S.timer.id); if (b) b.textContent = C.fmt(left); }
    }
    if (nowMs() - ui.lastRem > 15000) { ui.lastRem = nowMs(); checkReminders(); }
    if (ui.shown && ui.shown !== today()) { ui.shown = today(); if (!stack.length) render(); }
  }

  /* ---------- screens ---------- */
  function render() {
    ui.shown = today();
    $("#nav").innerHTML = TABS.map(([id, label]) => '<button class="navb' + (ui.tab === id ? " on" : "") + '" data-act="tab" data-tab="' + id + '"' + (ui.tab === id ? ' aria-current="page"' : "") + ">" + ICON[id] + "<span>" + label + "</span></button>").join("");
    $("#tabname").textContent = ui.tab === "today" ? "" : TABS.find(t => t[0] === ui.tab)[1];
    const v = { today: vToday, log: vLog, list: vList, alarms: vAlarms, more: vMore }[ui.tab]();
    $("#view").innerHTML = '<div class="warn" id="warn" role="alert"' + (failed ? "" : " hidden") + '>⚠️ This phone is not letting the app save. Open Get Ready from the home-screen icon (not a private tab), or free up some space.</div>' + v;
  }

  function thumbHtml(it, cls) {
    const has = !!photos[it.id];
    return '<button class="thumb' + (cls || "") + (has ? " has" : "") + '" data-act="thumb" data-id="' + esc(it.id) + '" aria-label="' + (has ? "Show the photo of " : "Add a photo of ") + esc(it.name) + '">' +
      (has ? '<img alt="" src="' + photos[it.id] + '">' : ICON.cam + '<span class="plus" aria-hidden="true">+</span>') + "</button>";
  }

  /* Switch which list this date uses (for one day only; the weekdays set in the Lists tab stay as they are). */
  function listPicker(k, list) {
    if (S.lists.length < (list ? 2 : 1)) return "";
    return '<label class="pickrow"><span>List for today</span><select class="inp" data-act="daylist" aria-label="List for today">' + (list ? "" : '<option value="">Pick a list…</option>') +
      S.lists.map(l => '<option value="' + esc(l.id) + '"' + (list && list.id === l.id ? " selected" : "") + ">" + esc(l.name) + "</option>").join("") + "</select></label>";
  }

  function vToday() {
    const k = today(), d = nowDate(), h = d.getHours(), list = C.listFor(S, k), items = list ? list.items : [], n = items.length, c = C.count(S, k), full = C.isComplete(S, k);
    const hi = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening", st = C.streak(S, k);
    let o = '<div class="hello"><div><h1>' + hi + '!</h1><p>' + esc(d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })) + (list ? " · " + esc(list.name) : "") + '</p></div>' +
      '<div class="streak" aria-label="' + st + ' day streak"><b>🔥 ' + st + '</b>streak</div></div>';
    if (!list) return o + '<div class="card"><b>No list on ' + DAYS[C.dow(k)] + 's</b><p class="fine">Enjoy the day off! If you want a checklist anyway, pick one. You can choose which days use which list in the Lists tab.</p>' + listPicker(k, list) + "</div>";
    if (!n) return o + '<div class="card">This list is empty. Open the <b>Lists</b> tab to add things to get ready.</div>' + listPicker(k, list) + '';
    o += '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + c + '"><i style="width:' + Math.round(c / n * 100) + '%"></i></div>' +
      '<div class="bartxt"><span>' + c + " of " + n + " ready</span><span>" + (full ? "All done!" : n - c + " to go") + "</span></div>";
    if (full) o += '<div class="card allset"><b>🎉 You\'re ready for school!</b><span class="mute">Every single thing is checked off.</span><br><button class="btn pri" data-act="again">Watch the dance again</button></div><div style="height:12px"></div>';
    o += '<ul class="list">' + items.map(it => {
      const on = C.isChecked(S, k, it.id), run = S.timer && S.timer.id === it.id;
      const t = it.timer && (run || !on) ? '<button class="tbtn' + (run ? " run" : "") + '" data-act="timer" data-id="' + esc(it.id) + '" data-timer="' + esc(it.id) + '" aria-label="' + (run ? "Stop the timer for " : "Start the " + C.timerLabel(it.timer) + " timer for ") + esc(it.name) + '">' + (run ? C.fmt(C.remaining(S.timer, nowMs())) : "⏱ " + C.fmt(it.timer)) + "</button>" : "";
      return '<li class="item' + (on ? " on" : "") + '" data-id="' + esc(it.id) + '">' + thumbHtml(it) +
        '<button class="iname" data-act="check" data-id="' + esc(it.id) + '">' + esc(it.name) + "</button>" + t +
        '<button class="chk" role="checkbox" aria-checked="' + on + '" aria-label="' + esc(it.name) + '" data-act="check" data-id="' + esc(it.id) + '">' + ICON.check + "</button></li>";
    }).join("") + "</ul>";
    return o + listPicker(k, list) + '<p class="fine">Tap the picture next to an item to see what it looks like. No picture yet? Tap the camera to take one. Keep the app open while a timer runs.</p>';
  }

  function vLog() {
    const k = today();
    if (!ui.month) ui.month = k.slice(0, 7);
    const [y, m] = ui.month.split("-").map(Number), first = new Date(y, m - 1, 1), lead = first.getDay(), dim = new Date(y, m, 0).getDate();
    const mDone = Object.keys(S.days).filter(x => x.slice(0, 7) === ui.month && S.days[x].done).length;
    let cells = ["S", "M", "T", "W", "T", "F", "S"].map(x => '<div class="dh" aria-hidden="true">' + x + "</div>").join("") + '<div></div>'.repeat(lead);
    for (let d = 1; d <= dim; d++) {
      const key = ui.month + "-" + (d < 10 ? "0" : "") + d, done = C.isDone(S, key), cnt = C.count(S, key);
      const cls = ["d", done ? "done" : cnt ? "part" : "", key > k ? "fut" : "", key === k ? "today" : "", !C.hasList(S, key) && !done ? "off" : ""].filter(Boolean).join(" ");
      cells += '<button class="' + cls + '" data-act="day" data-day="' + key + '" aria-label="' + DAYS[C.dow(key)] + " " + key + (done ? ", all done" : "") + '">' + (done ? ICON.check.replace('stroke-width="3.2"', 'stroke-width="3.6" width="22" height="22"') : d) + "</button>";
    }
    let sel = "";
    if (ui.sel) {
      const key = ui.sel, its = C.itemsFor(S, key), miss = its.filter(i => !C.isChecked(S, key, i.id)).map(i => i.name), ln = C.listFor(S, key);
      sel = '<div class="card"><b>' + DAYS[C.dow(key)] + ", " + esc(C.parseDay(key).toLocaleDateString(undefined, { month: "long", day: "numeric" })) + "</b><br>" +
        (ln ? esc(ln.name) + ": " : "") + (C.isDone(S, key) ? "All done ✓" : S.days[key] ? C.count(S, key) + " of " + its.length + " checked. Not checked: " + esc(miss.join(", ")) : ln ? "Nothing checked this day." : "No list this day.") + "</div>";
    }
    return '<div class="stats"><div class="stat"><b>🔥 ' + C.streak(S, k) + '</b>day streak</div><div class="stat"><b>' + mDone + '</b>this month</div><div class="stat"><b>' + C.doneDays(S) + '</b>days total</div></div>' +
      '<div class="mon"><button class="ibtn" data-act="monprev" aria-label="Last month">‹</button><b>' + esc(first.toLocaleDateString(undefined, { month: "long", year: "numeric" })) + '</b><button class="ibtn" data-act="monnext" aria-label="Next month"' + (ui.month >= k.slice(0, 7) ? " disabled" : "") + '>›</button></div>' +
      '<div class="cal">' + cells + "</div>" + sel;
  }

  function timerOpts(cur) { return C.TIMERS.map(t => '<option value="' + t + '"' + (t === cur ? " selected" : "") + ">" + (t ? C.timerLabel(t) + " timer" : "No timer") + "</option>").join(""); }
  const SUGGEST = ["Glasses", "Homework folder", "Jacket", "Shoes", "Library book", "Phone charger", "Sports gear", "Snack", "Comb hair", "Make bed"];
  function curList() { if (!S.lists.some(l => l.id === ui.edit)) ui.edit = S.lists.length ? S.lists[0].id : ""; return S.lists.find(l => l.id === ui.edit) || null; }
  function weekLine() {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((n, d) => { const l = S.lists.find(x => x.days.includes(d)); return "<b>" + n + "</b> " + (l ? esc(l.name) : "day off"); }).join(" · ");
  }
  function vList() {
    const L = curList();
    let o = '<h2 class="sec">Your lists</h2><p class="mute">Make a list for each kind of day, then pick the days it is used. For example, one list for Monday and Thursday, another for Tuesday and Friday, and one for the weekend.</p>' +
      '<div class="chips" role="group" aria-label="Lists">' + S.lists.map(l => '<button class="chip' + (l.id === ui.edit ? " on" : "") + '" data-act="editlist" data-id="' + esc(l.id) + '" aria-pressed="' + (l.id === ui.edit) + '">' + esc(l.name) + "</button>").join("") +
      (S.lists.length < 12 ? '<button class="chip" data-act="newlist">+ New list</button>' : "") + "</div>";
    if (!L) return o + '<div class="card">No lists yet. Tap <b>+ New list</b> to make one.</div>';
    const sug = SUGGEST.filter(x => !L.items.some(i => i.name.toLowerCase() === x.toLowerCase()));
    o += '<div class="card"><label class="fine" style="margin:0" for="lname">List name</label><input class="inp" id="lname" data-act="lname" data-id="' + esc(L.id) + '" value="' + esc(L.name) + '" maxlength="30">' +
      '<p style="margin-top:12px"><b>Used on</b></p><div class="chips days">' + dayChips(L.days, "lday", 'data-id="' + esc(L.id) + '"') + '</div>' +
      '<p class="fine">' + (L.days.length ? "" : "Not used on any day yet. ") + "Tapping a day that another list uses moves it to this one. Days with no list are days off.</p>" +
      '<div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="duplist" data-id="' + esc(L.id) + '">Copy this list</button><button class="btn sm danger" data-act="dellist" data-id="' + esc(L.id) + '">Delete this list</button></div></div>' +
      '<h2 class="sec">Things on this list</h2><ul class="list">' +
      L.items.map((it, i) => '<li class="erow" data-id="' + esc(it.id) + '">' + thumbHtml(it, " sm") + '<div class="efields"><input class="inp" data-act="rename" data-id="' + esc(it.id) + '" value="' + esc(it.name) + '" maxlength="40" aria-label="Name of item ' + (i + 1) + '">' +
        '<select class="inp" data-act="settimer" data-id="' + esc(it.id) + '" aria-label="Timer for ' + esc(it.name) + '">' + timerOpts(it.timer) + "</select></div>" +
        '<div class="ebtns"><button class="ibtn" data-act="up" data-id="' + esc(it.id) + '" aria-label="Move ' + esc(it.name) + ' up"' + (i === 0 ? " disabled" : "") + '>↑</button><button class="ibtn" data-act="down" data-id="' + esc(it.id) + '" aria-label="Move ' + esc(it.name) + ' down"' + (i === L.items.length - 1 ? " disabled" : "") + '>↓</button><button class="ibtn danger" data-act="del" data-id="' + esc(it.id) + '" aria-label="Remove ' + esc(it.name) + '">✕</button></div></li>').join("") + "</ul>" +
      '<div class="card"><div class="row"><input class="inp" id="newItem" maxlength="40" placeholder="Add something…" autocomplete="off" aria-label="New item name"><button class="btn pri" data-act="add">Add</button></div>' +
      (sug.length ? '<div class="chips" aria-label="Ideas">' + sug.map(x => '<button class="chip" data-act="suggest" data-name="' + esc(x) + '">+ ' + esc(x) + "</button>").join("") + "</div>" : "") + "</div>" +
      '<p class="fine">Tap a picture to take a photo of the item so you can recognize it. A timer is optional: it shows next to the item on the Today screen.</p>' +
      '<div class="card"><b>The week</b><p class="fine" style="line-height:1.9">' + weekLine() + "</p></div>";
    return o;
  }

  const dayChips = (days, attr, extra) => ["S", "M", "T", "W", "T", "F", "S"].map((l, i) => '<button class="chip' + (days.includes(i) ? " on" : "") + '" data-act="' + attr + '" data-d="' + i + '" ' + (extra || "") + ' aria-pressed="' + days.includes(i) + '" aria-label="' + DAYS[i] + '">' + l + "</button>").join("");
  function vAlarms() {
    const perm = "Notification" in window ? Notification.permission : "none";
    return '<h2 class="sec">Reminders</h2><p class="mute">Pick the times you want a nudge. They pop up (and beep) while the app is open.</p><ul class="list" style="margin-top:12px">' +
      S.reminders.map(r => '<li class="rrow' + (r.on ? "" : " off") + '" data-id="' + esc(r.id) + '"><div class="row"><input type="time" class="inp" data-act="rtime" data-id="' + esc(r.id) + '" value="' + r.time + '" aria-label="Reminder time">' +
        '<input class="inp" data-act="rlabel" data-id="' + esc(r.id) + '" value="' + esc(r.label) + '" maxlength="60" aria-label="Reminder words"><button class="sw" role="switch" aria-checked="' + !!r.on + '" aria-label="Reminder on" data-act="rtoggle" data-id="' + esc(r.id) + '"></button></div>' +
        '<div class="chips days">' + dayChips(r.days, "rday", 'data-id="' + esc(r.id) + '"') + '</div><div class="row sp" style="margin-top:10px"><span class="fine" style="margin:0">' + (r.days.length ? "" : "Pick at least one day.") + '</span><button class="btn sm danger" data-act="rdel" data-id="' + esc(r.id) + '">Remove</button></div></li>').join("") + "</ul>" +
      '<button class="btn block" style="margin-top:12px" data-act="radd">+ Add a reminder</button>' +
      '<div class="card"><b>Make them ring even when the app is closed</b><p class="fine" style="margin-bottom:10px">A web app can only beep while it is open. To get a real alarm any time, add these reminders to your phone\'s calendar. They repeat every week with an alarm.</p><button class="btn pri block" data-act="ics">Add to my phone\'s calendar</button></div>' +
      '<div class="card"><b>Phone notifications</b><p class="fine" style="margin-bottom:10px">' + (perm === "granted" ? "Allowed. Reminders also show as notifications when the app is open or has been used recently." : perm === "denied" ? "Blocked. Turn notifications on for Get Ready in the phone's settings." : perm === "none" ? "This phone's browser doesn't support notifications." : "Allow notifications so a reminder can show on the lock screen.") + '</p><div class="row wrap">' +
      (perm === "default" ? '<button class="btn" data-act="notif">Allow notifications</button>' : "") + '<button class="btn" data-act="rtest">Test a reminder</button></div></div>';
  }

  function vMore() {
    return '<h2 class="sec">Sound</h2><div class="card row sp"><span>Beeps and cheers</span><button class="sw" role="switch" aria-checked="' + !!S.sound + '" aria-label="Sound" data-act="sound"></button></div>' +
      '<h2 class="sec">Celebration</h2><p class="mute">When everything is checked off, a random full-screen dance plays. Preview one:</p><div class="chips">' +
      CEL.STYLES.map(s => '<button class="chip" data-act="preview" data-style="' + s + '">' + CEL.NAMES[s] + "</button>").join("") + "</div>" +
      '<div class="card"><b>My own dance GIFs</b><p class="fine" style="margin-bottom:8px">Add GIFs to mix into the random pick. They stay on this phone. A link needs a connection to play; a GIF from the phone works offline.</p>' +
      S.gifs.map(g => '<div class="gifrow"><span>' + esc(g.name) + (g.kind === "url" ? " (link)" : "") + '</span><button class="btn sm" data-act="gifprev" data-id="' + esc(g.id) + '">Preview</button><button class="ibtn danger" data-act="gifdel" data-id="' + esc(g.id) + '" aria-label="Remove ' + esc(g.name) + '">✕</button></div>').join("") +
      '<div class="row wrap" style="margin-top:8px"><button class="btn" data-act="gifadd">Add a GIF from this phone</button><button class="btn" data-act="gifurl">Add a GIF link</button></div></div>' +
      '<h2 class="sec">Today</h2><button class="btn block danger" data-act="resetday">Start today over</button>' +
      '<p class="fine">Everything here, including photos, stays on this phone. Nothing is uploaded or shared. Clearing this app\'s site data erases it.</p>';
  }

  /* ---------- clicks ---------- */
  function sort(id, dir) { const l = C.listOf(S, id); if (!l) return; l.items = C.moveItem(l.items, id, dir); save(); render(); }
  function addItem(name) {
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return;
    const L = curList(); if (!L) return;
    if (L.items.length >= 60) { toast("That's a lot of items! Remove one first."); return; }
    L.items.push({ id: C.uid(), name, timer: 0 }); C.settle(S, today()); save(); render();
  }
  async function removeItem(id) {
    const it = item(id); if (!it || !window.confirm('Remove "' + it.name + '" from the list?')) return;
    const L = C.listOf(S, id); if (L) L.items = L.items.filter(i => i.id !== id);
    if (S.timer && S.timer.id === id) S.timer = null;
    if (photos[id]) { URL.revokeObjectURL(photos[id]); delete photos[id]; DB.del("photo:" + id).catch(() => {}); }
    const done = C.settle(S, today()); save(); render();
    if (done) setTimeout(() => celebrate(), 300);
  }
  function duplicateList(id) {
    const src = S.lists.find(l => l.id === id); if (!src || S.lists.length >= 12) return;
    const copy = { id: C.uid(), name: (src.name + " copy").slice(0, 30), days: [], items: [] };
    src.items.forEach(it => {
      const n = { id: C.uid(), name: it.name, timer: it.timer }; copy.items.push(n);
      if (photos[it.id]) DB.get("photo:" + it.id).then(b => b && DB.put("photo:" + n.id, b).then(() => { photos[n.id] = URL.createObjectURL(b); if (!stack.length) render(); })).catch(() => {});
    });
    S.lists.push(copy); ui.edit = copy.id; save(); render(); toast("Copied. Now pick the days for it.", 3000);
  }
  function deleteList(id) {
    const l = S.lists.find(x => x.id === id); if (!l || !window.confirm('Delete the list "' + l.name + '" and its pictures?')) return;
    l.items.forEach(it => { if (S.timer && S.timer.id === it.id) S.timer = null; if (photos[it.id]) { URL.revokeObjectURL(photos[it.id]); delete photos[it.id]; DB.del("photo:" + it.id).catch(() => {}); } });
    S.lists = S.lists.filter(x => x.id !== id); C.settle(S, today()); save(); render();
  }
  function download(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function addReminder() {
    if (S.reminders.length >= 20) return;
    S.reminders.push({ id: C.uid(), label: "Reminder", time: "07:15", days: [1, 2, 3, 4, 5], on: 1 }); save(); render();
  }

  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const a = el.dataset.act, id = el.dataset.id;
    switch (a) {
      case "tab": ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
      case "check": doToggle(id); break;
      case "thumb": if (photos[id]) openViewer(id); else askPhoto(id, true); break;
      case "timer": if (S.timer && S.timer.id === id) stopTimer(); else startTimer(id); break;
      case "again": celebrate(); break;
      case "vcam": askPhoto(ui.viewer.id, true); break;
      case "vpick": askPhoto(ui.viewer.id, false); break;
      case "vdel": { const vid = ui.viewer.id; URL.revokeObjectURL(photos[vid]); delete photos[vid]; DB.del("photo:" + vid).catch(() => {}); paintViewer(); render(); break; }
      case "vclose": closeTop(); break;
      case "up": sort(id, -1); break;
      case "down": sort(id, 1); break;
      case "del": removeItem(id); break;
      case "add": { const i = $("#newItem"); addItem(i.value); break; }
      case "suggest": addItem(el.dataset.name); break;
      case "monprev": { const [y, m] = ui.month.split("-").map(Number); ui.month = C.dayKey(new Date(y, m - 2, 1)).slice(0, 7); ui.sel = null; render(); break; }
      case "monnext": { const [y, m] = ui.month.split("-").map(Number); ui.month = C.dayKey(new Date(y, m, 1)).slice(0, 7); ui.sel = null; render(); break; }
      case "day": ui.sel = ui.sel === el.dataset.day ? null : el.dataset.day; render(); break;
      case "radd": addReminder(); break;
      case "rdel": S.reminders = S.reminders.filter(r => r.id !== id); save(); render(); break;
      case "rtoggle": { const r = S.reminders.find(x => x.id === id); r.on = r.on ? 0 : 1; save(); render(); break; }
      case "rday": { const r = S.reminders.find(x => x.id === id), d = +el.dataset.d; r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : r.days.concat(d).sort(); save(); render(); break; }
      case "rtest": beep("alarm"); vibrate([200, 100, 200]); toast("⏰ This is what a reminder looks like", 6000); notify("This is what a reminder looks like", "test"); break;
      case "notif": try { const p = Notification.requestPermission(); if (p && p.then) p.then(render); else render(); } catch (err) { render(); } break;
      case "ics": download("getready-reminders.ics", "text/calendar", C.ics(S, nowDate())); toast("Open the file to add the reminders to your calendar.", 5000); break;
      case "editlist": ui.edit = id; render(); break;
      case "newlist": { const l = { id: C.uid(), name: "New list", days: [], items: [] }; S.lists.push(l); ui.edit = l.id; save(); render(); const n = $("#lname"); if (n) { n.focus(); n.select(); } break; }
      case "duplist": duplicateList(id); break;
      case "dellist": deleteList(id); break;
      case "lday": { const l = S.lists.find(x => x.id === id), d = +el.dataset.d; C.setListDays(S, id, l.days.includes(d) ? l.days.filter(x => x !== d) : l.days.concat(d)); C.settle(S, today()); save(); render(); break; }
      case "sound": S.sound = S.sound ? 0 : 1; save(); render(); break;
      case "preview": celebrate(el.dataset.style); break;
      case "gifadd": $("#gifpick").value = ""; $("#gifpick").click(); break;
      case "gifurl": {
        const u = (window.prompt("Paste a link to a GIF (it must start with https://)") || "").trim();
        if (!u) break;
        if (!/^https:\/\/[^\s"'<>]+$/i.test(u) || u.length > 600) { toast("That doesn't look like an https:// link."); break; }
        S.gifs.push({ id: C.uid(), kind: "url", url: u, name: "GIF " + (S.gifs.length + 1) }); save(); render(); break;
      }
      case "gifprev": { const g = S.gifs.find(x => x.id === id); let src = ""; try { src = await gifSrc(g); } catch (err) {} const h = CEL.build({ style: CEL.STYLES[0], gif: src, sound: false, close: () => { if (stack.length && stack[stack.length - 1].el === h.el) closeTop(); } }); pushOv(h.el, () => h.stop()); break; }
      case "gifdel": S.gifs = S.gifs.filter(g => g.id !== id); if (gifURL[id]) { URL.revokeObjectURL(gifURL[id]); delete gifURL[id]; } DB.del("gif:" + id).catch(() => {}); save(); render(); break;
      case "resetday": if (window.confirm("Clear every check mark for today?")) { C.resetDay(S, today()); S.timer = null; save(); render(); } break;
    }
  });

  /* Text boxes, pickers and menus save when you finish editing (no redraw, so the keyboard stays up). */
  document.addEventListener("change", e => {
    const el = e.target, a = el.dataset && el.dataset.act, id = el.dataset && el.dataset.id;
    if (a === "rename") { const it = item(id), v = el.value.replace(/\s+/g, " ").trim().slice(0, 40); if (it && v) { it.name = v; save(); } else if (it) el.value = it.name; }
    else if (a === "lname") { const l = S.lists.find(x => x.id === id), v = el.value.replace(/\s+/g, " ").trim().slice(0, 30); if (l) { l.name = v || "My list"; if (!v) el.value = l.name; save(); const chip = [...document.querySelectorAll('[data-act=editlist]')].find(c => c.dataset.id === id); if (chip) chip.textContent = l.name; } }
    else if (a === "daylist") { const done = C.setDayList(S, today(), el.value); save(); render(); if (done) setTimeout(() => celebrate(), 300); }
    else if (a === "settimer") { const it = item(id); if (it) { it.timer = +el.value; if (S.timer && S.timer.id === id) S.timer = null; save(); } }
    else if (a === "rtime") { const r = S.reminders.find(x => x.id === id); if (r && /^\d\d:\d\d$/.test(el.value)) { r.time = el.value; delete S.fired[r.id]; save(); } }
    else if (a === "rlabel") { const r = S.reminders.find(x => x.id === id), v = el.value.trim().slice(0, 60); if (r) { r.label = v || "Reminder"; save(); } }
    else if (el.id === "cam" || el.id === "pick") { const f = el.files && el.files[0]; if (f && ui.photoFor) setPhoto(ui.photoFor, f); }
    else if (el.id === "gifpick") {
      const f = el.files && el.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast("That GIF is bigger than 8 MB. Pick a smaller one."); return; }
      const g = { id: C.uid(), kind: "file", name: (f.name || "My GIF").replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || "My GIF" };
      DB.put("gif:" + g.id, f).then(() => { S.gifs.push(g); save(); render(); toast("GIF added 🕺", 2500); }).catch(() => toast("Could not save that GIF on this phone."));
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "newItem") { e.preventDefault(); addItem(e.target.value); } });

  function init() {
    const had = load();
    render();
    if (!had) DB.get("state").then(j => { if (j) { S = C.sanitize(JSON.parse(j)); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} if (!stack.length) render(); } }).catch(() => {});
    loadPhotos();
    setInterval(tick, 250);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { ui.lastRem = 0; tick(); if (!stack.length) render(); } });
    checkReminders(); ui.lastRem = nowMs();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    window.GetReady = { state: () => S, render, celebrate }; // for the tests
  }
  init();
})();
