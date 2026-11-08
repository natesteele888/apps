/* Tournament Pack, part 2: what each screen looks like. Every function here returns an HTML string; user text always goes through esc(). */
(function () {
  "use strict";
  var TP = window.TP, C = TP.C, S = TP.S, esc = TP.esc, I = TP.I;
  var V = TP.views = {};

  var TABS = [["games", "Games", I.games], ["standings", "Standings", I.table], ["bracket", "Bracket", I.bracket], ["pack", "Pack", I.pack], ["notes", "Notes", I.notes]];
  TP.TABS = TABS;

  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function seedText(best, worst) { return best === worst ? "seed " + best : "seed " + best + " to " + worst; }
  function rankText(r) { return r.rank == null ? "-" : (r.tied ? "T" : "") + r.rank; }
  function signed(n) { return (n > 0 ? "+" : "") + n; }
  function emptyBox(icon, title, text, buttons) {
    return '<div class="empty"><div class="big" aria-hidden="true">' + icon + "</div><h3>" + esc(title) + "</h3><p>" + esc(text) + "</p>" + (buttons || "") + "</div>";
  }

  /* ================= header, nav ================= */
  V.header = function () {
    if (S.view === "list") {
      return '<div class="top-in"><h1 class="brand"><span class="mark">' + I.bracket + '</span><span>Tournament Pack</span></h1>' +
        '<button type="button" class="icon-btn" data-act="settings" data-fk="settings" aria-label="Settings">' + I.gear + "</button></div>";
    }
    if (S.view === "settings") {
      return '<div class="top-in"><button type="button" class="icon-btn" data-act="back" data-fk="back" aria-label="Back to tournaments">' + I.back + '</button><div class="ttl"><b>Settings</b></div></div>';
    }
    var t = TP.cur();
    return '<div class="top-in"><button type="button" class="icon-btn" data-act="back" data-fk="back" aria-label="Back to all tournaments">' + I.back + "</button>" +
      '<div class="ttl"><b>' + esc(t.name) + "</b><small>" + esc(C.dateRange(t)) + (t.team ? " · " + esc(t.team) : "") + "</small></div>" +
      '<button type="button" class="icon-btn" data-act="tour-menu" data-fk="menu" aria-label="Tournament menu">' + I.dots + "</button></div>";
  };
  V.nav = function () {
    return '<div class="nav-in">' + TABS.map(function (x) {
      return '<button type="button" data-act="tab" data-tab="' + x[0] + '" data-fk="tab-' + x[0] + '"' + (S.tab === x[0] ? ' aria-current="page"' : "") + ">" + x[2] + "<span>" + x[1] + "</span></button>";
    }).join("") + "</div>";
  };
  V.banners = function () {
    var h = "";
    if (S.memMode) h += '<div class="banner bad" role="alert"><p><b>This browser is not letting Tournament Pack save.</b> What you add will be lost when you close the app. Download a backup from Settings to keep a copy.</p></div>';
    if (S.damaged.length) h += '<div class="banner"><p>' + C.plural(S.damaged.length, "saved tournament") + " couldn't be read. Your other tournaments are fine.</p></div>";
    return h;
  };

  /* ================= tournament list ================= */
  V.list = function () {
    var h = V.banners(), ids = S.index.ids.filter(function (id) { return S.tours[id]; });
    if (!ids.length) {
      return h + '<section class="welcome"><h2 class="tagline">Everything for tournament weekend</h2>' +
        '<p class="lead">Keep the game schedule with arrive-by times, pool standings that apply the real tiebreakers, the bracket, and what to pack, all in one place.</p>' +
        '<div class="stack"><button type="button" class="btn block" data-act="tour-new" data-fk="new">New tournament</button>' +
        '<button type="button" class="btn ghost block" data-act="sample" data-fk="sample">Load a sample tournament</button></div>' +
        '<p class="privacy-note">' + I.shield + "<span>Everything stays on this phone. No accounts, no sign-in. Clearing the browser's data erases it, so download a backup now and then.</span></p>" +
        '<p class="mute center">Already have a backup file? <label class="link-btn">Restore it<input type="file" accept="application/json,.json" data-restore aria-label="Choose a Tournament Pack backup file"></label></p></section>';
    }
    var today = C.todayStr(), now = C.nowParts();
    var cur = ids.filter(function (id) { return S.tours[id].end >= today; }).sort(function (a, b) { return S.tours[a].start < S.tours[b].start ? -1 : 1; });
    var past = ids.filter(function (id) { return S.tours[id].end < today; }).sort(function (a, b) { return S.tours[a].start < S.tours[b].start ? 1 : -1; });
    function card(id) {
      var t = S.tours[id], info = C.sportInfo(t.sport), res = C.standingsFor(t), me = t.team ? C.rowFor(res, t.team) : null, ng = C.nextGame(t, now), bits = [];
      if (me && me.gp > 0) bits.push(me.w + "-" + me.l + (me.t ? "-" + me.t : "") + ", seed " + rankText(me));
      if (ng) bits.push("Next: " + (ng.game.date ? C.fmtDay(ng.game.date) : "") + (ng.game.time ? " " + C.fmtTime(ng.game.time) : "") + " vs " + C.oppName(t, ng.game));
      else if (!t.games.length) bits.push("No games added yet");
      return '<li><button type="button" class="tcard" data-act="tour-open" data-id="' + esc(t.id) + '"><span class="ic" aria-hidden="true">' + info.icon + '</span><span class="tb"><b class="tn">' + esc(t.name) + "</b><small>" + esc(C.dateRange(t)) +
        (t.team ? " · " + esc(t.team) : "") + "</small>" + (bits.length ? '<small class="tx">' + esc(bits.join(" · ")) + "</small>" : "") + "</span>" + I.go + "</button></li>";
    }
    h += '<div class="sec-title"><h2>' + (cur.length ? "Current and upcoming" : "Your tournaments") + '</h2></div>';
    if (cur.length) h += '<ul class="tlist">' + cur.map(card).join("") + "</ul>";
    else h += '<p class="mute">Nothing coming up. Start a new tournament below.</p>';
    h += '<button type="button" class="btn block" data-act="tour-new" data-fk="new" style="margin-top:12px">' + I.plus + "New tournament</button>";
    if (past.length) h += '<div class="sec-title"><h2>Past</h2></div><ul class="tlist">' + past.map(card).join("") + "</ul>";
    return h;
  };

  /* ================= Games tab ================= */
  function slotLabels(t) {
    var map = {}, tree = C.bracketTree(t);
    if (tree) tree.rounds.forEach(function (r) { r.matches.forEach(function (m) { map[m.slot] = m; }); });
    return map;
  }
  function sides(t, g, slots) {
    var m = g.kind === "bracket" ? slots[g.slot] : null;
    return { a: g.a || (m ? m.a.label : "TBD"), b: g.b || (m ? m.b.label : "TBD"), title: m ? m.title : (g.label || "Pool play") };
  }
  function gameRow(t, g, slots, now) {
    var ours = C.isOurs(t, g), warm = S.settings.warm, sd = sides(t, g, slots), res = ours ? C.resultFor(t, g) : null, e = C.effScore(g, t.rules);
    var timeHtml = g.time ? "<b>" + esc(C.fmtTime(g.time).replace(/ (AM|PM)$/, "")) + "</b><small>" + esc(C.fmtTime(g.time).slice(-2)) + "</small>" : "<b>TBD</b>";
    var title;
    if (ours) title = '<span class="vs">vs</span> ' + esc(C.oppName(t, g));
    else {
      var wa = e && e.winner === "a", wb = e && e.winner === "b";
      title = (wa ? "<b>" + esc(sd.a) + "</b>" : esc(sd.a)) + ' <span class="vs">vs</span> ' + (wb ? "<b>" + esc(sd.b) + "</b>" : esc(sd.b));
    }
    var bits = [];
    if (g.field) bits.push(esc(g.field));
    bits.push(esc(sd.title));
    if (ours && g.status !== "final" && g.time) { var ab = C.arriveBy(g.date, g.time, warm); bits.push("<b class=\"arr\">Arrive by " + esc(C.fmtTime(ab.time)) + "</b>"); }
    if (g.status === "final" && e && e.forfeit) bits.push("Forfeit");
    if (g.status === "final" && g.innings) bits.push("Shortened: " + g.innings + " innings");
    var chip = "";
    if (g.status === "final" && e) {
      if (res) chip = '<span class="chip ' + res.res.toLowerCase() + '">' + res.res + " " + res.us + "-" + res.them + "</span>";
      else chip = '<span class="chip n">' + e.a + "-" + e.b + "</span>";
    } else if (C.needsScore(t, g, now)) chip = '<span class="chip warn">Add score</span>';
    return '<button type="button" class="game' + (ours ? " ours" : "") + (g.status === "final" ? " done" : "") + '" data-act="game-edit" data-id="' + esc(g.id) + '"><span class="gt">' + timeHtml + '</span><span class="gm"><span class="g1">' + title +
      '</span><span class="g2">' + bits.join(" · ") + "</span></span>" + chip + "</button>";
  }
  function nextCard(t, now) {
    if (!t.team) return '<article class="card next soft"><div class="label">Next game</div><p>Add your team name to see your next game, the countdown and arrive-by times.</p><button type="button" class="btn small" data-act="tour-edit">Add team name</button></article>';
    var ng = C.nextGame(t, now);
    if (!ng) {
      if (!t.games.some(function (g) { return C.isOurs(t, g); })) return "";
      return '<article class="card next soft"><div class="label">Next game</div><p>No upcoming games for ' + esc(t.team) + ".</p></article>";
    }
    var g = ng.game, warm = S.settings.warm, ab = g.time ? C.arriveBy(g.date, g.time, warm) : null, started = ng.timed && ng.delta < 0;
    var cd = ng.timed ? '<div class="cd num" data-cd="' + ng.start + '" aria-live="off">' + esc(C.countdownText(ng.delta)) + "</div>" :
      '<div class="cd num">' + (ng.daysAway === 0 ? "Today, time to be announced" : ng.daysAway === 1 ? "Tomorrow, time to be announced" : "Time to be announced") + "</div>";
    var sd = sides(t, g, slotLabels(t));
    return '<article class="card next' + (started ? " live" : "") + '"><div class="label">Next game' + (g.kind === "bracket" ? " · " + esc(sd.title) : "") + "</div>" + cd +
      '<div class="nv">vs ' + esc(C.oppName(t, g)) + "</div>" +
      '<p class="nm">' + esc(C.fmtDay(g.date)) + (g.time ? " · " + esc(C.fmtTime(g.time)) : "") + (g.field ? " · " + esc(g.field) : "") + "</p>" +
      (ab ? '<p class="arr big">Arrive by ' + esc(C.fmtTime(ab.time)) + (ab.date !== g.date ? " (the day before)" : "") + ' <small>(' + warm + " min warm-up)</small></p>" : "") +
      '<button type="button" class="btn small" data-act="game-edit" data-id="' + esc(g.id) + '">' + (started ? "Enter the score" : "Open game") + "</button></article>";
  }
  V.games = function (t) {
    var now = C.nowParts(), h = nextCard(t, now), slots = slotLabels(t), gm = C.gameMinutes(t);
    h += '<div class="row wrap actions"><button type="button" class="btn" data-act="game-new" data-fk="game-new">' + I.plus + "Add a game</button></div>";
    if (!t.games.length) return h + emptyBox("📅", "No games yet", "Add the first game. Pool games and bracket games both go here, in time order by day.", "");
    C.groupByDay(t.games).forEach(function (d) {
      var lastOur = null;
      h += '<div class="day"><h3>' + esc(d.date ? C.fmtDay(d.date) : "No date yet") + "</h3><span>" + C.plural(d.games.length, "game") + '</span></div><ul class="glist">';
      d.games.forEach(function (g) {
        var ours = C.isOurs(t, g);
        if (ours && lastOur && g.status !== "final") {
          var gi = C.gapInfo(lastOur, g, gm);
          if (gi) h += '<li class="gap' + (gi.warn ? " warn" : "") + '">' + I.clock + "<span>" + esc(gi.text) + "</span></li>";
        }
        if (ours) lastOur = g;
        h += "<li>" + gameRow(t, g, slots, now) + "</li>";
      });
      h += "</ul>";
    });
    return h + '<p class="mute small note">Rest time is an estimate: it assumes a game lasts about ' + gm + " minutes. Change that in Edit tournament.</p>";
  };

  /* ================= Standings tab ================= */
  function weStand(t, res) {
    if (!t.team) return '<article class="card soft"><div class="label">Where we stand</div><p>Add your team name in Edit tournament to see your seed.</p></article>';
    var sc = C.scenarios(t.games, Object.assign({}, t.rules, { sport: t.sport }), t.team);
    if (!sc || !sc.now) {
      return '<article class="card soft"><div class="label">Where we stand</div><p>' + (sc && sc.remaining ? "No finished pool games yet for " + esc(t.team) + ". Enter a score and your seed shows up here." : "Add a pool game with " + esc(t.team) + " to see your seed.") + "</p></article>" + (sc && sc.remaining ? scenarioList(sc, t) : "");
    }
    var n = sc.now, seed = n.tied ? "Seed " + n.rank + (n.rankTo > n.rank ? " to " + n.rankTo : "") : "Seed " + n.rank;
    var h = '<article class="card stand"><div class="label">Where we stand</div><div class="big num">' + seed + " <small>of " + sc.ofTeams + ' teams <span class="rec"><span class="dot">· </span>' + n.w + "-" + n.l + (n.t ? "-" + n.t : "") + "</span></small></div>" +
      (n.tied ? '<p class="warnmsg">Still tied with another team. The tiebreaker steps are below.</p>' : "") + "</article>";
    return h + scenarioList(sc, t);
  }
  function scenarioList(sc, t) {
    if (!sc.remaining) return '<article class="card soft"><div class="label">What do we need?</div><p>No pool games left for ' + esc(t.team) + ". Your pool seed is the one shown above.</p></article>";
    return '<article class="card"><div class="label">What do we need? <span class="est">Estimate</span></div><ul class="scen">' +
      "<li><div><b>If we win out</b><small>" + C.plural(sc.remaining, "game") + " left, all wins</small></div><span>" + esc(seedText(sc.win.best, sc.win.worst)) + "</span></li>" +
      "<li><div><b>If we lose out</b><small>all " + C.plural(sc.remaining, "game") + " lost</small></div><span>" + esc(seedText(sc.lose.best, sc.lose.worst)) + "</span></li></ul>" +
      '<p class="mute small">This is an estimate. It only changes our own remaining pool games and leaves every other result as it is now, so games in other pools or between other teams are not predicted. If it comes down to ' + C.sportInfo(t.sport).unit + ", the final scores can move the seed.</p></article>";
  }
  function tieCard(t, tie) {
    var h = '<article class="card tie"><div class="label">Tiebreaker for ' + (tie.from === tie.to ? ord(tie.from) : ord(tie.from) + " to " + ord(tie.to)) + "</div><h3>" + esc(C.joinNames(tie.teams)) + "</h3>" +
      '<p class="mute">These teams were level, so these steps decide the order, one after the other.</p><ol class="steps">';
    tie.steps.forEach(function (s) {
      h += "<li><b>" + esc(C.critName(s.crit, t.sport)) + "</b>" + (s.among.length < tie.teams.length ? '<span class="among">Now only ' + esc(C.joinNames(s.among)) + " are still level.</span>" : "") + "<span>" + esc(s.text) + "</span>";
      if (s.table && s.among.length >= 2) {
        h += '<table class="mini"><caption class="sr">Head-to-head record among the tied teams</caption><thead><tr><th scope="col">Team</th><th scope="col">Record</th></tr></thead><tbody>' + s.table.map(function (r) {
          return "<tr><td>" + esc(r.team) + "</td><td>" + (r.gp ? r.w + "-" + r.l + (r.t ? "-" + r.t : "") : "no games") + "</td></tr>";
        }).join("") + "</tbody></table>";
      }
      h += '<em class="res' + (s.split ? " yes" : "") + '">' + esc(s.result) + "</em></li>";
    });
    h += "</ol>" + (tie.stillTied.some(function (x) { return x.length > 1; }) ? '<p class="sum warnmsg">' + esc(tie.summary) + "</p>" : '<p class="sum">' + esc(tie.summary) + "</p>");
    return h + "</article>";
  }
  V.standings = function (t) {
    var res = C.standingsFor(t), unit = C.sportInfo(t.sport).unit, us = C.teamKey(t.team), h = weStand(t, res), inTie = {};
    res.ties.forEach(function (x) { x.teams.forEach(function (n) { inTie[C.teamKey(n)] = x; }); });
    h += '<div class="sec-title"><h2>Pool standings</h2><button type="button" class="btn ghost small" data-act="rules-open" data-fk="rules">Rules</button></div>';
    if (res.warnings.length) h += res.warnings.map(function (w) { return '<p class="warnmsg">' + esc(w) + "</p>"; }).join("");
    if (!res.rows.length) return h + emptyBox("📊", "No pool games yet", "Add pool games on the Games tab. Teams appear here as soon as a game names them, and the table fills in as scores are entered.", '<button type="button" class="btn small" data-act="tab" data-tab="games">Go to Games</button>');
    var ranked = res.rows.filter(function (r) { return r.gp > 0; }), waiting = res.rows.filter(function (r) { return r.gp === 0; });
    if (ranked.length) {
      h += '<ol class="stand-list">' + ranked.map(function (r) {
        var tag = r.tied ? '<span class="tag warn">Still tied</span>' : inTie[r.key] ? '<span class="tag info">Tiebreaker</span>' : "";
        return '<li><button type="button" class="trow' + (r.key === us ? " us" : "") + '" data-act="team-open" data-team="' + esc(r.team) + '"><span class="rk">' + rankText(r) + '</span><span class="tm"><b>' + esc(r.team) + "</b>" + (r.key === us ? '<span class="tag">Us</span>' : "") + tag +
          '</span><span class="rc num">' + r.w + "-" + r.l + (r.t ? "-" + r.t : "") + '</span><span class="st">' + r.pctText + " · " + r.pf + " " + (unit === "runs" ? "runs" : "pts") + " for, " + r.pa + " against · diff " + signed(r.diff) + "</span></button></li>";
      }).join("") + "</ol>";
    } else h += '<p class="mute">No pool game has a final score yet. Enter scores on the Games tab and the order shows up here.</p>';
    if (waiting.length) h += '<p class="mute small waiting"><b>No finished games yet:</b> ' + waiting.map(function (r) { return esc(r.team); }).join(", ") + "</p>";
    var sub = res.counted + " finished pool " + (res.counted === 1 ? "game" : "games") + " counted" + (res.pending ? ", " + res.pending + " still to play" : "") + ".";
    h += '<p class="mute small">' + esc(sub) + " Tap a team to see its games or fix its name.</p>";
    res.ties.forEach(function (tie) { h += tieCard(t, tie); });
    h += '<article class="card"><div class="label">How teams are ranked</div><ol class="rules">' + C.explainRules(t.rules, t.sport).map(function (x) { return "<li><b>" + esc(x.name) + ".</b> " + esc(x.text) + "</li>"; }).join("") + "</ol>" +
      '<p class="mute small">When a step separates some of the tied teams, the steps start over for the teams still tied. Forfeits count as ' + t.rules.forfeitWin + " to 0.</p>" +
      '<button type="button" class="btn ghost small" data-act="rules-open">Change the rules</button></article>';
    return h;
  };

  /* ================= Bracket tab ================= */
  function matchHtml(t, m, tree, path, us) {
    var out = m.round < tree.rounds.length && m.idx % 2 === 1 ? '<i class="out" aria-hidden="true"></i>' : "";
    function side(p, win, score) {
      var nm = p.name || p.label, isUs = p.name && C.teamKey(p.name) === us;
      return '<span class="sd' + (win ? " win" : "") + (isUs ? " us" : "") + (p.name ? "" : " tbd") + '"><i>' + (p.seed || "") + "</i><b>" + esc(nm) + "</b><em>" + (score == null ? "" : score) + "</em></span>";
    }
    if (m.bye) {
      var real = m.a.absent ? m.b : m.a, isUs = real.name && C.teamKey(real.name) === us;
      return '<div class="mw"><div class="mt bye' + (path[m.slot] ? " path" : "") + '"><span class="mh">Bye</span><span class="sd' + (isUs ? " us" : "") + (real.name ? "" : " tbd") + '"><i>' + (real.seed || "") + "</i><b>" + esc(real.name || real.label) + "</b><em>advances</em></span></div>" + out + "</div>";
    }
    var g = m.game, when = g && g.date ? C.fmtDate(g.date, { weekday: "short" }) + (g.time ? " " + C.fmtTime(g.time) : "") + (g.field ? " · " + g.field : "") : "Not scheduled yet";
    var sc = m.state === "final" ? m.score : null, wa = m.winner && m.winner === m.a.name, wb = m.winner && m.winner === m.b.name;
    var label = m.title + ": " + (m.a.name || m.a.label) + " versus " + (m.b.name || m.b.label) + (m.state === "final" ? ". " + m.winner + " won" : "") + ". " + when;
    return '<div class="mw"><button type="button" class="mt' + (path[m.slot] ? " path" : "") + (m.state === "final" ? " final" : "") + '" data-act="match-open" data-slot="' + m.slot + '" aria-label="' + esc(label) + '"><span class="mh">' + esc(m.title) + '</span><span class="mh2">' + esc(when) + "</span>" +
      side(m.a, wa, sc ? sc.a : null) + side(m.b, wb, sc ? sc.b : null) + "</button>" + out + "</div>";
  }
  V.bracket = function (t) {
    var tree = C.bracketTree(t);
    if (!tree) {
      return emptyBox("🏆", "No bracket yet", "Pick 4, 6 or 8 teams. Seed it from the pool standings or type the seeds yourself. Tap a match to enter the score and the winner moves on.", '<button type="button" class="btn" data-act="bracket-setup" data-fk="bracket-setup">Set up the bracket</button>');
    }
    var us = C.teamKey(t.team), path = {}, h = "";
    C.ourPath(t).forEach(function (s) { path[s] = 1; });
    h += '<div class="sec-title"><h2>' + tree.size + "-team bracket</h2></div>" +
      '<div class="row wrap actions"><button type="button" class="btn small" data-act="bracket-seed" data-fk="bracket-seed">Seed from standings</button><button type="button" class="btn ghost small" data-act="bracket-setup" data-fk="bracket-setup">Seeds and size</button></div>';
    if (!t.bracket.seeds.some(Boolean)) h += '<p class="mute">Seeds are empty. Tap Seed from standings once pool games have scores, or type the seeds under Seeds and size.</p>';
    h += '<div class="br-wrap" tabindex="0" role="group" aria-label="Bracket. Scroll sideways to see every round."><div class="br s' + tree.size + '">';
    tree.rounds.forEach(function (rd) {
      h += '<div class="br-col"><h4>' + esc(rd.name) + (rd.matches.length > 1 && rd.name !== "Final" ? "s" : "") + '</h4><div class="br-body">' + rd.matches.map(function (m) { return matchHtml(t, m, tree, path, us); }).join("") + "</div></div>";
    });
    h += "</div></div>";
    if (Object.keys(path).length) h += '<p class="legend"><span class="sw"></span> Outlined matches are our path to the final.</p>';
    if (tree.champion) h += '<article class="card champ"><div class="label">Champion</div><div class="big num">' + esc(tree.champion) + "</div></article>";
    h += '<p class="mute small">Scroll the bracket sideways to see every round. Tap a match to set its time or enter the score. Fixing an earlier result clears the later games that depended on it, after asking you.</p>';
    return h;
  };

  /* ================= Pack tab ================= */
  V.pack = function (t) {
    var pr = C.packProgress(t.pack), pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0, edit = S.packEdit;
    var h = '<article class="card prog"><div class="row sp"><b class="pt">' + esc(pr.text) + '</b><span class="mute">' + pct + '%</span></div><div class="bar" role="progressbar" aria-label="Packed" aria-valuemin="0" aria-valuemax="' + pr.total + '" aria-valuenow="' + pr.done + '"><i style="width:' + pct + '%"></i></div></article>';
    h += '<div class="row wrap actions"><button type="button" class="btn ghost small" data-act="pack-uncheck" data-fk="pack-uncheck">Uncheck all</button><button type="button" class="btn ghost small" data-act="pack-edit" data-fk="pack-edit" aria-pressed="' + edit + '">' + (edit ? "Done editing" : "Edit list") + "</button></div>";
    if (!t.pack.length) h += emptyBox("🎒", "The list is empty", "Start from the " + C.sportInfo(t.sport).label.toLowerCase() + " template, or add your own items below.", '<button type="button" class="btn small" data-act="pack-template">Start from the template</button>');
    C.GROUPS.forEach(function (gr) {
      var items = t.pack.filter(function (p) { return p.group === gr; });
      if (!items.length) return;
      var done = items.filter(function (p) { return p.done; }).length;
      h += '<div class="sec-title sm"><h3>' + esc(gr) + "</h3><span class=\"sub\">" + done + "/" + items.length + '</span></div><ul class="plist">';
      items.forEach(function (p, i) {
        h += '<li class="pk' + (p.done ? " done" : "") + '"><label class="chk"><input type="checkbox" data-act="pack-toggle" data-id="' + esc(p.id) + '" data-fk="pk-' + esc(p.id) + '"' + (p.done ? " checked" : "") + '><span class="bx" aria-hidden="true"></span><span class="tx">' + esc(p.text) + "</span></label>";
        if (edit) h += '<span class="pk-ctl"><button type="button" class="icon-btn sm" data-act="pack-up" data-id="' + esc(p.id) + '" data-fk="pu-' + esc(p.id) + '" aria-label="Move ' + esc(p.text) + ' up"' + (i === 0 ? " disabled" : "") + ">" + I.up + '</button><button type="button" class="icon-btn sm" data-act="pack-down" data-id="' + esc(p.id) + '" data-fk="pd-' + esc(p.id) + '" aria-label="Move ' + esc(p.text) + ' down"' + (i === items.length - 1 ? " disabled" : "") + ">" + I.down + '</button><button type="button" class="icon-btn sm del" data-act="pack-del" data-id="' + esc(p.id) + '" aria-label="Delete ' + esc(p.text) + '">' + I.x + "</button></span>";
        h += "</li>";
      });
      h += "</ul>";
    });
    h += '<form class="addrow" data-form="pack-add"><label class="sr" for="pk-new">New item</label><input type="text" id="pk-new" maxlength="60" placeholder="Add an item" autocomplete="off"><label class="sr" for="pk-grp">Group</label><select id="pk-grp">' +
      C.GROUPS.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") + '</select><button type="submit" class="btn small">Add</button></form>';
    return h;
  };

  /* ================= Notes tab ================= */
  var NOTE_FIELDS = [["lodging", "Where we're staying", "Hotel name, address, confirmation number, check-in time"], ["food", "Food", "Places to eat, team dinner time, allergies to remember"], ["map", "Parking and maps", "Which lot, which gate, fields on the map"], ["other", "Other notes", "Anything else for the weekend"]];
  V.notes = function (t) {
    var h = "";
    NOTE_FIELDS.forEach(function (f) {
      h += '<div class="field"><label class="label" for="n-' + f[0] + '">' + esc(f[1]) + '</label><textarea id="n-' + f[0] + '" data-note="' + f[0] + '" maxlength="4000" rows="3" placeholder="' + esc(f[2]) + '">' + esc(t.notes[f[0]]) + "</textarea></div>";
    });
    var warm = S.settings.warm, ics = C.icsFor(t, { warm: warm });
    h += '<article class="card"><h3>Weekend summary</h3><p class="mute">Next game, our schedule and the pool standings as plain text, ready for the team chat.</p><label class="sr" for="summary">Weekend summary text</label><textarea id="summary" class="summary" rows="9" readonly>' + esc(C.summaryText(t, { warm: warm })) + '</textarea>' +
      '<div class="row wrap actions"><button type="button" class="btn small" data-act="copy-summary" data-fk="copy">Copy weekend summary</button>' + (navigator.share ? '<button type="button" class="btn ghost small" data-act="share-summary">Share...</button>' : "") + "</div></article>";
    h += '<article class="card"><h3>Add our games to your calendar</h3><p class="mute">Downloads a calendar file with our ' + (ics.count === 1 ? "1 game that is" : ics.count + " games that are") + " not played yet. Each one has \"arrive by\" in the notes and a reminder before it, " + (warm + 30) + ' minutes before the game.</p><button type="button" class="btn small" data-act="ics" data-fk="ics">Download calendar file</button></article>';
    return h;
  };
})();
