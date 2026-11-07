/* Eight Count: the timing and data core. No DOM in here, so it runs in the page and in Node tests.
   Everything about "which count is it right now" comes from one number: the position in seconds,
   where 0 is the first "1" of the routine and the count-off ("5 6 7 8") is negative time. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EC = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BEATS = 8;
  var LIMITS = { sections: 40, counts: 64, text: 40, name: 60, note: 120 };

  /* Common moves, shown as one-tap chips when filling in a count. Generic names only. */
  var MOVES = {
    Arms: ["Clasp", "High V", "Low V", "T", "Broken T", "Touchdown", "Daggers", "Candle", "K", "L", "Punch", "Bow & arrow", "Clap", "Hands on hips"],
    Jumps: ["Toe touch", "Herkie", "Pike", "Tuck", "Hurdler"],
    Stunts: ["Prep", "Extension", "Cradle", "Basket toss", "Hold"],
    Tumbling: ["Round-off", "Back handspring", "Back tuck", "Cartwheel"],
    Dance: ["Step touch", "Kick", "Pose", "Turn", "Body roll", "Pop", "Freeze"]
  };

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function clampBpm(b) { b = Math.round(Number(b)); return isFinite(b) ? clamp(b, 40, 240) : 120; }
  function str(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : ""; }

  function blankCount() { return { m: ["", "", "", "", "", "", "", ""], n: "" }; }
  function newSection(name, counts) {
    var cs = [];
    for (var i = 0; i < (counts || 4); i++) cs.push(blankCount());
    return { id: uid(), name: name || "Section", counts: cs };
  }
  function newRoutine(name) {
    return { id: uid(), name: name || "New routine", bpm: 120, created: Date.now(), updated: Date.now(), sections: [newSection("Section 1", 4)], music: null };
  }

  /* Clean anything that comes from outside (a shared link, a backup file, old storage) into a safe routine. */
  function sanitizeRoutine(o) {
    if (!o || typeof o !== "object") return null;
    var secs = Array.isArray(o.sections) ? o.sections.slice(0, LIMITS.sections) : [];
    var out = {
      id: uid(), name: str(o.name, LIMITS.name) || "Shared routine", bpm: clampBpm(o.bpm || 120),
      created: Date.now(), updated: Date.now(), sections: [], music: null
    };
    secs.forEach(function (s, si) {
      if (!s || typeof s !== "object") return;
      var counts = (Array.isArray(s.counts) ? s.counts : []).slice(0, LIMITS.counts).map(function (c) {
        var m = (c && Array.isArray(c.m) ? c.m : []).slice(0, BEATS).map(function (t) { return str(t, LIMITS.text); });
        while (m.length < BEATS) m.push("");
        return { m: m, n: str(c && c.n, LIMITS.note) };
      });
      if (!counts.length) counts = [blankCount()];
      out.sections.push({ id: uid(), name: str(s.name, LIMITS.name) || "Section " + (si + 1), counts: counts });
    });
    if (!out.sections.length) out.sections.push(newSection("Section 1", 4));
    if (o.music && typeof o.music === "object") {
      var off = Number(o.music.offset);
      out.music = { name: str(o.music.name, LIMITS.name) || "Song", offset: isFinite(off) ? clamp(off, 0, 600) : 0, hasFile: false };
    }
    return out;
  }

  function flatten(r) {
    var list = [], g = 0;
    r.sections.forEach(function (s, si) {
      s.counts.forEach(function (c, i) { list.push({ g: g++, s: si, i: i, m: c.m, n: c.n, secName: s.name }); });
    });
    return list;
  }
  function totalCounts(r) { return r.sections.reduce(function (a, s) { return a + s.counts.length; }, 0); }

  /* Where are we at position posSec? nCounts = Infinity for the free counter. */
  function beatAt(posSec, bpm, nCounts) {
    var beatF = posSec * bpm / 60;
    if (beatF < 0) {
      var k = Math.floor(beatF) + 4;
      if (k < 0) return { state: "pre", beatF: beatF };
      return { state: "countoff", label: 5 + k, k: k, beatF: beatF };
    }
    if (nCounts !== Infinity && beatF >= nCounts * BEATS) return { state: "done", beatF: beatF };
    var bi = Math.floor(beatF);
    return { state: "run", beatF: beatF, bi: bi, g: Math.floor(bi / BEATS), b: bi % BEATS, sub: (beatF - bi) >= 0.5 ? 1 : 0 };
  }

  /* Position in timeline seconds, given the real clock. startMs = when the first "1" happens. */
  function posSec(nowMs, startMs, rate) { return (nowMs - startMs) / 1000 * rate; }
  function beatMs(k, startMs, bpm, rate) { return startMs + k * 60000 / (bpm * rate); }
  function countoffMs(bpm, rate) { return 4 * 60000 / (bpm * rate); }

  /* Lock in together: every phone picks the same wall-clock mark, so they all count off at once. */
  function nextMark(nowMs, cycleMs, leadMs) { return Math.ceil((nowMs + leadMs) / cycleMs) * cycleMs; }
  /* "7:05:30 PM" typed as hours, minutes, seconds -> the next time the wall clock reads that. */
  function nextClock(nowMs, h, m, s) {
    var d = new Date(nowMs); d.setHours(h, m, s, 0);
    if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function fmtClock(ms, withTenths) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var h = d.getHours() % 12 || 12;
    return h + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + (withTenths ? "." + Math.floor(d.getMilliseconds() / 100) : "") + (d.getHours() < 12 ? " AM" : " PM");
  }

  /* Where in the song does the audio start? offset = song time (s) of the first "1".
     The song never starts before its own beginning, and never earlier than the count-off. */
  function audioPlan(offset, bpm, rate) {
    var co = 4 * 60 / bpm; // timeline seconds of count-off
    var lead = Math.min(offset, co);
    return { startPos: -lead, songStart: offset - lead };
  }
  /* A gentle speed nudge that pulls a drifting song back onto the shared clock. err = expected - actual (s). */
  function driftRate(err, rate) {
    if (Math.abs(err) < 0.015) return rate;
    return rate * (1 + clamp(err * 1.2, -0.03, 0.03));
  }

  /* ---- share links: a routine squeezed into the part after # ---- */
  function compact(r) {
    return {
      v: 1, name: r.name, bpm: r.bpm,
      sections: r.sections.map(function (s) {
        return { name: s.name, counts: s.counts.map(function (c) { return { m: c.m, n: c.n }; }) };
      }),
      music: r.music ? { name: r.music.name, offset: r.music.offset } : null
    };
  }
  function b64u(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(t) {
    t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "=";
    var bin = atob(t), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    var w = stream.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  async function encodeRoutine(r) {
    var bytes = new TextEncoder().encode(JSON.stringify(compact(r)));
    if (typeof CompressionStream === "function") return "1" + b64u(await pipe(bytes, new CompressionStream("deflate-raw")));
    return "0" + b64u(bytes);
  }
  async function decodeRoutine(t) {
    if (typeof t !== "string" || t.length < 2 || t.length > 200000) throw new Error("bad link");
    var bytes = unb64u(t.slice(1));
    if (t[0] === "1") {
      if (typeof DecompressionStream !== "function") throw new Error("This phone can't open compressed links");
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } else if (t[0] !== "0") throw new Error("bad link");
    if (bytes.length > 400000) throw new Error("too big");
    var r = sanitizeRoutine(JSON.parse(new TextDecoder().decode(bytes)));
    if (!r) throw new Error("bad link");
    return r;
  }

  return {
    BEATS: BEATS, LIMITS: LIMITS, MOVES: MOVES,
    uid: uid, clamp: clamp, clampBpm: clampBpm,
    blankCount: blankCount, newSection: newSection, newRoutine: newRoutine, sanitizeRoutine: sanitizeRoutine,
    flatten: flatten, totalCounts: totalCounts,
    beatAt: beatAt, posSec: posSec, beatMs: beatMs, countoffMs: countoffMs,
    nextMark: nextMark, nextClock: nextClock, fmtClock: fmtClock,
    audioPlan: audioPlan, driftRate: driftRate,
    compact: compact, encodeRoutine: encodeRoutine, decodeRoutine: decodeRoutine
  };
});
