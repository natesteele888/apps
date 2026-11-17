/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Fairway's menu ambience: birdsong, a little breeze and a calm piano over a soft pad, the way a tournament
   broadcast opens. It is all made right here in the phone with the Web Audio API, so there are no sound files.
   (The music is an original slow progression, not any broadcast's theme.)
   - Phones only allow sound after a tap, so nothing starts until the first tap on the page.
   - Plays on the menu screens only, and fades out when a tournament opens, so scoring stays quiet.
   - Low volume by default. The speaker button turns it off or on, and this phone remembers.
   - Your own recordings can replace either made-up layer: put audio/menu-birds.mp3 or audio/menu-music.mp3
     in the audio folder (see audio/README.md) and that file loops instead. */
(function () {
  "use strict";
  const FW = window.FW = window.FW || {};
  const KEY = "fw:sound";
  const VOLUME = 0.5;           // the whole mix; each layer below is quieter still
  const BIRDS = 0.16, BREEZE = 0.035, PIANO = 0.11, PAD = 0.045, FILE_BIRDS = 0.22, FILE_MUSIC = 0.14;
  const FADE = 1.4;              // seconds
  const FILES = { birds: "audio/menu-birds.mp3", music: "audio/menu-music.mp3" };
  let on = true, scene = "quiet", unlocked = false, ac = null, master = null, bus = {}, loop = null, nextBird = 0, nextBar = 0, bar = 0, files = {};
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) { /* default on */ }

  function setup() {
    if (ac) return true;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return false;
    try { ac = new A(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    // a soft room: a filtered feedback delay the piano and birds both send into
    const delay = ac.createDelay(1.5), fb = ac.createGain(), tone = ac.createBiquadFilter(), wet = ac.createGain();
    delay.delayTime.value = 0.42; fb.gain.value = 0.32; tone.type = "lowpass"; tone.frequency.value = 2400; wet.gain.value = 0.35;
    delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(master);
    bus.verb = delay;
    ["birds", "music"].forEach(k => { const g = ac.createGain(); g.connect(master); bus[k] = g; });
    breeze();
    // a recording, if one is in the audio folder, takes over its layer
    Object.keys(FILES).forEach(k => {
      fetch(FILES[k], { method: "HEAD", cache: "no-store" }).then(r => {
        if (!r.ok || !/audio|mpeg|octet/.test(r.headers.get("content-type") || "audio")) return;
        const a = new Audio(FILES[k]); a.loop = true; a.crossOrigin = "anonymous";
        const src = ac.createMediaElementSource(a), g = ac.createGain();
        g.gain.value = k === "birds" ? FILE_BIRDS : FILE_MUSIC; src.connect(g); g.connect(master);
        files[k] = a; bus[k].gain.value = 0; // silence the made-up layer
        if (playing()) a.play().catch(() => {});
      }).catch(() => {});
    });
    return true;
  }
  const playing = () => on && unlocked && scene === "menu";

  /* ---------- the breeze: quiet filtered noise that swells now and then ---------- */
  function breeze() {
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } // brown-ish noise
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 520;
    const g = ac.createGain(); g.gain.value = BREEZE;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = BREEZE * 0.7; lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(bus.birds); n.start(); lfo.start();
  }

  /* ---------- birds: little phrases of chirps from different "species", left and right ---------- */
  const SPECIES = [
    { lo: 2600, hi: 3900, len: 0.07, gap: 0.05, n: [3, 6], up: true },    // quick rising chirps
    { lo: 3400, hi: 2300, len: 0.16, gap: 0.12, n: [2, 3], up: false },   // falling whistle
    { lo: 4200, hi: 5200, len: 0.035, gap: 0.03, n: [6, 11], up: true },  // trill
    { lo: 1900, hi: 2500, len: 0.22, gap: 0.3, n: [2, 2], up: true }      // two-note call
  ];
  function chirp(t, sp, pan, vol) {
    const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const j = 1 + (Math.random() - 0.5) * 0.12;
    o.type = "sine";
    o.frequency.setValueAtTime(sp.lo * j, t);
    o.frequency.exponentialRampToValueAtTime(sp.hi * j, t + sp.len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, sp.len / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + sp.len);
    o.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(bus.birds); } else g.connect(bus.birds);
    const send = ac.createGain(); send.gain.value = 0.25; g.connect(send); send.connect(bus.verb);
    o.start(t); o.stop(t + sp.len + 0.05);
  }
  function phrase(t) {
    const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
    const n = sp.n[0] + Math.floor(Math.random() * (sp.n[1] - sp.n[0] + 1)), pan = Math.random() * 1.6 - 0.8, vol = BIRDS * (0.5 + Math.random() * 0.5);
    for (let i = 0; i < n; i++) chirp(t + i * (sp.len + sp.gap), sp, pan, vol * (1 - i * 0.04));
    return n * (sp.len + sp.gap);
  }

  /* ---------- music: a slow, calm progression on a soft pad, with an unhurried piano over it ---------- */
  // Original voicings in D major, one chord per bar at about 60 beats a minute.
  const CHORDS = [
    { pad: [50, 57, 62, 66], arp: [62, 66, 69, 73, 76] },  // Dmaj9
    { pad: [43, 55, 59, 62], arp: [59, 62, 66, 67, 71] },  // Gmaj7
    { pad: [47, 54, 57, 62], arp: [57, 62, 66, 69, 74] },  // Bm7
    { pad: [45, 52, 57, 61], arp: [57, 61, 64, 66, 69] },  // A6
    { pad: [43, 50, 55, 59], arp: [62, 67, 71, 74, 79] },  // G/D colour
    { pad: [42, 54, 57, 61], arp: [61, 64, 66, 69, 73] },  // F#m7
    { pad: [40, 52, 55, 59], arp: [59, 64, 67, 71, 74] },  // Em7
    { pad: [45, 52, 55, 61], arp: [57, 61, 64, 67, 69] }   // A7sus feel, back home
  ];
  const BAR = 4.2;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function padChord(t, notes) {
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 820; f.Q.value = 0.4;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(PAD, t + 1.6); g.gain.setValueAtTime(PAD, t + BAR - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + BAR + 1.2);
    f.connect(g); g.connect(bus.music);
    notes.forEach(m => [-6, 6].forEach(cents => {
      const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = hz(m); o.detune.value = cents;
      o.connect(f); o.start(t); o.stop(t + BAR + 1.3);
    }));
  }
  function piano(t, m, vel) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = "sine"; o2.type = "triangle"; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 2; o2.detune.value = 3;
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    f.type = "lowpass"; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + 1.5);
    const v = PIANO * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(bus.music);
    const send = ac.createGain(); send.gain.value = 0.4; f.connect(send); send.connect(bus.verb);
    o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
  }
  function playBar(t) {
    const c = CHORDS[bar % CHORDS.length];
    padChord(t, c.pad);
    // a gentle pattern that changes every pass so the loop doesn't feel like a loop
    const pass = Math.floor(bar / CHORDS.length) % 3;
    const pattern = [[0, 2, 4, 3], [1, 3, 4, 2, 3], [0, 4, 2]][pass];
    const step = BAR / (pattern.length + 0.5);
    pattern.forEach((k, i) => { if (Math.random() < 0.12 && i) return; piano(t + 0.05 + i * step + (Math.random() - 0.5) * 0.04, c.arp[k], 0.55 + Math.random() * 0.35 - i * 0.05); });
    if (bar % CHORDS.length === 0) piano(t + 0.02, c.pad[0] + 12, 0.5); // a low note at the top of each pass
    bar++;
  }

  /* ---------- the scheduler: looks a little ahead, only while the menu is showing ---------- */
  function tick() {
    if (!ac) return;
    const now = ac.currentTime, ahead = now + 0.6;
    if (!files.birds) while (nextBird < ahead) { const len = phrase(Math.max(nextBird, now + 0.05)); nextBird = Math.max(nextBird, now) + len + 1.2 + Math.random() * 4.5; }
    if (!files.music) while (nextBar < ahead) { playBar(Math.max(nextBar, now + 0.05)); nextBar = Math.max(nextBar, now) + BAR; }
  }
  function apply() {
    if (!unlocked || !setup()) return;
    const want = playing(), t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(want ? VOLUME : 0, t + FADE);
    Object.keys(files).forEach(k => { if (want) files[k].play().catch(() => {}); });
    if (want) {
      if (ac.state === "suspended") ac.resume().catch(() => {});
      if (!loop) { nextBird = t + 0.8; nextBar = Math.max(nextBar, t + 0.3); loop = setInterval(tick, 200); tick(); }
    } else {
      clearInterval(loop); loop = null;
      // after the fade, rest the audio engine (and any recordings) so the phone isn't working for nothing
      setTimeout(() => { if (!playing() && ac) { Object.keys(files).forEach(k => files[k].pause()); ac.suspend().catch(() => {}); } }, FADE * 1000 + 300);
    }
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true; apply();
    document.removeEventListener("pointerdown", unlock, true); document.removeEventListener("keydown", unlock, true);
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) { clearInterval(loop); loop = null; Object.keys(files).forEach(k => files[k].pause()); ac.suspend().catch(() => {}); } else apply(); });

  FW.sound = {
    get on() { return on; },
    get supported() { return !!(window.AudioContext || window.webkitAudioContext); },
    get running() { return !!loop; },
    scene(s) { if (s === scene) return; scene = s; apply(); },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* this time only */ }
      if (on && !unlocked) unlock(); else apply();
      document.dispatchEvent(new CustomEvent("fw-sound"));
      return on;
    }
  };
})();
