/* Walk-Up positions by inning: the lineup card. One row per player (the batting order, then the bench), one box per inning.
   Tap a box to pick where that player plays that inning (P, C, 1B ... RF, or Bench). "Copy inning 1 to all" fills the game
   from the first inning, and a chip above the grid warns about an inning with a position twice or a position nobody plays.
   The grid is saved with the team (S.st.def, cleaned in core.js) and goes to the watch's Lineup card through bridge.js. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, U = WU.U, S = WU.S, esc = U.esc, $ = U.$;
  var D = WU.def = {};

  /* everyone on the team, batting order first, then the bench */
  D.ids = function () { var st = S.st; return st.lineup.concat(C.benchIds(st.roster, st.lineup)).filter(function (id) { return !!WU.player(id); }); };
  function def() { if (!S.st.def) S.st.def = C.emptyDef(); return S.st.def; }
  function short(p) { return (p.num ? "#" + p.num + " " : "") + (p.name || "Player"); }

  function checksHTML(ids) {
    var all = C.defCheck(def(), ids);
    if (!all.some(function (x) { return !x.empty; })) return '<span class="chip">No positions yet</span>';
    return all.map(function (x) {
      var w = C.defWarn(x);
      return '<span class="chip ' + (x.empty ? "" : w ? "warn" : "ok") + '">Inning ' + (x.k + 1) + ": " + esc(x.empty ? "not set" : w || "all 9 set") + "</span>";
    }).join("");
  }
  function gridHTML(ids) {
    var d = def(), n = d.n, lu = S.st.lineup, checks = C.defCheck(d, ids), h = '<table class="defgrid"><thead><tr><th class="pl" scope="col">Player</th>';
    for (var k = 0; k < n; k++) h += '<th scope="col">' + (k + 1) + "</th>";
    h += "</tr></thead><tbody>";
    ids.forEach(function (id, r) {
      var p = WU.player(id);
      if (r === lu.length && r > 0) h += '<tr class="sep"><th class="pl" scope="rowgroup" colspan="' + (n + 1) + '">Not batting</th></tr>';
      h += '<tr><th class="pl" scope="row"><span class="ord">' + (r < lu.length ? r + 1 : "") + "</span>" + esc(short(p)) + "</th>";
      for (var k = 0; k < n; k++) {
        var pos = C.defGet(d, id, k), dup = pos && pos !== C.DEF_BENCH && checks[k].dupes.indexOf(pos) >= 0;
        h += '<td><button type="button" class="dcell' + (!pos ? " blank" : pos === C.DEF_BENCH ? " bench" : "") + (dup ? " dup" : "") + '" data-do="cell" data-id="' + id + '" data-k="' + k + '" aria-label="Inning ' + (k + 1) + ", " + esc(C.playerLabel(p)) + ": " + (pos || "not set") + (dup ? ", twice this inning" : "") + '">' + (pos ? esc(pos === C.DEF_BENCH ? "Sit" : pos) : "&ndash;") + "</button></td>";
      }
      h += "</tr>";
    });
    return h + "</tbody></table>";
  }

  WU.act["def-open"] = function () { D.open(); };
  D.open = function () {
    var off = null, api = U.openSheet({
      title: "Positions by inning", cls: "tall def",
      html: '<p class="msg">Tap a box to pick where a player plays that inning. The Lineup card on the watch shows who plays where.</p>' +
        '<div id="defN"></div><div class="row wrap"><button type="button" class="btn small" data-do="copy">Copy inning 1 to all</button><button type="button" class="btn ghost small" data-do="clear">Clear all</button></div>' +
        '<div class="defchecks" id="defChecks" role="status"></div><div class="defwrap" id="defGrid"></div>',
      footer: '<button type="button" class="btn" data-close>Done</button>',
      onClose: function () { if (off) off(); }
    });
    var el = api.el;
    function paint() {
      var ids = D.ids(), g = $("#defGrid", el), sx = g.scrollLeft;
      $("#defN", el).innerHTML = U.stepper({ key: "defn", label: "Innings in the game", value: def().n, min: 1, max: C.LIM.innings, step: 1 });
      $("#defChecks", el).innerHTML = checksHTML(ids);
      g.innerHTML = ids.length ? gridHTML(ids) : '<p class="mute">No players yet. Add players on the Team tab first.</p>';
      g.scrollLeft = sx;
    }
    paint();
    off = WU.on(function (what) { if (!api.closed && what === "data") paint(); });
    U.bindControls(el, function (key, mode, v) {
      if (key !== "defn") return;
      var d = def(), n = mode === "step" ? d.n + v : v;
      if (!isFinite(n)) { paint(); return; }
      n = C.clamp(Math.round(n), 1, C.LIM.innings);
      if (n !== d.n) { d.n = n; WU.commit("data"); U.live(n + " innings"); } else paint();
    });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-do]"); if (!b) return;
      var a = b.dataset.do, ids = D.ids();
      if (a === "cell") openPick(b.dataset.id, parseInt(b.dataset.k, 10));
      else if (a === "copy") {
        var go = function () { C.defCopyFirst(def(), ids); WU.commit("data"); U.toast("Inning 1 copied to every inning.", "ok"); };
        if (!ids.some(function (id) { return C.defGet(def(), id, 0); })) { U.toast("Set inning 1 first, then copy it.", "warn"); return; }
        if (C.defLaterUsed(def(), ids)) U.confirm({ title: "Copy inning 1 to all?", message: "Innings 2 to " + def().n + " already have positions. They will be replaced with inning 1.", confirmText: "Copy inning 1", onConfirm: go });
        else go();
      } else if (a === "clear") {
        if (!C.defUsed(def(), ids)) return;
        U.confirm({ title: "Clear every position?", message: "Every inning goes back to empty. The batting order doesn't change.", confirmText: "Clear all", danger: true, onConfirm: function () { def().pos = {}; WU.commit("data"); U.toast("Positions cleared.", "ok"); } });
      }
    });
    return api;
  };

  /* pick one player's position for one inning; each position shows who already has it that inning */
  function openPick(id, k) {
    var p = WU.player(id), d = def(); if (!p || !(k >= 0 && k < d.n)) return;
    var cur = C.defGet(d, id, k), inn = C.defInning(d, D.ids(), k);
    var btn = function (pos, label, sub, cls) {
      return '<button type="button" class="dp' + (pos === cur ? " on" : "") + (cls || "") + '" data-p="' + esc(pos) + '"' + (pos === cur ? ' aria-pressed="true"' : "") + "><b>" + esc(label) + "</b><small>" + esc(sub) + "</small></button>";
    };
    var h = C.DEF_POS.map(function (pos) {
      var who = inn.by[pos].filter(function (x) { return x !== id; }).map(WU.player).filter(Boolean);
      return btn(pos, pos, who.length ? short(who[0]) + (who.length > 1 ? " +" + (who.length - 1) : "") : "open", who.length ? " taken" : "");
    }).join("") + btn(C.DEF_BENCH, "Sit", "on the bench") + btn("", "Clear", "not set");
    var api = U.openSheet({
      title: "Inning " + (k + 1), cls: "defpicker",
      html: '<p class="msg">Where does <b>' + esc(short(p)) + "</b> play in inning " + (k + 1) + '?</p><div class="defpick">' + h + "</div>",
      footer: '<button type="button" class="btn ghost" data-close>Cancel</button>'
    });
    api.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]"); if (!b) return;
      C.defSet(def(), id, k, b.dataset.p);
      api.close();
      WU.commit("data");
      U.live(short(p) + ", inning " + (k + 1) + ": " + (b.dataset.p || "not set"));
    });
  }
})();
