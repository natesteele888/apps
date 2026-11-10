/* Gameday Picks stats: the pure parts behind the Standings tab and the scouting card (ESPN addresses; reading standings,
   scoreboards and team schedules; top players; last 5 and head-to-head; the playoff picture).
   No DOM, no network. Loaded in the page as window.GPStats and in Node (tests) with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GPStats = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // fmt: which record columns a league uses. ot = overtime losses (NHL), ties (NFL).
  // playoffs: how many teams per conference/league get in, and who skips the first round.
  const SPORTS = {
    nfl: { id: "nfl", name: "NFL", path: "football/nfl", emoji: "🏈", weekly: true, ties: true, seeds: 7, byes: 1, playIn: false, unit: "conference" },
    mlb: { id: "mlb", name: "MLB", path: "baseball/mlb", emoji: "⚾", weekly: false, seeds: 6, byes: 2, playIn: false, unit: "league" },
    nba: { id: "nba", name: "NBA", path: "basketball/nba", emoji: "🏀", weekly: false, seeds: 8, byes: 0, playIn: true, unit: "conference" },
    nhl: { id: "nhl", name: "NHL", path: "hockey/nhl", emoji: "🏒", weekly: false, ot: true, seeds: 8, byes: 0, playIn: false, unit: "conference" }
  };
  const ORDER = ["nfl", "nba", "nhl", "mlb"];
  const sport = id => SPORTS[id] || SPORTS.nfl;
  const SITE = "https://site.api.espn.com/apis/site/v2/sports/";
  const url = {
    scoreboard: (id, q) => SITE + sport(id).path + "/scoreboard" + (q ? "?" + q : ""),
    day: (id, day) => SITE + sport(id).path + "/scoreboard?dates=" + day.replace(/-/g, ""),
    week: (year, type, week) => SITE + "football/nfl/scoreboard?year=" + year + "&seasontype=" + type + "&week=" + week,
    standings: id => "https://site.api.espn.com/apis/v2/sports/" + sport(id).path + "/standings",
    roster: (id, team) => SITE + sport(id).path + "/teams/" + encodeURIComponent(team) + "/roster",
    // the season's team leaders (core API; type 2 = regular season). Athletes come back as links only, so names come from the roster.
    leaders: (id, team, year) => "https://sports.core.api.espn.com/v2/sports/" + sport(id).path.replace("/", "/leagues/") + "/seasons/" + year + "/types/2/teams/" + encodeURIComponent(team) + "/leaders",
    schedule: (id, team, season) => SITE + sport(id).path + "/teams/" + encodeURIComponent(team) + "/schedule" + (season ? "?season=" + season : "")
  };

  /* ---------- small helpers ---------- */
  const num = v => (v == null || v === "" || isNaN(+v) ? null : +v);
  const scoreOf = s => (s == null ? null : typeof s === "object" ? (s.displayValue != null ? String(s.displayValue) : s.value != null ? String(s.value) : null) : String(s));
  const logoOf = t => (t && (t.logo || (t.logos && t.logos[0] && t.logos[0].href))) || "";
  const colorOf = t => (t && t.color ? "#" + String(t.color).replace(/^#/, "") : "#4a5568");
  function team(t) {
    t = t || {};
    return { id: String(t.id || ""), abbr: t.abbreviation || "", name: t.displayName || t.name || "", short: t.shortDisplayName || t.name || t.abbreviation || "", city: t.location || "", logo: logoOf(t), color: colorOf(t) };
  }

  /* ---------- standings ---------- */
  // One stat from an entry's stats list, by name, type or abbreviation (ESPN's names differ a little by league).
  function stat(stats, ...keys) {
    const want = keys.map(k => String(k).toLowerCase());
    const s = (stats || []).find(x => want.includes(String(x.name || "").toLowerCase()) || want.includes(String(x.type || "").toLowerCase()));
    return s || null;
  }
  const dv = s => (s ? (s.displayValue != null ? String(s.displayValue) : s.value != null ? String(s.value) : "") : "");
  const val = s => (s ? num(s.value != null ? s.value : s.displayValue) : null);
  function row(entry, sp) {
    const st = entry.stats || [];
    const w = val(stat(st, "wins")) || 0, l = val(stat(st, "losses")) || 0;
    const ties = sp.ties ? val(stat(st, "ties")) || 0 : 0;
    const otl = sp.ot ? val(stat(st, "otLosses", "overtimeLosses")) || 0 : 0;
    const gp = w + l + ties + otl;
    const pctS = stat(st, "winPercent", "winpercent");
    const pct = pctS ? val(pctS) : gp ? (w + ties / 2) / gp : 0;
    const rec = [w, l].concat(sp.ties && ties ? [ties] : []).concat(sp.ot ? [otl] : []).join("-");
    return Object.assign(team(entry.team), {
      w, l, ties, otl, gp, pct: pct == null ? 0 : pct, rec,
      pts: sp.ot ? val(stat(st, "points")) : null,
      gb: dv(stat(st, "gamesBehind")) || "-",
      streak: dv(stat(st, "streak")),
      seed: val(stat(st, "playoffSeed")),
      home: dv(stat(st, "Home", "home")), road: dv(stat(st, "Road", "road")),
      last10: dv(stat(st, "Last Ten Games", "lasttengames")).replace(/, 0 PTS$/, ""),
      pf: val(stat(st, "pointsFor")), pa: val(stat(st, "pointsAgainst")),
      diff: dv(stat(st, "pointDifferential", "differential"))
    });
  }
  // ESPN nests groups: the league holds conferences (or AL/NL), which may hold divisions. We want the level that
  // actually has standings, keeping the top-level name (e.g. "American Football Conference").
  function parseStandings(d, id) {
    const sp = sport(id), groups = [];
    (function walk(node, label) {
      if (!node) return;
      const name = node.name || label || "";
      if (node.standings && node.standings.entries && node.standings.entries.length) {
        const teams = node.standings.entries.map(e => row(e, sp));
        teams.sort((a, b) => (a.seed != null && b.seed != null ? a.seed - b.seed : 0) || (sp.ot && a.pts != null && b.pts != null ? b.pts - a.pts : 0) || b.pct - a.pct || b.w - a.w || a.name.localeCompare(b.name));
        groups.push({ name, abbr: node.abbreviation || "", teams });
      }
      (node.children || []).forEach(c => walk(c, c.name));
    })(d, "");
    return groups;
  }

  /* ---------- games (scoreboard and team schedule share one shape) ---------- */
  function game(ev) {
    const c = ev && ev.competitions && ev.competitions[0]; if (!c || !c.competitors) return null;
    const side = x => {
      if (!x) return null;
      const r = Array.isArray(x.records) ? x.records : Array.isArray(x.record) ? x.record : [];
      const overall = r.find(y => y.type === "total" || y.name === "overall" || y.abbreviation === "Total") || r[0];
      return Object.assign(team(x.team), { score: scoreOf(x.score), winner: x.winner === true, record: overall ? overall.summary || overall.displayValue || "" : "" });
    };
    const away = side(c.competitors.find(x => x.homeAway === "away")), home = side(c.competitors.find(x => x.homeAway === "home"));
    if (!away || !home) return null;
    const ty = (c.status && c.status.type) || (ev.status && ev.status.type) || {};
    const done = !!ty.completed, state = ty.state || (done ? "post" : "pre");
    const v = c.venue || {}, a = v.address || {};
    const note = (c.notes && c.notes[0] && c.notes[0].headline) || (c.series && c.series.summary) || "";
    const tv = ((c.broadcasts || []).map(b => (b.names && b.names[0]) || (b.media && b.media.shortName) || "").filter(Boolean)[0]) || "";
    const tie = done && !away.winner && !home.winner && away.score != null && away.score === home.score;
    return {
      id: String(ev.id), date: ev.date || c.date, state, done, tie,
      detail: ty.shortDetail || ty.detail || ty.description || "",
      venue: v.fullName || "", place: [a.city, a.state || a.country].filter(Boolean).join(", "),
      neutral: !!c.neutralSite, note, tv, away, home,
      post: (ev.seasonType && ev.seasonType.type === 3) || (ev.season && ev.season.type === 3) || /playoff|series|round|final|wild card|division|championship|super bowl/i.test(note)
    };
  }
  function parseGames(d) {
    return ((d && d.events) || []).map(game).filter(Boolean).sort((x, y) => String(x.date).localeCompare(String(y.date)));
  }
  // The scoreboard's season, so the NFL can open on this week and the playoffs page knows where we are.
  function seasonOf(d) {
    const s = (d && d.season) || {}, w = (d && d.week) || {};
    return { year: s.year || null, type: s.type || null, week: w.number || null };
  }

  /* ---------- top players and records, from a scoreboard competitor ---------- */
  // ESPN puts each team's season leaders on an upcoming game (points, rebounds, passing yards…); a finished game's
  // leaders are that game's. "rating" is ESPN's all-in-one line, shown as the player's summary instead of its own row.
  function leaders(x) {
    const out = [];
    ((x && x.leaders) || []).forEach(L => {
      const top = L && L.leaders && L.leaders[0], a = top && top.athlete; if (!a) return;
      out.push({ stat: L.shortDisplayName || L.displayName || L.name || "", abbr: L.abbreviation || "", value: top.displayValue || (top.value != null ? String(top.value) : ""),
        player: a.displayName || a.fullName || a.shortName || "", short: a.shortName || a.displayName || "", pos: (a.position && a.position.abbreviation) || "", rating: L.name === "rating" });
    });
    return out;
  }
  function records(x) {
    const r = {}; ((x && (x.records || x.record)) || []).forEach(y => { const k = String(y.type || y.name || "").toLowerCase(); r[k === "total" || k === "overall" || k === "ytd" ? "total" : k] = y.summary || y.displayValue || ""; });
    return r;
  }
  // The scoreboard's extra bits per game that we keep only in memory (never saved): team ids, records, top players.
  function extras(d) {
    const out = {};
    ((d && d.events) || []).forEach(ev => {
      const c = ev.competitions && ev.competitions[0]; if (!c || !c.competitors) return;
      const one = x => x && { id: String((x.team && x.team.id) || x.id || ""), abbr: (x.team && x.team.abbreviation) || "", leaders: leaders(x), records: records(x), logo: logoOf(x.team) };
      const g = game(ev) || {};
      out[String(ev.id)] = { away: one(c.competitors.find(x => x.homeAway === "away")), home: one(c.competitors.find(x => x.homeAway === "home")), pre: !((c.status && c.status.type && c.status.type.state) && c.status.type.state !== "pre"),
        venue: g.venue || "", place: g.place || "", tv: g.tv || "", note: g.note || "" };
    });
    return out;
  }

  /* ---------- one team ---------- */
  // From the team's schedule, seen from that team's side: results (newest first), what's next, and the rest.
  function teamView(d, teamId) {
    const t = (d && d.team) || {}, id = String(teamId || t.id || "");
    const games = parseGames(d).map(g => {
      const me = g.home.id === id ? g.home : g.away.id === id ? g.away : null; if (!me) return null;
      const op = me === g.home ? g.away : g.home;
      const res = !g.done ? null : g.tie ? "T" : me.winner ? "W" : op.winner ? "L" : me.score != null && op.score != null ? (+me.score > +op.score ? "W" : +me.score < +op.score ? "L" : "T") : null;
      return Object.assign({}, g, { me, op, atHome: me === g.home, res });
    }).filter(Boolean);
    const done = games.filter(g => g.done).reverse();
    const live = games.filter(g => g.state === "in");
    const upcoming = games.filter(g => !g.done && g.state !== "in");
    return {
      team: Object.assign(team(t), { record: t.recordSummary || "", standing: t.standingSummary || "", season: t.seasonSummary || "" }),
      live, next: upcoming[0] || null, upcoming, done,
      seasonLabel: (d && d.season && (d.season.displayName || d.season.year)) || ""
    };
  }

  // The last n finished games against one opponent, newest first, from one or more seasons of a team's schedule.
  function headToHead(views, oppId, n) {
    const seen = {}, out = [];
    (views || []).forEach(v => (v && v.done || []).forEach(g => { if (g.op.id === String(oppId) && !seen[g.id]) { seen[g.id] = 1; out.push(g); } }));
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, n || 5);
  }
  const tally = games => games.reduce((t, g) => (g.res === "W" ? t.w++ : g.res === "L" ? t.l++ : g.res === "T" ? t.t++ : 0, t), { w: 0, l: 0, t: 0 });
  // The season a team's schedule is for, as ESPN numbers it (the NBA's 2026-27 season is 2027), so we can ask for older ones.
  const seasonYear = d => (d && d.season && +d.season.year) || null;

  /* ---------- player stats: the team's season leaders, named from its roster ---------- */
  // The categories worth showing first, per league (ESPN's names); anything else ESPN sends comes after, up to MAX.
  const PREFER = {
    nba: ["pointsPerGame", "reboundsPerGame", "assistsPerGame", "stealsPerGame", "blocksPerGame", "3PointMadePerGame", "fieldGoalPercentage", "minutesPerGame"],
    nfl: ["passingYards", "passingTouchdowns", "rushingYards", "rushingTouchdowns", "receivingYards", "receptions", "receivingTouchdowns", "totalTackles", "sacks", "interceptions"],
    nhl: ["points", "goals", "assists", "plusMinus", "shotsTotal", "penaltyMinutes", "savePct", "goalsAgainstAverage", "wins"],
    mlb: ["avg", "homeRuns", "RBIs", "hits", "stolenBases", "onBasePct", "ERA", "wins", "strikeouts", "saves", "WHIP"]
  };
  const SKIP = /^(rating|foulsPerGame|defensiveReboundsPerGame|offensiveReboundsPerGame|PER|doubleDouble)$/;
  // roster → {athleteId: {name, short, jersey, pos}}; ESPN sends a flat list for some leagues and position groups ({items}) for others
  function rosterMap(d) {
    const out = {};
    const add = a => { if (a && a.id != null) out[String(a.id)] = { name: a.displayName || a.fullName || "", short: a.shortName || a.displayName || "", jersey: a.jersey || "", pos: (a.position && (a.position.abbreviation || a.position.name)) || "" }; };
    ((d && d.athletes) || []).forEach(x => (Array.isArray(x.items) ? x.items.forEach(add) : add(x)));
    return out;
  }
  const athleteId = ref => { const m = /athletes\/(\d+)/.exec(String(ref || "")); return m ? m[1] : null; };
  function teamLeaders(d, roster, id, max, per) {
    const names = roster || {}, pref = PREFER[id] || [];
    const cats = ((d && d.categories) || []).filter(c => c && !SKIP.test(c.name || "") && (c.leaders || []).length).map(c => ({
      key: c.name || "", label: c.displayName || c.shortDisplayName || c.name || "", abbr: c.abbreviation || "",
      players: c.leaders.map(L => { const aid = athleteId(L.athlete && (L.athlete.$ref || L.athlete.id)); const p = aid && names[aid]; return p ? Object.assign({ id: aid, value: L.displayValue != null ? String(L.displayValue) : String(L.value) }, p) : null; }).filter(Boolean).slice(0, per || 3)
    })).filter(c => c.players.length);
    const rank = c => { const i = pref.indexOf(c.key); return i < 0 ? 100 : i; };
    return cats.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]).slice(0, max || 8);
  }

  /* ---------- the playoff picture: if the season ended today ---------- */
  // Seeds per conference (or league) and the first-round matchups for that league's format.
  function picture(groups, id) {
    const sp = sport(id);
    return (groups || []).map(g => {
      const ranked = g.teams.slice().sort((a, b) => (a.seed != null && b.seed != null ? a.seed - b.seed : 0) || b.pct - a.pct);
      const inTeams = ranked.slice(0, sp.seeds).map((t, i) => Object.assign({}, t, { s: i + 1 }));
      const out = { name: g.name, seeds: inTeams, byes: inTeams.slice(0, sp.byes), pairs: [], playIn: [] };
      if (sp.playIn) {
        // NBA: 1-6 are in; 7 v 8 (winner is the 7 seed) and 9 v 10 (winner plays the loser of 7 v 8 for the 8 seed)
        const s = i => ranked[i] && Object.assign({}, ranked[i], { s: i + 1 });
        out.seeds = ranked.slice(0, 6).map((t, i) => Object.assign({}, t, { s: i + 1 }));
        out.playIn = [[s(6), s(7)], [s(8), s(9)]].filter(p => p[0] && p[1]);
        out.pairs = [[s(0), { tbd: "Play-In winner (8)" }], [s(3), s(4)], [s(2), s(5)], [s(1), { tbd: "Play-In winner (7)" }]].filter(p => p[0]);
        return out;
      }
      const rest = inTeams.slice(sp.byes);
      for (let i = 0, j = rest.length - 1; i < j; i++, j--) out.pairs.push([rest[i], rest[j]]);
      return out;
    });
  }

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const localDay = d => { const x = d || new Date(); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); };
  function addDays(day, n) { const [y, m, d] = day.split("-").map(Number); return localDay(new Date(y, m - 1, d + n)); }
  function dayList(today, back, ahead) { const out = []; for (let i = -back; i <= ahead; i++) out.push(addDays(today, i)); return out; }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(day, today) {
    if (day === today) return "Today";
    if (day === addDays(today, 1)) return "Tomorrow";
    if (day === addDays(today, -1)) return "Yesterday";
    const [y, m, d] = day.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()] + " " + d;
  }
  // "Sat, Nov 14 · 7:30 PM" in the phone's own time zone
  function when(iso) {
    const x = new Date(iso); if (isNaN(x)) return "";
    let h = x.getHours(), ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12;
    return DOW[x.getDay()] + ", " + MON[x.getMonth()] + " " + x.getDate() + " · " + h + ":" + pad(x.getMinutes()) + " " + ap;
  }
  const pctText = p => (p == null ? "" : p >= 1 ? "1.000" : "." + String(Math.round(p * 1000)).padStart(3, "0"));

  return { SPORTS, ORDER, sport, url, parseStandings, parseGames, seasonOf, teamView, leaders, records, extras, headToHead, tally, seasonYear, rosterMap, teamLeaders, picture, localDay, addDays, dayList, dayLabel, when, pctText, scoreOf };
});
