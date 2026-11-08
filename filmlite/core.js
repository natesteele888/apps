/* Film Lite core: pure logic with no DOM, so it can be tested on its own.
   Loaded before the other scripts in the browser (window.FilmCore) and by node tests (module.exports). */
(function (root) {
  "use strict";

  var VERSION = "Film Lite v1";
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  var YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_T = 360000;          // 100 hours, a sanity cap for any time value
  var MAX_TAGS = 300, MAX_CLIPS = 200, MAX_STROKES = 60, MAX_PEN_POINTS = 400, MAX_PARTS = 8;
  var SEEK_BIAS = 0.02;        // seek this far (in frames) past a frame boundary so float rounding never lands on the frame before
  var MIN_LOOP = 0.05;

  var CATS = [
    { id: "good", label: "Good" },
    { id: "fix", label: "Fix" },
    { id: "question", label: "Question" },
    { id: "coach", label: "Coach note" }
  ];
  var CAT_IDS = CATS.map(function (c) { return c.id; });
  function catLabel(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].label; return CATS[1].label; }

  var PRESETS = [
    { id: "none", label: "No part labels", parts: [] },
    { id: "baseball-hit", label: "Baseball: hitting", parts: ["Load", "Stride", "Hands", "Contact", "Finish"] },
    { id: "baseball-pitch", label: "Baseball: pitching", parts: ["Grip", "Balance", "Arm slot", "Release", "Follow-through"] },
    { id: "basketball-shoot", label: "Basketball: shooting", parts: ["Feet", "Elbow", "Release", "Follow-through"] },
    { id: "cheer", label: "Cheer", parts: ["Timing", "Landing", "Formation", "Spacing"] },
    { id: "custom", label: "Custom", parts: [] }
  ];
  var PRESET_IDS = PRESETS.map(function (p) { return p.id; });
  var FPS_OPTIONS = [24, 30, 60];
  var SPEEDS = [0.25, 0.5, 1, 1.5, 2];
  var COLORS = ["#ffd23f", "#ff5a4f", "#3de0ff"];
  var WIDTHS = [0.009, 0.016, 0.028];        // line width as a fraction of the longer side of the frame
  var TOOLS = ["pen", "arrow", "circle", "line", "angle"];

  /* ---------- small helpers ---------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null ? "" : String(x));
    return s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function num(x, lo, hi, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean") return def;
    var n = Number(x);
    if (!isFinite(n)) return def;
    return clamp(n, lo, hi);
  }
  function int(x, lo, hi, def) { var n = num(x, lo, hi, null); return n === null ? def : Math.round(n); }
  function round(n, d) { var m = Math.pow(10, d); return Math.round(n * m + (n < 0 ? -1e-9 : 1e-9)) / m; }
  var seq = 0;
  function uid(prefix) {
    seq = (seq + 1) % 1296;
    return (prefix || "x") + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + seq.toString(36);
  }
  function isYMD(s) {
    if (typeof s !== "string" || !YMD_RE.test(s)) return false;
    var p = s.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  /* Today as YYYY-MM-DD in the phone's local time. A test (or anything else) can pass an override. */
  function todayStr(override) {
    if (isYMD(override)) return override;
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(ymd) {
    if (!isYMD(ymd)) return "";
    var p = ymd.split("-").map(Number);
    return MONTHS[p[1] - 1] + " " + p[2] + ", " + p[0];
  }
  function fmtSize(b) {
    b = Number(b);
    if (!isFinite(b) || b < 0) return "";
    if (b < 1024) return Math.round(b) + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    if (b < 1073741824) return (Math.round(b / 104857.6) / 10) + " MB";
    return (Math.round(b / 107374182.4) / 10) + " GB";
  }

  /* ---------- time ---------- */
  /* m:ss, m:ss.d or m:ss.cc (dec = 0, 1 or 2); h:mm:ss once past an hour. Rounds first, then splits,
     so 59.999 shows as 1:00.0 and never as 0:60.0. */
  function fmtTime(t, dec) {
    dec = dec == null ? 1 : clamp(Math.round(dec), 0, 3);
    t = Number(t);
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.pow(10, dec);
    var total = Math.floor(t * m + 0.5 + 1e-9);
    var whole = Math.floor(total / m), frac = total - whole * m;
    var s = whole % 60, mi = Math.floor(whole / 60) % 60, h = Math.floor(whole / 3600);
    var fs = dec ? "." + ("000" + frac).slice(-dec) : "";
    var ss = pad2(s) + fs;
    return h ? h + ":" + pad2(mi) + ":" + ss : Math.floor(whole / 60) + ":" + ss;
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  /* ---------- frames ---------- */
  function okFps(f) { f = Number(f); return isFinite(f) && f > 0 ? f : 30; }
  function frameIndex(t, fps) { fps = okFps(fps); t = isFinite(t) && t > 0 ? t : 0; return Math.floor(t * fps + 1e-6); }
  function frameTime(n, fps) { return Math.max(0, n) / okFps(fps); }
  function snapToFrame(t, fps) { fps = okFps(fps); t = isFinite(t) && t > 0 ? t : 0; return Math.round(t * fps) / fps; }
  function sameFrame(a, b, fps) { return Math.abs(a - b) < 0.0015 || frameIndex(a, fps) === frameIndex(b, fps); }
  /* Time of the frame one step away. dir > 0 goes forward, otherwise back. From the middle of a frame,
     "back" goes to the start of that same frame first. Always clamped to 0..dur. */
  function stepTime(t, dir, fps, dur) {
    fps = okFps(fps);
    var d = isFinite(dur) && dur > 0 ? dur : Infinity;
    t = isFinite(t) ? clamp(t, 0, d) : 0;
    var f = t * fps, n = Math.floor(f + 1e-6), frac = f - n;
    var target = dir > 0 ? n + 1 : (frac > 0.1 ? n : n - 1);
    return clamp(round(target / fps, 6), 0, d);
  }
  /* Where to actually seek for a frame boundary: a hair into the frame. */
  function seekTime(t, fps, dur) {
    var d = isFinite(dur) && dur > 0 ? dur : Infinity;
    return Math.min(d, Math.max(0, t) + SEEK_BIAS / okFps(fps));
  }
  function nudgeTime(t, delta, dur) {
    var d = isFinite(dur) && dur > 0 ? dur : Infinity;
    t = isFinite(t) ? t : 0;
    return clamp(Math.round((t + delta) * 1000) / 1000, 0, d);
  }

  /* ---------- tags ---------- */
  function sortTags(tags) {
    return (tags || []).slice().sort(function (a, b) {
      if (a.t !== b.t) return a.t - b.t;
      var ae = a.e == null ? -1 : a.e, be = b.e == null ? -1 : b.e;
      if (ae !== be) return ae - be;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  function tagEnd(g) { return g.e != null && g.e > g.t ? g.e : g.t; }
  function tagsOverlap(a, b) { return a.t <= tagEnd(b) && b.t <= tagEnd(a); }
  /* Rows for segment tags on the scrub bar: overlapping segments get different rows (0, 1, 2...). Point tags get no row. */
  function assignLanes(tags) {
    var lanes = {}, ends = [];
    sortTags(tags).forEach(function (g) {
      if (!(g.e != null && g.e > g.t)) return;
      var i = 0;
      while (i < ends.length && ends[i] >= g.t) i++;
      ends[i] = g.e; lanes[g.id] = i;
    });
    return lanes;
  }
  function filterTags(tags, cat) { return !cat || cat === "all" ? sortTags(tags) : sortTags(tags).filter(function (g) { return g.cat === cat; }); }
  function countByCat(tags) {
    var c = { all: 0, good: 0, fix: 0, question: 0, coach: 0 };
    (tags || []).forEach(function (g) { c.all++; if (c[g.cat] != null) c[g.cat]++; });
    return c;
  }
  /* The range "Loop this tag" repeats. A segment loops itself; a single moment loops 1 s before to 2 s after. */
  function tagLoopRange(g, dur) {
    var a, b;
    if (g.e != null && g.e > g.t) { a = g.t; b = g.e; }
    else { a = Math.max(0, g.t - 1); b = g.t + 2; }
    if (isFinite(dur) && dur > 0) { b = Math.min(b, dur); a = Math.min(a, b); if (b - a < 0.3) a = Math.max(0, b - 0.3); }
    a = round3(a); b = round3(b);
    return b - a >= MIN_LOOP ? { a: a, b: b } : null;
  }
  /* When playback reaches b, jump back to a. Returns the time to jump to, or null to carry on. */
  function loopWrap(t, a, b, eps) {
    if (!isFinite(t) || !isFinite(a) || !isFinite(b) || b - a < MIN_LOOP) return null;
    return t >= b - (eps || 0) ? a : null;
  }
  function inLoop(t, a, b, slack) { slack = slack == null ? 0.05 : slack; return t >= a - slack && t <= b + slack; }
  /* Tags whose drawing belongs on the frame at time t (the frame the tag was made on). */
  function drawingTagsAt(tags, t, fps) {
    return (tags || []).filter(function (g) { return g.d && g.d.s && g.d.s.length && sameFrame(t, g.t, fps); });
  }
  /* The tag to highlight in the list at time t: a segment that contains t, else a moment on this frame or just before. */
  function activeTagAt(tags, t, fps) {
    var best = null, bestT = -1, tol = Math.max(1.5 / okFps(fps), 0.05);
    sortTags(tags).forEach(function (g) {
      var hit = g.e != null && g.e > g.t ? (t >= g.t - 0.001 && t <= g.e) : (t >= g.t - 0.001 && t <= g.t + tol);
      if (hit && g.t >= bestT) { best = g; bestT = g.t; }
    });
    return best ? best.id : null;
  }
  function tagLine(g) {
    var s = fmtTime(g.t, 1) + (g.e != null && g.e > g.t ? "-" + fmtTime(g.e, 1) : "") + " " + catLabel(g.cat);
    if (g.part) s += " (" + g.part + ")";
    if (g.note) s += " - " + g.note.replace(/\s*\n\s*/g, " ").trim();
    return s;
  }
  /* The plain-text notes: a title, then one line per tag in time order. */
  function notesToText(clip, opts) {
    var lines = [], tags = sortTags(clip.tags);
    if (!opts || opts.header !== false) { lines.push(clip.title || clip.name || "Clip"); lines.push(""); }
    if (!tags.length) lines.push("(No tags yet)");
    tags.forEach(function (g) { lines.push(tagLine(g)); });
    return lines.join("\n");
  }
  function slug(s) {
    var o = String(s || "").toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return o || "clip";
  }

  /* ---------- fingerprint (how notes find their video again) ---------- */
  function fnv1a(s, seed) {
    var h = seed == null ? 0x811c9dc5 : seed >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function hex8(n) { return ("00000000" + (n >>> 0).toString(16)).slice(-8); }
  function fpKey(m) {
    return String(m.name == null ? "" : m.name).slice(0, 200) + "|" + (Math.round(Number(m.size)) || 0) + "|" + (Math.round(Number(m.lm)) || 0) + "|" + (Math.round(Number(m.dur)) || 0);
  }
  function fingerprint(m) { var k = fpKey(m); return "f" + hex8(fnv1a(k)) + hex8(fnv1a(k, 0x9747b28c)); }
  /* Find the saved notes for a video the user just picked. Exact fingerprint first; then a looser match
     (same name and size, or same size and date) in case a phone changed the date or the name on the way in. */
  function matchClip(clips, m) {
    var fp = fingerprint(m), i, c, dur = Number(m.dur) || 0;
    for (i = 0; i < clips.length; i++) if (clips[i].id === fp) return clips[i];
    for (i = 0; i < clips.length; i++) {
      c = clips[i];
      if (c.id === "example" || !c.size || Math.abs(c.dur - dur) > 1.5) continue;
      if (c.size === m.size && c.name === m.name) return c;
    }
    for (i = 0; i < clips.length; i++) {
      c = clips[i];
      if (c.id === "example" || !c.size || !c.lm || Math.abs(c.dur - dur) > 1.5) continue;
      if (c.size === m.size && c.lm === m.lm) return c;
    }
    return null;
  }

  /* ---------- drawing ---------- */
  function norm(px, py, w, h) { return [round(clamp(px / (w || 1), 0, 1), 4), round(clamp(py / (h || 1), 0, 1), 4)]; }
  function denorm(p, w, h) { return [p[0] * w, p[1] * h]; }
  function dist(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); }
  function angleOf(u, v) {
    var lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    if (lu < 1e-12 || lv < 1e-12) return 0;
    var c = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
    return Math.acos(clamp(c, -1, 1)) * 180 / Math.PI;
  }
  /* Degrees between two lines (each [[x1,y1],[x2,y2]], in any one consistent space).
     If the lines meet at an end (within tol), it is the angle at that corner, 0 to 180. Otherwise it is the angle between
     the directions the lines were drawn in, so perpendicular is 90 and parallel is 0 (same way) or 180 (opposite ways). */
  function angleDeg(l1, l2, tol) {
    tol = tol == null ? 0 : tol;
    var best = null, i, j;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      var d = dist(l1[i], l2[j]);
      if (d <= tol && (!best || d < best.d)) best = { d: d, i: i, j: j };
    }
    var r;
    if (best) {
      var v = l1[best.i], a = l1[1 - best.i], b = l2[1 - best.j];
      r = { deg: angleOf([a[0] - v[0], a[1] - v[1]], [b[0] - v[0], b[1] - v[1]]), joined: true, vertex: [v[0], v[1]], arms: [a, b] };
    } else {
      r = { deg: angleOf([l1[1][0] - l1[0][0], l1[1][1] - l1[0][1]], [l2[1][0] - l2[0][0], l2[1][1] - l2[0][1]]), joined: false, vertex: null, arms: null };
    }
    return r;
  }
  /* The angle of a saved "angle" stroke (4 normalized points). ar = frame width / height, so degrees are true on screen. */
  function strokeAngle(p, ar) {
    ar = ar > 0 ? ar : 1;
    var q = p.map(function (pt) { return [pt[0] * ar, pt[1]]; });
    var r = angleDeg([q[0], q[1]], [q[2], q[3]], 0.035 * Math.max(ar, 1));
    if (r.vertex) { r.vertex = [r.vertex[0] / ar, r.vertex[1]]; r.arms = r.arms.map(function (a) { return [a[0] / ar, a[1]]; }); }
    r.deg = round(r.deg, 1);
    return r;
  }
  var NPTS = { line: 2, arrow: 2, circle: 2, angle: 4 };
  function sanitizeStroke(s) {
    if (!isObj(s) || TOOLS.indexOf(s.k) < 0 || !Array.isArray(s.p)) return null;
    var pts = [];
    for (var i = 0; i < s.p.length && pts.length < MAX_PEN_POINTS; i++) {
      var p = s.p[i];
      if (!Array.isArray(p) || p.length < 2) return null;
      var x = Number(p[0]), y = Number(p[1]);
      if (!isFinite(x) || !isFinite(y)) return null;
      pts.push([round(clamp(x, 0, 1), 4), round(clamp(y, 0, 1), 4)]);
    }
    if (s.k === "pen" ? pts.length < 1 : pts.length !== NPTS[s.k]) return null;
    return { k: s.k, c: int(s.c, 0, COLORS.length - 1, 0), w: int(s.w, 0, WIDTHS.length - 1, 1), p: pts };
  }
  function sanitizeDrawing(d) {
    if (!isObj(d) || !Array.isArray(d.s)) return null;
    var out = [];
    for (var i = 0; i < d.s.length && out.length < MAX_STROKES; i++) { var s = sanitizeStroke(d.s[i]); if (s) out.push(s); }
    return out.length ? { ar: round(num(d.ar, 0.2, 5, 16 / 9), 4), s: out } : null;
  }

  /* ---------- settings, tags, clips ---------- */
  function parseLabels(text) {
    var seen = {}, out = [];
    String(text == null ? "" : text).split(/[,\n;]/).forEach(function (x) {
      x = str(x, 40).replace(/\s+/g, " ").trim().slice(0, 20).trim();
      var k = x.toLowerCase();
      if (x && !seen[k] && out.length < MAX_PARTS) { seen[k] = 1; out.push(x); }
    });
    return out;
  }
  function pick(v, list, def) { v = Number(v); return list.indexOf(v) >= 0 ? v : def; }
  function sanitizeSettings(raw) {
    raw = isObj(raw) ? raw : {};
    return {
      fps: pick(raw.fps, FPS_OPTIONS, 30),
      speed: pick(raw.speed, SPEEDS, 1),
      precise: raw.precise === true,
      preset: PRESET_IDS.indexOf(raw.preset) >= 0 ? raw.preset : "baseball-hit",
      custom: Array.isArray(raw.custom) ? parseLabels(raw.custom.join(",")) : []
    };
  }
  function partsFor(settings) {
    var s = sanitizeSettings(settings);
    if (s.preset === "custom") return s.custom.slice();
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === s.preset) return PRESETS[i].parts.slice();
    return [];
  }
  function sanitizeTag(raw) {
    if (!isObj(raw)) return null;
    var t = Number(raw.t);
    if (raw.t == null || raw.t === "" || !isFinite(t)) return null;
    t = round3(clamp(t, 0, MAX_T));
    var e = raw.e == null || raw.e === "" ? null : Number(raw.e);
    e = e !== null && isFinite(e) && e > t + 0.0009 ? round3(clamp(e, 0, MAX_T)) : null;
    return {
      id: typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : uid("t"),
      t: t, e: e,
      cat: CAT_IDS.indexOf(raw.cat) >= 0 ? raw.cat : "fix",
      part: str(raw.part, 20).replace(/\s+/g, " ").trim(),
      note: str(raw.note, 500).replace(/^\s+|\s+$/g, ""),
      d: sanitizeDrawing(raw.d)
    };
  }
  function stripExt(n) { return String(n || "").replace(/\.[A-Za-z0-9]{2,5}$/, ""); }
  function sanitizeClip(raw, today) {
    if (!isObj(raw) || typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
    var name = str(raw.name, 200).trim();
    var created = isYMD(raw.created) ? raw.created : (isYMD(today) ? today : "2000-01-01");
    var seen = {}, tags = [];
    (Array.isArray(raw.tags) ? raw.tags : []).forEach(function (x) {
      if (tags.length >= MAX_TAGS) return;
      var g = sanitizeTag(x);
      if (!g) return;
      while (seen[g.id]) g.id = uid("t");
      seen[g.id] = 1; tags.push(g);
    });
    return {
      id: raw.id, name: name, size: int(raw.size, 0, 1e12, 0), lm: int(raw.lm, 0, 1e14, 0), dur: int(raw.dur, 0, 1e6, 0),
      title: str(raw.title, 80).replace(/\s+/g, " ").trim() || stripExt(name) || "Clip",
      created: created, updated: isYMD(raw.updated) ? raw.updated : created, tags: tags
    };
  }
  function makeBackup(settings, clips, today) {
    return {
      app: "filmlite", v: 1, saved: isYMD(today) ? today : todayStr(),
      note: "Notes and settings only. Videos are never included. Pick the same video file again and its notes come back.",
      settings: sanitizeSettings(settings),
      clips: (clips || []).map(function (c) { return sanitizeClip(c, today); }).filter(Boolean)
    };
  }
  function validateBackup(obj, today) {
    if (!isObj(obj)) return { ok: false, error: "That file isn't a Film Lite backup." };
    if (obj.app !== "filmlite") return { ok: false, error: "That file isn't a Film Lite backup." };
    if (typeof obj.v !== "number" || obj.v < 1) return { ok: false, error: "That backup file is missing its version." };
    if (obj.v > 1) return { ok: false, error: "That backup came from a newer version of Film Lite. Update the app and try again." };
    if (!Array.isArray(obj.clips)) return { ok: false, error: "That backup file has no clips list." };
    var seen = {}, clips = [];
    obj.clips.forEach(function (c) {
      if (clips.length >= MAX_CLIPS) return;
      var k = sanitizeClip(c, today);
      if (k && !seen[k.id]) { seen[k.id] = 1; clips.push(k); }
    });
    var tags = clips.reduce(function (n, c) { return n + c.tags.length; }, 0);
    return { ok: true, settings: sanitizeSettings(obj.settings), clips: clips, tagCount: tags, skipped: obj.clips.length - clips.length };
  }

  var api = {
    VERSION: VERSION, ID_RE: ID_RE, CATS: CATS, CAT_IDS: CAT_IDS, catLabel: catLabel, PRESETS: PRESETS, PRESET_IDS: PRESET_IDS,
    FPS_OPTIONS: FPS_OPTIONS, SPEEDS: SPEEDS, COLORS: COLORS, WIDTHS: WIDTHS, TOOLS: TOOLS, SEEK_BIAS: SEEK_BIAS,
    MAX_TAGS: MAX_TAGS, MAX_CLIPS: MAX_CLIPS, MAX_STROKES: MAX_STROKES, MAX_PARTS: MAX_PARTS,
    str: str, clamp: clamp, int: int, uid: uid, isYMD: isYMD, todayStr: todayStr, fmtDate: fmtDate, fmtSize: fmtSize, fmtTime: fmtTime, slug: slug, stripExt: stripExt,
    frameIndex: frameIndex, frameTime: frameTime, snapToFrame: snapToFrame, sameFrame: sameFrame, stepTime: stepTime, seekTime: seekTime, nudgeTime: nudgeTime,
    sortTags: sortTags, tagsOverlap: tagsOverlap, assignLanes: assignLanes, filterTags: filterTags, countByCat: countByCat,
    tagLoopRange: tagLoopRange, loopWrap: loopWrap, inLoop: inLoop, drawingTagsAt: drawingTagsAt, activeTagAt: activeTagAt, tagLine: tagLine, notesToText: notesToText,
    fnv1a: fnv1a, fpKey: fpKey, fingerprint: fingerprint, matchClip: matchClip,
    norm: norm, denorm: denorm, angleDeg: angleDeg, strokeAngle: strokeAngle, sanitizeStroke: sanitizeStroke, sanitizeDrawing: sanitizeDrawing,
    parseLabels: parseLabels, sanitizeSettings: sanitizeSettings, partsFor: partsFor, sanitizeTag: sanitizeTag, sanitizeClip: sanitizeClip,
    makeBackup: makeBackup, validateBackup: validateBackup
  };
  root.FilmCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
