/* Walk-Up, one tap: bring in a LYBS Ballclub lineup and give every batter a voice and a song in one go.
   "Get lineup ready" keeps every song and voice a coach already chose. For the rest: a song named for the player
   ("Jordan - Artist - Song") goes to that player, the other library songs are shared out, and anyone without a voice
   gets the announcer voice. The coach then swaps any song from the list it shows.
   Ballclub's lineups are read from the copies Ballclub itself keeps on this phone (same site), never from the network.
   Nothing here leaves the phone. Pure logic lives in core.js (fillLineup, clubRows, applyRows). */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, U = WU.U, S = WU.S, esc = U.esc, $ = U.$;
  var R = WU.ready = {};

  /* ---------- LYBS Ballclub's saved lineups on this phone ---------- */
  function arr(x) { return Array.isArray(x) ? x : x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []; }
  function niceDate(d) { try { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; } catch (e) { return ""; } }
  /* { team, lineups: [{ id, name, date, rows }] } newest first, or null when this phone has none */
  R.club = function () {
    try {
      var a = JSON.parse(localStorage.getItem("lybsAuthedTeam") || "null"), g = JSON.parse(localStorage.getItem("lybsGateSession") || "null");
      var team = (a && a.teamId) || (g && g.teamId);
      if (typeof team !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(team)) return null;
      var copy = function (k) { var s = localStorage.getItem("lybsOfflineCopy:teams/" + team + "/" + k); return s ? JSON.parse(s) : null; };
      var roster = arr(copy("roster")), list = arr(copy("lineups")).map(function (l, i) {
        if (!l || typeof l !== "object") return null;
        var rows = C.clubRows(l, roster);
        return rows.length ? { id: String(l.id || i), name: C.str(l.name, 60) || "Lineup", date: typeof l.date === "string" ? l.date : "", rows: rows } : null;
      }).filter(Boolean);
      list.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
      return list.length ? { team: team, lineups: list } : null;
    } catch (e) { return null; }
  };

  /* ---------- the one tap ---------- */
  function summary(rep) {
    var out = [];
    if (rep.matched) out.push(rep.matched + (rep.matched === 1 ? " got the song named for them" : " got the songs named for them"));
    if (rep.picked) out.push(rep.picked + " got a song from your library");
    if (rep.sounds) out.push(rep.sounds + " got a built-in sound for now");
    if (rep.kept) out.push(rep.kept + " kept the song you chose");
    if (rep.said) out.push(rep.said + (rep.said === 1 ? " has a clip that says their name, so the announcer stays quiet" : " have clips that say their names, so the announcer stays quiet"));
    return out;
  }
  R.fill = function (note) {
    if (!S.st.roster.length) { U.toast("Add your players first.", "warn"); return; }
    var rep = C.fillLineup(S.st, { voice: WU.eng.speech.supported() });
    WU.commit("data");
    R.showResult(rep, note);
    return rep;
  };
  WU.act["fill-lineup"] = function () { R.fill(); };

  /* the batting order with each player's song, so the coach can swap any of them */
  R.showResult = function (rep, note) {
    var off, api = U.openSheet({
      title: "Lineup ready", cls: "ready",
      html: '<div id="rdTop"></div><div class="card slist" id="rdList"></div>',
      footer: '<button type="button" class="btn ghost" data-close>Done</button><button type="button" class="btn" data-do="game">Go to Game</button>',
      onClose: function () { if (off) off(); }
    });
    var el = api.el, lines = summary(rep);
    function paint() {
      var n = S.st.lineup.length;
      $("#rdTop", el).innerHTML = (note ? '<p class="msg">' + esc(note) + "</p>" : "") +
        '<p class="msg"><b>' + n + (n === 1 ? " batter is" : " batters are") + " ready to go.</b>" + (lines.length ? " " + esc(lines.join(", ")) + "." : "") + "</p>" +
        (rep.voiced ? '<p class="mute small-note">' + rep.voiced + (rep.voiced === 1 ? " player" : " players") + " got the announcer voice. Record a voice any time to replace it.</p>" : "") +
        (rep.sounds ? '<p class="mute small-note">Add songs on the Songs tab, then tap Get lineup ready again to swap the built-in sounds for music.</p>' : "") +
        '<p class="mute small-note">Tap Change to pick a different song for anyone.</p>';
      $("#rdList", el).innerHTML = S.st.lineup.map(function (id, i) {
        var p = WU.player(id); if (!p) return "";
        var s = p.songId ? WU.song(p.songId) : null;
        return '<div class="srow"><div class="smain"><b>' + (i + 1) + ". " + WU.team.nameHTML(p) + "</b><small>" + U.I.note + " " + esc(s ? s.title : "No song") + (s && s.intro ? " · says the name" : "") + '</small></div><button type="button" class="btn ghost small" data-do="song" data-id="' + p.id + '" aria-label="Change song for ' + esc(C.playerLabel(p)) + '">Change</button></div>';
      }).join("");
    }
    paint();
    off = WU.on(function (what) { if (!api.closed && what !== "audio") paint(); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      if (b.dataset.do === "song") WU.songs.openPicker(b.dataset.id);
      else if (b.dataset.do === "game") { api.close(); WU.act.tab({ dataset: { tab: "game" } }); }
    });
    return api;
  };

  /* ---------- pick a Ballclub lineup ---------- */
  R.openClub = function () {
    var c = R.club();
    if (!c) { U.toast("No Ballclub lineup on this phone yet. Open your lineup in Ballclub once, then come back.", "warn", 6000); return; }
    var api = U.openSheet({
      title: "Lineups from Ballclub", cls: "club",
      html: '<p class="msg">Pick a lineup. Players already in Walk-Up keep their songs and voices; new names are added. Everyone else sits on the bench.</p>' +
        '<div class="card slist">' + c.lineups.map(function (l, i) {
          var d = niceDate(l.date);
          return '<div class="srow"><div class="smain"><b>' + esc(l.name) + "</b><small>" + (d ? esc(d) + " · " : "") + l.rows.length + (l.rows.length === 1 ? " batter" : " batters") + '</small></div><button type="button" class="btn small" data-do="use" data-i="' + i + '">Use</button></div>';
        }).join("") + "</div>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button>'
    });
    api.el.addEventListener("click", function (e) {
      var b = e.target.closest('[data-do="use"]'); if (!b) return;
      var l = c.lineups[parseInt(b.dataset.i, 10)]; if (!l) return;
      api.close();
      var r = C.applyRows(S.st, l.rows);
      var note = "Brought in \"" + l.name + "\" from Ballclub" + (r.added ? ", with " + r.added + (r.added === 1 ? " new player" : " new players") : "") + "." + (r.full ? " The team was full, so some names were left out." : "");
      R.fill(note);
    });
  };
  WU.act["club-lineup"] = function () { R.openClub(); };
})();
