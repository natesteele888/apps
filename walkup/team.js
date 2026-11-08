/* Walk-Up team: the roster (everyone), the batting order (the lineup) and the bench, plus the player sheet. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, E = WU.eng, U = WU.U, S = WU.S, esc = U.esc, $ = U.$, $$ = U.$$;
  var T = WU.team = {};

  /* ---------- little pieces ---------- */
  T.chip = function (p) { var s = WU.status(p); return '<span class="chip ' + WU.chipClass(s.code) + '">' + esc(s.text) + "</span>"; };
  T.nameHTML = function (p) {
    return (p.num ? '<b class="num jn">#' + esc(p.num) + "</b> " : "") + '<span class="nm">' + (p.name ? esc(p.name) : '<i class="mute">No name</i>') + "</span>" + (p.pos ? ' <em class="pos">' + esc(p.pos) + "</em>" : "");
  };
  T.sub = function (p) {
    var s = p.songId ? WU.song(p.songId) : null;
    return '<span class="meta">' + U.I.note + " " + esc(s ? s.title : p.songId ? "Song missing" : "No song") + '</span><span class="meta">' + U.I.mic + " " + esc(WU.voiceLabel(p)) + "</span>";
  };
  function lineupIdx(id) { return S.st.lineup.indexOf(id); }

  /* ---------- the Team tab ---------- */
  T.renderTab = function () {
    var st = S.st, n = st.lineup.length, bench = C.benchIds(st.roster, st.lineup).map(WU.player).filter(Boolean), h = "";
    if (!st.roster.length) {
      return '<div class="sec-title"><h2>Team</h2></div><div class="empty"><h3>No players yet</h3><p>Add players one at a time, paste a list, or start with a sample team.</p>' +
        '<div class="stack"><button type="button" class="btn block" data-act="sample">Add a sample lineup</button><button type="button" class="btn ghost block" data-act="add-player">Add a player</button><button type="button" class="btn ghost block" data-act="paste-list">Paste a list of players</button></div></div>';
    }
    h += '<div class="sec-title"><h2>Batting order</h2><span class="sub">' + n + (n === 1 ? " player" : " players") + "</span></div>";
    h += '<div class="row wrap tools"><button type="button" class="btn small" data-act="add-player">Add a player</button><button type="button" class="btn ghost small" data-act="paste-list">Paste a list</button></div>';
    if (!n) h += '<p class="mute pad">Nobody is in the batting order. Add players from the bench below.</p>';
    st.lineup.forEach(function (id, i) {
      var p = WU.player(id); if (!p) return;
      h += '<div class="prow" data-pid="' + p.id + '"><span class="ord num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<button type="button" class="pmain" data-act="edit-player" data-id="' + p.id + '" aria-label="Edit batter ' + (i + 1) + ", " + esc(C.playerLabel(p)) + '"><span class="pname">' + T.nameHTML(p) + '</span><span class="pchips">' + T.chip(p) + T.sub(p) + "</span></button>" +
        '<div class="pmv"><button type="button" class="icon-btn" data-act="mv-up" data-id="' + p.id + '" aria-label="Move ' + esc(C.playerLabel(p)) + ' up"' + (i === 0 ? " disabled" : "") + ">" + U.I.up + '</button><button type="button" class="icon-btn" data-act="mv-down" data-id="' + p.id + '" aria-label="Move ' + esc(C.playerLabel(p)) + ' down"' + (i === n - 1 ? " disabled" : "") + ">" + U.I.down + "</button></div>" +
        '<div class="pact"><button type="button" class="btn ghost small" data-act="to-bench" data-id="' + p.id + '">To the bench</button>' + (bench.length ? '<button type="button" class="btn ghost small" data-act="swap" data-id="' + p.id + '">Swap with a bench player</button>' : "") + "</div></div>";
    });
    h += '<div class="sec-title"><h2>Bench</h2><span class="sub">' + bench.length + "</span></div>";
    if (!bench.length) h += '<p class="mute pad">Everyone is in the batting order. Tap "To the bench" on a player to rest them.</p>';
    bench.forEach(function (p) {
      h += '<div class="prow bench" data-pid="' + p.id + '"><button type="button" class="pmain" data-act="edit-player" data-id="' + p.id + '" aria-label="Edit ' + esc(C.playerLabel(p)) + '"><span class="pname">' + T.nameHTML(p) + '</span><span class="pchips">' + T.chip(p) + T.sub(p) + "</span></button>" +
        '<div class="pact"><button type="button" class="btn small" data-act="to-lineup" data-id="' + p.id + '">Add to batting order</button></div></div>';
    });
    return h;
  };

  /* ---------- lineup moves ---------- */
  function setLineup(next, why) {
    var old = S.st.lineup, curId = old[S.st.batter];
    S.st.lineup = next;
    S.st.batter = C.reindexBatter(old, S.st.batter, next);
    if (curId !== next[S.st.batter]) E.stop(0.5);
    WU.commit("data");
    if (why) U.live(why);
  }
  WU.act["mv-up"] = WU.act["mv-down"] = function (el) {
    var id = el.dataset.id, i = lineupIdx(id), d = el.dataset.act === "mv-up" ? -1 : 1, p = WU.player(id);
    if (i < 0) return;
    var next = C.moveItem(S.st.lineup, i, d);
    setLineup(next, (p ? C.playerLabel(p) : "Player") + " is now batting number " + (next.indexOf(id) + 1) + ".");
    var b = $('[data-act="' + el.dataset.act + '"][data-id="' + id + '"]'); if (b && !b.disabled) b.focus(); else { var o = $('[data-act="' + (d < 0 ? "mv-down" : "mv-up") + '"][data-id="' + id + '"]'); if (o) o.focus(); }
  };
  WU.act["to-bench"] = function (el) { var p = WU.player(el.dataset.id); setLineup(C.toBench(S.st.lineup, el.dataset.id), (p ? C.playerLabel(p) : "Player") + " moved to the bench."); };
  WU.act["to-lineup"] = function (el) { var p = WU.player(el.dataset.id); setLineup(C.toLineup(S.st.lineup, el.dataset.id), (p ? C.playerLabel(p) : "Player") + " added to the batting order."); };
  WU.act["swap"] = function (el) { T.openSwap(el.dataset.id); };
  T.openSwap = function (id) {
    var out = WU.player(id), i = lineupIdx(id); if (!out || i < 0) return;
    var bench = C.benchIds(S.st.roster, S.st.lineup).map(WU.player).filter(Boolean);
    var api = U.openSheet({
      title: "Swap " + (out.name || "player"), cls: "swap",
      html: '<p class="msg">Batting number ' + (i + 1) + " goes to the player you pick. " + esc(C.playerLabel(out)) + " goes to the bench.</p><div class=\"card slist\">" + bench.map(function (p) {
        return '<div class="srow"><div class="smain"><b>' + T.nameHTML(p) + "</b><small>" + esc(WU.status(p).text) + '</small></div><button type="button" class="btn small" data-do="in" data-id="' + p.id + '">Swap in</button></div>';
      }).join("") + "</div>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button>'
    });
    api.el.addEventListener("click", function (e) {
      var b = e.target.closest('[data-do="in"]'); if (!b) return;
      var inP = WU.player(b.dataset.id); api.close();
      setLineup(C.swapBench(S.st.lineup, lineupIdx(id), b.dataset.id), (inP ? C.playerLabel(inP) : "Player") + " swapped in for " + C.playerLabel(out) + ".");
    });
  };

  /* ---------- adding players ---------- */
  WU.act["add-player"] = function () {
    if (S.st.roster.length >= C.LIM.roster) { U.toast("The team is full (" + C.LIM.roster + " players).", "error"); return; }
    var p = C.newPlayer({});
    S.st.roster.push(p); S.st.lineup.push(p.id);
    WU.commit("data");
    T.openPlayer(p.id, true);
  };
  WU.act["paste-list"] = function () { T.openPaste(); };
  T.openPaste = function () {
    var room = C.LIM.roster - S.st.roster.length;
    if (room <= 0) { U.toast("The team is full (" + C.LIM.roster + " players).", "error"); return; }
    var api = U.openSheet({
      title: "Paste a list", autofocus: "#pasteTx",
      html: '<p class="msg">One player on each line. Any of these work:</p><p class="mute small-note">7 Player Seven<br>#12, Player Twelve<br>Player Three 3</p>' +
        '<label class="field"><span class="label">Your list</span><textarea id="pasteTx" rows="8" spellcheck="false" autocomplete="off" aria-describedby="pasteInfo"></textarea></label><p class="mute" id="pasteInfo" role="status">Nothing yet.</p>' +
        '<label class="chk"><input type="checkbox" id="pasteLu" checked> <span>Put them in the batting order (in this order)</span></label>',
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" id="pasteGo" disabled>Add players</button>'
    });
    var el = api.el, tx = $("#pasteTx", el), info = $("#pasteInfo", el), go = $("#pasteGo", el), res = null;
    function parse() {
      res = C.parsePasted(tx.value, room);
      var n = res.players.length;
      go.disabled = !n; go.textContent = n ? "Add " + n + (n === 1 ? " player" : " players") : "Add players";
      info.textContent = !tx.value.trim() ? "Nothing yet." : n ? n + (n === 1 ? " player found: " : " players found: ") + res.players.slice(0, 4).map(function (p) { return (p.num ? "#" + p.num + " " : "") + (p.name || "(no name)"); }).join(", ") + (n > 4 ? " and " + (n - 4) + " more." : ".") + (res.capped ? " The team holds up to " + C.LIM.roster + " players, so the rest were left out." : "") : "No players found. Put one player on each line.";
    }
    tx.addEventListener("input", parse);
    go.addEventListener("click", function () {
      if (!res || !res.players.length) return;
      var inLu = $("#pasteLu", el).checked;
      res.players.forEach(function (x) { var p = C.newPlayer(x); S.st.roster.push(p); if (inLu) S.st.lineup.push(p.id); });
      var n = res.players.length;
      api.close(); WU.commit("data"); U.toast("Added " + n + (n === 1 ? " player." : " players."), "ok");
    });
  };

  /* ---------- the player sheet ---------- */
  WU.act["edit-player"] = function (el) { T.openPlayer(el.dataset.id); };
  T.openPlayer = function (pid, isNew) {
    var pl = WU.player(pid); if (!pl) return null;
    var off = null, api = U.openSheet({
      title: isNew ? "New player" : "Player", cls: "player tall", autofocus: isNew ? "#plName" : null,
      html: '<div class="cols3"><label class="field name"><span class="label">Name</span><input type="text" id="plName" maxlength="' + C.LIM.name + '" autocomplete="off" autocapitalize="words" value="' + esc(pl.name) + '" placeholder="Player name"></label>' +
        '<label class="field"><span class="label">Number</span><input type="text" id="plNum" maxlength="' + C.LIM.num + '" autocomplete="off" value="' + esc(pl.num) + '" placeholder="7"></label>' +
        '<label class="field"><span class="label">Position</span><input type="text" id="plPos" maxlength="' + C.LIM.pos + '" autocomplete="off" value="' + esc(pl.pos) + '" placeholder="SS"></label></div><div id="plCards"></div>',
      footer: '<button type="button" class="btn danger" data-do="delete">Delete player</button><button type="button" class="btn" data-close>Done</button>',
      onClose: function () {
        if (off) off();
        var p = WU.player(pid);
        if (p && isNew && !p.name && !p.num && !p.pos && !p.songId && !p.voice) {
          S.st.roster = S.st.roster.filter(function (x) { return x.id !== pid; }); S.st.lineup = C.toBench(S.st.lineup, pid); S.st.batter = C.clamp(S.st.batter, 0, Math.max(0, S.st.lineup.length - 1));
        }
        WU.commit("data");
        if (WU.warm) WU.warm();
      }
    });
    var el = api.el, q = function (s) { return $(s, el); };
    function paintCards() {
      var p = WU.player(pid); if (!p) return;
      var s = p.songId ? WU.song(p.songId) : null, stt = WU.status(p), inLu = lineupIdx(pid) >= 0, plan = E.planFor(p, S.st);
      var vtxt = !p.voice ? "No voice yet. Record the announcement, or use a voice file." : p.voice.kind === "tts" ? "Computer voice: your phone reads \"" + C.announceText(p) + "\"." : (p.voice.kind === "rec" ? "Recorded voice" : "Voice file") + " · " + C.fmtSecs(Math.max(0, p.voice.te - p.voice.ts)) + (stt.code === "needs-voice" ? " · the file isn't on this phone" : "");
      var stxt = !p.songId ? "No song yet. Choose one from your saved songs." : !s ? "The saved song is missing." : s.title + " · " + C.fmtClock(s.dur) + (stt.code === "needs-song" ? " · the file isn't on this phone" : "");
      q("#plCards").innerHTML =
        '<div class="row sp statusrow"><span class="label">Status</span>' + T.chip(p) + "</div>" +
        '<section class="card"><div class="row sp"><h3>Voice</h3>' + (p.voice ? '<span class="chip ' + (p.voice.kind === "tts" ? "warn" : "ok") + '">' + (p.voice.kind === "tts" ? "Second choice" : "Recorded") + "</span>" : "") + '</div><p class="msg" id="plVoiceTx">' + esc(vtxt) + '</p><div class="row wrap"><button type="button" class="btn' + (p.voice ? " ghost" : "") + '" data-do="voice">' + U.I.mic + " " + (p.voice ? "Voice and polish" : "Record the announcement") + "</button></div></section>" +
        '<section class="card"><h3>Song</h3><p class="msg" id="plSongTx">' + esc(stxt) + '</p><div class="row wrap"><button type="button" class="btn" data-do="song">' + U.I.note + " Change song</button>" + (s ? '<button type="button" class="btn ghost" data-do="ptrim">Trim for ' + esc(p.name || "this player") + "</button>" : "") + "</div></section>" +
        '<section class="card"><h3>Mix</h3><div class="tlwrap static" id="plTl">' + WU.timeline(plan, { label: WU.timelineLabel(p, plan) }) + '</div><p class="mute small-note" id="plMixTx">' + esc(WU.mixSummary(p)) + '</p><div class="row wrap"><button type="button" class="btn" data-do="mix">Open the mixer</button></div></section>' +
        '<section class="card"><h3>Batting order</h3><p class="msg">' + (inLu ? "Batting number " + (lineupIdx(pid) + 1) + "." : "On the bench.") + '</p><button type="button" class="btn ghost" data-do="bench">' + (inLu ? "Move to the bench" : "Add to the batting order") + "</button></section>";
    }
    paintCards();
    off = WU.on(function (what) { if (!api.closed && what === "data") paintCards(); });
    function field(id, key, max) { q(id).addEventListener("input", function (e) { pl[key] = C.str(e.target.value, max); WU.save(); api.setTitle(pl.name || "Player"); var t = q("#plVoiceTx"); if (t && pl.voice && pl.voice.kind === "tts") t.textContent = "Computer voice: your phone reads \"" + C.announceText(pl) + "\"."; }); }
    field("#plName", "name", C.LIM.name); field("#plNum", "num", C.LIM.num); field("#plPos", "pos", C.LIM.pos);
    if (pl.name) api.setTitle(pl.name);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      var a = b.dataset.do;
      if (a === "voice") V_open();
      else if (a === "song") WU.songs.openPicker(pid);
      else if (a === "ptrim") WU.songs.openPlayerTrim(pl);
      else if (a === "mix") WU.openMix(pid);
      else if (a === "bench") { setLineup(lineupIdx(pid) >= 0 ? C.toBench(S.st.lineup, pid) : C.toLineup(S.st.lineup, pid)); }
      else if (a === "delete") {
        U.confirm({ title: "Delete this player?", message: (pl.name || "This player") + " will be removed from the team, and so will their voice recording.", more: ["Songs in your library are not deleted."], confirmText: "Delete player", danger: true, onConfirm: function () {
          var old = S.st.lineup, cur = old[S.st.batter];
          if (pl.voice && pl.voice.kind !== "tts") WU.dropAudio("v:" + pl.voice.id);
          S.st.roster = S.st.roster.filter(function (x) { return x.id !== pid; });
          S.st.lineup = C.toBench(old, pid); S.st.batter = C.reindexBatter(old, S.st.batter, S.st.lineup);
          if (cur === pid) E.stop(0.2);
          api.close(); WU.commit("data"); U.toast("Player deleted.", "ok");
        } });
      }
    });
    function V_open() { WU.voice.open(pid); }
    return api;
  };
})();
