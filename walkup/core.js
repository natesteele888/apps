/* Walk-Up core: pure logic with no DOM and no audio, so it can be tested on its own.
   Loaded before the other scripts in the browser (window.WalkupCore) and by node tests (module.exports).
   Owns: trim math, peaks, the mix plan, the balance law, the voice polish chain settings, the reverb impulse
   response, roster and lineup moves, the paste-a-list parser, and everything that cleans up saved data and backups. */
(function (root) {
  "use strict";

  var VERSION = "Walk-Up v1";
  var ID_RE = /^[A-Za-z0-9_-]{3,40}$/;
  var KEY_RE = /^[sv]:[A-Za-z0-9_-]{3,40}$/;
  var LIM = {
    roster: 40, name: 40, num: 4, pos: 12, title: 60, file: 120,
    minLen: 1, maxLen: 30, maxFade: 3, defLen: 10, defFade: 1, maxDelay: 20,
    maxSongBytes: 60 * 1024 * 1024, maxBundleBytes: 80 * 1024 * 1024, maxVoiceSec: 30, stopFade: 0.5,
    // "keep playing": how far past the clip a song may run when the coach holds on the watch, and its fade at the end
    defExt: 30, maxExt: 60, extFade: 2,
    // game sounds: how many buttons, how long a button's name, how many can wait in Up next
    board: 12, boardLabel: 30, queue: 10
  };
  var BUNDLE_CHUNK = 196608; // bytes per base64 chunk in a "back up everything" file (a multiple of 3)
  var ATTACK = 0.008, END_RAMP = 0.01, VOICE_RAMP = 0.02;

  /* ---------- small helpers ---------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) {
    var s = typeof x === "string" ? x : (x == null ? "" : String(x));
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "").slice(0, max);
  }
  function num(x, def) {
    if (x === null || x === undefined || x === "" || typeof x === "boolean") return def;
    var n = Number(x);
    return isFinite(n) ? n : def;
  }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function int(x, lo, hi, def) { var n = num(x, null); return n === null ? def : clamp(Math.round(n), lo, hi); }
  function q1(x) { return Math.round(x * 10) / 10; }
  function q20(x) { return Math.round(x * 20) / 20; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function fl2(x) { return Math.floor(x * 100 + 1e-7) / 100; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() {
    var s = "";
    try {
      var b = new Uint8Array(6); (root.crypto || {}).getRandomValues(b);
      for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36);
    } catch (e) { s = Math.random().toString(36).slice(2, 8); }
    return s + Date.now().toString(36).slice(-4);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isYMD(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 1900 && +s.slice(0, 4) <= 2200 && +s.slice(5, 7) >= 1 && +s.slice(5, 7) <= 12 && +s.slice(8, 10) >= 1 && +s.slice(8, 10) <= 31; }
  function todayStr(override) {
    if (isYMD(override)) return override;
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /* ---------- formatting ---------- */
  /* 62.5 -> "1:02" or "1:02.5" (tenths); 3725 -> "1:02:05" */
  function fmtClock(sec, tenths) {
    sec = Math.max(0, num(sec, 0));
    var t = tenths ? Math.round(sec * 10) : Math.round(sec) * 10;
    var tt = t % 10, s = Math.floor(t / 10), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var body = h ? h + ":" + pad(m) + ":" + pad(ss) : m + ":" + pad(ss);
    return tenths ? body + "." + tt : body;
  }
  function fmtSecs(sec) { return (Math.round(Math.max(0, num(sec, 0)) * 10) / 10).toFixed(1) + " s"; }
  function fmtSize(b) {
    b = Math.max(0, num(b, 0));
    if (b < 1024) return Math.round(b) + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    if (b < 1073741824) return (Math.round(b / 1048576 * 10) / 10).toFixed(1) + " MB";
    return (Math.round(b / 1073741824 * 10) / 10).toFixed(1) + " GB";
  }
  /* decibels as text; a very quiet level reads "off" */
  function fmtDb(db) {
    if (db === -Infinity || db < -59.95) return "off";
    var r = Math.round(db * 10) / 10;
    if (r === 0) return "0 dB";
    return (r > 0 ? "+" : "") + r.toFixed(1) + " dB";
  }
  function fileTitle(name) { return str(String(name || "").replace(/\.[A-Za-z0-9]{1,5}$/, ""), LIM.title) || "Song"; }

  /* ---------- decibels and the balance law ---------- */
  function dbToGain(db) { return Math.pow(10, db / 20); }
  function gainToDb(g) { return g <= 0 ? -Infinity : 20 * Math.log10(g); }
  function levelDb(g) { return g <= 0.001 ? -Infinity : gainToDb(g); }
  /* The Balance scrubber: -100 (music louder) .. 0 (centre, both at their normal level) .. +100 (voice louder).
     Equal-power crossfade scaled so the centre is 1 and 1 for both; the louder side never goes above its normal level. */
  function balanceGains(bal) {
    var b = clamp(num(bal, 0), -100, 100) / 100;
    var th = (b + 1) / 2 * Math.PI / 2;
    var m = Math.min(1, Math.SQRT2 * Math.cos(th)), v = Math.min(1, Math.SQRT2 * Math.sin(th));
    if (b >= 1) m = 0;
    if (b <= -1) v = 0;
    return { music: m, voice: v, musicDb: levelDb(m), voiceDb: levelDb(v) };
  }
  /* a recording is normalised so its loudest point sits at -1 dBFS */
  function normalizeGain(peak) {
    if (!(peak > 1e-4)) return 1;
    return Math.min(dbToGain(24), dbToGain(-1) / peak);
  }

  /* ---------- trim math (all times in seconds, on a 0.1 s grid) ---------- */
  function clampTrim(dur, t) {
    t = isObj(t) ? t : {};
    var D = fl2(Math.max(0, num(dur, 0))), len, start;
    if (D > 0) {
      var minLen = Math.min(LIM.minLen, D), maxLen = Math.min(LIM.maxLen, D);
      len = clamp(q1(num(t.len, LIM.defLen)), minLen, maxLen);
      start = clamp(q1(num(t.start, 0)), 0, Math.max(0, fl2(D - len)));
    } else {
      len = clamp(q1(num(t.len, LIM.defLen)), LIM.minLen, LIM.maxLen);
      start = clamp(q1(num(t.start, 0)), 0, 86400);
    }
    var fade = clamp(q1(num(t.fade, LIM.defFade)), 0, Math.min(LIM.maxFade, len));
    return { start: start, len: len, fade: fade };
  }
  function defaultTrim(dur, defs) {
    defs = isObj(defs) ? defs : {};
    var D = fl2(Math.max(0, num(dur, 0)));
    var len = D > 0 ? clamp(q1(num(defs.len, LIM.defLen)), Math.min(LIM.minLen, D), Math.min(LIM.maxLen, D)) : clamp(q1(num(defs.len, LIM.defLen)), LIM.minLen, LIM.maxLen);
    var fade = clamp(q1(num(defs.fade, LIM.defFade)), 0, Math.min(LIM.maxFade, q1(len / 2)));
    return { start: 0, len: len, fade: fade };
  }
  function limits(dur) {
    var D = fl2(Math.max(0, num(dur, 0)));
    return { D: D, minLen: D > 0 ? Math.min(LIM.minLen, D) : LIM.minLen, maxLen: D > 0 ? Math.min(LIM.maxLen, D) : LIM.maxLen };
  }
  /* move the whole selection, keeping its length */
  function moveStart(dur, t, v) { var c = clampTrim(dur, t); return clampTrim(dur, { start: v, len: c.len, fade: c.fade }); }
  /* change the length; the start stays where it is, so the song's end can limit the length */
  function setLen(dur, t, v) {
    var c = clampTrim(dur, t), L = limits(dur);
    var maxLen = L.D > 0 ? Math.min(LIM.maxLen, fl2(L.D - c.start)) : LIM.maxLen;
    var len = clamp(q1(num(v, c.len)), L.minLen, Math.max(L.minLen, maxLen));
    return clampTrim(dur, { start: c.start, len: len, fade: c.fade });
  }
  function setFade(dur, t, v) { var c = clampTrim(dur, t); return clampTrim(dur, { start: c.start, len: c.len, fade: v }); }
  /* drag the left handle: the end stays put */
  function dragStart(dur, t, v) {
    var c = clampTrim(dur, t), L = limits(dur), end = Math.round((c.start + c.len) * 100) / 100;
    var s = clamp(q1(num(v, c.start)), Math.max(0, end - L.maxLen), Math.max(0, end - L.minLen));
    return clampTrim(dur, { start: s, len: Math.round((end - s) * 100) / 100, fade: c.fade });
  }
  /* drag the right handle: the start stays put */
  function dragEnd(dur, t, v) { var c = clampTrim(dur, t); return setLen(dur, c, num(v, c.start + c.len) - c.start); }

  /* ---------- peaks and silence ---------- */
  /* Max absolute value in n equal buckets of data[from..to). Optionally fills only buckets b0..b1 of `out` (keeping the larger value),
     so a caller can do the work in slices and combine channels. */
  function peaks(data, n, from, to, out, b0, b1) {
    var len = data.length;
    from = Math.max(0, Math.min(len, Math.floor(from == null ? 0 : from)));
    to = Math.max(from, Math.min(len, Math.ceil(to == null ? len : to)));
    out = out || new Float32Array(n);
    b0 = b0 || 0; b1 = b1 == null ? n : Math.min(n, b1);
    var span = to - from;
    if (span <= 0 || n <= 0) return out;
    for (var i = b0; i < b1; i++) {
      var a = from + Math.floor(i * span / n), b = from + Math.floor((i + 1) * span / n);
      if (b <= a) b = a + 1;
      if (b > to) b = to;
      var m = 0;
      for (var j = a; j < b; j++) { var v = data[j]; if (v < 0) v = -v; if (v > m) m = v; }
      if (m > out[i]) out[i] = m;
    }
    return out;
  }
  /* First and last 10 ms windows louder than the threshold, widened by a little padding. null when it is all quiet. */
  function silenceRegion(data, sr, thrDb, headPad, tailPad) {
    var thr = dbToGain(thrDb), win = Math.max(1, Math.round(sr * 0.01)), n = data.length, first = -1, last = -1;
    for (var s = 0; s < n; s += win) {
      var e = Math.min(n, s + win), m = 0;
      for (var j = s; j < e; j++) { var v = data[j]; if (v < 0) v = -v; if (v > m) m = v; }
      if (m > thr) { if (first < 0) first = s; last = e; }
    }
    if (first < 0) return null;
    return { start: Math.max(0, first / sr - num(headPad, 0.05)), end: Math.min(n / sr, last / sr + num(tailPad, 0.15)) };
  }

  /* ---------- voice polish chain ---------- */
  var EQ_BANDS = [{ f: 100, q: 1 }, { f: 400, q: 1 }, { f: 1000, q: 1 }, { f: 3000, q: 1 }, { f: 8000, q: 1 }];
  var EQ_PRESETS = [
    { id: "flat", label: "Flat", eq: [0, 0, 0, 0, 0], hp: false },
    { id: "announcer", label: "Announcer", eq: [2, 4, 0, 4, 1], hp: true },
    { id: "stadium", label: "Stadium", eq: [6, 2, -2, 2, 6], hp: false },
    { id: "clear", label: "Clear", eq: [-4, -2, 0, 4, 2], hp: true }
  ];
  var COMP = {
    off: null,
    light: { threshold: -20, knee: 15, ratio: 3, attack: 0.01, release: 0.25 },
    strong: { threshold: -30, knee: 8, ratio: 8, attack: 0.004, release: 0.15 }
  };
  var COMP_IDS = ["off", "light", "strong"];
  var REVERB = {
    small: { label: "Small room", rt: 0.5, pre: 0.004 },
    gym: { label: "Gym", rt: 1.4, pre: 0.012 },
    stadium: { label: "Stadium", rt: 3.0, pre: 0.03 }
  };
  var REVERB_IDS = ["small", "gym", "stadium"];

  function flatPolish() { return { hp: false, hpf: 80, eq: [0, 0, 0, 0, 0], comp: "off", size: "small", wet: 0, out: 0 }; }
  function factoryAnnouncer() { return { hp: true, hpf: 80, eq: [2, 4, 0, 4, 1], comp: "light", size: "small", wet: 15, out: 0 }; }
  function sanitizePolish(r) {
    r = isObj(r) ? r : {};
    var eq = [];
    for (var i = 0; i < 5; i++) eq.push(int(Array.isArray(r.eq) ? r.eq[i] : 0, -12, 12, 0));
    return { hp: r.hp === true, hpf: int(r.hpf, 60, 200, 80), eq: eq, comp: COMP_IDS.indexOf(r.comp) >= 0 ? r.comp : "off", size: REVERB[r.size] ? r.size : "small", wet: int(r.wet, 0, 100, 0), out: int(r.out, -12, 12, 0) };
  }
  function applyPreset(p, id) {
    var pr = null;
    for (var i = 0; i < EQ_PRESETS.length; i++) if (EQ_PRESETS[i].id === id) pr = EQ_PRESETS[i];
    var o = sanitizePolish(p);
    if (!pr) return o;
    o.eq = pr.eq.slice(); o.hp = pr.hp;
    return o;
  }
  function presetOf(p) {
    p = sanitizePolish(p);
    for (var i = 0; i < EQ_PRESETS.length; i++) if (EQ_PRESETS[i].eq.join() === p.eq.join()) return EQ_PRESETS[i].id;
    return "custom";
  }
  /* wet/dry amount (0..100) -> the two gains (equal-power-ish) */
  function reverbMix(wet) {
    var t = clamp(num(wet, 0), 0, 100) / 100 * Math.PI / 4;
    return { dry: Math.cos(t), wet: 1.5 * Math.sin(t) };
  }
  /* what the audio engine builds, as plain numbers */
  function chainSpec(p) {
    p = sanitizePolish(p);
    var rm = reverbMix(p.wet);
    return {
      hp: p.hp ? { freq: p.hpf, q: 0.707 } : null,
      eq: EQ_BANDS.map(function (b, i) { return { f: b.f, q: b.q, gain: p.eq[i] }; }),
      comp: COMP[p.comp] || null,
      rev: p.wet > 0 ? { size: p.size, dry: rm.dry, wet: rm.wet } : null,
      out: dbToGain(p.out)
    };
  }
  function polishKey(p) { p = sanitizePolish(p); return [p.hp ? 1 : 0, p.hpf, p.eq.join(","), p.comp, p.size, p.wet, p.out].join("|"); }
  function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  /* the key a rendered (polished) voice is cached under: same settings, same key */
  function voiceRenderKey(v, sr) {
    return hash32([v.id, num(v.ts, 0).toFixed(3), num(v.te, 0).toFixed(3), v.norm ? 1 : 0, Math.round(sr), polishKey(v.polish)].join("#"));
  }
  /* the tail of reverb to keep after the dry voice ends (seconds) */
  function reverbTail(p) {
    p = sanitizePolish(p);
    return p.wet > 0 ? REVERB[p.size].rt + REVERB[p.size].pre : 0.05;
  }
  /* A stereo room impulse response: noise that dies away exponentially (-60 dB at the room's decay time), after a short
     pre-delay. Seeded, so the same seed always gives the same room. Energy is scaled to 1 so it does not change the level. */
  function impulseResponse(size, sr, seed) {
    var r = REVERB[size] || REVERB.small, n = Math.max(1, Math.round((r.rt + r.pre) * sr)), pre = Math.round(r.pre * sr), ch = [];
    for (var c = 0; c < 2; c++) {
      var rnd = prng((num(seed, 1) >>> 0) + c * 7919), d = new Float32Array(n), e = 0;
      for (var i = pre; i < n; i++) {
        var t = (i - pre) / sr, v = (rnd() * 2 - 1) * Math.exp(-6.9078 * t / r.rt);
        d[i] = v; e += v * v;
      }
      var k = e > 0 ? 1 / Math.sqrt(e) : 1;
      for (var j = 0; j < n; j++) d[j] *= k;
      ch.push(d);
    }
    return ch;
  }
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- the mix plan ---------- */
  function defaultMix() { return { bal: 0, mv: 100, vv: 100, vd: 1, md: 0, duck: true, dd: 9, da: 0.1, dr: 0.3 }; }
  function sanitizeMix(r) {
    r = isObj(r) ? r : {};
    return {
      bal: int(r.bal, -100, 100, 0), mv: int(r.mv, 0, 100, 100), vv: int(r.vv, 0, 100, 100),
      vd: clamp(q1(num(r.vd, 1)), 0, LIM.maxDelay), md: clamp(q1(num(r.md, 0)), 0, LIM.maxDelay),
      duck: r.duck !== false, dd: int(r.dd, 0, 18, 9), da: clamp(q20(num(r.da, 0.1)), 0.05, 0.5), dr: clamp(q20(num(r.dr, 0.3)), 0.05, 0.5)
    };
  }
  function clipFrom(points, t0) {
    if (!points.length || points[0][0] >= t0) return points;
    var i = 0;
    while (i < points.length && points[i][0] < t0) i++;
    if (i >= points.length) return [[t0, points[points.length - 1][1]]];
    var a = points[i - 1], b = points[i], v = b[0] === a[0] ? b[1] : a[1] + (t0 - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
    return [[t0, r6(v)]].concat(points.slice(i));
  }
  /* A rough length for the computer voice (it can't be measured): about 0.38 s a word plus half a second. */
  function estimateSpeech(text) {
    var t = String(text || ""), words = t.split(/\s+/).filter(Boolean).length, stops = (t.match(/[.!?]\s+\S/g) || []).length;
    return clamp(r6(0.5 + 0.38 * words + 0.25 * stops), 1, 8);
  }
  /* ONE plan for Preview and for game-mode Play. Times are seconds after the Play press.
       inp.music = { len, offset, fade }                      (null when there is no song)
       inp.voice = { len, speech, offset, tts }               (null when there is no voice; len is the rendered length including the reverb tail,
                                                                speech is the dry length that ducking follows)
     Returns { tracks: [{ track, when, offset, duration, gainPoints, duckPoints?, tts? }], total }.
     gainPoints are [time, gain] pairs: set the first, ramp linearly to each next one. duckPoints go on a second gain stage on the music. */
  function mixPlan(inp) {
    var m = sanitizeMix(inp && inp.mix), bg = balanceGains(m.bal);
    var gM = bg.music * m.mv / 100, gV = bg.voice * m.vv / 100;
    var tracks = [], total = 0, music = inp && inp.music, voice = inp && inp.voice;
    if (music && music.len > 0) {
      var when = m.md, len = music.len, fade = clamp(num(music.fade, 0), 0, len), fs = len - Math.min(Math.max(fade, END_RAMP), len);
      var pts = [[r6(when), 0], [r6(when + ATTACK), r6(gM)]];
      if (fs > ATTACK + 1e-9) pts.push([r6(when + fs), r6(gM)]);
      pts.push([r6(when + len), 0]);
      var dp = null;
      if (m.duck && voice && m.dd > 0 && voice.speech > 0) {
        var vs = m.vd, ve = m.vd + voice.speech, amt = r6(dbToGain(-m.dd));
        dp = clipFrom([[r6(vs - m.da), 1], [r6(vs), amt], [r6(ve), amt], [r6(ve + m.dr), 1]], 0);
      }
      tracks.push({ track: "music", when: r6(when), offset: num(music.offset, 0), duration: len, gainPoints: pts, duckPoints: dp });
      total = Math.max(total, when + len);
    }
    if (voice && voice.len > 0) {
      var vw = m.vd, vl = voice.len, vp = [];
      if (!voice.tts) {
        vp = [[r6(vw), 0], [r6(vw + ATTACK), r6(gV)]];
        if (vw + vl - VOICE_RAMP > vw + ATTACK) vp.push([r6(vw + vl - VOICE_RAMP), r6(gV)]);
        vp.push([r6(vw + vl), 0]);
      }
      tracks.push({ track: "voice", when: r6(vw), offset: num(voice.offset, 0), duration: vl, gainPoints: vp, tts: !!voice.tts });
      total = Math.max(total, vw + vl);
    }
    return { tracks: tracks, total: r6(total), balance: bg, gains: { music: r6(gM), voice: r6(gV) } };
  }

  /* ---------- songs, built-in sounds, players ---------- */
  var SND = root.WalkupSounds || (typeof require === "function" ? (function () { try { return require("./sounds.js"); } catch (e) { return null; } })() : null);
  function builtinSong(id) {
    var sid = String(id || "").replace(/^b:/, ""), s = SND && SND.info(sid);
    if (!s) return null;
    var t = defaultTrim(s.dur, { len: LIM.defLen, fade: LIM.defFade });
    return { id: "b:" + s.id, kind: "synth", sound: s.id, title: s.label, name: s.label, dur: s.dur, size: 0, start: t.start, len: t.len, fade: t.fade };
  }
  function songById(songs, id) {
    if (!id) return null;
    if (String(id).indexOf("b:") === 0) return builtinSong(id);
    for (var i = 0; i < songs.length; i++) if (songs[i].id === id) return songs[i];
    return null;
  }
  /* seconds a song may keep playing past its clip when the coach asks for more (built-in sounds are too short for it) */
  function extOf(song) {
    if (!song || song.kind !== "file") return 0;
    return song.ext == null ? LIM.defExt : clamp(Math.round(num(song.ext, LIM.defExt)), 0, LIM.maxExt);
  }
  /* the trim a player really uses: their own, or the song's default */
  function effectiveTrim(player, song) {
    if (!song) return null;
    if (player && isObj(player.trim)) return clampTrim(song.dur, player.trim);
    return clampTrim(song.dur, { start: song.start, len: song.len, fade: song.fade });
  }
  function defaultVoice(kind, o, announcer) {
    o = o || {};
    var dur = Math.max(0, num(o.dur, 0));
    return {
      kind: kind, id: kind === "tts" ? "" : (o.id || uid()), name: str(o.name || (kind === "tts" ? "Computer voice" : kind === "rec" ? "Recording" : "Voice file"), LIM.file),
      dur: dur, size: Math.max(0, Math.round(num(o.size, 0))), mime: str(o.mime || "", 60), ts: num(o.ts, 0), te: num(o.te, dur), norm: !!o.norm,
      thr: int(o.thr, -70, -20, -45), polish: kind === "tts" ? flatPolish() : sanitizePolish(announcer || factoryAnnouncer())
    };
  }
  function newPlayer(o) {
    o = o || {};
    return { id: o.id || uid(), name: str(o.name, LIM.name), num: str(o.num, LIM.num), pos: str(o.pos, LIM.pos), songId: o.songId || null, trim: null, voice: o.voice || null, mix: defaultMix(), req: null, want: "" };
  }
  function playerLabel(p) { return (p.num ? "#" + p.num + " " : "") + (p.name || "Player"); }

  /* "Now batting, number 7, Player 7"; handles a missing number or name */
  /* style "pa" reads like a ballpark announcer: short sentences, so the voice pauses between them, and the name said last with a lift */
  function announceText(p, style) {
    var num_ = p ? String(p.num || "").replace(/^\s*#\s*/, "").replace(/\s+/g, " ").trim() : "";
    var name = p ? String(p.name || "").replace(/\s+/g, " ").trim() : "";
    if (style === "pa") return "Now batting." + (num_ ? " Number " + num_ + "." : "") + (name ? " " + name + "!" : "");
    var parts = ["Now batting"];
    if (num_) parts.push("number " + num_);
    if (name) parts.push(name);
    return parts.join(", ");
  }

  /* Ready / No song / No voice / needs a file. `have(key)` says whether a saved audio file is on this phone. */
  var STATUS_TEXT = { ready: "Ready", "no-song": "No song", "no-voice": "No voice", empty: "Nothing set up", "needs-song": "Needs song file", "needs-voice": "Needs voice file" };
  /* The announcer that actually plays for a player: none when their song is a clip that already says the name. */
  function activeVoice(p, songs) {
    var song = p && p.songId ? songById(songs, p.songId) : null;
    return song && song.intro ? null : (p && p.voice) || null;
  }
  function saysName(p, songs) { var song = p && p.songId ? songById(songs, p.songId) : null; return !!(song && song.intro); }
  function statusOf(p, songs, have) {
    var song = p.songId ? songById(songs, p.songId) : null, said = !!(song && song.intro), v = said ? null : p.voice;
    var songOk = song && (song.kind === "synth" || have("s:" + song.id)), voiceOk = said || (v && (v.kind === "tts" || have("v:" + v.id)));
    var code = song && !songOk ? "needs-song" : v && !voiceOk ? "needs-voice" : !song && !v ? "empty" : !song ? "no-song" : !v && !said ? "no-voice" : "ready";
    return { code: code, text: STATUS_TEXT[code], song: !!songOk, voice: !!voiceOk };
  }

  /* ---------- lineup, bench, wrap-around ---------- */
  function nextIndex(n, i) { return n <= 0 ? 0 : (i + 1) % n; }
  function prevIndex(n, i) { return n <= 0 ? 0 : (i - 1 + n) % n; }
  function roles(n, cur) { return { now: cur, onDeck: n >= 2 ? nextIndex(n, cur) : -1, inHole: n >= 3 ? nextIndex(n, nextIndex(n, cur)) : -1 }; }
  function moveItem(list, i, d) {
    var a = list.slice(), j = i + d;
    if (i < 0 || i >= a.length || j < 0 || j >= a.length) return a;
    var x = a.splice(i, 1)[0]; a.splice(j, 0, x);
    return a;
  }
  function benchIds(roster, lineup) { return roster.map(function (p) { return p.id; }).filter(function (id) { return lineup.indexOf(id) < 0; }); }
  function toBench(lineup, id) { return lineup.filter(function (x) { return x !== id; }); }
  function toLineup(lineup, id) { return lineup.indexOf(id) >= 0 ? lineup.slice() : lineup.concat([id]); }
  function swapBench(lineup, i, benchId) {
    var a = lineup.slice();
    if (i < 0 || i >= a.length || a.indexOf(benchId) >= 0) return a;
    a[i] = benchId;
    return a;
  }
  /* keep "now batting" on the same player after the lineup changes */
  function reindexBatter(oldLineup, oldIdx, newLineup) {
    var id = oldLineup[oldIdx], i = id == null ? -1 : newLineup.indexOf(id);
    if (i >= 0) return i;
    return newLineup.length ? clamp(oldIdx, 0, newLineup.length - 1) : 0;
  }

  /* ---------- paste a list: "7 Player Seven", "#7, Player Seven", "Player Seven 7" ---------- */
  var NUM_RE = /^#?\s*\d{1,3}[A-Za-z]?$/;
  function cleanName(s) { return str(String(s).replace(/^[\s\-–—.:)]+|[\s\-–—.:(,;]+$/g, "").replace(/\s+/g, " "), LIM.name); }
  function parseLine(line) {
    var s = String(line).replace(/^[\s\-*•]+/, "").trim();
    if (!s) return null;
    var parts = s.split(/\t|,|;|\|| - | – | — /).map(function (x) { return x.trim(); }).filter(Boolean), numStr = "", name = "", pos = "", i;
    if (parts.length > 1) {
      var ni = -1;
      for (i = 0; i < parts.length; i++) if (NUM_RE.test(parts[i])) { ni = i; break; }
      if (ni >= 0) {
        numStr = parts[ni].replace(/^#\s*/, "");
        var rest = parts.filter(function (x, k) { return k !== ni; });
        if (rest.length > 1 && /^[A-Za-z0-9]{1,3}$/.test(rest[rest.length - 1])) { pos = rest[rest.length - 1].toUpperCase(); rest.pop(); }
        name = rest.join(" ");
      } else name = parts.join(" ");
    } else {
      var m = /^(.*?)\s*[(#]\s*#?(\d{1,3}[A-Za-z]?)\)?$/.exec(s), toks = s.split(/\s+/);
      if (m && m[1]) { name = m[1]; numStr = m[2]; }
      else if (toks.length > 1 && NUM_RE.test(toks[0])) { numStr = toks[0].replace(/^#/, ""); name = toks.slice(1).join(" "); }
      else if (toks.length > 1 && NUM_RE.test(toks[toks.length - 1])) { numStr = toks[toks.length - 1].replace(/^#/, ""); name = toks.slice(0, -1).join(" "); }
      else if (NUM_RE.test(s)) { numStr = s.replace(/^#\s*/, ""); name = ""; }
      else name = s;
    }
    name = cleanName(name);
    if (!name && !numStr) return null;
    return { name: name, num: str(numStr, LIM.num), pos: str(pos, LIM.pos) };
  }
  /* returns { players: [{name,num,pos}], skipped, capped } */
  function parsePasted(text, room) {
    var cap = Math.max(0, Math.min(LIM.roster, room == null ? LIM.roster : room)), out = [], skipped = 0, capped = false;
    String(text == null ? "" : text).split(/\r\n|\r|\n/).forEach(function (ln) {
      if (!ln.trim()) return;
      var p = parseLine(ln);
      if (!p) { skipped++; return; }
      if (out.length >= cap) { capped = true; return; }
      out.push(p);
    });
    return { players: out, skipped: skipped, capped: capped };
  }

  /* ---------- asking a parent for a song ----------
     The loop has no server: the coach's message carries a link with a token, the parent's page names the file
     "WU-<token>-<title>.<ext>", and the coach app matches the token when the attachment comes back. */
  var REQ = { tokLen: 7, tokRe: /^[a-z0-9]{6,8}$/, tpl: 600, team: 30, name: 24, num: 4, want: 80, hash: 1500, file: 80, via: ["text", "email", "share", "copy"], st: ["asked", "got", "text"] };
  var DEFAULT_TPL = "Hi! We're putting together walk-up music for the team. Could you pick the song {first} wants for their walk-up (about 10 seconds is plenty) and send it back? Tap this link, choose the song on your phone, then pick this chat or email to send it: {link} Thank you!";
  /* Any common audio file is welcome. A phone often sends an empty type, application/octet-stream, audio/x-m4a or video/mp4 for an .m4a,
     so a file is accepted when its extension OR its type says audio. The real check is whether the phone can decode it. */
  var AUDIO_EXTS = ["mp3", "wav", "wave", "m4a", "aac", "mp4", "ogg", "oga", "opus", "flac", "aif", "aiff", "caf", "webm", "3gp", "amr"];
  var AUDIO_ACCEPT = "audio/*," + AUDIO_EXTS.map(function (e) { return "." + e; }).join(",");
  function isAudioFile(name, type) {
    var t = String(type == null ? "" : type).toLowerCase().split(";")[0].replace(/\s/g, ""), m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name == null ? "" : name));
    return /^audio\//.test(t) || !!(m && AUDIO_EXTS.indexOf(m[1].toLowerCase()) >= 0);
  }
  var MIME_EXT = { "audio/x-m4a": "m4a", "audio/mp4a-latm": "m4a", "audio/3gpp": "3gp", "audio/amr": "amr", "audio/aiff": "aiff", "audio/x-aiff": "aiff", "audio/x-caf": "caf", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/x-aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/opus": "opus", "audio/flac": "flac", "audio/x-flac": "flac", "audio/webm": "webm" };
  /* control, direction-override and zero-width characters, which have no place in a name or a file name */
  var HIDDEN_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff\ufff0-\uffff]/g;

  /* a short label: no hidden characters, single spaces, cut by whole characters */
  function cleanLabel(x, max) {
    var s = typeof x === "string" ? x : (typeof x === "number" && isFinite(x) ? String(x) : "");
    s = s.replace(HIDDEN_RE, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
    return Array.from(s).slice(0, max).join("").replace(/ $/, "");
  }
  function firstWord(name) { return cleanLabel(String(name == null ? "" : name).replace(/^\s+/, "").split(/\s+/)[0] || "", REQ.name); }

  /* UTF-8 and base64url written by hand so the same code runs in every browser and in node */
  function utf8Bytes(s) {
    var out = [];
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00); i++; }
      else if (c >= 0xd800 && c < 0xe000) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  /* strict: returns null for anything that is not well-formed UTF-8 */
  function utf8Str(b) {
    var s = "", i = 0;
    while (i < b.length) {
      var c = b[i++], n = c < 0x80 ? 0 : c >= 0xc2 && c < 0xe0 ? 1 : c >= 0xe0 && c < 0xf0 ? 2 : c >= 0xf0 && c < 0xf5 ? 3 : -1, min = n === 2 ? 0x800 : n === 3 ? 0x10000 : 0;
      if (n < 0) return null;
      if (n) c = c & (n === 1 ? 0x1f : n === 2 ? 0x0f : 0x07);
      for (var k = 0; k < n; k++) { var d = b[i++]; if (d === undefined || (d & 0xc0) !== 0x80) return null; c = (c << 6) | (d & 63); }
      if (c < min || c > 0x10ffff || (c >= 0xd800 && c < 0xe000)) return null;
      s += c < 0x10000 ? String.fromCharCode(c) : String.fromCharCode(0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 1023));
    }
    return s;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function b64urlEncode(bytes) {
    var o = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0);
      o += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "" : B64[(n >> 6) & 63]) + (c === undefined ? "" : B64[n & 63]);
    }
    return o;
  }
  function b64urlDecode(s) {
    s = String(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
    var out = [], acc = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      acc = (acc << 6) | B64.indexOf(s[i]); bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
    }
    return out;
  }

  /* random token of 7 characters [a-z0-9], not in `taken` (an array or a set object). `rnd(n)` may supply bytes for tests. */
  function newToken(taken, rnd) {
    var used = Object.create(null), ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
    if (Array.isArray(taken)) taken.forEach(function (t) { used[t] = 1; }); else if (isObj(taken)) Object.keys(taken).forEach(function (t) { used[t] = 1; });
    for (var tries = 0; tries < 200; tries++) {
      var tok = "", b;
      try {
        if (rnd) b = rnd(REQ.tokLen * 2); else { b = new Uint8Array(REQ.tokLen * 2); root.crypto.getRandomValues(b); }
      } catch (e) { b = null; }
      for (var i = 0; i < REQ.tokLen * 2 && tok.length < REQ.tokLen; i++) {
        var v = b ? b[i] : Math.floor(Math.random() * 256);
        if (v < 252) tok += ALPHA[v % 36];
      }
      while (tok.length < REQ.tokLen) tok += ALPHA[Math.floor(Math.random() * 36)];
      if (!used[tok]) return tok;
    }
    return uid().replace(/[^a-z0-9]/g, "a").slice(0, REQ.tokLen);
  }

  /* where the parent page lives: the folder this page is in, plus send.html (works on the real site, localhost and file:) */
  function sendPageUrl(href) {
    var u = String(href == null ? "" : href).replace(/[?#].*$/, "");
    u = /\/[^\/]*\.[^\/]*$/.test(u) ? u.replace(/[^\/]*$/, "") : u.replace(/\/?$/, "/");
    return u + "send.html";
  }
  /* The note travels in the part of the link after #, which a browser never sends to any server. */
  function buildRequestLink(base, o) {
    o = o || {};
    var t = typeof o.t === "string" ? o.t.toLowerCase() : "";
    if (!REQ.tokRe.test(t)) return "";
    var j = { v: 1, t: t, n: cleanLabel(o.n, REQ.name), u: cleanLabel(o.u, REQ.num) }, c = cleanLabel(o.c, REQ.team);
    if (c) j.c = c;
    return String(base == null ? "" : base).replace(/#.*$/, "") + "#r=" + b64urlEncode(utf8Bytes(JSON.stringify(j)));
  }
  /* Takes a whole link, "#r=..." or "r=...". Returns { ok:true, t, n, u, c } or { ok:false, why } and never throws. */
  function parseRequestLink(input) {
    try {
      var s = typeof input === "string" ? input : "";
      if (!s) return { ok: false, why: "missing" };
      var h = s.indexOf("#") >= 0 ? s.slice(s.indexOf("#") + 1) : s;
      if (h.length > 4 * REQ.hash) return { ok: false, why: "big" };
      var val = "";
      h.split("&").forEach(function (kv) { if (!val && kv.slice(0, 2) === "r=") val = kv.slice(2); });
      val = val.replace(/[.,;:!?)\]'"]+$/, "");
      if (!val) return { ok: false, why: "missing" };
      if (val.length > REQ.hash) return { ok: false, why: "big" };
      var bytes = b64urlDecode(val), text = bytes ? utf8Str(bytes) : null;
      if (text === null) return { ok: false, why: "bad" };
      var j = JSON.parse(text);
      if (!isObj(j) || j.v !== 1) return { ok: false, why: "bad" };
      var t = typeof j.t === "string" ? j.t.toLowerCase() : "";
      if (!REQ.tokRe.test(t)) return { ok: false, why: "bad" };
      return { ok: true, t: t, n: cleanLabel(j.n, REQ.name), u: cleanLabel(j.u, REQ.num), c: cleanLabel(j.c, REQ.team) };
    } catch (e) { return { ok: false, why: "bad" }; }
  }

  /* "Sam #7", "Sam" or "#7" (empty when both are missing) */
  function whoLabel(n, u) {
    n = cleanLabel(n, REQ.name); u = cleanLabel(u, REQ.num).replace(/^#\s*/, "");
    return n + (n && u ? " " : "") + (u ? "#" + u : "");
  }
  /* {first} {number} {team} {link}; a missing value leaves no stray gap */
  function fillTemplate(tpl, v) {
    v = v || {};
    var vals = { first: v.first ? String(v.first) : "your player", number: v.number ? String(v.number).replace(/^#\s*/, "") : "", team: v.team ? String(v.team) : "", link: v.link ? String(v.link) : "" };
    var out = String(tpl == null ? "" : tpl).replace(/\{(first|number|team|link)\}/gi, function (m, k) { return vals[k.toLowerCase()]; });
    return out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]+\n/g, "\n").replace(/^\s+|\s+$/g, "");
  }
  /* the filled-in message, with the link added at the end if an edited template forgot {link} */
  function requestMessage(tpl, v) {
    var t = sanitizeTemplate(tpl) || DEFAULT_TPL, msg = fillTemplate(t, v);
    return v && v.link && msg.indexOf(String(v.link)) < 0 ? msg + "\n" + v.link : msg;
  }
  function requestSubject(v) {
    v = v || {};
    var who = whoLabel(v.first, v.number);
    return "Walk-up song" + (who ? " for " + who : "") + (v.team ? " (" + v.team + ")" : "");
  }
  function sanitizeTemplate(x) {
    return (typeof x === "string" ? x : "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "").slice(0, REQ.tpl);
  }
  function smsHref(body) { return "sms:?&body=" + encodeURIComponent(String(body == null ? "" : body)); }
  function mailtoHref(subject, body) { return "mailto:?subject=" + encodeURIComponent(String(subject == null ? "" : subject)) + "&body=" + encodeURIComponent(String(body == null ? "" : body)); }

  /* WU-<token>-<title>.<ext>: safe in any chat or mail app, at most 80 characters, real extension kept */
  function songExt(name, mime) {
    var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || "")), e = m ? m[1].toLowerCase() : "", byType = MIME_EXT[String(mime || "").toLowerCase().split(";")[0].replace(/\s/g, "")] || "";
    return AUDIO_EXTS.indexOf(e) >= 0 ? e : byType || e;
  }
  function fileSafe(x) {
    var s = String(x == null ? "" : x);
    try { s = s.normalize("NFC"); } catch (e) { /* old browser: leave as is */ }
    s = s.replace(HIDDEN_RE, " ");
    try { s = s.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1f3fb}-\u{1f3ff}︎️\u200d⃣]/gu, " ").replace(/[^\p{L}\p{N}\p{M} ._,'()!-]/gu, " "); }
    catch (e) { s = s.replace(/[\ud800-\udfff]/g, " ").replace(/[\\\/:*?"<>|#%&+~^`{}\[\];=$@]/g, " "); }
    return s.replace(/\s+/g, " ").replace(/\.{2,}/g, ".").replace(/^[ ._-]+|[ ._-]+$/g, "");
  }
  function buildSongFileName(token, title, origName, mime) {
    var tok = typeof token === "string" ? token.toLowerCase() : "";
    if (!REQ.tokRe.test(tok)) tok = "";
    var ext = songExt(origName, mime), extPart = ext ? "." + ext : "";
    var base = fileSafe(title);
    if (!base) base = fileSafe(String(origName == null ? "" : origName).replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]{1,5}$/, ""));
    var prefix = tok ? "WU-" + tok + "-" : "", room = Math.max(1, REQ.file - prefix.length - extPart.length);
    base = Array.from(base.replace(/ /g, "_")).slice(0, room).join("").replace(/[._-]+$/, "") || "song";
    return prefix + base + extPart;
  }
  /* { token, title } when the name starts with WU-<token> (any capitals), otherwise null; the title is tidied for the library */
  function parseSongFileName(name) {
    var s = String(name == null ? "" : name).replace(/^.*[\\\/]/, "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
    var m = /^wu-([a-z0-9]{6,8})(?:-(.*))?$/i.exec(s);
    if (!m) return null;
    var rest = m[2] || "";
    try { rest = decodeURIComponent(rest); } catch (e) { rest = rest.replace(/%20/g, " "); }
    rest = rest.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
    return { token: m[1].toLowerCase(), title: str(rest, LIM.title) || "Song" };
  }
  /* "Walk-up song for Sam #7: Title - Artist [WU-abc1234]" typed back as text -> { token, want } */
  function parseReplyText(text) {
    var s = String(text == null ? "" : text), m = /\[WU-([a-z0-9]{6,8})\]/i.exec(s);
    if (!m) return null;
    var body = s.replace(/\s*\[WU-[a-z0-9]{6,8}\]\s*/i, " ").replace(/^\s*walk-?up song for[^:\n]*:\s*/i, "");
    return { token: m[1].toLowerCase(), want: sanitizeWant(body) };
  }

  function sanitizeWant(x) { return cleanLabel(typeof x === "string" ? x : "", REQ.want); }
  function sanitizeReq(r, seenTok) {
    if (!isObj(r) || typeof r.t !== "string") return null;
    var t = r.t.toLowerCase();
    if (!REQ.tokRe.test(t) || (seenTok && seenTok[t])) return null;
    if (seenTok) seenTok[t] = 1;
    return { t: t, at: isYMD(r.at) ? r.at : "", via: REQ.via.indexOf(r.via) >= 0 ? r.via : "copy", st: REQ.st.indexOf(r.st) >= 0 ? r.st : "asked" };
  }
  /* The request to store when the coach sends one: the same token while one is still open, otherwise a new unique one. */
  function startRequest(roster, p, via, today, tok) {
    var open = p && p.req && p.req.st === "asked" ? p.req.t : "";
    var taken = roster.filter(function (x) { return x !== p && x.req; }).map(function (x) { return x.req.t; });
    var t = open || (tok && REQ.tokRe.test(tok) && taken.indexOf(tok) < 0 ? tok : newToken(taken));
    return { t: t, at: isYMD(today) ? today : todayStr(), via: REQ.via.indexOf(via) >= 0 ? via : "copy", st: "asked" };
  }
  function playerByToken(roster, tok) {
    tok = String(tok || "").toLowerCase();
    for (var i = 0; i < roster.length; i++) if (roster[i].req && roster[i].req.t === tok) return roster[i];
    return null;
  }
  /* a real song file in the library (the built-in sounds do not count as a song that was asked for) */
  function hasSongFile(p, songs) { var s = p && p.songId ? songById(songs, p.songId) : null; return !!(s && s.kind === "file"); }
  /* the name a song gets in the library: a parent's WU-<token>-<title> file shows just the title */
  function libraryTitle(name) { var p = parseSongFileName(name); return p ? p.title : fileTitle(name); }
  /* "got" (has a file), "inlib" (the file came back but is not chosen yet), "text" (answered with a title only), "asked", or "none" */
  function requestCode(p, songs) {
    if (hasSongFile(p, songs)) return "got";
    if (p && p.req && p.req.st === "got") return "inlib";
    if (p && (p.want || (p.req && p.req.st === "text"))) return "text";
    return p && p.req ? "asked" : "none";
  }
  function requestProgress(roster, songs) {
    var have = roster.filter(function (p) { return hasSongFile(p, songs); }).length;
    return { have: have, total: roster.length, text: have + " of " + roster.length + " have a song" };
  }
  function findDuplicateSong(songs, name, size) {
    var nm = str(name, LIM.file);
    for (var i = 0; i < songs.length; i++) if (songs[i].kind === "file" && songs[i].name === nm && songs[i].size === size) return songs[i];
    return null;
  }

  /* ---------- sanitising saved data and backups ---------- */
  function sanitizeSettings(r) {
    r = isObj(r) ? r : {};
    return { master: int(r.master, 0, 100, 100), wake: r.wake !== false, countIn: r.countIn !== false, thr: int(r.thr, -70, -20, -45), tvoice: str(r.tvoice, 200), trate: clamp(q1(num(r.trate, 1)), 0.5, 1.5), tvol: int(r.tvol, 0, 100, 100), tstyle: r.tstyle === "plain" ? "plain" : "pa", reqTpl: sanitizeTemplate(r.reqTpl), team: cleanLabel(r.team, REQ.team) };
  }
  function sanitizeSong(r, seen) {
    if (!isObj(r) || r.kind !== "file") return null;
    var id = typeof r.id === "string" && ID_RE.test(r.id) && !seen[r.id] ? r.id : uid();
    seen[id] = 1;
    var dur = clamp(num(r.dur, 0), 0, 86400), t = clampTrim(dur, r);
    return { id: id, kind: "file", title: str(r.title, LIM.title) || "Song", name: str(r.name, LIM.file), dur: dur, size: int(r.size, 0, 1e12, 0), mime: str(r.mime, 60), start: t.start, len: t.len, fade: t.fade, intro: r.intro === true, ext: int(r.ext, 0, LIM.maxExt, LIM.defExt) };
  }
  function sanitizeVoice(r, seen) {
    if (!isObj(r)) return null;
    if (r.kind === "tts") return defaultVoice("tts", {}, null);
    if (r.kind !== "rec" && r.kind !== "file") return null;
    var id = typeof r.id === "string" && ID_RE.test(r.id) && !seen[r.id] ? r.id : uid();
    seen[id] = 1;
    var dur = clamp(num(r.dur, 0), 0, 600), ts = clamp(num(r.ts, 0), 0, dur), te = clamp(num(r.te, dur), ts, dur);
    if (dur >= 0.1 && te - ts < 0.1) { ts = 0; te = dur; }
    return { kind: r.kind, id: id, name: str(r.name, LIM.file) || (r.kind === "rec" ? "Recording" : "Voice file"), dur: dur, size: int(r.size, 0, 1e12, 0), mime: str(r.mime, 60), ts: Math.round(ts * 1000) / 1000, te: Math.round(te * 1000) / 1000, norm: r.norm === true, thr: int(r.thr, -70, -20, -45), polish: sanitizePolish(r.polish) };
  }
  function sanitizePlayer(r, seenIds, seenVoice, songs, seenTok) {
    if (!isObj(r)) return null;
    var id = typeof r.id === "string" && ID_RE.test(r.id) && !seenIds[r.id] ? r.id : uid();
    seenIds[id] = 1;
    var songId = typeof r.songId === "string" && songById(songs, r.songId) ? r.songId : null, song = songId ? songById(songs, songId) : null;
    return { id: id, name: str(r.name, LIM.name), num: str(r.num, LIM.num), pos: str(r.pos, LIM.pos), songId: songId, trim: song && isObj(r.trim) ? clampTrim(song.dur, r.trim) : null, voice: sanitizeVoice(r.voice, seenVoice), mix: sanitizeMix(r.mix), req: sanitizeReq(r.req, seenTok), want: sanitizeWant(r.want) };
  }
  /* ---------- game sounds: buttons for the moments between batters (the anthem, music between innings, the coach's own clips) ---------- */
  /* Each button plays one song from the library, from its start to its end (end 0 = the end of the file). Two come ready to fill in. */
  var BOARD_IDS_RE = /^[A-Za-z0-9_-]{3,40}$/;
  function defaultBoard() {
    return [{ id: "innings", label: "Between innings", songId: null, start: 0, end: 0 }, { id: "anthem", label: "National anthem", songId: null, start: 0, end: 0 }];
  }
  function sanitizeTile(t, seen, songs) {
    if (!isObj(t)) return null;
    var id = typeof t.id === "string" && BOARD_IDS_RE.test(t.id) && !seen[t.id] ? t.id : uid();
    seen[id] = 1;
    var song = typeof t.songId === "string" ? songById(songs, t.songId) : null, dur = song ? song.dur : 0;
    var start = song ? clamp(Math.round(num(t.start, 0) * 100) / 100, 0, Math.max(0, dur - 0.5)) : 0, end = song ? Math.round(num(t.end, 0) * 100) / 100 : 0;
    if (!(end >= start + 0.5) || end >= dur) end = 0;
    return { id: id, label: cleanLabel(t.label, LIM.boardLabel) || "Sound", songId: song ? song.id : null, start: start, end: end };
  }
  function sanitizeBoard(raw, songs) {
    if (!Array.isArray(raw)) return defaultBoard();
    var seen = Object.create(null);
    return raw.slice(0, LIM.board).map(function (t) { return sanitizeTile(t, seen, songs); }).filter(Boolean);
  }
  /* what a button plays: { start, len } in song time, or null when it has no song */
  function tileRegion(tile, song) {
    if (!tile || !song || song.kind !== "file" || tile.songId !== song.id) return null;
    var dur = song.dur || 0, start = clamp(num(tile.start, 0), 0, Math.max(0, dur - 0.1)), end = tile.end > start ? Math.min(tile.end, dur) : dur;
    return { start: start, len: Math.max(0.1, end - start) };
  }
  /* Up next: add a button once (a second tap does nothing), at most LIM.queue; take one out by its place */
  function queueAdd(q, id) { q = Array.isArray(q) ? q.slice() : []; if (typeof id === "string" && q.indexOf(id) < 0 && q.length < LIM.queue) q.push(id); return q; }
  function queueDrop(q, i) { q = Array.isArray(q) ? q.slice() : []; if (i >= 0 && i < q.length) q.splice(i, 1); return q; }

  function emptyState() { return { v: 1, roster: [], lineup: [], batter: 0, songs: [], board: defaultBoard(), announcer: factoryAnnouncer(), settings: sanitizeSettings({}) }; }
  function sanitizeState(raw) {
    var r = isObj(raw) ? raw : {}, st = emptyState();
    var seenS = Object.create(null), seenP = Object.create(null), seenV = Object.create(null), seenT = Object.create(null);
    st.songs = (Array.isArray(r.songs) ? r.songs.slice(0, 500) : []).map(function (s) { return sanitizeSong(s, seenS); }).filter(Boolean);
    st.roster = (Array.isArray(r.roster) ? r.roster.slice(0, LIM.roster) : []).map(function (p) { return sanitizePlayer(p, seenP, seenV, st.songs, seenT); }).filter(Boolean);
    var ids = Object.create(null), lu = [];
    st.roster.forEach(function (p) { ids[p.id] = 1; });
    (Array.isArray(r.lineup) ? r.lineup : []).forEach(function (id) { if (typeof id === "string" && ids[id] && lu.indexOf(id) < 0) lu.push(id); });
    st.lineup = lu;
    st.batter = int(r.batter, 0, Math.max(0, lu.length - 1), 0);
    st.announcer = isObj(r.announcer) ? sanitizePolish(r.announcer) : factoryAnnouncer();
    st.settings = sanitizeSettings(r.settings);
    st.board = sanitizeBoard(r.board, st.songs);
    return st;
  }
  /* every saved audio file the state points at, as keys like "s:abc123" and "v:def456" */
  function audioKeys(st) {
    var keys = [];
    st.songs.forEach(function (s) { keys.push("s:" + s.id); });
    st.roster.forEach(function (p) { if (p.voice && p.voice.kind !== "tts") keys.push("v:" + p.voice.id); });
    return keys;
  }
  function counts(st) { return { players: st.roster.length, lineup: st.lineup.length, songs: st.songs.length, voices: st.roster.filter(function (p) { return p.voice && p.voice.kind !== "tts"; }).length }; }

  function makeBackup(st, today, kind) {
    var d = sanitizeState(st);
    return { app: "walkup", v: 1, kind: kind || "settings", exported: isYMD(today) ? today : todayStr(), note: kind === "bundle" ? "Walk-Up backup with audio." : "Walk-Up settings backup. The audio files are not in this file.", data: d };
  }
  /* Checks a parsed backup file. Returns { ok:true, kind, state, counts, audio:[{key,type,size}] } or { ok:false, error }. */
  function validateBackup(obj) {
    if (!isObj(obj) || obj.app !== "walkup") return { ok: false, error: "That file isn't a Walk-Up backup." };
    if (typeof obj.v !== "number" || obj.v < 1) return { ok: false, error: "That file isn't a Walk-Up backup." };
    if (obj.v > 1) return { ok: false, error: "That backup was made by a newer version of Walk-Up. Update the app and try again." };
    if (!isObj(obj.data) || (!Array.isArray(obj.data.roster) && !Array.isArray(obj.data.songs))) return { ok: false, error: "That backup has nothing in it to restore." };
    var st = sanitizeState(obj.data), kind = obj.kind === "bundle" ? "bundle" : "settings", audio = [];
    if (kind === "bundle") {
      var want = Object.create(null), total = 0;
      audioKeys(st).forEach(function (k) { want[k] = 1; });
      (Array.isArray(obj.audioIndex) ? obj.audioIndex : []).forEach(function (a) {
        if (!isObj(a) || typeof a.key !== "string" || !KEY_RE.test(a.key) || !want[a.key]) return;
        var size = int(a.size, 0, LIM.maxBundleBytes + 1, 0);
        total += size;
        audio.push({ key: a.key, type: str(a.type, 60).replace(/[^A-Za-z0-9.+\/;=_ -]/g, ""), size: size });
      });
      if (total > LIM.maxBundleBytes) return { ok: false, error: "That backup is too big for this phone to read (over 80 MB of audio)." };
    }
    return { ok: true, kind: kind, state: st, counts: counts(st), audio: audio };
  }

  /* ---------- one tap: the whole lineup ready ---------- */
  /* The best voice this phone has for a ballpark announcer, as a voiceURI ("" = the phone's default).
     English first (US best), then the natural/neural/online voices that sound least robotic. */
  var VOICE_GOOD = /natural|neural|online|enhanced|premium|wavenet|studio/i;
  function voiceScore(v) {
    if (!v || typeof v.voiceURI !== "string" || !v.voiceURI) return -1;
    var lang = String(v.lang || "").replace("_", "-").toLowerCase(), name = String(v.name || "");
    if (lang.indexOf("en") !== 0 && !/english/i.test(name)) return 0;
    var sc = 10;
    if (lang === "en-us" || /united states|\bUS\b/i.test(name)) sc += 4; else if (/^en-(gb|au|ca|ie|nz)/.test(lang)) sc += 2;
    if (VOICE_GOOD.test(name) || VOICE_GOOD.test(v.voiceURI)) sc += 5;
    if (/google/i.test(name)) sc += 2;
    if (/novelty|whisper|bells|bubbles|boing|zarvox|trinoids|cellos|bad news|good news|organ|jester|superstar|wobble|albert|hysterical/i.test(name)) sc -= 9;
    return sc;
  }
  function pickVoice(voices) {
    var best = "", bs = 0;
    (Array.isArray(voices) ? voices : []).forEach(function (v) { var sc = voiceScore(v); if (sc > bs) { bs = sc; best = v.voiceURI; } });
    return best;
  }

  /* A song file named "Jordan - Artist - Song" (or "JORDAN LEE - Song") belongs to the player called Jordan (or Jordan Lee).
     Returns the name part, lower case, or "" when the title doesn't start with one or two plain words and a dash. */
  function normName(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function songOwner(song) {
    if (!song || song.kind !== "file") return "";
    var m = /^\s*([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'.]*(?:\s+[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'.]*)?)(?:\s+[-–—]\s*|\s*[-–—]\s+)\S/.exec(String(song.title || ""));
    return m ? normName(m[1]) : "";
  }
  /* The player a clip is named for: "Number 7 Jordan Lee", "#7 Jordan", "7 Jordan Lee" or just "Jordan Lee" (a bare name, which only
     counts when it fits someone on the team). "" when the title isn't shaped like a name. */
  function clipOwner(title) {
    var W = "[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'.]*(?:\\s+[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'.]*){0,2}";
    var m = new RegExp("^\\s*(?:(?:(?:number|no\\.?|#)\\s*)?\\d{1,2}\\s+)?(" + W + ")(?:[_\\s-]*\\d+)?\\s*$", "i").exec(String(title || ""));
    return m ? normName(m[1]) : "";
  }
  /* How well a name tag fits a player: 3 full name, 2 first name + last initial, 1 first name, 1 a last name only one player has. */
  function nameFit(own, p, lasts) {
    if (!own || !p) return 0;
    var full = normName(p.name), w = full.split(" "), o = own.split(" ");
    if (!full) return 0;
    if (own === full) return 3;
    if (o.length === 2 && w.length > 1 && o[0] === w[0] && o[1].length <= 2 && w[w.length - 1].indexOf(o[1].replace(/\.$/, "")) === 0) return 2;
    if (o.length === 1 && o[0] === w[0]) return 1;
    if (o.length === 1 && w.length > 1 && o[0] === w[w.length - 1] && lasts && lasts[o[0]] === 1) return 1;
    return 0;
  }
  function lastNames(roster) {
    var lasts = Object.create(null);
    (Array.isArray(roster) ? roster : []).forEach(function (p) { var w = normName(p && p.name).split(" "); if (w.length > 1) lasts[w[w.length - 1]] = (lasts[w[w.length - 1]] || 0) + 1; });
    return lasts;
  }
  /* Whether a new file is a clip that already says the player's name, so the announcer stays quiet: a title that starts with
     "Number 7" or "#7", or a short file (45 seconds or less) named just for someone on the roster. "Jordan Lee - Song" is a song. */
  function introGuess(title, dur, roster) {
    var t = String(title || "");
    if (/^\s*(?:number|no\.?|#)\s*\d{1,2}\b/i.test(t)) return true;
    var own = clipOwner(t), d = num(dur, 0), lasts = lastNames(roster);
    return !!own && d > 0 && d <= 45 && (Array.isArray(roster) ? roster : []).some(function (p) { return nameFit(own, p, lasts) > 0; });
  }

  /* Gives every batter in the lineup (or everyone, when the lineup is empty) a voice and a song, keeping whatever is already chosen.
     A song named for the player goes to that player; the rest share out the other library songs, unused ones first and in library
     order; with no songs at all, the built-in sounds take turns. Changes st in place and says what it did. */
  var FILL_SOUNDS = ["horn", "drumroll", "chime", "siren"];
  function fillLineup(st, opts) {
    opts = opts || {};
    var rep = { players: 0, kept: 0, matched: 0, picked: 0, sounds: 0, voiced: 0, said: 0 };
    if (!st || !Array.isArray(st.roster)) return rep;
    var songs = Array.isArray(st.songs) ? st.songs : [], byId = Object.create(null), uses = Object.create(null);
    var lasts = Object.create(null);
    st.roster.forEach(function (p) {
      byId[p.id] = p;
      if (p.songId && songById(songs, p.songId)) uses[p.songId] = (uses[p.songId] || 0) + 1;
      var w = normName(p.name).split(" "); if (w.length > 1) lasts[w[w.length - 1]] = (lasts[w[w.length - 1]] || 0) + 1;
    });
    /* how well a song's name fits a player: 3 full name, 2 first name and last initial ("Jordan L"), 1 first name,
       1 last name when only one player has it ("LEE - Song"), 0 not theirs */
    function fit(own, p) { return nameFit(own, p, lasts); }
    var owner = Object.create(null);
    songs.forEach(function (s) { owner[s.id] = songOwner(s) || (s.kind === "file" ? clipOwner(s.title) : ""); });
    /* a song named for someone on this team is theirs, so it isn't handed to anyone else */
    /* and a clip that says someone's name never goes to anyone else */
    var pool = songs.filter(function (s) { return s.kind === "file" && !s.intro && !lasts[owner[s.id]] && !st.roster.some(function (p) { return fit(owner[s.id], p) > 0; }); });
    var ids = (Array.isArray(st.lineup) && st.lineup.length ? st.lineup : st.roster.map(function (p) { return p.id; })).slice(), nSound = 0;
    ids.forEach(function (id) {
      var p = byId[id]; if (!p) return;
      rep.players++;
      give(p);
      var s = p.songId ? songById(songs, p.songId) : null;
      if (s && s.intro) rep.said++;
      else if (!p.voice && opts.voice !== false) { p.voice = defaultVoice("tts", {}, null); rep.voiced++; }
    });
    return rep;
    function give(p) {
      if (p.songId && songById(songs, p.songId)) { rep.kept++; return; }
      p.songId = null; p.trim = null;
      var mine = null, best = 0;
      songs.forEach(function (s) { var f = uses[s.id] ? 0 : fit(owner[s.id], p); if (f > best) { best = f; mine = s; } });
      if (mine) { p.songId = mine.id; uses[mine.id] = 1; rep.matched++; return; }
      if (pool.length) {
        var pick = pool[0];
        pool.forEach(function (s) { if ((uses[s.id] || 0) < (uses[pick.id] || 0)) pick = s; });
        p.songId = pick.id; uses[pick.id] = (uses[pick.id] || 0) + 1; rep.picked++;
        return;
      }
      p.songId = "b:" + FILL_SOUNDS[nSound++ % FILL_SOUNDS.length]; rep.sounds++;
    }
  }

  /* The loudest stretch of a song, so a library song starts where it kicks in rather than on a quiet intro.
     env = loudness (RMS) every `step` seconds. Picks the earliest window of `len` seconds that is nearly as loud as the loudest one. */
  function loudStart(env, step, len, dur) {
    env = Array.isArray(env) || (env && typeof env.length === "number") ? env : [];
    step = num(step, 0); len = num(len, LIM.defLen); dur = num(dur, env.length * step);
    var n = env.length, w = step > 0 ? Math.max(1, Math.round(len / step)) : 0;
    if (!w || n <= w || dur <= len) return 0;
    var pre = [0];
    for (var i = 0; i < n; i++) pre.push(pre[i] + Math.max(0, num(env[i], 0)));
    var best = 0, i2;
    for (i2 = 0; i2 + w <= n; i2++) best = Math.max(best, pre[i2 + w] - pre[i2]);
    if (best <= 0) return 0;
    for (i2 = 0; i2 + w <= n; i2++) if (pre[i2 + w] - pre[i2] >= best * 0.85) break;
    /* skip a quiet lead-in at the front of that window, keeping one step before the song kicks in */
    var top = 0, j, k = i2;
    for (j = i2; j < i2 + w; j++) top = Math.max(top, num(env[j], 0));
    while (k < i2 + w - 1 && num(env[k], 0) < top * 0.3) k++;
    if (k > i2) i2 = Math.max(i2, k - 1);
    return clamp(q1(i2 * step), 0, fl2(Math.max(0, dur - len)));
  }

  /* LYBS Ballclub's saved lineups ([{id, name, date, slots:[{playerId, name, position}]}]) and roster ([{id, name, number}]),
     made into Walk-Up rows [{name, num, pos}] in batting order. Bench slots and empty names are left out. */
  function clubRows(lineup, roster) {
    var nums = Object.create(null), out = [];
    (Array.isArray(roster) ? roster : []).forEach(function (r) {
      if (!isObj(r)) return;
      var n = str(r.number == null ? "" : r.number, LIM.num);
      if (r.id != null) nums["i:" + r.id] = n;
      if (typeof r.name === "string") nums["n:" + normName(r.name)] = n;
    });
    var slots = isObj(lineup) ? lineup.slots : null;
    (Array.isArray(slots) ? slots : isObj(slots) ? Object.keys(slots).sort(function (a, b) { return a - b; }).map(function (k) { return slots[k]; }) : []).forEach(function (s) {
      if (!isObj(s)) return;
      var name = str(s.name, LIM.name), pos = str(s.position, LIM.pos);
      if (!name || /^bench$/i.test(pos)) return;
      var n = s.playerId != null && nums["i:" + s.playerId] != null ? nums["i:" + s.playerId] : nums["n:" + normName(name)] || "";
      out.push({ name: name, num: n, pos: pos });
    });
    return out.slice(0, LIM.roster);
  }
  /* Puts rows in as the batting order. A player already on this phone (same name) keeps their song, voice and mix;
     new names join the roster; everyone else sits on the bench. Changes st in place. */
  function applyRows(st, rows) {
    var rep = { added: 0, matched: 0, full: false }, lu = [], byName = Object.create(null);
    st.roster.forEach(function (p) { var k = normName(p.name); if (k && !byName[k]) byName[k] = p; });
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      var k = normName(r.name), p = k ? byName[k] : null;
      if (p) {
        if (lu.indexOf(p.id) >= 0) return;
        if (r.num && !p.num) p.num = str(r.num, LIM.num);
        if (r.pos) p.pos = str(r.pos, LIM.pos);
        rep.matched++;
      } else {
        if (st.roster.length >= LIM.roster) { rep.full = true; return; }
        p = newPlayer({ name: r.name, num: r.num, pos: r.pos });
        st.roster.push(p); if (k) byName[k] = p; rep.added++;
      }
      lu.push(p.id);
    });
    st.lineup = lu; st.batter = 0;
    return rep;
  }

  /* ---------- a sample team ---------- */
  function sampleState(withSpeech) {
    var names = ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5", "Player 6", "Player 7", "Player 8", "Player 9"];
    var nums = ["7", "12", "3", "24", "9", "18", "5", "31", "2"], poss = ["SS", "CF", "2B", "C", "1B", "3B", "LF", "RF", "P"];
    var sounds = ["horn", "chime", "drumroll", "siren"], st = emptyState();
    st.roster = names.map(function (n, i) {
      var p = newPlayer({ name: n, num: nums[i], pos: poss[i], songId: "b:" + sounds[i % sounds.length] });
      p.voice = withSpeech ? defaultVoice("tts", {}, null) : null;
      return p;
    });
    st.lineup = st.roster.map(function (p) { return p.id; });
    return st;
  }

  var api = {
    VERSION: VERSION, ID_RE: ID_RE, KEY_RE: KEY_RE, LIM: LIM, BUNDLE_CHUNK: BUNDLE_CHUNK, ATTACK: ATTACK,
    EQ_BANDS: EQ_BANDS, EQ_PRESETS: EQ_PRESETS, COMP: COMP, COMP_IDS: COMP_IDS, REVERB: REVERB, REVERB_IDS: REVERB_IDS, STATUS_TEXT: STATUS_TEXT,
    uid: uid, clone: clone, str: str, num: num, int: int, clamp: clamp, q1: q1, isYMD: isYMD, todayStr: todayStr, prng: prng,
    fmtClock: fmtClock, fmtSecs: fmtSecs, fmtSize: fmtSize, fmtDb: fmtDb, fileTitle: fileTitle,
    dbToGain: dbToGain, gainToDb: gainToDb, levelDb: levelDb, balanceGains: balanceGains, normalizeGain: normalizeGain,
    clampTrim: clampTrim, defaultTrim: defaultTrim, limits: limits, moveStart: moveStart, setLen: setLen, setFade: setFade, dragStart: dragStart, dragEnd: dragEnd,
    peaks: peaks, silenceRegion: silenceRegion,
    flatPolish: flatPolish, factoryAnnouncer: factoryAnnouncer, sanitizePolish: sanitizePolish, applyPreset: applyPreset, presetOf: presetOf, reverbMix: reverbMix,
    chainSpec: chainSpec, polishKey: polishKey, hash32: hash32, voiceRenderKey: voiceRenderKey, reverbTail: reverbTail, impulseResponse: impulseResponse,
    defaultMix: defaultMix, sanitizeMix: sanitizeMix, clipFrom: clipFrom, estimateSpeech: estimateSpeech, mixPlan: mixPlan,
    builtinSong: builtinSong, songById: songById, extOf: extOf, effectiveTrim: effectiveTrim, defaultVoice: defaultVoice, newPlayer: newPlayer, playerLabel: playerLabel,
    announceText: announceText, statusOf: statusOf,
    nextIndex: nextIndex, prevIndex: prevIndex, roles: roles, moveItem: moveItem, benchIds: benchIds, toBench: toBench, toLineup: toLineup, swapBench: swapBench, reindexBatter: reindexBatter,
    parseLine: parseLine, parsePasted: parsePasted,
    AUDIO_EXTS: AUDIO_EXTS, AUDIO_ACCEPT: AUDIO_ACCEPT, isAudioFile: isAudioFile, REQ: REQ, DEFAULT_TPL: DEFAULT_TPL, cleanLabel: cleanLabel, firstWord: firstWord, utf8Bytes: utf8Bytes, utf8Str: utf8Str, b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    newToken: newToken, sendPageUrl: sendPageUrl, buildRequestLink: buildRequestLink, parseRequestLink: parseRequestLink, whoLabel: whoLabel, fillTemplate: fillTemplate,
    requestMessage: requestMessage, requestSubject: requestSubject, sanitizeTemplate: sanitizeTemplate, smsHref: smsHref, mailtoHref: mailtoHref, songExt: songExt,
    buildSongFileName: buildSongFileName, parseSongFileName: parseSongFileName, parseReplyText: parseReplyText, sanitizeWant: sanitizeWant, sanitizeReq: sanitizeReq,
    libraryTitle: libraryTitle, startRequest: startRequest, playerByToken: playerByToken, hasSongFile: hasSongFile, requestCode: requestCode, requestProgress: requestProgress, findDuplicateSong: findDuplicateSong,
    sanitizeSettings: sanitizeSettings, sanitizeSong: sanitizeSong, sanitizeVoice: sanitizeVoice, sanitizeState: sanitizeState, emptyState: emptyState,
    defaultBoard: defaultBoard, sanitizeBoard: sanitizeBoard, tileRegion: tileRegion, queueAdd: queueAdd, queueDrop: queueDrop,
    audioKeys: audioKeys, counts: counts, makeBackup: makeBackup, validateBackup: validateBackup, sampleState: sampleState,
    voiceScore: voiceScore, pickVoice: pickVoice, normName: normName, songOwner: songOwner, introGuess: introGuess, clipOwner: clipOwner, activeVoice: activeVoice, saysName: saysName, fillLineup: fillLineup, loudStart: loudStart, clubRows: clubRows, applyRows: applyRows
  };
  root.WalkupCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
