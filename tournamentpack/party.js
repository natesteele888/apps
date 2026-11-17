/* Tournament Pack party games and keep score.
   Party games: type the teams (2 on 2 or any size), pick everyone-plays-everyone or a bracket, and go. The tournament opens on
   the Play screen: big names, big scores, tap to add points, then Final.
   Keep score: any game can be scored in Scoreboard on this phone. The game is left under localStorage "apps.handoff.<token>"
   (both apps live on the same site, so they share its storage) and Scoreboard opens with ?keep=<token>. When it is
   finished there, Scoreboard leaves the final under "apps.handoff.<token>.result" and it is picked up here. */
(function () {
  "use strict";
  var TP = window.TP, C = TP.C, S = TP.S, $ = TP.$, $$ = TP.$$, esc = TP.esc, I = TP.I, V = TP.views, ACT = TP.ACT, toast = TP.toast;
  var HK = "apps.handoff.";
  var STEP = { flag: [6, 1, 2], basketball: [1, 2, 3], baseball: [1], softball: [1] };

  I.play = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';

  function save(t) { S.tours[t.id] = t; TP.saveTour(t); }
  function gameOf(t, id) { return t ? t.games.filter(function (g) { return g.id === id; })[0] || null : null; }
  function token() {
    var s = "", abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    try { var b = new Uint8Array(16); window.crypto.getRandomValues(b); for (var i = 0; i < b.length; i++) s += abc[b[i] % 36]; }
    catch (e) { for (var j = 0; j < 16; j++) s += abc[Math.floor(Math.random() * 36)]; }
    return s;
  }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; }
    catch (e) { return v === undefined ? null : false; }
  }

  /* ================= keep score in Scoreboard ================= */
  ACT["keep-score"] = function (el) {
    var t = TP.cur(), g = gameOf(t, el.getAttribute("data-id"));
    if (!g) return;
    var tk = token(), req = C.keepRequest(t, g, tk, Date.now());
    if (!req) return toast("Both teams have to be known before this game can be scored.", "error");
    if (!ls(HK + tk, JSON.stringify(req))) return toast("This browser won't let the apps share the game, so open Scoreboard and type the teams there.", "error", 6500);
    TP.closeAllSheets();
    window.location.href = "../scoreboard/?keep=" + tk;
  };

  /* finals handed back by Scoreboard, picked up whenever this page is open or comes back into view */
  TP.takeResults = function () {
    var keys = [], msgs = [], changed = false;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(HK) === 0) keys.push(k); } } catch (e) { return; }
    var now = Date.now();
    keys.forEach(function (k) {
      var raw = null; try { raw = JSON.parse(ls(k) || "null"); } catch (e) { raw = null; }
      if (!/\.result$/.test(k)) {   // a request nobody answered: drop it after two days
        if (!raw || !(now - Number(raw.at) < 2 * 86400000)) ls(k, null);
        return;
      }
      var t = raw && typeof raw.tid === "string" ? S.tours[raw.tid] : null;
      if (!t) { if (!raw || !(now - Number(raw.at) < 7 * 86400000)) ls(k, null); return; }   // not on this phone (yet)
      var r = C.applyResult(t, raw), g = r.game, nm = g ? g.a + " vs " + g.b : "a game";
      if (r.t) { save(r.t); changed = true; msgs.push("Final from Scoreboard: " + g.a + " " + r.sa + ", " + g.b + " " + r.sb + "."); }
      else if (r.skip === "already") msgs.push("Scoreboard's final for " + nm + " was not used, because that game already has a final score.");
      else if (r.skip === "tie") msgs.push("Scoreboard ended " + nm + " tied " + r.sa + " to " + r.sb + ". A bracket game needs a winner, so type the final in.");
      ls(k, null); ls(k.replace(/\.result$/, ""), null);
    });
    if (changed && S.view === "tournament") TP.render();
    if (msgs.length) toast(msgs.join(" "), changed ? "ok" : "", 6500);
  };
  window.addEventListener("pageshow", function () { TP.takeResults(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") TP.takeResults(); });
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf(HK) === 0 && /\.result$/.test(e.key)) TP.takeResults(); });

  /* ================= party setup ================= */
  function nowPlus5() {
    var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    m = Math.ceil((m + 1) / 5) * 5; if (m >= 1440) m = 1435;
    return (m < 600 ? "0" : "") + Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60);
  }
  ACT["party-new"] = function () {
    var st = { sport: "flag", format: "rr", len: 15, fields: 1 };
    function pills(name, items, sel, label) {
      return '<div class="pills" role="group" aria-label="' + esc(label) + '">' + items.map(function (x) {
        return '<button type="button" class="pill" data-p-' + name + '="' + esc(x[0]) + '" aria-pressed="' + (String(x[0]) === String(sel)) + '">' + esc(x[1]) + "</button>";
      }).join("") + "</div>";
    }
    TP.openSheet({
      title: "Party games", cls: "form", autofocus: "#p-teams",
      html: '<p class="msg">For a birthday or the backyard: type the teams, pick how they play, and go. 2 on 2 is fine.</p>' +
        '<div class="field"><span class="label">Game</span>' + pills("sport", C.SPORTS.slice().sort(function (a) { return a.id === "flag" ? -1 : 0; }).map(function (s) { return [s.id, s.label]; }), st.sport, "Game") + "</div>" +
        '<div class="field"><label class="label" for="p-teams">Teams, one per line</label><textarea id="p-teams" rows="5" maxlength="1200" autocomplete="off" placeholder="Sharks&#10;Jets&#10;Owls&#10;Tigers"></textarea>' +
        '<div class="row wrap"><span class="hint" id="p-count" aria-live="polite">Type at least two teams.</span><button type="button" class="btn ghost small" data-p-shuffle>Mix up the order</button></div></div>' +
        '<div class="field"><span class="label">How they play</span>' + pills("format", [["rr", "Everyone plays everyone"], ["bracket", "Bracket"]], st.format, "How they play") +
        '<span class="hint" id="p-fmt-hint"></span></div>' +
        '<div class="cols2"><div class="field"><label class="label" for="p-start">First game at</label><input type="time" id="p-start" value="' + nowPlus5() + '"></div>' +
        '<div class="field"><label class="label" for="p-name">Name</label><input type="text" id="p-name" maxlength="60" autocomplete="off" placeholder="Party games"></div></div>' +
        '<div class="field"><span class="label">Minutes a game</span>' + pills("len", [[10, "10"], [15, "15"], [20, "20"], [30, "30"]], st.len, "Minutes a game") + "</div>" +
        '<div class="field"><span class="label">Fields or courts</span>' + pills("fields", [[1, "1"], [2, "2"], [3, "3"]], st.fields, "Fields or courts") + "</div>" +
        '<p class="errmsg" id="p-err" role="alert" hidden></p>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" data-p-go>Let\'s play</button>',
      onOpen: function (api) {
        var q = function (s) { return $(s, api.el); }, ta = q("#p-teams");
        function teams() { return C.partyTeams(ta.value); }
        function sync() {
          var n = teams().length, games = st.format === "rr" ? n * (n - 1) / 2 : Math.max(0, n - 1);
          q("#p-count").textContent = n < 2 ? "Type at least two teams." : C.plural(n, "team") + ", " + C.plural(games, "game");
          q("#p-fmt-hint").textContent = st.format === "bracket" ? (n === 4 || n === 6 || n === 8 ? "Lose and you're out. Teams are seeded in the order typed." : "A bracket takes 4, 6 or 8 teams.") : "Each team plays every other team once, then the standings pick the winner.";
        }
        api.el.addEventListener("click", function (e) {
          var b = e.target.closest("[data-p-sport],[data-p-format],[data-p-len],[data-p-fields]");
          if (b) {
            ["sport", "format", "len", "fields"].forEach(function (k) {
              var v = b.getAttribute("data-p-" + k); if (v == null) return;
              st[k] = k === "len" || k === "fields" ? Number(v) : v;
              $$("[data-p-" + k + "]", api.el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            });
            sync(); return;
          }
          if (e.target.closest("[data-p-shuffle]")) {
            var list = teams();
            for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = list[i]; list[i] = list[j]; list[j] = x; }
            ta.value = list.join("\n"); sync(); return;
          }
          if (e.target.closest("[data-p-go]")) {
            var t = C.partyTournament({ name: q("#p-name").value, sport: st.sport, teams: teams(), format: st.format, date: C.todayStr(), start: q("#p-start").value, gameMin: st.len, fields: st.fields });
            var err = q("#p-err");
            if (t.error) { err.textContent = t.error; err.hidden = false; return; }
            TP.addTour(t); TP.closeAllSheets(); TP.openTour(t.id);
            toast("Let's play. Tap the points as they score, then Final.", "ok", 5000);
          }
        });
        ta.addEventListener("input", sync); sync();
      }
    });
  };

  /* ================= the Play screen ================= */
  function scoreOf(g, side) { var v = side === "a" ? g.lsa : g.lsb; return v == null ? 0 : v; }
  function champion(t) {
    if (t.bracket && t.bracket.size) { var tree = C.bracketTree(t); return tree && tree.champion ? tree.champion : ""; }
    var res = C.standingsFor(t), left = t.games.some(function (g) { return g.kind === "pool" && g.status !== "final"; });
    if (left || !res.rows.length) return "";
    var top = res.rows.filter(function (r) { return r.rank === 1; });
    return top.length === 1 ? top[0].team : "";
  }
  V.play = function (t) {
    var now = C.playNow(t), all = C.sortGames(t.games), steps = STEP[t.sport] || [1], h = '<div class="play">';
    if (!now.length) {
      var ch = champion(t);
      h += '<article class="card pl-done"><div class="pl-trophy" aria-hidden="true">🏆</div>' +
        (ch ? '<h3>' + esc(ch) + "</h3><p>wins " + esc(t.name) + "!</p>" : "<h3>All done</h3><p>Every game has a final score. The standings and bracket tabs show how it ended.</p>") + "</article>";
    }
    now.forEach(function (g) {
      var n = all.indexOf(g) + 1, sa = scoreOf(g, "a"), sb = scoreOf(g, "b");
      var side = function (s, name, sc) {
        return '<div class="pl-side"><b class="pl-name">' + esc(name) + '</b><span class="pl-score num" aria-label="' + esc(name) + " " + sc + '">' + sc + "</span>" +
          '<div class="pl-btns">' + steps.map(function (d) { return '<button type="button" class="btn pl-add" data-act="play-score" data-fk="ps-' + esc(g.id) + s + d + '" data-id="' + esc(g.id) + '" data-side="' + s + '" data-d="' + d + '" aria-label="' + esc(name) + " plus " + d + '">+' + d + "</button>"; }).join("") +
          '<button type="button" class="btn ghost pl-sub" data-act="play-score" data-fk="ps-' + esc(g.id) + s + '-1" data-id="' + esc(g.id) + '" data-side="' + s + '" data-d="-1" aria-label="' + esc(name) + ' minus 1">−1</button></div></div>';
      };
      h += '<article class="card pl-game"><div class="label">Game ' + n + " of " + all.length + (g.time ? " · " + esc(C.fmtTime(g.time)) : "") + (g.field ? " · " + esc(g.field) : "") +
        (g.kind === "bracket" ? " · " + esc(C.slotTitle(t, g.slot)) : "") + "</div>" +
        '<div class="pl-teams">' + side("a", g.a, sa) + '<div class="pl-vs" aria-hidden="true">vs</div>' + side("b", g.b, sb) + "</div>" +
        '<div class="row wrap pl-acts"><button type="button" class="btn" data-act="play-final" data-id="' + esc(g.id) + '">Final</button>' +
        '<button type="button" class="btn ghost" data-act="keep-score" data-id="' + esc(g.id) + '">Keep score in Scoreboard</button></div></article>';
    });
    var next = all.filter(function (g) { return g.status !== "final" && now.indexOf(g) < 0; }).slice(0, 4);
    if (next.length) h += '<article class="card"><div class="label">Up next</div><ul class="pl-next">' + next.map(function (g) {
      return "<li><span class=\"num\">" + esc(g.time ? C.fmtTime(g.time) : "") + "</span><b>" + esc(g.a || "Winner to come") + " vs " + esc(g.b || "winner to come") + "</b>" + (g.field ? "<small>" + esc(g.field) + "</small>" : "") + "</li>";
    }).join("") + "</ul></article>";
    if (!t.bracket.size) {
      var res = C.standingsFor(t), rows = res.rows.filter(function (r) { return r.gp > 0; });
      if (rows.length) h += '<article class="card"><div class="label">Standings</div><ol class="pl-table">' + rows.map(function (r) {
        return '<li><span class="rk num">' + (r.tied ? "T" : "") + r.rank + "</span><b>" + esc(r.team) + '</b><span class="num">' + r.w + "-" + r.l + (r.t ? "-" + r.t : "") + "</span></li>";
      }).join("") + "</ol></article>";
    }
    return h + "</div>";
  };
  ACT["play-score"] = function (el) {
    var t = TP.cur(), g = gameOf(t, el.getAttribute("data-id")); if (!g || g.status === "final") return;
    var side = el.getAttribute("data-side") === "b" ? "b" : "a", d = Number(el.getAttribute("data-d")) || 0;
    var c = C.clone(t);
    c.games.forEach(function (x) {
      if (x.id !== g.id) return;
      x.lsa = scoreOf(x, "a"); x.lsb = scoreOf(x, "b");
      var k = side === "a" ? "lsa" : "lsb"; x[k] = Math.max(0, Math.min(999, x[k] + d));
    });
    save(c); TP.render();
  };
  ACT["play-final"] = function (el) {
    var t = TP.cur(), g = gameOf(t, el.getAttribute("data-id")); if (!g || g.status === "final") return;
    var sa = scoreOf(g, "a"), sb = scoreOf(g, "b");
    if (g.kind === "bracket" && sa === sb) return toast("It's tied. A bracket game needs a winner, so play on.", "error");
    TP.confirmSheet({
      title: "Final score?", message: g.a + " " + sa + ", " + g.b + " " + sb + ".", confirmText: "Yes, it's final",
      onConfirm: function () {
        var r = C.applyResult(t, { v: 1, tid: t.id, gid: g.id, sa: sa, sb: sb });
        if (r.t) { save(r.t); TP.render(); toast(sa === sb ? "Final: a tie." : "Final: " + (sa > sb ? g.a : g.b) + " win.", "ok"); }
      }
    });
  };

  TP.takeResults();
})();
