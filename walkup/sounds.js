/* Walk-Up built-in sounds: four short sounds made from maths, so the app has something to play with no files at all.
   Pure (no DOM, no audio): loaded in the browser as window.WalkupSounds and in node tests with require(). */
(function (root) {
  "use strict";
  var TWO_PI = Math.PI * 2;
  var SOUNDS = [
    { id: "horn", label: "Horn", dur: 1.8 },
    { id: "chime", label: "Chime", dur: 3.0 },
    { id: "drumroll", label: "Drumroll", dur: 3.0 },
    { id: "siren", label: "Siren", dur: 4.0 }
  ];
  function info(id) { for (var i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === id) return SOUNDS[i]; return null; }

  // small seeded random numbers, so the drumroll is the same every time
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
  function normalize(out, peak) {
    var m = 0, i;
    for (i = 0; i < out.length; i++) { var a = Math.abs(out[i]); if (a > m) m = a; }
    if (m > 0) { var k = peak / m; for (i = 0; i < out.length; i++) out[i] *= k; }
    return out;
  }

  function horn(sr) {
    var n = Math.round(1.8 * sr), out = new Float32Array(n), f1 = 392, f2 = 494;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var env = Math.min(1, t / 0.02) * (t > 1.4 ? Math.max(0, 1 - (t - 1.4) / 0.4) : 1);
      var trem = 1 + 0.06 * Math.sin(TWO_PI * 24 * t), s = 0;
      for (var k = 1; k <= 6; k++) s += (Math.sin(TWO_PI * f1 * k * t) + Math.sin(TWO_PI * f2 * k * t)) / k;
      out[i] = s * env * trem;
    }
    return normalize(out, 0.8);
  }
  function chime(sr) {
    var n = Math.round(3.0 * sr), out = new Float32Array(n);
    var notes = [[880, 0], [1108.73, 0.22], [1318.51, 0.44], [1760, 0.66]];
    for (var i = 0; i < n; i++) {
      var t = i / sr, s = 0;
      for (var j = 0; j < notes.length; j++) {
        var tt = t - notes[j][1];
        if (tt < 0) continue;
        var f = notes[j][0], a = Math.min(1, tt / 0.003);
        s += a * (Math.exp(-tt / 0.55) * Math.sin(TWO_PI * f * tt) + 0.5 * Math.exp(-tt / 0.25) * Math.sin(TWO_PI * f * 2.76 * tt) + 0.25 * Math.exp(-tt / 0.12) * Math.sin(TWO_PI * f * 5.4 * tt));
      }
      out[i] = s * (t > 2.9 ? Math.max(0, (3.0 - t) / 0.1) : 1);
    }
    return normalize(out, 0.8);
  }
  function drumroll(sr) {
    var n = Math.round(3.0 * sr), out = new Float32Array(n), rnd = prng(20240607), t = 0, hits = [];
    while (t < 2.6) { hits.push(t); t += 1 / (16 + 10 * (t / 2.6)); }
    var blen = Math.round(0.05 * sr), j, k;
    for (k = 0; k < hits.length; k++) {
      var amp = 0.25 + 0.75 * (hits[k] / 2.6), at = Math.round(hits[k] * sr);
      for (j = 0; j < blen && at + j < n; j++) out[at + j] += (rnd() * 2 - 1) * amp * Math.exp(-j / (sr * 0.018));
    }
    var fl = Math.round(2.7 * sr), fb = n - fl;
    for (j = 0; j < fb; j++) {
      var tt = j / sr;
      out[fl + j] += (rnd() * 2 - 1) * 1.2 * Math.exp(-tt / 0.09) + 1.0 * Math.sin(TWO_PI * 70 * tt) * Math.exp(-tt / 0.2);
    }
    return normalize(out, 0.8);
  }
  function siren(sr) {
    var n = Math.round(4.0 * sr), out = new Float32Array(n), ph = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr, c = (t / 1.2) % 1, tri = Math.abs(c * 2 - 1);
      ph += TWO_PI * (600 + 600 * tri) / sr;
      var env = Math.min(1, t / 0.04) * (t > 3.75 ? Math.max(0, (4.0 - t) / 0.25) : 1);
      out[i] = (Math.sin(ph) + 0.35 * Math.sin(3 * ph)) * env;
    }
    return normalize(out, 0.8);
  }
  /* A mono Float32Array for one of the four sounds at the given sample rate, or null for an unknown id. */
  function synth(id, sr) {
    sr = Math.min(96000, Math.max(8000, Math.round(sr) || 44100));
    switch (id) {
      case "horn": return horn(sr);
      case "chime": return chime(sr);
      case "drumroll": return drumroll(sr);
      case "siren": return siren(sr);
    }
    return null;
  }
  var api = { SOUNDS: SOUNDS, info: info, synth: synth, prng: prng };
  root.WalkupSounds = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
