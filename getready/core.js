/* Get Ready: the pure logic (days, checklist, streaks, reminders, calendar file). No page, no storage;
   the app and the tests both use it. */
(function (root) {
  "use strict";
  const C = {};
  const pad = n => (n < 10 ? "0" : "") + n;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

  /* Day keys look like 2026-11-09, always the local calendar day. */
  C.dayKey = d => { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  C.parseDay = k => { if (!DAY.test(k || "")) return null; const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d, 12); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null; };
  C.addDays = (k, n) => { const d = C.parseDay(k); d.setDate(d.getDate() + n); return C.dayKey(d); };
  C.dow = k => C.parseDay(k).getDay();

  C.TIMERS = [0, 30, 60, 120, 180, 300, 600, 900, 1200, 1800];
  C.uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const int = (x, lo, hi, dflt) => { x = Math.round(Number(x)); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt; };
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, n);
  const dayList = (a, dflt) => {
    if (!Array.isArray(a)) return dflt.slice();
    return [...new Set(a.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((x, y) => x - y);
  };

  const stdItems = () => [
    { id: "med", name: "Morning medicine", timer: 0 }, { id: "vit", name: "Vitamins", timer: 0 }, { id: "teeth", name: "Brush teeth", timer: 120 },
    { id: "bag", name: "School bag", timer: 0 }, { id: "water", name: "Water bottle", timer: 0 }, { id: "lunch", name: "Lunch", timer: 0 }
  ];
  const weekendItems = () => [{ id: C.uid(), name: "Morning medicine", timer: 0 }, { id: C.uid(), name: "Vitamins", timer: 0 }, { id: C.uid(), name: "Water bottle", timer: 0 }];
  const defReminders = () => [
    { id: "r1", label: "Time to start getting ready", time: "07:00", days: [1, 2, 3, 4, 5], on: 1 },
    { id: "r2", label: "Bag, water and shoes. Almost time to go!", time: "07:30", days: [1, 2, 3, 4, 5], on: 1 }
  ];
  /* A fresh start: a school-days list and a weekend list you can change, and two reminders.
     Each list is used on the weekdays you give it (a day belongs to at most one list). */
  C.defaults = () => ({
    v: 2,
    lists: [{ id: "school", name: "School days", days: [1, 2, 3, 4, 5], items: stdItems() }, { id: "weekend", name: "Weekend", days: [0, 6], items: weekendItems() }],
    reminders: defReminders(), days: {}, fired: {}, timer: null, gifs: [], sound: 1
  });

  /* Anything read back from storage goes through here, so a damaged save can't break the app. */
  C.sanitize = raw => {
    const d = C.defaults();
    if (!raw || typeof raw !== "object") return d;
    const s = { v: 2, lists: d.lists, reminders: d.reminders, days: {}, fired: {}, timer: null, gifs: [], sound: raw.sound === 0 || raw.sound === false ? 0 : 1 };
    const seen = new Set();
    const cleanItems = arr => {
      const out = [];
      (Array.isArray(arr) ? arr : []).slice(0, 60).forEach(i => {
        if (!i || typeof i !== "object") return;
        const id = clean(i.id, 30) || C.uid(), name = clean(i.name, 40);
        if (!name || seen.has(id)) return;
        seen.add(id);
        out.push({ id, name, timer: C.TIMERS.includes(i.timer) ? i.timer : 0 });
      });
      return out;
    };
    if (Array.isArray(raw.lists)) {
      const taken = new Set(), ids = new Set();
      s.lists = [];
      raw.lists.slice(0, 12).forEach(l => {
        if (!l || typeof l !== "object") return;
        let id = clean(l.id, 30) || C.uid(); if (ids.has(id)) id = C.uid(); ids.add(id);
        const days = dayList(l.days, []).filter(x => !taken.has(x)); days.forEach(x => taken.add(x));
        s.lists.push({ id, name: clean(l.name, 30) || "My list", days, items: cleanItems(l.items) });
      });
    } else if (Array.isArray(raw.items)) {
      /* An older save had one list for every day: it becomes "School days" on the days it was used for school,
         and the other days get a small weekend list. */
      const school = dayList(raw.school, [1, 2, 3, 4, 5]), off = [0, 1, 2, 3, 4, 5, 6].filter(x => !school.includes(x));
      s.lists = [{ id: "school", name: "School days", days: school, items: cleanItems(raw.items) }];
      if (off.length) s.lists.push({ id: "weekend", name: "Weekend", days: off, items: cleanItems(weekendItems()) });
    }
    if (Array.isArray(raw.reminders)) {
      const seen = new Set();
      s.reminders = [];
      raw.reminders.slice(0, 20).forEach(r => {
        if (!r || typeof r !== "object") return;
        const id = clean(r.id, 30) || C.uid();
        if (seen.has(id)) return;
        seen.add(id);
        s.reminders.push({ id, label: clean(r.label, 60) || "Reminder", time: TIME.test(r.time) ? r.time : "07:00", days: dayList(r.days, [1, 2, 3, 4, 5]), on: r.on ? 1 : 0 });
      });
    }
    const days = raw.days && typeof raw.days === "object" ? raw.days : {};
    Object.keys(days).sort().slice(-800).forEach(k => {
      if (!C.parseDay(k)) return;
      const v = days[k] || {}, c = {};
      const src = v.c && typeof v.c === "object" ? v.c : {};
      Object.keys(src).slice(0, 80).forEach(id => { if (src[id]) c[clean(id, 30)] = 1; });
      s.days[k] = { c, done: v.done ? 1 : 0 };
      if (typeof v.l === "string" && v.l) s.days[k].l = clean(v.l, 30);
    });
    const fired = raw.fired && typeof raw.fired === "object" ? raw.fired : {};
    Object.keys(fired).slice(0, 40).forEach(id => { if (C.parseDay(fired[id])) s.fired[clean(id, 30)] = fired[id]; });
    if (raw.timer && typeof raw.timer === "object" && typeof raw.timer.id === "string" && isFinite(raw.timer.end)) s.timer = { id: clean(raw.timer.id, 30), end: Math.round(raw.timer.end) };
    (Array.isArray(raw.gifs) ? raw.gifs : []).slice(0, 12).forEach(g => {
      if (!g || typeof g !== "object") return;
      const id = clean(g.id, 30) || C.uid(), name = clean(g.name, 40) || "My GIF";
      if (g.kind === "file") s.gifs.push({ id, kind: "file", name });
      else if (g.kind === "url" && /^https:\/\/[^\s"'<>]+$/i.test(g.url || "") && g.url.length <= 600) s.gifs.push({ id, kind: "url", url: g.url, name });
    });
    return s;
  };

  /* ---------- the checklist ---------- */
  /* Which list a day uses: the one picked for that day, else the list assigned to its weekday, else none (a day off). */
  C.listFor = (s, k) => {
    const r = s.days[k], pick = r && r.l && s.lists.find(l => l.id === r.l);
    return pick || s.lists.find(l => l.days.includes(C.dow(k))) || null;
  };
  C.itemsFor = (s, k) => { const l = C.listFor(s, k); return l ? l.items : []; };
  C.hasList = (s, k) => !!C.listFor(s, k);
  C.findItem = (s, id) => { for (const l of s.lists) { const i = l.items.find(x => x.id === id); if (i) return i; } return null; };
  C.listOf = (s, id) => s.lists.find(l => l.items.some(i => i.id === id)) || null;
  C.activeDays = s => [...new Set([].concat(...s.lists.map(l => l.days)))].sort((a, b) => a - b);
  /* Give a list its weekdays; a weekday can only belong to one list, so it is taken from any other. */
  C.setListDays = (s, id, days) => {
    const l = s.lists.find(x => x.id === id); if (!l) return;
    l.days = dayList(days, []);
    s.lists.forEach(o => { if (o !== l) o.days = o.days.filter(d => !l.days.includes(d)); });
  };
  /* Use a different list for one date only (clearing it when it is just the usual list). */
  C.setDayList = (s, k, id) => {
    const usual = s.lists.find(l => l.days.includes(C.dow(k)));
    if (!id || (usual && usual.id === id)) { if (s.days[k]) delete s.days[k].l; }
    else if (s.lists.some(l => l.id === id)) { const r = s.days[k] || (s.days[k] = { c: {}, done: 0 }); r.l = id; }
    return C.settle(s, k);
  };
  C.isChecked = (s, k, id) => !!(s.days[k] && s.days[k].c[id]);
  C.count = (s, k) => C.itemsFor(s, k).filter(i => C.isChecked(s, k, i.id)).length;
  C.isComplete = (s, k) => { const n = C.itemsFor(s, k).length; return n > 0 && C.count(s, k) === n; };
  C.isDone = (s, k) => !!(s.days[k] && s.days[k].done);
  const rec = (s, k) => s.days[k] || (s.days[k] = { c: {}, done: 0 });

  /* Tick or untick one item. "justDone" is true only on the tap that finishes the whole list for the first time. */
  C.toggle = (s, k, id) => {
    if (!C.itemsFor(s, k).some(i => i.id === id)) return { checked: false, justDone: false };
    const r = rec(s, k);
    if (r.c[id]) delete r.c[id]; else r.c[id] = 1;
    return { checked: !!r.c[id], justDone: C.settle(s, k) };
  };
  /* Re-check whether the day is complete (also after an item is added or removed). Returns true when it newly became done. */
  C.settle = (s, k) => {
    const r = s.days[k];
    if (!r) return false;
    const full = C.isComplete(s, k);
    if (full && !r.done) { r.done = 1; return true; }
    if (!full && r.done) r.done = 0;
    return false;
  };
  C.resetDay = (s, k) => { delete s.days[k]; };

  /* Days in a row with the whole list ticked. Days with no list are skipped (they never break it; a done one adds to it).
     A day that is not finished yet does not break the streak. */
  C.streak = (s, today) => {
    let k = today, n = 0;
    if (!C.isDone(s, k)) k = C.addDays(k, -1);
    for (let guard = 0; guard < 800; guard++) {
      if (C.isDone(s, k)) n++;
      else if (C.hasList(s, k)) break;
      k = C.addDays(k, -1);
    }
    return n;
  };
  C.doneDays = s => Object.keys(s.days).filter(k => s.days[k].done).length;

  C.moveItem = (items, id, dir) => {
    const a = items.slice(), i = a.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };

  /* ---------- timers ---------- */
  C.fmt = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + pad(sec % 60); };
  C.timerLabel = sec => (sec < 60 ? sec + " sec" : sec / 60 + " min");
  C.remaining = (timer, nowMs) => (timer ? Math.max(0, Math.ceil((timer.end - nowMs) / 1000)) : 0);

  /* ---------- reminders ---------- */
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  /* Which reminders should go off right now. A reminder is "due" from its time until two hours later (so opening the app
     a little late still shows it), once per day. */
  C.dueReminders = (s, now) => {
    const k = C.dayKey(now), m = now.getHours() * 60 + now.getMinutes(), wd = now.getDay();
    return s.reminders.filter(r => r.on && r.days.includes(wd) && s.fired[r.id] !== k && m >= mins(r.time) && m - mins(r.time) <= 120);
  };

  /* A calendar file with a repeating event and an alarm for each reminder. The phone's calendar rings even when this app is closed. */
  const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const esc = t => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = line => { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); };
  C.ics = (s, now) => {
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Get Ready//EN", "CALSCALE:GREGORIAN"];
    s.reminders.filter(r => r.on && r.days.length).forEach(r => {
      let k = C.dayKey(now);
      for (let i = 0; i < 7 && !r.days.includes(C.dow(k)); i++) k = C.addDays(k, 1);
      const ymd = k.replace(/-/g, ""), hm = r.time.replace(":", "");
      const end = mins(r.time) + 10, endHm = pad(Math.min(23, Math.floor(end / 60))) + pad(end >= 1440 ? 59 : end % 60);
      L.push("BEGIN:VEVENT", "UID:" + r.id + "@getready", "DTSTAMP:" + stamp, "DTSTART:" + ymd + "T" + hm + "00", "DTEND:" + ymd + "T" + endHm + "00",
        "RRULE:FREQ=WEEKLY;BYDAY=" + r.days.map(d => ICS_DAYS[d]).join(","), fold("SUMMARY:" + esc(r.label)),
        "BEGIN:VALARM", "ACTION:DISPLAY", fold("DESCRIPTION:" + esc(r.label)), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  };

  /* Pick a random celebration, never the same one twice in a row when there is a choice. */
  C.pick = (count, last, rnd) => {
    if (count <= 1) return 0;
    let i = Math.floor((rnd || Math.random)() * count);
    if (i >= count) i = count - 1;
    return i === last ? (i + 1) % count : i;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.GRCore = C;
})(typeof window !== "undefined" ? window : globalThis);
