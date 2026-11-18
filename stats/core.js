/* My Stats: the logic, with no page and no network (tests load this file on its own).

   The LYBS Dashboard keeps every player's GameChanger stats in lybs_bins/lybs-gcstats (behind its sign-in), one row a
   player a season: { key: "first|L", year, sport, team, batting: {...}, pitching: {...}, fielding: {...} }.
   This page copies one player's counting stats to the watch link's "ps" field, and nothing else: no name, no team,
   no coach. The watch (watch/shared/.../family/core/StatsCore.kt) works out AVG, OPS, ERA and the personal bests. */
(function (root) {
  "use strict";
  const C = {};

  /* The level a team name says (GameChanger team names can carry a coach's name, so only these words go over). */
  const LEVELS = [[/t-?ball/i, "T-ball"], [/rookie/i, "Rookies"], [/minors/i, "Minors"], [/majors\s*b\b/i, "Majors B"], [/majors/i, "Majors"],
    [/select/i, "Select"], [/all[- ]?stars?/i, "All-Stars"], [/\b(8|9|10|11|12|13|14)u\b/i, null]];
  C.levelOf = team => {
    const t = String(team || "");
    for (const [re, name] of LEVELS) { const m = t.match(re); if (m) return name || m[1] + "U"; }
    return "";
  };

  const n = v => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x < 1e6 ? x : 0; };
  const i = v => Math.round(n(v));
  /* innings as a plain number: ip_dec when the Dashboard has it, else "14.1" read the baseball way (14⅓) */
  C.innings = p => {
    if (!p) return 0;
    if (p.ip_dec !== undefined && p.ip_dec !== null && p.ip_dec !== "") return Math.round(n(p.ip_dec) * 1000) / 1000;
    const m = String(p.ip || "").match(/^(\d+)(?:\.([012]))?$/);
    return m ? Math.round((+m[1] + (+(m[2] || 0)) / 3) * 1000) / 1000 : 0;
  };

  /* The players in the stats, for the picker: [{ key, name: "First L.", years: [2026, 2025] }], by name. */
  C.players = rows => {
    const by = new Map();
    (rows || []).forEach(r => {
      if (!r || typeof r.key !== "string" || !r.key.includes("|")) return;
      const e = by.get(r.key) || { key: r.key, years: new Set() };
      if (r.year) e.years.add(+r.year);
      by.set(r.key, e);
    });
    return [...by.values()].map(e => {
      const [f, l] = e.key.split("|");
      const name = (f ? f[0].toUpperCase() + f.slice(1) : "") + (l ? " " + l.toUpperCase() + "." : "");
      return { key: e.key, name, years: [...e.years].sort((a, b) => b - a) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };

  C.search = (list, q) => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [];
    return list.filter(p => p.name.toLowerCase().startsWith(s) || p.name.toLowerCase().includes(" " + s)).slice(0, 12);
  };

  /* One player's seasons as the watch wants them. Two rows for the same year and team (a re-import) keep the one with
     more games, as the Dashboard does; two teams in one year stay two seasons. */
  C.forWatch = (rows, key, now) => {
    const best = new Map();
    (rows || []).filter(r => r && r.key === key && r.year).forEach(r => {
      const k = r.year + "|" + (r.team || r.sport || "");
      const gp = n(r.batting && r.batting.gp) + n(r.pitching && r.pitching.gp);
      if (!best.has(k) || gp > best.get(k).gp) best.set(k, { r, gp });
    });
    const s = [...best.values()].map(({ r }) => {
      const b = r.batting || {}, p = r.pitching || {};
      return {
        y: +r.year, lv: C.levelOf(r.team),
        b: { g: i(b.gp), pa: i(b.pa), ab: i(b.ab), h: i(b.h), r: i(b.r), rbi: i(b.rbi), bb: i(b.bb), so: i(b.so), hbp: i(b.hbp),
             sb: i(b.sb), cs: i(b.cs), "2b": i(b["2b"]), "3b": i(b["3b"]), hr: i(b.hr), tb: i(b.tb) },
        p: { g: i(p.gp), gs: i(p.gs), ip: C.innings(p), so: i(p.so), bb: i(p.bb), h: i(p.h), er: i(p.er), w: i(p.w), l: i(p.l), pc: i(p.pitches) },
      };
    }).sort((a, b) => b.y - a.y || a.lv.localeCompare(b.lv)).slice(0, 30);
    return { v: 1, at: now || Date.now(), s };
  };

  /* what to compare to tell whether the watch already has these numbers (the time it was sent left out) */
  C.signature = (key, w) => key + "|" + JSON.stringify(w.s);

  /* the numbers the page shows for a season, the same sums the watch makes */
  C.line = x => {
    const b = x.b, p = x.p;
    const tb = b.tb || (b.h + b["2b"] + 2 * b["3b"] + 3 * b.hr);
    const rate = v => (v === null ? "—" : v.toFixed(3).replace(/^0/, ""));
    const outs = Math.round(p.ip * 3);
    return {
      avg: rate(b.ab ? b.h / b.ab : null),
      ops: rate(b.ab ? (b.ab + b.bb + b.hbp ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp) : 0) + tb / b.ab : null),
      era: outs ? (p.er * 27 / outs).toFixed(2) : "—",
      ip: Math.floor(outs / 3) + "." + (outs % 3),
    };
  };

  root.StatsCore = C;
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof window !== "undefined" ? window : globalThis);
