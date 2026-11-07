/* Eight Count: the engine that keeps the count.
   One clock decides the position. Two kinds of clock:
     "perf": this phone's own timer (practice, recording)
     "wall": the phone's real time of day (Lock in together; phones set their clocks from the network,
             so two phones starting at the same wall-clock time start within a few hundredths of a second)
   Clicks are scheduled ahead on the Web Audio clock so they stay steady even if the screen is busy.
   A song, if there is one, follows the same clock and is nudged back into place if it drifts. */
(function () {
  "use strict";
  var App = window.App, EC = window.EC;
  var ctx = null, st = null, timer = 0, raf = 0, driftTimer = 0, songTimer = 0, wakeLock = null;
  var E = App.engine = {};

  App.audioCtx = function () {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { return null; }
    }
    return ctx;
  };
  /* Must be called from a tap: phones keep audio asleep until then. Resolves once the audio clock is running
     (or after a short wait, so a stubborn phone still starts the count). */
  App.unlock = function () {
    var c = App.audioCtx();
    if (!c || c.state === "running") return Promise.resolve();
    var p = c.state === "suspended" ? c.resume() : Promise.resolve();
    return Promise.race([p.catch(function () {}), new Promise(function (r) { setTimeout(r, 400); })]);
  };
  App.latencyMs = function () {
    var c = ctx; var l = c ? (c.outputLatency || c.baseLatency || 0) : 0;
    return l * 1000 + App.state.settings.trim;
  };

  function nowMs() { return st && st.domain === "wall" ? Date.now() : performance.now(); }
  E.running = function () { return !!st; };
  E.now = function (domain) { return domain === "wall" ? Date.now() : performance.now(); };

  /* ---- keep the screen on while counting ---- */
  function wakeOn() {
    try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }, function () {}); } catch (e) {}
  }
  function wakeOff() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
  document.addEventListener("visibilitychange", function () { if (st && document.visibilityState === "visible") wakeOn(); });

  /* ---- the click ---- */
  function click(h, when) {
    var c = ctx; if (!c) return;
    var k = Math.floor(h / 2), sub = h & 1, freq, vol, dur;
    if (sub) { if (!st.sub) return; freq = 520; vol = 0.16; dur = 0.03; }
    else if (k < 0) { freq = 1320; vol = 0.65; dur = 0.06; }
    else {
      if (!st.click) return;
      var b = (k + st.baseBeat) % 8;
      freq = b === 0 ? 1050 : b === 4 ? 820 : 640; vol = b === 0 ? 1 : b === 4 ? 0.8 : 0.55; dur = 0.07;
    }
    var o = c.createOscillator(), g = c.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    var peak = vol * App.state.settings.volume;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(c.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }

  /* Tie the audio clock to the count clock ONCE. Every click is then placed on the audio clock at an exact
     multiple of the beat length from that anchor, so clicks stay evenly spaced to the sample. (Re-reading both
     clocks on every check made the spacing wobble by the audio clock's step size, up to about 20 ms.) */
  function anchor() {
    if (!ctx || !st) return;
    st.aNow = nowMs(); st.aCtx = ctx.currentTime;
    st.ctxStart = st.aCtx + (st.startMs - st.aNow) / 1000;
  }
  function schedule() {
    if (!st || !ctx) return;
    var now = nowMs(), horizon = now + 150, endK = st.n * 8;
    // a brand-new audio clock starts ticking a moment after it is woken: wait until it really moves, then tie it down
    if (!st.warm) {
      if (ctx.currentTime === st.aCtx) return;
      st.warm = true; anchor();
    }
    // if the audio clock stopped or jumped (phone slept, call came in), tie it to the count clock again
    if (Math.abs((ctx.currentTime - st.aCtx) - (now - st.aNow) / 1000) > 0.05) anchor();
    for (;;) {
      var h = st.nextH, k = h / 2;
      if (k >= endK) break;
      var t = EC.beatMs(k, st.startMs, st.bpm, st.rate);
      if (t > horizon) break;
      if (t >= now - 40) click(h, st.ctxStart + h * 30 / (st.bpm * st.rate));
      st.nextH++;
    }
  }

  /* ---- what is on screen right now ---- */
  function frame() {
    if (!st) return;
    raf = requestAnimationFrame(frame);
    var now = nowMs(), lat = App.latencyMs();
    var p = EC.posSec(now - lat, st.startMs, st.rate);
    var rel = EC.beatAt(p, st.bpm, st.n), info;
    if (rel.state === "run") {
      var gb = rel.bi + st.baseBeat;
      info = { state: "run", g: Math.floor(gb / 8), b: gb % 8, sub: rel.sub, rel: rel.bi, total: st.n * 8 };
    } else info = rel;
    if (info.state === "pre") info.until = (EC.beatMs(-4, st.startMs, st.bpm, st.rate) - now) / 1000;
    if (info.state === "countoff" && !st.cfg.countoff) info = { state: "pre", until: -p };
    var key = info.state + ":" + info.g + ":" + info.b + ":" + info.sub + ":" + (info.label || "") + ":" + (info.until != null ? Math.ceil(info.until) : "");
    if (key !== st.lastKey) { st.lastKey = key; try { st.cfg.onFrame(info, p); } catch (e) { console.error(e); } }
    if (info.state === "done") E.stop("end");
  }

  /* ---- song follows the clock ---- */
  function songStart() {
    var a = st && st.cfg.audio; if (!a) return;
    var el = a.el, plan = EC.audioPlan(a.offset + st.baseSec, st.bpm, st.rate);
    var atMs = st.startMs + plan.startPos / st.rate * 1000, delay = Math.max(0, atMs - nowMs());
    st.plan = plan;
    songTimer = setTimeout(function () {
      if (!st) return;
      try { el.currentTime = plan.songStart; el.playbackRate = st.rate; var pr = el.play(); if (pr && pr.catch) pr.catch(function () { App.toast("Tap play again to start the song"); }); } catch (e) {}
    }, delay);
    driftTimer = setInterval(function () {
      if (!st || el.paused) return;
      var pos = EC.posSec(nowMs(), st.startMs, st.rate);
      if (pos < st.plan.startPos) return;
      var expected = a.offset + st.baseSec + pos, err = expected - el.currentTime;
      if (Math.abs(err) > 0.3) { try { el.currentTime = expected; } catch (e) {} }
      else el.playbackRate = EC.driftRate(err, st.rate);
    }, 250);
  }

  /* cfg: bpm, rate, n (8-counts, Infinity for free), base (first 8-count index), domain, startMs (when the first "1"
     happens, optional), countoff, click, sub, audio {el, offset}, onFrame(info), onEnd(reason) */
  E.start = function (cfg) {
    E.stop("restart", true);
    var rate = cfg.rate || 1, bpm = cfg.bpm;
    var domain = cfg.domain || "perf";
    st = {
      cfg: cfg, domain: domain, bpm: bpm, rate: rate, n: cfg.n, baseBeat: (cfg.base || 0) * 8, baseSec: (cfg.base || 0) * 8 * 60 / bpm,
      click: cfg.click !== false, sub: !!App.state.settings.subdivide, lastKey: ""
    };
    var co = cfg.countoff !== false;
    if (cfg.startMs != null) st.startMs = cfg.startMs;
    else st.startMs = nowMs() + (co ? EC.countoffMs(bpm, rate) : 0) + 350;
    st.nextH = co ? -8 : 0;
    wakeOn();
    anchor();
    timer = setInterval(schedule, 25); schedule();
    songStart();
    raf = requestAnimationFrame(frame);
    return st.startMs;
  };

  E.stop = function (reason, quiet) {
    if (!st) return;
    var s = st; st = null;
    clearInterval(timer); clearInterval(driftTimer); clearTimeout(songTimer); cancelAnimationFrame(raf);
    if (s.cfg.audio) { try { s.cfg.audio.el.pause(); } catch (e) {} }
    wakeOff();
    if (!quiet && s.cfg.onEnd) { try { s.cfg.onEnd(reason); } catch (e) { console.error(e); } }
  };

  /* Where is the count right now (used by recording to note when the first "1" happened). */
  E.startMs = function () { return st ? st.startMs : null; };
})();
