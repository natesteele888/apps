/* Tournament Pack, part 3: what happens when you tap things (forms, sheets, backup) and the start-up. */
(function () {
  "use strict";
  var TP = window.TP, C = TP.C, S = TP.S, $ = TP.$, $$ = TP.$$, esc = TP.esc, I = TP.I, V = TP.views, ACT = TP.ACT, toast = TP.toast, openSheet = TP.openSheet, confirmSheet = TP.confirmSheet;
  var cur = TP.cur;
  var noteTimer = 0, noteDirty = false;

  /* ================= render ================= */
  function render() {
    var ae = document.activeElement, fk = ae && ae.getAttribute ? ae.getAttribute("data-fk") : null;
    var top = $("#top"), view = $("#view"), nav = $("#nav");
    if (S.view === "tournament" && !cur()) { S.view = "list"; S.tid = null; }
    top.innerHTML = V.header();
    if (S.view === "settings") { view.innerHTML = V.settings(); nav.hidden = true; }
    else if (S.view === "list") { view.innerHTML = V.list(); nav.hidden = true; }
    else { view.innerHTML = V.banners() + V[S.tab](cur()); nav.innerHTML = V.nav(); nav.hidden = false; }
    document.body.setAttribute("data-view", S.view);
    if (fk) { var el = null; $$("[data-fk]").forEach(function (x) { if (x.getAttribute("data-fk") === fk) el = x; }); if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
    lastNextKey = nextKey();
  }
  TP.render = render;
  function scrollTop() { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } }
  function openTour(id) { S.view = "tournament"; S.tid = id; S.tab = "games"; S.packEdit = false; render(); scrollTop(); TP.syncHistory(); }
  function goList() { flushNotes(); S.view = "list"; S.tid = null; S.packEdit = false; render(); scrollTop(); TP.syncHistory(); }
  TP.leavePage = function () { flushNotes(); S.view = "list"; S.tid = null; S.packEdit = false; render(); scrollTop(); };

  /* ================= events ================= */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || el.disabled) return;
    var fn = ACT[el.getAttribute("data-act")];
    if (fn) fn(el, e);
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest ? e.target.closest("[data-form]") : null;
    if (!f) return;
    e.preventDefault();
    if (f.getAttribute("data-form") === "pack-add") packAdd();
  });
  document.addEventListener("change", function (e) { var el = e.target; if (el && el.matches && el.matches("[data-restore]")) { var f = el.files && el.files[0]; el.value = ""; onRestoreFile(f); } });
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.matches && el.matches("[data-note]")) {
      var t = cur(); if (!t) return;
      t.notes[el.getAttribute("data-note")] = el.value.slice(0, 4000);
      noteDirty = true; clearTimeout(noteTimer); noteTimer = setTimeout(flushNotes, 500);
    } else if (el.id === "s-warm") {
      var n = Math.round(Number(el.value));
      if (el.value !== "" && isFinite(n) && n >= 0 && n <= 180) { S.settings.warm = n; TP.saveSettings(); }
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var el = e.target;
    if (el.matches && el.matches(".sheet input:not([type=checkbox]):not([type=file])")) {
      var btn = $("[data-save]", el.closest(".sheet")); if (btn) { e.preventDefault(); btn.click(); }
    }
  });
  function flushNotes() { clearTimeout(noteTimer); if (!noteDirty) return; noteDirty = false; var t = cur(); if (t) TP.saveTour(t); }
  window.addEventListener("pagehide", flushNotes);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushNotes(); });
  document.addEventListener("focusout", function (e) { if (e.target.matches && e.target.matches("[data-note]")) flushNotes(); });

  ACT.tab = function (el) { flushNotes(); S.tab = el.getAttribute("data-tab"); S.packEdit = false; render(); scrollTop(); };
  ACT.back = function () { goList(); };
  ACT.settings = function () { S.view = "settings"; render(); scrollTop(); TP.syncHistory(); };
  ACT["tour-open"] = function (el) { openTour(el.getAttribute("data-id")); };

  /* ================= a small clock for the countdown ================= */
  var lastNextKey = "";
  function nextKey() {
    var t = cur(); if (!t || S.view !== "tournament") return "";
    var ng = C.nextGame(t, C.nowParts());
    return (ng ? ng.game.id + ":" + (ng.delta < 0 ? "live" : "wait") : "none") + ":" + t.games.filter(function (g) { return C.needsScore(t, g, C.nowParts()); }).length;
  }
  function tick() {
    var now = C.nowParts(), nm = C.startMin(now.date, now.time);
    $$("[data-cd]").forEach(function (el) { var d = +el.getAttribute("data-cd") - nm; el.textContent = C.countdownText(d); });
    if (S.view === "tournament" && S.tab === "games" && !TP.sheetCount()) { var k = nextKey(); if (k !== lastNextKey) render(); }
  }
  setInterval(tick, 20000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") tick(); });
  window.TPApp = { S: S, render: render, tick: tick };

  /* ================= helpers ================= */
  function val(root, sel) { var el = $(sel, root); return el ? el.value : ""; }
  function showErr(root, id, msg) { var el = $(id, root); if (!el) return; el.textContent = msg || ""; el.hidden = !msg; if (msg && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }
  function pillsHtml(name, items, sel, label) {
    return '<div class="pills" role="group" aria-label="' + esc(label) + '">' + items.map(function (x) { return '<button type="button" class="pill" data-' + name + '="' + esc(x[0]) + '" aria-pressed="' + (x[0] === sel) + '">' + (x[2] ? "<span aria-hidden=\"true\">" + x[2] + "</span> " : "") + esc(x[1]) + "</button>"; }).join("") + "</div>";
  }
  function setPill(root, name, v) { $$("[data-" + name + "]", root).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-" + name) === String(v))); }); }
  function datalist(id, names) { return '<datalist id="' + id + '">' + names.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("") + "</datalist>"; }
  function commitTour(t2) { S.tours[t2.id] = t2; TP.saveTour(t2); }

  /* ================= tournament: new, edit, menu, duplicate, delete ================= */
  function openTourSheet(t) {
    var isNew = !t, today = C.todayStr(), st = { sport: t ? t.sport : "baseball" };
    var d = { name: t ? t.name : "", start: t ? t.start : today, end: t ? t.end : C.addDays(today, 1), team: t ? t.team : "", gm: t ? C.gameMinutes(t) : C.sportInfo("baseball").gameMin };
    openSheet({
      title: isNew ? "New tournament" : "Edit tournament", cls: "form", autofocus: "#f-name",
      html: '<div class="field"><label class="label" for="f-name">Tournament name</label><input type="text" id="f-name" maxlength="60" autocomplete="off" placeholder="Spring Classic"></div>' +
        '<div class="field"><span class="label">Sport</span>' + pillsHtml("sport", C.SPORTS.map(function (s) { return [s.id, s.label, s.icon]; }), st.sport, "Sport") + "</div>" +
        '<div class="cols2"><div class="field"><label class="label" for="f-start">Starts</label><input type="date" id="f-start"></div><div class="field"><label class="label" for="f-end">Ends</label><input type="date" id="f-end"></div></div>' +
        '<div class="field"><label class="label" for="f-team">Our team name</label><input type="text" id="f-team" maxlength="40" autocomplete="off" placeholder="Team A"><div class="hint">Used to find our games, the next game and our seed.</div></div>' +
        '<div class="field"><label class="label" for="f-gm">Typical game length (minutes)</label><input type="number" id="f-gm" inputmode="numeric" min="20" max="300"><div class="hint">Only used to estimate rest time between our games.</div></div>' +
        '<p class="errmsg" id="f-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>' + (isNew ? "Create tournament" : "Save") + "</button>",
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); };
        q("#f-name").value = d.name; q("#f-start").value = d.start; q("#f-end").value = d.end; q("#f-team").value = d.team; q("#f-gm").value = d.gm;
        api.el.addEventListener("click", function (e) {
          var b = e.target.closest("[data-sport]");
          if (b) {
            var old = C.sportInfo(st.sport).gameMin; st.sport = b.getAttribute("data-sport"); setPill(api.el, "sport", st.sport);
            if (+q("#f-gm").value === old) q("#f-gm").value = C.sportInfo(st.sport).gameMin;
          }
        });
        q("#f-start").addEventListener("change", function () { var s = q("#f-start").value, en = q("#f-end").value; if (C.isYMD(s) && (!C.isYMD(en) || en < s)) q("#f-end").value = s; });
        $("[data-save]", api.el).addEventListener("click", function () {
          var name = C.cleanName(q("#f-name").value, 60), start = q("#f-start").value, end = q("#f-end").value, team = C.cleanName(q("#f-team").value), gm = Math.round(Number(q("#f-gm").value));
          if (!name) return showErr(api.el, "#f-err", "Give the tournament a name.");
          if (!C.isYMD(start)) return showErr(api.el, "#f-err", "Pick the start date.");
          if (!C.isYMD(end)) end = start;
          if (end < start) return showErr(api.el, "#f-err", "The end date is before the start date.");
          if (!isFinite(gm) || gm < 20 || gm > 300) return showErr(api.el, "#f-err", "Game length should be between 20 and 300 minutes.");
          if (isNew) {
            var nt = C.newTournament({ name: name, sport: st.sport, start: start, end: end, team: team, gameMin: gm }, S.settings);
            TP.addTour(nt); TP.closeAllSheets(); openTour(nt.id); toast("Tournament created. Add the first game.", "ok");
            return;
          }
          var cur0 = cur(), c = C.clone(cur0);
          if (cur0.team && team && cur0.team !== team) {
            var rr = C.renameTeam(c, cur0.team, team);
            if (!rr.ok) return showErr(api.el, "#f-err", rr.error);
            c = rr.t;
          } else c.team = team;
          if (st.sport !== cur0.sport) {
            var od = C.defaultRules(cur0.sport), nd = C.defaultRules(st.sport);
            if (c.rules.cap === od.cap) c.rules.cap = nd.cap;
            if (c.rules.forfeitWin === od.forfeitWin) c.rules.forfeitWin = nd.forfeitWin;
          }
          c.name = name; c.sport = st.sport; c.start = start; c.end = end; c.gameMin = gm;
          commitTour(C.sanitizeTournament(c)); TP.closeAllSheets(); render(); toast("Saved.", "ok");
        });
      }
    });
  }
  ACT["tour-new"] = function () { openTourSheet(null); };
  ACT["tour-edit"] = function () { TP.closeAllSheets(); openTourSheet(cur()); };
  ACT["tour-menu"] = function () {
    var t = cur();
    function row(act, title, sub) { return '<button type="button" class="list-btn" data-act="' + act + '"><span class="t">' + esc(title) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" + I.go + "</button>"; }
    openSheet({
      title: "Tournament", cls: "menu",
      html: '<div class="stack">' + row("tour-edit", "Edit details", "Name, dates, our team, game length") + row("rules-open", "Standings rules", "Tiebreaker order, forfeits, ties") + row("tour-dup", "Duplicate for next weekend", "Keeps the pack list and rules") +
        row("ics", "Download calendar file", "Our upcoming games with reminders") + row("copy-summary", "Copy weekend summary", "Text for the team chat") +
        '<button type="button" class="btn danger block" data-act="tour-delete" style="margin-top:6px">Delete this tournament</button></div>'
    });
  };
  ACT["tour-delete"] = function () {
    var t = cur(); TP.closeAllSheets();
    confirmSheet({
      title: "Delete this tournament?", message: "This permanently removes " + t.name + " with its " + C.plural(t.games.length, "game") + ", bracket, pack list and notes from this phone. This cannot be undone.",
      more: ["Want a copy first? Download a backup from Settings, then delete."], confirmText: "Delete it", danger: true,
      onConfirm: function () { TP.removeTour(t.id); S.view = "list"; S.tid = null; render(); scrollTop(); TP.syncHistory(); toast("Deleted " + t.name + ".", "ok"); }
    });
  };
  ACT["tour-dup"] = function () {
    var t = cur(); TP.closeAllSheets();
    openSheet({
      title: "Duplicate tournament", cls: "form", autofocus: "#d-name",
      html: '<p class="msg">Makes a new tournament with the same team, rules, notes and pack list (unchecked). Handy for next weekend.</p><div class="field" style="margin-top:12px"><label class="label" for="d-name">Name</label><input type="text" id="d-name" maxlength="60"></div>' +
        '<div class="field"><label class="label" for="d-start">New start date</label><input type="date" id="d-start"><div class="hint">The end date moves with it.</div></div>' +
        '<label class="chk field"><input type="checkbox" id="d-games"><span class="bx"></span><span class="tx">Keep the games and scores too</span></label><p class="errmsg" id="d-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Duplicate</button>',
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); };
        q("#d-name").value = (t.name + " (copy)").slice(0, 60); q("#d-start").value = C.addDays(t.start, 7);
        $("[data-save]", api.el).addEventListener("click", function () {
          var name = C.cleanName(q("#d-name").value, 60), start = q("#d-start").value;
          if (!name) return showErr(api.el, "#d-err", "Give the copy a name.");
          if (!C.isYMD(start)) return showErr(api.el, "#d-err", "Pick the new start date.");
          var shift = C.diffDays(start, t.start), c = C.clone(t);
          c.id = C.uid(); c.name = name; c.start = start; c.end = C.addDays(t.end, shift); c.created = C.todayStr();
          c.pack.forEach(function (p) { p.done = false; p.id = C.uid(); });
          if (q("#d-games").checked) c.games.forEach(function (g) { g.id = C.uid(); if (g.date) g.date = C.addDays(g.date, shift); });
          else { c.games = []; c.bracket.seeds = c.bracket.seeds.map(function () { return ""; }); }
          var nt = C.sanitizeTournament(c);
          TP.addTour(nt); TP.closeAllSheets(); openTour(nt.id); toast("Duplicated.", "ok");
        });
      }
    });
  };

  /* ================= games ================= */
  function defaultGameDate(t) {
    if (S.lastDate[t.id]) return S.lastDate[t.id];
    var today = C.todayStr();
    return today < t.start ? t.start : today > t.end ? t.end : today;
  }
  function slotChoices(t) {
    var tree = C.bracketTree(t), out = [];
    if (tree) tree.rounds.forEach(function (r) { r.matches.forEach(function (m) { if (!m.bye) out.push(m); }); });
    return out;
  }
  function openGameSheet(id, preset) {
    var t = cur(), g = id ? t.games.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !g) return;
    var tree = C.bracketTree(t), slots = slotChoices(t), editing = !!g;
    var st = { kind: g ? g.kind : (preset && preset.kind) || "pool", status: g ? g.status : "scheduled" };
    var side = g ? C.ourSide(t, g) : null, ours = g ? (g.kind === "pool" && !!side) : !!t.team;
    var usScore = g ? (side === "b" ? g.sb : g.sa) : null, themScore = g ? (side === "b" ? g.sa : g.sb) : null;
    var forf = g ? g.forfeit : "";
    if (g && g.kind === "pool" && side === "b") forf = forf === "b" ? "a" : forf === "a" ? "b" : "";
    var sA = g && !ours ? g.sa : (g && g.kind === "bracket" ? g.sa : usScore), sB = g && !ours ? g.sb : (g && g.kind === "bracket" ? g.sb : themScore);
    var names = C.teamNames(t);
    var used = {}; t.games.forEach(function (x) { if (x.kind === "bracket" && (!g || x.id !== g.id)) used[x.slot] = 1; });
    var freeSlot = (slots.filter(function (m) { return !used[m.slot]; })[0] || slots[0] || {}).slot;
    var slotSel = g && g.kind === "bracket" ? g.slot : (preset && preset.slot) || freeSlot;
    openSheet({
      title: editing ? "Edit game" : "Add a game", cls: "form", autofocus: editing ? null : ours ? "#g-opp" : "#g-t1",
      html: (!editing && tree ? '<div class="field"><span class="label">Kind of game</span>' + pillsHtml("kind", [["pool", "Pool play"], ["bracket", "Bracket"]], st.kind, "Kind of game") + "</div>" : "") +
        '<div class="f-pool"><label class="chk field"><input type="checkbox" id="g-ours"><span class="bx"></span><span class="tx">This is one of our games</span></label>' +
        '<div class="field f-us"><label class="label" for="g-us">Our team name</label><input type="text" id="g-us" maxlength="40" autocomplete="off" placeholder="Team A"></div>' +
        '<div class="field f-opp"><label class="label" for="g-opp">Opponent</label><input type="text" id="g-opp" list="g-names" maxlength="40" autocomplete="off" placeholder="Opponent B"></div>' +
        '<div class="cols2 f-two"><div class="field"><label class="label" for="g-t1">Team 1</label><input type="text" id="g-t1" list="g-names" maxlength="40" autocomplete="off" placeholder="Team B"></div><div class="field"><label class="label" for="g-t2">Team 2</label><input type="text" id="g-t2" list="g-names" maxlength="40" autocomplete="off" placeholder="Team C"></div></div></div>' +
        '<div class="f-br"><div class="field"><label class="label" for="g-slot">Bracket game</label><select id="g-slot">' + slots.map(function (m) { return '<option value="' + m.slot + '"' + (used[m.slot] ? " disabled" : "") + ">" + esc(m.title) + (used[m.slot] ? " (already added)" : "") + "</option>"; }).join("") + '</select></div><p class="mute" id="g-slotinfo"></p></div>' +
        datalist("g-names", names) +
        '<div class="cols2"><div class="field"><label class="label" for="g-date">Date</label><input type="date" id="g-date"></div><div class="field"><label class="label" for="g-time">Time</label><input type="time" id="g-time"></div></div><p class="hint arr" id="g-arrive"></p>' +
        '<div class="cols2"><div class="field"><label class="label" for="g-field">Field or court</label><input type="text" id="g-field" maxlength="60" autocomplete="off" placeholder="Field 3"></div><div class="field"><label class="label" for="g-label">Round label</label><input type="text" id="g-label" maxlength="40" autocomplete="off" placeholder="Pool play"></div></div>' +
        '<div class="field"><span class="label">Status</span>' + pillsHtml("status", [["scheduled", "Scheduled"], ["final", "Final"]], st.status, "Status") + "</div>" +
        '<div class="f-res"><div class="cols2 f-scores"><div class="field"><label class="label" id="g-la" for="g-sa">Score</label><input type="number" id="g-sa" inputmode="numeric" min="0" max="999"></div><div class="field"><label class="label" id="g-lb" for="g-sb">Score</label><input type="number" id="g-sb" inputmode="numeric" min="0" max="999"></div></div>' +
        (t.sport !== "basketball" ? '<div class="field"><label class="label" for="g-inn">Innings played, only if the game was shortened</label><input type="number" id="g-inn" inputmode="numeric" min="1" max="30" placeholder="Full game"><div class="hint">For a time-limit or called game. Leave blank for a full game.</div></div>' : "") +
        '<div class="field"><label class="label" for="g-forf">Forfeit</label><select id="g-forf"><option value="">No forfeit</option><option value="a">Side 1 forfeited</option><option value="b">Side 2 forfeited</option></select><div class="hint" id="g-forfinfo"></div></div></div>' +
        '<p class="errmsg" id="g-err" role="alert" hidden></p>' +
        (editing ? '<button type="button" class="btn danger block" data-del style="margin-top:8px">Delete this game</button>' : ""),
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>' + (editing ? "Save game" : "Add game") + "</button>",
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); };
        q("#g-ours").checked = ours; q("#g-us").value = ""; q("#g-date").value = g ? g.date : defaultGameDate(t); q("#g-time").value = g ? g.time : "";
        q("#g-field").value = g ? g.field : ""; q("#g-label").value = g ? g.label : "";
        if (g && g.kind === "pool") { if (ours) q("#g-opp").value = C.oppName(t, g); else { q("#g-t1").value = g.a; q("#g-t2").value = g.b; } }
        if (g && g.status === "final") { q("#g-sa").value = sA == null ? "" : sA; q("#g-sb").value = sB == null ? "" : sB; }
        if (q("#g-inn") && g && g.innings) q("#g-inn").value = g.innings;
        q("#g-forf").value = forf;
        if (slots.length) q("#g-slot").value = slotSel;
        function sideNames() {
          if (st.kind === "bracket") { var m = slots.filter(function (x) { return x.slot === q("#g-slot").value; })[0]; return m ? [m.a.name || m.a.label, m.b.name || m.b.label] : ["Side 1", "Side 2"]; }
          if (q("#g-ours").checked) return [t.team || C.cleanName(q("#g-us").value) || "Us", C.cleanName(q("#g-opp").value) || "Them"];
          return [C.cleanName(q("#g-t1").value) || "Team 1", C.cleanName(q("#g-t2").value) || "Team 2"];
        }
        function sync() {
          var isBr = st.kind === "bracket", o = q("#g-ours").checked, nm = sideNames(), fin = st.status === "final", fo = q("#g-forf").value;
          q(".f-pool").hidden = isBr; q(".f-br").hidden = !isBr;
          q(".f-opp").hidden = !o; q(".f-two").hidden = o; q(".f-us").hidden = !(o && !t.team);
          q(".f-res").hidden = !fin;
          q(".f-scores").hidden = !!fo;
          q("#g-la").textContent = nm[0] + " score"; q("#g-lb").textContent = nm[1] + " score";
          var opts = q("#g-forf").options; opts[1].textContent = nm[0] + " forfeited"; opts[2].textContent = nm[1] + " forfeited";
          q("#g-forfinfo").textContent = fo ? "A forfeit counts as " + t.rules.forfeitWin + " to 0 for " + (fo === "a" ? nm[1] : nm[0]) + " in the standings." : "Only use this if a team did not play.";
          if (isBr) { var m = slots.filter(function (x) { return x.slot === q("#g-slot").value; })[0]; q("#g-slotinfo").textContent = m ? (m.a.name || m.a.label) + " vs " + (m.b.name || m.b.label) + (m.state === "tbd" ? ". The teams are not known yet; you can still set the time." : "") : ""; }
          var tm = C.parseTime(q("#g-time").value), ab = tm && C.isYMD(q("#g-date").value) && (o || isBr) ? C.arriveBy(q("#g-date").value, tm, S.settings.warm) : null;
          q("#g-arrive").textContent = ab ? "Arrive by " + C.fmtTime(ab.time) + (ab.date !== q("#g-date").value ? " (the day before)" : "") + " (" + S.settings.warm + " min warm-up)" : "";
          q("#g-arrive").hidden = !ab;
        }
        api.el.addEventListener("click", function (e) {
          var k = e.target.closest("[data-kind]"), s = e.target.closest("[data-status]");
          if (k) { st.kind = k.getAttribute("data-kind"); setPill(api.el, "kind", st.kind); sync(); }
          if (s) { st.status = s.getAttribute("data-status"); setPill(api.el, "status", st.status); sync(); }
        });
        api.el.addEventListener("input", sync); api.el.addEventListener("change", sync);
        sync();
        var del = $("[data-del]", api.el);
        if (del) del.addEventListener("click", function () { api.close(); deleteGame(g); });
        $("[data-save]", api.el).addEventListener("click", function () { saveGame(api, g, st, slots, q); });
      }
    });
  }
  function saveGame(api, g, st, slots, q) {
    var t = cur(), err = function (m) { showErr(api.el, "#g-err", m); };
    var date = q("#g-date").value, time = C.parseTime(q("#g-time").value), fin = st.status === "final", fo = fin ? q("#g-forf").value : "";
    if (!C.isYMD(date)) return err("Pick the date of the game.");
    var o = { id: g ? g.id : C.uid(), kind: st.kind, slot: "", date: date, time: time, field: C.cleanName(q("#g-field").value, 60), label: C.cleanName(q("#g-label").value, 40), a: "", b: "", status: st.status, sa: null, sb: null, innings: null, forfeit: "" };
    var teamName = t.team;
    if (st.kind === "pool") {
      if (q("#g-ours").checked) {
        if (!teamName) teamName = C.cleanName(q("#g-us").value);
        if (!teamName) return err("Type our team name so the app knows which games are ours.");
        var opp = C.cleanName(q("#g-opp").value);
        if (!opp) return err("Type the opponent's name.");
        if (C.teamKey(opp) === C.teamKey(teamName)) return err("A team can't play itself. Check the opponent's name.");
        o.a = teamName; o.b = opp;
      } else {
        o.a = C.cleanName(q("#g-t1").value); o.b = C.cleanName(q("#g-t2").value);
        if (!o.a || !o.b) return err("Type both team names.");
        if (C.teamKey(o.a) === C.teamKey(o.b)) return err("A team can't play itself. Check the two names.");
      }
    } else {
      o.slot = q("#g-slot").value;
      if (!o.slot) return err("Pick which bracket game this is.");
      var m = slots.filter(function (x) { return x.slot === o.slot; })[0];
      o.a = m ? m.a.name : ""; o.b = m ? m.b.name : "";
      if (fin && (!o.a || !o.b)) return err("This bracket game can't be final yet because one of the teams isn't decided. Seed the bracket or finish the games before it.");
    }
    if (fin) {
      if (fo) o.forfeit = fo;
      else {
        var sa = q("#g-sa").value, sb = q("#g-sb").value;
        if (sa === "" || sb === "") return err("Enter both scores, or choose a forfeit.");
        var na = Math.round(Number(sa)), nb = Math.round(Number(sb));
        if (!isFinite(na) || !isFinite(nb) || na < 0 || nb < 0 || na > 999 || nb > 999) return err("Scores should be whole numbers from 0 to 999.");
        if (na === nb && st.kind === "bracket") return err("A bracket game can't end in a tie. Enter the final score after extra innings or overtime.");
        if (na === nb && !t.rules.tiesAllowed) return err("Ties are turned off in this tournament's rules. Enter the final score, or turn ties on under Standings, then Rules.");
        o.sa = na; o.sb = nb;
      }
      if (q("#g-inn")) { var inn = q("#g-inn").value; if (inn !== "") { var ni = Math.round(Number(inn)); if (!isFinite(ni) || ni < 1 || ni > 30) return err("Innings should be between 1 and 30."); o.innings = ni; } }
    }
    if (st.kind === "bracket") {
      if (t.games.some(function (x) { return x.kind === "bracket" && x.slot === o.slot && (!g || x.id !== g.id); })) return err("That bracket game was already added. Edit it instead.");
    }
    o = C.sanitizeGame(o);
    if (!o) return err("Something about this game doesn't look right. Check the names and scores.");
    var needTeam = st.kind === "pool" && q("#g-ours").checked && !t.team ? teamName : null;
    var apply = function (c) {
      if (needTeam) c.team = needTeam;
      var i = c.games.findIndex(function (x) { return x.id === o.id; });
      if (i >= 0) c.games[i] = o; else c.games.push(o);
    };
    S.lastDate[t.id] = date;
    var pv = C.previewBracket(t, apply, st.kind === "bracket" ? o.slot : null);
    var done = function () { commitTour(pv.t); api.close(); TP.closeAllSheets(); render(); toast(g ? "Game saved." : "Game added.", "ok"); };
    if (pv.cleared.length) confirmCleared(pv.cleared, t, "Saving this changes who plays later in the bracket.", done);
    else done();
  }
  function confirmCleared(slots, t, why, onOk) {
    var titles = slots.map(function (s) { return C.slotTitle(t, s); });
    confirmSheet({
      title: "Clear later bracket games?", message: why, more: ["These bracket games depended on the old result. Their scores will be cleared, and any that no longer fit the bracket will be removed:"],
      list: titles, confirmText: "Clear and save", danger: true, onConfirm: onOk
    });
  }
  function deleteGame(g) {
    var t = cur();
    var go = function () {
      var pv = C.previewBracket(t, function (c) { c.games = c.games.filter(function (x) { return x.id !== g.id; }); }, g.slot || null);
      var done = function () { commitTour(pv.t); render(); toast("Game deleted.", "ok"); };
      if (pv.cleared.length) confirmCleared(pv.cleared, t, "Deleting this game changes who plays later in the bracket.", done); else done();
    };
    if (g.kind === "bracket" && g.status === "final") return go();
    confirmSheet({ title: "Delete this game?", message: "This removes the game" + (g.status === "final" ? " and its score" : "") + ". This cannot be undone.", confirmText: "Delete game", danger: true, onConfirm: go });
  }
  ACT["game-new"] = function () { openGameSheet(null); };
  ACT["game-edit"] = function (el) { openGameSheet(el.getAttribute("data-id")); };
  ACT["match-open"] = function (el) {
    var t = cur(), slot = el.getAttribute("data-slot"), g = t.games.filter(function (x) { return x.kind === "bracket" && x.slot === slot; })[0];
    if (g) openGameSheet(g.id); else openGameSheet(null, { kind: "bracket", slot: slot });
  };

  /* ================= standings: rules, team ================= */
  function openRulesSheet(target) {
    var t = cur(), isDef = target === "defaults", sport = isDef ? "baseball" : t.sport;
    var r = isDef ? C.sanitizeRules(S.settings.rules, "baseball") : C.sanitizeRules(t.rules, t.sport);
    function li(id) {
      return '<li data-crit="' + id + '"><label class="chk"><input type="checkbox" data-on><span class="bx" aria-hidden="true"></span><span class="tx">' + esc(C.critName(id, sport)) + '</span></label><span class="pk-ctl"><button type="button" class="icon-btn sm" data-mv="-1" aria-label="Move ' + esc(C.critName(id, sport)) + ' up">' + I.up + '</button><button type="button" class="icon-btn sm" data-mv="1" aria-label="Move ' + esc(C.critName(id, sport)) + ' down">' + I.down + "</button></span></li>";
    }
    openSheet({
      title: isDef ? "Default tiebreakers" : "Standings rules", cls: "form",
      html: '<p class="msg">' + (isDef ? "New tournaments start with this order. Existing tournaments keep their own." : "Teams are ranked by these steps, one after the other. Win percentage normally comes first, then the tiebreakers.") + " Turn a step off, or move it up or down.</p>" +
        '<ol class="crit" id="r-list">' + r.order.map(li).join("") + "</ol>" +
        '<p class="mute small">After the last step, teams that are still level are marked as tied: the tournament director decides (often a coin flip). When a step separates some of the tied teams, the steps start over for the teams still level.</p>' +
        '<label class="chk field"><input type="checkbox" id="r-ties"><span class="bx" aria-hidden="true"></span><span class="tx">Ties are allowed in games</span></label>' +
        (isDef ? "" : '<div class="cols2"><div class="field"><label class="label" for="r-cap">Most counted per game</label><input type="number" id="r-cap" inputmode="numeric" min="0" max="99"><div class="hint">For the differential step. 0 = no limit.</div></div><div class="field"><label class="label" for="r-forf">Forfeit counts as</label><input type="number" id="r-forf" inputmode="numeric" min="0" max="99"><div class="hint">to 0 for the team that showed up.</div></div></div>') +
        '<button type="button" class="btn ghost block" data-reset>Reset to the default order</button><p class="errmsg" id="r-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save rules</button>',
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); }, list = q("#r-list");
        function fill(rr) {
          rr.order.forEach(function (id) { var el = $('[data-crit="' + id + '"]', list); list.appendChild(el); $("[data-on]", el).checked = rr.off.indexOf(id) < 0; });
          q("#r-ties").checked = rr.tiesAllowed;
          if (!isDef && rr.cap != null) { q("#r-cap").value = rr.cap; q("#r-forf").value = rr.forfeitWin; }
        }
        fill(r);
        api.el.addEventListener("click", function (e) {
          var mv = e.target.closest("[data-mv]");
          if (mv) {
            var li0 = mv.closest("li"), dir = +mv.getAttribute("data-mv"), sib = dir < 0 ? li0.previousElementSibling : li0.nextElementSibling;
            if (sib) { if (dir < 0) list.insertBefore(li0, sib); else list.insertBefore(sib, li0); }
            try { mv.focus(); } catch (e2) { /* ignore */ }
          }
          if (e.target.closest("[data-reset]")) fill({ order: C.defaultRules(sport).order, off: [], tiesAllowed: true });
        });
        $("[data-save]", api.el).addEventListener("click", function () {
          var order = $$("[data-crit]", list).map(function (x) { return x.getAttribute("data-crit"); });
          var off = $$("[data-crit]", list).filter(function (x) { return !$("[data-on]", x).checked; }).map(function (x) { return x.getAttribute("data-crit"); });
          var ties = q("#r-ties").checked;
          if (isDef) {
            S.settings.rules = { order: order, off: off, tiesAllowed: ties }; TP.saveSettings(); api.close(); toast("Saved. New tournaments start with these rules.", "ok"); return;
          }
          var cap = Math.round(Number(q("#r-cap").value)), fw = Math.round(Number(q("#r-forf").value));
          if (q("#r-cap").value === "" || q("#r-forf").value === "" || !isFinite(cap) || cap < 0 || cap > 99 || !isFinite(fw) || fw < 0 || fw > 99) return showErr(api.el, "#r-err", "Those two numbers should be whole numbers from 0 to 99.");
          var c = C.clone(cur()); c.rules = C.sanitizeRules({ order: order, off: off, tiesAllowed: ties, cap: cap, forfeitWin: fw }, c.sport);
          commitTour(C.sanitizeTournament(c)); api.close(); TP.closeAllSheets(); render(); toast("Rules saved. Standings updated.", "ok");
        });
      }
    });
  }
  ACT["rules-open"] = function () { TP.closeAllSheets(); openRulesSheet("tour"); };
  ACT["rules-defaults"] = function () { openRulesSheet("defaults"); };
  ACT["team-open"] = function (el) {
    var t = cur(), name = el.getAttribute("data-team"), k = C.teamKey(name);
    var gl = C.sortGames(t.games.filter(function (g) { return g.kind === "pool" && (C.teamKey(g.a) === k || C.teamKey(g.b) === k); }));
    var rows = gl.map(function (g) {
      var mine = C.teamKey(g.a) === k, opp = mine ? g.b : g.a, e = C.effScore(g, t.rules), txt = "scheduled", cl = "s";
      if (e) { var my = mine ? e.a : e.b, th = mine ? e.b : e.a; cl = e.winner === "tie" ? "t" : (e.winner === (mine ? "a" : "b") ? "w" : "l"); txt = (cl === "t" ? "tied " : (cl === "w" ? "won " : "lost ")) + my + "-" + th + (e.forfeit ? " (forfeit)" : ""); }
      return "<li><span>vs " + esc(opp) + '</span><b class="' + cl + '">' + esc(txt) + "</b></li>";
    }).join("");
    openSheet({
      title: name, cls: "form", autofocus: "#tm-name",
      html: (rows ? '<ul class="tgames">' + rows + "</ul>" : '<p class="mute">No pool games for this team.</p>') +
        '<div class="field" style="margin-top:14px"><label class="label" for="tm-name">Team name</label><input type="text" id="tm-name" maxlength="40" autocomplete="off"><div class="hint">Fix a misspelled name, or type another team\'s exact name to make them one team.</div></div><p class="errmsg" id="tm-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save name</button>',
      onOpen: function (api) {
        $("#tm-name", api.el).value = name;
        $("[data-save]", api.el).addEventListener("click", function () {
          var nn = C.cleanName($("#tm-name", api.el).value);
          if (nn === name) return api.close();
          var rr = C.renameTeam(cur(), name, nn);
          if (!rr.ok) return showErr(api.el, "#tm-err", rr.error);
          commitTour(C.sanitizeTournament(rr.t)); api.close(); render(); toast("Renamed.", "ok");
        });
      }
    });
  };

  /* ================= bracket ================= */
  function applyBracket(nb, okMsg) {
    var t = cur(), pv = C.previewBracket(t, function (c) { c.bracket = C.sanitizeBracket(nb); }, null);
    var done = function () { commitTour(pv.t); TP.closeAllSheets(); render(); if (okMsg) toast(okMsg, "ok", 5200); };
    if (pv.cleared.length) confirmCleared(pv.cleared, t, "Changing the bracket changes who plays whom.", done); else done();
  }
  function openBracketSheet() {
    var t = cur(), size = t.bracket.size || 4, st = { size: size }, names = C.teamNames(t);
    var rows = ""; for (var i = 1; i <= 8; i++) rows += '<div class="field seed-row" data-row="' + i + '"><label class="label" for="b-s' + i + '">Seed ' + i + '</label><input type="text" id="b-s' + i + '" list="b-names" maxlength="40" autocomplete="off" placeholder="Team name"></div>';
    openSheet({
      title: "Bracket seeds", cls: "form",
      html: '<div class="field"><span class="label">Teams in the bracket</span>' + pillsHtml("bsize", [[4, "4 teams"], [6, "6 teams"], [8, "8 teams"]], size, "Number of teams") + '<p class="hint" id="b-hint"></p></div>' + rows + datalist("b-names", names) +
        '<button type="button" class="btn ghost block" data-fill>Fill from the pool standings</button><p class="errmsg" id="b-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-save>Save bracket</button>',
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); };
        t.bracket.seeds.forEach(function (n, i) { q("#b-s" + (i + 1)).value = n; });
        function sync() {
          for (var i = 1; i <= 8; i++) q('[data-row="' + i + '"]').hidden = i > st.size;
          q("#b-hint").textContent = st.size === 6 ? "With 6 teams, seeds 1 and 2 get a bye past the first round." : st.size === 4 ? "Seed 1 plays 4, seed 2 plays 3." : "Seed 1 plays 8, 4 plays 5, 3 plays 6, 2 plays 7.";
        }
        sync();
        api.el.addEventListener("click", function (e) {
          var b = e.target.closest("[data-bsize]");
          if (b) { st.size = +b.getAttribute("data-bsize"); setPill(api.el, "bsize", st.size); sync(); }
          if (e.target.closest("[data-fill]")) {
            var sf = C.seedsFromStandings(t, st.size);
            if (!sf.teams) return showErr(api.el, "#b-err", "No pool game has a final score yet, so there is nothing to seed from.");
            sf.seeds.forEach(function (n, i) { q("#b-s" + (i + 1)).value = n; });
            showErr(api.el, "#b-err", "");
          }
        });
        $("[data-save]", api.el).addEventListener("click", function () {
          var seeds = [], i, j;
          for (i = 1; i <= st.size; i++) seeds.push(C.cleanName(q("#b-s" + i).value));
          for (i = 0; i < seeds.length; i++) for (j = 0; j < i; j++) if (seeds[i] && C.teamKey(seeds[i]) === C.teamKey(seeds[j])) return showErr(api.el, "#b-err", "Seed " + (j + 1) + " and seed " + (i + 1) + " are the same team.");
          var same = st.size === t.bracket.size && seeds.every(function (n, k) { return n === t.bracket.seeds[k]; });
          if (same) return api.close();
          api.close(); applyBracket({ size: st.size, seeds: seeds }, "Bracket saved.");
        });
      }
    });
  }
  ACT["bracket-setup"] = function () { openBracketSheet(); };
  ACT["bracket-seed"] = function () {
    var t = cur(), size = t.bracket.size;
    if (!size) return openBracketSheet();
    var sf = C.seedsFromStandings(t, size);
    if (!sf.teams) return toast("No pool game has a final score yet, so there is nothing to seed from.", "error");
    var msg = "Seeded from the standings.";
    if (sf.teams < size) msg += " Only " + sf.teams + " " + (sf.teams === 1 ? "team has" : "teams have") + " finished games, so the other seeds are blank.";
    if (sf.unsure.length) msg += " Still tied: " + C.joinNames(sf.unsure) + ". Check the tie with the tournament director.";
    applyBracket({ size: size, seeds: sf.seeds }, msg);
  };

  /* ================= pack ================= */
  function packAdd() {
    var t = cur(), inp = $("#pk-new"), text = C.cleanName(inp.value, 60), grp = $("#pk-grp").value;
    if (!text) { toast("Type what to pack first.", "error"); inp.focus(); return; }
    if (t.pack.length >= 200) return toast("That's a lot of items. Delete some first.", "error");
    t.pack.push({ id: C.uid(), text: text, group: C.GROUPS.indexOf(grp) >= 0 ? grp : "Gear", done: false });
    TP.saveTour(t); render(); var n = $("#pk-new"); if (n) n.focus();
  }
  ACT["pack-toggle"] = function (el) {
    var t = cur(), p = t.pack.filter(function (x) { return x.id === el.getAttribute("data-id"); })[0]; if (!p) return;
    p.done = !!el.checked; TP.saveTour(t); render();
  };
  ACT["pack-uncheck"] = function () {
    var t = cur(), was = t.pack.filter(function (p) { return p.done; }).map(function (p) { return p.id; });
    if (!was.length) return toast("Nothing is checked.", "");
    t.pack.forEach(function (p) { p.done = false; }); TP.saveTour(t); render();
    toast("Unchecked everything, ready for the next trip.", "ok", 6000, { label: "Undo", fn: function () { var t2 = cur(); if (!t2) return; t2.pack.forEach(function (p) { if (was.indexOf(p.id) >= 0) p.done = true; }); TP.saveTour(t2); render(); } });
  };
  ACT["pack-edit"] = function () { S.packEdit = !S.packEdit; render(); };
  ACT["pack-template"] = function () { var t = cur(); t.pack = C.packTemplate(t.sport); TP.saveTour(t); render(); };
  function packMove(id, dir) {
    var t = cur(), i = t.pack.findIndex(function (p) { return p.id === id; }); if (i < 0) return;
    var g = t.pack[i].group, j = i + dir;
    while (j >= 0 && j < t.pack.length && t.pack[j].group !== g) j += dir;
    if (j < 0 || j >= t.pack.length) return;
    var tmp = t.pack[i]; t.pack[i] = t.pack[j]; t.pack[j] = tmp; TP.saveTour(t); render();
  }
  ACT["pack-up"] = function (el) { packMove(el.getAttribute("data-id"), -1); };
  ACT["pack-down"] = function (el) { packMove(el.getAttribute("data-id"), 1); };
  ACT["pack-del"] = function (el) {
    var t = cur(), id = el.getAttribute("data-id"), i = t.pack.findIndex(function (p) { return p.id === id; }); if (i < 0) return;
    var p = t.pack.splice(i, 1)[0]; TP.saveTour(t); render();
    toast("Removed " + p.text + ".", "", 6000, { label: "Undo", fn: function () { var t2 = cur(); if (!t2) return; t2.pack.splice(Math.min(i, t2.pack.length), 0, p); TP.saveTour(t2); render(); } });
  };

  /* ================= notes: copy, share, calendar ================= */
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
          document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove(); resolve(!!ok);
        } catch (e) { resolve(false); }
      }
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback); else fallback(); } catch (e2) { fallback(); }
    });
  }
  ACT["copy-summary"] = function () {
    var t = cur(); TP.closeAllSheets();
    copyText(C.summaryText(t, { warm: S.settings.warm })).then(function (ok) { toast(ok ? "Copied. Paste it into the team chat." : "Couldn't copy automatically. Open the Notes tab, then select the summary text and copy it.", ok ? "ok" : "error"); });
  };
  ACT["share-summary"] = function () {
    var t = cur();
    try { navigator.share({ title: t.name, text: C.summaryText(t, { warm: S.settings.warm }) }).catch(function () { /* cancelled */ }); } catch (e) { toast("Couldn't open the share sheet. Use Copy instead.", "error"); }
  };
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 5000);
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tournament"; }
  ACT.ics = function () {
    var t = cur(); TP.closeAllSheets();
    var r = C.icsFor(t, { warm: S.settings.warm });
    if (!r.count) return toast(t.team ? "No upcoming games with a date to add yet." : "Add our team name and some games first.", "error");
    try { downloadBlob(new Blob([r.text], { type: "text/calendar" }), "tournament-pack-" + slug(t.name) + ".ics"); toast("Calendar file made with " + C.plural(r.count, "game") + ". Open it to add them to your calendar.", "ok", 5000); }
    catch (e) { toast("Couldn't make the calendar file. Try again.", "error"); }
  };

  /* ================= settings, backup, restore, sample ================= */
  V.settings = function () {
    var lb = S.meta.lastBackup ? (function () { var d = C.diffDays(C.todayStr(), S.meta.lastBackup); return "Last backup: " + (d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago") + "."; })() : "You haven't made a backup yet.";
    var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })); } catch (e) { /* ignore */ }
    return V.banners() + '<div class="stack settings">' +
      '<article class="card"><h3>Warm-up time</h3><div class="field"><label class="label" for="s-warm">Minutes to arrive before the game</label><input type="number" id="s-warm" inputmode="numeric" min="0" max="180" value="' + S.settings.warm + '"><div class="hint">"Arrive by" is the game time minus this. Saved as you type.</div></div></article>' +
      '<article class="card"><h3>Standings rules</h3><p class="mute">The tiebreaker order that new tournaments start with. Each tournament can still change its own.</p><button type="button" class="btn ghost" data-act="rules-defaults">Default tiebreakers</button></article>' +
      '<article class="card"><h3>Your data</h3><p>Everything is saved <b>only on this phone</b>. If the phone is reset, or the browser clears its saved data, it is gone. Download a backup now and then and keep the file somewhere safe, like Files or Google Drive.</p><p class="mute">' + esc(lb) + "</p>" +
      '<div class="stack"><button type="button" class="btn block" data-act="dl-backup">Download backup file</button>' + (canShare ? '<button type="button" class="btn ghost block" data-act="share-backup">Share backup file...</button>' : "") +
      '<label class="btn ghost block file-btn">Restore from a backup file<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Tournament Pack backup file"></label>' +
      '<button type="button" class="btn ghost block" data-act="sample">Load a sample tournament</button><button type="button" class="btn danger block" data-act="clear-all">Clear everything</button></div></article>' +
      '<article class="card"><h3>About</h3><p><b>' + esc(C.VERSION) + "</b></p><p class=\"mute\">No accounts, no ads, and nothing is sent anywhere. Only files you choose to save or share (a backup, a calendar file) leave the app. Works offline once it has loaded one time.</p></article></div>";
  };
  function backupFile() {
    var list = S.index.ids.map(function (id) { return S.tours[id]; }).filter(Boolean);
    return { name: "tournament-pack-backup-" + C.todayStr() + ".json", json: JSON.stringify(C.makeBackup(list, S.settings, C.todayStr()), null, 1) };
  }
  function markBackup() { S.meta.lastBackup = C.todayStr(); TP.saveMeta(); }
  ACT["dl-backup"] = function () {
    try { var f = backupFile(); downloadBlob(new Blob([f.json], { type: "application/json" }), f.name); markBackup(); if (S.view === "settings") render(); toast("Backup file created: " + f.name + ". Keep it somewhere safe.", "ok", 5500); }
    catch (e) { toast("Couldn't make the backup file. Try again.", "error"); }
  };
  ACT["share-backup"] = function () {
    try {
      var f = backupFile(), file = new File([f.json], f.name, { type: "application/json" });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return toast("This phone can't share files from here. Use Download instead.", "error");
      navigator.share({ files: [file], title: "Tournament Pack backup" }).then(function () { markBackup(); render(); toast("Backup shared. Make sure you saved it somewhere safe.", "ok", 5000); }, function (e) { if (!e || e.name !== "AbortError") toast("Couldn't share the backup. Try Download instead.", "error"); });
    } catch (e2) { toast("Couldn't share the backup. Try Download instead.", "error"); }
  };
  function onRestoreFile(file) {
    if (!file) return;
    var bad = function (m) { toast(m + " Nothing was changed.", "error", 6000); };
    if (file.size > 25 * 1024 * 1024) return bad("That file is too big to be a Tournament Pack backup.");
    var rd = new FileReader();
    rd.onerror = function () { bad("Couldn't read that file."); };
    rd.onload = function () {
      var obj;
      try { obj = JSON.parse(String(rd.result)); } catch (e) { return bad("That file isn't a Tournament Pack backup (it can't be read)."); }
      var v = C.validateBackup(obj);
      if (!v.ok) return bad(v.error);
      var n = S.index.ids.length;
      confirmSheet({
        title: "Replace everything?", message: "This backup has " + C.plural(v.tournaments.length, "tournament") + (v.tournaments.length ? ": " + v.tournaments.map(function (t) { return t.name; }).join(", ") : "") + ".",
        more: [n ? "Restoring replaces everything in Tournament Pack on this phone now (" + C.plural(n, "tournament") + "). This cannot be undone." : "Nothing is on this phone yet, so nothing will be lost."],
        confirmText: "Restore", danger: n > 0, onConfirm: function () { applyRestore(v); }
      });
    };
    rd.readAsText(file);
  }
  function applyRestore(v) {
    var old = {};
    TP.store.keys().filter(function (k) { return k === "index" || k === "settings" || k.indexOf("t.") === 0; }).forEach(function (k) { old[k] = TP.store.get(k); });
    var ids = v.tournaments.map(function (t) { return t.id; });
    try {
      v.tournaments.forEach(function (t) { if (!TP.store.set("t." + t.id, JSON.stringify(t))) throw new Error("write"); });
      if (!TP.store.set("index", JSON.stringify({ v: 1, ids: ids })) || !TP.store.set("settings", JSON.stringify(v.settings))) throw new Error("write");
      Object.keys(old).forEach(function (k) { if (k.indexOf("t.") === 0 && ids.indexOf(k.slice(2)) < 0) TP.store.del(k); });
    } catch (e) {
      v.tournaments.forEach(function (t) { TP.store.del("t." + t.id); });
      Object.keys(old).forEach(function (k) { if (old[k] != null) TP.store.set(k, old[k]); });
      return toast("Couldn't restore (storage problem). Your data on this phone was left as it was.", "error", 6500);
    }
    TP.loadAll(); markBackup(); TP.closeAllSheets(); S.view = "list"; S.tid = null; render(); TP.syncHistory();
    toast("Restored " + C.plural(v.tournaments.length, "tournament") + ".", "ok");
  }
  ACT.sample = function () {
    var t = C.sampleTournament(C.todayStr());
    TP.addTour(t); TP.closeAllSheets(); openTour(t.id); toast("Sample tournament loaded. Delete it any time from the tournament menu.", "ok", 5000);
  };
  ACT["clear-all"] = function () {
    confirmSheet({
      title: "Clear everything?", message: "This permanently removes all " + C.plural(S.index.ids.length, "tournament") + " and your settings from this phone. This cannot be undone.",
      more: ["Want a copy first? Download a backup, then clear."], confirmText: "Clear everything", danger: true,
      onConfirm: function () {
        TP.store.keys().forEach(function (k) { TP.store.del(k); });
        TP.loadAll(); S.settings = C.sanitizeSettings(); S.lastDate = {}; S.view = "list"; S.tid = null; render(); TP.syncHistory(); toast("Everything was cleared.", "ok");
      }
    });
  };

  /* ================= start ================= */
  TP.initStorage();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* best effort */ }
  render();
})();
