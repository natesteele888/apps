/* Read 20: the pure logic (days, minutes, streaks, the month grid). No page, no storage; the app and the tests both use it. */
(function (root) {
  "use strict";
  const C = {};
  const pad = n => (n < 10 ? "0" : "") + n;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  /* Day keys look like 2026-11-08, always the local calendar day. */
  C.dayKey = d => { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  C.parseDay = k => { if (!DAY.test(k || "")) return null; const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d, 12); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null; };
  C.addDays = (k, n) => { const d = C.parseDay(k); d.setDate(d.getDate() + n); return C.dayKey(d); };

  C.GOALS = [10, 15, 20, 25, 30];
  C.empty = () => ({ v: 1, name: "", goal: 20, size: 1, say: false, bk: "", days: {} });
  const int = (x, lo, hi, dflt) => { x = Math.round(Number(x)); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt; };
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, n);

  /* Each phone keeps its own running counts for a day (a "part"), so two phones reading on the same day add up instead of one
     overwriting the other. The day's totals (sec, books, extra) are worked out from the parts. */
  C.dev = "local";
  const cleanPart = p => {
    if (!p || typeof p !== "object") return null;
    const out = { sec: int(p.sec, 0, 86400, 0), books: {}, extra: [] };
    const books = p.books && typeof p.books === "object" ? p.books : {};
    for (const id of Object.keys(books).slice(0, 200)) { const b = books[id] || {}; out.books[clean(id, 60)] = { sec: int(b.sec, 0, 86400, 0), fin: b.fin ? 1 : 0 }; }
    (Array.isArray(p.extra) ? p.extra : []).slice(0, 50).forEach(e => { if (e && typeof e === "object") out.extra.push({ title: clean(e.title, 60) || "A book from home", sec: int(e.sec, 0, 86400, 0) }); });
    return out.sec || Object.keys(out.books).length || out.extra.length ? out : null;
  };
  C.derive = d => {
    d.sec = 0; d.books = {}; d.extra = [];
    for (const dev of Object.keys(d.parts).sort()) {
      const p = d.parts[dev]; d.sec += p.sec;
      for (const id of Object.keys(p.books)) { const b = d.books[id] || (d.books[id] = { sec: 0, fin: 0 }); b.sec += p.books[id].sec; b.fin = b.fin || p.books[id].fin; }
      p.extra.forEach(e => d.extra.push(e));
    }
    d.sec = Math.min(d.sec, 86400); return d;
  };
  const myPart = d => (d.parts || (d.parts = {}))[C.dev] || (d.parts[C.dev] = { sec: 0, books: {}, extra: [] });
  /* What gets saved and sent: only the parts (the totals are rebuilt on load). */
  C.serialize = s => { const o = Object.assign({}, s, { days: {} }); for (const k of Object.keys(s.days)) o.days[k] = { done: s.days[k].done, parts: s.days[k].parts }; return o; };

  /* Anything read back from storage goes through here, so a damaged save can't break the app. */
  C.sanitize = raw => {
    const s = C.empty();
    if (!raw || typeof raw !== "object") return s;
    s.name = clean(raw.name, 20);
    s.goal = C.GOALS.includes(raw.goal) ? raw.goal : 20;
    s.size = int(raw.size, 0, 2, 1);
    s.say = raw.say === true;
    s.bk = C.parseDay(raw.bk) ? raw.bk : "";
    const days = raw.days && typeof raw.days === "object" ? raw.days : {};
    for (const k of Object.keys(days)) {
      if (!C.parseDay(k)) continue;
      const d = days[k] || {}, out = { sec: 0, done: d.done ? 1 : 0, books: {}, extra: [], parts: {} };
      if (d.parts && typeof d.parts === "object") Object.keys(d.parts).slice(0, 12).forEach(dev => { const p = cleanPart(d.parts[dev]); if (p) out.parts[clean(dev, 12) || "x"] = p; });
      else { const p = cleanPart(d); if (p) out.parts.old = p; }   // a save from before phones were tracked separately: it all belongs to "old"
      C.derive(out); s.days[k] = out;
    }
    return s;
  };

  C.day = (s, k, make) => { if (!s.days[k] && make) s.days[k] = { sec: 0, done: 0, books: {}, extra: [], parts: {} }; return s.days[k]; };
  C.daySec = (s, k) => (s.days[k] ? s.days[k].sec : 0);
  C.goalSec = s => s.goal * 60;
  C.isDone = (s, k) => C.daySec(s, k) >= C.goalSec(s);

  /* Time spent in a story. Whole seconds only; the day total and the story total move together. */
  C.addSeconds = (s, k, id, sec) => {
    sec = Math.floor(sec); if (!(sec > 0)) return 0;
    const d = C.day(s, k, true);
    sec = Math.min(sec, 86400 - d.sec); if (sec <= 0) return 0;
    const p = myPart(d); p.sec += sec; (p.books[id] || (p.books[id] = { sec: 0, fin: 0 })).sec += sec;
    C.derive(d);
    return sec;
  };
  C.finish = (s, k, id) => { const d = C.day(s, k, true); (myPart(d).books[id] || (myPart(d).books[id] = { sec: 0, fin: 0 })).fin = 1; C.derive(d); };
  C.addManual = (s, k, title, min) => {
    min = Math.round(Number(min)); if (!(min >= 1) || !C.parseDay(k)) return false; min = Math.min(min, 240);
    const d = C.day(s, k, true); if (d.sec + min * 60 > 86400) return false;
    const p = myPart(d); p.sec += min * 60; p.extra.push({ title: clean(title, 60) || "A book from home", sec: min * 60 }); C.derive(d);
    return true;
  };
  C.finishedIds = s => { const out = {}; for (const k of Object.keys(s.days)) for (const id of Object.keys(s.days[k].books)) if (s.days[k].books[id].fin) out[id] = (out[id] || 0) + 1; return out; };

  /* Nights in a row that reached the goal. Today not being done yet doesn't break the streak. */
  C.streak = (s, today) => {
    let k = C.isDone(s, today) ? today : C.addDays(today, -1), n = 0;
    while (C.isDone(s, k)) { n++; k = C.addDays(k, -1); }
    return n;
  };

  /* Month grid for the log: Sunday first, null for blanks. month is 0 to 11. */
  C.monthGrid = (y, m) => {
    const first = new Date(y, m, 1, 12).getDay(), n = new Date(y, m + 1, 0).getDate(), cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= n; d++) cells.push(y + "-" + pad(m + 1) + "-" + pad(d));
    while (cells.length % 7) cells.push(null);
    return cells;
  };
  C.monthStats = (s, y, m) => {
    let nights = 0, sec = 0;
    for (const k of Object.keys(s.days)) { const d = C.parseDay(k); if (d.getFullYear() === y && d.getMonth() === m) { sec += s.days[k].sec; if (C.isDone(s, k)) nights++; } }
    return { nights, sec };
  };

  C.total = s => Object.keys(s.days).reduce((a, k) => a + s.days[k].sec, 0);

  /* Combine two saves without ever losing time: for each day keep the bigger total, every story's bigger time and any
     finished mark. Used to restore a backup and to recover from the second copy of the log. */
  C.merge = (a, b) => {
    const out = C.sanitize(a), o = C.sanitize(b);
    if (!Object.keys(out.days).length && Object.keys(o.days).length) { out.goal = o.goal; out.size = o.size; out.say = o.say; } // a fresh phone takes the saved settings
    if (!out.name && o.name) out.name = o.name;
    if (!out.bk || (o.bk && o.bk > out.bk)) out.bk = o.bk;
    for (const k of Object.keys(o.days)) {
      const x = out.days[k], y = o.days[k];
      if (!x) { out.days[k] = y; continue; }
      x.done = x.done || y.done;
      for (const dev of Object.keys(y.parts)) {
        const px = x.parts[dev], py = y.parts[dev]; if (!px) { x.parts[dev] = py; continue; }
        px.sec = Math.max(px.sec, py.sec);
        for (const id of Object.keys(py.books)) { const t = px.books[id]; if (!t) px.books[id] = py.books[id]; else { t.sec = Math.max(t.sec, py.books[id].sec); t.fin = t.fin || py.books[id].fin; } }
        const sum = e => e.reduce((n, v) => n + v.sec, 0); if (sum(py.extra) > sum(px.extra)) px.extra = py.extra;
      }
      C.derive(x);
    }
    return out;
  };
  C.daysSince = (from, to) => Math.round((C.parseDay(to) - C.parseDay(from)) / 864e5);
  C.fmtClock = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ":" + pad(sec % 60); };
  C.fmtTotal = sec => (sec < 3600 ? Math.round(sec / 60) + " min" : (Math.round(sec / 360) / 10) + " hr");
  C.fmtMin = sec => (sec > 0 && sec < 60 ? "under 1 min" : Math.round(sec / 60) + " min");

  root.R20Core = C;
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof window !== "undefined" ? window : globalThis);
