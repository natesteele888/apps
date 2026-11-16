/* Walk-Up Field mode core: pure logic for the tablet at the field, no page and no audio, so node tests can run it.
   Loaded in the browser as window.FieldCore and by node tests (module.exports). Needs Walk-Up's core (WalkupCore) for players.
   Owns: the tablet's 6-letter code, game times, which of today's Ballclub games are at this field (two Lunenburg teams playing
   each other become one game with both lineups), which saved lineup a game uses, finding a player's walk-up song in the
   tablet's song library by name, and turning a team into a Walk-Up batting order with a voice and a song for everyone.
   Data shapes are LYBS Ballclub's (natesteele888/lybs-ballclub): schedule games {id, opponent, date, gameTime, homeAway,
   location, status}, roster [{id, name, number}], lineups [{id, name, date, slots:[{playerId, name, position}]}] newest
   first, walkupSongs {playerId: {song, start}}. Nothing here keeps or sends anything. */
(function (root) {
  "use strict";

  /* Lunenburg's home fields, the same ones Ballclub's data/league-info.json lists; used when that file can't be read. */
  var FIELDS = ["Fitzgerald Field", "McNally Park", "Powell Field"];
  var CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread across a press box
  var PRELOAD_MIN = 60;

  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : isObj(x) ? Object.keys(x).map(function (k) { return x[k]; }).filter(Boolean) : []; }
  function str(x, max) { return typeof x === "string" || typeof x === "number" ? String(x).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80) : ""; }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- the tablet's code ---------- */
  function hash32(s, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* 6 letters a board member matches by eye (Ballclub's rules take /^[A-Z0-9]{6}$/) */
  function deviceCode(uid) {
    var s = String(uid || ""), a = hash32(s, 2166136261), b = hash32(s, 0x9747b28c), out = "";
    for (var i = 0; i < 6; i++) { var v = i < 3 ? (a >>> (i * 5)) : (b >>> ((i - 3) * 5)); out += CODE_ABC[v & 31]; }
    return out;
  }

  /* ---------- times ---------- */
  /* "6:00 PM", "6 pm", "18:00" -> minutes after midnight. A bare 1-7 o'clock is an evening game. */
  function parseTime(s) {
    var m = String(s == null ? "" : s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/);
    if (!m) return null;
    var h = +m[1], min = m[2] ? +m[2] : 0;
    if (h > 23 || min > 59) return null;
    if (m[3] === "p" && h < 12) h += 12;
    else if (m[3] === "a" && h === 12) h = 0;
    else if (!m[3] && h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  }
  function fmtTime(min) {
    if (min == null || !isFinite(min)) return "";
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return ((h % 12) || 12) + ":" + pad(m) + " " + (h < 12 ? "AM" : "PM");
  }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function minutesOf(d) { return d.getHours() * 60 + d.getMinutes(); }

  /* ---------- fields ---------- */
  function homeFields(info) {
    var list = isObj(info) ? arr(info.facilities) : [];
    var names = list.filter(function (f) { return isObj(f) && f.home === true && /lunenburg/i.test(String(f.town || "")); })
      .map(function (f) { return str(f.name, 60); }).filter(Boolean);
    return names.length ? names : FIELDS.slice();
  }
  /* "Fitzgerald Field" -> "fitzgerald": the word a coach is sure to type in the game's location */
  function fieldKey(name) {
    var w = norm(name).split(" ").filter(function (x) { return x && !/^(field|fields|park|the|at|lunenburg|ballfield|diamond|complex)$/.test(x); });
    return w[0] || norm(name);
  }
  function atField(location, field) {
    if (!field) return true;
    var k = fieldKey(field), loc = " " + norm(location) + " ";
    return !!k && loc.indexOf(" " + k + " ") >= 0;
  }

  /* ---------- today's games at this field ---------- */
  function teamWords(t) { return [norm(t.shortName), norm(String(t.name || "").replace(/lunenburg/ig, "").replace(/\(.*?\)/g, ""))].filter(Boolean); }
  function isTeam(opponent, t) {
    var o = norm(opponent);
    if (!o) return false;
    return teamWords(t).some(function (w) { return w && (o === w || (" " + o + " ").indexOf(" " + w + " ") >= 0); });
  }
  function off(g) { return /cancel|postpone/i.test(String(g.status || "")); }
  /* teams: [{teamId, name, shortName, schedule}]. field: a field name, or "" for every Lunenburg game today.
     Each game: {key, date, time, timeLabel, location, sides: [away, home]}; a side is {teamId, name} for a Lunenburg team or
     {visitor: true, name} for the other town. Games called off are left out. */
  function gamesAt(teams, date, field) {
    var items = [];
    arr(teams).forEach(function (t) {
      if (!isObj(t) || !t.teamId) return;
      arr(t.schedule).forEach(function (g) {
        if (!isObj(g) || g.date !== date || off(g)) return;
        if (field && !atField(g.location, field)) return;
        items.push({ t: t, g: g, time: parseTime(g.gameTime) });
      });
    });
    var used = [], games = [];
    items.forEach(function (a, i) {
      if (used[i]) return;
      used[i] = true;
      var b = null;
      for (var j = i + 1; j < items.length; j++) {
        var c = items[j];
        if (used[j] || c.t.teamId === a.t.teamId) continue;
        var close = a.time == null || c.time == null || Math.abs(a.time - c.time) <= 30;
        if (close && (isTeam(a.g.opponent, c.t) || isTeam(c.g.opponent, a.t))) { b = c; used[j] = true; break; }
      }
      var us = { teamId: a.t.teamId, name: str(a.t.shortName || a.t.name, 40) || a.t.teamId };
      var them = b ? { teamId: b.t.teamId, name: str(b.t.shortName || b.t.name, 40) || b.t.teamId } : { visitor: true, name: str(a.g.opponent, 40) || "Visitors" };
      var weHome = String(a.g.homeAway || "").toLowerCase() !== "away";
      var time = a.time != null ? a.time : b ? b.time : null;
      games.push({
        key: date + "|" + a.t.teamId + "|" + str(a.g.id || i, 40), date: date, time: time,
        timeLabel: time != null ? fmtTime(time) : str(a.g.gameTime, 20) || "Time not set",
        location: str(a.g.location || (b && b.g.location), 80), sides: weHome ? [them, us] : [us, them]
      });
    });
    games.sort(function (x, y) { return (x.time == null ? 1e4 : x.time) - (y.time == null ? 1e4 : y.time); });
    return games;
  }

  /* ---------- lineups ---------- */
  /* The lineup a coach saved for that day, else their newest one, flagged so the screen can say so. Ballclub keeps newest first. */
  function pickLineup(lineups, date) {
    var list = arr(lineups).filter(function (l) { return isObj(l) && arr(l.slots).length; });
    for (var i = 0; i < list.length; i++) if (list[i].date === date) return { lineup: list[i], exact: true };
    var dated = list.filter(function (l) { return typeof l.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.date < date; })
      .sort(function (x, y) { return x.date < y.date ? 1 : -1; });
    var best = dated[0] || list.filter(function (l) { return !l.date; })[0] || null;
    return best ? { lineup: best, exact: false } : null;
  }
  /* batting order rows {pid, name, num}: the lineup's (bench left out), or the roster by number when there's no lineup */
  function orderRows(roster, lineup) {
    var r = arr(roster).filter(isObj), byId = Object.create(null), byName = Object.create(null);
    r.forEach(function (p) { if (p.id != null) byId[String(p.id)] = p; if (p.name) byName[norm(p.name)] = p; });
    var rows = [];
    if (lineup) {
      arr(lineup.slots).forEach(function (s) {
        if (!isObj(s) || /^bench$/i.test(String(s.position || ""))) return;
        var p = (s.playerId != null && byId[String(s.playerId)]) || byName[norm(s.name)] || null;
        var name = str((p && p.name) || s.name, 40);
        if (name) rows.push({ pid: p && p.id != null ? String(p.id) : "", name: name, num: str(p ? p.number : "", 4) });
      });
    } else {
      r.slice().sort(function (a, b) { return (Number(a.number) || 999) - (Number(b.number) || 999); })
        .forEach(function (p) { var name = str(p.name, 40); if (name) rows.push({ pid: p.id != null ? String(p.id) : "", name: name, num: str(p.number, 4) }); });
    }
    return rows.slice(0, 40);
  }

  /* ---------- songs ---------- */
  /* the library song a coach's pick names: same name, one name inside the other, or most of the pick's words */
  function songMatch(pick, songs) {
    var want = norm(pick);
    if (!want) return null;
    var list = arr(songs).filter(function (s) { return isObj(s) && s.id && s.kind === "file" && !s.intro; }), hit = null, best = 0;
    var ww = want.split(" ").filter(function (w) { return w.length > 1; });
    list.forEach(function (s) {
      var t = norm(s.title || s.name), tw = t.split(" "), score = 0;
      if (!t) return;
      if (t === want) score = 100;
      else if ((" " + t + " ").indexOf(" " + want + " ") >= 0 || (" " + want + " ").indexOf(" " + t + " ") >= 0) score = 50 + Math.min(t.length, want.length) / 10;
      else if (ww.length) {
        var n = ww.filter(function (w) { return tw.indexOf(w) >= 0; }).length;
        if (n / ww.length >= 0.67 && n >= 2) score = 10 + n;
      }
      if (score > best) { best = score; hit = s; }
    });
    return hit ? hit.id : null;
  }

  /* ---------- one team's batting order, ready to play ---------- */
  /* o: {side: "a"|"b", rows, picks, songs, settings, voice}. Returns {st, rep, picked, unmatched}: st is a Walk-Up state
     (roster in batting order, every player with the computer voice and a song: their coach's pick when the tablet has it,
     else a song named for them, else one shared from the library, else a built-in sound). Names are announced by first name. */
  function buildSide(C, o) {
    o = o || {};
    var songs = arr(o.songs), picks = isObj(o.picks) ? o.picks : {}, rows = arr(o.rows), picked = 0, unmatched = [];
    var st = C.emptyState();
    st.songs = songs;
    if (isObj(o.settings)) st.settings = o.settings;
    st.roster = rows.map(function (r, i) {
      var p = C.newPlayer({ id: "f" + (o.side || "a") + "-" + i, name: r.name, num: r.num });
      p.full = r.name; p.pid = r.pid || "";
      var pk = r.pid && isObj(picks[r.pid]) ? picks[r.pid] : null;
      if (pk && pk.song) {
        var sid = songMatch(pk.song, songs), song = sid ? C.songById(songs, sid) : null;
        if (song) {
          p.songId = sid; picked++;
          var start = Number(pk.start);
          if (isFinite(start) && start > 0) p.trim = { start: Math.min(start, Math.max(0, (song.dur || 0) - 1)), len: song.len, fade: song.fade };
        } else unmatched.push({ name: r.name, song: str(pk.song, 120) });
      }
      return p;
    });
    st.lineup = st.roster.map(function (p) { return p.id; });
    var rep = C.fillLineup(st, { voice: o.voice !== false });
    st.roster.forEach(function (p) { p.name = C.firstWord(p.full) || p.full; });
    return { st: st, rep: rep, picked: picked, unmatched: unmatched };
  }

  /* ---------- the order set at the tablet ---------- */
  /* a row's lasting key: its Ballclub player id, else its name (a lineup slot for someone not on the roster) */
  function rowKey(r) { return r && r.pid ? "p:" + r.pid : "n:" + norm(r && r.name); }
  /* saved: {order: [keys], out: [keys]} from the tablet. Rows in the saved order, players marked not here left out, and
     anyone new since (added to the roster) at the end, in the coach's order. */
  function applyOrder(rows, saved) {
    rows = arr(rows);
    if (!isObj(saved)) return rows.slice();
    var by = Object.create(null), out = Object.create(null), res = [];
    rows.forEach(function (r) { by[rowKey(r)] = r; });
    arr(saved.out).forEach(function (k) { out[k] = 1; });
    arr(saved.order).forEach(function (k) { if (by[k] && !out[k]) { res.push(by[k]); delete by[k]; } });
    rows.forEach(function (r) { var k = rowKey(r); if (by[k] && !out[k]) { res.push(r); delete by[k]; } });
    return res;
  }
  /* jersey numbers typed at the tablet for the other town: "7, 12 #3" -> ["7", "12", "3"] */
  function parseNums(text) {
    return String(text == null ? "" : text).split(/[\s,;\/]+/).map(function (x) { return x.replace(/^#/, "").replace(/[^0-9]/g, "").slice(0, 3); })
      .filter(Boolean).slice(0, 40);
  }
  /* the other town's batters: numbers only, announced "Now batting, number 7" */
  function visitorRows(nums) {
    return arr(nums).map(function (n) { return String(n).replace(/[^0-9]/g, "").slice(0, 3); }).filter(Boolean)
      .map(function (n, i) { return { pid: "", vis: i, name: "", num: n }; });
  }

  /* when a game's lineups should be loaded and kept fresh: from an hour before until it starts, then they hold still */
  function loadWindow(game, nowMin) {
    if (!game || game.time == null) return "open";
    if (nowMin < game.time - PRELOAD_MIN) return "early";
    if (nowMin < game.time) return "open";
    return "started";
  }

  var api = {
    FIELDS: FIELDS, PRELOAD_MIN: PRELOAD_MIN, arr: arr, norm: norm, deviceCode: deviceCode, parseTime: parseTime, fmtTime: fmtTime, ymd: ymd,
    minutesOf: minutesOf, homeFields: homeFields, fieldKey: fieldKey, atField: atField, isTeam: isTeam, gamesAt: gamesAt,
    pickLineup: pickLineup, orderRows: orderRows, songMatch: songMatch, buildSide: buildSide, loadWindow: loadWindow,
    rowKey: rowKey, applyOrder: applyOrder, parseNums: parseNums, visitorRows: visitorRows
  };
  root.FieldCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
