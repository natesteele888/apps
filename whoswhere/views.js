/* Who's Where, part 2: the screens (week, month, needs attention, people, welcome) and the top bar / tab bar. */
(function () {
  "use strict";
  const { C, S, $, $$, esc, I, chip, h24 } = window.WW;
  const WW = window.WW;
  const today = () => C.todayStr();

  /* ---------- fix buttons: the action itself stays in memory, the button only carries a number ---------- */
  let fixSeq = 0;
  const fixReg = {};
  function fixBtn(fix, cls) {
    const id = ++fixSeq; fixReg[id] = fix;
    delete fixReg[id - 400];
    return '<button type="button" class="btn small ' + (cls || "ghost") + ' fixbtn" data-act="fix" data-fix="' + id + '">' + esc(fix.label) + "</button>";
  }
  WW.fixOf = id => fixReg[id] || null;

  /* ---------- pieces ---------- */
  function timeParts(min) {
    const t = C.fmtTime(min, h24());
    return h24() ? [t, ""] : [t.slice(0, -3), t.slice(-2)];
  }
  function driverChip(ev) {
    if (ev.driver === "none") return "";
    if (C.isAdultId(ev.driver)) { const p = S.pm[ev.driver]; return p ? '<span class="chip role" style="--c:' + esc(p.color) + '"><span aria-hidden="true">🚗</span><span class="sr">Driver: </span>' + esc(p.name) + "</span>" : ""; }
    return '<span class="chip need"><span aria-hidden="true">🚗</span> ' + (ev.driver === "ride" ? "Needs a ride" : "No driver yet") + "</span>";
  }
  function snackChip(ev) {
    if (ev.snack === "open") return '<span class="chip need"><span aria-hidden="true">🍎</span> Snack: needs someone</span>';
    if (C.isAdultId(ev.snack)) { const p = S.pm[ev.snack]; return p ? '<span class="chip role" style="--c:' + esc(p.color) + '"><span aria-hidden="true">🍎</span><span class="sr">Snack: </span>' + esc(p.name) + "</span>" : ""; }
    return "";
  }
  function eventCard(ev, o) {
    o = o || {};
    const cfs = S.cfBy[ev.id] || [], dim = S.filter && !C.involves(ev, S.filter);
    const tp = timeParts(ev.start), endTxt = C.fmtTime(ev.end, h24()).replace(" ", "\u00a0") + (C.crossesMidnight(ev) ? " next day" : "");
    const ti = C.typeInfo(ev.type);
    const kids = ev.kids.map(k => chip(S.pm[k])).join("");
    return '<button type="button" class="ev' + (cfs.length ? " bad" : "") + (dim ? " dim" : "") + '" data-act="open-ev" data-id="' + esc(ev.id) + '">' +
      '<span class="ev-time"><b>' + esc(tp[0]) + "</b>" + (tp[1] ? " <small>" + tp[1] + "</small>" : "") + "<em>to\u00a0" + esc(endTxt) + "</em></span>" +
      '<span class="ev-main"><span class="ev-top"><span class="ev-title"><span aria-hidden="true">' + ti.icon + "</span> " + esc(ev.title) + "</span>" +
      (cfs.length && !o.noBadge ? '<span class="badge bad">Conflict</span>' : "") + "</span>" +
      (o.showDate ? '<span class="ev-place">' + esc(C.fmtDate(ev.date, "short")) + "</span>" : "") +
      (ev.place ? '<span class="ev-place"><span aria-hidden="true">📍</span> ' + esc(ev.place) + "</span>" : "") +
      '<span class="chips">' + kids + driverChip(ev) + snackChip(ev) + "</span></span></button>";
  }
  function conflictCard(c, o) {
    o = o || {};
    const A = S.evm[c.a], B = S.evm[c.b];
    if (!A || !B) return "";
    const text = C.conflictText(c, S.evm, S.pm, h24());
    const fixes = C.suggestFixes(c, S.events, S.people);
    const quick = fixes.filter(f => f.type === "assign" || f.type === "removeKids");
    const more = fixes.filter(f => f.type === "open" || f.type === "edit");
    const dim = S.filter && !(c.people.indexOf(S.filter) >= 0 || C.involves(A, S.filter) || C.involves(B, S.filter));
    return '<article class="cf' + (dim ? " dim" : "") + '"><div class="cf-head"><span class="badge bad">Conflict</span><span class="when">' + esc(C.fmtDate(A.date <= B.date ? A.date : B.date, "short")) + "</span></div>" +
      '<p class="cf-text">' + esc(text) + "</p>" +
      (o.noEvents ? "" : '<div class="cf-evs">' + eventCard(A, { noBadge: true }) + eventCard(B, { noBadge: true }) + "</div>") +
      '<p class="label">Ways to fix it</p><div class="fixes">' + quick.map(f => fixBtn(f, "")).join("") + '</div><div class="fixes inline sec">' + more.map(f => fixBtn(f, "ghost")).join("") + "</div></article>";
  }
  /* Buttons that give a driver or snack job to an adult who is free then. */
  function assignButtons(ev, role) {
    const free = C.freeAdults(ev, role, S.events, S.people);
    const verb = role === "snack" ? "bring the snack" : "drive";
    if (!S.people.some(p => p.role === "adult")) return '<p class="hint">Add a grown-up in the People tab to hand out jobs.</p>';
    if (!free.length) return '<p class="hint">Nobody is free then to ' + verb + ". Try changing the time, or ask someone outside the family.</p>";
    return free.map(pid => fixBtn({ type: "assign", event: ev.id, person: pid, role: role, label: S.pm[pid].name + (role === "snack" ? " brings snack" : " drives") }, "")).join("");
  }
  WW.eventCard = eventCard; WW.conflictCard = conflictCard; WW.assignButtons = assignButtons; WW.fixBtn = fixBtn;

  /* ---------- top bar, filters, tab bar ---------- */
  function attentionCount() { return C.needsAttention(S.events, S.cf, today(), 14).items.length; }
  WW.renderTop = function () {
    const top = $("#top"), nav = $("#nav");
    const welcome = !WW.hasData();
    top.hidden = welcome; nav.hidden = welcome;
    document.body.classList.toggle("welcome-mode", welcome);
    if (welcome) return;
    const showFilter = S.people.length > 1 && S.view !== "people";
    top.innerHTML = '<div class="top-row"><h1 class="brand">Who’s Where</h1><button type="button" class="btn small add-top" data-act="add-ev" aria-label="Add event">' + I.plus + "<span>Add event</span></button>" +
      '<button type="button" class="icon-btn" data-act="settings" aria-label="Settings">' + I.gear + "</button></div>" +
      (showFilter ? '<div class="filters" role="group" aria-label="Show one person"><button type="button" class="pill" data-act="filter" data-id="" aria-pressed="' + (!S.filter) + '">Everyone</button>' +
        S.people.map(p => '<button type="button" class="pill" data-act="filter" data-id="' + esc(p.id) + '" aria-pressed="' + (S.filter === p.id) + '" style="--c:' + esc(p.color) + '"><i class="dot" aria-hidden="true"></i>' + esc(p.name) + "</button>").join("") + "</div>" : "");
    const n = attentionCount();
    const tabs = [["week", "This week", I.week], ["month", "Month", I.month], ["attention", "Attention", I.alert], ["people", "People", I.people]];
    nav.innerHTML = '<div class="nav-in">' + tabs.map(t => '<button type="button" data-act="tab" data-tab="' + t[0] + '"' + (S.view === t[0] ? ' aria-current="page"' : "") + (t[0] === "attention" && n ? ' aria-label="Attention, ' + n + ' to look at"' : "") + ">" +
      (t[0] === "attention" && n ? '<span class="nbadge" aria-hidden="true">' + (n > 99 ? "99+" : n) + "</span>" : "") + t[2] + "<span>" + t[1] + "</span></button>").join("") + "</div>";
  };

  /* ---------- the navigation row shared by week and month ---------- */
  function navRow(title, sub, atToday) {
    return '<div class="wk-nav"><button type="button" class="icon-btn" data-act="step" data-n="-1" aria-label="Previous ' + (S.view === "month" ? "month" : "week") + '">' + I.left + "</button>" +
      '<div class="wk-title"><h2 id="view-title">' + esc(title) + "</h2>" + (atToday ? '<span class="sub">' + esc(sub) + "</span>" : '<button type="button" class="btn small ghost todaybtn" data-act="go-today">Today</button>') + "</div>" +
      '<button type="button" class="icon-btn" data-act="step" data-n="1" aria-label="Next ' + (S.view === "month" ? "month" : "week") + '">' + I.right + "</button></div>";
  }
  function banners() {
    let h = "";
    if (S.memMode) h += '<div class="banner bad" role="alert"><p><b>Can’t save on this browser.</b> This browser is not letting Who’s Where save, so what you add will be lost when you close the app. Use Back up in Settings to keep a copy.</p></div>';
    if (S.damaged) h += '<div class="banner bad" role="alert"><p><b>Saved data couldn’t be read.</b> A copy of the unreadable text was kept on this phone. If you have a backup file, restore it in Settings.</p><div class="row"><button type="button" class="btn small" data-act="settings">Open Settings</button><button type="button" class="btn small ghost" data-act="dismiss-damaged">Dismiss</button></div></div>';
    if (S.droppedNote && !S.meta.tips.dropped) h += '<div class="banner"><p>' + esc(S.droppedNote) + '</p><div class="row"><button type="button" class="btn small ghost" data-act="tip-off" data-id="dropped">Got it</button></div></div>';
    const due = WW.backupDueDays && WW.backupDueDays();
    if (due) h += '<div class="banner"><p><b>Time for a backup.</b> ' + (S.meta.lastBackup ? "It has been " + due + " days since your last one." : "You haven’t backed up yet.") + ' If this phone clears Who’s Where’s saved data, a backup file brings everything back.</p><div class="row"><button type="button" class="btn small" data-act="dl-backup">Back up now</button><button type="button" class="btn small ghost" data-act="backup-later">Later</button></div></div>';
    return h;
  }

  /* ---------- week ---------- */
  function weekRange() { const ws = C.startOfWeek(S.cursor || today(), S.settings.weekStart); return [ws, C.addDays(ws, 6)]; }
  WW.weekRange = weekRange;
  function relWeek(ws) {
    const d = Math.round(C.diffDays(ws, C.startOfWeek(today(), S.settings.weekStart)) / 7);
    return d === 0 ? "This week" : d === 1 ? "Next week" : d === -1 ? "Last week" : d > 0 ? "In " + d + " weeks" : -d + " weeks ago";
  }
  function weekSummary(ws, we) {
    const t = today(), evs = C.eventsInRange(S.events, ws, we).filter(e => e.date >= t);
    if (!evs.length) return "";
    const inWeek = d => d >= ws && d <= we;
    const cf = S.cf.filter(c => S.evm[c.a] && S.evm[c.b] && (inWeek(S.evm[c.a].date) || inWeek(S.evm[c.b].date))).length;
    const nd = evs.filter(e => C.driverMissing(e)).length, ns = evs.filter(e => e.snack === "open").length;
    if (!cf && !nd && !ns) return '<div class="sum ok"><span class="sum-i" aria-hidden="true">✓</span><span>All set. Every upcoming event this week has a driver and nothing clashes.</span></div>';
    const bits = [];
    if (cf) bits.push(cf + (cf === 1 ? " conflict" : " conflicts"));
    if (nd) bits.push(nd + (nd === 1 ? " event needs a driver" : " events need a driver"));
    if (ns) bits.push(ns + (ns === 1 ? " snack job unclaimed" : " snack jobs unclaimed"));
    return '<button type="button" class="sum ' + (cf ? "bad" : "warn") + '" data-act="tab" data-tab="attention"><span class="sum-i" aria-hidden="true">!</span><span><b>' + esc(bits.join(", ")) + '.</b> See what needs attention</span>' + I.go + "</button>";
  }
  function dayTag(d) {
    const diff = C.diffDays(d, today());
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : "";
  }
  function viewWeek() {
    const [ws, we] = weekRange(), t = today(), isNow = ws === C.startOfWeek(t, S.settings.weekStart);
    let h = banners() + navRow(C.weekTitle(ws), relWeek(ws), isNow) + weekSummary(ws, we);
    if (!WW.hasAnyEvents()) h += '<div class="empty"><div class="big" aria-hidden="true">📅</div><h3>No events yet</h3><p>Add practices, games and tournaments. Who’s Where will flag a kid in two places or a driver who can’t be in two cars.</p><button type="button" class="btn" data-act="add-ev">Add your first event</button></div>';
    h += '<div class="days">';
    for (let i = 0; i < 7; i++) {
      const d = C.addDays(ws, i), list = C.eventsOn(S.events, d), tag = dayTag(d);
      const full = C.fmtDate(d, "day");
      h += '<section class="day' + (d === t ? " today" : "") + '" aria-labelledby="dh-' + d + '"><header class="day-h"><h3 id="dh-' + d + '"><span class="dd">' + esc(full) + "</span>" + (tag ? '<span class="tag' + (d === t ? " now" : "") + '">' + tag + "</span>" : "") + "</h3>" +
        '<button type="button" class="add-day" data-act="add-on" data-date="' + d + '" aria-label="Add an event on ' + esc(full) + '">' + I.plus + "</button></header>" +
        (list.length ? '<div class="evs">' + list.map(e => eventCard(e)).join("") + "</div>" : '<p class="none">Nothing planned</p>') + "</section>";
    }
    h += "</div>";
    h += '<div class="card share"><h3 class="label">Share this week</h3><div class="row wrap"><button type="button" class="btn small" data-act="copy-week">Copy week as text</button><button type="button" class="btn small ghost" data-act="week-ics">Calendar file (.ics)</button><button type="button" class="btn small ghost" data-act="print-week">Print</button>' +
      (navigator.share ? '<button type="button" class="btn small ghost" data-act="share-week">Share…</button>' : "") + '</div><p class="hint">Paste the text into your group chat. Nothing is sent anywhere until you do.</p></div>';
    return h;
  }

  /* ---------- month ---------- */
  function monthDots(d) {
    const list = C.eventsOn(S.events, d), seen = {}, dots = [];
    list.forEach(ev => {
      const mine = !S.filter || C.involves(ev, S.filter);
      const cols = ev.kids.length ? ev.kids.map(k => S.pm[k] ? S.pm[k].color : "") : [""];
      cols.forEach(c => { const key = (c || "n") + (mine ? "1" : "0"); if (!seen[key]) { seen[key] = 1; dots.push({ c: c, dim: !mine }); } });
    });
    dots.sort((a, b) => a.dim - b.dim);
    return { list: list, dots: dots };
  }
  function viewMonth() {
    const cur = S.monthCursor || (S.cursor || today()).slice(0, 7) + "-01", y = +cur.slice(0, 4), m = +cur.slice(5, 7), t = today();
    const isNow = cur === t.slice(0, 7) + "-01";
    const ws = S.settings.weekStart, head = [];
    for (let i = 0; i < 7; i++) head.push('<span class="mh" aria-hidden="true">' + C.DAYS_SHORT[(ws + i) % 7].slice(0, 3) + "</span>");
    let h = banners() + navRow(C.MONTHS[m - 1] + " " + y, isNow ? "This month" : "", isNow) + '<div class="mgrid" role="grid" aria-labelledby="view-title"><div class="mhead">' + head.join("") + "</div>";
    C.monthGrid(y, m, ws).forEach(wk => {
      h += '<div class="mrow" role="row">';
      wk.forEach(cell => {
        const o = monthDots(cell.date), cf = S.cf.filter(c => (S.evm[c.a] && S.evm[c.a].date === cell.date) || (S.evm[c.b] && S.evm[c.b].date === cell.date)).length;
        const n = o.list.length;
        const label = C.fmtDate(cell.date, "full") + ": " + (n ? n + (n === 1 ? " event" : " events") : "nothing planned") + (cf ? ", " + cf + (cf === 1 ? " conflict" : " conflicts") : "");
        h += '<button type="button" role="gridcell" class="mcell' + (cell.inMonth ? "" : " out") + (cell.date === t ? " today" : "") + '" data-act="open-day" data-date="' + cell.date + '" aria-label="' + esc(label) + '"><b>' + (+cell.date.slice(8, 10)) + "</b>" +
          '<span class="dots" aria-hidden="true">' + o.dots.slice(0, 4).map(d => '<i class="d' + (d.dim ? " dim" : "") + '"' + (d.c ? ' style="--c:' + esc(d.c) + '"' : "") + "></i>").join("") + (o.dots.length > 4 ? "<u>+</u>" : "") + "</span>" +
          (cf ? '<span class="cfmark" aria-hidden="true">!</span>' : "") + "</button>";
      });
      h += "</div>";
    });
    h += '</div><p class="hint legend">Each dot is a kid with something that day. A red ! means a conflict. Tap a day to see it.</p>';
    return h;
  }

  /* ---------- needs attention ---------- */
  function viewAttention() {
    const t = today(), hz = S.horizon, na = C.needsAttention(S.events, S.cf, t, hz === 0 ? Infinity : hz);
    let h = banners() + '<div class="sec-title"><h2>Needs attention</h2></div>' +
      '<div class="seg" role="group" aria-label="How far ahead">' + [[14, "Next 2 weeks"], [60, "Next 2 months"], [0, "All upcoming"]].map(o => '<button type="button" class="pill" data-act="horizon" data-n="' + o[0] + '" aria-pressed="' + (hz === o[0]) + '">' + o[1] + "</button>").join("") + "</div>";
    if (!na.items.length) {
      return h + '<div class="empty"><div class="big" aria-hidden="true">✅</div><h3>All clear</h3><p>' + (WW.hasAnyEvents() ? "Nothing upcoming has a conflict, a missing driver or an unclaimed snack job." : "Add some events and anything that does not work will show up here.") + "</p>" +
        (WW.hasAnyEvents() ? "" : '<button type="button" class="btn" data-act="add-ev">Add an event</button>') + "</div>";
    }
    h += '<p class="sub-line">' + na.conflicts + (na.conflicts === 1 ? " conflict" : " conflicts") + ", " + na.missing + (na.missing === 1 ? " event" : " events") + " that need someone.</p>";
    let day = "";
    na.items.forEach(it => {
      if (it.date !== day) { day = it.date; h += '<h3 class="att-day">' + esc(C.fmtDate(day, "day")) + (dayTag(day) ? ' <span class="tag' + (day === t ? " now" : "") + '">' + dayTag(day) + "</span>" : "") + "</h3>"; }
      if (it.type === "conflict") { h += conflictCard(it.conflict); return; }
      const ev = it.event, dim = S.filter && !C.involves(ev, S.filter);
      h += '<article class="need' + (dim ? " dim" : "") + '">' + eventCard(ev) + '<ul class="issues">' +
        it.issues.map(x => "<li>" + (x === "driver" ? "No driver yet" : x === "ride" ? "Needs a ride" : "Snack job is unclaimed") + "</li>").join("") + "</ul>";
      if (it.issues.some(x => x === "driver" || x === "ride")) h += '<p class="label">Who can drive?</p><div class="fixes inline">' + assignButtons(ev, "driver") + fixBtn({ type: "set", event: ev.id, field: "driver", value: "none", label: "No driving needed" }, "ghost") + "</div>";
      if (it.issues.indexOf("snack") >= 0) h += '<p class="label">Who can bring the snack?</p><div class="fixes inline">' + assignButtons(ev, "snack") + fixBtn({ type: "set", event: ev.id, field: "snack", value: "", label: "No snack needed" }, "ghost") + "</div>";
      h += "</article>";
    });
    if (hz !== 0) h += '<p class="hint">Looking ' + (hz === 14 ? "2 weeks" : "2 months") + " ahead. Choose All upcoming to see further.</p>";
    return h;
  }

  /* ---------- people ---------- */
  function viewPeople() {
    const t = today();
    const row = p => {
      const up = S.events.filter(e => e.date >= t && C.involves(e, p.id)).length;
      return '<button type="button" class="list-btn" data-act="edit-person" data-id="' + esc(p.id) + '"><span class="swatch" style="--c:' + esc(p.color) + '" aria-hidden="true"></span><span class="t">' + esc(p.name) + " <small>" + (p.role === "adult" ? "Grown-up" : "Player") + " · " + up + " upcoming " + (up === 1 ? "event" : "events") + "</small></span>" + I.go + "</button>";
    };
    const k = WW.kids(), a = WW.adults();
    return banners() + '<div class="sec-title"><h2>People</h2></div><p class="hint" style="margin:0 2px 10px">Players go to events. Grown-ups drive and bring snacks. Tap a name to change it.</p>' +
      '<h3 class="label sec">Players</h3>' + (k.length ? k.map(row).join("") : '<p class="none">No players yet.</p>') +
      '<button type="button" class="btn ghost block" data-act="add-person" data-role="player" style="margin:4px 0 14px">' + I.plus + " Add a player</button>" +
      '<h3 class="label sec">Grown-ups</h3>' + (a.length ? a.map(row).join("") : '<p class="none">No grown-ups yet.</p>') +
      '<button type="button" class="btn ghost block" data-act="add-person" data-role="adult" style="margin:4px 0 14px">' + I.plus + " Add a grown-up</button>";
  }

  /* ---------- welcome (nothing saved yet) ---------- */
  function viewWelcome() {
    return banners() + '<div class="welcome"><div class="logo"><img src="/apps/icons/whoswhere-192.png" alt="" width="56" height="56"></div><h1>Who’s Where</h1><p class="tagline">The family sports week, without the group-chat scroll.</p>' +
      '<ul class="points"><li><b>One week, every kid.</b> Practices, games and tournaments by day, with who is driving and who brings the snack.</li><li><b>It warns you.</b> A kid in two places, a driver who can’t make it from one field to the next, a game with nobody to drive.</li><li><b>Share it your way.</b> Copy the week as text for the group chat, or add it to your calendar.</li></ul>' +
      '<div class="stack"><button type="button" class="btn block" data-act="sample">Fill in a sample week</button><button type="button" class="btn ghost block" data-act="add-person" data-role="player">Set up my own family</button></div>' +
      '<p class="privacy-note">' + I.shield + "<span>Everything you add stays on this phone. No account, no sign-in, nothing is sent anywhere.</span></p>" +
      '<p class="mute restore-line">Already have a backup file? <button type="button" class="file-btn linkbtn">Restore it<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Who’s Where backup file"></button></p></div>';
  }

  WW.renderView = function () {
    const v = $("#view");
    if (!WW.hasData()) { v.innerHTML = viewWelcome(); v.classList.add("welcome-mode"); return; }
    v.classList.remove("welcome-mode");
    v.innerHTML = S.view === "month" ? viewMonth() : S.view === "attention" ? viewAttention() : S.view === "people" ? viewPeople() : viewWeek();
  };
})();
