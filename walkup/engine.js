/* Walk-Up engine: all the audio, and nothing about the screen.
   One shared AudioContext (woken from a tap), decoded buffers kept in small LRU caches, the voice polish chain rendered
   through an OfflineAudioContext, mixes played from ONE plan (core.mixPlan) on the audio clock, the computer voice
   (speechSynthesis), and the microphone recorder. Playback uses AudioBufferSourceNode.start(when, offset, duration),
   never <audio> elements. */
(function () {
  "use strict";
  var WU = window.WU = window.WU || {};
  var C = window.WalkupCore, SND = window.WalkupSounds;
  var E = WU.eng = {};
  var CFG = E.CFG = { speechTimeoutMs: 6000, longSec: 90, songLru: 6, rawLru: 12, renderLru: 8 };

  /* ---------- small LRU ---------- */
  function LRU(max) { this.max = max; this.m = new Map(); }
  LRU.prototype.get = function (k) { if (!this.m.has(k)) return undefined; var v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; };
  LRU.prototype.set = function (k, v) { this.m.delete(k); this.m.set(k, v); while (this.m.size > this.max) this.m.delete(this.m.keys().next().value); };
  LRU.prototype.del = function (k) { this.m.delete(k); };
  LRU.prototype.clear = function () { this.m.clear(); };
  LRU.prototype.keys = function () { return Array.from(this.m.keys()); };
  var songCache = new LRU(CFG.songLru), rawCache = new LRU(CFG.rawLru), renderCache = new LRU(CFG.renderLru), synthCache = new Map(), irCache = new Map();
  E.cacheInfo = function () { return { songs: songCache.keys(), raw: rawCache.keys(), rendered: renderCache.keys() }; };
  E.forget = function (key) { songCache.del(key); rawCache.del(key); };
  E.forgetAll = function () { songCache.clear(); rawCache.clear(); renderCache.clear(); };

  function fail(kind, msg) { var e = new Error(msg || kind); e.kind = kind; return e; }

  /* ---------- the audio context ---------- */
  var ctx = null, master = null, masterVol = 1, unlocked = false;
  E.supported = function () { return !!(window.AudioContext || window.webkitAudioContext); };
  E.ctx = function () {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    master = ctx.createGain(); master.gain.value = masterVol; master.connect(ctx.destination);
    try { ctx.onstatechange = function () { if (E.onchange) E.onchange(); }; } catch (e) { /* ignore */ }
    return ctx;
  };
  E.state = function () { return ctx ? ctx.state : "none"; };
  E.now = function () { return ctx ? ctx.currentTime : 0; };
  E.master = function () { return master; };
  E.setMaster = function (pct) { masterVol = Math.max(0, Math.min(100, +pct || 0)) / 100; if (master) master.gain.value = masterVol; };
  /* Phones keep audio asleep until a tap: call this from a tap handler. Resolves true once the clock is running. */
  E.unlock = function () {
    var c = E.ctx();
    if (!c) return Promise.resolve(false);
    if (!unlocked) {
      unlocked = true;
      try { var o = c.createOscillator(), g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(c.destination); o.start(0); o.stop(c.currentTime + 0.05); } catch (e) { /* ignore */ }
    }
    if (c.state === "running") return Promise.resolve(true);
    var p; try { p = c.resume(); } catch (e) { return Promise.resolve(false); }
    return Promise.race([Promise.resolve(p).then(function () { return c.state === "running"; }, function () { return false; }), new Promise(function (r) { setTimeout(function () { r(c.state === "running"); }, 500); })]);
  };

  /* ---------- reading and decoding ---------- */
  function readAB(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(blob); });
  }
  /* Blob (or ArrayBuffer) -> AudioBuffer. Rejects with kind "decode" when the phone can't read the format. */
  E.decode = function (src) {
    var c = E.ctx();
    if (!c) return Promise.reject(fail("noaudio", "This browser can't play audio."));
    var p0 = src instanceof ArrayBuffer ? Promise.resolve(src) : readAB(src);
    return p0.then(function (ab) {
      return new Promise(function (res, rej) {
        var p;
        try { p = c.decodeAudioData(ab, res, rej); } catch (e) { return rej(e); }
        if (p && p.then) p.then(res, rej);
      });
    }).then(function (b) { return b; }, function (e) { throw fail("decode", (e && e.message) || "decode"); });
  };
  E.synthBuffer = function (sound) {
    var c = E.ctx(); if (!c) return null;
    var k = sound + "@" + c.sampleRate, b = synthCache.get(k);
    if (!b) {
      var d = SND.synth(sound, c.sampleRate);
      if (!d) return null;
      b = c.createBuffer(1, d.length, c.sampleRate); b.copyToChannel(d, 0); synthCache.set(k, b);
    }
    return b;
  };
  E.crop = function (buf, t0, t1) {
    var c = E.ctx(), sr = buf.sampleRate, a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(buf.length, Math.ceil(t1 * sr));
    var out = c.createBuffer(buf.numberOfChannels, Math.max(1, b - a), sr);
    for (var ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(a, b), ch);
    return out;
  };
  /* Peaks for drawing, worked out a little at a time so a 12-minute song never freezes the screen.
     Resolves with n values (loudest across channels) or null if cancelled() turned true. */
  E.peaksAsync = function (buf, n, t0, t1, cancelled) {
    return new Promise(function (res) {
      var sr = buf.sampleRate, from = Math.floor(t0 * sr), to = Math.min(buf.length, Math.ceil(t1 * sr)), out = new Float32Array(n), chans = [], i = 0, ch;
      for (ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch));
      (function step() {
        if (cancelled && cancelled()) return res(null);
        var st = performance.now();
        while (i < n && performance.now() - st < 8) { for (ch = 0; ch < chans.length; ch++) C.peaks(chans[ch], n, from, to, out, i, i + 1); i++; }
        if (i < n) setTimeout(step, 0); else res(out);
      })();
    });
  };

  /* ---------- songs ---------- */
  function covers(hit, a, b) { return hit.base <= a + 0.001 && hit.base + hit.buf.duration >= b - 0.001; }
  function cropIfLong(buf, n0, n1) {
    return buf.duration > CFG.longSec ? { buf: E.crop(buf, n0, n1 + 0.1), base: n0 } : { buf: buf, base: 0 };
  }
  var inflight = {};
  /* The decoded song, ready to play from trim.start for trim.len seconds. Short songs stay whole; a long song keeps only
     the part that will play (so a 12-minute file does not sit in memory). Returns { buf, base } where base is the song time of the buffer's first sample. */
  E.songBuffer = function (song, trim) {
    if (!E.ctx()) return Promise.reject(fail("noaudio", "This browser can't play audio."));
    var n0 = trim ? trim.start : 0, n1 = trim ? trim.start + trim.len : (song.dur || 0), hit = songCache.get(song.id);
    if (hit && covers(hit, n0, n1)) return Promise.resolve(hit);
    var f = inflight[song.id];
    if (f && f.n0 <= n0 + 0.001 && f.n1 >= n1 - 0.001) return f.p;
    var p;
    if (song.kind === "synth") {
      var sb = E.synthBuffer(song.sound);
      p = sb ? Promise.resolve({ buf: sb, base: 0 }) : Promise.reject(fail("missing", "Unknown sound"));
    } else {
      p = WU.db.get("s:" + song.id).then(function (rec) {
        if (!rec) throw fail("missing", "The song file isn't on this phone.");
        return E.decode(rec.blob);
      }).then(function (b) { return cropIfLong(b, n0, n1); });
    }
    p = p.then(function (r) { songCache.set(song.id, r); return r; });
    var entry = { n0: n0, n1: n1, p: p };
    inflight[song.id] = entry;
    var clear = function () { if (inflight[song.id] === entry) delete inflight[song.id]; };
    p.then(clear, clear);
    return p;
  };
  /* the whole decoded song, for the trim editor (not cropped) */
  E.songFull = function (song) {
    if (!E.ctx()) return Promise.reject(fail("noaudio", "This browser can't play audio."));
    if (song.kind === "synth") { var sb = E.synthBuffer(song.sound); return sb ? Promise.resolve(sb) : Promise.reject(fail("missing", "Unknown sound")); }
    var hit = songCache.get(song.id);
    if (hit && hit.base === 0 && hit.buf.duration >= (song.dur || 0) - 0.05) return Promise.resolve(hit.buf);
    return WU.db.get("s:" + song.id).then(function (rec) {
      if (!rec) throw fail("missing", "The song file isn't on this phone.");
      return E.decode(rec.blob);
    }).then(function (b) { if (b.duration <= CFG.longSec) songCache.set(song.id, { buf: b, base: 0 }); return b; });
  };
  /* keep a song the editor already decoded, so the first Play is instant */
  E.putSongBuffer = function (song, fullBuf, trim) { songCache.set(song.id, cropIfLong(fullBuf, trim.start, trim.start + trim.len)); };

  /* ---------- the voice polish chain ---------- */
  function irFor(size, sr) {
    var k = size + "@" + sr;
    if (!irCache.has(k)) irCache.set(k, C.impulseResponse(size, sr, 1234));
    return irCache.get(k);
  }
  /* Builds high-pass -> EQ -> compressor -> room reverb (dry + wet) -> output gain on any (offline or live) context.
     spec comes from core.chainSpec. Returns the node to connect onward. */
  E.buildChain = function (ac, input, spec) {
    var node = input, i;
    if (spec.hp) { var hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = spec.hp.freq; hp.Q.value = 20 * Math.log10(spec.hp.q); /* the Q of a high-pass is in dB: 0.707 = no resonance bump */ node.connect(hp); node = hp; }
    for (i = 0; i < spec.eq.length; i++) {
      var b = spec.eq[i];
      if (!b.gain) continue;
      var f = ac.createBiquadFilter(); f.type = "peaking"; f.frequency.value = b.f; f.Q.value = b.q; f.gain.value = b.gain; node.connect(f); node = f;
    }
    if (spec.comp) {
      var cp = ac.createDynamicsCompressor();
      cp.threshold.value = spec.comp.threshold; cp.knee.value = spec.comp.knee; cp.ratio.value = spec.comp.ratio; cp.attack.value = spec.comp.attack; cp.release.value = spec.comp.release;
      node.connect(cp); node = cp;
    }
    var out = ac.createGain(); out.gain.value = spec.out;
    if (spec.rev) {
      var conv = ac.createConvolver(); conv.normalize = false;
      var ir = irFor(spec.rev.size, ac.sampleRate), ib = ac.createBuffer(2, ir[0].length, ac.sampleRate);
      ib.copyToChannel(ir[0], 0); ib.copyToChannel(ir[1], 1); conv.buffer = ib;
      var dry = ac.createGain(), wet = ac.createGain(); dry.gain.value = spec.rev.dry; wet.gain.value = spec.rev.wet;
      node.connect(dry); node.connect(conv); conv.connect(wet); dry.connect(out); wet.connect(out);
    } else node.connect(out);
    return out;
  };
  function peakOf(buf, t0, t1) {
    var sr = buf.sampleRate, a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(buf.length, Math.ceil(t1 * sr)), m = 0;
    for (var ch = 0; ch < buf.numberOfChannels; ch++) { var d = buf.getChannelData(ch); for (var i = a; i < b; i++) { var v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; } }
    return m;
  }
  /* Renders raw[ts..te] through the chain with an OfflineAudioContext. Returns { buf, speech, total } where speech is the dry
     length and the buffer is that plus the reverb tail. The same graph runs for Preview and for game-mode Play. */
  E.renderBuffer = function (raw, o) {
    var c = E.ctx(), sr = raw.sampleRate;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!c || !OAC) return Promise.reject(fail("noaudio", "This browser can't process audio."));
    var ts = Math.max(0, Math.min(raw.duration - 0.05, +o.ts || 0)), te = Math.max(ts + 0.05, Math.min(raw.duration, o.te == null ? raw.duration : +o.te));
    var dry = te - ts, total = dry + C.reverbTail(o.polish), frames = Math.max(1, Math.ceil(total * sr));
    var oc = new OAC(2, frames, sr), src = oc.createBufferSource(), pre = oc.createGain();
    src.buffer = raw; pre.gain.value = o.norm ? C.normalizeGain(peakOf(raw, ts, te)) : 1;
    src.connect(pre);
    E.buildChain(oc, pre, C.chainSpec(o.polish)).connect(oc.destination);
    src.start(0, ts, dry);
    return new Promise(function (res, rej) {
      oc.oncomplete = function (e) { res(e.renderedBuffer); };
      var p; try { p = oc.startRendering(); } catch (e) { return rej(e); }
      if (p && p.then) p.then(res, rej);
    }).then(function (buf) { return { buf: buf, speech: dry, total: buf.duration }; });
  };
  E.voiceRaw = function (voice) {
    var hit = rawCache.get(voice.id);
    if (hit) return Promise.resolve(hit);
    return WU.db.get("v:" + voice.id).then(function (rec) {
      if (!rec) throw fail("missing", "The voice file isn't on this phone.");
      return E.decode(rec.blob);
    }).then(function (b) { rawCache.set(voice.id, b); return b; });
  };
  E.putVoiceRaw = function (id, buf) { rawCache.set(id, buf); };
  /* the polished voice, rendered once per set of settings and kept (LRU) */
  E.renderVoice = function (voice) {
    var c = E.ctx();
    if (!c) return Promise.reject(fail("noaudio", "This browser can't play audio."));
    var key = C.voiceRenderKey(voice, c.sampleRate), hit = renderCache.get(key);
    if (hit) return Promise.resolve(hit);
    return E.voiceRaw(voice).then(function (raw) { return E.renderBuffer(raw, voice); }).then(function (r) { renderCache.set(key, r); return r; });
  };

  /* ---------- the computer voice ---------- */
  var SP = E.speech = {};
  SP.supported = function () { try { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window && !!window.speechSynthesis; } catch (e) { return false; } };
  SP.voices = function () { try { return SP.supported() ? (window.speechSynthesis.getVoices() || []) : []; } catch (e) { return []; } };
  /* Says the text. done(why) runs once: "end", "error" or "timeout" (6 s fallback). Returns a cancel function. */
  SP.speak = function (text, o, done) {
    o = o || {};
    var finished = false, timer = 0;
    function fin(why) { if (finished) return; finished = true; clearTimeout(timer); try { if (done) done(why); } catch (e) { console.error(e); } }
    try {
      var s = window.speechSynthesis;
      s.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      u.rate = o.rate || 1; u.volume = o.volume == null ? 1 : o.volume;
      if (o.voiceURI) { var vs = SP.voices(); for (var i = 0; i < vs.length; i++) if (vs[i].voiceURI === o.voiceURI) { u.voice = vs[i]; break; } }
      u.onend = function () { fin("end"); };
      u.onerror = function () { fin("error"); };
      s.speak(u);
    } catch (e) { setTimeout(function () { fin("error"); }, 0); return function () { finished = true; }; }
    timer = setTimeout(function () { fin("timeout"); }, CFG.speechTimeoutMs);
    return function cancel() { finished = true; clearTimeout(timer); try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } };
  };

  /* ---------- playing a mix ---------- */
  var cur = null;
  E.last = null; // the most recent play (kept for tests and for the screen)
  E.onchange = null;
  function changed() { if (E.onchange) { try { E.onchange(); } catch (e) { console.error(e); } } }
  function setPoints(param, pts, t0) {
    if (!pts || !pts.length) return;
    param.setValueAtTime(pts[0][1], t0 + pts[0][0]);
    for (var i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], t0 + pts[i][0]);
  }
  /* pb = { plan, music:{buf,base}|null, voice:{buf}|null, tts:{text, opts}|null }; opts = { key, onEnd(why) } */
  E.play = function (pb, opts) {
    opts = opts || {};
    var c = E.ctx();
    if (!c) throw fail("noaudio", "This browser can't play audio.");
    E.stop(0.03, true);
    var t0 = c.currentTime + 0.03, bus = c.createGain();
    bus.connect(master);
    var run = { t0: t0, plan: pb.plan, bus: bus, nodes: [], timers: [], done: false, key: opts.key || "", onEnd: opts.onEnd, cancelTts: null, started: performance.now() };
    pb.plan.tracks.forEach(function (tr) {
      if (tr.tts) {
        var delay = Math.max(0, t0 + tr.when - c.currentTime) * 1000;
        run.timers.push(setTimeout(function () {
          if (run.done || !pb.tts) return;
          run.cancelTts = SP.speak(pb.tts.text, pb.tts.opts, function () { /* the plan's own length decides when the play ends */ });
        }, delay));
        return;
      }
      var b = tr.track === "music" ? pb.music : pb.voice;
      if (!b) return;
      var src = c.createBufferSource(), g = c.createGain(), out = g, duck = null;
      src.buffer = b.buf; g.gain.value = 0; src.connect(g);
      setPoints(g.gain, tr.gainPoints, t0);
      if (tr.duckPoints && tr.duckPoints.length) { duck = c.createGain(); out.connect(duck); out = duck; setPoints(duck.gain, tr.duckPoints, t0); }
      out.connect(bus);
      var offset = tr.track === "music" ? Math.max(0, tr.offset - (b.base || 0)) : Math.max(0, tr.offset);
      src.start(t0 + tr.when, offset, tr.duration);
      run.nodes.push({ track: tr.track, src: src, g: g, duck: duck });
    });
    run.timers.push(setTimeout(function () { finish(run, "end"); }, (pb.plan.total + (t0 - c.currentTime)) * 1000 + 150));
    cur = run; E.last = run;
    changed();
    return run;
  };
  function finish(run, why) {
    if (run.done) return;
    run.done = true;
    run.timers.forEach(clearTimeout);
    if (cur === run) cur = null;
    setTimeout(function () { try { run.bus.disconnect(); } catch (e) { /* ignore */ } }, ((run.stopped ? run.stopped.fade : 0) + 0.3) * 1000);
    if (run.onEnd) { try { run.onEnd(why); } catch (e) { console.error(e); } }
    changed();
  }
  /* fade everything out over `fade` seconds (0.5 by default) and stop */
  E.stop = function (fade, quiet) {
    var run = cur;
    if (!run) { if (!quiet) { try { if (SP.supported()) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } return false; }
    var c = ctx, now = c.currentTime;
    fade = fade == null ? C.LIM.stopFade : fade;
    run.timers.forEach(clearTimeout);
    if (run.cancelTts) { try { run.cancelTts(); } catch (e) { /* ignore */ } }
    try {
      run.bus.gain.cancelScheduledValues(now);
      run.bus.gain.setValueAtTime(1, now);
      run.bus.gain.linearRampToValueAtTime(0, now + fade);
    } catch (e) { /* ignore */ }
    run.nodes.forEach(function (n) { try { n.src.stop(now + fade + 0.03); } catch (e) { /* ignore */ } });
    run.stopped = { at: now, fade: fade };
    finish(run, "stop");
    return true;
  };
  E.playing = function () {
    if (!cur || !ctx) return null;
    return { key: cur.key, elapsed: Math.max(0, ctx.currentTime - cur.t0), total: cur.plan.total, run: cur };
  };
  /* one buffer, one region, with a fade out: used by previews in the editors */
  E.playSimple = function (buf, o) {
    var len = o.duration, fade = Math.min(o.fade || 0, len), g = o.gain == null ? 1 : o.gain, tail = Math.max(fade, 0.01), pts = [[0, 0], [C.ATTACK, g]];
    if (len - tail > C.ATTACK) pts.push([len - tail, g]);
    pts.push([len, 0]);
    var plan = { tracks: [{ track: "music", when: 0, offset: o.offset || 0, duration: len, gainPoints: pts, duckPoints: null }], total: len };
    return E.play({ plan: plan, music: { buf: buf, base: o.base || 0 }, voice: null, tts: null }, { key: o.key || "preview", onEnd: o.onEnd });
  };

  /* Everything a player's mix needs, loaded and rendered, so Play is instant. */
  E.prepare = function (player, st, speechOpts) {
    var song = player.songId ? C.songById(st.songs, player.songId) : null, tr = song ? C.effectiveTrim(player, song) : null, v = player.voice;
    var pm = song ? E.songBuffer(song, tr) : Promise.resolve(null);
    var pv = v && v.kind !== "tts" ? E.renderVoice(v) : Promise.resolve(null);
    return Promise.all([pm, pv]).then(function (r) {
      var music = r[0], voice = r[1], text = C.announceText(player), tts = v && v.kind === "tts" ? { text: text, opts: speechOpts || {} } : null;
      var plan = C.mixPlan({
        music: song ? { len: tr.len, offset: tr.start, fade: tr.fade } : null,
        voice: !v ? null : tts ? { len: C.estimateSpeech(text), speech: C.estimateSpeech(text), offset: 0, tts: true } : { len: voice.total, speech: voice.speech, offset: 0 },
        mix: player.mix
      });
      return { plan: plan, music: music, voice: voice, tts: tts };
    });
  };
  /* the plan alone (no audio needed), for drawing the timeline */
  E.planFor = function (player, st) {
    var song = player.songId ? C.songById(st.songs, player.songId) : null, tr = song ? C.effectiveTrim(player, song) : null, v = player.voice;
    var text = C.announceText(player), est = C.estimateSpeech(text), vlen = 0, speech = 0;
    if (v && v.kind === "tts") { vlen = speech = est; }
    else if (v) { speech = Math.max(0.1, (v.te || v.dur) - (v.ts || 0)); vlen = speech + C.reverbTail(v.polish); }
    return C.mixPlan({ music: song ? { len: tr.len, offset: tr.start, fade: tr.fade } : null, voice: v ? { len: vlen, speech: speech, offset: 0, tts: v.kind === "tts" } : null, mix: player.mix });
  };

  /* a short beep, for the sound check */
  E.tone = function (freq, dur) {
    var c = E.ctx(); if (!c) return 0;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + 0.02;
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02); g.gain.setValueAtTime(0.5, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    return dur;
  };

  /* ---------- the microphone ---------- */
  var R = E.rec = {};
  var rs = null; // { stream, recorder, chunks, analyser, source, mime, t0 }
  R.supported = function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); };
  R.mime = function () {
    var list = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus", "audio/aac"];
    try { for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* ignore */ }
    return "";
  };
  R.explain = function (e) {
    var n = e && e.name;
    if (!window.isSecureContext && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return "Recording needs a secure page (https). Open Walk-Up from its web address instead of from a file.";
    if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return "Walk-Up isn't allowed to use the microphone. Allow it in this browser's site settings (or your phone's settings), then try again.";
    if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") return "No microphone was found. Plug one in or check the phone's settings. You can also use a voice file.";
    if (n === "NotReadableError" || n === "AbortError") return "The microphone is busy. Close any app that is using it and try again.";
    return "The microphone didn't start. You can use a voice file instead.";
  };
  /* open the microphone (asks permission); the level meter works from now on, recording starts with begin() */
  R.open = function () {
    if (!R.supported()) return Promise.reject(fail("nomic", "no mic"));
    var c = E.ctx();
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var mime = R.mime(), rec;
      try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); throw e; }
      var st = { stream: stream, recorder: rec, chunks: [], mime: rec.mimeType || mime || "audio/webm", analyser: null, source: null, buf: null, t0: 0 };
      if (c) {
        try { st.source = c.createMediaStreamSource(stream); st.analyser = c.createAnalyser(); st.analyser.fftSize = 1024; st.source.connect(st.analyser); st.buf = new Float32Array(st.analyser.fftSize); } catch (e) { st.analyser = null; }
      }
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) st.chunks.push(ev.data); };
      rs = st;
      return true;
    });
  };
  R.begin = function () { if (!rs) return false; rs.t0 = performance.now(); rs.recorder.start(250); return true; };
  /* loudest recent sample, 0..1 */
  R.level = function () {
    if (!rs || !rs.analyser) return 0;
    try { rs.analyser.getFloatTimeDomainData(rs.buf); } catch (e) { return 0; }
    var m = 0; for (var i = 0; i < rs.buf.length; i++) { var v = rs.buf[i] < 0 ? -rs.buf[i] : rs.buf[i]; if (v > m) m = v; }
    return Math.min(1, m);
  };
  R.seconds = function () { return rs && rs.t0 ? (performance.now() - rs.t0) / 1000 : 0; };
  R.active = function () { return !!rs; };
  function release(st) {
    try { st.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
    try { if (st.source) st.source.disconnect(); } catch (e) { /* ignore */ }
  }
  R.stop = function () {
    var st = rs;
    if (!st) return Promise.reject(fail("norec", "not recording"));
    rs = null;
    return new Promise(function (res, rej) {
      st.recorder.onstop = function () { release(st); var blob = new Blob(st.chunks, { type: st.mime }); blob.size ? res({ blob: blob, mime: st.mime }) : rej(fail("empty", "empty")); };
      st.recorder.onerror = function () { release(st); rej(fail("recfail", "recorder error")); };
      try { if (st.recorder.state !== "inactive") st.recorder.stop(); else st.recorder.onstop(); } catch (e) { release(st); rej(e); }
    });
  };
  R.cancel = function () {
    var st = rs; rs = null;
    if (!st) return;
    try { st.recorder.ondataavailable = null; st.recorder.onstop = null; if (st.recorder.state !== "inactive") st.recorder.stop(); } catch (e) { /* ignore */ }
    release(st);
  };
})();
