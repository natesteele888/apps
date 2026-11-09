/* Gameday Picks core: the pure parts (sports, slate keys, dates, reading ESPN's scoreboard, records).
   No DOM, no Firebase. Loaded in the page as window.GPCore and in Node (tests) with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GPCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SPORTS = {
    nfl: { id: "nfl", name: "NFL", path: "football/nfl", emoji: "🏈", weekly: true, noun: "week" },
    mlb: { id: "mlb", name: "MLB", path: "baseball/mlb", emoji: "⚾", weekly: false, noun: "day" },
    nba: { id: "nba", name: "NBA", path: "basketball/nba", emoji: "🏀", weekly: false, noun: "day" },
    nhl: { id: "nhl", name: "NHL", path: "hockey/nhl", emoji: "🏒", weekly: false, noun: "day" }
  };
  const ORDER = ["nfl", "mlb", "nba", "nhl"];
  const sport = id => SPORTS[id] || SPORTS.nfl;
  const apiUrl = id => "https://site.api.espn.com/apis/site/v2/sports/" + sport(id).path + "/scoreboard";

  /* ---------- slate keys ----------
     NFL keeps its original key "year-type-week" (so every pick made so far still counts); the daily leagues use
     "sport-YYYY-MM-DD", one slate per calendar day. */
  const nflKey = (y, t, w) => `${y}-${t}-${w}`;
  const dayKey = (id, day) => `${id}-${day}`;
  function sportOf(key) { const k = String(key || ""); if (/^\d{4}-\d+-\d+$/.test(k)) return "nfl"; const p = k.split("-")[0]; return SPORTS[p] ? p : "nfl"; }
  function parseKey(key) {
    const k = String(key || "");
    if (/^\d{4}-\d+-\d+$/.test(k)) { const [y, t, w] = k.split("-"); return { sport: "nfl", y: +y, t: +t, w: +w }; }
    const m = k.match(/^([a-z]+)-(\d{4}-\d{2}-\d{2})$/); if (m && SPORTS[m[1]]) return { sport: m[1], date: m[2] };
    return null;
  }
  // The fetch for a slate: NFL by week, the others by day (ESPN wants YYYYMMDD).
  function fetchUrl(key) {
    const p = parseKey(key); if (!p) return null;
    if (p.sport === "nfl") return apiUrl("nfl") + `?year=${p.y}&seasontype=${p.t}&week=${p.w}`;
    return apiUrl(p.sport) + "?dates=" + p.date.replace(/-/g, "");
  }

  /* ---------- local dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const localDay = d => { const x = d || new Date(); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); };
  function addDays(day, n) { const [y, m, d] = day.split("-").map(Number); const x = new Date(y, m - 1, d + n); return localDay(x); }
  // The days to offer for a daily league: a few back (results), today, and the week ahead.
  function dayList(today, back, ahead) { const out = []; for (let i = -(back == null ? 3 : back); i <= (ahead == null ? 6 : ahead); i++) out.push(addDays(today, i)); return out; }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function label(key, today) {
    const p = parseKey(key); if (!p) return key;
    if (p.sport === "nfl") return (p.t === 1 ? "Pre " : p.t === 3 ? "Playoffs " : "Wk ") + p.w;
    if (today && p.date === today) return "Today";
    if (today && p.date === addDays(today, 1)) return "Tomorrow";
    if (today && p.date === addDays(today, -1)) return "Yesterday";
    const [y, m, d] = p.date.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()] + " " + d;
  }
  // The NFL regular season has 18 weeks, the preseason 4, the playoffs 5 rounds.
  const nflWeeks = t => (t === 3 ? 5 : t === 1 ? 4 : 18);

  /* ---------- ESPN's scoreboard → our games ---------- */
  function parseGames(d) {
    const games = {};
    ((d && d.events) || []).forEach(ev => {
      const c = ev.competitions && ev.competitions[0]; if (!c || !c.competitors) return;
      const A = c.competitors.find(x => x.homeAway === "away"), H = c.competitors.find(x => x.homeAway === "home"); if (!A || !H) return;
      const done = !!(c.status && c.status.type && c.status.type.completed);
      const win = done ? ((c.competitors.find(x => x.winner) || { team: {} }).team.abbreviation || null) : null;
      const tm = x => ({ abbr: x.team.abbreviation, name: x.team.shortDisplayName || x.team.name, city: x.team.location || "", color: x.team.color ? "#" + x.team.color : "#555555", score: x.score == null ? null : x.score });
      games[ev.id] = { date: ev.date, away: tm(A), home: tm(H), done, winner: win, state: (c.status && c.status.type && c.status.type.state) || "pre" };
    });
    return games;
  }
  const started = (g, now) => g.state !== "pre" || new Date(g.date) <= (now || new Date());

  /* ---------- records ---------- */
  // Wins and losses for one player: all sports, or one.
  function record(picks, weeks, uid, sportId) {
    let w = 0, l = 0;
    Object.entries(picks || {}).forEach(([k, by]) => {
      if (sportId && sportOf(k) !== sportId) return;
      const p = by && by[uid], wk = weeks && weeks[k]; if (!p || !wk) return;
      Object.entries(p).forEach(([gid, abbr]) => { const g = wk.games && wk.games[gid]; if (!g || !g.done || !g.winner) return; g.winner === abbr ? w++ : l++; });
    });
    return { w, l, total: w + l };
  }
  // How one player's picks went, team by team: picked for (f) and against (a), with the results of each.
  function teamStats(picks, weeks, uid, sportId) {
    const teams = {};
    Object.entries(picks || {}).forEach(([k, by]) => {
      if (sportId && sportOf(k) !== sportId) return;
      const p = by && by[uid], wk = weeks && weeks[k]; if (!p || !wk) return;
      Object.entries(p).forEach(([gid, abbr]) => {
        const g = wk.games && wk.games[gid]; if (!g) return;
        const me = g.away.abbr === abbr ? g.away : g.home, op = g.away.abbr === abbr ? g.home : g.away;
        const T = x => teams[x.abbr] = teams[x.abbr] || { name: x.name, color: x.color, f: 0, fw: 0, fl: 0, a: 0, aw: 0, al: 0 };
        const a = T(me), b = T(op); a.f++; b.a++;
        if (g.done && g.winner) { if (g.winner === abbr) { a.fw++; b.al++; } else { a.fl++; b.aw++; } }
      });
    });
    return Object.entries(teams).sort((x, y) => y[1].f - x[1].f || x[1].name.localeCompare(y[1].name));
  }
  return { SPORTS, ORDER, sport, apiUrl, nflKey, dayKey, sportOf, parseKey, fetchUrl, localDay, addDays, dayList, label, nflWeeks, parseGames, started, record, teamStats };
});
